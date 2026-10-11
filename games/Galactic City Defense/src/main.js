import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Post, GRADE, fxaaPass } from './post.js';
import { loadModels } from './assets.js';
import { Character, CharacterPool } from './character.js';
import { buildCity } from './city.js';
import { FX } from './fx.js';
import { Sound, Voice } from './audio.js';
import { Input } from './input.js';
import { pad } from './gamepad.js';
import { PadUI } from './padui.js';
import { HUD, helmSVG } from './hud.js';
import { EnemyManager, ENEMY_TYPES } from './enemies.js';
import { Combat } from './combat.js';
import { WaveDirector } from './waves.js';
import { Player, Ally, LOADOUTS } from './commanders.js';
import { Cutscene, CODY_SPOT, FOX_SPOT } from './cutscene.js';
import { SkyWar } from './skywar.js';
import { Squad } from './squad.js';
import { Objectives } from './objectives.js';
import { ArrivalCutscene, ACT2_ALLY, TempleEnding } from './act2.js';
import { FallCutscene } from './fall.js';
import { Civilians } from './civilians.js';
import { EndingCutscene } from './ending.js';
import { FINAL_WAVE } from './waves.js';
import { SUN_DIR } from './city.js';
import { buildTatooine } from './tatooine.js';
import { TatooineArrival, TatooineEnding, DookuEntrance } from './act3.js';
import { Act4Arrival, Act4Ending } from './act4.js';
import { Gunship, LAAT_CFG } from './gunship.js';
import { VOICE_EXTRA } from './beats.js';
import { VOICE_TEST } from './pronounce.js';
import { DOOKU_VOICE } from './dooku.js';
import { DOOKU_WAVE } from './waves.js';
import { clamp } from './util.js';
import { VR } from './vr.js';

const FALL_WAVE = 5; // in this wave Cody and Fox get blasted off the tower into the lower levels...
const FALL_KILLS = 4; // ...as soon as this many of its droids have been destroyed

const SETTINGS_KEY = 'gcd-settings-v1';
const BEST_KEY = 'gcd-best-v1';

function loadJSON(key, fallback) {
  try { return { ...fallback, ...JSON.parse(localStorage.getItem(key) || '{}') }; } catch { return { ...fallback }; }
}
function saveJSON(key, v) {
  try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* storage unavailable */ }
}

// ---------------------------------------------------------------------------
// Renderer
// ---------------------------------------------------------------------------
const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.1, 7000);

const rt = new THREE.WebGLRenderTarget(innerWidth, innerHeight, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, rt);
const renderPass = new RenderPass(scene, camera);
composer.addPass(renderPass);
// Battlefront II-style bloom: bolts and explosions bloom hard, the sky and buildings stay clean
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), GRADE.bloom.strength, GRADE.bloom.radius, GRADE.bloom.threshold);
composer.addPass(bloom);
const post = new Post(bloom);
composer.addPass(post.pass);
composer.addPass(new OutputPass());
// edge anti-aliasing for the graphics tiers that drop MSAA
const fxaa = fxaaPass();
composer.addPass(fxaa);

const settings = loadJSON(SETTINGS_KEY, { sens: 1, volume: 0.8, music: 0.45, voice: true, high: true, fps: false, pick: 'cody' });
// older saves only had the High quality checkbox
if (!['auto', 'high', 'medium', 'low'].includes(settings.gfx)) settings.gfx = settings.high === false ? 'low' : 'auto';
settings.high = settings.gfx !== 'low';
// controller: look speed, invert, aim assist, rumble, button icons (auto/xbox/ps/nintendo), A/B + X/Y swapped
settings.padSens ??= 1;
settings.padInvert ??= false;
settings.padAssist ??= true;
settings.padRumble ??= true;
settings.padGlyphs ??= 'auto';
settings.padSwap ??= false;
pad.settings = settings;

/**
 * Which graphics chip the browser is drawing with. Laptops often hand web pages the slow built-in chip
 * (Intel UHD here runs the game ~8x slower than the RTX), and nothing in the game can switch it.
 */
const GPU = (() => {
  let name = '';
  try { const gl = renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info'); name = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : ''; } catch { /* not exposed */ }
  // "ANGLE (Intel, Intel(R) UHD Graphics (0x0000A788) Direct3D11 vs_5_0 ps_5_0, D3D11)" -> "Intel(R) UHD Graphics"
  const short = name.replace(/^ANGLE \([^,]*, /, '').replace(/ \(0x[0-9a-f]+\)/i, '').replace(/,? ?(Direct3D|OpenGL|Vulkan|Metal).*$/i, '').trim();
  const software = /SwiftShader|llvmpipe|Basic Render|Software/i.test(name);
  const integrated = software || (/Intel|Radeon\(TM\) Graphics|Radeon Graphics|Vega \d+ Graphics/i.test(name) && !/Arc(\(TM\))? [AB]\d{3}/i.test(name));
  const vendor = /nvidia/i.test(name) ? 'nvidia' : /amd|radeon/i.test(name) ? 'amd' : /intel/i.test(name) ? 'intel' : '';
  return { name, short: short || 'unknown GPU', software, integrated, vendor };
})();

/**
 * Graphics tiers, best first. Auto steps down them when the frame rate sags and back up when there is
 * headroom; High / Medium / Low pin one. scale = render resolution relative to the window (High uses the
 * screen's extra pixel density up to 1.5x). Changing tiers never changes the light count, so no shader recompiles.
 */
const TIERS = [
  { label: 'HIGH', scale: 1.5, msaa: 4, shadow: 2048, fullBloom: true, extras: true },
  { label: 'MEDIUM', scale: 1, msaa: 0, shadow: 2048, fullBloom: true, extras: true },
  { label: 'LOW', scale: 0.85, msaa: 0, shadow: 1024, fullBloom: false, extras: false },
  { label: 'LOW', scale: 0.75, msaa: 0, shadow: 1024, fullBloom: false, extras: false },
  { label: 'LOWEST', scale: 0.6, msaa: 0, shadow: 1024, fullBloom: false, extras: false },
];
const PRESET_TIER = { high: 0, medium: 1, low: 3 };
function startTier() {
  if (settings.gfx !== 'auto') return PRESET_TIER[settings.gfx];
  // resume where Auto settled last time on this same chip
  if (settings.autoGpu === GPU.name && Number.isInteger(settings.autoTier)) return clamp(settings.autoTier, 0, TIERS.length - 1);
  return GPU.integrated ? 2 : 0;
}
let tier = startTier();
const best = loadJSON(BEST_KEY, { score: 0, wave: 0 });

const G = {
  renderer, scene, camera, composer, settings, post, renderPass,
  sound: new Sound(), voice: new Voice(), input: new Input(canvas), hud: new HUD(),
  state: 'loading', time: 0, selected: settings.pick || 'cody',
  stats: { score: 0, kills: 0, headshots: 0, wave: 0 },
  player: null, ally: null, chars: {},
};

window.GCD = G; // handy for debugging from the console
G.gpu = GPU;
G.quality = { TIERS, get tier() { return tier; }, setTier, renderScale };
G.settings = settings;
/** Keep a position inside the arena's play area: nobody walks out through a gate or jumps off the edge. */
G.keepInArena = (p, m = 0.35) => {
  const b = G.arena && G.arena.bounds;
  if (!b) return;
  const c = G.arena.circle;
  if (c) {
    const dx = p.x - c.x, dz = p.z - c.z, d = Math.hypot(dx, dz), r = c.r - m;
    if (d > r) { p.x = c.x + (dx / d) * r; p.z = c.z + (dz / d) * r; }
    return;
  }
  if (p.x < b.minX + m) p.x = b.minX + m; else if (p.x > b.maxX - m) p.x = b.maxX - m;
  if (p.z < b.minZ + m) p.z = b.minZ + m; else if (p.z > b.maxZ - m) p.z = b.maxZ - m;
};
G.act = 1;
// game-time timers (pause- and debugStep-safe): G.after(seconds, fn)
G.timers = [];
G.after = (sec, fn) => G.timers.push({ t: G.time + sec, fn });
const _kl = new THREE.Vector3(), _kp = new THREE.Vector3();
G.timeScale = 1;
// friendly dots on the minimap: the other commander and the clone squad
G.allies = () => (G.squad ? [G.ally, ...G.squad.alive] : [G.ally]);

const _dbs = new THREE.Vector2();
function renderScale() {
  const t = TIERS[tier];
  return Math.min(devicePixelRatio, Math.max(1, t.scale)) * Math.min(1, t.scale);
}
function applyQuality() {
  // in a headset the eye buffers belong to the session (vr.js restores the tier when it ends)
  if (renderer.xr.isPresenting) return;
  const t = TIERS[tier], pr = renderScale();
  renderer.setPixelRatio(pr);
  renderer.setSize(innerWidth, innerHeight);
  if (composer.renderTarget1.samples !== t.msaa) {
    for (const r of [composer.renderTarget1, composer.renderTarget2]) { r.samples = t.msaa; r.dispose(); }
  }
  composer.setPixelRatio(pr);
  composer.setSize(innerWidth, innerHeight);
  // the low tiers keep the bloom (it is half the look) but at half resolution
  if (!t.fullBloom) bloom.setSize(innerWidth * pr * 0.5, innerHeight * pr * 0.5);
  fxaa.enabled = t.msaa === 0;
  renderer.getDrawingBufferSize(_dbs);
  fxaa.uniforms.texel.value.set(1 / _dbs.x, 1 / _dbs.y);
  post.high = t.extras;
  if (G.city) G.city.atmos.setQuality(t.extras);
  // only the manual Low preset drops dynamic lights (that one change recompiles every lit shader)
  if (G.fx) G.fx.setQuality(t.extras, settings.gfx === 'low' ? 2 : 6);
  if (G.city) {
    const sh = G.city.sun.shadow;
    if (sh.mapSize.x !== t.shadow) { sh.mapSize.set(t.shadow, t.shadow); if (sh.map) { sh.map.dispose(); sh.map = null; } }
  }
  G.onFovChange();
}

// Auto graphics: one-second frame-rate windows. Two slow windows in a row (or one very slow one) step down a
// tier; eight smooth ones during play step back up, unless that tier was too slow recently (the wait doubles each time).
const autoQ = { n: 0, ms: 0, good: 0, bad: 0, cool: 0, fails: [], blockedUntil: [] };
function setTier(t) {
  tier = clamp(t, 0, TIERS.length - 1);
  autoQ.good = autoQ.bad = 0;
  autoQ.cool = 1; // ignore the hitch from reallocating the render targets
  applyQuality();
  if (settings.gfx === 'auto') { settings.autoTier = tier; settings.autoGpu = GPU.name; saveJSON(SETTINGS_KEY, settings); }
}
function autoQuality(ms) {
  // (in a headset the frame rate is the headset's, and the VR settings are fixed on entering)
  if (settings.gfx !== 'auto' || G.state === 'loading' || document.hidden || ms > 250 || (G.vr && G.vr.presenting)) return;
  autoQ.n++; autoQ.ms += ms;
  if (autoQ.ms < 1000) return;
  const fps = (autoQ.n * 1000) / autoQ.ms, now = performance.now();
  autoQ.n = autoQ.ms = 0;
  if (autoQ.cool > 0) { autoQ.cool--; return; }
  if (fps < 50) {
    autoQ.good = 0;
    if ((++autoQ.bad >= 2 || fps < 35) && tier < TIERS.length - 1) {
      const f = (autoQ.fails[tier] = (autoQ.fails[tier] || 0) + 1);
      autoQ.blockedUntil[tier] = now + 60000 * 2 ** (f - 1);
      setTier(tier + 1);
    }
  } else if (fps > 57 && G.state === 'playing') {
    autoQ.bad = 0;
    if (++autoQ.good >= 8 && tier > 0 && !(autoQ.blockedUntil[tier - 1] > now)) setTier(tier - 1);
  } else autoQ.good = autoQ.bad = 0;
}
function setGraphics(mode) {
  settings.gfx = mode;
  settings.high = mode !== 'low';
  setTier(startTier());
  saveJSON(SETTINGS_KEY, settings);
}

G.onFovChange = () => {
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const ps = size.y / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
  if (G.fx) G.fx.setPixelScale(ps);
};

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  applyQuality();
});

// ---------------------------------------------------------------------------
// Speech helpers
// ---------------------------------------------------------------------------
let lastWorldSpeech = -99;
// voices for the characters that only appear in cutscenes (browser text-to-speech)
const VOICES = { yoda: { pitch: 1.65, rate: 0.78 }, gree: { pitch: 0.72, rate: 1.0 }, command: { pitch: 0.85, rate: 1.08 }, dooku: DOOKU_VOICE };
G.finalWave = FINAL_WAVE;
G.endless = false;

// Republic reinforcement tickets: a checkpoint respawn costs 3, each squad reinforcement 1, clearing a wave earns 4
const START_TICKETS = 30, RESPAWN_COST = 3;
const ticketEl = document.getElementById('tickets'), ticketVal = document.getElementById('ticketValue');
const TICKET_CALLS = [
  [15, 'Republic Command to all units: reinforcements are at half strength. Hold the line.'],
  [8, 'Command here. Reinforcements are running low, Commander. Make every trooper count.'],
  [3, "We're down to our last reinforcements!"],
  [0, 'Command to all units: no more reinforcements. You are on your own.'],
];
function showTickets(flash) {
  ticketVal.textContent = G.tickets;
  ticketEl.classList.toggle('low', G.tickets <= 8);
  if (flash) { ticketEl.classList.remove('flash'); void ticketEl.offsetWidth; ticketEl.classList.add('flash'); }
}
G.resetTickets = () => { G.tickets = START_TICKETS; G.ticketCalls = new Set(); showTickets(false); };
/** Spend n tickets; false (and nothing spent) if there aren't enough. */
G.useTickets = (n) => {
  if (G.tickets < n) return false;
  const before = G.tickets;
  G.tickets -= n;
  showTickets(true);
  for (const [at, line] of TICKET_CALLS) {
    if (before > at && G.tickets <= at && !G.ticketCalls.has(at)) {
      G.ticketCalls.add(at);
      G.hud.subtitle('REPUBLIC COMMAND', line, 3.6);
      G.speak(line, 'command', { interrupt: false });
      break;
    }
  }
  return true;
};
G.addTickets = (n) => { G.tickets += n; showTickets(true); };

G.speak = (text, who, opts = {}) => {
  if (G.state === 'playing' && who && LOADOUTS[who]) G.hud.subtitle(LOADOUTS[who].tag, text, 2.6);
  if (!settings.voice) return;
  const v = (LOADOUTS[who] && LOADOUTS[who].voice) || VOICES[who] || {};
  // in battle, commander lines come over the helmet radio: squelch in, static, squelch out
  const radio = G.state === 'playing';
  if (radio) G.sound.radio(true);
  G.voice.say(text, { ...v, ...opts, onend: radio ? () => G.sound.radio(false) : undefined });
};
G.speakWorld = (text, pos, opts = {}) => {
  if (!settings.voice || G.state !== 'playing') return;
  if (G.time - lastWorldSpeech < 6 || (window.speechSynthesis && speechSynthesis.speaking)) return;
  lastWorldSpeech = G.time;
  G.voice.say(text, { ...opts, interrupt: false });
};

// ---------------------------------------------------------------------------
// Flow
// ---------------------------------------------------------------------------
const TITLE_CENTER = new THREE.Vector3(0, 0, 37);
const TITLE_ANGLE = 2.55;
let cutscene = null;
let deadTimer = 0;

/** The player: a commander on foot, or (Take to the skies) the same commander flying a LAAT/i gunship. */
function makePlayer(key, at = null) {
  if (G.player && G.player.dispose) G.player.dispose();
  return G.skies ? new Gunship(G, key, at) : new Player(G, key);
}
function setHudFor(key) {
  if (G.player && G.player.isGunship) G.hud.setCommander('laat', LAAT_CFG);
  else G.hud.setCommander(key, LOADOUTS[key]);
}

/** Switch the playable arena ('roof' | 'street' | 'temple' | 'hall' | 'council' | 'tatooine'); the sunlight's shadow box follows it. */
G.setArena = (name) => {
  const t = G.city.temple, tat = G.tatooine;
  const a = name === 'street' ? G.street.arena : name === 'temple' ? t.exterior : name === 'hall' ? t.hall : name === 'council' ? t.council.arena : name === 'tatooine' ? tat.arena : G.city.roofArena;
  G.arena = a;
  // Tatooine is a world of its own: the city is hidden, and the sky, light, haze and ambience change with it
  const planet = !!a.planet;
  if (G.city.visible === planet) {
    G.city.setVisible(!planet);
    tat.activate(planet, G);
    G.sound.setDesert(planet);
  }
  const sun = G.city.sun;
  sun.target.position.copy(a.shadowTarget);
  sun.target.updateMatrixWorld();
  sun.position.copy(a.shadowTarget).addScaledVector(a.sunDir || SUN_DIR, 160);
  sun.intensity = a.sunIntensity;
  G.city.hemi.intensity = a.hemi ?? 2.0;
};

function resetWorld() {
  if (G.player && G.player.dispose) G.player.dispose();
  G.timeScale = 1;
  G.timers.length = 0;
  G.act = 1;
  if (G.selected !== 'cody' && G.selected !== 'fox') G.selected = settings.pick === 'fox' ? 'fox' : 'cody';
  for (const k of ['gree', 'yoda']) if (G.chars[k]) G.chars[k].group.visible = false;
  G.setArena('roof');
  G.endless = false;
  G.fellDown = false;
  G.civilians.clear();
  G.street.awning.userData.cloth.visible = true;
  G.boss = null;
  G.enemies.paused = false;
  G.enemies.clear();
  G.combat.clear();
  G.skywar.clear();
  if (G.squad) G.squad.clear();
  if (G.objectives) G.objectives.clear();
  G.waves.state = 'idle';
  G.waves.wave = 0;
  G.player = null;
  G.ally = null;
  G.stats = { score: 0, kills: 0, headshots: 0, wave: 0, squadKills: 0, objectives: 0, startT: G.time };
  G.resetTickets();
  for (const k of ['cody', 'fox']) {
    const c = G.chars[k];
    c.pitch = c.twist = 0;
    c.group.visible = true;
  }
}

function placeTitleCharacters() {
  const { cody, fox } = G.chars;
  const s = Math.sin(TITLE_ANGLE), c = Math.cos(TITLE_ANGLE);
  const right = new THREE.Vector3(-c, 0, s);
  cody.position.copy(TITLE_CENTER).addScaledVector(right, 0.9);
  fox.position.copy(TITLE_CENTER).addScaledVector(right, -0.9);
  cody.yaw = TITLE_ANGLE + 0.12;
  fox.yaw = TITLE_ANGLE - 0.12;
}

function selectCommander(key) {
  G.selected = key;
  settings.pick = key;
  saveJSON(SETTINGS_KEY, settings);
  document.querySelectorAll('.card').forEach((el) => el.classList.toggle('sel', el.dataset.key === key));
  G.chars[key].play('Idle', 0.35);
  G.chars[key === 'cody' ? 'fox' : 'cody'].play('Talk', 0.35);
}

/**
 * Title-screen tip when the browser draws the game on built-in graphics: on a laptop with a GeForce or
 * Radeon card that is the usual reason the game suddenly runs at a fraction of its normal frame rate.
 * Chrome and Edge give WebGPU the same chip as WebGL, so the fast card usually stays invisible to the page;
 * when some browser does report it, the tip names it.
 */
async function gpuHint() {
  const el = document.getElementById('gpuHint');
  if (!GPU.integrated || settings.gpuHintDismissed === GPU.name) return;
  let faster = null;
  try {
    const a = navigator.gpu && (await Promise.race([navigator.gpu.requestAdapter({ powerPreference: 'high-performance' }), new Promise((r) => setTimeout(r, 1500))]));
    const v = a && a.info ? (a.info.vendor || '').toLowerCase() : '';
    if (/nvidia/.test(v) && GPU.vendor !== 'nvidia') faster = 'NVIDIA';
    else if (/amd|ati/.test(v) && GPU.vendor !== 'amd') faster = 'AMD';
  } catch { /* no WebGPU: we cannot tell */ }
  const win = /Windows/.test(navigator.userAgent);
  const fix = win ? 'Windows Settings › System › Display › Graphics › your browser › <b>High performance</b>, then restart the browser.' : 'set your browser to use the dedicated graphics card, then restart it.';
  el.querySelector('p').innerHTML = GPU.software
    ? 'Your browser is drawing the game <b>without the graphics card</b> (software rendering), so it will be very slow. Turn on <b>Use graphics acceleration when available</b> in the browser settings and restart it.'
    : faster
      ? `Your browser is drawing the game on the built-in <b>${GPU.short}</b>, but this PC has a much faster <b>${faster}</b> graphics card. For full speed: ${fix}`
      : `Running on built-in graphics (<b>${GPU.short}</b>), so Graphics: Auto lowers the resolution to stay smooth. If this PC also has an NVIDIA or AMD card: ${fix}`;
  el.classList.remove('hidden');
  document.getElementById('gpuHintClose').onclick = () => { el.classList.add('hidden'); settings.gpuHintDismissed = GPU.name; saveJSON(SETTINGS_KEY, settings); };
}

function enterTitle() {
  resetWorld();
  if (G.skies) { G.skies = null; syncDevTag(); }
  G.state = 'title';
  G.input.unlock();
  G.hud.show('hud', false);
  G.hud.show('pause', false);
  G.hud.show('gameover', false);
  G.hud.show('engage', false);
  G.hud.letterbox(false);
  G.hud.subtitle(null);
  G.hud.show('title', true);
  placeTitleCharacters();
  selectCommander(G.selected);
  document.getElementById('best').textContent = best.score ? `BEST: ${best.score.toLocaleString()} pts · wave ${best.wave}` : '';
  camera.fov = 50;
  camera.updateProjectionMatrix();
  G.onFovChange();
}

function deploy(withIntro) {
  G.sound.init();
  G.sound.setVolume(settings.volume);
  G.sound.setMusicVolume(settings.music);
  G.voice.enabled = settings.voice;
  G.hud.show('title', false);
  G.input.lock();
  resetWorld();
  camera.fov = 55;
  camera.updateProjectionMatrix();
  G.onFovChange();
  if (withIntro) {
    G.state = 'cutscene';
    cutscene = G.cutscene = new Cutscene(G, () => startGameplay());
    cutscene.start();
  } else {
    const { cody, fox } = G.chars;
    cody.position.copy(CODY_SPOT); cody.yaw = Math.PI; cody.play('Idle', 0);
    fox.position.copy(FOX_SPOT); fox.yaw = Math.PI; fox.play('Idle', 0);
    startGameplay();
  }
}

G.beginWaves = (delay = 2) => {
  if (G.waves.state === 'idle') G.waves.start(delay);
};

function startGameplay() {
  cutscene = null;
  const key = G.selected, other = key === 'cody' ? 'fox' : 'cody';
  G.player = makePlayer(key);
  G.ally = new Ally(G, other);
  G.squad.start();
  G.player.camYaw = G.player.yaw = Math.PI;
  G.player.camPitch = 0.04;
  setHudFor(key);
  G.hud.show('hud', true);
  G.state = 'playing';
  G.beginWaves(2.5);
  if (G.waves.wave > 0 && G.waves.lastBanner) G.hud.banner(...G.waves.lastBanner);
  camera.fov = 70;
  camera.updateProjectionMatrix();
  G.onFovChange();
  if (!G.input.locked) G.hud.show('engage', true);
}

function startFall() {
  G.fellDown = true;
  G.squad.clear();
  // droids still aboard a dropship rejoin the wave down on the street
  G.waves.queue.unshift(...G.skywar.dropship.abort());
  G.waves.held = G.waves.state;
  G.waves.state = 'hold';
  G.hud.show('hud', false);
  G.hud.show('engage', false);
  G.voice.stop();
  G.state = 'cutscene';
  cutscene = G.cutscene = new FallCutscene(G, endFall);
  cutscene.start();
}

function endFall() {
  cutscene = null;
  const p = G.player, a = G.ally, ar = G.arena;
  p.pos.copy(ar.playerSpawn);
  p.vel.set(0, 0, 0);
  p.yaw = p.camYaw = 0;
  p.char.yaw = 0;
  p.camPitch = 0.05;
  p.hp = Math.max(p.hp, 70);
  p.heat = 0; p.overheat = 0;
  a.pos.copy(ar.allySpawn);
  a.yaw = 0; a.char.yaw = 0;
  G.squad.start();
  G.waves.state = G.waves.held === 'inter' ? 'inter' : 'active';
  G.hud.show('hud', true);
  G.state = 'playing';
  camera.fov = 70;
  camera.updateProjectionMatrix();
  G.onFovChange();
  // the wave's checkpoint now lives down here, so a respawn does not replay the fall
  const cp = G.waves.checkpoint;
  if (cp) { cp.arena = 'street'; cp.fellDown = true; }
  if (!G.input.locked) G.hud.show('engage', true);
}

// ---------------------------------------------------------------------------
// The end: wave 8 cleared -> extraction cutscene -> Republic Victory
// ---------------------------------------------------------------------------
G.onFinalWaveCleared = () => {
  if (G.act === 2) { act2Ending(); return; }
  if (G.act === 3) { startAct3Ending(G.boss); return; }
  if (G.act === 4) { act4Ending(); return; }
  G.squad.clear();
  G.objectives.clear();
  G.hud.show('hud', false);
  G.hud.show('engage', false);
  G.voice.stop();
  G.state = 'cutscene';
  cutscene = G.cutscene = new EndingCutscene(G, showVictory);
  cutscene.start();
};

function showVictory() {
  cutscene = null;
  G.state = 'victory';
  G.input.unlock();
  G.sound.sting('win');
  const s = G.stats;
  const isBest = s.score > best.score;
  if (isBest) { best.score = s.score; best.wave = s.wave; saveJSON(BEST_KEY, best); }
  // Battlefront-style match summary
  const secs = Math.max(0, Math.round(G.time - (s.startT ?? G.time)));
  document.getElementById('vicTime').textContent = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')} · ${LOADOUTS[G.selected].name.toUpperCase()}`;
  document.getElementById('vicScore').innerHTML = `BATTLE POINTS<b>${s.score.toLocaleString()}</b>`;
  const tile = (label, v, gold) => `<div class="tile${gold ? ' gold' : ''}"><small>${label}</small><b>${v}</b></div>`;
  document.getElementById('vicStats').innerHTML = [
    tile('Eliminations', s.kills), tile('Headshots', s.headshots), tile('Waves held', s.wave),
    tile('Squad eliminations', s.squadKills || 0), tile('Objectives', s.objectives || 0), tile('Reinforcements left', G.tickets),
    tile(isBest ? 'New best' : 'Best score', best.score.toLocaleString(), true),
  ].join('');
  if (G.skies && G.act >= G.skies.untilAct) { G.skies = null; syncDevTag(); }
  document.querySelector('#victory .victory-title').textContent = G.act === 4 ? 'MASTER YODA ESCAPES' : G.act === 3 ? 'TATOOINE IS SAFE' : G.act === 2 ? 'THE TEMPLE IS SAFE' : 'REPUBLIC VICTORY';
  document.getElementById('vicContinue').textContent = G.act === 4 ? 'CONTINUE · ENDLESS' : G.act === 3 ? 'ON TO CORUSCANT' : G.act === 2 ? 'ON TO TATOOINE' : 'CONTINUE';
  document.getElementById('victory').classList.remove('hidden');
}

/** Play on after the victory: endless waves on the street. */
function continueEndless() {
  document.getElementById('victory').classList.add('hidden');
  G.endless = true;
  if (G.player && G.player.isGunship) { G.player = makePlayer(G.selected); setHudFor(G.selected); }
  const p = G.player, a = G.ally, ar = G.arena, face = ar.face || 0;
  for (const c of [p.char, a.char]) { c.group.rotation.set(0, 0, 0); c.play('Idle', 0.2); }
  p.pos.copy(ar.playerSpawn); p.vel.set(0, 0, 0);
  p.yaw = p.camYaw = face; p.char.yaw = face; p.camPitch = 0.05;
  p.hp = p.maxHp;
  a.pos.copy(ar.allySpawn); a.yaw = face; a.char.yaw = face;
  if (G.act >= 2) G.squad.start();
  G.waves.state = 'inter';
  G.waves.timer = 5;
  G.waves.saveCheckpoint(true);
  G.hud.show('hud', true);
  G.state = 'playing';
  camera.fov = 70;
  camera.updateProjectionMatrix();
  G.onFovChange();
  G.input.lock();
  if (!G.input.locked) G.hud.show('engage', true);
  G.hud.banner('ENDLESS', G.act === 4 ? 'The order still stands' : G.arena.planet ? 'The wastes are never quiet' : 'The Separatists keep coming');
}
document.getElementById('vicContinue').onclick = () => (G.act === 4 ? continueEndless() : G.act === 3 ? startAct4() : G.act === 2 ? startAct3() : startAct2());

// ---------------------------------------------------------------------------
// Act II: the Jedi Temple
// ---------------------------------------------------------------------------
const HEROES = ['cody', 'fox', 'gree', 'yoda'];
function clearForAct2() {
  if (G.player && G.player.dispose) G.player.dispose();
  G.enemies.clear(); G.combat.clear(); G.skywar.clear(); G.squad.clear(); G.objectives.clear(); G.civilians.clear();
  G.waves.state = 'idle'; G.waves.wave = 0; G.waves.queue = []; G.waves.resumeQueue = null; G.waves.checkpoint = null;
  G.player = null; G.ally = null;
  G.act = 2; G.endless = false; G.fellDown = true;
}

function startAct2(skipIntro = false) {
  for (const id of ['victory', 'gameover']) document.getElementById(id).classList.add('hidden');
  G.hud.show('title', false);
  G.hud.show('pause', false);
  clearForAct2();
  G.setArena('temple');
  G.hud.show('hud', false);
  G.state = 'cutscene';
  cutscene = G.cutscene = new ArrivalCutscene(G, G.city.temple.FZ, showHeroPick);
  cutscene.start();
  if (skipIntro) cutscene.finish();
}
G.startAct2 = startAct2;

function showHeroPick() {
  cutscene = null;
  G.state = 'pick';
  G.input.unlock();
  const T = G.city.temple, cam = camera;
  cam.fov = 50; cam.updateProjectionMatrix(); G.onFovChange();
  if (G.act === 4) {
    // across the Council chamber, the city through the windows behind
    const c = T.council.center;
    cam.position.set(c.x - 13, c.y + 5.5, c.z + 13);
    cam.lookAt(c.x + 3, c.y + 2.5, c.z - 5);
  } else if (G.act === 3) {
    // over the moisture farm, the parked gunship and the dunes beyond
    const W = G.tatooine.W;
    cam.position.copy(W(34, 68)).setY(G.tatooine.H(34, 68) + 9);
    cam.lookAt(W(-2, 22).setY(2));
  } else {
    cam.position.set(T.exterior.center.x + 14, PY_TEMPLE + 6, T.FZ + 70);
    cam.lookAt(T.exterior.center.x, PY_TEMPLE + 14, T.FZ);
  }
  document.getElementById('pickAct').textContent = G.act === 4 ? 'ACT IV · ORDER 66' : G.act === 3 ? 'ACT III · TATOOINE' : 'ACT II · THE JEDI TEMPLE';
  document.getElementById('heroPick').classList.remove('hidden');
}
const PY_TEMPLE = -39;
for (const el of document.querySelectorAll('.hcard')) {
  if (el.dataset.key === 'cody' || el.dataset.key === 'fox') el.querySelector('.hart').innerHTML = '<div class="emblem ' + el.dataset.key + '" style="width:72px;height:72px">' + helmSVG(el.dataset.key) + '</div>';
  el.onclick = () => { G.sound.init(); G.sound.ui(); if (G.act === 4) startAct4Play(el.dataset.key); else if (G.act === 3) startAct3Play(el.dataset.key); else startAct2Play(el.dataset.key); };
}

function placeAct2Heroes(key, ar, face = ar.face || 0) {
  const other = ACT2_ALLY[key];
  for (const k of HEROES) {
    const c = G.chars[k];
    G.scene.attach(c.group);
    c.group.visible = k === key || k === other;
    c.group.rotation.set(0, face, 0);
    c.pitch = c.twist = 0;
    c.play('Idle', 0.1);
  }
  G.chars[key].position.copy(ar.playerSpawn);
  G.chars[other].position.copy(ar.allySpawn);
  G.player = makePlayer(key);
  G.ally = new Ally(G, other);
  G.squad.start();
  if (G.act === 2 && ar.name === 'hall') G.squad.addYounglings(4, ar.playerSpawn);
  G.player.camYaw = G.player.yaw = face;
  G.player.camPitch = 0.04;
  setHudFor(key);
}

function startAct2Play(key) {
  document.getElementById('heroPick').classList.add('hidden');
  G.selected = key;
  placeAct2Heroes(key, G.arena);
  G.hud.show('hud', true);
  G.resetTickets();
  G.waves.wave = 0;
  G.waves.start(3);
  G.state = 'playing';
  camera.fov = 70; camera.updateProjectionMatrix(); G.onFovChange();
  G.input.lock();
  if (!G.input.locked) G.hud.show('engage', true);
  G.hud.banner('ACT II · THE JEDI TEMPLE', 'Clear the droids from the processional way');
}

/** After wave 5: the plaza is held, and the fight moves inside the great hall. */
G.onTempleApproachCleared = () => {
  G.hud.bp('TEMPLE APPROACH SECURED', 1500, 'gold');
  G.stats.score += 1500;
  if (G.skies) {
    // a gunship cannot follow you into the great hall: the rest of the act is fought over the plaza
    G.waves.state = 'inter';
    G.waves.timer = 7;
    G.waves.saveCheckpoint(true);
    G.hud.banner('THE APPROACH IS HELD', 'More droids coming in over the plaza');
    return;
  }
  G.speak('The approach is ours. Inside, now. Hurry!', G.selected === 'yoda' ? 'yoda' : 'gree', { interrupt: false });
  G.hud.fade(true, 600);
  G.after(0.9, () => {
    G.enemies.clear();
    G.combat.clear();
    G.skywar.clear();
    G.setArena('hall');
    const ar = G.arena;
    placeAct2Heroes(G.selected, ar, Math.PI);
    G.waves.state = 'inter';
    G.waves.timer = 7;
    G.waves.saveCheckpoint(true);
    G.hud.fade(false, 900);
    G.hud.banner('INSIDE THE TEMPLE', 'Retake the great hall');
    // the younglings who had been holding the hall against the turncoat clones fall in beside you
    G.squad.addYounglings(4, ar.playerSpawn);
    G.hud.subtitle('YOUNGLING', "Masters! The clones turned on us. We've been holding them back!", 4);
    G.voice.say("Masters! The clones turned on us. We've been holding them back!", { pitch: 1.75, rate: 1.1 });
  });
};

/**
 * The end of Act II (act2.js TempleEnding): the Anchorhead garrison's transmission from Tatooine, Yoda naming Count
 * Dooku and his reason for the desert, and the gunship's climb from the plaza to the assault ship bound for Tatooine.
 */
function act2Ending() {
  G.squad.clear();
  G.objectives.clear();
  G.enemies.clear();
  G.combat.clear();
  G.state = 'cutscene';
  G.hud.show('hud', false);
  G.hud.show('engage', false);
  G.input.unlock();
  G.voice.stop();
  cutscene = G.cutscene = new TempleEnding(G, () => {
    cutscene = null;
    G.state = 'outro';
    G.after(0.5, () => { G.hud.titleCard(null); showVictory(); });
  });
  cutscene.start();
}

// ---------------------------------------------------------------------------
// Act III: Tatooine
// ---------------------------------------------------------------------------
function startAct3(skipIntro = false) {
  for (const id of ['victory', 'gameover', 'heroPick']) document.getElementById(id).classList.add('hidden');
  G.hud.show('title', false);
  G.hud.show('pause', false);
  clearForAct2();
  G.act = 3;
  G.dookuSeen = false;
  G.boss = null;
  G.enemies.paused = false;
  for (const k of HEROES) if (G.chars[k]) G.chars[k].group.visible = false;
  G.setArena('tatooine');
  G.hud.show('hud', false);
  G.state = 'cutscene';
  camera.fov = 55; camera.updateProjectionMatrix(); G.onFovChange();
  cutscene = G.cutscene = new TatooineArrival(G, showHeroPick);
  cutscene.start();
  if (skipIntro) cutscene.finish();
}
G.startAct3 = startAct3;

function startAct3Play(key) {
  if (cutscene) cutscene.finish();
  document.getElementById('heroPick').classList.add('hidden');
  G.selected = key;
  placeAct2Heroes(key, G.arena);
  G.hud.show('hud', true);
  G.resetTickets();
  G.waves.wave = 0;
  G.waves.start(3);
  G.state = 'playing';
  camera.fov = 70; camera.updateProjectionMatrix(); G.onFovChange();
  G.input.lock();
  if (!G.input.locked) G.hud.show('engage', true);
  G.hud.banner('ACT III · TATOOINE', 'Hold the moisture farm');
}

/** Wave 7: Count Dooku arrives (the entrance cutscene); wave 8: he returns, wounded, to finish it. */
const DOOKU_HP = 2600;
G.onDookuArrives = (wave) => {
  const final = wave > DOOKU_WAVE;
  G.dookuMaxHp = DOOKU_HP;
  G.dookuHp = G.devDookuHp || (final ? DOOKU_HP * 0.6 : DOOKU_HP);
  G.devDookuHp = 0;
  G.dookuRetreatAt = final ? 0 : 0.5;
  G.dookuFinal = final;
  const W = G.tatooine.W;
  if (!final && !G.dookuSeen) {
    G.dookuSeen = true;
    const d = (G.boss = G.enemies.spawn('dooku', 'scripted', { at: W(26, -90) }));
    G.enemies.paused = true;
    G.state = 'cutscene';
    G.hud.show('hud', false);
    G.hud.show('engage', false);
    G.voice.stop();
    cutscene = G.cutscene = new DookuEntrance(G, d, () => {
      cutscene = null;
      d.state = 'active';
      d.mode = 'duel';
      d.attackCD = 1.2;
      G.enemies.paused = false;
      G.hud.show('hud', true);
      G.state = 'playing';
      camera.fov = 70; camera.updateProjectionMatrix(); G.onFovChange();
      G.input.lock();
      if (!G.input.locked) G.hud.show('engage', true);
      G.hud.banner('COUNT DOOKU', 'Drive him off the farm');
    });
    cutscene.start();
    return;
  }
  // he leaps in over the dunes
  const d = (G.boss = G.enemies.spawn('dooku', 'gate', { gate: { pos: W(4, -68), dir: new THREE.Vector3(0, 0, 1) }, offset: 0 }));
  if (G.player) d.startLeap(G.player);
  d.speak(final ? 'Enough games. Let us finish this.' : 'Did you think I would leave the desert to you?');
  G.hud.banner('COUNT DOOKU', final ? 'Defeat the Count and break his hold' : 'Drive him off the farm');
};
G.onDookuWithdrew = () => {
  G.boss = null;
  G.hud.banner('COUNT DOOKU WITHDRAWS', 'Clear out the rest of his war party');
  G.speak('He ran. He will be back. Hold the farm!', G.selected === 'yoda' ? 'gree' : G.selected, { interrupt: false });
};
G.onDookuDefeated = (d) => {
  G.waves.queue.length = 0;
  G.waves.state = 'done';
  G.hud.banner('COUNT DOOKU DEFEATED', 'His hold on the desert is broken');
  G.after(2.4, () => { if (G.state === 'playing' || G.state === 'dead') startAct3Ending(d); });
};

function startAct3Ending(d) {
  if (!d) { showVictory(); return; }
  G.squad.clear();
  G.objectives.clear();
  G.state = 'cutscene';
  G.hud.show('hud', false);
  G.hud.show('engage', false);
  G.input.unlock();
  G.voice.stop();
  G.sound.setLightning(0);
  cutscene = G.cutscene = new TatooineEnding(G, d, () => {
    cutscene = null;
    G.state = 'outro';
    G.boss = null;
    G.after(0.4, () => { G.hud.titleCard(null); showVictory(); });
  });
  cutscene.start();
}

// ---------------------------------------------------------------------------
// Act IV: Order 66
// ---------------------------------------------------------------------------
function startAct4(skipIntro = false) {
  for (const id of ['victory', 'gameover', 'heroPick']) document.getElementById(id).classList.add('hidden');
  G.hud.show('title', false);
  G.hud.show('pause', false);
  clearForAct2();
  G.act = 4;
  G.boss = null;
  G.enemies.paused = false;
  G.sound.setLightning(0);
  for (const k of HEROES) if (G.chars[k]) G.chars[k].group.visible = false;
  G.setArena('council');
  G.city.temple.council.resetGlass();
  // the Temple has been burning for hours: start with its smoke already up
  for (let i = 0; i < 140; i++) { G.city.temple.burn(0.1, G.fx); G.fx.update(0.1, camera.position, groundFn); }
  G.hud.show('hud', false);
  G.state = 'cutscene';
  camera.fov = 55; camera.updateProjectionMatrix(); G.onFovChange();
  cutscene = G.cutscene = new Act4Arrival(G, showHeroPick);
  cutscene.start();
  if (skipIntro) cutscene.finish();
}
G.startAct4 = startAct4;

function startAct4Play(key) {
  if (cutscene) cutscene.finish();
  document.getElementById('heroPick').classList.add('hidden');
  G.selected = key;
  placeAct2Heroes(key, G.arena);
  G.hud.show('hud', true);
  G.resetTickets();
  G.waves.wave = 0;
  G.waves.start(3);
  G.state = 'playing';
  camera.fov = 70; camera.updateProjectionMatrix(); G.onFovChange();
  G.input.lock();
  if (!G.input.locked) G.hud.show('engage', true);
  G.hud.banner('ACT IV · ORDER 66', key === 'yoda' ? 'Survive. Your own clones are coming for you' : 'Protect Master Yoda');
}

/** Act IV, after wave 5: down the lifts into the great hall; after wave 6: out onto the processional way. */
G.onAct4Stage = (wave) => {
  const toHall = wave === 5;
  G.hud.bp(toHall ? 'COUNCIL CHAMBER HELD' : 'GREAT HALL CLEARED', 1500, 'gold');
  G.stats.score += 1500;
  if (G.skies && !(toHall && G.arena.name === 'council')) {
    // in the gunship the rest of the act is fought over the processional way
    G.waves.state = 'inter';
    G.waves.timer = 6;
    G.waves.saveCheckpoint(true);
    G.hud.banner('MORE CLONES INBOUND', 'Keep them off the terrace');
    return;
  }
  G.speak(toHall ? 'The lifts! Down to the great hall, quickly!' : 'The doors are open. Out onto the terrace!', G.selected === 'yoda' ? 'gree' : G.selected, { interrupt: false });
  G.hud.fade(true, 600);
  G.after(0.9, () => {
    G.enemies.clear();
    G.combat.clear();
    const dest = toHall && !G.skies ? 'hall' : 'temple';
    G.setArena(dest);
    placeAct2Heroes(G.selected, G.arena, dest === 'hall' ? Math.PI : 0);
    G.waves.state = 'inter';
    G.waves.timer = 6;
    G.waves.saveCheckpoint(true);
    G.hud.fade(false, 900);
    G.hud.banner(toHall ? 'THE GREAT HALL' : 'THE PROCESSIONAL WAY', toHall ? 'Fight your way down through the Temple' : 'Get Master Yoda to the gunship');
  });
};

/** Act IV, after wave 8: a gunship off the terrace, and Yoda into exile. */
function act4Ending() {
  G.squad.clear();
  G.objectives.clear();
  G.enemies.clear();
  G.combat.clear();
  G.state = 'cutscene';
  G.hud.show('hud', false);
  G.hud.show('engage', false);
  G.input.unlock();
  G.voice.stop();
  cutscene = G.cutscene = new Act4Ending(G, () => {
    cutscene = null;
    G.state = 'outro';
    G.after(0.4, () => { G.hud.titleCard(null); showVictory(); });
  });
  cutscene.start();
}

const restartAct = () => (G.act === 4 ? startAct4(true) : G.act === 3 ? startAct3(true) : G.act === 2 ? startAct2(true) : deploy(false));
document.getElementById('vicAgain').onclick = () => { document.getElementById('victory').classList.add('hidden'); restartAct(); };
document.getElementById('vicTitle').onclick = () => { document.getElementById('victory').classList.add('hidden'); syncTitle(); enterTitle(); };

/** Test hook: trigger the fall right now. */
G.fallNow = () => { if (G.state === 'playing' && !G.fellDown) { startFall(); return true; } return false; };

G.onPlayerDeath = () => {
  G.state = 'dead';
  deadTimer = 0;
  G.voice.stop();
  G.sound.setLightning(0);
  const down = { cody: "Cody's down! Commander!", fox: 'Fox is down!', gree: "Gree's down!", yoda: 'Master Yoda! Cover him!' };
  if (G.ally) G.speak(down[G.selected], G.ally.key);
};

/** "ELIMINATED BY ..." caption with the killer's remaining health, while the killcam frames them. */
const kcEl = document.getElementById('killcam');
function updateKillcam() {
  const k = G.player && G.player.killer;
  const on = !!k && deadTimer > 0.6;
  if (on !== !kcEl.classList.contains('hidden')) {
    kcEl.classList.toggle('hidden', !on);
    if (on) document.getElementById('kcName').textContent = k.cfg.name.toUpperCase();
  }
  if (on) document.getElementById('kcFill').style.width = (k.alive ? Math.max(0, k.hp / (k.maxHp || k.cfg.hp)) * 100 : 0) + '%';
}

// Battle Point purchases, picked on the respawn screen and applied to the next life
const PERKS = [
  { id: 'special', cost: 1000, name: () => LOADOUTS[G.selected].special + ' READY', desc: 'Respawn with your commander special fully charged.' },
  { id: 'veteran', cost: 1200, name: () => 'VETERAN SQUAD', desc: 'Your troopers redeploy with double health and hit 50% harder until they fall.' },
  { id: 'armor', cost: 1500, name: () => 'HEAVY PLATING', desc: '+50% health for your next life.' },
];
const perkSel = new Set();
function renderShop() {
  const spent = PERKS.filter((p) => perkSel.has(p.id)).reduce((a, p) => a + p.cost, 0);
  // the checkpoint restores the score from that moment, so that is what there is to spend
  const cp = G.waves.checkpoint;
  const left = (cp ? (cp.half || cp).stats.score : G.stats.score) - spent;
  document.getElementById('shopBp').textContent = left.toLocaleString() + ' BP';
  const box = document.getElementById('shopCards');
  box.innerHTML = '';
  for (const p of PERKS) {
    const sel = perkSel.has(p.id), ok = sel || p.cost <= left;
    const el = document.createElement('div');
    el.className = 'perk' + (sel ? ' sel' : '') + (ok ? '' : ' na');
    el.innerHTML = '<h4>' + p.name() + '</h4><p>' + p.desc + '</p><span>' + p.cost.toLocaleString() + ' BP</span>';
    el.onclick = () => { if (!ok) return; if (sel) perkSel.delete(p.id); else perkSel.add(p.id); G.sound.ui(); renderShop(); };
    box.appendChild(el);
  }
}
function applyPerks() {
  const p = G.player;
  let cost = 0;
  for (const k of PERKS) if (perkSel.has(k.id)) cost += k.cost;
  if (perkSel.has('special')) p.special = 100;
  if (perkSel.has('armor')) { p.maxHp = 150; p.hp = 150; }
  if (perkSel.has('veteran')) for (const t of G.squad.list) if (t.alive) { t.hp = 200; t.vet = true; }
  if (cost) { G.stats.score = Math.max(0, G.stats.score - cost); G.hud.toast('BATTLE POINTS SPENT · ' + cost.toLocaleString() + ' BP'); }
  perkSel.clear();
}

function showGameOver() {
  kcEl.classList.add('hidden');
  G.state = 'gameover';
  G.input.unlock();
  G.sound.sting('lose');
  const s = G.stats;
  const isBest = s.score > best.score;
  if (isBest) { best.score = s.score; best.wave = s.wave; saveJSON(BEST_KEY, best); }
  document.getElementById('goStats').innerHTML = `
    <span>Commander</span><b>${LOADOUTS[G.selected].name}</b>
    <span>Wave reached</span><b>${s.wave}</b>
    <span>Hostiles destroyed</span><b>${s.kills}</b>
    <span>Headshots</span><b>${s.headshots}</b>
    <span>Score</span><b>${s.score.toLocaleString()}</b>
    <span class="best">${isBest ? 'New best!' : 'Best'}</span><b class="best">${best.score.toLocaleString()}</b>`;
  const cp = G.waves.checkpoint, btn = document.getElementById('respawnCp');
  const canRespawn = cp && G.tickets >= RESPAWN_COST;
  btn.classList.toggle('hidden', !canRespawn);
  if (canRespawn) btn.textContent = `RESPAWN · WAVE ${cp.wave}${cp.half ? ' · 50%' : ''}`;
  document.getElementById('goStats').insertAdjacentHTML('beforeend', `<span>Republic reinforcements</span><b>${G.tickets}${canRespawn ? ' (respawn costs ' + RESPAWN_COST + ')' : ''}</b>`);
  if (cp && !canRespawn) document.getElementById('goStats').insertAdjacentHTML('afterbegin', '<span class="best">Out of reinforcements</span><b class="best">Redeploy</b>');
  perkSel.clear();
  document.getElementById('bpShop').classList.toggle('hidden', !canRespawn);
  if (canRespawn) renderShop();
  G.hud.show('gameover', true);
}

/** Respawn at the current wave's checkpoint (its start, or its halfway point if you got that far). */
function respawnAtCheckpoint() {
  const cp = G.waves.checkpoint;
  if (!cp || !G.useTickets(RESPAWN_COST)) { deploy(false); return; }
  const snap = cp.half || cp;
  G.hud.show('gameover', false);
  G.sound.init();
  G.input.lock();
  G.enemies.clear();
  G.combat.clear();
  G.skywar.clear();
  if (G.squad) G.squad.clear();
  if (G.objectives) G.objectives.clear();
  G.hud.subtitle(null);
  G.hud.letterbox(false);
  G.setArena(cp.arena);
  G.fellDown = cp.fellDown;
  G.street.awning.userData.cloth.visible = !cp.fellDown;
  G.civilians.clear();
  if (cp.arena === 'street') G.civilians.start();
  G.stats = { ...snap.stats };
  G.waves.restore(cp);
  G.act = cp.act || 1;
  if (G.act >= 2 && cp.hero) G.selected = cp.hero;
  G.boss = null;
  G.enemies.paused = false;
  const key = G.selected, other = G.act >= 2 ? ACT2_ALLY[key] : key === 'cody' ? 'fox' : 'cody';
  const ar = G.arena, face = ar.face ?? (ar.name === 'street' || ar.name === 'temple' ? 0 : Math.PI);
  for (const k of ['cody', 'fox', 'gree', 'yoda']) {
    const c = G.chars[k];
    G.scene.attach(c.group);
    c.pitch = c.twist = 0;
    c.group.visible = k === key || k === other;
    c.group.rotation.set(0, face, 0);
    c.play('Idle', 0.1);
  }
  G.chars[key].position.copy(ar.playerSpawn);
  G.chars[other].position.copy(ar.allySpawn);
  G.player = makePlayer(key);
  G.ally = new Ally(G, other);
  G.squad.start();
  G.player.camYaw = G.player.yaw = face;
  G.player.camPitch = 0.04;
  G.player.special = snap.special ?? 35;
  G.player.grenades = snap.grenades ?? 3;
  applyPerks();
  setHudFor(key);
  G.hud.show('hud', true);
  G.state = 'playing';
  camera.fov = 70;
  camera.updateProjectionMatrix();
  G.onFovChange();
  if (!G.input.locked) G.hud.show('engage', true);
}
G.respawnAtCheckpoint = respawnAtCheckpoint;

function pause(on) {
  if (on && G.state === 'playing') {
    G.state = 'paused';
    G.hud.show('pause', true);
    G.voice.stop();
    G.input.unlock();
    syncPause();
  } else if (!on && G.state === 'paused') {
    G.hud.show('pause', false);
    G.state = 'playing';
    G.input.lock();
  }
}

G.pause = pause;

G.input.onLockChange = (locked) => {
  if (locked) G.hud.show('engage', false);
  else if (G.state === 'playing' && !G.dev.open) pause(true);
};

// ---------------------------------------------------------------------------
// Dev menu (Ctrl+X): the game freezes while it is open
// ---------------------------------------------------------------------------
G.dev = { open: false, god: false };
const devEl = document.getElementById('dev');
function toggleDev(on = !G.dev.open) {
  if (G.state === 'loading') return;
  G.dev.open = on;
  devEl.classList.toggle('hidden', !on);
  if (on) G.input.unlock();
  else if (G.state === 'playing') { G.input.lock(); if (!G.input.locked) G.hud.show('engage', true); }
}
addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.code === 'KeyX') { e.preventDefault(); toggleDev(); }
});
G.toggleDev = toggleDev;

/** Put the player in wave FALL_WAVE with a single droid between them and the fall cutscene. */
function devJumpBeforeFall() {
  document.getElementById('victory').classList.add('hidden');
  if (G.state !== 'playing' || G.fellDown) {
    G.hud.show('gameover', false);
    G.hud.show('pause', false);
    deploy(false);
  }
  G.enemies.clear();
  G.combat.clear();
  G.skywar.dropship.clear();
  const w = G.waves, p = G.player;
  w.resumeQueue = null;
  w.wave = FALL_WAVE - 1;
  w.begin();
  w.killsThisWave = FALL_KILLS - 1;
  w.spawnT = 12; // the rest of the wave holds back for a moment
  p.hp = p.maxHp;
  p.pos.set(0, 0, 36);
  p.vel.set(0, 0, 0);
  p.camYaw = p.yaw = Math.PI;
  p.camPitch = 0.04;
  G.enemies.spawn('b1', 'gate', { gate: { pos: new THREE.Vector3(0, 0, 18), dir: new THREE.Vector3(0, 0, 1) }, offset: 0, back: 0 });
  G.hud.toast('ONE DROID LEFT BEFORE THE FALL');
}

/** Put the player on the street in the final wave with a single droid between them and the ending. */
function devJumpBeforeEnding() {
  G.enemies.clear();
  G.combat.clear();
  G.skywar.dropship.clear();
  G.endless = false;
  const w = G.waves, p = G.player, ar = G.arena;
  w.resumeQueue = null;
  w.wave = FINAL_WAVE - 1;
  w.begin();
  w.queue.length = 0;
  p.hp = p.maxHp;
  p.pos.copy(ar.playerSpawn);
  p.vel.set(0, 0, 0);
  p.camYaw = p.yaw = 0;
  p.camPitch = 0.04;
  G.enemies.spawn('b1', 'gate', { gate: { pos: new THREE.Vector3(-4, ar.y, 84), dir: new THREE.Vector3(0, 0, -1) }, offset: 0, back: 0 });
  G.hud.toast('ONE DROID LEFT BEFORE THE EXTRACTION');
}

/** Dev (Act III): straight into a Dooku wave; `final` puts him in wave 8 with almost no health left. */
function devDookuWave(final) {
  G.enemies.clear(); G.combat.clear(); G.boss = null; G.enemies.paused = false;
  const w = G.waves;
  w.resumeQueue = null;
  w.wave = final ? DOOKU_WAVE : DOOKU_WAVE - 1;
  w.begin();
  if (final) { w.queue.length = Math.min(w.queue.length, 2); G.devDookuHp = 60; }
  w.dookuDone = true;
  G.dookuSeen = final;
  G.onDookuArrives(w.wave);
  G.hud.toast(final ? 'DOOKU AT 60 HP · WAVE 8' : 'WAVE 7 · DOOKU ARRIVES');
}

/** Dev: jump to one droid before whichever cutscene comes next. */
function devOneBeforeNextCutscene() {
  if (G.act === 3 && G.state === 'playing') { devDookuWave(true); return; }
  if (G.state === 'playing' && G.fellDown) devJumpBeforeEnding();
  else devJumpBeforeFall();
}

/** Dev: play the next cutscene right now (the fall from the roof, the extraction from the street), or skip the one playing. */
function devSkipToNextCutscene() {
  if (G.state === 'victory' && G.act === 1) { startAct2(); return; }
  if (G.state === 'victory' && G.act === 2) { startAct3(); return; }
  if (G.state === 'victory' && G.act === 3) { startAct4(); return; }
  if (G.act === 4 && G.state === 'playing') {
    G.enemies.clear(); G.waves.queue.length = 0;
    const stage = G.skies ? (G.waves.wave <= 5 ? 'council' : G.waves.wave === 6 ? 'hall' : 'temple') : G.arena.name;
    if (stage === 'council') { G.waves.wave = 5; G.waves.state = 'done'; G.onAct4Stage(5); }
    else if (stage === 'hall') { G.waves.wave = 6; G.waves.state = 'done'; G.onAct4Stage(6); }
    else { G.waves.state = 'done'; act4Ending(); }
    return;
  }
  if (G.act === 3 && G.state === 'playing') {
    const d = G.boss;
    if (d && d.alive && d.final) { d.defeat('player'); return; }
    if (G.waves.wave < DOOKU_WAVE) { devDookuWave(false); return; }
    G.waves.queue.length = 0;
    devKillAll();
    devDookuWave(true);
    if (G.boss) G.boss.defeat('player');
    return;
  }
  if (G.act === 2 && G.state === 'playing') {
    G.enemies.clear(); G.skywar.dropship.clear(); G.waves.queue.length = 0;
    // (in the gunship the whole act stays on the plaza, so go by the wave)
    if (G.skies ? G.waves.wave <= 5 : G.arena.name === 'temple') { G.waves.wave = 5; G.waves.state = 'done'; G.onTempleApproachCleared(); } else { G.waves.state = 'done'; act2Ending(); }
    return;
  }
  document.getElementById('victory').classList.add('hidden');
  if (G.state === 'cutscene' && cutscene) { cutscene.finish(); return; }
  if (G.state === 'playing' && G.fellDown) {
    devJumpBeforeEnding();
    G.enemies.clear();
    G.waves.queue.length = 0;
    G.waves.state = 'done';
    G.onFinalWaveCleared();
    return;
  }
  devJumpBeforeFall();
  G.enemies.clear();
  startFall();
}

function devKillAll() {
  for (const e of [...G.enemies.list]) if (e.alive && e.state !== 'scripted') e.damage(1e6, null, false, 'dev');
}

const devGodBtn = document.getElementById('devGod');
const syncGod = () => {
  devGodBtn.textContent = `Invincibility: ${G.dev.god ? 'ON' : 'OFF'}`;
  devGodBtn.classList.toggle('on', G.dev.god);
  syncDevTag();
};
function syncDevTag() {
  const tags = [G.dev.god && 'INVINCIBLE', G.skies && 'FLYING A LAAT/I'].filter(Boolean);
  const el = document.getElementById('devTag');
  el.textContent = 'DEV · ' + tags.join(' · ');
  el.classList.toggle('hidden', !tags.length);
  document.getElementById('devSkies').classList.toggle('on', !!G.skies);
}
/**
 * Take to the skies: fly a LAAT/i gunship. Pressed in a fight, you take off on the spot and keep the gunship for
 * the rest of this phase and all of the next; pressed anywhere else, it is yours for the whole of the next phase you
 * play. Press it again to land for good and go back on foot.
 */
function toggleSkies() {
  if (G.skies) {
    G.skies = null;
    if (G.player && G.player.isGunship && G.state === 'playing') swapPlayer();
  } else {
    const fighting = G.state === 'playing' || G.state === 'paused' || G.state === 'dead';
    const next = G.state === 'title' ? 1 : G.state === 'victory' ? Math.min(4, G.act + 1) : G.act;
    G.skies = { untilAct: fighting ? G.act + 1 : next };
    if (G.state === 'playing' && G.player) {
      // indoors there is no room to fly: out to the open ground of this act first
      // (the Council chamber is fine: the gunship flies round the outside of the tower)
      if (G.arena.indoor && G.arena.name !== 'council') {
        G.enemies.clear(); G.combat.clear();
        if (G.arena.name !== 'council') G.setArena(G.act === 2 || G.act === 4 ? 'temple' : G.arena.name);
        G.ally.pos.copy(G.arena.allySpawn);
        G.player.pos.copy(G.arena.playerSpawn);
        G.squad.clear(); G.squad.start();
      }
      swapPlayer();
    }
  }
  syncDevTag();
}
/** Change over mid-fight between the commander on foot and the gunship, keeping the special meter. */
function swapPlayer() {
  const old = G.player, key = G.selected;
  const at = old.pos.clone(), yaw = old.camYaw, special = old.special;
  G.player = makePlayer(key, G.skies && G.arena.skySpawn ? null : at);
  if (!G.player.isGunship) {
    // down onto the ground under where the gunship was hovering (or back to the start if that is open air)
    const g = G.world.groundAt(at.x, at.z, at.y + 1, 0.3);
    G.player.pos.copy(g > -1e9 ? at.setY(g) : G.arena.playerSpawn);
    G.player.char.group.visible = true;
  }
  if (!(G.player.isGunship && G.arena.skySpawn)) G.player.camYaw = G.player.yaw = yaw;
  G.player.special = special;
  setHudFor(key);
}
document.getElementById('devSkies').onclick = () => { toggleSkies(); toggleDev(false); };
document.getElementById('devJump').onclick = () => { devSkipToNextCutscene(); toggleDev(false); };
document.getElementById('devBefore').onclick = () => { devOneBeforeNextCutscene(); toggleDev(false); };
devGodBtn.onclick = () => { G.dev.god = !G.dev.god; syncGod(); };
document.getElementById('devKill').onclick = () => { if (G.state === 'playing') devKillAll(); toggleDev(false); };
document.getElementById('devNext').onclick = () => {
  if (G.state === 'playing') { G.waves.queue.length = 0; G.skywar.dropship.clear(); devKillAll(); if (G.waves.state === 'inter') G.waves.timer = 0.5; }
  toggleDev(false);
};
let voiceTestI = 0;
document.getElementById('devVoice').onclick = () => {
  const [who, text] = VOICE_TEST[voiceTestI++ % VOICE_TEST.length];
  G.sound.init();
  const said = G.voice.speakable(text);
  document.getElementById('devVoice').textContent = 'Voice test ' + voiceTestI % VOICE_TEST.length + '/' + VOICE_TEST.length + ': ' + said;
  const v = VOICE_EXTRA[who] || (LOADOUTS[who] && LOADOUTS[who].voice) || {};
  G.voice.say(text, v);
};
G.devJumpBeforeFall = devJumpBeforeFall;
G.devSkipToNextCutscene = devSkipToNextCutscene;

// ---------------------------------------------------------------------------
// UI wiring
// ---------------------------------------------------------------------------
function bindSettings(suffix) {
  const $ = (id) => document.getElementById(id + suffix);
  const voice = $('optVoice'), gfx = $('optGfx'), sens = $('optSens'), vol = $('optVol'), music = $('optMusic'), fps = $('optFps');
  const padSens = $('optPadSens'), glyph = $('optGlyph'), invert = $('optInvert'), assist = $('optAssist'), rumble = $('optRumble'), swap = $('optSwap');
  const sync = () => {
    voice.checked = settings.voice; gfx.value = settings.gfx; sens.value = settings.sens; vol.value = settings.volume; music.value = settings.music; fps.checked = settings.fps;
    padSens.value = settings.padSens; glyph.value = settings.padGlyphs; invert.checked = settings.padInvert; assist.checked = settings.padAssist; rumble.checked = settings.padRumble; swap.checked = settings.padSwap;
  };
  const save = () => saveJSON(SETTINGS_KEY, settings);
  padSens.oninput = () => { settings.padSens = +padSens.value; save(); };
  glyph.onchange = () => { settings.padGlyphs = glyph.value; save(); };
  invert.onchange = () => { settings.padInvert = invert.checked; save(); };
  assist.onchange = () => { settings.padAssist = assist.checked; save(); };
  rumble.onchange = () => { settings.padRumble = rumble.checked; save(); if (rumble.checked) pad.rumble(0.5, 0.5, 200); };
  swap.onchange = () => { settings.padSwap = swap.checked; save(); };
  fps.onchange = () => { settings.fps = fps.checked; document.getElementById('fps').classList.toggle('hidden', !settings.fps); saveJSON(SETTINGS_KEY, settings); };
  sync();
  voice.onchange = () => { settings.voice = voice.checked; G.voice.enabled = settings.voice; if (!settings.voice) G.voice.stop(); saveJSON(SETTINGS_KEY, settings); };
  gfx.onchange = () => setGraphics(gfx.value);
  sens.oninput = () => { settings.sens = +sens.value; saveJSON(SETTINGS_KEY, settings); };
  vol.oninput = () => { settings.volume = +vol.value; G.sound.setVolume(settings.volume); saveJSON(SETTINGS_KEY, settings); };
  music.oninput = () => { settings.music = +music.value; G.sound.setMusicVolume(settings.music); saveJSON(SETTINGS_KEY, settings); };
  return sync;
}
const syncTitle = bindSettings('');
const syncPause = bindSettings('2');

document.querySelectorAll('.card').forEach((el) => {
  el.querySelector('.emblem').innerHTML = helmSVG(el.dataset.key);
  el.addEventListener('click', () => { G.sound.init(); G.sound.ui(); selectCommander(el.dataset.key); });
  el.addEventListener('mouseenter', () => G.sound.ui());
});
document.getElementById('deploy').onclick = () => deploy(true);
document.getElementById('optToggle').onclick = () => document.getElementById('optPanel').classList.toggle('hidden');
document.getElementById('deploySkip').onclick = () => deploy(false);
document.getElementById('resume').onclick = () => pause(false);
document.getElementById('restart').onclick = () => { G.hud.show('pause', false); restartAct(); };
document.getElementById('quit').onclick = () => { syncTitle(); enterTitle(); };
document.getElementById('redeploy').onclick = () => { G.hud.show('gameover', false); restartAct(); };
document.getElementById('respawnCp').onclick = () => respawnAtCheckpoint();
document.getElementById('goTitle').onclick = () => { syncTitle(); enterTitle(); };
document.getElementById('engage').onclick = () => G.input.lock();
document.getElementById('pause').addEventListener('mouseenter', syncPause, { once: false });

// ---------------------------------------------------------------------------
// Loop
// ---------------------------------------------------------------------------
let lastFrame = performance.now();
const _right = new THREE.Vector3();
const groundFn = (p) => G.world.groundAt(p.x, p.z, p.y + 0.4, 0.05);

function updateTitle(dt) {
  const a = TITLE_ANGLE + Math.sin(G.time * 0.11) * 0.22;
  camera.position.set(TITLE_CENTER.x + Math.sin(a) * 6.3, 1.5 + Math.sin(G.time * 0.17) * 0.15, TITLE_CENTER.z + Math.cos(a) * 6.3);
  // look a little left of the pair so they sit beside the menu panel
  const wide = Math.min(1, innerWidth / innerHeight / 1.6);
  const off = 1.9 * wide;
  camera.lookAt(TITLE_CENTER.x - Math.cos(a) * off, 1.15, TITLE_CENTER.z + Math.sin(a) * off);
  G.chars.cody.update(dt);
  G.chars.fox.update(dt);
}

function update(dt) {
  const input = G.input;
  if (G.player && G.player.isGunship && !G.player.disposed && !['playing', 'dead', 'gameover', 'paused'].includes(G.state)) G.player.dispose();
  // heads turned toward a speaker in a cutscene straighten up again once it is over
  if (G.state !== 'cutscene') for (const k in G.chars) if (G.chars[k].lookTarget) G.chars[k].lookTarget = null;
  switch (G.state) {
    case 'title':
      updateTitle(dt);
      break;
    case 'cutscene':
      // skip: Space / Enter / Esc, or the controller's A or Start (which press Space and P)
      if (input.hit('Space') || input.hit('Enter') || input.hit('Escape') || input.hit('KeyP')) cutscene.finish();
      else cutscene.update(dt);
      if (G.waves.state !== 'idle') G.waves.update(dt);
      G.enemies.update(dt);
      G.combat.update(dt);
      break;
    case 'playing':
      if (input.hit('KeyP')) { pause(true); break; }
      G.player.update(dt);
      G.ally.update(dt);
      G.squad.update(dt);
      G.objectives.update(dt);
      G.enemies.update(dt);
      G.combat.update(dt);
      G.waves.update(dt);
      // first person in VR: the headset is the camera
      if (!G.vr.ownsCamera()) G.player.updateCamera(dt);
      if (G.act === 1 && !G.fellDown && !G.skies && G.waves.wave >= FALL_WAVE && G.waves.state === 'active' && G.waves.killsThisWave >= FALL_KILLS) startFall();
      break;
    case 'dead':
      deadTimer += dt;
      updateKillcam();
      G.player.update(dt);
      G.ally.update(dt);
      G.squad.update(dt);
      G.enemies.update(dt);
      G.combat.update(dt);
      G.player.updateCamera(dt);
      if (deadTimer > 3.2) showGameOver();
      break;
    case 'gameover':
      G.player.deadT += dt;
      G.enemies.update(dt);
      G.combat.update(dt);
      G.player.updateCamera(dt);
      if (G.ally) G.ally.char.update(dt);
      break;
  }
  G.skywar.update(dt, G.state === 'cutscene');
  for (let i = G.timers.length - 1; i >= 0; i--) if (G.time >= G.timers[i].t) { const f = G.timers[i].fn; G.timers.splice(i, 1); f(); }
  G.civilians.update(dt);
  // lightsaber hum: Dooku's blade nearby, or your own as Yoda
  {
    let saber = 0;
    const b = G.boss;
    if (b && b.lit && !b.removed && b.char.group.visible) saber = Math.max(0, 1 - b.pos.distanceTo(camera.position) / 22);
    if (G.player && G.player.cfg.melee && G.player.alive && G.state === 'playing') saber = Math.max(saber, 0.5);
    G.sound.setSaber(saber);
  }
  if (G.act === 4 && G.city.visible) G.city.temple.burn(dt, G.fx);
  if (G.arena.planet) G.tatooine.fxUpdate(dt, G.fx, camera.position);
  else {
    G.city.arenaFX.update(dt, G.fx);
    if (G.arena === G.street.arena) G.street.fxUpdate(dt, G.fx, camera.position);
    else G.city.temple.fxUpdate(dt, G.fx, G.arena);
  }
  G.fx.update(dt, camera.position, groundFn);
  G.city.update(dt, G.time, camera);
  if (G.arena.planet) G.tatooine.update(dt, G.time, camera);
  _right.set(1, 0, 0).applyQuaternion(camera.quaternion);
  G.sound.setListener(camera.position, _right);
  G.hud.update(dt, G);
  updatePost(dt);
}

function updatePost(dt) {
  const p = G.player;
  const live = p && p.alive && G.state === 'playing';
  const k = live ? Math.min(1, Math.max(0, (0.35 - p.hp / p.maxHp) / 0.35)) : 0;
  // heartbeat-shaped pulse that quickens as health drops
  const beat = (G.time * (1.1 + k * 0.9)) % 1;
  const pulse = Math.exp(-beat * 9) + 0.6 * Math.exp(-Math.max(0, beat - 0.18) * 9) * (beat > 0.18 ? 1 : 0);
  // cutscene character lighting: a warm key just off the subject on the camera's left, and a cool edge light on
  // its right. Both are close and short-reaching, so they light the face without flooding a shoulder in the
  // foreground (over-the-shoulder shots) or the wall and the troopers behind (gunship bays).
  const csl = G.state === 'cutscene' ? G.cutscene : null;
  if (csl && csl.look && csl.keyLight !== false) {
    const d = camera.position.distanceTo(csl.look);
    if (d < 16) {
      _right.set(1, 0, 0).applyQuaternion(camera.quaternion);
      _kl.subVectors(camera.position, csl.look).setY(0).normalize();
      const near = Math.min(1, Math.max(0.35, d / 3));
      _kp.copy(csl.look).addScaledVector(_kl, 0.9 * near).addScaledVector(_right, -1.0 * near).setY(csl.look.y + 0.55);
      G.fx.holdLight(0, _kp, 0xffe6cc, 2.4, 3.2);
      _kp.copy(csl.look).addScaledVector(_kl, -0.25).addScaledVector(_right, 1.1).setY(csl.look.y + 0.5);
      G.fx.holdLight(1, _kp, 0x9cc0ff, 3.2, 2.3);
    }
  }
  // the grade (flashes, kicks) runs in real time even during slow motion
  post.update(dt / Math.max(0.05, G.timeScale), G.time, camera.aspect, { ads: live ? p.aim : 0, lowHp: k > 0 ? 0.35 + k * 0.65 : 0, pulse: Math.min(1, pulse) });
  // dynamic score: calm between waves, combat while droids are up, climax when it gets heavy
  let intensity = 0.05;
  if (G.state === 'cutscene') intensity = 0.25;
  else if (G.state === 'playing' || G.state === 'dead') {
    const alive = G.enemies.aliveCount();
    intensity = G.waves.state === 'active' ? 0.38 + 0.45 * Math.min(1, alive / 12) + Math.min(0.15, G.waves.wave * 0.02) + k * 0.2 : 0.18;
  }
  G.sound.update(dt, { intensity, lowHp: k, battle: G.state !== 'loading' });
}

// Advance the simulation by hand (used for testing when the tab is in the background).
G.debugStep = (seconds, fps = 30, render = true) => {
  const n = Math.max(1, Math.round(seconds * fps));
  for (let i = 0; i < n; i++) {
    if (G.state !== 'paused') { const sdt = (1 / fps) * G.timeScale; G.time += sdt; update(sdt); }
    G.input.endFrame();
  }
  if (render) composer.render();
  return G.state;
};

// optional on-screen frame rate (Show FPS in the options)
const fpsEl = document.getElementById('fps');
fpsEl.classList.toggle('hidden', !settings.fps);
let fpsN = 0, fpsMs = 0, fpsWorst = 0;
function fpsMeter(ms) {
  if (!settings.fps) return;
  fpsN++; fpsMs += ms; fpsWorst = Math.max(fpsWorst, ms);
  if (fpsMs >= 500) {
    const q = `${settings.gfx === 'auto' ? 'AUTO ' : ''}${TIERS[tier].label} ${Math.round(renderScale() * 100)}%`;
    fpsEl.textContent = `${Math.round((fpsN * 1000) / fpsMs)} FPS · ${(fpsMs / fpsN).toFixed(1)} ms · worst ${fpsWorst.toFixed(0)} ms · ${q} · ${GPU.short}`;
    fpsN = fpsMs = fpsWorst = 0;
  }
}

// renderer.setAnimationLoop drives this, so it keeps running inside a VR session (where requestAnimationFrame stops)
function frame() {
  // GCD.freeze stops the real-time loop so tests can drive the game with debugStep()
  if (G.freeze) { lastFrame = performance.now(); return; }
  const now = performance.now();
  const dt = Math.min((now - lastFrame) / 1000, 1 / 20);
  fpsMeter(now - lastFrame);
  autoQuality(now - lastFrame);
  lastFrame = now;
  // the controller: read it, and let it drive the menus (paused or not)
  G.vr.pollInput(dt);
  G.padUI.update(dt);
  if (G.state !== 'paused' && !G.dev.open) {
    // G.timeScale scales game time (1 = normal speed)
    const sdt = dt * G.timeScale;
    G.time += sdt;
    G.vr.preUpdate(sdt);
    update(sdt);
  }
  G.vr.postUpdate(dt);
  // in a headset: straight to the eyes (the post-processing stack is screen-only)
  if (G.vr.presenting) renderer.render(scene, G.vr.cam);
  else composer.render();
  G.input.endFrame();
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
/** Loading screen: a painted Coruscant skyline at dusk, and gameplay tips that rotate until the game is ready. */
const TIPS = [
  'Tap Ctrl to crouch: you are a smaller target and your shots stay steady.',
  'Press E on a droid to spot it. Your squad focuses spotted targets, and you earn BP when they finish them.',
  'Overheated? Press R as the marker crosses the blue zone to cool instantly and hit harder.',
  'Droids slice uplinks they hold unopposed. Stand in the ring to stop them.',
  'Battle Points you save can be spent on the respawn screen: a charged special, a veteran squad, heavy plating.',
  'A combat roll (C) gives you a moment of invulnerability. Use it to cross open ground.',
  'Super battle droids soak up blaster fire. Aim for the head, or use a thermal detonator.',
  'Rocket droids circle above the fight. Look up when you hear jetpacks.',
  'Your squad fights on its own anywhere on the map, and is reinforced while you have tickets.',
  'Dropships unload right on top of the fight. Catch the droids as they land.',
  'Tusken snipers glint just before they fire. Break line of sight, or roll.',
  'Count Dooku bats blaster fire back from the front. Flank him, or use grenades.',
  "Jawa scatter blasters shred at close range but fade with distance. Keep them at arm's length.",
];
function paintLoading() {
  const cv = document.getElementById('loadArt');
  if (!cv) return null;
  const w = cv.width = innerWidth, h = cv.height = innerHeight, g = cv.getContext('2d');
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const sky = g.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#0b1426'); sky.addColorStop(0.45, '#3a2a3e'); sky.addColorStop(0.72, '#c8683a'); sky.addColorStop(1, '#2a1410');
  g.fillStyle = sky; g.fillRect(0, 0, w, h);
  const sun = g.createRadialGradient(w * 0.66, h * 0.7, 0, w * 0.66, h * 0.7, h * 0.5);
  sun.addColorStop(0, 'rgba(255,200,120,0.85)'); sun.addColorStop(0.2, 'rgba(255,140,70,0.35)'); sun.addColorStop(1, 'rgba(255,120,60,0)');
  g.fillStyle = sun; g.fillRect(0, 0, w, h);
  // three layers of towers, hazy far to dark near, with lit windows
  for (const [n, top, col, win] of [[60, 0.42, '#4a2f3a', 0.05], [36, 0.3, '#24172a', 0.12], [16, 0.12, '#0b0910', 0.2]]) {
    for (let i = 0; i < n; i++) {
      const bw = (0.02 + rnd() * 0.05) * w * (top < 0.2 ? 2 : 1), x = rnd() * w * 1.1 - bw * 0.5;
      const y = h * (top + rnd() * 0.35) * (top < 0.2 ? 1.6 : 1.25);
      g.fillStyle = col; g.fillRect(x, y, bw, h - y);
      if (rnd() < 0.4) g.fillRect(x + bw * 0.42, y - h * 0.06 * rnd() - 10, bw * 0.16, h * 0.08);
      g.fillStyle = 'rgba(255, 214, 150, 0.9)';
      for (let k = 0; k < bw * (h - y) * win * 0.004; k++) g.fillRect(x + rnd() * bw, y + rnd() * (h - y), 2, 3);
    }
  }
  // traffic streaks
  g.strokeStyle = 'rgba(255, 230, 200, 0.5)'; g.lineWidth = 1.2;
  for (let i = 0; i < 26; i++) { const y = h * (0.35 + rnd() * 0.35), x = rnd() * w; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 30 + rnd() * 60, y - 2); g.stroke(); }
  const shade = g.createLinearGradient(0, 0, 0, h);
  shade.addColorStop(0, 'rgba(4,7,12,0.35)'); shade.addColorStop(0.5, 'rgba(4,7,12,0.05)'); shade.addColorStop(1, 'rgba(4,7,12,0.75)');
  g.fillStyle = shade; g.fillRect(0, 0, w, h);
  const tip = document.querySelector('#loadTip span');
  let ti = Math.floor(Math.random() * TIPS.length);
  const next = () => { tip.style.opacity = 0; setTimeout(() => { tip.textContent = TIPS[ti++ % TIPS.length]; tip.style.opacity = 1; }, 400); };
  tip.textContent = TIPS[ti++ % TIPS.length];
  return setInterval(next, 4200);
}

async function boot() {
  const tipTimer = paintLoading();
  applyQuality();
  try {
    await loadModels((p) => G.hud.loading(p * 0.8, 'Loading Blender rigs…'));
  } catch (e) {
    G.hud.loading(0, 'Could not load the 3D models. Start the game with Play.bat (it needs a local web server).');
    console.error(e);
    return;
  }
  G.hud.loading(0.85, 'Building Coruscant…');
  await new Promise((r) => setTimeout(r, 30));
  G.city = buildCity(scene, renderer);
  G.world = G.city.world;
  G.hud.loading(0.88, 'Building Tatooine…');
  await new Promise((r) => setTimeout(r, 30));
  G.tatooine = buildTatooine(scene, G.world, renderer);
  G.street = G.city.street;
  G.arena = G.city.roofArena;
  G.fx = new FX(scene);
  G.fx.post = post;
  G.pool = new CharacterPool(scene);
  G.skywar = new SkyWar(G);
  G.civilians = new Civilians(G, G.street);
  G.enemies = new EnemyManager(G);
  G.combat = new Combat(G);
  G.waves = new WaveDirector(G);
  G.squad = new Squad(G);
  G.objectives = new Objectives(G);
  G.chars.cody = new Character(scene, 'cody');
  G.chars.fox = new Character(scene, 'fox');
  // Act II heroes
  G.chars.gree = new Character(scene, 'gree');
  G.chars.yoda = new Character(scene, 'yoda_saber');
  G.chars.gree.group.visible = G.chars.yoda.group.visible = false;
  applyQuality();

  // warm up shaders for every enemy type so the first spawn doesn't hitch
  G.hud.loading(0.92, 'Compiling shaders…');
  const warm = Object.values(ENEMY_TYPES).map((t) => G.pool.get(t.model));
  warm.forEach((c, i) => c.position.set(i * 2, 0, 30));
  placeTitleCharacters();
  camera.position.set(0, 3, 45);
  camera.lookAt(0, 1, 30);
  renderer.compile(scene, camera);
  composer.render();
  warm.forEach((c) => G.pool.release(c));

  G.hud.loading(1, 'Ready');
  G.hud.show('loading', false);
  if (tipTimer) clearInterval(tipTimer);
  G.city.temple.hall.objectiveText4 = 'ESCAPE THE TEMPLE';
  G.city.temple.exterior.objectiveText4 = 'GET MASTER YODA TO THE GUNSHIP';
  G.padUI = new PadUI(G);
  G.vr = new VR(G);
  enterTitle();
  gpuHint();
  lastFrame = performance.now();
  renderer.setAnimationLoop(frame);
}

boot();
