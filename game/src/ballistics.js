// Gunfire and grenades: spread, the trace through the world and the bodies it meets, what armour
// takes off the top, and what a charge does when it goes off. Everything it does is a queue entry
// (a sound, an effect, a fight result), so this module never touches the screen or the speakers.
import { COMBAT } from './config.js';
import { PART_DAMAGE, eyeOf, forwardOf, traceBody } from './body.js';
import { GRENADES, WEAPONS, activeWeapon, consumeRound } from './weapon.js';
import { addSmoke, pushResult, pushSound } from './state.js';

const MAX_RANGE = 130;
const scratchOrigin = { x: 0, y: 0, z: 0 };
const scratchDirection = { x: 0, y: 0, z: 0 };

// The one bullet result object: callers read it immediately and never keep it.
export const bullet = {
  actor: null,
  actorId: -1,
  part: null,
  distance: MAX_RANGE,
  x: 0,
  y: 0,
  z: 0,
  surface: null,
  normalX: 0,
  normalY: 0,
  normalZ: 0,
  blockedByWorld: false,
};

export function pushEffect(state, effect) {
  if (state.effects.length >= 48) state.effects.shift();
  state.effects.push(effect);
}

function aimOf(actor, out) {
  return forwardOf(actor.yaw, actor.pitch, out);
}

// One bullet from a fighter's eye: out along the aim with the spread of the moment, into the first
// enemy body or the first wall, whichever comes first.
function fireBullet(state, world, shooter, spread) {
  const random = state.random;
  eyeOf(shooter, scratchOrigin);
  forwardOf(shooter.yaw, shooter.pitch, scratchDirection);
  let x = scratchDirection.x + (random() * 2 - 1) * spread;
  let y = scratchDirection.y + (random() * 2 - 1) * spread;
  let z = scratchDirection.z + (random() * 2 - 1) * spread;
  const length = Math.sqrt(x * x + y * y + z * z) || 1;
  x /= length;
  y /= length;
  z /= length;

  const worldHit = world.ray(scratchOrigin.x, scratchOrigin.y, scratchOrigin.z, x, y, z, MAX_RANGE);
  let limit = worldHit.hit ? worldHit.distance : MAX_RANGE;
  bullet.actor = null;
  bullet.actorId = -1;
  bullet.part = null;
  bullet.distance = limit;
  bullet.x = scratchOrigin.x + x * limit;
  bullet.y = scratchOrigin.y + y * limit;
  bullet.z = scratchOrigin.z + z * limit;
  bullet.surface = worldHit.hit ? worldHit.tag : null;
  bullet.normalX = worldHit.normalX;
  bullet.normalY = worldHit.normalY;
  bullet.normalZ = worldHit.normalZ;
  bullet.blockedByWorld = worldHit.hit;

  for (let index = 0; index < state.actors.length; index += 1) {
    const actor = state.actors[index];
    if (!actor.alive || actor === shooter || actor.team === shooter.team) continue;
    const hit = traceBody(actor, scratchOrigin.x, scratchOrigin.y, scratchOrigin.z, x, y, z, limit);
    if (!hit) continue;
    limit = hit.distance;
    bullet.actor = actor;
    bullet.actorId = actor.id;
    bullet.part = hit.part;
    bullet.distance = hit.distance;
    bullet.x = hit.x;
    bullet.y = hit.y;
    bullet.z = hit.z;
    bullet.surface = 'flesh';
    bullet.blockedByWorld = false;
  }
  return bullet;
}

function damageAfterArmor(victim, amount, part, armorPen) {
  if (victim.armor <= 0) return amount;
  const protectedPart = part !== 'head' || victim.helmet;
  if (!protectedPart) return amount;
  return amount * (1 - (1 - armorPen) * COMBAT.armorAbsorb * 2);
}

// Damage in one place: armour, hit points, the fight results the round needs, and death.
function applyDamage(state, victim, attacker, amount, part, weaponId) {
  if (!victim.alive || amount <= 0) return 0;
  const spec = WEAPONS[weaponId];
  const armorPen = spec ? spec.armorPen : 0.7;
  const afterArmor = damageAfterArmor(victim, amount, part, armorPen);
  const dealt = Math.max(COMBAT.minDamageFloor, afterArmor);
  if (victim.armor > 0) victim.armor = Math.max(0, victim.armor - dealt * 0.24);
  victim.health -= dealt;
  victim.lastDamageFrom = attacker ? attacker.id : -1;
  victim.lastDamageTime = state.time;
  if (attacker) attacker.damageDone = (attacker.damageDone ?? 0) + Math.min(dealt, Math.max(0, victim.health + dealt));
  pushResult(state, {
    type: 'hit',
    attackerId: attacker ? attacker.id : -1,
    victimId: victim.id,
    damage: dealt,
    part,
    headshot: part === 'head',
  });
  if (attacker && attacker.isPlayer) state.stats.playerDamage += dealt;
  if (victim.health <= 0) {
    victim.health = 0;
    victim.alive = false;
    victim.deaths += 1;
    if (attacker) attacker.kills += 1;
    pushResult(state, {
      type: 'kill',
      attackerId: attacker ? attacker.id : -1,
      victimId: victim.id,
      weaponId,
      part,
      headshot: part === 'head',
    });
    pushSound(state, { kind: 'death', x: victim.position.x, y: victim.position.y, z: victim.position.z, team: victim.team });
  }
  return dealt;
}

// One shot of the active weapon: ammo, pellets, effects, damage. Called by the player and the bots.
export function fireShot(state, world, shooter, spread, extraSpread) {
  const loadout = shooter.loadout;
  const spec = activeWeapon(loadout);
  if (spec.class === 'knife') {
    consumeRound(loadout, state.time);
    const hit = fireBullet(state, world, shooter, 0);
    const range = spec.range;
    pushSound(state, { kind: 'knife', x: shooter.position.x, y: shooter.position.y, z: shooter.position.z });
    if (hit.actor && hit.distance <= range) {
      applyDamage(state, hit.actor, shooter, spec.damage, hit.part, spec.id);
      pushEffect(state, { kind: 'blood', x: hit.x, y: hit.y, z: hit.z, dx: 0, dz: 0 });
    }
    return hit;
  }
  consumeRound(loadout, state.time);
  const pellets = spec.pellets ?? 1;
  const total = spread + (extraSpread ?? 0);
  const eye = eyeOf(shooter, scratchOrigin);
  const muzzleX = eye.x;
  const muzzleY = eye.y;
  const muzzleZ = eye.z;
  pushEffect(state, { kind: 'muzzle', x: muzzleX, y: muzzleY, z: muzzleZ, size: spec.class === 'marksman' ? 0.9 : 0.6 });
  pushSound(state, {
    kind: 'shot',
    weapon: spec.class,
    x: shooter.position.x,
    y: shooter.position.y,
    z: shooter.position.z,
    team: shooter.team,
    actorId: shooter.id,
  });
  let last = null;
  for (let index = 0; index < pellets; index += 1) {
    const hit = fireBullet(state, world, shooter, total);
    pushEffect(state, {
      kind: 'tracer',
      ax: muzzleX,
      ay: muzzleY,
      az: muzzleZ,
      bx: hit.x,
      by: hit.y,
      bz: hit.z,
      color: spec.class === 'marksman' ? 0xfff0c0 : 0xffd9a0,
    });
    pushEffect(state, {
      kind: 'impact',
      x: hit.x,
      y: hit.y,
      z: hit.z,
      nx: hit.normalX,
      ny: hit.normalY,
      nz: hit.normalZ,
      surface: hit.surface,
      actor: hit.actor !== null,
    });
    if (hit.actor) {
      applyDamage(state, hit.actor, shooter, spec.damage, hit.part, spec.id);
      pushEffect(state, { kind: 'blood', x: hit.x, y: hit.y, z: hit.z, dx: 0, dz: 0 });
    }
    last = hit.actor;
  }
  return last;
}

// Grenades: a thrown can with gravity, a bounce off whatever it meets, and a fuse.
export function throwGrenade(state, actor, kind) {
  const spec = GRENADES[kind];
  if (!spec) return false;
  const loadout = actor.loadout;
  if ((loadout.grenades[kind] ?? 0) <= 0) return false;
  loadout.grenades[kind] -= 1;
  const eye = eyeOf(actor, scratchOrigin);
  const direction = forwardOf(actor.yaw, actor.pitch, scratchDirection);
  const speed = 15.5;
  state.grenades.push({
    kind,
    ownerId: actor.id,
    team: actor.team,
    x: eye.x + direction.x * 0.5,
    y: eye.y + direction.y * 0.5,
    z: eye.z + direction.z * 0.5,
    vx: direction.x * speed,
    vy: direction.y * speed + 2.2,
    vz: direction.z * speed,
    fuse: spec.fuse,
    bounces: 0,
  });
  pushSound(state, { kind: 'throw', x: actor.position.x, y: actor.position.y, z: actor.position.z });
  return true;
}

export function stepGrenades(state, world, dt) {
  for (let index = state.grenades.length - 1; index >= 0; index -= 1) {
    const grenade = state.grenades[index];
    grenade.fuse -= dt;
    grenade.vy -= 14 * dt;
    const speed = Math.sqrt(grenade.vx * grenade.vx + grenade.vy * grenade.vy + grenade.vz * grenade.vz);
    if (speed > 0.001) {
      const inverse = 1 / speed;
      const travel = speed * dt;
      const hit = world.ray(
        grenade.x,
        grenade.y,
        grenade.z,
        grenade.vx * inverse,
        grenade.vy * inverse,
        grenade.vz * inverse,
        travel,
      );
      if (hit.hit && hit.distance < travel) {
        // It met something solid: sit on the surface, then bounce off the normal, losing most of it.
        const contact = Math.max(0.02, hit.distance - 0.06);
        grenade.x += grenade.vx * inverse * contact;
        grenade.y += grenade.vy * inverse * contact;
        grenade.z += grenade.vz * inverse * contact;
        const dot = grenade.vx * hit.normalX + grenade.vy * hit.normalY + grenade.vz * hit.normalZ;
        grenade.vx = (grenade.vx - 2 * dot * hit.normalX) * 0.42;
        grenade.vy = (grenade.vy - 2 * dot * hit.normalY) * 0.42;
        grenade.vz = (grenade.vz - 2 * dot * hit.normalZ) * 0.42;
        grenade.bounces += 1;
        pushSound(state, { kind: 'bounce', x: grenade.x, y: grenade.y, z: grenade.z });
      } else {
        grenade.x += grenade.vx * dt;
        grenade.y += grenade.vy * dt;
        grenade.z += grenade.vz * dt;
      }
    }
    const ground = world.groundAt(grenade.x, grenade.z, 0.08, grenade.y, 0.4);
    if (grenade.y - 0.07 <= ground) {
      grenade.y = ground + 0.07;
      grenade.vy = Math.abs(grenade.vy) * 0.35;
      grenade.vx *= 0.6;
      grenade.vz *= 0.6;
      if (Math.abs(grenade.vy) < 0.5) grenade.vy = 0;
    }
    if (grenade.fuse <= 0) detonate(state, world, index);
  }
}

// A charge going off or a canister opening: one place, one radius, one line of sight per body.
function detonate(state, world, index) {
  const grenade = state.grenades[index];
  const spec = GRENADES[grenade.kind];
  state.grenades.splice(index, 1);
  if (grenade.kind === 'smoke') {
    addSmoke(state, grenade.x, grenade.y + 1.1, grenade.z, spec.radius, state.time + 14);
    pushEffect(state, { kind: 'smoke', x: grenade.x, y: grenade.y + 0.4, z: grenade.z });
    pushSound(state, { kind: 'smoke', x: grenade.x, y: grenade.y, z: grenade.z });
    return;
  }
  pushEffect(state, { kind: 'explosion', x: grenade.x, y: grenade.y + 0.2, z: grenade.z });
  pushSound(state, { kind: 'explosion', x: grenade.x, y: grenade.y, z: grenade.z });
  for (const actor of state.actors) {
    if (!actor.alive) continue;
    const dx = actor.position.x - grenade.x;
    const dy = actor.position.y + 0.95 - grenade.y;
    const dz = actor.position.z - grenade.z;
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (distance > spec.radius) continue;
    if (!world.lineOfSight(grenade.x, grenade.y + 0.2, grenade.z, actor.position.x, actor.position.y + 0.95, actor.position.z)) continue;
    const falloff = 1 - distance / spec.radius;
    let amount = spec.damage * falloff * falloff;
    if (falloff < 0.15) amount *= 0.5;
    if (actor.id === grenade.ownerId) amount *= 0.55;
    const attacker = state.actors[grenade.ownerId] ?? null;
    if (attacker && attacker.team === actor.team && attacker !== actor) continue;
    applyDamage(state, actor, attacker, amount, 'stomach', 'he');
  }
}
