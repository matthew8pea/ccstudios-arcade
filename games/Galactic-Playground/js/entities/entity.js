/* GALACTIC PLAYGROUND — entity base class, content registry, material table.
 * An Entity is a gameplay object built from one or more physics bodies (+ joints).
 * Content is configuration: definitions registered with GP.Registry name a `kind`
 * (an Entity subclass) plus data. New content rarely needs new code.
 */
'use strict';

GP.Materials = {
  metal:   { sound: 'metal', spark: '#ffd27a', debris: '#6d7380', cuttable: true, scorch: true },
  armor:   { sound: 'armor', spark: '#ffd27a', debris: '#d8dde4', cuttable: true, scorch: true },
  droid:   { sound: 'droid', spark: '#ffe08a', debris: '#8a7560', cuttable: true, scorch: true, electric: true },
  flesh:   { sound: 'flesh', spark: '#ff9a50', debris: '#7a4a3a', cuttable: true, scorch: true },
  wood:    { sound: 'wood', spark: '#ffb060', debris: '#7a5836', cuttable: true, scorch: true },
  stone:   { sound: 'stone', spark: '#ffcf8a', debris: '#8a8174', cuttable: true, scorch: true },
  crystal: { sound: 'crystal', spark: '#bfe8ff', debris: '#a8d8ff', cuttable: true },
  plastic: { sound: 'plastic', spark: '#ffcf8a', debris: '#b8b0a0', cuttable: true, scorch: true },
  beskar:  { sound: 'metal', spark: '#fff2c0', debris: '#9aa4b0', cuttable: false, scorch: false },
  energy:  { sound: 'crystal', spark: '#9fe2ff', debris: '#9fe2ff', cuttable: false },
  world:   { sound: 'stone', spark: '#ffcf8a', debris: '#6a6a6a', cuttable: false, scorch: true },
};
GP.mat = (name) => GP.Materials[name] || GP.Materials.metal;

GP.Registry = (() => {
  const defs = new Map();
  const kinds = {};
  const categories = [
    { id: 'Characters', icon: 'user', desc: 'Jedi, Sith, troopers, heroes and aliens' },
    { id: 'Droids', icon: 'droid', desc: 'Battle droids, astromechs, protocol and security droids' },
    { id: 'Lightsabers', icon: 'saber', desc: 'Single, double-bladed and short sabers in every color' },
    { id: 'Blasters', icon: 'blaster', desc: 'Pistols, rifles, repeaters, snipers and launchers' },
    { id: 'Melee', icon: 'staff', desc: 'Staffs, vibro-weapons and pikes' },
    { id: 'Explosives', icon: 'bomb', desc: 'Detonators, charges, mines, rockets' },
    { id: 'Vehicles', icon: 'ship', desc: 'Speeders, walkers, starfighters and gunships' },
    { id: 'Props', icon: 'crate', desc: 'Crates, barrels, furniture and debris' },
    { id: 'Structures', icon: 'beam', desc: 'Beams, platforms, walls, building parts, lights and machines' },
    { id: 'Contraptions', icon: 'house', desc: 'Prefab buildings and your own saved builds' },
  ];

  return {
    categories,
    register(def) {
      if (!def.id || !def.kind) throw new Error('Content definition needs id and kind');
      if (defs.has(def.id)) console.warn('Duplicate content id', def.id);
      def.tags = def.tags || [];
      defs.set(def.id, def);
      return def;
    },
    registerAll(list) { list.forEach((d) => this.register(d)); },
    registerKind(name, cls) { kinds[name] = cls; },
    kind(name) { return kinds[name]; },
    get(id) { return defs.get(id); },
    all() { return Array.from(defs.values()); },
    list(category) { return this.all().filter((d) => d.category === category && !d.hidden); },
    search(q) {
      q = q.trim().toLowerCase();
      if (!q) return [];
      const words = q.split(/\s+/);
      return this.all().filter((d) => {
        if (d.hidden) return false;
        const hay = (d.name + ' ' + d.category + ' ' + (d.sub || '') + ' ' + d.tags.join(' ') + ' ' + (d.desc || '')).toLowerCase();
        return words.every((w) => hay.includes(w));
      });
    },
    create(game, id, opts = {}) {
      const def = typeof id === 'string' ? defs.get(id) : id;
      if (!def) throw new Error('Unknown content: ' + id);
      const K = kinds[def.kind];
      if (!K) throw new Error('Unknown kind: ' + def.kind);
      return new K(game, def, opts);
    },
  };
})();

GP.Entity = class Entity {
  constructor(game, def, opts = {}) {
    this.game = game;
    this.def = def;
    this.id = opts.id || GP.uid();
    GP.uid.bump(this.id);
    this.kind = def.kind;
    this.name = opts.name || def.name;
    this.bodies = [];
    this.joints = [];
    this.alive = true;
    this.removed = false;
    this.layer = def.layer != null ? def.layer : 2;
    this.material = def.material || 'metal';
    this.team = opts.team || def.team || 'neutral';
    this.maxHp = def.hp != null ? def.hp : Infinity;
    this.hp = this.maxHp;
    this.resist = Object.assign({}, def.resist || {});
    this.errors = 0;
    this.age = 0;
    this.facing = opts.facing || 1;
    this.scale = opts.scale || def.scale || 1;
    this.lastDamager = null;
    this.flags = {};
  }

  // subclasses create bodies here
  build() {}
  get body() { return this.bodies[0]; }

  addBody(b) {
    b.entity = this;
    this.bodies.push(b);
    this.game.world.addBody(b);
    return b;
  }
  removeBodyRef(b) {
    const i = this.bodies.indexOf(b);
    if (i >= 0) this.bodies.splice(i, 1);
    this.game.world.removeBody(b);
  }
  addJoint(j) {
    j.entity = this;
    this.joints.push(j);
    this.game.world.addJoint(j);
    return j;
  }
  removeJoint(j) {
    const i = this.joints.indexOf(j);
    if (i >= 0) this.joints.splice(i, 1);
    if (j.world) this.game.world.removeJoint(j);
  }

  position() {
    const b = this.body;
    if (!b) return { x: 0, y: 0 };
    return { x: b.x, y: b.y };
  }
  velocity() { const b = this.body; return b ? { x: b.vx, y: b.vy } : { x: 0, y: 0 }; }
  totalMass() { let m = 0; for (const b of this.bodies) m += b.m; return m; }
  bounds() {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const b of this.bodies) for (const s of b.shapes) {
      if (!s.enabled || s.tag === 'blade') continue;
      if (s.minX < minX) minX = s.minX; if (s.minY < minY) minY = s.minY;
      if (s.maxX > maxX) maxX = s.maxX; if (s.maxY > maxY) maxY = s.maxY;
    }
    if (minX === Infinity) { const p = this.position(); return { minX: p.x, minY: p.y, maxX: p.x, maxY: p.y }; }
    return { minX, minY, maxX, maxY };
  }

  update() {}
  draw(ctx) {
    const col = this.def.color || '#8892a0';
    for (const b of this.bodies) {
      GP.Draw.shapes(ctx, b, col, GP.Draw.OUTLINE, 0.025);
    }
  }
  drawGlow() {}

  // Generic damage: reduces hp, destroys at 0
  damage(info) {
    if (!this.alive || this.maxHp === Infinity) return 0;
    const r = this.resist[info.type] != null ? this.resist[info.type] : 1;
    const amt = info.amount * r;
    if (amt <= 0) return 0;
    this.hp -= amt;
    if (info.source) this.lastDamager = info.source;
    if (this.hp <= 0) { this.hp = 0; this.onDestroyed(info); }
    return amt;
  }
  onDestroyed() { this.alive = false; }
  heal() { this.hp = this.maxHp; }

  use() { return false; }
  // Called when a character presses interact nearby; return true if handled
  interact() { return false; }

  destroy() {
    if (this.removed) return;
    this.removed = true;
    this.alive = false;
    try { this.onRemove(); } catch (e) { console.error(e); }
    for (const j of this.joints.slice()) if (j.world) this.game.world.removeJoint(j);
    for (const b of this.bodies) this.game.world.removeBody(b);
    this.joints = [];
  }
  onRemove() {}

  isFrozen() { return this.bodies.length > 0 && this.bodies.every((b) => b.frozen); }
  setFrozen(f) { for (const b of this.bodies) b.setFrozen(f); }
  massScale() { return this.bodies.length ? this.bodies[0].massScale : 1; }
  setMassScale(k) { for (const b of this.bodies) b.setMassScale(k); this.props.massScale = k; }
  friction() { const s = this.body && this.body.shapes[0]; return s ? s.friction : 0.6; }
  setFriction(f) { for (const b of this.bodies) for (const s of b.shapes) s.friction = f; this.props.friction = f; this.resetContacts(); }
  bounce() { const s = this.body && this.body.shapes[0]; return s ? s.restitution : 0.1; }
  setBounce(r) { for (const b of this.bodies) for (const s of b.shapes) s.restitution = r; this.props.bounce = r; this.resetContacts(); }
  gravityScale() { return this.body ? this.body.gravityScale : 1; }
  setGravityScale(g) { for (const b of this.bodies) { b.gravityScale = g; b.wake(); } this.props.gravityScale = g; }
  collisionsOn() { return this.props.noCollide !== true; }
  setCollisions(on) {
    this.props.noCollide = !on;
    for (const b of this.bodies) for (const s of b.shapes) {
      if (s.tag === 'blade') continue;
      if (!on) { if (s._mask == null) s._mask = s.mask; s.mask = GP.Phys.CAT.WORLD; }
      else if (s._mask != null) { s.mask = s._mask; s._mask = null; }
    }
    this.resetContacts();
  }
  resetContacts() {
    const w = this.game.world;
    for (const b of this.bodies) { for (const c of b.contacts.slice()) w.destroyContact(c); b.wake(); }
  }
  get props() { if (!this._props) this._props = {}; return this._props; }

  // Property schema consumed by the inspector UI
  getProperties() {
    const self = this;
    const list = [];
    list.push({ key: 'frozen', label: 'Frozen', type: 'bool', get: () => self.isFrozen(), set: (v) => self.setFrozen(v) });
    list.push({ key: 'mass', label: 'Mass multiplier', type: 'range', min: 0.1, max: 10, step: 0.1, get: () => self.massScale(), set: (v) => self.setMassScale(v) });
    list.push({ key: 'friction', label: 'Friction', type: 'range', min: 0, max: 2, step: 0.05, get: () => self.friction(), set: (v) => self.setFriction(v) });
    list.push({ key: 'bounce', label: 'Bounciness', type: 'range', min: 0, max: 1, step: 0.05, get: () => self.bounce(), set: (v) => self.setBounce(v) });
    list.push({ key: 'gravity', label: 'Gravity scale', type: 'range', min: -1, max: 3, step: 0.1, get: () => self.gravityScale(), set: (v) => self.setGravityScale(v) });
    list.push({ key: 'collide', label: 'Collisions', type: 'bool', get: () => self.collisionsOn(), set: (v) => self.setCollisions(v) });
    if (GP.Heat && GP.Settings.play.temperature !== false) {
      list.push({ key: 'temp', label: 'Temperature', type: 'info', get: () => { const t = GP.Heat.entityTemp(self); return t == null ? GP.Heat.fmt(GP.Heat.ambient(self.game)) : GP.Heat.fmt(t) + (self.onFire ? ' · burning' : self.frozenSolid ? ' · frozen solid' : ''); } });
      if (self.onFire) list.push({ key: 'ext', label: 'Extinguish', type: 'button', action: () => GP.Heat.extinguish(self) });
      else list.push({ key: 'ignite', label: 'Set on fire', type: 'button', action: () => GP.Heat.ignite(self) });
      list.push({ key: 'chill', label: 'Deep freeze', type: 'button', action: () => { for (const b of self.bodies) GP.Heat.addHeat(b, -250); } });
    }
    if (this.maxHp !== Infinity) {
      list.push({ key: 'hp', label: 'Integrity', type: 'meter', get: () => self.hp / self.maxHp });
      list.push({ key: 'repair', label: 'Repair', type: 'button', action: () => self.heal() });
    }
    return list;
  }

  // ---- save / load ----
  serializeBodies() {
    return this.bodies.map((b) => ({
      x: +b.x.toFixed(4), y: +b.y.toFixed(4), a: +b.a.toFixed(4),
      vx: +b.vx.toFixed(3), vy: +b.vy.toFixed(3), w: +b.w.toFixed(3), f: b.frozen ? 1 : 0,
    }));
  }
  applyBodies(list) {
    if (!list) return;
    for (let i = 0; i < Math.min(list.length, this.bodies.length); i++) {
      const b = this.bodies[i], s = list[i];
      b.x = s.x; b.y = s.y; b.setAngle(s.a);
      b.vx = s.vx || 0; b.vy = s.vy || 0; b.w = s.w || 0;
      b.updateShapes();
      if (s.f) b.setFrozen(true);
    }
  }
  serialize() {
    return {
      def: this.def.id, id: this.id, team: this.team, facing: this.facing, scale: this.scale,
      hp: this.hp === Infinity ? null : this.hp, props: this.props, bodies: this.serializeBodies(), state: this.saveState(),
    };
  }
  saveState() { return null; }
  loadState() {}
  // called after every entity of a scene exists (resolve references)
  resolve() {}
  restoreProps(p) {
    if (!p) return;
    if (p.massScale != null) this.setMassScale(p.massScale);
    if (p.friction != null) this.setFriction(p.friction);
    if (p.bounce != null) this.setBounce(p.bounce);
    if (p.gravityScale != null) this.setGravityScale(p.gravityScale);
    if (p.noCollide) this.setCollisions(false);
  }
};
