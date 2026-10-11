/* GALACTIC PLAYGROUND — temperature, fire, freezing and water.
 * Every body carries a temperature (°C). Heat flows between touching objects and relaxes toward
 * the map's ambient temperature. Sources: lava, explosions, blaster bolts, lightsaber cuts,
 * flamethrowers and burning objects. Flammable materials ignite and spread fire; very cold
 * characters freeze solid (carbonite-style) until they thaw. Water zones provide buoyancy and drag,
 * put out fires and cool things down.
 */
'use strict';

GP.Heat = (() => {
  const M = GP.M, Phys = GP.Phys;
  // ignition temperature per material (null = does not burn)
  const IGNITE = { wood: 250, plastic: 230, flesh: 190, metal: null, armor: null, droid: 420, stone: null, crystal: null, beskar: null, energy: null, world: null };
  const CAPACITY = { metal: 1, armor: 1, droid: 1, flesh: 1.6, wood: 0.8, stone: 2.2, crystal: 1.4, plastic: 0.7, beskar: 3 };
  let acc = 0;

  function ambient(game) { return game.map && game.map.ambientTemp != null ? game.map.ambientTemp : 20; }
  function temp(b, amb) { if (b.temp == null) b.temp = amb; return b.temp; }
  function enabled() { return GP.Settings.play.temperature !== false; }

  function addHeat(b, dT) {
    if (!b || !enabled()) return;
    const e = b.entity;
    const cap = e ? (CAPACITY[e.material] || 1) : 1;
    b.temp = (b.temp == null ? 20 : b.temp) + dT / cap;
  }
  function entityTemp(e) {
    let t = -Infinity;
    for (const b of e.bodies) if (b.temp != null) t = Math.max(t, b.temp);
    return t === -Infinity ? null : t;
  }
  function entityMinTemp(e) {
    let t = Infinity;
    for (const b of e.bodies) if (b.temp != null) t = Math.min(t, b.temp);
    return t === Infinity ? null : t;
  }

  function flammable(e) {
    if (!e || e.def.fireproof) return false;
    if (e.def.flammable) return true;
    if (e.isVehicle || e.isItem && !e.def.flammable) return false;
    return IGNITE[e.material] != null;
  }
  function ignite(e) {
    if (!e || e.removed || e.onFire || !enabled()) return;
    if (!flammable(e) && !e.def.volatile) { for (const b of e.bodies) addHeat(b, 150); return; }
    e.onFire = true;
    e.fireT = e.def.burnTime || (e.isCharacterLike ? 7 : M.rand(8, 14));
    for (const b of e.bodies) b.temp = Math.max(b.temp || 20, (IGNITE[e.material] || 250) + 60);
    if (e.def.volatile && !e.burning && e.detonate) e.burning = e.def.volatile.fuse != null ? e.def.volatile.fuse : M.rand(1, 2);
    const p = e.position();
    GP.Audio.play('explosion', { x: p.x, y: p.y, size: 0.1, vol: 0.15 });
    GP.Events.emit('fire:ignite', { e });
  }
  function extinguish(e, steam = true) {
    if (!e || !e.onFire) return;
    e.onFire = false; e.fireT = 0;
    e.charred = Math.min(1, (e.charred || 0) + 0.5);
    if (steam) { const p = e.position(); GP.FX.smoke(p.x, p.y, 4, 0.35, '#c8ccd0', -1.5); }
  }

  /* ---------------- water ---------------- */
  const waterBodies = new Set();
  function water(game, dt) {
    const seen = new Set();
    for (const c of game.world.active) {
      if (c.dead || c.count === 0) continue;
      const ws = c.sA.tag === 'water' ? c.sA : c.sB.tag === 'water' ? c.sB : null;
      if (!ws) continue;
      const b = ws === c.sA ? c.bB : c.bA;
      if (b.type !== Phys.DYNAMIC || seen.has(b)) continue;
      seen.add(b);
      let minY = Infinity, maxY = -Infinity;
      for (const s of b.shapes) if (!s.sensor && s.enabled) { minY = Math.min(minY, s.minY); maxY = Math.max(maxY, s.maxY); }
      if (minY === Infinity) continue;
      const surf = ws.minY;
      const frac = M.clamp((maxY - surf) / Math.max(0.02, maxY - minY), 0, 1);
      if (frac <= 0) continue;
      b.waterSurf = surf;
      if (b.area == null) { let a = 0; for (const s of b.shapes) if (!s.sensor && !s.massless) a += s.massData().area; b.area = a || 0.01; }
      const g = game.world.gravityY;
      const rho = game.map && game.map.waterDensity || 135;
      b.applyForce(0, -rho * b.area * frac * g);
      const k = 1 / (1 + dt * 2.2 * frac);
      b.vx *= k; b.vy *= k; b.w *= 1 / (1 + dt * 3 * frac);
      if (!waterBodies.has(b) && Math.abs(b.vy) > 2.5) {
        GP.FX.spawn(GP.FX.K.GLOW, b.x, surf, 0, -1, 0.3, 0.3, '#bfe4ff', { size1: 0.05, alpha: 0.4 });
        for (let i = 0; i < 8; i++) GP.FX.spawn(GP.FX.K.CHUNK, b.x + M.rand(-0.3, 0.3), surf, M.rand(-2, 2), -M.rand(2, 5) * Math.min(1.5, Math.abs(b.vy) / 6), M.rand(0.4, 0.8), 0.06, '#9fd4ff', { grav: 9.8, drag: 0.5 });
        GP.Audio.play('impact', { x: b.x, y: surf, strength: Math.min(1, Math.abs(b.vy) / 10), mat: 'flesh' });
      }
      if (b.temp != null) b.temp += ((game.map.waterTemp != null ? game.map.waterTemp : 12) - b.temp) * Math.min(1, dt * 1.5 * frac);
      const e = b.entity;
      if (e && e.onFire && frac > 0.3) extinguish(e);
    }
    for (const b of waterBodies) if (!seen.has(b)) b.waterSurf = null;
    waterBodies.clear();
    for (const b of seen) waterBodies.add(b);
  }

  function isSubmerged(b) { return waterBodies.has(b); }
  // Water above an impact point cushions the blow: a puddle barely helps, a meter or more absorbs most of it.
  function cushion(b, y) {
    if (b.waterSurf == null) return 1;
    const depth = y - b.waterSurf;
    return depth > 0 ? Math.max(0.25, 1 - depth * 0.6) : 1;
  }

  /* ---------------- per tick ---------------- */
  function update(game, dt) {
    if (game.map && game.map.hasWater) water(game, dt);
    if (!enabled()) return;
    // burning is animated every tick; the thermal model runs at 10 Hz
    for (const e of game.entities) {
      if (!e.onFire || e.removed || e.hidden) continue;
      const bodies = e.bodies.filter((b) => !b.removed);
      if (!bodies.length) continue;
      const b = M.pick(bodies);
      if (Math.random() < 0.8) GP.FX.fire(b.x + M.rand(-0.1, 0.1), b.y, 1, 0.22 * Math.sqrt(e.scale || 1), -2.2);
      if (Math.random() < 0.08) GP.FX.smoke(b.x, b.y - 0.3, 1, 0.3, '#2e2a28', -1.2);
      if (Math.random() < 0.04) GP.FX.embers(b.x, b.y, 1, 0.2);
      GP.FX.frameLight(b.x, b.y, 2.5, '#ff8a30', 0.55);
    }
    acc += dt;
    if (acc < 0.1) return;
    const h = acc; acc = 0;
    const amb = ambient(game);
    const W = game.world;
    // conduction between touching bodies
    if (GP.Settings.play.heatTransfer !== false) {
      for (const c of W.active) {
        if (c.dead || !c.touching || c.sensor) continue;
        const A = c.bA, B = c.bB;
        if (!A.entity && !B.entity) continue;
        const ta = A.entity ? temp(A, amb) : amb, tb = B.entity ? temp(B, amb) : amb;
        if (Math.abs(ta - tb) < 2) continue;
        const d = (tb - ta) * Math.min(0.45, 0.9 * h);
        if (A.entity) A.temp += d * (B.entity ? 1 : 0.3);
        if (B.entity) B.temp -= d * (A.entity ? 1 : 0.3);
      }
    }
    for (const e of game.entities) {
      if (e.removed || e.hidden) continue;
      const k = 1 - Math.exp(-h * (e.onFire ? 0.02 : 0.06));
      for (const b of e.bodies) { const t = temp(b, amb); b.temp = t + (amb - t) * k; }
      const hot = entityTemp(e);
      // fire lifecycle
      if (e.onFire) {
        e.fireT -= h;
        for (const b of e.bodies) b.temp = Math.max(b.temp, 380);
        const tgt = M.pick(e.bodies);
        if (tgt) GP.Damage.hit(tgt, { type: 'fire', amount: (e.isCharacterLike ? 6 : 8) * h, x: tgt.x, y: tgt.y });
        const p = e.position();
        W.queryRadius(p.x, p.y, 1.2 * (e.scale || 1), (s) => { const o = s.body; if (o.entity && o.entity !== e && !s.sensor) addHeat(o, 40 * h); });
        if (e.fireT <= 0) extinguish(e, false);
        if (e.isCharacterLike && e.state === 'alive' && e.brain) e.brain.panicT = 0.5;
      } else if (hot != null) {
        const ig = e.def.igniteTemp || IGNITE[e.material];
        if (ig != null && flammable(e) && hot > ig) ignite(e);
        if (e.def.volatile && hot > 300 && e.detonate && !e.burning) e.burning = M.rand(0.5, 1.2);
        if (e.isExplosive && hot > 350 && e.detonate) e.detonate();
      }
      // cold: characters freeze solid, thaw later
      if (e.isCharacterLike && e.partList) {
        const cold = entityMinTemp(e);
        if (cold != null && cold < -70 && !e.frozenSolid && e.state !== 'dead') freezeSolid(e);
        else if (e.frozenSolid && cold != null && cold > -35) thaw(e);
        e.coldFactor = cold != null && cold < 0 ? M.clamp(1 + cold / 80, 0.3, 1) : 1;
      }
    }
  }

  // Carbonite-style freezing: joints lock in place and the character becomes a stiff statue
  function freezeSolid(e) {
    e.frozenSolid = true;
    for (const j of e.joints) {
      if (!j.data || !j.world) continue;
      j.data.frozenLim = [j.lower, j.upper, j.enableLimit];
      const a = j.angle();
      j.enableLimit = true; j.lower = a - 0.01; j.upper = a + 0.01;
    }
    e.stun = Math.max(e.stun, 999);
    const p = e.position();
    GP.FX.ring(p.x, p.y, 1.4, '#bfefff', 0.4, 0.06);
    GP.Audio.play('freeze', { x: p.x, y: p.y });
    GP.Events.emit('character:frozen', { e });
  }
  function thaw(e) {
    e.frozenSolid = false;
    for (const j of e.joints) if (j.data && j.data.frozenLim) { j.lower = j.data.frozenLim[0]; j.upper = j.data.frozenLim[1]; j.enableLimit = j.data.frozenLim[2]; j.data.frozenLim = null; }
    if (e.applyLimits) for (const j of e.joints) if (j.data && j.data.lim) e.applyLimits(j);
    e.stun = 1.5;
    const p = e.position();
    GP.FX.smoke(p.x, p.y, 5, 0.4, '#dfefff', -0.8);
  }

  // Explosions heat (or chill) everything nearby
  GP.Events.on('explosion', (d) => {
    if (!enabled() || !d.game) return;
    const dT = d.kind === 'cryo' ? -420 : d.kind === 'fire' ? 520 : d.kind === 'incendiary' ? 900 : 60;
    d.game.world.queryRadius(d.x, d.y, d.radius, (s) => {
      const b = s.body;
      if (!b.entity || s.sensor) return;
      const f = 1 - Math.min(1, Math.hypot(b.x - d.x, b.y - d.y) / d.radius);
      if (f <= 0) return;
      if (b.temp == null) b.temp = ambient(d.game);
      addHeat(b, dT * f);
      if (d.kind === 'incendiary' && f > 0.3) ignite(b.entity);
      if (d.kind === 'cryo' && b.entity.onFire) extinguish(b.entity);
    });
  });

  /* ---------------- drawing ---------------- */
  const ramp = (t) => {
    // -100 deep blue .. 0 teal .. 37 green .. 100 yellow .. 300 red .. 800 white
    const stops = [[-120, '#1a1060'], [-40, '#2050c0'], [0, '#1ea0c0'], [30, '#40c060'], [60, '#d8d030'], [150, '#ff8a20'], [400, '#ff2a10'], [900, '#ffffff']];
    if (t <= stops[0][0]) return stops[0][1];
    for (let i = 1; i < stops.length; i++) if (t <= stops[i][0]) return M.mix(stops[i - 1][1], stops[i][1], (t - stops[i - 1][0]) / (stops[i][0] - stops[i - 1][0]));
    return stops[stops.length - 1][1];
  };
  function drawThermal(ctx, game, vr) {
    ctx.fillStyle = 'rgba(4,6,24,0.86)';
    ctx.fillRect(vr.minX, vr.minY, vr.maxX - vr.minX, vr.maxY - vr.minY);
    const amb = ambient(game);
    for (const b of game.world.bodies) {
      if (b.removed) continue;
      let t;
      if (!b.entity) {
        if (!b.terrain) continue;
        const lava = b.shapes.some((s) => s.tag === 'lava');
        t = lava ? 1000 : amb - 5;
      } else { if (b.entity.hidden) continue; t = b.temp != null ? b.temp : amb; if (b.entity.isCharacterLike && !b.entity.mech && b.entity.state === 'alive') t = Math.max(t, 36); }
      let vis = false;
      for (const s of b.shapes) if (s.maxX >= vr.minX && s.minX <= vr.maxX && s.maxY >= vr.minY && s.minY <= vr.maxY) vis = true;
      if (!vis) continue;
      ctx.globalAlpha = b.entity ? 0.95 : 0.35;
      GP.Draw.shapes(ctx, b, ramp(t), null);
    }
    ctx.globalAlpha = 1;
    ctx.font = '0.3px sans-serif'; ctx.fillStyle = '#9fe2ff';
    ctx.fillText('THERMAL · ambient ' + fmt(amb), vr.minX + 0.4, vr.minY + 0.6);
  }
  // Red-hot metal and frost in normal view
  function drawTints(ctx, game, vr) {
    if (!enabled()) return;
    for (const e of game.entities) {
      if (e.removed || e.hidden) continue;
      for (const b of e.bodies) {
        const t = b.temp;
        if (t == null || (t < 280 && t > -25)) continue;
        if (b.x < vr.minX - 3 || b.x > vr.maxX + 3 || b.y < vr.minY - 3 || b.y > vr.maxY + 3) continue;
        if (t >= 280 && !e.onFire) {
          const a = M.clamp((t - 280) / 500, 0, 0.8);
          ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = a;
          GP.Draw.shapes(ctx, b, t > 600 ? '#ffb040' : '#ff3a10', null);
          ctx.globalCompositeOperation = 'source-over';
        } else if (t <= -25) {
          ctx.globalAlpha = M.clamp((-25 - t) / 80, 0.1, 0.6);
          GP.Draw.shapes(ctx, b, '#d8f4ff', e.frozenSolid ? '#ffffff' : null, 0.02);
        }
      }
      if (e.charred) { ctx.globalAlpha = e.charred * 0.35; for (const b of e.bodies) GP.Draw.shapes(ctx, b, '#140c08', null); }
    }
    ctx.globalAlpha = 1;
  }
  function fmt(t) { return GP.Settings.play.tempUnit === 'F' ? Math.round(t * 9 / 5 + 32) + '°F' : Math.round(t) + '°C'; }

  return { update, addHeat, ignite, extinguish, drawThermal, drawTints, entityTemp, fmt, isSubmerged, cushion, ambient, freezeSolid, thaw };
})();
