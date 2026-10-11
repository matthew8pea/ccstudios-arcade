import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rand, TAU, mulberry32 } from './util.js';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const _s = new THREE.Vector3();
const _c = new THREE.Color();
const _c2 = new THREE.Color();
const Z_AXIS = new THREE.Vector3(0, 0, 1);

// ---------------------------------------------------------------------------
// Point-sprite particles (sparks, fire, smoke). One draw call per system.
// ---------------------------------------------------------------------------
const PVERT = /* glsl */`
attribute float size;
attribute float alpha;
attribute float rot;
attribute vec3 pcolor;
varying float vAlpha;
varying float vRot;
varying vec3 vColor;
uniform float pixelScale;
void main() {
  vAlpha = alpha;
  vColor = pcolor;
  vRot = rot;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = clamp(size * pixelScale / -mv.z, 1.0, 900.0);
  gl_Position = projectionMatrix * mv;
}`;

const PFRAG = /* glsl */`
varying float vAlpha;
varying float vRot;
varying vec3 vColor;
uniform float soft;
uniform sampler2D map;
void main() {
  vec2 c = gl_PointCoord - 0.5;
#ifdef USE_PMAP
  float s = sin(vRot), co = cos(vRot);
  vec2 r = vec2(c.x * co - c.y * s, c.x * s + c.y * co) + 0.5;
  float a = texture2D(map, r).a;
#else
  float d = length(c) * 2.0;
  if (d > 1.0) discard;
  float a = pow(1.0 - d, soft);
#endif
  gl_FragColor = vec4(vColor, vAlpha * a);
}`;

/** CPU particle system rendered as one Points draw call. Colour fades from c0 to c1 over life. */
export class Particles {
  constructor(scene, max, additive, map = null) {
    this.max = max;
    this.n = 0;
    const F = (k) => new Float32Array(max * k);
    this.p = F(3); this.v = F(3); this.c0 = F(3); this.c1 = F(3);
    this.life = F(1); this.maxLife = F(1); this.s0 = F(1); this.s1 = F(1);
    this.a0 = F(1); this.grav = F(1); this.drag = F(1); this.fadeIn = F(1); this.r = F(1); this.spin = F(1);
    const geo = new THREE.BufferGeometry();
    const dyn = (k) => new THREE.BufferAttribute(F(k), k).setUsage(THREE.DynamicDrawUsage);
    this.aPos = dyn(3); this.aCol = dyn(3); this.aSize = dyn(1); this.aAlpha = dyn(1); this.aRot = dyn(1);
    geo.setAttribute('position', this.aPos);
    geo.setAttribute('pcolor', this.aCol);
    geo.setAttribute('size', this.aSize);
    geo.setAttribute('alpha', this.aAlpha);
    geo.setAttribute('rot', this.aRot);
    geo.setDrawRange(0, 0);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { pixelScale: { value: 800 }, soft: { value: additive ? 1.5 : 1.1 }, map: { value: map } },
      defines: map ? { USE_PMAP: 1 } : {},
      vertexShader: PVERT, fragmentShader: PFRAG,
      transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(geo, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 11 : 10;
    scene.add(this.points);
  }

  /** r1/g1/b1 = end colour (defaults to the start colour); spin in rad/s. */
  emit(x, y, z, vx, vy, vz, life, s0, s1, r, g, b, a0 = 1, grav = 0, drag = 0, fadeIn = 0, r1 = r, g1 = g, b1 = b, spin = 0) {
    if (this.n >= this.max) return;
    const i = this.n++, i3 = i * 3;
    this.p[i3] = x; this.p[i3 + 1] = y; this.p[i3 + 2] = z;
    this.v[i3] = vx; this.v[i3 + 1] = vy; this.v[i3 + 2] = vz;
    this.c0[i3] = r; this.c0[i3 + 1] = g; this.c0[i3 + 2] = b;
    this.c1[i3] = r1; this.c1[i3 + 1] = g1; this.c1[i3 + 2] = b1;
    this.life[i] = 0; this.maxLife[i] = life; this.s0[i] = s0; this.s1[i] = s1;
    this.a0[i] = a0; this.grav[i] = grav; this.drag[i] = drag; this.fadeIn[i] = fadeIn;
    this.r[i] = Math.random() * TAU; this.spin[i] = spin;
  }

  update(dt) {
    let w = 0;
    const P = this.aPos.array, C = this.aCol.array, S = this.aSize.array, A = this.aAlpha.array, R = this.aRot.array;
    for (let i = 0; i < this.n; i++) {
      const l = this.life[i] + dt;
      if (l >= this.maxLife[i]) continue;
      const i3 = i * 3, w3 = w * 3;
      const dragK = Math.max(0, 1 - this.drag[i] * dt);
      const vx = this.v[i3] * dragK, vy = this.v[i3 + 1] * dragK - this.grav[i] * dt, vz = this.v[i3 + 2] * dragK;
      const px = this.p[i3] + vx * dt, py = this.p[i3 + 1] + vy * dt, pz = this.p[i3 + 2] + vz * dt;
      // compact into slot w
      this.p[w3] = px; this.p[w3 + 1] = py; this.p[w3 + 2] = pz;
      this.v[w3] = vx; this.v[w3 + 1] = vy; this.v[w3 + 2] = vz;
      for (let k = 0; k < 3; k++) { this.c0[w3 + k] = this.c0[i3 + k]; this.c1[w3 + k] = this.c1[i3 + k]; }
      this.life[w] = l; this.maxLife[w] = this.maxLife[i];
      this.s0[w] = this.s0[i]; this.s1[w] = this.s1[i]; this.a0[w] = this.a0[i];
      this.grav[w] = this.grav[i]; this.drag[w] = this.drag[i]; this.fadeIn[w] = this.fadeIn[i];
      this.r[w] = this.r[i] + this.spin[i] * dt; this.spin[w] = this.spin[i];
      const k = l / this.maxLife[w];
      P[w3] = px; P[w3 + 1] = py; P[w3 + 2] = pz;
      const ck = Math.min(1, k * 1.6);
      C[w3] = this.c0[w3] + (this.c1[w3] - this.c0[w3]) * ck;
      C[w3 + 1] = this.c0[w3 + 1] + (this.c1[w3 + 1] - this.c0[w3 + 1]) * ck;
      C[w3 + 2] = this.c0[w3 + 2] + (this.c1[w3 + 2] - this.c0[w3 + 2]) * ck;
      S[w] = this.s0[w] + (this.s1[w] - this.s0[w]) * Math.sqrt(k);
      const fi = this.fadeIn[w] > 0 ? Math.min(1, k / this.fadeIn[w]) : 1;
      A[w] = this.a0[w] * fi * (1 - k) * (1 - k * 0.3);
      R[w] = this.r[w];
      w++;
    }
    this.n = w;
    this.points.geometry.setDrawRange(0, w);
    this.aPos.needsUpdate = this.aCol.needsUpdate = this.aSize.needsUpdate = this.aAlpha.needsUpdate = this.aRot.needsUpdate = true;
  }

  clear() { this.n = 0; this.points.geometry.setDrawRange(0, 0); }
}

// ---------------------------------------------------------------------------
// Blaster bolts: camera-facing beams (white-hot core + saturated glow), all in one draw call.
// ---------------------------------------------------------------------------
const BOLT_VERT = /* glsl */`
attribute vec3 aHead;
attribute vec3 aDir;
attribute vec4 aParams; // length, width, intensity, trail length factor
attribute vec3 aColor;
uniform float pixelScale;
varying vec2 vQ;
varying float vLp;
varying float vBody;
varying float vI;
varying vec3 vColor;
void main() {
  float len = aParams.x, w = aParams.y, tl = len * (1.0 + aParams.w);
  vec3 hv = (viewMatrix * vec4(aHead, 1.0)).xyz;
  vec3 dv = normalize((viewMatrix * vec4(aDir, 0.0)).xyz);
  vec3 vd = normalize(hv);
  vec3 side = cross(dv, vd);
  float sl = length(side);
  side = sl > 1e-4 ? side / sl : vec3(1.0, 0.0, 0.0);
  vec3 fwd = cross(vd, side);
  // distant bolts stay at least ~1.5 px wide, so you can follow fire across the battlefield
  float we = max(w, 1.5 * max(-hv.z, 0.05) / pixelScale);
  float a = position.y;
  vec3 p = hv - dv * tl * a + fwd * we * (1.0 - 2.0 * a) + side * position.x * we;
  float lp = tl * max(dot(dv, fwd), 0.0) / we;
  vQ = vec2(position.x, mix(-1.0, lp + 1.0, a));
  vLp = lp;
  vBody = len / tl;
  vI = aParams.z * mix(1.0, w / we, 0.55);
  vColor = aColor;
  gl_Position = projectionMatrix * vec4(p, 1.0);
}`;

const BOLT_FRAG = /* glsl */`
varying vec2 vQ;
varying float vLp;
varying float vBody;
varying float vI;
varying vec3 vColor;
void main() {
  float v = clamp(vQ.y, 0.0, vLp);
  vec2 d = vec2(vQ.x, vQ.y - v);
  float r2 = dot(d, d);
  float t = vLp > 0.0 ? v / vLp : 0.0;
  float body = 1.0 - smoothstep(vBody * 0.8, vBody, t);
  float head = 1.0 - 0.55 * clamp(t / max(vBody, 1e-3), 0.0, 1.0);
  float core = exp(-r2 * 16.0) * body;
  float glow = exp(-r2 * 2.4);
  float trail = (1.0 - body) * (1.0 - clamp((t - vBody) / max(1.0 - vBody, 1e-3), 0.0, 1.0)) * exp(-r2 * 1.2) * 0.14;
  vec3 c = vec3(1.0, 0.98, 0.95) * core * 3.2 * head + vColor * (glow * body * head + trail);
  gl_FragColor = vec4(c * vI, 1.0);
}`;

/** Glowing blaster bolts. Collision is done by the callback passed to update(). */
export class Bolts {
  constructor(scene, max = 700) {
    this.scene = scene;
    this.max = max;
    this.list = [];
    this.trail = 0.0;
    this.colors = new Map();
    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, 0, 0, 1, 0, 0, -1, 1, 0, 1, 1, 0], 3));
    geo.setIndex([0, 2, 1, 2, 3, 1]);
    const ia = (k) => new THREE.InstancedBufferAttribute(new Float32Array(max * k), k).setUsage(THREE.DynamicDrawUsage);
    this.aHead = ia(3); this.aDir = ia(3); this.aParams = ia(4); this.aColor = ia(3);
    geo.setAttribute('aHead', this.aHead);
    geo.setAttribute('aDir', this.aDir);
    geo.setAttribute('aParams', this.aParams);
    geo.setAttribute('aColor', this.aColor);
    geo.instanceCount = 0;
    this.mat = new THREE.ShaderMaterial({
      uniforms: { pixelScale: { value: 800 } },
      vertexShader: BOLT_VERT, fragmentShader: BOLT_FRAG,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 12;
    scene.add(this.mesh);
    this._prev = new THREE.Vector3();
  }

  /** Linear glow colour for a team colour (saturated, HDR). */
  _col(hex) {
    let c = this.colors.get(hex);
    if (!c) {
      c = new THREE.Color(hex);
      const hsl = {};
      c.getHSL(hsl);
      c.setHSL(hsl.h, Math.min(1, hsl.s * 1.1), hsl.l).multiplyScalar(2.6);
      this.colors.set(hex, c);
    }
    return c;
  }

  /** o: { from, dir, speed, dmg, team, owner, color, len, width, noHit, maxDist, intensity } */
  fire(o) {
    if (this.list.length >= this.max) return null;
    const b = {
      pos: o.from.clone(), dir: o.dir.clone().normalize(), speed: o.speed || 90, dmg: o.dmg || 10,
      team: o.team, owner: o.owner, color: o.color, glow: this._col(o.color), len: o.len || 1.8,
      width: o.width || 0.13, intensity: o.intensity || 1, life: 0, travelled: 0, maxDist: o.maxDist || 260,
      noHit: !!o.noHit, whizzed: false, kind: o.kind || '',
    };
    this.list.push(b);
    return b;
  }

  update(dt, onStep) {
    let n = 0;
    const H = this.aHead.array, D = this.aDir.array, P = this.aParams.array, C = this.aColor.array;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const b = this.list[i];
      this._prev.copy(b.pos);
      const step = b.speed * dt;
      b.pos.addScaledVector(b.dir, step);
      b.travelled += step;
      b.life += dt;
      const consumed = !b.noHit && onStep(b, this._prev, b.pos);
      if (consumed || b.travelled > b.maxDist) { this._kill(i); continue; }
    }
    for (const b of this.list) {
      const i3 = n * 3, i4 = n * 4;
      H[i3] = b.pos.x; H[i3 + 1] = b.pos.y; H[i3 + 2] = b.pos.z;
      D[i3] = b.dir.x; D[i3 + 1] = b.dir.y; D[i3 + 2] = b.dir.z;
      const shown = Math.min(b.len, b.travelled);
      P[i4] = Math.max(0.05, shown); P[i4 + 1] = b.width; P[i4 + 2] = b.intensity;
      P[i4 + 3] = b.noHit ? 0 : this.trail * Math.min(1, b.travelled / (b.len * 3));
      C[i3] = b.glow.r; C[i3 + 1] = b.glow.g; C[i3 + 2] = b.glow.b;
      n++;
    }
    this.mesh.geometry.instanceCount = n;
    this.aHead.needsUpdate = this.aDir.needsUpdate = this.aParams.needsUpdate = this.aColor.needsUpdate = true;
  }

  _kill(i) {
    this.list[i] = this.list[this.list.length - 1];
    this.list.pop();
  }

  clear() { this.list.length = 0; this.mesh.geometry.instanceCount = 0; }
}

// ---------------------------------------------------------------------------
// Scorch-mark decals: pooled quads that glow like hot metal, then cool and fade.
// ---------------------------------------------------------------------------
const DECAL_LIFE = 10;

class Decals {
  constructor(scene, max = 64) {
    this.max = max;
    this.next = 0;
    const geo = new THREE.PlaneGeometry(1, 1);
    this.aBorn = new THREE.InstancedBufferAttribute(new Float32Array(max).fill(-1e5), 1);
    this.aSeed = new THREE.InstancedBufferAttribute(new Float32Array(max), 1);
    geo.setAttribute('aBorn', this.aBorn);
    geo.setAttribute('aSeed', this.aSeed);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 } },
      vertexShader: /* glsl */`
        attribute float aBorn; attribute float aSeed;
        uniform float time;
        varying vec2 vUv; varying float vAge; varying float vSeed;
        void main() {
          vUv = uv; vAge = time - aBorn; vSeed = aSeed;
          gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */`
        varying vec2 vUv; varying float vAge; varying float vSeed;
        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float noise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
        void main() {
          vec2 c = vUv - 0.5;
          float r = length(c) * 2.0;
          float ang = atan(c.y, c.x);
          float n = noise(vec2(ang * 2.2 + vSeed * 40.0, r * 3.0)) * 0.6 + noise(vUv * 9.0 + vSeed * 13.0) * 0.4;
          float shape = 1.0 - smoothstep(0.25 + 0.35 * n, 0.95, r);
          float fade = 1.0 - smoothstep(${(DECAL_LIFE - 3).toFixed(1)}, ${DECAL_LIFE.toFixed(1)}, vAge);
          float alpha = shape * 0.82 * fade;
          float ember = exp(-vAge * 1.5) * (1.0 - smoothstep(0.0, 0.35 + 0.25 * n, r));
          if (alpha < 0.01 && ember < 0.01) discard;
          vec3 col = vec3(0.018, 0.016, 0.014) + vec3(5.0, 1.6, 0.35) * ember;
          gl_FragColor = vec4(col, max(alpha, ember));
        }`,
      transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
    });
    this.mesh = new THREE.InstancedMesh(geo, this.mat, max);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    _m.makeScale(0, 0, 0);
    for (let i = 0; i < max; i++) this.mesh.setMatrixAt(i, _m);
    scene.add(this.mesh);
  }

  add(pos, normal, size, time) {
    const i = this.next;
    this.next = (this.next + 1) % this.max;
    _q.setFromUnitVectors(Z_AXIS, normal);
    _v2.set(0, 0, 1);
    const roll = new THREE.Quaternion().setFromAxisAngle(_v2, rand(0, TAU));
    _q.multiply(roll);
    _v.copy(pos).addScaledVector(normal, 0.015);
    _m.compose(_v, _q, _s.set(size, size, 1));
    this.mesh.setMatrixAt(i, _m);
    this.mesh.instanceMatrix.needsUpdate = true;
    this.aBorn.array[i] = time;
    this.aSeed.array[i] = Math.random();
    this.aBorn.needsUpdate = this.aSeed.needsUpdate = true;
  }

  clear() { this.aBorn.array.fill(-1e5); this.aBorn.needsUpdate = true; }
}

// ---------------------------------------------------------------------------
// Textures
// ---------------------------------------------------------------------------
function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.25, 'rgba(255,255,255,0.6)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Star-shaped muzzle flash: a hot centre with sharp spikes. */
function starTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.translate(128, 128);
  g.globalCompositeOperation = 'lighter';
  const spikes = [[0, 1], [Math.PI / 2, 1], [Math.PI / 4, 0.55], [-Math.PI / 4, 0.55], [Math.PI / 8, 0.3], [-3 * Math.PI / 8, 0.3]];
  for (const [a, len] of spikes) {
    g.save();
    g.rotate(a);
    const grd = g.createLinearGradient(-128 * len, 0, 128 * len, 0);
    grd.addColorStop(0, 'rgba(255,255,255,0)');
    grd.addColorStop(0.5, 'rgba(255,255,255,0.95)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.beginPath();
    g.moveTo(-128 * len, 0); g.lineTo(0, -5); g.lineTo(128 * len, 0); g.lineTo(0, 5);
    g.fill();
    g.restore();
  }
  const grd = g.createRadialGradient(0, 0, 0, 0, 0, 60);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.3, 'rgba(255,255,255,0.55)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(-64, -64, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Cloudy puff used by smoke and fire particles (alpha only). */
export function puffTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const rng = mulberry32(99);
  for (let i = 0; i < 26; i++) {
    const a = rng() * TAU, d = Math.pow(rng(), 0.7) * 30;
    const x = 64 + Math.cos(a) * d, y = 64 + Math.sin(a) * d, r = 16 + rng() * 26;
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, `rgba(255,255,255,${0.22 + rng() * 0.2})`);
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // fade the square edges out completely
  g.globalCompositeOperation = 'destination-in';
  const m = g.createRadialGradient(64, 64, 20, 64, 64, 63);
  m.addColorStop(0, 'rgba(0,0,0,1)');
  m.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = m;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

// ---------------------------------------------------------------------------
// Broken droid parts (B1 heads and arms that pop off)
// ---------------------------------------------------------------------------
function b1PartGeometry(kind) {
  const parts = [];
  if (kind === 'head') {
    parts.push(new THREE.CylinderGeometry(0.03, 0.056, 0.24, 10).rotateX(Math.PI / 2 + 0.22).translate(0, -0.02, 0.11));
    parts.push(new THREE.SphereGeometry(0.058, 10, 8).scale(1, 1, 1.1));
    parts.push(new THREE.CylinderGeometry(0.014, 0.014, 0.12, 6).translate(0, -0.08, 0));
  } else {
    parts.push(new THREE.CylinderGeometry(0.017, 0.017, 0.56, 6));
    parts.push(new THREE.BoxGeometry(0.045, 0.15, 0.05).translate(0, 0.12, 0));
    parts.push(new THREE.BoxGeometry(0.045, 0.16, 0.05).translate(0, -0.14, 0));
    parts.push(new THREE.BoxGeometry(0.035, 0.07, 0.06).translate(0, -0.3, 0));
  }
  return mergeGeometries(parts.map((p) => p.toNonIndexed()));
}

// ---------------------------------------------------------------------------
// FX hub
// ---------------------------------------------------------------------------
/** Explosions, sparks, muzzle flashes, thruster flames, debris, decals, dynamic lights and camera shake. */
export class FX {
  constructor(scene) {
    this.scene = scene;
    this.time = 0;
    this.puff = puffTexture();
    this.add = new Particles(scene, 5000, true);
    this.fire = new Particles(scene, 1800, true, this.puff);
    this.smoke = new Particles(scene, 3400, false, this.puff);
    this.bolts = new Bolts(scene);
    this.decals = new Decals(scene, 64);
    this.shake = 0;
    this.kicks = []; // chromatic aberration hits waiting for the camera distance check
    this.post = null;
    this.glowTex = glowTexture();
    this.starTex = starTexture();
    this.high = true;
    this.held = [];

    // dynamic light pool: reassigned every frame to the brightest nearby bolts / flashes / explosions
    this.lights = [];
    for (let i = 0; i < 8; i++) {
      const l = new THREE.PointLight(0xffa860, 0, 10, 2);
      scene.add(l);
      this.lights.push(l);
    }
    this.lightCount = 8;
    this.events = [];
    for (let i = 0; i < 40; i++) this.events.push({ pos: new THREE.Vector3(), color: new THREE.Color(), peak: 0, dur: 1, t: 1, dist: 8, prio: 1 });
    this.cands = [];
    for (let i = 0; i < 64; i++) this.cands.push({ pos: null, color: null, i: 0, dist: 0, score: 0 });

    this.sprites = [];
    for (let i = 0; i < 40; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      s.visible = false;
      s.renderOrder = 13;
      scene.add(s);
      this.sprites.push({ s, t: 0, dur: 0.1, size: 1, alive: false, grow: 0.6 });
    }
    this.stars = [];
    for (let i = 0; i < 40; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.starTex, color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      s.visible = false;
      s.renderOrder = 13;
      scene.add(s);
      this.stars.push({ s, t: 0, dur: 0.05, size: 1, alive: false, grow: 0.3 });
    }

    this.debris = [];
    const dGeo = new THREE.BoxGeometry(0.18, 0.12, 0.22);
    const dMat = new THREE.MeshStandardMaterial({ color: 0x3a3f46, metalness: 0.6, roughness: 0.5 });
    const hotMat = new THREE.MeshStandardMaterial({ color: 0x2a2624, emissive: new THREE.Color(2.2, 0.6, 0.12), metalness: 0.4, roughness: 0.6 });
    for (let i = 0; i < 48; i++) {
      const m = new THREE.Mesh(dGeo, i % 3 === 0 ? hotMat : dMat);
      m.visible = false; m.castShadow = true;
      scene.add(m);
      this.debris.push({ mesh: m, v: new THREE.Vector3(), w: new THREE.Vector3(), life: 0, alive: false, smoke: 0.3, part: false });
    }
    // B1 heads / arms that break off
    const b1Mat = new THREE.MeshStandardMaterial({ color: 0xb59c74, metalness: 0.15, roughness: 0.6 });
    const parts = { head: b1PartGeometry('head'), arm: b1PartGeometry('arm') };
    for (let i = 0; i < 16; i++) {
      const kind = i % 2 ? 'arm' : 'head';
      const m = new THREE.Mesh(parts[kind], b1Mat);
      m.visible = false; m.castShadow = true;
      scene.add(m);
      this.debris.push({ mesh: m, v: new THREE.Vector3(), w: new THREE.Vector3(), life: 0, alive: false, smoke: 0.5, part: kind });
    }

    this.rings = [];
    const rGeo = new THREE.RingGeometry(0.85, 1.0, 48).rotateX(-Math.PI / 2);
    for (let i = 0; i < 8; i++) {
      const m = new THREE.Mesh(rGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 1.6, 0.7), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      m.visible = false;
      scene.add(m);
      this.rings.push({ mesh: m, t: 0, dur: 0.5, size: 5, alive: false });
    }
    this.streaks = [];
  }

  setPixelScale(v) {
    for (const p of [this.add, this.fire, this.smoke]) p.mat.uniforms.pixelScale.value = v;
    this.bolts.mat.uniforms.pixelScale.value = v;
  }

  /** High: 6 dynamic lights and bolt heat trails. Low: 2 lights (explosions and big flashes only). */
  /** `lights` changes the lit shaders (every material recompiles), so Auto graphics keeps it fixed. */
  setQuality(high, lights = high ? 6 : 2) {
    this.high = high;
    this.lightCount = lights;
    this.lights.forEach((l, i) => { l.visible = i < this.lightCount; l.intensity = 0; });
    this.bolts.trail = high ? 1.4 : 0;
  }

  /** Queue a short light burst; the pool picks the most important ones each frame. */
  /** A steady light for this frame (re-call every frame), e.g. cutscene key and rim lights. */
  holdLight(slot, pos, color, intensity, dist = 8, prio = 4) {
    const h = this.held[slot] || (this.held[slot] = { pos: new THREE.Vector3(), color: new THREE.Color(), i: 0, dist: 8, prio: 4, ttl: 0 });
    h.pos.copy(pos); h.color.set(color); h.i = intensity; h.dist = dist; h.prio = prio; h.ttl = 0.12;
  }

  flashLight(pos, color, peak, dur, dist = 12, prio = 1) {
    let best = this.events[0];
    for (const e of this.events) {
      if (e.t >= e.dur) { best = e; break; }
      if (e.t / e.dur > best.t / best.dur) best = e;
    }
    best.pos.copy(pos);
    best.color.set(color);
    best.peak = peak; best.t = 0; best.dur = dur; best.dist = dist; best.prio = prio;
  }

  _sprite(pool, pos, color, size, dur, grow) {
    const sp = pool.find((x) => !x.alive) || pool[0];
    sp.alive = true; sp.t = 0; sp.dur = dur; sp.size = size; sp.grow = grow;
    sp.s.visible = true;
    sp.s.position.copy(pos);
    sp.s.material.color.copy(color instanceof THREE.Color ? color : _c.set(color)).multiplyScalar(3);
    sp.s.material.rotation = rand(0, TAU);
    sp.s.material.opacity = 1;
    sp.s.scale.setScalar(size);
    return sp;
  }

  flash(pos, color, size, dur) { return this._sprite(this.sprites, pos, color, size, dur, 0.6); }
  star(pos, color, size, dur) { return this._sprite(this.stars, pos, color, size, dur, 0.25); }

  sparks(pos, normal, color, n = 10, speed = 6) {
    const c = _c.set(color);
    const cr = c.r, cg = c.g, cb = c.b;
    for (let i = 0; i < n; i++) {
      const vx = normal.x * speed * rand(0.3, 1) + rand(-1, 1) * speed * 0.6;
      const vy = normal.y * speed * rand(0.3, 1) + rand(-0.3, 1) * speed * 0.6;
      const vz = normal.z * speed * rand(0.3, 1) + rand(-1, 1) * speed * 0.6;
      const w = rand(0.5, 1);
      this.add.emit(pos.x, pos.y, pos.z, vx, vy, vz, rand(0.15, 0.5), 0.08, 0.02,
        cr * 4 * w + 2.2, cg * 4 * w + 1.4, cb * 4 * w + 0.5, 1, 11, 1.2, 0, 2.5, 0.6, 0.15);
    }
    this.add.emit(pos.x, pos.y, pos.z, 0, 0, 0, 0.1, 0.5, 0.9, cr * 3 + 1, cg * 3 + 1, cb * 3 + 1, 1);
  }

  /** Bolt hitting the world: hot sparks, a puff of smoke, lingering embers and a scorch mark. */
  impact(pos, normal, color, scorch = true) {
    const c = _c.set(color);
    this.sparks(pos, normal, color, 9, 6);
    for (let i = 0; i < 3; i++) {
      this.add.emit(pos.x, pos.y, pos.z, normal.x * rand(0.5, 1.5) + rand(-0.6, 0.6), normal.y * rand(0.5, 1.5) + rand(0.2, 1.2), normal.z * rand(0.5, 1.5) + rand(-0.6, 0.6),
        rand(0.9, 1.8), 0.05, 0.03, 4, 1.5, 0.35, 1, 1.5, 1.6, 0, 1.5, 0.2, 0.05);
    }
    this.smoke.emit(pos.x + normal.x * 0.1, pos.y + normal.y * 0.1, pos.z + normal.z * 0.1, normal.x * 0.5 + rand(-0.2, 0.2), 0.6 + normal.y * 0.4, normal.z * 0.5 + rand(-0.2, 0.2),
      rand(1.0, 1.6), 0.25, 1.0, 0.32, 0.31, 0.3, 0.38, -0.35, 1.2, 0.08, 0.4, 0.39, 0.38, rand(-0.8, 0.8));
    this.flashLight(pos, c, 3.5, 0.12, 5, 1.1);
    if (scorch) this.decals.add(pos, normal, rand(0.32, 0.55), this.time);
  }

  /** Metal "tink" for droid hits. */
  tink(pos, normal) {
    this.sparks(pos, normal, 0xffc070, 10, 6);
    this.star(pos, 0xfff2d8, rand(0.28, 0.42), 0.05);
  }

  /** Muzzle flash: star burst, glow, light pulse, and a puff of smoke on rifles. */
  muzzle(pos, dir, color, opts = {}) {
    const c = _c.set(color);
    const size = opts.size || 0.55;
    this.star(pos, _c2.setRGB(c.r * 0.5 + 0.6, c.g * 0.5 + 0.6, c.b * 0.5 + 0.6), size * rand(0.9, 1.3), 0.045);
    this.flash(pos, c, size * 1.4, 0.07);
    for (let i = 0; i < 4; i++) {
      const s = rand(2, 7);
      this.add.emit(pos.x, pos.y, pos.z, dir.x * s + rand(-0.5, 0.5), dir.y * s + rand(-0.5, 0.5), dir.z * s + rand(-0.5, 0.5), 0.08, 0.12, 0.04, c.r * 3 + 1, c.g * 3 + 1, c.b * 3 + 1, 1);
    }
    if (opts.smoke) {
      this.smoke.emit(pos.x + dir.x * 0.15, pos.y + dir.y * 0.15, pos.z + dir.z * 0.15, dir.x * 0.8 + rand(-0.1, 0.1), 0.35, dir.z * 0.8 + rand(-0.1, 0.1),
        rand(0.5, 0.8), 0.1, 0.45, 0.55, 0.55, 0.56, 0.22, -0.3, 2.5, 0.05, 0.6, 0.6, 0.6, rand(-1, 1));
    }
    if (opts.light !== false) this.flashLight(pos, c, opts.light || 5, 0.06, 7, opts.prio || 1.3);
  }

  /** Thruster flame particles shooting along `dir` (world). */
  thruster(pos, dir, strength = 1) {
    for (let i = 0; i < 2; i++) {
      const s = rand(5, 9) * strength;
      this.add.emit(pos.x + rand(-0.03, 0.03), pos.y, pos.z + rand(-0.03, 0.03),
        dir.x * s + rand(-0.4, 0.4), dir.y * s, dir.z * s + rand(-0.4, 0.4),
        rand(0.1, 0.2), 0.32 * strength, 0.08, 4.0, 1.6, 0.45, 1, 0, 0, 0, 2.4, 0.4, 0.1);
    }
    this.add.emit(pos.x, pos.y, pos.z, dir.x * 2, dir.y * 2, dir.z * 2, 0.05, 0.42 * strength, 0.3, 3.5, 2.6, 1.6, 1);
    if (Math.random() < 0.25 * strength) {
      this.smoke.emit(pos.x, pos.y - 0.3, pos.z, rand(-0.5, 0.5), -1.5, rand(-0.5, 0.5), rand(0.8, 1.4), 0.3, 1.4, 0.4, 0.38, 0.38, 0.25, -0.5, 0.8, 0.1);
    }
  }

  /** Burning trail (falling rocket droids, crashing ships). */
  fireTrail(pos, k = 1) {
    this.fire.emit(pos.x + rand(-0.15, 0.15), pos.y + rand(-0.15, 0.15), pos.z + rand(-0.15, 0.15), rand(-0.4, 0.4), rand(0.2, 1), rand(-0.4, 0.4),
      rand(0.25, 0.45), 0.5 * k, 1.1 * k, 4.5, 2.2, 0.7, 1, -1, 1, 0, 1.2, 0.2, 0.04, rand(-2, 2));
    this.smoke.emit(pos.x, pos.y, pos.z, rand(-0.3, 0.3), rand(0.3, 1), rand(-0.3, 0.3), rand(1.6, 2.6), 0.5 * k, 2.2 * k,
      0.08, 0.075, 0.07, 0.7, -0.4, 0.6, 0.1, 0.16, 0.15, 0.15, rand(-0.8, 0.8));
  }

  smokePuff(pos, size = 1, dark = 0.2) {
    this.smoke.emit(pos.x, pos.y, pos.z, rand(-0.4, 0.4), rand(0.6, 1.4), rand(-0.4, 0.4), rand(1.2, 2.0), 0.4 * size, 1.8 * size,
      dark, dark, dark * 1.05, 0.55, -0.4, 0.6, 0.15, dark * 1.6, dark * 1.6, dark * 1.6, rand(-0.8, 0.8));
  }

  dust(pos, n = 14, s = 1) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU), sp = rand(1.5, 4) * s;
      this.smoke.emit(pos.x, pos.y + 0.1, pos.z, Math.cos(a) * sp, rand(0.2, 0.8), Math.sin(a) * sp, rand(0.6, 1.2), 0.4 * s, 1.4 * s,
        0.45, 0.42, 0.4, 0.4, 0, 2.5, 0.1, 0.5, 0.48, 0.45, rand(-1, 1));
    }
  }

  ring(pos, size, dur, color) {
    const r = this.rings.find((x) => !x.alive) || this.rings[0];
    r.alive = true; r.t = 0; r.dur = dur; r.size = size;
    r.mesh.visible = true;
    r.mesh.position.copy(pos);
    if (color) r.mesh.material.color.set(color).multiplyScalar(3);
  }

  _debris(pos, k, scale, part = false) {
    let last = null;
    for (const d of this.debris) {
      if (k <= 0) break;
      if (d.alive || d.part !== part) continue;
      d.alive = true; d.life = rand(1.8, 3);
      d.mesh.visible = true;
      d.mesh.position.copy(pos);
      if (!part) d.mesh.scale.setScalar(rand(0.6, 1.8) * Math.min(scale, 1.6));
      d.v.set(rand(-1, 1), rand(0.6, 1.5), rand(-1, 1)).multiplyScalar(rand(5, 11) * Math.min(scale, 1.4));
      d.w.set(rand(-10, 10), rand(-10, 10), rand(-10, 10));
      k--;
      last = d;
    }
    return last;
  }

  /** A broken-off droid part ('head' | 'arm') flying away from `pos`. */
  part(kind, pos, vel) {
    const d = this._debris(pos, 1, 1, kind);
    if (d) { d.v.copy(vel); d.life = rand(3.5, 5); d.mesh.rotation.set(rand(0, TAU), rand(0, TAU), 0); }
  }

  /** Fireball that rolls into thick dark smoke, debris, shockwave ring, dust and a shake. */
  explosion(pos, scale = 1, groundY = -Infinity) {
    this.flashLight(pos, 0xff8a3a, 22 * scale, 0.8, 16 * scale + 8, 4);
    this.star(pos, _c2.setRGB(0.9, 0.7, 0.45), 3.4 * scale, 0.1);
    this.flash(pos, _c2.setRGB(0.55, 0.26, 0.08), 6.5 * scale, 0.3);
    const near = pos.y - groundY < 2.5;
    // fireball
    for (let i = 0; i < Math.round(26 * scale); i++) {
      const a = rand(0, TAU), e = rand(-0.2, 1), s = rand(1.5, 6) * scale;
      const ce = Math.sqrt(1 - e * e);
      this.fire.emit(pos.x + rand(-0.4, 0.4) * scale, pos.y + rand(0, 0.5) * scale, pos.z + rand(-0.4, 0.4) * scale,
        Math.cos(a) * ce * s, e * s + 1.5, Math.sin(a) * ce * s, rand(0.45, 0.95), rand(1.0, 1.6) * scale, rand(2.6, 4.2) * scale,
        3.0, 1.65, 0.55, 0.9, -2.5, 3, 0, 0.7, 0.12, 0.02, rand(-2, 2));
    }
    // white-hot core
    for (let i = 0; i < 3; i++) {
      this.add.emit(pos.x, pos.y + 0.3 * scale, pos.z, rand(-1, 1), rand(0, 2), rand(-1, 1), rand(0.1, 0.16), 2 * scale, 3 * scale, 2.6, 2.0, 1.2, 1);
    }
    // sparks and floating embers
    for (let i = 0; i < Math.round(40 * scale); i++) {
      const a = rand(0, TAU), e = rand(0, 1), s = rand(8, 22) * scale;
      this.add.emit(pos.x, pos.y, pos.z, Math.cos(a) * s * (1 - e * 0.5), e * s, Math.sin(a) * s * (1 - e * 0.5), rand(0.3, 1.0), 0.1, 0.03, 5, 3, 1.2, 1, 14, 0.8, 0, 3, 0.6, 0.1);
    }
    for (let i = 0; i < Math.round(14 * scale); i++) {
      this.add.emit(pos.x + rand(-1, 1) * scale, pos.y + rand(0, 1.5) * scale, pos.z + rand(-1, 1) * scale, rand(-1.5, 1.5), rand(1, 4), rand(-1.5, 1.5),
        rand(1.5, 3.2), 0.07, 0.04, 4.5, 1.6, 0.3, 1, -0.6, 0.9, 0, 1.4, 0.2, 0.03);
    }
    // thick dark smoke that takes over as the fire dies
    for (let i = 0; i < Math.round(20 * scale); i++) {
      const a = rand(0, TAU), s = rand(0.6, 2.6) * scale;
      const d = rand(0.016, 0.034);
      this.smoke.emit(pos.x + rand(-0.6, 0.6) * scale, pos.y + rand(0, 1.2) * scale, pos.z + rand(-0.6, 0.6) * scale,
        Math.cos(a) * s, rand(1.2, 3.4) * scale, Math.sin(a) * s, rand(3.6, 6.5), rand(1.5, 2.4) * scale, rand(5.5, 8.5) * scale,
        d, d * 0.95, d * 0.9, 0.95, -0.55, 0.85, 0.1, d * 2.4, d * 2.3, d * 2.2, rand(-0.6, 0.6));
    }
    // dust kicked up along the ground
    if (near) {
      this.ring(new THREE.Vector3(pos.x, groundY + 0.15, pos.z), 9 * scale, 0.42, new THREE.Color(1, 0.55, 0.25));
      for (let i = 0; i < Math.round(16 * scale); i++) {
        const a = rand(0, TAU), s = rand(6, 11) * scale;
        this.smoke.emit(pos.x + Math.cos(a) * scale, groundY + 0.2, pos.z + Math.sin(a) * scale, Math.cos(a) * s, rand(0.3, 1.2), Math.sin(a) * s,
          rand(1.2, 2.2), 0.8 * scale, 4 * scale, 0.16, 0.14, 0.12, 0.55, 0.2, 2.6, 0.05, 0.2, 0.18, 0.16, rand(-1, 1));
      }
    }
    this._debris(pos, Math.round(7 * scale), scale);
    this.kicks.push({ pos: pos.clone(), amount: 0.9 * scale });
  }

  /** Tracer from the sky (kept for scripted shots). */
  streak(from, to, color = 0x7fd0ff) {
    const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
    const mat = new THREE.LineBasicMaterial({ color: new THREE.Color(color).multiplyScalar(6), transparent: true, blending: THREE.AdditiveBlending });
    const line = new THREE.Line(geo, mat);
    this.scene.add(line);
    this.streaks.push({ line, t: 0, dur: 0.25 });
  }

  _updateSprites(pool, dt) {
    for (const sp of pool) {
      if (!sp.alive) continue;
      sp.t += dt;
      const k = sp.t / sp.dur;
      if (k >= 1) { sp.alive = false; sp.s.visible = false; continue; }
      sp.s.material.opacity = 1 - k;
      sp.s.scale.setScalar(sp.size * (1 + k * sp.grow));
    }
  }

  _updateLights(dt, camPos) {
    let n = 0;
    const cands = this.cands;
    const push = (pos, color, intensity, dist, prio) => {
      if (intensity <= 0.01) return;
      const d2 = camPos.distanceToSquared(pos);
      const score = intensity * prio / (1 + d2 / 300);
      if (n < cands.length) {
        const c = cands[n++];
        c.pos = pos; c.color = color; c.i = intensity; c.dist = dist; c.score = score;
      } else {
        let wi = 0;
        for (let i = 1; i < n; i++) if (cands[i].score < cands[wi].score) wi = i;
        if (cands[wi].score < score) { const c = cands[wi]; c.pos = pos; c.color = color; c.i = intensity; c.dist = dist; c.score = score; }
      }
    };
    for (const h of this.held) {
      if (!h || h.ttl <= 0) continue;
      h.ttl -= dt;
      push(h.pos, h.color, h.i, h.dist, h.prio * 50);
    }
    for (const e of this.events) {
      if (e.t >= e.dur) continue;
      e.t += dt;
      const k = Math.max(0, 1 - e.t / e.dur);
      push(e.pos, e.color, e.peak * k * k, e.dist, e.prio);
    }
    if (this.high) {
      for (const b of this.bolts.list) {
        if (b.noHit || b.travelled < 0.8) continue;
        if (camPos.distanceToSquared(b.pos) > 1600) continue;
        push(b.pos, b.glow, 2.4, 6.5, 0.7);
      }
    }
    // keep the top `lightCount` candidates
    if (n > 1) this._sortCands(n);
    for (let i = 0; i < this.lights.length; i++) {
      const l = this.lights[i];
      if (i < this.lightCount && i < n) {
        const c = cands[i];
        l.position.copy(c.pos);
        l.color.copy(c.color);
        if (c.color.r > 1 || c.color.g > 1 || c.color.b > 1) { const m = Math.max(c.color.r, c.color.g, c.color.b); l.color.multiplyScalar(1 / m); }
        l.intensity = c.i;
        l.distance = c.dist;
      } else l.intensity = 0;
    }
  }

  _sortCands(n) {
    // insertion sort of the first n candidates by score (n is small)
    const a = this.cands;
    for (let i = 1; i < n; i++) {
      const x = a[i];
      let j = i - 1;
      while (j >= 0 && a[j].score < x.score) { a[j + 1] = a[j]; j--; }
      a[j + 1] = x;
    }
  }

  update(dt, camPos, groundAt) {
    this.time += dt;
    this.decals.mat.uniforms.time.value = this.time;
    this.add.update(dt);
    this.fire.update(dt);
    this.smoke.update(dt);
    this._updateLights(dt, camPos);
    this._updateSprites(this.sprites, dt);
    this._updateSprites(this.stars, dt);
    for (const r of this.rings) {
      if (!r.alive) continue;
      r.t += dt;
      const k = r.t / r.dur;
      if (k >= 1) { r.alive = false; r.mesh.visible = false; continue; }
      r.mesh.scale.setScalar(0.5 + r.size * Math.sqrt(k));
      r.mesh.material.opacity = (1 - k) * 0.8;
    }
    for (const d of this.debris) {
      if (!d.alive) continue;
      d.life -= dt;
      d.v.y -= 18 * dt;
      d.mesh.position.addScaledVector(d.v, dt);
      d.mesh.rotation.x += d.w.x * dt; d.mesh.rotation.y += d.w.y * dt; d.mesh.rotation.z += d.w.z * dt;
      const g = groundAt ? groundAt(d.mesh.position) : -Infinity;
      if (d.mesh.position.y < g + 0.06) {
        d.mesh.position.y = g + 0.06;
        d.v.y = Math.abs(d.v.y) * 0.3; d.v.x *= 0.6; d.v.z *= 0.6; d.w.multiplyScalar(0.6);
      }
      if (Math.random() < d.smoke) {
        const p = d.mesh.position;
        this.smoke.emit(p.x, p.y, p.z, 0, 0.5, 0, 0.7, 0.12, 0.5, 0.15, 0.15, 0.15, 0.35, 0, 0, 0.1);
        if (d.part && Math.random() < 0.15) this.add.emit(p.x, p.y, p.z, rand(-1, 1), rand(1, 2.5), rand(-1, 1), 0.3, 0.06, 0.02, 4, 2.6, 1, 1, 9);
      }
      if (d.life <= 0) { d.alive = false; d.mesh.visible = false; }
    }
    for (let i = this.streaks.length - 1; i >= 0; i--) {
      const s = this.streaks[i];
      s.t += dt;
      s.line.material.opacity = Math.max(0, 1 - s.t / s.dur);
      if (s.t >= s.dur) {
        this.scene.remove(s.line); s.line.geometry.dispose(); s.line.material.dispose();
        this.streaks.splice(i, 1);
      }
    }
    // camera shake + lens hit from explosions, scaled by distance
    if (camPos) {
      for (const k of this.kicks) {
        const f = Math.max(0, 1 - camPos.distanceTo(k.pos) / 50);
        this.shake = Math.min(1.3, this.shake + k.amount * f);
        if (this.post && f > 0) {
          this.post.kick(k.amount * f * f * 0.8);
          if (f > 0.75) this.post.whiteFlash(0.15 * k.amount * (f - 0.75) * 4);
        }
        if (this.onBlast && f > 0) this.onBlast(f, k.amount);
      }
    }
    this.kicks.length = 0;
    this.shake = Math.max(0, this.shake - dt * 2.2);
  }

  clear() {
    this.bolts.clear();
    this.decals.clear();
    this.add.clear(); this.fire.clear(); this.smoke.clear();
    for (const d of this.debris) { d.alive = false; d.mesh.visible = false; }
    for (const e of this.events) e.t = e.dur;
  }
}

