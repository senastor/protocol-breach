// Protocol: Breach — enemy bots. Each bot patrols a route, holds a position,
// sees the player by line of sight, shoots back with spread and recoil, takes
// damage (headshots hurt more), and flees grenades. Bots are on the defending
// team; the player is on the attacking team. Bots do not carry view models —
// only weapon numbers and a raycast shot.
import * as THREE from 'three';
import { WEAPONS } from './weapon.js';

const BOT_SPEED = 3.4;
const BOT_SEE = 45;
const BOT_HEAR = 14;
const BOT_FOV = Math.cos((110 / 2) * (Math.PI / 180));
const BOT_REACT = 0.35;
const BOT_BURST = 3;
const BOT_BURST_GAP = 0.14;
const BOT_HEALTH = 100;

const tmp = new THREE.Vector3();
const tmpDir = new THREE.Vector3();

export function createEnemies(scene, world, playerPosition, damagePlayer) {
  const enemies = [];
  const raycaster = new THREE.Raycaster();
  raycaster.far = BOT_SEE;

  const ROUTES = [
    [-6, 0, -10], [-2, 0, -10], [2, 0, -10], [6, 0, -10],
    [-6, 0, 10], [-2, 0, 10], [2, 0, 10], [6, 0, 10],
    [-14, 0, -14], [-14, 0, -6], [-14, 0, 2],
    [14, 0, 14], [14, 0, 6], [14, 0, -2],
    [0, 0, -15], [0, 0, 15],
  ];

  function makeEnemy(index) {
    const route = ROUTES[index % ROUTES.length];
    const start = new THREE.Vector3(route[0], 0, route[2]);
    const mesh = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.34, 1.0, 4, 8),
      new THREE.MeshStandardMaterial({ color: new THREE.Color('#ff4d4d'), roughness: 0.6, metalness: 0.1 })
    );
    mesh.position.copy(start);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);

    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 12, 10),
      new THREE.MeshStandardMaterial({ color: new THREE.Color('#ffd93d'), roughness: 0.4, metalness: 0.1 })
    );
    head.position.y = 1.45;
    mesh.add(head);

    const cfg = index % 2 === 0 ? WEAPONS.rifle : WEAPONS.smg;

    return {
      mesh,
      position: start.clone(),
      yaw: 0,
      pitch: 0,
      health: BOT_HEALTH,
      alive: true,
      routeIndex: 0,
      route,
      state: 'patrol',
      alertPos: null,
      alertTime: 0,
      reactTimer: 0,
      burstLeft: 0,
      burstTimer: 0,
      lastShotTime: -99,
      hearTimer: 0,
      cfg,
    };
  }

  for (let i = 0; i < ROUTES.length; i += 1) enemies.push(makeEnemy(i));

  function getEyePosition(enemy) {
    return new THREE.Vector3(enemy.position.x, enemy.position.y + 1.45, enemy.position.z);
  }

  function lookAtPoint(enemy, x, y, z) {
    const dx = x - enemy.position.x;
    const dz = z - enemy.position.z;
    enemy.yaw = Math.atan2(-dx, -dz);
    const dy = y - (enemy.position.y + 1.45);
    const dist = Math.hypot(dx, dy, dz) || 1;
    enemy.pitch = Math.max(-1.45, Math.min(1.45, Math.asin(Math.max(-1, Math.min(1, dy / dist)))));
  }

  function canSee(enemy, targetPos) {
    const eye = getEyePosition(enemy);
    tmpDir.subVectors(targetPos, eye);
    const dist = tmpDir.length();
    if (dist > BOT_SEE) return false;
    tmpDir.normalize();
    const forward = new THREE.Vector3(-Math.sin(enemy.yaw), 0, -Math.cos(enemy.yaw));
    if (forward.dot(tmpDir) < BOT_FOV) return false;
    raycaster.set(eye, tmpDir);
    const hits = raycaster.intersectObjects(world.shootables, false);
    const wallHit = hits.find((h) => h.distance < dist - 0.2);
    return !wallHit;
  }

  function damageEnemy(enemy, amount) {
    if (!enemy.alive) return false;
    enemy.health -= amount;
    if (enemy.health <= 0) {
      enemy.alive = false;
      enemy.mesh.visible = false;
      return true;
    }
    return false;
  }

  function rayHitsPlayer(origin, direction) {
    const boxMin = new THREE.Vector3(playerPosition.x - 0.34, playerPosition.y, playerPosition.z - 0.34);
    const boxMax = new THREE.Vector3(playerPosition.x + 0.34, playerPosition.y + 1.72, playerPosition.z + 0.34);
    let tmin = -Infinity;
    let tmax = Infinity;
    for (let a = 0; a < 3; a++) {
      const comp = (c) => c[a];
      const invD = 1 / (comp(direction) || 0.0001);
      let t1 = (comp(boxMin) - comp(origin)) * invD;
      let t2 = (comp(boxMax) - comp(origin)) * invD;
      if (invD < 0) { const t = t1; t1 = t2; t2 = t; }
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return null;
    }
    const hitPoint = origin.clone().add(direction.clone().multiplyScalar(tmin));
    const headY = playerPosition.y + 1.45;
    const isHead = Math.abs(hitPoint.y - headY) < 0.35;
    return { hitPoint, isHead, t: tmin };
  }

  function step(dt, grenades) {
    const playerPos = playerPosition;
    for (const enemy of enemies) {
      if (!enemy.alive) continue;

      // Grenade reaction: flee.
      let fleePos = null;
      for (const g of grenades) {
        if (!g.alive) continue;
        if (g.position.distanceTo(enemy.position) < BOT_HEAR + 3) {
          fleePos = g.position;
          break;
        }
      }

      if (fleePos) {
        enemy.state = 'fleeing';
        enemy.hearTimer = 1.5;
        const away = enemy.position.clone().sub(fleePos).normalize();
        const target = enemy.position.clone().add(away.multiplyScalar(6));
        moveToward(enemy, target, dt);
        lookAtPoint(enemy, playerPos.x, playerPos.y + 1.6, playerPos.z);
        continue;
      }

      const playerDist = enemy.position.distanceTo(playerPos);
      const sees = canSee(enemy, playerPos);

      if (sees) {
        enemy.state = 'shooting';
        enemy.reactTimer = Math.max(0, enemy.reactTimer - dt);
        lookAtPoint(enemy, playerPos.x, playerPos.y + 1.6, playerPos.z);
        if (enemy.reactTimer <= 0) {
          if (enemy.burstLeft <= 0) enemy.burstLeft = BOT_BURST;
          if (enemy.burstTimer <= 0 && enemy.burstLeft > 0) {
            fireBot(enemy, playerPos);
            enemy.burstLeft -= 1;
            enemy.burstTimer = BOT_BURST_GAP;
          }
        }
        if (enemy.burstTimer > 0) enemy.burstTimer -= dt;
        continue;
      }

      if (enemy.hearTimer > 0 || playerDist < BOT_HEAR) {
        enemy.state = 'alert';
        enemy.alertPos = playerPos.clone();
        enemy.alertTime = 1.5;
        enemy.hearTimer = Math.max(0, enemy.hearTimer - dt);
      }

      if (enemy.state === 'alert' && enemy.alertTime > 0) {
        enemy.alertTime -= dt;
        lookAtPoint(enemy, enemy.alertPos.x, enemy.alertPos.y + 1.6, enemy.alertPos.z);
        if (enemy.alertTime <= 0.5) moveToward(enemy, enemy.alertPos, dt * 0.6);
        continue;
      }

      enemy.state = 'patrol';
      const wp = new THREE.Vector3(enemy.route[enemy.routeIndex], 0, enemy.route[enemy.routeIndex + 2]);
      if (enemy.position.distanceTo(wp) < 0.8) {
        enemy.routeIndex = (enemy.routeIndex + 1) % enemy.route.length;
      }
      const wp2 = new THREE.Vector3(enemy.route[enemy.routeIndex], 0, enemy.route[enemy.routeIndex + 2]);
      moveToward(enemy, wp2, dt);
    }
  }

  function moveToward(enemy, target, dt) {
    const desired = target.clone().sub(enemy.position).normalize().multiplyScalar(BOT_SPEED);
    const next = enemy.position.clone().add(desired.clone().multiplyScalar(dt));
    next.y = 0;
    enemy.position.copy(next);
    enemy.mesh.position.set(enemy.position.x, 0, enemy.position.z);
    enemy.mesh.rotation.y = enemy.yaw;
  }

  function fireBot(enemy, targetPos) {
    const now = performance.now() / 1000;
    if (now - enemy.lastShotTime < 0.08) return;
    enemy.lastShotTime = now;

    const eye = getEyePosition(enemy);
    tmpDir.subVectors(targetPos, eye).normalize();
    tmpDir.x += (Math.random() * 2 - 1) * enemy.cfg.spreadStill;
    tmpDir.y += (Math.random() * 2 - 1) * enemy.cfg.spreadStill;
    tmpDir.z += (Math.random() * 2 - 1) * enemy.cfg.spreadStill;
    tmpDir.normalize();

    const hit = rayHitsPlayer(eye, tmpDir);
    if (hit) {
      const dmg = hit.isHead
        ? enemy.cfg.damage * enemy.cfg.headshotMultiplier
        : enemy.cfg.damage;
      damagePlayer(dmg);
    }

    enemy.pitch += enemy.cfg.recoilPitch;
    enemy.yaw += (Math.random() * 2 - 1) * enemy.cfg.recoilYaw;
  }

  return {
    enemies,
    step,
    damageEnemy,
    canSee,
    alive() {
      return enemies.filter((e) => e.alive);
    },
    allDead() {
      return enemies.every((e) => !e.alive);
    },
  };
}
