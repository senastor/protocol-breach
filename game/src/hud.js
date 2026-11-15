// Protocol: Breach — HUD. Health, ammo, round timer, score, money, round
// state and bomb status in DOM overlays; a buy menu between rounds. main.js
// pushes numbers in; this module never touches the simulation.
const COPY = {
  start: { title: 'Protocol: Breach', copy: 'Attackers vs defenders. Plant the bomb or wipe the defenders.', action: 'Start round' },
  roundOver: { title: 'Round over', copy: '', action: 'Next round' },
  gameOver: { title: 'Match over', copy: '', action: 'Play again' },
};

export function createHud() {
  const overlay = document.getElementById('overlay');
  const title = document.getElementById('overlay-title');
  const copy = document.getElementById('overlay-copy');
  const play = document.getElementById('play');

  const healthEl = document.getElementById('health');
  const healthBar = document.getElementById('health-bar');
  const ammoEl = document.getElementById('ammo');
  const ammoMag = document.getElementById('ammo-mag');
  const ammoReserve = document.getElementById('ammo-reserve');
  const moneyEl = document.getElementById('money');
  const scoreEl = document.getElementById('score');
  const timerEl = document.getElementById('timer');
  const roundEl = document.getElementById('round');
  const bombEl = document.getElementById('bomb');

  const buyMenu = document.getElementById('buymenu');
  const buyClose = document.getElementById('buyclose');
  const buyBody = document.getElementById('buybody');
  const buyMoney = document.getElementById('buymoney');

  const hitmarker = document.getElementById('hitmarker');

  let lastHealth = -1;
  let lastMag = -1;
  let lastReserve = -1;
  let lastMoney = -1;
  let lastScore = -1;
  let lastRound = -1;
  let lastTimer = -1;
  let lastBomb = '';
  let hitTimer = 0;

  function setHealth(value, max) {
    if (value === lastHealth) return;
    lastHealth = value;
    healthEl.textContent = String(value);
    const pct = Math.max(0, Math.min(100, (value / max) * 100));
    healthBar.style.width = `${pct}%`;
    healthBar.classList.toggle('low', value <= 30);
  }

  function setAmmo(mag, reserve, reloading) {
    if (mag === lastMag && reserve === lastReserve) return;
    lastMag = mag;
    lastReserve = reserve;
    ammoMag.textContent = String(mag);
    ammoReserve.textContent = `/ ${reserve}`;
    ammoEl.classList.toggle('empty', mag === 0);
    ammoEl.classList.toggle('reloading', !!reloading);
  }

  function setMoney(value) {
    if (value === lastMoney) return;
    lastMoney = value;
    moneyEl.textContent = `$${value}`;
  }

  function setScore(value) {
    if (value === lastScore) return;
    lastScore = value;
    scoreEl.textContent = String(value);
  }

  function setRound(value, total) {
    if (value === lastRound) return;
    lastRound = value;
    roundEl.textContent = `${value} / ${total}`;
  }

  function setTimer(seconds) {
    const s = Math.max(0, Math.ceil(seconds));
    if (s === lastTimer) return;
    lastTimer = s;
    const m = Math.floor(s / 60);
    const r = s % 60;
    timerEl.textContent = `${m}:${String(r).padStart(2, '0')}`;
    timerEl.classList.toggle('low', s <= 30);
  }

  function setBomb(planted, defusing) {
    let state = '';
    if (planted) state = defusing ? 'DEFUSING' : 'PLANTED';
    if (state === lastBomb) return;
    lastBomb = state;
    bombEl.textContent = state;
    bombEl.classList.toggle('active', !!state);
  }

  function hitMarker(killed, holdMs = 90) {
    hitmarker.classList.add('on');
    hitmarker.style.transform = killed
      ? 'translate(-50%, -50%) rotate(45deg) scale(1.25)'
      : 'translate(-50%, -50%) rotate(45deg)';
    clearTimeout(hitTimer);
    hitTimer = setTimeout(() => {
      hitmarker.classList.remove('on');
      hitmarker.style.transform = '';
    }, holdMs);
  }

  function showOverlay(mode, textLines) {
    const text = COPY[mode];
    title.textContent = text.title;
    if (mode === 'roundOver' || mode === 'gameOver') {
      copy.textContent = (textLines && textLines[0]) || text.copy;
    } else {
      copy.textContent = text.copy;
    }
    play.textContent = text.action;
    overlay.hidden = false;
    play.focus();
  }

  function hideOverlay() {
    overlay.hidden = true;
  }

  function openBuy(money, items, onBuy) {
    buyMoney.textContent = `$${money}`;
    buyBody.innerHTML = '';
    for (const item of items) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = `${item.label} — $${item.cost}`;
      btn.dataset.item = item.id;
      if (money < item.cost) btn.disabled = true;
      if (item.owned) { btn.textContent += ' (owned)'; btn.disabled = true; }
      btn.onclick = () => onBuy(item.id);
      buyBody.appendChild(btn);
    }
    buyMenu.hidden = false;
  }

  function closeBuy() {
    buyMenu.hidden = true;
  }

  return {
    setHealth,
    setAmmo,
    setMoney,
    setScore,
    setRound,
    setTimer,
    setBomb,
    hitMarker,
    showOverlay,
    hideOverlay,
    openBuy,
    closeBuy,
    onPlay(handler) { play.addEventListener('click', handler); },
    onBuyClose(handler) { buyClose.addEventListener('click', () => { handler(); closeBuy(); }); },
  };
}
