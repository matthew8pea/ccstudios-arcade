import { pad } from './gamepad.js';

/** Keyboard + mouse, merged with the controller (gamepad.js): its buttons press the same keys. */
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set();
    this.mouse = { dx: 0, dy: 0, left: false, right: false, leftPressed: false };
    this.locked = false;
    this.onLockChange = null;
    this.pad = pad;

    addEventListener('keydown', (e) => {
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
      pad.active = false;
      if (['Space', 'Tab', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => { this.keys.clear(); this.mouse.left = this.mouse.right = false; });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      if (!this.locked) this.mouse.left = this.mouse.right = false;
      if (this.onLockChange) this.onLockChange(this.locked);
    });
    addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.mouse.dx += e.movementX;
      this.mouse.dy += e.movementY;
      if (Math.abs(e.movementX) + Math.abs(e.movementY) > 3) pad.active = false;
    });
    // any click hands control back to the mouse (before the click itself, so "click to engage" locks the pointer)
    addEventListener('mousedown', () => { pad.active = false; }, true);
    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) { this.mouse.left = true; this.mouse.leftPressed = true; }
      if (e.button === 2) this.mouse.right = true;
    });
    addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouse.left = false;
      if (e.button === 2) this.mouse.right = false;
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  lock() {
    try {
      const p = this.canvas.requestPointerLock();
      if (p && p.catch) p.catch(() => {});
    } catch (e) { /* pointer lock unavailable */ }
  }

  unlock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  /** Read the controller (once per frame, before the game update). */
  poll(dt) { pad.poll(dt); }

  /** The controller was the last thing used. */
  get padActive() { return pad.active && pad.connected; }

  down(code) { return this.keys.has(code) || pad.keys.has(code); }
  hit(code) { return this.pressed.has(code) || pad.hits.has(code); }

  get fireDown() { return this.mouse.left || pad.fire; }
  get aimDown() { return this.mouse.right || pad.aim; }
  /** Movement, -1..1: the keys, or the left stick (analog). */
  get moveX() { return (this.keys.has('KeyD') ? 1 : 0) - (this.keys.has('KeyA') ? 1 : 0) || pad.lx; }
  get moveZ() { return (this.keys.has('KeyW') ? 1 : 0) - (this.keys.has('KeyS') ? 1 : 0) || -pad.ly; }
  /** Right stick, -1..1 after the response curve (the player turns at a rate from it). */
  get lookX() { return pad.rx; }
  get lookY() { return pad.ry; }

  /** Drop this frame's presses (a menu has used them, so the game must not see them too). */
  consume() {
    this.pressed.clear();
    this.mouse.leftPressed = false;
    pad.consume();
  }

  endFrame() {
    this.pressed.clear();
    this.mouse.dx = this.mouse.dy = 0;
    this.mouse.leftPressed = false;
    pad.endFrame();
  }
}
