/* GALACTIC PLAYGROUND physics — joint constraints.
 * Each joint implements:
 *   prepare(h)          compute anchors and effective masses for the sub-step
 *   warmStart()         re-apply accumulated impulses
 *   solveVelocity(h)    velocity-level impulses
 *   solvePosition()     direct positional projection to remove drift
 * Joints track the constraint force they carry so they can break when overloaded.
 */
'use strict';

(() => {
  const Phys = GP.Phys;
  let jointIds = 1;

  const cross = (ax, ay, bx, by) => ax * by - ay * bx;

  class Joint {
    constructor(kind, a, b, opts = {}) {
      this.id = jointIds++;
      this.kind = kind;
      this.a = a; this.b = b;
      this.collideConnected = !!opts.collideConnected;
      this.breakForce = opts.breakForce || Infinity;
      this.breakTorque = opts.breakTorque || Infinity;
      this.broken = false;
      this.force = 0; this.torqueLoad = 0;
      this.world = null;
      this.tag = opts.tag || null;       // gameplay tag, e.g. 'ragdoll', 'weld', 'rope', 'grip'
      this.data = opts.data || null;
      this.userMade = !!opts.userMade;
    }
    setLocalAnchors(wx, wy, wx2, wy2) {
      const la = this.a.toLocal(wx, wy), lb = this.b.toLocal(wx2 != null ? wx2 : wx, wy2 != null ? wy2 : wy);
      this.lax = la.x; this.lay = la.y; this.lbx = lb.x; this.lby = lb.y;
    }
    anchorA() { return this.a.toWorld(this.lax, this.lay); }
    anchorB() { return this.b.toWorld(this.lbx, this.lby); }
    computeAnchors() {
      const A = this.a, B = this.b;
      this.rax = A.c * this.lax - A.s * this.lay; this.ray = A.s * this.lax + A.c * this.lay;
      this.rbx = B.c * this.lbx - B.s * this.lby; this.rby = B.s * this.lbx + B.c * this.lby;
    }
    scaleImpulses() {}
  }

  /* Pin joint with optional angle limits and motor. Relative angle = (b.a - a.a) - refAngle. */
  class RevoluteJoint extends Joint {
    constructor(a, b, wx, wy, opts = {}) {
      super('revolute', a, b, opts);
      this.setLocalAnchors(wx, wy);
      this.refAngle = opts.refAngle != null ? opts.refAngle : b.a - a.a;
      this.enableLimit = !!opts.enableLimit;
      this.lower = opts.lower || 0; this.upper = opts.upper || 0;
      this.enableMotor = !!opts.enableMotor;
      this.motorSpeed = opts.motorSpeed || 0;
      this.maxMotorTorque = opts.maxMotorTorque || 0;
      this.ix = 0; this.iy = 0; this.motorImpulse = 0; this.lowerImpulse = 0; this.upperImpulse = 0;
    }
    angle() { return GP.M.wrapAngle(this.b.a - this.a.a - this.refAngle); }
    scaleImpulses(k) { this.ix *= k; this.iy *= k; this.motorImpulse *= k; this.lowerImpulse *= k; this.upperImpulse *= k; }
    prepare(h) {
      this.computeAnchors();
      const A = this.a, B = this.b;
      const mA = A.im, mB = B.im, iA = A.iI, iB = B.iI;
      const rax = this.rax, ray = this.ray, rbx = this.rbx, rby = this.rby;
      this.k11 = mA + mB + iA * ray * ray + iB * rby * rby;
      this.k12 = -iA * rax * ray - iB * rbx * rby;
      this.k22 = mA + mB + iA * rax * rax + iB * rbx * rbx;
      const det = this.k11 * this.k22 - this.k12 * this.k12;
      this.invDet = det !== 0 ? 1 / det : 0;
      this.axialMass = iA + iB > 0 ? 1 / (iA + iB) : 0;
      if (!this.enableMotor) this.motorImpulse = 0;
      if (!this.enableLimit) { this.lowerImpulse = 0; this.upperImpulse = 0; }
    }
    warmStart() {
      const A = this.a, B = this.b;
      const ax = this.motorImpulse + this.lowerImpulse - this.upperImpulse;
      A.vx -= A.im * this.ix; A.vy -= A.im * this.iy;
      A.w -= A.iI * (cross(this.rax, this.ray, this.ix, this.iy) + ax);
      B.vx += B.im * this.ix; B.vy += B.im * this.iy;
      B.w += B.iI * (cross(this.rbx, this.rby, this.ix, this.iy) + ax);
    }
    solveVelocity(h) {
      const A = this.a, B = this.b;
      const iA = A.iI, iB = B.iI;
      if (this.enableMotor && this.axialMass > 0) {
        const cdot = B.w - A.w - this.motorSpeed;
        let imp = -this.axialMass * cdot;
        const old = this.motorImpulse, max = this.maxMotorTorque * h;
        this.motorImpulse = GP.M.clamp(old + imp, -max, max);
        imp = this.motorImpulse - old;
        A.w -= iA * imp; B.w += iB * imp;
      }
      if (this.enableLimit && this.axialMass > 0) {
        const ang = this.angle();
        { // lower
          const C = ang - this.lower;
          const bias = C > 0 ? C / h : 0;
          const cdot = B.w - A.w;
          let imp = -this.axialMass * (cdot + bias);
          const old = this.lowerImpulse;
          this.lowerImpulse = Math.max(old + imp, 0);
          imp = this.lowerImpulse - old;
          A.w -= iA * imp; B.w += iB * imp;
        }
        { // upper
          const C = this.upper - ang;
          const bias = C > 0 ? C / h : 0;
          const cdot = A.w - B.w;
          let imp = -this.axialMass * (cdot + bias);
          const old = this.upperImpulse;
          this.upperImpulse = Math.max(old + imp, 0);
          imp = this.upperImpulse - old;
          A.w += iA * imp; B.w -= iB * imp;
        }
      }
      // point constraint
      const rax = this.rax, ray = this.ray, rbx = this.rbx, rby = this.rby;
      const cx = B.vx - B.w * rby - A.vx + A.w * ray;
      const cy = B.vy + B.w * rbx - A.vy - A.w * rax;
      const px = -this.invDet * (this.k22 * cx - this.k12 * cy);
      const py = -this.invDet * (-this.k12 * cx + this.k11 * cy);
      this.ix += px; this.iy += py;
      A.vx -= A.im * px; A.vy -= A.im * py; A.w -= iA * cross(rax, ray, px, py);
      B.vx += B.im * px; B.vy += B.im * py; B.w += iB * cross(rbx, rby, px, py);
    }
    solvePosition() {
      const A = this.a, B = this.b;
      const iA = A.iI, iB = B.iI;
      // angle limits
      if (this.enableLimit && this.axialMass > 0) {
        const ang = this.angle();
        let C = 0;
        if (ang < this.lower) C = ang - this.lower;
        else if (ang > this.upper) C = ang - this.upper;
        if (C !== 0) {
          C = GP.M.clamp(C, -0.3, 0.3);
          const imp = -this.axialMass * C * 0.5;
          A.setAngle(A.a - iA * imp); B.setAngle(B.a + iB * imp);
        }
      }
      this.computeAnchors();
      const rax = this.rax, ray = this.ray, rbx = this.rbx, rby = this.rby;
      const cx = B.x + rbx - A.x - rax, cy = B.y + rby - A.y - ray;
      const mA = A.im, mB = B.im;
      const k11 = mA + mB + iA * ray * ray + iB * rby * rby;
      const k12 = -iA * rax * ray - iB * rbx * rby;
      const k22 = mA + mB + iA * rax * rax + iB * rbx * rbx;
      const det = k11 * k22 - k12 * k12;
      if (det === 0) return;
      const inv = 1 / det;
      const px = -inv * (k22 * cx - k12 * cy) * 0.8;
      const py = -inv * (-k12 * cx + k11 * cy) * 0.8;
      A.x -= mA * px; A.y -= mA * py; A.setAngle(A.a - iA * cross(rax, ray, px, py));
      B.x += mB * px; B.y += mB * py; B.setAngle(B.a + iB * cross(rbx, rby, px, py));
    }
    loadForce(invH) { return Math.hypot(this.ix, this.iy) * invH; }
  }

  /* Weld: point constraint + locked relative angle. */
  class WeldJoint extends Joint {
    constructor(a, b, wx, wy, opts = {}) {
      super('weld', a, b, opts);
      this.setLocalAnchors(wx, wy);
      this.refAngle = opts.refAngle != null ? opts.refAngle : b.a - a.a;
      this.ix = 0; this.iy = 0; this.ia = 0;
      this.angularSoftness = opts.angularSoftness || 0; // 0 = rigid
    }
    scaleImpulses(k) { this.ix *= k; this.iy *= k; this.ia *= k; }
    prepare(h) {
      this.computeAnchors();
      const A = this.a, B = this.b;
      const mA = A.im, mB = B.im, iA = A.iI, iB = B.iI;
      const rax = this.rax, ray = this.ray, rbx = this.rbx, rby = this.rby;
      this.k11 = mA + mB + iA * ray * ray + iB * rby * rby;
      this.k12 = -iA * rax * ray - iB * rbx * rby;
      this.k22 = mA + mB + iA * rax * rax + iB * rbx * rbx;
      const det = this.k11 * this.k22 - this.k12 * this.k12;
      this.invDet = det !== 0 ? 1 / det : 0;
      this.axialMass = iA + iB > 0 ? 1 / (iA + iB) : 0;
    }
    warmStart() {
      const A = this.a, B = this.b;
      A.vx -= A.im * this.ix; A.vy -= A.im * this.iy; A.w -= A.iI * (cross(this.rax, this.ray, this.ix, this.iy) + this.ia);
      B.vx += B.im * this.ix; B.vy += B.im * this.iy; B.w += B.iI * (cross(this.rbx, this.rby, this.ix, this.iy) + this.ia);
    }
    solveVelocity() {
      const A = this.a, B = this.b, iA = A.iI, iB = B.iI;
      if (this.axialMass > 0) {
        const imp = -this.axialMass * (B.w - A.w) * (1 - this.angularSoftness);
        this.ia += imp;
        A.w -= iA * imp; B.w += iB * imp;
      }
      const rax = this.rax, ray = this.ray, rbx = this.rbx, rby = this.rby;
      const cx = B.vx - B.w * rby - A.vx + A.w * ray;
      const cy = B.vy + B.w * rbx - A.vy - A.w * rax;
      const px = -this.invDet * (this.k22 * cx - this.k12 * cy);
      const py = -this.invDet * (-this.k12 * cx + this.k11 * cy);
      this.ix += px; this.iy += py;
      A.vx -= A.im * px; A.vy -= A.im * py; A.w -= iA * cross(rax, ray, px, py);
      B.vx += B.im * px; B.vy += B.im * py; B.w += iB * cross(rbx, rby, px, py);
    }
    solvePosition() {
      const A = this.a, B = this.b, iA = A.iI, iB = B.iI;
      if (this.axialMass > 0) {
        const C = GP.M.clamp(GP.M.wrapAngle(B.a - A.a - this.refAngle), -0.3, 0.3);
        const imp = -this.axialMass * C * 0.6 * (1 - this.angularSoftness);
        A.setAngle(A.a - iA * imp); B.setAngle(B.a + iB * imp);
      }
      this.computeAnchors();
      const rax = this.rax, ray = this.ray, rbx = this.rbx, rby = this.rby;
      const cx = B.x + rbx - A.x - rax, cy = B.y + rby - A.y - ray;
      const mA = A.im, mB = B.im;
      const k11 = mA + mB + iA * ray * ray + iB * rby * rby;
      const k12 = -iA * rax * ray - iB * rbx * rby;
      const k22 = mA + mB + iA * rax * rax + iB * rbx * rbx;
      const det = k11 * k22 - k12 * k12;
      if (det === 0) return;
      const inv = 1 / det;
      const px = -inv * (k22 * cx - k12 * cy) * 0.8;
      const py = -inv * (-k12 * cx + k11 * cy) * 0.8;
      A.x -= mA * px; A.y -= mA * py; A.setAngle(A.a - iA * cross(rax, ray, px, py));
      B.x += mB * px; B.y += mB * py; B.setAngle(B.a + iB * cross(rbx, rby, px, py));
    }
    loadForce(invH) { return Math.hypot(this.ix, this.iy) * invH; }
  }

  /* Distance joint. mode: 'rope' (max length), 'rod' (fixed), 'spring' (soft). */
  class DistanceJoint extends Joint {
    constructor(a, b, ax, ay, bx, by, opts = {}) {
      super('distance', a, b, opts);
      this.setLocalAnchors(ax, ay, bx, by);
      this.length = opts.length != null ? opts.length : Math.hypot(bx - ax, by - ay);
      this.mode = opts.mode || 'rope';
      this.hertz = opts.hertz || 3;            // spring frequency
      this.damping = opts.damping != null ? opts.damping : 0.5;
      this.impulse = 0;
    }
    scaleImpulses(k) { this.impulse *= k; }
    prepare(h) {
      this.computeAnchors();
      const A = this.a, B = this.b;
      let ux = B.x + this.rbx - A.x - this.rax, uy = B.y + this.rby - A.y - this.ray;
      const len = Math.hypot(ux, uy);
      this.curLen = len;
      if (len > 1e-6) { ux /= len; uy /= len; } else { ux = 0; uy = 1; }
      this.ux = ux; this.uy = uy;
      const crA = cross(this.rax, this.ray, ux, uy), crB = cross(this.rbx, this.rby, ux, uy);
      const k = A.im + B.im + A.iI * crA * crA + B.iI * crB * crB;
      this.mass = k > 0 ? 1 / k : 0;
      if (this.mode === 'spring') {
        const m = this.mass;
        const omega = 2 * Math.PI * this.hertz;
        const kS = m * omega * omega, cS = 2 * m * this.damping * omega;
        const d = h * (cS + h * kS);
        this.gamma = d > 0 ? 1 / d : 0;
        this.bias = (len - this.length) * kS * this.gamma;
        this.mass = k + this.gamma > 0 ? 1 / (k + this.gamma) : 0;
      }
      if (this.mode === 'rope' && len < this.length - 0.05) this.impulse = 0;
    }
    warmStart() {
      const A = this.a, B = this.b, px = this.impulse * this.ux, py = this.impulse * this.uy;
      A.vx -= A.im * px; A.vy -= A.im * py; A.w -= A.iI * cross(this.rax, this.ray, px, py);
      B.vx += B.im * px; B.vy += B.im * py; B.w += B.iI * cross(this.rbx, this.rby, px, py);
    }
    solveVelocity(h) {
      const A = this.a, B = this.b;
      const vax = A.vx - A.w * this.ray, vay = A.vy + A.w * this.rax;
      const vbx = B.vx - B.w * this.rby, vby = B.vy + B.w * this.rbx;
      const cdot = (vbx - vax) * this.ux + (vby - vay) * this.uy;
      let imp;
      if (this.mode === 'spring') {
        imp = -this.mass * (cdot + this.bias + this.gamma * this.impulse);
        this.impulse += imp;
      } else if (this.mode === 'rope') {
        const C = this.curLen - this.length;
        const bias = C < 0 ? C / h : 0;
        imp = -this.mass * (cdot + bias);
        const old = this.impulse;
        this.impulse = Math.min(0, old + imp);
        imp = this.impulse - old;
      } else {
        imp = -this.mass * cdot;
        this.impulse += imp;
      }
      const px = imp * this.ux, py = imp * this.uy;
      A.vx -= A.im * px; A.vy -= A.im * py; A.w -= A.iI * cross(this.rax, this.ray, px, py);
      B.vx += B.im * px; B.vy += B.im * py; B.w += B.iI * cross(this.rbx, this.rby, px, py);
    }
    solvePosition() {
      if (this.mode === 'spring') return;
      const A = this.a, B = this.b;
      this.computeAnchors();
      let ux = B.x + this.rbx - A.x - this.rax, uy = B.y + this.rby - A.y - this.ray;
      const len = Math.hypot(ux, uy);
      if (len < 1e-6) return;
      ux /= len; uy /= len;
      let C = len - this.length;
      if (this.mode === 'rope' && C < 0) return;
      C = GP.M.clamp(C, -0.2, 0.2);
      const crA = cross(this.rax, this.ray, ux, uy), crB = cross(this.rbx, this.rby, ux, uy);
      const k = A.im + B.im + A.iI * crA * crA + B.iI * crB * crB;
      if (k <= 0) return;
      const imp = -C / k * 0.8;
      const px = imp * ux, py = imp * uy;
      A.x -= A.im * px; A.y -= A.im * py; A.setAngle(A.a - A.iI * cross(this.rax, this.ray, px, py));
      B.x += B.im * px; B.y += B.im * py; B.setAngle(B.a + B.iI * cross(this.rbx, this.rby, px, py));
    }
    loadForce(invH) { return Math.abs(this.impulse) * invH; }
  }

  /* Soft target constraint for dragging bodies with the cursor or the Force.
   * a = world ground (static), b = dragged body. */
  class TargetJoint extends Joint {
    constructor(ground, b, wx, wy, opts = {}) {
      super('target', ground, b, opts);
      const lb = b.toLocal(wx, wy);
      this.lbx = lb.x; this.lby = lb.y; this.lax = 0; this.lay = 0;
      this.tx = wx; this.ty = wy;
      this.hertz = opts.hertz || 5;
      this.dampingRatio = opts.dampingRatio != null ? opts.dampingRatio : 0.8;
      this.maxForce = opts.maxForce || 1000;
      this.effMass = opts.effectiveMass || b.m;
      this.angularDamp = opts.angularDamp != null ? opts.angularDamp : 0.5;
      this.ix = 0; this.iy = 0;
    }
    setTarget(x, y) { this.tx = x; this.ty = y; }
    scaleImpulses(k) { this.ix *= k; this.iy *= k; }
    prepare(h) {
      const B = this.b;
      this.rbx = B.c * this.lbx - B.s * this.lby; this.rby = B.s * this.lbx + B.c * this.lby;
      this.rax = 0; this.ray = 0;
      const omega = 2 * Math.PI * this.hertz;
      const m = this.effMass;
      const k = m * omega * omega, c = 2 * m * this.dampingRatio * omega;
      const d = h * (c + h * k);
      this.gamma = d > 0 ? 1 / d : 0;
      this.beta = h * k * this.gamma;
      const mB = B.im, iB = B.iI, rx = this.rbx, ry = this.rby;
      this.k11 = mB + iB * ry * ry + this.gamma;
      this.k12 = -iB * rx * ry;
      this.k22 = mB + iB * rx * rx + this.gamma;
      const det = this.k11 * this.k22 - this.k12 * this.k12;
      this.invDet = det !== 0 ? 1 / det : 0;
      this.cx = B.x + rx - this.tx; this.cy = B.y + ry - this.ty;
      B.w *= 1 - this.angularDamp * h * 10 > 0 ? 1 - this.angularDamp * h * 10 : 0;
    }
    warmStart() {
      const B = this.b;
      B.vx += B.im * this.ix; B.vy += B.im * this.iy; B.w += B.iI * cross(this.rbx, this.rby, this.ix, this.iy);
    }
    solveVelocity(h) {
      const B = this.b, rx = this.rbx, ry = this.rby;
      const vx = B.vx - B.w * ry + this.beta / h * this.cx + this.gamma * this.ix;
      const vy = B.vy + B.w * rx + this.beta / h * this.cy + this.gamma * this.iy;
      let px = -this.invDet * (this.k22 * vx - this.k12 * vy);
      let py = -this.invDet * (-this.k12 * vx + this.k11 * vy);
      const ox = this.ix, oy = this.iy;
      this.ix += px; this.iy += py;
      const max = this.maxForce * h, l = Math.hypot(this.ix, this.iy);
      if (l > max) { this.ix *= max / l; this.iy *= max / l; }
      px = this.ix - ox; py = this.iy - oy;
      B.vx += B.im * px; B.vy += B.im * py; B.w += B.iI * cross(rx, ry, px, py);
    }
    solvePosition() {}
    loadForce() { return 0; }
  }

  Phys.RevoluteJoint = RevoluteJoint;
  Phys.WeldJoint = WeldJoint;
  Phys.DistanceJoint = DistanceJoint;
  Phys.TargetJoint = TargetJoint;
})();
