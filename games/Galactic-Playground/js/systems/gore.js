/* GALACTIC PLAYGROUND — gore: blood, wounds, bleeding and blood loss.
 * Scaled by the "Gore multiplier" setting (0 = off). Organic characters bleed; droids leak oil.
 * Blood droplets are particles that splatter into pools on the ground and stain objects they hit.
 * Wounded body parts keep bleeding and drain the character's blood; heavy loss knocks them out,
 * then kills. Bacta stops bleeding and restores blood.
 */
'use strict';

GP.Gore = (() => {
  const M = GP.M;
  // how much each damage type makes a wound bleed (lightsabers and blaster bolts mostly cauterize)
  const BLEED = { stab: 1.3, impact: 0.8, crush: 1.6, explosive: 1.3, cut: 0.3, blaster: 0.3, fire: 0, electric: 0, ion: 0, cold: 0 };

  function level() { const g = GP.Settings.play.gore; return g == null ? 1 : g; }
  function on() { return level() > 0; }
  function color(e) {
    if (e && e.def && e.def.blood) return e.def.blood;
    if (e && e.mech) return '#1a140e';
    return '#7a0808';
  }

  // Burst of droplets from (x,y) roughly along (dx,dy)
  function spray(e, x, y, dx, dy, amount, spread = 0.9, speed = 3) {
    if (!on() || amount <= 0) return;
    const n = Math.min(40, Math.round(amount * level()));
    if (n <= 0) return;
    const col = color(e);
    const base = Math.atan2(dy, dx);
    for (let i = 0; i < n; i++) {
      const a = base + M.rand(-spread, spread), s = speed * M.rand(0.3, 1.2);
      GP.FX.spawn(GP.FX.K.BLOOD, x, y, Math.cos(a) * s, Math.sin(a) * s - M.rand(0, 1), M.rand(0.8, 1.6), M.rand(0.012, 0.03) * (1 + level() * 0.1), col, { grav: 9.8, drag: 0.4, add: false });
    }
    if (amount * level() > 6) GP.FX.spawn(GP.FX.K.DUST, x, y, dx * 0.5, dy * 0.5 - 0.3, 0.6, 0.15, col, { size1: 0.4, drag: 3, alpha: M.clamp(0.25 * level(), 0.1, 0.6), add: false });
  }

  // A character section took damage
  function onHurt(c, body, amt, type, info) {
    if (!on() || !body.part || amt <= 0) return;
    const f = BLEED[type] != null ? BLEED[type] : 0.5;
    if (f <= 0) return;
    const x = info.x != null ? info.x : body.x, y = info.y != null ? info.y : body.y;
    let dx = info.dirx || 0, dy = info.diry || 0;
    if (!dx && !dy) { dx = x - c.parts.torso.x; dy = y - c.parts.torso.y - 0.5; }
    spray(c, x, y, dx, dy, amt * f * 0.35, 0.8, 2.5 + amt * 0.04);
    if (amt * f > 2) {
      body.addDecal('wound', x, y, M.clamp(0.02 + amt * f * 0.0015, 0.025, 0.07), color(c));
      body.part.bleed = Math.min(3, (body.part.bleed || 0) + amt * f * 0.012);
      body.part.bloodied = Math.min(1, (body.part.bloodied || 0) + amt * f * 0.01 * level());
    }
  }

  // A section was severed: both sides of the cut spurt for a while
  function onSever(c, child, parent, anchor, info) {
    if (!on()) return;
    const cauterized = info && info.type === 'cut';
    const k = cauterized ? 0.25 : 1;
    const lc = child.toLocal(anchor.x, anchor.y), lp = parent.toLocal(anchor.x, anchor.y);
    child.part.stump = { lx: lc.x, ly: lc.y, t: 3 * k, rate: 1.2 * k };
    parent.part.stumpOn = parent.part.stumpOn || [];
    parent.part.stumpOn.push({ lx: lp.x, ly: lp.y, t: 6 * k, rate: 2 * k, child });
    spray(c, anchor.x, anchor.y, 0, -1, 14 * k, Math.PI, 4);
    if (!cauterized) {
      child.addDecal('stump', anchor.x, anchor.y, 0.05 * c.scale, color(c));
      parent.addDecal('stump', anchor.x, anchor.y, 0.055 * c.scale, color(c));
    }
  }

  // Bleeding leaves real liquid behind (blood; droids leak oil) when "Blood pools" is on
  function leak(c, x, y, vx, vy, amount) {
    if (!GP.Fluid || GP.Settings.play.bloodPools === false || amount <= 0) return;
    c.leakAcc = (c.leakAcc || 0) + amount / (GP.Fluid.scale() * GP.Fluid.scale());
    while (c.leakAcc >= 1) { c.leakAcc -= 1; GP.Fluid.add(c.mech ? GP.Fluid.OIL : GP.Fluid.BLOOD, x + M.rand(-0.02, 0.02), y, vx, vy); }
  }

  // Per-tick bleeding and blood loss for one character
  function update(c, dt) {
    if (!on() || c.hidden) return;
    const alive = c.state === 'alive';
    if (!alive && c.deathT > 25) return;
    const pump = alive ? 1 : Math.max(0, 1 - c.deathT / 10); // bleeding slows after death
    let loss = 0;
    for (const b of c.partList) {
      const p = b.part;
      if (p.bleed > 0.01) {
        loss += p.bleed;
        if (Math.random() < dt * p.bleed * 10 * pump * Math.min(2, level())) {
          const d = b.decals && b.decals.filter((x) => x.kind === 'wound' || x.kind === 'stump');
          const src = d && d.length ? M.pick(d) : null;
          const w = src ? b.toWorld(src.x, src.y) : { x: b.x, y: b.y };
          GP.FX.spawn(GP.FX.K.BLOOD, w.x, w.y, M.rand(-0.3, 0.3) + b.vx * 0.5, M.rand(-0.2, 0.4) + b.vy * 0.5, 1.5, M.rand(0.012, 0.022), color(c), { grav: 9.8, drag: 0.4, add: false });
        }
        const wd = b.decals && b.decals.find((x) => x.kind === 'wound');
        const wp = wd ? b.toWorld(wd.x, wd.y) : b;
        leak(c, wp.x, wp.y, b.vx * 0.5, b.vy * 0.5 + 0.3, dt * p.bleed * 6 * pump * Math.min(2, level()));
        p.bleed *= Math.exp(-dt * 0.07); // clotting
      }
      if (p.stump && p.stump.t > 0) spurt(c, b, p.stump, dt, pump);
      if (p.stumpOn) for (const s of p.stumpOn) if (s.t > 0) spurt(c, b, s, dt, pump);
    }
    if (alive && !c.mech) {
      c.blood = Math.max(0, (c.blood == null ? 1 : c.blood) - loss * dt * 0.012 * level());
      if (c.blood < 0.35 && c.unconscious <= 0 && Math.random() < dt * 0.5) c.knockOut(6);
      if (c.blood <= 0.02) c.die();
    }
  }
  function spurt(c, b, s, dt, pump) {
    s.t -= dt;
    const w = b.toWorld(s.lx, s.ly);
    // spray outward from the body center through the stump
    let dx = w.x - b.x, dy = w.y - b.y; const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
    const beat = 0.6 + 0.4 * Math.sin(c.t * 9);
    if (Math.random() < dt * 28 * s.rate * pump * beat * Math.min(2, level())) {
      const sp = M.rand(1.5, 3.5) * beat * Math.min(1, s.t / 2 + 0.3);
      GP.FX.spawn(GP.FX.K.BLOOD, w.x, w.y, dx * sp + M.rand(-0.4, 0.4) + b.vx, dy * sp + M.rand(-0.4, 0.4) + b.vy, 1.5, M.rand(0.014, 0.026), color(c), { grav: 9.8, drag: 0.3, add: false });
    }
    leak(c, w.x, w.y, dx * 2 * beat + b.vx, dy * 2 * beat + b.vy, dt * 5 * s.rate * pump * beat * Math.min(2, level()) * Math.min(1, s.t / 2 + 0.3));
    if (c.state === 'alive' && !c.mech) c.blood = Math.max(0, (c.blood == null ? 1 : c.blood) - dt * 0.01 * s.rate * level());
  }
  function stopBleeding(c) {
    c.blood = 1;
    for (const b of c.partList) { b.part.bleed = 0; if (b.part.stump) b.part.stump.t = 0; if (b.part.stumpOn) for (const s of b.part.stumpOn) s.t = 0; }
  }

  // Droplet landed: pool on terrain, stain on objects
  function splat(p, hit) {
    const size = p.size * M.rand(2.5, 5);
    if (!hit.body.entity) GP.Decals.add(hit.x, hit.y, size, 'blood', p.color);
    else if (!hit.body.entity.partList || Math.random() < 0.3) hit.body.addDecal('bloodstain', hit.x, hit.y, size * 0.7, p.color);
  }

  return { level, on, color, spray, onHurt, onSever, update, stopBleeding, splat };
})();
