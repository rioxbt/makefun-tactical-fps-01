// Every sound is synthesised here from oscillators and one noise buffer: no audio file ships with
// the game, so the shots, steps, charges and stingers are its own.
export function createAudio() {
  let context = null;
  let master = null;
  let noise = null;
  let enabled = true;

  function boot() {
    if (context) return context;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) {
      enabled = false;
      return null;
    }
    context = new Ctx();
    const compressor = context.createDynamicsCompressor();
    compressor.threshold.value = -14;
    compressor.ratio.value = 6;
    master = context.createGain();
    master.gain.value = 0.55;
    master.connect(compressor);
    compressor.connect(context.destination);
    const length = Math.floor(context.sampleRate * 1.0);
    noise = context.createBuffer(1, length, context.sampleRate);
    const data = noise.getChannelData(0);
    let seed = 0x9e3779b9;
    for (let index = 0; index < length; index += 1) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      data[index] = (seed / 4294967296) * 2 - 1;
    }
    return context;
  }

  function resume() {
    boot();
    if (context && context.state === 'suspended') context.resume();
  }

  // One voice: oscillator and/or noise through a filter, an envelope and a stereo pan. Nothing is
  // built until the player has clicked, so the page loads without a browser warning.
  function voice(spec) {
    if (!enabled || !context) return;
    const start = context.currentTime;
    const pan = context.createStereoPanner();
    pan.pan.value = spec.pan ?? 0;
    const gain = context.createGain();
    gain.gain.value = 0;
    gain.connect(pan);
    pan.connect(master);
    const attack = spec.attack ?? 0.002;
    const decay = spec.decay ?? 0.12;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.linearRampToValueAtTime(spec.volume ?? 0.4, start + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + attack + decay);
    if (spec.frequency) {
      const osc = context.createOscillator();
      osc.type = spec.type ?? 'sine';
      osc.frequency.setValueAtTime(spec.frequency, start);
      if (spec.slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, spec.slideTo), start + attack + decay);
      const filter = context.createBiquadFilter();
      filter.type = spec.filter ?? 'lowpass';
      filter.frequency.value = spec.cutoff ?? 4000;
      osc.connect(filter);
      filter.connect(gain);
      osc.start(start);
      osc.stop(start + attack + decay + 0.02);
    }
    if (spec.noise) {
      const source = context.createBufferSource();
      source.buffer = noise;
      source.loop = true;
      const filter = context.createBiquadFilter();
      filter.type = spec.noiseFilter ?? 'lowpass';
      filter.frequency.setValueAtTime(spec.cutoff ?? 2400, start);
      if (spec.cutoffTo) filter.frequency.exponentialRampToValueAtTime(Math.max(60, spec.cutoffTo), start + decay);
      filter.Q.value = spec.q ?? 0.9;
      const noiseGain = context.createGain();
      noiseGain.gain.value = spec.noise ?? 0.6;
      source.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(gain);
      source.start(start);
      source.stop(start + attack + decay + 0.02);
    }
  }

  // Distance and side decide a sound's gain and pan, the same for every emitter.
  function spatial(distance, side) {
    const falloff = 1 / (1 + Math.max(0, distance) * 0.055);
    return { pan: Math.max(-1, Math.min(1, side)), volume: falloff };
  }

  const shots = {
    rifle: { frequency: 180, slideTo: 60, decay: 0.19, cutoff: 5200, type: 'square', noise: 0.9 },
    smg: { frequency: 260, slideTo: 90, decay: 0.11, cutoff: 6200, type: 'square', noise: 0.7 },
    pistol: { frequency: 320, slideTo: 110, decay: 0.09, cutoff: 5600, type: 'square', noise: 0.55 },
    marksman: { frequency: 140, slideTo: 45, decay: 0.3, cutoff: 4200, type: 'sawtooth', noise: 1.0 },
    shotgun: { frequency: 120, slideTo: 40, decay: 0.26, cutoff: 3200, type: 'square', noise: 1.0 },
    knife: { frequency: 900, slideTo: 400, decay: 0.05, cutoff: 8000, type: 'triangle', noise: 0.2 },
  };

  return {
    resume,
    setEnabled(value) {
      enabled = value;
      if (master) master.gain.value = value ? 0.55 : 0;
    },
    get enabled() {
      return enabled;
    },
    shot(weaponClass, distance = 0, side = 0) {
      const spec = shots[weaponClass] ?? shots.rifle;
      const place = spatial(distance, side);
      voice({ ...spec, volume: 0.5 * place.volume, pan: place.pan });
      voice({ frequency: 90, slideTo: 40, decay: 0.14, type: 'sine', volume: 0.28 * place.volume, pan: place.pan, cutoff: 300 });
    },
    dryFire() {
      voice({ frequency: 1800, slideTo: 900, decay: 0.04, type: 'square', volume: 0.16 });
    },
    reload(stage) {
      const base = stage === 0 ? 700 : stage === 1 ? 420 : 1500;
      voice({ frequency: base, slideTo: base * 0.6, decay: 0.06, type: 'square', volume: 0.2, cutoff: 2400, noise: 0.25 });
    },
    switchWeapon() {
      voice({ frequency: 1100, slideTo: 500, decay: 0.07, type: 'triangle', volume: 0.16, noise: 0.15 });
    },
    impact(distance, side) {
      const place = spatial(distance, side);
      voice({ frequency: 420, slideTo: 120, decay: 0.09, type: 'triangle', volume: 0.16 * place.volume, pan: place.pan, noise: 0.3, cutoff: 1800 });
    },
    hitmarker(headshot) {
      voice({ frequency: headshot ? 1500 : 1000, slideTo: headshot ? 2200 : 1300, decay: 0.06, type: 'sine', volume: 0.28 });
    },
    hurt() {
      voice({ frequency: 220, slideTo: 90, decay: 0.22, type: 'sawtooth', volume: 0.3, noise: 0.4, cutoff: 900 });
    },
    death() {
      voice({ frequency: 160, slideTo: 50, decay: 0.5, type: 'sawtooth', volume: 0.34, noise: 0.5, cutoff: 700 });
      voice({ frequency: 70, slideTo: 30, decay: 0.7, type: 'sine', volume: 0.3 });
    },
    footstep(loud, distance, side) {
      const place = spatial(distance, side);
      voice({ frequency: loud ? 200 : 150, slideTo: 90, decay: 0.05, type: 'triangle', volume: (loud ? 0.2 : 0.1) * place.volume, pan: place.pan, noise: 0.45, cutoff: loud ? 1600 : 900 });
    },
    stepOnMetal() {
      voice({ frequency: 900, slideTo: 500, decay: 0.08, type: 'triangle', volume: 0.14, noise: 0.3, cutoff: 3000 });
    },
    plantTick(progress) {
      voice({ frequency: 900 + progress * 700, slideTo: 1200 + progress * 800, decay: 0.06, type: 'square', volume: 0.22, cutoff: 2600 });
    },
    chargeArmed() {
      voice({ frequency: 620, slideTo: 1240, decay: 0.28, type: 'square', volume: 0.3, cutoff: 3200 });
    },
    bombBeep(urgent) {
      voice({ frequency: urgent ? 2400 : 1700, decay: 0.05, type: 'square', volume: urgent ? 0.3 : 0.19, cutoff: 6000 });
    },
    defuseTick(progress) {
      voice({ frequency: 500 + progress * 900, decay: 0.05, type: 'sine', volume: 0.2 });
    },
    explosion() {
      voice({ frequency: 70, slideTo: 26, decay: 1.25, type: 'sine', volume: 0.7, cutoff: 400, noise: 0.85, noiseFilter: 'lowpass', cutoffTo: 120 });
      voice({ frequency: 240, slideTo: 60, decay: 0.6, type: 'sawtooth', volume: 0.4, noise: 0.5, cutoff: 1200, cutoffTo: 200 });
    },
    grenadeBounce(distance, side) {
      const place = spatial(distance, side);
      voice({ frequency: 320, slideTo: 160, decay: 0.06, type: 'triangle', volume: 0.2 * place.volume, pan: place.pan, noise: 0.4 });
    },
    flashbang() {
      voice({ frequency: 3000, slideTo: 400, decay: 0.9, type: 'sawtooth', volume: 0.5, noise: 0.6, cutoff: 8000, cutoffTo: 300 });
    },
    roundStart() {
      voice({ frequency: 440, decay: 0.24, type: 'triangle', volume: 0.22, cutoff: 3000 });
      voice({ frequency: 660, decay: 0.34, type: 'triangle', volume: 0.18, cutoff: 3000 });
    },
    roundWin() {
      voice({ frequency: 523, decay: 0.2, type: 'triangle', volume: 0.24, cutoff: 4000 });
      voice({ frequency: 784, decay: 0.34, type: 'triangle', volume: 0.2, cutoff: 4000 });
    },
    roundLose() {
      voice({ frequency: 300, slideTo: 180, decay: 0.45, type: 'sawtooth', volume: 0.24, cutoff: 1600 });
    },
    matchEnd() {
      voice({ frequency: 392, decay: 0.4, type: 'triangle', volume: 0.24, cutoff: 3000 });
      voice({ frequency: 587, decay: 0.6, type: 'triangle', volume: 0.2, cutoff: 3000 });
      voice({ frequency: 784, decay: 0.9, type: 'triangle', volume: 0.18, cutoff: 3000 });
    },
    buy() {
      voice({ frequency: 880, slideTo: 1320, decay: 0.1, type: 'square', volume: 0.18, cutoff: 3000 });
    },
    deny() {
      voice({ frequency: 220, slideTo: 140, decay: 0.16, type: 'square', volume: 0.2, cutoff: 1200 });
    },
    uiClick() {
      voice({ frequency: 1200, slideTo: 900, decay: 0.04, type: 'triangle', volume: 0.12 });
    },
  };
}
