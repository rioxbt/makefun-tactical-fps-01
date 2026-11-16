// Where a fighter is: the hitboxes every shot is checked against and the part multipliers damage
// works from. Kept free of three.js so the fight can be simulated and tested without a browser.
const STANDING_HEIGHT = 1.8;
const CROUCH_HEIGHT = 1.3;

// Local space, standing 1.8 m tall: x to the fighter's right, y up, z forward is -z (the facing).
export const HITBOXES = [
  { part: 'head', minX: -0.15, maxX: 0.15, minY: 1.5, maxY: 1.82, minZ: -0.15, maxZ: 0.15 },
  { part: 'chest', minX: -0.25, maxX: 0.25, minY: 1.16, maxY: 1.5, minZ: -0.17, maxZ: 0.17 },
  { part: 'stomach', minX: -0.23, maxX: 0.23, minY: 0.88, maxY: 1.16, minZ: -0.16, maxZ: 0.16 },
  { part: 'arm', minX: -0.44, maxX: -0.25, minY: 1.0, maxY: 1.46, minZ: -0.14, maxZ: 0.14 },
  { part: 'arm', minX: 0.25, maxX: 0.44, minY: 1.0, maxY: 1.46, minZ: -0.14, maxZ: 0.14 },
  { part: 'leg', minX: -0.23, maxX: -0.02, minY: 0.0, maxY: 0.88, minZ: -0.16, maxZ: 0.16 },
  { part: 'leg', minX: 0.02, maxX: 0.23, minY: 0.0, maxY: 0.88, minZ: -0.16, maxZ: 0.16 },
];

export const PART_DAMAGE = { head: 4.0, chest: 1.0, stomach: 1.25, arm: 0.7, leg: 0.75 };

// Body height as it is right now: a crouched fighter is a smaller target.
export function heightOf(actor) {
  return STANDING_HEIGHT - (STANDING_HEIGHT - CROUCH_HEIGHT) * (actor.crouch ?? 0);
}

function eyeHeightOf(actor) {
  const eyeStand = 1.62;
  const eyeCrouch = 1.14;
  return eyeStand - (eyeStand - eyeCrouch) * (actor.crouch ?? 0);
}

// World point of a fighter's eye, the place their shots come from.
export function eyeOf(actor, out) {
  out.x = actor.position.x;
  out.y = actor.position.y + eyeHeightOf(actor);
  out.z = actor.position.z;
  return out;
}

// Unit forward vector of a fighter's aim; the game's convention is yaw 0 facing -z.
export function forwardOf(yaw, pitch, out) {
  const cosPitch = Math.cos(pitch);
  out.x = -Math.sin(yaw) * cosPitch;
  out.y = Math.sin(pitch);
  out.z = -Math.cos(yaw) * cosPitch;
  return out;
}

// Yaw that looks from one ground point at another, for aiming a bot or a spawn.
export function yawTo(fromX, fromZ, toX, toZ) {
  return Math.atan2(-(toX - fromX), -(toZ - fromZ));
}

// A ray against one body: the ray is unrotated into the body's own frame, then tested against every
// hitbox. Returns the part hit and the world distance, or null.
export function traceBody(actor, ox, oy, oz, dx, dy, dz, maxDistance) {
  const cos = Math.cos(actor.yaw);
  const sin = Math.sin(actor.yaw);
  const worldX = ox - actor.position.x;
  const worldZ = oz - actor.position.z;
  const localOX = worldX * cos - worldZ * sin;
  const localOZ = worldX * sin + worldZ * cos;
  const localOY = oy - actor.position.y;
  const localDX = dx * cos - dz * sin;
  const localDZ = dx * sin + dz * cos;
  const localDY = dy;
  const scale = heightOf(actor) / STANDING_HEIGHT;

  let bestDistance = maxDistance;
  let bestPart = null;
  for (let index = 0; index < HITBOXES.length; index += 1) {
    const box = HITBOXES[index];
    const minY = box.minY * scale;
    const maxY = box.maxY * scale;
    let near = -Infinity;
    let far = Infinity;
    let axis = -1;

    // x slab
    if (Math.abs(localDX) < 1e-9) {
      if (localOX < box.minX || localOX > box.maxX) continue;
    } else {
      let t0 = (box.minX - localOX) / localDX;
      let t1 = (box.maxX - localOX) / localDX;
      if (t0 > t1) {
        const swap = t0;
        t0 = t1;
        t1 = swap;
      }
      near = t0;
      far = t1;
      axis = 0;
    }
    // y slab
    if (Math.abs(localDY) < 1e-9) {
      if (localOY < minY || localOY > maxY) continue;
    } else {
      let t0 = (minY - localOY) / localDY;
      let t1 = (maxY - localOY) / localDY;
      if (t0 > t1) {
        const swap = t0;
        t0 = t1;
        t1 = swap;
      }
      if (t0 > near) {
        near = t0;
        axis = 1;
      }
      if (t1 < far) far = t1;
      if (near > far) continue;
    }
    // z slab
    if (Math.abs(localDZ) < 1e-9) {
      if (localOZ < box.minZ || localOZ > box.maxZ) continue;
    } else {
      let t0 = (box.minZ - localOZ) / localDZ;
      let t1 = (box.maxZ - localOZ) / localDZ;
      if (t0 > t1) {
        const swap = t0;
        t0 = t1;
        t1 = swap;
      }
      if (t0 > near) {
        near = t0;
        axis = 2;
      }
      if (t1 < far) far = t1;
      if (near > far) continue;
    }
    if (far < 0 || near < 0 || near >= bestDistance || axis < 0) continue;
    bestDistance = near;
    bestPart = box.part;
  }

  if (bestPart === null) return null;
  const result = traceBody.result;
  result.part = bestPart;
  result.distance = bestDistance;
  result.x = ox + dx * bestDistance;
  result.y = oy + dy * bestDistance;
  result.z = oz + dz * bestDistance;
  return result;
}
traceBody.result = { part: null, distance: 0, x: 0, y: 0, z: 0 };
