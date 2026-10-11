/* GALACTIC PLAYGROUND — character AI.
 * The brain only writes to character.intent (the same interface the player uses), so AI characters
 * are bound by the same physics: they can be knocked down, disarmed, blocked by walls, and miss.
 * Styles emerge from equipment: saber/melee fighters close in and guard against bolts, gunners hold
 * range and strafe, Force users mix in pushes, pulls, lifts and lightning, the unarmed scavenge.
 */
'use strict';

GP.Brain = class Brain {
  constructor(c) {
    this.c = c;
    this.target = null;
    this.thinkT = Math.random() * 0.3;
    this.strafeT = 0; this.strafeDir = Math.random() < 0.5 ? -1 : 1;
    this.stuckT = 0; this.powerCD = GP.M.rand(1.5, 4); this.grenadeCD = GP.M.rand(3, 9);
    this.guarding = false;
    this.aggressor = null;
    this.home = null;
    this.goalItem = null;
    this.power = null;
    this.idleT = 0; this.idleDir = 0;
    this.wobble = Math.random() * 10;
    this.clearShot = true;
    this.grenades = (c.def.ai && c.def.ai.grenades) || 0;
    this.jetT = 0;
  }

  static visible(game, x1, y1, x2, y2) {
    const hit = game.world.raycast(x1, y1, x2, y2, (s) => !s.sensor && s.body.type === GP.Phys.STATIC && s.category === GP.Phys.CAT.WORLD);
    return !hit;
  }

  // Nearest hostile, living, visible entity (characters, droids, vehicles)
  static findTarget(game, self, x, y, team, range, needLOS = true) {
    let best = null, bd = range;
    for (const e of game.entities) {
      if (e === self || e.removed || e.hidden) continue;
      if (!(e.isCharacterLike || e.isVehicle)) continue;
      if (e.state === 'dead' || e.alive === false) continue;
      if (e.isVehicle && !e.occupied()) continue;
      const et = e.isVehicle ? e.team : e.team;
      if (!GP.Teams.hostile(team, et)) continue;
      const p = e.position();
      const d = Math.hypot(p.x - x, p.y - y);
      if (d >= bd) continue;
      if (needLOS && !Brain.visible(game, x, y - 0.3, p.x, p.y)) continue;
      bd = d; best = e;
    }
    return best;
  }

  onDamaged(src) {
    let s = src;
    if (s && s.holder) s = s.holder;
    if (s && s !== this.c && (s.isCharacterLike || s.isVehicle) && s.state !== 'dead') {
      this.aggressor = s;
      if (!this.target || Math.random() < 0.4) this.target = s;
    }
  }

  think() {
    const c = this.c, game = c.game;
    const t = c.parts.torso;
    if (!this.home) this.home = { x: t.x, y: t.y };
    const mode = c.aiMode;
    const range = mode === 'defensive' ? 18 : 30;
    // validate target
    if (this.target && (this.target.removed || this.target.state === 'dead' || this.target.alive === false || this.target.hidden || !GP.Teams.hostile(c.team, this.target.team))) this.target = null;
    if (this.aggressor && (this.aggressor.removed || this.aggressor.state === 'dead')) this.aggressor = null;
    if (mode === 'passive' || mode === 'flee') {
      this.target = this.aggressor;
    } else {
      const cand = Brain.findTarget(game, c, t.x, t.y, c.team, range);
      if (cand && (!this.target || cand !== this.target)) {
        if (!this.target) this.target = cand;
        else {
          const tp = this.target.position(), cp = cand.position();
          if (Math.hypot(cp.x - t.x, cp.y - t.y) < Math.hypot(tp.x - t.x, tp.y - t.y) - 3) this.target = cand;
        }
      }
      if (this.target && !Brain.visible(game, t.x, t.y - 0.3, this.target.position().x, this.target.position().y)) {
        this.lostT = (this.lostT || 0) + 0.25;
        if (this.lostT > 4) { this.target = null; this.lostT = 0; }
      } else this.lostT = 0;
    }
    // unarmed: look for a weapon
    this.goalItem = null;
    if (!c.mainItem() && mode !== 'flee' && mode !== 'passive' && c.def.ai && c.def.ai.scavenge !== false && !c.mech) {
      let best = null, bd = 12;
      for (const e of game.entities) {
        if (!e.isItem || e.holder || e.removed || e.isJetpack || e.isExplosive) continue;
        const p = e.body;
        const d = Math.hypot(p.x - t.x, p.y - t.y);
        if (d < bd) { bd = d; best = e; }
      }
      this.goalItem = best;
    }
    // friendly fire check
    this.clearShot = true;
    if (this.target && c.hasBlaster()) {
      const tp = this.target.position();
      const hit = game.world.raycast(t.x, t.y - 0.25, tp.x, tp.y, (s) => !s.sensor && s.tag !== 'blade' && s.body.entity !== c && !(s.body.entity && s.body.entity.holder === c));
      if (hit && hit.body.entity && hit.body.entity !== this.target && hit.body.entity.isCharacterLike && !GP.Teams.hostile(c.team, hit.body.entity.team)) this.clearShot = false;
    }
  }

  update(dt) {
    const c = this.c, I = c.intent, M = GP.M;
    I.moveX = 0; I.run = false; I.jump = false; I.crouch = false; I.attack = false; I.block = false;
    if (!this.power) { I.power = null; I.powerHeld = false; }
    c.guardTarget = null;
    this.guarding = false;
    this.wobble += dt;
    if (this.powerCD > 0) this.powerCD -= dt;
    if (this.grenadeCD > 0) this.grenadeCD -= dt;
    this.thinkT -= dt;
    if (this.thinkT <= 0) { this.thinkT = 0.25 + Math.random() * 0.1; this.think(); }
    if (c.stun > 0 || c.balance < 0.6) { if (this.power) this.endPower(); return; }
    const t = c.parts.torso;
    const mode = c.aiMode;
    const main = c.mainItem();
    const melee = main && (main.isSaber || main.isMelee);
    // --- guard against incoming bolts (saber wielders) ---
    if (c.hasSaber() && GP.Projectiles.count()) {
      const inc = GP.Projectiles.incoming(t.x, t.y, 1.4 * c.scale, c.team, 0.45);
      if (inc.length) {
        const p = inc[0].p, tt = Math.max(0.05, inc[0].t - 0.06);
        c.guardTarget = { x: p.x + p.vx * tt, y: p.y + p.vy * tt };
        this.guarding = true;
        I.block = true;
        I.hasAim = true; I.aimX = p.x; I.aimY = p.y;
        c.forEachSaber((s) => { if (!s.active) s.setActive(true); });
      }
    }
    // --- guard against enemy blades (parry stance) ---
    if (!this.guarding && c.hasSaber()) {
      if (this.parryT > 0) { this.parryT -= dt; }
      let best = null, bd = 1.7 * c.scale;
      for (const s of GP.Sabers.activeBlades()) {
        const h = s.saber.holder;
        if (!h || h === c || !GP.Teams.hostile(c.team, h.team)) continue;
        const mx = (s.x1 + s.x2) / 2, my = (s.y1 + s.y2) / 2;
        const d = Math.hypot(mx - t.x, my - t.y);
        if (d < bd && (h.attack || d < 1.2 * c.scale)) { bd = d; best = { x: s.x2 * 0.6 + mx * 0.4, y: s.y2 * 0.6 + my * 0.4 }; }
      }
      if (best && (this.parryT > 0 || Math.random() < c.stats.skill * 1.2)) {
        c.guardTarget = best; this.guarding = true;
        c.forEachSaber((s) => { if (!s.active) s.setActive(true); });
      }
    }
    // --- on fire: panic ---
    if (this.panicT > 0 && !c.mech) {
      this.panicT -= dt;
      if (!this.panicDir || Math.random() < dt * 0.8) this.panicDir = M.pick([-1, 1]);
      I.moveX = this.panicDir; I.run = true; I.attack = false;
      if (Math.random() < dt * 0.6) I.jump = true;
      return;
    }
    // --- flee ---
    const hp = c.healthFraction();
    const fleeing = mode === 'flee' || (!c.mech && hp < 0.3 && c.team !== 'sith' && !c.isForceUser() && Math.random() < 0.02 ? true : this.fleeing);
    this.fleeing = fleeing && (mode === 'flee' || hp < 0.35);
    const T = this.target;
    if (this.fleeing && T) {
      const tp = T.position();
      I.moveX = tp.x > t.x ? -1 : 1; I.run = true;
      this.avoidObstacles(dt);
      return;
    }
    // --- go get a weapon ---
    if (!T && this.goalItem) {
      const p = this.goalItem.body;
      I.hasAim = true; I.aimX = p.x; I.aimY = p.y;
      if (Math.abs(p.x - t.x) > 0.6) { I.moveX = Math.sign(p.x - t.x); this.avoidObstacles(dt); }
      else I.interact = true;
      return;
    }
    if (!T) {
      this.idle(dt);
      if (this.power) this.endPower();
      return;
    }
    const tp = T.position();
    const dx = tp.x - t.x, dy = tp.y - t.y;
    const dist = Math.hypot(dx, dy);
    // aim (with skill-based wobble and target lead)
    const skill = c.stats.skill;
    const tv = T.velocity ? T.velocity() : { x: 0, y: 0 };
    const lead = main && main.isBlaster ? dist / (main.stats.speed || 60) : 0;
    const wob = (1 - skill) * 0.9;
    let aimY = tp.y - (T.isCharacterLike && skill > 0.7 && T.head ? 0.25 : 0);
    if (!this.guarding) {
      I.hasAim = true;
      I.aimX = tp.x + tv.x * lead + Math.sin(this.wobble * 2.3) * wob;
      I.aimY = aimY + tv.y * lead + Math.cos(this.wobble * 1.7) * wob * 0.8;
    }
    // unarmed and a weapon nearby: grab it even with enemies around
    if (!main && this.goalItem && dist > 4) {
      const p = this.goalItem.body;
      if (Math.abs(p.x - t.x) > 0.6) I.moveX = Math.sign(p.x - t.x); else I.interact = true;
      this.avoidObstacles(dt);
      return;
    }
    // --- Force powers ---
    if (c.isForceUser() && !this.power && this.powerCD <= 0 && !this.guarding) this.choosePower(T, dist, main);
    if (this.power) { this.runPower(dt, T); return; }
    // --- grenades ---
    if (this.grenades > 0 && this.grenadeCD <= 0 && dist > 5 && dist < 13 && !c.equipment.handB && c.armFunc('B') > 0.5) {
      this.grenadeCD = GP.M.rand(6, 12);
      this.grenades--;
      const g = c.game.spawn(c.def.ai.grenadeType || 'thermal_detonator', t.x, t.y - 0.5, { silent: true, noUndo: true });
      if (g) {
        c.equip(g, 'handB');
        g.arm();
        g.cfg.fuse = Math.max(g.cfg.fuse, 1.6); g.timer = g.cfg.fuse;
        c.unequip('handB');
        const vx = dx * 0.9, vy = -Math.max(4, dist * 0.55);
        g.body.vx = GP.M.clamp(vx, -12, 12); g.body.vy = vy; g.thrower = c;
      }
    }
    // --- combat movement ---
    let pref, tol;
    if (melee) { pref = 1.15 + (main.isSaber ? main.def.blades[0].len * 0.85 : 0.9) * c.scale; tol = 0.35; }
    else if (main && main.isBlaster) { pref = main.def.ai && main.def.ai.range || (main.stats.speed > 100 ? 18 : 10); tol = 3.5; }
    else { pref = 0.9 * c.scale; tol = 0.3; }
    if (mode === 'defensive' && this.home) {
      const away = t.x - this.home.x;
      if (Math.abs(away) > 3) I.moveX = -Math.sign(away);
    }
    const horiz = Math.abs(dx);
    if (!I.moveX) {
      if (horiz > pref + tol) { I.moveX = Math.sign(dx); I.run = horiz > pref + 6 || melee; }
      else if (horiz < pref - tol && !melee) I.moveX = -Math.sign(dx);
      else if (main && main.isBlaster) {
        this.strafeT -= dt;
        if (this.strafeT <= 0) { this.strafeT = M.rand(0.8, 2.5); this.strafeDir = Math.random() < 0.45 ? 0 : M.pick([-1, 1]); }
        I.moveX = this.strafeDir * 0.6;
        if (!this.clearShot) I.moveX = this.strafeDir || 1;
      }
    }
    if (mode === 'defensive' && this.home && Math.abs(t.x + I.moveX - this.home.x) > 4) I.moveX = 0;
    // jump toward targets above
    if (dy < -1.6 && horiz < 4 && c.grounded && Math.random() < dt * 1.5) I.jump = true;
    // jetpack
    if (c.jetpack()) {
      this.jetT -= dt;
      if (this.jetT <= 0 && (dy < -2 || Math.random() < dt * 0.25)) this.jetT = M.rand(0.6, 1.4);
      if (this.jetT > 0 && c.jetpack().fuel > 0.2) I.jump = true;
    }
    this.avoidObstacles(dt);
    // --- attack ---
    if (melee) {
      if (main.isSaber && !main.active) main.setActive(true);
      const reach = pref + 0.5;
      if (dist < reach && (!this.guarding || (!I.block && Math.random() < 0.4)) && Math.random() < dt * (2 + skill * 5)) I.attack = true;
    } else if (main && main.isBlaster) {
      if (dist < 45 && this.clearShot && Math.random() < 0.97) I.attack = true;
      if (main.ammo <= 0) I.reload = true;
    } else if (!main && dist < 1.3) {
      if (Math.random() < dt * 3) I.attack = true;
    }
  }

  avoidObstacles(dt) {
    const c = this.c, I = c.intent, t = c.parts.torso;
    if (!I.moveX || !c.grounded) { this.stuckT = 0; return; }
    const dir = Math.sign(I.moveX);
    const kneeY = c.groundY - 0.35 * c.scale;
    const hit = c.game.world.raycast(t.x, kneeY, t.x + dir * 0.9 * c.scale, kneeY, (s) => !s.sensor && s.body.entity !== c && s.category !== GP.Phys.CAT.DEBRIS && s.tag !== 'blade' && !(s.body.entity && s.body.entity.holder === c) && (s.body.type === GP.Phys.STATIC || s.body.m > 30));
    if (hit) I.jump = true;
    if (Math.abs(t.vx) < 0.3) this.stuckT += dt; else this.stuckT = 0;
    if (this.stuckT > 0.8) { I.jump = true; if (this.stuckT > 2.5) { this.strafeDir = -this.strafeDir; this.stuckT = 0; } }
  }

  idle(dt) {
    const c = this.c, I = c.intent;
    this.idleT -= dt;
    if (this.idleT <= 0) {
      this.idleT = GP.M.rand(2, 6);
      this.idleDir = c.aiMode === 'aggressive' && Math.random() < 0.35 ? GP.M.pick([-1, 1]) : 0;
      I.hasAim = false;
    }
    if (this.idleDir && this.idleT > 1.2) { I.moveX = this.idleDir * 0.5; this.avoidObstacles(dt); }
    if (c.hasSaber() && Math.random() < dt * 0.1) c.forEachSaber((s) => { if (s.active && c.team !== 'sith' && !this.target) s.setActive(false); });
    if (c.mech && c.def.voice === 'astro' && Math.random() < dt * 0.1) GP.Audio.play('droidBeep', { x: c.parts.torso.x, y: c.parts.torso.y, vol: 0.2 });
  }

  choosePower(T, dist, main) {
    const c = this.c;
    const powers = c.stats.force.powers;
    const range = 9 * c.stats.force.range;
    if (dist > range) return;
    const opts = [];
    if (powers.includes('push') && dist < 5) opts.push('push', 'push');
    if (powers.includes('pull') && T.hasBlaster && T.hasBlaster() && dist > 2.5) opts.push('pull');
    if (powers.includes('lightning') && dist < 7) opts.push('lightning', 'lightning');
    if (powers.includes('lift') && dist < 8 && dist > 2) opts.push('lift');
    if (powers.includes('repulse') && dist < 3) opts.push('repulse');
    if (!main && powers.includes('push')) opts.push('push');
    if (!opts.length) return;
    const p = GP.M.pick(opts);
    this.power = { name: p, t: 0, dur: p === 'lightning' ? GP.M.rand(1, 2) : p === 'lift' ? GP.M.rand(1.2, 2) : 0.1, target: T };
    this.powerCD = GP.M.rand(3, 6) / Math.max(0.5, c.stats.force.strength);
  }
  runPower(dt, T) {
    const c = this.c, I = c.intent, p = this.power;
    p.t += dt;
    const tp = (p.target && !p.target.removed ? p.target : T).position();
    I.hasAim = true; I.aimX = tp.x; I.aimY = tp.y;
    I.power = p.name; I.powerHeld = p.dur > 0.2;
    if (p.name === 'lift') { I.aimY = tp.y - 1.5 - p.t; }
    if (p.t >= p.dur) {
      if (p.name === 'lift') { I.aimX = tp.x + c.facing * 6; I.aimY = tp.y - 3; }
      this.endPower();
    }
  }
  endPower() {
    const I = this.c.intent;
    I.powerHeld = false; I.power = null;
    GP.Force.release(this.c);
    this.power = null;
  }
};
