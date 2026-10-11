import * as THREE from 'three';
import { mulberry32, canvasTexture, TAU } from './util.js';
import { buildLAAT } from './ships.js';
import { propObject } from './assets.js';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { GRADE } from './post.js';

// the binary sunset look: warm low light, cool shadows, bloom only on the truly bright (suns, blades, blaster fire)
const DESERT_GRADE = { exposure: 0.9, contrast: 1.14, shadowTint: [0.002, 0.002, 0.014], highlightGain: [1.07, 0.98, 0.86], saturation: 1.1, midDesat: 0.08, bloom: { strength: 0.66, radius: 0.45, threshold: 1.6 } };

/**
 * Act III: Tatooine, at the hour of the binary sunset. A moisture farm on the edge of the Jundland Wastes,
 * far away from the city (the city is hidden while the fight is here). The arena is about 150 m across:
 *   south       the Republic landing zone and the homestead: an entrance dome and a sunken courtyard
 *   west        an outpost village: an adobe street with a domed cantina, market stalls, archways and
 *               stairs up to flat roofs
 *   middle      open sand and low dunes, the krayt dragon skeleton, a crashed freighter
 *   east        a rock shelf up a ramp, with sniper pillars
 *   north       the Jawa sandcrawler (ramp down into the arena), the Tusken camp with its banthas
 * Dunes and sandstone buttes rise all round.
 *
 * Coordinates below are relative to the arena centre (TTX, 0, TTZ); north is -z.
 */
export const TTX = 9000, TTZ = 0;
// Tatoo I and Tatoo II, low in the west
export const TAT_SUN = new THREE.Vector3(-0.9, 0.27, 0.33).normalize();
const TAT_SUN2 = new THREE.Vector3(-0.86, 0.21, 0.47).normalize();
const SIZE = 1000; // terrain tile (m)
export const B = { minX: -76, maxX: 76, minZ: -76, maxZ: 70 };
export const PIT = { x: 16, z: 28, r: 7.5, depth: 5.2 };
const SHELF = { x0: 46, h: 3.6, z0: -52, z1: 34, rampX0: 31 };

const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const box2 = (x, z, x0, x1, z0, z1, f = 3) => sstep(x0 - f, x0, x) * (1 - sstep(x1, x1 + f, x)) * sstep(z0 - f, z0, z) * (1 - sstep(z1, z1 + f, z));

/** Height of the desert at (x, z), relative to the arena centre. */
export function duneHeight(x, z) {
  // the homestead's sunken courtyard
  if (Math.hypot(x - PIT.x, z - PIT.z) < PIT.r - 0.1) return -PIT.depth;
  const rr = Math.max(Math.abs(x) * (70 / 76), z < 0 ? -z * (70 / 76) : z);
  // gentle swells, a field of low dunes in the middle, level ground under the village, the farm and the landing zone
  let inner = 0.22 * Math.sin(x * 0.085 + Math.sin(z * 0.045) * 2.2) * Math.cos(z * 0.07 + 0.5) + 0.12 * Math.sin((x + z) * 0.12 + 1);
  const c = Math.hypot((x - 4) / 30, (z + 16) / 24);
  if (c < 1) {
    const s = Math.sin(x * 0.16 + Math.sin(z * 0.09) * 1.4);
    inner += (0.55 + 0.75 * Math.pow(Math.abs(s), 1.5)) * sstep(1, 0.45, c) * 1.3;
  }
  const pad = Math.max(box2(x, z, -74, -24, -48, 36), box2(x, z, -26, 30, 14, 46), box2(x, z, -14, 32, 44, 72));
  inner *= 1 - pad;
  // the rock shelf to the east, up a broad ramp in the middle
  const zm = sstep(SHELF.z0 - 1.5, SHELF.z0 + 1.5, z) * (1 - sstep(SHELF.z1 - 1.5, SHELF.z1 + 1.5, z));
  const cliff = sstep(SHELF.x0 - 0.8, SHELF.x0 + 0.8, x), ramp = sstep(SHELF.rampX0, SHELF.x0 + 1, x);
  const rise = cliff + (ramp - cliff) * sstep(10, 6, Math.abs(z));
  const base = inner + SHELF.h * rise * zm;
  // dunes all round outside the arena
  const k = sstep(70, 135, rr);
  if (k <= 0) return base;
  const s = Math.sin(x * 0.021 + Math.sin(z * 0.013) * 1.6);
  const ridge = Math.pow(Math.abs(s), 1.6) * Math.sign(s);
  const big = 9 + 7 * ridge + 4 * Math.sin(z * 0.017 + x * 0.006 + 2) + 2.5 * Math.sin(x * 0.05 + z * 0.037);
  const far = sstep(260, 460, rr);
  const dune = (Math.max(0, big) + Math.min(rr - 70, 120) * 0.03) * (1 - far * 0.96);
  return base * (1 - k) + dune * k;
}

// ------------------------------------------------------------------ procedural textures
function hash3(x, y, z) {
  let h = (x * 374761393 + y * 668265263 + z * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
function vnoise(x, y, z) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  let fx = x - ix, fy = y - iy, fz = z - iz;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy); fz = fz * fz * (3 - 2 * fz);
  let out = 0;
  for (let dx = 0; dx < 2; dx++) for (let dy = 0; dy < 2; dy++) for (let dz = 0; dz < 2; dz++) {
    out += (dx ? fx : 1 - fx) * (dy ? fy : 1 - fy) * (dz ? fz : 1 - fz) * hash3(ix + dx, iy + dy, iz + dz);
  }
  return out;
}

function sandTextures() {
  const rng = mulberry32(1977);
  const S = 512;
  // wind ripples: a height field of wavy crests, turned into a normal map
  const hgt = new Float32Array(S * S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = x / S, v = y / S;
    const warp = Math.sin(v * TAU * 2 + Math.sin(u * TAU) * 1.3) * 0.08 + Math.sin(v * TAU * 5 + u * TAU * 2) * 0.02;
    const ph = (u + warp) * 28;
    const f = ph - Math.floor(ph);
    // asymmetric ripple: gentle windward slope, steep lee face
    hgt[y * S + x] = f < 0.75 ? f / 0.75 : (1 - f) / 0.25;
  }
  const normal = canvasTexture(S, S, (g) => {
    const img = g.createImageData(S, S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const hx = hgt[y * S + ((x + 1) % S)] - hgt[y * S + ((x + S - 1) % S)];
      const hy = hgt[((y + 1) % S) * S + x] - hgt[((y + S - 1) % S) * S + x];
      let nx = -hx * 1.1, ny = -hy * 1.1, nz = 1;
      const l = Math.hypot(nx, ny, nz);
      const i = (y * S + x) * 4;
      img.data[i] = (nx / l * 0.5 + 0.5) * 255; img.data[i + 1] = (ny / l * 0.5 + 0.5) * 255; img.data[i + 2] = (nz / l * 0.5 + 0.5) * 255; img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  }, { linear: true });
  const color = canvasTexture(S, S, (g) => {
    g.fillStyle = '#cfae80';
    g.fillRect(0, 0, S, S);
    const img = g.getImageData(0, 0, S, S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const i = (y * S + x) * 4;
      const n = 0.93 + rng() * 0.12 + (hgt[y * S + x] - 0.5) * 0.05;
      img.data[i] *= n; img.data[i + 1] *= n; img.data[i + 2] *= n * 0.98;
    }
    g.putImageData(img, 0, 0);
    // pebbles and darker grains
    for (let i = 0; i < 900; i++) {
      g.fillStyle = `rgba(${90 + rng() * 60}, ${70 + rng() * 40}, ${50 + rng() * 30}, ${0.25 + rng() * 0.4})`;
      const r = 0.6 + rng() * 1.6;
      g.beginPath(); g.arc(rng() * S, rng() * S, r, 0, TAU); g.fill();
    }
  });
  return { color, normal };
}

/** Sandstone: warm layered rock with darker strata and weathering streaks (box-mapped by world position). */
function rockTexture() {
  const rng = mulberry32(31);
  return canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = '#b98a5c';
    g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 2) {
      const s = Math.sin(y * 0.11) * 0.55 + Math.sin(y * 0.031 + 1) * 0.45;
      for (let x = 0; x < w; x += 16) {
        const k = s + Math.sin(x * 0.05 + y * 0.02) * 0.25;
        g.fillStyle = `rgba(${k > 0 ? 215 : 95}, ${k > 0 ? 175 : 62}, ${k > 0 ? 130 : 42}, ${Math.min(0.2, Math.abs(k) * 0.14)})`;
        g.fillRect(x, y + Math.round(Math.sin(x * 0.04 + y) * 1.5), 16, 2);
      }
    }
    for (let i = 0; i < 260; i++) {
      g.fillStyle = `rgba(60, 40, 25, ${rng() * 0.12})`;
      g.fillRect(rng() * w, rng() * h, 1 + rng() * 3, 4 + rng() * 22);
    }
  });
}

function rustTexture() {
  const rng = mulberry32(55);
  return canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = '#8e5e3a';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 420; i++) {
      const c = rng() < 0.5 ? '60,34,20' : '170,110,60';
      g.fillStyle = `rgba(${c}, ${rng() * 0.18})`;
      const r = 2 + rng() * 14;
      g.beginPath(); g.arc(rng() * w, rng() * h, r, 0, TAU); g.fill();
    }
    g.strokeStyle = 'rgba(30, 18, 10, 0.55)';
    g.lineWidth = 2;
    for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(0, i * 64); g.lineTo(w, i * 64); g.stroke(); g.beginPath(); g.moveTo(i * 64, 0); g.lineTo(i * 64, h); g.stroke(); }
    for (let i = 0; i < 70; i++) {
      g.fillStyle = `rgba(50, 26, 14, ${0.1 + rng() * 0.2})`;
      g.fillRect(rng() * w, rng() * h, 1 + rng() * 2, 10 + rng() * 50);
    }
  });
}

function hullTexture() {
  const rng = mulberry32(91);
  return canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = '#b7b1a6';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 26; i++) {
      g.fillStyle = `rgba(${rng() < 0.5 ? '90,84,76' : '210,205,195'}, ${0.12 + rng() * 0.2})`;
      g.fillRect(Math.floor(rng() * 8) * 32, Math.floor(rng() * 8) * 32, 32 * (1 + Math.floor(rng() * 2)), 32);
    }
    g.strokeStyle = 'rgba(40, 36, 32, 0.6)';
    g.lineWidth = 1.5;
    for (let i = 0; i <= 8; i++) { g.beginPath(); g.moveTo(0, i * 32); g.lineTo(w, i * 32); g.stroke(); }
    for (let i = 0; i <= 8; i++) { const o = (i % 2) * 16; g.beginPath(); g.moveTo(i * 32 + o, 0); g.lineTo(i * 32 + o, h); g.stroke(); }
    for (let i = 0; i < 40; i++) {
      g.fillStyle = `rgba(70, 40, 24, ${0.08 + rng() * 0.18})`;
      g.fillRect(rng() * w, rng() * h, 1 + rng() * 3, 8 + rng() * 40);
    }
    for (let i = 0; i < 12; i++) {
      const x = rng() * w, y = rng() * h, r = 6 + rng() * 22;
      const grd = g.createRadialGradient(x, y, 0, x, y, r);
      grd.addColorStop(0, 'rgba(25, 20, 18, 0.55)'); grd.addColorStop(1, 'rgba(25, 20, 18, 0)');
      g.fillStyle = grd; g.fillRect(x - r, y - r, r * 2, r * 2);
    }
  });
}

function stuccoTexture() {
  const rng = mulberry32(7);
  return canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = '#c6b694';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 600; i++) {
      g.fillStyle = `rgba(${rng() < 0.5 ? '255,250,235' : '120,100,75'}, ${rng() * 0.09})`;
      const r = 1 + rng() * 9;
      g.beginPath(); g.arc(rng() * w, rng() * h, r, 0, TAU); g.fill();
    }
    for (let i = 0; i < 40; i++) {
      g.fillStyle = `rgba(110, 90, 60, ${rng() * 0.12})`;
      g.fillRect(rng() * w, rng() * h * 0.6, 1 + rng() * 2, 20 + rng() * 70);
    }
  });
}

// ------------------------------------------------------------------ sky
/** The binary sunset: deep blue overhead, gold and orange round the two suns, dusky mauve opposite them. */
export function makeTatooineSky(radius = 4800) {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false,
    uniforms: { sunDir: { value: TAT_SUN }, sun2Dir: { value: TAT_SUN2 }, time: { value: 0 } },
    vertexShader: /* glsl */`
      varying vec3 vDir;
      void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`
      uniform vec3 sunDir, sun2Dir; uniform float time;
      varying vec3 vDir;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
        return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y); }
      void main() {
        vec3 d = normalize(vDir);
        float h = d.y;
        float toward = dot(normalize(d.xz + vec2(1e-5)), normalize(sunDir.xz));
        vec3 zen = vec3(0.07, 0.15, 0.36);
        vec3 horSun = vec3(1.0, 0.6, 0.3), horAway = vec3(0.56, 0.45, 0.56);
        vec3 hor = mix(horAway, horSun, smoothstep(-0.4, 1.0, toward));
        vec3 col = mix(hor, zen, pow(smoothstep(-0.02, 0.62, h), 0.5));
        // a band of warm haze along the horizon
        col = mix(col, vec3(1.0, 0.72, 0.45), (1.0 - smoothstep(0.0, 0.12, abs(h - 0.02))) * 0.35 * smoothstep(-0.2, 1.0, toward));
        col = mix(col, vec3(0.6, 0.4, 0.26), smoothstep(0.02, -0.12, h));
        float s1 = max(dot(d, sunDir), 0.0), s2 = max(dot(d, sun2Dir), 0.0);
        col += vec3(1.0, 0.62, 0.3) * (pow(s1, 7.0) * 0.5 + pow(s1, 60.0) * 0.9) + vec3(1.0, 0.45, 0.2) * pow(s2, 40.0) * 0.6;
        // Tatoo I (bigger, gold-white) and Tatoo II (smaller, orange-red)
        col += vec3(1.0, 0.88, 0.62) * smoothstep(0.99955, 0.99968, s1) * 14.0;
        col += vec3(1.0, 0.5, 0.26) * smoothstep(0.99972, 0.9998, s2) * 11.0;
        // long streaks of cloud catching the low light
        float az = atan(d.x, d.z);
        float n = noise(vec2(az * 5.0, h * 26.0) + vec2(time * 0.003, 0.0)) * noise(vec2(az * 11.0 + 3.0, h * 8.0));
        vec3 cloud = mix(vec3(0.75, 0.55, 0.6), vec3(1.0, 0.68, 0.42), smoothstep(-0.3, 1.0, toward));
        col = mix(col, cloud, smoothstep(0.4, 0.68, n) * smoothstep(0.04, 0.2, h) * (1.0 - smoothstep(0.42, 0.7, h)) * 0.5);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(radius, 48, 24), mat);
  sky.renderOrder = -10;
  sky.frustumCulled = false;
  return sky;
}

// ------------------------------------------------------------------ the world
export function buildTatooine(scene, world, renderer) {
  const rng = mulberry32(3333);
  const group = new THREE.Group();
  group.name = 'Tatooine';
  group.position.set(TTX, 0, TTZ);
  scene.add(group);
  const updaters = [];
  const H = duneHeight;
  const W = (x, z) => new THREE.Vector3(TTX + x, H(x, z), TTZ + z);
  const std = (color, rough = 0.85, metal = 0.0, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...extra });
  const dark = std(0x16120e, 1);
  const glow = (r, g, b) => new THREE.MeshBasicMaterial({ color: new THREE.Color(r, g, b) });
  const add = (geo, mat, x, y, z, opts = {}) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    if (opts.rx) m.rotation.x = opts.rx;
    if (opts.ry) m.rotation.y = opts.ry;
    if (opts.rz) m.rotation.z = opts.rz;
    if (opts.s) { if (Array.isArray(opts.s)) m.scale.set(...opts.s); else m.scale.setScalar(opts.s); }
    m.castShadow = opts.cast !== false;
    m.receiveShadow = true;
    if (opts.dynamic) m.userData.dynamic = true;
    (opts.parent || group).add(m);
    return m;
  };
  const boxG = new THREE.BoxGeometry(1, 1, 1);
  const cylG = (rt, rb, h, seg = 20, open = false) => new THREE.CylinderGeometry(rt, rb, h, seg, 1, open);
  /** Collision box in arena coordinates (centre x, y, z; size). */
  const collide = (x, y, z, sx, sy, sz, opts) => world.box(TTX + x, y, TTZ + z, sx, sy, sz, opts);

  // --- ground: the dune field (with a hole cut for the homestead's courtyard), an apron round it, a far plain
  const sand = sandTextures();
  sand.color.repeat.set(SIZE / 7, SIZE / 7);
  sand.normal.repeat.set(SIZE / 7, SIZE / 7);
  const sandShade = (x, z, y, nx, ny, nz) => {
    const lit = Math.max(0, nx * TAT_SUN.x + ny * TAT_SUN.y + nz * TAT_SUN.z);
    const n = vnoise(x * 0.03, 0, z * 0.03) * 0.6 + vnoise(x * 0.11, 3, z * 0.11) * 0.4;
    const k = 0.86 + 0.1 * n + 0.05 * Math.min(1, Math.max(0, y) / 18) + 0.08 * lit;
    return [k, k * 0.96, k * 0.91];
  };
  const N = 220;
  const tGeo = new THREE.PlaneGeometry(SIZE, SIZE, N, N).rotateX(-Math.PI / 2);
  const tp = tGeo.attributes.position;
  for (let i = 0; i < tp.count; i++) tp.setY(i, Math.max(-0.4, H(tp.getX(i), tp.getZ(i))));
  tGeo.computeVertexNormals();
  {
    const nrm = tGeo.attributes.normal, col = new Float32Array(tp.count * 3);
    for (let i = 0; i < tp.count; i++) {
      const x = tp.getX(i), z = tp.getZ(i);
      col.set(sandShade(x, z, tp.getY(i), nrm.getX(i), nrm.getY(i), nrm.getZ(i)), i * 3);
    }
    tGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  }
  const sandMat = std(0xffffff, 0.96, 0, { map: sand.color, normalMap: sand.normal, normalScale: new THREE.Vector2(0.55, 0.55), vertexColors: true });
  /** A copy of mat with a round hole cut over the courtyard (world-space discard), so you can see down into it. */
  const holed = (mat, key) => {
    const m = mat.clone();
    const cx = (TTX + PIT.x).toFixed(2), cz = (TTZ + PIT.z).toFixed(2);
    m.onBeforeCompile = (sh) => {
      sh.vertexShader = 'varying vec2 vPitXZ;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vPitXZ = (modelMatrix * vec4(transformed, 1.0)).xz;');
      sh.fragmentShader = 'varying vec2 vPitXZ;\n' + sh.fragmentShader.replace('void main() {', `void main() {\n  if (distance(vPitXZ, vec2(${cx}, ${cz})) < 14.0) discard;`);
    };
    m.customProgramCacheKey = () => 'tatooine-hole-' + key;
    return m;
  };
  const terrain = add(tGeo, holed(sandMat, 'terrain'), 0, 0, 0, { cast: false, dynamic: true });
  {
    // a fine polar apron round the courtyard, drawn over the main terrain where they overlap
    const R0 = PIT.r, R1 = 23, NA = 96, NR = 16, pos = [], uv = [], col = [], idx = [];
    for (let j = 0; j <= NR; j++) for (let i = 0; i <= NA; i++) {
      const r = R0 + (R1 - R0) * (j / NR) ** 1.4, a = (i / NA) * TAU;
      const x = PIT.x + Math.cos(a) * r, z = PIT.z + Math.sin(a) * r;
      pos.push(x, Math.max(0, H(x, z)), z);
      uv.push((x + SIZE / 2) / SIZE, (SIZE / 2 - z) / SIZE);
      col.push(...sandShade(x, z, 0, 0, 1, 0));
    }
    for (let j = 0; j < NR; j++) for (let i = 0; i < NA; i++) {
      const a = j * (NA + 1) + i, b = a + NA + 1;
      idx.push(a, a + 1, b, a + 1, b + 1, b);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const apronMat = sandMat.clone();
    Object.assign(apronMat, { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 });
    add(g, apronMat, 0, 0, 0, { cast: false, dynamic: true });
  }
  const farPlain = add(new THREE.PlaneGeometry(24000, 24000).rotateX(-Math.PI / 2), holed(std(0xb98f62, 1), 'plain'), 0, -0.25, 0, { cast: false, dynamic: true });
  farPlain.renderOrder = -1;
  world.terrain = (x, z) => {
    const lx = x - TTX, lz = z - TTZ;
    return Math.abs(lx) < SIZE / 2 - 5 && Math.abs(lz) < SIZE / 2 - 5 ? H(lx, lz) : null;
  };

  // --- materials
  const rockMat = std(0xffffff, 0.92, 0, { map: rockTexture(), vertexColors: true });
  const stuccoTex = stuccoTexture();
  const stucco = std(0xffffff, 0.95, 0, { map: stuccoTex });
  const wallTex = stuccoTex.clone();
  wallTex.repeat.set(0.24, 0.24);
  wallTex.needsUpdate = true;
  const adobe = std(0xf2e6cf, 0.95, 0, { map: wallTex });
  const adobeWarm = std(0xe8cfa6, 0.95, 0, { map: wallTex });
  const stuccoDark = std(0xa8916e, 0.95);
  const metalWorn = std(0x8a8479, 0.55, 0.5);
  const metalDark = std(0x4a4640, 0.6, 0.5);
  const hullTex = hullTexture();
  hullTex.repeat.set(3, 2);
  const hullMat = std(0xffffff, 0.6, 0.45, { map: hullTex });
  const rust = std(0xffffff, 0.8, 0.35, { map: rustTexture() });
  const canvasMats = [0xbfa47c, 0x9c3a2a, 0x3d5c80, 0xd8c8a0, 0x6f7a3c].map((c) => std(c, 0.97, 0, { side: THREE.DoubleSide }));
  const canvasMat = canvasMats[0];
  const bone = std(0xe4dac6, 0.85);
  const tread = std(0x2a2622, 0.7, 0.6);
  const wood = std(0x5a4030, 0.9);

  // --- rocks: noise-displaced icosahedra with strata (vertex colour), sandstone texture box-mapped by world position
  const rockGeo = (seed, flatTop = false, detail = 2) => {
    const g = mergeVertices(new THREE.IcosahedronGeometry(1, detail).deleteAttribute('normal').deleteAttribute('uv'));
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const n = vnoise(x * 1.6 + seed, y * 1.6, z * 1.6) * 0.55 + vnoise(x * 3.7, y * 3.7 + seed, z * 3.7) * 0.25;
      const k = 0.72 + n;
      let ny = y * k;
      if (flatTop && ny > 0.55) ny = 0.55 + (ny - 0.55) * 0.12;
      if (ny < -0.2) ny = -0.2 + (ny + 0.2) * 0.4;
      p.setXYZ(i, x * k, ny, z * k);
    }
    g.computeVertexNormals();
    return g;
  };
  const rockVC = (g, sx, sy, sz, y0) => {
    const p = g.attributes.position, col = new Float32Array(p.count * 3), uv = new Float32Array(p.count * 2);
    const n = g.attributes.normal;
    for (let i = 0; i < p.count; i++) {
      const wy = y0 + p.getY(i) * sy;
      const band = 0.9 + 0.1 * Math.sin(wy * 2.6) + 0.05 * Math.sin(wy * 7.3);
      const base = 0.85 + 0.15 * Math.min(1, Math.max(0, (wy - y0 + sy * 0.2) / 1.5));
      const k = band * base;
      col[i * 3] = k; col[i * 3 + 1] = k * 0.96; col[i * 3 + 2] = k * 0.92;
      const ax = Math.abs(n.getX(i)), az = Math.abs(n.getZ(i));
      uv[i * 2] = (ax > az ? p.getZ(i) * sz : p.getX(i) * sx) * 0.25;
      uv[i * 2 + 1] = wy * 0.25;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    return g;
  };
  const rock = (x, z, sx, sy, sz, opts = {}) => {
    const y0 = opts.y0 ?? H(x, z) + (opts.lift || 0);
    const g = rockVC(rockGeo(rng() * 50, opts.flat), sx, sy, sz, y0);
    const m = add(g, rockMat, x, y0, z, { s: [sx, sy, sz], ry: opts.ry ?? rng() * TAU });
    if (opts.collide !== false) {
      const top = y0 + sy * (opts.flat ? 0.6 : 0.75);
      collide(x, (y0 - 1 + top) / 2, z, sx * 1.5, top - y0 + 1, sz * 1.5, { walk: !!opts.flat });
    }
    return m;
  };
  const pillarGeo = (seed) => {
    const g = new THREE.CylinderGeometry(0.82, 1, 1, 22, 18);
    g.translate(0, 0.5, 0);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i), a = Math.atan2(z, x);
      const ca = Math.cos(a), sa = Math.sin(a);
      const step = Math.floor(y * 4.5 + vnoise(ca * 1.2 + seed, 2, sa * 1.2) * 2.2) / 4.5;
      const ledge = 1 - 0.13 * step + 0.05 * Math.sin(step * 17 + seed);
      const k = (1 + 0.5 * (vnoise(ca * 1.4 + seed, y * 1.6, sa * 1.4) - 0.5) + 0.18 * (vnoise(ca * 4 + seed, y * 6, sa * 4) - 0.5)) * ledge;
      const top = y > 0.97 ? (vnoise(x * 3 + seed, 0, z * 3) - 0.5) * 0.12 : 0;
      p.setXYZ(i, x * k, y + top, z * k);
    }
    g.computeVertexNormals();
    return g;
  };
  const cliff = (x, z, r, h, y0 = H(x, z) - 1.5) => {
    const g = rockVC(pillarGeo(rng() * 40), r, h, r, y0);
    add(g, rockMat, x, y0, z, { s: [r, h, r * (0.7 + rng() * 0.5)], ry: rng() * TAU });
  };
  const perches = [];
  const perch = (x, y, z) => perches.push({ pos: new THREE.Vector3(TTX + x, y, TTZ + z), taken: null });

  // --- helpers for the buildings
  const hut = (x, z, r, h, doorYaw = Math.PI, mat = stucco) => {
    const y0 = H(x, z) - 0.3;
    add(cylG(r, r * 1.05, h + 0.3, 30), mat, x, y0 + (h + 0.3) / 2, z);
    const dome = add(new THREE.SphereGeometry(r, 30, 12, 0, TAU, 0, Math.PI / 2), mat, x, y0 + h + 0.3, z);
    dome.scale.y = 0.72;
    add(new THREE.TorusGeometry(r * 1.005, 0.13, 6, 36), stuccoDark, x, y0 + h + 0.3, z, { rx: Math.PI / 2 });
    const dx = Math.sin(doorYaw), dz = Math.cos(doorYaw);
    const door = new THREE.Group();
    door.position.set(x + dx * (r - 0.05), y0 + 0.3, z + dz * (r - 0.05));
    door.rotation.y = doorYaw;
    group.add(door);
    add(boxG, stuccoDark, 0, 1.2, 0.18, { s: [2.0, 2.6, 0.6], parent: door });
    add(boxG, dark, 0, 1.1, 0.42, { s: [1.3, 2.2, 0.2], parent: door, cast: false });
    for (const a of [doorYaw + 1.3, doorYaw - 1.4, doorYaw + 2.6]) {
      add(new THREE.CircleGeometry(0.32, 16), dark, x + Math.sin(a) * (r + 0.02), y0 + h * 0.7, z + Math.cos(a) * (r + 0.02), { ry: a, cast: false });
    }
    add(cylG(0.18, 0.22, 0.9, 10), metalWorn, x + r * 0.3, y0 + h + 0.3 + r * 0.62, z - r * 0.2);
    add(cylG(0.25, 0.25, 0.1, 10), metalDark, x + r * 0.3, y0 + h + 0.3 + r * 0.62 + 0.48, z - r * 0.2);
    collide(x, y0 + (h + r * 0.72) / 2, z, r * 1.72, h + r * 0.72 + 0.3, r * 1.72);
  };
  /** Rounded adobe block (Mos Espa style): soft corners and bevelled edges. */
  const adobeGeo = (w, d, h, r = 0.9) => {
    const s = new THREE.Shape(), x0 = -w / 2, y0 = -d / 2;
    r = Math.min(r, w / 2 - 0.05, d / 2 - 0.05);
    s.moveTo(x0 + r, y0); s.lineTo(x0 + w - r, y0); s.quadraticCurveTo(x0 + w, y0, x0 + w, y0 + r);
    s.lineTo(x0 + w, y0 + d - r); s.quadraticCurveTo(x0 + w, y0 + d, x0 + w - r, y0 + d);
    s.lineTo(x0 + r, y0 + d); s.quadraticCurveTo(x0, y0 + d, x0, y0 + d - r);
    s.lineTo(x0, y0 + r); s.quadraticCurveTo(x0, y0, x0 + r, y0);
    const g = new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: true, bevelThickness: 0.22, bevelSize: 0.22, bevelSegments: 2, curveSegments: 4 });
    g.rotateX(-Math.PI / 2);
    return g;
  };
  const SIDES = { n: [0, -1, Math.PI], s: [0, 1, 0], e: [1, 0, Math.PI / 2], w: [-1, 0, -Math.PI / 2] };
  /** A flat-roofed village building: door and windows on one face, optional dome, optional stair up to the roof. */
  const building = (x, z, w, d, h, opts = {}) => {
    const y0 = H(x, z) - 0.25;
    const mat = opts.warm ? adobeWarm : adobe;
    add(adobeGeo(w, d, h), mat, x, y0 + 0.22, z);
    const top = y0 + h + 0.44;
    // a low parapet round the roof (you step up over it from the stair)
    for (const [px, pz, bx, bz] of [[0, -d / 2 + 0.3, w - 1.2, 0.4], [0, d / 2 - 0.3, w - 1.2, 0.4], [-w / 2 + 0.3, 0, 0.4, d - 1.2], [w / 2 - 0.3, 0, 0.4, d - 1.2]]) {
      add(boxG, mat, x + px, top + 0.2, z + pz, { s: [bx, 0.42, bz] });
      collide(x + px, top + 0.2, z + pz, bx, 0.42, bz);
    }
    // the street-facing door, windows and a band of trim
    const [fx, fz, fy] = SIDES[opts.door || 'e'];
    const half = fx ? w / 2 : d / 2, span = fx ? d : w;
    const face = new THREE.Group();
    face.position.set(x + fx * (half + 0.22), y0, z + fz * (half + 0.22));
    face.rotation.y = fy;
    group.add(face);
    add(boxG, stuccoDark, 0, 1.35, 0.05, { s: [2.2, 2.9, 0.3], parent: face });
    add(boxG, dark, 0, 1.25, 0.15, { s: [1.5, 2.5, 0.12], parent: face, cast: false });
    add(cylG(0.75, 0.75, 0.12, 16, false), dark, 0, 2.5, 0.15, { rx: Math.PI / 2, parent: face, cast: false, s: [1, 1, 1] });
    for (const o of [-1, 1]) if (span > 6) {
      add(new THREE.CircleGeometry(0.42, 14), dark, o * span * 0.3, h * 0.62, 0.23, { parent: face, cast: false });
      add(new THREE.TorusGeometry(0.46, 0.08, 6, 16), stuccoDark, o * span * 0.3, h * 0.62, 0.22, { parent: face });
    }
    add(boxG, stuccoDark, 0, h - 0.4, 0.12, { s: [span - 1.4, 0.18, 0.25], parent: face });
    if (opts.awning) {
      const aw = add(new THREE.PlaneGeometry(span * 0.55, 2.2), canvasMats[opts.awning], 0, 3.0, 1.1, { rx: -1.1, parent: face });
      aw.material.side = THREE.DoubleSide;
      for (const o of [-1, 1]) add(cylG(0.05, 0.05, 3.0, 6), wood, o * span * 0.27, 1.5, 2.0, { parent: face });
    }
    if (opts.dome) {
      const dr = Math.min(w, d) * 0.3;
      const dm = add(new THREE.SphereGeometry(dr, 24, 10, 0, TAU, 0, Math.PI / 2), mat, x + (opts.domeX || 0), top - 0.1, z + (opts.domeZ || 0));
      dm.scale.y = 0.8;
      add(new THREE.TorusGeometry(dr, 0.1, 6, 28), stuccoDark, x + (opts.domeX || 0), top - 0.05, z + (opts.domeZ || 0), { rx: Math.PI / 2 });
    }
    // roof clutter: vents, a water tank, an antenna
    add(cylG(0.3, 0.3, 0.7, 10), metalWorn, x - w * 0.25, top + 0.3, z + d * 0.22);
    if (opts.tank) add(cylG(0.8, 0.8, 1.4, 14), metalWorn, x + w * 0.22, top + 0.7, z - d * 0.2);
    collide(x, (y0 + top) / 2, z, w + 0.4, top - y0, d + 0.4);
    // an outside stair up to the roof, against one wall
    if (opts.stairs) {
      const [sx, sz] = SIDES[opts.stairs];
      const n = Math.ceil((top - y0 - 0.1) / 0.42), run = 0.62, dir = opts.stairDir || 1;
      for (let i = 0; i < n; i++) {
        const hy = Math.min(top - y0, (i + 1) * ((top - y0) / n));
        let px, pz, bx, bz;
        if (sx) { px = x + sx * (w / 2 + 0.95); pz = z - dir * (d / 2 - 0.5 - i * run); bx = 1.5; bz = run + 0.02; }
        else { pz = z + sz * (d / 2 + 0.95); px = x - dir * (w / 2 - 0.5 - i * run); bx = run + 0.02; bz = 1.5; }
        add(boxG, mat, px, y0 + hy / 2, pz, { s: [bx, hy, bz] });
        collide(px, y0 + hy / 2, pz, bx, hy, bz);
      }
    }
    if (opts.perch) perch(x + (opts.perchX || 0), top, z + (opts.perchZ || 0));
    return top;
  };
  const vaporator = (x, z, h = 5.6) => {
    const y0 = H(x, z);
    add(cylG(0.42, 0.5, 0.7, 12), metalWorn, x, y0 + 0.35, z);
    add(cylG(0.1, 0.14, h, 10), metalWorn, x, y0 + h / 2 + 0.3, z);
    for (let y = 1.1; y < h - 0.6; y += 0.85) add(cylG(0.2, 0.2, 0.1, 12), metalDark, x, y0 + y, z);
    add(cylG(0.26, 0.2, 0.5, 12), metalWorn, x, y0 + h + 0.2, z);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * TAU + x;
      add(boxG, metalWorn, x + Math.cos(a) * 0.4, y0 + h - 0.1, z + Math.sin(a) * 0.4, { s: [0.7, 0.9, 0.05], ry: -a });
    }
    add(new THREE.SphereGeometry(0.06, 8, 6), glow(1.6, 0.5, 0.2), x, y0 + h + 0.5, z, { cast: false });
    collide(x, y0 + h / 2, z, 0.8, h, 0.8);
  };
  const wall = (x, z, len, yaw = 0, mat = stucco) => {
    const y0 = H(x, z);
    add(boxG, mat, x, y0 + 0.5, z, { s: [len, 1.15, 0.55], ry: yaw });
    add(boxG, stuccoDark, x, y0 + 1.1, z, { s: [len + 0.1, 0.12, 0.65], ry: yaw });
    const c = Math.abs(Math.cos(yaw)), s = Math.abs(Math.sin(yaw));
    collide(x, y0 + 0.55, z, len * c + 0.55 * s, 1.15, len * s + 0.55 * c);
  };
  const crate = (x, z, s = 1.2, ry = rng() * 3) => {
    const g = propObject('Crate', { CrateGrey: '#8a7b63', CrateDark: '#5a4c3c' });
    if (!g) return;
    g.position.set(x, H(x, z), z);
    g.rotation.y = ry;
    g.scale.setScalar(s);
    g.traverse((o) => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; } });
    group.add(g);
    collide(x, H(x, z) + s * 0.5, z, s, s, s);
  };
  const drum = (x, z) => {
    const y0 = H(x, z);
    add(cylG(0.42, 0.42, 1.05, 14), rust, x, y0 + 0.52, z);
    add(cylG(0.44, 0.44, 0.06, 14), metalDark, x, y0 + 0.8, z);
    collide(x, y0 + 0.52, z, 0.84, 1.05, 0.84);
  };
  const jarMats = [std(0x9a5a34, 0.8), std(0x6e7e8c, 0.6, 0.3), std(0xc7a46a, 0.8)];
  /** A market stall: four poles, a canvas awning, a counter of jars and goods. */
  const stall = (x, z, yaw, cm) => {
    const g = new THREE.Group();
    g.position.set(x, H(x, z), z);
    g.rotation.y = yaw;
    group.add(g);
    for (const [px, pz, ph] of [[-1.4, -0.9, 2.6], [1.4, -0.9, 2.6], [-1.4, 0.9, 2.2], [1.4, 0.9, 2.2]]) add(cylG(0.05, 0.05, ph, 6), wood, px, ph / 2, pz, { parent: g });
    add(new THREE.PlaneGeometry(3.2, 2.2, 1, 1), canvasMats[cm], 0, 2.45, 0, { rx: -Math.PI / 2 + 0.18, parent: g });
    add(boxG, wood, 0, 0.45, -0.3, { s: [2.6, 0.9, 0.9], parent: g });
    for (let i = 0; i < 6; i++) {
      const m = jarMats[i % 3];
      add(i % 2 ? new THREE.SphereGeometry(0.17, 10, 8) : cylG(0.12, 0.16, 0.36, 10), m, -1.05 + i * 0.42, 1.08, -0.3 + (i % 2 ? 0.12 : -0.15), { parent: g });
    }
    const c = Math.abs(Math.cos(yaw)), s = Math.abs(Math.sin(yaw));
    collide(x - Math.sin(yaw) * 0.3, H(x, z) + 0.45, z - Math.cos(yaw) * 0.3, 2.6 * c + 0.9 * s, 0.9, 2.6 * s + 0.9 * c);
  };
  /** Cloth strung across the street between two roofs, sagging in the middle. */
  const clothLine = (x0, x1, z, y, cm) => {
    const len = Math.abs(x1 - x0), n = 12;
    const geo = new THREE.PlaneGeometry(len, 1.1, n, 1);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) { const t = p.getX(i) / len + 0.5; p.setY(i, p.getY(i) - Math.sin(t * Math.PI) * 1.1); }
    geo.computeVertexNormals();
    const m = add(geo, canvasMats[cm], (x0 + x1) / 2, y, z, { cast: true });
    m.material.side = THREE.DoubleSide;
  };

  // ================================================================== south: the homestead
  // the entrance dome, the sunken courtyard beside it, outbuildings, vaporators
  hut(-2, 30, 4.2, 2.4, Math.PI, stucco);
  {
    // a short vaulted porch in front of the entrance dome's door
    const y0 = H(-2, 25) - 0.2;
    add(cylG(1.6, 1.6, 2.4, 16, false), stucco, -2, y0 + 1.0, 24.6, { rx: Math.PI / 2, s: [1, 1, 0.95] });
    add(boxG, dark, -2, y0 + 1.0, 23.38, { s: [1.5, 1.9, 0.1], cast: false });
    for (const [vx, vz] of [[2.5, 33], [-6.5, 33.5]]) {
      add(new THREE.SphereGeometry(0.9, 14, 8, 0, TAU, 0, Math.PI / 2), stucco, vx, H(vx, vz) - 0.1, vz);
      add(cylG(0.18, 0.18, 0.9, 8), metalWorn, vx, H(vx, vz) + 0.9, vz);
    }
  }
  {
    // the courtyard: a round pit with arched doorways into the rooms dug round it, a low parapet at the rim
    const { x: cx, z: cz, r, depth } = PIT;
    const pitWall = add(cylG(r, r, depth + 0.3, 60, true), stucco, cx, -depth / 2 + 0.1, cz, { cast: false, dynamic: true });
    pitWall.material = stucco.clone();
    pitWall.material.side = THREE.BackSide;
    pitWall.material.emissive = new THREE.Color(0x3a2616);
    add(new THREE.CircleGeometry(r, 48), std(0xb59670, 0.95), cx, -depth + 0.01, cz, { rx: -Math.PI / 2, cast: false });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + 0.3;
      const g = new THREE.Group();
      g.position.set(cx + Math.cos(a) * (r - 0.02), -depth, cz + Math.sin(a) * (r - 0.02));
      g.rotation.y = -a - Math.PI / 2;
      group.add(g);
      add(boxG, dark, 0, 1.2, 0.06, { s: [1.6, 2.4, 0.06], parent: g, cast: false });
      add(new THREE.CircleGeometry(0.8, 16, 0, Math.PI), dark, 0, 2.4, 0.07, { parent: g, cast: false });
      add(new THREE.TorusGeometry(0.88, 0.1, 6, 16, Math.PI), stuccoDark, 0, 2.4, 0.08, { parent: g });
      add(boxG, stuccoDark, -0.95, 1.2, 0.08, { s: [0.2, 2.4, 0.12], parent: g });
      add(boxG, stuccoDark, 0.95, 1.2, 0.08, { s: [0.2, 2.4, 0.12], parent: g });
    }
    // stairs cut down one side, crates and a vaporator on the courtyard floor
    for (let i = 0; i < 9; i++) {
      const a = 3.6 + i * 0.09, rr = r - 0.7;
      add(boxG, stuccoDark, cx + Math.cos(a) * rr, -0.55 - i * 0.55, cz + Math.sin(a) * rr, { s: [1.2, 0.3, 1.0], ry: -a });
    }
    for (const [ox, oz, s] of [[2.2, -1.5, 1.0], [2.9, -0.4, 0.8], [-2.6, 2.4, 1.0]]) add(boxG, std(0x7a6a52, 0.8), cx + ox, -depth + s / 2, cz + oz, { s: [s, s, s], ry: ox });
    add(cylG(0.9, 0.9, 1.8, 16), metalWorn, cx - 3.2, -depth + 0.9, cz - 2.6);
    add(cylG(0.1, 0.13, 4.2, 8), metalWorn, cx + 0.6, -depth + 2.1, cz + 3.4);
    add(new THREE.TorusGeometry(r + 0.12, 0.22, 8, 72), stuccoDark, cx, 0.05, cz, { rx: Math.PI / 2 });
    // the parapet: low enough to shoot over, high enough to crouch behind
    const pr = r + 0.55;
    add(cylG(pr, pr, 0.95, 72, true), stucco, cx, 0.42, cz).material = (() => { const m = stucco.clone(); m.side = THREE.DoubleSide; return m; })();
    add(new THREE.TorusGeometry(pr, 0.2, 6, 72), stucco, cx, 0.92, cz, { rx: Math.PI / 2 });
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * TAU, L = (TAU * pr) / 18 + 0.4;
      const bx = cx + Math.cos(a) * pr, bz = cz + Math.sin(a) * pr;
      const c = Math.abs(Math.sin(a)), s = Math.abs(Math.cos(a));
      collide(bx, 0.48, bz, L * c + 0.5 * s, 0.96, L * s + 0.5 * c);
    }
    // skylight domes round the rim (rooms below), pipes and a moisture tank
    for (const a of [1.3, 2.4, 4.9]) {
      const sx = cx + Math.cos(a) * (r + 3.4), sz = cz + Math.sin(a) * (r + 3.4);
      add(new THREE.SphereGeometry(1.2, 16, 8, 0, TAU, 0, Math.PI / 2), stucco, sx, H(sx, sz) - 0.1, sz, { s: [1, 0.7, 1] });
      collide(sx, H(sx, sz) + 0.4, sz, 2, 0.8, 2);
    }
    add(cylG(1.1, 1.1, 2.6, 16), metalWorn, cx + 10.5, 1.3, cz + 2);
    add(cylG(1.15, 1.15, 0.12, 16), metalDark, cx + 10.5, 2.6, cz + 2);
    collide(cx + 10.5, 1.3, cz + 2, 2.2, 2.6, 2.2);
  }
  // a vaulted garage and a lean-to workshop
  {
    const x = -18, z = 43, y0 = H(x, z) - 0.2;
    add(boxG, stucco, x, y0 + 1.6, z, { s: [8, 3.2, 6.5] });
    add(cylG(3.25, 3.25, 8, 24, false), stucco, x, y0 + 3.2, z, { rz: Math.PI / 2, s: [1, 1, 0.55] });
    add(boxG, dark, x + 4.02, y0 + 1.5, z, { s: [0.1, 2.6, 4.2], cast: false });
    add(boxG, stuccoDark, x + 4.1, y0 + 3.0, z, { s: [0.3, 0.3, 4.8] });
    collide(x, y0 + 2.2, z, 8, 4.4, 6.5);
  }
  wall(-9, 21.5, 6, 0.15); wall(5, 18.5, 5, -0.2); wall(-14, 30, 5, 1.4); wall(30, 34, 5, 1.2); wall(28, 20, 4, 0.5);
  for (const [x, z, h] of [[-12, 18, 5.8], [31, 14, 5.4], [6, 9, 6], [-27, 54, 5.6], [34, 46, 5.2], [26, -3, 5.0], [-20, 4, 5.6], [8, -48, 5.4], [-28, 22, 5.6]]) vaporator(x, z, h);
  for (const [x, z, s] of [[-11, -2, 1.3], [-9.6, -2.6, 1.1], [12, 5, 1.3], [13.2, 6.3, 1.1], [2, -14, 1.2], [-16, 10, 1.2], [24, 8, 1.3], [-4, 14, 1.1]]) crate(x, z, s);
  for (const [x, z] of [[8, 13], [-7, 16.5], [-22, -12], [29, -26], [-3, -40], [-12, 50], [36, 28]]) drum(x, z);
  // an old landspeeder by the entrance dome
  {
    const x = -10, z = 26, y0 = H(x, z) + 0.55;
    const ls = new THREE.Group();
    ls.position.set(x, y0, z);
    ls.rotation.y = 0.8;
    group.add(ls);
    const paint = std(0xa45a36, 0.6, 0.3);
    add(new THREE.CapsuleGeometry(0.85, 2.8, 4, 12), paint, 0, 0.25, 0, { rx: Math.PI / 2, s: [1.15, 1, 0.45], parent: ls });
    add(boxG, std(0x3a2e26, 0.7), 0, 0.55, 0.2, { s: [1.5, 0.3, 1.4], parent: ls });
    add(new THREE.SphereGeometry(0.55, 14, 8, 0, TAU, 0, Math.PI / 2), std(0x223038, 0.15, 0.4), 0, 0.5, -0.9, { s: [1.3, 0.6, 1], parent: ls });
    for (const [ex, ez] of [[-0.75, 1.9], [0.75, 1.9], [0, 2.2]]) {
      add(cylG(0.28, 0.32, 1.4, 12), metalWorn, ex, 0.5 + (ex === 0 ? 0.4 : 0), ez, { rx: Math.PI / 2, parent: ls });
      add(new THREE.CircleGeometry(0.24, 12), dark, ex, 0.5 + (ex === 0 ? 0.4 : 0), ez + 0.71, { parent: ls, cast: false });
    }
    collide(x, y0, z, 3.2, 1.3, 3.6);
  }
  // the Republic landing zone: the LAAT/i that brought you, barricades, supply crates
  const laat = buildLAAT({ bay: true });
  laat.position.set(20, H(20, 58), 58);
  laat.rotation.y = Math.PI * 1.06;
  laat.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  group.add(laat);
  laat.userData.dynamic = true;
  collide(20, H(20, 58) + 2, 58, 6, 4, 14);
  collide(20, H(20, 58) + 3, 59.5, 16, 0.8, 4, { walk: false });
  for (const [x, z, ry] of [[4, 44, 0], [-6, 45, 0.15], [12, 45, -0.1]]) {
    const b = propObject('Barricade');
    if (b) { b.position.set(x, H(x, z), z); b.rotation.y = ry; b.traverse((o) => { if (o.isMesh) o.castShadow = o.receiveShadow = true; }); group.add(b); }
    collide(x, H(x, z) + 0.6, z, 4, 1.2, 0.6);
  }
  for (const [x, z, s] of [[8, 54, 1.2], [9.3, 55, 1.0], [-4, 58, 1.2], [30, 50, 1.2]]) crate(x, z, s);

  // ================================================================== west: the outpost village
  const SX = -50; // the street runs north-south along x = -50
  building(-63, -34, 11, 10, 4.6, { door: 'e', stairs: 'n', stairDir: -1, perch: true, perchX: -1, awning: 1 });
  building(-36, -36, 9, 9, 5.0, { door: 'w', dome: true, warm: true });
  building(-36, -20, 9, 11, 4.2, { door: 'w', stairs: 's', stairDir: 1, perch: true, tank: true, awning: 2 });
  building(-36, -2, 10, 9, 6.2, { door: 'w', dome: true, domeX: 1.5, warm: true });
  building(-63, 10, 11, 12, 5.4, { door: 'e', dome: true, domeZ: -2, tank: true, awning: 3 });
  building(-36, 16, 9, 12, 4.6, { door: 'w', stairs: 'n', stairDir: 1, perch: true, perchZ: 1 });
  building(-63, 27, 10, 8, 4.0, { door: 'e', warm: true });
  building(-36, 30, 8, 7, 3.6, { door: 'w' });
  {
    // the cantina: a broad round hall under a great dome, with a smaller dome beside it
    const x = -64, z = -12, R = 8.2, h = 4.0, y0 = H(x, z) - 0.25;
    add(cylG(R, R * 1.04, h + 0.25, 40), adobe, x, y0 + (h + 0.25) / 2, z);
    const dm = add(new THREE.SphereGeometry(R * 0.98, 40, 14, 0, TAU, 0, Math.PI / 2), adobe, x, y0 + h + 0.2, z);
    dm.scale.y = 0.52;
    add(new THREE.TorusGeometry(R * 1.0, 0.18, 6, 48), stuccoDark, x, y0 + h + 0.25, z, { rx: Math.PI / 2 });
    const d2 = add(new THREE.SphereGeometry(2.6, 20, 8, 0, TAU, 0, Math.PI / 2), adobeWarm, x - 3, y0 + h + 3.2, z + 3);
    d2.scale.y = 0.75;
    add(cylG(2.6, 2.6, 0.9, 20), adobeWarm, x - 3, y0 + h + 2.8, z + 3);
    // the entrance portal facing the street
    add(adobeGeo(3.6, 2.6, 4.2, 0.5), adobeWarm, x + R + 0.2, y0, z);
    add(boxG, dark, x + R + 1.52, y0 + 1.4, z, { s: [0.1, 2.6, 1.8], cast: false });
    add(cylG(0.9, 0.9, 0.1, 16), dark, x + R + 1.53, y0 + 2.7, z, { rz: Math.PI / 2, cast: false });
    for (const a of [0.9, -0.9, 2.2, -2.2]) add(new THREE.CircleGeometry(0.45, 14), dark, x + Math.cos(a) * (R + 0.04), y0 + 2.6, z + Math.sin(a) * (R + 0.04), { ry: -a + Math.PI / 2, cast: false });
    collide(x, y0 + h / 2 + 0.2, z, R * 1.75, h + 0.4, R * 1.2);
    collide(x, y0 + h / 2 + 0.2, z, R * 1.2, h + 0.4, R * 1.75);
    collide(x + R + 0.6, y0 + 2.1, z, 3, 4.2, 2.8);
  }
  // archways over the north and south ends of the street
  for (const az of [-46, 36]) {
    const y0 = H(SX, az) - 0.2;
    for (const o of [-1, 1]) {
      add(adobeGeo(2.2, 2.2, 6, 0.4), adobeWarm, SX + o * 7, y0, az);
      collide(SX + o * 7, y0 + 3, az, 2.6, 6, 2.6);
    }
    add(adobeGeo(16.4, 1.8, 1.3, 0.4), adobeWarm, SX, y0 + 5.2, az);
    add(new THREE.TorusGeometry(5.2, 0.35, 8, 24, Math.PI), adobeWarm, SX, y0 + 0.6, az, { cast: true });
  }
  // stalls down the street, cloth strung between the roofs
  [[SX + 4.5, -27, -Math.PI / 2, 1], [SX - 4.5, -16, Math.PI / 2, 2], [SX + 4.5, -6, -Math.PI / 2, 3], [SX - 4.5, 3, Math.PI / 2, 4], [SX + 4.5, 10, -Math.PI / 2, 2], [SX - 4.5, 21, Math.PI / 2, 1]].forEach(([x, z, y, c]) => stall(x, z, y, c));
  clothLine(-57.5, -40.5, -27, 5.6, 1); clothLine(-57.5, -40.5, -8, 6.0, 3); clothLine(-57.5, -40.5, 13, 5.5, 2); clothLine(-57.5, -40.5, 22, 5.2, 4);
  for (const [x, z] of [[SX + 1.5, -36], [SX - 2, 28], [SX + 2.5, 18]]) crate(x, z, 1.1);
  for (const [x, z] of [[SX - 6, -40], [SX + 6.5, 0], [SX - 6.5, 15]]) drum(x, z);
  vaporator(-44, -48, 5.4); vaporator(-70, 40, 5.0);

  // ================================================================== the middle: dunes, the krayt dragon skeleton, a crashed freighter
  for (const [x, z, sx, sy, sz] of [[-18, -18, 3.0, 2.0, 2.4], [-15, -20.5, 1.6, 1.3, 1.5], [-22, -50, 2.4, 1.8, 2.2], [14, -60, 2.6, 2.0, 2.4], [36, -48, 2.2, 1.6, 2.0], [-30, -62, 2.0, 1.5, 1.8], [4, -26, 1.8, 1.3, 1.6]]) {
    rock(x, z, sx, sy, sz);
  }
  {
    const x0 = -8, z0 = -36, y0 = H(x0, z0) - 0.6;
    const spine = [];
    for (let i = 0; i <= 14; i++) {
      const t = i / 14;
      spine.push(new THREE.Vector3(x0 + t * 22 - 2, y0 + 1.2 + Math.sin(t * Math.PI) * 1.6, z0 + Math.sin(t * 3) * 3));
    }
    const curve = new THREE.CatmullRomCurve3(spine);
    add(new THREE.TubeGeometry(curve, 40, 0.42, 8), bone, 0, 0, 0);
    for (let i = 2; i < 13; i++) {
      const p = curve.getPoint(i / 14), tan = curve.getTangent(i / 14);
      const side = new THREE.Vector3(-tan.z, 0, tan.x).normalize();
      for (const s of [1, -1]) {
        const pts = [];
        const L = 3.2 + Math.sin((i / 14) * Math.PI) * 1.8;
        for (let k = 0; k <= 6; k++) {
          const a = (k / 6) * 1.9;
          pts.push(p.clone().addScaledVector(side, s * Math.sin(a) * L * 0.75).add(new THREE.Vector3(0, Math.cos(a) * L * 0.45 - L * 0.42, 0)));
        }
        add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 10, 0.13, 6), bone, 0, 0, 0);
      }
    }
    add(new THREE.SphereGeometry(1, 16, 10), bone, x0 - 4.2, y0 + 1.4, z0 - 0.8, { s: [2.6, 1.3, 1.5], ry: 0.3 });
    add(new THREE.SphereGeometry(0.35, 10, 8), dark, x0 - 4.0, y0 + 2.0, z0 - 2.0, { cast: false });
    add(boxG, bone, x0 - 5.6, y0 + 0.6, z0 - 1.2, { s: [3.2, 0.5, 1.2], ry: 0.4, rz: -0.12 });
    collide(x0 - 4.3, y0 + 1.3, z0 - 0.9, 5, 2.6, 3);
    collide(x0 + 8, y0 + 1.6, z0 + 1, 14, 2.0, 2.0, { move: true, walk: false });
  }
  {
    // a freighter that came down hard years ago: a long hull, half buried, ribs showing where it broke open
    const x0 = 22, z0 = -18, yaw = 0.55, y0 = H(x0, z0) - 0.9;
    const fr = new THREE.Group();
    fr.position.set(x0, y0, z0);
    fr.rotation.set(0, yaw, 0.08);
    group.add(fr);
    const F = (g, m, px, py, pz, o = {}) => add(g, m, px, py, pz, { ...o, parent: fr });
    F(new THREE.CapsuleGeometry(3.1, 9, 6, 18), hullMat, 0, 2.1, 3.5, { rx: Math.PI / 2, s: [1.15, 1, 0.7] });
    F(new THREE.CapsuleGeometry(3.0, 4, 6, 18), rust, 0.4, 1.7, -8.5, { rx: Math.PI / 2 + 0.1, rz: 0.2, s: [1.1, 1, 0.66] });
    for (let i = 0; i < 5; i++) F(new THREE.TorusGeometry(3.15, 0.14, 6, 24, Math.PI * 1.2), metalDark, 0, 2.0, -2.6 - i * 0.9, { rz: -0.1 * Math.PI });
    F(new THREE.SphereGeometry(1.5, 16, 10), std(0x20282e, 0.2, 0.4), 0, 2.6, 11.6, { s: [1.2, 0.8, 1] });
    F(boxG, hullMat, 0, 4.25, 3, { s: [1.4, 0.6, 9] });
    F(boxG, hullMat, 0, 5.0, -1.2, { s: [0.25, 1.8, 2.6], rx: -0.4 });
    F(new THREE.SphereGeometry(1.6, 12, 8), dark, 2.6, 2.4, 1.0, { s: [0.5, 1, 1.4], cast: false });
    F(boxG, metalDark, 3.25, 2.4, 1.0, { s: [0.15, 2.4, 3.4] });
    for (let i = 0; i < 4; i++) F(boxG, rust, 0, 1.2 + i * 0.9, 9 - i * 0.35, { s: [6.4 - i * 0.6, 0.18, 0.5] });
    for (const sx of [-1, 1]) {
      F(cylG(1.1, 1.3, 4.5, 14), metalWorn, sx * 4.2, 1.6, -4 + (sx > 0 ? 0 : 1.2), { rx: Math.PI / 2 + (sx > 0 ? 0.2 : -0.1), rz: sx * 0.3 });
      F(new THREE.CircleGeometry(0.9, 12), dark, sx * 4.2, 1.6, -6.3, { cast: false });
    }
    for (let i = 0; i < 7; i++) add(boxG, i % 2 ? hullMat : rust, x0 - 6 + rng() * 14, H(x0, z0) + 0.15, z0 - 12 + rng() * 10, { s: [0.8 + rng() * 1.6, 0.12, 0.6 + rng() * 1.2], ry: rng() * 3, rz: rng() * 0.3 });
    const c = Math.cos(yaw), s = Math.sin(yaw);
    for (const lz of [-8, -2.5, 3, 8.5]) {
      const bx = x0 + s * lz, bz = z0 + c * lz;
      collide(bx, y0 + 2.1, bz, 6.4, 4.2, 6.4);
    }
    perch(x0 + s * 3, y0 + 4.2, z0 + c * 3);
  }

  // ================================================================== east: the rock shelf
  {
    const top = SHELF.h;
    // cliff faces along the shelf's west edge (either side of the ramp) and its ends
    const edgeRock = (x, z, rx, rz, h) => {
      const g = rockVC(pillarGeo(rng() * 40), rx, h, rz, -1.2);
      add(g, rockMat, x, -1.2, z, { s: [rx, h, rz], ry: (rng() - 0.5) * 0.5 });
    };
    for (let z = SHELF.z0 + 1; z <= SHELF.z1 - 1; z += 2.7) {
      if (Math.abs(z) < 9.5) continue;
      edgeRock(SHELF.x0 - 0.2 + rng() * 0.5, z, 2.0 + rng() * 0.5, 2.6 + rng() * 0.7, top + 1.6 + rng() * 0.9);
    }
    for (let x = SHELF.x0 + 1; x <= 78; x += 2.8) { edgeRock(x, SHELF.z0 - 0.4, 2.6, 2.0, top + 1.6 + rng()); edgeRock(x, SHELF.z1 + 0.4, 2.6, 2.0, top + 1.6 + rng()); }
    collide(SHELF.x0 - 0.6, (top - 0.3) / 2 - 0.5, (SHELF.z0 - 9.5) / 2, 4.2, top + 0.7, -9.5 - SHELF.z0);
    collide(SHELF.x0 - 0.6, (top - 0.3) / 2 - 0.5, (SHELF.z1 + 9.5) / 2, 4.2, top + 0.7, SHELF.z1 - 9.5);
    collide((SHELF.x0 + 78) / 2, (top - 0.3) / 2 - 0.5, SHELF.z0 - 0.6, 78 - SHELF.x0, top + 0.7, 4.2);
    collide((SHELF.x0 + 78) / 2, (top - 0.3) / 2 - 0.5, SHELF.z1 + 0.6, 78 - SHELF.x0, top + 0.7, 4.2);
    // boulders on top, low cairns either side of the ramp, sniper pillars along the back
    for (const [x, z, sx, sy, sz] of [[54, -38, 2.6, 2.0, 2.4], [58, -8, 2.2, 1.6, 2.0], [55, 20, 2.6, 1.9, 2.3], [66, 4, 1.8, 1.4, 1.7]]) rock(x, z, sx, sy, sz);
    for (const z of [-8.5, 8.5]) rock(38, z, 1.6, 1.4, 1.6);
    for (const [x, z, h] of [[67, -40, 3.2], [70, -18, 3.4], [66, 22, 3.0]]) {
      const y0 = H(x, z);
      rock(x, z, 2.4, h / 0.6, 2.4, { flat: true, collide: false, y0 });
      collide(x, y0 + h / 2, z, 3.2, h, 3.2, { walk: true });
      perch(x, y0 + h, z);
    }
    vaporator(56, -26, 5.4); vaporator(62, 30, 5.0);
  }
  // a lone rock pillar at the north edge, and the boundary buttes
  {
    const x = -2, z = -64, h = 3.6, y0 = H(x, z);
    rock(x, z, 2.4, h / 0.6, 2.4, { flat: true, collide: false, y0 });
    collide(x, y0 + h / 2, z, 3.2, h, 3.2, { walk: true });
    perch(x, y0 + h, z);
  }
  for (let i = 0; i < 12; i++) cliff(-86 - rng() * 8, -78 + i * 14 + rng() * 5, 8 + rng() * 6, 12 + rng() * 14);
  for (let i = 0; i < 12; i++) cliff(88 + rng() * 8, -78 + i * 14 + rng() * 5, 8 + rng() * 6, 14 + rng() * 14);
  for (let i = 0; i < 9; i++) cliff(-78 + i * 20 + rng() * 6, 82 + rng() * 8, 8 + rng() * 6, 10 + rng() * 10);
  for (let i = 0; i < 9; i++) {
    const x = -70 + i * 17 + rng() * 6;
    if (x > -28 && x < 14) continue; // keep a gap: the farm looks out over the northern dunes
    if (x > 16 && x < 56) continue; // the sandcrawler stands there
    rock(x, -86 - rng() * 6, 5 + rng() * 4, 5 + rng() * 6, 5 + rng() * 3, { collide: false, lift: -1.5 });
  }

  // ================================================================== north: the Tusken camp and its banthas
  const fire = new THREE.Vector3();
  {
    const cx = -46, cz = -94;
    for (const [x, z, r] of [[cx, cz, 2.6], [cx - 7, cz + 4, 2.2], [cx + 7, cz - 2, 2.4], [cx + 2, cz + 9, 2.0], [cx - 3, cz - 8, 2.3]]) {
      const y0 = H(x, z);
      add(new THREE.ConeGeometry(r, r * 1.25, 7, 1, true), canvasMat, x, y0 + r * 0.6, z, { ry: rng() * 3 });
      for (let k = 0; k < 3; k++) add(cylG(0.04, 0.05, 1.2, 5), wood, x + Math.cos(k * 2.1) * 0.12, y0 + r * 1.25 + 0.3, z + Math.sin(k * 2.1) * 0.12, { rz: Math.cos(k * 2.1) * 0.3, rx: Math.sin(k * 2.1) * 0.3 });
      add(boxG, dark, x, y0 + 0.6, z + r * 0.8, { s: [0.9, 1.2, 0.1], cast: false });
    }
    fire.set(TTX + cx + 1, H(cx + 1, cz + 3) + 0.2, TTZ + cz + 3);
    for (let k = 0; k < 7; k++) add(new THREE.DodecahedronGeometry(0.28, 0), rockMat, cx + 1 + Math.cos(k) * 0.8, H(cx + 1, cz + 3) + 0.1, cz + 3 + Math.sin(k) * 0.8);
    // banthas: great shaggy beasts with spiralling horns
    const fur = std(0x47352a, 1), furDark = std(0x2f241d, 1), horn = std(0xc9b694, 0.55);
    const bantha = (x, z, yaw) => {
      const g = new THREE.Group();
      g.position.set(x, H(x, z), z);
      g.rotation.y = yaw;
      group.add(g);
      add(new THREE.SphereGeometry(1, 20, 14), fur, 0, 2.3, 0, { s: [1.35, 1.15, 2.1], parent: g });
      add(cylG(1.35, 1.55, 1.3, 20, true), furDark, 0, 1.45, 0, { s: [1, 1, 1.5], parent: g });
      for (const [lx, lz] of [[-0.75, 1.1], [0.75, 1.1], [-0.75, -1.1], [0.75, -1.1]]) add(cylG(0.3, 0.26, 1.7, 10), furDark, lx, 0.85, lz, { parent: g });
      add(new THREE.SphereGeometry(1, 16, 12), fur, 0, 2.55, 2.25, { s: [0.75, 0.8, 0.95], parent: g });
      add(new THREE.SphereGeometry(1, 12, 8), furDark, 0, 1.95, 2.5, { s: [0.6, 0.45, 0.6], parent: g });
      for (const s of [-1, 1]) {
        const pts = [];
        for (let i = 0; i <= 14; i++) {
          const a = i / 14 * 5.2;
          pts.push(new THREE.Vector3(s * (0.55 + 0.06 * a), 2.95 + Math.sin(a) * (0.5 - 0.05 * a), 2.3 - Math.cos(a) * (0.5 - 0.05 * a) - 0.15));
        }
        add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.12, 8), horn, 0, 0, 0, { parent: g });
      }
      add(cylG(0.12, 0.05, 1.2, 6), furDark, 0, 2.0, -2.2, { rx: 0.6, parent: g });
      collide(x, H(x, z) + 1.6, z, 3, 3.2, 4.6);
    };
    bantha(cx + 11, cz - 5, 0.9);
    bantha(cx - 12, cz + 2, -2.2);
  }

  // ================================================================== north: the Jawa sandcrawler
  const crawler = new THREE.Group();
  const CX = 36, CZ = -96;
  {
    const x = CX, z = CZ, y0 = H(x, z);
    crawler.position.set(x, y0, z);
    group.add(crawler);
    const P = (g, mat, px, py, pz, opts = {}) => add(g, mat, px, py, pz, { ...opts, parent: crawler });
    const taper = (w0, w1, h, d0, d1, slope = 0) => {
      const g = new THREE.BoxGeometry(1, 1, 1, 1, 1, 1);
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const up = p.getY(i) > 0;
        p.setX(i, p.getX(i) * (up ? w1 : w0));
        p.setY(i, p.getY(i) * h);
        const front = p.getZ(i) > 0;
        p.setZ(i, p.getZ(i) * (up ? d1 : d0) + (up && front ? -slope : 0));
      }
      g.computeVertexNormals();
      return g;
    };
    for (const [tx, tz] of [[-7.5, 10], [7.5, 10], [-7.5, -10], [7.5, -10]]) {
      P(boxG, tread, tx, 2.2, tz, { s: [4.4, 4.4, 8] });
      for (let k = -3; k <= 3; k++) P(boxG, metalDark, tx + (tx > 0 ? 2.25 : -2.25), 2.2, tz + k * 1.1, { s: [0.12, 3.8, 0.5] });
      for (const wz of [-2.6, 0, 2.6]) P(cylG(1.4, 1.4, 4.5, 16), metalDark, tx, 2.2, tz + wz, { rz: Math.PI / 2 });
    }
    P(taper(20, 19, 8, 34, 30, 2), rust, 0, 8.2, 0);
    P(taper(17, 12.5, 9, 26, 18, 4), rust, 0, 16.6, -3);
    P(boxG, rust, 0, 21.6, -6, { s: [11, 1.2, 12] });
    // the command deck: a cab with a strip of windows looking forward
    P(taper(7, 6, 2.6, 6, 5, 0.8), rust, 0, 23.4, -1.5);
    for (let i = 0; i < 4; i++) P(boxG, glow(0.9, 0.55, 0.25), -2.2 + i * 1.45, 23.8, 0.95, { s: [1.0, 0.55, 0.1], rx: -0.3, cast: false });
    for (let i = 0; i < 6; i++) P(boxG, dark, -5 + i * 2, 18.2, 6.6, { s: [1.3, 0.8, 0.1], rx: -0.42, cast: false });
    for (const sx of [-1, 1]) for (let i = 0; i < 6; i++) P(boxG, std(0x6a4026, 0.8, 0.3), sx * 10.05, 8.5, -13 + i * 5, { s: [0.15, 7.5, 0.4] });
    // catwalk railings along the upper deck, exhausts, an antenna mast
    for (const sx of [-1, 1]) {
      P(boxG, metalDark, sx * 8.6, 12.9, -3, { s: [0.12, 0.12, 22] });
      for (let i = 0; i < 8; i++) P(boxG, metalDark, sx * 8.6, 12.5, -13 + i * 3, { s: [0.1, 0.8, 0.1] });
    }
    P(cylG(0.6, 0.6, 14, 10), metalDark, 6, 24, -10, { rz: 0.06 });
    P(cylG(0.4, 0.4, 9, 10), metalDark, -6, 23, -12);
    P(cylG(0.08, 0.08, 8, 6), metalWorn, -2.5, 28, -3);
    // the mouth and the ramp
    P(boxG, dark, 0, 7.2, 17.05, { s: [7, 5.5, 0.2], cast: false });
    P(boxG, metalDark, 0, 2.6, 21.2, { s: [7, 0.35, 9.6], rx: 0.5 });
    for (let i = 0; i < 8; i++) P(boxG, metalWorn, 0, 2.8 - (i - 3.5) * 1.1 * Math.sin(0.5), 21.2 + (i - 3.5) * 1.1 * Math.cos(0.5), { s: [6.6, 0.12, 0.18], rx: 0.5 });
    P(new THREE.SphereGeometry(0.3, 10, 8), glow(2.2, 1.2, 0.4), -3.6, 9.9, 17.1, { cast: false });
    P(new THREE.SphereGeometry(0.3, 10, 8), glow(2.2, 1.2, 0.4), 3.6, 9.9, 17.1, { cast: false });
    world.box(TTX + x, y0 + 11, TTZ + z, 21, 22, 34);
    // Jawa salvage piled by the ramp
    for (let i = 0; i < 10; i++) {
      const sx = x - 9 - rng() * 4, sz = z + 22 + rng() * 6;
      add(i % 3 ? boxG : new THREE.SphereGeometry(0.5, 8, 6), i % 2 ? metalDark : rust, sx, H(sx, sz) + 0.3, sz, { s: i % 3 ? [0.6 + rng(), 0.5 + rng() * 0.6, 0.6 + rng()] : [1, 1, 1], ry: rng() * 3 });
    }
  }
  const rampTop = new THREE.Vector3(TTX + CX, H(CX, CZ) + 4.6, TTZ + CZ + 16.5);
  const rampFoot = new THREE.Vector3(TTX + CX, H(CX, CZ + 26), TTZ + CZ + 26);
  const crawlerRoof = new THREE.Vector3(TTX + CX, H(CX, CZ) + 22.3, TTZ + CZ - 4);

  // --- distant mesas on the horizon
  {
    const mesaGeo = (seed) => {
      const g = new THREE.CylinderGeometry(0.8, 1, 1, 14, 6);
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), y = p.getY(i), z = p.getZ(i), a = Math.atan2(z, x);
        const k = 1 + 0.18 * (vnoise(Math.cos(a) * 2 + seed, y * 3, Math.sin(a) * 2) - 0.5) + 0.06 * Math.sin(y * 18 + seed);
        p.setXYZ(i, x * k, y, z * k);
      }
      g.computeVertexNormals();
      return g;
    };
    const far = std(0xa77650, 1);
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * TAU + rng() * 0.25, d = 620 + rng() * 900;
      const r = 40 + rng() * 120, h = 50 + rng() * 130;
      add(mesaGeo(rng() * 40), far, Math.cos(a) * d, h / 2 - 10, Math.sin(a) * d, { s: [r, h, r * (0.6 + rng() * 0.8)], ry: rng() * 3, cast: false, dynamic: true });
    }
  }

  // --- invisible walls round the arena (the dunes and cliffs beyond)
  collide(B.minX - 1, 10, 0, 2, 40, 160, { shot: false, walk: false });
  collide(B.maxX + 1, 10, 0, 2, 40, 160, { shot: false, walk: false });
  collide(0, 10, B.minZ - 1, 160, 40, 2, { shot: false, walk: false });
  collide(0, 10, B.maxZ + 1, 160, 40, 2, { shot: false, walk: false });

  // --- the sky, the light set and the haze (applied by activate())
  const sky = makeTatooineSky();
  sky.visible = false;
  scene.add(sky);
  let env = null;
  {
    const envScene = new THREE.Scene();
    const s2 = makeTatooineSky();
    s2.scale.setScalar(0.01);
    envScene.add(s2);
    const pm = new THREE.PMREMGenerator(renderer);
    env = pm.fromScene(envScene, 0.03).texture;
    pm.dispose();
  }
  const fog = new THREE.FogExp2(0xd9a074, 0.00105);

  // batch the static meshes by material: a few dozen draw calls instead of hundreds
  {
    group.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
    const groups = new Map();
    group.traverse((m) => {
      if (!m.isMesh || m.userData.dynamic || m.parent.userData.dynamic || Array.isArray(m.material) || m.material.transparent) return;
      let p = m.parent;
      while (p && p !== group) { if (p.userData.dynamic || p === laat) return; p = p.parent; }
      const key = m.material.uuid + (m.castShadow ? 'c' : '');
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(m);
    });
    const _m = new THREE.Matrix4();
    for (const list of groups.values()) {
      if (list.length < 2) continue;
      const geos = list.map((m) => {
        _m.multiplyMatrices(inv, m.matrixWorld);
        const g = (m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone()).applyMatrix4(_m);
        for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k);
        if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
        if (list[0].material.vertexColors && !g.attributes.color) g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 3).fill(1), 3));
        if (!list[0].material.vertexColors && g.attributes.color) g.deleteAttribute('color');
        return g;
      });
      const merged = mergeGeometries(geos);
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, list[0].material);
      mesh.castShadow = list[0].castShadow;
      mesh.receiveShadow = true;
      for (const m of list) m.parent.remove(m);
      group.add(mesh);
    }
  }
  group.visible = false;

  // --- the arena
  const inArena = (x, z) => x > TTX + B.minX + 2 && x < TTX + B.maxX - 2 && z > TTZ + B.minZ + 2 && z < TTZ + B.maxZ - 2;
  const freeAt = (p, pad = 1) => {
    if (Math.hypot(p.x - TTX - PIT.x, p.z - TTZ - PIT.z) < PIT.r + 2) return false;
    for (const b of world.boxes) {
      if (!b.move || b.max.y < p.y + 0.2 || b.min.y > p.y + 3) continue;
      if (p.x > b.min.x - pad && p.x < b.max.x + pad && p.z > b.min.z - pad && p.z < b.max.z + pad) return false;
    }
    return true;
  };
  const sandcrawler = {
    pos: rampFoot.clone(), dir: new THREE.Vector3(0, 0, 1), timer: 0, ramp: { top: rampTop.clone(), foot: rampFoot.clone() },
    openFor(sec) { this.timer = Math.max(this.timer, sec); },
  };
  const arena = {
    name: 'tatooine', y: 0, center: W(0, 0), planet: true, face: Math.PI, sunDir: TAT_SUN,
    bounds: { minX: TTX + B.minX + 1, maxX: TTX + B.maxX - 1, minZ: TTZ + B.minZ + 1, maxZ: TTZ + B.maxZ - 1 },
    flyBounds: { minX: TTX + B.minX - 8, maxX: TTX + B.maxX + 8, minZ: TTZ + B.minZ - 8, maxZ: TTZ + B.maxZ + 4 },
    avoid: null, outline: [[TTX + B.minX, TTZ + B.minZ], [TTX + B.maxX, TTZ + B.minZ], [TTX + B.maxX, TTZ + B.maxZ], [TTX + B.minX, TTZ + B.maxZ]],
    objective: { x: TTX - 2, z: TTZ + 30 }, objectiveText: 'DEFEND THE HOMESTEAD',
    spawns: {
      gates: [
        { pos: W(SX, -75), dir: new THREE.Vector3(0, 0, 1), tusken: true },
        { pos: W(-26, -75), dir: new THREE.Vector3(0, 0, 1), tusken: true },
        { pos: W(4, -75), dir: new THREE.Vector3(0, 0, 1), tusken: true },
        { pos: W(60, -75), dir: new THREE.Vector3(0, 0, 1) },
        { pos: W(75, -22), dir: new THREE.Vector3(-1, 0, 0) },
        { pos: W(-75, 19), dir: new THREE.Vector3(1, 0, 0), tusken: true },
        { pos: W(75, 52), dir: new THREE.Vector3(-1, 0, 0) },
      ],
      doors: [],
      sandcrawler,
      perches,
      edge() { return W(-40 + Math.random() * 80, -70).setY(30); },
      drop() {
        for (let i = 0; i < 50; i++) {
          const x = TTX + B.minX + 4 + Math.random() * (B.maxX - B.minX - 8), z = TTZ + B.minZ + 4 + Math.random() * (B.maxZ - B.minZ - 8);
          const p = new THREE.Vector3(x, H(x - TTX, z - TTZ), z);
          if (inArena(x, z) && freeAt(p)) return p;
        }
        return W(0, 0);
      },
    },
    playerSpawn: W(2, 52), allySpawn: W(-3, 53),
    shadowTarget: W(0, -4), sunIntensity: 3.3, hemi: 1.45,
  };

  const _f = new THREE.Vector3();
  const wind = new THREE.Vector3(1, 0, -0.25).normalize();
  let devil = null;
  return {
    group, arena, sky, laat, crawler, fire, perches, rampTop, rampFoot, crawlerRoof, terrain,
    W, H,
    /** Show Tatooine and swap in its sky, light and haze (or restore the city's). */
    activate(on, G) {
      group.visible = on;
      sky.visible = on;
      const c = G.city;
      if (on) {
        this.saved = this.saved || { fog: G.scene.fog, env: G.scene.environment, hemiSky: c.hemi.color.clone(), hemiGround: c.hemi.groundColor.clone(), sun: c.sun.color.clone() };
        G.scene.fog = fog;
        G.scene.environment = env;
        this.savedGrade = JSON.parse(JSON.stringify(GRADE));
        Object.assign(GRADE, JSON.parse(JSON.stringify(DESERT_GRADE)));
        G.post.apply();
        c.hemi.color.set(0x9aa8cc);
        c.hemi.groundColor.set(0xd09060);
        c.sun.color.set(0xffb27a);
      } else if (this.saved) {
        G.scene.fog = this.saved.fog;
        G.scene.environment = this.saved.env;
        if (this.savedGrade) { Object.assign(GRADE, this.savedGrade); G.post.apply(); }
        c.hemi.color.copy(this.saved.hemiSky);
        c.hemi.groundColor.copy(this.saved.hemiGround);
        c.sun.color.copy(this.saved.sun);
      }
    },
    update(dt, t, camera) {
      sky.position.copy(camera.position);
      sky.material.uniforms.time.value = t;
      for (const f of updaters) f(dt, t);
    },
    /** Blowing sand round the camera, the odd dust devil, smoke from the Tusken camp fire. */
    fxUpdate(dt, fx, cam) {
      if (Math.random() < dt * 22) {
        const a = Math.random() * TAU, d = 4 + Math.random() * 26;
        const x = cam.x + Math.cos(a) * d, z = cam.z + Math.sin(a) * d;
        const g = world.terrain(x, z);
        if (g !== null && g > -1) {
          const s = 2.5 + Math.random() * 3;
          fx.smoke.emit(x, g + 0.15 + Math.random() * 0.6, z, wind.x * s, 0.15, wind.z * s, 1.6 + Math.random(), 0.25, 1.4,
            0.66, 0.5, 0.36, 0.16, 0, 0.2, 0.25, 0.7, 0.54, 0.4, (Math.random() - 0.5));
        }
      }
      if (!devil && Math.random() < dt * 0.04) {
        const x = TTX + (Math.random() - 0.5) * 100, z = TTZ - 60 + Math.random() * 50;
        devil = { pos: new THREE.Vector3(x, H(x - TTX, z - TTZ), z), t: 0, life: 6 + Math.random() * 4 };
      }
      if (devil) {
        devil.t += dt;
        devil.pos.addScaledVector(wind, dt * 3);
        devil.pos.y = H(devil.pos.x - TTX, devil.pos.z - TTZ);
        const k = Math.sin(Math.min(1, devil.t / devil.life) * Math.PI);
        for (let i = 0; i < 3; i++) {
          const a = devil.t * 9 + i * 2.1, h = Math.random() * 6 * k, r = 0.4 + h * 0.25;
          fx.smoke.emit(devil.pos.x + Math.cos(a) * r, devil.pos.y + h, devil.pos.z + Math.sin(a) * r, -Math.sin(a) * 3, 1.5, Math.cos(a) * 3,
            1.0, 0.4, 1.6, 0.64, 0.48, 0.34, 0.3 * k, -0.2, 0.3, 0.1, 0.66, 0.5, 0.38, 2);
        }
        if (devil.t > devil.life) devil = null;
      }
      if (Math.random() < dt * 4) fx.smokePuff(_f.copy(fire).setY(fire.y + 0.6), 1.2, 0.18);
      if (Math.random() < dt * 8) fx.fireTrail(_f.copy(fire).setY(fire.y + 0.25), 0.5);
    },
  };
}
