// Walking, shared: the player and every bot push themselves through this one path, so movement,
// collision, falls and footsteps behave the same for a human and for a bot.
import { MOVEMENT } from './config.js';
import { heightOf } from './body.js';
import { moveHorizontal, moveVertical } from './physics.js';
import { pushSound } from './state.js';

// Turn a stick-like input into a world direction along the way the body is facing.
export function wishDirection(actor, moveX, moveZ, out) {
  const forwardX = -Math.sin(actor.yaw);
  const forwardZ = -Math.cos(actor.yaw);
  const rightX = -forwardZ;
  const rightZ = forwardX;
  let x = forwardX * moveZ + rightX * moveX;
  let z = forwardZ * moveZ + rightZ * moveX;
  const length = Math.sqrt(x * x + z * z);
  if (length > 0.0001) {
    x /= length;
    z /= length;
  } else {
    x = 0;
    z = 0;
  }
  out.x = x;
  out.z = z;
  return out;
}

// Acceleration and friction: speed builds up and bleeds off, it never snaps.
export function accelerate(actor, wishX, wishZ, speed, dt) {
  const moving = wishX !== 0 || wishZ !== 0;
  const acceleration = actor.onGround ? MOVEMENT.accelGround : MOVEMENT.accelAir;
  const ceiling = actor.onGround ? speed : Math.max(speed, MOVEMENT.airSpeed);
  const rate = Math.min(1, acceleration * dt * (moving ? 1 : 0.55));
  actor.velocity.x += (wishX * ceiling - actor.velocity.x) * rate;
  actor.velocity.z += (wishZ * ceiling - actor.velocity.z) * rate;
}

export function applyFriction(actor, dt) {
  const friction = actor.crouching ? MOVEMENT.frictionCrouch : MOVEMENT.friction;
  const current = Math.sqrt(actor.velocity.x * actor.velocity.x + actor.velocity.z * actor.velocity.z);
  if (current < 0.001) {
    actor.velocity.x = 0;
    actor.velocity.z = 0;
    return;
  }
  const drop = friction * dt * Math.max(current, MOVEMENT.stopSpeed);
  const scale = Math.max(0, current - drop) / current;
  actor.velocity.x *= scale;
  actor.velocity.z *= scale;
}

export function jump(actor) {
  if (!actor.onGround) return false;
  actor.velocity.y = MOVEMENT.jumpSpeed;
  actor.onGround = false;
  return true;
}

// The physics step every body takes: collision, gravity, the landing, and a footstep to hear.
export function integrate(state, world, actor, dt) {
  const height = heightOf(actor);
  moveHorizontal(world.colliders, actor, MOVEMENT.radius, height, dt, MOVEMENT.stepHeight);
  moveVertical(world.colliders, actor, MOVEMENT.radius, height, dt, MOVEMENT.gravity);
  actor.speed = Math.sqrt(actor.velocity.x * actor.velocity.x + actor.velocity.z * actor.velocity.z);

  if (actor.landed && actor.fallSpeed > MOVEMENT.maxFallSafe) {
    const damage = (actor.fallSpeed - MOVEMENT.maxFallSafe) * MOVEMENT.fallDamagePerSpeed;
    actor.health -= damage;
    if (actor.health <= 0) actor.health = 1;
  }

  if (actor.onGround && actor.speed > 0.4) {
    actor.nextFootstep -= actor.speed * dt;
    if (actor.nextFootstep <= 0) {
      const loud = !actor.walking && !actor.crouching && actor.speed > MOVEMENT.walkSpeed + 0.3;
      actor.nextFootstep = actor.crouching ? 3.6 : loud ? 2.25 : 3.1;
      pushSound(state, { kind: 'footstep', loud, x: actor.position.x, y: actor.position.y, z: actor.position.z });
    }
  }
}

export { MOVEMENT };
