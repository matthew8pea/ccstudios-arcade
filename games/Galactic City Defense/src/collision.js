import * as THREE from 'three';
import { clamp } from './util.js';

const AXES = ['x', 'y', 'z'];
const _dir = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();

/**
 * Axis-aligned box world used for movement, bolts, line of sight and simple navigation.
 * Flags per box: move (blocks walking), shot (blocks bolts / sight), walk (top can be stood on).
 */
export class World {
  constructor() {
    this.boxes = [];
    this.terrain = null; // optional (x, z) => ground height, or null outside it (Tatooine's dunes)
  }

  add(minX, minY, minZ, maxX, maxY, maxZ, opts = {}) {
    const b = {
      min: new THREE.Vector3(minX, minY, minZ),
      max: new THREE.Vector3(maxX, maxY, maxZ),
      move: opts.move !== false,
      shot: opts.shot !== false,
      walk: opts.walk !== false,
      shield: !!opts.shield, // Republic energy shields: stop droid bolts only
      tag: opts.tag || '',
    };
    this.boxes.push(b);
    return b;
  }

  box(cx, cy, cz, sx, sy, sz, opts) {
    return this.add(cx - sx / 2, cy - sy / 2, cz - sz / 2, cx + sx / 2, cy + sy / 2, cz + sz / 2, opts);
  }

  /** Highest walkable surface under a circle that is at most `step` above the feet. */
  groundAt(x, z, feetY, r = 0.3, step = 0.55) {
    let g = -Infinity;
    for (const b of this.boxes) {
      if (!b.walk) continue;
      if (x + r < b.min.x || x - r > b.max.x || z + r < b.min.z || z - r > b.max.z) continue;
      if (b.max.y <= feetY + step && b.max.y > g) g = b.max.y;
    }
    if (this.terrain) {
      const t = this.terrain(x, z);
      if (t !== null && t <= feetY + step && t > g) g = t;
    }
    return g;
  }

  /** Where segment a->b first dips below the terrain (0..1), or -1. */
  terrainHit(a, b) {
    if (!this.terrain) return -1;
    const ta = this.terrain(a.x, a.z), tb = this.terrain(b.x, b.z);
    if (ta === null || tb === null) return -1;
    const ha = a.y - ta, hb = b.y - tb;
    if (hb >= 0) return -1;
    return ha <= 0 ? 0 : ha / (ha - hb);
  }

  /** Push a vertical cylinder (feet position, radius, height) out of blocking boxes. */
  resolve(pos, r, h, step = 0.55) {
    let hit = false;
    for (let iter = 0; iter < 2; iter++) {
      for (const b of this.boxes) {
        if (!b.move) continue;
        if (pos.y >= b.max.y - step || pos.y + h <= b.min.y) continue;
        const cx = clamp(pos.x, b.min.x, b.max.x), cz = clamp(pos.z, b.min.z, b.max.z);
        const dx = pos.x - cx, dz = pos.z - cz, d2 = dx * dx + dz * dz;
        if (d2 >= r * r) continue;
        hit = true;
        if (d2 > 1e-10) {
          const d = Math.sqrt(d2), push = r - d;
          pos.x += (dx / d) * push;
          pos.z += (dz / d) * push;
        } else {
          const pl = pos.x - b.min.x, pr = b.max.x - pos.x, pb = pos.z - b.min.z, pf = b.max.z - pos.z;
          const m = Math.min(pl, pr, pb, pf);
          if (m === pl) pos.x = b.min.x - r;
          else if (m === pr) pos.x = b.max.x + r;
          else if (m === pb) pos.z = b.min.z - r;
          else pos.z = b.max.z + r;
        }
      }
    }
    return hit;
  }

  /** Slab raycast. `inflate` grows boxes in x/z (used for navigation). Boxes containing the origin are ignored. */
  raycast(o, d, maxDist, flag = 'shot', inflate = 0, minHeight = -Infinity) {
    let best = maxDist, hitBox = null, nAx = 0, nS = 0;
    for (const b of this.boxes) {
      if (!b[flag]) continue;
      if (b.max.y - b.min.y < minHeight) continue;
      let tmin = 0, tmax = best, ax = -1, sg = 0, miss = false;
      for (let i = 0; i < 3; i++) {
        const k = AXES[i];
        const grow = i === 1 ? 0 : inflate;
        const dk = d[k], ok = o[k], mn = b.min[k] - grow, mx = b.max[k] + grow;
        if (Math.abs(dk) < 1e-9) {
          if (ok < mn || ok > mx) { miss = true; break; }
          continue;
        }
        const inv = 1 / dk;
        let t1 = (mn - ok) * inv, t2 = (mx - ok) * inv, s = -1;
        if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; s = 1; }
        if (t1 > tmin) { tmin = t1; ax = i; sg = s; }
        if (t2 < tmax) tmax = t2;
        if (tmax < tmin) { miss = true; break; }
      }
      if (miss || ax < 0) continue;
      if (tmin < best) { best = tmin; hitBox = b; nAx = ax; nS = sg; }
    }
    if (!hitBox) return null;
    const normal = new THREE.Vector3();
    normal.setComponent(nAx, nS);
    return { dist: best, box: hitBox, normal, point: o.clone().addScaledVector(d, best) };
  }

  blocked(a, b, flag = 'shot') {
    _dir.subVectors(b, a);
    const L = _dir.length();
    if (L < 1e-6) return false;
    _dir.divideScalar(L);
    return !!this.raycast(a, _dir, L, flag);
  }

  /**
   * Very small navigator for box obstacles: if the straight line is blocked, head for the
   * best corner of the first blocking box instead. Good enough for a mostly open rooftop.
   */
  navTarget(from, to, r, out = new THREE.Vector3()) {
    const pad = r + 0.5;
    _a.set(from.x, from.y + 0.9, from.z);
    _b.set(to.x, from.y + 0.9, to.z);
    _dir.subVectors(_b, _a);
    const L = _dir.length();
    if (L < 0.01) return out.copy(to);
    _dir.divideScalar(L);
    const hit = this.raycast(_a, _dir, L, 'move', pad, 0.6);
    if (!hit) return out.copy(to);
    const bx = hit.box;
    const corners = [
      [bx.min.x - pad - 0.4, bx.min.z - pad - 0.4], [bx.max.x + pad + 0.4, bx.min.z - pad - 0.4],
      [bx.min.x - pad - 0.4, bx.max.z + pad + 0.4], [bx.max.x + pad + 0.4, bx.max.z + pad + 0.4],
    ];
    let best = null, bestCost = Infinity;
    const c = new THREE.Vector3();
    for (const [cx, cz] of corners) {
      c.set(cx, from.y + 0.9, cz);
      const d1 = Math.hypot(cx - from.x, cz - from.z);
      if (d1 < 0.6) continue;
      _dir.subVectors(c, _a).normalize();
      const blocked = this.raycast(_a, _dir, d1, 'move', r + 0.15, 0.6);
      const cost = d1 + Math.hypot(to.x - cx, to.z - cz) + (blocked ? 1000 : 0);
      if (cost < bestCost) { bestCost = cost; best = [cx, cz]; }
    }
    if (!best) return out.copy(to);
    return out.set(best[0], to.y, best[1]);
  }
}
