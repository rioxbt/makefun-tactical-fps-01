// What a fight throws off: tracers, muzzle flashes, dust, sparks, blood, smoke and the blast.
// Every piece is allocated once and recycled, so the frame loop never grows memory.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { RENDER } from './config.js';
import { makeFlashTexture, makeSmokeTexture } from './models.js';

export function createEffects(scene) {
  const random = Math.random;

  // --- tracers: one buffer of line segments, rewritten in place
  const tracerPositions = new Float32Array(RENDER.tracers * 6);
  const tracerColors = new Float32Array(RENDER.tracers * 6);
  const tracerGeometry = new THREE.BufferGeometry();
  tracerGeometry.setAttribute('position', new THREE.BufferAttribute(tracerPositions, 3));
  tracerGeometry.setAttribute('color', new THREE.BufferAttribute(tracerColors, 3));
  const tracerMesh = new THREE.LineSegments(
    tracerGeometry,
    new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9 }),
  );
  tracerMesh.frustumCulled = false;
  scene.add(tracerMesh);
  const tracers = [];
  for (let index = 0; index < RENDER.tracers; index += 1) {
    tracers.push({ life: 0, max: 0.06 + (index % 3) * 0.01, index });
  }
  let tracerCursor = 0;

  // --- muzzle flashes and puffs: sprites from two small canvases
  const flashTexture = makeFlashTexture();
  const dustTexture = makeSmokeTexture('rgba(210,196,170,0.9)');
  const sparkTexture = makeSmokeTexture('rgba(255,196,110,0.95)');
  const bloodTexture = makeSmokeTexture('rgba(150,40,30,0.9)');
  const smokeTexture = makeSmokeTexture('rgba(190,194,200,0.85)');

  const flashes = [];
  for (let index = 0; index < 16; index += 1) {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTexture, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    sprite.visible = false;
    scene.add(sprite);
    flashes.push({ sprite, life: 0, max: 0.05, size: 0.5 });
  }

  const puffs = [];
  for (let index = 0; index < RENDER.impacts + RENDER.smokePuffs; index += 1) {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: dustTexture, transparent: true, depthWrite: false }));
    sprite.visible = false;
    scene.add(sprite);
    puffs.push({ sprite, life: 0, max: 0, vx: 0, vy: 0, vz: 0, grown: 0, growth: 0, fade: 1, drag: 3 });
  }

  const blast = new THREE.Mesh(
    new THREE.SphereGeometry(1, 16, 12),
    new THREE.MeshBasicMaterial({ color: 0xffc06a, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  blast.visible = false;
  scene.add(blast);
  const blastLight = new THREE.PointLight(0xffa040, 0, 26);
  scene.add(blastLight);
  let blastLife = 0;

  function takePuff() {
    let oldest = puffs[0];
    for (let index = 1; index < puffs.length; index += 1) {
      if (puffs[index].life <= 0) return puffs[index];
      if (puffs[index].life < oldest.life) oldest = puffs[index];
    }
    return oldest.life <= 0 ? oldest : puffs[(Math.floor(random() * puffs.length))];
  }

  function spawnPuff(x, y, z, count, options) {
    for (let index = 0; index < count; index += 1) {
      const puff = takePuff();
      const spread = options.spread ?? 0.35;
      puff.sprite.material.map = options.texture;
      puff.sprite.material.opacity = options.opacity ?? 0.9;
      puff.sprite.material.color.setHex(options.color ?? 0xffffff);
      puff.sprite.visible = true;
      puff.sprite.position.set(
        x + (random() - 0.5) * spread,
        y + (random() - 0.5) * spread,
        z + (random() - 0.5) * spread,
      );
      const size = options.size ?? 0.16;
      puff.sprite.scale.setScalar(size);
      puff.life = options.life ?? 0.7;
      puff.max = puff.life;
      puff.fade = options.fade ?? 1;
      puff.grown = 0;
      puff.growth = options.growth ?? 0;
      puff.drag = options.drag ?? 3;
      puff.vx = (options.vx ?? 0) + (random() - 0.5) * (options.velocity ?? 1.4);
      puff.vy = (options.vy ?? 0.6) + random() * (options.velocity ?? 1.4) * 0.6;
      puff.vz = (options.vz ?? 0) + (random() - 0.5) * (options.velocity ?? 1.4);
    }
  }

  return {
    tracer(ax, ay, az, bx, by, bz, color) {
      const slot = tracers[tracerCursor];
      slot.life = slot.max;
      const base = slot.index * 6;
      tracerPositions[base] = ax;
      tracerPositions[base + 1] = ay;
      tracerPositions[base + 2] = az;
      tracerPositions[base + 3] = bx;
      tracerPositions[base + 4] = by;
      tracerPositions[base + 5] = bz;
      const color3 = new THREE.Color(color ?? 0xffd9a0);
      tracerColors[base] = color3.r;
      tracerColors[base + 1] = color3.g;
      tracerColors[base + 2] = color3.b;
      tracerColors[base + 3] = color3.r;
      tracerColors[base + 4] = color3.g;
      tracerColors[base + 5] = color3.b;
      tracerGeometry.attributes.position.needsUpdate = true;
      tracerGeometry.attributes.color.needsUpdate = true;
      tracerCursor = (tracerCursor + 1) % RENDER.tracers;
    },
    muzzle(x, y, z, size) {
      let slot = flashes[0];
      for (let index = 1; index < flashes.length; index += 1) {
        if (flashes[index].life <= 0) {
          slot = flashes[index];
          break;
        }
      }
      slot.life = slot.max;
      slot.size = size ?? 0.6;
      slot.sprite.visible = true;
      slot.sprite.position.set(x, y, z);
      slot.sprite.scale.setScalar(slot.size);
      slot.sprite.material.opacity = 0.95;
    },
    impact(x, y, z, normalX, normalY, normalZ, surface) {
      const metal = surface === 'steel' || surface === 'containerA' || surface === 'containerB' || surface === 'containerC' || surface === 'hazard';
      spawnPuff(x, y, z, 3, {
        texture: metal ? sparkTexture : dustTexture,
        color: metal ? 0xffd08a : 0xd8cbb0,
        size: metal ? 0.1 : 0.18,
        life: metal ? 0.22 : 0.5,
        velocity: 2.6,
        vx: normalX * 0.8,
        vy: normalY * 0.8 + 0.5,
        vz: normalZ * 0.8,
        growth: 0.5,
      });
    },
    blood(x, y, z, dirX, dirZ) {
      spawnPuff(x, y, z, 4, {
        texture: bloodTexture,
        color: 0xa83a2c,
        size: 0.14,
        life: 0.45,
        velocity: 1.8,
        vx: dirX * 1.2,
        vz: dirZ * 1.2,
        vy: 0.9,
        growth: 0.4,
      });
    },
    smoke(x, y, z) {
      for (let index = 0; index < 14; index += 1) {
        spawnPuff(x, y + 0.4 + index * 0.05, z, 1, {
          texture: smokeTexture,
          color: 0xdfe2e6,
          opacity: 0.72,
          size: 2.4,
          life: 5.4,
          spread: 3.2,
          velocity: 0.3,
          vy: 0.35,
          growth: 0.9,
          drag: 0.6,
        });
      }
    },
    explosion(x, y, z) {
      blast.visible = true;
      blast.position.set(x, y, z);
      blast.scale.setScalar(0.6);
      blast.material.opacity = 0.95;
      blastLight.position.set(x, y + 0.4, z);
      blastLight.intensity = 120;
      blastLife = 0.55;
      spawnPuff(x, y, z, 12, {
        texture: sparkTexture,
        color: 0xffb060,
        size: 0.5,
        life: 0.9,
        spread: 1.4,
        velocity: 7,
        growth: 1.2,
      });
      spawnPuff(x, y + 0.6, z, 10, {
        texture: smokeTexture,
        color: 0x7a7568,
        opacity: 0.7,
        size: 2.2,
        life: 3.4,
        spread: 2.6,
        velocity: 2.2,
        vy: 1.4,
        growth: 0.8,
      });
    },
    reset() {
      for (const tracer of tracers) tracer.life = 0;
      for (const puff of puffs) {
        puff.life = 0;
        puff.sprite.visible = false;
      }
      for (const flash of flashes) {
        flash.life = 0;
        flash.sprite.visible = false;
      }
      blast.visible = false;
      blastLight.intensity = 0;
      tracerPositions.fill(0);
      tracerGeometry.attributes.position.needsUpdate = true;
    },
    update(dt) {
      let dirty = false;
      for (let index = 0; index < tracers.length; index += 1) {
        const tracer = tracers[index];
        if (tracer.life <= 0) continue;
        tracer.life -= dt;
        if (tracer.life <= 0) {
          const base = tracer.index * 6;
          tracerPositions[base + 3] = tracerPositions[base];
          tracerPositions[base + 4] = tracerPositions[base + 1];
          tracerPositions[base + 5] = tracerPositions[base + 2];
          dirty = true;
        }
      }
      if (dirty) tracerGeometry.attributes.position.needsUpdate = true;

      for (const flash of flashes) {
        if (flash.life <= 0) continue;
        flash.life -= dt;
        if (flash.life <= 0) flash.sprite.visible = false;
        else flash.sprite.material.opacity = 0.95 * (flash.life / flash.max);
      }

      for (const puff of puffs) {
        if (puff.life <= 0) continue;
        puff.life -= dt;
        if (puff.life <= 0) {
          puff.sprite.visible = false;
          continue;
        }
        const step = Math.max(0, 1 - puff.drag * dt);
        puff.vx *= step;
        puff.vz *= step;
        puff.vy = puff.vy * step + 0.6 * dt;
        puff.sprite.position.x += puff.vx * dt;
        puff.sprite.position.y += puff.vy * dt;
        puff.sprite.position.z += puff.vz * dt;
        puff.grown += puff.growth * dt;
        puff.sprite.scale.setScalar(puff.sprite.scale.x + puff.growth * dt);
        puff.sprite.material.opacity = (puff.fade * puff.life) / puff.max;
      }

      if (blastLife > 0) {
        blastLife -= dt;
        const progress = 1 - Math.max(0, blastLife) / 0.55;
        blast.scale.setScalar(0.6 + progress * 7);
        blast.material.opacity = Math.max(0, 0.95 * (1 - progress));
        blastLight.intensity = Math.max(0, 120 * (1 - progress));
        if (blastLife <= 0) {
          blast.visible = false;
          blastLight.intensity = 0;
        }
      }
    },
  };
}

