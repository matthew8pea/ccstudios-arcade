import * as THREE from 'three';
import { lerp, clamp, smooth, easeInOut, easeOut, dampAngle, yawTo } from './util.js';
import { ShotMixin, clearLooks } from './beats.js';

export const CODY_SPOT = new THREE.Vector3(0, 0, 44.5);
export const FOX_SPOT = new THREE.Vector3(0, 0, 41);
// where they stand to talk: closer together than their battle positions, slightly offset so the shots have depth
const CODY_TALK = new THREE.Vector3(0.25, 0, 43.4);
const FOX_TALK = new THREE.Vector3(-0.15, 0, 41.5);
const CODY_TO_FOX = Math.atan2(FOX_TALK.x - CODY_TALK.x, FOX_TALK.z - CODY_TALK.z);
const FOX_TO_CODY = Math.atan2(CODY_TALK.x - FOX_TALK.x, CODY_TALK.z - FOX_TALK.z);
const DROID_START = new THREE.Vector3(1.3, -32, 54.2);
const DROID_HOVER = new THREE.Vector3(1.3, 2.9, 52.9);

const LINES = [
  { who: 'fox', text: 'Three sectors lost since dawn, Cody. The Separatists have droids in every turbolift and skylane between here and the Senate.' },
  { who: 'cody', text: 'The 212th got here as fast as we could. How bad is it, Fox?' },
  { who: 'fox', text: "Worse than the reports. It's not just clankers. Some of our own brothers have turned. Rebel clones, fighting right beside them." },
  { who: 'cody', text: 'Then we hold this tower and take the city back one level at a time. Where are they hitting us from?' },
  { who: 'fox', text: 'Everywhere. The bridges, the lifts, the skylanes, the...' },
  { who: 'fox', text: 'CODY, GET DOWN!' },
  { who: 'cody', text: 'Rocket trooper. Never even heard it coming. Thanks, Fox.' },
  { who: 'fox', text: "Don't thank me yet. Here comes the rest of them." },
];
const lineDur = (i) => clamp(0.064 * LINES[i].text.length + 1.1, 1.5, 8.5);

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();

export class Cutscene {
  constructor(G, onDone) {
    this.G = G;
    this.onDone = onDone;
    this.beatIdx = -1;
    this.bt = 0;
    this.done = false;
    this.droid = null;
    this.look = new THREE.Vector3();
    this.curve = new THREE.CatmullRomCurve3([
      V(-560, 380, 700), V(-310, 230, 430), V(-130, 85, 205), V(-40, 20, 96), V(-11, 4.2, 58), V(-6.2, 2.1, 47.5),
    ], false, 'centripetal');
    this.beats = this.buildBeats();
  }

  line(i) {
    const L = LINES[i];
    this.G.hud.subtitle(L.who === 'cody' ? 'CODY' : 'FOX', L.text, lineDur(i));
    this.G.speak(L.text, L.who);
  }

  shot(pa, pb, la, lb, k, ease = true) {
    const e = ease ? easeInOut(k) : k;
    const cam = this.G.camera;
    cam.position.lerpVectors(pa, pb, e);
    this.look.lerpVectors(la, lb, e);
    cam.lookAt(this.look);
  }

  aimFoxAt(target, dt, rate = 10) {
    const fox = this.G.chars.fox;
    const dx = target.x - fox.position.x, dz = target.z - fox.position.z;
    fox.yaw = dampAngle(fox.yaw, yawTo(dx, dz), rate, dt);
    const pitch = Math.atan2(target.y - (fox.position.y + 1.4), Math.hypot(dx, dz));
    fox.pitch = lerp(fox.pitch, pitch, 1 - Math.exp(-rate * dt));
  }

  buildBeats() {
    const G = this.G;
    const { cody, fox } = G.chars;
    const beats = [];
    // 0 — establishing flight down the canyon of towers to the rooftop, settling beside the two commanders
    beats.push({
      dur: 10.5,
      enter: () => {
        G.hud.titleCard(['CORUSCANT', 'GALACTIC CITY · UPPER LEVELS', "The Separatists have broken through the capital's defenses."], 1.0, 6.6);
        this.whoosh = false;
      },
      update: (t, k, dt) => {
        const e = easeInOut(k);
        this.curve.getPoint(e, G.camera.position);
        this.look.lerpVectors(V(0, 6, 0), V(0.05, 1.45, 42.45), smooth(Math.pow(k, 0.8)));
        G.camera.lookAt(this.look);
        if (t > 7.6 && !this.whoosh) { this.whoosh = true; G.sound.whoosh(G.camera.position); }
      },
    });
    // 1 — two-shot, from the side (Fox on the left, Cody on the right: every shot below keeps that)
    beats.push({
      dur: lineDur(0), line: 0, enter: () => { this.line(0); this.listen(fox, [cody], cody); },
      fov: 34,
      update: (t, k) => this.two(fox, cody, k, { dist: 3.2, along: 1.5, dy: -0.15, drop: 0.2, flip: true }, { dist: 2.8, along: 1.35, dy: -0.12, drop: 0.2, flip: true }),
    });
    // 2 — over Fox's shoulder (Cody speaks)
    beats.push({
      dur: lineDur(1), line: 1, enter: () => { this.line(1); this.listen(cody, [fox], fox); },
      fov: 28,
      update: (t, k) => this.ots(fox, cody, k, { back: 0.75, side: 0.42, dy: 0.06, shift: 0.16 }, { back: 0.62, side: 0.38, dy: 0.05, shift: 0.16 }),
    });
    // 3 — over Cody's shoulder (Fox speaks)
    beats.push({
      dur: lineDur(2), line: 2, enter: () => { this.line(2); this.listen(fox, [cody], cody); },
      fov: 28,
      update: (t, k) => this.ots(cody, fox, k, { back: 0.75, side: -0.42, dy: 0.06, shift: -0.16 }, { back: 0.62, side: -0.38, dy: 0.05, shift: -0.16 }),
    });
    // 4 — Cody, close
    beats.push({
      dur: lineDur(3), line: 3, enter: () => { this.line(3); this.listen(cody, [fox], fox); },
      fov: 26,
      update: (t, k) => this.face(cody, k, { dist: 2.1, ang: 0.42, dy: 0.02 }, { dist: 1.85, ang: 0.38, dy: 0.01 }),
    });
    // 5 — Fox talks while a rocket droid rises over the parapet behind Cody
    beats.push({
      dur: Math.max(lineDur(4), 3.8), line: 4,
      fov: 38,
      enter: () => {
        this.line(4);
        this.listen(fox, [cody], cody);
        this.droid = G.enemies.spawn('b2_rocket', 'scripted', { at: DROID_START.clone() });
        this.droid.hp = 60;
        this.droid.yaw = Math.PI;
        this.droid.char.play('Fly', 0);
      },
      update: (t, k, dt) => {
        this.ots(fox, cody, k, { back: 0.95, side: 0.36, dy: 0.0, drop: -0.08, shift: 0.12 }, { back: 0.8, side: 0.34, dy: -0.02, drop: -0.2, shift: 0.14 });
        const r = easeOut(clamp((t - 0.4) / 2.8, 0, 1));
        if (this.droid) {
          this.droid.pos.lerpVectors(DROID_START, DROID_HOVER, r);
          this.droid.char.pitch = lerp(0, -0.33, r);
        }
      },
    });
    // 6 — "Cody, get down!" Fox quick-draws (low, looking up at him)
    beats.push({
      dur: 1.55, line: 5,
      fov: 38,
      enter: () => { this.line(5); fox.play('Idle', 0.22); fox.lookTarget = null; cody.lookTarget = null; },
      update: (t, k, dt) => {
        this.face(fox, k, { dist: 1.75, ang: -0.55, dy: -0.32, drop: 0.02 }, { dist: 1.6, ang: -0.5, dy: -0.3, drop: 0.0 });
        if (this.droid) this.aimFoxAt(_a.copy(this.droid.pos).setY(this.droid.pos.y + 1.3), dt, 14);
      },
    });
    // 7 — the shot: over Fox's right shoulder as he fires past Cody, who drops into a crouch
    beats.push({
      dur: 3.6,
      fov: 46,
      enter: () => {
        cody.play('Crouch', 0.14);
        this.shots = 0;
        this.nextShot = 0.08;
        this.aimAt = (this.droid ? this.droid.pos : DROID_HOVER).clone().setY(DROID_HOVER.y + 1.1);
      },
      update: (t, k, dt) => {
        fox.eye(_b);
        this.shot(V(_b.x + 0.62, _b.y + 0.12, _b.z - 1.35), V(_b.x + 0.52, _b.y + 0.06, _b.z - 1.1), this.aimAt, _a.copy(this.aimAt).setY(this.aimAt.y - 0.6), k);
        const d = this.droid;
        if (d && d.alive) {
          this.aimFoxAt(_a.copy(d.pos).setY(d.pos.y + 1.3), dt, 14);
          if (t >= this.nextShot && this.shots < 12) {
            this.nextShot = t + 0.115;
            const m = this.shots % 2 ? 'muzzle_L' : 'muzzle_R';
            const from = fox.boneWorld(m, new THREE.Vector3());
            const target = _b.copy(d.pos).setY(d.pos.y + 1.25 + (this.shots === 0 ? 0.9 : 0));
            const dir = new THREE.Vector3().subVectors(target, from).normalize();
            G.combat.fireBolt({ from, dir, speed: 120, dmg: 18, team: 'friendly', owner: 'cutscene', color: 0x3aa0ff, len: 2.0, width: 0.13 });
            G.fx.muzzle(from, dir, 0x3aa0ff, { light: 7, prio: 2 });
            G.sound.shot('pistol', from);
            this.shots++;
          }
        }
      },
    });
    // 8 — Cody gets up, glances back at the wreck, then thanks Fox
    beats.push({
      dur: Math.max(lineDur(6), 3.4), line: 6,
      fov: 28,
      enter: () => { this.line(6); cody.play('Talk', 0.45); this.lowered = false; cody.lookTarget = null; },
      update: (t, k, dt) => {
        this.ots(fox, cody, k, { back: 0.7, side: 0.5, dy: 0.06, shift: 0.18 }, { back: 0.6, side: 0.46, dy: 0.05, shift: 0.18 });
        const look = t > 0.35 && t < 2.1 ? CODY_TO_FOX + Math.PI + 0.35 : CODY_TO_FOX;
        cody.yaw = dampAngle(cody.yaw, look, 4.5, dt);
        if (t > 2.1) cody.lookTarget = fox;
        if (t > 0.9 && !this.lowered) { this.lowered = true; fox.play('Talk', 0.6); fox.lookTarget = cody; }
        fox.yaw = dampAngle(fox.yaw, FOX_TO_CODY, 4, dt);
        fox.pitch = lerp(fox.pitch, 0, 1 - Math.exp(-5 * dt));
      },
    });
    // 9 — "Here comes the rest of them": Fox turns to the skyline
    beats.push({
      dur: lineDur(7) + 0.3, line: 7,
      fov: 30,
      enter: () => { this.line(7); this.raised = false; this.listen(fox, [cody], cody); },
      update: (t, k, dt) => {
        this.ots(cody, fox, k, { back: 0.75, side: -0.5, dy: 0.06, shift: -0.2 }, { back: 0.85, side: -0.55, dy: 0.08, shift: -0.25 });
        cody.yaw = dampAngle(cody.yaw, CODY_TO_FOX, 5, dt);
        if (t > 0.5 && !this.raised) { this.raised = true; fox.play('Idle', 0.3); }
        if (t > 1.0) { fox.yaw = dampAngle(fox.yaw, Math.PI, 3.5, dt); fox.lookTarget = null; }
      },
    });
    // 10 — crane up as they turn to face the roof, waves begin
    beats.push({
      dur: 4.6,
      enter: () => {
        cody.play('Idle', 0.4);
        cody.lookTarget = null;
        G.hud.titleCard(['DEFEND THE CITY', '', ''], 0.4, 3.6, true);
        G.beginWaves(0.6);
      },
      update: (t, k, dt) => {
        this.shot(V(0.9, 2.2, 47.6), V(5.5, 15, 61), V(0, 1.7, 40), V(0, 2, -8), k);
        cody.yaw = dampAngle(cody.yaw, Math.PI, 5, dt);
        fox.yaw = dampAngle(fox.yaw, Math.PI, 5, dt);
        fox.pitch = lerp(fox.pitch, 0, 1 - Math.exp(-4 * dt));
        // drift back toward their battle positions
        const m = 1 - Math.exp(-1.2 * dt);
        cody.position.lerp(CODY_SPOT, m);
        fox.position.lerp(FOX_SPOT, m);
      },
    });
    return beats;
  }

  start() {
    const G = this.G;
    const { cody, fox } = G.chars;
    cody.position.copy(CODY_TALK); cody.yaw = CODY_TO_FOX; cody.play('Talk', 0);
    fox.position.copy(FOX_TALK); fox.yaw = FOX_TO_CODY; fox.play('Talk', 0);
    cody.pitch = cody.twist = fox.pitch = fox.twist = 0;
    G.hud.letterbox(true);
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
    G.chars.cody.update(dt);
    G.chars.fox.update(dt);
    // Dialogue beats wait for the voice to finish its line (text-to-speech is often slower than
    // the estimate), so the next line never cancels the one still being spoken.
    const talking = b.line !== undefined && G.voice.busy() && this.bt < b.dur + 12;
    this.quiet = talking ? 0 : this.quiet + dt;
    if (talking) G.hud.subT = Math.max(G.hud.subT, 0.4);
    if (this.bt >= b.dur && !talking && (b.line === undefined || this.quiet >= 0.15 || !G.voice.enabled)) {
      if (this.beatIdx + 1 < this.beats.length) this.enter(this.beatIdx + 1);
      else this.finish();
    }
  }

  finish() {
    if (this.done) return;
    this.done = true;
    const G = this.G;
    const { cody, fox } = G.chars;
    if (this.droid && this.droid.alive) {
      this.droid.removed = true;
      this.droid.alive = false;
      this.droid.char.group.visible = false;
    }
    G.voice.stop();
    G.hud.subtitle(null);
    G.hud.titleCard(null);
    G.hud.letterbox(false);
    clearLooks([cody, fox]);
    cody.position.copy(CODY_SPOT); cody.yaw = Math.PI; cody.pitch = 0;
    fox.position.copy(FOX_SPOT); fox.yaw = Math.PI; fox.pitch = 0;
    cody.play('Idle', 0.2);
    fox.play('Idle', 0.2);
    if (this.onDone) this.onDone();
  }
}
Object.assign(Cutscene.prototype, ShotMixin);
