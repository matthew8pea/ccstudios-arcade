import * as THREE from 'three';
import { buildAssaultShip, buildLAAT } from './ships.js';
import { canvasTexture } from './util.js';

/**
 * Orbit over Tatooine, for the opening of Act III: a starfield, the planet (procedural dune seas and badlands,
 * lit by two suns, with a thin dusty atmosphere at the limb), the suns themselves, the Republic assault ship and
 * the gunship it launches. It is a separate scene: the cutscene swaps it into the render pass for a few beats.
 */
export const PLANET_R = 2500;
// the suns sit off to the left of the opening shots, so the ship and the day side of the planet face the camera
const SUN_A = new THREE.Vector3(-0.7, 0.45, 0.55).normalize();
const SUN_B = new THREE.Vector3(-0.62, 0.36, 0.7).normalize();

const NOISE = /* glsl */`
  float h3(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
  float n3(vec3 p) {
    vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(h3(i), h3(i + vec3(1, 0, 0)), f.x), mix(h3(i + vec3(0, 1, 0)), h3(i + vec3(1, 1, 0)), f.x), f.y),
               mix(mix(h3(i + vec3(0, 0, 1)), h3(i + vec3(1, 0, 1)), f.x), mix(h3(i + vec3(0, 1, 1)), h3(i + vec3(1, 1, 1)), f.x), f.y), f.z);
  }
  float fbm(vec3 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { v += a * n3(p); p *= 2.07; a *= 0.5; } return v; }`;

function glowTex() {
  return canvasTexture(128, 128, (g, w, h) => {
    const grd = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.18, 'rgba(255,240,210,0.85)');
    grd.addColorStop(0.45, 'rgba(255,200,140,0.18)'); grd.addColorStop(1, 'rgba(255,180,120,0)');
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
  });
}

export class SpaceScene {
  constructor() {
    const s = (this.scene = new THREE.Scene());
    s.background = new THREE.Color(0x010206);
    // stars round the camera
    const N = 3200, pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const v = new THREE.Vector3(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1).normalize().multiplyScalar(5600);
      pos.set([v.x, v.y, v.z], i * 3);
      const k = 0.4 + Math.random() ** 3 * 2.2, t = Math.random();
      col.set([k * (t < 0.2 ? 0.8 : 1), k * (t < 0.2 ? 0.88 : t > 0.85 ? 0.85 : 1), k * (t > 0.85 ? 0.7 : 1)], i * 3);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    sg.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ size: 1.7, sizeAttenuation: false, vertexColors: true, depthWrite: false, fog: false }));
    this.stars.renderOrder = -10;
    s.add(this.stars);
    // the planet: dune seas, darker badlands, wind-streaks; a dusty limb
    this.planet = new THREE.Mesh(new THREE.SphereGeometry(PLANET_R, 128, 96), new THREE.ShaderMaterial({
      uniforms: { sunA: { value: SUN_A }, sunB: { value: SUN_B }, mode: { value: 0 } },
      vertexShader: /* glsl */`
        varying vec3 vN; varying vec3 vW;
        void main() { vN = normalize(position); vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: /* glsl */`
        uniform vec3 sunA, sunB; uniform float mode; varying vec3 vN; varying vec3 vW;
        ${NOISE}
        void main() {
          vec3 n = normalize(vN);
          float h = fbm(n * 5.0) * 0.6 + fbm(n * 19.0) * 0.4;
          vec3 c = mix(vec3(0.62, 0.42, 0.25), vec3(0.86, 0.68, 0.45), smoothstep(0.35, 0.68, h));
          c = mix(c, vec3(0.36, 0.25, 0.17), smoothstep(0.6, 0.76, fbm(n * 8.0 + 3.0)) * 0.85);
          c *= 0.9 + 0.1 * sin(dot(n, vec3(46.0, 9.0, 17.0)) * 3.0 + h * 12.0);
          float lit = max(dot(n, sunA), 0.0) * 0.8 + max(dot(n, sunB), 0.0) * 0.45;
          vec3 col = c * (0.02 + lit * 1.1);
          if (mode > 0.5) {
            // Coruscant: city from pole to pole, grey by day, a net of orange lights by night
            float blocks = fbm(n * 40.0) * 0.6 + fbm(n * 160.0) * 0.4;
            vec3 city = mix(vec3(0.26, 0.26, 0.28), vec3(0.5, 0.48, 0.45), blocks);
            float day = max(dot(n, sunA), 0.0);
            float lights = smoothstep(0.55, 0.75, fbm(n * 220.0)) * smoothstep(0.3, 0.6, fbm(n * 26.0 + 7.0));
            col = city * (0.02 + day * 1.05) + vec3(1.0, 0.62, 0.3) * lights * smoothstep(0.25, 0.0, day) * 1.4;
          }
          vec3 V = normalize(cameraPosition - vW);
          float rim = pow(1.0 - max(dot(n, V), 0.0), 6.0);
          col += vec3(1.0, 0.66, 0.38) * rim * (0.05 + lit) * 0.3;
          gl_FragColor = vec4(col, 1.0);
        }`,
    }));
    this.planet.position.set(0, -PLANET_R - 820, -400);
    s.add(this.planet);
    this.atmo = new THREE.Mesh(new THREE.SphereGeometry(PLANET_R * 1.035, 96, 64), new THREE.ShaderMaterial({
      uniforms: { sunA: { value: SUN_A }, tint: { value: new THREE.Color(1.0, 0.7, 0.42) } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */`
        varying vec3 vN; varying vec3 vW;
        void main() { vN = normalize(position); vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: /* glsl */`
        uniform vec3 sunA; uniform vec3 tint; varying vec3 vN; varying vec3 vW;
        void main() {
          vec3 V = normalize(cameraPosition - vW);
          float f = pow(1.0 - abs(dot(normalize(vN), V)), 4.0);
          float lit = 0.25 + max(dot(normalize(vN), sunA), 0.0);
          gl_FragColor = vec4(tint * f * lit * 0.8, 1.0);
        }`,
    }));
    this.atmo.position.copy(this.planet.position);
    s.add(this.atmo);
    // Tatoo I and Tatoo II
    const tex = glowTex();
    this.suns = [[SUN_A, 900, new THREE.Color(3, 2.6, 2)], [SUN_B, 560, new THREE.Color(3, 1.8, 1.1)]].map(([d, size, c]) => {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: c, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false }));
      sp.userData.dir = d;
      sp.scale.setScalar(size);
      s.add(sp);
      return sp;
    });
    const key = new THREE.DirectionalLight(0xfff0dc, 3.2);
    key.position.copy(SUN_A).multiplyScalar(100);
    s.add(key, new THREE.AmbientLight(0x3a4458, 0.55), new THREE.HemisphereLight(0x8090b0, 0x6a4a30, 0.35));
    // the assault ship and the gunship it launches
    this.ship = buildAssaultShip();
    s.add(this.ship);
    this.laat = buildLAAT();
    this.laat.visible = false;
    s.add(this.laat);
    // hyperspace: streaks of light stretched behind a ship arriving out of lightspeed
    const L = 140, sp = new Float32Array(L * 6);
    for (let i = 0; i < L; i++) {
      const x = (Math.random() - 0.5) * 70, y = (Math.random() - 0.5) * 26, z = Math.random() * 60;
      sp.set([x, y, -z, x, y, -z - 400 - Math.random() * 900], i * 6);
    }
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    this.streaks = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: new THREE.Color(1.6, 2.0, 3.0), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.streaks.visible = false;
    s.add(this.streaks);
    this.flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: new THREE.Color(2.5, 2.8, 3.5), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 }));
    s.add(this.flash);
  }

  /** Which world is below: 'tatooine' (dune seas, two suns) or 'coruscant' (the city-planet, one sun). */
  setPlanet(name) {
    const cor = name === 'coruscant';
    this.planet.material.uniforms.mode.value = cor ? 1 : 0;
    this.atmo.material.uniforms.tint.value.setRGB(cor ? 0.55 : 1.0, cor ? 0.72 : 0.7, cor ? 1.1 : 0.42);
    this.suns[1].visible = !cor;
  }

  /** Keep the stars and suns on the far sphere round the camera. */
  frame(cam) {
    this.stars.position.copy(cam.position);
    for (const sp of this.suns) sp.position.copy(cam.position).addScaledVector(sp.userData.dir, 5200);
  }
}

/** The one orbit scene, shared by the cutscenes that go to space. */
let shared = null;
export function spaceScene() { return shared || (shared = new SpaceScene()); }
