/* GALACTIC PLAYGROUND — damage system.
 * Damage types: 'cut' (lightsabers), 'blaster', 'impact' (collisions), 'explosive', 'electric', 'ion', 'fire', 'crush'.
 * Entities decide how damage maps onto their parts via entity.damage(info).
 * This module also turns physics contacts into impact damage and sound, and runs explosions.
 */
'use strict';

GP.Decals = (() => {
  const list = [];
  return {
    add(x, y, r, kind = 'scorch', color) {
      if (!GP.Settings.g.decals) return;
      list.push({ x, y, r, kind, color, t: 0 });
      if (list.length > (kind === 'blood' ? 320 : 90)) { const i = list.findIndex((d) => d.kind === kind); list.splice(i >= 0 ? i : 0, 1); }
    },
    clear() { list.length = 0; },
    // forget marks inside an area (the surface they were on broke away)
    clearIn(r) { for (let i = list.length - 1; i >= 0; i--) { const d = list[i]; if (d.x >= r.minX && d.x <= r.maxX && d.y >= r.minY && d.y <= r.maxY) list.splice(i, 1); } },
    update(dt) { for (const d of list) d.t += dt; },
    draw(ctx) {
      for (const d of list) {
        if (d.kind === 'scorch') {
          ctx.fillStyle = 'rgba(12,8,6,0.45)';
          ctx.beginPath(); ctx.ellipse(d.x, d.y, d.r, d.r * 0.35, 0, 0, Math.PI * 2); ctx.fill();
          if (d.t < 3) GP.Draw.glow(ctx, d.x, d.y, d.r * 0.8, '#ff7a20', (3 - d.t) / 3 * 0.7);
        } else if (d.kind === 'blood') {
          ctx.fillStyle = d.color || '#7a0808';
          ctx.globalAlpha = 0.85;
          ctx.beginPath(); ctx.ellipse(d.x, d.y, d.r, d.r * 0.3, 0, 0, Math.PI * 2); ctx.fill();
          ctx.globalAlpha = 0.5;
          const sx = (d.x * 7.31) % 1, sy = (d.x * 3.17) % 1;
          ctx.beginPath(); ctx.arc(d.x + d.r * (0.6 + sx * 0.8), d.y - d.r * 0.05, d.r * 0.22, 0, Math.PI * 2); ctx.fill();
          ctx.beginPath(); ctx.arc(d.x - d.r * (0.7 + sy * 0.6), d.y, d.r * 0.16, 0, Math.PI * 2); ctx.fill();
          ctx.globalAlpha = 1;
        } else if (d.kind === 'burn') {
          const heat = Math.max(0, 1 - d.t / 5);
          ctx.fillStyle = heat > 0 ? GP.M.mix('#1d0f08', '#ff9a40', heat) : 'rgba(20,12,8,0.7)';
          ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2); ctx.fill();
          if (heat > 0) GP.Draw.glow(ctx, d.x, d.y, d.r * 3, d.color || '#ff7a20', heat);
        }
      }
    },
  };
})();

GP.Damage = (() => {
  const M = GP.M;

  function hit(body, info) {
    const e = body && body.entity;
    // map structures (catwalks, platforms, buildings) are terrain that can be broken
    if (!e) return body && body.structure && GP.Destruction ? GP.Destruction.hit(body, info) : 0;
    if (e.removed) return 0;
    info.body = body;
    try { return e.damage(info) || 0; } catch (err) { console.error('damage', err); return 0; }
  }

  // Convert this tick's contact impulses into impact damage, stuns and sounds.
  function processContacts(game) {
    const world = game.world;
    const now = world.time;
    const active = world.active;
    for (let i = 0; i < active.length; i++) {
      const c = active[i];
      if (c.dead || !c.enabled || c.sensor || c.count === 0 || c.impulse <= 0) continue;
      const A = c.bA, B = c.bB;
      const dvA = c.impulse * A.im, dvB = c.impulse * B.im;
      const dv = Math.max(dvA, dvB);
      if (dv < 1.2) continue;
      const p = c.pts[0];
      // sound (rate-limited per body)
      if (c.approach > 1.4) {
        const loud = A.im >= B.im ? A : B;
        if (now - loud.lastHitTime > 0.12) {
          loud.lastHitTime = now;
          const e = loud.entity;
          const mat = e ? GP.mat(e.material).sound : 'stone';
          const strength = M.clamp((c.approach - 1) / 10, 0.05, 1) * M.clamp(Math.sqrt((A.m || 100) + 1) / 6, 0.3, 1.4);
          GP.Audio.play('impact', { x: p.x, y: p.y, strength, mat });
          if (c.approach > 7) {
            const other = loud === A ? B : A;
            if (other.type === GP.Phys.STATIC) GP.FX.dust(p.x, p.y, 4, game.map && game.map.dustColor || '#9a9080', 0.2);
            if (e && (e.material === 'metal' || e.material === 'droid' || e.material === 'armor')) GP.FX.sparks(p.x, p.y, -c.nx, -c.ny, 5, '#ffd27a', 4);
          }
        }
      }
      // damage
      if (A.entity && dvA > 1.2 && A.entity.onImpact) A.entity.onImpact(A, dvA, c, B);
      else if (A.entity && dvA > 6) impactDamage(A, dvA, c, B);
      if (B.entity && dvB > 1.2 && B.entity.onImpact) B.entity.onImpact(B, dvB, c, A);
      else if (B.entity && dvB > 6) impactDamage(B, dvB, c, A);
      // something heavy crashing into a map structure
      if (GP.Destruction) { if (A.structure) GP.Destruction.impact(A, c, B); else if (B.structure) GP.Destruction.impact(B, c, A); }
    }
  }

  function impactDamage(body, dv, c, other) {
    const e = body.entity;
    if (GP.Heat) dv *= GP.Heat.cushion(body, c.pts[0].y);
    const thr = e.def.impactThreshold || 8;
    if (dv < thr) return;
    const src = other && other.entity;
    let amt = (dv - thr) * (e.def.impactFactor || 5) * (GP.Settings.play.fragility || 1);
    // melee weapons amplify the damage they deal
    if (src && src.def.melee) amt += src.def.melee.damage * Math.min(1, dv / 6);
    hit(body, { type: 'impact', amount: amt, x: c.pts[0].x, y: c.pts[0].y, source: src && src.holder ? src.holder : src });
  }

  /* Explosion: impulse + damage + effects + decals. */
  function explode(game, x, y, o) {
    const radius = o.radius || 3;
    const power = o.power != null ? o.power : 14;           // m/s at the center for light objects
    const damage = o.damage != null ? o.damage : 120;
    const kind = o.kind || 'fire';
    const world = game.world;
    const perEntity = new Map();
    world.queryRadius(x, y, radius, (s) => {
      const b = s.body;
      if (b.removed || s.sensor) return;
      const d = Math.max(0, GP.Phys.pointShapeDistance(s, x, y));
      if (d > radius) return;
      let f = 1 - d / radius;
      // occlusion by static geometry
      if (f > 0 && b.type !== GP.Phys.STATIC) {
        const blocked = world.raycast(x, y, b.x, b.y, (t) => t.body.type === GP.Phys.STATIC && !t.sensor && t.body !== b);
        if (blocked && blocked.t < 0.95) f *= 0.35;
      }
      if (f <= 0) return;
      if (b.type === GP.Phys.DYNAMIC && !b._blastStamp) {
        b._blastStamp = true;
        let dx = b.x - x, dy = b.y - y;
        const l = Math.hypot(dx, dy) || 1;
        dx /= l; dy /= l; dy -= 0.35;
        const push = kind === 'ion' ? 0.25 : kind === 'cryo' ? 0.3 : kind === 'seismic' ? 1.3 : 1;
        const dvel = power * push * f / (1 + b.m / 250);
        const J = b.m * dvel;
        b.applyImpulse(dx * J, dy * J, b.x + M.rand(-0.1, 0.1), b.y + M.rand(-0.1, 0.1));
      }
      const e = b.entity;
      if (e && !e.removed) {
        let rec = perEntity.get(e);
        if (!rec) { rec = { f: 0, body: b, fmap: new Map() }; perEntity.set(e, rec); }
        if (f > rec.f) { rec.f = f; rec.body = b; }
        rec.fmap.set(b, Math.max(rec.fmap.get(b) || 0, f));
      }
    });
    for (const b of world.bodies) b._blastStamp = false;
    for (const [e, rec] of perEntity) {
      const type = kind === 'ion' ? 'ion' : kind === 'cryo' ? 'cold' : 'explosive';
      hit(rec.body, { type, amount: damage * rec.f, x, y, source: o.source || null, explosion: { x, y, radius, kind }, fmap: rec.fmap, f: rec.f });
    }
    if (GP.Destruction) GP.Destruction.blast(game, x, y, radius, damage, kind, power);
    // visuals
    GP.FX.explosion(x, y, radius * 0.45, kind);
    if (kind === 'fire' || kind === 'incendiary') {
      const ground = world.raycast(x, y, x, y + radius * 0.8, (t) => t.body.type === GP.Phys.STATIC && !t.sensor);
      if (ground) GP.Decals.add(ground.x, ground.y, radius * 0.45, 'scorch');
      const n = Math.min(o.debris != null ? o.debris : Math.round(radius * 2), 10);
      for (let i = 0; i < n; i++) spawnDebris(game, x, y, radius);
    }
    // camera
    const cam = game.camera;
    if (cam) {
      const d = Math.hypot(cam.x - x, cam.y - y);
      cam.addShake(M.clamp(radius / 5, 0.15, 1) * M.clamp(1 - d / 45, 0, 1));
    }
    GP.Audio.play(kind === 'ion' || kind === 'cryo' ? 'ion' : kind === 'seismic' ? 'seismic' : 'explosion', { x, y, size: radius / 3 });
    if (kind === 'cryo') GP.Audio.play('freeze', { x, y });
    GP.Events.emit('explosion', { x, y, radius, kind, game });
  }

  function spawnDebris(game, x, y, radius) {
    if (!game.canSpawnDebris()) return;
    const def = GP.Registry.get('debris_chunk');
    if (!def) return;
    const e = GP.Registry.create(game, def, {});
    e.build(x + M.rand(-0.3, 0.3), y + M.rand(-0.3, 0.3), { hot: true, size: M.rand(0.06, 0.16) });
    game.addEntity(e);
    const a = M.rand(0, Math.PI * 2), s = M.rand(4, 10) * Math.min(1.5, radius / 3);
    e.body.vx = Math.cos(a) * s; e.body.vy = Math.sin(a) * s - 4; e.body.w = M.rand(-20, 20);
  }

  return { hit, processContacts, explode, spawnDebris };
})();
