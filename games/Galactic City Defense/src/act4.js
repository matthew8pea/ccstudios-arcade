import * as THREE from 'three';
import { Character } from './character.js';
import { smooth } from './util.js';
import { Beats, clearLooks } from './beats.js';
import { spaceScene } from './space.js';
import { buildLAAT } from './ships.js';
import { FLOOR, SEATS, TROOPERS } from './act3.js';
import { TX, TZ } from './temple.js';
import { SUN_DIR } from './city.js';

// Act IV: Order 66. The order went out while the commanders were on Tatooine, and the storms there kept it from
// them; they heard it in orbit, two days late, and refused it. The arrival (out of hyperspace over Coruscant, the
// Temple burning, the gunship setting down at the Council tower, the empty chamber, the clones storming in after
// Master Yoda) and the ending (a last gunship off the processional way, and Yoda going into exile).

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _q = new THREE.Quaternion();
const V = (x, y, z) => new THREE.Vector3(x, y, z);

/** The playable Yoda's blade, put away for the gunship scenes (a lit saber that close to the camera blooms out the shot). */
export function sheathe(ch, on) { for (const m of ch.materials) if (/^Saber/.test(m.name)) m.visible = !on; }

/** Red-lit visors: the clones who took the order. */
export function order66Visor(ch) {
  for (const m of ch.materials) if (m.name === 'Visor') { m.emissive.set('#ff2a14'); m.emissiveIntensity = 2.2; }
}

/** A gunship with an open bay in the city, Yoda and the commanders seated, a few loyal troopers opposite. */
function crewedGunship(G, yoda) {
  const laat = buildLAAT({ bay: true });
  G.scene.add(laat);
  const seated = { yoda, gree: G.chars.gree, cody: G.chars.cody, fox: G.chars.fox };
  for (const [key, ch] of Object.entries(seated)) {
    const [x, z] = SEATS[key];
    laat.add(ch.group);
    ch.group.rotation.set(0, 0, 0);
    ch.position.set(x, FLOOR, z);
    ch.yaw = -Math.PI / 2;
    ch.pitch = ch.twist = 0;
    ch.group.visible = true;
    ch.play('Idle', 0);
  }
  const troopers = TROOPERS.slice(0, 3).map(([x, z, yaw]) => {
    const t = new Character(G.scene, 'clone_trooper');
    laat.add(t.group);
    t.position.set(x, FLOOR, z);
    t.yaw = yaw;
    t.play('Idle', 0);
    t.mixer.setTime(Math.random() * 2);
    return t;
  });
  const onShip = (x, y, z) => { laat.updateMatrixWorld(); return laat.localToWorld(new THREE.Vector3(x, y, z)); };
  const head = (key) => { const [x, z] = SEATS[key]; return onShip(x, FLOOR + (key === 'yoda' ? 0.6 : 1.62), z); };
  const thrust = () => {
    if (Math.random() > 0.7) return;
    laat.updateMatrixWorld();
    const q = laat.getWorldQuaternion(_q);
    for (const sx of [-1.05, 1.05]) G.fx.thruster(laat.localToWorld(_a.set(sx, 2.3, -10.4)), _b.set(0, 0, -1).applyQuaternion(q), 1.3);
  };
  const unload = () => {
    for (const t of troopers) laat.remove(t.group);
    for (const [key, ch] of Object.entries(seated)) {
      if (ch.group.parent === laat) G.scene.attach(ch.group);
      ch.group.rotation.set(0, 0, 0);
      if (key !== 'yoda' || ch === G.chars.yoda) ch.group.visible = false;
    }
    G.scene.remove(laat);
  };
  return { laat, seated, troopers, onShip, head, thrust, unload };
}

/** Close-up through the open side of a gunship bay. */
function faceShot(beats, gs, key, k) {
  const c = gs.seated[key];
  if (key === 'yoda') beats.face(c, k, { dist: 1.9, ang: 0.45, dy: 0.05 }, { dist: 1.65, ang: 0.4, dy: 0.04 });
  else beats.face(c, k, { dist: 2.1, ang: 0.42, dy: 0.0 }, { dist: 1.9, ang: 0.38, dy: -0.02 });
}

// ---------------------------------------------------------------------------
// The arrival
// ---------------------------------------------------------------------------
export class Act4Arrival extends Beats {
  constructor(G, onDone) {
    super(G);
    this.onDone = onDone;
    this.T = G.city.temple;
    this.C = this.T.council;
    this.extras = [];
    this.beats = this.buildBeats();
  }

  buildBeats() {
    const G = this.G, C = this.C, c = C.center, sp = spaceScene(), S = sp.ship, SL = sp.laat;
    const pad = V(C.pad[0], c.y, C.pad[1]);
    const south = C.doors.find((d) => d.south);
    const beats = [];
    // over Coruscant: the assault ship drops out of hyperspace
    beats.push({
      dur: 5.4, fov: 42,
      enter: () => {
        sp.setPlanet('coruscant');
        G.renderPass.scene = sp.scene;
        S.position.set(0, 0, -4200); S.rotation.set(0, 0, 0); S.scale.set(1, 1, 1); S.visible = true;
        SL.visible = false;
        this.arrived = false;
        G.hud.fade(false, 700);
        G.hud.titleCard(['ACT IV · ORDER 66', 'CORUSCANT', 'The Republic has turned on the Jedi.'], 1.2, 4.6, true);
      },
      update: (t, k, dt) => {
        const ta = t - 0.9;
        if (ta < 0) S.position.z = -4200;
        else if (ta < 0.32) {
          const e = ta / 0.32;
          S.position.z = -4200 + 4200 * (1 - (1 - e) ** 3);
          S.scale.set(1, 1, 1 + 24 * (1 - e));
          if (!this.arrived) { this.arrived = true; G.sound.hyperspace(); }
        } else { S.scale.set(1, 1, 1); S.position.z = 4 * (ta - 0.32); }
        const fk = ta > 0 ? Math.max(0, 1 - Math.abs(ta - 0.3) / 0.35) : 0;
        sp.flash.material.opacity = fk * 0.7;
        sp.flash.position.copy(S.position).add(_a.set(0, 0, 90));
        sp.flash.scale.setScalar(60 + fk * 100);
        G.camera.position.set(-130 + t * 5, 150 - t * 3, 260 - t * 9);
        this.look.set(0, -40, -40);
        G.camera.lookAt(this.look);
        sp.frame(G.camera);
      },
      exit: () => G.hud.fade(true, 400),
    });
    // down through the skylanes: the Temple is burning
    beats.push({
      dur: 6.4, fov: 40, line: ['gree', "The Temple... it's on fire."],
      enter: () => {
        G.renderPass.scene = G.scene;
        sp.flash.material.opacity = 0;
        G.hud.fade(false, 800);
        this.gs = crewedGunship(G, this.yoda);
        // high off the Temple's south-east corner: the whole ziggurat burning, the gunship running in toward it
        this.cam = V(TX + 250, 320, TZ + 640);
        this.from = this.cam.clone().add(V(-26, -10, -34));
        this.to = pad.clone().add(V(0, 5, 16));
      },
      update: (t, k) => {
        const L = this.gs.laat, e = smooth(k);
        L.position.lerpVectors(this.from, this.to, e);
        L.position.y += Math.sin(k * Math.PI) * 12;
        L.rotation.set(0.04 * Math.sin(k * Math.PI), Math.atan2(this.to.x - this.from.x, this.to.z - this.from.z), -0.18 * Math.sin(k * Math.PI));
        this.gs.thrust();
        G.camera.position.copy(this.cam).add(_a.set(-14 * k, -6 * k, -18 * k));
        this.look.lerpVectors(V(TX, 110, TZ - 40), L.position, 0.3 * (1 - k));
        G.camera.lookAt(this.look);
      },
    });
    // settling onto the landing pad at the Council tower
    beats.push({
      dur: 4.4, fov: 44, line: ['yoda', 'Too late, we are. Hmm. Dark, this place has become.'],
      enter: () => this.gs.seated.yoda.play('Talk', 0.3),
      update: (t, k) => {
        const L = this.gs.laat;
        L.position.lerpVectors(this.to, pad.clone().add(V(0, 1.1, 2)), smooth(Math.min(1, k * 1.3)));
        L.rotation.set(0, Math.PI, 0);
        this.gs.thrust();
        this.shot(pad.clone().add(V(-20, 5, 8)), pad.clone().add(V(-16, 4, 6)), L.position.clone().add(V(0, 2, 0)), L.position.clone().add(V(4, 3, -6)), k);
      },
      exit: () => G.hud.fade(true, 350),
    });
    // inside: the Council chamber, empty
    beats.push({
      dur: 4.8, fov: 40, line: ['yoda', 'Empty, the Council chamber is. Gone... so many of them. Felt them fall, I did.'],
      enter: () => {
        G.hud.fade(false, 700);
        south.openFor(5);
        this.gs.unload();
        this.gs.laat.position.copy(pad).add(V(0, 1.1, 2));
        G.scene.add(this.gs.laat); // left on the pad, seen through the south door
        this.stand();
        this.yoda.play('Talk', 0.3);
      },
      update: (t, k) => {
        const y = this.yoda.position;
        this.shot(V(y.x + 0.75, y.y + 1.0, y.z + 1.7), V(y.x + 0.55, y.y + 0.9, y.z + 1.2), V(c.x - 1.5, c.y + 1.0, c.z - 8), V(c.x - 0.5, c.y + 0.9, c.z - 8), k);
      },
    });
    beats.push({
      dur: 3.2, fov: 32, line: ['fox', "Master Yoda, we can't stay. The Guard will have seen the gunship."],
      enter: () => { this.yoda.play('Idle', 0.3); G.chars.fox.play('Talk', 0.3); },
      update: (t, k) => {
        this.face(G.chars.fox, k, { dist: 2.2, ang: 0.45, dy: 0.02 }, { dist: 1.95, ang: 0.4, dy: 0.0 });
      },
    });
    // the lift doors open all round the room
    beats.push({
      dur: 3.8, fov: 46, line: ['sergeant', 'There! Master Yoda, and the traitors with him! Execute the order!'],
      enter: () => { G.chars.fox.play('Idle', 0.3); this.storm(); },
      update: (t, k) => this.shot(V(c.x + 1.6, c.y + 1.45, c.z + 14.6), V(c.x + 1.2, c.y + 1.6, c.z + 14.0), V(c.x - 0.5, c.y + 1.3, c.z - 2), V(c.x, c.y + 1.2, c.z), k),
    });
    beats.push({
      dur: 2.6, fov: 34, line: ['yoda', 'Hmm. Then fight, we must.'],
      enter: () => this.yoda.play('Talk', 0.3),
      update: (t, k) => {
        this.face(this.yoda, k, { dist: 1.9, ang: 0.45, dy: 0.08 }, { dist: 1.65, ang: 0.4, dy: 0.06 });
      },
    });
    return beats;
  }

  /** A line starts: in the chamber, everyone turns to the speaker (and toward the clones when the sergeant shouts). */
  onLine(who) {
    const G = this.G, all = [this.yoda, G.chars.cody, G.chars.fox, G.chars.gree].filter((ch) => ch.group.visible && ch.group.parent === G.scene);
    if (who === 'sergeant') { const c = this.C.center; for (const ch of all) ch.lookTarget = new THREE.Vector3(c.x, c.y + 1.6, c.z - 12); return; }
    const c = { yoda: this.yoda, cody: G.chars.cody, fox: G.chars.fox, gree: G.chars.gree }[who];
    if (c && all.includes(c)) this.listen(c, all, who === 'yoda' ? null : this.yoda);
  }

  /** Yoda and the commanders, just inside the south door. */
  stand() {
    const G = this.G, c = this.C.center;
    const spots = { yoda: [0, 9], cody: [-2.2, 10.5], fox: [2.2, 10.6], gree: [0.4, 12] };
    for (const [key, [x, z]] of Object.entries(spots)) {
      const ch = key === 'yoda' ? this.yoda : G.chars[key];
      ch.position.set(c.x + x, c.y, c.z + z);
      ch.yaw = Math.PI;
      ch.group.visible = true;
      ch.play('Idle', 0.2);
    }
  }

  /** Clones from every unit run in through the other three doors and level their rifles. */
  storm() {
    const G = this.G, c = this.C.center;
    const models = ['trooper_guard', 'trooper_212', 'clone_trooper'];
    let n = 0;
    for (const d of this.C.doors) {
      if (d.south) continue;
      d.openFor(4);
      for (let i = 0; i < 2; i++) {
        const ch = G.pool.get(models[n % 3]);
        order66Visor(ch);
        const side = new THREE.Vector3(-d.dir.z, 0, d.dir.x);
        ch.position.copy(d.pos).addScaledVector(side, (i - 0.5) * 1.6);
        ch.yaw = Math.atan2(d.dir.x, d.dir.z);
        ch.play('Run', 0.1);
        this.extras.push({ ch, dir: d.dir.clone(), run: 1.6 + Math.random() * 0.8 });
        n++;
      }
    }
    G.sound.door(this.C.doors[0].pos);
  }

  start() {
    const G = this.G;
    G.hud.letterbox(true);
    G.hud.fade(true, 1);
    this.yoda = new Character(G.scene, 'yoda');
    this.yoda.group.visible = false;
    this.enter(0);
  }

  update(dt) {
    if (this.done) return;
    const G = this.G;
    this.step(dt);
    if (this.done) return;
    const chars = new Set([this.yoda, G.chars.cody, G.chars.fox, G.chars.gree, ...(this.gs ? this.gs.troopers : [])]);
    for (const ch of chars) if (ch.group.visible) ch.update(dt);
    const target = this.yoda.position;
    for (const e of this.extras) {
      const ch = e.ch;
      if (e.run > 0) {
        e.run -= dt;
        ch.position.addScaledVector(e.dir, 4.2 * dt);
        if (e.run <= 0) ch.play('Idle', 0.2);
      } else {
        ch.yaw = Math.atan2(target.x - ch.position.x, target.z - ch.position.z);
        ch.pitch = -0.1;
      }
      ch.update(dt);
    }
  }

  finish() {
    if (this.done) return;
    this.done = true;
    const G = this.G, sp = spaceScene();
    G.voice.stop();
    G.hud.subtitle(null);
    G.hud.titleCard(null);
    G.hud.letterbox(false);
    G.hud.fade(false, 300);
    G.renderPass.scene = G.scene;
    sp.flash.material.opacity = 0;
    sp.ship.scale.set(1, 1, 1);
    clearLooks([this.yoda, G.chars.cody, G.chars.fox, G.chars.gree]);
    if (this.gs) { if (this.gs.laat.parent) this.gs.unload(); }
    for (const e of this.extras) G.pool.release(e.ch);
    G.scene.remove(this.yoda.group);
    for (const k of ['cody', 'fox', 'gree']) { const ch = G.chars[k]; G.scene.attach(ch.group); ch.group.rotation.set(0, 0, 0); ch.group.visible = false; }
    for (const d of this.C.doors) d.timer = 0;
    if (this.onDone) this.onDone();
  }
}

// ---------------------------------------------------------------------------
// The ending: off the processional way, and into exile
// ---------------------------------------------------------------------------
export class Act4Ending extends Beats {
  constructor(G, onDone) {
    super(G);
    this.onDone = onDone;
    this.T = G.city.temple;
    this.beats = this.buildBeats();
  }

  buildBeats() {
    const G = this.G, T = this.T, FZ = T.FZ, TX = T.exterior.center.x, PY = T.exterior.y;
    const HOVER = V(TX - 15, PY + 0.4, FZ + 44);
    const caller = G.selected === 'yoda' ? 'gree' : G.selected;
    const beats = [];
    // a gunship drops onto the plaza
    beats.push({
      dur: 4.6, fov: 50, line: [caller, 'Gunship! Get the General aboard!'],
      enter: () => {
        this.gs = crewedGunship(G, this.yoda);
        for (const ch of Object.values(this.gs.seated)) ch.group.visible = false; // empty until they board
        this.from = HOVER.clone().add(V(-60, 70, 140));
      },
      update: (t, k) => {
        const L = this.gs.laat, e = smooth(Math.min(1, k * 1.2));
        L.position.lerpVectors(this.from, HOVER, e);
        L.rotation.set(0.1 * (1 - e), Math.PI * 0.85, 0.2 * Math.sin(k * Math.PI));
        this.gs.thrust();
        if (k > 0.6 && Math.random() < 0.5) G.fx.dust(HOVER.clone().add(V((Math.random() - 0.5) * 10, 0, (Math.random() - 0.5) * 12)), 3, 1.8);
        this.shot(V(TX + 6, PY + 1.6, FZ + 70), V(TX + 2, PY + 1.8, FZ + 64), L.position.clone().add(V(0, 3, 0)), HOVER.clone().add(V(0, 2, 0)), k);
      },
      exit: () => G.hud.fade(true, 350),
    });
    // aboard, and up off the terrace under fire
    beats.push({
      dur: 5.4, fov: 50,
      enter: () => {
        for (const ch of Object.values(this.gs.seated)) ch.group.visible = true;
        G.hud.fade(false, 600);
        G.sound.flyby(HOVER, 1.1);
        this.away = HOVER.clone().add(V(270, 85, 70));
      },
      update: (t, k) => {
        const L = this.gs.laat, e = smooth(k);
        _a.copy(HOVER).setY(HOVER.y + 14 * Math.min(1, k * 3));
        L.position.lerpVectors(_a, this.away, e * e);
        L.rotation.set(-0.3 * e * (1 - e) * 4, Math.atan2(this.away.x - HOVER.x, this.away.z - HOVER.z) * Math.min(1, k * 2) + Math.PI * 0.85 * (1 - Math.min(1, k * 2)), -0.3 * Math.sin(k * Math.PI));
        this.gs.thrust();
        // clones on the terrace fire up after it
        if (Math.random() < 0.25) {
          const from = V(TX + 4 + Math.random() * 26, PY + 1.4, FZ + 8 + Math.random() * 40);
          const to = L.position.clone().add(V((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 8));
          G.combat.fireBolt({ from, dir: to.sub(from).normalize(), speed: 90, dmg: 0, team: 'friendly', owner: 'cutscene', color: 0xff5040, len: 2.5, width: 0.14 });
          G.sound.shot('rebel', from);
        }
        this.shot(V(TX - 8, PY + 1.5, FZ + 70), V(TX - 10, PY + 1.9, FZ + 74), L.position.clone().add(V(0, 1.5, 0)), L.position.clone().add(V(0, 1.5, 0)), k);
      },
      exit: () => G.hud.fade(true, 300),
    });
    // over the city, turned so the close-ups (from the open port side) look away from the sun
    const awayYaw = Math.atan2(SUN_DIR.z, -SUN_DIR.x);
    const high = () => {
      const L = this.gs.laat;
      L.position.copy(this.away).add(V(0, 40, 0));
      L.rotation.set(-0.04, awayYaw, Math.sin(G.time * 0.7) * 0.03);
    };
    const talk = (key) => {
      for (const [k, ch] of Object.entries(this.gs.seated)) ch.play(k === key ? 'Talk' : 'Idle', 0.3);
      if (key) this.listen(this.gs.seated[key], [...Object.values(this.gs.seated), ...this.gs.troopers], key === 'yoda' ? null : this.gs.seated.yoda);
    };
    beats.push({
      dur: 4.0, fov: 32, line: ['yoda', 'Into exile, I must go. Hidden, until the time is right.'],
      enter: () => { G.hud.fade(false, 500); talk('yoda'); },
      update: (t, k) => { high(); faceShot(this, this.gs, 'yoda', k); },
    });
    beats.push({
      dur: 2.8, fov: 30, line: ['fox', 'Then we go with you, General.'],
      enter: () => talk('fox'),
      update: (t, k) => { high(); faceShot(this, this.gs, 'fox', k); },
    });
    beats.push({
      dur: 2.2, fov: 30, line: ['cody', 'Wherever that is.'],
      enter: () => talk('cody'),
      update: (t, k) => { high(); faceShot(this, this.gs, 'cody', k); },
    });
    beats.push({
      dur: 3.8, fov: 32, line: ['yoda', 'Hmm. Good soldiers, you are. Better men, even.'],
      enter: () => talk('yoda'),
      update: (t, k) => { high(); faceShot(this, this.gs, 'yoda', k); },
    });
    // away over the city at sunset, the Temple burning behind
    beats.push({
      dur: 6.4, fov: 46,
      enter: () => {
        talk(null);
        G.hud.titleCard(['ACT IV COMPLETE', 'MASTER YODA ESCAPES', 'The Jedi have fallen. The order still stands. Three commanders chose otherwise.'], 0.8, 5.0, true);
        this.exitFrom = this.away.clone().add(V(0, 40, 0));
        const dir = _b.subVectors(this.away, HOVER).setY(0).normalize();
        this.exitCam = this.exitFrom.clone().addScaledVector(dir, 200).add(V(dir.z * 34, 10, -dir.x * 34));
        this.templeAt = V(TX, 120, T.exterior.center.z - 160);
      },
      update: (t, k) => {
        const L = this.gs.laat, dir = _b.subVectors(this.away, HOVER).setY(0).normalize();
        L.position.copy(this.exitFrom).addScaledVector(dir, 250 * k).add(V(0, 30 * k, 0));
        L.rotation.set(-0.05, Math.atan2(dir.x, dir.z), -0.15);
        this.gs.thrust();
        G.camera.position.copy(this.exitCam);
        this.look.lerpVectors(this.templeAt, L.position, 0.45 + 0.4 * smooth(k));
        G.camera.lookAt(this.look);
      },
    });
    return beats;
  }

  start() {
    const G = this.G;
    G.hud.letterbox(true);
    this.yoda = G.selected === 'yoda' ? G.chars.yoda : (this.ownYoda = new Character(G.scene, 'yoda'));
    sheathe(this.yoda, true);
    this.enter(0);
  }

  update(dt) {
    if (this.done) return;
    this.step(dt);
    if (this.done || !this.gs) return;
    for (const ch of new Set([...Object.values(this.gs.seated), ...this.gs.troopers])) ch.update(dt);
  }

  finish() {
    if (this.done) return;
    this.done = true;
    const G = this.G;
    G.voice.stop();
    G.hud.subtitle(null);
    G.hud.titleCard(null);
    G.hud.letterbox(false);
    G.hud.fade(false, 300);
    if (this.gs) { clearLooks([...Object.values(this.gs.seated), ...this.gs.troopers]); this.gs.unload(); }
    sheathe(this.yoda, false);
    if (this.ownYoda && this.ownYoda.group.parent) this.ownYoda.group.parent.remove(this.ownYoda.group);
    // the commanders stay in the fight if you play on
    for (const c of [G.player && G.player.char, G.ally && G.ally.char]) if (c) { G.scene.attach(c.group); c.group.rotation.set(0, 0, 0); c.group.visible = true; }
    if (this.onDone) this.onDone();
  }
}
