import * as THREE from 'three';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { clamp, damp, mulberry32 } from './util.js';

/**
 * The "Frostbite" look: every grade parameter lives here so it is easy to tune.
 * The pass runs in linear HDR between bloom and the OutputPass (which tone maps).
 */
export const GRADE = {
  exposure: 1.0,
  contrast: 1.1, // log-space contrast around `pivot`
  pivot: 0.2,
  crush: 0.012, // toe that gently crushes the blacks
  shadowTint: [-0.006, 0.006, 0.014], // added in the shadows: cool, smoggy teal
  highlightGain: [1.07, 1.0, 0.88], // multiplied into the highlights: amber sun
  saturation: 1.06,
  midDesat: 0.16, // pull colour out of the midtones only
  vignette: 0.3,
  vignetteAds: 0.55,
  grain: 0.035,
  ca: 0.0006, // always-on edge chromatic aberration (very subtle)
  dirt: 0.55, // lens dirt picked up by the bloom
  lowHpDesat: 0.72,
  bloom: { strength: 0.72, radius: 0.42, threshold: 1.15 },
};

const GradeShader = {
  name: 'BattlefrontGradeShader',
  uniforms: {
    tDiffuse: { value: null },
    tBloom: { value: null },
    tDirt: { value: null },
    aspect: { value: 1 },
    time: { value: 0 },
    exposure: { value: 1 },
    contrast: { value: 1 },
    pivot: { value: 0.2 },
    crush: { value: 0 },
    shadowTint: { value: new THREE.Vector3() },
    highlightGain: { value: new THREE.Vector3(1, 1, 1) },
    saturation: { value: 1 },
    midDesat: { value: 0 },
    vignette: { value: 0.3 },
    grain: { value: 0.03 },
    ca: { value: 0.002 },
    dirt: { value: 0.5 },
    lowHp: { value: 0 },
    lowHpDesat: { value: 0.7 },
    pulse: { value: 0 },
    edgeBlur: { value: 0 },
    flash: { value: 0 },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse, tBloom, tDirt;
    uniform float aspect, time, exposure, contrast, pivot, crush, saturation, midDesat;
    uniform vec3 shadowTint, highlightGain;
    uniform float vignette, grain, ca, dirt, lowHp, lowHpDesat, pulse, edgeBlur, flash;
    varying vec2 vUv;
    float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
    float hash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
    void main() {
      vec2 dc = vUv - 0.5;
      vec2 dca = dc * vec2(aspect, 1.0);
      float r = length(dca);
      // chromatic aberration grows toward the edges
      vec2 caOff = dc * ca * (0.4 + r * r * 3.0);
      vec3 col = vec3(texture2D(tDiffuse, vUv - caOff).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv + caOff).b);
      // cheap radial blur of the screen edges (ADS depth of field / near death)
      if (edgeBlur > 0.002) {
        float m = smoothstep(0.18, 0.75, r) * edgeBlur;
        vec3 acc = col;
        for (int i = 1; i <= 6; i++) {
          vec2 o = dc * m * 0.045 * float(i) / 6.0;
          acc += texture2D(tDiffuse, vUv - o).rgb;
        }
        col = acc / 7.0;
      }
      // lens dirt lit by the bloom
      col += texture2D(tBloom, vUv).rgb * texture2D(tDirt, vUv).rgb * dirt;
      col *= exposure;
      // toe (crushed blacks) + log-space contrast
      col = col * col / (col + crush);
      col = pivot * pow(max(col, 0.0) / pivot, vec3(contrast));
      float L = luma(col);
      // split toning: teal shadows, amber highlights
      float ws = 1.0 - smoothstep(0.0, 0.22, L);
      float wh = smoothstep(0.25, 1.6, L);
      col += shadowTint * ws;
      col *= mix(vec3(1.0), highlightGain, wh);
      col = max(col, 0.0);
      // saturation, with the midtones pulled back
      L = luma(col);
      float wm = smoothstep(0.02, 0.15, L) * (1.0 - smoothstep(0.45, 1.8, L));
      col = mix(vec3(L), col, saturation - midDesat * wm);
      // near death: drain the colour and pulse red at the edges
      float edge = smoothstep(0.32, 0.95, r);
      col = mix(col, vec3(L) * vec3(1.02, 0.98, 0.96), lowHp * lowHpDesat);
      col = mix(col, col * 0.35 + vec3(0.42, 0.012, 0.006) * (0.35 + L), edge * lowHp * (0.6 + 0.4 * pulse));
      // white-out flash (close explosions)
      col += vec3(1.0, 0.92, 0.8) * flash;
      // vignette
      col *= 1.0 - vignette * smoothstep(0.3, 0.95, r);
      // animated film grain
      float n = hash(vUv * vec2(1931.0, 1087.0) + fract(time * 7.13) * 91.0) - 0.5;
      col += (col + 0.012) * n * grain;
      gl_FragColor = vec4(col, 1.0);
    }`,
};

/**
 * Cheap edge anti-aliasing (FXAA-style) for the graphics tiers that drop MSAA. It runs last, on the
 * tone-mapped image, and costs ~1 ms where 4x MSAA costs ~10 ms on built-in laptop graphics.
 */
const FXAAShader = {
  name: 'FXAAShader',
  uniforms: { tDiffuse: { value: null }, texel: { value: new THREE.Vector2(1 / 1920, 1 / 1080) } },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform vec2 texel;
    varying vec2 vUv;
    float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
    void main() {
      vec3 cM = texture2D(tDiffuse, vUv).rgb;
      float lNW = luma(texture2D(tDiffuse, vUv + vec2(-1.0, -1.0) * texel).rgb);
      float lNE = luma(texture2D(tDiffuse, vUv + vec2(1.0, -1.0) * texel).rgb);
      float lSW = luma(texture2D(tDiffuse, vUv + vec2(-1.0, 1.0) * texel).rgb);
      float lSE = luma(texture2D(tDiffuse, vUv + vec2(1.0, 1.0) * texel).rgb);
      float lM = luma(cM);
      float lMin = min(lM, min(min(lNW, lNE), min(lSW, lSE)));
      float lMax = max(lM, max(max(lNW, lNE), max(lSW, lSE)));
      // flat areas (most of the screen) keep the centre sample
      if (lMax - lMin < max(0.04, lMax * 0.12)) { gl_FragColor = vec4(cM, 1.0); return; }
      // blur along the edge, perpendicular to the luma gradient
      vec2 dir = vec2(-((lNW + lNE) - (lSW + lSE)), (lNW + lSW) - (lNE + lSE));
      float reduce = max((lNW + lNE + lSW + lSE) * 0.03125, 1.0 / 128.0);
      float rcp = 1.0 / (min(abs(dir.x), abs(dir.y)) + reduce);
      dir = clamp(dir * rcp, vec2(-8.0), vec2(8.0)) * texel;
      vec3 a = 0.5 * (texture2D(tDiffuse, vUv - dir * 0.1667).rgb + texture2D(tDiffuse, vUv + dir * 0.1667).rgb);
      vec3 b = a * 0.5 + 0.25 * (texture2D(tDiffuse, vUv - dir * 0.5).rgb + texture2D(tDiffuse, vUv + dir * 0.5).rgb);
      float lB = luma(b);
      gl_FragColor = vec4((lB < lMin || lB > lMax) ? a : b, 1.0);
    }`,
};

export function fxaaPass() {
  const p = new ShaderPass(FXAAShader);
  p.name = 'FXAAPass';
  return p;
}

function dirtTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d');
  const rng = mulberry32(42);
  g.fillStyle = '#060606';
  g.fillRect(0, 0, 512, 512);
  // soft smudges
  for (let i = 0; i < 26; i++) {
    const x = rng() * 512, y = rng() * 512, r = 30 + rng() * 120;
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    const a = 0.08 + rng() * 0.14;
    grd.addColorStop(0, `rgba(255,245,230,${a})`);
    grd.addColorStop(1, 'rgba(255,245,230,0)');
    g.fillStyle = grd;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // hexagonal aperture ghosts and specks
  for (let i = 0; i < 40; i++) {
    const x = rng() * 512, y = rng() * 512, r = 4 + rng() * 16;
    g.fillStyle = `rgba(255,255,255,${0.05 + rng() * 0.12})`;
    g.beginPath();
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      g[k ? 'lineTo' : 'moveTo'](x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    g.fill();
  }
  for (let i = 0; i < 500; i++) {
    g.fillStyle = `rgba(255,255,255,${rng() * 0.25})`;
    g.fillRect(rng() * 512, rng() * 512, 1 + rng() * 2, 1 + rng() * 2);
  }
  // a couple of wipe streaks
  g.strokeStyle = 'rgba(255,250,240,0.07)';
  for (let i = 0; i < 5; i++) {
    g.lineWidth = 6 + rng() * 14;
    g.beginPath();
    const y = rng() * 512;
    g.moveTo(-20, y);
    g.bezierCurveTo(150, y + rng() * 80 - 40, 350, y + rng() * 80 - 40, 540, y + rng() * 60 - 30);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

/** The BattlefrontGradePass plus the state that drives it (ADS, damage, explosions). */
export class Post {
  constructor(bloom) {
    this.bloom = bloom;
    this.pass = new ShaderPass(GradeShader);
    this.pass.name = 'BattlefrontGradePass';
    this.u = this.pass.uniforms;
    this.u.tDirt.value = dirtTexture();
    this.ads = 0;
    this.lowHp = 0;
    this.hit = 0; // chromatic aberration spike
    this.flash = 0;
    this.high = true;
    this.apply();
  }

  /** Copy GRADE into the uniforms (call after editing GRADE from the console). */
  apply() {
    const u = this.u, g = GRADE;
    u.exposure.value = g.exposure;
    u.contrast.value = g.contrast;
    u.pivot.value = g.pivot;
    u.crush.value = g.crush;
    u.shadowTint.value.fromArray(g.shadowTint);
    u.highlightGain.value.fromArray(g.highlightGain);
    u.saturation.value = g.saturation;
    u.midDesat.value = g.midDesat;
    u.lowHpDesat.value = g.lowHpDesat;
    this.bloom.strength = g.bloom.strength;
    this.bloom.radius = g.bloom.radius;
    this.bloom.threshold = g.bloom.threshold;
  }

  /** Brief chromatic-aberration hit (explosions, heavy damage). */
  kick(amount) { this.hit = Math.min(1.5, this.hit + amount); }
  whiteFlash(amount) { this.flash = Math.min(0.6, this.flash + amount); }

  update(dt, time, aspect, state) {
    const u = this.u, g = GRADE;
    this.ads = damp(this.ads, state.ads || 0, 12, dt);
    this.lowHp = damp(this.lowHp, state.lowHp || 0, 3, dt);
    this.hit = Math.max(0, this.hit - dt * 2.4);
    this.flash = Math.max(0, this.flash - dt * 1.6);
    u.time.value = time;
    u.aspect.value = aspect;
    u.vignette.value = g.vignette + (g.vignetteAds - g.vignette) * this.ads + this.lowHp * 0.15;
    u.grain.value = g.grain;
    u.ca.value = g.ca + this.hit * 0.014;
    u.flash.value = this.flash;
    u.lowHp.value = this.lowHp;
    u.pulse.value = state.pulse || 0;
    u.edgeBlur.value = clamp((this.high ? this.ads * 0.9 : 0) + this.lowHp * 0.7 + this.hit * 0.25, 0, 1.2);
    u.dirt.value = this.bloom.enabled ? g.dirt : 0;
    u.tBloom.value = this.bloom.renderTargetsHorizontal[0].texture;
  }
}

