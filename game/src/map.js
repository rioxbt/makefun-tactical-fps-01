// Vantage Yard: the map as data. A dusk rail depot with two lanes and a middle, a shed over the
// centre, container row to the east and two charge sites — "Silo" west, "Depot" east. Nothing here
// imports three.js, so a plain script (tools/mapcheck.mjs) can walk the layout before it is drawn.
//
// Axes: x runs east, z runs south, y is up. A box is given by its centre (x, z), the y its bottom
// sits at and its full sizes; the ninth argument marks a piece that is drawn but never walked into.

const box = (x, y, z, w, h, d, s, tag, solid) => ({ x, y, z, w, h, d, s, tag: tag ?? 'wall', solid: solid !== false });
const pillar = (x, y, z, r, h, s, tag) => ({ x, y, z, r, h, s, tag: tag ?? 'silo', solid: true });
const decal = (x, z, w, d, s) => ({ x, y: 0.02, z, w, h: 0.06, d, s, tag: 'paint', solid: false });

export const SITES = [
  { id: 'A', name: 'Silo', x: -17, z: -6, r: 6.5 },
  { id: 'B', name: 'Depot', x: 16.5, z: 5, r: 6.5 },
];

export const MAP = {
  name: 'Vantage Yard',

  boxes: [
    // --- the yard wall: freight gates to the south, everything else shut
    box(0, 0, -29.5, 60, 7, 1, 'concreteDark', 'perimeter'),
    box(0, 0, 29.5, 60, 7, 1, 'concreteDark', 'perimeter'),
    box(-29.5, 0, 0, 1, 7, 60, 'concreteDark', 'perimeter'),
    box(29.5, 0, 0, 1, 7, 60, 'concreteDark', 'perimeter'),

    // --- Rail Alley: the long parapet that makes the west lane a corridor, crates to peek over
    box(-23, 0, 11.5, 1, 2.6, 17, 'concrete', 'alley-wall'),
    box(-27, 0, 6, 1.5, 1.5, 1.5, 'crate', 'alley-cover'),
    box(-27, 0, 15, 1.5, 1.5, 1.5, 'crate', 'alley-cover'),

    // --- Silo (A): a western apron walled on its north side, drums to fight from
    box(-20.5, 0, -12, 5, 2.7, 0.9, 'concrete', 'A-wall'),
    box(-23.5, 0, 2, 0.9, 2.7, 4, 'concrete', 'A-wall'),
    box(-11.5, 0, -11, 1.5, 1.5, 1.5, 'crate', 'A-cover'),
    box(-13, 0, -2.5, 1.5, 1.5, 1.5, 'crate', 'A-cover'),
    box(-20, 0, 2, 1.3, 2.5, 1.3, 'steel', 'A-cover'),
    box(-15, 0, 1, 3, 1.1, 0.8, 'sandbag', 'A-cover'),

    // --- the shed over the middle: a door on each end, crates and drums inside
    box(-2, 0, 5, 0.8, 4.6, 10, 'concrete', 'shed'),
    box(8, 0, 5, 0.8, 4.6, 10, 'concrete', 'shed'),
    box(0, 0, 0, 3, 4.6, 0.8, 'concrete', 'shed'),
    box(6.5, 0, 0, 3, 4.6, 0.8, 'concrete', 'shed'),
    box(-0.6, 0, 10, 2.8, 4.6, 0.8, 'concrete', 'shed'),
    box(6, 0, 10, 4, 4.6, 0.8, 'concrete', 'shed'),
    box(3, 4.6, 5, 11.6, 0.4, 10.6, 'concreteDark', 'roof', false),
    box(0.6, 0, 6.5, 1.5, 1.5, 1.5, 'crate', 'shed-cover'),
    box(5.5, 0, 3, 1.5, 1.5, 1.5, 'crate', 'shed-cover'),

    // --- middle ground: a sandbag line, two containers and the yard's gantry
    box(-8, 0, 15, 4, 1.2, 0.8, 'sandbag', 'mid-cover'),
    box(-2.5, 0, 14.5, 1.5, 1.5, 1.5, 'crate', 'mid-cover'),
    box(-9, 0, 13.5, 2.4, 2.7, 5, 'containerB', 'mid-cover'),
    box(13, 0, 16, 2.4, 2.7, 4, 'containerA', 'mid-cover'),
    box(12, 0, -3, 0.8, 1.2, 4, 'sandbag', 'mid-cover'),
    box(-6, 0, 12, 1.2, 9, 1.2, 'steel', 'gantry'),
    box(11, 0, 12, 1.2, 9, 1.2, 'steel', 'gantry'),
    box(2.5, 9, 12, 18.4, 0.8, 1.4, 'steel', 'gantry-beam', false),

    // --- Container Row: the east lane, stacked boxes with gaps to slip through
    box(21, 0, 17.5, 2.6, 2.7, 4, 'containerB', 'row'),
    box(21, 2.7, 17.5, 2.6, 2.7, 4, 'containerC', 'row'),
    box(21.5, 0, 10.5, 2.6, 2.7, 5, 'containerA', 'row'),
    box(21.5, 0, 5.5, 2.6, 2.7, 4, 'containerC', 'row'),
    box(27.2, 0, 20, 1.5, 1.5, 1.5, 'crate', 'row-cover'),
    box(27.2, 0, 7, 1.5, 1.5, 1.5, 'crate', 'row-cover'),

    // --- Depot (B): a loading dock along the north side, cover around the pad
    box(18, 0, 11.5, 12, 0.9, 3, 'concrete', 'B-dock'),
    box(18, 0, 9.9, 4, 0.45, 0.9, 'concrete', 'B-dock-step'),
    box(12.5, 0, 8.2, 0.8, 1.2, 3.4, 'sandbag', 'B-cover'),
    box(22, 0, -2.5, 5, 2.7, 2.6, 'containerA', 'B-cover'),
    box(20.5, 0, 8, 1.5, 1.5, 1.5, 'crate', 'B-cover'),

    // --- north ground: the defenders' warehouse with a door on each side, and cover around it
    box(-10, 0, -21, 1, 5, 7, 'concrete', 'D-house'),
    box(10, 0, -21, 1, 5, 7, 'concrete', 'D-house'),
    box(-5.5, 0, -24.4, 9, 5, 0.9, 'concrete', 'D-house'),
    box(5.5, 0, -24.4, 9, 5, 0.9, 'concrete', 'D-house'),
    box(-6.5, 0, -17.6, 7, 5, 0.9, 'concrete', 'D-house'),
    box(6.5, 0, -17.6, 7, 5, 0.9, 'concrete', 'D-house'),
    box(0, 5, -21, 21, 0.5, 7.4, 'concreteDark', 'roof', false),
    box(-4.4, 0, -23.6, 1.6, 1.6, 1.6, 'crate', 'D-cover'),
    box(4.4, 0, -23.6, 1.6, 1.6, 1.6, 'crate', 'D-cover'),
    box(-3.4, 0, -13, 4, 1.2, 0.7, 'sandbag', 'D-cover'),
    box(3.4, 0, -13, 4, 1.2, 0.7, 'sandbag', 'D-cover'),
    box(-18, 0, -20, 2.4, 2.7, 5, 'containerC', 'D-cover'),
    box(14, 0, -21, 2.6, 2.7, 5, 'containerB', 'D-cover'),
    box(-10, 0, -7, 1.5, 1.5, 1.5, 'crate', 'D-cover'),
    box(12.6, 0, -8.4, 1.5, 1.5, 1.5, 'crate', 'D-cover'),
    box(-13.6, 0, -16, 1.5, 1.5, 1.5, 'crate', 'D-cover'),
  ],

  pillars: [
    pillar(-24.6, 0, -10.4, 2.5, 11, 'steel', 'silo'),
    pillar(-27.4, 0, -6.5, 1.9, 11, 'steel', 'silo'),
    pillar(5.5, 0, 8.5, 0.5, 1.15, 'rust', 'drum'),
    pillar(6.4, 0, 9.2, 0.5, 1.15, 'rust', 'drum'),
    pillar(4.7, 0, 9.3, 0.5, 1.15, 'rust', 'drum'),
    pillar(-27.5, 0, 22.5, 0.35, 6.5, 'steel', 'lamp-pole'),
    pillar(27.5, 0, 22.5, 0.35, 6.5, 'steel', 'lamp-pole'),
    pillar(-27.5, 0, -16, 0.35, 6.5, 'steel', 'lamp-pole'),
    pillar(22, 0, -25.5, 0.35, 6.5, 'steel', 'lamp-pole'),
    pillar(-27.5, 0, -2, 0.3, 3.2, 'steel', 'post'),
    pillar(26.5, 0, -1, 0.3, 3.2, 'steel', 'post'),
  ],

  // One light per entry; each head is drawn as an emissive box beside its pole.
  lamps: [
    { x: -27.5, z: 22.5, height: 6.5, color: 0xffc46b, intensity: 66, distance: 34 },
    { x: 27.5, z: 22.5, height: 6.5, color: 0xffc46b, intensity: 56, distance: 30 },
    { x: -27.5, z: -16, height: 6.5, color: 0xffc98a, intensity: 64, distance: 34 },
    { x: 22, z: -25.5, height: 6.5, color: 0xffc46b, intensity: 54, distance: 30 },
  ],

  // Painted markings: the charge pads, the yard's hazard bars and the rail line through it.
  decals: [
    decal(0, 21, 44, 0.35, 'steel'),
    decal(0, 25, 44, 0.35, 'steel'),
    decal(-17, -6, 3.6, 3.6, 'hazard'),
    decal(16.5, 5, 3.6, 3.6, 'hazard'),
    decal(0, 1, 20, 0.3, 'hazard'),
    decal(0, 9.4, 20, 0.3, 'hazard'),
    decal(-23, 11.5, 0.25, 17, 'hazard'),
    decal(14, 5, 0.25, 12, 'hazard'),
    decal(-16, -5, 11, 0.25, 'hazard'),
  ],

  spawns: {
    attack: [
      { x: -6, z: 26, yaw: Math.PI },
      { x: -2, z: 26.6, yaw: Math.PI },
      { x: 2, z: 26, yaw: Math.PI },
      { x: 6, z: 26.6, yaw: Math.PI },
      { x: 0, z: 24.4, yaw: Math.PI },
    ],
    defend: [
      { x: -6, z: -26.5, yaw: 0 },
      { x: -2, z: -27, yaw: 0 },
      { x: 2, z: -26.5, yaw: 0 },
      { x: 6, z: -27, yaw: 0 },
      { x: 0, z: -25, yaw: 0 },
    ],
  },

  // The graph the bots walk: hand-placed nodes, each tagged with the ground it stands on.
  navNodes: [
    { x: -6, z: 26, tag: 'spawn-s' },       // 0
    { x: -2, z: 26, tag: 'spawn-s' },       // 1
    { x: 2, z: 26, tag: 'spawn-s' },        // 2
    { x: 6, z: 26, tag: 'spawn-s' },        // 3
    { x: -6, z: 21, tag: 'south' },         // 4
    { x: 0, z: 21, tag: 'south' },          // 5
    { x: 6, z: 21, tag: 'south' },          // 6
    { x: -12, z: 18, tag: 'west-mouth' },   // 7
    { x: 0.5, z: 16.5, tag: 'mid-south' },  // 8
    { x: 9, z: 19.5, tag: 'row-mouth' },    // 9
    { x: -25, z: 22, tag: 'alley' },        // 10
    { x: -25, z: 16, tag: 'alley' },        // 11
    { x: -25, z: 10, tag: 'alley' },        // 12
    { x: -25, z: 4, tag: 'alley' },         // 13
    { x: -25, z: -2, tag: 'alley' },        // 14
    { x: -21.5, z: -6, tag: 'A-west' },     // 15
    { x: -17, z: -1.5, tag: 'A' },          // 16
    { x: -17, z: -9.5, tag: 'A-north' },    // 17
    { x: -12.5, z: -6, tag: 'A-east' },     // 18
    { x: -16, z: 10, tag: 'mid-west' },     // 19
    { x: -9, z: 0, tag: 'mid-west' },       // 20
    { x: 2.6, z: 12.6, tag: 'shed-north' }, // 21
    { x: 3, z: 5, tag: 'shed' },            // 22
    { x: 9, z: 13, tag: 'mid-east' },       // 23
    { x: 9.4, z: 6, tag: 'mid-east' },      // 24
    { x: 10, z: -1.5, tag: 'mid-east' },    // 25
    { x: 14, z: 5, tag: 'B-west' },         // 26
    { x: 16, z: 1.5, tag: 'B' },            // 27
    { x: 17, z: 8, tag: 'B-north' },        // 28
    { x: 21.5, z: 1, tag: 'B-east' },       // 29
    { x: 25.5, z: 22, tag: 'row' },         // 30
    { x: 25.5, z: 16, tag: 'row' },         // 31
    { x: 25.5, z: 10, tag: 'row' },         // 32
    { x: 25.5, z: 3, tag: 'row' },          // 33
    { x: 25.5, z: -7, tag: 'row-north' },   // 34
    { x: -15, z: -14, tag: 'D-ground' },    // 35
    { x: -12, z: -14, tag: 'D-ground' },    // 36
    { x: -1.5, z: -15.6, tag: 'D-ground' }, // 37
    { x: 5, z: -15.6, tag: 'D-ground' },    // 38
    { x: 13, z: -14, tag: 'D-east' },       // 39
    { x: -8, z: -21, tag: 'D-house' },      // 40
    { x: 0, z: -21, tag: 'D-house' },       // 41
    { x: 8, z: -21, tag: 'D-house' },       // 42
    { x: 19, z: -8, tag: 'B-north-ground' },// 43
    { x: -6, z: -26.5, tag: 'spawn-n' },    // 44
    { x: 0, z: -26.5, tag: 'spawn-n' },     // 45
    { x: 6, z: -26.5, tag: 'spawn-n' },     // 46
    { x: -15, z: -26, tag: 'D-west' },      // 47
    { x: 17, z: -26, tag: 'D-east' },       // 48
    { x: 3, z: -2, tag: 'shed-south' },     // 49
  ],

  navEdges: [
    // south spawn and the three ways out of it
    [0, 1], [1, 2], [2, 3], [0, 4], [1, 4], [1, 5], [2, 5], [3, 6], [4, 5], [5, 6],
    [4, 7], [5, 8], [6, 9], [7, 8], [8, 9],
    // the west lane in, then A from the lane
    [7, 10], [10, 11], [11, 12], [12, 13], [13, 14], [14, 15],
    // A site
    [15, 16], [16, 17], [16, 18], [15, 17], [17, 18],
    // the middle: west corridor, the shed's two doors, then the east corridor
    [7, 19], [19, 20], [20, 18], [20, 49], [49, 22], [22, 21], [21, 23], [23, 24],
    [24, 25], [24, 26], [25, 49], [21, 9], [8, 21], [23, 9],
    // Depot and its approaches
    [25, 26], [26, 27], [26, 28], [27, 29], [43, 27], [29, 33],
    // the east lane
    [9, 30], [30, 31], [31, 32], [32, 33], [33, 34], [34, 43], [43, 48], [43, 39],
    // the defenders' ground, their house and their spawn
    [35, 36], [35, 18], [36, 37], [37, 38], [37, 41], [38, 39],
    [40, 41], [41, 42], [44, 45], [45, 46], [45, 41], [46, 48], [44, 47], [47, 35],
  ],

  // Ground each team holds: posts at both sites and in the middle, each with a look direction.
  holds: {
    defend: [
      { x: -18, z: -10.6, lookX: -13, lookZ: 0, site: 'A' },
      { x: -13, z: -6, lookX: -22, lookZ: -9, site: 'A' },
      { x: 15, z: 9, lookX: 11, lookZ: 2, site: 'B' },
      { x: 16, z: 8.6, lookX: 10, lookZ: 6, site: 'B' },
      { x: 20.5, z: 1.5, lookX: 15, lookZ: 6, site: 'B' },
      { x: 12, z: 2, lookX: 17, lookZ: -1, site: 'B' },
      { x: 1, z: 11.6, lookX: 1, lookZ: 20, site: 'mid' },
      { x: -13, z: 8, lookX: -11, lookZ: 17, site: 'mid' },
    ],
    attack: [
      { x: -22, z: -4, lookX: -14, lookZ: -8, site: 'A' },
      { x: -13, z: 0, lookX: -17, lookZ: -9, site: 'A' },
      { x: 13, z: 3.4, lookX: 18, lookZ: 7, site: 'B' },
      { x: 19, z: 1, lookX: 17, lookZ: 7, site: 'B' },
      { x: 3, z: 14, lookX: 1, lookZ: 22, site: 'mid' },
      { x: -17.5, z: 11, lookX: -20, lookZ: 20, site: 'mid' },
    ],
  },
};

// Site lookup by position: a charge may only be planted inside one of these rings.
export function siteAt(x, z) {
  for (let index = 0; index < SITES.length; index += 1) {
    const site = SITES[index];
    const dx = x - site.x;
    const dz = z - site.z;
    if (dx * dx + dz * dz <= site.r * site.r) return site;
  }
  return null;
}

export function spawnFor(team, index) {
  const list = team === 0 ? MAP.spawns.attack : MAP.spawns.defend;
  return list[index % list.length];
}
