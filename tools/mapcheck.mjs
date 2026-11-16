// Layout check for Vantage Yard, run outside the browser: every bot node must stand in open
// ground, every nav edge must be a walkable straight line, and both sites and every hold must be
// reachable from the spawns. Pure data in, plain report out.
//   node tools/mapcheck.mjs
import { MAP, SITES } from '../game/src/map.js';

const CLEAR_NODE = 0.5;
const CLEAR_EDGE = 0.62;

// Only obstacles that block a walking body count: a low pad or step is climbed over, and a roof
// or a stacked box sits above head height.
const WALK_TOP = 0.5;
const HEAD_ROOM = 1.9;

function boxesOf(map) {
  return map.boxes.filter(
    (item) => item.solid !== false && item.y < HEAD_ROOM && item.y + item.h > WALK_TOP,
  );
}

function pillarsOf(map) {
  return map.pillars.filter((item) => item.y < HEAD_ROOM && item.y + item.h > WALK_TOP);
}

function nodeBlocked(map, x, z, clear) {
  for (const item of boxesOf(map)) {
    const halfW = item.w / 2 + clear;
    const halfD = item.d / 2 + clear;
    if (Math.abs(x - item.x) <= halfW && Math.abs(z - item.z) <= halfD) return { kind: 'box', tag: item.tag, item };
  }
  for (const item of pillarsOf(map)) {
    const radius = item.r + clear;
    const dx = x - item.x;
    const dz = z - item.z;
    if (dx * dx + dz * dz <= radius * radius) return { kind: 'pillar', tag: item.tag, item };
  }
  return null;
}

// Segment against an inflated rectangle: slab test on the parameter t.
function segmentHitsBox(ax, az, bx, bz, item, clear) {
  const minX = item.x - item.w / 2 - clear;
  const maxX = item.x + item.w / 2 + clear;
  const minZ = item.z - item.d / 2 - clear;
  const maxZ = item.z + item.d / 2 + clear;
  const dx = bx - ax;
  const dz = bz - az;
  let t0 = 0;
  let t1 = 1;
  for (const [origin, delta, min, max] of [[ax, dx, minX, maxX], [az, dz, minZ, maxZ]]) {
    if (Math.abs(delta) < 1e-9) {
      if (origin < min || origin > max) return false;
      continue;
    }
    let near = (min - origin) / delta;
    let far = (max - origin) / delta;
    if (near > far) [near, far] = [far, near];
    t0 = Math.max(t0, near);
    t1 = Math.min(t1, far);
    if (t0 > t1) return false;
  }
  return true;
}

function segmentHitsPillar(ax, az, bx, bz, item, clear) {
  const radius = item.r + clear;
  const dx = bx - ax;
  const dz = bz - az;
  const fx = ax - item.x;
  const fz = az - item.z;
  const a = dx * dx + dz * dz;
  if (a < 1e-9) return fx * fx + fz * fz <= radius * radius;
  const b = 2 * (fx * dx + fz * dz);
  const c = fx * fx + fz * fz - radius * radius;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return false;
  const root = Math.sqrt(disc);
  const t1 = (-b - root) / (2 * a);
  const t2 = (-b + root) / (2 * a);
  return t1 <= 1 && t2 >= 0;
}

function edgeBlocked(map, a, b) {
  for (const item of boxesOf(map)) {
    if (segmentHitsBox(a.x, a.z, b.x, b.z, item, CLEAR_EDGE)) {
      return { kind: 'box', tag: item.tag, item };
    }
  }
  for (const item of pillarsOf(map)) {
    if (segmentHitsPillar(a.x, a.z, b.x, b.z, item, CLEAR_EDGE)) return { kind: 'pillar', tag: item.tag, item };
  }
  return null;
}

function where(hit) {
  const item = hit.item;
  if (hit.kind === 'pillar') return `@(${item.x},${item.z}) r${item.r}`;
  return `@(${item.x},${item.z}) ${item.w}x${item.d}`;
}

const problems = [];

// 1. every node stands in the open
MAP.navNodes.forEach((node, index) => {
  const hit = nodeBlocked(MAP, node.x, node.z, CLEAR_NODE);
  if (hit) problems.push(`node ${index} (${node.tag} @ ${node.x},${node.z}) is inside ${hit.tag} ${where(hit)}`);
});

// 2. every edge is a clear straight walk
MAP.navEdges.forEach(([i, j]) => {
  const a = MAP.navNodes[i];
  const b = MAP.navNodes[j];
  if (!a || !b) {
    problems.push(`edge ${i}-${j} names a node that does not exist`);
    return;
  }
  const hit = edgeBlocked(MAP, a, b);
  if (hit) problems.push(`edge ${i}-${j} (${a.tag}->${b.tag}) crosses ${hit.tag} ${where(hit)}`);
});

// 3. spawns are standable
for (const [team, list] of Object.entries(MAP.spawns)) {
  list.forEach((spawn, index) => {
    const hit = nodeBlocked(MAP, spawn.x, spawn.z, CLEAR_NODE);
    if (hit) problems.push(`spawn ${team}[${index}] (${spawn.x},${spawn.z}) is inside ${hit.tag} ${where(hit)}`);
  });
}

// 4. holds are standable
for (const [team, list] of Object.entries(MAP.holds)) {
  list.forEach((hold, index) => {
    const hit = nodeBlocked(MAP, hold.x, hold.z, CLEAR_NODE);
    if (hit) problems.push(`hold ${team}[${index}] (${hold.x},${hold.z}) is inside ${hit.tag} ${where(hit)}`);
  });
}

// 5. reachability: spawn to spawn, spawn to each site node, spawn to each hold
const adjacency = new Map();
for (let index = 0; index < MAP.navNodes.length; index += 1) adjacency.set(index, []);
for (const [i, j] of MAP.navEdges) {
  if (!adjacency.has(i) || !adjacency.has(j)) continue;
  adjacency.get(i).push(j);
  adjacency.get(j).push(i);
}

function reachableFrom(startIndex) {
  const seen = new Set([startIndex]);
  const queue = [startIndex];
  while (queue.length) {
    const current = queue.shift();
    for (const next of adjacency.get(current)) {
      if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return seen;
}

function nearestNodeIndex(x, z) {
  let best = 0;
  let bestDistance = Infinity;
  MAP.navNodes.forEach((node, index) => {
    const distance = Math.hypot(node.x - x, node.z - z);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = index;
    }
  });
  return best;
}

const attackStart = nearestNodeIndex(MAP.spawns.attack[2].x, MAP.spawns.attack[2].z);
const defendStart = nearestNodeIndex(MAP.spawns.defend[2].x, MAP.spawns.defend[2].z);
const seenFromAttack = reachableFrom(attackStart);
const seenFromDefend = reachableFrom(defendStart);

if (!seenFromAttack.has(defendStart)) problems.push('the two spawns are not connected in the nav graph');
if (!seenFromDefend.has(attackStart)) problems.push('the nav graph is not symmetric between spawns');

SITES.forEach((site) => {
  const index = nearestNodeIndex(site.x, site.z - site.r + 1.4);
  if (!seenFromAttack.has(index)) problems.push(`site ${site.id} (${site.name}) is unreachable from the attack spawn`);
});

for (const [team, list] of Object.entries(MAP.holds)) {
  list.forEach((hold, index) => {
    const node = nearestNodeIndex(hold.x, hold.z);
    const seen = team === 'attack' ? seenFromAttack : seenFromDefend;
    if (!seen.has(node)) problems.push(`hold ${team}[${index}] (${hold.x},${hold.z}) is unreachable from its spawn`);
    const distance = Math.hypot(MAP.navNodes[node].x - hold.x, MAP.navNodes[node].z - hold.z);
    if (distance > 4.5) problems.push(`hold ${team}[${index}] is ${distance.toFixed(2)} m from the nearest node (${MAP.navNodes[node].tag})`);
  });
}

const deadNodes = [];
MAP.navNodes.forEach((node, index) => {
  if (node.tag.startsWith('spawn')) return;
  if (!seenFromAttack.has(index)) deadNodes.push(`${index}:${node.tag}`);
});
if (deadNodes.length) problems.push(`nodes unreachable from the attack spawn: ${deadNodes.join(', ')}`);

console.log(`nodes ${MAP.navNodes.length}, edges ${MAP.navEdges.length}, boxes ${boxesOf(MAP).length}, pillars ${MAP.pillars.length}`);
if (problems.length === 0) console.log('layout ok');
else {
  console.log(`${problems.length} problem(s):`);
  for (const problem of problems) console.log(' -', problem);
  process.exitCode = 1;
}
