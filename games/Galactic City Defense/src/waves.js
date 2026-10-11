import { rand, pick } from './util.js';

const WAVE_TAGLINES = [
  'Separatist landing parties on the bridges',
  'Super battle droids pushing up the turbolifts',
  'Commando droids dropping from the skylanes',
  'Rocket troopers circling the tower',
  'They mean to bring the tower down',
  'The whole Separatist army is coming',
];

const DESERT_TAGLINES = [
  'Jawas are pouring out of the sandcrawler',
  'Sand People in the rocks',
  'Tusken snipers on the ridges',
  'A war party from the Tusken camp',
  'Jawas and Tuskens, fighting side by side',
  'They are coming over every dune',
  'Something darker is out in the wastes',
  'Count Dooku',
];

// Act IV, Order 66: the Council chamber (waves 1-5), the great hall (6), the processional way outside (7-8)
const ORDER66_TAGLINES = [
  'Clones storm the Council chamber',
  'They know Master Yoda is here',
  'The Coruscant Guard comes up the lifts',
  'The 212th has the order too',
  'Every clone in the Temple wants him',
  'Fight down through the great hall',
  'Out onto the processional way',
  'One last push to the gunship',
];

/** Clearing this wave ends the battle (extraction cutscene + victory), unless playing on in endless mode. */
export const FINAL_WAVE = 8;
/** Tatooine: Count Dooku joins the fight in the last two waves (withdrawing from the first, beaten in the second). */
export const DOOKU_WAVE = 7;

/** When (share of the wave destroyed) a dropship brings in part of each wave. Wave 5 has the fall instead. */
const DROPSHIPS = { 2: [0], 3: [0.5], 4: [0], 6: [0, 0.5], 7: [0, 0.55], 8: [0, 0.45] };

/** Spawns endless, escalating waves of droids (and the occasional rebel clone). */
export class WaveDirector {
  constructor(G) {
    this.G = G;
    this.wave = 0;
    this.state = 'idle';
    this.timer = 0;
    this.queue = [];
    this.spawnT = 0;
  }

  start(delay = 2) {
    this.wave = 0;
    this.queue = [];
    this.checkpoint = null;
    this.resumeQueue = null;
    this.state = 'inter';
    this.timer = delay;
  }

  /** Tatooine: Jawas and Tusken Raiders only (snipers capped, warriors growing with each wave). */
  desertComposition(n) {
    const total = Math.min(10 + n * 3, 42);
    const snipers = Math.min(5, n >= 2 ? 1 + Math.floor(n / 2) : 0);
    const q = [];
    for (let i = 0; i < snipers; i++) q.push('tusken_sniper');
    while (q.length < total) q.push(Math.random() < Math.min(0.5, 0.18 + n * 0.045) ? 'tusken_melee' : 'jawa');
    for (let i = q.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [q[i], q[j]] = [q[j], q[i]]; }
    // every wave opens with Jawas scurrying out of the sandcrawler
    q.unshift('jawa', 'jawa', 'jawa');
    return q;
  }

  /** Act IV: clones of every unit (the 212th, the Coruscant Guard, the 41st), more of the veterans as it goes on. */
  order66Composition(n) {
    const total = Math.min(8 + n * 3, 40);
    const q = [];
    for (let i = 0; i < total; i++) {
      const r = Math.random();
      q.push(r < 0.38 ? 'clone_212' : r < 0.72 ? 'clone_guard' : 'clone_41st');
    }
    return q;
  }

  composition(n) {
    if (this.G.act === 4) return this.order66Composition(n);
    if (this.G.arena && this.G.arena.planet) return this.desertComposition(n);
    const total = Math.min(9 + n * 4, 70);
    const maxRebels = n >= 2 ? 1 + Math.floor(n / 3) : 0;
    let rebels = 0;
    const q = [];
    for (let i = 0; i < total; i++) {
      let t;
      if (n === 1) {
        const r = Math.random();
        t = r < 0.78 ? 'b1' : r < 0.92 ? 'b2' : 'b2_rocket';
      } else {
        const w = [
          ['b1', 0.5], ['b2', 0.13 + 0.01 * n], ['b2_rocket', 0.12],
          ['commando', n >= 3 ? 0.13 : 0.05], ['rebel_clone', 0.06],
        ];
        let sum = 0;
        for (const [, x] of w) sum += x;
        let r = Math.random() * sum;
        t = 'b1';
        for (const [k, x] of w) { if ((r -= x) <= 0) { t = k; break; } }
        if (t === 'rebel_clone') {
          if (rebels >= maxRebels) t = 'b1';
          else rebels++;
        }
      }
      q.push(t);
    }
    if (n >= 2 && rebels === 0 && Math.random() < 0.6) q[Math.floor(Math.random() * q.length)] = 'rebel_clone';
    if (n === 1) q.push('b2_rocket');
    // inside the Temple: the turncoat clones the younglings have been fighting, and no rocket troopers
    if (this.G.arena && this.G.arena.indoor) for (let i = 0; i < q.length; i++) {
      if (q[i] === 'b2_rocket') q[i] = 'b1';
      if (q[i] === 'b1' && Math.random() < 0.4) q[i] = 'rebel_clone';
    }
    // shuffle, but keep a couple of B1 squads up front so each wave opens with a march
    for (let i = q.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [q[i], q[j]] = [q[j], q[i]]; }
    q.unshift('b1', 'b1');
    return q;
  }

  begin() {
    const G = this.G;
    this.dookuDone = false;
    if (this.resumeQueue) {
      // respawned at a checkpoint: replay this wave from its start (or from its halfway point)
      this.queue = this.resumeQueue;
      this.resumeQueue = null;
      this.killsThisWave = 0;
      this.startedAt = G.time;
      this.state = 'active';
      this.spawnT = 0.3;
      this.lastBanner = [`WAVE ${this.wave}`, this.resumeLabel];
      this.planDropships();
      if (G.objectives) G.objectives.onWave(this.wave);
      G.hud.banner(`WAVE ${this.wave}`, this.resumeLabel);
      return;
    }
    this.wave++;
    G.stats.wave = this.wave;
    this.dookuDone = false;
    this.queue = this.composition(this.wave);
    this.total = this.queue.length;
    this.startedAt = G.time;
    this.killsThisWave = 0;
    this.saveCheckpoint();
    this.state = 'active';
    this.spawnT = 0.3;
    this.planDropships();
    if (G.objectives) G.objectives.onWave(this.wave);
    const lines = G.act === 4 ? ORDER66_TAGLINES : G.arena.planet ? DESERT_TAGLINES : WAVE_TAGLINES;
    const tag = G.endless && G.act === 4 ? 'The order still stands' : G.arena.planet && G.endless ? 'The wastes are never quiet' : lines[Math.min(this.wave - 1, lines.length - 1)];
    this.lastBanner = [`WAVE ${this.wave}`, tag];
    G.hud.banner(`WAVE ${this.wave}`, tag);
    G.sound.tone([220, 330, 440], 0.35, 'sawtooth', 0.08, 0.12);
  }

  planDropships() {
    const n = this.wave;
    const plan = this.G.arena.indoor || this.G.arena.planet || this.G.act === 4 ? [] : DROPSHIPS[n] || (n > FINAL_WAVE ? (n % 2 ? [0.3] : [0, 0.6]) : []);
    const done = this.progress();
    this.dropPlan = plan.filter((p) => p === 0 ? done < 0.05 : p > done);
  }

  /** Hand part of the queue (B1s and B2s) to a dropship. */
  sendDropship() {
    const G = this.G;
    this.dropPlan.shift();
    const want = Math.min(6, 3 + Math.floor(this.wave / 3));
    const cargo = [];
    for (let i = 0; i < this.queue.length && cargo.length < want; i++) {
      if (this.queue[i] === 'b1' || this.queue[i] === 'b2') { cargo.push(this.queue[i]); this.queue.splice(i--, 1); }
    }
    if (cargo.length && !G.skywar.dropship.call(cargo)) this.queue.unshift(...cargo);
  }

  pickSource(type) {
    const G = this.G, sp = G.arena.spawns, p = G.player;
    const far = (pos, min) => !p || Math.hypot(pos.x - p.pos.x, pos.z - p.pos.z) > min;
    if (G.arena.planet) {
      // Tatooine: snipers climb the rock pillars, Jawas come down the sandcrawler's ramp, warriors out of the canyons
      if (type === 'tusken_sniper') {
        const free = sp.perches.filter((pr) => !pr.taken && far(pr.pos, 18));
        if (free.length) return { mode: 'perch', opts: { perch: pick(free) } };
      }
      if (type === 'jawa' && Math.random() < 0.6 && far(sp.sandcrawler.pos, 10)) return { mode: 'door', opts: { door: sp.sandcrawler } };
      const gates = sp.gates.filter((g) => far(g.pos, 14) && (type === 'jawa' || g.tusken || Math.random() < 0.35));
      return { mode: 'gate', opts: { gate: pick(gates.length ? gates : sp.gates) } };
    }
    if (type === 'b2_rocket') return { mode: 'rise', opts: { at: sp.edge() } };
    if (type === 'commando' && Math.random() < 0.65) {
      for (let i = 0; i < 8; i++) {
        const at = sp.drop();
        if (far(at, 13)) return { mode: 'drop', opts: { at } };
      }
    }
    if (Math.random() < 0.55) {
      const gates = sp.gates.filter((g) => far(g.pos, 12));
      if (gates.length) return { mode: 'gate', opts: { gate: pick(gates) } };
    }
    const doors = sp.doors.filter((d) => far(d.pos, 11) && d.timer <= 0);
    if (doors.length) return { mode: 'door', opts: { door: pick(doors) } };
    return { mode: 'gate', opts: { gate: pick(sp.gates) } };
  }

  update(dt) {
    const G = this.G;
    if (this.state === 'inter') {
      this.timer -= dt;
      if (this.timer <= 0) this.begin();
      return;
    }
    if (this.state !== 'active') return;
    this.spawnT -= dt;
    if (this.dropPlan && this.dropPlan.length && G.time - this.startedAt > 3 && this.progress() >= this.dropPlan[0] && G.skywar.dropship.idle()) this.sendDropship();
    const alive = G.enemies.aliveCount();
    const maxAlive = G.arena.maxAlive ? G.arena.maxAlive(this.wave) : G.arena.planet ? Math.min(6 + this.wave * 2, 16) : Math.min(7 + this.wave * 2, 20);
    // Count Dooku: arrives part-way into wave 7, and at the start of wave 8
    if (G.arena.planet && !G.endless && this.wave >= DOOKU_WAVE && !this.dookuDone && G.onDookuArrives
      && (this.wave > DOOKU_WAVE ? G.time - this.startedAt > 4 : this.progress() >= 0.28)) {
      this.dookuDone = true;
      G.onDookuArrives(this.wave);
    }
    if (this.queue.length && alive < maxAlive && this.spawnT <= 0) {
      const type = this.queue.shift();
      const src = this.pickSource(type);
      G.enemies.spawn(type, src.mode, src.opts);
      // B1s often arrive as a squad through the same gate (Jawas in a pack)
      if (src.mode === 'gate' && (type === 'b1' || type === 'jawa')) {
        let extra = Math.floor(rand(0, 2.6));
        let k = 1;
        while (extra-- > 0 && this.queue[0] === type) {
          this.queue.shift();
          G.enemies.spawn(type, 'gate', { gate: src.opts.gate, offset: (k % 2 ? 1 : -1) * 1.6, back: 1.4 * k });
          k++;
        }
      }
      this.spawnT = rand(0.9, 2.0) * Math.max(0.45, 1 - this.wave * 0.05);
    }
    // halfway through the wave: a second checkpoint snapshot
    if (this.checkpoint && !this.checkpoint.next && !this.checkpoint.half && this.progress() >= 0.5) {
      const p = G.player;
      this.checkpoint.half = { stats: { ...G.stats }, special: p ? p.special : 0, grenades: p ? p.grenades : 0 };
    }
    if (!this.queue.length && alive === 0 && !G.skywar.dropship.pending() && !(G.objectives && G.objectives.blocking())) {
      if (G.objectives) G.objectives.complete();
      // Act II: the plaza is held after wave 5, and the fight moves inside the Temple
      if (G.act === 2 && this.wave === 5 && G.onTempleApproachCleared) {
        if (G.objectives) G.objectives.complete();
        this.state = 'done';
        G.onTempleApproachCleared();
        return;
      }
      // Act IV: out of the Council chamber after wave 5, out of the Temple after wave 6
      if (G.act === 4 && !G.endless && (this.wave === 5 || this.wave === 6) && G.onAct4Stage) {
        this.state = 'done';
        G.onAct4Stage(this.wave);
        return;
      }
      if (this.wave >= FINAL_WAVE && !G.endless && G.onFinalWaveCleared) {
        this.state = 'done';
        G.onFinalWaveCleared();
        return;
      }
      const bonus = 400 * this.wave;
      G.stats.score += bonus;
      G.hud.bp('SECTOR SECURED', bonus, 'gold');
      if (G.addTickets) G.addTickets(4);
      G.sound.sting('win');
      G.hud.banner(`WAVE ${this.wave} CLEARED`, `+${bonus} sector bonus`);
      if (G.player) G.player.hp = Math.min(G.player.maxHp, G.player.hp + 40);
      G.speak(this.wave % 2 ? 'Sector clear. Regroup, more incoming.' : "That's the last of them. For now.", G.ally ? G.ally.key : 'cody', { interrupt: false });
      this.state = 'inter';
      this.timer = 8;
      // dying between waves puts you at the start of the next one
      this.saveCheckpoint(true);
    }
  }

  /** Every wave is a checkpoint: what it starts with (plus a snapshot once it is half done). */
  saveCheckpoint(next = false) {
    const G = this.G, p = G.player;
    this.checkpoint = {
      wave: next ? this.wave + 1 : this.wave, next, queue0: next ? null : [...this.queue], total: next ? 0 : this.total,
      stats: { ...G.stats }, special: p ? p.special : 35, grenades: p ? p.grenades : 3,
      arena: G.arena.name, fellDown: !!G.fellDown, half: null, act: G.act || 1, hero: G.selected,
    };
  }

  /** Progress through the current wave, 0..1 (share of its droids destroyed). */
  progress() { return this.state === 'active' && this.total ? 1 - this.remaining() / this.total : 0; }

  /** Set up to replay the checkpointed wave: from its start, or from its halfway point if you got that far. */
  restore(cp) {
    this.queue = [];
    this.state = 'inter';
    this.timer = 3;
    if (cp.next) { this.wave = cp.wave - 1; this.resumeQueue = null; this.checkpoint = cp; return false; }
    const half = !!cp.half;
    this.wave = cp.wave;
    this.total = cp.total;
    this.resumeQueue = half ? cp.queue0.slice(Math.floor(cp.total / 2)) : [...cp.queue0];
    this.resumeLabel = half ? 'Checkpoint · halfway through the wave' : 'Checkpoint · start of the wave';
    this.checkpoint = cp;
    return half;
  }

  remaining() { return this.queue.length + this.G.enemies.aliveCount() + this.G.skywar.dropship.pending(); }
}
