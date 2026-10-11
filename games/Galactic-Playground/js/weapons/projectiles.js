/* GALACTIC PLAYGROUND — projectile system (blaster bolts, ion bolts, slugs, shells).
 * Bolts are lightweight semi-physical objects: they travel with velocity, sweep-test the physics
 * world each tick (continuous, no tunneling), push what they hit with an impulse, deal damage,
 * and can be deflected by lightsaber blades or absorbed by energy shields.
 */
'use strict';

GP.Projectiles = (() => {
  const M = GP.M;
  const pool = new GP.Pool(() => ({ alive: false }), 1500);
  let list = [];
  let game = null;

  function fire(g, o) {
    game = g;
    const p = pool.get();
    if (!p) return null;
    p.x = o.x; p.y = o.y; p.vx = o.vx; p.vy = o.vy;
    p.px = o.x; p.py = o.y;
    p.color = o.color || '#ff3030';
    p.width = o.width || 0.05;
    p.len = o.len || 0.6;
    p.damage = o.damage || 20;
    p.type = o.type || 'blaster';
    p.owner = o.owner || null;
    p.team = o.team || 'neutral';
    p.ignore = o.ignore || [];
    p.life = o.life || 3;
    p.impulse = o.impulse != null ? o.impulse : 2.5;
    p.explosive = o.explosive || null;
    p.gravity = o.gravity || 0;
    p.deflects = 0;
    p.age = 0;
    p.shooter = o.shooter || p.owner;
    list.push(p);
    return p;
  }

  function ignored(p, e) {
    if (!e) return false;
    for (let i = 0; i < p.ignore.length; i++) {
      const ig = p.ignore[i];
      if (!ig) continue;
      if (e === ig || e.holder === ig || (e.vehicleOf && e.vehicleOf === ig)) return true;
    }
    return false;
  }

  function deflect(p, blade, hx, hy) {
    const saber = blade.saber;
    const holder = saber.holder;
    const speed = Math.hypot(p.vx, p.vy);
    let dirx, diry;
    const skill = holder ? holder.stats.skill : 0.2;
    const shooter = p.shooter && p.shooter.position && !p.shooter.removed ? p.shooter : null;
    if (holder && shooter && shooter !== holder && Math.random() < skill * (holder.playerControlled ? 0.6 : 0.9)) {
      const sp = shooter.position();
      const a = Math.atan2(sp.y - hy, sp.x - hx) + M.rand(-1, 1) * (1 - skill) * 0.35;
      dirx = Math.cos(a); diry = Math.sin(a);
    } else {
      // reflect about the blade normal
      let bx = blade.x2 - blade.x1, by = blade.y2 - blade.y1;
      const bl = Math.hypot(bx, by) || 1; bx /= bl; by /= bl;
      let nx = -by, ny = bx;
      if (nx * p.vx + ny * p.vy > 0) { nx = -nx; ny = -ny; }
      const vx = p.vx / speed, vy = p.vy / speed;
      const d = vx * nx + vy * ny;
      let rx = vx - 2 * d * nx, ry = vy - 2 * d * ny;
      const a = Math.atan2(ry, rx) + M.rand(-0.35, 0.35);
      dirx = Math.cos(a); diry = Math.sin(a);
      void rx; void ry;
    }
    p.vx = dirx * speed; p.vy = diry * speed;
    p.x = hx + dirx * 0.05; p.y = hy + diry * 0.05;
    p.px = hx; p.py = hy;
    p.deflects++;
    p.owner = holder || saber;
    p.team = holder ? holder.team : p.team;
    p.ignore = [holder, saber];
    p.shooter = holder || saber;
    p.life = Math.max(p.life, 1.5);
    GP.FX.energyImpact(hx, hy, dirx, diry, p.color);
    GP.FX.sparks(hx, hy, dirx, diry, 6, saber.color, 5);
    GP.Audio.play('deflect', { x: hx, y: hy });
    // the blade takes a small kick
    saber.body.applyImpulse(-dirx * 0.4, -diry * 0.4, hx, hy);
    GP.Events.emit('bolt:deflected', { saber, x: hx, y: hy });
  }

  function impact(p, hit) {
    const b = hit.body, e = b.entity, s = hit.shape;
    const hx = hit.x, hy = hit.y;
    const speed = Math.hypot(p.vx, p.vy) || 1;
    const dx = p.vx / speed, dy = p.vy / speed;
    if (p.explosive) {
      GP.Damage.explode(game, hx - dx * 0.1, hy - dy * 0.1, Object.assign({ source: p.owner }, p.explosive));
      return;
    }
    if (s.tag === 'shield' && e && e.absorbBolt) {
      e.absorbBolt(p, hx, hy);
      return;
    }
    // push
    if (b.type === GP.Phys.DYNAMIC) b.applyImpulse(dx * p.impulse, dy * p.impulse, hx, hy);
    const mat = e ? GP.mat(e.material) : GP.Materials.world;
    const type = p.type === 'ion' ? 'ion' : p.type === 'stun' ? 'electric' : 'blaster';
    if (GP.Heat && e) { GP.Heat.addHeat(b, p.type === 'flame' ? 70 : p.type === 'ion' ? 0 : 18); if (p.type === 'flame' && Math.random() < 0.35) GP.Heat.ignite(e); }
    if (p.type === 'flame') { if (e) GP.Damage.hit(b, { type: 'fire', amount: p.damage, x: hx, y: hy, source: p.owner, shape: s }); return; }
    if (e || b.structure) GP.Damage.hit(b, { type, amount: p.damage, x: hx, y: hy, dirx: dx, diry: dy, source: p.owner, shape: s });
    // effects
    GP.FX.energyImpact(hx, hy, hit.nx, hit.ny, p.color);
    if (mat.spark) GP.FX.sparks(hx, hy, hit.nx, hit.ny, 5, mat.spark, 4);
    if (Math.random() < 0.5) GP.FX.smoke(hx, hy, 1, 0.12, '#555', -0.4, 0.3, 1);
    if (p.type === 'ion') { GP.FX.arc(hx, hy, hx + M.rand(-0.4, 0.4), hy + M.rand(-0.4, 0.4), '#9fe2ff', 0.2); }
    if (b.type === GP.Phys.STATIC && !e) GP.Decals.add(hx, hy, 0.05, 'burn', p.color);
    else if (mat.scorch && !(e && e.def.kind === 'character')) b.addDecal('scorch', hx, hy, 0.04);
    GP.Audio.play('boltImpact', { x: hx, y: hy, vol: 0.25 });
  }

  const drawPos = {};
  function update(g, dt) {
    game = g;
    if (dt <= 0) return;
    const world = g.world;
    const blades = GP.Sabers.activeBlades();
    const out = [];
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      p.life -= dt; p.age += dt;
      if (p.life <= 0) { pool.release(p); continue; }
      p.vy += p.gravity * dt;
      const x0 = p.x, y0 = p.y;
      const x1 = x0 + p.vx * dt, y1 = y0 + p.vy * dt;
      // blades first
      let deflected = false;
      for (let k = 0; k < blades.length; k++) {
        const bl = blades[k];
        if (p.ignore.includes(bl.saber) || (bl.saber.holder && p.ignore.includes(bl.saber.holder))) continue;
        const r = bl.radius;
        let hit = M.segIntersect(x0, y0, x1, y1, bl.x1, bl.y1, bl.x2, bl.y2);
        if (!hit && r > 0.05) {
          const d = M.segSegDist(x0, y0, x1, y1, bl.x1, bl.y1, bl.x2, bl.y2);
          if (d < r) { const c = M.closestOnSegment(x1, y1, bl.x1, bl.y1, bl.x2, bl.y2); hit = { x: c.x, y: c.y }; }
        }
        if (hit) {
          if (p.type === 'slug' || p.type === 'flame' || p.explosive) break; // solid rounds & rockets are not reflected
          deflect(p, bl, hit.x, hit.y);
          deflected = true;
          break;
        }
      }
      if (deflected) { out.push(p); continue; }
      const hit = world.raycast(x0, y0, x1, y1, (s) => {
        if (s.tag === 'blade') return false;
        if (s.sensor && s.tag !== 'shield' && s.tag !== 'hitbox') return false;
        if (s.category === GP.Phys.CAT.DEBRIS) return false;
        const e = s.body.entity;
        if (s.tag === 'shield') return e && e.shieldUp && GP.Teams.hostile(e.team, p.team) && !ignored(p, e);
        if (ignored(p, e)) return false;
        return true;
      });
      p.px = x0; p.py = y0;
      if (hit && !hit.inside) {
        impact(p, hit);
        pool.release(p);
        continue;
      }
      p.x = x1; p.y = y1;
      if (p.explosive && Math.random() < 0.7) GP.FX.smoke(p.x, p.y, 1, 0.1, '#777', -0.2, 0.2, 0.8);
      out.push(p);
    }
    list = out;
  }

  function draw(ctx, alpha = 1) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (const q of list) {
      // drawn between the last two ticks, like everything else
      const p = drawPos; Object.assign(p, q); p.x = q.px + (q.x - q.px) * alpha; p.y = q.py + (q.y - q.py) * alpha;
      const sp = Math.hypot(p.vx, p.vy) || 1;
      const dx = p.vx / sp, dy = p.vy / sp;
      const len = Math.min(p.len, p.age * sp + 0.05);
      const tx = p.x - dx * len, ty = p.y - dy * len;
      if (p.type === 'flame') {
        const f = p.age / Math.max(0.01, p.age + p.life);
        const r = 0.08 + f * 0.55;
        ctx.globalAlpha = 0.85 * (1 - f);
        ctx.drawImage(GP.Draw.glowSprite(f < 0.3 ? '#ffe28a' : f < 0.6 ? '#ff8a30' : '#c83a10'), p.x - r, p.y - r, r * 2, r * 2);
        GP.FX.frameLight(p.x, p.y, 1.2, '#ff8a30', 0.35);
        continue;
      }
      if (p.type === 'slug' || p.explosive) {
        ctx.strokeStyle = p.explosive ? '#ffb040' : '#ffe8a0'; ctx.lineWidth = p.width;
        ctx.globalAlpha = 0.9;
        ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(p.x, p.y); ctx.stroke();
        continue;
      }
      ctx.strokeStyle = p.color;
      ctx.globalAlpha = 0.25; ctx.lineWidth = p.width * 5;
      ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(p.x, p.y); ctx.stroke();
      ctx.globalAlpha = 0.8; ctx.lineWidth = p.width * 2.2;
      ctx.stroke();
      ctx.strokeStyle = '#ffffff'; ctx.globalAlpha = 0.95; ctx.lineWidth = p.width * 0.8;
      ctx.beginPath(); ctx.moveTo(tx + dx * len * 0.15, ty + dy * len * 0.15); ctx.lineTo(p.x, p.y); ctx.stroke();
      GP.FX.frameLight(p.x, p.y, 1.4, p.color, 0.5);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  return {
    fire,
    update,
    draw,
    list: () => list,
    count: () => list.length,
    clear() { for (const p of list) pool.release(p); list = []; },
    // Bolts heading toward a point (used by AI to anticipate / deflect)
    incoming(x, y, radius, team, horizon = 0.5) {
      const res = [];
      for (const p of list) {
        if (!GP.Teams.hostile(team, p.team) && p.team !== 'neutral') continue;
        const rx = x - p.x, ry = y - p.y;
        const vv = p.vx * p.vx + p.vy * p.vy;
        const t = (rx * p.vx + ry * p.vy) / (vv || 1);
        if (t < 0 || t > horizon) continue;
        const cx = p.x + p.vx * t - x, cy = p.y + p.vy * t - y;
        if (cx * cx + cy * cy < radius * radius) res.push({ p, t });
      }
      return res;
    },
  };
})();
