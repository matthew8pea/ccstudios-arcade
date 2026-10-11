/* ==========================================================================
   entities.js — enemies, units, projectiles and visual effects
   Depends on the global game state `G` and canvas context `ctx` from game.js.
   ========================================================================== */
'use strict';

// ---- Lane geometry: enemies track distance travelled, position is derived ----
function buildLane(points) {
  const segs = [];
  let total = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    segs.push({ a, b, len, start: total });
    total += len;
  }
  return { points, segs, total };
}

function laneAt(lane, d) {
  d = clamp(d, 0, lane.total);
  for (const s of lane.segs) {
    if (d <= s.start + s.len) {
      const t = s.len === 0 ? 0 : (d - s.start) / s.len;
      return { x: lerp(s.a.x, s.b.x, t), y: lerp(s.a.y, s.b.y, t), angle: Math.atan2(s.b.y - s.a.y, s.b.x - s.a.x) };
    }
  }
  const last = lane.points[lane.points.length - 1];
  return { x: last.x, y: last.y, angle: 0 };
}

// ======================================================================
// Enemy
// ======================================================================
class Enemy {
  constructor(type, stats, laneIdx, travelled = 0) {
    const def = ENEMIES[type];
    this.type = type;
    this.def = def;
    this.laneIdx = laneIdx;
    this.lane = G.lanes[laneIdx];
    this.travelled = travelled;
    this.maxHp = Math.round(stats.hp);
    this.hp = this.maxHp;
    this.maxShield = Math.round(stats.sh || 0);
    this.shield = this.maxShield;
    this.speed = stats.s;
    this.bounty = Math.max(1, Math.round(stats.b));
    this.armor = def.armor || 0;
    this.size = def.size;
    this.boss = !!def.boss;

    this.dead = false;
    this.reached = false;
    this.deathTimer = 0.3;
    this.stunTimer = 0;
    this.slowTimer = 0;
    this.slowAmount = 0;
    this.shieldDelay = 0;
    this.hitFlash = 0;
    this.phase = rand(0, Math.PI * 2);   // animation offset
    this.abilityTimer = type === 'warden' ? rand(5, 7) : type === 'sovereign' ? 5 : type === 'mender' ? 2 : 0;
    this.phased = false;
    this.phaseTimer = type === 'phantom' ? rand(2, 4) : 0;

    const p = laneAt(this.lane, this.travelled);
    this.x = p.x; this.y = p.y; this.angle = p.angle;
  }

  get remaining() { return this.lane.total - this.travelled; }
  get alive() { return !this.dead && !this.reached; }
  get targetable() { return this.alive && !this.phased; }

  takeDamage(amount, source = null, pierce = false) {
    if (!this.alive || this.phased) return 0;
    const armor = pierce ? this.armor / 2 : this.armor;
    let dmg = Math.max(amount * 0.25, amount - armor);
    const dealt = dmg;
    this.shieldDelay = 2.0;
    this.hitFlash = 0.08;

    if (this.shield > 0) {
      const absorbed = Math.min(this.shield, dmg);
      this.shield -= absorbed;
      dmg -= absorbed;
    }
    this.hp -= dmg;
    if (source) source.damageDealt += dealt;
    if (amount >= 40) G.texts.push(new FloatingText(Math.round(dealt), this.x, this.y - this.size, '#ffe3a3'));

    if (this.hp <= 0) {
      this.hp = 0;
      this.dead = true;
      if (source) source.kills++;
      G.onEnemyKilled(this);
    }
    return dealt;
  }

  update(dt) {
    if (this.dead) { this.deathTimer -= dt; return; }
    if (this.hitFlash > 0) this.hitFlash -= dt;
    this.phase += dt * 4;

    // Shield regeneration after a short delay without taking hits.
    if (this.shieldDelay > 0) this.shieldDelay -= dt;
    else if (this.shield < this.maxShield) this.shield = Math.min(this.maxShield, this.shield + (this.def.shieldRegen || 0) * dt);

    // Phantom phasing cycle: 1.2s untargetable every few seconds.
    if (this.type === 'phantom') {
      this.phaseTimer -= dt;
      if (this.phaseTimer <= 0) {
        this.phased = !this.phased;
        this.phaseTimer = this.phased ? 1.2 : rand(2.5, 4);
      }
    }

    // Special abilities.
    if (this.abilityTimer > 0) {
      this.abilityTimer -= dt;
      if (this.abilityTimer <= 0) this.useAbility();
    }

    if (this.stunTimer > 0) { this.stunTimer -= dt; return; }
    if (G.freezeTimer > 0 && !(this.boss && G.freezeTimer < G.freezeBossCutoff)) return;

    if (this.slowTimer > 0) this.slowTimer -= dt;
    const chill = this.slowTimer > 0 ? this.slowAmount : 0;
    const slow = Math.max(chill, G.fieldSlowAt(this));
    this.travelled += this.speed * (1 - slow) * dt;

    if (this.travelled >= this.lane.total) {
      this.reached = true;
      G.onEnemyReached(this);
      return;
    }
    const p = laneAt(this.lane, this.travelled);
    this.x = p.x; this.y = p.y; this.angle = p.angle;
  }

  useAbility() {
    if (this.type === 'mender') {
      this.abilityTimer = 2;
      let healed = false;
      for (const e of G.enemies) {
        if (e === this || !e.alive || dist(e, this) > 75 || e.hp >= e.maxHp) continue;
        e.hp = Math.min(e.maxHp, e.hp + e.maxHp * (e.boss ? 0.02 : 0.06));
        healed = true;
      }
      if (healed) G.effects.push(new Effect('ring', this.x, this.y, { color: '#5ef2a8', radius: 75, life: 0.6 }));
    } else if (this.type === 'warden') {
      this.abilityTimer = rand(6, 9);
      if (this.stunTimer > 0 || G.freezeTimer > 0) return;
      spawnParticles(this.x, this.y, '#ff7a3d', 22, 5, 140, 0.5);
      this.travelled = Math.min(this.lane.total - 40, this.travelled + 120);
      const p = laneAt(this.lane, this.travelled);
      this.x = p.x; this.y = p.y;
      spawnParticles(this.x, this.y, '#ff7a3d', 22, 5, 140, 0.5);
    } else if (this.type === 'sovereign') {
      this.abilityTimer = 6;
      const minionHp = 320 * G.diff.hp * (G.endless ? Math.pow(1.16, G.wave - WAVES.length) : 1);
      for (let i = 0; i < 2; i++) {
        const back = Math.max(0, this.travelled - 30 - i * 25);
        G.enemies.push(new Enemy('husk', { hp: minionHp, s: 55, b: 6 }, this.laneIdx, back));
      }
      G.effects.push(new Effect('ring', this.x, this.y, { color: '#ff2d7a', radius: 60, life: 0.5 }));
    }
  }

  draw() {
    if (this.dead && this.deathTimer <= 0) return;
    const k = this.dead ? Math.max(0, this.deathTimer / 0.3) : 1;
    const s = this.size * (this.dead ? 1 + (1 - k) * 0.6 : 1);
    const c = this.hitFlash > 0 ? '#ffffff' : this.def.color;

    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.globalAlpha = (this.dead ? k : 1) * (this.phased ? 0.28 : 1);

    // Soft glow under every enemy.
    ctx.fillStyle = hexToRgba(this.def.color, 0.18);
    ctx.beginPath(); ctx.arc(0, 0, s * 1.7, 0, Math.PI * 2); ctx.fill();

    ctx.rotate(this.angle);
    ctx.fillStyle = c;
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.lineWidth = 2;

    switch (this.type) {
      case 'skitter':
        ctx.beginPath(); ctx.moveTo(s * 1.3, 0); ctx.lineTo(-s, -s * 0.9); ctx.lineTo(-s * 0.5, 0); ctx.lineTo(-s, s * 0.9); ctx.closePath();
        ctx.fill(); ctx.stroke(); break;
      case 'bulwark':
        roundRect(-s, -s, s * 2, s * 2, 3); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#20283a'; ctx.fillRect(-s * 0.4, -s * 0.4, s * 0.8, s * 0.8); break;
      case 'juggernaut':
        polygon(8, s, Math.PI / 8); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = '#a7b3c9'; ctx.lineWidth = 2; polygon(8, s * 0.6, Math.PI / 8); ctx.stroke(); break;
      case 'mender':
        ctx.beginPath(); ctx.arc(0, 0, s, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#0d2a1f'; ctx.fillRect(-s * 0.6, -s * 0.18, s * 1.2, s * 0.36); ctx.fillRect(-s * 0.18, -s * 0.6, s * 0.36, s * 1.2); break;
      case 'brood':
        ctx.beginPath(); ctx.ellipse(0, 0, s * 1.15, s * 0.9, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#5a3a10';
        for (let i = 0; i < 3; i++) { const a = i * 2.1 + this.phase * 0.2; ctx.beginPath(); ctx.arc(Math.cos(a) * s * 0.45, Math.sin(a) * s * 0.4, s * 0.22, 0, Math.PI * 2); ctx.fill(); }
        break;
      case 'phantom':
        ctx.beginPath(); ctx.moveTo(s * 1.3, 0); ctx.lineTo(0, -s); ctx.lineTo(-s * 1.1, 0); ctx.lineTo(0, s); ctx.closePath();
        ctx.fill(); ctx.stroke(); break;
      case 'colossus':
      case 'warden':
      case 'sovereign':
        this.drawBoss(s, c); break;
      default: // husk
        ctx.beginPath(); ctx.arc(0, 0, s, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#2a0b3a'; ctx.beginPath(); ctx.arc(s * 0.35, 0, s * 0.35, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ff6b8a'; ctx.beginPath(); ctx.arc(s * 0.42, 0, s * 0.14, 0, Math.PI * 2); ctx.fill();
    }
    ctx.rotate(-this.angle);

    // Shield bubble.
    if (this.shield > 0 && !this.dead) {
      ctx.strokeStyle = `rgba(110,190,255,${0.35 + 0.5 * (this.shield / this.maxShield)})`;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, 0, s + 5, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = 'rgba(110,190,255,0.12)'; ctx.fill();
    }
    ctx.restore();

    if (this.dead) return;

    // Health and shield bars.
    const w = this.boss ? 54 : 26;
    const y = this.y - s - (this.boss ? 14 : 10);
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(this.x - w / 2 - 1, y - 1, w + 2, 6);
    const pct = this.hp / this.maxHp;
    ctx.fillStyle = pct > 0.5 ? '#5ef2a8' : pct > 0.25 ? '#ffc94d' : '#ff5d6c';
    ctx.fillRect(this.x - w / 2, y, w * pct, 4);
    if (this.maxShield > 0) {
      ctx.fillStyle = '#6ebeff';
      ctx.fillRect(this.x - w / 2, y - 4, w * (this.shield / this.maxShield), 2);
    }

    // Status markers.
    if (this.stunTimer > 0) {
      ctx.fillStyle = '#ffd166';
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('✶✶', this.x, y - 6);
    } else if (this.slowTimer > 0) {
      ctx.strokeStyle = 'rgba(154,230,255,0.7)';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(this.x, this.y, s + 3, 0, Math.PI * 2); ctx.stroke();
    }
  }

  drawBoss(s, c) {
    ctx.save();
    ctx.rotate(this.phase * 0.25);
    ctx.strokeStyle = hexToRgba(this.def.color, 0.8);
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 6]);
    ctx.beginPath(); ctx.arc(0, 0, s * 1.35, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    ctx.fillStyle = c;
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 3;
    if (this.type === 'colossus') {
      polygon(6, s, 0); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#3a0a10'; polygon(6, s * 0.55, 0); ctx.fill();
    } else if (this.type === 'warden') {
      ctx.beginPath(); ctx.moveTo(s * 1.3, 0); ctx.lineTo(-s * 0.4, -s); ctx.lineTo(-s, 0); ctx.lineTo(-s * 0.4, s); ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#3a1404'; ctx.beginPath(); ctx.arc(0, 0, s * 0.35, 0, Math.PI * 2); ctx.fill();
    } else {
      // Sovereign: a crowned star.
      ctx.beginPath();
      for (let i = 0; i < 16; i++) {
        const r = i % 2 === 0 ? s * 1.1 : s * 0.7;
        const a = (i / 16) * Math.PI * 2;
        ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#2a0014'; ctx.beginPath(); ctx.arc(0, 0, s * 0.45, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(s * 0.25, 0, s * 0.14, 0, Math.PI * 2); ctx.fill();
  }
}

// ======================================================================
// Tower (deployed unit)
// ======================================================================
const TARGET_MODES = ['first', 'last', 'strong', 'weak', 'close'];

class Tower {
  constructor(def, x, y) {
    this.def = def;
    this.x = x; this.y = y;
    this.level = 1;
    this.damage = def.damage;
    this.range = def.range;
    this.fireRate = def.fireRate;
    this.cooldown = 0;
    this.invested = def.cost;
    this.builtPhase = G.waveActive ? -1 : G.buildPhase;
    this.targetMode = 'first';
    this.angle = -Math.PI / 2;
    this.flash = 0;
    this.kills = 0;
    this.damageDealt = 0;
    this.auraBoost = 0;
    this.synergyBoost = 0;
    this.stunShots = false;
    this.spawnAnim = 0.35;
  }

  get maxed() { return this.level >= MAX_LEVEL; }
  get upgradeCost() { return Math.round(this.def.cost * 0.75 * this.level); }
  get sellValue() {
    return (this.builtPhase === G.buildPhase && !G.waveActive) ? this.invested : Math.round(this.invested * 0.7);
  }
  get rateMultiplier() { return 1 + this.auraBoost + this.synergyBoost + (G.overclockTimer > 0 ? 0.6 : 0); }
  get interval() { return this.fireRate / this.rateMultiplier; }
  get chainCount() { return 3 + (this.level >= 3 ? 1 : 0) + (this.level >= 5 ? 1 : 0); }
  get slowPower() { return this.def.id === 'cryo' ? 0.35 + (this.level - 1) * 0.05 : this.def.id === 'stasis' ? 0.18 + (this.level - 1) * 0.05 : 0; }
  get auraPower() { return 0.2 + (this.level - 1) * 0.05; }

  applyUpgrade() {
    this.invested += this.upgradeCost;
    this.level++;
    this.damage = Math.round(this.damage * 1.35);
    this.range = Math.round(this.range * 1.06);
    this.fireRate = Math.max(0.08, this.fireRate * 0.9);
    this.spawnAnim = 0.35;
  }

  inRange(e) {
    const d = dist(this, e);
    return d <= this.range && (!this.def.minRange || d >= this.def.minRange);
  }

  findTarget() {
    let best = null, bestScore = -Infinity;
    for (const e of G.enemies) {
      if (!e.targetable || !this.inRange(e)) continue;
      let score;
      switch (this.targetMode) {
        case 'last':   score = e.remaining; break;
        case 'strong': score = e.hp + e.shield; break;
        case 'weak':   score = -(e.hp + e.shield); break;
        case 'close':  score = -dist(this, e); break;
        default:       score = -e.remaining;  // first: closest to the core
      }
      if (score > bestScore) { bestScore = score; best = e; }
    }
    return best;
  }

  update(dt) {
    if (this.spawnAnim > 0) this.spawnAnim -= dt;
    if (this.flash > 0) this.flash -= dt;
    if (this.cooldown > 0) this.cooldown -= dt;
    if (this.def.support) return;

    const id = this.def.id;
    if (id === 'sage') {
      if (this.cooldown > 0) return;
      const hits = G.enemies.filter(e => e.targetable && dist(this, e) <= this.range);
      if (!hits.length) return;
      for (const e of hits) {
        e.takeDamage(this.damage, this);
        if (e.alive && !e.boss) {
          if (e.slowTimer <= 0) e.slowAmount = 0;
          e.slowTimer = Math.max(e.slowTimer, 0.6);
          e.slowAmount = Math.max(e.slowAmount, 0.4);
        }
      }
      G.effects.push(new Effect('ring', this.x, this.y, { color: this.def.color, radius: this.range, life: 0.45, width: 4 }));
      audio.play('shoot_sage');
      this.flash = 0.15;
      this.cooldown = this.interval;
      return;
    }

    const target = this.findTarget();
    if (!target) return;
    const desired = Math.atan2(target.y - this.y, target.x - this.x);
    this.angle = desired;
    if (this.cooldown > 0) return;
    this.cooldown = this.interval;
    this.flash = 0.1;

    if (id === 'warden') {
      target.takeDamage(this.damage, this);
      for (const e of G.enemies) {
        if (e !== target && e.targetable && dist(e, target) < 32) e.takeDamage(this.damage * 0.5, this);
      }
      G.effects.push(new Effect('slash', target.x, target.y, { color: this.def.color, angle: desired, life: 0.2 }));
      audio.play('shoot_warden');
    } else if (id === 'arc') {
      this.fireArc(target);
    } else if (id === 'mortar') {
      // Lead the target a little so shells land where the enemy will be.
      const flight = 0.9;
      const ahead = laneAt(target.lane, target.travelled + target.speed * flight * 0.8);
      G.projectiles.push(new Shell(this, ahead.x, ahead.y, flight));
      audio.play('shoot_mortar');
    } else {
      G.projectiles.push(new Bolt(this, target));
      audio.play('shoot_' + id);
    }
  }

  fireArc(first) {
    const points = [{ x: this.x, y: this.y }];
    const hit = new Set();
    let current = first, dmg = this.damage;
    for (let i = 0; i < this.chainCount && current; i++) {
      current.takeDamage(dmg, this);
      hit.add(current);
      points.push({ x: current.x, y: current.y });
      dmg *= 0.7;
      let next = null, nd = 110;
      for (const e of G.enemies) {
        if (!e.targetable || hit.has(e)) continue;
        const d = dist(e, current);
        if (d < nd) { nd = d; next = e; }
      }
      current = next;
    }
    G.effects.push(new Effect('lightning', 0, 0, { points, color: this.def.color, life: 0.18 }));
    audio.play('shoot_arc');
  }

  draw() {
    const d = this.def;
    const tier = TIERS[d.tier];
    const pop = this.spawnAnim > 0 ? 1 + Math.sin((this.spawnAnim / 0.35) * Math.PI) * 0.25 : 1;

    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.scale(pop, pop);

    // Support aura shimmer.
    if (d.support) {
      ctx.fillStyle = hexToRgba(d.color, 0.035 + 0.015 * Math.sin(G.time * 3));
      ctx.beginPath(); ctx.arc(0, 0, this.range, 0, Math.PI * 2); ctx.fill();
    }

    // Hexagonal base with tier-colored rim.
    ctx.fillStyle = '#0c1424';
    ctx.strokeStyle = tier.color;
    ctx.lineWidth = 2;
    polygon(6, 17, Math.PI / 6); ctx.fill(); ctx.stroke();

    // Buff indicators.
    if (this.auraBoost > 0 || G.overclockTimer > 0) {
      ctx.strokeStyle = G.overclockTimer > 0 ? 'rgba(255,122,217,0.85)' : 'rgba(255,154,216,0.55)';
      ctx.lineWidth = 1.5;
      polygon(6, 21, Math.PI / 6); ctx.stroke();
    }

    // Core.
    ctx.fillStyle = this.flash > 0 ? '#ffffff' : d.color;
    ctx.beginPath(); ctx.arc(0, 0, 9, 0, Math.PI * 2); ctx.fill();

    // Turret by unit type.
    ctx.rotate(this.angle);
    ctx.fillStyle = '#dbe7ff';
    ctx.strokeStyle = '#0c1424';
    ctx.lineWidth = 1;
    switch (d.id) {
      case 'pulse': ctx.fillRect(4, -4, 14, 3); ctx.fillRect(4, 1, 14, 3); break;
      case 'longshot': ctx.fillRect(4, -2, 22, 4); ctx.fillRect(20, -3, 4, 6); break;
      case 'brute': ctx.fillRect(3, -5, 15, 10); break;
      case 'cryo': ctx.beginPath(); ctx.moveTo(4, -5); ctx.lineTo(16, 0); ctx.lineTo(4, 5); ctx.closePath(); ctx.fill(); break;
      case 'mortar': ctx.fillRect(2, -6, 12, 12); ctx.fillStyle = d.color; ctx.fillRect(6, -3, 8, 6); break;
      case 'warden':
        ctx.strokeStyle = d.color; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(0, 0, 14, -0.9, 0.9); ctx.stroke(); break;
      case 'arc':
        ctx.strokeStyle = d.color; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(4, 0); ctx.lineTo(9, -4); ctx.lineTo(13, 3); ctx.lineTo(18, -1); ctx.stroke(); break;
      case 'sage':
        ctx.rotate(G.time * 1.5 - this.angle);
        ctx.strokeStyle = d.color; ctx.lineWidth = 2;
        for (let i = 0; i < 3; i++) { ctx.rotate((Math.PI * 2) / 3); ctx.beginPath(); ctx.arc(11, 0, 3, 0, Math.PI * 2); ctx.stroke(); }
        break;
      case 'beacon':
        ctx.rotate(-this.angle + G.time);
        ctx.strokeStyle = d.color; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(0, 0, 13, 0, Math.PI * 0.6); ctx.stroke();
        ctx.beginPath(); ctx.arc(0, 0, 13, Math.PI, Math.PI * 1.6); ctx.stroke(); break;
      case 'stasis':
        ctx.rotate(-this.angle - G.time * 0.8);
        ctx.strokeStyle = d.color; ctx.lineWidth = 2; ctx.setLineDash([3, 4]);
        ctx.beginPath(); ctx.arc(0, 0, 13, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]); break;
    }
    ctx.restore();

    // Level pips.
    for (let i = 0; i < this.level; i++) {
      ctx.fillStyle = this.level === MAX_LEVEL ? '#ffc94d' : '#dbe7ff';
      ctx.fillRect(this.x - 11 + i * 5, this.y + 20, 3, 3);
    }

    if (G.selectedTower === this) {
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.fillStyle = 'rgba(255,255,255,0.04)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 5]);
      ctx.beginPath(); ctx.arc(this.x, this.y, this.range, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.setLineDash([]);
      if (this.def.minRange) {
        ctx.strokeStyle = 'rgba(255,93,108,0.5)';
        ctx.beginPath(); ctx.arc(this.x, this.y, this.def.minRange, 0, Math.PI * 2); ctx.stroke();
      }
    }
  }
}

// ======================================================================
// Projectiles
// ======================================================================
class Bolt {
  constructor(tower, target) {
    this.tower = tower;
    this.x = tower.x + Math.cos(tower.angle) * 16;
    this.y = tower.y + Math.sin(tower.angle) * 16;
    this.target = target;
    this.damage = tower.damage;
    this.color = tower.def.color;
    this.speed = tower.def.id === 'longshot' ? 900 : 480;
    this.active = true;
    this.trail = [];
    this.lastTarget = { x: target.x, y: target.y };
  }

  update(dt) {
    // If the target dies mid-flight, fly on to its last position and fizzle.
    if (this.target && this.target.alive) this.lastTarget = { x: this.target.x, y: this.target.y };
    const tx = this.lastTarget.x, ty = this.lastTarget.y;
    const dx = tx - this.x, dy = ty - this.y;
    const d = Math.hypot(dx, dy);
    const step = this.speed * dt;
    this.trail.push({ x: this.x, y: this.y });
    if (this.trail.length > 4) this.trail.shift();

    if (d <= step + 4) {
      this.active = false;
      if (this.target && this.target.alive) this.hit(this.target);
      return;
    }
    this.x += (dx / d) * step;
    this.y += (dy / d) * step;
  }

  hit(target) {
    const t = this.tower, id = t.def.id;
    target.takeDamage(this.damage, t, !!t.def.armorPierce);
    spawnParticles(target.x, target.y, this.color, 4, 3, 70, 0.3);
    audio.play('hit');

    if (id === 'longshot') {
      for (const e of G.enemies) {
        if (e !== target && e.targetable && dist(e, target) < 26) e.takeDamage(this.damage * 0.4, t, true);
      }
      if (t.stunShots && target.alive && !target.def.stunImmune) target.stunTimer = Math.max(target.stunTimer, 0.25);
    } else if (id === 'cryo' && target.alive) {
      if (target.slowTimer <= 0) target.slowAmount = 0;
      target.slowAmount = Math.max(target.slowAmount, t.slowPower);
      target.slowTimer = 2.0;
    } else if (id === 'brute' && target.alive && !target.def.stunImmune && Math.random() < 0.25) {
      target.stunTimer = Math.max(target.stunTimer, 0.6);
    }
  }

  draw() {
    ctx.strokeStyle = this.color;
    ctx.lineCap = 'round';
    for (let i = 0; i < this.trail.length; i++) {
      const p = this.trail[i];
      const next = this.trail[i + 1] || this;
      ctx.globalAlpha = (i + 1) / (this.trail.length + 1);
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(next.x, next.y); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(this.x, this.y, this.tower.def.id === 'brute' ? 4.5 : 2.5, 0, Math.PI * 2); ctx.fill();
  }
}

class Shell {
  constructor(tower, tx, ty, flight) {
    this.tower = tower;
    this.sx = tower.x; this.sy = tower.y;
    this.tx = tx; this.ty = ty;
    this.flight = flight;
    this.t = 0;
    this.damage = tower.damage;
    this.radius = 55 + (tower.level - 1) * 5;
    this.active = true;
    this.x = tower.x; this.y = tower.y;
  }

  update(dt) {
    this.t += dt;
    const k = Math.min(1, this.t / this.flight);
    this.x = lerp(this.sx, this.tx, k);
    this.y = lerp(this.sy, this.ty, k) - Math.sin(k * Math.PI) * 70;
    if (k >= 1) {
      this.active = false;
      for (const e of G.enemies) {
        if (e.targetable && Math.hypot(e.x - this.tx, e.y - this.ty) <= this.radius) e.takeDamage(this.damage, this.tower);
      }
      G.effects.push(new Effect('ring', this.tx, this.ty, { color: '#ffe066', radius: this.radius, life: 0.4, width: 6 }));
      spawnParticles(this.tx, this.ty, '#ffb84d', 18, 5, 160, 0.6);
      G.shake = Math.max(G.shake, 0.12);
      audio.play('explode');
    }
  }

  draw() {
    const k = Math.min(1, this.t / this.flight);
    ctx.strokeStyle = 'rgba(255,224,102,0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(this.tx, this.ty, this.radius * (0.3 + k * 0.7), 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#ffe066';
    ctx.beginPath(); ctx.arc(this.x, this.y, 5, 0, Math.PI * 2); ctx.fill();
  }
}

// ======================================================================
// Visual effects, particles and floating text
// ======================================================================
class Effect {
  constructor(kind, x, y, opts = {}) {
    Object.assign(this, { kind, x, y, color: '#fff', radius: 40, width: 3, angle: 0 }, opts);
    this.maxLife = this.life = opts.life || 0.4;
  }
  update(dt) { this.life -= dt; }
  draw() {
    const k = Math.max(0, this.life / this.maxLife);
    ctx.save();
    ctx.globalAlpha = k;
    ctx.strokeStyle = this.color;
    if (this.kind === 'ring') {
      ctx.lineWidth = this.width * k + 1;
      ctx.beginPath(); ctx.arc(this.x, this.y, this.radius * (1 - k * 0.7), 0, Math.PI * 2); ctx.stroke();
    } else if (this.kind === 'slash') {
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(this.x, this.y, 16, this.angle - 1.2 + (1 - k), this.angle + 0.2 + (1 - k)); ctx.stroke();
    } else if (this.kind === 'lightning') {
      ctx.lineWidth = 2.5;
      ctx.shadowColor = this.color; ctx.shadowBlur = 8;
      ctx.beginPath();
      for (let i = 0; i < this.points.length - 1; i++) {
        const a = this.points[i], b = this.points[i + 1];
        ctx.moveTo(a.x, a.y);
        for (let j = 1; j < 5; j++) {
          ctx.lineTo(lerp(a.x, b.x, j / 5) + rand(-6, 6), lerp(a.y, b.y, j / 5) + rand(-6, 6));
        }
        ctx.lineTo(b.x, b.y);
      }
      ctx.stroke();
    } else if (this.kind === 'beam') {
      const w = 30 * k + 4;
      const g = ctx.createLinearGradient(this.x - w, 0, this.x + w, 0);
      g.addColorStop(0, 'rgba(255,201,77,0)');
      g.addColorStop(0.5, 'rgba(255,240,200,0.95)');
      g.addColorStop(1, 'rgba(255,201,77,0)');
      ctx.fillStyle = g;
      ctx.fillRect(this.x - w, 0, w * 2, this.y);
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(this.x, this.y, this.radius * (1.2 - k * 0.5), 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
  }
}

class Particle {
  constructor(x, y, color, size, speed, life) {
    const a = rand(0, Math.PI * 2);
    this.x = x; this.y = y; this.color = color;
    this.size = size;
    this.vx = Math.cos(a) * speed; this.vy = Math.sin(a) * speed;
    this.life = this.maxLife = life;
  }
  update(dt) {
    this.x += this.vx * dt; this.y += this.vy * dt;
    this.vx *= 0.94; this.vy *= 0.94;
    this.life -= dt;
  }
  draw() {
    const k = Math.max(0, this.life / this.maxLife);
    ctx.globalAlpha = k;
    ctx.fillStyle = this.color;
    ctx.beginPath(); ctx.arc(this.x, this.y, Math.max(0.5, this.size * k), 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
  }
}

function spawnParticles(x, y, color, count, size, speed, life) {
  if (G.particles.length > 600) return;   // keep big fights smooth
  for (let i = 0; i < count; i++) {
    G.particles.push(new Particle(x, y, color, rand(size * 0.5, size), rand(speed * 0.3, speed), rand(life * 0.5, life)));
  }
}

class FloatingText {
  constructor(text, x, y, color = '#ffffff', size = 12) {
    this.text = text; this.x = x + rand(-8, 8); this.y = y;
    this.color = color; this.size = size;
    this.life = this.maxLife = 0.9;
  }
  update(dt) { this.life -= dt; this.y -= dt * 28; }
  draw() {
    ctx.globalAlpha = Math.max(0, this.life / this.maxLife);
    ctx.fillStyle = this.color;
    ctx.font = `700 ${this.size}px "Segoe UI", system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(this.text, this.x, this.y);
    ctx.globalAlpha = 1;
  }
}

// ---- Small canvas shape helpers ----
function polygon(sides, r, rot = 0) {
  ctx.beginPath();
  for (let i = 0; i < sides; i++) {
    const a = rot + (i / sides) * Math.PI * 2;
    if (i === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  ctx.closePath();
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
