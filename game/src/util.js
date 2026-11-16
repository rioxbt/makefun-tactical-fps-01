// Small helpers the simulation shares: clamping, a seeded random, angle maths and clock text.
// Everything here is allocation-free so the fixed-step loop can call it every tick.

export function clamp(value, low, high) {
  return value < low ? low : value > high ? high : value;
}

// mulberry32: the game's only random source, so a seed reproduces a round exactly.
export function makeRandom(seed) {
  let a = seed >>> 0;
  return function random() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function clockText(seconds) {
  const whole = Math.max(0, Math.ceil(seconds));
  const minutes = Math.floor(whole / 60);
  const rest = whole % 60;
  return `${minutes}:${rest < 10 ? '0' : ''}${rest}`;
}

// A tiny fixed-size ring for damage events, kill feed rows and the like: push never allocates.
export function makeRing(size) {
  return { items: new Array(size), head: 0, count: 0, size };
}

export function ringPush(ring, item) {
  ring.items[ring.head] = item;
  ring.head = (ring.head + 1) % ring.size;
  if (ring.count < ring.size) ring.count += 1;
}
