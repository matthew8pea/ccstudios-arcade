import * as THREE from 'three';
import { pad } from './gamepad.js';
import { clamp } from './util.js';

// VR (WebXR). "ENTER VR" on the page starts an immersive session on a headset: a Quest (or any WebXR headset) in
// its own browser over HTTPS (Play VR.bat), or a PC headset (Quest Link / Air Link / SteamVR) in Chrome or Edge.
//
// - First person by default: you are the commander. The right controller is your blaster (both hands for Fox's
//   pistols, a lightsaber for Yoda), the left stick moves where you look, the right stick snap-turns.
// - Third person (pause menu): the view rides the over-the-shoulder camera, and the right stick aims as on a pad.
// - Cutscenes, the gunship, the killcam and the title screen ride the game camera (heading only, so it never rolls).
// - The controllers are fed into gamepad.js as a standard pad, so every game action, menu and prompt works as is.
// - The HTML menus are mirrored onto a panel in front of you: point and pull the trigger, or use the stick and A.
// - The HUD (objective, health, heat, abilities, subtitles) is a panel that rides with your head.

const SNAP = Math.PI / 6;
const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _d = new THREE.Vector3();
const _v = new THREE.Vector3(), _e = new THREE.Euler(0, 0, 0, 'YXZ'), _m = new THREE.Matrix4();
const _ray = new THREE.Raycaster();
const VR_ROWS_TITLE = ['view', 'turn', 'recenter', 'exit'];
const VR_ROWS_PAUSE = ['view', 'turn', 'recenter', 'dev', 'exit'];

function makePanel(w, h, mw, mh) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, toneMapped: false, fog: false });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(mw, mh), mat);
  mesh.renderOrder = 1000;
  mesh.frustumCulled = false;
  mesh.visible = false;
  return { c, g: c.getContext('2d'), tex, mesh, w, h, t: 0 };
}

/** A blaster held in the hand, barrel along -Z (the controller's pointing ray). */
function blaster(accent, pistol) {
  const g = new THREE.Group();
  const white = new THREE.MeshStandardMaterial({ color: 0xd9d6cf, roughness: 0.55, metalness: 0.1 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x24272c, roughness: 0.6, metalness: 0.5 });
  const trim = new THREE.MeshStandardMaterial({ color: new THREE.Color(accent), roughness: 0.6 });
  const len = pistol ? 0.17 : 0.34;
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.055, len), pistol ? white : dark);
  body.position.set(0, 0, -len / 2 + 0.05);
  g.add(body);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.013, pistol ? 0.07 : 0.16, 10), dark);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.006, -len + 0.05 - (pistol ? 0.035 : 0.08));
  g.add(barrel);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.044, 0.012, len * 0.5), trim);
  stripe.position.set(0, 0.03, -len / 2 + 0.05);
  g.add(stripe);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.1, 0.04), dark);
  grip.position.set(0, -0.06, 0.03);
  grip.rotation.x = 0.35;
  g.add(grip);
  if (!pistol) {
    const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.09, 8), dark);
    scope.rotation.x = Math.PI / 2;
    scope.position.set(0, 0.045, -0.06);
    g.add(scope);
  }
  g.userData.tip = -len + 0.05 - (pistol ? 0.07 : 0.16);
  return g;
}

/** Yoda's lightsaber: hilt in the hand, blade along the ray. */
function saber() {
  const g = new THREE.Group();
  const hilt = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.018, 0.2, 12), new THREE.MeshStandardMaterial({ color: 0xb8bcc2, metalness: 0.8, roughness: 0.3 }));
  hilt.rotation.x = Math.PI / 2;
  hilt.position.z = 0.02;
  g.add(hilt);
  const blade = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.016, 0.85, 10), new THREE.MeshBasicMaterial({ color: 0xc8ffb0, toneMapped: false }));
  blade.rotation.x = Math.PI / 2;
  blade.position.z = -0.5;
  g.add(blade);
  const glow = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.034, 0.86, 10), new THREE.MeshBasicMaterial({ color: 0x5dff4a, transparent: true, opacity: 0.35, depthWrite: false, toneMapped: false }));
  glow.rotation.x = Math.PI / 2;
  glow.position.z = -0.5;
  g.add(glow);
  g.userData.tip = -0.3;
  return g;
}

function wrap(g, text, maxW) {
  const words = String(text).split(/\s+/), lines = [];
  let line = '';
  for (const w of words) {
    const t = line ? line + ' ' + w : w;
    if (g.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t;
  }
  if (line) lines.push(line);
  return lines;
}

const txt = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
const ownText = (el) => (el ? [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join(' ').replace(/\s+/g, ' ').trim() : '');

export class VR {
  constructor(G) {
    this.G = G;
    const r = (this.r = G.renderer);
    r.xr.enabled = true;
    r.xr.setReferenceSpaceType('local-floor');
    this.session = null;
    this.presenting = false;
    this.standalone = /OculusBrowser|Quest|Pico|Wolvic/i.test(navigator.userAgent);
    G.settings.vrView ??= 'first';
    G.settings.vrTurn ??= 'snap';

    // the rig: the play space. Its floor sits under the commander's feet (first person) or under the game camera.
    this.rig = new THREE.Group();
    this.rig.name = 'vrRig';
    this.cam = new THREE.PerspectiveCamera(70, 1, 0.08, 7000);
    this.rig.add(this.cam);
    G.scene.add(this.rig);
    this.yaw = 0;
    this.base = null; // where the head usually sits in the play space (slowly follows it), so you stay centred
    this.wasOwn = false;

    // controllers
    this.ctl = [0, 1].map((i) => {
      const ray = r.xr.getController(i), grip = r.xr.getControllerGrip(i);
      this.rig.add(ray, grip);
      const o = { i, ray, grip, src: null, hand: '', o: new THREE.Vector3(), d: new THREE.Vector3(), trig: false, trigPrev: false };
      ray.addEventListener('connected', (e) => { o.src = e.data; o.hand = e.data.handedness; });
      ray.addEventListener('disconnected', () => { o.src = null; o.hand = ''; });
      return o;
    });
    this.kit = null; // which commander the hand models are built for
    this.models = [];

    // pointer laser + aim reticle
    const lg = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1)]);
    this.laser = new THREE.Line(lg, new THREE.LineBasicMaterial({ color: 0x7fc8ff, transparent: true, opacity: 0.55, depthTest: false, toneMapped: false, fog: false }));
    this.laser.renderOrder = 999;
    this.laser.frustumCulled = false;
    this.laser.visible = false;
    this.reticle = new THREE.Mesh(new THREE.RingGeometry(0.55, 1, 24), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthTest: false, toneMapped: false, fog: false, side: THREE.DoubleSide }));
    this.reticle.renderOrder = 999;
    this.reticle.visible = false;
    G.scene.add(this.reticle);

    // panels: the menus (in the world, in front of you) and the HUD (rides with your head)
    this.menu = makePanel(1024, 1024, 1.35, 1.35);
    this.rig.add(this.menu.mesh);
    this.hud = makePanel(1280, 640, 1.7, 0.85);
    this.hud.mesh.position.set(0, -0.08, -1.45);
    this.cam.add(this.hud.mesh);
    this.rows = [];
    this.hover = -1;
    this.scroll = 0;
    this.lastScreen = null;

    // fades (arena changes, cutscene cuts) as a dark shell round your head
    this.fadeEl = document.getElementById('fade');
    this.fade = new THREE.Mesh(new THREE.SphereGeometry(0.4, 16, 12), new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.BackSide, transparent: true, opacity: 0, depthTest: false, depthWrite: false, fog: false, toneMapped: false }));
    this.fade.renderOrder = 2000;
    this.fade.visible = false;
    this.cam.add(this.fade);

    // controller input, fed to gamepad.js as a standard pad
    this.sticks = { l: false, r: false, win: 0, both: false, outL: false, outR: false, start: 0 };
    this.turnHeld = false;
    this.flick = 0;
    this.suppressRT = false;
    this.haptic = {
      playEffect: (type, o) => {
        for (const c of this.ctl) {
          const h = c.src && c.src.gamepad && c.src.gamepad.hapticActuators && c.src.gamepad.hapticActuators[0];
          if (h && h.pulse) try { h.pulse(Math.min(1, Math.max(o.strongMagnitude || 0, o.weakMagnitude || 0)), o.duration || 60); } catch { /* no haptics */ }
        }
        return Promise.resolve('complete');
      },
    };

    this.makeButton();
  }

  // ------------------------------------------------------------------ session
  makeButton() {
    const b = (this.button = document.createElement('button'));
    b.id = 'vrButton';
    b.textContent = 'ENTER VR';
    Object.assign(b.style, {
      position: 'fixed', right: '22px', bottom: '22px', zIndex: 60, padding: '12px 22px', font: '600 15px/1 inherit',
      letterSpacing: '0.14em', color: '#fff', background: 'rgba(30, 110, 200, 0.92)', border: '1px solid #8fc8ff', borderRadius: '3px',
      cursor: 'pointer', display: 'none', pointerEvents: 'auto',
    });
    b.onclick = () => this.toggle();
    document.body.appendChild(b);
    if (navigator.xr && navigator.xr.isSessionSupported) {
      navigator.xr.isSessionSupported('immersive-vr').then((ok) => { if (ok) b.style.display = ''; }).catch(() => {});
    } else if (!window.isSecureContext && /OculusBrowser|Quest|Pico/i.test(navigator.userAgent)) {
      b.textContent = 'VR NEEDS THE https:// ADDRESS';
      b.style.background = 'rgba(120, 40, 30, 0.92)';
      b.style.display = '';
      b.onclick = null;
    }
  }

  /** Show the button only where it can be pressed (not under pointer lock mid-fight). */
  syncButton() {
    if (this.button.style.display === 'none') return;
    const G = this.G, show = !this.presenting && G.state !== 'loading' && !(G.state === 'playing' && G.input.locked);
    this.button.style.visibility = show ? 'visible' : 'hidden';
  }

  async toggle() {
    if (this.session) { this.session.end(); return; }
    const G = this.G;
    try {
      G.sound.init();
      const s = await navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor', 'bounded-floor', 'layers'] });
      this.r.xr.setFramebufferScaleFactor(this.standalone ? 0.85 : 1.15);
      this.r.xr.setFoveation(this.standalone ? 1 : 0);
      s.addEventListener('end', () => this.onEnd());
      await this.r.xr.setSession(s);
      this.session = s;
      this.presenting = true;
      this.base = null;
      this.wasOwn = false;
      this.lastScreen = null;
      this.enterQuality();
      G.input.unlock();
      this.button.textContent = 'EXIT VR';
    } catch (e) {
      console.error(e);
      G.hud.toast('COULD NOT START VR · ' + (e.message || e));
    }
  }

  onEnd() {
    const G = this.G;
    this.session = null;
    this.presenting = false;
    pad.virtual = null;
    this.button.textContent = 'ENTER VR';
    this.menu.mesh.visible = this.hud.mesh.visible = this.reticle.visible = this.laser.visible = false;
    this.showBody(null);
    // (after three.js has finished closing the session, so the canvas can be resized again)
    setTimeout(() => this.leaveQuality(), 0);
    G.camera.aspect = innerWidth / innerHeight;
    G.camera.updateProjectionMatrix();
    if (G.state === 'playing' && G.pause) G.pause(true);
  }

  /** Headsets need 72-90 fps in stereo: lighter shadows and effects (much lighter on a standalone headset). */
  enterQuality() {
    const G = this.G;
    this.savedShadows = this.r.shadowMap.enabled;
    if (this.standalone) {
      this.r.shadowMap.enabled = false;
      if (G.fx) G.fx.setQuality(false, 2);
      if (G.city) G.city.atmos.setQuality(false);
    } else if (G.city) {
      const sh = G.city.sun.shadow;
      if (sh.mapSize.x > 2048) { sh.mapSize.set(2048, 2048); if (sh.map) { sh.map.dispose(); sh.map = null; } }
    }
  }

  leaveQuality() {
    const G = this.G;
    this.r.shadowMap.enabled = this.savedShadows ?? true;
    const q = G.quality;
    if (q) q.setTier(q.tier);
  }

  // ------------------------------------------------------------------ helpers
  hand(h) {
    return this.ctl.find((c) => c.hand === h && c.src && c.src.gamepad) || null;
  }

  anyHand(h) { return this.hand(h) || this.hand(h === 'left' ? 'right' : 'left'); }

  /** First person on foot: the headset is the camera, the controllers are the guns. */
  ownsCamera() {
    const G = this.G, p = G.player;
    return this.presenting && G.settings.vrView === 'first' && !!p && !p.isGunship && p.alive && (G.state === 'playing' || G.state === 'paused');
  }

  /** The aim ray of a hand (world space), while in first person. */
  aimRay(hand = 'right') {
    if (!this.ownsCamera()) return null;
    const c = this.anyHand(hand);
    if (!c) return null;
    return { o: c.o, d: c.d };
  }

  /** Where a hand's blaster fires from (world space), while in first person. */
  muzzle(hand, out) {
    if (!this.ownsCamera()) return null;
    const c = this.anyHand(hand);
    if (!c) return null;
    const tip = (this.models[c.i] && this.models[c.i].userData.tip) || -0.25;
    return out.copy(c.o).addScaledVector(c.d, -tip);
  }

  menuScreen() {
    const G = this.G;
    if (!G.padUI || G.state === 'loading') return null;
    return G.padUI.activeScreen();
  }

  // ------------------------------------------------------------------ input
  /** Read the controllers and present them to gamepad.js as one standard pad. Before PadUI.update. */
  pollInput(dt) {
    if (!this.presenting) { if (pad.virtual) pad.virtual = null; return; }
    const G = this.G;
    this.rig.updateMatrixWorld(true);
    for (const c of this.ctl) {
      c.ray.matrixWorld.decompose(c.o, _q, _s);
      c.d.set(0, 0, -1).applyQuaternion(_q);
      c.trigPrev = c.trig;
      const gp = c.src && c.src.gamepad;
      c.trig = !!(gp && gp.buttons[0] && gp.buttons[0].value > 0.55);
    }
    const R = this.hand('right'), L = this.hand('left');
    const rb = R ? R.src.gamepad.buttons : [], lb = L ? L.src.gamepad.buttons : [];
    const ra = R ? R.src.gamepad.axes : [], la = L ? L.src.gamepad.axes : [];
    const val = (a, i) => (a[i] ? a[i].value || (a[i].pressed ? 1 : 0) : 0);
    const stick = (a) => (a.length >= 4 ? [a[2] || 0, a[3] || 0] : [a[0] || 0, a[1] || 0]);
    const [lx, ly] = stick(la), [rx, ry] = stick(ra);
    const b = new Array(17).fill(0);
    b[0] = val(rb, 4); // A: jump / skip / press
    b[1] = val(rb, 5); // B: combat roll / back
    b[2] = val(lb, 4); // X: vent heat
    b[3] = val(lb, 5); // Y: grenade / second ability
    b[4] = val(lb, 1); // left grip: hero ability
    b[5] = val(rb, 1); // right grip: commander special
    b[6] = val(lb, 0); // left trigger: aim down sights / block
    b[7] = val(rb, 0); // right trigger: fire / swing
    if (this.suppressRT) { if (b[7] < 0.2) this.suppressRT = false; else b[7] = 0; }

    // thumbstick clicks: one is sprint (left) or crouch (right); both together pause
    // (a click waits a moment to see whether the other stick joins it, then passes through)
    const S = this.sticks, l3 = val(lb, 3) > 0.5, r3 = val(rb, 3) > 0.5;
    let outL = S.holdL && l3, outR = S.holdR && r3;
    if (!l3) S.holdL = false;
    if (!r3) S.holdR = false;
    if (((l3 && !S.l) || (r3 && !S.r)) && S.win <= 0 && !S.both) { S.win = 0.14; S.pl = S.pr = false; }
    S.l = l3; S.r = r3;
    if (S.win > 0) {
      S.pl = S.pl || l3; S.pr = S.pr || r3;
      if (l3 && r3) { S.both = true; S.win = 0; S.start = 0.05; }
      else if ((S.win -= dt) <= 0) {
        if (S.pl) { outL = true; S.holdL = l3; }
        if (S.pr) { outR = true; S.holdR = r3; }
      }
    }
    if (S.both) { outL = outR = false; S.holdL = S.holdR = false; if (!l3 && !r3) S.both = false; }
    b[10] = outL ? 1 : 0;
    b[11] = outR ? 1 : 0;
    if (S.start > 0) { b[9] = 1; S.start -= dt; }

    // the right stick: turning and flicks in first person, look in third person / in the gunship
    let ox = 0, oy = 0;
    const menu = !!this.menuScreen();
    if (this.ownsCamera() && G.state === 'playing') {
      if (G.settings.vrTurn === 'smooth') { if (Math.abs(rx) > 0.15) this.yaw -= rx * 2.4 * dt; }
      else if (!this.turnHeld && Math.abs(rx) > 0.7) { this.yaw -= Math.sign(rx) * SNAP; this.turnHeld = true; }
      if (Math.abs(rx) < 0.35) this.turnHeld = false;
      // flick up: spot / scan; flick down: crouch
      if (!this.flick && Math.abs(ry) > 0.75 && Math.abs(ry) > Math.abs(rx)) this.flick = ry < 0 ? 12 : 13;
      if (this.flick && Math.abs(ry) < 0.35) this.flick = 0;
      if (this.flick) b[this.flick] = 1;
    } else if (!menu) { ox = rx; oy = ry; }

    this.vpad = {
      id: 'VR controllers (WebXR)', index: 99, connected: true, mapping: 'standard', timestamp: performance.now(),
      buttons: b.map((x) => ({ pressed: x > 0.5, value: x, touched: x > 0 })),
      axes: [lx, ly, ox, oy], vibrationActuator: this.haptic,
    };
    pad.virtual = this.vpad;
    pad.active = true;
  }

  // ------------------------------------------------------------------ per frame
  /** First person: the headset sets where the commander looks (and so where they walk). Before the game update. */
  preUpdate() {
    const own = this.ownsCamera(), G = this.G, p = G.player;
    if (own && !this.wasOwn) {
      // face the way the commander was facing
      this.cam.matrix.decompose(_p, _q, _s);
      _e.setFromQuaternion(_q, 'YXZ');
      this.yaw = p.camYaw - Math.PI - _e.y;
      this.placeFirstPerson(0);
    }
    this.wasOwn = own;
    if (!own) return;
    this.rig.updateMatrixWorld(true);
    this.cam.matrixWorld.decompose(_p, _q, _s);
    _d.set(0, 0, -1).applyQuaternion(_q);
    p.camYaw = Math.atan2(_d.x, _d.z);
    p.camPitch = clamp(Math.asin(clamp(_d.y, -1, 1)), -1.0, 1.15);
    const cam = G.camera;
    cam.position.copy(_p);
    cam.quaternion.copy(_q);
    cam.updateMatrixWorld();
  }

  /** Head position in the play space, and its slowly-following centre. */
  trackBase(dt) {
    const h = this.cam.position;
    if (!this.base) { this.base = h.clone(); if (this.base.y < 0.3) this.base.y = 1.6; return; }
    const kx = 1 - Math.exp(-dt * 0.7), ky = 1 - Math.exp(-dt * 0.35);
    this.base.x += (h.x - this.base.x) * kx;
    this.base.z += (h.z - this.base.z) * kx;
    if (h.y > 0.3) this.base.y += (h.y - this.base.y) * ky;
  }

  /** Put the rig so that the head's usual spot sits at `eye` (world), facing this.yaw. */
  placeAt(eye, yaw) {
    this.rig.rotation.set(0, yaw, 0);
    _v.copy(this.base || _v.set(0, 1.6, 0)).applyAxisAngle(THREE.Object3D.DEFAULT_UP, yaw);
    this.rig.position.copy(eye).sub(_v);
    this.rig.updateMatrixWorld(true);
  }

  placeFirstPerson() {
    const p = this.G.player, eyeH = (p.char.eyeH || 1.71);
    const eye = eyeH * (1 - (p.crouchK || 0) * 0.3) - (p.roll > 0 ? eyeH * 0.3 : 0);
    this.placeAt(_p.set(p.pos.x, p.pos.y + eye, p.pos.z), this.yaw);
  }

  /** After the game update: move the rig, the hands, the reticle and the panels. */
  postUpdate(dt) {
    this.syncButton();
    if (!this.presenting) return;
    const G = this.G, p = G.player, own = this.ownsCamera();
    this.trackBase(dt);
    if (own) this.placeFirstPerson();
    else {
      // ride the game camera, heading only
      const c = G.camera;
      c.updateMatrixWorld();
      _e.setFromQuaternion(c.quaternion, 'YXZ');
      this.placeAt(c.position, _e.y);
    }
    this.showBody(own ? p.char : null);
    this.updateHands(own);
    const scr = this.menuScreen();
    this.updateMenu(scr, dt);
    this.updateReticle(own, scr);
    this.updateHud(dt, scr);
    const fo = this.fadeEl ? parseFloat(getComputedStyle(this.fadeEl).opacity) || 0 : 0;
    this.fade.material.opacity = fo;
    this.fade.visible = fo > 0.01;
  }

  /** Hide your own body in first person (you would be looking out from inside the helmet). */
  showBody(char) {
    if (this.hidden && this.hidden !== char) this.hidden.model.visible = true;
    this.hidden = char;
    if (char) char.model.visible = false;
  }

  updateHands(own) {
    const G = this.G, key = own ? G.player.key : null;
    if (key !== this.kit) {
      for (const m of this.models) if (m && m.parent) m.parent.remove(m);
      this.models = [];
      this.kit = key;
    }
    for (const c of this.ctl) {
      if (!key || !c.hand) { if (this.models[c.i]) this.models[c.i].visible = false; continue; }
      const right = c.hand === 'right';
      const want = key === 'yoda' ? (right ? 'saber' : null) : key === 'fox' ? 'pistol' : right ? 'rifle' : null;
      let m = this.models[c.i];
      if (m && m.userData.kind !== want) { m.parent.remove(m); m = this.models[c.i] = null; }
      if (!m && want) {
        const accent = { cody: '#e2761b', fox: '#c0302a', gree: '#55703a' }[key] || '#3aa0ff';
        m = want === 'saber' ? saber() : blaster(accent, want === 'pistol');
        m.userData.kind = want;
        c.ray.add(m);
        this.models[c.i] = m;
      }
      if (m) m.visible = true;
    }
  }

  /** Where your shots go (there is no screen crosshair in a headset): the commander's aim point, or the gunship's. */
  updateReticle(own, scr) {
    const G = this.G, p = G.player;
    const R = this.anyHand('right');
    let pt = null;
    if (!scr && G.state === 'playing' && p && p.alive && !(p.cfg && p.cfg.melee)) {
      if (p.aimAt && !p.isGunship) pt = p.aimAt;
      else {
        G.camera.getWorldDirection(_d);
        const h = G.world.raycast(G.camera.position, _d, 400, 'shot');
        pt = this.reticle.userData.pt ||= new THREE.Vector3();
        pt.copy(G.camera.position).addScaledVector(_d, h ? h.dist : 300);
      }
    }
    this.reticle.visible = !!pt;
    if (pt) {
      this.reticle.position.copy(pt);
      this.cam.getWorldPosition(_v);
      const dist = _v.distanceTo(pt);
      const hit = G.hud.hitT > 0;
      this.reticle.scale.setScalar(Math.max(0.02, dist * (hit ? 0.02 : 0.011)));
      this.reticle.lookAt(_v);
      this.reticle.material.color.set(hit ? 0xffffff : p.aimEnemy ? 0xff4a3a : 0xe8f4ff);
    }
    // the laser: to the menu, or (first person) a faint one to the reticle
    const menuOn = this.menu.mesh.visible, aim = own && pt;
    if (R && (menuOn || aim)) {
      if (this.laser.parent !== R.ray) R.ray.add(this.laser);
      const L = menuOn ? (this.menuHitDist || 3) : Math.min(30, R.o.distanceTo(pt));
      this.laser.scale.set(1, 1, L);
      this.laser.material.opacity = menuOn ? 0.75 : 0.22;
      this.laser.visible = true;
    } else this.laser.visible = false;
  }

  // ------------------------------------------------------------------ menu panel
  rowLabel(el) {
    if (el.matches('.card, .hcard')) {
      const sub = txt(el.querySelector('h3'));
      return { text: txt(el.querySelector('h2')), sub: sub + (el.matches('.card') && el.classList.contains('sel') ? '  ·  SELECTED' : ''), big: true };
    }
    if (el.matches('.perk')) return { text: txt(el.querySelector('h4')) + '  ·  ' + txt(el.querySelector('span')), sub: txt(el.querySelector('p')), dim: el.classList.contains('na'), on: el.classList.contains('sel') };
    const label = el.closest('label');
    if (el.matches('input[type=checkbox]')) return { text: ownText(label), value: el.checked ? 'ON' : 'OFF' };
    if (el.matches('input[type=range]')) return { text: ownText(label), range: (el.value - el.min) / (el.max - el.min || 1) };
    if (el.matches('select')) return { text: ownText(label), value: el.options[el.selectedIndex] ? el.options[el.selectedIndex].text : '' };
    return { text: txt(el), primary: el.classList.contains('primary') };
  }

  vrRow(id) {
    const s = this.G.settings;
    const t = {
      view: 'VR VIEW: ' + (s.vrView === 'first' ? 'FIRST PERSON' : 'THIRD PERSON'),
      turn: 'TURNING: ' + (s.vrTurn === 'snap' ? 'SNAP' : 'SMOOTH'),
      recenter: 'RECENTER VIEW',
      dev: 'DEV MENU',
      exit: 'EXIT VR',
    }[id];
    return { vr: id, text: t, vrRow: true };
  }

  runVrRow(id) {
    const G = this.G, s = G.settings;
    if (id === 'view') s.vrView = s.vrView === 'first' ? 'third' : 'first';
    else if (id === 'turn') s.vrTurn = s.vrTurn === 'snap' ? 'smooth' : 'snap';
    else if (id === 'recenter') { this.base = null; this.wasOwn = false; this.lastScreen = null; }
    else if (id === 'dev') { if (G.toggleDev) G.toggleDev(true); }
    else if (id === 'exit') { if (this.session) this.session.end(); }
    try { localStorage.setItem('gcd-settings-v1', JSON.stringify(s)); } catch { /* storage unavailable */ }
  }

  placeMenu() {
    // in front of where you are looking now, at a comfortable height (until the headset reports a pose: standing height)
    const h = this.cam.position.y > 0.3 ? this.cam.position : this.base || _v.set(0, 1.6, 0);
    this.cam.matrix.decompose(_p, _q, _s);
    _e.setFromQuaternion(_q, 'YXZ');
    const yaw = _e.y;
    this.menu.mesh.position.set(h.x - Math.sin(yaw) * 1.5, h.y - 0.12, h.z - Math.cos(yaw) * 1.5);
    this.menu.mesh.rotation.set(-0.08, yaw, 0, 'YXZ');
  }

  updateMenu(scr, dt) {
    const M = this.menu, G = this.G;
    if (!scr) { M.mesh.visible = false; this.lastScreen = null; this.menuHitDist = 0; return; }
    if (scr !== this.lastScreen) { this.lastScreen = scr; this.scroll = 0; this.hover = -1; this.placeT = 1; }
    // (placed for a moment after it opens, so it lands where you look even if the headset pose was late)
    if (this.placeT > 0) { this.placeT -= dt; this.placeMenu(); }
    M.mesh.visible = true;
    const items = G.padUI.items(scr);
    const extra = scr.id === 'pause' ? VR_ROWS_PAUSE : scr.id === 'title' ? VR_ROWS_TITLE : [];
    const list = items.map((el) => ({ el, ...this.rowLabel(el) })).concat(extra.map((id) => this.vrRow(id)));

    // point at a row
    const R = this.anyHand('right');
    let hover = -1, hu = 0;
    this.menuHitDist = 0;
    if (R) {
      _ray.set(R.o, R.d);
      M.mesh.updateMatrixWorld();
      const hit = _ray.intersectObject(M.mesh, false)[0];
      if (hit && hit.uv) {
        this.menuHitDist = hit.distance;
        const x = hit.uv.x * M.w, y = (1 - hit.uv.y) * M.h;
        for (const r of this.rows) if (y >= r.y0 && y < r.y1 && x > 40 && x < M.w - 40) { hover = r.i; hu = (x - r.x0) / (r.x1 - r.x0); }
      }
    }
    if (hover !== this.hover) {
      this.hover = hover;
      if (hover >= 0) {
        const row = list[hover];
        if (row && row.el && G.padUI.focus !== row.el) G.padUI.setFocus(row.el);
        G.sound.ui();
        if (R && R.src.gamepad.hapticActuators && R.src.gamepad.hapticActuators[0]) try { R.src.gamepad.hapticActuators[0].pulse(0.15, 18); } catch { /* none */ }
      }
    }
    // pull the trigger on it
    if (R && R.trig && !R.trigPrev && hover >= 0 && list[hover]) {
      const row = list[hover];
      this.suppressRT = true;
      G.sound.init();
      if (row.vrRow) this.runVrRow(row.vr);
      else if (row.el.matches('input[type=range]')) {
        const el = row.el, v = +el.min + clamp(hu, 0, 1) * (+el.max - +el.min);
        el.value = v;
        el.dispatchEvent(new Event('input', { bubbles: true }));
      } else G.padUI.activate(row.el);
      G.sound.ui();
    }

    if ((M.t -= dt) > 0) return;
    M.t = 1 / 15;
    this.drawMenu(scr, list);
  }

  drawMenu(scr, list) {
    const M = this.menu, g = M.g, W = M.w, H = M.h, G = this.G;
    g.clearRect(0, 0, W, H);
    g.fillStyle = 'rgba(6, 10, 18, 0.9)';
    g.fillRect(0, 0, W, H);
    g.strokeStyle = 'rgba(140, 190, 255, 0.5)';
    g.lineWidth = 3;
    g.strokeRect(2, 2, W - 4, H - 4);
    let y = 70;
    const head = scr.id === 'title' ? 'GALACTIC CITY DEFENSE'
      : txt(scr.querySelector('.logo, .dev-title, #pickAct')) || scr.id.toUpperCase();
    g.textAlign = 'center';
    g.fillStyle = '#fff';
    g.font = '700 46px "Segoe UI", Arial, sans-serif';
    g.fillText(head.replace(/Ctrl\+X.*$/, '').trim(), W / 2, y);
    y += 22;
    // summaries (match stats, game over)
    const info = [];
    const stats = scr.querySelector('#goStats, #vicStats');
    if (scr.id === 'victory') info.push(txt(scr.querySelector('#vicScore')));
    if (stats) {
      const lines = stats.innerText.split('\n').map((s) => s.trim()).filter(Boolean);
      for (let i = 0; i + 1 < lines.length; i += 2) info.push(lines[i] + ': ' + lines[i + 1]);
    }
    if (scr.id === 'title' || scr.id === 'pause') info.push('Move L-stick · Turn R-stick · Fire R-trigger · Aim L-trigger · Jump A · Roll B · Vent X · Grenade Y · Abilities grips · Spot R-stick up · Crouch R-stick down · Pause both sticks');
    g.font = '400 22px "Segoe UI", Arial, sans-serif';
    g.fillStyle = 'rgba(210, 225, 245, 0.85)';
    const infoLines = [];
    for (const s of info) infoLines.push(...wrap(g, s, W - 120));
    for (const l of infoLines.slice(0, 7)) { y += 28; g.fillText(l, W / 2, y); }
    y += 26;

    // rows, scrolled to keep the focus (or the pointed-at row) in view
    const rowH = (r) => (r.big || r.sub ? 84 : 58);
    const focusIdx = Math.max(this.hover, list.findIndex((r) => r.el && r.el === G.padUI.focus));
    const room = H - y - 30;
    let first = this.scroll;
    const fits = (from, to) => { let h = 0; for (let i = from; i <= to; i++) h += rowH(list[i]) + 8; return h <= room; };
    if (focusIdx >= 0) {
      if (focusIdx < first) first = focusIdx;
      while (first < focusIdx && !fits(first, focusIdx)) first++;
    }
    this.scroll = first;
    this.rows = [];
    g.textAlign = 'left';
    for (let i = first; i < list.length; i++) {
      const r = list[i], h = rowH(r);
      if (y + h > H - 24) break;
      const x0 = 60, x1 = W - 60;
      const focus = i === focusIdx;
      g.fillStyle = focus ? 'rgba(60, 140, 255, 0.45)' : r.primary ? 'rgba(40, 90, 170, 0.5)' : r.vrRow ? 'rgba(40, 60, 90, 0.55)' : 'rgba(255, 255, 255, 0.07)';
      g.fillRect(x0, y, x1 - x0, h);
      if (focus) { g.strokeStyle = '#9fd0ff'; g.lineWidth = 3; g.strokeRect(x0 + 1.5, y + 1.5, x1 - x0 - 3, h - 3); }
      if (r.on) { g.fillStyle = '#ffd257'; g.fillRect(x0, y, 8, h); }
      g.fillStyle = r.dim ? 'rgba(255,255,255,0.4)' : '#fff';
      g.font = (r.big ? '700 32px' : '600 26px') + ' "Segoe UI", Arial, sans-serif';
      const ty = r.sub ? y + 36 : y + h / 2 + 9;
      g.fillText(r.text.slice(0, 60), x0 + 24, ty);
      if (r.sub) {
        g.font = '400 20px "Segoe UI", Arial, sans-serif';
        g.fillStyle = 'rgba(210, 225, 245, 0.75)';
        g.fillText(r.sub.slice(0, 80), x0 + 24, y + 66);
      }
      let bx0 = x0, bx1 = x1;
      if (r.value !== undefined) {
        g.textAlign = 'right';
        g.font = '700 24px "Segoe UI", Arial, sans-serif';
        g.fillStyle = '#9fd0ff';
        g.fillText(r.value, x1 - 24, y + h / 2 + 9);
        g.textAlign = 'left';
      }
      if (r.range !== undefined) {
        bx0 = x0 + 520; bx1 = x1 - 30;
        const by = y + h / 2 - 5;
        g.fillStyle = 'rgba(255,255,255,0.2)';
        g.fillRect(bx0, by, bx1 - bx0, 10);
        g.fillStyle = '#5ab8ff';
        g.fillRect(bx0, by, (bx1 - bx0) * clamp(r.range, 0, 1), 10);
      }
      this.rows.push({ i, y0: y, y1: y + h, x0: bx0, x1: bx1 });
      y += h + 8;
    }
    g.textAlign = 'center';
    g.font = '400 18px "Segoe UI", Arial, sans-serif';
    g.fillStyle = 'rgba(200, 215, 235, 0.6)';
    g.fillText('Point and pull the trigger · or L-stick and A · B goes back', W / 2, H - 14);
    M.tex.needsUpdate = true;
  }

  // ------------------------------------------------------------------ HUD panel
  updateHud(dt, scr) {
    const P = this.hud, G = this.G, st = G.state;
    const sub = G.hud.subT > 0, banner = G.hud.bannerT > 0, toast = G.hud.toastT > 0;
    const live = (st === 'playing' || st === 'dead') && !!G.player;
    P.mesh.visible = !scr && (live || sub || banner || st === 'cutscene' || st === 'outro');
    if (!P.mesh.visible || (P.t -= dt) > 0) return;
    P.t = 1 / 12;
    const g = P.g, W = P.w, H = P.h, p = G.player, F = '"Segoe UI", Arial, sans-serif';
    g.clearRect(0, 0, W, H);
    const shadow = (on) => { g.shadowColor = on ? 'rgba(0,0,0,0.9)' : 'transparent'; g.shadowBlur = on ? 6 : 0; };
    shadow(true);
    // damage / low health: red at the edges
    const low = live && p.alive ? clamp((0.35 - p.hp / p.maxHp) / 0.35, 0, 1) : 0;
    const vig = Math.max(G.hud.vignette || 0, low * 0.7);
    if (vig > 0.02) {
      shadow(false);
      const gr = g.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, W * 0.62);
      gr.addColorStop(0, 'rgba(200,20,10,0)');
      gr.addColorStop(1, `rgba(200,20,10,${(vig * 0.55).toFixed(3)})`);
      g.fillStyle = gr;
      g.fillRect(0, 0, W, H);
      shadow(true);
    }
    if (live) {
      // objective, top centre
      g.textAlign = 'center';
      g.fillStyle = '#fff';
      g.font = `600 34px ${F}`;
      g.fillText(`${txt(document.getElementById('objPhase'))}  ·  ${txt(document.getElementById('objText'))}`, W / 2, 40);
      g.font = `400 26px ${F}`;
      g.fillStyle = 'rgba(220,230,245,0.85)';
      g.fillText(txt(document.getElementById('objSub')), W / 2, 66);
      const stEl = document.getElementById('objStatus');
      if (stEl && !stEl.classList.contains('hidden')) g.fillText(txt(stEl), W / 2, 90);
      const boss = document.getElementById('bossBar');
      if (boss && !boss.classList.contains('hidden') && G.boss) {
        const k = clamp((G.dookuHp ?? G.boss.hp ?? 0) / (G.dookuMaxHp || G.boss.maxHp || 1), 0, 1);
        g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(W / 2 - 220, 104, 440, 12);
        g.fillStyle = '#e0342a'; g.fillRect(W / 2 - 220, 104, 440 * k, 12);
        g.fillStyle = '#fff'; g.font = `700 23px ${F}`; g.fillText(txt(document.getElementById('bossName')), W / 2, 100);
      }
      // BP and reinforcements, top right
      g.textAlign = 'right';
      g.font = `700 39px ${F}`;
      g.fillStyle = '#fff';
      g.fillText(txt(document.getElementById('bpValue')) + ' BP', W - 70, 48);
      g.font = `400 23px ${F}`;
      g.fillStyle = G.tickets <= 8 ? '#ff8a6e' : 'rgba(220,230,245,0.85)';
      g.fillText('REINFORCEMENTS ' + G.tickets, W - 70, 74);
      // health, bottom left
      const hx = 90, hy = H - 120;
      g.textAlign = 'left';
      g.fillStyle = '#fff';
      g.font = `700 29px ${F}`;
      g.fillText(txt(document.getElementById('hudName')), hx, hy);
      const hk = clamp(p.hp / p.maxHp, 0, 1);
      g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(hx, hy + 12, 320, 16);
      g.fillStyle = hk < 0.35 ? '#ff4a3a' : '#f2f2f2'; g.fillRect(hx, hy + 12, 320 * hk, 16);
      g.font = `600 26px ${F}`;
      g.fillText(String(Math.ceil(p.hp)), hx + 330, hy + 28);
      // abilities: left grip, Y, right grip
      if (p.abilityState && p.cfg && p.cfg.abilities) {
        const names = ['L GRIP', 'Y', 'R GRIP'];
        for (let i = 0; i < 3; i++) {
          const a = p.abilityState(i), cx = hx + 30 + i * 92, cy = hy - 70;
          g.beginPath(); g.arc(cx, cy, 28, 0, Math.PI * 2);
          g.fillStyle = a.active ? 'rgba(90,184,255,0.7)' : a.ready ? 'rgba(255,255,255,0.28)' : 'rgba(0,0,0,0.45)';
          g.fill();
          if (!a.ready && !a.active && a.frac > 0) {
            g.beginPath(); g.moveTo(cx, cy); g.arc(cx, cy, 28, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - clamp(a.frac, 0, 1))); g.closePath();
            g.fillStyle = 'rgba(255,255,255,0.22)'; g.fill();
          }
          g.strokeStyle = a.ready ? '#9fd0ff' : 'rgba(255,255,255,0.35)'; g.lineWidth = 2; g.beginPath(); g.arc(cx, cy, 28, 0, Math.PI * 2); g.stroke();
          g.textAlign = 'center';
          g.fillStyle = '#fff';
          g.font = `700 21px ${F}`;
          g.fillText(a.time || a.count || (a.ready ? '●' : ''), cx, cy + 6);
          g.font = `600 17px ${F}`;
          g.fillStyle = 'rgba(220,230,245,0.85)';
          g.fillText(names[i], cx, cy + 46);
          const nm = p.cfg.abilities[i] && p.cfg.abilities[i].name;
          if (nm) { g.font = `400 16px ${F}`; g.fillText(nm.toUpperCase().slice(0, 16), cx, cy - 36); }
        }
      }
      // weapon heat, bottom right
      if (!p.cfg || !p.cfg.melee) {
        const wx = W - 420, wy = H - 108;
        g.textAlign = 'left';
        g.fillStyle = '#fff';
        g.font = `700 26px ${F}`;
        g.fillText(txt(document.getElementById('weaponName')), wx, wy);
        const heat = clamp((p.heat || 0) / 100, 0, 1);
        g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(wx, wy + 12, 330, 14);
        g.fillStyle = p.overheat > 0 ? '#ff5a3a' : heat > 0.75 ? '#ffb347' : '#5ab8ff';
        g.fillRect(wx, wy + 12, 330 * heat, 14);
        if (p.vent && p.overheat > 0 && p.vent.state === 'open') {
          g.fillStyle = 'rgba(90,184,255,0.75)';
          g.fillRect(wx + 330 * p.vent.a, wy + 8, 330 * (p.vent.b - p.vent.a), 22);
          g.fillStyle = '#fff';
          g.fillRect(wx + 330 * clamp(p.vent.t / p.vent.sweep, 0, 1) - 2, wy + 4, 4, 30);
          g.font = `600 21px ${F}`;
          g.fillText('PRESS X IN THE BLUE ZONE TO VENT', wx, wy + 52);
        } else if (p.overheat > 0) {
          g.font = `600 21px ${F}`; g.fillStyle = '#ff8a6e'; g.fillText('OVERHEATED', wx, wy + 52);
        }
        g.font = `400 21px ${F}`;
        g.fillStyle = 'rgba(220,230,245,0.85)';
        const gr = txt(document.getElementById('grenades'));
        if (gr) g.fillText(gr, wx + 250, wy + 52);
      }
    }
    // banner and toast, centre
    g.textAlign = 'center';
    if (banner) {
      g.fillStyle = '#fff';
      g.font = `700 57px ${F}`;
      g.fillText(txt(document.getElementById('bannerTitle')), W / 2, 210);
      g.font = `400 31px ${F}`;
      g.fillStyle = 'rgba(230,236,248,0.9)';
      g.fillText(txt(document.getElementById('bannerSub')), W / 2, 246);
    }
    if (toast) {
      g.font = `600 29px ${F}`;
      g.fillStyle = '#ffd98a';
      g.fillText(txt(document.getElementById('toast')), W / 2, banner ? 290 : 250);
    }
    const tc = document.getElementById('titleCard');
    if (tc && tc.classList.contains('on')) {
      const lines = [...tc.children].map(txt).filter(Boolean);
      g.fillStyle = '#fff';
      lines.forEach((l, i) => { g.font = (i === 0 ? '700 50px ' : '400 30px ') + F; g.fillText(l, W / 2, 190 + i * 44); });
    }
    // subtitles, bottom centre
    if (sub) {
      const el = document.getElementById('subtitle');
      const who = txt(el.querySelector('b')), line = txt(el).slice(who.length).trim();
      g.font = `400 34px ${F}`;
      const lines = wrap(g, line, 800).slice(0, 3);
      const top = H - 34 - lines.length * 40;
      shadow(false);
      g.fillStyle = 'rgba(0,0,0,0.55)';
      g.fillRect(W / 2 - 420, top - 46, 840, lines.length * 40 + 56);
      shadow(true);
      g.fillStyle = '#ffd98a';
      g.font = `700 26px ${F}`;
      g.fillText(who, W / 2, top - 14);
      g.fillStyle = '#fff';
      g.font = `400 34px ${F}`;
      lines.forEach((l, i) => g.fillText(l, W / 2, top + 22 + i * 40));
    }
    shadow(false);
    P.tex.needsUpdate = true;
  }
}
