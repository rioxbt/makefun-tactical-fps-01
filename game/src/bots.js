// The bots: routes, sightlines, reaction, burst discipline, the charge and the cut. Each walks the
// nav graph baked from map.js, sees only what its cone and a line of sight allow, and hears what the
// yard hears.
import { BOTS, MOVEMENT } from './config.js';
import { eyeOf, forwardOf, heightOf, yawTo } from './body.js';
import { MAP } from './map.js';
import { activeWeapon, beginReload, canFire, currentSpread, stepReload } from './weapon.js';
import { fireShot, throwGrenade } from './ballistics.js';
import { pushSound, smokeBlocks } from './state.js';
import { accelerate, applyFriction, integrate, wishDirection } from './locomotion.js';
import { canDefuse, canPlant, tryDefuse, tryPlant } from './rounds.js';

const NODE_COUNT = MAP.navNodes.length;
const PATH_LIMIT = 40;

// Breadth-first from every node, once: NEXT[goal][start] is the next hop to take towards the goal.
const ADJACENCY = [];
for (let index = 0; index < NODE_COUNT; index += 1) ADJACENCY.push([]);
for (const [a, b] of MAP.navEdges) {
  ADJACENCY[a].push(b);
  ADJACENCY[b].push(a);
}
const NEXT = [];
for (let goal = 0; goal < NODE_COUNT; goal += 1) {
  const next = new Int16Array(NODE_COUNT).fill(-1);
  const queue = [goal];
  const seen = new Uint8Array(NODE_COUNT);
  seen[goal] = 1;
  while (queue.length) {
    const current = queue.shift();
    for (const neighbour of ADJACENCY[current]) {
      if (seen[neighbour]) continue;
      seen[neighbour] = 1;
      next[neighbour] = current;
      queue.push(neighbour);
    }
  }
  NEXT.push(next);
}

function nearestNode(x, z) {
  let best = 0;
  let bestDistance = Infinity;
  for (let index = 0; index < NODE_COUNT; index += 1) {
    const node = MAP.navNodes[index];
    const dx = node.x - x;
    const dz = node.z - z;
    const distance = dx * dx + dz * dz;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = index;
    }
  }
  return best;
}

// A route as a list of node indices, from the bot's nearest node to the goal's.
function routeTo(start, goal, out) {
  out.length = 0;
  if (start === goal) {
    out.push(goal);
    return out;
  }
  let current = goal;
  out.push(goal);
  let steps = 0;
  while (current !== start && steps < PATH_LIMIT) {
    current = NEXT[start][current];
    if (current < 0) break;
    out.push(current);
    steps += 1;
  }
  if (current !== start) out.length = 0;
  else out.reverse();
  return out;
}

const scratchEye = { x: 0, y: 0, z: 0 };
const scratchForward = { x: 0, y: 0, z: 0 };
const wish = { x: 0, z: 0 };

// Sight: inside the cone, inside the range, an unbroken line, and no smoke in the way.
export function canSee(state, world, bot, target) {
  const eye = eyeOf(bot, scratchEye);
  const chestY = target.position.y + (target.crouching ? 0.7 : 0.95);
  const dx = target.position.x - eye.x;
  const dy = chestY - eye.y;
  const dz = target.position.z - eye.z;
  const flat = Math.sqrt(dx * dx + dz * dz);
  if (flat > BOTS.visionRange) return false;
  if (flat > 2.5) {
    const forward = forwardOf(bot.yaw, 0, scratchForward);
    const dot = (forward.x * dx + forward.z * dz) / flat;
    if (dot < Math.cos((BOTS.visionFov * Math.PI) / 360)) return false;
  }
  if (!world.lineOfSight(eye.x, eye.y, eye.z, target.position.x, chestY, target.position.z)) return false;
  if (smokeBlocks(state, eye.x, eye.y, eye.z, target.position.x, chestY, target.position.z)) return false;
  return true;
}

// Hearing: a shot, a step, a charge beep or the blast reveals a place, never a face.
function listen(state, actor, brain) {
  for (let index = 0; index < state.sounds.length; index += 1) {
    const sound = state.sounds[index];
    if (sound.team === actor.team) continue;
    if (sound.x === undefined) continue;
    const dx = sound.x - actor.position.x;
    const dz = sound.z - actor.position.z;
    const distance = Math.sqrt(dx * dx + dz * dz);
    const range =
      sound.kind === 'shot' ? BOTS.hearingGunshot : sound.kind === 'footstep' ? (sound.loud ? BOTS.hearingFootsteps : BOTS.hearingFootsteps * 0.5) : BOTS.hearingGunshot * 1.3;
    if (distance > range) continue;
    brain.heard.x = sound.x;
    brain.heard.z = sound.z;
    brain.heard.time = state.time;
  }
}

function planForRound(state, actor, brain) {
  brain.plannedRound = state.match.roundNumber;
  brain.targetId = -1;
  brain.targetSeenAt = -99;
  brain.reactionAt = 0;
  brain.burst = 0;
  brain.burstPause = 0;
  brain.grenadeUsed = false;
  brain.aimError = BOTS.aimJitterMax;
  brain.stuckTimer = 0;
  brain.strafeDir = state.random() < 0.5 ? 1 : -1;
  const attacking = actor.team === state.attackTeam;
  const squad = state.actors.filter((other) => other.team === actor.team);
  const slot = squad.indexOf(actor);
  if (attacking) {
    if (slot === squad.length - 1) {
      brain.role = 'lurk';
      brain.site = state.match.bombSite === 'A' ? 'B' : 'A';
    } else if (slot === 1) {
      brain.role = 'mid';
      brain.site = 'mid';
    } else {
      brain.role = 'push';
      brain.site = state.match.bombSite;
    }
  } else {
    const holds = MAP.holds.defend;
    const siteHolds = holds.filter((hold) => (slot % 2 === 0 ? hold.site === 'A' : hold.site === 'B'));
    const midHolds = holds.filter((hold) => hold.site === 'mid');
    if (slot === 0) {
      brain.role = 'mid';
      brain.holdSpot = midHolds[0] ?? siteHolds[0];
    } else {
      brain.role = 'anchor';
      brain.holdSpot = siteHolds[Math.floor(state.random() * siteHolds.length)] ?? holds[slot % holds.length];
    }
    brain.site = brain.holdSpot?.site ?? 'A';
  }
  brain.route.length = 0;
  brain.routeIndex = 0;
  brain.goalNode = -1;
  brain.mode = 'advance';
}

function attackGoalNodes(site) {
  if (site === 'A') return [14, 15, 16, 17, 18];
  if (site === 'B') return [26, 27, 28, 29];
  return [21, 23, 24, 9, 17];
}

function chooseGoal(state, actor, brain) {
  const bomb = state.bomb;
  const attacking = actor.team === state.attackTeam;
  if (bomb.state === 'planted') {
    if (attacking) return { kind: 'guard', x: bomb.x + (actor.id % 2 === 0 ? 3.2 : -3.2), z: bomb.z + (actor.id % 3 === 0 ? 3.4 : -3.4) };
    return { kind: 'defuse' };
  }
  if (attacking) {
    if (bomb.carrier === actor.id) {
      const node = brain.site === 'A' ? 16 : brain.site === 'B' ? 27 : 21;
      return { kind: 'carry', node, site: brain.site };
    }
    if (bomb.state === 'dropped') {
      return { kind: 'point', x: bomb.x, z: bomb.z };
    }
  }
  if (brain.role === 'anchor' && brain.holdSpot) {
    return { kind: 'hold', x: brain.holdSpot.x, z: brain.holdSpot.z, lookX: brain.holdSpot.lookX, lookZ: brain.holdSpot.lookZ };
  }
  const nodes = attackGoalNodes(brain.site ?? 'A');
  return { kind: 'point', node: nodes[actor.id % nodes.length] };
}

function setGoal(state, actor, brain, goal) {
  if (goal.node !== undefined) {
    const node = MAP.navNodes[goal.node];
    goal.x = node.x;
    goal.z = node.z;
  }
  if (goal.x === undefined) {
    goal.x = actor.position.x;
    goal.z = actor.position.z;
  }
  const goalNode = nearestNode(goal.x, goal.z);
  if (goalNode !== brain.goalNode) {
    brain.goalNode = goalNode;
    routeTo(nearestNode(actor.position.x, actor.position.z), goalNode, brain.route);
    brain.routeIndex = 0;
  } else if (brain.route.length === 0) {
    routeTo(nearestNode(actor.position.x, actor.position.z), goalNode, brain.route);
    brain.routeIndex = 0;
  }
  brain.goal = goal;
}

// Turn the body towards a point at a fixed rate, so a bot never snaps its aim.
function facePoint(actor, x, y, z, rate, dt) {
  const desiredYaw = yawTo(actor.position.x, actor.position.z, x, z);
  const dx = x - actor.position.x;
  const dy = y - (actor.position.y + 1.55);
  const dz = z - actor.position.z;
  const flat = Math.sqrt(dx * dx + dz * dz);
  const desiredPitch = Math.atan2(dy, flat);
  let deltaYaw = desiredYaw - actor.yaw;
  while (deltaYaw > Math.PI) deltaYaw -= Math.PI * 2;
  while (deltaYaw < -Math.PI) deltaYaw += Math.PI * 2;
  const step = Math.min(1, rate * dt);
  actor.yaw += deltaYaw * step;
  actor.pitch += (desiredPitch - actor.pitch) * step;
  return Math.abs(deltaYaw);
}

// Where a bot aims on a body: the head when it is close or the bot is bold, otherwise the chest.
function aimPoint(bot, target, out) {
  const distance = Math.sqrt(
    (target.position.x - bot.position.x) ** 2 + (target.position.z - bot.position.z) ** 2,
  );
  const head = distance < 18 && bot.aimAtHead;
  const height = head ? 1.66 : 1.3;
  const scale = (heightOf(target) / 1.8);
  out.x = target.position.x;
  out.y = target.position.y + height * scale;
  out.z = target.position.z;
  return out;
}

const aimTarget = { x: 0, y: 0, z: 0 };

function think(state, world, actor, brain) {
  brain.thinkTimer = BOTS.think * (0.75 + state.random() * 0.5);
  if (brain.plannedRound !== state.match.roundNumber) planForRound(state, actor, brain);

  let target = null;
  let targetDistance = Infinity;
  for (const other of state.actors) {
    if (!other.alive || other.team === actor.team) continue;
    const dx = other.position.x - actor.position.x;
    const dz = other.position.z - actor.position.z;
    const distance = Math.sqrt(dx * dx + dz * dz);
    if (distance > BOTS.visionRange || distance >= targetDistance) continue;
    if (!canSee(state, world, actor, other)) continue;
    target = other;
    targetDistance = distance;
  }
  if (target) {
    // A teammate's sighting is the team's: the radar is fed from what someone actually saw.
    if (actor.team === state.playerTeam) target.lastSeenByPlayer = state.time;
    if (brain.targetId !== target.id) brain.reactionAt = state.time + BOTS.reactionMin + state.random() * (BOTS.reactionMax - BOTS.reactionMin) * (target.isPlayer ? 1 : 0.85);
    brain.targetId = target.id;
    brain.targetSeenAt = state.time;
    brain.lastSeen.x = target.position.x;
    brain.lastSeen.y = target.position.y;
    brain.lastSeen.z = target.position.z;
    brain.aimAtHead = state.random() < (targetDistance < 14 ? 0.62 : 0.3);
  } else if (state.time - brain.targetSeenAt > 0.35) {
    brain.targetId = -1;
  }

  setGoal(state, actor, brain, chooseGoal(state, actor, brain));
  const goal = brain.goal;
  brain.mode = target ? 'engage' : goal.kind === 'hold' && near(brain, actor) ? 'hold' : 'advance';
  if (!target && state.time - brain.heard.time < BOTS.memorySeconds && state.time - brain.targetSeenAt > 1.2) {
    brain.mode = 'investigate';
  }
  // Reloading in a lull is what keeps a bot from running dry mid-fight.
  if (!target) {
    const spec = activeWeapon(actor.loadout);
    const mag = actor.loadout.mag[spec.id] ?? 0;
    if (spec.class !== 'knife' && mag < spec.magazine * 0.6) beginReload(actor.loadout, state.time);
  }
  // A charge to throw when a fight is going nowhere.
  if (!brain.grenadeUsed && target && (actor.loadout.grenades.he ?? 0) > 0 && targetDistance > 12 && targetDistance < 34 && state.random() < 0.5) {
    if (throwGrenade(state, actor, 'he')) brain.grenadeUsed = true;
  }
}

function near(brain, actor) {
  if (!brain.goal || brain.goal.x === undefined) return false;
  const dx = brain.goal.x - actor.position.x;
  const dz = brain.goal.z - actor.position.z;
  return dx * dx + dz * dz < 1.6;
}

function stepMovement(state, world, actor, brain, dt) {
  const target = brain.targetId >= 0 ? state.actors[brain.targetId] : null;
  const goal = brain.goal ?? { x: actor.position.x, z: actor.position.z };
  let goalX = goal.x ?? actor.position.x;
  let goalZ = goal.z ?? actor.position.z;
  const frozen = state.match.phase === 'freeze' || state.match.over;

  // While following a route, walk to the next node, not to the far goal.
  if (brain.mode === 'investigate' && state.time - brain.heard.time < BOTS.memorySeconds) {
    goalX = brain.heard.x;
    goalZ = brain.heard.z;
  } else if (brain.mode === 'advance' && brain.route.length > 0) {
    const node = MAP.navNodes[brain.route[Math.min(brain.routeIndex, brain.route.length - 1)]];
    goalX = node.x;
    goalZ = node.z;
    const distance = Math.hypot(goalX - actor.position.x, goalZ - actor.position.z);
    if (distance < 1.6 && brain.routeIndex < brain.route.length - 1) brain.routeIndex += 1;
  }

  const dx = goalX - actor.position.x;
  const dz = goalZ - actor.position.z;
  const distance = Math.sqrt(dx * dx + dz * dz);
  const engaging = brain.mode === 'engage' && target;
  let speed = MOVEMENT.runSpeed * activeWeapon(actor.loadout).moveSpeed;
  actor.crouching = false;
  actor.walking = false;

  if (frozen) {
    accelerate(actor, 0, 0, 0, dt);
    applyFriction(actor, dt);
    integrate(state, world, actor, dt);
    return;
  }

  if (engaging) {
    const targetDistance = Math.hypot(target.position.x - actor.position.x, target.position.z - actor.position.z);
    if (targetDistance > BOTS.pushDistance || !canSee(state, world, actor, target)) {
      // Move in, but stop firing discipline stays: the bot closes when it cannot see the target.
      brain.strafeDir = 0;
    } else {
      brain.strafeTimer -= dt;
      if (brain.strafeTimer <= 0) {
        brain.strafeTimer = 0.6 + state.random() * 0.7;
        brain.strafeDir = state.random() < 0.5 ? -1 : 1;
      }
      actor.crouching = state.random() < 0.25 && targetDistance > 14;
    }
    speed *= 0.72;
  }

  if (brain.mode === 'hold' && distance < 2.2 && !engaging) {
    accelerate(actor, 0, 0, 0, dt);
    applyFriction(actor, dt);
    integrate(state, world, actor, dt);
    return;
  }

  let moveX = 0;
  let moveZ = 1;
  if (engaging && brain.strafeDir !== 0) {
    // Sideways, still facing the target: a strafing fight, not a walk-away.
    moveX = brain.strafeDir;
    moveZ = distance > 12 ? 0.5 : 0;
    facePoint(actor, target.position.x, actor.position.y + 1.3, target.position.z, 7.5, dt);
  } else if (distance > 0.6) {
    facePoint(actor, goalX, actor.position.y + 1.5, goalZ, 4.2, dt);
  }
  wishDirection(actor, moveX, moveZ, wish);
  accelerate(actor, wish.x, wish.z, speed, dt);
  integrate(state, world, actor, dt);

  // Stuck against geometry: sidestep and try again, and replan the route if that fails.
  const moved = Math.hypot(actor.position.x - brain.lastPos.x, actor.position.z - brain.lastPos.z);
  if (moved < 0.4 * dt && !engaging) {
    brain.stuckTimer += dt;
    if (brain.stuckTimer > 0.9) {
      brain.stuckTimer = 0;
      brain.routeIndex = Math.max(0, brain.routeIndex - 1);
      brain.goalNode = -1;
      actor.position.x += Math.sin(actor.yaw + Math.PI / 2) * 0.1;
      actor.position.z += Math.cos(actor.yaw + Math.PI / 2) * 0.1;
    }
  } else {
    brain.stuckTimer = 0;
  }
  brain.lastPos.x = actor.position.x;
  brain.lastPos.z = actor.position.z;
}

function stepFight(state, world, actor, brain, dt) {
  const loadout = actor.loadout;
  stepReload(loadout, state.time);
  const target = brain.targetId >= 0 ? state.actors[brain.targetId] : null;
  if (!target) return;
  const visible = canSee(state, world, actor, target);
  aimPoint(actor, target, aimTarget);
  if (!visible) {
    facePoint(actor, brain.lastSeen.x, brain.lastSeen.y + 1.2, brain.lastSeen.z, 6, dt);
    return;
  }
  if (state.time < brain.reactionAt) return;

  // Aim with shake that shrinks the longer the bot holds the target, then fire in bursts.
  brain.aimError = Math.max(BOTS.aimJitterMin, brain.aimError * (1 - BOTS.jitterShrink * dt));
  const jitter = brain.aimError * (0.6 + state.random());
  const offsetYaw = (state.random() * 2 - 1) * jitter;
  const offsetPitch = (state.random() * 2 - 1) * jitter * 0.7;
  actor.yaw += offsetYaw;
  actor.pitch += offsetPitch;
  const misalignment = facePoint(actor, aimTarget.x, aimTarget.y, aimTarget.z, 9, dt);

  const spec = activeWeapon(loadout);
  const mag = loadout.mag[spec.id] ?? 0;
  if (spec.class !== 'knife' && mag <= 0) {
    beginReload(loadout, state.time);
    return;
  }
  if (brain.burstPause > 0) {
    brain.burstPause -= dt;
    return;
  }
  if (!canFire(loadout, state.time)) return;
  const distance = Math.hypot(target.position.x - actor.position.x, target.position.z - actor.position.z);
  if (misalignment > 0.09 && spec.class !== 'shotgun') return;
  const spread = currentSpread(loadout, actor.speed, actor.onGround, actor.crouching);
  const extra = brain.aimError * (1 + distance / 40) + (spec.class === 'knife' ? 0 : 0.004);
  fireShot(state, world, actor, spread, extra);
  brain.burst += 1;
  const burstLimit = spec.auto ? BOTS.burstShots : 1;
  if (brain.burst >= burstLimit) {
    brain.burst = 0;
    brain.burstPause = BOTS.burstPauseMin + state.random() * (BOTS.burstPauseMax - BOTS.burstPauseMin);
  }
  // A bot stands still for a moment when a fight opens: stopping to aim pays, for them too.
  if (spec.class !== 'knife' && distance > 10) {
    actor.velocity.x *= 0.55;
    actor.velocity.z *= 0.55;
  }
}

// A bot at the charge holds the key down; the plant and the cut themselves live in rounds.js.
function stepObjective(state, actor, brain, dt) {
  const bomb = state.bomb;
  const attacking = actor.team === state.attackTeam;
  if (attacking && canPlant(state, actor)) {
    actor.crouching = true;
    tryPlant(state, actor, true, dt);
    return true;
  }
  if (!attacking && canDefuse(state, actor)) {
    actor.crouching = true;
    if (state.bomb.defuseProgress <= 0 || state.bomb.defuser === actor.id) tryDefuse(state, actor, true, dt);
    return true;
  }
  return false;
}

export function createBrains(state, options) {
  const includePlayer = options?.includePlayer === true;
  for (const actor of state.actors) {
    if (actor.isPlayer && !includePlayer) continue;
    actor.brain = {
      plannedRound: -1,
      role: 'push',
      site: 'A',
      mode: 'advance',
      goal: null,
      goalNode: -1,
      route: [],
      routeIndex: 0,
      holdSpot: null,
      targetId: -1,
      targetSeenAt: -99,
      reactionAt: 0,
      aimError: BOTS.aimJitterMax,
      aimAtHead: false,
      burst: 0,
      burstPause: 0,
      grenadeUsed: false,
      heard: { x: 0, z: 0, time: -99 },
      lastSeen: { x: 0, y: 0, z: 0 },
      lastPos: { x: 0, z: 0 },
      stuckTimer: 0,
      strafeDir: 1,
      strafeTimer: 0,
      thinkTimer: state.random() * BOTS.think,
    };
  }
}

export function stepBots(state, world, dt) {
  for (const actor of state.actors) {
    const brain = actor.brain;
    if (!brain) continue;
    if (!actor.alive) continue;
    listen(state, actor, brain);
    brain.thinkTimer -= dt;
    if (brain.thinkTimer <= 0) think(state, world, actor, brain);
    const busy = stepObjective(state, actor, brain, dt);
    if (!busy) {
      stepMovement(state, world, actor, brain, dt);
      stepFight(state, world, actor, brain, dt);
    } else {
      stepFight(state, world, actor, brain, dt);
      applyFriction(actor, dt);
      integrate(state, world, actor, dt);
    }
  }
}
