// Local gate check: the six rows the sealed scorer checks, run here on the hand-in folder so a
// mistake is found before submission rather than after it. It reads the kit's own file list for the
// three.js hashes and rebuilds the dossier with the kit's library, exactly as the gate does.
//   node tools/gatecheck.mjs --kit /tmp/kit-fps/threejs-fps-02-kit --out out
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, lstatSync } from 'node:fs';
import { extname, join, posix } from 'node:path';
import { buildDossier } from '../vendor/makefun-threejs.ts';

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const index = args.indexOf(name);
  return index === -1 ? fallback : args[index + 1];
};
const kitDir = flag('--kit', '/tmp/kit-fps/threejs-fps-02-kit');
const outDir = flag('--out', 'out');

const CAPS = {
  gameFiles: 993,
  gameBytes: 48 * 1024 * 1024,
  pathBytes: 1000,
  indexBytes: 1024 * 1024,
  screenshots: { min: 3, max: 4, bytes: 256 * 1024, longSide: 1280, shortSide: 480 },
  dossierBytes: 1.5 * 1024 * 1024,
  textBytes: 163840,
  outputEntries: 1000,
  outputBytes: 64 * 1024 * 1024,
};

const rows = [];
const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');

function walk(dir, files = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    files.push(full);
    if (entry.isDirectory()) walk(full, files);
  }
  return files;
}

function imageSize(buffer) {
  if (buffer[0] === 0xff && buffer[1] === 0xd8) {
    let offset = 2;
    while (offset < buffer.length) {
      if (buffer[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = buffer[offset + 1];
      const length = buffer.readUInt16BE(offset + 2);
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { width: buffer.readUInt16BE(offset + 7), height: buffer.readUInt16BE(offset + 5), kind: 'jpeg' };
      }
      offset += 2 + length;
    }
    return null;
  }
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20), kind: 'png' };
  }
  return null;
}

// --- row 1: game_files
{
  const gameDir = join(outDir, 'game');
  const entries = walk(gameDir);
  let bytes = 0;
  const problems = [];
  for (const entry of entries) {
    const stats = lstatSync(entry);
    if (stats.isSymbolicLink()) problems.push(`symlink at ${entry}`);
    if (stats.isFile()) bytes += stats.size;
    const pathBytes = Buffer.byteLength(entry.slice(outDir.length + 1));
    if (pathBytes > CAPS.pathBytes) problems.push(`${entry} is a ${pathBytes}-byte path`);
  }
  const index = join(gameDir, 'index.html');
  const indexBytes = statSync(index).size;
  if (indexBytes > CAPS.indexBytes) problems.push(`index.html is ${indexBytes} bytes`);
  if (entries.length + 1 > CAPS.gameFiles) problems.push(`${entries.length + 1} entries, over 993`);
  if (bytes > CAPS.gameBytes) problems.push(`${bytes} bytes, over 48 MiB`);
  const output = walk(outDir);
  const outputBytes = output.reduce((sum, file) => sum + (statSync(file).isFile() ? statSync(file).size : 0), 0);
  if (output.length > CAPS.outputEntries) problems.push(`/output holds ${output.length} entries, over 1000`);
  if (outputBytes > CAPS.outputBytes) problems.push(`/output is ${outputBytes} bytes, over 64 MiB`);
  rows.push({ row: 'game_files', ok: problems.length === 0, detail: `${entries.length + 1} entries, ${(bytes / 1024).toFixed(1)} KiB, index.html ${indexBytes} bytes${problems.length ? ` — ${problems.join('; ')}` : ''}` });
}

// --- row 2: three_js
{
  const kit = JSON.parse(readFileSync(join(kitDir, 'kit.json'), 'utf8'));
  const expected = new Map();
  for (const file of kit.files) {
    if (/starter\/game\/vendor\/three\/three\.(module|core)\.min\.js$/.test(file.path)) {
      expected.set(posix.basename(file.path), file.sha256);
    }
  }
  const problems = [];
  for (const [name, digest] of expected) {
    const file = join(outDir, 'game', 'vendor', 'three', name);
    try {
      const actual = sha256(readFileSync(file));
      if (actual !== digest) problems.push(`${name} is ${actual.slice(0, 12)}… not ${digest.slice(0, 12)}…`);
    } catch {
      problems.push(`${name} is missing`);
    }
  }
  const html = readFileSync(join(outDir, 'game', 'index.html'), 'utf8');
  const mapMatch = html.match(/<script type="importmap">([\s\S]*?)<\/script>/);
  let mapped = null;
  if (mapMatch) {
    try {
      mapped = JSON.parse(mapMatch[1]).imports?.three ?? null;
    } catch {
      problems.push('the import map is not JSON');
    }
  } else {
    problems.push('index.html has no import map');
  }
  if (mapped && !mapped.includes('three.module.min.js')) problems.push(`the import map maps "three" to ${mapped}`);
  rows.push({ row: 'three_js', ok: problems.length === 0, detail: `0.187.0 bytes match, "three" -> ${mapped}${problems.length ? ` — ${problems.join('; ')}` : ''}` });
}

// --- row 3: references
{
  const gameDir = join(outDir, 'game');
  const problems = [];
  const files = walk(gameDir).filter((file) => statSync(file).isFile());
  const sources = files.filter((file) => ['.js', '.mjs', '.html'].includes(extname(file)));
  const specifier = /(?:\bfrom\s*|\bimport\s*\(?\s*|\bimport\s+)['"]([^'"]+)['"]/g;
  const htmlRef = /<(?:script|link|img|source|video|audio|iframe)\b[^>]*?\b(?:src|href)=["']([^"']+)["']/g;
  for (const file of sources) {
    const text = readFileSync(file, 'utf8');
    const relative = file.slice(gameDir.length + 1);
    const check = (spec) => {
      if (spec === 'three') return; // the import map owns this one
      if (/^[a-z]+:/i.test(spec) || spec.startsWith('//')) problems.push(`${relative} reaches off the game: ${spec}`);
      else if (!spec.startsWith('./') && !spec.startsWith('../')) problems.push(`${relative} has an unmapped bare specifier: ${spec}`);
      else {
        const resolved = posix.normalize(posix.join(posix.dirname(relative.split('\\').join('/')), spec));
        try {
          statSync(join(gameDir, resolved));
        } catch {
          problems.push(`${relative} points at a missing file: ${spec}`);
        }
      }
    };
    if (file.endsWith('.html')) {
      for (const match of text.matchAll(htmlRef)) check(match[1]);
      const mapMatch = text.match(/<script type="importmap">([\s\S]*?)<\/script>/);
      if (mapMatch) {
        try {
          for (const value of Object.values(JSON.parse(mapMatch[1]).imports ?? {})) check(value);
        } catch {
          problems.push('the import map is not JSON');
        }
      }
    }
    if (file.endsWith('.js') || file.endsWith('.mjs')) {
      for (const match of text.matchAll(specifier)) check(match[1]);
    }
  }
  rows.push({ row: 'references', ok: problems.length === 0, detail: `${sources.length} sources walked${problems.length ? ` — ${problems.slice(0, 6).join('; ')}` : ', every reference is local'}` });
}

// --- row 4: screenshots
{
  const dir = join(outDir, 'screenshots');
  const names = readdirSync(dir).filter((name) => !name.startsWith('.')).sort();
  const problems = [];
  for (const name of names) {
    if (!/^[A-Za-z0-9._-]{1,128}$/.test(name) || name.startsWith('-')) problems.push(`${name} is not a legal screenshot name`);
    const buffer = readFileSync(join(dir, name));
    if (buffer.length > CAPS.screenshots.bytes) problems.push(`${name} is ${buffer.length} bytes`);
    const size = imageSize(buffer);
    if (!size) {
      problems.push(`${name} is not a whole PNG or JPEG`);
      continue;
    }
    const long = Math.max(size.width, size.height);
    const short = Math.min(size.width, size.height);
    if (long > CAPS.screenshots.longSide || short < CAPS.screenshots.shortSide) {
      problems.push(`${name} is ${size.width}x${size.height}`);
    }
  }
  if (names.length < CAPS.screenshots.min || names.length > CAPS.screenshots.max) problems.push(`${names.length} images`);
  rows.push({ row: 'screenshots', ok: problems.length === 0, detail: `${names.length} images, cover ${names[0]}${problems.length ? ` — ${problems.join('; ')}` : ''}` });
}

// --- row 5: dossier_matches
{
  let problems = [];
  const written = readFileSync(join(outDir, 'dossier.json'));
  const rebuilt = buildDossier(outDir, {
    text_max_bytes: CAPS.textBytes,
    screenshots: { max: CAPS.screenshots.max, max_bytes: CAPS.screenshots.bytes },
    game_max_files: CAPS.gameFiles,
    game_max_bytes: CAPS.gameBytes,
  });
  const rebuiltBuffer = Buffer.from(rebuilt);
  if (sha256(written) !== sha256(rebuiltBuffer)) problems.push('the dossier differs from the one the library writes');
  if (written.length > CAPS.dossierBytes) problems.push(`the dossier is ${written.length} bytes, over 1.5 MiB`);
  const parsed = JSON.parse(written.toString('utf8'));
  const textBytes = Buffer.byteLength(JSON.stringify(parsed.text ?? parsed.game_text ?? ''));
  rows.push({
    row: 'dossier_matches',
    ok: problems.length === 0,
    detail: `${written.length} bytes, rebuilt byte for byte, text ≤ ${CAPS.textBytes} (${textBytes} measured)${problems.length ? ` — ${problems.join('; ')}` : ''}`,
  });
}

// --- row 6: js_parses
{
  const problems = [];
  const files = walk(join(outDir, 'game')).filter((file) => ['.js', '.mjs'].includes(extname(file)));
  for (const file of files) {
    try {
      execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
    } catch (error) {
      problems.push(`${file.slice(outDir.length + 1)}: ${String(error.stderr ?? error.message).split('\n')[0]}`);
    }
  }
  rows.push({ row: 'js_parses', ok: true, detail: `${files.length} modules parsed${problems.length ? ` — ${problems.join('; ')}` : ''}` });
}

console.log('gate rows:');
let failed = 0;
for (const row of rows) {
  if (!row.ok) failed += 1;
  console.log(`  ${row.ok ? 'PASS' : 'FAIL'}  ${row.row.padEnd(16)} ${row.detail}`);
}
console.log(failed === 0 ? 'gate check: all rows pass (js_parses is shown and never decides validity)' : `gate check: ${failed} row(s) fail`);
if (failed) process.exitCode = 1;
