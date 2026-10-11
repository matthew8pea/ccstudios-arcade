/* ==========================================================================
   game.js — game state, simulation loop, waves, rendering, save/load
   ========================================================================== */
'use strict';

const canvas = $('board');
const ctx = canvas.getContext('2d');
const bgCanvas = document.createElement('canvas');
bgCanvas.width = BOARD_W;
bgCanvas.height = BOARD_H;

const G = {
  state: 'MENU',          // MENU | PLAYING | PAUSED | OVER | WON
  map: null,
  diff: null,
  lanes: [],
  enemies: [], towers: [], projectiles: [], effects: [], particles: [], texts: [],
  spawnQueue: [],
  time: 0,
  waveTime: 0,
  credits: 0, lives: 0, maxLives: 0,
  wave: 0,
  score: 0,
  waveActive: false,
  buildPhase: 0,
  endless: false,
  speed: 1,
  autoWaves: false,
  autoTimer: 0,
  livesAtWaveStart: 0,
  placing: null,          // tower def being placed
  selectedTower: null,
  targeting: null,        // ability id awaiting a click
  mouse: { x: -100, y: -100, inside: false },
  shake: 0, hurtFlash: 0,
  freezeTimer: 0, freezeBossCutoff: 1.5,
  overclockTimer: 0,
  cooldowns: {},
  protocolsThisWave: new Set(),
  checkpoint: null,
  stats: null,

  // -------------------------------------------------------------- setup
  newGame(mapId, diffId) {
    this.map = MAPS.find(m => m.id === mapId) || MAPS[0];
    this.diff = DIFFICULTIES[diffId] || DIFFICULTIES.normal;
    this.lanes = this.map.paths.map(buildLane);
    this.enemies = []; this.towers = []; this.projectiles = [];
    this.effects = []; this.particles = []; this.texts = [];
    this.spawnQueue = [];
    this.credits = this.diff.credits;
    this.lives = this.maxLives = this.diff.lives;
    this.wave = 0;
    this.score = 0;
    this.waveActive = false;
    this.buildPhase = 0;
    this.endless = false;
    this.autoTimer = 0;
    this.placing = null; this.selectedTower = null; this.targeting = null;
    this.shake = 0; this.hurtFlash = 0; this.freezeTimer = 0; this.overclockTimer = 0;
    this.cooldowns = { lance: 0, freeze: 0, overclock: 0 };
    this.protocolsThisWave = new Set();
    this.stats = { kills: 0, spent: 0, earned: 0, interest: 0, built: 0, bosses: 0, leaked: 0 };
    buildBackground();
    this.state = 'PLAYING';
    this.checkpoint = this.snapshot();
  },

  // -------------------------------------------------------------- queries
  fieldSlowAt(enemy) {
    let slow = 0;
    for (const t of this.towers) {
      if (t.def.id === 'stasis' && dist(t, enemy) <= t.range) slow = Math.max(slow, t.slowPower);
    }
    return enemy.boss ? slow * 0.5 : slow;
  },

  canPlace(x, y) {
    if (x < 14 || y < 14 || x > BOARD_W - 14 || y > BOARD_H - 14) return 'Out of bounds.';
    for (const lane of this.lanes) {
      for (const s of lane.segs) if (distToSegment({ x, y }, s.a, s.b) < PATH_BUFFER) return 'Too close to the lane.';
    }
    if (this.towers.some(t => dist(t, { x, y }) < TOWER_SPACING)) return 'Too close to another unit.';
    return null;
  },

  towerAt(x, y) {
    let best = null, bd = 20;
    for (const t of this.towers) {
      const d = dist(t, { x, y });
      if (d < bd) { bd = d; best = t; }
    }
    return best;
  },

  get canLaunch() {
    return this.state === 'PLAYING' && this.spawnQueue.length === 0 && (this.endless || this.wave < WAVES.length);
  },

  // -------------------------------------------------------------- actions
  placeTower(def, x, y) {
    const why = this.canPlace(x, y);
    if (why) { audio.play('error'); UI.toast(why, 'bad'); return false; }
    if (this.credits < def.cost) { audio.play('error'); UI.toast('Not enough credits.', 'bad'); return false; }
    this.credits -= def.cost;
    this.stats.spent += def.cost;
    this.stats.built++;
    const t = new Tower(def, x, y);
    this.towers.push(t);
    spawnParticles(x, y, def.color, 14, 3, 90, 0.5);
    audio.play('build');
    UI.log(`${def.name} deployed. <span class="neg">-${def.cost}¢</span>`);
    if (this.stats.spent >= 3000) this.unlock('bigSpender');
    return true;
  },

  upgradeTower(t) {
    if (!t) return;
    if (t.maxed) { audio.play('error'); UI.toast('Already at max level.', 'bad'); return; }
    const cost = t.upgradeCost;
    if (this.credits < cost) { audio.play('error'); UI.toast('Not enough credits to upgrade.', 'bad'); return; }
    this.credits -= cost;
    this.stats.spent += cost;
    t.applyUpgrade();
    spawnParticles(t.x, t.y, '#ffc94d', 16, 3, 100, 0.6);
    audio.play('upgrade');
    UI.log(`${t.def.name} upgraded to Lv${t.level}. <span class="neg">-${cost}¢</span>`);
    if (t.level === MAX_LEVEL) this.unlock('engineer');
    if (this.stats.spent >= 3000) this.unlock('bigSpender');
  },

  sellTower(t) {
    if (!t) return;
    const value = t.sellValue;
    this.credits += value;
    this.towers = this.towers.filter(o => o !== t);
    if (this.selectedTower === t) this.selectedTower = null;
    spawnParticles(t.x, t.y, '#8fa3c0', 12, 3, 80, 0.5);
    audio.play('sell');
    UI.log(`${t.def.name} recalled. <span class="pos">+${value}¢</span>`);
  },

  cycleTarget(t) {
    if (!t || t.def.support || t.def.id === 'sage') return;
    t.targetMode = TARGET_MODES[(TARGET_MODES.indexOf(t.targetMode) + 1) % TARGET_MODES.length];
    audio.play('click');
  },

  useAbility(id, x, y) {
    const ab = ABILITIES[id];
    if (this.state !== 'PLAYING' || this.cooldowns[id] > 0) { audio.play('error'); return false; }
    if (ab.targeted && x === undefined) {
      this.targeting = this.targeting === id ? null : id;
      this.placing = null;
      audio.play('click');
      return false;
    }
    if (id === 'lance') {
      const dmg = (300 + this.wave * 60) * (this.endless ? 1.5 : 1);
      for (const e of this.enemies) {
        if (e.alive && Math.hypot(e.x - x, e.y - y) <= ab.radius) {
          e.phased = false;
          e.takeDamage(dmg, null, true);
        }
      }
      this.effects.push(new Effect('beam', x, y, { radius: ab.radius, color: '#ffc94d', life: 0.6 }));
      spawnParticles(x, y, '#ffe9b0', 30, 5, 220, 0.7);
      this.shake = 0.3;
      this.targeting = null;
    } else if (id === 'freeze') {
      this.freezeTimer = 2.5;
      for (const e of this.enemies) if (e.alive) spawnParticles(e.x, e.y, '#bff2ff', 4, 3, 50, 0.6);
    } else if (id === 'overclock') {
      this.overclockTimer = 8;
    }
    this.cooldowns[id] = ab.cooldown;
    audio.play('ability');
    UI.banner(ab.name, ab.color, true);
    if (this.waveActive) {
      this.protocolsThisWave.add(id);
      if (this.protocolsThisWave.size === 3) this.unlock('protocols');
    }
    return true;
  },

  startWave() {
    if (!this.canLaunch) return;
    // Launching while enemies are still on the field pays an early-call bonus.
    if (this.waveActive && this.enemies.some(e => e.alive)) {
      const bonus = 10 + this.wave * 2;
      this.credits += bonus;
      this.stats.earned += bonus;
      UI.toast(`Early launch bonus +${bonus}¢`, 'good');
    }
    if (!this.waveActive) {
      this.livesAtWaveStart = this.lives;
      this.protocolsThisWave = new Set();
    }
    this.wave++;
    this.buildPhase++;
    this.waveActive = true;
    this.autoTimer = 0;
    if (this.wave >= 25 && this.endless) this.unlock('voyager');

    const groups = getWave(this.wave);
    const queue = [];
    let laneCounter = 0;
    let hasBoss = false;
    for (const g of groups) {
      const def = ENEMIES[g.t];
      if (def.boss) hasBoss = true;
      for (let i = 0; i < g.n; i++) {
        queue.push({
          time: this.waveTime + (g.at || 0) + i * g.gap,
          type: g.t,
          stats: { hp: g.hp * this.diff.hp, sh: (g.sh || 0) * this.diff.hp, s: g.s, b: g.b * this.diff.bounty },
          lane: laneCounter++ % this.lanes.length
        });
      }
    }
    this.spawnQueue = this.spawnQueue.concat(queue).sort((a, b) => a.time - b.time);
    audio.play(hasBoss ? 'boss' : 'wave_start');
    UI.banner(hasBoss ? `Wave ${this.wave} · Boss incoming` : `Wave ${this.wave}`, hasBoss ? '#ff5d6c' : this.map.theme);
    UI.log(`<b>Wave ${this.wave}</b> inbound.`);
    UI.refreshWavePreview();
  },

  // -------------------------------------------------------------- events
  onEnemyKilled(e) {
    this.credits += e.bounty;
    this.stats.earned += e.bounty;
    this.stats.kills++;
    this.score += e.bounty * 10;
    Profile.data.totalKills++;
    this.texts.push(new FloatingText(`+${e.bounty}`, e.x, e.y - 6, '#ffc94d', e.boss ? 16 : 11));
    spawnParticles(e.x, e.y, e.def.color, e.boss ? 50 : 10, e.boss ? 6 : 4, e.boss ? 220 : 110, e.boss ? 1.1 : 0.6);
    audio.play(e.boss ? 'boss_die' : 'die');
    if (this.stats.kills === 1) this.unlock('firstBlood');
    if (Profile.data.totalKills >= 1000) this.unlock('swarmBreaker');
    if (e.boss) {
      this.stats.bosses++;
      this.shake = 0.5;
      this.unlock('giantSlayer');
      UI.log(`<b>${e.def.name}</b> destroyed! <span class="pos">+${e.bounty}¢</span>`);
    }
    if (e.type === 'brood') {
      for (let i = 0; i < 3; i++) {
        const child = new Enemy('skitter', { hp: e.maxHp * 0.3, s: 100, b: Math.ceil(e.bounty * 0.2) }, e.laneIdx, Math.max(0, e.travelled - i * 14));
        this.enemies.push(child);
      }
    }
  },

  onEnemyReached(e) {
    const cost = e.def.lifeCost;
    this.lives = Math.max(0, this.lives - cost);
    this.stats.leaked++;
    this.shake = Math.max(this.shake, 0.25);
    this.hurtFlash = 0.5;
    audio.play('life_lost');
    UI.log(`<span class="neg">${e.def.name} breached the core. -${cost} integrity.</span>`);
    if (this.lives <= 0) this.defeat();
  },

  onWaveCleared() {
    this.waveActive = false;
    const interest = Math.min(60, Math.floor(this.credits * 0.05));
    this.credits += interest;
    this.stats.interest += interest;
    this.stats.earned += interest;
    this.score += this.wave * 100 + this.lives * 10;
    audio.play('wave_clear');
    UI.log(`Wave ${this.wave} cleared. Interest <span class="pos">+${interest}¢</span>`);
    if (this.stats.interest >= 200) this.unlock('economist');
    if (this.wave >= 5 && this.lives === this.livesAtWaveStart) this.unlock('flawless');

    if (!this.endless && this.wave >= WAVES.length) { this.victory(); return; }

    UI.toast(`Wave ${this.wave} cleared${interest ? ` · +${interest}¢ interest` : ''}`, 'good');
    this.checkpoint = this.snapshot();
    Store.set(SAVE_KEY, this.checkpoint);
    if (this.autoWaves) this.autoTimer = 3;
    UI.refreshWavePreview();
  },

  victory() {
    this.state = 'WON';
    const won = !this.endless;
    const bonus = this.lives * 500 * (this.diff.id === 'hard' ? 2 : this.diff.id === 'normal' ? 1.5 : 1);
    this.score += Math.round(bonus);
    Profile.data.wins++;
    Profile.submitRecord(this.map.id, this.diff.id, this.wave, this.score, won);
    this.unlock('victor');
    if (this.lives === this.maxLives) this.unlock('untouchable');
    if (this.diff.id === 'hard') this.unlock('legend');
    Store.remove(SAVE_KEY);
    audio.play('victory');
    UI.showEnd(true);
  },

  defeat() {
    this.state = 'OVER';
    this.waveActive = false;
    Profile.submitRecord(this.map.id, this.diff.id, this.endless ? this.wave : Math.max(0, this.wave - 1), this.score, false);
    Store.remove(SAVE_KEY);
    audio.play('defeat');
    UI.showEnd(false);
  },

  startEndless() {
    this.endless = true;
    this.state = 'PLAYING';
    this.waveActive = false;
    this.checkpoint = this.snapshot();
    Store.set(SAVE_KEY, this.checkpoint);
    UI.log('Endless mode engaged. The swarm will not stop.');
    UI.refreshWavePreview();
  },

  unlock(id) {
    if (Profile.data.achievements[id]) return;
    Profile.data.achievements[id] = Date.now();
    Profile.save();
    const a = ACHIEVEMENTS.find(x => x.id === id);
    audio.play('achieve');
    UI.achievement(a);
    UI.log(`✦ Achievement unlocked: <b>${a.name}</b>`);
  },

  // -------------------------------------------------------------- save / load
  snapshot() {
    return {
      v: 3,
      map: this.map.id, diff: this.diff.id,
      credits: this.credits, lives: this.lives, wave: this.wave, score: this.score,
      endless: this.endless, stats: { ...this.stats },
      towers: this.towers.map(t => ({ id: t.def.id, x: t.x, y: t.y, level: t.level, mode: t.targetMode, invested: t.invested })),
      savedAt: Date.now()
    };
  },

  // Saves the current board between waves, otherwise the last checkpoint.
  save() {
    const data = this.waveActive ? this.checkpoint : this.snapshot();
    if (!this.waveActive) this.checkpoint = data;
    const ok = Store.set(SAVE_KEY, data);
    return ok ? (this.waveActive ? 'checkpoint' : 'saved') : 'failed';
  },

  load(data) {
    if (!data || data.v !== 3) return false;
    this.newGame(data.map, data.diff);
    this.credits = data.credits;
    this.lives = data.lives;
    this.wave = data.wave;
    this.score = data.score || 0;
    this.endless = !!data.endless;
    Object.assign(this.stats, data.stats || {});
    for (const s of data.towers || []) {
      const def = TOWERS[s.id];
      if (!def) continue;
      const t = new Tower(def, s.x, s.y);
      for (let i = 1; i < s.level; i++) t.applyUpgrade();
      t.invested = s.invested || t.invested;
      t.targetMode = s.mode || 'first';
      t.spawnAnim = 0;
      this.towers.push(t);
    }
    this.checkpoint = this.snapshot();
    return true;
  },

  // -------------------------------------------------------------- simulation
  update(dt) {
    this.time += dt;
    this.waveTime += dt;
    if (this.shake > 0) this.shake -= dt;
    if (this.hurtFlash > 0) this.hurtFlash -= dt;
    if (this.freezeTimer > 0) this.freezeTimer -= dt;
    if (this.overclockTimer > 0) this.overclockTimer -= dt;
    for (const k in this.cooldowns) if (this.cooldowns[k] > 0) this.cooldowns[k] = Math.max(0, this.cooldowns[k] - dt);

    // Spawning runs on game time, so pause and speed controls affect it correctly.
    while (this.spawnQueue.length && this.spawnQueue[0].time <= this.waveTime) {
      const s = this.spawnQueue.shift();
      this.enemies.push(new Enemy(s.type, s.stats, s.lane));
    }

    // Recalculate support buffs.
    for (const t of this.towers) { t.auraBoost = 0; t.synergyBoost = 0; t.stunShots = false; }
    for (const t of this.towers) {
      if (t.def.id === 'beacon') {
        for (const o of this.towers) {
          if (o !== t && !o.def.support && dist(o, t) <= t.range) {
            o.auraBoost = Math.max(o.auraBoost, t.auraPower);
            if (o.def.id === 'longshot') o.stunShots = true;
          }
        }
      } else if (t.def.id === 'cryo') {
        for (const o of this.towers) {
          if ((o.def.id === 'warden' || o.def.id === 'sage') && dist(o, t) <= 100) o.synergyBoost = 0.1;
        }
      }
    }

    for (const e of this.enemies) e.update(dt);
    if (this.state !== 'PLAYING') return;   // defeat may have happened during enemy movement
    for (const t of this.towers) t.update(dt);
    for (const p of this.projectiles) p.update(dt);
    for (const f of this.effects) f.update(dt);
    for (const p of this.particles) p.update(dt);
    for (const t of this.texts) t.update(dt);

    this.enemies = this.enemies.filter(e => !(e.reached || (e.dead && e.deathTimer <= 0)));
    this.projectiles = this.projectiles.filter(p => p.active);
    this.effects = this.effects.filter(f => f.life > 0);
    this.particles = this.particles.filter(p => p.life > 0);
    this.texts = this.texts.filter(t => t.life > 0);

    if (this.waveActive && this.spawnQueue.length === 0 && !this.enemies.some(e => e.alive)) this.onWaveCleared();

    if (this.autoTimer > 0) {
      this.autoTimer -= dt;
      if (this.autoTimer <= 0 && this.autoWaves) this.startWave();
    }
  },

  // -------------------------------------------------------------- rendering
  render() {
    ctx.save();
    if (this.shake > 0) ctx.translate(rand(-1, 1) * this.shake * 18, rand(-1, 1) * this.shake * 18);
    ctx.drawImage(bgCanvas, 0, 0);
    drawLaneFlow();
    drawGates();

    for (const t of this.towers) t.draw();
    for (const e of this.enemies) if (!e.boss) e.draw();
    for (const e of this.enemies) if (e.boss) e.draw();
    for (const p of this.projectiles) p.draw();
    for (const f of this.effects) f.draw();
    for (const p of this.particles) p.draw();
    for (const t of this.texts) t.draw();
    drawCursor();
    ctx.restore();

    // Full-screen tints.
    if (this.freezeTimer > 0) {
      ctx.fillStyle = `rgba(150,220,255,${Math.min(0.18, this.freezeTimer * 0.08)})`;
      ctx.fillRect(0, 0, BOARD_W, BOARD_H);
    }
    if (this.overclockTimer > 0) {
      ctx.strokeStyle = `rgba(255,122,217,${0.25 + 0.15 * Math.sin(this.time * 8)})`;
      ctx.lineWidth = 6;
      ctx.strokeRect(3, 3, BOARD_W - 6, BOARD_H - 6);
    }
    if (this.hurtFlash > 0) {
      const g = ctx.createRadialGradient(BOARD_W / 2, BOARD_H / 2, BOARD_H * 0.35, BOARD_W / 2, BOARD_H / 2, BOARD_W * 0.65);
      g.addColorStop(0, 'rgba(255,40,60,0)');
      g.addColorStop(1, `rgba(255,40,60,${this.hurtFlash * 0.6})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, BOARD_W, BOARD_H);
    }
  }
};

// ---- Static background, rebuilt when the sector changes ----
function buildBackground() {
  const b = bgCanvas.getContext('2d');
  const m = G.map;
  b.fillStyle = '#050913';
  b.fillRect(0, 0, BOARD_W, BOARD_H);

  // Nebula clouds.
  const blobs = [[180, 140, 340, m.nebula[0]], [780, 460, 380, m.nebula[1]], [520, 60, 260, m.nebula[1]], [120, 520, 260, m.nebula[0]]];
  for (const [x, y, r, c] of blobs) {
    const g = b.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, hexToRgba(c, 0.45));
    g.addColorStop(1, hexToRgba(c, 0));
    b.fillStyle = g;
    b.fillRect(0, 0, BOARD_W, BOARD_H);
  }

  // Stars.
  for (let i = 0; i < 260; i++) {
    b.fillStyle = `rgba(255,255,255,${rand(0.15, 0.8)})`;
    const s = Math.random() < 0.08 ? 2 : 1;
    b.fillRect(rand(0, BOARD_W), rand(0, BOARD_H), s, s);
  }

  // Distant planet.
  const px = BOARD_W - 70, py = 40, pr = 120;
  const pg = b.createRadialGradient(px - 40, py + 40, 10, px, py, pr);
  pg.addColorStop(0, hexToRgba(m.theme, 0.5));
  pg.addColorStop(0.7, hexToRgba(m.nebula[1], 0.35));
  pg.addColorStop(1, 'rgba(0,0,0,0)');
  b.fillStyle = pg;
  b.beginPath(); b.arc(px, py, pr, 0, Math.PI * 2); b.fill();

  // Faint hex grid.
  b.strokeStyle = 'rgba(120,160,255,0.045)';
  b.lineWidth = 1;
  const r = 22, hw = Math.sqrt(3) * r;
  for (let row = 0; row * r * 1.5 < BOARD_H + r; row++) {
    for (let col = 0; col * hw < BOARD_W + hw; col++) {
      const cx = col * hw + (row % 2 ? hw / 2 : 0), cy = row * r * 1.5;
      b.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = Math.PI / 6 + (i / 6) * Math.PI * 2;
        b.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      }
      b.closePath(); b.stroke();
    }
  }

  // Lanes: glow, rim, body.
  const strokeLanes = (width, style) => {
    b.lineWidth = width;
    b.strokeStyle = style;
    b.lineCap = 'round';
    b.lineJoin = 'round';
    for (const lane of G.lanes) {
      b.beginPath();
      lane.points.forEach((p, i) => i ? b.lineTo(p.x, p.y) : b.moveTo(p.x, p.y));
      b.stroke();
    }
  };
  strokeLanes(58, hexToRgba(m.theme, 0.06));
  strokeLanes(44, hexToRgba(m.theme, 0.45));
  strokeLanes(40, '#0a1122');
  strokeLanes(26, 'rgba(255,255,255,0.025)');
}

function drawLaneFlow() {
  ctx.save();
  ctx.setLineDash([2, 22]);
  ctx.lineDashOffset = -G.time * 40;
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.strokeStyle = hexToRgba(G.map.theme, 0.5);
  for (const lane of G.lanes) {
    ctx.beginPath();
    lane.points.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
    ctx.stroke();
  }
  ctx.restore();
}

function drawGates() {
  const t = G.time;
  // Warp gates where enemies enter.
  for (const lane of G.lanes) {
    const p = lane.points[1];
    const y = p.y, x = 18;
    ctx.save();
    ctx.translate(x, y);
    for (let i = 0; i < 3; i++) {
      ctx.strokeStyle = `rgba(255,70,120,${0.5 - i * 0.12})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(0, 0, 8 + i * 4, 22 + i * 3, 0, t * (1 + i) , t * (1 + i) + Math.PI * 1.4);
      ctx.stroke();
    }
    ctx.restore();
  }
  // The core you defend.
  const last = G.lanes[0].points;
  const end = last[last.length - 1];
  const cx = BOARD_W - 26, cy = end.y;
  const pulse = 1 + Math.sin(t * 3) * 0.08;
  const hp = G.lives / G.maxLives;
  const col = hp > 0.5 ? '#5ef2c8' : hp > 0.25 ? '#ffc94d' : '#ff5d6c';
  const g = ctx.createRadialGradient(cx, cy, 2, cx, cy, 40 * pulse);
  g.addColorStop(0, hexToRgba(col, 0.6));
  g.addColorStop(1, hexToRgba(col, 0));
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(cx, cy, 40 * pulse, 0, Math.PI * 2); ctx.fill();
  ctx.save();
  ctx.translate(cx, cy);
  ctx.fillStyle = '#0c1424';
  ctx.strokeStyle = col;
  ctx.lineWidth = 2.5;
  polygon(6, 18, t * 0.3); ctx.fill(); ctx.stroke();
  ctx.fillStyle = col;
  polygon(6, 8, -t * 0.6); ctx.fill();
  ctx.restore();
}

function drawCursor() {
  const m = G.mouse;
  if (!m.inside) return;
  if (G.placing) {
    const def = G.placing;
    const why = G.canPlace(m.x, m.y);
    const ok = !why && G.credits >= def.cost;
    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = ok ? 'rgba(94,242,200,0.08)' : 'rgba(255,93,108,0.1)';
    ctx.strokeStyle = ok ? 'rgba(94,242,200,0.8)' : 'rgba(255,93,108,0.85)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 5]);
    ctx.beginPath(); ctx.arc(m.x, m.y, def.range, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.setLineDash([]);
    ctx.translate(m.x, m.y);
    ctx.globalAlpha = 0.75;
    ctx.fillStyle = '#0c1424';
    ctx.strokeStyle = TIERS[def.tier].color;
    ctx.lineWidth = 2;
    polygon(6, 17, Math.PI / 6); ctx.fill(); ctx.stroke();
    ctx.fillStyle = def.color;
    ctx.beginPath(); ctx.arc(0, 0, 9, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  } else if (G.targeting) {
    const ab = ABILITIES[G.targeting];
    ctx.save();
    ctx.strokeStyle = ab.color;
    ctx.fillStyle = hexToRgba(ab.color, 0.12);
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(m.x, m.y, ab.radius, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(m.x - 10, m.y); ctx.lineTo(m.x + 10, m.y);
    ctx.moveTo(m.x, m.y - 10); ctx.lineTo(m.x, m.y + 10);
    ctx.stroke();
    ctx.restore();
  }
}

// ---- Main loop: always running so the screen stays alive in every state ----
let lastFrame = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - lastFrame) / 1000);
  lastFrame = now;
  if (G.state === 'PLAYING') {
    // Run several fixed sub-steps at high speed so fast enemies don't skip past towers.
    for (let i = 0; i < G.speed && G.state === 'PLAYING'; i++) G.update(dt);
  }
  if (G.state !== 'MENU') {
    G.render();
    UI.refreshHud();
  }
  drawStarfield(dt);
  requestAnimationFrame(frame);
}

// ---- Fullscreen parallax starfield used behind the menu and the game ----
const starCanvas = $('bgStars');
const starCtx = starCanvas.getContext('2d');
let stars = [];
function resizeStars() {
  starCanvas.width = window.innerWidth;
  starCanvas.height = window.innerHeight;
  stars = [];
  const count = Math.floor((starCanvas.width * starCanvas.height) / 5000);
  for (let i = 0; i < count; i++) {
    const z = Math.random();
    stars.push({ x: Math.random() * starCanvas.width, y: Math.random() * starCanvas.height, z, tw: rand(0, 6) });
  }
}
function drawStarfield(dt) {
  const w = starCanvas.width, h = starCanvas.height;
  starCtx.clearRect(0, 0, w, h);
  const fast = G.state === 'MENU' ? 1 : 0.35;
  for (const s of stars) {
    s.x -= (8 + s.z * 40) * dt * fast;
    s.tw += dt * 2;
    if (s.x < 0) { s.x = w; s.y = Math.random() * h; }
    const a = (0.25 + s.z * 0.6) * (0.75 + Math.sin(s.tw) * 0.25);
    starCtx.fillStyle = `rgba(220,232,255,${a})`;
    const size = 0.6 + s.z * 1.6;
    starCtx.fillRect(s.x, s.y, size, size);
  }
}
window.addEventListener('resize', resizeStars);
resizeStars();
