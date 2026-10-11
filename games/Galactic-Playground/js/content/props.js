/* GALACTIC PLAYGROUND content — props & structures. Pure data + vector art. */
'use strict';

(() => {
  const M = GP.M, D = GP.Draw, OL = D.OUTLINE;
  const rr = (ctx, x, y, w, h, r, f, s = true, lw = 0.025) => { D.roundRect(ctx, x - w / 2, y - h / 2, w, h, r); if (f) { ctx.fillStyle = f; ctx.fill(); } if (s) { ctx.strokeStyle = s === true ? OL : s; ctx.lineWidth = lw; ctx.stroke(); } };
  const line = (ctx, pts, c, w) => { ctx.beginPath(); ctx.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]); ctx.strokeStyle = c; ctx.lineWidth = w; ctx.stroke(); };

  function crate(w, h, body, trim, mark) {
    return (ctx) => {
      rr(ctx, 0, 0, w, h, 0.04, body);
      rr(ctx, 0, 0, w * 0.86, h * 0.8, 0.02, M.shade(body, -0.08), 'rgba(0,0,0,0.25)', 0.02);
      ctx.fillStyle = trim;
      ctx.fillRect(-w / 2, -h / 2, w * 0.12, h); ctx.fillRect(w / 2 - w * 0.12, -h / 2, w * 0.12, h);
      line(ctx, [-w * 0.36, -h * 0.35, w * 0.36, h * 0.35], 'rgba(0,0,0,0.18)', 0.03);
      if (mark) { ctx.fillStyle = mark; ctx.beginPath(); ctx.arc(0, 0, Math.min(w, h) * 0.16, 0, 7); ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 0.015; ctx.stroke(); }
      ctx.strokeStyle = OL; ctx.lineWidth = 0.025; D.roundRect(ctx, -w / 2, -h / 2, w, h, 0.04); ctx.stroke();
    };
  }

  const defs = [
    // ---------------- crates & containers
    { id: 'crate_cargo', name: 'Cargo Crate', sub: 'Containers', material: 'metal', hp: 160, density: 90, shapes: [{ box: [1.2, 1.2] }], color: '#8a8272', paint: crate(1.2, 1.2, '#8f8676', '#5f584c', '#c8a040'), tags: ['box', 'container'] },
    { id: 'crate_small', name: 'Supply Crate', sub: 'Containers', material: 'metal', hp: 90, density: 80, shapes: [{ box: [0.75, 0.75] }], color: '#6a7a8a', paint: crate(0.75, 0.75, '#6e7e90', '#44505e', '#e0e8f0'), tags: ['box'] },
    { id: 'crate_imperial', name: 'Imperial Crate', sub: 'Containers', material: 'metal', hp: 180, density: 100, shapes: [{ box: [1.3, 1.3] }], color: '#4a4e56', paint: crate(1.3, 1.3, '#50555e', '#2c3036', '#9aa2ae'), tags: ['box', 'empire'] },
    { id: 'crate_republic', name: 'Republic Crate', sub: 'Containers', material: 'metal', hp: 160, density: 90, shapes: [{ box: [1.3, 1.1] }], color: '#c8ccd0', paint: crate(1.3, 1.1, '#cfd3d8', '#8a2a2a', '#b03030'), tags: ['box', 'clone'] },
    { id: 'crate_separatist', name: 'Separatist Crate', sub: 'Containers', material: 'metal', hp: 160, density: 90, shapes: [{ box: [1.3, 1.1] }], color: '#6a5a8a', paint: crate(1.3, 1.1, '#6a6070', '#3a2e48', '#5a8ab0'), tags: ['box', 'cis'] },
    { id: 'crate_rebel', name: 'Rebel Supply Case', sub: 'Containers', material: 'metal', hp: 140, density: 80, shapes: [{ box: [1.3, 1.0] }], color: '#c86a2a', paint: crate(1.3, 1.0, '#c8b89a', '#c86a2a', '#c83a2a'), tags: ['box', 'rebel'] },
    { id: 'crate_wood', name: 'Wooden Crate', sub: 'Containers', material: 'wood', hp: 70, density: 60, shapes: [{ box: [1, 1] }], color: '#8a6038', paint: (ctx) => { rr(ctx, 0, 0, 1, 1, 0.02, '#8f6438'); for (let i = -1; i <= 1; i++) line(ctx, [-0.5, i * 0.28, 0.5, i * 0.28], '#5a3a1c', 0.03); line(ctx, [-0.45, -0.45, 0.45, 0.45], '#6a4424', 0.06); rr(ctx, 0, 0, 1, 1, 0.02, null); }, tags: ['box', 'wood'] },
    // ---------------- barrels & volatile
    { id: 'barrel', name: 'Storage Barrel', sub: 'Containers', material: 'metal', hp: 90, density: 120, shapes: [{ box: [0.65, 0.95] }], color: '#5a6a5a', paint: (ctx) => { rr(ctx, 0, 0, 0.65, 0.95, 0.08, '#5e6e5e'); for (const y of [-0.28, 0.28]) rr(ctx, 0, y, 0.68, 0.07, 0.02, '#3e4a3e'); rr(ctx, 0, 0, 0.3, 0.2, 0.02, '#c8c080'); }, tags: ['container'] },
    { id: 'fuel_cell', name: 'Fuel Cell', sub: 'Volatile', desc: 'Explodes when shot or burned.', material: 'metal', hp: 60, density: 110, shapes: [{ box: [0.6, 1.0] }], color: '#c84a2a', volatile: { radius: 4.2, damage: 170, power: 17, threshold: 22 },
      paint: (ctx) => { rr(ctx, 0, 0, 0.6, 1.0, 0.12, '#c8502e'); rr(ctx, 0, -0.1, 0.62, 0.22, 0.02, '#f0d040'); for (let i = -2; i <= 2; i++) line(ctx, [-0.3 + (i + 2) * 0.15 - 0.05, -0.2, -0.3 + (i + 2) * 0.15 + 0.05, 0], '#1a1a1a', 0.04); rr(ctx, 0, -0.55, 0.25, 0.12, 0.02, '#6a6a6a'); }, tags: ['explosive', 'barrel'] },
    { id: 'tibanna_tank', name: 'Tibanna Gas Tank', sub: 'Volatile', desc: 'Pressurized gas. Very unstable.', material: 'metal', hp: 80, density: 140, shapes: [{ box: [0.9, 2.0] }], color: '#6a9ac8', volatile: { radius: 6, damage: 240, power: 22, threshold: 30, kind: 'fire' },
      paint: (ctx) => { rr(ctx, 0, 0, 0.9, 2.0, 0.4, '#7aa4cc'); rr(ctx, 0, 0, 0.92, 0.3, 0.02, '#e0e6ee'); line(ctx, [-0.25, -0.8, -0.25, 0.8], 'rgba(255,255,255,0.3)', 0.06); rr(ctx, 0, -1.05, 0.3, 0.15, 0.03, '#5a5e66'); }, tags: ['explosive', 'gas'] },
    { id: 'power_generator', name: 'Power Generator', sub: 'Volatile', material: 'metal', hp: 200, density: 150, shapes: [{ box: [1.6, 1.3] }], color: '#5a5e66', volatile: { radius: 5, damage: 180, power: 16, threshold: 60, kind: 'ion' },
      paint: (ctx, e) => { rr(ctx, 0, 0, 1.6, 1.3, 0.08, '#5a5e66'); rr(ctx, -0.3, 0, 0.7, 0.9, 0.05, '#2a2e36'); const p = 0.5 + Math.sin((e.t || 0) * 4) * 0.5; ctx.fillStyle = M.rgba('#6ec8ff', 0.4 + p * 0.5); ctx.fillRect(-0.55, -0.35, 0.5, 0.7); for (let i = 0; i < 4; i++) rr(ctx, 0.45, -0.4 + i * 0.26, 0.4, 0.12, 0.02, '#3a3e46'); },
      lights: [{ x: -0.3, y: 0, r: 2.2, c: '#6ec8ff', i: 0.6 }], tags: ['explosive', 'ion'] },
    // ---------------- furniture & tech
    { id: 'console', name: 'Computer Console', sub: 'Tech', material: 'metal', hp: 120, density: 140, shapes: [{ poly: [-0.5, 0.9, 0.5, 0.9, 0.5, -0.3, 0.15, -0.9, -0.5, -0.9] }], color: '#3a3e46',
      paint: (ctx, e) => { ctx.beginPath(); const p = [-0.5, 0.9, 0.5, 0.9, 0.5, -0.3, 0.15, -0.9, -0.5, -0.9]; ctx.moveTo(p[0], p[1]); for (let i = 2; i < p.length; i += 2) ctx.lineTo(p[i], p[i + 1]); ctx.closePath(); ctx.fillStyle = '#3e434c'; ctx.fill(); ctx.strokeStyle = OL; ctx.lineWidth = 0.025; ctx.stroke();
        ctx.save(); ctx.translate(0.32, -0.6); ctx.rotate(0.95); ctx.fillStyle = '#0a1a24'; ctx.fillRect(-0.3, -0.1, 0.6, 0.2); ctx.restore();
        const t = e.t || 0; for (let i = 0; i < 6; i++) { ctx.fillStyle = ['#ff5040', '#40ff80', '#40a0ff', '#ffd040'][(i + Math.floor(t * 2)) % 4]; ctx.fillRect(-0.35 + (i % 3) * 0.2, -0.1 + Math.floor(i / 3) * 0.18, 0.1, 0.06); } },
      lights: [{ x: 0.2, y: -0.5, r: 1.6, c: '#40c8ff', i: 0.5 }], tags: ['computer', 'terminal'] },
    { id: 'vaporator', name: 'Moisture Vaporator', sub: 'Tech', material: 'metal', hp: 150, density: 70, shapes: [{ box: [0.5, 3.4] }, { box: [1.2, 0.3, 0, 1.6] }], color: '#b8b0a0',
      paint: (ctx) => { rr(ctx, 0, 1.6, 1.2, 0.3, 0.05, '#9a9282'); rr(ctx, 0, 0, 0.5, 3.4, 0.1, '#c8c0b0'); for (const y of [-1.2, -0.6, 0.2]) rr(ctx, 0, y, 0.8, 0.1, 0.03, '#8a8272'); rr(ctx, 0, -1.6, 0.35, 0.3, 0.06, '#8a8272'); }, tags: ['farm', 'tatooine'] },
    { id: 'bench', name: 'Temple Bench', sub: 'Furniture', material: 'stone', hp: 200, density: 180, shapes: [{ box: [2.2, 0.25, 0, -0.25] }, { box: [0.3, 0.5, -0.8, 0.12] }, { box: [0.3, 0.5, 0.8, 0.12] }], color: '#b89a70',
      art: [{ t: 'rect', x: -0.8, y: 0.12, w: 0.3, h: 0.5, f: '#9a7e58', s: true }, { t: 'rect', x: 0.8, y: 0.12, w: 0.3, h: 0.5, f: '#9a7e58', s: true }, { t: 'rect', x: 0, y: -0.25, w: 2.2, h: 0.25, f: '#c8aa80', s: true, r: 0.04 }], tags: ['stone'] },
    { id: 'table', name: 'Cantina Table', sub: 'Furniture', material: 'metal', hp: 80, density: 60, shapes: [{ box: [1.6, 0.12, 0, -0.9] }, { box: [0.15, 0.9, 0, -0.4] }, { box: [0.9, 0.1, 0, 0.05] }], color: '#6a5a4a',
      art: [{ t: 'rect', x: 0, y: 0.05, w: 0.9, h: 0.1, f: '#4a4038', s: true }, { t: 'rect', x: 0, y: -0.4, w: 0.15, h: 0.9, f: '#5a5048', s: true }, { t: 'rect', x: 0, y: -0.9, w: 1.6, h: 0.12, f: '#8a7058', s: true, r: 0.03 }], tags: ['furniture'] },
    { id: 'jedi_statue', name: 'Jedi Statue', sub: 'Decor', material: 'stone', hp: 600, density: 220, shapes: [{ box: [1.4, 0.6, 0, 2.7] }, { box: [0.9, 4.2, 0, 0.3] }, { circle: [0.4, 0, -2.2] }], color: '#c8b898',
      paint: (ctx) => { rr(ctx, 0, 2.7, 1.4, 0.6, 0.05, '#a8987a'); ctx.beginPath(); ctx.moveTo(-0.55, 2.4); ctx.lineTo(-0.4, -1.6); ctx.lineTo(0.4, -1.6); ctx.lineTo(0.6, 2.4); ctx.closePath(); ctx.fillStyle = '#cfc0a0'; ctx.fill(); ctx.strokeStyle = OL; ctx.lineWidth = 0.03; ctx.stroke();
        ctx.beginPath(); ctx.arc(0, -2.2, 0.4, 0, 7); ctx.fillStyle = '#d8caa8'; ctx.fill(); ctx.stroke(); line(ctx, [-0.3, -1.3, 0.3, -1.3, 0.1, 0.6], '#a8987a', 0.05); line(ctx, [0.25, -1.0, 0.25, -2.6], '#b8a888', 0.08); }, tags: ['stone', 'temple'] },
    { id: 'holocron', name: 'Jedi Holocron', sub: 'Artifacts', material: 'crystal', hp: 40, density: 300, shapes: [{ box: [0.3, 0.3] }], color: '#6ec8ff',
      paint: (ctx, e) => { const p = 0.6 + Math.sin((e.t || 0) * 3) * 0.3; rr(ctx, 0, 0, 0.3, 0.3, 0.03, '#b8e4ff'); rr(ctx, 0, 0, 0.18, 0.18, 0.02, M.rgba('#ffffff', p), false); D.glow(ctx, 0, 0, 0.5, '#6ec8ff', p * 0.8); }, lights: [{ x: 0, y: 0, r: 1.5, c: '#6ec8ff', i: 0.6 }], tags: ['jedi', 'artifact', 'glow'] },
    { id: 'holocron_sith', name: 'Sith Holocron', sub: 'Artifacts', material: 'crystal', hp: 40, density: 300, shapes: [{ poly: [0, -0.22, 0.2, 0.15, -0.2, 0.15] }], color: '#ff4040',
      paint: (ctx, e) => { const p = 0.6 + Math.sin((e.t || 0) * 2.3) * 0.3; ctx.beginPath(); ctx.moveTo(0, -0.22); ctx.lineTo(0.2, 0.15); ctx.lineTo(-0.2, 0.15); ctx.closePath(); ctx.fillStyle = '#5a0a0a'; ctx.fill(); ctx.strokeStyle = '#ff5050'; ctx.lineWidth = 0.02; ctx.stroke(); D.glow(ctx, 0, 0, 0.5, '#ff2020', p * 0.8); }, lights: [{ x: 0, y: 0, r: 1.5, c: '#ff3030', i: 0.6 }], tags: ['sith', 'artifact', 'glow'] },
    { id: 'kyber', name: 'Kyber Crystal', sub: 'Artifacts', material: 'crystal', hp: 30, density: 250, shapes: [{ poly: [0, -0.2, 0.08, -0.05, 0.05, 0.15, -0.05, 0.15, -0.08, -0.05] }], color: '#9fe2ff',
      paint: (ctx) => { ctx.beginPath(); ctx.moveTo(0, -0.2); ctx.lineTo(0.08, -0.05); ctx.lineTo(0.05, 0.15); ctx.lineTo(-0.05, 0.15); ctx.lineTo(-0.08, -0.05); ctx.closePath(); ctx.fillStyle = '#bfefff'; ctx.fill(); D.glow(ctx, 0, 0, 0.4, '#6ec8ff', 0.8); }, lights: [{ x: 0, y: 0, r: 1.2, c: '#6ec8ff', i: 0.5 }], tags: ['crystal', 'glow'] },
    { id: 'sith_brazier', name: 'Sith Brazier', sub: 'Decor', material: 'metal', hp: 300, density: 200, shapes: [{ poly: [-0.4, 1.4, 0.4, 1.4, 0.2, -0.2, 0.5, -0.5, -0.5, -0.5, -0.2, -0.2] }], color: '#2a1a1a',
      paint: (ctx) => { ctx.beginPath(); const p = [-0.4, 1.4, 0.4, 1.4, 0.2, -0.2, 0.5, -0.5, -0.5, -0.5, -0.2, -0.2]; ctx.moveTo(p[0], p[1]); for (let i = 2; i < p.length; i += 2) ctx.lineTo(p[i], p[i + 1]); ctx.closePath(); ctx.fillStyle = '#241616'; ctx.fill(); ctx.strokeStyle = '#5a2020'; ctx.lineWidth = 0.03; ctx.stroke(); D.glow(ctx, 0, -0.6, 0.7, '#ff4010', 0.8 + Math.random() * 0.2); },
      update: (e, dt) => { if (Math.random() < dt * 20) { const b = e.body; const p = b.originToWorld(0, -0.55 * e.scale); GP.FX.fire(p.x, p.y, 1, 0.22 * e.scale, -1.8); if (Math.random() < 0.2) GP.FX.embers(p.x, p.y, 1, 0.1); } },
      lights: [{ x: 0, y: -0.6, r: 5, c: '#ff5a20', i: 0.8 }], tags: ['fire', 'sith'] },
    { id: 'droid_parts', name: 'Droid Parts Bin', sub: 'Containers', material: 'metal', hp: 100, density: 90, shapes: [{ box: [1.4, 0.8] }], color: '#6a5a48',
      paint: (ctx) => { rr(ctx, 0, 0, 1.4, 0.8, 0.04, '#5e5244'); for (let i = 0; i < 5; i++) { ctx.fillStyle = '#c8b48a'; ctx.beginPath(); ctx.arc(-0.5 + i * 0.25, -0.38, 0.1, 0, 7); ctx.fill(); ctx.strokeStyle = OL; ctx.lineWidth = 0.015; ctx.stroke(); } rr(ctx, 0, 0.05, 1.3, 0.5, 0.03, '#4a4036', 'rgba(0,0,0,0.3)'); }, tags: ['droid'] },
    { id: 'training_dummy', name: 'Training Dummy', sub: 'Decor', material: 'wood', hp: 400, density: 70, shapes: [{ box: [0.2, 1.6, 0, -0.3] }, { box: [0.8, 0.2, 0, 0.6] }, { circle: [0.2, 0, -1.25] }, { box: [0.9, 0.12, 0, -0.75] }], color: '#a0784a',
      art: [{ t: 'rect', x: 0, y: 0.6, w: 0.8, h: 0.2, f: '#6a4a2a', s: true }, { t: 'rect', x: 0, y: -0.3, w: 0.2, h: 1.6, f: '#a0784a', s: true }, { t: 'rect', x: 0, y: -0.75, w: 0.9, h: 0.12, f: '#8a643a', s: true }, { t: 'circle', x: 0, y: -1.25, r: 0.2, f: '#c8a070', s: true }, { t: 'rect', x: 0, y: -0.45, w: 0.42, h: 0.5, f: '#c8b890', s: true, r: 0.05 }], tags: ['wood', 'practice'] },
    // ---------------- nature
    { id: 'rock_large', name: 'Boulder', sub: 'Nature', material: 'stone', hp: 500, density: 220, shapes: [{ poly: [-1.1, 0.7, -1.2, -0.1, -0.5, -0.8, 0.5, -0.9, 1.2, -0.2, 1.1, 0.7] }], color: '#6a6054',
      art: [{ t: 'poly', p: [-1.1, 0.7, -1.2, -0.1, -0.5, -0.8, 0.5, -0.9, 1.2, -0.2, 1.1, 0.7], f: '#6e6458', s: true }, { t: 'poly', p: [-0.5, -0.7, 0.5, -0.8, 0.9, -0.3, -0.2, -0.4], f: '#8a7e6e' }, { t: 'line', p: [-0.3, 0.1, 0.2, 0.3, 0.6, 0.1], s: 'rgba(0,0,0,0.25)', lw: 0.04 }], tags: ['stone'] },
    { id: 'rock_small', name: 'Rock', sub: 'Nature', material: 'stone', hp: 150, density: 220, shapes: [{ poly: [-0.4, 0.3, -0.45, -0.05, -0.15, -0.35, 0.25, -0.3, 0.45, 0, 0.35, 0.3] }], color: '#6a6054',
      art: [{ t: 'poly', p: [-0.4, 0.3, -0.45, -0.05, -0.15, -0.35, 0.25, -0.3, 0.45, 0, 0.35, 0.3], f: '#766c5e', s: true }, { t: 'poly', p: [-0.15, -0.3, 0.25, -0.25, 0.3, -0.05, -0.1, -0.1], f: '#8e8272' }], tags: ['stone'] },
    { id: 'asteroid', name: 'Asteroid Chunk', sub: 'Nature', material: 'stone', hp: 700, density: 180, shapes: [{ ngon: [1.5, 9, 0, 0, 0.3] }], color: '#5a5048',
      paint: (ctx) => { ctx.beginPath(); for (let i = 0; i < 9; i++) { const a = 0.3 + i / 9 * Math.PI * 2; ctx.lineTo(Math.cos(a) * 1.5, Math.sin(a) * 1.5); } ctx.closePath(); ctx.fillStyle = '#5e544c'; ctx.fill(); ctx.strokeStyle = OL; ctx.lineWidth = 0.03; ctx.stroke(); for (const [x, y, r] of [[-0.5, -0.3, 0.3], [0.5, 0.4, 0.22], [0.2, -0.7, 0.18]]) { ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fillStyle = '#463e38'; ctx.fill(); } }, tags: ['space', 'stone'] },
    { id: 'ice_block', name: 'Ice Block', sub: 'Nature', material: 'crystal', hp: 90, density: 92, friction: 0.03, shapes: [{ box: [1, 1] }], color: '#a8d8f0', glass: true,
      art: [{ t: 'rect', x: 0, y: 0, w: 1, h: 1, f: 'rgba(170,215,240,0.85)', s: '#e8f8ff', r: 0.05 }, { t: 'line', p: [-0.3, -0.35, 0.1, 0.05], s: 'rgba(255,255,255,0.7)', lw: 0.05 }], tags: ['ice', 'slippery'] },
    // ---------------- toys
    { id: 'ball', name: 'Bounce Ball', sub: 'Toys', material: 'plastic', hp: 70, impactThreshold: 30, density: 60, restitution: 0.85, friction: 0.5, shapes: [{ circle: [0.35] }], color: '#e05050',
      art: [{ t: 'circle', x: 0, y: 0, r: 0.35, f: '#e04848', s: true }, { t: 'arc', x: 0, y: 0, r: 0.35, a0: -0.4, a1: 1.2, s: '#f0f0f0', lw: 0.08 }, { t: 'circle', x: -0.12, y: -0.12, r: 0.07, f: 'rgba(255,255,255,0.6)' }], tags: ['bouncy', 'round'] },
    { id: 'heavy_ball', name: 'Durasteel Ball', sub: 'Toys', material: 'metal', hp: 900, impactThreshold: 25, density: 900, restitution: 0.2, shapes: [{ circle: [0.45] }], color: '#6a7080',
      art: [{ t: 'circle', x: 0, y: 0, r: 0.45, f: '#707888', s: true }, { t: 'circle', x: -0.15, y: -0.15, r: 0.12, f: 'rgba(255,255,255,0.35)' }], tags: ['heavy', 'round'] },
    // ---------------- structures (spawn frozen by default where noted)
    { id: 'beam', name: 'Durasteel Beam', category: 'Structures', sub: 'Beams', material: 'metal', hp: 400, density: 160, shapes: [{ box: [4, 0.3] }], color: '#7a808a',
      art: [{ t: 'rect', x: 0, y: 0, w: 4, h: 0.3, f: '#7e8490', s: true }, { t: 'line', p: [-1.9, 0, 1.9, 0], s: 'rgba(0,0,0,0.2)', lw: 0.04 }, { t: 'circle', x: -1.8, y: 0, r: 0.05, f: '#5a5e66' }, { t: 'circle', x: 1.8, y: 0, r: 0.05, f: '#5a5e66' }], tags: ['beam', 'girder'] },
    { id: 'beam_long', name: 'Long Girder', category: 'Structures', sub: 'Beams', material: 'metal', hp: 500, density: 160, shapes: [{ box: [8, 0.35] }], color: '#7a808a',
      paint: (ctx) => { rr(ctx, 0, 0, 8, 0.35, 0.02, '#7a808a'); for (let x = -3.6; x <= 3.6; x += 0.8) line(ctx, [x - 0.3, -0.12, x + 0.3, 0.12], 'rgba(0,0,0,0.25)', 0.04); }, tags: ['beam', 'girder'] },
    { id: 'plank', name: 'Wooden Plank', category: 'Structures', sub: 'Beams', material: 'wood', hp: 60, density: 60, shapes: [{ box: [3, 0.18] }], color: '#9a7048',
      art: [{ t: 'rect', x: 0, y: 0, w: 3, h: 0.18, f: '#9a7048', s: true }, { t: 'line', p: [-1.4, -0.02, 1.4, 0.02], s: 'rgba(0,0,0,0.2)', lw: 0.02 }], tags: ['wood', 'beam'] },
    { id: 'pillar', name: 'Stone Pillar', category: 'Structures', sub: 'Blocks', material: 'stone', hp: 500, density: 200, shapes: [{ box: [0.7, 3] }], color: '#b8a888',
      art: [{ t: 'rect', x: 0, y: 0, w: 0.7, h: 3, f: '#c0b090', s: true }, { t: 'rect', x: 0, y: -1.4, w: 0.9, h: 0.2, f: '#a89878', s: true }, { t: 'rect', x: 0, y: 1.4, w: 0.9, h: 0.2, f: '#a89878', s: true }, { t: 'line', p: [-0.15, -1.2, -0.15, 1.2], s: 'rgba(0,0,0,0.15)', lw: 0.04 }, { t: 'line', p: [0.15, -1.2, 0.15, 1.2], s: 'rgba(0,0,0,0.15)', lw: 0.04 }], tags: ['stone', 'column'] },
    { id: 'block', name: 'Stone Block', category: 'Structures', sub: 'Blocks', material: 'stone', hp: 300, density: 200, shapes: [{ box: [1, 1] }], color: '#9a9080',
      art: [{ t: 'rect', x: 0, y: 0, w: 1, h: 1, f: '#9a9080', s: true }, { t: 'line', p: [-0.3, -0.2, 0.2, 0.1], s: 'rgba(0,0,0,0.2)', lw: 0.03 }], tags: ['stone', 'cube'] },
    { id: 'wall_panel', name: 'Blast Wall', category: 'Structures', sub: 'Walls', material: 'metal', hp: 700, density: 180, shapes: [{ box: [0.4, 3.2] }], color: '#5a606a',
      art: [{ t: 'rect', x: 0, y: 0, w: 0.4, h: 3.2, f: '#5a606a', s: true }, { t: 'rect', x: 0, y: 0, w: 0.22, h: 2.8, f: '#4a5058' }, { t: 'rect', x: 0, y: -1.2, w: 0.42, h: 0.12, f: '#c8a040' }], tags: ['wall', 'cover'] },
    { id: 'barricade', name: 'Barricade', category: 'Structures', sub: 'Walls', material: 'metal', hp: 450, density: 150, shapes: [{ poly: [-1.4, 0.7, 1.4, 0.7, 1.1, -0.7, -1.1, -0.7] }], color: '#6a6a60',
      paint: (ctx) => { ctx.beginPath(); ctx.moveTo(-1.4, 0.7); ctx.lineTo(1.4, 0.7); ctx.lineTo(1.1, -0.7); ctx.lineTo(-1.1, -0.7); ctx.closePath(); ctx.fillStyle = '#6a6a5e'; ctx.fill(); ctx.strokeStyle = OL; ctx.lineWidth = 0.03; ctx.stroke(); for (let i = 0; i < 4; i++) line(ctx, [-0.9 + i * 0.6, -0.6, -0.9 + i * 0.6 + 0.1, 0.6], 'rgba(0,0,0,0.25)', 0.05); rr(ctx, 0, -0.62, 2.2, 0.1, 0.02, '#c8a040', false); }, tags: ['cover', 'wall'] },
    { id: 'platform', name: 'Floating Platform', category: 'Structures', sub: 'Platforms', material: 'metal', hp: 600, density: 140, frozen: true, shapes: [{ box: [4, 0.4] }], color: '#50565f',
      art: [{ t: 'rect', x: 0, y: 0, w: 4, h: 0.4, f: '#50565f', s: true, r: 0.05 }, { t: 'rect', x: 0, y: -0.17, w: 4, h: 0.06, f: '#c8a040' }, { t: 'glow', x: -1.5, y: 0.25, r: 0.3, c: '#6ec8ff', a: 0.7 }, { t: 'glow', x: 1.5, y: 0.25, r: 0.3, c: '#6ec8ff', a: 0.7 }], lights: [{ x: 0, y: 0.3, r: 3, c: '#6ec8ff', i: 0.4 }], tags: ['platform', 'frozen'] },
    { id: 'ramp', name: 'Ramp', category: 'Structures', sub: 'Platforms', material: 'metal', hp: 500, density: 150, shapes: [{ poly: [-2, 0.5, 2, 0.5, 2, -0.9] }], color: '#5a606a',
      art: [{ t: 'poly', p: [-2, 0.5, 2, 0.5, 2, -0.9], f: '#5a606a', s: true }, { t: 'line', p: [-1.6, 0.3, 1.8, -0.8], s: '#c8a040', lw: 0.05 }], tags: ['ramp', 'slope'] },
    { id: 'glass_pane', name: 'Transparisteel Pane', category: 'Structures', sub: 'Walls', material: 'crystal', hp: 60, density: 120, glass: true, shapes: [{ box: [0.15, 2.4] }], color: '#9fd0f0',
      art: [{ t: 'rect', x: 0, y: 0, w: 0.15, h: 2.4, f: 'rgba(160,210,240,0.45)', s: '#d0f0ff' }, { t: 'line', p: [0, -1, 0, -0.3], s: 'rgba(255,255,255,0.8)', lw: 0.03 }], tags: ['glass', 'window'] },
    { id: 'seesaw', name: 'Seesaw Plank', category: 'Structures', sub: 'Machines', material: 'wood', hp: 200, density: 70, shapes: [{ box: [5, 0.2] }], color: '#9a7048',
      onBuild: (e) => { const b = e.body; const base = e.game.world.ground; const j = new GP.Phys.RevoluteJoint(base, b, b.x, b.y, { userMade: true, tag: 'pin' }); e.game.world.addJoint(j); e.pin = j; },
      art: [{ t: 'rect', x: 0, y: 0, w: 5, h: 0.2, f: '#9a7048', s: true }, { t: 'circle', x: 0, y: 0, r: 0.12, f: '#5a5e66', s: true }], tags: ['machine', 'pivot'] },
    { id: 'spinner', name: 'Spinning Rotor', category: 'Structures', sub: 'Machines', material: 'metal', hp: 400, density: 120, shapes: [{ box: [4, 0.25] }, { box: [0.25, 4] }], color: '#7a808a',
      onBuild: (e) => { const b = e.body; const j = new GP.Phys.RevoluteJoint(e.game.world.ground, b, b.x, b.y, { enableMotor: true, motorSpeed: 3, maxMotorTorque: 30000, tag: 'pin', userMade: true }); e.game.world.addJoint(j); e.pin = j; },
      art: [{ t: 'rect', x: 0, y: 0, w: 4, h: 0.25, f: '#7a808a', s: true }, { t: 'rect', x: 0, y: 0, w: 0.25, h: 4, f: '#7a808a', s: true }, { t: 'circle', x: 0, y: 0, r: 0.22, f: '#c8a040', s: true }], tags: ['machine', 'motor', 'fan'] },
    { id: 'launch_pad', name: 'Repulsor Launch Pad', category: 'Structures', sub: 'Machines', material: 'metal', hp: 500, density: 200, frozen: true, shapes: [{ box: [2, 0.3] }], color: '#3a3e46',
      update: (e, dt) => { const b = e.body; e.game.world.queryAABB(b.x - 1, b.y - 1.2, b.x + 1, b.y - 0.1, (s) => { const o = s.body; if (o.type === GP.Phys.DYNAMIC && o !== b && !s.sensor) { o.applyForce(0, -o.m * 60); } }); if (Math.random() < dt * 20) GP.FX.spawn(GP.FX.K.GLOW, b.x + M.rand(-0.9, 0.9), b.y - 0.2, 0, -3, 0.3, 0.1, '#6ec8ff', { size1: 0.02, alpha: 0.6 }); },
      art: [{ t: 'rect', x: 0, y: 0, w: 2, h: 0.3, f: '#3a3e46', s: true }, { t: 'rect', x: 0, y: -0.12, w: 1.8, h: 0.08, f: '#6ec8ff' }], lights: [{ x: 0, y: -0.3, r: 2.5, c: '#6ec8ff', i: 0.6 }], tags: ['jump', 'bounce', 'machine'] },
    { id: 'gravity_well', name: 'Gravity Well Generator', category: 'Structures', sub: 'Machines', material: 'metal', hp: 300, density: 200, frozen: true, shapes: [{ circle: [0.4] }], color: '#b36eff',
      update: (e, dt) => { const b = e.body; e.game.world.queryRadius(b.x, b.y, 7, (s) => { const o = s.body; if (o.type !== GP.Phys.DYNAMIC || o === b || s.sensor) return; const dx = b.x - o.x, dy = b.y - o.y, d = Math.hypot(dx, dy) || 1; if (d > 7) return; const f = o.m * 25 * (1 - d / 7); o.applyForce(dx / d * f, dy / d * f); }); if (Math.random() < dt * 15) { const a = Math.random() * 6.28; GP.FX.spawn(GP.FX.K.GLOW, b.x + Math.cos(a) * 3, b.y + Math.sin(a) * 3, -Math.cos(a) * 3, -Math.sin(a) * 3, 0.9, 0.06, '#c89aff', { size1: 0.02 }); } },
      paint: (ctx, e) => { const t = e.t || 0; ctx.beginPath(); ctx.arc(0, 0, 0.4, 0, 7); ctx.fillStyle = '#2a1a3a'; ctx.fill(); ctx.strokeStyle = '#b36eff'; ctx.lineWidth = 0.05; ctx.stroke(); D.glow(ctx, 0, 0, 0.9 + Math.sin(t * 5) * 0.1, '#b36eff', 0.9); }, lights: [{ x: 0, y: 0, r: 3, c: '#b36eff', i: 0.7 }], tags: ['gravity', 'machine', 'attractor'] },
  ];

  for (const d of defs) {
    d.kind = d.kind || 'prop';
    d.category = d.category || 'Props';
    d.layer = d.category === 'Structures' ? 0 : 2;
    if (d.hp === null) delete d.hp;
    GP.Registry.register(d);
  }
})();
