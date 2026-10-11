/* ──────────────────────────────────────────────────────────────────────────
   GALACTIC LEGENDS — CHARACTER SPRITE KIT

   A drop-in replacement for the plain circle/hex in Character.draw().
   See HANDOFF.md for the exact patch (line numbers, old and new code).

   Load it before game.js:
     <script src="sprite-kit.js"></script>

   Then in Character.draw(), where the circle/hex is drawn:

       SpriteKit.drawFighter(ctx, {
         x: this.x, y: this.y,
         angle: this.lastAimAngle || 0,
         color: this.color,
         kit: SpriteKit.kitFor(this),
         weapon: this.weapon,
         weaponConfig: this.weaponConfig,
         weaponColor: this.weaponConfig.melee ? this.saberColor
                                              : this.weaponConfig.color,
         reach: this.weaponConfig.reach || 0,
         bladeless: true,          // game.js draws the beam + its trail
         state: SpriteKit.stateFor(this, frameNow),
         t: frameNow
       });

   What it guarantees:
   • CHARACTER_SIZE (18) is still the silhouette — no hitbox, collision or
     arena-spacing change anywhere.
   • One roster `color` tints everything; no new per-character colour data.
   • Three tiers, front-weighted in value (dark rear yoke → light forward
     collar → lightest head at the leading edge), which is what makes facing
     legible at 36px.
   • Gear is four slots (body/helmet/shoulder/back). KIT_PRESETS names 29
     fighters; kitFor() falls back to isClone/isDroid/isWookiee/weapon, so
     the whole cast upgrades with zero data entry. A `kit` field on a roster
     entry beats both.
   • EVERY WEAPON_LIBRARY key has its own silhouette. 15 hold poses decide how
     a weapon is carried; WEAPON_SPECS decides what the hands are holding —
     barrel, bore, magazine, scope, muzzle, blade length, guard. An unknown key
     falls back on its config (melee → blade, else rifle) with a default spec. Fists and claws are their own
     poses because neither detaches — no hilt, no grip, both hands forward.
   • Procedural canvas only: no images, no atlas, no loader, no async.

   Leaves untouched: saber beams and trails, the Sith aura, Guardian skin
   aura, burn tongues, stun/choke rings, the commander pip, the hit flash and
   the nameplate. They all still draw around the sprite as they do now.
   ────────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  const R0 = 18;                      // CHARACTER_SIZE — the contract
  const TAU = Math.PI * 2;
  const cl = (v, a, b) => Math.max(a, Math.min(b, v));

  /* ── colour ramp from one roster hex ───────────────────────────────────
     Roster colours run from #111111 (Dark Trooper) to #ffff00 (327th), so
     the ramp clamps lightness before deriving: without the floor a
     near-black fighter loses every layer into one flat silhouette, and
     without the ceiling a yellow one loses its highlights. */
  function parseHex(hex) {
    let h = String(hex || '#888888').replace('#', '').trim();
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    if (!/^[0-9a-f]{6}$/i.test(h)) h = '888888';
    const n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function rgb2hsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    let h = 0, s = 0; const l = (mx + mn) / 2;
    if (d) {
      s = d / (1 - Math.abs(2 * l - 1));
      if (mx === r) h = ((g - b) / d) % 6;
      else if (mx === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60; if (h < 0) h += 360;
    }
    return [h, s, l];
  }
  const rampCache = new Map();
  function C(hex) {
    const key = hex || '#888888';
    const hit = rampCache.get(key);
    if (hit) return hit;
    const [r, g, b] = parseHex(key);
    const hsl = rgb2hsl(r, g, b);
    const h = Math.round(hsl[0]);
    const s = hsl[1];
    const l = cl(hsl[2], 0.24, 0.78);
    const f = (dl, ds, a) =>
      'hsla(' + h + ',' + Math.round(cl(s * (ds === undefined ? 1 : ds), 0, 1) * 100) + '%,' +
      Math.round(cl(l + dl, 0.05, 0.97) * 100) + '%,' + (a === undefined ? 1 : a) + ')';
    const out = {
      h: h, s: s, l: l,
      hi:   f(+0.26, 0.70),
      lit:  f(+0.13, 0.88),
      base: f(0, 1),
      mid:  f(-0.07, 1.02),
      dark: f(-0.17, 1.06),
      deep: f(-0.27, 1.10),
      ink:  f(-0.40, 0.85),
      glow: f(+0.28, 1.15)
    };
    rampCache.set(key, out);
    return out;
  }

  /* ── weapon families ──────────────────────────────────────────────────
     Every WEAPON_LIBRARY key in the game today, sorted by how it is HELD
     rather than by what it does. A key that is missing here falls back on
     its shape: melee → blade, otherwise → rifle. */
  const FAMILY_MEMBERS = {
    rifle:  ['blaster', 'bowcaster', 'minigun', 'sniper', 'beam', 'assaultrifle',
             'submachine', 'warforgedar', 'enhancedar', 'deadeyear', 'excaliber',
             'boomsniper', 'burstrifle', 'iocannon', 'voidlance', 'guards',
             'lasercannon', 'destroyergun', 'zeroenergy'],
    pistol: ['lancehead', 'zap', 'computer', 'cubebolt', 'glock', 'sonictaser', 'hydrapistol'],
    blade:  ['lightsaber', 'darksaber', 'vibroblade', 'seekerssword', 'minersword', 'wrench',
             'laevateinn', 'scimitar', 'icedagger', 'katanas'],
    // Neither of these is an object the fighter holds — they are on the ends
    // of the arms and cannot be thrown (both are noThrow in WEAPON_LIBRARY),
    // so they get hands-forward poses with no hilt and no grip.
    fists:  ['gammafists', 'thingfists', 'grootfists', 'mongerfists', 'abomfists',
             'gauntletfists', 'antmanfists', 'antbite'],
    claws:  ['claws', 'pantherclaws'],
    // Marvel-specific holds. Each is here because the generic rifle pose was
    // actively wrong for it, not merely unflattering.
    repulsor: ['repulsor', 'iceblast'],   // palm-mounted; iceblast throws off the ring hand
    webshooter: ['webshooter'],   // wrist unit, two fingers curled in
    shield: ['shield'],           // a disc on the forearm, not a held object
    bow:    ['bow'],              // drawn stave across the aim line
    hammer: ['mjolnir', 'stormbreaker'],  // hafted, returnable, draw: 'wrench'
    dual:   ['dualglocks', 'quadblaster'],   // one pistol per hand
    spit:   ['poisonspit'],       // no object at all
    // The Reality Staff fires rather than swings, but it is held the same
    // way; without this it falls back to the rifle pose and reads as a gun.
    staff:  ['staff', 'realitystaff'],
    spread: ['focusshotgun', 'flamethrower'],
    caster: ['lightning', 'spindash'],
    none:   ['unarmed']
  };
  const FAMILY_OF = {};
  Object.keys(FAMILY_MEMBERS).forEach(fam => {
    FAMILY_MEMBERS[fam].forEach(k => { FAMILY_OF[k] = fam; });
  });
  // Blades that are metal rather than plasma — a solid edge, not a beam.
  const SOLID_BLADES = { wrench: 1, vibroblade: 1, seekerssword: 1, minersword: 1, scimitar: 1,
                       icedagger: 1, katanas: 1 };
  // Poses whose painter places its own hands, so the generic hand pass is skipped.
  const SELF_HANDED = { fists: 1, claws: 1, repulsor: 1, webshooter: 1,
                        shield: 1, dual: 1, spit: 1 };

  /* ── per-weapon hardware specs ─────────────────────────────────────────
     The FAMILY decides how a weapon is HELD. This table decides what the
     hands are actually holding, so every WEAPON_LIBRARY key reads differently
     at a glance without 50-odd hand-written painters.

     Rifle-ish:  st stock · rc receiver · bl barrel · bw bore · bar barrels
                 mg magazine (0 none · 1 box · 2 long · 3 drum · 4 twin)
                 sc scope (0 none · 1 low · 2 tall)
                 mz muzzle (0 none · 1 brake · 2 flare · 3 cone · 4 prongs)
                 lm crossbow limbs · tank fuel bottle
     Blade-ish:  bl length · bw width · gd guard (0 emitter · 1 bar · 2 cross)
                 cv curve · sol solid metal rather than plasma · fork jaws
     Pistol-ish: sl slide · bl barrel · mg magazine · emit rings · slab datapad
     Numbers track each weapon's real role — damage, cooldown and the
     WEAPON_LIBRARY `length` — so the biggest gun on screen is the biggest
     gun in the table. */
  const WEAPON_SPECS = {
    // rifles — the workhorses
    blaster:      { st: 12, rc: 14, bl: 8,  bw: 3.8, mg: 1, sc: 0, mz: 1 },
    submachine:   { st: 8,  rc: 12, bl: 5,  bw: 3.4, mg: 2, sc: 0, mz: 0 },
    assaultrifle: { st: 13, rc: 15, bl: 9,  bw: 4,   mg: 1, sc: 1, mz: 1 },
    warforgedar:  { st: 13, rc: 17, bl: 9,  bw: 4.4, mg: 2, sc: 1, mz: 1 },
    enhancedar:   { st: 13, rc: 16, bl: 10, bw: 4,   mg: 1, sc: 2, mz: 1 },
    deadeyear:    { st: 12, rc: 15, bl: 12, bw: 3.4, mg: 1, sc: 2, mz: 1 },
    burstrifle:   { st: 11, rc: 14, bl: 9,  bw: 3.6, mg: 1, sc: 1, mz: 4, bar: 3 },
    minigun:      { st: 10, rc: 18, bl: 11, bw: 6.5, mg: 3, sc: 0, mz: 0, bar: 4 },
    // rifles — the long shots
    sniper:       { st: 14, rc: 16, bl: 15, bw: 3.4, mg: 1, sc: 2, mz: 1 },
    boomsniper:   { st: 14, rc: 17, bl: 14, bw: 4.6, mg: 1, sc: 2, mz: 2 },
    excaliber:    { st: 15, rc: 19, bl: 19, bw: 4.2, mg: 1, sc: 2, mz: 1 },
    // rifles — the energy weapons
    beam:         { st: 10, rc: 16, bl: 7,  bw: 5,   mg: 0, sc: 0, mz: 3 },
    lasercannon:  { st: 11, rc: 18, bl: 9,  bw: 6.5, mg: 0, sc: 1, mz: 3 },
    destroyergun: { st: 12, rc: 20, bl: 10, bw: 7.5, mg: 0, sc: 1, mz: 3 },
    iocannon:     { st: 11, rc: 18, bl: 9,  bw: 6,   mg: 0, sc: 1, mz: 3 },
    voidlance:    { st: 12, rc: 16, bl: 14, bw: 4,   mg: 0, sc: 2, mz: 3 },
    guards:       { st: 10, rc: 13, bl: 7,  bw: 3.2, mg: 4, sc: 0, mz: 0, bar: 2 },
    bowcaster:    { st: 12, rc: 14, bl: 7,  bw: 4,   mg: 0, sc: 0, mz: 0, lm: 14 },
    // pistols
    lancehead:    { sl: 13, bl: 7, mg: 1 },
    glock:        { sl: 12, bl: 5, mg: 1 },
    zap:          { sl: 11, bl: 8, mg: 0, emit: 1 },
    sonictaser:   { sl: 12, bl: 6, mg: 0, emit: 2 },
    hydrapistol:  { sl: 13, bl: 6, mg: 0, emit: 1 },   // Tesseract coil where the muzzle would be
    zeroenergy:   { sl: 12, bl: 7, mg: 0, emit: 3 },
    computer:     { sl: 14, bl: 3, mg: 0, slab: 1 },
    cubebolt:     { sl: 11, bl: 6, mg: 0, cube: 1 },
    // blades
    lightsaber:   { bl: 38, bw: 7,   gd: 0 },
    darksaber:    { bl: 36, bw: 8.5, gd: 1, cv: 1 },
    laevateinn:   { bl: 32, bw: 6,   gd: 1 },
    // Short and broad — a shard held in the fist, not a duellist's blade.
    icedagger:    { bl: 20, bw: 7,   gd: 0, sol: 1 },
    vibroblade:   { bl: 30, bw: 6,   gd: 0, sol: 1 },
    seekerssword: { bl: 34, bw: 7,   gd: 2, sol: 1 },
    minersword:   { bl: 28, bw: 7.5, gd: 1, sol: 1 },
    scimitar:     { bl: 38, bw: 8,   gd: 1, sol: 1, cv: 2 },
    // Deadpool's pair. `twin` paints a second hilt in the off hand and
    // moves the grips apart; game.js draws the two beams to match.
    katanas:      { bl: 34, bw: 5.5, gd: 1, sol: 1, cv: 1, twin: 1 },
    wrench:       { bl: 18, bw: 9,   gd: 0, sol: 1, fork: 1 },
    // spread
    focusshotgun: { st: 12, rc: 13, bl: 9, bw: 3.2, bar: 3 },
    flamethrower: { st: 11, rc: 15, bl: 7, bw: 5.5, bar: 1, tank: 1 },
    // poses with their own painter — the spec only tunes their scale
    repulsor:     { pad: 1 },
    iceblast:     { pad: 1, frost: 1 },
    webshooter:   { pad: 1 },
    shield:       { r: 12.5 },
    bow:          { r: 15 },
    mjolnir:      { haft: 22, head: 15 },
    stormbreaker: { haft: 26, head: 18, axe: 1 },
    dualglocks:   { sl: 12, bl: 5 },
    // Star-Lord's pair. Longer slide and barrel than the Glocks they share the
    // two-handed pose with, so the silhouette reads as element guns rather than
    // as sidearms — they are the loudest thing he owns and should look it.
    quadblaster:  { sl: 14, bl: 8 },
    poisonspit:   { pad: 1 },
    staff:        { len: 27 },
    lightning:    { pad: 1 },
    spindash:     { pad: 1 },
    gammafists:   { fist: 13 },
    thingfists:   { fist: 14, rock: 1 },
    abomfists:    { fist: 13.5 },
    mongerfists:  { fist: 14, plate: 1 },
    grootfists:   { fist: 11, bark: 1 },
    // Thanos. One bare fist and one gold glove with the stones set across
    // the knuckles, the silhouette anyone would draw him by.
    gauntletfists: { fist: 14, gauntlet: 1 },
    claws:        { cl: 17 },
    pantherclaws: { cl: 14, count: 4 },
    unarmed:      {}
  };
  const RIFLE_FALLBACK = { st: 12, rc: 15, bl: 9, bw: 4, mg: 1, sc: 1, mz: 1 };
  /** Hardware spec for a weapon key, resolving forged keys via baseKey. */
  function specFor(key, cfg) {
    return WEAPON_SPECS[(cfg && cfg.baseKey) || key] || RIFLE_FALLBACK;
  }

  /** Resolve a weapon key (including a forged 'forged:<id>' key via baseKey)
   *  to its pose family. */
  function familyOf(key, cfg) {
    const base = (cfg && cfg.baseKey) || key;
    if (FAMILY_OF[base]) return FAMILY_OF[base];
    if (cfg && cfg.melee) return 'blade';
    if (cfg && cfg.draw === 'none') return 'none';
    return 'rifle';
  }

  /* ── kit slots ─────────────────────────────────────────────────────────
     body:     organic | armor | robe | fur | droid | mech
     helmet:   none | trooper | hood | dome | horned | mask | antenna
     shoulder: none | pauldron | heavy | spike
     back:     none | cape | pack | jetpack  */
  const DEFAULT_KIT = { body: 'organic', helmet: 'none', shoulder: 'none', back: 'none' };

  /* Per-character kits for fighters whose silhouette should not be the
     generic one their flags produce. Structural gear only — helmet type,
     shoulder weight, what is on their back — so each is an original shape
     built from the same four slots, not a traced likeness. Ids are the
     roster ids in game.js; anything not listed falls through to kitFor()'s
     flag rules below, and a `kit` field on the entry beats both. */
  const KIT_PRESETS = {
    // Grand Army — commanders read heavier than line troopers
    rex:        { body: 'armor', helmet: 'trooper', shoulder: 'heavy',    back: 'pack' },
    cody:       { body: 'armor', helmet: 'trooper', shoulder: 'heavy',    back: 'pack' },
    wolffe:     { body: 'armor', helmet: 'trooper', shoulder: 'heavy',    back: 'pack' },
    fives:      { body: 'armor', helmet: 'trooper', shoulder: 'pauldron', back: 'jetpack' },
    hardcase:   { body: 'armor', helmet: 'mask',    shoulder: 'heavy',    back: 'pack' },
    thorn:      { body: 'armor', helmet: 'mask',    shoulder: 'heavy',    back: 'pack' },
    fox_elite:  { body: 'armor', helmet: 'trooper', shoulder: 'heavy',    back: 'jetpack' },
    // Machines — the droid body, told apart by what is on top of it
    r2d2:       { body: 'droid', helmet: 'dome',    shoulder: 'none',     back: 'none' },
    c3po:       { body: 'mech',  helmet: 'dome',    shoulder: 'none',     back: 'none' },
    bb8:        { body: 'droid', helmet: 'dome',    shoulder: 'none',     back: 'none' },
    k2so:       { body: 'mech',  helmet: 'mask',    shoulder: 'pauldron', back: 'none' },
    ig11:       { body: 'droid', helmet: 'antenna', shoulder: 'none',     back: 'none' },
    ig88:       { body: 'droid', helmet: 'antenna', shoulder: 'pauldron', back: 'pack' },
    b1droid:    { body: 'droid', helmet: 'antenna', shoulder: 'none',     back: 'none' },
    superdroid: { body: 'mech',  helmet: 'mask',    shoulder: 'heavy',    back: 'none' },
    droideka:   { body: 'droid', helmet: 'dome',    shoulder: 'spike',    back: 'none' },
    magnaguard: { body: 'mech',  helmet: 'mask',    shoulder: 'spike',    back: 'cape' },
    bxcommando: { body: 'droid', helmet: 'mask',    shoulder: 'none',     back: 'pack' },
    darktrooper:{ body: 'mech',  helmet: 'horned',  shoulder: 'heavy',    back: 'jetpack' },
    hk47:       { body: 'droid', helmet: 'mask',    shoulder: 'pauldron', back: 'none' },
    '4lom':     { body: 'mech',  helmet: 'dome',    shoulder: 'none',     back: 'none' },
    sith_c3po:  { body: 'mech',  helmet: 'horned',  shoulder: 'spike',    back: 'cape' },
    // Wookiees
    chewie:     { body: 'fur',   helmet: 'none',    shoulder: 'none',     back: 'pack' },
    tarfful:    { body: 'fur',   helmet: 'none',    shoulder: 'heavy',    back: 'pack' },
    // Robed and hooded
    charred_anakin:    { body: 'robe', helmet: 'mask',   shoulder: 'heavy', back: 'cape' },
    senator_palpatine: { body: 'robe', helmet: 'none',   shoulder: 'none',  back: 'cape' },
    ultimate_palp:     { body: 'robe', helmet: 'hood',   shoulder: 'none',  back: 'cape' },
    // Marvel — ids confirmed against the roster in game.js
    ironman:    { body: 'mech',    helmet: 'mask',   shoulder: 'pauldron', back: 'jetpack' },
    spiderman:  { body: 'organic', helmet: 'mask',   shoulder: 'none',  back: 'none' },
    thor:       { body: 'armor',   helmet: 'none',   shoulder: 'heavy', back: 'cape' },
    loki:       { body: 'robe',    helmet: 'horned', shoulder: 'none',  back: 'cape' },
    cap:        { body: 'armor',   helmet: 'mask',   shoulder: 'pauldron', back: 'none' },
    hawkeye:    { body: 'organic', helmet: 'none',   shoulder: 'pauldron', back: 'pack' },
    groot:      { body: 'fur',     helmet: 'none',   shoulder: 'heavy', back: 'none' },
    // Brawlers — the weapon is the arms, so the shoulders carry the read
    venom:      { body: 'organic', helmet: 'none',   shoulder: 'spike', back: 'none' },
    hulk:       { body: 'organic', helmet: 'none',   shoulder: 'heavy', back: 'none' },
    thanos:     { body: 'armor',   helmet: 'none',   shoulder: 'heavy', back: 'none' },
    eternity:   { body: 'robe',    helmet: 'none',   shoulder: 'none',  back: 'cape' },
    antman:     { body: 'armor',   helmet: 'mask',   shoulder: 'none',  back: 'pack' },
    // Full mask, and the pack is where the two scabbards ride. A preset rather
    // than the flag rules because those key off the weapon, and his changes.
    deadpool:   { body: 'organic', helmet: 'mask',   shoulder: 'none',  back: 'pack' },
    // Not a roster id: the ants Ant-Man calls (characterId 'ant'). The
    // antenna helmet the droids wear is the nearest thing to feelers.
    ant:        { body: 'organic', helmet: 'antenna', shoulder: 'none', back: 'none' },
    // Oddities
    jabba:       { body: 'organic', helmet: 'none', shoulder: 'heavy', back: 'none' },
    cousin_crew: { body: 'mech',    helmet: 'dome', shoulder: 'heavy', back: 'jetpack' }
  };

  /** Derive a kit from the flags a roster entry already carries, so the
   *  whole cast upgrades with no new data. Refine individuals by adding a
   *  `kit` field to their roster entry — kitFor() prefers it. */
  function kitFor(e) {
    if (!e) return DEFAULT_KIT;
    if (e.kit) return Object.assign({}, DEFAULT_KIT, e.kit);
    const preset = KIT_PRESETS[e.characterId || e.id];
    if (preset) return preset;
    const fam = familyOf(e.weapon || 'blaster', e.weaponConfig);
    if (e.isDroid) return { body: 'droid', helmet: 'dome', shoulder: 'none', back: 'none' };
    if (e.isWookiee) return { body: 'fur', helmet: 'none', shoulder: 'none', back: 'pack' };
    if (e.isClone) return { body: 'armor', helmet: 'trooper', shoulder: 'pauldron', back: 'pack' };
    if (fam === 'fists' || fam === 'claws' || fam === 'spit') {
      return { body: 'organic', helmet: 'none', shoulder: 'heavy', back: 'none' };
    }
    if (fam === 'repulsor') return { body: 'mech', helmet: 'mask', shoulder: 'pauldron', back: 'jetpack' };
    if (fam === 'webshooter') return { body: 'organic', helmet: 'mask', shoulder: 'none', back: 'none' };
    if (fam === 'shield') return { body: 'armor', helmet: 'mask', shoulder: 'pauldron', back: 'none' };
    if (fam === 'bow') return { body: 'organic', helmet: 'none', shoulder: 'pauldron', back: 'pack' };
    if (fam === 'hammer') return { body: 'armor', helmet: 'none', shoulder: 'heavy', back: 'cape' };
    if (fam === 'dual') return { body: 'organic', helmet: 'none', shoulder: 'none', back: 'none' };
    if (fam === 'blade' || fam === 'caster') {
      return { body: 'robe', helmet: 'hood', shoulder: 'none', back: 'cape' };
    }
    if (fam === 'staff') return { body: 'armor', helmet: 'mask', shoulder: 'spike', back: 'none' };
    return { body: 'armor', helmet: 'mask', shoulder: 'pauldron', back: 'jetpack' };
  }

  /* ── primitives ───────────────────────────────────────────────────────── */
  const ST = { d: '#161b21', m: '#39424d', l: '#586371', hi: '#7c8896' };

  function rr(ctx, x, y, w, h, r, fill, stroke, lw) {
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
    else ctx.rect(x, y, w, h);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 1; ctx.stroke(); }
  }
  function dot(ctx, x, y, r, fill) {
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fillStyle = fill; ctx.fill();
  }
  function seg(ctx, x1, y1, x2, y2) {
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  }
  function glowDot(ctx, x, y, r, col) {
    ctx.save();
    ctx.shadowBlur = 12; ctx.shadowColor = col;
    dot(ctx, x, y, r, col);
    dot(ctx, x, y, r * 0.45, '#ffffff');
    ctx.restore();
  }
  function polyPath(ctx, n, r, rot) {
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const a = (TAU / n) * i + rot;
      const px = Math.cos(a) * r, py = Math.sin(a) * r;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
  }

  /* Melee arc: wind up back, fast cut through, slow recover. Matches the
     commitment the hitbox already has (pendingSwingAt in game.js). */
  function swingCurve(p) {
    if (p < 0.30) return -0.55 * (p / 0.30);
    if (p < 0.48) return -0.55 + ((p - 0.30) / 0.18) * 1.80;
    if (p < 0.72) return 1.25 - ((p - 0.48) / 0.24) * 1.25;
    return 0;
  }

  function muzzleFlash(ctx, x, y, col, size) {
    ctx.save();
    ctx.translate(x, y);
    ctx.shadowBlur = 18; ctx.shadowColor = col;
    ctx.fillStyle = col; ctx.globalAlpha = 0.92;
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (TAU / 8) * i;
      const r = i % 2 ? size * 0.34 : size;
      const px = Math.cos(a) * r * (i % 4 === 0 ? 1.3 : 1);
      const py = Math.sin(a) * r * 0.72;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath(); ctx.fill();
    dot(ctx, 0, 0, size * 0.36, '#ffffff');
    ctx.globalAlpha = 0.32; ctx.lineWidth = 1.4; ctx.strokeStyle = col;
    ctx.beginPath(); ctx.arc(0, 0, size * 1.35, 0, TAU); ctx.stroke();
    ctx.restore();
  }

  /* ── weapon painters ───────────────────────────────────────────────────
     Local space: +X is forward, origin is the body centre. Each returns the
     two grip points the hands take, so the arms are posed by the weapon
     rather than by a table that has to be kept in step with it. */
  function paintRifle(ctx, wcol, flash, p) {
    const y = -8.5;
    const recEnd = -6 + p.st + p.rc * 0.42;
    if (p.lm) {                                                    // crossbow limbs
      ctx.save();
      ctx.strokeStyle = ST.m; ctx.lineWidth = 3.2; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(recEnd - 2, y, p.lm, -1.2, 1.2); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 1;
      seg(ctx, recEnd + 3, y - p.lm * 0.93, recEnd - 5, y);
      seg(ctx, recEnd + 3, y + p.lm * 0.93, recEnd - 5, y);
      ctx.restore();
    }
    rr(ctx, -6, y - 3.2, p.st, 6.4, 2.2, ST.m, ST.d, 1.2);                // stock
    rr(ctx, -6 + p.st * 0.9, y - 4.2, p.rc, 8.4, 2.6, ST.l, ST.d, 1.2);   // receiver
    if (p.sc) {                                                           // sight
      const sh = p.sc === 2 ? 3.6 : 2.6, sl = p.sc === 2 ? 9 : 5.5;
      rr(ctx, -2 + p.st * 0.9, y - 4.2 - sh, sl, sh + 0.6, 1.3, ST.d);
      if (p.sc === 2) dot(ctx, -2 + p.st * 0.9 + sl, y - 4.2 - sh * 0.5, 1.5, wcol);
    }
    if (p.mg === 1) rr(ctx, -1 + p.st, y + 3.4, 5.5, 8, 1.8, ST.m, ST.d, 1);
    if (p.mg === 2) rr(ctx, -1 + p.st, y + 3.4, 5.5, 12, 1.8, ST.m, ST.d, 1);
    if (p.mg === 3) {                                                     // drum
      dot(ctx, 2 + p.st, y + 7, 6.5, ST.m);
      ctx.strokeStyle = ST.d; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(2 + p.st, y + 7, 6.5, 0, TAU); ctx.stroke();
    }
    if (p.mg === 4) {                                                     // twin cells
      rr(ctx, -1 + p.st, y + 3.2, 4, 7, 1.6, ST.m, ST.d, 1);
      rr(ctx, 4 + p.st, y + 3.2, 4, 7, 1.6, ST.m, ST.d, 1);
    }
    const bars = p.bar || 1;
    for (let i = 0; i < bars; i++) {
      const off = bars === 1 ? 0 : (i - (bars - 1) / 2) * (p.bw * 0.62);
      rr(ctx, recEnd, y + off - p.bw / 2, p.bl, p.bw, p.bw / 2, ST.m, ST.d, 1);
    }
    const mx = recEnd + p.bl;
    if (p.mz === 1) rr(ctx, mx, y - p.bw * 0.72, 3.2, p.bw * 1.44, 1.5, ST.hi, ST.d, 1);
    if (p.mz === 2) rr(ctx, mx, y - p.bw, 4, p.bw * 2, 1.8, ST.hi, ST.d, 1);
    if (p.mz === 3) {                                                     // energy cone
      ctx.beginPath();
      ctx.moveTo(mx, y - p.bw * 0.55); ctx.lineTo(mx + 6, y - p.bw * 1.15);
      ctx.lineTo(mx + 6, y + p.bw * 1.15); ctx.lineTo(mx, y + p.bw * 0.55);
      ctx.closePath(); ctx.fillStyle = ST.hi; ctx.fill();
      ctx.strokeStyle = ST.d; ctx.lineWidth = 1; ctx.stroke();
    }
    if (p.mz === 4) [-1, 1].forEach(sg =>                                 // prongs
      rr(ctx, mx, y + sg * p.bw * 0.7 - 1, 5, 2, 1, ST.hi));
    const tip = mx + (p.mz === 3 ? 7 : p.mz ? 4 : 1);
    glowDot(ctx, tip, y, 1.3 + p.bw * 0.14, wcol);
    if (flash) muzzleFlash(ctx, tip + 1.5, y, wcol, 6 + p.bw);
  }
  function paintPistol(ctx, wcol, flash, p) {
    const y = -9;
    rr(ctx, 5, y + 2, 5.5, p.mg ? 7.2 : 6, 1.8, ST.m, ST.d, 1);           // grip
    if (p.slab) {                                                         // datapad
      rr(ctx, 1, y - 5, p.sl, 10, 2, ST.l, ST.d, 1.3);
      rr(ctx, 3.5, y - 3, p.sl - 5, 6, 1, wcol);
    } else {
      rr(ctx, 3, y - 3.4, p.sl, 6.8, 2.2, ST.l, ST.d, 1.2);               // slide
    }
    const bx = 3 + p.sl;
    if (p.cube) {
      rr(ctx, bx - 1, y - 3.4, 6.8, 6.8, 1.4, ST.hi, ST.d, 1);
    } else if (p.emit) {                                                  // emitter rings
      ctx.save();
      ctx.strokeStyle = wcol; ctx.lineWidth = 1.7; ctx.lineCap = 'round';
      ctx.shadowBlur = 9; ctx.shadowColor = wcol;
      for (let i = 0; i < p.emit; i++) {
        ctx.beginPath(); ctx.arc(bx - 1, y, 3 + i * 2.4, -0.95, 0.95); ctx.stroke();
      }
      ctx.restore();
    } else {
      rr(ctx, bx, y - 1.9, p.bl, 3.8, 1.9, ST.m, ST.d, 1);                // barrel
    }
    const tip = bx + (p.emit ? 3 + p.emit * 2.4 : p.cube ? 7 : p.bl + 1);
    glowDot(ctx, tip, y, 1.5, wcol);
    if (flash) muzzleFlash(ctx, tip + 1, y, wcol, 6.5);
  }
  function paintSpread(ctx, wcol, flash, p) {
    const y = -8.5;
    rr(ctx, -6, y - 3.4, p.st, 6.8, 2.4, ST.m, ST.d, 1.2);                // stock
    rr(ctx, -6 + p.st * 0.9, y - 5.8, p.rc, 11.6, 3, ST.l, ST.d, 1.2);    // body
    if (p.tank) {                                                         // fuel bottle
      dot(ctx, -9, y + 3, 5.5, ST.m);
      ctx.strokeStyle = ST.d; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(-9, y + 3, 5.5, 0, TAU); ctx.stroke();
    }
    const bx = -6 + p.st + p.rc * 0.5, n = p.bar || 3;
    for (let i = 0; i < n; i++) {
      const off = n === 1 ? 0 : (i - (n - 1) / 2) * 4.2;
      rr(ctx, bx, y + off - p.bw / 2, p.bl, p.bw, p.bw / 2, ST.m, ST.d, 1);
    }
    const tip = bx + p.bl + 1;
    glowDot(ctx, tip, y, 2, wcol);
    if (flash) for (let i = 0; i < n; i++) {
      const off = n === 1 ? 0 : (i - (n - 1) / 2) * 4.2;
      muzzleFlash(ctx, tip, y + off, wcol, 6.5);
    }
  }
  function paintStaff(ctx, wcol) {
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = ST.d; ctx.lineWidth = 7.5; seg(ctx, -22, 7, 27, -7);
    ctx.strokeStyle = ST.m; ctx.lineWidth = 5; seg(ctx, -22, 7, 27, -7);
    ctx.strokeStyle = ST.l; ctx.lineWidth = 2; seg(ctx, -22, 7, 27, -7);
    ctx.restore();
    ctx.save(); ctx.translate(4, -1.2); ctx.rotate(-0.29);
    rr(ctx, -5, -3.5, 11, 7, 2.5, ST.hi, ST.d, 1);
    ctx.restore();
    glowDot(ctx, 27, -7, 2.8, wcol);
    glowDot(ctx, -22, 7, 2.2, wcol);
    return [[15, -3], [1, 0.5]];
  }
  function paintBlade(ctx, wcol, reach, solid, bladeless, p) {
    rr(ctx, 2, -3.6, 5, 7.2, 1.8, ST.d);                                  // pommel
    rr(ctx, 6, -3.2, 14, 6.4, 2.2, ST.l, ST.d, 1.2);                      // hilt
    if (p.gd === 2) {                                                     // crossguard
      rr(ctx, 19, -7.5, 3.6, 15, 1.6, ST.hi, ST.d, 1);
      rr(ctx, 17, -2, 6, 4, 1.4, ST.l, ST.d, 1);
    } else if (p.gd === 1) {
      rr(ctx, 19, -4.6, 4, 9.2, 1.6, ST.hi, ST.d, 1);                     // bar guard
    } else {
      rr(ctx, 19, -4, 3.4, 8, 1.5, ST.hi, ST.d, 1);                       // emitter
    }
    // The host already draws the beam (and its trail) from the body centre.
    if (bladeless) return;
    const bx = 23, len = Math.max(18, p.bl || reach || 30), bw = (p.bw || 7) / 2;
    if (p.fork) {                                                         // wrench jaws
      rr(ctx, bx, -bw - 1, len * 0.62, bw * 2 + 2, 2, wcol, ST.d, 1);
      [-1, 1].forEach(sg =>
        rr(ctx, bx + len * 0.55, sg * bw - 1.4, len * 0.45, 2.8, 1.2, wcol, ST.d, 1));
      return;
    }
    if (solid || p.sol) {
      const cv = (p.cv || 0) * 2.4;
      ctx.beginPath();
      ctx.moveTo(bx, -bw);
      ctx.quadraticCurveTo(bx + len * 0.6, -bw - cv, bx + len, -cv * 0.4);
      ctx.lineTo(bx + len - 1, cv * 0.4);
      ctx.quadraticCurveTo(bx + len * 0.6, bw - cv, bx, bw);
      ctx.closePath();
      ctx.fillStyle = wcol; ctx.fill();
      ctx.strokeStyle = ST.d; ctx.lineWidth = 1; ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 1;
      seg(ctx, bx + 2, -1 - cv * 0.3, bx + len * 0.88, -0.6 - cv * 0.3);
      ctx.lineCap = 'butt';
    } else {
      ctx.save();
      ctx.lineCap = 'round';
      ctx.strokeStyle = wcol; ctx.lineWidth = bw * 2;
      ctx.shadowBlur = 24; ctx.shadowColor = wcol; ctx.globalAlpha = 0.62;
      seg(ctx, bx, 0, bx + len, 0);
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = bw * 0.7;
      ctx.shadowBlur = 8; ctx.shadowColor = '#ffffff'; ctx.globalAlpha = 0.95;
      seg(ctx, bx, 0, bx + len, 0);
      ctx.restore();
    }
  }
  function paintFists(ctx, wcol, p) {
    const R = (p && p.fist) || 13;
    [-1, 1].forEach(sgn => {
      ctx.save();
      ctx.translate(19, sgn * 9.5);
      ctx.rotate(sgn * 0.12);
      const g = ctx.createRadialGradient(-2, -2, 0.5, 0, 0, R * 0.7);
      g.addColorStop(0, ST.hi); g.addColorStop(0.6, ST.l); g.addColorStop(1, ST.m);
      rr(ctx, -R / 2, -R * 0.46, R, R * 0.92, R * 0.34, g, ST.d, 1.5);    // the fist
      ctx.strokeStyle = ST.d; ctx.lineWidth = 1.1;                        // knuckles
      [-2.4, 0.6, 3.6].forEach(kx => seg(ctx, kx, -R * 0.31, kx, R * 0.31));
      if (p && p.rock) {                                                  // craggy
        ctx.strokeStyle = ST.d; ctx.lineWidth = 1;
        [[-4, -4], [1, -1], [-2, 3]].forEach(c => {
          ctx.beginPath(); ctx.arc(c[0], c[1], 2.2, 0, TAU); ctx.stroke();
        });
      }
      if (p && p.plate) rr(ctx, -R / 2 + 1, -R * 0.46 + 1, R - 2, 3, 1, ST.hi);
      if (p && p.bark) {                                                  // grain
        ctx.strokeStyle = ST.d; ctx.lineWidth = 1.1;
        [-3, 0, 3].forEach(gy => seg(ctx, -R / 2 + 1, gy, R / 2 - 1, gy));
      }
      if (p && p.gauntlet && sgn > 0) {                                   // the Gauntlet
        // One hand only, so the pair reads as a glove and a fist rather
        // than as two gold lumps. Gold over the steel shading, then the six
        // stones: five across the knuckles and the Soul Stone on the back.
        const gg = ctx.createRadialGradient(-2, -2, 0.5, 0, 0, R * 0.7);
        gg.addColorStop(0, '#fff1b8'); gg.addColorStop(0.55, '#e3b341'); gg.addColorStop(1, '#8a6414');
        rr(ctx, -R / 2, -R * 0.46, R, R * 0.92, R * 0.34, gg, '#5a3f0a', 1.5);
        ['#3b6cff', '#ff3b3b', '#b04dff', '#3bd16f', '#ffd23b'].forEach((c, i) => {
          dot(ctx, R * 0.28, -R * 0.36 + i * R * 0.18, 1.3, c);
        });
        dot(ctx, -R * 0.1, 0, 1.9, '#ff8a1f');
      }
      rr(ctx, -R * 0.73, -R * 0.35, 4, R * 0.7, 2, ST.m, ST.d, 1.2);      // wrist
      ctx.restore();
    });
    if (wcol) {
      ctx.save(); ctx.globalAlpha = 0.5; ctx.shadowBlur = 12; ctx.shadowColor = wcol;
      [-9.5, 9.5].forEach(fy => dot(ctx, 19 + R * 0.42, fy, 2.4, wcol));
      ctx.restore();
    }
  }
  function paintClaws(ctx, wcol, p) {
    const CL = (p && p.cl) || 17, CN = (p && p.count) || 3;
    [-1, 1].forEach(sgn => {
      ctx.save();
      ctx.translate(15, sgn * 9);
      ctx.rotate(sgn * 0.1);
      rr(ctx, -5, -5, 10, 10, 3.5, ST.l, ST.d, 1.4);                      // housing
      rr(ctx, -8.5, -4, 4, 8, 1.8, ST.m, ST.d, 1.2);                      // wrist
      for (let i = 0; i < CN; i++) {
        const cy = (i - (CN - 1) / 2) * 3.4;
        const len = (i === Math.floor(CN / 2) && CN % 2) ? CL : CL * 0.84;
        ctx.beginPath();
        ctx.moveTo(4, cy - 1.7);
        ctx.lineTo(4 + len * 0.78, cy - 1.2);
        ctx.lineTo(4 + len, cy + sgn * 0.4);
        ctx.lineTo(4 + len * 0.78, cy + 1.2);
        ctx.lineTo(4, cy + 1.7);
        ctx.closePath();
        ctx.fillStyle = wcol; ctx.fill();
        ctx.strokeStyle = ST.d; ctx.lineWidth = 0.9; ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 0.9;
        seg(ctx, 5.5, cy - 0.5, 4 + len * 0.8, cy - 0.3);
      }
      ctx.restore();
    });
  }

  /* Iron Man. Palm discs in both gauntlets — the weapon is the suit, so the
     hands stay open and the glow does the talking. Fires in pairs, which is
     why both palms are live rather than one. */
  function paintRepulsor(ctx, wcol, hot, p) {
    [-1, 1].forEach(sgn => {
      ctx.save();
      ctx.translate(16, sgn * 9);
      ctx.rotate(sgn * 0.14);
      rr(ctx, -9, -4.6, 9, 9.2, 2.6, ST.m, ST.d, 1.3);       // forearm plate
      rr(ctx, -1, -5.4, 9, 10.8, 3.2, ST.l, ST.d, 1.4);      // gauntlet
      ctx.save();
      ctx.shadowBlur = hot ? 16 : 9; ctx.shadowColor = wcol;
      dot(ctx, 4.5, 0, 3.4, wcol);
      dot(ctx, 4.5, 0, hot ? 2.2 : 1.4, '#ffffff');
      if (p && p.frost) {                                    // frost spurs
        ctx.strokeStyle = wcol; ctx.lineWidth = 1.2;
        [-1, 0, 1].forEach(i =>
          seg(ctx, 4.5, 0, 4.5 + Math.cos(i * 0.8) * 8, Math.sin(i * 0.8) * 8));
      }
      ctx.restore();
      ctx.restore();
    });
  }

  /* Spider-Man. A wrist unit and two curled fingers — the pose has to read as
     a gesture, because the thing that fires is smaller than a knuckle. */
  function paintWebShooter(ctx, wcol, flash) {
    ctx.save();
    ctx.translate(13, -7.5);
    rr(ctx, -8, -4, 8, 8, 2.4, ST.m, ST.d, 1.3);             // wrist cuff
    dot(ctx, 3, 0, 4.4, ST.l);                               // hand
    ctx.strokeStyle = ST.d; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(3, 0, 4.4, 0, TAU); ctx.stroke();
    dot(ctx, 2, -3.2, 1.5, ST.d);                            // curled fingers
    dot(ctx, 2, 3.2, 1.5, ST.d);
    glowDot(ctx, 6.5, 0, 1.6, wcol);
    if (flash) {
      ctx.save();
      ctx.strokeStyle = wcol; ctx.lineWidth = 1.3; ctx.globalAlpha = 0.85;
      ctx.lineCap = 'round';
      [-0.16, 0, 0.16].forEach(a => {
        ctx.beginPath(); ctx.moveTo(8, 0);
        ctx.lineTo(8 + Math.cos(a) * 20, Math.sin(a) * 20);
        ctx.stroke();
      });
      ctx.restore();
    }
    ctx.restore();
    dot(ctx, 11, 8, 3.4, ST.d);                              // off-hand, low
  }

  /* Captain America. From above a raised shield is a foreshortened disc, so it
     is an ellipse rather than a circle — the rings are what make it read as a
     shield and not a plate. It deflects, so it sits proud of the silhouette. */
  function paintShield(ctx, wcol) {
    ctx.save();
    ctx.translate(15, -4);
    ctx.rotate(-0.16);
    [[12.5, 14.5, wcol], [9, 10.6, ST.d], [6, 7, wcol], [3, 3.5, ST.d]].forEach((r, i) => {
      ctx.beginPath(); ctx.ellipse(0, 0, r[0], r[1], 0, 0, TAU);
      ctx.fillStyle = r[2]; ctx.fill();
      if (i === 0) { ctx.strokeStyle = ST.d; ctx.lineWidth = 1.5; ctx.stroke(); }
    });
    ctx.beginPath();                                         // five-point star
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (TAU / 10) * i;
      const rad = i % 2 ? 1.5 : 3.4;
      const px = Math.cos(a) * rad * 0.85, py = Math.sin(a) * rad;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath(); ctx.fillStyle = '#ffffff'; ctx.fill();
    ctx.restore();
    dot(ctx, 9, 9, 3.6, ST.d);                               // bracing hand
  }

  /* Hawkeye. The stave crosses the aim line and the arrow runs along it — the
     draw depth is the read, so the string pulls back past the body. */
  function paintBow(ctx, wcol, drawn) {
    const pull = drawn ? -7 : -2;
    ctx.save();
    ctx.translate(14, -6);
    ctx.strokeStyle = ST.m; ctx.lineWidth = 3.4; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(-2, 0, 15, -1.15, 1.15); ctx.stroke();
    ctx.strokeStyle = wcol; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(-2, 0, 15, -1.15, 1.15); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1;  // string
    ctx.beginPath();
    ctx.moveTo(4, -13.8); ctx.lineTo(pull, 0); ctx.lineTo(4, 13.8); ctx.stroke();
    ctx.strokeStyle = ST.hi; ctx.lineWidth = 1.8;                  // arrow
    seg(ctx, pull, 0, 22, 0);
    ctx.fillStyle = ST.hi;
    ctx.beginPath();
    ctx.moveTo(26, 0); ctx.lineTo(21, -2.4); ctx.lineTo(21, 2.4);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  /* Mjølnir and Stormbreaker. Hafted and returnable, so the head is at the far
     end and the grip at the near one — the mass has to be visibly out front or
     the throw makes no sense. The axe flag swaps the head for a bit. */
  function paintHammer(ctx, wcol, axe) {
    ctx.save();
    ctx.translate(0, -6);
    ctx.rotate(-0.1);
    ctx.strokeStyle = ST.d; ctx.lineWidth = 6; ctx.lineCap = 'round';
    seg(ctx, -4, 6, 22, -3);
    ctx.strokeStyle = ST.m; ctx.lineWidth = 3.6;
    seg(ctx, -4, 6, 22, -3);
    rr(ctx, 1, 0.5, 10, 5.5, 2, ST.hi, ST.d, 1);              // leather grip
    ctx.save();
    ctx.translate(23, -3.5);
    ctx.rotate(-0.34);
    if (axe) {
      ctx.beginPath();                                        // axe bit
      ctx.moveTo(-3, -11); ctx.lineTo(7, -7);
      ctx.lineTo(8, 7); ctx.lineTo(-3, 11);
      ctx.closePath();
      ctx.fillStyle = ST.l; ctx.fill();
      ctx.strokeStyle = ST.d; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.strokeStyle = wcol; ctx.lineWidth = 2;
      seg(ctx, 6.5, -6.5, 7.5, 6.5);
    } else {
      rr(ctx, -7, -9.5, 15, 19, 2.5, ST.l, ST.d, 1.6);        // hammer head
      ctx.strokeStyle = ST.d; ctx.lineWidth = 1.2;
      seg(ctx, -7, -3.5, 8, -3.5); seg(ctx, -7, 3.5, 8, 3.5);
      rr(ctx, 4.5, -8, 3.5, 16, 1.4, ST.hi);                  // struck face
    }
    ctx.save(); ctx.globalAlpha = 0.6; ctx.shadowBlur = 14; ctx.shadowColor = wcol;
    ctx.strokeStyle = wcol; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(0, 0, 11, -1.3, 1.3); ctx.stroke();
    ctx.restore();
    ctx.restore();
    ctx.restore();
  }

  /* One pistol per hand, asymmetric on purpose — the whole point of the weapon
     is that there are two, so they cannot fire in lockstep. */
  function paintDual(ctx, wcol, flash) {
    [[-1, 0], [1, 0.9]].forEach(pair => {
      const sgn = pair[0], lag = pair[1];
      ctx.save();
      ctx.translate(9, sgn * 9);
      ctx.rotate(sgn * 0.2 - lag * 0.06);
      rr(ctx, 1, 1.8, 5, 6.6, 1.8, ST.m, ST.d, 1);            // grip
      rr(ctx, -1, -3.2, 12, 6.4, 2.2, ST.l, ST.d, 1.2);       // slide
      rr(ctx, 10, -1.8, 6, 3.6, 1.8, ST.m, ST.d, 1);          // barrel
      dot(ctx, 2, 0.5, 3.4, ST.d);                            // the hand on it
      glowDot(ctx, 17, 0, 1.5, wcol);
      if (flash && !lag) muzzleFlash(ctx, 18, 0, wcol, 6.5);
      ctx.restore();
    });
  }

  /* Abomination. No object at all — clenched hands, the jaw does the work. */
  function paintSpit(ctx, wcol, hot) {
    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.shadowBlur = hot ? 16 : 8; ctx.shadowColor = wcol;
    [[24, 0, 3.4], [19, -5, 2.2], [19, 5, 2.2], [29, -2.6, 1.8], [29, 2.6, 1.8]].forEach(d => {
      if (hot || d[2] > 2) dot(ctx, d[0], d[1], d[2] * (hot ? 1 : 0.6), wcol);
    });
    ctx.restore();
    [-1, 1].forEach(sgn => dot(ctx, 12, sgn * 10, 4, ST.d));  // clenched hands
  }

  function paintCaster(ctx, wcol, hot) {
    ctx.save();
    ctx.shadowBlur = 14; ctx.shadowColor = wcol;
    ctx.strokeStyle = wcol; ctx.lineCap = 'round'; ctx.globalAlpha = 0.9;
    [-8, 8].forEach((dy, i) => {
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.arc(17, dy, 6 + i * 1.2, -1.1, 1.1);
      ctx.stroke();
    });
    ctx.restore();
    if (hot) glowDot(ctx, 24, 0, 3.6, wcol);
    return [[14, -8], [14, 8]];
  }

  /* ── the sprite ───────────────────────────────────────────────────────
     Layer order is the whole trick. Back to front:
       shadow · back gear · feet · the ball · dark rear yoke ·
       light forward collar · shoulder pads · arms · weapon · hands · head
     The value goes darkest at the back and lightest at the leading edge, so
     which way a fighter is facing is legible at 36px without any outline
     work beyond the hairlines. */
  function drawFighter(ctx, o) {
    const x = o.x, y = o.y;
    const ang = o.angle || 0;
    const c = C(o.color);
    const kit = o.kit ? Object.assign({}, DEFAULT_KIT, o.kit) : DEFAULT_KIT;
    const wKey = o.weapon || 'blaster';
    const fam = o.family || familyOf(wKey, o.weaponConfig);
    const wcol = o.weaponColor || '#ffffff';
    const t = o.t || 0;
    const state = o.state || 'idle';
    const death = cl(o.death || 0, 0, 1);
    const alpha = (o.alpha === undefined ? 1 : o.alpha) * (1 - death * 0.85);
    if (alpha <= 0.01) return;

    const bulk = (kit.body === 'fur' || kit.body === 'mech') ? 1.1 : 1;
    const k = (o.scale || 1) * bulk;

    /* motion drivers — all time-seeded, no stored state per entity */
    let gait = 0, bob = 0, recoil = 0, swing = 0, roll = 0, stretch = 1;
    let lean = 0, armSwing = 0, kick = 0;
    if (state === 'walk' || state === 'dash') {
      const sp = state === 'dash' ? 0.026 : 0.0135;
      const ph = t * sp;
      gait = Math.sin(ph);
      // Two footfalls per stride, so the body drops on each contact rather
      // than once a cycle — this is what stops a walk reading as a float.
      bob = Math.abs(Math.sin(ph)) * 1.35 - 0.6;
      roll = gait * 0.055;
      armSwing = -gait * 2.1;            // arms counter the legs
      lean = state === 'dash' ? 0.1 : 0.03;
      if (state === 'dash') { stretch = 1.1; armSwing *= 0.4; }
    } else {
      bob = Math.sin(t * 0.0028) * 0.5;
      roll = Math.sin(t * 0.0021) * 0.018;
    }
    if (state === 'fire') {
      const p = o.phase === undefined ? (t % 240) / 240 : o.phase;
      // Sharp kick, exponential settle — a linear ramp reads as a slide.
      const e = Math.max(0, 1 - p * 3.2);
      recoil = e * e * 6.5;
      kick = -e * 0.13;                  // muzzle climbs, then settles back
      lean = -e * 0.045;
    }
    if (state === 'swing') {
      const p = o.phase === undefined ? (t % 560) / 560 : o.phase;
      swing = swingCurve(p);
      lean = swing * 0.055;              // shoulders follow the arc
    }

    /* ground shadow — screen space, so the light never spins with the aim */
    ctx.save();
    const lift = cl(bob, -1, 2);
    ctx.globalAlpha = alpha * (0.44 - lift * 0.045);
    ctx.fillStyle = '#000000';
    ctx.beginPath();
    ctx.ellipse(x + 2, y + 5.5 * k, (16.8 - lift * 0.5) * k, (10.6 - lift * 0.4) * k, 0, 0, TAU);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y - bob * k);
    // The tip accelerates — a body going down picks up speed.
    ctx.rotate(ang + roll + lean + death * death * 1.7);
    ctx.scale(k * stretch * (1 - death * 0.3), k * (1 - death * 0.3) * (1 + lean * 0.22));

    // world light sits up-left; counter-rotate it into local space
    const la = -(ang + roll) - 2.36;
    const lx = Math.cos(la), ly = Math.sin(la);

    /* ── back gear ── */
    if (kit.back === 'cape') {
      ctx.beginPath();
      ctx.moveTo(0, -14);
      ctx.quadraticCurveTo(-20 - gait * 2, -14, -27 + gait * 3, -3.5);
      ctx.lineTo(-27 - gait * 3, 3.5);
      ctx.quadraticCurveTo(-20 + gait * 2, 14, 0, 14);
      ctx.closePath();
      ctx.fillStyle = c.ink; ctx.fill();
      ctx.strokeStyle = c.deep; ctx.lineWidth = 1.3; ctx.stroke();
      ctx.strokeStyle = c.dark; ctx.lineWidth = 1;
      seg(ctx, -8, -8, -22, -6); seg(ctx, -8, 8, -22, 6);
    } else if (kit.back === 'pack') {
      rr(ctx, -25, -9.5, 13, 19, 3.5, ST.m, ST.d, 1.4);
      rr(ctx, -23, -6.5, 4.5, 5, 1.4, c.base);
      rr(ctx, -23, 1.5, 4.5, 5, 1.4, c.base);
    } else if (kit.back === 'jetpack') {
      rr(ctx, -26, -10.5, 14, 21, 4, c.dark, c.ink, 1.4);
      rr(ctx, -23, -7, 7, 14, 2.5, c.mid);
      dot(ctx, -27, -6.5, 2.8, ST.d);
      dot(ctx, -27, 6.5, 2.8, ST.d);
      if (state === 'dash') {
        ctx.save(); ctx.shadowBlur = 16; ctx.shadowColor = '#ff8a3c';
        dot(ctx, -33, -6.5, 3, '#ffcf7a');
        dot(ctx, -33, 6.5, 3, '#ffcf7a');
        ctx.restore();
      }
    }

    /* ── feet: only ever a hint, and only really visible mid-stride ── */
    [1, -1].forEach(sgn => {
      const g = gait * sgn;
      ctx.save();
      // Feet travel on an arc around the hip and the trailing foot lifts —
      // cues the old straight-line X slide had no way to give.
      ctx.translate(-17 + g * 7, sgn > 0 ? -9 : 9);
      ctx.rotate(g * 0.2);
      const lifted = Math.max(0, -g) * 1.1;
      rr(ctx, -6 - lifted, -3.4 - lifted * 0.5, 12 + lifted * 2, 6.8 + lifted, 3.4, c.ink, c.deep, 1.1);
      ctx.restore();
    });

    /* ── the ball ── */
    const bodyR = kit.body === 'droid' ? 20 : kit.body === 'mech' ? 19 : R0;
    const bg = ctx.createRadialGradient(lx * 10, ly * 10, 1.5, 0, 0, bodyR * 1.15);
    bg.addColorStop(0, c.base);
    bg.addColorStop(0.55, c.mid);
    bg.addColorStop(1, c.deep);
    if (kit.body === 'droid') polyPath(ctx, 6, bodyR, -Math.PI / 2);
    else if (kit.body === 'mech') polyPath(ctx, 8, bodyR, Math.PI / 8);
    else { ctx.beginPath(); ctx.arc(0, 0, bodyR, 0, TAU); }
    ctx.fillStyle = bg; ctx.fill();
    ctx.strokeStyle = c.ink; ctx.lineWidth = 1.8; ctx.stroke();
    ctx.save(); ctx.clip();

    /* dark rear yoke — the single strongest facing cue */
    ctx.beginPath();
    ctx.arc(-9, 0, bodyR + 2, 0, TAU);
    ctx.fillStyle = c.ink; ctx.globalAlpha = 0.55; ctx.fill();
    ctx.globalAlpha = 1;

    if (kit.body === 'fur') {
      ctx.strokeStyle = c.ink; ctx.lineWidth = 1.4;
      for (let i = 0; i < 5; i++) {
        ctx.beginPath(); ctx.arc(-6, 0, 6 + i * 3.2, -1.0, 1.0); ctx.stroke();
      }
    } else if (kit.body === 'droid') {
      ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 1.4;
      seg(ctx, -6, -18, -6, 18);
      seg(ctx, -14, -18, -14, 18);
    } else if (kit.body === 'mech') {
      ctx.strokeStyle = c.ink; ctx.lineWidth = 1.5;
      seg(ctx, -8, -18, -8, 18);
      [-9, 0, 9].forEach(dy => rr(ctx, -19, dy - 1.4, 8, 2.8, 1.4, c.deep));
    } else if (kit.body === 'robe') {
      ctx.strokeStyle = c.deep; ctx.lineWidth = 1.6;
      seg(ctx, 4, -12, -14, -17); seg(ctx, 4, 12, -14, 17);
      seg(ctx, -2, -6, -18, -8); seg(ctx, -2, 6, -18, 8);
    } else if (kit.body === 'armor') {
      ctx.strokeStyle = c.deep; ctx.lineWidth = 1.4;
      seg(ctx, -4, -18, -4, 18);
      seg(ctx, -11, -18, -11, 18);
    }
    ctx.restore();

    if (kit.body === 'fur') {
      ctx.save();
      ctx.strokeStyle = c.ink; ctx.lineWidth = 2.6; ctx.lineCap = 'round';
      for (let i = 0; i < 16; i++) {
        const a = (TAU * i) / 16 + (i % 2 ? 0.1 : -0.1);
        seg(ctx, Math.cos(a) * (bodyR - 2), Math.sin(a) * (bodyR - 2),
                 Math.cos(a) * (bodyR + 4), Math.sin(a) * (bodyR + 4));
      }
      ctx.restore();
    }

    /* ── light forward collar: the torso you can actually see from above ── */
    const cg = ctx.createRadialGradient(6 + lx * 5, ly * 5, 1, 6, 0, 15);
    cg.addColorStop(0, c.hi);
    cg.addColorStop(0.55, c.lit);
    cg.addColorStop(1, c.base);
    ctx.save();
    if (kit.body === 'droid') { ctx.translate(6, 0); polyPath(ctx, 6, 11.5, -Math.PI / 2); ctx.translate(-6, 0); }
    else if (kit.body === 'mech') {
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(-5, -12, 22, 24, 6); else ctx.rect(-5, -12, 22, 24);
    } else { ctx.beginPath(); ctx.ellipse(6, 0, 11.5, 12.2, 0, 0, TAU); }
    ctx.fillStyle = cg; ctx.fill();
    ctx.strokeStyle = c.ink; ctx.lineWidth = 1.6; ctx.stroke();
    ctx.restore();

    if (kit.body === 'armor' || kit.body === 'mech') {
      ctx.strokeStyle = c.deep; ctx.lineWidth = 1.3;
      seg(ctx, 2, -9.5, 2, 9.5);
    } else if (kit.body === 'robe') {
      rr(ctx, 0, -4, 7, 8, 2, c.dark, c.ink, 1);       // belt buckle
    } else if (kit.body === 'fur') {
      rr(ctx, 1, -12, 5.5, 24, 2.5, c.ink);            // bandolier
      ctx.strokeStyle = c.dark; ctx.lineWidth = 1;
      seg(ctx, 3.7, -10.5, 3.7, 10.5);
    }

    /* ── shoulder pads ── */
    if (kit.shoulder !== 'none') {
      const sw = kit.shoulder === 'heavy' ? 14 : 11.5;
      const sh = kit.shoulder === 'heavy' ? 11 : 9;
      [-1, 1].forEach(sgn => {
        ctx.save();
        ctx.translate(2, sgn * 12.5);
        ctx.rotate(sgn * 0.22);
        rr(ctx, -sw / 2, -sh / 2, sw, sh, 4, c.mid, c.ink, 1.5);
        if (kit.shoulder === 'heavy') dot(ctx, 0, 0, 2, c.deep);
        if (kit.shoulder === 'spike') {
          ctx.beginPath();
          ctx.moveTo(-3.5, sgn * (sh / 2 - 0.5)); ctx.lineTo(3.5, sgn * (sh / 2 - 0.5));
          ctx.lineTo(0, sgn * (sh / 2 + 7)); ctx.closePath();
          ctx.fillStyle = c.lit; ctx.fill();
          ctx.strokeStyle = c.ink; ctx.lineWidth = 1; ctx.stroke();
        }
        ctx.restore();
      });
    }

    /* ── arms, weapon, hands ───────────────────────────────────────────
       GRIPS is where each pose puts the hands; the painters above are laid
       out around these same points. */
    const GRIPS = {
      rifle:  [[23, -8], [7, -6]],
      pistol: [[9, -7.5], null],
      spread: [[20, -8], [6, -6]],
      staff:  [[15, -4.5], [1, 0]],
      blade:  [[18, -11], [11, -4]],
      caster: [[16, -9], [16, 9]],
      fists:  [[13, -9.5], [13, 9.5]],
      claws:  [[10, -9], [10, 9]],
      repulsor: [[11, -9], [11, 9]],
      webshooter: [[9, -7.5], null],
      shield: [[10, -6], [8, 8]],
      bow:    [[13, -6], [2, -1]],
      hammer: [[8, -4], [1, 0.5]],
      dual:   [[8, -9], [8, 9]],
      spit:   [[11, -10], [11, 10]],
      none:   [[14, -9], [14, 9]]
    };
    // One hilt in each hand instead of two hands on one hilt.
    const twin = fam === 'blade' && !!specFor(wKey, o.weaponConfig).twin;
    const grips = twin ? [[14, -9.5], [14, 9.5]] : (GRIPS[fam] || GRIPS.rifle);
    const g1 = grips[0], g2 = grips[1];
    const solid = !!SOLID_BLADES[(o.weaponConfig && o.weaponConfig.baseKey) || wKey];
    const firing = state === 'fire' && recoil > 2;

    function arm(sy, ex, ey) {
      ctx.lineCap = 'round';
      ctx.strokeStyle = c.ink; ctx.lineWidth = 5.8;
      seg(ctx, 6, sy, ex, ey);
      ctx.strokeStyle = c.dark; ctx.lineWidth = 2.8;
      seg(ctx, 6, sy, ex, ey);
      ctx.lineCap = 'butt';
    }
    function hand(px, py) {
      dot(ctx, px, py, 3.6, c.ink);
      dot(ctx, px - 0.6, py - 0.8, 2.3, c.dark);
    }

    ctx.save();
    if (swing) ctx.rotate(swing);
    ctx.translate(-recoil, 0);
    if (g2) { arm(8.5, g2[0], g2[1] + armSwing * 0.5); arm(-8.5, g1[0], g1[1] - armSwing * 0.5); }
    else { arm(8.5, 10 - armSwing, 12 + armSwing * 0.6); arm(-8.5, g1[0], g1[1]); }
    ctx.restore();

    /* ── head: smallest, lightest, at the leading edge ── */
    ctx.save(); ctx.translate(0, 1.6);
    // Occlusion under the head, or it floats off the collar.
    ctx.save();
    ctx.globalAlpha = 0.3;
    ctx.beginPath(); ctx.ellipse(8, 1.8, 8.7, 8.3, 0, 0, TAU);
    ctx.fillStyle = '#000000'; ctx.fill();
    ctx.restore();
    const hx = 9.5, hr = 8.2;
    if (kit.helmet === 'hood') {
      ctx.beginPath(); ctx.arc(hx - 2.5, 0, hr + 3.6, 0, TAU);
      ctx.fillStyle = c.deep; ctx.fill();
      ctx.strokeStyle = c.ink; ctx.lineWidth = 1.6; ctx.stroke();
      ctx.beginPath(); ctx.arc(hx + 1, 0, hr - 1.6, 0, TAU);
      ctx.fillStyle = 'rgba(4,6,10,0.94)'; ctx.fill();
      ctx.save(); ctx.shadowBlur = 10; ctx.shadowColor = c.glow;
      dot(ctx, hx + 3.4, -2.2, 1.5, c.glow);
      dot(ctx, hx + 3.4, 2.2, 1.5, c.glow);
      ctx.restore();
    } else {
      const hg = ctx.createRadialGradient(hx + lx * 4, ly * 4, 0.8, hx, 0, hr * 1.35);
      hg.addColorStop(0, '#ffffff'); hg.addColorStop(0.28, c.hi);
      hg.addColorStop(0.75, c.lit); hg.addColorStop(1, c.base);
      ctx.beginPath(); ctx.arc(hx, 0, hr, 0, TAU);
      ctx.fillStyle = hg; ctx.fill();
      ctx.strokeStyle = c.ink; ctx.lineWidth = 1.6; ctx.stroke();

      if (kit.helmet === 'trooper') {
        rr(ctx, hx + 1.4, -5.6, 3.6, 11.2, 1.6, '#141a22');     // brow bar
        rr(ctx, hx + 3, -1.9, 4.4, 3.8, 1.3, '#141a22');        // nose bar
        ctx.strokeStyle = 'rgba(190,225,255,0.55)'; ctx.lineWidth = 1.1;
        seg(ctx, hx + 2.2, -4.6, hx + 2.2, 4.6);
        ctx.strokeStyle = c.deep; ctx.lineWidth = 1.2;
        seg(ctx, hx - 5.2, -3.2, hx + 0.6, -6);
        seg(ctx, hx - 5.2, 3.2, hx + 0.6, 6);
      } else if (kit.helmet === 'mask') {
        rr(ctx, hx + 0.8, -6.2, 4.8, 12.4, 1.8, '#141a22');
        ctx.strokeStyle = c.dark; ctx.lineWidth = 1;
        [-3.4, 0, 3.4].forEach(dy => seg(ctx, hx + 1.2, dy, hx + 5.4, dy));
        ctx.strokeStyle = 'rgba(255,255,255,0.32)'; ctx.lineWidth = 1;
        seg(ctx, hx + 1.3, -5, hx + 1.3, 5);
      } else if (kit.helmet === 'dome') {
        ctx.beginPath(); ctx.arc(hx - 2.4, -2.2, 3.2, 0, TAU);
        ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.fill();
        dot(ctx, hx + 3.2, 0, 2.9, '#141a22');
        ctx.save(); ctx.shadowBlur = 11; ctx.shadowColor = c.glow;
        dot(ctx, hx + 3.2, 0, 1.5, c.glow); ctx.restore();
      } else if (kit.helmet === 'horned') {
        [-1, 1].forEach(sgn => {
          ctx.beginPath();
          ctx.moveTo(hx - 1.5, sgn * 5.6);
          ctx.lineTo(hx + 2.2, sgn * 6.4);
          ctx.lineTo(hx - 7, sgn * 13);
          ctx.closePath();
          ctx.fillStyle = c.deep; ctx.fill();
          ctx.strokeStyle = c.ink; ctx.lineWidth = 1; ctx.stroke();
        });
        rr(ctx, hx + 1.6, -4.8, 4, 9.6, 1.5, '#141a22');
      } else if (kit.helmet === 'antenna') {
        ctx.strokeStyle = c.dark; ctx.lineWidth = 1.8; ctx.lineCap = 'round';
        seg(ctx, hx - 4, -3.4, hx - 11, -11.5);
        ctx.save(); ctx.shadowBlur = 9; ctx.shadowColor = c.glow;
        dot(ctx, hx - 11.6, -12.1, 1.9, c.glow); ctx.restore();
        ctx.lineCap = 'butt';
        dot(ctx, hx + 3.2, 0, 2.4, '#141a22');
      } else {
        ctx.beginPath();
        ctx.arc(hx - 1.8, 0, hr * 0.98, 1.4, -1.4);
        ctx.closePath();
        ctx.fillStyle = c.deep; ctx.fill();
        ctx.strokeStyle = c.ink; ctx.lineWidth = 1; ctx.stroke();
      }
    }

    ctx.restore();

    ctx.save();
    if (swing) ctx.rotate(swing);
    ctx.translate(-recoil, 0);
    if (kick) { ctx.translate(6, 0); ctx.rotate(kick); ctx.translate(-6, 0); }

    const spec = specFor(wKey, o.weaponConfig);
    if (fam === 'rifle') paintRifle(ctx, wcol, firing, spec);
    else if (fam === 'pistol') paintPistol(ctx, wcol, firing, spec);
    else if (fam === 'blade' && twin) {
      [-9.5, 9.5].forEach(dy => { ctx.save(); ctx.translate(0, dy); paintBlade(ctx, wcol, o.reach, solid, o.bladeless, spec); ctx.restore(); });
    }
    else if (fam === 'blade') { ctx.save(); ctx.translate(0, -7.5); paintBlade(ctx, wcol, o.reach, solid, o.bladeless, spec); ctx.restore(); }
    else if (fam === 'staff') paintStaff(ctx, wcol);
    else if (fam === 'spread') paintSpread(ctx, wcol, firing, spec);
    else if (fam === 'caster') paintCaster(ctx, wcol, state === 'fire');
    else if (fam === 'fists') paintFists(ctx, wcol, spec);
    else if (fam === 'claws') paintClaws(ctx, wcol, spec);
    else if (fam === 'repulsor') paintRepulsor(ctx, wcol, state === 'fire', spec);
    else if (fam === 'webshooter') paintWebShooter(ctx, wcol, firing);
    else if (fam === 'shield') paintShield(ctx, wcol);
    else if (fam === 'bow') paintBow(ctx, wcol, state === 'fire');
    else if (fam === 'hammer') paintHammer(ctx, wcol, wKey === 'stormbreaker');
    else if (fam === 'dual') paintDual(ctx, wcol, firing);
    else if (fam === 'spit') paintSpit(ctx, wcol, state === 'fire');

    if (!SELF_HANDED[fam]) {
      if (g2) { hand(g2[0], g2[1]); hand(g1[0], g1[1]); }
      else { hand(10, 12); hand(g1[0], g1[1]); }
    }
    ctx.restore();

    /* ── rim light along the lit edge of the ball ── */
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = c.hi; ctx.lineWidth = 2; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(0, 0, bodyR - 1, la - 0.7, la + 0.7); ctx.stroke();
    ctx.restore();

    if (o.hitFlash) {
      ctx.save();
      ctx.globalAlpha = 0.5 * o.hitFlash;
      ctx.beginPath(); ctx.arc(0, 0, bodyR + 1, 0, TAU);
      ctx.fillStyle = '#ffffff'; ctx.fill();
      ctx.restore();
    }
    if (death > 0) {
      ctx.save();
      ctx.globalAlpha = death * 0.55;
      ctx.beginPath(); ctx.arc(0, 0, bodyR, 0, TAU);
      ctx.fillStyle = '#000000'; ctx.fill();
      ctx.restore();
    }

    ctx.restore();
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
  }

  /* Dash smear — call before drawFighter with the same options. */
  function drawDashTrail(ctx, o) {
    for (let i = 4; i >= 1; i--) {
      drawFighter(ctx, Object.assign({}, o, {
        x: o.x - Math.cos(o.angle || 0) * i * 6.5,
        y: o.y - Math.sin(o.angle || 0) * i * 6.5,
        alpha: (o.alpha === undefined ? 1 : o.alpha) * 0.1 * (5 - i),
        scale: (o.scale || 1) * (1 - i * 0.045),
        state: 'idle'
      }));
    }
  }

  /** Derive the sprite state from fields Character already carries.
   *  Priority is deliberate: a committed swing outranks a dash, which
   *  outranks recoil, which outranks walking. Pass the same frameNow the
   *  game loop uses. */
  function stateFor(e, frameNow) {
    const now = frameNow || Date.now();
    if (e.pendingSwingAt || (e.swingRecoverUntil && now < e.swingRecoverUntil)) return 'swing';
    if (e.isDodging || (e.spinDashUntil && now < e.spinDashUntil)) return 'dash';
    if (e.lastShotTime && now - e.lastShotTime < 150 && !e.weaponConfig.melee) return 'fire';
    const vx = e.vx || 0, vy = e.vy || 0;
    if (vx * vx + vy * vy > 0.04) return 'walk';
    return 'idle';
  }

  /** Log preset ids that match no roster entry, and named fighters with no
   *  preset. Run once from the console after loading:
   *    SpriteKit.auditPresets([...characters.heroes, ...characters.villains]) */
  function auditPresets(roster) {
    const ids = new Set((roster || []).map(c => c.id));
    const unmatched = Object.keys(KIT_PRESETS).filter(k => !ids.has(k));
    const uncovered = (roster || []).filter(c => !KIT_PRESETS[c.id] && !c.created).map(c => c.id);
    if (unmatched.length) console.warn('[SpriteKit] preset ids not in roster:', unmatched);
    console.info('[SpriteKit] presets matched:',
      Object.keys(KIT_PRESETS).length - unmatched.length, '/', Object.keys(KIT_PRESETS).length,
      '· falling back to flag rules:', uncovered.length);
    return { unmatched: unmatched, uncovered: uncovered };
  }

  window.SpriteKit = {
    CHARACTER_SIZE: R0,
    drawFighter: drawFighter,
    drawDashTrail: drawDashTrail,
    stateFor: stateFor,
    auditPresets: auditPresets,
    kitFor: kitFor,
    familyOf: familyOf,
    // The swing arc, exported under the name the host calls it by. Character.draw()
    // beams a blade along `angle + SpriteKit.swingOffset(phase)` so the lit blade
    // sweeps with the hand that is holding it — and the hand is rotated by this
    // exact function (see the two ctx.rotate(swing) sites), so sharing the one
    // curve is what stops the beam and the hilt drifting apart mid-cut.
    //
    // It was missing from this object while the call site already existed, which
    // threw a TypeError out of Character.draw on the first frame of any swing by a
    // 'blade'-family weapon. That exception escapes gameLoop(), so the next frame is
    // never scheduled and the whole game stops dead — every saber, the Wrench, the
    // Vibroblade, Lævateinn and the Wakandan Scimitar, all of them.
    swingOffset: swingCurve,
    ramp: C,
    specFor: specFor,
    WEAPON_SPECS: WEAPON_SPECS,
    FAMILIES: Object.keys(FAMILY_MEMBERS),
    FAMILY_MEMBERS: FAMILY_MEMBERS,
    BODIES: ['organic', 'armor', 'robe', 'fur', 'droid', 'mech'],
    HELMETS: ['none', 'trooper', 'hood', 'dome', 'horned', 'mask', 'antenna'],
    KIT_PRESETS: KIT_PRESETS,
    SHOULDERS: ['none', 'pauldron', 'heavy', 'spike'],
    BACKS: ['none', 'cape', 'pack', 'jetpack']
  };
})();
