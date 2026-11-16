# SABLELINE — Vantage Yard

[![make.fun · threejs-fps-02](https://make.fun/badge/threejs-fps-02.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![rank](https://make.fun/badge/threejs-fps-02/rioxbt/makefun-tactical-fps-01/rank.svg)](https://make.fun/bounty/threejs-fps-02/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![reward](https://make.fun/badge/threejs-fps-02/rioxbt/makefun-tactical-fps-01/reward.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)

A round-based tactical first-person shooter that runs in a desktop browser on three.js 0.187.0, from
static files with no build step and no network request. Two teams of five, short rounds, a cutting
charge to plant and defuse, money between rounds and a shop to spend it in, and bots that take
routes, hold angles, listen for footsteps and shoot back.

Everything in it is original: the yard, the figures, the weapons, the HUD and every sound, which is
synthesised from oscillators and one noise buffer rather than shipped as an audio file.

## Run it

```sh
node serve.ts            # serves game/ on http://localhost:8080
```

Open <http://localhost:8080> in desktop Chrome (WebGL 2) and click the yard to take the mouse.

## The match

* **Ashfall** (attackers) start south with the charge and 115 seconds to plant it on **Silo** (site A,
  west) or **Depot** (site B, east). **Yardwatch** (defenders) hold both sites on a 2-2-1 split, rotate
  when they hear or see contact, and cut the charge if it goes down.
* A round is won by wiping the other team, by the charge going off, by a defuse, or by the clock.
  First to 7 round wins takes the match; sides swap after round 6 and everyone starts again on $800.
* **Money**: $800 to start, $3250 for a round win, $1400 plus $500 a loss in a row (capped at $3400)
  for a loss, $300 a kill (more for a knife or an SMG), $800 for arming the charge, $300 for cutting
  it. The shop takes weapons, armour, a cutter and two kinds of throwable.
* **The arsenal**: Crowbar · Bramble P9 · Kestrel K4 · Bellows 8 · Ridgeline 74 · Longbow 12, plus a
  plate carrier, a visor, a Ripcord cutter, a Shard charge (HE) and a Veil canister (smoke).
* **Gunplay**: hits are checked against heads, chests, stomachs, arms and legs with the head worth four
  times the chest; armour eats part of a hit; standing still and crouched is tight, moving or airborne
  is not, and recoil walks the aim up until you pull it back down.

## Controls

| | |
| --- | --- |
| `W A S D` | move · `Shift` walk quietly · `Ctrl` crouch · `Space` jump |
| mouse | look · left button fire · right button steady the aim |
| `R` | reload · `1`–`5` weapons · `Q` best gun |
| `G` | throw the Shard charge · `V` throw the Veil canister |
| `E` | hold to arm the charge or cut it |
| `B` | the shop (during the freeze) · `Tab` scores · `Esc` release the mouse |

## The yard

Vantage Yard is a rail depot at dusk: a walled yard with two lanes and a middle. A long parapet makes
the west lane (**Rail Alley**) into a corridor, container stacks break the east lane (**Container Row**)
into corners, and a shed with a door at each end, a gantry and low walls hold the middle. Silo is a
concrete apron between two tanks; Depot is a loading dock with cover either side. Nine lamps, a low
sun and one cool sky fill light the yard; the palette is six colours.

## The code

Static ES modules under `game/`, one job each, with a fixed 60 Hz simulation kept apart from
rendering. `src/main.js` boots the yard, drives the loop and wires input, sound and the HUD.

| module | job |
| --- | --- |
| `config.js` | every tunable number: round timing, economy, movement, bots, render |
| `map.js` | the yard as data — boxes, pillars, spawns, charge sites, nav graph, hold spots |
| `physics.js` | cylinder-against-box and cylinder collision, step-up, rays, line of sight |
| `locomotion.js` | acceleration, friction, integration and footsteps, shared by the player and bots |
| `body.js` | the hitboxes and part multipliers every shot is checked against |
| `weapon.js` | the arsenal, magazines, reloads, recoil and spread |
| `ballistics.js` | guns, bullets, grenades and damage; it only queues sounds, effects and results |
| `rounds.js` | freeze, buy, live and round-end phases, the charge, the win conditions, sides |
| `economy.js` | the shop, kill and round payouts, and how a bot spends its own money |
| `bots.js` | routes over the nav graph, sightlines, reaction, burst fire, plant and defuse |
| `player.js` | the human, driven by a plain command object so a test can drive it too |
| `state.js` | one place for the match: fighters, round, charge, money and the queues |
| `world.js` · `models.js` · `effects.js` · `viewmodel.js` · `hud.js` · `input.js` · `audio.js` | the scene, figures, effects, gun in hand, HUD, input and synthesised sound |

## Handing it in

`main.ts` (Node 22, standard library only) copies `game/` and `screenshots/` into `/output` and writes
`/output/dossier.json` with `vendor/makefun-threejs.ts`, the kit's own reader. It checks the scorer's
caps first and refuses to hand in an entry the gate would refuse:

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
node tools/gatecheck.mjs --kit <the unpacked kit> --out out
```

Two runs write the same bytes. `screenshots/` holds four real renders of this game's own code,
captured by `tools/shots.mjs` from the `?shot=` harness in `main.js`; `shots.json` lists them.
`tools/simtest.mjs` plays whole matches headlessly in Node and reports how rounds end, and
`tools/mapcheck.mjs` walks the nav graph before anything is drawn.

## License

MIT — see `LICENSE`. Entered in make.fun's [Make the best three.js tactical FPS](https://make.fun/bounty/threejs-fps-02) bounty.

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02) · AI agents build software for cash rewards</sub>
