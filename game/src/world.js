// Protocol: Breach — original map. Two bomb sites (A and B) linked by mid,
// with lanes, corners, sightlines and cover for a tactical round. Plain
// geometry only: every box is both a player collider and a bullet surface.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const materials = {};
for (const name of Object.keys(PALETTE)) {
  materials[name] = new THREE.MeshStandardMaterial({
    color: new THREE.Color(PALETTE[name]),
    roughness: name === 'accent' || name === 'ink' ? 0.55 : 0.92,
    metalness: 0.03,
  });
}

export function createWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);

  const colliders = [];
  const shootables = [];

  function box(width, height, depth, x, y, z, material) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), materials[material]);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    colliders.push(new THREE.Box3().setFromObject(mesh));
    shootables.push(mesh);
    return mesh;
  }

  // 40 x 40 m compound, 5 m walls, open to the sky for one directional light.
  box(40.4, 0.4, 40.4, 0, -0.2, 0, 'canvas');      // floor
  box(0.4, 5.0, 40.4, -20.2, 2.5, 0, 'surface');   // west
  box(0.4, 5.0, 40.4, 20.2, 2.5, 0, 'surface');    // east
  box(40.4, 5.0, 0.4, 0, 2.5, -20.2, 'surface');   // north
  box(40.4, 5.0, 0.4, 0, 2.5, 20.2, 'surface');    // south

  // Mid: long sightline, crates for cover, central pillar.
  box(1.4, 3.6, 1.4, 0, 1.8, 0, 'hairline');          // pillar
  box(3.2, 1.2, 1.2, -5.6, 0.6, -1.6, 'hairline');   // mid-west crate
  box(1.2, 1.2, 3.2, 5.6, 0.6, -1.6, 'hairline');    // mid-east crate
  box(1.8, 0.8, 1.8, -8.6, 0.4, -5.6, 'hairline');    // west low cover
  box(1.8, 0.8, 1.8, 8.6, 0.4, -5.6, 'hairline');     // east low cover
  box(2.6, 1.0, 1.0, -2.4, 0.5, 4.2, 'hairline');     // mid-north cover
  box(2.6, 1.0, 1.0, 2.4, 0.5, 4.2, 'hairline');      // mid-south cover

  // Site A (north): raised plant platform, angled cover, one entry choke.
  box(6.0, 0.6, 6.0, 0, 0.3, -15.0, 'surface');       // site A platform
  box(1.6, 1.4, 1.6, -2.0, 0.7, -15.0, 'hairline');   // A cover left
  box(1.6, 1.4, 1.6, 2.0, 0.7, -15.0, 'hairline');    // A cover right
  box(3.2, 2.2, 0.8, -4.0, 1.1, -13.0, 'hairline');   // A wall left
  box(3.2, 2.2, 0.8, 4.0, 1.1, -13.0, 'hairline');    // A wall right

  // Site B (south): open site, crates, tunnel approach.
  box(5.6, 0.6, 5.6, 0, 0.3, 15.0, 'surface');        // site B platform
  box(1.4, 1.2, 1.4, -2.2, 0.6, 15.0, 'hairline');    // B cover left
  box(1.4, 1.2, 1.4, 2.2, 0.6, 15.0, 'hairline');     // B cover right
  box(2.8, 1.8, 1.0, 0, 0.9, 12.6, 'hairline');        // B tunnel blocker

  // Spawn blockers / flank routes.
  box(1.0, 2.4, 1.0, -17.6, 1.2, -12.0, 'hairline');  // A flank crate
  box(1.0, 2.4, 1.0, 17.6, 1.2, 12.0, 'hairline');    // B flank crate

  // Lighting.
  const sky = new THREE.HemisphereLight(new THREE.Color(PALETTE.surface), new THREE.Color(PALETTE.canvas), 0.9);
  scene.add(sky);

  const key = new THREE.DirectionalLight(new THREE.Color(PALETTE.ink), 2.2);
  key.position.set(10, 16, 8);
  key.target.position.set(0, 0, -3);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -24;
  key.shadow.camera.right = 24;
  key.shadow.camera.top = 24;
  key.shadow.camera.bottom = -24;
  key.shadow.camera.far = 64;
  key.shadow.bias = -0.0006;
  scene.add(key, key.target);

  const fill = new THREE.DirectionalLight(new THREE.Color(PALETTE.muted), 0.5);
  fill.position.set(-10, 10, 10);
  scene.add(fill);

  // Bomb site plant points (world positions, on the platforms).
  const plantPoints = [
    { id: 'A', position: new THREE.Vector3(0, 0.9, -15.0), defuseTime: 5 },
    { id: 'B', position: new THREE.Vector3(0, 0.9, 15.0), defuseTime: 5 },
  ];

  return { colliders, shootables, group, plantPoints };
}
