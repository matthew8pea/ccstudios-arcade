import * as THREE from 'three';
import { clamp, rand, randInt, pick, angleDiff, dampAngle, yawTo, segSegDist2, segSphere, spreadDir, TAU } from './util.js';

export const ENEMY_TYPES = {
  b1: {
    name: 'B1 Battle Droid', model: 'b1', hp: 40, speed: 2.1, moveAnim: 'Walk', animRef: 1.25,
    range: [13, 26], fireRange: 46, fireCD: [1.1, 2.0], burst: [1, 2], gap: 0.22, dmg: 5, spread: 0.075,
    boltSpeed: 62, boltLen: 2.1, color: 0xff3a24, score: 100, radius: 0.34, height: 1.86, headR: 0.13, headUp: 0.12,
    muzzles: ['muzzle'], sfx: 'droid',
  },
  b2: {
    name: 'B2 Super Battle Droid', model: 'b2', hp: 260, speed: 1.65, moveAnim: 'Walk', animRef: 1.0,
    range: [8, 20], fireRange: 40, fireCD: [1.8, 2.6], burst: [3, 4], gap: 0.14, dmg: 6, spread: 0.055,
    boltSpeed: 64, boltLen: 2.3, boltWidth: 0.15, color: 0xff3a24, score: 300, radius: 0.55, height: 1.9, headR: 0.14, headUp: 0.06, headMult: 1.5,
    muzzles: ['muzzle_R', 'muzzle_L'], sfx: 'b2',
  },
  b2_rocket: {
    name: 'B2-RP Rocket Droid', model: 'b2_rocket', hp: 150, speed: 7.5, flying: true,
    range: [13, 22], fireRange: 44, fireCD: [1.6, 2.5], burst: [2, 3], gap: 0.18, dmg: 6, spread: 0.055,
    boltSpeed: 64, boltLen: 2.3, boltWidth: 0.15, color: 0xff3a24, score: 350, radius: 0.58, height: 1.9, headR: 0.14, headUp: 0.06, headMult: 1.5,
    muzzles: ['muzzle_R', 'muzzle_L'], sfx: 'b2',
  },
  commando: {
    name: 'BX Commando Droid', model: 'commando', hp: 110, speed: 6.0, moveAnim: 'Run', animRef: 4.0,
    range: [4, 10], fireRange: 34, fireCD: [0.55, 0.9], burst: [1, 2], gap: 0.12, dmg: 7, spread: 0.05,
    boltSpeed: 72, boltLen: 2.3, color: 0xff3a24, score: 250, radius: 0.36, height: 1.86, headR: 0.12, headUp: 0.12,
    muzzles: ['muzzle'], sfx: 'droid', strafe: true, melee: { range: 1.9, dmg: 16, cd: 1.1 },
  },
  rebel_clone: {
    name: 'Rebel Clone', model: 'rebel_clone', hp: 150, speed: 4.6, moveAnim: 'Run', animRef: 4.2,
    range: [13, 24], fireRange: 48, fireCD: [1.0, 1.6], burst: [3, 3], gap: 0.13, dmg: 8, spread: 0.028,
    boltSpeed: 82, boltLen: 2.5, color: 0x52ff4a, score: 500, radius: 0.36, height: 1.84, headR: 0.15, headUp: 0.12,
    muzzles: ['muzzle'], sfx: 'rebel', strafe: true,
  },
  // --- Act IV, Order 66: the Grand Army itself, every unit, hunting Master Yoda (red-lit visors mark them out
  // from your own loyal troopers, who never received the order)
  clone_212: {
    name: '212th Clone Trooper', model: 'trooper_212', hp: 150, speed: 4.6, moveAnim: 'Run', animRef: 4.2, order66: true,
    range: [12, 24], fireRange: 48, fireCD: [1.0, 1.5], burst: [3, 3], gap: 0.13, dmg: 8, spread: 0.028,
    boltSpeed: 84, boltLen: 2.5, color: 0xff5040, score: 450, radius: 0.36, height: 1.84, headR: 0.15, headUp: 0.12,
    muzzles: ['muzzle'], sfx: 'rebel', strafe: true,
  },
  clone_guard: {
    name: 'Coruscant Guard Trooper', model: 'trooper_guard', hp: 130, speed: 5.1, moveAnim: 'Run', animRef: 4.2, order66: true,
    range: [9, 18], fireRange: 40, fireCD: [0.8, 1.3], burst: [4, 4], gap: 0.11, dmg: 7, spread: 0.034,
    boltSpeed: 84, boltLen: 2.3, color: 0xff5040, score: 450, radius: 0.36, height: 1.84, headR: 0.15, headUp: 0.12,
    muzzles: ['muzzle'], sfx: 'rebel', strafe: true,
  },
  clone_41st: {
    name: '41st Elite Trooper', model: 'clone_trooper', hp: 170, speed: 4.3, moveAnim: 'Run', animRef: 4.2, order66: true,
    range: [15, 28], fireRange: 54, fireCD: [1.1, 1.7], burst: [3, 3], gap: 0.14, dmg: 9, spread: 0.02,
    boltSpeed: 88, boltLen: 2.6, color: 0xff5040, score: 500, radius: 0.36, height: 1.84, headR: 0.15, headUp: 0.12,
    muzzles: ['muzzle'], sfx: 'rebel', strafe: true,
  },
  // --- Tatooine: the desert peoples, turned by Count Dooku's mind tricks
  jawa: {
    name: 'Jawa', model: 'jawa', hp: 45, speed: 4.4, moveAnim: 'Run', animRef: 3.2,
    range: [5, 12], fireRange: 21, fireCD: [1.5, 2.3], burst: [1, 1], gap: 0.2, dmg: 3.4, spread: 0.12, pellets: 6,
    boltSpeed: 58, boltLen: 0.9, boltWidth: 0.11, color: 0xffa83a, score: 120, radius: 0.3, height: 1.02, headR: 0.13, headUp: 0.02,
    muzzles: ['muzzle'], sfx: 'scatter', strafe: true, organic: true,
  },
  tusken_sniper: {
    name: 'Tusken Raider', model: 'tusken_sniper', hp: 95, speed: 3.4, moveAnim: 'Run', animRef: 4.2,
    range: [26, 60], fireRange: 82, fireCD: [3.0, 4.2], burst: [1, 1], gap: 0.1, dmg: 30, spread: 0.009,
    boltSpeed: 165, boltLen: 3.2, boltWidth: 0.05, color: 0xfff1c4, score: 300, radius: 0.36, height: 1.82, headR: 0.14, headUp: 0.1,
    muzzles: ['muzzle'], sfx: 'slug', organic: true, sniper: true, glint: 0.95,
  },
  tusken_melee: {
    name: 'Tusken Warrior', model: 'tusken_melee', hp: 140, speed: 5.3, moveAnim: 'Run', animRef: 4.6,
    range: [0, 1.7], fireRange: 0, fireCD: [99, 99], burst: [0, 0], gap: 0.1, dmg: 0, spread: 0,
    color: 0xffffff, score: 250, radius: 0.38, height: 1.86, headR: 0.15, headUp: 0.1,
    muzzles: [], sfx: 'slug', organic: true, melee: { range: 2.5, dmg: 24, cd: 1.45, swing: true },
  },
  dooku: {
    name: 'Count Dooku', model: 'dooku', hp: 2600, speed: 4.4, moveAnim: 'Run', animRef: 4.4,
    range: [1.8, 3], fireRange: 0, fireCD: [99, 99], burst: [0, 0], gap: 0.1, dmg: 0, spread: 0,
    color: 0xff3a24, score: 5000, radius: 0.4, height: 1.92, headR: 0.13, headUp: 0.06, headMult: 1.2,
    muzzles: [], sfx: 'droid', organic: true, boss: true,
  },
};

/** Enemy classes by type (Count Dooku registers his own from dooku.js). */
export const ENEMY_CLASSES = {};

const JAWA_LINES = ['Utinni!', 'Utinni!', 'Utinni, utinni!'];

const B1_LINES = ['Roger, roger.', 'Uh oh.', 'Clankers, er, I mean, clones!', 'Blast them!', 'Hey, you!', 'Stop right there!'];
const ORDER66_LINES = ['There he is! The Jedi!', 'Execute the order!', 'Traitors, all of you!', 'Good soldiers follow orders.', 'For the Republic!', 'Bring down the Jedi!'];
const REBEL_LINES = ['You picked the wrong side, brother.', 'No more orders!', 'For freedom, not the Chancellor!', "You're next, Commander!"];

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _eye = new THREE.Vector3();
const _tc = new THREE.Vector3();
const _p0 = new THREE.Vector3();
const _p1 = new THREE.Vector3();

export class Enemy {
  constructor(G, type) {
    this.G = G;
    this.type = type;
    this.cfg = ENEMY_TYPES[type];
    this.char = G.pool.get(this.cfg.model);
    this.pos = this.char.group.position;
    // Order 66: the visor glows red (pooled characters have their own materials, so your squad's stay dark)
    if (this.cfg.order66) for (const m of this.char.materials) if (m.name === 'Visor') { m.emissive.set('#ff2a14'); m.emissiveIntensity = 2.2; }
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    const wave = Math.max(1, G.waves ? G.waves.wave : 1);
    this.maxHp = this.hp = Math.round(this.cfg.hp * (1 + (wave - 1) * 0.04));
    this.dmgMul = 1 + (wave - 1) * 0.05;
    this.spreadMul = Math.max(0.6, 1 - (wave - 1) * 0.035);
    this.state = 'active';
    this.alive = true;
    this.target = null;
    this.think = 0;
    this.los = false;
    this.fireCD = rand(1.0, 2.2);
    this.burst = 0;
    this.burstT = 0;
    this.muzzleIdx = 0;
    this.strafeDir = Math.random() < 0.5 ? -1 : 1;
    this.strafeT = rand(1, 3);
    this.navP = new THREE.Vector3();
    this.flash = 0;
    this.deadT = 0;
    this.meleeCD = 0;
    this.t = 0;
    this.head = new THREE.Vector3();
    this.muzzle = new THREE.Vector3();
    this.orbitAng = rand(0, TAU);
    this.orbitDir = Math.random() < 0.5 ? -1 : 1;
    this.orbitR = rand(13, 21);
    this.alt = (G.arena ? G.arena.y : 0) + rand(6, 11);
    this.spin = new THREE.Vector3();
    this.removed = false;
    this.lineCD = rand(4, 12);
    this.stunT = 0;
    this.knockV = new THREE.Vector3();
    this.revealT = -99; // minimap: shown for a moment after firing
    this.spottedT = -99;
    this.playerDamaged = false;
  }

  /** Stunned droids lock up (and can be knocked back). B2s shrug it off faster. */
  stun(sec, knock) {
    this.stunT = Math.max(this.stunT, sec * (this.type === 'b2' ? 0.6 : 1));
    this.burst = 0;
    if (knock) { this.knockV.copy(knock); this.knockT = this.G.time; }
  }

  updateStunned(dt) {
    const G = this.G;
    this.stunT -= dt;
    if (this.knockV.lengthSq() > 0.01) {
      this.pos.addScaledVector(this.knockV, dt);
      this.knockV.multiplyScalar(Math.exp(-5 * dt));
      if (!this.cfg.flying) G.world.resolve(this.pos, this.cfg.radius, this.cfg.height);
    }
    if (!this.cfg.flying) this.settle(dt);
    if (Math.random() < dt * 9) G.fx.sparks(_v.set(this.pos.x + rand(-0.3, 0.3), this.pos.y + rand(0.6, 1.7), this.pos.z + rand(-0.3, 0.3)), _v2.set(0, 1, 0), 0x7fc8ff, 4, 3);
    this.char.play(this.cfg.flying ? 'Fly' : 'Idle', 0.2);
    this.char.twist = Math.sin(this.t * 31) * 0.12;
    if (this.stunT <= 0) this.char.twist = 0;
  }

  get chestY() { return this.pos.y + this.cfg.height * 0.68; }

  /**
   * Stand on whatever is underfoot. With nothing there (Force-pushed or knocked off a ledge) fall under gravity,
   * landing on whatever is below, or dying at the bottom of the drop (credited to whoever knocked it off).
   */
  settle(dt) {
    const G = this.G;
    const g = G.world.groundAt(this.pos.x, this.pos.z, this.pos.y + 0.2, 0.2);
    if (g > -1e9 && g >= this.pos.y - 0.7 && !(this.fallV < -1)) { this.pos.y = g; this.fallV = 0; return true; }
    this.fallV = (this.fallV || 0) - 22 * dt;
    this.pos.y += this.fallV * dt;
    if (g > -1e9 && this.pos.y <= g) {
      if (this.fallV < -9) { G.fx.dust(this.pos, 10); G.sound.thump(this.pos); }
      this.pos.y = g;
      this.fallV = 0;
      return true;
    }
    if (this.pos.y < G.arena.y - 25 && this.alive) this.damage(1e6, null, false, G.time - (this.knockT ?? -9) < 5 ? 'player' : 'trooper');
    return false;
  }

  spawn(mode, opts = {}) {
    const c = this.char;
    this.mode = mode;
    this.inside = false;
    if (mode === 'gate') {
      const g = opts.gate;
      const side = new THREE.Vector3(-g.dir.z, 0, g.dir.x);
      this.pos.copy(g.pos).addScaledVector(side, opts.offset ?? rand(-2.2, 2.2)).addScaledVector(g.dir, opts.back ?? 0);
      for (let i = 0; i < 24 && this.G.world.groundAt(this.pos.x, this.pos.z, this.pos.y + 0.5, 0.2) < -1e9; i++) this.pos.addScaledVector(g.dir, 0.5);
      this.yaw = yawTo(g.dir.x, g.dir.z);
      this.state = 'active';
      this.fallV = 0;
    } else if (mode === 'door') {
      const d = opts.door;
      d.openFor(2.8);
      if (d.ramp) {
        // down the sandcrawler's ramp, two at a time
        const top = d.ramp.top, foot = d.ramp.foot;
        this.pos.copy(top).add(_v.set(rand(-1.6, 1.6), 0, 0));
        this.emergeDir = _v2.subVectors(foot, top).setY(0).normalize().clone();
        this.ramp = { y0: top.y, y1: foot.y, len: Math.hypot(foot.x - top.x, foot.z - top.z), z0: top.clone() };
        this.stateT = this.ramp.len / 2.6;
      } else {
        this.G.sound.door(d.pos);
        this.pos.copy(d.pos).addScaledVector(d.dir, -1.4);
        this.emergeDir = d.dir.clone();
        this.stateT = 0.85;
      }
      this.yaw = yawTo(this.emergeDir.x, this.emergeDir.z);
      this.state = 'emerge';
    } else if (mode === 'drop') {
      this.pos.copy(opts.at);
      this.dropY = opts.at.y;
      this.pos.y = opts.at.y + (opts.height ?? 30);
      this.vel.set(0, opts.height ? -1.5 : -4, 0);
      this.state = 'drop';
    } else if (mode === 'rise') {
      this.pos.copy(opts.at);
      this.state = 'rise';
      this.yaw = yawTo(-this.pos.x, -this.pos.z);
    } else if (mode === 'scripted') {
      this.pos.copy(opts.at);
      this.state = 'scripted';
    } else if (mode === 'perch') {
      // a Tusken sniper leaps up onto a rock pillar and stays there
      const pr = opts.perch;
      pr.taken = this;
      this.perch = pr;
      this.pos.copy(pr.pos);
      this.dropY = pr.pos.y;
      this.pos.y = pr.pos.y + 2.4;
      this.vel.set(0, 3, 0);
      this.state = 'drop';
    }
    c.yaw = this.yaw;
    c.play(this.cfg.flying ? 'Fly' : 'Idle', 0);
    if (this.cfg.flying) this.G.sound.whoosh(this.pos);
  }

  pickTarget() {
    const G = this.G;
    const p = G.player, a = G.ally;
    if (this.state === 'scripted') return;
    if (!p) { this.target = null; return; }
    if (!p.alive) { this.target = a || null; return; }
    if (!this.target || this.target.alive === false || Math.random() < 0.08) {
      // the player, the other commander, or one of the clone squad
      const sq = G.squad ? G.squad.targets() : [];
      const r = Math.random();
      this.target = a && r < 0.2 ? a : sq.length && r < 0.45 ? pick(sq) : p;
    }
  }

  targetPos(out) {
    const t = this.target;
    return out.set(t.pos.x, t.pos.y + 1.25, t.pos.z);
  }

  update(dt) {
    const G = this.G;
    this.t += dt;
    if (this.flash > 0) {
      this.flash -= dt;
      this.char.setFlash(this.flash > 0 ? 0.9 : 0);
    }
    if (!this.alive) { this.updateDead(dt); this.char.update(dt); return; }

    switch (this.state) {
      case 'emerge':
        this.stateT -= dt;
        if (this.ramp) {
          this.pos.addScaledVector(this.emergeDir, 2.6 * dt);
          const k = Math.min(1, Math.hypot(this.pos.x - this.ramp.z0.x, this.pos.z - this.ramp.z0.z) / this.ramp.len);
          this.pos.y = this.ramp.y0 + (this.ramp.y1 - this.ramp.y0) * k;
          if (this.stateT <= 0) this.ramp = null;
        } else this.pos.addScaledVector(this.emergeDir, 2.2 * dt);
        this.char.play(this.cfg.moveAnim || 'Idle', 0.15, { timeScale: 1.2 });
        if (this.stateT <= 0) this.state = 'active';
        break;
      case 'flee': {
        // freed from the mind trick: away from the farm and out of the arena
        const b = G.arena.bounds;
        this.fleeDir ||= _v2.set(this.pos.x - G.arena.center.x, 0, this.pos.z - G.arena.center.z).normalize().clone();
        this.pos.addScaledVector(this.fleeDir, this.cfg.speed * 1.1 * dt);
        this.yaw = dampAngle(this.yaw, yawTo(this.fleeDir.x, this.fleeDir.z), 6, dt);
        const g = G.world.groundAt(this.pos.x, this.pos.z, this.pos.y + 0.6, 0.2);
        if (g > -1e9) this.pos.y = g;
        this.char.play(this.cfg.moveAnim || 'Run', 0.3);
        this.char.pitch *= 0.9;
        this.fleeT = (this.fleeT || 0) + dt;
        if (this.fleeT > 2.5) this.char.setOpacity(Math.max(0, 1 - (this.fleeT - 2.5) / 2));
        if (this.fleeT > 4.5 || this.pos.x < b.minX - 6 || this.pos.x > b.maxX + 6 || this.pos.z < b.minZ - 6 || this.pos.z > b.maxZ + 6) { this.alive = false; this.removed = true; }
        break;
      }
      case 'drop':
        this.vel.y -= 22 * dt;
        this.pos.addScaledVector(this.vel, dt);
        if (this.pos.y <= this.dropY) {
          this.pos.y = this.dropY;
          this.vel.set(0, 0, 0);
          G.fx.dust(this.pos, 16);
          G.sound.thump(this.pos);
          this.state = 'land';
          this.stateT = 0.45;
        }
        break;
      case 'land':
        this.stateT -= dt;
        if (this.stateT <= 0) this.state = 'active';
        break;
      case 'rise':
        this.pos.y += 13 * dt;
        {
          // drift in over the arena while rising
          const b = G.arena.bounds;
          this.pos.x += (this.pos.x < b.minX ? 3 : this.pos.x > b.maxX ? -3 : 0) * dt;
          this.pos.z += (this.pos.z < b.minZ ? 3 : this.pos.z > b.maxZ ? -3 : 0) * dt;
        }
        if (this.pos.y > this.alt) this.state = 'active';
        break;
      case 'scripted':
        break;
      default:
        if (this.stunT > 0) this.updateStunned(dt);
        else if (this.cfg.flying) this.updateFlying(dt); else this.updateGround(dt);
    }

    this.char.yaw = this.yaw;
    this.char.update(dt);
    if (this.char.bones.head) this.char.bones.head.getWorldPosition(this.head);
    else this.head.set(this.pos.x, this.pos.y + this.cfg.height - 0.1, this.pos.z);
    this.head.y += this.cfg.headUp;

    if (this.cfg.flying) {
      const k = this.state === 'rise' ? 1.4 : 1;
      for (const b of ['thrust_L', 'thrust_R']) {
        if (!this.char.bones[b]) continue;
        this.char.bones[b].getWorldPosition(_v);
        _v2.set(0, -1, 0).applyQuaternion(this.char.group.quaternion);
        G.fx.thruster(_v, _v2, k);
      }
    }

    // a sniper's scope glints for a moment before it fires
    if (this.aiming > 0 && this.state === 'active' && this.stunT <= 0) {
      this.aiming -= dt;
      if (Math.random() < 0.5) {
        this.char.boneWorld('muzzle', _v);
        G.fx.star(_v, 0xfff4d0, 0.55 + Math.random() * 0.35, 0.05);
      }
      if (this.aiming <= 0) this.fireOne();
    } else if (this.stunT > 0) this.aiming = 0;
    // burst fire
    if (this.burst > 0 && this.state === 'active' && this.stunT <= 0) {
      this.burstT -= dt;
      if (this.burstT <= 0) {
        this.fireOne();
        this.burst--;
        this.burstT = this.cfg.gap;
      }
    }
  }

  updateGround(dt) {
    const G = this.G, cfg = this.cfg;
    // going over the edge: nothing to do but fall
    if (this.fallV < -1) { this.settle(dt); this.char.pitch *= 0.9; return; }
    const b = G.arena.bounds;
    if (!this.inside && b && this.pos.x > b.minX + 1 && this.pos.x < b.maxX - 1 && this.pos.z > b.minZ + 1 && this.pos.z < b.maxZ - 1) this.inside = true;
    // still out in a gateway or on an entry bridge: push into the arena (shooting on the way), no holding there
    const entering = !this.inside && b && !cfg.boss && !this.perch;
    this.think -= dt;
    if (this.think <= 0) {
      this.think = rand(0.22, 0.35);
      this.pickTarget();
      if (this.target) {
        _eye.set(this.pos.x, this.pos.y + 1.55, this.pos.z);
        this.los = !G.world.blocked(_eye, this.targetPos(_tc));
        G.world.navTarget(this.pos, this.target.pos, cfg.radius, this.navP);
      }
      // slicer duty: head for the uplink instead (still shooting on the way)
      if (this.goal) G.world.navTarget(this.pos, this.goal, cfg.radius, this.navP);
      if (entering) G.world.navTarget(this.pos, _tc.set(clamp(this.pos.x, b.minX + 6, b.maxX - 6), this.pos.y, clamp(this.pos.z, b.minZ + 6, b.maxZ - 6)), cfg.radius, this.navP);
    }
    const tgt = this.target;
    // a Tusken warrior mid war cry or mid swing stands its ground
    if (this.actT > 0) {
      this.actT -= dt;
      if (tgt) this.yaw = dampAngle(this.yaw, yawTo(tgt.pos.x - this.pos.x, tgt.pos.z - this.pos.z), 8, dt);
      if (this.swingHit > 0) {
        this.swingHit -= dt;
        if (this.swingHit <= 0 && tgt) this.meleeHit(tgt);
      }
      const g0 = G.world.groundAt(this.pos.x, this.pos.z, this.pos.y + 0.2, 0.2);
      if (g0 > -1e9) this.pos.y = g0;
      this.char.pitch *= 0.85;
      return;
    }
    if (!tgt) {
      // nobody to fight yet (end of the intro): march toward the tower
      const c = G.arena.center;
      const rx = (c.x - this.pos.x) * 0.6, rz = c.z + 14 - this.pos.z;
      const rl = Math.hypot(rx, rz);
      if (rl > 10) {
        this.pos.x += (rx / rl) * cfg.speed * dt;
        this.pos.z += (rz / rl) * cfg.speed * dt;
        this.yaw = dampAngle(this.yaw, yawTo(rx, rz), 5, dt);
        G.world.resolve(this.pos, cfg.radius, cfg.height);
        this.char.play(cfg.moveAnim, 0.2, { timeScale: clamp(cfg.speed / cfg.animRef, 0.6, 1.8) });
      } else this.char.play('Idle', 0.3);
      return;
    }
    const dx = tgt.pos.x - this.pos.x, dz = tgt.pos.z - this.pos.z;
    const dist = Math.hypot(dx, dz) || 0.001;
    let mx = 0, mz = 0, speed = cfg.speed;
    const gd = this.goal ? Math.hypot(this.goal.x - this.pos.x, this.goal.z - this.pos.z) : 0;
    const swinger = cfg.melee && cfg.melee.swing;
    if (swinger && !this.cried && this.los && dist < 13) {
      // the war cry: the gaffi stick shaken over the head, then the charge
      this.cried = true;
      this.actT = 1.05;
      this.char.play('Cry', 0.15, { restart: true });
      G.sound.tuskenCry(this.pos);
      return;
    }
    if (swinger && this.cried) speed *= 1.3;
    if (this.perch && this.perch.taken === this) {
      // sniping from the rock: stay up there
    } else if (this.goal && gd < 1.6) {
      // at the uplink: hold still and slice it
    } else if (this.goal || entering || !this.los || dist > cfg.range[1]) {
      const nx = this.navP.x - this.pos.x, nz = this.navP.z - this.pos.z;
      const nl = Math.hypot(nx, nz) || 1;
      mx = nx / nl; mz = nz / nl;
    } else if (dist < cfg.range[0]) {
      mx = -dx / dist; mz = -dz / dist; speed *= 0.7;
    } else if (cfg.strafe) {
      this.strafeT -= dt;
      if (this.strafeT <= 0) { this.strafeT = rand(1.2, 2.8); this.strafeDir *= -1; }
      mx = (-dz / dist) * this.strafeDir; mz = (dx / dist) * this.strafeDir;
      speed *= 0.6;
      if (this.type === 'commando') { mx += (dx / dist) * 0.5; mz += (dz / dist) * 0.5; }
    } else if (this.type === 'b1' && dist > cfg.range[0] + 5 && Math.sin(this.t * 0.7 + this.orbitAng) > 0.6) {
      mx = dx / dist; mz = dz / dist; speed *= 0.8;
    }
    // separation
    for (const o of G.enemies.list) {
      if (o === this || !o.alive || o.cfg.flying) continue;
      const ox = this.pos.x - o.pos.x, oz = this.pos.z - o.pos.z;
      const d2 = ox * ox + oz * oz, rr = cfg.radius + o.cfg.radius + 0.35;
      if (d2 < rr * rr && d2 > 1e-6) {
        const d = Math.sqrt(d2);
        this.pos.x += (ox / d) * (rr - d) * 0.5;
        this.pos.z += (oz / d) * (rr - d) * 0.5;
      }
    }
    const ml = Math.hypot(mx, mz);
    const moving = ml > 0.01;
    const px = this.pos.x, pz = this.pos.z;
    if (moving) {
      mx /= ml; mz /= ml;
      this.pos.x += mx * speed * dt;
      this.pos.z += mz * speed * dt;
    }
    G.world.resolve(this.pos, cfg.radius, cfg.height);
    if (this.inside && !cfg.boss && !this.perch) G.keepInArena(this.pos, cfg.radius);
    if (!(this.fallV < 0) && G.world.groundAt(this.pos.x, this.pos.z, this.pos.y + 0.2, 0.2) < -1e9) { this.pos.x = px; this.pos.z = pz; }
    this.settle(dt);

    const facingTarget = this.los && (dist < cfg.fireRange || (cfg.melee && dist < 5));
    const wantYaw = facingTarget ? yawTo(dx, dz) : moving ? yawTo(mx, mz) : this.yaw;
    this.yaw = dampAngle(this.yaw, wantYaw, 7, dt);
    // aim pitch
    if (facingTarget) {
      const dy = tgt.pos.y + 1.2 - (this.pos.y + 1.35);
      this.char.pitch = clamp(Math.atan2(dy, dist), -0.6, 0.6);
    } else this.char.pitch *= 0.9;

    if (moving) {
      const backwards = Math.cos(angleDiff(this.yaw, yawTo(mx, mz))) < -0.2;
      this.char.play(cfg.moveAnim, 0.2, { timeScale: (backwards ? -1 : 1) * clamp(speed / cfg.animRef, 0.6, 1.8) });
    } else this.char.play('Idle', 0.25);

    // shooting (snipers take aim first: the glint)
    this.fireCD -= dt;
    if (cfg.burst[1] > 0 && facingTarget && this.fireCD <= 0 && this.burst <= 0 && !(this.aiming > 0) && Math.abs(angleDiff(this.yaw, wantYaw)) < 0.4) {
      if (cfg.glint) {
        this.aiming = cfg.glint;
        this.fireCD = rand(cfg.fireCD[0], cfg.fireCD[1]) + cfg.glint;
      } else {
        this.burst = randInt(cfg.burst[0], cfg.burst[1]);
        this.burstT = 0.05;
        this.fireCD = rand(cfg.fireCD[0], cfg.fireCD[1]) + this.burst * cfg.gap;
      }
    }
    // melee: Tusken warriors swing the gaffi stick (the hit lands a beat into the swing)
    if (swinger) {
      this.meleeCD -= dt;
      if (dist < cfg.melee.range && this.meleeCD <= 0 && Math.abs(angleDiff(this.yaw, yawTo(dx, dz))) < 0.8) {
        this.meleeCD = cfg.melee.cd;
        this.actT = 0.62;
        this.swingHit = 0.3;
        this.char.play('Swing', 0.08, { loop: false, restart: true, timeScale: 1.1 });
        G.sound.whoosh(this.pos);
      }
    } else if (cfg.melee) {
      this.meleeCD -= dt;
      if (dist < cfg.melee.range && this.meleeCD <= 0) {
        this.meleeCD = cfg.melee.cd;
        if (tgt === G.player) tgt.hurt(cfg.melee.dmg * this.dmgMul, this.pos, this);
        G.sound.thump(this.pos);
        this.char.twist = 0.6;
        setTimeout(() => { this.char.twist = 0; }, 180);
      }
    }
    this.chatter(dt);
  }

  updateFlying(dt) {
    const G = this.G, cfg = this.cfg;
    this.think -= dt;
    if (this.think <= 0) {
      this.think = rand(0.25, 0.4);
      this.pickTarget();
      if (this.target) {
        _eye.set(this.pos.x, this.pos.y + 1.3, this.pos.z);
        this.los = !G.world.blocked(_eye, this.targetPos(_tc));
      }
      if (Math.random() < 0.05) this.orbitDir *= -1;
      if (Math.random() < 0.05) this.alt = G.arena.y + rand(6, 12);
    }
    const tgt = this.target;
    if (!tgt) return;
    this.orbitAng += dt * (6.5 / this.orbitR) * this.orbitDir;
    _v.set(tgt.pos.x + Math.sin(this.orbitAng) * this.orbitR, this.alt, tgt.pos.z + Math.cos(this.orbitAng) * this.orbitR);
    const fb = G.arena.flyBounds;
    _v.x = clamp(_v.x, fb.minX, fb.maxX);
    _v.z = clamp(_v.z, fb.minZ, fb.maxZ);
    if (G.arena.avoid) {
      // stay clear of the turbolift tower on the roof
      if (Math.abs(_v.x) < 10 && Math.abs(_v.z) < 10) _v.y = Math.max(_v.y, 20);
      if (Math.abs(this.pos.x) < 9 && Math.abs(this.pos.z) < 9 && this.pos.y < 18.5) _v.y = 21;
    }
    _v2.subVectors(_v, this.pos);
    const d = _v2.length();
    const sp = Math.min(cfg.speed, d * 1.2);
    if (d > 0.01) _v2.multiplyScalar(sp / d);
    this.vel.lerp(_v2, 1 - Math.exp(-2.5 * dt));
    this.pos.addScaledVector(this.vel, dt);
    const dx = tgt.pos.x - this.pos.x, dz = tgt.pos.z - this.pos.z;
    const hd = Math.hypot(dx, dz) || 0.001;
    this.yaw = dampAngle(this.yaw, yawTo(dx, dz), 5, dt);
    const dy = tgt.pos.y + 1.2 - (this.pos.y + 1.35);
    this.char.pitch = clamp(Math.atan2(dy, hd), -0.9, 0.5);
    this.char.group.rotation.z = clamp(-this.vel.dot(_v.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw))) * 0.03, -0.25, 0.25);
    this.char.play('Fly', 0.3);
    const dist3 = Math.hypot(hd, dy);
    this.fireCD -= dt;
    if (this.los && dist3 < cfg.fireRange && this.fireCD <= 0 && this.burst <= 0) {
      this.burst = randInt(cfg.burst[0], cfg.burst[1]);
      this.burstT = 0.05;
      this.fireCD = rand(cfg.fireCD[0], cfg.fireCD[1]) + this.burst * cfg.gap;
    }
  }

  /** A gaffi stick blow landing (if the target is still in reach and in front). */
  meleeHit(tgt) {
    const G = this.G, cfg = this.cfg;
    const dx = tgt.pos.x - this.pos.x, dz = tgt.pos.z - this.pos.z, d = Math.hypot(dx, dz);
    if (d > cfg.melee.range + 0.8 || Math.abs(angleDiff(this.yaw, yawTo(dx, dz))) > 1.1) return;
    const dmg = cfg.melee.dmg * this.dmgMul;
    if (tgt === G.player) {
      const p = G.player;
      if (p.cfg.melee && p.blocking) {
        // Yoda's blade turns the blow aside
        G.fx.sparks(_v.set(p.pos.x, p.pos.y + 0.7, p.pos.z), _v2.set(-dx / d, 0.3, -dz / d), 0x9dff7a, 12, 5);
        G.sound.saberClash(p.pos);
        this.stun(0.5);
        return;
      }
      p.hurt(dmg, this.pos, this);
      p.vel.x += (dx / d) * 4; p.vel.z += (dz / d) * 4;
    } else if (tgt.hurt) tgt.hurt(dmg);
    G.sound.thump(tgt.pos);
    G.fx.dust(_v.set(tgt.pos.x, tgt.pos.y, tgt.pos.z), 6, 0.6);
  }

  chatter(dt) {
    this.lineCD -= dt;
    if (this.lineCD > 0) return;
    this.lineCD = rand(10, 22);
    const G = this.G;
    if (this.type === 'jawa' && Math.random() < 0.6) { this.lineCD = rand(5, 12); G.sound.jawaChatter(this.pos); }
    if (this.type === 'tusken_sniper' && Math.random() < 0.25) G.sound.tuskenCry(this.pos, 0.4);
    if (!G.player || this.pos.distanceTo(G.player.pos) > 28 || Math.random() > 0.45) return;
    if (this.type === 'b1') G.speakWorld(pick(B1_LINES), this.pos, { pitch: 1.7, rate: 1.25, volume: 0.7 });
    else if (this.type === 'rebel_clone') G.speakWorld(pick(REBEL_LINES), this.pos, { pitch: 0.7, rate: 1.0, volume: 0.8 });
    else if (this.cfg.order66) G.speakWorld(pick(ORDER66_LINES), this.pos, { pitch: 0.74, rate: 1.02, volume: 0.8 });
    else if (this.type === 'jawa' && Math.random() < 0.4) G.speakWorld(pick(JAWA_LINES), this.pos, { pitch: 2, rate: 1.7, volume: 0.7 });
  }

  fireOne() {
    const G = this.G, cfg = this.cfg;
    if (!this.target) return;
    this.revealT = G.time;
    const mName = cfg.muzzles[this.muzzleIdx++ % cfg.muzzles.length];
    this.char.boneWorld(mName, this.muzzle);
    this.targetPos(_tc);
    _tc.y += rand(-0.25, 0.25);
    _v.subVectors(_tc, this.muzzle).normalize();
    for (let i = 0; i < (cfg.pellets || 1); i++) {
      spreadDir(_v, cfg.spread * this.spreadMul, _v2);
      G.combat.fireBolt({
        from: this.muzzle.clone(), dir: _v2.clone(), speed: cfg.boltSpeed * (cfg.pellets ? rand(0.9, 1.1) : 1), dmg: cfg.dmg * this.dmgMul,
        team: 'enemy', owner: this, color: cfg.color, len: cfg.boltLen || 2.1, width: cfg.boltWidth || 0.13, maxDist: cfg.pellets ? 40 : undefined,
      });
    }
    G.fx.muzzle(this.muzzle, _v2, cfg.color, { size: cfg.pellets ? 0.7 : 0.45, light: 3.5, smoke: !!cfg.organic });
    G.sound.shot(cfg.sfx, this.muzzle);
  }

  /** Segment test against head sphere + body capsule. Returns { t, head } or null. */
  hitTest(a, b) {
    if (!this.alive || this.state === 'drop' && this.pos.y > 25) return null;
    const cfg = this.cfg;
    let best = 2, head = false;
    const th = segSphere(a, b, this.head, cfg.headR);
    if (th >= 0) { best = th; head = true; }
    _p0.set(this.pos.x, this.pos.y + 0.3, this.pos.z);
    _p1.set(this.pos.x, this.pos.y + cfg.height * 0.8, this.pos.z);
    const r = segSegDist2(a, b, _p0, _p1);
    if (r.d2 < cfg.radius * cfg.radius && r.s < best - 0.002) { best = r.s; head = false; }
    return best <= 1 ? { t: best, head } : null;
  }

  damage(amount, dir, head, source) {
    if (!this.alive) return false;
    const mult = head ? (this.cfg.headMult || 2) : 1;
    if (source === 'player') this.playerDamaged = true;
    this.hp -= amount * mult;
    this.flash = 0.07;
    if (this.state === 'scripted' && this.hp > 0) return false;
    if (this.hp <= 0) { this.die(dir, head, source); return true; }
    if (this.target !== this.G.player && source === 'player' && Math.random() < 0.5) this.target = this.G.player;
    return false;
  }

  die(dir, head, source) {
    const G = this.G;
    this.alive = false;
    this.aiming = 0;
    if (this.perch && this.perch.taken === this) this.perch.taken = null;
    this.burst = 0;
    this.char.pitch = 0;
    this.char.twist = 0;
    this.char.setFlash(0);
    this.char.play('Death', 0.12, { loop: false });
    this.deadT = 0;
    if (this.cfg.flying) {
      this.vel.set(dir ? dir.x * 4 : 0, 3, dir ? dir.z * 4 : 0);
      this.spin.set(rand(-3, 3), rand(-4, 4), rand(-3, 3));
      G.combat.explode(_v.copy(this.pos).setY(this.pos.y + 1.3), 3.2, 40, 'enemy', 0.9);
    } else if (this.type === 'b2') {
      G.fx.sparks(_v.copy(this.pos).setY(this.pos.y + 1.4), new THREE.Vector3(0, 1, 0), 0xffb050, 26, 7);
      G.fx.smokePuff(_v, 1.2);
    } else if (this.cfg.organic) {
      G.fx.dust(this.pos, 8, 0.7);
      if (this.type === 'jawa') G.sound.jawaChatter(this.pos, 0.3);
    } else {
      G.fx.sparks(_v.copy(this.pos).setY(this.pos.y + 1.2), new THREE.Vector3(0, 1, 0), 0xffb050, 14, 5);
    }
    G.combat.onKill(this, head, source);
  }

  updateDead(dt) {
    const G = this.G;
    this.deadT += dt;
    if (this.cfg.flying && !this.crashed) {
      this.vel.y -= 16 * dt;
      this.pos.addScaledVector(this.vel, dt);
      const grp = this.char.group;
      grp.rotation.x += this.spin.x * dt;
      grp.rotation.z += this.spin.z * dt;
      this.yaw += this.spin.y * dt;
      grp.rotation.y = this.yaw;
      if (Math.random() < 0.8) G.fx.smokePuff(_v.copy(this.pos).setY(this.pos.y + 1.2), 0.8, 0.12);
      if (Math.random() < 0.5) G.fx.thruster(_v, _v2.set(0, 1, 0), 0.6);
      const g = G.world.groundAt(this.pos.x, this.pos.z, this.pos.y + 0.5, 0.3);
      if (g > -1e9 && this.pos.y <= g + 0.2) {
        this.crashed = true;
        this.pos.y = g;
        G.combat.explode(_v.copy(this.pos).setY(g + 0.5), 4.5, 70, 'enemy', 1.3);
        this.char.group.visible = false;
        this.deadT = 99;
      } else if (this.pos.y < G.arena.y - 60) {
        this.crashed = true;
        this.char.group.visible = false;
        this.deadT = 99;
      }
    } else {
      if (this.deadT > 3.2) this.char.setOpacity(Math.max(0, 1 - (this.deadT - 3.2) / 0.8));
    }
    if (this.deadT > 4.0) this.removed = true;
  }

  release() {
    if (this.perch && this.perch.taken === this) this.perch.taken = null;
    this.char.group.rotation.set(0, 0, 0);
    this.G.pool.release(this.char);
  }
}

export class EnemyManager {
  constructor(G) {
    this.G = G;
    this.list = [];
  }

  spawn(type, mode, opts) {
    const e = new (ENEMY_CLASSES[type] || Enemy)(this.G, type);
    e.spawn(mode, opts);
    this.list.push(e);
    return e;
  }

  aliveCount() {
    let n = 0;
    for (const e of this.list) if (e.alive && e.state !== 'scripted' && e.state !== 'flee') n++;
    return n;
  }

  /** Dooku is beaten: his hold on the Jawas and Tuskens breaks, and they scatter into the desert. */
  freeAll() {
    for (const e of this.list) {
      if (!e.alive || e.cfg.boss) continue;
      e.state = 'flee';
      e.burst = 0;
      e.aiming = 0;
      e.actT = 0;
      if (e.perch) { e.perch.taken = null; e.perch = null; }
    }
  }

  update(dt) {
    if (this.paused) {
      for (const e of this.list) if (e.cfg.boss || !e.alive) e.update(dt); else e.char.update(dt);
      return;
    }
    let jet = 0;
    const cam = this.G.camera.position;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const e = this.list[i];
      e.update(dt);
      if (e.cfg.flying && (e.alive || !e.crashed)) jet = Math.max(jet, 1 - e.pos.distanceTo(cam) / 45);
      if (e.removed) {
        e.release();
        this.list.splice(i, 1);
      }
    }
    this.G.sound.setJet(jet);
  }

  clear() {
    for (const e of this.list) e.release();
    this.list.length = 0;
  }
}
