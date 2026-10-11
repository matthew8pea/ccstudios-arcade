import * as THREE from 'three';
import { instantiate } from './assets.js';

const UP = new THREE.Vector3(0, 1, 0);
const _q = new THREE.Quaternion();
const _pq = new THREE.Quaternion();
const _t = new THREE.Quaternion();
const _right = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _hp = new THREE.Vector3();
const _lt = new THREE.Vector3();
// eye level above the feet, per model (clones and most humans 1.71)
const EYE = { yoda: 0.62, yoda_saber: 0.6, youngling: 1.08, jawa: 0.86, tusken_melee: 1.66, dooku: 1.74 };

function rotateBoneWorld(bone, axis, angle) {
  if (!angle || !bone.parent) return;
  bone.parent.getWorldQuaternion(_pq);
  _q.setFromAxisAngle(axis, angle);
  _t.copy(_pq).invert().multiply(_q).multiply(_pq);
  bone.quaternion.premultiply(_t);
  bone.updateMatrixWorld(true);
}

/**
 * A skinned, animated model from Blender. Models face +Z.
 * `pitch` / `twist` are layered on top of the animation (spine + chest) so a
 * character can aim up/down and keep its upper body on target while strafing.
 */
export class Character {
  constructor(scene, key, opts = {}) {
    const inst = instantiate(key, opts.cloneMaterials);
    this.key = key;
    this.eyeH = EYE[key] ?? 1.71;
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.add(inst.root);
    this.model = inst.root;
    this.bones = inst.bones;
    this.mixer = inst.mixer;
    this.actions = inst.actions;
    this.materials = inst.materials;
    this.current = null;
    this.currentName = '';
    this.pitch = 0;
    this.twist = 0;
    this.opacity = 1;
    // cutscenes: a world point the head turns toward (neck + head, on top of the animation), eased in and out
    this.lookTarget = null;
    this._ly = 0;
    this._lp = 0;
    scene.add(this.group);
  }

  get position() { return this.group.position; }
  get yaw() { return this.group.rotation.y; }
  set yaw(v) { this.group.rotation.y = v; }

  play(name, fade = 0.2, opts = {}) {
    const a = this.actions[name];
    if (!a) return null;
    const loop = opts.loop !== undefined ? opts.loop : name !== 'Death';
    if (this.current === a && !opts.restart) {
      if (opts.timeScale !== undefined) a.setEffectiveTimeScale(opts.timeScale);
      return a;
    }
    const prev = this.current;
    a.reset();
    a.enabled = true;
    a.setEffectiveTimeScale(opts.timeScale ?? 1);
    a.setEffectiveWeight(1);
    a.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
    a.clampWhenFinished = !loop;
    if (prev && prev !== a && fade > 0) a.crossFadeFrom(prev, fade, false);
    else if (prev && prev !== a) prev.stop();
    a.play();
    this.current = a;
    this.currentName = name;
    return a;
  }

  setTimeScale(s) { if (this.current) this.current.setEffectiveTimeScale(s); }

  update(dt) {
    const { spine, chest, neck, head } = this.bones;
    // The mixer only writes bones whose animated value changed, so undo last frame's
    // aim offsets first; otherwise they would accumulate on static poses.
    if (this._aimSaved) {
      if (spine) spine.quaternion.copy(this._spineQ);
      if (chest) chest.quaternion.copy(this._chestQ);
      this._aimSaved = false;
    }
    if (this._lookSaved) {
      if (neck) neck.quaternion.copy(this._neckQ);
      if (head) head.quaternion.copy(this._headQ);
      this._lookSaved = false;
    }
    this.mixer.update(dt);
    if (this.pitch !== 0 || this.twist !== 0) {
      this._spineQ ||= new THREE.Quaternion();
      this._chestQ ||= new THREE.Quaternion();
      if (spine) this._spineQ.copy(spine.quaternion);
      if (chest) this._chestQ.copy(chest.quaternion);
      this._aimSaved = true;
      this.group.updateMatrixWorld(true);
      const aimYaw = this.group.rotation.y + this.twist;
      _right.set(-Math.cos(aimYaw), 0, Math.sin(aimYaw));
      if (spine) { rotateBoneWorld(spine, UP, this.twist * 0.5); rotateBoneWorld(spine, _right, this.pitch * 0.45); }
      if (chest) { rotateBoneWorld(chest, UP, this.twist * 0.5); rotateBoneWorld(chest, _right, this.pitch * 0.55); }
    }
    if (this.lookTarget || this._ly !== 0 || this._lp !== 0) this.updateLook(dt);
  }

  /** World position of the eyes (from the group transform, so it does not bob with the animation). */
  eye(out) { this.group.updateWorldMatrix(true, false); return this.group.localToWorld(out.set(0, this.eyeH, 0.06)); }

  /**
   * Turn the head (and some of the neck) toward `lookTarget` (a point, or another Character's eyes), as far as a
   * neck turns; eases back when cleared.
   */
  updateLook(dt) {
    const { neck, head } = this.bones;
    if (!head) { this._ly = this._lp = 0; return; }
    this.group.updateMatrixWorld(true);
    this.group.getWorldQuaternion(_pq);
    _fwd.set(0, 0, 1).applyQuaternion(_pq);
    const bodyYaw = Math.atan2(_fwd.x, _fwd.z);
    let ty = 0, tp = 0;
    if (this.lookTarget) {
      const tgt = this.lookTarget.isVector3 ? this.lookTarget : this.lookTarget.eye(_lt);
      head.getWorldPosition(_hp);
      _hp.y += 0.1;
      const dx = tgt.x - _hp.x, dz = tgt.z - _hp.z;
      let a = Math.atan2(dx, dz) - bodyYaw;
      a = Math.atan2(Math.sin(a), Math.cos(a));
      ty = Math.max(-1.1, Math.min(1.1, a));
      tp = Math.max(-0.35, Math.min(0.4, Math.atan2(tgt.y - _hp.y, Math.hypot(dx, dz))));
    }
    const k = 1 - Math.exp(-5 * dt);
    this._ly += (ty - this._ly) * k;
    this._lp += (tp - this._lp) * k;
    if (!this.lookTarget && Math.abs(this._ly) < 1e-3 && Math.abs(this._lp) < 1e-3) { this._ly = this._lp = 0; return; }
    this._neckQ ||= new THREE.Quaternion();
    this._headQ ||= new THREE.Quaternion();
    if (neck) this._neckQ.copy(neck.quaternion);
    this._headQ.copy(head.quaternion);
    this._lookSaved = true;
    const yaw = bodyYaw + this._ly;
    _right.set(-Math.cos(yaw), 0, Math.sin(yaw));
    if (neck) { rotateBoneWorld(neck, UP, this._ly * 0.4); rotateBoneWorld(neck, _right, this._lp * 0.35); }
    rotateBoneWorld(head, UP, this._ly * (neck ? 0.6 : 1)); rotateBoneWorld(head, _right, this._lp * (neck ? 0.65 : 1));
  }

  boneWorld(name, out) {
    const b = this.bones[name];
    if (!b) return out.copy(this.group.position).setY(this.group.position.y + 1.4);
    return b.getWorldPosition(out);
  }

  setOpacity(o) {
    if (o === this.opacity) return;
    this.opacity = o;
    for (const m of this.materials) {
      m.transparent = o < 1;
      m.opacity = o;
      m.depthWrite = o >= 1;
    }
  }

  setFlash(v) {
    for (const m of this.materials) {
      if (!m.emissive) continue;
      if (m.userData.baseEmissive === undefined) {
        m.userData.baseEmissive = m.emissive.clone();
        m.userData.baseIntensity = m.emissiveIntensity;
      }
      if (v > 0) { m.emissive.setRGB(v, v * 0.85, v * 0.7); m.emissiveIntensity = 1; }
      else { m.emissive.copy(m.userData.baseEmissive); m.emissiveIntensity = m.userData.baseIntensity; }
    }
  }

  dispose() {
    this.mixer.stopAllAction();
    this.scene.remove(this.group);
  }
}

/** Reuses characters so spawning enemies does not keep cloning skeletons. */
export class CharacterPool {
  constructor(scene) { this.scene = scene; this.free = {}; }

  get(key) {
    const list = this.free[key];
    let c = list && list.pop();
    if (c) {
      this.scene.add(c.group);
      c.group.visible = true;
      c.group.rotation.set(0, 0, 0);
      c.group.position.set(0, 0, 0);
      c.setOpacity(1);
      c.setFlash(0);
      c.pitch = c.twist = 0;
      if (c._aimSaved) {
        if (c.bones.spine) c.bones.spine.quaternion.copy(c._spineQ);
        if (c.bones.chest) c.bones.chest.quaternion.copy(c._chestQ);
        c._aimSaved = false;
      }
      if (c._lookSaved) {
        if (c.bones.neck) c.bones.neck.quaternion.copy(c._neckQ);
        c.bones.head.quaternion.copy(c._headQ);
        c._lookSaved = false;
      }
      c.lookTarget = null;
      c._ly = c._lp = 0;
      c.mixer.stopAllAction();
      c.current = null;
      c.currentName = '';
    } else {
      c = new Character(this.scene, key, { cloneMaterials: true });
    }
    return c;
  }

  release(c) {
    c.mixer.stopAllAction();
    this.scene.remove(c.group);
    (this.free[c.key] ||= []).push(c);
  }
}
