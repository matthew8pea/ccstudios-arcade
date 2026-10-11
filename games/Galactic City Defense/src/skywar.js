import * as THREE from 'three';
import { rand, yawTo } from './util.js';
import { buildLAAT, buildARC170, buildVulture, buildLander } from './ships.js';
import { Dropship } from './dropship.js';

const FLIGHT = 3.4; // seconds from launch to impact
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _f = new THREE.Vector3();
const _mv = new THREE.Vector3();
const _down = new THREE.Vector3();

/**
 * The war in the background: B2-RP rocket droids ram the sky traffic around the tower,
 * and the droid and the vehicle go up together in a fireball. Owns the starship war
 * (formations, dogfights, landing craft, flak) and the droid dropship.
 */
export class SkyWar {
  constructor(G) {
    this.G = G;
    this.runs = [];
    this.wrecks = [];
    this.next = rand(9, 14);
    this.wreckGeo = new THREE.BoxGeometry(1.7, 0.7, 4.2);
    this.wreckMat = new THREE.MeshStandardMaterial({ color: 0x1d1b1a, emissive: new THREE.Color(0.5, 0.12, 0.02), roughness: 0.8, metalness: 0.4 });
    this.ships = new StarshipWar(G);
    this.dropship = new Dropship(G);
  }

  /** Approach start: head-on along the traffic lane (open air), a little high and to the side. */
  startFor(k, impact, out) {
    this.G.city.traffic.vel(k, _mv).normalize();
    return out.copy(impact).addScaledVector(_mv, 52).addScaledVector(_v2.set(-_mv.z, 0, _mv.x), rand(-7, 7)).setY(impact.y + rand(5, 10));
  }

  /** A vehicle whose collision (and the droid's run-in) will be well inside the screen, at a watchable distance. */
  pickVictim(tImpact, impact, start) {
    const G = this.G, tr = G.city.traffic, cam = G.camera;
    cam.updateMatrixWorld();
    let best = -1, bestScore = -Infinity;
    const p = new THREE.Vector3(), s = new THREE.Vector3(), n = new THREE.Vector3();
    // scan every vehicle: the distance / on-screen checks are cheap, the skyline test only runs for the best
    for (let k = 0; k < tr.count; k++) {
      if (!tr.alive(k, G.time) || !tr.alive(k, tImpact)) continue;
      tr.pos(k, tImpact, p);
      const d = p.distanceTo(cam.position);
      if (d < 30 || d > 170) continue;
      n.copy(p).project(cam);
      if (n.z > 1 || Math.abs(n.x) > 0.7 || n.y < -0.4 || n.y > 0.55) continue;
      this.startFor(k, p, s);
      const ns = _f.copy(s).project(cam);
      if (ns.z > 1 || Math.abs(ns.x) > 0.95 || Math.abs(ns.y) > 0.85) continue;
      const score = -Math.hypot(n.x, n.y) - Math.abs(d - 80) / 100 + Math.random() * 0.2;
      if (score <= bestScore) continue;
      // both the collision and the run-in must be in plain view, not behind a skyscraper
      if (G.city.occluded(cam.position, p) || G.city.occluded(cam.position, s)) continue;
      { bestScore = score; best = k; impact.copy(p); start.copy(s); }
    }
    return best;
  }

  launch() {
    const G = this.G;
    const impact = new THREE.Vector3(), start = new THREE.Vector3();
    const k = this.pickVictim(G.time + FLIGHT, impact, start);
    if (k < 0) return false;
    const char = G.pool.get('b2_rocket');
    char.group.rotation.order = 'YXZ';
    char.play('Fly', 0);
    char.position.copy(start);
    this.runs.push({ k, char, start, impact, t: 0 });
    G.sound.whoosh(start);
    return true;
  }

  update(dt, cine = false) {
    const G = this.G;
    this.ships.update(dt, !cine && !(G.arena && G.arena.indoor));
    this.dropship.update(dt);
    if (!G.city.traffic || cine || (G.arena && G.arena.planet) || G.act === 4) return;
    this.next -= dt;
    if (this.next <= 0) this.next = this.launch() ? rand(18, 32) : 2;

    for (let i = this.runs.length - 1; i >= 0; i--) {
      const r = this.runs[i];
      r.t += dt;
      const k = Math.min(1, r.t / FLIGHT);
      const c = r.char;
      c.position.lerpVectors(r.start, r.impact, k);
      _v.subVectors(r.impact, r.start);
      c.yaw = yawTo(_v.x, _v.z);
      c.group.rotation.x = 0.75; // leaning into the dive
      c.update(dt);
      // jets: flames + a smoke trail you can follow against the sky
      for (const b of ['thrust_L', 'thrust_R']) {
        if (!c.bones[b]) continue;
        c.bones[b].getWorldPosition(_v2);
        _down.set(0, -1, 0).applyQuaternion(c.group.quaternion);
        G.fx.thruster(_v2, _down, 1.3);
      }
      if (Math.random() < 0.6) G.fx.fireTrail(c.boneWorld('chest', _v2), 0.5);
      if (k >= 1) {
        this.detonate(r);
        this.runs.splice(i, 1);
      }
    }

    for (let i = this.wrecks.length - 1; i >= 0; i--) {
      const w = this.wrecks[i];
      w.t += dt;
      w.vel.y -= 9.8 * dt;
      w.mesh.position.addScaledVector(w.vel, dt);
      w.mesh.rotation.x += w.spin.x * dt;
      w.mesh.rotation.y += w.spin.y * dt;
      w.mesh.rotation.z += w.spin.z * dt;
      G.fx.fireTrail(w.mesh.position, 1.4);
      if (w.t > 9 || w.mesh.position.y < -160) {
        G.scene.remove(w.mesh);
        this.wrecks.splice(i, 1);
      }
    }
  }

  detonate(r) {
    const G = this.G, tr = G.city.traffic;
    G.fx.explosion(r.impact, 2.1);
    G.fx.explosion(_v.copy(r.impact).add(_v2.set(rand(-1.5, 1.5), rand(0, 1.5), rand(-1.5, 1.5))), 1.2);
    G.sound.explosion(r.impact, 1.4);
    // the vehicle drops out of the lane; it reappears once it has looped far away into the haze
    tr.kill(r.k, G.time, G.time + 40);
    const mesh = new THREE.Mesh(this.wreckGeo, this.wreckMat);
    mesh.position.copy(r.impact);
    mesh.rotation.y = yawTo(tr.vel(r.k, _v).x, _v.z);
    G.scene.add(mesh);
    this.wrecks.push({
      mesh, t: 0,
      vel: tr.vel(r.k, new THREE.Vector3()).multiplyScalar(0.3).add(_v2.set(rand(-2, 2), rand(1, 4), rand(-2, 2))),
      spin: new THREE.Vector3(rand(-1.5, 1.5), rand(-1, 1), rand(-2.5, 2.5)),
    });
    this.release(r.char);
  }

  release(c) {
    c.group.rotation.set(0, 0, 0);
    c.group.rotation.order = 'XYZ';
    this.G.pool.release(c);
  }

  clear() {
    for (const r of this.runs) this.release(r.char);
    for (const w of this.wrecks) this.G.scene.remove(w.mesh);
    this.runs.length = this.wrecks.length = 0;
    this.next = rand(9, 14);
    this.ships.clear();
    this.dropship.clear();
  }
}

// ---------------------------------------------------------------------------
// Starships: LAAT/i formations, ARC-170 vs vulture dogfights, Separatist landing craft,
// flak and AA fire on the horizon, and the gunships of Cody's barrage.
// ---------------------------------------------------------------------------
const REP_BOLT = 0x3aa0ff, SEP_BOLT = 0xff3a24;
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _d = new THREE.Vector3();
const _s = new THREE.Vector3();
const _u = new THREE.Vector3(0, 1, 0);

const SKY_SCALE = { arc: 1.5, vulture: 1.6, laat: 1.25 };
const BUILDERS = { laat: () => buildLAAT(), arc: buildARC170, vulture: buildVulture, lander: buildLander };

/** Pooled starship meshes (clones share geometry), each with soft engine-glow sprites that read at a distance. */
class Hangar {
  constructor(G) {
    this.G = G;
    this.free = {};
    this.tpl = {};
  }

  get(kind) {
    const G = this.G;
    const list = this.free[kind] || (this.free[kind] = []);
    let obj = list.pop();
    if (!obj) {
      const tpl = this.tpl[kind] || (this.tpl[kind] = BUILDERS[kind]());
      obj = tpl.clone();
      obj.userData = { kind, anchors: tpl.userData.anchors };
      obj.rotation.order = 'YXZ';
      obj.traverse((o) => { o.castShadow = false; });
      const an = tpl.userData.anchors;
      const big = kind === 'lander' ? 9 : kind === 'laat' ? 3.4 : 2.2;
      obj.userData.glows = (an.engines || []).map((p) => {
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({
          map: G.fx.glowTex, color: new THREE.Color(an.engineColor ?? 0xffc080).multiplyScalar(2.2),
          blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false,
        }));
        sp.position.copy(p);
        sp.scale.setScalar(big);
        obj.add(sp);
        return sp;
      });
    }
    obj.visible = true;
    obj.position.set(0, -9999, 0);
    obj.rotation.set(0, 0, 0);
    obj.scale.setScalar(SKY_SCALE[kind] || 1);
    obj.userData.roll = 0;
    obj.userData.yaw = null;
    for (const g of obj.userData.glows) g.visible = true;
    G.scene.add(obj);
    return obj;
  }

  release(obj) {
    this.G.scene.remove(obj);
    (this.free[obj.userData.kind] || (this.free[obj.userData.kind] = [])).push(obj);
  }
}

/** Point a ship along its velocity, banking into turns. */
function orient(obj, vel, dt, bankK = 0.55) {
  const h = Math.hypot(vel.x, vel.z);
  if (h + Math.abs(vel.y) < 1e-4) return;
  const yaw = Math.atan2(vel.x, vel.z);
  const ud = obj.userData;
  let dy = ud.yaw == null ? 0 : yaw - ud.yaw;
  if (dy > Math.PI) dy -= Math.PI * 2; else if (dy < -Math.PI) dy += Math.PI * 2;
  ud.yaw = yaw;
  const want = Math.max(-1.25, Math.min(1.25, -(dy / Math.max(dt, 1e-3)) * bankK));
  ud.roll += (want - ud.roll) * Math.min(1, dt * 3);
  obj.rotation.set(-Math.atan2(vel.y, h), yaw, ud.roll);
}

/** World position of a ship's local anchor point. */
function anchorWorld(obj, local, out) {
  return out.copy(local).applyMatrix4(obj.matrixWorld);
}

export class StarshipWar {
  constructor(G) {
    this.G = G;
    this.hangar = new Hangar(G);
    this.flights = [];
    this.wrecks = [];
    this.runs = [];
    this.booms = [];
    this.t = { fight: rand(3, 6), laat: rand(8, 14), lander: rand(18, 30), flak: 1, aa: rand(2, 5) };
  }

  /** A point in open sky the camera can see: in front of it, not behind a skyscraper. */
  skyPoint(out, dMin, dMax, hMin, hMax, spread = 0.9) {
    const G = this.G, cam = G.camera;
    cam.getWorldDirection(_d);
    const yaw0 = Math.atan2(_d.x, _d.z);
    const street = G.arena.name === 'street';
    for (let i = 0; i < 14; i++) {
      const yaw = yaw0 + rand(-spread, spread), r = rand(dMin, dMax);
      out.set(cam.position.x + Math.sin(yaw) * r, cam.position.y + rand(hMin, hMax), cam.position.z + Math.cos(yaw) * r);
      // down in the street canyon the open sky is to the west, over the drop
      if (street && out.x > -40) continue;
      if (G.city.occluded(cam.position, out)) continue;
      // and not behind the arena's own structures (the turbolift tower, the street's walls)
      _b.subVectors(out, cam.position);
      const len = _b.length();
      if (G.world.raycast(cam.position, _b.divideScalar(len), Math.min(len, 120), 'shot')) continue;
      return out;
    }
    return null;
  }

  /** True if the camera can see along a flight line through c (its middle stretch, either side of c). */
  pathClear(c, D, reach) {
    const G = this.G, cam = G.camera.position;
    let n = 0;
    for (const k of [-reach, -reach / 2, 0, reach / 2, reach]) {
      _c.copy(c).addScaledVector(D, k);
      if (G.city.occluded(cam, _c)) continue;
      _b.subVectors(_c, cam);
      const len = _b.length();
      if (!G.world.raycast(cam, _b.divideScalar(len), Math.min(len, 120), 'shot')) n++;
    }
    return n >= 3;
  }

  /** Centre and heading for a flight line the camera can follow for a good stretch. */
  flightLine(dMin, dMax, hMin, hMax, reach, spread) {
    const C = new THREE.Vector3(), D = new THREE.Vector3();
    for (let i = 0; i < 10; i++) {
      if (!this.skyPoint(C, dMin, dMax, hMin, hMax, spread)) continue;
      this.heading(C, D);
      if (this.pathClear(C, D, reach)) return [C, D];
    }
    return null;
  }

  /** Flight heading for a path centred on c: across the line of sight, roughly. */
  heading(c, out) {
    const cam = this.G.camera;
    out.set(c.x - cam.position.x, 0, c.z - cam.position.z).normalize();
    const a = (Math.random() < 0.5 ? 1 : -1) * Math.PI / 2 + rand(-0.55, 0.55);
    const x = out.x * Math.cos(a) - out.z * Math.sin(a), z = out.x * Math.sin(a) + out.z * Math.cos(a);
    if (this.G.arena.name === 'street') return out.set(0, 0, Math.random() < 0.5 ? 1 : -1).applyAxisAngle(_u, rand(-0.35, 0.35));
    return out.set(x, 0, z);
  }

  // -------------------------------------------------------------- dogfights
  /**
   * Scripted pass for cutscenes: a flight crossing point c along d at speed v, reaching c tc seconds
   * from now. type 'laat' (opts.n gunships) or 'fight' (opts.kinds, opts.victims shot down as they cross).
   */
  scripted(type, c, d, v, tc, opts = {}) {
    const line = [c.clone(), d.clone().normalize()];
    return type === 'laat' ? this.launchLAATs(line, v, tc, opts.n) : this.launchFight(line, v, tc, opts.kinds, opts.victims);
  }

  launchFight(fixed = null, vFix = 0, tc = 0, kindsFix = null, victimsFix = null) {
    const G = this.G;
    const street = G.arena.name === 'street';
    const line = fixed || this.flightLine(90, 230, street ? 40 : 45, street ? 120 : 130, 110, 1.3);
    if (!line) return false;
    const [C, D] = line;
    const v = vFix || rand(58, 78);
    const T = tc ? 2 * tc : 560 / v;
    const wob = tc ? 0.3 : 1;
    const p = {
      C, D, S: new THREE.Vector3(-D.z, 0, D.x), v, T,
      A: rand(18, 36) * wob, w1: rand(0.55, 0.95), f1: rand(0, 6.28), B: rand(6, 14) * wob, w2: rand(0.4, 0.8), f2: rand(0, 6.28),
    };
    // scripted passes centre on c at tc: no sideways offset from the weave at that moment
    if (tc) { p.f1 = -p.w1 * tc; p.f2 = -p.w2 * tc; }
    // who chases whom (each ship fires at the one ahead of it), and who goes down
    const r = Math.random();
    let [kinds, victims] = r < 0.35 ? [['vulture', 'arc'], [0]] : r < 0.6 ? [['arc', 'vulture', 'arc'], [1]]
      : r < 0.8 ? [['arc', 'vulture', 'vulture'], [0]] : [['vulture', 'arc', 'vulture', 'arc'], [0, 2]];
    if (kindsFix) { kinds = kindsFix; victims = victimsFix || []; }
    const ships = kinds.map((kind, i) => ({
      kind, obj: this.hangar.get(kind), lag: i * rand(0.75, 1.05), off: new THREE.Vector3(rand(-5, 5), rand(-3, 3), 0),
      team: kind === 'vulture' ? 'sep' : 'rep', alive: true, burst: 0, burstT: rand(0.5, 1.5), gun: 0,
      pos: new THREE.Vector3(0, -1e4, 0), prev: new THREE.Vector3(), vel: new THREE.Vector3(), killAt: Infinity,
    }));
    // the hunted ship goes down part-way across (now and then it gets away)
    if (tc) for (const i of victims) ships[i].killAt = tc + ships[i].lag + 0.15;
    else for (const i of victims) if (Math.random() < 0.88) ships[i].killAt = T * rand(0.32, 0.6) + ships[i].lag + i * 0.6;
    this.flights.push({ type: 'fight', p, ships, t: 0, end: T + ships.length * 1.1 });
    return true;
  }

  fightPos(p, t, out) {
    const k = t - p.T / 2;
    return out.copy(p.C).addScaledVector(p.D, p.v * k)
      .addScaledVector(p.S, p.A * Math.sin(p.w1 * t + p.f1))
      .addScaledVector(_u, p.B * Math.sin(p.w2 * t + p.f2) + k * 1.2);
  }

  // -------------------------------------------------------------- LAAT/i formations
  launchLAATs(fixed = null, vFix = 0, tc = 0, nFix = 0) {
    const G = this.G;
    const street = G.arena.name === 'street';
    const line = fixed || this.flightLine(120, 300, street ? 45 : 50, street ? 130 : 140, 130, 1.3);
    if (!line) return false;
    const [C, D] = line;
    const n = nFix || (Math.random() < 0.4 ? 4 : 3);
    const slots = [[0, 0, 0], [-16, -2, -14], [16, -2, -14], [0, -4, -28]];
    const v = vFix || rand(36, 46);
    const ships = [];
    for (let i = 0; i < n; i++) {
      ships.push({
        kind: 'laat', obj: this.hangar.get('laat'), slot: new THREE.Vector3(...slots[i]), alive: true, team: 'rep',
        pos: new THREE.Vector3(0, -1e4, 0), prev: new THREE.Vector3(), vel: new THREE.Vector3(), bob: rand(0, 6.28),
        burst: 0, burstT: rand(2, 6), gun: 0,
      });
    }
    const T = tc ? 2 * tc : 640 / v;
    this.flights.push({ type: 'laat', p: { C, D, S: new THREE.Vector3(-D.z, 0, D.x), v, T, climb: tc ? 0 : rand(-1.5, 2.5) }, ships, t: 0, end: T });
    return true;
  }

  // -------------------------------------------------------------- landing craft
  launchLander() {
    const G = this.G;
    const street = G.arena.name === 'street';
    const line = this.flightLine(520, 950, street ? 90 : 110, street ? 220 : 240, 160, 1.0);
    if (!line) return false;
    const [C, D] = line;
    const obj = this.hangar.get('lander');
    obj.scale.setScalar(2.4);
    const ships = [{ kind: 'lander', obj, alive: true, team: 'sep', pos: new THREE.Vector3(0, -1e4, 0), prev: new THREE.Vector3(), vel: new THREE.Vector3(), slot: new THREE.Vector3() }];
    for (let i = 0; i < 3; i++) {
      ships.push({
        kind: 'vulture', obj: this.hangar.get('vulture'), alive: true, team: 'sep', esc: i, pos: new THREE.Vector3(0, -1e4, 0), prev: new THREE.Vector3(), vel: new THREE.Vector3(),
        slot: new THREE.Vector3(), burst: 0, burstT: 99, gun: 0,
      });
    }
    const v = rand(16, 22), T = 34;
    this.flights.push({ type: 'lander', p: { C, D, v, T, sink: rand(4, 6.5) }, ships, t: 0, end: T });
    return true;
  }

  // -------------------------------------------------------------- Cody's barrage: two gunships make a strafing run
  /**
   * Two LAAT/is fly over target, passing above it at time tc. Returns the run, whose muzzle(i, out)
   * gives a world-space gun position for strike i.
   */
  gunshipRun(target, tc = 2.0) {
    const G = this.G, p = G.player;
    const D = new THREE.Vector3();
    if (G.arena.name === 'street') D.set(0, 0, p && target.z < p.pos.z ? -1 : 1);
    else {
      if (p) D.set(target.x - p.pos.x, 0, target.z - p.pos.z);
      if (D.lengthSq() < 4) G.camera.getWorldDirection(D).setY(0);
      D.normalize();
    }
    const base = new THREE.Vector3(target.x, target.y + (G.arena.name === 'street' ? 33 : 40), target.z);
    const S = new THREE.Vector3(-D.z, 0, D.x);
    const ships = [-1, 1].map((s, i) => ({
      obj: this.hangar.get('laat'), off: new THREE.Vector3().addScaledVector(S, s * 8).addScaledVector(D, -i * 10).setY(i * 3),
      pos: new THREE.Vector3(0, -1e4, 0), prev: new THREE.Vector3(), vel: new THREE.Vector3(),
    }));
    const run = {
      base, D, ships, tc, t: 0, v: 62, sounded: false,
      muzzle: (i, out) => {
        const s = ships[i % 2];
        s.obj.updateMatrixWorld();
        return anchorWorld(s.obj, s.obj.userData.anchors.nose, out);
      },
    };
    for (const s of ships) { s.obj.scale.setScalar(1); s.obj.traverse((o) => { if (o.isMesh) o.castShadow = true; }); }
    this.stepRun(run, 0);
    this.runs.push(run);
    return run;
  }

  stepRun(run, dt) {
    const G = this.G;
    run.t += dt;
    const k = run.t - run.tc;
    for (const s of run.ships) {
      s.prev.copy(s.pos);
      // a shallow dive onto the target, pulling up as they pass over
      s.pos.copy(run.base).add(s.off).addScaledVector(run.D, run.v * k).setY(run.base.y + s.off.y + Math.max(-4, -k * 3) + k * k * 0.9);
      if (dt > 0) s.vel.subVectors(s.pos, s.prev).divideScalar(dt);
      else s.vel.copy(run.D).multiplyScalar(run.v);
      s.obj.position.copy(s.pos);
      orient(s.obj, s.vel, Math.max(dt, 1 / 60), 0.2);
      if (dt > 0 && G.fx) for (const e of s.obj.userData.anchors.engines) G.fx.thruster(anchorWorld(s.obj, e, _a), _b.copy(s.vel).normalize().negate(), 1.4);
    }
    if (!run.sounded && k > -1.6) {
      run.sounded = true;
      G.sound.flyby(_a.copy(run.base), 1.25);
    }
    return k < 4.5;
  }

  // -------------------------------------------------------------- update
  /** auto = false (cutscenes): only scripted passes, plus the flak and AA fire. */
  update(dt, auto = true) {
    const G = this.G;
    const t = this.t;
    const high = G.settings ? G.settings.high !== false : true;
    const fights = this.flights.filter((f) => f.type === 'fight').length;
    // over Tatooine the sky is quiet: only Cody's barrage gunships fly
    const planet = G.arena && G.arena.planet;
    if (!auto) { t.fight = Math.max(t.fight, 4); t.laat = Math.max(t.laat, 6); t.lander = Math.max(t.lander, 8); }
    if (!planet && G.act === 4) {
      if ((t.laat -= dt) <= 0) t.laat = this.launchLAATs() ? rand(14, 24) : 3;
    } else if (!planet) {
      if ((t.fight -= dt) <= 0) t.fight = fights < (high ? 2 : 1) && this.launchFight() ? rand(6, 13) : 2;
      if ((t.laat -= dt) <= 0) t.laat = this.launchLAATs() ? rand(20, 34) : 3;
      if ((t.lander -= dt) <= 0) t.lander = !this.flights.some((f) => f.type === 'lander') && this.launchLander() ? rand(45, 70) : 5;
      if ((t.flak -= dt) <= 0) { this.flak(); t.flak = rand(0.5, 1.6); }
      if ((t.aa -= dt) <= 0) { this.aaBurst(); t.aa = rand(2.5, 6); }
    }

    for (let i = this.flights.length - 1; i >= 0; i--) {
      const f = this.flights[i];
      f.t += dt;
      if (f.type === 'fight') this.stepFight(f, dt);
      else if (f.type === 'laat') this.stepLAATs(f, dt);
      else this.stepLander(f, dt);
      if (f.t > f.end) {
        for (const s of f.ships) if (s.obj) this.hangar.release(s.obj);
        this.flights.splice(i, 1);
      }
    }
    for (let i = this.runs.length - 1; i >= 0; i--) {
      if (!this.stepRun(this.runs[i], dt)) {
        for (const s of this.runs[i].ships) { s.obj.traverse((o) => { o.castShadow = false; }); this.hangar.release(s.obj); }
        this.runs.splice(i, 1);
      }
    }
    for (let i = this.wrecks.length - 1; i >= 0; i--) {
      const w = this.wrecks[i];
      w.t += dt;
      w.vel.y -= 14 * dt;
      w.vel.multiplyScalar(Math.exp(-0.15 * dt));
      w.obj.position.addScaledVector(w.vel, dt);
      w.obj.rotation.x += w.spin.x * dt;
      w.obj.rotation.z += w.spin.z * dt;
      G.fx.fireTrail(w.obj.position, 1.8);
      if ((w.puff -= dt) <= 0) { w.puff = 0.06; G.fx.smokePuff(w.obj.position, 2.2, 0.08); }
      if (w.t > w.life) {
        if (w.obj.position.distanceTo(G.camera.position) < 700) {
          G.fx.explosion(w.obj.position, 2.2);
          this.boom(w.obj.position, 0.9);
        }
        this.hangar.release(w.obj);
        this.wrecks.splice(i, 1);
      }
    }
    // distant explosions are heard a moment after they are seen
    for (let i = this.booms.length - 1; i >= 0; i--) {
      const b = this.booms[i];
      if ((b.t -= dt) <= 0) { G.sound.explosion(b.pos, b.big); this.booms.splice(i, 1); }
    }
  }

  /** Move a ship to pos, keeping prev/vel for orientation and gun aim. */
  place(s, pos, dt) {
    s.prev.copy(s.pos);
    s.pos.copy(pos);
    if (dt > 0 && s.prev.y > -9000) s.vel.subVectors(s.pos, s.prev).divideScalar(dt);
    s.obj.position.copy(s.pos);
  }

  stepFight(f, dt) {
    const p = f.p;
    for (let i = 0; i < f.ships.length; i++) {
      const s = f.ships[i];
      if (!s.alive) continue;
      const tt = f.t - s.lag;
      if (s.pos.y < -9000) s.pos.copy(this.fightPos(p, tt - dt, _a).add(s.off));
      this.place(s, this.fightPos(p, tt, _a).add(s.off), dt);
      orient(s.obj, s.vel, dt);
      s.obj.updateMatrixWorld();
      // chasers fire at the ship ahead of them when it is on the other side
      const prey = f.ships[i - 1];
      if (prey && prey.alive && prey.team !== s.team) this.guns(s, prey.pos, dt, 0.035);
      if (f.t >= s.killAt) this.shootDown(f, s);
    }
  }

  stepLAATs(f, dt) {
    const p = f.p;
    const k = f.t - p.T / 2;
    for (const s of f.ships) {
      _a.copy(p.C).addScaledVector(p.D, p.v * k).addScaledVector(_u, p.climb * k + Math.sin(f.t * 0.7 + s.bob) * 0.8)
        .addScaledVector(p.S, s.slot.x).addScaledVector(_u, s.slot.y).addScaledVector(p.D, s.slot.z);
      if (s.pos.y < -9000) s.pos.copy(_a).addScaledVector(p.D, -p.v * dt);
      this.place(s, _a, dt);
      orient(s.obj, s.vel, dt, 0.2);
      s.obj.updateMatrixWorld();
      // now and then the gunships fire their chin cannons down at the Separatist positions below
      _b.copy(s.pos).addScaledVector(p.D, 60).setY(s.pos.y - 70);
      this.guns(s, _b, dt, 0.06, 0.25);
    }
  }

  stepLander(f, dt) {
    const p = f.p;
    const k = f.t - p.T / 2;
    const L = f.ships[0];
    _a.copy(p.C).addScaledVector(p.D, p.v * k).setY(p.C.y - p.sink * f.t + 40);
    if (L.pos.y < -9000) L.pos.copy(_a).addScaledVector(p.D, -p.v * dt);
    this.place(L, _a, dt);
    L.obj.rotation.set(0.04, Math.atan2(p.D.x, p.D.z), Math.sin(f.t * 0.3) * 0.03);
    // escorts weave around it
    for (let i = 1; i < f.ships.length; i++) {
      const s = f.ships[i];
      const a = f.t * 0.9 + i * 2.1;
      _b.set(Math.sin(a) * 70, 18 + Math.sin(a * 1.7) * 12, Math.cos(a) * 55);
      _b.applyAxisAngle(_u, L.obj.rotation.y);
      _a.copy(L.pos).add(_b);
      if (s.pos.y < -9000) s.pos.copy(_a);
      this.place(s, _a, dt);
      orient(s.obj, s.vel, dt);
    }
    // flak bursting around it
    if (Math.random() < dt * 1.6) {
      _c.copy(L.pos).add(_d.set(rand(-90, 90), rand(-30, 50), rand(-90, 90)));
      this.G.fx.flash(_c, 0xff9a40, rand(9, 16), 0.3);
    }
  }

  /** Burst fire from a ship's guns toward aim (bolts are cosmetic). */
  guns(s, aim, dt, spread, chance = 1) {
    const G = this.G;
    if (s.burst > 0) {
      s.burstT -= dt;
      if (s.burstT > 0) return;
      s.burstT = 0.085;
      s.burst--;
      const an = s.obj.userData.anchors;
      const g = an.guns || [an.nose];
      anchorWorld(s.obj, g[s.gun++ % g.length], _c);
      _d.subVectors(aim, _c).normalize();
      _d.x += rand(-spread, spread); _d.y += rand(-spread, spread); _d.z += rand(-spread, spread);
      const rep = s.team === 'rep';
      G.fx.bolts.fire({ from: _c, dir: _d, speed: 320, color: rep ? REP_BOLT : SEP_BOLT, len: 7, width: 0.32, intensity: 1.3, noHit: true, maxDist: 420 });
      if (_c.distanceTo(G.camera.position) < 260 && !G.sound._throttle?.('skyguns', 180)) G.sound.shot('cannon', _c);
      return;
    }
    s.burstT -= dt;
    if (s.burstT <= 0) {
      if (Math.random() < chance) s.burst = Math.floor(rand(4, 9));
      s.burstT = rand(0.6, 1.6);
    }
  }

  shootDown(f, s) {
    const G = this.G;
    s.alive = false;
    G.fx.explosion(s.pos, 3.4);
    G.fx.explosion(_a.copy(s.pos).addScaledVector(s.vel, 0.08), 2);
    G.fx.flash(s.pos, 0xffb060, 30, 0.6);
    this.boom(s.pos, 1.2);
    // the burning wreck tumbles out of the fight
    this.wrecks.push({
      obj: s.obj, t: 0, life: rand(2.2, 4), puff: 0,
      vel: s.vel.clone().multiplyScalar(0.55).add(_a.set(rand(-6, 6), rand(2, 8), rand(-6, 6))),
      spin: new THREE.Vector3(rand(-2.5, 2.5), 0, rand(-4, 4)),
    });
    s.obj = null;
  }

  /** Queue the sound of a far-off blast to arrive after the flash (speed of sound, capped). */
  boom(pos, big) {
    const d = pos.distanceTo(this.G.camera.position);
    this.booms.push({ pos: pos.clone(), big, t: Math.min(2.5, d / 343) });
  }

  /** Flak and distant explosions over the city. */
  flak() {
    const G = this.G;
    const street = G.arena.name === 'street';
    const c = this.skyPoint(_s, 450, 1500, street ? -20 : -60, street ? 320 : 260, 1.2);
    if (!c) return;
    const n = Math.random() < 0.4 ? 1 : Math.floor(rand(3, 6));
    for (let i = 0; i < n; i++) {
      _a.copy(c).add(_b.set(rand(-25, 25), rand(-12, 12), rand(-25, 25)));
      G.fx.flash(_a, Math.random() < 0.8 ? 0xff9a40 : 0xffd890, rand(8, 18), rand(0.2, 0.4));
    }
    if (n > 1 && Math.random() < 0.5) this.boom(c, 0.6);
  }

  /** Republic anti-air batteries on distant towers firing up into the sky. */
  aaBurst() {
    const G = this.G;
    const street = G.arena.name === 'street';
    const c = this.skyPoint(_s, 300, 800, street ? -40 : -50, street ? 60 : 10, 1.1);
    if (!c) return;
    _d.set(rand(-0.3, 0.3), 1, rand(-0.3, 0.3)).normalize();
    for (let i = 0; i < 6; i++) {
      _b.copy(_d).add(_a.set(rand(-0.04, 0.04), 0, rand(-0.04, 0.04)));
      const bolt = G.fx.bolts.fire({ from: _c.copy(c).addScaledVector(_b, -i * 22), dir: _b, speed: 280, color: Math.random() < 0.5 ? REP_BOLT : 0x6cff7a, len: 9, width: 0.45, intensity: 1.4, noHit: true, maxDist: 500 });
      if (!bolt) break;
    }
  }

  clear() {
    for (const f of this.flights) for (const s of f.ships) if (s.obj) this.hangar.release(s.obj);
    for (const w of this.wrecks) this.hangar.release(w.obj);
    for (const r of this.runs) for (const s of r.ships) this.hangar.release(s.obj);
    this.flights.length = this.wrecks.length = this.runs.length = this.booms.length = 0;
  }
}
