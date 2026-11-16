// The shop between rounds: what an item costs, who may buy it, what a kill and a round pay, and how
// a bot spends its own money. Money only ever moves here.
import { BOTS, ECONOMY } from './config.js';
import { GEAR, GRENADES, WEAPONS, activeWeapon, give } from './weapon.js';

export const BUY_ITEMS = [
  { key: 'rifle', kind: 'weapon', price: WEAPONS.rifle.price, name: WEAPONS.rifle.name, hotkey: '1' },
  { key: 'smg', kind: 'weapon', price: WEAPONS.smg.price, name: WEAPONS.smg.name, hotkey: '2' },
  { key: 'shotgun', kind: 'weapon', price: WEAPONS.shotgun.price, name: WEAPONS.shotgun.name, hotkey: '3' },
  { key: 'marksman', kind: 'weapon', price: WEAPONS.marksman.price, name: WEAPONS.marksman.name, hotkey: '4' },
  { key: 'pistol', kind: 'weapon', price: WEAPONS.pistol.price, name: WEAPONS.pistol.name, hotkey: '5' },
  { key: 'armor', kind: 'gear', price: GEAR.armor.price, name: GEAR.armor.name, hotkey: '6' },
  { key: 'helmet', kind: 'gear', price: GEAR.helmet.price, name: GEAR.helmet.name, hotkey: '7' },
  { key: 'kit', kind: 'gear', price: GEAR.kit.price, name: GEAR.kit.name, hotkey: '8' },
  { key: 'he', kind: 'grenade', price: GRENADES.he.price, name: GRENADES.he.name, hotkey: '9' },
  { key: 'smoke', kind: 'grenade', price: GRENADES.smoke.price, name: GRENADES.smoke.name, hotkey: '0' },
];

export function itemFor(key) {
  for (const item of BUY_ITEMS) if (item.key === key) return item;
  return null;
}

export function ownsItem(actor, key) {
  const loadout = actor.loadout;
  if (key === 'armor') return loadout.armor > 0;
  if (key === 'helmet') return loadout.armor > 0 && loadout.helmet;
  if (key === 'kit') return loadout.kit;
  if (key === 'he' || key === 'smoke') return (loadout.grenades[key] ?? 0) > 0;
  return loadout.slots.includes(key);
}

export function affordable(actor, item) {
  if (!item) return false;
  if (actor.money < item.price) return false;
  if (item.kind === 'grenade' && (actor.loadout.grenades[item.key] ?? 0) >= 2) return false;
  if (item.kind === 'weapon' && ownsItem(actor, item.key)) return false;
  if (item.kind === 'gear' && item.key === 'armor' && actor.loadout.armor >= 100) return false;
  if (item.kind === 'gear' && item.key === 'helmet' && actor.loadout.helmet) return false;
  if (item.kind === 'gear' && item.key === 'kit' && actor.loadout.kit) return false;
  return true;
}

// Buying: the one place money is spent. Returns true when the buy went through.
export function buy(actor, key) {
  const item = itemFor(key);
  if (!item || !affordable(actor, item)) return false;
  actor.money -= item.price;
  if (item.kind === 'weapon') give(actor.loadout, item.key);
  else if (item.key === 'armor') actor.loadout.armor = 100;
  else if (item.key === 'helmet') {
    actor.loadout.armor = 100;
    actor.loadout.helmet = true;
  } else if (item.key === 'kit') actor.loadout.kit = true;
  else actor.loadout.grenades[item.key] = (actor.loadout.grenades[item.key] ?? 0) + 1;
  if (item.kind === 'gear') {
    actor.armor = actor.loadout.armor;
    actor.helmet = actor.loadout.helmet;
  }
  return true;
}

export function awardKill(state, attackerId, weaponId) {
  const attacker = state.actors[attackerId];
  if (!attacker) return;
  const spec = WEAPONS[weaponId];
  attacker.money = Math.min(ECONOMY.max, attacker.money + (spec ? spec.killReward : ECONOMY.killReward));
}

// A round pays: the winners a flat sum, the losers a bonus that grows with each loss in a row.
export function awardRoundEnd(state, winnerTeam) {
  const winnerStreakIndex = winnerTeam;
  state.economy.lossStreak[winnerStreakIndex] = 0;
  const loserTeam = winnerTeam === 0 ? 1 : 0;
  const streak = Math.min(3, state.economy.lossStreak[loserTeam]);
  const lossMoney = Math.min(ECONOMY.lossCap, ECONOMY.lossBase + streak * ECONOMY.lossStep);
  state.economy.lossStreak[loserTeam] = streak + 1;
  for (const actor of state.actors) {
    if (actor.team === winnerTeam) actor.money = Math.min(ECONOMY.max, actor.money + ECONOMY.winReward);
    else actor.money = Math.min(ECONOMY.max, actor.money + lossMoney);
  }
  return lossMoney;
}

export function awardFor(state, actorId, amount) {
  const actor = state.actors[actorId];
  if (!actor) return;
  actor.money = Math.min(ECONOMY.max, actor.money + amount);
}

// A bot's shopping list: primary if it can, armour when it can, one grenade with spare change.
export function botBuy(state, actor) {
  const random = state.random;
  const loadout = actor.loadout;
  const hasPrimary = loadout.slots.some((id) => WEAPONS[id].slot === 'primary');
  if (!hasPrimary) {
    if (actor.money >= WEAPONS.marksman.price + 300 && random() < 0.22) buy(actor, 'marksman');
    else if (actor.money >= WEAPONS.rifle.price) buy(actor, 'rifle');
    else if (actor.money >= WEAPONS.smg.price && random() < 0.6) buy(actor, 'smg');
    else if (actor.money >= WEAPONS.shotgun.price && random() < 0.35) buy(actor, 'shotgun');
    else if (actor.money >= WEAPONS.pistol.price) buy(actor, 'pistol');
  } else if (activeWeapon(loadout).killReward < 400 && random() < 0.15 && actor.money >= WEAPONS.rifle.price) {
    // A bot holding a cheap gun upgrades when it is rich.
    buy(actor, 'rifle');
  }
  const defending = actor.team !== state.attackTeam;
  if (actor.money >= GEAR.armor.price) {
    if (actor.money >= GEAR.helmet.price + 300 || random() < 0.5) buy(actor, 'helmet');
    else buy(actor, 'armor');
  }
  if (defending && actor.money >= GEAR.kit.price + 300) buy(actor, 'kit');
  const grenadeBudget = actor.money;
  if (grenadeBudget >= GRENADES.he.price + 200 && (actor.team !== state.attackTeam || random() < 0.6)) buy(actor, 'he');
  if (grenadeBudget >= GRENADES.smoke.price * 2 && random() < 0.5) buy(actor, 'smoke');
  if (actor.money > ECONOMY.botEcoBelow + 1500 && actor.loadout.grenades.he === 0) buy(actor, 'he');
}
