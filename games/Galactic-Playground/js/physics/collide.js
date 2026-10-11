/* GALACTIC PLAYGROUND physics — narrow-phase collision and ray casting.
 * All routines produce a manifold whose normal points from shape A toward shape B.
 * Separation is negative when overlapping, positive for speculative (near) contacts.
 */
'use strict';

(() => {
  const Phys = GP.Phys;

  // scratch for separating axis search
  let sepBest = 0, sepIndex = 0;

  function maxSeparation(A, B) {
    const an = A.n, bn = B.n, awv = A.wv, awn = A.wn, bwv = B.wv;
    let best = -Infinity, bestI = 0;
    for (let i = 0; i < an; i++) {
      const nx = awn[i * 2], ny = awn[i * 2 + 1], vx = awv[i * 2], vy = awv[i * 2 + 1];
      let minD = Infinity;
      for (let j = 0; j < bn; j++) {
        const d = nx * (bwv[j * 2] - vx) + ny * (bwv[j * 2 + 1] - vy);
        if (d < minD) minD = d;
      }
      if (minD > best) { best = minD; bestI = i; }
    }
    sepBest = best; sepIndex = bestI;
  }

  // clip scratch
  const cIn = [{ x: 0, y: 0, id: 0 }, { x: 0, y: 0, id: 0 }];
  const cMid = [{ x: 0, y: 0, id: 0 }, { x: 0, y: 0, id: 0 }];
  const cOut = [{ x: 0, y: 0, id: 0 }, { x: 0, y: 0, id: 0 }];

  // Keep the part of segment `src` where dot(n,p) <= o. Returns number of points written into dst.
  function clip(src, dst, nx, ny, o, clipId) {
    let count = 0;
    const d0 = nx * src[0].x + ny * src[0].y - o;
    const d1 = nx * src[1].x + ny * src[1].y - o;
    if (d0 <= 0) { dst[count].x = src[0].x; dst[count].y = src[0].y; dst[count].id = src[0].id; count++; }
    if (d1 <= 0) { dst[count].x = src[1].x; dst[count].y = src[1].y; dst[count].id = src[1].id; count++; }
    if (d0 * d1 < 0 && count < 2) {
      const t = d0 / (d0 - d1);
      dst[count].x = src[0].x + (src[1].x - src[0].x) * t;
      dst[count].y = src[0].y + (src[1].y - src[0].y) * t;
      dst[count].id = clipId;
      count++;
    }
    return count;
  }

  function polyPoly(A, B, margin, m) {
    maxSeparation(A, B);
    const sepA = sepBest, ia = sepIndex;
    if (sepA > margin) return 0;
    maxSeparation(B, A);
    const sepB = sepBest, ib = sepIndex;
    if (sepB > margin) return 0;

    let ref, inc, ri, flip;
    if (sepB > sepA + 0.001 + Math.abs(sepA) * 0.02) { ref = B; inc = A; ri = ib; flip = 1; }
    else { ref = A; inc = B; ri = ia; flip = 0; }

    const nx = ref.wn[ri * 2], ny = ref.wn[ri * 2 + 1];
    // incident edge = most anti-parallel normal
    let k = 0, minDot = Infinity;
    for (let i = 0; i < inc.n; i++) {
      const d = nx * inc.wn[i * 2] + ny * inc.wn[i * 2 + 1];
      if (d < minDot) { minDot = d; k = i; }
    }
    const k2 = (k + 1) % inc.n;
    cIn[0].x = inc.wv[k * 2]; cIn[0].y = inc.wv[k * 2 + 1]; cIn[0].id = k;
    cIn[1].x = inc.wv[k2 * 2]; cIn[1].y = inc.wv[k2 * 2 + 1]; cIn[1].id = k2;

    const ri2 = (ri + 1) % ref.n;
    const r1x = ref.wv[ri * 2], r1y = ref.wv[ri * 2 + 1];
    const r2x = ref.wv[ri2 * 2], r2y = ref.wv[ri2 * 2 + 1];
    let tx = r2x - r1x, ty = r2y - r1y;
    const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;

    if (clip(cIn, cMid, -tx, -ty, -(tx * r1x + ty * r1y), 100 + ri) < 2) return 0;
    if (clip(cMid, cOut, tx, ty, tx * r2x + ty * r2y, 100 + ri2) < 2) return 0;

    let count = 0;
    for (let i = 0; i < 2; i++) {
      const p = cOut[i];
      const sep = nx * (p.x - r1x) + ny * (p.y - r1y);
      if (sep <= margin) {
        const cp = m.pts[count];
        cp.x = p.x - nx * sep * 0.5;
        cp.y = p.y - ny * sep * 0.5;
        cp.sep = sep;
        cp.id = (flip << 16) | (ri << 8) | p.id;
        count++;
      }
    }
    m.nx = flip ? -nx : nx; m.ny = flip ? -ny : ny;
    m.count = count;
    return count;
  }

  function circleCircle(A, B, margin, m) {
    const dx = B.wx - A.wx, dy = B.wy - A.wy;
    const d = Math.hypot(dx, dy);
    const sep = d - A.r - B.r;
    if (sep > margin) return 0;
    let nx = 0, ny = 1;
    if (d > 1e-9) { nx = dx / d; ny = dy / d; }
    m.nx = nx; m.ny = ny;
    const cp = m.pts[0];
    cp.x = A.wx + nx * (A.r + sep * 0.5);
    cp.y = A.wy + ny * (A.r + sep * 0.5);
    cp.sep = sep; cp.id = 0;
    m.count = 1;
    return 1;
  }

  // polygon A vs circle B
  function polyCircle(A, B, margin, m) {
    const cx = B.wx, cy = B.wy, r = B.r;
    let best = -Infinity, bi = 0;
    for (let i = 0; i < A.n; i++) {
      const s = A.wn[i * 2] * (cx - A.wv[i * 2]) + A.wn[i * 2 + 1] * (cy - A.wv[i * 2 + 1]);
      if (s > best) { best = s; bi = i; }
    }
    if (best > r + margin) return 0;
    const bi2 = (bi + 1) % A.n;
    const v1x = A.wv[bi * 2], v1y = A.wv[bi * 2 + 1], v2x = A.wv[bi2 * 2], v2y = A.wv[bi2 * 2 + 1];
    let nx, ny, sep, id = bi;
    if (best < 1e-9) {
      nx = A.wn[bi * 2]; ny = A.wn[bi * 2 + 1]; sep = best - r;
    } else {
      const u1 = (cx - v1x) * (v2x - v1x) + (cy - v1y) * (v2y - v1y);
      const u2 = (cx - v2x) * (v1x - v2x) + (cy - v2y) * (v1y - v2y);
      if (u1 <= 0 || u2 <= 0) {
        const vx = u1 <= 0 ? v1x : v2x, vy = u1 <= 0 ? v1y : v2y;
        const dx = cx - vx, dy = cy - vy, d = Math.hypot(dx, dy);
        sep = d - r;
        if (sep > margin) return 0;
        nx = d > 1e-9 ? dx / d : A.wn[bi * 2]; ny = d > 1e-9 ? dy / d : A.wn[bi * 2 + 1];
        id = 50 + (u1 <= 0 ? bi : bi2);
      } else {
        nx = A.wn[bi * 2]; ny = A.wn[bi * 2 + 1]; sep = best - r;
      }
    }
    m.nx = nx; m.ny = ny;
    const cp = m.pts[0];
    cp.x = cx - nx * (r + sep * 0.5);
    cp.y = cy - ny * (r + sep * 0.5);
    cp.sep = sep; cp.id = id;
    m.count = 1;
    return 1;
  }

  Phys.collide = function collide(A, B, margin, m) {
    if (A.kind === 'poly') {
      if (B.kind === 'poly') return polyPoly(A, B, margin, m);
      return polyCircle(A, B, margin, m);
    }
    if (B.kind === 'poly') {
      const n = polyCircle(B, A, margin, m);
      if (n) { m.nx = -m.nx; m.ny = -m.ny; }
      return n;
    }
    return circleCircle(A, B, margin, m);
  };

  /* Ray cast against a single shape. Returns t in [0,1] along p1->p2 and hit normal, or null. */
  Phys.raycastShape = function raycastShape(s, x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1;
    if (s.kind === 'circle') {
      const fx = x1 - s.wx, fy = y1 - s.wy;
      const a = dx * dx + dy * dy;
      const b = 2 * (fx * dx + fy * dy);
      const c = fx * fx + fy * fy - s.r * s.r;
      if (c < 0) return { t: 0, nx: -dx / Math.sqrt(a || 1), ny: -dy / Math.sqrt(a || 1), inside: true };
      const disc = b * b - 4 * a * c;
      if (disc < 0 || a < 1e-12) return null;
      const t = (-b - Math.sqrt(disc)) / (2 * a);
      if (t < 0 || t > 1) return null;
      const hx = x1 + dx * t, hy = y1 + dy * t;
      const nl = Math.hypot(hx - s.wx, hy - s.wy) || 1;
      return { t, nx: (hx - s.wx) / nl, ny: (hy - s.wy) / nl };
    }
    let lower = 0, upper = 1, index = -1;
    for (let i = 0; i < s.n; i++) {
      const nx = s.wn[i * 2], ny = s.wn[i * 2 + 1];
      const num = nx * (s.wv[i * 2] - x1) + ny * (s.wv[i * 2 + 1] - y1);
      const den = nx * dx + ny * dy;
      if (den === 0) { if (num < 0) return null; }
      else if (den < 0 && num < lower * den) { lower = num / den; index = i; }
      else if (den > 0 && num < upper * den) { upper = num / den; }
      if (upper < lower) return null;
    }
    if (index < 0) {
      const l = Math.hypot(dx, dy) || 1;
      return { t: 0, nx: -dx / l, ny: -dy / l, inside: true };
    }
    return { t: lower, nx: s.wn[index * 2], ny: s.wn[index * 2 + 1] };
  };

  // Closest distance from point to shape surface (negative inside for polygons approx)
  Phys.pointShapeDistance = function (s, px, py) {
    if (s.kind === 'circle') return Math.hypot(px - s.wx, py - s.wy) - s.r;
    let best = -Infinity;
    for (let i = 0; i < s.n; i++) {
      const d = s.wn[i * 2] * (px - s.wv[i * 2]) + s.wn[i * 2 + 1] * (py - s.wv[i * 2 + 1]);
      if (d > best) best = d;
    }
    if (best <= 0) return best;
    // outside: exact distance to nearest edge
    let md = Infinity;
    for (let i = 0; i < s.n; i++) {
      const j = (i + 1) % s.n;
      const c = GP.M.closestOnSegment(px, py, s.wv[i * 2], s.wv[i * 2 + 1], s.wv[j * 2], s.wv[j * 2 + 1]);
      md = Math.min(md, Math.hypot(px - c.x, py - c.y));
    }
    return md;
  };
})();
