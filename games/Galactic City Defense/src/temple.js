import * as THREE from 'three';
import { mulberry32, canvasTexture } from './util.js';
import { placeProp } from './assets.js';
import { Character } from './character.js';
import { buildVulture } from './ships.js';
import { buildCouncil } from './council.js';

/**
 * Act 2: the Jedi Temple. The city's ziggurat landmark stands at (TX, TZ); its first terrace is the
 * battlefield (a processional plaza in front of the great entrance, extended out toward the city),
 * and a columned great hall is built inside the second tier, behind the entrance.
 *
 *   exterior  y = PY, x TX±58, z FZ (the facade) .. FZ+112 (the plaza's edge, over the city)
 *   hall      y = PY, x TX±17, z FZ-4 .. FZ-96 (the archives end)
 */
export const TX = -900, TZ = -1500;
export const PY = -39; // 1 m above the ziggurat's first terrace (no z-fighting with it from afar)
/** Act IV: the Jedi Council chamber crowns the south-east spire (city.js puts that spire's tip on its roof). */
export const COUNCIL = { x: TX + 60, y: 276, z: TZ + 60, r: 21.6, h: 12, spire: [60, 60] };
const FZ = TZ + 155; // the second tier's south face: the temple facade
const HW = 17, HL = 96, HH = 26; // great hall half-width, length, height

function stoneTexture(seed, base, tile) {
  const rng = mulberry32(seed);
  return canvasTexture(512, 512, (g, w, h) => {
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    const n = 512 / tile;
    for (let i = 0; i < tile; i++) {
      for (let j = 0; j < tile; j++) {
        const v = (rng() - 0.5) * 22;
        g.fillStyle = `rgba(${v > 0 ? 255 : 0},${v > 0 ? 240 : 0},${v > 0 ? 220 : 0},${Math.abs(v) / 255 * 2.2})`;
        g.fillRect(i * n + 1, j * n + 1, n - 2, n - 2);
      }
    }
    g.strokeStyle = 'rgba(40, 30, 20, 0.45)';
    g.lineWidth = 2;
    for (let i = 0; i <= tile; i++) {
      g.beginPath(); g.moveTo(i * n, 0); g.lineTo(i * n, h); g.stroke();
      g.beginPath(); g.moveTo(0, i * n); g.lineTo(w, i * n); g.stroke();
    }
    for (let i = 0; i < 900; i++) {
      g.fillStyle = `rgba(30, 20, 10, ${rng() * 0.08})`;
      g.fillRect(rng() * w, rng() * h, 1 + rng() * 3, 1 + rng() * 3);
    }
  }, { anisotropy: 8 });
}

function bannerTexture() {
  return canvasTexture(128, 512, (g, w, h) => {
    g.fillStyle = '#1d3150'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#d8c79a'; g.fillRect(0, 0, 10, h); g.fillRect(w - 10, 0, 10, h);
    g.fillRect(0, h - 26, w, 8);
    // an original emblem: a sunburst over a pillar
    g.save(); g.translate(w / 2, 150);
    g.strokeStyle = '#e8d8a8'; g.lineWidth = 4;
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; g.beginPath(); g.moveTo(Math.cos(a) * 22, Math.sin(a) * 22); g.lineTo(Math.cos(a) * 40, Math.sin(a) * 40); g.stroke(); }
    g.fillStyle = '#e8d8a8'; g.beginPath(); g.arc(0, 0, 14, 0, Math.PI * 2); g.fill();
    g.fillRect(-7, 48, 14, 120); g.fillRect(-20, 168, 40, 8);
    g.restore();
    for (let i = 0; i < 9; i++) { g.fillStyle = '#d8c79a'; g.fillRect(14 + i * 11.5, h - 18, 6, 18); }
  });
}

export function buildTemple(scene, world) {
  const rng = mulberry32(4242);
  const boxG = new THREE.BoxGeometry(1, 1, 1);
  const std = (color, rough = 0.75, metal = 0.1, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...extra });
  const glow = (r, g, b) => new THREE.MeshBasicMaterial({ color: new THREE.Color(r, g, b) });
  const sand = std(0xb9a587, 0.8, 0.05), sandDark = std(0x8e7b62, 0.85, 0.05), bronze = std(0x8a6a3a, 0.4, 0.75);
  const darkStone = std(0x3a332c, 0.6, 0.1), warm = glow(1.05, 0.72, 0.38), blueLight = glow(0.22, 0.6, 1.3);
  Object.assign(blueLight, { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
  const updaters = [];

  const block = (mat, x, y, z, sx, sy, sz, opts = {}) => {
    const m = new THREE.Mesh(boxG, mat);
    m.scale.set(sx, sy, sz);
    m.position.set(x, y, z);
    if (opts.ry) m.rotation.y = opts.ry;
    m.castShadow = opts.cast !== false;
    m.receiveShadow = true;
    scene.add(m);
    if (opts.collide) world.box(x, y, z, sx, sy, sz, opts.collide === true ? {} : opts.collide);
    return m;
  };
  const mesh = (geo, mat, x, y, z, opts = {}) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    if (opts.rx) m.rotation.x = opts.rx;
    if (opts.ry) m.rotation.y = opts.ry;
    if (opts.rz) m.rotation.z = opts.rz;
    m.castShadow = opts.cast !== false;
    m.receiveShadow = true;
    scene.add(m);
    return m;
  };
  const cylG = new THREE.CylinderGeometry(1, 1, 1, 20);
  const column = (x, z, r, h, y0 = PY, mat = sand) => {
    mesh(cylG, sandDark, x, y0 + 0.5, z).scale.set(r * 1.35, 1, r * 1.35);
    mesh(cylG, mat, x, y0 + h / 2, z).scale.set(r, h, r);
    mesh(cylG, sandDark, x, y0 + h - 0.4, z).scale.set(r * 1.3, 0.8, r * 1.3);
    world.add(x - r, y0, z - r, x + r, y0 + h, z + r);
  };
  const stoneMat = std(0x9c8c74, 0.9, 0.0);
  /** A Jedi statue: the Jedi Master rig, carved in stone. */
  const statue = (x, z, ry, s, y0 = PY) => {
    const c = new Character(scene, 'jedi');
    c.group.traverse((o) => { if (o.isMesh) { o.material = stoneMat; o.castShadow = true; o.receiveShadow = true; } });
    c.position.set(x, y0, z);
    c.yaw = ry;
    c.group.scale.setScalar(s);
    c.play('Idle', 0);
    c.update(0.4);
    return c;
  };
  const leafGeo = new THREE.IcosahedronGeometry(1, 0);
  const leafMats = [std(0x46703a, 0.95, 0, { flatShading: true }), std(0x355a2c, 0.95, 0, { flatShading: true })];
  const tree = (x, z, s = 1, y0 = PY) => {
    mesh(cylG, std(0x4a3a2a, 0.9, 0), x, y0 + 1.3 * s, z).scale.set(0.18 * s, 2.6 * s, 0.18 * s);
    const leaf = leafMats, geo = leafGeo;
    for (let i = 0; i < 14; i++) {
      const a = rng() * Math.PI * 2, d = (0.25 + rng() * 0.75) * s, r = (0.38 + rng() * 0.28) * s;
      const m = mesh(geo, leaf[i % 2], x + Math.cos(a) * d, y0 + (2.6 + rng() * 1.3) * s, z + Math.sin(a) * d);
      m.scale.set(r, r * 0.75, r);
      m.rotation.set(rng() * 3, rng() * 3, 0);
    }
  };

  // ------------------------------------------------------------------ exterior: the processional plaza
  const plazaTex = stoneTexture(11, '#bba98c', 8);
  plazaTex.repeat.set(116 / 8, 112 / 8);
  // the plaza is a solid paved slab; the part that juts out past the first terrace has a deep underside
  block(std(0xffffff, 0.85, 0.02, { map: plazaTex }), TX, PY - 1, FZ + 56, 116, 2, 112, { cast: false });
  block(sandDark, TX, PY - 9, FZ + 76, 118, 14, 74, { cast: false });
  world.add(TX - 58, PY - 2, FZ, TX + 58, PY, FZ + 112, { tag: 'floor' });
  // processional path: darker inlaid stone with light strips
  const pathTex = stoneTexture(12, '#8f8068', 4);
  pathTex.repeat.set(1, 18);
  const inlay = { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 };
  const path = new THREE.Mesh(new THREE.PlaneGeometry(12, 108), std(0xffffff, 0.6, 0.05, { map: pathTex, ...inlay }));
  path.rotation.x = -Math.PI / 2;
  path.position.set(TX, PY + 0.03, FZ + 56);
  path.receiveShadow = true;
  scene.add(path);
  for (const sx of [-6.2, 6.2]) block(blueLight, TX + sx, PY + 0.04, FZ + 56, 0.12, 0.03, 108, { cast: false });
  const inlayGold = std(0xa8874a, 0.8, 0.15, inlay), inlayDark = std(0x6e604c, 0.7, 0.05, inlay);
  const ring = (x, z, r0, r1, mat) => {
    const m = new THREE.Mesh(new THREE.RingGeometry(r0, r1, 64), mat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, PY + 0.035, z);
    m.receiveShadow = true;
    scene.add(m);
  };
  ring(TX, FZ + 84, 7, 7.4, inlayGold); ring(TX, FZ + 84, 8.2, 9.6, inlayDark); ring(TX, FZ + 84, 9.6, 9.9, inlayGold);
  for (const lz of [30, 64]) for (const sx of [-1, 1]) ring(TX + sx * 15, FZ + lz, 3.6, 3.9, inlayGold);
  for (const sx of [-1, 1]) block(inlayDark, TX + sx * 54, PY + 0.03, FZ + 56, 3, 0.02, 108, { cast: false });
  block(inlayDark, TX, PY + 0.03, FZ + 108, 108, 0.02, 3, { cast: false });
  // balustrade along the open edges (gaps where the droids come up the landing ramps)
  for (const [x0, x1] of [[-58, -26], [-14, 14], [26, 58]]) block(sand, TX + (x0 + x1) / 2, PY + 0.6, FZ + 112, x1 - x0, 1.2, 0.8, { collide: true });
  for (const sx of [-1, 1]) block(sand, TX + sx * 58, PY + 0.6, FZ + 56, 0.8, 1.2, 112, { collide: true });

  // the facade: carved panels with vertical ribs, and the great entrance
  block(sand, TX, PY + 40, FZ - 0.6, 118, 80, 1.2, { cast: false });
  for (const x of [-54, -44, -34, -24, 24, 34, 44, 54]) {
    block(sandDark, TX + x, PY + 40, FZ + 0.4, 2.4, 80, 1.0);
    block(sand, TX + x, PY + 40, FZ + 0.95, 1.2, 80, 0.3);
  }
  block(darkStone, TX, PY + 44, FZ + 0.15, 24, 26, 0.4, { cast: false });
  block(sandDark, TX, PY + 57.5, FZ + 0.9, 28, 1.6, 1.6);
  block(sandDark, TX, PY + 79.2, FZ + 1.0, 118, 1.6, 2.2);
  block(sandDark, TX, PY + 27, FZ + 0.4, 118, 1.4, 1.2);
  block(sandDark, TX, PY + 0.7, FZ + 0.5, 118, 1.4, 1.4);
  world.add(TX - 59, PY, FZ - 2, TX + 59, PY + 80, FZ + 1);
  block(sandDark, TX, PY + 31, FZ + 0.5, 30, 1.2, 1.4);
  {
    const em = new THREE.Mesh(new THREE.TorusGeometry(6, 0.8, 10, 40), bronze);
    em.position.set(TX, PY + 44, FZ + 0.9);
    scene.add(em);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      block(bronze, TX + Math.cos(a) * 9, PY + 44 + Math.sin(a) * 9, FZ + 0.9, 0.8, 4, 0.6, { ry: 0 }).rotation.z = a + Math.PI / 2;
    }
    block(bronze, TX, PY + 36.5, FZ + 0.9, 2, 9, 0.6);
  }
  // portal: deep recess, bronze doors ajar with warm light between them
  block(darkStone, TX, PY + 12, FZ + 0.2, 17, 24, 0.6);
  block(sandDark, TX - 9.5, PY + 12.5, FZ + 1.2, 2, 25, 2.4);
  block(sandDark, TX + 9.5, PY + 12.5, FZ + 1.2, 2, 25, 2.4);
  block(sandDark, TX, PY + 25.5, FZ + 1.2, 21, 2, 2.6);
  block(bronze, TX - 4.6, PY + 10.5, FZ + 0.7, 7.6, 21, 0.4);
  block(bronze, TX + 4.6, PY + 10.5, FZ + 0.7, 7.6, 21, 0.4);
  block(warm, TX, PY + 10.5, FZ + 0.65, 1.4, 21, 0.2, { cast: false });
  for (let i = 0; i < 3; i++) block(sandDark, TX, PY + 0.12 + i * 0.12, FZ + 2 + (2 - i) * 0.6, 20 - i * 1.2, 0.12, 1.2, { cast: false });
  for (const sx of [-1, 1]) for (const lx of [13, 19]) column(TX + sx * lx, FZ + 3.5, 1.3, 26);
  // banners on the facade
  const bannerMat = std(0xffffff, 0.95, 0, { map: bannerTexture(), side: THREE.DoubleSide });
  for (const lx of [-40, -28, 28, 40]) {
    const b = mesh(new THREE.PlaneGeometry(5, 20), bannerMat, TX + lx, PY + 16, FZ + 1.05, { cast: false });
    b.userData.dynamic = true;
  }
  // side doors the droids pour out of
  const doors = [];
  for (const sx of [-1, 1]) {
    const x = TX + sx * 46;
    block(darkStone, x, PY + 3.5, FZ + 0.25, 5.2, 7, 0.5);
    block(sandDark, x, PY + 7.4, FZ + 0.9, 6.4, 0.8, 1.4);
    const g = new THREE.Group();
    g.position.set(x, PY, FZ + 0.7);
    const L = new THREE.Mesh(boxG, bronze), R = new THREE.Mesh(boxG, bronze);
    L.scale.set(2.4, 6.6, 0.3); R.scale.set(2.4, 6.6, 0.3);
    L.position.set(-1.2, 3.3, 0); R.position.set(1.2, 3.3, 0);
    g.add(L, R);
    scene.add(g);
    doors.push({ pos: new THREE.Vector3(x, PY, FZ + 2.2), dir: new THREE.Vector3(0, 0, 1), open: 0, timer: 0, left: L, right: R, openFor(sec) { this.timer = Math.max(this.timer, sec); } });
  }
  updaters.push((dt) => {
    for (const d of doors) {
      d.timer -= dt;
      const target = d.timer > 0 ? 1 : 0;
      d.open += Math.sign(target - d.open) * Math.min(Math.abs(target - d.open), dt * 2.5);
      d.left.position.x = -1.2 - d.open * 2.3;
      d.right.position.x = 1.2 + d.open * 2.3;
    }
  });
  // processional statues, lamp pillars, planters with trees
  const statues = [];
  for (const lz of [30, 64]) for (const sx of [-1, 1]) {
    block(sandDark, TX + sx * 15, PY + 1.5, FZ + lz, 4, 3, 4, { collide: true });
    statues.push(statue(TX + sx * 15, FZ + lz, -sx * Math.PI / 2, 3.6, PY + 3));
  }
  const lamps = [];
  for (let lz = 12; lz <= 104; lz += 14) for (const sx of [-1, 1]) {
    if (lz === 26 || lz === 68) continue;
    block(sandDark, TX + sx * 8.5, PY + 2.5, FZ + lz, 0.5, 5, 0.5, { collide: true });
    block(warm, TX + sx * 8.5, PY + 5.2, FZ + lz, 0.7, 0.5, 0.7, { cast: false });
    lamps.push([TX + sx * 8.5, FZ + lz]);
  }
  for (const [lx, lz] of [[-36, 26], [36, 26], [-40, 72], [40, 72]]) {
    mesh(cylG, sandDark, TX + lx, PY + 0.55, FZ + lz).scale.set(2.6, 1.1, 2.6);
    world.add(TX + lx - 2.4, PY, FZ + lz - 2.4, TX + lx + 2.4, PY + 1.1, FZ + lz + 2.4);
    tree(TX + lx, FZ + lz, 1.3, PY + 1.1);
  }
  // fountain in the middle of the procession
  mesh(cylG, sandDark, TX, PY + 0.45, FZ + 84).scale.set(5, 0.9, 5);
  mesh(cylG, sand, TX, PY + 0.95, FZ + 84, { cast: false }).scale.set(5.2, 0.12, 5.2);
  const water = mesh(cylG, new THREE.MeshBasicMaterial({ color: 0x1f4a62 }), TX, PY + 1.0, FZ + 84, { cast: false });
  water.scale.set(4.6, 0.06, 4.6);
  mesh(cylG, sandDark, TX, PY + 1.5, FZ + 84).scale.set(1.6, 1.0, 1.6);
  mesh(new THREE.CylinderGeometry(0.25, 0.7, 7, 4), sand, TX, PY + 5.5, FZ + 84, { ry: Math.PI / 4 });
  const jet = glow(0.5, 0.9, 1.4);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const j = block(jet, TX + Math.cos(a) * 2.6, PY + 1.6, FZ + 84 + Math.sin(a) * 2.6, 0.08, 1.2, 0.08, { cast: false });
    j.rotation.set(Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5);
  }
  world.add(TX - 4.8, PY, FZ + 79.2, TX + 4.8, PY + 0.95, FZ + 88.8);
  // cover: Republic barricades by the entrance, stone benches, rubble, a toppled column
  const barricade = (x, z, alongX, len = 4) => {
    world.box(x, PY + 0.6, z, alongX ? len : 0.6, 1.2, alongX ? 0.6 : len);
    placeProp(scene, 'Barricade', x, PY, z, alongX ? 0 : Math.PI / 2, [len / 4, 1, 1]);
  };
  barricade(TX - 6, FZ + 18, true, 6); barricade(TX + 7, FZ + 20, true, 6); barricade(TX - 24, FZ + 24, false, 5); barricade(TX + 25, FZ + 22, false, 5);
  for (const [lx, lz] of [[-20, 44], [20, 46], [-24, 92], [22, 96], [-14, 70], [14, 74]]) block(sandDark, TX + lx, PY + 0.45, FZ + lz, 3.4, 0.9, 1.0, { collide: true });
  const fallen = mesh(cylG, sand, TX + 30, PY + 1.2, FZ + 52, { rz: Math.PI / 2, ry: 0.4 });
  fallen.scale.set(1.2, 9, 1.2);
  world.box(TX + 30, PY + 1.2, FZ + 52, 8.5, 2.4, 3.2);
  for (let i = 0; i < 14; i++) {
    const x = TX + 30 + (rng() - 0.5) * 10, z = FZ + 52 + (rng() - 0.5) * 8, s = 0.4 + rng() * 0.8;
    block(sandDark, x, PY + s * 0.4, z, s, s * 0.8, s * 1.2, { ry: rng() * 3 });
  }
  for (const [lx, lz, s] of [[-32, 58, 1.3], [-30, 60, 1.2], [34, 86, 1.2], [-44, 40, 1.3]]) placeProp(scene, 'Crate', TX + lx, PY, FZ + lz, rng() * 3, s);
  for (const [lx, lz] of [[-32, 58], [-30, 60], [34, 86], [-44, 40]]) world.box(TX + lx, PY + 0.65, FZ + lz, 1.3, 1.3, 1.3);
  // a vulture droid brought down on the plaza, still burning
  const wreck = buildVulture();
  wreck.position.set(TX - 30, PY + 1.2, FZ + 94);
  wreck.rotation.set(0.25, 0.8, 0.9);
  wreck.scale.setScalar(1.5);
  scene.add(wreck);
  world.box(TX - 30, PY + 1.2, FZ + 94, 7, 2.4, 5);
  const fires = [new THREE.Vector3(TX - 30, PY + 1.6, FZ + 94)];
  const smoulder = new THREE.Vector3(TX + 31, PY + 0.4, FZ + 50);

  const V = (x, z) => new THREE.Vector3(x, PY, z);
  const onPlaza = (p) => Math.abs(p.x - TX) < 56 && p.z > FZ + 4 && p.z < FZ + 110;
  const freeAt = (p, pad = 1) => {
    if (world.groundAt(p.x, p.z, p.y + 0.4, 0.5) !== p.y) return false;
    for (const b of world.boxes) {
      if (b.tag === 'floor' || !b.move || b.max.y < p.y + 0.2 || b.min.y > p.y + 3) continue;
      if (p.x > b.min.x - pad && p.x < b.max.x + pad && p.z > b.min.z - pad && p.z < b.max.z + pad) return false;
    }
    return true;
  };
  const exterior = {
    name: 'temple', y: PY, center: V(TX, FZ + 56),
    bounds: { minX: TX - 56, maxX: TX + 56, minZ: FZ + 3, maxZ: FZ + 110 },
    flyBounds: { minX: TX - 70, maxX: TX + 70, minZ: FZ + 4, maxZ: FZ + 130 },
    avoid: null, outline: [[TX - 58, FZ], [TX + 58, FZ], [TX + 58, FZ + 112], [TX - 58, FZ + 112]],
    objective: { x: TX, z: FZ + 4 }, objectiveText: 'DEFEND THE JEDI TEMPLE',
    spawns: {
      gates: [{ pos: V(TX - 20, FZ + 113), dir: new THREE.Vector3(0, 0, -1) }, { pos: V(TX + 20, FZ + 113), dir: new THREE.Vector3(0, 0, -1) }, { pos: V(TX, FZ + 113), dir: new THREE.Vector3(0, 0, -1) }],
      doors,
      edge() {
        const s = Math.random() < 0.5 ? -1 : 1;
        return Math.random() < 0.6 ? new THREE.Vector3(TX + s * (64 + Math.random() * 8), PY - 30 - Math.random() * 15, FZ + 20 + Math.random() * 80)
          : new THREE.Vector3(TX + (Math.random() - 0.5) * 90, PY - 30 - Math.random() * 15, FZ + 120 + Math.random() * 8);
      },
      drop() {
        for (let i = 0; i < 30; i++) {
          const p = V(TX + (Math.random() - 0.5) * 100, FZ + 12 + Math.random() * 94);
          if (onPlaza(p) && freeAt(p)) return p;
        }
        return V(TX, FZ + 60);
      },
    },
    playerSpawn: V(TX + 3, FZ + 14), allySpawn: V(TX - 3, FZ + 15),
    shadowTarget: V(TX, FZ + 56), sunIntensity: 4.2, hemi: 2.0, dropDir: new THREE.Vector3(0, 0, 1),
  };

  // ------------------------------------------------------------------ the great hall
  const hz0 = FZ - 4, hz1 = FZ - HL, hzc = (hz0 + hz1) / 2;
  const hs = std(0xcdc3ae, 0.8, 0.05), hd = std(0x9e9480, 0.85, 0.05);
  const floorTex = stoneTexture(21, '#3f3c3a', 6);
  floorTex.repeat.set((HW * 2) / 6, HL / 6);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(HW * 2, HL), std(0xffffff, 0.2, 0.25, { map: floorTex }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(TX, PY + 0.02, hzc);
  floor.receiveShadow = true;
  scene.add(floor);
  world.add(TX - HW, PY - 2, hz1, TX + HW, PY, hz0, { tag: 'floor' });
  const carpet = std(0x1e3354, 0.95, 0, inlay), gold = std(0xb8944c, 0.7, 0.25, inlay);
  block(carpet, TX, PY + 0.04, hzc - 2, 5, 0.02, HL - 10, { cast: false });
  for (const sx of [-2.6, 2.6]) block(gold, TX + sx, PY + 0.05, hzc - 2, 0.16, 0.02, HL - 10, { cast: false });
  // walls, ceiling with skylight slots between the column bays
  for (const sx of [-1, 1]) {
    block(hs, TX + sx * (HW + 0.5), PY + HH / 2, hzc, 1, HH, HL + 2, { collide: true });
    // tall windows glowing with daylight high on the walls, warm sconces low down
    for (let z = hz0 - 7.5; z > hz1 + 4; z -= 9) {
      block(glow(1.1, 0.88, 0.6), TX + sx * (HW - 0.05), PY + 19.5, z, 0.1, 7, 2.2, { cast: false });
      block(warm, TX + sx * (HW - 0.1), PY + 6, z, 0.2, 0.6, 0.35, { cast: false });
    }
  }
  block(hs, TX, PY + HH / 2, hz1 - 0.5, HW * 2 + 2, HH, 1, { collide: true });
  block(hs, TX, PY + HH / 2, hz0 + 0.6, HW * 2 + 2, HH, 1.2, { collide: true });
  block(warm, TX, PY + 10.5, hz0 + 0.05, 1.2, 21, 0.1, { cast: false });
  for (let z = hz0 - 2; z > hz1; z -= 9) {
    // ceiling beams over each bay; the gaps between them are open skylights
    block(hd, TX, PY + HH + 0.6, z, HW * 2 + 2, 1.2, 4.5);
  }
  const columns = [];
  for (let z = hz0 - 7.5; z > hz1 + 4; z -= 9) for (const sx of [-1, 1]) {
    const x = TX + sx * 10.5;
    block(hd, x, PY + 0.6, z, 3, 1.2, 3);
    block(hs, x, PY + HH / 2, z, 2.2, HH, 2.2);
    block(hd, x, PY + HH - 1.2, z, 3, 1.4, 3);
    world.add(x - 1.5, PY, z - 1.5, x + 1.5, PY + HH, z + 1.5);
    // fluting on every face, and a carved band a third of the way up
    for (const o of [-0.6, 0, 0.6]) {
      block(hd, x + o, PY + HH / 2, z - 1.12, 0.22, HH - 4, 0.06, { cast: false });
      block(hd, x + o, PY + HH / 2, z + 1.12, 0.22, HH - 4, 0.06, { cast: false });
      block(hd, x - 1.12, PY + HH / 2, z + o, 0.06, HH - 4, 0.22, { cast: false });
      block(hd, x + 1.12, PY + HH / 2, z + o, 0.06, HH - 4, 0.22, { cast: false });
    }
    block(hd, x, PY + 8, z, 2.5, 0.7, 2.5);
    columns.push([x, z]);
  }
  // hanging lanterns down the nave
  const lanternGlow = glow(1.6, 1.0, 0.45);
  for (let z = hz0 - 12; z > hz1 + 8; z -= 9) for (const sx of [-1, 1]) {
    block(darkStone, TX + sx * 5.5, PY + 17.5, z, 0.06, HH - 17, 0.06, { cast: false });
    block(bronze, TX + sx * 5.5, PY + 9.1, z, 0.9, 0.18, 0.9);
    block(lanternGlow, TX + sx * 5.5, PY + 8.6, z, 0.6, 0.8, 0.6, { cast: false });
    block(bronze, TX + sx * 5.5, PY + 8.1, z, 0.75, 0.14, 0.75);
  }
  // a gallery ledge with a balustrade along each side wall
  for (const sx of [-1, 1]) {
    block(hd, TX + sx * (HW - 1.0), PY + 11, hzc, 2, 0.6, HL - 2);
    block(hs, TX + sx * (HW - 2.0), PY + 11.8, hzc, 0.25, 1.0, HL - 2, { cast: false });
  }
  // banners between the columns of each aisle
  for (let z = hz0 - 12; z > hz1 + 6; z -= 18) for (const sx of [-1, 1]) {
    const b = mesh(new THREE.PlaneGeometry(3.4, 13), bannerMat, TX + sx * (HW - 0.1), PY + 12, z, { ry: -sx * Math.PI / 2, cast: false });
    b.userData.dynamic = true;
  }
  // sunlight pouring through the skylights
  const shaftMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.78, 0.52), transparent: true, opacity: 0.016, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  for (let z = hz0 - 6.5; z > hz1 + 4; z -= 18) {
    const s = mesh(new THREE.BoxGeometry(HW * 0.8, HH + 6, 1.6), shaftMat, TX - 3, PY + HH / 2, z + 2.5, { rx: -0.32, rz: 0.12, cast: false });
    s.userData.dynamic = true;
    s.renderOrder = 9;
  }
  // the archives end: a dais, a great statue and glowing record stacks
  block(hd, TX, PY + 0.4, hz1 + 6, 22, 0.8, 8, { collide: true });
  statues.push(statue(TX, hz1 + 5, 0, 5.4, PY + 0.8));
  for (const sx of [-1, 1]) for (let i = 0; i < 3; i++) {
    block(darkStone, TX + sx * (6 + i * 2.6), PY + 4, hz1 + 1.6, 2, 8, 1);
    for (let k = 0; k < 6; k++) block(blueLight, TX + sx * (6 + i * 2.6), PY + 1 + k * 1.2, hz1 + 2.15, 1.6, 0.08, 0.05, { cast: false });
  }
  // cover: stone benches, broken column drums, a toppled statue plinth, clone barricades, planters
  for (let z = hz0 - 12; z > hz1 + 14; z -= 18) for (const sx of [-1, 1]) block(hd, TX + sx * 5, PY + 0.45, z, 3.2, 0.9, 1.0, { collide: true });
  for (const [lx, lz] of [[4, -30], [-6, -50], [7, -66]]) {
    const d = mesh(cylG, sand, TX + lx, PY + 0.9, FZ + lz);
    d.scale.set(1.1, 1.8, 1.1);
    world.add(TX + lx - 1.1, PY, FZ + lz - 1.1, TX + lx + 1.1, PY + 1.8, FZ + lz + 1.1);
  }
  const hb = (x, z, alongX, len) => {
    world.box(x, PY + 0.6, z, alongX ? len : 0.6, 1.2, alongX ? 0.6 : len);
    placeProp(scene, 'Barricade', x, PY, z, alongX ? Math.PI : Math.PI / 2, [len / 4, 1, 1]);
  };
  hb(TX - 3, FZ - 20, true, 5); hb(TX + 5, FZ - 22, true, 4); hb(TX - 14, FZ - 40, false, 4); hb(TX + 14, FZ - 56, false, 4);
  for (const [lx, lz] of [[-14, -24], [14, -24], [-14, -76], [14, -76]]) {
    block(hd, TX + lx, PY + 0.5, FZ + lz, 2.4, 1, 2.4, { collide: true });
    tree(TX + lx, FZ + lz, 0.8, PY + 1);
  }

  const hallDoors = [];
  for (const sx of [-1, 1]) for (const lz of [-34, -62]) {
    const x = TX + sx * (HW - 0.2);
    block(darkStone, x, PY + 3, FZ + lz, 0.3, 6, 3.6, { cast: false });
    hallDoors.push({ pos: new THREE.Vector3(x - sx * 1.2, PY, FZ + lz), dir: new THREE.Vector3(-sx, 0, 0), timer: 0, openFor() {} });
  }
  const inHall = (p) => Math.abs(p.x - TX) < HW - 1 && p.z < hz0 - 2 && p.z > hz1 + 10;
  const hall = {
    name: 'hall', y: PY, center: V(TX, hzc), indoor: true,
    bounds: { minX: TX - HW + 1, maxX: TX + HW - 1, minZ: hz1 + 2, maxZ: hz0 - 1 },
    flyBounds: { minX: TX - HW + 2, maxX: TX + HW - 2, minZ: hz1 + 4, maxZ: hz0 - 3 },
    avoid: null, outline: [[TX - HW, hz0], [TX + HW, hz0], [TX + HW, hz1], [TX - HW, hz1]],
    objective: { x: TX, z: hz1 + 6 }, objectiveText: 'RETAKE THE TEMPLE HALLS',
    spawns: {
      gates: [{ pos: V(TX - 6, hz1 + 11), dir: new THREE.Vector3(0, 0, 1) }, { pos: V(TX + 6, hz1 + 11), dir: new THREE.Vector3(0, 0, 1) }],
      doors: hallDoors,
      edge() { return V(TX + (Math.random() - 0.5) * 20, hz1 + 14).setY(PY + 18); },
      drop() {
        for (let i = 0; i < 30; i++) {
          const p = V(TX + (Math.random() - 0.5) * (HW * 2 - 4), hz0 - 10 - Math.random() * (HL - 26));
          if (inHall(p) && freeAt(p)) return p;
        }
        return V(TX, hzc);
      },
    },
    playerSpawn: V(TX + 2.5, hz0 - 9), allySpawn: V(TX - 2.5, hz0 - 10),
    shadowTarget: V(TX, hzc), sunIntensity: 3.6, hemi: 1.25,
  };

  const council = buildCouncil(scene, world, COUNCIL);
  // Act IV: the Temple burns (Order 66): smoke pouring off its terraces and spires
  const burnPoints = [[-150, 0, 120], [140, 40, 60], [-90, 110, -100], [100, 165, -30], [-40, 165, 70], [60, 230, -60], [0, 40, 150]].map(([x, y, z]) => new THREE.Vector3(TX + x, y, TZ + z));
  const _f = new THREE.Vector3();
  return {
    exterior, hall, council, statues, columns, lamps, FZ, hz0, hz1,
    update(dt, t) { for (const f of updaters) f(dt, t); council.update(dt); },
    /** Order 66: the Temple on fire (big slow smoke columns you can see from the chamber windows and the plaza). */
    burn(dt, fx) {
      for (const p of burnPoints) {
        // tall leaning columns of smoke, dark at the fire and greying as they spread (readable from across the city)
        if (Math.random() < dt * 6) fx.smoke.emit(p.x + (Math.random() - 0.5) * 12, p.y + 4, p.z + (Math.random() - 0.5) * 12, 2.5 + (Math.random() - 0.5) * 2, 9 + Math.random() * 4, 1 + (Math.random() - 0.5) * 2,
          17 + Math.random() * 6, 28, 110, 0.05, 0.045, 0.04, 1, -0.12, 0.1, 0.03, 0.17, 0.15, 0.14, (Math.random() - 0.5) * 0.2);
        if (Math.random() < dt * 6) fx.fire.emit(p.x + (Math.random() - 0.5) * 8, p.y + 1.5, p.z + (Math.random() - 0.5) * 8, 0, 3 + Math.random() * 3, 0,
          1.4 + Math.random(), 8, 15, 4.5, 2.2, 0.7, 1, -1, 1, 0, 1.2, 0.2, 0.04, (Math.random() - 0.5) * 2);
      }
    },
    /** Smoke and flames from the wreckage (only while the fight is here). */
    fxUpdate(dt, fx, arena) {
      if (arena !== exterior) return;
      for (const p of fires) {
        if (Math.random() < 0.6) fx.fireTrail(_f.copy(p).add({ x: (Math.random() - 0.5) * 2, y: 0, z: (Math.random() - 0.5) * 2 }), 1.2);
        if (Math.random() < 0.25) fx.smokePuff(_f.copy(p).setY(p.y + 1.5), 2.4, 0.1);
      }
      if (Math.random() < 0.15) fx.smokePuff(_f.copy(smoulder).add({ x: (Math.random() - 0.5) * 3, y: 0.5, z: (Math.random() - 0.5) * 3 }), 1.6, 0.12);
    },
  };
}
