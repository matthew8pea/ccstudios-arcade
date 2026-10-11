/* GALACTIC PLAYGROUND content — droids (humanoid droids use the character system with mech: true). */
'use strict';

(() => {
  const M = GP.M, D = GP.Draw, OL = D.OUTLINE;
  const R = (d) => GP.Registry.register(Object.assign({ category: 'Droids' }, d));
  const rr = (ctx, x, y, w, h, r, f, s = true) => { D.roundRect(ctx, x - w / 2, y - h / 2, w, h, r); if (f) { ctx.fillStyle = f; ctx.fill(); } if (s) { ctx.strokeStyle = OL; ctx.lineWidth = 0.022; ctx.stroke(); } };

  const b1Build = { headR: 0.1, torsoW: 0.2, torsoH: 0.5, armW: 0.06, foreW: 0.055, handW: 0.06, thighW: 0.07, shinW: 0.065, footL: 0.22 };
  const b1Look = (mark) => ({ head: 'b1', skin: '#c8b48a', mark, mech: true, torso: { style: 'b1', color: '#c8b48a', mark }, arms: { color: '#c0ac82', joint: '#8a7a5a' }, legs: { color: '#c0ac82', joint: '#8a7a5a' } });
  const droidStats = (o) => Object.assign({ health: 0.75, speed: 0.9, jump: 0.8, strength: 0.9, skill: 0.22, knockResist: 0.9, armor: { blaster: 1, electric: 1.6, ion: 2.5, cut: 1.1 } }, o);

  R({ id: 'b1_droid', name: 'B1 Battle Droid', sub: 'Battle droids', kind: 'character', team: 'separatist', mech: true, voice: 'b1', density: 90, build: b1Build, look: b1Look(null), stats: droidStats(), loadout: { handF: 'e5' }, tags: ['roger roger', 'clanker', 'separatist'] });
  R({ id: 'b1_commander', name: 'B1 Commander', sub: 'Battle droids', kind: 'character', team: 'separatist', mech: true, voice: 'b1', density: 90, build: b1Build, look: b1Look('#c8a020'), stats: droidStats({ skill: 0.3 }), loadout: { handF: 'e5' } });
  R({ id: 'b1_security', name: 'B1 Security Droid', sub: 'Battle droids', kind: 'character', team: 'separatist', mech: true, voice: 'b1', density: 90, build: b1Build, look: b1Look('#b03030'), stats: droidStats(), loadout: { handF: 'e5' } });
  R({ id: 'b1_pilot', name: 'B1 Pilot Droid', sub: 'Battle droids', kind: 'character', team: 'separatist', mech: true, voice: 'b1', density: 90, build: b1Build, look: b1Look('#2a5ab0'), stats: droidStats(), loadout: { handF: 'e5' } });
  R({ id: 'b2_droid', name: 'B2 Super Battle Droid', sub: 'Battle droids', kind: 'character', team: 'separatist', mech: true, scale: 1.08, density: 170,
    build: { headR: 0.1, torsoW: 0.42, torsoH: 0.55, armW: 0.13, foreW: 0.15, handW: 0.1, thighW: 0.14, shinW: 0.13 },
    look: { head: 'b2', skin: '#4a5060', mech: true, torso: { style: 'b2', color: '#4a5060' }, arms: { color: '#4a5060', plate: '#5a6070', joint: '#2a2e36' }, legs: { color: '#4a5060', plate: '#5a6070', joint: '#2a2e36' } },
    stats: droidStats({ health: 1.5, strength: 1.6, speed: 0.85, skill: 0.3, knockResist: 1.5, armor: { blaster: 0.75, electric: 1.3, ion: 2, cut: 1 } }), loadout: { handF: 'wrist_blaster' }, tags: ['super', 'heavy'] });
  R({ id: 'bx_commando', name: 'BX Commando Droid', sub: 'Battle droids', kind: 'character', team: 'separatist', mech: true, density: 110, build: b1Build,
    look: { head: 'b1', skin: '#6a6048', mech: true, torso: { style: 'b1', color: '#6a6048', mark: '#2a2a2a' }, arms: { color: '#6a6048', joint: '#3a3428' }, legs: { color: '#6a6048', joint: '#3a3428' } },
    stats: droidStats({ health: 1.1, speed: 1.3, jump: 1.3, strength: 1.3, skill: 0.55, agility: 1.4 }), loadout: { handF: 'vibroblade' }, tags: ['commando', 'melee'] });
  R({ id: 'magnaguard', name: 'IG-100 MagnaGuard', sub: 'Battle droids', kind: 'character', team: 'separatist', mech: true, scale: 1.1, density: 120,
    build: { headR: 0.11, torsoW: 0.24, armW: 0.07, foreW: 0.065, thighW: 0.08, shinW: 0.075 },
    look: { head: 'magna', mech: true, torso: { style: 'droid', color: '#2a2420' }, arms: { color: '#3a322a', joint: '#1a1614' }, legs: { color: '#3a322a', joint: '#1a1614' }, cape: '#4a1a1a', capeLen: 1.1 },
    stats: droidStats({ health: 1.4, strength: 1.5, skill: 0.7, speed: 1.1, agility: 1.3, armor: { blaster: 0.8, electric: 0.8, ion: 1.5 } }), loadout: { handF: 'electrostaff' }, tags: ['bodyguard', 'grievous'] });
  R({ id: 'protocol_droid', name: 'Protocol Droid (gold)', sub: 'Service droids', kind: 'character', team: 'neutral', mech: true, density: 110,
    build: { headR: 0.12, torsoW: 0.28, armW: 0.08, foreW: 0.075, thighW: 0.09, shinW: 0.085 },
    look: { head: 'protocol', skin: '#d8b048', mech: true, torso: { style: 'protocol', color: '#d8b048' }, arms: { color: '#d0a840', plate: '#e0bc58', joint: '#8a7030' }, legs: { color: '#d0a840', plate: '#e0bc58', joint: '#8a7030' } },
    stats: droidStats({ speed: 0.7, jump: 0.5, skill: 0.1, agility: 0.7 }), ai: { mode: 'flee' }, voice: 'protocol', tags: ['translator', 'fussy'] });
  R({ id: 'protocol_silver', name: 'Protocol Droid (silver)', sub: 'Service droids', kind: 'character', team: 'neutral', mech: true, density: 110,
    build: { headR: 0.12, torsoW: 0.28, armW: 0.08, foreW: 0.075, thighW: 0.09, shinW: 0.085 },
    look: { head: 'protocol', skin: '#b8bcc4', mech: true, torso: { style: 'protocol', color: '#b8bcc4' }, arms: { color: '#aeb2ba', plate: '#c8ccd4', joint: '#6a6e76' }, legs: { color: '#aeb2ba', plate: '#c8ccd4', joint: '#6a6e76' } },
    stats: droidStats({ speed: 0.7, skill: 0.1 }), ai: { mode: 'flee' } });
  R({ id: 'kx_droid', name: 'KX Security Droid', sub: 'Security droids', kind: 'character', team: 'empire', mech: true, scale: 1.2, density: 120,
    build: { headR: 0.12, torsoW: 0.3, armW: 0.085, foreW: 0.08, thighW: 0.1, shinW: 0.09, upperArm: 0.38, forearm: 0.36 },
    look: { head: 'kx', skin: '#1c1d20', mech: true, torso: { style: 'droid', color: '#1e1f22', mark: '#5a5e66' }, arms: { color: '#1e1f22', plate: '#2a2b30', joint: '#0e0f11' }, legs: { color: '#1e1f22', plate: '#2a2b30', joint: '#0e0f11' } },
    stats: droidStats({ health: 1.6, strength: 2.2, speed: 1.1, skill: 0.6, knockResist: 1.6, armor: { blaster: 0.7, electric: 1.2, ion: 1.8 } }), loadout: { handF: 'e11' }, tags: ['imperial', 'enforcer'] });
  R({ id: 'ig_droid', name: 'IG Assassin Droid', sub: 'Security droids', kind: 'character', team: 'bounty', mech: true, scale: 1.12, density: 110,
    build: { headR: 0.11, torsoW: 0.2, armW: 0.07, foreW: 0.065, thighW: 0.08, shinW: 0.075 },
    look: { head: 'ig', mech: true, torso: { style: 'droid', color: '#4a4e54' }, arms: { color: '#5a5e64', joint: '#2a2e34' }, legs: { color: '#5a5e64', joint: '#2a2e34' } },
    stats: droidStats({ health: 1.3, skill: 0.75, speed: 1.1, armor: { blaster: 0.8, ion: 1.8 } }), loadout: { handF: 'dlt19' }, tags: ['bounty hunter', 'assassin'] });
  R({ id: 'crash_droid', name: 'Crash Test Droid', sub: 'Sandbox droids', kind: 'character', team: 'neutral', mech: true, ai: false, density: 120,
    look: { head: 'dummy', skin: '#e8a030', mech: false, torso: { style: 'dummy', color: '#e8a030' }, arms: { color: '#e8a030', glove: '#2a2a2a' }, legs: { color: '#e8a030', boots: '#2a2a2a' } },
    stats: droidStats({ health: 3, armor: { blaster: 1, electric: 1, ion: 1, cut: 1 } }), desc: 'No AI. Built to be thrown around.', tags: ['dummy', 'test', 'ragdoll'] });

  /* ---------------- non-humanoid droids ---------------- */
  const astroPaint = (main, accent) => (ctx, e) => {
    // legs
    ctx.fillStyle = '#d8dce2'; ctx.strokeStyle = OL; ctx.lineWidth = 0.022;
    D.roundRect(ctx, -0.36, -0.7, 0.12, 0.66, 0.03); ctx.fill(); ctx.stroke();
    rr(ctx, -0.3, -0.05, 0.22, 0.1, 0.02, '#b8bcc4');
    rr(ctx, 0.28, -0.05, 0.2, 0.1, 0.02, '#b8bcc4');
    // body
    rr(ctx, 0, -0.42, 0.5, 0.62, 0.05, '#e8ecf0');
    rr(ctx, 0.02, -0.5, 0.3, 0.14, 0.02, main, false);
    rr(ctx, 0.02, -0.3, 0.14, 0.2, 0.02, main, false);
    rr(ctx, -0.12, -0.3, 0.08, 0.2, 0.02, main, false);
    // dome
    ctx.beginPath(); ctx.arc(0, -0.74, 0.26, Math.PI, 0); ctx.closePath(); ctx.fillStyle = '#c8ccd4'; ctx.fill(); ctx.stroke();
    ctx.fillStyle = main; ctx.fillRect(-0.18, -0.9, 0.14, 0.1); ctx.fillRect(0.04, -0.86, 0.1, 0.08);
    ctx.fillStyle = '#101216'; ctx.beginPath(); ctx.arc(0.13, -0.84, 0.05, 0, 7); ctx.fill();
    const blink = Math.sin((e.t || 0) * 5) > 0;
    ctx.fillStyle = blink ? accent : '#401010'; ctx.beginPath(); ctx.arc(0.2, -0.79, 0.025, 0, 7); ctx.fill();
  };
  R({ id: 'astromech', name: 'Astromech (blue)', sub: 'Astromechs', kind: 'bot', team: 'neutral', hp: 180, density: 170, material: 'droid',
    shapes: [{ box: [0.5, 0.62, 0, -0.42] }, { circle: [0.26, 0, -0.72] }, { box: [0.7, 0.1, 0, -0.05] }],
    bot: { locomotion: 'roll', uprightRoll: true, speed: 2.2, jump: 4, rockets: true, companion: true, range: 1.1 }, zap: { range: 1.4, damage: 18, cooldown: 1.2 }, voice: 'astro',
    paint: astroPaint('#2a5ab0', '#ff3030'), desc: 'Loyal, beeping, electrifying. Flies with booster rockets (jump).', tags: ['r2', 'artoo', 'beep'] });
  R({ id: 'astromech_red', name: 'Astromech (red)', sub: 'Astromechs', kind: 'bot', team: 'neutral', hp: 180, density: 170, material: 'droid',
    shapes: [{ box: [0.5, 0.62, 0, -0.42] }, { circle: [0.26, 0, -0.72] }, { box: [0.7, 0.1, 0, -0.05] }],
    bot: { locomotion: 'roll', uprightRoll: true, speed: 2.2, jump: 4, companion: true, range: 1.1 }, zap: { range: 1.4, damage: 18, cooldown: 1.2 }, voice: 'astro', paint: astroPaint('#b03030', '#40a0ff'), tags: ['r5'] });
  R({ id: 'probe_droid', name: 'Probe Droid', sub: 'Security droids', kind: 'bot', team: 'empire', hp: 140, density: 120, material: 'droid', eye: [0.18, -0.02, '#ff3030'],
    shapes: [{ circle: [0.32] }], bot: { locomotion: 'hover', hoverHeight: 2.6, speed: 2.5, range: 9, skill: 0.4, sight: 22 },
    weapon: { muzzle: [0.3, 0.2], damage: 12, rate: 1.6, speed: 45, color: '#ff3030', spread: 0.06 },
    paint: (ctx, e) => { const t = e.t || 0; ctx.strokeStyle = '#2a2c30'; ctx.lineWidth = 0.035; for (let i = 0; i < 5; i++) { const x = -0.2 + i * 0.1; ctx.beginPath(); ctx.moveTo(x, 0.2); ctx.quadraticCurveTo(x + Math.sin(t * 2 + i) * 0.08, 0.6, x + Math.sin(t * 1.5 + i) * 0.12, 0.95); ctx.stroke(); } ctx.beginPath(); ctx.arc(0, 0, 0.32, 0, 7); ctx.fillStyle = '#26282c'; ctx.fill(); ctx.strokeStyle = OL; ctx.lineWidth = 0.025; ctx.stroke(); rr(ctx, 0, -0.34, 0.08, 0.2, 0.02, '#1a1a1e'); for (const [x, y] of [[0.16, -0.02], [0.05, 0.12], [0.05, -0.16]]) { ctx.beginPath(); ctx.arc(x, y, 0.05, 0, 7); ctx.fillStyle = '#0a0a0c'; ctx.fill(); } },
    thrusterColor: '#ff9a50', tags: ['viper', 'hoth', 'scout'] });
  R({ id: 'mouse_droid', name: 'Mouse Droid', sub: 'Service droids', kind: 'bot', team: 'neutral', hp: 50, density: 150, material: 'droid', aiMode: 'flee',
    shapes: [{ box: [0.42, 0.2, 0, -0.1] }], bot: { locomotion: 'scurry', speed: 4, sight: 8 }, voice: 'astro',
    paint: (ctx) => { rr(ctx, 0, -0.12, 0.42, 0.2, 0.03, '#2a2c30'); rr(ctx, 0.05, -0.2, 0.24, 0.06, 0.02, '#5a5e66'); ctx.fillStyle = '#ff3a2a'; ctx.fillRect(0.16, -0.14, 0.04, 0.03); ctx.fillStyle = '#1a1a1a'; for (const x of [-0.12, 0.12]) { ctx.beginPath(); ctx.arc(x, -0.01, 0.035, 0, 7); ctx.fill(); } }, tags: ['msc', 'squeak'] });
  R({ id: 'gonk_droid', name: 'Gonk Power Droid', sub: 'Service droids', kind: 'bot', team: 'neutral', hp: 220, density: 220, material: 'droid',
    shapes: [{ box: [0.55, 0.8, 0, -0.52] }, { box: [0.6, 0.1, 0, -0.05] }], bot: { locomotion: 'waddle', speed: 0.6, torque: 1.5 },
    paint: (ctx, e) => { const k = Math.sin((e.t || 0) * 8) * 0.03; rr(ctx, -0.14, -0.07 + k, 0.1, 0.14, 0.02, '#3a3a3a'); rr(ctx, 0.14, -0.07 - k, 0.1, 0.14, 0.02, '#3a3a3a'); rr(ctx, 0, -0.52, 0.55, 0.8, 0.06, '#8a8a7a'); rr(ctx, 0, -0.6, 0.4, 0.2, 0.02, '#5a5a4e'); ctx.fillStyle = '#c8a040'; ctx.fillRect(-0.15, -0.35, 0.3, 0.06); },
    desc: 'Gonk.', tags: ['gonk', 'power'] });
  R({ id: 'training_remote', name: 'Training Remote', sub: 'Sandbox droids', kind: 'bot', team: 'rogue', hp: 60, density: 150, material: 'droid', eye: [0.1, 0, '#ff5040'],
    shapes: [{ circle: [0.15] }], bot: { locomotion: 'hover', hoverHeight: 1.8, speed: 2.5, range: 4, skill: 0.5, sight: 12 },
    weapon: { muzzle: [0.15, 0], damage: 4, rate: 1.4, speed: 30, color: '#ff8060', size: 0.03, len: 0.25, spread: 0.1, pitch: 1.8 },
    paint: (ctx) => { ctx.beginPath(); ctx.arc(0, 0, 0.15, 0, 7); ctx.fillStyle = '#6a6e76'; ctx.fill(); ctx.strokeStyle = OL; ctx.lineWidth = 0.02; ctx.stroke(); ctx.fillStyle = '#3a3e46'; ctx.fillRect(-0.15, -0.02, 0.3, 0.04); for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(Math.cos(i * 1.57) * 0.09, Math.sin(i * 1.57) * 0.09, 0.02, 0, 7); ctx.fill(); } },
    desc: 'Floating practice drone that stings with tiny bolts. Perfect for deflection drills.', tags: ['seeker', 'practice'] });
  R({ id: 'droideka', name: 'Droideka', sub: 'Battle droids', kind: 'droideka', team: 'separatist', hp: 220, density: 260, material: 'droid', bot: { speed: 1.2, sight: 26 },
    desc: 'Rolls in, unfolds, raises a deflector shield and opens fire.', tags: ['destroyer', 'shield', 'wheel'] });
})();
