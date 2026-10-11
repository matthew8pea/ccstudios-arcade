import * as THREE from 'three';
import { puffTexture } from './fx.js';
import { rand } from './util.js';

const _v = new THREE.Vector3();
const _n = new THREE.Vector3(0, 1, 0);

const quad = (y0 = -0.5, y1 = 0.5) => {
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, y0, 0, 0.5, y0, 0, -0.5, y1, 0, 0.5, y1, 0], 3));
  g.setIndex([0, 1, 2, 2, 1, 3]);
  return g;
};

/**
 * A city under siege: tall black smoke columns over burning towers (with fire at their base),
 * and warm light shafts from the low sun. Both animate entirely on the GPU.
 */
export class Atmosphere {
  /**
   * columns: [{ pos: Vector3, height, width }]; fog: shared fog uniforms + GLSL from city.js.
   */
  constructor(scene, columns, fog, sunDir) {
    this.time = { value: 0 };
    const puff = puffTexture();
    const PER = 46;
    // --- smoke columns
    {
      const n = columns.length * PER;
      const g = quad();
      const B = new Float32Array(n * 3), P = new Float32Array(n * 4);
      let k = 0;
      for (const c of columns) {
        for (let i = 0; i < PER; i++) {
          B.set([c.pos.x, c.pos.y, c.pos.z], k * 3);
          P.set([c.height, c.width, c.speed || 9, i / PER + Math.random() * 0.02], k * 4);
          k++;
        }
      }
      g.setAttribute('aBase', new THREE.InstancedBufferAttribute(B, 3));
      g.setAttribute('aP', new THREE.InstancedBufferAttribute(P, 4));
      g.instanceCount = n;
      const mat = new THREE.ShaderMaterial({
        uniforms: { time: this.time, map: { value: puff }, wind: { value: new THREE.Vector3(0.32, 0, 0.18) }, sunDir: { value: sunDir }, ...fog.uniforms() },
        vertexShader: /* glsl */`
          attribute vec3 aBase; attribute vec4 aP;
          uniform float time; uniform vec3 wind;
          varying vec2 vUv; varying float vA; varying float vAge; varying vec3 vWorld;
          void main() {
            float age = fract(time * aP.z / aP.x + aP.w);
            float h = age * aP.x;
            float sd = aP.w * 97.0;
            vec3 c = aBase + vec3(0.0, h, 0.0) + wind * h * (0.3 + 0.5 * age)
              + vec3(sin(sd + h * 0.021), 0.0, cos(sd * 1.3 + h * 0.017)) * aP.y * 0.35 * (0.3 + age);
            float size = aP.y * (0.55 + age * 2.4);
            vec3 camR = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
            vec3 camU = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
            float r = sd + time * 0.04;
            vec2 q = vec2(position.x * cos(r) - position.y * sin(r), position.x * sin(r) + position.y * cos(r));
            vUv = q + 0.5;
            vec3 wp = c + (camR * position.x + camU * position.y) * size;
            vA = smoothstep(0.0, 0.05, age) * pow(1.0 - age, 1.25);
            vAge = age;
            vWorld = wp;
            gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
          }`,
        fragmentShader: /* glsl */`
          uniform sampler2D map; uniform vec3 sunDir;
          varying vec2 vUv; varying float vA; varying float vAge; varying vec3 vWorld;
          ${fog.glsl}
          void main() {
            float a = texture2D(map, vUv).a * vA * 0.95;
            if (a < 0.004) discard;
            // black, oily smoke; its sun-facing side catches a little warm light
            vec3 col = mix(vec3(0.012, 0.011, 0.011), vec3(0.06, 0.045, 0.035), smoothstep(0.2, 0.9, vUv.y) * 0.8 + vAge * 0.4);
            gl_FragColor = vec4(applyFog(col, vWorld), a);
          }`,
        transparent: true, depthWrite: false,
      });
      const mesh = new THREE.Mesh(g, mat);
      mesh.frustumCulled = false;
      mesh.renderOrder = 6;
      scene.add(mesh);
    }
    // --- fire at the base of each column
    {
      const FL = 10, n = columns.length * FL;
      const g = quad(-0.2, 0.8);
      const B = new Float32Array(n * 3), P = new Float32Array(n * 4);
      let k = 0;
      for (const c of columns) {
        for (let i = 0; i < FL; i++) {
          B.set([c.pos.x + (Math.random() - 0.5) * c.width * 0.8, c.pos.y, c.pos.z + (Math.random() - 0.5) * c.width * 0.8], k * 3);
          P.set([c.width * (0.35 + Math.random() * 0.4), Math.random(), 1.1 + Math.random() * 0.8, 0], k * 4);
          k++;
        }
      }
      g.setAttribute('aBase', new THREE.InstancedBufferAttribute(B, 3));
      g.setAttribute('aP', new THREE.InstancedBufferAttribute(P, 4));
      g.instanceCount = n;
      const mat = new THREE.ShaderMaterial({
        uniforms: { time: this.time, map: { value: puff }, ...fog.uniforms() },
        vertexShader: /* glsl */`
          attribute vec3 aBase; attribute vec4 aP;
          uniform float time;
          varying vec2 vUv; varying float vA; varying float vAge; varying vec3 vWorld;
          void main() {
            float age = fract(time * aP.z * 0.5 + aP.y);
            float size = aP.x * (1.0 - age * 0.55);
            vec3 c = aBase + vec3(0.0, age * aP.x * 1.6, 0.0);
            vec3 camR = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
            vec3 wp = c + camR * position.x * size + vec3(0.0, 1.0, 0.0) * position.y * size * 1.4;
            vUv = vec2(position.x + 0.5, position.y * 0.8 + 0.3);
            vA = smoothstep(0.0, 0.12, age) * (1.0 - age);
            vAge = age;
            vWorld = wp;
            gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
          }`,
        fragmentShader: /* glsl */`
          uniform sampler2D map;
          varying vec2 vUv; varying float vA; varying float vAge; varying vec3 vWorld;
          ${fog.glsl}
          void main() {
            float a = texture2D(map, vUv).a * vA;
            vec3 col = mix(vec3(7.0, 3.6, 1.1), vec3(2.4, 0.5, 0.06), vAge) * a;
            // fade additive fire into the haze with distance
            gl_FragColor = vec4(col * (1.0 - fogAmount(vWorld)), 1.0);
          }`,
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      });
      const mesh = new THREE.Mesh(g, mat);
      mesh.frustumCulled = false;
      mesh.renderOrder = 7;
      scene.add(mesh);
    }
    // --- light shafts: long additive beams along the sun direction, cutting between the towers
    {
      const n = 26, g = quad(0, 1);
      const S = new Float32Array(n * 3), P = new Float32Array(n * 4);
      const az = new THREE.Vector3(sunDir.x, 0, sunDir.z).normalize();
      const perp = new THREE.Vector3(-az.z, 0, az.x);
      for (let i = 0; i < n; i++) {
        const d = 90 + Math.pow(Math.random(), 0.8) * 600, lat = (Math.random() - 0.5) * 2 * (120 + d * 0.6);
        const p = az.clone().multiplyScalar(d).addScaledVector(perp, lat);
        p.y = -40 + Math.random() * 140;
        p.addScaledVector(sunDir, 260);
        S.set([p.x, p.y, p.z], i * 3);
        P.set([520, 7 + Math.random() * 22, 0.05 + Math.random() * 0.07, Math.random()], i * 4);
      }
      g.setAttribute('aStart', new THREE.InstancedBufferAttribute(S, 3));
      g.setAttribute('aP', new THREE.InstancedBufferAttribute(P, 4));
      g.instanceCount = n;
      const mat = new THREE.ShaderMaterial({
        uniforms: { time: this.time, sunDir: { value: sunDir }, color: { value: new THREE.Color(1.0, 0.6, 0.32) } },
        vertexShader: /* glsl */`
          attribute vec3 aStart; attribute vec4 aP;
          uniform vec3 sunDir; uniform float time;
          varying vec2 vQ; varying float vI;
          void main() {
            vec3 dir = -sunDir;
            vec3 mid = aStart + dir * aP.x * 0.5;
            vec3 toCam = normalize(cameraPosition - mid);
            vec3 side = normalize(cross(dir, toCam));
            vec3 wp = aStart + dir * aP.x * position.y + side * position.x * aP.y * 2.0;
            vQ = position.xy;
            float facing = 1.0 - abs(dot(dir, toCam));
            vI = aP.z * facing * smoothstep(40.0, 160.0, length(cameraPosition - mid)) * (0.75 + 0.25 * sin(time * 0.3 + aP.w * 20.0));
            gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
          }`,
        fragmentShader: /* glsl */`
          uniform vec3 color;
          varying vec2 vQ; varying float vI;
          void main() {
            float across = exp(-vQ.x * vQ.x * 6.0);
            float along = smoothstep(0.0, 0.3, vQ.y) * (1.0 - smoothstep(0.5, 1.0, vQ.y));
            gl_FragColor = vec4(color * across * along * vI, 1.0);
          }`,
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      });
      this.shafts = new THREE.Mesh(g, mat);
      this.shafts.frustumCulled = false;
      this.shafts.renderOrder = 8;
      scene.add(this.shafts);
    }
  }

  setQuality(high) { this.shafts.visible = high; }
  update(t) { this.time.value = t; }
}

/** Fires, embers and sparking panels on the arena itself (driven through the shared FX particles). */
export class ArenaFX {
  constructor(fires, sparks) {
    this.fires = fires; // [{ pos, size }]
    this.sparks = sparks; // [{ pos, normal, t }]
  }

  update(dt, fx) {
    if (!fx) return;
    for (const f of this.fires) {
      const s = f.size;
      if (Math.random() < 0.9) {
        fx.fire.emit(f.pos.x + rand(-0.4, 0.4) * s, f.pos.y + rand(0, 0.2), f.pos.z + rand(-0.4, 0.4) * s, rand(-0.2, 0.2), rand(1.2, 2.4) * s, rand(-0.2, 0.2),
          rand(0.45, 0.8), 0.5 * s, 1.3 * s, 2.6, 1.2, 0.35, 0.85, -1.5, 1, 0, 0.6, 0.1, 0.02, rand(-1.5, 1.5));
      }
      if (Math.random() < 0.35) {
        fx.smoke.emit(f.pos.x + rand(-0.3, 0.3) * s, f.pos.y + s, f.pos.z + rand(-0.3, 0.3) * s, rand(0.1, 0.5), rand(1.4, 2.4) * s, rand(-0.1, 0.3),
          rand(3.5, 5.5), 0.8 * s, 4.5 * s, 0.02, 0.019, 0.018, 0.75, -0.25, 0.25, 0.08, 0.05, 0.048, 0.045, rand(-0.5, 0.5));
      }
      if (Math.random() < 0.12) {
        fx.add.emit(f.pos.x, f.pos.y + 0.5 * s, f.pos.z, rand(-0.8, 0.8), rand(1.5, 3.5), rand(-0.8, 0.8), rand(1.5, 3), 0.06, 0.03, 4.5, 1.6, 0.3, 1, -0.4, 0.5, 0, 1.6, 0.2, 0.03);
      }
      if (Math.random() < 0.06) fx.flashLight(f.pos, 0xff8a3a, 2.5 * s, 0.25, 7 * s, 0.6);
    }
    for (const sp of this.sparks) {
      sp.t -= dt;
      if (sp.t > 0) continue;
      sp.t = rand(0.6, 2.6);
      fx.sparks(sp.pos, sp.normal || _n, 0xffd28a, 8 + Math.floor(Math.random() * 10), 4);
      fx.flashLight(sp.pos, 0xffc070, 3, 0.1, 5, 0.8);
      if (Math.random() < 0.4) fx.smokePuff(_v.copy(sp.pos), 0.4, 0.15);
    }
  }
}
