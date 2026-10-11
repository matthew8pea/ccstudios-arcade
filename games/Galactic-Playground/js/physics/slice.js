/* GALACTIC PLAYGROUND physics — convex polygon slicing (used by lightsaber cuts). */
'use strict';

(() => {
  const Phys = GP.Phys;

  // Split a convex polygon (flat world verts) by the infinite line through (px,py) with direction (dx,dy).
  // Returns [left, right] flat vertex arrays, or null if the line misses.
  Phys.splitPolygon = function (verts, px, py, dx, dy) {
    const n = verts.length / 2;
    const side = new Array(n);
    let pos = 0, neg = 0;
    for (let i = 0; i < n; i++) {
      const s = (verts[i * 2] - px) * dy - (verts[i * 2 + 1] - py) * dx;
      side[i] = s;
      if (s > 1e-6) pos++; else if (s < -1e-6) neg++;
    }
    if (!pos || !neg) return null;
    const A = [], B = [];
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const xi = verts[i * 2], yi = verts[i * 2 + 1], si = side[i], sj = side[j];
      if (si >= 0) A.push(xi, yi);
      if (si <= 0) B.push(xi, yi);
      if ((si > 0 && sj < 0) || (si < 0 && sj > 0)) {
        const t = si / (si - sj);
        const x = xi + (verts[j * 2] - xi) * t, y = yi + (verts[j * 2 + 1] - yi) * t;
        A.push(x, y); B.push(x, y);
      }
    }
    if (A.length < 6 || B.length < 6) return null;
    return [A, B];
  };

  Phys.polyArea = function (v) {
    let a = 0;
    const n = v.length / 2;
    for (let i = 0; i < n; i++) { const j = (i + 1) % n; a += v[i * 2] * v[j * 2 + 1] - v[j * 2] * v[i * 2 + 1]; }
    return Math.abs(a) / 2;
  };

  Phys.polyCentroid = function (v) {
    let a = 0, cx = 0, cy = 0;
    const n = v.length / 2;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const cr = v[i * 2] * v[j * 2 + 1] - v[j * 2] * v[i * 2 + 1];
      a += cr; cx += (v[i * 2] + v[j * 2]) * cr; cy += (v[i * 2 + 1] + v[j * 2 + 1]) * cr;
    }
    a *= 0.5;
    if (Math.abs(a) < 1e-12) return { x: v[0], y: v[1] };
    return { x: cx / (6 * a), y: cy / (6 * a) };
  };
})();
