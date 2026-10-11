import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { canvasTexture, mulberry32 } from './util.js';

/** Rigged characters exported from Blender by blender/build_characters.py */
export const MODEL_KEYS = ['cody', 'fox', 'rebel_clone', 'b1', 'b2', 'b2_rocket', 'commando', 'civilian', 'gree', 'clone_trooper', 'trooper_212', 'trooper_guard', 'yoda', 'yoda_saber', 'jedi', 'youngling',
  'jawa', 'tusken_sniper', 'tusken_melee', 'dooku'];
const cache = {};

function base64ToBuffer(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

export async function loadModels(onProgress) {
  const loader = new GLTFLoader();
  // When opened from the folder (file://), tools/pack.js embeds the models in the page.
  const packed = window.__GCD_MODELS;
  let done = 0;
  await Promise.all(MODEL_KEYS.map(async (k) => {
    const gltf = packed && packed[k]
      ? await loader.parseAsync(base64ToBuffer(packed[k]), './')
      : await loader.loadAsync(`assets/models/${k}.glb`);
    cache[k] = gltf;
    done++;
    if (onProgress) onProgress(done / MODEL_KEYS.length);
  }));
  weatherArmour();
  await loadProps(loader);
}

/** Tiling grime for armour plates: smudges, drips, fine speckle and a few bright scratches (multiplies the base colour). */
function grimeTexture() {
  const rng = mulberry32(77);
  return canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = '#f0efec';
    g.fillRect(0, 0, w, h);
    const wrap = (fn) => { for (const ox of [-w, 0, w]) for (const oy of [-h, 0, h]) fn(ox, oy); };
    for (let i = 0; i < 70; i++) {
      const x = rng() * w, y = rng() * h, r = 6 + rng() * 38, a = 0.05 + rng() * 0.12;
      wrap((ox, oy) => {
        const grd = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
        grd.addColorStop(0, 'rgba(70,58,44,' + a + ')');
        grd.addColorStop(1, 'rgba(70,58,44,0)');
        g.fillStyle = grd;
        g.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
      });
    }
    // drips running down the plates
    for (let i = 0; i < 26; i++) {
      const x = rng() * w, y = rng() * h, len = 20 + rng() * 70, a = 0.06 + rng() * 0.1;
      wrap((ox, oy) => {
        const grd = g.createLinearGradient(0, y + oy, 0, y + oy + len);
        grd.addColorStop(0, 'rgba(60,50,40,' + a + ')');
        grd.addColorStop(1, 'rgba(60,50,40,0)');
        g.fillStyle = grd;
        g.fillRect(x + ox, y + oy, 1 + rng() * 2.5, len);
      });
    }
    // speckle
    const img = g.getImageData(0, 0, w, h);
    for (let i = 0; i < img.data.length; i += 4) {
      const k = 1 - (rng() < 0.25 ? rng() * 0.09 : 0);
      img.data[i] *= k; img.data[i + 1] *= k; img.data[i + 2] *= k;
    }
    g.putImageData(img, 0, 0);
    // chips and scratches showing bright bare plate
    g.strokeStyle = 'rgba(255,255,255,0.9)';
    for (let i = 0; i < 40; i++) {
      const x = rng() * w, y = rng() * h, a = rng() * Math.PI, l = 3 + rng() * 14;
      g.lineWidth = 0.6 + rng() * 1.1;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
    }
  });
}

/**
 * 41st Elite Corps camouflage: irregular mid- and dark-green blotches (multiplying the light olive or grey base
 * colour of Gree's armour and helmet), with the grime map laid over it.
 */
function camoTexture(grime) {
  const rng = mulberry32(41);
  return canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, w, h);
    const blobs = (col, n, rmin, rmax) => {
      g.fillStyle = col;
      for (let i = 0; i < n; i++) {
        const cx = rng() * w, cy = rng() * h, r = rmin + rng() * (rmax - rmin);
        for (let k = 0; k < 7; k++) {
          const a = rng() * Math.PI * 2, d = rng() * r * 0.85, rr = r * (0.35 + rng() * 0.5);
          for (const ox of [-w, 0, w]) for (const oy of [-h, 0, h]) {
            g.beginPath();
            g.ellipse(cx + Math.cos(a) * d + ox, cy + Math.sin(a) * d + oy, rr, rr * (0.6 + rng() * 0.5), rng() * 3, 0, Math.PI * 2);
            g.fill();
          }
        }
      }
    };
    blobs('rgb(176,186,150)', 16, 14, 30);
    blobs('rgb(96,104,86)', 14, 9, 22);
    blobs('rgb(150,160,128)', 10, 5, 10);
    g.globalCompositeOperation = 'multiply';
    g.drawImage(grime.image, 0, 0, w, h);
    g.globalCompositeOperation = 'source-over';
  });
}

const BARE = /^(Visor|B2Eye|BXEye|Thruster|Civ|Yoda|Suit|Jedi|Saber|Dooku|Jawa|Tusken)/;
const CAMO = /^Gree(Camo|Helm)/;
/** Weathering: the Blender export carries box-projected UVs and baked vertex-colour dirt; add the grime map. */
function weatherArmour() {
  const tex = grimeTexture();
  const camo = camoTexture(tex);
  for (const k of MODEL_KEYS) {
    cache[k].scene.traverse((o) => {
      if (!o.isMesh || !o.geometry.attributes.uv) return;
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        if (BARE.test(m.name) || m.map) continue;
        m.map = CAMO.test(m.name) ? camo : tex;
        m.needsUpdate = true;
      }
    });
  }
}

/** Static set pieces from blender/build_props.py (TurboliftTower, Barricade, Crate, HVAC, Speeder). */
async function loadProps(loader) {
  const packed = window.__GCD_MODELS;
  cache.props = packed && packed.props
    ? await loader.parseAsync(base64ToBuffer(packed.props), './')
    : await loader.loadAsync('assets/models/props.glb');
  cache.props.scene.updateMatrixWorld(true);
  // keep the speeder underglow from blooming over everything
  const tame = { EngineGlow: 0.25, BlueLight: 0.16, RedLight: 0.35 };
  cache.props.scene.traverse((o) => { if (o.isMesh && tame[o.material.name]) o.material.emissiveIntensity *= tame[o.material.name]; });
}

const propMats = new Map();
/** Shared recoloured copy of a prop material ({ materialName: color }). */
function recolor(mat, colors) {
  const c = colors && colors[mat.name];
  if (c === undefined) return mat;
  const key = mat.name + ':' + c;
  if (!propMats.has(key)) { const m = mat.clone(); m.color.set(c); propMats.set(key, m); }
  return propMats.get(key);
}

/** A movable copy of a prop (a Group), e.g. traffic speeders. */
export function propObject(name, colors = null) {
  const src = cache.props && cache.props.scene.getObjectByName(name);
  if (!src) return null;
  const c = src.clone(true);
  c.position.set(0, 0, 0);
  c.traverse((o) => { if (o.isMesh) o.material = recolor(o.material, colors); });
  const g = new THREE.Group();
  g.add(c);
  return g;
}
const _pm = new THREE.Matrix4();
const _rm = new THREE.Matrix4();
/**
 * Place a copy of a Blender prop: its meshes are added straight to the scene (so the city's static
 * batching can merge them). colors: { materialName: color } swaps in recoloured materials.
 */
export function placeProp(scene, name, x, y, z, rotY = 0, scale = 1, colors = null) {
  const src = cache.props && cache.props.scene.getObjectByName(name);
  if (!src) return [];
  const root = new THREE.Object3D();
  root.position.set(x, y, z);
  root.rotation.y = rotY;
  if (Array.isArray(scale)) root.scale.set(scale[0], scale[1], scale[2]); else root.scale.setScalar(scale);
  root.updateMatrixWorld(true);
  _rm.copy(src.matrixWorld).invert();
  const out = [];
  src.traverse((o) => {
    if (!o.isMesh) return;
    const m = new THREE.Mesh(o.geometry, recolor(o.material, colors));
    _pm.multiplyMatrices(root.matrixWorld, _rm).multiply(o.matrixWorld);
    _pm.decompose(m.position, m.quaternion, m.scale);
    m.castShadow = m.receiveShadow = true;
    scene.add(m);
    out.push(m);
  });
  return out;
}

export function instantiate(key, cloneMaterials = false) {
  const g = cache[key];
  if (!g) throw new Error('Model not loaded: ' + key);
  const root = SkeletonUtils.clone(g.scene);
  const bones = {};
  const materials = [];
  root.traverse((o) => {
    if (o.isBone) bones[o.name] = o;
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
      o.frustumCulled = false;
      if (cloneMaterials) o.material = Array.isArray(o.material) ? o.material.map((m) => m.clone()) : o.material.clone();
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        m.envMapIntensity = 0.9;
        materials.push(m);
      }
    }
  });
  const mixer = new THREE.AnimationMixer(root);
  const actions = {};
  for (const clip of g.animations) actions[clip.name] = mixer.clipAction(clip);
  return { root, bones, mixer, actions, materials };
}
