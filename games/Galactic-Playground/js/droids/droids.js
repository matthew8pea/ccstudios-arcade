/* GALACTIC PLAYGROUND — non-humanoid droids.
 * `bot`      configurable single-body droid: locomotion (roll / hover / waddle / scurry), optional
 *            blaster, optional arc zapper, chatter; driven by the same intent model as characters.
 * `droideka` rolls as a wheel, unfolds into a tripod with twin blasters and a deflector shield.
 * Humanoid droids (battle droids, protocol droids, etc.) use the character system with mech: true.
 */
'use strict';

(() => {
  const Phys = GP.Phys, M = GP.M, CAT = Phys.CAT;

  class Bot extends GP.Entity {
    constructor(game, def, opts) {
      super(game, def, opts);
      this.isCharacterLike = true;
      this.mech = true;
      this.material = def.material || 'droid';
      this.state = 'alive';
      this.intent = GP.Character.prototype.blankIntent();
      this.playerControlled = false;
      this.aiMode = opts.aiMode || def.aiMode || 'aggressive';
      this.cfg = Object.assign({ locomotion: 'roll', speed: 2, hoverHeight: 1.5, sight: 20 }, def.bot || {});
      this.cd = 0; this.t = Math.random() * 10; this.wanderT = 0; this.wanderDir = 0; this.target = null; this.thinkT = 0;
      this.stun = 0; this.skill = this.cfg.skill || 0.4;
      this.stats = { skill: this.skill, strength: 1 };
      this.boost = 0;
      this.zapCD = 0;
    }
    build(x, y, opts = {}) {
      const def = this.def;
      this.facing = opts.facing || this.facing || 1;
      const b = new Phys.Body({ x, y, angle: opts.angle || 0, angularDamping: 1.5, linearDamping: this.cfg.locomotion === 'hover' ? 1.2 : 0.05 });
      for (const s of GP.buildShapes(def.shapes, this.facing * this.scale, this.scale, { density: def.density || 200, friction: def.friction != null ? def.friction : 0.8, restitution: 0.1, category: CAT.CHAR, mask: CAT.ALL })) b.addShape(s);
      b.finalize();
      b.allowSleep = false;
      this.addBody(b);
      return this;
    }
    position() { return { x: this.body.x, y: this.body.y }; }
    healthFraction() { return this.hp / this.maxHp; }
    isHostileTo(o) { return GP.Teams.hostile(this.team, o.team); }
    knockDown(s) { this.stun = Math.max(this.stun, s * 0.6); }
    hasBlaster() { return !!this.def.weapon; }
    hasSaber() { return false; }
    items() { return []; }
    damage(info) {
      if (this.state === 'dead') return super.damage(Object.assign({}, info, { amount: info.amount * 0.3 }));
      let amt = info.amount;
      if (info.type === 'ion' || info.type === 'electric') { amt *= 1.6; this.stun = Math.max(this.stun, 1.5); }
      const r = this.resist[info.type] != null ? this.resist[info.type] : 1;
      this.hp -= amt * r;
      if (info.source && info.source !== this) this.target = info.source.holder || info.source;
      if (info.x != null && (info.type === 'blaster' || info.type === 'cut')) this.body.addDecal(info.type === 'cut' ? 'cut' : 'scorch', info.x, info.y, 0.04);
      GP.FX.sparks(info.x != null ? info.x : this.body.x, info.y != null ? info.y : this.body.y, 0, -1, 4, '#ffe08a', 3);
      if (this.hp <= 0) this.die();
      return amt;
    }
    die() {
      if (this.state === 'dead') return;
      this.state = 'dead'; this.alive = false; this.hp = Math.max(this.hp, -1);
      const b = this.body;
      GP.FX.sparks(b.x, b.y, 0, -1, 18, '#ffe08a', 6);
      GP.FX.smoke(b.x, b.y, 4, 0.3, '#333');
      GP.Audio.play('zap', { x: b.x, y: b.y });
      b.linearDamping = 0.05; b.angularDamping = 0.2;
      if (this.def.explodeOnDeath) GP.Damage.explode(this.game, b.x, b.y, { radius: this.def.explodeOnDeath, damage: 60, power: 8, source: this });
      b.allowSleep = true;
      GP.Events.emit('character:died', { e: this });
      if (this.playerControlled) GP.Events.emit('control:lost', { e: this });
    }
    heal() { this.hp = this.maxHp; this.state = 'alive'; this.alive = true; this.body.allowSleep = false; this.body.linearDamping = this.cfg.locomotion === 'hover' ? 1.2 : 0.05; this.body.angularDamping = 1.5; }

    think() {
      const b = this.body;
      if (this.target && (this.target.removed || this.target.state === 'dead' || !GP.Teams.hostile(this.team, this.target.team))) this.target = null;
      if (!this.target && this.aiMode !== 'passive' && this.aiMode !== 'flee') this.target = GP.Brain.findTarget(this.game, this, b.x, b.y, this.team, this.cfg.sight);
    }
    update(dt) {
      this.t += dt;
      if (this.zapCD > 0) this.zapCD -= dt;
      if (this.cd > 0) this.cd -= dt;
      if (this.state === 'dead') { if (Math.random() < dt * 2) GP.FX.smoke(this.body.x, this.body.y, 1, 0.2, '#333'); return; }
      if (this.stun > 0) { this.stun -= dt; if (Math.random() < 0.3) GP.FX.sparks(this.body.x, this.body.y, 0, -1, 1, '#bfe0ff', 2); return; }
      const I = this.intent;
      if (!this.playerControlled) {
        I.moveX = 0; I.jump = false; I.crouch = false; I.attack = false; I.run = false;
        if (GP.aiEnabled() && this.aiMode !== 'off') this.ai(dt);
      }
      this.locomote(dt);
      this.act(dt);
      if (this.hp < this.maxHp * 0.5 && Math.random() < dt * 3) GP.FX.sparks(this.body.x, this.body.y, 0, -1, 2, '#ffe08a', 2);
      if (this.def.voice && Math.random() < dt * 0.05) GP.Audio.play('droidBeep', { x: this.body.x, y: this.body.y, vol: 0.2 });
    }
    ai(dt) {
      const I = this.intent, b = this.body;
      this.thinkT -= dt;
      if (this.thinkT <= 0) { this.thinkT = 0.3; this.think(); }
      const T = this.target;
      if (T && this.aiMode !== 'flee') {
        const p = T.position();
        const dx = p.x - b.x, dy = p.y - b.y, d = Math.hypot(dx, dy);
        I.hasAim = true; I.aimX = p.x + Math.sin(this.t * 2) * (1 - this.skill); I.aimY = p.y + Math.cos(this.t * 1.7) * (1 - this.skill) * 0.7;
        const pref = this.cfg.range || (this.def.zap ? 1.2 : 8);
        if (Math.abs(dx) > pref + 1) I.moveX = Math.sign(dx);
        else if (Math.abs(dx) < pref - 1.5) I.moveX = -Math.sign(dx) * 0.6;
        if (this.cfg.locomotion === 'hover') { I.jump = dy < -1; I.crouch = dy > 1.5; }
        if (d < (this.def.zap ? this.def.zap.range : 40)) I.attack = true;
      } else if (T && this.aiMode === 'flee') {
        I.moveX = T.position().x > b.x ? -1 : 1; I.run = true;
      } else {
        this.wanderT -= dt;
        if (this.wanderT <= 0) { this.wanderT = M.rand(1.5, 4); this.wanderDir = M.pick([-1, 0, 0, 1]); I.hasAim = false; }
        I.moveX = this.wanderDir * 0.5;
      }
      if (this.cfg.companion && !T) {
        // follow the nearest friendly character
        let best = null, bd = 30;
        for (const e of this.game.entities) if (e instanceof GP.Character && e.state === 'alive' && !GP.Teams.hostile(this.team, e.team)) { const d = Math.hypot(e.position().x - b.x, e.position().y - b.y); if (d < bd) { bd = d; best = e; } }
        if (best && bd > 2.5) I.moveX = Math.sign(best.position().x - b.x);
      }
    }
    locomote(dt) {
      const I = this.intent, b = this.body, c = this.cfg;
      const g = this.game.world.gravityY;
      const speed = c.speed * (I.run ? 1.6 : 1);
      if (Math.abs(I.moveX) > 0.1) {
        const f = Math.sign(I.moveX);
        if (f !== this.facing) this.setFacing(f);
      }
      // upright torque
      const upright = c.locomotion !== 'roll' || c.uprightRoll;
      if (upright) b.applyTorque((-M.wrapAngle(b.a) * 90 - b.w * 14) * b.m * 0.08 * (c.torque || 1));
      if (c.locomotion === 'hover') {
        const hit = this.game.world.raycast(b.x, b.y, b.x, b.y + c.hoverHeight * 1.8, (s) => !s.sensor && s.body !== b && s.category !== CAT.DEBRIS && s.tag !== 'blade');
        const target = c.hoverHeight + (I.jump ? 1.2 : 0) - (I.crouch ? 0.8 : 0);
        let fy;
        if (hit) { const d = hit.t * c.hoverHeight * 1.8; fy = -b.m * g * b.gravityScale - b.m * (target - d) * 22 - b.m * b.vy * 5; }
        else fy = -b.m * g * b.gravityScale * 0.9 - b.m * (I.jump ? 4 : 0) - b.m * b.vy * 2;
        b.applyForce(b.m * M.clamp((I.moveX * speed - b.vx) * 3, -8, 8), fy);
        if (Math.random() < dt * 6) GP.FX.spawn(GP.FX.K.GLOW, b.x, b.y + 0.3 * this.scale, 0, 1, 0.2, 0.08, this.def.thrusterColor || '#8ad0ff', { size1: 0.02, alpha: 0.6 });
      } else {
        const grounded = !!this.game.world.raycast(b.x, b.y, b.x, b.y + b.radius + 0.25, (s) => !s.sensor && s.body !== b && s.tag !== 'blade');
        if (grounded) {
          b.applyForce(b.m * M.clamp((I.moveX * speed - b.vx) * 6, -12, 12), 0);
          if (c.locomotion === 'waddle' && Math.abs(b.vx) > 0.2) b.applyTorque(Math.sin(this.t * 10) * b.m * 0.3);
          if (c.locomotion === 'roll' && !upright) b.applyTorque(I.moveX * b.m * 3);
          if (I.jump && c.jump && this.boost <= 0) { b.applyImpulse(0, -b.m * c.jump); this.boost = 0.8; }
        }
        if (this.boost > 0) this.boost -= dt;
        if (c.rockets && I.jump && !grounded) { b.applyForce(0, -b.m * g * 1.3); GP.FX.fire(b.x - 0.1 * this.facing, b.y + 0.4, 1, 0.1, 3); }
      }
    }
    act() {
      const I = this.intent, b = this.body;
      if (!I.attack) return;
      const w = this.def.weapon;
      if (w && this.cd <= 0) {
        const m = b.originToWorld((w.muzzle[0]) * this.facing * this.scale, w.muzzle[1] * this.scale);
        const dx = I.aimX - m.x, dy = I.aimY - m.y, l = Math.hypot(dx, dy) || 1;
        if (w.arc == null || Math.abs(M.wrapAngle(Math.atan2(dy, dx) - (this.facing > 0 ? 0 : Math.PI))) < w.arc) {
          const a = Math.atan2(dy, dx) + M.rand(-1, 1) * (w.spread || 0.05);
          GP.Projectiles.fire(this.game, { x: m.x, y: m.y, vx: Math.cos(a) * (w.speed || 45), vy: Math.sin(a) * (w.speed || 45), color: w.color || '#ff3030', damage: w.damage || 10, width: w.size || 0.04, len: w.len || 0.4, owner: this, team: this.team, ignore: [this] });
          GP.FX.muzzleFlash(m.x, m.y, dx / l, dy / l, w.color || '#ff3030');
          GP.Audio.play('blaster', { x: m.x, y: m.y, pitch: w.pitch || 1.3, vol: 0.3 });
          this.cd = 1 / (w.rate || 2);
        }
      }
      const z = this.def.zap;
      if (z && this.zapCD <= 0) {
        const T = this.target;
        const tp = T && T.position ? T.position() : { x: I.aimX, y: I.aimY };
        const d = Math.hypot(tp.x - b.x, tp.y - b.y);
        if (d < z.range) {
          const hitB = T && T.parts ? M.pick(T.partList) : T && T.body ? T.body : null;
          GP.FX.arc(b.x, b.y, tp.x, tp.y, '#9fd8ff', 0.2, 0.03);
          if (hitB) GP.Damage.hit(hitB, { type: 'electric', amount: z.damage, x: tp.x, y: tp.y, source: this });
          GP.Audio.play('zap', { x: b.x, y: b.y });
          this.zapCD = z.cooldown || 1.5;
        }
      }
    }
    setFacing(f) {
      if (f === this.facing || this.def.noFlip) return;
      const b = this.body;
      this.facing = f;
      for (const c of b.contacts.slice()) this.game.world.destroyContact(c);
      b.shapes = [];
      for (const s of GP.buildShapes(this.def.shapes, f * this.scale, this.scale, { density: this.def.density || 200, friction: this.def.friction != null ? this.def.friction : 0.8, restitution: 0.1, category: CAT.CHAR, mask: CAT.ALL })) b.addShape(s);
      const wx = b.c * b.ox - b.s * b.oy, wy = b.s * b.ox + b.c * b.oy;
      b.x += wx; b.y += wy; b.ox = 0; b.oy = 0;
      b.finalize();
      if (this.props.noCollide) this.setCollisions(false);
    }
    draw(ctx, dt) {
      const b = this.body;
      ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.a);
      ctx.save(); ctx.translate(b.ox, b.oy); ctx.scale(this.facing * this.scale, this.scale);
      if (this.def.paint) this.def.paint(ctx, this); else if (this.def.art) GP.Draw.art(ctx, this.def.art);
      ctx.restore();
      GP.Draw.decals(ctx, b, dt);
      ctx.restore();
      if (this.def.eye && this.state === 'alive') {
        const p = b.originToWorld(this.def.eye[0] * this.facing * this.scale, this.def.eye[1] * this.scale);
        GP.Draw.glow(ctx, p.x, p.y, 0.12 * this.scale, this.def.eye[2] || '#ff3030', 0.9);
        GP.FX.frameLight(p.x, p.y, 1.2, this.def.eye[2] || '#ff3030', 0.4);
      }
    }
    getProperties() {
      const l = [
        { key: 'hp', label: 'Integrity', type: 'meter', get: () => this.hp / this.maxHp },
        { key: 'team', label: 'Team', type: 'select', options: GP.Teams.list(), get: () => this.team, set: (v) => { this.team = v; this.target = null; } },
        { key: 'ai', label: 'Behavior', type: 'select', options: [['aggressive', 'Aggressive'], ['passive', 'Passive'], ['flee', 'Cowardly'], ['off', 'Idle']], get: () => this.aiMode, set: (v) => { this.aiMode = v; } },
        { key: 'repair', label: this.state === 'dead' ? 'Reactivate' : 'Repair', type: 'button', action: () => this.heal() },
        { key: 'kill', label: 'Shut down', type: 'button', action: () => this.die() },
        { key: 'sep', type: 'sep' },
      ];
      return l.concat(super.getProperties().filter((p) => p.key !== 'hp' && p.key !== 'repair'));
    }
    saveState() { return { state: this.state, ai: this.aiMode }; }
    loadState(s) { if (!s) return; this.aiMode = s.ai || this.aiMode; if (s.state === 'dead') this.die(); }
  }
  GP.Registry.registerKind('bot', Bot);
  GP.Bot = Bot;

  /* ---------------------------------------------------------------- droideka */
  class Droideka extends Bot {
    constructor(game, def, opts) {
      super(game, def, opts);
      this.mode = 'ball';       // ball | unfolding | deployed | folding
      this.morph = 0;           // 0 ball .. 1 deployed
      this.shieldHp = 260; this.shieldMax = 260; this.shieldDown = 0; this.shieldUp = false; this.shimmer = 0;
      this.gunSide = 0;
    }
    build(x, y, opts = {}) {
      this.facing = opts.facing || 1;
      const b = new Phys.Body({ x, y, angularDamping: 0.3 });
      this.ballShapes(b);
      b.finalize(); b.allowSleep = false;
      this.addBody(b);
      if (opts.deployed) { this.mode = 'unfolding'; }
      return this;
    }
    ballShapes(b) {
      b.addShape(Phys.circle(0.42 * this.scale, 0, 0, { density: 260, friction: 1.0, restitution: 0.2, category: CAT.CHAR }));
    }
    deployedShapes(b) {
      const s = this.scale, f = this.facing;
      b.addShape(Phys.poly([-0.35 * f * s, -0.9 * s, 0.35 * f * s, -1.05 * s, 0.45 * f * s, -0.45 * s, -0.3 * f * s, -0.3 * s], { density: 180, friction: 0.9, category: CAT.CHAR }));
      b.addShape(Phys.poly([-0.55 * f * s, 0, 0.55 * f * s, 0, 0.3 * f * s, -0.35 * s, -0.3 * f * s, -0.35 * s], { density: 180, friction: 1.2, category: CAT.CHAR }));
      const sh = Phys.circle(1.25 * s, 0, -0.65 * s, { density: 0, sensor: true, category: CAT.SHIELD, mask: CAT.ALL, massless: true });
      sh.tag = 'shield';
      b.addShape(sh);
    }
    // Swap collision geometry between ball and tripod. dy shifts the authoring origin (ball center <-> feet).
    reshape(deployed, dy = 0) {
      const b = this.body;
      const ox = b.originX(), oy = b.originY() + dy;
      for (const c of b.contacts.slice()) this.game.world.destroyContact(c);
      b.shapes = []; b.ox = 0; b.oy = 0;
      b.x = ox; b.y = oy;
      b.setAngle(0); b.w = 0;
      if (deployed) this.deployedShapes(b); else this.ballShapes(b);
      b.finalize();
      b.angularDamping = deployed ? 3 : 0.3;
    }
    absorbBolt(p, x, y) {
      this.shieldHp -= p.damage;
      this.shimmer = 0.3;
      GP.FX.energyImpact(x, y, 0, -1, '#8ad0ff');
      GP.FX.ring(x, y, 0.35, '#9fe2ff', 0.25, 0.05);
      GP.Audio.play('boltImpact', { x, y, vol: 0.2 });
      if (this.shieldHp <= 0) { this.shieldDown = 6; this.shieldUp = false; GP.FX.sparks(this.body.x, this.body.y - 0.6, 0, -1, 20, '#9fe2ff', 5, Math.PI); GP.Audio.play('ion', { x, y, vol: 0.4 }); }
    }
    damage(info) {
      if (this.shieldUp && (info.type === 'explosive' || info.type === 'ion')) {
        this.shieldHp -= info.amount * (info.type === 'ion' ? 3 : 1); this.shimmer = 0.4;
        if (this.shieldHp <= 0) { this.shieldDown = 6; this.shieldUp = false; }
        return info.amount;
      }
      return super.damage(info);
    }
    update(dt) {
      this.t += dt;
      if (this.state === 'dead') { this.shieldUp = false; if (Math.random() < dt * 2) GP.FX.smoke(this.body.x, this.body.y, 1, 0.2, '#333'); return; }
      if (this.stun > 0) { this.stun -= dt; return; }
      const b = this.body, I = this.intent;
      if (this.shieldDown > 0) { this.shieldDown -= dt; if (this.shieldDown <= 0) this.shieldHp = this.shieldMax * 0.5; }
      if (this.shimmer > 0) this.shimmer -= dt;
      if (!this.playerControlled) {
        I.moveX = 0; I.attack = false;
        this.thinkT -= dt;
        if (this.thinkT <= 0) { this.thinkT = 0.3; if (GP.aiEnabled() && this.aiMode !== 'off') this.think(); else this.target = null; }
      }
      const T = this.target;
      const tp = T ? T.position() : null;
      const d = tp ? Math.hypot(tp.x - b.x, tp.y - b.y) : 99;
      if (this.mode === 'ball') {
        this.shieldUp = false;
        let dir = I.moveX;
        if (!this.playerControlled && T) dir = d > 9 ? Math.sign(tp.x - b.x) : 0;
        b.applyTorque(dir * b.m * 4.5 * (this.def.bot && this.def.bot.speed || 1));
        if (dir) this.facing = Math.sign(dir) || this.facing;
        if (Math.random() < dt * 8 && Math.abs(b.w) > 3) GP.Audio.play('servo', { x: b.x, y: b.y, vol: 0.08 });
        const wantDeploy = this.playerControlled ? I.crouch || I.attack : (T && d < 12 && Math.abs(b.w) < 6);
        if (wantDeploy) { b.w *= 0.5; if (Math.abs(b.w) < 2.5) { this.mode = 'unfolding'; this.morph = 0; this.reshape(true, 0.42 * this.scale); GP.Audio.play('servo', { x: b.x, y: b.y }); } }
        else b.w = M.clamp(b.w, -18, 18);
      } else {
        // deployed / morphing: stay upright
        b.applyTorque((-M.wrapAngle(b.a) * 400 - b.w * 60) * this.scale);
        if (this.mode === 'unfolding') { this.morph = Math.min(1, this.morph + dt * 1.4); if (this.morph >= 1) this.mode = 'deployed'; }
        if (this.mode === 'folding') { this.morph = Math.max(0, this.morph - dt * 1.8); if (this.morph <= 0) { this.mode = 'ball'; this.reshape(false, -0.45 * this.scale); } }
        this.shieldUp = this.mode === 'deployed' && this.shieldDown <= 0;
        if (this.mode === 'deployed') {
          if (this.shieldHp < this.shieldMax && this.shieldDown <= 0) this.shieldHp = Math.min(this.shieldMax, this.shieldHp + dt * 12);
          if (!this.playerControlled && T) { I.hasAim = true; I.aimX = tp.x + Math.sin(this.t * 3) * 0.4; I.aimY = tp.y + Math.cos(this.t * 2) * 0.3; I.attack = true; }
          if (tp && !this.playerControlled && Math.abs(tp.x - b.x) > 1) { const f = Math.sign(tp.x - b.x); if (f !== this.facing) { this.facing = f; this.reshape(true); } }
          if (this.playerControlled && I.hasAim) { const f = Math.sign(I.aimX - b.x) || this.facing; if (f !== this.facing) { this.facing = f; this.reshape(true); } }
          if (I.attack && this.cd <= 0) this.fireTwin();
          const wantFold = this.playerControlled ? Math.abs(I.moveX) > 0.5 : (!T || d > 18);
          if (wantFold) { this.mode = 'folding'; this.shieldUp = false; GP.Audio.play('servo', { x: b.x, y: b.y }); }
        }
      }
      if (this.cd > 0) this.cd -= dt;
    }
    fireTwin() {
      const b = this.body, I = this.intent;
      const side = this.gunSide = 1 - this.gunSide;
      const m = b.originToWorld(0.55 * this.facing * this.scale, (-0.55 - side * 0.1) * this.scale);
      const a = Math.atan2(I.aimY - m.y, I.aimX - m.x) + M.rand(-0.04, 0.04);
      GP.Projectiles.fire(this.game, { x: m.x, y: m.y, vx: Math.cos(a) * 55, vy: Math.sin(a) * 55, color: '#ff3a2a', damage: 14, width: 0.045, len: 0.6, owner: this, team: this.team, ignore: [this] });
      GP.FX.muzzleFlash(m.x, m.y, Math.cos(a), Math.sin(a), '#ff3a2a');
      GP.Audio.play('blaster', { x: m.x, y: m.y, pitch: 1.15, vol: 0.35 });
      this.cd = 0.16;
    }
    draw(ctx, dt) {
      const b = this.body, s = this.scale, f = this.facing;
      const c1 = '#6e5a44', c2 = '#8e7858', c3 = '#4a3c2e';
      ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.a);
      if (this.mode === 'ball') {
        ctx.save(); ctx.translate(b.ox, b.oy); ctx.scale(s, s);
        ctx.beginPath(); ctx.arc(0, 0, 0.42, 0, 7); ctx.fillStyle = c1; ctx.fill(); ctx.strokeStyle = GP.Draw.OUTLINE; ctx.lineWidth = 0.025; ctx.stroke();
        ctx.beginPath(); ctx.arc(0, 0, 0.3, 0.3, 2.8); ctx.strokeStyle = c3; ctx.lineWidth = 0.06; ctx.stroke();
        ctx.beginPath(); ctx.arc(0, 0, 0.3, 3.4, 5.9); ctx.stroke();
        ctx.fillStyle = c2; ctx.beginPath(); ctx.arc(0, 0, 0.1, 0, 7); ctx.fill();
        ctx.restore();
      } else {
        const m = M.smooth(this.morph);
        ctx.save(); ctx.translate(b.ox, b.oy); ctx.scale(f * s, s);
        const L = GP.Draw.OUTLINE;
        const line = (x1, y1, x2, y2, w, c) => { ctx.strokeStyle = L; ctx.lineWidth = w + 0.03; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); ctx.strokeStyle = c; ctx.lineWidth = w; ctx.stroke(); };
        // legs
        line(0, -0.35, -0.5 * m, 0, 0.07, c3); line(0, -0.35, 0.5 * m, 0, 0.07, c3); line(0, -0.35, 0.05, 0, 0.06, c1);
        // body
        ctx.beginPath(); ctx.ellipse(0, -0.35 - 0.35 * m, 0.34, 0.24, -0.4 * m, 0, 7); ctx.fillStyle = c2; ctx.fill(); ctx.strokeStyle = L; ctx.lineWidth = 0.025; ctx.stroke();
        // head
        ctx.beginPath(); ctx.ellipse(0.22 * m, -0.6 - 0.4 * m, 0.2, 0.13, 0.3, 0, 7); ctx.fillStyle = c1; ctx.fill(); ctx.stroke();
        // arms with twin guns
        line(0.1, -0.55 - 0.1 * m, 0.55 * m, -0.55 - 0.05 * m, 0.06, c3);
        line(0.1, -0.5 - 0.1 * m, 0.55 * m, -0.45 - 0.05 * m, 0.05, c1);
        ctx.restore();
        if (this.shieldUp || this.shimmer > 0) {
          const sp = b.originToWorld(0, -0.65 * s);
          ctx.restore(); ctx.save();
          const a = (this.shieldUp ? 0.12 : 0) + Math.max(0, this.shimmer) * 1.2;
          const hpF = this.shieldHp / this.shieldMax;
          ctx.globalCompositeOperation = 'lighter';
          ctx.fillStyle = M.rgba('#6ec8ff', a * 0.5);
          ctx.strokeStyle = M.rgba('#9fe2ff', 0.25 + a);
          ctx.lineWidth = 0.03;
          ctx.beginPath(); ctx.arc(sp.x, sp.y, 1.25 * s * (0.97 + Math.sin(this.t * 9) * 0.01), 0, 7); ctx.fill(); ctx.stroke();
          ctx.setLineDash([0.1, 0.12]); ctx.lineDashOffset = this.t * 0.3;
          ctx.strokeStyle = M.rgba('#9fe2ff', 0.2 * hpF + 0.05);
          ctx.beginPath(); ctx.arc(sp.x, sp.y, 1.18 * s, 0, 7); ctx.stroke(); ctx.setLineDash([]);
          ctx.globalCompositeOperation = 'source-over';
          GP.FX.frameLight(sp.x, sp.y, 2.5, '#6ec8ff', 0.3);
        }
      }
      ctx.restore();
      void dt;
    }
    getProperties() {
      const l = super.getProperties();
      l.splice(1, 0, { key: 'shield', label: 'Shield', type: 'meter', get: () => this.shieldHp / this.shieldMax });
      return l;
    }
  }
  GP.Registry.registerKind('droideka', Droideka);
})();
