// Protocol: Breach — input. Pointer-lock mouse look, keyboard movement, firing,
// reloading, weapon switch and grenade throw. Pure browser APIs.
export function createInput(canvas, onLockChange) {
  const keys = new Set();
  const state = {
    keys,
    locked: false,
    firing: false,
    lookX: 0,
    lookY: 0,
    justThrew: false,
    justSwitched: false,
    switchTo: null,
  };

  function setKey(event, down) {
    if (down) keys.add(event.code);
    else keys.delete(event.code);
    if (event.code === 'Space') event.preventDefault();
  }

  window.addEventListener('keydown', (event) => {
    setKey(event, true);
    if (event.code === 'Digit1') { state.switchTo = 'rifle'; state.justSwitched = true; }
    if (event.code === 'Digit2') { state.switchTo = 'smg'; state.justSwitched = true; }
    if (event.code === 'KeyG') { state.justThrew = true; }
  });
  window.addEventListener('keyup', (event) => setKey(event, false));
  window.addEventListener('blur', () => keys.clear());
  window.addEventListener('mousemove', (event) => {
    if (!state.locked) return;
    state.lookX += event.movementX;
    state.lookY += event.movementY;
  });
  window.addEventListener('mousedown', (event) => {
    if (state.locked && event.button === 0) state.firing = true;
  });
  window.addEventListener('mouseup', (event) => {
    if (event.button === 0) state.firing = false;
  });
  document.addEventListener('pointerlockchange', () => {
    state.locked = document.pointerLockElement === canvas;
    if (!state.locked) {
      keys.clear();
      state.firing = false;
    }
    onLockChange(state.locked);
  });

  return {
    state,
    requestLock() {
      canvas.requestPointerLock();
    },
    takeLook() {
      const x = state.lookX;
      const y = state.lookY;
      state.lookX = 0;
      state.lookY = 0;
      return { x, y };
    },
    takeThrow() {
      const t = state.justThrew;
      state.justThrew = false;
      return t;
    },
    takeSwitch() {
      const s = state.justSwitched;
      const k = state.switchTo;
      state.justSwitched = false;
      state.switchTo = null;
      return { switched: s, kind: k };
    },
  };
}
