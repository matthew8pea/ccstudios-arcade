/* GALACTIC PLAYGROUND — procedural sound engine.
 * Every sound is synthesized at runtime with the Web Audio API (oscillators, filtered noise,
 * envelopes). No sample files are used. Sounds are panned/attenuated relative to the camera.
 */
'use strict';

GP.Audio = (() => {
  let ac = null, master, comp, sfxBus, ambBus, uiBus;
  // Game time: world sounds fall silent while the game is paused, and in slow motion they are pitched
  // down, stretched out, muffled and echo (fast-forward pitches them up a little).
  let worldGain, worldFilter, verbWet, ambGain;
  let pitch = 1;                        // current pitch and speed factor for world sounds
  let timeState = { scale: 1, paused: false };
  let white = null, brown = null;
  let voices = 0;
  const MAX_VOICES = 48;
  const lastPlayed = new Map();
  let cam = null;
  const loops = new Set();
  let ambience = null;
  let ambTimer = 0;

  function ensure() {
    if (ac) { if (ac.state === 'suspended') ac.resume(); return true; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    try { ac = new AC(); } catch (e) { return false; }
    comp = ac.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 12; comp.ratio.value = 5; comp.attack.value = 0.004; comp.release.value = 0.2;
    master = ac.createGain();
    master.connect(comp); comp.connect(ac.destination);
    // world sounds: bus -> muffling filter -> (dry + reverb) -> pause gain -> master
    sfxBus = ac.createGain();
    worldFilter = ac.createBiquadFilter(); worldFilter.type = 'lowpass'; worldFilter.frequency.value = 20000; worldFilter.Q.value = 0.5;
    worldGain = ac.createGain();
    verbWet = ac.createGain(); verbWet.gain.value = 0;
    const verb = ac.createConvolver(); verb.buffer = makeReverb(2.8);
    sfxBus.connect(worldFilter); worldFilter.connect(worldGain);
    worldFilter.connect(verbWet); verbWet.connect(verb); verb.connect(worldGain);
    worldGain.connect(master);
    ambBus = ac.createGain(); ambGain = ac.createGain(); ambBus.connect(ambGain); ambGain.connect(master);
    uiBus = ac.createGain(); uiBus.connect(master);
    white = makeNoise('white'); brown = makeNoise('brown');
    applyVolumes();
    const ts = timeState; timeState = { scale: -1, paused: false }; setTime(ts.scale, ts.paused);
    return true;
  }

  // a decaying noise tail used as a reverb impulse response
  function makeReverb(seconds) {
    const len = Math.floor(ac.sampleRate * seconds);
    const buf = ac.createBuffer(2, len, ac.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    }
    return buf;
  }

  // Follow the game's clock: 0 = paused, below 1 = slow motion, above 1 = fast-forward.
  function setTime(scale, paused) {
    if (timeState.scale === scale && timeState.paused === paused) return;
    timeState = { scale, paused };
    if (!ac) return;
    const t = ac.currentTime;
    const slow = !paused && scale < 0.95;
    pitch = paused ? 1 : scale < 1 ? GP.M.clamp(Math.pow(scale, 0.4), 0.45, 1) : Math.min(1.25, Math.pow(scale, 0.2));
    worldGain.gain.setTargetAtTime(paused ? 0 : 1, t, paused ? 0.04 : 0.08);
    ambGain.gain.setTargetAtTime(paused ? 0.25 : 1, t, 0.15);
    worldFilter.frequency.setTargetAtTime(slow ? 900 + 5000 * (pitch - 0.45) : 20000, t, 0.12);
    verbWet.gain.setTargetAtTime(slow ? 0.7 : 0, t, 0.15);
    // hums and engines that are already playing bend with it
    const cents = 1200 * Math.log2(pitch);
    for (const l of loops) {
      for (const o of l.oscs || []) o.detune.setTargetAtTime(cents, t, 0.1);
      for (const n of l.srcs || []) n.playbackRate.setTargetAtTime(pitch, t, 0.1);
    }
  }

  function makeNoise(kind) {
    const len = ac.sampleRate * 2;
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (kind === 'brown') { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
      else d[i] = w;
    }
    return buf;
  }

  function applyVolumes() {
    if (!ac) return;
    const a = GP.Settings.a;
    const m = a.muted ? 0 : a.master;
    master.gain.setTargetAtTime(m, ac.currentTime, 0.05);
    sfxBus.gain.setTargetAtTime(a.sfx, ac.currentTime, 0.05);
    ambBus.gain.setTargetAtTime(a.ambience, ac.currentTime, 0.05);
    uiBus.gain.setTargetAtTime(a.ui, ac.currentTime, 0.05);
  }

  function spatial(x, y) {
    if (x == null || !cam) return { g: 1, pan: 0 };
    const s = cam.base * cam.zoom;
    const halfW = cam.w / 2 / s;
    const dx = x - cam.x, dy = y - cam.y;
    const d = Math.hypot(dx, dy * 1.3);
    let g = 1 - d / (halfW * 2.6 + 6);
    if (g <= 0) return null;
    g = g * g;
    const zoomG = GP.M.clamp(0.55 + cam.zoom * 0.45, 0.5, 1.2);
    return { g: g * zoomG, pan: GP.M.clamp(dx / (halfW + 1), -1, 1) * 0.75 };
  }

  // Create an output chain (gain -> panner -> bus) that frees a voice when done
  function output(bus, x, y, vol, dur) {
    const sp = spatial(x, y);
    if (!sp || voices >= MAX_VOICES) return null;
    const g = ac.createGain();
    g.gain.value = vol * sp.g;
    g._ui = bus === uiBus;              // interface sounds ignore slow motion
    const stretch = g._ui ? 1 : 1 / pitch;
    let node = g;
    if (ac.createStereoPanner) {
      const p = ac.createStereoPanner(); p.pan.value = sp.pan;
      g.connect(p); p.connect(bus);
    } else g.connect(bus);
    voices++;
    setTimeout(() => { voices--; try { g.disconnect(); } catch (e) { /* noop */ } }, (dur * stretch + 0.3) * 1000);
    return node;
  }

  function env(gainNode, t, attack, peak, decay, sustainTime = 0) {
    const gp = gainNode.gain;
    gp.setValueAtTime(0.0001, t);
    gp.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + attack);
    if (sustainTime) gp.setValueAtTime(Math.max(peak, 0.0002), t + attack + sustainTime);
    gp.exponentialRampToValueAtTime(0.0001, t + attack + sustainTime + decay);
  }

  // world sounds in slow motion: lower frequencies, longer times
  function warp(dest, o) {
    if (dest._ui || pitch === 1) return o;
    const P = pitch, S = 1 / P, w = Object.assign({}, o);
    for (const k of ['f0', 'f1', 'ff', 'ff1']) if (w[k] != null) w[k] *= P;
    for (const k of ['dur', 'attack', 'decay', 'hold']) if (w[k] != null) w[k] *= S;
    w.rate = (w.rate || 1) * P;
    return w;
  }
  function tone(dest, t, o) {
    o = warp(dest, o);
    const osc = ac.createOscillator();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.f0, t);
    if (o.f1 != null) {
      if (o.lin) osc.frequency.linearRampToValueAtTime(o.f1, t + o.dur);
      else osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.f1), t + o.dur);
    }
    if (o.detune) osc.detune.value = o.detune;
    const g = ac.createGain();
    env(g, t, o.attack || 0.004, o.vol || 0.3, o.decay != null ? o.decay : o.dur, o.hold || 0);
    let last = osc;
    if (o.filter) {
      const f = ac.createBiquadFilter();
      f.type = o.filter; f.frequency.value = o.ff || 1000; f.Q.value = o.q || 1;
      if (o.ff1) f.frequency.exponentialRampToValueAtTime(o.ff1, t + o.dur);
      osc.connect(f); last = f;
    }
    last.connect(g); g.connect(dest);
    osc.start(t); osc.stop(t + (o.attack || 0.004) + (o.hold || 0) + (o.decay != null ? o.decay : o.dur) + 0.05);
    return osc;
  }

  function noise(dest, t, o) {
    o = warp(dest, o);
    const src = ac.createBufferSource();
    src.buffer = o.brown ? brown : white;
    src.loop = true;
    src.playbackRate.value = o.rate || 1;
    const f = ac.createBiquadFilter();
    f.type = o.filter || 'bandpass';
    f.frequency.setValueAtTime(o.f0 || 1000, t);
    if (o.f1) f.frequency.exponentialRampToValueAtTime(o.f1, t + o.dur);
    f.Q.value = o.q || 1;
    const g = ac.createGain();
    env(g, t, o.attack || 0.004, o.vol || 0.3, o.decay != null ? o.decay : o.dur, o.hold || 0);
    src.connect(f); f.connect(g); g.connect(dest);
    src.start(t, Math.random() * 1.5);
    src.stop(t + (o.attack || 0.004) + (o.hold || 0) + (o.decay != null ? o.decay : o.dur) + 0.05);
    return src;
  }

  function limited(name, minGap) {
    const now = performance.now();
    const last = lastPlayed.get(name) || 0;
    if (now - last < minGap) return true;
    lastPlayed.set(name, now);
    return false;
  }

  const R = GP.M.rand;

  /* ---------- sound presets ---------- */
  const presets = {
    blaster(o) {
      const p = (o.pitch || 1) * R(0.94, 1.06);
      const dur = (o.long ? 0.3 : 0.17) / Math.sqrt(p);
      const d = output(sfxBus, o.x, o.y, (o.vol || 0.5), dur);
      if (!d) return;
      const t = ac.currentTime;
      tone(d, t, { type: 'sawtooth', f0: 2100 * p, f1: 140 * p, dur, vol: 0.28, filter: 'bandpass', ff: 1400 * p, q: 0.8 });
      tone(d, t, { type: 'square', f0: 1500 * p, f1: 110 * p, dur: dur * 0.9, vol: 0.12, detune: 25 });
      noise(d, t, { f0: 5000, dur: 0.03, vol: 0.2, filter: 'highpass' });
      if (o.heavy) tone(d, t, { type: 'sine', f0: 180, f1: 50, dur: 0.2, vol: 0.4 });
    },
    boltImpact(o) {
      if (limited('boltImpact', 25)) return;
      const d = output(sfxBus, o.x, o.y, o.vol || 0.35, 0.2);
      if (!d) return;
      const t = ac.currentTime;
      noise(d, t, { f0: 2500, f1: 600, dur: 0.14, vol: 0.35, q: 1.5 });
      tone(d, t, { type: 'sine', f0: 400, f1: 90, dur: 0.1, vol: 0.2 });
    },
    saberIgnite(o) {
      const d = output(sfxBus, o.x, o.y, o.vol || 0.5, 0.6);
      if (!d) return;
      const t = ac.currentTime, p = o.pitch || 1;
      tone(d, t, { type: 'sawtooth', f0: 45 * p, f1: 110 * p, dur: 0.45, vol: 0.35, filter: 'lowpass', ff: 300, ff1: 1600 });
      tone(d, t, { type: 'sawtooth', f0: 47 * p, f1: 114 * p, dur: 0.45, vol: 0.25, filter: 'lowpass', ff: 300, ff1: 1400 });
      noise(d, t, { f0: 400, f1: 3500, dur: 0.35, vol: 0.2, q: 0.7 });
    },
    saberRetract(o) {
      const d = output(sfxBus, o.x, o.y, o.vol || 0.45, 0.5);
      if (!d) return;
      const t = ac.currentTime, p = o.pitch || 1;
      tone(d, t, { type: 'sawtooth', f0: 110 * p, f1: 35 * p, dur: 0.38, vol: 0.3, filter: 'lowpass', ff: 1500, ff1: 200 });
      noise(d, t, { f0: 3000, f1: 300, dur: 0.3, vol: 0.15 });
    },
    saberClash(o) {
      if (limited('clash', 60)) return;
      const d = output(sfxBus, o.x, o.y, o.vol || 0.6, 0.6);
      if (!d) return;
      const t = ac.currentTime;
      noise(d, t, { f0: 3200, f1: 900, dur: 0.3, vol: 0.5, q: 0.9 });
      tone(d, t, { type: 'sawtooth', f0: 520, f1: 140, dur: 0.25, vol: 0.3 });
      tone(d, t, { type: 'sine', f0: 1480, dur: 0.5, vol: 0.12 });
      tone(d, t, { type: 'sine', f0: 2230, dur: 0.35, vol: 0.08 });
    },
    saberSizzle(o) {
      if (limited('sizzle', 70)) return;
      const d = output(sfxBus, o.x, o.y, o.vol || 0.35, 0.2);
      if (!d) return;
      const t = ac.currentTime;
      noise(d, t, { f0: 2800, dur: 0.12, vol: 0.4, filter: 'highpass', q: 0.5 });
      tone(d, t, { type: 'sawtooth', f0: 160, f1: 90, dur: 0.12, vol: 0.12 });
    },
    deflect(o) {
      if (limited('deflect', 30)) return;
      const d = output(sfxBus, o.x, o.y, o.vol || 0.5, 0.25);
      if (!d) return;
      const t = ac.currentTime;
      tone(d, t, { type: 'sawtooth', f0: 2600, f1: 700, dur: 0.12, vol: 0.2, filter: 'bandpass', ff: 1800 });
      noise(d, t, { f0: 4000, f1: 1500, dur: 0.1, vol: 0.3 });
      tone(d, t, { type: 'sine', f0: 180, f1: 90, dur: 0.1, vol: 0.2 });
    },
    explosion(o) {
      const size = o.size || 1;
      const dur = 1.2 + size * 0.6;
      const d = output(sfxBus, o.x, o.y, Math.min(1, (o.vol || 0.8) * (0.6 + size * 0.3)), dur);
      if (!d) return;
      const t = ac.currentTime;
      noise(d, t, { brown: true, filter: 'lowpass', f0: 1800, f1: 90, dur, vol: 0.9, attack: 0.005 });
      noise(d, t, { filter: 'bandpass', f0: 1200, f1: 200, dur: 0.5, vol: 0.35 });
      tone(d, t, { type: 'sine', f0: 90, f1: 28, dur: 0.8, vol: 0.7 });
      tone(d, t + 0.02, { type: 'triangle', f0: 60, f1: 25, dur: 0.9, vol: 0.4 });
    },
    seismic(o) {
      const d = output(sfxBus, o.x, o.y, o.vol || 0.9, 2.2);
      if (!d) return;
      const t = ac.currentTime + 0.25; // eerie silence before the wave
      tone(d, t, { type: 'sine', f0: 900, f1: 45, dur: 1.4, vol: 0.5, attack: 0.02 });
      tone(d, t, { type: 'sawtooth', f0: 600, f1: 30, dur: 1.2, vol: 0.2, filter: 'lowpass', ff: 1200, ff1: 100 });
      noise(d, t + 0.1, { brown: true, filter: 'lowpass', f0: 800, f1: 60, dur: 1.6, vol: 0.8 });
    },
    ion(o) {
      const d = output(sfxBus, o.x, o.y, o.vol || 0.6, 0.8);
      if (!d) return;
      const t = ac.currentTime;
      tone(d, t, { type: 'square', f0: 300, f1: 1800, dur: 0.25, vol: 0.15, filter: 'bandpass', ff: 1200 });
      noise(d, t, { f0: 3000, dur: 0.6, vol: 0.4, filter: 'highpass' });
      tone(d, t, { type: 'sine', f0: 120, f1: 40, dur: 0.5, vol: 0.4 });
    },
    impact(o) {
      const key = 'impact_' + (o.mat || 'x');
      if (limited(key, 45)) return;
      const v = GP.M.clamp(o.strength || 0.5, 0.05, 1);
      const d = output(sfxBus, o.x, o.y, v * 0.7, 0.35);
      if (!d) return;
      const t = ac.currentTime;
      const mat = o.mat || 'metal';
      if (mat === 'metal' || mat === 'droid' || mat === 'armor') {
        noise(d, t, { f0: R(1500, 2500), q: 6, dur: 0.18, vol: 0.4 });
        tone(d, t, { type: 'sine', f0: R(500, 900), dur: 0.22, vol: 0.18 });
        tone(d, t, { type: 'sine', f0: R(1300, 1900), dur: 0.12, vol: 0.08 });
      } else if (mat === 'flesh') {
        noise(d, t, { filter: 'lowpass', f0: 350, dur: 0.1, vol: 0.6 });
      } else if (mat === 'crystal') {
        tone(d, t, { type: 'sine', f0: R(1800, 2800), dur: 0.4, vol: 0.2 });
        noise(d, t, { f0: 5000, dur: 0.1, vol: 0.2, filter: 'highpass' });
      } else if (mat === 'wood') {
        noise(d, t, { f0: 700, q: 3, dur: 0.12, vol: 0.5 });
        tone(d, t, { type: 'triangle', f0: 220, dur: 0.1, vol: 0.2 });
      } else {
        noise(d, t, { filter: 'lowpass', f0: 600, dur: 0.14, vol: 0.55 });
        tone(d, t, { type: 'sine', f0: 120, f1: 60, dur: 0.12, vol: 0.25 });
      }
    },
    droidBeep(o) {
      if (limited('beep', 200)) return;
      const n = GP.M.randInt(3, 7);
      const d = output(sfxBus, o.x, o.y, o.vol || 0.3, n * 0.12);
      if (!d) return;
      let t = ac.currentTime;
      for (let i = 0; i < n; i++) {
        const dur = R(0.04, 0.11), f = R(900, 2600);
        tone(d, t, { type: 'sine', f0: f, f1: f * R(0.6, 1.6), dur, vol: 0.25, lin: true });
        t += dur + R(0, 0.03);
      }
    },
    droidTalk(o) {
      if (limited('talk', 300)) return;
      const d = output(sfxBus, o.x, o.y, o.vol || 0.25, 0.4);
      if (!d) return;
      const t = ac.currentTime;
      tone(d, t, { type: 'square', f0: 420, f1: 380, dur: 0.1, vol: 0.12, filter: 'bandpass', ff: 900 });
      tone(d, t + 0.13, { type: 'square', f0: 360, f1: 300, dur: 0.12, vol: 0.12, filter: 'bandpass', ff: 900 });
    },
    servo(o) {
      if (limited('servo', 120)) return;
      const d = output(sfxBus, o.x, o.y, o.vol || 0.2, 0.3);
      if (!d) return;
      tone(d, ac.currentTime, { type: 'sawtooth', f0: R(220, 320), f1: R(420, 600), dur: 0.2, vol: 0.12, filter: 'lowpass', ff: 900 });
    },
    stomp(o) {
      if (limited('stomp', 90)) return;
      const d = output(sfxBus, o.x, o.y, o.vol || 0.6, 0.5);
      if (!d) return;
      const t = ac.currentTime;
      tone(d, t, { type: 'sine', f0: 80, f1: 35, dur: 0.35, vol: 0.6 });
      noise(d, t, { f0: 900, q: 4, dur: 0.15, vol: 0.3 });
    },
    forcePush(o) {
      const d = output(sfxBus, o.x, o.y, o.vol || 0.6, 0.9);
      if (!d) return;
      const t = ac.currentTime;
      noise(d, t, { brown: true, filter: 'bandpass', f0: 900, f1: 90, q: 0.8, dur: 0.7, vol: 1.2, attack: 0.03 });
      tone(d, t, { type: 'sine', f0: 110, f1: 40, dur: 0.6, vol: 0.5, attack: 0.02 });
    },
    forcePull(o) {
      const d = output(sfxBus, o.x, o.y, o.vol || 0.5, 0.8);
      if (!d) return;
      const t = ac.currentTime;
      noise(d, t, { brown: true, filter: 'bandpass', f0: 90, f1: 900, q: 0.8, dur: 0.6, vol: 1.1, attack: 0.1 });
      tone(d, t, { type: 'sine', f0: 40, f1: 110, dur: 0.5, vol: 0.4, attack: 0.05 });
    },
    lightning(o) {
      if (limited('lightning', 90)) return;
      const d = output(sfxBus, o.x, o.y, o.vol || 0.4, 0.25);
      if (!d) return;
      const t = ac.currentTime;
      noise(d, t, { f0: R(2000, 5000), dur: 0.15, vol: 0.5, filter: 'highpass', q: 0.4 });
      tone(d, t, { type: 'sawtooth', f0: R(60, 120), dur: 0.15, vol: 0.2 });
    },
    zap(o) {
      if (limited('zap', 60)) return;
      const d = output(sfxBus, o.x, o.y, o.vol || 0.35, 0.2);
      if (!d) return;
      const t = ac.currentTime;
      noise(d, t, { f0: 4000, dur: 0.1, vol: 0.4, filter: 'highpass' });
      tone(d, t, { type: 'square', f0: 90, dur: 0.1, vol: 0.15 });
    },
    beepArm(o) {
      const d = output(sfxBus, o.x, o.y, o.vol || 0.3, 0.1);
      if (!d) return;
      tone(d, ac.currentTime, { type: 'square', f0: o.f || 1600, dur: 0.06, vol: 0.12 });
    },
    click(o) { // UI
      const d = output(uiBus, null, null, o.vol || 0.35, 0.06);
      if (!d) return;
      tone(d, ac.currentTime, { type: 'sine', f0: o.f || 1400, f1: (o.f || 1400) * 0.7, dur: 0.04, vol: 0.3 });
    },
    hover() {
      if (limited('hover', 40)) return;
      const d = output(uiBus, null, null, 0.12, 0.03);
      if (!d) return;
      tone(d, ac.currentTime, { type: 'sine', f0: 2200, dur: 0.02, vol: 0.2 });
    },
    spawn(o) {
      const d = output(uiBus, o.x, o.y, 0.3, 0.2);
      if (!d) return;
      const t = ac.currentTime;
      tone(d, t, { type: 'sine', f0: 380, f1: 1100, dur: 0.12, vol: 0.25 });
      tone(d, t + 0.05, { type: 'triangle', f0: 760, f1: 1500, dur: 0.1, vol: 0.12 });
    },
    remove(o) {
      const d = output(uiBus, o.x, o.y, 0.3, 0.2);
      if (!d) return;
      tone(d, ac.currentTime, { type: 'sine', f0: 900, f1: 180, dur: 0.14, vol: 0.25 });
      noise(d, ac.currentTime, { f0: 2000, f1: 400, dur: 0.12, vol: 0.15 });
    },
    freeze(o) {
      const d = output(uiBus, o.x, o.y, 0.3, 0.35);
      if (!d) return;
      const t = ac.currentTime;
      tone(d, t, { type: 'sine', f0: 2000, dur: 0.25, vol: 0.12 });
      tone(d, t + 0.04, { type: 'sine', f0: 2660, dur: 0.22, vol: 0.1 });
      noise(d, t, { f0: 6000, dur: 0.15, vol: 0.1, filter: 'highpass' });
    },
    weld(o) {
      const d = output(uiBus, o.x, o.y, 0.35, 0.25);
      if (!d) return;
      noise(d, ac.currentTime, { f0: 3500, dur: 0.18, vol: 0.3, q: 3 });
      tone(d, ac.currentTime, { type: 'square', f0: 140, dur: 0.12, vol: 0.08 });
    },
    error() {
      const d = output(uiBus, null, null, 0.3, 0.2);
      if (!d) return;
      tone(d, ac.currentTime, { type: 'square', f0: 220, f1: 180, dur: 0.14, vol: 0.12, filter: 'lowpass', ff: 1200 });
    },
    reload(o) {
      const d = output(sfxBus, o.x, o.y, 0.3, 0.5);
      if (!d) return;
      const t = ac.currentTime;
      noise(d, t, { f0: 1800, q: 5, dur: 0.06, vol: 0.4 });
      tone(d, t + 0.2, { type: 'sawtooth', f0: 300, f1: 900, dur: 0.18, vol: 0.1, filter: 'lowpass', ff: 1500 });
      noise(d, t + 0.36, { f0: 2400, q: 6, dur: 0.05, vol: 0.4 });
    },
    empty(o) {
      if (limited('empty', 150)) return;
      const d = output(sfxBus, o.x, o.y, 0.25, 0.08);
      if (!d) return;
      noise(d, ac.currentTime, { f0: 2500, q: 8, dur: 0.04, vol: 0.3 });
    },
    rocket(o) {
      const d = output(sfxBus, o.x, o.y, o.vol || 0.5, 0.7);
      if (!d) return;
      const t = ac.currentTime;
      noise(d, t, { brown: true, filter: 'lowpass', f0: 2000, f1: 400, dur: 0.6, vol: 0.9 });
      tone(d, t, { type: 'sawtooth', f0: 200, f1: 60, dur: 0.4, vol: 0.15 });
    },
    glass(o) {
      const d = output(sfxBus, o.x, o.y, 0.5, 0.6);
      if (!d) return;
      const t = ac.currentTime;
      for (let i = 0; i < 5; i++) tone(d, t + i * 0.03, { type: 'sine', f0: R(2500, 5000), dur: 0.25, vol: 0.08 });
      noise(d, t, { f0: 6000, dur: 0.2, vol: 0.3, filter: 'highpass' });
    },
    jump(o) {
      if (limited('jump', 100)) return;
      const d = output(sfxBus, o.x, o.y, 0.2, 0.15);
      if (!d) return;
      noise(d, ac.currentTime, { filter: 'lowpass', f0: 500, dur: 0.08, vol: 0.4 });
    },
  };

  /* ---------- continuous voices (hums, engines) ---------- */
  class Loop {
    constructor(kind, opts = {}) {
      this.kind = kind; this.alive = true;
      this.out = ac.createGain(); this.out.gain.value = 0;
      this.pan = ac.createStereoPanner ? ac.createStereoPanner() : null;
      if (this.pan) { this.out.connect(this.pan); this.pan.connect(sfxBus); } else this.out.connect(sfxBus);
      this.nodes = [];
      const t = ac.currentTime;
      if (kind === 'saber') {
        const base = opts.pitch || 1;
        const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 520; f.Q.value = 2;
        this.filter = f;
        const o1 = ac.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = 88 * base;
        const o2 = ac.createOscillator(); o2.type = 'sawtooth'; o2.frequency.value = 91.5 * base;
        const o3 = ac.createOscillator(); o3.type = 'sine'; o3.frequency.value = 176 * base;
        const g3 = ac.createGain(); g3.gain.value = 0.4;
        o1.connect(f); o2.connect(f); o3.connect(g3); g3.connect(f); f.connect(this.out);
        this.oscs = [o1, o2, o3]; this.basePitch = base;
        [o1, o2, o3].forEach((o) => o.start(t));
        this.nodes.push(o1, o2, o3, f, g3);
      } else if (kind === 'engine' || kind === 'jet' || kind === 'hover') {
        const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = kind === 'jet' ? 1200 : 500; f.Q.value = 1;
        this.filter = f;
        const n = ac.createBufferSource(); n.buffer = brown; n.loop = true;
        const ng = ac.createGain(); ng.gain.value = kind === 'jet' ? 1.2 : 0.7;
        n.connect(ng); ng.connect(f);
        const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.value = opts.freq || 70;
        const og = ac.createGain(); og.gain.value = kind === 'jet' ? 0.05 : 0.25;
        o.connect(og); og.connect(f);
        f.connect(this.out);
        n.start(t, Math.random()); o.start(t);
        this.oscs = [o]; this.baseFreq = opts.freq || 70;
        this.nodes.push(n, ng, o, og, f);
        this.srcs = [n];
      } else if (kind === 'lightningLoop') {
        const n = ac.createBufferSource(); n.buffer = white; n.loop = true;
        const f = ac.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 2500;
        n.connect(f); f.connect(this.out); n.start(t);
        this.nodes.push(n, f); this.srcs = [n]; this.oscs = [];
      }
      loops.add(this);
    }
    set(vol, pitch, x, y) {
      if (!this.alive) return;
      const sp = spatial(x, y);
      const g = sp ? vol * sp.g : 0;
      const t = ac.currentTime;
      this.out.gain.setTargetAtTime(g, t, 0.05);
      if (this.pan && sp) this.pan.pan.setTargetAtTime(sp.pan, t, 0.05);
      if (this.kind === 'saber' && pitch != null) {
        const p = this.basePitch * pitch;
        this.oscs[0].frequency.setTargetAtTime(88 * p, t, 0.03);
        this.oscs[1].frequency.setTargetAtTime(91.5 * p, t, 0.03);
        this.oscs[2].frequency.setTargetAtTime(176 * p, t, 0.03);
        this.filter.frequency.setTargetAtTime(420 + (pitch - 1) * 2500, t, 0.03);
      } else if (pitch != null && this.oscs && this.oscs[0]) {
        this.oscs[0].frequency.setTargetAtTime(this.baseFreq * pitch, t, 0.08);
        if (this.filter) this.filter.frequency.setTargetAtTime(300 + pitch * 500, t, 0.08);
      }
    }
    stop() {
      if (!this.alive) return;
      this.alive = false;
      loops.delete(this);
      const t = ac.currentTime;
      this.out.gain.setTargetAtTime(0, t, 0.05);
      setTimeout(() => {
        for (const n of this.nodes) { try { if (n.stop) n.stop(); } catch (e) { /* noop */ } try { n.disconnect(); } catch (e) { /* noop */ } }
        try { this.out.disconnect(); if (this.pan) this.pan.disconnect(); } catch (e) { /* noop */ }
      }, 300);
    }
  }

  /* ---------- ambience ---------- */
  function stopAmbience() {
    if (!ambience) return;
    const a = ambience; ambience = null;
    a.gain.gain.setTargetAtTime(0, ac.currentTime, 0.4);
    setTimeout(() => { for (const n of a.nodes) { try { if (n.stop) n.stop(); n.disconnect(); } catch (e) { /* noop */ } } }, 2000);
  }

  function startAmbience(kind) {
    if (!ac) return;
    stopAmbience();
    if (!kind || kind === 'none') return;
    const t = ac.currentTime;
    const gain = ac.createGain(); gain.gain.value = 0; gain.connect(ambBus);
    gain.gain.setTargetAtTime(1, t, 1);
    const nodes = [gain];
    const addNoise = (buf, type, freq, q, vol, lfoRate, lfoDepth) => {
      const n = ac.createBufferSource(); n.buffer = buf; n.loop = true;
      const f = ac.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
      const g = ac.createGain(); g.gain.value = vol;
      n.connect(f); f.connect(g); g.connect(gain); n.start(t, Math.random());
      nodes.push(n, f, g);
      if (lfoRate) {
        const l = ac.createOscillator(); l.frequency.value = lfoRate;
        const lg = ac.createGain(); lg.gain.value = lfoDepth;
        l.connect(lg); lg.connect(f.frequency); l.start(t); nodes.push(l, lg);
      }
    };
    const addTone = (type, freq, vol, lfoRate) => {
      const o = ac.createOscillator(); o.type = type; o.frequency.value = freq;
      const g = ac.createGain(); g.gain.value = vol;
      o.connect(g); g.connect(gain); o.start(t); nodes.push(o, g);
      if (lfoRate) {
        const l = ac.createOscillator(); l.frequency.value = lfoRate;
        const lg = ac.createGain(); lg.gain.value = vol * 0.6;
        l.connect(lg); lg.connect(g.gain); l.start(t); nodes.push(l, lg);
      }
    };
    switch (kind) {
      case 'wind': addNoise(brown, 'lowpass', 500, 0.7, 0.35, 0.08, 300); addNoise(white, 'bandpass', 1800, 6, 0.02, 0.13, 800); break;
      case 'desert': addNoise(brown, 'lowpass', 380, 0.5, 0.25, 0.05, 200); addNoise(white, 'bandpass', 3200, 3, 0.012, 0.21, 1000); break;
      case 'hangar': addTone('sine', 55, 0.08); addTone('sine', 110, 0.03, 0.2); addNoise(brown, 'lowpass', 250, 0.5, 0.12); break;
      case 'station': addTone('sine', 48, 0.1); addTone('triangle', 96, 0.025, 0.1); addNoise(white, 'bandpass', 900, 8, 0.01, 0.05, 200); break;
      case 'facility': addTone('sine', 60, 0.08); addNoise(brown, 'lowpass', 180, 0.5, 0.15); addTone('sawtooth', 120, 0.006); break;
      case 'battle': addNoise(brown, 'lowpass', 300, 0.5, 0.2, 0.05, 100); break;
      case 'temple': addTone('sine', 220, 0.018, 0.07); addTone('sine', 329.6, 0.012, 0.05); addTone('sine', 110, 0.02); addNoise(brown, 'lowpass', 300, 0.5, 0.05); break;
      case 'lava': addNoise(brown, 'lowpass', 140, 0.8, 0.45, 0.1, 50); addTone('sine', 38, 0.12, 0.13); break;
      case 'factory': addTone('square', 50, 0.01); addNoise(brown, 'lowpass', 220, 0.5, 0.18); break;
      case 'space': addTone('sine', 36, 0.07, 0.04); addNoise(white, 'bandpass', 600, 10, 0.006, 0.03, 200); break;
    }
    ambience = { kind, gain, nodes };
  }

  function ambientEvents(dt) {
    if (!ambience) return;
    ambTimer -= dt;
    if (ambTimer > 0) return;
    const k = ambience.kind;
    const x = cam ? cam.x + R(-30, 30) : 0;
    const y = cam ? cam.y - 5 : 0;
    if (k === 'battle') { ambTimer = R(1.5, 5); distantBoom(R(0.1, 0.3)); if (Math.random() < 0.5) distantBlasts(); }
    else if (k === 'factory') { ambTimer = R(0.8, 2.5); const d = output(ambBus, null, null, 0.25, 0.4); if (d) { noise(d, ac.currentTime, { f0: R(900, 2000), q: 8, dur: 0.2, vol: 0.4 }); tone(d, ac.currentTime, { type: 'sine', f0: R(300, 600), dur: 0.3, vol: 0.1 }); } }
    else if (k === 'lava') { ambTimer = R(0.6, 2); const d = output(ambBus, null, null, 0.2, 0.3); if (d) noise(d, ac.currentTime, { brown: true, filter: 'lowpass', f0: 300, dur: 0.25, vol: 0.6 }); }
    else if (k === 'hangar' || k === 'station') { ambTimer = R(4, 10); presets.droidBeep({ x, y, vol: 0.08 }); }
    else if (k === 'facility') { ambTimer = R(5, 12); const d = output(ambBus, null, null, 0.2, 1.2); if (d) { tone(d, ac.currentTime, { type: 'square', f0: 440, dur: 0.25, vol: 0.05, filter: 'lowpass', ff: 900 }); tone(d, ac.currentTime + 0.4, { type: 'square', f0: 440, dur: 0.25, vol: 0.05, filter: 'lowpass', ff: 900 }); } }
    else ambTimer = 5;
  }
  function distantBoom(vol) {
    const d = output(ambBus, null, null, vol, 2);
    if (!d) return;
    noise(d, ac.currentTime, { brown: true, filter: 'lowpass', f0: 400, f1: 60, dur: 1.6, vol: 0.9 });
  }
  function distantBlasts() {
    const d = output(ambBus, null, null, 0.06, 1.2);
    if (!d) return;
    let t = ac.currentTime;
    for (let i = 0; i < GP.M.randInt(2, 5); i++) {
      tone(d, t, { type: 'sawtooth', f0: 1600, f1: 150, dur: 0.14, vol: 0.2, filter: 'lowpass', ff: 1200 });
      t += R(0.08, 0.2);
    }
  }

  GP.Events.on('settings:changed', applyVolumes);
  const unlock = () => { ensure(); };
  window.addEventListener('pointerdown', unlock, { capture: true });
  window.addEventListener('keydown', unlock, { capture: true });

  return {
    ensure,
    get ready() { return !!ac && ac.state === 'running'; },
    setCamera(c) { cam = c; },
    play(name, opts = {}) {
      if (!ac || ac.state !== 'running') return;
      const p = presets[name];
      if (!p) return;
      try { p(opts); } catch (e) { console.warn('sound', name, e); }
    },
    loop(kind, opts) {
      if (!ac || ac.state !== 'running') return null;
      try {
        const l = new Loop(kind, opts);
        if (pitch !== 1) { for (const o of l.oscs || []) o.detune.value = 1200 * Math.log2(pitch); for (const n of l.srcs || []) n.playbackRate.value = pitch; }
        return l;
      } catch (e) { return null; }
    },
    setTime,
    timeInfo: () => ({ pitch, paused: timeState.paused, world: worldGain ? worldGain.gain.value : null, cutoff: worldFilter ? worldFilter.frequency.value : null, wet: verbWet ? verbWet.gain.value : null }),
    stopAllLoops() { for (const l of Array.from(loops)) l.stop(); },
    loopCount() { return loops.size; },
    ambience: startAmbience,
    stopAmbience,
    update(dt) { if (ac) ambientEvents(dt); },
    applyVolumes,
  };
})();
