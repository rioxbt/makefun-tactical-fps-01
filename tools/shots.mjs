// The screenshot runner: it starts a headless Chromium, drives the game over the DevTools protocol
// and writes one honest capture per shot. The page's own code decides the frame — the runner only
// waits for window.__shotReady and photographs what is there.
//   node tools/shots.mjs --url http://localhost:8080 --out screenshots
//   node tools/shots.mjs --check --url http://localhost:8080        (console and error report only)
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const index = args.indexOf(name);
  return index === -1 ? fallback : args[index + 1];
};
const url = flag('--url', 'http://localhost:8080');
const outDir = flag('--out', 'screenshots');
const chromePath = flag('--chrome', '/home/ubuntu/.hermes/tools/chromium-1208/chrome-linux64/chrome');
const port = Number(flag('--port', '9333'));
const shots = flag('--shots', 'silo,depot,shop,scores').split(',').map((value) => value.trim()).filter(Boolean);
const checkOnly = args.includes('--check');
const width = Number(flag('--width', '1280'));
const height = Number(flag('--height', '720'));
const quality = Number(flag('--quality', '82'));

// The shots and the file each one is written to; the first by name is the entry's cover.
const FILES = {
  silo: '1-silo-hold.jpg',
  depot: '2-depot-charge.jpg',
  shop: '3-yard-shop.jpg',
  scores: '4-scores.jpg',
};

const chrome = spawn(chromePath, [
  '--headless=new',
  '--no-sandbox',
  '--disable-dev-shm-usage',
  '--no-first-run',
  '--disable-extensions',
  '--enable-unsafe-swiftshader',
  '--use-angle=swiftshader-webgl',
  '--hide-scrollbars',
  `--window-size=${width},${height}`,
  `--remote-debugging-port=${port}`,
  `--user-data-dir=/tmp/sableline-chrome-${port}`,
  'about:blank',
], { stdio: ['ignore', 'pipe', 'pipe'] });
chrome.stderr.on('data', () => {});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function targets() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      const list = await response.json();
      const page = list.find((entry) => entry.type === 'page');
      if (page) return page.webSocketDebuggerUrl;
    } catch {
      // The browser is still starting.
    }
    await sleep(250);
  }
  throw new Error('chromium did not open a debugging port');
}

function createClient(socketUrl) {
  const socket = new WebSocket(socketUrl);
  const pending = new Map();
  const events = [];
  let nextId = 1;
  const ready = new Promise((resolve, reject) => {
    socket.addEventListener('open', () => resolve());
    socket.addEventListener('error', (error) => reject(error));
  });
  socket.addEventListener('message', (message) => {
    const payload = JSON.parse(message.data);
    if (payload.id !== undefined && pending.has(payload.id)) {
      const { resolve, reject } = pending.get(payload.id);
      pending.delete(payload.id);
      if (payload.error) reject(new Error(payload.error.message));
      else resolve(payload.result);
      return;
    }
    events.push(payload);
  });
  return {
    ready,
    events,
    send(method, params) {
      const id = nextId;
      nextId += 1;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        socket.send(JSON.stringify({ id, method, params }));
        setTimeout(() => {
          if (pending.has(id)) {
            pending.delete(id);
            reject(new Error(`${method} timed out`));
          }
        }, 30000);
      });
    },
    close() {
      socket.close();
    },
  };
}

async function evaluate(client, expression) {
  const result = await client.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text ?? 'evaluate failed');
  return result.result.value;
}

async function waitFor(client, expression, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      if (await evaluate(client, expression)) return true;
    } catch {
      // The page may still be loading.
    }
    await sleep(120);
  }
  throw new Error(`timed out waiting for ${label}`);
}

function report(client) {
  const problems = [];
  for (const event of client.events) {
    if (event.method === 'Runtime.exceptionThrown') {
      const details = event.params.exceptionDetails;
      problems.push(`exception: ${details.exception?.description ?? details.text}`);
    }
    if (event.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(event.params.type)) {
      problems.push(`console.${event.params.type}: ${event.params.args.map((arg) => arg.description ?? arg.value).join(' ')}`);
    }
    if (event.method === 'Log.entryAdded' && event.params.entry.level === 'error') {
      problems.push(`log: ${event.params.entry.text}`);
    }
  }
  client.events.length = 0;
  return problems;
}

async function main() {
  const socketUrl = await targets();
  const client = createClient(socketUrl);
  await client.ready;
  await client.send('Runtime.enable');
  await client.send('Page.enable');
  await client.send('Log.enable');
  await client.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });

  const problems = [];
  if (checkOnly) {
    await client.send('Page.navigate', { url: `${url}/index.html?seed=1` });
    await waitFor(client, 'Boolean(window.__game && window.__game.ready)', 20000, 'the game to boot');
    await sleep(900);
    const bootProblems = report(client);
    problems.push(...bootProblems);
    console.log(bootProblems.length ? `boot reported ${bootProblems.length} problem(s)` : 'boot clean: no exceptions, no console errors');
    // Drive it: a shot, a burst, a walk, six seconds of live round, then ask the game what happened.
    const probe = await evaluate(client, `(() => {
      const game = window.__game;
      const state = game.state;
      const before = state.actors.map((actor) => ({ x: actor.position.x, z: actor.position.z }));
      const startAlive = state.actors.filter((actor) => actor.alive).length;
      game.fire(true);
      game.step(1.6);
      game.fire(false);
      game.press('KeyR');
      game.step(4.4);
      let moved = 0;
      let travelled = 0;
      state.actors.forEach((actor, index) => {
        if (actor.isPlayer) return;
        const distance = Math.hypot(actor.position.x - before[index].x, actor.position.z - before[index].z);
        travelled += distance;
        if (distance > 1.5) moved += 1;
      });
      return JSON.stringify({
        phase: state.match.phase,
        round: state.match.roundNumber,
        bots: state.actors.filter((actor) => !actor.isPlayer).length,
        botsMoved: moved,
        botTravel: Number(travelled.toFixed(1)),
        killsSoFar: state.actors.reduce((sum, actor) => sum + actor.kills, 0),
        playerHealth: Math.round(state.player.health),
        playerAmmo: state.player.loadout.mag[state.player.loadout.slots[state.player.loadout.current]],
        aliveNow: state.actors.filter((actor) => actor.alive).length + '/' + startAlive,
        hudKillRows: document.querySelectorAll('#feed .feed-row').length,
        radarPainted: document.getElementById('radar').getContext('2d').getImageData(168, 168, 1, 1).data[3],
      });
    })()`);
    console.log('probe:', probe);
    problems.push(...report(client));
    const errors = await evaluate(client, 'JSON.stringify(window.__errors ?? [])');
    if (errors !== '[]') console.log('page errors:', errors);
    const summary = await evaluate(client, 'JSON.stringify(window.__game.summary())');
    console.log('summary:', summary.slice(0, 900));
    if (problems.length) {
      console.log(`${problems.length} page problem(s):`);
      for (const problem of problems.slice(0, 20)) console.log(' -', problem);
    } else {
      console.log('page clean: no exceptions and no console errors');
    }
    client.close();
    chrome.kill();
    process.exitCode = problems.length ? 1 : 0;
    return;
  }

  mkdirSync(outDir, { recursive: true });
  for (const shot of shots) {
    await client.send('Page.navigate', { url: `${url}/index.html?shot=${encodeURIComponent(shot)}&seed=1` });
    await waitFor(client, 'Boolean(window.__shotReady)', 30000, `shot ${shot}`);
    await sleep(350);
    const capture = await client.send('Page.captureScreenshot', { format: 'jpeg', quality, captureBeyondViewport: false });
    const file = join(outDir, FILES[shot] ?? `${shot}.jpg`);
    writeFileSync(file, Buffer.from(capture.data, 'base64'));
    const bytes = Buffer.from(capture.data, 'base64').length;
    console.log(`${shot} -> ${file} (${bytes} bytes, ${width}x${height})`);
    if (bytes > 262144) problems.push(`${shot} is ${bytes} bytes, over the 256 KiB cap`);
    problems.push(...report(client));
  }

  if (problems.length) {
    console.log(`${problems.length} capture problem(s):`);
    for (const problem of problems.slice(0, 20)) console.log(' -', problem);
    process.exitCode = 1;
  } else {
    console.log('all shots captured clean');
  }
  client.close();
  chrome.kill();
}

main().catch((error) => {
  console.error('shot runner failed:', error.message);
  chrome.kill();
  process.exit(1);
});
