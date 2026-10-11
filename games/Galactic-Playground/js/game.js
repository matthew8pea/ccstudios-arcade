/* GALACTIC PLAYGROUND — sandbox game core: entity management, simulation loop, time control,
 * performance safeguards and map loading. UI, tools and saving plug in from their own modules.
 */
'use strict';

GP.Game = class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new GP.Renderer(canvas);
    this.camera = new GP.Camera();
    GP.Audio.setCamera(this.camera);
    this.world = null;
    this.entities = [];
    this.entityMap = new Map();
    this.time = 0;
    this.paused = false; this.slowMo = false; this.fastFwd = false; this.stepRequest = 0;
    this.groupCounter = 0;
    this.debrisCount = 0;
    this.map = null; this.mapId = null;
    this.spawnHistory = [];
    this.controlled = null;
    this.tools = null; this.ui = null;
    this.active = false;       // sandbox running (vs main menu demo)
    this.demo = false;
    this.last = performance.now();
    this.perf = { fps: 60, frame: 16, phys: 0, safeguard: '' };
    this.frameCount = 0;
    this.slowFrames = 0;
    this.errors = 0;
    this.acc = 0;            // unsimulated time carried to the next frame
    this.lerped = [];        // bodies currently drawn at an in-between position
    this.renderAlpha = 1;
    this.newWorld();
    this.scheduleFrame();
  }

  newWorld() {
    const P = GP.Settings.p;
    const w = new GP.Phys.World();
    w.substeps = P.substeps; w.velocityIterations = P.velocityIterations; w.positionIterations = P.positionIterations;
    w.sleepEnabled = P.sleeping;
    w.onPreSolve = (c) => GP.Sabers.preSolve(c);
    w.onJointBreak = (j) => {
      if (j.onBreak) { try { j.onBreak(j); } catch (e) { console.error(e); } }
      if (j.userMade) { const a = j.anchorA(); GP.FX.sparks(a.x, a.y, 0, -1, 8, '#ffd27a', 4); GP.Audio.play('impact', { x: a.x, y: a.y, strength: 0.7, mat: 'metal' }); }
      GP.Events.emit('joint:break', j);
    };
    this.world = w;
    GP.Force.setGame(this);
    if (GP.Fluid) GP.Fluid.setGame(this);
  }
  applyPhysicsSettings() {
    const P = GP.Settings.p;
    this.world.substeps = P.substeps; this.world.velocityIterations = P.velocityIterations;
    this.world.positionIterations = P.positionIterations; this.world.sleepEnabled = P.sleeping;
    if (!P.sleeping) this.world.wakeAll();
  }

  /* ---------------------------------------------------------------- entities */
  nextGroup() { return -(++this.groupCounter); }
  canSpawnBodies(n = 1) { return this.world.bodies.length + n <= GP.Settings.p.maxBodies; }
  canSpawnDebris() { return this.debrisCount < GP.Settings.p.maxDebris && this.canSpawnBodies(1); }

  spawn(id, x, y, opts = {}) {
    const def = GP.Registry.get(id);
    if (!def) { GP.UI && GP.UI.toast('Unknown object: ' + id, 'error'); return null; }
    const est = def.kind === 'character' ? 16 : def.kind === 'vehicle' ? 3 : 1;
    if (!this.canSpawnBodies(est)) {
      if (!opts.silent) { GP.UI && GP.UI.toast('Body limit reached (' + GP.Settings.p.maxBodies + '). Delete objects or raise the limit in Settings.', 'warn'); GP.Audio.play('error'); }
      return null;
    }
    // characters arrive empty-handed unless asked for (opts.armed, e.g. picked with a right-click,
    // or the setting says otherwise)
    if (def.kind === 'character' && !opts.loadout && !opts.armed && !GP.Settings.play.spawnArmed) opts = Object.assign({}, opts, { noLoadout: true });
    let e;
    try {
      e = GP.Registry.create(this, def, opts);
      e.build(x, y, opts);
    } catch (err) {
      console.error('spawn failed', id, err);
      if (e) try { e.destroy(); } catch (e2) { /* ignore */ }
      GP.UI && GP.UI.toast('Could not spawn ' + def.name + ': ' + err.message, 'error');
      return null;
    }
    this.addEntity(e);
    if (!opts.noUnstick) this.unstick(e);
    if (opts.props) e.restoreProps(opts.props);
    if (!opts.silent) {
      GP.Audio.play('spawn', { x, y });
      const bb = e.bounds();
      GP.FX.ring((bb.minX + bb.maxX) / 2, (bb.minY + bb.maxY) / 2, Math.max(bb.maxX - bb.minX, bb.maxY - bb.minY) * 0.7 + 0.3, '#6ec8ff', 0.35, 0.05);
    }
    if (!opts.noUndo) { this.spawnHistory.push(e); if (this.spawnHistory.length > 60) this.spawnHistory.shift(); }
    GP.Events.emit('entity:spawned', { e });
    return e;
  }
  // Lift a freshly spawned entity out of terrain / frozen objects so it never starts embedded.
  unstick(e) {
    const overlaps = () => {
      for (const b of e.bodies) {
        if (b.frozen) continue;
        for (const s of b.shapes) {
          if (!s.enabled || s.sensor || s.tag === 'blade') continue;
          let hit = false;
          this.world.queryAABB(s.minX + 0.02, s.minY + 0.02, s.maxX - 0.02, s.maxY - 0.02, (t) => {
            if (hit || t.body.entity === e || t.sensor || t.tag === 'blade' || t.category === GP.Phys.CAT.DEBRIS) return;
            const te = t.body.entity;
            if (te && (te.holder === e || e.holder === te || te.hidden)) return;
            const cx = (Math.max(s.minX, t.minX) + Math.min(s.maxX, t.maxX)) / 2, cy = (Math.max(s.minY, t.minY) + Math.min(s.maxY, t.maxY)) / 2;
            if (t.containsPoint(cx, cy) && s.containsPoint(cx, cy)) hit = true;
          });
          if (hit) return true;
        }
      }
      return false;
    };
    const all = () => e.bodies.concat(e.items ? e.items().map((i) => i.body) : []);
    for (let i = 0; i < 30 && overlaps(); i++) for (const b of all()) { b.y -= 0.2; b.updateShapes(); }
  }
  addEntity(e) {
    if (this.entityMap.has(e.id)) return;
    this.entities.push(e);
    this.entityMap.set(e.id, e);
  }
  removeEntity(e) {
    if (!e || e.removed && !this.entityMap.has(e.id)) return;
    if (e === this.controlled) this.releaseControl();
    try { e.destroy(); } catch (err) { console.error('destroy', err); }
    this.entityMap.delete(e.id);
    const i = this.entities.indexOf(e);
    if (i >= 0) this.entities.splice(i, 1);
    if (this.tools) this.tools.onEntityRemoved(e);
    GP.Events.emit('entity:removed', { e });
  }
  getEntity(id) { return this.entityMap.get(id); }
  undoSpawn() {
    if (this.tools) return this.tools.undo();
    while (this.spawnHistory.length) {
      const e = this.spawnHistory.pop();
      if (!e.removed) { this.removeEntity(e); GP.Audio.play('remove', {}); return true; }
    }
    return false;
  }

  // Entity under a world point (prefers small things over big ones)
  entityAt(x, y, filter) {
    const bodies = this.world.queryPoint(x, y, (s) => !!s.body.entity && s.tag !== 'blade' && s.tag !== 'shield' && s.tag !== 'hitbox');
    let best = null, bestA = Infinity;
    for (const b of bodies) {
      const e = b.entity;
      if (!e || e.removed || e.hidden || (filter && !filter(e))) continue;
      let area = 0;
      for (const s of b.shapes) area += (s.maxX - s.minX) * (s.maxY - s.minY);
      if (e.isItem) area *= 0.3;
      if (area < bestA) { bestA = area; best = { e, body: b }; }
    }
    if (best) return best;
    const near = this.world.queryNearest(x, y, 0.25 / Math.max(0.4, this.camera.zoom), (s) => !!s.body.entity && !s.body.entity.hidden && s.tag !== 'blade' && s.tag !== 'shield' && s.tag !== 'hitbox' && (!filter || filter(s.body.entity)));
    return near ? { e: near.body.entity, body: near.body } : null;
  }

  /* ---------------------------------------------------------------- control */
  takeControl(e) {
    if (!e || !(e.isCharacterLike || e.isVehicle)) return false;
    if (e.state === 'dead') { GP.UI.toast('That character is out of action. Revive them with the Property tool first.', 'warn'); return false; }
    this.releaseControl();
    this.controlled = e;
    e.playerControlled = true;
    this.camera.follow = () => {
      const c = this.controlled;
      if (!c || c.removed) return null;
      if (c.vehicle) return c.vehicle.position();
      return c.position();
    };
    GP.Events.emit('control:changed', { e });
    return true;
  }
  releaseControl() {
    const c = this.controlled;
    if (!c) return;
    c.playerControlled = false;
    if (c.intent) { c.intent.moveX = 0; c.intent.attack = false; c.intent.jump = false; c.intent.power = null; c.intent.powerHeld = false; }
    GP.Force.release(c, false);
    this.controlled = null;
    this.camera.follow = null;
    GP.Events.emit('control:changed', { e: null });
  }

  /* ---------------------------------------------------------------- maps */
  loadMap(id, opts = {}) {
    const def = GP.Maps.get(id);
    if (!def) throw new Error('Unknown map ' + id);
    // resetting, changing map, loading or leaving throws the scene away: keep a copy to go back to
    if (this.active && this.touched && GP.SaveSystem) GP.SaveSystem.autosave(this, 'before');
    this.touched = false;
    this.clearScene(true);
    this.newWorld();
    this.map = def;
    this.mapId = id;
    this.darkness = null;
    this.time = 0;
    this.groupCounter = 0;
    const W = this.world;
    W.gravityY = def.zeroG ? 0 : (def.gravity != null ? def.gravity : 9.8);
    W.gravityX = 0;
    this.gravity = { base: W.gravityY, zeroG: !!def.zeroG, scale: 1 };
    GP.Maps.build(this, def);
    // remember whether this map was started without its props, so a reset keeps it that way
    if (!opts.keepEmptyChoice) this.mapEmpty = !!opts.empty;
    if (!opts.empty && def.populate) { try { def.populate(this); } catch (e) { console.error('populate', e); } }
    const c = def.camera || { x: 0, y: -4, zoom: 1 };
    this.camera.jumpTo(c.x, c.y, c.zoom || 1);
    this.camera.bounds = def.bounds ? { minX: def.bounds.minX, maxX: def.bounds.maxX, minY: def.bounds.minY, maxY: def.bounds.maxY } : null;
    this.camera.view = GP.Maps.viewBox(this, def);
    this.camera.outer = GP.Maps.outerBox(this, this.camera.view);
    this.camera.clampToView();
    GP.FX.setWeather(def.weather || null);
    GP.Audio.ambience(def.ambience || 'none');
    this.spawnHistory = [];
    GP.Events.emit('map:loaded', { map: def });
  }
  clearScene(all) {
    this.releaseControl();
    if (this.tools) this.tools.reset();
    for (const e of this.entities.slice()) { try { e.destroy(); } catch (err) { /* ignore */ } }
    this.entities = []; this.entityMap.clear();
    GP.Projectiles.clear(); GP.FX.clear(); GP.Decals.clear(); GP.Force.clear(); GP.Sabers.clear();
    if (GP.Wires) GP.Wires.clear();
    if (GP.Fluid) GP.Fluid.clear();
    GP.Audio.stopAllLoops();
    this.debrisCount = 0;
    if (!all) {
      // remove any leftover dynamic bodies (keep terrain)
      for (const b of this.world.bodies.slice()) if (b.entity) this.world.removeBody(b);
    }
  }
  resetScene() { if (this.mapId) this.loadMap(this.mapId, { empty: !!this.mapEmpty }); }
  clearDebris() {
    for (const e of this.entities.slice()) if (e.kind === 'debris' || e.kind === 'fragment' || e.kind === 'rubble') this.removeEntity(e);
  }
  setGravity(scale, zeroG) {
    this.gravity.scale = scale; this.gravity.zeroG = zeroG;
    this.world.gravityY = zeroG ? 0 : this.gravity.base * scale;
    this.world.wakeAll();
  }

  /* ---------------------------------------------------------------- loop */
  timeScale() {
    if (this.paused) return 0;
    if (this.slowMo) return GP.Settings.p.slowMotionScale;
    if (this.fastFwd) return GP.Settings.p.fastForwardScale;
    return 1;
  }

  // keep exactly one animation-frame chain, however often frame() is called
  scheduleFrame() {
    if (this.rafPending) return;
    this.rafPending = true;
    requestAnimationFrame((t) => { this.rafPending = false; this.frame(t); });
  }
  frame(ts) {
    this.scheduleFrame();
    let real = (ts - this.last) / 1000;
    this.last = ts;
    if (!(real > 0)) real = 1 / 60;
    real = Math.min(real, 1 / 20);
    this.perf.fps = this.perf.fps * 0.93 + (1 / Math.max(real, 1e-3)) * 0.07;
    const t0 = performance.now();
    let simDt = 0;
    try {
      if (this.ui) this.ui.frame(real);
      if (this.tools && this.active) this.tools.frame(real);
      // Fixed time step: the simulation always advances in exact STEP-sized ticks (so physics, ragdoll
      // motors and liquids behave the same at any frame rate), and the picture is drawn between the
      // last two ticks so motion stays smooth on 60, 120 or 144 Hz screens.
      const STEP = Game.STEP;
      let alpha = 1;
      if (this.map) {
        const tp = performance.now();
        let n = 0;
        if (this.stepRequest > 0) { this.stepRequest--; this.snapshot(); this.tick(STEP); n = 1; this.acc = 0; }
        else if (this.timeScale() > 0) {
          this.acc += real * this.timeScale();
          while (this.acc >= STEP && n < 5) { this.snapshot(); this.tick(STEP); this.acc -= STEP; n++; }
          if (this.acc >= STEP) this.acc = 0; // too far behind: drop the backlog instead of spiralling
          alpha = this.acc / STEP;
        } else this.snapshot(); // paused: draw exactly the current state
        if (n) this.perf.phys = this.perf.phys * 0.9 + (performance.now() - tp) * 0.1;
        simDt = n * STEP;
      }
      this.interpolate(alpha);
      this.camera.update(real);
      GP.Sabers.updateAudio(this.camera);
      GP.Audio.setTime(this.map ? (this.paused && !this.stepRequest ? 0 : this.timeScale() || 1) : 1, !!(this.map && this.paused));
      GP.Audio.update(real);
      try { this.renderer.render(this, real, simDt, alpha); } finally { this.interpolate(null); }
    } catch (err) {
      this.errors++;
      console.error(err);
      if (this.errors < 5 && GP.UI) GP.UI.toast('Recovered from an error: ' + err.message, 'error');
    }
    GP.Input.endFrame();
    this.perf.frame = this.perf.frame * 0.9 + (performance.now() - t0) * 0.1;
    this.safeguard();
  }

  // Remember where every moving body is before a tick, for drawing between ticks.
  snapshot() {
    for (const b of this.world.bodies) if (b.type !== GP.Phys.STATIC || b.frozen) { b.px = b.x; b.py = b.y; b.pa = b.a; }
    if (GP.Fluid) GP.Fluid.snapshot();
  }
  // Move bodies to their in-between positions for drawing (alpha 0 = previous tick, 1 = latest),
  // or put them back afterwards (alpha null).
  interpolate(alpha) {
    const W = this.world;
    if (alpha == null) {
      for (const b of this.lerped) { b.x = b.cx; b.y = b.cy; b.setAngle(b.ca); b.updateShapes(); b.lerping = false; }
      this.lerped.length = 0;
      return;
    }
    this.renderAlpha = alpha;
    if (alpha >= 1) return;
    for (const b of W.bodies) {
      if (b.px == null || b.removed || (b.type === GP.Phys.STATIC && !b.frozen)) continue;
      if (b.px === b.x && b.py === b.y && b.pa === b.a) continue;
      // a body that jumped (teleported, spawned, reset) is drawn where it is now
      if (Math.abs(b.x - b.px) + Math.abs(b.y - b.py) > 3) continue;
      b.cx = b.x; b.cy = b.y; b.ca = b.a; b.lerping = true;
      b.x = b.px + (b.x - b.px) * alpha; b.y = b.py + (b.y - b.py) * alpha;
      b.setAngle(b.pa + GP.M.wrapAngle(b.a - b.pa) * alpha);
      b.updateShapes();
      this.lerped.push(b);
    }
  }

  tick(dt) {
    const ents = this.entities;
    for (let i = 0; i < ents.length; i++) {
      const e = ents[i];
      if (e.removed) continue;
      try { e.age += dt; e.update(dt); } catch (err) {
        e.errors++;
        console.error('update error', e.def && e.def.id, err);
        if (e.errors > 3) { GP.UI && GP.UI.toast(e.name + ' malfunctioned and was removed.', 'error'); this.removeEntity(e); i--; }
      }
    }
    GP.Force.update(this, dt);
    if (this.tools) this.tools.physicsTick(dt);
    if (this.map && this.map.update) { try { this.map.update(this, dt); } catch (err) { console.error(err); } }
    this.world.step(dt);
    GP.Sabers.process(this, dt);
    GP.Damage.processContacts(this);
    GP.Projectiles.update(this, dt);
    GP.FX.update(dt, this.camera, this.world);
    GP.Decals.update(dt);
    this.zones(dt);
    if (GP.Heat) GP.Heat.update(this, dt);
    if (GP.Fluid) GP.Fluid.update(this, dt);
    if (GP.Wires) GP.Wires.update(dt);
    this.time += dt;
  }

  // Map hazards: lava, kill planes, out-of-bounds cleanup
  zones(dt) {
    const map = this.map;
    if (!map) return;
    const killY = map.killY != null ? map.killY : 80;
    const bnd = map.bounds;
    for (const e of this.entities.slice()) {
      if (e.removed || !e.bodies.length || e.hidden) continue;
      const b = e.body;
      if (b.y > killY || (bnd && (b.x < bnd.minX - 40 || b.x > bnd.maxX + 40 || b.y < bnd.minY - 60))) {
        if (e === this.controlled) this.releaseControl();
        this.removeEntity(e);
      }
    }
    // lava sensors
    for (const c of this.world.active) {
      if (c.dead || !c.touching) continue;
      const lava = c.sA.tag === 'lava' ? c.sA : c.sB.tag === 'lava' ? c.sB : null;
      if (!lava) continue;
      const other = lava === c.sA ? c.bB : c.bA;
      const e = other.entity;
      if (!e) continue;
      other.applyForce(0, -other.m * 6);
      other.temp = Math.max(other.temp || 20, 900);
      other.vx *= 0.97; other.vy *= 0.9;
      GP.Damage.hit(other, { type: 'fire', amount: 60 * dt, x: other.x, y: other.y });
      if (Math.random() < dt * 8) { GP.FX.fire(other.x, other.y, 2, 0.3); GP.FX.embers(other.x, other.y, 2); }
      if (e.kind === 'prop' || e.kind === 'fragment' || e.kind === 'debris') {
        e.melt = (e.melt || 0) + dt;
        if (e.melt > 3) { GP.FX.smoke(other.x, other.y, 4, 0.4, '#333'); this.removeEntity(e); }
      }
    }
  }

  safeguard() {
    if (!GP.Settings.p.autoSafeguard || !this.active || this.paused) { this.slowFrames = 0; return; }
    if (this.perf.phys > 22) this.slowFrames++; else this.slowFrames = Math.max(0, this.slowFrames - 1);
    if (this.slowFrames > 90) {
      this.slowFrames = 0;
      const W = this.world;
      if (W.substeps > 2) {
        W.substeps--;
        this.perf.safeguard = 'Reduced physics sub-steps to ' + W.substeps + ' to keep the sandbox responsive.';
      } else if (GP.Settings.g.particleQuality !== 'low') {
        GP.Settings.g.particleQuality = GP.Settings.g.particleQuality === 'high' ? 'medium' : 'low';
        this.perf.safeguard = 'Lowered particle quality to ' + GP.Settings.g.particleQuality + '.';
      } else {
        this.clearDebris();
        this.perf.safeguard = 'Cleared debris to recover performance.';
      }
      if (GP.UI) GP.UI.toast('Performance safeguard: ' + this.perf.safeguard, 'warn');
    }
  }
};
GP.Game.STEP = 1 / 60;
