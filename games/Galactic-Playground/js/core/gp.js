/* GALACTIC PLAYGROUND — core namespace and math helpers.
 * World units are meters. The Y axis points DOWN (screen convention), so gravity is +Y.
 * Angles are radians; a positive angle rotates clockwise on screen.
 */
'use strict';

const GP = window.GP = {
  VERSION: '1.0.0',
  modules: {},
};

GP.M = (() => {
  const TAU = Math.PI * 2;
  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const rand = (lo, hi) => lo + Math.random() * (hi - lo);
  const randInt = (lo, hi) => Math.floor(rand(lo, hi + 1));
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const sign = (v) => (v < 0 ? -1 : 1);
  // wrap to (-PI, PI]
  const wrapAngle = (a) => {
    a = (a + Math.PI) % TAU;
    if (a < 0) a += TAU;
    return a - Math.PI;
  };
  const angleDiff = (from, to) => wrapAngle(to - from);
  const dist = (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay);
  const dist2 = (ax, ay, bx, by) => { const dx = bx - ax, dy = by - ay; return dx * dx + dy * dy; };
  const rot = (x, y, c, s) => ({ x: c * x - s * y, y: s * x + c * y });
  const smooth = (t) => t * t * (3 - 2 * t);
  const approach = (v, target, step) => (v < target ? Math.min(v + step, target) : Math.max(v - step, target));

  // Closest point on segment AB to P, returns {x,y,t}
  const closestOnSegment = (px, py, ax, ay, bx, by) => {
    const abx = bx - ax, aby = by - ay;
    const len2 = abx * abx + aby * aby;
    let t = len2 > 1e-12 ? ((px - ax) * abx + (py - ay) * aby) / len2 : 0;
    t = clamp(t, 0, 1);
    return { x: ax + abx * t, y: ay + aby * t, t };
  };

  // Segment-segment intersection. Returns {t,u,x,y} or null. t along P, u along Q.
  const segIntersect = (p1x, p1y, p2x, p2y, q1x, q1y, q2x, q2y) => {
    const rx = p2x - p1x, ry = p2y - p1y, sx = q2x - q1x, sy = q2y - q1y;
    const den = rx * sy - ry * sx;
    if (Math.abs(den) < 1e-12) return null;
    const qpx = q1x - p1x, qpy = q1y - p1y;
    const t = (qpx * sy - qpy * sx) / den;
    const u = (qpx * ry - qpy * rx) / den;
    if (t < 0 || t > 1 || u < 0 || u > 1) return null;
    return { t, u, x: p1x + rx * t, y: p1y + ry * t };
  };

  // Distance between two segments (approximate but robust enough for gameplay checks)
  const segSegDist = (a1x, a1y, a2x, a2y, b1x, b1y, b2x, b2y) => {
    if (segIntersect(a1x, a1y, a2x, a2y, b1x, b1y, b2x, b2y)) return 0;
    let d = Infinity, c;
    c = closestOnSegment(a1x, a1y, b1x, b1y, b2x, b2y); d = Math.min(d, dist(a1x, a1y, c.x, c.y));
    c = closestOnSegment(a2x, a2y, b1x, b1y, b2x, b2y); d = Math.min(d, dist(a2x, a2y, c.x, c.y));
    c = closestOnSegment(b1x, b1y, a1x, a1y, a2x, a2y); d = Math.min(d, dist(b1x, b1y, c.x, c.y));
    c = closestOnSegment(b2x, b2y, a1x, a1y, a2x, a2y); d = Math.min(d, dist(b2x, b2y, c.x, c.y));
    return d;
  };

  // Hex color helpers
  const hexToRgb = (hex) => {
    let h = hex.replace('#', '');
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    const n = parseInt(h, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  };
  const rgbToHex = (r, g, b) => '#' + [r, g, b].map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');
  const shade = (hex, amt) => { // amt -1..1 darken/lighten
    const c = hexToRgb(hex);
    if (amt < 0) return rgbToHex(c.r * (1 + amt), c.g * (1 + amt), c.b * (1 + amt));
    return rgbToHex(c.r + (255 - c.r) * amt, c.g + (255 - c.g) * amt, c.b + (255 - c.b) * amt);
  };
  const mix = (h1, h2, t) => {
    const a = hexToRgb(h1), b = hexToRgb(h2);
    return rgbToHex(lerp(a.r, b.r, t), lerp(a.g, b.g, t), lerp(a.b, b.b, t));
  };
  const rgba = (hex, a) => { const c = hexToRgb(hex); return `rgba(${c.r},${c.g},${c.b},${a})`; };

  return { TAU, clamp, lerp, rand, randInt, pick, sign, wrapAngle, angleDiff, dist, dist2, rot, smooth, approach,
    closestOnSegment, segIntersect, segSegDist, hexToRgb, rgbToHex, shade, mix, rgba };
})();

/* Tiny event bus used to decouple systems (audio, effects, UI listen to gameplay events). */
GP.Events = (() => {
  const map = new Map();
  return {
    on(name, fn) { if (!map.has(name)) map.set(name, []); map.get(name).push(fn); return () => this.off(name, fn); },
    off(name, fn) { const l = map.get(name); if (l) { const i = l.indexOf(fn); if (i >= 0) l.splice(i, 1); } },
    emit(name, data) {
      const l = map.get(name);
      if (!l) return;
      for (let i = 0; i < l.length; i++) {
        try { l[i](data); } catch (e) { console.error('[event ' + name + ']', e); }
      }
    },
  };
})();

/* Generic object pool for short-lived objects (particles, bolts). */
GP.Pool = class Pool {
  constructor(factory, capacity) {
    this.factory = factory;
    this.items = [];
    this.free = [];
    this.capacity = capacity;
  }
  get() {
    let o = this.free.pop();
    if (!o) {
      if (this.items.length >= this.capacity) return null;
      o = this.factory();
      this.items.push(o);
    }
    o.alive = true;
    return o;
  }
  release(o) { if (o.alive) { o.alive = false; this.free.push(o); } }
  forEachAlive(fn) { const it = this.items; for (let i = 0; i < it.length; i++) if (it[i].alive) fn(it[i]); }
  countAlive() { return this.items.length - this.free.length; }
  clear() { for (const o of this.items) if (o.alive) { o.alive = false; this.free.push(o); } }
};

GP.uid = (() => { let n = 1; const f = () => n++; f.bump = (v) => { if (v >= n) n = v + 1; }; f.peek = () => n; return f; })();
