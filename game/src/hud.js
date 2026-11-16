// The HUD: one bind of the DOM, then text and class updates each frame. The shop, scoreboard and
// team pips are built once; the kill feed is rewritten only when it changes.
import { BUY_ITEMS, affordable, ownsItem } from './economy.js';
import { activeWeapon, currentSpread } from './weapon.js';
import { MAP, SITES } from './map.js';
import { clockText } from './util.js';
import { canDefuse, canPlant, defuseProgress, plantProgress } from './rounds.js';
import { TEAM_NAME } from './config.js';

const byId = (id) => document.getElementById(id);

export function createHud(state, options) {
  const el = {
    timer: byId('round-timer'),
    phase: byId('round-phase'),
    siteA: byId('site-A'),
    siteB: byId('site-B'),
    score: [byId('team-score-0'), byId('team-score-1')],
    pips: [byId('team-alive-0'), byId('team-alive-1')],
    names: [byId('team-name-0'), byId('team-name-1')],
    health: byId('health'),
    healthBar: byId('health-bar'),
    armor: byId('armor'),
    armorBar: byId('armor-bar'),
    gearLine: byId('gear-line'),
    ammoMag: byId('ammo-mag'),
    ammoReserve: byId('ammo-reserve'),
    ammo: byId('ammo'),
    weaponName: byId('weapon-name'),
    nadeHe: byId('nade-he'),
    nadeSmoke: byId('nade-smoke'),
    kit: byId('bow-kit'),
    money: byId('money'),
    prompt: byId('prompt'),
    crosshair: byId('crosshair'),
    hitmarker: byId('hitmarker'),
    feed: byId('feed'),
    banner: byId('banner'),
    action: byId('action'),
    actionBar: byId('action-bar'),
    actionLabel: byId('action-label'),
    message: byId('message'),
    vignette: byId('vignette'),
    overlay: byId('overlay'),
    overlayTitle: byId('overlay-title'),
    overlayCopy: byId('overlay-copy'),
    shop: byId('shop'),
    shopGrid: byId('shop-grid'),
    shopMoney: byId('shop-money'),
    board: byId('board'),
    boardTitle: byId('board-title'),
    boardBody: byId('board-body'),
    result: byId('result'),
    resultTitle: byId('result-title'),
    resultCopy: byId('result-copy'),
    resultStat: byId('result-stat'),
    radar: byId('radar'),
  };

  // --- built once: team pips, shop rows, scoreboard rows, and the radar's floor plan
  // A fresh match builds a fresh HUD, so the three lists start empty.
  el.pips[0].replaceChildren();
  el.pips[1].replaceChildren();
  el.shopGrid.replaceChildren();
  el.boardBody.replaceChildren();
  const pipCount = state.actors.filter((actor) => actor.team === 0).length;
  for (let team = 0; team < 2; team += 1) {
    el.names[team].textContent = team === state.playerTeam ? `${TEAM_NAME[team]} (you)` : TEAM_NAME[team];
    el.names[team].classList.toggle('you', team === state.playerTeam);
    for (let index = 0; index < pipCount; index += 1) {
      const pip = document.createElement('span');
      pip.className = 'pip';
      el.pips[team].appendChild(pip);
    }
  }

  const shopRows = [];
  for (const item of BUY_ITEMS) {
    const row = document.createElement('div');
    row.className = 'shop-item';
    const key = document.createElement('span');
    key.className = 'key';
    key.textContent = item.hotkey;
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = item.name;
    const price = document.createElement('span');
    price.className = 'price';
    price.textContent = `$${item.price}`;
    row.append(key, name, price);
    row.addEventListener('click', () => {
      if (options.onBuy) options.onBuy(item.key);
    });
    el.shopGrid.appendChild(row);
    shopRows.push({ item, row });
  }

  const boardRows = [];
  for (const actor of state.actors) {
    const row = document.createElement('tr');
    row.className = actor.team === 0 ? 'attack' : 'defend';
    const cells = [];
    for (let index = 0; index < 5; index += 1) {
      const cell = document.createElement('td');
      row.appendChild(cell);
      cells.push(cell);
    }
    el.boardBody.appendChild(row);
    boardRows.push({ actor, row, cells });
  }

  // The radar floor plan: the map's own boxes, drawn once into an offscreen canvas.
  const radarSize = el.radar.width;
  const radarScale = radarSize / 66;
  const floor = document.createElement('canvas');
  floor.width = radarSize;
  floor.height = radarSize;
  const floorContext = floor.getContext('2d');
  const toRadar = (x, z) => [(x + 33) * radarScale, (z + 33) * radarScale];
  floorContext.fillStyle = '#141922';
  floorContext.fillRect(0, 0, radarSize, radarSize);
  floorContext.fillStyle = '#39424e';
  for (const box of MAP.boxes) {
    if (box.solid === false) continue;
    const [px, py] = toRadar(box.x - box.w / 2, box.z - box.d / 2);
    floorContext.fillRect(px, py, box.w * radarScale, box.d * radarScale);
  }
  floorContext.fillStyle = '#59636f';
  for (const pillar of MAP.pillars) {
    const [px, py] = toRadar(pillar.x, pillar.z);
    floorContext.fillRect(px - 2, py - 2, 4, 4);
  }
  floorContext.font = '600 15px ui-monospace, monospace';
  for (const site of SITES) {
    const [px, py] = toRadar(site.x, site.z);
    floorContext.fillStyle = 'rgba(240,168,48,0.55)';
    floorContext.fillRect(px - 6, py - 6, 12, 12);
    floorContext.fillStyle = '#f0a830';
    floorContext.fillText(site.id, px - 5, py - 10);
  }
  const radarContext = el.radar.getContext('2d');
  let lastFeedHead = -1;
  let lastShopSignature = '';
  let lastBoardRound = -1;
  let resultShown = false;

  // Enemies seen recently, for the radar: knowledge, never a wall-hack.
  const seenAt = new Float32Array(state.actors.length).fill(-99);
  const seenX = new Float32Array(state.actors.length);
  const seenZ = new Float32Array(state.actors.length);

  function refreshShop() {
    const player = state.player;
    const signature = `${player.money}|${player.loadout.slots.join(',')}|${player.loadout.armor}|${player.loadout.helmet}|${player.loadout.kit}|${player.loadout.grenades.he},${player.loadout.grenades.smoke}|${state.match.phase}`;
    if (signature === lastShopSignature) return;
    lastShopSignature = signature;
    el.shopMoney.textContent = `$${player.money}`;
    for (const entry of shopRows) {
      const owned = ownsItem(player, entry.item.key);
      const can = state.match.phase === 'freeze' && affordable(player, entry.item);
      entry.row.classList.toggle('owned', owned);
      entry.row.classList.toggle('cant', !owned && !can);
    }
  }

  function refreshBoard() {
    if (lastBoardRound === state.match.roundNumber && !state.hud.scoreboard) return;
    lastBoardRound = state.match.roundNumber;
    el.boardTitle.textContent = `${MAP.name} · round ${state.match.roundNumber} · ${state.match.scores[0]}–${state.match.scores[1]}`;
    const ordered = state.actors.slice().sort((a, b) => (a.team - b.team) || (b.kills - a.kills));
    ordered.forEach((actor, index) => {
      const entry = boardRows[index];
      entry.actor = actor;
      entry.row.className = `${actor.team === 0 ? 'attack' : 'defend'}${actor.alive ? '' : ' dead'}`;
      entry.cells[0].textContent = actor.isPlayer ? `${actor.name} (you)` : actor.name;
      entry.cells[1].textContent = String(actor.kills);
      entry.cells[2].textContent = String(actor.deaths);
      entry.cells[3].textContent = `$${actor.money}`;
      entry.cells[4].textContent = activeWeapon(actor.loadout).name;
    });
  }

  function refreshFeed() {
    const feed = state.killfeed;
    if (feed.head === lastFeedHead) return;
    lastFeedHead = feed.head;
    el.feed.replaceChildren();
    for (let offset = 0; offset < feed.count; offset += 1) {
      const index = (feed.head - 1 - offset + feed.size * 2) % feed.size;
      const row = feed.items[index];
      if (!row) continue;
      const node = document.createElement('div');
      node.className = 'feed-row';
      node.style.borderLeftColor = row.attackerTeam === 0 ? 'var(--attack)' : 'var(--defend)';
      const attacker = document.createElement('span');
      attacker.className = `attacker ${row.attackerTeam === 0 ? 'attack' : 'defend'}`;
      attacker.textContent = row.attackerName;
      const weapon = document.createElement('span');
      weapon.className = 'weapon';
      weapon.textContent = row.headshot ? `${row.weapon} · head` : row.weapon;
      const victim = document.createElement('span');
      victim.className = `victim ${row.victimTeam === 0 ? 'attack' : 'defend'}`;
      victim.textContent = row.victimName;
      node.append(attacker, weapon, victim);
      el.feed.appendChild(node);
    }
  }

  function drawRadar() {
    radarContext.clearRect(0, 0, radarSize, radarSize);
    radarContext.drawImage(floor, 0, 0);
    const player = state.player;
    for (const actor of state.actors) {
      if (actor.isPlayer || actor.team === player.team) continue;
      if (actor.alive && actor.lastSeenByPlayer > 0 && state.time - actor.lastSeenByPlayer < 4) {
        seenAt[actor.id] = actor.lastSeenByPlayer;
        seenX[actor.id] = actor.position.x;
        seenZ[actor.id] = actor.position.z;
      }
    }
    radarContext.fillStyle = 'rgba(120,130,142,0.75)';
    for (const actor of state.actors) {
      if (actor.team !== player.team || !actor.alive) continue;
      const [px, py] = toRadar(actor.position.x, actor.position.z);
      radarContext.fillRect(px - 3, py - 3, 6, 6);
    }
    for (const actor of state.actors) {
      if (actor.isPlayer || actor.team === player.team) continue;
      const age = state.time - seenAt[actor.id];
      if (age > 4) continue;
      const [px, py] = toRadar(seenX[actor.id], seenZ[actor.id]);
      radarContext.fillStyle = `rgba(232,104,63,${Math.max(0.25, 1 - age / 4)})`;
      radarContext.fillRect(px - 3, py - 3, 6, 6);
    }
    if (state.bomb.state === 'planted') {
      const [px, py] = toRadar(state.bomb.x, state.bomb.z);
      radarContext.fillStyle = '#f0a830';
      radarContext.fillRect(px - 4, py - 4, 8, 8);
    }
    const [px, py] = toRadar(player.position.x, player.position.z);
    radarContext.fillStyle = '#e9e6df';
    radarContext.fillRect(px - 4, py - 4, 8, 8);
    radarContext.strokeStyle = '#e9e6df';
    radarContext.beginPath();
    radarContext.moveTo(px, py);
    radarContext.lineTo(px - Math.sin(player.yaw) * 13, py - Math.cos(player.yaw) * 13);
    radarContext.stroke();
  }

  function setOverlay(visible, title, copy) {
    el.overlay.classList.toggle('hidden', !visible);
    if (title) el.overlayTitle.textContent = title;
    if (copy) el.overlayCopy.textContent = copy;
  }

  function setShop(open) {
    el.shop.classList.toggle('hidden', !open);
    if (open) {
      lastShopSignature = '';
      refreshShop();
    }
  }

  function setBoard(open) {
    el.board.classList.toggle('hidden', !open);
    if (open) {
      lastBoardRound = -1;
      refreshBoard();
    }
  }

  function setResult(summary) {
    if (!summary) return;
    resultShown = true;
    const won = state.match.winner === state.playerTeam;
    el.result.classList.remove('hidden');
    el.resultTitle.textContent = won ? 'Match won' : 'Match lost';
    el.resultCopy.textContent = `${MAP.name} · ${summary.scores[0]}–${summary.scores[1]} over ${summary.rounds} rounds`;
    el.resultStat.replaceChildren();
    const rows = [
      ['Your kills', summary.playerKills],
      ['Your deaths', summary.playerDeaths],
      ['Headshot kills', summary.headshots],
      ['Rounds won', state.stats.roundsWon],
      ['Rounds lost', state.stats.roundsLost],
      ['Damage dealt', Math.round(state.stats.playerDamage)],
    ];
    for (const [label, value] of rows) {
      const node = document.createElement('div');
      const name = document.createElement('span');
      name.textContent = label;
      const amount = document.createElement('span');
      amount.textContent = String(value);
      node.append(name, amount);
      el.resultStat.appendChild(node);
    }
  }

  // The per-frame pass: text and classes only, no new nodes.
  function update() {
    const player = state.player;
    const match = state.match;
    el.timer.textContent = clockText(state.bomb.state === 'planted' ? state.bomb.timer : Math.max(0, match.timer));
    el.timer.style.color = state.bomb.state === 'planted' ? 'var(--amber)' : 'var(--ink)';
    el.phase.textContent = match.over
      ? 'match over'
      : state.bomb.state === 'planted'
        ? 'charge armed'
        : match.phase === 'freeze'
          ? 'freeze · buy'
          : match.phase === 'live'
            ? 'live'
            : 'round over';
    el.siteA.classList.toggle('armed', state.bomb.state === 'planted' && state.bomb.site === 'A');
    el.siteB.classList.toggle('armed', state.bomb.state === 'planted' && state.bomb.site === 'B');
    el.score[0].textContent = String(match.scores[0]);
    el.score[1].textContent = String(match.scores[1]);

    for (let team = 0; team < 2; team += 1) {
      const pips = el.pips[team].children;
      let index = 0;
      for (const actor of state.actors) {
        if (actor.team !== team) continue;
        if (index >= pips.length) break;
        pips[index].classList.toggle('on', actor.alive);
        index += 1;
      }
    }

    el.health.textContent = String(Math.max(0, Math.ceil(player.health)));
    el.healthBar.style.width = `${Math.max(0, player.health)}%`;
    el.armor.textContent = String(Math.round(player.loadout.armor));
    el.armorBar.style.width = `${Math.max(0, Math.min(100, player.loadout.armor))}%`;
    el.gearLine.textContent = `${player.loadout.helmet ? 'Visor' : 'No visor'} · ${player.loadout.kit ? 'Ripcord cutter' : 'No cutter'}`;

    const spec = activeWeapon(player.loadout);
    const knife = spec.class === 'knife';
    el.ammoMag.textContent = knife ? '—' : String(player.loadout.mag[spec.id] ?? 0);
    el.ammoReserve.textContent = knife ? '—' : String(player.loadout.reserve[spec.id] ?? 0);
    el.ammo.classList.toggle('low', !knife && (player.loadout.mag[spec.id] ?? 0) <= spec.magazine * 0.25);
    el.weaponName.textContent = spec.name;
    el.nadeHe.textContent = String(player.loadout.grenades.he ?? 0);
    el.nadeSmoke.textContent = String(player.loadout.grenades.smoke ?? 0);
    el.kit.textContent = player.loadout.kit ? 'Ripcord cutter in hand' : 'no cutter';
    el.money.textContent = `$${player.money}`;

    // The one thing E can do right now.
    let prompt = '';
    if (!player.alive) {
      const killer = state.actors[player.lastDamageFrom];
      prompt = killer ? `Killed by ${killer.name} — watching the round` : 'Waiting for the next round';
    } else if (canPlant(state, player)) prompt = 'Hold E to arm the charge';
    else if (canDefuse(state, player)) prompt = `Hold E to cut the charge (${state.bomb.defuseProgress > 0 ? 'cutting' : 'start'})`;
    else if (state.bomb.state === 'dropped' && player.team === state.attackTeam && Math.hypot(player.position.x - state.bomb.x, player.position.z - state.bomb.z) < 6) {
      prompt = 'Walk over the charge to pick it up';
    } else if (match.phase === 'freeze') prompt = 'Press B to shop';
    el.prompt.textContent = prompt;

    const spread = currentSpread(player.loadout, player.speed ?? 0, player.onGround, player.crouching) * (player.aiming ? 0.5 : 1);
    const gap = Math.max(0, Math.min(16, spread * 1900));
    el.crosshair.children[0].style.top = `${19 - gap}px`;
    el.crosshair.children[1].style.bottom = `${19 - gap}px`;
    el.crosshair.children[2].style.left = `${19 - gap}px`;
    el.crosshair.children[3].style.right = `${19 - gap}px`;
    el.crosshair.classList.toggle('hidden', !player.alive);

    const markerOn = state.hud.hitMarker.until > state.time;
    el.hitmarker.classList.toggle('on', markerOn && !state.hud.hitMarker.headshot);
    el.hitmarker.classList.toggle('head', markerOn && state.hud.hitMarker.headshot);

    el.banner.textContent = state.time < state.hud.bannerUntil ? state.hud.banner : '';
    el.message.textContent = state.time < state.hud.messageUntil ? state.hud.message : '';

    const planting = player.alive && state.bomb.armTimer > 0 && player.team === state.attackTeam;
    const cutting = state.bomb.state === 'planted' && state.bomb.defuseProgress > 0 && player.team !== state.attackTeam;
    el.action.classList.toggle('hidden', !(planting || cutting));
    if (planting) {
      el.actionLabel.textContent = 'Arming the charge';
      el.actionBar.style.width = `${(plantProgress(state) * 100).toFixed(1)}%`;
    } else if (cutting) {
      el.actionLabel.textContent = 'Cutting the charge';
      el.actionBar.style.width = `${(defuseProgress(state) * 100).toFixed(1)}%`;
    }

    const hurt = Math.max(0, 1 - (state.time - player.lastDamageTime) / 1.6);
    el.vignette.style.opacity = String(hurt * (1 - player.health / 100) * 0.9);

    refreshFeed();
    drawRadar();
    if (state.hud.buyOpen) refreshShop();
    if (state.hud.scoreboard) refreshBoard();
    if (state.hud.matchSummary && !resultShown) setResult(state.hud.matchSummary);
  }

  return { setOverlay, setShop, setBoard, setResult, refreshShop, refreshBoard, update };
}

