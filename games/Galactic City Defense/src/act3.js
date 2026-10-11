import * as THREE from 'three';
import { Character } from './character.js';
import { clamp, smooth, dampAngle, yawTo } from './util.js';
import { Beats, makeHologram, clearLooks } from './beats.js';
import { spaceScene } from './space.js';
import { TAT_SUN } from './tatooine.js';

// Act III: Tatooine. Count Dooku has turned the Jawas and the Tusken Raiders against the Republic with his
// mind tricks (the Anchorhead garrison's report at the end of Act II). The arrival (the assault ship out of
// hyperspace over the planet, the gunship's dive through the atmosphere and over the dunes, the desert peoples on
// a ridge, side by side), and the ending (Dooku beaten, his escape in a storm of sand, the Jawas and Tuskens
// waking from his hold; then home: up to the assault ship, where a two-day-old recording finally reaches them. Order
// 66. Cody, Fox and Gree refuse it, and the ship jumps for Coruscant with Master Yoda aboard).

export const FLOOR = 0.545;
export const SEATS = { yoda: [-0.95, 1.4], gree: [-0.9, 0.25], cody: [-0.85, -1.0], fox: [-0.75, -2.2] };
export const TROOPERS = [[0.3, 2.3, -1.3], [0.9, 1.1, -1.9], [0.6, -0.2, -1.6], [0.2, -1.5, -1.2], [1.0, -2.7, -1.8]];
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _q = new THREE.Quaternion();

export class TatooineArrival extends Beats {
  constructor(G, onDone) {
    super(G);
    this.onDone = onDone;
    const tat = G.tatooine;
    this.tat = tat;
    this.laat = tat.laat;
    this.parked = { pos: this.laat.position.clone(), rot: this.laat.rotation.y };
    // world-space flight path (the gunship lives inside the Tatooine group)
    this.gp = tat.group.position;
    this.LAND = this.laat.position.clone().add(this.gp);
    this.START = tat.W(-170, 120).setY(70);
    this.crew = [];
    this.watchers = [];
    this.beats = this.buildBeats();
  }

  onShip(x, y, z, out = new THREE.Vector3()) { this.laat.updateMatrixWorld(); return this.laat.localToWorld(out.set(x, y, z)); }
  head(key, out) { const [x, z] = SEATS[key]; return this.onShip(x, FLOOR + (key === 'yoda' ? 0.6 : 1.62), z, out); }

  placeLaat(world, yaw) {
    this.laat.position.copy(world).sub(this.gp);
    this.laat.rotation.y = yaw;
  }

  buildBeats() {
    const G = this.G, tat = this.tat, W = tat.W;
    const beats = [];
    // a dune crest north of the farm (seen through the gap in the boulders), where the war party stands against the sky
    let ridge = null;
    for (let x = -20; x <= 4; x += 3) for (let z = -100; z >= -130; z -= 5) {
      const h = tat.H(x, z);
      if (!ridge || h > ridge.y) ridge = W(x, z).setY(h);
    }
    this.ridge = ridge;
    const landYaw = this.parked.rot;
    const sp = spaceScene();
    sp.setPlanet('tatooine');
    this.space = sp;
    const S = sp.ship, SL = sp.laat, cam = G.camera;
    // orbit 1: the assault ship drops out of hyperspace over Tatooine
    beats.push({
      dur: 5.2, fov: 42,
      enter: () => {
        G.renderPass.scene = sp.scene;
        S.position.set(0, 0, -4200);
        S.rotation.set(0, 0, 0);
        S.scale.set(1, 1, 1);
        SL.visible = false;
        this.arrived = false;
        G.hud.titleCard(['ACT III · TATOOINE', 'THE OUTER RIM', 'Count Dooku has turned the desert peoples against the Republic.'], 1.2, 4.6, true);
      },
      update: (t, k, dt) => {
        // a beat of empty stars, then the ship tears out of lightspeed and coasts to a stop
        const ta = t - 0.9;
        if (ta < 0) S.position.z = -4200;
        else if (ta < 0.32) {
          const e = ta / 0.32;
          S.position.z = -4200 + 4200 * (1 - (1 - e) ** 3);
          S.scale.set(1, 1, 1 + 24 * (1 - e));
          sp.streaks.visible = true;
          sp.streaks.position.copy(S.position);
          sp.streaks.material.opacity = 1;
          if (!this.arrived) { this.arrived = true; G.sound.hyperspace(); }
        } else {
          S.scale.set(1, 1, 1);
          S.position.z = 4 * (ta - 0.32);
          sp.streaks.material.opacity = Math.max(0, 1 - (ta - 0.32) * 2.2);
          sp.streaks.position.copy(S.position).add(_a.set(0, 0, -200 * (ta - 0.32)));
          if (sp.streaks.material.opacity <= 0) sp.streaks.visible = false;
        }
        const fk = ta > 0 ? Math.max(0, 1 - Math.abs(ta - 0.3) / 0.35) : 0;
        sp.flash.position.copy(S.position).add(_a.set(0, 0, 90));
        sp.flash.material.opacity = fk * 0.7;
        sp.flash.scale.setScalar(60 + fk * 100);
        // high off the port side, looking down past the ship at the curve of the planet
        cam.position.set(-130 + t * 5, 150 - t * 3, 260 - t * 9);
        this.look.set(0, -40, -40);
        cam.lookAt(this.look);
        sp.frame(cam);
      },
    });
    // orbit 2: the gunship drops out of the hangar and dives for the planet
    beats.push({
      dur: 4.4, fov: 55,
      enter: () => {
        SL.visible = true;
        S.updateMatrixWorld();
        SL.position.copy(S.localToWorld(_a.copy(S.userData.anchors.hangar)));
        SL.rotation.set(0, 0, 0);
        G.sound.flyby(G.camera.position, 0.8);
      },
      update: (t, k, dt) => {
        S.position.z += 4 * dt;
        const e = smooth(k);
        S.updateMatrixWorld();
        const h = S.localToWorld(_a.copy(S.userData.anchors.hangar));
        SL.position.set(h.x + 10 * e, h.y - 6 - 260 * e * e, h.z + 30 + 170 * e);
        SL.rotation.set(0.15 + 0.55 * e, 0.1 * e, -0.25 * Math.sin(k * Math.PI));
        // from low beside the belly as it falls out of the hangar, round behind it as it dives for the planet
        _b.copy(S.position).add(_a.set(-42, -12, 44));
        _c.copy(SL.position).add(_a.set(-14, 14, -30));
        cam.position.lerpVectors(_b, _c, e);
        this.look.copy(SL.position).add(_a.set(0, -14 * e, 10 * e));
        cam.lookAt(this.look);
        sp.frame(cam);
      },
    });
    // orbit 3: into the atmosphere, the hull glowing, and down to the dunes
    beats.push({
      dur: 2.6, fov: 62,
      update: (t, k, dt) => {
        SL.position.y -= (120 + 260 * k) * dt;
        SL.position.z += 90 * dt;
        SL.rotation.set(0.7, 0.1, Math.sin(t * 9) * 0.03);
        SL.updateMatrixWorld();
        // above and behind, looking steeply down past the gunship at the dune seas rushing up
        cam.position.copy(SL.position).add(_a.set(-5 + Math.sin(t * 40) * 0.12 * k, 15, -15));
        this.look.copy(SL.position).add(_b.set(0, -15, 12));
        cam.lookAt(this.look);
        // the plasma sheath building round the nose
        sp.flash.material.opacity = 0.3 + 0.6 * k;
        sp.flash.material.color.setRGB(3, 1.3 + 0.4 * k, 0.6);
        sp.flash.position.copy(SL.localToWorld(_a.set(0, -0.5, 9.5)));
        sp.flash.scale.setScalar(9 + 15 * k);
        sp.frame(cam);
        if (k > 0.72 && !this.whited) { this.whited = true; G.hud.fade(true, 500); }
      },
      exit: () => {
        sp.flash.material.color.setRGB(2.5, 2.8, 3.5);
        sp.flash.material.opacity = 0;
        G.renderPass.scene = G.scene;
        G.hud.fade(false, 900);
      },
    });
    // 0: low over the dunes under the twin suns
    beats.push({
      dur: 7,
      update: (t, k) => {
        const e = smooth(k);
        _a.copy(this.LAND).setY(this.LAND.y + 16);
        _b.lerpVectors(this.START, _a, e);
        _b.y = Math.max(_b.y, tat.H(_b.x - this.gp.x, _b.z - this.gp.z) + 6);
        this.placeLaat(_b, Math.atan2(_a.x - this.START.x, _a.z - this.START.z) + (landYaw - Math.atan2(_a.x - this.START.x, _a.z - this.START.z)) * e * e);
        this.laat.rotation.z = Math.sin(t * 0.8) * 0.05;
        this.laat.rotation.x = -0.08 * (1 - k);
        G.camera.position.copy(this.laat.position).add(this.gp).add(_c.set(-14 + 5 * k, 5 - 2 * k, -18 + 8 * k));
        this.look.copy(this.laat.position).add(this.gp).add(_c.set(0, 2, 0));
        G.camera.lookAt(this.look);
      },
    });
    // 1: settling onto the landing zone in a storm of dust
    beats.push({
      dur: 4.4,
      update: (t, k) => {
        _a.copy(this.LAND).setY(this.LAND.y + 16);
        _b.lerpVectors(_a, this.LAND, smooth(Math.min(1, k * 1.25)));
        this.placeLaat(_b, landYaw);
        this.laat.rotation.x = 0.05 * Math.sin(k * Math.PI);
        this.laat.rotation.z = 0;
        if (k > 0.55 && !this.dusted) { this.dusted = true; G.fx.dust(this.LAND, 50, 2.6); G.sound.thump(this.LAND); }
        if (k > 0.3 && Math.random() < 0.5) G.fx.dust(_c.copy(this.LAND).add(_a.set((Math.random() - 0.5) * 10, 0, (Math.random() - 0.5) * 12)), 3, 1.6);
        this.shot(W(8, 34).setY(tat.H(8, 34) + 1.5), W(6, 36).setY(tat.H(6, 36) + 1.7), _a.copy(_b).setY(_b.y + 2), _c.copy(this.LAND).setY(this.LAND.y + 2.4), k);
      },
    });
    // 2: on the ridge to the north, Jawas and Tuskens stand together
    beats.push({
      dur: 3.6, fov: 26, line: ['fox', "There they are. Jawas and Sand People, side by side, just like the garrison said."],
      update: (t, k) => {
        // low on the dune slope in front of them, looking up at the line of them against the sky
        const toFarm = _a.subVectors(this.LAND, ridge).setY(0).normalize(), side = _b.set(toFarm.z, 0, -toFarm.x);
        const at = (d, s, h) => { const p = ridge.clone().addScaledVector(toFarm, d).addScaledVector(side, s); p.y = tat.H(p.x - this.gp.x, p.z - this.gp.z) + h; return p; };
        this.shot(at(22, -4, 1.0), at(17, -2, 1.1), ridge.clone().addScaledVector(side, -1.5).setY(ridge.y + 1.4), ridge.clone().addScaledVector(side, 1.2).setY(ridge.y + 1.3), k);
      },
    });
    beats.push({
      dur: 3, fov: 25, line: ['cody', "They're moving like a drilled unit. That's Dooku's hand on them."],
      update: (t, k) => this.face(G.chars.cody, k, { dist: 2.1, ang: 0.42, dy: 0.0 }, { dist: 1.9, ang: 0.38, dy: -0.02 }),
    });
    beats.push({
      dur: 3, fov: 30, line: ['yoda', 'Strong, his hold on them is. Dark, and heavy. Near, Dooku is... watching us.'],
      update: (t, k) => this.face(this.yoda, k, { dist: 1.9, ang: 0.45, dy: 0.05 }, { dist: 1.65, ang: 0.4, dy: 0.04 }),
    });
    beats.push({
      dur: 3, fov: 25, line: ['gree', "Anchorhead's garrison is cut off. This farm is all that stands between that war party and the town."],
      update: (t, k) => this.face(G.chars.gree, k, { dist: 2.1, ang: 0.42, dy: 0.0 }, { dist: 1.9, ang: 0.38, dy: -0.02 }),
    });
    beats.push({
      dur: 3.4, fov: 36, line: ['yoda', 'Then hold it, we will. Draw him out, and break his grip on them.'],
      update: (t, k) => this.face(this.yoda, k, { dist: 2.35, ang: 0.8, dy: 0.24, drop: -0.1 }, { dist: 2.1, ang: 0.74, dy: 0.22, drop: -0.1 }),
    });
    return beats;
  }

  /** A line starts: the speaker talks, everyone else aboard turns to look at them (the commanders' lines go to Yoda). */
  onLine(who) {
    const G = this.G, c = { yoda: this.yoda, gree: G.chars.gree, cody: G.chars.cody, fox: G.chars.fox }[who];
    for (const ch of this.crew) if (ch !== c && ch.currentName === 'Talk') ch.play('Idle', 0.4);
    if (c) { c.play('Talk', 0.3); this.listen(c, this.crew, who === 'yoda' ? null : this.yoda); }
  }

  seat(ch, key) {
    const [x, z] = SEATS[key];
    this.laat.add(ch.group);
    ch.position.set(x, FLOOR, z);
    ch.yaw = -Math.PI / 2;
    ch.group.visible = true;
    ch.pitch = ch.twist = 0;
    ch.play('Idle', 0);
  }

  start() {
    const G = this.G;
    G.hud.letterbox(true);
    this.placeLaat(this.START, 0);
    this.yoda = new Character(G.scene, 'yoda');
    this.seat(this.yoda, 'yoda');
    this.seat(G.chars.gree, 'gree');
    this.seat(G.chars.cody, 'cody');
    this.seat(G.chars.fox, 'fox');
    this.crew.push(this.yoda, G.chars.gree, G.chars.cody, G.chars.fox);
    for (const [x, z, yaw] of TROOPERS) {
      const t = new Character(G.scene, 'clone_trooper');
      this.laat.add(t.group);
      t.position.set(x, FLOOR, z);
      t.yaw = yaw;
      t.play('Idle', 0);
      t.mixer.setTime(Math.random() * 2);
      this.crew.push(t);
      this.troopers = (this.troopers || []).concat(t);
    }
    // the war party on the ridge: Jawas and Tuskens shoulder to shoulder, looking down at the farm
    const kinds = ['tusken_melee', 'jawa', 'jawa', 'tusken_sniper', 'jawa', 'tusken_melee', 'jawa', 'tusken_melee', 'jawa', 'tusken_sniper'];
    kinds.forEach((k, i) => {
      const c = G.pool.get(k);
      const x = this.ridge.x - 11 + i * 2.4 + (Math.random() - 0.5), z = this.ridge.z + (Math.random() - 0.5) * 2;
      c.position.set(x, G.tatooine.H(x - this.gp.x, z - this.gp.z), z);
      c.yaw = Math.atan2(this.LAND.x - x, this.LAND.z - z);
      c.play('Idle', 0);
      c.mixer.setTime(Math.random() * 2);
      this.watchers.push(c);
    });
    this.enter(0);
  }

  update(dt) {
    if (this.done) return;
    this.step(dt);
    if (this.done) return;
    for (const c of this.crew) c.update(dt);
    for (const c of this.watchers) c.update(dt);
    const G = this.G;
    if (this.beatIdx >= 3 && this.beatIdx < 5 && Math.random() < 0.6) {
      for (const sx of [-1.05, 1.05]) G.fx.thruster(this.onShip(sx, 2.3, -10.4, _a), _b.set(0, 0, -1).applyQuaternion(this.laat.getWorldQuaternion(new THREE.Quaternion())), 1.2);
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
    G.renderPass.scene = G.scene;
    G.hud.fade(false, 300);
    if (this.space) { this.space.flash.material.opacity = 0; this.space.streaks.visible = false; }
    clearLooks(this.crew);
    // the gunship stays parked at the landing zone; the passengers step off
    this.laat.position.copy(this.parked.pos);
    this.laat.rotation.set(0, this.parked.rot, 0);
    for (const c of [G.chars.cody, G.chars.fox, G.chars.gree]) { G.scene.attach(c.group); c.group.rotation.set(0, 0, 0); c.group.visible = false; }
    this.laat.remove(this.yoda.group);
    for (const t of this.troopers || []) this.laat.remove(t.group);
    for (const c of this.watchers) G.pool.release(c);
    if (this.onDone) this.onDone();
  }
}

/** The end of Act III: Dooku on his knees, then gone in a storm of sand; the desert peoples wake from his spell. */
export class TatooineEnding extends Beats {
  constructor(G, dooku, onDone) {
    super(G);
    this.dooku = dooku;
    this.onDone = onDone;
    this.extras = [];
    this.beats = this.buildBeats();
  }

  buildBeats() {
    const G = this.G, d = this.dooku, p = G.player;
    const hero = G.selected === 'yoda' ? 'gree' : G.selected;
    const other = G.ally && G.ally.key !== 'yoda' && G.ally.key !== hero ? G.ally.key : hero;
    const D = () => d.pos;
    const beats = [];
    beats.push({
      dur: 3.2, fov: 34, line: ['dooku', 'You have won nothing here. The desert will forget you... but I will not.'],
      enter: () => { d.char.play('Kneel', 0.3); },
      update: (t, k) => {
        const f = _c.set(p.pos.x - D().x, 0, p.pos.z - D().z).normalize();
        this.shot(_a.copy(D()).addScaledVector(f, 2.6).add(_b.set(f.z * 1.1, 1.0, -f.x * 1.1)), _a.clone().add(_b.set(0, -0.15, 0)).addScaledVector(f, -0.3),
          _b.copy(D()).setY(D().y + 0.9), _c.copy(D()).setY(D().y + 1.0), k);
      },
    });
    beats.push({
      dur: 2.6, fov: 40,
      enter: () => {
        // he throws out a hand, and the sand rises
        d.char.play('Push', 0.1, { loop: false, restart: true });
        G.sound.ability('riot');
        G.sound.whoosh(D());
        G.fx.flash(_a.copy(D()).setY(D().y + 1), 0xffe8c0, 6, 0.4);
        G.fx.shake = 1;
      },
      update: (t, k) => {
        for (let i = 0; i < 10; i++) {
          const a = Math.random() * Math.PI * 2, r = 1 + k * 9 * Math.random();
          G.fx.smoke.emit(D().x + Math.cos(a) * r, D().y + Math.random() * (1 + k * 6), D().z + Math.sin(a) * r, Math.cos(a) * 6, 2 + Math.random() * 3, Math.sin(a) * 6,
            2.5, 1.2, 5, 0.62, 0.52, 0.4, 0.7, -0.3, 0.6, 0.1, 0.66, 0.56, 0.44, 1);
        }
        if (k > 0.55 && !this.storm) { this.storm = true; G.hud.fade(true, 500); }
        const f = _c.set(p.pos.x - D().x, 0, p.pos.z - D().z).normalize();
        G.camera.position.copy(D()).addScaledVector(f, 7).setY(D().y + 2.4);
        this.look.copy(D()).setY(D().y + 1.2);
        G.camera.lookAt(this.look);
      },
    });
    beats.push({
      dur: 2.4, fov: 50, line: [hero, "He's gone! Where did he go?"],
      enter: () => {
        // when the dust clears, the Count has vanished
        d.char.group.visible = false;
        d.removed = true;
        G.hud.fade(false, 900);
        G.sound.flyby(_a.copy(D()).setY(D().y + 60), 0.8);
        this.placeYoda();
      },
      update: (t, k) => {
        this.shot(_a.copy(p.pos).add(_b.set(2.8, 1.8, 3.4)), _a.clone().add(_b.set(0.6, 0.2, 0.4)), _b.copy(D()).setY(D().y + 1.2), _c.copy(D()).setY(D().y + 1.6), k);
      },
    });
    beats.push({
      dur: 3, fov: 34, line: ['yoda', 'Fled, he has. But broken, his hold on them is. Free, their minds are.'],
      enter: () => this.yoda.play('Talk', 0.3),
      update: (t, k) => this.face(this.yoda, k, { dist: 1.9, ang: 0.42, dy: 0.08 }, { dist: 1.7, ang: 0.36, dy: 0.06 }),
    });
    beats.push({
      dur: 3.6, fov: 38, line: ['jawa', 'Utinni! Utinni!'],
      enter: () => { this.yoda.play('Idle', 0.4); this.spawnExtras(); G.sound.jawaChatter(G.tatooine.rampFoot, 0.6); },
      update: (t, k) => {
        const r = G.tatooine.rampFoot;
        this.shot(_a.set(r.x - 14, r.y + 3, r.z + 22), _a.clone().add(_b.set(2, 0.3, -2)), _b.set(r.x, r.y + 1.5, r.z - 4), _c.set(r.x, r.y + 3, r.z - 8), k);
      },
    });
    beats.push({
      dur: 3, fov: 34, line: [other, "Look at them. It's like they're waking up from a bad dream."],
      enter: () => { G.chars[other].lookTarget = G.tatooine.rampFoot; G.chars[other].play('Talk', 0.3); },
      update: (t, k, dt) => {
        // he turns to watch the Jawas go, and the camera finds his face
        const c = G.chars[other], r = G.tatooine.rampFoot;
        c.yaw = dampAngle(c.yaw, Math.atan2(r.x - c.position.x, r.z - c.position.z), 3, dt);
        this.face(c, k, { dist: 2.3, ang: 0.62, dy: 0.02 }, { dist: 2.0, ang: 0.56, dy: 0.0 });
      },
    });
    beats.push({
      dur: 4, fov: 32, line: ['yoda', 'To Coruscant we return. Warn the Council, we must. Long, this war still is.'],
      enter: () => { G.chars[other].play('Idle', 0.4); G.chars[other].lookTarget = this.yoda; this.yoda.play('Talk', 0.3); },
      update: (t, k, dt) => {
        const mate = G.selected === 'yoda' ? G.ally && G.ally.char : p.char, y = this.yoda;
        if (!mate) { this.face(y, k, { dist: 2.6, ang: 0.5, dy: 0.4, drop: -0.2 }, { dist: 2.3, ang: 0.45, dy: 0.35, drop: -0.2 }); return; }
        y.yaw = dampAngle(y.yaw, yawTo(mate.position.x - y.position.x, mate.position.z - y.position.z), 4, dt);
        mate.yaw = dampAngle(mate.yaw, yawTo(y.position.x - mate.position.x, y.position.z - mate.position.z), 3, dt);
        y.lookTarget = mate;
        mate.lookTarget = y;
        this.face(y, k, { dist: 2.5, ang: 0.8, dy: 0.32, drop: -0.12 }, { dist: 2.25, ang: 0.74, dy: 0.28, drop: -0.12 });
      },
      exit: () => G.hud.fade(true, 400),
    });
    this.homeBeats(beats);
    return beats;
  }

  // ---- home: everyone aboard the gunship, up out of the dust, and the order that was waiting for them in orbit
  homeBeats(beats) {
    const G = this.G, tat = G.tatooine, gp = tat.group.position, L = tat.laat;
    const onShip = (x, y, z) => { L.updateMatrixWorld(); return L.localToWorld(new THREE.Vector3(x, y, z)); };
    const head = (key) => { const [x, z] = SEATS[key]; return onShip(x, FLOOR + (key === 'yoda' ? 0.6 : 1.62), z); };
    // a close-up through the open side of the bay, on whoever is speaking
    const face = (key, k) => {
      const c = this.seated[key];
      if (key === 'yoda') this.face(c, k, { dist: 1.9, ang: 0.45, dy: 0.05 }, { dist: 1.65, ang: 0.4, dy: 0.04 });
      else this.face(c, k, { dist: 2.1, ang: 0.42, dy: 0.0 }, { dist: 1.9, ang: 0.38, dy: -0.02 });
    };
    const talk = (key) => {
      for (const [k, c] of Object.entries(this.seated || {})) c.play(k === key ? 'Talk' : 'Idle', 0.3);
      if (key) this.listen(this.seated[key], [...Object.values(this.seated), ...this.troopers], key === 'yoda' ? null : this.seated.yoda);
    };
    // high over the planet, turned so the close-ups (from the open port side) look away from the suns
    const awayYaw = Math.atan2(TAT_SUN.z, -TAT_SUN.x);
    const high = () => { const p = this.parked; L.position.set(p.pos.x, p.pos.y + 900, p.pos.z); L.rotation.set(-0.05, awayYaw, Math.sin(G.time * 0.7) * 0.02); };
    // up off the farm
    beats.push({
      dur: 5.2, fov: 50,
      enter: () => { this.board(); G.hud.fade(false, 800); G.sound.flyby(this.ground, 1.0); },
      update: (t, k) => {
        const p = this.parked, e = smooth(Math.min(1, k * 1.1));
        L.position.set(p.pos.x, p.pos.y + 3 * Math.min(1, k * 3) + 22 * e * e, p.pos.z);
        L.rotation.set(-0.14 * e, p.rot + 0.6 * e, Math.sin(t * 1.3) * 0.03);
        if (k < 0.5 && Math.random() < 0.6) G.fx.dust(new THREE.Vector3(this.ground.x + (Math.random() - 0.5) * 10, this.ground.y, this.ground.z + (Math.random() - 0.5) * 12), 3, 1.8);
        this.thrust();
        const lw = L.position.clone().add(gp);
        this.shot(this.camA, this.camB, this.ground.clone().setY(this.ground.y + 3), lw.setY(lw.y + 2), k);
      },
    });
    // climbing hard for the sky
    beats.push({
      dur: 3.0, fov: 50,
      update: (t, k, dt) => {
        const p = this.parked, e = k * k, yaw = p.rot + 0.6;
        L.position.set(p.pos.x + Math.sin(yaw) * 150 * e, p.pos.y + 25 + 240 * e, p.pos.z + Math.cos(yaw) * 150 * e);
        L.rotation.set(-0.55 * Math.min(1, k * 2), yaw, 0);
        this.thrust();
        this.look.copy(L.position).add(gp);
        if (!this.chaseCam) this.chaseCam = this.camB.clone();
        _c.set(-Math.sin(yaw) * 22, 6, -Math.cos(yaw) * 22).add(this.look);
        this.chaseCam.lerp(_c, 1 - Math.exp(-dt * 3.5));
        G.camera.position.copy(this.chaseCam);
        G.camera.lookAt(this.look);
        if (k > 0.82 && !this.cut) { this.cut = true; G.hud.fade(true, 300); }
      },
    });
    // high above the planet: the comm chimes, and a recording plays
    beats.push({
      dur: 5.0, fov: 40, line: ['clonecmd', 'Priority recording, to all units of the Grand Army. Order 66 is now in effect. The Jedi Order has betrayed the Republic.'],
      enter: () => {
        high();
        G.hud.fade(false, 500);
        G.sound.tone([1320, 990, 1320], 0.09, 'square', 0.1, 0.12);
        G.sound.radio(true);
        this.holo.on = true;
        talk(null);
        for (const c of [...Object.values(this.seated), ...this.troopers]) c.lookTarget = this.holo.char;
      },
      update: (t, k) => {
        high();
        this.shot(onShip(-2.9, FLOOR + 1.35, 0.85), onShip(-2.6, FLOOR + 1.3, 1.05), onShip(-0.35, FLOOR + 0.78, 2.2), onShip(-0.3, FLOOR + 0.8, 2.25), k);
      },
    });
    beats.push({
      dur: 3.8, fov: 36, line: ['clonecmd', 'Every Jedi is to be executed. No exceptions. Command out.'],
      enter: () => { this.holo.glitch = 1.5; },
      update: (t, k, dt) => {
        high();
        // the troopers' heads turn, one by one, toward Master Yoda
        const [yx, yz] = SEATS.yoda;
        this.troopers.forEach((tr, i) => {
          if (k * 5 < i * 0.6) return;
          tr.lookTarget = this.seated.yoda;
          const want = Math.atan2(yx - tr.position.x, yz - tr.position.z);
          tr.yaw += (want - tr.yaw) * (1 - Math.exp(-dt * 1.5));
        });
        if (k > 0.5) for (const key of ['cody', 'fox', 'gree']) this.seated[key].lookTarget = this.seated.yoda;
        this.shot(onShip(-0.42, FLOOR + 1.55, 2.55), onShip(-0.35, FLOOR + 1.6, 2.45), onShip(0.15, FLOOR + 1.45, -2.6), onShip(0.1, FLOOR + 1.5, -2.6), k);
        if (k > 0.85 && this.holo.on) { this.holo.on = false; G.sound.radio(false); }
      },
    });
    beats.push({
      dur: 3.6, fov: 30, line: ['cody', "That message is two days old. The storms down there jammed everything. It never reached us."],
      enter: () => talk('cody'),
      update: (t, k) => { high(); face('cody', k); },
    });
    beats.push({
      dur: 2.4, fov: 30, line: ['gree', 'Execute... Master Yoda?'],
      enter: () => talk('gree'),
      update: (t, k) => { high(); face('gree', k); },
    });
    beats.push({
      dur: 4.6, fov: 30, line: ['fox', "Weapons down, all of you. I don't know what happened on Coruscant. But I know what I saw out there, and I'm not shooting him."],
      enter: () => talk('fox'),
      update: (t, k) => { high(); face('fox', k); },
    });
    beats.push({
      dur: 1.8, fov: 30, line: ['cody', 'Neither am I.'],
      enter: () => talk('cody'),
      update: (t, k) => { high(); face('cody', k); },
    });
    beats.push({
      dur: 2.6, fov: 30, line: ['gree', 'The 41st stands with the General.'],
      enter: () => {
        talk('gree');
        // and the troopers settle back: nobody is raising a rifle
        for (const tr of this.troopers) tr.play('Idle', 0.4);
      },
      update: (t, k) => { high(); face('gree', k); },
    });
    beats.push({
      dur: 5.4, fov: 32, line: ['yoda', 'Spare me, you would. Grateful, I am. But hunted, you will be, for this. Still... to the Council I must go. Learn what has happened, I must.'],
      enter: () => talk('yoda'),
      update: (t, k) => { high(); face('yoda', k); },
      exit: () => G.hud.fade(true, 400),
    });
    // into the assault ship's belly, over the curve of Tatooine
    const sp = spaceScene(), S = sp.ship, SL = sp.laat;
    beats.push({
      dur: 5.4, fov: 46,
      enter: () => {
        sp.setPlanet('tatooine');
        G.renderPass.scene = sp.scene;
        S.position.set(0, 0, 0); S.rotation.set(0, 0, 0); S.scale.set(1, 1, 1);
        SL.visible = true;
        G.hud.fade(false, 600);
      },
      update: (t, k, dt) => {
        S.position.z += 3 * dt;
        S.updateMatrixWorld();
        const h = S.localToWorld(new THREE.Vector3().copy(S.userData.anchors.hangar));
        const e = smooth(k);
        SL.position.set(h.x + 70 * (1 - e), h.y - 230 * (1 - e) * (1 - e) - 4 * (1 - e), h.z + 150 * (1 - e));
        SL.rotation.set(-0.5 * (1 - e), -0.35 * (1 - e), 0.15 * Math.sin(k * Math.PI));
        if (k > 0.94) SL.visible = false;
        // far enough out to hold both the ship and the gunship rising toward it, easing in as it docks
        G.camera.position.copy(S.position).add(_a.set(-256, -98, 202).lerp(_b.set(-110, -30, 95), smooth(k)));
        this.look.copy(SL.position).lerp(S.position, 0.5).lerp(h, smooth(k));
        G.camera.lookAt(this.look);
        sp.frame(G.camera);
      },
    });
    // and away: the assault ship stretches into hyperspace, for Coruscant
    beats.push({
      dur: 5.2, fov: 46,
      enter: () => {
        SL.visible = false;
        G.hud.titleCard(['ACT III COMPLETE', 'NEXT · ACT IV: ORDER 66', 'The order has been given. Three commanders have refused it.'], 1.0, 4.0, true);
      },
      update: (t, k, dt) => {
        const tj = t - 1.4;
        if (tj < 0) S.position.z += 3 * dt;
        else {
          const e = Math.min(1, tj / 0.45);
          S.scale.set(1, 1, 1 + 26 * e);
          S.position.z += (60 + 9000 * e * e) * dt;
          if (!this.jumped) { this.jumped = true; G.sound.hyperspace(); }
          const fk = Math.max(0, 1 - Math.abs(tj - 0.4) / 0.35);
          sp.flash.material.opacity = fk * 0.8;
          sp.flash.position.copy(S.position);
          sp.flash.scale.setScalar(80 + fk * 140);
          if (tj > 0.6) S.visible = false;
        }
        G.camera.position.set(-170, 60, -150);
        this.look.set(0, -20, 60);
        G.camera.lookAt(this.look);
        sp.frame(G.camera);
      },
    });
  }

  /** Everyone into the parked gunship's bay: Yoda, the three commanders, a squad of the 41st, and a holoprojector. */
  board() {
    const G = this.G, tat = G.tatooine, L = tat.laat, gp = tat.group.position;
    this.parked = { pos: L.position.clone(), rot: L.rotation.y };
    this.ground = L.position.clone().add(gp);
    this.camA = this.ground.clone().add(new THREE.Vector3(18, 1.6, 20));
    this.camB = this.ground.clone().add(new THREE.Vector3(15, 2.2, 17));
    this.seated = { yoda: this.yoda, gree: G.chars.gree, cody: G.chars.cody, fox: G.chars.fox };
    for (const [key, ch] of Object.entries(this.seated)) {
      const [x, z] = SEATS[key];
      L.add(ch.group);
      ch.group.rotation.set(0, 0, 0);
      ch.position.set(x, FLOOR, z);
      ch.yaw = -Math.PI / 2;
      ch.pitch = ch.twist = 0;
      ch.group.visible = true;
      ch.play('Idle', 0);
    }
    this.troopers = TROOPERS.map(([x, z, yaw]) => {
      const t = new Character(G.scene, 'clone_trooper');
      L.add(t.group);
      t.position.set(x, FLOOR, z);
      t.yaw = yaw;
      t.play('Idle', 0);
      t.mixer.setTime(Math.random() * 2);
      return t;
    });
    this.holo = makeHologram(G, L, new THREE.Vector3(0, FLOOR, 2.65), { scale: 0.5, yaw: Math.PI });
    // the playable Yoda puts his blade away aboard (lit, that close to the camera, it blooms out the shot)
    for (const m of this.yoda.materials) if (/^Saber/.test(m.name)) m.visible = false;
  }

  thrust() {
    const G = this.G, L = G.tatooine.laat;
    if (Math.random() > 0.7) return;
    L.updateMatrixWorld();
    const q = L.getWorldQuaternion(_q);
    for (const sx of [-1.05, 1.05]) G.fx.thruster(L.localToWorld(_a.set(sx, 2.3, -10.4)), _b.set(0, 0, -1).applyQuaternion(q), 1.3);
  }

  /** Yoda stands by the hero for the closing lines (the playable Yoda if you led with him). */
  placeYoda() {
    const G = this.G, p = G.player;
    if (G.selected === 'yoda') { this.yoda = G.chars.yoda; return; }
    this.yoda = this.ownYoda = new Character(G.scene, 'yoda');
    const s = Math.sin(p.camYaw), c = Math.cos(p.camYaw);
    this.yoda.position.set(p.pos.x + c * 1.4 + s * 0.6, p.pos.y, p.pos.z - s * 1.4 + c * 0.6);
    const g = G.world.groundAt(this.yoda.position.x, this.yoda.position.z, p.pos.y + 1, 0.3);
    if (g > -1e9) this.yoda.position.y = g;
    this.yoda.yaw = Math.atan2(this.dooku.pos.x - this.yoda.position.x, this.dooku.pos.z - this.yoda.position.z);
    this.yoda.play('Idle', 0);
  }

  /** Jawas trooping back up the sandcrawler's ramp, Tuskens walking off into the dunes. */
  spawnExtras() {
    const G = this.G, tat = G.tatooine;
    for (let i = 0; i < 4; i++) {
      const c = G.pool.get('jawa');
      c.position.copy(tat.rampFoot).add(_a.set(-2 + i * 1.3, 0, 4 + i * 1.6));
      c.yaw = Math.PI;
      c.play('Run', 0, { timeScale: 0.7 });
      this.extras.push({ c, kind: 'jawa', speed: 1.8 + Math.random() * 0.5 });
    }
    for (let i = 0; i < 3; i++) {
      const c = G.pool.get(i === 1 ? 'tusken_sniper' : 'tusken_melee');
      const x = tat.rampFoot.x - 40 + i * 3, z = tat.rampFoot.z + 12;
      c.position.set(x, tat.H(x - tat.group.position.x, z - tat.group.position.z), z);
      c.yaw = Math.PI;
      c.play('Run', 0, { timeScale: 0.45 });
      this.extras.push({ c, kind: 'tusken', speed: 1.3 });
    }
  }

  start() {
    const G = this.G;
    G.hud.letterbox(true);
    this.enter(0);
  }

  update(dt) {
    if (this.done) return;
    const G = this.G, tat = G.tatooine;
    this.step(dt);
    if (this.done) return;
    const chars = new Set([this.yoda, G.player && G.player.char, G.ally && G.ally.char, ...Object.values(this.seated || {}), ...(this.troopers || [])]);
    for (const c of chars) if (c) c.update(dt);
    if (this.holo) this.holo.update(dt);
    for (const e of this.extras) {
      const c = e.c;
      if (e.kind === 'jawa') {
        // up the ramp and into the dark
        c.position.z -= e.speed * dt;
        const top = tat.rampTop, foot = tat.rampFoot;
        const k = clamp((foot.z - c.position.z) / (foot.z - top.z), 0, 1);
        c.position.y = c.position.z > foot.z ? tat.H(c.position.x - tat.group.position.x, c.position.z - tat.group.position.z) : foot.y + (top.y - foot.y) * k;
        if (c.position.z < top.z + 0.5) c.group.visible = false;
      } else {
        c.position.z -= e.speed * dt;
        c.position.y = tat.H(c.position.x - tat.group.position.x, c.position.z - tat.group.position.z);
      }
      c.update(dt);
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
    this.dooku.removed = true;
    this.dooku.char.group.visible = false;
    // back from orbit (if the trip home was playing)
    const sp = spaceScene();
    G.renderPass.scene = G.scene;
    sp.flash.material.opacity = 0;
    sp.streaks.visible = false;
    sp.ship.visible = true;
    sp.ship.scale.set(1, 1, 1);
    sp.laat.visible = false;
    G.hud.titleCard(null);
    clearLooks([...Object.values(this.seated || {}), ...(this.troopers || []), G.player && G.player.char, G.ally && G.ally.char, this.yoda]);
    if (this.parked) {
      const L = G.tatooine.laat;
      L.position.copy(this.parked.pos);
      L.rotation.set(0, this.parked.rot, 0);
      for (const t of this.troopers || []) L.remove(t.group);
      if (this.holo) this.holo.dispose();
      for (const k of ['cody', 'fox', 'gree', 'yoda']) { const c = G.chars[k]; G.scene.attach(c.group); c.group.rotation.set(0, 0, 0); c.group.visible = false; }
      for (const m of G.chars.yoda.materials) if (/^Saber/.test(m.name)) m.visible = true;
      // behind the victory screen: the farm, the gunship back on its pad
      const W = G.tatooine.W;
      G.camera.position.copy(W(34, 68)).setY(G.tatooine.H(34, 68) + 9);
      G.camera.lookAt(W(-2, 22).setY(2));
    }
    if (this.ownYoda) { if (this.ownYoda.group.parent) this.ownYoda.group.parent.remove(this.ownYoda.group); }
    for (const e of this.extras) G.pool.release(e.c);
    if (this.onDone) this.onDone();
  }
}

/**
 * Wave 7: Count Dooku arrives. He is first seen on the roof of the sandcrawler, leaps down onto the sand in
 * front of the farm, salutes with his blade and says his piece; then the duel begins.
 */
export class DookuEntrance extends Beats {
  constructor(G, dooku, onDone) {
    super(G);
    this.dooku = dooku;
    this.onDone = onDone;
    const tat = G.tatooine, W = tat.W;
    this.roof = tat.crawlerRoof.clone().add(_a.set(-4.6, 0, 3.0));
    {
      const p = G.player.pos, dx = this.roof.x - p.x, dz = this.roof.z - p.z, l = Math.hypot(dx, dz) || 1, b = G.arena.bounds;
      this.land = new THREE.Vector3(Math.min(b.maxX - 3, Math.max(b.minX + 3, p.x + (dx / l) * 9)), 0, Math.min(b.maxZ - 3, Math.max(b.minZ + 3, p.z + (dz / l) * 9)));
      for (let i = 0; i < 12; i++) {
        let free = true;
        for (const bx of G.world.boxes) {
          if (!bx.move || bx.max.y < 0.5 || bx.min.y > 3) continue;
          if (this.land.x > bx.min.x - 1 && this.land.x < bx.max.x + 1 && this.land.z > bx.min.z - 1 && this.land.z < bx.max.z + 1) { free = false; break; }
        }
        if (free) break;
        this.land.x += (dx / l) * 1.5; this.land.z += (dz / l) * 1.5;
      }
      this.land.y = tat.H(this.land.x - tat.group.position.x, this.land.z - tat.group.position.z);
    }
    this.keyLight = true;
    const yoda = G.selected === 'yoda';
    const hero = G.selected;
    const lines = yoda
      ? [['dooku', 'Master Yoda. You came all this way... for sand people and scavengers?'], ['yoda', 'Release them, you will, Dooku.'], ['dooku', 'They serve a greater purpose now. As will you.']]
      : [['dooku', 'Commander. Your Jedi send clones to do their fighting. As always.'], [hero, 'Count Dooku. Let them go.'], ['dooku', 'They serve a greater purpose now. Kneel, or be buried in the sand.']];
    const D = () => this.dooku.pos;
    const cam = () => G.player.pos;
    this.beats = [
      {
        dur: 2.0, fov: 22, line: [yoda ? 'gree' : hero, 'Up there! On the sandcrawler!'],
        enter: () => { this.dooku.char.play('Idle', 0); },
        update: (t, k) => {
          // up level with the deck, out in front of him: the Count against the sky, the farm below
          const dx = cam().x - this.roof.x, dz = cam().z - this.roof.z, l = Math.hypot(dx, dz) || 1, fx = dx / l, fz = dz / l;
          const r = this.roof;
          this.shot(_a.set(r.x + fx * 12 - fz * 3.4, r.y + 1.0, r.z + fz * 12 + fx * 3.4), _b.set(r.x + fx * 9.5 - fz * 2.6, r.y + 1.15, r.z + fz * 9.5 + fx * 2.6),
            _c.copy(D()).setY(D().y + 1.3), D().clone().setY(D().y + 1.4), k);
        },
      },
      {
        dur: 2.3, fov: 46,
        enter: () => { this.dooku.char.play('Swing3', 0.1, { loop: false, restart: true, timeScale: 0.6 }); G.sound.whoosh(this.roof); this.from = D().clone(); },
        update: (t, k, dt) => {
          const e = smooth(k);
          D().lerpVectors(this.from, this.land, e);
          D().y += Math.sin(k * Math.PI) * 14 * (1 - k * 0.3);
          this.dooku.yaw = Math.atan2(this.land.x - this.from.x, this.land.z - this.from.z);
          this.dooku.char.yaw = this.dooku.yaw;
          if (Math.random() < 0.6) G.fx.smokePuff(_a.copy(D()).setY(D().y + 0.5), 0.4, 0.45);
          // low beside the landing spot, looking up as he comes down out of the sky
          this.look.copy(D()).setY(D().y + 1);
          { const dx = this.land.x - this.from.x, dz = this.land.z - this.from.z, l = Math.hypot(dx, dz) || 1; G.camera.position.set(this.land.x + (dx / l) * 5 - (dz / l) * 6, this.land.y + 1.2, this.land.z + (dz / l) * 5 + (dx / l) * 6); }
          G.camera.lookAt(this.look);
          if (k >= 1 && !this.landed) {
            this.landed = true;
            G.fx.dust(D(), 26, 1.6);
            G.fx.ring(_a.set(D().x, D().y + 0.15, D().z), 8, 0.45, 0xd8c09a);
            G.sound.thump(D());
          }
        },
      },
      ...lines.map(([who, text], i) => ({
        dur: 2.4, fov: who === 'dooku' ? 30 : 36, line: [who, text],
        enter: () => {
          const p = G.player;
          this.dooku.yaw = Math.atan2(p.pos.x - D().x, p.pos.z - D().z);
          this.dooku.char.yaw = this.dooku.yaw;
          if (who === 'dooku') this.dooku.char.play(i === 0 ? 'Salute' : 'Talk', 0.2, { loop: i !== 0, restart: true });
          else { this.dooku.char.play('Idle', 0.3); G.player.char.play(G.player.cfg.melee ? 'Talk' : 'Idle', 0.3); }
        },
        update: (t, k) => {
          const p = G.player;
          if (who === 'dooku') {
            const f = _c.set(p.pos.x - D().x, 0, p.pos.z - D().z).normalize();
            this.shot(_a.copy(D()).addScaledVector(f, 3.4).add(_b.set(f.z * 1.2, 1.7, -f.x * 1.2)), _a.clone().addScaledVector(f, -0.4),
              _b.copy(D()).setY(D().y + 1.6), _c.copy(D()).setY(D().y + 1.65), k);
          } else {
            const f = _c.set(D().x - p.pos.x, 0, D().z - p.pos.z).normalize(), hy = p.cfg.height || 1.75;
            this.shot(_a.copy(p.pos).addScaledVector(f, 2.6).add(_b.set(f.z * 1.0, hy * 0.85, -f.x * 1.0)), _a.clone().addScaledVector(f, -0.3),
              _b.copy(p.pos).setY(p.pos.y + hy * 0.85), _c.copy(p.pos).setY(p.pos.y + hy * 0.87), k);
          }
        },
      })),
    ];
  }

  start() {
    const G = this.G;
    G.hud.letterbox(true);
    this.dooku.pos.copy(this.roof);
    this.dooku.yaw = Math.atan2(this.land.x - this.roof.x, this.land.z - this.roof.z);
    this.dooku.char.yaw = this.dooku.yaw;
    this.enter(0);
  }

  update(dt) {
    this.step(dt);
    const G = this.G;
    if (G.player) G.player.char.update(dt);
    if (G.ally) G.ally.char.update(dt);
  }

  finish() {
    if (this.done) return;
    this.done = true;
    const G = this.G;
    G.voice.stop();
    G.hud.subtitle(null);
    G.hud.letterbox(false);
    if (!this.landed) { this.dooku.pos.copy(this.land); G.fx.dust(this.land, 20, 1.4); }
    if (this.onDone) this.onDone();
  }
}
