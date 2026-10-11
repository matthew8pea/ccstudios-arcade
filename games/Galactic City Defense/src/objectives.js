import * as THREE from 'three';
import { rand, pick } from './util.js';

/**
 * Galactic Assault-style phase objectives on top of the waves.
 *   Roof, waves 3-4: two uplinks. Droids break off to slice them; an uncontested slice takes
 *   CAPTURE_TIME seconds and costs the Republic reinforcements. Stand in the ring to stop it,
 *   and retake a sliced uplink by holding the ring with no droids in it.
 *   Street, wave 7 (and every third wave after it): a Separatist shield generator. The wave can't
 *   end until it is destroyed, and it keeps calling in droids while it stands. Bolts that hit its
 *   dome and blasts near it wear it down.
 */
const CAPTURE_TIME = 16;
const RING = 3.8;
const UPLINK_WAVES = [3, 4];
const UPLINK_SPOTS = [[-27, -16], [27, -12], [-30, 14], [30, 18], [-20, -30], [20, -30], [-32, -4], [32, 2]];
const GEN_HP = 1400;
const DOME_R = 6.2;
const REP = new THREE.Color(0x4fb0ff), SEP = new THREE.Color(0xff4a2a), WHITE = new THREE.Color(0xffffff);
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Color();

const DOME_VERT = /* glsl */`
varying vec3 vN;
varying vec3 vV;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vN = normalize(mat3(modelMatrix) * normal);
  vV = normalize(cameraPosition - wp.xyz);
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
const DOME_FRAG = /* glsl */`
uniform vec3 color;
uniform float time;
uniform float hit;
uniform float alpha;
varying vec3 vN;
varying vec3 vV;
void main() {
  float f = 1.0 - abs(dot(vN, vV));
  float rim = f * f * f;
  float bands = 0.5 + 0.5 * sin(vN.y * 40.0 + time * 3.0);
  float a = (rim * 0.9 + 0.05 + bands * 0.04 + hit * 0.35) * alpha;
  gl_FragColor = vec4(color * a, 1.0);
}`;

function std(color, rough = 0.5, metal = 0.5, emissive = 0x000000, ei = 0) {
  return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, emissive, emissiveIntensity: ei });
}

export class Objectives {
  constructor(G) {
    this.G = G;
    this.mode = null;
    this.text = '';
    this.uplinks = [];
    this.gen = null;
    this.boxes = [];
    this.el = document.getElementById('objStatus');
    this.assignT = 0;
    this.callT = 0;
  }

  /** Called as each wave begins: set up that wave's objective (if any). */
  onWave(n) {
    const G = this.G;
    this.clear();
    if (G.arena.name === 'roof' && UPLINK_WAVES.includes(n)) this.startUplinks();
    else if (G.arena.name === 'street' && n >= 7 && (n - 7) % 3 === 0) this.startGenerator();
  }

  // ------------------------------------------------------------------ uplinks
  buildUplink(name, x, y, z) {
    const G = this.G;
    const g = new THREE.Group();
    g.position.set(x, y, z);
    const dark = std(0x2b2f36, 0.5, 0.6), trim = std(0x8d939b, 0.4, 0.7);
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.0, 0.8), dark);
    base.position.y = 0.5;
    const top = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.12, 0.9), trim);
    top.position.y = 1.06;
    const screenMat = new THREE.MeshBasicMaterial({ color: REP.clone().multiplyScalar(1.6) });
    const screen = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.5, 0.04), screenMat);
    screen.position.set(0, 1.35, 0.2);
    screen.rotation.x = -0.5;
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 2.2, 8), trim);
    mast.position.set(0, 2.1, -0.3);
    const dish = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.25, 16, 1, true), trim);
    dish.position.set(0, 3.15, -0.3);
    dish.rotation.x = Math.PI;
    for (const m of [base, top, mast, dish]) { m.castShadow = true; m.receiveShadow = true; }
    // holo beam and capture ring, coloured by who holds it
    const holoMat = new THREE.MeshBasicMaterial({ color: REP.clone(), transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const holo = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 9, 16, 1, true), holoMat);
    holo.position.set(0, 3.2 + 4.5, -0.3);
    const ringMat = new THREE.MeshBasicMaterial({ color: REP.clone(), transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false });
    const ring = new THREE.Mesh(new THREE.RingGeometry(RING - 0.18, RING, 64), ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.04;
    const fillMat = ringMat.clone();
    fillMat.opacity = 0.12;
    const fill = new THREE.Mesh(new THREE.CircleGeometry(RING - 0.2, 48), fillMat);
    fill.rotation.x = -Math.PI / 2;
    fill.position.y = 0.03;
    g.add(base, top, screen, mast, dish, holo, ring, fill);
    G.scene.add(g);
    this.boxes.push(G.world.add(x - 0.6, y, z - 0.45, x + 0.6, y + 1.1, z + 0.45));
    return { name, pos: new THREE.Vector3(x, y, z), group: g, screenMat, holoMat, ringMat, fillMat, owner: 'rep', progress: 0, warned: false, contested: false };
  }

  startUplinks() {
    const G = this.G, w = G.world, y = G.arena.y;
    const picked = [];
    for (const [x, z] of UPLINK_SPOTS) {
      if (picked.length >= 2) break;
      if (Math.abs(w.groundAt(x, z, y + 0.5, 0.5) - y) > 0.1) continue;
      let clear = true;
      for (const b of w.boxes) {
        if (b.tag === 'floor' || !b.move || b.max.y < y + 0.2 || b.min.y > y + 3) continue;
        if (x > b.min.x - 2 && x < b.max.x + 2 && z > b.min.z - 2 && z < b.max.z + 2) { clear = false; break; }
      }
      if (clear && !picked.some(([px, pz]) => Math.hypot(px - x, pz - z) < 30)) picked.push([x, z]);
    }
    this.uplinks = picked.map(([x, z], i) => this.buildUplink('AB'[i], x, y, z));
    this.mode = 'uplinks';
    this.text = 'DEFEND THE UPLINKS';
    this.announce('Separatist slicer teams are going for the uplinks. Keep them off!');
  }

  updateUplinks(dt) {
    const G = this.G;
    // a share of the B1s and B2s break off to slice an uplink
    this.assignT -= dt;
    if (this.assignT <= 0) {
      this.assignT = 1;
      for (const e of G.enemies.list) {
        if (!e.alive || e.goalSet || e.state !== 'active' || (e.type !== 'b1' && e.type !== 'b2')) continue;
        e.goalSet = true;
        const open = this.uplinks.filter((u) => u.owner === 'rep');
        if (open.length && Math.random() < 0.5) e.goal = pick(open).pos.clone().add(_a.set(rand(-1.5, 1.5), 0, rand(1, 2)));
      }
    }
    const reps = [G.player && G.player.alive ? G.player : null, G.ally, ...(G.squad ? G.squad.alive : [])];
    for (const u of this.uplinks) {
      let droids = 0, us = 0;
      for (const e of G.enemies.list) {
        if (e.alive && !e.cfg.flying && e.state === 'active' && Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z) < RING && Math.abs(e.pos.y - u.pos.y) < 2) droids++;
      }
      for (const r of reps) if (r && Math.hypot(r.pos.x - u.pos.x, r.pos.z - u.pos.z) < RING && Math.abs(r.pos.y - u.pos.y) < 2) us++;
      u.contested = droids > 0 && us > 0;
      if (u.owner === 'rep') {
        if (droids && !us) u.progress = Math.min(1, u.progress + (dt / CAPTURE_TIME) * Math.min(2, 0.6 + droids * 0.4));
        else if (us && !droids) u.progress = Math.max(0, u.progress - dt / 5);
        if (u.progress > 0.25 && !u.warned) {
          u.warned = true;
          G.hud.toast(`UPLINK ${u.name} IS BEING SLICED`);
          if (G.ally) G.speak(pick([`They're slicing uplink ${u.name}!`, `Droids on uplink ${u.name}, get over there!`]), G.ally.key, { interrupt: false });
        }
        if (u.progress >= 1) {
          u.owner = 'sep';
          G.hud.toast(`UPLINK ${u.name} LOST`);
          this.announce(`Uplink ${u.name} has been sliced. Retake it!`);
          if (G.useTickets) G.useTickets(Math.min(G.tickets, 4));
          for (const e of G.enemies.list) if (e.goal && e.goal.distanceTo(u.pos) < 4) e.goal = null;
        }
      } else {
        if (us && !droids) u.progress = Math.max(0, u.progress - dt / 8);
        else if (droids && !us) u.progress = Math.min(1, u.progress + dt / 8);
        if (u.progress <= 0) {
          u.owner = 'rep';
          u.warned = false;
          G.hud.bp('UPLINK SECURED', 250, 'gold');
          G.stats.objectives = (G.stats.objectives || 0) + 1;
          G.stats.score += 250;
          this.announce(`Uplink ${u.name} is back in Republic hands.`);
        }
      }
      // colour: Republic blue shading to red as it is sliced, flickering white while contested
      _c.copy(u.owner === 'rep' ? REP : SEP).lerp(u.owner === 'rep' ? SEP : REP, u.owner === 'rep' ? u.progress : 1 - u.progress);
      if (u.contested && Math.sin(G.time * 18) > 0) _c.lerp(WHITE, 0.6);
      u.ringMat.color.copy(_c);
      u.fillMat.color.copy(_c);
      u.holoMat.color.copy(_c);
      u.screenMat.color.copy(_c).multiplyScalar(1.6);
      u.holoMat.opacity = 0.16 + 0.08 * Math.sin(G.time * 3 + u.pos.x);
    }
  }

  // ------------------------------------------------------------------ shield generator
  startGenerator() {
    const G = this.G, y = G.arena.y;
    const pos = new THREE.Vector3(6.5, y, 124);
    const g = new THREE.Group();
    g.position.copy(pos);
    const tan = std(0x8f7a58, 0.55, 0.45), dark = std(0x2e2a26, 0.5, 0.6), blue = std(0x4f6178, 0.5, 0.5);
    const glow = std(0x220a04, 0.4, 0.2, 0xff5a20, 3.2);
    const parts = [
      [new THREE.CylinderGeometry(2.0, 2.3, 0.6, 24), dark, 0.3],
      [new THREE.CylinderGeometry(1.25, 1.6, 0.9, 20), tan, 1.05],
      [new THREE.CylinderGeometry(0.62, 0.8, 4.6, 16), tan, 3.6],
      [new THREE.CylinderGeometry(0.85, 0.85, 0.22, 20), glow, 2.2],
      [new THREE.CylinderGeometry(0.78, 0.78, 0.22, 20), glow, 3.4],
      [new THREE.CylinderGeometry(0.7, 0.7, 0.22, 20), glow, 4.6],
      [new THREE.SphereGeometry(0.9, 20, 14), glow, 6.2],
      [new THREE.CylinderGeometry(1.1, 0.6, 0.5, 16), blue, 5.7],
    ];
    const meshes = [];
    for (const [geo, mat, h] of parts) {
      const m = new THREE.Mesh(geo, mat);
      m.position.y = h;
      m.castShadow = m.receiveShadow = true;
      g.add(m);
      meshes.push(m);
    }
    for (let i = 0; i < 3; i++) {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.22, 3.2, 1.3), tan);
      const a = (i / 3) * Math.PI * 2;
      fin.position.set(Math.sin(a) * 1.0, 2.4, Math.cos(a) * 1.0);
      fin.rotation.y = a;
      fin.castShadow = true;
      g.add(fin);
      meshes.push(fin);
    }
    const domeMat = new THREE.ShaderMaterial({
      uniforms: { color: { value: new THREE.Color(1.6, 0.42, 0.18) }, time: { value: 0 }, hit: { value: 0 }, alpha: { value: 1 } },
      vertexShader: DOME_VERT, fragmentShader: DOME_FRAG,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(DOME_R, 40, 24, 0, Math.PI * 2, 0, Math.PI / 2), domeMat);
    dome.renderOrder = 10;
    g.add(dome);
    G.scene.add(g);
    this.boxes.push(G.world.add(pos.x - 1.9, y, pos.z - 1.9, pos.x + 1.9, y + 6.5, pos.z + 1.9));
    this.gen = { pos, group: g, meshes, dome, domeMat, hp: GEN_HP, alive: true, spawnT: 6, smokeT: 0, center: new THREE.Vector3(pos.x, y, pos.z) };
    this.mode = 'generator';
    this.text = 'DESTROY THE SHIELD GENERATOR';
    this.announce('The Separatists have dug in a shield generator at the end of the street. Take it out!');
  }

  /** Segment a-c against the dome (from outside). Returns 0..1 along the segment, or -1. */
  hitDome(a, c) {
    const g = this.gen;
    if (!g || !g.alive) return -1;
    const o = g.center;
    if (a.distanceTo(o) < DOME_R) return -1;
    _a.subVectors(c, a);
    const L = _a.length();
    if (L < 1e-6) return -1;
    _a.divideScalar(L);
    _b.subVectors(a, o);
    const bq = _b.dot(_a), cq = _b.lengthSq() - DOME_R * DOME_R;
    const disc = bq * bq - cq;
    if (disc < 0) return -1;
    const t = -bq - Math.sqrt(disc);
    if (t < 0 || t > L) return -1;
    if (a.y + _a.y * t < o.y - 0.2) return -1;
    return t / L;
  }

  /** Republic damage to the generator (bolts on the dome, blasts nearby). */
  damageGenerator(dmg, at) {
    const G = this.G, g = this.gen;
    if (!g || !g.alive) return;
    g.hp -= dmg;
    g.domeMat.uniforms.hit.value = 1;
    if (at) G.fx.flash(at, 0xff7a3a, 1.4, 0.15);
    if (g.hp <= 0) this.destroyGenerator();
  }

  blast(pos, radius, dmg) {
    const g = this.gen;
    if (!g || !g.alive) return;
    const d = Math.max(0, pos.distanceTo(_a.copy(g.center).setY(g.center.y + 2)) - 1.5);
    if (d < radius) this.damageGenerator(dmg * 1.4 * (1 - d / radius), null);
  }

  destroyGenerator() {
    const G = this.G, g = this.gen;
    g.alive = false;
    g.dome.visible = false;
    for (let i = 0; i < 5; i++) {
      setTimeout(() => {
        if (this.gen !== g) return;
        _a.copy(g.center).add(_b.set(rand(-1.5, 1.5), rand(0.5, 6), rand(-1.5, 1.5)));
        G.fx.explosion(_a, 2.2 + Math.random(), g.center.y);
        G.fx.flashLight(_a, 0xff8a40, 30, 0.6, 30, 3);
        G.sound.explosion(_a, 1.4);
      }, i * 260);
    }
    G.fx.shake = Math.max(G.fx.shake, 0.7);
    // the column comes down
    for (const m of g.meshes) if (m.position.y > 1.5) { m.visible = Math.random() < 0.3; m.rotation.z = rand(-1.2, 1.2); m.position.y *= 0.3; }
    G.hud.bp('SHIELD GENERATOR DESTROYED', 600, 'gold');
    G.stats.objectives = (G.stats.objectives || 0) + 1;
    G.stats.score += 600;
    this.text = '';
    this.announce('Shield generator destroyed! Clear out what is left of them!');
  }

  updateGenerator(dt) {
    const G = this.G, g = this.gen;
    if (!g) return;
    g.domeMat.uniforms.time.value += dt;
    g.domeMat.uniforms.hit.value = Math.max(0, g.domeMat.uniforms.hit.value - dt * 4);
    if (!g.alive) {
      if ((g.smokeT -= dt) <= 0) { g.smokeT = 0.12; G.fx.smokePuff(_a.copy(g.center).setY(g.center.y + rand(0.5, 2)), 2, 0.08); G.fx.fireTrail(_a, 1); }
      return;
    }
    const k = g.hp / GEN_HP;
    g.domeMat.uniforms.alpha.value = 0.55 + 0.45 * k + (k < 0.3 && Math.random() < 0.15 ? -0.4 : 0);
    if (k < 0.5 && Math.random() < dt * 6) G.fx.sparks(_a.copy(g.center).setY(g.center.y + rand(1.5, 5)), _b.set(rand(-1, 1), 0.5, rand(-1, 1)), 0xffb060, 6, 4);
    // while it stands it keeps calling droids in through the gate
    const w = G.waves;
    if (w.state === 'active' && !w.queue.length && G.enemies.aliveCount() < 4) {
      g.spawnT -= dt;
      if (g.spawnT <= 0) {
        g.spawnT = rand(5, 8);
        G.enemies.spawn(Math.random() < 0.75 ? 'b1' : 'b2', 'gate', { gate: pick(G.arena.spawns.gates) });
      }
    }
  }

  /** The wave can't finish while the generator stands. */
  blocking() { return !!(this.gen && this.gen.alive); }

  // ------------------------------------------------------------------ shared
  announce(line) {
    const G = this.G;
    G.hud.subtitle('REPUBLIC COMMAND', line, 3.6);
    G.speak(line, 'command', { interrupt: false });
  }

  /** Minimap markers (called from the HUD radar with its projection). */
  radar(c, toRadar) {
    c.font = '700 10px Bahnschrift, sans-serif';
    c.textAlign = 'center'; c.textBaseline = 'middle';
    for (const u of this.uplinks) {
      const [x, y] = toRadar(u.pos.x, u.pos.z);
      c.fillStyle = '#' + u.ringMat.color.getHexString();
      c.beginPath(); c.arc(x, y, 7, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#0b1018'; c.fillText(u.name, x, y + 0.5);
    }
    const g = this.gen;
    if (g && g.alive) {
      const [x, y] = toRadar(g.pos.x, g.pos.z);
      c.fillStyle = '#ff5a2a';
      c.beginPath(); c.moveTo(x, y - 7); c.lineTo(x + 6, y + 5); c.lineTo(x - 6, y + 5); c.closePath(); c.fill();
    }
  }

  /** HUD status line under the objective. */
  updateHud() {
    const el = this.el;
    if (!el) return;
    let html = '';
    for (const u of this.uplinks) {
      const pct = Math.round((u.owner === 'rep' ? 1 - u.progress : u.progress) * 100);
      html += `<span class="up ${u.owner}${u.contested ? ' contested' : ''}"><b>${u.name}</b><i><em style="width:${pct}%"></em></i></span>`;
    }
    if (this.gen && this.gen.alive) html += `<span class="up gen"><b>GEN</b><i><em style="width:${Math.max(0, Math.round((this.gen.hp / GEN_HP) * 100))}%"></em></i></span>`;
    if (html !== this.lastHtml) { el.innerHTML = html; this.lastHtml = html; }
    el.classList.toggle('hidden', !html);
  }

  update(dt) {
    if (this.mode === 'uplinks') this.updateUplinks(dt);
    else if (this.mode === 'generator') this.updateGenerator(dt);
    this.updateHud();
  }

  /** The wave is over: uplinks still in Republic hands count as defended. */
  complete() {
    const G = this.G;
    for (const u of this.uplinks) if (u.owner === 'rep') { G.hud.bp(`UPLINK ${u.name} DEFENDED`, 150, 'gold'); G.stats.score += 150; G.stats.objectives = (G.stats.objectives || 0) + 1; }
    this.clear();
  }

  clear() {
    const G = this.G;
    for (const u of this.uplinks) G.scene.remove(u.group);
    if (this.gen) G.scene.remove(this.gen.group);
    for (const b of this.boxes) { const i = G.world.boxes.indexOf(b); if (i >= 0) G.world.boxes.splice(i, 1); }
    for (const e of G.enemies.list) { e.goal = null; e.goalSet = false; }
    this.boxes.length = 0;
    this.uplinks = [];
    this.gen = null;
    this.mode = null;
    this.text = '';
    this.updateHud();
  }
}
