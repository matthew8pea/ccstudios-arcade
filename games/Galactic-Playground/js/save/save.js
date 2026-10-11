/* GALACTIC PLAYGROUND — scene saving and loading.
 * A scene stores the map, world/physics settings, camera, every entity (definition id, body
 * transforms and velocities, frozen flags, property overrides and kind-specific state such as
 * character health/severed limbs/equipment, saber colors, blaster stats, vehicle damage and
 * occupants) plus all user-made welds, ropes and pins.
 */
'use strict';

GP.SaveSystem = (() => {
  const INDEX = 'galactic-playground.saves.v1';
  const PREFIX = 'galactic-playground.save.';
  const VERSION = 1;

  function bodyRef(game, b) {
    if (b === game.world.ground || !b.entity) return { g: 1, x: b.x, y: b.y };
    return { e: b.entity.id, i: b.entity.bodies.indexOf(b) };
  }

  function constraintRecord(game, j) {
    const a = j.anchorA(), b = j.anchorB();
    return { kind: j.kind, mode: j.mode, tag: j.tag, a: bodyRef(game, j.a), b: bodyRef(game, j.b), ax: a.x, ay: a.y, bx: b.x, by: b.y, len: j.length, brk: j.breakForce === Infinity ? null : j.breakForce, motor: j.enableMotor ? [j.motorSpeed, j.maxMotorTorque] : null };
  }

  function serialize(game) {
    const entities = [];
    for (const e of game.entities) {
      if (e.removed) continue;
      try { const rec = e.serialize(); if (rec) entities.push(rec); } catch (err) { console.warn('skip entity', e.def.id, err); }
    }
    const constraints = [];
    if (game.tools) for (const j of game.tools.constraints) if (j.world) constraints.push(constraintRecord(game, j));
    const cam = game.camera;
    return {
      app: 'galactic-playground', version: VERSION, date: Date.now(), map: game.mapId,
      world: { gravityScale: game.gravity.scale, zeroG: game.gravity.zeroG, time: game.time, darkness: game.darkness },
      physics: { substeps: game.world.substeps, velocityIterations: game.world.velocityIterations, positionIterations: game.world.positionIterations },
      camera: { x: cam.x, y: cam.y, zoom: cam.zoom }, idCounter: GP.uid.peek(),
      entities, constraints,
      wires: GP.Wires ? GP.Wires.list.map((w) => [w.from.id, w.to.id]) : [],
      fluid: GP.Fluid ? GP.Fluid.serialize() : null,
      structures: GP.Destruction ? GP.Destruction.serialize(game) : null,   // map structures that were broken
    };
  }

  // Snapshot a set of entities (plus their held items and the user constraints among them)
  function snapshot(game, list) {
    const set = new Set();
    for (const e of list) {
      if (!e || e.removed || e.kind === 'debris') continue;
      set.add(e);
      if (e.items) for (const it of e.items()) set.add(it);
      if (e.occupants) for (const o of e.occupants) if (o) { set.add(o); for (const it of o.items()) set.add(it); }
    }
    const records = [];
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const e of set) {
      const rec = e.serialize();
      if (!rec) continue;
      records.push(rec);
      const bb = e.bounds();
      minX = Math.min(minX, bb.minX); maxX = Math.max(maxX, bb.maxX); minY = Math.min(minY, bb.minY); maxY = Math.max(maxY, bb.maxY);
    }
    const constraints = [];
    if (game.tools) for (const j of game.tools.constraints) {
      if (!j.world) continue;
      const inA = j.a === game.world.ground || set.has(j.a.entity), inB = j.b === game.world.ground || set.has(j.b.entity);
      if (inA && inB) constraints.push(constraintRecord(game, j));
    }
    const wires = GP.Wires ? GP.Wires.list.filter((w) => set.has(w.from) && set.has(w.to)).map((w) => [w.from.id, w.to.id]) : [];
    return { records, constraints, wires, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, minY, maxY };
  }

  function buildConstraint(game, c, map, dx = 0, dy = 0) {
    const ref = (r) => r.g ? game.world.ground : (map.get(r.e) && map.get(r.e).bodies[r.i]);
    const A = ref(c.a), B = ref(c.b);
    if (!A || !B) return null;
    const P = GP.Phys;
    let j = null;
    if (c.kind === 'weld') j = new P.WeldJoint(A, B, c.bx + dx, c.by + dy, { breakForce: c.brk || Infinity, tag: c.tag });
    else if (c.kind === 'revolute') j = new P.RevoluteJoint(A, B, c.bx + dx, c.by + dy, { tag: c.tag, enableMotor: !!c.motor, motorSpeed: c.motor ? c.motor[0] : 0, maxMotorTorque: c.motor ? c.motor[1] : 0 });
    else if (c.kind === 'distance') j = new P.DistanceJoint(A, B, c.ax + dx, c.ay + dy, c.bx + dx, c.by + dy, { mode: c.mode, length: c.len, breakForce: c.brk || Infinity, tag: c.tag });
    if (j) { if (game.tools) game.tools.addConstraint(j); else game.world.addJoint(j); }
    return j;
  }

  // Recreate entities from records. newIds: give copies fresh ids (paste); otherwise keep ids (undo / load).
  function instantiate(game, snap, dx = 0, dy = 0, newIds = true) {
    const map = new Map();
    const created = [];
    for (const rec of snap.records) {
      if (!newIds && game.entityMap.has(rec.id)) { map.set(rec.id, game.entityMap.get(rec.id)); continue; }
      try {
        const e = createFromRecord(game, rec, newIds ? GP.uid() : null, dx, dy);
        if (e) { map.set(rec.id, e); created.push(e); }
      } catch (err) { console.warn('instantiate failed', rec.def, err); }
    }
    // references can point to entities that still exist in the world (e.g. undoing a character delete)
    const lookup = { get: (id) => map.get(id) || (!newIds ? game.entityMap.get(id) : null) };
    for (const e of created) { try { e.resolve(lookup); } catch (err) { console.warn(err); } }
    for (const c of snap.constraints || []) { try { buildConstraint(game, c, map, dx, dy); } catch (err) { console.warn(err); } }
    if (GP.Wires) for (const [a, b] of snap.wires || []) { const A = lookup.get(a), B = lookup.get(b); if (A && B) GP.Wires.add(A, B); }
    return created;
  }

  function createFromRecord(game, rec, idOverride, dx = 0, dy = 0, keepLoadout = false) {
    const def = GP.Registry.get(rec.def);
    if (!def) return null;
    const opts = { id: idOverride || rec.id, team: rec.team, facing: rec.facing || 1, scale: rec.scale || 1, noLoadout: !keepLoadout, silent: true };
    if (def.kind === 'fragment' && rec.state) Object.assign(opts, rec.state);
    if (rec.state && rec.state.flipY) opts.flipY = rec.state.flipY;
    if (rec.state && rec.state.ai) opts.aiMode = rec.state.ai;
    const b0 = rec.bodies && rec.bodies[0];
    const e = GP.Registry.create(game, def, opts);
    let x = b0 ? b0.x : 0, y = b0 ? b0.y : 0;
    e.build(x + dx, y + dy, Object.assign({ angle: b0 ? b0.a : 0 }, opts));
    game.addEntity(e);
    if (rec.bodies) e.applyBodies(rec.bodies.map((s) => Object.assign({}, s, { x: s.x + dx, y: s.y + dy })));
    if (e.items) for (const it of e.items()) it.reattach();
    if (rec.hp != null && e.maxHp !== Infinity) e.hp = rec.hp;
    if (rec.props) e.restoreProps(rec.props);
    try { e.loadState(rec.state); } catch (err) { console.warn('state', rec.def, err); }
    return e;
  }

  function load(game, data) {
    if (!data || data.app !== 'galactic-playground') throw new Error('Not a Galactic Playground scene file.');
    if (!GP.Maps.get(data.map)) throw new Error('This scene uses an unknown map: ' + data.map);
    game.loadMap(data.map, { empty: true, keepEmptyChoice: true });
    if (GP.Destruction && data.structures) GP.Destruction.load(game, data.structures);
    if (data.world) { game.setGravity(data.world.gravityScale != null ? data.world.gravityScale : 1, !!data.world.zeroG); }
    if (data.idCounter) GP.uid.bump(data.idCounter);
    const map = new Map();
    let missing = 0;
    for (const rec of data.entities || []) {
      try {
        const e = createFromRecord(game, rec);
        if (e) map.set(rec.id, e); else missing++;
      } catch (err) { console.warn('load entity failed', rec.def, err); missing++; }
    }
    for (const e of map.values()) { try { e.resolve(map); } catch (err) { console.warn(err); } }
    for (const c of data.constraints || []) { try { buildConstraint(game, c, map); } catch (err) { console.warn('constraint', err); } }
    if (GP.Wires) for (const [a, b] of data.wires || []) { const A = map.get(a), B = map.get(b); if (A && B) GP.Wires.add(A, B); }
    if (GP.Fluid && data.fluid) GP.Fluid.load(data.fluid);
    if (data.camera) game.camera.jumpTo(data.camera.x, data.camera.y, data.camera.zoom);
    if (data.world && data.world.time) game.time = data.world.time;
    if (data.world && data.world.darkness != null) game.darkness = data.world.darkness;
    return { count: map.size, missing };
  }

  function thumbnail(game) {
    try {
      const src = game.canvas;
      const c = document.createElement('canvas'); c.width = 256; c.height = 144;
      const ctx = c.getContext('2d');
      const ar = src.width / src.height, tar = 256 / 144;
      let sw = src.width, sh = src.height, sx = 0, sy = 0;
      if (ar > tar) { sw = sh * tar; sx = (src.width - sw) / 2; } else { sh = sw / tar; sy = (src.height - sh) / 2; }
      ctx.drawImage(src, sx, sy, sw, sh, 0, 0, 256, 144);
      return c.toDataURL('image/jpeg', 0.62);
    } catch (e) { return null; }
  }

  function index() { try { return JSON.parse(localStorage.getItem(INDEX) || '[]'); } catch (e) { return []; } }
  function writeIndex(list) { localStorage.setItem(INDEX, JSON.stringify(list)); }

  /* Autosave: two slots kept apart from the player's own saves. 'latest' is written every minute and
     when the tab closes; 'before' is the scene as it was just before a reset, map change, load or
     return to the main menu threw it away. They give way whenever the player's saves need the room. */
  const AUTO = 'galactic-playground.autosave.';
  const AUTO_SLOTS = { latest: 'Autosave', before: 'Before reset or map change' };
  function autoMeta(slot) { try { return JSON.parse(localStorage.getItem(AUTO + slot + '.meta') || 'null'); } catch (e) { return null; } }
  function dropAutosave(slot) { localStorage.removeItem(AUTO + slot); localStorage.removeItem(AUTO + slot + '.meta'); }
  function autosave(game, slot = 'latest') {
    if (!game.mapId || !GP.Settings.play.autosave) return false;
    try {
      const data = serialize(game);
      const meta = { slot, name: AUTO_SLOTS[slot], date: data.date, map: game.mapId, count: data.entities.length, thumb: thumbnail(game) };
      dropAutosave(slot);   // free its old room first
      localStorage.setItem(AUTO + slot, JSON.stringify(data));
      localStorage.setItem(AUTO + slot + '.meta', JSON.stringify(meta));
      return true;
    } catch (e) {
      dropAutosave(slot);   // storage full: never leave half a slot behind
      return false;
    }
  }
  // write to storage; if it is full, give up the autosaves to make room and try once more
  function store(key, json) {
    try { localStorage.setItem(key, json); } catch (e) {
      for (const s of Object.keys(AUTO_SLOTS)) dropAutosave(s);
      localStorage.setItem(key, json);
    }
  }

  return {
    serialize, load, snapshot, instantiate, constraintRecord, buildConstraint,
    list: index,
    autosave,
    // autosaves that exist, newest first
    autosaves() { return Object.keys(AUTO_SLOTS).map(autoMeta).filter((m) => m && GP.Maps.get(m.map)).sort((a, b) => b.date - a.date); },
    loadAutosave(game, slot) {
      const raw = localStorage.getItem(AUTO + slot);
      if (!raw) throw new Error('That autosave is gone.');
      return load(game, JSON.parse(raw));
    },
    dropAutosave,
    save(game, name) {
      const data = serialize(game);
      const id = 's' + Date.now().toString(36);
      const json = JSON.stringify(data);
      const entry = { id, name: name || (GP.Maps.get(game.mapId).name + ' scene'), date: data.date, map: game.mapId, count: data.entities.length, size: json.length, thumb: thumbnail(game) };
      try {
        store(PREFIX + id, json);
        const list = index(); list.unshift(entry); writeIndex(list);
      } catch (e) {
        localStorage.removeItem(PREFIX + id);
        throw new Error('Browser storage is full. Delete old saves or use Export to file.');
      }
      return entry;
    },
    overwrite(game, id) {
      const list = index(); const entry = list.find((s) => s.id === id);
      if (!entry) return null;
      const data = serialize(game);
      store(PREFIX + id, JSON.stringify(data));
      Object.assign(entry, { date: data.date, map: game.mapId, count: data.entities.length, thumb: thumbnail(game) });
      writeIndex(list);
      return entry;
    },
    loadSlot(game, id) {
      const raw = localStorage.getItem(PREFIX + id);
      if (!raw) throw new Error('Save data missing.');
      return load(game, JSON.parse(raw));
    },
    remove(id) { localStorage.removeItem(PREFIX + id); writeIndex(index().filter((s) => s.id !== id)); },
    rename(id, name) { const list = index(); const s = list.find((x) => x.id === id); if (s) { s.name = name; writeIndex(list); } },
    exportFile(game) {
      const data = serialize(game);
      const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'galactic-playground-' + game.mapId + '-' + new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-') + '.json';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    },
    importFile(game, file) {
      return new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => { try { resolve(load(game, JSON.parse(r.result))); } catch (e) { reject(e); } };
        r.onerror = () => reject(new Error('Could not read the file.'));
        r.readAsText(file);
      });
    },
    // Duplicate one entity next to the original
    cloneEntity(game, e) {
      if (!e || e.removed || e.kind === 'debris') return null;
      const rec = e.serialize();
      if (!rec) return null;
      const bb = e.bounds();
      const dx = (bb.maxX - bb.minX) + 0.4;
      const est = e.bodies.length + (e.items ? e.items().length : 0);
      if (!game.canSpawnBodies(est)) { GP.UI.toast('Body limit reached.', 'warn'); return null; }
      const isChar = e.kind === 'character';
      if (rec.state && rec.state.equip) rec.state.equip = null;
      const copy = createFromRecord(game, rec, GP.uid(), dx, 0, isChar);
      if (copy && isChar) {
        // restore severed limbs / health but give a fresh loadout
        copy.pendingEquip = null;
      }
      if (copy) { GP.FX.ring(copy.position().x, copy.position().y, 1.2, '#5ee08a', 0.35, 0.05); game.spawnHistory.push(copy); }
      return copy;
    },
  };
})();
