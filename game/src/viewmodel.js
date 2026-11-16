// The gun in your hands: a model per weapon, carried in camera space with sway, a recoil kick, a
// reload that dips it out of the sightline and a zoomed shoulder when the aim is steadied.
import * as THREE from 'three';
import { buildViewmodel, makeFlashTexture } from './models.js';
import { activeWeapon } from './weapon.js';

const BASE = { x: 0.115, y: -0.13, z: -0.02 };

export function createViewmodel(camera) {
  const holder = new THREE.Group();
  holder.scale.setScalar(1.35);
  camera.add(holder);

  // A small warm key light rides with the camera so the gun always reads against the dusk.
  const key = new THREE.PointLight(0xffe6c0, 2.6, 4.5);
  key.position.set(0.32, 0.1, 0.1);
  camera.add(key);

  const models = new Map();
  function modelFor(id) {
    let entry = models.get(id);
    if (!entry) {
      const spec = activeWeapon({ slots: [id], current: 0 });
      const group = buildViewmodel(spec);
      group.visible = false;
      holder.add(group);
      const flash = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: makeFlashTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
      );
      flash.scale.setScalar(0.34);
      flash.position.set(0, -0.004, -(0.17 + spec.receiver + spec.barrel) - 0.03);
      flash.visible = false;
      group.add(flash);
      entry = { group, flash, spec, id };
      models.set(id, entry);
    }
    return entry;
  }

  let current = null;
  let swayPhase = 0;
  let flashFor = 0;
  let kick = 0;
  let kickYaw = 0;
  let reloadPhase = 0;

  return {
    holder,
    setWeapon(id) {
      if (current && current.id === id) return;
      const entry = modelFor(id);
      if (current) current.group.visible = false;
      entry.group.visible = true;
      current = entry;
      reloadPhase = 1;
    },
    // A shot: the barrel flashes and the model kicks back towards the shoulder.
    fire(strength) {
      flashFor = 0.045;
      kick = Math.min(0.09, kick + (strength ?? 0.05) * 0.9);
      kickYaw += (Math.random() - 0.5) * (strength ?? 0.05) * 0.8;
    },
    update(dt, actor, aiming, now) {
      const spec = activeWeapon(actor.loadout);
      this.setWeapon(spec.id);
      if (!current) return;
      const speed = actor.speed ?? 0;
      swayPhase += dt * (1.6 + speed * 1.5);

      kick = Math.max(0, kick - dt * 0.7);
      kickYaw *= Math.max(0, 1 - dt * 6);
      flashFor = Math.max(0, flashFor - dt);
      current.flash.visible = flashFor > 0;

      // Reload: the gun tips down and comes back up over the reload's own length.
      const reload = actor.loadout.reload;
      let dip = 0;
      if (reload) {
        const duration = Math.max(0.001, reload.duration);
        const progress = 1 - Math.max(0, reload.endsAt - now) / duration;
        reloadPhase = Math.max(0.001, Math.min(1, progress));
        dip = Math.sin(reloadPhase * Math.PI) * 0.22;
      } else if (reloadPhase < 1) {
        reloadPhase = Math.min(1, reloadPhase + dt * 4);
        dip = Math.sin((1 - reloadPhase) * Math.PI * 0.5) * 0.12;
      }

      const bobScale = Math.min(1, speed / 5.4);
      const bobX = Math.sin(swayPhase) * 0.016 * bobScale;
      const bobY = Math.abs(Math.cos(swayPhase)) * 0.014 * bobScale;
      const breathe = Math.sin(swayPhase * 0.4) * 0.004;

      const aimX = aiming ? 0.0 : BASE.x;
      const aimY = aiming ? -0.075 : BASE.y;
      const aimZ = aiming ? -0.1 : BASE.z;
      holder.position.x += (aimX + bobX - holder.position.x) * Math.min(1, dt * 9);
      holder.position.y += (aimY + bobY + breathe - dip - holder.position.y) * Math.min(1, dt * 9);
      holder.position.z += (aimZ + kick * 1.6 - holder.position.z) * Math.min(1, dt * 12);
      holder.rotation.x += (kick * 1.4 - dip * 1.8 - holder.rotation.x) * Math.min(1, dt * 12);
      holder.rotation.y += (kickYaw - holder.rotation.y) * Math.min(1, dt * 10);
      holder.rotation.z += (bobX * 1.4 - holder.rotation.z) * Math.min(1, dt * 8);
      current.group.rotation.z = Math.sin(swayPhase * 0.5) * 0.01;
    },
  };
}
