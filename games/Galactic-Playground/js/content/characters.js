/* GALACTIC PLAYGROUND content — characters. Everything here is configuration:
 * look (painter styles), build (body proportions), stats, loadout, team and AI hints.
 * New characters need no code: copy an entry and change the data.
 */
'use strict';

(() => {
  const R = (d) => GP.Registry.register(Object.assign({ kind: 'character', category: 'Characters' }, d));

  const jedi = (o) => ({
    head: o.head || 'human', skin: o.skin || '#e8b894', hair: o.hair, beard: o.beard, marks: o.marks, eyes: o.eyes, hood: o.hood, hornColor: o.hornColor,
    torso: { style: 'tunic', color: o.robe || '#8a6a48', inner: o.inner || '#d8c8a8', under: o.under || '#efe4cc', belt: o.belt || '#4a3222' },
    arms: { color: o.sleeve || o.robe || '#8a6a48', sleeve: o.cuff || o.robe || '#8a6a48', glove: o.glove || o.skin || '#e8b894' },
    legs: { color: o.pants || '#6a5038', boots: o.boots || '#3a2a1e' },
    robeSkirt: o.skirt || o.robe || '#8a6a48', robeSkirtLen: 0.6, cape: o.cape, capeLen: o.capeLen,
  });
  const armor = (o) => ({
    head: o.head, helmet: o.helmet, helmetStripe: o.helmetStripe, mark: o.mark, antenna: o.antenna, visorStripe: o.visorStripe, insignia: o.insignia,
    torso: { style: o.style || 'armor', color: o.plate || '#eef0f2', under: o.under || '#16171a', belt: o.belt, stripe: o.stripe, pauldron: o.pauldron },
    arms: { color: o.under || '#16171a', armor: o.plate || '#eef0f2', glove: o.glove || '#16171a' },
    legs: { color: o.under || '#16171a', armor: o.plate || '#eef0f2', boots: o.boots || o.plate || '#eef0f2' },
    cape: o.cape,
  });
  const jediStats = (o = {}) => Object.assign({ health: 1.25, speed: 1.2, jump: 1.45, strength: 1.3, skill: 0.85, agility: 1.4, knockResist: 1.3, armor: { blaster: 0.85 }, force: { strength: 1.1, range: 1, powers: ['push', 'pull', 'lift', 'repulse'] } }, o);
  const sithStats = (o = {}) => Object.assign({ health: 1.3, speed: 1.15, jump: 1.4, strength: 1.4, skill: 0.85, agility: 1.35, knockResist: 1.3, armor: { blaster: 0.85 }, force: { strength: 1.2, range: 1, powers: ['push', 'pull', 'lift', 'lightning'] } }, o);

  /* ---------------- Jedi ---------------- */
  R({ id: 'luke', name: 'Luke Skywalker', sub: 'Jedi', team: 'jedi', desc: 'Jedi Knight in black with a green blade.',
    look: jedi({ hair: { style: 'short', color: '#c89a4a' }, robe: '#1c1c20', inner: '#2a2a2e', under: '#3a3a40', belt: '#111', pants: '#1c1c20', boots: '#111', glove: '#111', skirt: '#1c1c20' }),
    stats: jediStats(), loadout: { handF: 'saber_luke' }, tags: ['skywalker', 'rebel', 'hero'] });
  R({ id: 'luke_farmboy', name: 'Luke (Moisture Farmer)', sub: 'Jedi', team: 'rebel', desc: 'Young farmboy with his father\'s blade.',
    look: jedi({ hair: { style: 'short', color: '#d8a850' }, robe: '#e8e0cc', inner: '#f4eedc', under: '#fff', belt: '#6a4a2a', pants: '#d8d0bc', boots: '#6a5a4a', skirt: null }),
    stats: jediStats({ skill: 0.55, force: { strength: 0.7, range: 0.8, powers: ['push', 'pull'] } }), loadout: { handF: 'saber_anakin' }, tags: ['skywalker'] });
  R({ id: 'obiwan', name: 'Obi-Wan Kenobi', sub: 'Jedi', team: 'jedi', desc: 'Master of defense and deflection.',
    look: jedi({ hair: { style: 'short', color: '#a8744a' }, beard: '#a8744a', robe: '#7a5a3a', inner: '#e6d8bc', under: '#f4ecd8' }),
    stats: jediStats({ skill: 0.95, force: { strength: 1.1, range: 1.1, powers: ['push', 'pull', 'lift', 'repulse'] } }), loadout: { handF: 'saber_obiwan' }, tags: ['kenobi', 'ben'] });
  R({ id: 'anakin', name: 'Anakin Skywalker', sub: 'Jedi', team: 'jedi', desc: 'The Chosen One. Aggressive and powerful.',
    look: jedi({ hair: { style: 'messy', color: '#6a4a2a' }, marks: 'scar', robe: '#2a1e18', inner: '#4a3424', under: '#5a4030', pants: '#2a1e18', boots: '#1a1210', glove: '#1a1a1a' }),
    stats: jediStats({ strength: 1.6, skill: 0.9, force: { strength: 1.4, range: 1.1, powers: ['push', 'pull', 'lift', 'repulse'] } }), loadout: { handF: 'saber_anakin' }, tags: ['skywalker', 'chosen one'] });
  R({ id: 'yoda', name: 'Yoda', sub: 'Jedi', team: 'jedi', scale: 0.52, desc: 'Small in size, immense in the Force.',
    look: jedi({ head: 'yoda', skin: '#8faa62', robe: '#b8a888', inner: '#d8ccb0', under: '#e8dcc0', pants: '#a89878', boots: '#8faa62', glove: '#8faa62' }),
    build: { headR: 0.2, torsoW: 0.34, thigh: 0.36, shin: 0.34 },
    stats: jediStats({ health: 1.1, speed: 1.5, jump: 2.3, strength: 1.6, skill: 1, agility: 2, force: { strength: 2.2, range: 1.4, powers: ['push', 'pull', 'lift', 'repulse'] } }), loadout: { handF: 'saber_yoda' }, tags: ['master', 'green'] });
  R({ id: 'mace', name: 'Mace Windu', sub: 'Jedi', team: 'jedi', desc: 'Master of Vaapad and a purple blade.',
    look: jedi({ skin: '#6a4630', hair: { style: 'bald' }, robe: '#6a4a30', inner: '#d8c8a8', under: '#e8dcc4', pants: '#5a4028', glove: '#6a4630' }),
    stats: jediStats({ strength: 1.5, skill: 0.95, force: { strength: 1.3, range: 1, powers: ['push', 'pull', 'lift', 'repulse'] } }), loadout: { handF: 'saber_mace' }, tags: ['windu', 'purple'] });
  R({ id: 'ahsoka', name: 'Ahsoka Tano', sub: 'Jedi', team: 'jedi', scale: 0.95, desc: 'Togruta duelist wielding two blades.',
    look: jedi({ head: 'togruta', skin: '#e0702e', robe: '#8a3a2a', inner: '#5a4a3a', under: '#6a5a4a', pants: '#4a3a30', boots: '#3a2a22', glove: '#6a5a4a', skirt: '#8a3a2a' }),
    stats: jediStats({ speed: 1.35, agility: 1.8, jump: 1.6, skill: 0.9 }), loadout: { handF: 'saber_ahsoka', handB: 'saber_ahsoka_shoto' }, tags: ['togruta', 'snips', 'dual'] });
  R({ id: 'kit_fisto', name: 'Nautolan Jedi Master', sub: 'Jedi', team: 'jedi', desc: 'A cheerful amphibious master with a green blade.',
    look: jedi({ head: 'twilek', skin: '#5a9a6a', robe: '#7a5a3a' }), stats: jediStats(), loadout: { handF: 'saber_green' }, tags: ['alien'] });
  R({ id: 'plo_koon', name: 'Kel Dor Jedi Master', sub: 'Jedi', team: 'jedi', desc: 'Masked master from Dorin.',
    look: Object.assign(jedi({ head: 'kx', skin: '#c88a5a', robe: '#6a4a2a' }), { head: 'kx', skin: '#d89a6a', mark: '#3a3a3a' }), stats: jediStats({ force: { strength: 1.3, range: 1.2, powers: ['push', 'pull', 'lift', 'lightning'] } }), loadout: { handF: 'saber_orange' }, tags: ['alien', 'mask'] });
  R({ id: 'jedi_knight', name: 'Jedi Knight', sub: 'Generic Jedi', team: 'jedi', desc: 'A Knight of the Order.',
    look: jedi({ hair: { style: 'short', color: '#3a2a1a' } }), stats: jediStats({ skill: 0.7 }), loadout: { handF: 'saber_blue' } });
  R({ id: 'jedi_master', name: 'Jedi Master', sub: 'Generic Jedi', team: 'jedi', desc: 'A seasoned Master in dark brown robes.',
    look: jedi({ head: 'hood', hood: '#4a3222', beard: '#9a9a9a', robe: '#4a3222', inner: '#c8b898' }), stats: jediStats({ skill: 0.9, force: { strength: 1.5, range: 1.2, powers: ['push', 'pull', 'lift', 'repulse'] } }), loadout: { handF: 'saber_green' } });
  R({ id: 'jedi_padawan', name: 'Jedi Padawan', sub: 'Generic Jedi', team: 'jedi', scale: 0.9, desc: 'An apprentice still learning.',
    look: jedi({ hair: { style: 'short', color: '#8a5a2a' }, robe: '#c8b090' }), stats: jediStats({ skill: 0.5, force: { strength: 0.7, range: 0.8, powers: ['push', 'pull'] } }), loadout: { handF: 'saber_blue' } });
  R({ id: 'jedi_zabrak', name: 'Zabrak Jedi', sub: 'Generic Jedi', team: 'jedi', desc: 'Iridonian Jedi with a yellow saber.',
    look: jedi({ head: 'zabrak', skin: '#d89a70', robe: '#5a4a3a', marks: 'tattoo' }), stats: jediStats(), loadout: { handF: 'saber_yellow' } });
  R({ id: 'jedi_twilek', name: "Twi'lek Jedi", sub: 'Generic Jedi', team: 'jedi', desc: 'Graceful fighter with a double-bladed saber.',
    look: jedi({ head: 'twilek', skin: '#5aa0c8', robe: '#3a3a5a', inner: '#6a6a8a' }), stats: jediStats({ agility: 1.6 }), loadout: { handF: 'saber_double_blue' } });
  R({ id: 'temple_guard', name: 'Temple Guard', sub: 'Generic Jedi', team: 'jedi', desc: 'Masked sentinel of the Temple.',
    look: Object.assign(jedi({ robe: '#8a6a40', inner: '#d8c898' }), { head: 'temple' }), stats: jediStats({ health: 1.5, skill: 0.8 }), loadout: { handF: 'saber_temple_pike' } });
  R({ id: 'jedi_gray', name: 'Gray Jedi', sub: 'Generic Jedi', team: 'neutral', desc: 'Walks the line between light and dark.',
    look: jedi({ hair: { style: 'long', color: '#2a2a2a' }, robe: '#5a5e66', inner: '#8a8e96' }), stats: jediStats(), loadout: { handF: 'saber_white' } });

  /* ---------------- Sith & dark side ---------------- */
  R({ id: 'vader', name: 'Darth Vader', sub: 'Sith', team: 'empire', scale: 1.1, desc: 'Towering Sith Lord. Slow, strong, relentless.',
    look: { head: 'vader', torso: { style: 'vader' }, arms: { color: '#0f1013', glove: '#0a0a0c', gauntlet: '#16171b' }, legs: { color: '#0f1013', boots: '#0a0a0c' }, cape: '#0a0a0e', capeLen: 1.35 },
    build: { torsoW: 0.36 }, stats: sithStats({ health: 1.8, speed: 0.85, jump: 1.1, strength: 2, knockResist: 1.8, armor: { blaster: 0.6, impact: 0.7 }, force: { strength: 1.8, range: 1.2, powers: ['push', 'pull', 'lift'] } }),
    loadout: { handF: 'saber_vader' }, tags: ['anakin', 'empire', 'sith lord'] });
  R({ id: 'maul', name: 'Darth Maul', sub: 'Sith', team: 'sith', desc: 'Acrobatic Zabrak with a saberstaff.',
    look: jedi({ head: 'zabrak', skin: '#c83028', marks: 'sith', eyes: '#e0a020', robe: '#141416', inner: '#1c1c20', under: '#222', pants: '#141416', boots: '#0a0a0a', glove: '#141416', hornColor: '#d8c8a0' }),
    stats: sithStats({ speed: 1.35, agility: 1.9, jump: 1.7, force: { strength: 1, range: 1, powers: ['push', 'pull', 'lift'] } }), loadout: { handF: 'saber_maul' }, tags: ['zabrak', 'double'] });
  R({ id: 'dooku', name: 'Count Dooku', sub: 'Sith', team: 'separatist', scale: 1.05, desc: 'Elegant duelist. Wields Force lightning.',
    look: Object.assign(jedi({ hair: { style: 'short', color: '#d8d8d8' }, beard: '#d8d8d8', robe: '#2a2020', inner: '#1a1414', under: '#3a2a2a', pants: '#1a1414', boots: '#0a0a0a', glove: '#1a1414' }), { cape: '#3a1a1a' }),
    stats: sithStats({ skill: 0.95, force: { strength: 1.4, range: 1.2, powers: ['push', 'pull', 'lift', 'lightning'] } }), loadout: { handF: 'saber_dooku' }, tags: ['tyranus', 'lightning'] });
  R({ id: 'palpatine', name: 'Darth Sidious', sub: 'Sith', team: 'sith', desc: 'The Emperor. Storms of lightning.',
    look: Object.assign(jedi({ robe: '#141418', inner: '#0a0a0c', under: '#141418', pants: '#141418', boots: '#0a0a0a', glove: '#d8c8b8' }), { head: 'palpatine', hood: '#141418', skin: '#d8c8b8' }),
    stats: sithStats({ health: 1.4, speed: 1.1, force: { strength: 2.2, range: 1.4, powers: ['push', 'pull', 'lift', 'lightning', 'repulse'] } }), loadout: { handF: 'saber_red' }, tags: ['emperor', 'lightning'] });
  R({ id: 'grievous', name: 'General Grievous', sub: 'Separatists', team: 'separatist', scale: 1.18, mech: true, desc: 'Cyborg general who collects Jedi sabers.',
    look: { head: 'grievous', torso: { style: 'grievous' }, arms: { color: '#d8d2bc', joint: '#8a8474', plate: '#e6e0cc' }, legs: { color: '#d8d2bc', joint: '#8a8474', plate: '#e6e0cc' }, mech: true, cape: '#5a4a3a', capeLen: 0.9 },
    build: { torsoW: 0.26, armW: 0.09, foreW: 0.085 }, stats: { health: 1.6, speed: 1.3, jump: 1.3, strength: 1.7, skill: 0.8, agility: 1.3, knockResist: 1.4, armor: { blaster: 0.7, ion: 0.6 } },
    loadout: { handF: 'saber_grievous', handB: 'saber_blue' }, voice: 'grievous', tags: ['cyborg', 'droid', 'dual'] });
  R({ id: 'sith_lord', name: 'Sith Lord', sub: 'Generic Sith', team: 'sith', desc: 'Hooded master of the dark side.',
    look: Object.assign(jedi({ head: 'hood', hood: '#16161a', robe: '#16161a', inner: '#26262c', under: '#101014', pants: '#101014', boots: '#0a0a0a', eyes: '#e0a020' }), { cape: '#16161a' }),
    stats: sithStats(), loadout: { handF: 'saber_red' } });
  R({ id: 'sith_acolyte', name: 'Sith Acolyte', sub: 'Generic Sith', team: 'sith', desc: 'Dark side initiate.',
    look: jedi({ hair: { style: 'short', color: '#1a1a1a' }, robe: '#2a1a1a', inner: '#3a2020', eyes: '#e0a020' }), stats: sithStats({ skill: 0.55, force: { strength: 0.8, range: 0.9, powers: ['push', 'lightning'] } }), loadout: { handF: 'saber_red' } });
  R({ id: 'sith_assassin', name: 'Sith Assassin', sub: 'Generic Sith', team: 'sith', desc: 'Agile killer with a saberstaff.',
    look: jedi({ head: 'zabrak', skin: '#8a8a8a', marks: 'sith', robe: '#101014', eyes: '#e0a020' }), stats: sithStats({ speed: 1.4, agility: 1.8 }), loadout: { handF: 'saber_double_red' } });
  R({ id: 'inquisitor', name: 'Inquisitor', sub: 'Generic Sith', team: 'empire', desc: 'Jedi hunter with a spinning saber.',
    look: Object.assign(armor({ head: 'inquisitor', plate: '#3a3c42', under: '#1a1b1e', style: 'uniform' }), { torso: { style: 'uniform', color: '#2a2c30', badge: '#8a2020' } }),
    stats: sithStats({ skill: 0.75, force: { strength: 1, range: 1, powers: ['push', 'pull', 'lift'] } }), loadout: { handF: 'saber_inquisitor' } });

  /* ---------------- Clones & Republic ---------------- */
  const cloneLook = (mark, extra = {}) => Object.assign(armor({ head: 'clone', helmet: '#f0f0ec', mark, plate: '#f0f0ec', under: '#1c1c1e', stripe: mark, belt: '#2a2a2a' }), extra);
  const cloneStats = { health: 1.1, speed: 1.05, jump: 1, strength: 1.1, skill: 0.55, armor: { blaster: 0.85 } };
  R({ id: 'clone_trooper', name: 'Clone Trooper', sub: 'Clones', team: 'republic', look: cloneLook(null), stats: cloneStats, loadout: { handF: 'dc15a' }, ai: { grenades: 1, grenadeType: 'frag_grenade' }, tags: ['republic', 'trooper'] });
  R({ id: 'clone_501', name: '501st Clone Trooper', sub: 'Clones', team: 'republic', look: cloneLook('#2a5ab0'), stats: cloneStats, loadout: { handF: 'dc15s' }, ai: { grenades: 1, grenadeType: 'frag_grenade' }, tags: ['blue', 'rex'] });
  R({ id: 'clone_212', name: '212th Clone Trooper', sub: 'Clones', team: 'republic', look: cloneLook('#d87a20'), stats: cloneStats, loadout: { handF: 'dc15a' }, ai: { grenades: 1, grenadeType: 'frag_grenade' }, tags: ['orange', 'cody'] });
  R({ id: 'clone_commander', name: 'Clone Commander', sub: 'Clones', team: 'republic', look: cloneLook('#b83030', { antenna: true }), stats: Object.assign({}, cloneStats, { skill: 0.75, health: 1.3 }), loadout: { handF: 'dc17', handB: 'dc17' }, tags: ['officer', 'dual'] });
  R({ id: 'clone_heavy', name: 'Clone Heavy Gunner', sub: 'Clones', team: 'republic', look: cloneLook('#5a7a3a'), stats: Object.assign({}, cloneStats, { speed: 0.85, strength: 1.4 }), loadout: { handF: 'z6' }, tags: ['heavy', 'rotary'] });
  R({ id: 'arc_trooper', name: 'ARC Trooper', sub: 'Clones', team: 'republic', look: cloneLook('#c8a020', { antenna: true, torso: { style: 'clone', color: '#f0f0ec', stripe: '#c8a020', pauldron: '#c8a020', under: '#1c1c1e' } }), stats: Object.assign({}, cloneStats, { skill: 0.8, health: 1.3 }), loadout: { handF: 'dc17', handB: 'dc17' }, ai: { grenades: 2, grenadeType: 'thermal_detonator' } });
  R({ id: 'clone_sniper', name: 'Clone Sharpshooter', sub: 'Clones', team: 'republic', look: cloneLook('#3a6a3a'), stats: Object.assign({}, cloneStats, { skill: 0.85 }), loadout: { handF: 'sniper' } });

  /* ---------------- Empire ---------------- */
  const tr = (o = {}) => armor(Object.assign({ head: 'trooper', helmet: '#eef0f2', plate: '#eef0f2', under: '#141518', belt: '#d8dade' }, o));
  const trStats = { health: 1, speed: 1, jump: 1, strength: 1, skill: 0.3, armor: { blaster: 0.9 } };
  R({ id: 'stormtrooper', name: 'Stormtrooper', sub: 'Empire', team: 'empire', look: tr(), stats: trStats, loadout: { handF: 'e11' }, ai: { grenades: 1, grenadeType: 'thermal_detonator' }, tags: ['trooper', 'imperial'] });
  R({ id: 'storm_heavy', name: 'Heavy Stormtrooper', sub: 'Empire', team: 'empire', look: tr({ pauldron: '#2a2a2a' }), stats: Object.assign({}, trStats, { speed: 0.9, strength: 1.3 }), loadout: { handF: 'dlt19' }, tags: ['heavy', 'repeater'] });
  R({ id: 'sandtrooper', name: 'Sandtrooper', sub: 'Empire', team: 'empire', look: Object.assign(tr({ style: 'sand', pauldron: '#c86a2a' }), { helmetStripe: '#c8a878' }), stats: trStats, loadout: { handF: 'e11' }, tags: ['desert'] });
  R({ id: 'snowtrooper', name: 'Snowtrooper', sub: 'Empire', team: 'empire', look: tr({ head: 'snow', style: 'snow', plate: '#e4e8ec' }), stats: Object.assign({}, trStats, { armor: { blaster: 0.9, fire: 0.8 } }), loadout: { handF: 'e11' }, tags: ['hoth', 'frozen'] });
  R({ id: 'scout_trooper', name: 'Scout Trooper', sub: 'Empire', team: 'empire', look: tr({ head: 'scout', under: '#1a1a1a' }), stats: Object.assign({}, trStats, { speed: 1.2, skill: 0.45 }), loadout: { handF: 'se14' }, tags: ['biker'] });
  R({ id: 'death_trooper', name: 'Death Trooper', sub: 'Empire', team: 'empire', scale: 1.08, look: tr({ head: 'death', helmet: '#1a1b1e', plate: '#1e1f22', under: '#0a0a0c', belt: '#2a2b30', boots: '#141416' }), stats: Object.assign({}, trStats, { skill: 0.75, health: 1.4, strength: 1.3 }), loadout: { handF: 'e11' }, ai: { grenades: 2, grenadeType: 'frag_grenade' }, tags: ['elite', 'black'] });
  R({ id: 'shadow_trooper', name: 'Shadow Trooper', sub: 'Empire', team: 'empire', look: tr({ helmet: '#1a1a1e', plate: '#202024', helmetStripe: '#2a2a30' }), stats: Object.assign({}, trStats, { skill: 0.6 }), loadout: { handF: 'e11' } });
  R({ id: 'tie_pilot', name: 'TIE Pilot', sub: 'Empire', team: 'empire', look: armor({ head: 'pilot', helmet: '#141518', insignia: '#9a9ea8', style: 'jumpsuit', plate: '#18191c', under: '#18191c' }), stats: Object.assign({}, trStats, { skill: 0.5 }), loadout: { handF: 'se14' }, tags: ['pilot'] });
  R({ id: 'imperial_officer', name: 'Imperial Officer', sub: 'Empire', team: 'empire', look: { head: 'officer', skin: '#e8c0a0', helmet: '#6a6e62', torso: { style: 'uniform', color: '#6a6e62', badge: '#b83030' }, arms: { color: '#6a6e62', glove: '#1a1a1a' }, legs: { color: '#6a6e62', boots: '#111' } }, stats: Object.assign({}, trStats, { skill: 0.4 }), loadout: { handF: 'se14' }, ai: { mode: 'defensive' }, tags: ['officer'] });
  R({ id: 'royal_guard', name: 'Royal Guard', sub: 'Empire', team: 'empire', scale: 1.05, look: { head: 'royal', torso: { style: 'robe', color: '#a01818', belt: '#6a0a0a' }, arms: { color: '#a01818', sleeve: '#a01818', glove: '#6a0a0a' }, legs: { color: '#8a1414', boots: '#6a0a0a' }, robeSkirt: '#a01818', robeSkirtLen: 1.0, cape: '#a01818', capeLen: 1.3 }, stats: Object.assign({}, trStats, { health: 1.4, strength: 1.5, skill: 0.7 }), loadout: { handF: 'force_pike' }, tags: ['guard', 'red'] });

  /* ---------------- Rebels & heroes ---------------- */
  R({ id: 'han', name: 'Han Solo', sub: 'Rebels', team: 'rebel', desc: 'Shoots first.', look: { head: 'human', skin: '#e8b894', hair: { style: 'short', color: '#5a3a1e' }, torso: { style: 'vest', color: '#1a1a1c', shirt: '#ece6d8', belt: '#3a2a1a' }, arms: { color: '#ece6d8', glove: '#e8b894' }, legs: { color: '#2a3a5a', boots: '#1a1a1a' } }, stats: { health: 1.1, skill: 0.85, speed: 1.1 }, loadout: { handF: 'dl44' }, tags: ['smuggler', 'hero'] });
  R({ id: 'leia', name: 'Princess Leia', sub: 'Rebels', team: 'rebel', scale: 0.92, look: { head: 'human', skin: '#f0c8a8', hair: { style: 'buns', color: '#4a2a14' }, torso: { style: 'dress', color: '#f4f4f2', belt: '#c0b090' }, arms: { color: '#f4f4f2', glove: '#f0c8a8' }, legs: { color: '#f4f4f2', boots: '#e8e8e4' }, robeSkirt: '#f4f4f2', robeSkirtLen: 1.1 }, stats: { skill: 0.8, speed: 1.1 }, loadout: { handF: 'dc17' }, tags: ['princess', 'hero'] });
  R({ id: 'chewbacca', name: 'Chewbacca', sub: 'Rebels', team: 'rebel', scale: 1.22, desc: 'Wookiee strength and a bowcaster.', look: { head: 'wookiee', skin: '#6a4a2c', torso: { style: 'fur', color: '#6a4a2c', bandolier: '#8a8e96' }, arms: { color: '#6a4a2c', glove: '#5a3a20' }, legs: { color: '#6a4a2c', boots: '#5a3a20' } }, stats: { health: 1.8, strength: 2.2, skill: 0.6, knockResist: 1.6 }, loadout: { handF: 'bowcaster' }, tags: ['wookiee'] });
  R({ id: 'rebel_trooper', name: 'Rebel Trooper', sub: 'Rebels', team: 'rebel', look: { head: 'rebel', skin: '#e8b894', helmet: '#e8e4dc', torso: { style: 'jumpsuit', color: '#3a4a6a', vest: '#d8d0bc', belt: '#2a2a2a' }, arms: { color: '#3a4a6a', glove: '#2a2a2a' }, legs: { color: '#6a6a5a', boots: '#1a1a1a' } }, stats: { skill: 0.45 }, loadout: { handF: 'a280' }, ai: { grenades: 1, grenadeType: 'thermal_detonator' } });
  R({ id: 'rebel_pilot', name: 'Rebel Pilot', sub: 'Rebels', team: 'rebel', look: { head: 'pilot', helmet: '#e8e4dc', insignia: '#c83030', torso: { style: 'jumpsuit', color: '#d86a2a', vest: '#e8e0d0', belt: '#2a2a2a' }, arms: { color: '#d86a2a', glove: '#2a2a2a' }, legs: { color: '#d86a2a', boots: '#1a1a1a' } }, stats: { skill: 0.5 }, loadout: { handF: 'dc17' } });
  R({ id: 'hoth_rebel', name: 'Echo Base Soldier', sub: 'Rebels', team: 'rebel', look: { head: 'rebel', skin: '#e8b894', helmet: '#d8d4c8', torso: { style: 'jumpsuit', color: '#c8c0a8', vest: '#a89878', belt: '#4a4a3a' }, arms: { color: '#c8c0a8', glove: '#5a5040' }, legs: { color: '#b8b098', boots: '#5a5040' } }, stats: { skill: 0.45 }, loadout: { handF: 'a280' } });

  /* ---------------- Bounty hunters ---------------- */
  R({ id: 'boba', name: 'Boba Fett', sub: 'Bounty Hunters', team: 'bounty', desc: 'Jetpack, carbine and wrist rockets.', look: { head: 'mando', helmet: '#5a7a4a', visorStripe: '#8a2020', torso: { style: 'mando', color: '#5a7a4a', under: '#6a6a50', plate2: '#8a6a3a', belt: '#5a4a32' }, arms: { color: '#6a6a50', armor: '#8a2020', gauntlet: '#5a7a4a', glove: '#3a3024' }, legs: { color: '#6a6a50', armor: '#5a6a4a', boots: '#3a3024' }, cape: '#6a5a3a', capeLen: 0.8 }, stats: { health: 1.5, skill: 0.8, speed: 1.05, armor: { blaster: 0.55, cut: 0.9, explosive: 0.8 } }, loadout: { handF: 'ee3', back: 'jetpack' }, ai: { grenades: 2, grenadeType: 'thermal_detonator' }, tags: ['mandalorian', 'fett', 'jetpack'] });
  R({ id: 'jango', name: 'Jango Fett', sub: 'Bounty Hunters', team: 'bounty', desc: 'Dual pistols and a jetpack.', look: { head: 'mando', helmet: '#9aa4b0', visorStripe: '#3a5a9a', torso: { style: 'mando', color: '#9aa4b0', under: '#3a4a6a', plate2: '#8a94a0', belt: '#4a3a2a' }, arms: { color: '#3a4a6a', armor: '#9aa4b0', gauntlet: '#9aa4b0', glove: '#2a2a2a' }, legs: { color: '#3a4a6a', armor: '#9aa4b0', boots: '#2a2a2a' } }, stats: { health: 1.4, skill: 0.85, speed: 1.1, armor: { blaster: 0.6, explosive: 0.8 } }, loadout: { handF: 'westar', handB: 'westar', back: 'jetpack' }, ai: { grenades: 1, grenadeType: 'seismic_charge' }, tags: ['mandalorian', 'fett', 'dual'] });
  R({ id: 'mandalorian', name: 'Mandalorian Warrior', sub: 'Bounty Hunters', team: 'bounty', look: { head: 'mando', helmet: '#b8bcc4', visorStripe: null, torso: { style: 'mando', color: '#b8bcc4', under: '#3a3a3a', plate2: '#a8acb4', belt: '#4a3a2a' }, arms: { color: '#3a3a3a', armor: '#b8bcc4', gauntlet: '#b8bcc4', glove: '#2a2a2a' }, legs: { color: '#4a4a4a', armor: '#b8bcc4', boots: '#2a2a2a' }, cape: '#5a4a3a' }, stats: { health: 1.5, skill: 0.75, armor: { blaster: 0.35, cut: 0.7, explosive: 0.7 } }, loadout: { handF: 'ee3', back: 'jetpack' }, material: 'beskar', tags: ['beskar'] });
  R({ id: 'trandoshan', name: 'Trandoshan Hunter', sub: 'Bounty Hunters', team: 'bounty', scale: 1.08, look: { head: 'trandoshan', skin: '#7a8a4a', torso: { style: 'vest', color: '#5a4a3a', shirt: '#6a6a4a', belt: '#3a2a1a' }, arms: { color: '#7a8a4a', glove: '#7a8a4a' }, legs: { color: '#5a5040', boots: '#7a8a4a' } }, stats: { health: 1.4, strength: 1.5, skill: 0.5 }, loadout: { handF: 'scatter' } });

  /* ---------------- Aliens & civilians ---------------- */
  R({ id: 'tusken', name: 'Tusken Raider', sub: 'Aliens', team: 'wild', look: { head: 'tusken', torso: { style: 'wrap', color: '#c8b490' }, arms: { color: '#c8b490', glove: '#a8946e' }, legs: { color: '#b8a480', boots: '#8a7a5a' }, robeSkirt: '#c8b490', robeSkirtLen: 0.8 }, stats: { health: 1.1, strength: 1.3, skill: 0.4 }, loadout: { handF: 'gaffi_stick' }, tags: ['sand people', 'tatooine'] });
  R({ id: 'jawa', name: 'Jawa', sub: 'Aliens', team: 'neutral', scale: 0.55, look: { head: 'jawa', torso: { style: 'robe', color: '#6a4a2a', belt: '#3a2a1a' }, arms: { color: '#6a4a2a', sleeve: '#6a4a2a', glove: '#3a2a1a' }, legs: { color: '#6a4a2a', boots: '#3a2a1a' }, robeSkirt: '#6a4a2a', robeSkirtLen: 1.3 }, build: { headR: 0.16 }, stats: { health: 0.8, speed: 1.3, skill: 0.3 }, loadout: { handF: 'ion_blaster' }, ai: { mode: 'passive' }, tags: ['scavenger', 'utinni'] });
  R({ id: 'gamorrean', name: 'Gamorrean Guard', sub: 'Aliens', team: 'wild', scale: 1.1, look: { head: 'gamorrean', skin: '#7a9a4a', torso: { style: 'fur', color: '#5a4a3a' }, arms: { color: '#7a9a4a', glove: '#7a9a4a', armor: '#5a4a3a' }, legs: { color: '#5a4a3a', boots: '#3a2a1a' } }, build: { torsoW: 0.4 }, stats: { health: 1.6, strength: 1.8, speed: 0.85, skill: 0.3 }, loadout: { handF: 'vibroaxe' }, tags: ['pig', 'guard'] });
  R({ id: 'rodian', name: 'Rodian Bounty Hunter', sub: 'Aliens', team: 'bounty', look: { head: 'rodian', skin: '#5c9a4a', torso: { style: 'vest', color: '#6a5a8a', shirt: '#3a4a5a', belt: '#2a2a2a' }, arms: { color: '#3a4a5a', glove: '#5c9a4a' }, legs: { color: '#4a4a3a', boots: '#2a2a2a' } }, stats: { skill: 0.35 }, loadout: { handF: 'dl44' }, tags: ['greedo'] });
  R({ id: 'twilek', name: "Twi'lek Smuggler", sub: 'Aliens', team: 'neutral', look: { head: 'twilek', skin: '#c85a4a', torso: { style: 'vest', color: '#3a2a2a', shirt: '#6a3a3a', belt: '#1a1a1a' }, arms: { color: '#c85a4a', glove: '#c85a4a' }, legs: { color: '#2a2a2a', boots: '#1a1a1a' } }, stats: { skill: 0.5, speed: 1.1 }, loadout: { handF: 'dl44' }, ai: { mode: 'passive' } });
  R({ id: 'ewok', name: 'Ewok Warrior', sub: 'Aliens', team: 'rebel', scale: 0.55, look: { head: 'ewok', skin: '#7a5a3a', hood: '#b0885a', torso: { style: 'fur', color: '#7a5a3a' }, arms: { color: '#7a5a3a', glove: '#6a4a2a' }, legs: { color: '#7a5a3a', boots: '#6a4a2a' } }, build: { headR: 0.18 }, stats: { health: 0.9, speed: 1.2, jump: 1.2, skill: 0.4 }, loadout: { handF: 'vibroblade' }, tags: ['endor', 'teddy'] });
  R({ id: 'moncal', name: 'Mon Calamari Officer', sub: 'Aliens', team: 'rebel', look: { head: 'moncal', skin: '#c86a4a', torso: { style: 'uniform', color: '#e8e4dc', badge: '#3a5a8a' }, arms: { color: '#e8e4dc', glove: '#c86a4a' }, legs: { color: '#e8e4dc', boots: '#6a4a3a' } }, stats: { skill: 0.5 }, loadout: { handF: 'dc17' }, ai: { mode: 'defensive' }, tags: ['admiral'] });
  R({ id: 'gungan', name: 'Gungan Soldier', sub: 'Aliens', team: 'republic', amphibious: true, desc: 'Amphibious: breathes underwater.', look: { head: 'gungan', skin: '#c89a6a', torso: { style: 'vest', color: '#6a5a3a', shirt: '#8a7a5a', belt: '#3a2a1a' }, arms: { color: '#c89a6a', glove: '#c89a6a' }, legs: { color: '#8a7a5a', boots: '#c89a6a' } }, stats: { speed: 1.1, jump: 1.4, skill: 0.3 }, loadout: { handF: 'stun_baton' } });
  R({ id: 'bith', name: 'Bith Musician', sub: 'Aliens', team: 'neutral', look: { head: 'bith', skin: '#e8c8a8', torso: { style: 'uniform', color: '#2a2a2e', badge: '#c8a040' }, arms: { color: '#2a2a2e', glove: '#e8c8a8' }, legs: { color: '#2a2a2e', boots: '#1a1a1a' } }, stats: {}, ai: { mode: 'flee' }, tags: ['cantina'] });
  R({ id: 'civilian', name: 'Civilian', sub: 'Aliens', team: 'neutral', look: { head: 'human', skin: '#c8906a', hair: { style: 'short', color: '#2a1a0a' }, torso: { style: 'vest', color: '#8a6a4a', shirt: '#c8c0a8', belt: '#3a2a1a' }, arms: { color: '#c8c0a8', glove: '#c8906a' }, legs: { color: '#5a5040', boots: '#3a2a1a' } }, stats: { skill: 0.2 }, ai: { mode: 'flee' }, tags: ['human', 'ragdoll'] });
})();
