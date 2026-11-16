// The bodies: a low-poly figure per fighter and a viewmodel per weapon, built from the same boxes
// the shots are checked against, so a screenshot and a hit test cannot disagree.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
// The bodies are defined once, in body.js, and the meshes below are built from the same numbers.
import { HITBOXES } from './body.js';

const geometryCache = new Map();
function boxGeometry(w, h, d) {
  const key = `${w}|${h}|${d}`;
  let geometry = geometryCache.get(key);
  if (!geometry) {
    geometry = new THREE.BoxGeometry(w, h, d);
    geometryCache.set(key, geometry);
  }
  return geometry;
}

function solid(color, roughness, metalness) {
  return new THREE.MeshStandardMaterial({ color, roughness: roughness ?? 0.72, metalness: metalness ?? 0.25 });
}

// A fighter: the hitboxes of body.js, drawn in a team's colours, with a helmet and a pack on top.
// Nothing here invents a shape the shots do not know about.
export function buildCharacter(team) {
  const group = new THREE.Group();
  const coat = solid(team === 0 ? PALETTE.teamAttack : PALETTE.teamDefend, 0.66, 0.2);
  const gear = solid(0x2b2f36, 0.8, 0.15);
  const skin = solid(0x6d5644, 0.85, 0.05);
  const parts = { head: null, torso: [], arms: [], legs: [] };
  const materialFor = (part) => (part === 'head' ? skin : part === 'leg' ? gear : coat);

  for (const box of HITBOXES) {
    const width = box.maxX - box.minX;
    const height = box.maxY - box.minY;
    const depth = box.maxZ - box.minZ;
    const mesh = new THREE.Mesh(boxGeometry(width, height, depth), materialFor(box.part));
    mesh.position.set((box.minX + box.maxX) / 2, (box.minY + box.maxY) / 2, (box.minZ + box.maxZ) / 2);
    mesh.castShadow = true;
    group.add(mesh);
    if (box.part === 'head') parts.head = mesh;
    else if (box.part === 'arm') parts.arms.push(mesh);
    else if (box.part === 'leg') parts.legs.push(mesh);
    else parts.torso.push(mesh);
  }

  // A helmet over the head and a pack on the back: silhouette, not hitbox.
  const helmet = new THREE.Mesh(boxGeometry(0.28, 0.14, 0.28), gear);
  helmet.position.set(0, 1.78, 0);
  helmet.castShadow = true;
  const pack = new THREE.Mesh(boxGeometry(0.32, 0.34, 0.16), gear);
  pack.position.set(0, 1.3, 0.24);
  pack.castShadow = true;
  group.add(helmet, pack);

  // The team's colour also carries on a shoulder band, so sides read at a glance in a firefight.
  const band = new THREE.Mesh(boxGeometry(0.52, 0.06, 0.36), solid(team === 0 ? PALETTE.teamAttack : PALETTE.teamDefend, 0.5, 0.1));
  band.position.set(0, 1.46, 0);
  group.add(band);

  return { group, parts, materials: { coat, gear, skin } };
}

// The rifle a bot carries: a stubby stand-in, cheap and readable at range.
export function buildCarriedGun() {
  const group = new THREE.Group();
  const body = solid(0x2f3339, 0.6, 0.5);
  const wood = solid(0x5a4326, 0.8, 0.1);
  const frame = new THREE.Mesh(boxGeometry(0.07, 0.11, 0.72), body);
  frame.position.set(0, 1.34, 0.3);
  const stock = new THREE.Mesh(boxGeometry(0.07, 0.15, 0.26), wood);
  stock.position.set(0, 1.32, -0.1);
  const mag = new THREE.Mesh(boxGeometry(0.06, 0.2, 0.1), body);
  mag.position.set(0, 1.19, 0.28);
  group.add(frame, stock, mag);
  return group;
}

// The first-person weapon: a rifle silhouette built from the weapon's own numbers, so a marksman
// reads as a long rifle, an SMG as a stubby one and a pistol as a pistol. Every part is a box, the
// same vocabulary as the map, and every material is lighter than the world so it reads at dusk.
export function buildViewmodel(spec) {
  const group = new THREE.Group();
  const body = solid(0x6d7681, 0.44, 0.62);
  const grit = solid(0x3b424a, 0.56, 0.52);
  const wood = solid(0x8f6a3a, 0.7, 0.12);
  const trim = solid(0xc08a34, 0.38, 0.7);
  const glass = new THREE.MeshBasicMaterial({ color: 0x9fd8ff });
  const glove = solid(0x5c646e, 0.78, 0.08);

  const isPistol = spec.class === 'pistol';
  const isKnife = spec.class === 'knife';
  const long = spec.barrel;
  const receiverLength = isPistol ? 0.16 : spec.receiver;

  // The receiver runs forward from the shoulder; the barrel leaves its far end.
  const receiver = new THREE.Mesh(boxGeometry(0.062, 0.075, receiverLength), body);
  receiver.position.set(0, -0.012, -0.30 - receiverLength * 0.5 + 0.13);
  const rail = new THREE.Mesh(boxGeometry(0.022, 0.018, receiverLength * 0.72), trim);
  rail.position.set(0, 0.032, receiver.position.z);
  group.add(receiver, rail);

  const barrel = new THREE.Mesh(boxGeometry(0.03, 0.03, long), grit);
  barrel.position.set(0, -0.004, receiver.position.z - receiverLength / 2 - long / 2);
  group.add(barrel);
  if (!isPistol && !isKnife) {
    const brake = new THREE.Mesh(boxGeometry(0.042, 0.042, 0.05), grit);
    brake.position.set(0, -0.004, barrel.position.z - long / 2 - 0.02);
    group.add(brake);
    const handguard = new THREE.Mesh(boxGeometry(0.05, 0.05, Math.max(0.14, long * 0.6)), spec.class === 'rifle' || spec.class === 'marksman' ? wood : grit);
    handguard.position.set(0, -0.006, barrel.position.z + long * 0.22);
    group.add(handguard);
  }

  // Stock, grip and magazine: what tells one weapon class from another at a glance.
  if (isPistol) {
    const grip = new THREE.Mesh(boxGeometry(0.05, 0.13, 0.06), grit);
    grip.position.set(0, -0.11, -0.24);
    grip.rotation.x = 0.22;
    const mag = new THREE.Mesh(boxGeometry(0.042, 0.1, 0.05), grit);
    mag.position.set(0, -0.14, -0.3);
    mag.rotation.x = 0.18;
    const slide = new THREE.Mesh(boxGeometry(0.05, 0.05, 0.2), body);
    slide.position.set(0, 0.01, -0.36);
    group.add(grip, mag, slide);
  } else if (!isKnife) {
    const stock = new THREE.Mesh(boxGeometry(0.052, 0.1, 0.24), spec.class === 'rifle' || spec.class === 'marksman' ? wood : grit);
    stock.position.set(0, -0.045, -0.16);
    const cheek = new THREE.Mesh(boxGeometry(0.05, 0.04, 0.16), grit);
    cheek.position.set(0, 0.01, -0.18);
    const grip = new THREE.Mesh(boxGeometry(0.045, 0.13, 0.06), grit);
    grip.position.set(0, -0.12, -0.2);
    grip.rotation.x = -0.25;
    const magazine = new THREE.Mesh(boxGeometry(0.05, Math.min(0.2, spec.magazine * 0.006 + 0.06), 0.08), grit);
    magazine.position.set(0, -0.1 - Math.min(0.1, spec.magazine * 0.003), -0.34);
    magazine.rotation.x = 0.16;
    group.add(stock, cheek, grip, magazine);
    if (spec.zoom > 1.4) {
      const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.033, 0.033, 0.26, 12), grit);
      scope.rotation.x = Math.PI / 2;
      scope.position.set(0, 0.055, -0.34);
      const lens = new THREE.Mesh(new THREE.CircleGeometry(0.028, 14), glass);
      lens.position.set(0, 0.055, -0.47);
      group.add(scope, lens);
    } else {
      const sight = new THREE.Mesh(boxGeometry(0.018, 0.04, 0.02), grit);
      sight.position.set(0, 0.055, barrel.position.z - long * 0.35);
      group.add(sight);
    }
  } else {
    const grip = new THREE.Mesh(boxGeometry(0.04, 0.12, 0.05), grit);
    grip.position.set(0, -0.1, -0.24);
    group.add(grip);
  }

  // Hands: a glove on the foregrip, a glove and a sleeve behind it.
  const hands = new THREE.Group();
  const front = new THREE.Mesh(boxGeometry(0.075, 0.075, 0.11), glove);
  front.position.set(0.004, -0.045, isPistol ? -0.3 : barrel.position.z + long * 0.16);
  const rear = new THREE.Mesh(boxGeometry(0.075, 0.095, 0.11), glove);
  rear.position.set(-0.004, -0.135, -0.2);
  const forearm = new THREE.Mesh(boxGeometry(0.07, 0.08, 0.34), solid(0x3d434b, 0.85, 0.06));
  forearm.position.set(-0.02, -0.19, 0.02);
  hands.add(front, rear, forearm);
  group.add(hands);

  return group;
}

// Thrown grenades: a small can with a lever, one shape per kind.
export function buildGrenade(kind) {
  const group = new THREE.Group();
  const metal = solid(kind === 'he' ? 0x4a4f3c : 0x53585f, 0.62, 0.5);
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.12, 10), metal);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.04, 8), solid(0x8a8f96, 0.4, 0.7));
  cap.position.y = 0.075;
  const lever = new THREE.Mesh(boxGeometry(0.012, 0.09, 0.03), solid(0x9a9f7a, 0.5, 0.6));
  lever.position.set(0.028, 0.06, 0);
  group.add(body, cap, lever);
  return group;
}

// A muzzle flash quad and the world-space tracer origin of a viewmodel.
export function makeFlashTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const context = canvas.getContext('2d');
  const gradient = context.createRadialGradient(32, 32, 2, 32, 32, 30);
  gradient.addColorStop(0, 'rgba(255,236,190,1)');
  gradient.addColorStop(0.35, 'rgba(255,178,80,0.75)');
  gradient.addColorStop(1, 'rgba(255,120,20,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 64, 64);
  const texture = new THREE.CanvasTexture(canvas);
  return texture;
}

export function makeSmokeTexture(color) {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const context = canvas.getContext('2d');
  const gradient = context.createRadialGradient(32, 32, 4, 32, 32, 32);
  gradient.addColorStop(0, color);
  gradient.addColorStop(0.6, color.replace(/[\d.]+\)$/, '0.45)'));
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(canvas);
}

export { boxGeometry };
