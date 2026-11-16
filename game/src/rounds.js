// The round: freeze, buy window, live time, the charge, and how a round is won or lost. Both the
// player and the bots ask this module to plant and defuse, so the objective has one implementation.
import { ECONOMY, OBJECTIVE, TIMING } from './config.js';
import { resetActorsForRound, aliveCount, expireSmokes, pushKillfeed, pushSound } from './state.js';
import { siteAt } from './map.js';
import { resetLoadout, equipBest } from './weapon.js';
import { awardFor, awardKill, awardRoundEnd, botBuy } from './economy.js';
import { pushEffect } from './ballistics.js';

function defendTeam(state) {
  return state.attackTeam === 0 ? 1 : 0;
}

// A fresh match: money, sides, scores and the first round's freeze.
export function startMatch(state) {
  state.match.roundNumber = 1;
  state.match.scores[0] = 0;
  state.match.scores[1] = 0;
  state.match.over = false;
  state.match.winner = -1;
  state.match.history.length = 0;
  state.attackTeam = 0;
  state.economy.lossStreak[0] = 0;
  state.economy.lossStreak[1] = 0;
  for (const actor of state.actors) {
    actor.money = ECONOMY.start;
    actor.kills = 0;
    actor.deaths = 0;
    actor.survived = false;
    resetLoadout(actor.loadout, false);
  }
  startRound(state);
}

// One round begins: bodies to spawns, the shop opens, the charge goes to an attacker.
function startRound(state) {
  resetActorsForRound(state);
  state.match.phase = 'freeze';
  state.match.timer = TIMING.freeze;
  state.match.lastRoundReason = '';
  state.match.planterName = null;
  state.match.bombSite = state.random() < 0.5 ? 'A' : 'B';
  state.grenades.length = 0;
  state.smokes.length = 0;
  state.effects.length = 0;
  state.sounds.length = 0;
  state.bomb.held = true;
  state.bomb.state = 'carried';
  state.bomb.site = null;
  state.bomb.timer = 0;
  state.bomb.armTimer = 0;
  state.bomb.beepAt = 0;
  state.bomb.defuser = -1;
  state.bomb.defuseProgress = 0;
  state.bomb.plantedBy = -1;
  const attackers = state.actors.filter((actor) => actor.team === state.attackTeam);
  const carrier = attackers[Math.floor(state.random() * attackers.length)] ?? state.actors[0];
  state.bomb.carrier = carrier.id;
  state.bomb.x = carrier.position.x;
  state.bomb.y = 0.1;
  state.bomb.z = carrier.position.z;
  // Bots shop for themselves during the freeze; the human is left to the buy menu.
  for (const actor of state.actors) {
    if (actor.isPlayer) continue;
    botBuy(state, actor);
    actor.armor = actor.loadout.armor;
    actor.helmet = actor.loadout.helmet;
    equipBest(actor.loadout, state.time);
  }
  if (state.player) {
    state.player.armor = state.player.loadout.armor;
    state.player.helmet = state.player.loadout.helmet;
  }
  state.hud.buyOpen = false;
  state.hud.banner = `Round ${state.match.roundNumber} — ${state.attackTeam === state.playerTeam ? 'Ashfall' : 'Yardwatch'} attack`;
  state.hud.bannerUntil = state.time + 3;
  pushSound(state, { kind: 'roundStart' });
}

function endRound(state, winnerTeam, reason) {
  state.match.phase = 'roundEnd';
  state.match.timer = TIMING.roundEnd;
  state.match.scores[winnerTeam] += 1;
  state.match.history.push({ round: state.match.roundNumber, winner: winnerTeam, reason });
  if (winnerTeam === state.playerTeam) state.stats.roundsWon += 1;
  else state.stats.roundsLost += 1;
  for (const actor of state.actors) actor.survived = actor.alive;
  const lossBonus = awardRoundEnd(state, winnerTeam);
  state.match.lastRoundReason = reason;
  state.hud.banner = `${winnerTeam === 0 ? 'Ashfall' : 'Yardwatch'} take the round — ${reason}`;
  state.hud.bannerUntil = state.time + TIMING.roundEnd;
  pushSound(state, { kind: winnerTeam === state.playerTeam ? 'roundWin' : 'roundLose' });
  pushEffect(state, { kind: 'roundEnd', winner: winnerTeam, lossBonus });
}

function endMatch(state, winnerTeam, summary) {
  state.match.over = true;
  state.match.winner = winnerTeam;
  state.hud.matchSummary = summary;
  state.hud.banner = winnerTeam === state.playerTeam ? 'Match won' : 'Match lost';
  state.hud.bannerUntil = state.time + 30;
  pushSound(state, { kind: 'matchEnd' });
}

// The plant: only the carrier, only inside a site, only while the key is held.
export function tryPlant(state, actor, holding, dt) {
  const bomb = state.bomb;
  if (!holding || bomb.state !== 'carried' || bomb.carrier !== actor.id) return false;
  if (actor.team !== state.attackTeam || !actor.alive) return false;
  const site = siteAt(actor.position.x, actor.position.z);
  if (!site || !actor.onGround) return false;
  const before = bomb.armTimer;
  bomb.armTimer += dt;
  if (before === 0) pushSound(state, { kind: 'plantStart', x: actor.position.x, y: actor.position.y, z: actor.position.z });
  if (Math.floor(before * 3) !== Math.floor(bomb.armTimer * 3)) {
    pushSound(state, {
      kind: 'plantTick',
      progress: Math.min(1, bomb.armTimer / TIMING.plant),
      x: actor.position.x,
      y: actor.position.y,
      z: actor.position.z,
    });
  }
  if (bomb.armTimer >= TIMING.plant) {
    bomb.state = 'planted';
    bomb.site = site.id;
    bomb.timer = TIMING.fuse;
    bomb.x = actor.position.x;
    bomb.y = actor.position.y + 0.05;
    bomb.z = actor.position.z;
    bomb.plantedBy = actor.id;
    bomb.armTimer = 0;
    bomb.beepAt = state.time + 1;
    bomb.defuseProgress = 0;
    bomb.defuser = -1;
    state.match.planterName = actor.name;
    announcePlant(state);
    awardFor(state, actor.id, ECONOMY.plantReward);
    pushEffect(state, { kind: 'planted', site: site.id, x: bomb.x, y: bomb.y, z: bomb.z });
    pushSound(state, { kind: 'chargeArmed', x: bomb.x, y: bomb.y, z: bomb.z });
    return true;
  }
  return false;
}

export function canPlant(state, actor) {
  if (state.bomb.state !== 'carried' || state.bomb.carrier !== actor.id) return false;
  return Boolean(siteAt(actor.position.x, actor.position.z)) && actor.onGround;
}

// The defuse: a defender on the charge, holding the key; a cutter makes it quicker.
export function tryDefuse(state, actor, holding, dt) {
  const bomb = state.bomb;
  if (bomb.state !== 'planted') return false;
  if (actor.team === state.attackTeam || !actor.alive) return false;
  if (!canDefuse(state, actor)) return false;
  if (!holding || !actor.onGround) return false;
  const needed = actor.loadout.kit ? TIMING.defuseWithKit : TIMING.defuse;
  const before = bomb.defuseProgress;
  bomb.defuseProgress += dt;
  bomb.defuser = actor.id;
  if (Math.floor(before * 4) !== Math.floor(bomb.defuseProgress * 4)) {
    pushSound(state, {
      kind: 'defuseTick',
      progress: Math.min(1, bomb.defuseProgress / needed),
      x: bomb.x,
      y: bomb.y,
      z: bomb.z,
    });
  }
  if (bomb.defuseProgress >= needed) {
    bomb.state = 'defused';
    awardFor(state, actor.id, ECONOMY.defuseReward);
    pushEffect(state, { kind: 'defused', x: bomb.x, y: bomb.y, z: bomb.z });
    endRound(state, actor.team, `${actor.name} cut the charge`);
    return true;
  }
  return false;
}

export function canDefuse(state, actor) {
  const bomb = state.bomb;
  if (bomb.state !== 'planted' || actor.team === state.attackTeam || !actor.alive) return false;
  const dx = actor.position.x - bomb.x;
  const dz = actor.position.z - bomb.z;
  return dx * dx + dz * dz <= OBJECTIVE.defuseRange * OBJECTIVE.defuseRange;
}

export function plantProgress(state) {
  if (state.bomb.state === 'carried') return Math.min(1, state.bomb.armTimer / TIMING.plant);
  return 0;
}

export function defuseProgress(state) {
  if (state.bomb.state !== 'planted') return 0;
  const actor = state.actors[state.bomb.defuser];
  const needed = actor && actor.loadout.kit ? TIMING.defuseWithKit : TIMING.defuse;
  return Math.min(1, state.bomb.defuseProgress / needed);
}

// The bomb drops where its carrier falls and any attacker may pick it up again.
function dropBomb(state, actor) {
  state.bomb.state = 'dropped';
  state.bomb.carrier = -1;
  state.bomb.x = actor.position.x;
  state.bomb.y = 0.1;
  state.bomb.z = actor.position.z;
}

function pickupIfNear(state) {
  if (state.bomb.state !== 'dropped') return;
  for (const actor of state.actors) {
    if (!actor.alive || actor.team !== state.attackTeam) continue;
    const dx = actor.position.x - state.bomb.x;
    const dz = actor.position.z - state.bomb.z;
    if (dx * dx + dz * dz < 2.25) {
      state.bomb.state = 'carried';
      state.bomb.carrier = actor.id;
      return;
    }
  }
}

// When the charge goes down the whole yard is told, and the bots turn for the site.
function announcePlant(state) {
  const siteName = state.bomb.site === 'A' ? 'Silo' : 'Depot';
  state.hud.banner = `Charge armed at ${siteName}`;
  state.hud.bannerUntil = state.time + 4;
}

// Fight results the simulation queued: kill feed, money, dropped charge, hit marker.
function consumeResults(state) {
  if (state.results.length === 0) return;
  for (const result of state.results) {
    if (result.type === 'kill') {
      const attacker = state.actors[result.attackerId];
      const victim = state.actors[result.victimId];
      awardKill(state, result.attackerId, result.weaponId);
      if (victim && state.bomb.carrier === victim.id && state.bomb.state === 'carried') dropBomb(state, victim);
      pushKillfeed(state, {
        attackerName: attacker ? attacker.name : 'The yard',
        attackerTeam: attacker ? attacker.team : 0,
        victimName: victim ? victim.name : '',
        victimTeam: victim ? victim.team : 0,
        weapon: result.weaponId,
        headshot: result.headshot,
        at: state.time,
      });
      if (attacker && attacker.isPlayer) {
        state.stats.playerKills += 1;
        if (result.headshot) state.stats.playerHeadshots += 1;
      }
    } else if (result.type === 'hit' && result.attackerId === state.player.id) {
      state.hud.hitMarker.until = state.time + 0.12;
      state.hud.hitMarker.headshot = result.headshot;
    }
  }
  state.results.length = 0;
}

export function stepRounds(state, dt) {
  const match = state.match;
  if (match.over) return;
  consumeResults(state);
  pickupIfNear(state);
  expireSmokes(state);

  if (match.phase === 'freeze') {
    match.timer -= dt;
    if (match.timer <= 0) {
      match.phase = 'live';
      match.timer = TIMING.live;
      pushSound(state, { kind: 'go' });
    }
    return;
  }

  if (match.phase === 'live') {
    match.timer -= dt;
    state.bomb.held = state.bomb.state === 'carried';
    if (state.bomb.state === 'planted') {
      state.bomb.timer -= dt;
      if (state.time >= state.bomb.beepAt) {
        const urgency = 1 - state.bomb.timer / TIMING.fuse;
        state.bomb.beepAt = state.time + Math.max(0.18, 1 - urgency * 0.8);
        pushSound(state, {
          kind: 'bombBeep',
          urgent: state.bomb.timer < TIMING.bombTickFrom,
          x: state.bomb.x,
          y: state.bomb.y,
          z: state.bomb.z,
        });
      }
      if (state.bomb.timer <= 0) {
        pushEffect(state, { kind: 'explosion', x: state.bomb.x, y: state.bomb.y + 0.3, z: state.bomb.z });
        pushSound(state, { kind: 'explosion', x: state.bomb.x, y: state.bomb.y, z: state.bomb.z });
        endRound(state, state.attackTeam, 'the charge went off');
      }
      // With the charge down, only the fuse or a cut ends the round.
    } else if (match.timer <= 0) {
      endRound(state, defendTeam(state), 'time ran out');
    } else if (aliveCount(state, state.attackTeam) === 0) {
      endRound(state, defendTeam(state), 'the attackers were wiped out');
    } else if (aliveCount(state, defendTeam(state)) === 0) {
      endRound(state, state.attackTeam, 'the defenders were wiped out');
    }
    return;
  }

  if (match.phase === 'roundEnd') {
    match.timer -= dt;
    if (match.timer > 0) return;
    const target = TIMING.roundsToWin;
    if (match.scores[0] >= target || match.scores[1] >= target || match.roundNumber >= TIMING.maxRounds) {
      const winner = match.scores[0] === match.scores[1] ? state.playerTeam : match.scores[0] > match.scores[1] ? 0 : 1;
      endMatch(state, winner, {
        scores: [match.scores[0], match.scores[1]],
        rounds: match.roundNumber,
        playerKills: state.stats.playerKills,
        playerDeaths: state.player.deaths,
        headshots: state.stats.playerHeadshots,
      });
      return;
    }
    match.roundNumber += 1;
    if (match.roundNumber === TIMING.halfTimeAfter + 1) {
      state.attackTeam = state.attackTeam === 0 ? 1 : 0;
      for (const actor of state.actors) {
        actor.money = ECONOMY.start;
        resetLoadout(actor.loadout, false);
        actor.survived = false;
      }
      state.hud.banner = 'Sides swap — everyone starts again on $800';
      state.hud.bannerUntil = state.time + 4;
    }
    startRound(state);
  }
}
