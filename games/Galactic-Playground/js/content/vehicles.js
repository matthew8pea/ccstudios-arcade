/* GALACTIC PLAYGROUND content — vehicles. Configuration for the generic Vehicle kind:
 * shapes (with component ids), seats, controller settings, weapon hardpoints and paint.
 * Paint functions draw in the vehicle's authoring frame (+x = nose).
 */
'use strict';

(() => {
  const M = GP.M, D = GP.Draw, OL = D.OUTLINE;
  const R = (d) => GP.Registry.register(Object.assign({ kind: 'vehicle', category: 'Vehicles', layer: 1 }, d));
  const poly = (ctx, p, f, s = true, lw = 0.04) => { ctx.beginPath(); ctx.moveTo(p[0], p[1]); for (let i = 2; i < p.length; i += 2) ctx.lineTo(p[i], p[i + 1]); ctx.closePath(); if (f) { ctx.fillStyle = f; ctx.fill(); } if (s) { ctx.strokeStyle = s === true ? OL : s; ctx.lineWidth = lw; ctx.stroke(); } };
  const rr = (ctx, x, y, w, h, r, f, s = true, lw = 0.04) => { D.roundRect(ctx, x - w / 2, y - h / 2, w, h, r); if (f) { ctx.fillStyle = f; ctx.fill(); } if (s) { ctx.strokeStyle = s === true ? OL : s; ctx.lineWidth = lw; ctx.stroke(); } };
  const circ = (ctx, x, y, r, f, s = true, lw = 0.04) => { ctx.beginPath(); ctx.arc(x, y, r, 0, 7); if (f) { ctx.fillStyle = f; ctx.fill(); } if (s) { ctx.strokeStyle = s === true ? OL : s; ctx.lineWidth = lw; ctx.stroke(); } };
  const line = (ctx, p, c, w) => { ctx.beginPath(); ctx.moveTo(p[0], p[1]); for (let i = 2; i < p.length; i += 2) ctx.lineTo(p[i], p[i + 1]); ctx.strokeStyle = c; ctx.lineWidth = w; ctx.lineCap = 'round'; ctx.stroke(); };
  const broken = (e, id) => e && e.comps && e.comps[id] && e.comps[id].broken;
  const pilot = (ctx, e, x, y, r, i = 0) => { const L = e && e.pilotLook && e.pilotLook(i); if (L) { ctx.save(); ctx.translate(x, y); GP.Painter.head(ctx, L, r); ctx.restore(); } };
  const canopy = (ctx, p, occupied) => { poly(ctx, p, occupied ? 'rgba(120,180,220,0.35)' : 'rgba(40,70,100,0.75)', '#1a1c22', 0.035); };
  const barrel = (len, w, c = '#2a2c30') => [{ t: 'rect', x: len / 2, y: 0, w: len, h: w, f: c, s: true }];

  /* ---------------- ground: repulsorlift ---------------- */
  R({ id: 'speeder_bike', name: '74-Z Speeder Bike', sub: 'Speeders', team: 'neutral', hp: 260, density: 90, color: '#5a6a4a',
    shapes: [{ poly: [-1.6, -0.1, -0.6, -0.35, 1.0, -0.3, 1.7, -0.12, 1.6, 0.05, -1.5, 0.12] }, { box: [0.5, 0.18, 1.5, -0.18], comp: 'nose' }],
    components: [{ id: 'engine', hp: 140, hullShare: 0.8 }, { id: 'nose', hp: 90, detach: true }],
    seats: [{ x: -0.35, y: -0.42, pose: 'grip' }], gripDir: 0.25,
    controller: 'hover', hover: { points: [[-1.2, 0.1], [1.2, 0.05]], height: 1.1, k: 8, damp: 0.9, maxSpeed: 24, accel: 20, exhaust: [-1.7, -0.05] },
    weapons: [{ mount: [1.4, 0.1], muzzles: [[0.3, 0]], stats: { damage: 22, rate: 4, speed: 70, color: '#ff3030', size: 0.05 } }],
    engineSound: 'hover', engineFreq: 90,
    paint: (ctx, e) => {
      poly(ctx, [-1.6, -0.1, -0.6, -0.35, 1.0, -0.3, 1.7, -0.12, 1.6, 0.05, -1.5, 0.12], '#5e6e50');
      rr(ctx, -1.2, -0.05, 0.9, 0.3, 0.08, '#4a5840');
      rr(ctx, -0.4, -0.38, 0.7, 0.12, 0.04, '#2a2c30');
      line(ctx, [0.2, -0.35, 0.45, -0.75], '#2a2c30', 0.05); line(ctx, [0.35, -0.75, 0.55, -0.75], '#2a2c30', 0.05);
      if (!broken(e, 'nose')) { poly(ctx, [1.2, -0.28, 1.9, -0.36, 1.95, -0.2, 1.3, -0.12], '#4a5840'); poly(ctx, [1.2, 0.0, 1.9, 0.08, 1.95, 0.2, 1.3, 0.14], '#4a5840'); }
      rr(ctx, 0.5, -0.15, 0.4, 0.1, 0.02, '#8a3a2a', false);
    }, glows: [[-1.65, -0.05, 0.3, '#ff9a50']], tags: ['bike', 'scout', 'endor'] });

  R({ id: 'landspeeder', name: 'X-34 Landspeeder', sub: 'Speeders', team: 'neutral', hp: 420, density: 70, color: '#c86a3a',
    shapes: [{ poly: [-2.1, -0.2, -1.6, -0.55, 1.6, -0.5, 2.2, -0.15, 2.0, 0.2, -2.0, 0.25] }, { box: [0.8, 0.5, -2.0, -0.55], comp: 'engine' }],
    components: [{ id: 'engine', hp: 200, hullShare: 0.6, detach: true }],
    seats: [{ x: 0.35, y: -0.55, pose: 'grip' }, { x: -0.55, y: -0.55, pose: 'sit' }], gripDir: 0.45,
    controller: 'hover', hover: { points: [[-1.6, 0.2], [1.6, 0.2]], height: 0.9, k: 7, damp: 0.9, maxSpeed: 17, accel: 12, exhaust: [-2.4, -0.55] },
    engineSound: 'hover', engineFreq: 70,
    paint: (ctx, e) => {
      poly(ctx, [-2.1, -0.2, -1.6, -0.55, 1.6, -0.5, 2.2, -0.15, 2.0, 0.2, -2.0, 0.25], '#c8703c');
      poly(ctx, [-1.0, -0.55, 1.2, -0.52, 0.9, -0.95, 0.7, -0.95], 'rgba(120,180,220,0.35)', '#3a2a1e', 0.03);
      rr(ctx, 0.5, -0.1, 2.4, 0.1, 0.02, '#8a4a2a', false);
      if (!broken(e, 'engine')) { for (const y of [-0.75, -0.35]) { rr(ctx, -2.0, y, 0.95, 0.3, 0.12, '#9a9ea8'); circ(ctx, -2.47, y, 0.12, '#3a3e46'); } rr(ctx, -2.0, -1.05, 0.8, 0.26, 0.12, '#9a9ea8'); }
    }, glows: [[-2.5, -0.75, 0.25, '#ffb060'], [-2.5, -0.35, 0.25, '#ffb060']], tags: ['car', 'tatooine', 'luke'] });

  R({ id: 'stap', name: 'STAP', sub: 'Droid vehicles', team: 'separatist', hp: 160, density: 80, color: '#6a5a48', autopilot: false,
    shapes: [{ box: [0.5, 0.25, 0, 0.1] }, { box: [0.15, 1.0, 0.1, -0.4] }],
    seats: [{ x: -0.2, y: -0.45, pose: 'stand', breakForce: 16000 }], gripDir: 0.3,
    controller: 'hover', hover: { points: [[-0.2, 0.2], [0.2, 0.2]], height: 1.3, k: 7, damp: 1, maxSpeed: 14, accel: 12, exhaust: [-0.2, 0.25] },
    weapons: [{ mount: [0.3, -0.75], muzzles: [[0.25, -0.05], [0.25, 0.05]], stats: { damage: 16, rate: 5, speed: 60, color: '#ff3030', size: 0.04 } }],
    engineSound: 'hover', engineFreq: 110,
    paint: (ctx) => { rr(ctx, 0, 0.1, 0.5, 0.25, 0.08, '#6a5a48'); rr(ctx, 0.1, -0.4, 0.14, 1.0, 0.04, '#7a6a52'); rr(ctx, 0.3, -0.75, 0.5, 0.18, 0.05, '#5a4a3a'); }, tags: ['droid', 'platform'] });

  R({ id: 'aat', name: 'AAT Battle Tank', sub: 'Droid vehicles', team: 'separatist', hp: 1600, density: 140, color: '#8a7a60', autopilot: false,
    shapes: [{ poly: [-3.0, 0.3, -3.0, -0.6, -1.0, -1.1, 2.6, -0.8, 3.2, 0.0, 2.6, 0.5] }, { box: [1.8, 0.7, -0.4, -1.4], comp: 'turret' }],
    components: [{ id: 'turret', hp: 500, hullShare: 0.5 }, { id: 'engine', hp: 600 }],
    seats: [{ x: -0.4, y: -1.3, enclosed: true }], controller: 'hover', hover: { points: [[-2.4, 0.4], [0, 0.45], [2.2, 0.4]], height: 0.9, k: 6, damp: 1, maxSpeed: 9, accel: 6, exhaust: [-3.1, -0.2] },
    weapons: [{ mount: [0.3, -1.45], turret: true, arc: [-0.5, 0.35], turnRate: 1.5, comp: 'turret', muzzles: [[2.6, 0]], barrel: barrel(2.6, 0.18, '#6a5a44'), stats: { damage: 30, rate: 0.6, speed: 38, size: 0.14, bolt: 'slug', gravity: 1.2, explosive: { radius: 3.4, damage: 150, power: 15 }, recoil: 400, color: '#ffb040' } },
      { mount: [2.2, -0.3], muzzles: [[0.4, -0.1], [0.4, 0.1]], group: 'secondary', stats: { damage: 20, rate: 5, speed: 60, color: '#ff3030' } }],
    aiRange: 16, engineFreq: 45,
    paint: (ctx, e) => {
      poly(ctx, [-3.0, 0.3, -3.0, -0.6, -1.0, -1.1, 2.6, -0.8, 3.2, 0.0, 2.6, 0.5], '#8e7e62');
      poly(ctx, [1.6, -0.75, 3.1, -0.05, 2.5, 0.35, 1.2, -0.2], '#a89478');
      for (let i = 0; i < 4; i++) rr(ctx, -2.2 + i * 0.6, 0.1, 0.35, 0.25, 0.05, '#5a4a38');
      rr(ctx, -0.4, -1.4, 1.8, 0.7, 0.2, '#7a6a52');
      rr(ctx, -0.2, -1.45, 0.4, 0.18, 0.04, '#2a2418');
      if (!broken(e, 'turret')) { ctx.fillStyle = '#4a6a9a'; ctx.fillRect(-1.2, -1.55, 0.3, 0.2); }
    }, glows: [[-3.1, -0.2, 0.4, '#ff9a50']], tags: ['tank', 'hover', 'separatist'] });

  /* ---------------- walkers ---------------- */
  R({ id: 'atst', name: 'AT-ST Scout Walker', sub: 'Walkers', team: 'empire', hp: 1300, density: 90, color: '#8a8e96', legColor: '#8a8e96',
    shapes: [{ poly: [-1.2, 0.8, -1.3, -0.6, -0.6, -1.0, 1.0, -0.9, 1.5, -0.2, 1.3, 0.8] }],
    components: [{ id: 'leg0', hp: 500, hullShare: 0.3 }, { id: 'leg1', hp: 500, hullShare: 0.3 }, { id: 'cockpit', hp: 700 }],
    seats: [{ x: 0, y: 0, enclosed: true }], controller: 'walker',
    walker: { legs: [{ hip: [-0.1, 0.8], back: true }, { hip: [0.1, 0.8] }], thigh: 2.4, shin: 2.3, height: 4.5, stride: 2.0, speed: 2.4, accel: 5, stepTime: 0.45, lift: 0.5, knee: 'back', needLegs: 2, legW: 0.32, footW: 1.0, footH: 0.2, crush: 60, shake: 0.12, maxSwing: 1 },
    weapons: [{ mount: [1.3, 0.3], turret: true, arc: [-0.5, 1.0], turnRate: 2.5, muzzles: [[0.7, -0.08], [0.7, 0.08]], barrel: [{ t: 'rect', x: 0.35, y: -0.08, w: 0.7, h: 0.09, f: '#2a2c30', s: true }, { t: 'rect', x: 0.35, y: 0.08, w: 0.7, h: 0.09, f: '#2a2c30', s: true }], stats: { damage: 32, rate: 4, speed: 62, color: '#35e04a', size: 0.07 } },
      { mount: [-0.8, 0.0], turret: true, arc: [-0.4, 0.8], group: 'secondary', muzzles: [[0.5, 0]], barrel: barrel(0.5, 0.14, '#3a3e46'), stats: { damage: 10, rate: 1, speed: 26, size: 0.1, bolt: 'slug', gravity: 6, explosive: { radius: 2.6, damage: 110, power: 12 }, color: '#ffb040' } }],
    aiRange: 12, engineSound: 'engine', engineFreq: 55, engineVol: 0.8,
    paint: (ctx, e) => {
      poly(ctx, [-1.2, 0.8, -1.3, -0.6, -0.6, -1.0, 1.0, -0.9, 1.5, -0.2, 1.3, 0.8], '#8e929a');
      poly(ctx, [0.6, -0.55, 1.35, -0.25, 1.3, 0.05, 0.55, -0.15], '#2a2c30');
      pilot(ctx, e, 0.6, -0.3, 0.14);
      poly(ctx, [0.62, -0.5, 1.3, -0.24, 1.26, 0.0, 0.6, -0.15], e && e.driver && e.driver() ? 'rgba(80,110,140,0.35)' : 'rgba(20,30,40,0.8)', false);
      rr(ctx, -0.2, 0.55, 2.3, 0.3, 0.06, '#6a6e76');
      line(ctx, [-1.1, -0.3, 0.9, -0.5], 'rgba(0,0,0,0.25)', 0.05);
      circ(ctx, -1.25, -0.15, 0.2, '#5a5e66');
    }, tags: ['chicken walker', 'empire', 'endor'] });

  R({ id: 'atat', name: 'AT-AT Assault Walker', sub: 'Walkers', team: 'empire', hp: 7000, density: 55, color: '#9a9ea6', legColor: '#9a9ea6',
    shapes: [{ poly: [-5.5, 1.8, -5.8, -1.2, -4.5, -2.4, 4.2, -2.4, 5.4, -1.0, 5.4, 1.8] }, { box: [1.8, 1.2, 6.2, -0.3], comp: 'neck' }, { poly: [7.0, -1.3, 9.6, -0.9, 10.2, 0.3, 9.4, 1.2, 7.0, 1.0], comp: 'head' }],
    components: [{ id: 'leg0', hp: 1400, hullShare: 0.2 }, { id: 'leg1', hp: 1400, hullShare: 0.2 }, { id: 'leg2', hp: 1400, hullShare: 0.2 }, { id: 'leg3', hp: 1400, hullShare: 0.2 }, { id: 'head', hp: 1600, hullShare: 0.6 }, { id: 'neck', hp: 700, hullShare: 0.4 }],
    seats: [{ x: 8.4, y: 0, enclosed: true }, { x: 0, y: 0, enclosed: true }, { x: 0, y: 0, enclosed: true }, { x: 0, y: 0, enclosed: true }],
    controller: 'walker', walker: { legs: [{ hip: [-4.0, 1.8] }, { hip: [-2.8, 1.8], back: true }, { hip: [3.0, 1.8], back: true }, { hip: [4.2, 1.8] }], thigh: 5.2, shin: 5.2, height: 11.6, stride: 3.2, speed: 1.5, accel: 2, stepTime: 1.1, lift: 1.2, knee: 'front', needLegs: 3, legW: 0.75, footW: 2.0, footH: 0.45, footR: 1.1, crush: 200, shake: 0.6, maxSwing: 2 },
    weapons: [{ mount: [9.8, 0.9], turret: true, arc: [-0.3, 0.6], turnRate: 1.2, comp: 'head', muzzles: [[1.0, -0.15], [1.0, 0.15]], barrel: [{ t: 'rect', x: 0.5, y: -0.15, w: 1.0, h: 0.18, f: '#2a2c30', s: true }, { t: 'rect', x: 0.5, y: 0.15, w: 1.0, h: 0.18, f: '#2a2c30', s: true }], stats: { damage: 70, rate: 1.4, speed: 60, size: 0.14, len: 1.6, color: '#ff3030', explosive: { radius: 2.4, damage: 90, power: 12 }, bolt: 'blaster' } },
      { mount: [9.9, -0.2], turret: true, arc: [-0.4, 0.8], group: 'secondary', comp: 'head', muzzles: [[0.6, 0]], barrel: barrel(0.6, 0.12), stats: { damage: 26, rate: 5, speed: 60, color: '#ff3030' } }],
    aiRange: 22, wreckRadius: 7, engineSound: 'engine', engineFreq: 38, engineVol: 1.2, linearDamping: 0.3, angularDamping: 2,
    paint: (ctx, e) => {
      poly(ctx, [-5.5, 1.8, -5.8, -1.2, -4.5, -2.4, 4.2, -2.4, 5.4, -1.0, 5.4, 1.8], '#9a9ea6');
      for (let i = 0; i < 5; i++) line(ctx, [-4.6 + i * 2.1, -2.3, -4.6 + i * 2.1, 1.7], 'rgba(0,0,0,0.18)', 0.08);
      rr(ctx, 0, -0.2, 9.5, 0.25, 0.05, '#7a7e86', false);
      if (!broken(e, 'neck')) rr(ctx, 6.2, -0.3, 1.8, 1.2, 0.2, '#6a6e76');
      if (!broken(e, 'head')) {
        poly(ctx, [7.0, -1.3, 9.6, -0.9, 10.2, 0.3, 9.4, 1.2, 7.0, 1.0], '#a4a8b0');
        poly(ctx, [8.8, -0.8, 9.7, -0.6, 9.8, -0.2, 8.9, -0.3], '#1a1c22');
        pilot(ctx, e, 9.2, -0.45, 0.22);
        line(ctx, [7.2, 0.2, 9.8, 0.4], 'rgba(0,0,0,0.25)', 0.08);
      }
    }, tags: ['imperial walker', 'hoth', 'huge'] });

  R({ id: 'spider_droid', name: 'Dwarf Spider Droid', sub: 'Droid vehicles', team: 'separatist', hp: 900, density: 80, autopilot: true, color: '#6a5a48', legColor: '#7a6a52',
    shapes: [{ poly: [-1.0, 0.5, -1.2, -0.3, -0.5, -0.8, 0.8, -0.7, 1.2, 0.0, 0.9, 0.5] }],
    components: [{ id: 'leg0', hp: 250 }, { id: 'leg1', hp: 250 }, { id: 'leg2', hp: 250 }, { id: 'leg3', hp: 250 }],
    seats: [], controller: 'walker', walker: { legs: [{ hip: [-0.8, 0.3] }, { hip: [-0.5, 0.3], back: true }, { hip: [0.5, 0.3], back: true }, { hip: [0.8, 0.3] }], thigh: 1.5, shin: 1.8, height: 1.9, stride: 1.2, speed: 1.8, accel: 4, stepTime: 0.35, lift: 0.4, knee: 'front', needLegs: 3, legW: 0.14, footW: 0.2, footH: 0.1, crush: 20, maxSwing: 2 },
    weapons: [{ mount: [1.1, -0.1], turret: true, arc: [-0.6, 0.9], turnRate: 2, muzzles: [[1.4, 0]], barrel: barrel(1.4, 0.12, '#4a3e30'), stats: { damage: 40, rate: 1.5, speed: 70, size: 0.09, color: '#ff3030' } }],
    aiRange: 12, engineFreq: 80,
    paint: (ctx) => { poly(ctx, [-1.0, 0.5, -1.2, -0.3, -0.5, -0.8, 0.8, -0.7, 1.2, 0.0, 0.9, 0.5], '#6e5e4a'); circ(ctx, 0.8, -0.35, 0.12, '#ff3a2a', false); circ(ctx, 0.55, -0.4, 0.09, '#ff3a2a', false); }, glows: [[0.8, -0.35, 0.3, '#ff3020']], tags: ['droid', 'walker', 'separatist'] });

  /* ---------------- starfighters & craft ---------------- */
  R({ id: 'xwing', name: 'X-wing Starfighter', sub: 'Starfighters', team: 'rebel', hp: 800, density: 45, color: '#d8dce0',
    shapes: [{ poly: [-2.6, -0.4, 2.8, -0.2, 3.3, 0.05, 2.8, 0.25, -2.6, 0.45] }, { poly: [-2.4, -0.3, -0.8, -0.3, -1.2, -1.5, -2.4, -1.5], comp: 'wing' }, { box: [0.5, 0.5, -0.5, 0.65], landing: true }, { box: [0.4, 0.5, 1.8, 0.55], landing: true }],
    components: [{ id: 'wing', hp: 300, detach: true, hullShare: 0.4 }, { id: 'engine', hp: 400 }],
    seats: [{ x: 0.8, y: -0.4, enclosed: true }], controller: 'flyer', flyer: { thrust: 24, turn: 2.8, maxSpeed: 32, lift: 1.02, slip: 3, hoverDrag: 0.5 },
    weapons: [{ mount: [-1.2, -1.5], muzzles: [[2.6, 0]], barrel: barrel(2.6, 0.06, '#3a3e46'), comp: 'wing', stats: { damage: 34, rate: 5, speed: 90, size: 0.06, len: 1.3, color: '#ff3030' } },
      { mount: [-1.2, 0.3], muzzles: [[2.6, 0]], barrel: barrel(2.6, 0.06, '#3a3e46'), stats: { damage: 34, rate: 5, speed: 90, size: 0.06, len: 1.3, color: '#ff3030' } },
      { mount: [2.0, 0.1], muzzles: [[0.8, 0]], group: 'secondary', stats: { damage: 20, rate: 0.6, speed: 45, size: 0.12, bolt: 'slug', explosive: { radius: 3.6, damage: 200, power: 18 }, color: '#8ad0ff' } }],
    exhausts: [[-2.6, -0.9], [-2.6, 0.2]], exhaustColor: '#ff7050', engineSound: 'jet', engineFreq: 70, aiRange: 20,
    paint: (ctx, e) => {
      if (!broken(e, 'wing')) { poly(ctx, [-2.4, -0.3, -0.8, -0.3, -1.2, -1.5, -2.4, -1.5], '#c8ccd0'); rr(ctx, -1.8, -1.5, 1.4, 0.14, 0.04, '#b8bcc4'); line(ctx, [-2.2, -1.1, -1.2, -1.1], '#c83030', 0.08); }
      poly(ctx, [-2.6, -0.4, 2.8, -0.2, 3.3, 0.05, 2.8, 0.25, -2.6, 0.45], '#e2e6ea');
      line(ctx, [1.6, -0.1, 3.0, 0.02], '#c83030', 0.07);
      canopy(ctx, [0.3, -0.35, 1.5, -0.25, 1.1, -0.65, 0.5, -0.65], e && e.driver && e.driver());
      pilot(ctx, e, 0.8, -0.45, 0.14);
      circ(ctx, -0.3, -0.55, 0.16, '#e8ecf0'); circ(ctx, -0.3, -0.62, 0.09, '#2a5ab0', false);
      for (const y of [-0.9, 0.2]) rr(ctx, -2.3, y, 0.8, 0.34, 0.12, '#9aa0aa');
    }, tags: ['rebel', 'fighter', 't-65'] });

  R({ id: 'tie_fighter', name: 'TIE Fighter', sub: 'Starfighters', team: 'empire', hp: 550, density: 45, color: '#5a5e66',
    shapes: [{ circle: [0.85] }, { poly: [-0.35, -2.3, 0.35, -2.3, 0.45, 2.3, -0.45, 2.3], comp: 'wing' }],
    components: [{ id: 'wing', hp: 260, detach: true, hullShare: 0.5 }, { id: 'engine', hp: 300 }],
    seats: [{ x: 0, y: 0, enclosed: true }], controller: 'flyer', flyer: { thrust: 28, turn: 3.3, maxSpeed: 36, lift: 1.02, slip: 3.5, hoverDrag: 0.5 },
    weapons: [{ mount: [0.7, 0.45], muzzles: [[0.3, -0.12], [0.3, 0.12]], salvo: true, stats: { damage: 26, rate: 4.5, speed: 90, size: 0.06, len: 1.2, color: '#35e04a' } }],
    exhausts: [[-0.85, 0]], exhaustColor: '#ff6040', engineSound: 'jet', engineFreq: 110, aiRange: 18,
    paint: (ctx, e) => {
      if (!broken(e, 'wing')) {
        poly(ctx, [-0.35, -2.3, 0.35, -2.3, 0.45, 2.3, -0.45, 2.3], '#3a3e46');
        for (let i = -3; i <= 3; i++) line(ctx, [-0.35, i * 0.6, 0.38, i * 0.6], '#1a1c22', 0.04);
        rr(ctx, 0, 0, 0.3, 4.4, 0.05, null, '#6a6e76', 0.05);
      }
      rr(ctx, 0.4, 0, 0.8, 0.22, 0.05, '#6a6e76');
      circ(ctx, 0, 0, 0.85, '#7a7e86');
      circ(ctx, 0.35, 0, 0.45, '#1a1c22');
      for (let i = 0; i < 8; i++) { const a = i / 8 * 6.283; line(ctx, [0.35, 0, 0.35 + Math.cos(a) * 0.45, Math.sin(a) * 0.45], '#5a5e66', 0.03); }
      pilot(ctx, e, 0.15, 0, 0.18);
    }, tags: ['imperial', 'fighter', 'twin ion'] });

  R({ id: 'jedi_starfighter', name: 'Jedi Interceptor', sub: 'Starfighters', team: 'jedi', hp: 520, density: 40, color: '#c83030',
    shapes: [{ poly: [-1.8, -0.35, 2.4, 0.0, -1.8, 0.4] }, { poly: [-1.6, -0.3, -0.4, -0.2, -1.2, -1.3, -1.8, -1.3], comp: 'wing' }],
    components: [{ id: 'wing', hp: 220, detach: true }, { id: 'engine', hp: 260 }],
    seats: [{ x: 0, y: -0.2, enclosed: true }], controller: 'flyer', flyer: { thrust: 30, turn: 3.6, maxSpeed: 38, lift: 1.02, slip: 3.2, hoverDrag: 0.5 },
    weapons: [{ mount: [0.6, 0.05], muzzles: [[1.0, -0.08], [1.0, 0.08]], stats: { damage: 28, rate: 6, speed: 95, size: 0.055, len: 1.2, color: '#ff3030' } }],
    exhausts: [[-1.8, 0]], exhaustColor: '#80c0ff', engineSound: 'jet', engineFreq: 95, aiRange: 18,
    paint: (ctx, e) => {
      if (!broken(e, 'wing')) poly(ctx, [-1.6, -0.3, -0.4, -0.2, -1.2, -1.3, -1.8, -1.3], '#b82a2a');
      poly(ctx, [-1.8, -0.35, 2.4, 0.0, -1.8, 0.4], '#c83030');
      poly(ctx, [-0.4, -0.2, 1.4, -0.02, -0.4, 0.1], '#e8e4dc', false);
      canopy(ctx, [-0.6, -0.3, 0.3, -0.18, -0.2, -0.45], e && e.driver && e.driver());
      pilot(ctx, e, -0.25, -0.32, 0.12);
      circ(ctx, -1.2, -0.35, 0.14, '#c8ccd4'); circ(ctx, -1.2, -0.4, 0.07, '#c8a020', false);
    }, tags: ['eta-2', 'jedi', 'fighter'] });

  R({ id: 'snowspeeder', name: 'T-47 Snowspeeder', sub: 'Starfighters', team: 'rebel', hp: 600, density: 50, color: '#d8d0c0',
    shapes: [{ poly: [-2.2, -0.5, 2.0, -0.35, 2.8, 0.0, 2.0, 0.35, -2.2, 0.4] }],
    components: [{ id: 'engine', hp: 300 }],
    seats: [{ x: 0.9, y: -0.35, enclosed: true }], controller: 'flyer', flyer: { thrust: 22, turn: 2.5, maxSpeed: 28, lift: 1.02, slip: 4, hoverDrag: 0.7, autoLevel: true },
    weapons: [{ mount: [1.8, 0.35], muzzles: [[0.8, 0]], barrel: barrel(0.8, 0.07), stats: { damage: 30, rate: 4, speed: 85, size: 0.06, len: 1.2, color: '#ff3030' } }],
    exhausts: [[-2.2, 0]], exhaustColor: '#ffb060', engineSound: 'jet', engineFreq: 60, aiRange: 18,
    paint: (ctx, e) => { poly(ctx, [-2.2, -0.5, 2.0, -0.35, 2.8, 0.0, 2.0, 0.35, -2.2, 0.4], '#dcd4c4'); line(ctx, [-2.0, 0, 2.4, 0], '#c86a2a', 0.08); canopy(ctx, [0.3, -0.45, 1.5, -0.38, 1.2, -0.75, 0.5, -0.75], e && e.driver && e.driver()); pilot(ctx, e, 0.85, -0.52, 0.13); rr(ctx, -1.9, -0.05, 0.6, 0.6, 0.1, '#b8b0a0'); }, tags: ['hoth', 'airspeeder'] });

  R({ id: 'vulture_droid', name: 'Vulture Droid', sub: 'Droid vehicles', team: 'separatist', hp: 380, density: 40, autopilot: true, color: '#8a7a60',
    shapes: [{ poly: [-1.8, -0.3, 1.8, -0.15, 2.2, 0.05, 1.8, 0.25, -1.8, 0.3] }, { poly: [-1.0, -0.2, 0.4, -0.2, 0.0, -1.2, -1.4, -1.2], comp: 'wing' }],
    components: [{ id: 'wing', hp: 160, detach: true }, { id: 'engine', hp: 200 }],
    seats: [], controller: 'flyer', flyer: { thrust: 26, turn: 3, maxSpeed: 32, lift: 1.02, slip: 3, hoverDrag: 0.5 },
    weapons: [{ mount: [0.2, -1.1], muzzles: [[1.0, 0]], barrel: barrel(1.0, 0.07, '#4a3e30'), comp: 'wing', stats: { damage: 24, rate: 4, speed: 85, size: 0.055, len: 1.1, color: '#ff3030' } }],
    exhausts: [[-1.8, 0]], exhaustColor: '#ff5a30', engineSound: 'jet', engineFreq: 130, sight: 50,
    paint: (ctx, e) => { if (!broken(e, 'wing')) poly(ctx, [-1.0, -0.2, 0.4, -0.2, 0.0, -1.2, -1.4, -1.2], '#7a6a50'); poly(ctx, [-1.8, -0.3, 1.8, -0.15, 2.2, 0.05, 1.8, 0.25, -1.8, 0.3], '#8e7e62'); circ(ctx, 1.6, 0, 0.1, '#ff3a2a', false); circ(ctx, 1.3, 0, 0.08, '#ff3a2a', false); }, glows: [[1.6, 0, 0.3, '#ff3020']], tags: ['droid', 'fighter'] });

  R({ id: 'lambda_shuttle', name: 'Imperial Shuttle', sub: 'Large craft', team: 'empire', hp: 3200, density: 30, color: '#e0e2e6',
    shapes: [{ poly: [-5.5, -0.8, 3.5, -0.9, 6.0, 0.0, 3.5, 1.0, -5.5, 1.0] }, { poly: [-3.0, -0.9, -1.0, -0.9, -2.2, -5.5, -3.2, -5.5], comp: 'fin' }, { box: [0.6, 0.6, -3, 1.3], landing: true }, { box: [0.6, 0.6, 3, 1.3], landing: true }],
    components: [{ id: 'fin', hp: 800, detach: true, hullShare: 0.3 }, { id: 'engine', hp: 1200 }],
    seats: [{ x: 4.5, y: -0.2, enclosed: true }, { x: 0, y: 0, enclosed: true }, { x: 0, y: 0, enclosed: true }, { x: 0, y: 0, enclosed: true }, { x: 0, y: 0, enclosed: true }],
    controller: 'flyer', flyer: { thrust: 10, turn: 1.1, maxSpeed: 18, lift: 1.02, slip: 5, hoverDrag: 1, autoLevel: true },
    weapons: [{ mount: [5.4, 0.3], turret: true, arc: [-0.6, 0.6], muzzles: [[0.9, -0.1], [0.9, 0.1]], barrel: barrel(0.9, 0.12), stats: { damage: 40, rate: 3, speed: 80, size: 0.08, len: 1.4, color: '#ff3030' } }],
    exhausts: [[-5.5, -0.3], [-5.5, 0.5]], exhaustColor: '#6ec8ff', engineSound: 'jet', engineFreq: 45, engineVol: 1.1, wreckRadius: 5, aiRange: 22,
    paint: (ctx, e) => {
      if (!broken(e, 'fin')) { poly(ctx, [-3.0, -0.9, -1.0, -0.9, -2.2, -5.5, -3.2, -5.5], '#d8dade'); line(ctx, [-2.6, -1.4, -2.3, -5.0], 'rgba(0,0,0,0.12)', 0.08); }
      poly(ctx, [-5.5, -0.8, 3.5, -0.9, 6.0, 0.0, 3.5, 1.0, -5.5, 1.0], '#e4e6ea');
      poly(ctx, [4.2, -0.6, 5.6, -0.2, 5.4, 0.1, 4.2, -0.1], '#1a1c22');
      pilot(ctx, e, 4.6, -0.3, 0.2);
      for (let i = 0; i < 4; i++) rr(ctx, -4 + i * 2, 0.3, 1.2, 0.3, 0.05, '#c8ccd2', false);
      line(ctx, [-5.2, 0.9, 3.4, 0.9], '#8a8e96', 0.08);
    }, tags: ['lambda', 'transport', 'large'] });

  R({ id: 'laat', name: 'LAAT Gunship', sub: 'Large craft', team: 'republic', hp: 3600, density: 30, color: '#d8d0b8',
    shapes: [{ poly: [-6.0, -1.0, 3.0, -1.2, 5.5, -0.2, 5.0, 1.2, -6.0, 1.2] }, { poly: [-2.5, -1.2, 0.5, -1.2, -0.6, -2.4, -2.2, -2.4], comp: 'wing' }, { box: [1.0, 1.0, 1.0, 1.6], comp: 'turret' }],
    components: [{ id: 'wing', hp: 900, detach: true, hullShare: 0.3 }, { id: 'turret', hp: 600 }, { id: 'engine', hp: 1400 }],
    seats: [{ x: 4.2, y: -0.5, enclosed: true }, { x: 0, y: 0, enclosed: true }, { x: 0, y: 0, enclosed: true }, { x: 0, y: 0, enclosed: true }, { x: 0, y: 0, enclosed: true }, { x: 0, y: 0, enclosed: true }],
    controller: 'flyer', flyer: { thrust: 12, turn: 1.3, maxSpeed: 20, lift: 1.02, slip: 5, hoverDrag: 1.2, autoLevel: true },
    weapons: [{ mount: [1.0, 2.0], turret: true, arc: [-0.2, 2.0], comp: 'turret', turnRate: 2.5, muzzles: [[0.9, 0]], barrel: barrel(0.9, 0.12), stats: { damage: 24, rate: 7, speed: 80, size: 0.06, color: '#3a8bff' } },
      { mount: [-1.2, -2.2], turret: true, arc: [-1.2, 0.4], comp: 'wing', muzzles: [[0.8, 0]], barrel: barrel(0.8, 0.12), stats: { damage: 24, rate: 7, speed: 80, size: 0.06, color: '#3a8bff' } },
      { mount: [2.5, 0.8], group: 'secondary', muzzles: [[0.8, 0]], stats: { damage: 20, rate: 0.8, speed: 40, size: 0.12, bolt: 'slug', gravity: 1, explosive: { radius: 3.6, damage: 180, power: 18 }, color: '#ffb040' } }],
    exhausts: [[-6.0, -0.2]], exhaustColor: '#80c0ff', engineSound: 'jet', engineFreq: 50, engineVol: 1.1, wreckRadius: 5, aiRange: 22,
    paint: (ctx, e) => {
      if (!broken(e, 'wing')) poly(ctx, [-2.5, -1.2, 0.5, -1.2, -0.6, -2.4, -2.2, -2.4], '#c8c0a8');
      poly(ctx, [-6.0, -1.0, 3.0, -1.2, 5.5, -0.2, 5.0, 1.2, -6.0, 1.2], '#d8d0b8');
      poly(ctx, [3.4, -0.9, 5.2, -0.3, 5.0, 0.2, 3.4, -0.2], '#2a3a2a');
      pilot(ctx, e, 4.2, -0.5, 0.2);
      rr(ctx, -1.8, 0.2, 3.0, 1.2, 0.1, '#b8b098');
      line(ctx, [-5.8, -0.6, 2.0, -0.8], '#b83030', 0.12);
      if (!broken(e, 'turret')) circ(ctx, 1.0, 1.6, 0.55, 'rgba(120,160,120,0.6)');
    }, tags: ['gunship', 'republic', 'transport', 'large'] });

  /* ---------------- emplacements ---------------- */
  R({ id: 'eweb', name: 'E-Web Heavy Repeater', sub: 'Emplacements', category: 'Blasters', team: 'neutral', hp: 450, density: 260, color: '#3a3e46', layer: 2,
    shapes: [{ poly: [-0.7, 0.8, 0.7, 0.8, 0.15, 0.0, -0.15, 0.0] }, { box: [0.5, 0.35, 0, -0.1] }],
    seats: [{ x: -0.95, y: -0.2, pose: 'stand', breakForce: 12000 }], gripDir: 0.15,
    controller: 'turret', engineSound: 'none',
    weapons: [{ mount: [0, -0.25], turret: true, arc: [-0.8, 0.6], turnRate: 4, muzzles: [[1.3, 0]], barrel: [{ t: 'rect', x: 0.3, y: 0, w: 0.9, h: 0.18, f: '#2a2c30', s: true, r: 0.03 }, { t: 'rect', x: 0.95, y: 0, w: 0.7, h: 0.07, f: '#1a1a1e', s: true }, { t: 'rect', x: 0.1, y: -0.14, w: 0.3, h: 0.1, f: '#4a4e56', s: true }], stats: { damage: 30, rate: 9, speed: 65, size: 0.06, color: '#ff3030', recoil: 30 } }],
    autopilot: false, aiRange: 16,
    paint: (ctx) => { poly(ctx, [-0.7, 0.8, 0.7, 0.8, 0.15, 0.0, -0.15, 0.0], null, false); line(ctx, [0, 0, -0.7, 0.8], '#2a2c30', 0.07); line(ctx, [0, 0, 0.7, 0.8], '#2a2c30', 0.07); line(ctx, [0, 0, 0.1, 0.8], '#3a3e46', 0.06); rr(ctx, 0, -0.1, 0.45, 0.3, 0.05, '#3a3e46'); rr(ctx, -0.9, 0.35, 0.5, 0.7, 0.08, '#4a4e56'); },
    desc: 'Mounted heavy repeater. Enter it with a character, or set Autopilot for a sentry.', tags: ['turret', 'mounted', 'sentry', 'heavy'] });
  R({ id: 'av_turret', name: 'Anti-Vehicle Cannon', sub: 'Emplacements', category: 'Blasters', team: 'republic', hp: 1100, density: 300, color: '#6a6e76', layer: 1,
    shapes: [{ poly: [-1.2, 1.0, 1.2, 1.0, 0.6, -0.4, -0.6, -0.4] }],
    seats: [{ x: -1.4, y: 0.1, pose: 'stand', breakForce: 15000 }], gripDir: 0.1, controller: 'turret', engineSound: 'none',
    weapons: [{ mount: [0, -0.5], turret: true, arc: [-1.1, 0.3], turnRate: 1.6, muzzles: [[2.4, 0]], barrel: [{ t: 'rect', x: 0.2, y: 0, w: 1.2, h: 0.6, f: '#5a5e66', s: true, r: 0.1 }, { t: 'rect', x: 1.6, y: 0, w: 1.8, h: 0.2, f: '#2a2c30', s: true }], stats: { damage: 60, rate: 0.8, speed: 80, size: 0.14, len: 1.6, color: '#3a8bff', explosive: { radius: 2.8, damage: 140, power: 14 }, recoil: 600 } }],
    aiRange: 25, paint: (ctx) => { poly(ctx, [-1.2, 1.0, 1.2, 1.0, 0.6, -0.4, -0.6, -0.4], '#6a6e76'); rr(ctx, 0, 0.5, 1.8, 0.2, 0.04, '#c8a040', false); }, tags: ['turret', 'cannon', 'sentry'] });
})();
