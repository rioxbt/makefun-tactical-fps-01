// Keyboard and mouse: held keys, accumulated look delta and a one-shot event queue for the
// discrete actions (buy, reload, plant, weapon switch). The pointer lock is the game's mouse.
import { clamp } from './util.js';

const LOOK_SCALE = 0.0022;

export function createInput(element, onLockChange) {
  const keys = new Set();
  const state = {
    keys,
    firing: false,
    aiming: false,
    crouch: false,
    walk: false,
    locked: false,
    lookX: 0,
    lookY: 0,
  };
  const events = [];
  const handlers = new Map();

  function push(code) {
    events.push(code);
  }

  function onKeyDown(event) {
    if (event.repeat) return;
    if (event.code === 'Tab' || event.code === 'Space') event.preventDefault();
    keys.add(event.code);
    push(event.code);
  }

  function onKeyUp(event) {
    keys.delete(event.code);
  }

  function onMouseMove(event) {
    if (!state.locked) return;
    state.lookX += event.movementX * LOOK_SCALE;
    state.lookY += event.movementY * LOOK_SCALE;
  }

  function onMouseDown(event) {
    if (!state.locked) return;
    if (event.button === 0) state.firing = true;
    if (event.button === 2) state.aiming = true;
    push(event.button === 0 ? 'Mouse0' : event.button === 2 ? 'Mouse2' : `Mouse${event.button}`);
  }

  function onMouseUp(event) {
    if (event.button === 0) state.firing = false;
    if (event.button === 2) state.aiming = false;
  }

  function onLock() {
    state.locked = document.pointerLockElement === element;
    if (!state.locked) {
      keys.clear();
      state.firing = false;
      state.aiming = false;
    }
    if (onLockChange) onLockChange(state.locked);
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', () => {
    keys.clear();
    state.firing = false;
  });
  window.addEventListener('mousemove', onMouseMove);
  element.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);
  element.addEventListener('contextmenu', (event) => event.preventDefault());
  document.addEventListener('pointerlockchange', onLock);

  return {
    state,
    // Discrete actions of this frame: the caller drains the queue and switches on the codes.
    takeEvents() {
      if (events.length === 0) return events;
      const copy = events.slice();
      events.length = 0;
      return copy;
    },
    // Look delta since the last call, in radians.
    takeLook() {
      const look = { x: state.lookX, y: state.lookY };
      state.lookX = 0;
      state.lookY = 0;
      return look;
    },
    press(code) {
      keys.add(code);
      push(code);
    },
    release(code) {
      keys.delete(code);
    },
    command(code, value) {
      if (code === 'Mouse0') state.firing = value;
      if (code === 'Mouse2') state.aiming = value;
    },
    requestLock() {
      if (element.requestPointerLock && !state.locked) element.requestPointerLock();
    },
    isDown(code) {
      return keys.has(code);
    },
    on(code, handler) {
      handlers.set(code, handler);
    },
    dispatch(code) {
      const handler = handlers.get(code);
      if (handler) handler();
    },
    setAim(value) {
      state.aiming = value;
    },
    consumeLook(limitX, limitY) {
      const look = this.takeLook();
      return { x: clamp(look.x, -limitX, limitX), y: clamp(look.y, -limitY, limitY) };
    },
  };
}
