/* GALACTIC PLAYGROUND — flowing liquids.
 *
 * Liquid is a set of particles (see fluid-kernel.js for the simulation itself). This module feeds the
 * kernel the solid shapes near the liquid, applies what comes back (impulses on bodies, burns,
 * melting, steam, fires), draws the liquid and provides the liquid props.
 *
 * The kernel normally runs in a Web Worker so big lakes don't slow the rest of the game down. Each
 * game tick sends it the current shapes and bodies and picks up the previous tick's answer, so the
 * liquid runs one tick behind the rigid bodies. If the worker is still busy the liquid simply waits
 * (it slows down instead of dragging the frame rate with it). Without workers, while a map's lakes
 * are being set up, and in tests (setSync), the kernel runs on the main thread instead.
 *
 *   water   thin and splashy; puts out fires and cools what it touches
 *   lava    thick and heavy; burns, ignites and melts; turns water to steam and cools into rock
 *   cooled  lava quenched by water: dark, sluggish and harmless
 *   oil     lighter than water so it floats on it; lava, fire and explosions set it burning
 *   acid    eats into people and objects (and is used up doing it); water slowly dilutes it
 *   blood   what bleeding people leave behind; thicker than water
 *   ice     water frozen by cold air, chilled objects or cryo blasts; solid while it rests on something
 *           solid, and melts again in the warm, near hot things, lava, fire and lightsaber blades
 */
'use strict';

GP.Fluid = (() => {
  const M = GP.M, Phys = GP.Phys;
  const WATER = 0, LAVA = 1, COOLED = 2, OIL = 3, ACID = 4, BLOOD = 5, ICE = 6;
  const NAMES = { water: WATER, lava: LAVA, cooled: COOLED, oil: OIL, acid: ACID, blood: BLOOD, ice: ICE };
  const TYPES = [
    // pull: surface tension (negative pressure) cap. A drop at the edge feels it from several
    //   neighbours at once, so it is kept low: any stronger and streams and splashes roll up into round
    //   lumps (and liquid can stand in heaps). Much weaker and water stops holding together at all:
    //   streams spray apart and a spreading pool scatters into drops.
    // friction: share of sliding speed lost against surfaces per second.
    // holdPeople: share of the displaced liquid's weight that holds people up. Liquid flows into the
    //   space people take up, so they end up submerged; below their own density they slowly sink.
    // evaporate: seconds a lone drop lasts before it dries up (0: never).
    // consume: chance per second a drop is used up when it touches something (acid).
    // drag: how hard the liquid drags on people and droids moving through it (what swimmers push against);
    //   if missing it follows the viscosity. Kept separate so thin, free-flowing water still swims well.
    { name: 'water', label: 'Water', pull: 0.00012, mass: 1, holdPeople: 0.6, visc: 0.5, visc2: 0.15, drag: 1.53, friction: 0.2, evaporate: 25, consume: 0, color: '#4aa8ff' },
    { name: 'lava', label: 'Lava', pull: 0.00015, mass: 2.2, holdPeople: 0.3, visc: 8, visc2: 1.5, friction: 0.4, evaporate: 0, consume: 0, color: '#ff7a30' },
    { name: 'cooled', label: 'Cooled rock', pull: 0.002, mass: 2.2, holdPeople: 0.35, visc: 30, visc2: 6, friction: 3, evaporate: 0, consume: 0, color: '#6a5a50', noPour: true },
    { name: 'oil', label: 'Oil', pull: 0.00015, mass: 0.75, holdPeople: 0.6, visc: 5, visc2: 1, friction: 0.3, evaporate: 0, consume: 0, color: '#c89a3a' },
    { name: 'acid', label: 'Acid', pull: 0.00012, mass: 1.2, holdPeople: 0.55, visc: 0.6, visc2: 0.15, drag: 1.63, friction: 0.2, evaporate: 25, consume: 0.5, color: '#9aff3a' },
    { name: 'blood', label: 'Blood', pull: 0.00015, mass: 1.05, holdPeople: 0.6, visc: 1.4, visc2: 0.3, drag: 2.05, friction: 0.4, evaporate: 20, consume: 0, color: '#c81a1a' },
    // ice resting on something solid is pinned in place (see fluid-kernel.js); these values are for loose
    // ice, which moves as a stiff slush
    { name: 'ice', label: 'Ice', pull: 0.002, mass: 0.92, holdPeople: 0, visc: 40, visc2: 8, friction: 2, evaporate: 0, consume: 0, color: '#cfeeff', noPour: true },
  ];
  const simTypes = () => TYPES.map((T) => ({ pull: T.pull, mass: T.mass, holdPeople: T.holdPeople, visc: T.visc, visc2: T.visc2, drag: T.drag != null ? T.drag : 1 + T.visc * 0.35, friction: T.friction, evaporate: T.evaporate, consume: T.consume }));

  // seconds of full contact before a prop of each material melts in lava / dissolves in acid (missing = never)
  const MELT = { wood: 2, plastic: 2, crystal: 3, flesh: 4, droid: 8, metal: 12, armor: 12, stone: 16 };
  const DISSOLVE = { wood: 10, plastic: 6, flesh: 6, droid: 14, metal: 18, armor: 28, stone: 40 };

  // Particle size. Everything spatial scales with the spacing between particles: 0.1 m at the finest.
  // Map liquids pick a coarser size when needed so a whole lake fits in the chosen quality's budget.
  let SCALE = 1, R = 0.055;
  const tune = { K: 0.008, KNEAR: 0.02, BOUNCE: 0.1, DAMP: 0.25, SUBSTEPS: 2 };
  function setSpacing(sp) {
    SCALE = sp / 0.1; R = 0.055 * SCALE;
    send({ k: 'spacing', s: sp });
  }

  // A huge limit (Settings → Physics → danger zone) only costs memory once that much liquid exists.
  const MAX_EXTRA = 500000;                  // highest extra-liquid limit the danger zone allows
  const HARD_CAP = MAX_EXTRA + 20000;        // plus room for a map's own lakes
  // Liquid physics quality: how many particles a map's liquid may use, and the finest particle size.
  const LEVELS = {
    verylow: { label: 'Very low', budget: 900, min: 0.22 },
    low: { label: 'Low', budget: 1600, min: 0.17 },
    medium: { label: 'Medium', budget: 2800, min: 0.14 },
    high: { label: 'High', budget: 4500, min: 0.12 },
    veryhigh: { label: 'Very high', budget: 7000, min: 0.1 },
  };
  const level = () => LEVELS[GP.Settings.p.liquidQuality] || LEVELS.medium;

  let game = null;
  let mapCount = 0;                // particles that belong to the map's own lakes and rivers
  const wet = new Set();           // bodies touching water last tick
  let steamT = 0, fireFxT = 0;

  /* ---------------------------------------------------------------- where the simulation runs */
  const kernel = GP.FluidKernel();              // main-thread kernel: map setup, tests, no-worker fallback
  kernel.applyOp({ k: 'config', types: simTypes() });
  let worker = null, useWorker = false, forceSync = false;
  let seq = 0, busy = false, inflight = null, ready = null, discardBelow = 0, spare = null, acc = 0;
  const forces = new Map();      // body -> [fx, fy, torque, seconds left] from the worker's latest answer
  let ops = [];                    // commands waiting for the next worker message
  let addBuf = [];                 // particles waiting to be added (t, x, y, vx, vy)
  let staticVersion = -1, staticBodies = [], staticBuf = null, staticRecords = null, sendStatics = true;
  // what the rest of the game sees: the latest particle state
  let view = { n: 0, px: new Float32Array(0), py: new Float32Array(0), rx: new Float32Array(0), ry: new Float32Array(0), type: new Uint8Array(0), flags: new Uint8Array(0) };

  // commands keep their order: anything poured before this command is added first
  function send(op) { flushAdds(); if (useWorker) ops.push(op); else kernel.applyOp(op); }
  const workersAllowed = () => GP.Settings.p.liquidThread !== false && !forceSync && typeof Worker !== 'undefined' && typeof Blob !== 'undefined';

  function startWorker() {
    try {
      const src = '(' + GP.FluidWorkerMain.toString() + ')(' + GP.FluidKernel.toString() + ');';
      const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
      worker = new Worker(url);
      worker.onmessage = (e) => onWorkerResult(e.data);
      worker.onerror = (e) => { console.warn('Liquid worker failed; running liquids on the main thread.', e.message || e); stopWorker(); };
    } catch (err) {
      console.warn('Liquid worker unavailable; running liquids on the main thread.', err);
      worker = null;
    }
    return !!worker;
  }
  function stopWorker() {
    if (worker) { try { worker.terminate(); } catch (e) { /* already gone */ } }
    worker = null;
    if (useWorker) toMainThread();
  }
  // move the liquid from the worker to the main-thread kernel (velocities are lost; positions are kept)
  function toMainThread() {
    useWorker = false; busy = false; inflight = null; ready = null; discardBelow = seq + 1;
    const n = view.n, p = new Float32Array(n * 2), t = new Uint8Array(n);
    for (let i = 0; i < n; i++) { p[i * 2] = view.px[i]; p[i * 2 + 1] = view.py[i]; t[i] = view.type[i]; }
    kernel.applyOp({ k: 'load', p, t, s: SCALE * 0.1 });
    flushAdds();
    sendStatics = true;
  }
  // move the liquid from the main-thread kernel to the worker
  function toWorker() {
    if (!worker && !startWorker()) return false;
    const st = kernel.state();
    useWorker = true; busy = false; inflight = null; ready = null; discardBelow = seq + 1;
    ops = [{ k: 'config', types: simTypes() }, { k: 'tune', tune: kernelTune() }, { k: 'load', p: st.p, v: st.v, t: st.t, b: st.b, s: SCALE * 0.1 }];
    sendStatics = true;
    return true;
  }
  const kernelTune = () => ({ K: tune.K, KNEAR: tune.KNEAR, BOUNCE: tune.BOUNCE, DAMP: tune.DAMP });
  // pick the right place to run, following the settings (called every tick; cheap when nothing changes)
  function syncMode() {
    const want = workersAllowed();
    if (want && !useWorker) toWorker();
    else if (!want && useWorker) toMainThread();
  }

  /* ---------------------------------------------------------------- shapes for the kernel */
  const SHAPE_OK = (s) => !s.sensor && s.enabled && s.tag !== 'blade';
  function pushShape(arr, s, bi) {
    if (s.kind === 'circle') arr.push(0, bi, s.minX, s.minY, s.maxX, s.maxY, s.r, s.wx, s.wy);
    else {
      const m = s.n, wv = s.wv, wn = s.wn;
      arr.push(1, bi, s.minX, s.minY, s.maxX, s.maxY, m);
      for (let i = 0; i < m * 2; i++) arr.push(wv[i]);
      for (let i = 0; i < m * 2; i++) arr.push(wn[i]);
    }
  }
  const heatOn = () => !!GP.Heat && GP.Settings.play.temperature !== false;
  const airTemp = () => (game && GP.Heat ? GP.Heat.ambient(game) : 20);
  const BODY = 8;                  // floats per body record (see fluid-kernel.js)
  const bodyFlags = (b) => (b.type === Phys.DYNAMIC ? 1 : 0) | (b.entity && b.entity.isCharacterLike ? 2 : 0) | (b.entity ? 4 : 0) | (b.entity && b.entity.mech ? 8 : 0) | (b.entity && b.entity.state === 'dead' && !b.entity.mech ? 16 : 0);
  function exportStatics(world) {
    if (world.staticDirty) world.rebuildStatic();
    const arr = [];
    staticBodies = [];
    for (const b of world.bodies) {
      if (b.type !== Phys.STATIC || b.removed || b === iceBody) continue;
      const bi = staticBodies.length;
      let any = false;
      for (const s of b.shapes) { if (!SHAPE_OK(s)) continue; s.updateWorld(b); pushShape(arr, s, bi); any = true; }
      if (any) staticBodies.push(b);
    }
    staticBuf = new Float32Array(arr);
    staticRecords = new Float32Array(staticBodies.length * BODY);
    const amb = airTemp();
    for (let i = 0; i < staticBodies.length; i++) {
      const b = staticBodies[i], o = i * BODY;
      staticRecords[o] = b.x; staticRecords[o + 1] = b.y; staticRecords[o + 5] = b.m || 0; staticRecords[o + 6] = bodyFlags(b);
      staticRecords[o + 7] = b.temp != null ? b.temp : amb;
    }
    staticVersion = world.staticVersion;
  }

  // bounding box of the liquid (plus anything about to be poured), so only nearby bodies are sent
  function liquidBox() {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const n = view.n, px = view.px, py = view.py;
    for (let i = 0; i < n; i++) { const x = px[i], y = py[i]; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    for (let i = 0; i < addBuf.length; i += 5) { const x = addBuf[i + 1], y = addBuf[i + 2]; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    return [x0 - 3, y0 - 3, x1 + 3, y1 + 3];
  }

  // one kernel message: shapes, bodies, fires and pumps as they are right now
  function buildMsg(g, dt, substeps) {
    const world = g.world;
    if (world.staticDirty) world.rebuildStatic();
    const tick = world.tick || 0;
    let statics = null;
    // re-send the static world when it changes (and now and then, for shapes switched on or off)
    if (sendStatics || world.staticVersion !== staticVersion || tick % 120 === 0) { exportStatics(world); statics = staticBuf; sendStatics = false; }
    const box = liquidBox();
    const amb = airTemp();
    const dynArr = [], dynBodies = [];
    const recs = [];
    if (box[0] <= box[2]) {
      for (const b of world.bodies) {
        if (b.type === Phys.STATIC || b.removed) continue;
        let bi = -1;
        for (const s of b.shapes) {
          if (!SHAPE_OK(s) || s.maxX < box[0] || s.minX > box[2] || s.maxY < box[1] || s.minY > box[3]) continue;
          if (bi < 0) { bi = staticBodies.length + dynBodies.length; dynBodies.push(b); recs.push(b.x, b.y, b.vx, b.vy, b.w, b.m, bodyFlags(b), b.temp != null ? b.temp : amb); }
          pushShape(dynArr, s, bi);
        }
      }
    }
    const bodies = new Float32Array(staticRecords.length + recs.length);
    bodies.set(staticRecords); bodies.set(recs, staticRecords.length);
    // things on fire light oil; pumps and drains move or remove liquid
    const fires = [], zones = [];
    for (const b of dynBodies) if (b.entity && b.entity.onFire) fires.push(b.x, b.y, 0.4);
    for (const e of g.entities) {
      if (e.removed || !e.def || !e.def.fluidZone) continue;
      const z = e.def.fluidZone(e);
      if (z) zones.push(z);
    }
    flushAdds();
    // lightsaber blades melt ice
    const blades = [];
    if (GP.Sabers) for (const sg of GP.Sabers.activeBlades()) {
      if (Math.max(sg.x1, sg.x2) < box[0] || Math.min(sg.x1, sg.x2) > box[2] || Math.max(sg.y1, sg.y2) < box[1] || Math.min(sg.y1, sg.y2) > box[3]) continue;
      blades.push(sg.x1, sg.y1, sg.x2, sg.y2, sg.radius);
    }
    const map = g.map, bnd = map && map.bounds;
    const msg = {
      ops, statics, dyn: new Float32Array(dynArr), bodies, nb: staticBodies.length + dynBodies.length,
      dt, substeps, gx: world.gravityX, gy: world.gravityY, zones, fires, blades, heat: heatOn() ? { amb } : null,
      bounds: [bnd ? bnd.minX : -1e6, bnd ? bnd.maxX : 1e6, bnd ? bnd.minY : -1e6, map && map.killY != null ? map.killY : 80],
    };
    ops = [];
    return { msg, bodies: staticBodies.concat(dynBodies) };
  }
  function flushAdds() {
    if (!addBuf.length) return;
    const op = { k: 'add', a: addBuf };
    addBuf = [];
    if (useWorker) ops.push(op); else kernel.applyOp(op);
  }

  /* ---------------------------------------------------------------- per tick */
  function update(g, dt) {
    game = g;
    syncMode();
    if (steamT > 0) steamT -= dt;
    if (fireFxT > 0) fireFxT -= dt;
    if (dt <= 0) return;
    updateIce(g, dt);
    if (!useWorker) {
      if (!kernel.count() && !addBuf.length && !ops.length) { if (view.n) view = kernel.run({ dt: 0 }); return; }
      const { msg, bodies } = buildMsg(g, dt, tune.SUBSTEPS);
      const r = kernel.run(msg);
      applyResult(r, bodies, dt);
      return;
    }
    // worker: use the answer to the previous message, then send this tick's
    if (ready) { const r = ready; ready = null; applyResult(r, r.bodiesRef, r.dtRef); }
    // The liquid's push on bodies is spread over the game ticks that follow, as a steady force lasting
    // exactly as long as the time the worker simulated. Longer would feed energy into anything floating
    // (the push is a tick late) and make it bounce higher and higher.
    for (const [b, f] of forces) {
      if (b.removed || b.type !== Phys.DYNAMIC || f[3] <= 0) continue;
      const use = Math.min(dt, f[3]);
      f[3] -= use;
      b.applyImpulse(f[0] * use, f[1] * use, b.x, b.y); b.applyAngularImpulse(f[2] * use);
    }
    // each message simulates all the game time since the last one, so the liquid keeps pace with the
    // game; only a worker more than 0.1 s behind makes the liquid slow down
    acc = Math.min(acc + dt, 0.1);
    if (busy || !worker) return;
    if (!view.n && !addBuf.length && !ops.length) { acc = 0; return; }
    const step = acc;
    acc = 0;
    const { msg, bodies } = buildMsg(g, step, Math.min(12, Math.max(tune.SUBSTEPS, Math.ceil(step * 120 - 0.01))));
    msg.seq = ++seq;
    const transfer = [msg.bodies.buffer, msg.dyn.buffer];
    if (msg.statics) msg.statics = msg.statics.slice();
    if (spare) { msg.spare = spare; for (const k in spare) transfer.push(spare[k].buffer); spare = null; }
    inflight = { seq: msg.seq, bodies, dt: step, adds: countAdds(msg.ops) };
    busy = true;
    worker.postMessage(msg, transfer);
  }
  const countAdds = (list) => list.reduce((s, op) => s + (op.k === 'add' ? op.a.length / 5 : 0), 0);
  function onWorkerResult(r) {
    const fl = inflight;
    if (fl && r.seq === fl.seq) { busy = false; inflight = null; }
    if (r.error) { console.warn('Liquid worker error:', r.error); stopWorker(); return; }
    if (r.seq < discardBelow || !useWorker) return;
    r.fromWorker = true;
    r.bodiesRef = fl ? fl.bodies : [];
    r.dtRef = fl ? fl.dt : 1 / 60;
    if (ready) recycle(ready);
    ready = r;
  }
  // the buffers of a result we are done with go back to the worker to be reused
  function recycle(r) {
    if (!r || !r.fromWorker || !useWorker || !r.px.buffer.byteLength) return;
    spare = { px: r.px, py: r.py, rx: r.rx, ry: r.ry, type: r.type, flags: r.flags };
  }

  /* ---------------------------------------------------------------- what liquid does to the world */
  function applyResult(r, bodies, dt) {
    if (useWorker) forces.clear();
    const old = view;
    view = r;
    if (old !== r) recycle(old);
    const stride = r.stride, out = r.bodyOut, NT = TYPES.length;
    const touched = new Set();
    if (out && stride) {
      for (let bi = 0; bi < bodies.length; bi++) {
        const b = bodies[bi];
        if (!b || b.removed) continue;
        const o = bi * stride;
        let jx = out[o], jy = out[o + 1], ja = out[o + 2];
        if (b.type === Phys.DYNAMIC && (jx || jy || ja)) {
          // a body that sank deep into liquid the kernel hadn't caught up with yet must not be launched
          const dv = Math.hypot(jx, jy) * (b.im || 0);
          if (dv > 5) { const k = 5 / dv; jx *= k; jy *= k; ja *= k; }
          if (useWorker) forces.set(b, [jx / dt, jy / dt, ja / dt, dt]);
          else { b.applyImpulse(jx, jy, b.x, b.y); b.applyAngularImpulse(ja); }
        }
        if (b.type === Phys.DYNAMIC && out[o + 7 + NT] > 0) holdInIce(b, out[o + 3 + ICE], out[o + 5 + NT], out[o + 6 + NT], out[o + 7 + NT], dt);
        const e = b.entity;
        if (!e || e.removed) continue;
        let any = false;
        for (let t = 0; t < NT + 1; t++) if (out[o + 3 + t]) { any = true; break; }
        if (!any) continue;
        touched.add(b);
        touch(b, e, out, o + 3, NT, dt);
      }
    }
    // water above a body cushions its impacts (see Heat.cushion): remember roughly where the surface is
    for (const b of wet) if (!touched.has(b)) { b.waterSurf = null; wet.delete(b); }
    // steam where water meets lava
    if (r.steam && steamT <= 0) {
      GP.FX.smoke(r.sx, r.sy - 0.1, 2, 0.35, '#dfe6ec', -1.6, 0.4, 1.4);
      GP.Audio.play('saberSizzle', { x: r.sx, y: r.sy, vol: 0.25 });
      steamT = 0.08;
    }
    // burning oil
    if (r.fire && r.fire.length) {
      const f = r.fire;
      if (fireFxT <= 0) {
        for (let i = 0; i < f.length; i += 6) GP.FX.fire(f[i], f[i + 1], 1, 0.3 * Math.max(1, SCALE * 0.7), -2.2);
        fireFxT = 0.05;
      }
      for (let i = 0; i < f.length && i < 24; i += 8) GP.FX.frameLight(f[i], f[i + 1], 3, '#ff8a30', 0.7);
    }
    if (r.ignited) GP.Audio.play('ignite', { x: r.fire && r.fire.length ? r.fire[0] : 0, y: r.fire && r.fire.length ? r.fire[1] : 0, vol: 0.3 });
  }
  // Pinned ice is solid: a body resting on it stops sinking in and slides a little; one frozen into it
  // (ice pressing in from all sides) is held still. n: ice drops touching it, (sx, sy): their summed
  // push out of the ice, depth: their summed depth.
  function holdInIce(b, n, sx, sy, depth, dt) {
    const s = Math.hypot(sx, sy);
    const held = 1 - Math.min(1, s / depth);         // 0: resting on ice .. 1: frozen in all round
    if (held > 0.5 && n >= 3) {
      const k = Math.max(0, 1 - dt * 40 * held);
      b.vx *= k; b.vy *= k; b.w *= k;
      return;
    }
    if (s < 1e-6) return;
    const nx = sx / s, ny = sy / s;
    const vn = b.vx * nx + b.vy * ny;
    // push back out of the ice at a speed that clears the average depth (past a small overlap) quickly
    const back = Math.min(1.5, Math.max(0, depth / n - R * 0.3) * 10);
    if (vn < back) { b.vx += (back - vn) * nx; b.vy += (back - vn) * ny; }
    // ice is slippery, but not frictionless
    const tx = -ny, ty = nx, vt = b.vx * tx + b.vy * ty, f = Math.min(1, dt * 1.5);
    b.vx -= vt * f * tx; b.vy -= vt * f * ty;
    b.wake();
  }
  function touch(b, e, out, o, NT, dt) {
    const h = (t) => out[o + t] * SCALE;       // bigger particles make fewer contacts
    // where the liquid around this body reaches (characters use it to tell if their head is under)
    b.liquidAt = game ? game.time : 0;
    b.liquidTop = out[o + NT + 1];
    const lava = h(LAVA), water = h(WATER), acid = h(ACID), ice = h(ICE), fire = out[o + NT] * SCALE;
    if (lava) {
      const f = Math.min(1, lava / 6);
      GP.Damage.hit(b, { type: 'fire', amount: 55 * f * dt, x: b.x, y: b.y });
      if (GP.Heat) { b.temp = Math.max(b.temp || 20, 300 + 600 * f); if (Math.random() < dt * 2 * f) GP.Heat.ignite(e); }
      if (Math.random() < dt * 6 * f) { GP.FX.fire(b.x, b.y, 1, 0.25); GP.FX.embers(b.x, b.y, 1, 0.2); }
      wearAway(b, e, MELT, 'melt', f, dt, '#333');
    }
    if (fire) {
      const f = Math.min(1, fire / 4);
      GP.Damage.hit(b, { type: 'fire', amount: 20 * f * dt, x: b.x, y: b.y });
      if (GP.Heat && Math.random() < dt * 3 * f) GP.Heat.ignite(e);
    }
    if (acid) {
      const f = Math.min(1, acid / 6);
      GP.Damage.hit(b, { type: 'acid', amount: 30 * f * dt, x: b.x, y: b.y });
      if (Math.random() < dt * 4 * f) GP.FX.smoke(b.x, b.y, 1, 0.2, '#b8ff80', -1, 0.3, 1.2);
      if (Math.random() < dt * 2 * f) GP.Audio.play('saberSizzle', { x: b.x, y: b.y, vol: 0.12 });
      wearAway(b, e, DISSOLVE, 'dissolve', f, dt, '#9adf60');
    }
    if (water) {
      if (e.onFire && water > 2 && GP.Heat) GP.Heat.extinguish(e);
      if (b.temp != null) b.temp += (12 - b.temp) * Math.min(1, dt * 0.8 * Math.min(1, water / 6));
      if (water >= 2) { b.waterSurf = out[o + NT + 1]; wet.add(b); }
    }
    if (ice) {
      if (e.onFire && ice > 2 && GP.Heat) GP.Heat.extinguish(e);
      if (b.temp != null && b.temp > -2) b.temp += (-2 - b.temp) * Math.min(1, dt * 0.5 * Math.min(1, ice / 6));
    }
  }
  // props melt in lava and dissolve in acid
  function wearAway(b, e, table, key, f, dt, smoke) {
    const time = table[e.material];
    if (!time || e.def.fireproof && key === 'melt') return;
    if (e.kind !== 'prop' && e.kind !== 'fragment' && e.kind !== 'debris') return;
    e[key] = (e[key] || 0) + dt * f;
    if (e[key] > time * e.scale) { GP.FX.smoke(b.x, b.y, 4, 0.4, smoke); game.removeEntity(e); }
  }

  /* ---------------------------------------------------------------- solid ice */
  // Pinned ice is solid in the physics world too, so people can stand and walk on a frozen pond: one
  // invisible static body of boxes, one per run of ice cells (merged downward where runs line up).
  // New cells aren't added where something is in the way (a body frozen into the ice is held by the
  // liquid instead, see holdInIce), but cells already there stay as long as the ice does, so nothing
  // standing on the ice sinks into it.
  let iceBody = null, iceCells = new Set(), iceT = 0;
  const cellKey = (cx, cy) => (cx + 50000) * 100000 + (cy + 50000);
  function updateIce(g, dt) {
    iceT -= dt;
    if (iceT > 0) return;
    iceT = 0.2;
    const world = g.world;
    if (iceBody && (iceBody.world !== world || iceBody.removed)) { iceBody = null; iceCells = new Set(); }
    const n = view.n, px = view.px, py = view.py, fl = view.flags;
    const sp = 0.1 * SCALE, half = sp * 0.45;
    const want = new Set();
    for (let i = 0; i < n; i++) {
      if (!(fl[i] & 4)) continue;
      const cy = Math.floor(py[i] / sp);
      want.add(cellKey(Math.floor((px[i] - half) / sp), cy));
      want.add(cellKey(Math.floor((px[i] + half) / sp), cy));
    }
    const next = new Set();
    for (const k of want) {
      if (iceCells.has(k)) { next.add(k); continue; }
      const x0 = (Math.floor(k / 100000) - 50000) * sp, y0 = (k % 100000 - 50000) * sp;
      let blocked = false;
      world.queryAABB(x0, y0, x0 + sp, y0 + sp, (s) => {
        if (blocked || s.sensor || !s.enabled || s.body.removed || s.body.type === Phys.STATIC) return;
        if (s.maxX > x0 && s.minX < x0 + sp && s.maxY > y0 && s.minY < y0 + sp) blocked = true;
      });
      if (!blocked) next.add(k);
    }
    if (next.size === iceCells.size) { let same = true; for (const k of next) if (!iceCells.has(k)) { same = false; break; } if (same) return; }
    iceCells = next;
    if (iceBody) { world.removeBody(iceBody); iceBody = null; }
    if (!next.size) return;
    // cells -> runs along each row -> boxes, a box growing down while the row below has the same run
    const rows = new Map();
    for (const k of next) {
      const cy = k % 100000 - 50000;
      let r = rows.get(cy); if (!r) { r = []; rows.set(cy, r); } r.push(Math.floor(k / 100000) - 50000);
    }
    const open = new Map(), boxes = [];
    for (const cy of [...rows.keys()].sort((a, b) => a - b)) {
      const xs = rows.get(cy).sort((a, b) => a - b), runs = [];
      for (let i = 0; i < xs.length; i++) { if (runs.length && xs[i] === runs[runs.length - 1][1] + 1) runs[runs.length - 1][1] = xs[i]; else runs.push([xs[i], xs[i]]); }
      const still = new Map();
      for (const [a, b] of runs) {
        const rk = a * 100003 + b, box = open.get(rk);
        if (box && box.y1 === cy) { box.y1 = cy + 1; still.set(rk, box); } else { const nb = { x0: a, x1: b + 1, y0: cy, y1: cy + 1 }; boxes.push(nb); still.set(rk, nb); }
      }
      open.clear(); for (const [rk, box] of still) open.set(rk, box);
    }
    const body = new Phys.Body({ type: Phys.STATIC });
    for (const q of boxes) {
      const x0 = q.x0 * sp, x1 = q.x1 * sp, y0 = q.y0 * sp, y1 = q.y1 * sp;
      // slippery; lightsaber blades pass through (they melt the ice instead)
      const s = Phys.poly([x0, y0, x1, y0, x1, y1, x0, y1], { friction: 0.12, restitution: 0.05, category: Phys.CAT.WORLD, mask: Phys.CAT.ALL & ~Phys.CAT.BLADE });
      s.tag = 'ice';
      body.addShape(s);
    }
    body.finalize();
    world.addBody(body);
    iceBody = body;
  }

  /* ---------------------------------------------------------------- asking where liquid is */
  // How much liquid (in drops of the finest size) is within r of (x, y). Uses a coarse grid over the
  // latest particle state, rebuilt at most once per state; cooled rock and ice don't count.
  let qView = null, qGrid = null;
  const QC = 0.5;
  function liquidNear(x, y, r) {
    const v = view, n = v.n;
    if (!n) return 0;
    if (qView !== v) {
      qView = v; qGrid = new Map();
      for (let i = 0; i < n; i++) {
        if (v.type[i] === COOLED || v.type[i] === ICE) continue;
        const k = Math.floor(v.px[i] / QC) * 100000 + Math.floor(v.py[i] / QC);
        let a = qGrid.get(k); if (!a) { a = []; qGrid.set(k, a); } a.push(i);
      }
    }
    let c = 0;
    const r2 = r * r, x0 = Math.floor((x - r) / QC), x1 = Math.floor((x + r) / QC), y0 = Math.floor((y - r) / QC), y1 = Math.floor((y + r) / QC);
    for (let cx = x0; cx <= x1; cx++) for (let cy = y0; cy <= y1; cy++) {
      const a = qGrid.get(cx * 100000 + cy);
      if (a) for (const i of a) { const dx = v.px[i] - x, dy = v.py[i] - y; if (dx * dx + dy * dy < r2) c++; }
    }
    return c * SCALE * SCALE;
  }

  // The liquid surface above (x, y): null if (x, y) isn't in liquid, else the y where it ends going up
  function surfaceAbove(x, y, maxUp = 6) {
    if (liquidNear(x, y, 0.25) < 3) return null;
    for (let d = 0.1; d <= maxUp; d += 0.1) if (liquidNear(x, y - d, 0.2) < 2) return y - d + 0.1;
    return y - maxUp;
  }

  /* ---------------------------------------------------------------- adding & removing liquid */
  const limit = () => Math.min(HARD_CAP, mapCount + M.clamp(GP.Settings.p.maxFluid || 1500, 0, MAX_EXTRA));
  function count() {
    if (!useWorker) return kernel.count() + addBuf.length / 5;
    return view.n + addBuf.length / 5 + countAdds(ops) + (inflight ? inflight.adds : 0);
  }
  function add(t, x, y, vxi = 0, vyi = 0) {
    if (count() >= limit()) return false;
    addBuf.push(t, x, y, vxi, vyi);
    if (!useWorker && addBuf.length >= 5000) flushAdds();
    return true;
  }
  // true when (x,y) is inside solid geometry (no point spawning liquid there)
  function solidAt(x, y, ignore) {
    if (!game) return false;
    return game.world.queryPoint(x, y, (s) => !s.sensor && s.tag !== 'blade' && (!ignore || s.body.entity !== ignore)).length > 0;
  }
  // Drops poured in the last moment, so new ones aren't spawned on top of them. Overlapping drops
  // burst apart and fly off in lumps; spaced out, a pour falls as one smooth stream.
  const recent = [];
  const nowT = () => (game ? game.time : 0);
  function crowded(x, y, minD) {
    const now = nowT(), d2 = minD * minD;
    for (let i = recent.length - 1; i >= 0; i--) {
      const r = recent[i], dt = now - r.t;
      if (dt > 0.3 || dt < 0) { recent.splice(0, i + 1); break; }
      const rx = r.x + r.vx * dt, ry = r.y + r.vy * dt + 4.9 * dt * dt;
      if ((rx - x) * (rx - x) + (ry - y) * (ry - y) < d2) return true;
    }
    // settled liquid only needs a little room: pouring into a pool still fills it up
    return liquidNear(x, y, minD * 0.55) > 0;
  }
  function pour(t, x, y, cnt, spread = 0.2, vxi = 0, vyi = 0, ignore = null) {
    let made = 0;
    const minD = 0.1 * SCALE * 0.8;
    for (let k = 0; k < cnt; k++) {
      let x1 = 0, y1 = 0, ok = false;
      for (let tries = 0; tries < 4 && !ok; tries++) {
        const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * spread;
        x1 = x + Math.cos(a) * r; y1 = y + Math.sin(a) * r;
        ok = !solidAt(x1, y1, ignore) && !crowded(x1, y1, minD);
      }
      if (!ok) continue;
      const vx1 = vxi + M.rand(-0.15, 0.15), vy1 = vyi + M.rand(-0.15, 0.15);
      if (add(t, x1, y1, vx1, vy1)) { made++; recent.push({ x: x1, y: y1, vx: vx1, vy: vy1, t: nowT() }); if (recent.length > 600) recent.splice(0, 100); }
      else break;
    }
    return made;
  }
  // A steady pour of `perSec` drops a second from a spout `spread` either side of (x, y) (the Liquid
  // tool, taps). Drops leave in evenly spaced rows across the spout, each row one spacing behind the
  // last, so a pour is an even stream as wide as its spout. (Drops scattered at random bunch up and
  // fall as lumps.) Where the spout is blocked by solids or liquid, those drops are simply skipped.
  function stream(st, t, x, y, perSec, spread, dt, vxi = 0, vyi = 0, ignore = null) {
    const sp = 0.1 * SCALE;
    const cols = Math.max(1, Math.round(2 * spread / sp));
    st.acc = Math.min((st.acc || 0) + perSec * dt / cols, perSec * 0.1 / cols + 1);   // rows due
    const rows = Math.floor(st.acc);
    st.made = 0;
    if (rows <= 0) return 0;
    const l = Math.hypot(vxi, vyi), ux = l ? vxi / l : 0, uy = l ? vyi / l : 1;
    const speed = Math.max(l, perSec * sp / cols);     // rows leave one spacing apart
    let made = 0;
    for (let r = 0; r < rows; r++) {
      st.acc -= 1;
      const along = sp * (rows - 1 - r);              // several rows in one tick: earlier ones are further out
      for (let c = 0; c < cols; c++) {
        const across = (c - (cols - 1) / 2 + M.rand(-0.12, 0.12)) * sp;
        const x1 = x + ux * along - uy * across, y1 = y + uy * along + ux * across;
        if (solidAt(x1, y1, ignore) || liquidNear(x1, y1, sp * 0.45) > 0) continue;
        if (!add(t, x1, y1, ux * speed, uy * speed)) { st.made = made; return made; }
        made++;
      }
    }
    st.made = made;
    return made;
  }
  function erase(x, y, radius) {
    let k = 0;
    for (let i = 0; i < view.n; i++) if (M.dist2(view.px[i], view.py[i], x, y) < radius * radius) k++;
    flushAdds();
    send({ k: 'erase', x, y, r: radius });
    return k;
  }
  function clear() {
    addBuf = [];
    ops = ops.filter((op) => op.k === 'config' || op.k === 'tune' || op.k === 'spacing');
    send({ k: 'clear' });
    discardBelow = seq + 1; ready = null;
    view = { n: 0, px: new Float32Array(0), py: new Float32Array(0), rx: new Float32Array(0), ry: new Float32Array(0), type: new Uint8Array(0), flags: new Uint8Array(0) };
    forces.clear();
    mapCount = 0;
    for (const b of wet) b.waterSurf = null;
    wet.clear();
    if (iceBody && iceBody.world && !iceBody.removed) iceBody.world.removeBody(iceBody);
    iceBody = null; iceCells = new Set();
  }

  /* ---------------------------------------------------------------- drawing */
  // Each liquid is drawn as one see-through sheet. The particles are stamped as discs, blurred and
  // cut at half strength ("gooey" metaballs) so neighbouring drops merge into one smooth surface
  // instead of a pile of balls. That shape is filled with a depth gradient (clear near the top, a
  // deeper tint further down) and given a bright line along its top edge. Everything underneath,
  // including anyone submerged, stays visible through it.
  const LOOKS = [
    { depth: 6, stops: [[0, 'rgba(130,205,255,0.24)'], [0.3, 'rgba(70,150,235,0.34)'], [1, 'rgba(24,82,175,0.52)']], rim: 'rgba(225,245,255,0.7)' },
    { depth: 4, stops: [[0, 'rgba(255,215,100,0.7)'], [0.25, 'rgba(255,110,24,0.66)'], [1, 'rgba(205,52,12,0.78)']], rim: 'rgba(255,245,190,1)', glow: 0.35 },
    { depth: 4, stops: [[0, 'rgba(78,60,54,0.92)'], [1, 'rgba(46,34,32,0.95)']], rim: 'rgba(110,90,80,0.95)' },
    { depth: 3, stops: [[0, 'rgba(150,110,40,0.72)'], [0.3, 'rgba(70,48,18,0.82)'], [1, 'rgba(34,24,10,0.9)']], rim: 'rgba(230,200,120,0.85)' },
    { depth: 4, stops: [[0, 'rgba(170,255,90,0.38)'], [0.35, 'rgba(110,220,40,0.46)'], [1, 'rgba(50,140,20,0.6)']], rim: 'rgba(220,255,170,0.9)', glow: 0.18 },
    { depth: 3, stops: [[0, 'rgba(190,20,24,0.62)'], [0.35, 'rgba(140,8,12,0.74)'], [1, 'rgba(80,0,4,0.86)']], rim: 'rgba(240,90,90,0.8)' },
    // ice: pale and frosty, nearly opaque
    { depth: 3, stops: [[0, 'rgba(236,248,255,0.82)'], [0.3, 'rgba(192,228,250,0.74)'], [1, 'rgba(132,186,226,0.8)']], rim: 'rgba(255,255,255,0.95)' },
  ];
  const DRAW_ORDER = [COOLED, LAVA, BLOOD, ACID, WATER, ICE, OIL];
  let layer = null, lctx = null, layer2 = null, lctx2 = null, goo = null, gooBlur = 0;
  // Look of the surface: disc size and blur (in particle spacings), where the blurred shape is cut,
  // and how fast drops are stretched into streaks. The blur is just wide enough to iron the particle-
  // sized bumps out of a resting pool; any wider and every stream and splash swells into a fat,
  // rounded lump. The cut keeps lone drops visible.
  const look = { DISC: 0.6, BLUR: 0.5, CUT: 0.35, SLOPE: 12, STREAK: 1.6, STREAK_W: 1.0 };
  let gooCut = -1, gooSlope = -1, gooFunc = null;
  function layers(W, Hc) {
    if (!layer) {
      layer = document.createElement('canvas'); lctx = layer.getContext('2d');
      layer2 = document.createElement('canvas'); lctx2 = layer2.getContext('2d');
      if ('filter' in lctx2) {
        // blur, then turn alpha into a steep ramp: discs closer than about their radius fuse together
        const NS = 'http://www.w3.org/2000/svg';
        const svg = document.createElementNS(NS, 'svg');
        svg.setAttribute('width', '0'); svg.setAttribute('height', '0');
        svg.style.cssText = 'position:absolute;width:0;height:0;pointer-events:none';
        svg.innerHTML = '<filter id="gp-goo" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="3"/>' +
          '<feComponentTransfer><feFuncA type="linear" slope="1" intercept="0"/></feComponentTransfer></filter>';
        document.body.appendChild(svg);
        goo = svg.querySelector('feGaussianBlur');
        gooFunc = svg.querySelector('feFuncA');
      }
    }
    for (const c of [layer, layer2]) if (c.width !== W || c.height !== Hc) { c.width = W; c.height = Hc; }
  }
  function draw(ctx, cam, vr) {
    const n = view.n;
    if (!n) return;
    const px = view.px, py = view.py, rx = view.rx, ry = view.ry, type = view.type, flags = view.flags;
    const al = game && game.renderAlpha != null ? game.renderAlpha : 1;
    const minX = vr.minX - 0.5, maxX = vr.maxX + 0.5, minY = vr.minY - 0.5, maxY = vr.maxY + 0.5;
    const sm = ctx.getTransform ? ctx.getTransform() : null;
    const zoom = sm ? Math.hypot(sm.a, sm.b) : 40;              // screen pixels per metre
    // with the goo filter the discs can be smaller: the blur fills the gaps between them
    const sp = 0.1 * SCALE, dr = sp * look.DISC;
    // The shape is built at reduced resolution (the blur hides it): about 3 px of blur per disc.
    const q = M.clamp(3 / (sp * zoom * look.BLUR), 0.5, 1);
    const W = Math.ceil(ctx.canvas.width * q), Hc = Math.ceil(ctx.canvas.height * q);
    if (sm && typeof document !== 'undefined') layers(W, Hc);
    const fancy = !!(sm && goo);
    const m = fancy ? new DOMMatrix([sm.a * q, sm.b * q, sm.c * q, sm.d * q, sm.e * q, sm.f * q]) : null;
    if (fancy) {
      const blur = Math.round(M.clamp(sp * zoom * q * look.BLUR, 1, 16) * 2) / 2;
      if (blur !== gooBlur) { gooBlur = blur; goo.setAttribute('stdDeviation', String(blur)); }
      if (gooCut !== look.CUT || gooSlope !== look.SLOPE) {
        gooCut = look.CUT; gooSlope = look.SLOPE;
        gooFunc.setAttribute('slope', String(look.SLOPE)); gooFunc.setAttribute('intercept', String(-look.CUT * look.SLOPE + 0.5));
      }
    }
    const present = new Uint8Array(TYPES.length);
    for (let i = 0; i < n; i++) present[type[i]] = 1;
    for (const t of DRAW_ORDER) {
      if (!present[t]) continue;
      const L = LOOKS[t];
      const path = new Path2D(), streaks = fancy ? new Path2D() : null;
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, nStreak = 0;
      for (let i = 0; i < n; i++) {
        if (type[i] !== t) continue;
        const x = rx[i] + (px[i] - rx[i]) * al, y = ry[i] + (py[i] - ry[i]) * al;
        if (x < minX || x > maxX || y < minY || y > maxY) continue;
        // how far it moved since the last update: fast drops become short streaks (a falling
        // stream reads as one ribbon instead of a string of beads)
        const mx = px[i] - rx[i], my = py[i] - ry[i], ml = mx * mx + my * my;
        if (streaks && ml > sp * sp * 0.25) {
          const l = Math.sqrt(ml), k = Math.min(look.STREAK, sp * 3 / l);
          streaks.moveTo(x - mx * k, y - my * k); streaks.lineTo(x, y); nStreak++;
        } else {
          path.moveTo(x + dr, y); path.arc(x, y, dr, 0, Math.PI * 2);
        }
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
      if (x0 > x1) continue;
      const g = ctx.createLinearGradient(0, y0 - dr, 0, y0 + L.depth);
      for (const [o, c] of L.stops) g.addColorStop(o, c);
      if (!fancy) {
        // no filters available: plain see-through discs straight onto the scene
        ctx.fillStyle = g; ctx.beginPath(); ctx.fill(path);
        continue;
      }
      // layer rectangle the sheet covers, padded for the blur
      const pad = sp * 4;
      let sx0 = Infinity, sy0 = Infinity, sx1 = -Infinity, sy1 = -Infinity;
      for (const [cx, cy] of [[x0 - pad, y0 - pad], [x1 + pad, y0 - pad], [x0 - pad, y1 + pad], [x1 + pad, y1 + pad]]) {
        const X = m.a * cx + m.c * cy + m.e, Y = m.b * cx + m.d * cy + m.f;
        if (X < sx0) sx0 = X; if (X > sx1) sx1 = X; if (Y < sy0) sy0 = Y; if (Y > sy1) sy1 = Y;
      }
      const bp = Math.ceil(gooBlur * 3) + 2;
      sx0 = Math.max(0, Math.floor(sx0) - bp); sy0 = Math.max(0, Math.floor(sy0) - bp);
      sx1 = Math.min(W, Math.ceil(sx1) + bp); sy1 = Math.min(Hc, Math.ceil(sy1) + bp);
      const w = sx1 - sx0, h = sy1 - sy0;
      if (w <= 0 || h <= 0) continue;
      // 1. solid discs
      lctx.setTransform(1, 0, 0, 1, 0, 0);
      lctx.globalCompositeOperation = 'source-over';
      lctx.clearRect(sx0, sy0, w, h);
      lctx.setTransform(m);
      lctx.fillStyle = '#fff'; lctx.fill(path);
      if (nStreak) { lctx.strokeStyle = '#fff'; lctx.lineWidth = dr * look.STREAK_W; lctx.lineCap = 'round'; lctx.stroke(streaks); }
      lctx.setTransform(1, 0, 0, 1, 0, 0);
      // 2. fused into one smooth shape
      lctx2.setTransform(1, 0, 0, 1, 0, 0);
      lctx2.globalCompositeOperation = 'source-over';
      lctx2.clearRect(sx0, sy0, w, h);
      lctx2.filter = 'url(#gp-goo)';
      lctx2.drawImage(layer, sx0, sy0, w, h, sx0, sy0, w, h);
      lctx2.filter = 'none';
      // 3. the surface line: the shape minus itself shifted down a little, painted onto layer 1
      const rim = Math.max(1, 0.03 * zoom * q);
      lctx.clearRect(sx0, sy0, w, h);
      lctx.fillStyle = L.rim; lctx.fillRect(sx0, sy0, w, h);
      lctx.globalCompositeOperation = 'destination-in';
      lctx.drawImage(layer2, sx0, sy0, w, h, sx0, sy0, w, h);
      lctx.globalCompositeOperation = 'destination-out';
      lctx.drawImage(layer2, sx0, sy0, w, h, sx0, sy0 + rim, w, h);
      lctx.globalCompositeOperation = 'source-over';
      // 4. the tinted body, then the line on top
      lctx2.globalCompositeOperation = 'source-in';
      lctx2.setTransform(m);
      lctx2.fillStyle = g;
      lctx2.fillRect(x0 - pad * 2, y0 - pad * 2, x1 - x0 + pad * 4, y1 - y0 + pad * 4);
      lctx2.setTransform(1, 0, 0, 1, 0, 0);
      lctx2.globalCompositeOperation = 'source-over';
      lctx2.drawImage(layer, sx0, sy0, w, h, sx0, sy0, w, h);
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(layer2, sx0, sy0, w, h, sx0 / q, sy0 / q, w / q, h / q);
      // glowing liquids add a little light of their own, so lava stays bright on dark backgrounds
      if (L.glow) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = L.glow; ctx.drawImage(layer2, sx0, sy0, w, h, sx0 / q, sy0 / q, w / q, h / q); }
      ctx.restore();
    }
    // glowing lava, hot rock and burning oil light up their surroundings: one light per occupied cell
    const cells = new Map();
    for (let i = 0; i < n; i++) {
      if (!(flags[i] & 3)) continue;
      const x = px[i], y = py[i];
      if (x < minX || x > maxX || y < minY || y > maxY) continue;
      const key = Math.floor(x / 1.5) * 4096 + Math.floor(y / 1.5);
      cells.set(key, (cells.get(key) || 0) + SCALE * SCALE);
    }
    let lights = 0;
    for (const [key, w] of cells) {
      if (w < 3 || lights++ > 40) continue;
      const cx = (Math.floor(key / 4096) + 0.5) * 1.5, cy = ((key % 4096 + 4096) % 4096 + 0.5) * 1.5;
      GP.FX.frameLight(cx, cy, 3.2, '#ff7a30', Math.min(0.9, w / 15));
    }
    void cam;
  }

  /* ---------------------------------------------------------------- map lakes and rivers */
  // Called after a map is built. `regions` are the map's liquid rectangles ({type, x1, y1, x2, y2});
  // they are filled with particles sized so the total stays within the chosen quality's budget.
  // This runs on the main-thread kernel (it has to finish before the map is shown) and the settled
  // liquid is then handed to the worker.
  function prepare(g, regions) {
    game = g; mapCount = 0; wet.clear();
    addBuf = []; ops = []; ready = null; discardBelow = seq + 1;
    kernel.applyOp({ k: 'clear' });
    const L = level();
    let sp = L.min;
    if (regions.length) {
      let area = 0;
      for (const r of regions) for (let x = r.x1 + 0.1; x < r.x2; x += 0.2) for (let y = r.y1 + 0.1; y < r.y2; y += 0.2) if (!solidAt(x, y)) area += 0.04;
      sp = Math.max(L.min, Math.sqrt(area / (0.87 * L.budget)));
    }
    SCALE = sp / 0.1; R = 0.055 * SCALE;
    kernel.applyOp({ k: 'spacing', s: sp });
    // hexagonal packing at the spacing the liquid settles to (near-pressure keeps particles a little
    // further apart than the nominal spacing), so a lake starts at the right level and calm
    const ls = sp * 1.06;
    const fillRows = (r, yBottom, yTop) => {
      const t = NAMES[r.type], a = [];
      let row = 0;
      for (let y = yBottom - ls * 0.5; y > yTop; y -= ls * 0.866, row++) {
        for (let x = r.x1 + ls * (row % 2 ? 0.5 : 0.25); x < r.x2; x += ls) {
          if (solidAt(x, y) || solidAt(x, y + R) || solidAt(x - R, y) || solidAt(x + R, y)) continue;
          a.push(t, x, y, 0, 0);
        }
      }
      kernel.applyOp({ k: 'add', a });
    };
    for (const r of regions) fillRows(r, r.y2, r.y1);
    // Deep water starts out evenly packed and would bounce while gravity compresses it: let it settle
    // (heavily damped, out of sight) before the map is shown. Settled liquid packs a little differently
    // than it starts, so after each settle it is trimmed back to the map's water line, or topped up to
    // it where it sank below.
    const was = useWorker;
    useWorker = false;
    if (kernel.count()) {
      sendStatics = true;
      const steps = Math.max(20, Math.min(70, Math.round(150000 / kernel.count())));
      const regionOf = (x) => regions.find((q) => x >= q.x1 - 1 && x <= q.x2 + 1) || regions[0];
      for (let pass = 0; pass < 3; pass++) {
        for (let k = 0; k < steps; k++) { const { msg } = buildMsg(g, 1 / 60, tune.SUBSTEPS); msg.damp = 5; kernel.run(msg); }
        const A = kernel.arrays();
        for (let i = kernel.count() - 1; i >= 0; i--) if (A.py[i] < regionOf(A.px[i]).y1 + R) kernel.remove(i);
        if (pass === 2) break;
        for (const r of regions) {
          // the settled surface: the top few particles, ignoring the odd splash
          const ys = [];
          for (let i = 0; i < kernel.count(); i++) if (A.px[i] >= r.x1 && A.px[i] <= r.x2 && A.py[i] >= r.y1 && A.py[i] <= r.y2) ys.push(A.py[i]);
          if (ys.length < 10) continue;
          ys.sort((a1, a2) => a1 - a2);
          const top = ys[Math.floor(ys.length * 0.02)];
          if (top - ls * 0.6 > r.y1) fillRows(r, top - ls * 0.4, r.y1);
        }
      }
      const A = kernel.arrays();
      for (let i = 0; i < kernel.count(); i++) { A.vx[i] *= 0.2; A.vy[i] *= 0.2; }
    }
    mapCount = kernel.count();
    view = kernel.run({ dt: 0 });
    useWorker = was;
    if (useWorker) toWorker();
    sendStatics = true;
  }

  /* ---------------------------------------------------------------- effects from elsewhere */
  GP.Events.on('explosion', (d) => {
    if (!count()) return;
    send({ k: 'blast', x: d.x, y: d.y, r: d.radius, fire: d.kind === 'fire' || d.kind === 'incendiary', cold: d.kind === 'cryo' && heatOn() });
  });

  /* ---------------------------------------------------------------- save / load */
  function serialize() {
    flushAdds();
    const src = useWorker ? view : kernel.run({ dt: 0 });
    const n = src.n;
    if (!n) return null;
    const t = new Array(n), p = new Array(n * 2);
    for (let i = 0; i < n; i++) { t[i] = src.type[i]; p[i * 2] = +src.px[i].toFixed(3); p[i * 2 + 1] = +src.py[i].toFixed(3); }
    return { t, p, s: +(SCALE * 0.1).toFixed(4), m: mapCount };
  }
  function load(data) {
    clear();
    if (!data || !data.t) return;
    const total = Math.min(HARD_CAP, data.t.length);
    const p = new Float32Array(total * 2), t = new Uint8Array(total);
    for (let i = 0; i < total; i++) { p[i * 2] = data.p[i * 2]; p[i * 2 + 1] = data.p[i * 2 + 1]; t[i] = Math.min(TYPES.length - 1, data.t[i]); }
    const sp = data.s || 0.1;
    SCALE = sp / 0.1; R = 0.055 * SCALE;
    mapCount = Math.min(total, data.m != null ? data.m : total);
    send({ k: 'load', p, t, s: sp });
    const xs = new Float32Array(total), ys = new Float32Array(total);
    for (let i = 0; i < total; i++) { xs[i] = p[i * 2]; ys[i] = p[i * 2 + 1]; }
    view = { n: total, px: xs, py: ys, rx: xs, ry: ys, type: t, flags: new Uint8Array(total) };
  }

  /* ---------------------------------------------------------------- spawnable sources */
  const liquidName = (t) => TYPES[t].name;
  const tap = (id, name, t, body, spout) => ({
    id, name, category: 'Structures', sub: 'Liquids', kind: 'prop', layer: 1, material: 'metal', hp: 250, density: 160, frozen: true,
    shapes: [{ box: [0.5, 0.34] }], color: body,
    onBuild: (e) => { if (e.running == null) e.running = true; if (e.flowRate == null) e.flowRate = 60; },
    onUse: (e) => { e.running = !e.running; GP.Audio.play('click', { f: e.running ? 1300 : 800 }); },
    update: (e, dt) => {
      if (!e.running || e.hp <= 0 || !e.game.world) return;
      const b = e.body, f = e.facing, a = b.a + (f < 0 ? Math.PI : 0);
      const p = b.originToWorld(0.34 * f * e.scale, 0.02 * e.scale);
      game = e.game;
      e.pourSt = e.pourSt || {};
      stream(e.pourSt, t, p.x, p.y, e.flowRate * e.scale / (SCALE * SCALE), 0.05 * e.scale, dt, Math.cos(a) * 2.9 + b.vx, Math.sin(a) * 2.9 + b.vy, e);
      if (t === LAVA) GP.FX.frameLight(p.x, p.y, 1.8, '#ff7a30', 0.6);
    },
    props: (e) => [
      { key: 'flowing', label: 'Flowing', type: 'bool', get: () => !!e.running, set: (v) => { e.running = v; } },
      { key: 'rate', label: 'Flow rate (drops/s)', type: 'range', min: 5, max: 240, step: 5, get: () => e.flowRate, set: (v) => { e.flowRate = v; } },
    ],
    paint: (ctx, e) => {
      GP.Draw.roundRect(ctx, -0.25, -0.17, 0.42, 0.34, 0.06); ctx.fillStyle = body; ctx.fill(); ctx.strokeStyle = GP.Draw.OUTLINE; ctx.lineWidth = 0.022; ctx.stroke();
      ctx.fillStyle = '#2a2c30'; ctx.fillRect(0.14, -0.06, 0.2, 0.12); ctx.strokeRect(0.14, -0.06, 0.2, 0.12);
      ctx.fillStyle = e.running ? spout : '#3a3e46'; ctx.fillRect(-0.16, -0.26, 0.2, 0.09);
    },
    desc: 'Pours ' + liquidName(t) + ' out of its spout. Activate (F) or wire it to turn it on and off; set the flow rate in Properties.',
    tags: ['liquid', 'fluid', 'pour', 'faucet', 'tap', liquidName(t)],
  });
  const tank = (id, name, t, body, band) => ({
    id, name, category: 'Structures', sub: 'Liquids', kind: 'prop', layer: 2, material: 'metal', hp: 70, density: 90,
    shapes: [{ box: [0.9, 1.3] }], color: body,
    onBreak: (e) => { const b = e.body; game = e.game; pour(t, b.x, b.y, Math.ceil(320 / (SCALE * SCALE)), 0.6, b.vx, b.vy - 1, e); GP.Audio.play('impact', { x: b.x, y: b.y, strength: 1, mat: 'metal' }); },
    onUse: (e) => { e.def.onBreak(e); e.game.removeEntity(e); return true; },
    paint: (ctx) => {
      GP.Draw.roundRect(ctx, -0.45, -0.65, 0.9, 1.3, 0.12); ctx.fillStyle = body; ctx.fill(); ctx.strokeStyle = GP.Draw.OUTLINE; ctx.lineWidth = 0.025; ctx.stroke();
      ctx.fillStyle = band; ctx.fillRect(-0.45, -0.1, 0.9, 0.2);
      ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(-0.32, -0.55, 0.08, 1.1);
    },
    desc: 'Full of ' + liquidName(t) + '. Bursts when shot, cut, blown up or activated (F).',
    tags: ['liquid', 'fluid', 'barrel', 'container', liquidName(t)],
  });
  /* ---------------------------------------------------------------- containers, pipes, pumps, drains */
  const wall = (ctx, x, y, w, h, a, fill) => {
    ctx.save(); ctx.translate(x, y); ctx.rotate(a || 0);
    ctx.fillStyle = fill; ctx.fillRect(-w / 2, -h / 2, w, h);
    ctx.strokeStyle = GP.Draw.OUTLINE; ctx.lineWidth = 0.02; ctx.strokeRect(-w / 2, -h / 2, w, h);
    ctx.restore();
  };
  const drawBoxes = (list, fill) => (ctx) => { for (const s of list) wall(ctx, s.box[2] || 0, s.box[3] || 0, s.box[0], s.box[1], s.box[4], fill); };
  const BUCKET = [{ box: [0.62, 0.06, 0, 0.3] }, { box: [0.06, 0.62, -0.31, 0] }, { box: [0.06, 0.62, 0.31, 0] }];
  const TANK = [{ box: [3, 0.1, 0, 0.85] }, { box: [0.1, 1.8, -1.5, 0] }, { box: [0.1, 1.8, 1.5, 0] }];
  const PIPE = [{ box: [3, 0.08, 0, -0.3] }, { box: [3, 0.08, 0, 0.3] }];
  const FUNNEL = [{ box: [1.0, 0.07, -0.45, -0.05, 0.8] }, { box: [1.0, 0.07, 0.45, -0.05, -0.8] }];
  const PUMP = [{ box: [1.4, 0.1, 0, -0.32] }, { box: [1.4, 0.1, 0, 0.32] }];
  // a zone in the prop's own frame, moved into the world
  const zoneOf = (e, kind, lx, ly, hw, hh, extra) => {
    const b = e.body, f = e.facing || 1, k = e.scale;
    const p = b.originToWorld(lx * f * k, ly * k);
    const a = b.a + (f < 0 ? Math.PI : 0);
    return Object.assign({ kind, x: p.x, y: p.y, c: Math.cos(a), s: Math.sin(a), hw: hw * k, hh: hh * k }, extra);
  };
  const toggle = (e) => { e.running = !e.running; GP.Audio.play('click', { f: e.running ? 1300 : 800 }); return true; };
  const containers = [
    { id: 'bucket', name: 'Bucket', category: 'Structures', sub: 'Liquids', kind: 'prop', layer: 2, material: 'metal', hp: 120, density: 30,
      shapes: BUCKET, color: '#8a9098',
      paint: (ctx) => {
        drawBoxes(BUCKET, '#8a9098')(ctx);
        ctx.strokeStyle = '#5a6068'; ctx.lineWidth = 0.025; ctx.beginPath(); ctx.arc(0, -0.3, 0.3, Math.PI, 0); ctx.stroke();
      },
      desc: 'Scoop up liquid and carry it. Tip it over to pour it out.', tags: ['liquid', 'container', 'pail', 'carry'] },
    { id: 'glass_tank', name: 'Glass Tank', category: 'Structures', sub: 'Liquids', kind: 'prop', layer: 1, material: 'crystal', hp: 160, density: 60, frozen: true,
      shapes: TANK, color: '#9fd8ff',
      paint: (ctx) => {
        ctx.fillStyle = 'rgba(160,215,255,0.08)'; ctx.fillRect(-1.45, -0.9, 2.9, 1.7);
        drawBoxes(TANK, 'rgba(170,220,255,0.55)')(ctx);
      },
      desc: 'An open-topped glass tank. Fill it with anything.', tags: ['liquid', 'container', 'aquarium', 'pool'] },
    { id: 'pipe', name: 'Pipe', category: 'Structures', sub: 'Liquids', kind: 'prop', layer: 1, material: 'metal', hp: 300, density: 80, frozen: true,
      shapes: PIPE, color: '#6a7078',
      paint: (ctx) => { ctx.fillStyle = 'rgba(40,46,56,0.35)'; ctx.fillRect(-1.5, -0.26, 3, 0.52); drawBoxes(PIPE, '#6a7078')(ctx); },
      desc: 'An open pipe liquid can run through. Rotate and scale it to lay out plumbing.', tags: ['liquid', 'plumbing', 'tube', 'channel'] },
    { id: 'funnel', name: 'Funnel', category: 'Structures', sub: 'Liquids', kind: 'prop', layer: 1, material: 'metal', hp: 200, density: 60, frozen: true,
      shapes: FUNNEL, color: '#7a8088',
      paint: drawBoxes(FUNNEL, '#7a8088'),
      desc: 'Gathers liquid into a narrow stream.', tags: ['liquid', 'plumbing'] },
    { id: 'liquid_pump', name: 'Liquid Pump', category: 'Structures', sub: 'Liquids', kind: 'prop', layer: 1, material: 'metal', hp: 250, density: 120, frozen: true,
      shapes: PUMP, color: '#4a5a6a',
      onBuild: (e) => { if (e.running == null) e.running = true; if (e.power == null) e.power = 7; },
      onUse: toggle,
      fluidZone: (e) => (e.running && e.hp > 0 ? zoneOf(e, 'push', 0, 0, 0.7, 0.27, { speed: e.power, accel: e.power * 12 }) : null),
      props: (e) => [
        { key: 'running', label: 'Running', type: 'bool', get: () => !!e.running, set: (v) => { e.running = v; } },
        { key: 'power', label: 'Push speed (m/s)', type: 'range', min: 1, max: 15, step: 0.5, get: () => e.power, set: (v) => { e.power = v; } },
      ],
      paint: (ctx, e) => {
        ctx.fillStyle = 'rgba(40,46,56,0.35)'; ctx.fillRect(-0.7, -0.27, 1.4, 0.54);
        drawBoxes(PUMP, '#4a5a6a')(ctx);
        ctx.fillStyle = e.running ? '#6ec8ff' : '#3a3e46';
        ctx.beginPath(); ctx.moveTo(-0.2, -0.12); ctx.lineTo(0.22, 0); ctx.lineTo(-0.2, 0.12); ctx.closePath(); ctx.fill();
      },
      desc: 'Pushes liquid through itself in the direction of its arrow, even uphill. Activate (F) or wire it to switch it on and off.', tags: ['liquid', 'plumbing', 'pump', 'machine'] },
    { id: 'drain', name: 'Drain', category: 'Structures', sub: 'Liquids', kind: 'prop', layer: 1, material: 'metal', hp: 300, density: 80, frozen: true,
      shapes: [{ box: [1.0, 0.1] }], color: '#3a3e46',
      onBuild: (e) => { if (e.running == null) e.running = true; },
      onUse: toggle,
      fluidZone: (e) => (e.running && e.hp > 0 ? zoneOf(e, 'drain', 0, -0.12, 0.48, 0.1) : null),
      paint: (ctx, e) => {
        ctx.fillStyle = '#2a2c30'; ctx.fillRect(-0.5, -0.05, 1, 0.1);
        ctx.fillStyle = e.running ? '#6a7078' : '#8a5040';
        for (let x = -0.42; x < 0.45; x += 0.12) ctx.fillRect(x, -0.05, 0.05, 0.1);
      },
      desc: 'Swallows any liquid that reaches its grate. Activate (F) or wire it to open and close it.', tags: ['liquid', 'plumbing', 'sink', 'remove'] },
  ];
  GP.Registry.registerAll([
    tap('water_tap', 'Water Tap', WATER, '#6a7a8a', '#4aa8ff'),
    tap('lava_tap', 'Lava Spout', LAVA, '#3a2a2a', '#ff6a1a'),
    tap('oil_tap', 'Oil Spout', OIL, '#4a4034', '#c89a3a'),
    tap('acid_tap', 'Acid Spout', ACID, '#34443a', '#9aff3a'),
    tank('water_tank', 'Water Tank', WATER, '#5a7a9a', '#4aa8ff'),
    tank('lava_tank', 'Lava Canister', LAVA, '#3a3436', '#ff6a1a'),
    tank('oil_drum', 'Oil Drum', OIL, '#4a5a3a', '#c89a3a'),
    tank('acid_vat', 'Acid Vat', ACID, '#3a4a40', '#9aff3a'),
    ...containers,
  ]);

  return {
    WATER, LAVA, COOLED, OIL, ACID, BLOOD, ICE, NAMES, TYPES, tune, look, MAX_EXTRA, LEVELS,
    update, draw, pour, stream, erase, serialize, load, prepare, count, clear, liquidNear, surfaceAbove,
    spacing: () => SCALE * 0.1,
    scale: () => SCALE,
    snapshot() { /* the kernel keeps the previous positions itself */ },
    add(t, x, y, vxi, vyi) { return add(typeof t === 'string' ? NAMES[t] : t, x, y, vxi, vyi); },
    setGame(g) { game = g; },
    // Run on the main thread (true) or let the settings decide (false). Tests use this so that
    // game.tick() advances the liquid immediately.
    setSync(v) { forceSync = !!v; syncMode(); },
    isThreaded: () => useWorker,
    // push changed TYPES / tune values to wherever the kernel runs
    reconfigure() { send({ k: 'config', types: simTypes() }); send({ k: 'tune', tune: kernelTune() }); },
    // read-only snapshot for tests and tools
    particle(i) {
      if (!useWorker) { flushAdds(); const A = kernel.arrays(); return i < kernel.count() ? { x: A.px[i], y: A.py[i], vx: A.vx[i], vy: A.vy[i], type: TYPES[A.type[i]].name, burning: A.burn[i] > 0 } : null; }
      return i < view.n ? { x: view.px[i], y: view.py[i], vx: 0, vy: 0, type: TYPES[view.type[i]].name, burning: !!(view.flags[i] & 1) } : null;
    },
  };
})();
