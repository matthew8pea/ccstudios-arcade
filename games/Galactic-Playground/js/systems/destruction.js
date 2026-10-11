/* GALACTIC PLAYGROUND — breakable map structures.
 * Catwalks, ramps, platforms, steps, walls and buildings are static terrain pieces that a map marks
 * as structures (H.piece(..., { structure: true })). Ground, cliffs and the map's outer frame are not.
 * Each structure is divided into cells of about a meter, laid out along its longest edge. Blaster
 * bolts, sabers, explosions and heavy crashes wear down the cell they hit; a worn-out cell is carved
 * out. The piece is replaced by the convex remnants around the hole (they stay where they are) and
 * the carved cell falls away as rubble painted in the structure's own style.
 */
'use strict';

GP.Destruction = (() => {
  const M = GP.M, Phys = GP.Phys, CAT = Phys.CAT;
  const CELL = 1.0;             // target cell size (m)
  const KEEP = 0.03;            // remnants smaller than this (m²) fall away as rubble
  const DUST = 0.008;           // ... and slivers smaller than this just vanish
  // how much of each kind of damage reaches a structure
  const TAKE = { blaster: 1, cut: 1, explosive: 1.2, impact: 1, crush: 1, stab: 0.3, fire: 0.25, acid: 0.5, electric: 0.1, ion: 0.15, cold: 0 };

  // hit points per square meter of a cell, from the look of the piece (a style may set its own)
  function toughness(T) {
    if (T.toughness) return T.toughness;
    return { grate: 200, panels: 240, bricks: 210, marble: 260, strata: 320, ice: 90 }[T.pattern] || 160;
  }
  function material(T) {
    if (T.material) return T.material;
    return T.pattern === 'panels' || T.pattern === 'grate' || T.pattern === 'hazard' ? 'metal' : T.pattern === 'ice' ? 'crystal' : 'stone';
  }

  /* ---------------------------------------------------------------- polygon helpers (flat verts) */
  // keep the part of a convex polygon where nx*x + ny*y <= d
  function clip(v, nx, ny, d) {
    if (!v) return null;
    const out = [], n = v.length / 2;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const ax = v[i * 2], ay = v[i * 2 + 1], bx = v[j * 2], by = v[j * 2 + 1];
      const da = ax * nx + ay * ny - d, db = bx * nx + by * ny - d;
      if (da <= 0) out.push(ax, ay);
      if ((da < 0 && db > 0) || (da > 0 && db < 0)) { const t = da / (da - db); out.push(ax + (bx - ax) * t, ay + (by - ay) * t); }
    }
    return tidy(out);
  }
  // drop repeated points; null if nothing with area is left
  function tidy(v) {
    const out = [];
    for (let i = 0; i < v.length; i += 2) {
      const px = out.length ? out[out.length - 2] : NaN, py = out.length ? out[out.length - 1] : NaN;
      if (Math.abs(v[i] - px) < 1e-5 && Math.abs(v[i + 1] - py) < 1e-5) continue;
      out.push(v[i], v[i + 1]);
    }
    while (out.length >= 4 && Math.abs(out[0] - out[out.length - 2]) < 1e-5 && Math.abs(out[1] - out[out.length - 1]) < 1e-5) out.length -= 2;
    return out.length >= 6 && Phys.polyArea(out) > 1e-6 ? out : null;
  }
  const area = (v) => (v ? Phys.polyArea(v) : 0);
  function centroid(v) {
    let a = 0, cx = 0, cy = 0;
    const n = v.length / 2;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n, k = v[i * 2] * v[j * 2 + 1] - v[j * 2] * v[i * 2 + 1];
      a += k; cx += (v[i * 2] + v[j * 2]) * k; cy += (v[i * 2 + 1] + v[j * 2 + 1]) * k;
    }
    return Math.abs(a) < 1e-9 ? { x: v[0], y: v[1] } : { x: cx / (3 * a), y: cy / (3 * a) };
  }
  function box(v) {
    const r = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
    for (let i = 0; i < v.length; i += 2) { r.minX = Math.min(r.minX, v[i]); r.maxX = Math.max(r.maxX, v[i]); r.minY = Math.min(r.minY, v[i + 1]); r.maxY = Math.max(r.maxY, v[i + 1]); }
    return r;
  }

  /* ---------------------------------------------------------------- structures */
  // Called for each map piece marked as a structure, right after it is built.
  function add(game, b) {
    const s = b.shapes[0];
    if (!s || s.kind !== 'poly' || s.sensor || b.type !== Phys.STATIC) return;
    const v = s.wv.slice();
    // lay the cells out along the longest edge
    let best = 0, ux = 1, uy = 0;
    for (let i = 0; i < v.length; i += 2) {
      const j = (i + 2) % v.length, ex = v[j] - v[i], ey = v[j + 1] - v[i + 1], l = Math.hypot(ex, ey);
      if (l > best) { best = l; ux = ex / l; uy = ey / l; }
    }
    if (ux < -1e-6 || (Math.abs(ux) < 1e-6 && uy < 0)) { ux = -ux; uy = -uy; }
    const vx = -uy, vy = ux;
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (let i = 0; i < v.length; i += 2) {
      const u = v[i] * ux + v[i + 1] * uy, w = v[i] * vx + v[i + 1] * vy;
      u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, w); v1 = Math.max(v1, w);
    }
    const nu = Math.max(1, Math.round((u1 - u0) / CELL)), nv = Math.max(1, Math.round((v1 - v0) / CELL));
    const list = game.structures || (game.structures = []);
    const g = {
      id: list.length, game, T: b.terrain, bounds: box(v),
      ux, uy, vx, vy, u0, v0, nu, nv, cu: (u1 - u0) / nu, cv: (v1 - v0) / nv,
      opts: { friction: s.friction, surfaceSpeed: s.surfaceSpeed || 0, tag: s.tag },
      bodies: new Set([b]), cells: new Map(), gone: new Set(), changed: false,
    };
    b.structure = g;
    list.push(g);
  }

  function cellAt(g, x, y) {
    const i = M.clamp(Math.floor((x * g.ux + y * g.uy - g.u0) / g.cu), 0, g.nu - 1);
    const j = M.clamp(Math.floor((x * g.vx + y * g.vy - g.v0) / g.cv), 0, g.nv - 1);
    return [i, j];
  }
  // the part of polygon v inside cell (i, j), and the parts around it
  function cut(g, v, i, j) {
    const UA = g.u0 + i * g.cu, UB = UA + g.cu, VA = g.v0 + j * g.cv, VB = VA + g.cv;
    const mid = clip(clip(v, -g.ux, -g.uy, -UA), g.ux, g.uy, UB);
    return {
      inside: clip(clip(mid, -g.vx, -g.vy, -VA), g.vx, g.vy, VB),
      around: [clip(v, g.ux, g.uy, UA), clip(v, -g.ux, -g.uy, -UB), clip(mid, g.vx, g.vy, VA), clip(mid, -g.vx, -g.vy, -VB)],
    };
  }
  function cellHp(g, i, j) {
    let a = 0;
    for (const b of g.bodies) if (!b.removed) a += area(cut(g, b.shapes[0].wv, i, j).inside);
    return a > DUST ? Math.max(40, a * toughness(g.T)) : 0;
  }

  // Wear down one cell; carve it out once it has taken its fill.
  function wear(g, i, j, amount, push) {
    const key = i + ',' + j;
    if (!(amount > 0) || g.gone.has(key)) return false;
    let c = g.cells.get(key);
    if (!c) {
      const hp = cellHp(g, i, j);
      if (!hp) { g.gone.add(key); return false; }
      c = { hp, dmg: 0 };
      g.cells.set(key, c);
    }
    c.dmg += amount;
    if (c.dmg < c.hp) return false;
    carve(g, i, j, push);
    return true;
  }

  // push: {x, y, radius, power} of an explosion that throws the pieces
  function carve(g, i, j, push) {
    const game = g.game, world = game.world, H = GP.Maps.helpers;
    g.gone.add(i + ',' + j); g.cells.delete(i + ',' + j); g.changed = true;
    let hole = null;
    for (const b of Array.from(g.bodies)) {
      if (b.removed) { g.bodies.delete(b); continue; }
      const v = b.shapes[0].wv.slice();
      const parts = cut(g, v, i, j);
      if (area(parts.inside) < 1e-4) continue;
      // anything resting on the piece has to notice it is gone
      const bb = box(v);
      world.wakeTouching(b);
      world.queryAABB(bb.minX - 0.3, bb.minY - 1, bb.maxX + 0.3, bb.maxY + 0.3, (s) => { if (s.body.type === Phys.DYNAMIC) s.body.wake(); });
      world.removeBody(b);
      g.bodies.delete(b);
      for (const r of parts.around) {
        const a = area(r);
        if (a >= KEEP) { const nb = H.piece(game, r, g.T, g.opts); nb.structure = g; g.bodies.add(nb); }
        else if (a >= DUST) rubble(game, g, r, push);
      }
      if (area(parts.inside) >= DUST) { rubble(game, g, parts.inside, push); GP.Decals.clearIn(box(parts.inside)); }
      hole = hole ? { minX: Math.min(hole.minX, bb.minX), minY: Math.min(hole.minY, bb.minY), maxX: Math.max(hole.maxX, bb.maxX), maxY: Math.max(hole.maxY, bb.maxY) } : bb;
    }
    if (!hole) return;
    world.staticDirty = true;
    if (GP.Terrain && GP.Terrain.invalidate) GP.Terrain.invalidate(game, hole);
    const c = cut(g, [hole.minX, hole.minY, hole.maxX, hole.minY, hole.maxX, hole.maxY, hole.minX, hole.maxY], i, j).inside;
    const p = c ? centroid(c) : { x: (hole.minX + hole.maxX) / 2, y: (hole.minY + hole.maxY) / 2 };
    const mat = GP.mat(material(g.T));
    GP.FX.chunks(p.x, p.y, 10, mat.debris, 5, 0.07);
    GP.FX.dust(p.x, p.y, 6, g.T.fill || mat.debris, 0.35);
    GP.Audio.play('impact', { x: p.x, y: p.y, strength: 1, mat: mat.sound });
    game.touched = true;
    GP.Events.emit('structure:broken', { x: p.x, y: p.y });
  }

  // A carved-out cell (split in two if it is big) falls away as rubble.
  function rubble(game, g, v, push) {
    const pieces = [];
    if (area(v) > 0.5) {
      const c = centroid(v), a = M.rand(0, Math.PI), nx = Math.cos(a), ny = Math.sin(a), d = c.x * nx + c.y * ny;
      const A = clip(v, nx, ny, d), B = clip(v, -nx, -ny, -d);
      if (A && B) pieces.push(A, B); else pieces.push(v);
    } else pieces.push(v);
    for (const p0 of pieces) {
      if (!game.canSpawnBodies(1)) return;
      const c = centroid(p0);
      // a hair smaller than the hole, so it drops out instead of wedging between the edges it broke from
      const p = [];
      for (let k = 0; k < p0.length; k += 2) {
        const dx = c.x - p0[k], dy = c.y - p0[k + 1], l = Math.hypot(dx, dy) || 1, m = Math.min(0.04, l * 0.3) / l;
        p.push(p0[k] + dx * m, p0[k + 1] + dy * m);
      }
      const e = GP.Registry.create(game, 'rubble', { T: g.T, poly: p, ox: c.x, oy: c.y, material: material(g.T) });
      e.build(c.x, c.y);
      game.addEntity(e);
      const b = e.body;
      b.vx = M.rand(-0.6, 0.6); b.vy = M.rand(0, 0.6); b.w = M.rand(-1.5, 1.5);
      if (push) {
        let dx = c.x - push.x, dy = c.y - push.y;
        const d = Math.hypot(dx, dy) || 1, sp = push.power * 0.6 * Math.max(0.2, 1 - d / push.radius);
        dx /= d; dy = dy / d - 0.35;
        b.vx += dx * sp; b.vy += dy * sp; b.w += M.rand(-6, 6);
      }
    }
  }

  /* ---------------------------------------------------------------- damage */
  // A hit on one structure piece (from GP.Damage.hit). Returns the damage it took.
  function hit(body, info) {
    const g = body.structure;
    if (!g || body.removed || !body.shapes[0]) return 0;
    const amount = (info.amount || 0) * (TAKE[info.type] != null ? TAKE[info.type] : 0.5) * (GP.Settings.play.fragility || 1);
    if (!(amount > 0)) return 0;
    // a point on the surface can sit on the edge of a cell that is already gone: look just inside
    let x = info.x != null ? info.x : body.x, y = info.y != null ? info.y : body.y;
    const dx = body.x - x, dy = body.y - y, l = Math.hypot(dx, dy);
    if (l > 1e-6) { x += dx / l * Math.min(0.05, l); y += dy / l * Math.min(0.05, l); }
    const [i, j] = cellAt(g, x, y);
    wear(g, i, j, amount);
    return amount;
  }

  // Explosions wear down every cell in reach.
  function blast(game, x, y, radius, damage, kind, power) {
    if (!game.structures || kind === 'ion' || kind === 'cryo') return;
    const k = TAKE.explosive * (kind === 'seismic' ? 1.5 : 1) * (GP.Settings.play.fragility || 1);
    for (const g of game.structures) {
      const bb = g.bounds;
      if (x < bb.minX - radius || x > bb.maxX + radius || y < bb.minY - radius || y > bb.maxY + radius) continue;
      const pu = x * g.ux + y * g.uy - g.u0, pv = x * g.vx + y * g.vy - g.v0;
      const hits = [];
      for (let i = 0; i < g.nu; i++) for (let j = 0; j < g.nv; j++) {
        const du = Math.max(i * g.cu - pu, 0, pu - (i + 1) * g.cu), dv = Math.max(j * g.cv - pv, 0, pv - (j + 1) * g.cv);
        const d = Math.hypot(du, dv);
        if (d < radius) hits.push([i, j, damage * (1 - d / radius) * k]);
      }
      const push = { x, y, radius, power: power != null ? power : 14 };
      for (const [i, j, a] of hits) wear(g, i, j, a, push);
    }
  }

  // Something heavy slamming into a structure (from GP.Damage.processContacts).
  function impact(sBody, c, other) {
    if (other.type !== Phys.DYNAMIC) return;
    const dv = c.impulse / 120;   // as if the structure were a 120 kg object: people and crates landing do nothing
    if (dv < 9) return;
    const p = c.pts[0];
    const src = other.entity;
    hit(sBody, { type: 'impact', amount: (dv - 9) * 6, x: p.x, y: p.y, source: src && src.holder ? src.holder : src });
  }

  /* ---------------------------------------------------------------- saving */
  const round = (v) => v.map((n) => Math.round(n * 1000) / 1000);
  function serialize(game) {
    const out = [];
    for (const g of game.structures || []) {
      if (!g.changed) continue;
      out.push({ i: g.id, polys: Array.from(g.bodies).filter((b) => !b.removed).map((b) => round(b.shapes[0].wv)), gone: Array.from(g.gone), cells: Array.from(g.cells, ([k, c]) => [k, Math.round(c.dmg)]) });
    }
    return out.length ? out : null;
  }
  // after the map is rebuilt: put each changed structure back the way it was saved
  function load(game, list) {
    const H = GP.Maps.helpers;
    for (const rec of list || []) {
      const g = game.structures && game.structures[rec.i];
      if (!g) continue;
      for (const b of g.bodies) game.world.removeBody(b);
      g.bodies.clear();
      for (const v of rec.polys || []) { const nb = H.piece(game, v, g.T, g.opts); nb.structure = g; g.bodies.add(nb); }
      g.gone = new Set(rec.gone || []);
      g.cells = new Map();
      for (const [k, dmg] of rec.cells || []) { const [i, j] = k.split(',').map(Number); const hp = cellHp(g, i, j); if (hp) g.cells.set(k, { hp, dmg }); }
      g.changed = true;
    }
    game.world.staticDirty = true;
    if (GP.Terrain) GP.Terrain.reset();
  }

  /* ---------------------------------------------------------------- rubble */
  class Rubble extends GP.Entity {
    constructor(game, def, opts) {
      super(game, def, opts);
      this.T = opts.T || { fill: '#6a6a6a' };
      this.poly = opts.poly || [];          // outline where it broke off, in world space...
      this.ox0 = opts.ox || 0; this.oy0 = opts.oy || 0;   // ...around this point
      this.material = opts.material || 'stone';
      this.maxHp = 60; this.hp = 60;
      this.life = M.rand(18, 28);
    }
    build(x, y) {
      const local = [];
      for (let i = 0; i < this.poly.length; i += 2) local.push(this.poly[i] - x, this.poly[i + 1] - y);
      const b = new Phys.Body({ x, y, angle: 0, linearDamping: 0.05 });
      b.addShape(Phys.poly(local, { density: 320, friction: 0.7, restitution: 0.05, category: CAT.PROP, mask: CAT.ALL }));
      b.finalize();
      this.addBody(b);
      return this;
    }
    update(dt) {
      this.life -= dt;
      if (this.life <= 0) this.destroy();
    }
    draw(ctx) {
      const b = this.body;
      if (!b) return;
      ctx.save();
      ctx.globalAlpha = Math.min(1, this.life);
      ctx.translate(b.x, b.y); ctx.rotate(b.a); ctx.translate(b.ox - this.ox0, b.oy - this.oy0);
      GP.Terrain.paintPiece(ctx, this.T, this.poly, this.game.camera ? this.game.camera.scale : 40);
      ctx.restore();
    }
    onDestroyed() {
      const b = this.body;
      GP.FX.chunks(b.x, b.y, 8, GP.mat(this.material).debris, 4, 0.06);
      GP.FX.dust(b.x, b.y, 4, this.T.fill, 0.25);
      this.destroy();
    }
    serialize() { return null; }   // falling rubble is not kept in saves
  }
  GP.Registry.registerKind('rubble', Rubble);
  GP.Registry.register({ id: 'rubble', name: 'Rubble', kind: 'rubble', category: 'Props', hidden: true, material: 'stone' });

  return { add, hit, blast, impact, serialize, load, cellAt };
})();
