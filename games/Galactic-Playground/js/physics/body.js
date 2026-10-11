/* GALACTIC PLAYGROUND physics — shapes and rigid bodies.
 * Bodies are positioned at their center of mass. Shapes store geometry relative to the body center
 * of mass; `body.ox, body.oy` keep the offset from the center of mass to the authoring origin so
 * renderers can draw content in the frame it was designed in.
 */
'use strict';

GP.Phys = GP.Phys || {};

(() => {
  const Phys = GP.Phys;

  Phys.CAT = {
    WORLD: 1, PROP: 2, CHAR: 4, DEBRIS: 8, BLADE: 16, VEHICLE: 32, ITEM: 64, SENSOR: 128, SHIELD: 256,
    ALL: 0xffff,
  };
  Phys.STATIC = 0; Phys.KINEMATIC = 1; Phys.DYNAMIC = 2;

  let shapeIds = 1;

  class Shape {
    constructor(kind, opts = {}) {
      this.id = shapeIds++;
      this.kind = kind;                    // 'circle' | 'poly'
      this.body = null;
      this.density = opts.density != null ? opts.density : 100;
      this.friction = opts.friction != null ? opts.friction : 0.6;
      this.restitution = opts.restitution != null ? opts.restitution : 0.1;
      this.category = opts.category || Phys.CAT.PROP;
      this.mask = opts.mask != null ? opts.mask : Phys.CAT.ALL;
      this.group = opts.group || 0;
      this.sensor = !!opts.sensor;
      this.surfaceSpeed = opts.surfaceSpeed || 0;   // conveyor-style tangential speed
      this.tag = opts.tag || null;                  // gameplay tag (e.g. 'blade', 'shield', 'lava')
      this.data = opts.data || null;                // gameplay payload (component id, etc.)
      this.minX = 0; this.minY = 0; this.maxX = 0; this.maxY = 0;
      this.stamp = 0;
      this.enabled = true;
      this.massless = !!opts.massless;
    }
  }

  class Circle extends Shape {
    constructor(r, x = 0, y = 0, opts) {
      super('circle', opts);
      this.r = r; this.lx = x; this.ly = y; this.wx = 0; this.wy = 0;
    }
    updateWorld(b) {
      this.wx = b.x + b.c * this.lx - b.s * this.ly;
      this.wy = b.y + b.s * this.lx + b.c * this.ly;
      this.minX = this.wx - this.r; this.maxX = this.wx + this.r;
      this.minY = this.wy - this.r; this.maxY = this.wy + this.r;
    }
    massData() {
      const area = Math.PI * this.r * this.r;
      const m = area * this.density;
      return { area, m, cx: this.lx, cy: this.ly, I: m * (0.5 * this.r * this.r + this.lx * this.lx + this.ly * this.ly) };
    }
    translate(dx, dy) { this.lx += dx; this.ly += dy; }
    radiusFrom(x, y) { return Math.hypot(this.lx - x, this.ly - y) + this.r; }
    containsPoint(px, py) { const dx = px - this.wx, dy = py - this.wy; return dx * dx + dy * dy <= this.r * this.r; }
    clone() { const s = new Circle(this.r, this.lx, this.ly, this); return s; }
  }

  class Poly extends Shape {
    constructor(verts, opts) {
      super('poly', opts);
      this.setVerts(verts);
    }
    // verts: flat array [x0,y0,x1,y1,...] in body-local coordinates (convex)
    setVerts(verts) {
      let v = verts.slice();
      const n = v.length / 2;
      let area = 0;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        area += v[i * 2] * v[j * 2 + 1] - v[j * 2] * v[i * 2 + 1];
      }
      if (area < 0) { // enforce positive signed area so edge normal (ey,-ex) points outward
        const r = [];
        for (let i = n - 1; i >= 0; i--) r.push(v[i * 2], v[i * 2 + 1]);
        v = r;
      }
      this.n = n;
      this.lv = v;
      this.ln = new Array(n * 2);
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const ex = v[j * 2] - v[i * 2], ey = v[j * 2 + 1] - v[i * 2 + 1];
        const len = Math.hypot(ex, ey) || 1;
        this.ln[i * 2] = ey / len; this.ln[i * 2 + 1] = -ex / len;
      }
      this.wv = new Array(n * 2).fill(0);
      this.wn = new Array(n * 2).fill(0);
    }
    updateWorld(b) {
      const c = b.c, s = b.s, lv = this.lv, ln = this.ln, wv = this.wv, wn = this.wn;
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (let i = 0, n2 = this.n * 2; i < n2; i += 2) {
        const x = b.x + c * lv[i] - s * lv[i + 1];
        const y = b.y + s * lv[i] + c * lv[i + 1];
        wv[i] = x; wv[i + 1] = y;
        wn[i] = c * ln[i] - s * ln[i + 1];
        wn[i + 1] = s * ln[i] + c * ln[i + 1];
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
      this.minX = minX; this.minY = minY; this.maxX = maxX; this.maxY = maxY;
    }
    massData() {
      // Triangle fan from the first vertex.
      const v = this.lv, n = this.n;
      let area = 0, cx = 0, cy = 0, I = 0;
      const ox = v[0], oy = v[1];
      for (let i = 1; i < n - 1; i++) {
        const e1x = v[i * 2] - ox, e1y = v[i * 2 + 1] - oy;
        const e2x = v[i * 2 + 2] - ox, e2y = v[i * 2 + 3] - oy;
        const d = e1x * e2y - e1y * e2x;
        const a = 0.5 * d;
        area += a;
        cx += a * (e1x + e2x) / 3;
        cy += a * (e1y + e2y) / 3;
        const intx2 = e1x * e1x + e2x * e1x + e2x * e2x;
        const inty2 = e1y * e1y + e2y * e1y + e2y * e2y;
        I += (0.25 / 3) * d * (intx2 + inty2);
      }
      const m = this.density * area;
      cx /= area; cy /= area;
      // I is about (ox,oy); shift to local origin via centroid
      const Ic = this.density * I - m * (cx * cx + cy * cy);
      const gx = cx + ox, gy = cy + oy;
      return { area, m, cx: gx, cy: gy, I: Ic + m * (gx * gx + gy * gy) };
    }
    translate(dx, dy) {
      for (let i = 0; i < this.lv.length; i += 2) { this.lv[i] += dx; this.lv[i + 1] += dy; }
    }
    radiusFrom(x, y) {
      let r = 0;
      for (let i = 0; i < this.lv.length; i += 2) r = Math.max(r, Math.hypot(this.lv[i] - x, this.lv[i + 1] - y));
      return r;
    }
    containsPoint(px, py) {
      const wv = this.wv, wn = this.wn;
      for (let i = 0; i < this.n * 2; i += 2) {
        if ((px - wv[i]) * wn[i] + (py - wv[i + 1]) * wn[i + 1] > 0) return false;
      }
      return true;
    }
    clone() { return new Poly(this.lv, this); }
  }

  Phys.Shape = Shape;
  Phys.Circle = Circle;
  Phys.Poly = Poly;

  Phys.circle = (r, x, y, opts) => new Circle(r, x || 0, y || 0, opts);
  Phys.poly = (verts, opts) => new Poly(verts, opts);
  Phys.box = (w, h, x = 0, y = 0, angle = 0, opts) => {
    const hw = w / 2, hh = h / 2, c = Math.cos(angle), s = Math.sin(angle);
    const pts = [-hw, -hh, hw, -hh, hw, hh, -hw, hh];
    const v = [];
    for (let i = 0; i < 8; i += 2) v.push(x + c * pts[i] - s * pts[i + 1], y + s * pts[i] + c * pts[i + 1]);
    return new Poly(v, opts);
  };
  // Regular polygon approximation (used for rounded props: barrels, domes)
  Phys.ngon = (r, sides, x = 0, y = 0, rot = 0, opts) => {
    const v = [];
    for (let i = 0; i < sides; i++) { const a = rot + i / sides * Math.PI * 2; v.push(x + Math.cos(a) * r, y + Math.sin(a) * r); }
    return new Poly(v, opts);
  };

  let bodyIds = 1;

  class Body {
    constructor(opts = {}) {
      this.id = bodyIds++;
      this.type = opts.type != null ? opts.type : Phys.DYNAMIC;
      this.x = opts.x || 0; this.y = opts.y || 0; this.a = opts.angle || 0;
      this.c = Math.cos(this.a); this.s = Math.sin(this.a);
      this.vx = opts.vx || 0; this.vy = opts.vy || 0; this.w = opts.w || 0;
      this.fx = 0; this.fy = 0; this.torque = 0;
      this.m = 0; this.im = 0; this.I = 0; this.iI = 0;
      this.ox = 0; this.oy = 0;              // center of mass -> authoring origin offset (local)
      this.shapes = [];
      this.linearDamping = opts.linearDamping != null ? opts.linearDamping : 0.02;
      this.angularDamping = opts.angularDamping != null ? opts.angularDamping : 0.08;
      this.gravityScale = opts.gravityScale != null ? opts.gravityScale : 1;
      this.fixedRotation = !!opts.fixedRotation;
      this.massScale = 1;
      this.sleeping = false;
      this.sleepTime = 0;
      this.allowSleep = opts.allowSleep != null ? opts.allowSleep : true;
      this.world = null;
      this.entity = opts.entity || null;
      this.part = opts.part || null;
      this.contacts = [];
      this.joints = [];
      this.frozen = false;
      this.radius = 0;
      this.island = 0;
      this.removed = false;
      this.ccdRadius = 0;
      this.decals = null;
      this.lastHitTime = 0;
    }
    addShape(shape) { shape.body = this; this.shapes.push(shape); return shape; }

    // Compute mass properties and recenter shapes about the center of mass.
    finalize() {
      let m = 0, cx = 0, cy = 0, I = 0;
      for (const s of this.shapes) {
        if (s.massless || s.sensor) continue;
        const md = s.massData();
        m += md.m; cx += md.cx * md.m; cy += md.cy * md.m; I += md.I;
      }
      if (m > 0) {
        cx /= m; cy /= m;
        I -= m * (cx * cx + cy * cy);
      } else { cx = 0; cy = 0; }
      // shift geometry so center of mass is at local origin
      for (const s of this.shapes) s.translate(-cx, -cy);
      this.ox -= cx; this.oy -= cy;
      const wx = this.c * cx - this.s * cy, wy = this.s * cx + this.c * cy;
      this.x += wx; this.y += wy;
      this.baseMass = m; this.baseI = I;
      this.applyMass();
      let r = 0;
      for (const s of this.shapes) r = Math.max(r, s.radiusFrom(0, 0));
      this.radius = r;
      this.updateShapes();
      return this;
    }
    applyMass() {
      const m = this.baseMass * this.massScale, I = this.baseI * this.massScale;
      if (this.type === Phys.DYNAMIC && m > 0) {
        this.m = m; this.im = 1 / m;
        this.I = this.fixedRotation ? 0 : I; this.iI = this.fixedRotation || I <= 0 ? 0 : 1 / I;
      } else {
        this.m = m; this.im = 0; this.I = I; this.iI = 0;
      }
    }
    setMassScale(k) { this.massScale = k; this.applyMass(); }
    // Recompute mass after shapes changed (keeps world position of existing geometry)
    rebuildMass() {
      const oldOx = this.ox, oldOy = this.oy;
      // move shapes back to authoring frame
      for (const s of this.shapes) s.translate(-oldOx, -oldOy);
      const wx = this.c * oldOx - this.s * oldOy, wy = this.s * oldOx + this.c * oldOy;
      this.x += wx; this.y += wy;
      this.ox = 0; this.oy = 0;
      this.finalize();
    }
    updateShapes() { for (const s of this.shapes) s.updateWorld(this); }
    setAngle(a) { this.a = a; this.c = Math.cos(a); this.s = Math.sin(a); }
    setTransform(x, y, a) {
      this.x = x; this.y = y; if (a != null) this.setAngle(a);
      this.px = this.x; this.py = this.y; this.pa = this.a; // moved on purpose: don't draw it sliding over
      this.updateShapes();
      this.wake();
      if (this.type !== Phys.DYNAMIC && this.world) this.world.staticDirty = true;
    }
    // Authoring-origin world position
    originX() { return this.x + this.c * this.ox - this.s * this.oy; }
    originY() { return this.y + this.s * this.ox + this.c * this.oy; }
    setOrigin(x, y, a) {
      if (a != null) this.setAngle(a);
      this.setTransform(x - (this.c * this.ox - this.s * this.oy), y - (this.s * this.ox + this.c * this.oy));
    }
    toWorld(lx, ly) { return { x: this.x + this.c * lx - this.s * ly, y: this.y + this.s * lx + this.c * ly }; }
    toLocal(wx, wy) { const dx = wx - this.x, dy = wy - this.y; return { x: this.c * dx + this.s * dy, y: -this.s * dx + this.c * dy }; }
    // authoring-frame local -> world
    originToWorld(lx, ly) { return this.toWorld(lx + this.ox, ly + this.oy); }
    velocityAt(px, py) { return { x: this.vx - this.w * (py - this.y), y: this.vy + this.w * (px - this.x) }; }
    isDynamic() { return this.type === Phys.DYNAMIC; }

    applyForce(fx, fy, px, py) {
      if (this.type !== Phys.DYNAMIC) return;
      this.fx += fx; this.fy += fy;
      if (px != null) this.torque += (px - this.x) * fy - (py - this.y) * fx;
      if (this.sleeping) this.wake();
    }
    applyTorque(t) { if (this.type === Phys.DYNAMIC) { this.torque += t; if (this.sleeping) this.wake(); } }
    applyImpulse(ix, iy, px, py) {
      if (this.type !== Phys.DYNAMIC) return;
      this.vx += ix * this.im; this.vy += iy * this.im;
      if (px != null) this.w += this.iI * ((px - this.x) * iy - (py - this.y) * ix);
      if (this.sleeping) this.wake();
    }
    applyAngularImpulse(j) { if (this.type === Phys.DYNAMIC) { this.w += this.iI * j; if (this.sleeping) this.wake(); } }

    wake() {
      if (this.world) this.world.wakeBody(this);
      else { this.sleeping = false; this.sleepTime = 0; }
    }

    setFrozen(f) {
      if (f === this.frozen) return;
      this.frozen = f;
      if (f) { this.prevType = this.type; this.type = Phys.STATIC; this.vx = this.vy = this.w = 0; }
      else { this.type = this.prevType != null && this.prevType !== Phys.STATIC ? this.prevType : Phys.DYNAMIC; }
      this.applyMass();
      if (this.world) { this.world.staticDirty = true; this.world.wakeTouching(this); }
      this.sleeping = false; this.sleepTime = 0;
    }

    pointInside(px, py) { for (const s of this.shapes) if (s.enabled && s.containsPoint(px, py)) return true; return false; }

    // Add a visual decal (scorch, cut) in body-local coordinates
    addDecal(kind, wx, wy, size, color) {
      if (!GP.Settings.g.decals) return;
      if (!this.decals) this.decals = [];
      const l = this.toLocal(wx, wy);
      this.decals.push({ kind, x: l.x, y: l.y, size, color, t: 0 });
      if (this.decals.length > 14) this.decals.shift();
    }
  }

  Phys.Body = Body;
})();
