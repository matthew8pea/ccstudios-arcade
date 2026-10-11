/* GALACTIC PLAYGROUND — vehicles.
 * One configurable Vehicle kind with pluggable controllers:
 *   hover   raycast suspension "repulsor" points (speeder bikes, landspeeders, tanks, STAPs)
 *   walker  supported hull + procedural IK legs that plant, step and stomp (AT-ST, AT-AT, spider droid)
 *   flyer   thrust / rotate / anti-gravity lift with side-slip damping (starfighters, shuttles, gunships)
 *   turret  fixed mount with an aimable gun (E-Web, emplacement cannons)
 * Vehicles have seats (exposed seats weld the rider on; enclosed seats hide the pilot inside),
 * turreted or fixed weapon hardpoints, component damage (engines, legs, wings, guns, cockpit),
 * breakaway parts and a burning wreck state.
 */
'use strict';

(() => {
  const Phys = GP.Phys, M = GP.M, CAT = Phys.CAT;

  class Vehicle extends GP.Entity {
    constructor(game, def, opts) {
      super(game, def, opts);
      this.isVehicle = true;
      this.material = def.material || 'metal';
      this.layer = def.layer != null ? def.layer : 1;
      this.seats = def.seats || [];
      this.occupants = new Array(this.seats.length).fill(null);
      this.comps = {};
      for (const c of def.components || []) this.comps[c.id] = Object.assign({ hp: c.hp, maxHp: c.hp, broken: false }, c);
      this.engine = true;
      this.wrecked = false; this.burnT = 0;
      this.t = Math.random() * 10;
      this.weapons = (def.weapons || []).map((w) => ({ def: w, cd: 0, ang: w.base || 0, side: 0, stats: Object.assign({ damage: 30, rate: 3, speed: 70, size: 0.07, len: 1, color: '#ff3030', spread: 0.02 }, w.stats) }));
      this.autopilot = opts.autopilot != null ? opts.autopilot : !!def.autopilot;
      this.ownIntent = GP.Character.prototype.blankIntent();
      this.aiT = 0; this.target = null;
      this.legs = [];
      this.engineSnd = null;
      this.flipVis = 1;
      this.thrustMul = 1;
      this.stepIndex = 0;
    }

    /* ------------------------------------------------ build */
    build(x, y, opts = {}) {
      this.facing = opts.facing || this.facing || 1;
      this.scale = opts.scale || this.scale || 1;
      const b = new Phys.Body({ x, y, angle: opts.angle || 0, linearDamping: this.def.linearDamping != null ? this.def.linearDamping : 0.1, angularDamping: this.def.angularDamping != null ? this.def.angularDamping : 0.8 });
      this.addHullShapes(b);
      b.finalize();
      this.addBody(b);
      if (this.def.controller === 'walker') this.initLegs();
      return this;
    }
    addHullShapes(b) {
      const f = this.facing * this.scale, s = this.scale;
      for (const sd of this.def.shapes) {
        if (sd.comp && this.comps[sd.comp] && this.comps[sd.comp].broken && this.comps[sd.comp].detach) continue;
        const [sh] = GP.buildShapes([sd], f, s, { density: this.def.density || 120, friction: sd.friction != null ? sd.friction : 0.6, restitution: 0.05, category: CAT.VEHICLE, mask: CAT.ALL });
        sh.data = { comp: sd.comp || null };
        if (sd.landing) sh.data.landing = true;
        b.addShape(sh);
      }
      if (this.def.controller === 'walker') {
        for (let i = 0; i < this.def.walker.legs.length; i++) {
          for (let k = 0; k < 2; k++) {
            const sh = Phys.poly([0, 0, 0.1, 0, 0.1, 0.1, 0, 0.1], { density: 0, sensor: true, massless: true, category: CAT.VEHICLE, mask: CAT.BLADE });
            sh.tag = 'hitbox'; sh.data = { comp: 'leg' + i, leg: i, seg: k };
            b.addShape(sh);
          }
        }
      }
    }
    rebuildHull() {
      const b = this.body;
      const ox = b.originX(), oy = b.originY();
      for (const c of b.contacts.slice()) this.game.world.destroyContact(c);
      b.shapes = []; b.ox = 0; b.oy = 0; b.x = ox; b.y = oy;
      this.addHullShapes(b);
      b.finalize();
      if (this.props.massScale) b.setMassScale(this.props.massScale);
      this.game.world.staticDirty = this.game.world.staticDirty || b.type === Phys.STATIC;
    }
    setFacing(f) {
      if (f === this.facing) return;
      this.facing = f;
      this.rebuildHull();
      for (const L of this.legs) { L.hipX = -L.hipX; }
      for (const w of this.weapons) w.ang = w.def.base || 0;
    }

    /* ------------------------------------------------ queries */
    position() { return { x: this.body.x, y: this.body.y }; }
    distanceTo(x, y) {
      let best = Infinity;
      for (const s of this.body.shapes) if (!s.sensor) best = Math.min(best, Phys.pointShapeDistance(s, x, y));
      return best;
    }
    occupied() { return this.occupants.some(Boolean) || (this.autopilot && !this.wrecked); }
    driver() { return this.occupants[0]; }
    hasFreeSeat() { return !this.wrecked && this.occupants.some((o) => !o); }
    healthFraction() { return this.hp / this.maxHp; }
    local(px, py) { return this.body.originToWorld(px * this.facing * this.scale, py * this.scale); }
    pilotLook(i = 0) { const o = this.occupants[i]; return o && o.look ? o.look : null; }

    /* ------------------------------------------------ seats */
    enter(char, idx) {
      if (this.wrecked) return false;
      if (idx == null) idx = this.occupants.findIndex((o) => !o);
      if (idx < 0 || this.occupants[idx]) return false;
      const seat = this.seats[idx];
      this.occupants[idx] = char;
      char.vehicle = this; char.seat = seat; char.seatIndex = idx;
      char.attack = null;
      if (idx === 0) { this.team = char.team; this.target = null; }
      if (seat.enclosed) {
        char.hide();
      } else {
        // place the rider with their hip at the seat point and weld them on
        const b = this.body, t = char.parts.torso;
        if (char.facing !== this.facing) char.setFacing(this.facing);
        const sp = this.local(seat.x, seat.y);
        const hip = t.toWorld(char.hipLocal.x, char.hipLocal.y);
        const dx = sp.x - hip.x, dy = sp.y - hip.y;
        for (const p of char.partList) { p.x += dx; p.y += dy; p.vx = b.vx; p.vy = b.vy; p.w = 0; p.updateShapes(); }
        for (const it of char.items()) { it.body.x += dx; it.body.y += dy; it.body.updateShapes(); }
        const j = new Phys.WeldJoint(b, t, sp.x, sp.y, { breakForce: seat.breakForce || 26000, tag: 'seat' });
        j.onBreak = () => { if (char.vehicle === this) this.exit(char, true); };
        this.game.world.addJoint(j);
        char.seatJoint = j;
        this.setRiderCollision(char, false);
      }
      GP.Audio.play('servo', { x: this.body.x, y: this.body.y });
      GP.Events.emit('vehicle:enter', { v: this, c: char });
      return true;
    }
    setRiderCollision(char, on) {
      const apply = (s) => {
        if (on) { if (s._riderMask != null) { s.mask = s._riderMask; s._riderMask = null; } }
        else { if (s._riderMask == null) s._riderMask = s.mask; s.mask = s.mask & ~CAT.VEHICLE; }
      };
      for (const b of char.bodies) for (const s of b.shapes) apply(s);
      for (const it of char.items()) for (const s of it.body.shapes) if (s.tag !== 'blade') apply(s);
      char.resetContacts();
    }
    exit(char, ejected) {
      const idx = this.occupants.indexOf(char);
      if (idx < 0) return;
      this.occupants[idx] = null;
      const seat = this.seats[idx];
      const b = this.body;
      char.vehicle = null; char.seat = null;
      if (seat.enclosed) {
        const ex = seat.exit || [seat.x, seat.y - 1];
        const p = this.local(ex[0], ex[1]);
        // find a clear spot next to the vehicle
        let x = p.x, y = p.y;
        const bb = this.bounds();
        if (!seat.exit) { x = this.facing > 0 ? bb.minX - 0.8 : bb.maxX + 0.8; y = bb.maxY - 1.2; }
        char.unhide(x, y, b.vx, b.vy);
      } else {
        if (char.seatJoint && char.seatJoint.world) this.game.world.removeJoint(char.seatJoint);
        char.seatJoint = null;
        const t = char.parts.torso;
        for (const p of char.partList) { p.vy -= 3; p.vx += (ejected ? 0 : -this.facing * 1.5); }
        void t;
        const self = this;
        setTimeout(() => { if (!char.removed) self.setRiderCollision(char, true); }, 400);
      }
      if (ejected) char.knockDown(1.2);
      GP.Events.emit('vehicle:exit', { v: this, c: char });
    }
    forceRemoveOccupant(char) {
      const idx = this.occupants.indexOf(char);
      if (idx >= 0) this.occupants[idx] = null;
    }
    ejectAll(hurt) {
      for (const o of this.occupants.slice()) if (o) {
        this.exit(o, true);
        if (hurt) { o.damage({ type: 'explosive', amount: hurt, x: this.body.x, y: this.body.y }); for (const p of o.partList) { p.vx += M.rand(-6, 6); p.vy -= M.rand(4, 9); } }
      }
    }
    seatGripDir() { return this.def.gripDir != null ? this.def.gripDir : 0.35; }

    /* ------------------------------------------------ update */
    currentIntent() {
      if (this.playerControlled) return this.ownIntent;
      const d = this.driver();
      if (d && d.playerControlled) return d.intent;
      if (d && !d.playerControlled) {
        if (GP.aiEnabled() && d.aiMode !== 'off') { this.autopilotAI(d.intent); return d.intent; }
        return this.idleIntent();
      }
      if (this.autopilot && GP.aiEnabled()) { this.autopilotAI(this.ownIntent); return this.ownIntent; }
      if (this.playerControlled) return this.ownIntent;
      return this.idleIntent();
    }
    idleIntent() { const I = this.ownIntent; I.moveX = 0; I.jump = false; I.crouch = false; I.attack = false; I.block = false; I.run = false; return I; }

    update(dt) {
      this.t += dt;
      const b = this.body;
      if (this.wrecked) {
        this.burnT -= dt;
        if (this.burnT > 0) {
          if (Math.random() < 0.7) GP.FX.fire(b.x + M.rand(-1, 1) * b.radius * 0.4, b.y - 0.3, 2, 0.35 * Math.sqrt(this.scale));
          if (Math.random() < 0.25) GP.FX.smoke(b.x, b.y - 0.5, 1, 0.6, '#2a2828', -1.2);
          GP.FX.frameLight(b.x, b.y, 4, '#ff8a30', 0.7);
        } else if (Math.random() < dt * 2) GP.FX.smoke(b.x, b.y - 0.3, 1, 0.4, '#333', -0.8);
        if (this.engineSnd) { this.engineSnd.stop(); this.engineSnd = null; }
        if (this.def.controller === 'walker') this.updateLegs(dt, false);
        return;
      }
      for (const w of this.weapons) if (w.cd > 0) w.cd -= dt;
      const I = this.currentIntent();
      const ctrl = this.def.controller;
      if (ctrl === 'hover') this.hoverStep(dt, I);
      else if (ctrl === 'walker') this.walkerStep(dt, I);
      else if (ctrl === 'flyer') this.flyerStep(dt, I);
      else if (ctrl === 'turret') this.turretStep(dt, I);
      this.weaponStep(dt, I);
      // damage effects
      const hpF = this.hp / this.maxHp;
      if (hpF < 0.5 && Math.random() < (0.5 - hpF) * dt * 6) GP.FX.smoke(b.x + M.rand(-0.5, 0.5), b.y - 0.3, 1, 0.4 * Math.sqrt(this.scale), '#333', -1);
      if (hpF < 0.25 && Math.random() < dt * 5) GP.FX.fire(b.x, b.y - 0.2, 1, 0.25);
      if (hpF < 0.35 && Math.random() < dt * 2) GP.FX.sparks(b.x, b.y, 0, -1, 3, '#ffd27a', 3);
      // engine audio
      const active = this.engine && (this.driver() || this.autopilot || this.def.controller === 'hover');
      if (active && this.def.engineSound !== 'none') {
        if (!this.engineSnd) this.engineSnd = GP.Audio.loop(this.def.engineSound || 'engine', { freq: this.def.engineFreq || 60 });
        if (this.engineSnd) {
          const sp = Math.hypot(b.vx, b.vy);
          this.engineSnd.set((this.driver() || this.autopilot ? 0.35 : 0.12) * (this.def.engineVol || 1), 1 + sp / 25, b.x, b.y);
        }
      } else if (this.engineSnd) { this.engineSnd.stop(); this.engineSnd = null; }
      // riders keep their seats upright; enclosed pilots follow the hull for camera/AI
      for (const o of this.occupants) if (o && o.hidden) { const t = o.parts.torso; t.x = b.x; t.y = b.y; }
    }

    hoverStep(dt, I) {
      const b = this.body, H = this.def.hover, g = this.game.world.gravityY;
      const eng = this.engine && !(this.comps.engine && this.comps.engine.broken);
      if (!eng) return;
      const pts = H.points;
      const n = pts.length;
      const height = H.height * this.scale * (I.crouch ? 0.6 : 1) * (I.jump ? 1.6 : 1);
      const k = H.k || 9, z = H.damp || 0.8;
      let load = 0;
      for (const o of this.occupants) if (o && !o.hidden && o.totalM) load += o.totalM;
      const mPer = (b.m + load) / n;
      let grounded = 0;
      for (const p of pts) {
        const wp = this.local(p[0], p[1]);
        const len = height * 2.4;
        const hit = this.game.world.raycast(wp.x, wp.y, wp.x, wp.y + len, (s) => !s.sensor && s.body !== b && s.tag !== 'blade' && s.category !== CAT.DEBRIS && !(s.body.entity && s.body.entity.vehicle === this));
        if (!hit) continue;
        grounded++;
        const d = hit.t * len;
        const comp = height - d;
        const v = b.velocityAt(wp.x, wp.y);
        let fy = -mPer * (k * k * comp + 2 * z * k * v.y) - mPer * g * b.gravityScale * (comp > -height * 0.5 ? 1 : 0.3);
        fy = M.clamp(fy, -mPer * g * 5, 0);
        b.applyForce(0, fy, wp.x, wp.y);
        if (Math.random() < dt * 3) GP.FX.dust(hit.x, hit.y, 1, this.game.map && this.game.map.dustColor || '#9a8f7a', 0.2);
      }
      // keep level (with a little nose tilt from acceleration)
      const tilt = M.clamp(I.moveX * this.facing * 0.06, -0.1, 0.1);
      const err = M.wrapAngle(b.a + tilt * this.facing);
      b.applyTorque(-(err * 50 + b.w * 12) * b.I * (grounded ? 1 : 0.4));
      const max = H.maxSpeed * (I.run ? 1.5 : 1) * this.thrustMul;
      const acc = M.clamp((I.moveX * max - b.vx) * 1.8, -H.accel, H.accel);
      b.applyForce(b.m * acc * (grounded ? 1 : 0.35), 0);
      if (Math.abs(I.moveX) > 0.1 && Math.sign(I.moveX) !== this.facing && Math.abs(b.vx) < 3 && !this.def.noFlip) this.setFacing(Math.sign(I.moveX));
      const rear = this.local(H.exhaust ? H.exhaust[0] : -1, H.exhaust ? H.exhaust[1] : 0);
      if (Math.abs(I.moveX) > 0.1 || Math.random() < 0.2) GP.FX.spawn(GP.FX.K.GLOW, rear.x, rear.y, -this.facing * 3 + b.vx, 0, 0.12, 0.12 * Math.sqrt(this.scale), this.def.exhaustColor || '#ffb060', { size1: 0.02 });
      GP.FX.frameLight(rear.x, rear.y, 1.5, this.def.exhaustColor || '#ffb060', 0.5);
    }

    initLegs() {
      const W = this.def.walker;
      const reach = (W.thigh + W.shin) * this.scale;
      this.legs = W.legs.map((L, i) => {
        const hip = this.local(L.hip[0], L.hip[1]);
        const g = this.game.world.raycast(hip.x, hip.y, hip.x, hip.y + reach * 1.6, (s) => !s.sensor && s.body.type === Phys.STATIC);
        const fy = g ? g.y : hip.y + reach * 0.95;
        const fx = hip.x + (i % 2 ? 0.2 : -0.2) * this.scale;
        return { i, hipX: L.hip[0] * this.facing, hipY: L.hip[1], fx, fy, planted: true, swing: 0, sx: fx, sy: fy, tx: fx, ty: fy };
      });
      this.gaitT = 0;
    }
    workingLegs() { return this.legs.filter((L) => !(this.comps['leg' + L.i] && this.comps['leg' + L.i].broken)).length; }
    walkerStep(dt, I) {
      const b = this.body, W = this.def.walker, g = this.game.world.gravityY;
      const s = this.scale;
      const need = W.needLegs || this.legs.length;
      const ok = this.workingLegs() >= need && this.engine;
      if (ok) {
        // support
        const hit = this.game.world.raycast(b.x, b.y, b.x, b.y + W.height * s * 2, (sh) => !sh.sensor && sh.body !== b && sh.tag !== 'blade' && sh.category !== CAT.DEBRIS && sh.category !== CAT.CHAR);
        if (hit) {
          const bob = Math.sin(this.gaitT * Math.PI * 2) * 0.04 * s * Math.min(1, Math.abs(b.vx));
          const targetY = hit.y - W.height * s + bob;
          const err = targetY - b.y;
          const w0 = 6;
          let fy = b.m * (-g * b.gravityScale + w0 * w0 * err - 2 * w0 * b.vy);
          fy = M.clamp(fy, -b.m * g * 3, 0);
          b.applyForce(0, fy);
        }
        b.applyTorque(-(M.wrapAngle(b.a) * 30 + b.w * 9) * b.I);
        const max = W.speed * s * (I.run ? 1.4 : 1) * this.thrustMul;
        const acc = M.clamp((I.moveX * max - b.vx) * 2, -W.accel, W.accel);
        b.applyForce(b.m * acc * (hit ? 1 : 0.2), 0);
        if (Math.abs(I.moveX) > 0.1 && Math.sign(I.moveX) !== this.facing && Math.abs(b.vx) < 0.8) this.setFacing(Math.sign(I.moveX));
      }
      this.updateLegs(dt, ok);
    }
    updateLegs(dt, powered) {
      const b = this.body, W = this.def.walker, s = this.scale;
      const reach = (W.thigh + W.shin) * s;
      const moving = Math.abs(b.vx) > 0.15;
      this.gaitT += dt * Math.abs(b.vx) / (W.stride * s) ;
      const swinging = this.legs.filter((L) => !L.planted).length;
      for (const L of this.legs) {
        const hip = this.local(L.hipX * this.facing, L.hipY);
        const broken = this.comps['leg' + L.i] && this.comps['leg' + L.i].broken;
        if (!powered || broken) {
          // limp legs dangle under the hip
          L.planted = false; L.swing = 0;
          L.fx = M.lerp(L.fx, hip.x + b.vx * 0.05, 0.1); L.fy = M.lerp(L.fy, hip.y + reach * 0.95, 0.1);
          continue;
        }
        if (L.planted) {
          const ideal = hip.x + b.vx * W.stepTime * 0.5;
          const off = L.fx - ideal;
          const tooFar = Math.hypot(L.fx - hip.x, L.fy - hip.y) > reach * 0.99 || L.fy < hip.y + reach * 0.55;
          const maxSwing = W.maxSwing || 1;
          if ((Math.abs(off) > W.stride * s * 0.5 && swinging < maxSwing && this.legTurn(L)) || tooFar) {
            const dir = moving ? Math.sign(b.vx) : -Math.sign(off);
            const tx = ideal + dir * W.stride * s * 0.35;
            const g = this.game.world.raycast(tx, hip.y, tx, hip.y + reach * 1.3, (sh) => !sh.sensor && sh.body !== b && sh.tag !== 'blade' && sh.category !== CAT.DEBRIS && sh.category !== CAT.CHAR && sh.category !== CAT.ITEM);
            L.planted = false; L.swing = 0; L.sx = L.fx; L.sy = L.fy; L.tx = tx; L.ty = g ? g.y : hip.y + reach * 0.95;
            this.stepIndex++;
          }
        } else {
          L.swing += dt / (W.stepTime);
          const u = Math.min(1, L.swing);
          L.fx = M.lerp(L.sx, L.tx, M.smooth(u));
          L.fy = M.lerp(L.sy, L.ty, u) - Math.sin(u * Math.PI) * W.lift * s;
          if (u >= 1) { L.planted = true; this.stomp(L); }
        }
        // clamp to reach
        const dx = L.fx - hip.x, dy = L.fy - hip.y, d = Math.hypot(dx, dy);
        if (d > reach) { L.fx = hip.x + dx / d * reach; L.fy = hip.y + dy / d * reach; }
      }
      this.updateLegHitboxes();
    }
    legTurn(L) {
      const n = this.legs.length;
      if (n <= 2) return true;
      // quadrupeds: diagonal pairs alternate
      const pair = (L.i === 0 || L.i === 3) ? 0 : 1;
      return (this.stepIndex % 2) === pair;
    }
    stomp(L) {
      const W = this.def.walker;
      const p = { x: L.fx, y: L.fy };
      GP.Audio.play('stomp', { x: p.x, y: p.y, vol: 0.4 + this.scale * 0.2 });
      GP.FX.dust(p.x, p.y, 5, this.game.map && this.game.map.dustColor || '#9a8f7a', 0.3 * this.scale);
      if (this.game.camera && W.shake) this.game.camera.addShake(W.shake * M.clamp(1 - Math.hypot(this.game.camera.x - p.x, this.game.camera.y - p.y) / 40, 0, 1));
      // crush what is underfoot
      const r = (W.footR || 0.35) * this.scale;
      this.game.world.queryRadius(p.x, p.y - r * 0.5, r, (s) => {
        const e = s.body.entity;
        if (!e || e === this || s.sensor || e.vehicle === this) return;
        if (Math.hypot(s.body.x - p.x, s.body.y - p.y) > r * 1.6) return;
        GP.Damage.hit(s.body, { type: 'crush', amount: (W.crush || 40) * this.scale * (GP.Settings.play.crushForce || 1), x: p.x, y: p.y, source: this.driver() || this });
        s.body.applyImpulse(0, 20 * s.body.m * 0.1);
        if (e.knockDown) e.knockDown(1.5);
      });
    }
    kneePoint(hx, hy, fx, fy, back) {
      const W = this.def.walker, s = this.scale;
      const a = W.thigh * s, c = W.shin * s;
      let dx = fx - hx, dy = fy - hy;
      let d = Math.hypot(dx, dy) || 1e-6;
      d = Math.min(d, a + c - 1e-4);
      const cosA = (a * a + d * d - c * c) / (2 * a * d);
      const ang = Math.atan2(dy, dx);
      const off = Math.acos(M.clamp(cosA, -1, 1));
      const sign = (W.knee === 'back' ? 1 : -1) * this.facing * (back ? 1 : 1);
      const ka = ang + off * sign;
      return { x: hx + Math.cos(ka) * a, y: hy + Math.sin(ka) * a };
    }
    updateLegHitboxes() {
      const b = this.body;
      const hbs = b.shapes.filter((s) => s.tag === 'hitbox');
      const w = (this.def.walker.legW || 0.2) * this.scale / 2;
      for (const sh of hbs) {
        const L = this.legs[sh.data.leg];
        if (!L) continue;
        const hip = this.local(L.hipX * this.facing, L.hipY);
        const knee = this.kneePoint(hip.x, hip.y, L.fx, L.fy);
        const [p1, p2] = sh.data.seg === 0 ? [hip, knee] : [knee, { x: L.fx, y: L.fy }];
        const dx = p2.x - p1.x, dy = p2.y - p1.y, l = Math.hypot(dx, dy) || 1;
        const nx = -dy / l * w, ny = dx / l * w;
        const pts = [p1.x + nx, p1.y + ny, p2.x + nx, p2.y + ny, p2.x - nx, p2.y - ny, p1.x - nx, p1.y - ny];
        const loc = [];
        for (let i = 0; i < 8; i += 2) { const q = b.toLocal(pts[i], pts[i + 1]); loc.push(q.x, q.y); }
        sh.setVerts(loc);
        sh.updateWorld(b);
      }
    }

    flyerStep(dt, I) {
      const b = this.body, F = this.def.flyer, g = this.game.world.gravityY;
      const piloted = !!this.driver() || this.autopilot || this.playerControlled;
      const eng = this.engine && !(this.comps.engine && this.comps.engine.broken);
      if (!piloted || !eng) { this.flipVis = Math.cos(b.a) < 0 ? -1 : 1; return; }
      const wingsOk = !(this.comps.wing && this.comps.wing.broken);
      const lift = (F.lift != null ? F.lift : 1) * (wingsOk ? 1 : 0.4);
      b.applyForce(0, -b.m * g * b.gravityScale * lift);
      // rotation
      const turn = F.turn * (I.run ? 0.8 : 1);
      const wantW = I.moveX * turn;
      b.applyTorque((wantW - b.w) * b.I * 8);
      if (!I.moveX && F.autoLevel) b.applyTorque(-(M.wrapAngle(b.a - (Math.cos(b.a) < 0 ? Math.PI : 0)) * 3 + b.w) * b.I * 2);
      // thrust along heading
      const hx = Math.cos(b.a), hy = Math.sin(b.a);
      const thrust = (I.jump ? 1 : 0) - (I.crouch ? 0.6 : 0);
      const boost = I.run ? 1.6 : 1;
      b.applyForce(hx * b.m * F.thrust * thrust * boost * this.thrustMul, hy * b.m * F.thrust * thrust * boost * this.thrustMul);
      // side-slip damping + drag + speed cap
      const vf = b.vx * hx + b.vy * hy, vs = -b.vx * hy + b.vy * hx;
      const slip = F.slip != null ? F.slip : 3;
      b.applyForce(hy * vs * slip * b.m, -hx * vs * slip * b.m);
      const sp = Math.hypot(b.vx, b.vy), max = F.maxSpeed * boost;
      if (sp > max) { b.vx *= max / sp; b.vy *= max / sp; }
      if (!I.jump && !I.crouch) { b.vx *= 1 - dt * (F.hoverDrag || 0.8); b.vy *= 1 - dt * (F.hoverDrag || 0.8); }
      this.flipVis = Math.cos(b.a) < 0 ? -1 : 1;
      // engine glow + exhaust
      for (const e of this.def.exhausts || []) {
        const p = this.local(e[0], e[1] * this.flipVis);
        const inten = 0.4 + thrust * 0.6 * boost;
        GP.FX.frameLight(p.x, p.y, 2 * this.scale, this.def.exhaustColor || '#ff7040', 0.5 + inten * 0.4);
        if (thrust > 0 && Math.random() < 0.7) GP.FX.spawn(GP.FX.K.GLOW, p.x, p.y, -hx * 6 + b.vx, -hy * 6 + b.vy, 0.12, 0.15 * this.scale * boost, this.def.exhaustColor || '#ff7040', { size1: 0.02, alpha: 0.8 });
      }
      void vf;
    }

    turretStep() {
      const b = this.body;
      b.applyTorque(-(M.wrapAngle(b.a) * 40 + b.w * 10) * b.I);
    }

    weaponStep(dt, I) {
      const b = this.body;
      for (const w of this.weapons) {
        const d = w.def;
        if (d.comp && this.comps[d.comp] && this.comps[d.comp].broken) continue;
        if (d.turret && I.hasAim) {
          const m = this.local(d.mount[0], d.mount[1]);
          const want = Math.atan2(I.aimY - m.y, I.aimX - m.x);
          // convert to facing space relative to hull
          let rel = M.wrapAngle(want - b.a);
          if (this.facing < 0) rel = M.wrapAngle(Math.PI - rel);
          const arc = d.arc || [-Math.PI, Math.PI];
          rel = M.clamp(rel, arc[0], arc[1]);
          w.ang = M.approach(w.ang, rel, dt * (d.turnRate || 3));
        }
        const fire = d.group === 'secondary' ? I.block : I.attack;
        if (fire && w.cd <= 0) this.fireWeapon(w);
      }
    }
    weaponWorldAngle(w) {
      const b = this.body;
      const rel = this.facing > 0 ? w.ang : Math.PI - w.ang;
      return b.a + (this.facing > 0 ? rel : rel) * 1;
    }
    fireWeapon(w) {
      const d = w.def, st = w.stats, b = this.body;
      const muzzles = d.muzzles || [[0.5, 0]];
      const salvo = d.salvo ? muzzles : [muzzles[w.side++ % muzzles.length]];
      const worldAng = this.facing > 0 ? b.a + w.ang : b.a + Math.PI - w.ang;
      const ca = Math.cos(worldAng), sa = Math.sin(worldAng);
      const mount = this.local(d.mount[0], d.mount[1] * this.flipVis);
      const drv = this.driver();
      for (const mz of salvo) {
        const lx = mz[0] * this.scale, ly = mz[1] * this.scale * this.flipVis * (this.facing > 0 ? 1 : -1);
        const mx = mount.x + ca * lx - sa * ly, my = mount.y + sa * lx + ca * ly;
        const a = worldAng + M.rand(-1, 1) * (st.spread || 0.02);
        GP.Projectiles.fire(this.game, {
          x: mx, y: my, vx: Math.cos(a) * st.speed + b.vx, vy: Math.sin(a) * st.speed + b.vy,
          color: st.color, damage: st.damage, width: st.size, len: st.len, type: st.bolt || 'blaster',
          owner: drv || this, shooter: this, team: this.team, ignore: [this, ...this.occupants], impulse: st.impulse != null ? st.impulse : st.damage * 0.2,
          explosive: st.explosive || null, gravity: st.gravity || 0, life: st.life || 3,
        });
        GP.FX.muzzleFlash(mx, my, ca, sa, st.explosive ? '#ffb040' : st.color);
      }
      if (st.recoil) b.applyImpulse(-ca * st.recoil, -sa * st.recoil, mount.x, mount.y);
      if (st.explosive) GP.Audio.play('rocket', { x: mount.x, y: mount.y });
      else GP.Audio.play('blaster', { x: mount.x, y: mount.y, pitch: st.pitch || 0.8, heavy: st.damage > 40, vol: 0.5 });
      w.cd = 1 / st.rate;
    }

    /* ------------------------------------------------ AI pilot */
    autopilotAI(I) {
      const b = this.body;
      this.aiT -= 1 / 60;
      if (this.aiT <= 0) {
        this.aiT = 0.4;
        if (this.target && (this.target.removed || this.target.state === 'dead' || this.target.wrecked || !GP.Teams.hostile(this.team, this.target.team))) this.target = null;
        if (!this.target) this.target = GP.Brain.findTarget(this.game, this, b.x, b.y, this.team, this.def.sight || 45, this.def.controller !== 'flyer');
      }
      I.moveX = 0; I.jump = false; I.crouch = false; I.attack = false; I.block = false; I.run = false;
      const T = this.target;
      if (!T) { I.hasAim = false; if (this.def.controller === 'flyer') this.flyerCruise(I); return; }
      const p = T.position();
      I.hasAim = true; I.aimX = p.x; I.aimY = p.y;
      const dx = p.x - b.x, dy = p.y - b.y, d = Math.hypot(dx, dy);
      if (this.def.controller === 'flyer') {
        const alt = this.game.world.raycast(b.x, b.y, b.x, b.y + 8, (s) => s.body.type === Phys.STATIC && !s.sensor);
        let want = Math.atan2(dy - (d > 10 ? 3 : 0), dx);
        if (alt && alt.t < 0.5) want = -Math.PI / 2 + (Math.cos(b.a) > 0 ? 0.6 : -0.6);
        if (d < 5) want = Math.atan2(-1, Math.sign(dx) || 1);
        const err = M.wrapAngle(want - b.a);
        I.moveX = M.clamp(err * 2.5, -1, 1);
        I.jump = Math.abs(err) < 1.2 || d > 20;
        I.crouch = d < 6;
        I.attack = Math.abs(M.wrapAngle(Math.atan2(dy, dx) - b.a)) < 0.18 && d < 40;
        I.block = I.attack && Math.random() < 0.01;
      } else {
        const pref = this.def.aiRange || 12;
        if (Math.abs(dx) > pref + 2) I.moveX = Math.sign(dx);
        else if (Math.abs(dx) < pref - 4) I.moveX = -Math.sign(dx) * 0.6;
        if (this.facing !== Math.sign(dx) && Math.abs(dx) > 2) I.moveX = Math.sign(dx) * 0.3;
        I.attack = d < 45 && GP.Brain.visible(this.game, b.x, b.y - 0.5, p.x, p.y);
        I.block = I.attack && Math.random() < 0.02;
      }
    }
    flyerCruise(I) {
      const b = this.body;
      const alt = this.game.world.raycast(b.x, b.y, b.x, b.y + 10, (s) => s.body.type === Phys.STATIC && !s.sensor);
      const want = alt && alt.t < 0.6 ? -Math.PI / 2 * 0.6 * (Math.cos(b.a) >= 0 ? 1 : -1) + (Math.cos(b.a) >= 0 ? 0 : Math.PI) : (Math.cos(b.a) >= 0 ? 0 : Math.PI);
      I.moveX = M.clamp(M.wrapAngle(want - b.a) * 2, -1, 1);
      I.jump = true;
      const bnd = this.game.map && this.game.map.bounds;
      if (bnd && (b.x < bnd.minX + 15 && Math.cos(b.a) < 0 || b.x > bnd.maxX - 15 && Math.cos(b.a) > 0)) I.moveX = 1;
    }

    /* ------------------------------------------------ damage */
    damage(info) {
      if (this.wrecked) return 0;
      const shape = info.shape;
      const r = this.resist[info.type] != null ? this.resist[info.type] : 1;
      let amt = info.amount * r;
      if (info.type === 'cut') amt *= 0.6;
      if (info.type === 'ion') { amt *= 2.5; this.engineStun = 2; }
      const compId = shape && shape.data && shape.data.comp;
      if (compId && this.comps[compId] && !this.comps[compId].broken) {
        const c = this.comps[compId];
        c.hp -= amt;
        if (c.hp <= 0) this.breakComponent(compId, info);
        amt *= c.hullShare != null ? c.hullShare : 0.5;
      }
      if (info.source && info.source !== this && info.source.isCharacterLike) this.target = info.source;
      this.hp -= amt;
      if (info.x != null && info.type === 'blaster' && shape && !shape.sensor) this.body.addDecal('scorch', info.x, info.y, 0.06 * this.scale);
      if (this.hp <= 0) this.wreck(info);
      return amt;
    }
    breakComponent(id, info) {
      const c = this.comps[id];
      if (c.broken) return;
      c.broken = true; c.hp = 0;
      const b = this.body;
      GP.FX.sparks(info && info.x != null ? info.x : b.x, info && info.y != null ? info.y : b.y, 0, -1, 16, '#ffd27a', 5);
      GP.FX.smoke(b.x, b.y, 3, 0.4, '#333');
      GP.Audio.play('explosion', { x: b.x, y: b.y, size: 0.4 });
      if (c.detach) this.detachComponent(id);
      if (id === 'cockpit') for (const o of this.occupants) if (o) o.damage({ type: 'explosive', amount: 40, x: b.x, y: b.y });
      GP.Events.emit('vehicle:component', { v: this, id });
    }
    // Break the shapes of a component off as separate debris pieces carrying the vehicle's art
    detachComponent(id) {
      const b = this.body;
      const pieces = [];
      for (const s of b.shapes) {
        if (!s.data || s.data.comp !== id || s.sensor) continue;
        let verts;
        if (s.kind === 'poly') verts = s.wv.slice();
        else { verts = []; for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; verts.push(s.wx + Math.cos(a) * s.r, s.wy + Math.sin(a) * s.r); } }
        pieces.push(verts);
      }
      this.rebuildHull();
      for (const v of pieces) this.spawnPiece(v, 8);
    }
    spawnPiece(worldVerts, speed) {
      if (!this.game.canSpawnBodies(1)) return;
      const b = this.body;
      const ox = b.originX(), oy = b.originY(), c = Math.cos(b.a), s = Math.sin(b.a);
      const poly = [];
      for (let i = 0; i < worldVerts.length; i += 2) { const rx = worldVerts[i] - ox, ry = worldVerts[i + 1] - oy; poly.push(c * rx + s * ry, -s * rx + c * ry); }
      if (GP.Phys.polyArea(poly) < 0.01) return;
      const f = GP.Registry.create(this.game, 'fragment', { src: this.def.id, poly, sx: this.facing * this.scale, sy: this.scale, material: 'metal', color: this.def.color || '#777', density: this.def.density || 120, hp: 60 });
      f.build(ox, oy, { angle: b.a });
      f.life = M.rand(20, 35);
      const nb = f.body;
      nb.vx = b.vx + M.rand(-speed, speed); nb.vy = b.vy - M.rand(2, speed); nb.w = M.rand(-4, 4);
      f.cuts.push({ x1: poly[0], y1: poly[1], x2: poly[2], y2: poly[3], t: 0 });
      this.game.addEntity(f);
      return f;
    }
    wreck(info) {
      if (this.wrecked) return;
      this.wrecked = true; this.hp = 0;
      this.autopilot = false;
      this.burnT = M.rand(8, 14);
      const b = this.body;
      this.ejectAll(this.def.enclosedEjectDamage || 25);
      for (const [id, c] of Object.entries(this.comps)) if (c.detach && !c.broken) { c.broken = true; this.detachComponent(id); }
      const r = (this.def.wreckRadius || 3) * this.scale;
      GP.Damage.explode(this.game, b.x, b.y, { radius: r, damage: 90, power: 12, source: info && info.source });
      this.team = 'neutral';
      GP.Events.emit('vehicle:wrecked', { v: this });
    }
    heal() {
      this.hp = this.maxHp; this.wrecked = false; this.burnT = 0;
      let rebuilt = false;
      for (const c of Object.values(this.comps)) { if (c.broken && c.detach) rebuilt = true; c.broken = false; c.hp = c.maxHp; }
      if (rebuilt) this.rebuildHull();
      if (this.def.controller === 'walker') this.initLegs();
    }

    /* ------------------------------------------------ drawing */
    draw(ctx, dt) {
      const b = this.body;
      if (this.def.controller === 'walker') this.drawLegs(ctx, true);
      ctx.save();
      ctx.translate(b.x, b.y); ctx.rotate(b.a);
      ctx.save();
      ctx.translate(b.ox, b.oy);
      ctx.scale(this.facing * this.scale, this.scale * this.flipVis);
      if (this.def.paint) this.def.paint(ctx, this);
      else if (this.def.art) GP.Draw.art(ctx, this.def.art);
      // weapons
      for (const w of this.weapons) {
        const d = w.def;
        if (!d.barrel) continue;
        if (d.comp && this.comps[d.comp] && this.comps[d.comp].broken && this.comps[d.comp].detach) continue;
        ctx.save();
        ctx.translate(d.mount[0], d.mount[1]);
        ctx.rotate(w.ang * (this.flipVis));
        GP.Draw.art(ctx, d.barrel);
        ctx.restore();
      }
      if (this.wrecked) { ctx.globalAlpha = 0.55; ctx.fillStyle = '#120c08'; for (const s of this.def.shapes) { if (s.box) { ctx.fillRect(s.box[2] - s.box[0] / 2, s.box[3] - s.box[1] / 2, s.box[0], s.box[1]); } } ctx.globalAlpha = 1; }
      ctx.restore();
      GP.Draw.decals(ctx, b, dt);
      ctx.restore();
      if (this.def.controller === 'walker') this.drawLegs(ctx, false);
    }
    drawLegs(ctx, back) {
      const W = this.def.walker, s = this.scale;
      const col = this.def.legColor || '#8a8e96';
      const w = (W.legW || 0.2) * s;
      for (const L of this.legs) {
        const isBack = W.legs[L.i].back;
        if (!!isBack !== back) continue;
        const broken = this.comps['leg' + L.i] && this.comps['leg' + L.i].broken;
        const hip = this.local(L.hipX * this.facing, L.hipY);
        const knee = this.kneePoint(hip.x, hip.y, L.fx, L.fy);
        const c = back ? GP.M.shade(col, -0.25) : col;
        const seg = (p, q, width) => {
          ctx.strokeStyle = GP.Draw.OUTLINE; ctx.lineWidth = width + 0.05 * s; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke();
          ctx.strokeStyle = broken ? '#3a3230' : c; ctx.lineWidth = width;
          ctx.stroke();
        };
        seg(hip, knee, w * 1.15);
        seg(knee, { x: L.fx, y: L.fy }, w);
        ctx.fillStyle = broken ? '#3a3230' : GP.M.shade(c, -0.1);
        ctx.strokeStyle = GP.Draw.OUTLINE; ctx.lineWidth = 0.04 * s;
        ctx.beginPath(); ctx.arc(knee.x, knee.y, w * 0.75, 0, 7); ctx.fill(); ctx.stroke();
        const fw = (W.footW || 0.6) * s, fh = (W.footH || 0.12) * s;
        GP.Draw.roundRect(ctx, L.fx - fw / 2, L.fy - fh, fw, fh, fh * 0.4);
        ctx.fillStyle = broken ? '#3a3230' : GP.M.shade(c, -0.15); ctx.fill(); ctx.stroke();
      }
    }
    drawGlow(ctx) {
      if (this.wrecked) return;
      for (const l of this.def.glows || []) {
        const p = this.local(l[0], l[1] * this.flipVis);
        GP.Draw.glow(ctx, p.x, p.y, l[2] * this.scale, l[3], 0.8);
      }
    }

    /* ------------------------------------------------ properties / save */
    getProperties() {
      const self = this;
      const l = [
        { key: 'hp', label: 'Hull integrity', type: 'meter', get: () => self.hp / self.maxHp },
        { key: 'team', label: 'Team', type: 'select', options: GP.Teams.list(), get: () => self.team, set: (v) => { self.team = v; self.target = null; } },
        { key: 'auto', label: 'Autopilot (AI drives when empty)', type: 'bool', get: () => self.autopilot, set: (v) => { self.autopilot = v; } },
        { key: 'engine', label: 'Engine on', type: 'bool', get: () => self.engine, set: (v) => { self.engine = v; } },
        { key: 'thrust', label: 'Thrust multiplier', type: 'range', min: 0.2, max: 3, step: 0.1, get: () => self.thrustMul, set: (v) => { self.thrustMul = v; } },
        { key: 'eject', label: 'Eject occupants', type: 'button', action: () => self.ejectAll(0) },
        { key: 'repair', label: 'Repair', type: 'button', action: () => self.heal() },
        { key: 'wreck', label: 'Destroy', type: 'button', action: () => self.wreck() },
        { key: 'sep', type: 'sep' },
      ];
      return l.concat(super.getProperties().filter((p) => p.key !== 'hp' && p.key !== 'repair'));
    }
    saveState() {
      const comps = {};
      for (const [k, c] of Object.entries(this.comps)) comps[k] = [c.hp, c.broken ? 1 : 0];
      return { comps, wrecked: this.wrecked, engine: this.engine, auto: this.autopilot, occ: this.occupants.map((o) => (o ? o.id : null)), thrust: this.thrustMul };
    }
    loadState(s) {
      if (!s) return;
      let rebuild = false;
      if (s.comps) for (const [k, v] of Object.entries(s.comps)) if (this.comps[k]) { this.comps[k].hp = v[0]; if (v[1]) { this.comps[k].broken = true; if (this.comps[k].detach) rebuild = true; } }
      if (rebuild) this.rebuildHull();
      this.engine = s.engine !== false; this.autopilot = !!s.auto; this.thrustMul = s.thrust || 1;
      if (s.wrecked) { this.wrecked = true; this.burnT = 0; }
      this.pendingOcc = s.occ;
    }
    resolve(map) {
      if (!this.pendingOcc) return;
      this.pendingOcc.forEach((id, i) => { const c = id && map.get(id); if (c && c.isCharacterLike && !c.vehicle) this.enter(c, i); });
      this.pendingOcc = null;
    }
    onRemove() {
      if (this.engineSnd) { this.engineSnd.stop(); this.engineSnd = null; }
      for (const o of this.occupants.slice()) if (o) this.exit(o, false);
    }
  }
  GP.Registry.registerKind('vehicle', Vehicle);
  GP.Vehicle = Vehicle;
})();
