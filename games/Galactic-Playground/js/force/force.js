/* GALACTIC PLAYGROUND — the Force.
 * All powers operate on arbitrary physics bodies (no canned animations):
 *   push / pull     cone impulses scaled by distance and mass; stuns characters; bats bolts away
 *   repulse         360° shockwave
 *   lift (grip)     soft target constraints hold bodies/characters in the air; release = throw
 *   suspend         leave a lifted object hanging in place
 *   lightning       chained electric damage with arcs; blades can catch it
 *   disarm          pull yanks weapons out of hands toward the caster
 *   saber throw     thrown blade spins out and is pulled back to the hand
 * Casters are either characters (origin = hand) or the player's Force tool (origin = cursor).
 */
'use strict';

GP.Force = (() => {
  const M = GP.M, Phys = GP.Phys;
  const grips = new Map();     // caster -> {joints:[], entity, bodies:[]}
  const suspended = [];        // {joint, body}
  const pulled = [];           // {item, caster, t}
  const cooldowns = new Map(); // caster -> time
  let game = null;

  function strengthMul() { return GP.Settings.play.forceStrength; }
  function rangeMul() { return GP.Settings.play.forceRange; }

  function ownerOf(body) { return body.entity; }

  function forBodiesInCone(ox, oy, dx, dy, range, cone, caster, fn) {
    const seen = new Set();
    game.world.queryRadius(ox, oy, range, (s) => {
      const b = s.body;
      if (b.type !== Phys.DYNAMIC || b.removed || seen.has(b)) return;
      if (s.tag === 'blade' || s.sensor) return;
      const e = b.entity;
      if (caster && (e === caster || (e && e.holder === caster))) return;
      seen.add(b);
      const vx = b.x - ox, vy = b.y - oy;
      const d = Math.hypot(vx, vy);
      if (d > range) return;
      if (cone < Math.PI && d > 0.8) {
        const dot = (vx * dx + vy * dy) / (d || 1);
        if (dot < Math.cos(cone)) return;
      }
      fn(b, d, vx / (d || 1), vy / (d || 1));
    });
  }

  function wave(ox, oy, dx, dy, range, color, inward) {
    const a = Math.atan2(dy, dx);
    for (let i = 1; i <= 5; i++) {
      const f = i / 5;
      const r = range * f;
      const cx = ox + dx * r * 0.5, cy = oy + dy * r * 0.5;
      GP.FX.spawn(GP.FX.K.RING, inward ? ox + dx * r : cx, inward ? oy + dy * r : cy, inward ? -dx * 8 : dx * 8, inward ? -dy * 8 : dy * 8, 0.25 + f * 0.25, 0.05, color, { size1: r * 0.4 + 0.3, alpha: 0.45, drag: 0.06, add: true });
    }
    for (let i = 0; i < 14; i++) {
      const aa = a + M.rand(-0.5, 0.5), sp = M.rand(8, 16) * (inward ? -1 : 1);
      const sx = inward ? ox + Math.cos(aa) * range : ox, sy = inward ? oy + Math.sin(aa) * range : oy;
      GP.FX.streak(sx, sy, Math.cos(aa) * sp, Math.sin(aa) * sp, color, 0.3, 0.03);
    }
  }

  function affectCharacter(e, stun) {
    if (e && e.knockDown && e.state === 'alive') e.knockDown(stun);
  }

  const api = {
    setGame(g) { game = g; },

    push(ox, oy, dx, dy, o = {}) {
      const range = (o.range || 8) * rangeMul();
      const str = (o.strength || 1) * strengthMul();
      const cone = o.cone || 0.6;
      const stunned = new Set();
      forBodiesInCone(ox, oy, dx, dy, range, cone, o.caster, (b, d, ux, uy) => {
        const fall = 1 - (d / range) * 0.6;
        const dv = Math.min(22, 13 * str * fall / (1 + b.m / 180));
        const jx = (ux * 0.6 + dx * 0.4), jy = (uy * 0.6 + dy * 0.4) - 0.25;
        b.applyImpulse(jx * dv * b.m, jy * dv * b.m, b.x + M.rand(-0.05, 0.05), b.y);
        const e = b.entity;
        if (e && e.isCharacterLike && !stunned.has(e)) { stunned.add(e); affectCharacter(e, 1 + str * 1.3); if (e.brain) e.brain.onDamaged(o.caster); }
        if (e && e.holder && e.holder !== o.caster && Math.random() < 0.35 * str) e.holder.unequip(e.slot);
      });
      // bat away blaster bolts
      for (const p of GP.Projectiles.list()) {
        const vx = p.x - ox, vy = p.y - oy, d = Math.hypot(vx, vy);
        if (d < range * 0.6 && (vx * dx + vy * dy) / (d || 1) > Math.cos(cone)) {
          const sp = Math.hypot(p.vx, p.vy); p.vx = dx * sp; p.vy = dy * sp;
          if (o.caster) { p.team = o.caster.team || p.team; p.ignore = [o.caster]; }
        }
      }
      wave(ox, oy, dx, dy, range, o.color || '#cfe6ff', false);
      GP.FX.light(ox, oy, 3, '#bcd8ff', 0.6, 0.2);
      GP.Audio.play('forcePush', { x: ox, y: oy });
      if (game.camera) game.camera.addShake(0.12 * str);
      GP.Events.emit('force:push', { x: ox, y: oy });
    },

    pull(ox, oy, dx, dy, o = {}) {
      const range = (o.range || 9) * rangeMul();
      const str = (o.strength || 1) * strengthMul();
      const cone = o.cone || 0.55;
      const stunned = new Set();
      forBodiesInCone(ox, oy, dx, dy, range, cone, o.caster, (b, d, ux, uy) => {
        const fall = 1 - (d / range) * 0.5;
        const dv = Math.min(16, 10 * str * fall / (1 + b.m / 160));
        b.applyImpulse(-ux * dv * b.m, (-uy - 0.2) * dv * b.m);
        const e = b.entity;
        if (e && e.isCharacterLike && !stunned.has(e)) { stunned.add(e); affectCharacter(e, 0.8 + str); }
        // disarm: rip items from hands toward the caster
        if (e && e.isItem && e.holder && e.holder !== o.caster) {
          const h = e.holder;
          h.unequip(e.slot);
          if (h.brain) h.brain.onDamaged(o.caster);
          if (o.caster && o.caster.isCharacterLike) pulled.push({ item: e, caster: o.caster, t: 0 });
        } else if (e && e.isItem && !e.holder && o.caster && o.caster.isCharacterLike && d < range) {
          pulled.push({ item: e, caster: o.caster, t: 0 });
        }
      });
      wave(ox, oy, dx, dy, range, o.color || '#cfe6ff', true);
      GP.Audio.play('forcePull', { x: ox, y: oy });
      GP.Events.emit('force:pull', { x: ox, y: oy });
    },

    repulse(x, y, o = {}) {
      const range = (o.range || 5) * rangeMul();
      const str = (o.strength || 1.3) * strengthMul();
      const stunned = new Set();
      forBodiesInCone(x, y, 1, 0, range, Math.PI, o.caster, (b, d, ux, uy) => {
        const dv = Math.min(26, 15 * str * (1 - d / range * 0.7) / (1 + b.m / 200));
        b.applyImpulse(ux * dv * b.m, (uy - 0.3) * dv * b.m);
        const e = b.entity;
        if (e && e.isCharacterLike && !stunned.has(e)) { stunned.add(e); affectCharacter(e, 1.5 + str); }
      });
      for (let i = 0; i < 3; i++) GP.FX.spawn(GP.FX.K.RING, x, y, 0, 0, 0.4 + i * 0.12, 0.1, '#d8ecff', { size1: range * (0.8 + i * 0.2), alpha: 0.6, drag: 0.08, add: true });
      GP.FX.light(x, y, range * 1.5, '#bcd8ff', 1, 0.3);
      GP.Audio.play('forcePush', { x, y, vol: 0.8 });
      if (game.camera) game.camera.addShake(0.3 * str);
    },

    /* ---------- lift / grip ---------- */
    lift(caster, target, x, y, o = {}) {
      api.release(caster);
      if (!target) return false;
      const str = (o.strength || 1) * strengthMul();
      const bodies = [];
      const e = target.entity;
      let main = target;
      if (e && e.isCharacterLike && e.parts) main = e.parts.torso;
      else if (e && e.bodies && e.bodies.length > 1 && !e.isCharacterLike) main = target;
      if (main.type !== Phys.DYNAMIC) return false;
      const mass = e && e.totalMass ? e.totalMass() : main.m;
      const j = new Phys.TargetJoint(game.world.ground, main, main.x, main.y, { hertz: 3.2, dampingRatio: 0.85, maxForce: mass * 60 * str, effectiveMass: mass, angularDamp: 0.4 });
      game.world.addJoint(j);
      bodies.push(main);
      const g = { joints: [j], entity: e, bodies, offX: x - main.x, offY: y - main.y, last: { x, y }, vel: { x: 0, y: 0 }, t: 0 };
      grips.set(caster, g);
      if (e && e.isCharacterLike) { affectCharacter(e, 1.2); if (e.brain) e.brain.onDamaged(caster && caster.isCharacterLike ? caster : null); }
      GP.Audio.play('forcePull', { x: main.x, y: main.y, vol: 0.35 });
      return true;
    },
    liftUpdate(caster, x, y, dt) {
      const g = grips.get(caster);
      if (!g) return;
      const j = g.joints[0];
      if (!j.world || j.b.removed) { grips.delete(caster); return; }
      g.t += dt;
      if (dt > 0) { g.vel.x = M.lerp(g.vel.x, (x - g.last.x) / dt, 0.3); g.vel.y = M.lerp(g.vel.y, (y - g.last.y) / dt, 0.3); }
      g.last.x = x; g.last.y = y;
      j.setTarget(x - g.offX * 0.2, y - g.offY * 0.2);
      if (g.entity && g.entity.isCharacterLike) affectCharacter(g.entity, 0.4);
      if (Math.random() < 0.3) { const b = j.b; GP.FX.spawn(GP.FX.K.GLOW, b.x + M.rand(-0.4, 0.4), b.y + M.rand(-0.4, 0.4), 0, -0.5, 0.4, 0.15, '#bcd8ff', { alpha: 0.35, size1: 0.3 }); }
    },
    isLifting(caster) { return grips.has(caster); },
    liftedBody(caster) { const g = grips.get(caster); return g ? g.joints[0].b : null; },
    release(caster, throwIt = true, vel) {
      const g = grips.get(caster);
      if (!g) return;
      grips.delete(caster);
      for (const j of g.joints) if (j.world) game.world.removeJoint(j);
      if (throwIt) {
        const v = vel || g.vel;
        const sp = Math.hypot(v.x, v.y);
        const k = sp > 25 ? 25 / sp : 1;
        const e = g.entity;
        const bodies = e && e.isCharacterLike ? e.bodies : e && e.bodies ? e.bodies : g.bodies;
        for (const b of bodies) { b.vx = M.lerp(b.vx, v.x * k, 0.8); b.vy = M.lerp(b.vy, v.y * k, 0.8); b.wake(); }
      }
    },
    suspend(caster) {
      const g = grips.get(caster);
      if (!g) return;
      grips.delete(caster);
      const j = g.joints[0];
      suspended.push({ joint: j, body: j.b });
      j.hertz = 2; j.dampingRatio = 1;
      GP.Audio.play('freeze', { x: j.b.x, y: j.b.y });
    },
    releaseSuspended(body) {
      for (let i = suspended.length - 1; i >= 0; i--) {
        if (!body || suspended[i].body === body || suspended[i].body.entity === body.entity) {
          const s = suspended[i];
          if (s.joint.world) game.world.removeJoint(s.joint);
          suspended.splice(i, 1);
        }
      }
    },
    suspendedCount() { return suspended.length; },

    /* ---------- lightning ---------- */
    lightning(caster, ox, oy, tx, ty, dt, o = {}) {
      const range = (o.range || 8) * rangeMul();
      const str = (o.strength || 1) * strengthMul();
      let dx = tx - ox, dy = ty - oy; const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
      const hits = [];
      const seenE = new Set();
      forBodiesInCone(ox, oy, dx, dy, range, 0.45, caster, (b, d) => {
        const e = b.entity;
        if (!e || seenE.has(e) || e.isItem) return;
        seenE.add(e);
        hits.push({ b: e.parts ? M.pick(e.partList.filter((p) => !p.part.severed)) || b : b, e, d });
      });
      hits.sort((a, b) => a.d - b.d);
      const color = o.color || '#b99cff';
      if (!hits.length) {
        for (let i = 0; i < 2; i++) GP.FX.arc(ox, oy, ox + dx * range * M.rand(0.4, 1) + M.rand(-1, 1), oy + dy * range * M.rand(0.4, 1) + M.rand(-1, 1), color, 0.08, 0.03);
      }
      for (const h of hits.slice(0, 3)) {
        const e = h.e;
        // a guarding saber wielder can catch the lightning on the blade
        let blocked = false;
        if (e.isCharacterLike && e.hasSaber && e.hasSaber() && e.state === 'alive' && e.stun <= 0 && Math.random() < e.stats.skill * 0.9) {
          const sb = e.items().find((i) => i.isSaber && i.active && i.segs.length);
          if (sb) {
            const s = sb.segs[0], f = M.rand(0.4, 0.9);
            GP.FX.arc(ox, oy, M.lerp(s.x1, s.x2, f), M.lerp(s.y1, s.y2, f), color, 0.08, 0.035);
            e.intent.block = true; e.guardTarget = { x: ox, y: oy };
            blocked = true;
          }
        }
        if (blocked) continue;
        GP.FX.arc(ox, oy, h.b.x, h.b.y, color, 0.08, 0.035);
        if (Math.random() < 0.5) GP.FX.arc(ox, oy, h.b.x + M.rand(-0.3, 0.3), h.b.y + M.rand(-0.3, 0.3), '#e8e0ff', 0.06, 0.02);
        if (GP.Heat) GP.Heat.addHeat(h.b, 30 * dt);
        GP.Damage.hit(h.b, { type: 'electric', amount: 34 * str * dt, x: h.b.x, y: h.b.y, source: caster });
        h.b.applyImpulse(dx * 0.6 * str + M.rand(-0.3, 0.3), dy * 0.6 * str + M.rand(-0.5, 0), h.b.x, h.b.y);
        if (e.isCharacterLike) affectCharacter(e, 0.35);
        GP.FX.sparks(h.b.x, h.b.y, 0, -1, 1, '#d8ccff', 2);
      }
      GP.FX.frameLight(ox, oy, 3, color, 0.9);
      GP.Audio.play('lightning', { x: ox, y: oy });
    },

    /* ---------- character entry point ---------- */
    characterCast(c, power, tx, ty, held, dt) {
      game = c.game;
      const F = c.stats.force;
      if (!F || !F.powers.includes(power)) return false;
      const hand = c.parts.handB.part.severed ? c.parts.handF : c.parts.handB;
      const ox = hand.x, oy = hand.y;
      let dx = tx - ox, dy = ty - oy; const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
      const o = { strength: F.strength, range: F.range * 1.0, caster: c, color: c.team === 'sith' ? '#ffc8c8' : '#cfe6ff' };
      const now = game.time;
      const cd = cooldowns.get(c) || 0;
      switch (power) {
        case 'push': if (now < cd) return false; cooldowns.set(c, now + 0.9); api.push(ox, oy, dx, dy, Object.assign(o, { range: 7 * F.range })); return true;
        case 'pull': if (now < cd) return false; cooldowns.set(c, now + 0.9); api.pull(ox, oy, dx, dy, Object.assign(o, { range: 9 * F.range })); return true;
        case 'repulse': if (now < cd) return false; cooldowns.set(c, now + 2.5); api.repulse(c.parts.torso.x, c.parts.torso.y, Object.assign(o, { range: 5 * F.range })); return true;
        case 'lightning': api.lightning(c, ox, oy, tx, ty, dt, Object.assign(o, { range: 8 * F.range, color: '#b99cff' })); return true;
        case 'lift': {
          if (!api.isLifting(c)) {
            if (now < cd) return false;
            cooldowns.set(c, now + 0.8);
            // pick the entity nearest the aim point within range
            const range = 10 * F.range * rangeMul();
            let best = null, bd = 2.5;
            game.world.queryRadius(tx, ty, 2.5, (s) => {
              const b = s.body; if (b.type !== Phys.DYNAMIC || s.tag === 'blade' || b.entity === c || (b.entity && b.entity.holder === c)) return;
              if (Math.hypot(b.x - ox, b.y - oy) > range) return;
              const d = Math.hypot(b.x - tx, b.y - ty); if (d < bd) { bd = d; best = b; }
            });
            if (!best) return false;
            api.lift(c, best, best.x, best.y, o);
          }
          if (held) api.liftUpdate(c, tx, ty, dt);
          else api.release(c);
          return true;
        }
      }
      return false;
    },

    /* ---------- saber throw ---------- */
    saberThrow(c, saber, tx, ty) {
      c.unequip(saber.slot);
      saber.keepLit = true;
      saber.setActive(true, true);
      const b = saber.body;
      const dx = tx - b.x, dy = ty - b.y, l = Math.hypot(dx, dy) || 1;
      b.vx = dx / l * 17; b.vy = dy / l * 17; b.w = 24 * -c.facing;
      b.gravityScale = 0.15;
      saber.thrown = { by: c, t: 0 };
      saber.thrownBy = c;
      GP.Audio.play('forcePush', { x: b.x, y: b.y, vol: 0.3 });
    },
    updateThrownSaber(s, dt) {
      const th = s.thrown, b = s.body, c = th.by;
      th.t += dt;
      if (!c || c.removed || c.state === 'dead' || th.t > 4.5) { s.thrown = null; b.gravityScale = 1; s.keepLit = false; s.setActive(false); return; }
      if (th.t > 0.55) {
        const hand = c.parts.handF.part.severed ? c.parts.handB : c.parts.handF;
        const dx = hand.x - b.x, dy = hand.y - b.y, d = Math.hypot(dx, dy) || 1;
        const sp = 16;
        b.vx = M.lerp(b.vx, dx / d * sp, 0.12); b.vy = M.lerp(b.vy, dy / d * sp, 0.12);
        b.w = 24 * -c.facing;
        if (d < 0.7) {
          s.thrown = null; b.gravityScale = 1; s.keepLit = false;
          const slot = !c.equipment.handF && !c.parts.handF.part.severed ? 'handF' : !c.equipment.handB && !c.parts.handB.part.severed ? 'handB' : null;
          if (slot) c.equip(s, slot); else s.setActive(false);
        }
      }
    },

    update(g, dt) {
      game = g;
      // pulled weapons fly to the caster's free hand
      for (let i = pulled.length - 1; i >= 0; i--) {
        const p = pulled[i];
        p.t += dt;
        const it = p.item, c = p.caster;
        if (it.removed || c.removed || it.holder || c.state === 'dead' || p.t > 1.6) { pulled.splice(i, 1); continue; }
        const hand = c.parts.handB.part.severed ? c.parts.handF : c.parts.handB;
        const b = it.body;
        const dx = hand.x - b.x, dy = hand.y - b.y, d = Math.hypot(dx, dy) || 1;
        b.vx = M.lerp(b.vx, dx / d * 12, 0.15); b.vy = M.lerp(b.vy, dy / d * 12 - 1, 0.15);
        if (d < 0.8) {
          pulled.splice(i, 1);
          const slot = !c.equipment.handB && !c.parts.handB.part.severed ? 'handB' : !c.equipment.handF && !c.parts.handF.part.severed ? 'handF' : null;
          if (slot && !(c.mainItem() && c.mainItem().isSaber && it.isBlaster)) c.equip(it, slot);
        }
      }
      for (let i = suspended.length - 1; i >= 0; i--) {
        const s = suspended[i];
        if (!s.joint.world || s.body.removed) { suspended.splice(i, 1); continue; }
        if (Math.random() < dt * 4) GP.FX.spawn(GP.FX.K.GLOW, s.body.x + M.rand(-0.3, 0.3), s.body.y + M.rand(-0.3, 0.3), 0, -0.2, 0.6, 0.12, '#bcd8ff', { alpha: 0.3, size1: 0.25 });
      }
    },
    clear() {
      grips.clear(); suspended.length = 0; pulled.length = 0; cooldowns.clear();
    },
  };
  return api;
})();
