/* GALACTIC PLAYGROUND — explosives.
 * Trigger types: 'timer' (arm then fuse), 'impact' (armed, explodes on a hard hit), 'remote'
 * (armed, detonated by the remote key/button), 'proximity' (arms, then senses characters/vehicles),
 * 'rocket' (armed: thruster ignites, flies forward, explodes on impact; homing optional),
 * 'sticky' charges attach to what they touch once armed.
 * Any explosive also cooks off when hit hard enough by blaster fire, fire or other explosions.
 */
'use strict';

(() => {
  const M = GP.M, Phys = GP.Phys;

  class Explosive extends GP.Item {
    constructor(game, def, opts) {
      super(game, def, opts);
      this.isExplosive = true;
      this.isThrowable = !!def.throwable;
      const x = def.explosive || {};
      this.cfg = Object.assign({ trigger: 'timer', fuse: 3, radius: 3.5, damage: 140, power: 16, kind: 'fire', sticky: false, homing: false, thrust: 30, sense: 1.6 }, x);
      this.armed = false; this.timer = 0; this.blinkT = 0; this.stuck = null; this.flightT = 0; this.cookHits = 0;
      this.maxHp = Infinity; this.hp = Infinity;
    }
    arm() {
      if (this.armed || this.removed) return;
      this.armed = true;
      this.timer = this.cfg.trigger === 'proximity' ? 1.5 : this.cfg.fuse;
      this.flightT = 0;
      GP.Audio.play('beepArm', { x: this.body.x, y: this.body.y, f: 1200 });
      if (this.cfg.trigger === 'rocket') GP.Audio.play('rocket', { x: this.body.x, y: this.body.y });
      this.body.wake();
    }
    disarm() { this.armed = false; }
    use() { if (this.armed && this.cfg.trigger === 'remote') this.detonate(); else this.arm(); return true; }
    detonate() {
      if (this.removed) return;
      const b = this.body;
      const x = b.x, y = b.y;
      const source = this.holder || this.thrower || this;
      if (this.holder) this.holder.unequip(this.slot);
      this.game.removeEntity(this);
      GP.Damage.explode(this.game, x, y, { radius: this.cfg.radius * this.scale, damage: this.cfg.damage, power: this.cfg.power, kind: this.cfg.kind, source });
    }
    onDetach(c) { this.thrower = c; }
    damage(info) {
      if (info.type === 'blaster' || info.type === 'explosive' || info.type === 'fire' || info.type === 'cut') {
        this.cookHits += info.amount;
        if (this.cookHits > (this.def.cookOff || 18)) {
          if (info.type === 'explosive') { this.cfg.trigger = 'timer'; this.armed = true; this.timer = M.rand(0.05, 0.2); }
          else this.detonate();
        }
      }
      return info.amount;
    }
    onImpact(body, dv, c, other) {
      if (!this.armed) return;
      if (this.cfg.trigger === 'impact' && dv > 3.5) { this.detonate(); return; }
      if (this.cfg.trigger === 'rocket' && this.flightT > 0.12 && dv > 1.5) { this.detonate(); return; }
      if (this.cfg.sticky && !this.stuck && other && !this.holder) {
        const p = c.pts[0];
        const j = new Phys.WeldJoint(other.type === Phys.STATIC ? this.game.world.ground : other, this.body, p.x, p.y, { breakForce: 8000, tag: 'stick' });
        this.game.world.addJoint(j);
        this.stuck = j;
        j.onBreak = () => { this.stuck = null; };
        GP.Audio.play('impact', { x: p.x, y: p.y, strength: 0.4, mat: 'metal' });
      }
    }
    update(dt) {
      super.update(dt);
      if (!this.armed) return;
      const b = this.body;
      const trig = this.cfg.trigger;
      if (trig === 'timer' || (trig === 'proximity' && this.timer > 0)) {
        this.timer -= dt;
        this.blinkT -= dt;
        const rate = trig === 'timer' ? M.clamp(this.timer / this.cfg.fuse, 0.08, 1) * 0.6 : 0.4;
        if (this.blinkT <= 0) {
          this.blinkT = rate;
          this.blinkOn = 0.08;
          GP.Audio.play('beepArm', { x: b.x, y: b.y, f: trig === 'timer' ? 1500 + (1 - this.timer / this.cfg.fuse) * 900 : 900, vol: 0.2 });
        }
        if (trig === 'timer' && this.timer <= 0) { this.detonate(); return; }
      } else if (trig === 'proximity') {
        this.blinkT -= dt;
        if (this.blinkT <= 0) { this.blinkT = 1.2; this.blinkOn = 0.1; }
        const r = this.cfg.sense;
        for (const e of this.game.entities) {
          if (!(e.isCharacterLike || e.isVehicle) || e.removed || e.state === 'dead') continue;
          if (e === this.thrower) continue;
          const p = e.position();
          if (Math.hypot(p.x - b.x, p.y - b.y) < r + 0.3) { GP.Audio.play('beepArm', { x: b.x, y: b.y, f: 2400 }); this.timer = 0; this.cfg.trigger = 'timer'; this.timer = 0.25; this.cfg.fuse = 0.25; break; }
        }
      } else if (trig === 'rocket') {
        this.flightT += dt;
        if (this.holder) this.holder.unequip(this.slot);
        const f = this.forward();
        const thrust = this.cfg.thrust * b.m;
        b.applyForce(f.x * thrust, f.y * thrust - b.m * this.game.world.gravityY * b.gravityScale * 0.9);
        if (this.cfg.homing && this.flightT > 0.25) {
          const tgt = this.findTarget();
          if (tgt) {
            const p = tgt.position();
            const want = Math.atan2(p.y - b.y, p.x - b.x);
            const err = M.wrapAngle(want - b.a);
            b.w = M.clamp(err * 6, -5, 5);
          }
        } else b.w *= 0.9;
        const n = this.pointWorld(-(this.def.length || 0.4) / 2, 0);
        GP.FX.fire(n.x, n.y, 2, 0.1, 0);
        if (Math.random() < 0.8) GP.FX.smoke(n.x, n.y, 1, 0.12, '#999', 0, 0.2, 1.6);
        GP.FX.frameLight(n.x, n.y, 2.5, '#ff9a40', 0.8);
        if (this.flightT > 7) this.detonate();
      }
      if (this.blinkOn > 0) this.blinkOn -= dt;
    }
    findTarget() {
      let best = null, bd = 60;
      const b = this.body;
      const team = this.thrower ? this.thrower.team : this.team;
      for (const e of this.game.entities) {
        if (!(e.isVehicle || e.isCharacterLike) || e.removed || e.state === 'dead' || e === this.thrower) continue;
        if (team !== 'neutral' && !GP.Teams.hostile(team, e.team)) continue;
        const p = e.position();
        const d = Math.hypot(p.x - b.x, p.y - b.y);
        const f = this.forward();
        const dot = ((p.x - b.x) * f.x + (p.y - b.y) * f.y) / (d || 1);
        if (dot > 0.2 && d < bd) { bd = d; best = e; }
      }
      return best;
    }
    drawGlow(ctx) {
      if (this.hidden) return;
      const L = this.def.light;
      if (!L) return;
      const on = this.armed ? this.blinkOn > 0 || this.cfg.trigger === 'remote' : false;
      const p = this.pointWorld(L[0], L[1]);
      GP.Draw.glow(ctx, p.x, p.y, on ? 0.22 : 0.08, on ? (L[2] || '#ff3020') : '#553030', on ? 1 : 0.6);
    }
    getProperties() {
      const c = this.cfg;
      const l = super.getProperties().filter((p) => p.key !== 'hp' && p.key !== 'repair');
      l.unshift(
        { key: 'arm', label: this.armed ? 'Armed' : 'Arm', type: 'button', action: () => this.arm() },
        { key: 'boom', label: 'Detonate now', type: 'button', action: () => this.detonate() },
        { key: 'trigger', label: 'Trigger', type: 'select', options: [['timer', 'Timer'], ['impact', 'Impact'], ['remote', 'Remote'], ['proximity', 'Proximity'], ['rocket', 'Rocket thruster']], get: () => c.trigger, set: (v) => { c.trigger = v; } },
        { key: 'fuse', label: 'Fuse time', type: 'range', min: 0.2, max: 15, step: 0.1, get: () => c.fuse, set: (v) => { c.fuse = v; } },
        { key: 'radius', label: 'Blast radius', type: 'range', min: 0.5, max: 20, step: 0.1, get: () => c.radius, set: (v) => { c.radius = v; } },
        { key: 'dmg', label: 'Blast damage', type: 'range', min: 0, max: 800, step: 5, get: () => c.damage, set: (v) => { c.damage = v; } },
        { key: 'power', label: 'Blast force', type: 'range', min: 0, max: 80, step: 1, get: () => c.power, set: (v) => { c.power = v; } },
        { key: 'sticky', label: 'Sticky', type: 'bool', get: () => c.sticky, set: (v) => { c.sticky = v; } },
      );
      return l;
    }
    saveState() { return { flipY: this.flipY, cfg: this.cfg, armed: this.armed, timer: this.timer }; }
    loadState(s) { if (!s) return; Object.assign(this.cfg, s.cfg || {}); this.armed = !!s.armed; this.timer = s.timer || 0; }
  }
  GP.Registry.registerKind('explosive', Explosive);
  GP.Explosive = Explosive;

  GP.Remote = {
    detonateAll(game) {
      let n = 0;
      for (const e of game.entities.slice()) if (e.isExplosive && e.armed && e.cfg.trigger === 'remote') { e.detonate(); n++; }
      return n;
    },
  };
})();
