import * as THREE from 'three';
import { World } from './collision.js';
import { mulberry32, canvasTexture, TAU } from './util.js';
import { Atmosphere, ArenaFX } from './atmosphere.js';
import { buildLAAT } from './ships.js';
import { buildTemple, TX as TEMPLE_X, TZ as TEMPLE_Z, COUNCIL } from './temple.js';
import { buildStreet, STREET_Y } from './street.js';
import { placeProp } from './assets.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const SUN_DIR = new THREE.Vector3(-0.45, 0.36, -0.85).normalize();

const C = (hex) => new THREE.Color(hex);
export const PALETTE = {
  zenith: C('#0b1430'),
  horizon: C('#f2864e'),
  low: C('#4e2a30'),
  sun: C('#ffd2a0'),
  fog: C('#b07a6c'),
  haze: C('#3a2630'),
  ambTop: C('#4e5c82'),
  ambBottom: C('#5a3b36'),
};

// Layered depth fog: near towers crisp, mid-distance cool haze, the far skyline melting into warm
// smog, brighter toward the low sun, and dark haze in the canyons below.
const FOG_GLSL = /* glsl */`
uniform vec3 fogColor;
uniform vec3 hazeColor;
uniform float fogDensity;
uniform vec3 fogSun;
uniform vec3 fogSunDir;
float fogAmount(vec3 wp) {
  float dist = length(wp - cameraPosition);
  float f = 1.0 - exp(-pow(dist * fogDensity, 1.6));
  float low = smoothstep(-40.0, -750.0, wp.y);
  return clamp(max(f, low * 0.92), 0.0, 1.0);
}
vec3 applyFog(vec3 col, vec3 wp) {
  vec3 v = wp - cameraPosition;
  float dist = length(v);
  float low = smoothstep(-40.0, -750.0, wp.y);
  vec3 fc = mix(fogColor * vec3(0.7, 0.77, 0.95), fogColor * vec3(1.1, 0.98, 0.84), smoothstep(250.0, 2200.0, dist));
  fc += fogSun * pow(max(dot(v / max(dist, 1e-3), fogSunDir), 0.0), 5.0) * 0.55;
  fc = mix(fc, hazeColor, low);
  return mix(col, fc, fogAmount(wp));
}`;

function fogUniforms() {
  return {
    fogColor: { value: PALETTE.fog },
    hazeColor: { value: PALETTE.haze },
    fogDensity: { value: 0.00055 },
    fogSun: { value: PALETTE.sun },
    fogSunDir: { value: SUN_DIR },
  };
}

// ---------------------------------------------------------------------------
// Sky
// ---------------------------------------------------------------------------
function makeSky() {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, depthTest: false,
    uniforms: {
      sunDir: { value: SUN_DIR }, zenith: { value: PALETTE.zenith }, horizon: { value: PALETTE.horizon },
      low: { value: PALETTE.low }, sunCol: { value: PALETTE.sun }, time: { value: 0 },
    },
    vertexShader: /* glsl */`
      varying vec3 vDir;
      void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`
      uniform vec3 sunDir, zenith, horizon, low, sunCol; uniform float time;
      varying vec3 vDir;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
        return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y); }
      float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; } return v; }
      void main() {
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 col = mix(horizon, zenith, pow(smoothstep(-0.02, 0.62, h), 0.5));
        col = mix(col, low, smoothstep(0.0, -0.3, h));
        float sd = max(dot(d, sunDir), 0.0);
        col += sunCol * (pow(sd, 1400.0) * 18.0 + pow(sd, 40.0) * 0.8 + pow(sd, 6.0) * 0.22);
        float az = atan(d.x, d.z);
        float n = fbm(vec2(az * 4.0, h * 22.0) + vec2(time * 0.004, 0.0));
        float band = smoothstep(0.02, 0.12, h) * (1.0 - smoothstep(0.22, 0.5, h));
        vec3 cloudCol = mix(horizon * 1.15, sunCol * 1.3, pow(sd, 4.0));
        col = mix(col, cloudCol, smoothstep(0.5, 0.78, n) * band * 0.55);
        float hi = smoothstep(0.35, 0.8, fbm(vec2(az * 2.0, h * 6.0) + 11.0)) * smoothstep(0.2, 0.5, h) * 0.25;
        col = mix(col, zenith * 2.2 + sunCol * 0.08, hi);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(5000, 48, 24), mat);
  sky.renderOrder = -10;
  sky.frustumCulled = false;
  return sky;
}

// ---------------------------------------------------------------------------
// Buildings (instanced, procedural windows)
// ---------------------------------------------------------------------------
function buildingMaterial(cylinder = false) {
  return new THREE.ShaderMaterial({
    uniforms: {
      sunDir: { value: SUN_DIR }, sunColor: { value: PALETTE.sun.clone().multiplyScalar(0.9) },
      ambTop: { value: PALETTE.ambTop }, ambBottom: { value: PALETTE.ambBottom }, time: { value: 0 },
      horizonCol: { value: PALETTE.horizon }, zenithCol: { value: PALETTE.zenith },
      ...fogUniforms(),
    },
    defines: cylinder ? { CYLINDER: 1 } : {},
    vertexShader: /* glsl */`
      varying vec3 vWorld; varying vec3 vN; varying vec3 vCol; flat varying float vSeed; varying vec3 vLocal; flat varying float vTop;
      void main() {
        #ifdef USE_INSTANCING
          mat4 im = instanceMatrix;
        #else
          mat4 im = mat4(1.0);
        #endif
        vec4 wp = modelMatrix * im * vec4(position, 1.0);
        vWorld = wp.xyz;
        vLocal = position;
        vN = normalize(mat3(modelMatrix) * mat3(im) * normal);
        #ifdef USE_INSTANCING_COLOR
          vCol = instanceColor;
        #else
          vCol = vec3(0.35);
        #endif
        vSeed = fract(abs(im[3].x) * 0.0137 + abs(im[3].z) * 0.0291);
        vTop = im[3].y + length(im[1].xyz);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 sunDir, sunColor, ambTop, ambBottom, horizonCol, zenithCol; uniform float time;
      varying vec3 vWorld; varying vec3 vN; varying vec3 vCol; flat varying float vSeed; varying vec3 vLocal; flat varying float vTop;
      ${FOG_GLSL}
      float hash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
      void main() {
        vec3 n = normalize(vN);
        float roof = step(0.6, abs(n.y));
        #ifdef CYLINDER
          float u = atan(vLocal.x, vLocal.z) * 13.0;
        #else
          float u = abs(n.x) > abs(n.z) ? vWorld.z : vWorld.x;
        #endif
        float sd = vSeed * 517.0;
        // each tower gets its own facade rhythm
        float style = hash(vec2(sd, 3.7));
        float colEvery = style < 0.5 ? 5.0 : 4.0;
        float slabEvery = style > 0.7 ? 3.0 : 4.0;
        vec2 cell = vec2(u / 2.2, vWorld.y / 3.5);
        vec2 id = floor(cell), f = fract(cell);
        vec2 fw = fwidth(cell);
        float aa = clamp(1.0 - max(fw.x, fw.y) * 2.0, 0.0, 1.0);
        // window with a dark frame
        float win = smoothstep(0.12, 0.18, f.x) * smoothstep(0.88, 0.82, f.x) * smoothstep(0.22, 0.3, f.y) * smoothstep(0.92, 0.84, f.y);
        float frame = smoothstep(0.06, 0.12, f.x) * smoothstep(0.94, 0.88, f.x) * smoothstep(0.14, 0.22, f.y) * smoothstep(0.98, 0.92, f.y) - win;
        float slab = step(fract(id.y / slabEvery), 0.2 * 4.0 / slabEvery);
        float mull = step(fract(id.x / colEvery), 0.15 * 5.0 / colEvery);
        win *= (1.0 - slab) * (1.0 - mull);
        frame *= (1.0 - slab) * (1.0 - mull);
        float r = hash(id + sd);
        float band = hash(vec2(floor(id.y / 4.0), sd));
        float litP = mix(0.14, 0.42, band) * mix(0.6, 1.0, vSeed);
        float lit = step(1.0 - litP, r);
        vec3 wc = mix(vec3(1.0, 0.72, 0.45), vec3(0.65, 0.82, 1.0), step(0.85, hash(id.yx + sd + 7.3)));
        wc *= (0.55 + 0.6 * hash(id + sd + 3.1)) * mix(1.0, 0.45, step(0.7, hash(id + sd + 5.9))); // some blinds half down
        float winM = mix(0.38, win, aa);
        float litM = mix(litP * 0.38, win * lit, aa);
        float diff = max(dot(n, sunDir), 0.0);
        vec3 amb = mix(ambBottom, ambTop, n.y * 0.5 + 0.5) * 0.6;
        vec3 lightC = amb + sunColor * diff;
        // concrete: pilasters a touch lighter, floor slabs with a sunlit ledge, darker window frames
        vec3 base = vCol * (1.0 + mull * 0.12 * aa + slab * 0.15 * aa) * (1.0 - frame * 0.45 * aa);
        vec3 col = base * lightC;
        // glass reflects the dusk sky and catches the low sun
        vec3 V = normalize(vWorld - cameraPosition);
        vec3 R = reflect(V, n);
        vec3 sky = mix(horizonCol, zenithCol, smoothstep(-0.05, 0.55, R.y));
        float fres = pow(1.0 - max(dot(-V, n), 0.0), 3.0);
        float glint = pow(max(dot(R, sunDir), 0.0), 80.0);
        vec3 glass = (vCol * 0.22 + vec3(0.02, 0.025, 0.035)) * (amb + sunColor * diff * 0.6) + sky * (0.06 + 0.3 * fres) + sunColor * glint * 2.0;
        col = mix(col, glass, winM * (1.0 - roof) * 0.8);
        col += wc * litM * (1.0 - roof) * 0.95;
        float ledge = (1.0 - smoothstep(0.0, 0.06, f.y)) * aa * (1.0 - roof);
        col *= 1.0 - ledge * 0.35;
        col += slab * smoothstep(0.75, 1.0, f.y) * aa * (1.0 - roof) * sunColor * diff * 0.18;
        // neon accent strips running up some towers
        float accent = step(0.8, hash(vec2(sd, 9.1)));
        vec3 accentCol = mix(vec3(0.25, 0.75, 2.4), vec3(2.4, 0.8, 0.25), step(0.55, hash(vec2(sd, 4.4))));
        float stripe = mull * (1.0 - smoothstep(0.03, 0.09, abs(f.x - 0.5))) * step(fract(id.x / (colEvery * 3.0)), 0.5 / colEvery);
        col += accentCol * stripe * accent * (1.0 - roof) * aa * (0.75 + 0.25 * sin(time * 2.0 + sd));
        // blinking aircraft-warning lights along the roofline
        float edge = (1.0 - smoothstep(0.0, 0.7, vTop - vWorld.y)) * (1.0 - roof);
        float dots = step(0.82, fract(u * 0.08 + sd)) * step(0.0, sin(time * 2.4 + sd * 3.0));
        col += vec3(3.5, 0.35, 0.2) * edge * dots * step(10.0, vTop);
        col *= mix(0.3, 1.0, smoothstep(-650.0, 60.0, vWorld.y));
        gl_FragColor = vec4(applyFog(col, vWorld), 1.0);
      }`,
  });
}

function trafficMaterial(lights) {
  return new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 }, sunDir: { value: SUN_DIR }, sunColor: { value: PALETTE.sun }, ...fogUniforms() },
    vertexShader: /* glsl */`
      attribute vec3 laneOrigin; attribute vec3 laneDir; attribute vec4 laneParams; attribute vec3 tint; attribute vec2 aDead;
      uniform float time;
      varying vec3 vN; varying vec3 vWorld; varying vec3 vTint;
      void main() {
        // destroyed (rammed by a rocket droid): clip it away until it has looped back round, far off in the haze
        if (time > aDead.x && time < aDead.y) { vN = vec3(0.0); vWorld = vec3(0.0); vTint = vec3(0.0); gl_Position = vec4(0.0, 0.0, 2.0, 1.0); return; }
        float L = laneParams.z;
        float s = mod(laneParams.x + laneParams.y * time, L) - L * 0.5;
        vec3 d = laneDir * sign(laneParams.y);
        vec3 side = normalize(cross(vec3(0.0, 1.0, 0.0), d));
        vec3 center = laneOrigin + laneDir * s + side * laneParams.w;
        center.y += sin(time * 0.7 + laneParams.x) * 0.6;
        vec3 wp = center + side * position.x + vec3(0.0, 1.0, 0.0) * position.y + d * position.z;
        vN = side * normal.x + vec3(0.0, 1.0, 0.0) * normal.y + d * normal.z;
        vWorld = wp; vTint = tint;
        gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 sunDir, sunColor;
      varying vec3 vN; varying vec3 vWorld; varying vec3 vTint;
      ${FOG_GLSL}
      void main() {
        ${lights
          ? 'vec3 col = vTint;'
          : 'float diff = max(dot(normalize(vN), sunDir), 0.0); vec3 col = vTint * (0.25 + sunColor * diff * 0.8) + vec3(0.02);'}
        gl_FragColor = vec4(applyFog(col, vWorld), 1.0);
      }`,
  });
}

function glyphTexture(rng, hue) {
  return canvasTexture(128, 512, (g, w, h) => {
    g.fillStyle = 'rgba(0,0,0,0.0)'; g.clearRect(0, 0, w, h);
    g.fillStyle = `hsla(${hue},90%,55%,0.18)`; g.fillRect(0, 0, w, h);
    g.strokeStyle = `hsla(${hue},100%,70%,0.9)`; g.lineWidth = 6; g.strokeRect(6, 6, w - 12, h - 12);
    g.fillStyle = `hsla(${hue},100%,72%,1)`;
    for (let y = 30; y < h - 40; y += 46) {
      const k = Math.floor(rng() * 4);
      if (k === 0) g.fillRect(30, y, 68, 30);
      else if (k === 1) { g.fillRect(30, y, 16, 30); g.fillRect(56, y, 42, 12); g.fillRect(56, y + 18, 42, 12); }
      else if (k === 2) { g.beginPath(); g.moveTo(64, y); g.lineTo(98, y + 30); g.lineTo(30, y + 30); g.fill(); }
      else { g.fillRect(30, y + 9, 68, 12); g.fillRect(58, y, 12, 30); }
    }
  });
}

// ---------------------------------------------------------------------------
// Rooftop textures
// ---------------------------------------------------------------------------
function roofTexture() {
  return canvasTexture(1024, 1024, (g, w, h) => {
    const rng = mulberry32(7);
    g.fillStyle = '#6b7079'; g.fillRect(0, 0, w, h);
    const P = 4, s = w / P;
    for (let i = 0; i < P; i++) for (let j = 0; j < P; j++) {
      const v = Math.floor(rng() * 18) - 9;
      g.fillStyle = `rgb(${104 + v},${109 + v},${117 + v})`;
      g.fillRect(i * s, j * s, s, s);
    }
    for (let k = 0; k < 9000; k++) {
      const a = rng() * 0.12;
      g.fillStyle = rng() < 0.5 ? `rgba(0,0,0,${a})` : `rgba(255,255,255,${a * 0.5})`;
      g.fillRect(rng() * w, rng() * h, 2 + rng() * 3, 2 + rng() * 3);
    }
    for (let k = 0; k < 14; k++) {
      const x = rng() * w, y = rng() * h, r = 40 + rng() * 120;
      const grd = g.createRadialGradient(x, y, 0, x, y, r);
      grd.addColorStop(0, 'rgba(20,18,16,0.22)'); grd.addColorStop(1, 'rgba(20,18,16,0)');
      g.fillStyle = grd; g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    // battle damage: blast scorches with radiating streaks
    for (let k = 0; k < 10; k++) {
      const x = rng() * w, y = rng() * h, r = 28 + rng() * 64;
      const grd = g.createRadialGradient(x, y, 0, x, y, r);
      grd.addColorStop(0, 'rgba(8,7,6,0.85)'); grd.addColorStop(0.45, 'rgba(14,12,10,0.5)'); grd.addColorStop(1, 'rgba(14,12,10,0)');
      g.fillStyle = grd; g.fillRect(x - r, y - r, r * 2, r * 2);
      g.strokeStyle = 'rgba(10,9,8,0.3)'; g.lineWidth = 2;
      for (let s = 0; s < 14; s++) {
        const a = rng() * TAU, l = r * (1 + rng() * 0.9);
        g.beginPath(); g.moveTo(x + Math.cos(a) * r * 0.3, y + Math.sin(a) * r * 0.3); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
      }
    }
    g.strokeStyle = '#2a2d32'; g.lineWidth = 6;
    for (let i = 0; i <= P; i++) {
      g.beginPath(); g.moveTo(i * s, 0); g.lineTo(i * s, h); g.stroke();
      g.beginPath(); g.moveTo(0, i * s); g.lineTo(w, i * s); g.stroke();
    }
    g.fillStyle = '#34373c';
    for (let i = 0; i <= P; i++) for (let j = 0; j <= P; j++) {
      for (const [dx, dy] of [[12, 12], [-12, 12], [12, -12], [-12, -12]]) {
        g.beginPath(); g.arc(i * s + dx, j * s + dy, 3.5, 0, TAU); g.fill();
      }
    }
  }, { repeat: [100 / 16, 100 / 16] });
}

function panelTexture(base, seam, cols = 4, rows = 4, rep = [1, 1]) {
  return canvasTexture(512, 512, (g, w, h) => {
    const rng = mulberry32(base.length * 31 + cols);
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    for (let k = 0; k < 3000; k++) {
      g.fillStyle = `rgba(0,0,0,${rng() * 0.08})`;
      g.fillRect(rng() * w, rng() * h, 2, 2);
    }
    g.strokeStyle = seam; g.lineWidth = 4;
    for (let i = 0; i <= cols; i++) { g.beginPath(); g.moveTo((i * w) / cols, 0); g.lineTo((i * w) / cols, h); g.stroke(); }
    for (let j = 0; j <= rows; j++) { g.beginPath(); g.moveTo(0, (j * h) / rows); g.lineTo(w, (j * h) / rows); g.stroke(); }
    const grd = g.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, 'rgba(255,255,255,0.05)'); grd.addColorStop(1, 'rgba(0,0,0,0.12)');
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
  }, { repeat: rep });
}

function padTexture() {
  return canvasTexture(1024, 1024, (g, w, h) => {
    const cx = w / 2, cy = h / 2;
    g.clearRect(0, 0, w, h);
    g.fillStyle = '#2b2e34';
    g.beginPath(); g.arc(cx, cy, 510, 0, TAU); g.fill();
    g.strokeStyle = '#e07a1f'; g.lineWidth = 34;
    g.beginPath(); g.arc(cx, cy, 470, 0, TAU); g.stroke();
    g.strokeStyle = '#d9dde2'; g.lineWidth = 10; g.setLineDash([46, 30]);
    g.beginPath(); g.arc(cx, cy, 400, 0, TAU); g.stroke();
    g.setLineDash([]);
    g.lineWidth = 8;
    g.beginPath(); g.arc(cx, cy, 150, 0, TAU); g.stroke();
    g.fillStyle = '#d9dde2';
    for (let i = 0; i < 4; i++) {
      g.save(); g.translate(cx, cy); g.rotate((i * TAU) / 4);
      g.beginPath(); g.moveTo(0, -360); g.lineTo(46, -290); g.lineTo(18, -290); g.lineTo(0, -320); g.lineTo(-18, -290); g.lineTo(-46, -290); g.fill();
      g.fillRect(-6, -250, 12, 80);
      g.restore();
    }
    g.fillStyle = '#e07a1f';
    g.beginPath(); g.arc(cx, cy, 34, 0, TAU); g.fill();
  });
}

function crateTexture() {
  return canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = '#5c6571'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#3e454e'; g.fillRect(0, 0, w, 22); g.fillRect(0, h - 22, w, 22); g.fillRect(0, 0, 22, h); g.fillRect(w - 22, 0, 22, h);
    g.strokeStyle = '#3e454e'; g.lineWidth = 16;
    g.beginPath(); g.moveTo(22, 22); g.lineTo(w - 22, h - 22); g.stroke();
    g.fillStyle = '#d9a21e'; g.fillRect(40, h - 64, 70, 22);
    g.fillStyle = '#e8e8e8'; g.fillRect(150, 44, 64, 10); g.fillRect(150, 62, 40, 10);
  });
}

function hazardTexture() {
  return canvasTexture(256, 64, (g, w, h) => {
    g.fillStyle = '#1d1e20'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#e1a51f';
    for (let x = -64; x < w + 64; x += 48) { g.beginPath(); g.moveTo(x, h); g.lineTo(x + 24, h); g.lineTo(x + 24 + h, 0); g.lineTo(x + h, 0); g.fill(); }
  });
}

// ---------------------------------------------------------------------------
// City
// ---------------------------------------------------------------------------
export function buildCity(scene, renderer) {
  const world = new World();
  const rng = mulberry32(1337);
  const updaters = [];
  const timeUniforms = [];

  // --- sky + environment lighting
  const sky = makeSky();
  scene.add(sky);
  timeUniforms.push(sky.material.uniforms.time);
  {
    const envScene = new THREE.Scene();
    const s2 = makeSky();
    s2.scale.setScalar(0.01);
    envScene.add(s2);
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(envScene, 0.03).texture;
    scene.environmentIntensity = 1.0;
    pmrem.dispose();
  }
  scene.fog = new THREE.FogExp2(PALETTE.fog, 0.0006);

  const hemi = new THREE.HemisphereLight(0x9aa8d4, 0x7a5448, 2.0);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffd2a6, 4.2);
  sun.position.copy(SUN_DIR).multiplyScalar(160);
  sun.target.position.set(0, 0, 0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -78; sc.right = 78; sc.top = 78; sc.bottom = -78; sc.near = 10; sc.far = 360;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.05;
  scene.add(sun, sun.target);

  // --- skyline
  const bMat = buildingMaterial(false);
  const cMat = buildingMaterial(true);
  timeUniforms.push(bMat.uniforms.time, cMat.uniforms.time);
  const boxList = [];
  const cylList = [];
  const tints = ['#4a5361', '#5b616b', '#8a7e70', '#a3a9b2', '#3a3f48', '#7b6a58', '#66717e', '#b4b9be', '#6c625a', '#8c96a3'].map((h) => new THREE.Color(h));
  const tint = (k = 1) => tints[Math.floor(rng() * tints.length)].clone().multiplyScalar(k * (0.75 + rng() * 0.4));
  const BOTTOM = -1500;
  const addBox = (x, z, w, d, top, col, bottom = BOTTOM, rotY = 0) => boxList.push({ x, z, w, d, top, bottom, col, rotY });
  const addCyl = (x, z, r, top, col, bottom = BOTTOM) => cylList.push({ x, z, r, top, bottom, col });
  const beacons = [];

  // hand-placed neighbours (bridge towers + canyon walls)
  const NEAR = [
    [0, -100, 44, 44, 95], [100, 0, 44, 44, 72], [-95, 85, 36, 36, 140], [95, 95, 30, 30, 38],
    [-100, -20, 40, 40, -30], [-90, -110, 34, 34, 185], [40, 118, 30, 30, 12], [-50, -112, 26, 26, 60],
    [0, 112, 50, 40, -70], [62, 150, 30, 30, 230], [-140, 30, 30, 50, 90], [150, -70, 40, 30, 150],
    [120, 70, 26, 26, -20], [-150, -80, 30, 30, -45], [70, -125, 34, 30, 115], [-40, 150, 34, 26, 160],
  ];
  for (const [x, z, w, d, top] of NEAR) {
    addBox(x, z, w, d, top, tint());
    if (top > 30) beacons.push([x, top, z]);
    if (rng() < 0.6 && top < 200) {
      addBox(x + (rng() - 0.5) * w * 0.2, z + (rng() - 0.5) * d * 0.2, w * 0.55, d * 0.55, top + 15 + rng() * 40, tint(), top - 1);
    }
  }
  // the player's tower
  addBox(0, 0, 100, 100, -1.5, new THREE.Color('#5d636d'));
  addBox(0, 0, 103, 103, -1.5, new THREE.Color('#3a3f47'), -5);
  // procedural skyline
  for (let i = 0; i < 1500; i++) {
    const ang = rng() * TAU;
    const r = 170 + Math.pow(rng(), 0.8) * 2500;
    const x = Math.cos(ang) * r, z = Math.sin(ang) * r;
    if (Math.abs(x) < 165 && Math.abs(z) < 165) continue;
    // keep the Jedi Temple's plaza and the air in front of it clear
    if (Math.abs(x - TEMPLE_X) < 170 && z > TEMPLE_Z + 140 && z < TEMPLE_Z + 520) continue;
    // and nothing inside the Temple itself (it would poke into the great hall)
    if (Math.abs(x - TEMPLE_X) < 225 && Math.abs(z - TEMPLE_Z) < 225) continue;
    const w = 20 + rng() * 38, d = 20 + rng() * 38;
    let top = -260 + Math.pow(rng(), 1.25) * 560;
    if (r < 500) top += 30;
    // keep the opening cutscene's flight path (from the south-west) clear
    const ct = Math.max(0, Math.min(1, (x * -0.627 + z * 0.779) / 1100));
    const inCorridor = Math.hypot(x + 0.627 * 1100 * ct, z - 0.779 * 1100 * ct) < 110;
    if (inCorridor) {
      addBox(x, z, w, d, Math.min(top, -70 - rng() * 120), tint());
      continue;
    }
    const col = tint();
    if (rng() < 0.16) {
      const rr = Math.min(w, d) * 0.55;
      addCyl(x, z, rr, top, col);
      if (rng() < 0.5) addCyl(x, z, rr * 0.7, top + 20 + rng() * 60, tint(), top - 1);
    } else {
      addBox(x, z, w, d, top, col, BOTTOM, rng() < 0.25 ? rng() * TAU : 0);
      if (rng() < 0.45) addBox(x, z, w * (0.5 + rng() * 0.25), d * (0.5 + rng() * 0.25), top + 20 + rng() * 120, tint(), top - 1);
      if (rng() < 0.15) addBox(x, z, w * 0.18, d * 0.18, top + 60 + rng() * 160, tint(0.8), top - 1);
    }
    if (top > -80 && rng() < 0.35) beacons.push([x, top + 2, z]);
  }

  // landmarks: Jedi Temple style ziggurat + Senate style dome
  const TX = -900, TZ = -1500;
  const tiers = [[380, -40], [310, 40], [240, 110], [170, 165]];
  const ribTex = canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = '#a8977d'; g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 32) {
      const gr = g.createLinearGradient(x, 0, x + 32, 0);
      gr.addColorStop(0, 'rgba(60,45,30,0.35)'); gr.addColorStop(0.18, 'rgba(255,240,215,0.18)');
      gr.addColorStop(0.5, 'rgba(255,240,215,0.05)'); gr.addColorStop(0.82, 'rgba(60,45,30,0.12)'); gr.addColorStop(1, 'rgba(60,45,30,0.35)');
      g.fillStyle = gr; g.fillRect(x, 0, 32, h);
    }
    g.fillStyle = 'rgba(60,45,30,0.25)'; g.fillRect(0, 0, w, 6);
  });
  // each tier only needs to start where the one below it ends (the rest is hidden inside it, and must not
  // cut through the great hall built inside the second tier)
  let tierBottom = BOTTOM;
  for (const [w, top] of tiers) {
    const bot = tierBottom;
    tierBottom = top;
    addBox(TX, TZ, w, w, top, new THREE.Color('#9b8a74'), BOTTOM);
    boxList[boxList.length - 1].hidden = true;
    const map = ribTex.clone();
    map.needsUpdate = true;
    map.repeat.set(w / 10, (top - bot) / 40);
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, top - bot, w), new THREE.MeshStandardMaterial({ color: 0xffffff, map, roughness: 0.85, metalness: 0.05 }));
    m.position.set(TX, (top + bot) / 2, TZ);
    m.receiveShadow = true;
    scene.add(m);
  }
  const spireMat = new THREE.MeshStandardMaterial({ color: 0x9b8a74, roughness: 0.7, metalness: 0.2 });
  const spireGeo = new THREE.CylinderGeometry(0.5, 1, 1, 12);
  const spires = [[0, 0, 15, 180], [-60, -60, 10, 110], [60, -60, 10, 110], [-60, 60, 10, 110], [60, 60, 10, 110]];
  for (const [dx, dz, r, h] of spires) {
    const m = new THREE.Mesh(spireGeo, spireMat);
    m.scale.set(r * 2, h, r * 2);
    m.position.set(TX + dx, 165 + h / 2, TZ + dz);
    scene.add(m);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(r * 0.55, 30, 10), spireMat);
    tip.position.set(TX + dx, 165 + h + 15, TZ + dz);
    // the Council chamber sits on top of this one: its needle rises from the chamber's roof instead
    if (dx === COUNCIL.spire[0] && dz === COUNCIL.spire[1]) tip.position.y = COUNCIL.y + COUNCIL.h + COUNCIL.r * 0.32 + 3.2 + 15;
    scene.add(tip);
  }
  const SX = 1300, SZ = -1250;
  addCyl(SX, SZ, 70, 40, new THREE.Color('#7f8792'));
  const dome = new THREE.Mesh(new THREE.SphereGeometry(170, 48, 16, 0, TAU, 0, Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x8a929c, roughness: 0.4, metalness: 0.5 }));
  dome.scale.y = 0.42;
  dome.position.set(SX, 60, SZ);
  scene.add(dome);
  const domeBase = new THREE.Mesh(new THREE.CylinderGeometry(170, 120, 25, 48), dome.material);
  domeBase.position.set(SX, 48, SZ);
  scene.add(domeBase);

  // Coruscant silhouettes: stepped crowns and needle spires on tall towers, landing platforms jutting
  // off the facades (own rng, so the base skyline layout is unchanged)
  {
    const r2 = mulberry32(2718);
    const n0 = boxList.length;
    for (let i = 0; i < n0; i++) {
      const q = boxList[i];
      if (q.hidden || q.rotY || q.w < 14 || q.top < 30 || Math.hypot(q.x, q.z) < 120) continue;
      const k = r2();
      if (k < 0.22) {
        addBox(q.x, q.z, q.w * 0.62, q.d * 0.62, q.top + 8 + r2() * 14, q.col.clone().multiplyScalar(0.92), q.top - 1);
        addBox(q.x, q.z, q.w * 0.34, q.d * 0.34, q.top + 26 + r2() * 34, q.col.clone().multiplyScalar(0.85), q.top - 1);
        if (r2() < 0.6) addBox(q.x, q.z, 1.2, 1.2, q.top + 70 + r2() * 90, new THREE.Color('#3a3f48'), q.top);
      } else if (k < 0.4) {
        addBox(q.x, q.z, 1.6, 1.6, q.top + 30 + r2() * 80, new THREE.Color('#3a3f48'), q.top - 1);
      }
      if (q.top > 60 && r2() < 0.3) {
        const side = Math.floor(r2() * 4), nx = [1, -1, 0, 0][side], nz = [0, 0, 1, -1][side];
        const rad = 6 + r2() * 9;
        const y = q.top - 18 - r2() * Math.min(140, q.top + 30);
        addCyl(q.x + nx * (q.w / 2 + rad * 0.55), q.z + nz * (q.d / 2 + rad * 0.55), rad, y + 1.4, q.col.clone().multiplyScalar(0.7), y);
      }
    }
  }

  // carve the lower-level street canyon at the foot of the tower: anything rising through it becomes a
  // foundation below the street, and the block opposite the tower gets a face for the shops
  for (const b of boxList) {
    const hw = b.rotY ? Math.max(b.w, b.d) * 0.71 : b.w / 2, hd = b.rotY ? hw : b.d / 2;
    if (b.x + hw > -24.5 && b.x - hw < 24.5 && b.z + hd > 50.5 && b.z - hd < 134.5 && b.top > STREET_Y - 2 && b.bottom < STREET_Y + 60) b.top = STREET_Y - 2;
  }
  addBox(40, 76, 30, 50, -60, new THREE.Color('#545b66'));

  // build instanced meshes
  const boxGeo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const cylGeo = new THREE.CylinderGeometry(1, 1, 1, 20, 1).translate(0, 0.5, 0);
  const dummy = new THREE.Object3D();
  const shown = boxList.filter((b) => !b.hidden);
  const bInst = new THREE.InstancedMesh(boxGeo, bMat, shown.length);
  shown.forEach((b, i) => {
    dummy.position.set(b.x, b.bottom, b.z);
    dummy.rotation.set(0, b.rotY, 0);
    dummy.scale.set(b.w, b.top - b.bottom, b.d);
    dummy.updateMatrix();
    bInst.setMatrixAt(i, dummy.matrix);
    bInst.setColorAt(i, b.col);
  });
  bInst.frustumCulled = false;
  scene.add(bInst);
  const cInst = new THREE.InstancedMesh(cylGeo, cMat, cylList.length);
  cylList.forEach((c, i) => {
    dummy.position.set(c.x, c.bottom, c.z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(c.r, c.top - c.bottom, c.r);
    dummy.updateMatrix();
    cInst.setMatrixAt(i, dummy.matrix);
    cInst.setColorAt(i, c.col);
  });
  cInst.frustumCulled = false;
  scene.add(cInst);

  // blinking beacons
  {
    const bGeo = new THREE.SphereGeometry(1, 8, 6);
    const bm = new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 }, ...fogUniforms() },
      vertexShader: /* glsl */`
        varying vec3 vWorld; varying float vSeed;
        void main() { vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0); vWorld = wp.xyz;
          vSeed = fract(sin(dot(instanceMatrix[3].xz, vec2(12.9898, 78.233))) * 43758.5453);
          gl_Position = projectionMatrix * viewMatrix * wp; }`,
      fragmentShader: /* glsl */`
        uniform float time; varying vec3 vWorld; varying float vSeed;
        ${FOG_GLSL}
        void main() { float b = step(0.55, fract(time * 0.55 + vSeed)); vec3 col = vec3(6.0, 0.4, 0.2) * (0.08 + b);
          float dist = length(vWorld - cameraPosition); col *= exp(-dist * 0.0004);
          gl_FragColor = vec4(col, 1.0); }`,
    });
    const inst = new THREE.InstancedMesh(bGeo, bm, beacons.length);
    beacons.forEach(([x, y, z], i) => {
      const d = Math.hypot(x, z);
      dummy.position.set(x, y + 1.5, z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.setScalar(Math.max(0.8, d * 0.0018));
      dummy.updateMatrix();
      inst.setMatrixAt(i, dummy.matrix);
    });
    inst.frustumCulled = false;
    scene.add(inst);
    timeUniforms.push(bm.uniforms.time);
  }

  // holo signs on nearby towers
  {
    const signs = [
      [0, 40, -77.6, 0, 9, 34, 190], [77.6, 30, 0, -Math.PI / 2, 8, 28, 30], [-77, 60, 85, Math.PI / 2, 10, 40, 300],
      [80, 20, 95, -Math.PI / 2, 6, 22, 170], [-75, 120, -110, Math.PI / 2, 9, 34, 30], [47, 120, 150, -Math.PI / 2, 8, 30, 200],
      [-125, 60, 30, Math.PI / 2, 8, 30, 320], [130, 110, -70, -Math.PI / 2, 9, 36, 185],
    ];
    for (const [x, y, z, ry, w, h, hue] of signs) {
      const tex = glyphTexture(rng, hue);
      const col = new THREE.Color().setHSL(hue / 360, 0.9, 0.6).multiplyScalar(2.2);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h),
        new THREE.MeshBasicMaterial({ map: tex, color: col, transparent: true, toneMapped: false, depthWrite: false, side: THREE.DoubleSide, fog: true }));
      m.position.set(x, y, z);
      m.rotation.y = ry;
      scene.add(m);
      const base = col.clone();
      const ph = rng() * 10;
      updaters.push((dt, t) => {
        const f = 0.85 + 0.15 * Math.sin(t * 13 + ph) * Math.sin(t * 3.1 + ph);
        m.material.color.copy(base).multiplyScalar(f);
      });
    }
  }

  // sky traffic (moved entirely on the GPU)
  let traffic = null;
  {
    const lanes = [];
    const addLane = (origin, dir, count, speed, L = 4400) => lanes.push({ origin, dir: dir.normalize(), count, speed, L });
    addLane(new THREE.Vector3(0, 28, 64), new THREE.Vector3(1, 0, 0), 26, 55);
    addLane(new THREE.Vector3(-68, -14, 0), new THREE.Vector3(0, 0, 1), 26, 48);
    addLane(new THREE.Vector3(0, 48, -150), new THREE.Vector3(1, 0, 0.35), 30, 70);
    addLane(new THREE.Vector3(170, 8, 0), new THREE.Vector3(0.2, 0, 1), 30, 60);
    addLane(new THREE.Vector3(0, -45, 140), new THREE.Vector3(1, 0, -0.1), 30, 52);
    for (let i = 0; i < 18; i++) {
      const a = rng() * Math.PI;
      const dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
      const side = new THREE.Vector3(-dir.z, 0, dir.x);
      const off = (rng() < 0.5 ? -1 : 1) * (260 + rng() * 1200);
      addLane(side.multiplyScalar(off).setY(-110 + rng() * 260), dir, 30 + Math.floor(rng() * 20), 45 + rng() * 45);
    }
    let total = 0;
    for (const l of lanes) total += l.count * 2;
    // one set of per-vehicle data shared by the bodies and their lights (so the lights stay on the cars)
    const O = new Float32Array(total * 3), D = new Float32Array(total * 3), P = new Float32Array(total * 4);
    const DEAD = new Float32Array(total * 2).fill(-1);
    const sideOf = new Uint8Array(total);
    {
      let k = 0;
      for (const l of lanes) {
        for (let side = 0; side < 2; side++) {
          for (let j = 0; j < l.count; j++) {
            O.set([l.origin.x, l.origin.y + (side ? 3 : 0), l.origin.z], k * 3);
            D.set([l.dir.x, l.dir.y, l.dir.z], k * 3);
            const sp = l.speed * (0.85 + rng() * 0.3) * (side ? -1 : 1);
            P.set([(j / l.count) * l.L + rng() * 40, sp, l.L, 4], k * 4);
            sideOf[k++] = side;
          }
        }
      }
    }
    const aO = new THREE.InstancedBufferAttribute(O, 3), aD = new THREE.InstancedBufferAttribute(D, 3);
    const aP = new THREE.InstancedBufferAttribute(P, 4), aDead = new THREE.InstancedBufferAttribute(DEAD, 2);
    const mk = (geo, lights) => {
      const g = new THREE.InstancedBufferGeometry().copy(geo);
      g.instanceCount = total;
      const T = new Float32Array(total * 3);
      for (let k = 0; k < total; k++) {
        let c;
        if (lights) c = sideOf[k] ? [5.5, 0.5, 0.25] : [4.5, 4.2, 3.6];
        else { const t = tints[Math.floor(rng() * tints.length)]; c = [t.r * 0.6, t.g * 0.6, t.b * 0.6]; }
        T.set(c, k * 3);
      }
      g.setAttribute('laneOrigin', aO);
      g.setAttribute('laneDir', aD);
      g.setAttribute('laneParams', aP);
      g.setAttribute('aDead', aDead);
      g.setAttribute('tint', new THREE.InstancedBufferAttribute(T, 3));
      const mat = trafficMaterial(lights);
      timeUniforms.push(mat.uniforms.time);
      const mesh = new THREE.Mesh(g, mat);
      mesh.frustumCulled = false;
      scene.add(mesh);
    };
    // CPU mirror of the traffic vertex shader, so other systems can find (and destroy) a vehicle
    traffic = {
      count: total,
      pos(k, t, out) {
        const L = P[k * 4 + 2], sp = P[k * 4 + 1];
        let s = (P[k * 4] + sp * t) % L;
        if (s < 0) s += L;
        s -= L / 2;
        const dx = D[k * 3], dz = D[k * 3 + 2], sg = Math.sign(sp), w = P[k * 4 + 3];
        return out.set(O[k * 3] + dx * s + dz * sg * w, O[k * 3 + 1] + Math.sin(t * 0.7 + P[k * 4]) * 0.6, O[k * 3 + 2] + dz * s - dx * sg * w);
      },
      vel(k, out) { const sp = P[k * 4 + 1]; return out.set(D[k * 3] * sp, 0, D[k * 3 + 2] * sp); },
      alive(k, t) { return !(t > DEAD[k * 2] && t < DEAD[k * 2 + 1]); },
      kill(k, t0, t1) { DEAD[k * 2] = t0; DEAD[k * 2 + 1] = t1; aDead.needsUpdate = true; },
    };
    const body = new THREE.BoxGeometry(1.7, 0.7, 4.2);
    const light = new THREE.BoxGeometry(1.5, 0.22, 0.35).translate(0, 0.05, -2.2);
    mk(body, false);
    mk(light, true);
  }

  // -------------------------------------------------------------------------
  // The playable rooftop
  // -------------------------------------------------------------------------
  const firstProp = scene.children.length; // everything after this is a rooftop prop (batched below)
  const roofMat = new THREE.MeshStandardMaterial({ map: roofTexture(), roughness: 0.82, metalness: 0.15 });
  const wallTex = panelTexture('#8b9199', '#5d636b', 8, 1, [6, 1]);
  const wallMat = new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.55, metalness: 0.35 });
  const darkMetal = new THREE.MeshStandardMaterial({ color: 0x2c3036, roughness: 0.5, metalness: 0.6 });
  const towerMat = new THREE.MeshStandardMaterial({ map: panelTexture('#9aa1aa', '#666c74', 3, 6), roughness: 0.5, metalness: 0.4 });
  const crateMat = new THREE.MeshStandardMaterial({ map: crateTexture(), roughness: 0.7, metalness: 0.25 });
  const hazardMat = new THREE.MeshStandardMaterial({ map: hazardTexture(), roughness: 0.7 });
  const glowBlue = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.35, 0.95, 2.1), toneMapped: false });
  const glowWarm = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.9, 1.05, 0.42), toneMapped: false });
  const padRingMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.25, 0.6, 1.3), toneMapped: false });
  const padLampMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.2, 0.68, 0.28), toneMapped: false });
  const glowRed = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.5, 0.3, 0.2), toneMapped: false });
  const glowStrip = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.1, 0.62, 0.26), toneMapped: false });
  const boxG = new THREE.BoxGeometry(1, 1, 1);

  function block(mat, cx, cy, cz, sx, sy, sz, opts = {}) {
    const m = new THREE.Mesh(boxG, mat);
    m.scale.set(sx, sy, sz);
    m.position.set(cx, cy, cz);
    m.castShadow = opts.cast !== false;
    m.receiveShadow = true;
    scene.add(m);
    if (opts.collide !== false) world.box(cx, cy, cz, sx, sy, sz, opts);
    return m;
  }

  // roof slab + bridges
  const roof = new THREE.Mesh(new THREE.BoxGeometry(100, 2, 100), roofMat);
  roof.position.set(0, -1, 0);
  roof.receiveShadow = true;
  scene.add(roof);
  world.add(-50, -2, -50, 50, 0, 50, { tag: 'floor' });

  const bridgeMat = new THREE.MeshStandardMaterial({ map: panelTexture('#555a62', '#33363b', 2, 8, [1, 4]), roughness: 0.7, metalness: 0.3 });
  // north bridge
  block(bridgeMat, 0, -0.6, -64, 7, 1.2, 28.4, { tag: 'floor' });
  block(darkMetal, 0, -2.6, -64, 4, 3, 28, { collide: false });
  // east bridge
  block(bridgeMat, 64, -0.6, 0, 28.4, 1.2, 7, { tag: 'floor' });
  block(darkMetal, 64, -2.6, 0, 28, 3, 4, { collide: false });
  for (const [x0, z0, x1, z1] of [[-3.5, -50, -3.5, -78], [3.5, -50, 3.5, -78], [50, -3.5, 78, -3.5], [50, 3.5, 78, 3.5]]) {
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const sx = Math.abs(x1 - x0) + 0.25, sz = Math.abs(z1 - z0) + 0.25;
    block(wallMat, cx, 0.55, cz, sx, 1.1, sz);
    world.box(cx, 2.5, cz, sx, 5, sz, { shot: false, walk: false });
    block(glowStrip, cx, 1.12, cz, sx * 0.98, 0.05, sz * 0.98, { collide: false, cast: false });
  }

  // parapet walls (with gaps for the two bridges)
  const H = 1.1, T = 0.6, E = 50;
  const walls = [
    [-E, E, -E, -E, [-3.5, 3.5]], // north (z=-50), gap in x
    [-E, E, E, E, null],          // south
    [-E, -E, -E, E, null],        // west (x=-50)
    [E, E, -E, E, [-3.5, 3.5]],   // east, gap in z
  ];
  for (const [x0, x1, z0, z1, gap] of walls) {
    const alongX = z0 === z1;
    const segs = [];
    if (alongX) {
      if (gap) { segs.push([x0, gap[0]], [gap[1], x1]); } else segs.push([x0, x1]);
      for (const [a, b] of segs) {
        const cx = (a + b) / 2, len = b - a;
        const zc = z0 + (z0 < 0 ? T / 2 : -T / 2);
        block(wallMat, cx, H / 2, zc, len, H, T);
        block(glowStrip, cx, H + 0.02, zc, len, 0.04, 0.12, { collide: false, cast: false });
        world.box(cx, 3, zc, len, 6, T, { shot: false, walk: false });
      }
    } else {
      if (gap) { segs.push([z0, gap[0]], [gap[1], z1]); } else segs.push([z0, z1]);
      for (const [a, b] of segs) {
        const cz = (a + b) / 2, len = b - a;
        const xc = x0 + (x0 < 0 ? T / 2 : -T / 2);
        block(wallMat, xc, H / 2, cz, T, H, len);
        block(glowStrip, xc, H + 0.02, cz, 0.12, 0.04, len, { collide: false, cast: false });
        world.box(xc, 3, cz, T, 6, len, { shot: false, walk: false });
      }
    }
  }
  // hazard trims along the inside of the parapet
  for (const [cx, cz, sx, sz] of [[0, -49.1, 98, 0.6], [0, 49.1, 98, 0.6], [-49.1, 0, 0.6, 98], [49.1, 0, 0.6, 98]]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), hazardMat);
    m.rotation.x = -Math.PI / 2;
    m.scale.set(sx, sz, 1);
    if (sz > sx) { m.material = hazardMat.clone(); m.material.map = hazardMat.map.clone(); m.material.map.rotation = Math.PI / 2; }
    m.position.set(cx, 0.012, cz);
    m.receiveShadow = true;
    scene.add(m);
  }

  // central turbolift tower with four doors
  const TW = 12, TH = 16;
  // the Republic turbolift tower (modelled in blender/build_props.py)
  placeProp(scene, 'TurboliftTower', 0, 0, 0);
  world.box(0, TH / 2, 0, TW, TH, TW, { tag: 'tower' });
  world.box(0, TH + 0.4, 0, 15, 1.4, 15);
  world.box(0, TH + 2.2, 0, 5.4, 3.6, 5.4);

  const doors = [];
  const doorDefs = [
    { n: new THREE.Vector3(0, 0, -1) }, { n: new THREE.Vector3(0, 0, 1) },
    { n: new THREE.Vector3(1, 0, 0) }, { n: new THREE.Vector3(-1, 0, 0) },
  ];
  const doorMat = new THREE.MeshStandardMaterial({ color: 0x5a6068, roughness: 0.4, metalness: 0.6 });
  for (const d of doorDefs) {
    const g = new THREE.Group();
    g.position.copy(d.n).multiplyScalar(TW / 2 + 0.06);
    g.rotation.y = Math.atan2(d.n.x, d.n.z);
    scene.add(g);
    const frame = new THREE.Mesh(boxG, darkMetal);
    frame.scale.set(4.2, 4.6, 0.3); frame.position.set(0, 2.3, 0);
    const inner = new THREE.Mesh(boxG, new THREE.MeshBasicMaterial({ color: 0x050607 }));
    inner.scale.set(3.2, 3.6, 0.32); inner.position.set(0, 1.8, 0.02);
    const glow = new THREE.Mesh(boxG, glowBlue);
    glow.scale.set(3.6, 0.12, 0.34); glow.position.set(0, 3.85, 0.02);
    const left = new THREE.Mesh(boxG, doorMat);
    left.scale.set(1.62, 3.6, 0.12); left.position.set(-0.81, 1.8, 0.2);
    const right = left.clone();
    right.position.x = 0.81;
    for (const m of [frame, left, right]) { m.castShadow = true; m.receiveShadow = true; }
    g.add(frame, inner, glow, left, right);
    const door = {
      pos: d.n.clone().multiplyScalar(TW / 2 + 1.6), dir: d.n.clone(), open: 0, timer: 0, left, right, glow,
      openFor(sec) { this.timer = Math.max(this.timer, sec); },
    };
    doors.push(door);
  }
  updaters.push((dt) => {
    for (const d of doors) {
      d.timer -= dt;
      const target = d.timer > 0 ? 1 : 0;
      d.open += Math.sign(target - d.open) * Math.min(Math.abs(target - d.open), dt * 2.5);
      d.left.position.x = -0.81 - d.open * 1.55;
      d.right.position.x = 0.81 + d.open * 1.55;
      d.glow.material = d.timer > 0 ? glowRed : glowBlue;
    }
  });

  // landing pad (cutscene stage)
  const PAD = new THREE.Vector3(0, 0, 37);
  const pad = new THREE.Mesh(new THREE.CircleGeometry(10, 64), new THREE.MeshStandardMaterial({ map: padTexture(), roughness: 0.85, metalness: 0.05, transparent: true }));
  pad.rotation.x = -Math.PI / 2;
  pad.position.set(PAD.x, 0.015, PAD.z);
  pad.receiveShadow = true;
  scene.add(pad);
  const padRing = new THREE.Mesh(new THREE.TorusGeometry(10.05, 0.05, 6, 96), padRingMat);
  padRing.rotation.x = -Math.PI / 2;
  padRing.position.set(PAD.x, 0.05, PAD.z);
  scene.add(padRing);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU;
    const l = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, 0.08, 8), padLampMat);
    l.position.set(PAD.x + Math.cos(a) * 10.6, 0.06, PAD.z + Math.sin(a) * 10.6);
    l.userData.dynamic = true;
    scene.add(l);
    updaters.push((dt, t) => { l.visible = ((Math.floor(t * 6) + i) % 12) !== 0; });
  }

  // cover & props
  const crate = (x, z, s = 1.3, stack = 1, rot = 0) => {
    for (let k = 0; k < stack; k++) {
      world.box(x, s / 2 + k * s, z, s, s, s);
      placeProp(scene, 'Crate', x, k * s, z, rot + (k ? 0.12 : 0), s);
    }
  };
  crate(-14, 16, 1.4, 2); crate(-12.6, 16, 1.4, 1); crate(-14, 17.4, 1.4, 1);
  crate(16, 12, 1.4, 1); crate(17.4, 12, 1.4, 2);
  crate(-22, -16, 1.4, 1); crate(-22, -17.4, 1.4, 2);
  crate(25, -21, 1.4, 2); crate(26.4, -21, 1.4, 1);
  crate(-9, -30, 1.3, 1); crate(10, 26, 1.3, 1); crate(-30, 2, 1.3, 2); crate(31, -4, 1.3, 1);
  crate(-40, -22, 1.4, 1); crate(40, 22, 1.4, 1); crate(-6, 24, 1.2, 1); crate(36, -40, 1.3, 2);

  const barricadeMat = new THREE.MeshStandardMaterial({ color: 0xa8aeb5, roughness: 0.45, metalness: 0.4 });
  const barricade = (x, z, alongX, len = 4) => {
    const sx = alongX ? len : 0.6, sz = alongX ? 0.6 : len;
    world.box(x, 0.6, z, sx, 1.2, sz);
    // armour faces the droids: north for the east-west lines, east for the north-south ones
    placeProp(scene, 'Barricade', x, 0, z, alongX ? Math.PI : Math.PI / 2, [len / 4, 1, 1]);
  };
  barricade(0, 17, true, 6); barricade(-19, 0, false, 5); barricade(19, 4, false, 5);
  barricade(-28, 28, true, 5); barricade(28, 30, true, 5); barricade(0, -20, true, 6);
  barricade(-32, -34, false, 4); barricade(36, -20, false, 4); barricade(12, -36, false, 4);

  const hvacMat = new THREE.MeshStandardMaterial({ map: panelTexture('#6d737b', '#43484f', 6, 2), roughness: 0.6, metalness: 0.4 });
  const hvac = (x, z, sx, sz, h = 3) => {
    world.box(x, h / 2, z, sx, h, sz);
    placeProp(scene, 'HVAC', x, 0, z, 0, [sx / 2, h, sz / 2]);
  };
  hvac(-38, -38, 8, 5); hvac(38, 38, 6, 8, 3.5); hvac(-39, 36, 6, 6, 2.8); hvac(39, -39, 7, 5);

  const genMat = new THREE.MeshStandardMaterial({ color: 0x4a5059, roughness: 0.4, metalness: 0.7 });
  for (const [x, z] of [[-28, 12], [28, -12], [-12, -40]]) {
    const g = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.5, 3.2, 20), genMat);
    g.position.set(x, 1.6, z); g.castShadow = g.receiveShadow = true;
    scene.add(g);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(1.36, 1.36, 0.3, 20, 1, true), glowBlue);
    band.position.set(x, 2.2, z);
    scene.add(band);
    world.box(x, 1.6, z, 2.6, 3.2, 2.6);
  }
  for (const [x, z] of [[-43, 8], [43, 18], [14, -44], [-22, 44], [24, 44]]) {
    block(towerMat, x, 3, z, 2, 6, 2);
    block(glowRed, x, 6.05, z, 0.4, 0.1, 0.4, { collide: false, cast: false });
  }

  // edge lights on the tower crown
  for (let i = 0; i < 40; i++) {
    const t = (i / 40) * 4;
    const side = Math.floor(t), f = t - side;
    const p = [[-51.6 + f * 103.2, -51.6], [51.6, -51.6 + f * 103.2], [51.6 - f * 103.2, 51.6], [-51.6, 51.6 - f * 103.2]][side];
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.25, 0.5), glowWarm);
    l.position.set(p[0], -3.2, p[1]);
    scene.add(l);
  }

  // the two bridge towers are solid
  world.add(-22, -60, -122, 22, 95, -78, { tag: 'tower' });
  world.add(78, -60, -22, 122, 72, 22, { tag: 'tower' });

  // doorway glows on the bridge towers (spawn gates)
  const gates = [
    { pos: new THREE.Vector3(0, 0, -76.8), dir: new THREE.Vector3(0, 0, 1) },
    { pos: new THREE.Vector3(76.8, 0, 0), dir: new THREE.Vector3(-1, 0, 0) },
  ];
  for (const gt of gates) {
    const g = new THREE.Group();
    g.position.copy(gt.pos).addScaledVector(gt.dir, -0.8);
    g.rotation.y = Math.atan2(gt.dir.x, gt.dir.z);
    const frame = new THREE.Mesh(boxG, darkMetal); frame.scale.set(7.5, 6.5, 0.6); frame.position.set(0, 3.25, 0);
    const hole = new THREE.Mesh(boxG, new THREE.MeshBasicMaterial({ color: 0x060708 })); hole.scale.set(6, 5, 0.62); hole.position.set(0, 2.5, 0);
    const lamp = new THREE.Mesh(boxG, glowRed); lamp.scale.set(6.2, 0.18, 0.66); lamp.position.set(0, 5.15, 0);
    g.add(frame, hole, lamp);
    scene.add(g);
  }

  /** True if a skyscraper blocks the segment a-b (used to keep background events in plain view). */
  const occluded = (a, b) => {
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
    const test = (x0, y0, z0, x1, y1, z1) => {
      let t0 = 0, t1 = 1;
      for (const [o, d, lo, hi] of [[a.x, dx, x0, x1], [a.y, dy, y0, y1], [a.z, dz, z0, z1]]) {
        if (Math.abs(d) < 1e-9) { if (o < lo || o > hi) return false; continue; }
        let ta = (lo - o) / d, tb = (hi - o) / d;
        if (ta > tb) { const t = ta; ta = tb; tb = t; }
        if (ta > t0) t0 = ta;
        if (tb < t1) t1 = tb;
        if (t1 < t0) return false;
      }
      return true;
    };
    for (const q of boxList) {
      const hx = q.rotY ? Math.max(q.w, q.d) * 0.71 : q.w / 2, hz = q.rotY ? hx : q.d / 2;
      if (test(q.x - hx, q.bottom, q.z - hz, q.x + hx, q.top, q.z + hz)) return true;
    }
    for (const c of cylList) if (test(c.x - c.r, c.bottom, c.z - c.r, c.x + c.r, c.top, c.z + c.r)) return true;
    return false;
  };

  // -------------------------------------------------------------------------
  // Battle damage + Battlefront-style cover
  // -------------------------------------------------------------------------
  const firePoints = [];
  const sparkPoints = [];
  // crashed, smoldering LAAT/i: the centrepiece and the biggest piece of cover
  {
    const W = new THREE.Vector3(20, -0.3, -28);
    const laat = buildLAAT({ wreck: true });
    laat.position.copy(W);
    laat.rotation.set(-0.1, Math.PI / 2, 0.17, 'YXZ');
    scene.add(laat);
    laat.updateMatrixWorld(true);
    const A = laat.userData.anchors;
    for (const [p, size] of [[A.engines[0], 1.0], [A.engines[1], 0.8], [A.stump, 1.3], [A.nose, 0.7]]) firePoints.push({ pos: p.clone().applyMatrix4(laat.matrixWorld), size });
    world.box(W.x - 1.0, 1.4, W.z, 18.6, 2.8, 3.4, { tag: 'wreck' });
    world.box(W.x - 2.4, 3.0, W.z + 4.8, 3.2, 0.6, 6.8, { move: false, walk: false });
    // gouge in the roof behind it
    const gouge = new THREE.Mesh(new THREE.PlaneGeometry(4, 16), new THREE.MeshBasicMaterial({ color: 0x050505, transparent: true, opacity: 0.6, depthWrite: false }));
    gouge.rotation.set(-Math.PI / 2, 0, Math.PI / 2);
    gouge.position.set(W.x - 15, 0.02, W.z + 0.4);
    scene.add(gouge);
  }
  // deployable Republic energy shields: block droid fire, let Republic bolts through
  const shieldTex = canvasTexture(128, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.strokeStyle = 'rgba(160,215,255,0.9)'; g.lineWidth = 2;
    const s = 16;
    for (let y = 0; y < h + s; y += s * 0.87) for (let x = (Math.round(y / (s * 0.87)) % 2) * s * 0.75; x < w + s; x += s * 1.5) {
      g.beginPath();
      for (let k = 0; k < 6; k++) { const a = (k / 6) * TAU; g.lineTo(x + Math.cos(a) * s * 0.5, y + Math.sin(a) * s * 0.5); }
      g.closePath(); g.stroke();
    }
  }, { repeat: [2, 1.5] });
  const shieldMat = new THREE.MeshBasicMaterial({ map: shieldTex, color: new THREE.Color(0.35, 0.8, 1.6), transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const shields = [];
  const shield = (x, z, alongX) => {
    const len = 2.8;
    block(darkMetal, x, 0.15, z, alongX ? len + 0.3 : 0.5, 0.3, alongX ? 0.5 : len + 0.3, { collide: false });
    block(glowBlue, x, 0.32, z, alongX ? len : 0.08, 0.05, alongX ? 0.08 : len, { collide: false, cast: false });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(len, 1.9), shieldMat);
    m.position.set(x, 1.25, z);
    if (!alongX) m.rotation.y = Math.PI / 2;
    m.renderOrder = 9;
    scene.add(m);
    shields.push(m);
    world.box(x, 1.2, z, alongX ? len : 0.3, 2.2, alongX ? 0.3 : len, { shot: false, walk: false, shield: true });
  };
  shield(-8, 14, true); shield(12, 9, false); shield(-30, -6, true); shield(34, 6, false);
  updaters.push((dt, t) => { shieldMat.opacity = 0.26 + 0.06 * Math.sin(t * 7) * Math.sin(t * 2.3); });
  // portable blast walls (sandbag-style), Republic side
  const wallSandMat = new THREE.MeshStandardMaterial({ color: 0x6b6a5e, roughness: 0.95, metalness: 0.05 });
  const blastWall = (x, z, alongX) => {
    const sx = alongX ? 3.2 : 0.8, sz = alongX ? 0.8 : 3.2;
    block(wallSandMat, x, 0.5, z, sx, 1.0, sz);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 3.2, 10), wallSandMat);
    cap.rotation.set(alongX ? 0 : Math.PI / 2, 0, alongX ? Math.PI / 2 : 0);
    cap.position.set(x, 1.0, z);
    cap.castShadow = cap.receiveShadow = true;
    scene.add(cap);
    world.box(x, 1.1, z, sx, 0.4, sz, { walk: false });
  };
  blastWall(-10, 28, true); blastWall(10, 28.5, true); blastWall(-22, 20, false); blastWall(24, 17, false);
  crate(-36, 14, 1.4, 2); crate(-34.6, 14, 1.4, 1); crate(6, -44, 1.3, 2);
  // wrecked droid parts scattered where the last assault broke
  {
    const tan = new THREE.MeshStandardMaterial({ color: 0xa48d68, roughness: 0.7, metalness: 0.15 });
    const gun = new THREE.MeshStandardMaterial({ color: 0x3c4552, roughness: 0.5, metalness: 0.6 });
    const prng = mulberry32(77);
    const spots = [[0, -40], [-5, -35], [8, -31], [40, 2], [35, -7], [31, 9], [-3, -12], [9, 3], [-14, -26], [44, -10]];
    for (const [x, z] of spots) {
      for (let i = 0; i < 3; i++) {
        const k = Math.floor(prng() * 4);
        const geo = k === 0 ? new THREE.CylinderGeometry(0.03, 0.056, 0.26, 8) : k === 1 ? new THREE.BoxGeometry(0.24, 0.12, 0.34)
          : k === 2 ? new THREE.CylinderGeometry(0.017, 0.017, 0.56, 6) : new THREE.BoxGeometry(0.16, 0.32, 0.18);
        const m = new THREE.Mesh(geo, k === 3 ? gun : tan);
        m.position.set(x + (prng() - 0.5) * 2.2, 0.06, z + (prng() - 0.5) * 2.2);
        m.rotation.set(Math.PI / 2 * (k === 1 ? 0 : 1), prng() * TAU, prng() * 0.6);
        m.castShadow = true;
        scene.add(m);
      }
    }
  }
  // sparking broken panels
  {
    const brokenMat = new THREE.MeshStandardMaterial({ color: 0x1b1d20, roughness: 0.6, metalness: 0.5, emissive: new THREE.Color(0.06, 0.02, 0.004) });
    for (const [x, y, z, nx, nz] of [[6.08, 9, -3, 1, 0], [-3, 5, 6.08, 0, 1], [-6.08, 11, 2, -1, 0], [-38, 3.05, -38, 0, 0]]) {
      const m = new THREE.Mesh(boxG, brokenMat);
      m.scale.set(nx ? 0.06 : 1.6, nz || nx ? 1.4 : 0.06, nz ? 0.06 : 1.6);
      m.position.set(x, y, z);
      scene.add(m);
      sparkPoints.push({ pos: new THREE.Vector3(x + nx * 0.1, y, z + nz * 0.1), normal: new THREE.Vector3(nx, nx || nz ? 0.3 : 1, nz).normalize(), t: Math.random() * 2 });
    }
  }
  // flickering emergency lights
  {
    const emA = new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 0.5, 0.1), toneMapped: false });
    const emB = new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 1.6, 0.2), toneMapped: false });
    for (const [x, y, z, m] of [[-49.4, 1.3, -20, emA], [49.4, 1.3, 20, emB], [-20, 1.3, -49.4, emB], [20, 1.3, 49.4, emA], [6.1, 15, 6.1, emA], [-6.1, 15, -6.1, emB], [-49.4, 1.3, 30, emA], [49.4, 1.3, -30, emB]]) {
      const l = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.22, 0.35), m);
      l.position.set(x, y, z);
      scene.add(l);
    }
    const a0 = emA.color.clone(), b0 = emB.color.clone();
    updaters.push((dt, t) => {
      emA.color.copy(a0).multiplyScalar(Math.sin(t * 9) > -0.1 ? (Math.random() < 0.05 ? 0.2 : 1) : 0.05);
      emB.color.copy(b0).multiplyScalar(0.55 + 0.45 * Math.sin(t * 4.5 + 1));
    });
  }
  firePoints.push({ pos: new THREE.Vector3(-35.3, 2.8, 14), size: 0.6 });
  const arenaFX = new ArenaFX(firePoints, sparkPoints);

  // smoke columns rising from burning towers across the skyline
  const columns = [];
  {
    const crng = mulberry32(4242);
    const topAt = (x, z) => { let t = -Infinity; for (const b of boxList) if (Math.abs(b.x - x) < 6 && Math.abs(b.z - z) < 6) t = Math.max(t, b.top); return t; };
    for (const [x, z] of [[-90, -110], [150, -70], [-40, 150], [62, 150]]) columns.push({ pos: new THREE.Vector3(x, topAt(x, z), z), height: 380, width: 16, speed: 8 });
    let guard = 0;
    while (columns.length < 11 && guard++ < 4000) {
      const b = boxList[Math.floor(crng() * boxList.length)];
      const d = Math.hypot(b.x, b.z);
      if (d < 320 || d > 1500 || b.top < 40 || b.top > 320) continue;
      if (columns.some((c) => Math.hypot(c.pos.x - b.x, c.pos.z - b.z) < 250)) continue;
      columns.push({ pos: new THREE.Vector3(b.x, topAt(b.x, b.z), b.z), height: 500 + crng() * 300, width: 26 + crng() * 18, speed: 10 + crng() * 5 });
    }
  }
  const atmos = new Atmosphere(scene, columns, { uniforms: fogUniforms, glsl: FOG_GLSL }, SUN_DIR);
  timeUniforms.push(atmos.time);

  // the lower-level street (where the fight ends up after the fall)
  const street = buildStreet(scene, world);
  updaters.push((dt, t) => street.update(dt, t));
  // Act 2: the Jedi Temple's plaza and great hall
  const temple = buildTemple(scene, world);
  updaters.push((dt, t) => temple.update(dt, t));

  // Static batching: merge every static rooftop prop that shares a material into one mesh.
  // Hundreds of crates, walls, trims and debris become a few dozen draw calls (each drawn twice with shadows).
  {
    scene.updateMatrixWorld(true);
    const groups = new Map();
    for (const m of scene.children.slice(firstProp)) {
      if (!m.isMesh || m.isInstancedMesh || m.userData.dynamic || m.geometry.isInstancedBufferGeometry) continue;
      if (Array.isArray(m.material) || m.material.transparent) continue;
      const key = m.material.uuid + (m.castShadow ? 'c' : '') + (m.receiveShadow ? 'r' : '');
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(m);
    }
    for (const list of groups.values()) {
      if (list.length < 2) continue;
      const geos = list.map((m) => {
        const g = (m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone()).applyMatrix4(m.matrixWorld);
        for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
        if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
        return g;
      });
      const merged = mergeGeometries(geos);
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, list[0].material);
      mesh.castShadow = list[0].castShadow;
      mesh.receiveShadow = list[0].receiveShadow;
      for (const m of list) scene.remove(m);
      scene.add(mesh);
    }
  }

  // walkable bounds used for spawn sanity checks
  const onRoof = (p) => Math.abs(p.x) < 49 && Math.abs(p.z) < 49;

  const spawns = {
    gates,
    doors,
    edge() {
      const side = Math.floor(Math.random() * 4);
      const f = (Math.random() - 0.5) * 80;
      const out = 58 + Math.random() * 8;
      const p = [[f, -out], [f, out], [-out, f], [out, f]][side];
      return new THREE.Vector3(p[0], -35 - Math.random() * 15, p[1]);
    },
    drop() {
      for (let i = 0; i < 20; i++) {
        const p = new THREE.Vector3((Math.random() - 0.5) * 84, 0, (Math.random() - 0.5) * 84);
        if (Math.abs(p.x) < 9 && Math.abs(p.z) < 9) continue;
        if (world.groundAt(p.x, p.z, 0.2, 0.6) !== 0) continue;
        let blocked = false;
        for (const b of world.boxes) {
          if (b.tag === 'floor' || !b.move) continue;
          if (p.x > b.min.x - 1 && p.x < b.max.x + 1 && p.z > b.min.z - 1 && p.z < b.max.z + 1 && b.min.y < 2) { blocked = true; break; }
        }
        if (!blocked) return p;
      }
      return new THREE.Vector3(10, 0, 10);
    },
  };

  // everything built so far is "the city" (hidden while the fight is on Tatooine); the shared sun and sky light stay
  const cityObjects = scene.children.filter((o) => o !== hemi && o !== sun && o !== sun.target);
  let cityShown = true;

  return {
    world, sky, sun, hemi, spawns, PAD, onRoof, traffic, occluded, atmos, arenaFX, street, temple,
    get visible() { return cityShown; },
    setVisible(on) {
      if (on === cityShown) return;
      cityShown = on;
      for (const o of cityObjects) {
        if (!on) { o.userData.cityVis = o.visible; o.visible = false; } else o.visible = o.userData.cityVis ?? true;
      }
    },
    roofArena: {
      name: 'roof', y: 0, center: new THREE.Vector3(0, 0, 0),
      bounds: { minX: -49, maxX: 49, minZ: -49, maxZ: 49 },
      flyBounds: { minX: -60, maxX: 60, minZ: -60, maxZ: 60 },
      avoid: true, outline: [[-50, -50], [50, -50], [50, 50], [-50, 50]],
      objective: { x: 0, z: 0 }, objectiveText: 'DEFEND THE TURBOLIFT TOWER', spawns,
      playerSpawn: new THREE.Vector3(0, 0, 36), allySpawn: new THREE.Vector3(2, 0, 38),
      shadowTarget: new THREE.Vector3(0, 0, 0), sunIntensity: 4.2,
    },
    update(dt, t, camera) {
      for (const u of timeUniforms) u.value = t;
      sky.position.copy(camera.position);
      for (const f of updaters) f(dt, t);
    },
  };
}
