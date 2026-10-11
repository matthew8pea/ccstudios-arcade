/* Settings + key bindings, persisted to localStorage. */
'use strict';

GP.Settings = (() => {
  const KEY = 'galactic-playground.settings.v1';

  const defaults = {
    graphics: {
      particleQuality: 'high',   // low | medium | high
      glow: true,
      lighting: true,
      shadows: true,
      vignette: true,
      decals: true,
      screenShake: true,
      resolutionScale: 1,
      showDebug: false,
      showFps: true,
      capes: true,
      hoverHighlights: true,
    },
    physics: {
      substeps: 4,
      velocityIterations: 6,
      positionIterations: 2,
      sleeping: true,
      maxBodies: 1400,
      maxDebris: 160,
      liquidThread: true,        // run the liquid simulation in a background thread (Web Worker)
      maxFluid: 1500,            // extra liquid particles you can pour on top of a map's own lakes
      liquidQuality: 'medium',   // off | verylow | low | medium | high | veryhigh
      askLiquid: true,           // ask for the liquid quality when entering a map with water or lava
      slowMotionScale: 0.25,
      fastForwardScale: 2,
      autoSafeguard: true,
    },
    audio: {
      master: 0.7,
      sfx: 0.85,
      ambience: 0.45,
      ui: 0.6,
      muted: false,
    },
    gameplay: {
      ai: false,                 // characters think for themselves (off: they just stand and balance)
      dismemberment: 'saber',    // off | saber | all
      forceStrength: 1,
      forceRange: 1,
      tooltips: true,
      tutorialDone: false,
      friendlyFire: true,
      corpseCleanup: 0,          // seconds, 0 = never
      dropOnDeath: true,
      autoHealWounds: false,
      fragility: 1,              // multiplier for impact damage
      crushForce: 1,             // multiplier for crushers / stomps
      knockouts: true,           // head trauma can knock characters unconscious
      temperature: true,         // heat, fire and freezing simulation
      heatTransfer: true,        // touching objects exchange heat
      tempUnit: 'C',
      gridSnap: 0.25,
      angleSnap: 15,
      expressions: true,
      gore: 1,                   // gore multiplier, 0 = off
      injuries: true,            // internal bleeding, pain, shock, consciousness, nerve damage
      bloodPools: true,
      spawnArmed: false,         // characters spawn with their usual weapons
      startEmpty: false,         // maps start without their props (also used when resetting)
      touchControls: 'auto',     // on-screen buttons and gestures: 'auto' (on first touch), 'on' or 'off'
      autosave: true,            // keep the sandbox in browser storage so it survives closing the tab
      favorites: [],             // starred spawn-browser items
      spawnCategory: 'Characters',
      toolOpts: {},              // last options picked for each tool (liquid type, weld strength...)
    },
    bindings: {},
  };

  // Action catalogue: id -> {label, group, key}
  // Key format: KeyboardEvent.code with optional modifiers, e.g. "Ctrl+KeyS", "Shift+KeyR".
  const actions = [
    ['tool.grab', 'Grab tool', 'Tools', 'Digit1'],
    ['tool.move', 'Move tool', 'Tools', 'Digit2'],
    ['tool.rotate', 'Rotate tool', 'Tools', 'Digit3'],
    ['tool.freeze', 'Freeze tool', 'Tools', 'Digit4'],
    ['tool.delete', 'Delete tool', 'Tools', 'Digit5'],
    ['tool.weld', 'Weld tool', 'Tools', 'Digit6'],
    ['tool.rope', 'Rope / cable tool', 'Tools', 'Digit7'],
    ['tool.wire', 'Wire tool (electronics)', 'Tools', 'KeyL'],
    ['tool.force', 'Force tool', 'Tools', 'Digit8'],
    ['tool.clone', 'Clone tool', 'Tools', 'Digit9'],
    ['tool.props', 'Property tool', 'Tools', 'Digit0'],
    ['tool.explode', 'Explosion tool', 'Tools', 'Minus'],
    ['tool.liquid', 'Liquid tool (water & lava)', 'Tools', 'KeyP'],
    ['tool.control', 'Character control tool', 'Tools', 'Equal'],

    ['time.pause', 'Play / pause', 'Time', 'Space'],
    ['time.slow', 'Toggle slow motion', 'Time', 'KeyT'],
    ['time.fast', 'Toggle fast-forward', 'Time', 'KeyY'],
    ['time.step', 'Step one frame (paused)', 'Time', 'Period'],
    ['scene.reset', 'Reset scene', 'Time', 'Shift+KeyR'],

    ['edit.delete', 'Delete hovered object', 'Editing', 'Delete'],
    ['edit.freeze', 'Freeze / unfreeze hovered', 'Editing', 'KeyZ'],
    ['edit.duplicate', 'Duplicate hovered', 'Editing', 'KeyC'],
    ['edit.activate', 'Activate hovered (ignite, arm, fire) · arm a person with a nearby weapon', 'Editing', 'KeyF'],
    ['edit.placeLeft', 'Hold to preview, release to spawn facing left', 'Editing', 'KeyQ'],
    ['edit.placeRight', 'Hold to preview, release to spawn facing right', 'Editing', 'KeyE'],
    ['edit.rotateLeft', 'Rotate held / placing object left', 'Editing', 'KeyQ'],
    ['edit.rotateRight', 'Rotate held / placing object right', 'Editing', 'KeyR'],
    ['edit.mirror', 'Mirror placing object', 'Editing', 'KeyM'],
    ['edit.detonate', 'Detonate all remote charges', 'Editing', 'KeyK'],
    ['edit.undoSpawn', 'Undo', 'Editing', 'Ctrl+KeyZ'],
    ['edit.redo', 'Redo (also Ctrl+Shift+Z)', 'Editing', 'Ctrl+KeyY'],
    ['edit.copy', 'Copy selection / hovered', 'Editing', 'Ctrl+KeyC'],
    ['edit.paste', 'Paste at cursor', 'Editing', 'Ctrl+KeyV'],
    ['edit.selectAll', 'Select everything', 'Editing', 'Ctrl+KeyA'],
    ['edit.front', 'Bring hovered to front', 'Editing', 'PageUp'],
    ['edit.back', 'Send hovered to back', 'Editing', 'PageDown'],
    ['edit.eyedrop', 'Spawn more of hovered object', 'Editing', 'KeyB'],
    ['edit.gridDown', 'Smaller grid snap', 'Editing', 'BracketLeft'],
    ['edit.gridUp', 'Larger grid snap', 'Editing', 'BracketRight'],
    ['edit.angleDown', 'Smaller angle snap', 'Editing', 'Shift+BracketLeft'],
    ['edit.angleUp', 'Larger angle snap', 'Editing', 'Shift+BracketRight'],

    ['camera.up', 'Pan camera up', 'Camera', 'KeyW'],
    ['camera.down', 'Pan camera down', 'Camera', 'KeyS'],
    ['camera.left', 'Pan camera left', 'Camera', 'KeyA'],
    ['camera.right', 'Pan camera right', 'Camera', 'KeyD'],
    ['camera.reset', 'Recenter camera', 'Camera', 'Home'],
    ['camera.zoomIn', 'Zoom in', 'Camera', 'NumpadAdd'],
    ['camera.zoomOut', 'Zoom out', 'Camera', 'NumpadSubtract'],

    ['ui.spawnMenu', 'Toggle spawn browser', 'Interface', 'Tab'],
    ['ui.inspector', 'Toggle inspector', 'Interface', 'KeyI'],
    ['ui.search', 'Focus search', 'Interface', 'Slash'],
    ['ui.debug', 'Toggle physics debug view', 'Interface', 'F3'],
    ['ui.detail', 'Toggle detail view (limb health)', 'Interface', 'KeyH'],
    ['ui.thermal', 'Toggle thermal vision', 'Interface', 'KeyJ'],
    ['ui.hideHud', 'Hide / show interface', 'Interface', 'F4'],
    ['ui.screenshot', 'Save a screenshot', 'Interface', 'F2'],
    ['ui.save', 'Save scene', 'Interface', 'Ctrl+KeyS'],
    ['ui.load', 'Load scene', 'Interface', 'Ctrl+KeyO'],
    ['ui.menu', 'Pause menu / cancel', 'Interface', 'Escape'],

    ['ctl.left', 'Move left', 'Character control', 'KeyA'],
    ['ctl.right', 'Move right', 'Character control', 'KeyD'],
    ['ctl.jump', 'Jump / jetpack', 'Character control', 'KeyW'],
    ['ctl.crouch', 'Crouch / descend', 'Character control', 'KeyS'],
    ['ctl.run', 'Run / boost', 'Character control', 'ShiftLeft'],
    ['ctl.interact', 'Pick up / enter vehicle', 'Character control', 'KeyF'],
    ['ctl.drop', 'Drop / throw held item', 'Character control', 'KeyG'],
    ['ctl.force', 'Use Force power', 'Character control', 'KeyE'],
    ['ctl.nextPower', 'Cycle Force power', 'Character control', 'KeyQ'],
    ['ctl.reload', 'Reload', 'Character control', 'KeyR'],
    ['ctl.saber', 'Ignite / retract lightsaber', 'Character control', 'KeyV'],
    ['ctl.release', 'Stop controlling', 'Character control', 'KeyX'],
  ];

  let data = null;

  function deepMerge(base, over) {
    const out = Array.isArray(base) ? base.slice() : { ...base };
    if (!over || typeof over !== 'object') return out;
    for (const k of Object.keys(over)) {
      if (base && typeof base[k] === 'object' && base[k] !== null && !Array.isArray(base[k])) out[k] = deepMerge(base[k], over[k]);
      else out[k] = over[k];
    }
    return out;
  }

  function load() {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { saved = null; }
    data = deepMerge(defaults, saved || {});
    // one-time upgrades of saved settings
    const v = (saved && saved.meta && saved.meta.v) || (saved ? 1 : 2);
    if (v < 2) data.gameplay.ai = false;   // AI became off by default
    if (v < 3 && saved && saved.bindings) {
      // activate / interact moved from E to F (freeze to Z, the Force to E); keep any keys the player chose
      const moved = { 'edit.activate': ['KeyE', 'KeyF'], 'edit.freeze': ['KeyF', 'KeyZ'], 'ctl.interact': ['KeyE', 'KeyF'], 'ctl.force': ['KeyF', 'KeyE'] };
      for (const [id, [from, to]] of Object.entries(moved)) if (!saved.bindings[id] || saved.bindings[id] === from) data.bindings[id] = to;
    }
    data.meta = { v: 3 };
    for (const [id, , , key] of actions) if (!data.bindings[id]) data.bindings[id] = key;
    return data;
  }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { console.warn('Settings not saved', e); }
    GP.Events.emit('settings:changed', data);
  }

  function reset(section) {
    if (section) data[section] = JSON.parse(JSON.stringify(defaults[section]));
    else data = JSON.parse(JSON.stringify(defaults));
    if (!section || section === 'bindings') for (const [id, , , key] of actions) data.bindings[id] = data.bindings[id] || key;
    save();
  }

  load();

  return {
    get data() { return data; },
    get g() { return data.graphics; },
    get p() { return data.physics; },
    get a() { return data.audio; },
    get play() { return data.gameplay; },
    actions: actions.map(([id, label, group, key]) => ({ id, label, group, key })),
    binding(id) { return data.bindings[id]; },
    setBinding(id, key) { data.bindings[id] = key; save(); },
    resetBindings() { for (const [id, , , key] of actions) data.bindings[id] = key; save(); },
    save, load, reset,
  };
})();

/* Input manager: tracks keys/mouse, resolves bindings to actions. */
GP.Input = (() => {
  const down = new Set();
  const virtual = new Set();          // keys held by on-screen (touch) buttons
  const pressedCodes = new Set();
  const mouse = { sx: 0, sy: 0, wx: 0, wy: 0, buttons: 0, inside: false, pwx: 0, pwy: 0, vx: 0, vy: 0 };
  let wheel = 0;
  let captureCb = null;

  function comboFromEvent(e) {
    const parts = [];
    if (e.ctrlKey || e.metaKey) parts.push('Ctrl');
    if (e.shiftKey && !e.code.startsWith('Shift')) parts.push('Shift');
    if (e.altKey && !e.code.startsWith('Alt')) parts.push('Alt');
    parts.push(e.code);
    return parts.join('+');
  }

  function prettyKey(combo) {
    if (!combo) return '—';
    return combo.split('+').map((p) => p
      .replace(/^Key/, '').replace(/^Digit/, '').replace('Minus', '-').replace('Equal', '=')
      .replace('Period', '.').replace('Slash', '/').replace('Backquote', '`').replace('ShiftLeft', 'L-Shift')
      .replace('ShiftRight', 'R-Shift').replace('ControlLeft', 'L-Ctrl').replace('Escape', 'Esc')
      .replace('BracketLeft', '[').replace('BracketRight', ']').replace('NumpadAdd', 'Num +').replace('NumpadSubtract', 'Num −').replace('PageUp', 'PgUp').replace('PageDown', 'PgDn').replace('ArrowUp', '↑').replace('ArrowDown', '↓').replace('ArrowLeft', '←').replace('ArrowRight', '→'))
      .join('+');
  }

  function isTyping() {
    const el = document.activeElement;
    return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
  }

  window.addEventListener('keydown', (e) => {
    if (captureCb) {
      e.preventDefault();
      if (['ControlLeft', 'ControlRight', 'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight'].includes(e.code)) return;
      const cb = captureCb; captureCb = null; cb(e.code === 'Escape' ? null : comboFromEvent(e));
      return;
    }
    if (isTyping()) { if (e.code === 'Escape') document.activeElement.blur(); return; }
    const combo = comboFromEvent(e);
    if (!down.has(e.code)) pressedCodes.add(combo);
    down.add(e.code);
    // Prevent browser defaults for keys the game uses
    if (['Tab', 'Space', 'F2', 'F3', 'F4', 'Slash', 'ArrowUp', 'ArrowDown'].includes(e.code) || e.ctrlKey && ['KeyS', 'KeyO', 'KeyZ', 'KeyY', 'KeyA', 'KeyV'].includes(e.code) || e.code === 'PageUp' || e.code === 'PageDown') e.preventDefault();
  });
  window.addEventListener('keyup', (e) => { down.delete(e.code); });
  window.addEventListener('blur', () => { down.clear(); mouse.buttons = 0; });

  return {
    mouse,
    isDown(action) {
      const combo = GP.Settings.binding(action);
      if (!combo) return false;
      const code = combo.split('+').pop();
      return down.has(code) || virtual.has(code);
    },
    // on-screen buttons: press an action once, or hold it down
    trigger(action) { const c = GP.Settings.binding(action); if (c) pressedCodes.add(c); },
    hold(action, on) {
      const c = GP.Settings.binding(action);
      if (!c) return;
      const code = c.split('+').pop();
      if (on) { if (!virtual.has(code)) pressedCodes.add(c); virtual.add(code); } else virtual.delete(code);
    },
    releaseVirtual() { virtual.clear(); },
    // True once on the frame the bound combo was pressed.
    pressed(action) {
      const combo = GP.Settings.binding(action);
      return !!combo && pressedCodes.has(combo);
    },
    codeDown(code) { return down.has(code); },
    // True once when this exact key combo (e.g. 'Ctrl+Shift+KeyZ') was pressed, whatever it is bound to
    comboPressed(combo) { return pressedCodes.has(combo); },
    consume(action) { const c = GP.Settings.binding(action); if (c) pressedCodes.delete(c); },
    addWheel(d) { wheel += d; },
    takeWheel() { const w = wheel; wheel = 0; return w; },
    endFrame() { pressedCodes.clear(); },
    captureNextKey(cb) { captureCb = cb; },
    prettyKey,
    prettyAction(action) { return prettyKey(GP.Settings.binding(action)); },
    isTyping,
    shift() { return down.has('ShiftLeft') || down.has('ShiftRight'); },
    ctrl() { return down.has('ControlLeft') || down.has('ControlRight'); },
    alt() { return down.has('AltLeft') || down.has('AltRight'); },
  };
})();

// AI runs when the setting is on, and always in the main-menu demo battle
GP.aiEnabled = () => !!GP.Settings.play.ai || !!(window.GAME && !window.GAME.active);
