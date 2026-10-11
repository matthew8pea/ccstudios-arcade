/* GALACTIC PLAYGROUND — particle effects, electric arcs, dynamic lights, weather.
 * Everything here runs on simulation time so slow motion and pause affect effects too.
 */
'use strict';

GP.FX = (() => {
  const K = { SPARK: 1, GLOW: 2, SMOKE: 3, CHUNK: 4, RING: 5, EMBER: 6, FLAKE: 7, STREAK: 8, DUST: 9, BLOOD: 10 };
  const CAPS = { low: 700, medium: 1600, high: 3200 };
  const pool = new GP.Pool(() => ({ alive: false }), 5000);
  let list = [];
  const arcs = [];
  const lights = [];
  const frameLights = [];
  let weather = null;
  let weatherAcc = 0;

  function cap() { return CAPS[GP.Settings.g.particleQuality] || 1600; }
  function qualityScale() { const q = GP.Settings.g.particleQuality; return q === 'low' ? 0.4 : q === 'medium' ? 0.7 : 1; }

  function spawn(kind, x, y, vx, vy, life, size, color, opts) {
    if (list.length >= cap()) return null;
    const p = pool.get();
    if (!p) return null;
    p.kind = kind; p.x = x; p.y = y; p.vx = vx; p.vy = vy; p.life = life; p.max = life;
    p.size = size; p.size1 = opts && opts.size1 != null ? opts.size1 : size;
    p.color = color; p.color2 = opts && opts.color2 || null;
    p.drag = opts && opts.drag != null ? opts.drag : 0.5;
    p.grav = opts && opts.grav != null ? opts.grav : 0;
    p.rot = opts && opts.rot || 0; p.vr = opts && opts.vr || 0;
    p.alpha = opts && opts.alpha != null ? opts.alpha : 1;
    p.add = kind === K.SPARK || kind === K.GLOW || kind === K.RING || kind === K.EMBER || kind === K.STREAK;
    if (opts && opts.add != null) p.add = opts.add;
    p.bounce = opts && opts.bounce || 0;
    list.push(p);
    return p;
  }

  const R = GP.M.rand;

  const api = {
    K,
    spawn,
    count() { return list.length; },
    clear() { for (const p of list) pool.release(p); list = []; arcs.length = 0; lights.length = 0; },

    sparks(x, y, nx, ny, count, color = '#ffd27a', speed = 6, spread = 1.2) {
      count = Math.ceil(count * qualityScale());
      const base = Math.atan2(ny, nx);
      for (let i = 0; i < count; i++) {
        const a = base + R(-spread, spread), s = speed * R(0.3, 1.2);
        spawn(K.SPARK, x, y, Math.cos(a) * s, Math.sin(a) * s, R(0.15, 0.5), R(0.012, 0.03), color, { drag: 1.2, grav: 9, color2: '#ff6a1a', bounce: 0.4 });
      }
    },
    glow(x, y, r, color, life = 0.15, alpha = 1) { spawn(K.GLOW, x, y, 0, 0, life, r, color, { size1: r * 1.3, alpha }); },
    smoke(x, y, count, size = 0.5, color = '#50505a', vy = -0.8, spread = 0.6, life = 2.2) {
      count = Math.ceil(count * qualityScale());
      for (let i = 0; i < count; i++) {
        spawn(K.SMOKE, x + R(-spread, spread) * size, y + R(-spread, spread) * size, R(-0.6, 0.6), vy * R(0.5, 1.4), life * R(0.6, 1.3), size * R(0.5, 1), color,
          { size1: size * R(1.8, 3), drag: 1.5, alpha: R(0.35, 0.6) });
      }
    },
    fire(x, y, count, size = 0.3, vy = -2) {
      count = Math.ceil(count * qualityScale());
      for (let i = 0; i < count; i++) {
        spawn(K.GLOW, x + R(-size, size) * 0.5, y + R(-size, size) * 0.5, R(-0.8, 0.8), vy * R(0.4, 1.2), R(0.25, 0.6), size * R(0.6, 1.2),
          GP.M.pick(['#ffb040', '#ff7a20', '#ffd070', '#ff5a10']), { size1: size * 0.2, drag: 1, alpha: 0.9 });
      }
    },
    embers(x, y, count, spread = 0.4) {
      count = Math.ceil(count * qualityScale());
      for (let i = 0; i < count; i++) {
        spawn(K.EMBER, x + R(-spread, spread), y + R(-spread, spread), R(-1.5, 1.5), R(-3, -0.5), R(0.8, 2.2), R(0.015, 0.04), GP.M.pick(['#ff9a30', '#ffcf60', '#ff5a20']), { drag: 0.6, grav: -0.5 });
      }
    },
    chunks(x, y, count, color = '#555', speed = 5, size = 0.06) {
      count = Math.ceil(count * qualityScale());
      for (let i = 0; i < count; i++) {
        const a = R(0, Math.PI * 2), s = speed * R(0.3, 1);
        spawn(K.CHUNK, x, y, Math.cos(a) * s, Math.sin(a) * s - speed * 0.4, R(0.6, 1.4), size * R(0.5, 1.3), color, { grav: 9.8, drag: 0.3, vr: R(-15, 15), bounce: 0.3 });
      }
    },
    dust(x, y, count, color = '#a89a80', size = 0.25) {
      count = Math.ceil(count * qualityScale());
      for (let i = 0; i < count; i++) {
        spawn(K.DUST, x + R(-0.2, 0.2), y, R(-1.5, 1.5), R(-0.8, -0.1), R(0.5, 1.2), size * R(0.5, 1), color, { size1: size * 2.2, drag: 2.5, alpha: 0.45 });
      }
    },
    ring(x, y, r, color = '#9fd8ff', life = 0.4, width = 0.08) {
      spawn(K.RING, x, y, 0, 0, life, 0.05, color, { size1: r, alpha: 0.9, drag: width });
    },
    streak(x, y, vx, vy, color, life = 0.12, size = 0.05) { spawn(K.STREAK, x, y, vx, vy, life, size, color, { drag: 0 }); },

    energyImpact(x, y, nx, ny, color) {
      api.glow(x, y, 0.45, color, 0.12);
      api.glow(x, y, 0.18, '#ffffff', 0.08);
      api.sparks(x, y, nx, ny, 7, color, 5, 1.1);
      api.light(x, y, 2.2, color, 0.9, 0.12);
    },
    muzzleFlash(x, y, dx, dy, color) {
      api.glow(x, y, 0.35, color, 0.07);
      api.glow(x + dx * 0.15, y + dy * 0.15, 0.2, '#ffffff', 0.05);
      api.light(x, y, 2.5, color, 0.7, 0.07);
    },
    explosion(x, y, radius, kind = 'fire') {
      const q = qualityScale();
      if (kind === 'ion') {
        api.ring(x, y, radius * 1.2, '#7fd4ff', 0.5, 0.12);
        api.glow(x, y, radius * 0.9, '#6ec8ff', 0.3);
        for (let i = 0; i < 8 * q; i++) api.arc(x, y, x + R(-radius, radius), y + R(-radius, radius), '#9fe2ff', 0.25);
        api.sparks(x, y, 0, -1, 30, '#bfeeff', 9, Math.PI);
        api.light(x, y, radius * 3, '#6ec8ff', 1.2, 0.4);
        return;
      }
      if (kind === 'cryo') {
        api.ring(x, y, radius * 1.3, '#dff6ff', 0.5, 0.12);
        api.glow(x, y, radius, '#bfefff', 0.25);
        api.smoke(x, y, 16, radius * 0.5, '#e8f6ff', -0.3, 1, 2.5);
        api.sparks(x, y, 0, -1, 24, '#ffffff', 7, Math.PI);
        api.light(x, y, radius * 3, '#bfefff', 1.1, 0.35);
        return;
      }
      if (kind === 'seismic') {
        for (let i = 0; i < 3; i++) spawn(K.RING, x, y, 0, 0, 0.6 + i * 0.25, 0.05, '#b7f3ff', { size1: radius * (1.4 + i * 0.4), alpha: 0.9, drag: 0.05 });
        api.glow(x, y, radius, '#9fe9ff', 0.4);
        api.light(x, y, radius * 3, '#9fe9ff', 1.5, 0.6);
        api.sparks(x, y, 0, -1, 40, '#e0fbff', 12, Math.PI);
        return;
      }
      api.glow(x, y, radius * 1.3, '#fff2c0', 0.12);
      api.glow(x, y, radius * 0.9, '#ffb040', 0.35);
      api.ring(x, y, radius * 1.4, '#ffd9a0', 0.35, 0.1);
      for (let i = 0; i < 26 * q; i++) {
        const a = R(0, Math.PI * 2), s = R(0.5, 1) * radius * 3;
        spawn(K.GLOW, x, y, Math.cos(a) * s, Math.sin(a) * s, R(0.25, 0.6), radius * R(0.2, 0.45), GP.M.pick(['#ffb040', '#ff7a20', '#ffd070']), { size1: radius * 0.05, drag: 3.5 });
      }
      api.smoke(x, y, 12, radius * 0.6, '#3a3634', -1.2, 0.8, 3);
      api.sparks(x, y, 0, -1, 36, '#ffd27a', radius * 7, Math.PI);
      api.embers(x, y, 14, radius * 0.5);
      api.light(x, y, radius * 4, '#ff9a40', 1.6, 0.5);
    },
    // Electric arc between two points
    arc(x1, y1, x2, y2, color = '#a8e0ff', life = 0.15, width = 0.03) {
      if (arcs.length > 120) arcs.shift();
      arcs.push({ x1, y1, x2, y2, color, life, max: life, width, seed: Math.random() });
    },
    light(x, y, r, color, intensity = 1, life = 0.1) {
      if (lights.length > 80) lights.shift();
      lights.push({ x, y, r, color, intensity, life, max: life });
    },
    // A light that exists only for the current frame (sabers, engines, lava)
    frameLight(x, y, r, color, intensity = 1) {
      if (frameLights.length < 200) frameLights.push({ x, y, r, color, intensity, life: 1, max: 1 });
    },
    // Directional (spotlight) light for the current frame: angle = beam direction, spread = half-angle
    coneLight(x, y, r, angle, spread, color, intensity = 1) {
      if (frameLights.length < 200) frameLights.push({ x, y, r, color, intensity, life: 1, max: 1, cone: true, angle, spread });
    },
    lights() { return lights.concat(frameLights); },
    clearFrameLights() { frameLights.length = 0; },

    setWeather(w) { weather = w; weatherAcc = 0; },

    update(dt, cam, world) {
      if (dt <= 0) return;
      // weather emission around the camera
      if (weather && cam) {
        const vr = cam.viewRect(2);
        weatherAcc += dt * weather.rate * qualityScale() * Math.min(2.5, (vr.maxX - vr.minX) / 25);
        while (weatherAcc > 1) {
          weatherAcc -= 1;
          const x = R(vr.minX, vr.maxX);
          if (weather.type === 'snow') spawn(K.FLAKE, x, vr.minY, R(-0.5, 0.5) + (weather.wind || 0), R(0.8, 1.8), 12, R(0.02, 0.05), '#ffffff', { drag: 0, alpha: R(0.5, 0.95), add: false });
          else if (weather.type === 'sand') spawn(K.FLAKE, vr.minX, R(vr.minY, vr.maxY), R(6, 12), R(-0.3, 0.6), 6, R(0.01, 0.03), '#e8c890', { drag: 0, alpha: R(0.3, 0.7), add: false });
          else if (weather.type === 'embers') spawn(K.EMBER, x, vr.maxY, R(-0.5, 0.5), R(-2, -0.6), 8, R(0.015, 0.035), GP.M.pick(['#ff7a20', '#ffb040', '#ff4a10']), { drag: 0, grav: 0 });
          else if (weather.type === 'dust') spawn(K.FLAKE, x, R(vr.minY, vr.maxY), R(-0.2, 0.2), R(-0.1, 0.1), 5, R(0.01, 0.025), '#c8d8ff', { drag: 0, alpha: R(0.1, 0.35), add: true });
          else if (weather.type === 'ash') spawn(K.FLAKE, x, vr.minY, R(-0.3, 0.3), R(0.3, 0.9), 14, R(0.015, 0.03), '#8a8080', { drag: 0, alpha: R(0.3, 0.6), add: false });
        }
      }
      const out = [];
      for (let i = 0; i < list.length; i++) {
        const p = list[i];
        p.life -= dt;
        if (p.life <= 0) { pool.release(p); continue; }
        const d = 1 / (1 + p.drag * dt);
        if (p.kind !== K.RING) { p.vx *= d; p.vy *= d; }
        p.vy += p.grav * dt;
        const nx = p.x + p.vx * dt, ny = p.y + p.vy * dt;
        // blood droplets land on terrain or objects (not on the characters themselves)
        if (p.kind === K.BLOOD && world) {
          const hit = world.raycast(p.x, p.y, nx, ny, (s) => !s.sensor && s.category !== GP.Phys.CAT.CHAR && s.tag !== 'blade' && s.category !== GP.Phys.CAT.DEBRIS);
          if (hit) { if (GP.Gore) GP.Gore.splat(p, hit); pool.release(p); continue; }
        }
        // cheap ground bounce against static geometry for sparks/chunks
        if (p.bounce && world && p.vy > 0 && (p.kind === K.SPARK || p.kind === K.CHUNK) && (i & 1) === 0) {
          const hit = world.raycast(p.x, p.y, nx, ny, (s) => s.body.type === GP.Phys.STATIC && !s.sensor);
          if (hit) { p.vy = -p.vy * p.bounce; p.vx *= 0.6; p.y = hit.y - 0.01; p.x = hit.x; out.push(p); continue; }
        }
        p.x = nx; p.y = ny;
        p.rot += p.vr * dt;
        out.push(p);
      }
      list = out;
      for (let i = arcs.length - 1; i >= 0; i--) { arcs[i].life -= dt; if (arcs[i].life <= 0) arcs.splice(i, 1); }
      for (let i = lights.length - 1; i >= 0; i--) { lights[i].life -= dt; if (lights[i].life <= 0) lights.splice(i, 1); }
    },

    draw(ctx, cam, layer) {
      const vr = cam.viewRect(1);
      const drawAdd = layer === 'add';
      if (drawAdd) ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < list.length; i++) {
        const p = list[i];
        if (p.add !== drawAdd) continue;
        if (p.x < vr.minX || p.x > vr.maxX || p.y < vr.minY || p.y > vr.maxY) continue;
        const t = 1 - p.life / p.max;
        switch (p.kind) {
          case K.SPARK: {
            const len = 0.03;
            ctx.strokeStyle = p.color2 && t > 0.5 ? p.color2 : p.color;
            ctx.globalAlpha = 1 - t * 0.7;
            ctx.lineWidth = p.size;
            ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * len, p.y - p.vy * len); ctx.stroke();
            break;
          }
          case K.STREAK: {
            ctx.strokeStyle = p.color; ctx.globalAlpha = 1 - t; ctx.lineWidth = p.size;
            ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.04, p.y - p.vy * 0.04); ctx.stroke();
            break;
          }
          case K.GLOW: case K.EMBER: {
            const s = p.size + (p.size1 - p.size) * t;
            ctx.globalAlpha = p.alpha * (1 - t) * (p.kind === K.EMBER ? (0.6 + 0.4 * Math.sin(p.life * 20)) : 1);
            const img = GP.Draw.glowSprite(p.color);
            const r = p.kind === K.EMBER ? s * 3 : s;
            ctx.drawImage(img, p.x - r, p.y - r, r * 2, r * 2);
            break;
          }
          case K.SMOKE: case K.DUST: {
            const s = p.size + (p.size1 - p.size) * t;
            ctx.globalAlpha = p.alpha * (t < 0.1 ? t * 10 : 1 - (t - 0.1) / 0.9);
            ctx.drawImage(GP.Draw.glowSprite(p.color), p.x - s, p.y - s, s * 2, s * 2);
            break;
          }
          case K.CHUNK: {
            ctx.globalAlpha = Math.min(1, p.life * 2);
            ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
            ctx.fillStyle = p.color; ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.7);
            ctx.restore();
            break;
          }
          case K.RING: {
            const r = p.size + (p.size1 - p.size) * GP.M.smooth(Math.min(1, t * 1.3));
            ctx.globalAlpha = p.alpha * (1 - t);
            ctx.strokeStyle = p.color; ctx.lineWidth = p.drag * (1 - t) + 0.01;
            ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.stroke();
            break;
          }
          case K.BLOOD: {
            ctx.globalAlpha = Math.min(1, p.life * 2);
            ctx.fillStyle = p.color;
            ctx.beginPath(); ctx.ellipse(p.x, p.y, p.size, p.size * (1 + Math.min(1.5, Math.abs(p.vy) * 0.08)), Math.atan2(p.vy, p.vx) - Math.PI / 2, 0, 7); ctx.fill();
            break;
          }
          case K.FLAKE: {
            ctx.globalAlpha = p.alpha * Math.min(1, p.life);
            ctx.fillStyle = p.color;
            ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
            break;
          }
        }
      }
      ctx.globalAlpha = 1;
      if (drawAdd) {
        // electric arcs
        for (const a of arcs) {
          const t = a.life / a.max;
          const segs = 8;
          const dx = a.x2 - a.x1, dy = a.y2 - a.y1, len = Math.hypot(dx, dy) || 1;
          const nx = -dy / len, ny = dx / len;
          const jit = Math.min(0.35, len * 0.18);
          for (let pass = 0; pass < 2; pass++) {
            ctx.strokeStyle = pass === 0 ? a.color : '#ffffff';
            ctx.lineWidth = pass === 0 ? a.width * 3 : a.width;
            ctx.globalAlpha = pass === 0 ? 0.35 * t : 0.9 * t;
            ctx.beginPath(); ctx.moveTo(a.x1, a.y1);
            for (let i = 1; i < segs; i++) {
              const f = i / segs, off = (Math.random() * 2 - 1) * jit;
              ctx.lineTo(a.x1 + dx * f + nx * off, a.y1 + dy * f + ny * off);
            }
            ctx.lineTo(a.x2, a.y2); ctx.stroke();
          }
        }
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
      }
    },
  };
  return api;
})();
