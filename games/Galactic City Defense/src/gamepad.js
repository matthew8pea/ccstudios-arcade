// Controller support through the browser's Gamepad API ("standard" mapping). Xbox and PlayStation pads work
// directly; Nintendo controllers (Switch / Switch 2 Pro Controller, Joy-Con) work through Steam, Switch 2 Connect,
// BetterJoy and the like, which present them to Windows as an Xbox (XInput) or standard pad.
// Buttons are read by position: 0 bottom, 1 right, 2 left, 3 top (Xbox A B X Y, Nintendo B A Y X).

export const BTN = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, BACK: 8, START: 9, LS: 10, RS: 11, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };

/** Game actions: keyboard key (and how it is labelled) and controller button. */
export const ACTIONS = {
  move: { label: 'WASD', pad: 'L', text: 'move' },
  look: { label: 'Mouse', pad: 'R', text: 'look' },
  fire: { label: 'LMB', pad: BTN.RT, text: 'fire / swing' },
  aim: { label: 'RMB', pad: BTN.LT, text: 'aim / block' },
  jump: { key: 'Space', label: 'Space', pad: BTN.A, text: 'jump' },
  roll: { key: 'KeyC', label: 'C', pad: BTN.B, text: 'combat roll' },
  vent: { key: 'KeyR', label: 'R', pad: BTN.X, text: 'vent heat' },
  ability1: { key: 'KeyQ', label: 'Q', pad: BTN.LB, text: 'hero ability' },
  ability2: { key: 'KeyG', label: 'G', pad: BTN.Y, text: 'grenade / ability' },
  special: { key: 'KeyF', label: 'F', pad: BTN.RB, text: 'commander special' },
  sprint: { key: 'ShiftLeft', label: 'Shift', pad: BTN.LS, text: 'sprint (click)' },
  crouch: { key: 'ControlLeft', label: 'Ctrl', pad: BTN.RS, text: 'crouch' },
  spot: { key: 'KeyE', label: 'E', pad: BTN.UP, text: 'spot / scan' },
  swap: { key: 'Tab', label: 'Tab', pad: BTN.BACK, text: 'swap shoulder' },
  pause: { key: 'KeyP', label: 'Esc', pad: BTN.START, text: 'pause' },
  skip: { label: 'Space', pad: BTN.A, text: 'skip' },
};
/** The order the controller layout is listed in the options. */
export const PAD_LIST = ['move', 'look', 'fire', 'aim', 'jump', 'roll', 'vent', 'ability1', 'ability2', 'special', 'sprint', 'crouch', 'spot', 'swap', 'pause'];

// controller button -> the key it presses (sprint is latched separately; the triggers are fire and aim)
const PAD_KEY = [];
for (const a of Object.values(ACTIONS)) if (a.key && typeof a.pad === 'number' && a.pad !== BTN.LS) PAD_KEY[a.pad] = a.key;
PAD_KEY[BTN.DOWN] = 'ControlLeft';
PAD_KEY[BTN.LEFT] = PAD_KEY[BTN.RIGHT] = 'Tab';

const NAMES = {
  xbox: ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'View', 'Menu', 'LS', 'RS', '↑', '↓', '←', '→'],
  ps: ['✕', '○', '□', '△', 'L1', 'R1', 'L2', 'R2', 'Create', 'Options', 'L3', 'R3', '↑', '↓', '←', '→'],
  // a Nintendo pad read by position (bottom = B) ...
  nintendo: ['B', 'A', 'Y', 'X', 'L', 'R', 'ZL', 'ZR', '−', '+', 'LS', 'RS', '↑', '↓', '←', '→'],
  // ... or remapped by label, A on the right reported as Xbox A (with "Swap A/B and X/Y" on)
  nintendoLabel: ['A', 'B', 'X', 'Y', 'L', 'R', 'ZL', 'ZR', '−', '+', 'LS', 'RS', '↑', '↓', '←', '→'],
  // VR controllers (vr.js presents them as one pad)
  vr: ['A', 'B', 'X', 'Y', 'L GRIP', 'R GRIP', 'L TRIG', 'R TRIG', '—', 'L3+R3', 'L3', 'R3', 'R-STICK ↑', 'R-STICK ↓', '—', '—'],
};
export const STYLE_NAMES = { xbox: 'Xbox', ps: 'PlayStation', nintendo: 'Nintendo', vr: 'VR' };
const swapIdx = (i, swap) => (swap && i < 4 ? i ^ 1 : i);

function detectStyle(id) {
  if (/webxr/i.test(id)) return 'vr';
  if (/057e|nintendo|pro controller|joy-?con|switch/i.test(id)) return 'nintendo';
  if (/054c|playstation|dualsense|dualshock|wireless controller/i.test(id)) return 'ps';
  return 'xbox';
}
function cleanName(id) {
  const n = id.replace(/\(.*?\)/g, '').replace(/\s+/g, ' ').trim();
  return n || 'Controller';
}
/** Radial deadzone, rescaled so the stick still reaches 1. */
function stick(x, y, dead) {
  const m = Math.hypot(x, y);
  if (m <= dead) return [0, 0, 0];
  const k = Math.min(1, (m - dead) / (1 - dead));
  return [(x / m) * k, (y / m) * k, k];
}

class GamepadInput {
  constructor() {
    this.settings = null;
    this.index = -1;
    this.connected = false;
    this.id = '';
    this.name = '';
    this.detected = 'xbox';
    this.active = false; // the last thing touched was the controller (not the keyboard or mouse)
    this.btn = new Array(16).fill(false);
    this.prev = new Array(16).fill(false);
    this.down1 = new Array(16).fill(false); // pressed this frame
    this.keys = new Set();
    this.hits = new Set();
    this.lx = this.ly = this.rx = this.ry = 0;
    this.lt = this.rt = 0;
    this.fire = this.aim = false;
    this.sprint = false;
    this.slowT = 0;
    this.combo = false; // the dev-menu combo fired this frame
    this.comboUsed = false;
    this.backT = 0;
    this.nav = null;
    this.navHeld = null;
    this.navT = 0;
    this.rumbleUntil = 0;
    this.rumbleLevel = 0;
    this.onConnect = null;
    this.onDisconnect = null;
    this.virtual = null; // the VR controllers as a standard pad (set by vr.js each frame while in VR)
    addEventListener('gamepadconnected', (e) => {
      if (this.index < 0) this.use(e.gamepad);
      if (this.onConnect) this.onConnect(e.gamepad);
    });
    addEventListener('gamepaddisconnected', (e) => {
      if (e.gamepad.index !== this.index) return;
      const was = this.active;
      this.index = -1;
      this.connected = false;
      this.active = false;
      this.release();
      if (this.onDisconnect) this.onDisconnect(was);
    });
  }

  use(gp) {
    this.index = gp.index;
    this.connected = true;
    this.id = gp.id;
    this.name = cleanName(gp.id);
    this.detected = detectStyle(gp.id);
  }

  /** Button icons in use: the setting, or what the controller says it is. */
  style() {
    const s = this.settings && this.settings.padGlyphs;
    return s && s !== 'auto' ? s : this.detected;
  }

  pads() {
    const list = navigator.getGamepads ? [...navigator.getGamepads()].filter((g) => g && g.connected) : [];
    if (this.virtual) list.push(this.virtual);
    return list;
  }

  release() {
    this.btn.fill(false);
    this.prev.fill(false);
    this.down1.fill(false);
    this.keys.clear();
    this.lx = this.ly = this.rx = this.ry = this.lt = this.rt = 0;
    this.fire = this.aim = this.sprint = false;
    this.nav = this.navHeld = null;
  }

  /** Read the controller once per frame. */
  poll(dt) {
    const list = this.pads();
    let gp = list.find((g) => g.index === this.index) || this.virtual || null;
    // another controller takes over as soon as one of its buttons is pressed
    for (const g of list) if (g !== gp && g.buttons.some((b) => b.pressed)) { gp = g; break; }
    if (!gp) {
      if (this.connected) { this.connected = false; this.release(); }
      return;
    }
    if (gp.index !== this.index || !this.connected) this.use(gp);
    this.gp = gp;
    const swap = !!(this.settings && this.settings.padSwap);
    const B = gp.buttons;
    const val = (i) => { const b = B[swapIdx(i, swap)]; return b ? (typeof b === 'object' ? b.value || (b.pressed ? 1 : 0) : b) : 0; };
    let touched = false;
    for (let i = 0; i < 16; i++) {
      this.prev[i] = this.btn[i];
      this.btn[i] = val(i) > (i === BTN.LT || i === BTN.RT ? 0.3 : 0.5);
      this.down1[i] = this.btn[i] && !this.prev[i];
      if (this.down1[i]) touched = true;
    }
    this.lt = val(BTN.LT);
    this.rt = val(BTN.RT);
    const A = gp.axes;
    const l = stick(A[0] || 0, A[1] || 0, 0.18);
    const r = stick(A[2] || 0, A[3] || 0, 0.14);
    this.lx = l[0]; this.ly = l[1];
    // look: a curve for fine aim near the centre, full speed at the edge
    const rk = r[2] > 0 ? Math.pow(r[2], 1.7) / r[2] : 0;
    this.rx = r[0] * rk; this.ry = r[1] * rk;
    if (l[2] > 0.4 || r[2] > 0.4) touched = true;
    if (touched) this.active = true;
    this.fire = this.btn[BTN.RT];
    this.aim = this.btn[BTN.LT];
    // sprint: click the left stick; it holds until you stop, aim or fire
    if (this.down1[BTN.LS]) this.sprint = !this.sprint;
    if (l[2] < 0.25) this.slowT += dt; else this.slowT = 0;
    if (this.slowT > 0.15 || this.fire || this.aim) this.sprint = false;
    // the dev menu: hold View/− and press Menu/+. That press does not pause, and View's shoulder swap waits for
    // its release (a quick tap with no combo), so the combo leaves no trace in the game.
    this.combo = false;
    if (this.btn[BTN.BACK] && this.down1[BTN.START]) { this.combo = this.comboUsed = true; this.down1[BTN.START] = false; }
    const backUp = this.prev[BTN.BACK] && !this.btn[BTN.BACK];
    if (this.btn[BTN.BACK]) this.backT += dt;
    // the keys the buttons stand in for
    this.keys.clear();
    for (let i = 0; i < 16; i++) {
      const k = PAD_KEY[i];
      if (!k) continue;
      if (this.btn[i]) this.keys.add(k);
      if (i === BTN.BACK ? backUp && !this.comboUsed && this.backT < 0.6 : this.down1[i]) this.hits.add(k);
    }
    if (backUp) { this.comboUsed = false; this.backT = 0; }
    if (this.sprint) this.keys.add('ShiftLeft');
    // menu navigation: the d-pad or the left stick, repeating while held
    let d = null;
    if (this.btn[BTN.UP]) d = 'up'; else if (this.btn[BTN.DOWN]) d = 'down'; else if (this.btn[BTN.LEFT]) d = 'left'; else if (this.btn[BTN.RIGHT]) d = 'right';
    else if (l[2] > 0.55) d = Math.abs(l[0]) > Math.abs(l[1]) ? (l[0] > 0 ? 'right' : 'left') : (l[1] > 0 ? 'down' : 'up');
    if (d !== this.navHeld) { this.navHeld = d; this.navT = 0.38; this.nav = d; }
    else if (d && (this.navT -= dt) <= 0) { this.navT = 0.11; this.nav = d; }
    else this.nav = null;
  }

  pressed(i) { return this.down1[i]; }

  /** Forget this frame's presses (a menu used them). */
  consume() {
    this.hits.clear();
    this.down1.fill(false);
    this.nav = null;
    this.combo = false;
  }

  endFrame() { this.hits.clear(); }

  /** Rumble, if the controller and the browser support it. Overlapping effects keep the strongest. */
  rumble(strong, weak, ms) {
    if (!this.active || !this.gp || (this.settings && this.settings.padRumble === false)) return;
    const act = this.gp.vibrationActuator;
    if (!act || !act.playEffect) return;
    const now = performance.now(), level = strong + weak;
    if (now < this.rumbleUntil && level <= this.rumbleLevel) return;
    this.rumbleUntil = now + ms;
    this.rumbleLevel = level;
    try {
      const p = act.playEffect('dual-rumble', { startDelay: 0, duration: ms, strongMagnitude: Math.min(1, strong), weakMagnitude: Math.min(1, weak) });
      if (p && p.catch) p.catch(() => {});
    } catch (e) { /* not supported */ }
  }

  /** The icon for a controller button: { text, cls }. */
  glyph(i) {
    const st = this.style(), swap = !!(this.settings && this.settings.padSwap);
    const j = swapIdx(i, swap);
    const names = st === 'nintendo' ? (swap ? NAMES.nintendoLabel : NAMES.nintendo) : NAMES[st] || NAMES.xbox;
    const shape = i < 4 ? 'pad-face' : i < 8 ? 'pad-sh' : i < 10 ? 'pad-sys' : i < 12 ? 'pad-st' : 'pad-dp';
    return { text: names[j], cls: `pad pad-${st} ${shape} pad-b${j}` };
  }

  /** Icon for an action, sticks included. */
  actionGlyph(act) {
    const a = ACTIONS[act];
    if (!a) return { text: '?', cls: 'pad' };
    if (a.pad === 'L' || a.pad === 'R') return { text: a.pad + (this.style() === 'ps' ? '' : 'S'), cls: `pad pad-${this.style()} pad-stick` };
    return this.glyph(a.pad);
  }

  /**
   * Show the prompt for an action on a <kbd>: its controller button while the controller is in use, otherwise
   * the key (keyLabel overrides the key's usual label).
   */
  decorate(el, act, keyLabel, forcePad = false) {
    if (!el) return;
    if (el.dataset.padcls) for (const c of el.dataset.padcls.split(' ')) if (c) el.classList.remove(c);
    if ((this.active || forcePad) && this.connected) {
      const g = this.actionGlyph(act);
      el.textContent = g.text;
      el.dataset.padcls = g.cls;
      for (const c of g.cls.split(' ')) el.classList.add(c);
    } else {
      el.textContent = keyLabel || (ACTIONS[act] && ACTIONS[act].label) || '';
      el.dataset.padcls = '';
    }
  }

  /** HTML for a controller button. */
  buttonHTML(i) { const g = this.glyph(i); return `<kbd class="${g.cls}">${g.text}</kbd>`; }

  /** HTML for a prompt, for building text. */
  promptHTML(act, keyLabel) {
    if (this.active && this.connected) { const g = this.actionGlyph(act); return `<kbd class="${g.cls}">${g.text}</kbd>`; }
    return `<kbd>${keyLabel || ACTIONS[act].label}</kbd>`;
  }
}

/** The one controller reader (input.js reads it into the game; padui.js drives the menus with it). */
export const pad = new GamepadInput();
