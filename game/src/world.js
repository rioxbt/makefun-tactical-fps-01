// The yard itself: the map data turned into a lit scene with one instanced draw call per surface,
// plus the collision and ray queries every fight goes through.
import * as THREE from 'three';
import { PALETTE, SURFACES } from './palette.js';
import { buildColliders, raycast, hasLineOfSight, supportHeight, blockedAt } from './physics.js';
import { RENDER } from './config.js';

function skyTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 8;
  canvas.height = 256;
  const context = canvas.getContext('2d');
  const gradient = context.createLinearGradient(0, 0, 0, 256);
  gradient.addColorStop(0, '#0f1520');
  gradient.addColorStop(0.42, '#1d2735');
  gradient.addColorStop(0.62, '#3b3f4a');
  gradient.addColorStop(0.78, '#6b5a4a');
  gradient.addColorStop(1, '#2a2f36');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 8, 256);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function createWorld(scene, map) {
  const colliders = buildColliders(map);
  const group = new THREE.Group();
  scene.add(group);

  const materials = new Map();
  for (const surface of SURFACES) {
    const spec = {
      color: surface.color,
      roughness: surface.roughness,
      metalness: surface.metalness,
    };
    if (surface.emissive) {
      spec.emissive = surface.emissive;
      spec.emissiveIntensity = surface.emissiveIntensity;
    }
    materials.set(surface.key, new THREE.MeshStandardMaterial(spec));
  }

  // One instanced mesh per surface for the walls and boxes of the yard.
  const bySurface = new Map();
  for (const item of map.boxes) {
    const key = item.s ?? 'concrete';
    if (!bySurface.has(key)) bySurface.set(key, []);
    bySurface.get(key).push(item);
  }
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();

  for (const [key, items] of bySurface) {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const mesh = new THREE.InstancedMesh(geometry, materials.get(key) ?? materials.get('concrete'), items.length);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    items.forEach((item, index) => {
      position.set(item.x, item.y + item.h / 2, item.z);
      scale.set(item.w, item.h, item.d);
      matrix.compose(position, quaternion, scale);
      mesh.setMatrixAt(index, matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    group.add(mesh);
  }

  // Silos, drums and lamp poles: vertical cylinders, one instanced mesh per surface.
  const pillarsBySurface = new Map();
  for (const item of map.pillars) {
    const key = item.s ?? 'steel';
    if (!pillarsBySurface.has(key)) pillarsBySurface.set(key, []);
    pillarsBySurface.get(key).push(item);
  }
  for (const [key, items] of pillarsBySurface) {
    const geometry = new THREE.CylinderGeometry(1, 1, 1, 14, 1, false);
    const mesh = new THREE.InstancedMesh(geometry, materials.get(key) ?? materials.get('steel'), items.length);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    items.forEach((item, index) => {
      position.set(item.x, item.y + item.h / 2, item.z);
      scale.set(item.r, item.h, item.r);
      matrix.compose(position, quaternion, scale);
      mesh.setMatrixAt(index, matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    group.add(mesh);
  }

  // Painted markings, a few millimetres above the ground.
  const decalsBySurface = new Map();
  for (const item of map.decals) {
    const key = item.s ?? 'hazard';
    if (!decalsBySurface.has(key)) decalsBySurface.set(key, []);
    decalsBySurface.get(key).push(item);
  }
  for (const [key, items] of decalsBySurface) {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const mesh = new THREE.InstancedMesh(geometry, materials.get(key) ?? materials.get('hazard'), items.length);
    mesh.receiveShadow = true;
    items.forEach((item, index) => {
      position.set(item.x, item.y, item.z);
      scale.set(item.w, item.h, item.d);
      matrix.compose(position, quaternion, scale);
      mesh.setMatrixAt(index, matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    group.add(mesh);
  }

  // The ground and the dome of dusk sky over it.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(64, 64),
    new THREE.MeshStandardMaterial({ color: PALETTE.asphalt, roughness: 0.97, metalness: 0.02 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = 0.002;
  ground.receiveShadow = true;
  group.add(ground);

  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(150, 24, 16),
    new THREE.MeshBasicMaterial({ map: skyTexture(), side: THREE.BackSide, fog: false }),
  );
  group.add(sky);

  // Lighting: a low sun, a cool sky fill and one warm lamp over each corner of the yard.
  const hemisphere = new THREE.HemisphereLight(0x6b81a6, 0x474d56, 1.7);
  scene.add(hemisphere);

  const sun = new THREE.DirectionalLight(PALETTE.sun, 2.1);
  sun.position.set(28, 34, -22);
  sun.castShadow = true;
  sun.shadow.mapSize.set(RENDER.shadowMapSize, RENDER.shadowMapSize);
  sun.shadow.camera.left = -34;
  sun.shadow.camera.right = 34;
  sun.shadow.camera.top = 34;
  sun.shadow.camera.bottom = -34;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 90;
  sun.shadow.bias = -0.0016;
  scene.add(sun);
  scene.add(sun.target);

  // A cool bounce from the sky, so the shadow side of a container still reads.
  const fill = new THREE.DirectionalLight(0xa8bedd, 0.7);
  fill.position.set(-22, 18, 26);
  scene.add(fill);

  const lampHeads = [];
  const lampLights = [];
  const lampGeometry = new THREE.BoxGeometry(0.6, 0.22, 0.5);
  for (const lamp of map.lamps) {
    const head = new THREE.Mesh(lampGeometry, materials.get('lamp'));
    head.position.set(lamp.x, lamp.height, lamp.z);
    group.add(head);
    const light = new THREE.PointLight(lamp.color, lamp.intensity, lamp.distance);
    light.position.set(lamp.x, lamp.height - 0.3, lamp.z);
    scene.add(light);
    lampHeads.push(head);
    lampLights.push(light);
  }

  scene.fog = new THREE.Fog(new THREE.Color(PALETTE.fog), RENDER.fogNear, RENDER.fogFar + 20);
  scene.background = new THREE.Color(PALETTE.sky);

  let flicker = 0;
  return {
    colliders,
    group,
    materials,
    get object() {
      return group;
    },
    // A lamp dims and steadies again, so the yard never looks frozen.
    update(dt) {
      flicker += dt;
      for (let index = 0; index < lampLights.length; index += 1) {
        const base = map.lamps[index].intensity;
        const wobble = Math.sin(flicker * 6.2 + index * 1.7) * 0.03 + Math.sin(flicker * 17.3 + index) * 0.02;
        lampLights[index].intensity = base * (1 + wobble);
      }
    },
    ray(ox, oy, oz, dx, dy, dz, maxDistance) {
      return raycast(colliders, ox, oy, oz, dx, dy, dz, maxDistance);
    },
    lineOfSight(ax, ay, az, bx, by, bz) {
      return hasLineOfSight(colliders, ax, ay, az, bx, by, bz);
    },
    groundAt(x, z, radius, feetY, stepHeight) {
      return supportHeight(colliders, x, z, radius, feetY, stepHeight);
    },
    blockedAt(x, y, z, radius, height) {
      return blockedAt(colliders, x, y, z, radius, height);
    },
  };
}
