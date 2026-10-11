/* GALACTIC PLAYGROUND content — lightsabers, blasters, melee weapons, explosives, jetpacks. */
'use strict';

(() => {
  const M = GP.M, D = GP.Draw, OL = D.OUTLINE, C = GP.BLADE_COLORS;
  const R = (list) => list.forEach((d) => GP.Registry.register(d));

  /* ---------------- lightsabers ---------------- */
  function hiltArt(o) {
    const L = o.len || 0.28, w = o.w || 0.055;
    const x0 = o.double ? -L / 2 : -L / 2;
    return (ctx) => {
      if (o.curved) {
        ctx.beginPath(); ctx.moveTo(-L / 2, 0.02); ctx.quadraticCurveTo(-L * 0.1, 0.07, L / 2, -0.005); ctx.lineTo(L / 2, -0.035); ctx.quadraticCurveTo(-L * 0.1, 0.02, -L / 2, -0.03); ctx.closePath();
        ctx.fillStyle = o.body || '#b8bec8'; ctx.fill(); ctx.strokeStyle = OL; ctx.lineWidth = 0.014; ctx.stroke();
        ctx.fillStyle = o.accent || '#3a2a20'; ctx.fillRect(-L * 0.3, -0.01, L * 0.3, 0.04);
        return;
      }
      D.roundRect(ctx, x0, -w / 2, L, w, 0.012);
      ctx.fillStyle = o.body || '#b8bec8'; ctx.fill(); ctx.strokeStyle = OL; ctx.lineWidth = 0.014; ctx.stroke();
      ctx.fillStyle = o.grip || '#24262b';
      const g0 = o.double ? -L * 0.18 : -L / 2 + 0.03, gl = o.double ? L * 0.36 : L * 0.45;
      for (let i = 0; i < 5; i++) ctx.fillRect(g0 + i * gl / 5, -w / 2 - 0.004, gl / 10, w + 0.008);
      ctx.fillStyle = o.accent || '#5a5e66';
      ctx.fillRect(L / 2 - 0.05, -w / 2 - 0.01, 0.05, w + 0.02);
      if (o.double) ctx.fillRect(-L / 2, -w / 2 - 0.01, 0.05, w + 0.02);
      if (o.button) { ctx.fillStyle = o.button; ctx.fillRect(L * 0.05, -w / 2 - 0.012, 0.03, 0.015); }
      if (o.guard) { ctx.fillStyle = o.body || '#555'; ctx.fillRect(L / 2 - 0.06, -0.07, 0.035, 0.14); ctx.strokeRect(L / 2 - 0.06, -0.07, 0.035, 0.14); }
      if (o.ring) { ctx.strokeStyle = o.body; ctx.lineWidth = 0.02; ctx.beginPath(); ctx.arc(0, 0, 0.16, 0, 7); ctx.stroke(); }
    };
  }
  function saber(id, name, color, o = {}) {
    const len = o.len || 0.28;
    const blades = o.double
      ? [{ x: len / 2, a: 0, len: o.blade || 1.0 }, { x: -len / 2, a: Math.PI, len: o.blade || 1.0 }]
      : [{ x: len / 2, a: 0, len: o.blade || 1.08 }];
    if (o.guard) blades.push({ x: len / 2 - 0.045, y: -0.02, a: -Math.PI / 2, len: 0.16 }, { x: len / 2 - 0.045, y: 0.02, a: Math.PI / 2, len: 0.16 });
    return Object.assign({
      id, name, kind: 'saber', category: 'Lightsabers', sub: o.sub || 'Single blade', color,
      shapes: [{ box: [len, 0.06] }], mass: o.double ? 1.6 : len < 0.22 ? 0.7 : 1.0, grip: o.double ? [0, 0] : [-len * 0.22, 0], gripTilt: o.double ? -0.1 : -1.05,
      blades, paint: hiltArt(Object.assign({ len }, o.hilt || {}, { double: o.double, curved: o.curved, guard: o.guard })),
      dps: o.dps || 260, twoHanded: !!o.double, pitch: o.pitch || 1, bladeWidth: o.width || 0.055, unstable: !!o.guard || o.unstable, dark: !!o.dark,
      desc: o.desc || '', tags: ['saber', 'lightsaber', 'jedi', 'sith', ...(o.tags || [])],
    }, o.extra || {});
  }
  R([
    saber('saber_luke', "Luke's Lightsaber", C.green, { sub: 'Iconic', hilt: { body: '#2a2c30', grip: '#111', accent: '#8a8e96', button: '#c83030' }, desc: 'Self-built green blade.' }),
    saber('saber_anakin', "Anakin's Lightsaber", C.blue, { sub: 'Iconic', hilt: { body: '#c8ccd4', grip: '#2a2a2a', accent: '#6a6e76', button: '#c8a040' } }),
    saber('saber_obiwan', "Obi-Wan's Lightsaber", C.blue, { sub: 'Iconic', hilt: { body: '#b8bcc4', grip: '#3a3a3a', accent: '#8a6a40' } }),
    saber('saber_vader', "Vader's Lightsaber", C.red, { sub: 'Iconic', pitch: 0.85, hilt: { body: '#9aa0aa', grip: '#111', accent: '#1a1a1a', button: '#c83030' } }),
    saber('saber_yoda', "Yoda's Lightsaber", C.green, { sub: 'Iconic', len: 0.2, blade: 0.72, pitch: 1.25, hilt: { body: '#c8b890', grip: '#5a4a3a', accent: '#8a7a5a' } }),
    saber('saber_mace', "Mace Windu's Lightsaber", C.purple, { sub: 'Iconic', hilt: { body: '#d0c8a8', grip: '#3a3020', accent: '#c8a040' } }),
    saber('saber_ahsoka', "Ahsoka's Lightsaber", C.green, { sub: 'Iconic', hilt: { body: '#8a8e96', grip: '#2a2a2a', accent: '#3a3e46' } }),
    saber('saber_ahsoka_shoto', "Ahsoka's Shoto", '#c8ff3a', { sub: 'Iconic', len: 0.2, blade: 0.65, pitch: 1.2, hilt: { body: '#8a8e96', grip: '#2a2a2a' } }),
    saber('saber_maul', "Maul's Saberstaff", C.red, { sub: 'Iconic', double: true, len: 0.44, blade: 0.95, hilt: { body: '#2a2c30', grip: '#111', accent: '#6a6e76' } }),
    saber('saber_dooku', "Dooku's Curved Saber", C.red, { sub: 'Iconic', curved: true, hilt: { body: '#c8b070', accent: '#3a2a20' } }),
    saber('saber_grievous', 'Captured Jedi Saber', C.green, { sub: 'Iconic', hilt: { body: '#a8acb4', grip: '#1a1a1a' } }),
    saber('darksaber', 'Darksaber', C.darksaber, { sub: 'Iconic', dark: true, blade: 0.95, width: 0.07, hilt: { body: '#2a2a2a', grip: '#111', accent: '#4a4a4a' }, desc: 'An ancient black blade.' }),
    saber('saber_crossguard', 'Crossguard Saber', C.red, { sub: 'Unstable', guard: true, len: 0.3, pitch: 0.8, hilt: { body: '#4a4440', grip: '#1a1a1a' }, desc: 'Crackling, vented blade.' }),
    saber('saber_temple_pike', 'Temple Guard Pike', C.yellow, { sub: 'Double-bladed', double: true, len: 0.7, blade: 0.8, hilt: { body: '#d8c890', grip: '#5a4a2a', accent: '#8a7a4a' } }),
    saber('saber_inquisitor', 'Inquisitor Spinning Saber', C.red, { sub: 'Double-bladed', double: true, len: 0.36, blade: 0.9, hilt: { body: '#3a3c42', ring: true, grip: '#111' } }),
  ]);
  const colors = [['blue', C.blue], ['green', C.green], ['red', C.red], ['purple', C.purple], ['yellow', C.yellow], ['orange', C.orange], ['white', C.white]];
  for (const [n, c] of colors) {
    const cap = n[0].toUpperCase() + n.slice(1);
    GP.Registry.register(saber('saber_' + n, cap + ' Lightsaber', c, { sub: 'Single blade', tags: [n], hilt: { body: n === 'red' ? '#3a3c42' : '#b8bec8' } }));
    GP.Registry.register(saber('saber_double_' + n, cap + ' Double-bladed Saber', c, { sub: 'Double-bladed', double: true, len: 0.44, blade: 0.95, tags: [n, 'staff'], hilt: { body: n === 'red' ? '#2a2c30' : '#9aa0aa' } }));
    GP.Registry.register(saber('saber_shoto_' + n, cap + ' Shoto', c, { sub: 'Shoto', len: 0.2, blade: 0.62, pitch: 1.2, tags: [n, 'short'], hilt: { body: '#a8aeb8' } }));
  }

  /* ---------------- blasters ---------------- */
  // Art is drawn with +x forward; grip near the origin.
  const gunArt = {
    pistol: (c1, c2) => [{ t: 'poly', p: [-0.14, -0.05, 0.22, -0.05, 0.22, 0.01, 0.02, 0.02, 0.0, 0.14, -0.07, 0.14, -0.06, 0.03, -0.14, 0.02], f: c1, s: true }, { t: 'rect', x: 0.23, y: -0.03, w: 0.08, h: 0.035, f: c2, s: true }, { t: 'rect', x: 0.02, y: -0.07, w: 0.12, h: 0.035, f: c2, s: true }],
    heavyPistol: () => [{ t: 'poly', p: [-0.16, -0.06, 0.2, -0.06, 0.2, 0.01, 0.02, 0.02, 0.0, 0.15, -0.08, 0.15, -0.07, 0.03, -0.16, 0.02], f: '#2a2c30', s: true }, { t: 'rect', x: 0.26, y: -0.03, w: 0.16, h: 0.045, f: '#1a1a1e', s: true }, { t: 'rect', x: 0.3, y: -0.06, w: 0.05, h: 0.035, f: '#3a3c42' }, { t: 'rect', x: 0.03, y: -0.09, w: 0.16, h: 0.04, f: '#4a4c52', s: true }],
    rifle: (c1, c2, L = 0.75) => [{ t: 'poly', p: [-0.35, -0.02, -0.08, -0.06, L - 0.3, -0.06, L - 0.3, 0.02, 0.05, 0.03, 0.0, 0.15, -0.07, 0.15, -0.05, 0.03, -0.35, 0.06], f: c1, s: true }, { t: 'rect', x: L - 0.16, y: -0.025, w: 0.28, h: 0.035, f: c2, s: true }, { t: 'rect', x: 0.12, y: -0.09, w: 0.2, h: 0.04, f: c2, s: true }, { t: 'rect', x: 0.2, y: 0.04, w: 0.06, h: 0.1, f: c2, s: true }],
    heavy: (c1, c2) => [{ t: 'poly', p: [-0.4, -0.03, -0.1, -0.08, 0.6, -0.08, 0.6, 0.04, 0.06, 0.05, 0.0, 0.17, -0.08, 0.17, -0.06, 0.04, -0.4, 0.07], f: c1, s: true }, { t: 'rect', x: 0.78, y: -0.02, w: 0.4, h: 0.06, f: c2, s: true }, { t: 'rect', x: 0.3, y: 0.08, w: 0.08, h: 0.12, f: c2, s: true }, { t: 'rect', x: 0.2, y: -0.11, w: 0.28, h: 0.05, f: c2, s: true }],
    rotary: () => [{ t: 'rect', x: 0.15, y: -0.02, w: 0.7, h: 0.16, f: '#3a3c42', s: true, r: 0.03 }, { t: 'rect', x: 0.7, y: -0.05, w: 0.5, h: 0.04, f: '#1a1a1e', s: true }, { t: 'rect', x: 0.7, y: 0.0, w: 0.5, h: 0.04, f: '#1a1a1e', s: true }, { t: 'rect', x: 0.7, y: 0.05, w: 0.5, h: 0.04, f: '#1a1a1e', s: true }, { t: 'rect', x: -0.02, y: 0.12, w: 0.08, h: 0.14, f: '#2a2c30', s: true }, { t: 'rect', x: -0.25, y: 0.05, w: 0.3, h: 0.2, f: '#6a6e76', s: true, r: 0.03 }],
    sniper: () => [{ t: 'poly', p: [-0.4, -0.02, -0.08, -0.05, 0.6, -0.05, 0.6, 0.02, 0.05, 0.03, 0.0, 0.14, -0.07, 0.14, -0.05, 0.03, -0.4, 0.07], f: '#3a3a3e', s: true }, { t: 'rect', x: 0.95, y: -0.02, w: 0.7, h: 0.03, f: '#1a1a1e', s: true }, { t: 'rect', x: 0.15, y: -0.1, w: 0.3, h: 0.06, f: '#1a1a1e', s: true, r: 0.02 }, { t: 'circle', x: 0.3, y: -0.1, r: 0.025, f: '#40a0ff' }],
    bowcaster: () => [{ t: 'rect', x: 0.2, y: 0, w: 0.8, h: 0.08, f: '#6a4a2a', s: true }, { t: 'poly', p: [0.4, -0.25, 0.46, -0.25, 0.46, 0.25, 0.4, 0.25], f: '#8a8e96', s: true }, { t: 'line', p: [0.43, -0.25, 0.2, 0, 0.43, 0.25], s: '#c8c8c8', lw: 0.01 }, { t: 'rect', x: 0.0, y: 0.1, w: 0.07, h: 0.15, f: '#4a3a2a', s: true }, { t: 'rect', x: 0.66, y: 0, w: 0.2, h: 0.05, f: '#2a2a2a', s: true }],
    launcher: () => [{ t: 'rect', x: 0.15, y: -0.04, w: 1.1, h: 0.16, f: '#4a5040', s: true, r: 0.04 }, { t: 'rect', x: 0.72, y: -0.04, w: 0.08, h: 0.2, f: '#2a2c30', s: true }, { t: 'rect', x: 0.0, y: 0.1, w: 0.07, h: 0.14, f: '#2a2c30', s: true }, { t: 'rect', x: 0.2, y: -0.16, w: 0.12, h: 0.08, f: '#2a2c30', s: true }],
    wrist: () => [{ t: 'rect', x: 0.05, y: 0, w: 0.3, h: 0.08, f: '#4a5060', s: true, r: 0.02 }, { t: 'rect', x: 0.22, y: -0.02, w: 0.1, h: 0.03, f: '#1a1a1e', s: true }, { t: 'rect', x: 0.22, y: 0.02, w: 0.1, h: 0.03, f: '#1a1a1e', s: true }],
  };
  function blaster(id, name, sub, art, stats, o = {}) {
    return Object.assign({
      id, name, kind: 'blaster', category: 'Blasters', sub, art, stats, mass: o.mass || { Pistols: 1.2, Rifles: 3.5, Heavy: 11, Sniper: 5, Launchers: 7 }[sub] || 3,
      shapes: o.shapes || [{ box: [o.L || 0.4, 0.12, (o.L || 0.4) * 0.2, 0] }], grip: [0, 0.06], muzzle: o.muzzle || [0.3, -0.03],
      twoHanded: !!o.twoHanded, tags: ['gun', 'blaster', ...(o.tags || [])], desc: o.desc || '', itemHp: 90,
    }, o.extra || {});
  }
  const red = '#ff3030', blue = '#3a8bff', green = '#35e04a';
  R([
    blaster('dl44', 'Heavy Blaster Pistol', 'Pistols', gunArt.heavyPistol(), { damage: 38, rate: 2.6, speed: 55, size: 0.06, len: 0.8, recoil: 4, mag: 25, reload: 1.4, spread: 0.02, color: red, auto: false, pitch: 0.9 }, { muzzle: [0.35, -0.03], desc: 'Hard-hitting smuggler sidearm.', tags: ['han', 'pistol'] }),
    blaster('dc17', 'DC-17 Hand Blaster', 'Pistols', gunArt.pistol('#d8dce0', '#3a3e46'), { damage: 22, rate: 4, speed: 58, size: 0.045, len: 0.6, recoil: 2, mag: 40, reload: 1.2, spread: 0.02, color: blue, auto: false, pitch: 1.2 }, { tags: ['clone', 'pistol'] }),
    blaster('westar', 'Westar Pistol', 'Pistols', gunArt.pistol('#9aa0aa', '#3a3e46'), { damage: 20, rate: 5, speed: 58, size: 0.045, len: 0.6, recoil: 2, mag: 50, reload: 1.1, spread: 0.03, color: red, auto: true, pitch: 1.15 }, { tags: ['jango', 'pistol', 'dual'] }),
    blaster('se14', 'Officer Sidearm', 'Pistols', gunArt.pistol('#2a2c30', '#5a5e66'), { damage: 20, rate: 3.5, speed: 55, size: 0.045, len: 0.6, recoil: 2, mag: 30, reload: 1.2, spread: 0.025, color: red, auto: false, pitch: 1.2 }, { tags: ['empire', 'pistol'] }),
    blaster('ion_blaster', 'Ion Blaster', 'Pistols', gunArt.pistol('#8a6a4a', '#3a3e46'), { damage: 18, rate: 2.5, speed: 45, size: 0.06, len: 0.5, recoil: 2, mag: 20, reload: 1.4, spread: 0.03, color: '#9fe2ff', bolt: 'ion', auto: false, pitch: 1.4 }, { desc: 'Scrambles droids and vehicles.', tags: ['ion', 'jawa', 'droid'] }),
    blaster('stun_pistol', 'Stun Blaster', 'Pistols', gunArt.pistol('#3a5a8a', '#1a2a3a'), { damage: 8, rate: 3, speed: 40, size: 0.07, len: 0.35, recoil: 1, mag: 20, reload: 1.2, spread: 0.02, color: '#6ec8ff', bolt: 'stun', auto: false, pitch: 1.5 }, { desc: 'Stuns instead of killing.', tags: ['stun', 'pistol'] }),
    blaster('e11', 'E-11 Blaster Rifle', 'Rifles', gunArt.rifle('#1e2024', '#4a4e56', 0.7), { damage: 22, rate: 5, speed: 60, size: 0.05, len: 0.7, recoil: 3, mag: 60, reload: 1.8, spread: 0.035, color: red, auto: true }, { twoHanded: true, L: 0.7, muzzle: [0.55, -0.025], tags: ['stormtrooper', 'empire', 'rifle'] }),
    blaster('dc15a', 'DC-15A Blaster Rifle', 'Rifles', gunArt.rifle('#e0e2e6', '#3a3e46', 0.95), { damage: 26, rate: 4, speed: 65, size: 0.05, len: 0.8, recoil: 3, mag: 60, reload: 1.9, spread: 0.025, color: blue, auto: true }, { twoHanded: true, L: 0.9, muzzle: [0.78, -0.025], tags: ['clone', 'republic', 'rifle'] }),
    blaster('dc15s', 'DC-15S Carbine', 'Rifles', gunArt.rifle('#d8dce0', '#3a3e46', 0.62), { damage: 20, rate: 6, speed: 60, size: 0.045, len: 0.65, recoil: 2.5, mag: 60, reload: 1.6, spread: 0.035, color: blue, auto: true }, { twoHanded: true, L: 0.6, muzzle: [0.45, -0.025], tags: ['clone', 'carbine'] }),
    blaster('e5', 'E-5 Droid Rifle', 'Rifles', gunArt.rifle('#6a5a48', '#3a3228', 0.8), { damage: 16, rate: 3.5, speed: 55, size: 0.045, len: 0.65, recoil: 2, mag: 50, reload: 2, spread: 0.06, color: red, auto: true, pitch: 1.1 }, { twoHanded: true, L: 0.75, muzzle: [0.65, -0.025], tags: ['droid', 'separatist', 'rifle'] }),
    blaster('a280', 'A280 Blaster Rifle', 'Rifles', gunArt.rifle('#3a3a36', '#6a6a5a', 0.85), { damage: 28, rate: 4, speed: 62, size: 0.05, len: 0.75, recoil: 3, mag: 50, reload: 1.8, spread: 0.028, color: red, auto: true }, { twoHanded: true, L: 0.8, muzzle: [0.68, -0.025], tags: ['rebel', 'rifle'] }),
    blaster('ee3', 'EE-3 Carbine', 'Rifles', gunArt.rifle('#3a3a2e', '#6a5a3a', 0.6), { damage: 30, rate: 1.4, speed: 62, size: 0.05, len: 0.7, recoil: 3, mag: 45, reload: 1.6, spread: 0.02, color: red, auto: false, burst: 3 }, { twoHanded: true, L: 0.6, muzzle: [0.45, -0.025], tags: ['boba', 'bounty', 'burst'] }),
    blaster('scatter', 'Scatter Blaster', 'Rifles', gunArt.rifle('#4a3a2a', '#2a2a2a', 0.55), { damage: 12, rate: 1.4, speed: 50, size: 0.045, len: 0.4, recoil: 7, mag: 12, reload: 2, spread: 0.07, pellets: 6, color: '#ff7a30', auto: false, pitch: 0.8 }, { twoHanded: true, L: 0.55, muzzle: [0.42, -0.025], tags: ['shotgun', 'spread'] }),
    blaster('dlt19', 'DLT-19 Heavy Blaster', 'Heavy', gunArt.heavy('#1e2024', '#3a3e46'), { damage: 20, rate: 10, speed: 60, size: 0.055, len: 0.75, recoil: 4, mag: 100, reload: 2.8, spread: 0.05, color: red, auto: true }, { twoHanded: true, L: 1.1, shapes: [{ box: [1.2, 0.14, 0.35, 0] }], muzzle: [0.98, -0.02], tags: ['repeater', 'heavy', 'empire'] }),
    blaster('z6', 'Z-6 Rotary Cannon', 'Heavy', gunArt.rotary(), { damage: 16, rate: 18, speed: 62, size: 0.05, len: 0.7, recoil: 3, mag: 300, reload: 3.5, spread: 0.06, color: blue, auto: true, spinUp: 0.7, pitch: 1.1 }, { twoHanded: true, shapes: [{ box: [1.3, 0.2, 0.3, 0.03] }], muzzle: [0.95, 0], tags: ['rotary', 'minigun', 'clone', 'repeater'] }),
    blaster('sniper', 'Valken Sniper Rifle', 'Sniper', gunArt.sniper(), { damage: 95, rate: 0.8, speed: 170, size: 0.05, len: 2.4, recoil: 9, mag: 6, reload: 2.6, spread: 0.004, color: red, auto: false, pitch: 0.7 }, { twoHanded: true, shapes: [{ box: [1.6, 0.1, 0.4, 0] }], muzzle: [1.3, -0.02], extra: { ai: { range: 20 } }, tags: ['long range', 'precision'] }),
    blaster('bowcaster', 'Wookiee Bowcaster', 'Heavy', gunArt.bowcaster(), { damage: 60, rate: 1.2, speed: 42, size: 0.09, len: 0.6, recoil: 8, mag: 10, reload: 2.2, spread: 0.015, color: green, auto: false, impulse: 40, pitch: 0.7 }, { twoHanded: true, shapes: [{ box: [0.9, 0.12, 0.2, 0] }], muzzle: [0.75, 0], tags: ['wookiee', 'chewbacca', 'crossbow'] }),
    blaster('rocket_launcher', 'Rocket Launcher', 'Launchers', gunArt.launcher(), { damage: 10, rate: 0.5, speed: 30, size: 0.1, len: 0.4, recoil: 14, mag: 1, reload: 2.4, spread: 0.01, bolt: 'slug', color: '#ffb040', auto: false, gravity: 1.5, explosive: { radius: 3.4, damage: 160, power: 16 } }, { twoHanded: true, shapes: [{ box: [1.1, 0.18, 0.15, -0.04] }], muzzle: [0.72, -0.04], tags: ['rocket', 'explosive', 'missile'] }),
    blaster('wrist_blaster', 'Wrist Blaster', 'Pistols', gunArt.wrist(), { damage: 18, rate: 4, speed: 55, size: 0.05, len: 0.6, recoil: 1, mag: 9999, reload: 0, spread: 0.05, color: red, auto: true }, { shapes: [{ box: [0.32, 0.1, 0.05, 0] }], muzzle: [0.27, 0], extra: { gripTilt: 0, builtIn: true, hidden: true }, tags: ['droid', 'b2'] }),
  ]);

  /* ---------------- melee ---------------- */
  R([
    { id: 'electrostaff', name: 'Electrostaff', kind: 'melee', category: 'Melee', sub: 'Staffs', saberproof: true, mass: 3, twoHanded: true, grip: [0, 0], gripTilt: -0.15, shapes: [{ box: [1.7, 0.06] }], melee: { damage: 22, electric: true },
      glowTips: [[0.85, 0, '#c86aff'], [-0.85, 0, '#c86aff']], art: [{ t: 'rect', x: 0, y: 0, w: 1.6, h: 0.05, f: '#3a3440', s: true }, { t: 'rect', x: 0.8, y: 0, w: 0.14, h: 0.1, f: '#8a6aa0', s: true }, { t: 'rect', x: -0.8, y: 0, w: 0.14, h: 0.1, f: '#8a6aa0', s: true }, { t: 'rect', x: 0, y: 0, w: 0.3, h: 0.07, f: '#1a1a1e', s: true }], desc: 'Resists lightsabers.', tags: ['magnaguard', 'staff', 'electric', 'saberproof'] },
    { id: 'force_pike', name: 'Force Pike', kind: 'melee', category: 'Melee', sub: 'Staffs', saberproof: true, mass: 3.5, grip: [-0.3, 0], gripTilt: -0.9, shapes: [{ box: [1.9, 0.05] }], melee: { damage: 24, electric: true },
      glowTips: [[0.95, 0, '#ff3a3a']], art: [{ t: 'rect', x: 0, y: 0, w: 1.9, h: 0.045, f: '#2a1a1a', s: true }, { t: 'poly', p: [0.85, -0.05, 1.0, 0, 0.85, 0.05], f: '#8a8e96', s: true }], tags: ['royal guard', 'spear', 'electric'] },
    { id: 'vibroaxe', name: 'Vibro-axe', kind: 'melee', category: 'Melee', sub: 'Blades', mass: 5, grip: [-0.35, 0], gripTilt: -0.8, shapes: [{ box: [1.1, 0.06] }, { poly: [0.3, -0.05, 0.55, -0.3, 0.6, 0.15, 0.35, 0.05] }], melee: { damage: 30 },
      art: [{ t: 'rect', x: 0, y: 0, w: 1.1, h: 0.05, f: '#5a4430', s: true }, { t: 'poly', p: [0.3, -0.05, 0.55, -0.3, 0.6, 0.15, 0.35, 0.05], f: '#9aa0aa', s: true }], tags: ['gamorrean', 'axe'] },
    { id: 'gaffi_stick', name: 'Gaffi Stick', kind: 'melee', category: 'Melee', sub: 'Staffs', mass: 3, grip: [-0.2, 0], gripTilt: -0.7, twoHanded: true, shapes: [{ box: [1.4, 0.05] }, { box: [0.08, 0.25, 0.7, 0] }], melee: { damage: 20 },
      art: [{ t: 'rect', x: 0, y: 0, w: 1.4, h: 0.045, f: '#7a6a50', s: true }, { t: 'rect', x: 0.7, y: 0, w: 0.08, h: 0.25, f: '#8a8e96', s: true }, { t: 'rect', x: -0.65, y: 0, w: 0.1, h: 0.14, f: '#8a8e96', s: true }], tags: ['tusken', 'club'] },
    { id: 'vibroblade', name: 'Vibroblade', kind: 'melee', category: 'Melee', sub: 'Blades', mass: 0.6, grip: [-0.1, 0], gripTilt: -1.0, shapes: [{ box: [0.55, 0.05] }], melee: { damage: 18 },
      art: [{ t: 'rect', x: -0.12, y: 0, w: 0.2, h: 0.05, f: '#2a2a2a', s: true }, { t: 'poly', p: [0.0, -0.03, 0.4, -0.02, 0.45, 0, 0.4, 0.02, 0.0, 0.03], f: '#c8ccd4', s: true }], tags: ['knife', 'dagger'] },
    { id: 'stun_baton', name: 'Stun Baton', kind: 'melee', category: 'Melee', sub: 'Blades', mass: 1, grip: [-0.15, 0], gripTilt: -1.0, shapes: [{ box: [0.6, 0.06] }], melee: { damage: 10, electric: true },
      glowTips: [[0.3, 0, '#6ec8ff']], art: [{ t: 'rect', x: 0, y: 0, w: 0.6, h: 0.055, f: '#2a2c30', s: true }, { t: 'rect', x: 0.25, y: 0, w: 0.1, h: 0.08, f: '#6a8aaa', s: true }], tags: ['stun', 'electric'] },
  ]);

  /* ---------------- explosives ---------------- */
  const sphere = (r, c, band) => [{ t: 'circle', x: 0, y: 0, r, f: c, s: true }, { t: 'rect', x: 0, y: 0, w: r * 2, h: r * 0.35, f: band }, { t: 'circle', x: -r * 0.35, y: -r * 0.35, r: r * 0.25, f: 'rgba(255,255,255,0.25)' }];
  R([
    { id: 'thermal_detonator', name: 'Thermal Detonator', kind: 'explosive', category: 'Explosives', sub: 'Grenades', throwable: true, mass: 0.6, shapes: [{ circle: [0.1] }], art: sphere(0.1, '#9aa0aa', '#4a4e56'), light: [0.05, 0, '#ff3020'], explosive: { trigger: 'timer', fuse: 3, radius: 4.2, damage: 190, power: 18 }, desc: 'Arm, throw, run.', tags: ['grenade', 'bomb'] },
    { id: 'frag_grenade', name: 'Frag Grenade', kind: 'explosive', category: 'Explosives', sub: 'Grenades', throwable: true, mass: 0.5, shapes: [{ box: [0.12, 0.18] }], art: [{ t: 'rect', x: 0, y: 0, w: 0.12, h: 0.18, f: '#5a6a4a', s: true, r: 0.03 }, { t: 'rect', x: 0, y: -0.1, w: 0.06, h: 0.04, f: '#3a3a3a' }], light: [0, -0.1, '#ff5020'], explosive: { trigger: 'timer', fuse: 2.5, radius: 3.2, damage: 140, power: 15 }, tags: ['grenade', 'clone'] },
    { id: 'impact_grenade', name: 'Impact Grenade', kind: 'explosive', category: 'Explosives', sub: 'Grenades', throwable: true, mass: 0.5, shapes: [{ circle: [0.09] }], art: sphere(0.09, '#c86a2a', '#3a2a1a'), light: [0, 0, '#ffb020'], explosive: { trigger: 'impact', radius: 2.8, damage: 120, power: 14 }, desc: 'Arm it; explodes on the next hard hit.', tags: ['grenade', 'contact'] },
    { id: 'ion_grenade', name: 'Ion Grenade', kind: 'explosive', category: 'Explosives', sub: 'Grenades', throwable: true, mass: 0.5, shapes: [{ circle: [0.09] }], art: sphere(0.09, '#3a6a9a', '#9fe2ff'), light: [0, 0, '#6ec8ff'], explosive: { trigger: 'timer', fuse: 2, radius: 4, damage: 150, power: 4, kind: 'ion' }, desc: 'Fries droids and vehicles.', tags: ['grenade', 'ion', 'emp'] },
    { id: 'seismic_charge', name: 'Seismic Charge', kind: 'explosive', category: 'Explosives', sub: 'Heavy', throwable: true, mass: 3, shapes: [{ circle: [0.18] }], art: [{ t: 'circle', x: 0, y: 0, r: 0.18, f: '#6a7078', s: true }, { t: 'circle', x: 0, y: 0, r: 0.1, f: '#3a3e46', s: true }, { t: 'rect', x: 0, y: 0, w: 0.36, h: 0.04, f: '#9fe2ff' }], light: [0, 0, '#9fe2ff'], explosive: { trigger: 'timer', fuse: 2, radius: 9, damage: 230, power: 26, kind: 'seismic' }, desc: 'A delayed sonic shockwave.', tags: ['sonic', 'jango', 'slave'] },
    { id: 'detonite_charge', name: 'Detonite Charge', kind: 'explosive', category: 'Explosives', sub: 'Charges', throwable: true, mass: 1, shapes: [{ box: [0.3, 0.12] }], art: [{ t: 'rect', x: 0, y: 0, w: 0.3, h: 0.12, f: '#8a7a5a', s: true, r: 0.02 }, { t: 'rect', x: 0, y: -0.02, w: 0.1, h: 0.05, f: '#2a2a2a' }], light: [0, -0.03, '#40ff60'], explosive: { trigger: 'remote', radius: 4.5, damage: 200, power: 20, sticky: true }, desc: 'Sticks when armed. Detonate all charges with K.', tags: ['remote', 'sticky', 'c4'] },
    { id: 'proximity_mine', name: 'Proximity Mine', kind: 'explosive', category: 'Explosives', sub: 'Charges', mass: 3, shapes: [{ poly: [-0.25, 0.06, 0.25, 0.06, 0.15, -0.06, -0.15, -0.06] }], art: [{ t: 'poly', p: [-0.25, 0.06, 0.25, 0.06, 0.15, -0.06, -0.15, -0.06], f: '#4a4e40', s: true }], light: [0, -0.05, '#ff2020'], explosive: { trigger: 'proximity', radius: 3.5, damage: 170, power: 17, sense: 1.4 }, desc: 'Arm it, then keep your distance.', tags: ['mine', 'trap'] },
    { id: 'rocket', name: 'Rocket', kind: 'explosive', category: 'Explosives', sub: 'Rockets', mass: 8, length: 0.8, shapes: [{ box: [0.8, 0.12] }], art: [{ t: 'rect', x: 0, y: 0, w: 0.7, h: 0.12, f: '#c8ccd0', s: true, r: 0.02 }, { t: 'poly', p: [0.35, -0.06, 0.48, 0, 0.35, 0.06], f: '#c83030', s: true }, { t: 'poly', p: [-0.35, -0.06, -0.42, -0.12, -0.25, -0.06], f: '#5a5e66', s: true }, { t: 'poly', p: [-0.35, 0.06, -0.42, 0.12, -0.25, 0.06], f: '#5a5e66', s: true }], explosive: { trigger: 'rocket', radius: 3.6, damage: 170, power: 18, thrust: 30 }, desc: 'Activate to ignite the motor. Flies nose-first.', tags: ['missile'] },
    { id: 'homing_missile', name: 'Homing Missile', kind: 'explosive', category: 'Explosives', sub: 'Rockets', mass: 9, length: 0.9, shapes: [{ box: [0.9, 0.14] }], art: [{ t: 'rect', x: 0, y: 0, w: 0.8, h: 0.14, f: '#5a6070', s: true, r: 0.03 }, { t: 'poly', p: [0.4, -0.07, 0.55, 0, 0.4, 0.07], f: '#ffb040', s: true }, { t: 'rect', x: 0.1, y: 0, w: 0.1, h: 0.14, f: '#c8a040' }], explosive: { trigger: 'rocket', homing: true, radius: 3.4, damage: 160, power: 16, thrust: 26 }, desc: 'Seeks hostile targets once launched.', tags: ['missile', 'seeker'] },
    { id: 'baradium_bomb', name: 'Baradium Bomb', kind: 'explosive', category: 'Explosives', sub: 'Heavy', mass: 60, shapes: [{ box: [1.0, 0.8] }], art: [{ t: 'rect', x: 0, y: 0, w: 1.0, h: 0.8, f: '#3a3e46', s: true, r: 0.08 }, { t: 'rect', x: 0, y: 0, w: 0.9, h: 0.2, f: '#c8a040' }, { t: 'rect', x: 0.25, y: -0.25, w: 0.3, h: 0.14, f: '#0a1a10', s: true }], light: [0.25, -0.25, '#ff3020'], explosive: { trigger: 'timer', fuse: 6, radius: 11, damage: 420, power: 32 }, desc: 'A massive demolition device.', tags: ['bomb', 'huge', 'nuke'] },
  ]);

  /* ---------------- jetpacks ---------------- */
  R([
    { id: 'jetpack', name: 'Mandalorian Jetpack', kind: 'jetpack', category: 'Blasters', sub: 'Equipment', mass: 10, shapes: [{ box: [0.28, 0.5] }], backOffset: [-0.2, -0.02], nozzle: [0, 0.3], grip: [0, 0],
      art: [{ t: 'rect', x: 0, y: 0, w: 0.28, h: 0.5, f: '#6a7078', s: true, r: 0.06 }, { t: 'rect', x: 0, y: 0.26, w: 0.16, h: 0.08, f: '#2a2c30', s: true }, { t: 'rect', x: 0, y: -0.28, w: 0.06, h: 0.12, f: '#c83030', s: true }, { t: 'rect', x: 0, y: -0.05, w: 0.2, h: 0.14, f: '#8a4a2a' }], desc: 'Equip on a character (interact) and hold jump to fly.', tags: ['fly', 'boba', 'jango', 'mandalorian'] },
  ]);
})();
