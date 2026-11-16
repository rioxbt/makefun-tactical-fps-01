// Vantage Yard's look: a dusk freight depot. Six surfaces carry the map and one accent carves
// the objective; nothing in the scene is a borrowed texture, every colour is painted here.

export const PALETTE = {
  sky: 0x1d2735,
  horizon: 0x39424f,
  fog: 0x334052,
  asphalt: 0x434a54,
  concrete: 0x676e78,
  concreteDark: 0x4b5058,
  rust: 0x7b4a33,
  steel: 0x6d7480,
  containerA: 0x2f5d5a,
  containerB: 0x7a5a2c,
  containerC: 0x445a72,
  crate: 0x6b5636,
  sandbag: 0x6a6349,
  hazard: 0xc9972c,
  glassLit: 0xffd9a0,
  lampGlow: 0xffc46b,
  sun: 0xffb066,
  accent: 0xf0a830,
  teamAttack: 0xe8683f,
  teamDefend: 0x4f9fd8,
  ink: 0xe9e6df,
  muted: 0x99a2ac,
  blood: 0x8c2b22,
};

// Surface materials, built once by the world and reused by every box that names them.
export const SURFACES = [
  { key: 'asphalt', color: PALETTE.asphalt, roughness: 0.96, metalness: 0.02 },
  { key: 'concrete', color: PALETTE.concrete, roughness: 0.9, metalness: 0.03 },
  { key: 'concreteDark', color: PALETTE.concreteDark, roughness: 0.92, metalness: 0.03 },
  { key: 'rust', color: PALETTE.rust, roughness: 0.78, metalness: 0.25 },
  { key: 'steel', color: PALETTE.steel, roughness: 0.55, metalness: 0.6 },
  { key: 'containerA', color: PALETTE.containerA, roughness: 0.72, metalness: 0.3 },
  { key: 'containerB', color: PALETTE.containerB, roughness: 0.72, metalness: 0.3 },
  { key: 'containerC', color: PALETTE.containerC, roughness: 0.72, metalness: 0.3 },
  { key: 'crate', color: PALETTE.crate, roughness: 0.88, metalness: 0.05 },
  { key: 'sandbag', color: PALETTE.sandbag, roughness: 0.95, metalness: 0.02 },
  { key: 'hazard', color: PALETTE.hazard, roughness: 0.6, metalness: 0.2 },
  { key: 'glass', color: PALETTE.glassLit, roughness: 0.35, metalness: 0.1, emissive: PALETTE.glassLit, emissiveIntensity: 0.55 },
  { key: 'lamp', color: PALETTE.lampGlow, roughness: 0.4, metalness: 0.1, emissive: PALETTE.lampGlow, emissiveIntensity: 1.1 },
];
