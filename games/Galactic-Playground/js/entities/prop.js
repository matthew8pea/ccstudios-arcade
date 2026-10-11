/* GALACTIC PLAYGROUND — configuration-driven props, lightsaber-sliced fragments and debris. */
'use strict';

(() => {
  const Phys = GP.Phys, M = GP.M, CAT = Phys.CAT;

  // Build physics shapes from a def shape list: {box:[w,h,x,y,a]} | {circle:[r,x,y]} | {poly:[...]} | {ngon:[r,n,x,y,rot]}
  GP.buildShapes = function (list, sx, sy, opts) {
    const out = [];
    for (const d of list) {
      const o = Object.assign({}, opts, d.opts || {});
      if (d.box) {
        const [w, h, x = 0, y = 0, a = 0] = d.box;
        const hw = w / 2, hh = h / 2, c = Math.cos(a), s = Math.sin(a);
        const pts = [];
        for (const [px, py] of [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]]) pts.push((x + c * px - s * py) * sx, (y + s * px + c * py) * sy);
        out.push(Phys.poly(pts, o));
      } else if (d.circle) {
        const [r, x = 0, y = 0] = d.circle;
        out.push(Phys.circle(r * Math.abs(sy), x * sx, y * sy, o));
      } else if (d.poly) {
        const p = d.poly.map((v, i) => (i % 2 === 0 ? v * sx : v * sy));
        out.push(Phys.poly(p, o));
      } else if (d.ngon) {
        const [r, n, x = 0, y = 0, rot = 0] = d.ngon;
        const p = [];
        for (let i = 0; i < n; i++) { const a = rot + i / n * Math.PI * 2; p.push((x + Math.cos(a) * r) * sx, (y + Math.sin(a) * r) * sy); }
        out.push(Phys.poly(p, o));
      }
    }
    return out;
  };

  class Prop extends GP.Entity {
    build(x, y, opts = {}) {
      const def = this.def;
      this.scale = opts.scale || this.scale || 1;
      this.facing = opts.facing || this.facing || 1;
      const b = new Phys.Body({ x, y, angle: opts.angle || 0, linearDamping: def.linearDamping, angularDamping: def.angularDamping });
      const shapes = GP.buildShapes(def.shapes, this.facing * this.scale, this.scale, {
        density: def.density || 150, friction: def.friction != null ? def.friction : 0.6, restitution: def.restitution != null ? def.restitution : 0.1,
        category: def.category === 'Structures' ? CAT.PROP : CAT.PROP, mask: CAT.ALL,
      });
      shapes.forEach((s) => b.addShape(s));
      b.finalize();
      this.addBody(b);
      if (def.frozen || opts.frozen) b.setFrozen(true);
      this.burning = 0;
      this.t = Math.random() * 10;
      if (def.seats && !this.occupants) { this.occupants = new Array(def.seats.length).fill(null); this.isSeat = true; }
      if (def.onImpact) this.onImpact = (body, dv, c, other) => def.onImpact(this, dv, c, other);
      if (def.onBuild) def.onBuild(this);
      // props that hang from a cable (lamps) get one anchored in the air above them
      if (def.hang && !opts.noLoadout && this.game.tools) {
        const top = b.originToWorld(0, -0.1 * this.scale);
        const j = new Phys.DistanceJoint(this.game.world.ground, b, top.x, top.y - def.hang, top.x, top.y, { mode: 'rope', length: def.hang, breakForce: 4000 });
        this.game.tools.addConstraint(j);
      }
      return this;
    }
    artScale() { return { sx: this.facing * this.scale, sy: this.scale }; }
    update(dt) {
      this.t += dt;
      if (this.burning > 0) {
        this.burning -= dt;
        const b = this.body;
        if (Math.random() < 0.6) GP.FX.fire(b.x + M.rand(-0.2, 0.2), b.y - 0.2, 2, 0.25);
        if (Math.random() < 0.1) GP.FX.smoke(b.x, b.y - 0.4, 1, 0.4, '#333');
        GP.FX.frameLight(b.x, b.y, 3, '#ff8a30', 0.6 + Math.random() * 0.3);
        if (this.burning <= 0) this.detonate();
      }
      if (this.def.update) this.def.update(this, dt);
    }
    draw(ctx, dt) {
      const b = this.body;
      if (!b) return;
      ctx.save();
      ctx.translate(b.x, b.y); ctx.rotate(b.a);
      ctx.save();
      ctx.translate(b.ox, b.oy);
      ctx.scale(this.facing * this.scale, this.scale);
      if (this.def.paint) this.def.paint(ctx, this);
      else if (this.def.art) GP.Draw.art(ctx, this.def.art);
      else { ctx.restore(); ctx.restore(); GP.Entity.prototype.draw.call(this, ctx); return; }
      ctx.restore();
      GP.Draw.decals(ctx, b, dt);
      ctx.restore();
      if (this.def.lights) {
        for (const l of this.def.lights) {
          const p = b.originToWorld(l.x * this.facing * this.scale, l.y * this.scale);
          GP.FX.frameLight(p.x, p.y, l.r * this.scale, l.c, l.i || 0.6);
        }
      }
    }
    damage(info) {
      if (this.def.volatile && !this.burning && (info.type === 'blaster' || info.type === 'explosive' || info.type === 'fire' || info.type === 'cut')) {
        if (info.type === 'explosive' && info.amount > 20) { this.burning = M.rand(0.05, 0.25); return info.amount; }
        this.volatileHits = (this.volatileHits || 0) + info.amount;
        if (this.volatileHits > (this.def.volatile.threshold || 25)) this.burning = this.def.volatile.fuse != null ? this.def.volatile.fuse : M.rand(1.2, 2.5);
      }
      return super.damage(info);
    }
    detonate() {
      if (this.removed) return;
      const b = this.body, v = this.def.volatile;
      const x = b.x, y = b.y;
      this.destroy();
      GP.Damage.explode(this.game, x, y, { radius: (v.radius || 4) * this.scale, damage: v.damage || 150, power: v.power || 16, kind: v.kind || 'fire', source: this });
    }
    onDestroyed(info) {
      if (this.def.onBreak) this.def.onBreak(this);
      if (this.def.volatile) { this.detonate(); return; }
      this.shatter(info);
    }
    shatter() {
      if (this.removed) return;
      const b = this.body;
      const mat = GP.mat(this.material);
      GP.FX.chunks(b.x, b.y, 14, mat.debris, 5, 0.08 * this.scale);
      GP.FX.dust(b.x, b.y, 6, mat.debris, 0.3);
      if (this.material === 'crystal' || this.def.glass) GP.Audio.play('glass', { x: b.x, y: b.y });
      else GP.Audio.play('impact', { x: b.x, y: b.y, strength: 1, mat: mat.sound });
      // break into a few physical pieces by slicing
      const pieces = GP.Slicer.shatter(this.game, this, b.x, b.y, 2);
      if (!pieces) this.destroy();
    }
    use() {
      if (this.def.onUse) { this.def.onUse(this); return true; }
      return false;
    }
    getProperties() {
      const list = super.getProperties();
      if (this.def.scalable !== false) {
        list.push({ key: 'scale', label: 'Scale', type: 'range', min: 0.3, max: 3, step: 0.05, get: () => this.scale, set: (v) => this.rescale(v), commit: true });
      }
      if (this.def.volatile) list.push({ key: 'ignite', label: 'Ignite', type: 'button', action: () => { this.burning = 1.5; } });
      if (this.def.props) list.unshift(...this.def.props(this));
      if (this.occupants && this.occupied()) list.unshift({ key: 'eject', label: 'Unseat riders', type: 'button', action: () => this.ejectAll() });
      return list;
    }
    rescale(s) {
      const b = this.body;
      const state = { x: b.originX(), y: b.originY(), a: b.a, frozen: b.frozen, vx: b.vx, vy: b.vy, w: b.w };
      const decals = b.decals;
      this.game.world.removeBody(b);
      this.bodies = [];
      this.build(state.x, state.y, { angle: state.a, scale: s, facing: this.facing });
      const nb = this.body;
      nb.vx = state.vx; nb.vy = state.vy; nb.w = state.w; nb.decals = decals;
      if (state.frozen) nb.setFrozen(true);
      this.restoreProps(Object.assign({}, this.props, { noCollide: this.props.noCollide }));
    }
    saveState() {
      return { burning: this.burning > 0 ? this.burning : 0, lamp: this.lampOn, powered: this.powered, interval: this.interval, running: this.running, text: this.text, flowRate: this.flowRate,
        occ: this.occupants ? this.occupants.map((o) => (o ? o.id : null)) : undefined };
    }
    loadState(s) {
      if (!s) return;
      if (s.burning) this.burning = s.burning;
      for (const k of ['lamp', 'powered', 'interval', 'running', 'text', 'flowRate']) if (s[k] != null) this[k === 'lamp' ? 'lampOn' : k] = s[k];
      if (s.occ) this.pendingOcc = s.occ;
    }
    resolve(map) {
      if (!this.pendingOcc) return;
      this.pendingOcc.forEach((id, i) => { const c = id && map.get(id); if (c && c.isCharacterLike && !c.vehicle && this.enter) this.enter(c, i); });
      this.pendingOcc = null;
    }
    onRemove() { if (this.occupants) for (const o of this.occupants.slice()) if (o && !o.removed) this.exit(o, false); }
    drawGlow(ctx) { if (this.def.glowPaint) this.def.glowPaint(ctx, this); }
  }
  GP.Registry.registerKind('prop', Prop);
  GP.Prop = Prop;

  /* ------------------------------------------------------------------ */
  /* Fragment: a sliced piece of a prop. Draws the source art clipped.   */
  class Fragment extends GP.Entity {
    constructor(game, def, opts) {
      super(game, def, opts);
      this.src = opts.src ? GP.Registry.get(opts.src) : null;
      this.srcId = opts.src;
      this.material = opts.material || (this.src && this.src.material) || 'metal';
      this.sx = opts.sx || 1; this.sy = opts.sy || 1;
      this.poly = opts.poly;
      this.cuts = opts.cuts || [];
      this.maxHp = opts.hp || 40; this.hp = this.maxHp;
      this.color = opts.color || (this.src && this.src.color) || '#8892a0';
      this.density = opts.density || (this.src && this.src.density) || 150;
      this.life = opts.life || 0;
    }
    build(x, y, opts = {}) {
      const b = new Phys.Body({ x, y, angle: opts.angle || 0 });
      b.addShape(Phys.poly(this.poly, { density: this.density, friction: 0.6, restitution: 0.1, category: CAT.PROP }));
      b.finalize();
      this.addBody(b);
      return this;
    }
    update(dt) {
      for (const c of this.cuts) c.t += dt;
      if (this.life > 0) { this.life -= dt; if (this.life <= 0) this.destroy(); }
    }
    draw(ctx, dt) {
      const b = this.body;
      ctx.save();
      ctx.translate(b.x, b.y); ctx.rotate(b.a);
      ctx.save();
      ctx.translate(b.ox, b.oy);
      const p = this.poly;
      ctx.beginPath(); ctx.moveTo(p[0], p[1]);
      for (let i = 2; i < p.length; i += 2) ctx.lineTo(p[i], p[i + 1]);
      ctx.closePath();
      ctx.save();
      ctx.clip();
      ctx.fillStyle = M.shade(this.color, -0.35);
      ctx.fill();
      if (this.src && (this.src.art || this.src.paint)) {
        ctx.save();
        ctx.scale(this.sx, this.sy);
        if (this.src.paint) this.src.paint(ctx, { t: 0, def: this.src, facing: 1, scale: 1, fragment: true });
        else GP.Draw.art(ctx, this.src.art);
        ctx.restore();
      }
      // glowing cut edges (kept inside the fragment outline)
      for (const c of this.cuts) {
        const heat = Math.max(0, 1 - c.t / 5);
        if (heat <= 0) continue;
        ctx.strokeStyle = M.rgba('#ffb040', heat); ctx.lineWidth = 0.05;
        ctx.beginPath(); ctx.moveTo(c.x1, c.y1); ctx.lineTo(c.x2, c.y2); ctx.stroke();
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = M.rgba('#ff6a10', heat * 0.5); ctx.lineWidth = 0.14;
        ctx.stroke();
        ctx.globalCompositeOperation = 'source-over';
      }
      ctx.restore();
      ctx.beginPath(); ctx.moveTo(p[0], p[1]);
      for (let i = 2; i < p.length; i += 2) ctx.lineTo(p[i], p[i + 1]);
      ctx.closePath();
      ctx.strokeStyle = GP.Draw.OUTLINE; ctx.lineWidth = 0.02; ctx.stroke();
      ctx.restore();
      GP.Draw.decals(ctx, b, dt);
      ctx.restore();
    }
    onDestroyed() {
      const b = this.body;
      GP.FX.chunks(b.x, b.y, 8, GP.mat(this.material).debris, 4, 0.06);
      if (!GP.Slicer.shatter(this.game, this, b.x, b.y, 1)) this.destroy();
    }
    saveState() { return { src: this.srcId, poly: this.poly, sx: this.sx, sy: this.sy, material: this.material, color: this.color, density: this.density }; }
  }
  GP.Registry.registerKind('fragment', Fragment);
  GP.Registry.register({ id: 'fragment', name: 'Fragment', kind: 'fragment', category: 'Props', hidden: true });

  /* ------------------------------------------------------------------ */
  /* Debris: short-lived chunks from explosions and destroyed machines.   */
  class Debris extends GP.Entity {
    build(x, y, opts = {}) {
      const s = opts.size || 0.1;
      const n = M.randInt(3, 6);
      const pts = [];
      for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2 + M.rand(-0.3, 0.3); const r = s * M.rand(0.6, 1.1); pts.push(Math.cos(a) * r, Math.sin(a) * r); }
      const b = new Phys.Body({ x, y, angle: M.rand(0, 6.28), linearDamping: 0.1 });
      b.addShape(Phys.poly(pts, { density: 300, friction: 0.7, restitution: 0.2, category: CAT.DEBRIS, mask: CAT.WORLD | CAT.PROP | CAT.VEHICLE }));
      b.finalize();
      this.addBody(b);
      this.life = opts.life || M.rand(5, 9);
      this.hot = opts.hot ? 1 : 0;
      this.color = opts.color || M.pick(['#3a3a3e', '#4a4640', '#2e2c2a', '#55504a']);
      this.game.debrisCount++;
      return this;
    }
    update(dt) {
      this.life -= dt;
      if (this.hot > 0) this.hot = Math.max(0, this.hot - dt * 0.3);
      if (this.life <= 0) this.destroy();
    }
    onRemove() { this.game.debrisCount--; }
    draw(ctx) {
      const b = this.body;
      ctx.globalAlpha = Math.min(1, this.life);
      GP.Draw.shapes(ctx, b, this.hot > 0 ? M.mix(this.color, '#ff8a30', this.hot * 0.8) : this.color, GP.Draw.OUTLINE, 0.015);
      if (this.hot > 0.2) GP.Draw.glow(ctx, b.x, b.y, 0.25, '#ff7a20', this.hot * 0.6);
      ctx.globalAlpha = 1;
    }
    serialize() { return null; } // transient
  }
  GP.Registry.registerKind('debris', Debris);
  GP.Registry.register({ id: 'debris_chunk', name: 'Debris', kind: 'debris', category: 'Props', hidden: true, material: 'metal' });

  /* ------------------------------------------------------------------ */
  /* Slicer: cuts single-polygon props/fragments along a line.          */
  GP.Slicer = {
    canSlice(e) {
      if (!e || e.removed || e.bodies.length !== 1) return false;
      if (!(e instanceof Prop || e instanceof Fragment)) return false;
      if (e.def.uncuttable || (e.def.material && GP.mat(e.def.material).cuttable === false)) return false;
      const b = e.body;
      return b.shapes.length === 1 && b.shapes[0].kind === 'poly';
    },
    // Slice entity `e` along the line through (px,py) with direction (dx,dy). Returns new fragments or null.
    slice(game, e, px, py, dx, dy, hot = true) {
      if (!this.canSlice(e)) return null;
      const b = e.body, s = b.shapes[0];
      const halves = Phys.splitPolygon(s.wv, px, py, dx, dy);
      if (!halves) return null;
      const minArea = 0.006;
      if (Phys.polyArea(halves[0]) < minArea || Phys.polyArea(halves[1]) < minArea) return null;
      if (!game.canSpawnBodies(1)) return null;
      const ox = b.originX(), oy = b.originY(), a = b.a, c = Math.cos(a), sn = Math.sin(a);
      const toAuth = (wx, wy) => { const rx = wx - ox, ry = wy - oy; return [c * rx + sn * ry, -sn * rx + c * ry]; };
      // cut line endpoints in authoring space (clip to bbox-ish)
      const L = 3;
      const cut1 = toAuth(px - dx * L, py - dy * L), cut2 = toAuth(px + dx * L, py + dy * L);
      const isFrag = e instanceof Fragment;
      const src = isFrag ? e.srcId : e.def.id;
      const sx = isFrag ? e.sx : e.facing * e.scale, sy = isFrag ? e.sy : e.scale;
      const color = isFrag ? e.color : e.def.color;
      const density = isFrag ? e.density : e.def.density;
      const totalArea = Phys.polyArea(s.wv);
      const hpShare = (e.maxHp === Infinity ? 80 : e.maxHp);
      const out = [];
      for (const half of halves) {
        const poly = [];
        for (let i = 0; i < half.length; i += 2) { const p = toAuth(half[i], half[i + 1]); poly.push(p[0], p[1]); }
        const cuts = (isFrag ? e.cuts.map((k) => Object.assign({}, k)) : []);
        if (hot) cuts.push({ x1: cut1[0], y1: cut1[1], x2: cut2[0], y2: cut2[1], t: 0 });
        const f = GP.Registry.create(game, 'fragment', { src, poly, sx, sy, cuts, material: e.material, color, density, hp: Math.max(15, hpShare * Phys.polyArea(half) / totalArea) });
        f.build(ox, oy, { angle: a });
        const nb = f.body;
        const v = b.velocityAt(nb.x, nb.y);
        nb.vx = v.x; nb.vy = v.y; nb.w = b.w;
        if (b.frozen) nb.setFrozen(true);
        nb.decals = b.decals ? b.decals.slice() : null;
        game.addEntity(f);
        out.push(f);
      }
      // push halves apart slightly
      const nx = -dy, ny = dx;
      const s0 = (out[0].body.x - px) * nx + (out[0].body.y - py) * ny > 0 ? 1 : -1;
      out[0].body.applyImpulse(nx * s0 * 0.4 * out[0].body.m, ny * s0 * 0.4 * out[0].body.m);
      out[1].body.applyImpulse(-nx * s0 * 0.4 * out[1].body.m, -ny * s0 * 0.4 * out[1].body.m);
      game.removeEntity(e);
      return out;
    },
    // Break an entity into a few pieces with random cuts (destruction)
    shatter(game, e, x, y, cuts) {
      let pieces = [e];
      for (let k = 0; k < cuts; k++) {
        const next = [];
        for (const p of pieces) {
          const a = M.rand(0, Math.PI);
          const b = p.body;
          const r = this.slice(game, p, b.x + M.rand(-0.05, 0.05), b.y + M.rand(-0.05, 0.05), Math.cos(a), Math.sin(a), false);
          if (r) { for (const f of r) { f.life = M.rand(8, 14); next.push(f); } } else next.push(p);
        }
        pieces = next;
      }
      if (pieces.length === 1 && pieces[0] === e) return null;
      for (const p of pieces) { p.maxHp = Infinity; p.hp = Infinity; if (!p.life) p.life = M.rand(8, 14); }
      return pieces;
    },
  };
})();
