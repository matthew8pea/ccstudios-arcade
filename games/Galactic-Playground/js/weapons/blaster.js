/* GALACTIC PLAYGROUND — modular blasters.
 * Every blaster is configured by a stats block:
 *   damage, rate (shots/s), speed (bolt m/s), size (bolt width), len (bolt length), recoil (N·s),
 *   mag, reload (s), spread (radians), color, auto (hold to fire), bolt ('blaster'|'ion'|'stun'|'slug'),
 *   spinUp (rotary), pellets (spread shot), explosive ({radius,damage,power}) for launchers.
 * Stats are copied per instance so the property tool can tune individual weapons.
 */
'use strict';

(() => {
  const M = GP.M;

  class Blaster extends GP.Item {
    constructor(game, def, opts) {
      super(game, def, opts);
      this.isBlaster = true;
      this.stats = Object.assign({ damage: 20, rate: 4, speed: 55, size: 0.05, len: 0.7, recoil: 3, mag: 30, reload: 1.6, spread: 0.03, color: '#ff3030', auto: true, bolt: 'blaster', pitch: 1 }, def.stats || {});
      this.ammo = this.stats.mag;
      this.reloadT = 0; this.cd = 0; this.firing = false; this.wasFiring = false;
      this.sentry = false; this.spin = 0; this.burstLeft = 0;
    }
    trigger(on) { this.firing = on; }
    startReload() {
      if (this.reloadT > 0 || this.ammo >= this.stats.mag || this.stats.mag >= 9999) return;
      this.reloadT = this.stats.reload;
      GP.Audio.play('reload', { x: this.body.x, y: this.body.y });
    }
    update(dt) {
      super.update(dt);
      if (this.cd > 0) this.cd -= dt;
      if (this.reloadT > 0) { this.reloadT -= dt; if (this.reloadT <= 0) this.ammo = this.stats.mag; }
      let want = (this.firing && this.holder) || (this.sentry && !this.holder && !this.hidden);
      const player = this.holder && this.holder.playerControlled;
      if (want && player && !this.stats.auto && this.wasFiring) want = false;
      this.wasFiring = this.firing && this.holder;
      if (this.stats.spinUp) {
        this.spin = M.approach(this.spin, want ? 1 : 0, dt / (want ? this.stats.spinUp : 0.8));
        if (this.spin > 0.05 && Math.random() < dt * 10) GP.Audio.play('servo', { x: this.body.x, y: this.body.y, vol: 0.1 });
      }
      if (this.burstLeft > 0 && this.cd <= 0) { this.fire(); this.burstLeft--; this.cd = 1 / (this.stats.rate * 2.5); return; }
      if (!want || this.cd > 0 || this.reloadT > 0) return;
      if (this.stats.spinUp && this.spin < 0.35) return;
      if (this.ammo <= 0) { GP.Audio.play('empty', { x: this.body.x, y: this.body.y }); this.startReload(); this.cd = 0.3; return; }
      this.fire();
      const rate = this.stats.rate * (this.stats.spinUp ? this.spin : 1);
      this.cd = 1 / Math.max(0.2, rate);
      if (this.stats.burst) { this.burstLeft = this.stats.burst - 1; this.cd = 1 / this.stats.rate; }
    }
    muzzle() { const m = this.def.muzzle || [0.3, 0]; return this.pointWorld(m[0], m[1]); }
    fire() {
      const st = this.stats;
      const b = this.body;
      const m = this.muzzle();
      const f = this.forward();
      const holder = this.holder;
      const skill = holder ? holder.stats.skill : 0.5;
      const spreadMul = holder && !holder.playerControlled ? (1.6 - skill) : 1;
      const pellets = st.pellets || 1;
      for (let i = 0; i < pellets; i++) {
        const a = Math.atan2(f.y, f.x) + M.rand(-1, 1) * st.spread * spreadMul + (pellets > 1 ? (i - (pellets - 1) / 2) * st.spread : 0);
        const dx = Math.cos(a), dy = Math.sin(a);
        GP.Projectiles.fire(this.game, {
          x: m.x, y: m.y, vx: dx * st.speed + b.vx * 0.3, vy: dy * st.speed + b.vy * 0.3,
          color: st.color, width: st.size, len: st.len, damage: st.damage, type: st.bolt,
          owner: holder || this, shooter: holder || this, team: holder ? holder.team : this.team,
          ignore: [holder, this, holder && holder.vehicle], impulse: st.impulse != null ? st.impulse : st.damage * 0.12,
          explosive: st.explosive || null, gravity: st.gravity || 0, life: st.life || 2.5,
        });
      }
      b.applyImpulse(-f.x * st.recoil, -f.y * st.recoil, m.x, m.y);
      if (holder && st.recoil > 6) holder.parts.torso.applyImpulse(-f.x * st.recoil * 0.4, -f.y * st.recoil * 0.4);
      GP.FX.muzzleFlash(m.x, m.y, f.x, f.y, st.explosive ? '#ffb040' : st.color);
      if (st.explosive) { GP.FX.smoke(m.x - f.x * 0.5, m.y - f.y * 0.5, 4, 0.25, '#888', -0.2); GP.Audio.play('rocket', { x: m.x, y: m.y }); }
      else GP.Audio.play('blaster', { x: m.x, y: m.y, pitch: st.pitch, heavy: st.damage > 45, long: st.speed > 90, vol: holder && holder.playerControlled ? 0.55 : 0.4 });
      if (st.mag < 9999) this.ammo--;
      GP.Events.emit('blaster:fired', { e: this, holder });
    }
    use() { this.fire(); return true; }
    getProperties() {
      const s = this.stats;
      const l = super.getProperties().filter((p) => p.key !== 'hp' && p.key !== 'repair');
      const num = (key, label, min, max, step) => ({ key, label, type: 'range', min, max, step, get: () => s[key], set: (v) => { s[key] = v; if (key === 'mag') this.ammo = Math.min(this.ammo, v); } });
      l.unshift(
        { key: 'sentry', label: 'Sentry mode (fires on its own)', type: 'bool', get: () => this.sentry, set: (v) => { this.sentry = v; } },
        { key: 'fire', label: 'Fire once', type: 'button', action: () => this.fire() },
        num('damage', 'Damage', 1, 200, 1),
        num('rate', 'Fire rate (shots/s)', 0.3, 25, 0.1),
        num('speed', 'Bolt speed', 10, 200, 1),
        num('size', 'Bolt size', 0.02, 0.3, 0.01),
        num('recoil', 'Recoil', 0, 60, 0.5),
        num('mag', 'Magazine size', 1, 400, 1),
        num('reload', 'Reload time', 0.1, 8, 0.1),
        num('spread', 'Inaccuracy', 0, 0.5, 0.005),
        { key: 'auto', label: 'Automatic', type: 'bool', get: () => s.auto, set: (v) => { s.auto = v; } },
        { key: 'color', label: 'Bolt color', type: 'swatch', options: [['red', '#ff3030'], ['blue', '#3a8bff'], ['green', '#35e04a'], ['orange', '#ff8a1c'], ['purple', '#b34dff'], ['white', '#f0f4ff']], get: () => s.color, set: (v) => { s.color = v; } },
        { key: 'ammo', label: 'Ammo', type: 'meter', get: () => this.ammo / s.mag },
      );
      return l;
    }
    saveState() { return { flipY: this.flipY, stats: this.stats, ammo: this.ammo, sentry: this.sentry }; }
    loadState(st) { if (!st) return; if (st.stats) Object.assign(this.stats, st.stats); if (st.ammo != null) this.ammo = st.ammo; this.sentry = !!st.sentry; }
  }
  GP.Registry.registerKind('blaster', Blaster);
  GP.Blaster = Blaster;
})();
