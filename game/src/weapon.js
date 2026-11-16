// The arsenal: seven weapons plus a crowbar, a charge, smokes and kit, and the small state machine
// that fires, reloads, switches and recoils them. Every timer is simulation time, never wall clock.
import { MOVEMENT } from './config.js';

// Damage numbers are per hit, at the chest; the part multipliers in config decide the rest.
export const WEAPONS = {
  knife: {
    id: 'knife', name: 'Crowbar', class: 'knife', price: 0, slot: 'melee',
    damage: 62, rpm: 120, magazine: 0, reserve: 0, reload: 0, auto: false, range: 1.7,
    armorPen: 0.9, killReward: 1500, moveSpeed: 1.08, zoom: 1, barrel: 0, receiver: 0,
    spread: { stand: 0, move: 0, air: 0, crouch: 0, decay: 0 }, recoil: { vertical: 0, horizontal: 0, recovery: 0 },
  },
  pistol: {
    id: 'pistol', name: 'Bramble P9', class: 'pistol', price: 200, slot: 'secondary',
    damage: 24, rpm: 420, magazine: 12, reserve: 36, reload: 2.1, auto: false,
    armorPen: 0.6, killReward: 300, moveSpeed: 1.0, zoom: 1, barrel: 0.1, receiver: 0.2,
    spread: { stand: 0.0026, move: 0.019, air: 0.05, crouch: 0.0018, decay: 0.09 },
    recoil: { vertical: 0.009, horizontal: 0.004, recovery: 0.5 },
  },
  smg: {
    id: 'smg', name: 'Kestrel K4', class: 'smg', price: 1250, slot: 'primary',
    damage: 23, rpm: 780, magazine: 30, reserve: 90, reload: 2.5, auto: true,
    armorPen: 0.62, killReward: 600, moveSpeed: 0.95, zoom: 1, barrel: 0.22, receiver: 0.26,
    spread: { stand: 0.0062, move: 0.034, air: 0.07, crouch: 0.0045, decay: 0.12 },
    recoil: { vertical: 0.0085, horizontal: 0.005, recovery: 0.42 },
  },
  shotgun: {
    id: 'shotgun', name: 'Bellows 8', class: 'shotgun', price: 1150, slot: 'primary',
    damage: 21, pellets: 8, rpm: 75, magazine: 6, reserve: 24, reload: 3.1, auto: false,
    armorPen: 0.55, killReward: 900, moveSpeed: 0.92, zoom: 1, barrel: 0.36, receiver: 0.3,
    spread: { stand: 0.042, move: 0.058, air: 0.09, crouch: 0.036, decay: 0.2 },
    recoil: { vertical: 0.03, horizontal: 0.008, recovery: 0.3 },
  },
  rifle: {
    id: 'rifle', name: 'Ridgeline 74', class: 'rifle', price: 2750, slot: 'primary',
    damage: 33, rpm: 600, magazine: 30, reserve: 90, reload: 2.9, auto: true,
    armorPen: 0.77, killReward: 300, moveSpeed: 0.88, zoom: 1.18, barrel: 0.34, receiver: 0.32,
    spread: { stand: 0.004, move: 0.031, air: 0.08, crouch: 0.0028, decay: 0.1 },
    recoil: { vertical: 0.0135, horizontal: 0.006, recovery: 0.36 },
  },
  marksman: {
    id: 'marksman', name: 'Longbow 12', class: 'marksman', price: 4600, slot: 'primary',
    damage: 118, rpm: 42, magazine: 5, reserve: 20, reload: 3.7, auto: false,
    armorPen: 0.95, killReward: 100, moveSpeed: 0.74, zoom: 3.4, barrel: 0.52, receiver: 0.34,
    spread: { stand: 0.0007, move: 0.048, air: 0.1, crouch: 0.0005, decay: 0.05 },
    recoil: { vertical: 0.05, horizontal: 0.01, recovery: 0.25 },
  },
};

export const GRENADES = {
  he: { id: 'he', name: 'Shard charge', price: 300, fuse: 2.3, radius: 6.5, damage: 92, kind: 'he' },
  smoke: { id: 'smoke', name: 'Veil canister', price: 300, fuse: 1.6, radius: 4.2, damage: 0, kind: 'smoke' },
};

export const GEAR = {
  armor: { id: 'armor', name: 'Plate carrier', price: 650, armor: 100 },
  helmet: { id: 'helmet', name: 'Plate + visor', price: 1000, armor: 100, helmet: true },
  kit: { id: 'kit', name: 'Ripcord cutter', price: 400 },
};

export function createLoadout() {
  return {
    slots: ['knife', 'pistol'],
    current: 1,
    mag: { knife: 0, pistol: 12 },
    reserve: { knife: 0, pistol: 36 },
    grenades: { he: 0, smoke: 0 },
    armor: 0,
    helmet: false,
    kit: false,
    nextFire: 0,
    reload: null,
    switchUntil: 0,
    triggerHeld: false,
    shots: 0,
    recoil: { vertical: 0, horizontal: 0, lastShot: -10 },
  };
}

// A fresh round of a match: weapons bought back only by what a fighter paid for, so the economy bites.
export function resetLoadout(loadout, keepGear) {
  loadout.slots = ['knife', 'pistol'];
  loadout.current = 1;
  loadout.mag = { knife: 0, pistol: 12 };
  loadout.reserve = { knife: 0, pistol: 36 };
  loadout.grenades = { he: 0, smoke: 0 };
  loadout.reload = null;
  loadout.nextFire = 0;
  loadout.switchUntil = 0;
  loadout.triggerHeld = false;
  loadout.shots = 0;
  loadout.recoil.vertical = 0;
  loadout.recoil.horizontal = 0;
  if (!keepGear) {
    loadout.armor = 0;
    loadout.helmet = false;
    loadout.kit = false;
  }
}

export function activeWeapon(loadout) {
  return WEAPONS[loadout.slots[loadout.current]] ?? WEAPONS.pistol;
}

function magCount(loadout, id) {
  return loadout.mag[id] ?? 0;
}

function reserveCount(loadout, id) {
  return loadout.reserve[id] ?? 0;
}

export function give(loadout, id) {
  const spec = WEAPONS[id];
  if (!spec) return false;
  if (!loadout.slots.includes(id)) {
    if (spec.slot === 'primary') {
      const existing = loadout.slots.findIndex((slot) => WEAPONS[slot].slot === 'primary');
      if (existing >= 0) loadout.slots.splice(existing, 1, id);
      else loadout.slots.unshift(id);
      loadout.current = loadout.slots.indexOf(id);
    } else {
      const existing = loadout.slots.findIndex((slot) => WEAPONS[slot].slot === spec.slot);
      if (existing >= 0) loadout.slots.splice(existing, 1, id);
      else loadout.slots.splice(1, 0, id);
    }
  }
  loadout.mag[id] = spec.magazine;
  loadout.reserve[id] = spec.reserve;
  return true;
}

export function equipSlot(loadout, index, time) {
  if (index < 0 || index >= loadout.slots.length || index === loadout.current) return false;
  loadout.current = index;
  loadout.reload = null;
  loadout.switchUntil = time + 0.5;
  return true;
}

export function equipBest(loadout, time) {
  if (loadout.slots.includes('rifle')) return equipSlot(loadout, loadout.slots.indexOf('rifle'), time);
  if (loadout.slots.includes('marksman')) return equipSlot(loadout, loadout.slots.indexOf('marksman'), time);
  if (loadout.slots.includes('smg')) return equipSlot(loadout, loadout.slots.indexOf('smg'), time);
  if (loadout.slots.includes('shotgun')) return equipSlot(loadout, loadout.slots.indexOf('shotgun'), time);
  return equipSlot(loadout, 1, time);
}

export function ready(loadout, time) {
  return time >= loadout.nextFire && time >= loadout.switchUntil && loadout.reload === null;
}

export function canFire(loadout, time) {
  if (!ready(loadout, time)) return false;
  const spec = activeWeapon(loadout);
  if (spec.class === 'knife') return true;
  return magCount(loadout, spec.id) > 0;
}

export function consumeRound(loadout, time) {
  const spec = activeWeapon(loadout);
  const interval = 60 / Math.max(20, spec.rpm);
  loadout.nextFire = time + interval;
  loadout.shots += 1;
  if (spec.class !== 'knife') loadout.mag[spec.id] = magCount(loadout, spec.id) - 1;
  const recoil = spec.recoil;
  loadout.recoil.vertical = Math.min(0.09, loadout.recoil.vertical + recoil.vertical);
  loadout.recoil.horizontal += (Math.random() - 0.5) * recoil.horizontal * 2;
  loadout.recoil.lastShot = time;
  return true;
}

export function beginReload(loadout, time) {
  const spec = activeWeapon(loadout);
  if (spec.class === 'knife' || loadout.reload) return false;
  if (magCount(loadout, spec.id) >= spec.magazine) return false;
  if (reserveCount(loadout, spec.id) <= 0) return false;
  loadout.reload = { id: spec.id, endsAt: time + spec.reload, duration: spec.reload };
  return true;
}

// Returns 'started', 'finished' or null, so the caller can play a sound for each stage.
export function stepReload(loadout, time) {
  if (!loadout.reload) return null;
  if (time < loadout.reload.endsAt) return null;
  const spec = WEAPONS[loadout.reload.id];
  const need = spec.magazine - magCount(loadout, spec.id);
  const take = Math.min(need, reserveCount(loadout, spec.id));
  loadout.mag[spec.id] = magCount(loadout, spec.id) + take;
  loadout.reserve[spec.id] = reserveCount(loadout, spec.id) - take;
  loadout.reload = null;
  return 'finished';
}

// Spread in radians: standing still and crouched is tight, moving or airborne is not.
export function currentSpread(loadout, speed, onGround, crouched) {
  const spec = activeWeapon(loadout);
  if (spec.class === 'knife') return 0;
  const base = spec.spread;
  let spread = base.stand;
  if (!onGround) spread = base.air;
  else if (crouched) spread = base.crouch;
  else if (speed > 0.4) spread = base.stand + (base.move - base.stand) * Math.min(1, speed / MOVEMENT.runSpeed);
  // Recoil keeps building while the trigger is held: the aim wanders and has to be brought back.
  const heat = Math.min(1, loadout.recoil.vertical / (spec.recoil.vertical * 6));
  return spread * (1 + heat * 0.35) + loadout.recoil.vertical * 0.12;
}

export function recoilRecover(loadout, dt) {
  const spec = activeWeapon(loadout);
  const rate = spec.recoil.recovery || 0.3;
  loadout.recoil.vertical = Math.max(0, loadout.recoil.vertical - rate * dt * 0.25);
  loadout.recoil.horizontal *= Math.max(0, 1 - rate * dt * 2.2);
}
