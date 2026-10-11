/* GALACTIC PLAYGROUND — modular humanoid characters.
 *
 * A character is 13 rigid body sections (head, torso, 2x upper arm/forearm/hand, 2x thigh/shin/foot)
 * connected by limited pin joints with motors. There are no canned animations:
 *   - A pose generator produces target joint angles (stand, walk, run, crouch, aim, swing, sit...).
 *   - Joint motors drive the limbs toward those targets with strength scaled by health and consciousness.
 *   - A balance controller applies an upright torque and a leg-supported lift to the torso while the
 *     character is conscious and its legs work. Impacts, explosions and the Force switch this off
 *     (stun), leaving a pure ragdoll until the character recovers and gets back up.
 * Each section has its own health; losing sections disables limbs, drops weapons, or kills.
 * Characters read an `intent` object written by either the AI brain or the player controller.
 */
'use strict';

(() => {
  const Phys = GP.Phys, M = GP.M, CAT = Phys.CAT;

  const BASE_TORQUE = { head: 45, torso: 0, upperArm: 150, forearm: 95, hand: 28, thigh: 320, shin: 270, foot: 70 };
  const BASE_HP = { head: 55, torso: 120, upperArm: 50, forearm: 45, hand: 30, thigh: 65, shin: 55, foot: 30 };

  // Build a skeleton (meters, feet at y=0, up = -y) from proportions.
  function skeleton(P) {
    const p = Object.assign({
      headR: 0.125, torsoW: 0.30, torsoH: 0.56, upperArm: 0.31, forearm: 0.27, hand: 0.10,
      armW: 0.105, foreW: 0.095, handW: 0.085, thigh: 0.45, shin: 0.43, footH: 0.08, footL: 0.25,
      thighW: 0.145, shinW: 0.12, neck: 0.03,
    }, P || {});
    const ankleY = -p.footH;
    const kneeY = ankleY - p.shin;
    const hipY = kneeY - p.thigh;
    const torsoBottom = hipY + 0.05;
    const torsoTop = torsoBottom - p.torsoH;
    const torsoC = (torsoBottom + torsoTop) / 2;
    const shoulderY = torsoTop + 0.07;
    const elbowY = shoulderY + p.upperArm - 0.01;
    const wristY = elbowY + p.forearm - 0.01;
    const neckY = torsoTop + 0.02;
    const headC = torsoTop - p.headR * 0.9 - p.neck;
    const parts = [];
    const add = (name, kind, side, shape, y, parent, jy, lim, z) => parts.push({ name, kind, side, shape, x: 0, y, parent, jy, lim, z });
    add('torso', 'torso', null, { box: [p.torsoW, p.torsoH] }, torsoC, null, 0, null, 6);
    add('head', 'head', null, { circle: p.headR }, headC, 'torso', neckY, [-0.55, 0.5], 10);
    for (const side of ['B', 'F']) {
      const zArm = side === 'B' ? 0 : 11, zLeg = side === 'B' ? 3 : 7;
      add('upperArm' + side, 'upperArm', side, { box: [p.armW, p.upperArm] }, shoulderY + p.upperArm / 2, 'torso', shoulderY, null, zArm);
      add('forearm' + side, 'forearm', side, { box: [p.foreW, p.forearm] }, elbowY + p.forearm / 2, 'upperArm' + side, elbowY, [-2.6, 0.05], zArm + 1);
      add('hand' + side, 'hand', side, { box: [p.handW, p.hand] }, wristY + p.hand / 2, 'forearm' + side, wristY, [-0.9, 0.9], zArm + 2);
      add('thigh' + side, 'thigh', side, { box: [p.thighW, p.thigh] }, hipY + p.thigh / 2, 'torso', hipY, [-2.1, 0.75], zLeg);
      add('shin' + side, 'shin', side, { box: [p.shinW, p.shin] }, kneeY + p.shin / 2, 'thigh' + side, kneeY, [-0.05, 2.5], zLeg + 1);
      add('foot' + side, 'foot', side, { box: [p.footL, p.footH] }, ankleY + p.footH / 2, 'shin' + side, ankleY, [-0.7, 0.7], zLeg + 2);
    }
    return { parts, p, hipY, shoulderY, torsoC, torsoH: p.torsoH, torsoW: p.torsoW, height: -(headC - p.headR) };
  }
  GP.skeleton = skeleton;

  const DEFAULT_ARMOR = { cut: 1, blaster: 1, impact: 1, explosive: 1, electric: 1, ion: 0.15, fire: 1, crush: 1 };

  class Character extends GP.Entity {
    constructor(game, def, opts = {}) {
      super(game, def, opts);
      const st = def.stats || {};
      this.stats = {
        health: st.health || 1, speed: st.speed || 1, jump: st.jump || 1, strength: st.strength || 1,
        skill: st.skill != null ? st.skill : 0.4, agility: st.agility || 1,
        armor: Object.assign({}, DEFAULT_ARMOR, st.armor || {}),
        force: st.force ? Object.assign({ strength: 1, range: 1, powers: ['push', 'pull'] }, st.force) : null,
        painless: !!def.mech || !!st.painless,
        knockResist: st.knockResist || 1,
      };
      this.isCharacterLike = true;
      this.mech = !!def.mech;
      this.material = def.material || (this.mech ? 'droid' : 'flesh');
      this.look = def.look || {};
      this.scale = opts.scale || def.scale || 1;
      this.parts = {};
      this.partList = [];
      this.group = game.nextGroup();
      this.state = 'alive';
      this.stun = 0; this.muscle = 1; this.balance = 1; this.fallTimer = 0;
      this.knock = 0;
      this.grounded = false; this.groundY = 0; this.groundDist = 99; this.airT = 0;
      this.walkPhase = 0; this.jumpCD = 0; this.flipT = 0;
      this.attack = null; this.attackCD = 0; this.attackIndex = 0;
      this.t = Math.random() * 10;
      this.equipment = { handF: null, handB: null, back: null };
      this.intent = this.blankIntent();
      this.playerControlled = false;
      this.vehicle = null; this.seat = null; this.hidden = false;
      this.aiMode = opts.aiMode || (def.ai && def.ai.mode) || 'aggressive';
      this.brain = def.ai === false ? null : new GP.Brain(this);
      this.powerIndex = 0;
      this.guard = 0;
      this.deathT = 0;
      this.cape = null;
      this.electrified = 0;
      this.forceHeld = 0;
      this.unconscious = 0;
      this.buffs = []; this.painT = 0; this.buffSpeed = 1; this.blood = 1;
    }

    blankIntent() {
      return { moveX: 0, run: false, jump: false, crouch: false, aimX: 0, aimY: 0, hasAim: false, attack: false, block: false,
        power: null, powerHeld: false, interact: false, drop: false, reload: false, toggleSaber: false, throwItem: false };
    }

    /* ------------------------------------------------ building */
    build(x, y, opts = {}) {
      const def = this.def, s = this.scale;
      this.facing = opts.facing || this.facing || 1;
      const sk = skeleton(def.build);
      this.sk = sk;
      const density = (def.density || 120) * (this.mech ? 0.8 : 1);
      const f = this.facing;
      for (const pd of sk.parts) {
        const b = new Phys.Body({ x: x + pd.x * s * f, y: y + pd.y * s, angularDamping: 0.25, linearDamping: 0.05 });
        const shapeOpts = { density: density * (pd.kind === 'torso' ? 1.1 : 1), friction: pd.kind === 'foot' ? 1.1 : 0.7, restitution: 0.05, category: CAT.CHAR, mask: CAT.ALL & ~CAT.SENSOR, group: this.group };
        let sh;
        if (pd.shape.circle) sh = Phys.circle(pd.shape.circle * s, 0, 0, shapeOpts);
        else sh = Phys.box(pd.shape.box[0] * s, pd.shape.box[1] * s, 0, 0, 0, shapeOpts);
        b.addShape(sh);
        b.finalize();
        const hpMul = this.stats.health * (def.partHp && def.partHp[pd.kind] || 1);
        b.part = { name: pd.name, kind: pd.kind, side: pd.side, hp: BASE_HP[pd.kind] * hpMul, maxHp: BASE_HP[pd.kind] * hpMul, severed: false, func: 1, z: pd.z, def: pd, w: (pd.shape.box ? pd.shape.box[0] : pd.shape.circle * 2) * s, h: (pd.shape.box ? pd.shape.box[1] : pd.shape.circle * 2) * s, burn: 0 };
        b.allowSleep = false;
        this.addBody(b);
        this.parts[pd.name] = b;
        this.partList.push(b);
      }
      for (const pd of sk.parts) {
        if (!pd.parent) continue;
        const a = this.parts[pd.parent], b = this.parts[pd.name];
        const j = new Phys.RevoluteJoint(a, b, x, y + pd.jy * s, { enableLimit: !!pd.lim, enableMotor: true, maxMotorTorque: 10, tag: 'ragdoll' });
        j.data = { lim: pd.lim, child: pd.name, kind: pd.kind, target: null };
        this.applyLimits(j);
        this.addJoint(j);
        b.part.joint = j;
      }
      this.drawOrder = this.partList.slice().sort((a, b) => a.part.z - b.part.z);
      this.hipLocal = this.parts.torso.toLocal(x, y + sk.hipY * s);
      this.standH = -sk.hipY * s;
      this.totalM = this.totalMass();
      if (this.look.cape && GP.Settings.g.capes) this.initCape();
      // starting equipment
      if (!opts.noLoadout && def.loadout) {
        for (const slot of ['handF', 'handB', 'back']) {
          const id = def.loadout[slot];
          if (!id) continue;
          const item = this.game.spawn(id, x, y - 1, { silent: true, noUndo: true });
          if (item) this.equip(item, slot);
        }
        // sabers start switched off: fighters ignite them when they need them
        if (def.loadout.ignite) this.forEachSaber((sb) => sb.setActive(true, true));
      }
      return this;
    }

    applyLimits(j) {
      const lim = j.data.lim;
      if (!lim) { j.enableLimit = false; return; }
      if (this.facing > 0) { j.lower = lim[0]; j.upper = lim[1]; }
      else { j.lower = -lim[1]; j.upper = -lim[0]; }
    }

    initCape() {
      const n = 7, len = (this.look.capeLen || 1.05) * this.scale;
      const t = this.parts.torso;
      const a = this.capeAnchor();
      this.cape = { pts: [], seg: len / (n - 1), color: this.look.cape };
      for (let i = 0; i < n; i++) this.cape.pts.push({ x: a.x, y: a.y + i * this.cape.seg, px: a.x, py: a.y + i * this.cape.seg });
      void t;
    }
    capeAnchor() {
      const t = this.parts.torso;
      return t.toWorld(-this.sk.torsoW * 0.35 * this.scale * this.facing, -this.sk.torsoH * 0.42 * this.scale);
    }
    updateCape(dt) {
      if (!this.cape || dt <= 0) return;
      const pts = this.cape.pts, a = this.capeAnchor();
      const g = this.game.world.gravityY * 0.6, wind = (this.game.map && this.game.map.wind || 0);
      pts[0].x = a.x; pts[0].y = a.y;
      for (let i = 1; i < pts.length; i++) {
        const p = pts[i];
        const vx = (p.x - p.px) * 0.96, vy = (p.y - p.py) * 0.96;
        p.px = p.x; p.py = p.y;
        p.x += vx + (wind - this.facing * 0.4) * dt * dt * 10; p.y += vy + g * dt * dt;
      }
      for (let it = 0; it < 3; it++) {
        for (let i = 1; i < pts.length; i++) {
          const p0 = pts[i - 1], p1 = pts[i];
          const dx = p1.x - p0.x, dy = p1.y - p0.y, d = Math.hypot(dx, dy) || 1e-6;
          const diff = (d - this.cape.seg) / d;
          if (i === 1) { p1.x -= dx * diff; p1.y -= dy * diff; }
          else { p0.x += dx * diff * 0.5; p0.y += dy * diff * 0.5; p1.x -= dx * diff * 0.5; p1.y -= dy * diff * 0.5; }
        }
        pts[0].x = a.x; pts[0].y = a.y;
      }
    }

    /* ------------------------------------------------ queries */
    get torso() { return this.parts.torso; }
    position() { const t = this.parts.torso; return { x: t.x, y: t.y }; }
    isAlive() { return this.state === 'alive' && !this.removed; }
    isDead() { return this.state === 'dead'; }
    head() { return this.parts.head; }
    handBody(slot) { return this.parts[slot === 'handB' ? 'handB' : 'handF']; }
    shoulder(side) {
      const u = this.parts['upperArm' + side];
      if (u.part.joint) return u.part.joint.anchorA();
      return this.parts.torso.toWorld(0, (-this.sk.torsoH / 2 + 0.07) * this.scale);
    }
    healthFraction() {
      let h = 0, m = 0;
      for (const b of this.partList) { h += b.part.severed ? 0 : Math.max(0, b.part.hp); m += b.part.maxHp; }
      return m ? h / m : 0;
    }
    armFunc(side) {
      const u = this.parts['upperArm' + side].part, f = this.parts['forearm' + side].part, h = this.parts['hand' + side].part;
      return Math.min(u.func, f.func, h.func * 0.5 + 0.5 * (h.severed ? 0 : 1));
    }
    legFunc() {
      let m = 1;
      for (const s of ['B', 'F']) {
        const t = this.parts['thigh' + s].part, sh = this.parts['shin' + s].part, ft = this.parts['foot' + s].part;
        m = Math.min(m, t.func, sh.func, ft.severed ? 0.5 : 1);
      }
      return m;
    }
    items() { return [this.equipment.handF, this.equipment.handB, this.equipment.back].filter(Boolean); }
    mainItem() { return this.equipment.handF || this.equipment.handB; }
    forEachSaber(fn) { for (const it of this.items()) if (it.isSaber) fn(it); }
    hasSaber() { return this.items().some((i) => i.isSaber); }
    hasBlaster() { return this.items().some((i) => i.isBlaster); }
    isForceUser() { return !!this.stats.force; }
    jetpack() { const b = this.equipment.back; return b && b.isJetpack ? b : null; }
    ownsBody(b) { return b && b.entity === this; }
    isHostileTo(other) { return GP.Teams.hostile(this.team, other.team); }

    /* ------------------------------------------------ update */
    update(dt) {
      this.t += dt;
      this.age += dt;
      if (this.hidden) {
        if (this.vehicle && this.intent.interact) { this.intent.interact = false; this.vehicle.exit(this); }
        return;
      }
      this.updateFunctionality();
      this.updateCape(dt);
      this.updateBuffs(dt);
      if (this.painT > 0) this.painT -= dt;
      if (GP.Settings.play.autoHealWounds && this.state === 'alive') for (const b of this.partList) if (!b.part.severed && b.part.hp < b.part.maxHp) b.part.hp = Math.min(b.part.maxHp, b.part.hp + dt * 2.5);
      if (GP.Gore) GP.Gore.update(this, dt);
      if (GP.Injury) GP.Injury.update(this, dt);
      if (this.state === 'dead') { this.updateDead(dt); return; }
      if (!this.playerControlled && this.brain && GP.aiEnabled() && this.aiMode !== 'off' && !this.vehicle) {
        this.brain.update(dt);
      } else if (!this.playerControlled && !this.vehicle) {
        const keepAim = this.intent; this.intent = this.blankIntent();
        if (this.aiMode === 'off' && keepAim.hasAim) { this.intent.aimX = keepAim.aimX; this.intent.aimY = keepAim.aimY; }
      }
      this.sense(dt);
      this.updateWater(dt);
      this.updateState(dt);
      if (!this.vehicle) this.updateFacing(dt);
      this.updatePose(dt);
      this.applyMotors(dt);
      if (!this.vehicle) this.applyBalance(dt);
      else if (this.vehicle.isSeat && !this.vehicle.def.pilotSeat && this.state === 'alive' && this.stun <= 0 && !this.unconscious) {
        // a sitter braces with their feet and keeps the furniture from tipping (but a real shove still wins)
        const sb = this.vehicle.body, a = M.wrapAngle(sb.a);
        if (Math.abs(a) < 0.6) sb.applyTorque(-M.clamp((sb.m + 80) * (30 * a + 6 * sb.w), -2500, 2500));
      }
      this.updateActions(dt);
      this.updateEffects(dt);
      this.knock = 0;
    }

    updateFunctionality() {
      for (const b of this.partList) {
        const p = b.part;
        p.func = p.severed ? 0 : M.clamp(p.hp / p.maxHp * 1.7, 0, 1);
        if (GP.Injury && !this.mech) p.func *= GP.Injury.limbFactor(p);   // nerve damage, numbness
        if (p.fractured) p.func = Math.min(p.func, 0.15);
      }
      if (this.state !== 'alive') return;
      const head = this.parts.head.part, torso = this.parts.torso.part;
      if (head.hp <= 0 || head.severed || torso.hp <= 0 || this.healthFraction() < 0.14) this.die();
      for (const side of ['F', 'B']) {
        const slot = 'hand' + side;
        if (this.equipment[slot] && this.armFunc(side) < 0.3) this.unequip(slot);
      }
    }

    sense(dt) {
      const t = this.parts.torso;
      const hip = t.toWorld(this.hipLocal.x, this.hipLocal.y);
      const len = this.standH * 1.4;
      const w = this.game.world;
      const self = this;
      const filter = (s) => !s.sensor && s.body.entity !== self && s.category !== CAT.DEBRIS && s.tag !== 'blade' && !(s.body.entity && s.body.entity.holder === self) && s.category !== CAT.SHIELD;
      let best = null;
      for (const ox of [-0.12, 0, 0.12]) {
        const hit = w.raycast(hip.x + ox * this.scale, hip.y, hip.x + ox * this.scale, hip.y + len, filter);
        if (hit && hit.ny < -0.45 && (!best || hit.t < best.t)) best = hit;
      }
      if (best) {
        this.groundDist = best.t * len; this.groundY = best.y; this.groundBody = best.body;
        this.grounded = this.groundDist < this.standH * 1.2;
      } else { this.groundDist = 99; this.grounded = false; this.groundBody = null; }
      if (this.grounded) this.airT = 0; else this.airT += dt;
      this.hip = hip;
    }

    updateState(dt) {
      if (this.jumpCD > 0) this.jumpCD -= dt;
      if (this.attackCD > 0) this.attackCD -= dt;
      if (this.flipT > 0) { this.flipT -= dt; if (this.flipT <= 0) for (const j of this.joints) if (j.data && j.data.lim) j.enableLimit = true; }
      if (this.knock > 0) this.handleKnock(this.knock);
      if (this.electrified > 0) {
        this.electrified -= dt;
        this.stun = Math.max(this.stun, 0.2);
        if (Math.random() < 0.5) { const b = M.pick(this.partList); const b2 = M.pick(this.partList); GP.FX.arc(b.x, b.y, b2.x, b2.y, '#b0e0ff', 0.08, 0.02); }
      }
      let muscleT = 1, balanceT = this.legFunc() > 0.3 && !this.swimming ? 1 : 0;
      if (this.unconscious > 0) {
        this.unconscious -= dt;
        this.stun = Math.max(this.stun, 0.3);
        if (this.unconscious <= 0) GP.Events.emit('character:woke', { e: this });
      }
      if (this.stun > 0) { this.stun -= dt; muscleT = this.unconscious > 0 ? 0.03 : this.mech ? 0.25 : 0.14; balanceT = 0; }
      if (this.vehicle) balanceT = 0;
      this.muscle = M.approach(this.muscle, muscleT, dt * (muscleT > this.muscle ? 1.3 : 10));
      // getting back up is slow and clumsy, slower still when hurt
      const upRate = 0.6 * this.stats.agility * (0.4 + 0.6 * this.healthFraction());
      this.balance = M.approach(this.balance, balanceT, dt * (balanceT > this.balance ? upRate : 12));
      // once the torso leans past the point of recovery the character goes down
      const tilt = Math.abs(M.wrapAngle(this.parts.torso.a));
      if (this.balance > 0.35 && tilt > 0.75 && !this.vehicle) {
        this.fallTimer += dt;
        if (this.fallTimer > (this.balance < 0.95 ? 1.5 : 0.3)) { this.knockDown(1.2); this.fallTimer = 0; }
      } else this.fallTimer = 0;
    }

    /* ------------------------------------------------ water: breathing, drowning, swimming */
    // Instinct, not AI: whatever the AI setting, a conscious person in deep liquid struggles toward the
    // surface and treads water, holds their breath while their head is under, and when the air runs
    // out passes out (goes limp) and, if nobody pulls them out, drowns. Droids don't breathe.
    updateWater(dt) {
      this.swimming = false;
      if (this.state !== 'alive' || this.vehicle || this.frozenSolid) { this.headUnder = false; return; }
      const now = this.game.time;
      const top = (b) => (b.liquidAt != null && now - b.liquidAt < 0.3 ? b.liquidTop : b.waterSurf != null ? b.waterSurf : null);
      const h = this.parts.head, t = this.parts.torso;
      const ht = h.part.severed ? null : top(h), tt = top(t);
      const hr = (h.part.h || 0.25) * 0.5;
      // head under: liquid all around it (particle liquid), or below a still-water surface (zones)
      if (GP.Fluid && GP.Fluid.count() && !h.part.severed) this.headUnder = GP.Fluid.liquidNear(h.x, h.y - hr * 0.6, hr * 1.6) >= 4;
      else this.headUnder = !h.part.severed && h.waterSurf != null && h.waterSurf < h.y - hr * 0.3;
      // the liquid surface above the chest (null when the chest isn't in liquid)
      const surface = GP.Fluid && GP.Fluid.count() ? GP.Fluid.surfaceAbove(t.x, t.y) : t.waterSurf != null && t.waterSurf < t.y ? t.waterSurf : null;
      const inLiquid = surface != null;
      const breathes = !this.mech && !this.def.amphibious;
      const MAX = this.maxAir();
      if (this.air == null) this.air = MAX;
      const conscious = this.unconscious <= 0;
      if (this.headUnder && breathes) {
        this.air = Math.max(0, this.air - dt * (conscious ? 1.4 : 0.8));
        if (Math.random() < dt * (conscious ? 1.6 : 0.5)) this.bubble(h, 1);
        if (this.air <= 0) {
          if (conscious) { this.knockOut(8); this.bubble(h, 8); GP.Events.emit('character:drowning', { e: this }); }
          this.unconscious = Math.max(this.unconscious, 3);   // stays out while under
          this.drownT = (this.drownT || 0) + dt;
          if (this.drownT > 18) { this.bubble(h, 6); this.die(); GP.Events.emit('character:drowned', { e: this }); return; }
        }
      } else {
        this.air = Math.min(MAX, this.air + dt * 5);
        if (this.drownT) this.drownT = Math.max(0, this.drownT - dt * 3);
      }
      if (!inLiquid && tt == null && this.swimT) this.swimT = Math.max(0, this.swimT - dt * 2);   // rest once out of the liquid
      // swimming: only people (droids just sink and walk the bottom), awake, not dazed, and actually in
      // deep liquid (not standing in a puddle)
      if (this.mech || !inLiquid || !conscious || this.stun > 0 || (this.grounded && !this.headUnder)) return;
      this.swimming = true;
      // Treading water is tiring: after twenty seconds or so (less when hurt or panicking with the head
      // under) the strokes weaken and the swimmer starts to go under. Effort also fades as the air
      // runs out and with injured limbs.
      this.swimT = (this.swimT || 0) + dt * (this.headUnder ? 1.6 : 1);
      const tired = M.clamp(1 - (this.swimT - 12 * (this.stats.health || 1)) / 10, 0.05, 1);
      const limbs = Math.min(1, (this.armFunc('F') + this.armFunc('B')) * 0.35 + this.legFunc() * 0.5);
      const effort = (0.35 + 0.65 * Math.min(1, this.air / (MAX * 0.3))) * (0.3 + 0.7 * limbs) * (this.injStrength || 1) * tired;
      // tread water: keep the head just above the surface
      const err = h.y - (surface - 0.2 * this.scale);      // positive: head too low
      const g = this.game.world.gravityY;
      const up = M.clamp(g * 0.8 + err * 7 - t.vy * 4, 0, g * 1.5) * effort;
      const side = M.clamp((this.intent.moveX || 0) * 1.6 - t.vx, -2, 2) * 2.5 * effort;
      const m = this.totalM;
      t.applyForce(side * m * 0.7, -up * m * 0.75); h.applyForce(side * m * 0.3, -up * m * 0.25);
      // stay roughly upright, head up
      t.applyTorque(-M.clamp(M.wrapAngle(t.a) * 400 + t.w * 60, -600, 600) * this.scale * this.scale * effort);
      this.swimPhase = (this.swimPhase || 0) + dt * (this.headUnder ? 7 : 4.5);
    }
    maxAir() { return 22 * (this.def.lungs || 1) * (this.stats.health || 1); }
    bubble(b, n) {
      for (let i = 0; i < n; i++) GP.FX.spawn(GP.FX.K.GLOW, b.x + M.rand(-0.06, 0.06), b.y - 0.05, M.rand(-0.3, 0.3), -M.rand(0.8, 1.6), M.rand(0.6, 1.2), M.rand(0.025, 0.05), '#dff4ff', { size1: 0.07, alpha: 0.55 });
    }

    // `speed` is the closing speed (m/s) of the hardest hit this tick
    handleKnock(speed) {
      const thr = (this.mech ? 5 : 3) * this.stats.knockResist * Math.sqrt(this.scale);
      if (speed > thr) this.knockDown(M.clamp((speed - thr) * 0.5 + 0.8, 0.8, 5));
    }
    // Timed status effects (stims, toxins...). apply() now, revert() when time runs out or on death.
    addBuff(name, dur, apply, revert, color) {
      const ex = this.buffs.find((b) => b.name === name);
      if (ex) { ex.t = Math.max(ex.t, dur); return; }
      apply();
      this.buffs.push({ name, t: dur, revert, color });
    }
    updateBuffs(dt) {
      for (let i = this.buffs.length - 1; i >= 0; i--) {
        const b = this.buffs[i];
        b.t -= dt;
        if (b.t <= 0 || this.state === 'dead') { try { b.revert(); } catch (e) { console.warn(e); } this.buffs.splice(i, 1); }
      }
    }
    // Unconsciousness: limp ragdoll until the timer runs out (or someone wakes them)
    knockOut(sec = 10) {
      if (this.state !== 'alive') return;
      this.unconscious = Math.max(this.unconscious, sec);
      this.knockDown(sec);
      GP.Events.emit('character:knockedout', { e: this });
    }
    wakeUp() {
      this.unconscious = 0; this.stun = Math.min(this.stun, 0.4);
    }
    knockDown(sec) {
      if (this.state !== 'alive') return;
      this.stun = Math.max(this.stun, sec);
      this.attack = null;
      if (sec > 2.2 && Math.random() < 0.25 * (1 - this.stats.skill * 0.8)) { const it = this.equipment.handF; if (it && !it.isJetpack && !it.def.builtIn) this.unequip('handF'); }
    }

    updateFacing() {
      const I = this.intent;
      let want = this.facing;
      const t = this.parts.torso;
      if (I.hasAim && Math.abs(I.aimX - t.x) > 0.25) want = Math.sign(I.aimX - t.x);
      else if (Math.abs(I.moveX) > 0.1) want = Math.sign(I.moveX);
      if (want !== this.facing && this.balance > 0.6 && !this.attack) this.setFacing(want);
    }
    setFacing(f) {
      if (f === this.facing) return;
      this.facing = f;
      this.flipT = 0.3;
      for (const j of this.joints) if (j.data && j.data.lim) { this.applyLimits(j); j.enableLimit = false; }
      for (const slot of ['handF', 'handB', 'back']) {
        const it = this.equipment[slot];
        if (it) it.reattach();
      }
      if (this.cape) { const a = this.capeAnchor(); for (const p of this.cape.pts) { p.x += (a.x - this.cape.pts[0].x); p.px = p.x; } }
    }

    /* ------------------------------------------------ posing */
    setTarget(name, fsAngle) { // facing-space relative joint angle
      const b = this.parts[name]; if (!b || !b.part.joint) return;
      b.part.joint.data.target = fsAngle * this.facing;
    }
    setArmDir(side, phiFs, elbowFs, wristFs = 0, worldPhi = null) {
      // phiFs: direction in facing space (0 = forward, +PI/2 = down). elbow: facing-space bend (negative = bend forward).
      const phi = worldPhi != null ? worldPhi : (this.facing > 0 ? phiFs : Math.PI - phiFs);
      const up = this.parts['upperArm' + side];
      if (!up.part.joint) return;
      const t = this.parts.torso;
      up.part.joint.data.target = M.wrapAngle(phi - Math.PI / 2 - t.a);
      up.part.joint.data.abs = true;
      this.setTarget('forearm' + side, elbowFs);
      this.setTarget('hand' + side, wristFs);
    }
    aimPhi(side) {
      const I = this.intent;
      const sh = this.shoulder(side);
      return Math.atan2(I.aimY - sh.y, I.aimX - sh.x);
    }
    fsPhi(worldPhi) { return this.facing > 0 ? worldPhi : Math.PI - worldPhi; }

    updatePose(dt) {
      const I = this.intent;
      const t = this.parts.torso;
      const tiltFs = M.wrapAngle(t.a) * this.facing;
      const standing = this.balance > 0.2 && this.stun <= 0;
      let hipB = 0, hipF = 0, kneeB = 0.08, kneeF = 0.08;
      this.crouching = false;
      if (this.swimming) {
        // kick and stroke (arms below); faster and wilder with the head under
        const p = this.swimPhase || 0, amp = this.headUnder ? 0.7 : 0.45;
        hipF = -0.35 + Math.sin(p) * amp; hipB = -0.35 - Math.sin(p) * amp;
        kneeF = 0.5 + Math.max(0, Math.cos(p)) * 0.6; kneeB = 0.5 + Math.max(0, -Math.cos(p)) * 0.6;
      } else if (this.vehicle) {
        if (this.seat && this.seat.pose === 'stand') { hipB = 0.1; hipF = -0.25; kneeB = 0.15; kneeF = 0.3; }
        else { hipB = hipF = -1.45; kneeB = kneeF = 1.5; }
      } else if (!standing) {
        hipB = -0.2; hipF = -0.35; kneeB = 0.35; kneeF = 0.5;
      } else if (this.balance < 0.9) { // getting up
        hipB = hipF = -1.1; kneeB = kneeF = 1.8;
      } else if (this.grounded) {
        const vx = t.vx;
        const speed = Math.abs(vx);
        if (I.crouch) { this.crouching = true; hipB = -1.25; hipF = -0.95; kneeB = 2.0; kneeF = 1.8; }
        else if (speed > 0.25 || Math.abs(I.moveX) > 0.1) {
          const stride = 1.15 * this.scale;
          this.walkPhase += dt * (speed / stride) * Math.PI * 1.6 * Math.sign(vx * this.facing || 1);
          const run = speed > 3.2;
          const amp = run ? 0.95 : 0.6;
          const s = Math.sin(this.walkPhase), c = Math.cos(this.walkPhase);
          hipF = -s * amp - (run ? 0.2 : 0.05); hipB = s * amp - (run ? 0.2 : 0.05);
          kneeF = Math.max(0, c) * (run ? 1.6 : 1.0) + 0.1; kneeB = Math.max(0, -c) * (run ? 1.6 : 1.0) + 0.1;
        } else {
          this.walkPhase = 0;
          hipB = 0.05; hipF = -0.08; kneeB = 0.08; kneeF = 0.12;
        }
      } else { // airborne
        hipF = -0.7; hipB = -0.15; kneeF = 1.0; kneeB = 0.5;
        if (this.jetpack() && I.jump) { hipF = -0.2; hipB = 0.1; kneeF = 0.3; kneeB = 0.3; }
      }
      this.setTarget('thighF', hipF); this.setTarget('thighB', hipB);
      this.setTarget('shinF', kneeF); this.setTarget('shinB', kneeB);
      this.setTarget('footF', -(tiltFs + hipF + kneeF)); this.setTarget('footB', -(tiltFs + hipB + kneeB));
      // head: keep level, look toward aim
      let look = 0;
      if (I.hasAim) {
        const h = this.parts.head;
        look = M.clamp(this.fsPhi(Math.atan2(I.aimY - h.y, I.aimX - h.x)), -0.5, 0.5);
        if (look > Math.PI / 2) look = 0;
      }
      this.setTarget('head', M.clamp(-tiltFs + look * 0.6, -0.55, 0.5));
      this.poseArms(dt, standing);
    }

    poseArms(dt, standing) {
      const I = this.intent;
      const F = this.equipment.handF, B = this.equipment.handB;
      // instincts, with or without AI: swimming strokes, and flailing while on fire
      if (this.swimming && !this.attack) {
        const p = this.swimPhase || 0;
        if (!F) this.setArmDir('F', Math.PI * 0.5 + Math.sin(p) * 1.5, -0.4 - Math.max(0, Math.cos(p)) * 0.6, 0);
        if (!B) this.setArmDir('B', Math.PI * 0.5 + Math.sin(p + Math.PI) * 1.5, -0.4 - Math.max(0, -Math.cos(p)) * 0.6, 0);
        if (!F || !B) { if (F) this.poseItemArm('F', F, false, 0); if (B) this.poseItemArm('B', B, false, 0); return; }
      }
      if (this.onFire && !this.mech && this.state === 'alive' && this.stun <= 0 && !this.playerControlled && !this.attack) {
        const p = this.t * 11;
        if (!F) this.setArmDir('F', 0.3 + Math.sin(p) * 1.2, -0.6 + Math.sin(p * 1.7) * 0.5, 0);
        if (!B) this.setArmDir('B', 0.5 + Math.sin(p + 2) * 1.2, -0.7 + Math.sin(p * 1.3) * 0.5, 0);
        if (!F || !B) { if (F) this.poseItemArm('F', F, standing, 0); if (B) this.poseItemArm('B', B, standing, 0); return; }
      }
      const swing = Math.sin(this.walkPhase) * 0.35;
      // attack animation overrides
      if (this.attack) {
        const a = this.attack;
        a.t += dt;
        const u = a.t / a.dur;
        if (u >= 1) { this.attack = null; }
        else {
          const keys = a.keys;
          let k = 0;
          while (k < keys.length - 2 && u > keys[k + 1][0]) k++;
          const k0 = keys[k], k1 = keys[k + 1];
          const f = M.smooth(M.clamp((u - k0[0]) / (k1[0] - k0[0]), 0, 1));
          const aimOff = a.aimFs || 0;
          const phi = M.lerp(k0[1], k1[1], f) + aimOff;
          const elbow = M.lerp(k0[2], k1[2], f);
          this.setArmDir(a.side, phi, elbow, 0);
          a.fast = true;
          const other = a.side === 'F' ? 'B' : 'F';
          if (a.both) this.setArmDir(other, phi + 0.15, elbow - 0.2, 0);
          else this.poseIdleArm(other, this.equipment['hand' + other], standing, -swing);
          return;
        }
      }
      if (this.vehicle && this.seat && this.seat.pose === 'grip') {
        const g = this.vehicle.seatGripDir ? this.vehicle.seatGripDir(this) : 0.3;
        this.setArmDir('F', g, -0.4, 0); this.setArmDir('B', g + 0.1, -0.5, 0);
        if (!F && !B) return;
      }
      this.forceHeld = Math.max(0, this.forceHeld - dt);
      if (this.forceHeld > 0 && I.hasAim) {
        const phi = this.aimPhi('B');
        this.setArmDir('B', 0, -0.1, -0.3, phi);
        this.poseItemArm('F', F, standing, swing);
        return;
      }
      this.poseItemArm('F', F, standing, swing);
      if (F && F.twoHanded) {
        const phi = I.hasAim ? this.aimPhi('B') : null;
        if (phi != null && F.isBlaster) this.setArmDir('B', 0, -0.75, 0, phi + this.facing * 0.12);
        else this.setArmDir('B', 0.5, -0.9, 0);
      } else this.poseItemArm('B', B, standing, -swing);
    }

    poseItemArm(side, item, standing, swing) {
      const I = this.intent;
      if (!item) { this.poseIdleArm(side, null, standing, swing); return; }
      if (item.isBlaster) {
        if (I.hasAim && standing !== false) {
          const phi = this.aimPhi(side);
          this.setArmDir(side, 0, item.twoHanded ? -0.25 : 0, 0, phi);
        } else this.setArmDir(side, 1.1, -0.6, 0);
        return;
      }
      if (item.isSaber || item.isMelee) {
        const active = item.isSaber ? item.active : true;
        if (!active) { this.poseIdleArm(side, item, standing, swing); return; }
        let phi = side === 'F' ? 0.55 : 0.9;
        let elbow = side === 'F' ? -0.55 : -0.8;
        if (this.guardTarget) { // deflection stance toward incoming threat
          const g = this.guardTarget;
          const sh = this.shoulder(side);
          const wphi = Math.atan2(g.y - sh.y, g.x - sh.x);
          this.setArmDir(side, 0, -0.2, 0, wphi + this.facing * 0.5);
          return;
        }
        if (I.block) { phi = -0.2; elbow = -1.1; }
        if (I.hasAim && !I.block) {
          const aim = M.clamp(this.fsPhi(this.aimPhi(side)), -1, 1.2);
          phi = M.lerp(phi, aim, 0.35);
        }
        this.setArmDir(side, phi, elbow, 0);
        return;
      }
      if (item.isJetpack) { this.poseIdleArm(side, null, standing, swing); return; }
      // generic carried object (explosive, prop)
      if (I.hasAim && item.isThrowable) this.setArmDir(side, 0.9, -0.9, 0);
      else this.setArmDir(side, 1.2, -0.7, 0);
    }

    poseIdleArm(side, item, standing, swing) {
      if (!standing) { this.limpArm(side); return; }
      if (!this.grounded) { this.setArmDir(side, side === 'F' ? -0.4 : 0.2, -0.6, 0); return; }
      this.setArmDir(side, Math.PI / 2 - 0.08 + swing, -0.25, 0);
    }
    limpArm(side) {
      for (const n of ['upperArm', 'forearm', 'hand']) { const b = this.parts[n + side]; if (b.part.joint) b.part.joint.data.target = null; }
    }

    applyMotors() {
      const str = this.stats.strength * Math.pow(this.scale, 2.2) * (this.mech ? 1.1 : 1) * (this.injStrength || 1);
      const dead = this.state === 'dead';
      for (const b of this.partList) {
        const p = b.part, j = p.joint;
        if (!j || !j.world) continue;
        const base = BASE_TORQUE[p.kind];
        const tgt = j.data.target;
        if (dead || tgt == null || p.func <= 0) {
          j.motorSpeed = 0;
          j.maxMotorTorque = base * str * (dead ? 0.02 : 0.05);
          continue;
        }
        let cur = j.angle();
        const err = M.wrapAngle(tgt - cur);
        const fast = this.attack && p.side === this.attack.side ? 1 : 0;
        const gain = fast ? 22 : 14;
        const maxS = fast ? 26 : 13;
        j.motorSpeed = M.clamp(err * gain, -maxS, maxS);
        let mus = this.muscle;
        if (p.kind === 'thigh' || p.kind === 'shin' || p.kind === 'foot') mus *= Math.max(0.15, this.balance);
        j.maxMotorTorque = base * str * mus * (0.25 + 0.75 * p.func) * (fast ? 2.2 : 1);
        j.data.target = null;
      }
    }

    applyBalance(dt) {
      const t = this.parts.torso;
      const M_ = this.totalM;
      const bal = this.balance * Math.min(1, this.legFunc() * 1.3);
      const I = this.intent;
      if (bal <= 0.01) return;
      const massF = M_ / 75;
      // upright torque (lean a little into movement). Deliberately weak: a shove, a stumble or a
      // bad step can topple a character, and injuries make them sway.
      const lean = M.clamp(t.vx * 0.04, -0.15, 0.15) + (this.crouching ? this.facing * 0.25 : 0);
      const hurt = 1 - this.healthFraction();
      const sway = (Math.sin(this.t * 1.7) + Math.sin(this.t * 2.9 + 1.3) * 0.6) * (0.025 + hurt * 0.18 + (this.painT > 0 ? 0.05 : 0) + (this.inj ? this.inj.tremor * 0.1 : 0));
      const tilt = M.wrapAngle(t.a - lean - sway);
      // getting up is a deliberate effort; once upright, the balance is fragile
      const steady = Math.sqrt(this.stats.agility) * (this.balance < 0.95 ? 2 : 1);
      const kp = 700 * steady * massF * this.scale * this.scale, kd = 90 * steady * massF * this.scale * this.scale;
      const maxT = 1100 * steady * massF * (1 - hurt * 0.5);
      const tq = M.clamp(-(kp * tilt + kd * t.w), -maxT, maxT) * bal;
      t.applyTorque(tq);
      const g = this.game.world.gravityY;
      if (this.grounded) {
        const targetH = this.standH * (this.crouching ? 0.62 : this.balance < 0.9 ? 0.75 : 0.985);
        const targetY = this.groundY - targetH;
        const err = targetY - this.hip.y;
        const w0 = 11;
        let fy = M_ * (-g * 0.94 + w0 * w0 * err - 2 * 0.9 * w0 * t.vy);
        fy = M.clamp(fy, -M_ * Math.max(g, 9.8) * 3.2, 0) * bal;
        t.applyForce(0, fy);
        // locomotion
        const spd = 2.3 * this.stats.speed * (this.coldFactor || 1) * (this.buffSpeed || 1) * Math.sqrt(this.scale) * (I.run ? 1.95 : 1) * (this.crouching ? 0.45 : 1) * Math.max(0.3, this.legFunc());
        const want = I.moveX * spd;
        const baseV = this.groundBody ? this.groundBody.vx : 0;
        const slip = want + baseV - t.vx;
        const acc = M.clamp(slip * 9, -10, 10);
        t.applyForce(M_ * acc * bal, 0);
        // shoved faster than the feet can keep up with: lose footing
        if (Math.abs(slip) > 2.6 * this.stats.knockResist * Math.sqrt(this.scale) + Math.abs(want) * 0.5 && this.balance > 0.9) this.knockDown(M.clamp(Math.abs(slip) * 0.4, 0.8, 3));
        // jump
        if (I.jump && this.jumpCD <= 0 && this.balance > 0.85) {
          const v = 5.4 * this.stats.jump * Math.sqrt(this.scale) * (this.crouching ? 1.2 : 1);
          for (const b of this.partList) if (!b.part.severed) { b.vy = Math.min(b.vy, 0) - v; b.vx += I.moveX * 1.2; }
          this.jumpCD = 0.45;
          GP.Audio.play('jump', { x: t.x, y: t.y });
          if (this.mech) GP.Audio.play('servo', { x: t.x, y: t.y });
        }
      } else {
        // air control
        const want = I.moveX * 2.5 * this.stats.speed;
        const acc = M.clamp((want - t.vx) * 2, -4, 4);
        t.applyForce(M_ * acc * bal, 0);
        const jp = this.jetpack();
        if (jp && I.jump) jp.thrust(this, dt);
      }
      if (this.jetpack() && I.jump && this.grounded && this.jumpCD > 0.2) { /* launching */ }
    }

    /* ------------------------------------------------ actions */
    updateActions(dt) {
      const I = this.intent;
      const t = this.parts.torso;
      const F = this.equipment.handF, B = this.equipment.handB;
      // a pilot seat routes the trigger to the machine it drives, not the rider's hands
      const able = this.stun <= 0 && this.state === 'alive' && !(this.vehicle && this.vehicle.def && this.vehicle.def.pilotSeat);
      // sabers: guard assist radius for deflection
      this.forEachSaber((s) => { s.guardAssist = able && (I.block || (this.brain && this.brain.guarding && !this.playerControlled)) ? 0.22 + this.stats.skill * 0.25 : 0; });
      for (const it of [F, B]) {
        if (!it) continue;
        if (it.isBlaster) {
          let ok = able && I.attack && I.hasAim;
          if (ok && !this.playerControlled) {
            const f = it.forward(), dx = I.aimX - it.body.x, dy = I.aimY - it.body.y, l = Math.hypot(dx, dy) || 1;
            ok = (f.x * dx + f.y * dy) / l > 0.93;
          }
          it.trigger(ok, this);
          if (I.reload) it.startReload();
        }
      }
      if (able && I.attack && !this.attack && this.attackCD <= 0) {
        const melee = (F && (F.isSaber || F.isMelee)) ? F : (B && (B.isSaber || B.isMelee)) ? B : null;
        if (melee) this.startSwing(melee === F ? 'F' : 'B', melee);
        else if (F && F.isThrowable) { this.throwHeld('handF', 12); }
        else if (!F && !B) this.startPunch();
      }
      if (I.toggleSaber) this.forEachSaber((s) => s.setActive(!s.active));
      if (able && I.attack && F && F.isInjector && !F.used) F.inject(this);
      if (I.interact) this.interact();
      if (I.drop) this.dropOrThrow();
      // Force powers
      if (able && this.stats.force && I.power) {
        const ok = GP.Force.characterCast(this, I.power, I.aimX, I.aimY, I.powerHeld, dt);
        if (ok) this.forceHeld = 0.35;
      }
      I.interact = false; I.drop = false; I.reload = false; I.toggleSaber = false;
      if (!I.powerHeld) I.power = null;
    }

    startSwing(side, item) {
      const skill = this.stats.skill;
      const kinds = item.isSaber && item.def.blades && item.def.blades.length > 1 ? ['spin', 'slash', 'upper'] : ['slash', 'upper', 'slash', 'thrust'];
      const kind = kinds[this.attackIndex++ % kinds.length];
      const K = {
        slash: [[0, 0.55, -0.5], [0.32, -2.1, -0.9], [0.6, 1.25, -0.1], [1, 0.55, -0.5]],
        upper: [[0, 0.55, -0.5], [0.3, 1.4, -0.3], [0.6, -1.7, -0.25], [1, 0.55, -0.5]],
        thrust: [[0, 0.5, -0.5], [0.35, 0.25, -2.0], [0.6, 0.05, 0], [1, 0.5, -0.5]],
        spin: [[0, 0.5, -0.4], [0.25, -1.6, -0.3], [0.55, 1.6, -0.2], [0.8, -1.2, -0.3], [1, 0.5, -0.4]],
      };
      let aimFs = 0;
      if (this.intent.hasAim) {
        const t = this.parts.torso;
        const d = this.fsPhi(Math.atan2(this.intent.aimY - t.y, this.intent.aimX - t.x));
        aimFs = M.clamp(d > Math.PI / 2 ? 0 : d, -0.6, 0.6) * 0.4;
      }
      const both = !!(item.twoHanded && !this.equipment['hand' + (side === 'F' ? 'B' : 'F')]);
      this.attack = { side, t: 0, dur: (0.62 - skill * 0.2) * (item.def.swingTime || 1), keys: K[kind], kind, aimFs, both };
      this.attackCD = 0.08;
      // step into the swing
      if (this.grounded && this.balance > 0.8) this.parts.torso.applyImpulse(this.facing * this.totalM * 1.8, 0);
      if (this.mech) GP.Audio.play('servo', { x: this.parts.torso.x, y: this.parts.torso.y });
    }
    startPunch() {
      const side = this.parts.handF.part.severed ? 'B' : 'F';
      let aimFs = 0;
      if (this.intent.hasAim) { const d = this.fsPhi(this.aimPhi(side)); aimFs = M.clamp(d > Math.PI / 2 ? 0 : d, -0.8, 0.8); }
      this.attack = { side, t: 0, dur: 0.38, kind: 'punch', aimFs: 0, keys: [[0, 1.2, -0.3], [0.3, aimFs + 0.2, -2.3], [0.55, aimFs, 0], [1, 1.2, -0.3]], punch: true };
      this.attackCD = 0.25;
    }

    interact() {
      if (this.vehicle) { this.vehicle.exit(this); return; }
      const t = this.parts.torso;
      // vehicles first
      let best = null, bd = 2.6 * this.scale;
      for (const e of this.game.entities) {
        if (e === this || e.removed) continue;
        if ((e.isVehicle || e.isSeat) && e.hasFreeSeat && e.hasFreeSeat()) {
          const d = e.distanceTo(t.x, t.y);
          if (d < bd) { bd = d; best = e; }
        }
      }
      if (best) { best.enter(this); return; }
      // pick up nearest item
      const item = this.findItemNear(1.5);
      if (item && item.isJetpack) { this.equip(item, 'back'); return; }
      if (item) {
        const slot = !this.equipment.handF && this.armFunc('F') > 0.3 ? 'handF' : !this.equipment.handB && this.armFunc('B') > 0.3 ? 'handB' : null;
        if (slot) { this.equip(item, slot); if (item.isSaber && !item.active) item.setActive(true); }
        else { this.unequip('handF'); this.equip(item, 'handF'); }
        return;
      }
      // activate a nearby usable object
      const near = this.game.world.queryNearest(t.x, t.y, 1.2, (s) => s.body.entity && s.body.entity !== this && s.body.entity.use && !(s.body.entity instanceof Character));
      if (near) near.body.entity.use(this);
    }
    findItemNear(r) {
      const self = this;
      let best = null, bd = r * this.scale;
      const pts = [this.parts.handF, this.parts.handB, this.parts.torso];
      for (const e of this.game.entities) {
        if (!e.isItem || e.holder || e.removed || e.isJetpack && this.equipment.back) continue;
        const b = e.body;
        for (const p of pts) {
          const d = Math.hypot(b.x - p.x, b.y - p.y);
          if (d < bd) { bd = d; best = e; }
        }
      }
      void self;
      return best;
    }
    dropOrThrow() {
      const slot = this.equipment.handF ? 'handF' : this.equipment.handB ? 'handB' : null;
      if (!slot) return;
      const it = this.equipment[slot];
      if (it.isSaber && this.stats.force && it.active) { GP.Force.saberThrow(this, it, this.intent.aimX, this.intent.aimY); return; }
      this.throwHeld(slot, this.intent.hasAim ? 9 : 2);
    }
    throwHeld(slot, speed) {
      const it = this.equipment[slot];
      if (!it) return;
      const I = this.intent;
      if (it.isThrowable && it.arm && !it.armed) it.arm();
      this.unequip(slot);
      if (I.hasAim && speed > 3) {
        const b = it.body;
        const dx = I.aimX - b.x, dy = I.aimY - b.y, l = Math.hypot(dx, dy) || 1;
        if (it.def.sharp) {
          // throw point-first: aim the blade along the flight path, no spin
          const sp = speed * 1.8;
          b.setAngle(Math.atan2(dy, dx)); b.updateShapes();
          b.vx = dx / l * sp + this.parts.torso.vx; b.vy = dy / l * sp - 1 + this.parts.torso.vy; b.w = 0;
        } else { b.vx = dx / l * speed + this.parts.torso.vx; b.vy = dy / l * speed - 2 + this.parts.torso.vy; b.w = M.rand(-8, 8); }
      }
    }

    equip(item, slot) {
      if (!item || item.removed || item.holder) return false;
      if (slot === 'back') {
        if (this.equipment.back) this.unequip('back');
      } else {
        const hand = this.parts[slot];
        if (!hand || hand.part.severed || hand.part.func < 0.3) return false;
        if (this.equipment[slot]) this.unequip(slot);
      }
      this.equipment[slot] = item;
      item.attach(this, slot);
      return true;
    }
    unequip(slot) {
      const it = this.equipment[slot];
      if (!it) return null;
      this.equipment[slot] = null;
      it.detach();
      return it;
    }
    onItemLost(item) { for (const k of Object.keys(this.equipment)) if (this.equipment[k] === item) this.equipment[k] = null; }

    updateEffects(dt) {
      const t = this.parts.torso;
      if (this.mech) {
        const hp = this.healthFraction();
        if (hp < 0.6 && Math.random() < (0.6 - hp) * dt * 8) {
          const b = M.pick(this.partList);
          GP.FX.sparks(b.x, b.y, 0, -1, 6, '#ffe08a', 3);
          if (Math.random() < 0.3) GP.Audio.play('zap', { x: b.x, y: b.y, vol: 0.15 });
        }
        if (hp < 0.4 && Math.random() < dt * 3) GP.FX.smoke(t.x, t.y - 0.2, 1, 0.2, '#3a3a3a', -0.6);
        if (this.def.voice === 'b1' && Math.random() < dt * 0.02) GP.Audio.play('droidTalk', { x: t.x, y: t.y });
      }
    }

    updateDead(dt) {
      this.deathT += dt;
      this.applyMotors(dt);
      if (this.mech && this.deathT < 4 && Math.random() < dt * 4) {
        const b = M.pick(this.partList);
        GP.FX.sparks(b.x, b.y, 0, -1, 5, '#ffe08a', 3);
      }
      for (const b of this.partList) b.allowSleep = true;
      const clean = GP.Settings.play.corpseCleanup;
      if (clean > 0 && this.deathT > clean && !this.playerControlled) {
        for (const b of this.partList) GP.FX.smoke(b.x, b.y, 1, 0.3, '#555');
        this.game.removeEntity(this);
      }
    }

    die() {
      if (this.state === 'dead') return;
      this.state = 'dead';
      this.alive = false;
      this.stun = 0; this.balance = 0; this.muscle = 0; this.attack = null;
      if (GP.Settings.play.dropOnDeath !== false) for (const slot of ['handF', 'handB']) if (this.equipment[slot]) { const it = this.unequip(slot); if (it && it.isSaber) it.setActive(false); }
      else this.forEachSaber((s) => s.setActive(false));
      const t = this.parts.torso;
      if (this.mech) { GP.FX.sparks(t.x, t.y, 0, -1, 16, '#ffe08a', 5); GP.Audio.play('zap', { x: t.x, y: t.y }); }
      GP.Events.emit('character:died', { e: this });
      if (this.playerControlled) GP.Events.emit('control:lost', { e: this });
    }
    revive() {
      if (this.frozenSolid && GP.Heat) GP.Heat.thaw(this);
      for (const b of this.partList) b.temp = null;
      if (GP.Gore) GP.Gore.stopBleeding(this);
      if (GP.Injury) GP.Injury.heal(this);
      if (this.onFire && GP.Heat) GP.Heat.extinguish(this, false);
      for (const b of this.partList) { if (!b.part.severed) b.part.hp = b.part.maxHp; b.part.burn = 0; b.part.fractured = false; b.allowSleep = false; b.wake(); }
      this.state = 'alive'; this.alive = true; this.stun = 0.5; this.deathT = 0; this.electrified = 0; this.unconscious = 0;
    }
    heal() { this.revive(); }

    /* ------------------------------------------------ damage */
    nearestPart(x, y) {
      let best = this.parts.torso, bd = Infinity;
      for (const b of this.partList) { if (b.part.severed) continue; const d = Math.hypot(b.x - x, b.y - y); if (d < bd) { bd = d; best = b; } }
      return best;
    }
    // Impacts hurt by how hard the section actually hits something (closing speed), not by how
    // much its own velocity changed: a light foot landing on the floor is not a catastrophe, but a
    // body slammed into a wall or dropped from a few meters is. Light objects hit softer.
    onImpact(body, dv, c, other) {
      const p = body.part;
      if (!p || this.age < 0.6) return;
      const oe = other && other.entity;
      let speed = c.approachLin;
      const extremity = p.kind === 'foot' || p.kind === 'hand';
      if (extremity && other.type === Phys.STATIC) {
        // hands and feet are light and whipped around by their motors; judge the landing by how fast the body comes down
        const t = this.parts.torso, s = c.bA === body ? 1 : -1;
        speed = Math.min(speed, Math.max(0, (t.vx * c.nx + t.vy * c.ny) * s));
      }
      if (other.type === Phys.DYNAMIC) speed *= Math.min(1, 2 * other.m / (other.m + body.m));
      if (GP.Heat) speed *= GP.Heat.cushion(body, c.pts[0].y);
      // routine foot/leg contacts with the ground while walking and landing jumps
      const lower = p.kind === 'foot' || p.kind === 'shin' || p.kind === 'thigh';
      const walking = lower && other.type === Phys.STATIC && speed < 6;
      if (this.state === 'alive' && !walking && speed > this.knock) this.knock = speed * (p.kind === 'head' ? 1.4 : 1);
      // punches from other characters
      if (oe instanceof Character && oe !== this && oe.attack && oe.attack.punch && other.part && other.part.kind === 'hand') {
        this.damage({ type: 'impact', amount: 9 * oe.stats.strength, body, x: c.pts[0].x, y: c.pts[0].y, source: oe });
        this.knock = Math.max(this.knock, 2.5 + 1.2 * oe.stats.strength);
        return;
      }
      const thr = this.mech ? (lower ? 10 : 8) : (lower ? 7 : p.kind === 'head' ? 4.5 : 5);
      if (speed > thr) {
        let amt = (speed - thr) * (this.mech ? 9 : 13) * (GP.Settings.play.fragility || 1);
        if (oe && oe.def && oe.def.melee) amt += oe.def.melee.damage * Math.min(1, speed / 6);
        const src = oe && oe.holder ? oe.holder : oe;
        this.damage({ type: 'impact', amount: amt, body, x: c.pts[0].x, y: c.pts[0].y, source: src });
        // landing hard on the feet drives the blow up through the leg into the spine
        if (p.kind === 'foot' && other.type === Phys.STATIC && !this.mech) {
          for (const [n, k] of [['shin' + p.side, 0.8], ['thigh' + p.side, 0.6], ['torso', 0.5]]) {
            const b = this.parts[n];
            if (b && !b.part.severed) this.damage({ type: 'impact', amount: amt * k, body: b, x: b.x, y: b.y, source: src });
          }
        }
      } else if (oe && oe.def && oe.def.melee && speed > 2) {
        this.damage({ type: oe.def.melee.electric ? 'electric' : 'impact', amount: oe.def.melee.damage * Math.min(1, speed / 6), body, x: c.pts[0].x, y: c.pts[0].y, source: oe.holder || oe });
      }
    }

    damage(info) {
      if (this.removed) return 0;
      let body = info.body && info.body.entity === this ? info.body : this.nearestPart(info.x || 0, info.y || 0);
      const type = info.type;
      const armor = this.stats.armor[type] != null ? this.stats.armor[type] : 1;
      if (info.source && info.source !== this) {
        this.lastDamager = info.source;
        if (this.brain) this.brain.onDamaged(info.source);
      }
      let total = 0;
      if (info.fmap && (type === 'explosive' || type === 'ion')) {
        for (const [b, f] of info.fmap) {
          if (!b.part || b.entity !== this) continue;
          const amt = info.amount * f * 0.55 * armor * (b.part.kind === 'torso' ? 1.2 : 1);
          total += this.hurtPart(b, amt, type, info);
          if (f > 0.6 && this.allowDismember('explosive') && b.part.kind !== 'torso' && b.part.kind !== 'head' && b.part.hp <= 0) this.sever(b.part.name, info);
        }
        if (type === 'ion') { if (this.mech) { this.electrified = Math.max(this.electrified, 2.5 * info.f); this.knockDown(2.5 * info.f); } }
        else this.knockDown(0.6 + info.f * 2.8);
        return total;
      }
      let amt = info.amount * armor;
      if (type === 'blaster' && body.part.kind === 'head') amt *= 1.6;
      if (type === 'cut' && (body.part.kind === 'head' || body.part.kind === 'torso')) amt *= 0.55;
      if (type === 'ion') { amt = this.mech ? info.amount * 1.5 : info.amount * 0.1; if (this.mech) this.electrified = Math.max(this.electrified, 1.2); }
      if (type === 'electric') { this.electrified = Math.max(this.electrified, this.mech ? 0.8 : 0.4); }
      total = this.hurtPart(body, amt, type, info);
      if (type === 'blaster') {
        if (!this.stats.painless && amt > 12 && Math.random() < 0.5) this.stun = Math.max(this.stun, 0.25);
        if (amt > 45) this.knockDown(0.8);
        if (body.part.kind === 'head' && amt > 20) this.knockDown(1);
      }
      if (type === 'cut' && this.allowDismember('cut') && body.part.kind !== 'torso') {
        const k = body.part.kind;
        const mustSever = body.part.hp <= 0 || (k !== 'head' && (info.speed || 0) > 7.5 && body.part.hp < body.part.maxHp * 0.6);
        if (mustSever) this.sever(body.part.name, info);
      }
      if (type === 'impact' && this.mech && body.part.hp <= 0 && this.allowDismember('impact') && body.part.kind !== 'torso') this.sever(body.part.name, info);
      return total;
    }
    allowDismember(src) {
      const mode = GP.Settings.play.dismemberment;
      if (mode === 'off') return false;
      if (mode === 'all') return true;
      if (src === 'cut') return true;
      if (GP.Gore && GP.Gore.level() >= 3) return true; // high gore: blasts and crushes can tear limbs off too
      return this.mech; // droids come apart from explosions and blows even in 'saber' mode
    }
    hurtPart(body, amt, type, info) {
      const p = body.part;
      if (!p || amt <= 0) return 0;
      p.hp -= amt;
      if (amt > 4) this.painT = 0.7;
      if (GP.Gore) GP.Gore.onHurt(this, body, amt, type, info);
      if (type === 'blaster' || type === 'fire' || type === 'electric') p.burn = Math.min(1, p.burn + amt / 80);
      if ((type === 'blaster' || type === 'cut') && info.x != null) body.addDecal(type === 'cut' ? 'cut' : 'scorch', info.x, info.y, 0.035, '#ff8a30');
      if (this.mech && amt > 8) GP.FX.sparks(info.x != null ? info.x : body.x, info.y != null ? info.y : body.y, 0, -1, 4 + amt / 8, '#ffe08a', 4);
      if (this.state === 'alive' && (p.kind === 'head' || p.kind === 'torso') && p.hp <= 0) this.die();
      if (this.state === 'alive' && p.kind === 'head' && (type === 'impact' || type === 'crush') && amt > 14 && GP.Settings.play.knockouts && !this.mech) this.knockOut(Math.min(25, amt * 0.35));
      // a hard blow breaks limb bones: a broken leg can't hold the character up, a broken arm drops what it holds
      if (!this.mech && !p.fractured && !p.severed && p.kind !== 'head' && p.kind !== 'torso' && (type === 'impact' || type === 'crush' || type === 'explosive') && (amt > p.maxHp * 0.3 || p.hp < p.maxHp * 0.4)) {
        p.fractured = true;
        const x = info.x != null ? info.x : body.x, y = info.y != null ? info.y : body.y;
        GP.Audio.play('impact', { x, y, strength: 1, mat: 'wood' });
        GP.Events.emit('character:fracture', { e: this, part: p });
      }
      GP.Events.emit('character:hurt', { e: this, part: p, amount: amt, type });
      return amt;
    }

    // Detach a section (and everything beyond it) at its parent joint.
    sever(name, info) {
      const b = this.parts[name];
      if (!b || b.part.severed || !b.part.joint) return;
      const j = b.part.joint;
      const anchor = j.anchorA();
      this.removeJoint(j);
      b.part.joint = null;
      const mark = (n) => {
        const pb = this.parts[n];
        pb.part.severed = true;
        for (const pd of this.sk.parts) if (pd.parent === n) mark(pd.name);
      };
      mark(name);
      const parent = this.parts[b.part.def.parent];
      const glow = info && info.type === 'cut' ? (info.color || '#ff8a30') : null;
      if (glow || !this.mech) { b.addDecal('cut', anchor.x, anchor.y, 0.045 * this.scale, glow); parent.addDecal('cut', anchor.x, anchor.y, 0.05 * this.scale, glow); }
      if (this.mech) { GP.FX.sparks(anchor.x, anchor.y, 0, -1, 14, '#ffe08a', 5); GP.FX.smoke(anchor.x, anchor.y, 2, 0.15, '#333'); GP.Audio.play('zap', { x: anchor.x, y: anchor.y }); }
      else GP.FX.smoke(anchor.x, anchor.y, 2, 0.12, '#555', -0.5);
      // held items fall
      for (const side of ['F', 'B']) {
        const h = this.parts['hand' + side];
        if (h.part.severed && this.equipment['hand' + side]) { const it = this.unequip('hand' + side); if (it && it.isSaber) it.setActive(false); }
      }
      if (name === 'head') this.die();
      this.totalM = this.partList.filter((p) => !p.part.severed).reduce((a, p) => a + p.m, 0);
      if (GP.Gore) GP.Gore.onSever(this, b, parent, anchor, info);
      GP.Events.emit('character:severed', { e: this, part: name });
    }

    /* ------------------------------------------------ vehicles */
    hide() {
      if (this.hidden) return;
      this.hidden = true;
      for (const j of this.joints) if (j.world) this.game.world.removeJoint(j);
      for (const b of this.bodies) this.game.world.removeBody(b);
      for (const it of this.items()) it.hideWithHolder(true);
    }
    unhide(x, y, vx = 0, vy = 0) {
      if (!this.hidden) return;
      this.hidden = false;
      const t = this.parts.torso;
      const dx = x - t.x, dy = y - t.y;
      for (const b of this.bodies) {
        b.x += dx; b.y += dy; b.vx = vx; b.vy = vy; b.w = 0;
        b.contacts.length = 0; b.joints.length = 0;
        this.game.world.addBody(b);
      }
      for (const j of this.joints) this.game.world.addJoint(j);
      for (const it of this.items()) it.hideWithHolder(false);
      if (this.cape) this.initCape();
    }

    /* ------------------------------------------------ drawing */
    draw(ctx, dt) {
      if (this.hidden) return;
      const L = this.look;
      const itemsBack = [], itemsFront = [];
      if (this.equipment.handB) itemsBack.push(this.equipment.handB);
      if (this.equipment.back) itemsBack.push(this.equipment.back);
      if (this.equipment.handF) itemsFront.push(this.equipment.handF);
      // cape behind everything
      if (this.cape) this.drawCape(ctx);
      let drewBackItems = false;
      for (const b of this.drawOrder) {
        const p = b.part;
        if (!drewBackItems && p.z >= 6) { for (const it of itemsBack) it.drawHeld(ctx, dt); drewBackItems = true; }
        ctx.save();
        ctx.translate(b.x, b.y); ctx.rotate(b.a);
        ctx.save();
        ctx.scale(this.facing, 1);
        const back = p.side === 'B';
        if (p.kind === 'head') GP.Painter.head(ctx, L, p.w / 2, this.expression());
        else if (p.kind === 'torso') GP.Painter.torso(ctx, L, p.w, p.h, this);
        else GP.Painter.limb(ctx, L, p.kind, p.w, p.h, back);
        if (p.burn > 0.05) {
          ctx.globalAlpha = p.burn * 0.5; ctx.fillStyle = '#1a120c';
          if (p.kind === 'head') { ctx.beginPath(); ctx.arc(0, 0, p.w / 2, 0, 7); ctx.fill(); }
          else ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
          ctx.globalAlpha = 1;
        }
        ctx.restore();
        GP.Draw.decals(ctx, b, dt);
        ctx.restore();
      }
      if (!drewBackItems) for (const it of itemsBack) it.drawHeld(ctx, dt);
      for (const it of itemsFront) it.drawHeld(ctx, dt);
      if (this.electrified > 0) GP.Draw.glow(ctx, this.parts.torso.x, this.parts.torso.y, 1.2 * this.scale, '#7fc8ff', 0.3);
      for (const bf of this.buffs) if (bf.color) GP.Draw.glow(ctx, this.parts.torso.x, this.parts.torso.y, 1.1 * this.scale, bf.color, 0.18 + Math.sin(this.t * 6) * 0.06);
    }
    // Facial expression for painted faces: follows health, consciousness and combat state
    expression() {
      if (!GP.Settings.play.expressions) return 'neutral';
      if (this.state === 'dead') return 'dead';
      if (this.unconscious > 0 || this.frozenSolid) return 'sleep';
      if (this.painT > 0 || this.onFire) return 'pain';
      if (this.brain && (this.brain.fleeing || this.brain.panicT > 0) && !this.playerControlled) return 'fear';
      if (this.attack || (this.brain && this.brain.target && !this.playerControlled) || (this.playerControlled && this.intent.attack)) return 'angry';
      if (this.stun > 0) return 'dazed';
      return 'neutral';
    }
    drawCape(ctx) {
      const pts = this.cape.pts;
      // the cape is simulated at the latest tick; follow the torso to where it is being drawn
      const t = this.parts.torso;
      ctx.save();
      if (t.lerping) ctx.translate(t.x - t.cx, t.y - t.cy);
      const w0 = 0.12 * this.scale, w1 = 0.34 * this.scale;
      ctx.beginPath();
      const left = [], right = [];
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i], q = pts[Math.min(i + 1, pts.length - 1)], o = pts[Math.max(i - 1, 0)];
        let dx = q.x - o.x, dy = q.y - o.y; const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
        const w = M.lerp(w0, w1, i / (pts.length - 1));
        left.push(p.x - dy * w, p.y + dx * w); right.push(p.x + dy * w, p.y - dx * w);
      }
      ctx.moveTo(left[0], left[1]);
      for (let i = 2; i < left.length; i += 2) ctx.lineTo(left[i], left[i + 1]);
      for (let i = right.length - 2; i >= 0; i -= 2) ctx.lineTo(right[i], right[i + 1]);
      ctx.closePath();
      ctx.fillStyle = this.cape.color; ctx.fill();
      ctx.strokeStyle = GP.Draw.OUTLINE; ctx.lineWidth = 0.02; ctx.stroke();
      ctx.restore();
    }
    drawGlow(ctx) { for (const it of this.items()) if (it.drawGlow) it.drawGlow(ctx); }

    /* ------------------------------------------------ properties & saving */
    getProperties() {
      const self = this;
      const list = [];
      list.push({ key: 'health', label: 'Health', type: 'meter', get: () => self.healthFraction() });
      if (!self.mech && GP.Gore && GP.Gore.on()) list.push({ key: 'blood', label: 'Blood', type: 'meter', get: () => self.blood });
      list.push({ key: 'team', label: 'Team', type: 'select', options: GP.Teams.list(), get: () => self.team, set: (v) => { self.team = v; } });
      list.push({ key: 'ai', label: 'Behavior', type: 'select', options: [['aggressive', 'Aggressive'], ['defensive', 'Defensive'], ['passive', 'Passive'], ['flee', 'Cowardly'], ['off', 'No AI (stand)']], get: () => self.aiMode, set: (v) => { self.aiMode = v; } });
      list.push({ key: 'strength', label: 'Strength', type: 'range', min: 0.3, max: 4, step: 0.1, get: () => self.stats.strength, set: (v) => { self.stats.strength = v; } });
      list.push({ key: 'speed', label: 'Speed', type: 'range', min: 0.3, max: 3, step: 0.1, get: () => self.stats.speed, set: (v) => { self.stats.speed = v; } });
      list.push({ key: 'skill', label: 'Combat skill', type: 'range', min: 0, max: 1, step: 0.05, get: () => self.stats.skill, set: (v) => { self.stats.skill = v; } });
      if (self.stats.force) {
        list.push({ key: 'fstr', label: 'Force strength', type: 'range', min: 0.2, max: 4, step: 0.1, get: () => self.stats.force.strength, set: (v) => { self.stats.force.strength = v; } });
        list.push({ key: 'frng', label: 'Force range', type: 'range', min: 0.3, max: 3, step: 0.1, get: () => self.stats.force.range, set: (v) => { self.stats.force.range = v; } });
      } else {
        list.push({ key: 'grant', label: 'Grant Force powers', type: 'button', action: () => { self.stats.force = { strength: 1, range: 1, powers: ['push', 'pull', 'lift'] }; } });
      }
      if (!self.mech && GP.Injury && GP.Injury.on()) {
        list.push({ key: 'cond', label: 'Condition', type: 'info', get: () => GP.Injury.describe(self) });
        list.push({ key: 'blood', label: 'Blood', type: 'meter', get: () => (self.blood == null ? 1 : self.blood) });
        if (!self.def.amphibious) list.push({ key: 'air', label: 'Air', type: 'meter', get: () => (self.air == null ? 1 : self.air / self.maxAir()) });
      }
      list.push({ key: 'knock', label: 'Knock down', type: 'button', action: () => self.knockDown(2) });
      list.push({ key: 'ko', label: 'Knock out', type: 'button', action: () => self.knockOut(15) });
      if (self.unconscious > 0) list.push({ key: 'wake', label: 'Wake up', type: 'button', action: () => self.wakeUp() });
      list.push({ key: 'heal', label: self.state === 'dead' ? 'Revive' : 'Heal', type: 'button', action: () => self.revive() });
      list.push({ key: 'kill', label: 'Kill', type: 'button', action: () => self.die() });
      list.push({ key: 'drop', label: 'Drop items', type: 'button', action: () => { self.unequip('handF'); self.unequip('handB'); } });
      list.push({ key: 'sep', type: 'sep' });
      const base = super.getProperties().filter((p) => p.key !== 'hp' && p.key !== 'repair');
      return list.concat(base);
    }
    saveState() {
      return {
        state: this.state, stun: this.stun, name: this.name, ai: this.aiMode, ko: this.unconscious,
        parts: this.partList.map((b) => [Math.round(b.part.hp * 10) / 10, b.part.severed ? 1 : 0, +b.part.burn.toFixed(2), b.part.fractured ? 1 : 0, +(b.part.nerve || 0).toFixed(2), +(b.part.numb || 0).toFixed(2)]),
        blood: this.blood != null ? +this.blood.toFixed(3) : 1,
        inj: this.inj ? { i: +this.inj.internal.toFixed(3), p: +this.inj.pain.toFixed(3), a: +this.inj.adrenaline.toFixed(3), s: +this.inj.shock.toFixed(3), c: +this.inj.consc.toFixed(3) } : null,
        equip: { handF: this.equipment.handF && this.equipment.handF.id, handB: this.equipment.handB && this.equipment.handB.id, back: this.equipment.back && this.equipment.back.id },
        stats: { strength: this.stats.strength, speed: this.stats.speed, skill: this.stats.skill, force: this.stats.force },
      };
    }
    loadState(s) {
      if (!s) return;
      this.aiMode = s.ai || this.aiMode;
      if (s.stats) { Object.assign(this.stats, { strength: s.stats.strength, speed: s.stats.speed, skill: s.stats.skill }); if (s.stats.force) this.stats.force = s.stats.force; }
      if (s.parts) s.parts.forEach((pp, i) => {
        const b = this.partList[i]; if (!b) return;
        b.part.hp = pp[0]; b.part.burn = pp[2] || 0; b.part.fractured = !!pp[3]; b.part.nerve = pp[4] || 0; b.part.numb = pp[5] || 0;
        if (pp[1] && !b.part.severed && b.part.joint) this.sever(b.part.name, null);
      });
      this.stun = s.stun || 0;
      this.unconscious = s.ko || 0;
      if (s.blood != null) this.blood = s.blood;
      if (s.inj && GP.Injury) Object.assign(GP.Injury.state(this), { internal: s.inj.i, pain: s.inj.p, adrenaline: s.inj.a, shock: s.inj.s, consc: s.inj.c });
      if (s.state === 'dead') this.die();
      this.pendingEquip = s.equip;
    }
    resolve(map) {
      if (!this.pendingEquip) return;
      for (const slot of ['handF', 'handB', 'back']) {
        const id = this.pendingEquip[slot];
        const it = id && map.get(id);
        if (it && !it.holder) this.equip(it, slot);
      }
      this.pendingEquip = null;
    }
    destroy() {
      if (this.playerControlled) GP.Events.emit('control:lost', { e: this });
      for (const it of this.items()) { if (it.holder === this) it.detach(); }
      if (this.vehicle) this.vehicle.forceRemoveOccupant(this);
      super.destroy();
    }
  }

  GP.Character = Character;
  GP.Registry.registerKind('character', Character);

  /* Teams and hostility */
  GP.Teams = (() => {
    const names = {
      jedi: 'Jedi Order', republic: 'Galactic Republic', rebel: 'Rebel Alliance', empire: 'Galactic Empire', sith: 'Sith',
      separatist: 'Separatists', bounty: 'Bounty hunters', wild: 'Hostile natives', neutral: 'Neutral / civilian',
      red: 'Team Red', blue: 'Team Blue', green: 'Team Green', gold: 'Team Gold', rogue: 'Rogue (fights everyone)',
    };
    const hostile = {
      jedi: ['sith', 'empire', 'separatist', 'wild', 'bounty'],
      republic: ['separatist', 'sith', 'wild'],
      rebel: ['empire', 'sith', 'separatist', 'wild', 'bounty'],
      empire: ['rebel', 'jedi', 'separatist', 'wild'],
      sith: ['jedi', 'rebel', 'republic'],
      separatist: ['jedi', 'republic', 'rebel', 'empire'],
      bounty: ['jedi', 'rebel'],
      wild: ['jedi', 'republic', 'rebel', 'empire', 'sith', 'separatist', 'bounty', 'neutral'],
      neutral: [],
    };
    const custom = ['red', 'blue', 'green', 'gold'];
    return {
      name: (t) => names[t] || t,
      list: () => Object.keys(names).map((k) => [k, names[k]]),
      hostile(a, b) {
        if (a === b) return a === 'rogue';
        if (a === 'rogue' || b === 'rogue') return true;
        if (a === 'neutral' || b === 'neutral') return (hostile[a] || []).includes(b) || (hostile[b] || []).includes(a);
        if (custom.includes(a) || custom.includes(b)) return true;
        return (hostile[a] || []).includes(b) || (hostile[b] || []).includes(a);
      },
    };
  })();
})();
