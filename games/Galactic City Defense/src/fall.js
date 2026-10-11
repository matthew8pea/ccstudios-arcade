import * as THREE from 'three';
import { clamp, lerp, smooth, easeInOut, dampAngle, yawTo, rand } from './util.js';
import { STREET_Y, LANDING } from './street.js';
import { ShotMixin, clearLooks, otsCam } from './beats.js';

const LINES = [
  { who: 'fox', text: 'Rocket droids! Incoming!' },
  { who: 'cody', text: 'Fox!' },
  { who: 'cody', text: 'Fox... you still with me?' },
  { who: 'fox', text: 'Barely. Where are we?' },
  { who: 'cody', text: 'The lower levels. And look at all these civilians.' },
  { who: 'fox', text: 'Then nothing gets past us. Here they come!' },
];
const lineDur = (i) => clamp(0.064 * LINES[i].text.length + 1.1, 1.4, 8.5);

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const Y = STREET_Y;
const CODY_EDGE = V(-1.6, 0, 44.2), FOX_EDGE = V(1.8, 0, 43.6);
const LX = LANDING.x; // the market stall on the promenade they crash through
// they come down through the front of the stall's canopy and land on the street side of its counter
const CODY_LAND = V(LX + 1.9, Y, LANDING.z + 1.4), FOX_LAND = V(LX + 2.4, Y, LANDING.z - 1.3);
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _m = new THREE.Vector3();
const _d = new THREE.Vector3();
const _c = new THREE.Vector3();

/**
 * One of the late waves: mid-firefight, two rocket droids ram Cody and Fox and blast them off the
 * tower. They fall to the lower-level streets, and the battle carries on down there.
 */
export class FallCutscene {
  constructor(G, onDone) {
    this.G = G;
    this.onDone = onDone;
    this.beatIdx = -1;
    this.bt = 0;
    this.quiet = 0;
    this.done = false;
    this.look = new THREE.Vector3();
    this.droids = [];
    this.vel = { cody: new THREE.Vector3(), fox: new THREE.Vector3() };
    this.spin = { cody: 0, fox: 0 };
    this.from = { cody: new THREE.Vector3(), fox: new THREE.Vector3() };
    this.beats = this.buildBeats();
  }

  line(i) {
    const L = LINES[i];
    this.G.hud.subtitle(L.who === 'cody' ? 'CODY' : 'FOX', L.text, lineDur(i));
    this.G.speak(L.text, L.who);
  }

  cam(pos, look) { this.G.camera.position.copy(pos); this.look.copy(look); this.G.camera.lookAt(this.look); }

  shot(pa, pb, la, lb, k) {
    const e = easeInOut(k);
    this.G.camera.position.lerpVectors(pa, pb, e);
    this.look.lerpVectors(la, lb, e);
    this.G.camera.lookAt(this.look);
  }

  /** Scripted blaster fire from a commander toward `target`. */
  fire(key, target) {
    const G = this.G, c = G.chars[key];
    const muzzle = key === 'fox' ? (Math.random() < 0.5 ? 'muzzle_L' : 'muzzle_R') : 'muzzle';
    const from = c.boneWorld(muzzle, new THREE.Vector3());
    const dir = new THREE.Vector3().subVectors(target, from).normalize();
    G.combat.fireBolt({ from, dir, speed: 120, dmg: 30, team: 'friendly', owner: 'cutscene', color: 0x3aa0ff, len: key === 'fox' ? 2 : 2.7, width: 0.14 });
    G.fx.muzzle(from, dir, 0x3aa0ff, { light: 6, smoke: key === 'cody' });
    G.sound.shot(key === 'fox' ? 'pistol' : 'rifle', from);
  }

  aim(key, target, dt) {
    const c = this.G.chars[key];
    c.yaw = dampAngle(c.yaw, yawTo(target.x - c.position.x, target.z - c.position.z), 10, dt);
    c.pitch = lerp(c.pitch, Math.atan2(target.y - (c.position.y + 1.4), Math.hypot(target.x - c.position.x, target.z - c.position.z)), 1 - Math.exp(-10 * dt));
  }

  /** Something to shoot at during the opening firefight: a live droid, or a point out on the roof. */
  targetFor(key) {
    const G = this.G, c = G.chars[key];
    let best = null, bd = 60;
    for (const e of G.enemies.list) {
      if (!e.alive || e.state === 'scripted') continue;
      const d = e.pos.distanceTo(c.position);
      if (d < bd && e.pos.z < c.position.z - 4) { bd = d; best = e; }
    }
    return best ? _a.set(best.pos.x, best.chestY, best.pos.z) : _a.set(c.position.x + rand(-8, 8), 1.2, 12);
  }

  buildBeats() {
    const G = this.G;
    const { cody, fox } = G.chars;
    const mid = (out) => out.addVectors(cody.position, fox.position).multiplyScalar(0.5);
    const beats = [];
    // 0: the firefight at the roof edge: over Cody's shoulder at the droids, then round in front of the pair
    beats.push({
      dur: 3.4, fov: 50,
      enter: () => { this.nextShot = 0; },
      update: (t, k, dt) => {
        if (t < 1.7) this.shot(V(-2.3, 1.75, 46.0), V(-2.0, 1.8, 45.7), V(1.5, 1.5, 30), V(1.0, 1.45, 30), t / 1.7);
        else this.shot(V(3.6, 1.0, 39.6), V(3.0, 1.05, 40.1), V(0.1, 1.45, 44.0), V(0.1, 1.5, 44.0), (t - 1.7) / 1.7);
        for (const key of ['cody', 'fox']) this.aim(key, this.targetFor(key), dt);
        if (t >= this.nextShot) {
          this.nextShot = t + rand(0.12, 0.2);
          const key = Math.random() < 0.5 ? 'cody' : 'fox';
          this.fire(key, _b.copy(this.targetFor(key)).add(_d.set(rand(-0.4, 0.4), rand(-0.3, 0.3), 0)));
        }
      },
    });
    // 1: two rocket droids streak in out of the sky; Cody and Fox swing round and open up on them
    beats.push({
      dur: 2.6, line: 0, fov: 46,
      enter: () => {
        this.line(0);
        this.nextShot = 0.25;
        for (const [key, start] of [['cody', V(-11, 13, 6)], ['fox', V(12, 12, 4)]]) {
          const ch = G.pool.get('b2_rocket');
          ch.group.rotation.order = 'YXZ';
          ch.play('Fly', 0);
          ch.position.copy(start);
          this.droids.push({ ch, key, start });
        }
        G.sound.whoosh(this.droids[0].start);
      },
      update: (t, k, dt) => {
        const kk = Math.min(1, k);
        for (const d of this.droids) {
          const target = G.chars[d.key].position;
          _b.set(target.x, target.y + 0.3, target.z - 0.6);
          d.ch.position.lerpVectors(d.start, _b, Math.pow(kk, 1.7));
          d.ch.yaw = yawTo(_b.x - d.start.x, _b.z - d.start.z);
          d.ch.group.rotation.x = 0.85;
          d.ch.update(dt);
          for (const bn of ['thrust_L', 'thrust_R']) {
            if (!d.ch.bones[bn]) continue;
            d.ch.bones[bn].getWorldPosition(_m);
            G.fx.thruster(_m, _d.set(0, -1, 0).applyQuaternion(d.ch.group.quaternion), 1.5);
          }
          G.fx.fireTrail(d.ch.boneWorld('chest', _m), 0.7);
        }
        // the commanders swing round and fire at them
        for (const key of ['cody', 'fox']) {
          const d = this.droids.find((x) => x.key === key);
          this.aim(key, d.ch.position, dt);
        }
        if (t >= this.nextShot) {
          this.nextShot = t + rand(0.08, 0.13);
          // each fires at the droid coming for him; most shots spark off its armour and it keeps coming
          const d = this.droids[Math.floor(Math.random() * 2)];
          const hit = Math.random() < 0.7;
          d.ch.boneWorld('chest', _b);
          if (hit) _b.add(_d.set(rand(-0.3, 0.3), rand(-0.4, 0.3), rand(-0.3, 0.3)));
          else _b.add(_d.set(rand(-1.6, 1.6), rand(-0.5, 1.8), rand(-1, 1)));
          this.fire(d.key, _b);
          if (hit) {
            const ch = d.ch, travel = _b.distanceTo(G.chars[d.key].position) / 120;
            G.after(travel, () => {
              if (!ch.group.visible || !ch.group.parent) return;
              const p = ch.boneWorld('chest', new THREE.Vector3()).add(_d.set(rand(-0.3, 0.3), rand(-0.3, 0.3), rand(-0.3, 0.3)));
              G.fx.sparks(p, _d.subVectors(G.chars[d.key].position, p).normalize(), 0xffc070, 8, 5);
              G.sound.impact(p, 'metal');
            });
          }
        }
        // low between and behind them, the droids coming in over the roof against the sky
        mid(_m);
        _a.lerpVectors(this.droids[0].ch.position, this.droids[1].ch.position, 0.5).lerp(_m.setY(1.6), 0.45);
        this.cam(_b.set(0.15, 0.95 + k * 0.25, 47.4 + k * 0.6), _a);
      },
    });
    // 2: impact - both droids detonate and the commanders are thrown over the parapet, toward a camera hanging off
    // the side of the tower
    beats.push({
      dur: 1.3, fov: 52,
      enter: () => {
        for (const d of this.droids) {
          const c = G.chars[d.key];
          _a.set(c.position.x, c.position.y + 1.2, c.position.z);
          G.fx.explosion(_a, 1.4, 0);
          G.sound.explosion(_a, 1.4);
          d.ch.group.rotation.set(0, 0, 0);
          d.ch.group.rotation.order = 'XYZ';
          G.pool.release(d.ch);
        }
        this.droids.length = 0;
        G.fx.shake = 1.3;
        if (G.post) { G.post.kick(1.2); G.post.whiteFlash(0.35); }
        this.vel.cody.set(-1.2, 7.4, 9.6);
        this.vel.fox.set(1.4, 8.0, 10.4);
        this.spin.cody = -2.6; this.spin.fox = 2.2;
        for (const key of ['cody', 'fox']) {
          const c = G.chars[key];
          c.pitch = c.twist = 0;
          c.yaw = Math.PI;
          // flung off the edge, arms and legs flailing
          if (!c.play('Fall', 0.1, { restart: true, timeScale: key === 'cody' ? 1.35 : 1.2 })) c.play('Death', 0.08, { loop: false, restart: true });
          c.group.rotation.order = 'YXZ';
        }
      },
      update: (t, k, dt) => {
        for (const key of ['cody', 'fox']) {
          const c = G.chars[key], v = this.vel[key];
          v.y -= 16 * dt;
          c.position.addScaledVector(v, dt);
          c.group.rotation.x += this.spin[key] * dt;
          if (Math.random() < 0.5) G.fx.smokePuff(_a.copy(c.position).setY(c.position.y + 1), 0.6, 0.1);
        }
        mid(_m);
        this.cam(_b.set(6.5 - k * 1.5, 3.4 - k * 1.2, 58.5), _a.copy(_m).setY(_m.y + 0.9));
      },
    });
    // 3: the fall past the tower face, the street rushing up beneath them
    beats.push({
      dur: 3.8, line: 1, fov: 58,
      enter: () => {
        this.line(1);
        for (const key of ['cody', 'fox']) this.from[key].copy(G.chars[key].position);
        G.sound.whoosh(G.camera.position);
        G.civilians.start();
        this.lit = false;
      },
      update: (t, k, dt) => {
        for (const key of ['cody', 'fox']) {
          const c = G.chars[key], f = this.from[key], land = key === 'cody' ? CODY_LAND : FOX_LAND;
          c.position.x = lerp(f.x, land.x, smooth(k));
          c.position.z = lerp(f.z, land.z, smooth(k));
          c.position.y = lerp(f.y, land.y + 9, k * k);
          c.group.rotation.x += this.spin[key] * dt * (1 - k * 0.85);
        }
        if (!this.lit && k > 0.45) { this.lit = true; G.setArena('street'); }
        // wind-torn streaks rushing past
        mid(_m);
        for (let i = 0; i < 3; i++) {
          G.fx.add.emit(_m.x + rand(-6, 6), _m.y - rand(2, 12), _m.z + rand(-6, 6), 0, rand(40, 70), 0, 0.18, 0.06, 0.03, 1.4, 1.5, 1.7, 0.5);
        }
        // above them and out from the tower face, swinging round as they drop; the street far below behind them
        const a = 0.35 + k * 0.9;
        this.cam(_a.set(_m.x + Math.sin(a) * 3.4, _m.y + 3.6 - k * 0.8, _m.z + 1.2 + Math.cos(a) * 3.4), _b.set(_m.x, _m.y + 0.6, _m.z));
      },
    });
    // 4: down through the market awning: from the street, looking up as they tear through it
    beats.push({
      dur: 1.5, fov: 50,
      enter: () => {
        for (const key of ['cody', 'fox']) {
          const c = G.chars[key], land = key === 'cody' ? CODY_LAND : FOX_LAND;
          c.position.set(land.x - 0.6, land.y + 7.5, land.z);
        }
        this.crashed = false;
        // whatever was still up on the roof joins the next push down here
        const left = G.enemies.list.filter((e) => e.alive && e.state !== 'scripted').map((e) => e.type).slice(0, 10);
        G.enemies.clear();
        G.combat.clear();
        G.waves.queue.unshift(...left);
      },
      update: (t, k, dt) => {
        const drop = Math.min(1, t / 0.38);
        for (const key of ['cody', 'fox']) {
          const c = G.chars[key], land = key === 'cody' ? CODY_LAND : FOX_LAND;
          c.position.set(land.x - 0.6 * (1 - drop), land.y + 7.5 * (1 - drop * drop), land.z);
          c.group.rotation.x += this.spin[key] * dt * 0.3;
        }
        if (drop >= 0.45 && !this.torn) {
          this.torn = true;
          const aw = G.street.awning;
          aw.userData.cloth.visible = false;
          G.fx.sparks(_b.set(LX + 1, Y + 3.1, LANDING.z), _d.set(0, 1, 0), 0xffc070, 30, 7);
          G.fx._debris(_b, 8, 1);
          G.sound.impact(_b, 'wall');
        }
        if (drop >= 1 && !this.crashed) {
          this.crashed = true;
          _a.set(LX + 2, Y + 0.2, LANDING.z);
          G.fx.dust(_a, 30, 1.5);
          G.sound.thump(_a);
          setTimeout(() => G.sound.thump(_a), 120);
          G.fx.shake = 0.9;
          G.civilians.scare(_a, 30);
          for (const key of ['cody', 'fox']) {
            const c = G.chars[key];
            c.group.rotation.set(0, key === 'cody' ? 0.9 : -0.4, 0);
            const a = c.play('Death', 0, { loop: false, restart: true });
            if (a) a.time = a.getClip().duration;
          }
        }
        this.shot(V(LX + 7.6, Y + 0.7, LANDING.z + 5.2), V(LX + 7.2, Y + 0.9, LANDING.z + 4.8), V(LX + 1.5, Y + 3.6, LANDING.z), V(LX + 1.8, Y + 0.7, LANDING.z), Math.min(1, t / 0.7));
        if (t > 1.15 && !this.faded) { this.faded = true; G.hud.fade(true, 300); }
      },
    });
    // 5-8: back on their feet in the lower levels
    const getUp = (key, t, delay) => {
      const c = G.chars[key];
      if (t > delay && c.currentName === 'Death') c.play('Crouch', 0.5);
      if (t > delay + 1.0 && c.currentName === 'Crouch') { c.play('Idle', 0.5); c.group.rotation.set(0, c.group.rotation.y, 0); }
    };
    beats.push({
      dur: lineDur(2), line: 2, fov: 40,
      enter: () => { G.hud.fade(false, 700); this.line(2); },
      update: (t, k, dt) => {
        getUp('cody', t, 0.4);
        const c = CODY_LAND, up = smooth((t - 0.4) / 1.4);
        cody.yaw = dampAngle(cody.yaw, yawTo(FOX_LAND.x - c.x, FOX_LAND.z - c.z), t > 1.2 ? 3 : 0, dt);
        this.shot(V(c.x + 2.3, Y + 0.55, c.z + 1.7), V(c.x + 2.0, Y + 0.95, c.z + 1.6), V(c.x, Y + 0.55, c.z), V(c.x, Y + 0.55 + up * 0.9, c.z), k);
      },
    });
    beats.push({
      dur: lineDur(3), line: 3, fov: 32,
      enter: () => { this.line(3); cody.lookTarget = fox; },
      update: (t, k, dt) => {
        getUp('cody', 9, 0);
        getUp('fox', t, 0.2);
        cody.yaw = dampAngle(cody.yaw, yawTo(FOX_LAND.x - CODY_LAND.x, FOX_LAND.z - CODY_LAND.z), 4, dt);
        fox.yaw = dampAngle(fox.yaw, yawTo(CODY_LAND.x - FOX_LAND.x, CODY_LAND.z - FOX_LAND.z), t > 1.0 ? 3 : 0, dt);
        // over Cody's shoulder as Fox pushes himself up
        const up = smooth((t - 0.2) / 1.3);
        otsCam(cody, fox, { back: 1.3, side: 0.85, dy: 0.1 }, _b, _a);
        otsCam(cody, fox, { back: 1.15, side: 0.78, dy: 0.06 }, _c, _a);
        this.shot(_b, _c, V(FOX_LAND.x + 0.2, Y + 0.6 + up * 0.9, FOX_LAND.z), V(FOX_LAND.x + 0.2, Y + 0.7 + up * 0.85, FOX_LAND.z), k);
      },
    });
    beats.push({
      dur: Math.max(lineDur(4), 3.2), line: 4, fov: 42,
      enter: () => { this.line(4); fox.lookTarget = cody; cody.lookTarget = null; },
      update: (t, k, dt) => {
        getUp('fox', 9, 0);
        for (const key of ['cody', 'fox']) G.chars[key].yaw = dampAngle(G.chars[key].yaw, 0.35, 3, dt);
        if (t > 1.2) fox.lookTarget = null;
        // from behind them, down the street full of people
        mid(_m);
        this.shot(V(_m.x + 1.7, Y + 1.85, _m.z - 3.0), V(_m.x + 2.1, Y + 2.3, _m.z - 3.6), V(_m.x + 7, Y + 1.5, _m.z + 26), V(_m.x + 9, Y + 1.4, _m.z + 34), k);
      },
    });
    beats.push({
      dur: Math.max(lineDur(5), 3.0), line: 5, fov: 34,
      enter: () => {
        this.line(5);
        const gate = G.street.arena.spawns.gates[0];
        for (let i = 0; i < 4; i++) G.enemies.spawn('b1', 'gate', { gate, offset: (i % 2 ? 1 : -1) * 1.5, back: 1.3 * i });
      },
      update: (t, k, dt) => {
        for (const key of ['cody', 'fox']) { G.chars[key].yaw = dampAngle(G.chars[key].yaw, 0.12, 5, dt); G.chars[key].play('Idle', 0.3); }
        // Fox, close, as the droids come down the street behind the camera
        this.face(fox, k, { dist: 2.1, ang: -0.5, dy: 0.0 }, { dist: 1.8, ang: -0.45, dy: 0.0 });
      },
    });
    beats.push({
      dur: 2.6, fov: 46,
      enter: () => G.hud.titleCard(['LOWER LEVELS', 'CORUSCANT · THE UNDERCITY', 'Hold the street. Protect the civilians.'], 0.1, 2.6, true),
      update: (t, k) => {
        mid(_m);
        this.shot(V(_m.x + 1.8, Y + 1.8, _m.z - 2.6), V(_m.x + 3.5, Y + 6.0, _m.z - 7), V(_m.x + 9, Y + 1.8, 128), V(_m.x + 9, Y + 2.2, 112), k);
      },
    });
    return beats;
  }

  start() {
    const G = this.G;
    const { cody, fox } = G.chars;
    G.hud.letterbox(true);
    G.camera.fov = 58;
    G.camera.updateProjectionMatrix();
    G.onFovChange();
    cody.position.copy(CODY_EDGE); cody.yaw = Math.PI; cody.play('Idle', 0.1);
    fox.position.copy(FOX_EDGE); fox.yaw = Math.PI; fox.play('Idle', 0.1);
    this.enter(0);
  }

  enter(i) {
    this.beatIdx = i;
    this.bt = 0;
    this.quiet = 0;
    const b = this.beats[i];
    const cam = this.G.camera;
    if (b && b.fov && cam.fov !== b.fov) { cam.fov = b.fov; cam.updateProjectionMatrix(); this.G.onFovChange(); }
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
    const talking = b.line !== undefined && G.voice.busy() && this.bt < b.dur + 6;
    this.quiet = talking ? 0 : this.quiet + dt;
    if (talking) G.hud.subT = Math.max(G.hud.subT, 0.4);
    // the action beats (impact, fall, crash) never wait for speech
    const waits = b.line !== undefined && this.beatIdx >= 5;
    if (this.bt >= b.dur && (!waits || (!talking && (this.quiet >= 0.15 || !G.voice.enabled)))) {
      if (this.beatIdx + 1 < this.beats.length) this.enter(this.beatIdx + 1);
      else this.finish();
    }
  }

  finish() {
    if (this.done) return;
    this.done = true;
    const G = this.G;
    G.timeScale = 1;
    for (const d of this.droids) { d.ch.group.rotation.set(0, 0, 0); d.ch.group.rotation.order = 'XYZ'; G.pool.release(d.ch); }
    this.droids.length = 0;
    if (G.arena !== G.street.arena) {
      // skipped before the crash: do the level switch now
      G.setArena('street');
      G.civilians.start();
      G.street.awning.userData.cloth.visible = false;
      const left = G.enemies.list.filter((e) => e.alive && e.state !== 'scripted').map((e) => e.type).slice(0, 10);
      G.enemies.clear();
      G.combat.clear();
      G.waves.queue.unshift(...left);
    }
    G.voice.stop();
    G.hud.subtitle(null);
    G.hud.titleCard(null);
    G.hud.letterbox(false);
    G.hud.fade(false, 300);
    clearLooks([G.chars.cody, G.chars.fox]);
    for (const key of ['cody', 'fox']) {
      const c = G.chars[key];
      c.group.rotation.set(0, 0, 0);
      c.group.rotation.order = 'XYZ';
      c.pitch = c.twist = 0;
      c.play('Idle', 0.2);
    }
    if (this.onDone) this.onDone();
  }
}
Object.assign(FallCutscene.prototype, ShotMixin);
