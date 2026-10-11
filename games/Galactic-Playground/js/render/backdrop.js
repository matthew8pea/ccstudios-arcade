/* GALACTIC PLAYGROUND — skies and parallax backdrops.
 *
 * A background config (see maps.js) describes a sky gradient, celestial bodies, clouds, star
 * fields, sky traffic and a stack of parallax layers. Each layer is a silhouette kind (mountains,
 * snowpeaks, dunes, mesas, spires, city, factory, columns) rendered with atmospheric perspective:
 * lighter and hazier toward its base, with fog pooling between layers. Interior maps also get a
 * world-space wall (panels, windows, lamps with volumetric light cones).
 */
'use strict';

GP.Backdrop = (() => {
  const M = GP.M;
  function rng(seed) { let s = seed >>> 0 || 1; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

  /* ------------------------------------------------------------ layer geometry (precomputed) */
  function makeLayer(seed, L) {
    const r = rng(seed);
    const pts = [];
    let x = -400;
    while (x < 400) {
      const w = L.spacing * (0.5 + r());
      pts.push({ x, w, h: L.minH + r() * (L.maxH - L.minH), v: r(), v2: r() });
      x += w;
    }
    let ridge = null;
    if (L.kind === 'mountains' || L.kind === 'snowpeaks') {
      // peaks and valleys, then midpoint displacement for a natural ridgeline
      let pl = [[-400, pts[0].h * 0.25]];
      for (const p of pts) { pl.push([p.x + p.w * 0.5, p.h]); pl.push([p.x + p.w, p.h * 0.25]); }
      for (let level = 0; level < 3; level++) {
        const out = [pl[0]];
        for (let i = 1; i < pl.length; i++) {
          const a = pl[i - 1], b = pl[i];
          const len = Math.abs(b[0] - a[0]);
          out.push([(a[0] + b[0]) / 2 + (r() - 0.5) * len * 0.15, (a[1] + b[1]) / 2 + (r() - 0.5) * len * 0.18 / (level + 1)]);
          out.push(b);
        }
        pl = out;
      }
      ridge = pl;
    }
    return Object.assign({}, L, { pts, ridge });
  }

  /* ------------------------------------------------------------ sky pieces */
  function skyGradient(ctx, W, H, colors) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    colors.forEach((c, i) => g.addColorStop(i / (colors.length - 1), c));
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }

  function drawStars(ctx, cam, W, H, seed, count, dpr, t) {
    const r = rng(seed);
    const s = cam.base * cam.zoom * dpr;
    for (let i = 0; i < count; i++) {
      const wx = r() * 2000 - 1000, wy = r() * 800 - 600, sz = r(), tw = r();
      let x = (wx - cam.x * 0.05) * s * 0.2 + W / 2, y = (wy - cam.y * 0.05) * s * 0.2 + H / 2;
      x = ((x % W) + W) % W; y = ((y % H) + H) % H;
      const a = (0.25 + sz * 0.75) * (tw > 0.7 ? 0.65 + 0.35 * Math.sin(t * (1 + tw * 3) + i) : 1);
      ctx.globalAlpha = a;
      ctx.fillStyle = tw > 0.93 ? '#bcd4ff' : tw < 0.05 ? '#ffe2c0' : '#ffffff';
      const z = (sz > 0.97 ? 2.2 : sz > 0.8 ? 1.4 : 0.9) * dpr;
      ctx.fillRect(x, y, z, z);
      if (sz > 0.985) { ctx.globalAlpha = a * 0.35; ctx.fillRect(x - z * 1.5, y + z * 0.4, z * 4, z * 0.25); ctx.fillRect(x + z * 0.4, y - z * 1.5, z * 0.25, z * 4); }
    }
    ctx.globalAlpha = 1;
  }

  // position in the far parallax plane used for suns, planets, clouds and sky traffic
  function farXY(cam, W, H, dpr, x, y, factor = 0.03) {
    const s = cam.base * cam.zoom * dpr * 0.15;
    return { x: W / 2 + (x - cam.x * factor) * s, y: H / 2 + (y - cam.y * factor) * s, s };
  }

  function drawBody(ctx, cam, W, H, dpr, o, t) {
    const p = farXY(cam, W, H, dpr, o.x, o.y);
    const r = o.r * dpr * (0.8 + cam.zoom * 0.2);
    if (o.glow) {
      const g = ctx.createRadialGradient(p.x, p.y, r * 0.5, p.x, p.y, r * 5);
      g.addColorStop(0, M.rgba(o.glow, 0.45)); g.addColorStop(0.35, M.rgba(o.glow, 0.12)); g.addColorStop(1, M.rgba(o.glow, 0));
      ctx.fillStyle = g; ctx.fillRect(p.x - r * 5, p.y - r * 5, r * 10, r * 10);
    }
    const g2 = ctx.createRadialGradient(p.x - r * 0.3, p.y - r * 0.3, r * 0.1, p.x, p.y, r);
    g2.addColorStop(0, o.c1); g2.addColorStop(1, o.c2);
    ctx.fillStyle = g2; ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill();
    if (o.bands) { // gas-giant banding
      ctx.save(); ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.clip();
      for (let i = -4; i <= 4; i++) { ctx.fillStyle = i % 2 ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.07)'; ctx.fillRect(p.x - r, p.y + i * r * 0.2 + Math.sin(t * 0.05 + i) * r * 0.02, r * 2, r * 0.12); }
      const sh = ctx.createLinearGradient(p.x - r, p.y - r, p.x + r, p.y + r); sh.addColorStop(0.45, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(0,0,10,0.55)');
      ctx.fillStyle = sh; ctx.fillRect(p.x - r, p.y - r, r * 2, r * 2);
      ctx.restore();
    }
    if (o.ring) { ctx.strokeStyle = M.rgba(o.ring, 0.6); ctx.lineWidth = 3 * dpr; ctx.beginPath(); ctx.ellipse(p.x, p.y, r * 1.7, r * 0.35, -0.3, 0, Math.PI * 2); ctx.stroke(); }
  }

  function drawRays(ctx, cam, W, H, dpr, o, t) {
    const p = farXY(cam, W, H, dpr, o.x, o.y);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const L = Math.max(W, H) * 1.4;
    for (let i = 0; i < 7; i++) {
      const a = Math.PI / 2 + (i - 3) * 0.2 + Math.sin(t * 0.07 + i * 1.7) * 0.05 + (o.x > 0 ? 0.25 : -0.25);
      const wdt = 0.03 + (i % 3) * 0.015;
      const g = ctx.createLinearGradient(p.x, p.y, p.x + Math.cos(a) * L, p.y + Math.sin(a) * L);
      g.addColorStop(0, M.rgba(o.glow || '#fff4d0', 0.1)); g.addColorStop(1, M.rgba(o.glow || '#fff4d0', 0));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x + Math.cos(a - wdt) * L, p.y + Math.sin(a - wdt) * L);
      ctx.lineTo(p.x + Math.cos(a + wdt) * L, p.y + Math.sin(a + wdt) * L);
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }

  function drawClouds(ctx, cam, W, H, dpr, c, seed, t) {
    const r = rng(seed + 991);
    const span = 900;
    for (let i = 0; i < (c.count || 8); i++) {
      const bx = r() * span - span / 2, by = (c.y || -70) + r() * (c.spread || 40), sc = (0.6 + r() * 0.9) * (c.scale || 1);
      const puffs = 4 + Math.floor(r() * 4);
      const speed = (c.speed || 1) * (0.6 + r() * 0.8);
      let x = ((bx + t * speed + span * 10) % span) - span / 2;
      const p = farXY(cam, W, H, dpr, x, by, c.factor || 0.04);
      const unit = p.s * sc * 3;
      if (p.x < -unit * 12 || p.x > W + unit * 12) { for (let k = 0; k < puffs; k++) { r(); r(); r(); } continue; }
      for (let k = 0; k < puffs; k++) {
        const ox = (r() - 0.5) * 7 * unit, oy = (r() - 0.6) * 1.6 * unit, rr = (1.2 + r() * 1.6) * unit;
        ctx.fillStyle = M.rgba(c.shadow || c.color, (c.alpha || 0.5) * 0.6);
        ctx.beginPath(); ctx.ellipse(p.x + ox, p.y + oy + rr * 0.25, rr * 1.4, rr * 0.8, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = M.rgba(c.color, c.alpha || 0.5);
        ctx.beginPath(); ctx.ellipse(p.x + ox, p.y + oy, rr * 1.3, rr * 0.7, 0, 0, Math.PI * 2); ctx.fill();
      }
    }
  }

  // distant ships crossing the sky: original silhouettes, deterministic per map
  function shipShape(ctx, kind, x, y, sz, dir, color, glow) {
    ctx.save(); ctx.translate(x, y); ctx.scale(dir * sz, sz);
    ctx.fillStyle = color;
    ctx.beginPath();
    if (kind === 'wedge') { ctx.moveTo(10, 0); ctx.lineTo(-7, -3.2); ctx.lineTo(-7.6, -2.2); ctx.lineTo(-8, 2); ctx.lineTo(-7, 2.8); ctx.closePath(); ctx.fill(); ctx.fillRect(-6, -4.4, 3, 1.3); ctx.fillRect(-5.2, -5.3, 1.3, 1); }
    else if (kind === 'freighter') { ctx.ellipse(0, 0, 3, 1.4, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillRect(1.5, -0.4, 2.8, 0.8); }
    else { ctx.moveTo(2.4, 0); ctx.lineTo(-1.6, -0.6); ctx.lineTo(-1.2, 0); ctx.lineTo(-1.6, 0.6); ctx.closePath(); ctx.fill(); ctx.fillRect(-1.2, -1.6, 0.5, 3.2); }
    ctx.restore();
    const ex = x - dir * sz * (kind === 'wedge' ? 8.2 : kind === 'freighter' ? 3.1 : 1.7);
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    GP.Draw.glow(ctx, ex, y, sz * (kind === 'wedge' ? 3.5 : 1.8), glow, 0.8);
    if (kind === 'wedge') { ctx.fillStyle = M.rgba(glow, 0.6); for (let i = 0; i < 6; i++) ctx.fillRect(x + dir * sz * (6 - i * 2.2), y + sz * (-2 + (i % 2) * 2.8), sz * 0.25, sz * 0.25); }
    ctx.restore();
  }
  function drawTraffic(ctx, cam, W, H, dpr, tr, seed, t) {
    const r = rng(seed + 313);
    const span = 700;
    for (let i = 0; i < (tr.count || 3); i++) {
      const kind = i === 0 && tr.freighter !== false ? 'freighter' : 'fighter';
      const y = (tr.y || -80) + r() * (tr.spread || 50), speed = (kind === 'fighter' ? 18 : 6) * (0.6 + r() * 0.8), dir = r() > 0.5 ? 1 : -1, off = r() * span;
      const x = ((off + dir * t * speed) % span + span * 2) % span - span / 2;
      const p = farXY(cam, W, H, dpr, x, y, 0.02);
      if (p.x < -40 || p.x > W + 40) continue;
      shipShape(ctx, kind, p.x, p.y, dpr * (kind === 'fighter' ? 1.8 : 2.6) * (tr.scale || 1), dir, tr.color || '#2a2e38', tr.glow || '#8ad0ff');
    }
    if (tr.capital) {
      const c = tr.capital;
      const p = farXY(cam, W, H, dpr, c.x + t * (c.drift || 0.4), c.y, 0.015);
      shipShape(ctx, 'wedge', p.x, p.y, dpr * (c.size || 9), c.dir || 1, c.color || '#3a404c', c.glow || '#9ad8ff');
    }
  }

  /* ------------------------------------------------------------ parallax layers */
  function drawLayer(ctx, cam, W, H, L, dpr, t, cfg) {
    const s = cam.base * cam.zoom * dpr;
    const f = L.factor;
    const ox = W / 2 - cam.x * f * s, oy = H / 2 - (cam.y * f + (L.yOff || 0)) * s;
    const base = L.base;
    const toX = (x) => ox + x * s, toY = (y) => oy + y * s;
    const bottom = H + 10;
    const haze = cfg.haze || cfg.sky[cfg.sky.length - 1];
    const topY = toY(base - L.maxH), baseY = toY(base);
    if (topY > H + 20) return;
    const grad = ctx.createLinearGradient(0, Math.min(topY, baseY - 1), 0, baseY);
    grad.addColorStop(0, L.color);
    grad.addColorStop(1, M.mix(L.color, haze.startsWith('#') ? haze : '#808080', L.hazeMix != null ? L.hazeMix : 0.35));
    const xmin = cam.x * f - W / 2 / s - 10, xmax = cam.x * f + W / 2 / s + 10;

    if (L.kind === 'mountains' || L.kind === 'snowpeaks') {
      ctx.beginPath(); ctx.moveTo(toX(-400), bottom);
      for (const [x, h] of L.ridge) { if (x < xmin - 60 || x > xmax + 60) continue; ctx.lineTo(toX(x), toY(base - h)); }
      ctx.lineTo(toX(400), bottom); ctx.closePath();
      ctx.fillStyle = grad; ctx.fill();
      ctx.save(); ctx.clip();
      // far faces in shade (fading into the haze below), lit ridgelines
      const sg = ctx.createLinearGradient(0, topY, 0, baseY);
      sg.addColorStop(0, 'rgba(0,0,0,0.1)'); sg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = sg;
      for (const p of L.pts) {
        if (p.x + p.w < xmin || p.x > xmax) continue;
        ctx.beginPath(); ctx.moveTo(toX(p.x + p.w * 0.5), toY(base - p.h)); ctx.lineTo(toX(p.x + p.w), toY(base - p.h * 0.25)); ctx.lineTo(toX(p.x + p.w), baseY); ctx.lineTo(toX(p.x + p.w * 0.52), baseY); ctx.fill();
      }
      if (L.kind === 'snowpeaks') {
        ctx.fillStyle = L.cap || '#f4f8ff';
        for (const p of L.pts) {
          if (p.x + p.w < xmin || p.x > xmax) continue;
          const px = p.x + p.w * 0.5, capH = p.h * (0.62 + p.v2 * 0.12);
          ctx.beginPath(); ctx.moveTo(toX(px), toY(base - p.h - 1));
          const n = 7;
          for (let k = 0; k <= n; k++) {
            const x = px + (k / n - 0.5) * p.w * 0.8;
            const y = base - capH + (k % 2 ? 0.6 : -0.2) * (1 - Math.abs(k / n - 0.5)) * p.h * 0.12;
            ctx.lineTo(toX(x), toY(y));
          }
          ctx.closePath(); ctx.fill();
        }
        ctx.fillStyle = 'rgba(80,110,160,0.18)';
        for (const p of L.pts) { if (p.x + p.w < xmin || p.x > xmax) continue; ctx.beginPath(); ctx.moveTo(toX(p.x + p.w * 0.5), toY(base - p.h)); ctx.lineTo(toX(p.x + p.w * 0.85), toY(base - p.h * 0.3)); ctx.lineTo(toX(p.x + p.w * 0.6), toY(base - p.h * 0.3)); ctx.fill(); }
      }
      ctx.restore();
      ctx.strokeStyle = M.rgba('#ffffff', L.rim != null ? L.rim : 0.07); ctx.lineWidth = 1.2 * dpr;
      ctx.beginPath(); let first = true;
      for (const [x, h] of L.ridge) { if (x < xmin - 60 || x > xmax + 60) continue; const X = toX(x), Y = toY(base - h); if (first) { ctx.moveTo(X, Y); first = false; } else ctx.lineTo(X, Y); }
      ctx.stroke();
    } else if (L.kind === 'dunes') {
      ctx.beginPath(); ctx.moveTo(toX(-400), bottom);
      let lastX = -400, lastY = base;
      ctx.lineTo(toX(-400), toY(base));
      for (const p of L.pts) { ctx.quadraticCurveTo(toX(p.x + p.w * 0.5), toY(base - p.h), toX(p.x + p.w), toY(base - p.h * 0.3)); lastX = p.x + p.w; lastY = base - p.h * 0.3; }
      ctx.lineTo(toX(400), bottom); ctx.closePath();
      ctx.fillStyle = grad; ctx.fill();
      ctx.strokeStyle = M.rgba('#ffffff', L.rim != null ? L.rim : 0.12); ctx.lineWidth = 1.2 * dpr;
      ctx.beginPath(); ctx.moveTo(toX(-400), toY(base));
      for (const p of L.pts) ctx.quadraticCurveTo(toX(p.x + p.w * 0.5), toY(base - p.h), toX(p.x + p.w), toY(base - p.h * 0.3));
      ctx.stroke();
      void lastX; void lastY;
    } else if (L.kind === 'columns') {
      for (const p of L.pts) {
        const x = toX(p.x), w = 2.2 * s * f * 1.4, top = toY(base - 40);
        if (x > W + 50 || x + w < -50) continue;
        const g = ctx.createLinearGradient(x, 0, x + w, 0);
        g.addColorStop(0, M.shade(L.color, -0.3)); g.addColorStop(0.4, M.shade(L.color, 0.15)); g.addColorStop(1, M.shade(L.color, -0.4));
        ctx.fillStyle = g;
        ctx.fillRect(x, top, w, bottom - top);
        ctx.fillStyle = 'rgba(0,0,0,0.12)';
        for (let k = 1; k < 5; k++) ctx.fillRect(x + w * k / 5, top, Math.max(1, w * 0.03), bottom - top);
      }
    } else {
      // skylines: mesas, spires, city, factory
      for (const p of L.pts) {
        const x = toX(p.x), w = p.w * s * (L.kind === 'spires' ? 0.35 : 0.85), y = toY(base - p.h);
        if (x > W + 60 || x + w < -60) continue;
        ctx.fillStyle = grad;
        if (L.kind === 'spires') {
          ctx.beginPath(); ctx.moveTo(x, bottom); ctx.lineTo(x + w * 0.3, y); ctx.lineTo(x + w * 0.5, y - w * 0.8); ctx.lineTo(x + w * 0.7, y); ctx.lineTo(x + w, bottom); ctx.fill();
          ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.beginPath(); ctx.moveTo(x + w * 0.5, y - w * 0.8); ctx.lineTo(x + w * 0.7, y); ctx.lineTo(x + w, bottom); ctx.lineTo(x + w * 0.55, bottom); ctx.fill();
          if (L.windows) { ctx.fillStyle = L.windows; for (let k = 0; k < 4; k++) if (((p.v * 97 + k * 13) | 0) % 3 === 0) ctx.fillRect(x + w * 0.45, y + (k + 1) * w * 0.9, Math.max(1.5, w * 0.1), Math.max(2, w * 0.18)); }
        } else if (L.kind === 'mesas') {
          ctx.beginPath(); ctx.moveTo(x - w * 0.2, bottom); ctx.lineTo(x, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w * 1.2, bottom); ctx.fill();
          ctx.save(); ctx.clip();
          ctx.fillStyle = 'rgba(120,60,20,0.06)';
          for (let k = 0; k < 2; k++) ctx.fillRect(x - w * 0.3, y + (0.18 + k * 0.2) * (baseY - y), w * 1.6, Math.max(1, (baseY - y) * 0.04));
          ctx.fillStyle = 'rgba(0,0,0,0.1)'; ctx.beginPath(); ctx.moveTo(x + w, y); ctx.lineTo(x + w * 1.2, bottom); ctx.lineTo(x + w * 1.02, bottom); ctx.lineTo(x + w * 0.9, y); ctx.fill();
          ctx.restore();
          ctx.fillStyle = 'rgba(255,240,210,0.18)'; ctx.fillRect(x, y, w, Math.max(1, dpr));
        } else {
          building(ctx, L, p, x, y, w, bottom, dpr, t, s);
        }
      }
    }
    // fog pooling at the foot of this layer
    if (cfg.haze && L.fog !== 0) {
      const fa = L.fog != null ? L.fog : 0.22;
      const g = ctx.createLinearGradient(0, toY(base - L.maxH * 0.35), 0, toY(base + 2));
      g.addColorStop(0, M.rgba(cfg.haze, 0)); g.addColorStop(1, M.rgba(cfg.haze, fa));
      ctx.fillStyle = g; ctx.fillRect(0, toY(base - L.maxH * 0.35), W, bottom);
    }
  }

  function building(ctx, L, p, x, y, w, bottom, dpr, t, s) {
    const style = L.style || 'blocks';
    const v = p.v;
    ctx.beginPath();
    if (L.kind === 'factory') {
      ctx.rect(x, y, w, bottom - y);
      if (v > 0.45) { const cx = x + w * (0.15 + p.v2 * 0.5), ch = (bottom - y) * 0.45; ctx.rect(cx, y - ch, w * 0.12, ch); smoke(ctx, cx + w * 0.06, y - ch, w, t, p, dpr); }
    } else if (style === 'domes' && v < 0.35) {
      const dh = w * 0.42;
      ctx.rect(x, y + dh * 0.4, w, bottom - y - dh * 0.4);
      ctx.moveTo(x + w * 0.08, y + dh * 0.45); ctx.ellipse(x + w / 2, y + dh * 0.45, w * 0.42, dh, 0, Math.PI, 0);
      ctx.rect(x + w / 2 - Math.max(1, w * 0.02), y - dh * 0.9, Math.max(2, w * 0.04), dh * 0.5);
    } else if (v < 0.6) {
      ctx.rect(x, y + (bottom - y) * 0.18, w, (bottom - y) * 0.82);
      ctx.rect(x + w * 0.2, y, w * 0.6, (bottom - y) * 0.2);
    } else if (v < 0.8) {
      ctx.rect(x + w * 0.1, y, w * 0.8, bottom - y);
      ctx.moveTo(x + w * 0.1, y); ctx.lineTo(x + w * 0.5, y - w * 0.7); ctx.lineTo(x + w * 0.9, y);
    } else {
      ctx.rect(x, y, w, bottom - y);
    }
    ctx.fillStyle = L.color; ctx.fill();
    // shaded side
    ctx.save(); ctx.clip();
    ctx.fillStyle = 'rgba(0,0,0,0.14)'; ctx.fillRect(x + w * 0.66, y - w, w * 0.5, bottom - y + w);
    ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fillRect(x, y - w, w * 0.12, bottom - y + w);
    ctx.restore();
    if (L.windows) {
      ctx.fillStyle = L.windows;
      const ww = Math.max(1.5, 3 * dpr * Math.min(1.4, s / 40)), gap = ww * 3;
      for (let wy = y + gap * 1.2; wy < bottom - 4; wy += gap) for (let wx = x + gap * 0.6; wx < x + w - ww - 1; wx += gap * 0.9) {
        const k = ((wx * 7 + wy * 3 + p.v * 1000) | 0);
        if (k % 4 === 0) ctx.fillRect(wx, wy, ww, ww * 1.3);
      }
    }
    if (L.beacons && v > 0.5) { const a = 0.5 + 0.5 * Math.sin(t * 2.5 + p.v * 30); ctx.fillStyle = M.rgba('#ff3a2a', a); ctx.fillRect(x + w / 2 - dpr, y - 2 * dpr, 2 * dpr, 2 * dpr); }
  }
  function smoke(ctx, x, y, w, t, p, dpr) {
    ctx.save();
    for (let k = 0; k < 6; k++) {
      const ph = (t * 0.12 + k / 6 + p.v) % 1;
      ctx.fillStyle = `rgba(40,34,30,${(1 - ph) * 0.22})`;
      ctx.beginPath(); ctx.arc(x + ph * w * 0.6 + Math.sin(ph * 5 + k) * 4 * dpr, y - ph * 90 * dpr, (3 + ph * 22) * dpr, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  /* ------------------------------------------------------------ assembled background */
  function make(cfg) {
    const layers = (cfg.layers || []).map((L, i) => makeLayer(cfg.seed + i * 17, L));
    return function drawBackground(ctx, cam, W, H, t, dpr) {
      t = t || 0;
      skyGradient(ctx, W, H, cfg.sky);
      if (cfg.stars) drawStars(ctx, cam, W, H, cfg.seed, cfg.stars, dpr, t);
      if (cfg.nebula) {
        const g = ctx.createRadialGradient(W * 0.3 - cam.x * 0.5, H * 0.3, 0, W * 0.3 - cam.x * 0.5, H * 0.3, W * 0.6);
        g.addColorStop(0, M.rgba(cfg.nebula, 0.22)); g.addColorStop(1, M.rgba(cfg.nebula, 0));
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
        if (cfg.nebula2) { const g2 = ctx.createRadialGradient(W * 0.8 - cam.x * 0.3, H * 0.6, 0, W * 0.8 - cam.x * 0.3, H * 0.6, W * 0.45); g2.addColorStop(0, M.rgba(cfg.nebula2, 0.16)); g2.addColorStop(1, M.rgba(cfg.nebula2, 0)); ctx.fillStyle = g2; ctx.fillRect(0, 0, W, H); }
      }
      for (const b of cfg.bodies || []) drawBody(ctx, cam, W, H, dpr, b, t);
      if (cfg.rays && cfg.bodies && cfg.bodies[0] && GP.Settings.g.quality !== 'low') drawRays(ctx, cam, W, H, dpr, cfg.bodies[0], t);
      if (cfg.traffic) drawTraffic(ctx, cam, W, H, dpr, cfg.traffic, cfg.seed, t);
      if (cfg.clouds) drawClouds(ctx, cam, W, H, dpr, cfg.clouds, cfg.seed, t);
      for (const L of layers) drawLayer(ctx, cam, W, H, L, dpr, t, cfg);
      if (cfg.flashes && Math.random() < 0.01) { ctx.fillStyle = 'rgba(255,200,140,0.08)'; ctx.fillRect(0, 0, W, H); }
      if (cfg.haze) { const g = ctx.createLinearGradient(0, H * 0.5, 0, H); g.addColorStop(0, M.rgba(cfg.haze, 0)); g.addColorStop(1, M.rgba(cfg.haze, 0.3)); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); }
    };
  }

  /* ------------------------------------------------------------ interior wall (world space) */
  function winPath(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function interior(o) {
    return function (ctx, cam, t) {
      const vr = cam.viewRect(2);
      const x1 = Math.max(vr.minX, o.minX), x2 = Math.min(vr.maxX, o.maxX);
      const y1 = Math.max(vr.minY, o.minY), y2 = Math.min(vr.maxY, o.maxY);
      if (x2 <= x1 || y2 <= y1) return;
      // the wall is painted around its windows (even-odd clip), so the sky shows through them
      ctx.save();
      ctx.beginPath(); ctx.rect(x1, y1, x2 - x1, y2 - y1);
      for (const w of o.windows || []) winPath(ctx, w.x, w.y, w.w, w.h, 0.4);
      ctx.clip('evenodd');
      ctx.fillStyle = o.color; ctx.fillRect(x1, y1, x2 - x1, y2 - y1);
      const sx = o.panelW || 4, sy = o.panelH || 3;
      // per-panel tone variation
      if (o.color.startsWith('#')) {
        for (let x = Math.floor(x1 / sx) * sx; x < x2; x += sx) for (let y = Math.floor(y1 / sy) * sy; y < y2; y += sy) {
          const v = GP.Terrain.hash(Math.round(x / sx), Math.round(y / sy), 77);
          ctx.fillStyle = v > 0.5 ? `rgba(255,255,255,${(v - 0.5) * 0.05})` : `rgba(0,0,0,${(0.5 - v) * 0.12})`;
          ctx.fillRect(Math.max(x, x1), Math.max(y, y1), sx, sy);
        }
      }
      ctx.strokeStyle = o.line || 'rgba(255,255,255,0.04)'; ctx.lineWidth = 0.05;
      ctx.beginPath();
      for (let x = Math.floor(x1 / sx) * sx; x < x2; x += sx) { ctx.moveTo(x, y1); ctx.lineTo(x, y2); }
      for (let y = Math.floor(y1 / sy) * sy; y < y2; y += sy) { ctx.moveTo(x1, y); ctx.lineTo(x2, y); }
      ctx.stroke();
      ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.lineWidth = 0.05;
      ctx.beginPath();
      for (let x = Math.floor(x1 / sx) * sx; x < x2; x += sx) { ctx.moveTo(x + 0.06, y1); ctx.lineTo(x + 0.06, y2); }
      ctx.stroke();
      // darker toward ceiling and floor
      const g = ctx.createLinearGradient(0, o.minY, 0, Math.min(o.maxY, 0));
      g.addColorStop(0, 'rgba(0,0,0,0.35)'); g.addColorStop(0.35, 'rgba(0,0,0,0)'); g.addColorStop(0.85, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.3)');
      ctx.fillStyle = g; ctx.fillRect(x1, y1, x2 - x1, y2 - y1);
      if (o.pipes) {
        ctx.lineWidth = 0.35;
        for (const y of o.pipeY || []) {
          ctx.strokeStyle = o.pipes; ctx.beginPath(); ctx.moveTo(x1, y); ctx.lineTo(x2, y); ctx.stroke();
          ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 0.08; ctx.beginPath(); ctx.moveTo(x1, y - 0.1); ctx.lineTo(x2, y - 0.1); ctx.stroke(); ctx.lineWidth = 0.35;
          ctx.fillStyle = 'rgba(0,0,0,0.3)';
          for (let x = Math.floor(x1 / 6) * 6; x < x2; x += 6) ctx.fillRect(x, y - 0.25, 0.25, 0.5);
        }
      }
      ctx.restore();
      if (o.windows) for (const w of o.windows) {
        ctx.save();
        GP.Draw.roundRect(ctx, w.x, w.y, w.w, w.h, 0.4); ctx.clip();
        // faint glass reflection
        ctx.fillStyle = 'rgba(180,220,255,0.05)';
        ctx.beginPath(); ctx.moveTo(w.x + w.w * 0.1, w.y); ctx.lineTo(w.x + w.w * 0.35, w.y); ctx.lineTo(w.x + w.w * 0.15, w.y + w.h); ctx.lineTo(w.x - w.w * 0.1, w.y + w.h); ctx.fill();
        ctx.restore();
        ctx.strokeStyle = o.frame || '#1a1f2a'; ctx.lineWidth = 0.35;
        GP.Draw.roundRect(ctx, w.x, w.y, w.w, w.h, 0.4); ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 0.06;
        GP.Draw.roundRect(ctx, w.x - 0.15, w.y - 0.15, w.w + 0.3, w.h + 0.3, 0.5); ctx.stroke();
        if (w.bars) { ctx.strokeStyle = o.frame || '#1a1f2a'; ctx.lineWidth = 0.15; ctx.beginPath(); for (let bx = w.x + w.w / w.bars; bx < w.x + w.w - 0.1; bx += w.w / w.bars) { ctx.moveTo(bx, w.y); ctx.lineTo(bx, w.y + w.h); } ctx.stroke(); }
      }
      if (o.lamps) for (const l of o.lamps) {
        if (l.x < vr.minX - 12 || l.x > vr.maxX + 12) continue;
        const c = l.c || '#ffe8b0';
        const flick = l.flicker ? 0.6 + Math.random() * 0.4 : 1;
        // volumetric cone down to the floor
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        const floor = Math.min(o.maxY, 0);
        const cg = ctx.createLinearGradient(0, l.y, 0, floor);
        cg.addColorStop(0, M.rgba(c, 0.11 * flick)); cg.addColorStop(1, M.rgba(c, 0));
        ctx.fillStyle = cg;
        ctx.beginPath(); ctx.moveTo(l.x - 0.6, l.y + 0.1); ctx.lineTo(l.x + 0.6, l.y + 0.1); ctx.lineTo(l.x + 5, floor); ctx.lineTo(l.x - 5, floor); ctx.fill();
        ctx.restore();
        ctx.fillStyle = '#2a2e36'; ctx.fillRect(l.x - 0.75, l.y - 0.25, 1.5, 0.2);
        ctx.fillStyle = c; ctx.fillRect(l.x - 0.6, l.y - 0.1, 1.2, 0.2);
        GP.Draw.glow(ctx, l.x, l.y + 0.3, 2.5, c, (0.25 + (l.flicker ? Math.random() * 0.2 : 0)));
      }
      if (o.decor) o.decor(ctx, vr, t);
    };
  }

  return { make, interior, rng };
})();
