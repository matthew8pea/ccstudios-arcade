/* GALACTIC PLAYGROUND — drawing helpers and a tiny vector-art format.
 * Art lists are arrays of primitives in local meters, drawn in an entity's authoring frame:
 *   {t:'rect', x, y, w, h, f, s, r, lw}      centered rectangle (optional corner radius r)
 *   {t:'poly', p:[x0,y0,...], f, s, lw}
 *   {t:'circle', x, y, r, f, s, lw}
 *   {t:'line', p:[x0,y0,...], s, lw, cap}
 *   {t:'glow', x, y, r, c, a}                 additive glow dot
 *   {t:'arc', x, y, r, a0, a1, s, lw, f}
 * Colors: f = fill, s = stroke. A stroke of true uses the default outline color.
 */
'use strict';

GP.Draw = (() => {
  const OUTLINE = '#0a0e17';
  const glowCache = new Map();

  function glowSprite(color) {
    let c = glowCache.get(color);
    if (c) return c;
    c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    const rgb = GP.M.hexToRgb(color);
    grad.addColorStop(0, `rgba(${rgb.r},${rgb.g},${rgb.b},1)`);
    grad.addColorStop(0.25, `rgba(${rgb.r},${rgb.g},${rgb.b},0.55)`);
    grad.addColorStop(0.6, `rgba(${rgb.r},${rgb.g},${rgb.b},0.14)`);
    grad.addColorStop(1, `rgba(${rgb.r},${rgb.g},${rgb.b},0)`);
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    glowCache.set(color, c);
    return c;
  }

  function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function fillStroke(ctx, f, s, lw) {
    if (f) { ctx.fillStyle = f; ctx.fill(); }
    if (s) { ctx.strokeStyle = s === true ? OUTLINE : s; ctx.lineWidth = lw || 0.022; ctx.stroke(); }
  }

  function art(ctx, list, tint) {
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      const f = tint && a.f ? tint(a.f) : a.f;
      switch (a.t) {
        case 'rect':
          if (a.r) roundRect(ctx, a.x - a.w / 2, a.y - a.h / 2, a.w, a.h, a.r);
          else { ctx.beginPath(); ctx.rect(a.x - a.w / 2, a.y - a.h / 2, a.w, a.h); }
          fillStroke(ctx, f, a.s, a.lw);
          break;
        case 'poly': {
          const p = a.p;
          ctx.beginPath(); ctx.moveTo(p[0], p[1]);
          for (let k = 2; k < p.length; k += 2) ctx.lineTo(p[k], p[k + 1]);
          ctx.closePath();
          fillStroke(ctx, f, a.s, a.lw);
          break;
        }
        case 'circle':
          ctx.beginPath(); ctx.arc(a.x, a.y, a.r, 0, Math.PI * 2);
          fillStroke(ctx, f, a.s, a.lw);
          break;
        case 'arc':
          ctx.beginPath(); ctx.arc(a.x, a.y, a.r, a.a0, a.a1);
          if (a.f) { ctx.closePath(); }
          fillStroke(ctx, f, a.s, a.lw);
          break;
        case 'line': {
          const p = a.p;
          ctx.beginPath(); ctx.moveTo(p[0], p[1]);
          for (let k = 2; k < p.length; k += 2) ctx.lineTo(p[k], p[k + 1]);
          ctx.strokeStyle = a.s || OUTLINE; ctx.lineWidth = a.lw || 0.02; ctx.lineCap = a.cap || 'round';
          ctx.stroke();
          break;
        }
        case 'glow':
          glow(ctx, a.x, a.y, a.r, a.c, a.a != null ? a.a : 0.8);
          break;
      }
    }
  }

  function glow(ctx, x, y, r, color, alpha = 1) {
    const prevOp = ctx.globalCompositeOperation, prevA = ctx.globalAlpha;
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = prevA * alpha;
    ctx.drawImage(glowSprite(color), x - r, y - r, r * 2, r * 2);
    ctx.globalCompositeOperation = prevOp; ctx.globalAlpha = prevA;
  }

  // Transform ctx into a body's authoring frame
  function enterBody(ctx, b) {
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(b.a);
    ctx.translate(b.ox, b.oy);
  }

  // Draw raw physics shapes (debug + default renderer)
  function shapes(ctx, b, fill, stroke, lw) {
    for (const s of b.shapes) {
      if (!s.enabled) continue;
      ctx.beginPath();
      if (s.kind === 'circle') ctx.arc(s.wx, s.wy, s.r, 0, Math.PI * 2);
      else {
        ctx.moveTo(s.wv[0], s.wv[1]);
        for (let i = 1; i < s.n; i++) ctx.lineTo(s.wv[i * 2], s.wv[i * 2 + 1]);
        ctx.closePath();
      }
      if (fill) { ctx.fillStyle = fill; ctx.fill(); }
      if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 0.02; ctx.stroke(); }
    }
  }

  function shapePath(ctx, s) {
    ctx.beginPath();
    if (s.kind === 'circle') ctx.arc(s.wx, s.wy, s.r, 0, Math.PI * 2);
    else {
      ctx.moveTo(s.wv[0], s.wv[1]);
      for (let i = 1; i < s.n; i++) ctx.lineTo(s.wv[i * 2], s.wv[i * 2 + 1]);
      ctx.closePath();
    }
  }

  // Decals (scorch marks, glowing cuts) in body-local frame; call inside body COM frame
  function decals(ctx, b, dt) {
    if (!b.decals) return;
    for (const d of b.decals) {
      d.t += dt;
      if (d.kind === 'scorch') {
        ctx.fillStyle = 'rgba(15,10,8,0.55)';
        ctx.beginPath(); ctx.arc(d.x, d.y, d.size, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(15,10,8,0.3)';
        ctx.beginPath(); ctx.arc(d.x, d.y, d.size * 1.6, 0, Math.PI * 2); ctx.fill();
        if (d.t < 1.5) glow(ctx, d.x, d.y, d.size * 2.5, '#ff7a20', (1.5 - d.t) / 1.5 * 0.8);
      } else if (d.kind === 'cut') {
        const heat = Math.max(0, 1 - d.t / 6);
        ctx.fillStyle = heat > 0 ? GP.M.mix('#2a1206', '#ffb040', heat) : '#2a1206';
        ctx.beginPath(); ctx.arc(d.x, d.y, d.size, 0, Math.PI * 2); ctx.fill();
        if (heat > 0) glow(ctx, d.x, d.y, d.size * 3, d.color || '#ff8a30', heat * 0.9);
      } else if (d.kind === 'wound' || d.kind === 'stump') {
        const c = d.color || '#7a0808';
        ctx.fillStyle = GP.M.shade(c, 0.1);
        ctx.beginPath(); ctx.arc(d.x, d.y, d.size * 1.5, 0, Math.PI * 2); ctx.globalAlpha = 0.45; ctx.fill(); ctx.globalAlpha = 1;
        ctx.fillStyle = c;
        ctx.beginPath(); ctx.arc(d.x, d.y, d.size, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = GP.M.shade(c, -0.5);
        ctx.beginPath(); ctx.arc(d.x, d.y, d.size * (d.kind === 'stump' ? 0.7 : 0.45), 0, Math.PI * 2); ctx.fill();
        if (d.kind === 'stump') { ctx.fillStyle = '#e8dcc8'; ctx.beginPath(); ctx.arc(d.x, d.y, d.size * 0.25, 0, Math.PI * 2); ctx.fill(); }
      } else if (d.kind === 'bloodstain') {
        ctx.fillStyle = d.color || '#7a0808'; ctx.globalAlpha = 0.75;
        ctx.beginPath(); ctx.arc(d.x, d.y, d.size, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
      } else if (d.kind === 'dent') {
        ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 0.015;
        ctx.beginPath(); ctx.arc(d.x, d.y, d.size, 0.3, 2.6); ctx.stroke();
      }
    }
  }

  // Hologram-style highlight outline around a body's shapes
  function highlight(ctx, b, color, pulse) {
    ctx.save();
    ctx.globalAlpha = 0.5 + 0.3 * (pulse || 0);
    shapes(ctx, b, GP.M.rgba(color, 0.12), color, 0.035);
    ctx.restore();
  }

  return { OUTLINE, art, glow, glowSprite, roundRect, enterBody, shapes, shapePath, decals, highlight };
})();

/* Camera: world meters <-> screen pixels. */
GP.Camera = class Camera {
  constructor() {
    this.x = 0; this.y = 0; this.zoom = 1; this.base = 46;
    this.tx = 0; this.ty = 0; this.tzoom = 1;
    this.shake = 0; this.sx = 0; this.sy = 0;
    this.w = 800; this.h = 600; this.dpr = 1;
    this.follow = null;
    this.bounds = null;
    // The playable part of the map. Zoomed in, the camera stops at its borders. Zoomed out further than
    // it fits, the map stays in view and the solid material painted around it (`outer`, which also
    // limits how far out you can zoom) fills the rest, so the empty void beyond is never shown.
    this.view = null;
    this.outer = null;
  }
  get scale() { return this.base * this.zoom * this.dpr; }
  setViewport(w, h, dpr) { this.w = w; this.h = h; this.dpr = dpr; }
  toScreen(wx, wy) {
    const s = this.base * this.zoom;
    return { x: (wx - this.x - this.sx) * s + this.w / 2, y: (wy - this.y - this.sy) * s + this.h / 2 };
  }
  toWorld(sx, sy) {
    const s = this.base * this.zoom;
    return { x: (sx - this.w / 2) / s + this.x + this.sx, y: (sy - this.h / 2) / s + this.y + this.sy };
  }
  viewRect(pad = 0) {
    const s = this.base * this.zoom;
    const hw = this.w / 2 / s + pad, hh = this.h / 2 / s + pad;
    return { minX: this.x - hw, maxX: this.x + hw, minY: this.y - hh, maxY: this.y + hh };
  }
  addShake(amount) { if (GP.Settings.g.screenShake) this.shake = Math.min(1.2, this.shake + amount); }
  jumpTo(x, y, zoom) { this.x = this.tx = x; this.y = this.ty = y; if (zoom) this.zoom = this.tzoom = zoom; }
  // smallest zoom at which the screen still fits inside the map and its solid surround
  minZoom() {
    const v = this.outer || this.view;
    if (!v) return 0.18;
    return Math.max(0.18, this.w / ((v.maxX - v.minX) * this.base), this.h / ((v.maxY - v.minY) * this.base));
  }
  zoomAt(factor, sx, sy) {
    const before = this.toWorld(sx, sy);
    this.tzoom = GP.M.clamp(this.tzoom * factor, this.minZoom(), 4);
    this.zoom = this.tzoom;
    const after = this.toWorld(sx, sy);
    // keep the point under the cursor still, relative to where the camera is heading (so zooming
    // while it glides doesn't jump)
    this.tx += before.x - after.x; this.ty += before.y - after.y;
    this.x += before.x - after.x; this.y += before.y - after.y;
    this.clampToView();
  }
  update(dt) {
    if (this.follow) {
      const p = this.follow();
      if (p) { this.tx = p.x; this.ty = p.y - 1; }
    }
    const k = 1 - Math.exp(-dt * (this.follow ? 6 : 14));
    this.x += (this.tx - this.x) * k;
    this.y += (this.ty - this.y) * k;
    this.clampToView();
    if (this.shake > 0) {
      const m = this.shake * this.shake * 0.5;
      this.sx = (Math.random() * 2 - 1) * m; this.sy = (Math.random() * 2 - 1) * m;
      this.shake = Math.max(0, this.shake - dt * 1.8);
    } else { this.sx = this.sy = 0; }
  }
  clampToView() {
    const v = this.view;
    if (!v) {
      const b = this.bounds;
      if (b) { this.x = GP.M.clamp(this.x, b.minX, b.maxX); this.y = GP.M.clamp(this.y, b.minY, b.maxY); this.tx = GP.M.clamp(this.tx, b.minX, b.maxX); this.ty = GP.M.clamp(this.ty, b.minY, b.maxY); }
      return;
    }
    const mz = this.minZoom();
    if (this.zoom < mz) this.zoom = mz;
    if (this.tzoom < mz) this.tzoom = mz;
    const s = this.base * this.zoom, hw = this.w / 2 / s, hh = this.h / 2 / s;
    // Zoomed in: the screen stays inside the map. Zoomed out wider than the map: the whole map stays on
    // screen (you can slide it from edge to edge) and the solid surround shows beyond it.
    const lim = (a, lo, hi, half) => lo + half <= hi - half ? GP.M.clamp(a, lo + half, hi - half) : GP.M.clamp(a, hi - half, lo + half);
    const o = this.outer;
    const cx = (a) => { a = lim(a, v.minX, v.maxX, hw); return o ? lim(a, o.minX, o.maxX, hw) : a; };
    const cy = (a) => { a = lim(a, v.minY, v.maxY, hh); return o ? lim(a, o.minY, o.maxY, hh) : a; };
    this.x = cx(this.x); this.tx = cx(this.tx); this.y = cy(this.y); this.ty = cy(this.ty);
  }
  apply(ctx) {
    const s = this.scale;
    ctx.setTransform(s, 0, 0, s, this.w * this.dpr / 2 - (this.x + this.sx) * s, this.h * this.dpr / 2 - (this.y + this.sy) * s);
  }
};
