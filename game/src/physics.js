// Kinematics for the yard: every body is a cylinder that slides along boxes and pillars, steps up
// low ledges and falls. The same functions move the player and the bots, and the same colliders
// answer every shot, so what blocks a walk also stops a bullet.

// Colliders come out of the map as two flat lists: axis-aligned boxes and vertical cylinders.
export function buildColliders(map) {
  const colliders = [];
  for (const item of map.boxes) {
    if (item.solid === false) continue;
    colliders.push({
      kind: 0,
      minX: item.x - item.w / 2,
      maxX: item.x + item.w / 2,
      minY: item.y,
      maxY: item.y + item.h,
      minZ: item.z - item.d / 2,
      maxZ: item.z + item.d / 2,
      tag: item.tag,
      surface: item.s,
    });
  }
  for (const item of map.pillars) {
    colliders.push({
      kind: 1,
      x: item.x,
      z: item.z,
      r: item.r,
      minY: item.y,
      maxY: item.y + item.h,
      minX: item.x - item.r,
      maxX: item.x + item.r,
      minZ: item.z - item.r,
      maxZ: item.z + item.r,
      tag: item.tag,
      surface: item.s,
    });
  }
  return colliders;
}

// The highest surface a body may stand on at (x, z): the floor, or a box or pillar top it can
// still step onto.
export function supportHeight(colliders, x, z, radius, feetY, stepHeight) {
  let top = 0;
  const limit = feetY + stepHeight;
  for (let index = 0; index < colliders.length; index += 1) {
    const collider = colliders[index];
    if (collider.maxY > limit || collider.maxY <= top) continue;
    if (collider.kind === 0) {
      if (x + radius < collider.minX || x - radius > collider.maxX) continue;
      if (z + radius < collider.minZ || z - radius > collider.maxZ) continue;
    } else {
      const dx = x - collider.x;
      const dz = z - collider.z;
      const reach = collider.r + radius;
      if (dx * dx + dz * dz > reach * reach) continue;
    }
    top = collider.maxY;
  }
  return top;
}

// Anything solid that overlaps a body standing at (x, y, z), used for spawns and for the head
// check that decides whether a step is possible.
export function blockedAt(colliders, x, y, z, radius, height) {
  const head = y + height;
  for (let index = 0; index < colliders.length; index += 1) {
    const collider = colliders[index];
    if (collider.maxY <= y + 0.02 || collider.minY >= head - 0.02) continue;
    if (collider.kind === 0) {
      if (x + radius <= collider.minX || x - radius >= collider.maxX) continue;
      if (z + radius <= collider.minZ || z - radius >= collider.maxZ) continue;
      return collider;
    }
    const dx = x - collider.x;
    const dz = z - collider.z;
    const reach = collider.r + radius;
    if (dx * dx + dz * dz < reach * reach) return collider;
  }
  return null;
}

// Move along one axis with sliding: the body is clamped against each collider it would enter, and a
// collider no taller than the step height is climbed instead.
function slideAxis(colliders, actor, radius, height, moveX, moveZ, stepHeight) {
  const feet = actor.position.y;
  const head = feet + height;
  let x = actor.position.x + moveX;
  let z = actor.position.z + moveZ;
  let stepTop = 0;
  let hitSomething = false;

  for (let index = 0; index < colliders.length; index += 1) {
    const collider = colliders[index];
    if (collider.maxY <= feet + 0.02 || collider.minY >= head - 0.02) continue;
    const low = collider.maxY <= feet + stepHeight;
    if (collider.kind === 0) {
      if (z + radius <= collider.minZ || z - radius >= collider.maxZ) continue;
      if (x + radius <= collider.minX || x - radius >= collider.maxX) continue;
      if (low) {
        if (collider.maxY > stepTop) stepTop = collider.maxY;
        continue;
      }
      hitSomething = true;
      x = moveX > 0 ? Math.min(x, collider.minX - radius) : Math.max(x, collider.maxX + radius);
    } else {
      const dx = x - collider.x;
      const dz = z - collider.z;
      const reach = collider.r + radius;
      if (dx * dx + dz * dz >= reach * reach) continue;
      if (low) {
        const onX = Math.abs(moveX) > Math.abs(moveZ);
        const half = Math.sqrt(Math.max(0, reach * reach - (onX ? dz * dz : dx * dx)));
        if (onX) x = moveX > 0 ? Math.max(collider.x - half, collider.minX) : Math.min(collider.x + half, collider.maxX);
        else z = moveZ > 0 ? Math.max(collider.z - half, collider.minZ) : Math.min(collider.z + half, collider.maxZ);
        if (collider.maxY > stepTop) stepTop = collider.maxY;
        continue;
      }
      hitSomething = true;
      const length = Math.sqrt(dx * dx + dz * dz) || 0.0001;
      x = collider.x + (dx / length) * reach;
      z = collider.z + (dz / length) * reach;
    }
  }

  // A low ledge is walked onto when there is room for the whole body on top of it.
  if (stepTop > 0 && stepTop > feet + 0.02) {
    const trials = stepTop - feet;
    if (trials <= stepHeight && !blockedAt(colliders, x, stepTop, z, radius * 0.98, height)) {
      actor.position.y = stepTop;
      actor.stepped = true;
    }
  }
  actor.position.x = x;
  actor.position.z = z;
  return hitSomething;
}

export function moveHorizontal(colliders, actor, radius, height, dt, stepHeight) {
  actor.stepped = false;
  const moveX = actor.velocity.x * dt;
  const moveZ = actor.velocity.z * dt;
  if (moveX === 0 && moveZ === 0) return;
  let blocked = false;
  if (moveX !== 0) blocked = slideAxis(colliders, actor, radius, height, moveX, 0, stepHeight) || blocked;
  if (moveZ !== 0) blocked = slideAxis(colliders, actor, radius, height, 0, moveZ, stepHeight) || blocked;
  if (blocked && !actor.stepped) {
    // A wall stopped the body: keep the speed towards it from building up.
    if (moveX !== 0) actor.velocity.x *= 0.4;
    if (moveZ !== 0) actor.velocity.z *= 0.4;
  }
}

// Vertical step: gravity, the floor, a ledge top, and the ceiling of whatever the body is under.
export function moveVertical(colliders, actor, radius, height, dt, gravity) {
  actor.velocity.y -= gravity * dt;
  const feet = actor.position.y;
  const support = supportHeight(colliders, actor.position.x, actor.position.z, radius, feet, Math.max(0, actor.velocity.y * dt));
  let next = feet + actor.velocity.y * dt;
  if (next <= support && actor.velocity.y <= 0) {
    actor.landed = true;
    actor.fallSpeed = -actor.velocity.y;
    actor.position.y = support;
    actor.velocity.y = 0;
    actor.onGround = true;
    return;
  }
  const ceiling = ceilingHeight(colliders, actor.position.x, actor.position.z, radius, feet + height);
  if (actor.velocity.y > 0 && ceiling !== null && next + height > ceiling) {
    next = ceiling - height;
    actor.velocity.y = 0;
  }
  actor.position.y = next;
  actor.onGround = false;
  actor.landed = false;
}

function ceilingHeight(colliders, x, z, radius, head) {
  let lowest = null;
  for (let index = 0; index < colliders.length; index += 1) {
    const collider = colliders[index];
    if (collider.minY < head - 0.02) continue;
    if (collider.kind === 0) {
      if (x + radius <= collider.minX || x - radius >= collider.maxX) continue;
      if (z + radius <= collider.minZ || z - radius >= collider.maxZ) continue;
    } else {
      const dx = x - collider.x;
      const dz = z - collider.z;
      const reach = collider.r + radius;
      if (dx * dx + dz * dz >= reach * reach) continue;
    }
    if (lowest === null || collider.minY < lowest) lowest = collider.minY;
  }
  return lowest;
}

// Rays: one result object is reused, so a shot or a line-of-sight check allocates nothing.
const rayResult = { distance: Infinity, tag: null, normalX: 0, normalY: 0, normalZ: 0, hit: false };

export function raycast(colliders, ox, oy, oz, dx, dy, dz, maxDistance) {
  let best = maxDistance;
  let tag = null;
  let nx = 0;
  let ny = 0;
  let nz = 0;
  let hit = false;
  const inverseX = 1 / dx;
  const inverseY = 1 / dy;
  const inverseZ = 1 / dz;

  for (let index = 0; index < colliders.length; index += 1) {
    const collider = colliders[index];
    if (collider.kind === 0) {
      let near = (collider.minX - ox) * inverseX;
      let far = (collider.maxX - ox) * inverseX;
      let axis = 0;
      let sign = dx > 0 ? -1 : 1;
      if (near > far) {
        const swap = near;
        near = far;
        far = swap;
        sign = -sign;
      }
      let nearY = (collider.minY - oy) * inverseY;
      let farY = (collider.maxY - oy) * inverseY;
      let signY = dy > 0 ? -1 : 1;
      if (nearY > farY) {
        const swap = nearY;
        nearY = farY;
        farY = swap;
        signY = -signY;
      }
      if (nearY > near) {
        near = nearY;
        axis = 1;
        sign = signY;
      }
      if (farY < far) far = farY;
      if (near > far) continue;
      let nearZ = (collider.minZ - oz) * inverseZ;
      let farZ = (collider.maxZ - oz) * inverseZ;
      let signZ = dz > 0 ? -1 : 1;
      if (nearZ > farZ) {
        const swap = nearZ;
        nearZ = farZ;
        farZ = swap;
        signZ = -signZ;
      }
      if (nearZ > near) {
        near = nearZ;
        axis = 2;
        sign = signZ;
      }
      if (farZ < far) far = farZ;
      if (near > far || far < 0 || near >= best) continue;
      const distance = near < 0 ? 0 : near;
      best = distance;
      tag = collider.surface;
      nx = axis === 0 ? sign : 0;
      ny = axis === 1 ? sign : 0;
      nz = axis === 2 ? sign : 0;
      hit = true;
    } else {
      const fx = ox - collider.x;
      const fz = oz - collider.z;
      const a = dx * dx + dz * dz;
      if (a < 1e-9) continue;
      const b = 2 * (fx * dx + fz * dz);
      const c = fx * fx + fz * fz - collider.r * collider.r;
      const disc = b * b - 4 * a * c;
      if (disc < 0) continue;
      const root = Math.sqrt(disc);
      let t = (-b - root) / (2 * a);
      if (t < 0) t = (-b + root) / (2 * a);
      if (t < 0 || t >= best) continue;
      const y = oy + dy * t;
      if (y < collider.minY || y > collider.maxY) continue;
      const hitX = ox + dx * t;
      const hitZ = oz + dz * t;
      best = t;
      tag = collider.surface;
      nx = hitX - collider.x;
      ny = 0;
      nz = hitZ - collider.z;
      const length = Math.sqrt(nx * nx + nz * nz) || 1;
      nx /= length;
      nz /= length;
      hit = true;
    }
  }

  rayResult.distance = best;
  rayResult.tag = tag;
  rayResult.normalX = nx;
  rayResult.normalY = ny;
  rayResult.normalZ = nz;
  rayResult.hit = hit;
  return rayResult;
}

// A cheap, allocation-free line of sight test: the ray budget is the distance minus a hair, so the
// wall a target leans on does not read as cover.
export function hasLineOfSight(colliders, ax, ay, az, bx, by, bz) {
  const dx = bx - ax;
  const dy = by - ay;
  const dz = bz - az;
  const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (distance < 0.05) return true;
  const inverse = 1 / distance;
  const result = raycast(colliders, ax, ay, az, dx * inverse, dy * inverse, dz * inverse, distance - 0.06);
  return !result.hit;
}
