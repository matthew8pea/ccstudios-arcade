/* GALACTIC PLAYGROUND physics — world, broad phase, contact solver, sleeping.
 *
 * Stepping scheme (designed for this project):
 *   - Broad phase runs once per tick using velocity-fattened bounds.
 *   - The tick is split into sub-steps. Every sub-step re-runs the narrow phase on the candidate pairs,
 *     solves velocity constraints (joints, then contacts with friction), integrates positions,
 *     applies restitution, then projects positions to remove overlap and joint drift.
 *   - Accumulated impulses are carried between sub-steps (matched by contact feature ids) to converge
 *     stacks quickly.
 *   - Bodies that stay still are grouped into islands (contacts + joints) and put to sleep together.
 */
'use strict';

(() => {
  const Phys = GP.Phys;
  const clamp = GP.M.clamp;

  class SpatialHash {
    constructor(cell) {
      this.cell = cell; this.inv = 1 / cell;
      this.cells = new Map(); this.used = []; this.big = [];
    }
    clear() { for (const a of this.used) a.length = 0; this.used.length = 0; this.big.length = 0; }
    insert(s) {
      const inv = this.inv;
      const x0 = Math.floor(s.fminX * inv), x1 = Math.floor(s.fmaxX * inv);
      const y0 = Math.floor(s.fminY * inv), y1 = Math.floor(s.fmaxY * inv);
      if ((x1 - x0 + 1) * (y1 - y0 + 1) > 200) { this.big.push(s); return; }
      for (let ix = x0; ix <= x1; ix++) {
        for (let iy = y0; iy <= y1; iy++) {
          const key = ((ix & 0xffff) << 16) | (iy & 0xffff);
          let arr = this.cells.get(key);
          if (!arr) { arr = []; this.cells.set(key, arr); }
          if (arr.length === 0) this.used.push(arr);
          arr.push(s);
        }
      }
    }
    query(minX, minY, maxX, maxY, stamp, fn) {
      const inv = this.inv;
      const x0 = Math.floor(minX * inv), x1 = Math.floor(maxX * inv);
      const y0 = Math.floor(minY * inv), y1 = Math.floor(maxY * inv);
      const big = this.big;
      for (let i = 0; i < big.length; i++) {
        const s = big[i];
        if (s.stamp === stamp) continue;
        s.stamp = stamp;
        if (s.fmaxX < minX || s.fminX > maxX || s.fmaxY < minY || s.fminY > maxY) continue;
        fn(s);
      }
      if ((x1 - x0 + 1) * (y1 - y0 + 1) > 4000) { // huge query: fall back to scanning all cells
        for (const arr of this.used) for (let i = 0; i < arr.length; i++) {
          const s = arr[i];
          if (s.stamp === stamp) continue;
          s.stamp = stamp;
          if (s.fmaxX < minX || s.fminX > maxX || s.fmaxY < minY || s.fminY > maxY) continue;
          fn(s);
        }
        return;
      }
      for (let ix = x0; ix <= x1; ix++) {
        for (let iy = y0; iy <= y1; iy++) {
          const arr = this.cells.get(((ix & 0xffff) << 16) | (iy & 0xffff));
          if (!arr) continue;
          for (let i = 0; i < arr.length; i++) {
            const s = arr[i];
            if (s.stamp === stamp) continue;
            s.stamp = stamp;
            if (s.fmaxX < minX || s.fminX > maxX || s.fmaxY < minY || s.fminY > maxY) continue;
            fn(s);
          }
        }
      }
    }
  }

  const makePoint = () => ({
    x: 0, y: 0, sep: 0, id: -1, rax: 0, ray: 0, rbx: 0, rby: 0, nMass: 0, tMass: 0,
    ln: 0, lt: 0, relVn: 0, relVnLin: 0, lax: 0, lay: 0, lbx: 0, lby: 0, stepMaxLn: 0,
  });

  class Contact {
    constructor(sA, sB, key) {
      this.key = key;
      this.sA = sA; this.sB = sB; this.bA = sA.body; this.bB = sB.body;
      this.pts = [makePoint(), makePoint()];
      this.tmp = { nx: 0, ny: 0, count: 0, pts: [makePoint(), makePoint()] };
      this.count = 0; this.nx = 0; this.ny = 0;
      this.friction = Math.sqrt(sA.friction * sB.friction);
      this.restitution = Math.max(sA.restitution, sB.restitution);
      this.surfaceSpeed = sA.surfaceSpeed + sB.surfaceSpeed;
      this.sensor = sA.sensor || sB.sensor;
      this.enabled = true;
      this.stamp = 0;
      this.touching = false; this.wasTouching = false;
      this.impulse = 0; this.approach = 0; this.approachLin = 0;
      this.age = 0;
    }
  }

  class World {
    constructor(opts = {}) {
      this.gravityX = opts.gravityX || 0;
      this.gravityY = opts.gravityY != null ? opts.gravityY : 9.8;
      this.bodies = [];
      this.joints = [];
      this.contacts = new Map();
      this.active = [];
      this.dynGrid = new SpatialHash(1.6);
      this.statGrid = new SpatialHash(2.0);
      this.staticDirty = true;
      this.stamp = 1;
      this.tick = 0;
      this.time = 0;
      this.lastH = 0;
      this.substeps = 4; this.velocityIterations = 6; this.positionIterations = 2;
      this.sleepEnabled = true;
      this.onPreSolve = null;       // (contact) => void, may set contact.enabled = false
      this.onJointBreak = null;     // (joint) => void
      this.onBodyRemoved = null;
      this.stats = { bodies: 0, awake: 0, contacts: 0, joints: 0, stepMs: 0 };
      this.ground = new Phys.Body({ type: Phys.STATIC });
      this.ground.world = this;
      this.ground.finalize();
      this.dirtyBodies = false;
    }

    addBody(b) {
      b.world = this; b.removed = false;
      b.updateShapes();
      this.bodies.push(b);
      if (b.type === Phys.STATIC) this.staticDirty = true;
      return b;
    }
    removeBody(b) {
      if (b.removed || b.world !== this) return;
      b.removed = true;
      for (const j of b.joints.slice()) this.removeJoint(j);
      for (const c of b.contacts.slice()) this.destroyContact(c);
      if (b.type === Phys.STATIC) this.staticDirty = true;
      this.dirtyBodies = true;
      if (this.onBodyRemoved) this.onBodyRemoved(b);
    }
    addJoint(j) {
      j.world = this; this.joints.push(j);
      j.a.joints.push(j); j.b.joints.push(j);
      if (!j.collideConnected) {
        // drop existing contacts between the pair
        for (const c of j.a.contacts.slice()) if (c.bA === j.b || c.bB === j.b) this.destroyContact(c);
      }
      j.a.wake(); j.b.wake();
      return j;
    }
    removeJoint(j) {
      const i = this.joints.indexOf(j);
      if (i >= 0) this.joints.splice(i, 1);
      let k = j.a.joints.indexOf(j); if (k >= 0) j.a.joints.splice(k, 1);
      k = j.b.joints.indexOf(j); if (k >= 0) j.b.joints.splice(k, 1);
      if (!j.a.removed) j.a.wake();
      if (!j.b.removed) j.b.wake();
      j.world = null;
    }
    destroyContact(c) {
      this.contacts.delete(c.key);
      let i = c.bA.contacts.indexOf(c); if (i >= 0) c.bA.contacts.splice(i, 1);
      i = c.bB.contacts.indexOf(c); if (i >= 0) c.bB.contacts.splice(i, 1);
      c.dead = true;
    }

    shouldCollide(a, b) {
      if (!a.enabled || !b.enabled) return false;
      if (a.group !== 0 && a.group === b.group) return a.group > 0;
      if ((a.category & b.mask) === 0 || (b.category & a.mask) === 0) return false;
      const A = a.body, B = b.body;
      if (A.joints.length && B.joints.length) {
        const js = A.joints.length < B.joints.length ? A.joints : B.joints;
        for (let i = 0; i < js.length; i++) {
          const j = js[i];
          if (!j.collideConnected && ((j.a === A && j.b === B) || (j.a === B && j.b === A))) return false;
        }
      }
      return true;
    }

    wakeBody(b) {
      if (b.type !== Phys.DYNAMIC) return;
      if (!b.sleeping) { b.sleepTime = 0; return; }
      const stack = [b];
      while (stack.length) {
        const x = stack.pop();
        if (!x.sleeping) continue;
        x.sleeping = false; x.sleepTime = 0;
        for (const c of x.contacts) {
          const o = c.bA === x ? c.bB : c.bA;
          if (o.sleeping && o.type === Phys.DYNAMIC && c.touching) stack.push(o);
        }
        for (const j of x.joints) {
          const o = j.a === x ? j.b : j.a;
          if (o.sleeping && o.type === Phys.DYNAMIC) stack.push(o);
        }
      }
    }
    wakeTouching(b) {
      for (const c of b.contacts) { const o = c.bA === b ? c.bB : c.bA; o.wake(); }
      for (const j of b.joints) { const o = j.a === b ? j.b : j.a; o.wake(); }
    }
    wakeAll() { for (const b of this.bodies) if (b.type === Phys.DYNAMIC) { b.sleeping = false; b.sleepTime = 0; } }

    compact() {
      if (!this.dirtyBodies) return;
      this.bodies = this.bodies.filter((b) => !b.removed);
      this.dirtyBodies = false;
    }

    fatten(s, b, dt) {
      const m = 0.04 + (Math.abs(b.vx) + Math.abs(b.vy) + Math.abs(b.w) * b.radius) * dt;
      s.fminX = s.minX - m; s.fminY = s.minY - m; s.fmaxX = s.maxX + m; s.fmaxY = s.maxY + m;
    }

    rebuildStatic() {
      this.statGrid.clear();
      for (const b of this.bodies) {
        if (b.type !== Phys.STATIC || b.removed) continue;   // removed bodies stay listed until compact()
        for (const s of b.shapes) {
          s.updateWorld(b);
          s.fminX = s.minX - 0.02; s.fminY = s.minY - 0.02; s.fmaxX = s.maxX + 0.02; s.fmaxY = s.maxY + 0.02;
          this.statGrid.insert(s);
        }
      }
      this.staticDirty = false;
      this.staticVersion = (this.staticVersion || 0) + 1;   // lets the liquid kernel know the static world changed
    }

    broadPhase(dt) {
      const tickStamp = ++this.tick;
      if (this.staticDirty) this.rebuildStatic();
      const dyn = this.dynGrid;
      dyn.clear();
      const movers = [];
      for (const b of this.bodies) {
        if (b.type === Phys.STATIC) continue;
        for (const s of b.shapes) { this.fatten(s, b, dt); dyn.insert(s); }
        movers.push(b);
      }
      const active = this.active;
      active.length = 0;
      const self = this;
      for (const b of movers) {
        const bAwake = !b.sleeping;
        if (!bAwake && b.type === Phys.DYNAMIC) continue; // sleeping bodies: pairs are started by awake partners
        for (const s of b.shapes) {
          if (!s.enabled) continue;
          const st = ++this.stamp;
          const cb = (t) => {
            const tb = t.body;
            if (tb === b) return;
            if (tb.type !== Phys.STATIC && !tb.sleeping && t.id < s.id) return; // pair handled from the other side
            if (tb.type === Phys.KINEMATIC && b.type === Phys.KINEMATIC) return;
            if (b.type === Phys.KINEMATIC && tb.type === Phys.STATIC) return;
            if (!self.shouldCollide(s, t)) return;
            const lo = s.id < t.id ? s : t, hi = lo === s ? t : s;
            const key = lo.id * 4194304 + hi.id;
            let c = self.contacts.get(key);
            if (!c) {
              c = new Contact(lo, hi, key);
              self.contacts.set(key, c);
              lo.body.contacts.push(c); hi.body.contacts.push(c);
            }
            if (c.stamp !== tickStamp) { c.stamp = tickStamp; active.push(c); }
          };
          this.statGrid.query(s.fminX, s.fminY, s.fmaxX, s.fmaxY, st, cb);
          dyn.query(s.fminX, s.fminY, s.fmaxX, s.fmaxY, st, cb);
        }
      }
      // retain contacts between resting (asleep/static) bodies; destroy stale ones
      for (const c of this.contacts.values()) {
        if (c.stamp === tickStamp) continue;
        const aRest = c.bA.sleeping || c.bA.type === Phys.STATIC;
        const bRest = c.bB.sleeping || c.bB.type === Phys.STATIC;
        if (aRest && bRest && !c.bA.removed && !c.bB.removed) { c.stamp = tickStamp; continue; }
        this.destroyContact(c);
      }
    }

    narrowPhase(c, h) {
      const A = c.bA, B = c.bB, m = c.tmp;
      const speed = Math.abs(A.vx - B.vx) + Math.abs(A.vy - B.vy) + Math.abs(A.w) * A.radius + Math.abs(B.w) * B.radius;
      const margin = 0.012 + speed * h;
      const n = Phys.collide(c.sA, c.sB, margin, m);
      // carry impulses by feature id
      for (let i = 0; i < n; i++) {
        const np = m.pts[i];
        np.ln = 0; np.lt = 0;
        for (let k = 0; k < c.count; k++) {
          const op = c.pts[k];
          if (op.id === np.id) { np.ln = op.ln; np.lt = op.lt; break; }
        }
      }
      // swap buffers
      const old = c.pts; c.pts = m.pts; m.pts = old;
      c.count = n; c.nx = m.nx; c.ny = m.ny;
      let touching = false;
      for (let i = 0; i < n; i++) if (c.pts[i].sep < 0.008) touching = true;
      c.touching = touching;
    }

    prepareContact(c, h) {
      const A = c.bA, B = c.bB, nx = c.nx, ny = c.ny;
      const mA = A.im, mB = B.im, iA = A.iI, iB = B.iI;
      for (let i = 0; i < c.count; i++) {
        const p = c.pts[i];
        const rax = p.x - A.x, ray = p.y - A.y, rbx = p.x - B.x, rby = p.y - B.y;
        p.rax = rax; p.ray = ray; p.rbx = rbx; p.rby = rby;
        // local anchors for position projection
        p.lax = A.c * rax + A.s * ray; p.lay = -A.s * rax + A.c * ray;
        p.lbx = B.c * rbx + B.s * rby; p.lby = -B.s * rbx + B.c * rby;
        const rnA = rax * ny - ray * nx, rnB = rbx * ny - rby * nx;
        const kn = mA + mB + iA * rnA * rnA + iB * rnB * rnB;
        p.nMass = kn > 0 ? 1 / kn : 0;
        const tx = -ny, ty = nx;
        const rtA = rax * ty - ray * tx, rtB = rbx * ty - rby * tx;
        const kt = mA + mB + iA * rtA * rtA + iB * rtB * rtB;
        p.tMass = kt > 0 ? 1 / kt : 0;
        const dvx = B.vx - B.w * rby - A.vx + A.w * ray;
        const dvy = B.vy + B.w * rbx - A.vy - A.w * rax;
        p.relVn = dvx * nx + dvy * ny;
        p.relVnLin = (B.vx - A.vx) * nx + (B.vy - A.vy) * ny; // centre-of-mass closing speed, without spin
        p.stepMaxLn = 0;
        // warm start
        const px = p.ln * nx + p.lt * tx, py = p.ln * ny + p.lt * ty;
        A.vx -= mA * px; A.vy -= mA * py; A.w -= iA * (rax * py - ray * px);
        B.vx += mB * px; B.vy += mB * py; B.w += iB * (rbx * py - rby * px);
      }
    }

    solveContact(c, h) {
      const A = c.bA, B = c.bB, nx = c.nx, ny = c.ny, tx = -ny, ty = nx;
      const mA = A.im, mB = B.im, iA = A.iI, iB = B.iI;
      const mu = c.friction, invH = 1 / h;
      for (let i = 0; i < c.count; i++) {
        const p = c.pts[i];
        const rax = p.rax, ray = p.ray, rbx = p.rbx, rby = p.rby;
        // friction
        let dvx = B.vx - B.w * rby - A.vx + A.w * ray;
        let dvy = B.vy + B.w * rbx - A.vy - A.w * rax;
        const vt = dvx * tx + dvy * ty - c.surfaceSpeed;
        let lt = -p.tMass * vt;
        const maxF = mu * p.ln;
        const oldT = p.lt;
        p.lt = clamp(oldT + lt, -maxF, maxF);
        lt = p.lt - oldT;
        let px = lt * tx, py = lt * ty;
        A.vx -= mA * px; A.vy -= mA * py; A.w -= iA * (rax * py - ray * px);
        B.vx += mB * px; B.vy += mB * py; B.w += iB * (rbx * py - rby * px);
        // normal
        dvx = B.vx - B.w * rby - A.vx + A.w * ray;
        dvy = B.vy + B.w * rbx - A.vy - A.w * rax;
        const vn = dvx * nx + dvy * ny;
        const bias = p.sep > 0 ? p.sep * invH : 0;
        let ln = -p.nMass * (vn + bias);
        const oldN = p.ln;
        p.ln = Math.max(oldN + ln, 0);
        ln = p.ln - oldN;
        if (p.ln > p.stepMaxLn) p.stepMaxLn = p.ln;
        px = ln * nx; py = ln * ny;
        A.vx -= mA * px; A.vy -= mA * py; A.w -= iA * (rax * py - ray * px);
        B.vx += mB * px; B.vy += mB * py; B.w += iB * (rbx * py - rby * px);
      }
    }

    restitute(c) {
      if (c.restitution <= 0) return;
      const A = c.bA, B = c.bB, nx = c.nx, ny = c.ny;
      const mA = A.im, mB = B.im, iA = A.iI, iB = B.iI;
      for (let i = 0; i < c.count; i++) {
        const p = c.pts[i];
        if (p.relVn > -1.0 || p.stepMaxLn <= 0) continue;
        const dvx = B.vx - B.w * p.rby - A.vx + A.w * p.ray;
        const dvy = B.vy + B.w * p.rbx - A.vy - A.w * p.rax;
        const vn = dvx * nx + dvy * ny;
        let ln = -p.nMass * (vn + c.restitution * p.relVn);
        const old = p.ln;
        p.ln = Math.max(old + ln, 0);
        ln = p.ln - old;
        const px = ln * nx, py = ln * ny;
        A.vx -= mA * px; A.vy -= mA * py; A.w -= iA * (p.rax * py - p.ray * px);
        B.vx += mB * px; B.vy += mB * py; B.w += iB * (p.rbx * py - p.rby * px);
      }
    }

    projectContact(c) {
      const A = c.bA, B = c.bB, nx = c.nx, ny = c.ny;
      const mA = A.im, mB = B.im, iA = A.iI, iB = B.iI;
      for (let i = 0; i < c.count; i++) {
        const p = c.pts[i];
        const rax = A.c * p.lax - A.s * p.lay, ray = A.s * p.lax + A.c * p.lay;
        const rbx = B.c * p.lbx - B.s * p.lby, rby = B.s * p.lbx + B.c * p.lby;
        const sep = p.sep + (B.x + rbx - A.x - rax) * nx + (B.y + rby - A.y - ray) * ny;
        const C = clamp(0.25 * (sep + 0.004), -0.08, 0);
        if (C >= 0) continue;
        const rnA = rax * ny - ray * nx, rnB = rbx * ny - rby * nx;
        const k = mA + mB + iA * rnA * rnA + iB * rnB * rnB;
        if (k <= 0) continue;
        const imp = -C / k;
        const px = imp * nx, py = imp * ny;
        A.x -= mA * px; A.y -= mA * py; if (iA) A.setAngle(A.a - iA * (rax * py - ray * px));
        B.x += mB * px; B.y += mB * py; if (iB) B.setAngle(B.a + iB * (rbx * py - rby * px));
      }
    }

    step(dt) {
      if (dt <= 0) return;
      const t0 = performance.now();
      this.compact();
      const S = Math.max(1, this.substeps | 0);
      const h = dt / S;
      if (this.lastH > 0 && Math.abs(this.lastH - h) > 1e-9) {
        const k = h / this.lastH;
        for (const j of this.joints) j.scaleImpulses(k);
        for (const c of this.contacts.values()) for (let i = 0; i < c.count; i++) { c.pts[i].ln *= k; c.pts[i].lt *= k; }
      }
      this.lastH = h;

      this.broadPhase(dt);

      // Wake sleeping bodies touched by awake movers
      const active = this.active;
      for (let i = 0; i < active.length; i++) {
        const c = active[i];
        const A = c.bA, B = c.bB;
        if (A.sleeping && !B.sleeping && B.type !== Phys.STATIC && (c.touching || c.count === 0)) this.wakeBody(A);
        else if (B.sleeping && !A.sleeping && A.type !== Phys.STATIC && (c.touching || c.count === 0)) this.wakeBody(B);
      }

      // collect awake bodies & solvable joints
      const bodies = [];
      for (const b of this.bodies) if (b.type !== Phys.STATIC && !b.sleeping) bodies.push(b);
      const joints = [];
      for (const j of this.joints) {
        const aOn = j.a.type === Phys.DYNAMIC && !j.a.sleeping, bOn = j.b.type === Phys.DYNAMIC && !j.b.sleeping;
        if (aOn || bOn) joints.push(j);
      }
      const solveList = [];
      for (const c of active) c.impulse = 0, c.approach = 0, c.approachLin = 0, c.wasTouching = c.touching;

      const gx = this.gravityX, gy = this.gravityY;
      for (let sub = 0; sub < S; sub++) {
        // integrate velocities
        for (let i = 0; i < bodies.length; i++) {
          const b = bodies[i];
          if (b.type !== Phys.DYNAMIC) continue;
          b.vx += h * (gx * b.gravityScale + b.fx * b.im);
          b.vy += h * (gy * b.gravityScale + b.fy * b.im);
          b.w += h * b.torque * b.iI;
          const ld = 1 / (1 + h * b.linearDamping), ad = 1 / (1 + h * b.angularDamping);
          b.vx *= ld; b.vy *= ld; b.w *= ad;
          // hard safety clamp
          const sp2 = b.vx * b.vx + b.vy * b.vy;
          if (sp2 > 40000) { const k = 200 / Math.sqrt(sp2); b.vx *= k; b.vy *= k; }
          if (b.w > 80) b.w = 80; else if (b.w < -80) b.w = -80;
        }
        // narrow phase
        solveList.length = 0;
        for (let i = 0; i < active.length; i++) {
          const c = active[i];
          if (c.dead) continue;
          this.narrowPhase(c, h);
          if (sub === 0) {
            c.enabled = true;
            if (c.count > 0 && this.onPreSolve) this.onPreSolve(c);
          }
          if (c.count > 0 && c.enabled && !c.sensor) solveList.push(c);
        }
        for (let i = 0; i < joints.length; i++) { joints[i].prepare(h); joints[i].warmStart(); }
        for (let i = 0; i < solveList.length; i++) this.prepareContact(solveList[i], h);
        for (let it = 0; it < this.velocityIterations; it++) {
          for (let i = 0; i < joints.length; i++) joints[i].solveVelocity(h);
          for (let i = 0; i < solveList.length; i++) this.solveContact(solveList[i], h);
        }
        // integrate positions
        for (let i = 0; i < bodies.length; i++) {
          const b = bodies[i];
          b.x += h * b.vx; b.y += h * b.vy;
          if (b.w !== 0) b.setAngle(b.a + h * b.w);
        }
        for (let i = 0; i < solveList.length; i++) this.restitute(solveList[i]);
        for (let it = 0; it < this.positionIterations; it++) {
          for (let i = 0; i < joints.length; i++) joints[i].solvePosition();
          for (let i = 0; i < solveList.length; i++) this.projectContact(solveList[i]);
        }
        for (let i = 0; i < bodies.length; i++) bodies[i].updateShapes();
        // record impact data
        for (let i = 0; i < solveList.length; i++) {
          const c = solveList[i];
          let sum = 0, app = 0, lin = 0;
          for (let k = 0; k < c.count; k++) { sum += c.pts[k].stepMaxLn; app = Math.max(app, -c.pts[k].relVn); lin = Math.max(lin, -c.pts[k].relVnLin); }
          if (sum > c.impulse) c.impulse = sum;
          if (app > c.approach) c.approach = app;
          if (lin > c.approachLin) c.approachLin = lin;
        }
      }

      for (let i = 0; i < bodies.length; i++) { const b = bodies[i]; b.fx = 0; b.fy = 0; b.torque = 0; }

      // joint breaking
      const invH = 1 / h;
      for (let i = 0; i < joints.length; i++) {
        const j = joints[i];
        if (j.broken || (j.graceUntil && this.time < j.graceUntil)) continue;
        j.force = j.loadForce(invH);
        if (j.force > j.breakForce) {
          j.broken = true;
          this.removeJoint(j);
          if (this.onJointBreak) this.onJointBreak(j);
        }
      }

      this.updateSleep(dt, bodies);
      this.time += dt;
      const st = this.stats;
      st.bodies = this.bodies.length; st.awake = bodies.length; st.contacts = active.length; st.joints = this.joints.length;
      st.stepMs = st.stepMs * 0.9 + (performance.now() - t0) * 0.1;
    }

    updateSleep(dt, bodies) {
      const linTol2 = 0.06 * 0.06, angTol = 0.12;
      for (const b of bodies) {
        if (b.type !== Phys.DYNAMIC) continue;
        if (!b.allowSleep || !this.sleepEnabled || b.vx * b.vx + b.vy * b.vy > linTol2 || Math.abs(b.w) > angTol) b.sleepTime = 0;
        else b.sleepTime += dt;
      }
      if (!this.sleepEnabled) return;
      // union-find islands over awake dynamic bodies
      const n = bodies.length;
      const parent = new Int32Array(n);
      for (let i = 0; i < n; i++) { parent[i] = i; bodies[i].island = i; }
      const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
      const inSet = (b) => b.type === Phys.DYNAMIC && !b.sleeping && bodies[b.island] === b;
      const union = (a, b) => { const ra = find(a.island), rb = find(b.island); if (ra !== rb) parent[ra] = rb; };
      for (const c of this.active) {
        if (c.dead || !c.touching || c.sensor || !c.enabled) continue;
        if (inSet(c.bA) && inSet(c.bB)) union(c.bA, c.bB);
      }
      for (const j of this.joints) if (inSet(j.a) && inSet(j.b)) union(j.a, j.b);
      const minSleep = new Float64Array(n).fill(Infinity);
      for (let i = 0; i < n; i++) {
        const b = bodies[i];
        if (b.type !== Phys.DYNAMIC) continue;
        const r = find(i);
        if (b.sleepTime < minSleep[r]) minSleep[r] = b.sleepTime;
      }
      for (let i = 0; i < n; i++) {
        const b = bodies[i];
        if (b.type !== Phys.DYNAMIC) continue;
        if (minSleep[find(i)] >= 0.6) { b.sleeping = true; b.vx = 0; b.vy = 0; b.w = 0; }
      }
    }

    /* ---------------- queries ---------------- */
    queryAABB(minX, minY, maxX, maxY, fn) {
      const st = ++this.stamp;
      if (this.staticDirty) this.rebuildStatic();
      this.statGrid.query(minX, minY, maxX, maxY, st, fn);
      this.dynGrid.query(minX, minY, maxX, maxY, st, fn);
    }
    // Bodies whose shapes contain the point (topmost = last added)
    queryPoint(x, y, filter) {
      const out = [];
      this.queryAABB(x - 0.01, y - 0.01, x + 0.01, y + 0.01, (s) => {
        if (s.body.removed || !s.enabled) return;
        if (filter && !filter(s)) return;
        if (s.containsPoint(x, y) && out.indexOf(s.body) < 0) out.push(s.body);
      });
      return out;
    }
    // Nearest shape within radius of a point
    queryNearest(x, y, radius, filter) {
      let best = null, bd = radius;
      this.queryAABB(x - radius, y - radius, x + radius, y + radius, (s) => {
        if (s.body.removed || !s.enabled) return;
        if (filter && !filter(s)) return;
        const d = Phys.pointShapeDistance(s, x, y);
        if (d < bd) { bd = d; best = s; }
      });
      return best ? { shape: best, body: best.body, dist: bd } : null;
    }
    queryRadius(x, y, r, fn) {
      this.queryAABB(x - r, y - r, x + r, y + r, fn);
    }
    raycast(x1, y1, x2, y2, filter) {
      let best = null;
      const minX = Math.min(x1, x2), minY = Math.min(y1, y2), maxX = Math.max(x1, x2), maxY = Math.max(y1, y2);
      this.queryAABB(minX, minY, maxX, maxY, (s) => {
        if (s.body.removed || !s.enabled) return;
        if (filter && !filter(s)) return;
        const hit = Phys.raycastShape(s, x1, y1, x2, y2);
        if (hit && (!best || hit.t < best.t)) {
          best = hit; best.shape = s; best.body = s.body;
        }
      });
      if (best) { best.x = x1 + (x2 - x1) * best.t; best.y = y1 + (y2 - y1) * best.t; }
      return best;
    }

    clear() {
      for (const b of this.bodies) b.removed = true;
      this.bodies = []; this.joints = []; this.contacts.clear(); this.active.length = 0;
      this.staticDirty = true; this.dynGrid.clear(); this.statGrid.clear();
    }
  }

  Phys.World = World;
})();
