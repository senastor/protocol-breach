// Protocol: Breach — grenade. A thrown frag with a 2.5 s fuse, arc physics and
// a damage radius. Head-on: a cooked toss that bounces once and clears a corner.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const FUSE = 2.5;
const SPEED = 16;
const BOUNCE = 0.35;
const RADIUS = 0.14;
const DAMAGE_RADIUS = 7;
const MAX_DAMAGE = 60;

const geometry = new THREE.SphereGeometry(RADIUS, 8, 6);
const material = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), roughness: 0.4, metalness: 0.8 });

export function createGrenadeSystem(scene, colliders) {
  const grenades = [];
  const temp = new THREE.Vector3();

  function spawn(origin, direction, by) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.copy(origin);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    grenades.push({
      mesh,
      position: origin.clone(),
      velocity: direction.clone().multiplyScalar(SPEED),
      fuse: FUSE,
      alive: true,
      by,
      bounced: false,
    });
  }

  function step(dt, damageEntity) {
    for (let i = grenades.length - 1; i >= 0; i -= 1) {
      const g = grenades[i];
      if (!g.alive) continue;
      g.fuse -= dt;
      if (g.fuse <= 0) {
        g.alive = false;
        scene.remove(g.mesh);
        const center = g.position;
        damageEntity(center, DAMAGE_RADIUS, MAX_DAMAGE, 'grenade');
        grenades.splice(i, 1);
        continue;
      }
      // arc: gravity pulls down
      g.velocity.y -= 20 * dt;
      const next = g.position.clone().add(g.velocity.clone().multiplyScalar(dt));
      // floor
      if (next.y < RADIUS) {
        next.y = RADIUS;
        g.velocity.y = -g.velocity.y * BOUNCE;
        g.bounced = true;
        if (Math.abs(g.velocity.y) < 0.4) g.velocity.y = 0;
      }
      // colliders: bounce off walls
      let stopped = false;
      for (const c of colliders) {
        const box = c;
        const closest = temp.copy(next).clamp(box.min, box.max);
        const dist = next.distanceTo(closest);
        if (dist < RADIUS) {
          const normal = next.clone().sub(closest).normalize();
          if (normal.lengthSq() === 0) normal.set(0, 1, 0);
          g.velocity.reflect(normal).multiplyScalar(BOUNCE);
          g.position.copy(closest).add(normal.multiplyScalar(RADIUS + 0.01));
          stopped = true;
          break;
        }
      }
      if (!stopped) g.position.copy(next);
      g.mesh.position.copy(g.position);
    }
  }

  return {
    spawn,
    step,
    active() {
      return grenades.filter((g) => g.alive);
    },
    clear() {
      for (const g of grenades) scene.remove(g.mesh);
      grenades.length = 0;
    },
  };
}
