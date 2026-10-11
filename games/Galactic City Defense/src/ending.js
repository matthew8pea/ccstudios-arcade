import * as THREE from 'three';
import { clamp, lerp, smooth, easeInOut, easeOut, dampAngle, yawTo } from './util.js';
import { Character } from './character.js';
import { buildLAAT } from './ships.js';
import { STREET_Y } from './street.js';
import { SUN_DIR } from './city.js';
import { ShotMixin, clearLooks } from './beats.js';

const LINES = [
  { who: 'cody', text: "That's the last of them." },
  { who: 'fox', text: 'Listen. Engines... ours, this time.' },
  { who: 'yoda', text: 'Held the line, you have. Proud of you, the Republic is.' },
  { who: 'cody', text: "General Yoda? We didn't expect you down here." },
  { who: 'yoda', text: 'Expect me, few ever do. Hmm. Saved many lives today, you did.' },
  { who: 'gree', text: 'The 41st has the street, sir. The lower levels are secure.' },
  { who: 'fox', text: 'After you, Cody.' },
  { who: 'yoda', text: 'Rest now, Commanders. Over, this battle is. But many more, there will be.' },
];
const NAMES = { cody: 'CODY', fox: 'FOX', yoda: 'YODA', gree: 'GREE' };
const lineDur = (i) => clamp(0.07 * LINES[i].text.length + 1.2, 1.6, 9);

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const Y = STREET_Y;
const HOVER = V(1.5, Y + 0.9, 98); // the gunship hovers between the two skybridges
const START = V(1.5, Y + 62, 40);
const CODY_AT = V(-4.2, Y, 84.6), FOX_AT = V(-2.7, Y, 84.3);
// stations inside the open troop bay (LAAT local space: nose +Z, port side -X)
const FLOOR = 0.545;
const SEATS = {
  yoda: [-0.95, 1.4, -Math.PI / 2], gree: [-0.9, 0.25, -Math.PI / 2 + 0.25],
  cody: [-0.85, -1.0, -Math.PI / 2], fox: [-0.75, -2.2, -Math.PI / 2 - 0.2],
};
const TROOPERS = [[0.3, 2.3, -1.3], [0.9, 1.1, -1.9], [0.6, -0.2, -1.6], [0.2, -1.5, -1.2], [1.0, -2.7, -1.8], [-0.1, -3.2, -1.5]];
const angleTo = (a, b) => { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _d = new THREE.Vector3();

/** After the final wave: a LAAT/i with Yoda, Commander Gree and the 41st picks Cody and Fox up. */
export class EndingCutscene {
  constructor(G, onDone) {
    this.G = G;
    this.onDone = onDone;
    this.beatIdx = -1;
    this.bt = 0;
    this.quiet = 0;
    this.done = false;
    this.look = new THREE.Vector3();
    this.crew = [];
    this.fwd = new THREE.Vector3();
    this.side = new THREE.Vector3();
    this.beats = this.buildBeats();
  }

  line(i) {
    const L = LINES[i];
    this.G.hud.subtitle(NAMES[L.who], L.text, lineDur(i));
    this.G.speak(L.text, L.who);
    const who = { yoda: this.yoda, gree: this.gree, cody: this.G.chars.cody, fox: this.G.chars.fox }[L.who];
    if (who && who.group.parent === this.laat) who.play('Talk', 0.3);
    if (this.lastTalker && this.lastTalker !== who) this.lastTalker.play('Idle', 0.4);
    this.lastTalker = who;
  }

  shot(pa, pb, la, lb, k) {
    const e = easeInOut(k), cam = this.G.camera;
    cam.position.lerpVectors(pa, pb, e);
    this.look.lerpVectors(la, lb, e);
    cam.lookAt(this.look);
  }

  /** Midpoint of the commanders' eyes (a) and the point a camera on them aims at (b); sets this.fwd (where they face) and this.side. */
  pair(a, b) {
    const { cody, fox } = this.G.chars;
    cody.eye(a); fox.eye(b); a.add(b).multiplyScalar(0.5);
    this.fwd.set(Math.sin(cody.yaw) + Math.sin(fox.yaw), 0, Math.cos(cody.yaw) + Math.cos(fox.yaw)).normalize();
    this.side.set(this.fwd.z, 0, -this.fwd.x);
    b.copy(a).setY(a.y - 0.25);
  }

  /** World position of a point in the gunship's local space. */
  onShip(x, y, z, out = new THREE.Vector3()) { this.laat.updateMatrixWorld(); return this.laat.localToWorld(out.set(x, y, z)); }

  seat(ch, key) {
    const [x, z, yaw] = SEATS[key];
    this.laat.add(ch.group);
    ch.position.set(x, FLOOR, z);
    ch.yaw = yaw;
  }

  buildBeats() {
    const G = this.G;
    const { cody, fox } = G.chars;
    const beats = [];
    // 0: the street falls quiet: the two of them, from the front
    beats.push({
      dur: lineDur(0), line: 0, fov: 34,
      enter: () => { this.line(0); this.listen(cody, [fox], fox); },
      update: (t, k) => {
        this.pair(_a, _b);
        this.shot(_c.copy(_a).addScaledVector(this.fwd, 4.6).addScaledVector(this.side, 0.9).setY(Y + 1.35), _d.copy(_a).addScaledVector(this.fwd, 4.0).addScaledVector(this.side, 0.75).setY(Y + 1.4), _b, _b, k);
      },
    });
    // 1: ...then engines. Fox looks up
    beats.push({
      dur: lineDur(1), line: 1, fov: 30,
      enter: () => { this.line(1); G.sound.whoosh(START); fox.lookTarget = START; cody.lookTarget = fox; },
      update: (t, k, dt) => {
        if (t > 1.2) cody.lookTarget = START;
        this.face(fox, k, { dist: 2.0, ang: 0.5, dy: -0.15, drop: -0.05 }, { dist: 1.8, ang: 0.45, dy: -0.18, drop: -0.1 });
      },
    });
    // 2: the gunship comes in over their heads from behind and settles into a hover in front of them
    beats.push({
      dur: 5.0, fov: 50,
      enter: () => { this.laat.visible = true; G.sound.whoosh(G.camera.position); },
      update: (t, k, dt) => {
        const h = easeOut(k), v = smooth(clamp((k - 0.08) / 0.8, 0, 1));
        this.laat.position.set(lerp(START.x, HOVER.x, h), lerp(START.y, HOVER.y, v), lerp(START.z, HOVER.z, h));
        this.laat.rotation.x = (1 - k) * 0.25;
        cody.lookTarget = fox.lookTarget = this.laat.position;
        for (const c of [cody, fox]) c.yaw = dampAngle(c.yaw, yawTo(this.laat.position.x - c.position.x, this.laat.position.z - c.position.z), k > 0.5 ? 3 : 0, dt);
        if (k > 0.75 && Math.random() < 0.6) G.fx.dust(_a.set(HOVER.x + (Math.random() - 0.5) * 8, Y, HOVER.z + (Math.random() - 0.5) * 10), 3, 1.8);
        if (k > 0.75 && !this.blown) { this.blown = true; G.civilians.scare(HOVER, 30); G.sound.thump(HOVER); }
        // low behind the commanders, looking past them up at it
        this.pair(_a, _b);
        _c.copy(_a).addScaledVector(this.fwd, -3.2).addScaledVector(this.side, -0.6).setY(Y + 0.95);
        this.cam(_c, _d.copy(this.laat.position).setY(this.laat.position.y + 1.6).lerp(_b.copy(HOVER).setY(Y + 2.2), 0.45));
      },
    });
    // 3-8: Yoda, Gree and the commanders
    beats.push({
      dur: lineDur(2), line: 2, fov: 30,
      enter: () => { this.line(2); cody.lookTarget = fox.lookTarget = this.yoda; },
      update: (t, k) => this.face(this.yoda, k, { dist: 1.9, ang: 0.45, dy: 0.05 }, { dist: 1.65, ang: 0.4, dy: 0.04 }),
    });
    beats.push({
      dur: lineDur(3), line: 3, fov: 30,
      enter: () => this.line(3),
      update: (t, k, dt) => {
        for (const c of [cody, fox]) c.yaw = dampAngle(c.yaw, yawTo(this.laat.position.x - c.position.x, this.laat.position.z - c.position.z), 3, dt);
        this.face(cody, k, { dist: 2.1, ang: -0.5, dy: 0.02 }, { dist: 1.85, ang: -0.45, dy: 0.0 });
      },
    });
    beats.push({
      dur: lineDur(4), line: 4, fov: 34,
      enter: () => { this.line(4); this.gree.lookTarget = this.yoda; },
      update: (t, k) => this.face(this.yoda, k, { dist: 2.3, ang: -0.35, dy: 0.12 }, { dist: 2.05, ang: -0.3, dy: 0.1 }),
    });
    beats.push({
      dur: lineDur(5), line: 5, fov: 25,
      enter: () => { this.line(5); this.gree.lookTarget = null; this.yoda.lookTarget = this.gree; },
      update: (t, k) => this.face(this.gree, k, { dist: 2.1, ang: 0.4, dy: 0.0 }, { dist: 1.9, ang: 0.35, dy: -0.02 }),
    });
    beats.push({
      dur: lineDur(6), line: 6, fov: 30,
      enter: () => { this.line(6); this.listen(fox, [cody], cody); this.yoda.lookTarget = null; },
      update: (t, k, dt) => {
        cody.yaw = dampAngle(cody.yaw, yawTo(fox.position.x - cody.position.x, fox.position.z - cody.position.z), 4, dt);
        fox.yaw = dampAngle(fox.yaw, yawTo(cody.position.x - fox.position.x, cody.position.z - fox.position.z), 4, dt);
        this.ots(cody, fox, k, { back: 0.8, side: -0.45, dy: 0.06, shift: -0.15 }, { back: 0.68, side: -0.42, dy: 0.05, shift: -0.15 });
      },
    });
    // 9: they run over and climb aboard
    beats.push({
      dur: 3.2, fov: 50,
      enter: () => {
        this.runFrom = { cody: cody.position.clone(), fox: fox.position.clone() };
        this.door = { cody: this.onShip(-1.9, 0, SEATS.cody[1]).setY(Y), fox: this.onShip(-1.9, 0, SEATS.fox[1]).setY(Y) };
        this.seatW = { cody: this.onShip(SEATS.cody[0], FLOOR, SEATS.cody[1]), fox: this.onShip(SEATS.fox[0], FLOOR, SEATS.fox[1]) };
        cody.play('Run', 0.2); fox.play('Run', 0.2);
        cody.lookTarget = fox.lookTarget = null;
      },
      update: (t, k, dt) => {
        for (const [key, c, delay] of [['cody', cody, 0], ['fox', fox, 0.35]]) {
          const tt = clamp((t - delay) / 2.0, 0, 1);
          if (tt < 1) {
            c.position.lerpVectors(this.runFrom[key], this.door[key], tt);
            c.yaw = dampAngle(c.yaw, yawTo(this.door[key].x - this.runFrom[key].x, this.door[key].z - this.runFrom[key].z), 10, dt);
          } else {
            const j = clamp((t - delay - 2.0) / 0.5, 0, 1);
            c.position.lerpVectors(this.door[key], this.seatW[key], j);
            c.position.y += Math.sin(j * Math.PI) * 0.5;
            if (j >= 1 && c.group.parent !== this.laat) { c.play('Idle', 0.3); this.seat(c, key); }
          }
        }
        this.shot(V(-9.5, Y + 2.2, 104), V(-9, Y + 2.4, 103), _a.copy(HOVER).setY(Y + 1.6), _a.clone(), k);
      },
    });
    // 10: Yoda's last words, everyone aboard
    beats.push({
      dur: lineDur(7), line: 7, fov: 36,
      enter: () => {
        for (const [key, c] of [['cody', cody], ['fox', fox]]) if (c.group.parent !== this.laat) { c.play('Idle', 0.2); this.seat(c, key); }
        this.line(7);
        this.listen(this.yoda, [cody, fox, this.gree]);
      },
      update: (t, k) => this.face(this.yoda, k, { dist: 2.35, ang: 0.8, dy: 0.24, drop: -0.1 }, { dist: 2.1, ang: 0.74, dy: 0.22, drop: -0.1 }),
    });
    // 11: straight up out of the canyon, then away toward the sunset, the camera chasing it out over the city
    beats.push({
      dur: 8.5, fov: 55,
      enter: () => {
        G.sound.whoosh(HOVER);
        for (const c of this.crew) c.lookTarget = null;
        cody.lookTarget = fox.lookTarget = null;
        this.from = this.laat.position.clone();
        this.rise = V(this.from.x, 12, this.from.z);
        // pick the heading closest to the sun whose flight path clears the skyline
        const sun = V(SUN_DIR.x, 0, SUN_DIR.z).normalize(), up = V(0, 1, 0);
        this.heading = sun;
        for (const deg of [0, 18, -18, 36, -36, 60, -60, 90, -90, 130, -130, 180]) {
          const h = sun.clone().applyAxisAngle(up, (deg * Math.PI) / 180);
          if (!G.city.occluded(this.rise, this.rise.clone().addScaledVector(h, 700).setY(240))) { this.heading = h; break; }
        }
        this.end = this.rise.clone().addScaledVector(this.heading, 1100).setY(300);
        this.yaw0 = this.laat.rotation.y;
        // a camera hanging over the canyon behind the climb, on whichever side has a clear view of the flight
        const side = V(this.heading.z, 0, -this.heading.x);
        this.chase = this.rise.clone().addScaledVector(this.heading, -26).addScaledVector(side, 10).setY(20);
        for (const s of [1, -1, 0.5, -0.5]) {
          const c = this.rise.clone().addScaledVector(this.heading, -26).addScaledVector(side, 10 * s).setY(20);
          if (!G.city.occluded(c, this.rise) && !G.city.occluded(c, this.rise.clone().addScaledVector(this.heading, 300).setY(110))) { this.chase = c; break; }
        }
      },
      update: (t, k, dt) => {
        const k1 = smooth(clamp(t / 2.8, 0, 1));
        const k2 = Math.pow(clamp((t - 2.2) / 6.3, 0, 1), 1.7);
        this.laat.position.lerpVectors(this.from, this.rise, k1).lerp(this.end, k2);
        const want = Math.atan2(this.heading.x, this.heading.z);
        if (t > 1.4) this.laat.rotation.y = this.yaw0 + angleTo(this.yaw0, want) * smooth(clamp((t - 1.4) / 2.2, 0, 1));
        this.laat.rotation.x = -0.22 * Math.sin(Math.PI * clamp((t - 1.8) / 4, 0, 1));
        if (t < 1.4 && Math.random() < 0.5) G.fx.dust(_a.set(HOVER.x + (Math.random() - 0.5) * 8, Y, HOVER.z + (Math.random() - 0.5) * 10), 3, 1.4);
        if (t < 1.7) this.cam(V(-6.5, Y + 1.7, 86), _a.copy(this.laat.position).setY(this.laat.position.y + 1.4));
        else {
          // follows a little behind it, so it pulls away into the sunset
          if (!this.chasing) { this.chasing = true; G.camera.position.copy(this.chase); }
          _a.copy(this.laat.position).addScaledVector(this.heading, -21).add(_b.set(this.heading.z * 7, -2.5, -this.heading.x * 7));
          if (t > 2.6) G.camera.position.lerp(_a, 1 - Math.exp(-dt * (t < 6.6 ? 2.6 : 0.12)));
          this.look.copy(this.laat.position).setY(this.laat.position.y + 1.5);
          G.camera.lookAt(this.look);
        }
        if (t > 4.6 && !this.titled) {
          this.titled = true;
          G.hud.titleCard(['REPUBLIC VICTORY', 'CORUSCANT · THE LOWER LEVELS ARE SAFE', 'The 212th and the Coruscant Guard held the line.'], 0, 3.8, true);
        }
      },
    });
    return beats;
  }

  cam(pos, look) { this.G.camera.position.copy(pos); this.look.copy(look); this.G.camera.lookAt(this.look); }

  start() {
    const G = this.G;
    const { cody, fox } = G.chars;
    G.enemies.clear();
    G.combat.clear();
    G.hud.letterbox(true);
    G.camera.fov = 55;
    G.camera.updateProjectionMatrix();
    G.onFovChange();
    // the gunship and everyone aboard it
    this.laat = buildLAAT({ bay: true });
    this.laat.position.copy(START);
    this.laat.visible = false;
    G.scene.add(this.laat);
    this.yoda = new Character(G.scene, 'yoda');
    this.gree = new Character(G.scene, 'gree');
    this.seat(this.yoda, 'yoda');
    this.seat(this.gree, 'gree');
    this.yoda.play('Idle', 0);
    this.gree.play('Idle', 0);
    this.crew.push(this.yoda, this.gree);
    for (const [x, z, yaw] of TROOPERS) {
      const t = new Character(G.scene, 'clone_trooper');
      this.laat.add(t.group);
      t.position.set(x, FLOOR, z);
      t.yaw = yaw;
      t.play('Idle', 0);
      t.mixer.setTime(Math.random() * 2);
      this.crew.push(t);
    }
    for (const [c, p] of [[cody, CODY_AT], [fox, FOX_AT]]) {
      c.group.rotation.set(0, 0, 0);
      c.pitch = c.twist = 0;
      c.position.copy(p);
      c.yaw = 0.4;
      c.play('Idle', 0.2);
    }
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
    for (const c of this.crew) c.update(dt);
    // engine wash particles while the gunship is in the canyon
    if (this.laat.visible && Math.random() < 0.5) {
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
    clearLooks([G.chars.cody, G.chars.fox, ...this.crew]);
    for (const c of [G.chars.cody, G.chars.fox]) {
      if (c.group.parent === this.laat) G.scene.attach(c.group);
      c.group.rotation.set(0, c.yaw, 0);
      c.play('Idle', 0.2);
    }
    for (const c of this.crew) { if (c.group.parent) c.group.parent.remove(c.group); c.mixer.stopAllAction(); }
    this.crew.length = 0;
    G.scene.remove(this.laat);
    G.voice.stop();
    G.hud.subtitle(null);
    G.hud.letterbox(false);
    if (this.onDone) this.onDone();
  }
}
Object.assign(EndingCutscene.prototype, ShotMixin);
