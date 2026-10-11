/* GALACTIC PLAYGROUND content — building parts, furniture, lights and throwables that stick. */
'use strict';

(() => {
  const M = GP.M, D = GP.Draw, OL = D.OUTLINE;
  const rr = (ctx, x, y, w, h, r, f, s = true, lw = 0.022) => { D.roundRect(ctx, x - w / 2, y - h / 2, w, h, r); if (f) { ctx.fillStyle = f; ctx.fill(); } if (s) { ctx.strokeStyle = s === true ? OL : s; ctx.lineWidth = lw; ctx.stroke(); } };
  const line = (ctx, p, c, w) => { ctx.beginPath(); ctx.moveTo(p[0], p[1]); for (let i = 2; i < p.length; i += 2) ctx.lineTo(p[i], p[i + 1]); ctx.strokeStyle = c; ctx.lineWidth = w; ctx.stroke(); };

  const bricks = (w, h, base, mortar) => (ctx) => {
    rr(ctx, 0, 0, w, h, 0.02, base);
    ctx.save(); D.roundRect(ctx, -w / 2, -h / 2, w, h, 0.02); ctx.clip();
    ctx.strokeStyle = mortar; ctx.lineWidth = 0.02;
    const bh = 0.16, bw = 0.3;
    for (let y = -h / 2, row = 0; y < h / 2; y += bh, row++) {
      ctx.beginPath(); ctx.moveTo(-w / 2, y); ctx.lineTo(w / 2, y); ctx.stroke();
      for (let x = -w / 2 + (row % 2 ? bw / 2 : 0); x < w / 2; x += bw) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + bh); ctx.stroke(); }
    }
    ctx.restore();
    rr(ctx, 0, 0, w, h, 0.02, null);
  };
  const planks = (w, h, base) => (ctx) => {
    rr(ctx, 0, 0, w, h, 0.02, base);
    ctx.strokeStyle = M.shade(base, -0.3); ctx.lineWidth = 0.015;
    for (let x = -w / 2 + 0.5; x < w / 2; x += 0.5) { ctx.beginPath(); ctx.moveTo(x, -h / 2); ctx.lineTo(x, h / 2); ctx.stroke(); }
    ctx.fillStyle = M.shade(base, -0.45);
    for (let x = -w / 2 + 0.12; x < w / 2; x += 0.5) { ctx.beginPath(); ctx.arc(x, 0, 0.018, 0, 7); ctx.fill(); }
  };

  const defs = [
    // ---------------- building parts
    { id: 'adobe_pillar', name: 'Adobe Pillar', category: 'Structures', sub: 'Building', material: 'stone', hp: 260, density: 110, shapes: [{ box: [0.5, 2.4] }], color: '#c8a880', paint: bricks(0.5, 2.4, '#c8a47a', 'rgba(90,60,30,0.35)'), tags: ['brick', 'wall', 'column', 'build'] },
    { id: 'brick_wall', name: 'Adobe Wall', category: 'Structures', sub: 'Building', material: 'stone', hp: 320, density: 170, shapes: [{ box: [0.35, 2.4] }], color: '#b89468', paint: bricks(0.35, 2.4, '#b8946a', 'rgba(80,50,20,0.35)'), tags: ['brick', 'wall', 'build'] },
    { id: 'wood_floor', name: 'Wooden Floor', category: 'Structures', sub: 'Building', material: 'wood', hp: 180, density: 70, shapes: [{ box: [4, 0.22] }], color: '#9a7048', paint: planks(4, 0.22, '#9a7048'), tags: ['floor', 'plank', 'build'] },
    { id: 'wood_floor_short', name: 'Short Floor', category: 'Structures', sub: 'Building', material: 'wood', hp: 120, density: 70, shapes: [{ box: [2, 0.22] }], color: '#9a7048', paint: planks(2, 0.22, '#946c44'), tags: ['floor', 'plank', 'build'] },
    { id: 'roof_beam', name: 'Roof Beam', category: 'Structures', sub: 'Building', material: 'wood', hp: 140, density: 80, shapes: [{ box: [2.5, 0.16] }], color: '#7a5634', paint: planks(2.5, 0.16, '#7a5634'), tags: ['roof', 'beam', 'build'] },
    { id: 'durasteel_frame', name: 'Durasteel Strut', category: 'Structures', sub: 'Building', material: 'metal', hp: 400, density: 150, shapes: [{ box: [0.16, 2.4] }], color: '#7a808a',
      art: [{ t: 'rect', x: 0, y: 0, w: 0.16, h: 2.4, f: '#7e8490', s: true }, { t: 'line', p: [0, -1.1, 0, 1.1], s: 'rgba(0,0,0,0.25)', lw: 0.03 }], tags: ['metal', 'pillar', 'build'] },
    { id: 'thatch_roof', name: 'Thatch Roof', category: 'Structures', sub: 'Building', material: 'wood', hp: 80, density: 40, shapes: [{ poly: [-2.3, 0.2, 2.3, 0.2, 1.2, -0.7, -1.2, -0.7] }], color: '#b0904a', flammable: true, igniteTemp: 150,
      paint: (ctx) => { ctx.beginPath(); ctx.moveTo(-2.3, 0.2); ctx.lineTo(2.3, 0.2); ctx.lineTo(1.2, -0.7); ctx.lineTo(-1.2, -0.7); ctx.closePath(); ctx.fillStyle = '#b0904a'; ctx.fill(); ctx.strokeStyle = OL; ctx.lineWidth = 0.025; ctx.stroke(); ctx.strokeStyle = 'rgba(90,60,20,0.45)'; ctx.lineWidth = 0.02; for (let x = -2; x < 2.1; x += 0.2) { ctx.beginPath(); ctx.moveTo(x, 0.2); ctx.lineTo(x * 0.55, -0.66); ctx.stroke(); } }, tags: ['roof', 'hay', 'straw', 'build'] },
    // ---------------- furniture
    { id: 'bunk', name: 'Bunk Bed', sub: 'Furniture', material: 'wood', hp: 120, density: 60, shapes: [{ box: [1.9, 0.3, 0, -0.35] }, { box: [0.1, 0.5, -0.9, -0.05] }, { box: [0.1, 0.5, 0.9, -0.05] }], color: '#7a5a3a',
      paint: (ctx) => { rr(ctx, -0.9, -0.05, 0.1, 0.5, 0.01, '#6a4a2e'); rr(ctx, 0.9, -0.05, 0.1, 0.5, 0.01, '#6a4a2e'); rr(ctx, 0, -0.35, 1.9, 0.3, 0.05, '#7a5a3a'); rr(ctx, 0.1, -0.45, 1.6, 0.14, 0.05, '#c8b8a0'); rr(ctx, -0.7, -0.5, 0.35, 0.16, 0.06, '#e8e0d0'); }, tags: ['bed', 'furniture', 'sleep'] },
    { id: 'shelf', name: 'Cantina Shelf', sub: 'Furniture', material: 'wood', hp: 100, density: 50, shapes: [{ box: [1.0, 1.6] }], color: '#6a4a2e',
      paint: (ctx) => { rr(ctx, 0, 0, 1.0, 1.6, 0.02, '#5a3e26'); for (const y of [-0.4, 0.2]) rr(ctx, 0, y, 0.92, 0.05, 0.01, '#7a5a3a'); const cols = ['#3a8a4a', '#8a3a2a', '#c8a040', '#3a6a9a']; for (let i = 0; i < 4; i++) { rr(ctx, -0.32 + i * 0.2, -0.56, 0.1, 0.26, 0.03, cols[i], true, 0.012); rr(ctx, -0.3 + i * 0.2, 0.04, 0.12, 0.28, 0.02, cols[(i + 2) % 4], true, 0.012); } }, tags: ['furniture', 'cantina', 'bottles'] },
    { id: 'glass_bottle', name: 'Glass Bottle', sub: 'Furniture', material: 'crystal', hp: 6, density: 120, glass: true, shapes: [{ box: [0.1, 0.3] }], color: '#3a8a4a',
      paint: (ctx) => { rr(ctx, 0, 0.03, 0.1, 0.24, 0.03, 'rgba(60,140,80,0.8)', true, 0.012); rr(ctx, 0, -0.12, 0.04, 0.08, 0.01, 'rgba(60,140,80,0.8)', true, 0.012); line(ctx, [-0.025, -0.04, -0.025, 0.1], 'rgba(255,255,255,0.6)', 0.012); }, tags: ['glass', 'drink', 'breakable'] },
    { id: 'stool', name: 'Stool', sub: 'Furniture', material: 'metal', hp: 80, density: 60, shapes: [{ box: [0.45, 0.08, 0, -0.3] }, { box: [0.08, 0.6] }, { box: [0.35, 0.05, 0, 0.28] }], color: '#6a6e76',
      art: [{ t: 'rect', x: 0, y: 0, w: 0.08, h: 0.6, f: '#5a5e66', s: true }, { t: 'rect', x: 0, y: 0.28, w: 0.35, h: 0.05, f: '#4a4e56', s: true }, { t: 'rect', x: 0, y: -0.3, w: 0.45, h: 0.08, f: '#8a3a2a', s: true, r: 0.03 }], tags: ['seat', 'furniture', 'cantina'] },
    // ---------------- lights
    { id: 'hanging_lamp', name: 'Hanging Lamp', category: 'Structures', sub: 'Lights', material: 'metal', hp: 40, density: 90, shapes: [{ poly: [-0.18, 0.08, 0.18, 0.08, 0.1, -0.1, -0.1, -0.1] }], color: '#5a5e66', hang: 1.3,
      onBuild: (e) => { e.lampOn = e.lampOn !== false; }, onUse: (e) => { e.lampOn = !e.lampOn; GP.Audio.play('click', { f: e.lampOn ? 1400 : 700 }); },
      update: (e) => { if (e.lampOn !== false && e.hp > 0) { const p = e.body.originToWorld(0, 0.12 * e.scale); GP.FX.frameLight(p.x, p.y, 6 * e.scale, '#ffe2a8', 0.85); } },
      paint: (ctx, e) => { ctx.beginPath(); ctx.moveTo(-0.18, 0.08); ctx.lineTo(0.18, 0.08); ctx.lineTo(0.1, -0.1); ctx.lineTo(-0.1, -0.1); ctx.closePath(); ctx.fillStyle = '#4a4e56'; ctx.fill(); ctx.strokeStyle = OL; ctx.lineWidth = 0.02; ctx.stroke(); const on = !e.fragment && e.lampOn !== false; ctx.beginPath(); ctx.arc(0, 0.12, 0.07, 0, 7); ctx.fillStyle = on ? '#fff4c8' : '#8a8472'; ctx.fill(); if (on) D.glow(ctx, 0, 0.12, 0.6, '#ffd890', 0.9); },
      desc: 'Hangs from a cable. Activate (F) to switch on or off.', tags: ['light', 'bulb', 'lamp', 'mood'] },
    { id: 'spotlight', name: 'Spotlight', category: 'Structures', sub: 'Lights', material: 'metal', hp: 80, density: 110, shapes: [{ box: [0.5, 0.28] }], color: '#3a3e46',
      onBuild: (e) => { e.lampOn = e.lampOn !== false; }, onUse: (e) => { e.lampOn = !e.lampOn; GP.Audio.play('click', { f: e.lampOn ? 1400 : 700 }); },
      update: (e) => { if (e.lampOn !== false && e.hp > 0) { const b = e.body, p = b.originToWorld(0.26 * e.facing * e.scale, 0); GP.FX.coneLight(p.x, p.y, 16 * e.scale, b.a + (e.facing < 0 ? Math.PI : 0), 0.3, '#fff4d8', 1); } },
      glowPaint: (ctx, e) => {
        if (e.lampOn === false || e.hp <= 0) return;
        const b = e.body, p = b.originToWorld(0.26 * e.facing * e.scale, 0), a = b.a + (e.facing < 0 ? Math.PI : 0), L = 11 * e.scale;
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, L);
        g.addColorStop(0, 'rgba(255,245,215,0.35)'); g.addColorStop(1, 'rgba(255,245,215,0)');
        ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = g;
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.arc(p.x, p.y, L, a - 0.26, a + 0.26); ctx.closePath(); ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
        D.glow(ctx, p.x, p.y, 0.4, '#fff4d8', 0.9);
      },
      art: [{ t: 'rect', x: -0.05, y: 0, w: 0.42, h: 0.28, f: '#3a3e46', s: true, r: 0.04 }, { t: 'rect', x: 0.22, y: 0, w: 0.08, h: 0.34, f: '#5a5e66', s: true }, { t: 'rect', x: -0.1, y: 0.18, w: 0.12, h: 0.1, f: '#2a2c30', s: true }],
      desc: 'Throws a bright beam wherever it points. Rotate it, hang it or weld it to things. Activate (F) to toggle.', tags: ['light', 'flashlight', 'beam', 'searchlight', 'mood'] },
    // ---------------- throwables that stick
    { id: 'throwing_knife', name: 'Throwing Knife', kind: 'melee', category: 'Melee', sub: 'Blades', mass: 0.3, grip: [-0.08, 0], gripTilt: -1.0, shapes: [{ box: [0.36, 0.04] }], melee: { damage: 12 }, sharp: { tip: [0.18, 0], speed: 5, damage: 26 },
      art: [{ t: 'rect', x: -0.1, y: 0, w: 0.12, h: 0.045, f: '#2a2a2a', s: true }, { t: 'poly', p: [-0.04, -0.022, 0.15, -0.012, 0.19, 0, 0.15, 0.012, -0.04, 0.022], f: '#d8dce4', s: true }],
      desc: 'Throw it point-first (G while controlling, or fling it with Grab): it sticks into whatever it hits.', tags: ['knife', 'dagger', 'throw', 'stick'] },
    { id: 'ewok_spear', name: 'Ewok Spear', kind: 'melee', category: 'Melee', sub: 'Staffs', mass: 1.2, grip: [-0.3, 0], gripTilt: -0.3, shapes: [{ box: [1.5, 0.05] }], melee: { damage: 16 }, sharp: { tip: [0.75, 0], speed: 6, damage: 34 },
      art: [{ t: 'rect', x: -0.05, y: 0, w: 1.4, h: 0.045, f: '#8a6a40', s: true }, { t: 'poly', p: [0.62, -0.05, 0.78, 0, 0.62, 0.05], f: '#9a9080', s: true }, { t: 'rect', x: 0.58, y: 0, w: 0.06, h: 0.07, f: '#5a4028' }], tags: ['spear', 'throw', 'stick', 'endor'] },
  ];
  for (const d of defs) { d.kind = d.kind || 'prop'; d.category = d.category || 'Props'; if (d.kind === 'prop') d.layer = d.category === 'Structures' ? 0 : 2; GP.Registry.register(d); }
  // existing sharp weapons can stick too
  const vb = GP.Registry.get('vibroblade'); if (vb) vb.sharp = { tip: [0.43, 0], speed: 5, damage: 22 };
  const fp = GP.Registry.get('force_pike'); if (fp) fp.sharp = { tip: [0.97, 0], speed: 6, damage: 30 };
})();
