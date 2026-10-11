/* GALACTIC PLAYGROUND — contraptions: multi-part builds you can spawn in one click.
 * Built-in prefabs are assembled by small builder scripts (parts + welds + pins + cables).
 * User contraptions are snapshots of a selection (entities, held items and the welds/ropes
 * between them) stored in localStorage and shown in the spawn browser.
 */
'use strict';

GP.Contraptions = (() => {
  const KEY = 'galactic-playground.contraptions.v1';
  const Phys = GP.Phys;

  // Builder used by prefab scripts. Offsets are relative to the placement point (bottom center).
  function builder(game, ox, oy, facing) {
    const B = {
      list: [], f: facing || 1,
      add(id, x, y, opts = {}) {
        const e = game.spawn(id, ox + x * B.f, oy + y, Object.assign({ silent: true, noUndo: true, noUnstick: true, noLoadout: true, facing: B.f }, opts));
        if (e) B.list.push(e);
        return e;
      },
      joint(j) { j.graceUntil = game.world.time + 1.0; if (game.tools) game.tools.addConstraint(j); else game.world.addJoint(j); return j; },
      weld(a, b, x, y, force = 22000) { if (!a || !b) return null; return B.joint(new Phys.WeldJoint(a.body, b.body, ox + x * B.f, oy + y, { breakForce: force, tag: 'weld' })); },
      pin(a, b, x, y, force = 12000) { if (!a || !b) return null; return B.joint(new Phys.RevoluteJoint(a.body, b.body, ox + x * B.f, oy + y, { breakForce: force, tag: 'pin' })); },
      // cable from a point on entity `a` up to a fixed anchor in the air (or on entity `b`)
      cable(a, x, y, ax, ay, b = null, force = 30000) {
        if (!a) return null;
        const px = ox + x * B.f, py = oy + y, qx = ox + ax * B.f, qy = oy + ay;
        return B.joint(new Phys.DistanceJoint(b ? b.body : game.world.ground, a.body, qx, qy, px, py, { mode: 'rope', breakForce: force, tag: 'rope' }));
      },
      wire(a, b) { if (a && b && GP.Wires) GP.Wires.add(a, b); },
    };
    return B;
  }

  const prefabs = [
    {
      id: 'ctr_hanging_shack', name: 'Hanging Outpost Shack', sub: 'Prefabs',
      desc: 'A two-cable hut with bunk, shelf and lamp. Knock it around and watch it come apart.',
      build(B) {
        const floor = B.add('wood_floor', 0, -0.11);
        const pl = B.add('adobe_pillar', -1.75, -1.42), pr = B.add('adobe_pillar', 1.75, -1.42);
        const roof = B.add('wood_floor', 0, -2.73);
        const thatch = B.add('thatch_roof', 0, -3.04);
        B.weld(floor, pl, -1.75, -0.22); B.weld(floor, pr, 1.75, -0.22);
        B.weld(roof, pl, -1.75, -2.62); B.weld(roof, pr, 1.75, -2.62);
        B.weld(roof, thatch, 0, -2.84, 6000);
        const bunk = B.add('bunk', -0.5, -0.42);
        const shelf = B.add('shelf', 0.9, -1.02);
        B.weld(floor, bunk, -0.5, -0.24, 6000); B.weld(floor, shelf, 0.9, -0.24, 5000);
        B.add('glass_bottle', 0.35, -0.38); B.add('glass_bottle', 0.5, -0.38);
        const lamp = B.add('hanging_lamp', 0, -2.0);
        if (lamp) B.cable(lamp, 0, -2.08, 0, -2.62, roof, 3000);
        B.cable(roof, -1.9, -2.84, -2.6, -7.2); B.cable(roof, 1.9, -2.84, 2.6, -7.2);
      },
    },
    {
      id: 'ctr_rope_bridge', name: 'Rope Bridge', sub: 'Prefabs',
      desc: 'Ten pinned planks slung between two anchors. Sways, sags and snaps.',
      build(B) {
        const n = 10, w = 1.0;
        let prev = null;
        for (let i = 0; i < n; i++) {
          const x = -n * w / 2 + w / 2 + i * w;
          const p = B.add('bridge_plank', x, -0.07);
          if (prev) B.pin(prev, p, x - w / 2, -0.07, 9000);
          prev = p;
          if (i === 0) B.cable(p, x - w / 2, -0.07, x - w / 2 - 0.1, -0.6, null, 20000);
          if (i === n - 1) B.cable(p, x + w / 2, -0.07, x + w / 2 + 0.1, -0.6, null, 20000);
        }
      },
    },
    {
      id: 'ctr_watchtower', name: 'Watchtower', sub: 'Prefabs',
      desc: 'A welded durasteel lookout with a searchlight on top.',
      build(B) {
        const levels = 3, H = 2.4, T = 0.22;
        let below = null;
        for (let i = 0; i < levels; i++) {
          const y0 = -i * (H + T);
          const sl = B.add('durasteel_frame', -0.9, y0 - H / 2), sr = B.add('durasteel_frame', 0.9, y0 - H / 2);
          const fl = B.add('wood_floor_short', 0, y0 - H - T / 2);
          if (below) { B.weld(below, sl, -0.9, y0); B.weld(below, sr, 0.9, y0); }
          B.weld(fl, sl, -0.9, y0 - H); B.weld(fl, sr, 0.9, y0 - H);
          below = fl;
        }
        const top = -levels * (H + T);
        const light = B.add('spotlight', 0.4, top - 0.14, { angle: 0.35 });
        B.weld(below, light, 0.4, top, 5000);
        B.add('crate_small', -0.5, top - 0.38);
      },
    },
    {
      id: 'ctr_cantina_corner', name: 'Cantina Corner', sub: 'Prefabs',
      desc: 'Table, stools, a stocked shelf and a lamp overhead. Bar-fight ready.',
      build(B) {
        B.add('table', 0, 0);
        B.add('stool', -1.2, -0.34); B.add('stool', 1.2, -0.34);
        B.add('glass_bottle', -0.3, -1.12); B.add('glass_bottle', 0.2, -1.12);
        B.add('shelf', 2.5, -0.8);
        B.add('glass_bottle', 3.3, -0.15);
        const lamp = B.add('hanging_lamp', 0, -2.7);
        if (lamp) B.cable(lamp, 0, -2.78, 0, -4.2, null, 3000);
      },
    },
    {
      id: 'ctr_speeder_buggy', name: 'Scrap Buggy', sub: 'Vehicles',
      desc: 'A beam, two motor wheels, a pilot seat and a turret. Sit a character in the seat: A/D drive, mouse aims, click fires.',
      tags: ['car', 'vehicle', 'build', 'contraption', 'machine'],
      build(B) {
        const frame = B.add('roof_beam', 0, -0.45);
        const wl = B.add('motor_wheel', -1.2, -0.45), wr = B.add('motor_wheel', 1.2, -0.45);
        B.pin(frame, wl, -1.2, -0.45, 40000); B.pin(frame, wr, 1.2, -0.45, 40000);
        const seat = B.add('pilot_seat', -0.2, -0.62);
        B.weld(frame, seat, -0.2, -0.53, 30000);
        const gun = B.add('turret_mount', 0.45, -0.705);
        B.weld(frame, gun, 0.45, -0.53, 30000);
      },
    },
    {
      id: 'ctr_hover_skiff', name: 'Hover Skiff', sub: 'Vehicles',
      desc: 'Two repulsor pads under a deck with a thruster at each end. Sit a character in the seat: A/D thrust, W rises, S sinks.',
      tags: ['hover', 'speeder', 'vehicle', 'build', 'contraption', 'machine'],
      build(B) {
        const deck = B.add('wood_floor_short', 0, -0.31);
        // parts only overlap the deck they are welded to, never each other (overlaps fight and crush)
        const pl = B.add('repulsor_pad', -0.5, -0.1), pr = B.add('repulsor_pad', 0.5, -0.1);
        B.weld(deck, pl, -0.5, -0.2, 30000); B.weld(deck, pr, 0.5, -0.2, 30000);
        const back = B.add('thruster', -1.22, -0.31, { angle: Math.PI / 2 * B.f });
        const front = B.add('thruster', 1.22, -0.31, { angle: -Math.PI / 2 * B.f });
        B.weld(deck, back, -1.0, -0.31, 30000); B.weld(deck, front, 1.0, -0.31, 30000);
        const seat = B.add('pilot_seat', -0.1, -0.51);
        B.weld(deck, seat, -0.1, -0.42, 30000);
      },
    },
  ];

  const byId = new Map();
  function registerDef(d) { byId.set(d.id, d); GP.Registry.register(d); }
  for (const p of prefabs) registerDef(Object.assign({ kind: 'contraption', category: 'Contraptions', tags: ['prefab', 'building', 'contraption'] }, p));  // prefab `tags` override the defaults

  GP.Registry.register({ id: 'bridge_plank', name: 'Bridge Plank', kind: 'prop', category: 'Structures', sub: 'Building', layer: 0, material: 'wood', hp: 90, density: 70, shapes: [{ box: [1.0, 0.14] }], color: '#8a6440',
    art: [{ t: 'rect', x: 0, y: 0, w: 1.0, h: 0.14, f: '#8a6440', s: true, r: 0.02 }, { t: 'line', p: [-0.45, 0, 0.45, 0], s: 'rgba(0,0,0,0.2)', lw: 0.015 }, { t: 'circle', x: -0.44, y: 0, r: 0.025, f: '#3a2a1a' }, { t: 'circle', x: 0.44, y: 0, r: 0.025, f: '#3a2a1a' }], tags: ['plank', 'bridge', 'build'] });

  /* ---------------- user contraptions ---------------- */
  function readStore() { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (e) { return []; } }
  function writeStore(list) { localStorage.setItem(KEY, JSON.stringify(list)); }
  function userDef(rec) {
    return { id: 'uctr_' + rec.id, name: rec.name, kind: 'contraption', category: 'Contraptions', sub: 'My contraptions', user: true, storeId: rec.id, snap: rec.snap,
      desc: rec.snap.records.length + ' parts · saved ' + new Date(rec.date).toLocaleDateString(), tags: ['my', 'custom', 'contraption'] };
  }
  for (const rec of readStore()) { try { registerDef(userDef(rec)); } catch (e) { console.warn(e); } }

  return {
    // Spawn a contraption with its bottom center at (x, y). Returns the created entities.
    place(game, def, x, y, facing = 1) {
      if (def.build) {
        const B = builder(game, x, y, facing);
        def.build(B);
        return B.list;
      }
      if (def.snap) {
        const s = def.snap;
        return GP.SaveSystem.instantiate(game, s, x - s.cx, y - s.maxY, true);
      }
      return [];
    },
    saveUser(game, name, list) {
      list = list.filter((e) => e && !e.removed && !(e.isItem && e.holder));
      if (!list.length) throw new Error('Nothing selected.');
      return this.addUser(name, GP.SaveSystem.snapshot(game, list));
    },
    // store a snapshot (from this game or a share code) as a spawnable user contraption
    addUser(name, snap) {
      const rec = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5), name: name || 'Contraption', date: Date.now(), snap };
      const store = readStore();
      store.unshift(rec);
      try { writeStore(store); } catch (e) { throw new Error('Browser storage is full. Delete old saves or contraptions.'); }
      const def = userDef(rec);
      registerDef(def);
      GP.Events.emit('contraptions:changed', { def });
      return def;
    },
    removeUser(defId) {
      const d = byId.get(defId);
      if (!d || !d.user) return;
      writeStore(readStore().filter((r) => r.id !== d.storeId));
      byId.delete(defId);
      d.hidden = true; // registry keeps the id so existing references stay valid
      GP.Events.emit('contraptions:changed', {});
    },
  };
})();
