/* GALACTIC PLAYGROUND — renderer.
 * Draw order: background -> terrain (cached tiles, see terrain.js) -> world decals -> entities (by layer) -> frozen tint ->
 * constraints -> smoke/dust -> glow pass (blades, engines) -> bolts -> additive FX ->
 * dynamic lighting -> tool overlays -> physics debug.
 */
'use strict';

GP.Renderer = class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.light = document.createElement('canvas');
    this.lctx = this.light.getContext('2d');
    this.dpr = 1;
    this.w = 0; this.h = 0;
  }
  resize(cam) {
    const rs = GP.Settings.g.resolutionScale || 1;
    const dpr = Math.min(2, window.devicePixelRatio || 1) * rs;
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    if (w !== this.w || h !== this.h || dpr !== this.dpr) {
      this.w = w; this.h = h; this.dpr = dpr;
      this.canvas.width = Math.max(1, Math.round(w * dpr));
      this.canvas.height = Math.max(1, Math.round(h * dpr));
      this.light.width = Math.max(1, Math.round(w * dpr / 2));
      this.light.height = Math.max(1, Math.round(h * dpr / 2));
    }
    cam.setViewport(w, h, dpr);
  }

  // Past the map's frame the walls, floor and ceiling carry on as solid material, so zooming out
  // never shows the empty space around the level.
  surround(ctx, game, vr) {
    const f = game.mapFrame;
    if (!f) return;
    const x0 = vr.minX - 1, x1 = vr.maxX + 1, y0 = vr.minY - 1, y1 = vr.maxY + 1;
    if (x0 > f.minX && x1 < f.maxX && y1 < f.bottom && (f.top == null || y0 > f.top)) return;
    ctx.save();
    ctx.beginPath();
    const r = (a, b, c, d) => { if (c > a && d > b) ctx.rect(a, b, c - a, d - b); };
    const inset = 0.05;   // tuck under the frame's own edges so no seam shows
    r(x0, y0, Math.min(x1, f.minX + inset), y1);
    r(Math.max(x0, f.maxX - inset), y0, x1, y1);
    r(f.minX, Math.max(y0, f.bottom - inset), f.maxX, y1);
    if (f.top != null) r(f.minX, y0, f.maxX, Math.min(y1, f.top + inset));
    ctx.fillStyle = f.fill || '#1a1c22';
    ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fill();
    ctx.restore();
  }

  render(game, frameDt, simDt, alpha = 1) {
    const ctx = this.ctx, cam = game.camera;
    this.resize(cam);
    const W = this.canvas.width, H = this.canvas.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    const map = game.map;
    if (map && map.drawBackground) map.drawBackground(ctx, cam, W, H, game.time, this.dpr);
    else { ctx.fillStyle = '#05070d'; ctx.fillRect(0, 0, W, H); }
    cam.apply(ctx);
    const vr = cam.viewRect(2);
    if (map && map.drawBackdrop) map.drawBackdrop(ctx, cam, game.time);
    this.surround(ctx, game, vr);
    GP.Terrain.draw(ctx, game, cam);
    GP.Decals.draw(ctx);
    if (GP.Settings.g.shadows !== false) this.shadows(ctx, game, vr);
    // entities
    const list = game.entities;
    const layers = [[], [], [], [], []];
    for (const e of list) {
      if (e.removed || !e.bodies.length) continue;
      const b = e.body;
      const r = b.radius + 3 * e.scale;
      if (b.x + r < vr.minX || b.x - r > vr.maxX || b.y + r < vr.minY || b.y - r > vr.maxY) { if (!e.isVehicle) continue; }
      layers[GP.M.clamp(e.layer | 0, 0, 4)].push(e);
    }
    const dtDraw = simDt;
    for (const L of layers) for (const e of L) {
      try { e.draw(ctx, dtDraw); } catch (err) { this.drawError(e, err); }
    }
    // frozen tint
    ctx.globalAlpha = 1;
    for (const e of list) {
      if (e.removed) continue;
      for (const b of e.bodies) if (b.frozen && !b.removed) {
        ctx.save(); ctx.globalAlpha = 0.35;
        GP.Draw.shapes(ctx, b, '#8ad8ff', '#d8f4ff', 0.03);
        ctx.restore();
      }
    }
    if (GP.Heat) GP.Heat.drawTints(ctx, game, vr);
    if (GP.Fluid) GP.Fluid.draw(ctx, cam, vr);
    if (map && map.hasWater) this.drawWater(ctx, game, vr);
    if (game.tools) game.tools.drawConstraints(ctx);
    if (GP.Wires) GP.Wires.draw(ctx);
    GP.FX.draw(ctx, cam, 'normal');
    // glow pass
    for (const L of layers) for (const e of L) if (e.drawGlow) { try { e.drawGlow(ctx); } catch (err) { /* ignore */ } }
    GP.Projectiles.draw(ctx, alpha);
    GP.FX.draw(ctx, cam, 'add');
    if (map && map.drawForeground) map.drawForeground(ctx, cam, game.time);
    // lighting
    const dark = game.darkness != null ? game.darkness : map ? map.darkness : 0;
    if (map && dark > 0 && GP.Settings.g.lighting) this.lighting(game, map, dark);
    if (GP.Settings.g.vignette !== false) this.vignette(ctx, map);
    cam.apply(ctx);
    if (GP.Settings.g.thermalView && GP.Heat) GP.Heat.drawThermal(ctx, game, vr);
    if (GP.Settings.g.detailView) this.detail(ctx, game, vr);
    if (game.tools) game.tools.drawOverlay(ctx, cam);
    if (GP.Settings.g.showDebug) this.debug(ctx, game, vr);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    GP.FX.clearFrameLights();
    void frameDt; void H;
  }

  // Soft ellipses on the ground under anything standing near it (static terrain only)
  shadows(ctx, game, vr) {
    if (!this.shadowSprite) {
      const c = document.createElement('canvas'); c.width = 64; c.height = 64;
      const g = c.getContext('2d'); const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, 'rgba(0,0,0,0.55)'); gr.addColorStop(0.55, 'rgba(0,0,0,0.3)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
      this.shadowSprite = c;
    }
    const W = game.world, img = this.shadowSprite;
    const onTerrain = (s) => !s.sensor && !s.body.entity && s.body.terrain && s.tag !== 'water' && s.tag !== 'lava';
    for (const e of game.entities) {
      if (e.removed || e.hidden || !e.bodies.length || e.kind === 'fragment' || e.kind === 'debris' || (e.isItem && e.holder) || e.vehicle) continue;
      const b = e.body;
      if (b.x < vr.minX - 3 || b.x > vr.maxX + 3 || b.y < vr.minY - 3 || b.y > vr.maxY + 6) continue;
      let minX = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const p of e.bodies) for (const s of p.shapes) { if (s.minX < minX) minX = s.minX; if (s.maxX > maxX) maxX = s.maxX; if (s.maxY > maxY) maxY = s.maxY; }
      const w = maxX - minX;
      if (!(w > 0.18)) continue;
      const cx = (minX + maxX) / 2;
      const reach = 2.5 + w;
      const hit = W.raycast(cx, maxY - 0.05, cx, maxY + reach, onTerrain);
      if (!hit) continue;
      const d = Math.max(0, hit.y - maxY);
      const k = 1 - d / reach;
      if (k <= 0.05) continue;
      const sw = (w * 0.75 + 0.25) * (1 + d * 0.25), sh = Math.min(0.35, 0.1 + w * 0.06) * (1 + d * 0.15);
      ctx.globalAlpha = Math.min(0.9, k * (e.isCharacterLike ? 0.9 : 0.7));
      ctx.drawImage(img, cx - sw, hit.y - sh * 0.55, sw * 2, sh * 2);
    }
    ctx.globalAlpha = 1;
  }

  vignette(ctx, map) {
    const W = this.canvas.width, H = this.canvas.height;
    if (!this.vig || this.vig.w !== W || this.vig.h !== H) {
      const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.hypot(W, H) * 0.6);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.42)');
      this.vig = { w: W, h: H, g };
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = map && map.vignette != null ? map.vignette : 1;
    ctx.fillStyle = this.vig.g; ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
  }

  lighting(game, map, dark) {
    const lc = this.lctx, cam = game.camera;
    const lw = this.light.width, lh = this.light.height;
    lc.setTransform(1, 0, 0, 1, 0, 0);
    lc.globalCompositeOperation = 'source-over';
    lc.clearRect(0, 0, lw, lh);
    lc.fillStyle = map.lightColor || '#050814';
    lc.globalAlpha = dark;
    lc.fillRect(0, 0, lw, lh);
    lc.globalAlpha = 1;
    const s = cam.scale / 2;
    lc.setTransform(s, 0, 0, s, lw / 2 - (cam.x + cam.sx) * s, lh / 2 - (cam.y + cam.sy) * s);
    lc.globalCompositeOperation = 'destination-out';
    const vr = cam.viewRect(4);
    const white = GP.Draw.glowSprite('#ffffff');
    for (const L of GP.FX.lights()) {
      if (L.x + L.r < vr.minX || L.x - L.r > vr.maxX || L.y + L.r < vr.minY || L.y - L.r > vr.maxY) continue;
      const a = GP.M.clamp(L.intensity * (L.life / L.max), 0, 1);
      lc.globalAlpha = a;
      if (L.cone) {
        const g = lc.createRadialGradient(L.x, L.y, 0, L.x, L.y, L.r);
        g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.6, 'rgba(255,255,255,0.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
        lc.fillStyle = g;
        lc.beginPath(); lc.moveTo(L.x, L.y); lc.arc(L.x, L.y, L.r, L.angle - L.spread, L.angle + L.spread); lc.closePath(); lc.fill();
        continue;
      }
      lc.drawImage(white, L.x - L.r, L.y - L.r, L.r * 2, L.r * 2);
    }
    for (const Ls of map.staticLights || []) {
      lc.globalAlpha = Ls.i || 0.8;
      lc.drawImage(white, Ls.x - Ls.r, Ls.y - Ls.r, Ls.r * 2, Ls.r * 2);
    }
    lc.globalAlpha = 1;
    lc.globalCompositeOperation = 'source-over';
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.light, 0, 0, this.canvas.width, this.canvas.height);
  }

  debug(ctx, game, vr) {
    const w = game.world;
    ctx.lineWidth = 0.02;
    for (const b of w.bodies) {
      for (const s of b.shapes) {
        if (s.maxX < vr.minX || s.minX > vr.maxX || s.maxY < vr.minY || s.minY > vr.maxY) continue;
        ctx.strokeStyle = !s.enabled ? 'rgba(120,120,120,0.3)' : s.sensor ? '#ff66ff' : b.type === 0 ? '#44dd77' : b.type === 1 ? '#ffcc33' : b.sleeping ? '#666a80' : '#55b8ff';
        GP.Draw.shapePath(ctx, s); ctx.stroke();
      }
      if (b.type === 2) { ctx.fillStyle = '#fff'; ctx.fillRect(b.x - 0.02, b.y - 0.02, 0.04, 0.04); }
    }
    for (const j of w.joints) {
      if (!j.a || !j.b) continue;
      const a = j.kind === 'target' ? { x: j.tx, y: j.ty } : j.anchorA(), b = j.anchorB();
      ctx.strokeStyle = j.kind === 'weld' ? '#ff8844' : j.kind === 'distance' ? '#ffee55' : j.kind === 'target' ? '#ff55aa' : '#ffaa33';
      ctx.beginPath(); ctx.moveTo(j.a.x, j.a.y); ctx.lineTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(j.b.x, j.b.y); ctx.stroke();
      ctx.fillStyle = ctx.strokeStyle; ctx.fillRect(a.x - 0.03, a.y - 0.03, 0.06, 0.06);
    }
    ctx.fillStyle = '#ff3355';
    for (const c of w.active) {
      if (c.dead || !c.count) continue;
      for (let i = 0; i < c.count; i++) {
        const p = c.pts[i];
        ctx.fillRect(p.x - 0.025, p.y - 0.025, 0.05, 0.05);
        ctx.strokeStyle = c.enabled ? '#ff3355' : '#888';
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + c.nx * 0.15, p.y + c.ny * 0.15); ctx.stroke();
      }
    }
  }
  drawWater(ctx, game, vr) {
    const t = game.time;
    for (const b of game.world.bodies) {
      if (b.entity || !b.terrain) continue;
      for (const s of b.shapes) {
        if (s.tag !== 'water' || s.maxX < vr.minX || s.minX > vr.maxX) continue;
        const g = ctx.createLinearGradient(0, s.minY, 0, s.maxY);
        g.addColorStop(0, 'rgba(80,170,220,0.42)'); g.addColorStop(1, 'rgba(10,40,90,0.78)');
        ctx.fillStyle = g;
        ctx.beginPath();
        const x0 = Math.max(s.minX, vr.minX - 1), x1 = Math.min(s.maxX, vr.maxX + 1);
        ctx.moveTo(x0, s.maxY);
        for (let x = x0; x <= x1; x += 0.25) ctx.lineTo(x, s.minY + Math.sin(x * 1.3 + t * 2) * 0.04 + Math.sin(x * 0.5 - t) * 0.03);
        ctx.lineTo(x1, s.maxY); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = 'rgba(220,245,255,0.7)'; ctx.lineWidth = 0.04;
        ctx.beginPath();
        for (let x = x0; x <= x1; x += 0.25) { const y = s.minY + Math.sin(x * 1.3 + t * 2) * 0.04 + Math.sin(x * 0.5 - t) * 0.03; if (x === x0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
        ctx.stroke();
        // lakebed and shores are drawn back over the water so it only fills the basin
        ctx.save();
        ctx.beginPath(); ctx.rect(s.minX, s.minY - 0.6, s.maxX - s.minX, s.maxY - s.minY + 0.6); ctx.clip();
        GP.Terrain.draw(ctx, game, game.camera, { rect: { minX: Math.max(s.minX, vr.minX), minY: Math.max(s.minY - 0.6, vr.minY), maxX: Math.min(s.maxX, vr.maxX), maxY: Math.min(s.maxY, vr.maxY) }, noLive: true });
        ctx.restore();
      }
    }
  }
  // Detail view: per-limb health on characters, integrity bars on everything else
  detail(ctx, game, vr) {
    const M = GP.M;
    const col = (f) => (f > 0.6 ? M.mix('#f0d040', '#40e070', (f - 0.6) / 0.4) : M.mix('#ff3030', '#f0d040', Math.max(0, f) / 0.6));
    for (const e of game.entities) {
      if (e.removed || e.hidden || !e.bodies.length) continue;
      const b0 = e.body;
      if (b0.x < vr.minX - 5 || b0.x > vr.maxX + 5 || b0.y < vr.minY - 5 || b0.y > vr.maxY + 5) continue;
      if (e.partList) {
        for (const b of e.partList) {
          const p = b.part;
          const f = p.severed ? -1 : M.clamp(p.hp / p.maxHp, 0, 1);
          ctx.globalAlpha = 0.55;
          GP.Draw.shapes(ctx, b, f < 0 ? '#3a3a3a' : col(f), '#0a0e17', 0.015);
        }
        ctx.globalAlpha = 1;
        const bb = e.bounds();
        const tag = e.state === 'dead' ? 'DEAD' : e.unconscious > 0 ? 'UNCONSCIOUS' : e.stun > 0 ? 'STUNNED' : null;
        if (tag) {
          ctx.font = '0.22px sans-serif'; ctx.textAlign = 'center';
          ctx.fillStyle = e.state === 'dead' ? '#ff5a5a' : '#ffd166';
          ctx.fillText(tag, (bb.minX + bb.maxX) / 2, bb.minY - 0.15);
          ctx.textAlign = 'start';
        }
        continue;
      }
      let f = null;
      if (e.maxHp !== Infinity && e.maxHp > 0) f = e.hp / e.maxHp;
      if (f == null) continue;
      const bb = e.bounds();
      const w = Math.min(2, Math.max(0.6, bb.maxX - bb.minX)), x = (bb.minX + bb.maxX) / 2 - w / 2, y = bb.minY - 0.22;
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(x, y, w, 0.08);
      ctx.fillStyle = col(M.clamp(f, 0, 1)); ctx.fillRect(x, y, w * M.clamp(f, 0, 1), 0.08);
      if (e.comps) {
        let i = 0;
        for (const c of Object.values(e.comps)) { ctx.fillStyle = c.broken ? '#ff3030' : col(c.hp / c.maxHp); ctx.fillRect(x + i * 0.14, y - 0.12, 0.1, 0.08); i++; }
      }
    }
  }
  drawError(e, err) {
    e.drawErrors = (e.drawErrors || 0) + 1;
    if (e.drawErrors === 1) console.error('draw error', e.def && e.def.id, err);
  }
};
