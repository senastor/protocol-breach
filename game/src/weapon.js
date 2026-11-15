// Protocol: Breach — weapons. Two original guns (rifle + SMG), view models,
// magazines, reloads, spread that scales with movement speed, and muzzle flash.
// main.js owns the raycast; the weapon owns its numbers and state.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const RIFLE = {
  magSize: 24,
  reserve: 72,
  fireGap: 0.10,
  reloadTime: 1.8,
  spreadStill: 0.0018,
  spreadMoving: 0.022,
  moveReference: 5.2,
  muzzleTime: 0.06,
  damage: 34,
  headshotMultiplier: 3,
  recoilPitch: 0.009,
  recoilYaw: 0.004,
};

const SMG = {
  magSize: 32,
  reserve: 96,
  fireGap: 0.066,
  reloadTime: 1.5,
  spreadStill: 0.003,
  spreadMoving: 0.034,
  moveReference: 5.2,
  muzzleTime: 0.05,
  damage: 20,
  headshotMultiplier: 2.5,
  recoilPitch: 0.006,
  recoilYaw: 0.003,
};

export const WEAPONS = { rifle: RIFLE, smg: SMG };

export function createWeapon(camera, kind = 'rifle') {
  const cfg = WEAPONS[kind];

  const bodyMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.7, metalness: 0.2 });
  const accentMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.5, metalness: 0.35 });

  const model = new THREE.Group();
  const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.1, 0.42), accentMat);
  const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.045, 0.4), bodyMat);
  barrel.position.set(0, 0.025, -0.38);
  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.08, 0.22), bodyMat);
  stock.position.set(0, -0.02, 0.3);
  model.add(receiver, barrel, stock);
  model.position.set(0.24, -0.2, -0.42);
  camera.add(model);

  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.24, 0.24),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.position.set(0.24, -0.18, -0.95);
  flash.visible = false;
  camera.add(flash);

  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 5);
  flashLight.position.set(0.24, -0.16, -0.6);
  camera.add(flashLight);

  const state = { mag: cfg.magSize, reserve: cfg.reserve, cooldown: 0, reloadLeft: 0, flash: 0, kick: 0, kind };

  function step(dt) {
    state.cooldown = Math.max(0, state.cooldown - dt);
    state.flash = Math.max(0, state.flash - dt);
    state.kick += (0 - state.kick) * Math.min(1, dt * 14);
    model.position.z = -0.42 + state.kick;
    model.rotation.x = state.kick * 2.2;
    flash.visible = state.flash > 0;
    flash.rotation.z = state.flash * 30;
    flashLight.intensity = state.flash > 0 ? 18 : 0;
    if (state.reloadLeft > 0) {
      state.reloadLeft = Math.max(0, state.reloadLeft - dt);
      model.rotation.x = -0.55 * Math.min(1, (cfg.reloadTime - state.reloadLeft) * 2);
      if (state.reloadLeft === 0) {
        const need = cfg.magSize - state.mag;
        const take = Math.min(need, state.reserve);
        state.mag += take;
        state.reserve -= take;
      }
    }
  }

  return {
    state,
    step,
    kind() { return kind; },
    config() { return cfg; },
    ready() {
      return state.mag > 0 && state.cooldown === 0 && state.reloadLeft === 0;
    },
    pullTrigger() {
      state.cooldown = cfg.fireGap;
      state.flash = cfg.muzzleTime;
      state.kick = 0.055;
    },
    takeRound() {
      if (state.mag <= 0) return false;
      state.mag -= 1;
      return true;
    },
    reload() {
      if (state.reloadLeft > 0 || state.mag === cfg.magSize || state.reserve === 0) return;
      state.reloadLeft = cfg.reloadTime;
    },
    spread(speed) {
      return cfg.spreadStill + Math.min(1, speed / cfg.moveReference) * cfg.spreadMoving;
    },
    refill() {
      state.mag = cfg.magSize;
      state.reserve = cfg.reserve;
      state.cooldown = 0;
      state.reloadLeft = 0;
      state.flash = 0;
      state.kick = 0;
    },
    switchTo(nextKind) {
      const next = WEAPONS[nextKind];
      if (!next) return false;
      Object.assign(state, { kind: nextKind, mag: next.magSize, reserve: next.reserve });
      return true;
    },
  };
}
