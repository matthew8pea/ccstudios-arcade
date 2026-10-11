/* GALACTIC PLAYGROUND — terrain art.
 *
 * Static terrain is painted once into screen-resolution tiles and reused every frame, so it can
 * carry far more detail than a per-frame fill: material textures anchored to world coordinates
 * (continuous across the separate physics pieces a ground is built from), light-to-dark depth
 * shading below the surface, a surface crust (grass, sand, snow) and procedural decorations along
 * every upward-facing edge. Animated terrain (lava, force fields, conveyor chevrons, moving
 * crushers) is drawn live on top.
 *
 * Style fields (all optional, on top of fill / edge / pattern / outline):
 *   tex      'soil' | 'panels' | 'bricks' | 'marble' | 'grate' | 'ice' | 'plain'
 *   top      crust color, topW crust thickness (m)
 *   deco     'grass' | 'sand' | 'snow' | 'rubble' | 'embers' | 'moss'
 *   depth    0..1 how much deeper ground darkens
 *   specks   [dark, light] texture colors
 *   shadow   depth-shading color (default black), grit 0..1 stone/speck density
 */
'use strict';

GP.Terrain = (() => {
  const M = GP.M;
  const TILE = 512;
  const MAX_TILES = 40;

  // deterministic hash of integer coordinates -> [0, 1)
  function hash(x, y, s = 0) {
    let h = (x * 374761393 + y * 668265263 + s * 2246822519) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  // Defaults for styles that predate the richer fields
  function style(T) {
    if (T._art) return T._art;
    const p = T.pattern;
    const natural = p === 'strata' || T.tex === 'soil';
    const a = {
      tex: T.tex || (natural ? 'soil' : p === 'panels' ? 'panels' : p === 'bricks' ? 'bricks' : p === 'marble' ? 'marble' : p === 'grate' ? 'grate' : p === 'ice' ? 'ice' : p === 'hazard' ? 'hazard' : 'plain'),
      top: T.top || null,
      topW: T.topW || 0.3,
      deco: T.deco || null,
      depth: T.depth != null ? T.depth : natural ? 0.45 : 0,
      specks: T.specks || [M.shade(T.fill, -0.25), M.shade(T.fill, 0.18)],
      shadow: T.shadow || '#000000',
      grit: T.grit != null ? T.grit : 0.55,
      natural,
    };
    T._art = a;
    return a;
  }

  const isLive = (b, s) => s.tag === 'lava' || s.tag === 'forcefield' || s.tag === 'water' || b.type !== GP.Phys.STATIC;

  /* ------------------------------------------------------------ geometry */
  function tops(s) {
    const out = [];
    if (s.kind !== 'poly') return out;
    for (let i = 0; i < s.n; i++) {
      if (s.wn[i * 2 + 1] < -0.5) {
        const j = (i + 1) % s.n;
        let x1 = s.wv[i * 2], y1 = s.wv[i * 2 + 1], x2 = s.wv[j * 2], y2 = s.wv[j * 2 + 1];
        if (x1 > x2) { [x1, x2] = [x2, x1]; [y1, y2] = [y2, y1]; }
        out.push([x1, y1, x2, y2]);
      }
    }
    return out;
  }
  function pathAll(ctx, shapes) { ctx.beginPath(); for (const s of shapes) addPath(ctx, s); }
  function addPath(ctx, s) {
    if (s.kind === 'circle') { ctx.moveTo(s.wx + s.r, s.wy); ctx.arc(s.wx, s.wy, s.r, 0, Math.PI * 2); return; }
    ctx.moveTo(s.wv[0], s.wv[1]);
    for (let i = 1; i < s.n; i++) ctx.lineTo(s.wv[i * 2], s.wv[i * 2 + 1]);
    ctx.closePath();
  }
  function strokeTops(ctx, edges) { ctx.beginPath(); for (const e of edges) { ctx.moveTo(e[0], e[1]); ctx.lineTo(e[2], e[3]); } ctx.stroke(); }

  /* ------------------------------------------------------------ textures (clipped, world anchored) */
  function texture(ctx, T, A, r, px) {
    const tex = A.tex;
    if (tex === 'soil') {
      // soft horizontal banding
      const bh = 0.9;
      for (let k = Math.floor(r.minY / bh); k * bh < r.maxY; k++) {
        const v = hash(k, 7, 3);
        ctx.fillStyle = v > 0.5 ? M.rgba(A.specks[1], (v - 0.5) * 0.14) : M.rgba(A.specks[0], (0.5 - v) * 0.2);
        ctx.beginPath();
        const y0 = k * bh;
        ctx.moveTo(r.minX, y0 + Math.sin(r.minX * 0.4 + k) * 0.15);
        for (let x = Math.floor(r.minX); x <= r.maxX + 1; x += 1) ctx.lineTo(x, y0 + Math.sin(x * 0.4 + k) * 0.15);
        for (let x = Math.ceil(r.maxX) + 1; x >= r.minX - 1; x -= 1) ctx.lineTo(x, y0 + bh + Math.sin(x * 0.4 + k + 1) * 0.15);
        ctx.fill();
      }
      // stones and grit
      const cell = Math.max(0.28, 5 / px);
      const i0 = Math.floor(r.minX / cell), i1 = Math.ceil(r.maxX / cell), j0 = Math.floor(r.minY / cell), j1 = Math.ceil(r.maxY / cell);
      for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
        const h = hash(i, j, 11);
        if (h > A.grit) continue;
        const x = (i + hash(i, j, 12)) * cell, y = (j + hash(i, j, 13)) * cell;
        const big = h < 0.04 * A.grit / 0.55;
        const rr = big ? cell * (0.35 + hash(i, j, 14) * 0.4) : cell * (0.07 + hash(i, j, 15) * 0.12);
        ctx.fillStyle = h < 0.3 ? M.rgba(A.specks[0], big ? 0.55 : 0.5) : M.rgba(A.specks[1], 0.35);
        ctx.beginPath(); ctx.ellipse(x, y, rr * 1.3, rr, hash(i, j, 16) * 3, 0, Math.PI * 2); ctx.fill();
        if (big && px > 18) { ctx.fillStyle = M.rgba(A.specks[1], 0.3); ctx.beginPath(); ctx.ellipse(x - rr * 0.3, y - rr * 0.35, rr * 0.6, rr * 0.35, 0, 0, Math.PI * 2); ctx.fill(); }
      }
    } else if (tex === 'panels') {
      const step = T.step || 2, hs = step * 0.5;
      const dark = T.patternColor || 'rgba(0,0,0,0.25)';
      for (let x = Math.floor(r.minX / step) * step; x < r.maxX; x += step) for (let y = Math.floor(r.minY / hs) * hs; y < r.maxY; y += hs) {
        const v = hash(Math.round(x / step), Math.round(y / hs), 5);
        ctx.fillStyle = v > 0.5 ? `rgba(255,255,255,${(v - 0.5) * 0.08})` : `rgba(0,0,0,${(0.5 - v) * 0.16})`;
        ctx.fillRect(x, y, step, hs);
      }
      ctx.lineWidth = Math.max(0.025, 1.2 / px);
      ctx.strokeStyle = dark; ctx.beginPath();
      for (let x = Math.floor(r.minX / step) * step; x < r.maxX; x += step) { ctx.moveTo(x, r.minY); ctx.lineTo(x, r.maxY); }
      for (let y = Math.floor(r.minY / hs) * hs; y < r.maxY; y += hs) { ctx.moveTo(r.minX, y); ctx.lineTo(r.maxX, y); }
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.07)'; ctx.beginPath();
      const o = ctx.lineWidth;
      for (let x = Math.floor(r.minX / step) * step; x < r.maxX; x += step) { ctx.moveTo(x + o, r.minY); ctx.lineTo(x + o, r.maxY); }
      for (let y = Math.floor(r.minY / hs) * hs; y < r.maxY; y += hs) { ctx.moveTo(r.minX, y + o); ctx.lineTo(r.maxX, y + o); }
      ctx.stroke();
      if (px > 22) {
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        for (let x = Math.floor(r.minX / step) * step; x < r.maxX; x += step) for (let y = Math.floor(r.minY / hs) * hs; y < r.maxY; y += hs) {
          for (const [dx, dy] of [[0.15, 0.12], [step - 0.15, 0.12], [0.15, hs - 0.12], [step - 0.15, hs - 0.12]]) { ctx.beginPath(); ctx.arc(x + dx, y + dy, 0.035, 0, Math.PI * 2); ctx.fill(); }
        }
      }
    } else if (tex === 'bricks') {
      const h = 0.5, w = 1.2;
      for (let row = Math.floor(r.minY / h); row * h < r.maxY; row++) {
        const off = (row & 1) * w / 2;
        for (let c = Math.floor((r.minX - off) / w); c * w + off < r.maxX; c++) {
          const v = hash(c, row, 9);
          ctx.fillStyle = v > 0.5 ? `rgba(255,240,210,${(v - 0.5) * 0.14})` : `rgba(40,20,0,${(0.5 - v) * 0.2})`;
          ctx.fillRect(c * w + off, row * h, w, h);
        }
      }
      ctx.strokeStyle = T.patternColor || 'rgba(60,40,20,0.25)'; ctx.lineWidth = Math.max(0.03, 1.2 / px);
      ctx.beginPath();
      for (let row = Math.floor(r.minY / h); row * h < r.maxY; row++) {
        const y = row * h; ctx.moveTo(r.minX, y); ctx.lineTo(r.maxX, y);
        const off = (row & 1) * w / 2;
        for (let x = Math.floor((r.minX - off) / w) * w + off; x < r.maxX; x += w) { ctx.moveTo(x, y); ctx.lineTo(x, y + h); }
      }
      ctx.stroke();
    } else if (tex === 'marble') {
      const cellW = 4;
      for (let x = Math.floor(r.minX / cellW) * cellW; x < r.maxX; x += cellW) {
        const v = hash(Math.round(x / cellW), 1, 21);
        ctx.fillStyle = v > 0.5 ? `rgba(255,255,255,${(v - 0.5) * 0.12})` : `rgba(90,70,40,${(0.5 - v) * 0.1})`;
        ctx.fillRect(x, r.minY, cellW, r.maxY - r.minY);
        ctx.strokeStyle = T.patternColor || 'rgba(120,100,70,0.16)'; ctx.lineWidth = 0.03;
        for (let k = 0; k < 3; k++) {
          const sx = x + hash(Math.round(x), k, 22) * cellW;
          ctx.beginPath(); ctx.moveTo(sx, r.minY);
          ctx.bezierCurveTo(sx + 1.2, r.minY + 1.5, sx - 0.8, r.minY + 3, sx + 0.6 + hash(k, Math.round(x), 23), r.maxY);
          ctx.stroke();
        }
        ctx.strokeStyle = 'rgba(70,50,30,0.2)'; ctx.lineWidth = 0.02;
        ctx.beginPath(); ctx.moveTo(x, r.minY); ctx.lineTo(x, r.maxY); ctx.stroke();
      }
    } else if (tex === 'grate') {
      const g = 0.4;
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      for (let x = Math.floor(r.minX / g) * g; x < r.maxX; x += g) ctx.fillRect(x + g * 0.3, r.minY, g * 0.35, r.maxY - r.minY);
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      for (let x = Math.floor(r.minX / g) * g; x < r.maxX; x += g) ctx.fillRect(x + g * 0.65, r.minY, g * 0.06, r.maxY - r.minY);
    } else if (tex === 'ice') {
      ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 0.025;
      for (let x = Math.floor(r.minX / 2.2) * 2.2; x < r.maxX; x += 2.2) {
        const k = Math.round(x / 2.2);
        ctx.beginPath(); ctx.moveTo(x + hash(k, 1, 31), r.minY + 0.05);
        ctx.lineTo(x + 0.6 + hash(k, 2, 31), r.minY + 0.35 + hash(k, 3, 31) * 0.3);
        ctx.lineTo(x + 0.3 + hash(k, 4, 31) * 1.2, r.maxY);
        ctx.stroke();
      }
    } else if (tex === 'hazard') {
      ctx.fillStyle = 'rgba(255,200,40,0.42)';
      for (let x = Math.floor(r.minX) - 3; x < r.maxX + 3; x += 0.8) { ctx.beginPath(); ctx.moveTo(x, r.maxY); ctx.lineTo(x + 0.4, r.maxY); ctx.lineTo(x + 0.4 + (r.maxY - r.minY), r.minY); ctx.lineTo(x + (r.maxY - r.minY), r.minY); ctx.fill(); }
    }
  }

  /* ------------------------------------------------------------ depth: lighter near the surface, darker below */
  let maskCv = null;
  function depthShade(ctx, shapes, edges, A, r, sb) {
    if (!edges.length || A.depth <= 0) return;
    if (!maskCv) maskCv = document.createElement('canvas');
    const cw = ctx.canvas.width, ch = ctx.canvas.height;
    if (maskCv.width !== cw || maskCv.height !== ch) { maskCv.width = cw; maskCv.height = ch; }
    const m = maskCv.getContext('2d');
    m.setTransform(1, 0, 0, 1, 0, 0); m.clearRect(0, 0, cw, ch);
    m.setTransform(ctx.getTransform());
    m.globalCompositeOperation = 'source-over';
    m.fillStyle = A.shadow; pathAll(m, shapes); m.fill();
    m.globalCompositeOperation = 'destination-out';
    m.lineCap = 'round'; m.lineJoin = 'round';
    for (const [w, a] of [[1.1, 0.35], [2.4, 0.3], [4, 0.25], [6.5, 0.2], [10, 0.15]]) { m.globalAlpha = a; m.strokeStyle = '#000'; m.lineWidth = w; strokeTops(m, edges); }
    m.globalAlpha = 1; m.globalCompositeOperation = 'source-over';
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = A.depth;
    ctx.globalCompositeOperation = 'source-atop';
    ctx.drawImage(maskCv, 0, 0);
    ctx.restore();
    void r; void sb;
  }

  /* ------------------------------------------------------------ surface crust and decorations */
  function crust(ctx, edges, A, px) {
    if (!A.top || !edges.length) return;
    ctx.lineCap = 'round';
    ctx.strokeStyle = A.top; ctx.lineWidth = A.topW * 2; strokeTops(ctx, edges);
    // ragged lower boundary of the crust
    ctx.fillStyle = A.top;
    const cell = Math.max(0.16, 4 / px);
    for (const [x1, y1, x2, y2] of edges) {
      for (let i = Math.ceil(x1 / cell); i * cell < x2; i++) {
        const x = i * cell, t = (x - x1) / ((x2 - x1) || 1), y = y1 + (y2 - y1) * t;
        const h = hash(i, 3, 41);
        if (h < 0.55) { ctx.beginPath(); ctx.ellipse(x, y + A.topW * (0.8 + h * 0.6), cell * (0.4 + h), A.topW * (0.25 + h * 0.5), 0, 0, Math.PI * 2); ctx.fill(); }
      }
    }
    ctx.strokeStyle = M.rgba(M.shade(A.top, 0.3), 0.8); ctx.lineWidth = Math.max(0.04, 1.5 / px); strokeTops(ctx, edges);
  }

  function decorate(ctx, edges, A, px) {
    const d = A.deco;
    if (!d || !edges.length) return;
    const cell = d === 'grass' ? Math.max(0.08, 2.5 / px) : Math.max(0.2, 5 / px);
    const seed = d.length * 13;
    for (const [x1, y1, x2, y2] of edges) {
      const len = x2 - x1;
      if (len <= 0) continue;
      const slope = (y2 - y1) / len;
      for (let i = Math.ceil(x1 / cell); i * cell < x2; i++) {
        const x = i * cell, y = y1 + slope * (x - x1);
        const h = hash(i, seed, 51), h2 = hash(i, seed, 52), h3 = hash(i, seed, 53);
        if (d === 'grass') {
          if (h > 0.85) continue;
          const tall = 0.07 + h2 * 0.22 * (h3 > 0.9 ? 1.8 : 1);
          const lean = (h3 - 0.5) * 0.14 + 0.03;
          ctx.strokeStyle = h < 0.4 ? '#5e9a34' : h < 0.7 ? '#78b442' : '#8ec852';
          ctx.lineWidth = Math.max(0.018, 0.9 / px);
          ctx.beginPath(); ctx.moveTo(x, y + 0.03); ctx.quadraticCurveTo(x + lean * 0.3, y - tall * 0.6, x + lean, y - tall); ctx.stroke();
          if (h3 > 0.975) { ctx.fillStyle = h2 > 0.5 ? '#f4e46a' : '#f0f0ff'; ctx.beginPath(); ctx.arc(x + lean, y - tall, 0.03, 0, Math.PI * 2); ctx.fill(); }
        } else if (d === 'sand') {
          if (h < 0.1) { ctx.fillStyle = h2 > 0.5 ? '#a8845a' : '#8a6c4a'; ctx.beginPath(); ctx.ellipse(x, y - 0.03, 0.05 + h3 * 0.07, 0.035 + h3 * 0.04, 0, 0, Math.PI * 2); ctx.fill(); }
          else if (h < 0.125) { // dry scrub
            ctx.strokeStyle = '#8a7048'; ctx.lineWidth = 0.02; ctx.beginPath();
            for (let k = 0; k < 5; k++) { const a = -Math.PI / 2 + (k - 2) * 0.35; ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * 0.22, y + Math.sin(a) * 0.2); }
            ctx.stroke();
          }
        } else if (d === 'snow') {
          if (h < 0.35) { ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.ellipse(x, y, cell * (0.6 + h2), 0.05 + h3 * 0.08, 0, Math.PI, 0); ctx.fill(); }
          if (h > 0.93 && px > 20) { ctx.fillStyle = 'rgba(200,230,255,0.9)'; ctx.fillRect(x, y - 0.02, 0.03, 0.03); }
        } else if (d === 'rubble') {
          if (h < 0.22) { ctx.fillStyle = h2 > 0.5 ? '#4a3e32' : '#6a5a4a'; ctx.beginPath(); ctx.ellipse(x, y - 0.02, 0.04 + h3 * 0.08, 0.03 + h3 * 0.05, h2, 0, Math.PI * 2); ctx.fill(); }
          else if (h < 0.24) { // twisted scrap
            ctx.strokeStyle = '#2a2a2e'; ctx.lineWidth = 0.035; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 0.1, y - 0.18 - h3 * 0.1); ctx.lineTo(x + 0.22, y - 0.12); ctx.stroke();
          } else if (h < 0.3) { // scorched stubble
            ctx.strokeStyle = '#3a2e22'; ctx.lineWidth = 0.02; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 0.03, y - 0.12); ctx.moveTo(x + 0.05, y); ctx.lineTo(x + 0.02, y - 0.08); ctx.stroke();
          }
        } else if (d === 'moss') {
          if (h < 0.3) { ctx.fillStyle = h2 > 0.5 ? '#6a8a3a' : '#4e6e2a'; ctx.beginPath(); ctx.ellipse(x, y, cell * 0.7, 0.05 + h3 * 0.04, 0, Math.PI, 0); ctx.fill(); }
        }
      }
    }
  }

  // glowing fissures on volcanic stone (static glow is cheap once it lives in the tile cache)
  function embers(ctx, edges, r) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const [x1, y1, x2, y2] of edges) {
      for (let i = Math.ceil(x1 / 1.6); i * 1.6 < x2; i++) {
        const h = hash(i, 5, 61);
        if (h > 0.45) continue;
        const x = i * 1.6 + hash(i, 6, 61) * 0.8, y = y1 + (y2 - y1) * ((x - x1) / ((x2 - x1) || 1));
        ctx.strokeStyle = 'rgba(255,90,30,0.55)'; ctx.lineWidth = 0.035;
        ctx.beginPath(); ctx.moveTo(x, y + 0.05);
        let cx = x, cy = y + 0.05;
        for (let k = 0; k < 4; k++) { cx += (hash(i, k, 62) - 0.5) * 0.5; cy += 0.2 + hash(i, k, 63) * 0.35; ctx.lineTo(cx, cy); }
        ctx.stroke();
        GP.Draw.glow(ctx, x, y + 0.3, 0.7, '#ff4a10', 0.25);
      }
    }
    ctx.restore();
    void r;
  }

  /* ------------------------------------------------------------ one group (a seamless ground, or a single piece) */
  function paintGroup(ctx, T, shapes, r, px, seamless) {
    const A = style(T);
    const edges = [];
    for (const s of shapes) for (const e of tops(s)) edges.push(e);
    // base fill: one path for the whole group, so adjacent pieces never show hairline gaps
    pathAll(ctx, shapes);
    ctx.fillStyle = T.fill; ctx.fill();
    ctx.save();
    pathAll(ctx, shapes); ctx.clip();
    texture(ctx, T, A, r, px);
    if (!A.natural && A.tex !== 'hazard') {
      // machined surfaces: soft top-lit gradient
      for (const s of shapes) {
        const g = ctx.createLinearGradient(0, s.minY, 0, Math.min(s.maxY, s.minY + 3));
        g.addColorStop(0, 'rgba(255,255,255,0.10)'); g.addColorStop(1, 'rgba(0,0,0,0.12)');
        ctx.fillStyle = g; ctx.fillRect(s.minX, s.minY, s.maxX - s.minX, Math.min(3, s.maxY - s.minY));
      }
    }
    ctx.restore();
    if (A.depth > 0) depthShade(ctx, shapes, edges, A, r, px);
    ctx.save(); pathAll(ctx, shapes); ctx.clip();
    crust(ctx, edges, A, px);
    if (A.deco === 'embers') embers(ctx, edges, r);
    if (T.edge) { ctx.strokeStyle = T.edge; ctx.lineWidth = A.natural ? Math.max(0.05, 1.6 / px) : (T.edgeW || 0.1); ctx.lineCap = 'round'; strokeTops(ctx, edges); }
    ctx.restore();
    if (!seamless) { ctx.strokeStyle = T.outline || 'rgba(0,0,0,0.5)'; ctx.lineWidth = Math.max(0.03, 1 / px); pathAll(ctx, shapes); ctx.stroke(); }
    if (A.deco !== 'embers') decorate(ctx, edges, A, px);
  }

  /* ------------------------------------------------------------ tile cache */
  const cache = { world: null, tiles: new Map(), pool: [], sig: '' };

  function signature(game) {
    let n = 0;
    for (const b of game.world.bodies) if (!b.entity && b.terrain) n++;
    return n + '|' + (game.mapId || '');
  }
  function reset() {
    for (const t of cache.tiles.values()) cache.pool.push(t.cv);
    cache.tiles.clear();
  }

  function collect(game, rect, pad) {
    const groups = new Map();
    for (const b of game.world.bodies) {
      if (b.entity || !b.terrain) continue;
      for (const s of b.shapes) {
        if (!s.enabled || s.sensor || isLive(b, s)) continue;
        if (s.maxX < rect.minX - pad || s.minX > rect.maxX + pad || s.maxY < rect.minY - pad || s.minY > rect.maxY + pad) continue;
        const key = b.seamless ? b.terrain : s;
        let g = groups.get(key);
        if (!g) { g = { T: b.terrain, shapes: [], seamless: !!b.seamless }; groups.set(key, g); }
        g.shapes.push(s);
      }
    }
    return groups;
  }

  function buildTile(game, tx, ty, sb, tw) {
    const cv = cache.pool.pop() || document.createElement('canvas');
    if (cv.width !== TILE) { cv.width = TILE; cv.height = TILE; }
    const ctx = cv.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, TILE, TILE);
    const x0 = tx * tw, y0 = ty * tw;
    ctx.setTransform(sb, 0, 0, sb, -x0 * sb, -y0 * sb);
    const rect = { minX: x0, minY: y0, maxX: x0 + tw, maxY: y0 + tw };
    const groups = collect(game, rect, 1.5);
    // seamless grounds first so platforms and props-of-terrain sit on top
    const list = Array.from(groups.values()).sort((a, b) => (b.seamless ? 1 : 0) - (a.seamless ? 1 : 0));
    for (const g of list) {
      try { paintGroup(ctx, g.T, g.shapes, rect, sb, g.seamless); } catch (err) { console.warn('terrain tile', err); }
    }
    return cv;
  }

  function draw(ctx, game, cam, opts = {}) {
    if (cache.world !== game.world || cache.sig !== signature(game)) { reset(); cache.world = game.world; cache.sig = signature(game); }
    const s = cam.scale;
    const sb = Math.pow(2, Math.round(Math.log2(s) * 3) / 3);
    const tw = TILE / sb;
    const vr = opts.rect || cam.viewRect(0.5);
    const tx0 = Math.floor(vr.minX / tw), tx1 = Math.floor(vr.maxX / tw), ty0 = Math.floor(vr.minY / tw), ty1 = Math.floor(vr.maxY / tw);
    let budget = cache.tiles.size < 4 ? 64 : 3;
    const W = cam.w * cam.dpr, H = cam.h * cam.dpr;
    const toSX = (wx) => Math.round((wx - cam.x - cam.sx) * s + W / 2), toSY = (wy) => Math.round((wy - cam.y - cam.sy) * s + H / 2);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = true;
    const missing = [];
    for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
      const key = sb.toFixed(3) + ':' + tx + ':' + ty;
      let t = cache.tiles.get(key);
      if (!t && !opts.noBuild && budget > 0) { budget--; t = { cv: buildTile(game, tx, ty, sb, tw), used: 0 }; cache.tiles.set(key, t); }
      if (!t) { missing.push([tx, ty]); continue; }
      t.used = performance.now();
      const x0 = toSX(tx * tw), x1 = toSX((tx + 1) * tw), y0 = toSY(ty * tw), y1 = toSY((ty + 1) * tw);
      ctx.drawImage(t.cv, x0, y0, x1 - x0, y1 - y0);
    }
    ctx.restore();
    // tiles not built yet this frame: plain fill so nothing pops in empty
    if (missing.length) {
      for (const [tx, ty] of missing) {
        const rect = { minX: tx * tw, minY: ty * tw, maxX: (tx + 1) * tw, maxY: (ty + 1) * tw };
        ctx.save(); ctx.beginPath(); ctx.rect(rect.minX, rect.minY, tw, tw); ctx.clip();
        for (const g of collect(game, rect, 0).values()) { pathAll(ctx, g.shapes); ctx.fillStyle = g.T.fill; ctx.fill(); }
        ctx.restore();
      }
    }
    // evict least recently used
    if (cache.tiles.size > MAX_TILES) {
      const arr = Array.from(cache.tiles.entries()).sort((a, b) => a[1].used - b[1].used);
      for (let i = 0; i < arr.length - MAX_TILES; i++) { cache.pool.push(arr[i][1].cv); cache.tiles.delete(arr[i][0]); }
    }
    if (!opts.noLive) drawLive(ctx, game, vr);
  }

  /* ------------------------------------------------------------ animated terrain, drawn every frame */
  function drawLive(ctx, game, vr) {
    const t = game.time;
    for (const b of game.world.bodies) {
      if (b.entity || !b.terrain) continue;
      for (const s of b.shapes) {
        if (!s.enabled || s.maxX < vr.minX || s.minX > vr.maxX || s.maxY < vr.minY || s.minY > vr.maxY) continue;
        if (s.tag === 'lava') lava(ctx, s, t, vr);
        else if (s.tag === 'forcefield') {
          const T = b.terrain;
          GP.Draw.shapePath(ctx, s);
          ctx.fillStyle = M.rgba(T.fill || '#6ec8ff', 0.12 + Math.sin(t * 3) * 0.04); ctx.fill();
          ctx.save(); ctx.clip();
          ctx.strokeStyle = M.rgba(T.fill || '#6ec8ff', 0.25); ctx.lineWidth = 0.03;
          ctx.beginPath();
          for (let y = s.minY + ((t * 0.8) % 0.4); y < s.maxY; y += 0.4) { ctx.moveTo(s.minX, y); ctx.lineTo(s.maxX, y); }
          ctx.stroke(); ctx.restore();
          ctx.strokeStyle = M.rgba(T.fill || '#6ec8ff', 0.7); ctx.lineWidth = 0.03; GP.Draw.shapePath(ctx, s); ctx.stroke();
        } else if (b.type !== GP.Phys.STATIC && !s.sensor) {
          const r = { minX: s.minX, minY: s.minY, maxX: s.maxX, maxY: s.maxY };
          paintGroup(ctx, b.terrain, [s], r, game.camera.scale, false);
        } else if (s.surfaceSpeed) conveyor(ctx, s, t);
      }
    }
  }
  function lava(ctx, s, t, vr) {
    GP.Draw.shapePath(ctx, s);
    const g = ctx.createLinearGradient(0, s.minY, 0, Math.min(s.maxY, s.minY + 3));
    g.addColorStop(0, '#ffe07a'); g.addColorStop(0.15, '#ff8a1a'); g.addColorStop(0.6, '#c8300a'); g.addColorStop(1, '#5a0a02');
    ctx.fillStyle = g; ctx.fill();
    ctx.save(); ctx.clip();
    // slow crust plates drifting across the surface
    const x0 = Math.max(s.minX, vr.minX - 1), x1 = Math.min(s.maxX, vr.maxX + 1);
    ctx.fillStyle = 'rgba(60,10,4,0.45)';
    for (let i = Math.floor((x0 - t * 0.3) / 1.3); i * 1.3 + t * 0.3 < x1; i++) {
      const h = hash(i, 2, 71);
      if (h > 0.55) continue;
      const x = i * 1.3 + t * 0.3, w = 0.4 + h * 0.8;
      ctx.beginPath(); ctx.ellipse(x, s.minY + 0.18 + hash(i, 3, 71) * 0.4, w, 0.08 + h * 0.08, 0, 0, Math.PI * 2); ctx.fill();
    }
    // bubbles
    ctx.fillStyle = 'rgba(255,230,140,0.8)';
    for (let i = Math.floor(x0 / 0.9); i * 0.9 < x1; i++) {
      const ph = (t * (0.4 + hash(i, 4, 72) * 0.5) + hash(i, 5, 72)) % 1;
      const r = 0.05 + ph * 0.12;
      if (hash(i, 6, 72) > 0.5) continue;
      ctx.globalAlpha = 1 - ph;
      ctx.beginPath(); ctx.arc(i * 0.9 + 0.3, s.minY + 0.05, r, Math.PI, 0); ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,240,170,0.9)'; ctx.lineWidth = 0.05;
    ctx.beginPath(); ctx.moveTo(x0, s.minY);
    for (let x = x0; x <= x1; x += 0.3) ctx.lineTo(x, s.minY + Math.sin(x * 2 + t * 1.5) * 0.03);
    ctx.stroke();
  }
  function conveyor(ctx, s, t) {
    ctx.save();
    GP.Draw.shapePath(ctx, s); ctx.clip();
    ctx.strokeStyle = 'rgba(255,210,80,0.55)'; ctx.lineWidth = 0.05;
    const off = (t * s.surfaceSpeed) % 1;
    const dir = Math.sign(s.surfaceSpeed);
    ctx.beginPath();
    for (let x = Math.floor(s.minX) - 1 + off; x < s.maxX + 1; x += 1) {
      ctx.moveTo(x, s.minY + 0.05); ctx.lineTo(x + 0.15 * dir, (s.minY + s.maxY) / 2); ctx.lineTo(x, s.maxY - 0.05);
    }
    ctx.stroke();
    ctx.restore();
  }

  // Forget the cached tiles over one area (a piece of terrain broke or changed there), so only those
  // get repainted instead of the whole cache.
  function invalidate(game, rect) {
    if (cache.world !== game.world) return;
    for (const [key, t] of cache.tiles) {
      const [sb, tx, ty] = key.split(':').map(Number), tw = TILE / sb;
      if (tx * tw > rect.maxX + 1.5 || (tx + 1) * tw < rect.minX - 1.5 || ty * tw > rect.maxY + 1.5 || (ty + 1) * tw < rect.minY - 1.5) continue;
      cache.pool.push(t.cv); cache.tiles.delete(key);
    }
    cache.sig = signature(game);
  }

  // Paint one loose convex piece (flat [x,y,...] verts) in a terrain style, e.g. rubble broken off a
  // structure. The caller sets up the transform; verts are in that frame.
  function paintPiece(ctx, T, verts, px) {
    const n = verts.length / 2;
    let area = 0;
    for (let i = 0; i < n; i++) { const j = (i + 1) % n; area += verts[i * 2] * verts[j * 2 + 1] - verts[j * 2] * verts[i * 2 + 1]; }
    const wv = [];
    if (area < 0) for (let i = n - 1; i >= 0; i--) wv.push(verts[i * 2], verts[i * 2 + 1]); else wv.push(...verts);
    const wn = [];
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n, ex = wv[j * 2] - wv[i * 2], ey = wv[j * 2 + 1] - wv[i * 2 + 1], l = Math.hypot(ex, ey) || 1;
      wn.push(ey / l, -ex / l);
      minX = Math.min(minX, wv[i * 2]); maxX = Math.max(maxX, wv[i * 2]); minY = Math.min(minY, wv[i * 2 + 1]); maxY = Math.max(maxY, wv[i * 2 + 1]);
    }
    const s = { kind: 'poly', n, wv, wn, minX, minY, maxX, maxY };
    paintGroup(ctx, T, [s], { minX, minY, maxX, maxY }, px, false);
  }

  // Stand-alone painter for previews (map picker): paints everything directly, no cache
  function paintAll(ctx, world, px) {
    const game = { world };
    const big = { minX: -1e4, minY: -1e4, maxX: 1e4, maxY: 1e4 };
    const groups = Array.from(collect(game, big, 0).values()).sort((a, b) => (b.seamless ? 1 : 0) - (a.seamless ? 1 : 0));
    for (const g of groups) {
      const r = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
      for (const s of g.shapes) { r.minX = Math.min(r.minX, s.minX); r.minY = Math.min(r.minY, s.minY); r.maxX = Math.max(r.maxX, s.maxX); r.maxY = Math.max(r.maxY, s.maxY); }
      try { paintGroup(ctx, g.T, g.shapes, r, px, g.seamless); } catch (e) { /* preview only */ }
    }
    for (const b of world.bodies) if (!b.entity && b.terrain) for (const s of b.shapes) if (s.tag === 'lava') { GP.Draw.shapePath(ctx, s); ctx.fillStyle = '#ff6a14'; ctx.fill(); }
  }

  return { draw, reset, invalidate, paintAll, paintPiece, hash, stats: () => ({ tiles: cache.tiles.size }) };
})();
