/* GALACTIC PLAYGROUND — sandbox tools.
 * Each tool is a small object with optional handlers: down(btn), move(), up(btn), wheel(d),
 * tick(dt) (physics rate), frame(dt), overlay(ctx), hint(), options.
 * The manager owns pointer input on the canvas, hover detection, placement (spawning) mode,
 * user-made constraints (welds/ropes) and player control of characters and vehicles.
 */
'use strict';

GP.Tools = class Tools {
  constructor(game) {
    this.game = game;
    this.canvas = game.canvas;
    this.hover = null;
    this.mouse = GP.Input.mouse;
    this.current = 'grab';
    this.placing = null;       // {def, angle, facing, hold} — the item picked in the spawn browser; Q / E spawn it
    this.constraints = [];     // user-made joints
    this.panning = null;
    this.opts = { weldStrength: 'strong', ropeMode: 'rope', forceMode: 'repulse', boom: 'medium', boomKind: 'fire', deleteDrag: true, liquidType: 'water', liquidFlow: 'stream' };
    this.defs = this.makeTools();
    // bring back the options picked last time, as long as the tool still offers them
    const saved = GP.Settings.play.toolOpts || {};
    for (const T of Object.values(this.defs)) for (const o of T.options || []) {
      if (o.choices.some(([v]) => v === saved[o.key])) this.opts[o.key] = saved[o.key];
    }
    this.bindPointer();
    this.recent = [];
    this.selection = new Set();
    this.history = [];
    this.future = [];          // undone actions, for redo
    this.clipboard = null;
    this.box = null;
  }

  /* ---------------------------------------------------------------- history (undo / redo) */
  record(action) {
    this.history.push(action);
    if (this.history.length > 60) this.history.shift();
    this.future = [];   // a new action makes the undone ones unreachable
    this.game.touched = true;
  }
  captureTransforms(list) {
    const out = [];
    for (const e of list) {
      if (!e || e.removed) continue;
      out.push({ id: e.id, bodies: e.serializeBodies() });
      if (e.items) for (const it of e.items()) out.push({ id: it.id, bodies: it.serializeBodies() });
    }
    return out;
  }
  restoreTransforms(states) {
    const g = this.game;
    for (const st of states) {
      const e = g.getEntity(st.id);
      if (!e || e.removed) continue;
      e.setFrozen(false);
      e.applyBodies(st.bodies);
      for (const b of e.bodies) b.wake();
    }
    for (const st of states) { const e = g.getEntity(st.id); if (e && e.items) for (const it of e.items()) it.reattach(); }
  }
  // Carry out a history action and return the action that reverses it (null if it no longer applies).
  // Undo applies an entry from the history and files its reverse under redo, and redo does the opposite.
  applyHistory(a, verb) {
    const g = this.game;
    const say = (what) => GP.UI.toast(verb + ' ' + what + '.', 'ok');
    const names = (list) => list.length > 1 ? list.length + ' objects' : list[0] ? list[0].name : 'object';
    if (a.type === 'spawn') {
      // take things away again (they were spawned, or restored by an earlier undo)
      const list = a.ids.map((id) => g.getEntity(id)).filter((e) => e && !e.removed);
      if (!list.length) return null;
      const back = { type: 'delete', snap: GP.SaveSystem.snapshot(g, list) };
      if (a.fluid) { back.fluid = GP.Fluid.serialize(); GP.Fluid.clear(); }
      for (const e of list) { if (e.items) for (const it of e.items()) g.removeEntity(it); g.removeEntity(e); }
      GP.Audio.play('remove', {});
      say((verb === 'Undid' ? 'spawn of ' : 'delete of ') + names(list));
      return back;
    }
    if (a.type === 'delete') {
      // bring deleted things back with their original ids, so older history still finds them
      const created = GP.SaveSystem.instantiate(g, a.snap, 0, 0, false);
      if (a.fluid && GP.Fluid) GP.Fluid.load(a.fluid);
      if (!created.length) return null;
      GP.Audio.play('spawn', {});
      say((verb === 'Undid' ? 'delete of ' : 'spawn of ') + names(created));
      return { type: 'spawn', ids: created.map((e) => e.id), fluid: !!a.fluid };
    }
    if (a.type === 'transform') {
      const now = this.captureTransforms(a.states.map((st) => g.getEntity(st.id)));
      if (!now.length) return null;
      this.restoreTransforms(a.states);
      GP.Audio.play('click', {}); say('move');
      return { type: 'transform', states: now };
    }
    if (a.type === 'freeze') {
      const now = a.prev.map(([id]) => g.getEntity(id)).filter((e) => e && !e.removed).map((e) => [e.id, e.isFrozen()]);
      if (!now.length) return null;
      for (const [id, f] of a.prev) { const e = g.getEntity(id); if (e && !e.removed) e.setFrozen(f); }
      GP.Audio.play('click', {}); say('freeze');
      return { type: 'freeze', prev: now };
    }
    if (a.type === 'joint') {
      // a weld, rope or pin that was made: take it off
      const live = a.joints.filter((j) => j.world && this.constraints.includes(j));
      if (!live.length) return null;
      const recs = live.map((j) => GP.SaveSystem.constraintRecord(g, j));
      for (const j of live) this.removeConstraint(j);
      GP.Audio.play('click', { f: 700 }); say(live.length > 1 ? live.length + ' connections' : live[0].tag || 'connection');
      return { type: 'unjoint', recs };
    }
    if (a.type === 'unjoint') {
      // put back connections that were taken off
      const joints = a.recs.map((c) => GP.SaveSystem.buildConstraint(g, c, g.entityMap)).filter(Boolean);
      if (!joints.length) return null;
      GP.Audio.play('weld', {}); say(joints.length > 1 ? joints.length + ' connections' : joints[0].tag || 'connection');
      return { type: 'joint', joints };
    }
    return null;
  }
  undo() { return this.stepHistory(this.history, this.future, 'Undid'); }
  redo() { return this.stepHistory(this.future, this.history, 'Redid'); }
  stepHistory(from, to, verb) {
    while (from.length) {
      const back = this.applyHistory(from.pop(), verb);
      if (back) { to.push(back); return true; }
    }
    return false;
  }
  // take the connections off an object, remembering them so Ctrl+Z puts them back
  removeConstraintsOf(e) {
    const list = this.constraintsOf(e).filter((j) => j.world);
    if (list.length) this.record({ type: 'unjoint', recs: list.map((j) => GP.SaveSystem.constraintRecord(this.game, j)) });
    for (const j of list) this.removeConstraint(j);
    return list.length;
  }
  // Clear everything (World panel), keeping it all in the history so Ctrl+Z brings it back
  clearAll() {
    const g = this.game;
    const list = g.entities.filter((e) => !e.removed && e.kind !== 'debris' && !(e.isItem && e.holder));
    let back = null;
    try { back = { type: 'delete', snap: GP.SaveSystem.snapshot(g, list), fluid: GP.Fluid && GP.Fluid.count() ? GP.Fluid.serialize() : null }; } catch (err) { console.warn(err); }
    const history = this.history;
    g.clearScene(false);   // this resets the tools, history included
    this.history = history;
    if (back) this.record(back);
  }

  /* ---------------------------------------------------------------- selection */
  selectionList() {
    for (const e of Array.from(this.selection)) if (e.removed) this.selection.delete(e);
    return Array.from(this.selection);
  }
  setSelection(list) {
    this.selection = new Set(list.filter((e) => e && !e.removed && !e.hidden && e.kind !== 'debris'));
    GP.Events.emit('multiselect:changed', { n: this.selection.size });
  }
  toggleSelected(e) {
    if (this.selection.has(e)) this.selection.delete(e); else this.selection.add(e);
    GP.Events.emit('multiselect:changed', { n: this.selection.size });
  }
  // the entities an action applies to: the whole selection when the target is part of it
  targetsFor(e) {
    if (e && this.selection.has(e)) return this.selectionList();
    return e ? [e] : this.selectionList();
  }
  finishBox() {
    const b = this.box; this.box = null;
    const minX = Math.min(b.x0, b.x1), maxX = Math.max(b.x0, b.x1), minY = Math.min(b.y0, b.y1), maxY = Math.max(b.y0, b.y1);
    if (maxX - minX < 0.05 && maxY - minY < 0.05) {
      const h = this.hover && this.hover.e;
      if (h) this.toggleSelected(h.isItem && h.holder ? h.holder : h); else this.setSelection([]);
      return;
    }
    const list = [];
    for (const e of this.game.entities) {
      if (e.removed || e.hidden || e.kind === 'debris' || (e.isItem && e.holder)) continue;
      const bb = e.bounds();
      if (bb.maxX >= minX && bb.minX <= maxX && bb.maxY >= minY && bb.minY <= maxY) list.push(e);
    }
    this.setSelection(GP.Input.shift() ? this.selectionList().concat(list) : list);
    if (list.length) GP.UI.toast(this.selection.size + ' selected. Del delete, Z freeze, C duplicate, Ctrl+C copy, Esc clear.', 'ok', 4000);
  }
  copy(list) {
    if (!list.length) { GP.UI.toast('Nothing to copy. Hover an object or select some first.', 'warn'); return; }
    this.clipboard = GP.SaveSystem.snapshot(this.game, list);
    const n = this.clipboard.records.length;
    GP.UI.toast('Copied ' + n + ' object' + (n > 1 ? 's' : '') + '. Ctrl+V pastes at the cursor.', 'ok');
    GP.Audio.play('click', { f: 1600 });
  }
  paste(x, y) {
    const c = this.clipboard;
    if (!c) { GP.UI.toast('Clipboard is empty.', 'warn'); return []; }
    if (!this.game.canSpawnBodies(c.records.length * 4)) { GP.UI.toast('Body limit reached.', 'warn'); return []; }
    const created = GP.SaveSystem.instantiate(this.game, c, x - c.cx, y - c.maxY, true);
    for (const e of created) if (!(e.isItem && e.holder) && !e.hidden) this.game.unstick(e);
    this.record({ type: 'spawn', ids: created.map((e) => e.id) });
    this.setSelection(created.filter((e) => !(e.isItem && e.holder) && !e.hidden));
    GP.Audio.play('spawn', {});
    return created;
  }
  bringTo(e, front) {
    const list = this.game.entities;
    const i = list.indexOf(e);
    if (i < 0) return;
    list.splice(i, 1);
    if (front) { list.push(e); e.layer = Math.max(e.layer, 3); } else { list.unshift(e); e.layer = Math.min(e.layer, 0); }
    GP.Audio.play('click', {});
  }
  eyedrop(e) {
    if (!e || e.def.hidden) { GP.UI.toast('That object cannot be spawned from the browser.', 'warn'); return; }
    this.startPlacing(e.def.id);
    GP.UI.toast('Placing more ' + e.def.name + '. Hold Q / E and let go to spawn, Esc to stop.', 'ok');
  }

  /* ---------------------------------------------------------------- pointer */
  bindPointer() {
    const c = this.canvas, m = this.mouse;
    const pos = (e) => { const r = c.getBoundingClientRect(); m.sx = e.clientX - r.left; m.sy = e.clientY - r.top; const w = this.game.camera.toWorld(m.sx, m.sy); m.wx = w.x; m.wy = w.y; };
    // Touch: one finger acts like the left mouse button (or the right one in "2nd" mode), two fingers
    // pinch to zoom and drag to pan, and a long press on an object opens its menu.
    const touches = new Map();
    let gesture = null, gestureLock = false, longTimer = 0, longStart = null, longFired = false;
    const cancelLong = () => { if (longTimer) clearTimeout(longTimer); longTimer = 0; };
    const touchInfo = () => {
      const pts = Array.from(touches.values());
      const r = c.getBoundingClientRect();
      return { d: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y), mx: (pts[0].x + pts[1].x) / 2 - r.left, my: (pts[0].y + pts[1].y) / 2 - r.top };
    };
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    c.addEventListener('mousedown', (e) => { if (e.button === 1) e.preventDefault(); });   // no browser autoscroll on middle-drag
    c.addEventListener('pointerdown', (e) => {
      if (!this.game.active) return;
      this.game.touched = true;   // the player did something here, so the scene is worth autosaving
      try { c.setPointerCapture(e.pointerId); } catch (err) { /* synthetic or already-released pointer */ }
      const touch = e.pointerType === 'touch';
      if (touch) {
        if (GP.Touch) GP.Touch.noticeTouch();
        touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (touches.size >= 2) {
          // second finger: whatever the first one started ends, and a pinch/pan begins
          cancelLong();
          if (!gestureLock && (m.buttons & 5)) { const b = m.buttons & 4 ? 2 : 0; m.buttons = 0; this.onUp(b, e); }
          m.buttons = 0;
          gestureLock = true;
          const t = touchInfo();
          gesture = { d: t.d, mx: t.mx, my: t.my };
          return;
        }
        if (gestureLock) return;
      }
      pos(e);
      const btn = touch && this.touchSecondary ? 2 : e.button;
      m.buttons |= 1 << btn;
      GP.Audio.ensure();
      if (btn === 1 || (btn === 0 && e.altKey)) { this.panning = { sx: m.sx, sy: m.sy }; e.preventDefault(); return; }
      if (touch && btn === 0) {
        longFired = false; longStart = { x: e.clientX, y: e.clientY };
        cancelLong();
        longTimer = setTimeout(() => {
          longTimer = 0;
          if (!this.hover || touches.size !== 1) return;
          longFired = true;
          m.buttons = 0; this.onUp(0, e);
          if (navigator.vibrate) navigator.vibrate(15);
          GP.UI.contextMenu(this.hover.e, m.sx, m.sy);
        }, 550);
      }
      this.onDown(btn, e);
    });
    c.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'touch' && touches.has(e.pointerId)) {
        touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (longStart && Math.hypot(e.clientX - longStart.x, e.clientY - longStart.y) > 12) cancelLong();
        if (gesture && touches.size >= 2) {
          const cam = this.game.camera, t = touchInfo();
          if (gesture.d > 10 && t.d > 10) cam.zoomAt(t.d / gesture.d, t.mx, t.my);
          const sc = cam.base * cam.zoom;
          cam.tx -= (t.mx - gesture.mx) / sc; cam.ty -= (t.my - gesture.my) / sc;
          cam.x = cam.tx; cam.y = cam.ty; cam.follow = this.game.controlled ? cam.follow : null;
          cam.clampToView();
          gesture.d = t.d; gesture.mx = t.mx; gesture.my = t.my;
          return;
        }
        if (gestureLock) return;
      }
      pos(e);
      m.inside = true;
      if (this.panning) {
        // move by how far the mouse moved since last time, so after hitting a border the camera
        // follows straight back (and a zoom mid-drag doesn't throw it off)
        const cam = this.game.camera, sc = cam.base * cam.zoom;
        cam.tx = cam.x - (m.sx - this.panning.sx) / sc; cam.ty = cam.y - (m.sy - this.panning.sy) / sc;
        cam.x = cam.tx; cam.y = cam.ty; cam.follow = this.game.controlled ? cam.follow : null;
        cam.clampToView();
        this.panning.sx = m.sx; this.panning.sy = m.sy;
      }
    });
    const up = (e) => {
      if (e.pointerType === 'touch') {
        touches.delete(e.pointerId);
        cancelLong();
        if (gestureLock) { if (!touches.size) { gestureLock = false; gesture = null; } return; }
        if (longFired) { longFired = false; m.buttons = 0; return; }
      }
      pos(e);
      const btn = e.pointerType === 'touch' && this.touchSecondary ? 2 : e.button;
      if (!(m.buttons & (1 << btn)) && e.type === 'pointercancel') return;
      m.buttons &= ~(1 << btn);
      if (this.panning && (btn === 1 || btn === 0)) { this.panning = null; return; }
      if (this.game.active) this.onUp(btn, e);
    };
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);
    // a lifted finger 'leaves' the canvas, but the spot it touched should stay the hover target
    c.addEventListener('pointerleave', (e) => { if (e.pointerType !== 'touch') m.inside = false; });
    c.addEventListener('pointerenter', () => { m.inside = true; });
    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      if (!this.game.active) return;
      pos(e);
      const d = Math.sign(e.deltaY);
      if (!d) return;
      const t = this.tool();
      // rotating (placing hologram, held objects) goes one step per notch; trackpads send many small
      // events, so those only step once enough scrolling has built up
      const notch = this.wheelNotch(e);
      if (this.placing && this.placing.hold) { if (notch) this.placing.angle += notch * GP.Settings.play.angleSnap * Math.PI / 180; return; }
      if (t.wheel && t.wheel(notch)) return;   // a tool using the wheel (0 = scrolled, but not a whole notch yet)
      // zoom by how far the wheel / trackpad actually scrolled (a mouse notch is about 12%)
      let px = e.deltaY * (e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? 400 : 1);
      if (e.ctrlKey) px *= 4;   // trackpad pinch arrives as small ctrl+wheel steps
      px = GP.M.clamp(px, -150, 150);
      this.game.camera.zoomAt(Math.exp(-px * 0.00115), m.sx, m.sy);
    }, { passive: false });
  }

  // whole wheel notches from a wheel event (mouse wheels give one per event; trackpads build up)
  wheelNotch(e) {
    const px = e.deltaY * (e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? 400 : 1);
    if (Math.abs(px) >= 50) { this.wheelAcc = 0; return Math.sign(px); }
    this.wheelAcc = (this.wheelAcc || 0) + px;
    if (Math.abs(this.wheelAcc) < 60) return 0;
    const n = Math.sign(this.wheelAcc); this.wheelAcc = 0; return n;
  }
  tool() { return this.defs[this.current]; }
  setTool(id) {
    if (!this.defs[id]) return;
    const prev = this.tool();
    if (prev && prev.cancel) prev.cancel();
    if (id !== 'control' && this.game.controlled) this.game.releaseControl();
    this.current = id;
    GP.Events.emit('tool:changed', { id });
    GP.Audio.play('click', { f: 1200 });
  }
  // armed: a person picked this way spawns holding their usual weapons (right-click in the spawn menu)
  startPlacing(defId, armed) {
    const def = GP.Registry.get(defId);
    if (!def) return;
    this.placing = { def, angle: 0, facing: 1, armed: !!armed && def.kind === 'character' };
    GP.Events.emit('placing:changed', { def });
  }
  cancelPlacing() { if (this.placing) { this.placing = null; GP.Events.emit('placing:changed', { def: null }); } }
  spawnAt(id, x, y, angle, facing, armed) {
    const def = GP.Registry.get(id);
    if (!def) return null;
    if (def.kind === 'contraption') {
      const est = def.snap ? def.snap.records.length * 4 : 60;
      if (!this.game.canSpawnBodies(est)) { GP.UI.toast('Body limit reached.', 'warn'); return null; }
      let list = [];
      try { list = GP.Contraptions.place(this.game, def, x, y, facing || 1); } catch (err) { console.error(err); GP.UI.toast('Could not build ' + def.name + ': ' + err.message, 'error'); }
      if (!list.length) return null;
      this.record({ type: 'spawn', ids: list.map((e) => e.id) });
      this.recent = [id].concat(this.recent.filter((r) => r !== id)).slice(0, 8);
      GP.Events.emit('recent:changed', this.recent);
      GP.Audio.play('spawn', { x, y });
      GP.FX.ring(x, y - 1.5, 3, '#6ec8ff', 0.4, 0.06);
      return list[0];
    }
    const e = this.game.spawn(id, x, y, { angle: def.kind === 'character' ? 0 : angle, facing, armed: !!armed });
    if (e) {
      this.record({ type: 'spawn', ids: [e.id].concat(e.items ? e.items().map((i) => i.id) : []) });
      this.recent = [id].concat(this.recent.filter((r) => r !== id)).slice(0, 8);
      GP.Events.emit('recent:changed', this.recent);
      GP.Events.emit('tutorial', { step: 'spawn', e });
    }
    return e;
  }

  onDown(btn, ev) {
    const m = this.mouse;
    GP.UI.closeContextMenu();
    if (this.game.controlled && this.current === 'control') { this.controlDown(btn); return; }
    const t = this.tool();
    // Ctrl+drag: box selection (Ctrl+click toggles one object)
    if (btn === 0 && (ev.ctrlKey || ev.metaKey)) { this.box = { x0: m.wx, y0: m.wy, x1: m.wx, y1: m.wy }; return; }
    // right-click context menu for tools that do not use the right button themselves
    if (btn === 2 && !(t.rightClick && t.rightClick()) && this.hover) {
      GP.UI.contextMenu(this.hover.e, m.sx, m.sy);
      return;
    }
    if (t.down) t.down(btn, ev);
  }
  onUp(btn, ev) {
    if (this.game.controlled && this.current === 'control') { this.controlUp(btn); return; }
    if (this.box && btn === 0) { this.finishBox(); return; }
    const t = this.tool();
    if (t.up) t.up(btn, ev);
  }

  /* ---------------------------------------------------------------- per frame */
  frame(dt) {
    const I = GP.Input, g = this.game, m = this.mouse;
    const w = g.camera.toWorld(m.sx, m.sy); m.wx = w.x; m.wy = w.y;
    if (!I.isTyping()) this.keys(dt);
    // hover
    this.hover = null;
    if (m.inside !== false) {
      const t = this.tool();
      if (!t.noHover) { const h = g.entityAt(m.wx, m.wy); if (h) this.hover = h; }
    }
    const t = this.tool();
    if (this.box) { this.box.x1 = m.wx; this.box.y1 = m.wy; }
    if (t.frame) t.frame(dt);
    if (g.controlled) this.controlFrame(dt);
  }
  physicsTick(dt) {
    const t = this.tool();
    if (t.tick) t.tick(dt);
    if (this.game.controlled && this.forceHold) GP.Force.liftUpdate(this.game.controlled, this.mouse.wx, this.mouse.wy, dt);
  }

  keys(dt) {
    const I = GP.Input, g = this.game;
    const ctl = g.controlled && this.current === 'control';
    // tool hotkeys (disabled while controlling so digit keys can't conflict)
    for (const id of Object.keys(this.defs)) if (I.pressed('tool.' + id)) { this.setTool(id); return; }
    if (I.pressed('edit.detonate')) { const n = GP.Remote.detonateAll(g); GP.UI.toast(n ? `Detonated ${n} remote charge${n > 1 ? 's' : ''}.` : 'No armed remote charges.', n ? 'ok' : 'warn'); }
    if (I.pressed('edit.undoSpawn')) { if (!this.undo()) GP.UI.toast('Nothing to undo.', 'warn'); }
    else if (I.pressed('edit.redo') || I.comboPressed('Ctrl+Shift+KeyZ')) { if (!this.redo()) GP.UI.toast('Nothing to redo.', 'warn'); }
    if (ctl) return;
    const hov = this.hover && this.hover.e;
    if (I.pressed('edit.copy')) this.copy(this.selection.size ? this.selectionList() : hov ? [hov] : []);
    if (I.pressed('edit.paste')) this.paste(this.mouse.wx, this.mouse.wy);
    if (I.pressed('edit.selectAll')) { this.setSelection(g.entities.filter((e) => !(e.isItem && e.holder))); GP.UI.toast(this.selection.size + ' objects selected.', 'ok'); }
    if (I.pressed('ui.menu') && this.selection.size) { this.setSelection([]); GP.Input.consume('ui.menu'); }
    // camera pan
    const cam = g.camera, sp = 16 / cam.zoom * dt;
    let px = 0, py = 0;
    if (I.isDown('camera.left') || I.codeDown('ArrowLeft')) px -= sp;
    if (I.isDown('camera.right') || I.codeDown('ArrowRight')) px += sp;
    if (I.isDown('camera.up') || I.codeDown('ArrowUp')) py -= sp;
    if (I.isDown('camera.down') || I.codeDown('ArrowDown')) py += sp;
    if (I.ctrl()) { px = 0; py = 0; }
    if (px || py) { cam.tx += px; cam.ty += py; cam.follow = null; }
    if (I.isDown('camera.zoomIn')) cam.zoomAt(1 + dt * 1.5, cam.w / 2, cam.h / 2);
    if (I.isDown('camera.zoomOut')) cam.zoomAt(1 / (1 + dt * 1.5), cam.w / 2, cam.h / 2);
    const GRIDS = [0.05, 0.1, 0.25, 0.5, 1], ANGS = [5, 10, 15, 30, 45, 90];
    const step = (arr, v, d) => arr[Math.max(0, Math.min(arr.length - 1, arr.indexOf(v) < 0 ? 2 : arr.indexOf(v) + d))];
    const P = GP.Settings.play;
    if (I.pressed('edit.gridDown') || I.pressed('edit.gridUp')) { P.gridSnap = step(GRIDS, P.gridSnap, I.pressed('edit.gridUp') ? 1 : -1); GP.Settings.save(); GP.UI.toast('Grid snap: ' + Math.round(P.gridSnap * 100) + ' cm (hold Shift while moving)', 'ok'); }
    if (I.pressed('edit.angleDown') || I.pressed('edit.angleUp')) { P.angleSnap = step(ANGS, P.angleSnap, I.pressed('edit.angleUp') ? 1 : -1); GP.Settings.save(); GP.UI.toast('Angle snap: ' + P.angleSnap + '°', 'ok'); }
    if (I.pressed('camera.reset')) { const c = g.map && g.map.camera || { x: 0, y: -4 }; cam.tx = c.x; cam.ty = c.y; cam.tzoom = cam.zoom = c.zoom || 1; }
    if (this.placing && !(this.mouse.buttons & 1)) {
      // Something is picked in the spawn browser. Nothing else changes: the current tool works as
      // usual. Hold Q or E and a hologram shows where it will appear, facing left or right; let go
      // to spawn it. It stays picked, so you can keep spawning more (Esc forgets it).
      const p = this.placing;
      const hold = I.isDown('edit.placeLeft') ? -1 : I.isDown('edit.placeRight') ? 1 : 0;
      if (hold) {
        if (!p.hold) p.angle = 0;
        p.hold = hold;
        GP.Input.consume('edit.placeLeft'); GP.Input.consume('edit.placeRight');   // Q / E are ours now
      } else if (p.hold) {
        const f = p.hold; p.hold = 0;
        const e = this.spawnAt(p.def.id, this.mouse.wx, this.mouse.wy, p.angle, f, p.armed);
        if (e) { p.facing = f; GP.Audio.play('spawn', { x: this.mouse.wx, y: this.mouse.wy }); }
      }
      if (p.hold && I.pressed('edit.rotateRight')) p.angle += GP.Settings.play.angleSnap * Math.PI / 180;
    }
    const t = this.tool();
    if (t.keys && t.keys(dt)) return;
    // quick actions on the hovered entity
    const h = this.hover && this.hover.e;
    const multi = this.selection.size > 0 && (!h || this.selection.has(h));
    if (h || multi) {
      if (I.pressed('edit.delete')) { this.deleteEntities(multi ? this.selectionList() : [h]); }
      else if (I.pressed('edit.freeze')) { this.toggleFreezeMany(multi ? this.selectionList() : [h]); }
      else if (I.pressed('edit.duplicate')) { if (multi) { this.copy(this.selectionList()); const c = this.clipboard; if (c) this.paste(c.cx + 1.5, c.maxY); } else this.duplicate(h); }
      else if (h && I.pressed('edit.activate')) {
        // a loose weapon next to a person (or a person next to one): they take it up
        if (this.armNearby(h)) { /* armed */ }
        else if (GP.Wires ? GP.Wires.activate(h, g) : (h.use && h.use(null))) { GP.Audio.play('click', { f: 900 }); GP.Events.emit('tutorial', { step: 'activate' }); }
      }
      else if (h && I.pressed('edit.front')) this.bringTo(h, true);
      else if (h && I.pressed('edit.back')) this.bringTo(h, false);
      else if (h && I.pressed('edit.eyedrop')) this.eyedrop(h);
    }
  }

  /* ---------------------------------------------------------------- actions */
  deleteEntity(e, noRecord) {
    if (!e || e.removed) return;
    if (!noRecord) { try { this.record({ type: 'delete', snap: GP.SaveSystem.snapshot(this.game, [e]) }); } catch (err) { console.warn(err); } }
    const b = e.bounds();
    GP.FX.ring((b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2, Math.max(b.maxX - b.minX, b.maxY - b.minY) * 0.6 + 0.2, '#ff5a5a', 0.3, 0.05);
    GP.Audio.play('remove', { x: (b.minX + b.maxX) / 2, y: b.minY });
    // held items and seated occupants go with the object that is deleted
    const extra = [];
    if (e.items) extra.push(...e.items());
    if (e.occupants) for (const o of e.occupants) if (o) { extra.push(o); extra.push(...o.items()); }
    this.game.removeEntity(e);
    for (const x of extra) if (!x.removed) this.game.removeEntity(x);
    this.selection.delete(e);
  }
  deleteEntities(list) {
    list = list.filter((e) => e && !e.removed);
    if (!list.length) return;
    try { this.record({ type: 'delete', snap: GP.SaveSystem.snapshot(this.game, list) }); } catch (err) { console.warn(err); }
    for (const e of list) this.deleteEntity(e, true);
    if (list.length > 1) GP.UI.toast('Deleted ' + list.length + ' objects. Ctrl+Z to undo.', 'ok');
  }
  toggleFreeze(e) { this.toggleFreezeMany([e]); }
  toggleFreezeMany(list) {
    list = list.filter((e) => e && !e.removed);
    if (!list.length) return;
    const f = list.some((e) => !e.isFrozen());
    this.record({ type: 'freeze', prev: list.map((e) => [e.id, e.isFrozen()]) });
    for (const e of list) {
      e.setFrozen(f);
      const p = e.position();
      GP.FX.ring(p.x, p.y, 1, f ? '#8ad8ff' : '#ffd080', 0.3, 0.05);
    }
    const p = list[0].position();
    GP.Audio.play(f ? 'freeze' : 'click', { x: p.x, y: p.y });
  }
  duplicate(e) {
    const copy = GP.SaveSystem.cloneEntity(this.game, e);
    if (copy) { GP.Audio.play('spawn', {}); GP.Events.emit('tutorial', { step: 'clone' }); this.record({ type: 'spawn', ids: [copy.id].concat(copy.items ? copy.items().map((i) => i.id) : []) }); }
    return copy;
  }
  addConstraint(j) {
    j.userMade = true;
    this.game.world.addJoint(j);
    this.constraints.push(j);
    j.onBreak = () => this.removeConstraint(j, true);
    return j;
  }
  removeConstraint(j, broken) {
    const i = this.constraints.indexOf(j);
    if (i >= 0) this.constraints.splice(i, 1);
    if (!broken && j.world) this.game.world.removeJoint(j);
  }
  constraintsOf(e) { return this.constraints.filter((j) => (j.a.entity === e || j.b.entity === e)); }
  onEntityRemoved(e) {
    if (GP.Wires) GP.Wires.removeFor(e);
    if (this.wireFrom === e) this.wireFrom = null;
    for (const j of this.constraints.slice()) if (j.a.entity === e || j.b.entity === e || j.a.removed || j.b.removed) this.removeConstraint(j);
    const t = this.tool();
    if (t.onRemoved) t.onRemoved(e);
    if (this.hover && this.hover.e === e) this.hover = null;
    if (this.selected === e) { this.selected = null; GP.Events.emit('selection:changed', { e: null }); }
    this.selection.delete(e);
  }
  reset() {
    this.constraints = [];
    this.selection.clear(); this.history = []; this.future = []; this.box = null;
    for (const k of Object.keys(this.defs)) if (this.defs[k].cancel) this.defs[k].cancel();
    this.selected = null; this.placing = null; this.hover = null;
  }
  select(e) { this.selected = e; GP.Events.emit('selection:changed', { e }); }

  /* ---------------------------------------------------------------- control */
  controlDown(btn) {
    const c = this.game.controlled, I = c.intent;
    if (!I) return;
    if (btn === 0) I.attack = true;
    if (btn === 2) {
      if (c.isForceUser && c.isForceUser() && !c.vehicle && c.mainItem && !(c.mainItem() && c.mainItem().isSaber && GP.Input.shift())) {
        const powers = c.stats.force.powers;
        const p = powers[this.game.powerIndex % powers.length || 0] || powers[0];
        this.activePower = p;
        I.power = p; I.powerHeld = true;
      } else I.block = true;
    }
  }
  controlUp(btn) {
    const c = this.game.controlled, I = c.intent;
    if (!I) return;
    if (btn === 0) I.attack = false;
    if (btn === 2) {
      I.block = false;
      if (this.activePower) { I.powerHeld = false; I.power = null; GP.Force.release(c, true); this.activePower = null; }
    }
  }
  controlFrame() {
    const g = this.game, c = g.controlled, In = GP.Input, m = this.mouse;
    if (!c || c.removed) { g.releaseControl(); return; }
    if (this.current !== 'control') return;
    const I = c.intent;
    if (!I) return;
    I.hasAim = true; I.aimX = m.wx; I.aimY = m.wy;
    let mx = 0;
    if (In.isDown('ctl.left')) mx -= 1;
    if (In.isDown('ctl.right')) mx += 1;
    I.moveX = mx;
    I.run = In.isDown('ctl.run');
    I.jump = In.isDown('ctl.jump');
    I.crouch = In.isDown('ctl.crouch');
    if (In.pressed('ctl.interact')) I.interact = true;
    if (In.pressed('ctl.drop')) I.drop = true;
    if (In.pressed('ctl.reload')) I.reload = true;
    if (In.pressed('ctl.saber')) I.toggleSaber = true;
    if (In.pressed('ctl.nextPower') && c.stats && c.stats.force) { g.powerIndex = (g.powerIndex || 0) + 1; const P = c.stats.force.powers; GP.UI.toast('Force power: ' + P[g.powerIndex % P.length].toUpperCase(), 'ok'); }
    if (In.pressed('ctl.force') && c.stats && c.stats.force) {
      const P = c.stats.force.powers; const p = P[(g.powerIndex || 0) % P.length];
      I.power = p; I.powerHeld = p === 'lift' || p === 'lightning';
      this.activePower = I.powerHeld ? p : null;
    }
    if (this.activePower && !In.isDown('ctl.force') && !(m.buttons & 4)) { I.powerHeld = false; I.power = null; GP.Force.release(c, true); this.activePower = null; }
    if (this.activePower && I.powerHeld) I.power = this.activePower;
    if (In.pressed('ctl.release') || In.pressed('ui.menu')) { GP.Input.consume('ui.menu'); g.releaseControl(); this.setTool('grab'); }
    if (c.state === 'dead' && !c.vehicle) { GP.UI.toast(c.name + ' is down. Control released.', 'warn'); g.releaseControl(); }
  }

  /* ---------------------------------------------------------------- drawing */
  drawConstraints(ctx) {
    for (const j of this.constraints) {
      if (!j.world) continue;
      const a = j.anchorA(), b = j.anchorB();
      if (j.kind === 'distance') {
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        const sag = j.mode === 'rope' ? Math.max(0, j.length - len) * 0.5 : 0;
        ctx.strokeStyle = '#1a1612'; ctx.lineWidth = 0.07; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.quadraticCurveTo((a.x + b.x) / 2, (a.y + b.y) / 2 + sag, b.x, b.y); ctx.stroke();
        ctx.strokeStyle = j.mode === 'spring' ? '#6ec8ff' : j.mode === 'rod' ? '#9aa0aa' : '#8a6a44'; ctx.lineWidth = 0.035;
        if (j.mode === 'spring') {
          ctx.beginPath(); const n = 14, dx = (b.x - a.x) / n, dy = (b.y - a.y) / n, l = Math.hypot(dx, dy) || 1;
          ctx.moveTo(a.x, a.y);
          for (let i = 1; i < n; i++) { const s = (i % 2 ? 1 : -1) * 0.12; ctx.lineTo(a.x + dx * i - dy / l * s, a.y + dy * i + dx / l * s); }
          ctx.lineTo(b.x, b.y); ctx.stroke();
        } else { ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.quadraticCurveTo((a.x + b.x) / 2, (a.y + b.y) / 2 + sag, b.x, b.y); ctx.stroke(); }
        for (const p of [a, b]) { ctx.fillStyle = '#c8a040'; ctx.beginPath(); ctx.arc(p.x, p.y, 0.06, 0, 7); ctx.fill(); }
      } else if (j.kind === 'weld') {
        ctx.fillStyle = '#ffb547'; ctx.strokeStyle = '#1a1612'; ctx.lineWidth = 0.02;
        ctx.beginPath(); ctx.arc(b.x, b.y, 0.07, 0, 7); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = 'rgba(255,181,71,0.6)'; ctx.beginPath(); ctx.moveTo(b.x - 0.1, b.y - 0.1); ctx.lineTo(b.x + 0.1, b.y + 0.1); ctx.moveTo(b.x + 0.1, b.y - 0.1); ctx.lineTo(b.x - 0.1, b.y + 0.1); ctx.stroke();
      } else if (j.kind === 'revolute') {
        ctx.fillStyle = '#6ec8ff'; ctx.beginPath(); ctx.arc(b.x, b.y, 0.07, 0, 7); ctx.fill();
      }
    }
  }
  drawOverlay(ctx, cam) {
    const m = this.mouse, g = this.game;
    const t = this.tool();
    const pulse = (Math.sin(performance.now() / 180) + 1) / 2;
    if (g.controlled && this.current === 'control') {
      const c = g.controlled;
      if (!c.removed && !c.hidden) {
        const p = c.vehicle ? c.vehicle.position() : c.position();
        ctx.strokeStyle = GP.M.rgba('#ffb547', 0.6); ctx.lineWidth = 0.03;
        ctx.beginPath(); ctx.moveTo(p.x - 0.35, p.y - 1.4); ctx.lineTo(p.x, p.y - 1.15); ctx.lineTo(p.x + 0.35, p.y - 1.4); ctx.stroke();
      }
      this.crosshair(ctx, m.wx, m.wy, '#ffb547', 0.25);
      return;
    }
    for (const e of this.selection) if (!e.removed && !e.hidden) for (const b of e.bodies) GP.Draw.highlight(ctx, b, '#ffb547', 0.4);
    if (this.hover && !t.noHover && GP.Settings.g.hoverHighlights !== false) {
      const col = t.color || '#5fd4ff';
      for (const b of this.hover.e.bodies) GP.Draw.highlight(ctx, b, col, pulse);
    }
    if (this.box) {
      const b = this.box;
      const x = Math.min(b.x0, b.x1), y = Math.min(b.y0, b.y1), w = Math.abs(b.x1 - b.x0), hh = Math.abs(b.y1 - b.y0);
      ctx.fillStyle = 'rgba(255,181,71,0.08)'; ctx.strokeStyle = '#ffb547'; ctx.lineWidth = 0.03; ctx.setLineDash([0.15, 0.1]);
      ctx.fillRect(x, y, w, hh); ctx.strokeRect(x, y, w, hh);
      ctx.setLineDash([]);
    }
    if (t.overlay) t.overlay(ctx, pulse);
    if (this.placing && this.placing.hold) this.drawGhost(ctx);
    void cam;
  }
  crosshair(ctx, x, y, color, r) {
    ctx.strokeStyle = color; ctx.lineWidth = 0.025;
    ctx.beginPath(); ctx.arc(x, y, r, 0, 7);
    ctx.moveTo(x - r * 1.6, y); ctx.lineTo(x - r * 0.5, y); ctx.moveTo(x + r * 0.5, y); ctx.lineTo(x + r * 1.6, y);
    ctx.moveTo(x, y - r * 1.6); ctx.lineTo(x, y - r * 0.5); ctx.moveTo(x, y + r * 0.5); ctx.lineTo(x, y + r * 1.6);
    ctx.stroke();
  }
  drawGhost(ctx) {
    const p = this.placing, m = this.mouse;
    // only drawn while Q or E is held: a hologram of what will spawn
    const icon = GP.Icons.get(p.def.id, p.armed);
    const facing = p.hold;
    ctx.save();
    ctx.translate(m.wx, m.wy);
    if (p.def.kind !== 'character') ctx.rotate(p.angle);
    ctx.scale(facing, 1);
    if (icon && icon.bw) {
      // hologram: a tinted, flickering copy with scan lines, exactly where it will spawn
      const holo = this.hologram(icon), pad = holo.pad / icon.ppm;
      const t = performance.now() / 1000;
      ctx.globalAlpha = 0.8 + Math.sin(t * 22) * 0.05 + (Math.random() < 0.03 ? -0.25 : 0);
      ctx.globalCompositeOperation = 'lighter';
      ctx.drawImage(holo, -icon.ax - pad, -icon.ay - pad, icon.canvas.width / icon.ppm + pad * 2, icon.canvas.height / icon.ppm + pad * 2);
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.restore();
    ctx.globalAlpha = 1;
    {
      // which way it will face
      const y = m.wy - 0.2;
      ctx.strokeStyle = 'rgba(110,210,255,0.9)'; ctx.fillStyle = 'rgba(110,210,255,0.9)'; ctx.lineWidth = 0.05;
      ctx.beginPath(); ctx.moveTo(m.wx, y); ctx.lineTo(m.wx + facing * 0.55, y); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(m.wx + facing * 0.7, y); ctx.lineTo(m.wx + facing * 0.5, y - 0.12); ctx.lineTo(m.wx + facing * 0.5, y + 0.12); ctx.fill();
      GP.FX.frameLight(m.wx, m.wy, 1.6, '#6ec8ff', 0.35);
    }
  }
  // cyan, scan-lined copy of a spawn-menu icon (cached per icon)
  hologram(icon) {
    this.holoCache = this.holoCache || new WeakMap();
    let c = this.holoCache.get(icon);
    if (c) return c;
    const src = icon.canvas, pad = Math.ceil(icon.ppm * 0.08);
    // the body: solid cyan light in its shape, shaded by the real picture (so even black armour glows)
    const body = document.createElement('canvas'); body.width = src.width; body.height = src.height;
    const b = body.getContext('2d');
    b.fillStyle = '#48b8f0'; b.fillRect(0, 0, body.width, body.height);
    b.globalCompositeOperation = 'soft-light';
    b.filter = 'grayscale(1) contrast(1.4) brightness(1.2)';
    b.drawImage(src, 0, 0);
    b.globalCompositeOperation = 'screen';   // bring out highlights and details
    b.globalAlpha = 0.3;
    b.drawImage(src, 0, 0);
    b.globalAlpha = 1;
    b.filter = 'none';
    // scan lines
    b.globalCompositeOperation = 'destination-out';
    const gap = Math.max(3, Math.round(icon.ppm * 0.035));
    b.fillStyle = 'rgba(0,0,0,0.45)';
    for (let y = 0; y < body.height; y += gap) b.fillRect(0, y, body.width, Math.max(1, gap * 0.4));
    b.globalCompositeOperation = 'destination-in';
    b.drawImage(src, 0, 0);
    // glow around the outline, then the body on top
    c = document.createElement('canvas'); c.width = src.width + pad * 2; c.height = src.height + pad * 2;
    const x = c.getContext('2d');
    x.shadowColor = 'rgba(90,200,255,0.9)'; x.shadowBlur = pad * 0.8;
    x.globalAlpha = 0.55;
    x.drawImage(body, pad, pad);
    x.shadowBlur = 0; x.globalAlpha = 1;
    x.drawImage(body, pad, pad);
    c.pad = pad;
    this.holoCache.set(icon, c);
    return c;
  }
  // F on a weapon lying near a person, or on a person with a weapon near them: they take it up.
  // The weapon then ignores collisions with its holder only (see Item.attach).
  armNearby(h) {
    const g = this.game, R = 2.2;
    const isPerson = (e) => e && !e.removed && e.isCharacterLike && e.equip && e.state === 'alive' && e.parts;
    const loose = (e) => e && !e.removed && e.isItem && !e.holder && !e.hidden;
    const d2 = (a, b) => { const p = a.position(), q = b.position(); return (p.x - q.x) ** 2 + (p.y - q.y) ** 2; };
    let person = null, item = null;
    if (loose(h)) {
      item = h;
      for (const e of g.entities) if (isPerson(e) && d2(e, h) < R * R && (!person || d2(e, h) < d2(person, h))) person = e;
    } else if (isPerson(h)) {
      person = h;
      for (const e of g.entities) if (loose(e) && d2(e, h) < R * R && (!item || d2(e, h) < d2(item, h))) item = e;
    }
    if (!person || !item) return false;
    const slot = item.isJetpack ? 'back' : !person.equipment.handF ? 'handF' : !person.equipment.handB && !(person.equipment.handF && person.equipment.handF.twoHanded) && !item.twoHanded ? 'handB' : 'handF';
    if (item.body && item.body.frozen) item.body.setFrozen(false);
    if (!person.equip(item, slot)) { GP.UI.toast(person.name + ' can\'t hold that right now.', 'warn'); return true; }
    if (item.isSaber) item.setActive(true);
    GP.Audio.play('reload', { x: person.position().x, y: person.position().y });
    GP.UI.toast(person.name + ' took the ' + item.name + '.', 'ok');
    return true;
  }

  /* ---------------------------------------------------------------- tools */
  makeTools() {
    const self = this, g = this.game, m = this.mouse, Phys = GP.Phys, M = GP.M;
    const pick = () => self.hover;
    const T = {};

    T.grab = {
      name: 'Grab', color: '#5fd4ff', icon: 'hand', rightClick: () => !!self.grab,
      desc: 'Drag objects with physics. Release to throw. Wheel or Q/R rotates, right-click while holding freezes in place.',
      hint: () => self.grab ? '<b>Wheel / Q R</b> rotate · <b>Right-click</b> freeze here · release to throw' : '<b>Drag</b> any object · <b>F</b> activate / arm a person · <b>Z</b> freeze · <b>C</b> duplicate · <b>Del</b> delete',
      down(btn) {
        const h = pick();
        if (btn === 0 && h) {
          const b = h.body, e = h.e;
          if (b.frozen) { self.grab = { frozenMove: true, e, b, ox: b.x - m.wx, oy: b.y - m.wy }; return; }
          const mass = e.totalMass ? Math.max(1, e.totalMass()) : b.m;
          const j = new Phys.TargetJoint(g.world.ground, b, m.wx, m.wy, { hertz: 4.5, dampingRatio: 0.7, maxForce: Math.max(600, mass * 90), effectiveMass: mass, angularDamp: 0.3 });
          g.world.addJoint(j);
          self.grab = { j, e, b, spin: 0 };
          if (e.knockDown) e.knockDown(0.6);
          GP.Events.emit('tutorial', { step: 'grab' });
        } else if (btn === 2 && self.grab && self.grab.j) {
          const e = self.grab.e; this.cancel(); e.setFrozen(true); GP.Audio.play('freeze', { x: m.wx, y: m.wy });
        }
      },
      up(btn) { if (btn === 0) this.cancel(); },
      wheel(d) { if (!self.grab) return false; self.grab.spin += d * 4; return true; },
      keys() {
        if (!self.grab) return false;
        if (GP.Input.pressed('edit.rotateLeft')) self.grab.spin -= 4;
        if (GP.Input.pressed('edit.rotateRight')) self.grab.spin += 4;
        return false;
      },
      tick(dt) {
        const G = self.grab;
        if (!G) return;
        if (G.frozenMove) { G.b.setTransform(m.wx + G.ox, m.wy + G.oy); return; }
        if (!G.j.world || G.b.removed) { self.grab = null; return; }
        G.j.setTarget(m.wx, m.wy);
        if (G.spin) { G.b.applyAngularImpulse(G.spin * G.b.I * 1.5); G.spin *= 0.6; if (Math.abs(G.spin) < 0.05) G.spin = 0; }
        if (G.e.knockDown && Math.random() < dt * 10) G.e.knockDown(0.4);
      },
      overlay(ctx) {
        const G = self.grab;
        if (!G || !G.j) return;
        const a = G.b.toWorld(G.j.lbx, G.j.lby);
        ctx.strokeStyle = 'rgba(95,212,255,0.8)'; ctx.lineWidth = 0.03; ctx.setLineDash([0.1, 0.08]);
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(m.wx, m.wy); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = '#5fd4ff'; ctx.beginPath(); ctx.arc(a.x, a.y, 0.06, 0, 7); ctx.fill();
      },
      cancel() { const G = self.grab; if (G && G.j && G.j.world) g.world.removeJoint(G.j); self.grab = null; },
      onRemoved(e) { if (self.grab && self.grab.e === e) self.grab = null; },
    };

    // bodies of a group of entities, including held items
    const groupBodies = (list) => {
      const out = [];
      for (const e of list) { out.push(...e.bodies); if (e.items) for (const it of e.items()) out.push(it.body); }
      return out;
    };
    const groupCenter = (list) => {
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const e of list) { const bb = e.bounds(); minX = Math.min(minX, bb.minX); maxX = Math.max(maxX, bb.maxX); minY = Math.min(minY, bb.minY); maxY = Math.max(maxY, bb.maxY); }
      return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
    };
    const rotateGroup = (list, cx, cy, d) => {
      const c = Math.cos(d), s = Math.sin(d);
      for (const b of groupBodies(list)) {
        const rx = b.x - cx, ry = b.y - cy;
        b.setTransform(cx + c * rx - s * ry, cy + s * rx + c * ry, b.a + d); b.vx = b.vy = b.w = 0;
      }
    };
    const grid = () => GP.Settings.play.gridSnap || 0.25;
    const angStep = () => (GP.Settings.play.angleSnap || 15) * Math.PI / 180;

    T.move = {
      name: 'Move', color: '#ffd166', icon: 'move', desc: 'Drag objects directly, ignoring physics. Drags the whole selection if the object is selected. Hold Shift to snap to the grid.',
      hint: () => '<b>Drag</b> to reposition (moves the selection, works on frozen objects) · <b>Shift</b> snap to grid · <b>Ctrl+drag</b> box-select',
      down(btn) {
        const h = pick();
        if (btn !== 0 || !h) return;
        const list = self.targetsFor(h.e);
        const p = h.e.position();
        self.mv = { list, anchor: h.e, ox: p.x - m.wx, oy: p.y - m.wy, before: self.captureTransforms(list) };
      },
      up() {
        const V = self.mv; self.mv = null;
        if (!V) return;
        for (const b of groupBodies(V.list)) { b.vx = 0; b.vy = 0; b.w = 0; b.wake(); }
        self.record({ type: 'transform', states: V.before });
      },
      tick() {
        const V = self.mv; if (!V || V.anchor.removed) { self.mv = null; return; }
        let tx = m.wx + V.ox, ty = m.wy + V.oy;
        if (GP.Input.shift()) { const g2 = grid(); tx = Math.round(tx / g2) * g2; ty = Math.round(ty / g2) * g2; }
        const p = V.anchor.position(); const dx = tx - p.x, dy = ty - p.y;
        if (!dx && !dy) return;
        for (const b of groupBodies(V.list)) { b.setTransform(b.x + dx, b.y + dy); b.vx = 0; b.vy = 0; b.w = 0; }
      },
      overlay(ctx) {
        if (!self.mv || !GP.Input.shift()) return;
        const g2 = grid(), vr = g.camera.viewRect(0);
        if ((vr.maxX - vr.minX) / g2 > 400) return;
        ctx.strokeStyle = 'rgba(255,209,102,0.12)'; ctx.lineWidth = 0.01; ctx.beginPath();
        for (let x = Math.floor(vr.minX / g2) * g2; x < vr.maxX; x += g2) { ctx.moveTo(x, vr.minY); ctx.lineTo(x, vr.maxY); }
        for (let y = Math.floor(vr.minY / g2) * g2; y < vr.maxY; y += g2) { ctx.moveTo(vr.minX, y); ctx.lineTo(vr.maxX, y); }
        ctx.stroke();
      },
      cancel() { self.mv = null; },
    };

    T.rotate = {
      name: 'Rotate', color: '#c77dff', icon: 'rotate', desc: 'Drag around an object to rotate it (or the whole selection) about its center. Shift snaps to the angle step; Q/R turn the hovered object by one step.',
      hint: () => '<b>Drag</b> around an object to rotate · <b>Shift</b> snap to ' + GP.Settings.play.angleSnap + '° · <b>Q / R</b> step-rotate hovered or selection',
      down(btn) {
        const h = pick();
        if (btn !== 0 || !h) return;
        const list = self.targetsFor(h.e);
        const c = list.length > 1 ? groupCenter(list) : h.e.position();
        self.rot = { list, anchor: h.e, cx: c.x, cy: c.y, a0: Math.atan2(m.wy - c.y, m.wx - c.x), last: 0, before: self.captureTransforms(list) };
      },
      up() {
        const R = self.rot; self.rot = null;
        if (!R) return;
        for (const b of groupBodies(R.list)) { b.vx = b.vy = b.w = 0; b.wake(); }
        self.record({ type: 'transform', states: R.before });
      },
      keys() {
        const I = GP.Input;
        const dir = I.pressed('edit.rotateLeft') ? -1 : I.pressed('edit.rotateRight') ? 1 : 0;
        if (!dir) return false;
        const h = self.hover && self.hover.e;
        const list = h ? self.targetsFor(h) : self.selectionList();
        if (!list.length) return false;
        const c = list.length > 1 ? groupCenter(list) : list[0].position();
        self.record({ type: 'transform', states: self.captureTransforms(list) });
        rotateGroup(list, c.x, c.y, dir * angStep());
        GP.Audio.play('click', { f: 1100 });
        return true;
      },
      tick() {
        const R = self.rot; if (!R || R.anchor.removed) { self.rot = null; return; }
        let a = M.wrapAngle(Math.atan2(m.wy - R.cy, m.wx - R.cx) - R.a0);
        if (GP.Input.shift()) a = Math.round(a / angStep()) * angStep();
        const d = a - R.last; R.last = a;
        if (!d) return;
        rotateGroup(R.list, R.cx, R.cy, d);
      },
      overlay(ctx) {
        const R = self.rot; if (!R) return;
        ctx.strokeStyle = 'rgba(199,125,255,0.8)'; ctx.lineWidth = 0.03;
        ctx.beginPath(); ctx.arc(R.cx, R.cy, Math.hypot(m.wx - R.cx, m.wy - R.cy), R.a0, R.a0 + R.last, R.last < 0); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(R.cx, R.cy); ctx.lineTo(m.wx, m.wy); ctx.stroke();
        ctx.fillStyle = '#c77dff'; ctx.font = '0.3px sans-serif';
        ctx.fillText(Math.round(R.last * 180 / Math.PI) + '°', m.wx + 0.25, m.wy - 0.25);
      },
      cancel() { self.rot = null; },
    };

    T.freeze = {
      name: 'Freeze', color: '#8ad8ff', icon: 'snow', rightClick: () => true, desc: 'Click to freeze an object in place (it becomes static). Click again to unfreeze.',
      hint: () => '<b>Click</b> toggle freeze · <b>Right-click</b> unfreeze everything touching the cursor',
      down(btn) { const h = pick(); if (!h) return; if (btn === 0) self.toggleFreeze(h.e); else if (btn === 2 && h.e.isFrozen()) self.toggleFreeze(h.e); },
    };

    T.delete = {
      name: 'Delete', color: '#ff5a5a', icon: 'trash', desc: 'Click to delete. Hold and sweep to delete everything you pass over.',
      hint: () => '<b>Click</b> delete · <b>hold and sweep</b> to erase many',
      down(btn) { if (btn === 0) { self.erasing = true; const h = pick(); if (h) self.deleteEntity(h.e); } },
      up() { self.erasing = false; },
      frame() { if (self.erasing && self.hover) self.deleteEntity(self.hover.e); },
      cancel() { self.erasing = false; },
    };

    const jointPick = (btn, kind) => {
      const h = pick();
      if (btn === 2) {
        const target = h && h.e;
        if (!target) return;
        const n = self.removeConstraintsOf(target);
        GP.UI.toast(n ? `Removed ${n} connection${n > 1 ? 's' : ''}. Ctrl+Z puts ${n > 1 ? 'them' : 'it'} back.` : 'No connections on that object.', n ? 'ok' : 'warn');
        return;
      }
      const body = h ? h.body : (g.world.queryPoint(m.wx, m.wy).find((b) => b.type === Phys.STATIC) || g.world.ground);
      const pt = { x: m.wx, y: m.wy };
      if (!self.link) { self.link = { body, pt, kind }; GP.Audio.play('click', { f: 1500 }); return; }
      const A = self.link;
      self.link = null;
      if (A.body === body) { GP.UI.toast('Pick two different objects.', 'warn'); return; }
      if (A.body.type !== Phys.DYNAMIC && body.type !== Phys.DYNAMIC) { GP.UI.toast('At least one end must be a movable object.', 'warn'); return; }
      let j;
      if (kind === 'weld') {
        const strength = { weak: 1500, strong: 12000, unbreakable: Infinity }[self.opts.weldStrength];
        j = new Phys.WeldJoint(A.body, body, pt.x, pt.y, { breakForce: strength, userMade: true, tag: 'weld' });
        GP.Audio.play('weld', { x: pt.x, y: pt.y });
        GP.FX.sparks(pt.x, pt.y, 0, -1, 10, '#ffd27a', 3);
      } else {
        const mode = self.opts.ropeMode;
        if (mode === 'pin') j = new Phys.RevoluteJoint(A.body, body, pt.x, pt.y, { userMade: true, tag: 'pin' });
        else j = new Phys.DistanceJoint(A.body, body, A.pt.x, A.pt.y, pt.x, pt.y, { mode, hertz: 2.5, damping: 0.4, breakForce: 25000, userMade: true, tag: 'rope' });
        GP.Audio.play('click', { f: 700 });
      }
      self.addConstraint(j);
      self.record({ type: 'joint', joints: [j] });
      GP.Events.emit('tutorial', { step: kind });
    };
    T.weld = {
      name: 'Weld', color: '#ffb547', icon: 'weld', rightClick: () => true, desc: 'Click two objects to weld them rigidly (or one object and the world). Right-click an object to remove its connections.',
      hint: () => self.link ? 'Now click the <b>second</b> object (or the ground) to weld' : '<b>Click</b> first object · <b>Right-click</b> removes connections',
      options: [{ key: 'weldStrength', label: 'Strength', choices: [['weak', 'Weak'], ['strong', 'Strong'], ['unbreakable', 'Unbreakable']] }],
      down(btn) { jointPick(btn, 'weld'); },
      overlay(ctx) { if (self.link) { ctx.strokeStyle = '#ffb547'; ctx.lineWidth = 0.03; ctx.setLineDash([0.12, 0.08]); ctx.beginPath(); ctx.moveTo(self.link.pt.x, self.link.pt.y); ctx.lineTo(m.wx, m.wy); ctx.stroke(); ctx.setLineDash([]); } },
      cancel() { self.link = null; },
    };
    T.rope = {
      name: 'Rope / Cable', color: '#c8a070', icon: 'rope', rightClick: () => true, desc: 'Click two points to connect them with a rope, spring, rigid rod or pivot pin. Right-click removes connections.',
      hint: () => self.link ? 'Click the <b>second</b> anchor point' : '<b>Click</b> first anchor (objects or the world) · <b>Right-click</b> removes connections',
      options: [{ key: 'ropeMode', label: 'Type', choices: [['rope', 'Rope'], ['spring', 'Spring'], ['rod', 'Rod'], ['pin', 'Pivot pin']] }],
      down(btn) { jointPick(btn, 'rope'); },
      overlay(ctx) { if (self.link) { ctx.strokeStyle = '#c8a070'; ctx.lineWidth = 0.04; ctx.beginPath(); ctx.moveTo(self.link.pt.x, self.link.pt.y); ctx.lineTo(m.wx, m.wy); ctx.stroke(); } },
      cancel() { self.link = null; },
    };

    T.wire = {
      name: 'Wire', color: '#ff6a4a', icon: 'wire', rightClick: () => true,
      desc: 'Click a source (button, sensor, timer, anything) then a target. Activating the source activates the target. Right-click removes an object\'s wires.',
      hint: () => self.wireFrom ? 'Click the <b>target</b> to wire from ' + self.wireFrom.name : '<b>Click</b> a source · <b>Right-click</b> remove wires · activate sources with <b>F</b>',
      down(btn) {
        const h = pick();
        if (btn === 2) { if (h) { const n = GP.Wires.removeFor(h.e); GP.UI.toast(n ? 'Removed ' + n + ' wire' + (n > 1 ? 's' : '') + '.' : 'No wires on that object.', n ? 'ok' : 'warn'); } self.wireFrom = null; return; }
        if (btn !== 0 || !h) return;
        const e = h.e.isItem && h.e.holder ? h.e : h.e;
        if (!self.wireFrom) { self.wireFrom = e; GP.Audio.play('click', { f: 1500 }); return; }
        if (self.wireFrom === e) { self.wireFrom = null; return; }
        if (GP.Wires.add(self.wireFrom, e)) { GP.Audio.play('weld', {}); GP.UI.toast('Wired ' + self.wireFrom.name + ' → ' + e.name + '.', 'ok'); }
        self.wireFrom = null;
      },
      overlay(ctx) { if (self.wireFrom && !self.wireFrom.removed) { const p = self.wireFrom.position(); ctx.strokeStyle = '#ff6a4a'; ctx.lineWidth = 0.03; ctx.setLineDash([0.12, 0.08]); ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(m.wx, m.wy); ctx.stroke(); ctx.setLineDash([]); } },
      cancel() { self.wireFrom = null; },
    };

    const FORCE = { id: 'player', team: 'neutral', isCharacterLike: false };
    T.force = {
      name: 'The Force', color: '#b98cff', icon: 'force', rightClick: () => true, desc: 'Left-drag lifts and throws anything. While lifting, right-click to suspend it in mid-air. Right-click on empty space uses the secondary power.',
      hint: () => GP.Force.isLifting(FORCE) ? 'Move to carry · <b>release</b> to throw · <b>Right-click</b> suspend in mid-air' : '<b>Left-drag</b> lift & throw · <b>Right-click</b> ' + self.opts.forceMode + ' · <b>Shift+Right-click</b> release suspended',
      options: [{ key: 'forceMode', label: 'Secondary', choices: [['repulse', 'Repulse'], ['push', 'Push'], ['pull', 'Pull'], ['lightning', 'Lightning']] }],
      down(btn) {
        const h = pick();
        if (btn === 0 && h && h.body.type === Phys.DYNAMIC) { GP.Force.lift(FORCE, h.body, m.wx, m.wy, { strength: 1.6 }); GP.Events.emit('tutorial', { step: 'force' }); return; }
        if (btn === 0 && h && h.body.frozen) { GP.UI.toast('That object is frozen. Unfreeze it first (Z).', 'warn'); return; }
        if (btn === 2) {
          if (GP.Force.isLifting(FORCE)) { GP.Force.suspend(FORCE); return; }
          if (GP.Input.shift()) { GP.Force.releaseSuspended(h ? h.body : null); return; }
          const mode = self.opts.forceMode;
          const cam = g.camera;
          const ox = cam.x, oy = cam.y + 3;
          let dx = m.wx - ox, dy = m.wy - oy; const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
          if (mode === 'repulse') GP.Force.repulse(m.wx, m.wy, { range: 5, strength: 1.4 });
          else if (mode === 'push') GP.Force.push(m.wx - dx * 3, m.wy - dy * 3, dx, dy, { range: 9, strength: 1.5, cone: 0.5 });
          else if (mode === 'pull') GP.Force.pull(m.wx, m.wy, -dx, -dy, { range: 9, strength: 1.3, cone: 0.7 });
          else if (mode === 'lightning') self.zapping = true;
        }
      },
      up(btn) { if (btn === 0) GP.Force.release(FORCE, true); if (btn === 2) self.zapping = false; },
      tick(dt) {
        if (GP.Force.isLifting(FORCE)) GP.Force.liftUpdate(FORCE, m.wx, m.wy, dt);
        if (self.zapping) { const cam = g.camera; GP.Force.lightning(FORCE, m.wx, m.wy - 6, m.wx, m.wy, dt, { range: 9, strength: 1.4 }); void cam; }
      },
      overlay(ctx, pulse) {
        ctx.strokeStyle = GP.M.rgba('#b98cff', 0.35 + pulse * 0.3); ctx.lineWidth = 0.03;
        ctx.beginPath(); ctx.arc(m.wx, m.wy, 0.5 + pulse * 0.1, 0, 7); ctx.stroke();
        const lb = GP.Force.liftedBody(FORCE);
        if (lb) { GP.Draw.glow(ctx, lb.x, lb.y, 1.2, '#b98cff', 0.35); ctx.beginPath(); ctx.moveTo(lb.x, lb.y); ctx.lineTo(m.wx, m.wy); ctx.stroke(); }
      },
      cancel() { GP.Force.release(FORCE, false); self.zapping = false; },
    };

    T.clone = {
      name: 'Clone', color: '#5ee08a', icon: 'copy', desc: 'Click an object to duplicate it (including its settings).',
      hint: () => '<b>Click</b> an object to duplicate it · <b>C</b> also duplicates the hovered object with any tool',
      down(btn) { const h = pick(); if (btn === 0 && h) self.duplicate(h.e); },
    };

    T.props = {
      name: 'Properties', color: '#ffd166', icon: 'sliders', desc: 'Click an object to inspect and edit its properties: mass, friction, bounciness, health, team, blade color, weapon stats...',
      hint: () => '<b>Click</b> an object to open the inspector',
      down(btn) { const h = pick(); if (btn === 0) { self.select(h ? h.e : null); if (h) GP.Events.emit('tutorial', { step: 'props' }); } },
      overlay(ctx, pulse) { const e = self.selected; if (e && !e.removed) for (const b of e.bodies) GP.Draw.highlight(ctx, b, '#ffd166', pulse); },
    };

    T.explode = {
      name: 'Explosion', color: '#ff7a3a', icon: 'boom', desc: 'Click anywhere to detonate an explosion of the chosen size and type.',
      noHover: true,
      hint: () => '<b>Click</b> to detonate · hold <b>Shift</b> for continuous blasts',
      options: [{ key: 'boom', label: 'Size', choices: [['small', 'S'], ['medium', 'M'], ['large', 'L'], ['huge', 'XL']] }, { key: 'boomKind', label: 'Type', choices: [['fire', 'Thermal'], ['ion', 'Ion'], ['seismic', 'Seismic']] }],
      size() { return { small: [2, 70, 10], medium: [3.5, 140, 16], large: [5.5, 220, 22], huge: [9, 400, 32] }[self.opts.boom]; },
      down(btn) { if (btn === 0) { const [r, d, p] = this.size(); GP.Damage.explode(g, m.wx, m.wy, { radius: r, damage: d, power: p, kind: self.opts.boomKind }); self.boomT = 0.25; GP.Events.emit('tutorial', { step: 'explode' }); } },
      frame(dt) { if ((m.buttons & 1) && GP.Input.shift()) { self.boomT -= dt; if (self.boomT <= 0) { this.down(0); } } },
      overlay(ctx, pulse) { const [r] = this.size(); ctx.strokeStyle = GP.M.rgba('#ff7a3a', 0.4 + pulse * 0.3); ctx.lineWidth = 0.035; ctx.setLineDash([0.2, 0.15]); ctx.beginPath(); ctx.arc(m.wx, m.wy, r, 0, 7); ctx.stroke(); ctx.setLineDash([]); self.crosshair(ctx, m.wx, m.wy, '#ff7a3a', 0.2); },
    };

    T.liquid = {
      name: 'Liquid', color: '#4aa8ff', icon: 'drop', rightClick: () => true, noHover: true,
      desc: 'Pour flowing water, lava, oil, acid or blood. Hold the left button to pour, the right button to soak liquid up.',
      hint: () => '<b>Hold left</b> pour ' + self.opts.liquidType + ' · <b>Hold right</b> soak up · ' + ({ water: 'water on lava = steam and rock; it freezes in the cold', lava: 'lava melts props and lights oil', oil: 'oil floats and burns', acid: 'acid eats people and props', blood: 'blood' }[self.opts.liquidType] || ''),
      options: [{ key: 'liquidType', label: 'Liquid', choices: [['water', 'Water'], ['lava', 'Lava'], ['oil', 'Oil'], ['acid', 'Acid'], ['blood', 'Blood']] }, { key: 'liquidFlow', label: 'Flow', choices: [['trickle', 'Trickle'], ['stream', 'Stream'], ['flood', 'Flood']] }],
      frame(dt) {
        const flow = { trickle: [30, 0.1], stream: [110, 0.22], flood: [320, 0.45] }[self.opts.liquidFlow];
        if (m.buttons & 1) {
          // flow rates are for the finest particles; coarser ones carry more liquid each
          self.pourState = self.pourState || {};
          const made = GP.Fluid.stream(self.pourState, GP.Fluid.NAMES[self.opts.liquidType], m.wx, m.wy, flow[0] / (GP.Fluid.scale() ** 2), flow[1] * Math.max(1, GP.Fluid.scale() * 0.7), dt, 0, 1);
          if (!made && GP.Fluid.count() >= GP.Settings.p.maxFluid && !self.fluidWarned) { self.fluidWarned = true; GP.UI.toast('Liquid limit reached (' + GP.Settings.p.maxFluid + '). Soak some up with the right button, or raise the limit in Settings → Physics.', 'warn'); }
        } else self.fluidWarned = false;
        if (m.buttons & 4) GP.Fluid.erase(m.wx, m.wy, flow[1] * 2 + 0.3);
      },
      overlay(ctx, pulse) {
        const r = { trickle: 0.1, stream: 0.22, flood: 0.45 }[self.opts.liquidFlow];
        ctx.strokeStyle = GP.M.rgba((GP.Fluid.TYPES[GP.Fluid.NAMES[self.opts.liquidType]] || GP.Fluid.TYPES[0]).color, 0.45 + pulse * 0.3); ctx.lineWidth = 0.03;
        ctx.beginPath(); ctx.arc(m.wx, m.wy, r + 0.05, 0, 7); ctx.stroke();
        if (m.buttons & 4) { ctx.setLineDash([0.1, 0.08]); ctx.beginPath(); ctx.arc(m.wx, m.wy, r * 2 + 0.3, 0, 7); ctx.stroke(); ctx.setLineDash([]); }
      },
    };

    T.control = {
      name: 'Control', color: '#ffb547', icon: 'target', desc: 'Click a character, droid or vehicle to control it directly. Esc or X releases control.',
      hint: () => g.controlled ? '' : '<b>Click</b> a character, droid or vehicle to take control',
      down(btn) {
        const h = pick();
        if (btn !== 0 || !h) return;
        let e = h.e;
        if (e.isItem && e.holder) e = e.holder;
        if (e.isVehicle) { const d = e.driver(); if (d) e = d; }
        if (e.isVehicle) {
          // drive an empty vehicle directly
          if (g.takeControl(e)) { e.playerControlled = true; GP.UI.toast('Driving ' + e.name + '. Esc to release.', 'ok'); }
          return;
        }
        if (!(e.isCharacterLike)) { GP.UI.toast('That cannot be controlled. Pick a character, droid or vehicle.', 'warn'); return; }
        if (g.takeControl(e)) { GP.UI.toast('Controlling ' + e.name + '. Esc to release.', 'ok'); GP.Events.emit('tutorial', { step: 'control' }); }
      },
    };
    return T;
  }
};

// Vehicles driven directly by the player use their own intent object
(() => {
  const V = GP.Vehicle && GP.Vehicle.prototype;
  if (!V) return;
  Object.defineProperty(V, 'intent', { get() { return this.ownIntent; } });
})();
