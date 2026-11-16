// SABLELINE: Vantage Yard — boot, the one loop, the input wiring, the sound and the shot harness.
// A fixed 60 Hz simulation feeds a render at the display's rate; ?shot=<name>&seed=<n> sets up a
// deterministic frame for a capture, renders it twice, then freezes it and sets window.__shotReady.
import * as THREE from 'three';
// The simulation first, in the order a round needs it: constants, the match, the map, the bodies,
// collision, movement, guns, gunfire, the shop, the round, the bots and the human.
import { FIXED_STEP, RENDER, TIMING } from './config.js';
import { createState } from './state.js';
import { MAP } from './map.js';
import { eyeOf, forwardOf } from './body.js';
import { createWorld } from './world.js';
import { createBrains, stepBots, canSee } from './bots.js';
import { stepGrenades } from './ballistics.js';
import { startMatch, stepRounds } from './rounds.js';
import { BUY_ITEMS, buy, itemFor } from './economy.js';
import { createCommands, resetCommands, stepPlayer } from './player.js';
import { activeWeapon, equipBest, equipSlot } from './weapon.js';
// Then the interface it drives: the HUD, the figures in the yard, the effects, the gun in hand,
// the keyboard and the sound.
import { createHud } from './hud.js';
import { buildCarriedGun, buildCharacter, buildGrenade } from './models.js';
import { createEffects } from './effects.js';
import { createViewmodel } from './viewmodel.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
const params = new URLSearchParams(window.location.search);
const shotName = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;

// --- renderer, scene and camera
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, RENDER.maxPixelRatio));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.6;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(RENDER.fov, window.innerWidth / window.innerHeight, RENDER.near, RENDER.far);
scene.add(camera);

const world = createWorld(scene, MAP);
const effects = createEffects(scene);
const viewmodel = createViewmodel(camera);
const audio = createAudio();
const input = createInput(renderer.domElement, onLockChange);
const commands = createCommands();

let state = createState({ seed });
createBrains(state);
let hud = createHud(state, { onBuy: (key) => tryBuy(key) });

// --- one body mesh per fighter, one carried gun, and a pool for thrown grenades
const actorViews = [];
for (const actor of state.actors) {
  const character = buildCharacter(actor.team);
  const gun = buildCarriedGun();
  character.group.add(gun);
  scene.add(character.group);
  actorViews.push({ character, gun });
}

const bombModel = new THREE.Group();
const bombShell = new THREE.Mesh(
  new THREE.BoxGeometry(0.42, 0.26, 0.3),
  new THREE.MeshStandardMaterial({ color: 0x35392f, roughness: 0.6, metalness: 0.4 }),
);
const bombLamp = new THREE.Mesh(
  new THREE.BoxGeometry(0.1, 0.1, 0.1),
  new THREE.MeshBasicMaterial({ color: 0xff5030 }),
);
bombLamp.position.set(0.12, 0.16, 0);
bombModel.add(bombShell, bombLamp);
bombModel.visible = false;
scene.add(bombModel);

const grenadePool = [];
for (let index = 0; index < 8; index += 1) {
  const he = buildGrenade('he');
  const smoke = buildGrenade('smoke');
  he.visible = false;
  smoke.visible = false;
  scene.add(he, smoke);
  grenadePool.push({ he, smoke });
}

// --- the loop
let lastTime = performance.now();
let accumulator = 0;
let frozen = Boolean(shotName);
let started = false;
let paused = false;
let playerWasAlive = true;
let openedThisFreeze = false;
let lastHealth = 100;
let renderCount = 0;
let shotPrepared = !shotName;
const deathSpot = { x: 0, y: 0, z: 0 };
const scratchEye = { x: 0, y: 0, z: 0 };
const scratchForward = { x: 0, y: 0, z: 0 };

function onLockChange(locked) {
  if (shotName) return;
  if (locked) {
    started = true;
    paused = false;
    hud.setOverlay(false);
    audio.resume();
  } else if (!state.match.over && started) {
    paused = true;
    hud.setOverlay(true, 'SABLELINE', 'Paused — click the yard to take the mouse again.');
    hud.setShop(false);
    hud.setBoard(false);
  }
}

function tryBuy(key) {
  const item = itemFor(key);
  if (!item) return;
  const ok = buy(state.player, key);
  if (ok) {
    state.player.armor = state.player.loadout.armor;
    state.player.helmet = state.player.loadout.helmet;
    audio.buy();
    hud.refreshShop();
  } else {
    audio.deny();
  }
}

// Input becomes commands: held keys, one-shot presses, and the shop's number keys.
function readInput(dt) {
  resetCommands(commands);
  const player = state.player;
  const keys = input.state.keys;
  commands.moveX = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
  commands.moveZ = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
  commands.crouch = keys.has('ControlLeft') || keys.has('ControlRight') || keys.has('KeyC');
  commands.walk = keys.has('ShiftLeft') || keys.has('ShiftRight');
  commands.jump = keys.has('Space');
  commands.use = keys.has('KeyE');
  commands.fire = input.state.firing && !state.hud.buyOpen;
  commands.aim = input.state.aiming && !state.hud.buyOpen;
  player.aiming = commands.aim;
  const look = input.takeLook();
  commands.lookX = look.x;
  commands.lookY = -look.y;

  for (const code of input.takeEvents()) {
    if (code === 'KeyR') commands.reload = true;
    if (code === 'KeyG') commands.grenadeHe = true;
    if (code === 'KeyV') commands.grenadeSmoke = true;
    if (code === 'Digit1') equipSlot(player.loadout, 0, state.time);
    if (code === 'Digit2') equipSlot(player.loadout, 1, state.time);
    if (code === 'Digit3') equipSlot(player.loadout, 2, state.time);
    if (code === 'Digit4') equipSlot(player.loadout, 3, state.time);
    if (code === 'Digit5') equipSlot(player.loadout, 4, state.time);
    if (code === 'KeyQ') equipBest(player.loadout, state.time);
    if (code === 'KeyB' && state.match.phase === 'freeze') toggleShop();
    if (code === 'Tab') toggleBoard();
    if (state.hud.buyOpen && code.startsWith('Digit')) {
      const hotkey = code.slice(5);
      for (const item of BUY_ITEMS) if (item.hotkey === hotkey) tryBuy(item.key);
    }
  }
  void dt;
}

function toggleShop() {
  state.hud.buyOpen = !state.hud.buyOpen;
  hud.setShop(state.hud.buyOpen);
  audio.uiClick();
}

function toggleBoard() {
  state.hud.scoreboard = !state.hud.scoreboard;
  hud.setBoard(state.hud.scoreboard);
  audio.uiClick();
}

// Sound events the simulation queued: placed by distance and side, played by the yard.
function playSounds() {
  if (state.sounds.length === 0) return;
  const player = state.player;
  const forward = forwardOf(player.yaw, 0, scratchForward);
  const rightX = -forward.z;
  const rightZ = forward.x;
  for (const sound of state.sounds) {
    let distance = 0;
    let pan = 0;
    if (sound.x !== undefined) {
      const dx = sound.x - player.position.x;
      const dz = sound.z - player.position.z;
      distance = Math.hypot(dx, dz);
      if (distance > 0.1) pan = Math.max(-1, Math.min(1, (dx * rightX + dz * rightZ) / distance));
    }
    switch (sound.kind) {
      case 'shot': audio.shot(sound.weapon, distance, pan); break;
      case 'footstep': audio.footstep(sound.loud, distance, pan); break;
      case 'reload': audio.reload(sound.stage ?? 0); break;
      case 'death': audio.death(); break;
      case 'explosion': audio.explosion(); break;
      case 'bombBeep': audio.bombBeep(sound.urgent); break;
      case 'plantStart': audio.reload(1); break;
      case 'plantTick': audio.plantTick(sound.progress ?? 0); break;
      case 'chargeArmed': audio.chargeArmed(); break;
      case 'defuseTick': audio.defuseTick(sound.progress ?? 0); break;
      case 'bounce': audio.grenadeBounce(distance, pan); break;
      case 'throw': audio.switchWeapon(); break;
      case 'smoke': audio.flashbang(); break;
      case 'go': audio.roundStart(); break;
      case 'roundStart': audio.roundStart(); break;
      case 'roundWin': audio.roundWin(); break;
      case 'roundLose': audio.roundLose(); break;
      case 'matchEnd': audio.matchEnd(); break;
      case 'knife': audio.shot('knife', distance, pan); break;
      default: break;
    }
  }
  state.sounds.length = 0;
}

// Effects the simulation queued, drawn by the effects pool; the player's own shots also kick the gun.
function playEffects() {
  if (state.effects.length === 0) return;
  for (const effect of state.effects) {
    switch (effect.kind) {
      case 'tracer': {
        // A shot from the player's own gun leaves the viewmodel's muzzle, not the eye, so the
        // tracer reads as gunfire instead of an invisible line along the view.
        const own = state.player.alive
          && Math.abs(effect.ax - camera.position.x) < 0.2
          && Math.abs(effect.ay - camera.position.y) < 0.2
          && Math.abs(effect.az - camera.position.z) < 0.2;
        if (own) {
          const forward = forwardOf(state.player.yaw, state.player.pitch, scratchForward);
          const rightX = -forward.z;
          const rightZ = forward.x;
          effects.tracer(
            effect.ax + forward.x * 0.72 + rightX * 0.12,
            effect.ay + forward.y * 0.72 - 0.14,
            effect.az + forward.z * 0.72 + rightZ * 0.12,
            effect.bx, effect.by, effect.bz, effect.color,
          );
        } else {
          effects.tracer(effect.ax, effect.ay, effect.az, effect.bx, effect.by, effect.bz, effect.color);
        }
        break;
      }
      case 'muzzle':
        effects.muzzle(effect.x, effect.y, effect.z, effect.size);
        if (state.player.alive) {
          const spec = activeWeapon(state.player.loadout);
          viewmodel.fire(spec.recoil.vertical);
        }
        break;
      case 'impact':
        if (effect.actor) effects.blood(effect.x, effect.y, effect.z, 0, 0);
        else effects.impact(effect.x, effect.y, effect.z, effect.nx, effect.ny, effect.nz, effect.surface);
        break;
      case 'blood': effects.blood(effect.x, effect.y, effect.z, effect.dx ?? 0, effect.dz ?? 0); break;
      case 'explosion': effects.explosion(effect.x, effect.y, effect.z); break;
      case 'smoke': effects.smoke(effect.x, effect.y, effect.z); break;
      default: break;
    }
  }
  state.effects.length = 0;
}

function syncActorViews() {
  for (let index = 0; index < state.actors.length; index += 1) {
    const actor = state.actors[index];
    const view = actorViews[index];
    const character = view.character;
    character.group.visible = actor.isPlayer ? false : true;
    character.group.position.set(actor.position.x, actor.position.y, actor.position.z);
    character.group.rotation.y = actor.yaw;
    const scale = 1.8 - (1.8 - 1.3) * (actor.crouch ?? 0);
    character.group.scale.set(1, scale / 1.8, 1);
    if (!actor.alive) {
      character.group.rotation.z = Math.PI / 2;
      character.group.position.y = actor.position.y + 0.25;
    } else {
      character.group.rotation.z = 0;
    }
    view.gun.visible = actor.alive && activeWeapon(actor.loadout).class !== 'knife';
  }
  // Grenades in flight.
  for (let index = 0; index < grenadePool.length; index += 1) {
    const grenade = state.grenades[index];
    const slot = grenadePool[index];
    slot.he.visible = Boolean(grenade && grenade.kind === 'he');
    slot.smoke.visible = Boolean(grenade && grenade.kind === 'smoke');
    if (!grenade) continue;
    const mesh = grenade.kind === 'he' ? slot.he : slot.smoke;
    mesh.position.set(grenade.x, grenade.y, grenade.z);
    mesh.rotation.x += 6 * FIXED_STEP;
  }
  const planted = state.bomb.state === 'planted';
  bombModel.visible = planted;
  if (planted || state.bomb.state === 'dropped') {
    bombModel.position.set(state.bomb.x, state.bomb.y + 0.06, state.bomb.z);
    bombLamp.visible = planted && Math.floor(state.time * (state.bomb.timer < TIMING.bombTickFrom ? 6 : 2)) % 2 === 0;
  }
}

function syncCamera() {
  const player = state.player;
  const eye = eyeOf(player, scratchEye);
  const kick = player.kick ?? { pitch: 0, yaw: 0 };
  if (player.alive) {
    camera.position.set(eye.x, eye.y, eye.z);
    camera.rotation.set(player.pitch + kick.pitch, player.yaw + kick.yaw, kick.yaw * 0.4, 'YXZ');
  } else {
    // Death cam: above the spot where the player fell, looking at the charge or the killer.
    const watch = state.bomb.state === 'planted' ? state.bomb : state.actors[player.lastDamageFrom]?.position ?? player.position;
    camera.position.set(deathSpot.x + 1.6, deathSpot.y + 5.2, deathSpot.z + 3.4);
    camera.lookAt(watch.x, watch.y + 0.6, watch.z);
  }
  const zoom = player.aiming && player.alive ? RENDER.fovZoom / activeWeapon(player.loadout).zoom : RENDER.fov;
  if (Math.abs(camera.fov - zoom) > 0.01) {
    camera.fov += (zoom - camera.fov) * 0.25;
    camera.updateProjectionMatrix();
  }
}

// Player-team vision marks enemies the radar may show: knowledge earned, never granted.
function markVisibleEnemies() {
  const player = state.player;
  if (!player.alive) return;
  for (const actor of state.actors) {
    if (actor.team === player.team || !actor.alive) continue;
    if (canSee(state, world, player, actor)) actor.lastSeenByPlayer = state.time;
  }
}

function stepSimulation(dt) {
  state.time += dt;
  if (!state.match.over) {
    stepPlayer(state, world, commands, dt);
    stepBots(state, world, dt);
    stepGrenades(state, world, dt);
    stepRounds(state, dt);
  }
  if (state.player.health < lastHealth - 0.5) audio.hurt();
  lastHealth = state.player.health;
  if (playerWasAlive && !state.player.alive) {
    deathSpot.x = state.player.position.x;
    deathSpot.y = state.player.position.y;
    deathSpot.z = state.player.position.z;
  }
  playerWasAlive = state.player.alive;
  playSounds();
  playEffects();
  markVisibleEnemies();
}

function stepOnce(dt) {
  stepSimulation(dt);
  syncActorViews();
  world.update(dt);
  effects.update(dt);
  viewmodel.update(dt, state.player, state.player.aiming && state.player.alive, state.time);
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!frozen && !paused) {
    readInput(dt);
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) {
      stepOnce(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (accumulator > FIXED_STEP * 6) accumulator = 0;
    if (state.match.phase === 'freeze' && !state.hud.buyOpen && !openedThisFreeze) {
      state.hud.buyOpen = true;
      hud.setShop(true);
      openedThisFreeze = true;
    }
    if (state.match.phase !== 'freeze') openedThisFreeze = false;
  }
  syncCamera();
  hud.update();
  renderer.render(scene, camera);
  renderCount += 1;
  if (shotName && shotPrepared && renderCount === 3) window.__shotReady = true;
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

document.getElementById('play').addEventListener('click', () => {
  if (shotName) return;
  audio.resume();
  if (state.match.over) resetMatch();
  input.requestLock();
  hud.setOverlay(false);
});

document.getElementById('play-again').addEventListener('click', () => {
  resetMatch();
  hud.setResult(null);
  document.getElementById('result').classList.add('hidden');
  input.requestLock();
});

function resetMatch() {
  state = createState({ seed: Math.floor(Math.random() * 100000) + 1 });
  createBrains(state);
  hud = createHud(state, { onBuy: (key) => tryBuy(key) });
  effects.reset();
  openedThisFreeze = false;
  lastHealth = 100;
  playerWasAlive = true;
  startMatch(state);
}

// A fixed number of simulation steps, used by the test hooks and by a loaded shot.
function settle(seconds) {
  const steps = Math.round(seconds / FIXED_STEP);
  for (let step = 0; step < steps; step += 1) stepOnce(FIXED_STEP);
}

// --- test hooks: a headless driver can advance the simulation and read the state
window.__game = {
  get state() {
    return state;
  },
  world,
  scene,
  camera,
  viewmodel,
  renderer,
  hud,
  commands,
  ready: true,
  step(seconds) {
    settle(seconds);
  },
  fire(on) {
    commands.fire = on;
  },
  press(code) {
    input.press(code);
    readInput(FIXED_STEP);
  },
  teleport(x, z, yaw) {
    place(state.player, x, z, yaw ?? state.player.yaw, 0);
  },
  summary() {
    return {
      phase: state.match.phase,
      round: state.match.roundNumber,
      scores: state.match.scores.slice(),
      over: state.match.over,
      time: Number(state.time.toFixed(2)),
      actors: state.actors.map((actor) => ({
        id: actor.id,
        team: actor.team,
        alive: actor.alive,
        health: Math.round(actor.health),
        kills: actor.kills,
        x: Number(actor.position.x.toFixed(2)),
        z: Number(actor.position.z.toFixed(2)),
        weapon: activeWeapon(actor.loadout).id,
      })),
    };
  },
  botActors() {
    return state.actors.filter((actor) => !actor.isPlayer).length;
  },
};

if (shotName) {
  import('./shots.js')
    .then((module) => {
      module.runShot(shotName, { state, world, hud, commands, settle });
      shotPrepared = true;
      renderCount = 0;
    })
    .catch((error) => {
      console.error('the shot harness failed:', error);
      shotPrepared = true;
    });
} else {
  startMatch(state);
}
requestAnimationFrame(frame);
