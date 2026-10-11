/* GALACTIC PLAYGROUND — seats, home-built machines and wiring.
 *
 * Seating: any prop whose definition lists `seats` can be sat on (interact key). Riders are welded
 *   to the seat point and posed sitting, reusing the character's vehicle-seat behaviour.
 * Machines: parts with a `machine` block (motor wheels, thrusters, repulsor pads, turret mounts)
 *   are driven by whoever sits in a Pilot Seat connected to them through welds, pins or ropes.
 *   Parts can also be switched on by wires.
 * Wiring: a wire links a source object to a target. When the source is activated (buttons,
 *   sensors, timers, or anything you activate with E), every wired target is activated too.
 */
'use strict';

(() => {
  const Phys = GP.Phys, M = GP.M, CAT = Phys.CAT;

  /* ================================================================ seating */
  const Seating = {
    install(P) {
      P.hasFreeSeat = function () { return !!this.occupants && this.occupants.some((o) => !o); };
      P.occupied = function () { return !!this.occupants && this.occupants.some(Boolean); };
      P.driver = function () { return this.occupants ? this.occupants[0] : null; };
      P.distanceTo = function (x, y) { let best = Infinity; for (const s of this.body.shapes) best = Math.min(best, Phys.pointShapeDistance(s, x, y)); return best; };
      P.seatGripDir = function () { return this.def.gripDir != null ? this.def.gripDir : 0.4; };
      P.enter = function (char, idx) {
        if (!this.occupants) return false;
        if (idx == null) idx = this.occupants.findIndex((o) => !o);
        if (idx < 0 || this.occupants[idx]) return false;
        const seat = this.def.seats[idx];
        const b = this.body, t = char.parts.torso;
        this.occupants[idx] = char;
        char.vehicle = this; char.seat = seat; char.seatIndex = idx; char.attack = null;
        const f = this.facing;
        if (char.facing !== (seat.facing || 1) * f) char.setFacing((seat.facing || 1) * f);
        const sp = b.originToWorld(seat.x * f * this.scale, seat.y * this.scale);
        const hip = t.toWorld(char.hipLocal.x, char.hipLocal.y);
        const dx = sp.x - hip.x, dy = sp.y - hip.y;
        for (const p of char.partList) { p.x += dx; p.y += dy; p.vx = b.vx; p.vy = b.vy; p.w = 0; p.setAngle(0); p.updateShapes(); }
        for (const it of char.items()) it.reattach();
        const j = new Phys.WeldJoint(b, t, sp.x, sp.y, { breakForce: seat.breakForce || 9000, tag: 'seat' });
        j.onBreak = () => { if (char.vehicle === this) this.exit(char, true); };
        this.game.world.addJoint(j);
        char.seatJoint = j;
        Seating.riderCollision(char, b, false);
        GP.Audio.play('impact', { x: sp.x, y: sp.y, strength: 0.3, mat: 'wood' });
        return true;
      };
      P.exit = function (char, ejected) {
        const idx = this.occupants ? this.occupants.indexOf(char) : -1;
        if (idx < 0) return;
        this.occupants[idx] = null;
        char.vehicle = null; char.seat = null;
        if (char.seatJoint && char.seatJoint.world) this.game.world.removeJoint(char.seatJoint);
        char.seatJoint = null;
        for (const p of char.partList) p.vy -= 2;
        const self = this;
        setTimeout(() => { if (!char.removed && !self.removed) Seating.riderCollision(char, self.body, true); }, 350);
        if (ejected) char.knockDown(1);
      };
      P.forceRemoveOccupant = function (char) { const i = this.occupants ? this.occupants.indexOf(char) : -1; if (i >= 0) this.occupants[i] = null; };
      P.ejectAll = function () { if (this.occupants) for (const o of this.occupants.slice()) if (o) this.exit(o, false); };
    },
    // While seated, riders (and what they hold) ignore props so they don't fight the furniture
    riderCollision(char, seatBody, on) {
      const apply = (sh) => {
        if (on) { if (sh._seatMask != null) { sh.mask = sh._seatMask; sh._seatMask = null; } }
        else if (sh._seatMask == null) { sh._seatMask = sh.mask; sh.mask = sh.mask & ~CAT.PROP; }
      };
      for (const b of char.bodies) for (const sh of b.shapes) apply(sh);
      for (const it of char.items()) for (const sh of it.body.shapes) if (sh.tag !== 'blade') apply(sh);
      char.resetContacts();
      void seatBody;
    },
  };
  Seating.install(GP.Prop.prototype);
  GP.Seating = Seating;

  /* ================================================================ wiring */
  const Wires = {
    list: [],          // {from, to, pulse}
    queue: [],         // signals in flight: {t, e, game} — advanced with game time, so they pause with the game
    add(from, to) {
      if (!from || !to || from === to) return null;
      if (this.list.some((w) => w.from === from && w.to === to)) return null;
      const w = { from, to, pulse: 0 };
      this.list.push(w);
      return w;
    },
    removeFor(e) { const n = this.list.length; this.list = this.list.filter((w) => w.from !== e && w.to !== e); return n - this.list.length; },
    clear() { this.list = []; this.queue = []; },
    of(e) { return this.list.filter((w) => w.from === e || w.to === e); },
    // Activate everything wired from `src`. Signals hop with a small delay; loops are allowed but rate-limited.
    emit(src, game) {
      for (const w of this.list) {
        if (w.from !== src || w.to.removed) continue;
        w.pulse = 1;
        const tgt = w.to;
        const now = game ? game.time : 0;
        if (tgt._lastSignal != null && now - tgt._lastSignal < 0.08) continue;
        tgt._lastSignal = now;
        this.queue.push({ t: 0.06, e: tgt, game });
      }
    },
    // Activate an entity the same way the player would, then pass the signal on.
    // Signal sources (buttons, sensors, timers) decide for themselves when they emit.
    activate(e, game) {
      if (!e || e.removed) return false;
      let ok = false;
      try { ok = e.use ? !!e.use(null) : false; } catch (err) { console.warn(err); }
      if (e.def && e.def.machine) { e.powered = !e.powered; ok = true; }
      const wired = this.list.some((w) => w.from === e);
      if (wired && !(e.def && e.def.signalSource)) this.emit(e, game);
      return ok || wired;
    },
    update(dt) {
      for (const w of this.list) if (w.pulse > 0) w.pulse = Math.max(0, w.pulse - dt * 2.5);
      this.list = this.list.filter((w) => !w.from.removed && !w.to.removed);
      if (!this.queue.length) return;
      const due = [];
      this.queue = this.queue.filter((q) => ((q.t -= dt) > 0 ? true : (due.push(q), false)));
      for (const q of due) if (!q.e.removed) this.activate(q.e, q.game);
    },
    draw(ctx) {
      for (const w of this.list) {
        const a = w.from.position(), b = w.to.position();
        const sag = Math.min(1.2, Math.hypot(b.x - a.x, b.y - a.y) * 0.15);
        const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2 + sag;
        ctx.strokeStyle = '#1a1612'; ctx.lineWidth = 0.05;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.quadraticCurveTo(mx, my, b.x, b.y); ctx.stroke();
        ctx.strokeStyle = w.pulse > 0 ? M.mix('#c83030', '#ffe070', w.pulse) : '#8a2a2a'; ctx.lineWidth = 0.025;
        ctx.stroke();
        // little LEDs along the wire; they light up while a signal travels
        for (let i = 1; i < 6; i++) {
          const t = i / 6;
          const x = (1 - t) * (1 - t) * a.x + 2 * (1 - t) * t * mx + t * t * b.x, y = (1 - t) * (1 - t) * a.y + 2 * (1 - t) * t * my + t * t * b.y;
          const lit = w.pulse > 0 && Math.abs(t - (1 - w.pulse)) < 0.25;
          ctx.fillStyle = lit ? '#fff4a0' : '#5a1a1a';
          ctx.beginPath(); ctx.arc(x, y, 0.035, 0, 7); ctx.fill();
          if (lit) GP.Draw.glow(ctx, x, y, 0.2, '#ffd060', 0.8);
        }
      }
    },
  };
  GP.Wires = Wires;

  /* ================================================================ machines */
  const Machines = {
    // All entities connected to `e` through user welds / pins / ropes (breadth-first)
    connected(game, e) {
      const T = game.tools;
      if (!T) return [e];
      const seen = new Set([e]);
      const queue = [e];
      while (queue.length) {
        const cur = queue.shift();
        for (const j of T.constraints) {
          if (!j.world) continue;
          const ea = j.a.entity, eb = j.b.entity;
          let other = null;
          if (ea === cur) other = eb; else if (eb === cur) other = ea;
          if (other && !seen.has(other) && !other.removed) { seen.add(other); queue.push(other); }
        }
      }
      return Array.from(seen);
    },
    // Drive one machine part from a pilot's intent (or from a wire-powered "always on" signal)
    drive(p, I, dt, pilot) {
      const m = p.def.machine, b = p.body;
      if (!b || b.removed || p.hp <= 0) return;
      const run = I.run ? 1.6 : 1;
      if (m.type === 'motor') {
        const want = (I.moveX || 0) * m.speed * run;
        if (want === 0 && !p.powered) { b.w *= 1 - Math.min(1, dt * m.brake); return; }
        const target = want || m.speed;
        if (Math.abs(b.w) < Math.abs(target) || Math.sign(b.w) !== Math.sign(target)) b.applyTorque(Math.sign(target) * m.torque * run);
        if (Math.random() < dt * 4 && Math.abs(b.w) > 3) GP.FX.dust(b.x, b.y + p.def.shapes[0].circle[0] * p.scale, 1, '#8a8070', 0.12);
      } else if (m.type === 'thruster') {
        // fires with the key that matches the way it pushes: W for upward thrusters, A/D for sideways ones
        const dir = b.originToWorld(0, -1).x - b.originToWorld(0, 0).x, diry = b.originToWorld(0, -1).y - b.originToWorld(0, 0).y;
        const on = p.powered || (I.jump && diry < -0.5) || ((I.moveX || 0) * dir > 0.5);
        if (!on) return;
        b.applyForce(dir * m.force * run, diry * m.force * run);
        const n = b.originToWorld(0, 0.3 * p.scale);
        GP.FX.spawn(GP.FX.K.GLOW, n.x, n.y, -dir * 7 + b.vx, -diry * 7 + b.vy, 0.18, 0.16, m.color || '#ffa040', { size1: 0.02, alpha: 0.9 });
        if (Math.random() < 0.3) GP.FX.smoke(n.x, n.y, 1, 0.12, '#777', 0, 0.2, 0.8);
        GP.FX.frameLight(n.x, n.y, 2.2, m.color || '#ffa040', 0.7);
        if (!p.snd) p.snd = GP.Audio.loop('jet', { freq: 70 });
        if (p.snd) { p.snd.set(0.25, 1.1, n.x, n.y); p.sndT = 0.15; }
      } else if (m.type === 'repulsor') {
        const g = p.game.world.gravityY;
        const hit = p.game.world.raycast(b.x, b.y, b.x, b.y + m.height * 2.2, (s) => !s.sensor && s.body !== b && s.tag !== 'blade' && s.category !== CAT.DEBRIS && !(s.body.entity && s.body.entity.vehicle));
        if (!hit) return;
        const d = hit.t * m.height * 2.2, comp = m.height * (I.crouch ? 0.6 : I.jump ? 1.4 : 1) - d;
        const mass = m.lift;
        b.applyForce(0, M.clamp(-mass * (40 * comp + 9 * b.vy) - mass * g * 0.5, -mass * g * 4, 0));
        // hover fields keep the craft level (the torque reaches everything welded to the pad)
        b.applyTorque(-mass * (7 * M.wrapAngle(b.a) + 2 * b.w));
        if (Math.random() < dt * 8) GP.FX.spawn(GP.FX.K.GLOW, b.x + M.rand(-0.3, 0.3), b.y + 0.2, 0, 2, 0.2, 0.08, '#8ad0ff', { size1: 0.02, alpha: 0.6 });
      } else if (m.type === 'gun') {
        const f = p.facing;
        const mount = b.originToWorld(0, 0);
        if (I.hasAim) p.aim = Math.atan2(I.aimY - mount.y, I.aimX - mount.x);
        else if (p.aim == null) p.aim = b.a + (f < 0 ? Math.PI : 0);
        p.cd = (p.cd || 0) - dt;
        // bolts pass through the rest of the machine the turret is built into
        if (!p.linked || (p.linkT = (p.linkT || 0) - dt) <= 0) { p.linked = Machines.connected(p.game, p); p.linkT = 0.5; }
        if ((I.attack || p.powered) && p.cd <= 0) {
          const a = p.aim + M.rand(-0.03, 0.03), L = 0.8 * p.scale;
          const mx = mount.x + Math.cos(a) * L, my = mount.y + Math.sin(a) * L;
          GP.Projectiles.fire(p.game, { x: mx, y: my, vx: Math.cos(a) * 70 + b.vx, vy: Math.sin(a) * 70 + b.vy, color: m.color || '#ff3030', damage: m.damage, width: 0.055, len: 0.8, owner: pilot || p, team: pilot ? pilot.team : p.team, ignore: pilot ? p.linked.concat(pilot) : p.linked });
          b.applyImpulse(-Math.cos(a) * m.recoil, -Math.sin(a) * m.recoil, mount.x, mount.y);
          GP.FX.muzzleFlash(mx, my, Math.cos(a), Math.sin(a), m.color || '#ff3030');
          GP.Audio.play('blaster', { x: mx, y: my, pitch: 0.9, vol: 0.4 });
          p.cd = 1 / m.rate;
        }
      }
    },
    idle: { moveX: 0, jump: false, crouch: false, attack: false, run: false, hasAim: false },
  };
  GP.Machines = Machines;

  // Stop machine loops that are no longer firing (called from part updates)
  Machines.tickSound = (p, dt) => { if (p.snd && (p.sndT -= dt) <= 0) { p.snd.stop(); p.snd = null; } };
})();
