import * as THREE from 'three';
import { mulberry32, canvasTexture } from './util.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Act IV: the Jedi Council chamber, a round room crowning one of the Jedi Temple's spires, high over Coruscant.
 * Tall windows all the way round look out over the city (it is the real city outside, 270 m down), the twelve
 * Council seats stand in a ring, and four turbolift doors open onto the room (the clones storm in through them).
 * Outside the south door a landing pad juts from the tower for the gunship. The windows are glass: they stop blaster
 * bolts until enough of them shatter a pane (from inside, or from a gunship outside: Take to the skies).
 *
 *   floor y = at.y, centre (at.x, at.z), walkable radius R; doors at the four compass points (south is the pad)
 */
export function buildCouncil(scene, world, at) {
  const CX = at.x, CY = at.y, CZ = at.z, RW = at.r, R = RW - 0.6, H = at.h;
  const rng = mulberry32(6611);
  const boxG = new THREE.BoxGeometry(1, 1, 1);
  const std = (color, rough = 0.7, metal = 0.1, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...extra });
  const glow = (r, g, b) => new THREE.MeshBasicMaterial({ color: new THREE.Color(r, g, b) });
  const stone = std(0xc9bda6, 0.75, 0.05), stoneDark = std(0x8f8473, 0.8, 0.05), bronze = std(0x8a6a3a, 0.4, 0.7);
  const leather = std(0x6a4a32, 0.85, 0.05), darkMetal = std(0x2c2f34, 0.5, 0.6), warm = glow(1.25, 0.86, 0.5);
  const updaters = [];
  const group = new THREE.Group();
  scene.add(group);

  // a box in chamber-local polar placement: angle a (0 = +x, counter-clockwise seen from above), radius r
  const polar = (a, r) => [CX + Math.cos(a) * r, CZ - Math.sin(a) * r];
  const block = (mat, x, y, z, sx, sy, sz, opts = {}) => {
    const m = new THREE.Mesh(boxG, mat);
    m.scale.set(sx, sy, sz);
    m.position.set(x, y, z);
    if (opts.ry) m.rotation.y = opts.ry;
    m.castShadow = opts.cast !== false;
    m.receiveShadow = true;
    group.add(m);
    if (opts.collide) world.box(x, y, z, sx, sy, sz, opts.collide === true ? {} : opts.collide);
    return m;
  };

  // --- the floor: a mosaic of rings and rays round a sunburst
  const floorTex = canvasTexture(1024, 1024, (g, w, h) => {
    const cx = w / 2, cy = h / 2;
    g.fillStyle = '#b9a98c'; g.fillRect(0, 0, w, h);
    const ring = (r0, r1, col) => { g.beginPath(); g.arc(cx, cy, r1, 0, Math.PI * 2); g.arc(cx, cy, r0, 0, Math.PI * 2, true); g.fillStyle = col; g.fill(); };
    ring(470, 512, '#5b4a3a'); ring(440, 470, '#d8c8a6'); ring(300, 312, '#7a5f42'); ring(120, 132, '#7a5f42');
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      g.strokeStyle = i % 2 ? 'rgba(90,70,50,0.55)' : 'rgba(225,210,180,0.6)';
      g.lineWidth = i % 2 ? 6 : 10;
      g.beginPath(); g.moveTo(cx + Math.cos(a) * 132, cy + Math.sin(a) * 132); g.lineTo(cx + Math.cos(a) * 440, cy + Math.sin(a) * 440); g.stroke();
    }
    g.fillStyle = '#3c5578'; g.beginPath(); g.arc(cx, cy, 120, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#e2cf9c';
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      g.beginPath(); g.moveTo(cx + Math.cos(a - 0.12) * 40, cy + Math.sin(a - 0.12) * 40); g.lineTo(cx + Math.cos(a) * 112, cy + Math.sin(a) * 112);
      g.lineTo(cx + Math.cos(a + 0.12) * 40, cy + Math.sin(a + 0.12) * 40); g.fill();
    }
    g.beginPath(); g.arc(cx, cy, 34, 0, Math.PI * 2); g.fill();
    for (let i = 0; i < 2600; i++) { g.fillStyle = `rgba(40,30,20,${rng() * 0.07})`; g.fillRect(rng() * w, rng() * h, 2 + rng() * 4, 2 + rng() * 4); }
  }, { anisotropy: 8 });
  // polished, but not a mirror: the low sun through the windows used to make a hot spot that bloomed across the room
  const floor = new THREE.Mesh(new THREE.CircleGeometry(RW, 72), std(0xe8e2d8, 0.7, 0.05, { map: floorTex }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(CX, CY + 0.01, CZ);
  floor.receiveShadow = true;
  group.add(floor);
  const circleSlab = (y0, y1, rr, opts) => {
    const N = 12;
    for (let k = 0; k < N; k++) {
      const z0 = -rr + (2 * rr * k) / N, z1 = z0 + (2 * rr) / N;
      const zc = z0 <= 0 && z1 >= 0 ? 0 : Math.min(Math.abs(z0), Math.abs(z1));
      const hw = Math.sqrt(Math.max(0, rr * rr - zc * zc));
      world.add(CX - hw, y0, CZ + z0, CX + hw, y1, CZ + z1, opts);
    }
  };
  circleSlab(CY - 2, CY, RW, { tag: 'floor' });
  // the roof over the dome: solid (a gunship can set down on top of the tower)
  circleSlab(CY + H, CY + H + 4.4, RW + 0.4, {});
  // the drum's underside, sitting on the spire
  const base = new THREE.Mesh(new THREE.CylinderGeometry(RW + 0.8, RW - 6, 5, 48), stoneDark);
  base.position.set(CX, CY - 2.5, CZ);
  group.add(base);

  // --- walls: 24 bays of tall windows between ribs, a low band under them, a deep band over them
  const BAYS = 24, DOORS = [0, 6, 12, 18]; // bay index: 0 east, 6 north, 12 west, 18 south (the landing pad)
  const glass = new THREE.MeshBasicMaterial({ color: 0x9cc4e4, transparent: true, opacity: 0.1, depthWrite: false, side: THREE.DoubleSide });
  const bayW = 2 * RW * Math.sin(Math.PI / BAYS);
  const lowBand = new THREE.Mesh(new THREE.CylinderGeometry(RW + 0.2, RW + 0.2, 1.0, 72, 1, true), stone);
  lowBand.material = stone.clone(); lowBand.material.side = THREE.DoubleSide;
  lowBand.position.set(CX, CY + 0.5, CZ);
  const topBand = new THREE.Mesh(new THREE.CylinderGeometry(RW + 0.4, RW + 0.4, 3.2, 72, 1, true), lowBand.material);
  topBand.position.set(CX, CY + H - 1.6, CZ);
  group.add(lowBand, topBand);
  const winH = H - 4.2; // 1 m band below, 3.2 m above
  const PANE_HP = 70;
  const panes = [], paneGeos = [];
  for (let i = 0; i < BAYS; i++) {
    const a = ((i + 0.5) / BAYS) * Math.PI * 2; // rib at the edge of each bay
    const [rx, rz] = polar(a, RW);
    block(stone, rx, CY + H / 2, rz, 0.7, H, 0.9, { ry: a });
    const ac = (i / BAYS) * Math.PI * 2; // bay centre
    const [bx, bz] = polar(ac, RW - 0.05);
    if (DOORS.includes(i)) continue;
    const pg = new THREE.PlaneGeometry(bayW - 0.6, winH).toNonIndexed();
    pg.applyMatrix4(new THREE.Matrix4().makeRotationY(ac + Math.PI / 2).setPosition(bx, CY + 1 + winH / 2, bz));
    paneGeos.push(pg);
    panes.push({
      i, ac, c: new THREE.Vector3(bx, CY + 1 + winH / 2, bz), n: new THREE.Vector3(Math.cos(ac), 0, -Math.sin(ac)),
      t: new THREE.Vector3(Math.sin(ac), 0, Math.cos(ac)), hw: (bayW - 0.6) / 2, y0: CY + 1, y1: CY + 1 + winH,
      hp: PANE_HP, broken: false, start: (paneGeos.length - 1) * pg.attributes.position.count, count: pg.attributes.position.count,
    });
    // a slim mullion and transom in each window
    block(bronze, bx, CY + 1 + winH * 0.62, bz, 0.08, 0.08, bayW - 0.6, { ry: ac, cast: false });
  }
  const glassMesh = new THREE.Mesh(mergeGeometries(paneGeos), glass);
  glassMesh.renderOrder = 2;
  group.add(glassMesh);
  const glassPos = glassMesh.geometry.attributes.position;
  const glassOrig = glassPos.array.slice();
  // round wall collision: posts every metre and a half. They stop movement (yours, the clones', a gunship's) but not
  // bolts: the glass does that, pane by pane, until it breaks
  for (let i = 0; i < 96; i++) {
    const a = (i / 96) * Math.PI * 2;
    const [x, z] = polar(a, RW + 0.3);
    world.box(x, CY + H / 2, z, 1.6, H, 1.6, { walk: false, shot: false });
  }
  // the ceiling: a shallow dome with a ring of light and an oculus
  const dome = new THREE.Mesh(new THREE.SphereGeometry(RW + 0.4, 48, 12, 0, Math.PI * 2, 0, Math.PI / 2), std(0xb4a68d, 0.85, 0.05, { side: THREE.DoubleSide }));
  dome.scale.y = 0.32;
  dome.position.set(CX, CY + H, CZ);
  group.add(dome);
  const ringLight = new THREE.Mesh(new THREE.TorusGeometry(RW - 3, 0.12, 6, 72), warm);
  ringLight.rotation.x = Math.PI / 2;
  ringLight.position.set(CX, CY + H - 0.2, CZ);
  const oculus = new THREE.Mesh(new THREE.CircleGeometry(2.2, 32), glow(1.1, 1.0, 0.85));
  oculus.rotation.x = Math.PI / 2;
  oculus.position.set(CX, CY + H + (RW + 0.4) * 0.32 - 0.05, CZ);
  group.add(ringLight, oculus);
  // a crown on the roof, so the tower reads from the plaza
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(4, RW * 0.6, 4, 24), stoneDark);
  crown.position.set(CX, CY + H + (RW + 0.4) * 0.32 + 1.2, CZ);
  group.add(crown);
  // warm sconces on the ribs
  for (let i = 0; i < BAYS; i += 2) {
    const [x, z] = polar(((i + 0.5) / BAYS) * Math.PI * 2, RW - 0.5);
    block(warm, x, CY + 3.2, z, 0.25, 0.6, 0.25, { cast: false });
  }

  // --- the four turbolift doors (south also leads out onto the landing pad)
  const doors = [];
  for (const i of DOORS) {
    const a = (i / BAYS) * Math.PI * 2;
    const [x, z] = polar(a, RW);
    const g = new THREE.Group();
    g.position.set(x, CY, z);
    g.rotation.y = a + Math.PI / 2;
    const frame = new THREE.Mesh(boxG, darkMetal); frame.scale.set(bayW - 0.4, 5.6, 0.5); frame.position.set(0, 2.8, 0.15);
    const back = new THREE.Mesh(boxG, glow(0.05, 0.06, 0.08)); back.scale.set(3.6, 4.4, 0.2); back.position.set(0, 2.2, 0.55);
    const L = new THREE.Mesh(boxG, bronze), Rr = new THREE.Mesh(boxG, bronze);
    L.scale.set(1.8, 4.4, 0.18); Rr.scale.set(1.8, 4.4, 0.18);
    L.position.set(-0.9, 2.2, -0.12); Rr.position.set(0.9, 2.2, -0.12);
    const lamp = new THREE.Mesh(boxG, glow(0.3, 0.7, 1.3)); lamp.scale.set(3.6, 0.14, 0.2); lamp.position.set(0, 4.65, -0.15);
    g.add(frame, back, L, Rr, lamp);
    g.userData.dynamic = true; // the doors slide (left out of the batching below)
    group.add(g);
    const inward = new THREE.Vector3(-Math.cos(a), 0, Math.sin(a));
    const [px, pz] = polar(a, R - 1.0);
    doors.push({ pos: new THREE.Vector3(px, CY, pz), dir: inward, a, open: 0, timer: 0, left: L, right: Rr, lamp, south: i === 18,
      openFor(sec) { this.timer = Math.max(this.timer, sec); } });
  }
  const lampOn = glow(1.3, 0.35, 0.2), lampOff = doors[0].lamp.material;
  updaters.push((dt) => {
    for (const d of doors) {
      d.timer -= dt;
      const target = d.timer > 0 ? 1 : 0;
      d.open += Math.sign(target - d.open) * Math.min(Math.abs(target - d.open), dt * 2.2);
      d.left.position.x = -0.9 - d.open * 1.7;
      d.right.position.x = 0.9 + d.open * 1.7;
      d.lamp.material = d.timer > 0 ? lampOn : lampOff;
    }
  });

  // --- the landing pad outside the south door, for the gunship
  {
    const a = (18 / BAYS) * Math.PI * 2;
    const [px, pz] = polar(a, RW + 9);
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(9, 9, 1.2, 40), stoneDark);
    pad.position.set(px, CY - 0.6, pz);
    world.add(px - 8.5, CY - 1.2, pz - 4.5, px + 8.5, CY, pz + 4.5, { tag: 'floor' });
    world.add(px - 4.5, CY - 1.2, pz - 8.5, px + 4.5, CY, pz + 8.5, { tag: 'floor' });
    pad.receiveShadow = true;
    group.add(pad);
    const strip = new THREE.Mesh(new THREE.TorusGeometry(7.6, 0.1, 6, 48), glow(0.3, 0.7, 1.3));
    strip.rotation.x = Math.PI / 2;
    strip.position.set(px, CY + 0.03, pz);
    group.add(strip);
    const [bx, bz] = polar(a, RW + 1.6);
    block(stone, bx, CY - 0.4, bz, 4.2, 0.8, 3.2, { ry: a + Math.PI / 2 });
    const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 1.4, 18, 10), stoneDark);
    strut.position.set(px, CY - 10, pz);
    strut.rotation.z = Math.cos(a) * 0.5; strut.rotation.x = -Math.sin(a) * 0.5;
    group.add(strut);
  }

  // --- the twelve Council seats, in a ring facing the middle, between the doors
  const seats = [];
  for (let i = 0; i < 12; i++) {
    const a = ((i + 0.5) / 12) * Math.PI * 2; // 15 deg off the door axes
    const [x, z] = polar(a, 13.5);
    const yaw = Math.atan2(CX - x, CZ - z); // facing the middle (+z forward)
    const s = new THREE.Group();
    s.position.set(x, CY, z);
    s.rotation.y = yaw;
    const part = (mat, px, py, pz, sx, sy, sz) => { const m = new THREE.Mesh(boxG, mat); m.scale.set(sx, sy, sz); m.position.set(px, py, pz); m.castShadow = m.receiveShadow = true; s.add(m); };
    part(bronze, 0, 0.12, 0, 1.3, 0.24, 1.2);
    part(leather, 0, 0.48, 0.05, 1.05, 0.22, 0.95);
    part(leather, 0, 1.25, -0.45, 1.15, 1.6, 0.22);
    part(bronze, 0, 2.08, -0.45, 1.2, 0.1, 0.26);
    for (const sx of [-0.6, 0.6]) part(bronze, sx, 0.75, 0.05, 0.14, 0.3, 0.95);
    group.add(s);
    world.box(x, CY + 0.7, z, 1.5, 1.4, 1.5);
    seats.push({ pos: new THREE.Vector3(x, CY, z), yaw });
  }
  // cover: the holoprojector in the middle, sandstone planters by the walls
  const proj = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.3, 0.9, 24), darkMetal);
  proj.position.set(CX, CY + 0.45, CZ);
  proj.castShadow = proj.receiveShadow = true;
  group.add(proj);
  const projTop = new THREE.Mesh(new THREE.CircleGeometry(0.8, 24), glow(0.25, 0.6, 1.2));
  projTop.rotation.x = -Math.PI / 2;
  projTop.position.set(CX, CY + 0.91, CZ);
  group.add(projTop);
  world.box(CX, CY + 0.45, CZ, 2.4, 0.9, 2.4);
  const planters = [];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const [x, z] = polar(a, R - 3);
    block(stoneDark, x, CY + 0.7, z, 2.2, 1.4, 2.2, { collide: true });
    const bush = new THREE.Mesh(new THREE.IcosahedronGeometry(1.2, 1), std(0x46623a, 0.9, 0));
    bush.position.set(x, CY + 2.0, z);
    bush.scale.y = 0.8;
    group.add(bush);
    planters.push([x, z]);
  }
  // scorch marks where Jedi made their stand
  const scorchTex = canvasTexture(128, 128, (g, w, h) => {
    const grd = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    grd.addColorStop(0, 'rgba(10,8,6,0.85)'); grd.addColorStop(0.5, 'rgba(20,15,10,0.45)'); grd.addColorStop(1, 'rgba(20,15,10,0)');
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
  });
  const scorchMat = new THREE.MeshBasicMaterial({ map: scorchTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  for (let i = 0; i < 9; i++) {
    const a = rng() * Math.PI * 2, r = 4 + rng() * 14;
    const [x, z] = polar(a, r);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), scorchMat);
    m.rotation.x = -Math.PI / 2;
    m.scale.setScalar(1.4 + rng() * 2);
    m.position.set(x, CY + 0.03, z);
    m.userData.transparentBatch = true;
    group.add(m);
  }

  // batch the static pieces by material: a handful of draw calls instead of a couple of hundred (the chamber is
  // drawn from all over the city, Act I's rooftop included)
  {
    group.updateMatrixWorld(true);
    const lists = new Map();
    group.traverse((m) => {
      if (!m.isMesh || Array.isArray(m.material) || (m.material.transparent && !m.userData.transparentBatch)) return;
      for (let p = m.parent; p && p !== group; p = p.parent) if (p.userData.dynamic) return;
      const key = m.material.uuid + (m.castShadow ? 'c' : '');
      if (!lists.has(key)) lists.set(key, []);
      lists.get(key).push(m);
    });
    for (const list of lists.values()) {
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
      mesh.receiveShadow = !list[0].material.transparent;
      mesh.renderOrder = list[0].renderOrder;
      for (const m of list) m.parent.remove(m);
      group.add(mesh);
    }
  }

  const center = new THREE.Vector3(CX, CY, CZ);
  const freeAt = (x, z) => {
    if (Math.hypot(x - CX, z - CZ) > R - 2 || Math.hypot(x - CX, z - CZ) < 2.2) return false;
    for (const s of seats) if (Math.hypot(x - s.pos.x, z - s.pos.z) < 1.6) return false;
    for (const [px, pz] of planters) if (Math.hypot(x - px, z - pz) < 2) return false;
    return true;
  };
  const south = doors.find((d) => d.south);
  const arena = {
    name: 'council', y: CY, center, indoor: true, circle: { x: CX, z: CZ, r: R - 0.3 },
    bounds: { minX: CX - R, maxX: CX + R, minZ: CZ - R, maxZ: CZ + R },
    flyBounds: { minX: CX - R + 2, maxX: CX + R - 2, minZ: CZ - R + 2, maxZ: CZ + R - 2 },
    avoid: null, outline: Array.from({ length: 24 }, (_, i) => polar((i / 24) * Math.PI * 2, RW)),
    objective: { x: CX, z: CZ }, objectiveText: 'PROTECT MASTER YODA',
    maxAlive: (w) => Math.min(5 + Math.ceil(w * 1.5), 12),
    spawns: {
      doors,
      gates: doors.map((d) => ({ pos: d.pos.clone(), dir: d.dir.clone() })),
      edge() { const [x, z] = polar(Math.random() * Math.PI * 2, R - 4); return new THREE.Vector3(x, CY + 6, z); },
      drop() {
        for (let i = 0; i < 40; i++) {
          const [x, z] = polar(Math.random() * Math.PI * 2, 3 + Math.random() * (R - 5));
          if (freeAt(x, z)) return new THREE.Vector3(x, CY, z);
        }
        return center.clone().add(new THREE.Vector3(4, 0, 0));
      },
    },
    // you start by the south door, looking in across the chamber
    playerSpawn: south.pos.clone().addScaledVector(south.dir, 3.5).add(new THREE.Vector3(1.6, 0, 0)),
    allySpawn: south.pos.clone().addScaledVector(south.dir, 3.0).add(new THREE.Vector3(-1.6, 0, 0)),
    face: Math.atan2(south.dir.x, south.dir.z),
    shadowTarget: center.clone(), sunIntensity: 3.6, hemi: 1.55,
    // Take to the skies: the gunship flies round the outside of the tower, firing in through the windows
    skySpawn: new THREE.Vector3(CX, CY + 6, CZ + RW + 24), skyYaw: Math.PI,
    flyOutside: { x: CX, z: CZ, rMax: 100, yMin: CY - 20, yMax: CY + 45 },
  };
  const _s = new THREE.Vector3();
  /** The first unbroken pane a segment a->b passes through: { pane, t } (t along the segment), or null. */
  function glassHit(a, b) {
    const mx = (a.x + b.x) / 2 - CX, mz = (a.z + b.z) / 2 - CZ, half = Math.hypot(b.x - a.x, b.z - a.z) / 2;
    if (Math.hypot(mx, mz) > RW + 4 + half || Math.max(a.y, b.y) < CY || Math.min(a.y, b.y) > CY + H) return null;
    let best = null;
    for (const p of panes) {
      if (p.broken) continue;
      const da = (a.x - p.c.x) * p.n.x + (a.z - p.c.z) * p.n.z, db = (b.x - p.c.x) * p.n.x + (b.z - p.c.z) * p.n.z;
      if ((da > 0) === (db > 0) || da === db) continue;
      const t = da / (da - db);
      _s.lerpVectors(a, b, t);
      if (_s.y < p.y0 || _s.y > p.y1) continue;
      if (Math.abs((_s.x - p.c.x) * p.t.x + (_s.z - p.c.z) * p.t.z) > p.hw) continue;
      if (!best || t < best.t) best = { pane: p, t };
    }
    return best;
  }
  /** Wear a pane down; true when it shatters (it drops out of the glass mesh). */
  function damagePane(p, dmg) {
    if (p.broken) return false;
    p.hp -= dmg;
    if (p.hp > 0) return false;
    p.broken = true;
    for (let v = p.start; v < p.start + p.count; v++) glassPos.setXYZ(v, p.c.x, p.c.y, p.c.z);
    glassPos.needsUpdate = true;
    return true;
  }
  function resetGlass() {
    glassPos.array.set(glassOrig);
    glassPos.needsUpdate = true;
    for (const p of panes) { p.broken = false; p.hp = PANE_HP; }
  }
  return {
    arena, doors, seats, group, center, R, RW, H, pad: polar((18 / BAYS) * Math.PI * 2, RW + 9),
    panes, glassHit, damagePane, resetGlass,
    update(dt) { for (const f of updaters) f(dt); },
  };
}
