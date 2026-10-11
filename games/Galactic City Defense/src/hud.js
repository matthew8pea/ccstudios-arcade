import { clamp, angleDiff } from './util.js';
import { pad } from './gamepad.js';

const $ = (id) => document.getElementById(id);
const TAU = Math.PI * 2;

/** Phase II clone helmet emblem (original artwork). */
export function helmSVG(key) {
  const stripes = key === 'cody'
    ? '<path class="stripe" d="M28.5 7.2h7v18h-7z"/><path class="stripe" d="M14 36h8v9l-6-3zM42 36h8v6l-6 3z"/><path class="stripe" d="M18 4.5h28v3H18z" transform="rotate(-6 32 6)"/>'
    : '<path class="stripe" d="M21 11.5l4-2.4v16.9h-4zM39 9.1l4 2.4v14.5h-4z"/><path class="stripe" d="M13 35h10v12l-6-3-4-4zM41 35h10v5l-4 4-6 3z"/><path class="stripe" d="M15 26h34v2H15z"/>';
  return `<svg viewBox="0 0 64 64"><path class="shell" d="M32 5C18.6 5 10 14 10 27v12c0 3.5 1.6 6.4 4.6 8.2L21 51h22l6.4-3.8c3-1.8 4.6-4.7 4.6-8.2V27C54 14 45.4 5 32 5z"/>${stripes}<path class="visor" d="M15.5 28.5h33v6H35.2V49h-6.4V34.5H15.5z"/></svg>`;
}

/** Line icons for the hero ability slots (original). */
export const ICONS = {
  command: '<svg viewBox="0 0 24 24"><path d="M6 21V3"/><path d="M6 4h11l-2.5 4L17 12H6"/><path d="M9 7.5l1.5 1.5L13 6.5"/></svg>',
  thermal: '<svg viewBox="0 0 24 24"><circle cx="12" cy="13.5" r="7"/><path d="M5 13.5h14M12 3.5v3M9.5 6.5h5"/><circle cx="12" cy="13.5" r="1.4"/></svg>',
  barrage: '<svg viewBox="0 0 24 24"><path d="M2.5 5.5h19M7 5.5l1.5-2.5h7L17 5.5M9 8.5l-2 4M12 8.5v5M15 8.5l2 4"/><path d="M6 17l1 3M12 16.5v4M18 17l-1 3"/></svg>',
  riot: '<svg viewBox="0 0 24 24"><path d="M10 3.5l7 2.6v5.2c0 4.6-3 7.7-7 9.2-4-1.5-7-4.6-7-9.2V6.1z"/><path d="M15 12h7M19 9l3 3-3 3"/></svg>',
  stun: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M13.5 5.5L9 12.5h4.5L11 18.5"/></svg>',
  overdrive: '<svg viewBox="0 0 24 24"><path d="M5 12.5l7-6.5 7 6.5M5 19l7-6.5 7 6.5"/><path d="M12 2.5v2"/></svg>',
  push: '<svg viewBox="0 0 24 24"><path d="M4 12h5"/><path d="M11 7c3 1.5 3 8.5 0 10M15 5c4.5 2.5 4.5 11.5 0 14M19 3.5c5.5 3.5 5.5 13.5 0 17"/></svg>',
  rush: '<svg viewBox="0 0 24 24"><path d="M6 18L18 6"/><path d="M4 20l3-1-2-2z"/><path d="M3 9h6M2 13h5M8 5h5"/></svg>',
  wave: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="2.5"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="9.5"/></svg>',
};

const WEAPON_SVG = {
  cody: '<svg viewBox="0 0 150 30"><path d="M4 13h20l4-3h40l3-4h22l2 4h18v3h34v4h-34v3H95l-3 5H78l-2-5H40l-6 9H22l3-9H4z"/><rect x="58" y="3" width="26" height="4" rx="1"/></svg>',
  fox: '<svg viewBox="0 0 150 30"><path d="M6 8h34l2-3h14v4h6v4h-6v2H34l-4 12H20l3-12H6z"/><path d="M80 8h34l2-3h14v4h6v4h-6v2h-22l-4 12H94l3-12H80z"/></svg>',
};

const KILL_ICON = '<svg viewBox="0 0 22 12"><path d="M1 6h13M14 3h5v6h-5M5 6V9"/></svg>';
const HEAD_ICON = '<svg class="head" viewBox="0 0 22 12"><circle cx="11" cy="6" r="4.5"/><path d="M11 0v3M11 9v3M5 6h3M14 6h3"/></svg>';

export class HUD {
  constructor() {
    this.el = {};
    for (const id of ['loading', 'loadbar', 'loadtext', 'title', 'hud', 'radar', 'objPhase', 'objText', 'objFill', 'objTimer', 'objSub',
      'feed', 'bpFeed', 'bpValue', 'health', 'hudName', 'heroTag', 'hpText', 'hpGhost', 'hpFill', 'hudUnit', 'weapon', 'weaponIcon',
      'weaponName', 'heatFill', 'heatZone', 'heatMark', 'heatLabel', 'grenades', 'dmgDirs', 'crosshair', 'heatArc', 'heatArcFill',
      'aimName', 'hitmarker', 'ventPrompt', 'banner', 'bannerTitle', 'bannerSub', 'toast', 'odTint', 'dmgVignette',
      'cine', 'titleCard', 'subtitle', 'skipHint', 'pause', 'gameover', 'fade', 'engage', 'goStats', 'bossBar', 'bossFill', 'bossGhost']) {
      this.el[id] = $(id);
    }
    this.radarCtx = this.el.radar.getContext('2d');
    this.slots = [...document.querySelectorAll('#abilities .ability')].map((el) => ({
      el, ring: el.querySelector('.ab-sweep'), icon: el.querySelector('.ab-icon'), time: el.querySelector('.ab-time'),
      key: el.querySelector('.ab-key'), count: el.querySelector('.ab-count'), ready: false, pulseT: 0,
    }));
    this.arcs = [];
    for (let i = 0; i < 6; i++) {
      const d = document.createElement('div');
      d.className = 'dmgArc';
      this.el.dmgDirs.appendChild(d);
      this.arcs.push({ el: d, t: 0, x: 0, z: 0, obj: null, k: 0 });
    }
    this.bannerT = 0;
    this.toastT = 0;
    this.subT = 0;
    this.hitT = 0;
    this.vignette = 0;
    this.titleT = null;
    this.ghost = 1;
    this.ghostHold = 0;
    this.cache = {};
  }

  // cached DOM writes (the HUD updates every frame; only touch the DOM when something changed)
  txt(key, el, v) { if (this.cache[key] !== v) { this.cache[key] = v; el.textContent = v; } }
  sty(key, el, prop, v) { if (this.cache[key] !== v) { this.cache[key] = v; el.style.setProperty(prop, v); } }
  cls(key, el, c, on) { const k = key + c; if (this.cache[k] !== on) { this.cache[k] = on; el.classList.toggle(c, on); } }

  show(name, on = true) { this.el[name].classList.toggle('hidden', !on); }

  loading(p, text) {
    this.el.loadbar.style.width = `${Math.round(p * 100)}%`;
    if (text) this.el.loadtext.textContent = text;
  }

  setCommander(key, cfg) {
    this.el.hudName.textContent = cfg.short;
    this.el.hudUnit.textContent = cfg.unit.toUpperCase();
    this.el.weaponName.textContent = cfg.weapon;
    this.el.weaponIcon.innerHTML = WEAPON_SVG[key] || '';
    this.el.hud.dataset.cmdr = key;
    this.el.health.classList.add('hero');
    cfg.abilities.forEach((a, i) => {
      const s = this.slots[i];
      if (!s) return;
      s.icon.innerHTML = ICONS[a.icon] || '';
      pad.decorate(s.key, ['ability1', 'ability2', 'special'][i], a.label);
      s.el.title = a.name;
      s.ready = false;
    });
    this.cache = {};
    this.ghost = 1;
    this.el.feed.innerHTML = '';
    this.el.bpFeed.innerHTML = '';
  }

  letterbox(on) { this.el.cine.classList.toggle('on', on); this.el.skipHint.classList.toggle('hidden', !on); }

  titleCard(lines, delay = 0, dur = 4, big = false) {
    const el = this.el.titleCard;
    clearTimeout(this.titleT);
    clearTimeout(this.titleT2);
    if (!lines) { el.classList.remove('on'); return; }
    el.innerHTML = `<div class="tc1${big ? ' big' : ''}">${lines[0]}</div><div class="tc2">${lines[1] || ''}</div><div class="tc3">${lines[2] || ''}</div>`;
    this.titleT = setTimeout(() => el.classList.add('on'), delay * 1000);
    this.titleT2 = setTimeout(() => el.classList.remove('on'), (delay + dur) * 1000);
  }

  subtitle(who, text, dur = 3) {
    const el = this.el.subtitle;
    if (!who) { el.classList.remove('on'); this.subT = 0; return; }
    el.innerHTML = `<b class="${who.toLowerCase()}">${who}</b> ${text}`;
    el.classList.add('on');
    this.subT = dur;
  }

  banner(title, sub) {
    this.el.bannerTitle.textContent = title;
    this.el.bannerSub.textContent = sub || '';
    this.el.banner.classList.remove('on');
    void this.el.banner.offsetWidth;
    this.el.banner.classList.add('on');
    this.bannerT = 3.2;
  }

  toast(text) {
    this.el.toast.textContent = text;
    this.el.toast.classList.add('on');
    this.toastT = 2.2;
  }

  /** Battle Points popup (center-right), e.g. ELIMINATION +100. */
  bp(label, amount, kind = '') {
    const d = document.createElement('div');
    d.className = 'bp' + (kind ? ' ' + kind : '');
    d.innerHTML = `<span>${label}</span><b>+${amount}</b>`;
    this.el.bpFeed.appendChild(d);
    while (this.el.bpFeed.children.length > 6) this.el.bpFeed.firstChild.remove();
    setTimeout(() => d.classList.add('fade'), 2300);
    setTimeout(() => d.remove(), 2850);
  }

  /** Kill feed line: killer -> icon -> victim. Teams: 'rep' (blue), 'sep' (red), 'reb' (green). */
  killFeed(killer, kTeam, victim, vTeam, head = false) {
    const d = document.createElement('div');
    d.className = 'kill';
    d.innerHTML = `<span class="${kTeam}">${killer}</span>${head ? HEAD_ICON : KILL_ICON}<span class="${vTeam}">${victim}</span>`;
    this.el.feed.prepend(d);
    while (this.el.feed.children.length > 5) this.el.feed.lastChild.remove();
    setTimeout(() => d.classList.add('fade'), 4200);
    setTimeout(() => d.remove(), 5000);
  }

  /** White X on hit, thicker red X on a kill, a crisp diamond-framed X on a headshot. */
  hitMarker(head, kill) {
    const el = this.el.hitmarker;
    el.className = 'on' + (head ? ' head' : '') + (kill ? ' kill' : '');
    this.hitT = kill ? 0.34 : head ? 0.2 : 0.12;
  }

  /** Damage direction: `from` is a world position, `obj` (optional) keeps the arc tracking a moving attacker. */
  damage(from, pos, camYaw, dmg, obj = null) {
    this.vignette = Math.min(1, this.vignette + dmg * 0.04);
    if (!from) return;
    let a = this.arcs.find((x) => x.obj && x.obj === obj && x.t > 0) || this.arcs.find((x) => x.t <= 0);
    if (!a) a = this.arcs.reduce((m, x) => (x.t < m.t ? x : m));
    a.x = from.x; a.z = from.z; a.obj = obj;
    a.t = 1.3;
    a.k = Math.min(1, (a.t > 0 ? a.k : 0) + clamp(dmg / 22, 0.3, 1));
  }

  fade(on, ms = 600) {
    this.el.fade.style.transitionDuration = `${ms}ms`;
    this.el.fade.classList.toggle('on', on);
  }

  update(dt, G) {
    const p = G.player, el = this.el;
    if (this.bannerT > 0) { this.bannerT -= dt; if (this.bannerT <= 0) el.banner.classList.remove('on'); }
    if (this.toastT > 0) { this.toastT -= dt; if (this.toastT <= 0) el.toast.classList.remove('on'); }
    if (this.subT > 0) { this.subT -= dt; if (this.subT <= 0) el.subtitle.classList.remove('on'); }
    if (this.hitT > 0) { this.hitT -= dt; if (this.hitT <= 0) el.hitmarker.className = ''; }
    this.vignette = Math.max(0, this.vignette - dt * 1.4);
    this.sty('vig', el.dmgVignette, 'opacity', this.vignette.toFixed(2));
    // Count Dooku's health under the objective while he is on the field
    const boss = G.boss;
    const bossOn = !!boss && boss.alive && !boss.defeated && G.state === 'playing' && boss.state !== 'scripted';
    this.cls('boss', el.bossBar, 'hidden', !bossOn);
    if (bossOn) {
      const k = clamp(boss.hp / boss.maxHp, 0, 1);
      this.sty('bf', el.bossFill, 'width', `${(k * 100).toFixed(1)}%`);
      this.sty('bg', el.bossGhost, 'width', `${(k * 100).toFixed(1)}%`);
    }
    if (!p || G.state !== 'playing') return;

    // health: white snaps down, the red ghost catches up a moment later
    const hpK = clamp(p.hp / p.maxHp, 0, 1);
    if (hpK < this.ghost) {
      if (this.lastHp !== undefined && hpK < this.lastHp - 1e-4) this.ghostHold = 0.55;
      this.ghostHold -= dt;
      if (this.ghostHold <= 0) this.ghost = Math.max(hpK, this.ghost - dt * 0.9);
    } else this.ghost = hpK;
    this.lastHp = hpK;
    this.sty('hpw', el.hpFill, 'width', `${(hpK * 100).toFixed(1)}%`);
    this.sty('hpg', el.hpGhost, 'width', `${(this.ghost * 100).toFixed(1)}%`);
    this.txt('hpt', el.hpText, String(Math.ceil(p.hp)));
    this.cls('hp', el.health, 'regen', p.regenerating);
    this.cls('hp', el.health, 'low', hpK < 0.35);

    // abilities: radial cooldown sweep, pulse + sound when one comes back
    for (let i = 0; i < this.slots.length; i++) {
      const s = this.slots[i], st = p.abilityState(i);
      this.sty('cd' + i, s.ring, '--cd', st.frac.toFixed(3));
      this.cls('ab' + i, s.el, 'ready', st.ready);
      this.cls('ab' + i, s.el, 'cooling', !st.ready && !st.active);
      this.cls('ab' + i, s.el, 'active', st.active);
      this.txt('abt' + i, s.time, st.time);
      this.txt('abc' + i, s.count, st.count);
      if (st.ready && !s.ready && G.time > 1) {
        s.pulseT = 0.7;
        s.el.classList.add('pulse');
        G.sound.abilityReady();
      }
      s.ready = st.ready;
      if (s.pulseT > 0) { s.pulseT -= dt; if (s.pulseT <= 0) s.el.classList.remove('pulse'); }
    }

    // weapon heat, the active-cooling zone, and the heat arc beside the crosshair
    const heat = clamp(p.heat, 0, 100);
    this.sty('heat', el.heatFill, 'width', `${heat.toFixed(1)}%`);
    this.cls('hf', el.heatFill, 'warm', heat > 55 && heat <= 80);
    this.cls('hf', el.heatFill, 'hot', heat > 80 || p.overheat > 0);
    const v = p.overheat > 0 ? p.vent : null;
    this.cls('wp', el.weapon, 'venting', !!v);
    if (v) {
      this.sty('za', el.heatZone, 'left', `${(v.a * 100).toFixed(1)}%`);
      this.sty('zw', el.heatZone, 'width', `${((v.b - v.a) * 100).toFixed(1)}%`);
      this.sty('mk', el.heatMark, 'left', `${(Math.min(1, v.t / v.sweep) * 100).toFixed(1)}%`);
      this.cls('zm', el.heatZone, 'missed', v.state !== 'open');
    }
    this.cls('vp', el.ventPrompt, 'on', !!v && v.state === 'open');
    this.txt('hl', el.heatLabel, p.overdrive > 0 ? 'OVERDRIVE' : v ? (v.state === 'failed' ? 'VENT FAILED' : 'OVERHEATED') : p.coolBuff > 0 ? 'COOLED · +DMG' : 'HEAT');
    this.txt('gr', el.grenades, p.grenadeText());
    this.sty('arc', el.heatArcFill, 'stroke-dasharray', `${heat.toFixed(1)} 100`);
    this.sty('arcc', el.heatArcFill, 'stroke', heat > 80 || p.overheat > 0 ? '#ff4b3a' : heat > 55 ? '#ffae5a' : '#ffffff');
    this.cls('arc', el.heatArc, 'idle', heat < 2 && p.overheat <= 0);

    // crosshair: blooms with sustained fire and movement, red over an enemy
    const moving = Math.hypot(p.vel.x, p.vel.z) > 1;
    const gap = (p.aim > 0.5 ? 6 : 11) + p.bloom * 520 + (moving ? 5 : 0) + (p.onGround ? 0 : 6);
    this.sty('gap', el.crosshair, '--gap', `${gap.toFixed(1)}px`);
    const ae = p.aimEnemy;
    this.cls('ch', el.crosshair, 'enemy', !!ae);
    this.cls('an', el.aimName, 'on', !!ae);
    if (ae) this.txt('an', el.aimName, ae.cfg.name);
    el.odTint.classList.toggle('on', p.overdrive > 0);

    // objective tracker
    const w = G.waves;
    const last = w.wave >= G.finalWave && !G.endless;
    this.txt('op', el.objPhase, last ? 'FINAL WAVE' : w.wave ? `WAVE ${w.wave}` : 'STAND BY');
    this.txt('otx', el.objText, last ? 'HOLD FOR EXTRACTION' : (G.objectives && G.objectives.text) || (G.act === 4 && G.arena.objectiveText4) || G.arena.objectiveText);
    if (w.state === 'active') {
      const rem = w.remaining(), total = Math.max(1, w.total || 1);
      this.sty('of', el.objFill, 'width', `${(clamp(1 - rem / total, 0, 1) * 100).toFixed(1)}%`);
      this.txt('os', el.objSub, rem === 0 && G.objectives && G.objectives.blocking() ? 'THE GENERATOR IS STILL CALLING IN DROIDS' : `${rem} HOSTILES REMAINING`);
      const t = Math.max(0, G.time - (w.startedAt || G.time));
      this.txt('ot', el.objTimer, `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`);
    } else {
      this.sty('of', el.objFill, 'width', '0%');
      const t = Math.max(0, Math.ceil(w.timer));
      this.txt('os', el.objSub, 'REINFORCE · NEXT ASSAULT INBOUND');
      this.txt('ot', el.objTimer, `0:${String(t).padStart(2, '0')}`);
    }
    this.txt('bpv', el.bpValue, G.stats.score.toLocaleString());

    // damage arcs track the attacker as you turn
    for (const a of this.arcs) {
      if (a.t <= 0) { if (a.shown) { a.shown = false; a.el.style.opacity = '0'; } continue; }
      a.t -= dt;
      const src = a.obj && a.obj.alive && a.obj.pos ? a.obj.pos : a;
      const ang = Math.atan2(src.x - p.pos.x, src.z - p.pos.z);
      const rel = angleDiff(p.camYaw, ang);
      a.el.style.transform = `rotate(${(-rel).toFixed(3)}rad)`;
      a.el.style.opacity = (a.k * Math.min(1, a.t / 0.6)).toFixed(2);
      a.el.style.borderTopWidth = `${(3 + a.k * 4).toFixed(1)}px`;
      a.shown = true;
    }
    this.drawRadar(G);
    this.updateSpots(G);
  }

  /** Red diamonds over spotted droids. */
  updateSpots(G) {
    if (!this.spots) {
      this.spots = [];
      const host = document.getElementById('hud');
      for (let i = 0; i < 12; i++) { const d = document.createElement('div'); d.className = 'spot hidden'; host.appendChild(d); this.spots.push(d); }
      this.spotV = new G.camera.position.constructor();
    }
    let n = 0;
    const cam = G.camera, W = innerWidth, H = innerHeight;
    for (const e of G.enemies.list) {
      if (n >= this.spots.length) break;
      if (!e.alive || !(e.spottedUntil > G.time)) continue;
      const v = this.spotV.copy(e.head).setY(e.head.y + 0.45).project(cam);
      if (v.z > 1 || Math.abs(v.x) > 1.05 || Math.abs(v.y) > 1.05) continue;
      const d = this.spots[n++];
      d.classList.remove('hidden');
      d.style.left = ((v.x + 1) / 2) * W + 'px';
      d.style.top = ((1 - v.y) / 2) * H + 'px';
    }
    for (let i = n; i < this.spots.length; i++) this.spots[i].classList.add('hidden');
  }

  drawRadar(G) {
    const c = this.radarCtx, p = G.player;
    const W = 200, R = 88, range = 60;
    c.clearRect(0, 0, W, W);
    c.save();
    c.translate(W / 2, W / 2);
    const g = c.createRadialGradient(0, 0, R * 0.2, 0, 0, R);
    g.addColorStop(0, 'rgba(10,16,24,0.35)');
    g.addColorStop(1, 'rgba(10,16,24,0.6)');
    c.fillStyle = g;
    c.beginPath(); c.arc(0, 0, R, 0, TAU); c.fill();
    c.strokeStyle = 'rgba(255,255,255,0.55)'; c.lineWidth = 1.2;
    c.stroke();
    c.strokeStyle = 'rgba(255,255,255,0.1)'; c.lineWidth = 1;
    c.beginPath(); c.arc(0, 0, R * 0.5, 0, TAU); c.stroke();
    const s = Math.sin(p.camYaw), co = Math.cos(p.camYaw);
    const toRadar = (x, z, clampEdge = true) => {
      const dx = x - p.pos.x, dz = z - p.pos.z;
      const fwd = dx * s + dz * co, right = -dx * co + dz * s;
      let rx = (right / range) * R, ry = (-fwd / range) * R;
      const l = Math.hypot(rx, ry);
      if (clampEdge && l > R - 5) { rx *= (R - 5) / l; ry *= (R - 5) / l; }
      return [rx, ry, l];
    };
    // compass ticks + letters around the rim
    c.font = '600 11px Bahnschrift, sans-serif';
    c.textAlign = 'center'; c.textBaseline = 'middle';
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * TAU;
      const wx = Math.sin(a), wz = -Math.cos(a); // north = -z
      const fwd = wx * s + wz * co, right = -wx * co + wz * s;
      const ang = Math.atan2(-fwd, right);
      const isCard = i % 4 === 0;
      c.strokeStyle = isCard ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.3)';
      c.beginPath();
      c.moveTo(Math.cos(ang) * (R - (isCard ? 7 : 4)), Math.sin(ang) * (R - (isCard ? 7 : 4)));
      c.lineTo(Math.cos(ang) * R, Math.sin(ang) * R);
      c.stroke();
      if (isCard) {
        c.fillStyle = i === 0 ? '#ffc64d' : 'rgba(255,255,255,0.85)';
        c.fillText('NESW'[i / 4], Math.cos(ang) * (R + 0.5 - 15), Math.sin(ang) * (R + 0.5 - 15));
      }
    }
    // clip the map contents to the disc
    c.save();
    c.beginPath(); c.arc(0, 0, R - 1, 0, TAU); c.clip();
    // view cone
    const fov = (G.camera.fov * G.camera.aspect * Math.PI) / 360;
    c.fillStyle = 'rgba(255,255,255,0.06)';
    c.beginPath(); c.moveTo(0, 0); c.arc(0, 0, R, -Math.PI / 2 - fov, -Math.PI / 2 + fov); c.closePath(); c.fill();
    // roof outline + central tower
    c.strokeStyle = 'rgba(255,255,255,0.28)'; c.lineWidth = 1;
    c.beginPath();
    const ar = G.arena;
    ar.outline.forEach(([x, z], i) => { const [rx, ry] = toRadar(x, z, false); i ? c.lineTo(rx, ry) : c.moveTo(rx, ry); });
    c.closePath(); c.stroke();
    // objective (gold diamond): the turbolift tower
    {
      const [rx, ry] = toRadar(ar.objective.x, ar.objective.z);
      c.fillStyle = '#ffc64d'; c.strokeStyle = 'rgba(0,0,0,0.5)';
      c.beginPath(); c.moveTo(rx, ry - 6); c.lineTo(rx + 5, ry); c.lineTo(rx, ry + 6); c.lineTo(rx - 5, ry); c.closePath(); c.fill(); c.stroke();
    }
    if (G.objectives) G.objectives.radar(c, toRadar);
    // allies: blue dots
    c.fillStyle = '#5ab8ff';
    for (const a of G.allies ? G.allies() : [G.ally]) {
      if (!a || a.alive === false) continue;
      const [rx, ry] = toRadar(a.pos.x, a.pos.z);
      c.beginPath(); c.arc(rx, ry, 3.2, 0, TAU); c.fill();
    }
    // enemies: red pips only while firing / spotted, fading out after a couple of seconds
    for (const e of G.enemies.list) {
      if (!e.alive || e.state === 'scripted') continue;
      const age = G.time - Math.max(e.revealT || -99, e.spottedT || -99);
      const shown = e.cfg.boss || e === p.aimEnemy || e.spottedUntil > G.time ? 1 : age < 2.6 ? 1 - Math.pow(age / 2.6, 2) : 0;
      if (shown <= 0.02) continue;
      const [rx, ry] = toRadar(e.pos.x, e.pos.z);
      c.globalAlpha = shown;
      c.fillStyle = e.type === 'rebel_clone' ? '#77e05a' : '#ff4b3a';
      c.beginPath();
      if (e.cfg.boss) { c.moveTo(rx, ry - 7); c.lineTo(rx + 6, ry); c.lineTo(rx, ry + 7); c.lineTo(rx - 6, ry); c.closePath(); }
      else if (e.cfg.flying) { c.moveTo(rx, ry - 4.5); c.lineTo(rx + 4, ry + 3); c.lineTo(rx - 4, ry + 3); c.closePath(); }
      else c.arc(rx, ry, e.type === 'b2' ? 3.8 : 2.8, 0, TAU);
      c.fill();
    }
    c.globalAlpha = 1;
    // scan pulse ring
    const pa = G.time - (this.radarPulse ?? -9);
    if (pa < 0.9) {
      c.strokeStyle = `rgba(120, 200, 255, ${1 - pa / 0.9})`; c.lineWidth = 2;
      c.beginPath(); c.arc(0, 0, R * (pa / 0.9), 0, TAU); c.stroke();
    }
    c.restore();
    // player arrow
    c.fillStyle = '#ffffff';
    c.beginPath(); c.moveTo(0, -7); c.lineTo(5, 5.5); c.lineTo(0, 2.5); c.lineTo(-5, 5.5); c.closePath(); c.fill();
    c.restore();
  }
}
