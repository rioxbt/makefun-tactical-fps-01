// One place for the match: the fighters, the round clock, the charge, the money, and the queues
// that modules pass each other (sounds, effects and fight results) without calling into each other.
import { BOT_NAMES, ECONOMY, PLAYER_NAME, TEAM_SIZE, TIMING } from './config.js';
import { makeRandom, makeRing, ringPush } from './util.js';
import { createLoadout } from './weapon.js';
import { spawnFor } from './map.js';

function createActor(id, team, name, isPlayer) {
  return {
    id,
    name,
    team,
    isPlayer,
    alive: true,
    health: 100,
    armor: 0,
    helmet: false,
    kills: 0,
    deaths: 0,
    money: ECONOMY.start,
    position: { x: 0, y: 0, z: 0 },
    velocity: { x: 0, y: 0, z: 0 },
    yaw: 0,
    pitch: 0,
    crouch: 0,
    crouching: false,
    walking: false,
    onGround: true,
    landed: false,
    fallSpeed: 0,
    stepped: false,
    speed: 0,
    loadout: createLoadout(),
    nextFootstep: 0,
    lastDamageFrom: -1,
    lastDamageTime: -10,
    flashUntil: 0,
    blindUntil: 0,
    respawnIn: 0,
    // Set by the player's own team when it has an enemy in sight, so the radar shows knowledge.
    lastSeenByPlayer: -99,
    // Bot-only fields are filled by bots.js; a human actor leaves them null.
    brain: null,
  };
}

export function createState(options) {
  const seed = options?.seed ?? 1;
  const state = {
    seed,
    time: 0,
    random: makeRandom(seed),
    actors: [],
    player: null,
    attackTeam: 0,
    playerTeam: 0,
    match: {
      roundNumber: 1,
      phase: 'freeze',
      timer: TIMING.freeze,
      scores: [0, 0],
      history: [],
      over: false,
      winner: -1,
      bombSite: null,
      planterName: null,
      lastRoundReason: '',
    },
    bomb: {
      held: true,
      carrier: -1,
      state: 'carried',
      site: null,
      timer: 0,
      x: 0,
      y: 0,
      z: 0,
      plantedBy: -1,
      defuser: -1,
      defuseProgress: 0,
      armTimer: 0,
      beepAt: 0,
    },
    economy: {
      lossStreak: [0, 0],
      spent: [0, 0],
    },
    grenades: [],
    smokes: [],
    effects: [],
    sounds: [],
    results: [],
    killfeed: makeRing(6),
    hud: {
      buyOpen: false,
      scoreboard: false,
      message: '',
      messageUntil: 0,
      banner: '',
      bannerUntil: 0,
      hitMarker: { until: 0, headshot: false },
      damageFrom: [],
      spectate: -1,
      matchSummary: null,
    },
    stats: { playerKills: 0, playerHeadshots: 0, playerDamage: 0, roundsWon: 0, roundsLost: 0 },
  };

  for (let team = 0; team < 2; team += 1) {
    for (let index = 0; index < TEAM_SIZE; index += 1) {
      const isPlayer = team === 0 && index === 0;
      const name = isPlayer ? PLAYER_NAME : BOT_NAMES[team][index];
      const actor = createActor(state.actors.length, team, name, isPlayer);
      if (isPlayer) state.player = actor;
      state.actors.push(actor);
    }
  }
  return state;
}

export function aliveCount(state, team) {
  let count = 0;
  for (const actor of state.actors) if (actor.team === team && actor.alive) count += 1;
  return count;
}

// Everybody back to their spawn with health restored; what they carry is the round's own business.
export function resetActorsForRound(state) {
  let attackIndex = 0;
  let defendIndex = 0;
  for (const actor of state.actors) {
    const attacking = actor.team === state.attackTeam;
    const spawn = attacking ? spawnFor(0, attackIndex++) : spawnFor(1, defendIndex++);
    actor.position.x = spawn.x;
    actor.position.y = 0;
    actor.position.z = spawn.z;
    actor.velocity.x = 0;
    actor.velocity.y = 0;
    actor.velocity.z = 0;
    actor.yaw = spawn.yaw;
    actor.pitch = 0;
    actor.alive = true;
    actor.health = 100;
    actor.crouch = 0;
    actor.crouching = false;
    actor.walking = false;
    actor.speed = 0;
    actor.onGround = true;
    actor.lastDamageFrom = -1;
    actor.blindUntil = 0;
    actor.flashUntil = 0;
    actor.nextFootstep = 0;
  }
}

export function pushSound(state, sound) {
  if (state.sounds.length > 24) state.sounds.shift();
  state.sounds.push(sound);
}

export function pushResult(state, result) {
  state.results.push(result);
}

export function pushKillfeed(state, row) {
  ringPush(state.killfeed, row);
}

export function addSmoke(state, x, y, z, radius, until) {
  state.smokes.push({ x, y, z, r: radius, until });
}

// A smoke cloud between two points hides the line between them; bots and the world both ask here.
export function smokeBlocks(state, ax, ay, az, bx, by, bz) {
  for (let index = 0; index < state.smokes.length; index += 1) {
    const smoke = state.smokes[index];
    if (smoke.until < state.time) continue;
    if (segmentHitsSphere(ax, ay, az, bx, by, bz, smoke.x, smoke.y, smoke.z, smoke.r)) return true;
  }
  return false;
}

function segmentHitsSphere(ax, ay, az, bx, by, bz, cx, cy, cz, radius) {
  const dx = bx - ax;
  const dy = by - ay;
  const dz = bz - az;
  const lengthSquared = dx * dx + dy * dy + dz * dz;
  if (lengthSquared < 1e-6) return false;
  let t = ((cx - ax) * dx + (cy - ay) * dy + (cz - az) * dz) / lengthSquared;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const px = ax + dx * t - cx;
  const py = ay + dy * t - cy;
  const pz = az + dz * t - cz;
  return px * px + py * py + pz * pz <= radius * radius;
}

export function expireSmokes(state) {
  for (let index = state.smokes.length - 1; index >= 0; index -= 1) {
    if (state.smokes[index].until + 0.6 < state.time) state.smokes.splice(index, 1);
  }
}

