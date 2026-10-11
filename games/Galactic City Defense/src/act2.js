import * as THREE from 'three';
import { Character } from './character.js';
import { buildLAAT, buildAssaultShip } from './ships.js';
import { Beats, ShotMixin, clearLooks } from './beats.js';
import { TX, PY } from './temple.js';
import { clamp, easeInOut, smooth, lerp } from './util.js';

// Act II: the Jedi Temple. The arrival cutscene (the gunship sets down on the processional plaza
// while Jedi Masters cross it), then the hero pick.

const LINES = [
  { who: 'yoda', text: 'Infiltrated the Temple, the droids have. In its halls, and all around it.' },
  { who: 'gree', text: 'Our scouts count droids on every terrace, General. More of them inside.' },
  { who: 'cody', text: "Then we clear the approach first, and fight our way in from there." },
  { who: 'yoda', text: 'Hmm. Choose who leads, we must. Quickly now.' },
];
const NAMES = { cody: 'CODY', fox: 'FOX', yoda: 'YODA', gree: 'GREE' };
const lineDur = (i) => clamp(0.07 * LINES[i].text.length + 1.2, 1.6, 9);
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const FLOOR = 0.545;
const SEATS = { yoda: [-0.95, 1.4], gree: [-0.9, 0.25], cody: [-0.85, -1.0], fox: [-0.75, -2.2] };
const TROOPERS = [[0.3, 2.3, -1.3], [0.9, 1.1, -1.9], [0.6, -0.2, -1.6], [0.2, -1.5, -1.2], [1.0, -2.7, -1.8], [-0.1, -3.2, -1.5]];
const ROBES = [['#5e4230', '#c99a78'], ['#3a3632', '#8a5a3e'], ['#7a5a3a', '#e0b090'], ['#4a3a2a', '#6a4a32']];
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _q = new THREE.Quaternion();

export class ArrivalCutscene {
  constructor(G, fz, onDone) {
    this.G = G;
    this.FZ = fz;
    this.onDone = onDone;
    this.look = new THREE.Vector3();
    this.crew = [];
    this.masters = [];
    this.done = false;
    this.HOVER = V(TX - 15, PY + 0.25, fz + 44);
    this.START = V(TX - 15, PY + 70, fz + 330);
    this.beats = this.buildBeats();
  }

  line(i) {
    const L = LINES[i];
    this.G.hud.subtitle(NAMES[L.who], L.text, lineDur(i));
    this.G.speak(L.text, L.who);
  }

  shot(pa, pb, la, lb, k) {
    const e = easeInOut(k), cam = this.G.camera;
    cam.position.lerpVectors(pa, pb, e);
    this.look.lerpVectors(la, lb, e);
    cam.lookAt(this.look);
  }

  onShip(x, y, z, out = new THREE.Vector3()) { this.laat.updateMatrixWorld(); return this.laat.localToWorld(out.set(x, y, z)); }
  head(key, out) { const [x, z] = SEATS[key]; return this.onShip(x, FLOOR + (key === 'yoda' ? 0.6 : 1.62), z, out); }

  seat(ch, key) {
    const [x, z] = SEATS[key];
    this.laat.add(ch.group);
    ch.position.set(x, FLOOR, z);
    ch.yaw = -Math.PI / 2;
    ch.group.visible = true;
    ch.play('Idle', 0);
  }

  buildBeats() {
    const G = this.G, FZ = this.FZ;
    const beats = [];
    // 0: the gunship flies in over the city to the Temple
    beats.push({
      dur: 6.5,
      enter: () => G.hud.titleCard(['THE JEDI TEMPLE', 'CORUSCANT · PROCESSIONAL WAY', 'Droids have been sighted inside the Temple precinct.'], 0.6, 4.8, true),
      update: (t, k) => {
        const e = smooth(k);
        this.laat.position.lerpVectors(this.START, _a.copy(this.HOVER).setY(PY + 14), e);
        this.laat.rotation.set(-0.12 * (1 - k), Math.PI, Math.sin(t * 0.8) * 0.04);
        _b.copy(this.laat.position).add(_a.set(12 - 4 * k, 5 - 1.5 * k, 27 - 7 * k));
        G.camera.position.copy(_b);
        this.look.set(TX, PY + 30 - 12 * k, FZ).lerp(this.laat.position, 0.55);
        G.camera.lookAt(this.look);
      },
    });
    // 1: it settles on the plaza; Jedi Masters cross in the foreground
    beats.push({
      dur: 4.6,
      update: (t, k) => {
        this.laat.position.lerpVectors(_a.copy(this.HOVER).setY(PY + 14), this.HOVER, smooth(Math.min(1, k * 1.3)));
        this.laat.rotation.set(0.06 * Math.sin(k * Math.PI), Math.PI, 0);
        if (k > 0.6 && !this.dusted) { this.dusted = true; G.fx.dust(this.HOVER, 40, 2.4); G.sound.thump(this.HOVER); }
        this.shot(V(TX + 11, PY + 1.7, FZ + 56), V(TX + 9, PY + 1.6, FZ + 53), _a.copy(this.laat.position).setY(this.laat.position.y + 2), _b.copy(this.HOVER).setY(PY + 2.2), k);
      },
    });
    // 2-5: the briefing, aboard
    beats.push({
      dur: lineDur(0), line: 0, fov: 30, enter: () => { this.line(0); this.yoda.play('Talk', 0.3); this.listen(this.yoda, this.crew); },
      update: (t, k) => this.face(this.yoda, k, { dist: 1.9, ang: 0.45, dy: 0.05 }, { dist: 1.65, ang: 0.4, dy: 0.04 }),
    });
    beats.push({
      dur: lineDur(1), line: 1, fov: 25, enter: () => { this.line(1); this.yoda.play('Idle', 0.4); this.gree.play('Talk', 0.3); this.listen(this.gree, this.crew, this.yoda); },
      update: (t, k) => this.face(this.gree, k, { dist: 2.1, ang: 0.42, dy: 0.0 }, { dist: 1.9, ang: 0.38, dy: -0.02 }),
    });
    beats.push({
      dur: lineDur(2), line: 2, fov: 25, enter: () => { this.line(2); this.gree.play('Idle', 0.4); G.chars.cody.play('Talk', 0.3); this.listen(G.chars.cody, this.crew, this.yoda); },
      update: (t, k) => this.face(G.chars.cody, k, { dist: 2.1, ang: 0.42, dy: 0.0 }, { dist: 1.9, ang: 0.38, dy: -0.02 }),
    });
    beats.push({
      dur: Math.max(lineDur(3), 3.2), line: 3, fov: 36, enter: () => { this.line(3); G.chars.cody.play('Idle', 0.4); this.yoda.play('Talk', 0.3); this.listen(this.yoda, this.crew); },
      update: (t, k) => this.face(this.yoda, k, { dist: 3.0, ang: 0.85, dy: 0.42, drop: -0.25 }, { dist: 2.6, ang: 0.78, dy: 0.36, drop: -0.22 }),
    });
    return beats;
  }

  start() {
    const G = this.G;
    G.hud.letterbox(true);
    this.laat = buildLAAT({ bay: true });
    this.laat.position.copy(this.START);
    G.scene.add(this.laat);
    this.yoda = new Character(G.scene, 'yoda');
    this.gree = G.chars.gree;
    this.seat(this.yoda, 'yoda');
    this.seat(this.gree, 'gree');
    this.seat(G.chars.cody, 'cody');
    this.seat(G.chars.fox, 'fox');
    this.crew.push(this.yoda, this.gree, G.chars.cody, G.chars.fox);
    for (const [x, z, yaw] of TROOPERS) {
      const t = new Character(G.scene, 'clone_trooper');
      this.laat.add(t.group);
      t.position.set(x, FLOOR, z);
      t.yaw = yaw;
      t.play('Idle', 0);
      t.mixer.setTime(Math.random() * 2);
      this.crew.push(t);
    }
    // Jedi Masters walking the processional way
    const FZ = this.FZ;
    const paths = [[V(TX + 4, PY, FZ + 90), V(TX + 4, PY, FZ + 20)], [V(TX - 4, PY, FZ + 30), V(TX - 4, PY, FZ + 96)], [V(TX + 22, PY, FZ + 40), V(TX + 8, PY, FZ + 80)], [V(TX + 3, PY, FZ + 60), V(TX + 3, PY, FZ + 96)]];
    paths.forEach(([a, b], i) => {
      const c = new Character(G.scene, 'jedi', { cloneMaterials: true });
      for (const m of c.materials) {
        if (m.name === 'JediRobe') m.color.set(ROBES[i][0]);
        if (m.name === 'JediSkin') m.color.set(ROBES[i][1]);
      }
      c.play('Walk', 0);
      c.mixer.setTime(i * 0.4);
      this.masters.push({ c, a, b, k: Math.random() * 0.3 });
    });
    this.enter(0);
  }

  enter(i) {
    this.beatIdx = i;
    this.bt = 0;
    this.quiet = 0;
    const b = this.beats[i];
    const cam = this.G.camera, fov = (b && b.fov) || 55;
    if (cam.fov !== fov) { cam.fov = fov; cam.updateProjectionMatrix(); if (this.G.onFovChange) this.G.onFovChange(); }
    if (b && b.enter) b.enter();
  }

  update(dt) {
    if (this.done) return;
    const G = this.G;
    const b = this.beats[this.beatIdx];
    this.bt += dt;
    b.update(this.bt, clamp(this.bt / b.dur, 0, 1), dt);
    for (const c of this.crew) c.update(dt);
    for (const m of this.masters) {
      m.k = Math.min(1, m.k + dt / (m.a.distanceTo(m.b) / 1.3));
      m.c.position.lerpVectors(m.a, m.b, m.k);
      m.c.yaw = Math.atan2(m.b.x - m.a.x, m.b.z - m.a.z);
      if (m.k >= 1) m.c.play('Idle', 0.4);
      m.c.update(dt);
    }
    if (this.beatIdx < 2 && Math.random() < 0.6) {
      for (const sx of [-1.05, 1.05]) G.fx.thruster(this.onShip(sx, 2.3, -10.4, _a), _b.set(0, 0, -1).applyQuaternion(this.laat.quaternion), 1.2);
    }
    const talking = b.line !== undefined && G.voice.busy() && this.bt < b.dur + 6;
    this.quiet = talking ? 0 : this.quiet + dt;
    if (talking) G.hud.subT = Math.max(G.hud.subT, 0.4);
    if (this.bt >= b.dur && (b.line === undefined || (!talking && (this.quiet >= 0.15 || !G.voice.enabled)))) {
      if (this.beatIdx + 1 < this.beats.length) this.enter(this.beatIdx + 1);
      else this.finish();
    }
  }

  finish() {
    if (this.done) return;
    this.done = true;
    const G = this.G;
    G.voice.stop();
    G.hud.subtitle(null);
    G.hud.titleCard(null);
    G.hud.letterbox(false);
    clearLooks(this.crew);
    // everyone steps off; the gunship and the extras leave the scene
    for (const c of [G.chars.cody, G.chars.fox, G.chars.gree]) { G.scene.attach(c.group); c.group.rotation.set(0, 0, 0); c.group.visible = false; }
    G.scene.remove(this.laat);
    G.scene.remove(this.yoda.group);
    for (const m of this.masters) G.scene.remove(m.c.group);
    if (this.onDone) this.onDone();
  }
}

Object.assign(ArrivalCutscene.prototype, ShotMixin);

/** Act II hero line-up: who leads, and who fights beside them (never Yoda as the AI partner). */
export const ACT2_ALLY = { cody: 'fox', fox: 'cody', gree: 'cody', yoda: 'gree' };
export const ACT2_SQUAD = { cody: 'trooper_212', fox: 'trooper_guard', gree: 'clone_trooper', yoda: 'clone_trooper' };

// ---------------------------------------------------------------------------
// The end of Act II: the Temple is clear. A transmission from Tatooine: the Anchorhead garrison reports Jawas and
// Tusken Raiders raiding together, led by a caped man with a red lightsaber. Yoda knows the touch: Count Dooku,
// bending the desert peoples' minds to build an army in Hutt space. Everyone boards the gunship, and it climbs from
// the processional plaza to the assault ship waiting over the city: next stop, Tatooine.
// ---------------------------------------------------------------------------
const YOUNGLING_SPOTS = [[-5.4, 19.6], [6.8, 20.4], [-4.4, 23.2], [1.2, 24.0], [-1.6, 24.4], [5.2, 23.6]];
const HOLO_COLOR = new THREE.Color(0.13, 0.34, 0.78);

function scanlineTexture() {
  const c = document.createElement('canvas');
  c.width = 4; c.height = 64;
  const g = c.getContext('2d');
  for (let y = 0; y < 64; y++) { const v = y % 4 < 2 ? 255 : 120; g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(0, y, 4, 1); }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1, 6);
  return t;
}

export class TempleEnding extends Beats {
  constructor(G, onDone) {
    super(G);
    this.onDone = onDone;
    this.extras = [];
    this.T = G.city.temple;
    const hero = G.selected, ally = G.ally ? G.ally.key : null;
    this.hero = hero;
    this.allyKey = ally;
    this.cloneA = hero !== 'yoda' ? hero : 'gree';
    this.cloneB = ally && ally !== 'yoda' && ally !== this.cloneA ? ally : this.cloneA;
    const hz1 = this.T.hz1;
    // where everyone stands for the transmission, in front of the archives' dais: Yoda at the front, the clones behind
    this.spotYoda = V(TX, PY, hz1 + 20.3);
    this.spotHolo = V(TX, PY, hz1 + 17.6);
    this.spots = { hero: V(TX + 2.4, PY, hz1 + 21), ally: V(TX - 2.4, PY, hz1 + 21.4), gree: V(TX + 4.6, PY, hz1 + 22.2) };
    this.beats = this.buildBeats();
  }

  onShip(x, y, z, out = new THREE.Vector3()) { this.laat.updateMatrixWorld(); return this.laat.localToWorld(out.set(x, y, z)); }

  /** Which of the stand-ins plays a speaker: 'yoda', the hero, the partner, or Gree. */
  slotOf(key) { return key === 'yoda' ? 'yoda' : key === this.hero ? 'hero' : key === this.allyKey ? 'ally' : 'gree'; }

  /** A line starts: the speaker talks, everyone else (the younglings too) turns to look; for the captain, at the hologram. */
  onLine(who) {
    const all = [...Object.values(this.chars), ...this.G.squad.younglings.map((y) => y.char)];
    const c = who === 'hask' ? null : this.chars[this.slotOf(who)];
    for (const ch of Object.values(this.chars)) if (ch !== c && ch.currentName === 'Talk') ch.play('Idle', 0.4);
    if (who === 'hask') { for (const ch of all) ch.lookTarget = this.holo; return; }
    if (c) { c.play('Talk', 0.3); this.listen(c, all, who === 'yoda' ? null : this.chars.yoda); }
  }

  buildBeats() {
    const G = this.G, hz1 = this.T.hz1, FZ = this.T.FZ;
    const yo = () => this.yoda.position, ho = () => this.holo.position;
    const face = (who, k) => {
      const c = this.chars[who];
      if (!c) return;
      if (who === 'yoda') this.face(c, k, { dist: 1.9, ang: 0.42, dy: 0.06 }, { dist: 1.7, ang: 0.38, dy: 0.05 });
      else this.face(c, k, { dist: 2.3, ang: 0.42, dy: 0.02 }, { dist: 2.05, ang: 0.38, dy: 0.0 });
    };
    const beats = [];
    beats.push({
      dur: 3.4, fov: 46, line: ['yoda', 'Cleared, the Temple is. Well fought, all of you. Hmm.'],
      enter: () => { G.hud.fade(false, 900); this.yoda.play('Talk', 0.3); },
      update: (t, k) => this.shot(V(TX + 6.5, PY + 3.4, hz1 + 30), V(TX + 5, PY + 2.6, hz1 + 27), V(TX, PY + 1.3, hz1 + 18.5), V(TX + 0.4, PY + 1.1, hz1 + 19.5), k),
    });
    beats.push({
      dur: 2.8, fov: 40, line: [this.cloneA, 'General, a priority transmission. From Tatooine, in the Outer Rim.'],
      enter: () => {
        this.yoda.play('Idle', 0.4);
        G.sound.tone([1320, 990, 1320], 0.09, 'square', 0.1, 0.12);
        this.projector.visible = true;
      },
      update: (t, k) => face(this.slotOf(this.cloneA), k),
    });
    beats.push({
      dur: 3.4, fov: 34, line: ['hask', "Master Yoda, Captain Hask, Anchorhead garrison. The Jawas and the Tusken Raiders are raiding the moisture farms. Together. They've never done that."],
      enter: () => { this.holoOn = true; G.sound.radio(true); },
      update: (t, k) => {
        const e = _c.copy(this.spotHolo).setY(PY + 0.12 + 1.57), s0 = Math.sin(0.5), c0 = Math.cos(0.5), s1 = Math.sin(0.42), c1 = Math.cos(0.42);
        this.shot(V(e.x + s0 * 3.0, e.y - 0.25, e.z + c0 * 3.0), V(e.x + s1 * 2.6, e.y - 0.22, e.z + c1 * 2.6), _a.copy(e).setY(e.y - 0.2), _b.copy(e).setY(e.y - 0.16), k);
      },
    });
    beats.push({
      dur: 3.4, fov: 34, line: ['hask', "There's a man leading them. Tall, in a cape, with a red lightsaber. When he raises his hand, the Sand People kneel. We can't hold..."],
      enter: () => { this.glitch = 1.2; },
      update: (t, k) => {
        // over Yoda's shoulder
        this.shot(V(TX - 0.75, PY + 0.72, this.spotHolo.z + 4.7), V(TX - 0.7, PY + 0.7, this.spotHolo.z + 4.4), _c.copy(this.spotHolo).setY(PY + 1.0), _b.copy(this.spotHolo).setY(PY + 1.04), k);
        if (k > 0.86 && this.holoOn) { this.holoOn = false; this.glitch = 2; G.sound.radio(false); }
      },
    });
    beats.push({
      dur: 2.4, fov: 34, line: [this.cloneB, 'A red blade. Count Dooku.'],
      enter: () => { this.holo.group.visible = false; this.projector.visible = false; },
      update: (t, k) => face(this.slotOf(this.cloneB), k),
    });
    beats.push({
      dur: 3.2, fov: 32, line: ['yoda', 'Yes. Bent their minds to his will, he has. A Jedi mind trick, turned to darkness. Feel it from here, I can.'],
      enter: () => this.yoda.play('Talk', 0.3),
      update: (t, k) => face('yoda', k),
    });
    beats.push({
      dur: 2.4, fov: 36, line: [this.cloneA, "Why Tatooine? It's nothing but sand and smugglers."],
      enter: () => this.yoda.play('Idle', 0.4),
      update: (t, k) => face(this.slotOf(this.cloneA), k),
    });
    beats.push({
      dur: 3.4, fov: 32, line: ['yoda', 'Hutt space, Tatooine borders. Hold the desert peoples, and the trade routes of the Outer Rim, he holds. An army that costs him nothing.'],
      enter: () => this.yoda.play('Talk', 0.3),
      update: (t, k) => face('yoda', k),
    });
    beats.push({
      dur: 3.0, fov: 44, line: ['yoda', 'To Tatooine we go. Free them, we must, before his grip tightens. To the gunship!'],
      update: (t, k) => {
        const p = yo();
        this.shot(V(p.x + 1.6, PY + 1.0, p.z - 3.6), V(p.x + 2.6, PY + 1.7, p.z - 5.6), V(p.x, PY + 0.6, p.z), V(p.x, PY + 1.0, p.z + 1.5), k);
      },
      exit: () => G.hud.fade(true, 600),
    });
    // outside: the gunship lifts off the processional plaza and climbs to the assault ship over the city
    beats.push({
      dur: 7.2, fov: 50,
      enter: () => {
        this.boardGunship();
        G.hud.fade(false, 900);
        G.sound.flyby(this.HOVER, 1.1);
      },
      update: (t, k, dt) => {
        const e = smooth(Math.min(1, k * 1.15));
        const up = smooth(Math.min(1, k * 2.5));
        _a.copy(this.HOVER).setY(this.HOVER.y + 18 * up);
        this.laat.position.lerpVectors(_a, this.SHIP_DOOR, e * e);
        _b.subVectors(this.SHIP_DOOR, this.HOVER);
        this.laat.rotation.set(-0.5 * e * (1 - e) * 4, Math.atan2(_b.x, _b.z) * Math.min(1, k * 2), Math.sin(k * Math.PI) * -0.3);
        if (k < 0.36) this.shot(V(TX + 6, PY + 2.2, FZ + 64), V(TX - 1, PY + 3, FZ + 72), _c.copy(this.laat.position).setY(this.laat.position.y + 2), _a.copy(this.laat.position), Math.min(1, k * 3.2));
        else {
          // chasing the gunship up toward the assault ship's belly, the city falling away below
          _b.subVectors(this.SHIP_DOOR, this.HOVER).normalize();
          _c.set(_b.z, 0, -_b.x).normalize();
          G.camera.position.copy(this.laat.position).addScaledVector(_b, -30).addScaledVector(_c, 8).y -= 4;
          this.look.copy(this.laat.position).lerp(this.SHIP_DOOR, 0.3);
          G.camera.lookAt(this.look);
        }
        if (Math.random() < 0.7) for (const sx of [-1.05, 1.05]) G.fx.thruster(this.onShip(sx, 2.3, -10.4, _a), _b.set(0, 0, -1).applyQuaternion(this.laat.getWorldQuaternion(_q)), 1.4);
        if (k > 0.25 && !this.carded) { this.carded = true; G.hud.titleCard(['ACT II COMPLETE', 'NEXT · ACT III: TATOOINE', 'Count Dooku has an army of desert peoples. Yoda means to free them.'], 0, 4.4, true); }
        if (k > 0.04 && k < 0.2 && Math.random() < 0.5) G.fx.dust(_a.copy(this.HOVER).add(_b.set((Math.random() - 0.5) * 10, 0, (Math.random() - 0.5) * 12)), 3, 1.8);
      },
    });
    return beats;
  }

  /** A life-size hologram of the garrison captain (a clone officer) over a floor projector, flickering. */
  makeHologram() {
    const G = this.G;
    const holoMat = new THREE.MeshBasicMaterial({ color: HOLO_COLOR, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, map: scanlineTexture() });
    this.holoMat = holoMat;
    const h = new Character(G.scene, 'clone_trooper');
    h.group.traverse((o) => { if (o.isMesh) { o.material = holoMat; o.castShadow = false; o.receiveShadow = false; } });
    h.position.copy(this.spotHolo).setY(PY + 0.12);
    h.yaw = 0;
    h.group.scale.setScalar(0.92);
    h.play('Idle', 0);
    h.group.visible = false;
    this.holo = h;
    const proj = new THREE.Group();
    proj.position.copy(this.spotHolo);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.5, 0.12, 20), new THREE.MeshStandardMaterial({ color: 0x3a3f46, roughness: 0.4, metalness: 0.7 }));
    base.position.y = 0.06;
    const disc = new THREE.Mesh(new THREE.CircleGeometry(0.34, 20), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.5, 1.2, 2.6) }));
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = 0.125;
    const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.3, 1.9, 24, 1, true), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.2, 0.5, 1.1), transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    cone.position.y = 1.07;
    proj.add(base, disc, cone);
    proj.visible = false;
    G.scene.add(proj);
    this.projector = proj;
    this.holoCone = cone;
  }

  /** Cut to the plaza: everyone aboard the gunship (the 41st too), and the assault ship waiting in the sky. */
  boardGunship() {
    const G = this.G, FZ = this.T.FZ;
    G.setArena('temple');
    this.HOVER = V(TX - 15, PY + 0.25, FZ + 44);
    this.ship = buildAssaultShip();
    this.ship.position.set(TX + 260, PY + 520, FZ + 260);
    this.ship.rotation.y = -2.3;
    this.ship.scale.setScalar(1.3);
    G.scene.add(this.ship);
    this.ship.updateMatrixWorld();
    this.SHIP_DOOR = this.ship.localToWorld(new THREE.Vector3(0, -12, 10));
    this.laat = buildLAAT({ bay: true });
    this.laat.position.copy(this.HOVER);
    this.laat.rotation.set(0, Math.PI, 0);
    G.scene.add(this.laat);
    for (const c of Object.values(this.chars)) c.group.visible = false;
    this.holo.group.visible = false;
    this.projector.visible = false;
    for (const y of G.squad.younglings) y.char.group.visible = false;
    // the crew, seated along the bay
    const seats = [[-0.95, 1.4], [-0.9, 0.25], [-0.85, -1.0], [-0.75, -2.2], [0.9, 1.1], [0.6, -0.2], [1.0, -1.6]];
    const crew = [this.yodaPassenger = new Character(G.scene, 'yoda')];
    for (const k of new Set([this.hero, this.allyKey, 'gree'])) if (k && k !== 'yoda') crew.push(G.chars[k]);
    this.extraTroopers = [];
    while (crew.length < 6) { const t = new Character(G.scene, 'clone_trooper'); this.extraTroopers.push(t); crew.push(t); }
    this.passengers = crew;
    crew.forEach((c, i) => {
      const [x, z] = seats[i];
      this.laat.add(c.group);
      c.position.set(x, 0.545, z);
      c.yaw = x < 0 ? -Math.PI / 2 : Math.PI / 2;
      c.pitch = c.twist = 0;
      c.group.rotation.set(0, c.yaw, 0);
      c.group.visible = true;
      c.play('Idle', 0);
    });
  }

  start() {
    const G = this.G, p = G.player;
    G.hud.letterbox(true);
    G.hud.fade(true, 1);
    this.chars = {};
    // the hero and the partner, stood facing the projector; Gree with them; Yoda by the dais
    const place = (c, at) => {
      G.scene.attach(c.group);
      c.group.rotation.set(0, 0, 0);
      c.position.copy(at);
      c.yaw = Math.atan2(this.spotHolo.x - at.x, this.spotHolo.z - at.z);
      c.pitch = c.twist = 0;
      c.group.visible = true;
      c.play('Idle', 0.1);
      return c;
    };
    if (this.hero === 'yoda') this.yoda = this.chars.yoda = place(G.chars.yoda, this.spotYoda);
    else {
      this.chars.hero = place(p.char, this.spots.hero);
      this.yoda = this.chars.yoda = this.ownYoda = place(new Character(G.scene, 'yoda'), this.spotYoda);
    }
    if (G.ally) this.chars.ally = place(G.ally.char, this.hero === 'yoda' ? this.spots.hero : this.spots.ally);
    if (this.hero !== 'gree' && this.allyKey !== 'gree') this.chars.gree = place(G.chars.gree, this.spots.gree);
    // the fighting is over: the younglings have put their sabers away (lit blades flood the close-ups)
    const sheathe = (on) => { for (const y of G.squad.younglings) for (const m of y.char.materials) if (m.name === 'SaberBlue') m.visible = !on; };
    this.sheathe = sheathe;
    sheathe(true);
    G.squad.younglings.forEach((y, i) => {
      y.char.group.visible = true;
      const at = YOUNGLING_SPOTS[i % YOUNGLING_SPOTS.length];
      y.pos.set(TX + at[0], PY, this.T.hz1 + at[1]);
      y.char.yaw = Math.atan2(this.spotHolo.x - y.pos.x, this.spotHolo.z - y.pos.z);
      y.char.play('Idle', 0.2);
    });
    this.makeHologram();
    this.enter(0);
  }

  update(dt) {
    if (this.done) return;
    const G = this.G;
    this.step(dt);
    if (this.done) return;
    for (const c of Object.values(this.chars)) if (c.group.visible) c.update(dt);
    for (const y of G.squad.younglings) if (y.char.group.visible) y.char.update(dt);
    if (this.passengers) for (const c of this.passengers) c.update(dt);
    // the hologram: rising in, flickering, glitching as the signal drops
    const h = this.holo;
    if (this.holoOn) {
      h.group.visible = true;
      this.holoK = Math.min(1, (this.holoK || 0) + dt * 2.5);
    } else if (this.holoK > 0) this.holoK = Math.max(0, this.holoK - dt * 3);
    if (h.group.visible) {
      this.glitch = Math.max(0, (this.glitch || 0) - dt);
      const g = this.glitch > 0 && Math.random() < 0.4;
      this.holoMat.opacity = (0.42 + Math.random() * 0.14) * this.holoK * (g ? 0.4 : 1);
      this.holoMat.map.offset.y -= dt * 0.6;
      h.group.scale.set(0.92, 0.92 * this.holoK, 0.92);
      h.position.x = this.spotHolo.x + (g ? (Math.random() - 0.5) * 0.15 : 0);
      this.holoCone.material.opacity = 0.06 * this.holoK;
      h.update(dt);
      if (this.holoK <= 0 && !this.holoOn) h.group.visible = false;
      G.fx.holdLight(2, _a.copy(this.spotHolo).setY(PY + 1.2), 0x5ab0ff, 1.6 * this.holoK, 6, 5);
    }
  }

  finish() {
    if (this.done) return;
    this.done = true;
    const G = this.G;
    G.voice.stop();
    G.hud.subtitle(null);
    G.hud.letterbox(false);
    G.hud.fade(false, 300);
    clearLooks([...Object.values(this.chars || {}), ...G.squad.younglings.map((y) => y.char), ...(this.passengers || [])]);
    if (this.passengers) for (const c of this.passengers) { if (c.group.parent === this.laat) G.scene.attach(c.group); c.group.visible = false; }
    for (const t of this.extraTroopers || []) G.scene.remove(t.group);
    for (const k of HEROES_ALL) if (G.chars[k]) { G.scene.attach(G.chars[k].group); G.chars[k].group.rotation.set(0, 0, 0); G.chars[k].group.visible = false; }
    if (this.laat) G.scene.remove(this.laat);
    if (this.ship) G.scene.remove(this.ship);
    if (this.ownYoda) G.scene.remove(this.ownYoda.group);
    if (this.yodaPassenger) G.scene.remove(this.yodaPassenger.group);
    if (this.holo) G.scene.remove(this.holo.group);
    if (this.projector) G.scene.remove(this.projector);
    for (const y of G.squad.younglings) y.char.group.visible = false;
    if (this.sheathe) this.sheathe(false);
    if (this.onDone) this.onDone();
  }
}
const HEROES_ALL = ['cody', 'fox', 'gree', 'yoda'];
