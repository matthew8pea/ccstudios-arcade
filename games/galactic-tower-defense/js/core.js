/* ==========================================================================
   core.js — shared helpers, sound synthesizer and persistent storage
   ========================================================================== */
'use strict';

// ---- Utilities ----
const $ = id => document.getElementById(id);
const rand = (a, b) => Math.random() * (b - a) + a;
const randInt = (a, b) => Math.floor(rand(a, b + 1));
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const lerp = (a, b, t) => a + (b - a) * t;
const fmt = n => Math.round(n).toLocaleString('en-US');

function hexToRgba(hex, alpha) {
  const h = hex.replace('#', '');
  const v = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
  const n = parseInt(v, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

// Distance from point p to segment ab.
function distToSegment(p, a, b) {
  const abx = b.x - a.x, aby = b.y - a.y;
  const len2 = abx * abx + aby * aby;
  if (len2 === 0) return dist(p, a);
  const t = clamp(((p.x - a.x) * abx + (p.y - a.y) * aby) / len2, 0, 1);
  return Math.hypot(p.x - (a.x + abx * t), p.y - (a.y + aby * t));
}

// ---- Storage (localStorage can throw in private mode or file:// on some browsers) ----
const Store = {
  get(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw == null ? fallback : JSON.parse(raw);
    } catch (e) {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      return false;
    }
  },
  remove(key) {
    try { localStorage.removeItem(key); } catch (e) { /* ignore */ }
  }
};

const SAVE_KEY = 'gtd_save_v3';
const PROFILE_KEY = 'gtd_profile_v3';

// Profile persists across games: achievements, records, settings.
const Profile = {
  data: null,
  load() {
    const d = Store.get(PROFILE_KEY, {});
    this.data = {
      achievements: d.achievements || {},
      records: d.records || {},
      totalKills: d.totalKills || 0,
      wins: d.wins || 0,
      muted: !!d.muted
    };
    return this.data;
  },
  save() { Store.set(PROFILE_KEY, this.data); },
  recordKey(mapId, diffId) { return `${mapId}:${diffId}`; },
  getRecord(mapId, diffId) {
    return this.data.records[this.recordKey(mapId, diffId)] || null;
  },
  submitRecord(mapId, diffId, wave, score, won) {
    const k = this.recordKey(mapId, diffId);
    const r = this.data.records[k] || { bestWave: 0, bestScore: 0, won: false };
    r.bestWave = Math.max(r.bestWave, wave);
    r.bestScore = Math.max(r.bestScore, score);
    r.won = r.won || won;
    this.data.records[k] = r;
    this.save();
  }
};
Profile.load();

// ---- Web Audio synthesizer (no audio files needed) ----
class AudioSynth {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = Profile.data.muted;
    this.lastPlay = {};
  }

  // Browsers only allow audio after a user gesture, so this runs on first click.
  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.35;
      this.master.connect(this.ctx.destination);
    } catch (e) {
      this.ctx = null;
    }
  }

  setMuted(m) {
    this.muted = m;
    Profile.data.muted = m;
    Profile.save();
    if (this.master) this.master.gain.value = m ? 0 : 0.35;
  }

  // Plays one synthesized tone. `slide` sweeps the pitch toward freq*slide.
  tone(freq, dur, type = 'sine', vol = 0.2, slide = 1, delay = 0) {
    if (!this.ctx || this.muted) return;
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slide !== 1) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t0 + dur);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0008, t0 + dur);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  noise(dur, vol = 0.2, filterFreq = 800) {
    if (!this.ctx || this.muted) return;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const g = this.ctx.createGain();
    g.gain.value = vol;
    src.connect(filter);
    filter.connect(g);
    g.connect(this.master);
    src.start();
  }

  play(name) {
    if (!this.ctx || this.muted) return;
    // Throttle very frequent sounds so rapid-fire towers don't turn into noise.
    const now = this.ctx.currentTime;
    const minGap = { shoot: 0.045, hit: 0.04, die: 0.03 }[name.split('_')[0]] || 0;
    if (minGap && this.lastPlay[name] && now - this.lastPlay[name] < minGap) return;
    this.lastPlay[name] = now;

    switch (name) {
      case 'shoot_pulse':    this.tone(rand(620, 700), 0.06, 'square', 0.05, 0.6); break;
      case 'shoot_longshot': this.tone(1200, 0.25, 'sawtooth', 0.08, 0.25); break;
      case 'shoot_warden':   this.tone(rand(180, 220), 0.12, 'sawtooth', 0.08, 2.2); break;
      case 'shoot_cryo':     this.tone(rand(1300, 1500), 0.12, 'sine', 0.06, 0.5); break;
      case 'shoot_brute':    this.tone(140, 0.2, 'sawtooth', 0.12, 0.5); this.noise(0.12, 0.08, 600); break;
      case 'shoot_sage':     this.tone(90, 0.45, 'sine', 0.25, 0.5); break;
      case 'shoot_arc':      this.tone(rand(900, 1100), 0.12, 'square', 0.05, 0.3); this.noise(0.08, 0.05, 3000); break;
      case 'shoot_mortar':   this.tone(220, 0.3, 'triangle', 0.12, 0.4); break;
      case 'explode':        this.noise(0.4, 0.22, 500); this.tone(70, 0.4, 'sine', 0.2, 0.5); break;
      case 'hit':            this.tone(rand(1000, 1200), 0.04, 'square', 0.025); break;
      case 'die':            this.tone(rand(240, 300), 0.18, 'triangle', 0.08, 0.4); break;
      case 'boss_die':       this.noise(1.0, 0.3, 400); this.tone(60, 1.0, 'sawtooth', 0.2, 0.3); break;
      case 'build':          this.tone(330, 0.1, 'sine', 0.14); this.tone(495, 0.14, 'sine', 0.12, 1, 0.08); break;
      case 'upgrade':        [440, 554, 659, 880].forEach((f, i) => this.tone(f, 0.12, 'sine', 0.1, 1, i * 0.06)); break;
      case 'sell':           this.tone(500, 0.18, 'triangle', 0.12, 0.5); break;
      case 'error':          this.tone(110, 0.22, 'square', 0.08); break;
      case 'click':          this.tone(900, 0.04, 'sine', 0.08); break;
      case 'hover':          this.tone(1400, 0.025, 'sine', 0.03); break;
      case 'wave_start':     this.tone(196, 0.5, 'sawtooth', 0.1, 1.5); this.tone(294, 0.5, 'sawtooth', 0.07, 1.5, 0.1); break;
      case 'wave_clear':     [523, 659, 784].forEach((f, i) => this.tone(f, 0.2, 'triangle', 0.1, 1, i * 0.09)); break;
      case 'life_lost':      this.tone(160, 0.5, 'sawtooth', 0.18, 0.5); break;
      case 'boss':           this.tone(55, 1.2, 'sawtooth', 0.2, 1.2); this.tone(82, 1.2, 'sawtooth', 0.12, 1.1, 0.2); break;
      case 'achieve':        [784, 988, 1175, 1568].forEach((f, i) => this.tone(f, 0.25, 'sine', 0.12, 1, i * 0.08)); break;
      case 'ability':        this.tone(300, 0.6, 'sawtooth', 0.12, 3); this.noise(0.5, 0.1, 2000); break;
      case 'victory':        [523, 659, 784, 1047, 784, 1047].forEach((f, i) => this.tone(f, 0.3, 'triangle', 0.12, 1, i * 0.14)); break;
      case 'defeat':         [392, 330, 262, 196].forEach((f, i) => this.tone(f, 0.45, 'sawtooth', 0.1, 1, i * 0.2)); break;
    }
  }
}
const audio = new AudioSynth();
