import * as THREE from 'three';
import { rand, segSegDist2, pick } from './util.js';

const _d = new THREE.Vector3();
const _hit = new THREE.Vector3();
const _p0 = new THREE.Vector3();
const _p1 = new THREE.Vector3();
const _n = new THREE.Vector3();

function capsuleHit(a, b, pos, r, h) {
  _p0.set(pos.x, pos.y + 0.3, pos.z);
  _p1.set(pos.x, pos.y + h, pos.z);
  const res = segSegDist2(a, b, _p0, _p1);
  return res.d2 < r * r ? res.s : -1;
}

/** Battle Points for an elimination, by enemy type. */
const KILL_BP = { b1: 100, b2: 200, b2_rocket: 250, commando: 200, rebel_clone: 300, jawa: 100, tusken_sniper: 250, tusken_melee: 200 };

const KILL_QUIPS = {
  cody: ['Scratch one.', 'Keep pushing!', 'Target down.', "That's one less clanker.", 'Next!'],
  fox: ['Down you go.', 'Not on my watch.', 'Clanker scrap.', "Guard's still standing.", 'Next!'],
  gree: ['Target eliminated.', 'One down.', 'The 41st does not retreat.', 'Next!'],
  yoda: ['Hmm. Scrap metal, you are.', 'Size matters not.', 'Fall, you will.', 'Hmph. Next!'],
};
// on Tatooine the enemy is flesh and blood, and not even to blame
const DESERT_QUIPS = {
  cody: ['Raider down.', 'Stay down.', 'One less sniper on the ridge.', 'Next!'],
  fox: ['Down you go.', 'Not on my watch.', 'Back to the dunes.', 'Next!'],
  gree: ['Target eliminated.', 'One down.', 'The 41st holds.', 'Next!'],
  yoda: ['Rest, troubled one.', 'Clouded, your mind was.', 'Size matters not.', 'Hmph. Next!'],
};

// Act IV: the enemy is their own brothers
const ORDER66_QUIPS = {
  cody: ['Sorry, brother.', 'Stand down!', "Don't make me do this.", 'Next!'],
  fox: ['Forgive me.', 'You chose the order. I chose him.', 'Next!'],
  gree: ['Stand down, brothers!', "It didn't have to be this way.", 'Next!'],
  yoda: ['Clouded, your mind is. Not your fault, this is.', 'Rest, brother.', 'Hmm. Next!'],
};

export class Combat {
  constructor(G) {
    this.G = G;
    this.grenades = [];
    this.pickups = [];
    this.strikes = [];
    this.grenadeGeo = new THREE.SphereGeometry(0.09, 12, 8);
    this.grenadeMat = new THREE.MeshStandardMaterial({ color: 0x5a5f66, metalness: 0.8, roughness: 0.3 });
    this.blinkMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 0.4, 0.2), toneMapped: false });
    this.stunBlinkMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.5, 1.6, 4), toneMapped: false });
    this.chain = 0;
    this.lastKillT = -99;
    this.bactaMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.4, 2.6, 2.0), toneMapped: false });
    this.capMat = new THREE.MeshStandardMaterial({ color: 0xd8dce0, metalness: 0.5, roughness: 0.3 });
    this.lastQuip = 0;
  }

  fireBolt(o) { this.G.fx.bolts.fire(o); }

  update(dt) {
    const G = this.G;
    G.fx.bolts.update(dt, (b, a, c) => this.boltStep(b, a, c));
    this.updateGrenades(dt);
    this.updatePickups(dt);
    this.updateStrikes(dt);
  }

  boltStep(b, a, c) {
    const G = this.G;
    _d.subVectors(c, a);
    const len = _d.length();
    if (len < 1e-6) return false;
    _d.divideScalar(len);
    let bestT = 1.0001, kind = null, obj = null, head = false, normal = null;
    const res = G.world.raycast(a, _d, len, 'shot');
    if (res) { bestT = res.dist / len; kind = 'world'; normal = res.normal; }
    // the dunes stop bolts too
    const th = G.world.terrainHit(a, c);
    if (th >= 0 && th < bestT) { bestT = th; kind = 'sand'; normal = _n.set(0, 1, 0); }
    if (b.team === 'enemy') {
      const sh = G.world.raycast(a, _d, len, 'shield');
      if (sh && sh.dist / len < bestT) { bestT = sh.dist / len; kind = 'shield'; normal = sh.normal; }
    }
    if (b.team === 'friendly') {
      for (const e of G.enemies.list) {
        const h = e.hitTest(a, c);
        if (h && h.t < bestT) { bestT = h.t; kind = 'enemy'; obj = e; head = h.head; }
      }
    } else {
      const p = G.player;
      if (p && p.alive && G.state === 'playing') {
        const t = capsuleHit(a, c, p.pos, p.hitR || 0.42, p.height || 1.75);
        if (t >= 0 && t < bestT) { bestT = t; kind = 'player'; }
        else if (b.travelled > 4 && !b.whizzed) {
          // near miss: a Doppler zzzip as the bolt passes the helmet
          _p0.set(p.pos.x, p.pos.y + 1.55, p.pos.z);
          const r = segSegDist2(a, c, _p0, _p0);
          if (r.d2 < 4.5) { b.whizzed = true; G.sound.whiz(_p1.copy(a).lerp(c, r.s)); }
        }
      }
      const al = G.ally;
      if (al) {
        const t = capsuleHit(a, c, al.pos, 0.42, 1.75);
        if (t >= 0 && t < bestT) { bestT = t; kind = 'ally'; }
      }
      if (G.squad) {
        for (const tr of G.squad.list.concat(G.squad.younglings)) {
          if (!tr.alive || !tr.char.group.visible) continue;
          const t = capsuleHit(a, c, tr.pos, 0.4, tr.younglingH || 1.75);
          if (t >= 0 && t < bestT) { bestT = t; kind = 'trooper'; obj = tr; }
        }
      }
    }
    // the Separatist shield generator's dome soaks Republic fire (and wears down)
    if (b.team === 'friendly' && G.objectives && G.objectives.gen) {
      const t = G.objectives.hitDome(a, c);
      if (t >= 0 && t < bestT) { bestT = t; kind = 'generator'; }
    }
    const council = G.city && G.city.temple && G.city.temple.council;
    if (council) {
      const gh = council.glassHit(a, c);
      if (gh && gh.t < bestT) { bestT = gh.t; kind = 'glass'; obj = gh.pane; }
    }
    if (!kind) return false;
    _hit.copy(a).addScaledVector(_d, bestT * len);
    if (kind === 'world') {
      G.fx.impact(_hit, normal, b.color);
      G.sound.impact(_hit, 'wall');
    } else if (kind === 'sand') {
      G.fx.sparks(_hit, normal, b.color, 5, 4);
      G.fx.dust(_hit, 4, 0.45);
      G.sound.impact(_hit, 'wall');
    } else if (kind === 'enemy' && obj.deflect && b.team === 'friendly' && obj.deflect(b, _hit, _d)) {
      // Count Dooku bats it back
    } else if (kind === 'shield') {
      // ripple of blue energy where the shield soaks the bolt
      G.fx.flash(_hit, 0x5ab8ff, 1.1, 0.14);
      G.fx.sparks(_hit, normal, 0x6fc8ff, 6, 3);
      G.fx.flashLight(_hit, 0x5ab8ff, 3, 0.12, 5, 1);
      G.sound.impact(_hit, 'metal');
    } else if (kind === 'enemy') {
      _n.copy(_d).negate();
      const metal = obj.type !== 'rebel_clone' && !obj.cfg.organic;
      if (metal) G.fx.tink(_hit, _n); else G.fx.sparks(_hit, _n, b.color, 9, 5);
      if (obj.cfg.organic) G.fx.smokePuff(_hit, 0.35, 0.45);
      G.sound.impact(_hit, head ? 'head' : metal ? 'metal' : 'wall');
      const killed = obj.damage(b.dmg, _d, head, b.owner);
      if (b.owner === 'player') {
        G.hud.hitMarker(head, killed);
        if (killed) G.sound.killConfirm(head); else G.sound.hitConfirm(head);
      }
    } else if (kind === 'player' && G.player.cfg.melee && (G.player.blocking || (G.player.swingT > 0 && Math.random() < 0.5)) && _d.dot(_n.set(Math.sin(G.player.camYaw), 0, Math.cos(G.player.camYaw))) < -0.2) {
      // a Jedi bats the bolt back where it came from
      const att = b.owner && b.owner.pos ? b.owner : null;
      const back = att ? _p1.set(att.pos.x, att.chestY, att.pos.z).sub(_hit).normalize() : _p1.copy(_d).negate();
      G.combat.fireBolt({ from: _hit.clone(), dir: back.clone(), speed: 110, dmg: 40, team: 'friendly', owner: 'player', color: b.color, len: b.len, width: 0.14 });
      G.fx.sparks(_hit, back, 0x9dff7a, 10, 5);
      G.fx.flash(_hit, 0x9dff7a, 0.8, 0.12);
      G.sound.impact(_hit, 'metal');
    } else if (kind === 'player') {
      const att = b.owner && b.owner.pos ? b.owner : null;
      G.player.hurt(b.dmg, att ? att.pos : a, att);
      G.fx.sparks(_hit, _n.copy(_d).negate(), b.color, 5, 3);
    } else if (kind === 'ally') {
      G.fx.sparks(_hit, _n.copy(_d).negate(), b.color, 5, 3);
    } else if (kind === 'generator') {
      G.objectives.damageGenerator(b.dmg, _hit);
      G.sound.impact(_hit, 'wall');
      if (b.owner === 'player') G.hud.hitMarker(false, false);
    } else if (kind === 'trooper') {
      G.fx.sparks(_hit, _n.copy(_d).negate(), b.color, 5, 3);
      obj.hurt(b.dmg * 0.8);
    } else if (kind === 'glass') {
      G.fx.sparks(_hit, _n.copy(_d).negate(), 0xcfe8ff, 6, 3);
      G.sound.impact(_hit, 'metal');
      if (council.damagePane(obj, b.dmg)) this.shatter(obj, _d);
    }
    return true;
  }

  /** A Council window pane bursting: a shower of glinting shards (and the noise). */
  shatter(pane, dir) {
    const G = this.G, c = pane.c;
    for (let i = 0; i < 4; i++) {
      _p0.copy(c).addScaledVector(pane.t, (Math.random() - 0.5) * pane.hw * 1.6).setY(pane.y0 + Math.random() * (pane.y1 - pane.y0));
      G.fx.sparks(_p0, _n.copy(dir || pane.n), 0xdff2ff, 14, 7);
    }
    G.fx.flash(c, 0x9cd0ff, 2.5, 0.12);
    G.sound.glass(c);
  }

  explode(pos, radius, dmg, owner, scale = 1) {
    const G = this.G;
    if (G.objectives && (owner === 'player' || owner === 'ally' || owner === 'trooper')) G.objectives.blast(pos, radius, dmg);
    G.fx.explosion(pos, scale, G.world.groundAt(pos.x, pos.z, pos.y + 0.5, 0.2));
    G.sound.explosion(pos, Math.min(1.4, scale));
    _p0.copy(pos).setY(pos.y + 0.4);
    for (const e of G.enemies.list) {
      if (!e.alive || e.state === 'scripted') continue;
      _p1.set(e.pos.x, e.chestY, e.pos.z);
      const d = _p1.distanceTo(pos);
      if (d > radius) continue;
      let k = Math.pow(1 - d / radius, 0.6);
      if (G.world.blocked(_p0, _p1)) k *= 0.35;
      _n.subVectors(_p1, pos).normalize();
      e.damage(dmg * k, _n, false, owner);
      if (owner === 'player') G.hud.hitMarker(false, !e.alive);
    }
    const p = G.player;
    if (p && p.alive && G.state === 'playing') {
      _p1.set(p.pos.x, p.pos.y + 1.1, p.pos.z);
      const d = _p1.distanceTo(pos);
      if (d < radius) {
        let k = Math.pow(1 - d / radius, 0.6) * (owner === 'player' ? 0.3 : 0.8);
        if (G.world.blocked(_p0, _p1)) k *= 0.35;
        if (k > 0.01) p.hurt(dmg * k, pos, null);
      }
    }
  }

  throwGrenade(from, vel, owner, kind = 'thermal') {
    const G = this.G;
    const m = new THREE.Mesh(this.grenadeGeo, this.grenadeMat);
    m.castShadow = true;
    const light = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 4), kind === 'stun' ? this.stunBlinkMat : this.blinkMat);
    light.position.y = 0.08;
    m.add(light);
    m.position.copy(from);
    G.scene.add(m);
    this.grenades.push({ mesh: m, light, pos: m.position, vel: vel.clone(), fuse: kind === 'stun' ? 1.5 : 2.1, beep: 0, owner, kind });
  }

  updateGrenades(dt) {
    const G = this.G;
    for (let i = this.grenades.length - 1; i >= 0; i--) {
      const g = this.grenades[i];
      g.fuse -= dt;
      g.beep -= dt;
      if (g.beep <= 0) { g.beep = g.fuse < 0.8 ? 0.12 : 0.35; G.sound.beep(g.pos); g.light.visible = true; }
      else if (g.beep < 0.06) g.light.visible = false;
      g.vel.y -= 20 * dt;
      const step = g.vel.length() * dt;
      if (step > 1e-5) {
        _d.copy(g.vel).normalize();
        const hit = G.world.raycast(g.pos, _d, step + 0.09, 'move');
        if (hit) {
          g.pos.copy(hit.point).addScaledVector(hit.normal, 0.1);
          const vn = g.vel.dot(hit.normal);
          g.vel.addScaledVector(hit.normal, -2 * vn).multiplyScalar(0.42);
          if (Math.abs(vn) > 2) G.sound.impact(g.pos, true);
        } else g.pos.addScaledVector(g.vel, dt);
        // bounce on the sand
        const tg = G.world.terrain ? G.world.terrain(g.pos.x, g.pos.z) : null;
        if (tg !== null && g.pos.y < tg + 0.09) {
          g.pos.y = tg + 0.09;
          if (g.vel.y < 0) { g.vel.y *= -0.35; g.vel.x *= 0.55; g.vel.z *= 0.55; if (Math.abs(g.vel.y) > 1) G.fx.dust(g.pos, 3, 0.3); }
        }
      }
      g.mesh.rotation.x += g.vel.z * dt * 3;
      g.mesh.rotation.z -= g.vel.x * dt * 3;
      if (g.pos.y < -80) g.fuse = Math.min(g.fuse, 0);
      if (g.fuse <= 0) {
        if (g.kind === 'stun') this.stunBurst(g.pos.clone(), g.owner); else this.explode(g.pos.clone(), 6.5, 175, g.owner, 1.25);
        G.scene.remove(g.mesh);
        this.grenades.splice(i, 1);
      }
    }
  }

  barrage(target) {
    const G = this.G;
    const run = G.skywar.ships.gunshipRun(target);
    for (let i = 0; i < 9; i++) {
      const a = rand(0, Math.PI * 2), r = Math.sqrt(Math.random()) * 7.5;
      const p = new THREE.Vector3(target.x + Math.cos(a) * r, 0, target.z + Math.sin(a) * r);
      const g = G.world.groundAt(p.x, p.z, target.y + 25, 0.1);
      p.y = g > -1e9 ? g : target.y;
      this.strikes.push({ pos: p, t: 1.1 + i * 0.26 + rand(0, 0.12), streaked: false, run, i });
    }
  }

  updateStrikes(dt) {
    const G = this.G;
    for (let i = this.strikes.length - 1; i >= 0; i--) {
      const s = this.strikes[i];
      s.t -= dt;
      if (!s.streaked && s.t < 0.18) {
        s.streaked = true;
        // fired from the chin guns of the gunships passing overhead
        const from = s.run ? s.run.muzzle(s.i, new THREE.Vector3()) : new THREE.Vector3(s.pos.x + rand(-25, 25), s.pos.y + 160, s.pos.z + rand(-25, 25));
        G.fx.streak(from, s.pos, 0x6fc4ff);
        const d = from.distanceTo(s.pos);
        G.fx.bolts.fire({ from, dir: _d.subVectors(s.pos, from), speed: d / 0.17, color: 0x3aa0ff, len: 9, width: 0.5, intensity: 1.6, noHit: true, maxDist: d });
        G.fx.muzzle(from, _d.normalize(), 0x6fc4ff);
        G.sound.shot('cannon', from);
      }
      if (s.t <= 0) {
        this.explode(s.pos.clone().setY(s.pos.y + 0.3), 5.2, 150, 'player', 1.15);
        this.strikes.splice(i, 1);
      }
    }
  }

  /** Fox's stun grenade: an electric burst that locks up every droid nearby. */
  stunBurst(pos, owner) {
    const G = this.G;
    G.fx.ring(_p0.set(pos.x, G.world.groundAt(pos.x, pos.z, pos.y + 0.5, 0.2) + 0.12, pos.z), 9, 0.5, 0x6fc8ff);
    G.fx.flash(pos, 0x6fc8ff, 5, 0.25);
    G.fx.sparks(pos, _n.set(0, 1, 0), 0x6fc8ff, 40, 9);
    G.fx.flashLight(pos, 0x6fc8ff, 14, 0.5, 14, 3);
    G.sound.stun(pos);
    for (const e of G.enemies.list) {
      if (!e.alive || e.state === 'scripted') continue;
      const d = _p1.set(e.pos.x, e.chestY, e.pos.z).distanceTo(pos);
      if (d > 7.5) continue;
      e.stun(4.5);
      const killed = e.damage(8, _n.subVectors(_p1, pos).normalize(), false, owner);
      if (owner === 'player') G.hud.hitMarker(false, killed);
    }
  }

  onKill(enemy, head, source) {
    const G = this.G;
    if (enemy.state === 'scripted') return;
    // you spotted it, someone else finished it
    if (source !== 'player' && enemy.spottedUntil > G.time && G.player && G.player.alive) { G.hud.bp('SPOT ASSIST', 30); G.stats.score += 30; }
    if (source === 'trooper') G.stats.squadKills = (G.stats.squadKills || 0) + 1;
    G.waves.killsThisWave = (G.waves.killsThisWave || 0) + 1;
    const p = G.player;
    const victim = enemy.cfg.name.toUpperCase();
    const vTeam = enemy.type === 'rebel_clone' ? 'reb' : 'sep';
    if (source === 'player' && p) {
      G.stats.kills++;
      if (head) G.stats.headshots++;
      let total = 0;
      const award = (label, n, kind) => { G.hud.bp(label, n, kind); total += n; };
      award('ELIMINATION', KILL_BP[enemy.type] || 100);
      if (head) award('HEADSHOT', 50);
      this.chain = G.time - this.lastKillT < 2.6 ? this.chain + 1 : 1;
      this.lastKillT = G.time;
      if (this.chain >= 2) award(this.chain > 2 ? 'MULTI-KILL ×' + this.chain : 'MULTI-KILL', 150, 'gold');
      const ob = G.arena.objective;
      if (Math.hypot(enemy.pos.x - ob.x, enemy.pos.z - ob.z) < 16 || (G.arena.name === 'roof' && Math.hypot(enemy.pos.x, enemy.pos.z - 37) < 13)) award('DEFENDING OBJECTIVE', 25);
      G.stats.score += total;
      G.hud.killFeed(p.cfg.short, 'rep', victim, vTeam, head);
      p.special = Math.min(100, p.special + 7);
      if (G.time - this.lastQuip > 9 && Math.random() < 0.35) {
        this.lastQuip = G.time;
        G.speak(pick((G.act === 4 ? ORDER66_QUIPS : G.arena.planet ? DESERT_QUIPS : KILL_QUIPS)[p.key]), p.key, { interrupt: false });
      }
    } else {
      const killer = source === 'ally' && G.ally ? G.ally.cfg.short : source === 'trooper' ? 'CLONE TROOPER' : 'REPUBLIC';
      G.hud.killFeed(killer, 'rep', victim, vTeam, head);
      if (enemy.playerDamaged && p) { G.hud.bp('ASSIST', 40); G.stats.score += 40; }
      if (p) p.special = Math.min(100, p.special + 3);
    }
    if (Math.random() < 0.15) this.dropPickup(enemy.pos.clone());
  }

  dropPickup(pos) {
    const G = this.G;
    const b = G.arena.bounds;
    if (pos.x < b.minX || pos.x > b.maxX || pos.z < b.minZ || pos.z > b.maxZ || pos.y < G.arena.y - 1) return;
    const type = Math.random() < 0.62 ? 'bacta' : 'grenade';
    const g = new THREE.Group();
    if (type === 'bacta') {
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.34, 12), this.bactaMat);
      const c1 = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.06, 12), this.capMat);
      const c2 = c1.clone();
      c1.position.y = 0.2; c2.position.y = -0.2;
      g.add(body, c1, c2);
    } else {
      const s = new THREE.Mesh(new THREE.SphereGeometry(0.14, 14, 10), this.grenadeMat);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.025, 6, 20), this.blinkMat);
      ring.rotation.x = Math.PI / 2;
      g.add(s, ring);
    }
    const gy = G.world.groundAt(pos.x, pos.z, pos.y + 0.5, 0.2);
    g.position.copy(pos).setY((gy > -1e9 ? gy : Math.max(G.arena.y, pos.y)) + 0.45);
    G.scene.add(g);
    this.pickups.push({ type, mesh: g, life: 25, base: g.position.y });
  }

  updatePickups(dt) {
    const G = this.G;
    const p = G.player;
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const k = this.pickups[i];
      k.life -= dt;
      k.mesh.rotation.y += dt * 2;
      k.mesh.position.y = k.base + Math.sin(G.time * 3 + i) * 0.08;
      k.mesh.visible = k.life > 4 || Math.sin(G.time * 18) > 0;
      let take = false;
      const near = p && p.alive && Math.hypot(k.mesh.position.x - p.pos.x, k.mesh.position.z - p.pos.z) < 1.6 && Math.abs(k.base - 0.45 - p.pos.y) < 1.7;
      if (near) {
        const thermal = p.cfg.kit.g === 'thermal';
        if (k.type === 'bacta' && p.hp < p.maxHp) { p.hp = Math.min(p.maxHp, p.hp + 35); G.hud.toast('+35 BACTA'); take = true; }
        if (k.type === 'grenade' && thermal && p.grenades < 5) { p.grenades++; G.hud.toast('+1 THERMAL DETONATOR'); take = true; }
        if (k.type === 'grenade' && !thermal && p.cdG > 0) { p.cdG = 0; G.hud.toast(p.cfg.abilities[1].name.toUpperCase() + ' RECHARGED'); take = true; }
        if (take) G.sound.pickup();
        else if (!k.told) {
          // standing on one you cannot use yet: say why (it stays there for later)
          k.told = true;
          G.hud.toast(k.type === 'bacta' ? 'BACTA · HEALTH ALREADY FULL' : thermal ? 'THERMAL DETONATORS FULL' : p.cfg.abilities[1].name.toUpperCase() + ' ALREADY READY');
        }
      } else if (k.told && p && Math.hypot(k.mesh.position.x - p.pos.x, k.mesh.position.z - p.pos.z) > 3) k.told = false;
      if (take || k.life <= 0) {
        G.scene.remove(k.mesh);
        this.pickups.splice(i, 1);
      }
    }
  }

  clear() {
    const G = this.G;
    G.fx.bolts.clear();
    for (const g of this.grenades) G.scene.remove(g.mesh);
    for (const k of this.pickups) G.scene.remove(k.mesh);
    this.grenades.length = this.pickups.length = this.strikes.length = 0;
  }
}
