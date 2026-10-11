import * as THREE from 'three';
import { clamp, lerp, damp, dampAngle, angleDiff, yawTo, rand, spreadDir, pick } from './util.js';

export const LOADOUTS = {
  cody: {
    name: 'Commander Cody', short: 'CMDR CODY', unit: '212th Attack Battalion', weapon: 'DC-15A BLASTER RIFLE',
    muzzles: ['muzzle'], interval: 0.15, dmg: 34, heat: 7.2, spread: 0.014, adsSpread: 0.0025,
    speed: 128, color: 0x3aa0ff, len: 2.7, width: 0.16, sfx: 'rifle', adsFov: 40, special: 'GUNSHIP BARRAGE',
    accent: '#e2761b', voice: { pitch: 0.82, rate: 1.0 }, tag: 'CODY', kit: { q: 'command', g: 'thermal', f: 'barrage' },
    lines: { command: "Two-twelfth, on me! Give 'em everything!", special: 'Gunships, fire on my mark!' },
    abilities: [
      { label: 'Q', icon: 'command', name: 'Battle Command', cd: 30 },
      { label: 'G', icon: 'thermal', name: 'Thermal Detonator', cd: 0.8 },
      { label: 'F', icon: 'barrage', name: 'Gunship Barrage' },
    ],
  },
  fox: {
    name: 'Commander Fox', short: 'CMDR FOX', unit: 'Coruscant Guard', weapon: 'TWIN DC-17 HAND BLASTERS',
    muzzles: ['muzzle_R', 'muzzle_L'], interval: 0.088, dmg: 19, heat: 4.1, spread: 0.022, adsSpread: 0.008,
    speed: 118, color: 0x3aa0ff, len: 2.0, width: 0.13, sfx: 'pistol', adsFov: 52, special: 'GUARD OVERDRIVE',
    accent: '#c0302a', voice: { pitch: 0.7, rate: 1.04 }, tag: 'FOX', kit: { q: 'riot', g: 'stun', f: 'overdrive' },
    lines: { special: 'Coruscant Guard, light them up!' },
    abilities: [
      { label: 'Q', icon: 'riot', name: 'Riot Charge', cd: 12 },
      { label: 'G', icon: 'stun', name: 'Stun Grenade', cd: 16 },
      { label: 'F', icon: 'overdrive', name: 'Guard Overdrive' },
    ],
  },
  gree: {
    name: 'Commander Gree', short: 'CMDR GREE', unit: '41st Elite Corps', weapon: 'DC-15S BLASTER CARBINE',
    muzzles: ['muzzle'], interval: 0.13, dmg: 30, heat: 6.4, spread: 0.016, adsSpread: 0.003,
    speed: 126, color: 0x3aa0ff, len: 2.6, width: 0.15, sfx: 'rifle', adsFov: 42, special: 'ELITE FUSILLADE',
    accent: '#55703a', voice: { pitch: 0.72, rate: 1.0 }, tag: 'GREE', kit: { q: 'command', g: 'thermal', f: 'overdrive' },
    lines: { command: 'Forty-first, form up and pour it on!', special: 'Forty-first, full fusillade! Now!' },
    abilities: [
      { label: 'Q', icon: 'command', name: 'Battle Command', cd: 30 },
      { label: 'G', icon: 'thermal', name: 'Thermal Detonator', cd: 0.8 },
      { label: 'F', icon: 'overdrive', name: 'Elite Fusillade' },
    ],
  },
  yoda: {
    name: 'Master Yoda', short: 'MASTER YODA', unit: 'Jedi Order', weapon: 'LIGHTSABER', melee: true,
    muzzles: [], interval: 0.3, dmg: 75, heat: 0, spread: 0, adsSpread: 0,
    speed: 0, color: 0x5dff4a, len: 0, width: 0, sfx: 'rifle', adsFov: 70, special: 'FORCE WAVE',
    accent: '#7fc43b', voice: { pitch: 1.65, rate: 0.78 }, tag: 'YODA', kit: { q: 'push', g: 'rush', f: 'wave' },
    cam: { dist: 2.1, side: 0.38, up: 0.9 }, height: 0.85, speedMul: 1.18, jump: 9.5, maxHp: 160,
    lines: { special: 'Strong with the Force, I am. Hmm!' },
    abilities: [
      { label: 'Q', icon: 'push', name: 'Force Push', cd: 9 },
      { label: 'G', icon: 'rush', name: 'Saber Rush', cd: 7 },
      { label: 'F', icon: 'wave', name: 'Force Wave' },
    ],
  },
};

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _right = new THREE.Vector3();
const _head = new THREE.Vector3();
const _from = new THREE.Vector3();
const _p0 = new THREE.Vector3();
const _p1 = new THREE.Vector3();
const _aim = new THREE.Vector3();
const _ang = { yaw: 0, pitch: 0, dist: 0 };
const VENT_SWEEP = 1.3; // seconds for the marker to cross the heat meter
const VENT_TIME = 2.6; // full slow cooldown
const REGEN_DELAY = 5;
const REGEN_RATE = 28;

export class Player {
  constructor(G, key) {
    this.G = G;
    this.key = key;
    this.cfg = LOADOUTS[key];
    this.char = G.chars[key];
    this.pos = this.char.group.position;
    this.vel = new THREE.Vector3();
    this.yaw = this.char.yaw;
    this.camYaw = this.yaw;
    this.camPitch = 0.06;
    this.maxHp = this.cfg.maxHp || 100;
    this.hp = this.maxHp;
    this.alive = true;
    this.lastHurt = -99;
    this.heat = 0;
    this.overheat = 0;
    this.fireCD = 0;
    this.muzzleIdx = 0;
    this.grenades = 3;
    this.grenadeCD = 0;
    this.special = 35;
    this.overdrive = 0;
    this.aim = 0;
    this.combat = 0;
    this.onGround = true;
    this.recoil = 0;
    this.bloom = 0;
    this.runDir = 1;
    this.deadT = 0;
    this.radius = 0.38;
    this.fov = 70;
    this.cdQ = 0;
    this.cdG = 0;
    this.buffT = 0;
    this.coolBuff = 0;
    this.dash = 0;
    this.dashDir = new THREE.Vector3();
    this.dashHits = new Set();
    this.vent = null;
    this.aimEnemy = null;
    this.lastAttacker = null;
    // movement extras: combat roll, crouch, shoulder swap, camera spring / recoil kick / bob
    this.roll = 0;
    this.rollDir = new THREE.Vector3();
    this.rollCD = 0;
    this.crouch = false;
    this.crouchK = 0;
    this.shoulder = 1;
    this.shoulderK = 1;
    this.camKick = 0;
    this.camPos = null;
    this.bob = 0;
    this.scanCD = 0;
    this.swingT = 0;
    this.blocking = false;
  }

  /** E: spot the droid under the crosshair (8 s), or send out a scan pulse that reveals droids nearby. */
  spot() {
    const G = this.G;
    const e = this.aimEnemy;
    if (e && e.alive) {
      e.spottedUntil = G.time + 8;
      G.sound.beep(e.pos);
      G.hud.toast('SPOTTED · ' + e.cfg.name.toUpperCase());
      return;
    }
    if (this.scanCD > 0) return;
    this.scanCD = 10;
    G.hud.radarPulse = G.time;
    G.sound.tone([1600, 2100], 0.08, 'sine', 0.12, 0.06);
    let n = 0;
    for (const o of G.enemies.list) {
      if (!o.alive || o.state === 'scripted' || o.pos.distanceTo(this.pos) > 35) continue;
      o.spottedUntil = Math.max(o.spottedUntil || 0, G.time + 4);
      n++;
    }
    if (n) G.hud.toast(`SCAN · ${n} HOSTILE${n > 1 ? 'S' : ''} REVEALED`);
  }

  /** Height of the hit capsule (crouching and rolling make you a smaller target). */
  get height() { const h = this.cfg.height || 1.75; return h - this.crouchK * h * 0.28 - (this.roll > 0 ? h * 0.34 : 0); }

  hurt(dmg, from, attacker = null) {
    const G = this.G;
    if (!this.alive || G.state !== 'playing' || this.dash > 0 || this.roll > 0.2) return; // riot charge and combat roll have i-frames
    if (G.dev && G.dev.god) return; // dev menu: invincibility
    this.hp -= dmg;
    this.lastHurt = G.time;
    if (attacker) this.lastAttacker = attacker;
    G.hud.damage(from, this.pos, this.camYaw, dmg, attacker);
    G.sound.hurt();
    G.input.pad.rumble(Math.min(1, dmg / 35), Math.min(1, dmg / 20), 140 + Math.min(260, dmg * 6));
    G.fx.shake = Math.min(1, G.fx.shake + dmg * 0.012);
    if (dmg >= 14 && G.post) G.post.kick(dmg * 0.012);
    if (this.hp <= 0) this.die();
  }

  die() {
    const G = this.G;
    this.hp = 0;
    this.alive = false;
    this.deadT = 0;
    this.char.pitch = this.char.twist = 0;
    this.char.play('Death', 0.12, { loop: false });
    const a = this.lastAttacker && G.time - this.lastHurt < 2 ? this.lastAttacker : null;
    this.killer = a;
    G.hud.killFeed(a ? a.cfg.name.toUpperCase() : 'EXPLOSION', 'sep', this.cfg.short, 'rep');
    G.onPlayerDeath();
  }

  get regenerating() { return this.alive && this.hp < this.maxHp && this.G.time - this.lastHurt > REGEN_DELAY; }

  /**
   * Controller look: the right stick turns at a rate. With aim assist on, turning slows while the crosshair is
   * over (or just off) a target, and pulling the aim trigger swings onto the nearest one near the crosshair.
   */
  padLook(dt) {
    const G = this.G, input = G.input, s = G.settings;
    const assist = input.padActive && s.padAssist !== false;
    const aimNow = input.aimDown && !this.cfg.melee;
    if (assist && aimNow && !this.wasAim) {
      const t = this.assistTarget(0.2);
      if (t) { this.snapE = t; this.snapT = 0.22; }
    }
    this.wasAim = aimNow;
    if (this.snapT > 0) {
      this.snapT -= dt;
      const e = this.snapE;
      if (e && e.alive && aimNow) {
        const a = this.angleTo(e), k = 1 - Math.exp(-dt * 16);
        this.camYaw += a.yaw * k;
        this.camPitch = clamp(this.camPitch + a.pitch * k, -1.0, 1.15);
      } else this.snapT = 0;
    }
    const lx = input.lookX, ly = input.lookY;
    if (!lx && !ly) return;
    const ads = this.aim > 0.5;
    let rate = (s.padSens || 1) * (ads ? 1.45 : 2.9);
    if (assist && this.assistTarget(ads ? 0.05 : 0.035)) rate *= ads ? 0.42 : 0.6;
    this.camYaw -= lx * rate * dt;
    this.camPitch = clamp(this.camPitch - ly * rate * 0.72 * (s.padInvert ? -1 : 1) * dt, -1.0, 1.15);
  }

  /** Turn needed from the crosshair to an enemy's chest (radians), and how far away it is. */
  angleTo(e) {
    const c = this.G.camera.position;
    const dx = e.pos.x - c.x, dz = e.pos.z - c.z, dy = e.chestY - c.y, h = Math.hypot(dx, dz);
    _ang.yaw = angleDiff(this.camYaw, Math.atan2(dx, dz));
    _ang.pitch = Math.atan2(dy, h) - (this.camPitch + this.recoil);
    _ang.dist = Math.hypot(h, dy);
    return _ang;
  }

  /** The enemy closest to the crosshair within maxAng (wider up close), if it is in sight. */
  assistTarget(maxAng) {
    const G = this.G;
    let best = null, bs = Infinity;
    for (const e of G.enemies.list) {
      if (!e.alive || e.state === 'scripted' || e.state === 'flee') continue;
      const a = this.angleTo(e);
      if (a.dist > 80 || a.dist < 1) continue;
      const off = Math.hypot(a.yaw * Math.cos(this.camPitch), a.pitch);
      if (off < maxAng + 0.45 / a.dist && off < bs) { bs = off; best = e; }
    }
    if (!best) return null;
    const c = G.camera.position;
    _dir.set(best.pos.x - c.x, best.chestY - c.y, best.pos.z - c.z);
    const L = _dir.length();
    _dir.divideScalar(L);
    const hit = G.world.raycast(c, _dir, L, 'shot');
    return hit && hit.dist < L - 0.8 ? null : best;
  }

  /**
   * Point under the crosshair (enemies + world). Also remembers the enemy under it for the HUD.
   * In first-person VR the crosshair is where a controller points (`hand`: 'right' or 'left').
   */
  aimPoint(out, hand = 'right') {
    const G = this.G, cam = G.camera;
    const ray = G.vr && G.vr.aimRay(hand);
    if (ray) {
      _dir.copy(ray.d);
      _from.copy(ray.o);
    } else {
      cam.getWorldDirection(_dir);
      const o = cam.position;
      const skip = Math.max(0, o.distanceTo(_head.set(this.pos.x, this.pos.y + 1.4, this.pos.z)) - 0.3);
      _from.copy(o).addScaledVector(_dir, skip);
    }
    let best = 400, hitE = null;
    const res = G.world.raycast(_from, _dir, best, 'shot');
    if (res) best = res.dist;
    _v2.copy(_from).addScaledVector(_dir, best);
    for (const e of G.enemies.list) {
      const h = e.hitTest(_from, _v2);
      if (h && h.t * best < best) { best = h.t * best; hitE = e; _v2.copy(_from).addScaledVector(_dir, best); }
    }
    this.aimEnemy = hitE && hitE.state !== 'scripted' ? hitE : null;
    return out.copy(_from).addScaledVector(_dir, best);
  }

  update(dt) {
    const G = this.G, input = G.input, world = G.world;
    if (!this.alive) {
      this.deadT += dt;
      this.char.update(dt);
      return;
    }
    // --- look
    const sens = G.settings.sens * 0.0022 * (this.aim > 0.5 ? 0.55 : 1);
    this.camYaw -= input.mouse.dx * sens;
    this.camPitch = clamp(this.camPitch - input.mouse.dy * sens, -1.0, 1.15);
    this.padLook(dt);
    this.recoil = damp(this.recoil, 0, 10, dt);
    this.bloom = Math.max(0, this.bloom - dt * 0.08);

    // --- move
    // keys, or the left stick (analog: a light push walks)
    const kx = input.moveX, kz = input.moveZ;
    const fx = Math.sin(this.camYaw), fz = Math.cos(this.camYaw);
    const rx = -Math.cos(this.camYaw), rz = Math.sin(this.camYaw);
    let wx = fx * kz + rx * kx, wz = fz * kz + rz * kx;
    const wl = Math.hypot(wx, wz);
    const tilt = wl > 0 && wl < 0.98 ? Math.max(0.3, wl) : 1;
    if (wl > 0) { wx /= wl; wz /= wl; }
    const melee = !!this.cfg.melee;
    const aiming = input.aimDown && !melee;
    this.blocking = melee && input.aimDown && this.swingT <= 0;
    this.aim = damp(this.aim, aiming ? 1 : 0, 14, dt);
    const firing = input.fireDown && this.overheat <= 0 && this.dash <= 0;
    if (input.hit('ControlLeft') || input.hit('ControlRight')) this.crouch = !this.crouch;
    if (input.hit('Tab') || (input.hit('KeyX') && !input.down('ControlLeft'))) this.shoulder = -this.shoulder;
    this.rollCD -= dt;
    this.scanCD -= dt;
    if (input.hit('KeyE')) this.spot();
    if (input.hit('KeyC') && this.roll <= 0 && this.rollCD <= 0 && this.onGround && this.dash <= 0) {
      // combat roll: toward where you are moving (straight back if standing still)
      if (wl > 0) this.rollDir.set(wx, 0, wz); else this.rollDir.set(-fx, 0, -fz);
      this.roll = 0.62;
      this.rollCD = 0.9;
      this.crouch = false;
      G.sound.whoosh(this.pos);
    }
    const sprint = input.down('ShiftLeft') && kz > 0.3 && !aiming && !firing && !this.crouch;
    if (sprint) this.crouch = false;
    this.crouchK = damp(this.crouchK, this.crouch ? 1 : 0, 12, dt);
    if (this.roll > 0) {
      this.roll -= dt;
      const k = 1 - Math.max(0, this.roll) / 0.62;
      const sp = 9.5 * (1 - k * k * 0.75);
      this.vel.x = this.rollDir.x * sp;
      this.vel.z = this.rollDir.z * sp;
    } else if (this.dash > 0) this.updateDash(dt);
    else {
      const speed = (aiming || this.blocking ? (this.crouch ? 2.2 : 3.2) : sprint ? 8.4 : this.crouch ? 2.8 : 5.6) * (this.cfg.speedMul || 1) * tilt;
      const accel = this.onGround ? 16 : 3;
      this.vel.x = damp(this.vel.x, wx * speed, accel, dt);
      this.vel.z = damp(this.vel.z, wz * speed, accel, dt);
      if (this.onGround && input.hit('Space')) { this.vel.y = this.cfg.jump || 6.6; this.onGround = false; }
    }
    this.vel.y -= 20 * dt;
    this.pos.addScaledVector(this.vel, dt);
    world.resolve(this.pos, this.radius, 1.8);
    G.keepInArena(this.pos, this.radius);
    const g = world.groundAt(this.pos.x, this.pos.z, this.pos.y, 0.25);
    if (this.pos.y <= g) {
      if (this.vel.y < -11) { this.G.sound.thump(this.pos); G.fx.dust(this.pos, 6); }
      this.pos.y = g;
      this.vel.y = 0;
      this.onGround = true;
    } else this.onGround = this.pos.y - g < 0.05;
    if (this.pos.y < G.arena.y - 30) {
      this.pos.copy(G.arena.playerSpawn);
      this.vel.set(0, 0, 0);
      this.hurt(25, this.pos);
    }

    // --- body facing / animation
    const hs = Math.hypot(this.vel.x, this.vel.z);
    const moving = hs > 0.6;
    const combatMode = this.aim > 0.3 || this.combat > 0 || this.blocking;
    let bodyYaw = this.yaw;
    this.runDir = 1;
    if (moving) {
      const moveYaw = yawTo(this.vel.x, this.vel.z);
      if (combatMode && this.dash <= 0) {
        const d = angleDiff(this.camYaw, moveYaw);
        if (Math.abs(d) <= 1.95) bodyYaw = this.camYaw + clamp(d, -0.95, 0.95);
        else { bodyYaw = this.camYaw + clamp(angleDiff(this.camYaw, moveYaw + Math.PI), -0.95, 0.95); this.runDir = -1; }
      } else bodyYaw = moveYaw;
    } else if (combatMode || Math.abs(angleDiff(this.yaw, this.camYaw)) > 1.3) bodyYaw = this.camYaw;
    this.yaw = dampAngle(this.yaw, bodyYaw, moving ? 12 : 9, dt);
    this.char.yaw = this.yaw;
    const twist = clamp(angleDiff(this.yaw, this.camYaw), -1.3, 1.3);
    this.char.twist = combatMode ? twist : twist * 0.35;
    this.char.pitch = combatMode ? clamp(this.camPitch + this.recoil, -0.9, 0.95) : this.camPitch * 0.3;
    const model = this.char.model;
    if (this.roll > 0) {
      // tucked roll: the body tumbles once around its hips
      const k = 1 - this.roll / 0.62, a = k * Math.PI * 2, h = 0.6;
      this.char.yaw = this.yaw = yawTo(this.rollDir.x, this.rollDir.z);
      this.char.play('Crouch', 0.06);
      model.rotation.x = a;
      model.position.set(0, h * (1 - Math.cos(a)) * 0.6, -h * Math.sin(a) * 0.4);
      this.char.pitch = this.char.twist = 0;
    } else if (this.swingT > 0 || this.blocking) {
      if (model.rotation.x !== 0) { model.rotation.x = 0; model.position.set(0, 0, 0); }
      this.swingT -= dt;
      if (this.blocking && this.swingT <= 0) this.char.play('Block', 0.1);
      this.char.pitch = this.char.twist = 0;
    } else {
      if (model.rotation.x !== 0) { model.rotation.x = 0; model.position.set(0, 0, 0); }
      if (this.crouchK > 0.5 && !moving) this.char.play('Crouch', 0.2);
      else if (moving && this.onGround && this.crouchK > 0.5 && this.char.actions.CrouchWalk) this.char.play('CrouchWalk', 0.18, { timeScale: this.runDir * clamp(hs / 2.4, 0.6, 1.5) });
      else if (moving && this.onGround) this.char.play('Run', 0.15, { timeScale: this.runDir * clamp(hs / 4.6, 0.7, 1.9) });
      else if (!this.onGround && this.vel.y < -7.5 && this.aim < 0.5 && this.char.actions.Fall) this.char.play('Fall', 0.25, { timeScale: 1.25 });
      else if (this.onGround || this.char.currentName !== 'Run') this.char.play('Idle', 0.2);
      // sprinting: lean into it
      if (sprint && moving && !combatMode) this.char.pitch = -0.32;
    }

    // --- what is under the crosshair (red crosshair + name; the VR reticle reads aimAt)
    this.aimAt = this.aimPoint(_aim);

    // --- weapon heat + active cooling
    this.fireCD -= dt;
    this.combat -= dt;
    this.buffT = Math.max(0, this.buffT - dt);
    this.coolBuff = Math.max(0, this.coolBuff - dt);
    const vent = input.hit('KeyR');
    if (this.overdrive > 0) {
      this.overdrive -= dt;
      this.heat = Math.max(0, this.heat - 80 * dt);
      if (this.overdrive <= 0) G.hud.toast('OVERDRIVE ENDED');
    }
    if (this.overheat > 0) this.updateVent(dt, vent);
    else {
      if (this.fireCD < -0.22) this.heat = Math.max(0, this.heat - 42 * dt * (this.buffT > 0 ? 1.8 : 1));
      if (vent && this.heat > 30 && this.overdrive <= 0) this.startVent(this.heat);
    }

    this.char.update(dt);
    if (melee) {
      if (firing && this.fireCD <= 0) this.swing();
      this.updateSwing(dt);
    } else if (firing && this.overheat <= 0 && this.fireCD <= 0) this.shoot();

    this.updateAbilities(dt);

    // --- Battlefront health regeneration: after 5 s without damage, back to full fast
    if (this.regenerating) this.hp = Math.min(this.maxHp, this.hp + REGEN_RATE * dt);
  }

  /** Active cooling: a marker sweeps the heat meter; R inside the zone vents instantly. */
  startVent(fromHeat) {
    this.overheat = VENT_TIME * Math.max(0.35, fromHeat / 100);
    const a = rand(0.42, 0.64);
    this.vent = { t: 0, sweep: VENT_SWEEP, a, b: a + 0.15, state: 'open', total: this.overheat, from: fromHeat };
  }

  updateVent(dt, pressed) {
    const G = this.G, v = this.vent;
    v.t += dt;
    this.overheat -= dt;
    this.heat = Math.max(0, v.from * (this.overheat / v.total));
    if (v.state === 'open') {
      const m = v.t / v.sweep;
      if (pressed) {
        if (m >= v.a && m <= v.b) {
          this.overheat = 0;
          this.heat = 0;
          v.state = 'done';
          this.coolBuff = 5;
          G.sound.vent(true);
          G.hud.toast('PERFECT VENT · +20% DAMAGE');
        } else {
          v.state = 'failed';
          G.sound.vent(false);
        }
      } else if (m > 1) v.state = 'missed';
    }
    if (this.overheat <= 0) { this.overheat = 0; this.heat = 0; }
  }

  // --- hero abilities ---------------------------------------------------------------
  updateAbilities(dt) {
    const G = this.G, input = G.input, cfg = this.cfg;
    this.cdQ = Math.max(0, this.cdQ - dt);
    this.cdG = Math.max(0, this.cdG - dt);
    this.grenadeCD -= dt;
    const kit = cfg.kit;
    if (input.hit('KeyQ') && this.cdQ <= 0) {
      if (kit.q === 'command') this.battleCommand(); else if (kit.q === 'push') this.forcePush(); else this.riotCharge();
    }
    if (input.hit('KeyG')) {
      if (kit.g === 'rush' && this.cdG <= 0) {
        this.cdG = cfg.abilities[1].cd;
        this.riotCharge(true);
      } else if (kit.g === 'thermal' && this.grenades > 0 && this.grenadeCD <= 0) {
        this.grenadeCD = cfg.abilities[1].cd;
        this.grenades--;
        this.throwGrenade('thermal');
      } else if (kit.g === 'stun' && this.cdG <= 0) {
        this.cdG = cfg.abilities[1].cd;
        this.throwGrenade('stun');
      }
    }
    // commander special (meter powered)
    this.special = Math.min(100, this.special + dt * 0.9);
    if (input.hit('KeyF') && this.special >= 100) {
      this.special = 0;
      if (kit.f === 'barrage') {
        const target = this.aimPoint(new THREE.Vector3());
        G.combat.barrage(target);
        G.hud.toast('GUNSHIP BARRAGE INBOUND');
      } else if (kit.f === 'wave') this.forceWave();
      else {
        this.overdrive = 7;
        this.heat = 0;
        this.overheat = 0;
        G.hud.toast(cfg.special);
      }
      if (cfg.lines.special) G.speak(cfg.lines.special, this.key);
    }
  }

  throwGrenade(kind) {
    const G = this.G;
    this.combat = 1.5;
    const target = this.aimPoint(_v);
    if (!(G.vr && G.vr.muzzle('left', _from))) this.char.boneWorld('hand_L', _from);
    _dir.subVectors(target, _from);
    const flat = Math.hypot(_dir.x, _dir.z);
    const vxz = clamp(flat * 1.05, 6, 18);
    _dir.y = 0; _dir.normalize();
    const vel = new THREE.Vector3(_dir.x * vxz, 4.2 + clamp(this.camPitch, -0.3, 0.8) * 6, _dir.z * vxz).addScaledVector(this.vel, 0.4);
    G.combat.throwGrenade(_from.clone(), vel, 'player', kind);
    G.sound.tone([500, 350], 0.08, 'triangle', 0.15, 0.05);
  }

  /** Lightsaber: a three-hit combo (the third is a spinning slash). Hits land a beat into the swing. */
  swing() {
    const G = this.G;
    G.input.pad.rumble(0.08, 0.28, 60);
    this.fireCD = this.cfg.interval;
    this.combat = 1.6;
    this.combo = G.time - (this.lastSwing ?? -9) < 0.75 ? ((this.combo || 0) + 1) % 3 : 0;
    this.lastSwing = G.time;
    this.char.play(['Swing1', 'Swing2', 'Swing3'][this.combo], 0.05, { loop: false, restart: true, timeScale: 1.35 });
    this.swingT = this.combo === 2 ? 0.42 : 0.3;
    this.yaw = this.camYaw;
    this.pendingHit = 0.1;
    G.sound.whoosh(this.pos);
  }

  updateSwing(dt) {
    const G = this.G;
    if (this.pendingHit == null) return;
    this.pendingHit -= dt;
    if (this.pendingHit > 0) return;
    this.pendingHit = null;
    const spin = this.combo === 2, reach = spin ? 3.2 : 2.7;
    const fx = Math.sin(this.camYaw), fz = Math.cos(this.camYaw);
    let hits = 0;
    for (const e of G.enemies.list) {
      if (!e.alive || e.state === 'scripted') continue;
      const dx = e.pos.x - this.pos.x, dz = e.pos.z - this.pos.z, d = Math.hypot(dx, dz);
      if (d > reach + e.cfg.radius || Math.abs(e.chestY - (this.pos.y + 0.6)) > 2.4) continue;
      if (!spin && (dx * fx + dz * fz) / (d || 1) < 0.15) continue;
      _v.set(dx, 0, dz).normalize();
      const killed = e.damage(this.cfg.dmg * (spin ? 1.3 : 1) * (this.buffT > 0 ? 1.25 : 1), _v, false, 'player');
      if (!killed) e.stun(0.35, _v2.copy(_v).multiplyScalar(spin ? 7 : 4));
      G.fx.sparks(_v2.set(e.pos.x, Math.min(e.chestY, this.pos.y + 1.2), e.pos.z), _v, 0x9dff7a, 16, 6);
      G.hud.hitMarker(false, killed);
      if (killed) G.sound.killConfirm(false); else G.sound.hitConfirm(false);
      G.sound.impact(_v2, 'metal');
      hits++;
    }
    if (hits) { G.fx.shake = Math.min(1, G.fx.shake + 0.12); this.camKick = Math.min(1, this.camKick + 0.3); }
  }

  /** Yoda Q: a cone of Force that throws droids back. */
  forcePush() {
    const G = this.G;
    this.cdQ = this.cfg.abilities[0].cd;
    this.combat = 1.5;
    const fx = Math.sin(this.camYaw), fz = Math.cos(this.camYaw);
    for (const e of G.enemies.list) {
      if (!e.alive || e.state === 'scripted') continue;
      const dx = e.pos.x - this.pos.x, dz = e.pos.z - this.pos.z, d = Math.hypot(dx, dz);
      if (d > 10 || (dx * fx + dz * fz) / (d || 1) < 0.5) continue;
      _v.set(dx, 0, dz).normalize();
      const killed = e.damage(45 * (1 - d / 14), _v, false, 'player');
      if (!killed) e.stun(1.4, _v2.copy(_v).multiplyScalar(16 - d));
      G.hud.hitMarker(false, killed);
    }
    G.fx.ring(_v.set(this.pos.x + fx * 2.5, this.pos.y + 0.6, this.pos.z + fz * 2.5), 7, 0.4, 0xbfe8ff);
    G.fx.flash(_v, 0xbfe8ff, 3, 0.25);
    G.sound.ability('riot');
    G.fx.shake = Math.min(1, G.fx.shake + 0.25);
  }

  /** Yoda F: a wave of Force in every direction. */
  forceWave() {
    const G = this.G;
    for (const e of G.enemies.list) {
      if (!e.alive || e.state === 'scripted') continue;
      const dx = e.pos.x - this.pos.x, dz = e.pos.z - this.pos.z, d = Math.hypot(dx, dz);
      if (d > 14) continue;
      _v.set(dx, 0, dz).normalize();
      const killed = e.damage(150 * (1 - d / 20), _v, false, 'player');
      if (!killed) e.stun(2.2, _v2.copy(_v).multiplyScalar(20 - d));
      G.hud.hitMarker(false, killed);
    }
    G.fx.ring(_v.set(this.pos.x, this.pos.y + 0.3, this.pos.z), 22, 0.8, 0xbfe8ff);
    G.fx.flash(_v.setY(this.pos.y + 1), 0xd8f4ff, 8, 0.4);
    G.fx.flashLight(_v, 0xbfe8ff, 16, 0.6, 20, 3);
    G.sound.stun(this.pos);
    G.fx.shake = 1;
    G.hud.toast('FORCE WAVE');
  }

  /** Cody: nearby troopers (and Cody) deal more damage and cool their blasters faster. */
  battleCommand() {
    const G = this.G;
    this.cdQ = this.cfg.abilities[0].cd;
    this.buffT = 10;
    for (const a of G.allies ? G.allies() : [G.ally]) {
      if (a && a.pos.distanceTo(this.pos) < 30) a.buffT = 10;
    }
    G.fx.ring(_v.set(this.pos.x, this.pos.y + 0.1, this.pos.z), 16, 0.7, 0x5ab8ff);
    G.sound.ability('command');
    G.hud.toast('BATTLE COMMAND · SQUAD +25% DAMAGE');
    if (this.cfg.lines.command) G.speak(this.cfg.lines.command, this.key, { interrupt: false });
  }

  /** Fox: a short shoulder-charge dash that bowls droids over. */
  riotCharge(saber = false) {
    const G = this.G;
    if (!saber) this.cdQ = this.cfg.abilities[0].cd;
    this.dashSaber = saber;
    if (saber) { this.char.play('Swing3', 0.05, { loop: false, restart: true, timeScale: 1.4 }); this.swingT = 0.4; }
    this.dash = 0.4;
    this.dashDir.set(Math.sin(this.camYaw), 0, Math.cos(this.camYaw));
    this.dashHits.clear();
    G.sound.whoosh(this.pos);
    G.sound.ability('riot');
    G.fx.dust(this.pos, 10);
  }

  updateDash(dt) {
    const G = this.G;
    this.dash -= dt;
    this.vel.x = this.dashDir.x * 17;
    this.vel.z = this.dashDir.z * 17;
    for (const e of G.enemies.list) {
      if (!e.alive || e.cfg.flying || e.state === 'scripted' || this.dashHits.has(e)) continue;
      const dx = e.pos.x - this.pos.x, dz = e.pos.z - this.pos.z;
      if (dx * dx + dz * dz > 2.1 * 2.1 || Math.abs(e.pos.y - this.pos.y) > 1.5) continue;
      this.dashHits.add(e);
      _v.set(dx, 0, dz).normalize().addScaledVector(this.dashDir, 1).normalize();
      const killed = e.damage(this.dashSaber ? 90 : 55, _v, false, 'player');
      if (this.dashSaber) G.fx.sparks(_v2.set(e.pos.x, e.chestY, e.pos.z), _v, 0x7dff6a, 14, 6);
      if (!killed) e.stun(1.6, _v2.copy(_v).multiplyScalar(10));
      G.hud.hitMarker(false, killed);
      if (killed) G.sound.killConfirm(false); else G.sound.hitConfirm(false);
      G.fx.tink(_v2.set(e.pos.x, e.pos.y + 1.2, e.pos.z), _v);
      G.sound.thump(e.pos);
      G.fx.shake = Math.min(1, G.fx.shake + 0.3);
    }
    if (this.dash <= 0) { this.vel.x *= 0.3; this.vel.z *= 0.3; }
  }

  /** HUD state for ability slot i: { frac (cooldown left 0..1), ready, active, time, count }. */
  abilityState(i) {
    const ab = this.cfg.abilities[i];
    if (i === 0) {
      const active = this.cfg.kit.q === 'command' ? this.buffT > 0 : this.dash > 0;
      return { frac: this.cdQ / ab.cd, ready: this.cdQ <= 0, active, time: this.buffT > 0 ? String(Math.ceil(this.buffT)) : this.cdQ > 0 ? String(Math.ceil(this.cdQ)) : '', count: '' };
    }
    if (i === 1) {
      if (this.cfg.kit.g === 'thermal') {
        const ready = this.grenades > 0 && this.grenadeCD <= 0;
        return { frac: this.grenades > 0 ? clamp(this.grenadeCD / ab.cd, 0, 1) : 1, ready, active: false, time: '', count: String(this.grenades) };
      }
      return { frac: this.cdG / ab.cd, ready: this.cdG <= 0, active: false, time: this.cdG > 0 ? String(Math.ceil(this.cdG)) : '', count: '' };
    }
    const active = this.overdrive > 0;
    return { frac: active ? 0 : 1 - this.special / 100, ready: this.special >= 100, active, time: active ? String(Math.ceil(this.overdrive)) : '', count: '' };
  }

  grenadeText() { return this.buffT > 0 ? 'BATTLE COMMAND' : ''; }

  shoot() {
    const G = this.G, cfg = this.cfg;
    const od = this.overdrive > 0;
    this.fireCD = cfg.interval * (od ? 0.55 : 1);
    this.combat = 1.6;
    this.camKick = Math.min(1, this.camKick + (this.key === 'cody' ? 0.32 : 0.2));
    const muzzle = cfg.muzzles[this.muzzleIdx++ % cfg.muzzles.length];
    // in first-person VR each gun fires from the controller holding it, at what that controller points at
    const hand = muzzle.endsWith('_L') ? 'left' : 'right';
    const aimP = this.aimPoint(_v, hand);
    const from = (G.vr && G.vr.muzzle(hand, new THREE.Vector3())) || this.char.boneWorld(muzzle, new THREE.Vector3());
    const dir = new THREE.Vector3().subVectors(aimP, from);
    if (dir.lengthSq() < 0.25) G.camera.getWorldDirection(dir);
    dir.normalize();
    const moving = Math.hypot(this.vel.x, this.vel.z) > 1;
    const spread = lerp(cfg.spread, cfg.adsSpread, this.aim) * (moving ? 1.4 : 1) + this.bloom;
    spreadDir(dir, spread, dir);
    this.bloom = Math.min(0.025, this.bloom + (this.key === 'fox' ? 0.0018 : 0.003));
    const mult = (od ? 1.25 : 1) * (this.buffT > 0 ? 1.25 : 1) * (this.coolBuff > 0 ? 1.2 : 1);
    G.combat.fireBolt({ from, dir, speed: cfg.speed, dmg: cfg.dmg * mult, team: 'friendly', owner: 'player', color: od ? 0x63d4ff : cfg.color, len: cfg.len, width: cfg.width });
    G.fx.muzzle(from, dir, cfg.color, { smoke: this.key === 'cody', light: 7, prio: 2, size: this.key === 'cody' ? 0.62 : 0.5 });
    G.sound.shot(cfg.sfx, from);
    if (this.key === 'cody') G.input.pad.rumble(0.12, 0.35, 70); else G.input.pad.rumble(0, 0.22, 45);
    this.recoil += this.key === 'cody' ? 0.011 : 0.005;
    if (!od) {
      this.heat += cfg.heat;
      if (this.heat >= 100) {
        this.heat = 100;
        this.startVent(100);
        G.sound.overheat();
      }
    }
  }

  updateCamera(dt) {
    const G = this.G, cam = G.camera;
    const k = this.aim;
    this.shoulderK = damp(this.shoulderK, this.shoulder, 10, dt);
    this.camKick = damp(this.camKick, 0, 9, dt);
    const cc = this.cfg.cam;
    const dist = (cc ? cc.dist : lerp(3.3, 1.55, k)) + this.camKick * 0.14;
    const side = (cc ? cc.side : lerp(0.62, 0.5, k)) * this.shoulderK;
    // head bob while running (stronger sprinting), lower when crouched or rolling
    const hs = Math.hypot(this.vel.x, this.vel.z);
    if (this.onGround && hs > 1 && this.roll <= 0) this.bob += dt * hs * 1.5;
    const bobA = this.onGround && this.roll <= 0 ? Math.min(1, hs / 8.4) * (1 - k * 0.8) : 0;
    const up = (cc ? cc.up : lerp(1.62, 1.56, k)) - this.crouchK * (cc ? 0.2 : 0.42) - (this.roll > 0 ? 0.55 : 0) + Math.abs(Math.sin(this.bob)) * 0.06 * bobA + this.camKick * 0.02;
    const pitch = this.camPitch + this.recoil;
    _dir.set(Math.sin(this.camYaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(this.camYaw) * Math.cos(pitch));
    _right.set(-Math.cos(this.camYaw), 0, Math.sin(this.camYaw));
    _head.set(this.pos.x, this.pos.y + up, this.pos.z);
    _v.copy(_head).addScaledVector(_right, side).addScaledVector(_dir, -dist);
    _v2.subVectors(_v, _head);
    const L = _v2.length();
    _v2.divideScalar(L);
    const hit = G.world.raycast(_head, _v2, L + 0.25, 'shot');
    if (hit) _v.copy(_head).addScaledVector(_v2, Math.max(0.25, hit.dist - 0.25));
    if (!this.alive) {
      const t = this.deadT, k = this.killer;
      _v.set(this.pos.x + Math.sin(this.camYaw + t * 0.3) * (4 + t), this.pos.y + 2.5 + t * 0.8, this.pos.z + Math.cos(this.camYaw + t * 0.3) * (4 + t));
      _head.set(this.pos.x, this.pos.y + 0.6, this.pos.z);
      if (k && G.state === 'dead' && t > 0.6) {
        // killcam: frame whoever got you, from a few metres in front of them
        const e = Math.min(1, (t - 0.6) / 0.7), s = e * e * (3 - 2 * e);
        _v2.set(this.pos.x - k.pos.x, 0, this.pos.z - k.pos.z);
        const L = Math.max(0.1, _v2.length());
        _v2.divideScalar(L);
        const kd = Math.min(L * 0.6, 5.5);
        _right.set(_v2.z, 0, -_v2.x);
        _dir.set(k.pos.x + _v2.x * kd + _right.x * 1.1, (k.chestY ?? k.pos.y + 1.2) + 0.5, k.pos.z + _v2.z * kd + _right.z * 1.1);
        _v.lerp(_dir, s);
        _head.lerp(_dir.set(k.pos.x, k.chestY ?? k.pos.y + 1.2, k.pos.z), s);
      }
      cam.position.copy(_v);
      cam.lookAt(_head);
      return;
    }
    // spring-follow: the camera trails the shoulder a touch when moving fast (snaps when aiming or far off)
    if (!this.camPos || this.camPos.distanceTo(_v) > 3 || k > 0.5) this.camPos = (this.camPos || new THREE.Vector3()).copy(_v);
    else this.camPos.lerp(_v, 1 - Math.exp(-dt * 22));
    cam.position.copy(this.camPos);
    if (G.fx.shake > 0) {
      const s = G.fx.shake * G.fx.shake * 0.12;
      cam.position.x += rand(-s, s); cam.position.y += rand(-s, s); cam.position.z += rand(-s, s);
    }
    _v.copy(cam.position).add(_dir);
    cam.lookAt(_v);
    const sprinting = G.input.down('ShiftLeft') && Math.hypot(this.vel.x, this.vel.z) > 7;
    const fov = lerp(70, this.cfg.adsFov, k) + (sprinting ? 6 : 0);
    if (Math.abs(fov - cam.fov) > 0.05) {
      cam.fov = damp(cam.fov, fov, 10, dt);
      cam.updateProjectionMatrix();
      G.onFovChange();
    }
  }
}

const DESERT_LINES = {
  gree: ['Forty-first, hold this ground!', 'Raiders on the dunes!', 'Keep them off the farm!', 'Moving up!'],
  cody: ['Watch the ridges!', 'Snipers in the rocks!', 'Keep them off the farm!', 'Moving up!'],
  fox: ['Jawas on the left!', 'Covering you!', 'Hold the line!', 'Sand People inbound!'],
};
const ORDER66_ALLY_LINES = {
  gree: ['Keep the General behind us!', 'Forty-first, they turned! Hold!', 'Watch the doors!', 'Moving up!'],
  cody: ['Protect Master Yoda!', 'They wear our colours. Fire anyway!', 'Watch the lifts!', 'Stay on me!'],
  fox: ['Guard, on me... what is left of it!', 'Covering you!', 'They won\'t touch him!', 'Hold the line!'],
};
const ALLY_LINES = {
  gree: ['Forty-first, hold this ground!', 'Droids on the terrace!', 'Keep them off the Temple!', 'Moving up!'],
  cody: ['Watch your flank, Fox!', 'Moving up!', "They're coming out of the lifts!", 'Keep firing!', 'Stay on me!'],
  fox: ['Clankers on the bridge!', 'Covering you, Cody!', 'Rocket troopers inbound!', 'Hold the line!', 'Keep them off the lifts!'],
};

/** The commander you did not pick fights alongside you. */
export class Ally {
  constructor(G, key) {
    this.G = G;
    this.key = key;
    this.cfg = LOADOUTS[key];
    this.char = G.chars[key];
    this.pos = this.char.group.position;
    this.yaw = this.char.yaw;
    this.target = null;
    this.scan = 0;
    this.fireCD = 0.5;
    this.burst = 0;
    this.muzzleIdx = 0;
    this.nav = new THREE.Vector3();
    this.lineCD = rand(14, 24);
    this.side = 1;
    this.buffT = 0;
  }

  update(dt) {
    const G = this.G, p = G.player, world = G.world;
    if (!p) return;
    this.buffT = Math.max(0, this.buffT - dt);
    // follow point: ahead of the player and out to the side, clear of the over-the-shoulder camera
    const fy = p.camYaw + 1.15 * this.side;
    const fxp = p.pos.x + Math.sin(fy) * 5.5, fzp = p.pos.z + Math.cos(fy) * 5.5;
    const dx = fxp - this.pos.x, dz = fzp - this.pos.z;
    const d = Math.hypot(dx, dz);
    // pick a target
    this.scan -= dt;
    if (this.scan <= 0) {
      this.scan = 0.4;
      let best = null, bestD = 40;
      _p0.set(this.pos.x, this.pos.y + 1.5, this.pos.z);
      for (const e of G.enemies.list) {
        if (!e.alive || e.state === 'scripted' || e.state === 'drop') continue;
        _p1.set(e.pos.x, e.chestY, e.pos.z);
        const ed = _p0.distanceTo(_p1);
        if (ed < bestD && !world.blocked(_p0, _p1)) { bestD = ed; best = e; }
      }
      this.target = best;
      if (d > 0.1) world.navTarget(this.pos, _v.set(fxp, 0, fzp), 0.4, this.nav);
    }
    let moving = false;
    if (d > 2.0) {
      const speed = d > 10 ? 8 : 5.4;
      const nx = this.nav.x - this.pos.x, nz = this.nav.z - this.pos.z;
      const nl = Math.hypot(nx, nz);
      if (nl > 0.05) {
        this.pos.x += (nx / nl) * speed * dt;
        this.pos.z += (nz / nl) * speed * dt;
        moving = true;
      }
    }
    // keep a little space from the player
    const pdx = this.pos.x - p.pos.x, pdz = this.pos.z - p.pos.z, pd = Math.hypot(pdx, pdz);
    if (pd < 1.3 && pd > 1e-4) { this.pos.x += (pdx / pd) * (1.3 - pd); this.pos.z += (pdz / pd) * (1.3 - pd); }
    if (d > 45) { this.pos.set(fxp, p.pos.y, fzp); }
    world.resolve(this.pos, 0.38, 1.8);
    G.keepInArena(this.pos, 0.38);
    const g = world.groundAt(this.pos.x, this.pos.z, this.pos.y + 0.3, 0.2);
    if (g > -1e9) this.pos.y = g;

    const t = this.target && this.target.alive ? this.target : null;
    let wantYaw = this.yaw;
    if (t) {
      wantYaw = yawTo(t.pos.x - this.pos.x, t.pos.z - this.pos.z);
      const hd = Math.hypot(t.pos.x - this.pos.x, t.pos.z - this.pos.z);
      this.char.pitch = clamp(Math.atan2(t.chestY - (this.pos.y + 1.35), hd), -0.8, 0.9);
    } else {
      this.char.pitch *= 0.9;
      if (moving) wantYaw = yawTo(this.nav.x - this.pos.x, this.nav.z - this.pos.z);
    }
    this.yaw = dampAngle(this.yaw, wantYaw, 8, dt);
    this.char.yaw = this.yaw;
    if (moving) {
      const backwards = Math.cos(angleDiff(this.yaw, yawTo(this.nav.x - this.pos.x, this.nav.z - this.pos.z))) < -0.2;
      this.char.play('Run', 0.18, { timeScale: backwards ? -1.1 : 1.15 });
    } else this.char.play('Idle', 0.25);
    this.char.update(dt);

    // shooting
    this.fireCD -= dt;
    if (t && this.fireCD <= 0 && Math.abs(angleDiff(this.yaw, wantYaw)) < 0.3) {
      if (this.burst <= 0) this.burst = this.key === 'cody' ? 3 + Math.floor(Math.random() * 3) : 5 + Math.floor(Math.random() * 4);
      this.fire(t);
      this.burst--;
      this.fireCD = this.burst > 0 ? this.cfg.interval * 1.4 : rand(0.6, 1.3);
    }
    this.lineCD -= dt;
    if (this.lineCD <= 0) {
      this.lineCD = rand(18, 32);
      if (G.enemies.aliveCount() > 2) G.speak(pick((G.act === 4 ? ORDER66_ALLY_LINES : G.arena.planet ? DESERT_LINES : ALLY_LINES)[this.key]), this.key, { interrupt: false });
    }
  }

  fire(t) {
    const G = this.G, cfg = this.cfg;
    const m = cfg.muzzles[this.muzzleIdx++ % cfg.muzzles.length];
    const from = this.char.boneWorld(m, new THREE.Vector3());
    const dir = new THREE.Vector3(t.pos.x, t.chestY + rand(-0.2, 0.3), t.pos.z).sub(from).normalize();
    spreadDir(dir, 0.03, dir);
    G.combat.fireBolt({ from, dir, speed: cfg.speed, dmg: cfg.dmg * 0.55 * (this.buffT > 0 ? 1.25 : 1), team: 'friendly', owner: 'ally', color: cfg.color, len: cfg.len, width: cfg.width });
    G.fx.muzzle(from, dir, cfg.color, { smoke: this.key === 'cody', light: 5 });
    G.sound.shot(cfg.sfx, from);
  }
}
