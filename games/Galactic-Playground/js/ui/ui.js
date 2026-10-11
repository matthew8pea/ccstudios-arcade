/* GALACTIC PLAYGROUND — user interface (DOM). */
'use strict';

GP.UI = (() => {
  let game = null;
  const root = () => document.getElementById('ui');
  const els = {};
  let category = 'Characters';
  let search = '';
  let inspectorTarget = null;
  let inspectorRows = [];
  let overlay = null;
  let tutorialStep = -1;
  let hudHidden = false;
  let statusT = 0;

  /* ---------------- helpers ---------------- */
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    if (attrs) for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'text') el.textContent = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const c of kids.flat()) if (c != null && c !== false) el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    return el;
  }
  const svg = (paths) => `<svg viewBox="0 0 24 24">${paths}</svg>`;
  const ICONS = {
    hand: svg('<path d="M8 12V5.5a1.5 1.5 0 0 1 3 0V11M11 10V4a1.5 1.5 0 0 1 3 0v7M14 10V5.5a1.5 1.5 0 0 1 3 0V13M17 9.5a1.5 1.5 0 0 1 3 0V15a6 6 0 0 1-6 6h-1.5a6 6 0 0 1-5-2.7L4.5 14a1.6 1.6 0 0 1 2.6-1.8L8 13.5"/>'),
    move: svg('<path d="M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3"/>'),
    rotate: svg('<path d="M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5"/>'),
    snow: svg('<path d="M12 2v20M4 7l16 10M4 17L20 7M9 3.5l3 2 3-2M9 20.5l3-2 3 2"/>'),
    trash: svg('<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6"/>'),
    weld: svg('<path d="M3 20l7-7M10 13l3 3M13 16l8-8-3-3-8 8M16 5l3 3"/><circle cx="6" cy="17" r="1.5"/>'),
    rope: svg('<path d="M5 4c0 6 14 4 14 10s-8 6-8 6"/><circle cx="5" cy="4" r="1.6"/><circle cx="11" cy="20" r="1.6"/>'),
    force: svg('<path d="M4 12c3-5 13-5 16 0M6.5 15c2.5-3 8.5-3 11 0M9 18c1.5-1.5 4.5-1.5 6 0"/><circle cx="12" cy="7" r="1.4"/>'),
    copy: svg('<rect x="8" y="8" width="12" height="12" rx="1"/><path d="M4 16V4h12"/>'),
    sliders: svg('<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>'),
    boom: svg('<path d="M12 2l2 6 6-3-3 6 5 2-6 2 2 6-6-3-4 5 1-6-6-1 5-3-4-5 6 1z"/>'),
    target: svg('<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M1 12h4M19 12h4"/>'),
    play: svg('<path d="M7 4l13 8-13 8z"/>'),
    pause: svg('<path d="M7 4v16M17 4v16"/>'),
    slow: svg('<circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2M9 2h6"/>'),
    fast: svg('<path d="M3 5l9 7-9 7zM12 5l9 7-9 7z"/>'),
    step: svg('<path d="M5 4l10 8-10 8zM19 4v16"/>'),
    reset: svg('<path d="M4 12a8 8 0 1 0 2.3-5.7M4 4v5h5"/>'),
    world: svg('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>'),
    save: svg('<path d="M5 3h11l3 3v15H5z"/><path d="M8 3v6h8V3M8 21v-7h8v7"/>'),
    folder: svg('<path d="M3 6h7l2 2h9v11H3z"/>'),
    gear: svg('<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>'),
    menu: svg('<path d="M4 6h16M4 12h16M4 18h16"/>'),
    help: svg('<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.7M12 17h0"/>'),
    search: svg('<circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/>'),
    user: svg('<circle cx="12" cy="6" r="3"/><path d="M12 9v7M8 12l4-2 4 2M9 21l3-5 3 5"/>'),
    droid: svg('<path d="M7 10a5 5 0 0 1 10 0v7H7z"/><circle cx="14" cy="9" r="1"/><path d="M5 20h4M15 20h4M8 17l-2 3M16 17l2 3"/>'),
    saber: svg('<path d="M4 20l3-3M7 17l13-13"/><path d="M5 16l3 3" />'),
    blaster: svg('<path d="M3 9h14l2-2h2v5h-4v2h-5l-1 5H7l1-5H3z"/>'),
    staff: svg('<path d="M4 20L20 4"/><circle cx="4.5" cy="19.5" r="1.5"/><circle cx="19.5" cy="4.5" r="1.5"/>'),
    bomb: svg('<circle cx="11" cy="14" r="7"/><path d="M15 8l3-3M18 5l2 1M18 5l1-2"/>'),
    ship: svg('<path d="M2 13l7-2 4-6 2 6 7 2-7 2-2 6-4-6z"/>'),
    crate: svg('<path d="M3 7l9-4 9 4v10l-9 4-9-4z"/><path d="M3 7l9 4 9-4M12 11v10"/>'),
    beam: svg('<path d="M2 8h20v3H2zM2 15h20v3H2zM5 11v4M12 11v4M19 11v4"/>'),
    chev: svg('<path d="M15 6l-6 6 6 6"/>'),
    chevR: svg('<path d="M9 6l6 6-6 6"/>'),
    wire: svg('<path d="M4 18c4 0 4-12 8-12s4 12 8 12"/><circle cx="4" cy="18" r="1.8"/><circle cx="20" cy="18" r="1.8"/>'),
    house: svg('<path d="M3 11l9-7 9 7M5 10v10h14V10M10 20v-6h4v6"/><path d="M12 1v3"/>'),
    eye: svg('<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),
    close: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
    drop: svg('<path d="M12 3c-3 5-6 8-6 12a6 6 0 0 0 12 0c0-4-3-7-6-12z"/><path d="M9 15a3 3 0 0 0 3 3"/>'),
    camera: svg('<path d="M3 8h4l2-3h6l2 3h4v11H3z"/><circle cx="12" cy="13" r="3.5"/>'),
    star: svg('<path d="M12 3l2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 16.8l-5.4 2.9 1.1-6.1-4.5-4.2 6.1-.8z"/>'),
  };
  const FAV = 'Favorites';   // spawn-browser category holding the starred items
  const TOOL_ORDER = ['grab', 'move', 'rotate', 'freeze', 'delete', 'weld', 'rope', 'wire', 'force', 'clone', 'props', 'explode', 'liquid', 'control'];

  function toast(msg, kind = 'info', ms = 3200) {
    if (!els.toasts) { console.log('[toast]', msg); return; }
    const t = h('div', { class: 'toast panel ' + kind, text: msg });
    els.toasts.appendChild(t);
    while (els.toasts.children.length > 5) els.toasts.firstChild.remove();
    setTimeout(() => { t.style.transition = 'opacity .4s'; t.style.opacity = '0'; setTimeout(() => t.remove(), 400); }, ms);
    if (kind === 'error') GP.Audio.play('error');
  }

  function tooltip(el, title, desc, key) {
    el.addEventListener('mouseenter', () => {
      if (!GP.Settings.play.tooltips) return;
      const tt = els.tooltip;
      tt.innerHTML = '';
      tt.appendChild(h('div', { class: 'tt' }, title, key ? h('span', { style: { marginLeft: '8px' } }, h('span', { class: 'kbd', text: key })) : null));
      if (desc) tt.appendChild(h('div', { class: 'td', text: desc }));
      tt.classList.remove('hidden');
      const r = el.getBoundingClientRect();
      let x = r.left, y = r.bottom + 8;
      tt.style.left = '0px'; tt.style.top = '0px';
      const tw = tt.offsetWidth, th = tt.offsetHeight;
      if (x + tw > window.innerWidth - 8) x = window.innerWidth - tw - 8;
      if (y + th > window.innerHeight - 8) y = r.top - th - 8;
      tt.style.left = x + 'px'; tt.style.top = y + 'px';
      GP.Audio.play('hover');
    });
    el.addEventListener('mouseleave', () => els.tooltip.classList.add('hidden'));
    el.addEventListener('mousedown', () => els.tooltip.classList.add('hidden'));
  }

  /* ---------------- HUD ---------------- */
  function buildHUD() {
    const r = root();
    r.innerHTML = '';
    els.hud = h('div', { id: 'hud' });
    // top bar
    const brand = h('div', { class: 'brand panel' }, h('div', { class: 't', text: 'GALACTIC PLAYGROUND' }), els.mapName = h('div', { class: 'm', text: '' }));
    const tools = h('div', { class: 'tools panel' });
    els.toolBtns = {};
    for (const id of TOOL_ORDER) {
      const T = game.tools.defs[id];
      const b = h('button', { class: 'tool', html: ICONS[T.icon] + `<span class="k">${GP.Input.prettyAction('tool.' + id)}</span>`, onclick: () => game.tools.setTool(id) });
      tooltip(b, T.name, T.desc, GP.Input.prettyAction('tool.' + id));
      els.toolBtns[id] = b;
      tools.appendChild(b);
    }
    const time = h('div', { class: 'timebox panel' });
    const tb = (id, icon, title, desc, fn, key) => { const b = h('button', { class: 'tool', html: ICONS[icon], onclick: fn }); tooltip(b, title, desc, key && GP.Input.prettyAction(key)); els[id] = b; time.appendChild(b); return b; };
    tb('bPause', 'pause', 'Play / Pause', 'Freeze the simulation. You can still grab and edit objects.', () => togglePause(), 'time.pause');
    tb('bSlow', 'slow', 'Slow motion', 'Run the simulation at a fraction of normal speed.', () => toggleSlow(), 'time.slow');
    tb('bFast', 'fast', 'Fast-forward', 'Run the simulation faster.', () => toggleFast(), 'time.fast');
    tb('bStep', 'step', 'Step', 'Advance one frame while paused.', () => stepOnce(), 'time.step');
    tb('bReset', 'reset', 'Reset scene', 'Reload this map in its starting state.', () => confirmReset(), 'scene.reset');
    const menus = h('div', { class: 'menuboxes panel' });
    const mb = (id, icon, title, desc, fn, key) => { const b = h('button', { class: 'tool', html: ICONS[icon], onclick: fn }); tooltip(b, title, desc, key && GP.Input.prettyAction(key)); els[id] = b; menus.appendChild(b); return b; };
    mb('bWorld', 'world', 'World & physics', 'Gravity, zero-G, AI, debug view, cleanup.', () => toggleWorld());
    mb('bSave', 'save', 'Save scene', 'Save everything in this sandbox.', () => openSaves('save'), 'ui.save');
    mb('bLoad', 'folder', 'Load scene', 'Load a saved sandbox.', () => openSaves('load'), 'ui.load');
    mb('bShot', 'camera', 'Screenshot', 'Save a picture of the scene (without the interface) to your downloads.', () => screenshot(), 'ui.screenshot').classList.add('wide-only');
    mb('bHelp', 'help', 'Controls & help', 'Keyboard and mouse controls.', () => openSettings('controls'));
    mb('bSettings', 'gear', 'Settings', 'Graphics, audio, physics and gameplay options.', () => openSettings('graphics'));
    mb('bMenu', 'menu', 'Menu', 'Pause menu.', () => openPause(), 'ui.menu');
    els.topbar = h('div', { id: 'topbar' }, brand, tools, time, menus);
    els.hud.appendChild(els.topbar);
    els.toolopts = h('div', { id: 'toolopts', class: 'panel' });
    els.hud.appendChild(els.toolopts);
    els.timeflag = h('div', { id: 'timeflag', class: 'hidden' });
    els.hud.appendChild(els.timeflag);
    els.hud.appendChild(buildSpawn());
    els.inspector = h('div', { id: 'inspector', class: 'panel hidden' });
    els.hud.appendChild(els.inspector);
    els.world = h('div', { id: 'world', class: 'panel hidden' });
    els.hud.appendChild(els.world);
    els.status = h('div', { id: 'status', class: 'panel' });
    els.hud.appendChild(els.status);
    els.hint = h('div', { id: 'hint', class: 'panel' });
    els.hud.appendChild(els.hint);
    els.controlhud = h('div', { id: 'controlhud', class: 'panel hidden' });
    els.hud.appendChild(els.controlhud);
    els.tutorial = h('div', { id: 'tutorial', class: 'panel hidden' });
    els.hud.appendChild(els.tutorial);
    r.appendChild(els.hud);
    els.overlayHost = h('div', { id: 'overlayhost' });
    r.appendChild(els.overlayHost);
    els.toasts = h('div', { id: 'toasts' });
    r.appendChild(els.toasts);
    els.tooltip = h('div', { id: 'tooltip', class: 'panel hidden' });
    r.appendChild(els.tooltip);
    refreshTool();
  }

  function buildSpawn() {
    const panel = h('div', { id: 'spawn', class: 'panel' });
    const input = h('input', { type: 'text', placeholder: 'Search objects…  ( / )', spellcheck: 'false' });
    input.addEventListener('input', () => { search = input.value; renderGrid(); });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { const first = els.grid.querySelector('.item'); if (first) first.click(); input.blur(); } e.stopPropagation(); });
    els.search = input;
    const collapse = h('button', { class: 'collapse-btn', html: ICONS.chev, onclick: () => toggleSpawn() });
    tooltip(collapse, 'Collapse browser', null, GP.Input.prettyAction('ui.spawnMenu'));
    els.collapse = collapse;
    const head = h('div', { class: 'spawn-head' }, h('div', { class: 'search' }, h('span', { html: ICONS.search }), input), collapse);
    const cats = h('div', { class: 'cats' });
    els.catBtns = {};
    const saved = GP.Settings.play.spawnCategory;
    if (saved === FAV || GP.Registry.categories.some((c) => c.id === saved)) category = saved;
    for (const c of [{ id: FAV, icon: 'star', desc: 'The items you starred. Hover an item and click its star (or right-click it) to add it here.' }].concat(GP.Registry.categories)) {
      const b = h('button', { class: 'cat', html: ICONS[c.icon] || ICONS.crate, onclick: () => {
        category = c.id; search = ''; input.value = ''; renderGrid(); GP.Audio.play('click', { f: 1600 });
        GP.Settings.play.spawnCategory = c.id; GP.Settings.save();
      } });
      tooltip(b, c.id, c.desc);
      els.catBtns[c.id] = b;
      cats.appendChild(b);
    }
    els.spawnTitle = h('div', { class: 'spawn-title' });
    els.recent = h('div', { class: 'recent' });
    els.grid = h('div', { class: 'grid scroll' });
    els.grid.style.flex = '1';
    const main = h('div', { class: 'spawn-main' }, els.spawnTitle, els.recent, els.grid);
    panel.appendChild(h('div', { class: 'spawn-main', style: { flex: '0 0 auto' } }, head));
    panel.appendChild(h('div', { class: 'spawn-body' }, cats, main));
    els.spawn = panel;
    return panel;
  }

  const thumbQueue = [];
  let thumbBusy = false;
  function queueThumb(canvas, id) {
    thumbQueue.push({ canvas, id });
    if (!thumbBusy) { thumbBusy = true; requestAnimationFrame(pumpThumbs); }
  }
  function pumpThumbs() {
    const t0 = performance.now();
    while (thumbQueue.length && performance.now() - t0 < 10) {
      const { canvas, id } = thumbQueue.shift();
      if (!canvas.isConnected) continue;
      const th = GP.Icons.thumb(id);
      if (th) { const c = canvas.getContext('2d'); c.imageSmoothingQuality = 'high'; c.clearRect(0, 0, canvas.width, canvas.height); c.drawImage(th, 0, 0, canvas.width, canvas.height); }
    }
    if (thumbQueue.length) requestAnimationFrame(pumpThumbs); else thumbBusy = false;
  }

  function renderGrid() {
    const grid = els.grid;
    grid.innerHTML = '';
    for (const [id, b] of Object.entries(els.catBtns)) b.classList.toggle('active', !search && id === category);
    let list, title;
    if (search.trim()) { list = GP.Registry.search(search); title = `Search: ${list.length} result${list.length === 1 ? '' : 's'}`; }
    else if (category === FAV) { list = favorites().map((id) => GP.Registry.get(id)).filter((d) => d && !d.hidden); title = FAV; }
    else { list = GP.Registry.list(category); title = category; }
    els.spawnTitle.innerHTML = '';
    els.spawnTitle.appendChild(h('span', { class: 'n', text: title }));
    els.spawnTitle.appendChild(h('span', { class: 'label', text: search ? '' : list.length + (list.length === 1 ? ' item' : ' items') }));
    if (!list.length) {
      const msg = !search && category === FAV ? 'No favorites yet. Hover any item and click its ☆ star to keep it here.' : 'Nothing found. Try "saber", "droid", "walker"...';
      grid.appendChild(h('div', { class: 'empty', style: { gridColumn: '1/-1' }, text: msg }));
      return;
    }
    let lastSub = null;
    const sorted = search ? list : list.slice().sort((a, b) => (a.sub || '').localeCompare(b.sub || '') || 0);
    if (!search) {
      // keep definition order inside each subgroup
      const subs = [];
      for (const d of list) if (!subs.includes(d.sub || '')) subs.push(d.sub || '');
      sorted.sort((a, b) => subs.indexOf(a.sub || '') - subs.indexOf(b.sub || '') || list.indexOf(a) - list.indexOf(b));
    }
    for (const d of sorted) {
      if (!search && d.sub && d.sub !== lastSub) { grid.appendChild(h('div', { class: 'subhead', text: d.sub })); lastSub = d.sub; }
      const dpr = Math.max(1, window.devicePixelRatio || 1);
      const cv = h('canvas', { width: Math.round(GP.Icons.W * dpr), height: Math.round(GP.Icons.H * dpr) });
      const picked = game.tools.placing && game.tools.placing.def.id === d.id;
      const item = h('button', { class: 'item' + (picked ? ' sel' : ''), draggable: 'false', onclick: () => { game.tools.startPlacing(d.id); markSelected(item); GP.Audio.play('click', { f: 1300 }); } },
        cv, h('div', { class: 'nm', text: d.name }), search ? h('div', { class: 'sub', text: d.category + (d.sub ? ' · ' + d.sub : '') }) : null);
      item.addEventListener('dragstart', (e) => e.preventDefault());   // spawning is Q / E only
      const person = d.kind === 'character';
      tooltip(item, d.name, (d.desc || '') + (d.desc ? ' ' : '') + 'Pick it, then point at the world, hold Q or E to see where it goes (facing left or right) and let go to spawn it. '
        + (person ? 'Right-click to pick them armed with their usual weapons.' : 'Right-click to star it as a favorite.'));
      item.dataset.id = d.id;
      const isFav = favorites().includes(d.id);
      const star = h('span', { class: 'itemfav' + (isFav ? ' on' : ''), text: isFav ? '★' : '☆', title: isFav ? 'Remove from favorites' : 'Add to favorites', onclick: (ev) => { ev.stopPropagation(); toggleFavorite(d); } });
      item.appendChild(star);
      // right-click: people are picked armed; anything else is starred
      item.addEventListener('contextmenu', (ev) => {
        ev.preventDefault();
        if (!person) { toggleFavorite(d); return; }
        game.tools.startPlacing(d.id, true); markSelected(item); GP.Audio.play('click', { f: 1600 });
        toast(d.name + ' picked armed. Hold Q / E and let go to spawn.', 'ok', 2200);
      });
      if (d.user) {
        const del = h('span', { class: 'itemdel', text: '×', title: 'Delete this contraption', onclick: (ev) => { ev.stopPropagation(); GP.Contraptions.removeUser(d.id); toast('Deleted contraption ' + d.name + '.', 'ok'); } });
        item.appendChild(del);
      }
      grid.appendChild(item);
      queueThumb(cv, d.id);
    }
  }
  function favorites() { const f = GP.Settings.play.favorites; return Array.isArray(f) ? f : []; }
  function toggleFavorite(d) {
    const list = favorites().slice();
    const i = list.indexOf(d.id);
    if (i >= 0) list.splice(i, 1); else list.push(d.id);
    GP.Settings.play.favorites = list;
    GP.Settings.save();
    GP.Audio.play('click', { f: i >= 0 ? 900 : 1700 });
    toast(i >= 0 ? d.name + ' removed from favorites.' : d.name + ' added to favorites (the ★ category).', 'ok', 2200);
    const top = els.grid.scrollTop;
    renderGrid();
    els.grid.scrollTop = top;
  }
  function markSelected(item) { for (const el of els.grid.querySelectorAll('.item.sel')) el.classList.remove('sel'); if (item) item.classList.add('sel'); }
  function renderRecent(list) {
    els.recent.innerHTML = '';
    if (!list || !list.length) return;
    els.recent.appendChild(h('span', { class: 'label', style: { alignSelf: 'center', marginRight: '2px' }, text: 'Recent' }));
    for (const id of list) {
      const d = GP.Registry.get(id); if (!d) continue;
      els.recent.appendChild(h('span', { class: 'chip', text: d.name, onclick: () => game.tools.startPlacing(id) }));
    }
  }
  function toggleSpawn(force) {
    const c = force != null ? !force : !els.spawn.classList.contains('collapsed');
    els.spawn.classList.toggle('collapsed', c);
    els.collapse.innerHTML = c ? ICONS.chevR : ICONS.chev;
  }

  function refreshTool() {
    const id = game.tools.current;
    for (const [k, b] of Object.entries(els.toolBtns)) b.classList.toggle('active', k === id);
    const T = game.tools.tool();
    const o = els.toolopts;
    o.innerHTML = '';
    o.appendChild(h('span', { class: 'name', text: T.name }));
    for (const opt of T.options || []) {
      const seg = h('span', { class: 'seg' });
      for (const [v, label] of opt.choices) {
        const b = h('button', { class: game.tools.opts[opt.key] === v ? 'on' : '', text: label, onclick: () => {
          game.tools.opts[opt.key] = v; refreshTool(); GP.Audio.play('click', {});
          GP.Settings.play.toolOpts = Object.assign({}, GP.Settings.play.toolOpts, { [opt.key]: v }); GP.Settings.save();   // remembered next time
        } });
        seg.appendChild(b);
      }
      o.appendChild(h('span', { class: 'label', text: opt.label }));
      o.appendChild(seg);
    }
    if (id === 'props' && game.tools.selected) openInspector(game.tools.selected);
  }

  /* ---------------- inspector ---------------- */
  function fmt(v) { return typeof v === 'number' ? (Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 10 ? v.toFixed(1) : v.toFixed(2)) : String(v); }
  function openInspector(e) {
    inspectorTarget = e;
    const p = els.inspector;
    p.innerHTML = '';
    if (!e || e.removed) { p.classList.add('hidden'); return; }
    els.world.classList.add('hidden');
    p.classList.remove('hidden');
    const def = e.def;
    const head = h('div', { class: 'insp-head' },
      h('div', { style: { flex: '1' } }, h('div', { class: 'n', text: e.name }), h('div', { class: 'd', text: (def.category || '') + (def.sub ? ' · ' + def.sub : '') + (e.team && e.team !== 'neutral' ? ' · ' + GP.Teams.name(e.team) : '') })),
      h('button', { class: 'collapse-btn', html: ICONS.close, onclick: () => { game.tools.select(null); } }));
    p.appendChild(head);
    const body = h('div', { class: 'insp-body scroll', style: { maxHeight: 'calc(100vh - 210px)' } });
    inspectorRows = [];
    let props = [];
    try { props = e.getProperties(); } catch (err) { console.error(err); }
    const buttons = [];
    for (const pr of props) {
      if (pr.type === 'sep') { body.appendChild(h('div', { style: { height: '8px' } })); continue; }
      if (pr.type === 'button') { buttons.push(h('button', { class: 'btn small', text: pr.label, onclick: () => { pr.action(); GP.Audio.play('click', {}); setTimeout(() => openInspector(e), 30); } })); continue; }
      const row = h('div', { class: 'prop' });
      const val = h('span', { class: 'v' });
      if (pr.type === 'range') {
        const inp = h('input', { type: 'range', min: pr.min, max: pr.max, step: pr.step });
        inp.value = pr.get();
        val.textContent = fmt(+inp.value);
        inp.addEventListener('input', () => { const v = +inp.value; val.textContent = fmt(v); if (!pr.commit) pr.set(v); });
        inp.addEventListener('change', () => { if (pr.commit) pr.set(+inp.value); });
        row.append(h('span', { text: pr.label }), val, inp);
        inspectorRows.push({ pr, update: () => { if (document.activeElement !== inp) { inp.value = pr.get(); val.textContent = fmt(+pr.get()); } } });
      } else if (pr.type === 'bool') {
        const inp = h('input', { type: 'checkbox' });
        inp.checked = !!pr.get();
        inp.addEventListener('change', () => { pr.set(inp.checked); GP.Audio.play('click', {}); });
        row.append(h('span', { text: pr.label }), inp);
        inspectorRows.push({ pr, update: () => { inp.checked = !!pr.get(); } });
      } else if (pr.type === 'select') {
        const sel = h('select', null, ...pr.options.map(([v, l]) => h('option', { value: v, text: l })));
        sel.value = pr.get();
        sel.addEventListener('change', () => { pr.set(sel.value); GP.Audio.play('click', {}); openInspector(e); });
        row.append(h('span', { text: pr.label }), sel);
      } else if (pr.type === 'text') {
        const inp = h('input', { type: 'text', value: pr.get(), style: { gridColumn: '1 / -1', background: 'rgba(0,0,0,0.35)', border: '1px solid var(--line-2)', color: 'var(--text)', padding: '4px 6px', fontSize: '12px' } });
        inp.addEventListener('input', () => pr.set(inp.value));
        inp.addEventListener('keydown', (ev) => ev.stopPropagation());
        row.append(h('span', { text: pr.label }), h('span'), inp);
      } else if (pr.type === 'info') {
        const v = h('span', { class: 'v', style: { minWidth: '0' }, text: String(pr.get()) });
        row.append(h('span', { text: pr.label }), v);
        inspectorRows.push({ pr, update: () => { v.textContent = String(pr.get()); } });
      } else if (pr.type === 'meter') {
        const bar = h('i');
        row.append(h('span', { text: pr.label }), val, h('div', { class: 'meter' }, bar));
        const upd = () => { const v = GP.M.clamp(pr.get(), 0, 1); bar.style.width = (v * 100).toFixed(0) + '%'; bar.style.backgroundPosition = (v * 100) + '% 0'; val.textContent = Math.round(v * 100) + '%'; };
        upd();
        inspectorRows.push({ pr, update: upd });
      } else if (pr.type === 'swatch') {
        const sw = h('div', { class: 'swatches' });
        const draw = () => { sw.innerHTML = ''; for (const [name, c] of pr.options) { const s = h('span', { class: 'swatch' + (pr.get() === c ? ' on' : ''), style: { background: c }, title: name, onclick: () => { pr.set(c); draw(); GP.Audio.play('click', {}); } }); sw.appendChild(s); } };
        draw();
        row.append(h('span', { text: pr.label }), h('span'), sw);
      }
      body.appendChild(row);
    }
    // draw layer
    {
      const sel = h('select', null, ...[[0, 'Background'], [1, 'Vehicles'], [2, 'Characters'], [3, 'Items'], [4, 'Foreground']].map(([v, l]) => h('option', { value: v, text: l })));
      sel.value = String(Math.round(e.layer));
      sel.addEventListener('change', () => { e.layer = +sel.value; GP.Audio.play('click', {}); });
      body.appendChild(h('div', { class: 'prop' }, h('span', { text: 'Draw layer' }), sel));
    }
    // universal actions
    buttons.push(h('button', { class: 'btn small', text: 'Duplicate', onclick: () => game.tools.duplicate(e) }));
    buttons.push(h('button', { class: 'btn small', text: e.isFrozen() ? 'Unfreeze' : 'Freeze', onclick: () => { game.tools.toggleFreeze(e); openInspector(e); } }));
    if (e.isCharacterLike || e.isVehicle) buttons.push(h('button', { class: 'btn small primary', text: 'Control', onclick: () => { game.tools.setTool('control'); if (game.takeControl(e.isVehicle && e.driver() ? e.driver() : e)) toast('Controlling ' + e.name + '. Esc to release.', 'ok'); } }));
    if (e.use && !e.isCharacterLike && !e.isVehicle) buttons.push(h('button', { class: 'btn small', text: 'Activate', onclick: () => (GP.Wires ? GP.Wires.activate(e, e.game) : e.use(null)) }));
    buttons.push(h('button', { class: 'btn small danger', text: 'Delete', onclick: () => { game.tools.deleteEntity(e); } }));
    body.appendChild(h('div', { class: 'btns' }, buttons));
    p.appendChild(body);
  }

  /* ---------------- world drawer ---------------- */
  function toggleWorld() {
    if (!els.world.classList.contains('hidden')) { els.world.classList.add('hidden'); return; }
    els.inspector.classList.add('hidden');
    renderWorld();
    els.world.classList.remove('hidden');
  }
  function srow(label, control, desc) { return h('div', { class: 'prop' }, h('span', { text: label, title: desc || '' }), control); }
  function renderWorld() {
    const w = els.world;
    w.innerHTML = '';
    w.appendChild(h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } }, h('h3', { text: 'World & physics' }), h('button', { class: 'collapse-btn', html: ICONS.close, onclick: () => w.classList.add('hidden') })));
    const gval = h('span', { class: 'v', text: fmt(game.gravity.scale) + '×' });
    const g = h('input', { type: 'range', min: -1, max: 3, step: 0.05, value: game.gravity.scale });
    g.addEventListener('input', () => { game.setGravity(+g.value, game.gravity.zeroG); gval.textContent = fmt(+g.value) + '×'; });
    w.appendChild(h('div', { class: 'prop' }, h('span', { text: 'Gravity' }), gval, g));
    const zg = h('input', { type: 'checkbox' }); zg.checked = game.gravity.zeroG;
    zg.addEventListener('change', () => { game.setGravity(game.gravity.scale, zg.checked); toast(zg.checked ? 'Zero-G engaged.' : 'Gravity restored.', 'ok'); });
    w.appendChild(srow('Zero gravity', zg));
    const sm = GP.Settings.p;
    const sl = h('input', { type: 'range', min: 0.05, max: 0.8, step: 0.05, value: sm.slowMotionScale });
    const slv = h('span', { class: 'v', text: fmt(sm.slowMotionScale) + '×' });
    sl.addEventListener('input', () => { sm.slowMotionScale = +sl.value; slv.textContent = fmt(+sl.value) + '×'; GP.Settings.save(); });
    w.appendChild(h('div', { class: 'prop' }, h('span', { text: 'Slow-motion speed' }), slv, sl));
    const darkNow = game.darkness != null ? game.darkness : (game.map.darkness || 0);
    const dk = h('input', { type: 'range', min: 0, max: 0.95, step: 0.05, value: darkNow });
    const dkv = h('span', { class: 'v', text: Math.round(darkNow * 100) + '%' });
    dk.addEventListener('input', () => { game.darkness = +dk.value; dkv.textContent = Math.round(+dk.value * 100) + '%'; if (!GP.Settings.g.lighting) { GP.Settings.g.lighting = true; GP.Settings.save(); } });
    w.appendChild(h('div', { class: 'prop' }, h('span', { text: 'Darkness (lights & lamps shine through)' }), dkv, dk));
    const ai = h('input', { type: 'checkbox' }); ai.checked = GP.Settings.play.ai;
    ai.addEventListener('change', () => { GP.Settings.play.ai = ai.checked; GP.Settings.save(); toast(ai.checked ? 'AI enabled.' : 'AI off: characters won\'t fight or wander, but still react (fall, swim, flail, go limp).', 'ok'); });
    w.appendChild(srow('AI enabled', ai));
    const sleep = h('input', { type: 'checkbox' }); sleep.checked = GP.Settings.p.sleeping;
    sleep.addEventListener('change', () => { GP.Settings.p.sleeping = sleep.checked; GP.Settings.save(); game.applyPhysicsSettings(); });
    w.appendChild(srow('Object sleeping (performance)', sleep));
    const dbg = h('input', { type: 'checkbox' }); dbg.checked = GP.Settings.g.showDebug;
    dbg.addEventListener('change', () => { GP.Settings.g.showDebug = dbg.checked; GP.Settings.save(); });
    w.appendChild(srow('Physics debug view', dbg));
    const btn = (label, fn, cls = 'btn small') => h('button', { class: cls, text: label, onclick: fn });
    w.appendChild(h('div', { class: 'btns' },
      btn('Freeze all', () => { for (const e of game.entities) if (!e.isCharacterLike) e.setFrozen(true); toast('Froze all objects.', 'ok'); }),
      btn('Unfreeze all', () => { for (const e of game.entities) e.setFrozen(false); GP.Force.releaseSuspended(null); toast('Unfroze everything.', 'ok'); }),
      btn('Detonate remotes', () => { const n = GP.Remote.detonateAll(game); toast(n + ' charges detonated.', n ? 'ok' : 'warn'); }),
      btn('Save selection as contraption', () => { const l = game.tools.selectionList(); if (!l.length) toast('Select objects first (Ctrl+drag).', 'warn'); else promptSaveContraption(l); }),
      btn('Clear debris', () => { game.clearDebris(); toast('Debris cleared.', 'ok'); }),
      btn('Clear liquids', () => { GP.Fluid.clear(); toast('Liquids cleared.', 'ok'); }),
      btn('Remove dead', () => {
        const dead = game.entities.filter((e) => e.state === 'dead' || e.wrecked);
        game.tools.deleteEntities(dead);   // says how many went (Ctrl+Z brings them back)
        if (dead.length < 2) toast(dead.length ? 'Removed ' + dead[0].name + '. Ctrl+Z brings it back.' : 'No casualties or wrecks to remove.', dead.length ? 'ok' : 'warn');
      }),
      btn('Clear everything', () => { game.tools.clearAll(); toast('Scene cleared. Ctrl+Z brings it all back.', 'ok', 4000); }, 'btn small danger'),
    ));
  }

  /* ---------------- screenshot ---------------- */
  // Save what the game camera sees (the interface isn't part of the picture) as a PNG file
  function screenshot() {
    game.canvas.toBlob((blob) => {
      if (!blob) { toast('Could not take a screenshot.', 'error'); return; }
      const a = h('a', { href: URL.createObjectURL(blob), download: 'galactic-playground-' + (game.mapId || 'scene') + '-' + new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-') + '.png' });
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      const flash = h('div', { class: 'shotflash' });
      document.body.appendChild(flash);
      setTimeout(() => flash.remove(), 400);
      GP.Audio.play('click', { f: 2200 });
      toast('Screenshot saved to your downloads.', 'ok', 2200);
    }, 'image/png');
  }

  /* ---------------- time ---------------- */
  function togglePause() { game.paused = !game.paused; GP.Audio.play('click', { f: game.paused ? 700 : 1200 }); refreshTime(); GP.Events.emit('tutorial', { step: 'pause' }); }
  function toggleSlow() { game.slowMo = !game.slowMo; if (game.slowMo) game.fastFwd = false; game.paused = false; GP.Audio.play('click', {}); refreshTime(); }
  function toggleFast() { game.fastFwd = !game.fastFwd; if (game.fastFwd) game.slowMo = false; game.paused = false; GP.Audio.play('click', {}); refreshTime(); }
  function stepOnce() { game.paused = true; game.stepRequest++; refreshTime(); }
  function refreshTime() {
    els.bPause.innerHTML = game.paused ? ICONS.play : ICONS.pause;
    els.bPause.classList.toggle('active', game.paused);
    els.bSlow.classList.toggle('active', game.slowMo);
    els.bFast.classList.toggle('active', game.fastFwd);
    const f = game.paused ? 'PAUSED' : game.slowMo ? 'SLOW MOTION ' + GP.Settings.p.slowMotionScale + '×' : game.fastFwd ? 'FAST ' + GP.Settings.p.fastForwardScale + '×' : '';
    els.timeflag.textContent = f;
    els.timeflag.classList.toggle('hidden', !f);
  }
  function confirmReset() {
    openDialog('Reset scene?', h('div', { text: 'This reloads ' + game.map.name + ' in its starting state. Unsaved changes are lost.' }), [
      ['Cancel', null], ['Reset', () => { GP.Main.withLoading(GP.Maps.get(game.mapId), () => { game.resetScene(); toast('Scene reset.', 'ok'); }); }, 'primary'],
    ]);
  }

  /* ---------------- per frame ---------------- */
  function frame(dt) {
    const I = GP.Input;
    if (!game.active) return;
    if (!I.isTyping() && !overlay) {
      if (I.pressed('time.pause')) togglePause();
      if (I.pressed('time.slow')) toggleSlow();
      if (I.pressed('time.fast')) toggleFast();
      if (I.pressed('time.step')) stepOnce();
      if (I.pressed('scene.reset')) confirmReset();
      if (I.pressed('ui.spawnMenu')) toggleSpawn();
      if (I.pressed('ui.inspector')) { if (inspectorTarget) { els.inspector.classList.toggle('hidden'); } else toggleWorld(); }
      if (I.pressed('ui.search')) { toggleSpawn(true); setTimeout(() => els.search.focus(), 0); }
      if (I.pressed('ui.detail')) { GP.Settings.g.detailView = !GP.Settings.g.detailView; toast('Detail view ' + (GP.Settings.g.detailView ? 'on: limb health and integrity shown' : 'off'), 'ok'); }
      if (I.pressed('ui.thermal')) { GP.Settings.g.thermalView = !GP.Settings.g.thermalView; toast('Thermal vision ' + (GP.Settings.g.thermalView ? 'on' : 'off'), 'ok'); }
      if (ctxEl && I.pressed('ui.menu')) { closeContextMenu(); GP.Input.consume('ui.menu'); }
      if (I.pressed('ui.debug')) { GP.Settings.g.showDebug = !GP.Settings.g.showDebug; GP.Settings.save(); toast('Debug view ' + (GP.Settings.g.showDebug ? 'on' : 'off'), 'ok'); }
      if (I.pressed('ui.hideHud')) { hudHidden = !hudHidden; els.hud.classList.toggle('hidden', hudHidden); }
      if (I.pressed('ui.screenshot')) screenshot();
      if (I.pressed('ui.save')) openSaves('save');
      if (I.pressed('ui.load')) openSaves('load');
      if (I.pressed('ui.menu') && !(game.controlled && game.tools.current === 'control')) { if (game.tools.placing) game.tools.cancelPlacing(); else if (game.tools.selected) game.tools.select(null); else openPause(); }
    } else if (overlay && I.pressed('ui.menu')) closeOverlay();
    statusT -= dt;
    if (statusT <= 0) { statusT = 0.25; renderStatus(); for (const r of inspectorRows) r.update(); }
    renderHint();
    renderControlHud();
  }
  function renderStatus() {
    const st = game.world.stats;
    const fps = game.perf.fps;
    els.status.innerHTML = '';
    const add = (label, v, warn) => els.status.appendChild(h('span', { class: warn ? 'warn' : '' }, label + ' ', h('b', { text: String(v) })));
    if (GP.Settings.g.showFps) add('FPS', Math.round(fps), fps < 30);
    add('Objects', game.entities.length);
    add('Bodies', st.bodies + '/' + GP.Settings.p.maxBodies, st.bodies > GP.Settings.p.maxBodies * 0.9);
    add('Awake', st.awake);
    add('Physics', game.perf.phys.toFixed(1) + 'ms', game.perf.phys > 16);
    add('FX', GP.FX.count());
    if (GP.Fluid && GP.Fluid.count()) add('Liquid', GP.Fluid.count() + '/' + GP.Settings.p.maxFluid, GP.Fluid.count() >= GP.Settings.p.maxFluid);
    if (GP.Projectiles.count()) add('Bolts', GP.Projectiles.count());
    if (game.tools.selection.size) add('Selected', game.tools.selection.size);
    if (GP.Settings.g.detailView) add('Detail', 'on');
    if (GP.Settings.g.thermalView) add('Thermal', 'on');
  }
  let lastHint = '';
  function renderHint() {
    const t = game.tools;
    let s;
    if (game.controlled && t.current === 'control') s = '';
    else s = t.tool().hint ? t.tool().hint() : '';
    if (t.placing && !(game.controlled && t.current === 'control')) s = (s ? s + ' · ' : '') + `<b>Hold Q / E</b> to spawn ${t.placing.armed ? 'an armed ' : ''}${t.placing.def.name} facing left / right`;
    if (s !== lastHint) { lastHint = s; els.hint.innerHTML = s; els.hint.classList.toggle('hidden', !s); }
  }
  let chudKey = '';
  function renderControlHud() {
    const c = game.controlled;
    const show = !!c && game.tools.current === 'control' && !c.removed;
    els.controlhud.classList.toggle('hidden', !show);
    if (!show) { chudKey = ''; return; }
    const K = (a) => GP.Input.prettyAction(a);
    const veh = c.isVehicle ? c : (c.vehicle && c.vehicle.isVehicle ? c.vehicle : null);
    const hp = c.healthFraction ? c.healthFraction() : 1;
    const main = c.mainItem ? c.mainItem() : null;
    const P = c.stats && c.stats.force ? c.stats.force.powers : null;
    const power = P ? P[(game.powerIndex || 0) % P.length] : null;
    const key = [c.id, Math.round(hp * 50), main ? main.id + ':' + (main.ammo != null ? main.ammo : '') + (main.reloadT > 0 ? 'r' : '') : '', power, veh ? veh.id + ':' + Math.round(veh.hp / veh.maxHp * 50) : ''].join('|');
    if (key === chudKey) return;
    chudKey = key;
    const el = els.controlhud;
    el.innerHTML = '';
    const bar = h('div', { class: 'bar' }, h('i', { style: { width: (hp * 100).toFixed(0) + '%', background: hp > 0.5 ? 'var(--green)' : hp > 0.25 ? 'var(--amber)' : 'var(--red)' } }));
    el.appendChild(h('div', null, h('div', { class: 'who', text: c.name }), h('div', { class: 'team', text: GP.Teams.name(c.team) }), bar));
    if (veh) {
      const vb = h('div', { class: 'bar' }, h('i', { style: { width: (veh.hp / veh.maxHp * 100).toFixed(0) + '%', background: 'var(--cyan)' } }));
      el.appendChild(h('div', null, h('div', { class: 'team', text: veh.name }), vb));
      const flyer = veh.def.controller === 'flyer';
      el.appendChild(h('div', { class: 'keys', html: flyer
        ? `<span class="kbd">${K('ctl.left')}</span><span class="kbd">${K('ctl.right')}</span> pitch · <span class="kbd">${K('ctl.jump')}</span> thrust · <span class="kbd">${K('ctl.crouch')}</span> brake · <span class="kbd">${K('ctl.run')}</span> boost<br>LMB fire · RMB secondary · <span class="kbd">${K('ctl.interact')}</span> exit`
        : `<span class="kbd">${K('ctl.left')}</span><span class="kbd">${K('ctl.right')}</span> drive · <span class="kbd">${K('ctl.jump')}</span> up · <span class="kbd">${K('ctl.crouch')}</span> down · <span class="kbd">${K('ctl.run')}</span> boost<br>LMB fire · RMB secondary · <span class="kbd">${K('ctl.interact')}</span> exit` }));
    } else {
      let w = 'Unarmed (LMB punches)';
      if (main) w = main.name + (main.isBlaster ? ` · ${main.reloadT > 0 ? 'reloading' : main.ammo + '/' + main.stats.mag}` : '');
      el.appendChild(h('div', null, h('div', { class: 'team', text: 'Equipped' }), h('div', { style: { fontSize: '12px' }, text: w })));
      if (power) el.appendChild(h('div', null, h('div', { class: 'team', text: 'Force power' }), h('div', { class: 'power', text: power.toUpperCase() })));
      el.appendChild(h('div', { class: 'keys', html: `<span class="kbd">${K('ctl.left')}</span><span class="kbd">${K('ctl.right')}</span> move · <span class="kbd">${K('ctl.jump')}</span> jump · <span class="kbd">${K('ctl.run')}</span> run · LMB attack · RMB ${power ? 'Force' : 'block'}<br><span class="kbd">${K('ctl.interact')}</span> pick up / enter · <span class="kbd">${K('ctl.drop')}</span> throw · <span class="kbd">${K('ctl.saber')}</span> saber · ${power ? `<span class="kbd">${K('ctl.nextPower')}</span> next power · ` : ''}<span class="kbd">Esc</span> release` }));
    }
  }

  /* ---------------- overlays ---------------- */
  function closeOverlay() {
    if (!overlay) return;
    overlay.remove();
    overlay = null;
    if (game.active && overlayPausedGame) { game.paused = false; overlayPausedGame = false; refreshTime(); }
  }
  let overlayPausedGame = false;
  function showOverlay(el, pauseGame = true, cls = '') {
    closeOverlay();
    overlay = h('div', { class: 'overlay ' + cls }, el);
    overlay.addEventListener('mousedown', (e) => { if (e.target === overlay && game.active) closeOverlay(); });
    els.overlayHost.appendChild(overlay);
    if (pauseGame && game.active && !game.paused) { game.paused = true; overlayPausedGame = true; refreshTime(); }
    return overlay;
  }
  function openDialog(title, body, buttons) {
    const foot = h('div', { class: 'df' });
    for (const [label, fn, cls] of buttons) foot.appendChild(h('button', { class: 'btn ' + (cls || ''), text: label, onclick: () => { closeOverlay(); if (fn) fn(); } }));
    showOverlay(h('div', { class: 'dialog panel', style: { width: 'min(460px, calc(100vw - 32px))' } }, h('div', { class: 'dh' }, h('h2', { text: title })), h('div', { class: 'db' }, body), foot));
  }

  function openPause() {
    const box = h('div', { class: 'pausebox panel' },
      h('h2', { text: 'PAUSED' }),
      h('button', { class: 'btn primary', text: 'Resume', onclick: () => closeOverlay() }),
      h('button', { class: 'btn', text: 'Save scene', onclick: () => openSaves('save') }),
      h('button', { class: 'btn', text: 'Load scene', onclick: () => openSaves('load') }),
      h('button', { class: 'btn', text: 'Change sandbox', onclick: () => openMaps() }),
      h('button', { class: 'btn', text: 'Settings', onclick: () => openSettings('graphics') }),
      h('button', { class: 'btn', text: 'Mods', onclick: () => openMods() }),
      h('button', { class: 'btn', text: 'Controls', onclick: () => openSettings('controls') }),
      h('button', { class: 'btn', text: 'Tutorial', onclick: () => { closeOverlay(); startTutorial(); } }),
      h('button', { class: 'btn danger', text: 'Main menu', onclick: () => { closeOverlay(); GP.Main.toMenu(); } }),
    );
    showOverlay(box);
  }

  function openMaps(fromMenu) {
    const grid = h('div', { class: 'maps' });
    for (const m of GP.Maps.list()) {
      const card = h('button', { class: 'mapcard', onclick: () => { closeOverlay(); GP.Main.startSandbox(m.id); } },
        GP.Maps.thumbnail(m, 400, 208), h('div', { class: 'mn', text: m.name }), h('div', { class: 'md', text: m.desc }),
        h('div', { class: 'mt', text: [m.zeroG ? 'Zero-G' : 'Gravity', m.darkness > 0.3 ? 'Dark' : null, m.weather ? m.weather.type : null, m.liquids ? (m.liquids === 'lava' ? 'Lava' : 'Water') : null].filter(Boolean).join(' · ') }));
      grid.appendChild(card);
    }
    const emptyToggle = h('input', { type: 'checkbox' });
    emptyToggle.checked = !!GP.Settings.play.startEmpty;
    emptyToggle.addEventListener('change', () => { GP.Settings.play.startEmpty = emptyToggle.checked; GP.Settings.save(); });
    const dlg = h('div', { class: 'dialog panel' },
      h('div', { class: 'dh' }, h('h2', { text: 'Choose a sandbox' }), h('button', { class: 'btn small', text: fromMenu ? 'Back' : 'Close', onclick: () => { closeOverlay(); if (fromMenu) GP.Main.showMenu(); } })),
      h('div', { class: 'db scroll' }, grid),
      h('div', { class: 'df', style: { justifyContent: 'space-between' } }, h('label', { style: { fontSize: '12px', color: 'var(--muted)', display: 'flex', gap: '6px', alignItems: 'center' } }, emptyToggle, 'Start empty (no starting props)')));
    GP.Main.startEmpty = () => emptyToggle.checked;
    showOverlay(dlg, false);
  }

  /* ---------------- liquid quality ---------------- */
  function askLiquidQuality(def, go) {
    const S = GP.Settings, cur = S.p.liquidQuality || 'medium';
    const kind = def.liquids === 'lava' ? 'lava' : 'water';
    const dont = h('input', { type: 'checkbox' });
    const choose = (v) => { closeOverlay(); S.p.liquidQuality = v; if (dont.checked) S.p.askLiquid = false; S.save(); go(); };
    const notes = { off: 'Still ' + kind + ', no flowing. Fastest.', verylow: 'Big chunky drops. For slow computers.', low: 'Chunky but lively.', medium: 'Balanced (default).', high: 'Fine drops. Needs a fast computer.', veryhigh: 'Finest drops. Needs a very fast computer.' };
    const list = h('div', { class: 'qlist' });
    const levels = [['off', 'Off']].concat(Object.entries(GP.Fluid.LEVELS).map(([k, l]) => [k, l.label]));
    for (const [v, label] of levels) {
      const n = v === 'off' ? '' : '~' + GP.Fluid.LEVELS[v].budget.toLocaleString() + ' particles';
      list.appendChild(h('button', { class: 'btn qbtn' + (v === cur ? ' primary' : ''), onclick: () => choose(v) },
        h('b', { text: label }), h('span', { class: 'qn', text: notes[v] }), h('span', { class: 'qc', text: n })));
    }
    const body = h('div', null,
      h('div', { class: 'qintro', text: def.name + ' has ' + kind + '. How detailed should its liquid physics be? Higher settings flow and splash more finely but need a faster computer.' }),
      list,
      h('label', { class: 'qdont' }, dont, "Don't ask again (change it any time in Settings → Physics)"));
    openDialog('Liquid physics', body, [['Back', () => openMaps(!game.active)]]);
  }

  /* ---------------- saves ---------------- */
  function openSaves(mode) {
    const body = h('div', { class: 'db scroll' });
    const render = () => {
      body.innerHTML = '';
      if (mode === 'save' && game.active) {
        const name = h('input', { type: 'text', placeholder: 'Scene name', value: game.map ? game.map.name + ' ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '' });
        name.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') doSave(); });
        const doSave = () => { try { GP.SaveSystem.save(game, name.value.trim()); toast('Scene saved.', 'ok'); render(); } catch (e) { toast(e.message, 'error'); } };
        body.appendChild(h('div', { class: 'save-new' }, name, h('button', { class: 'btn primary', text: 'Save new', onclick: doSave })));
      }
      const list = GP.SaveSystem.list();
      const autos = mode === 'load' ? GP.SaveSystem.autosaves() : [];
      if (!list.length && !autos.length) body.appendChild(h('div', { class: 'empty', text: 'No saved scenes yet.' }));
      const grid = h('div', { class: 'saves' });
      // autosaves come first, marked apart from the player's own saves
      for (const s of autos) {
        grid.appendChild(h('div', { class: 'savecard auto' },
          s.thumb ? h('img', { src: s.thumb, alt: '' }) : h('div', { style: { height: '100px', background: '#000' } }),
          h('div', { class: 'sn', text: s.name }),
          h('div', { class: 'sm', text: ago(s.date) + ' · ' + GP.Maps.get(s.map).name + ' · ' + s.count + ' objects' }),
          h('div', { class: 'sb' },
            h('button', { class: 'btn small primary', text: 'Load', onclick: () => restoreAutosave(s) }),
            h('button', { class: 'btn small danger', text: 'Delete', onclick: () => { GP.SaveSystem.dropAutosave(s.slot); render(); } }))));
      }
      for (const s of list) {
        const card = h('div', { class: 'savecard' },
          s.thumb ? h('img', { src: s.thumb, alt: '' }) : h('div', { style: { height: '100px', background: '#000' } }),
          h('div', { class: 'sn', text: s.name }),
          h('div', { class: 'sm', text: new Date(s.date).toLocaleString() + ' · ' + (GP.Maps.get(s.map) ? GP.Maps.get(s.map).name : s.map) + ' · ' + s.count + ' objects' }),
          h('div', { class: 'sb' },
            h('button', { class: 'btn small primary', text: 'Load', onclick: () => {
              try { if (!game.active) GP.Main.enterSandboxShell(); const r = GP.SaveSystem.loadSlot(game, s.id); closeOverlay(); game.paused = false; refreshTime(); onMapLoaded(); toast(`Loaded "${s.name}" (${r.count} objects${r.missing ? ', ' + r.missing + ' skipped' : ''}).`, 'ok'); } catch (e) { toast('Load failed: ' + e.message, 'error'); }
            } }),
            mode === 'save' && game.active ? h('button', { class: 'btn small', text: 'Overwrite', onclick: () => {
              try { GP.SaveSystem.overwrite(game, s.id); toast('Saved over "' + s.name + '".', 'ok'); } catch (e) { toast('Browser storage is full. Delete old saves or use Export to file.', 'error'); }
              render();
            } }) : null,
            h('button', { class: 'btn small danger', text: 'Delete', onclick: () => { GP.SaveSystem.remove(s.id); render(); } })));
        grid.appendChild(card);
      }
      body.appendChild(grid);
    };
    render();
    const file = h('input', { type: 'file', accept: '.json,.txt,application/json,text/plain', class: 'hidden' });
    file.addEventListener('change', async () => {
      const f = file.files[0]; if (!f) return;
      try { if (!game.active) ensureSandbox(); afterImport(await GP.Share.importFile(game, f)); } catch (e) { toast('Import failed: ' + e.message, 'error'); }
    });
    const foot = h('div', { class: 'df' },
      file,
      h('button', { class: 'btn', text: 'Import file…', onclick: () => file.click() }),
      game.active ? h('button', { class: 'btn', text: 'Export to file', onclick: () => { GP.SaveSystem.exportFile(game); toast('Scene exported.', 'ok'); } }) : null,
      h('button', { class: 'btn', text: 'Paste code…', onclick: () => openImportCode() }),
      game.active ? h('button', { class: 'btn', text: 'Share code', onclick: () => showShareCode('Share scene', 'the whole scene: map, objects, welds, wires and liquid', () => GP.Share.sceneCode(game), () => GP.SaveSystem.exportFile(game)) }) : null,
      h('button', { class: 'btn', text: 'Close', onclick: () => { closeOverlay(); if (!game.active) GP.Main.showMenu(); } }));
    showOverlay(h('div', { class: 'dialog panel' }, h('div', { class: 'dh' }, h('h2', { text: mode === 'save' ? 'Save scene' : 'Load scene' })), body, foot));
  }

  function ago(t) {
    const s = (Date.now() - t) / 1000;
    if (s < 60) return 'Just now';
    if (s < 3600) return Math.round(s / 60) + ' min ago';
    if (s < 86400) return Math.round(s / 3600) + ' h ago';
    return new Date(t).toLocaleString();
  }
  function restoreAutosave(s) {
    try {
      if (!game.active) GP.Main.enterSandboxShell();
      const r = GP.SaveSystem.loadAutosave(game, s.slot);
      closeOverlay(); game.paused = false; refreshTime(); onMapLoaded();
      toast('Back where you were on ' + GP.Maps.get(s.map).name + ' (' + r.count + ' objects).', 'ok');
    } catch (e) { toast('Could not restore: ' + e.message, 'error'); }
  }

  /* ---------------- settings ---------------- */
  function openSettings(tab) {
    const S = GP.Settings;
    const content = h('div', { class: 'db scroll', style: { minHeight: '320px' } });
    const tabs = h('div', { class: 'tabs' });
    const TABS = [['graphics', 'Graphics'], ['audio', 'Audio'], ['physics', 'Physics'], ['gameplay', 'Gameplay'], ['controls', 'Controls']];
    const row = (label, desc, control) => h('div', { class: 'srow' }, h('div', null, h('div', { text: label }), desc ? h('div', { class: 'sd', text: desc }) : null), h('div', { class: 'ctl' }, control));
    const slider = (obj, key, min, max, step, onChange, fmtFn = fmt) => {
      const v = h('span', { class: 'v', text: fmtFn(obj[key]) });
      const i = h('input', { type: 'range', min, max, step, value: obj[key] });
      i.addEventListener('input', () => { obj[key] = +i.value; v.textContent = fmtFn(+i.value); S.save(); if (onChange) onChange(); });
      return h('span', { style: { display: 'flex', gap: '8px', alignItems: 'center', width: '100%' } }, i, v);
    };
    const check = (obj, key, onChange) => { const c = h('input', { type: 'checkbox' }); c.checked = !!obj[key]; c.addEventListener('change', () => { obj[key] = c.checked; S.save(); if (onChange) onChange(); }); return c; };
    const select = (obj, key, options, onChange) => { const s = h('select', null, ...options.map(([v, l]) => h('option', { value: v, text: l }))); s.value = obj[key]; s.addEventListener('change', () => { obj[key] = isNaN(+s.value) || s.value === '' ? s.value : +s.value; S.save(); if (onChange) onChange(); }); return s; };
    const pct = (v) => Math.round(v * 100) + '%';
    const show = (t) => {
      for (const b of tabs.children) b.classList.toggle('on', b.dataset.t === t);
      content.innerHTML = '';
      const G = S.g, P = S.p, A = S.a, Q = S.play;
      if (t === 'graphics') {
        content.append(
          row('Particle quality', 'Sparks, smoke, debris and weather density.', select(G, 'particleQuality', [['low', 'Low'], ['medium', 'Medium'], ['high', 'High']])),
          row('Resolution scale', 'Lower for better performance on large screens.', select(G, 'resolutionScale', [[0.5, '50%'], [0.75, '75%'], [1, '100%']])),
          row('Glow effects', 'Lightsaber and energy bloom.', check(G, 'glow')),
          row('Dynamic lighting', 'Darker maps lit by blades, bolts and explosions.', check(G, 'lighting')),
          row('Contact shadows', 'Soft shadows under characters, droids, vehicles and objects.', check(G, 'shadows')),
          row('Vignette', 'Gently darkened screen edges.', check(G, 'vignette')),
          row('Scorch marks & decals', null, check(G, 'decals')),
          row('Capes & cloth', 'Applies to newly spawned characters.', check(G, 'capes')),
          row('Screen shake', null, check(G, 'screenShake')),
          row('Show FPS', null, check(G, 'showFps')),
          row('Physics debug view', 'Collision shapes, joints, contacts, sleeping bodies (F3).', check(G, 'showDebug')));
      } else if (t === 'audio') {
        content.append(
          row('Master volume', null, slider(A, 'master', 0, 1, 0.05, () => GP.Audio.applyVolumes(), pct)),
          row('Effects', 'Weapons, impacts, sabers, engines.', slider(A, 'sfx', 0, 1, 0.05, () => GP.Audio.applyVolumes(), pct)),
          row('Ambience', 'Map atmosphere.', slider(A, 'ambience', 0, 1, 0.05, () => GP.Audio.applyVolumes(), pct)),
          row('Interface', null, slider(A, 'ui', 0, 1, 0.05, () => GP.Audio.applyVolumes(), pct)),
          row('Mute all', null, check(A, 'muted', () => GP.Audio.applyVolumes())));
      } else if (t === 'physics') {
        const fluidSlider = slider(P, 'maxFluid', 200, 6000, 100, null, (v) => v.toLocaleString());
        const fluidRow = row('Extra liquid limit', 'Water and lava particles you can pour, on top of a map\'s own lakes. Lower it if pouring slows the game down.', fluidSlider);
        // Danger zone: any liquid limit up to the engine's maximum, kept apart and in red
        const dangerLiquid = () => {
          const MAX = GP.Fluid.MAX_EXTRA;
          const num = h('input', { type: 'number', min: 0, max: MAX, step: 100, value: P.maxFluid });
          const rng = h('input', { type: 'range', min: 0, max: MAX, step: 500, value: P.maxFluid });
          const setLimit = (v, from) => {
            v = Math.round(GP.M.clamp(+v || 0, 0, MAX));
            P.maxFluid = v; S.save();
            if (from !== num) num.value = v;
            if (from !== rng) rng.value = v;
            fluidSlider.querySelector('input').value = v;
            fluidSlider.querySelector('.v').textContent = v.toLocaleString();
          };
          num.addEventListener('change', () => setLimit(num.value, num));
          rng.addEventListener('input', () => setLimit(rng.value, rng));
          return h('div', { class: 'danger-zone' },
            h('div', { class: 'dz-h', text: '⚠ Danger zone' }),
            row('Liquid limit override', 'Set the extra liquid limit to anything from 0 to ' + MAX.toLocaleString() + '. Tens of thousands of particles will make the game crawl, and hundreds of thousands use hundreds of MB of memory and can freeze or crash the tab. Save your scene first.',
              h('span', { style: { display: 'flex', flexDirection: 'column', gap: '6px', width: '100%' } }, num, rng)));
        };
        content.append(
          row('Sub-steps per frame', 'Higher is more stable for ragdolls and stacks; costs CPU.', slider(P, 'substeps', 1, 8, 1, () => game.applyPhysicsSettings(), (v) => String(v))),
          row('Velocity iterations', null, slider(P, 'velocityIterations', 2, 16, 1, () => game.applyPhysicsSettings(), (v) => String(v))),
          row('Position iterations', null, slider(P, 'positionIterations', 0, 6, 1, () => game.applyPhysicsSettings(), (v) => String(v))),
          row('Object sleeping', 'Resting objects stop simulating until disturbed.', check(P, 'sleeping', () => game.applyPhysicsSettings())),
          row('Body limit', 'Maximum simultaneous physics bodies.', slider(P, 'maxBodies', 200, 4000, 100, null, (v) => String(v))),
          row('Debris limit', 'Short-lived explosion fragments.', slider(P, 'maxDebris', 0, 400, 10, null, (v) => String(v))),
          row('Liquid physics', 'How detailed flowing water and lava are, from very low (big drops, fastest) to very high. Off keeps map lakes and rivers still. Applies the next time a map loads, or when you reset the scene.', select(P, 'liquidQuality', [['off', 'Off (still liquid)'], ...Object.entries(GP.Fluid.LEVELS).map(([k, l]) => [k, l.label])])),
          row('Ask when entering a map with liquid', null, check(P, 'askLiquid')),
          row('Liquid on a separate thread', 'Simulates liquid in the background so big lakes don\'t slow the rest of the game down. The liquid then runs one frame behind. Turn off if liquid misbehaves.', check(P, 'liquidThread')),
          fluidRow,
          row('Slow-motion speed', null, slider(P, 'slowMotionScale', 0.05, 0.8, 0.05, null, (v) => v.toFixed(2) + '×')),
          row('Fast-forward speed', null, slider(P, 'fastForwardScale', 1.25, 4, 0.25, null, (v) => v.toFixed(2) + '×')),
          row('Automatic performance safeguards', 'Lowers quality automatically if the simulation falls behind.', check(P, 'autoSafeguard')),
          dangerLiquid());
      } else if (t === 'gameplay') {
        content.append(
          row('AI enabled', 'When off, characters don\'t fight or wander on their own. They still react: they stumble and fall, swim and struggle in water, flail when burning, pass out and go limp.', check(Q, 'ai')),
          row('Dismemberment', 'Lightsabers can sever limbs. "All" lets explosions do it too.', select(Q, 'dismemberment', [['off', 'Off'], ['saber', 'Lightsabers only'], ['all', 'All damage']])),
          row('Force strength', 'Multiplier for all Force powers (tool and characters).', slider(Q, 'forceStrength', 0.2, 4, 0.1, null, (v) => v.toFixed(1) + '×')),
          row('Force range', null, slider(Q, 'forceRange', 0.3, 3, 0.1, null, (v) => v.toFixed(1) + '×')),
          row('Remove fallen after', 'Automatically clean up defeated characters (0 = never).', slider(Q, 'corpseCleanup', 0, 120, 5, null, (v) => v ? v + 's' : 'Never')),
          row('Gore multiplier', 'Blood, wounds, bleeding and blood loss. 0 turns gore off; 3× and above lets explosions and crushing tear limbs off.', slider(Q, 'gore', 0, 5, 0.25, null, (v) => v ? v.toFixed(2).replace(/\.?0+$/, '') + '×' : 'Off')),
          row('Detailed injuries', 'Internal bleeding, pain and adrenaline, shock, fading consciousness, and limbs that fail bit by bit from nerve damage and blood loss. Bacta cures it all.', check(Q, 'injuries')),
          row('Spawn characters armed', 'Off: people arrive empty-handed; put a weapon near someone and press F to hand it to them. On: they spawn with their usual weapons. Either way, right-click a person in the spawn menu to pick them armed.', check(Q, 'spawnArmed')),
          row('Blood pools', 'Bleeding leaves real, flowing blood behind (droids leak oil). Uses the liquid limit.', check(Q, 'bloodPools')),
          row('Drop items on death', null, check(Q, 'dropOnDeath')),
          row('Auto-heal wounds', 'Living characters slowly recover limb health.', check(Q, 'autoHealWounds')),
          row('Knockouts', 'Hard blows to the head can knock organics unconscious.', check(Q, 'knockouts')),
          row('Facial expressions', null, check(Q, 'expressions')),
          row('Fragility', 'Multiplier for damage from collisions and falls.', slider(Q, 'fragility', 0.2, 4, 0.1, null, (v) => v.toFixed(1) + '×')),
          row('Crush force', 'Multiplier for walker stomps and crushers.', slider(Q, 'crushForce', 0.2, 4, 0.1, null, (v) => v.toFixed(1) + '×')),
          row('Temperature simulation', 'Heat, fire spread, freezing and thermal vision (J).', check(Q, 'temperature')),
          row('Heat transfer between objects', null, check(Q, 'heatTransfer')),
          row('Temperature unit', null, select(Q, 'tempUnit', [['C', 'Celsius'], ['F', 'Fahrenheit']])),
          row('Autosave', 'Keeps your sandbox in the browser every minute and when you close the tab, plus the scene from just before a reset, map change or load. Continue on the main menu, or Load scene, brings it back.', check(Q, 'autosave')),
          row('Tooltips', null, check(Q, 'tooltips')),
          row('Show tutorial again', null, h('button', { class: 'btn small', text: 'Reset tutorial', onclick: () => { Q.tutorialDone = false; S.save(); toast('The tutorial will show next time you enter a sandbox.', 'ok'); } })));
      } else if (t === 'controls') {
        content.appendChild(h('div', { class: 'mouse-help', html: [
          '<b>Left mouse</b> — use the current tool', '<b>Right mouse</b> — object menu (or the tool\'s secondary action)',
          '<b>Mouse wheel</b> — zoom (rotates while holding an object, or while holding Q / E to spawn)', '<b>Middle drag</b> or <b>Alt+drag</b> — pan camera',
          '<b>Ctrl+drag</b> — box-select · <b>Ctrl+click</b> — add/remove one', '<b>Shift</b> while moving/rotating — snap to grid / angle',
          '<b>Spawn browser</b> — click an item, point at the world, hold <b>Q</b> / <b>E</b> and let go to spawn it facing left / right',
          '<b>Right-click</b> a spawn-browser item (or click its ☆) — star it; the ★ category lists your favorites',
        ].map((s) => `<div>${s}</div>`).join('') }));
        content.appendChild(row('Touch controls', 'On-screen buttons for phones and tablets. Pinch to zoom, drag with two fingers to pan, long-press an object for its menu. Auto shows them the first time you touch the screen.', select(S.play, 'touchControls', [['auto', 'Auto'], ['on', 'On'], ['off', 'Off']], () => GP.Touch && GP.Touch.refresh())));
        content.appendChild(row('Grid snap size', 'Used by the Move tool while holding Shift.', select(S.play, 'gridSnap', [[0.05, '5 cm'], [0.1, '10 cm'], [0.25, '25 cm'], [0.5, '50 cm'], [1, '1 m']])));
        content.appendChild(row('Angle snap step', 'Rotate tool (Shift), Q/R step rotation and placement rotation.', select(S.play, 'angleSnap', [[5, '5°'], [10, '10°'], [15, '15°'], [30, '30°'], [45, '45°'], [90, '90°']])));
        content.appendChild(row('Hover highlights', 'Outline the object under the cursor.', check(S.g, 'hoverHighlights')));
        const groups = {};
        for (const a of S.actions) (groups[a.group] = groups[a.group] || []).push(a);
        for (const [g, list] of Object.entries(groups)) {
          const box = h('div', { class: 'bindgroup' }, h('h4', { text: g }));
          for (const a of list) {
            const b = h('button', { text: GP.Input.prettyAction(a.id) });
            b.addEventListener('click', () => {
              b.textContent = 'Press a key…'; b.classList.add('wait');
              GP.Input.captureNextKey((combo) => { b.classList.remove('wait'); if (combo) { S.setBinding(a.id, combo); } b.textContent = GP.Input.prettyAction(a.id); if (els.toolBtns) buildHUDLabels(); });
            });
            box.appendChild(h('div', { class: 'bind' }, h('span', { text: a.label }), b));
          }
          content.appendChild(box);
        }
        content.appendChild(h('div', { class: 'btns', style: { marginTop: '12px' } }, h('button', { class: 'btn small', text: 'Reset all bindings', onclick: () => { S.resetBindings(); show('controls'); buildHUDLabels(); } })));
      }
    };
    for (const [id, label] of TABS) { const b = h('button', { text: label, onclick: () => show(id) }); b.dataset.t = id; tabs.appendChild(b); }
    show(tab || 'graphics');
    showOverlay(h('div', { class: 'dialog panel' }, h('div', { class: 'dh' }, h('h2', { text: 'Settings' }), h('button', { class: 'btn small', text: 'Done', onclick: () => { closeOverlay(); if (!game.active) GP.Main.showMenu(); } })), tabs, content));
  }
  function buildHUDLabels() {
    for (const id of TOOL_ORDER) { const b = els.toolBtns[id]; if (b) { const k = b.querySelector('.k'); if (k) k.textContent = GP.Input.prettyAction('tool.' + id); } }
  }

  /* ---------------- mods (js/systems/mods.js) ---------------- */
  function openMods() {
    const body = h('div', { class: 'db scroll' });
    const back = () => { closeOverlay(); if (!game.active) GP.Main.showMenu(); };
    const render = () => {
      body.innerHTML = '';
      body.appendChild(h('div', { class: 'mod-note', html: 'Add your own characters, props, weapons and vehicles. <b>JSON mods</b> are data: new variants of existing objects, or simple new props. <b>JS mods</b> are scripts that run with full access to the game: only install ones you trust. Mod items appear in their category under <i>Mods</i>. See the README for the format.' }));
      const list = GP.Mods.list();
      if (!list.length) body.appendChild(h('div', { class: 'empty', text: 'No mods installed.' }));
      for (const m of list) {
        const on = h('input', { type: 'checkbox' }); on.checked = m.enabled !== false;
        on.addEventListener('change', () => { GP.Mods.setEnabled(m.id, on.checked); if (!on.checked) toast('"' + m.name + '" switched off. Its items are hidden; reload to remove them completely.', 'ok', 4000); renderGrid(); render(); });
        body.appendChild(h('div', { class: 'modrow' + (m.error ? ' bad' : '') },
          on,
          h('div', { class: 'mi' }, h('div', { class: 'mn', text: m.name }),
            h('div', { class: 'ms', text: (m.type === 'js' ? 'Script' : 'JSON') + ' · ' + (m.enabled === false ? 'off' : m.count + ' item' + (m.count === 1 ? '' : 's')) + (m.error ? ' · error: ' + m.error : '') })),
          h('button', { class: 'btn small danger', text: 'Remove', onclick: () => { GP.Mods.remove(m.id); renderGrid(); render(); toast('Mod removed.', 'ok'); } })));
      }
    };
    const installText = (text, type, name) => {
      try {
        const r = GP.Mods.install(text, type, name);
        renderGrid(); render();
        if (r.error) toast('"' + r.name + '" installed but failed: ' + r.error, 'error', 6000);
        else toast('Installed "' + r.name + '" (' + r.count + ' item' + (r.count === 1 ? '' : 's') + ').', 'ok');
      } catch (e) { toast('Could not install: ' + e.message, 'error'); }
    };
    const file = h('input', { type: 'file', accept: '.json,.js,application/json,text/javascript', class: 'hidden' });
    file.addEventListener('change', () => {
      const f = file.files[0]; if (!f) return;
      const r = new FileReader();
      r.onload = () => installText(String(r.result), /\.js$/i.test(f.name) ? 'js' : /\.json$/i.test(f.name) ? 'json' : null, f.name.replace(/\.[^.]+$/, ''));
      r.readAsText(f);
      file.value = '';
    });
    const paste = (initial) => {
      const box = codeBox(initial || '', false);
      box.style.height = '220px';
      box.placeholder = 'Paste a JSON mod ({ "name": …, "items": [ … ] }) or a script';
      const foot = h('div', { class: 'df' },
        h('button', { class: 'btn primary', text: 'Install', onclick: () => { const t = box.value; openMods(); installText(t); } }),
        h('button', { class: 'btn', text: 'Cancel', onclick: () => openMods() }));
      showOverlay(h('div', { class: 'dialog panel', style: { width: 'min(560px, calc(100vw - 32px))' } }, h('div', { class: 'dh' }, h('h2', { text: 'Paste a mod' })), h('div', { class: 'db' }, box), foot));
      setTimeout(() => box.focus(), 30);
    };
    render();
    const foot = h('div', { class: 'df' }, file,
      h('button', { class: 'btn', text: 'Add from file…', onclick: () => file.click() }),
      h('button', { class: 'btn', text: 'Paste mod…', onclick: () => paste() }),
      h('button', { class: 'btn', text: 'Example mod…', onclick: () => paste(GP.Mods.EXAMPLE) }),
      h('button', { class: 'btn', text: 'Close', onclick: back }));
    showOverlay(h('div', { class: 'dialog panel' }, h('div', { class: 'dh' }, h('h2', { text: 'Mods' })), body, foot));
  }

  /* ---------------- main menu ---------------- */
  function openMainMenu() {
    const btn = (label, sub, fn, cls = 'btn') => h('button', { class: cls, onclick: () => { GP.Audio.ensure(); GP.Audio.play('click', {}); fn(); } }, label, h('span', { text: sub }));
    const last = GP.SaveSystem.autosaves()[0];   // pick up where you left off
    const menu = h('div', { class: 'mainmenu' },
      h('div', { class: 'logo' }, h('div', { class: 'a', text: 'GALACTIC' }), h('div', { class: 'b', text: 'PLAYGROUND' })),
      h('div', { class: 'tag', text: 'A physics sandbox set in a galaxy of Jedi, Sith, troopers and droids. Spawn anything. Break everything.' }),
      h('div', { class: 'mm-buttons' },
        last ? btn('Continue', GP.Maps.get(last.map).name + ' · ' + ago(last.date).toLowerCase(), () => restoreAutosave(last), 'btn primary') : null,
        btn('Enter sandbox', GP.Maps.list().length + ' maps', () => openMaps(true), last ? 'btn' : 'btn primary'),
        btn('Load scene', GP.SaveSystem.list().length + ' saved', () => openSaves('load')),
        btn('Settings', '', () => openSettings('graphics')),
        btn('Controls', '', () => openSettings('controls')),
        btn('Mods', GP.Mods ? GP.Mods.list().length + ' installed' : '', () => openMods()),
      ),
      h('div', { class: 'mm-foot', text: `v${GP.VERSION} · ${GP.Registry.all().filter((d) => !d.hidden).length} objects · Original physics, art and audio synthesized in your browser` }));
    showOverlay(menu, false, 'clear');
  }

  /* ---------------- tutorial ---------------- */
  const STEPS = [
    { t: 'Welcome to the playground', x: 'This quick tour takes a minute. Everything here is simulated physics: characters balance with muscles, blades cut, bolts fly. Press Next to begin, or Skip.', wait: null },
    { t: 'Spawn something', x: 'Pick a character in the <b>spawn browser</b> on the left (try Luke Skywalker), then point at the world and hold <b>E</b> (facing right) or <b>Q</b> (facing left): a hologram shows where it will stand. Let go to spawn it.', wait: 'spawn' },
    { t: 'Grab it', x: 'The <b>Grab tool (1)</b> is active. Drag a character around and let go to throw it. They will ragdoll and then get back up.', wait: 'grab' },
    { t: 'Blow something up', x: 'Select the <b>Explosion tool (−)</b> from the top bar and click near some objects.', wait: 'explode' },
    { t: 'Take control', x: 'Pick the <b>Control tool (=)</b> and click a character. Move with A/D, jump with W, attack with the left mouse button and use the Force with the right mouse button. Esc releases control.', wait: 'control' },
    { t: 'Time is yours', x: 'Press <b>Space</b> to pause, <b>T</b> for slow motion. Physics keeps responding to your tools while paused. Use the Property tool (0) to tweak anything.', wait: 'pause' },
    { t: 'You are ready', x: 'Explore the categories, try the Force tool (8), weld and rope objects together (6, 7) and save your creations (Ctrl+S). Controls are always in the ? menu.', wait: null },
  ];
  function startTutorial() { tutorialStep = 0; renderTutorial(); }
  function renderTutorial() {
    const el = els.tutorial;
    if (tutorialStep < 0 || tutorialStep >= STEPS.length) { el.classList.add('hidden'); return; }
    const s = STEPS[tutorialStep];
    el.classList.remove('hidden');
    el.innerHTML = '';
    el.append(h('div', { class: 'tn', text: `Tutorial ${tutorialStep + 1} / ${STEPS.length}` }), h('div', { class: 'tt', text: s.t }), h('div', { class: 'tx', html: s.x }),
      h('div', { class: 'tf' }, h('button', { class: 'btn small', text: 'Skip tutorial', onclick: () => endTutorial() }),
        h('span', null, s.wait ? h('span', { class: 'label', style: { marginRight: '8px' }, text: 'or do it to continue' }) : null, h('button', { class: 'btn small primary', text: tutorialStep === STEPS.length - 1 ? 'Finish' : 'Next', onclick: () => advanceTutorial() }))));
  }
  function advanceTutorial() { tutorialStep++; if (tutorialStep >= STEPS.length) endTutorial(); else renderTutorial(); GP.Audio.play('click', { f: 1500 }); }
  function endTutorial() { tutorialStep = -1; els.tutorial.classList.add('hidden'); GP.Settings.play.tutorialDone = true; GP.Settings.save(); }
  GP.Events.on('tutorial', (d) => { if (tutorialStep >= 0 && STEPS[tutorialStep] && STEPS[tutorialStep].wait === d.step) setTimeout(advanceTutorial, 600); });

  /* ---------------- context menu ---------------- */
  let ctxEl = null;
  function closeContextMenu() { if (ctxEl) { ctxEl.remove(); ctxEl = null; } }
  function contextMenu(e, sx, sy) {
    closeContextMenu();
    if (!e || e.removed) return;
    const T = game.tools;
    const group = T.selection.has(e) && T.selection.size > 1 ? T.selectionList() : null;
    const menu = h('div', { class: 'ctxmenu panel' });
    const item = (label, fn, opts = {}) => {
      const b = h('button', { class: 'ci' + (opts.danger ? ' danger' : '') + (opts.on ? ' on' : ''), onclick: (ev) => { ev.stopPropagation(); closeContextMenu(); GP.Audio.play('click', {}); try { fn(); } catch (err) { console.error(err); toast(err.message, 'error'); } } },
        h('span', { text: label }), opts.key ? h('span', { class: 'kbd', text: opts.key }) : null);
      menu.appendChild(b);
    };
    const sep = () => menu.appendChild(h('div', { class: 'csep' }));
    const K = (a) => GP.Input.prettyAction(a);
    if (group) {
      menu.appendChild(h('div', { class: 'ch' }, h('b', { text: group.length + ' objects selected' })));
      item('Freeze / unfreeze all', () => T.toggleFreezeMany(group), { key: K('edit.freeze') });
      item('Duplicate group', () => { T.copy(group); const c = T.clipboard; if (c) T.paste(c.cx + 1.5, c.maxY); }, { key: K('edit.duplicate') });
      item('Copy group', () => T.copy(group), { key: K('edit.copy') });
      item('Knock out characters', () => { for (const x of group) if (x.knockOut) x.knockOut(8); });
      item('Heal / repair all', () => { for (const x of group) if (x.heal) x.heal(); });
      item('Ignite all', () => { for (const x of group) GP.Heat && GP.Heat.ignite(x); });
      item('Save as contraption…', () => promptSaveContraption(group));
      item('Share as code…', () => shareContraption(group));
      item('Deselect', () => T.setSelection([]), { key: 'Esc' });
      sep();
      item('Delete group', () => T.deleteEntities(group), { danger: true, key: K('edit.delete') });
    } else {
      menu.appendChild(h('div', { class: 'ch' }, h('b', { text: e.name }), h('span', { text: (e.def.category || '') + (e.def.sub ? ' · ' + e.def.sub : '') })));
      if (e.isCharacterLike || e.isVehicle) item('Take control', () => { T.setTool('control'); const c = e.isVehicle && e.driver() ? e.driver() : e; if (game.takeControl(c)) toast('Controlling ' + c.name + '. Esc to release.', 'ok'); });
      if (e.use && !e.isCharacterLike && !e.isVehicle && !(e instanceof GP.Prop && !e.def.onUse) && e.kind !== 'fragment') item('Activate', () => (GP.Wires ? GP.Wires.activate(e, e.game) : e.use(null)), { key: K('edit.activate') });
      item('Properties…', () => { T.setTool('props'); T.select(e); });
      if (!e.def.hidden) item('Spawn more like this', () => T.eyedrop(e), { key: K('edit.eyedrop') });
      item(T.selection.has(e) ? 'Remove from selection' : 'Add to selection', () => T.toggleSelected(e));
      sep();
      item(e.isFrozen() ? 'Unfreeze' : 'Freeze', () => T.toggleFreeze(e), { key: K('edit.freeze') });
      item('Duplicate', () => T.duplicate(e), { key: K('edit.duplicate') });
      item('Copy', () => T.copy([e]), { key: K('edit.copy') });
      item('Bring to front', () => T.bringTo(e, true), { key: K('edit.front') });
      item('Send to back', () => T.bringTo(e, false), { key: K('edit.back') });
      item('Save as contraption…', () => promptSaveContraption([e]));
      item('Share as code…', () => shareContraption([e]));
      if (T.constraintsOf(e).length) item('Remove welds & ropes', () => T.removeConstraintsOf(e));
      // object-specific actions come straight from its property schema
      let props = [];
      try { props = e.getProperties(); } catch (err) { props = []; }
      const acts = props.filter((pr) => (pr.type === 'button' || pr.type === 'bool') && pr.key !== 'frozen');
      if (acts.length) {
        sep();
        for (const pr of acts.slice(0, 12)) {
          if (pr.type === 'button') item(pr.label, () => pr.action());
          else { const v = !!pr.get(); item((v ? '✓ ' : '') + pr.label, () => pr.set(!v), { on: v }); }
        }
      }
      sep();
      item('Delete', () => T.deleteEntity(e), { danger: true, key: K('edit.delete') });
    }
    root().appendChild(menu);
    ctxEl = menu;
    const r = menu.getBoundingClientRect();
    let x = sx + 4, y = sy + 4;
    if (x + r.width > window.innerWidth - 6) x = sx - r.width - 4;
    if (y + r.height > window.innerHeight - 6) y = Math.max(6, window.innerHeight - r.height - 6);
    menu.style.left = x + 'px'; menu.style.top = y + 'px';
    GP.Audio.play('click', { f: 1700 });
  }
  window.addEventListener('pointerdown', (ev) => { if (ctxEl && !ctxEl.contains(ev.target)) closeContextMenu(); }, true);

  /* ---------------- sharing (codes and files, see js/save/share.js) ---------------- */
  const codeBox = (value, readOnly) => {
    const t = h('textarea', { spellcheck: 'false', style: { width: '100%', height: '120px', resize: 'vertical', background: 'rgba(0,0,0,0.35)', border: '1px solid var(--line-2)', color: 'var(--text)', padding: '8px', font: '11px/1.35 ui-monospace, monospace', wordBreak: 'break-all' } });
    t.value = value || ''; t.readOnly = !!readOnly;
    t.addEventListener('keydown', (e) => e.stopPropagation());
    return t;
  };
  // Show a share code with Copy (and optionally Download) buttons
  async function showShareCode(title, what, makeCode, download) {
    const box = codeBox('Packing…', true);
    const note = h('div', { style: { fontSize: '12px', color: 'var(--muted)', margin: '0 0 8px' }, text: 'Send this code to someone: they paste it with Load scene → Paste code. It holds ' + what + '.' });
    const size = h('div', { style: { fontSize: '11px', color: 'var(--dim)', marginTop: '6px' } });
    const foot = h('div', { class: 'df' },
      h('button', { class: 'btn primary', text: 'Copy code', onclick: async () => { const ok = await GP.Share.copy(box.value, box); toast(ok ? 'Share code copied.' : 'Select the code and copy it (Ctrl+C).', ok ? 'ok' : 'warn'); } }),
      download ? h('button', { class: 'btn', text: 'Download file', onclick: () => { try { download(); toast('File saved.', 'ok'); } catch (e) { toast(e.message, 'error'); } } }) : null,
      h('button', { class: 'btn', text: 'Close', onclick: () => closeOverlay() }));
    showOverlay(h('div', { class: 'dialog panel', style: { width: 'min(520px, calc(100vw - 32px))' } }, h('div', { class: 'dh' }, h('h2', { text: title })), h('div', { class: 'db' }, note, box, size), foot));
    try {
      const code = await makeCode();
      box.value = code;
      size.textContent = code.length.toLocaleString() + ' characters';
      box.focus(); box.select();
    } catch (e) { box.value = ''; toast('Could not make a share code: ' + e.message, 'error'); }
  }
  // make sure there is a sandbox to put things into
  function ensureSandbox() {
    if (game.active) return;
    GP.Main.enterSandboxShell();
    game.loadMap('hangar', { empty: true });
    onMapLoaded();
  }
  function afterImport(r) {
    closeOverlay();
    if (r.type === 'scene') { game.paused = false; refreshTime(); onMapLoaded(); toast('Loaded shared scene (' + r.count + ' objects' + (r.missing ? ', ' + r.missing + ' skipped' : '') + ').', 'ok'); }
    else { category = 'Contraptions'; search = ''; renderGrid(); toast('Added "' + r.name + '" to My contraptions and placed it (' + r.count + ' parts).', 'ok', 4500); }
  }
  function openImportCode() {
    const box = codeBox('', false);
    box.placeholder = 'Paste a share code (GPZ1.… or GPJ1.…)';
    const go = async () => {
      try {
        const code = box.value.trim();
        if (!code) { toast('Paste a code first.', 'warn'); return; }
        const data = await GP.Share.unpack(code);
        if (data.kind === 'contraption') ensureSandbox(); else if (!game.active) GP.Main.enterSandboxShell();
        afterImport(await GP.Share.importCode(game, code));
      } catch (e) { toast('Import failed: ' + e.message, 'error'); }
    };
    const foot = h('div', { class: 'df' },
      h('button', { class: 'btn primary', text: 'Import', onclick: go }),
      h('button', { class: 'btn', text: 'Cancel', onclick: () => { closeOverlay(); if (!game.active) GP.Main.showMenu(); } }));
    showOverlay(h('div', { class: 'dialog panel', style: { width: 'min(520px, calc(100vw - 32px))' } }, h('div', { class: 'dh' }, h('h2', { text: 'Paste a share code' })),
      h('div', { class: 'db' }, h('div', { style: { fontSize: '12px', color: 'var(--muted)', marginBottom: '8px' }, text: 'A scene code replaces the current scene. A contraption code is added to Contraptions → My contraptions and placed in front of you.' }), box), foot));
    setTimeout(() => box.focus(), 30);
  }
  const shareContraption = (list) => {
    const name = list.length === 1 ? list[0].name : list.length + ' objects';
    showShareCode('Share contraption', 'the ' + list.length + ' selected object' + (list.length > 1 ? 's' : '') + ' with their held items, welds, ropes and wires',
      () => GP.Share.contraptionCode(game, list, name), () => GP.Share.exportContraptionFile(game, list, name));
  };

  function promptSaveContraption(list) {
    const input = h('input', { type: 'text', value: list.length === 1 ? list[0].name + ' build' : 'My contraption', style: { width: '100%', background: 'rgba(0,0,0,0.35)', border: '1px solid var(--line-2)', color: 'var(--text)', padding: '8px', fontSize: '13px' } });
    input.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') { closeOverlay(); doSave(); } });
    const doSave = () => {
      try {
        const def = GP.Contraptions.saveUser(game, input.value.trim(), list);
        toast('Saved contraption "' + def.name + '". Find it under Contraptions in the spawn browser.', 'ok', 4500);
        category = 'Contraptions'; search = ''; renderGrid();
      } catch (err) { toast(err.message, 'error'); }
    };
    openDialog('Save as contraption', h('div', null, h('div', { style: { fontSize: '12px', color: 'var(--muted)', marginBottom: '8px' }, text: 'Saves the ' + list.length + ' selected object' + (list.length > 1 ? 's' : '') + ' (with held items, welds and ropes) as a spawnable build.' }), input),
      [['Cancel', null], ['Save', doSave, 'primary']]);
    setTimeout(() => { input.focus(); input.select(); }, 30);
  }

  function onMapLoaded() {
    if (els.mapName && game.map) els.mapName.textContent = game.map.name;
    refreshTime();
    openInspector(null);
  }

  return {
    init(g) {
      game = g;
      buildHUD();
      renderGrid();
      GP.Events.on('tool:changed', () => refreshTool());
      GP.Events.on('selection:changed', (d) => { openInspector(d.e); });
      GP.Events.on('recent:changed', renderRecent);
      GP.Events.on('contraptions:changed', () => { if (category === 'Contraptions' || search) renderGrid(); });
      GP.Events.on('placing:changed', (d) => { if (!d.def) markSelected(null); });
      // pictures show characters the way they spawn, so redraw them when 'Spawn characters armed' changes
      let armedIcons = GP.Icons.armedShown();
      GP.Events.on('settings:changed', () => {
        if (GP.Icons.armedShown() === armedIcons) return;
        armedIcons = GP.Icons.armedShown();
        GP.Icons.clear((d) => d && d.kind === 'character');
        if (els.grid) renderGrid();
      });
      GP.Events.on('map:loaded', onMapLoaded);
      GP.Events.on('control:lost', () => { if (game.controlled) toast('Control lost.', 'warn'); });
      GP.Events.on('entity:removed', (d) => { if (inspectorTarget === d.e) openInspector(null); });
      window.addEventListener('resize', () => els.tooltip && els.tooltip.classList.add('hidden'));
    },
    contextMenu, closeContextMenu, askLiquidQuality,
    frame, toast, toggleSpawn, openMainMenu, openMaps, openSaves, openSettings, openPause, openMods, closeOverlay, startTutorial, onMapLoaded, refreshTime,
    setHudVisible(v) { if (els.hud) els.hud.classList.toggle('hidden', !v); },
    hasOverlay: () => !!overlay,
    ICONS,
  };
})();
