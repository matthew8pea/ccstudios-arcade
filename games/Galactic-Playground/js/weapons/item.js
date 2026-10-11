/* GALACTIC PLAYGROUND — holdable items (base for sabers, blasters, explosives, melee, jetpacks).
 * Items are ordinary physics entities. When a character equips one it is welded to a hand
 * (a breakable weld), mirrored to match the holder's facing, and excluded from colliding
 * with its holder through the holder's collision group.
 * Authoring convention: +x is the item's forward (muzzle / blade direction), grip at def.grip.
 */
'use strict';

(() => {
  const Phys = GP.Phys, M = GP.M, CAT = Phys.CAT;

  class Item extends GP.Entity {
    constructor(game, def, opts) {
      super(game, def, opts);
      this.isItem = true;
      this.holder = null; this.slot = null;
      this.flipY = 1;
      this.gripJoint = null;
      this.groupRestoreT = 0;
      this.twoHanded = !!def.twoHanded;
      this.hidden = false;
      this.layer = 3;
      if (this.maxHp === Infinity && def.itemHp !== null) { this.maxHp = def.itemHp || 80; this.hp = this.maxHp; }
    }
    build(x, y, opts = {}) {
      this.scale = opts.scale || this.scale || 1;
      this.flipY = opts.flipY || 1;
      const b = new Phys.Body({ x, y, angle: opts.angle || 0, angularDamping: 0.3 });
      for (const s of this.makeShapes(this.flipY)) b.addShape(s);
      b.finalize();
      this.fitMass(b);
      this.addBody(b);
      this.afterBuild(opts);
      return this;
    }
    // Scale mass properties to the definition's real-world mass (kg) regardless of shape size
    fitMass(b) {
      const target = (this.def.mass || this.defaultMass()) * this.scale * this.scale;
      if (b.baseMass > 0 && target > 0) { const k = target / b.baseMass; b.baseMass *= k; b.baseI *= k; b.applyMass(); }
    }
    defaultMass() { return 2; }
    shapeOpts() {
      return { density: this.def.density || 250, friction: this.def.friction != null ? this.def.friction : 0.6, restitution: this.def.restitution != null ? this.def.restitution : 0.15, category: CAT.ITEM, mask: CAT.ALL };
    }
    makeShapes(flipY) {
      const list = GP.buildShapes(this.def.shapes, this.scale, this.scale * flipY, this.shapeOpts());
      if (this.def.saberproof) for (const s of list) s.tag = 'saberproof';
      return list;
    }
    afterBuild() {}
    setFlip(f) {
      if (f === this.flipY) return;
      const b = this.body;
      this.flipY = f;
      const keep = b.shapes.filter((s) => s.tag === 'blade');
      const group = b.shapes[0] ? b.shapes[0].group : 0;
      for (const c of b.contacts.slice()) this.game.world.destroyContact(c);
      b.shapes = [];
      for (const s of this.makeShapes(f)) { s.group = group; b.addShape(s); }
      // restore blades in authoring space before recomputing mass
      for (const s of keep) { s.translate(-b.ox, -b.oy); b.addShape(s); }
      // all shapes are now in the authoring frame: move the body to the authoring origin and recompute
      const wx = b.c * b.ox - b.s * b.oy, wy = b.s * b.ox + b.c * b.oy;
      b.x += wx; b.y += wy; b.ox = 0; b.oy = 0;
      const ms = b.massScale;
      b.finalize();
      this.fitMass(b);
      b.setMassScale(ms);
      this.afterFlip();
    }
    afterFlip() {}
    gripLocal() { const g = this.def.grip || [0, 0]; return { x: g[0] * this.scale, y: g[1] * this.scale * this.flipY }; }
    forward() { const b = this.body; return { x: b.c, y: b.s }; }
    pointWorld(px, py) { return this.body.originToWorld(px * this.scale, py * this.scale * this.flipY); }

    attach(char, slot) {
      const b = this.body;
      if (this.hidden) this.hideWithHolder(false);
      if (this.lodged) this.unlodge();
      this.holder = char; this.slot = slot; this.lastHolder = char;
      const f = char.facing;
      let parent, angle, anchor;
      if (slot === 'back') {
        parent = char.parts.torso;
        angle = parent.a + (this.def.backAngle || 0) * f;
        const bo = this.def.backOffset || [-0.2, -0.05];
        anchor = parent.toWorld(bo[0] * f * char.scale, bo[1] * char.scale);
      } else {
        parent = char.parts[slot];
        angle = parent.a + Math.PI / 2 + f * (this.def.gripTilt || 0);
        anchor = parent.toWorld(0, parent.part.h * 0.1);
      }
      this.setFlip(f);
      b.setAngle(angle);
      const g = this.gripLocal();
      const gx = b.c * g.x - b.s * g.y, gy = b.s * g.x + b.c * g.y;
      b.setOrigin(anchor.x - gx, anchor.y - gy, angle);
      b.vx = parent.vx; b.vy = parent.vy; b.w = parent.w;
      for (const s of b.shapes) s.group = char.group;
      this.groupRestoreT = 0;
      const j = new Phys.WeldJoint(parent, b, anchor.x, anchor.y, { breakForce: this.def.gripBreak || 9000 * char.stats.strength * char.scale, tag: 'grip' });
      j.onBreak = () => this.onGripBroken();
      this.game.world.addJoint(j);
      this.gripJoint = j;
      b.allowSleep = false;
      this.onAttach(char, slot);
    }
    reattach() {
      if (!this.holder) return;
      const c = this.holder, s = this.slot;
      if (this.gripJoint && this.gripJoint.world) this.game.world.removeJoint(this.gripJoint);
      this.gripJoint = null;
      this.attach(c, s);
    }
    detach() {
      const c = this.holder;
      if (this.gripJoint && this.gripJoint.world) this.game.world.removeJoint(this.gripJoint);
      this.gripJoint = null;
      this.holder = null; this.slot = null;
      this.releasedT = this.game.time;
      this.groupRestoreT = 0.5;
      this.body.allowSleep = true;
      if (this.hidden) this.hideWithHolder(false);
      this.onDetach(c);
    }
    onGripBroken() {
      const c = this.holder;
      this.gripJoint = null;
      if (c) c.onItemLost(this);
      this.holder = null; this.slot = null;
      this.groupRestoreT = 0.5;
      this.onDetach(c);
    }
    onAttach() {}
    onDetach() {}
    // Sharp items (knives, spears) lodge point-first into whatever they hit hard enough
    onImpact(body, dv, c, other) {
      const sh = this.def.sharp;
      if (!sh || this.holder || this.lodged || !other || other.removed) return;
      if (other.entity && other.entity === this.lastHolder && this.game.time - (this.releasedT || 0) < 0.5) return;
      const b = this.body;
      const vo = other.velocityAt(c.pts[0].x, c.pts[0].y), vb = b.velocityAt(c.pts[0].x, c.pts[0].y);
      const speed = Math.hypot(vb.x - vo.x, vb.y - vo.y);
      if (Math.max(speed, c.approach) < sh.speed) return;
      const tip = this.pointWorld(sh.tip[0], sh.tip[1]);
      const p = c.pts[0];
      if (Math.hypot(p.x - tip.x, p.y - tip.y) > 0.16 * this.scale) return;
      const f = this.forward();
      // must strike point-first: blade direction vs. the contact normal pointing into the target
      const into = c.bA === b ? { x: c.nx, y: c.ny } : { x: -c.nx, y: -c.ny };
      if (f.x * into.x + f.y * into.y < 0.55) return;
      const anchor = other.type === GP.Phys.STATIC ? this.game.world.ground : other;
      // push the tip a little into the target, then pin it there
      b.x += f.x * 0.06; b.y += f.y * 0.06; b.updateShapes();
      b.vx = other.vx; b.vy = other.vy; b.w = other.w;
      const j = new GP.Phys.WeldJoint(anchor, b, tip.x + f.x * 0.06, tip.y + f.y * 0.06, { breakForce: sh.hold || 2600, tag: 'lodged' });
      j.onBreak = () => { this.lodged = null; };
      this.game.world.addJoint(j);
      this.lodged = j;
      for (const s of b.shapes) { if (s._lodgeMask == null) s._lodgeMask = s.mask; s.mask = GP.Phys.CAT.WORLD; }
      this.lodgeT = 0;
      if (other.entity) GP.Damage.hit(other, { type: 'stab', amount: sh.damage * Math.min(1.6, Math.max(speed, c.approach) / 8), x: tip.x, y: tip.y, dirx: f.x, diry: f.y, source: this.lastHolder || this });
      else GP.Decals.add(tip.x, tip.y, 0.04, 'scorch');
      GP.Audio.play('impact', { x: p.x, y: p.y, strength: 0.9, mat: other.entity ? GP.mat(other.entity.material).sound : 'wood' });
      GP.Events.emit('item:lodged', { item: this, into: other.entity || null });
    }
    unlodge() {
      if (this.lodged && this.lodged.world) this.game.world.removeJoint(this.lodged);
      this.lodged = null;
      for (const s of this.body.shapes) if (s._lodgeMask != null) { s.mask = s._lodgeMask; s._lodgeMask = null; }
    }
    hideWithHolder(h) {
      if (h === this.hidden) return;
      this.hidden = h;
      const w = this.game.world, b = this.body;
      if (h) {
        if (this.gripJoint && this.gripJoint.world) w.removeJoint(this.gripJoint);
        w.removeBody(b);
      } else {
        b.contacts.length = 0; b.joints.length = 0;
        w.addBody(b);
        if (this.holder && !this.holder.hidden) { this.gripJoint = null; this.attach(this.holder, this.slot); }
      }
    }
    update(dt) {
      if (this.lodged && !this.lodged.world) this.unlodge();
      if (!this.lodged && this.body.shapes.some((s) => s._lodgeMask != null)) this.unlodge();
      if (this.groupRestoreT > 0) {
        this.groupRestoreT -= dt;
        if (this.groupRestoreT <= 0) { for (const s of this.body.shapes) s.group = 0; this.resetContacts(); }
      }
    }
    draw(ctx, dt) {
      if ((this.holder && !this.drawingHeld) || this.hidden) return;
      const b = this.body;
      ctx.save();
      ctx.translate(b.x, b.y); ctx.rotate(b.a);
      ctx.save();
      ctx.translate(b.ox, b.oy);
      ctx.scale(this.scale, this.scale * this.flipY);
      this.paint(ctx, dt);
      ctx.restore();
      GP.Draw.decals(ctx, b, dt);
      ctx.restore();
    }
    paint(ctx) { if (this.def.art) GP.Draw.art(ctx, this.def.art); else if (this.def.paint) this.def.paint(ctx, this); }
    drawHeld(ctx, dt) { this.drawingHeld = true; this.draw(ctx, dt); this.drawingHeld = false; }
    onDestroyed() {
      const b = this.body;
      GP.FX.sparks(b.x, b.y, 0, -1, 12, '#ffd27a', 4);
      GP.FX.chunks(b.x, b.y, 6, '#555', 3, 0.05);
      GP.FX.smoke(b.x, b.y, 2, 0.2, '#444');
      GP.Audio.play('impact', { x: b.x, y: b.y, strength: 0.8, mat: 'metal' });
      if (this.holder) this.holder.unequip(this.slot);
      this.game.removeEntity(this);
    }
    destroy() {
      if (this.holder) { const c = this.holder; c.onItemLost(this); this.holder = null; }
      super.destroy();
    }
    saveState() { return { flipY: this.flipY }; }
  }
  GP.Item = Item;
  GP.Registry.registerKind('item', Item);

  /* ------------------------------------------------ melee weapons */
  class Melee extends Item {
    constructor(game, def, opts) { super(game, def, opts); this.isMelee = true; this.active = true; }
    update(dt) {
      super.update(dt);
      const g = this.def.glowTips;
      if (g && this.active) for (const t of g) { const p = this.pointWorld(t[0], t[1]); GP.FX.frameLight(p.x, p.y, 1.2, t[2], 0.5); if (Math.random() < dt * 4) GP.FX.arc(p.x, p.y, p.x + M.rand(-0.15, 0.15), p.y + M.rand(-0.15, 0.15), t[2], 0.08, 0.015); }
    }
    drawGlow(ctx) {
      const g = this.def.glowTips;
      if (!g || this.hidden) return;
      for (const t of g) { const p = this.pointWorld(t[0], t[1]); GP.Draw.glow(ctx, p.x, p.y, 0.22, t[2], 0.9); }
    }
  }
  GP.Registry.registerKind('melee', Melee);

  /* ------------------------------------------------ jetpack */
  class Jetpack extends Item {
    constructor(game, def, opts) { super(game, def, opts); this.isJetpack = true; this.fuel = 1; this.firingT = 0; this.solo = 0; this.loopSnd = null; }
    thrust(char, dt) {
      if (this.fuel <= 0) return;
      const t = char.parts.torso;
      const g = this.game.world.gravityY;
      const m = char.totalM;
      const I = char.intent;
      t.applyForce(I.moveX * m * 6, -m * (g * 1.35 + 2));
      this.fuel = Math.max(0, this.fuel - dt * 0.22);
      this.firingT = 0.08;
    }
    update(dt) {
      super.update(dt);
      if (this.holder && this.holder.grounded) this.fuel = Math.min(1, this.fuel + dt * 0.35);
      if (!this.holder && this.solo > 0) {
        this.solo -= dt;
        const b = this.body;
        b.applyForce(b.s * b.m * 26 * this.flipY, -b.c * b.m * 26 * this.flipY);
        this.firingT = 0.08;
      }
      if (this.firingT > 0) {
        this.firingT -= dt;
        const n = this.pointWorld(this.def.nozzle[0], this.def.nozzle[1]);
        const b = this.body;
        const dx = -b.s * this.flipY, dy = b.c * this.flipY;
        GP.FX.fire(n.x, n.y, 2, 0.12, 4);
        GP.FX.spawn(GP.FX.K.GLOW, n.x, n.y, dx * 6, dy * 6 + 3, 0.15, 0.1, '#ffd070', { size1: 0.02 });
        if (Math.random() < 0.3) GP.FX.smoke(n.x, n.y + 0.2, 1, 0.15, '#666', 1);
        GP.FX.frameLight(n.x, n.y, 2, '#ff9a40', 0.8);
        if (!this.loopSnd) this.loopSnd = GP.Audio.loop('jet', { freq: 60 });
        if (this.loopSnd) this.loopSnd.set(0.35, 1.2, n.x, n.y);
      } else if (this.loopSnd) { this.loopSnd.stop(); this.loopSnd = null; }
    }
    use() { this.solo = 2.5; this.body.wake(); return true; }
    onRemove() { if (this.loopSnd) this.loopSnd.stop(); }
    getProperties() {
      const l = super.getProperties();
      l.unshift({ key: 'fuel', label: 'Fuel', type: 'meter', get: () => this.fuel });
      l.unshift({ key: 'fire', label: 'Fire thruster', type: 'button', action: () => this.use() });
      return l;
    }
  }
  GP.Registry.registerKind('jetpack', Jetpack);
})();
