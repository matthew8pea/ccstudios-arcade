import * as THREE from 'three';
import { Enemy, ENEMY_CLASSES } from './enemies.js';
import { clamp, rand, pick, angleDiff, dampAngle, yawTo } from './util.js';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _s = new THREE.Vector3();
const _hand = new THREE.Vector3();

export const DOOKU_VOICE = { pitch: 0.55, rate: 0.88 };
const TAUNTS = ['Your Jedi tricks will not save you.', 'You are outmatched, clone.', 'Such clumsy footwork.', 'I have been fighting for longer than you have been alive.'];
const LIGHTNING_LINES = ['Feel the power of the dark side!', 'Unlimited power... almost.', 'Kneel!'];

/** Force lightning: jagged, flickering ribbons from Dooku's hand to whoever he is frying (rebuilt every frame). */
class Lightning {
  constructor(scene) {
    this.B = 4;
    this.N = 14;
    const verts = this.B * this.N * 2;
    this.pos = new Float32Array(verts * 3);
    const idx = [];
    for (let b = 0; b < this.B; b++) for (let i = 0; i < this.N - 1; i++) {
      const a = (b * this.N + i) * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setIndex(idx);
    this.mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.8, 2.5, 4.6), transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 12;
    this.mesh.visible = false;
    scene.add(this.mesh);
    this.jit = new Float32Array(this.B * this.N * 2);
    this.reseed = 0;
  }

  /** Draw (or hide, from = null) the bolts this frame. */
  draw(from, to, cam, dt) {
    if (!from) { this.mesh.visible = false; return; }
    this.mesh.visible = true;
    this.reseed -= dt;
    if (this.reseed <= 0) {
      this.reseed = 0.045;
      for (let i = 0; i < this.jit.length; i++) this.jit[i] = Math.random() * 2 - 1;
    }
    _a.subVectors(to, from);
    const L = _a.length();
    _a.divideScalar(L || 1);
    const up = Math.abs(_a.y) > 0.9 ? _b.set(1, 0, 0) : _b.set(0, 1, 0);
    const u = new THREE.Vector3().crossVectors(_a, up).normalize();
    const w = new THREE.Vector3().crossVectors(_a, u).normalize();
    const amp = 0.18 + L * 0.045;
    let k = 0;
    for (let b = 0; b < this.B; b++) {
      const spreadEnd = b === 0 ? 0 : 0.5 + b * 0.25;
      for (let i = 0; i < this.N; i++) {
        const s = i / (this.N - 1);
        const env = Math.sin(Math.PI * s) * amp * (b === 0 ? 1 : 1.25) + s * spreadEnd * 0.4;
        const j = (b * this.N + i) * 2;
        _s.copy(from).addScaledVector(_a, L * s).addScaledVector(u, this.jit[j] * env).addScaledVector(w, this.jit[j + 1] * env);
        // ribbon: two vertices either side, facing the camera
        _v.subVectors(cam, _s).normalize();
        _v2.crossVectors(_a, _v).normalize().multiplyScalar((b === 0 ? 0.045 : 0.025) * (1 - s * 0.5));
        this.pos[k++] = _s.x + _v2.x; this.pos[k++] = _s.y + _v2.y; this.pos[k++] = _s.z + _v2.z;
        this.pos[k++] = _s.x - _v2.x; this.pos[k++] = _s.y - _v2.y; this.pos[k++] = _s.z - _v2.z;
      }
    }
    this.mesh.geometry.attributes.position.needsUpdate = true;
    this.mat.opacity = 0.75 + Math.random() * 0.25;
  }
}

/**
 * Count Dooku (Act III, the last two waves). A Makashi duellist: saber combos up close, Force lightning at
 * range, a Force push when crowded, great leaps across the sand. He bats frontal blaster fire back at the
 * shooter and parries most of Yoda's blows. In wave 7 he withdraws at half health; in wave 8 he fights on
 * until he is beaten to his knees, and his hold over the desert peoples breaks.
 */
export class Dooku extends Enemy {
  constructor(G, type) {
    super(G, type);
    this.maxHp = this.hp = G.dookuMaxHp || this.cfg.hp;
    if (G.dookuHp) this.hp = G.dookuHp;
    this.dmgMul = 1;
    this.mode = 'duel';
    this.modeT = 0;
    this.attackCD = 1.0;
    this.lightCD = rand(5, 8);
    this.pushCD = 7;
    this.leapCD = 6;
    this.comboT = 0;
    this.comboN = 0;
    this.hitT = -1;
    this.blocked = 0;
    this.recent = 0;
    this.retreatAt = G.dookuRetreatAt ?? 0.5;
    this.final = !!G.dookuFinal;
    this.invuln = false;
    this.defeated = false;
    this.lit = true;
    this.lightning = G.dookuLightning || (G.dookuLightning = new Lightning(G.scene));
    this.tauntCD = rand(12, 20);
    for (const m of this.char.materials) if (m.name === 'SaberRed') m.visible = true;
  }

  get chestY() { return this.pos.y + 1.3; }

  speak(text, opts = {}) {
    const G = this.G;
    G.hud.subtitle('DOOKU', text, Math.min(6, 0.07 * text.length + 1.4));
    if (G.settings.voice) G.voice.say(text, { ...DOOKU_VOICE, interrupt: opts.interrupt !== false });
  }

  stun(sec, knock) {
    // a duellist recovers fast: a stagger, not a stun
    this.stunT = Math.max(this.stunT, Math.min(sec, 0.55));
    if (knock) this.knockV.copy(knock).multiplyScalar(0.3);
    this.comboT = 0;
    if (this.mode === 'lightning') this.endLightning();
  }

  update(dt) {
    const G = this.G;
    this.t += dt;
    if (this.flash > 0) { this.flash -= dt; this.char.setFlash(this.flash > 0 ? 0.9 : 0); }
    if (this.defeated) {
      this.char.update(dt);
      this.updateHead();
      return;
    }
    if (!this.alive) { this.lightning.draw(null); this.updateDead(dt); this.char.update(dt); return; }
    this.recent = Math.max(0, this.recent - dt * 60);
    if (this.state === 'scripted') { this.char.update(dt); this.updateHead(); return; }
    if (this.stunT > 0) {
      this.stunT -= dt;
      if (this.knockV.lengthSq() > 0.01) {
        this.pos.addScaledVector(this.knockV, dt);
        this.knockV.multiplyScalar(Math.exp(-5 * dt));
        G.world.resolve(this.pos, this.cfg.radius, this.cfg.height);
      }
      this.char.play('Block', 0.12);
    } else {
      this.attackCD -= dt; this.lightCD -= dt; this.pushCD -= dt; this.leapCD -= dt; this.tauntCD -= dt;
      if (this.mode === 'leap' || this.mode === 'exit') this.updateLeap(dt);
      else if (this.mode === 'lightning') this.updateLightning(dt);
      else if (this.mode === 'push' || this.mode === 'retreat') this.updatePush(dt);
      else this.updateDuel(dt);
    }
    this.char.yaw = this.yaw;
    this.char.update(dt);
    this.updateHead();
  }

  updateHead() {
    if (this.char.bones.head) this.char.bones.head.getWorldPosition(this.head);
    this.head.y += this.cfg.headUp;
  }

  ground() {
    const g = this.G.world.groundAt(this.pos.x, this.pos.z, this.pos.y + 0.4, 0.25);
    if (g > -1e9) this.pos.y = g;
  }

  updateDuel(dt) {
    const G = this.G, cfg = this.cfg;
    this.think -= dt;
    if (this.think <= 0) {
      this.think = rand(0.3, 0.5);
      // mostly the hero; sometimes whoever is closest
      const p = G.player;
      if (!this.target || !this.target.alive || Math.random() < 0.06) {
        const sq = G.squad ? G.squad.targets() : [];
        const r = Math.random();
        this.target = p && p.alive && r < 0.72 ? p : sq.length && r < 0.9 ? pick(sq) : G.ally || p;
      }
      if (this.target) G.world.navTarget(this.pos, this.target.pos, cfg.radius, this.navP);
    }
    const tgt = this.target;
    if (!tgt) { this.char.play('Idle', 0.3); return; }
    const dx = tgt.pos.x - this.pos.x, dz = tgt.pos.z - this.pos.z, dist = Math.hypot(dx, dz) || 0.01;
    const face = yawTo(dx, dz);
    // mid-combo: the blows land a beat into each swing
    if (this.comboT > 0) {
      this.comboT -= dt;
      this.yaw = dampAngle(this.yaw, face, 9, dt);
      if (this.hitT >= 0) {
        this.hitT -= dt;
        if (this.hitT < 0) this.saberHit(tgt);
      }
      if (this.comboT <= 0) {
        this.comboN--;
        if (this.comboN > 0 && dist < 3.6) this.nextSwing();
        else { this.comboT = 0; this.attackCD = rand(1.0, 2.0); }
      }
      this.ground();
      return;
    }
    const los = !G.world.blocked(_a.set(this.pos.x, this.pos.y + 1.5, this.pos.z), _b.set(tgt.pos.x, tgt.pos.y + 1.2, tgt.pos.z));
    if (dist > 20 && this.leapCD <= 0) { this.startLeap(tgt); return; }
    if (los && dist > 5 && dist < 19 && this.lightCD <= 0) { this.startLightning(); return; }
    if (dist < 3.4 && this.pushCD <= 0 && (this.recent > 140 || this.crowded() >= 3)) { this.startPush(); return; }
    if (dist < 3.1 && this.attackCD <= 0) { this.startCombo(); return; }
    // close in: a run from far away, a measured advance in the duel, circling when in reach
    let mx = 0, mz = 0, speed = cfg.speed;
    if (dist > 2.7) {
      const nx = this.navP.x - this.pos.x, nz = this.navP.z - this.pos.z, nl = Math.hypot(nx, nz) || 1;
      mx = nx / nl; mz = nz / nl;
      speed *= dist > 9 ? 1.3 : 0.75;
    } else {
      this.strafeT -= dt;
      if (this.strafeT <= 0) { this.strafeT = rand(1.2, 2.4); this.strafeDir *= -1; }
      mx = (-dz / dist) * this.strafeDir * 0.5; mz = (dx / dist) * this.strafeDir * 0.5;
      speed *= 0.5;
    }
    this.pos.x += mx * speed * dt;
    this.pos.z += mz * speed * dt;
    G.world.resolve(this.pos, cfg.radius, cfg.height);
    this.ground();
    this.yaw = dampAngle(this.yaw, dist < 12 ? face : yawTo(mx, mz), 8, dt);
    const moving = Math.hypot(mx, mz) > 0.1;
    if (moving && dist > 2.7) this.char.play('Run', 0.2, { timeScale: clamp(speed / cfg.animRef, 0.6, 1.6) });
    else this.char.play('Idle', 0.25);
    this.char.pitch *= 0.9;
    if (this.tauntCD <= 0 && dist < 16 && tgt === G.player) {
      this.tauntCD = rand(18, 28);
      this.speak(pick(TAUNTS), { interrupt: false });
    }
  }

  crowded() {
    let n = 0;
    const G = this.G;
    if (G.player && G.player.alive && G.player.pos.distanceTo(this.pos) < 4) n++;
    for (const t of G.squad ? G.squad.targets() : []) if (t.pos.distanceTo(this.pos) < 4.5) n++;
    return n;
  }

  startCombo() {
    this.comboN = 2 + Math.floor(Math.random() * 2);
    this.comboI = Math.floor(Math.random() * 2);
    this.nextSwing();
  }

  nextSwing() {
    const name = ['Swing1', 'Swing2', 'Swing3'][this.comboI++ % 3];
    this.char.play(name, 0.06, { loop: false, restart: true, timeScale: 1.15 });
    this.comboT = 0.56;
    this.hitT = 0.24;
    this.G.sound.saberSwing(this.pos);
  }

  /** A blade stroke reaching the target: Yoda (blocking, facing him) parries it, everyone else takes it. */
  saberHit(tgt) {
    const G = this.G;
    const dx = tgt.pos.x - this.pos.x, dz = tgt.pos.z - this.pos.z, d = Math.hypot(dx, dz) || 0.01;
    if (d > 3.4 || Math.abs(angleDiff(this.yaw, yawTo(dx, dz))) > 1.0) return;
    this.char.boneWorld('hand_R', _hand);
    if (tgt === G.player) {
      const p = G.player;
      const facing = Math.cos(angleDiff(p.camYaw, yawTo(-dx, -dz))) > 0.3;
      if (p.cfg.melee && (p.blocking || p.swingT > 0) && facing) {
        G.fx.sparks(_v.copy(_hand).lerp(_b.set(p.pos.x, p.pos.y + 0.8, p.pos.z), 0.6), _v2.set(-dx / d, 0.4, -dz / d), 0xff6a4a, 16, 6);
        G.fx.flash(_v, 0xffb090, 0.9, 0.1);
        G.sound.saberClash(_v);
        if (++this.blocked >= 3) { this.blocked = 0; this.stun(0.8); G.hud.toast('DOOKU STAGGERED'); }
        return;
      }
      p.hurt(17, this.pos, this);
      p.vel.x += (dx / d) * 3; p.vel.z += (dz / d) * 3;
    } else if (tgt.hurt) tgt.hurt(45);
    G.fx.sparks(_v.set(tgt.pos.x, tgt.pos.y + 1.1, tgt.pos.z), _v2.set(dx / d, 0.2, dz / d), 0xff4a2a, 10, 5);
    G.sound.impact(_v, 'wall');
  }

  // ------------------------------------------------------------ Force lightning
  startLightning() {
    this.mode = 'lightning';
    this.modeT = 2.4;
    this.char.play('Lightning', 0.15, { restart: true });
    if (Math.random() < 0.45) this.speak(pick(LIGHTNING_LINES), { interrupt: false });
  }

  endLightning() {
    this.mode = 'duel';
    this.lightCD = rand(9, 13);
    this.lightning.draw(null);
    this.G.sound.setLightning(0);
  }

  updateLightning(dt) {
    const G = this.G, tgt = this.target;
    this.modeT -= dt;
    if (!tgt || !tgt.alive || this.modeT <= 0) { this.endLightning(); return; }
    this.yaw = dampAngle(this.yaw, yawTo(tgt.pos.x - this.pos.x, tgt.pos.z - this.pos.z), 6, dt);
    this.char.play('Lightning', 0.15);
    this.ground();
    this.char.boneWorld('hand_L', _hand);
    _hand.addScaledVector(_v.set(Math.sin(this.yaw), 0, Math.cos(this.yaw)), 0.12);
    const to = _b.set(tgt.pos.x, (tgt.chestY ?? tgt.pos.y + 1.2), tgt.pos.z);
    const p = G.player;
    let absorbed = false;
    if (tgt === p) {
      const dx = p.pos.x - this.pos.x, dz = p.pos.z - this.pos.z;
      const facing = Math.cos(angleDiff(p.camYaw, yawTo(-dx, -dz))) > 0.4;
      if (p.cfg.melee && p.blocking && facing) {
        // Yoda catches it on his palm and blade
        absorbed = true;
        to.set(p.pos.x - Math.sin(p.camYaw) * -0.35, p.pos.y + 0.7, p.pos.z - Math.cos(p.camYaw) * -0.35);
        if (Math.random() < dt * 20) G.fx.sparks(to, _v2.set(-dx, 0.5, -dz).normalize(), 0x9fd0ff, 4, 4);
      }
    }
    if (G.world.blocked(_a.copy(_hand), to)) { this.lightning.draw(null); G.sound.setLightning(0); return; }
    this.lightning.draw(_hand, to, G.camera.position, dt);
    G.fx.holdLight(3, _v.copy(_hand).lerp(to, 0.5), 0x8fc0ff, 9, 10, 6);
    if (Math.random() < dt * 25) G.fx.flash(to, 0x9fc8ff, 0.8, 0.08);
    G.sound.setLightning(Math.max(0.35, 1 - G.camera.position.distanceTo(_hand) / 45));
    if (!absorbed) {
      if (tgt === p) {
        p.hurt(25 * dt, this.pos, this);
        G.fx.shake = Math.min(0.6, G.fx.shake + dt * 1.2);
      } else if (tgt.hurt) tgt.hurt(40 * dt);
    }
    // it arcs into troopers standing near the line
    if (G.squad) for (const t of G.squad.targets()) {
      if (t === tgt || t.pos.distanceTo(to) > 3) continue;
      t.hurt(20 * dt);
    }
  }

  // ------------------------------------------------------------ Force push (and the withdrawal in wave 7)
  startPush() {
    this.mode = 'push';
    this.modeT = 0.8;
    this.pushed = false;
    this.pushCD = rand(9, 13);
    this.char.play('Push', 0.08, { loop: false, restart: true });
  }

  /** The radial blast: everyone near is thrown back. */
  blast() {
    const G = this.G, p = G.player;
    G.fx.ring(_v.set(this.pos.x, this.pos.y + 0.4, this.pos.z), 12, 0.5, 0xc9d8ff);
    G.fx.flash(_v.setY(this.pos.y + 1.2), 0xc9d8ff, 4, 0.25);
    G.fx.dust(this.pos, 18, 1.4);
    G.sound.ability('riot');
    G.sound.whoosh(this.pos);
    if (p && p.alive) {
      const dx = p.pos.x - this.pos.x, dz = p.pos.z - this.pos.z, d = Math.hypot(dx, dz) || 0.01;
      if (d < 7) {
        p.hurt(12 * (1 - d / 9), this.pos, this);
        const k = 14 * (1 - d / 9);
        p.vel.x += (dx / d) * k; p.vel.z += (dz / d) * k; p.vel.y = 4.5; p.onGround = false;
      }
    }
    if (G.squad) for (const t of G.squad.targets()) if (t.pos.distanceTo(this.pos) < 8) t.hurt(30);
  }

  updatePush(dt) {
    this.modeT -= dt;
    this.ground();
    if (!this.pushed && this.modeT < 0.5) { this.pushed = true; this.blast(); }
    if (this.modeT <= 0) {
      if (this.mode === 'retreat') this.exit();
      else this.mode = 'duel';
    }
  }

  // ------------------------------------------------------------ leaps
  startLeap(tgt) {
    const G = this.G;
    const dx = tgt.pos.x - this.pos.x, dz = tgt.pos.z - this.pos.z, d = Math.hypot(dx, dz) || 1;
    const to = new THREE.Vector3(tgt.pos.x - (dx / d) * 3, 0, tgt.pos.z - (dz / d) * 3);
    const b = G.arena.bounds;
    to.x = clamp(to.x, b.minX + 2, b.maxX - 2);
    to.z = clamp(to.z, b.minZ + 2, b.maxZ - 2);
    to.y = G.world.groundAt(to.x, to.z, 60, 0.3);
    if (!(to.y > -1e9)) to.y = this.pos.y;
    this.leap = { from: this.pos.clone(), to, t: 0, dur: 1.15, h: 5 + d * 0.12 };
    this.mode = 'leap';
    this.leapCD = rand(9, 14);
    this.char.play('Swing3', 0.1, { loop: false, restart: true, timeScale: 0.7 });
    G.sound.whoosh(this.pos);
    G.fx.dust(this.pos, 10, 1);
  }

  updateLeap(dt) {
    const G = this.G, L = this.leap;
    L.t += dt;
    const k = Math.min(1, L.t / L.dur);
    this.pos.lerpVectors(L.from, L.to, k);
    this.pos.y += Math.sin(k * Math.PI) * L.h;
    this.yaw = dampAngle(this.yaw, yawTo(L.to.x - L.from.x, L.to.z - L.from.z), 8, dt);
    if (Math.random() < 0.5) G.fx.smokePuff(_v.copy(this.pos).setY(this.pos.y + 0.6), 0.4, 0.4);
    if (k >= 1) {
      if (this.mode === 'exit') {
        // gone over the dunes
        this.alive = false;
        this.removed = true;
        this.lightning.draw(null);
        G.sound.setLightning(0);
        G.hud.toast('COUNT DOOKU HAS WITHDRAWN');
        if (G.onDookuWithdrew) G.onDookuWithdrew();
        return;
      }
      this.mode = 'duel';
      G.fx.dust(this.pos, 20, 1.5);
      G.fx.ring(_v.set(this.pos.x, this.pos.y + 0.15, this.pos.z), 7, 0.4, 0xd8c09a);
      G.sound.thump(this.pos);
      this.attackCD = 0;
    }
  }

  /** Wave 7: at half strength he throws everyone back and leaps away over the sandcrawler. */
  startRetreat() {
    this.mode = 'retreat';
    this.invuln = true;
    this.modeT = 1.6;
    this.pushed = false;
    this.comboT = 0;
    this.lightning.draw(null);
    this.G.sound.setLightning(0);
    this.char.play('Push', 0.08, { loop: false, restart: true });
    this.speak('Impressive. But you have only delayed the inevitable. We will meet again.');
  }

  exit() {
    const G = this.G, b = G.arena.bounds;
    const to = new THREE.Vector3(clamp(this.pos.x + 30, b.minX, b.maxX) + 25, 0, b.minZ - 40);
    to.y = this.pos.y + 6;
    this.leap = { from: this.pos.clone(), to, t: 0, dur: 2.2, h: 22 };
    this.mode = 'exit';
    this.char.play('Run', 0.2);
    G.sound.whoosh(this.pos);
    G.fx.dust(this.pos, 16, 1.4);
  }

  // ------------------------------------------------------------ taking hits
  /** Frontal fire is batted back toward the shooter (unless he is busy). Called by Combat for Republic bolts. */
  deflect(b, hit, dir) {
    const G = this.G;
    if (this.mode !== 'duel' || this.comboT > 0 || this.stunT > 0 || this.state === 'scripted') return false;
    const inc = Math.cos(angleDiff(this.yaw, Math.atan2(-dir.x, -dir.z)));
    if (inc < 0.35 || Math.random() > 0.8) return false;
    let back = null;
    const p = G.player;
    if (b.owner === 'player' && p) back = _v.set(p.pos.x, p.pos.y + 1.2, p.pos.z).sub(hit).normalize();
    else if (b.owner === 'ally' && G.ally) back = _v.set(G.ally.pos.x, G.ally.pos.y + 1.2, G.ally.pos.z).sub(hit).normalize();
    else back = _v.copy(dir).negate();
    back.x += rand(-0.04, 0.04); back.y += rand(-0.03, 0.03); back.z += rand(-0.04, 0.04);
    back.normalize();
    G.combat.fireBolt({ from: hit.clone(), dir: back.clone(), speed: 95, dmg: b.dmg * 0.6, team: 'enemy', owner: this, color: b.color, len: b.len, width: 0.13 });
    G.fx.sparks(hit, back, 0xff6a4a, 10, 5);
    G.fx.flash(hit, 0xffa080, 0.7, 0.1);
    G.sound.saberClash(hit);
    if (this.char.currentName !== 'Block') this.char.play('Block', 0.06, { restart: true });
    this.blockPose = 0.25;
    return true;
  }

  damage(amount, dir, head, source) {
    const G = this.G;
    if (!this.alive || this.defeated || this.state === 'scripted' || this.invuln) return false;
    const p = G.player;
    // Yoda's blows: he parries most of them from the front unless he is busy
    if (source === 'player' && p && p.cfg.melee && p.swingT > 0 && this.mode === 'duel' && this.comboT <= 0 && this.stunT <= 0 && dir && amount < 500) {
      const inc = Math.cos(angleDiff(this.yaw, Math.atan2(-dir.x, -dir.z)));
      if (inc > 0.2 && Math.random() < 0.55) {
        this.char.boneWorld('hand_R', _hand);
        G.fx.sparks(_hand, _v2.set(-dir.x, 0.4, -dir.z), 0xffaa66, 14, 6);
        G.sound.saberClash(_hand);
        this.char.play('Block', 0.05, { restart: true });
        this.attackCD = Math.min(this.attackCD, 0.25);
        return false;
      }
    }
    if (source === 'player') this.playerDamaged = true;
    const dmg = amount * (head ? this.cfg.headMult : 1);
    this.hp -= dmg;
    this.recent += dmg;
    this.flash = 0.06;
    if (!this.final && this.hp <= this.maxHp * this.retreatAt) {
      this.hp = this.maxHp * this.retreatAt;
      this.startRetreat();
      return false;
    }
    if (this.hp <= 0) {
      if (this.final) { this.defeat(source); return true; }
      this.hp = 1;
    }
    return false;
  }

  release() {
    this.lightning.draw(null);
    this.G.sound.setLightning(0);
    super.release();
  }

  /** Beaten to his knees: his saber goes out, and the mind trick on the desert peoples breaks. */
  defeat(source) {
    const G = this.G;
    this.hp = 0;
    this.defeated = true;
    this.alive = false;
    this.mode = 'defeated';
    this.comboT = 0;
    this.lightning.draw(null);
    G.sound.setLightning(0);
    this.char.pitch = this.char.twist = 0;
    this.char.play('Kneel', 0.35);
    this.lit = false;
    for (const m of this.char.materials) if (m.name === 'SaberRed') m.visible = false;
    G.fx.flash(_v.set(this.pos.x, this.pos.y + 1, this.pos.z), 0xffffff, 3, 0.3);
    G.stats.kills++;
    G.stats.score += 5000;
    G.hud.bp('COUNT DOOKU DEFEATED', 5000, 'gold');
    G.hud.killFeed(source === 'player' && G.player ? G.player.cfg.short : 'REPUBLIC', 'rep', 'COUNT DOOKU', 'sep', false);
    G.enemies.freeAll();
    if (G.onDookuDefeated) G.onDookuDefeated(this);
  }
}

ENEMY_CLASSES.dooku = Dooku;
