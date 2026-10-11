import * as THREE from 'three';
import { buildDropship } from './ships.js';
import { rand } from './util.js';

const HOVER = 16.5; // metres above the ground it drops from
const IN_DUR = 6.5;
const OUT_DUR = 8;
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _q = new THREE.Vector3();
const _down = new THREE.Vector3(0, -1, 0);
const _up = new THREE.Vector3(0, 1, 0);
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

const BEAM_VERT = /* glsl */`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const BEAM_FRAG = /* glsl */`
uniform vec3 color;
uniform float opacity;
uniform float time;
varying vec2 vUv;
void main() {
  float scan = 0.75 + 0.25 * sin(vUv.y * 40.0 - time * 9.0);
  float y = clamp(vUv.y, 0.0, 1.0);
  float a = y * y * scan * opacity;
  gl_FragColor = vec4(color * a, 1.0);
}`;

/**
 * A Separatist droid dropship: flies in over the edge, flares into a hover above a clear patch of the
 * arena, opens its belly hatch and drops its droids down a glowing drop beam, then climbs away.
 * The droids it carries count as part of the wave until they are dropped (pending()).
 */
export class Dropship {
  constructor(G) {
    this.G = G;
    this.obj = null;
    this.state = 'idle';
    this.cargo = [];
    this.t = 0;
  }

  idle() { return this.state === 'idle'; }
  pending() { return this.cargo.length; }

  build() {
    const obj = this.obj = buildDropship();
    obj.rotation.order = 'YXZ';
    obj.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    this.an = obj.userData.anchors;
    this.beamMat = new THREE.ShaderMaterial({
      uniforms: { color: { value: new THREE.Color(1.6, 0.55, 0.22) }, opacity: { value: 0 }, time: { value: 0 } },
      vertexShader: BEAM_VERT, fragmentShader: BEAM_FRAG,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    this.beam = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 2.6, 1, 20, 1, true), this.beamMat);
    this.beam.visible = false;
    this.beam.renderOrder = 11;
    this.glows = this.an.engines.map((p) => {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({
        map: this.G.fx.glowTex, color: new THREE.Color(0x6fb6ff).multiplyScalar(1.1),
        blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
      }));
      sp.position.copy(p);
      sp.scale.setScalar(1.8);
      obj.add(sp);
      return sp;
    });
  }

  /** A clear patch of ground with open sky above it (room for the hull), away from the player. */
  pickSpot() {
    const G = this.G, ar = G.arena, p = G.player;
    for (let i = 0; i < 40; i++) {
      let at;
      if (ar.name === 'street') {
        // between the skybridges, over the road
        const z = Math.random() < 0.6 ? rand(92, 104) : rand(121, 129);
        at = new THREE.Vector3(rand(-5, 5), ar.y, z);
        if (G.world.groundAt(at.x, at.z, ar.y + 3, 0.6) !== ar.y) continue;
      } else at = ar.spawns.drop();
      if (p) {
        const d = Math.hypot(at.x - p.pos.x, at.z - p.pos.z);
        if (d < 15 || d > 48) continue;
      }
      let blocked = false;
      for (const [dx, dz] of [[0, 0], [7, 7], [-7, 7], [7, -7], [-7, -7]]) {
        _a.set(at.x + dx, at.y + 2.5, at.z + dz);
        if (G.world.raycast(_a, _up, HOVER + 4, 'move')) { blocked = true; break; }
      }
      if (!blocked) return at;
    }
    return null;
  }

  /** Bring in a dropship carrying these droid types. Returns false if there is nowhere to drop them. */
  call(types) {
    const G = this.G;
    if (this.state !== 'idle' || !types.length) return false;
    if (!this.obj) this.build();
    const at = this.pickSpot();
    if (!at) return false;
    this.cargo = types.slice();
    this.ground = at;
    this.hover = at.clone().setY(at.y + HOVER);
    // approach from open air: over the roof edge, or across the canyon west of the street
    const out = G.arena.dropDir ? G.arena.dropDir.clone().applyAxisAngle(_up, rand(-0.45, 0.45)) : G.arena.name === 'street'
      ? new THREE.Vector3(-1, 0, rand(-0.25, 0.25)).normalize()
      : new THREE.Vector3(at.x, 0, at.z).normalize().applyAxisAngle(_up, rand(-0.5, 0.5));
    this.out = out;
    this.from = this.hover.clone().addScaledVector(out, 230).setY(this.hover.y + (G.arena.name === 'street' ? 30 : 55));
    this.ctrl = this.hover.clone().addScaledVector(out, 70).setY(this.hover.y + 9);
    this.yaw = Math.atan2(-out.x, -out.z);
    this.state = 'in';
    this.t = 0;
    this.dropped = 0;
    this.lightT = 0;
    this.obj.visible = true;
    this.an.hatch.visible = false;
    G.scene.add(this.obj);
    G.scene.add(this.beam);
    this.place(0);
    G.sound.flyby(this.hover, 1.5);
    G.hud.toast('SEPARATIST DROPSHIP INBOUND');
    if (G.ally && G.speak) {
      const lines = ['Dropship, coming in low! Get ready!', "Seppie dropship! They're unloading on us!", 'Incoming transport. Hit them as they land!'];
      G.speak(lines[Math.floor(Math.random() * lines.length)], G.ally.key, { interrupt: false });
    }
    return true;
  }

  /** Bezier fly-in, flaring nose-up as it brakes into the hover. */
  place(k) {
    const o = this.obj;
    const e = 1 - Math.pow(1 - k, 3);
    const u = 1 - e;
    o.position.set(0, 0, 0).addScaledVector(this.from, u * u).addScaledVector(this.ctrl, 2 * u * e).addScaledVector(this.hover, e * e);
    o.rotation.set(-0.24 * smooth(0.5, 0.85, k) * (1 - smooth(0.88, 1, k)), this.yaw, Math.sin(k * 5) * 0.08 * (1 - k));
  }

  update(dt) {
    if (this.state === 'idle') return;
    const G = this.G, o = this.obj;
    this.t += dt;
    this.beamMat.uniforms.time.value += dt;
    if (this.state === 'in') {
      this.place(Math.min(1, this.t / IN_DUR));
      if (this.t >= IN_DUR) { this.state = 'hover'; this.t = 0; }
    } else if (this.state === 'hover') {
      o.position.copy(this.hover).y += Math.sin(this.t * 1.4) * 0.3;
      o.rotation.set(Math.sin(this.t * 0.9) * 0.02, this.yaw + Math.sin(this.t * 0.5) * 0.04, Math.sin(this.t * 1.1) * 0.025);
      const open = this.t > 0.6;
      if (open && !this.an.hatch.visible) { this.an.hatch.visible = true; G.sound.door(this.hover); }
      this.beamMat.uniforms.opacity.value = Math.min(0.55, Math.max(0, this.t - 0.6) * 1.2);
      // droids slide down the beam one after another
      while (this.cargo.length && this.t > 1.0 + this.dropped * 0.62) this.drop();
      if (!this.cargo.length && this.t > 1.0 + this.dropped * 0.62 + 1.2) {
        this.state = 'out';
        this.t = 0;
        this.an.hatch.visible = false;
        G.sound.flyby(this.hover, 1.3);
      }
      // rotor wash kicking up dust under it
      if (Math.random() < dt * 6) G.fx.dust(_a.copy(this.ground).add(_b.set(rand(-4, 4), 0.1, rand(-4, 4))), 6, 1.4);
    } else if (this.state === 'out') {
      const t = this.t;
      this.beamMat.uniforms.opacity.value = Math.max(0, this.beamMat.uniforms.opacity.value - dt * 2);
      o.position.copy(this.hover).addScaledVector(_up, 3 * t + 1.6 * t * t).addScaledVector(this.out, 1.2 * t * t * t * 0.5 + t);
      const turn = smooth(0, 3, t);
      o.rotation.set(-0.12 * turn, this.yaw + Math.PI * turn, Math.sin(turn * Math.PI) * 0.35);
      if (t > OUT_DUR) { this.finish(); return; }
    }
    o.updateMatrixWorld();
    // repulsor wash under the pods, and a glowing drop beam from the belly to the ground
    for (const e of this.an.lifters) {
      _c.copy(e).applyMatrix4(o.matrixWorld);
      G.fx.thruster(_c, _q.copy(_down).applyQuaternion(o.quaternion), 0.55);
    }
    _c.copy(this.an.belly).applyMatrix4(o.matrixWorld);
    const h = Math.max(0.5, _c.y - this.ground.y);
    this.beam.visible = this.beamMat.uniforms.opacity.value > 0.01;
    this.beam.position.set(_c.x, _c.y - h / 2, _c.z);
    this.beam.scale.set(1, h, 1);
    if ((this.lightT -= dt) <= 0 && this.state !== 'out') {
      this.lightT = 0.3;
      G.fx.flashLight(_a.set(_c.x, this.ground.y + 3, _c.z), 0xff8a40, this.an.hatch.visible ? 4.5 : 2, 0.4, 14, 2);
    }
  }

  drop() {
    const G = this.G;
    const type = this.cargo.shift();
    const i = this.dropped++;
    const a = i * 2.4, r = i ? 1.7 : 0;
    _a.set(this.ground.x + Math.cos(a) * r, this.ground.y, this.ground.z + Math.sin(a) * r);
    if (G.world.groundAt(_a.x, _a.z, this.ground.y + 1, 0.4) !== this.ground.y) _a.copy(this.ground);
    G.enemies.spawn(type, 'drop', { at: _a.clone(), height: HOVER - 3.2 });
  }

  finish() {
    this.state = 'idle';
    this.G.scene.remove(this.obj);
    this.G.scene.remove(this.beam);
  }

  /** Abandon the run (cutscene or wave skip): returns the droids still aboard. */
  abort() {
    const left = this.cargo;
    this.cargo = [];
    if (this.state !== 'idle') this.finish();
    return left;
  }

  clear() { this.abort(); }
}
