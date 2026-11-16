// SABLELINE: Vantage Yard — the entry program (Node 22, standard library only).
//
// It hands the game in: game/ (the playable static site) and screenshots/ are copied into /output,
// and /output/dossier.json is written with vendor/makefun-threejs.ts, the kit's own reader. The
// dossier is what the judge sees — the screenshots and a text of the game's source — so this program
// refuses to hand in anything the gate would refuse first: too many files, a path that is too long,
// an index.html that is too big, the wrong three.js, screenshots outside 3-to-4 or over 256 KiB.
//
// Outside the grader's container MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-threejs.ts';

const root = fileURLToPath(new URL('.', import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// The scorer's own caps, from the kit's reference/gate.json, repeated here so a mistake is caught
// before it becomes an invalid entry rather than after.
const CAPS = {
  gameFiles: 993,
  gameBytes: 48 * 1024 * 1024,
  pathBytes: 1000,
  indexBytes: 1024 * 1024,
  screenshots: { min: 3, max: 4, bytes: 256 * 1024 },
  dossierBytes: 1.5 * 1024 * 1024,
  textBytes: 163840,
  outputEntries: 1000,
  outputBytes: 64 * 1024 * 1024,
};

const THREE_FILES = ['three.module.min.js', 'three.core.min.js'];
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg']);

function fail(problem: string): never {
  console.error(`main.ts: refusing to hand in — ${problem}`);
  process.exit(1);
}

function walk(dir: string, base = dir, files: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isSymbolicLink()) fail(`game/ holds a symlink at ${relative(base, full)}`);
    if (entry.isDirectory()) walk(full, base, files);
    else files.push(full);
  }
  return files;
}

// The game first: plain files, inside the file, byte and path caps, and the kit's three.js.
const gameDir = join(root, 'game');
if (!existsSync(gameDir)) fail('game/ is missing beside main.ts');
const gameFiles = walk(gameDir);
if (gameFiles.length + readdirSync(gameDir, { withFileTypes: true }).length > CAPS.gameFiles * 2) {
  fail(`game/ holds ${gameFiles.length} files, over the gate's ${CAPS.gameFiles}`);
}
let gameBytes = 0;
for (const file of gameFiles) {
  const size = statSync(file).size;
  gameBytes += size;
  const pathBytes = Buffer.byteLength(relative(root, file));
  if (pathBytes > CAPS.pathBytes) fail(`${relative(root, file)} is a ${pathBytes}-byte path`);
}
if (gameBytes > CAPS.gameBytes) fail(`game/ is ${gameBytes} bytes, over the gate's ${CAPS.gameBytes}`);
const indexPath = join(gameDir, 'index.html');
const indexBytes = statSync(indexPath).size;
if (indexBytes > CAPS.indexBytes) fail(`game/index.html is ${indexBytes} bytes`);

const threeDir = join(gameDir, 'vendor', 'three');
for (const name of THREE_FILES) {
  if (!existsSync(join(threeDir, name))) fail(`game/vendor/three/${name} is missing`);
}
const indexHtml = readFileSync(indexPath, 'utf8');
const mapMatch = indexHtml.match(/<script type="importmap">([\s\S]*?)<\/script>/);
if (!mapMatch) fail('game/index.html has no import map');
if (!/"three"\s*:\s*"\.\//.test(mapMatch[1])) fail('the import map does not map "three" to a relative path');

// The screenshots next: three or four whole images, each under the byte cap, all of them ours.
const shotsDir = join(root, 'screenshots');
if (!existsSync(shotsDir)) fail('screenshots/ is missing beside main.ts');
const shots = readdirSync(shotsDir)
  .filter((name) => !name.startsWith('.') && IMAGE_EXTENSIONS.has(extname(name).toLowerCase()))
  .sort();
if (shots.length < CAPS.screenshots.min || shots.length > CAPS.screenshots.max) {
  fail(`screenshots/ holds ${shots.length} images, and the gate wants 3 or 4`);
}
for (const name of shots) {
  const size = statSync(join(shotsDir, name)).size;
  if (size > CAPS.screenshots.bytes) fail(`screenshots/${name} is ${size} bytes, over 256 KiB`);
}

// Copy, then write the dossier the judge reads.
rmSync(join(outputDir, 'game'), { recursive: true, force: true });
rmSync(join(outputDir, 'screenshots'), { recursive: true, force: true });
mkdirSync(outputDir, { recursive: true });
cpSync(gameDir, join(outputDir, 'game'), { recursive: true });
cpSync(shotsDir, join(outputDir, 'screenshots'), { recursive: true });

const dossier = buildDossier(outputDir, {
  text_max_bytes: CAPS.textBytes,
  screenshots: { max: CAPS.screenshots.max, max_bytes: CAPS.screenshots.bytes },
  game_max_files: CAPS.gameFiles,
  game_max_bytes: CAPS.gameBytes,
});
if (dossier.byteLength > CAPS.dossierBytes) fail(`the dossier is ${dossier.byteLength} bytes, over 1.5 MiB`);
writeFileSync(join(outputDir, 'dossier.json'), dossier);

const handed = walk(join(outputDir, 'game')).length;
console.log(
  `handed in: game/ ${handed} files (${(gameBytes / 1024).toFixed(1)} KiB), ` +
    `screenshots/ ${shots.length} (${shots.join(', ')}), dossier.json ${dossier.byteLength} bytes`,
);
