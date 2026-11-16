// The screenshot harness: ?shot=<name>&seed=<n> sets up one deterministic moment of the game and
// freezes it, so tools/shots.mjs can photograph what the game's own code puts on screen. It is
// loaded only when a shot is asked for, which is why the game does not carry it in its hot path.
import { FIXED_STEP, TIMING } from './config.js';
import { startMatch, tryPlant } from './rounds.js';
import { equipSlot, give } from './weapon.js';

// Deterministic placement helpers: a shot must land in the same place on every run.
function place(actor, x, z, yaw, pitch) {
  actor.position.x = x;
  actor.position.y = 0;
  actor.position.z = z;
  actor.velocity.x = 0;
  actor.velocity.y = 0;
  actor.velocity.z = 0;
  actor.yaw = yaw ?? actor.yaw;
  actor.pitch = pitch ?? 0;
}

function facePoint(actor, x, z) {
  actor.yaw = Math.atan2(-(x - actor.position.x), -(z - actor.position.z));
}

// One moment per name: the game is played into position, then left frozen for the capture.
export function runShot(name, ctx) {
  const { state, hud, commands, settle } = ctx;
  void commands;
  hud.setOverlay(false);
  startMatch(state);
  state.match.phase = 'live';
  state.match.timer = 92;
  state.match.scores[0] = 3;
  state.match.scores[1] = 2;
  const player = state.player;

  if (name === 'shop') {
    state.match.phase = 'freeze';
    state.match.timer = 15;
    player.money = 5250;
    player.loadout.armor = 100;
    player.loadout.helmet = true;
    player.armor = 100;
    hud.setShop(true);
    state.hud.buyOpen = true;
    settle(0.3);
    hud.update();
    return;
  }

  if (name === 'silo') {
    give(player.loadout, 'rifle');
    equipSlot(player.loadout, player.loadout.slots.indexOf('rifle'), state.time);
    player.loadout.armor = 100;
    player.armor = 100;
    player.money = 3200;
    player.kills = 1;
    place(player, -17, 1.4, Math.PI, -0.02);
    const enemies = [
      [-19.5, -8.4], [-14.2, -7.6], [-21.6, -5.2],
    ];
    let index = 6;
    for (const [x, z] of enemies) {
      const actor = state.actors[index];
      place(actor, x, z, 0, 0);
      facePoint(actor, player.position.x, player.position.z);
      give(actor.loadout, 'rifle');
      actor.loadout.armor = 100;
      actor.armor = 100;
      // Held for the capture: they have taken the site and are looking this way, not firing yet.
      actor.brain.thinkTimer = 1e6;
      actor.brain.targetId = -1;
      index += 1;
    }
    place(state.actors[1], -20.4, 2.6, Math.PI * 0.9, 0);
    place(state.actors[2], -13.6, 3.2, Math.PI * 1.1, 0);
    settle(0.9);
    // A kill first, so the feed shows a real one, then the frame itself: firing at the far post.
    facePoint(player, -21.6, -5.2);
    player.pitch = -0.02;
    commands.fire = true;
    settle(0.75);
    commands.fire = false;
    const killed = state.actors[8];
    killed.health = 100;
    killed.alive = true;
    killed.loadout.armor = 0;
    facePoint(player, -19.5, -8.4);
    player.pitch = -0.012;
    commands.fire = true;
    settle(0.16);
    commands.fire = false;
    player.health = 100;
    player.alive = true;
    settle(0.015);
    hud.update();
    return;
  }

  if (name === 'depot') {
    state.attackTeam = 1;
    give(player.loadout, 'smg');
    equipSlot(player.loadout, player.loadout.slots.indexOf('smg'), state.time);
    player.loadout.kit = true;
    player.loadout.armor = 100;
    player.helmet = false;
    player.money = 2400;
    const carrier = state.actors[7];
    state.bomb.carrier = carrier.id;
    place(carrier, 17.4, 4.2, Math.PI, 0);
    settle(0.2);
    // The charge is armed by the bot, then the player crouches in to cut it.
    for (let step = 0; step < Math.round((TIMING.plant + 0.2) / FIXED_STEP); step += 1) {
      tryPlant(state, carrier, true, FIXED_STEP);
      settle(FIXED_STEP);
    }
    place(player, 16.2, 6.2, Math.PI * 1.2, -0.12);
    facePoint(player, state.bomb.x, state.bomb.z);
    player.crouching = true;
    player.crouch = 1;
    commands.use = true;
    settle(1.6);
    commands.use = false;
    settle(0.05);
    player.crouch = 0.6;
    hud.update();
    return;
  }

  // 'scores': the board over a live round.
  give(player.loadout, 'rifle');
  equipSlot(player.loadout, player.loadout.slots.indexOf('rifle'), state.time);
  player.loadout.armor = 100;
  player.armor = 100;
  player.money = 4150;
  player.kills = 6;
  player.deaths = 2;
  place(player, -1.5, 13.4, Math.PI, -0.02);
  const spreads = [
    [5, 3, 1, 2650], [2, 4, 3, 5400], [3, 5, 2, 1900],
    [7, 1, 5, 7200], [4, 2, 4, 3300], [1, 6, 3, 2750],
    [2, 2, 5, 6100], [3, 1, 6, 4400], [0, 4, 4, 1500],
  ];
  let slot = 0;
  for (const actor of state.actors) {
    if (actor.isPlayer) continue;
    const [kills, deaths, kills2, money] = spreads[slot % spreads.length];
    actor.kills = kills + (kills2 % 2);
    actor.deaths = deaths;
    actor.money = money;
    const spec = ['rifle', 'smg', 'shotgun', 'marksman'][slot % 4];
    give(actor.loadout, spec);
    equipSlot(actor.loadout, actor.loadout.slots.indexOf(spec), state.time);
    place(actor, -8 + slot * 2.2, 6 + (slot % 3) * 1.6, 0, 0);
    facePoint(actor, 1, 18);
    slot += 1;
  }
  settle(0.4);
  state.hud.scoreboard = true;
  hud.setBoard(true);
  hud.update();
}


