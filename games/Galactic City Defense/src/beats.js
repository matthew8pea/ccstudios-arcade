import * as THREE from 'three';
import { clamp, easeInOut } from './util.js';
import { DOOKU_VOICE } from './dooku.js';
import { Character } from './character.js';

// Shared cutscene plumbing: a list of beats, each with a duration, an optional spoken line (the beat waits for
// the voice to finish), enter() and update(t, k, dt). Used by the Act II ending and the Act III cutscenes.

export const NAMES = { cody: 'CODY', fox: 'FOX', yoda: 'YODA', gree: 'GREE', dooku: 'DOOKU', jawa: 'JAWA', hask: 'CAPT. HASK · ANCHORHEAD', youngling: 'YOUNGLING', clonecmd: 'CLONE COMMAND · CORUSCANT', sergeant: 'CLONE SERGEANT' };
export const VOICE_EXTRA = { dooku: DOOKU_VOICE, jawa: { pitch: 2, rate: 1.7 }, hask: { pitch: 0.82, rate: 1.06 }, youngling: { pitch: 1.75, rate: 1.1 }, clonecmd: { pitch: 0.78, rate: 0.98 }, sergeant: { pitch: 0.8, rate: 1.1 } };
export const lineDur = (text) => clamp(0.07 * text.length + 1.2, 1.6, 9);

export class Beats {
  constructor(G) {
    this.G = G;
    this.look = new THREE.Vector3();
    this.done = false;
    this.beats = [];
  }

  say(who, text) {
    const G = this.G;
    G.hud.subtitle(NAMES[who] || who.toUpperCase(), text, lineDur(text));
    if (VOICE_EXTRA[who]) { if (G.settings.voice) G.voice.say(text, VOICE_EXTRA[who]); } else G.speak(text, who);
  }

  shot(pa, pb, la, lb, k) {
    const e = easeInOut(k), cam = this.G.camera;
    cam.position.lerpVectors(pa, pb, e);
    this.look.lerpVectors(la, lb, e);
    cam.lookAt(this.look);
  }

  enter(i) {
    this.beatIdx = i;
    this.bt = 0;
    this.quiet = 0;
    const b = this.beats[i];
    const cam = this.G.camera, fov = (b && b.fov) || 55;
    if (cam.fov !== fov) { cam.fov = fov; cam.updateProjectionMatrix(); if (this.G.onFovChange) this.G.onFovChange(); }
    if (b && b.line) { this.say(b.line[0], b.line[1]); if (this.onLine) this.onLine(b.line[0]); }
    if (b && b.enter) b.enter();
  }

  step(dt) {
    if (this.done) return;
    const G = this.G, b = this.beats[this.beatIdx];
    this.bt += dt;
    const dur = b.line ? Math.max(b.dur || 0, lineDur(b.line[1])) : b.dur;
    b.update(this.bt, clamp(this.bt / dur, 0, 1), dt);
    const talking = !!b.line && G.voice.busy() && this.bt < dur + 6;
    this.quiet = talking ? 0 : this.quiet + dt;
    if (talking) G.hud.subT = Math.max(G.hud.subT, 0.4);
    if (this.bt >= dur && (!b.line || !talking && (this.quiet >= 0.15 || !G.voice.enabled))) {
      if (b.exit) b.exit();
      if (this.done) return;
      if (this.beatIdx + 1 < this.beats.length) this.enter(this.beatIdx + 1);
      else this.finish();
    }
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Shot helpers: camera set-ups computed from where the characters actually stand and which way they face, so a
// close-up always lands on the face, also for characters riding in a gunship bay. Every helper fills `pos` (the
// camera) and `look` (what it aims at; the cutscene key light follows `look`).
// ---------------------------------------------------------------------------------------------------------------
const _f = new THREE.Vector3();
const _g = new THREE.Vector3();
const _n = new THREE.Vector3();
const _wq = new THREE.Quaternion();
const PA = new THREE.Vector3();
const PB = new THREE.Vector3();
const LA = new THREE.Vector3();
const LB = new THREE.Vector3();

/** Which way a character faces, flat, in world space. */
export function facingOf(ch, out = new THREE.Vector3()) {
  ch.group.getWorldQuaternion(_wq);
  return out.set(0, 0, 1).applyQuaternion(_wq).setY(0).normalize();
}

/**
 * Close-up: `dist` metres out in front of the eyes, swung `ang` radians round the character (+ toward its left),
 * `dy` above eye level, `side` metres across; aimed at the eyes, lowered by `drop` to leave headroom.
 */
export function faceCam(ch, o, pos, look) {
  const { dist = 2, ang = 0.4, dy = 0.04, drop = 0.07, side = 0 } = o;
  ch.eye(look);
  facingOf(ch, _f);
  const c = Math.cos(ang), s = Math.sin(ang);
  _g.set(_f.x * c + _f.z * s, 0, -_f.x * s + _f.z * c);
  pos.copy(look).addScaledVector(_g, dist);
  pos.x += _g.z * side;
  pos.z -= _g.x * side;
  pos.y += dy;
  look.y -= drop;
  return pos;
}

/**
 * Over the shoulder of `fg` (the listener, at the edge of the frame) onto `subj`'s face: `back` metres behind fg's
 * head, `side` across (+ puts fg on the left of the frame), `dy` above it; `shift` slides the aim across.
 */
export function otsCam(fg, subj, o, pos, look) {
  const { back = 0.8, side = 0.5, dy = 0.1, drop = 0.06, shift = 0 } = o;
  fg.eye(pos);
  subj.eye(look);
  _f.subVectors(pos, look).setY(0).normalize();
  _n.set(_f.z, 0, -_f.x);
  pos.addScaledVector(_f, back).addScaledVector(_n, side);
  pos.y += dy;
  look.addScaledVector(_n, shift);
  look.y -= drop;
  return pos;
}

/** Two-shot from the side of a pair: `dist` metres off the line between their eyes, `along` toward b (+) or a (-). */
export function twoCam(a, b, o, pos, look) {
  const { dist = 4, along = 0, dy = 0, drop = 0.15, flip = false } = o;
  a.eye(pos);
  b.eye(look);
  _f.subVectors(look, pos).setY(0).normalize();
  look.add(pos).multiplyScalar(0.5);
  _n.set(_f.z, 0, -_f.x).multiplyScalar(flip ? -1 : 1);
  pos.copy(look).addScaledVector(_n, dist).addScaledVector(_f, along);
  pos.y += dy;
  look.y -= drop;
  return pos;
}

/**
 * Shot methods for any cutscene class with `shot(pa, pb, la, lb, k)`: each takes the set-up at the start of the beat
 * (`a`) and at its end (`b`, default the same), so a beat can push in or drift round slowly.
 */
export const ShotMixin = {
  face(ch, k, a, b = a) { faceCam(ch, a, PA, LA); faceCam(ch, b, PB, LB); this.shot(PA, PB, LA, LB, k); },
  ots(fg, subj, k, a, b = a) { otsCam(fg, subj, a, PA, LA); otsCam(fg, subj, b, PB, LB); this.shot(PA, PB, LA, LB, k); },
  two(ca, cb, k, a, b = a) { twoCam(ca, cb, a, PA, LA); twoCam(ca, cb, b, PB, LB); this.shot(PA, PB, LA, LB, k); },
  /** Everyone in `listeners` turns their head to whoever is speaking; the speaker looks at `at` (or ahead). */
  listen(speaker, listeners, at = null) {
    for (const c of listeners) if (c && c !== speaker) c.lookTarget = speaker;
    if (speaker) speaker.lookTarget = at;
  },
};
Object.assign(Beats.prototype, ShotMixin);

/** Heads straight again (call when a cutscene ends: the characters live on into gameplay). */
export function clearLooks(chars) { for (const c of chars) if (c) c.lookTarget = null; }

/**
 * A hologram of a clone officer: additive blue with rolling scanlines, flickering, on a small floor projector.
 * Parent it to a gunship bay or a room; call update(dt) every frame and set .on to show or hide it.
 */
export function makeHologram(G, parent, pos, { scale = 0.6, yaw = 0, model = 'clone_trooper', anim = 'Idle' } = {}) {
  const c = document.createElement('canvas');
  c.width = 4; c.height = 64;
  const g = c.getContext('2d');
  for (let y = 0; y < 64; y++) { const v = y % 4 < 2 ? 255 : 120; g.fillStyle = 'rgb(' + v + ',' + v + ',' + v + ')'; g.fillRect(0, y, 4, 1); }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 6);
  const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.13, 0.34, 0.78), transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, map: tex });
  const ch = new Character(G.scene, model);
  ch.group.traverse((o) => { if (o.isMesh) { o.material = mat; o.castShadow = false; o.receiveShadow = false; } });
  parent.add(ch.group);
  ch.position.copy(pos);
  ch.yaw = yaw;
  ch.group.rotation.set(0, yaw, 0);
  ch.play(anim, 0);
  ch.group.visible = false;
  const proj = new THREE.Group();
  proj.position.copy(pos);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.08, 16), new THREE.MeshStandardMaterial({ color: 0x3a3f46, roughness: 0.4, metalness: 0.7 }));
  base.position.y = 0.04;
  const disc = new THREE.Mesh(new THREE.CircleGeometry(0.18, 16), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.3, 0.75, 1.6) }));
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = 0.085;
  proj.add(base, disc);
  parent.add(proj);
  const h = {
    char: ch, projector: proj, on: false, k: 0, glitch: 0,
    update(dt) {
      this.k = this.on ? Math.min(1, this.k + dt * 2.5) : Math.max(0, this.k - dt * 3);
      ch.group.visible = this.k > 0;
      if (!ch.group.visible) return;
      this.glitch = Math.max(0, this.glitch - dt);
      const gl = this.glitch > 0 && Math.random() < 0.4;
      mat.opacity = (0.42 + Math.random() * 0.14) * this.k * (gl ? 0.4 : 1);
      tex.offset.y -= dt * 0.6;
      ch.group.scale.set(scale, scale * this.k, scale);
      ch.update(dt);
    },
    dispose() { parent.remove(ch.group); parent.remove(proj); },
  };
  return h;
}
