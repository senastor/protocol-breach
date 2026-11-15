// Protocol: Breach — a round-based tactical FPS. Player (attacker) vs bot
// defenders across two bomb sites. Rounds end by elimination, plant or defuse.
// Money between rounds buys weapons and grenades. Fixed-step simulation,
// render decoupled. No network, no assets beyond vendored three.js.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { createWorld } from './world.js';
import { createInput } from './input.js';
import { createPlayer } from './player.js';
import { createWeapon } from './weapon.js';
import { createGrenadeSystem } from './grenade.js';
import { createEnemies } from './enemies.js';
import { createHud } from './hud.js';

const FIXED_STEP = 1 / 60;
const ROUND_TIME = 90;
const ROUNDS_TOTAL = 6;
const MONEY_KILL = 300;
const MONEY_WIN = 2250;
const MONEY_LOSS = 1100;
const BOMB_PLANT_TIME = 3;
const BOMB_DEFUSE_TIME = 5;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;

function mulberry32(initial) {
  let a = initial;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = mulberry32(seed);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.canvas);
scene.fog = new THREE.Fog(new THREE.Color(PALETTE.canvas), 24, 70);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 140);
scene.add(camera);

const world = createWorld(scene);
const grenadeSystem = createGrenadeSystem(scene, world.colliders);
const hud = createHud();

const player = createPlayer(world.colliders);
const weapon = createWeapon(camera, 'rifle');
const input = createInput(renderer.domElement, onLockChange);
const enemies = createEnemies(scene, world, player.state, (amount) => takeDamage(amount));

const raycaster = new THREE.Raycaster();
raycaster.far = 80;
const direction = new THREE.Vector3();

// ---------- Game state ----------
const STATE = {
  money: 900,
  score: 0,
  round: 1,
  roundTime: ROUND_TIME,
  health: 100,
  maxHealth: 100,
  phase: 'buy',      // buy | playing | roundOver | gameOver
  bombPlanted: false,
  bombDefusing: false,
  bombSite: null,
  plantTimer: 0,
  defuseTimer: 0,
  matchOver: false,
  winnerText: '',
};

const PLAYER_MAX_HEALTH = 100;

function setPhase(next) {
  STATE.phase = next;
  hud.setRound(STATE.round, ROUNDS_TOTAL);
  hud.setTimer(STATE.roundTime);
  if (next === 'buy') {
    hud.hideOverlay();
    openBuyMenu();
    input.requestLock();
  } else if (next === 'playing') {
    hud.hideOverlay();
    input.requestLock();
  } else if (next === 'roundOver') {
    document.exitPointerLock();
    hud.showOverlay('roundOver', [STATE.winnerText]);
  } else if (next === 'gameOver') {
    document.exitPointerLock();
    hud.showOverlay('gameOver', [STATE.winnerText]);
  }
}

function openBuyMenu() {
  const items = [];
  if (weapon.state.kind !== 'rifle') items.push({ id: 'rifle', label: 'Rifle', cost: 700, owned: weapon.state.kind === 'rifle' });
  if (weapon.state.kind !== 'smg') items.push({ id: 'smg', label: 'SMG', cost: 500, owned: weapon.state.kind === 'smg' });
  items.push({ id: 'grenade', label: 'Frag grenade', cost: 300, owned: grenadeCount >= 2 });
  hud.openBuy(STATE.money, items, onBuyItem);
}

function onBuyItem(id) {
  if (id === 'rifle') { if (STATE.money >= 700) { STATE.money -= 700; weapon.switchTo('rifle'); weapon.refill(); } }
  if (id === 'smg') { if (STATE.money >= 500) { STATE.money -= 500; weapon.switchTo('smg'); weapon.refill(); } }
  if (id === 'grenade') { if (STATE.money >= 300 && grenadeCount < 2) { STATE.money -= 300; grenadeCount += 1; } }
  hud.setMoney(STATE.money);
  openBuyMenu();
}

let grenadeCount = 1;

function startRound() {
  STATE.phase = 'playing';
  STATE.roundTime = ROUND_TIME;
  STATE.bombPlanted = false;
  STATE.bombDefusing = false;
  STATE.bombSite = null;
  STATE.plantTimer = 0;
  STATE.defuseTimer = 0;
  enemies.enemies.forEach((e) => {
    e.health = 100;
    e.alive = true;
    e.mesh.visible = true;
    e.state = 'patrol';
  });
  grenadeSystem.clear();
  player.state.position.set(-16, 1, -16);
  player.state.velocity.set(0, 0, 0);
  weapon.refill();
  hud.setHealth(player.state.health, PLAYER_MAX_HEALTH);
  hud.setAmmo(weapon.state.mag, weapon.state.reserve, false);
  hud.setMoney(STATE.money);
  hud.setScore(STATE.score);
  hud.setBomb(false, false);
  input.requestLock();
}

function endRound(text, winner) {
  STATE.phase = 'roundOver';
  STATE.winnerText = text;
  if (winner === 'player') {
    STATE.money += MONEY_WIN;
    STATE.score += 500;
  } else {
    STATE.money += MONEY_LOSS;
  }
  hud.setMoney(STATE.money);
  hud.setScore(STATE.score);
  if (STATE.round >= ROUNDS_TOTAL || STATE.health <= 0) {
    STATE.phase = 'gameOver';
    STATE.winnerText = STATE.health <= 0 ? 'Defenders hold the line.' : 'Breach complete.';
  }
  hud.showOverlay('roundOver', [STATE.winnerText]);
}

function nextRound() {
  STATE.round += 1;
  if (STATE.round > ROUNDS_TOTAL) {
    STATE.phase = 'gameOver';
    hud.showOverlay('gameOver', [`Final score ${STATE.score}`]);
    return;
  }
  startRound();
}

// ---------- Combat ----------
function takeDamage(amount) {
  STATE.health = Math.max(0, STATE.health - amount);
  hud.setHealth(STATE.health, PLAYER_MAX_HEALTH);
  if (STATE.health <= 0) endRound('You were neutralized.', 'defenders');
}

function shoot(spread) {
  if (!weapon.takeRound()) return false;
  camera.getWorldDirection(direction);
  const s = spread || 0;
  direction.x += (random() * 2 - 1) * s;
  direction.y += (random() * 2 - 1) * s;
  direction.z += (random() * 2 - 1) * s;
  direction.normalize();
  scene.updateMatrixWorld(true);
  raycaster.set(camera.position, direction);

  const hit = raycaster.intersectObjects([...world.shootables, ...enemies.enemies.map((e) => e.mesh), ...enemies.enemies.map((e) => e.head)], false)[0];
  if (hit) {
    const enemy = enemies.enemies.find((e) => e.mesh === hit.object || e.head === hit.object || e.mesh === hit.object.parent || e.head === hit.object.parent);
    if (enemy && enemy.alive) {
      const isHead = hit.object === enemy.head;
      const dmg = isHead ? weapon.config().damage * weapon.config().headshotMultiplier : weapon.config().damage;
      const killed = enemies.damageEnemy(enemy, dmg);
      if (killed) {
        STATE.money += MONEY_KILL;
        STATE.score += 100;
        hud.setMoney(STATE.money);
        hud.setScore(STATE.score);
      }
      hud.hitMarker(killed);
    }
  }
  weapon.pullTrigger();
  player.recoil(0.009 + random() * 0.004, (random() * 2 - 1) * 0.004);
  hud.setAmmo(weapon.state.mag, weapon.state.reserve, false);
  return true;
}

function throwGrenade() {
  if (grenadeCount <= 0) return;
  camera.getWorldDirection(direction);
  direction.y = Math.max(0.2, direction.y);
  const origin = camera.position.clone().add(direction.clone().multiplyScalar(0.6));
  grenadeSystem.spawn(origin, direction, 'player');
  grenadeCount -= 1;
}

// ---------- Bomb ----------
const PLANT_SOUND_HINT = null;
const BOMB_POS_A = world.plantPoints[0].position.clone();
const BOMB_POS_B = world.plantPoints[1].position.clone();

function nearBombPoint(pos) {
  for (const pp of world.plantPoints) {
    if (pos.distanceTo(pp.position) < 1.6) return pp;
  }
  return null;
}

// ---------- Input bindings ----------
hud.onPlay(() => {
  if (STATE.phase === 'buy') { setPhase('playing'); }
  else if (STATE.phase === 'roundOver') { nextRound(); }
  else if (STATE.phase === 'gameOver') { restartMatch(); }
});

hud.onBuyClose(() => { setPhase('playing'); });

function restartMatch() {
  STATE.money = 900;
  STATE.score = 0;
  STATE.round = 1;
  STATE.health = PLAYER_MAX_HEALTH;
  STATE.matchOver = false;
  grenadeCount = 1;
  weapon.switchTo('rifle');
  weapon.refill();
  hud.setHealth(STATE.health, PLAYER_MAX_HEALTH);
  startRound();
}

function onLockChange(locked) {
  if (shot) return;
  if (locked && STATE.phase === 'playing') { /* fine */ }
}

// ---------- Main loop ----------
let accumulator = 0;
let lastTime = performance.now();
let started = false;

function step(dt) {
  if (STATE.phase !== 'playing') return;

  // round timer
  STATE.roundTime -= dt;
  if (STATE.roundTime <= 0) {
    STATE.roundTime = 0;
    endRound('Time ran out. Defenders hold.', 'defenders');
    return;
  }
  hud.setTimer(STATE.roundTime);

  // bomb countdown
  if (STATE.bombPlanted) {
    if (STATE.bombDefusing) {
      STATE.defuseTimer -= dt;
      hud.setBomb(true, true);
      if (STATE.defuseTimer <= 0) {
        STATE.bombPlanted = false;
        STATE.bombDefusing = false;
        endRound('Defused. Breach secure.', 'player');
      }
    } else {
      STATE.plantTimer -= dt;
      hud.setBomb(true, false);
      if (STATE.plantTimer <= 0) {
        endRound('Bomb detonated. Site lost.', 'defenders');
      }
    }
  }

  player.step(dt, input.state.keys);
  weapon.step(dt);
  grenadeSystem.step(dt, (center, radius, maxDmg) => {
    // grenade damage to player
    const d = player.state.position.distanceTo(center);
    if (d < radius) {
      const amount = Math.max(0, maxDmg * (1 - d / radius));
      takeDamage(amount);
    }
    // grenade damage to enemies
    for (const e of enemies.enemies) {
      if (!e.alive) continue;
      const d2 = e.position.distanceTo(center);
      if (d2 < radius) {
        const amount = Math.max(0, maxDmg * (1 - d2 / radius));
        const killed = enemies.damageEnemy(e, amount);
        if (killed) { STATE.money += MONEY_KILL; STATE.score += 100; hud.setMoney(STATE.money); hud.setScore(STATE.score); }
      }
    }
  });
  enemies.step(dt, grenadeSystem.active());

  // player shooting
  if (input.state.firing && weapon.ready()) shoot(weapon.spread(player.groundSpeed()));
  if (input.state.keys.has('KeyR')) weapon.reload();
  if (input.state.takeThrow()) throwGrenade();

  // weapon switch
  const sw = input.takeSwitch();
  if (sw.switched && sw.kind) { weapon.switchTo(sw.kind); weapon.refill(); }

  // bomb plant / defuse interact (E)
  if (input.state.keys.has('KeyE') && !STATE.bombPlanted) {
    const pp = nearBombPoint(player.state.position);
    if (pp && !STATE.bombPlanted) {
      STATE.plantTimer += dt;
      if (STATE.plantTimer >= BOMB_PLANT_TIME && !STATE.bombPlanted) {
        STATE.bombPlanted = true;
        STATE.bombSite = pp.id;
        STATE.plantTimer = BOMB_PLANT_TIME;
        STATE.bombDefusing = false;
      }
    } else {
      STATE.plantTimer = 0;
    }
  } else {
    STATE.plantTimer = 0;
  }

  if (input.state.keys.has('KeyE') && STATE.bombPlanted && !STATE.bombDefusing) {
    const pp = nearBombPoint(player.state.position);
    if (pp && pp.id === STATE.bombSite && player.state.position.distanceTo(pp.position) < 1.6) {
      STATE.bombDefusing = true;
      STATE.defuseTimer = BOMB_DEFUSE_TIME;
    }
  } else if (!input.state.keys.has('KeyE')) {
    // keep defusing state until released/re-pressed handled in bomb block
  }

  // collision for bomb hint removed; keep simple
  hud.setAmmo(weapon.state.mag, weapon.state.reserve, weapon.state.reloadLeft > 0);
  hud.setHealth(STATE.health, PLAYER_MAX_HEALTH);
  // check round over by elimination
  const aliveEnemies = enemies.alive().length;
  if (aliveEnemies === 0 && STATE.phase === 'playing') {
    endRound('Defenders neutralized. Breach secure.', 'player');
  }
}

function syncCamera() {
  camera.position.set(player.state.position.x, player.state.position.y + player.state.eye, player.state.position.z);
  camera.rotation.set(player.state.pitch, player.state.yaw, 0, 'YXZ');
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!frozen) {
    const look = input.takeLook();
    player.look(look.x, look.y);
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) {
      step(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (accumulator > FIXED_STEP * 5) accumulator = 0;
    syncCamera();
  }
  renderer.render(scene, camera);
}

let frozen = shot !== null;

function settle(steps) {
  for (let i = 0; i < steps; i += 1) step(FIXED_STEP);
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

function runShot(name) {
  hud.hideOverlay();
  player.state.pitch = 0;
  player.state.yaw = 0;
  if (name === 'start') {
    player.state.position.set(-16, 1, -16);
    settle(20);
    hud.showOverlay('start', 0);
  } else if (name === 'play') {
    player.state.position.set(-16, 1, -16);
    startRound();
    settle(30);
  } else if (name === 'end') {
    player.state.position.set(0, 1, -10);
    STATE.phase = 'roundOver';
    STATE.winnerText = 'Breach secure. Site A cleared.';
    hud.showOverlay('roundOver', [STATE.winnerText]);
    settle(2);
  }
  hud.setScore(STATE.score);
  hud.setAmmo(weapon.state.mag, weapon.state.reserve, false);
  paintTwiceThenReady();
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

syncCamera();
if (shot) runShot(shot);
else { requestAnimationFrame(frame); }
