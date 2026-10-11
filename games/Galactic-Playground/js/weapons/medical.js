/* GALACTIC PLAYGROUND — injectors (bacta, stims, sedatives...) and droid restraining bolts. */
'use strict';

(() => {
  const Phys = GP.Phys;

  // Effects are applied to characters; each returns a short description, or null if it had no effect.
  const EFFECTS = {
    bacta(c) {
      if (c.mech || c.state === 'dead') return null;
      for (const b of c.partList) if (!b.part.severed) { b.part.hp = b.part.maxHp; b.part.fractured = false; b.part.burn = Math.max(0, b.part.burn - 0.6); }
      if (c.onFire && GP.Heat) GP.Heat.extinguish(c);
      if (c.frozenSolid && GP.Heat) GP.Heat.thaw(c);
      c.unconscious = 0; c.stun = Math.min(c.stun, 0.5);
      if (GP.Gore) GP.Gore.stopBleeding(c);
      if (GP.Injury) GP.Injury.heal(c);
      return 'healed';
    },
    stim(c) {
      if (c.mech || c.state !== 'alive') return null;
      c.addBuff('stim', 25, () => { c.stats.strength *= 1.5; c.stats.knockResist *= 2; c.buffSpeed = 1.4; }, () => { c.stats.strength /= 1.5; c.stats.knockResist /= 2; c.buffSpeed = 1; }, '#7dff9a');
      c.unconscious = 0; c.stun = 0;
      return 'boosted';
    },
    sedative(c) { if (c.mech || c.state !== 'alive') return null; c.knockOut(35); return 'sedated'; },
    revive(c) {
      if (c.mech || c.state !== 'dead' || c.parts.head.part.severed || c.parts.torso.part.hp < -60) return null;
      c.revive();
      for (const b of c.partList) if (!b.part.severed) b.part.hp = Math.max(b.part.hp, b.part.maxHp * 0.4);
      c.stun = 2;
      return 'revived';
    },
    coolant(c) { if (!GP.Heat) return null; for (const b of c.partList) GP.Heat.addHeat(b, -260); return 'frozen'; },
    rage(c) {
      if (c.mech || c.state !== 'alive') return null;
      const team = c.team, mode = c.aiMode;
      c.addBuff('rage', 30,
        () => { c.team = 'rogue'; c.aiMode = 'aggressive'; c.stats.strength *= 1.4; if (c.brain) c.brain.target = null; },
        () => { c.team = team; c.aiMode = mode; c.stats.strength /= 1.4; if (c.brain) c.brain.target = null; }, '#ff4a3a');
      return 'enraged';
    },
    calm(c) { if (c.state !== 'alive') return null; c.team = 'neutral'; c.aiMode = 'passive'; if (c.brain) { c.brain.target = null; c.brain.aggressor = null; } return 'pacified'; },
  };

  class Injector extends GP.Item {
    constructor(game, def, opts) { super(game, def, opts); this.isInjector = true; this.used = false; this.maxHp = 20; this.hp = 20; }
    onImpact(body, dv, c, other) {
      if (this.used || dv < 1.2 || !other || !other.entity) return;
      const t = other.entity;
      if (t.isCharacterLike && t.partList && t !== this.holder) this.inject(t);
    }
    inject(target) {
      if (this.used || !target || !target.partList) return false;
      const fx = EFFECTS[this.def.injector.effect];
      const res = fx ? fx(target) : null;
      const p = target.position();
      const involvesPlayer = target === this.game.controlled || this.holder === this.game.controlled;
      if (!res) { GP.Audio.play('error'); if (involvesPlayer) GP.UI.toast(this.name + ' has no effect on ' + target.name + '.', 'warn'); return false; }
      this.used = true;
      GP.FX.ring(p.x, p.y, 0.9, this.def.injector.fluid, 0.4, 0.05);
      GP.FX.glow(p.x, p.y, 0.6, this.def.injector.fluid, 0.3, 0.6);
      GP.Audio.play('beepArm', { x: p.x, y: p.y, f: 900 });
      GP.Events.emit('injector:used', { item: this, target, result: res });
      if (involvesPlayer) GP.UI.toast(target.name + ' ' + res + '.', 'ok');
      return true;
    }
    use() {
      if (this.used) return false;
      if (this.holder) return this.inject(this.holder);
      const b = this.body;
      let best = null, bd = 1.6;
      for (const e of this.game.entities) {
        if (!e.partList || e.removed || e.hidden) continue;
        const p = e.position(), d = Math.hypot(p.x - b.x, p.y - b.y);
        if (d < bd) { bd = d; best = e; }
      }
      if (!best) { GP.UI.toast('Bring the injector within reach of a character.', 'warn'); return false; }
      return this.inject(best);
    }
    paint(ctx) {
      const f = this.def.injector.fluid;
      GP.Draw.roundRect(ctx, -0.12, -0.035, 0.22, 0.07, 0.015);
      ctx.fillStyle = 'rgba(220,235,245,0.55)'; ctx.fill(); ctx.strokeStyle = GP.Draw.OUTLINE; ctx.lineWidth = 0.012; ctx.stroke();
      if (!this.used) { ctx.fillStyle = f; ctx.fillRect(-0.1, -0.022, 0.17, 0.044); }
      ctx.fillStyle = '#5a5e66'; ctx.fillRect(-0.16, -0.045, 0.04, 0.09);
      ctx.strokeStyle = '#c8ccd4'; ctx.lineWidth = 0.01; ctx.beginPath(); ctx.moveTo(0.1, 0); ctx.lineTo(0.2, 0); ctx.stroke();
    }
    drawGlow(ctx) { if (!this.used && !this.hidden) { const p = this.pointWorld(-0.01, 0); GP.Draw.glow(ctx, p.x, p.y, 0.14, this.def.injector.fluid, 0.5); } }
    getProperties() {
      const l = super.getProperties().filter((p) => p.key !== 'hp' && p.key !== 'repair');
      l.unshift({ key: 'refill', label: this.used ? 'Refill' : 'Full (refill)', type: 'button', action: () => { this.used = false; } },
        { key: 'inject', label: 'Inject nearest character', type: 'button', action: () => this.use() });
      return l;
    }
    saveState() { return { flipY: this.flipY, used: this.used }; }
    loadState(s) { if (s) this.used = !!s.used; }
  }
  GP.Registry.registerKind('injector', Injector);
  GP.Injector = Injector;

  // Restraining bolt: sticks to a droid and shuts its behavior off until removed
  class Restrainer extends GP.Item {
    constructor(game, def, opts) { super(game, def, opts); this.target = null; this.lock = null; this.maxHp = 40; this.hp = 40; }
    onImpact(body, dv, c, other) {
      if (this.target || this.holder || !other || !other.entity) return;
      const t = other.entity;
      if (!(t.mech || t instanceof GP.Bot) || t.restrained) return;
      const p = c.pts[0];
      const j = new Phys.WeldJoint(other, this.body, p.x, p.y, { breakForce: 3000, tag: 'restrainer' });
      this.game.world.addJoint(j);
      j.onBreak = () => this.release();
      this.lock = j; this.target = t;
      t.restrained = { mode: t.aiMode };
      t.aiMode = 'off';
      if (t.brain) t.brain.target = null;
      if (t.target !== undefined && !t.brain) t.target = null;
      GP.Audio.play('zap', { x: p.x, y: p.y }); GP.Audio.play('droidBeep', { x: p.x, y: p.y, vol: 0.3 });
      GP.FX.arc(p.x, p.y, t.position().x, t.position().y, '#ffd060', 0.3);
    }
    release() {
      const t = this.target;
      if (this.lock && this.lock.world) this.game.world.removeJoint(this.lock);
      this.lock = null; this.target = null;
      if (t && t.restrained) { t.aiMode = t.restrained.mode; t.restrained = null; }
    }
    update(dt) {
      super.update(dt);
      if (this.target && (this.target.removed || !this.lock || !this.lock.world)) this.release();
      if (this.target && Math.random() < dt * 1.5) { const b = this.body; GP.FX.sparks(b.x, b.y, 0, -1, 1, '#ffd060', 1.5); }
    }
    use() { if (this.target) { this.release(); GP.Audio.play('click', {}); return true; } return false; }
    onRemove() { this.release(); }
    getProperties() {
      const l = super.getProperties().filter((p) => p.key !== 'hp' && p.key !== 'repair');
      if (this.target) l.unshift({ key: 'rel', label: 'Remove from droid', type: 'button', action: () => this.release() });
      return l;
    }
  }
  GP.Registry.registerKind('restrainer', Restrainer);

  const inj = (id, name, effect, fluid, desc) => ({
    id, name, kind: 'injector', category: 'Melee', sub: 'Medical', mass: 0.2, shapes: [{ box: [0.36, 0.08] }], grip: [-0.05, 0], gripTilt: -0.5,
    injector: { effect, fluid }, desc: desc + ' Throw or stab it into a character, or hold it and attack to use it on yourself.', tags: ['syringe', 'injector', 'medical', effect],
  });
  GP.Registry.registerAll([
    inj('bacta_injector', 'Bacta Injector', 'bacta', '#4ae0d0', 'Heals every wound, puts out fires and thaws.'),
    inj('adrenal_stim', 'Adrenal Stim', 'stim', '#7dff9a', 'Strength, speed and toughness for 25 seconds.'),
    inj('sedative', 'Sedative Dart', 'sedative', '#8a9aff', 'Knocks a character out cold.'),
    inj('revival_stim', 'Revival Stim', 'revive', '#ffd060', 'Brings a fallen (but intact) character back.'),
    inj('coolant_injector', 'Coolant Injector', 'coolant', '#bfefff', 'Flash-freezes the target solid.'),
    inj('rage_toxin', 'Berserker Toxin', 'rage', '#ff4a3a', 'The target attacks everyone for 30 seconds.'),
    inj('calm_serum', 'Pacifier Serum', 'calm', '#ffffff', 'The target becomes neutral and peaceful.'),
    {
      id: 'restraining_bolt', name: 'Restraining Bolt', kind: 'restrainer', category: 'Melee', sub: 'Medical', mass: 0.3, shapes: [{ circle: [0.07] }], grip: [0, 0],
      art: [{ t: 'circle', x: 0, y: 0, r: 0.07, f: '#b8923a', s: true }, { t: 'circle', x: 0, y: 0, r: 0.035, f: '#6a5020' }],
      desc: 'Throw it at a droid: it sticks and shuts the droid down until removed (activate it again).', tags: ['droid', 'disable', 'bolt'],
    },
    // heat & cold weapons
    {
      id: 'flamethrower', name: 'Wrist Flame Projector', kind: 'blaster', category: 'Blasters', sub: 'Heavy', mass: 3, twoHanded: false,
      shapes: [{ box: [0.45, 0.1, 0.12, 0] }], grip: [0, 0.05], muzzle: [0.36, 0],
      art: [{ t: 'rect', x: 0.1, y: 0, w: 0.42, h: 0.1, f: '#6a5a3a', s: true, r: 0.03 }, { t: 'rect', x: 0.32, y: 0, w: 0.1, h: 0.06, f: '#2a2a2a', s: true }, { t: 'circle', x: -0.05, y: -0.07, r: 0.05, f: '#c83a1a', s: true }],
      stats: { damage: 3, rate: 22, speed: 11, size: 0.2, len: 0.2, recoil: 0.3, mag: 220, reload: 2.5, spread: 0.16, color: '#ff8a30', auto: true, bolt: 'flame', life: 0.55, gravity: -4, impulse: 0.4, pitch: 0.5 },
      desc: 'Sets flammable things (and people) alight.', tags: ['fire', 'flame', 'burn', 'boba'],
    },
    {
      id: 'cryo_grenade', name: 'Cryoban Grenade', kind: 'explosive', category: 'Explosives', sub: 'Grenades', throwable: true, mass: 0.6, shapes: [{ circle: [0.09] }],
      art: [{ t: 'circle', x: 0, y: 0, r: 0.09, f: '#c8e8f8', s: true }, { t: 'rect', x: 0, y: 0, w: 0.18, h: 0.03, f: '#3a8ac8' }], light: [0, 0, '#9fe2ff'],
      explosive: { trigger: 'timer', fuse: 2.2, radius: 4.5, damage: 20, power: 5, kind: 'cryo' }, desc: 'Flash-freezes everything nearby.', tags: ['ice', 'freeze', 'carbonite', 'cold'],
    },
    {
      id: 'incendiary_grenade', name: 'Incendiary Grenade', kind: 'explosive', category: 'Explosives', sub: 'Grenades', throwable: true, mass: 0.6, shapes: [{ box: [0.11, 0.18] }],
      art: [{ t: 'rect', x: 0, y: 0, w: 0.11, h: 0.18, f: '#a83a1a', s: true, r: 0.03 }, { t: 'rect', x: 0, y: 0, w: 0.11, h: 0.04, f: '#ffb040' }], light: [0, -0.08, '#ffb040'],
      explosive: { trigger: 'timer', fuse: 2.2, radius: 3.6, damage: 60, power: 8, kind: 'incendiary' }, desc: 'Bursts into flames that ignite whatever is nearby.', tags: ['fire', 'napalm', 'burn'],
    },
  ]);
})();
