// Headless match test: the whole simulation runs in Node, no browser and no rendering, so a round,
// a plant rush and a bot's aim can be checked before anything is drawn.
//   node tools/simtest.mjs [matches] [--verbose]
import { MAP } from '../game/src/map.js';
import { buildColliders, raycast, hasLineOfSight, supportHeight, blockedAt } from '../game/src/physics.js';
import { createState } from '../game/src/state.js';
import { createBrains, stepBots } from '../game/src/bots.js';
import { stepGrenades } from '../game/src/ballistics.js';
import { startMatch, stepRounds } from '../game/src/rounds.js';
import { FIXED_STEP } from '../game/src/config.js';

const colliders = buildColliders(MAP);
const world = {
  colliders,
  ray: (x, y, z, dx, dy, dz, maxDistance) => raycast(colliders, x, y, z, dx, dy, dz, maxDistance),
  lineOfSight: (ax, ay, az, bx, by, bz) => hasLineOfSight(colliders, ax, ay, az, bx, by, bz),
  groundAt: (x, z, radius, feet, ceiling) => supportHeight(colliders, x, z, radius, feet, ceiling),
};

const matchCount = Number(process.argv[2] ?? 3);
const verbose = process.argv.includes('--verbose');
const problems = [];
const totals = {
  rounds: 0,
  plants: 0,
  defuses: 0,
  explosions: 0,
  timeWins: 0,
  wipeWins: 0,
  kills: 0,
  killsByTeam: [0, 0],
  roundSeconds: [],
  samplesMoved: 0,
  samplesTotal: 0,
  stuckBots: 0,
};

// Spawn sanity first: nobody may start inside geometry.
for (const team of ['attack', 'defend']) {
  MAP.spawns[team].forEach((spawn, index) => {
    const hit = blockedAt(colliders, spawn.x, 0.05, spawn.z, 0.36, 1.8);
    if (hit) problems.push(`spawn ${team}[${index}] starts inside ${hit.tag}`);
  });
}

for (let match = 0; match < matchCount; match += 1) {
  const state = createState({ seed: 1000 + match * 37 });
  createBrains(state, { includePlayer: true });
  startMatch(state);
  const startScore = [0, 0];
  let steps = 0;
  let phase = state.match.phase;
  let roundStart = 0;
  const seenKills = new Set();

  while (!state.match.over && steps < 60 * 60 * 45) {
    state.time += FIXED_STEP;
    stepBots(state, world, FIXED_STEP);
    stepGrenades(state, world, FIXED_STEP);
    stepRounds(state, FIXED_STEP);
    state.sounds.length = 0;
    state.effects.length = 0;
    steps += 1;

    if (state.match.phase !== phase) {
      if (phase === 'live' && state.match.phase !== 'live') {
        totals.roundSeconds.push(state.time - roundStart);
        const reason = state.match.lastRoundReason;
        if (reason.includes('charge went off')) totals.explosions += 1;
        else if (reason.includes('cut the charge')) totals.defuses += 1;
        else if (reason.includes('time ran out')) totals.timeWins += 1;
        else totals.wipeWins += 1;
      }
      if (state.match.phase === 'live') roundStart = state.time;
      phase = state.match.phase;
    }
    if (state.bomb.state === 'planted' && !seenKills.has(`plant-${state.match.roundNumber}`)) {
      seenKills.add(`plant-${state.match.roundNumber}`);
      totals.plants += 1;
    }
    if (steps % 600 === 0) {
      for (const actor of state.actors) {
        if (!actor.brain) continue;
        totals.samplesTotal += 1;
        if (actor.brain.stuckTimer > 0.8) totals.stuckBots += 1;
      }
    }
  }

  for (const actor of state.actors) {
    totals.kills += actor.kills;
    totals.killsByTeam[actor.team] += actor.kills;
  }
  const roundsPlayed = state.match.history.length;
  totals.rounds += roundsPlayed;
  const scores = state.match.scores;
  if (verbose) {
    console.log(`match ${match + 1}: ${scores[0]}-${scores[1]} over ${roundsPlayed} rounds in ${(state.time / 60).toFixed(1)} min, ${steps} steps`);
    console.log(`  reasons: ${state.match.history.map((row) => `${row.round}:${row.reason}`).join(' | ').slice(0, 400)}`);
  }
  if (roundsPlayed === 0) problems.push(`match ${match + 1} played no rounds`);
  if (state.match.winner < 0) problems.push(`match ${match + 1} finished with no winner`);
  if (scores[0] === 0 && scores[1] === 0) problems.push(`match ${match + 1} had no round wins`);
  if (state.match.scores[0] + state.match.scores[1] > 40) problems.push(`match ${match + 1} played an impossible number of rounds`);
}

// Bot liveliness: over a short window, do the bots actually move and shoot?
{
  const state = createState({ seed: 99 });
  createBrains(state, { includePlayer: true });
  startMatch(state);
  state.match.phase = 'live';
  state.match.timer = 60;
  const start = state.actors.map((actor) => ({ x: actor.position.x, z: actor.position.z }));
  for (let step = 0; step < 60 * 12; step += 1) {
    state.time += FIXED_STEP;
    stepBots(state, world, FIXED_STEP);
    stepRounds(state, FIXED_STEP);
    state.sounds.length = 0;
    state.effects.length = 0;
  }
  let movedCount = 0;
  let totalTravel = 0;
  state.actors.forEach((actor, index) => {
    const travel = Math.hypot(actor.position.x - start[index].x, actor.position.z - start[index].z);
    totalTravel += travel;
    if (travel > 4) movedCount += 1;
  });
  if (movedCount < 8) problems.push(`only ${movedCount} of 10 bots moved more than 4 m in 12 s of live round`);
  totals.samplesMoved = movedCount;
  if (verbose) console.log(`liveliness: ${movedCount}/10 bots moved, ${totalTravel.toFixed(1)} m travelled together, ${state.actors.reduce((sum, actor) => sum + actor.kills, 0)} kills in 12 s`);
}

const averageRound = totals.roundSeconds.length
  ? (totals.roundSeconds.reduce((sum, value) => sum + value, 0) / totals.roundSeconds.length).toFixed(1)
  : 'n/a';

console.log(`matches ${matchCount}: rounds ${totals.rounds}, plants ${totals.plants}, defuse wins ${totals.defuses}, blasts ${totals.explosions}, time wins ${totals.timeWins}, wipes ${totals.wipeWins}`);
console.log(`kills ${totals.kills} (attack ${totals.killsByTeam[0]}, defend ${totals.killsByTeam[1]}), average round ${averageRound}s, bots moving in the sample ${totals.samplesMoved}/10`);
if (totals.samplesTotal) console.log(`stuck samples ${totals.stuckBots}/${totals.samplesTotal}`);

if (problems.length) {
  console.log(`${problems.length} problem(s):`);
  for (const problem of problems) console.log(' -', problem);
  process.exitCode = 1;
} else {
  console.log('simulation ok');
}
