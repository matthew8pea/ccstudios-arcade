/* ==========================================================================
   data.js — difficulties, sectors (maps), units, enemies, waves, achievements
   ========================================================================== */
'use strict';

const BOARD_W = 960;
const BOARD_H = 600;
const PATH_BUFFER = 34;        // how close to the lane a unit may be placed
const TOWER_SPACING = 30;      // minimum distance between two units
const MAX_LEVEL = 5;

// ---- Difficulties ----
const DIFFICULTIES = {
  easy: {
    id: 'easy', name: 'Easy', lives: 30, credits: 200, hp: 0.85, bounty: 1.1,
    tier: 'Cadet', color: '#5ef2a8', icon: '◇',
    desc: 'A forgiving tour of duty. Ideal for learning the lanes.'
  },
  normal: {
    id: 'normal', name: 'Normal', lives: 20, credits: 120, hp: 1, bounty: 1,
    tier: 'Officer', color: '#ffc94d', icon: '◈',
    desc: 'The intended challenge. Every credit counts.'
  },
  hard: {
    id: 'hard', name: 'Hard', lives: 10, credits: 80, hp: 1.2, bounty: 0.95,
    tier: 'Legend', color: '#ff5d6c', icon: '✦',
    desc: 'Tougher enemies, thinner margins. Only legends survive.'
  }
};

// ---- Sectors (maps). Each has one or more lanes; enemies alternate lanes. ----
const MAPS = [
  {
    id: 'orion', name: 'Orion Outpost', theme: '#3aa8ff', nebula: ['#1b3a7a', '#5a1f6b'],
    desc: 'A winding supply lane through a quiet frontier.',
    paths: [[
      { x: -30, y: 90 }, { x: 170, y: 90 }, { x: 170, y: 310 }, { x: 410, y: 310 },
      { x: 410, y: 120 }, { x: 710, y: 120 }, { x: 710, y: 470 }, { x: 990, y: 470 }
    ]]
  },
  {
    id: 'cinder', name: 'Cinder Belt', theme: '#ff8a3d', nebula: ['#6b2a12', '#3a1060'],
    desc: 'A long serpentine route around a burning asteroid field.',
    paths: [[
      { x: -30, y: 515 }, { x: 120, y: 515 }, { x: 120, y: 85 }, { x: 330, y: 85 },
      { x: 330, y: 515 }, { x: 540, y: 515 }, { x: 540, y: 85 }, { x: 750, y: 85 },
      { x: 750, y: 400 }, { x: 990, y: 400 }
    ]]
  },
  {
    id: 'gemini', name: 'Twin Gates', theme: '#c77dff', nebula: ['#3d1470', '#0f4a5a'],
    desc: 'Two warp gates feed one lane. Watch both flanks.',
    paths: [
      [
        { x: -30, y: 90 }, { x: 220, y: 90 }, { x: 220, y: 300 }, { x: 480, y: 300 },
        { x: 480, y: 140 }, { x: 760, y: 140 }, { x: 760, y: 450 }, { x: 990, y: 450 }
      ],
      [
        { x: -30, y: 510 }, { x: 220, y: 510 }, { x: 220, y: 300 }, { x: 480, y: 300 },
        { x: 480, y: 140 }, { x: 760, y: 140 }, { x: 760, y: 450 }, { x: 990, y: 450 }
      ]
    ]
  }
];

// ---- Units (towers). Tier only affects the frame color, like a rarity. ----
const TIERS = {
  standard:  { name: 'Standard',  color: '#5bb8ff' },
  elite:     { name: 'Elite',     color: '#b77dff' },
  legendary: { name: 'Legendary', color: '#ffc94d' }
};

const TOWERS = {
  warden: {
    id: 'warden', key: '1', name: 'Blade Warden', tier: 'standard', cost: 60,
    range: 72, fireRate: 0.8, damage: 24, color: '#5ef2c8',
    desc: 'Melee. Cleaves 50% damage into nearby enemies.'
  },
  pulse: {
    id: 'pulse', key: '2', name: 'Pulse Trooper', tier: 'standard', cost: 75,
    range: 115, fireRate: 0.2, damage: 9, color: '#8fd6ff',
    desc: 'Rapid fire. Weak against armor.'
  },
  longshot: {
    id: 'longshot', key: '3', name: 'Longshot Ranger', tier: 'elite', cost: 110,
    range: 230, fireRate: 1.7, damage: 75, color: '#ffd29a', armorPierce: true,
    desc: 'Sniper. Pierces armor, small splash.'
  },
  beacon: {
    id: 'beacon', key: '4', name: 'Signal Commander', tier: 'elite', cost: 95,
    range: 115, fireRate: 0, damage: 0, color: '#ff9ad8', support: true,
    desc: 'Aura: nearby units fire 20% faster (+5%/level).'
  },
  sage: {
    id: 'sage', key: '5', name: 'Gravity Sage', tier: 'legendary', cost: 150,
    range: 95, fireRate: 2.4, damage: 42, color: '#b6ff9a',
    desc: 'Shockwave hits every enemy in range and briefly slows.'
  },
  cryo: {
    id: 'cryo', key: '6', name: 'Cryo Drone', tier: 'standard', cost: 70,
    range: 125, fireRate: 1.0, damage: 4, color: '#9ae6ff',
    desc: 'Chills targets, slowing them 35% (+5%/level).'
  },
  brute: {
    id: 'brute', key: '7', name: 'Siege Brute', tier: 'elite', cost: 120,
    range: 135, fireRate: 1.8, damage: 55, color: '#ffb48a',
    desc: 'Heavy bolt. 25% chance to stun.'
  },
  stasis: {
    id: 'stasis', key: '8', name: 'Stasis Field', tier: 'standard', cost: 90,
    range: 80, fireRate: 0, damage: 0, color: '#ff8a9a', support: true,
    desc: 'Passive field slows enemies 18% (+5%/level).'
  },
  arc: {
    id: 'arc', key: '9', name: 'Arc Lancer', tier: 'elite', cost: 135,
    range: 145, fireRate: 1.9, damage: 40, color: '#d8a6ff',
    desc: 'Lightning chains to 3 targets (+1 at Lv3 and Lv5).'
  },
  mortar: {
    id: 'mortar', key: '0', name: 'Nova Mortar', tier: 'legendary', cost: 160,
    range: 270, minRange: 80, fireRate: 3.0, damage: 90, color: '#ffe066',
    desc: 'Long range artillery with a wide blast. Cannot hit close targets.'
  }
};

// Bonus pairings shown in unit info.
const SYNERGIES = {
  cryo: 'Speeds up Blade Wardens and Gravity Sages within 100 by 10%.',
  longshot: 'Near a Signal Commander, shots stun for 0.25s.',
  beacon: 'Boosts every unit in its aura.'
};

// ---- Enemies ----
// lifeCost: core integrity lost if it reaches the end.
const ENEMIES = {
  husk:      { name: 'Husk',      color: '#c25cff', size: 10, lifeCost: 1, desc: 'Basic swarm drone.' },
  skitter:   { name: 'Skitter',   color: '#ff6fa8', size: 8,  lifeCost: 1, desc: 'Fast and fragile.' },
  bulwark:   { name: 'Bulwark',   color: '#8a9bb0', size: 12, lifeCost: 2, shieldRegen: 12, desc: 'Regenerating energy shield.' },
  juggernaut:{ name: 'Juggernaut',color: '#5a6478', size: 14, lifeCost: 3, armor: 6, stunImmune: true, desc: 'Armored. Reduces each hit by its armor. Immune to stun.' },
  mender:    { name: 'Mender',    color: '#5ef2a8', size: 11, lifeCost: 1, desc: 'Heals nearby enemies.' },
  brood:     { name: 'Brood',     color: '#e0a040', size: 13, lifeCost: 2, desc: 'Bursts into three Skitters when destroyed.' },
  phantom:   { name: 'Phantom',   color: '#7fe0ff', size: 10, lifeCost: 1, desc: 'Phases out of reality, becoming untargetable.' },
  colossus:  { name: 'Dread Colossus', color: '#ff4d5e', size: 24, lifeCost: 5, armor: 4, stunImmune: true, boss: true, desc: 'Boss. Massive armored hulk.' },
  warden:    { name: 'Phase Warden', color: '#ff7a3d', size: 22, lifeCost: 8, shieldRegen: 40, boss: true, desc: 'Boss. Shielded, teleports along the lane.' },
  sovereign: { name: 'Hollow Sovereign', color: '#ff2d7a', size: 30, lifeCost: 15, armor: 5, shieldRegen: 60, stunImmune: true, boss: true, desc: 'Final boss. Summons husks as it advances.' }
};

// ---- Waves ----
// Each group: t = type, n = count, hp, s = speed, b = bounty, gap = seconds between spawns,
// at = seconds after wave start before the group begins, sh = shield.
const WAVES = [
  [{ t: 'husk', n: 8, hp: 55, s: 38, b: 9, gap: 1.1 }],
  [{ t: 'husk', n: 10, hp: 80, s: 42, b: 9, gap: 1.0 },
   { t: 'skitter', n: 4, hp: 40, s: 90, b: 8, gap: 0.8, at: 7 }],
  [{ t: 'husk', n: 12, hp: 110, s: 44, b: 10, gap: 0.9 },
   { t: 'skitter', n: 6, hp: 60, s: 100, b: 8, gap: 0.6, at: 5 }],
  [{ t: 'bulwark', n: 5, hp: 140, sh: 90, s: 34, b: 18, gap: 1.6 },
   { t: 'husk', n: 10, hp: 150, s: 48, b: 10, gap: 0.8, at: 3 }],
  [{ t: 'colossus', n: 1, hp: 1800, s: 24, b: 250, gap: 1 },
   { t: 'husk', n: 10, hp: 130, s: 50, b: 10, gap: 0.7, at: 2 }],
  [{ t: 'skitter', n: 18, hp: 110, s: 105, b: 8, gap: 0.45 },
   { t: 'mender', n: 2, hp: 340, s: 38, b: 20, gap: 3, at: 2 },
   { t: 'husk', n: 8, hp: 260, s: 44, b: 11, gap: 0.9, at: 3 }],
  [{ t: 'juggernaut', n: 6, hp: 550, s: 30, b: 30, gap: 2.0 },
   { t: 'husk', n: 14, hp: 290, s: 48, b: 11, gap: 0.7, at: 1 }],
  [{ t: 'brood', n: 6, hp: 420, s: 36, b: 22, gap: 2.0 },
   { t: 'bulwark', n: 6, hp: 290, sh: 200, s: 34, b: 20, gap: 1.5, at: 4 }],
  [{ t: 'phantom', n: 10, hp: 340, s: 60, b: 20, gap: 1.0 },
   { t: 'skitter', n: 12, hp: 160, s: 110, b: 9, gap: 0.5, at: 4 }],
  [{ t: 'warden', n: 1, hp: 5850, sh: 1560, s: 34, b: 450, gap: 1 },
   { t: 'mender', n: 3, hp: 490, s: 36, b: 22, gap: 2, at: 1 },
   { t: 'husk', n: 16, hp: 390, s: 50, b: 12, gap: 0.6, at: 2 }],
  [{ t: 'juggernaut', n: 10, hp: 910, s: 32, b: 32, gap: 1.6 },
   { t: 'mender', n: 4, hp: 550, s: 34, b: 24, gap: 3, at: 2 }],
  [{ t: 'skitter', n: 30, hp: 220, s: 115, b: 9, gap: 0.3 },
   { t: 'phantom', n: 10, hp: 550, s: 62, b: 22, gap: 1.0, at: 4 }],
  [{ t: 'brood', n: 10, hp: 810, s: 38, b: 26, gap: 1.6 },
   { t: 'bulwark', n: 10, hp: 550, sh: 390, s: 36, b: 24, gap: 1.2, at: 3 }],
  [{ t: 'husk', n: 25, hp: 680, s: 52, b: 14, gap: 0.5 },
   { t: 'juggernaut', n: 8, hp: 1430, s: 32, b: 36, gap: 1.8, at: 3 },
   { t: 'phantom', n: 10, hp: 780, s: 64, b: 24, gap: 1.0, at: 6 },
   { t: 'mender', n: 5, hp: 780, s: 36, b: 26, gap: 2, at: 5 }],
  [{ t: 'sovereign', n: 1, hp: 19500, sh: 3900, s: 18, b: 1200, gap: 1 },
   { t: 'bulwark', n: 10, hp: 680, sh: 460, s: 36, b: 24, gap: 1.4, at: 3 },
   { t: 'juggernaut', n: 6, hp: 1560, s: 30, b: 36, gap: 2.2, at: 8 }]
];

// Procedural waves for Endless mode (wave numbers beyond WAVES.length).
function generateEndlessWave(waveNum) {
  const k = waveNum - WAVES.length;
  const scale = Math.pow(1.16, k);
  const pool = ['husk', 'skitter', 'bulwark', 'juggernaut', 'mender', 'brood', 'phantom'];
  const groups = [];
  const base = { husk: [520, 52, 14], skitter: [180, 115, 9], bulwark: [520, 36, 24],
    juggernaut: [1200, 32, 36], mender: [600, 36, 26], brood: [650, 38, 26], phantom: [620, 64, 24] };
  const picks = 2 + Math.min(3, Math.floor(k / 4));
  for (let i = 0; i < picks; i++) {
    const t = pool[randInt(0, pool.length - 1)];
    const [hp, s, b] = base[t];
    groups.push({
      t, n: 8 + Math.floor(k * 0.8), hp: Math.round(hp * scale), s: s * (1 + k * 0.01),
      b: Math.round(b * (1 + k * 0.05)), gap: t === 'skitter' ? 0.35 : 0.9, at: i * 3,
      sh: t === 'bulwark' ? Math.round(350 * scale) : 0
    });
  }
  if (k % 5 === 0) {
    const boss = ['colossus', 'warden', 'sovereign'][Math.floor(k / 5) % 3];
    groups.push({ t: boss, n: 1, hp: Math.round(9000 * scale), sh: boss === 'colossus' ? 0 : Math.round(2000 * scale),
      s: 22, b: Math.round(600 * (1 + k * 0.05)), gap: 1, at: 1 });
  }
  return groups;
}

function getWave(waveNum) {
  return waveNum <= WAVES.length ? WAVES[waveNum - 1] : generateEndlessWave(waveNum);
}

// ---- Legendary Protocols (commander abilities) ----
const ABILITIES = {
  lance:    { id: 'lance', key: 'Q', name: 'Orbital Lance', cooldown: 40, icon: '☄', color: '#ffc94d',
              desc: 'Click a target: a beam from orbit deals heavy damage in an area.', targeted: true, radius: 75 },
  freeze:   { id: 'freeze', key: 'W', name: 'Stasis Pulse', cooldown: 60, icon: '❄', color: '#7fe0ff',
              desc: 'Freezes every enemy for 2.5s (bosses 1s).' },
  overclock:{ id: 'overclock', key: 'E', name: 'Overclock', cooldown: 50, icon: '⚡', color: '#ff7ad9',
              desc: 'All units fire 60% faster for 8s.' }
};

// ---- Achievements (saved to your profile) ----
const ACHIEVEMENTS = [
  { id: 'firstBlood',  name: 'First Contact',     desc: 'Destroy your first enemy.' },
  { id: 'flawless',    name: 'Flawless',          desc: 'Clear wave 5 or later without losing integrity.' },
  { id: 'engineer',    name: 'Master Engineer',   desc: 'Upgrade a unit to level 5.' },
  { id: 'bigSpender',  name: 'War Budget',        desc: 'Spend 3,000 credits in one game.' },
  { id: 'economist',   name: 'Economist',         desc: 'Earn 200 credits from interest in one game.' },
  { id: 'giantSlayer', name: 'Giant Slayer',      desc: 'Destroy a boss.' },
  { id: 'swarmBreaker',name: 'Swarm Breaker',     desc: 'Destroy 1,000 enemies in total.' },
  { id: 'protocols',   name: 'Full Protocol',     desc: 'Use all three Legendary Protocols in one wave.' },
  { id: 'victor',      name: 'Sector Secured',    desc: 'Win any sector.' },
  { id: 'untouchable', name: 'Untouchable',       desc: 'Win a sector without losing any integrity.' },
  { id: 'legend',      name: 'Living Legend',     desc: 'Win a sector on Hard.' },
  { id: 'voyager',     name: 'Endless Voyager',   desc: 'Reach wave 25 in Endless mode.' }
];
