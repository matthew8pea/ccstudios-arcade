import * as THREE from 'three';
import { mulberry32, canvasTexture, TAU } from './util.js';
import { placeProp, propObject } from './assets.js';

/**
 * The lower levels: a street canyon at the foot of the tower, 160 m below the roof.
 *
 *   north (z 50)  turbolift lobby in the tower base, traffic tunnel above it
 *   west          night-market promenade along the railing over the deeper canyon
 *   middle        speeder road (x -9..9) with parked speeders and a Republic checkpoint
 *   east          shopping arcade: storefronts built into the building, awnings over the sidewalk
 *   south (z 134) gate onto the bridge where the droids come in
 *   overhead      skybridges, strings of lights, holo-billboards, low traffic out of the tunnel
 */
export const STREET_Y = -160;
const Y = STREET_Y;
const X0 = -24, X1 = 24, Z0 = 50, Z1 = 134;
const ROAD = 9; // half-width of the speeder road
/** Where Cody and Fox crash down: a night-market stall canopy on the west promenade. */
export const LANDING = new THREE.Vector3(-16.5, Y, 64);

function roadTexture() {
  return canvasTexture(512, 1024, (g, w, h) => {
    const rng = mulberry32(31);
    g.fillStyle = '#26282d'; g.fillRect(0, 0, w, h);
    for (let k = 0; k < 9000; k++) {
      g.fillStyle = rng() < 0.5 ? `rgba(0,0,0,${rng() * 0.2})` : `rgba(255,255,255,${rng() * 0.05})`;
      g.fillRect(rng() * w, rng() * h, 1 + rng() * 3, 1 + rng() * 3);
    }
    for (let k = 0; k < 14; k++) {
      const x = rng() * w, y = rng() * h, r = 30 + rng() * 80;
      const grd = g.createRadialGradient(x, y, 0, x, y, r);
      grd.addColorStop(0, 'rgba(8,8,10,0.45)'); grd.addColorStop(1, 'rgba(8,8,10,0)');
      g.fillStyle = grd; g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    // tyre-polished lanes, lane lines, a dashed centre line
    g.fillStyle = 'rgba(255,255,255,0.035)';
    g.fillRect(w * 0.18, 0, w * 0.16, h); g.fillRect(w * 0.66, 0, w * 0.16, h);
    g.fillStyle = 'rgba(210,220,230,0.55)';
    g.fillRect(14, 0, 8, h); g.fillRect(w - 22, 0, 8, h);
    g.fillStyle = '#d9a12a';
    for (let y = 0; y < h; y += 96) { g.fillRect(w / 2 - 12, y, 7, 56); g.fillRect(w / 2 + 5, y, 7, 56); }
  }, { repeat: [1, 3] });
}

function pavingTexture() {
  return canvasTexture(512, 512, (g, w, h) => {
    const rng = mulberry32(12);
    g.fillStyle = '#4a4d55'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 64) for (let x = 0; x < w; x += 128) {
      const v = Math.floor(rng() * 16) - 8, o = (y / 64) % 2 ? 64 : 0;
      g.fillStyle = `rgb(${76 + v},${79 + v},${87 + v})`;
      g.fillRect(x + o + 2, y + 2, 124, 60);
      g.fillRect(x + o - 126, y + 2, 124, 60);
    }
    for (let k = 0; k < 4000; k++) {
      g.fillStyle = `rgba(0,0,0,${rng() * 0.14})`;
      g.fillRect(rng() * w, rng() * h, 2 + rng() * 3, 2 + rng() * 3);
    }
  }, { repeat: [4, 20] });
}

/** Neon sign: a word, or alien glyphs when no text is given. */
function signTexture(seed, hue, text, w = 512, h = 128) {
  return canvasTexture(w, h, (g) => {
    const rng = mulberry32(seed);
    g.clearRect(0, 0, w, h);
    g.fillStyle = `hsla(${hue},80%,10%,0.85)`; g.fillRect(0, 0, w, h);
    g.strokeStyle = `hsla(${hue},100%,70%,1)`; g.lineWidth = 6; g.strokeRect(6, 6, w - 12, h - 12);
    g.fillStyle = `hsla(${hue},100%,78%,1)`;
    g.shadowColor = `hsla(${hue},100%,60%,1)`; g.shadowBlur = 18;
    if (text) {
      g.font = `bold ${Math.round(h * 0.56)}px Bahnschrift, sans-serif`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(text, w / 2, h / 2 + 2);
    } else {
      for (let x = 28; x < w - 40; x += 38) {
        const k = Math.floor(rng() * 3);
        if (k === 0) g.fillRect(x, h * 0.25, 24, h * 0.5);
        else if (k === 1) { g.fillRect(x, h * 0.25, 24, 12); g.fillRect(x, h * 0.45, 24, 12); g.fillRect(x, h * 0.65, 24, 10); }
        else { g.beginPath(); g.moveTo(x, h * 0.75); g.lineTo(x + 12, h * 0.25); g.lineTo(x + 24, h * 0.75); g.fill(); }
      }
    }
  });
}

function glowSpot() {
  return canvasTexture(128, 128, (g, w, h) => {
    const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.35, 'rgba(255,255,255,0.35)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
  });
}

export function buildStreet(scene, world) {
  const updaters = [];
  const steam = [];
  const boxG = new THREE.BoxGeometry(1, 1, 1);
  const rng = mulberry32(909);
  const std = (color, rough = 0.7, metal = 0.3, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...extra });
  const glow = (r, g, b) => new THREE.MeshBasicMaterial({ color: new THREE.Color(r, g, b) });
  const darkMetal = std(0x2a2e34, 0.5, 0.6), trim = std(0x7a8089, 0.5, 0.5), white = std(0xcfccc4, 0.5, 0.15);
  const facade = std(0x545a63, 0.65, 0.35), grime = std(0x3b3f45, 0.85, 0.3);
  const warmLamp = glow(3.4, 2.1, 0.9), blueGlow = glow(0.4, 1.3, 3.2), redGlow = glow(3.6, 0.35, 0.2);
  const block = (mat, cx, cy, cz, sx, sy, sz, opts = {}) => {
    const m = new THREE.Mesh(boxG, mat);
    m.scale.set(sx, sy, sz);
    m.position.set(cx, Y + cy, cz);
    m.castShadow = opts.cast !== false;
    m.receiveShadow = true;
    scene.add(m);
    if (opts.collide) world.box(cx, Y + cy, cz, sx, sy, sz, opts.collide === true ? {} : opts.collide);
    return m;
  };
  const plane = (mat, x, y, z, w, h, ry = 0) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    m.position.set(x, Y + y, z);
    m.rotation.y = ry;
    scene.add(m);
    return m;
  };
  const neonMat = (seed, hue, text, w, h, k = 2.2) => new THREE.MeshBasicMaterial({
    map: signTexture(seed, hue, text, w, h), color: new THREE.Color().setHSL(hue / 360, 0.85, 0.6).multiplyScalar(k), transparent: true, depthWrite: false, side: THREE.DoubleSide,
  });
  // fake wet-pavement reflections: soft additive pools of light on the ground
  const spotTex = glowSpot();
  const reflection = (x, z, color, sx, sz, a = 0.35) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(sx, sz), new THREE.MeshBasicMaterial({ map: spotTex, color: new THREE.Color(color).multiplyScalar(a), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, Y + 0.02, z);
    m.renderOrder = 4;
    scene.add(m);
  };

  // ---------------------------------------------------------------- ground
  const road = new THREE.Mesh(new THREE.PlaneGeometry(ROAD * 2, Z1 - Z0), std(0xffffff, 0.55, 0.25, { map: roadTexture() }));
  road.rotation.x = -Math.PI / 2;
  road.position.set(0, Y + 0.005, (Z0 + Z1) / 2);
  road.receiveShadow = true;
  scene.add(road);
  const paving = std(0xffffff, 0.8, 0.15, { map: pavingTexture() });
  for (const [x0, x1] of [[X0, -ROAD], [ROAD, X1]]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, Z1 - Z0), paving);
    m.rotation.x = -Math.PI / 2;
    m.position.set((x0 + x1) / 2, Y + 0.01, (Z0 + Z1) / 2);
    m.receiveShadow = true;
    scene.add(m);
  }
  const slab = new THREE.Mesh(new THREE.BoxGeometry(X1 - X0, 2, Z1 - Z0), grime);
  slab.position.set(0, Y - 1.02, (Z0 + Z1) / 2);
  scene.add(slab);
  world.add(X0, Y - 2, Z0, X1, Y, Z1, { tag: 'floor' });
  // curbs (with crossings at z 74 and z 110), lane guide lights along them
  for (const sx of [-ROAD, ROAD]) {
    for (const [z0, z1] of [[Z0, 71.5], [76.5, 107.5], [112.5, Z1]]) {
      block(trim, sx, 0.06, (z0 + z1) / 2, 0.35, 0.12, z1 - z0, { cast: false });
      block(blueGlow, sx - Math.sign(sx) * 0.35, 0.02, (z0 + z1) / 2, 0.06, 0.03, z1 - z0, { cast: false });
    }
  }
  for (const z of [74, 110]) {
    for (let x = -ROAD + 1; x < ROAD; x += 1.6) block(std(0xd9dde2, 0.7, 0.1), x, 0.012, z, 0.9, 0.02, 4, { cast: false });
  }

  // ---------------------------------------------------------------- invisible walls + bridge
  world.box(0, Y + 3, Z0 - 0.5, 60, 6, 1, {});
  world.box(X1 + 0.5, Y + 3, 92, 1, 6, 90, {});
  world.box(-15, Y + 3, Z1 + 0.4, 22, 6, 0.8, { shot: false, walk: false });
  world.box(15, Y + 3, Z1 + 0.4, 22, 6, 0.8, { shot: false, walk: false });
  for (const sx of [-4.2, 4.2]) world.box(sx, Y + 3, 144, 0.4, 6, 20, { shot: false, walk: false });
  world.box(X0 - 0.3, Y + 3, 92, 0.6, 6, 86, { shot: false, walk: false });
  block(std(0x34373d, 0.8, 0.3), 0, -0.6, 144, 8, 1.2, 20, { collide: { tag: 'floor' } });
  block(darkMetal, 0, -3.5, 144, 4, 5, 20);
  for (const sx of [-4.1, 4.1]) block(trim, sx, 1.1, 144, 0.12, 0.08, 20, { cast: false });

  // ---------------------------------------------------------------- west: promenade + railing over the canyon
  for (let z = Z0 + 2; z < Z1; z += 3) block(trim, X0 + 0.2, 0.55, z, 0.1, 1.1, 0.1, { cast: false });
  block(trim, X0 + 0.2, 1.1, 92, 0.14, 0.08, Z1 - Z0, { cast: false });
  block(trim, X0 + 0.2, 0.6, 92, 0.06, 0.05, Z1 - Z0, { cast: false });
  block(blueGlow, X0 + 0.25, 0.04, 92, 0.08, 0.04, Z1 - Z0, { cast: false });
  // tall light-string masts along the railing
  const westMasts = [58, 70, 82, 94, 106, 118, 130];
  for (const z of westMasts) {
    block(darkMetal, X0 + 0.8, 3.6, z, 0.18, 7.2, 0.18);
    block(warmLamp, X0 + 0.8, 7.25, z, 0.32, 0.18, 0.32, { cast: false });
  }
  // benches + planters looking out over the canyon
  const bench = (x, z) => {
    block(std(0x6a5440, 0.8, 0.1), x, 0.45, z, 0.6, 0.08, 2.2, { collide: true });
    block(darkMetal, x + 0.25, 0.75, z, 0.08, 0.5, 2.2);
    for (const dz of [-0.9, 0.9]) block(darkMetal, x, 0.22, z + dz, 0.5, 0.44, 0.1);
  };
  const planterMat = std(0x4a4f57, 0.7, 0.3), soilMat = std(0x2a211b, 1, 0);
  const leafMats = [std(0x3f6b36, 0.95, 0, { flatShading: true }), std(0x2f5a2c, 0.95, 0, { flatShading: true }), std(0x557d3a, 0.95, 0, { flatShading: true })];
  const leafGeo = new THREE.IcosahedronGeometry(1, 1);
  const planter = (x, z, s = 1.6) => {
    block(planterMat, x, 0.45, z, s, 0.9, s, { collide: true });
    block(trim, x, 0.92, z, s + 0.08, 0.06, s + 0.08);
    block(soilMat, x, 0.9, z, s - 0.12, 0.04, s - 0.12, { cast: false });
    // a clump of leafy lumps, lit in a few greens
    for (let i = 0; i < 5; i++) {
      const r = s * (i ? 0.2 + rng() * 0.12 : 0.34);
      const a = rng() * Math.PI * 2, d = i ? s * 0.26 : 0;
      const m = new THREE.Mesh(leafGeo, leafMats[i % 3]);
      m.scale.set(r, r * 0.85, r);
      m.rotation.set(rng() * 3, rng() * 3, 0);
      m.position.set(x + Math.cos(a) * d, Y + 1.0 + r * 0.8 + (i ? 0 : 0.15), z + Math.sin(a) * d);
      m.castShadow = true;
      scene.add(m);
    }
  };
  for (const z of [56, 80, 104, 127]) bench(-22.4, z);
  for (const z of [62, 92, 116]) planter(-22.6, z, 1.3);

  // the night market: two or three stalls per cluster, in a row along the promenade
  const cloth = [0xa0482e, 0x2f6e8a, 0x8a7a2f, 0x5d3a7a, 0x2f7a52, 0x8a2f4a];
  const clothMats = cloth.map((c) => std(c, 0.95, 0));
  const valanceMats = cloth.map((c) => std(new THREE.Color(c).multiplyScalar(0.6), 0.95, 0));
  const lanternMat = glow(3.6, 1.6, 0.5);
  const lanternMats = [glow(1.5, 0.66, 0.2), glow(1.4, 0.3, 0.22), glow(0.35, 1.1, 0.68), glow(1.2, 0.95, 0.3)];
  const trayMat = std(0x3a2c22, 0.85, 0.05);
  const fruitMats = [std(0xc8432a, 0.6, 0), std(0xe0a12c, 0.6, 0), std(0x6aa63a, 0.6, 0), std(0x8a3a7a, 0.6, 0)];
  const jarMats = [std(0x6fa8b8, 0.15, 0.1, { transparent: true, opacity: 0.75 }), std(0xb8865a, 0.3, 0.1, { transparent: true, opacity: 0.8 })];
  const gadgetMat = std(0x2a2e34, 0.45, 0.6), screenMats = [glow(0.4, 1.4, 3), glow(0.6, 2.6, 1.2), glow(3, 0.9, 0.4)];
  const fruitGeo = new THREE.SphereGeometry(1, 10, 8), jarGeo = new THREE.CylinderGeometry(1, 1, 1, 12);
  const piece = (geo, mat, x, y, z, sx, sy, sz) => {
    const m = new THREE.Mesh(geo, mat);
    m.scale.set(sx, sy, sz);
    m.position.set(x, Y + y, z);
    m.castShadow = true;
    scene.add(m);
    return m;
  };
  /** What a stall sells, laid out on its counter (counter top at y 1.0, x0 its centre line). */
  const goods = (kind, x0, z, add) => {
    if (kind === 0) {
      // fruit trays
      for (let t = 0; t < 3; t++) {
        const tz = z - 1.1 + t * 1.1;
        add(block(trayMat, x0, 1.04, tz, 0.9, 0.06, 0.8));
        const fm = fruitMats[(t + Math.floor(rng() * 4)) % 4];
        for (let i = 0; i < 9; i++) add(piece(fruitGeo, fm, x0 - 0.3 + (i % 3) * 0.3 + (rng() - 0.5) * 0.06, 1.13 + (i === 4 ? 0.06 : 0), tz - 0.24 + Math.floor(i / 3) * 0.24, 0.1, 0.1, 0.1));
      }
    } else if (kind === 1) {
      // jars and bottles
      for (let i = 0; i < 9; i++) {
        const h = 0.18 + rng() * 0.22;
        add(piece(jarGeo, jarMats[i % 2], x0 - 0.25 + (i % 3) * 0.25, 1.0 + h / 2, z - 1.2 + Math.floor(i / 3) * 1.1 + (rng() - 0.5) * 0.2, 0.07, h, 0.07));
      }
    } else {
      // droid parts and gadgets with little lit screens
      for (let i = 0; i < 5; i++) {
        const gz = z - 1.3 + i * 0.65, w = 0.25 + rng() * 0.2, h = 0.12 + rng() * 0.18;
        add(block(gadgetMat, x0 + (rng() - 0.5) * 0.3, 1.0 + h / 2, gz, w, h, 0.3));
        add(block(screenMats[i % 3], x0 + (rng() - 0.5) * 0.2, 1.0 + h + 0.01, gz, w * 0.6, 0.015, 0.18, { cast: false }));
      }
    }
  };
  const stall = (z, k, landing = false) => {
    const x = LANDING.x, g = landing ? new THREE.Group() : null;
    const add = (m) => { if (g) { scene.remove(m); m.position.y -= Y; m.position.x -= x; m.position.z -= z; g.add(m); } };
    add(block(std(0x6a5440, 0.8, 0.1), x + 0.6, 0.5, z, 1.2, 1.0, 3.4));
    if (!landing) world.box(x + 0.6, Y + 0.5, z, 1.2, 1.0, 3.4);
    for (const [dx, dz] of [[-1.4, -1.8], [1.4, -1.8], [-1.4, 1.8], [1.4, 1.8]]) add(block(trim, x + dx, 1.5, z + dz, 0.08, 3.0, 0.08));
    const roof = block(clothMats[k % cloth.length], x, 3.05, z, 3.4, 0.08, 4.2);
    roof.rotation.z = -0.12;
    add(roof);
    // a cloth valance with a fringe along the front edge of the canopy
    add(block(valanceMats[k % cloth.length], x + 1.72, 2.72, z, 0.04, 0.34, 4.2));
    for (let i = 0; i < 14; i++) add(block(valanceMats[k % cloth.length], x + 1.74, 2.5, z - 2.0 + i * 0.31, 0.02, 0.12, 0.12, { cast: false }));
    goods(k % 3, x + 0.6, z, add);
    // a string of small lanterns under the canopy edge
    for (let i = 0; i < 4; i++) add(block(lanternMats[(i + k) % 4], x + 1.55, 2.38 - Math.sin((i / 3) * Math.PI) * 0.12, z - 1.5 + i, 0.16, 0.22, 0.16, { cast: false }));
    add(block(lanternMat, x + 1.3, 2.7, z, 0.26, 0.34, 0.26, { cast: false }));
    if (g) {
      g.position.set(x, Y, z);
      scene.add(g);
      world.box(x + 0.6, Y + 0.5, z, 1.2, 1.0, 3.4);
      g.userData.cloth = roof;
      return g;
    }
    reflection(x + 2.8, z, 0xff9a4a, 2.5, 3.5, 0.25);
    return null;
  };
  let awning = null;
  for (const [z, k] of [[59, 0], [64, 1], [69, 2], [92, 3], [97, 4], [117, 5], [122, 0]]) {
    const g = stall(z, k, z === LANDING.z);
    if (g) awning = g;
  }

  // ---------------------------------------------------------------- east: the shopping arcade
  block(facade, X1 + 0.1, 5, 92, 0.8, 10, Z1 - Z0 + 2);
  block(darkMetal, X1 - 0.35, 9.6, 92, 0.3, 0.5, Z1 - Z0);
  const shops = [];
  const SHOPS = [
    { z: 59, hue: 28, text: 'NOODLES' }, { z: 72, hue: 200, text: null }, { z: 87, hue: 18, text: 'CANTINA', w: 12 },
    { z: 102, hue: 300, text: 'HOLO-NET' }, { z: 116, hue: 150, text: 'REPAIRS' }, { z: 128, hue: 45, text: null },
  ];
  for (const s of SHOPS) {
    const w = s.w || 10, z = s.z;
    const col = new THREE.Color().setHSL(s.hue / 360, 0.8, 0.55);
    // pilasters, recessed shop window with a lit interior, doorway
    for (const dz of [-w / 2, w / 2]) block(white, X1 - 0.6, 4.6, z + dz, 1.0, 9.2, 0.8, { collide: true });
    block(new THREE.MeshBasicMaterial({ color: col.clone().multiplyScalar(0.9) }), X1 - 0.05, 2.0, z - 1.4, 0.05, 3.2, w - 4.2, { cast: false });
    block(std(0x0d141c, 0.06, 0.8, { transparent: true, opacity: 0.55 }), X1 - 0.45, 2.0, z - 1.4, 0.04, 3.2, w - 4.2, { cast: false });
    block(darkMetal, X1 - 0.45, 0.2, z - 1.4, 0.3, 0.4, w - 4.2);
    block(new THREE.MeshBasicMaterial({ color: 0x07080a }), X1 - 0.3, 1.5, z + w / 2 - 1.6, 0.1, 3.0, 1.8, { cast: false });
    block(warmLamp, X1 - 0.35, 3.1, z + w / 2 - 1.6, 0.12, 0.08, 1.8, { cast: false });
    // sign band + awning over the sidewalk
    const sign = plane(neonMat(Math.floor(rng() * 1e6), s.hue, s.text, 512, 128), X1 - 0.75, 5.1, z, w - 1.6, (w - 1.6) / 4, -Math.PI / 2);
    const base = sign.material.color.clone(), ph = rng() * 10;
    updaters.push((dt, t) => sign.material.color.copy(base).multiplyScalar(0.86 + 0.14 * Math.sin(t * 9 + ph) * Math.sin(t * 2.3 + ph)));
    const aw = block(std(new THREE.Color().setHSL(s.hue / 360, 0.45, 0.28), 0.95, 0), X1 - 2.4, 3.85, z, 3.2, 0.1, w - 1.2);
    aw.rotation.z = 0.2;
    block(new THREE.MeshBasicMaterial({ color: col.clone().multiplyScalar(2.6) }), X1 - 3.95, 3.55, z, 0.06, 0.06, w - 1.4, { cast: false });
    reflection(X1 - 3.5, z, col, 5, w, 0.45);
    shops.push({ pos: new THREE.Vector3(X1 - 1.2, Y, z + w / 2 - 1.6) });
  }
  // street lamps along both curbs
  for (const z of [56, 68, 80, 92, 104, 116, 128]) {
    for (const sx of [-1, 1]) {
      const x = sx * (ROAD + 1.4), zz = z + (sx < 0 ? 6 : 0);
      if (zz > Z1 - 2) continue;
      block(darkMetal, x, 2.8, zz, 0.18, 5.6, 0.18);
      block(darkMetal, x - sx * 0.7, 5.55, zz, 1.5, 0.12, 0.2);
      block(warmLamp, x - sx * 1.3, 5.45, zz, 0.45, 0.12, 0.3, { cast: false });
      reflection(x - sx * 1.6, zz, 0xffb066, 4.5, 4.5, 0.3);
    }
  }
  // holo-news kiosk and a couple of planters on the arcade sidewalk
  block(darkMetal, ROAD + 2.5, 1.0, 84, 1.2, 2.0, 1.2, { collide: true });
  plane(neonMat(77, 190, null, 256, 256, 1.6), ROAD + 2.5, 2.9, 84, 1.6, 1.6, Math.PI / 4);
  planter(ROAD + 2.2, 97); planter(ROAD + 2.2, 122);

  // ---------------------------------------------------------------- north: turbolift lobby in the tower base
  block(darkMetal, 0, 5.5, Z0 + 0.25, 26, 11, 0.5);
  block(white, 0, 10.4, Z0 + 0.7, 26.6, 1.2, 1.0);
  block(blueGlow, 0, 9.7, Z0 + 1.22, 24, 0.12, 0.06, { cast: false });
  for (const x of [-12.5, -7.8, 7.8, 12.5]) block(white, x, 5, Z0 + 0.8, 1.2, 10, 1.2, { collide: true });
  for (const x of [-21, 21]) {
    block(grime, x, 8, Z0 + 0.6, 0.5, 16, 0.5);
    block(grime, x + 0.7, 8, Z0 + 0.6, 0.35, 16, 0.35);
  }
  plane(neonMat(5, 40, 'TURBOLIFT', 1024, 128, 2.4), 0, 8.4, Z0 + 1.3, 12, 1.5);
  block(new THREE.MeshBasicMaterial({ color: new THREE.Color(0.35, 0.55, 0.9) }), 0, 2.4, Z0 + 0.55, 4.2, 4.6, 0.05, { cast: false });
  reflection(0, Z0 + 4, 0x6aa8ff, 12, 7, 0.35);
  // the traffic tunnel the low speeders come out of
  block(new THREE.MeshBasicMaterial({ color: 0x050607 }), 0, 17.5, Z0 + 0.2, 14, 5, 0.4, { cast: false });
  for (const sx of [-1, 1]) block(warmLamp, sx * 7.3, 17.5, Z0 + 0.5, 0.25, 5.2, 0.25, { cast: false });
  block(redGlow, 0, 20.3, Z0 + 0.5, 14.5, 0.2, 0.25, { cast: false });
  // sliding turbolift doors in the lobby (droids burst out of these)
  const doors = [];
  for (const x of [-5, 5]) {
    const g = new THREE.Group();
    g.position.set(x, Y, Z0 + 0.6);
    scene.add(g);
    const mk = (dx) => { const m = new THREE.Mesh(boxG, std(0x5a6068, 0.4, 0.6)); m.scale.set(1.75, 3.5, 0.12); m.position.set(dx, 1.75, 0.08); g.add(m); return m; };
    const left = mk(-0.88), right = mk(0.88);
    const lamp = new THREE.Mesh(boxG, blueGlow); lamp.scale.set(3.6, 0.12, 0.1); lamp.position.set(0, 3.7, 0.1); g.add(lamp);
    doors.push({
      pos: new THREE.Vector3(x, Y, Z0 + 2.1), dir: new THREE.Vector3(0, 0, 1), open: 0, timer: 0, left, right, lamp,
      openFor(sec) { this.timer = Math.max(this.timer, sec); },
    });
  }
  updaters.push((dt) => {
    for (const d of doors) {
      d.timer -= dt;
      const target = d.timer > 0 ? 1 : 0;
      d.open += Math.sign(target - d.open) * Math.min(Math.abs(target - d.open), dt * 2.5);
      d.left.position.x = -0.88 - d.open * 1.6;
      d.right.position.x = 0.88 + d.open * 1.6;
      d.lamp.material = d.timer > 0 ? redGlow : blueGlow;
    }
  });

  // ---------------------------------------------------------------- south gate
  {
    const g = new THREE.Group();
    g.position.set(0, Y, Z1 + 0.2);
    const frame = new THREE.Mesh(boxG, darkMetal); frame.scale.set(9, 7, 0.6); frame.position.set(0, 3.5, 0);
    const hole = new THREE.Mesh(boxG, new THREE.MeshBasicMaterial({ color: 0x060708 })); hole.scale.set(7.6, 5.6, 0.62); hole.position.set(0, 2.8, 0);
    const lamp = new THREE.Mesh(boxG, redGlow); lamp.scale.set(7.8, 0.18, 0.66); lamp.position.set(0, 5.75, 0);
    g.add(frame, hole, lamp);
    scene.add(g);
    for (const sx of [-1, 1]) block(grime, sx * 15, 3, Z1 + 0.2, 21, 6, 0.6);
  }
  plane(neonMat(91, 330, null, 512, 256, 1.8), 0, 13, Z1 + 0.6, 16, 8, Math.PI);

  // ---------------------------------------------------------------- overhead: skybridges, light strings, billboards
  const bridge = (z, h) => {
    block(grime, -1.5, h, z, X1 - X0 + 9, 0.7, 3.4);
    for (const dz of [-1.6, 1.6]) {
      block(trim, -1.5, h + 0.9, z + dz, X1 - X0 + 9, 0.08, 0.08, { cast: false });
      for (let x = X0 - 4; x <= X1; x += 3) block(trim, x, h + 0.5, z + dz, 0.08, 0.9, 0.08, { cast: false });
    }
    block(glow(0.15, 0.45, 1.1), -1.5, h - 0.38, z, X1 - X0 + 8, 0.05, 0.3, { cast: false });
    block(darkMetal, X0 - 5, h - 40, z, 2.4, 80 + 0.7, 2.4); // pylon out in the canyon
    block(warmLamp, X0 - 5, h + 1, z, 2.6, 0.2, 2.6, { cast: false });
  };
  bridge(84, 13);
  bridge(112, 24);
  // strings of lights draped across the street from the masts to the arcade
  {
    const bulbs = [];
    for (const z of westMasts) {
      const ax = X0 + 0.8, ay = 7.1, bx = X1 - 0.8, by = 8.6;
      for (let i = 1; i < 30; i++) {
        const t = i / 30, sag = Math.sin(t * Math.PI) * 2.2;
        bulbs.push([ax + (bx - ax) * t, ay + (by - ay) * t - sag, z + Math.sin(t * 9 + z) * 0.2]);
      }
    }
    const inst = new THREE.InstancedMesh(new THREE.SphereGeometry(0.075, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffffff }), bulbs.length);
    const dm = new THREE.Object3D(), c = new THREE.Color();
    bulbs.forEach(([x, y, z], i) => {
      dm.position.set(x, Y + y, z); dm.updateMatrix();
      inst.setMatrixAt(i, dm.matrix);
      c.setHSL([0.08, 0.12, 0.55, 0.9, 0.33][i % 5], 0.9, 0.6).multiplyScalar(2.0);
      inst.setColorAt(i, c);
    });
    scene.add(inst);
    for (const z of westMasts) {
      const pts = [];
      for (let i = 0; i <= 30; i++) { const t = i / 30; pts.push(new THREE.Vector3(X0 + 0.8 + (X1 - X0 - 1.6) * t, Y + 7.1 + 1.5 * t - Math.sin(t * Math.PI) * 2.2 + 0.05, z)); }
      scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x15171a })));
    }
  }
  for (const [x, y, z, ry, w, h, hue, text] of [[X1 - 0.3, 16, 72, -Math.PI / 2, 10, 14, 200, null], [X1 - 0.3, 18, 104, -Math.PI / 2, 8, 16, 330, null], [-14, 14, Z0 + 0.3, 0, 9, 5, 120, 'EAT']]) {
    plane(neonMat(Math.floor(rng() * 1e6), hue, text, 256, 256, 1.9), x, y, z, w, h, ry);
  }
  // pipes running up the arcade wall
  for (const z of [66, 80, 109, 124]) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 30, 10), grime);
    p.position.set(X1 - 0.25, Y + 15 + 9, z);
    p.castShadow = true;
    scene.add(p);
  }

  // ---------------------------------------------------------------- road: parked speeders + a Republic checkpoint
  const speederColors = [0x8a2f2a, 0x2f5a8a, 0xc0b8a0, 0x3f6b4a];
  const parked = (x, z, k, flip) => {
    placeProp(scene, 'Speeder', x, Y + 0.15, z, flip ? Math.PI : 0, 1, { SpeederPaint: speederColors[k % 4] });
    world.box(x, Y + 0.85, z, 1.9, 1.1, 4.6);
    reflection(x, z, 0x7fd0ff, 2.6, 5, 0.25);
  };
  parked(ROAD - 1.8, 62, 0, false); parked(-ROAD + 1.8, 88, 1, true); parked(ROAD - 1.8, 101, 2, false); parked(-ROAD + 1.8, 124, 3, true);
  for (const x of [-6.2, 6.2]) {
    placeProp(scene, 'Barricade', x, Y, 70.5, 0, [1, 1, 1]);
    world.box(x, Y + 0.6, 70.5, 4, 1.2, 0.6);
  }
  const crate = (x, z, s, stack = 1) => {
    for (let k = 0; k < stack; k++) { placeProp(scene, 'Crate', x, Y + k * s, z, rng() * 0.3, s); world.box(x, Y + s / 2 + k * s, z, s, s, s); }
  };
  crate(-19.5, 53.5, 1.3, 2); crate(-18.1, 53.5, 1.3, 1); crate(19.2, 53.5, 1.2, 2); crate(16, 131.5, 1.2, 1); crate(-12.5, 131, 1.3, 2);
  // steam rising from grates in the road
  for (const [x, z] of [[-4, 66], [3.5, 95], [-3, 120]]) {
    block(darkMetal, x, 0.02, z, 1.6, 0.04, 1.2, { cast: false });
    steam.push({ pos: new THREE.Vector3(x, Y + 0.1, z), t: Math.random() });
  }

  // ---------------------------------------------------------------- low traffic out of the tunnel
  const traffic = [];
  for (let i = 0; i < 6; i++) {
    const g = propObject('Speeder', { SpeederPaint: speederColors[i % 4] });
    if (!g) break;
    const south = i % 2 === 0;
    g.userData = { south, x: south ? -3.2 : 3.2, y: 16.8 + (i % 3) * 0.6, z: Z0 - 10 + i * 45, v: 18 + rng() * 6 };
    g.rotation.y = south ? 0 : Math.PI;
    g.traverse((o) => { if (o.isMesh) o.castShadow = false; });
    scene.add(g);
    traffic.push(g);
  }
  updaters.push((dt, t) => {
    for (const g of traffic) {
      const u = g.userData;
      u.z += (u.south ? 1 : -1) * u.v * dt;
      if (u.south && u.z > 300) u.z = Z0 - 12;
      if (!u.south && u.z < Z0 - 12) u.z = 300;
      g.position.set(u.x, Y + u.y + Math.sin(t * 1.3 + u.v) * 0.15, u.z);
    }
  });

  // flickering emergency strobes
  const strobe = glow(4, 0.6, 0.1);
  for (const [x, z] of [[-23.4, 80], [X1 - 0.6, 96], [0, Z0 + 1.0]]) block(strobe, x, 11.2, z, 0.4, 0.25, 0.4, { cast: false });
  const s0 = strobe.color.clone();
  updaters.push((dt, t) => strobe.color.copy(s0).multiplyScalar(Math.sin(t * 7) > 0.3 ? 1 : 0.05));

  // ---------------------------------------------------------------- civilians: walking loops and the ways out
  const V = (x, z) => new THREE.Vector3(x, Y, z);
  const paths = [
    [V(-21, 54), V(-21, 130), V(-12.5, 130), V(-12.5, 54)],
    [V(14, 54), V(14, 130), V(20.3, 130), V(20.3, 54)],
    [V(-12.5, 74), V(12.5, 74), V(12.5, 110), V(-12.5, 110)],
    [V(-8, 56), V(8, 56), V(8, 58.5), V(-8, 58.5)],
    [V(19.8, 58), V(19.8, 90), V(14.5, 90), V(14.5, 58)],
  ];
  const exits = [V(-5, Z0 + 1.5), V(5, Z0 + 1.5), ...shops.map((s) => s.pos.clone()), V(0, 142)];

  const spawns = {
    gates: [{ pos: new THREE.Vector3(0, Y, 140), dir: new THREE.Vector3(0, 0, -1) }],
    doors,
    edge() {
      return new THREE.Vector3(X0 - 10 - Math.random() * 10, Y - 40 - Math.random() * 15, Z0 + 8 + Math.random() * 70);
    },
    drop() {
      for (let i = 0; i < 30; i++) {
        const p = new THREE.Vector3(-ROAD + 1 + Math.random() * (ROAD * 2 - 2), Y, Z0 + 10 + Math.random() * (Z1 - Z0 - 16));
        if (world.groundAt(p.x, p.z, Y + 0.2, 0.6) !== Y) continue;
        let blocked = false;
        for (const b of world.boxes) {
          if (b.tag === 'floor' || !b.move || b.max.y < Y - 1 || b.min.y > Y + 3) continue;
          if (p.x > b.min.x - 1 && p.x < b.max.x + 1 && p.z > b.min.z - 1 && p.z < b.max.z + 1) { blocked = true; break; }
        }
        if (!blocked) return p;
      }
      return new THREE.Vector3(0, Y, 96);
    },
  };

  const arena = {
    name: 'street', y: Y,
    center: new THREE.Vector3(0, Y, 92),
    bounds: { minX: X0 + 1, maxX: X1 - 1, minZ: Z0 + 1, maxZ: Z1 - 1 },
    flyBounds: { minX: X0 - 26, maxX: X1 + 4, minZ: Z0 - 2, maxZ: Z1 + 8 },
    avoid: null,
    outline: [[X0, Z0], [X1, Z0], [X1, Z1], [X0, Z1]],
    objective: { x: 0, z: Z0 + 2 },
    objectiveText: 'PROTECT THE CIVILIANS',
    spawns,
    playerSpawn: new THREE.Vector3(LANDING.x + 5.5, Y, LANDING.z + 2),
    allySpawn: new THREE.Vector3(LANDING.x + 7.6, Y, LANDING.z + 0.4),
    shadowTarget: new THREE.Vector3(0, Y, 92),
    sunIntensity: 2.8,
  };

  return {
    arena, awning, paths, exits, shops,
    update(dt, t) { for (const f of updaters) f(dt, t); },
    /** Steam from the road grates (only worth emitting while the fight is down here). */
    fxUpdate(dt, fx, cam) {
      for (const s of steam) {
        // thin it out right next to the camera so it never fogs the whole screen
        const near = cam ? Math.hypot(cam.x - s.pos.x, cam.z - s.pos.z) : 99;
        if (Math.random() < (near < 5 ? 0.12 : 0.5)) {
          fx.smoke.emit(s.pos.x + (Math.random() - 0.5) * 1.2, s.pos.y, s.pos.z + (Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 0.4, 1.4 + Math.random(), (Math.random() - 0.5) * 0.4,
            2.2 + Math.random(), 0.6, 3.2, 0.5, 0.52, 0.56, 0.22, -0.3, 0.4, 0.15, 0.6, 0.62, 0.66, (Math.random() - 0.5));
        }
      }
    },
  };
}
