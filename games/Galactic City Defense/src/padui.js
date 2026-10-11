import { pad, BTN, ACTIONS, PAD_LIST, STYLE_NAMES } from './gamepad.js';

// Menus with a controller: the d-pad or left stick moves a focus ring between the buttons of whichever screen is
// up, A presses, B goes back, Start takes the main button, and left/right change sliders and drop-downs. Also keeps
// every on-screen prompt showing the device in use (keys, or the controller's buttons), the "click to engage"
// overlay out of the way of controller players, rumble on hits and blasts, and a note when a controller comes or goes.
const SCREENS = ['dev', 'heroPick', 'victory', 'gameover', 'pause', 'title'];
const FOCUSABLE = 'button, select, input[type=range], input[type=checkbox], .perk';
const SLOT_ACTS = ['ability1', 'ability2', 'special'];

const visible = (el) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
const box = (el) => (el.matches('input[type=checkbox], input[type=range], select') && el.closest('label')) || el;

export class PadUI {
  constructor(G) {
    this.G = G;
    this.focus = null;
    this.screen = null;
    this.promptKey = '';
    this.lastShake = 0;
    this.toastEl = document.getElementById('padToast');
    this.toastT = 0;
    pad.onConnect = (gp) => {
      this.toast('CONTROLLER CONNECTED · ' + gp.id.replace(/\(.*?\)/g, '').trim().toUpperCase());
      this.promptKey = '';
    };
    pad.onDisconnect = (wasActive) => {
      this.toast('CONTROLLER DISCONNECTED');
      this.promptKey = '';
      if (wasActive && G.state === 'playing' && G.pause) G.pause(true);
    };
  }

  toast(text) {
    if (!this.toastEl) return;
    this.toastEl.textContent = text;
    this.toastEl.classList.add('on');
    this.toastT = 3;
  }

  update(dt) {
    const G = this.G, input = G.input;
    input.poll(dt);
    if (this.toastT > 0 && (this.toastT -= dt) <= 0) this.toastEl.classList.remove('on');
    // prompts follow the device in use
    const key = (pad.active && pad.connected) + ':' + pad.connected + ':' + pad.style() + ':' + !!G.settings.padSwap + ':' + pad.name;
    if (key !== this.promptKey) { this.promptKey = key; this.refreshPrompts(); }
    const playing = G.state === 'playing';
    document.body.classList.toggle('pad-play', playing && input.padActive);
    // "click to engage" is for the mouse: controller players play on without pointer lock
    if (playing && !G.dev.open) {
      const want = !input.locked && !input.padActive;
      if (want !== !document.getElementById('engage').classList.contains('hidden')) G.hud.show('engage', want);
    }
    this.rumbleFx();
    // hold View/− and press Menu/+: the dev menu (Ctrl+X on the keyboard)
    if (pad.combo && G.toggleDev && G.state !== 'loading') {
      G.sound.init();
      G.toggleDev();
      G.sound.ui();
      input.consume();
    }
    this.menus();
  }

  /** Blasts and hits shake the camera; the controller feels the same. */
  rumbleFx() {
    const G = this.G, s = G.fx.shake || 0;
    const rise = s - this.lastShake;
    this.lastShake = s;
    if (rise > 0.04 && (G.state === 'playing' || G.state === 'dead')) pad.rumble(Math.min(1, rise * 1.6), Math.min(1, rise * 1.2), 160 + rise * 300);
  }

  activeScreen() {
    for (const id of SCREENS) {
      const el = document.getElementById(id);
      if (el && !el.classList.contains('hidden')) return el;
    }
    return null;
  }

  items(scr) { return [...scr.querySelectorAll(FOCUSABLE)].filter((el) => !el.disabled && visible(el)); }

  setFocus(el) {
    if (this.focus) box(this.focus).classList.remove('pad-focus');
    this.focus = el;
    if (el) {
      const b = box(el);
      b.classList.add('pad-focus');
      b.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  }

  defaultItem(scr, items) {
    if (scr.id === 'title') {
      const sel = scr.querySelector('.card.sel');
      if (sel && items.includes(sel)) return scr.querySelector('#deploy');
    }
    return items.find((el) => el.classList.contains('primary')) || items[0];
  }

  menus() {
    const G = this.G, input = G.input;
    const scr = this.activeScreen();
    if (scr !== this.screen) { this.setFocus(null); this.screen = scr; }
    if (!scr || !input.padActive) {
      if (this.focus) box(this.focus).classList.remove('pad-focus');
      return;
    }
    const items = this.items(scr);
    if (!items.length) return;
    if (!this.focus || !items.includes(this.focus)) this.setFocus(this.defaultItem(scr, items));
    else box(this.focus).classList.add('pad-focus');
    const el = this.focus;
    let used = false;
    const nav = pad.nav;
    if (nav) {
      if ((nav === 'left' || nav === 'right') && this.adjust(el, nav === 'right' ? 1 : -1)) G.sound.ui();
      else {
        const n = this.neighbour(items, el, nav);
        if (n) { this.setFocus(n); G.sound.ui(); }
      }
      used = true;
    }
    if (pad.pressed(BTN.A)) { this.activate(el); used = true; }
    else if (pad.pressed(BTN.B)) { this.back(scr); used = true; }
    else if (pad.pressed(BTN.START)) { this.start(scr); used = true; }
    if (used) input.consume();
  }

  /** The nearest item in a direction (by on-screen position). */
  neighbour(items, el, dir) {
    const a = box(el).getBoundingClientRect();
    const ax = a.left + a.width / 2, ay = a.top + a.height / 2;
    const dx = dir === 'left' ? -1 : dir === 'right' ? 1 : 0, dy = dir === 'up' ? -1 : dir === 'down' ? 1 : 0;
    let best = null, bs = Infinity;
    for (const o of items) {
      if (o === el) continue;
      const r = box(o).getBoundingClientRect();
      const vx = r.left + r.width / 2 - ax, vy = r.top + r.height / 2 - ay;
      const along = vx * dx + vy * dy;
      if (along <= 4) continue;
      const score = along + Math.abs(vx * dy - vy * dx) * 2.2;
      if (score < bs) { bs = score; best = o; }
    }
    return best;
  }

  /** Left/right on a slider or drop-down changes it. */
  adjust(el, s) {
    if (el.matches('input[type=range]')) {
      const min = +el.min || 0, max = +el.max || 1, step = (max - min) / 20;
      el.value = Math.min(max, Math.max(min, +el.value + s * step));
      el.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    }
    if (el.matches('select')) {
      const n = el.options.length;
      el.selectedIndex = (el.selectedIndex + s + n) % n;
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }
    return false;
  }

  activate(el) {
    const G = this.G;
    G.sound.init();
    if (el.matches('select')) this.adjust(el, 1);
    else if (el.matches('input[type=range]')) return;
    else el.click();
    G.sound.ui();
  }

  back(scr) {
    const G = this.G;
    if (scr.id === 'pause') document.getElementById('resume').click();
    else if (scr.id === 'dev' && G.toggleDev) G.toggleDev(false);
    else if (scr.id === 'title') {
      const opt = document.getElementById('optPanel');
      if (!opt.classList.contains('hidden')) { opt.classList.add('hidden'); this.setFocus(document.getElementById('optToggle')); }
    }
  }

  start(scr) {
    if (scr.id === 'pause') { document.getElementById('resume').click(); return; }
    const p = scr.querySelector('.primary');
    if (p && visible(p)) { this.G.sound.init(); p.click(); }
  }

  /** Every prompt on screen: keys while on the keyboard, the controller's buttons while on the controller. */
  refreshPrompts() {
    const G = this.G;
    document.querySelectorAll('kbd[data-act]').forEach((k) => pad.decorate(k, k.dataset.act));
    if (G.hud && G.hud.slots && G.player) {
      const abil = G.player.cfg && G.player.cfg.abilities;
      G.hud.slots.forEach((s, i) => pad.decorate(s.key, SLOT_ACTS[i], abil && abil[i] ? abil[i].label : undefined));
    }
    const skip = document.getElementById('skipHint');
    if (skip) skip.innerHTML = pad.active && pad.connected ? pad.promptHTML('skip') + ' skip' : 'SPACE — skip';
    // the controller layout in the options, in this controller's icons
    for (const el of document.querySelectorAll('.pad-controls')) {
      el.innerHTML = PAD_LIST.map((a) => {
        const g = pad.actionGlyph(a);
        return `<span><kbd class="${g.cls}">${g.text}</kbd>${ACTIONS[a].text}</span>`;
      }).join('') + `<span>hold ${pad.buttonHTML(BTN.BACK)} + ${pad.buttonHTML(BTN.START)} dev menu</span>`;
    }
    const dev = document.getElementById('devHint');
    if (dev) dev.innerHTML = pad.connected ? `Ctrl+X or hold ${pad.buttonHTML(BTN.BACK)} + ${pad.buttonHTML(BTN.START)} to close` : 'Ctrl+X to close';
    for (const el of document.querySelectorAll('.pad-status')) {
      el.textContent = pad.connected
        ? `Controller: ${pad.name} · ${STYLE_NAMES[pad.style()]} buttons`
        : 'No controller found: connect one and press a button on it.';
    }
  }
}
