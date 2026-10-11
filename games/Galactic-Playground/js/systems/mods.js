/* GALACTIC PLAYGROUND — mods: your own characters, props, weapons and vehicles.
 *
 * Mods are stored in the browser (localStorage) and loaded at start-up, before the spawn browser is
 * built. There are two kinds:
 *
 *   JSON mods describe content as data. Each item either copies an existing object and changes a few
 *   things ("base"), or defines a simple new prop from shapes and a colour:
 *     { "name": "My pack", "items": [
 *         { "id": "crimson_trooper", "base": "stormtrooper", "name": "Crimson Trooper",
 *           "look": { "helmet": "#8a1414", "torso": { "color": "#a01818" } }, "stats": { "health": 1.5 } },
 *         { "id": "gold_bar", "kind": "prop", "name": "Gold Bar", "category": "Props",
 *           "material": "metal", "density": 400, "shapes": [{ "box": [0.4, 0.15] }], "color": "#e8b830" } ] }
 *   Objects in the base are merged (so "look" or "stats" only need the fields you change); anything
 *   else replaces the base's value.
 *
 *   JS mods are scripts that run with full access to the game (GP) and get a `mod` helper with
 *   mod.register(def) and mod.log(...). They can add anything, including behaviour. Only install
 *   scripts you trust.
 *
 * Mod items show up in their category under the "Mods" group unless they set "sub" themselves.
 */
'use strict';

GP.Mods = (() => {
  const KEY = 'gp.mods.v1';
  const runtime = new Map();     // mod id -> { ids: [...], error }
  const ID_RE = /^[a-z0-9_]{2,48}$/;

  function read() { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (e) { return []; } }
  function write(list) {
    try { localStorage.setItem(KEY, JSON.stringify(list)); } catch (e) { throw new Error('Browser storage is full. Remove some saves or mods first.'); }
  }

  const plain = (v) => v && typeof v === 'object' && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype;
  function merge(base, over) {
    const out = Object.assign({}, base);
    for (const k of Object.keys(over)) out[k] = plain(base[k]) && plain(over[k]) ? merge(base[k], over[k]) : over[k];
    return out;
  }

  // Turn one mod item into a registered definition
  function registerItem(item, mod, ids) {
    if (!item || typeof item !== 'object') throw new Error('Each item must be an object.');
    const id = String(item.id || '');
    if (!ID_RE.test(id)) throw new Error('Item id "' + id + '" must be 2–48 lowercase letters, digits or _.');
    const existing = GP.Registry.get(id);
    if (existing && existing.mod !== mod.id) throw new Error('"' + id + '" is already used by ' + (existing.mod ? 'another mod' : 'the game') + '.');
    let def;
    if (item.base) {
      const base = GP.Registry.get(item.base);
      if (!base || base.hidden) throw new Error('Unknown base "' + item.base + '" for "' + id + '".');
      if (base.kind === 'contraption') throw new Error('Contraptions cannot be used as a base.');
      const over = Object.assign({}, item); delete over.base;
      def = merge(base, over);
      def.tags = (base.tags || []).concat(item.tags || []);
    } else {
      if (!item.kind) item = Object.assign({ kind: 'prop' }, item);
      if (item.kind === 'prop' && !(Array.isArray(item.shapes) && item.shapes.length)) throw new Error('New prop "' + id + '" needs a "shapes" list, e.g. [{ "box": [1, 1] }].');
      def = Object.assign({ category: 'Props', material: 'metal', hp: 80, density: 80, color: '#8a8f98' }, item);
    }
    def.id = id;
    def.name = String(item.name || def.name || id);
    def.sub = item.sub || 'Mods';
    def.mod = mod.id;
    def.hidden = false;
    def.tags = (def.tags || []).concat(['mod', mod.name.toLowerCase()]);
    if (!GP.Registry.categories.some((c) => c.id === def.category)) def.category = 'Props';
    GP.Registry.register(def);
    ids.push(id);
    return def;
  }

  function run(mod) {
    const ids = [];
    const rt = { ids, error: null };
    runtime.set(mod.id, rt);
    try {
      if (mod.type === 'js') {
        const api = { id: mod.id, name: mod.name, register: (d) => registerItem(d, mod, ids), log: (...a) => console.log('[mod ' + mod.name + ']', ...a) };
        (new Function('GP', 'mod', '"use strict";\n' + mod.source))(GP, api);
      } else {
        const data = JSON.parse(mod.source);
        const items = Array.isArray(data) ? data : data.items || [];
        if (!items.length) throw new Error('No "items" in this mod.');
        for (const it of items) registerItem(it, mod, ids);
      }
    } catch (e) {
      rt.error = e.message || String(e);
      console.warn('Mod "' + mod.name + '" failed:', e);
    }
    return rt;
  }
  // hide what a mod added (a reload removes it completely)
  function unload(modId) {
    const rt = runtime.get(modId);
    if (rt) for (const id of rt.ids) { const d = GP.Registry.get(id); if (d && d.mod === modId) d.hidden = true; }
    runtime.delete(modId);
  }

  function nameOf(type, source, fallback) {
    if (type === 'json') { try { const d = JSON.parse(source); if (d && d.name) return String(d.name).slice(0, 60); } catch (e) { /* reported when run */ } }
    const m = /^\s*\/\/\s*name:\s*(.+)$/m.exec(source);
    return (m ? m[1].trim() : fallback || 'Untitled mod').slice(0, 60);
  }

  const EXAMPLE = JSON.stringify({
    name: 'Example pack',
    items: [
      { id: 'crimson_trooper', base: 'stormtrooper', name: 'Crimson Trooper', look: { helmet: '#8a1414', torso: { color: '#a01818' }, arms: { armor: '#a01818' }, legs: { armor: '#a01818', boots: '#6a0a0a' } }, stats: { health: 1.5 } },
      { id: 'heavy_crate', base: 'crate_wood', name: 'Heavy Crate', hp: 400, density: 240 },
      { id: 'gold_bar', kind: 'prop', name: 'Gold Bar', category: 'Props', material: 'metal', density: 400, shapes: [{ box: [0.4, 0.15] }], color: '#e8b830' },
    ],
  }, null, 2);

  return {
    EXAMPLE,
    list: () => read().map((m) => Object.assign({}, m, runtime.get(m.id) ? { count: runtime.get(m.id).ids.length, error: runtime.get(m.id).error } : { count: 0, error: null })),
    // at start-up: run every enabled mod
    loadAll() { for (const m of read()) if (m.enabled !== false) run(m); },
    // add a mod from text; type 'json' or 'js' (guessed when missing). Returns its runtime record.
    install(source, type, fallbackName) {
      source = String(source || '').trim();
      if (!source) throw new Error('The mod is empty.');
      if (!type) type = /^[[{]/.test(source) ? 'json' : 'js';
      if (type === 'json') JSON.parse(source); // fail early on broken JSON
      const mod = { id: 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), name: nameOf(type, source, fallbackName), type, source, enabled: true, date: Date.now() };
      const list = read(); list.push(mod); write(list);
      const rt = run(mod);
      GP.Events.emit('mods:changed', {});
      return Object.assign({}, mod, { count: rt.ids.length, error: rt.error });
    },
    setEnabled(id, on) {
      const list = read(), m = list.find((x) => x.id === id);
      if (!m) return;
      m.enabled = !!on; write(list);
      if (on) run(m); else unload(id);
      GP.Events.emit('mods:changed', {});
    },
    remove(id) {
      unload(id);
      write(read().filter((m) => m.id !== id));
      GP.Events.emit('mods:changed', {});
    },
  };
})();
