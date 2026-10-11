import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32 } from './util.js';

// Low-poly procedural ships. Each is one vertex-coloured mesh (+ an emissive engine mesh),
// since they are mostly seen at a distance: silhouettes and lights matter more than detail.

const _e = new THREE.Euler();
const _q = new THREE.Quaternion();
const M = (x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));

class Kit {
  constructor() { this.parts = []; this.glow = []; }
  add(geo, color, m, glow = false) {
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    if (m) g.applyMatrix4(m);
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
    const c = new THREE.Color(color);
    const n = g.attributes.position.count;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    (glow ? this.glow : this.parts).push(g);
    return this;
  }
  box(sx, sy, sz, color, m, glow) { return this.add(new THREE.BoxGeometry(sx, sy, sz), color, m, glow); }
  cyl(r1, r2, h, color, m, segs = 10, glow) { return this.add(new THREE.CylinderGeometry(r1, r2, h, segs), color, m, glow); }
  sphere(r, color, m, glow) { return this.add(new THREE.SphereGeometry(r, 12, 8), color, m, glow); }

  /** Darken vertex colours with blotchy soot (crashed ships). */
  scorch(seed, amount) {
    const rng = mulberry32(seed);
    const blobs = Array.from({ length: 14 }, () => [(rng() - 0.5) * 18, rng() * 4, (rng() - 0.5) * 18, 1.5 + rng() * 4]);
    for (const g of this.parts) {
      const p = g.attributes.position, c = g.attributes.color;
      for (let i = 0; i < p.count; i++) {
        let k = 1;
        for (const [bx, by, bz, r] of blobs) {
          const d = Math.hypot(p.getX(i) - bx, p.getY(i) - by, p.getZ(i) - bz);
          if (d < r) k *= 1 - amount * (1 - d / r);
        }
        c.setXYZ(i, c.getX(i) * k, c.getY(i) * k, c.getZ(i) * k);
      }
    }
    return this;
  }

  build(mat, glowMat) {
    const g = new THREE.Group();
    const mesh = new THREE.Mesh(mergeGeometries(this.parts), mat);
    mesh.castShadow = mesh.receiveShadow = true;
    g.add(mesh);
    if (this.glow.length) g.add(new THREE.Mesh(mergeGeometries(this.glow), glowMat));
    return g;
  }
}

const HULL = '#cfccc3', HULL2 = '#9fa1a3', DARK = '#3e4247', RED = '#8e1f1a', GLASS = '#16222c';
let shipMat = null, glowMat = null;
function mats() {
  if (!shipMat) {
    shipMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.12 });
    glowMat = new THREE.MeshBasicMaterial({ vertexColors: true, color: new THREE.Color(2.8, 2.8, 2.8) });
  }
  return { shipMat, glowMat };
}

/**
 * Republic LAAT/i gunship (original low-poly take). Faces +Z, about 17 m long.
 * wreck: crashed version (scorched, starboard wing torn off, no engine glow).
 * Returns the group plus anchor points (engines, nose) in local space.
 */
export function buildLAAT({ wreck = false, bay = false } = {}) {
  const k = new Kit();
  // fuselage, nose and cockpit
  if (bay) {
    // open troop bay through both sides, so you can see who is aboard
    k.box(3.2, 0.25, 9, '#5d6168', M(0, 0.42, -1));
    k.box(3.2, 0.35, 9, HULL, M(0, 2.72, -1));
    k.box(3.2, 2.6, 0.5, HULL, M(0, 1.6, 3.25));
    k.box(3.2, 2.6, 1.9, HULL, M(0, 1.6, -4.55));
    for (const s of [-1, 1]) {
      k.box(0.14, 0.14, 6.6, DARK, M(s * 1.55, 2.48, -0.3));
      k.box(0.14, 0.1, 6.6, DARK, M(s * 1.55, 0.6, -0.3));
    }
    k.box(0.3, 0.05, 6.2, '#4a2412', M(0, 2.52, -0.3), true);
  } else k.box(3.2, 2.6, 9, HULL, M(0, 1.6, -1));
  k.box(3.0, 2.2, 3.4, HULL, M(0, 1.5, 5.0));
  k.add(new THREE.SphereGeometry(1.5, 14, 10), HULL, M(0, 1.35, 6.7, 0, 0, 0, 1.0, 0.72, 1.25));
  k.add(new THREE.SphereGeometry(0.85, 12, 8), GLASS, M(0, 2.75, 5.1, 0, 0, 0, 1, 0.7, 1.45));
  k.add(new THREE.SphereGeometry(0.6, 10, 8), GLASS, M(0, 0.85, 7.6, 0, 0, 0, 1.2, 0.6, 0.8));
  // ball turrets on the wing roots + cannons
  for (const s of [-1, 1]) {
    k.sphere(0.6, HULL2, M(s * 1.75, 2.1, 3.2));
    k.cyl(0.08, 0.08, 1.4, DARK, M(s * 1.75, 2.1, 4.1, Math.PI / 2, 0, 0), 6);
  }
  // tail boom, fin, engines
  k.box(2.3, 2.0, 4.2, HULL, M(0, 1.8, -7.4));
  k.box(0.28, 2.8, 2.6, HULL, M(0, 3.8, -8.3, wreck ? -0.6 : -0.3, 0, wreck ? 0.5 : 0));
  for (const s of [-1, 1]) k.cyl(0.55, 0.62, 2.8, DARK, M(s * 1.05, 2.3, -8.9, Math.PI / 2, 0, 0), 12);
  // troop bay doors (open, dark) and red Republic trim
  for (const s of [-1, 1]) {
    if (!bay) k.box(0.06, 1.6, 3.4, '#1d2024', M(s * 1.62, 1.35, 0.2));
    k.box(0.05, 0.22, 9.2, RED, M(s * 1.63, 2.55, -1));
    k.box(0.05, 0.22, 3.2, RED, M(s * 1.53, 2.3, 5.0));
  }
  k.box(3.05, 0.07, 0.45, RED, M(0, 2.63, 3.4));
  // wings (swept back, slight anhedral) with missile pods at the tips
  for (const s of wreck ? [-1] : [-1, 1]) {
    k.box(6.6, 0.32, 2.6, HULL, M(s * 4.7, 2.95, -2.4, 0, s * 0.35, -s * 0.12));
    k.cyl(0.36, 0.36, 2.4, HULL2, M(s * 7.9, 2.55, -2.9, Math.PI / 2, 0, 0), 10);
    k.box(1.2, 0.08, 0.6, RED, M(s * 7.2, 3.12, -1.7, 0, s * 0.35, -s * 0.12));
  }
  if (wreck) {
    // torn wing stump and buckled panels
    k.box(1.6, 0.4, 2.2, HULL2, M(2.35, 2.85, -2.2, 0.3, 0.4, 0.5));
    k.box(1.2, 0.2, 1.4, DARK, M(1.2, 3.0, 1.5, 0.6, 0.2, 0.3));
    k.scorch(31, 0.85);
  } else {
    for (const s of [-1, 1]) k.cyl(0.42, 0.42, 0.08, '#ffd08a', M(s * 1.05, 2.3, -10.32, Math.PI / 2, 0, 0), 12, true);
    k.sphere(0.12, '#ff3b2a', M(-7.9, 2.55, -1.6), true);
    k.sphere(0.12, '#3bff6a', M(7.9, 2.55, -1.6), true);
  }
  const { shipMat: sm, glowMat: gm } = mats();
  const g = k.build(sm, gm);
  g.userData.anchors = {
    engines: [new THREE.Vector3(-1.05, 2.3, -10.3), new THREE.Vector3(1.05, 2.3, -10.3)],
    nose: new THREE.Vector3(0, 1.4, 7.8),
    bay: new THREE.Vector3(0, 0.6, 0.2),
    stump: new THREE.Vector3(2.4, 2.9, -2.2),
    bayFloor: 0.545,
  };
  return g;
}

const SEP = '#8f8068', SEP2 = '#5d5548', SEPD = '#2f2b27', SEPB = '#4f6178';

/** Republic ARC-170 starfighter (original low-poly take). Faces +Z, about 13 m long. */
export function buildARC170() {
  const k = new Kit();
  const W = '#d8d3c6', R = '#9a2b1f', G2 = '#8d9094';
  k.box(1.5, 1.1, 7.2, W, M(0, 0, -0.6));
  k.cyl(0.32, 0.78, 4.2, W, M(0, -0.05, 4.9, Math.PI / 2, 0, 0), 6);
  k.add(new THREE.SphereGeometry(0.62, 10, 8), GLASS, M(0, 0.62, 1.3, 0, 0, 0, 1, 0.75, 2.6));
  k.box(0.08, 0.16, 6.8, R, M(0.76, 0.2, -0.4));
  k.box(0.08, 0.16, 6.8, R, M(-0.76, 0.2, -0.4));
  k.box(1.1, 0.9, 2.6, G2, M(0, 0.05, -5.2));
  for (const s of [-1, 1]) {
    // split S-foil wings, each tipped with a long forward laser cannon
    for (const u of [-1, 1]) {
      k.box(5.4, 0.16, 2.6, W, M(s * 3.3, u * 0.32, -1.6, 0, 0, s * u * 0.16));
      k.box(1.6, 0.17, 0.5, R, M(s * 4.3, u * (0.32 + 0.25), -0.6, 0, 0, s * u * 0.16));
    }
    k.cyl(0.13, 0.2, 6.4, DARK, M(s * 5.6, 0, 1.2, Math.PI / 2, 0, 0), 6);
    k.cyl(0.42, 0.5, 2.6, G2, M(s * 1.35, 0, -3.6, Math.PI / 2, 0, 0), 10);
    k.cyl(0.36, 0.36, 0.06, '#ff9a5a', M(s * 1.35, 0, -4.93, Math.PI / 2, 0, 0), 10, true);
    // twin tail fins, canted out
    k.box(0.12, 2.0, 1.7, W, M(s * 0.5, 1.05, -5.6, -0.25, 0, -s * 0.18));
    k.box(0.13, 0.5, 0.9, R, M(s * 0.62, 1.7, -5.75, -0.25, 0, -s * 0.18));
  }
  const g = k.build(...Object.values(mats()));
  g.userData.anchors = {
    engines: [new THREE.Vector3(-1.35, 0, -5), new THREE.Vector3(1.35, 0, -5)],
    guns: [new THREE.Vector3(-5.6, 0, 4.4), new THREE.Vector3(5.6, 0, 4.4)],
    engineColor: 0xff9a5a,
  };
  return g;
}

/** Separatist vulture droid in flight mode (original low-poly take). Faces +Z, about 7 m long. */
export function buildVulture() {
  const k = new Kit();
  k.box(1.0, 1.5, 4.6, SEP, M(0, 0, -0.4));
  k.add(new THREE.SphereGeometry(0.75, 10, 8), SEP2, M(0, 0.1, 2.0, 0, 0, 0, 0.9, 1.1, 1.3));
  k.box(0.7, 0.35, 1.6, SEPD, M(0, -0.7, 1.6));
  k.box(0.6, 0.9, 1.0, SEPD, M(0, 0, -3.0));
  for (const s of [-1, 1]) {
    k.sphere(0.13, '#ff7a2a', M(s * 0.3, 0.28, 2.95), true);
    // four wing plates in an X, cannons at the tips
    for (const u of [-1, 1]) {
      k.box(4.4, 0.14, 3.0, SEP, M(s * 2.6, u * 0.42, -0.6, 0, 0, s * u * 0.2));
      k.box(3.4, 0.15, 0.4, SEPB, M(s * 2.9, u * 0.5, 0.6, 0, 0, s * u * 0.2));
      k.cyl(0.07, 0.07, 1.6, SEPD, M(s * 4.6, u * 0.95, 1.2, Math.PI / 2, 0, 0), 5);
    }
  }
  k.cyl(0.32, 0.32, 0.05, '#9fd0ff', M(0, 0, -3.53, Math.PI / 2, 0, 0), 8, true);
  const g = k.build(...Object.values(mats()));
  g.userData.anchors = {
    engines: [new THREE.Vector3(0, 0, -3.5)],
    guns: [new THREE.Vector3(-4.6, 0.95, 2), new THREE.Vector3(4.6, -0.95, 2)],
    engineColor: 0x9fd0ff,
  };
  return g;
}

/** Separatist heavy landing craft (original design): a long hull slung between two huge troop pods. Faces +Z, ~80 m wide. */
export function buildLander() {
  const k = new Kit();
  k.box(9, 6, 34, SEP, M(0, 0, 0));
  k.add(new THREE.SphereGeometry(5.2, 14, 10), SEP2, M(0, 0.5, 17, 0, 0, 0, 1, 0.8, 1.2));
  k.box(4, 2.5, 3, SEPD, M(0, 3.3, 19));
  for (const s of [-1, 1]) {
    k.box(30, 2.2, 10, SEP, M(s * 19, 1, -4, 0, s * 0.12, -s * 0.05));
    k.box(28, 0.4, 1.2, SEPB, M(s * 19, 2.2, 0.5, 0, s * 0.12, -s * 0.05));
    k.cyl(4.2, 4.2, 26, SEP2, M(s * 36, 0, -2, Math.PI / 2, 0, 0), 12);
    k.add(new THREE.SphereGeometry(4.2, 12, 8), SEP2, M(s * 36, 0, 11, 0, 0, 0, 1, 1, 0.8));
    k.box(1.2, 7, 6, SEPD, M(s * 36, 5, -10));
    for (const z of [-10, 3]) k.cyl(2.2, 2.2, 0.3, '#9fd0ff', M(s * 36, -4.25, z), 12, true);
    k.cyl(2.2, 2.6, 6, SEPD, M(s * 4, 0, -19, Math.PI / 2, 0, 0), 10);
    k.cyl(2.0, 2.0, 0.2, '#9fd0ff', M(s * 4, 0, -22.1, Math.PI / 2, 0, 0), 10, true);
  }
  for (let i = 0; i < 6; i++) k.sphere(0.5, '#ff4a2a', M((i % 2 ? 1 : -1) * 4.6, -2.5, -12 + i * 5), true);
  const g = k.build(...Object.values(mats()));
  g.userData.anchors = {
    engines: [new THREE.Vector3(-4, 0, -22), new THREE.Vector3(4, 0, -22), new THREE.Vector3(-36, -4.5, -4), new THREE.Vector3(36, -4.5, -4)],
    guns: [new THREE.Vector3(0, -3, 18)],
    engineColor: 0x9fd0ff,
  };
  return g;
}

/**
 * Separatist droid dropship (original design): an insect-like hull with a sensor head and forward
 * mandibles, a ribbed belly bay with a drop hatch, landing claws, and repulsor pods on stub pylons.
 * Faces +Z, about 16 m long. The hatch glow is a separate child (anchors.hatch).
 */
export function buildDropship() {
  const k = new Kit();
  const H = '#a08a5c', H2 = '#7c6a4c';
  k.add(new THREE.SphereGeometry(3.0, 18, 12), H, M(0, 0, -0.5, 0, 0, 0, 1.05, 0.8, 2.1));
  k.box(1.1, 0.7, 9.5, SEPD, M(0, 2.2, -0.8));
  for (const z of [-4.5, -2.2, 0.1]) k.box(0.25, 1.1, 1.4, H2, M(0, 2.7, z, -0.3, 0, 0));
  k.box(0.3, 3.0, 3.4, H2, M(0, 2.9, -5.6, -0.4, 0, 0));
  k.box(0.32, 0.5, 2.6, SEPB, M(0, 3.9, -6.2, -0.4, 0, 0));
  // sensor head, visor and eyes
  k.add(new THREE.SphereGeometry(1.5, 14, 10), H2, M(0, 0.3, 5.6, 0, 0, 0, 1.1, 0.8, 1.3));
  k.box(2.3, 0.38, 1.0, SEPD, M(0, 0.45, 6.75));
  // forward mandibles with cannons
  for (const s of [-1, 1]) {
    k.box(0.55, 0.65, 4.4, H2, M(s * 1.7, -0.7, 6.4, 0, -s * 0.16, 0));
    k.box(0.6, 0.3, 4.0, SEPB, M(s * 1.72, -0.28, 6.3, 0, -s * 0.16, 0));
    k.cyl(0.12, 0.12, 1.6, SEPD, M(s * 1.35, -0.9, 8.9, Math.PI / 2, 0, 0), 6);
    k.sphere(0.17, '#ff4a1a', M(s * 0.6, 0.55, 7.2), true);
  }
  // ribbed belly bay
  k.box(3.3, 1.1, 7.4, SEPD, M(0, -2.25, 0.2));
  for (let i = 0; i < 6; i++) k.box(3.7, 0.28, 0.32, H2, M(0, -2.45, -3.0 + i * 1.28));
  // landing claws folded under the hull
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    k.box(0.3, 2.3, 0.3, SEPD, M(sx * 2.3, -2.6, sz * 3.0, sz * 0.25, 0, sx * 0.35));
    k.box(0.5, 0.2, 0.9, SEPD, M(sx * 2.75, -3.7, sz * 3.25));
  }
  for (const s of [-1, 1]) {
    // pylons and repulsor pods with dark intake rings
    k.box(4.2, 0.7, 2.4, H2, M(s * 4.0, 0.3, -0.8, 0, 0, -s * 0.12));
    k.box(3.6, 0.2, 0.5, SEPB, M(s * 4.0, 0.72, 0.1, 0, 0, -s * 0.12));
    k.cyl(1.35, 1.2, 4.0, H, M(s * 6.6, 0, -0.8, Math.PI / 2, 0, 0), 14);
    k.cyl(1.5, 1.5, 0.5, SEPD, M(s * 6.6, 0, 1.3, Math.PI / 2, 0, 0), 14);
    k.cyl(1.4, 1.4, 0.4, SEPD, M(s * 6.6, 0, -2.9, Math.PI / 2, 0, 0), 14);
    k.box(0.3, 0.3, 4.0, SEPB, M(s * 7.95, 0, -0.8));
    k.cyl(0.95, 0.95, 0.12, '#6fb6ff', M(s * 6.6, -1.3, -0.8), 14, true);
    k.cyl(0.8, 0.8, 0.06, '#6fb6ff', M(s * 6.6, 0, -3.12, Math.PI / 2, 0, 0), 12, true);
    for (let i = 0; i < 3; i++) k.box(0.08, 0.5, 1.2, SEPB, M(s * 3.05, -0.4, -3.2 + i * 2.2, 0, 0, s * 0.3));
  }
  const g = k.build(...Object.values(mats()));
  const hatch = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.06, 5.2), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 0.7, 0.25) }));
  hatch.position.set(0, -2.83, 0.2);
  hatch.visible = false;
  g.add(hatch);
  g.userData.anchors = {
    engines: [new THREE.Vector3(-6.6, 0, -3.2), new THREE.Vector3(6.6, 0, -3.2)],
    lifters: [new THREE.Vector3(-6.6, -1.4, -0.8), new THREE.Vector3(6.6, -1.4, -0.8)],
    guns: [new THREE.Vector3(-1.35, -0.9, 9.7), new THREE.Vector3(1.35, -0.9, 9.7)],
    engineColor: 0x6fb6ff, hatch, belly: new THREE.Vector3(0, -2.9, 0.2),
  };
  return g;
}

/**
 * Republic assault ship (an original take on the wedge-hulled troop carriers): a long dagger hull with a raised
 * spine, a bridge tower aft, a block of engines and a ventral hangar the gunships drop out of. Faces +Z, about
 * 170 m long (seen from a distance: over Coruscant, and in orbit over Tatooine).
 */
export function buildAssaultShip() {
  const k = new Kit();
  const G1 = '#b9b6ae', G2 = '#8f9195', G3 = '#6a6d72';
  // a wedge: wide and flat at the stern, narrowing to a point at the bow
  const wedge = (w, h, len, tip = 0.06, hTip = 0.35) => {
    const g = new THREE.BoxGeometry(1, 1, 1, 1, 1, 6);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const t = p.getZ(i) + 0.5; // 0 at the stern, 1 at the bow
      p.setXYZ(i, p.getX(i) * w * (1 - t * (1 - tip)), p.getY(i) * h * (1 - t * (1 - hTip)), p.getZ(i) * len);
    }
    g.computeVertexNormals();
    return g;
  };
  k.add(wedge(64, 9, 160), G1, M(0, 0, 0));
  k.add(wedge(44, 7, 150, 0.08, 0.4), G2, M(0, 7, -4));
  k.add(wedge(18, 8, 120, 0.15, 0.5), G1, M(0, 13, -16));
  // trenches along the flanks, red Republic markings at the bow
  for (const s of [-1, 1]) {
    k.box(1.2, 2.2, 120, G3, M(s * 21, 3.2, -8, 0, -s * 0.17, 0));
    k.box(0.6, 0.5, 46, RED, M(s * 9.6, 4.6, 52, 0, -s * 0.19, 0));
    for (let i = 0; i < 8; i++) k.sphere(1.4, G2, M(s * (6 + i * 1.8), 11.5 - i * 0.3, 30 - i * 11));
  }
  k.box(26, 0.4, 3, RED, M(0, 4.7, 70, 0, 0, 0, 0.2, 1, 1));
  // the bridge tower: a stack of decks with a strip of lit windows
  k.box(12, 10, 14, G2, M(0, 22, -48));
  k.box(9, 6, 10, G1, M(0, 30, -50));
  k.box(16, 2.2, 6, G1, M(0, 34, -50));
  k.box(15.6, 0.7, 0.4, '#ffd9a0', M(0, 33.6, -46.8), true);
  for (const s of [-1, 1]) k.cyl(1.4, 1.4, 5, G3, M(s * 6.5, 37, -51), 10);
  // stern: the engine block, three big drives and two small ones
  k.box(56, 18, 14, G2, M(0, 2, -83));
  for (const [x, r] of [[0, 7.5], [-17, 6.5], [17, 6.5], [-30, 4], [30, 4]]) {
    k.cyl(r, r * 1.1, 6, G3, M(x, 2, -91, Math.PI / 2, 0, 0), 16);
    k.cyl(r * 0.82, r * 0.82, 0.6, '#9fd0ff', M(x, 2, -94.2, Math.PI / 2, 0, 0), 16, true);
  }
  // the ventral hangar: a long dark slot in the belly
  k.box(14, 1.2, 46, '#16181c', M(0, -4.6, 6));
  k.box(15, 0.5, 47, G3, M(0, -4.2, 6));
  for (let i = 0; i < 6; i++) k.box(0.6, 0.5, 0.6, '#ffb070', M(-6, -5.2, -14 + i * 8), true), k.box(0.6, 0.5, 0.6, '#ffb070', M(6, -5.2, -14 + i * 8), true);
  const g = k.build(...Object.values(mats()));
  g.userData.anchors = {
    hangar: new THREE.Vector3(0, -6, 10),
    engines: [new THREE.Vector3(0, 2, -95), new THREE.Vector3(-17, 2, -95), new THREE.Vector3(17, 2, -95)],
  };
  return g;
}
