// The human: a command-driven body, so the same code runs in the browser and in a headless test.
// Commands carry one frame's intent — move, look, fire, reload, use, throw — and nothing else.
import { MOVEMENT } from './config.js';
import { activeWeapon, beginReload, canFire, currentSpread, equipSlot, recoilRecover, stepReload } from './weapon.js';
import { fireShot, throwGrenade } from './ballistics.js';
import { pushSound } from './state.js';
import { tryDefuse, tryPlant } from './rounds.js';
import { accelerate, applyFriction, integrate, jump, wishDirection } from './locomotion.js';

const RECOIL_KICK = 1.15;
const MAX_PITCH = Math.PI / 2 - 0.02;
const wish = { x: 0, z: 0 };

export function createCommands() {
  return {
    moveX: 0,
    moveZ: 0,
    lookX: 0,
    lookY: 0,
    jump: false,
    crouch: false,
    walk: false,
    fire: false,
    aim: false,
    reload: false,
    use: false,
    slots: [false, false, false, false, false],
    grenadeHe: false,
    grenadeSmoke: false,
  };
}

export function resetCommands(commands) {
  commands.moveX = 0;
  commands.moveZ = 0;
  commands.jump = false;
  commands.crouch = false;
  commands.walk = false;
  commands.fire = false;
  commands.aim = false;
  commands.reload = false;
  commands.use = false;
  commands.grenadeHe = false;
  commands.grenadeSmoke = false;
  for (let index = 0; index < commands.slots.length; index += 1) commands.slots[index] = false;
}

// Look: the mouse delta turns the body; recoil already pushed the aim and is pulled back by hand.
function applyLook(actor, commands) {
  actor.yaw += commands.lookX;
  actor.pitch += commands.lookY;
  if (actor.pitch > MAX_PITCH) actor.pitch = MAX_PITCH;
  if (actor.pitch < -MAX_PITCH) actor.pitch = -MAX_PITCH;
}

function moveSpeedFor(actor, commands) {
  const spec = activeWeapon(actor.loadout);
  let speed = commands.walk ? MOVEMENT.walkSpeed : MOVEMENT.runSpeed;
  if (actor.crouching) speed = MOVEMENT.crouchSpeed;
  else if (commands.aim) speed *= 0.45;
  return speed * spec.moveSpeed;
}

export function stepPlayer(state, world, commands, dt) {
  const actor = state.player;
  if (!actor) return;
  actor.walking = commands.walk;
  actor.crouching = commands.crouch && actor.onGround;
  actor.crouch += ((actor.crouching ? 1 : 0) - actor.crouch) * Math.min(1, MOVEMENT.crouchRate * dt);
  actor.kick = actor.kick ?? { pitch: 0, yaw: 0 };
  actor.kick.pitch *= Math.max(0, 1 - 9 * dt);
  actor.kick.yaw *= Math.max(0, 1 - 7 * dt);

  if (!actor.alive) {
    actor.velocity.x = 0;
    actor.velocity.z = 0;
    return;
  }

  applyLook(actor, commands);

  // The freeze holds everybody at the spawn while the shop is open.
  const frozen = state.match.phase === 'freeze' || state.match.over;
  wishDirection(actor, frozen ? 0 : commands.moveX, frozen ? 0 : commands.moveZ, wish);
  const speed = moveSpeedFor(actor, commands);
  accelerate(actor, wish.x, wish.z, speed, dt);
  if ((wish.x === 0 && wish.z === 0) && actor.onGround) applyFriction(actor, dt);
  if (commands.jump && !frozen) jump(actor);
  integrate(state, world, actor, dt);

  const loadout = actor.loadout;
  for (let index = 0; index < commands.slots.length; index += 1) {
    if (commands.slots[index]) equipSlot(loadout, index, state.time);
  }

  if (commands.reload && beginReload(loadout, state.time)) {
    pushSound(state, { kind: 'reload', stage: 0, x: actor.position.x, y: actor.position.y, z: actor.position.z });
  }
  if (stepReload(loadout, state.time) === 'finished') {
    pushSound(state, { kind: 'reload', stage: 2, x: actor.position.x, y: actor.position.y, z: actor.position.z });
  }

  if (commands.grenadeHe) throwGrenade(state, actor, 'he');
  if (commands.grenadeSmoke) throwGrenade(state, actor, 'smoke');

  // Plant or cut: the key is held, so both are asked every step and only one can apply.
  tryPlant(state, actor, commands.use, dt);
  tryDefuse(state, actor, commands.use, dt);

  if (commands.fire && canFire(loadout, state.time)) {
    const spread = currentSpread(loadout, actor.speed, actor.onGround, actor.crouching) * (commands.aim ? 0.5 : 1);
    fireShot(state, world, actor, spread, 0);
    const spec = activeWeapon(loadout);
    const kick = spec.recoil.vertical * RECOIL_KICK;
    actor.pitch += kick;
    actor.yaw += (state.random() - 0.5) * spec.recoil.horizontal * 1.6;
    actor.kick.pitch = Math.min(0.16, actor.kick.pitch + kick * 2.4);
    actor.kick.yaw += (state.random() - 0.5) * kick * 1.2;
    if (actor.pitch > MAX_PITCH) actor.pitch = MAX_PITCH;
  }
  recoilRecover(loadout, dt);
}
