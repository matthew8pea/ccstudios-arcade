/* GALACTIC PLAYGROUND — sandbox environments.
 * A map is data: terrain pieces (static convex shapes with a render style), hazards (lava sensors,
 * conveyor surfaces, kinematic crushers), lighting, weather, ambience and a procedural backdrop.
 */
'use strict';

GP.Maps = (() => {
  const Phys = GP.Phys, M = GP.M, CAT = Phys.CAT;
  const maps = new Map();

  /* ---------------- terrain helpers ---------------- */
  const H = {
    piece(game, verts, style, opts = {}) {
      const b = new Phys.Body({ type: opts.kinematic ? Phys.KINEMATIC : Phys.STATIC });
      const s = Phys.poly(verts, { friction: opts.friction != null ? opts.friction : style.friction != null ? style.friction : 0.8, restitution: 0.05, category: CAT.WORLD, mask: CAT.ALL, sensor: !!opts.sensor, surfaceSpeed: opts.surfaceSpeed || 0 });
      if (opts.tag) s.tag = opts.tag;
      b.addShape(s);
      b.finalize();
      b.terrain = style;
      if (opts.seamless) b.seamless = true;
      game.world.addBody(b);
      // structures (catwalks, platforms, buildings...) can be broken; see systems/destruction.js
      if (opts.structure && GP.Destruction) GP.Destruction.add(game, b);
      return b;
    },
    box(game, x, y, w, h, style, opts) { return H.piece(game, [x - w / 2, y - h / 2, x + w / 2, y - h / 2, x + w / 2, y + h / 2, x - w / 2, y + h / 2], style, opts); },
    // rectangle given by edges
    rect(game, x1, y1, x2, y2, style, opts) { return H.piece(game, [x1, y1, x2, y1, x2, y2, x1, y2], style, opts); },
    // A ground surface from a polyline of top points; each segment becomes a convex quad down to `bottom`
    ground(game, pts, bottom, style, opts) {
      for (let i = 0; i < pts.length - 2; i += 2) {
        const x1 = pts[i], y1 = pts[i + 1], x2 = pts[i + 2], y2 = pts[i + 3];
        if (x2 - x1 < 0.01) continue;
        H.piece(game, [x1, y1, x2, y2, x2, bottom, x1, bottom], style, Object.assign({ seamless: true }, opts));
      }
    },
    ramp(game, x1, y1, x2, y2, thick, style, opts) {
      const dx = x2 - x1, dy = y2 - y1, l = Math.hypot(dx, dy), nx = -dy / l * thick, ny = dx / l * thick;
      return H.piece(game, [x1, y1, x2, y2, x2 - nx, y2 - ny, x1 - nx, y1 - ny], style, opts);
    },
    // Lakes and rivers become flowing particle liquid (see systems/fluid.js), or still zones when
    // liquid physics is off (and in map-picker thumbnails).
    lava(game, x1, y1, x2, y2) {
      game.map.staticLights = game.map.staticLights || [];
      for (let x = x1 + 1.5; x < x2; x += 3) game.map.staticLights.push({ x, y: y1, r: 5, i: 0.7 });
      if (game.liquidRegions) { game.liquidRegions.push({ type: 'lava', x1, y1, x2, y2 }); return null; }
      return H.rect(game, x1, y1, x2, y2, { fill: '#ff5a10' }, { sensor: true, tag: 'lava' });
    },
    water(game, x1, y1, x2, y2) {
      if (game.liquidRegions) { game.liquidRegions.push({ type: 'water', x1, y1, x2, y2 }); return null; }
      game.map.hasWater = true;
      return H.rect(game, x1, y1, x2, y2, { fill: '#3a8ac8' }, { sensor: true, tag: 'water' });
    },
    forcefield(game, x1, y1, x2, y2, color) { return H.rect(game, x1, y1, x2, y2, { fill: color || '#6ec8ff' }, { tag: 'forcefield', friction: 0.2 }); },
    walls(game, b, style, thick = 4) {
      H.rect(game, b.minX - thick, b.minY - thick, b.minX, b.maxY + thick, style);
      H.rect(game, b.maxX, b.minY - thick, b.maxX + thick, b.maxY + thick, style);
    },
    // The solid frame around a map: side walls from `top` to `bottom`, and for interiors a ceiling
    // whose underside is at `ceiling`. Everything the camera can show outside the playable space is
    // inside this frame, so nothing beyond the map is ever visible and nothing can fall out.
    frame(game, o) {
      const t = o.thick || 5;
      // remembered so the renderer can continue the walls' material past the frame (see Renderer.surround)
      game.mapFrame = { minX: o.minX - t, maxX: o.maxX + t, top: o.ceiling != null ? o.top : null, bottom: o.bottom, fill: o.wall.fill };
      H.rect(game, o.minX - t, o.top, o.minX, o.bottom, o.wall);
      H.rect(game, o.maxX, o.top, o.maxX + t, o.bottom, o.wall);
      if (o.ceiling != null) H.rect(game, o.minX - t, o.top, o.maxX + t, o.ceiling, o.ceilingStyle || o.wall);
    },
  };

  // Pieces built with this can be broken apart (catwalks, platforms, buildings); ground, cliffs and
  // the map's frame are plain terrain.
  const ST = { structure: true };

  /* ---------------- backgrounds (see render/backdrop.js) ---------------- */
  const makeBackground = (cfg) => GP.Backdrop.make(cfg);
  const interiorBackdrop = (o) => GP.Backdrop.interior(o);

  /* ---------------- styles ---------------- */
  const S = {
    hangarFloor: { fill: '#3a404c', edge: '#8a93a4', pattern: 'panels', step: 3, patternColor: 'rgba(0,0,0,0.25)', friction: 0.8 },
    metal: { fill: '#4a505c', edge: '#9aa3b4', pattern: 'panels', step: 2, patternColor: 'rgba(0,0,0,0.25)' },
    darkMetal: { fill: '#23262e', edge: '#5a6070', pattern: 'panels', step: 2.5, patternColor: 'rgba(255,255,255,0.05)' },
    catwalk: { fill: '#50565f', edge: '#c8a040', pattern: 'grate', patternColor: 'rgba(0,0,0,0.35)', edgeW: 0.08 },
    sand: { fill: '#c49a60', edge: '#f4dcaa', pattern: 'strata', top: '#dcb87e', topW: 0.22, deco: 'sand', depth: 0.5, specks: ['#9a7446', '#e4c894'], friction: 0.9 },
    adobe: { fill: '#d8c0a0', edge: '#efe0c8', pattern: null, outline: 'rgba(80,50,30,0.5)' },
    rock: { fill: '#5a4e44', edge: '#8a7a68', pattern: 'strata', deco: 'moss', depth: 0.35, specks: ['#3a322a', '#7a6c5c'] },
    dirt: { fill: '#54402e', edge: '#8a7458', pattern: 'strata', top: '#6a5440', topW: 0.2, deco: 'rubble', depth: 0.55, specks: ['#35281c', '#7a6448'] },
    marble: { fill: '#d9cdb8', edge: '#f4ead8', pattern: 'marble', patternColor: 'rgba(120,100,70,0.12)', friction: 0.6 },
    sandstone: { fill: '#b8905a', edge: '#d8b07a', pattern: 'bricks', patternColor: 'rgba(60,40,20,0.2)' },
    obsidian: { fill: '#1c1618', edge: '#7a3a28', pattern: 'strata', deco: 'embers', depth: 0.5, specks: ['#0a0708', '#3a2a2a'] },
    factory: { fill: '#3a3632', edge: '#a88a50', pattern: 'panels', step: 2, patternColor: 'rgba(0,0,0,0.3)' },
    belt: { fill: '#26241f', edge: '#4a463c', pattern: null },
    station: { fill: '#c8ccd4', edge: '#f0f2f6', pattern: 'panels', step: 3, patternColor: 'rgba(0,0,0,0.12)' },
    snow: { fill: '#dce6f2', edge: '#ffffff', pattern: 'strata', top: '#f6f9ff', topW: 0.32, deco: 'snow', depth: 0.45, shadow: '#6a82a8', grit: 0.18, specks: ['#b4c4da', '#ffffff'], friction: 0.5 },
    ice: { fill: '#a8d4f0', edge: '#e0f4ff', pattern: 'ice', friction: 0.04 },
    chamber: { fill: '#1c2230', edge: '#4ac8ff', pattern: 'panels', step: 2, patternColor: 'rgba(74,200,255,0.12)', edgeW: 0.05 },
    hazard: { fill: '#2a2a2a', pattern: 'hazard' },
  };

  /* ---------------- map definitions ---------------- */
  const defs = [];

  defs.push({
    id: 'hangar', name: 'Galactic Hangar', desc: 'A cavernous docking bay with catwalks, cargo and a wide view of open space.',
    bounds: { minX: -45, maxX: 45, minY: -26, maxY: 6 }, view: { minX: -47, maxX: 47, minY: -27, maxY: 3 }, killY: 30, ambience: 'hangar', darkness: 0.22, lightColor: '#060a14',
    camera: { x: 0, y: -4, zoom: 1 }, dustColor: '#8a8e96',
    background: { seed: 11, sky: ['#02030a', '#050814', '#0a0f22'], stars: 420, nebula: '#4a3aa0', nebula2: '#1a5aa0', bodies: [{ x: 160, y: -120, r: 70, c1: '#c89a6a', c2: '#5a3a28', glow: '#ff9a50', bands: true }],
      traffic: { count: 4, y: -70, spread: 90, color: '#1c2028', glow: '#8ad0ff', capital: { x: -60, y: -46, size: 9, drift: 0.35, color: '#2a303c' } } },
    backdrop: { minX: -45, maxX: 45, minY: -26, maxY: 0, color: '#2a2f3a', panelW: 5, panelH: 4, windows: [{ x: -14, y: -19, w: 28, h: 13, bars: 4 }], pipes: '#1c2028', pipeY: [-22, -23], lamps: [{ x: -30, y: -20 }, { x: -18, y: -20 }, { x: 18, y: -20 }, { x: 30, y: -20 }] },
    staticLights: [{ x: -30, y: -17, r: 9, i: 0.6 }, { x: -18, y: -17, r: 9, i: 0.6 }, { x: 18, y: -17, r: 9, i: 0.6 }, { x: 30, y: -17, r: 9, i: 0.6 }, { x: 0, y: -12, r: 18, i: 0.5 }],
    build(game) {
      H.rect(game, -45, 0, 45, 8, S.hangarFloor);
      H.frame(game, { minX: -45, maxX: 45, top: -32, bottom: 8, ceiling: -24, wall: S.darkMetal });
      H.rect(game, -45, -8, -26, -7.4, S.catwalk, ST); H.rect(game, 26, -8, 45, -7.4, S.catwalk, ST);
      H.ramp(game, -26, -7.7, -16, 0, 0.5, S.metal, ST); H.ramp(game, 26, -7.7, 16, 0, 0.5, S.metal, ST);
      H.rect(game, -8, -14, 8, -13.5, S.catwalk, ST);
      H.rect(game, -44, -3, -38, 0, S.metal, ST);
    },
    populate(game) {
      const sp = (id, x, y, o) => game.spawn(id, x, y, Object.assign({ silent: true, noUndo: true }, o));
      for (let i = 0; i < 3; i++) sp('crate_cargo', -34 + i * 1.3, -0.6);
      sp('crate_cargo', -33.4, -1.8);
      sp('fuel_cell', -30, -0.8); sp('fuel_cell', -29, -0.8);
      sp('crate_small', 32, -0.4); sp('crate_small', 32.8, -0.4); sp('barrel', 34, -0.6);
      sp('xwing', -5, -1.6, { facing: 1 });
      sp('tie_fighter', 12, -2.5, { facing: -1 });
      sp('console', 40, -1);
    },
  });

  defs.push({
    id: 'desert', ambientTemp: 38, name: 'Desert Outpost', desc: 'Rolling dunes under twin suns, a domed homestead and moisture vaporators.',
    bounds: { minX: -90, maxX: 90, minY: -60, maxY: 10 }, view: { minX: -92, maxX: 92, minY: -60, maxY: 6 }, killY: 40, ambience: 'desert', weather: { type: 'sand', rate: 25 }, dustColor: '#d8b88a', wind: 1.2,
    camera: { x: 0, y: -4, zoom: 0.9 },
    background: { seed: 23, sky: ['#6aa0d8', '#b8d0e0', '#f0d8a8'], haze: '#f0c890', bodies: [{ x: -60, y: -140, r: 26, c1: '#fffbe8', c2: '#ffe08a', glow: '#fff0b0' }, { x: -20, y: -150, r: 18, c1: '#fff4d8', c2: '#ffc860', glow: '#ffe0a0' }],
      rays: true, clouds: { color: '#ffffff', shadow: '#e8d8c0', alpha: 0.3, count: 6, y: -58, spread: 20, speed: 1.2 },
      traffic: { count: 2, y: -70, color: '#5a4a3a', glow: '#ffcc88' },
      layers: [{ kind: 'mesas', factor: 0.12, base: 1, minH: 2.5, maxH: 7, spacing: 24, color: '#c89a6a', hazeMix: 0.45 }, { kind: 'dunes', factor: 0.22, base: 1.5, minH: 1.5, maxH: 4, spacing: 30, color: '#d4a874', fog: 0.15 }, { kind: 'dunes', factor: 0.4, base: 2, minH: 1, maxH: 3.5, spacing: 22, color: '#dcb482' }] },
    build(game) {
      const pts = [];
      for (let x = -90; x <= 90; x += 3) pts.push(x, Math.sin(x * 0.07) * 1.6 + Math.sin(x * 0.19 + 1) * 0.6 + (Math.abs(x) > 70 ? -(Math.abs(x) - 70) * 0.6 : 0));
      H.ground(game, pts, 12, S.sand);
      // homestead dome & walls
      const dome = []; for (let i = 0; i <= 8; i++) { const a = Math.PI + i / 8 * Math.PI; dome.push(18 + Math.cos(a) * 4, -0.2 + Math.sin(a) * 3.2); }
      H.piece(game, dome, S.adobe, ST);
      H.rect(game, 10, -1.6, 11.2, 1, S.adobe, ST);
      H.rect(game, -30, -2.2, -26, 1, S.adobe, ST); H.rect(game, -29.5, -3.4, -26.5, -2.2, S.adobe, ST);
      H.frame(game, { minX: -90, maxX: 90, top: -66, bottom: 12, wall: S.sand });
    },
    populate(game) {
      const sp = (id, x, y, o) => game.spawn(id, x, y, Object.assign({ silent: true, noUndo: true }, o));
      sp('vaporator', -8, -3.5); sp('vaporator', 28, -3.5);
      sp('crate_small', 24, -1.5); sp('barrel', 25, -1.5);
      sp('landspeeder', -18, -2.2);
      sp('speeder_bike', 36, -2);
    },
  });

  defs.push({
    id: 'facility', name: 'Imperial Facility', desc: 'Grey decks, bridges without railings and a deep reactor shaft.',
    bounds: { minX: -50, maxX: 50, minY: -30, maxY: 30 }, view: { minX: -52, maxX: 52, minY: -29, maxY: 25 }, killY: 40, ambience: 'facility', darkness: 0.38, lightColor: '#04060c',
    camera: { x: 0, y: -5, zoom: 0.95 }, dustColor: '#6a6e76',
    background: { seed: 31, sky: ['#05060a', '#0a0c14', '#111520'], stars: 250, nebula: '#3a2a6a', traffic: { count: 3, y: -70, color: '#101318', glow: '#ff6a50', capital: { x: 80, y: -46, size: 10, drift: -0.25, dir: -1, color: '#252a33' } } },
    backdrop: { minX: -50, maxX: 50, minY: -30, maxY: 30, color: '#1c1f26', panelW: 3, panelH: 2, pipes: '#2a2e38', pipeY: [-26, -12], windows: [{ x: 18, y: -24, w: 20, h: 8, bars: 5 }], lamps: [{ x: -36, y: -18, c: '#ff5040', flicker: true }, { x: -12, y: -18 }, { x: 12, y: -18 }, { x: 40, y: -18, c: '#ff5040', flicker: true }],
      decor(ctx, vr, t) { const a = 0.15 + Math.max(0, Math.sin(t * 3)) * 0.3; GP.Draw.glow(ctx, -36, -17, 4, '#ff2020', a); GP.Draw.glow(ctx, 40, -17, 4, '#ff2020', a); GP.Draw.glow(ctx, 0, 20.5, 7, '#ff4a1a', 0.35 + Math.sin(t * 1.3) * 0.08); } },
    staticLights: [{ x: -12, y: -15, r: 10, i: 0.7 }, { x: 12, y: -15, r: 10, i: 0.7 }, { x: -36, y: -15, r: 6, i: 0.4 }, { x: 40, y: -15, r: 6, i: 0.4 }, { x: 0, y: 4, r: 8, i: 0.5 }, { x: 0, y: 12, r: 8, i: 0.4 }, { x: 0, y: 20, r: 9, i: 0.6 }],
    build(game) {
      // decks are solid all the way down; the shaft between them ends in the reactor floor
      H.rect(game, -50, 0, -6, 30, S.metal); H.rect(game, 6, 0, 50, 30, S.metal);
      H.rect(game, -6, 22, 6, 30, S.darkMetal);
      H.rect(game, -5.5, 21.6, 5.5, 22, S.hazard);
      H.frame(game, { minX: -50, maxX: 50, top: -34, bottom: 30, ceiling: -28, wall: S.darkMetal });
      H.rect(game, -4, -9, 4, -8.5, S.catwalk, ST);           // bridge over the shaft
      H.rect(game, -50, -9, -22, -8.3, S.metal, ST); H.rect(game, 22, -9, 50, -8.3, S.metal, ST);
      H.ramp(game, -22, -8.6, -12, 0, 0.5, S.metal, ST); H.ramp(game, 22, -8.6, 12, 0, 0.5, S.metal, ST);
      H.rect(game, -6.2, 0, -6, 22, S.hazard); H.rect(game, 6, 0, 6.2, 22, S.hazard);
      H.rect(game, -40, -18, -30, -17.5, S.catwalk, ST); H.rect(game, 30, -18, 40, -17.5, S.catwalk, ST);
    },
    populate(game) {
      const sp = (id, x, y, o) => game.spawn(id, x, y, Object.assign({ silent: true, noUndo: true }, o));
      sp('console', -30, -1); sp('console', 30, -1);
      sp('crate_imperial', -42, -0.7); sp('crate_imperial', -40.6, -0.7); sp('crate_imperial', -41.3, -2.1);
      sp('eweb', 16, -0.8, { facing: -1 });
    },
  });

  defs.push({
    id: 'battlefield', name: 'Clone Wars Battlefield', desc: 'Churned earth, craters, trenches and barricades under a burning sky.',
    bounds: { minX: -100, maxX: 100, minY: -60, maxY: 10 }, view: { minX: -102, maxX: 102, minY: -60, maxY: 6 }, killY: 40, ambience: 'battle', weather: { type: 'ash', rate: 14 }, dustColor: '#6a5a48',
    camera: { x: 0, y: -4, zoom: 0.85 },
    background: { seed: 47, sky: ['#2a1c1e', '#7a3e26', '#d8884a'], haze: '#c07040', flashes: true, rays: true, bodies: [{ x: 80, y: -120, r: 30, c1: '#ffd8a0', c2: '#ff8a40', glow: '#ff9a50' }],
      clouds: { color: '#4a2e26', shadow: '#2a1a16', alpha: 0.45, count: 9, y: -58, spread: 35, speed: 2.5 },
      traffic: { count: 5, y: -70, spread: 40, color: '#1a1210', glow: '#ff9a50', freighter: false, capital: { x: 20, y: -46, size: 12, drift: 0.2, color: '#2a2220', glow: '#ffae6a' } },
      layers: [{ kind: 'spires', factor: 0.1, base: 6, minH: 10, maxH: 30, spacing: 25, color: '#5a3a30' }, { kind: 'mountains', factor: 0.2, base: 5, minH: 4, maxH: 11, spacing: 26, color: '#553428', fog: 0.18 }, { kind: 'mountains', factor: 0.3, base: 4, minH: 2, maxH: 7, spacing: 18, color: '#442c22' }] },
    build(game) {
      const pts = [];
      for (let x = -100; x <= 100; x += 2) {
        let y = Math.sin(x * 0.05) * 1.2 + Math.sin(x * 0.23) * 0.4;
        for (const c of [-40, -12, 22, 55]) { const d = Math.abs(x - c); if (d < 5) y += (1 - d / 5) * 2.2; }
        if (Math.abs(x - 5) < 3) y += 1.6;
        if (Math.abs(x) > 85) y -= (Math.abs(x) - 85) * 0.8;
        pts.push(x, y);
      }
      H.ground(game, pts, 12, S.dirt);
      H.frame(game, { minX: -100, maxX: 100, top: -66, bottom: 12, wall: S.dirt });
      H.rect(game, -26, -2.5, -25, 0.8, S.rock, ST); H.rect(game, 36, -3, 37.4, 0.8, S.rock, ST);
    },
    populate(game) {
      const sp = (id, x, y, o) => game.spawn(id, x, y, Object.assign({ silent: true, noUndo: true }, o));
      sp('barricade', -18, -1.2); sp('barricade', 14, -1.2); sp('barricade', 44, -1.2);
      sp('crate_republic', -30, -1); sp('crate_republic', -31.4, -1);
      sp('rock_large', 30, -1.5); sp('rock_large', -48, -1.5);
      sp('barrel', 8, -1); sp('fuel_cell', 9, -1);
    },
  });

  defs.push({
    id: 'temple', name: 'Jedi Temple Interior', desc: 'A serene hall of marble, towering columns and meditation steps.',
    bounds: { minX: -50, maxX: 50, minY: -34, maxY: 6 }, view: { minX: -52, maxX: 52, minY: -34, maxY: 3 }, killY: 30, ambience: 'temple', darkness: 0.15, lightColor: '#140c04',
    camera: { x: 0, y: -5, zoom: 0.95 }, dustColor: '#c8b898',
    background: { seed: 59, sky: ['#2a1c10', '#6a4a28', '#c89a60'], clouds: { color: '#f0c890', alpha: 0.25, count: 7, y: -58, speed: 0.8 }, traffic: { count: 3, y: -70, color: '#4a3020', glow: '#ffe0a0' }, layers: [{ kind: 'columns', factor: 0.35, base: 10, minH: 0, maxH: 0, spacing: 9, color: '#a88a60' }] },
    backdrop: { minX: -50, maxX: 50, minY: -34, maxY: 0, color: '#8a6e4c', panelW: 8, panelH: 34, line: 'rgba(60,40,20,0.2)', windows: [{ x: -34, y: -30, w: 6, h: 16 }, { x: -14, y: -30, w: 6, h: 16 }, { x: 8, y: -30, w: 6, h: 16 }, { x: 28, y: -30, w: 6, h: 16 }],
      decor(ctx, vr, t) {
        ctx.globalCompositeOperation = 'lighter';
        for (const wx of [-31, -11, 11, 31]) {
          const g = ctx.createLinearGradient(wx, -30, wx + 8, 0);
          g.addColorStop(0, 'rgba(255,220,150,0.14)'); g.addColorStop(1, 'rgba(255,220,150,0)');
          ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(wx - 3, -30); ctx.lineTo(wx + 3, -30); ctx.lineTo(wx + 12, 0); ctx.lineTo(wx + 2, 0); ctx.fill();
        }
        ctx.globalCompositeOperation = 'source-over';
        void vr; void t;
      } },
    staticLights: [{ x: -28, y: -10, r: 14, i: 0.6 }, { x: -8, y: -10, r: 14, i: 0.6 }, { x: 14, y: -10, r: 14, i: 0.6 }, { x: 34, y: -10, r: 14, i: 0.6 }],
    build(game) {
      H.rect(game, -50, 0, 50, 8, S.marble);
      H.frame(game, { minX: -50, maxX: 50, top: -40, bottom: 8, ceiling: -32, wall: S.sandstone });
      // meditation steps
      H.rect(game, 24, -0.6, 44, 0, S.marble, ST); H.rect(game, 28, -1.2, 44, -0.6, S.marble, ST); H.rect(game, 32, -1.8, 44, -1.2, S.marble, ST);
      H.rect(game, -44, -0.6, -24, 0, S.marble, ST); H.rect(game, -44, -1.2, -28, -0.6, S.marble, ST);
      // colonnade pedestals
      for (const x of [-16, -4, 8]) { H.rect(game, x - 0.9, -1, x + 0.9, 0, S.sandstone, ST); }
      H.rect(game, -6, -12, 6, -11.4, S.sandstone, ST);
    },
    populate(game) {
      const sp = (id, x, y, o) => game.spawn(id, x, y, Object.assign({ silent: true, noUndo: true }, o));
      sp('jedi_statue', 38, -4.5, { frozen: true }); sp('jedi_statue', -38, -3.9, { frozen: true, facing: -1 });
      sp('holocron', -16, -1.4); sp('holocron_sith', 8, -1.4);
      sp('bench', -4, -1.4);
      sp('training_dummy', 0, -1);
      sp('training_remote', 3, -2.5);
    },
  });

  defs.push({
    id: 'sith', liquids: 'lava', ambientTemp: 52, name: 'Sith Fortress', desc: 'Black stone platforms over rivers of lava. Watch your step.',
    bounds: { minX: -60, maxX: 60, minY: -40, maxY: 10 }, view: { minX: -62, maxX: 62, minY: -40, maxY: 7 }, killY: 30, ambience: 'lava', weather: { type: 'embers', rate: 30 }, darkness: 0.5, lightColor: '#0c0204',
    camera: { x: 0, y: -5, zoom: 0.9 }, dustColor: '#3a2a2a',
    background: { seed: 67, sky: ['#08020a', '#2a0808', '#7a1a0a'], haze: '#ff4010', bodies: [{ x: 50, y: -110, r: 22, c1: '#ff8060', c2: '#801008', glow: '#ff3010' }],
      clouds: { color: '#3a0a08', shadow: '#1a0404', alpha: 0.5, count: 8, y: -58, speed: 1.6 },
      layers: [{ kind: 'spires', factor: 0.12, base: 8, minH: 18, maxH: 40, spacing: 20, color: '#12060a', windows: '#ff3a1a' }, { kind: 'mountains', factor: 0.3, base: 6, minH: 4, maxH: 10, spacing: 16, color: '#1a0a0a', rim: 0.1 }] },
    build(game) {
      H.rect(game, -60, 4, 60, 12, S.obsidian);
      H.lava(game, -60, 2.5, 60, 4);
      H.frame(game, { minX: -60, maxX: 60, top: -46, bottom: 12, ceiling: -38, wall: S.obsidian });
      H.piece(game, [-40, 0, -22, 0, -20, 3, -42, 3], S.obsidian, ST);
      H.piece(game, [-9, -1, 9, -1, 11, 3, -11, 3], S.obsidian, ST);
      H.piece(game, [22, 0, 40, 0, 42, 3, 20, 3], S.obsidian, ST);
      H.rect(game, -60, -1, -48, 3, S.obsidian); H.rect(game, 48, -1, 60, 3, S.obsidian);
      H.rect(game, -17, -6, -12, -5.4, S.obsidian, ST); H.rect(game, 12, -6, 17, -5.4, S.obsidian, ST);
      H.piece(game, [-2, -1, 2, -1, 0.8, -9, -0.8, -9], S.obsidian, ST); // spire
      H.rect(game, -4, -9.5, 4, -9, S.obsidian, ST);
    },
    populate(game) {
      const sp = (id, x, y, o) => game.spawn(id, x, y, Object.assign({ silent: true, noUndo: true }, o));
      sp('sith_brazier', -30, -0.7); sp('sith_brazier', 30, -0.7); sp('sith_brazier', -54, -1.7); sp('sith_brazier', 54, -1.7);
      sp('holocron_sith', 0, -9.8);
    },
  });

  defs.push({
    id: 'factory', liquids: 'lava', name: 'Droid Factory', desc: 'Conveyor belts, hydraulic crushers and a vat of molten metal.',
    bounds: { minX: -55, maxX: 55, minY: -30, maxY: 10 }, view: { minX: -57, maxX: 57, minY: -30, maxY: 6 }, killY: 30, ambience: 'factory', darkness: 0.32, lightColor: '#080604',
    camera: { x: 0, y: -5, zoom: 0.9 }, dustColor: '#5a5048',
    background: { seed: 71, sky: ['#0a0806', '#1c1610', '#3a2a18'], layers: [{ kind: 'factory', factor: 0.15, base: 14, minH: 10, maxH: 26, spacing: 16, color: '#1c160f', beacons: true }, { kind: 'factory', factor: 0.25, base: 12, minH: 6, maxH: 20, spacing: 12, color: '#15110c', windows: '#8a5a20', beacons: true }] },
    backdrop: { minX: -55, maxX: 55, minY: -30, maxY: 0, color: '#221d17', panelW: 4, panelH: 3, pipes: '#3a3024', pipeY: [-24, -25, -20], lamps: [{ x: -40, y: -20, c: '#ffb060' }, { x: -15, y: -20, c: '#ffb060' }, { x: 10, y: -20, c: '#ffb060' }, { x: 35, y: -20, c: '#ffb060' }] },
    staticLights: [{ x: -40, y: -16, r: 10, i: 0.6 }, { x: -15, y: -16, r: 10, i: 0.6 }, { x: 10, y: -16, r: 10, i: 0.6 }, { x: 35, y: -16, r: 10, i: 0.6 }],
    build(game) {
      H.rect(game, -55, 0, -8, 12, S.factory); H.rect(game, 8, 0, 55, 12, S.factory);
      H.lava(game, -8, 1.5, 8, 8);
      H.rect(game, -8.3, 8, 8.3, 12, S.factory); // the vat's floor (flowing lava needs something to sit on)
      H.rect(game, -8.3, 0, -8, 8, S.hazard); H.rect(game, 8, 0, 8.3, 8, S.hazard);
      H.frame(game, { minX: -55, maxX: 55, top: -36, bottom: 12, ceiling: -28, wall: S.darkMetal });
      // conveyors carrying toward the vat
      H.rect(game, -40, -4.4, -9, -3.8, S.belt, { surfaceSpeed: 2.2, structure: true });
      H.rect(game, 9, -4.4, 40, -3.8, S.belt, { surfaceSpeed: -2.2, structure: true });
      H.rect(game, -40, -3.8, -39, 0, S.factory, ST); H.rect(game, 39, -3.8, 40, 0, S.factory, ST);
      H.rect(game, -50, -12, -30, -11.4, S.catwalk, ST); H.rect(game, 30, -12, 50, -11.4, S.catwalk, ST);
      // hydraulic crushers
      game.map.crushers = [];
      for (const x of [-24, 24]) {
        const b = H.box(game, x, -12, 3, 1.2, S.metal, { kinematic: true });
        game.map.crushers.push({ b, x, top: -12, bottom: -5.2, t: x > 0 ? 1.5 : 0 });
      }
    },
    update(game, dt) {
      for (const c of game.map.crushers || []) {
        c.t += dt;
        const cycle = c.t % 4;
        let y;
        if (cycle < 1.5) y = c.top; else if (cycle < 1.8) y = M.lerp(c.top, c.bottom, (cycle - 1.5) / 0.3);
        else if (cycle < 2.4) y = c.bottom; else y = M.lerp(c.bottom, c.top, (cycle - 2.4) / 1.6);
        const b = c.b;
        b.vy = (y - b.y) / dt; b.vx = 0;
        if (cycle >= 1.78 && cycle < 1.8 + dt) { GP.Audio.play('stomp', { x: c.x, y: c.bottom, vol: 0.7 }); GP.FX.sparks(c.x, c.bottom + 0.6, 0, -1, 10, '#ffd27a', 4, Math.PI); }
      }
    },
    populate(game) {
      const sp = (id, x, y, o) => game.spawn(id, x, y, Object.assign({ silent: true, noUndo: true }, o));
      sp('droid_parts', -34, -5); sp('droid_parts', -30, -5); sp('crate_separatist', 44, -0.7); sp('crate_separatist', 45.4, -0.7);
      sp('b1_droid', -46, -1, { aiMode: 'off' }); sp('b1_droid', -44, -1, { aiMode: 'off' });
    },
  });

  defs.push({
    id: 'station', name: 'Space Station', desc: 'Pressurized corridors with panoramic windows, an airlock and a planet below.',
    bounds: { minX: -50, maxX: 50, minY: -20, maxY: 6 }, view: { minX: -52, maxX: 52, minY: -16, maxY: 3 }, killY: 30, ambience: 'station', darkness: 0.18, lightColor: '#040810',
    camera: { x: 0, y: -4, zoom: 1 }, dustColor: '#9aa0aa',
    background: { seed: 83, sky: ['#000108', '#02040c', '#040a1a'], stars: 600, nebula: '#2a5aa0', bodies: [{ x: 30, y: 60, r: 180, c1: '#6ab0e0', c2: '#16325a', glow: '#6ab0ff', bands: true }, { x: -120, y: -80, r: 14, c1: '#e8e0d0', c2: '#8a8070' }],
      traffic: { count: 5, y: -70, spread: 100, color: '#8a909a', glow: '#8ad0ff', capital: { x: -90, y: -46, size: 10, drift: 0.3, color: '#8a909c' } } },
    backdrop: { minX: -50, maxX: 50, minY: -14, maxY: 0, color: '#aab0ba', panelW: 3, panelH: 2, line: 'rgba(0,0,0,0.08)', windows: [{ x: -40, y: -11, w: 22, h: 8, bars: 4 }, { x: -8, y: -11, w: 16, h: 8, bars: 3 }, { x: 20, y: -11, w: 18, h: 8, bars: 3 }], frame: '#5a6070', lamps: [{ x: -30, y: -12.6 }, { x: 0, y: -12.6 }, { x: 30, y: -12.6 }] },
    staticLights: [{ x: -30, y: -10, r: 10, i: 0.6 }, { x: 0, y: -10, r: 10, i: 0.6 }, { x: 30, y: -10, r: 10, i: 0.6 }],
    build(game) {
      H.rect(game, -50, 0, 50, 8, S.station);
      H.frame(game, { minX: -50, maxX: 50, top: -22, bottom: 8, ceiling: -13.5, wall: S.station });
      H.rect(game, -12, -5, -4, -4.5, S.metal, ST); H.rect(game, 6, -7, 14, -6.5, S.metal, ST);
      H.forcefield(game, 44, -13.5, 44.4, 0);
    },
    populate(game) {
      const sp = (id, x, y, o) => game.spawn(id, x, y, Object.assign({ silent: true, noUndo: true }, o));
      sp('console', -46, -1); sp('console', 38, -1); sp('crate_small', -20, -0.4); sp('crate_small', -19.2, -0.4); sp('crate_small', -19.6, -1.2);
      sp('mouse_droid', 10, -0.3); sp('gonk_droid', -26, -1);
    },
  });

  defs.push({
    id: 'frozen', ambientTemp: -24, name: 'Frozen Planet', desc: 'Snowfields, slick ice and trench lines before a shield generator.',
    bounds: { minX: -110, maxX: 110, minY: -60, maxY: 10 }, view: { minX: -112, maxX: 112, minY: -60, maxY: 6 }, killY: 40, ambience: 'wind', weather: { type: 'snow', rate: 60, wind: -0.8 }, dustColor: '#e8eef6', wind: -1,
    camera: { x: 0, y: -4, zoom: 0.85 },
    background: { seed: 97, sky: ['#8aa6c6', '#c0d2e6', '#eef2f8'], haze: '#ffffff', clouds: { color: '#ffffff', shadow: '#c8d4e4', alpha: 0.45, count: 9, y: -58, spread: 30, speed: -2 }, traffic: { count: 2, y: -70, color: '#5a6070', glow: '#ff8a60' }, layers: [{ kind: 'snowpeaks', factor: 0.1, base: 6, minH: 10, maxH: 26, spacing: 30, color: '#9aaccc', cap: '#f0f6ff' }, { kind: 'snowpeaks', factor: 0.3, base: 4, minH: 3, maxH: 8, spacing: 16, color: '#c0cee0', cap: '#ffffff' }] },
    build(game) {
      const pts = [];
      for (let x = -110; x <= 110; x += 3) {
        let y = Math.sin(x * 0.04) * 1.4 + Math.sin(x * 0.13) * 0.5;
        if (Math.abs(x + 20) < 4) y += 1.6; // trench
        if (Math.abs(x) > 95) y -= (Math.abs(x) - 95) * 0.8;
        pts.push(x, y);
      }
      H.ground(game, pts, 12, S.snow);
      H.frame(game, { minX: -110, maxX: 110, top: -66, bottom: 12, wall: S.snow });
      H.rect(game, 10, -0.7, 26, 0.6, S.ice);
      H.rect(game, -40, -0.8, -30, 0.6, S.ice);
      // shield generator
      H.rect(game, 60, -6, 64, 1, S.darkMetal, ST); const dome = []; for (let i = 0; i <= 8; i++) { const a = Math.PI + i / 8 * Math.PI; dome.push(62 + Math.cos(a) * 4, -6 + Math.sin(a) * 3); } H.piece(game, dome, S.metal, ST);
    },
    populate(game) {
      const sp = (id, x, y, o) => game.spawn(id, x, y, Object.assign({ silent: true, noUndo: true }, o));
      sp('barricade', -14, -1); sp('barricade', -26, -1); sp('crate_rebel', -8, -0.8); sp('crate_rebel', -6.6, -0.8);
      sp('snowspeeder', 40, -3.5, { facing: -1 });
    },
  });

  defs.push({
    id: 'space', ambientTemp: 4, name: 'Open Space Test Chamber', desc: 'A sealed zero-gravity chamber for pure physics experiments.',
    bounds: { minX: -34, maxX: 34, minY: -30, maxY: 4 }, view: { minX: -34, maxX: 34, minY: -30, maxY: 2 }, killY: 60, ambience: 'space', zeroG: true, darkness: 0.1, lightColor: '#02040a',
    camera: { x: 0, y: -13, zoom: 0.8 }, dustColor: '#6ec8ff',
    background: { seed: 101, sky: ['#000004', '#02030a', '#050a18'], stars: 800, nebula: '#8a3ab0', nebula2: '#2a8ab0', bodies: [{ x: -110, y: -60, r: 40, c1: '#d8a070', c2: '#4a2a1a', glow: '#ff9a50', bands: true, ring: '#e8c8a0' }] },
    backdrop: { minX: -32, maxX: 32, minY: -28, maxY: 0, color: 'rgba(20,28,44,0.55)', panelW: 2, panelH: 2, line: 'rgba(74,200,255,0.08)' },
    build(game) {
      H.rect(game, -32, 0, 32, 6, S.chamber);
      H.frame(game, { minX: -32, maxX: 32, top: -36, bottom: 6, ceiling: -28, wall: S.chamber, thick: 6 });
      H.forcefield(game, -6, -14.3, 6, -13.8, '#b36eff');
    },
    populate(game) {
      const sp = (id, x, y, o) => game.spawn(id, x, y, Object.assign({ silent: true, noUndo: true }, o));
      for (let i = 0; i < 8; i++) { const e = sp(i % 3 ? 'crate_small' : 'crate_cargo', M.rand(-26, 26), M.rand(-25, -3)); if (e) { e.body.w = M.rand(-1, 1); e.body.vx = M.rand(-1, 1); e.body.vy = M.rand(-1, 1); } }
      sp('asteroid', -18, -20); sp('asteroid', 18, -8);
    },
  });

  defs.push({
    id: 'naboo', liquids: 'water', name: 'Naboo Lakeside', desc: 'Rolling green hills around a deep, clear lake. Things float, sink and splash.',
    bounds: { minX: -90, maxX: 90, minY: -60, maxY: 12 }, view: { minX: -92, maxX: 92, minY: -60, maxY: 9 }, killY: 40, ambience: 'wind', ambientTemp: 22, waterTemp: 14, dustColor: '#8aa060',
    camera: { x: 0, y: -3, zoom: 0.9 },
    background: { seed: 131, sky: ['#6ab4e8', '#b8dcf0', '#f0f4e0'], haze: '#ffffff', bodies: [{ x: -90, y: -130, r: 24, c1: '#fffbe8', c2: '#ffe8a0', glow: '#fff4c0' }],
      rays: true, clouds: { color: '#ffffff', shadow: '#dce8f0', alpha: 0.55, count: 8, y: -58, spread: 30, speed: 1 },
      traffic: { count: 3, y: -70, color: '#c8b070', glow: '#ffe8a0' },
      layers: [{ kind: 'mountains', factor: 0.08, base: 2, minH: 5, maxH: 11, spacing: 34, color: '#8ab0c4', hazeMix: 0.5, fog: 0.3 }, { kind: 'mountains', factor: 0.13, base: 2, minH: 3, maxH: 6.5, spacing: 22, color: '#6a98a4', fog: 0.25 },
        { kind: 'city', style: 'domes', factor: 0.2, base: 1, minH: 2, maxH: 5, spacing: 9, color: '#e0d2b0', windows: '#b89a60', fog: 0.12 }, { kind: 'dunes', factor: 0.4, base: 2, minH: 1, maxH: 3, spacing: 16, color: '#5e9444', rim: 0.2 }] },
    build(game) {
      const grass = { fill: '#5e4a32', edge: '#a8dc68', pattern: 'strata', top: '#5f9a36', topW: 0.34, deco: 'grass', depth: 0.5, specks: ['#3a2c1c', '#7a6446'], friction: 0.9 };
      const mud = { fill: '#5a4a34', edge: '#7a6a4a', pattern: 'strata', top: '#4a3c2a', topW: 0.15, deco: 'moss', depth: 0.45, specks: ['#3a2e20', '#6e5e44'] };
      const pts = [];
      for (let x = -90; x <= 90; x += 2) {
        let y = Math.sin(x * 0.05) * 1.2 + Math.sin(x * 0.17) * 0.4;
        const d = Math.abs(x);
        if (d < 22) y = Math.max(y, 0) + (1 - M.smooth(Math.min(1, (d - 4) / 18 > 0 ? (d - 4) / 18 : 0))) * 6.5;
        if (d > 78) y -= (d - 78) * 0.8;
        pts.push(x, y);
      }
      H.ground(game, pts.slice(0, pts.indexOf(-24) + 2), 14, grass);
      H.ground(game, pts.slice(pts.indexOf(-24), pts.indexOf(24) + 2), 14, mud);
      H.ground(game, pts.slice(pts.indexOf(24)), 14, grass);
      H.water(game, -21, 0.4, 21, 7);
      H.frame(game, { minX: -90, maxX: 90, top: -66, bottom: 14, wall: mud });
      H.rect(game, 24, -0.2, 34, 0.5, { fill: '#c8b890', edge: '#e8dcc0', pattern: 'bricks', patternColor: 'rgba(0,0,0,0.15)' }, ST); // stone jetty base
      H.rect(game, 14, -0.5, 26, -0.2, { fill: '#8a6a44', edge: '#b08a5a', pattern: 'grate', patternColor: 'rgba(0,0,0,0.25)', material: 'wood', toughness: 130 }, ST); // wooden pier
    },
    populate(game) {
      const sp = (id, x, y, o) => game.spawn(id, x, y, Object.assign({ silent: true, noUndo: true }, o));
      sp('crate_wood', -8, -1.5); sp('crate_wood', 6, -1.5); sp('barrel', 0, -1.5); sp('ball', -3, -1); sp('heavy_ball', 3, -1.5);
      sp('crate_wood', 29, -1.2); sp('plank', 30, -2.4);
      sp('gungan', -30, -1.5); sp('gungan', -33, -1.5);
    },
  });

  for (const d of defs) {
    d.drawBackground = makeBackground(d.background);
    if (d.backdrop) d.drawBackdrop = interiorBackdrop(d.backdrop);
    d.darkness = d.darkness || 0;
    maps.set(d.id, d);
  }

  return {
    helpers: H, styles: S,
    get: (id) => maps.get(id),
    list: () => Array.from(maps.values()),
    register(d) { d.drawBackground = makeBackground(d.background); if (d.backdrop) d.drawBackdrop = interiorBackdrop(d.backdrop); maps.set(d.id, d); },
    build(game, def) {
      game.map.staticLights = (def.staticLightsBase || def.staticLights || []).slice();
      def.staticLightsBase = def.staticLightsBase || (def.staticLights || []).slice();
      game.map.crushers = [];
      game.liquidRegions = GP.Fluid && GP.Settings.p.liquidQuality !== 'off' ? [] : null;
      game.mapFrame = null;
      game.structures = [];
      def.build(game, H);
      game.world.staticDirty = true;
      if (GP.Fluid) GP.Fluid.prepare(game, game.liquidRegions || []);
      game.liquidRegions = null;
    },
    // What the camera may show: the box around the map's solid terrain, pulled in a little so its
    // outside edges (and anything beyond them) never come into view. A map can set `view` itself.
    viewBox(game, def) {
      if (def.view) return Object.assign({}, def.view);
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const b of game.world.bodies) {
        if (!b.terrain || b.type !== Phys.STATIC) continue;
        for (const sh of b.shapes) {
          if (sh.sensor) continue;
          sh.updateWorld(b);
          if (sh.minX < minX) minX = sh.minX; if (sh.maxX > maxX) maxX = sh.maxX;
          if (sh.minY < minY) minY = sh.minY; if (sh.maxY > maxY) maxY = sh.maxY;
        }
      }
      if (minX > maxX) return null;
      const m = 0.8;
      return { minX: minX + m, maxX: maxX - m, minY: minY + m, maxY: maxY - m };
    },
    // How far the camera may see when zoomed right out: the map plus a margin of solid material all
    // around it (the renderer paints the frame's material out there), or open sky above an outdoor map.
    outerBox(game, view) {
      const f = game.mapFrame, E = 14;
      if (!view) return null;
      if (!f) return { minX: view.minX - E, maxX: view.maxX + E, minY: view.minY - E, maxY: view.maxY + E };
      return { minX: Math.min(view.minX, f.minX) - E, maxX: Math.max(view.maxX, f.maxX) + E, minY: (f.top != null ? Math.min(view.minY, f.top) : view.minY) - E, maxY: Math.max(view.maxY, f.bottom) + E };
    },
    // Small preview used by the map picker
    thumbnail(def, w, h) {
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const ctx = c.getContext('2d');
      const cam = new GP.Camera(); cam.setViewport(w, h, 1); cam.zoom = 0.28; cam.x = (def.camera || {}).x || 0; cam.y = ((def.camera || {}).y || 0) - 1;
      def.drawBackground(ctx, cam, w, h, 0, 1);
      // draw terrain via a temporary world
      try {
        const fake = { world: new GP.Phys.World(), map: {} };
        def.build(fake, H);
        cam.apply(ctx);
        if (def.drawBackdrop) def.drawBackdrop(ctx, cam, 0);
        GP.Terrain.paintAll(ctx, fake.world, cam.scale);
      } catch (e) { /* preview only */ }
      return c;
    },
  };
})();
