import * as THREE from 'three';
import { clamp, rand, mulberry32 } from './util.js';
import { speakable } from './pronounce.js';

const TAU = Math.PI * 2;
const _p = new THREE.Vector3();

// ---------------------------------------------------------------------------
// Procedural sample bank: every buffer is rendered sample-by-sample at start-up.
// (Everything is synthesized; the game ships no audio files.)
// ---------------------------------------------------------------------------
function normalize(d, peak = 0.9) {
  let m = 0;
  for (let i = 0; i < d.length; i++) m = Math.max(m, Math.abs(d[i]));
  if (m > 0) for (let i = 0; i < d.length; i++) d[i] *= peak / m;
}

/**
 * A blaster shot: a fast descending "pew" chirp with metallic partials, a dispersed transient
 * (the struck-steel-cable twang), a short comb filter for ring, and a low body thump.
 */
const BLASTERS = {
  rifle:  { f0: 2500, f1: 330, tau: 0.045, decay: 0.15, partials: [[1, 1], [2.01, 0.42], [3.03, 0.18], [4.07, 0.08]], thump: 0.75, comb: [1.7, 0.52], click: 0.9, dur: 0.42 },
  pistol: { f0: 3100, f1: 620, tau: 0.03, decay: 0.095, partials: [[1, 1], [2.02, 0.35], [3.05, 0.12]], thump: 0.32, comb: [1.15, 0.45], click: 0.8, dur: 0.3 },
  droid:  { f0: 2700, f1: 760, tau: 0.034, decay: 0.11, partials: [[1, 1], [3.0, 0.45], [5.0, 0.22]], thump: 0.08, comb: [0.9, 0.38], click: 0.6, dur: 0.3 },
  b2:     { f0: 1600, f1: 430, tau: 0.028, decay: 0.08, partials: [[1, 1], [2, 0.5], [3, 0.3]], thump: 0.25, comb: [1.3, 0.4], click: 0.5, buzz: 160, dur: 0.25 },
  rebel:  { f0: 2200, f1: 390, tau: 0.05, decay: 0.13, partials: [[1, 1], [1.5, 0.3], [2.03, 0.3]], thump: 0.5, comb: [2.1, 0.5], click: 0.8, dur: 0.4 },
  cannon: { f0: 1100, f1: 120, tau: 0.08, decay: 0.3, partials: [[1, 1], [2.02, 0.4]], thump: 1.0, comb: [3.2, 0.5], click: 0.6, dur: 0.6 },
  // Jawa ion scatter blaster: a buzzy, blunt burst
  scatter: { f0: 1700, f1: 380, tau: 0.03, decay: 0.12, partials: [[1, 1], [1.5, 0.45], [2.5, 0.3]], thump: 0.45, comb: [1.0, 0.5], click: 1.0, buzz: 95, dur: 0.36 },
  // Tusken cycler rifle: a slugthrower crack with a long rolling echo
  slug: { f0: 900, f1: 180, tau: 0.008, decay: 0.05, partials: [[1, 0.25], [2.7, 0.1]], thump: 1.2, comb: [4.6, 0.6], click: 1.8, dur: 0.6 },
};

function renderBlaster(d, sr, v, rnd) {
  const n = d.length;
  const ph = [0, 0, 0, 0];
  const j = 0.95 + rnd() * 0.1;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const f = (v.f1 + (v.f0 - v.f1) * Math.exp(-t / v.tau)) * j;
    const env = Math.min(1, t / 0.0015) * Math.exp(-t / v.decay);
    let s = 0;
    for (let k = 0; k < v.partials.length; k++) {
      ph[k] += (TAU * f * v.partials[k][0]) / sr;
      s += Math.sin(ph[k]) * v.partials[k][1];
    }
    if (v.buzz) s *= 0.6 + 0.4 * Math.sign(Math.sin(TAU * v.buzz * t));
    d[i] = s * env;
  }
  // transient, smeared by a cascade of allpasses (high frequencies arrive first: the twang)
  const cl = Math.min(n, Math.floor(0.05 * sr)), cn = Math.floor(0.005 * sr);
  const click = new Float32Array(cl);
  for (let i = 0; i < cn; i++) click[i] = (rnd() * 2 - 1) * (1 - i / cn);
  for (let s = 0; s < 28; s++) {
    let x1 = 0, y1 = 0;
    for (let i = 0; i < cl; i++) { const x = click[i]; const y = 0.62 * x + x1 - 0.62 * y1; x1 = x; y1 = y; click[i] = y; }
  }
  for (let i = 0; i < cl; i++) d[i] += click[i] * v.click;
  // short comb: metallic ring
  const D = Math.max(1, Math.floor(v.comb[0] * 0.001 * sr)), g = v.comb[1];
  for (let i = D; i < n; i++) d[i] += g * d[i - D];
  // body thump underneath
  let tp = 0;
  const tn = Math.min(n, Math.floor(0.1 * sr));
  for (let i = 0; i < tn; i++) {
    const t = i / sr;
    tp += (TAU * (48 + 120 * Math.exp(-t / 0.018))) / sr;
    d[i] += Math.sin(tp) * v.thump * 1.4 * Math.exp(-t / 0.04);
  }
  for (let i = 0; i < n; i++) d[i] = Math.tanh(d[i] * 1.5);
}

function renderExplosion(d, sr, rnd) {
  const n = d.length;
  let ph = 0, lp = 0, lp2 = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    // sub-bass boom
    ph += (TAU * (26 + 52 * Math.exp(-t / 0.22))) / sr;
    let s = Math.sin(ph) * Math.exp(-t / 0.75) * Math.min(1, t / 0.004) * 1.2;
    // the crack: noise through a lowpass that sweeps down
    const fc = 200 + 7000 * Math.exp(-t / 0.12);
    const a = 1 - Math.exp((-TAU * fc) / sr);
    lp += a * (rnd() * 2 - 1 - lp);
    lp2 += 0.02 * (lp - lp2);
    s += (lp * 1.1 + lp2 * 3) * Math.exp(-t / 0.5) * Math.min(1, t / 0.002);
    d[i] = s;
  }
  // crackle tail
  for (let k = 0; k < 700; k++) {
    const t = 0.05 + Math.pow(rnd(), 1.7) * 2.0;
    const at = Math.floor(t * sr), amp = 0.5 * Math.exp(-t / 0.8) * rnd();
    for (let i = 0; i < 60 && at + i < n; i++) d[at + i] += (rnd() * 2 - 1) * amp * Math.exp(-i / 12);
  }
  // debris rattle: little metal pings and clatter
  for (let k = 0; k < 26; k++) {
    const t = 0.3 + rnd() * 1.6, f = 1800 + rnd() * 3000;
    const at = Math.floor(t * sr), amp = 0.18 * Math.exp(-(t - 0.3) / 1.2);
    for (let i = 0; i < 900 && at + i < n; i++) d[at + i] += Math.sin((TAU * f * i) / sr) * amp * Math.exp(-i / 160);
  }
  normalize(d, 0.95);
}

/** Bolt whizzing past the helmet: a Doppler "zzzip" (pitch drops as it passes). */
function renderWhiz(d, sr, rnd) {
  const n = d.length;
  let ph = 0, nz = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const x = (t - 0.16) / 0.055;
    const env = Math.exp(-x * x * (x < 0 ? 0.6 : 1.4));
    const f = 820 + 520 * Math.tanh(-(t - 0.16) / 0.025);
    ph += (TAU * f) / sr;
    nz += 0.35 * (rnd() * 2 - 1 - nz);
    const buzz = Math.sin(ph) + 0.5 * Math.sin(2 * ph) + 0.3 * Math.sin(3 * ph);
    d[i] = (buzz * 0.55 + nz * 0.9) * env;
  }
  normalize(d, 0.9);
}

/** Inharmonic metal ping (droid hits); `low` gives the heavier headshot crunch. */
function renderPing(d, sr, rnd, low) {
  const n = d.length;
  const parts = low ? [[1500, 1, 0.16], [2380, 0.7, 0.1], [3650, 0.4, 0.06]] : [[2650, 1, 0.2], [4090, 0.6, 0.13], [5930, 0.4, 0.09], [7300, 0.25, 0.06]];
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    let s = 0;
    for (const [f, a, dec] of parts) s += Math.sin(TAU * f * (1 + rnd() * 0.0005) * t) * a * Math.exp(-t / dec);
    const click = (rnd() * 2 - 1) * Math.exp(-t / (low ? 0.02 : 0.004)) * (low ? 1.2 : 0.8);
    d[i] = s * 0.5 + click;
  }
  normalize(d, 0.9);
}

/** Bolt hitting a wall: a sharp crack and a sizzling hiss. */
function renderSizzle(d, sr, rnd) {
  const n = d.length;
  let hp = 0, prev = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const w = rnd() * 2 - 1;
    hp = 0.85 * (hp + w - prev);
    prev = w;
    const crack = w * Math.exp(-t / 0.006) * 1.4;
    const crackle = rnd() < 0.02 * Math.exp(-t / 0.15) ? (rnd() * 2 - 1) * 2 : 0;
    d[i] = crack + hp * 0.45 * Math.exp(-t / 0.14) + crackle * Math.exp(-t / 0.2);
  }
  normalize(d, 0.85);
}

// ---------------------------------------------------------------------------
// Music: an original orchestral battle score (D minor) in intensity layers
// ---------------------------------------------------------------------------
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const CHORDS_A = [[50, 53, 57], [46, 50, 53], [48, 52, 55], [45, 49, 52]]; // Dm  Bb  C  A
const CHORDS_B = [[50, 53, 57], [43, 46, 50], [46, 50, 53], [45, 49, 52]]; // Dm  Gm  Bb A
const GALLOP = [0, 3, 6, 8, 11, 14]; // 3+3+2 accents per bar of 16ths
// the heroic minor motif: [bar, step, midi, length in 16ths]
const MOTIF = [
  [0, 0, 74, 6], [0, 6, 72, 2], [0, 8, 74, 4], [0, 12, 77, 4],
  [1, 0, 74, 8], [1, 8, 72, 4], [1, 12, 70, 4],
  [2, 0, 72, 6], [2, 6, 74, 2], [2, 8, 76, 4], [2, 12, 79, 4],
  [3, 0, 81, 10], [3, 10, 76, 2], [3, 12, 73, 4],
];

/** All sound is synthesized with WebAudio, so the game needs no audio files. */
export class Sound {
  constructor() {
    this.ctx = null;
    this.volume = 0.8;
    this.musicVolume = 0.45;
    this.listenerPos = new THREE.Vector3();
    this.listenerRight = new THREE.Vector3(1, 0, 0);
    this.listenerFwd = new THREE.Vector3(0, 0, -1);
    this.jetLevel = 0;
    this._last = {};
    this.intensity = 0;
    this.lowHp = 0;
    this.shock = 0;
    this.ambT = 2;
    this.beatT = 0;
    this.breathT = 0;
  }

  init() {
    if (this.ctx) { this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.2;
    this.master.connect(comp).connect(ctx.destination);
    // world bus (muffled by shell shock / low health) and an unmuffled UI bus
    this.worldLP = ctx.createBiquadFilter();
    this.worldLP.type = 'lowpass'; this.worldLP.frequency.value = 20000; this.worldLP.Q.value = 0.5;
    this.worldLP.connect(this.master);
    this.sfx = ctx.createGain(); this.sfx.connect(this.worldLP);
    this.uiBus = ctx.createGain(); this.uiBus.connect(this.master);
    this.music = ctx.createGain(); this.music.gain.value = this.musicVolume; this.music.connect(this.master);
    // slapback echo off the skyscrapers: two short delays, darkened
    this.echo = ctx.createGain();
    const eHP = ctx.createBiquadFilter(); eHP.type = 'highpass'; eHP.frequency.value = 350;
    const eLP = ctx.createBiquadFilter(); eLP.type = 'lowpass'; eLP.frequency.value = 2600;
    this.echo.connect(eHP).connect(eLP);
    for (const [t, fb, lvl] of [[0.13, 0.3, 0.7], [0.29, 0.22, 0.5]]) {
      const dl = ctx.createDelay(1); dl.delayTime.value = t;
      const f = ctx.createGain(); f.gain.value = fb;
      const o = ctx.createGain(); o.gain.value = lvl;
      eLP.connect(dl); dl.connect(f).connect(dl); dl.connect(o).connect(this.sfx);
    }
    // shared white noise
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this._bank();
    this._ambience();
    this._jetLoop();
    this._musicStart();
    if (this.desert) this.setDesert(true);
  }

  _bank() {
    const ctx = this.ctx, sr = ctx.sampleRate, rnd = mulberry32(2024);
    const buf = (dur, fn) => { const b = ctx.createBuffer(1, Math.ceil(dur * sr), sr); fn(b.getChannelData(0)); return b; };
    this.bank = {};
    for (const [k, v] of Object.entries(BLASTERS)) {
      this.bank[k] = [0, 1, 2].map(() => buf(v.dur, (d) => { renderBlaster(d, sr, v, rnd); normalize(d, 0.9); }));
    }
    this.bank.explosion = [0, 1, 2].map(() => buf(2.6, (d) => renderExplosion(d, sr, rnd)));
    this.bank.whiz = [0, 1].map(() => buf(0.4, (d) => renderWhiz(d, sr, rnd)));
    this.bank.ping = [0, 1].map(() => buf(0.32, (d) => renderPing(d, sr, rnd, false)));
    this.bank.crunch = [buf(0.25, (d) => renderPing(d, sr, rnd, true))];
    this.bank.sizzle = [0, 1].map(() => buf(0.4, (d) => renderSizzle(d, sr, rnd)));
  }

  setVolume(v) { this.volume = v; if (this.master) this.master.gain.value = v; }
  setMusicVolume(v) { this.musicVolume = v; if (this.music) this.music.gain.setTargetAtTime(v, this.ctx.currentTime, 0.3); }

  setListener(pos, right) {
    this.listenerPos.copy(pos);
    this.listenerRight.copy(right);
    this.listenerFwd.set(-right.z, 0, right.x);
  }

  /** Output chain for a sound: distance attenuation, stereo pan, distance filtering and the city echo. */
  _out(pos, vol = 1, ref = 14) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    let gain = vol, pan = 0, dist = 0;
    if (pos) {
      const dx = pos.x - this.listenerPos.x, dy = pos.y - this.listenerPos.y, dz = pos.z - this.listenerPos.z;
      dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      gain = vol / (1 + Math.max(0, dist - 2) / ref);
      if (dist > 0.5) pan = clamp((dx * this.listenerRight.x + dz * this.listenerRight.z) / dist, -1, 1) * 0.8;
    }
    g.gain.value = gain;
    let tail = g;
    if (pos && dist > 22) {
      // distant: thinner (high-passed) and duller
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = Math.min(650, (dist - 22) * 4);
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = Math.max(1400, 15000 / (1 + (dist - 22) / 35));
      g.connect(hp).connect(lp);
      tail = lp;
    }
    const bus = pos ? this.sfx : this.uiBus;
    if (ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      tail.connect(p).connect(bus);
    } else tail.connect(bus);
    if (pos && dist > 10) {
      const s = ctx.createGain();
      s.gain.value = gain * clamp((dist - 10) / 70, 0, 1) * 1.4;
      tail.connect(s).connect(this.echo);
    }
    return { node: g, gain, dist };
  }

  _play(bufs, pos, vol, ref, rate = 1) {
    const out = this._out(pos, vol, ref);
    if (out.gain < 0.003) return null;
    const s = this.ctx.createBufferSource();
    s.buffer = bufs[Math.floor(Math.random() * bufs.length)];
    s.playbackRate.value = rate;
    s.connect(out.node);
    s.start();
    return out;
  }

  _throttle(key, ms) {
    const now = performance.now();
    if (this._last[key] && now - this._last[key] < ms) return true;
    this._last[key] = now;
    return false;
  }

  _noiseSrc(t, dur) {
    const n = this.ctx.createBufferSource();
    n.buffer = this.noise;
    n.start(t, Math.random() * 1.5, dur + 0.05);
    return n;
  }

  /** Blaster shot. Each weapon has its own voice; distant shots pick up the city echo. */
  shot(kind, pos) {
    if (!this.ctx) return;
    const vol = { rifle: 0.42, pistol: 0.34, droid: 0.22, b2: 0.24, rebel: 0.3, cannon: 0.5, scatter: 0.3, slug: 0.5 }[kind] || 0.25;
    this._play(this.bank[kind] || this.bank.droid, pos, vol, 18, rand(0.95, 1.05));
  }

  explosion(pos, big = 1) {
    if (!this.ctx) return;
    const out = this._play(this.bank.explosion, pos, 1.1 * Math.min(1.4, big), 30, rand(0.9, 1.08) / Math.sqrt(Math.max(0.6, big)));
    // shell shock: ring + muffle on close blasts
    if (out && out.dist < 11) this.shellShock(clamp((11 - out.dist) / 8, 0.25, 1) * Math.min(1, big));
  }

  shellShock(k) {
    const ctx = this.ctx, t = ctx.currentTime;
    this.shock = Math.max(this.shock, 1.6 * k);
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = 3900;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.06 * k, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.8);
    o.connect(g).connect(this.uiBus); o.start(t); o.stop(t + 1.85);
  }

  /** Bolt impacts: 'metal' ping (droids), 'wall' sizzle-crack, 'head' heavier crunch. */
  impact(pos, kind = 'metal') {
    if (!this.ctx || this._throttle('impact', 25)) return;
    if (kind === true) kind = 'metal';
    if (kind === false) kind = 'wall';
    if (kind === 'head') this._play(this.bank.crunch, pos, 0.45, 10, rand(0.95, 1.05));
    else if (kind === 'metal') this._play(this.bank.ping, pos, 0.3, 10, rand(0.9, 1.1));
    else this._play(this.bank.sizzle, pos, 0.32, 10, rand(0.9, 1.1));
  }

  /** Doppler "zzzip" of an enemy bolt passing close by. */
  whiz(pos) {
    if (!this.ctx || this._throttle('whiz', 70)) return;
    this._play(this.bank.whiz, pos, 0.55, 4, rand(0.9, 1.15));
  }

  hurt() {
    if (!this.ctx || this._throttle('hurt', 90)) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const out = this._out(null, 0.5);
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(160, t); o.frequency.exponentialRampToValueAtTime(55, t + 0.18);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.9, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    o.connect(g).connect(out.node); o.start(t); o.stop(t + 0.25);
    const n = this._noiseSrc(t, 0.1);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
    const ng = ctx.createGain(); ng.gain.setValueAtTime(0.5, t); ng.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    n.connect(lp).connect(ng).connect(out.node);
  }

  /** Crisp tick on a hit. */
  hitConfirm(head) {
    if (!this.ctx || this._throttle('hitc', 40)) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const out = this._out(null, head ? 0.14 : 0.08);
    const o = ctx.createOscillator(); o.type = 'square';
    o.frequency.setValueAtTime(head ? 3400 : 2600, t);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.6, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.025);
    o.connect(g).connect(out.node); o.start(t); o.stop(t + 0.03);
  }

  /** Deeper, satisfying confirm on a kill; a crunchy metal ping on a headshot kill. */
  killConfirm(head) {
    if (!this.ctx || this._throttle('killc', 60)) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const out = this._out(null, 0.3);
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(head ? 420 : 300, t); o.frequency.exponentialRampToValueAtTime(head ? 180 : 120, t + 0.14);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.9, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    o.connect(g).connect(out.node); o.start(t); o.stop(t + 0.22);
    const k = ctx.createOscillator(); k.type = 'square'; k.frequency.value = 2600;
    const kg = ctx.createGain(); kg.gain.setValueAtTime(0.25, t); kg.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
    k.connect(kg).connect(out.node); k.start(t); k.stop(t + 0.04);
    if (head) {
      const s = ctx.createBufferSource(); s.buffer = this.bank.crunch[0];
      const sg = ctx.createGain(); sg.gain.value = 0.35;
      s.connect(sg).connect(out.node); s.start(t + 0.01);
    }
  }

  /** Active cooling: a mechanical ka-chunk on a perfect vent, a fizzle on a miss. */
  vent(ok) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const out = this._out(null, 0.35);
    if (ok) {
      for (const [dt, f] of [[0, 900], [0.09, 600]]) {
        const n = this._noiseSrc(t + dt, 0.05);
        const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f * 2; bp.Q.value = 3;
        const g = ctx.createGain(); g.gain.setValueAtTime(0.9, t + dt); g.gain.exponentialRampToValueAtTime(0.001, t + dt + 0.06);
        n.connect(bp).connect(g).connect(out.node);
        const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(f / 5, t + dt); o.frequency.exponentialRampToValueAtTime(f / 12, t + dt + 0.1);
        const og = ctx.createGain(); og.gain.setValueAtTime(0.8, t + dt); og.gain.exponentialRampToValueAtTime(0.001, t + dt + 0.12);
        o.connect(og).connect(out.node); o.start(t + dt); o.stop(t + dt + 0.13);
      }
      const n = this._noiseSrc(t + 0.12, 0.5);
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.setValueAtTime(1500, t + 0.12); hp.frequency.exponentialRampToValueAtTime(6000, t + 0.6);
      const g = ctx.createGain(); g.gain.setValueAtTime(0.5, t + 0.12); g.gain.exponentialRampToValueAtTime(0.001, t + 0.62);
      n.connect(hp).connect(g).connect(out.node);
      this.tone([880, 1320], 0.1, 'triangle', 0.12, 0.06);
    } else {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(220, t); o.frequency.exponentialRampToValueAtTime(70, t + 0.35);
      const g = ctx.createGain(); g.gain.setValueAtTime(0.25, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.38);
      o.connect(g).connect(out.node); o.start(t); o.stop(t + 0.4);
    }
  }

  abilityReady() { this.tone([1040, 1560], 0.14, 'triangle', 0.1, 0.07); }

  ability(kind) {
    if (kind === 'command') this.tone([392, 523, 659, 784], 0.22, 'sawtooth', 0.07, 0.07);
    else this.tone([180, 90], 0.18, 'square', 0.1, 0.06);
  }

  /** Electric zap of the stun grenade. */
  stun(pos) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const out = this._out(pos, 0.5, 18);
    const o = ctx.createOscillator(); o.type = 'square'; o.frequency.setValueAtTime(95, t);
    const lfo = ctx.createOscillator(); lfo.frequency.value = 37;
    const lg = ctx.createGain(); lg.gain.value = 60;
    lfo.connect(lg).connect(o.frequency);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.9);
    o.connect(g).connect(out.node); o.start(t); o.stop(t + 0.92); lfo.start(t); lfo.stop(t + 0.92);
    const n = this._noiseSrc(t, 0.7);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 3200; bp.Q.value = 1.2;
    const ng = ctx.createGain(); ng.gain.setValueAtTime(0.7, t); ng.gain.exponentialRampToValueAtTime(0.001, t + 0.7);
    n.connect(bp).connect(ng).connect(out.node);
  }

  /** Helmet radio: squelch click + a burst of static around comms lines. */
  radio(open = true) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const out = this._out(null, 0.12);
    const n = this._noiseSrc(t, open ? 0.12 : 0.18);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2400; bp.Q.value = 0.8;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.8, t); g.gain.exponentialRampToValueAtTime(0.001, t + (open ? 0.12 : 0.18));
    n.connect(bp).connect(g).connect(out.node);
    const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = open ? 1800 : 1250;
    const og = ctx.createGain(); og.gain.setValueAtTime(0.25, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
    o.connect(og).connect(out.node); o.start(t); o.stop(t + 0.035);
  }

  tone(freqs, dur = 0.12, type = 'sine', vol = 0.18, gap = 0.08, pos = null) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    freqs.forEach((f, i) => {
      const t = ctx.currentTime + i * gap;
      const out = this._out(pos, vol);
      const o = ctx.createOscillator(); o.type = type; o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(1, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g).connect(out.node); o.start(t); o.stop(t + dur + 0.02);
    });
  }

  pickup() { this.tone([880, 1320], 0.14, 'triangle', 0.2, 0.07); }
  ui() { this.tone([1200], 0.05, 'square', 0.05); }
  beep(pos) { this.tone([2200], 0.06, 'square', 0.12, 0, pos); }
  ready() { this.tone([660, 990, 1320], 0.12, 'triangle', 0.18, 0.09); }

  overheat() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const out = this._out(null, 0.25);
    const n = this._noiseSrc(t, 1.2);
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2500;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.6, t); g.gain.exponentialRampToValueAtTime(0.001, t + 1.2);
    n.connect(hp).connect(g).connect(out.node);
    this.tone([700, 520], 0.12, 'square', 0.12, 0.1);
  }

  whoosh(pos) {
    if (!this.ctx || this._throttle('whoosh', 600)) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const out = this._out(pos, 0.5, 20);
    const n = this._noiseSrc(t, 1.2);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 2;
    bp.frequency.setValueAtTime(400, t); bp.frequency.exponentialRampToValueAtTime(1600, t + 0.5);
    bp.frequency.exponentialRampToValueAtTime(300, t + 1.1);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.7, t + 0.45);
    g.gain.exponentialRampToValueAtTime(0.001, t + 1.15);
    n.connect(bp).connect(g).connect(out.node);
  }

  /** A ship passing over: engine roar swelling and fading with a Doppler drop in the whine. heavy > 1 = bigger ship. */
  flyby(pos, heavy = 1) {
    if (!this.ctx || this._throttle('flyby', 700)) return;
    const ctx = this.ctx, t = ctx.currentTime, dur = 2.4 + heavy * 0.6;
    const out = this._out(pos, 0.75 * Math.min(1.6, heavy), 45);
    const n = this._noiseSrc(t, dur);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 1.4;
    lp.frequency.setValueAtTime(380, t); lp.frequency.exponentialRampToValueAtTime(2600 / heavy, t + dur * 0.45);
    lp.frequency.exponentialRampToValueAtTime(260, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(1, t + dur * 0.45);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    n.connect(lp).connect(g).connect(out.node);
    const f0 = 150 / heavy;
    for (const [type, mul, vol] of [['sawtooth', 1, 0.1], ['square', 1.5, 0.04]]) {
      const o = ctx.createOscillator(); o.type = type;
      o.frequency.setValueAtTime(f0 * mul * 1.25, t); o.frequency.exponentialRampToValueAtTime(f0 * mul * 1.1, t + dur * 0.42);
      o.frequency.exponentialRampToValueAtTime(f0 * mul * 0.72, t + dur * 0.6);
      const ol = ctx.createBiquadFilter(); ol.type = 'lowpass'; ol.frequency.value = 1100;
      const og = ctx.createGain();
      og.gain.setValueAtTime(0.0001, t); og.gain.exponentialRampToValueAtTime(vol, t + dur * 0.45);
      og.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(ol).connect(og).connect(out.node); o.start(t); o.stop(t + dur + 0.05);
    }
  }

  thump(pos) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const out = this._out(pos, 0.4);
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.2);
    const g = ctx.createGain(); g.gain.setValueAtTime(1, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    o.connect(g).connect(out.node); o.start(t); o.stop(t + 0.3);
  }

  door(pos) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const out = this._out(pos, 0.35);
    const n = this._noiseSrc(t, 0.7);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 3;
    bp.frequency.setValueAtTime(300, t); bp.frequency.linearRampToValueAtTime(900, t + 0.6);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.8, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.7);
    n.connect(bp).connect(g).connect(out.node);
  }

  /** Rocket droid jetpack roar; level is set every frame from the nearest flying droid. */
  _jetLoop() {
    const ctx = this.ctx;
    const n = ctx.createBufferSource(); n.buffer = this.noise; n.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 700; bp.Q.value = 0.7;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1800;
    this.jetGain = ctx.createGain(); this.jetGain.gain.value = 0;
    n.connect(bp).connect(lp).connect(this.jetGain).connect(this.sfx);
    n.start();
  }

  setJet(level) {
    if (!this.ctx) return;
    this.jetGain.gain.setTargetAtTime(clamp(level, 0, 1) * 0.35, this.ctx.currentTime, 0.08);
  }

  /** City wind + traffic hum (the battle layer is scheduled in update()). */
  _ambience() {
    const ctx = this.ctx;
    const n = ctx.createBufferSource(); n.buffer = this.noise; n.loop = true;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 380;
    const g = ctx.createGain(); g.gain.value = 0.09;
    this.ambLow = g;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.07;
    const lfoG = ctx.createGain(); lfoG.gain.value = 160;
    lfo.connect(lfoG).connect(lp.frequency);
    n.connect(lp).connect(g).connect(this.sfx);
    n.start(); lfo.start();
    // high gusting wind
    const w = ctx.createBufferSource(); w.buffer = this.noise; w.loop = true;
    const wb = ctx.createBiquadFilter(); wb.type = 'bandpass'; wb.frequency.value = 900; wb.Q.value = 0.6;
    const wg = ctx.createGain(); wg.gain.value = 0.025;
    const wl = ctx.createOscillator(); wl.frequency.value = 0.11;
    const wlg = ctx.createGain(); wlg.gain.value = 0.02;
    wl.connect(wlg).connect(wg.gain);
    w.connect(wb).connect(wg).connect(this.sfx);
    w.start(); wl.start();
    const hum = ctx.createOscillator(); hum.type = 'sine'; hum.frequency.value = 52;
    const hg = ctx.createGain(); hg.gain.value = 0.025;
    hum.connect(hg).connect(this.sfx); hum.start();
    this.ambHum = hg;
    // desert wind: a broad hiss that gusts (silent until Tatooine)
    const dw = ctx.createBufferSource(); dw.buffer = this.noise; dw.loop = true;
    const db = ctx.createBiquadFilter(); db.type = 'bandpass'; db.frequency.value = 520; db.Q.value = 0.45;
    this.desertWind = ctx.createGain(); this.desertWind.gain.value = 0;
    const dl = ctx.createOscillator(); dl.frequency.value = 0.09;
    const dlg = ctx.createGain(); dlg.gain.value = 180;
    dl.connect(dlg).connect(db.frequency);
    dw.connect(db).connect(this.desertWind).connect(this.sfx);
    dw.start(); dl.start();
    this._saberLoop();
    this._lightningLoop();
  }

  /** Tatooine: no city hum or slapback off the towers; wind, distant howls and the odd rifle crack instead. */
  setDesert(on) {
    this.desert = on;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.ambHum.gain.setTargetAtTime(on ? 0 : 0.025, t, 0.5);
    this.ambLow.gain.setTargetAtTime(on ? 0.05 : 0.09, t, 0.5);
    this.desertWind.gain.setTargetAtTime(on ? 0.075 : 0, t, 0.5);
    this.echo.gain.setTargetAtTime(on ? 0.2 : 1, t, 0.3);
  }

  /** Lightsaber hum (Dooku's, or Yoda's): level 0..1 set every frame from the nearest lit blade. */
  _saberLoop() {
    const ctx = this.ctx;
    this.saberGain = ctx.createGain(); this.saberGain.gain.value = 0;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700;
    for (const [type, f, v] of [['sawtooth', 92, 0.5], ['sine', 184, 0.6], ['sawtooth', 93.5, 0.35]]) {
      const o = ctx.createOscillator(); o.type = type; o.frequency.value = f;
      const g = ctx.createGain(); g.gain.value = v;
      o.connect(g).connect(lp); o.start();
    }
    lp.connect(this.saberGain).connect(this.sfx);
  }

  setSaber(level) {
    if (!this.ctx) return;
    this.saberGain.gain.setTargetAtTime(clamp(level, 0, 1) * 0.11, this.ctx.currentTime, 0.06);
  }

  /** Force lightning: a crackling, sizzling loop (level 0..1). */
  _lightningLoop() {
    const ctx = this.ctx, sr = ctx.sampleRate, len = sr * 2;
    const b = ctx.createBuffer(1, len, sr), d = b.getChannelData(0);
    let env = 0;
    for (let i = 0; i < len; i++) {
      if (Math.random() < 0.0016) env = 0.6 + Math.random() * 0.4;
      env *= 0.9993;
      d[i] = (Math.random() * 2 - 1) * (0.25 + env);
    }
    const s = ctx.createBufferSource(); s.buffer = b; s.loop = true;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 900;
    const pk = ctx.createBiquadFilter(); pk.type = 'peaking'; pk.frequency.value = 3200; pk.gain.value = 8;
    this.lightGain = ctx.createGain(); this.lightGain.gain.value = 0;
    s.connect(hp).connect(pk).connect(this.lightGain).connect(this.sfx);
    s.start();
  }

  setLightning(level) {
    if (!this.ctx) return;
    this.lightGain.gain.setTargetAtTime(clamp(level, 0, 1) * 0.5, this.ctx.currentTime, 0.04);
  }

  /** A saber swing: the hum dopplers past with a whoosh. */
  saberSwing(pos) {
    if (!this.ctx || this._throttle('swing', 110)) return;
    const ctx = this.ctx, t = ctx.currentTime, out = this._out(pos, 0.42, 14);
    const o = ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(rand(150, 175), t); o.frequency.exponentialRampToValueAtTime(rand(70, 85), t + 0.3);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1100;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.7, t + 0.06); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.34);
    o.connect(lp).connect(g).connect(out.node); o.start(t); o.stop(t + 0.36);
    const n = this._noiseSrc(t, 0.3);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.5; bp.frequency.setValueAtTime(600, t); bp.frequency.exponentialRampToValueAtTime(2200, t + 0.15);
    const ng = ctx.createGain(); ng.gain.setValueAtTime(0.0001, t); ng.gain.exponentialRampToValueAtTime(0.35, t + 0.08); ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    n.connect(bp).connect(ng).connect(out.node);
  }

  /** Blades meeting (or a bolt batted away): a sizzling crack with a metallic ring. */
  saberClash(pos) {
    if (!this.ctx || this._throttle('clash', 70)) return;
    const ctx = this.ctx, t = ctx.currentTime, out = this._out(pos, 0.55, 16);
    this._play(this.bank.sizzle, pos, 0.4, 14, rand(1.2, 1.4));
    for (const [f, a, dec] of [[1750, 0.5, 0.18], [2620, 0.35, 0.12], [3900, 0.2, 0.08]]) {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f * rand(0.97, 1.03);
      const g = ctx.createGain(); g.gain.setValueAtTime(a, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dec * 2);
      o.connect(g).connect(out.node); o.start(t); o.stop(t + dec * 2 + 0.02);
    }
    const n = this._noiseSrc(t, 0.12);
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2500;
    const ng = ctx.createGain(); ng.gain.setValueAtTime(0.8, t); ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    n.connect(hp).connect(ng).connect(out.node);
  }

  /** The Tusken war cry: a warbling, rising-and-falling howl through vocal formants. */
  tuskenCry(pos, vol = 0.55) {
    if (!this.ctx || this._throttle('tusken', 700)) return;
    const ctx = this.ctx, t = ctx.currentTime, out = this._out(pos, vol, 26);
    const dur = rand(1.3, 1.8), f0 = rand(300, 380);
    const o = ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(f0 * 0.8, t);
    o.frequency.linearRampToValueAtTime(f0 * 1.4, t + 0.22);
    o.frequency.linearRampToValueAtTime(f0 * 1.25, t + dur * 0.6);
    o.frequency.linearRampToValueAtTime(f0 * 0.7, t + dur);
    const vib = ctx.createOscillator(); vib.frequency.value = rand(10, 13);
    const vg = ctx.createGain(); vg.gain.value = f0 * 0.13;
    vib.connect(vg).connect(o.frequency);
    const amp = ctx.createGain(); amp.gain.value = 0.65;
    const am = ctx.createOscillator(); am.frequency.value = rand(5, 7);
    const amg = ctx.createGain(); amg.gain.value = 0.35;
    am.connect(amg).connect(amp.gain);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.9, t + 0.07);
    g.gain.setValueAtTime(0.9, t + dur * 0.7); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    for (const [f, q, v] of [[720, 5, 1], [1180, 6, 0.75], [2600, 8, 0.3]]) {
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = q;
      const bg = ctx.createGain(); bg.gain.value = v;
      o.connect(bp).connect(bg).connect(amp);
    }
    amp.connect(g).connect(out.node);
    for (const x of [o, vib, am]) { x.start(t); x.stop(t + dur + 0.05); }
  }

  /** Jawa chatter: quick, high gibberish blips. */
  jawaChatter(pos, vol = 0.4) {
    if (!this.ctx || this._throttle('jawa', 500)) return;
    const ctx = this.ctx, out = this._out(pos, vol, 14);
    let t = ctx.currentTime;
    const n = 4 + Math.floor(Math.random() * 5);
    for (let i = 0; i < n; i++) {
      const d = rand(0.05, 0.1), f = rand(650, 1500);
      const o = ctx.createOscillator(); o.type = Math.random() < 0.5 ? 'square' : 'sawtooth';
      o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * rand(0.7, 1.4), t + d);
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = rand(1200, 2200); bp.Q.value = 2.5;
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.6, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(bp).connect(g).connect(out.node); o.start(t); o.stop(t + d + 0.02);
      t += d + rand(0.02, 0.07);
    }
  }

  /** A window pane shattering: a sharp crack, a hiss of falling glass, a scatter of tinkles. */
  glass(pos) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime, out = this._out(pos, 0.7, 22);
    const n = this._noiseSrc(t, 0.9);
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2600;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.9, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.85);
    n.connect(hp).connect(g).connect(out.node);
    for (let i = 0; i < 9; i++) {
      const o = ctx.createOscillator(); o.type = 'sine';
      const st = t + 0.03 + Math.random() * 0.6;
      o.frequency.setValueAtTime(3000 + Math.random() * 4000, st);
      const og = ctx.createGain(); og.gain.setValueAtTime(0.0001, st); og.gain.exponentialRampToValueAtTime(0.12, st + 0.004); og.gain.exponentialRampToValueAtTime(0.0001, st + 0.12);
      o.connect(og).connect(out.node); o.start(st); o.stop(st + 0.14);
    }
  }

  /** A ship dropping out of hyperspace: a rising shriek snapping into a deep boom. */
  hyperspace() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime, out = this._out(null, 0.6);
    const o = ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(260, t); o.frequency.exponentialRampToValueAtTime(2400, t + 0.3); o.frequency.exponentialRampToValueAtTime(90, t + 0.5);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1400; bp.Q.value = 0.8;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.4, t + 0.25); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
    o.connect(bp).connect(g).connect(out.node); o.start(t); o.stop(t + 0.6);
    const s = ctx.createOscillator(); s.type = 'sine';
    s.frequency.setValueAtTime(90, t + 0.3); s.frequency.exponentialRampToValueAtTime(28, t + 1.8);
    const sg = ctx.createGain(); sg.gain.setValueAtTime(0.0001, t + 0.3); sg.gain.exponentialRampToValueAtTime(1.0, t + 0.34); sg.gain.exponentialRampToValueAtTime(0.0001, t + 1.9);
    s.connect(sg).connect(out.node); s.start(t + 0.3); s.stop(t + 2);
    const n = this._noiseSrc(t + 0.3, 1.2);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(3000, t + 0.3); lp.frequency.exponentialRampToValueAtTime(200, t + 1.4);
    const ng = ctx.createGain(); ng.gain.setValueAtTime(0.6, t + 0.3); ng.gain.exponentialRampToValueAtTime(0.0001, t + 1.5);
    n.connect(lp).connect(ng).connect(out.node);
  }

  /** A krayt dragon, far off in the Jundland Wastes. */
  kraytRoar(pos) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime, out = this._out(pos, 0.9, 60);
    const o = ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(95, t); o.frequency.linearRampToValueAtTime(120, t + 0.5); o.frequency.exponentialRampToValueAtTime(42, t + 2.6);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.7, t + 0.4); g.gain.exponentialRampToValueAtTime(0.0001, t + 2.8);
    o.connect(lp).connect(g).connect(out.node); o.start(t); o.stop(t + 2.9);
    const n = this._noiseSrc(t, 2.6);
    const nb = ctx.createBiquadFilter(); nb.type = 'bandpass'; nb.frequency.value = 300; nb.Q.value = 0.9;
    const ng = ctx.createGain(); ng.gain.setValueAtTime(0.0001, t); ng.gain.exponentialRampToValueAtTime(0.4, t + 0.5); ng.gain.exponentialRampToValueAtTime(0.0001, t + 2.6);
    n.connect(nb).connect(ng).connect(out.node);
  }

  /** The desert around the farm: wind gusts, far-off Tusken howls and rifle cracks, Jawa chatter, a krayt dragon. */
  _desertBed(dt) {
    this.ambT -= dt;
    if (this.ambT > 0) return;
    this.ambT = rand(2.5, 6.5);
    const r = Math.random();
    if (r < 0.3) this.tuskenCry(this._far(160, 420).clone(), 0.3);
    else if (r < 0.52) {
      const t = this.ctx.currentTime;
      this.desertWind.gain.setTargetAtTime(0.16, t, 0.6);
      this.desertWind.gain.setTargetAtTime(0.075, t + 2.2, 1.2);
    } else if (r < 0.66) this._play(this.bank.slug, this._far(220, 520), 0.45, 18, rand(0.85, 0.95));
    else if (r < 0.72) this.kraytRoar(this._far(500, 900).clone());
    else if (r < 0.86) this.jawaChatter(this._far(60, 150).clone(), 0.2);
  }

  /** A point somewhere out in the city around the listener (for the distant battle). */
  _far(dmin, dmax) {
    const a = Math.random() * TAU, d = rand(dmin, dmax);
    return _p.set(this.listenerPos.x + Math.cos(a) * d, this.listenerPos.y + rand(-30, 40), this.listenerPos.z + Math.sin(a) * d);
  }

  /** The war going on around the tower: distant firefights, far explosions, gunship and Vulture passes. */
  _battleBed(dt) {
    this.ambT -= dt;
    if (this.ambT > 0) return;
    const ctx = this.ctx, r = Math.random();
    this.ambT = rand(0.7, 2.8);
    if (r < 0.55) {
      // a distant exchange of blaster fire
      const at = this._far(130, 420).clone();
      const kinds = Math.random() < 0.5 ? ['rifle', 'droid'] : ['droid', 'pistol', 'rifle'];
      const n = 3 + Math.floor(Math.random() * 7);
      for (let i = 0; i < n; i++) {
        const k = kinds[Math.floor(Math.random() * kinds.length)];
        setTimeout(() => { if (this.ctx) this._play(this.bank[k], at, 0.5, 18, rand(0.9, 1.05)); }, i * rand(70, 240));
      }
    } else if (r < 0.75) {
      this._play(this.bank.explosion, this._far(250, 700), 1.2, 30, rand(0.7, 0.9));
    } else if (r < 0.88) {
      // LAAT/i gunship pass: engine drone swelling past with a low whoosh
      const t = ctx.currentTime, out = this._out(this._far(60, 160), 0.6, 30);
      const o = ctx.createOscillator(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(118, t); o.frequency.linearRampToValueAtTime(96, t + 4);
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420;
      const n = this._noiseSrc(t, 4);
      const nb = ctx.createBiquadFilter(); nb.type = 'bandpass'; nb.frequency.value = 600; nb.Q.value = 0.8;
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.5, t + 1.8); g.gain.exponentialRampToValueAtTime(0.0001, t + 4);
      o.connect(lp).connect(g); n.connect(nb).connect(g); g.connect(out.node);
      o.start(t); o.stop(t + 4.05);
    } else {
      // Vulture droid whine diving past
      const t = ctx.currentTime, out = this._out(this._far(80, 220), 0.35, 30);
      const o = ctx.createOscillator(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(2100, t); o.frequency.exponentialRampToValueAtTime(820, t + 2.4);
      const tr = ctx.createOscillator(); tr.frequency.value = 23;
      const trg = ctx.createGain(); trg.gain.value = 60;
      tr.connect(trg).connect(o.frequency);
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1500; bp.Q.value = 1.4;
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.4, t + 0.9); g.gain.exponentialRampToValueAtTime(0.0001, t + 2.5);
      o.connect(bp).connect(g).connect(out.node);
      o.start(t); o.stop(t + 2.55); tr.start(t); tr.stop(t + 2.55);
    }
  }

  /** Heartbeat + breathing inside the helmet when health is low. */
  _lowHealth(dt) {
    if (this.lowHp <= 0) return;
    const ctx = this.ctx;
    this.beatT -= dt;
    if (this.beatT <= 0) {
      this.beatT = 60 / (72 + this.lowHp * 40);
      for (const [o, v] of [[0, 1], [0.16, 0.7]]) {
        const t = ctx.currentTime + o;
        const os = ctx.createOscillator(); os.type = 'sine';
        os.frequency.setValueAtTime(70, t); os.frequency.exponentialRampToValueAtTime(38, t + 0.12);
        const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.5 * v * this.lowHp, t + 0.015);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
        os.connect(g).connect(this.uiBus); os.start(t); os.stop(t + 0.22);
      }
    }
    this.breathT -= dt;
    if (this.breathT <= 0) {
      this.breathT = 2.3 - this.lowHp * 0.6;
      const t = ctx.currentTime;
      for (const [o, len, f] of [[0, 0.7, 700], [0.95, 0.9, 520]]) {
        const n = this._noiseSrc(t + o, len);
        const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = 1.6;
        const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t + o); g.gain.exponentialRampToValueAtTime(0.09 * this.lowHp, t + o + len * 0.4);
        g.gain.exponentialRampToValueAtTime(0.0001, t + o + len);
        n.connect(bp).connect(g).connect(this.uiBus);
      }
    }
  }

  /** Called every frame: battle ambience bed, low-health layer, shell-shock muffle, music intensity. */
  update(dt, state) {
    if (!this.ctx) return;
    this.lowHp = state.lowHp || 0;
    this.intensity += (clamp(state.intensity || 0, 0, 1) - this.intensity) * Math.min(1, dt * 0.6);
    if (state.battle) { if (this.desert) this._desertBed(dt); else this._battleBed(dt); }
    this._lowHealth(dt);
    this.shock = Math.max(0, this.shock - dt);
    const muffle = Math.max(clamp(this.shock / 1.6, 0, 1), this.lowHp * 0.55);
    this.worldLP.frequency.setTargetAtTime(20000 * Math.pow(0.025, muffle), this.ctx.currentTime, 0.05);
    this._musicMix();
  }

  // -------------------------------------------------------------------------
  // Score: lookahead sequencer + intensity layers (calm -> combat -> climax)
  // -------------------------------------------------------------------------
  _musicStart() {
    const ctx = this.ctx;
    this.layers = {};
    for (const k of ['pad', 'ost', 'perc', 'brass', 'motif']) {
      const g = ctx.createGain(); g.gain.value = 0;
      g.connect(this.music);
      this.layers[k] = g;
    }
    this.step = 0;
    this.nextT = ctx.currentTime + 0.2;
    this.loop = 0;
    const spb = 60 / 132 / 4; // 16th note at 132 bpm
    this.spb = spb;
    this._seq = setInterval(() => {
      if (!this.ctx) return;
      while (this.nextT < this.ctx.currentTime + 0.25) {
        this._playStep(this.step, this.nextT);
        this.nextT += spb;
        this.step = (this.step + 1) % 64;
        if (this.step === 0) this.loop++;
      }
    }, 50);
  }

  _musicMix() {
    const t = this.ctx.currentTime, i = this.intensity;
    const s = (a, b) => clamp((i - a) / (b - a), 0, 1);
    const set = (k, v) => this.layers[k].gain.setTargetAtTime(v, t, 0.8);
    set('pad', 0.55 - 0.25 * s(0.5, 1));
    set('ost', s(0.15, 0.4));
    set('perc', s(0.3, 0.55));
    set('brass', s(0.45, 0.7));
    set('motif', s(0.7, 0.9));
  }

  _playStep(step, t) {
    const bar = Math.floor(step / 16), s = step % 16;
    const chords = this.loop % 2 ? CHORDS_B : CHORDS_A;
    const ch = chords[bar];
    const spb = this.spb;
    if (s === 0) {
      for (const m of ch) this._string(mtof(m), t, spb * 16, 0.05, this.layers.pad, 900, 0.5);
      this._string(mtof(ch[0] - 12), t, spb * 16, 0.06, this.layers.pad, 500, 0.4);
    }
    if (GALLOP.includes(s)) {
      const accent = s === 0 || s === 8 ? 1 : 0.7;
      const note = s === 8 || s === 11 ? ch[0] - 12 + 7 : ch[0] - 12;
      this._string(mtof(note), t, spb * 1.6, 0.11 * accent, this.layers.ost, 1100, 0.008);
      this._string(mtof(note - 12), t, spb * 1.6, 0.08 * accent, this.layers.ost, 700, 0.008);
    }
    if (s === 0 || (s === 6 && bar % 2 === 0)) this._timp(mtof(ch[0] - 24 + (s === 6 ? 7 : 0)), t, s === 0 ? 0.5 : 0.35, this.layers.perc);
    if (s === 4 || s === 12) this._snare(t, 0.14, this.layers.perc);
    if (bar === 3 && s >= 8) this._snare(t, 0.05 + (s - 8) * 0.012, this.layers.motif);
    if ((bar === 0 || bar === 2) && (s === 0 || s === 3)) for (const m of ch) this._brass(mtof(m + 12), t, spb * (s === 0 ? 2.5 : 4), 0.06, this.layers.brass);
    for (const [b, st, m, len] of MOTIF) if (b === bar && st === s) this._horn(mtof(m - 12), t, spb * len, 0.09, this.layers.motif);
  }

  _string(f, t, dur, vel, dest, cutoff, attack) {
    const ctx = this.ctx;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = cutoff;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vel, t + attack);
    g.gain.setValueAtTime(vel, t + Math.max(attack, dur * 0.7));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    lp.connect(g).connect(dest);
    for (const det of [-7, 7]) {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = det;
      o.connect(lp); o.start(t); o.stop(t + dur + 0.05);
    }
  }

  _brass(f, t, dur, vel, dest) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(f * 0.985, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.05);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 1.5;
    lp.frequency.setValueAtTime(500, t); lp.frequency.exponentialRampToValueAtTime(2800, t + 0.06); lp.frequency.exponentialRampToValueAtTime(1200, t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vel, t + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(lp).connect(g).connect(dest); o.start(t); o.stop(t + dur + 0.05);
  }

  _horn(f, t, dur, vel, dest) {
    const ctx = this.ctx;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1700;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vel, t + 0.06);
    g.gain.setValueAtTime(vel, t + dur * 0.8); g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.1);
    const vib = ctx.createOscillator(); vib.frequency.value = 5.5;
    const vg = ctx.createGain(); vg.gain.setValueAtTime(0, t); vg.gain.linearRampToValueAtTime(f * 0.006, t + 0.3);
    vib.connect(vg);
    for (const type of ['sawtooth', 'triangle']) {
      const o = ctx.createOscillator(); o.type = type; o.frequency.value = f;
      vg.connect(o.frequency);
      o.connect(lp); o.start(t); o.stop(t + dur + 0.15);
    }
    lp.connect(g).connect(dest);
    vib.start(t); vib.stop(t + dur + 0.15);
  }

  _timp(f, t, vel, dest) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(f * 1.12, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.06);
    const g = ctx.createGain(); g.gain.setValueAtTime(vel, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
    o.connect(g).connect(dest); o.start(t); o.stop(t + 1.15);
    const n = this._noiseSrc(t, 0.08);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700;
    const ng = ctx.createGain(); ng.gain.setValueAtTime(vel * 0.6, t); ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
    n.connect(lp).connect(ng).connect(dest);
  }

  _snare(t, vel, dest) {
    const ctx = this.ctx;
    const n = this._noiseSrc(t, 0.14);
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1500;
    const g = ctx.createGain(); g.gain.setValueAtTime(vel, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);
    n.connect(hp).connect(g).connect(dest);
  }

  /** Short original stings: 'win' (rising major brass) or 'lose' (falling minor). */
  sting(kind) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + 0.05;
    if (kind === 'win') {
      [[62, 0], [66, 0.16], [69, 0.32], [74, 0.48]].forEach(([m, o]) => this._brass(mtof(m), t + o, 1.6 - o, 0.1, this.music));
      this._timp(mtof(38), t, 0.6, this.music);
      this._timp(mtof(38), t + 0.48, 0.7, this.music);
    } else {
      [[57, 0], [53, 0.35], [50, 0.7]].forEach(([m, o]) => this._brass(mtof(m), t + o, 1.4, 0.08, this.music));
      this._timp(mtof(33), t + 0.7, 0.7, this.music);
    }
  }
}

/** Speech for the cutscene and battle chatter (browser text-to-speech). */
export class Voice {
  constructor() {
    this.enabled = true;
    this.voice = null;
    this.ok = typeof window !== 'undefined' && 'speechSynthesis' in window;
    if (this.ok) {
      this.pick();
      speechSynthesis.addEventListener?.('voiceschanged', () => this.pick());
    }
  }

  pick() {
    const vs = speechSynthesis.getVoices().filter((v) => /^en/i.test(v.lang));
    const pref = ['Guy', 'David', 'Mark', 'Ryan', 'Christopher', 'Daniel', 'George', 'Male', 'Eric', 'Andrew', 'Brian'];
    for (const p of pref) {
      const v = vs.find((v) => v.name.includes(p));
      if (v) { this.voice = v; return; }
    }
    this.voice = vs[0] || null;
  }

  say(text, opts = {}) {
    if (!this.ok || !this.enabled) return;
    if (opts.interrupt !== false) speechSynthesis.cancel();
    // respelled for the voice (pronounce.js): the subtitles keep the proper spelling
    const u = new SpeechSynthesisUtterance(speakable(text));
    if (this.voice) u.voice = this.voice;
    u.pitch = opts.pitch ?? 0.75;
    u.rate = opts.rate ?? 1.02;
    u.volume = opts.volume ?? 1;
    if (opts.onstart) u.onstart = opts.onstart;
    if (opts.onend) u.onend = opts.onend;
    speechSynthesis.speak(u);
  }

  /** What the voice will actually read for a line (for checking pronunciations). */
  speakable(text) { return speakable(text); }

  /** True while a line is still being spoken (or queued). */
  busy() { return this.ok && this.enabled && (speechSynthesis.speaking || speechSynthesis.pending); }

  stop() { if (this.ok) speechSynthesis.cancel(); }
}
