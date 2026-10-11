/* GALACTIC PLAYGROUND — lightsabers.
 * A saber is a hilt body carrying one or more blade shapes. Blades are real collision shapes that
 * extend/retract. Contact rules (decided per contact in the physics pre-solve hook):
 *   blade vs blade             -> solid clash with sparks and sound
 *   blade vs cuttable object   -> contact disabled; the object is cut (damage, dismemberment, slicing)
 *   blade vs resistant object  -> solid (world geometry, beskar, electrostaffs) with sparks + burns
 * Blades also deflect blaster bolts (see projectiles.js).
 */
'use strict';

(() => {
  const Phys = GP.Phys, M = GP.M, CAT = Phys.CAT;

  GP.BLADE_COLORS = {
    blue: '#3a8bff', green: '#35e04a', red: '#ff2a2a', purple: '#b34dff', yellow: '#ffd62e',
    orange: '#ff8a1c', white: '#f4f7ff', cyan: '#3ae8ff', darksaber: '#f0f0f0',
  };

  const saberSet = new Set();

  class Lightsaber extends GP.Item {
    constructor(game, def, opts) {
      super(game, def, opts);
      this.isSaber = true;
      this.color = opts.color || def.color || '#3a8bff';
      this.active = false;
      this.ext = 0;
      this.lengthMul = 1;
      this.blades = [];
      this.segs = [];
      this.hum = null;
      this.guardAssist = 0;
      this.thrown = null;
      this.maxHp = Infinity; this.hp = Infinity;
      this.clashT = 0;
    }
    afterBuild(opts) {
      const b = this.body;
      for (const bd of this.def.blades) {
        const s = Phys.poly([0, -0.02, 0.02, -0.02, 0.02, 0.02, 0, 0.02], {
          density: 0, friction: 0.2, restitution: 0.1, category: CAT.BLADE,
          mask: CAT.WORLD | CAT.PROP | CAT.CHAR | CAT.BLADE | CAT.VEHICLE | CAT.ITEM, massless: true,
        });
        s.tag = 'blade';
        s.enabled = false;
        s.group = b.shapes[0].group;
        b.addShape(s);
        this.blades.push({ def: bd, shape: s, len: 0 });
      }
      b.rebuildMass();
      if (opts.active) { this.active = true; this.ext = 1; }
      saberSet.add(this);
      this.updateBladeShapes(true);
    }
    afterFlip() { this.updateBladeShapes(true); }
    bladeWidth() { return (this.def.bladeWidth || 0.055) * this.scale; }
    updateBladeShapes(force) {
      const b = this.body;
      const w = this.bladeWidth() / 2;
      for (const bl of this.blades) {
        const target = bl.def.len * this.scale * this.lengthMul * this.ext;
        if (!force && Math.abs(target - bl.len) < 1e-4) continue;
        bl.len = target;
        const s = bl.shape;
        if (target < 0.02) { s.enabled = false; continue; }
        s.enabled = true;
        const ang = (bl.def.a || 0) * this.flipY;
        const ca = Math.cos(ang), sa = Math.sin(ang);
        const x0 = (bl.def.x || 0) * this.scale, y0 = (bl.def.y || 0) * this.scale * this.flipY;
        const pts = [];
        for (const [px, py] of [[0, -w], [target, -w * 0.8], [target, w * 0.8], [0, w]]) {
          pts.push(x0 + ca * px - sa * py + b.ox, y0 + sa * px + ca * py + b.oy);
        }
        s.setVerts(pts);
        s.updateWorld(b);
      }
      let r = 0;
      for (const s of b.shapes) r = Math.max(r, s.radiusFrom(0, 0));
      b.radius = r;
    }
    setActive(on, silent) {
      if (on === this.active) return;
      this.active = on;
      const b = this.body;
      if (!silent) GP.Audio.play(on ? 'saberIgnite' : 'saberRetract', { x: b.x, y: b.y, pitch: this.def.pitch || 1 });
      b.wake();
    }
    use() { this.setActive(!this.active); return true; }

    update(dt) {
      super.update(dt);
      const target = this.active ? 1 : 0;
      if (this.ext !== target) {
        this.ext = M.approach(this.ext, target, dt * (this.active ? 5 : 6));
        this.updateBladeShapes(true);
      }
      this.clashT = Math.max(0, this.clashT - dt);
      // world segments for deflection and effects
      this.segs.length = 0;
      if (!this.hidden) {
        for (const bl of this.blades) {
          if (bl.len < 0.05) continue;
          const bd = bl.def;
          const base = this.pointWorld(bd.x || 0, bd.y || 0);
          const b = this.body;
          const a = b.a + (bd.a || 0) * this.flipY;
          this.segs.push({ x1: base.x, y1: base.y, x2: base.x + Math.cos(a) * bl.len, y2: base.y + Math.sin(a) * bl.len, saber: this, radius: this.bladeWidth() / 2 + this.guardAssist, len: bl.len });
        }
      }
      // unstable crossguard crackle
      if (this.def.unstable && this.segs.length && Math.random() < dt * 20) {
        const s = this.segs[0], f = Math.random();
        GP.FX.sparks(M.lerp(s.x1, s.x2, f), M.lerp(s.y1, s.y2, f), M.rand(-1, 1), M.rand(-1, 1), 1, this.color, 1.5);
      }
      if (this.thrown) GP.Force.updateThrownSaber(this, dt);
      if (!this.active && this.ext === 0 && this.thrown) this.thrown = null;
    }
    tipSpeed() {
      const s = this.segs[0];
      if (!s) return 0;
      const v = this.body.velocityAt(s.x2, s.y2);
      return Math.hypot(v.x, v.y);
    }
    onDetach(c) {
      if (!this.thrown && this.active && !(c && c.playerControlled && this.keepLit)) this.setActive(false);
    }
    onRemove() { saberSet.delete(this); if (this.hum) { this.hum.stop(); this.hum = null; } }
    hideWithHolder(h) {
      super.hideWithHolder(h);
      if (h) { this.segs.length = 0; if (this.hum) { this.hum.stop(); this.hum = null; } }
    }

    paint(ctx) {
      const d = this.def;
      if (d.art) { GP.Draw.art(ctx, d.art); return; }
      // generic hilt: grip + emitter
      const L = d.hiltLen || 0.28;
      GP.Draw.roundRect(ctx, -L / 2, -0.028, L, 0.056, 0.012);
      ctx.fillStyle = d.hiltColor || '#b8bec8'; ctx.fill(); ctx.strokeStyle = GP.Draw.OUTLINE; ctx.lineWidth = 0.015; ctx.stroke();
      ctx.fillStyle = d.gripColor || '#2a2c30';
      for (let i = 0; i < 4; i++) ctx.fillRect(-L / 2 + 0.03 + i * 0.035, -0.03, 0.018, 0.06);
      ctx.fillStyle = d.accent || '#5a5e66';
      ctx.fillRect(L / 2 - 0.05, -0.035, 0.05, 0.07);
    }
    drawGlow(ctx) {
      if (this.hidden) return;
      const w = this.bladeWidth();
      const glow = GP.Settings.g.glow;
      for (const s of this.segs) GP.FX.frameLight((s.x1 + s.x2) / 2, (s.y1 + s.y2) / 2, 2.4 + s.len * 1.5, this.color, 0.75);
      for (const s of this.segs) {
        const flick = this.def.unstable ? M.rand(0.8, 1.2) : M.rand(0.96, 1.04);
        ctx.lineCap = 'round';
        const dark = this.def.dark;
        if (glow) {
          ctx.globalCompositeOperation = 'lighter';
          ctx.strokeStyle = this.color;
          ctx.globalAlpha = 0.16 * flick; ctx.lineWidth = w * 7;
          ctx.beginPath(); ctx.moveTo(s.x1, s.y1); ctx.lineTo(s.x2, s.y2); ctx.stroke();
          ctx.globalAlpha = 0.35 * flick; ctx.lineWidth = w * 3.6; ctx.stroke();
          ctx.globalAlpha = 0.8; ctx.lineWidth = w * 1.8; ctx.stroke();
          ctx.globalCompositeOperation = 'source-over';
        }
        ctx.globalAlpha = 1;
        ctx.strokeStyle = dark ? '#050608' : '#ffffff';
        ctx.lineWidth = w * (dark ? 1.3 : 0.95);
        ctx.beginPath(); ctx.moveTo(s.x1, s.y1); ctx.lineTo(s.x2, s.y2); ctx.stroke();
        if (this.def.unstable) {
          ctx.strokeStyle = this.color; ctx.lineWidth = w * 0.4; ctx.globalAlpha = 0.8;
          ctx.beginPath();
          for (let i = 0; i <= 8; i++) { const f = i / 8; ctx.lineTo(M.lerp(s.x1, s.x2, f) + M.rand(-0.015, 0.015), M.lerp(s.y1, s.y2, f) + M.rand(-0.015, 0.015)); }
          ctx.stroke(); ctx.globalAlpha = 1;
        }
      }
      // motion trail when swung fast
      const sp = this.tipSpeed();
      if (sp > 7 && this.segs.length && glow) {
        const b = this.body;
        ctx.globalCompositeOperation = 'lighter';
        for (const s of this.segs) {
          const v1 = b.velocityAt(s.x2, s.y2), v0 = b.velocityAt(s.x1, s.y1);
          const k = 0.022;
          ctx.fillStyle = M.rgba(this.color, M.clamp((sp - 7) / 25, 0, 0.35));
          ctx.beginPath();
          ctx.moveTo(s.x1, s.y1); ctx.lineTo(s.x2, s.y2);
          ctx.lineTo(s.x2 - v1.x * k, s.y2 - v1.y * k); ctx.lineTo(s.x1 - v0.x * k, s.y1 - v0.y * k);
          ctx.closePath(); ctx.fill();
        }
        ctx.globalCompositeOperation = 'source-over';
      }
    }

    getProperties() {
      const l = super.getProperties().filter((p) => p.key !== 'hp' && p.key !== 'repair');
      l.unshift(
        { key: 'active', label: 'Blade ignited', type: 'bool', get: () => this.active, set: (v) => this.setActive(v) },
        { key: 'color', label: 'Blade color', type: 'swatch', options: Object.entries(GP.BLADE_COLORS).filter(([k]) => k !== 'darksaber'), get: () => this.color, set: (v) => { this.color = v; } },
        { key: 'len', label: 'Blade length', type: 'range', min: 0.3, max: 2.2, step: 0.05, get: () => this.lengthMul, set: (v) => { this.lengthMul = v; this.updateBladeShapes(true); } },
      );
      return l;
    }
    saveState() { return { flipY: this.flipY, color: this.color, active: this.active, len: this.lengthMul }; }
    loadState(s) {
      if (!s) return;
      if (s.color) this.color = s.color;
      if (s.len) this.lengthMul = s.len;
      this.active = !!s.active; this.ext = this.active ? 1 : 0;
      this.updateBladeShapes(true);
    }
  }
  GP.Registry.registerKind('saber', Lightsaber);
  GP.Lightsaber = Lightsaber;

  /* ---------------------------------------------------------------- */
  /* Saber interaction manager                                         */
  const cuts = new Map();   // key -> {saber, body, x, y, n}
  const clashes = [];
  const parries = new Map(); // saber:victim -> {rolled, until}

  function isResistant(shape) {
    if (shape.tag === 'saberproof' || shape.tag === 'shield') return true;
    const b = shape.body, e = b.entity;
    if (b.type === Phys.STATIC && !e) return true;
    if (e && e.def && (e.def.saberproof || GP.mat(e.material).cuttable === false)) return true;
    if (e && e.saberproofPart && e.saberproofPart(shape)) return true;
    return false;
  }

  GP.Sabers = {
    all: saberSet,
    preSolve(c) {
      const aBlade = c.sA.tag === 'blade', bBlade = c.sB.tag === 'blade';
      if (!aBlade && !bBlade) return;
      const bladeShape = aBlade ? c.sA : c.sB, other = aBlade ? c.sB : c.sA;
      const saber = bladeShape.body.entity;
      if (!saber || !saber.active) { c.enabled = false; return; }
      const p = c.pts[0];
      if (aBlade && bBlade) {
        clashes.push({ x: p.x, y: p.y, a: saber, b: other.body.entity, nx: c.nx, ny: c.ny });
        return; // solid
      }
      if (isResistant(other)) {
        if (Math.random() < 0.25) clashes.push({ x: p.x, y: p.y, a: saber, b: null, nx: c.nx, ny: c.ny, scrape: true, body: other.body });
        // map structures stay solid to the blade but it burns its way through them
        if (other.body.structure) { const key = saber.id + ':' + other.body.id; if (!cuts.has(key)) cuts.set(key, { saber, body: other.body, shape: other, x: p.x, y: p.y }); }
        return; // solid
      }
      c.enabled = false;
      const key = saber.id + ':' + other.body.id;
      if (!cuts.has(key)) cuts.set(key, { saber, body: other.body, shape: other, x: p.x, y: p.y });
    },
    process(game, dt) {
      // clashes
      for (const cl of clashes) {
        const s = cl.a;
        if (cl.scrape) {
          if (Math.random() < 0.5) GP.FX.sparks(cl.x, cl.y, -cl.nx, -cl.ny, 3, '#ffcf8a', 3);
          if (cl.body && cl.body.type === Phys.STATIC && Math.random() < 0.3) GP.Decals.add(cl.x, cl.y, 0.04, 'burn', s.color);
          GP.FX.frameLight(cl.x, cl.y, 1, '#ffb060', 0.5);
          continue;
        }
        if (s.clashT > 0) continue;
        s.clashT = 0.12;
        if (cl.b) cl.b.clashT = 0.12;
        GP.FX.glow(cl.x, cl.y, 0.5, '#ffffff', 0.1);
        GP.FX.sparks(cl.x, cl.y, cl.nx, cl.ny, 10, '#fff4d0', 6, Math.PI);
        GP.FX.sparks(cl.x, cl.y, cl.nx, cl.ny, 6, s.color, 5, Math.PI);
        if (cl.b && cl.b.color) GP.FX.sparks(cl.x, cl.y, -cl.nx, -cl.ny, 6, cl.b.color, 5, Math.PI);
        GP.FX.light(cl.x, cl.y, 3.5, '#ffffff', 1.2, 0.12);
        GP.Audio.play('saberClash', { x: cl.x, y: cl.y });
        GP.Events.emit('saber:clash', { x: cl.x, y: cl.y });
      }
      clashes.length = 0;
      // cuts
      for (const ct of cuts.values()) {
        const { saber, body } = ct;
        if (body.removed || saber.removed) continue;
        const e = body.entity;
        const vb = saber.body.velocityAt(ct.x, ct.y), vo = body.velocityAt(ct.x, ct.y);
        const speed = Math.hypot(vb.x - vo.x, vb.y - vo.y);
        const seg = saber.segs[0];
        let dx = 1, dy = 0;
        if (seg) { dx = seg.x2 - seg.x1; dy = seg.y2 - seg.y1; const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l; }
        // project cut point onto the blade line for accuracy
        if (seg) { const cp = M.closestOnSegment(ct.x, ct.y, seg.x1, seg.y1, seg.x2, seg.y2); ct.x = cp.x; ct.y = cp.y; }
        GP.FX.sparks(ct.x, ct.y, -vb.x + vo.x, -vb.y + vo.y, 2, '#ffb050', 3);
        if (Math.random() < 0.3) GP.FX.smoke(ct.x, ct.y, 1, 0.08, '#666', -0.5, 0.2, 0.8);
        GP.FX.frameLight(ct.x, ct.y, 1.2, '#ff9a40', 0.6);
        if (!e && body.structure) {
          if (Math.random() < 0.3) GP.Decals.add(ct.x, ct.y, 0.04, 'burn', saber.color);
          GP.Audio.play('saberSizzle', { x: ct.x, y: ct.y });
          GP.Damage.hit(body, { type: 'cut', amount: dt * (saber.def.dps || 260) + Math.max(0, speed - 1) * 7, x: ct.x, y: ct.y, source: saber.holder || saber.thrownBy || saber });
          continue;
        }
        if (GP.Heat) GP.Heat.addHeat(body, 14);
        GP.Audio.play('saberSizzle', { x: ct.x, y: ct.y });
        if (!e) continue;
        const cutAmt = dt * (saber.def.dps || 260) + Math.max(0, speed - 1) * 7;
        const src = saber.holder || saber.thrownBy || saber;
        // trained wielders don't carve up their allies (the blade is pulled away)
        if (src.isCharacterLike && e.isCharacterLike && e !== src && !GP.Teams.hostile(src.team, e.team) && src.state === 'alive') continue;
        if (GP.Slicer.canSlice(e)) {
          if ((e.cutImmune || 0) > game.time) continue;
          if (speed > 2.2 || (e.cutProgress = (e.cutProgress || 0) + cutAmt) > 60) {
            const frags = GP.Slicer.slice(game, e, ct.x, ct.y, dx, dy, true);
            if (frags) { for (const f of frags) f.cutImmune = game.time + 0.2; GP.Events.emit('saber:slice', { x: ct.x, y: ct.y }); }
            else e.damage({ type: 'cut', amount: cutAmt, x: ct.x, y: ct.y, body, source: src });
          } else body.addDecal('cut', ct.x, ct.y, 0.03, saber.color);
          continue;
        }
        let amt = cutAmt;
        if (e.isCharacterLike) {
          if (this.tryParry(game, saber, e, ct)) continue;
          amt = dt * 110 + Math.max(0, speed - 1.5) * 6; // a resting blade burns; a swung blade maims
        }
        GP.Damage.hit(body, { type: 'cut', amount: amt, x: ct.x, y: ct.y, speed, source: src, color: saber.color, dirx: dx, diry: dy, shape: ct.shape });
      }
      cuts.clear();
    },
    // Skilled defenders holding a blade (or saber-resistant staff) can turn a hit into a parry.
    tryParry(game, saber, victim, ct) {
      const now = game.time;
      const key = saber.id + ':' + victim.id;
      const rec = parries.get(key);
      if (rec && now < rec.until) return true;
      if (rec && now - rec.rolled < 0.15) return false;
      if (victim.state !== 'alive' || victim.stun > 0 || !victim.items) { parries.set(key, { rolled: now, until: 0 }); return false; }
      const guard = victim.items().find((i) => (i.isSaber && i.active && i.segs.length) || (i.isMelee && i.def.saberproof));
      if (!guard) { parries.set(key, { rolled: now, until: 0 }); return false; }
      const vp = victim.position();
      const facing = Math.sign(ct.x - vp.x) === victim.facing || Math.abs(ct.x - vp.x) < 0.2;
      let chance = victim.stats.skill * (victim.stats.force ? 1 : 0.65) * (facing ? 1 : 0.25) * victim.balance;
      if (saber.holder && saber.holder.stats) chance *= 1.15 - saber.holder.stats.skill * 0.35;
      chance = GP.M.clamp(chance, 0, 0.9);
      if (Math.random() > chance) { parries.set(key, { rolled: now, until: 0 }); return false; }
      parries.set(key, { rolled: now, until: now + 0.45 });
      // make the parry physical and visible: blades meet, both recoil
      let px = ct.x, py = ct.y;
      if (guard.segs && guard.segs[0]) { const s = guard.segs[0]; px = (s.x1 + s.x2) / 2 * 0.5 + ct.x * 0.5; py = (s.y1 + s.y2) / 2 * 0.5 + ct.y * 0.5; }
      const dx = saber.body.x - vp.x, dy = saber.body.y - vp.y, l = Math.hypot(dx, dy) || 1;
      saber.body.applyImpulse(dx / l * 6, dy / l * 6 - 1, px, py);
      guard.body.applyImpulse(-dx / l * 3, -dy / l * 3, px, py);
      if (saber.holder && saber.holder.parts) saber.holder.parts.torso.applyImpulse(dx / l * 40, 0);
      victim.guardTarget = { x: px, y: py };
      if (victim.brain) victim.brain.parryT = 0.35;
      clashes.push({ x: px, y: py, a: saber, b: guard, nx: dx / l, ny: dy / l });
      GP.Events.emit('saber:parry', { x: px, y: py, victim });
      return true;
    },
    activeBlades() {
      const out = [];
      for (const s of saberSet) for (const seg of s.segs) out.push(seg);
      return out;
    },
    // Keep a small number of hum voices on the sabers nearest the camera
    updateAudio(cam) {
      const cands = [];
      for (const s of saberSet) {
        if (s.segs.length && !s.hidden) cands.push({ s, d: Math.hypot(s.body.x - cam.x, s.body.y - cam.y) });
        else if (s.hum) { s.hum.stop(); s.hum = null; }
      }
      cands.sort((a, b) => a.d - b.d);
      cands.forEach((c, i) => {
        const s = c.s;
        if (i < 5) {
          if (!s.hum) s.hum = GP.Audio.loop('saber', { pitch: s.def.pitch || 1 });
          if (s.hum) {
            const sp = s.tipSpeed();
            const f = M.clamp(sp / 22, 0, 1);
            s.hum.set((0.12 + f * 0.45) * s.ext, 1 + f * 0.45, s.body.x, s.body.y);
          }
        } else if (s.hum) { s.hum.stop(); s.hum = null; }
      });
    },
    clear() { cuts.clear(); clashes.length = 0; parries.clear(); },
  };
})();
