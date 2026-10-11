import * as THREE from 'three';
import { rand, pick, yawTo, dampAngle } from './util.js';

const PALETTE = {
  CivRobe: ['#5a6f8a', '#7a3b2e', '#4d5e3a', '#6a5a7e', '#8a7a5a', '#2f3e52', '#7e6450'],
  CivTunic: ['#8a6a4a', '#b5a58a', '#5e6a72', '#9a4a3a', '#6f7f5a', '#c2b9a8'],
  CivHood: ['#6b5a48', '#3d3a36', '#7a6f62', '#4a5560', '#5e4a3c'],
  CivSash: ['#a8432f', '#c9a227', '#2f7a8a', '#7a2f6a', '#3a7a3f'],
  CivSkin: ['#c99a78', '#8d5e3f', '#e0b896', '#a87454', '#6e4a33', '#9fb7a0', '#7f9ab5'],
};
const PANIC_LINES = ['Droids! Run!', 'Get inside!', "They're shooting!", 'Clones! Help us!', 'Run!'];
const _v = new THREE.Vector3();

/** Lower-level citizens: they stroll and window-shop until the fighting starts, then flee for the exits. */
export class Civilians {
  constructor(G, street) {
    this.G = G;
    this.street = street;
    this.list = [];
    this.active = false;
    this.target = 16;
    this.calmT = 0;
    this.lineCD = 0;
  }

  dress(c) {
    for (const m of c.materials) {
      const pal = PALETTE[m.name];
      if (pal && m.color) m.color.set(pick(pal));
    }
  }

  spawnOne(atExit = false) {
    const path = pick(this.street.paths);
    const char = this.G.pool.get('civilian');
    this.dress(char);
    const i = Math.floor(Math.random() * path.length);
    const c = { char, path, i: (i + 1) % path.length, state: 'walk', speed: rand(1.1, 1.6), wait: 0, panicT: 0, exit: null };
    if (atExit) {
      // wander back in through a door once things are quiet
      char.position.copy(pick(this.street.exits));
      c.i = path.indexOf(path.reduce((m, p) => (p.distanceTo(char.position) < m.distanceTo(char.position) ? p : m)));
    } else {
      char.position.copy(path[i]).lerp(path[(i + 1) % path.length], Math.random());
    }
    char.play('Walk', 0, { timeScale: c.speed / 1.3 });
    this.list.push(c);
  }

  start() {
    this.active = true;
    while (this.list.length < this.target) this.spawnOne();
  }

  /** Something loud happened at `pos`: everyone nearby bolts. */
  scare(pos, radius = 24) {
    for (const c of this.list) if (c.state !== 'flee' && c.char.position.distanceTo(pos) < radius) this.flee(c);
  }

  flee(c) {
    c.state = 'flee';
    c.speed = rand(4.2, 5.4);
    const p = c.char.position;
    c.exit = this.street.exits.reduce((m, e) => (e.distanceTo(p) < m.distanceTo(p) ? e : m));
    c.char.play('Run', 0.15, { timeScale: rand(0.95, 1.15) });
  }

  update(dt) {
    if (!this.active) return;
    const G = this.G;
    // danger: droids close by
    let calm = true;
    for (const e of G.enemies.list) {
      if (!e.alive || e.pos.y < this.street.arena.y - 5 || e.pos.y > this.street.arena.y + 30) continue;
      calm = false;
      for (const c of this.list) if (c.state !== 'flee' && c.char.position.distanceTo(e.pos) < 18) this.flee(c);
    }
    this.calmT = calm ? this.calmT + dt : 0;
    this.lineCD -= dt;
    for (let k = this.list.length - 1; k >= 0; k--) {
      const c = this.list[k], ch = c.char, p = ch.position;
      let goal = null;
      if (c.state === 'flee') goal = c.exit;
      else if (c.wait > 0) {
        c.wait -= dt;
        ch.play('Idle', 0.3);
        if (c.wait <= 0) ch.play('Walk', 0.3, { timeScale: c.speed / 1.3 });
      } else goal = c.path[c.i];
      if (goal) {
        _v.subVectors(goal, p); _v.y = 0;
        const d = _v.length();
        if (d < 0.4) {
          if (c.state === 'flee') { G.pool.release(ch); this.list.splice(k, 1); continue; }
          c.i = (c.i + 1) % c.path.length;
          if (Math.random() < 0.3) c.wait = rand(2, 6);
        } else {
          p.addScaledVector(_v, Math.min(d, c.speed * dt) / d);
          ch.yaw = dampAngle(ch.yaw, yawTo(_v.x, _v.z), 8, dt);
        }
      }
      p.y = this.street.arena.y;
      ch.update(dt);
      if (c.state === 'flee' && this.lineCD <= 0 && Math.random() < 0.01) {
        this.lineCD = rand(5, 9);
        G.speakWorld(pick(PANIC_LINES), p, { pitch: rand(1.1, 1.5), rate: 1.25, volume: 0.6 });
      }
    }
    // a few wander back in once the street has been quiet for a while
    if (this.calmT > 4 && this.list.length < this.target && Math.random() < dt * 0.8) this.spawnOne(true);
  }

  clear() {
    for (const c of this.list) this.G.pool.release(c.char);
    this.list.length = 0;
    this.active = false;
  }
}
