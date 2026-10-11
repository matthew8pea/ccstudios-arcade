/* GALACTIC PLAYGROUND — liquid simulation kernel.
 *
 * The particle simulation behind GP.Fluid, written as one self-contained function so the very same
 * code can run on the main thread or inside a Web Worker (its source is turned into a worker script;
 * see GP.FluidWorkerMain). It must not touch GP, the DOM or anything outside itself.
 *
 * Liquid is simulated with double-density relaxation (Clavet et al. 2005, "Particle-based
 * Viscoelastic Fluid Simulation"): gravity and viscosity act on velocities, positions are predicted,
 * then neighbouring particles push apart or pull together toward a rest density, and velocities are
 * recovered from the position change.
 *
 * Each run() gets a copy of the solid shapes near the liquid and the bodies they belong to, advances
 * the liquid, and reports back the particles, the impulses the liquid gave each body and how many
 * particles of each kind touched it.
 *
 * Water freezes into ice in the cold (cold air, chilled objects, cryo blasts) and ice melts in the warm
 * (warm air, hot objects, lava, fire, lightsaber blades). Ice that is joined, through other ice, to
 * solid ground is pinned where it is: it doesn't move, liquid flows around it and bodies rest on it or
 * are held fast inside it. Ice with nothing solid under it (a frozen drop in the air, a block in a
 * bucket) is a stiff slush that falls and floats until it lands.
 */
'use strict';

GP.FluidKernel = function FluidKernel() {
  'use strict';
  const WATER = 0, LAVA = 1, COOLED = 2, OIL = 3, ACID = 4, BLOOD = 5, ICE = 6;
  let types = [];                 // per liquid: pull, mass, visc, visc2, drag, friction, holdPeople, evaporate, consume
  let NT = 7;
  const RHO0 = 4.5;               // rest density: packs particles one spacing apart
  const DENSITY = 135;            // liquid density in the physics world's units
  const MAX_SPEED = 16;
  const tune = { K: 0.008, KNEAR: 0.02, BOUNCE: 0.1, DAMP: 0.25 };
  let SCALE = 1, H = 0.3, R = 0.055, REACH = 0.1, AREA = 0.0087;
  function setSpacing(sp) { SCALE = sp / 0.1; H = 0.3 * SCALE; R = 0.055 * SCALE; REACH = R * 1.8; AREA = 0.0087 * SCALE * SCALE; }

  /* ---------------------------------------------------------------- storage (grows on demand) */
  let cap = 0, n = 0, maxPairs = 0, pairs = 0, HASH = 0, hashMask = 0;
  let px, py, rx, ry, ox, oy, vx, vy, type, age, lonely, burn, gone, pin;
  let cellX, cellY, next, adjStart, adjCount, heads, pa, pb, adj, adjD, msum, wsum;
  let anchor, tmin, tmax, iceNb, stack;      // per tick: ice on solid ground, coldest/hottest thing touched, ice nearby
  const grown = (a, size) => { const b = new a.constructor(size); b.set(a.subarray(0, Math.min(a.length, size))); return b; };
  function ensure(need) {
    if (need <= cap) return;
    const c = Math.max(need, cap * 2, 4096);
    if (!cap) {
      px = new Float32Array(c); py = new Float32Array(c); rx = new Float32Array(c); ry = new Float32Array(c);
      ox = new Float32Array(c); oy = new Float32Array(c); vx = new Float32Array(c); vy = new Float32Array(c);
      type = new Uint8Array(c); age = new Float32Array(c); lonely = new Float32Array(c); burn = new Float32Array(c); gone = new Uint8Array(c); pin = new Uint8Array(c);
    } else {
      px = grown(px, c); py = grown(py, c); rx = grown(rx, c); ry = grown(ry, c); ox = grown(ox, c); oy = grown(oy, c);
      vx = grown(vx, c); vy = grown(vy, c); type = grown(type, c); age = grown(age, c); lonely = grown(lonely, c); burn = grown(burn, c); gone = grown(gone, c); pin = grown(pin, c);
    }
    anchor = grown(anchor || new Uint8Array(0), c); tmin = grown(tmin || new Float32Array(0), c); tmax = grown(tmax || new Float32Array(0), c);
    iceNb = new Uint8Array(c); stack = new Int32Array(c);
    cellX = new Int32Array(c); cellY = new Int32Array(c); next = new Int32Array(c);
    adjStart = new Int32Array(c + 1); adjCount = new Int32Array(c);
    msum = new Float32Array(c); wsum = new Float32Array(c);
    cap = c;
    // spatial hash: about one bucket per particle keeps the chains short
    let h = 16384;
    while (h < c) h *= 2;
    if (h !== HASH) { HASH = h; hashMask = h - 1; heads = new Int32Array(h); }
    if (!maxPairs) growPairs(c * 12);
  }
  function growPairs(want) {
    maxPairs = Math.max(want, maxPairs * 2);
    pa = new Int32Array(maxPairs); pb = new Int32Array(maxPairs);
    adj = new Int32Array(maxPairs * 2); adjD = new Float32Array(maxPairs * 2);
  }
  ensure(4096);

  function add(t, x, y, vxi, vyi) {
    ensure(n + 1);
    px[n] = x; py[n] = y; ox[n] = x; oy[n] = y; rx[n] = x; ry[n] = y; vx[n] = vxi || 0; vy[n] = vyi || 0;
    type[n] = t; age[n] = 0; lonely[n] = 0; burn[n] = 0; gone[n] = 0; pin[n] = 0;
    anchor[n] = 0; tmin[n] = 1e9; tmax[n] = -1e9;
    n++;
  }
  function remove(i) {
    n--;
    if (i === n) return;
    px[i] = px[n]; py[i] = py[n]; rx[i] = rx[n]; ry[i] = ry[n]; ox[i] = ox[n]; oy[i] = oy[n]; vx[i] = vx[n]; vy[i] = vy[n];
    type[i] = type[n]; age[i] = age[n]; lonely[i] = lonely[n]; burn[i] = burn[n]; gone[i] = gone[n]; pin[i] = pin[n];
    anchor[i] = anchor[n]; tmin[i] = tmin[n]; tmax[i] = tmax[n];
  }

  /* ---------------------------------------------------------------- neighbours */
  const cellOf = (v) => Math.floor(v / H);
  const STX = [0, 1, 1, 1, 0], STY = [0, -1, 0, 1, 1];
  const hashOf = (cx, cy) => (((cx * 73856093) ^ (cy * 19349663)) >>> 0) & hashMask;
  function buildGrid() {
    heads.fill(-1);
    for (let i = 0; i < n; i++) {
      const cx = cellOf(px[i]), cy = cellOf(py[i]);
      cellX[i] = cx; cellY[i] = cy;
      const h = hashOf(cx, cy);
      next[i] = heads[h]; heads[h] = i;
    }
    pairs = 0;
    const H2 = H * H;
    for (let i = 0; i < n; i++) {
      const cx = cellX[i], cy = cellY[i];
      // half-shell stencil: own cell (j > i) plus four neighbours, so each pair is found exactly once
      for (let c = 0; c < 5; c++) {
        const tx = cx + STX[c], ty = cy + STY[c];
        for (let j = heads[hashOf(tx, ty)]; j >= 0; j = next[j]) {
          if ((c === 0 && j <= i) || cellX[j] !== tx || cellY[j] !== ty) continue;
          const ddx = px[j] - px[i], ddy = py[j] - py[i];
          if (ddx * ddx + ddy * ddy >= H2) continue;
          if (pairs >= maxPairs) { const ka = pa, kb = pb; growPairs(pairs + 1); pa.set(ka); pb.set(kb); }
          pa[pairs] = i; pb[pairs] = j; pairs++;
        }
      }
    }
  }
  // neighbour lists per particle (both directions) from the pair list
  function adjacency() {
    adjCount.fill(0, 0, n);
    for (let k = 0; k < pairs; k++) { adjCount[pa[k]]++; adjCount[pb[k]]++; }
    adjStart[0] = 0;
    for (let i = 0; i < n; i++) adjStart[i + 1] = adjStart[i] + adjCount[i];
    adjCount.fill(0, 0, n);
    for (let k = 0; k < pairs; k++) {
      const i = pa[k], j = pb[k];
      adj[adjStart[i] + adjCount[i]++] = j;
      adj[adjStart[j] + adjCount[j]++] = i;
    }
  }

  /* ---------------------------------------------------------------- solids */
  // Shapes arrive as flat Float32Arrays of records:
  //   kind (0 circle, 1 polygon), body index, minX, minY, maxX, maxY, then
  //   circle: r, cx, cy     polygon: vertex count m, m vertices (x, y), m outward normals (x, y)
  // Bodies arrive as records of BODY floats: x, y, vx, vy, w, m, flags (1 dynamic, 2 person, 4 has an entity, 8 droid, 16 dead body),
  // temperature (°C).
  const BODY = 8;
  const GRID = 1;                                 // shape grid cell size (m)
  const keyOf = (cx, cy) => (cx + 30000) * 60000 + (cy + 30000);
  let staticGrid = new Map(), dynGrid = new Map();
  let statics = [], dyns = [];
  let bodies = new Float32Array(0), nb = 0;
  function parseShapes(buf) {
    const out = [];
    if (!buf) return out;
    let o = 0;
    while (o < buf.length) {
      const kind = buf[o], b = buf[o + 1];
      const s = { kind, b, minX: buf[o + 2], minY: buf[o + 3], maxX: buf[o + 4], maxY: buf[o + 5], r: 0, cx: 0, cy: 0, m: 0, v: null, nrm: null };
      if (kind === 0) { s.r = buf[o + 6]; s.cx = buf[o + 7]; s.cy = buf[o + 8]; o += 9; }
      else { const m = buf[o + 6]; s.m = m; s.v = buf.subarray(o + 7, o + 7 + m * 2); s.nrm = buf.subarray(o + 7 + m * 2, o + 7 + m * 4); o += 7 + m * 4; }
      out.push(s);
    }
    return out;
  }
  function gridOf(list) {
    const g = new Map();
    for (const s of list) {
      const x0 = Math.floor((s.minX - REACH) / GRID), x1 = Math.floor((s.maxX + REACH) / GRID);
      const y0 = Math.floor((s.minY - REACH) / GRID), y1 = Math.floor((s.maxY + REACH) / GRID);
      if ((x1 - x0 + 1) * (y1 - y0 + 1) > 40000) continue; // absurdly large: skip rather than stall
      for (let cx = x0; cx <= x1; cx++) for (let cy = y0; cy <= y1; cy++) {
        const k = keyOf(cx, cy);
        let a = g.get(k);
        if (!a) { a = []; g.set(k, a); }
        a.push(s);
      }
    }
    return g;
  }

  let sdx = 0, sdy = 0;
  // signed distance from a point to a shape surface (negative inside); the outward normal goes to sdx/sdy
  function signedDistance(s, x, y) {
    if (s.kind === 0) {
      const dx = x - s.cx, dy = y - s.cy, d = Math.sqrt(dx * dx + dy * dy);
      if (d > 1e-9) { sdx = dx / d; sdy = dy / d; } else { sdx = 0; sdy = -1; }
      return d - s.r;
    }
    const v = s.v, nr = s.nrm, m = s.m;
    let best = -Infinity, bi = 0;
    for (let i = 0; i < m; i++) {
      const d = nr[i * 2] * (x - v[i * 2]) + nr[i * 2 + 1] * (y - v[i * 2 + 1]);
      if (d > best) { best = d; bi = i; }
    }
    if (best <= 0) { sdx = nr[bi * 2]; sdy = nr[bi * 2 + 1]; return best; }
    if (best > R) return best; // the true distance is at least this: no contact
    let md = Infinity;
    for (let i = 0; i < m; i++) {
      const j = (i + 1) % m;
      const ax = v[i * 2], ay = v[i * 2 + 1], bx = v[j * 2], by = v[j * 2 + 1];
      const ex = bx - ax, ey = by - ay, l2 = ex * ex + ey * ey;
      let t = l2 > 1e-12 ? ((x - ax) * ex + (y - ay) * ey) / l2 : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const dx = x - (ax + ex * t), dy = y - (ay + ey * t), d = Math.sqrt(dx * dx + dy * dy);
      if (d < md) { md = d; if (d > 1e-9) { sdx = dx / d; sdy = dy / d; } else { sdx = nr[i * 2]; sdy = nr[i * 2 + 1]; } }
    }
    return md;
  }

  // per body: Jx, Jy, angular J, hits per liquid, burning hits, top of the liquid touching it, and for pinned
  // ice: the summed push out of the ice (x, y) and the summed depth
  let out = new Float32Array(0), STRIDE = 0;
  const BREAK = 9;                                // m/s: a body hitting pinned ice this hard breaks through it
  function collideList(list, i, dt) {
    const t = type[i], T = types[t];
    // ice froze wherever the drop happened to be, a little off the surface it rested on: it stays anchored
    // to things a little further away than it touches them
    const reach = t === ICE ? REACH : R;
    for (let k = 0; k < list.length; k++) {
      const s = list[k];
      const x = px[i], y = py[i];
      if (x < s.minX - reach || x > s.maxX + reach || y < s.minY - reach || y > s.maxY + reach) continue;
      const dist = signedDistance(s, x, y);
      if (dist >= reach) continue;
      const nx = sdx, ny = sdy;
      const bo = s.b * BODY;
      const bX = bodies[bo], bY = bodies[bo + 1], bvx0 = bodies[bo + 2], bvy0 = bodies[bo + 3], bw = bodies[bo + 4], bm = bodies[bo + 5], fl = bodies[bo + 6];
      // velocity of the particle relative to the surface
      const pvx = (x - ox[i]) / dt, pvy = (y - oy[i]) / dt;
      const bvx = bvx0 - bw * (y - bY), bvy = bvy0 + bw * (x - bX);
      const rvx = pvx - bvx, rvy = pvy - bvy;
      const bT = bodies[bo + 7];
      if (bT < tmin[i]) tmin[i] = bT;
      if (bT > tmax[i]) tmax[i] = bT;
      if (t === ICE) {
        if (!(fl & 1)) anchor[i] = 1;
        if (dist >= R) continue;
        if (pin[i]) {
          // pinned ice doesn't move; bodies rest on it or are held inside it (applied on the main thread)
          if (fl & 1) {
            if (rvx * nx + rvy * ny < -BREAK) { type[i] = WATER; pin[i] = 0; continue; }
            const o = s.b * STRIDE, pen = R - dist;
            out[o + 3 + ICE]++;
            out[o + 5 + NT] -= nx * pen; out[o + 6 + NT] -= ny * pen; out[o + 7 + NT] += pen;
          }
          continue;
        }
        // loose ice is solid against everything, people included: the plain collision below
      } else if (fl & 2) {
        // People and droids: liquid flows into the space they take up instead of parting around them,
        // so they end up properly submerged. Drops inside them give buoyancy (holdPeople = the share of
        // the displaced weight that holds them up, below their own density so they sink), and drops
        // and body drag on each other, so a thrashing body still stirs the liquid.
        if (fl & 1) {
          const mp = T.mass * DENSITY * AREA, o = s.b * STRIDE;
          let jx = 0, jy = 0;
          // droids are metal and sink faster; the dead float (lighter than the liquid they displace; the drops
          // that fit inside a thin body undercount its volume, hence the generous factor)
          const hold = fl & 16 ? 2.4 / T.mass : T.holdPeople * (fl & 8 ? 0.5 : 1);
          if (dist < 0) { jx -= gX * mp * hold * dt; jy -= gY * mp * hold * dt; }
          // drag acts at the skin: drops deep inside the body just stand in for the space it takes up
          // (dragging those along would make a body haul a whole column of liquid with it)
          if (dist > -2 * R) {
            const k = Math.min(0.5, (T.drag != null ? T.drag : 1 + T.visc * 0.35) * dt), mu = mp * bm / (mp + bm);
            const ex = rvx * k * mu, ey = rvy * k * mu;
            px[i] -= ex / mp * dt; py[i] -= ey / mp * dt;
            jx += ex; jy += ey;
          }
          out[o] += jx; out[o + 1] += jy; out[o + 2] += (x - bX) * jy - (y - bY) * jx;
        }
        if (fl & 4) {
          const o = s.b * STRIDE;
          out[o + 3 + t]++;
          if (burn[i] > 0) out[o + 3 + NT]++;
          if (t !== COOLED && t !== ICE && y < out[o + 4 + NT]) out[o + 4 + NT] = y;   // highest liquid touching it
          if (T.consume && Math.random() < T.consume * dt) gone[i] = 1;
        }
        continue;
      }
      const vn = rvx * nx + rvy * ny;
      if (vn < 0) {
        // friction is a rate per second, so it doesn't grow with the number of sub-steps
        const tvx = rvx - vn * nx, tvy = rvy - vn * ny, fr = Math.min(1, T.friction * dt);
        const Ix = vn * nx + tvx * fr, Iy = vn * ny + tvy * fr;
        if (fl & 1) {
          // a two-body collision: the lighter partner takes more of the velocity change, so a heavy
          // lava drop can't fling a hand faster than the drop itself was moving
          const mp = T.mass * DENSITY * AREA, share = bm / (bm + mp);
          px[i] -= Ix * dt * share; py[i] -= Iy * dt * share;
          const jx = Ix * mp * share, jy = Iy * mp * share, o = s.b * STRIDE;
          out[o] += jx; out[o + 1] += jy; out[o + 2] += (x - bX) * jy - (y - bY) * jx;
        } else { px[i] -= Ix * dt; py[i] -= Iy * dt; }
      }
      const pen = R - dist;
      px[i] += nx * pen; py[i] += ny * pen;
      ox[i] += nx * pen * (1 - tune.BOUNCE); oy[i] += ny * pen * (1 - tune.BOUNCE); // no rocket bounce out of surfaces
      if (fl & 4) {
        const o = s.b * STRIDE;
        out[o + 3 + t]++;
        if (burn[i] > 0) out[o + 3 + NT]++;
        if (t !== COOLED && t !== ICE && y < out[o + 4 + NT]) out[o + 4 + NT] = y;   // highest liquid touching it
        // acid is used up eating into things
        if (T.consume && Math.random() < T.consume * dt) gone[i] = 1;
      }
    }
  }
  function collide(dt) {
    for (let i = 0; i < n; i++) {
      const k = keyOf(Math.floor(px[i] / GRID), Math.floor(py[i] / GRID));
      const a = staticGrid.get(k); if (a) collideList(a, i, dt);
      const b = dynGrid.get(k); if (b) collideList(b, i, dt);
    }
  }

  /* ---------------------------------------------------------------- one sub-step */
  let zones = [];
  function inZone(z, x, y) {
    const dx = x - z.x, dy = y - z.y;
    const u = dx * z.c + dy * z.s, v = -dx * z.s + dy * z.c;
    return u > -z.hw && u < z.hw && v > -z.hh && v < z.hh;
  }
  let gX = 0, gY = 9.8;
  function substep(dt, gx, gy) {
    gX = gx; gY = gy;
    buildGrid();
    // Gravity, with buoyancy between liquids: a drop lighter than the liquid around it (oil in water)
    // is pushed up and a heavier one sinks, so different liquids settle into layers.
    msum.fill(0, 0, n); wsum.fill(0, 0, n);
    let mixed = false;
    for (let k = 0; k < pairs; k++) {
      const i = pa[k], j = pb[k];
      const ti = type[i], tj = type[j];
      if (ti !== tj) mixed = true;
      const dx = px[j] - px[i], dy = py[j] - py[i];
      const w = 1 - Math.sqrt(dx * dx + dy * dy) / H;
      msum[i] += w * types[tj].mass; wsum[i] += w;
      msum[j] += w * types[ti].mass; wsum[j] += w;
    }
    for (let i = 0; i < n; i++) {
      if (pin[i]) continue;
      let g = 1;
      if (mixed && wsum[i] > 0) {
        const mi = types[type[i]].mass, around = (msum[i] + mi) / (wsum[i] + 1);
        g = 1 - Math.max(-0.6, Math.min(1.2, 2.2 * (around - mi) / around));
      }
      vx[i] += gx * g * dt; vy[i] += gy * g * dt;
    }
    // pumps pushing along their axis
    for (const z of zones) {
      if (z.kind !== 'push') continue;
      for (let i = 0; i < n; i++) {
        if (pin[i] || !inZone(z, px[i], py[i])) continue;
        // accelerate toward the pump's flow speed, and cancel gravity so it can lift
        const along = vx[i] * z.c + vy[i] * z.s;
        if (along < z.speed) { vx[i] += z.c * z.accel * dt; vy[i] += z.s * z.accel * dt; }
        vx[i] -= gx * dt; vy[i] -= gy * dt;
      }
    }
    // viscosity (pairwise impulses that damp relative velocity along the line between particles)
    for (let k = 0; k < pairs; k++) {
      const i = pa[k], j = pb[k];
      if (pin[i] || pin[j]) continue;
      let dx = px[j] - px[i], dy = py[j] - py[i];
      const d = Math.sqrt(dx * dx + dy * dy); if (d < 1e-6) continue;
      dx /= d; dy /= d;
      const u = (vx[i] - vx[j]) * dx + (vy[i] - vy[j]) * dy;
      if (u <= 0) continue;
      const ti = types[type[i]], tj = types[type[j]];
      const q = d / H;
      const s = (ti.visc + tj.visc) * 0.5, b = (ti.visc2 + tj.visc2) * 0.5;
      const I = Math.min(u * 0.5, dt * (1 - q) * (s * u + b * u * u)) * 0.5;
      vx[i] -= I * dx; vy[i] -= I * dy; vx[j] += I * dx; vy[j] += I * dy;
    }
    // predict positions
    for (let i = 0; i < n; i++) {
      if (pin[i]) { vx[i] = 0; vy[i] = 0; ox[i] = px[i]; oy[i] = py[i]; continue; }
      const sp = vx[i] * vx[i] + vy[i] * vy[i];
      if (sp > MAX_SPEED * MAX_SPEED) { const f = MAX_SPEED / Math.sqrt(sp); vx[i] *= f; vy[i] *= f; }
      ox[i] = px[i]; oy[i] = py[i];
      px[i] += vx[i] * dt; py[i] += vy[i] * dt;
    }
    // double-density relaxation, particle by particle (Gauss-Seidel, as in Clavet et al.)
    adjacency();
    for (let i = 0; i < n; i++) {
      const a0 = adjStart[i], a1 = adjStart[i + 1];
      if (a0 === a1) continue;
      let r = 0, rn = 0;
      for (let k = a0; k < a1; k++) {
        const j = adj[k], ex = px[j] - px[i], ey = py[j] - py[i];
        const d = Math.sqrt(ex * ex + ey * ey);
        adjD[k] = d;
        const q = 1 - d / H;
        if (q > 0) { const q2 = q * q; r += q2; rn += q2 * q; }
      }
      const P = tune.K * SCALE * (r - RHO0), PN = tune.KNEAR * SCALE * rn;
      const Ti = types[type[i]], mi = Ti.mass, pi = pin[i];
      let dxi = 0, dyi = 0;
      for (let k = a0; k < a1; k++) {
        const j = adj[k];
        const d = adjD[k], q = 1 - d / H;
        if (q <= 0 || (pi && pin[j])) continue;
        let ex = px[j] - px[i], ey = py[j] - py[i];
        if (d < 1e-6) { ex = Math.random() - 0.5; ey = Math.random() - 0.5; } else { ex /= d; ey /= d; }
        let D = P * q + PN * q * q;
        // negative pressure pulls particles together (surface tension), capped per liquid type
        const Tj = types[type[j]];
        const pull = Math.min(Ti.pull, Tj.pull);
        if (D > 0.03 * SCALE) D = 0.03 * SCALE; else if (D < -pull * SCALE) D = -pull * SCALE;
        // heavy liquid does not get shoved around by light liquid as easily (that is what floats oil);
        // pinned ice doesn't move at all
        const wj = pin[j] ? 0 : pi ? 1 : mi / (mi + Tj.mass);
        px[j] += ex * D * wj; py[j] += ey * D * wj;
        dxi -= ex * D * (1 - wj); dyi -= ey * D * (1 - wj);
      }
      if (!pi) { px[i] += dxi; py[i] += dyi; }
    }
    collide(dt);
    // recover velocities
    const inv = 1 / dt;
    const damp = 1 / (1 + tune.DAMP * dt);
    for (let i = 0; i < n; i++) { vx[i] = (px[i] - ox[i]) * inv * damp; vy[i] = (py[i] - oy[i]) * inv * damp; }
  }

  /* ---------------------------------------------------------------- liquids meeting liquids */
  const ev = { steam: 0, sx: 0, sy: 0, ignited: 0, fire: [] };
  const melt = (i) => { type[i] = WATER; pin[i] = 0; };
  const freeze = (i) => { type[i] = ICE; vx[i] = 0; vy[i] = 0; lonely[i] = 0; burn[i] = 0; };
  // heat: { amb } (the air temperature) or null when temperature is switched off
  // blades: lightsaber blades as x1, y1, x2, y2, radius per blade
  function reactions(dt, fires, gx, gy, heat, blades) {
    const gl = Math.sqrt(gx * gx + gy * gy), ux = gl > 0.1 ? gx / gl : 0, uy = gl > 0.1 ? gy / gl : 0;
    let anyIce = false;
    for (let i = 0; i < n; i++) if (type[i] === ICE) { anyIce = true; break; }
    const near2 = (0.16 * SCALE) * (0.16 * SCALE);   // ice this close counts as joined
    for (let k = 0; k < pairs; k++) {
      const i = pa[k], j = pb[k];
      const a = type[i], b = type[j];
      if (anyIce && (a === ICE || b === ICE)) {
        const dx = px[j] - px[i], dy = py[j] - py[i];
        if (dx * dx + dy * dy < near2) { if (a === ICE && iceNb[j] < 255) iceNb[j]++; if (b === ICE && iceNb[i] < 255) iceNb[i]++; }
      }
      if (a === b || a >= 250 || b >= 250) continue;
      if (a === ICE || b === ICE) {
        // lava melts ice (and the meltwater then quenches the lava)
        if ((a === LAVA || b === LAVA) && Math.random() < dt * 12) { const c = a === ICE ? i : j; melt(c); ev.steam++; ev.sx = px[c]; ev.sy = py[c]; }
        continue;
      }
      // Layering: a heavier drop sitting right above a lighter one trades places with it now and then.
      // The pressure solver alone lets the drops jam, so oil could stay stuck under water.
      if (gl > 0.1) {
        const ma = types[a].mass, mb = types[b].mass;
        if (Math.abs(ma - mb) > 0.1 * Math.min(ma, mb)) {
          const hv = ma > mb ? i : j, lt = hv === i ? j : i;
          const down = (px[lt] - px[hv]) * ux + (py[lt] - py[hv]) * uy;   // how far the light drop is below
          if (down > 0.35 * H && Math.random() < dt * 4) {
            const t = type[hv]; type[hv] = type[lt]; type[lt] = t;
            let q = age[hv]; age[hv] = age[lt]; age[lt] = q;
            q = burn[hv]; burn[hv] = burn[lt]; burn[lt] = q;
            q = lonely[hv]; lonely[hv] = lonely[lt]; lonely[lt] = q;
            continue;
          }
        }
      }
      // water (or blood) on lava: steam, and the lava quenches into rock
      if ((a === LAVA && (b === WATER || b === BLOOD)) || (b === LAVA && (a === WATER || a === BLOOD))) {
        if (Math.random() > dt * 18) continue;
        const l = a === LAVA ? i : j, w = l === i ? j : i;
        type[l] = COOLED; age[l] = 0; type[w] = 255;
        ev.steam++; ev.sx = px[w]; ev.sy = py[w];
      } else if ((a === OIL && (b === LAVA || burn[j] > 0)) || (b === OIL && (a === LAVA || burn[i] > 0))) {
        // lava or burning oil sets oil alight
        const o = a === OIL ? i : j;
        if (burn[o] <= 0 && Math.random() < dt * 6) { burn[o] = 3 + Math.random() * 4; ev.ignited++; }
      } else if ((a === ACID && b === WATER) || (b === ACID && a === WATER)) {
        // acid slowly dilutes into water
        const c = a === ACID ? i : j;
        if (Math.random() < dt * 0.25) type[c] = WATER;
      }
    }
    if (anyIce) {
      // ice is pinned where it is when it is joined, through other ice, to something solid that doesn't move
      let top = 0;
      for (let i = 0; i < n; i++) { const p = type[i] === ICE && anchor[i] ? 1 : 0; pin[i] = p; if (p) stack[top++] = i; }
      while (top) {
        const i = stack[--top];
        for (let k = adjStart[i], e = adjStart[i + 1]; k < e; k++) {
          const j = adj[k];
          if (pin[j] || type[j] !== ICE) continue;
          const dx = px[j] - px[i], dy = py[j] - py[i];
          if (dx * dx + dy * dy < near2) { pin[j] = 1; stack[top++] = j; }
        }
      }
      // fire and lightsaber blades melt it
      if (fires.length || blades.length) for (let i = 0; i < n; i++) {
        if (type[i] !== ICE) continue;
        const x = px[i], y = py[i];
        for (let f = 0; f < fires.length; f += 3) {
          const dx = x - fires[f], dy = y - fires[f + 1];
          if (dx * dx + dy * dy < fires[f + 2] * fires[f + 2] && Math.random() < dt * 4) { melt(i); break; }
        }
        if (type[i] !== ICE) continue;
        for (let q = 0; q < blades.length; q += 5) {
          const ax = blades[q], ay = blades[q + 1], ex = blades[q + 2] - ax, ey = blades[q + 3] - ay, l2 = ex * ex + ey * ey;
          let t = l2 > 1e-9 ? ((x - ax) * ex + (y - ay) * ey) / l2 : 0;
          t = t < 0 ? 0 : t > 1 ? 1 : t;
          const dx = x - ax - ex * t, dy = y - ay - ey * t, rr = blades[q + 4] + R * 1.5;
          if (dx * dx + dy * dy < rr * rr) { melt(i); ev.steam++; ev.sx = x; ev.sy = y; break; }
        }
      }
    }
    // burning things set oil alight
    if (fires.length) for (let i = 0; i < n; i++) {
      if (type[i] !== OIL || burn[i] > 0) continue;
      for (let f = 0; f < fires.length; f += 3) {
        const dx = px[i] - fires[f], dy = py[i] - fires[f + 1];
        if (dx * dx + dy * dy < fires[f + 2] * fires[f + 2]) { burn[i] = 3 + Math.random() * 4; ev.ignited++; break; }
      }
    }
    // lone drops dry up (water, blood, acid) or cool off (lava); burning oil burns away
    ev.fire.length = 0;
    let fireStride = 1;
    for (let i = 0; i < n; i++) if (burn[i] > 0) fireStride++;
    fireStride = Math.max(1, Math.floor(fireStride / 24));
    let fk = 0;
    for (let i = n - 1; i >= 0; i--) {
      const t = type[i];
      if (t >= 250 || gone[i]) { remove(i); continue; }
      age[i] += dt;
      const nbr = adjStart[i + 1] - adjStart[i];
      lonely[i] = nbr <= 2 ? lonely[i] + dt : 0;
      const T = types[t];
      if (T.evaporate && lonely[i] > T.evaporate) { remove(i); continue; }
      if (t === LAVA && lonely[i] > 8) { type[i] = COOLED; age[i] = 0; }
      if (heat && t === WATER) {
        // Water freezes in cold air (still water first, and fastest next to ice already there) and
        // where it touches something below freezing.
        let rate = 0;
        if (heat.amb < 0 && vx[i] * vx[i] + vy[i] * vy[i] < 1) rate += -heat.amb / 15 * (0.015 + (iceNb[i] ? 0.2 : 0));
        if (tmin[i] < 0) rate += -tmin[i] / 80;
        if (rate > 0 && Math.random() < rate * dt) freeze(i);
      } else if (heat && t === ICE) {
        // Ice melts in warm air (from its surface in) and where it touches something hot.
        let rate = 0;
        if (heat.amb > 0) rate += heat.amb / 20 * (iceNb[i] < 5 ? 0.12 : 0.01);
        if (tmax[i] > 40) rate += (tmax[i] - 40) / 30;
        if (rate > 0 && Math.random() < rate * dt) melt(i);
      }
      if (burn[i] > 0) {
        burn[i] -= dt;
        if ((fk++ % fireStride) === 0 && ev.fire.length < 72) ev.fire.push(px[i], py[i]);
        if (burn[i] <= 0) { remove(i); continue; }
      }
    }
  }

  /* ---------------------------------------------------------------- commands */
  let seedGone = 0;
  function applyOp(op) {
    switch (op.k) {
      case 'config': types = op.types; NT = types.length; break;
      case 'spacing': setSpacing(op.s); break;
      case 'tune': Object.assign(tune, op.tune); break;
      case 'clear': n = 0; break;
      case 'add': {
        const a = op.a; // t, x, y, vx, vy per particle
        for (let q = 0; q < a.length; q += 5) add(a[q], a[q + 1], a[q + 2], a[q + 3], a[q + 4]);
        break;
      }
      case 'load': {
        n = 0;
        if (op.s) setSpacing(op.s);
        const p = op.p, t = op.t, v = op.v;
        ensure(t.length);
        for (let i = 0; i < t.length; i++) {
          add(t[i], p[i * 2], p[i * 2 + 1], v ? v[i * 2] : 0, v ? v[i * 2 + 1] : 0);
          age[n - 1] = 10;
          if (op.b && op.b[i] > 0) burn[n - 1] = op.b[i];
        }
        break;
      }
      case 'erase': {
        const r2 = op.r * op.r;
        for (let i = n - 1; i >= 0; i--) { const dx = px[i] - op.x, dy = py[i] - op.y; if (dx * dx + dy * dy < r2) { remove(i); seedGone++; } }
        break;
      }
      case 'blast': {
        const r = op.r * 1.4, r2 = r * r;
        for (let i = 0; i < n; i++) {
          const dx = px[i] - op.x, dy = py[i] - op.y, q = dx * dx + dy * dy;
          if (q > r2) continue;
          const dist = Math.sqrt(q) || 0.01, near = 1 - dist / op.r;
          if (op.cold) {
            // a cryo blast freezes water where it is (and some of it a little beyond)
            if (type[i] === WATER && (near > 0 || Math.random() < 0.5)) { freeze(i); ox[i] = px[i]; oy[i] = py[i]; }
            if (type[i] === ICE) continue;
          } else if (type[i] === ICE && near > (op.fire ? 0 : 0.5)) melt(i);   // heat melts ice, a close blast shatters it
          if (pin[i]) continue;
          const f = (1 - dist / r) * 14 / types[type[i]].mass * (op.cold ? 0.3 : 1);
          vx[i] += dx / dist * f; vy[i] += dy / dist * f - f * 0.3;
          ox[i] = px[i] - vx[i] / 60; oy[i] = py[i] - vy[i] / 60;
          if (op.fire && type[i] === OIL && burn[i] <= 0) burn[i] = 3 + Math.random() * 4;
        }
        break;
      }
    }
  }

  /* ---------------------------------------------------------------- one game tick */
  // msg: { ops, statics (shape buffer, when the static world changed), dyn (shape buffer),
  //        bodies, nb, dt, substeps, gx, gy, zones, fires, heat, blades, bounds: [minX, maxX, minY, killY], damp }
  function run(msg) {
    if (msg.ops) for (const op of msg.ops) applyOp(op);
    if (msg.statics) { statics = parseShapes(msg.statics); staticGrid = gridOf(statics); }
    dyns = parseShapes(msg.dyn); dynGrid = gridOf(dyns);
    bodies = msg.bodies || new Float32Array(0); nb = msg.nb || 0;
    STRIDE = 3 + NT + 2 + 3;
    out = new Float32Array(nb * STRIDE);
    for (let b = 0; b < nb; b++) out[b * STRIDE + 4 + NT] = 1e9;
    zones = msg.zones || [];
    ev.steam = 0; ev.ignited = 0; ev.fire.length = 0;
    const dt = msg.dt || 0;
    anchor.fill(0, 0, n); tmin.fill(1e9, 0, n); tmax.fill(-1e9, 0, n); iceNb.fill(0, 0, n);
    // positions at the start of the tick, for smooth drawing between ticks
    rx.set(px.subarray(0, n)); ry.set(py.subarray(0, n));
    if (n && dt > 0) {
      const d0 = tune.DAMP;
      if (msg.damp != null) tune.DAMP = msg.damp;
      const steps = msg.substeps || 2, h = dt / steps;
      for (let s = 0; s < steps; s++) substep(h, msg.gx || 0, msg.gy != null ? msg.gy : 9.8);
      tune.DAMP = d0;
      reactions(dt, msg.fires || [], msg.gx || 0, msg.gy != null ? msg.gy : 9.8, msg.heat || null, msg.blades || []);
      // drains, and particles that leave the map
      const bd = msg.bounds;
      for (let i = n - 1; i >= 0; i--) {
        if (bd && (py[i] > bd[3] || px[i] < bd[0] - 5 || px[i] > bd[1] + 5 || py[i] < bd[2] - 30)) { remove(i); continue; }
        for (const z of zones) if (z.kind === 'drain' && inZone(z, px[i], py[i])) { remove(i); break; }
      }
    }
    return result();
  }
  const flags = { a: new Uint8Array(0) };
  function result() {
    if (flags.a.length < n) flags.a = new Uint8Array(Math.max(n, 1024));
    const f = flags.a;
    // 1 burning, 2 glowing hot, 4 pinned ice
    for (let i = 0; i < n; i++) f[i] = (burn[i] > 0 ? 1 : 0) | ((type[i] === LAVA || (type[i] === COOLED && age[i] < 5)) ? 2 : 0) | (pin[i] && type[i] === ICE ? 4 : 0);
    return {
      n, px: px.subarray(0, n), py: py.subarray(0, n), rx: rx.subarray(0, n), ry: ry.subarray(0, n),
      type: type.subarray(0, n), flags: f.subarray(0, n), bodyOut: out, stride: STRIDE,
      steam: ev.steam, sx: ev.sx, sy: ev.sy, ignited: ev.ignited, fire: ev.fire.slice(),
    };
  }

  return {
    run, applyOp,
    count: () => n,
    // direct access for map setup on the main thread
    arrays: () => ({ px, py, vx, vy, type, burn }),
    remove, setSpacing,
    state() {
      const p = new Float32Array(n * 2), v = new Float32Array(n * 2), t = new Uint8Array(n), b = new Float32Array(n);
      for (let i = 0; i < n; i++) { p[i * 2] = px[i]; p[i * 2 + 1] = py[i]; v[i * 2] = vx[i]; v[i * 2 + 1] = vy[i]; t[i] = type[i]; b[i] = burn[i]; }
      return { p, v, t, b, s: SCALE * 0.1 };
    },
  };
};

/* Worker side: wraps a kernel and answers each message with the new particle state. Buffers are
   passed back and forth (transferred, not copied) so big liquid scenes don't churn memory. */
GP.FluidWorkerMain = function FluidWorkerMain(Kernel) {
  const K = Kernel();
  let pool = {};
  const take = (name, Ctor, src) => {
    let a = pool[name];
    if (!a || a.length < src.length) a = new Ctor(Math.max(1024, Math.ceil(src.length * 1.25)));
    a.set(src);
    return a;
  };
  self.onmessage = (e) => {
    const msg = e.data;
    if (msg.spare) pool = msg.spare;
    let r;
    try { r = K.run(msg); } catch (err) { self.postMessage({ error: String(err && err.stack || err), seq: msg.seq }); return; }
    const o = {
      seq: msg.seq, n: r.n, stride: r.stride, steam: r.steam, sx: r.sx, sy: r.sy, ignited: r.ignited, fire: r.fire,
      px: take('px', Float32Array, r.px), py: take('py', Float32Array, r.py), rx: take('rx', Float32Array, r.rx), ry: take('ry', Float32Array, r.ry),
      type: take('type', Uint8Array, r.type), flags: take('flags', Uint8Array, r.flags), bodyOut: r.bodyOut,
      state: msg.wantState ? K.state() : null,
    };
    pool = {};
    const tr = [o.px.buffer, o.py.buffer, o.rx.buffer, o.ry.buffer, o.type.buffer, o.flags.buffer, o.bodyOut.buffer];
    if (o.state) tr.push(o.state.p.buffer, o.state.v.buffer, o.state.t.buffer, o.state.b.buffer);
    self.postMessage(o, tr);
  };
};
