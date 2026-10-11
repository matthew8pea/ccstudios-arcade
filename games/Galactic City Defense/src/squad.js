import * as THREE from 'three';
import { Character } from './character.js';
import { rand, pick, clamp, yawTo, dampAngle, angleDiff } from './util.js';
import { ACT2_SQUAD } from './act2.js';

const SIZE = 4;
const REINFORCE = 14; // seconds before a fallen trooper is replaced
// where the squad stands when it deploys around the player: [angle from the camera, distance]
const SLOTS = [[2.2, 4.6], [-2.2, 4.6], [2.75, 6.4], [-2.75, 6.4]];
const CALLOUTS = {
  b1: ['Clankers, dead ahead!', 'Battle droids moving up!', 'More tinnies on the bridge!'],
  b2: ['Super battle droid! Focus fire!', 'Heavy droid, hit it together!'],
  b2_rocket: ['Rocket trooper, up high!', 'Jetpack droid overhead!'],
  commando: ['Commando droid, watch your flank!', 'Commandos! Stay sharp!'],
  rebel_clone: ['Turncoat clone! Take him down!', "That's no brother of ours. Fire!"],
  jawa: ['Jawas! Watch those scatter blasters!', 'Little ones coming in fast!'],
  tusken_sniper: ['Sniper on the rocks!', 'Tusken sniper, high ground!'],
  tusken_melee: ['Sand People charging!', 'Raider with a gaffi stick, incoming!'],
  dooku: ["It's Dooku! Open fire!", 'The Count! Focus fire on the Count!'],
  clone_212: ['212th troopers, coming through the lifts!', "Orange markings! They've turned!"],
  clone_guard: ['Coruscant Guard, inbound!', 'Red armour on our flank!'],
  clone_41st: ['Forty-first troopers! They took the order!', 'Green markings, coming in!'],
};
const DOWN = ['Trooper down!', "We've lost one!", 'Man down, keep firing!'];
const ARRIVE = ['Reinforcements here, sir!', 'Trooper reporting in!', 'Fresh squad member on the line!'];
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _v = new THREE.Vector3();
const _c = new THREE.Vector3();

/** One clone trooper of the player's squad (the 212th with Cody, the Coruscant Guard with Fox). */
class Trooper {
  constructor(G, model, slot) {
    this.G = G;
    this.char = new Character(G.scene, model);
    this.char.group.visible = false;
    this.pos = this.char.group.position;
    this.slot = slot;
    this.yaw = 0;
    this.alive = false;
    this.hp = 100;
    this.target = null;
    this.nav = new THREE.Vector3();
    this.scan = rand(0, 0.4);
    this.fireCD = rand(0.4, 1);
    this.burst = 0;
    this.duckT = 0;
    this.deadT = 0;
    this.cover = null; // a spot behind a crate or barricade, out of the target's line of fire
    this.coverCheck = rand(0, 1);
  }

  /** Low cover near this trooper that blocks shots from enemy e, not already taken by a squad-mate. */
  findCover(e) {
    const G = this.G, world = G.world, y = this.pos.y;
    let best = null, bestD = Infinity;
    _b.set(e.pos.x, e.chestY, e.pos.z);
    for (const b of world.boxes) {
      if (!b.move || !b.shot || b.tag === 'floor') continue;
      const h = b.max.y - y, sx = b.max.x - b.min.x, sz = b.max.z - b.min.z;
      if (h < 0.75 || h > 2.8 || b.min.y > y + 0.3 || sx < 0.4 || sz < 0.4 || sx > 9 || sz > 9) continue;
      const cx = (b.min.x + b.max.x) / 2, cz = (b.min.z + b.max.z) / 2;
      let dx = cx - e.pos.x, dz = cz - e.pos.z;
      const dl = Math.hypot(dx, dz) || 1;
      dx /= dl; dz /= dl;
      // the far side of the box from the enemy
      const k = Math.min((sx / 2 + 0.6) / Math.max(Math.abs(dx), 0.01), (sz / 2 + 0.6) / Math.max(Math.abs(dz), 0.01));
      _c.set(cx + dx * k, y, cz + dz * k);
      const d = Math.hypot(_c.x - this.pos.x, _c.z - this.pos.z);
      if (d > 15 || d > bestD || dl < 6) continue;
      if (Math.abs(world.groundAt(_c.x, _c.z, y + 0.4, 0.3) - y) > 0.3) continue;
      if (G.squad.list.some((o) => o !== this && o.alive && o.cover && o.cover.distanceTo(_c) < 1.3)) continue;
      if (this.badCover && this.badCover.distanceTo(_c) < 1.2) continue;
      _a.set(_c.x, y + 0.85, _c.z);
      if (!world.blocked(_b, _a)) continue;
      bestD = d;
      best = (best || new THREE.Vector3()).copy(_c);
    }
    return best;
  }

  get chestY() { return this.pos.y + 1.25; }

  deploy(at) {
    this.alive = true;
    this.hp = 100;
    this.vet = false;
    this.deadT = 0;
    this.target = null;
    this.cover = null;
    this.roam = null;
    this.waitT = rand(0.5, 2.5);
    this.pos.copy(at);
    this.char.group.visible = true;
    this.char.group.rotation.set(0, 0, 0);
    this.char.pitch = 0;
    this.char.play('Idle', 0);
  }

  hurt(dmg) {
    if (!this.alive) return;
    this.hp -= dmg;
    if (this.hp <= 0) {
      this.alive = false;
      this.deadT = 0;
      this.char.pitch = 0;
      this.char.play('Death', 0.1, { loop: false, restart: true });
      this.G.squad.onDown(this);
    }
  }

  update(dt) {
    const G = this.G, p = G.player, world = G.world;
    if (!this.alive) {
      this.deadT += dt;
      if (this.deadT > 4) this.char.group.visible = false;
      else this.char.update(dt);
      return;
    }
    // each trooper fights on its own: patrol the arena, take cover when it sees droids, push up if there is none
    this.scan -= dt;
    if (this.scan <= 0) {
      this.scan = 0.45;
      let best = null, bestD = 42;
      _a.set(this.pos.x, this.pos.y + 1.5, this.pos.z);
      for (const e of G.enemies.list) {
        if (!e.alive || e.state === 'scripted' || e.state === 'drop') continue;
        _b.set(e.pos.x, e.chestY, e.pos.z);
        // droids the player has spotted get priority
        const ed = _a.distanceTo(_b) * (e.spottedUntil > G.time ? 0.55 : 1);
        if (ed < bestD && !world.blocked(_a, _b)) { bestD = ed; best = e; }
      }
      if (best && best !== this.target) G.squad.spotted(this, best);
      this.target = best;
      if (best) {
        this.coverCheck -= 0.45;
        if (this.coverCheck <= 0 || !this.cover) {
          this.coverCheck = rand(2.5, 4);
          // keep the current spot while it still shields us from the target
          const keep = this.cover && world.blocked(_b.set(best.pos.x, best.chestY, best.pos.z), _a.set(this.cover.x, this.cover.y + 0.85, this.cover.z));
          if (!keep) this.cover = this.findCover(best);
        }
        if (this.cover) this.roam = null;
        else if (!this.roam && bestD > 24) this.roam = G.squad.pointToward(this.pos, best.pos, bestD - 18);
      } else {
        this.cover = null;
        this.waitT -= 0.45;
        if (!this.roam && this.waitT <= 0) this.roam = G.squad.patrolPoint(this);
      }
      const goal = this.cover || this.roam;
      if (goal) world.navTarget(this.pos, goal, 0.4, this.nav);
    }
    const goal = this.cover || this.roam;
    const gd = goal ? Math.hypot(goal.x - this.pos.x, goal.z - this.pos.z) : 0;
    let moving = false;
    if (goal && gd > (this.cover ? 0.45 : 1.2)) {
      const speed = this.target ? (this.cover ? 6 : 5.2) : 4.2;
      // the last few metres into cover go straight in (the path finder would swing round the crate)
      const way = this.cover && gd < 3 ? goal : this.nav;
      const nx = way.x - this.pos.x, nz = way.z - this.pos.z, nl = Math.hypot(nx, nz);
      if (nl > 0.05) { this.pos.x += (nx / nl) * speed * dt; this.pos.z += (nz / nl) * speed * dt; moving = true; }
    } else if (goal && goal === this.roam) {
      // reached a patrol point: look around for a while
      this.roam = null;
      this.waitT = rand(2, 6);
    }
    world.resolve(this.pos, 0.36, 1.8);
    G.keepInArena(this.pos, 0.36);
    // blocked on the way (judged once a second: less than half a metre closer = stuck):
    // settle into cover if close, otherwise give the spot up and pick another
    if (goal && moving) {
      this.progT = (this.progT || 0) + dt;
      if (this.progT >= 1) {
        const stuck = gd > (this.progGd ?? 1e9) - 0.5;
        this.progT = 0;
        this.progGd = gd;
        if (stuck && this.cover && gd < 3) goal.set(this.pos.x, this.pos.y, this.pos.z);
        else if (stuck) {
          if (this.cover) this.badCover = goal.clone();
          this.cover = this.roam = null;
          this.waitT = 0.5;
          this.progGd = undefined;
        }
      }
    } else { this.progT = 0; this.progGd = undefined; }
    const g = world.groundAt(this.pos.x, this.pos.z, this.pos.y + 0.3, 0.2);
    if (g > -1e9) this.pos.y = g;

    const t = this.target && this.target.alive ? this.target : null;
    let wantYaw = this.yaw;
    if (t) {
      wantYaw = yawTo(t.pos.x - this.pos.x, t.pos.z - this.pos.z);
      this.char.pitch = clamp(Math.atan2(t.chestY - (this.pos.y + 1.35), Math.hypot(t.pos.x - this.pos.x, t.pos.z - this.pos.z)), -0.8, 0.9);
    } else {
      this.char.pitch *= 0.9;
      if (moving) wantYaw = yawTo(this.nav.x - this.pos.x, this.nav.z - this.pos.z);
    }
    this.yaw = dampAngle(this.yaw, wantYaw, 7, dt);
    this.char.yaw = this.yaw;
    // in a firefight they hunker down between bursts (always, when behind cover)
    this.duckT -= dt;
    const crouched = !moving && t && this.burst <= 0 && this.duckT > 0;
    // the last few metres into cover under fire are done low
    if (moving && this.cover && this.target && gd < 5 && this.char.actions.CrouchWalk) this.char.play('CrouchWalk', 0.2, { timeScale: 1.2 });
    else if (moving) this.char.play('Run', 0.2, { timeScale: this.target ? 1.1 : 0.85 });
    else this.char.play(crouched ? 'Crouch' : 'Idle', 0.25);
    this.char.update(dt);

    this.fireCD -= dt;
    if (t && !crouched && this.fireCD <= 0 && Math.abs(angleDiff(this.yaw, wantYaw)) < 0.3) {
      if (this.burst <= 0) this.burst = 3 + Math.floor(Math.random() * 3);
      this.fire(t);
      this.burst--;
      this.fireCD = this.burst > 0 ? 0.2 : rand(0.5, 0.9);
      if (this.burst <= 0 && (this.cover || Math.random() < 0.55)) { this.duckT = this.cover ? rand(1.4, 3) : rand(1.2, 2.6); this.fireCD = this.duckT + 0.2; }
    }
  }

  fire(t) {
    const G = this.G;
    const from = this.char.boneWorld('muzzle', new THREE.Vector3());
    const dir = new THREE.Vector3(t.pos.x, t.chestY + rand(-0.25, 0.3), t.pos.z).sub(from).normalize();
    dir.x += rand(-0.035, 0.035); dir.y += rand(-0.03, 0.03); dir.z += rand(-0.035, 0.035);
    dir.normalize();
    G.combat.fireBolt({ from, dir, speed: 120, dmg: this.vet ? 16 : 11, team: 'friendly', owner: 'trooper', color: 0x3aa0ff, len: 2.4, width: 0.14 });
    G.fx.muzzle(from, dir, 0x3aa0ff, { light: 3 });
    G.sound.shot('rifle', from);
  }
}

/**
 * A Jedi youngling (Act II, inside the Temple): runs at the nearest droid or turncoat clone and cuts at it
 * with a lightsaber. Beaten down, they are knocked out for a while and get back up (nobody dies here).
 */
class Youngling {
  constructor(G, i) {
    this.G = G;
    this.char = new Character(G.scene, 'youngling', { cloneMaterials: true });
    const tint = [['#c99a78', '#3a2a20'], ['#8a5a3e', '#1e1612'], ['#e0b090', '#6a4a2a'], ['#6a4a32', '#14100c']][i % 4];
    for (const m of this.char.materials) {
      if (m.name === 'JediSkin') m.color.set(tint[0]);
      if (m.name === 'JediHair') m.color.set(tint[1]);
      if (m.name === 'SaberBlue' && i % 2) { m.color.set('#b8ffa8'); m.emissive.set('#4dff38'); }
    }
    this.pos = this.char.group.position;
    this.alive = true;
    this.hp = 120;
    this.downT = 0;
    this.target = null;
    this.scan = rand(0, 0.4);
    this.swingCD = rand(0.2, 0.6);
    this.yaw = 0;
    this.nav = new THREE.Vector3();
    this.home = new THREE.Vector3();
    this.younglingH = 1.2;
  }

  get chestY() { return this.pos.y + 0.8; }

  hurt(dmg) {
    if (this.downT > 0) return;
    this.hp -= dmg;
    if (this.hp <= 0) { this.downT = 9; this.alive = false; this.char.play('Crouch', 0.2); }
  }

  update(dt) {
    const G = this.G, world = G.world;
    if (this.downT > 0) {
      this.downT -= dt;
      if (this.downT <= 0) { this.hp = 120; this.alive = true; }
      this.char.update(dt);
      return;
    }
    this.scan -= dt;
    if (this.scan <= 0) {
      this.scan = 0.4;
      let best = null, bd = 34;
      for (const e of G.enemies.list) {
        if (!e.alive || e.state === 'scripted' || e.cfg.flying) continue;
        const d = e.pos.distanceTo(this.pos);
        if (d < bd) { bd = d; best = e; }
      }
      this.target = best;
      world.navTarget(this.pos, best ? best.pos : this.home, 0.3, this.nav);
    }
    const t = this.target && this.target.alive ? this.target : null;
    const goal = t ? t.pos : this.home;
    const d = Math.hypot(goal.x - this.pos.x, goal.z - this.pos.z);
    let moving = false;
    if (d > (t ? 1.5 : 2)) {
      const nx = this.nav.x - this.pos.x, nz = this.nav.z - this.pos.z, nl = Math.hypot(nx, nz);
      if (nl > 0.05) { this.pos.x += (nx / nl) * 6.2 * dt; this.pos.z += (nz / nl) * 6.2 * dt; moving = true; }
    }
    world.resolve(this.pos, 0.28, 1.2);
    G.keepInArena(this.pos, 0.28);
    const g = world.groundAt(this.pos.x, this.pos.z, this.pos.y + 0.3, 0.2);
    if (g > -1e9) this.pos.y = g;
    const wantYaw = t ? yawTo(t.pos.x - this.pos.x, t.pos.z - this.pos.z) : moving ? yawTo(this.nav.x - this.pos.x, this.nav.z - this.pos.z) : this.yaw;
    this.yaw = dampAngle(this.yaw, wantYaw, 10, dt);
    this.char.yaw = this.yaw;
    this.swingCD -= dt;
    if (t && d < 1.9 && this.swingCD <= 0) {
      this.swingCD = rand(0.5, 0.8);
      this.char.play(Math.random() < 0.5 ? 'Swing1' : 'Swing2', 0.05, { loop: false, restart: true, timeScale: 1.4 });
      _a.set(t.pos.x - this.pos.x, 0, t.pos.z - this.pos.z).normalize();
      const killed = t.damage(32, _a, false, 'trooper');
      if (!killed) t.stun(0.25, _b.copy(_a).multiplyScalar(3));
      G.fx.sparks(_b.set(t.pos.x, t.chestY - 0.4, t.pos.z), _a, 0x8ac8ff, 10, 5);
      G.sound.impact(_b, 'metal');
    } else if (this.swingCD < 0.2 || !t) {
      if (moving) this.char.play('Run', 0.2, { timeScale: 1.2 });
      else this.char.play('Idle', 0.25);
    }
    this.char.update(dt);
  }
}

/** The player's clone squad: troopers roam the arena on their own, take cover, fight, call out targets, and are reinforced as they fall. */
export class Squad {
  constructor(G) {
    this.G = G;
    this.list = [];
    this.younglings = [];
    this.model = null;
    this.calloutCD = 0;
  }

  /** Bring the whole squad in around the player (start of play, after the fall, after a respawn). */
  start() {
    const G = this.G, p = G.player;
    if (!p) return;
    const model = G.act >= 2 ? ACT2_SQUAD[p.key] : p.key === 'fox' ? 'trooper_guard' : 'trooper_212';
    if (this.model !== model) {
      for (const t of this.list) G.scene.remove(t.char.group);
      this.list = SLOTS.map((s) => new Trooper(G, model, s));
      this.model = model;
    }
    for (const t of this.list) {
      t.queued = 0;
      this.place(t);
    }
    this.calloutCD = 6;
  }

  /** Where a formation slot is right now: behind the player, mirrored forward or pulled in if that is off the walkable floor. */
  slotPoint(slot, out) {
    const G = this.G, p = G.player, w = G.world;
    for (const [a, r] of [[slot[0], slot[1]], [Math.sign(slot[0]) * Math.PI - slot[0], slot[1]], [slot[0] * 0.6, slot[1] * 0.5]]) {
      const fy = p.camYaw + a;
      out.set(p.pos.x + Math.sin(fy) * r, p.pos.y, p.pos.z + Math.cos(fy) * r);
      if (Math.abs(w.groundAt(out.x, out.z, p.pos.y + 0.5, 0.4) - p.pos.y) < 0.3) return out;
    }
    return out.copy(p.pos);
  }

  /** A walkable point somewhere in the arena to patrol to, away from where squad-mates are heading. */
  patrolPoint(t) {
    const sp = this.G.arena.spawns;
    let best = null, bestScore = -1;
    for (let i = 0; i < 6; i++) {
      const q = sp.drop();
      let near = 1e9;
      for (const o of this.list) if (o !== t && o.alive) near = Math.min(near, o.pos.distanceTo(q), o.roam ? o.roam.distanceTo(q) : 1e9);
      if (near > bestScore) { bestScore = near; best = q; }
    }
    return best;
  }

  /** A point dist metres from 'from' toward 'to', kept on the arena floor. */
  pointToward(from, to, dist) {
    const G = this.G, b = G.arena.bounds;
    const dx = to.x - from.x, dz = to.z - from.z, l = Math.hypot(dx, dz) || 1;
    const q = new THREE.Vector3(clamp(from.x + (dx / l) * dist, b.minX + 1, b.maxX - 1), from.y, clamp(from.z + (dz / l) * dist, b.minZ + 1, b.maxZ - 1));
    return Math.abs(G.world.groundAt(q.x, q.z, from.y + 0.5, 0.4) - from.y) < 0.4 ? q : null;
  }

  /** Reinforcements arrive at the arena's deployment point. */
  reinforce(t) {
    const ar = this.G.arena;
    _a.copy(ar.playerSpawn).add(_b.set(rand(-2.5, 2.5), 0, rand(-2.5, 2.5)));
    this.G.world.resolve(_a, 0.36, 1.8);
    t.deploy(_a);
  }

  place(t) {
    const p = this.G.player;
    this.slotPoint(t.slot, _a);
    this.G.world.resolve(_a, 0.36, 1.8);
    t.deploy(_a);
    t.yaw = p.camYaw;
  }

  /** Act II: the younglings who were holding the great hall join the fight. */
  addYounglings(n, at) {
    const G = this.G;
    while (this.younglings.length < n) this.younglings.push(new Youngling(G, this.younglings.length));
    this.younglings.forEach((y, i) => {
      y.char.group.visible = true;
      y.pos.copy(at).add(_a.set((i - (n - 1) / 2) * 1.6, 0, -2 - (i % 2)));
      y.home.copy(y.pos);
      y.hp = 120; y.alive = true; y.downT = 0;
      y.char.play('Idle', 0);
    });
  }

  clear() {
    for (const y of this.younglings) { y.char.group.visible = false; y.alive = false; y.downT = 1e9; }
    for (const t of this.list) { t.alive = false; t.queued = 0; t.char.group.visible = false; }
  }

  get alive() { return this.list.filter((t) => t.alive); }

  /** Called by a trooper as it falls. */
  onDown(t) {
    const G = this.G;
    t.queued = REINFORCE;
    G.hud.killFeed(G.arena.planet ? 'RAIDERS' : 'SEPARATISTS', 'sep', 'CLONE TROOPER', 'rep', false);
    const mate = this.list.find((o) => o.alive && this.near(o));
    if (mate && G.speakWorld) G.speakWorld(pick(DOWN), mate.pos, { interrupt: false });
  }

  /** A trooper has a new target: maybe call it out (shared cooldown so they don't talk over each other). */
  /** Only troopers close to the player are heard. */
  near(t) { const p = this.G.player; return !!p && t.pos.distanceTo(p.pos) < 30; }

  spotted(t, e) {
    if (this.calloutCD > 0 || !CALLOUTS[e.type] || !this.near(t)) return;
    this.calloutCD = rand(9, 15);
    if (this.G.speakWorld) this.G.speakWorld(pick(CALLOUTS[e.type]), t.pos, { interrupt: false });
  }

  /** Squad members a droid might pick as its target. */
  targets() { return this.list.filter((t) => t.alive).concat(this.younglings.filter((y) => y.alive && y.char.group.visible)); }

  update(dt) {
    const G = this.G;
    if (!G.player || !this.list.length) return;
    this.calloutCD -= dt;
    for (const y of this.younglings) if (y.char.group.visible) y.update(dt);
    for (const t of this.list) {
      if (t.queued > 0 && !t.alive) {
        t.queued -= dt;
        if (t.queued <= 0 && G.player.alive) {
          if (G.useTickets && !G.useTickets(1)) { t.queued = 0; continue; }
          this.reinforce(t);
          if (G.speakWorld && Math.random() < 0.6 && this.near(t)) G.speakWorld(pick(ARRIVE), t.pos, { interrupt: false });
        }
      }
      t.update(dt);
    }
  }
}
