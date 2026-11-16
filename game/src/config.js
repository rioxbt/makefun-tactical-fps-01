// Every number the game tunes lives here, so the simulation, the bots and the HUD read one place.
// SABLELINE: Vantage Yard — a round-based tactical FPS. Attackers (Ashfall) plant a cutting charge
// on one of two sites; defenders (Yardwatch) hold them off or defuse.

export const FIXED_STEP = 1 / 60;

const TEAM = { ATTACK: 0, DEFEND: 1 };
export const TEAM_NAME = ['Ashfall', 'Yardwatch'];

// A round: freeze, buy window, live time, then the end card. Timings in seconds.
export const TIMING = {
  freeze: 5,
  buy: 18,
  live: 115,
  roundEnd: 7,
  plant: 3.2,
  fuse: 40,
  defuse: 6,
  defuseWithKit: 3.6,
  plantWarnAt: 20,
  halfTimeAfter: 6,
  roundsToWin: 7,
  maxRounds: 12,
  bombTickFrom: 10,
};

// Money in, money out. Round wins pay flat; losses pay a growing bonus that resets on a win.
export const ECONOMY = {
  start: 800,
  max: 16000,
  killReward: 300,
  knifeReward: 1500,
  grenadeKillReward: 300,
  winReward: 3250,
  lossBase: 1400,
  lossStep: 500,
  lossCap: 3400,
  plantReward: 800,
  defuseReward: 300,
  surviveReward: 0,
  botEcoBelow: 2200,
};

// Movement: acceleration and friction (not instant velocity), crouch, walk-silence and one jump.
export const MOVEMENT = {
  runSpeed: 4.85,
  walkSpeed: 2.65,
  crouchSpeed: 2.15,
  airSpeed: 1.6,
  accelGround: 44,
  accelAir: 11,
  friction: 9.5,
  frictionCrouch: 11.5,
  stopSpeed: 1.8,
  jumpSpeed: 4.85,
  gravity: 16.2,
  stepHeight: 0.42,
  radius: 0.36,
  standHeight: 1.8,
  crouchHeight: 1.3,
  eyeStand: 1.62,
  eyeCrouch: 1.14,
  crouchRate: 7.5,
  maxFallSafe: 6.2,
  fallDamagePerSpeed: 7.5,
};

// Damage bookkeeping: where a shot lands decides the multiplier, and armor eats some of it.
export const COMBAT = {
  parts: { head: 4.0, chest: 1.0, stomach: 1.25, arm: 0.7, leg: 0.75 },
  armorAbsorb: 0.55,
  helmetAbsorb: 0.35,
  armorDurabilityPerHit: 0.5,
  minDamageFloor: 4,
};

export const OBJECTIVE = { siteRadius: 6.5, plantRange: 1.9, defuseRange: 1.6, bombArmAfter: 2.5 };

// Bots: reaction, aim error, hearing, decision cadence and how they hold ground.
export const BOTS = {
  think: 0.12,
  reactionMin: 0.17,
  reactionMax: 0.36,
  aimJitterMin: 0.0055,
  aimJitterMax: 0.017,
  jitterShrink: 0.72,
  visionFov: 100,
  visionRange: 54,
  hearingGunshot: 46,
  hearingFootsteps: 12,
  memorySeconds: 6.5,
  holdFacingJitter: 0.22,
  burstShots: 5,
  burstPauseMin: 0.22,
  burstPauseMax: 0.5,
  reloadWhenEmpty: true,
  plantPatience: 1.2,
  defusePatience: 1.0,
  strafeChance: 0.5,
  pushDistance: 26,
};

export const RENDER = {
  fov: 74,
  fovZoom: 34,
  near: 0.05,
  far: 180,
  fogNear: 22,
  fogFar: 78,
  shadowMapSize: 1024,
  maxPixelRatio: 1.5,
  tracers: 64,
  impacts: 96,
  smokePuffs: 48,
};

export const TEAM_SIZE = 5;
export const BOT_NAMES = {
  [TEAM.ATTACK]: ['Nash', 'Ovid', 'Perrin', 'Quill', 'Rask'],
  [TEAM.DEFEND]: ['Sable', 'Tarn', 'Vesper', 'Wren', 'Yarrow'],
};

export const PLAYER_NAME = 'You';
