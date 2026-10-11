import * as THREE from 'three';
import { Player } from './commanders.js';
import { buildLAAT } from './ships.js';
import { clamp, damp, dampAngle, angleDiff, rand } from './util.js';

/**
 * Dev menu "Take to the skies": you fly a LAAT/i gunship instead of fighting on foot. It hovers and strafes like a
 * helicopter, turning to follow the camera. Your commander rides in the open bay.
 *
 *   mouse / right stick   look (the gunship turns to follow)    W/S, A/D / left stick   fly / strafe
 *   Space / A             climb                                  Ctrl or C / B           descend (and land)
 *   Shift / L3            faster                                 LMB / RT                chin cannons (heat, R vents)
 *   RMB / LT              zoom                                   Q / LB                  afterburner
 *   G / Y                 drop a bomb                            F / RB                  ROCKET SALVO (the special)
 *
 * Landing: come down gently onto anything flat and you settle on your skids (repairs the hull and reloads the
 * rockets faster; you can grab pickups). Crashing: hit the ground or a wall too fast, or run out of hull, and the
 * gunship goes down in flames.
 */
export const LAAT_CFG = {
  name: 'LAAT/i Gunship', short: 'LAAT/I GUNSHIP', unit: 'Republic Gunship', weapon: 'CHIN CANNONS · ROCKET PODS',
  tag: 'GUNSHIP', special: 'ROCKET SALVO', accent: '#9fc4e8', maxHp: 450, height: 3.2,
  kit: { q: 'afterburner', g: 'bomb', f: 'rockets' }, lines: {},
  abilities: [
    { label: 'Q', icon: 'riot', name: 'Afterburner', cd: 8 },
    { label: 'G', icon: 'thermal', name: 'Bomb', cd: 5 },
    { label: 'F', icon: 'barrage', name: 'Rocket Salvo' },
  ],
};

const FLOOR = 0.545;
const SPEED = 24, BOOST = 36, BURNER = 60, STRAFE = 15, CLIMB = 11;
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _e = new THREE.Vector3();
const _q = new THREE.Quaternion();

export class Gunship extends Player {
  constructor(G, key, at = null) {
    super(G, key);
    this.isGunship = true;
    this.cfg = LAAT_CFG;
    this.hero = this.char;
    const ar = G.arena;
    if (!at && ar.skySpawn) {
      this.pos = ar.skySpawn.clone();
      this.yaw = this.camYaw = ar.skyYaw || 0;
    } else {
      this.pos = new THREE.Vector3().copy(at || ar.playerSpawn);
      this.pos.y = Math.max(this.pos.y, ar.y) + 15; // above the rooftop clutter
    }
    this.vel = new THREE.Vector3();
    this.maxHp = this.hp = LAAT_CFG.maxHp;
    this.hitR = 3.0;
    this.landed = false;
    this.bank = 0;
    this.tilt = 0;
    this.burnT = 0;
    this.rockets = [];
    this.bombs = [];
    this.muzzle = 0;
    this.crashT = -1;
    this.special = 50;
    // the gunship, and your commander standing at the front of its bay
    this.model = buildLAAT({ bay: true });
    this.model.position.copy(this.pos);
    G.scene.add(this.model);
    this.model.add(this.hero.group);
    this.hero.group.rotation.set(0, 0, 0);
    this.hero.position.set(0, FLOOR, 1.6);
    this.hero.yaw = 0;
    this.hero.pitch = this.hero.twist = 0;
    this.hero.group.visible = true;
    this.hero.play('Idle', 0);
    this.sheathe(true); // Yoda rides with his blade away (lit, that close to the camera, it blooms out the bay)
  }

  sheathe(on) { for (const m of this.hero.materials) if (/^Saber/.test(m.name)) m.visible = !on; }

  get height() { return LAAT_CFG.height; }
  /** Where the enemies aim, and where the HUD thinks you are: the middle of the fuselage. */
  get chestY() { return this.pos.y + 1.6; }

  /** Leave the gunship (back on foot, or a cutscene): the commander back in the world, the gunship gone. */
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    const G = this.G;
    G.scene.attach(this.hero.group);
    this.hero.group.rotation.set(0, 0, 0);
    this.hero.group.visible = true;
    this.sheathe(false);
    G.scene.remove(this.model);
    for (const r of this.rockets) G.scene.remove(r.mesh);
    for (const b of this.bombs) G.scene.remove(b.mesh);
    this.rockets.length = this.bombs.length = 0;
  }

  hurt(dmg, from, attacker = null) {
    if (this.landed) dmg *= 0.8; // the skids are down: a steadier target, but armour plates to the ground
    super.hurt(dmg, from, attacker);
  }

  /** Out of hull: the gunship goes down trailing smoke and fire. */
  die() {
    const G = this.G;
    if (!this.alive) return;
    this.hp = 0;
    this.alive = false;
    this.deadT = 0;
    this.crashT = 0;
    this.spin = rand(0.8, 1.6) * (Math.random() < 0.5 ? -1 : 1);
    this.killer = this.lastAttacker && G.time - this.lastHurt < 2 ? this.lastAttacker : null;
    G.hud.killFeed(this.killer ? this.killer.cfg.name.toUpperCase() : 'CRASH', 'sep', 'LAAT/I', 'rep');
    G.hud.toast('GUNSHIP GOING DOWN');
    G.sound.explosion(this.pos, 0.9);
    G.onPlayerDeath();
  }

  /** Hit the ground or a wall too hard: down in a fireball, right here. */
  crash(reason) {
    const G = this.G;
    if (!this.alive) return;
    this.lastAttacker = null;
    this.die();
    G.hud.toast(reason);
    this.explodeWreck();
  }

  explodeWreck() {
    const G = this.G;
    if (this.wrecked) return;
    this.wrecked = true;
    this.vel.set(0, 0, 0);
    G.fx.explosion(_a.copy(this.pos).setY(this.pos.y + 1.5), 2.4, this.pos.y);
    G.sound.explosion(this.pos, 1.4);
    G.fx.shake = Math.min(1.5, G.fx.shake + 1);
    G.input.pad.rumble(1, 1, 600);
    this.hero.group.visible = false;
    this.model.rotation.z += 0.3;
  }

  // ------------------------------------------------------------------ flying
  update(dt) {
    const G = this.G, input = G.input, world = G.world, ar = G.arena;
    this.updateRockets(dt);
    this.updateBombs(dt);
    this.hero.update(dt);
    if (!this.alive) { this.updateCrash(dt); return; }
    // look: the mouse or right stick, the gunship turning after it
    const sens = G.settings.sens * 0.0022 * (this.aim > 0.5 ? 0.6 : 1);
    this.camYaw -= input.mouse.dx * sens;
    this.camPitch = clamp(this.camPitch - input.mouse.dy * sens, -1.05, 0.6);
    this.padLook(dt);
    this.aim = damp(this.aim, input.aimDown ? 1 : 0, 10, dt);
    this.yaw = dampAngle(this.yaw, this.camYaw, this.landed ? 1.2 : 2.6, dt);
    // controls
    const fwd = input.moveZ, side = input.moveX;
    const up = (input.down('Space') ? 1 : 0) - (input.down('ControlLeft') || input.down('ControlRight') || input.down('KeyC') ? 1 : 0);
    this.burnT -= dt;
    this.cdQ -= dt;
    this.cdG -= dt;
    if (input.hit('KeyQ') && this.cdQ <= 0) { this.burnT = 1.6; this.cdQ = LAAT_CFG.abilities[0].cd; G.sound.whoosh(this.pos); G.sound.ability('riot'); }
    if (input.hit('KeyG') && this.cdG <= 0) this.dropBomb();
    if (input.hit('KeyF') && this.special >= 100) this.fireRockets();
    if (input.hit('KeyE')) this.spot();
    this.scanCD -= dt;
    // desired velocity
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const speed = this.burnT > 0 ? BURNER : input.down('ShiftLeft') ? BOOST : SPEED;
    // right of the heading is (-cos, 0, sin) in this game's yaw convention
    _a.set(fx * fwd * speed - fz * side * STRAFE, up * CLIMB, fz * fwd * speed + fx * side * STRAFE);
    if (this.burnT > 0 && fwd <= 0.1) { _a.x += fx * BURNER * 0.8; _a.z += fz * BURNER * 0.8; }
    // landing assist: coming down near the ground, the gunship flares to a gentle touchdown (Shift dives through it)
    if (up < 0 && !this.landed) {
      const below = G.world.groundAt(this.pos.x, this.pos.z, this.pos.y + 0.4, 2.6, 0.6);
      const agl = below > -1e9 ? this.pos.y - below : 99;
      if (input.down('ShiftLeft')) _a.y = -18;
      else if (agl < 9) _a.y = -Math.max(2.5, CLIMB * agl / 9);
    }
    if (this.landed) {
      // on the skids: nothing until you climb away
      this.vel.set(0, 0, 0);
      if (up > 0) { this.landed = false; this.vel.y = 4; G.fx.dust(this.pos, 26, 2); G.sound.flyby(this.pos, 0.6); }
      else {
        this.hp = Math.min(this.maxHp, this.hp + 30 * dt);
        this.special = Math.min(100, this.special + 4 * dt);
        this.heat = Math.max(0, this.heat - 60 * dt);
      }
    } else {
      const k = this.burnT > 0 ? 3.5 : 2.2;
      this.vel.x = damp(this.vel.x, _a.x, k, dt);
      this.vel.z = damp(this.vel.z, _a.z, k, dt);
      this.vel.y = damp(this.vel.y, _a.y + Math.sin(G.time * 1.3) * 0.25, 3, dt);
    }
    // move, then the world pushes back (and a hard knock means a crash)
    const before = _b.copy(this.pos);
    this.pos.addScaledVector(this.vel, dt);
    const hspeed = Math.hypot(this.vel.x, this.vel.z);
    if (world.resolve(this.pos, 3.2, 3.0, 0.6)) {
      if (hspeed > 17) { this.crash('CRASHED INTO A BUILDING'); return; }
      // a scrape: lose the speed into the wall, and some hull
      this.vel.x = (this.pos.x - before.x) / Math.max(dt, 1e-4);
      this.vel.z = (this.pos.z - before.z) / Math.max(dt, 1e-4);
      if (hspeed > 8) { this.hurt(hspeed * 0.8, this.pos); G.fx.sparks(_c.copy(this.pos).setY(this.pos.y + 1.2), _dir.set(0, 1, 0), 0xffc070, 14, 6); G.sound.impact(this.pos, 'metal'); }
    }
    // the play area, and a ceiling
    const fo = ar.flyOutside;
    if (fo) {
      const dx = this.pos.x - fo.x, dz = this.pos.z - fo.z, d = Math.hypot(dx, dz) || 1;
      if (d > fo.rMax) { this.pos.x = fo.x + (dx / d) * fo.rMax; this.pos.z = fo.z + (dz / d) * fo.rMax; }
      if (this.pos.y < fo.yMin) { this.pos.y = fo.yMin; this.vel.y = Math.max(0, this.vel.y); }
    } else {
      const fb = ar.flyBounds || ar.bounds;
      this.pos.x = clamp(this.pos.x, fb.minX, fb.maxX);
      this.pos.z = clamp(this.pos.z, fb.minZ, fb.maxZ);
    }
    if (this.pos.y > ar.y + 75) { this.pos.y = ar.y + 75; this.vel.y = Math.min(0, this.vel.y); }
    // the ground: settle on it gently, or crash into it
    const g = world.groundAt(this.pos.x, this.pos.z, this.pos.y + 0.4, 2.6, 0.6);
    if (!this.landed && g > -1e9 && this.pos.y <= g) {
      const down = -this.vel.y;
      if (down > 8 || hspeed > 18) { this.pos.y = g; this.crash('CRASH LANDING'); return; }
      this.pos.y = g;
      this.landed = true;
      this.vel.set(0, 0, 0);
      G.fx.dust(this.pos, 30, 2.2);
      G.sound.thump(this.pos);
      G.hud.toast('LANDED · REPAIRING AND RELOADING');
    } else if (this.landed && (g < -1e9 || this.pos.y > g + 0.3)) this.landed = false;
    if (this.pos.y < ar.y - 25) { this.crash('LOST CONTROL'); return; }
    // the model: banking into turns and strafes, nose down when flying fast
    const turn = angleDiff(this.yaw, this.camYaw);
    this.bank = damp(this.bank, this.landed ? 0 : clamp(-turn * 0.6 - side * 0.25, -0.5, 0.5), 3, dt);
    this.tilt = damp(this.tilt, this.landed ? 0 : clamp(fwd * 0.12 + (this.burnT > 0 ? 0.15 : 0), -0.15, 0.3), 3, dt);
    this.model.position.copy(this.pos);
    this.model.rotation.set(this.tilt, this.yaw, this.bank, 'YXZ');
    if (!this.landed) this.thrusters(this.burnT > 0 ? 2.2 : 1.2);
    // guns
    this.updateGuns(dt);
    // the hull patches itself slowly once you are out of the fire
    if (!this.landed && G.time - this.lastHurt > 6) this.hp = Math.min(this.maxHp, this.hp + 10 * dt);
    this.combat -= dt;
  }

  thrusters(k) {
    const G = this.G;
    if (Math.random() > 0.75) return;
    this.model.updateMatrixWorld();
    const q = this.model.getWorldQuaternion(_q);
    for (const sx of [-1.05, 1.05]) G.fx.thruster(this.model.localToWorld(_a.set(sx, 2.3, -10.4)), _b.set(0, 0, -1).applyQuaternion(q), k);
  }

  updateGuns(dt) {
    const G = this.G, input = G.input;
    this.fireCD -= dt;
    if (this.overheat > 0) {
      this.overheat -= dt;
      this.heat = Math.max(0, this.heat - 40 * dt);
      if (input.hit('KeyR') && this.heat > 0) { this.overheat = Math.min(this.overheat, 0.25); G.sound.vent ? G.sound.vent() : 0; }
      return;
    }
    if (input.hit('KeyR') && this.heat > 25) { this.heat = 0; G.hud.toast('CANNONS VENTED'); }
    if (input.fireDown && this.fireCD <= 0) {
      this.fireCD = 0.085;
      this.combat = 1.5;
      const aimP = this.aimPoint(_c);
      this.model.updateMatrixWorld();
      const side = (this.muzzle++ % 2) ? 1 : -1;
      const from = this.model.localToWorld(new THREE.Vector3(side * 0.75, 1.05, 9.4));
      const dir = new THREE.Vector3().subVectors(aimP, from);
      if (dir.lengthSq() < 4) G.camera.getWorldDirection(dir);
      dir.normalize();
      dir.x += rand(-0.012, 0.012); dir.y += rand(-0.012, 0.012); dir.z += rand(-0.012, 0.012);
      dir.normalize();
      G.combat.fireBolt({ from, dir, speed: 150, dmg: 36, team: 'friendly', owner: 'player', color: 0x3aa0ff, len: 3.4, width: 0.22 });
      G.fx.muzzle(from, dir, 0x3aa0ff, { light: 6, prio: 2, size: 0.8 });
      G.sound.shot('slug', from);
      G.input.pad.rumble(0.15, 0.3, 50);
      this.heat += 3.4;
      if (this.heat >= 100) { this.heat = 100; this.overheat = 2.4; G.sound.overheat ? G.sound.overheat() : 0; G.hud.toast('CANNONS OVERHEATED'); }
    } else if (this.fireCD < -0.25) this.heat = Math.max(0, this.heat - 38 * dt);
  }

  // ------------------------------------------------------------------ bomb
  dropBomb() {
    const G = this.G;
    this.cdG = LAAT_CFG.abilities[1].cd;
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 8), new THREE.MeshStandardMaterial({ color: 0x3a3e44, metalness: 0.7, roughness: 0.4, emissive: new THREE.Color(1.5, 0.2, 0.1), emissiveIntensity: 0.4 }));
    mesh.position.copy(this.pos).setY(this.pos.y - 0.2);
    G.scene.add(mesh);
    this.bombs.push({ mesh, vel: this.vel.clone().setY(Math.min(this.vel.y, 0) - 2), t: 0 });
    G.sound.whoosh(this.pos);
  }

  updateBombs(dt) {
    const G = this.G;
    for (let i = this.bombs.length - 1; i >= 0; i--) {
      const b = this.bombs[i], p = b.mesh.position;
      b.t += dt;
      b.vel.y -= 22 * dt;
      p.addScaledVector(b.vel, dt);
      const g = G.world.groundAt(p.x, p.z, p.y + 0.3, 0.2);
      if ((g > -1e9 && p.y <= g + 0.2) || b.t > 8) {
        if (g > -1e9) p.y = g + 0.3;
        G.combat.explode(p.clone(), 8, 260, 'player', 1.6);
        G.scene.remove(b.mesh);
        this.bombs.splice(i, 1);
      }
    }
  }

  // ------------------------------------------------------------------ rockets (the special)
  /** Ten rockets from the wing pods, each finding its own target near where you are aiming. */
  fireRockets() {
    const G = this.G;
    this.special = 0;
    const aimP = this.aimPoint(_c).clone();
    // lock on round the crosshair: anything within ~20 degrees of where you are looking (through windows too), nearest
    // the middle first; failing that, whatever is near the point you are aiming at
    const cam = G.camera, look = cam.getWorldDirection(new THREE.Vector3());
    const off = (e) => {
      _a.set(e.pos.x, e.chestY, e.pos.z).sub(cam.position);
      const d = _a.length();
      return d > 160 ? 9 : Math.acos(clamp(_a.dot(look) / Math.max(d, 1e-3), -1, 1));
    };
    const live = G.enemies.list.filter((e) => e.alive && e.state !== 'scripted');
    let targets = live.map((e) => [e, off(e)]).filter(([, a]) => a < 0.35).sort((a, b) => a[1] - b[1]).slice(0, 10).map(([e]) => e);
    if (!targets.length) targets = live.filter((e) => e.pos.distanceTo(aimP) < 45).sort((a, b) => a.pos.distanceTo(aimP) - b.pos.distanceTo(aimP)).slice(0, 10);
    if (aimP.distanceTo(this.pos) > 140) aimP.sub(this.pos).setLength(140).add(this.pos);
    this.model.updateMatrixWorld();
    const q = this.model.getWorldQuaternion(_q);
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 1.4, 0.6) });
    for (let i = 0; i < 10; i++) {
      const side = i % 2 ? 1 : -1;
      const from = this.model.localToWorld(new THREE.Vector3(side * (3.8 + (i % 3) * 0.4), 1.6, 1.5));
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 0.9, 6), mat);
      mesh.position.copy(from);
      G.scene.add(mesh);
      const vel = new THREE.Vector3(side * 6, 2, 22).applyQuaternion(q).add(this.vel);
      const t = targets.length ? targets[i % targets.length] : null;
      const spot = aimP.clone().add(new THREE.Vector3(rand(-4, 4), 0, rand(-4, 4)));
      this.rockets.push({ mesh, vel, target: t, pool: targets, spot, t: -i * 0.07, life: 6 });
    }
    G.hud.toast('ROCKET SALVO');
    G.sound.ability('barrage');
    G.sound.whoosh(this.pos);
    G.input.pad.rumble(0.6, 0.8, 400);
  }

  nearestFoe(at, range) {
    let best = null, bd = range;
    for (const e of this.G.enemies.list) {
      if (!e.alive || e.state === 'scripted') continue;
      const d = e.pos.distanceTo(at);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  updateRockets(dt) {
    const G = this.G;
    for (let i = this.rockets.length - 1; i >= 0; i--) {
      const r = this.rockets[i], p = r.mesh.position;
      r.t += dt;
      r.life -= dt;
      if (r.t < 0) continue; // staggered launch
      // its target already down: the next one from the salvo still standing, or anything else close by
      if (r.target && !r.target.alive) r.target = r.pool.find((e) => e.alive) || this.nearestFoe(p, 45);
      const goal = r.target ? _a.set(r.target.pos.x, r.target.chestY, r.target.pos.z) : r.spot;
      _b.subVectors(goal, p);
      const dist = _b.length();
      // steer toward the target, faster the longer it flies
      const sp = Math.min(95, 40 + r.t * 80);
      _b.multiplyScalar(sp / Math.max(dist, 0.01));
      r.vel.lerp(_b, 1 - Math.exp(-dt * (2 + r.t * 6)));
      const prev = _c.copy(p);
      p.addScaledVector(r.vel, dt);
      const council = G.city.temple.council, gh = council.glassHit(prev, p);
      if (gh && council.damagePane(gh.pane, 999)) G.combat.shatter(gh.pane, _dir.copy(r.vel).normalize());
      // close enough anywhere along this frame's path (at full speed a rocket covers 3 m a frame)
      _b.subVectors(p, prev);
      const s = clamp(_e.subVectors(goal, prev).dot(_b) / Math.max(_b.lengthSq(), 1e-6), 0, 1);
      const near = _e.copy(prev).addScaledVector(_b, s).distanceTo(goal) < 1.6;
      if (near) p.copy(_e);
      r.mesh.quaternion.setFromUnitVectors(_c.set(0, 1, 0), _dir.copy(r.vel).normalize());
      G.fx.fireTrail(p, 0.6);
      const g = G.world.groundAt(p.x, p.z, p.y + 0.3, 0.1);
      if (near || dist < 1.6 || (g > -1e9 && p.y <= g + 0.15) || r.life <= 0) {
        G.combat.explode(p.clone(), 6, 240, 'player', 1.3);
        G.scene.remove(r.mesh);
        this.rockets.splice(i, 1);
      }
    }
  }

  // ------------------------------------------------------------------ going down
  updateCrash(dt) {
    const G = this.G;
    this.deadT += dt;
    if (!this.wrecked) {
      // spinning down, trailing smoke and fire
      this.vel.y -= 16 * dt;
      this.vel.x *= 1 - dt * 0.3;
      this.vel.z *= 1 - dt * 0.3;
      this.pos.addScaledVector(this.vel, dt);
      this.yaw += this.spin * 2.4 * dt;
      this.bank += this.spin * 0.6 * dt;
      this.tilt = Math.min(0.7, this.tilt + dt * 0.4);
      this.model.position.copy(this.pos);
      this.model.rotation.set(this.tilt, this.yaw, this.bank, 'YXZ');
      G.fx.fireTrail(_a.copy(this.pos).setY(this.pos.y + 2), 1.4);
      if (Math.random() < 0.6) G.fx.smokePuff(_a.copy(this.pos).setY(this.pos.y + 2.5), 2, 0.12);
      const g = G.world.groundAt(this.pos.x, this.pos.z, this.pos.y + 0.4, 2.6, 0.6);
      if ((g > -1e9 && this.pos.y <= g) || this.pos.y < G.arena.y - 25 || this.deadT > 6) {
        if (g > -1e9) this.pos.y = Math.max(this.pos.y, g);
        this.explodeWreck();
      }
    } else if (Math.random() < 0.5) {
      // the wreck burns
      G.fx.fireTrail(_a.copy(this.pos).add(_b.set(rand(-2, 2), 1.5, rand(-3, 3))), 1.6);
      if (Math.random() < 0.3) G.fx.smokePuff(_a.copy(this.pos).setY(this.pos.y + 3), 2.6, 0.1);
    }
  }

  // ------------------------------------------------------------------ camera
  updateCamera(dt) {
    const G = this.G, cam = G.camera;
    if (!this.alive) {
      const t = this.deadT;
      cam.position.set(this.pos.x + Math.sin(this.camYaw + t * 0.25) * (16 + t * 2), this.pos.y + 8 + t, this.pos.z + Math.cos(this.camYaw + t * 0.25) * (16 + t * 2));
      cam.lookAt(this.pos.x, this.pos.y + 1, this.pos.z);
      return;
    }
    const k = this.aim;
    const dist = 17 - 7 * k, up = 4.6 - 1.4 * k;
    const pitch = this.camPitch;
    _dir.set(Math.sin(this.camYaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(this.camYaw) * Math.cos(pitch));
    _a.set(this.pos.x, this.pos.y + up, this.pos.z);
    _b.copy(_a).addScaledVector(_dir, -dist);
    // keep the camera out of walls
    _c.subVectors(_b, _a);
    const L = _c.length();
    _c.divideScalar(L);
    const hit = G.world.raycast(_a, _c, L + 0.5, 'shot');
    if (hit) _b.copy(_a).addScaledVector(_c, Math.max(2, hit.dist - 0.5));
    if (!this.camPos || this.camPos.distanceTo(_b) > 12) this.camPos = (this.camPos || new THREE.Vector3()).copy(_b);
    else this.camPos.lerp(_b, 1 - Math.exp(-dt * 14));
    cam.position.copy(this.camPos);
    cam.lookAt(_a.addScaledVector(_dir, 40));
    const fov = 72 - 20 * k + (this.burnT > 0 ? 8 : 0);
    if (Math.abs(cam.fov - fov) > 0.3) { cam.fov = damp(cam.fov, fov, 8, dt); cam.updateProjectionMatrix(); G.onFovChange(); }
  }

  abilityState(i) {
    const ab = this.cfg.abilities[i];
    if (i === 0) return { frac: clamp(this.cdQ / ab.cd, 0, 1), ready: this.cdQ <= 0, active: this.burnT > 0, time: this.cdQ > 0 ? String(Math.ceil(this.cdQ)) : '', count: '' };
    if (i === 1) return { frac: clamp(this.cdG / ab.cd, 0, 1), ready: this.cdG <= 0, active: false, time: this.cdG > 0 ? String(Math.ceil(this.cdG)) : '', count: '' };
    return { frac: 1 - this.special / 100, ready: this.special >= 100, active: this.rockets.length > 0, time: '', count: '' };
  }

  grenadeText() { return this.landed ? 'LANDED · REPAIRING' : ''; }
}
