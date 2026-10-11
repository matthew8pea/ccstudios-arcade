// Galactic Playground browser tests.
//
//   cd dev/tests && npm install && npx playwright install chromium && npm test
//   node dev/tests/run.mjs [suite ...]         run only some suites (see SUITES below)
//   CHROMIUM_PATH=/path/to/chrome npm test     use a Chromium you already have
//
// Serves the game from the repository root, opens it in headless Chromium and runs each suite in the
// real game. Liquids run on the main thread (GP.Fluid.setSync) and maps load instantly
// (GP.Main.instantLoad) so game.tick() is deterministic, except in the suites that test those two
// things themselves. Exits with code 1 if any check fails.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let playwright;
try { playwright = await import('playwright'); } catch (e) {
  if (!process.env.PLAYWRIGHT_PATH) { console.error('Playwright is not installed. Run `npm install` in dev/tests (or set PLAYWRIGHT_PATH).'); process.exit(2); }
  playwright = await import(process.env.PLAYWRIGHT_PATH);
}
const { chromium } = playwright;

/* ------------------------------------------------------------------ static server */
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  const file = path.join(ROOT, url === '/' ? 'index.html' : url);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('not found'); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = 'http://127.0.0.1:' + server.address().port + '/';

/* ------------------------------------------------------------------ helpers */
let failures = 0, passes = 0;
function check(name, ok, detail) {
  if (ok) passes++; else failures++;
  console.log((ok ? '  ✓ ' : '  ✗ ') + name + (detail != null ? '  (' + detail + ')' : ''));
}
// CHROMIUM_PATH: use an already installed Chromium instead of Playwright's own download
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'], executablePath: process.env.CHROMIUM_PATH || undefined });

async function openGame(opts = {}) {
  const ctx = await browser.newContext(Object.assign({ viewport: { width: 1200, height: 720 } }, opts.context || {}));
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(BASE);
  await page.waitForFunction(() => window.GAME && window.GP && GP.Fluid && GP.Main, null, { timeout: 30000 });
  await page.evaluate((o) => {
    localStorage.removeItem('gp.mods.v1');
    GP.Settings.play.tutorialDone = true;
    GP.Settings.p.askLiquid = false;
    GP.Settings.p.liquidQuality = 'medium';
    if (!o.threaded) GP.Fluid.setSync(true);
    if (!o.realLoad) GP.Main.instantLoad = true;
  }, opts);
  return { ctx, page, errors };
}
// start a sandbox on a map with nothing spawned; the game is paused so tests drive time with tick()
const EMPTY = (map = 'hangar') => `(() => {
  GP.UI.closeOverlay(); GP.Main.startSandbox('${map}', true);
  const g = window.GAME; for (const e of g.entities.slice()) g.removeEntity(e);
  GP.UI.toggleSpawn(false); g.paused = true; return g;
})()`;

/* ------------------------------------------------------------------ suites */
const SUITES = {
  // every map loads and every spawnable object can be created and simulated without errors
  async smoke() {
    const { ctx, page, errors } = await openGame();
    const maps = await page.evaluate(() => GP.Maps.list().map((m) => m.id));
    const bad = [];
    for (const id of maps) {
      const ok = await page.evaluate((id) => { try { GP.UI.closeOverlay(); GP.Main.startSandbox(id, true); for (let i = 0; i < 30; i++) window.GAME.tick(1 / 60); return window.GAME.mapId === id; } catch (e) { return e.message; } }, id);
      if (ok !== true) bad.push(id + ': ' + ok);
    }
    check('all ' + maps.length + ' maps load and run', !bad.length, bad.join('; ') || null);
    const r = await page.evaluate(`(() => {
      const g = ${EMPTY()};
      const defs = GP.Registry.all().filter((d) => !d.hidden && d.kind !== 'contraption');
      const failed = [];
      for (const d of defs) {
        try {
          const e = g.spawn(d.id, 0, -2, { silent: true, aiMode: 'off' });
          if (!e) { failed.push(d.id + ' (not created)'); continue; }
          for (let i = 0; i < 4; i++) g.tick(1 / 60);
          g.removeEntity(e);
        } catch (err) { failed.push(d.id + ': ' + err.message); }
      }
      for (const e of g.entities.slice()) g.removeEntity(e);
      return { n: defs.length, failed };
    })()`);
    check('all ' + r.n + ' spawnable objects build and simulate', !r.failed.length, r.failed.slice(0, 5).join('; ') || null);
    check('no page errors', !errors.length, errors.slice(0, 3).join(' | ') || null);
    await ctx.close();
  },

  // the camera never shows anything outside a map, nothing falls out of one, and reset keeps "start empty"
  async maps() {
    const { ctx, page, errors } = await openGame();
    const r = await page.evaluate(() => {
      const g = window.GAME, out = { outside: [], fell: [] };
      for (const m of GP.Maps.list()) {
        GP.UI.closeOverlay(); GP.Main.startSandbox(m.id, true);
        const c = g.camera, v = c.view;
        if (!v) { out.outside.push(m.id + ': no view'); continue; }
        for (const [fx, fy, z] of [[-1, -1, 0.01], [1, -1, 0.01], [-1, 1, 0.01], [1, 1, 0.01], [-1, 1, 1], [1, 1, 3]]) {
          c.follow = null; c.zoom = c.tzoom = z; c.x = c.tx = fx * 1e4; c.y = c.ty = fy * 1e4;
          c.update(1 / 60);
          const r = c.viewRect();
          // zoomed in: inside the playable map; zoomed right out: inside the solid surround painted around it
          const b = z >= 1 ? v : c.outer;
          if (!b || r.minX < b.minX - 0.01 || r.maxX > b.maxX + 0.01 || r.minY < b.minY - 0.01 || r.maxY > b.maxY + 0.01) out.outside.push(m.id + ' at ' + fx + ',' + fy + ' zoom ' + z);
        }
      }
      // a crate dropped down the facility's reactor shaft lands on its floor
      GP.Main.startSandbox('facility', true);
      for (const e of g.entities.slice()) g.removeEntity(e);
      g.paused = true;
      const crate = g.spawn('crate_small', 0, -3, { silent: true, noUnstick: true });
      for (let i = 0; i < 300; i++) g.tick(1 / 60);
      out.shaft = crate.removed ? 'lost' : crate.body.y.toFixed(1);
      // reset keeps the "start empty" choice
      GP.Settings.play.startEmpty = true; GP.Main.startEmpty = null; GP.Main.startSandbox('hangar', true);
      g.resetScene(); out.emptyReset = g.entities.length;
      GP.Settings.play.startEmpty = false; GP.Main.startSandbox('hangar', true);
      const n = g.entities.length; g.resetScene(); out.fullReset = [n, g.entities.length];
      out.aiDefault = GP.Settings.play.ai;
      return out;
    });
    check('the camera never shows past any map (or its solid surround when zoomed out)', !r.outside.length, r.outside.slice(0, 4).join('; ') || null);
    check('the facility shaft has a floor', r.shaft !== 'lost' && +r.shaft < 22.5, 'crate at y ' + r.shaft);
    check('resetting an empty start stays empty', r.emptyReset === 0, r.emptyReset + ' objects');
    check('resetting a normal start brings the props back', r.fullReset[0] > 0 && r.fullReset[0] === r.fullReset[1], r.fullReset.join(' -> '));
    check('AI is off by default', r.aiDefault === false);
    check('no page errors', !errors.length, errors.slice(0, 3).join(' | ') || null);
    await ctx.close();
  },

  // brittle bodies: short falls are harmless, long ones break or kill
  async falls() {
    const { ctx, page, errors } = await openGame();
    const r = await page.evaluate(`(() => {
      const g = ${EMPTY()};
      // somewhere with a clear drop to the floor (the hangar has gantries and catwalks overhead)
      let X = 0;
      for (let x = -20; x <= 20; x += 0.5) {
        const hit = g.world.raycast(x - 0.4, -19, x - 0.4, 1, (s) => !s.sensor), hit2 = g.world.raycast(x + 0.4, -19, x + 0.4, 1, (s) => !s.sensor);
        if (hit && hit2 && hit.y > -0.5 && hit2.y > -0.5) { X = x; break; }
      }
      const drop = (h) => {
        for (const e of g.entities.slice()) g.removeEntity(e);
        const c = g.spawn('stormtrooper', X, -h - 1.1, { silent: true, noUnstick: true, aiMode: 'off' });
        for (let i = 0; i < 240; i++) g.tick(1 / 60);
        return { dead: c.state === 'dead', frac: c.partList.some((b) => b.part.fractured), hp: c.healthFraction() };
      };
      return { low: drop(1.2), high: drop(16) };
    })()`);
    check('a 1.2 m fall leaves a trooper unhurt', !r.low.dead && !r.low.frac && r.low.hp > 0.9, 'hp ' + r.low.hp.toFixed(2));
    check('a 16 m fall kills or breaks bones', r.high.dead || r.high.frac, 'dead ' + r.high.dead + ', fractured ' + r.high.frac);
    check('no page errors', !errors.length, errors.slice(0, 3).join(' | ') || null);
    await ctx.close();
  },

  // liquid physics: levelling, draining, layering, reactions, props
  async liquids() {
    const { ctx, page, errors } = await openGame();
    const r = await page.evaluate(`(() => {
      const g = ${EMPTY()};
      const H = GP.Maps.helpers, S = GP.Maps.styles, F = GP.Fluid;
      const fill = (t, x1, x2, y1, y2) => { const sp = F.spacing(); let row = 0; for (let y = y2 - sp * 0.5; y > y1; y -= sp * 0.87, row++) for (let x = x1 + (row % 2 ? sp * 0.5 : sp * 0.25); x < x2; x += sp) F.add(t, x, y); };
      const run = (s) => { for (let i = 0; i < s * 60; i++) g.tick(1 / 60); };
      const each = (fn) => { for (let i = 0; i < F.count(); i++) fn(F.particle(i)); };
      const reset = () => { for (const e of g.entities.slice()) g.removeEntity(e); F.clear(); };
      const out = {};
      // dam break in a 20 m box: no dry gaps once settled
      const w1 = H.rect(g, -10.4, -6, -10, 0.1, S.metal), w2 = H.rect(g, 10, -6, 10.4, 0.1, S.metal);
      g.world.staticDirty = true;
      fill(0, -10, -8, -4, 0); run(12);
      const bins = new Array(10).fill(0); each((q) => { const b = Math.floor((q.x + 10) / 2); if (b >= 0 && b < 10) bins[b]++; });
      out.damBins = bins;
      // a flat shelf beside a pit drains into the pit
      reset();
      const shelf = H.rect(g, -10, -2, 0, 0.1, S.metal), wall = H.rect(g, 4, -6, 4.4, 0.1, S.metal);
      g.world.staticDirty = true;
      fill(0, -9.5, -6.5, -3.2, -2); run(20);
      let inPit = 0; each((q) => { if (q.x > 0) inPit++; }); out.pit = inPit / F.count();
      // the rest happens in the empty box between the pit wall (x 4.4) and the right wall (x 10)
      // oil poured under water rises through it
      reset(); fill(3, 4.6, 9.8, -0.8, 0); fill(0, 4.6, 9.8, -1.8, -0.8); run(15);
      let oy = 0, on = 0, wy = 0, wn = 0; each((q) => { if (q.x < 4.4) return; if (q.type === 'oil') { oy += q.y; on++; } else if (q.type === 'water') { wy += q.y; wn++; } });
      out.oilAbove = on && wn ? (oy / on) < (wy / wn) : false;
      // water on lava makes rock
      reset(); fill(1, 4.6, 9.8, -0.6, 0); fill(0, 4.6, 9.8, -1.4, -0.7); run(3);
      let rock = 0; each((q) => { if (q.type === 'cooled') rock++; }); out.rock = rock;
      // acid eats a crate
      reset(); const crate = g.spawn('crate_wood', 7.2, -0.5, { silent: true, noUnstick: true }); fill(4, 4.6, 9.8, -1.6, -1.1); run(8);
      out.acidAte = crate.removed || (crate.dissolve || 0) > 1;
      // people end up inside liquid (it fills the space they take up) and sink, in every liquid
      out.submerged = [];
      for (const liq of ['water', 'lava', 'oil', 'acid']) {
        reset(); fill(liq, 4.6, 9.8, -2.6, 0);
        const c = g.spawn('stormtrooper', 7.2, -3.8, { silent: true, noUnstick: true, aiMode: 'off' });
        c.knockOut(30);   // limp, so it sinks instead of swimming up
        run(3);
        // anywhere in the body, not just the torso: a limp trooper floats high in dense lava
        let inside = 0; each((q) => { if (c.bodies.some((b) => b.pointInside(q.x, q.y))) inside++; });
        out.submerged.push(liq + ':' + inside);
      }
      // save and load keep the liquid
      reset(); fill(0, 5, 9, -1, 0); const n0 = F.count(); const d = F.serialize(); F.clear(); F.load(d);
      out.saveLoad = [n0, F.count()];
      return out;
    })()`);
    check('water levels out with no dry gaps', r.damBins.every((b) => b > 0), r.damBins.join(' '));
    check('water drains off a flat shelf into a pit', r.pit > 0.85, (r.pit * 100).toFixed(0) + '%');
    check('oil floats up through water', r.oilAbove);
    check('water on lava turns it to rock', r.rock > 5, r.rock + ' rock');
    check('acid dissolves a wooden crate', r.acidAte);
    check('people get submerged in every liquid (it fills the space around and inside them)', r.submerged.every((x) => /:\d+$/.test(x) && +x.split(':')[1] >= 3), r.submerged.join(' '));
    check('liquid survives save and load', r.saveLoad[0] > 0 && r.saveLoad[0] === r.saveLoad[1], r.saveLoad.join(' -> '));
    check('no page errors', !errors.length, errors.slice(0, 3).join(' | ') || null);
    await ctx.close();
  },

  // a poured stream falls as one piece instead of breaking into lumps, and pouring into a pool fills it
  async pouring() {
    const { ctx, page, errors } = await openGame();
    const r = await page.evaluate(`(() => {
      const g = ${EMPTY()};
      const F = GP.Fluid, sp = F.spacing(), st = {};
      for (let i = 0; i < 72; i++) { F.stream(st, 0, 20, -5, 110, 0.22, 1 / 60, 0, 1); g.tick(1 / 60); }
      // airborne drops, grouped into pieces (drops closer than 1.6 spacings belong together)
      const P = []; for (let i = 0; i < F.count(); i++) { const q = F.particle(i); if (q.y < -0.8) P.push(q); }
      const par = P.map((_, i) => i), find = (i) => (par[i] === i ? i : (par[i] = find(par[i])));
      for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++) if (Math.hypot(P[i].x - P[j].x, P[i].y - P[j].y) < sp * 1.6) par[find(i)] = find(j);
      const pieces = new Set(P.map((_, i) => find(i))).size;
      // then keep pouring with the nozzle under the surface
      const n0 = F.count();
      for (let i = 0; i < 120; i++) { F.stream(st, 0, 20, -0.3, 110, 0.22, 1 / 60, 0, 1); g.tick(1 / 60); }
      return { air: P.length, pieces, filled: F.count() - n0 };
    })()`);
    check('a poured stream falls in one piece', r.air > 50 && r.pieces <= 3, r.air + ' drops in the air, ' + r.pieces + ' piece(s)');
    check('pouring under the surface still fills', r.filled > 150, '+' + r.filled + ' drops in 2 s');
    check('no page errors', !errors.length, errors.slice(0, 3).join(' | ') || null);
    await ctx.close();
  },

  // the real threaded mode, in real time
  async worker() {
    const { ctx, page, errors } = await openGame({ threaded: true, realLoad: true });
    await page.evaluate(() => { GP.UI.closeOverlay(); GP.Main.startSandbox('naboo'); });
    await page.waitForFunction(() => window.GAME.mapId === 'naboo' && !document.getElementById('loading'), null, { timeout: 30000 });
    const crate = await page.evaluate(() => { const c = window.GAME.spawn('crate_wood', 2, -2, { silent: true, noUnstick: true }); window.__crate = c; return !!c; });
    await page.waitForTimeout(5000);
    const r = await page.evaluate(() => ({ threaded: GP.Fluid.isThreaded(), n: GP.Fluid.count(), crateY: window.__crate.body.y }));
    check('liquid runs in a worker', r.threaded);
    check('the lake is there', r.n > 1000, r.n + ' particles');
    check('a wooden crate floats on the lake', crate && r.crateY < 1.2 && r.crateY > -1, 'y ' + r.crateY.toFixed(2));
    await page.evaluate(() => { GP.Settings.p.liquidThread = false; });
    await page.waitForTimeout(600);
    const back = await page.evaluate(() => ({ threaded: GP.Fluid.isThreaded(), n: GP.Fluid.count() }));
    check('switching to the main thread keeps the liquid', !back.threaded && Math.abs(back.n - r.n) < r.n * 0.05, back.n + ' particles');
    check('no page errors', !errors.length, errors.slice(0, 3).join(' | ') || null);
    await ctx.close();
  },

  async injuries() {
    const { ctx, page, errors } = await openGame();
    const r = await page.evaluate(`(() => {
      const g = ${EMPTY()};
      const c = g.spawn('stormtrooper', 0, -1.2, { silent: true, noUnstick: true, aiMode: 'off' });
      for (let i = 0; i < 60; i++) g.tick(1 / 60);
      const t = c.parts.torso;
      for (let k = 0; k < 3; k++) GP.Damage.hit(t, { type: 'impact', amount: 28, x: t.x, y: t.y });
      const internal = c.inj.internal;
      for (let i = 0; i < 1200; i++) g.tick(1 / 60);
      const blood = c.blood, shock = c.inj.shock, strength = c.injStrength;
      const arm = c.parts.forearmF;
      GP.Damage.hit(arm, { type: 'blaster', amount: 14, x: arm.x, y: arm.y }); GP.Damage.hit(arm, { type: 'blaster', amount: 14, x: arm.x, y: arm.y });
      g.tick(1 / 60);
      const armFunc = arm.part.func;
      c.revive(); g.tick(1 / 60);
      return { internal, blood, shock, strength, armFunc, healed: c.inj.internal === 0 && c.blood === 1 && GP.Injury.describe(c) === 'fine' };
    })()`);
    check('hard torso blows cause internal bleeding', r.internal > 0.1, r.internal.toFixed(2));
    check('blood drains and shock sets in', r.blood < 0.95 && r.shock > 0.2, 'blood ' + r.blood.toFixed(2) + ', shock ' + r.shock.toFixed(2));
    check('shock weakens muscles', r.strength < 0.95, r.strength.toFixed(2));
    check('nerve damage weakens a limb', r.armFunc < 0.8, r.armFunc.toFixed(2));
    check('healing clears injuries', r.healed);
    check('no page errors', !errors.length, errors.slice(0, 3).join(' | ') || null);
    await ctx.close();
  },

  // breathing: swimmers surface and tread water, run out of air, pass out limp and drown, with or
  // without AI; amphibians breathe underwater and droids don't breathe (they sink and walk the bottom)
  async drowning() {
    const { ctx, page, errors } = await openGame();
    const r = await page.evaluate(`(() => {
      const g = ${EMPTY('naboo')};
      const run = (s) => { for (let i = 0; i < s * 60; i++) g.tick(1 / 60); };
      const out = {};
      const swimmer = g.spawn('stormtrooper', -4, -2.5, { silent: true, noUnstick: true, aiMode: 'off' });
      run(8);
      out.swim = { headY: swimmer.parts.head.y, air: swimmer.air, alive: swimmer.state === 'alive', swimming: swimmer.swimming || !swimmer.headUnder };
      g.removeEntity(swimmer);
      const d = g.spawn('stormtrooper', 0, 4.5, { silent: true, noUnstick: true, aiMode: 'off' });
      run(0.2); d.air = 0.3; run(1.5);
      out.ko = { under: !!d.headUnder, unconscious: d.unconscious > 0, limp: d.muscle < 0.2 };
      d.drownT = 17; run(2.5);
      out.drowned = d.state === 'dead';
      g.removeEntity(d);
      const gungan = g.spawn('gungan', 4, 3.5, { silent: true, noUnstick: true, aiMode: 'off' });
      const droid = g.spawn('b1_droid', 8, 3.5, { silent: true, noUnstick: true, aiMode: 'off' });
      run(6);
      out.gungan = { under: !!gungan.headUnder, air: gungan.air, max: gungan.maxAir(), alive: gungan.state === 'alive' };
      out.droid = { alive: droid.state === 'alive', y: droid.parts.torso.y };
      return out;
    })()`);
    check('a swimmer surfaces and treads water', r.swim.alive && r.swim.headY < 0.8 && r.swim.air > 15, 'head y ' + r.swim.headY.toFixed(2) + ', air ' + r.swim.air.toFixed(0));
    check('out of air underwater they pass out and go limp', r.ko.under && r.ko.unconscious && r.ko.limp, JSON.stringify(r.ko));
    check('left under, they drown', r.drowned);
    check('amphibians breathe underwater', r.gungan.alive && Math.abs(r.gungan.air - r.gungan.max) < 0.01, JSON.stringify(r.gungan));
    check("droids don't drown", r.droid.alive, 'torso y ' + r.droid.y.toFixed(1));
    check('no page errors', !errors.length, errors.slice(0, 3).join(' | ') || null);
    await ctx.close();
  },

  // hold Q / E to preview and spawn facing left / right; people arrive unarmed; F hands them a weapon;
  // the dead float
  async controls() {
    const { ctx, page, errors } = await openGame();
    await page.evaluate(`(() => { const g = ${EMPTY()}; g.paused = false; g.camera.jumpTo(0, -2, 1.2); })()`);
    await page.waitForTimeout(300);
    const scr = (x, y) => page.evaluate(({ x, y }) => { const c = window.GAME.camera, s = c.base * c.zoom; return { x: (x - c.x) * s + c.w / 2, y: (y - c.y) * s + c.h / 2 }; }, { x, y });
    const troopers = () => page.evaluate(() => window.GAME.entities.filter((e) => e.def.id === 'stormtrooper').length);
    await page.evaluate(() => { window.__crate = window.GAME.spawn('crate_wood', 0, -0.4, { silent: true }); window.GAME.tools.setTool('grab'); window.GAME.tools.startPlacing('stormtrooper'); });
    await page.waitForTimeout(400);
    // picking something changes nothing else: the current tool (Grab) still hovers and drags
    const c0 = await page.evaluate(() => ({ x: window.__crate.body.x, y: window.__crate.body.y }));
    let s = await scr(c0.x, c0.y); await page.mouse.move(s.x, s.y); await page.waitForTimeout(150);
    const hovered = await page.evaluate(() => !!(window.GAME.tools.hover && window.GAME.tools.hover.e === window.__crate));
    await page.mouse.down(); await page.mouse.move(s.x + 40, s.y - 120, { steps: 8 }); await page.waitForTimeout(300);
    const lifted = await page.evaluate(() => window.__crate.body.y);
    await page.mouse.up(); await page.waitForTimeout(200);
    check('with something picked, the current tool still works', hovered && lifted < c0.y - 0.5, 'hover ' + hovered + ', lifted ' + (c0.y - lifted).toFixed(2) + ' m');
    check('clicking with something picked spawns nothing', (await troopers()) === 0);
    s = await scr(-3, -1.2); await page.mouse.move(s.x, s.y);
    await page.keyboard.down('KeyQ'); await page.waitForTimeout(250);
    const held = await page.evaluate(() => window.GAME.tools.placing && window.GAME.tools.placing.hold);
    const none = await troopers();
    await page.keyboard.up('KeyQ'); await page.waitForTimeout(250);
    s = await scr(3, -1.2); await page.mouse.move(s.x, s.y);
    await page.keyboard.down('KeyE'); await page.waitForTimeout(150); await page.keyboard.up('KeyE'); await page.waitForTimeout(250);
    await page.keyboard.press('Escape');
    const made = await page.evaluate(() => window.GAME.entities.filter((e) => e.def.id === 'stormtrooper').map((e) => ({ x: e.parts.torso.x, facing: e.facing, items: e.items().length })));
    check('holding Q shows a hologram without spawning yet', held === -1 && none === 0);
    check('releasing Q / E spawns facing left / right', made.length === 2 && made.some((m) => m.x < 0 && m.facing === -1) && made.some((m) => m.x > 0 && m.facing === 1), JSON.stringify(made.map((m) => m.facing)));
    check('people spawn without weapons', made.every((m) => m.items === 0));
    await page.evaluate(() => { window.__rifle = window.GAME.spawn('e11', -2.2, -0.3, { silent: true }); });
    await page.waitForTimeout(500);
    const rp = await page.evaluate(() => ({ x: window.__rifle.body.x, y: window.__rifle.body.y }));
    s = await scr(rp.x, rp.y); await page.mouse.move(s.x, s.y); await page.waitForTimeout(150);
    await page.keyboard.press('KeyF'); await page.waitForTimeout(300);
    const w = await page.evaluate(() => { const c = window.GAME.entities.find((e) => e.def.id === 'stormtrooper' && e.facing === -1), it = window.__rifle; return { held: it.holder === c, noSelfCollide: it.body.shapes.every((sh) => sh.group === c.group) }; });
    check('F on a weapon near a person makes them wield it', w.held);
    check('the weapon ignores its wielder only', w.noSelfCollide);
    const f = await page.evaluate(`(() => {
      const g = ${EMPTY('naboo')};
      const c = g.spawn('stormtrooper', 0, 3.5, { silent: true, noUnstick: true, aiMode: 'off' });
      for (let i = 0; i < 30; i++) g.tick(1 / 60);
      c.die();
      for (let i = 0; i < 480; i++) g.tick(1 / 60);
      return c.parts.torso.y;
    })()`);
    check('dead bodies float up to the surface', f < 1.2, 'torso y ' + f.toFixed(2));
    check('no page errors', !errors.length, errors.slice(0, 3).join(' | ') || null);
    await ctx.close();
  },

  // big screens can zoom well out; the wheel zooms by how far it scrolled; zoomed in, the view stays
  // inside the map, and zoomed out it never goes past the solid surround
  async camera() {
    const { ctx, page, errors } = await openGame({ context: { viewport: { width: 1920, height: 1080 } } });
    await page.evaluate(`(() => { const g = ${EMPTY('station')}; g.paused = false; })()`);
    await page.waitForTimeout(300);
    const cam = () => page.evaluate(() => { const c = window.GAME.camera, r = c.viewRect(), v = c.view, o = c.outer; return { z: c.zoom, min: c.minZoom(), r, v, o }; });
    let c = await cam();
    check('a big screen can zoom out on a small map', c.min < 0.6 && c.z <= 1.01, 'min zoom ' + c.min.toFixed(2) + ', start ' + c.z.toFixed(2));
    await page.mouse.move(960, 540);
    const z0 = c.z;
    for (let i = 0; i < 10; i++) await page.mouse.wheel(0, 4);   // trackpad-sized steps
    await page.waitForTimeout(100);
    c = await cam();
    check('small trackpad scrolls zoom gently', c.z < z0 && c.z > z0 * 0.9, (z0 / c.z).toFixed(3) + 'x');
    for (let i = 0; i < 40; i++) await page.mouse.wheel(0, 100);
    await page.keyboard.down('KeyA'); await page.waitForTimeout(1500); await page.keyboard.up('KeyA'); await page.waitForTimeout(300);
    c = await cam();
    const inside = (r, b, e = 0.05) => r.minX >= b.minX - e && r.maxX <= b.maxX + e && r.minY >= b.minY - e && r.maxY <= b.maxY + e;
    check('zoomed right out, the view stays within the solid surround', Math.abs(c.z - c.min) < 0.01 && inside(c.r, c.o), JSON.stringify({ z: +c.z.toFixed(2), x: +c.r.minX.toFixed(1) }));
    for (let i = 0; i < 12; i++) await page.mouse.wheel(0, -100);
    await page.waitForTimeout(100);
    const x0 = (await cam()).r.minX;
    await page.keyboard.down('KeyD'); await page.waitForTimeout(400); await page.keyboard.up('KeyD'); await page.waitForTimeout(300);
    check('A / D pan the camera', (await cam()).r.minX > x0 + 1);
    // middle-drag far past the left border, then back: the camera follows back straight away
    await page.evaluate(() => { const c = window.GAME.camera; c.jumpTo(-30, c.y); c.clampToView(); });
    await page.mouse.move(600, 540); await page.mouse.down({ button: 'middle' });
    await page.mouse.move(1900, 540, { steps: 10 });
    const atEdge = (await cam()).r.minX;
    await page.mouse.move(1800, 540, { steps: 4 });
    const back = (await cam()).r.minX;
    await page.mouse.up({ button: 'middle' });
    const border = (await cam()).v.minX;
    check('dragging back from a border moves the camera at once', Math.abs(atEdge - border) < 0.1 && back > atEdge + 0.5, 'edge ' + atEdge.toFixed(1) + ' -> ' + back.toFixed(1));
    await page.evaluate(() => { const c = window.GAME.camera; c.tx = -500; c.ty = -500; });   // try to fly far past the corner
    await page.waitForTimeout(1200);
    c = await cam();
    check('zoomed in, the camera stops at the map border', inside(c.r, c.v) && Math.abs(c.r.minX - c.v.minX) < 0.2 && Math.abs(c.r.minY - c.v.minY) < 0.2, 'left ' + c.r.minX.toFixed(1) + ' / ' + c.v.minX + ', top ' + c.r.minY.toFixed(1) + ' / ' + c.v.minY);
    check('no page errors', !errors.length, errors.slice(0, 3).join(' | ') || null);
    await ctx.close();
  },

  async sharing() {
    const { ctx, page, errors } = await openGame();
    const r = await page.evaluate(`(async () => {
      const g = ${EMPTY()};
      const S = { silent: true, noUnstick: true };
      const a = g.spawn('crate_wood', 0, -0.5, S), b = g.spawn('crate_wood', 1.2, -0.5, S);
      g.spawn('stormtrooper', -3, -1.2, Object.assign({ aiMode: 'off' }, S));
      g.tools.addConstraint(new GP.Phys.WeldJoint(a.body, b.body, 0.6, -0.5, {}));
      GP.Fluid.pour(0, 4, -2, 150, 0.5);
      for (let i = 0; i < 30; i++) g.tick(1 / 60);
      const count = () => g.entities.filter((e) => !e.removed && e.kind !== 'debris').length;
      const before = [count(), GP.Fluid.count(), g.tools.constraints.filter((j) => j.world).length];
      const code = await GP.Share.sceneCode(g);
      g.loadMap('naboo', { empty: true });
      const res = await GP.Share.importCode(g, code);
      const after = [count(), GP.Fluid.count(), g.tools.constraints.filter((j) => j.world).length];
      const crates = g.entities.filter((e) => e.def.id === 'crate_wood');
      const cc = await GP.Share.contraptionCode(g, crates, 'Crate pair');
      const n0 = count();
      const r2 = await GP.Share.importCode(g, cc);
      let bad = null; try { await GP.Share.importCode(g, cc.slice(0, -25)); } catch (e) { bad = e.message; }
      return { before, after, map: g.mapId, type: res.type, code: code.slice(0, 5), contraption: r2.type, added: count() - n0, bad };
    })()`);
    check('scene codes are compressed', r.code === 'GPZ1.' || r.code === 'GPJ1.', r.code);
    check('a scene survives a share code', r.type === 'scene' && r.map === 'hangar' && r.before.join() === r.after.join(), r.before.join('/') + ' -> ' + r.after.join('/'));
    check('a contraption code adds its parts', r.contraption === 'contraption' && r.added === 2, '+' + r.added);
    check('damaged codes are rejected', !!r.bad, r.bad);
    check('no page errors', !errors.length, errors.slice(0, 3).join(' | ') || null);
    await ctx.close();
  },

  async mods() {
    const { ctx, page, errors } = await openGame();
    const r = await page.evaluate(`(() => {
      const ex = GP.Mods.install(GP.Mods.EXAMPLE);
      const js = GP.Mods.install("// name: Script pack\\nmod.register({ id: 'glow_orb', kind: 'prop', name: 'Glow Orb', shapes: [{ circle: [0.25] }], color: '#6ec8ff' });");
      const clash = GP.Mods.install('{"name":"Clash","items":[{"id":"stormtrooper","base":"crate_wood"}]}');
      const g = ${EMPTY()};
      const made = ['crimson_trooper', 'heavy_crate', 'gold_bar', 'glow_orb'].map((id) => !!g.spawn(id, 0, -2, { silent: true, aiMode: 'off' }));
      for (let i = 0; i < 30; i++) g.tick(1 / 60);
      GP.Mods.setEnabled(ex.id, false);
      const hidden = GP.Registry.get('gold_bar').hidden;
      for (const m of GP.Mods.list()) GP.Mods.remove(m.id);
      return { ex: [ex.count, ex.error], js: [js.count, js.error], clash: clash.error, made, hidden, left: GP.Mods.list().length };
    })()`);
    check('a JSON mod installs its items', r.ex[0] === 3 && !r.ex[1], JSON.stringify(r.ex));
    check('a script mod registers content', r.js[0] === 1 && !r.js[1], JSON.stringify(r.js));
    check('mods cannot overwrite built-in objects', !!r.clash, r.clash);
    check('mod items spawn', r.made.every(Boolean), r.made.join());
    check('switching a mod off hides its items', r.hidden === true);
    check('mods can be removed', r.left === 0);
    check('no page errors', !errors.length, errors.slice(0, 3).join(' | ') || null);
    await ctx.close();
  },

  async audio() {
    const { ctx, page, errors } = await openGame();
    await page.mouse.click(600, 360);
    const r = await page.evaluate(`(async () => {
      const g = ${EMPTY()};
      g.paused = false; GP.Audio.ensure();
      const wait = () => new Promise((res) => setTimeout(res, 700));
      const snap = async () => { await wait(); GP.Audio.play('blaster', { x: 0, y: 0 }); return GP.Audio.timeInfo(); };
      const normal = await snap();
      g.slowMo = true; const slow = await snap();
      g.slowMo = false; g.paused = true; const paused = await snap();
      g.paused = false; const back = await snap();
      return { ready: GP.Audio.ready, normal, slow, paused, back };
    })()`);
    if (!r.ready) { check('audio (skipped: no audio device)', true); await ctx.close(); return; }
    check('slow motion pitches sounds down and muffles them', r.slow.pitch < 0.8 && r.slow.cutoff < 5000 && r.slow.wet > 0.3, 'pitch ' + r.slow.pitch.toFixed(2));
    check('pausing silences world sounds', r.paused.world < 0.05, 'gain ' + r.paused.world.toFixed(3));
    check('sound returns to normal', Math.abs(r.back.pitch - 1) < 1e-6 && r.back.world > 0.9);
    check('no page errors', !errors.length, errors.slice(0, 3).join(' | ') || null);
    await ctx.close();
  },

  async touch() {
    const { ctx, page, errors } = await openGame({ context: { viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true } });
    await page.evaluate(`(() => { const g = ${EMPTY()}; g.paused = false; window.__crate = g.spawn('crate_wood', 0, -0.5, { silent: true }); g.camera.jumpTo(0, -1.5, 1); })()`);
    await page.waitForTimeout(400);
    const at = () => page.evaluate(() => { const cam = window.GAME.camera, s = cam.base * cam.zoom, c = window.__crate.body; return { x: (c.x - cam.x) * s + cam.w / 2, y: (c.y - cam.y) * s + cam.h / 2 }; });
    let p = await at();
    await page.touchscreen.tap(p.x, p.y);
    await page.waitForTimeout(400);
    check('touch controls appear after a tap', await page.evaluate(() => { const el = document.getElementById('touchui'); return !!el && getComputedStyle(el).display !== 'none'; }));
    const tapBtn = async (sel, text) => { const b = page.locator(sel, { hasText: text }); await b.dispatchEvent('pointerdown', { pointerId: 7, pointerType: 'touch', bubbles: true }); await b.dispatchEvent('pointerup', { pointerId: 7, pointerType: 'touch', bubbles: true }); };
    await tapBtn('#touchui .touchbar .tbtn', 'Frz');
    await page.waitForTimeout(300);
    check('tap an object, then Freeze', await page.evaluate(() => !!window.__crate.body.frozen));
    const cdp = await ctx.newCDPSession(page);
    const z0 = await page.evaluate(() => window.GAME.camera.zoom);
    const pts = (a) => [{ x: 422 - a, y: 250, id: 1 }, { x: 422 + a, y: 250, id: 2 }];
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pts(60) });
    for (let k = 1; k <= 6; k++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pts(60 + k * 15) }); await page.waitForTimeout(30); }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(200);
    const z1 = await page.evaluate(() => window.GAME.camera.zoom);
    check('pinching zooms in', z1 > z0 * 1.3, z0.toFixed(2) + ' -> ' + z1.toFixed(2));
    p = await at();
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: p.x, y: p.y, id: 3 }] });
    await page.waitForTimeout(800);
    check('a long press opens the object menu', await page.evaluate(() => !!document.querySelector('.ctxmenu')));
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.evaluate(() => { GP.UI.closeContextMenu(); const g = window.GAME; window.__c = g.spawn('stormtrooper', -3, -1.2, { silent: true, aiMode: 'off' }); g.takeControl(window.__c); g.tools.setTool('control'); });
    await page.waitForTimeout(500);
    const x0 = await page.evaluate(() => window.__c.parts.torso.x);
    const right = page.locator('#touchui .tp-move .tbtn', { hasText: '▶' });
    await right.dispatchEvent('pointerdown', { pointerId: 9, pointerType: 'touch', bubbles: true });
    await page.waitForTimeout(1500);
    await right.dispatchEvent('pointerup', { pointerId: 9, pointerType: 'touch', bubbles: true });
    const moved = await page.evaluate((x0) => window.__c.parts.torso.x - x0, x0);
    check('the movement pad walks a character', moved > 0.8, moved.toFixed(2) + ' m');
    check('no page errors', !errors.length, errors.slice(0, 3).join(' | ') || null);
    await ctx.close();
  },

  // undo and redo, autosave and Continue, favorites and remembered tool options
  async qol() {
    const { ctx, page, errors } = await openGame();
    const r = await page.evaluate(`(() => {
      const g = ${EMPTY()}, T = g.tools, out = {};
      const n = () => g.entities.length;
      // spawn, undo, redo: the same object comes back
      const a = T.spawnAt('crate_wood', -1, -1, 0, 1), b = T.spawnAt('crate_wood', 1, -1, 0, 1);
      T.undo(); out.undone = n(); T.redo(); out.redone = n(); out.sameId = !!g.getEntity(b.id);
      // a weld, and taking it off again, both undo and redo
      const j = new GP.Phys.WeldJoint(a.bodies[0], b.bodies[0], 0, -1, { tag: 'weld' });
      T.addConstraint(j); T.record({ type: 'joint', joints: [j] });
      const live = () => T.constraints.filter((c) => c.world).length;
      T.undo(); out.weldUndo = live(); T.redo(); out.weldRedo = live();
      T.removeConstraintsOf(a); out.unweld = live(); T.undo(); out.unweldUndo = live();
      // a new action forgets what was undone
      T.spawnAt('barrel', 0, -1, 0, 1); T.undo(); T.spawnAt('barrel', 0, -1, 0, 1); out.redoAfterNew = T.redo();
      // Clear everything takes the liquid too, and Ctrl+Z brings all of it back
      GP.Fluid.pour(0, 0, -2, 60, 0.5); for (let i = 0; i < 10; i++) g.tick(1 / 60);
      const before = [n(), GP.Fluid.count() > 0, live()];
      T.clearAll(); const cleared = [n(), GP.Fluid.count()];
      T.undo(); const back = [n(), GP.Fluid.count() > 0, live()];
      out.clear = { before, cleared, back };
      return out;
    })()`);
    check('undo removes a spawn and redo brings the same object back', r.undone === 1 && r.redone === 2 && r.sameId, r.undone + ' / ' + r.redone);
    check('welds undo and redo', r.weldUndo === 0 && r.weldRedo === 1 && r.unweld === 0 && r.unweldUndo === 1);
    check('a new action clears redo', r.redoAfterNew === false);
    check('Clear everything empties the scene and liquid', r.clear.cleared[0] === 0 && r.clear.cleared[1] === 0, r.clear.cleared.join('/'));
    check('Ctrl+Z after Clear everything brings it all back', r.clear.back.join() === r.clear.before.join(), r.clear.before.join('/') + ' -> ' + r.clear.back.join('/'));

    const s = await page.evaluate(`(() => {
      const g = window.GAME, out = {};
      GP.UI.closeOverlay(); GP.Main.startSandbox('hangar', true);
      g.tools.spawnAt('stormtrooper', 2, -1, 0, 1);
      const count = g.entities.length;
      g.resetScene();   // throws the scene away: it is kept as the 'before' autosave
      out.slots = GP.SaveSystem.autosaves().map((m) => m.slot);
      GP.Main.toMenu();
      const cont = [...document.querySelectorAll('.mm-buttons button')].find((b) => /continue/i.test(b.textContent));
      out.hasContinue = !!cont;
      if (cont) cont.click();
      out.restored = [g.active, g.entities.length === count, g.entities.some((e) => e.def.id === 'stormtrooper')];
      // favorites: star an item and it shows in the Favorites category
      const star = document.querySelector('#spawn .item[data-id] .itemfav');
      const id = star.closest('.item').dataset.id;
      star.click();
      document.querySelector('#spawn .cats .cat').click();
      out.fav = [GP.Settings.play.favorites.includes(id), [...document.querySelectorAll('#spawn .grid .item')].map((i) => i.dataset.id).join() === id];
      // tool options are remembered for next time
      g.tools.setTool('liquid');
      [...document.querySelectorAll('#toolopts button')].find((b) => b.textContent === 'Lava').click();
      out.remembered = new GP.Tools(g).opts.liquidType;
      return out;
    })()`);
    check('resetting keeps the old scene as an autosave', s.slots.includes('before'), s.slots.join());
    check('the main menu offers Continue', s.hasContinue);
    check('Continue restores the scene', s.restored.every(Boolean), s.restored.join());
    check('starred items show under Favorites', s.fav.every(Boolean), s.fav.join());
    check('tool options are remembered', s.remembered === 'lava', s.remembered);
    check('no page errors', !errors.length, errors.slice(0, 3).join(' | ') || null);
    await ctx.close();
  },

  // the loading screen shows while a map builds, then clears
  async loading() {
    const { ctx, page, errors } = await openGame({ realLoad: true });
    const seen = await page.evaluate(() => { GP.UI.closeOverlay(); GP.Main.startSandbox('naboo'); return !!document.getElementById('loading'); });
    await page.waitForFunction(() => window.GAME.mapId === 'naboo' && !document.getElementById('loading'), null, { timeout: 30000 });
    check('a loading screen shows while the map builds', seen);
    check('it clears once the map is ready', true);
    check('no page errors', !errors.length, errors.slice(0, 3).join(' | ') || null);
    await ctx.close();
  },

  // map structures (catwalks, platforms, buildings) break apart; the ground does not
  async structures() {
    const { ctx, page, errors } = await openGame();
    const r = await page.evaluate(`(() => {
      const g = ${EMPTY()};
      const run = (s) => { for (let i = 0; i < s * 60; i++) g.tick(1 / 60); };
      const span = (S) => Array.from(S.bodies).map((b) => { const xs = b.shapes[0].wv.filter((_, i) => i % 2 === 0); return Math.min(...xs).toFixed(1) + '..' + Math.max(...xs).toFixed(1); }).join(' ');
      const terrain = () => g.world.bodies.filter((b) => b.terrain && !b.structure && !b.entity && !b.removed).length;
      const out = { count: g.structures.length };
      // blaster bolts fired straight down wear a hole in the middle catwalk
      const mid = g.structures.find((S) => S.bounds.minY < -13);
      let shots = 0;
      while (!mid.gone.size && shots < 15) { GP.Projectiles.fire(g, { x: 0.5, y: -20, vx: 0, vy: 60, damage: 20 }); run(0.15); shots++; }
      out.shots = shots; out.midSpan = span(mid);
      // the piece that broke off falls to the floor
      run(2.5);
      const rubble = g.entities.filter((e) => e.kind === 'rubble' && !e.removed);
      out.rubbleY = rubble.length ? Math.min(...rubble.map((e) => e.body.y)) : -99;
      // a grenade blows a gap in the left catwalk and the trooper standing there falls through
      const left = g.structures[0];
      const t = g.spawn('stormtrooper', -34, -9.5, { silent: true, noUnstick: true, aiMode: 'off' }); run(1.5);
      out.stood = t.parts.torso.y < -8;
      GP.Damage.explode(g, -34, -7.7, { radius: 3, damage: 150, power: 5 }); run(2);
      out.fell = t.parts.torso.y > -4;
      // the floor itself does not break
      const floor = terrain();
      GP.Damage.explode(g, 0, -0.1, { radius: 5, damage: 400, power: 5 }); run(0.5);
      out.floorKept = terrain() === floor;
      // saving and loading keep the damage
      const before = span(left);
      GP.SaveSystem.load(g, JSON.parse(JSON.stringify(GP.SaveSystem.serialize(g))));
      out.saved = span(window.GAME.structures[0]) === before && before.split(' ').length > 1;
      return out;
    })()`);
    check('maps mark their structures', r.count >= 5, r.count + ' in the hangar');
    check('blaster bolts carve a hole in a catwalk', r.shots < 15, r.shots + ' shots: ' + r.midSpan);
    check('the broken piece falls to the floor', r.rubbleY > -2, 'y ' + r.rubbleY.toFixed(2));
    check('a grenade opens a gap that people fall through', r.stood && r.fell);
    check('the ground itself stays whole', r.floorKept);
    check('saves keep broken structures', r.saved);
    check('no page errors', !errors.length, errors.slice(0, 3).join(' | ') || null);
    await ctx.close();
  },

  // lightsabers spawn switched off, whether spawned on their own or in someone's hands
  async sabers() {
    const { ctx, page, errors } = await openGame();
    const r = await page.evaluate(`(() => {
      const g = ${EMPTY()};
      const loose = g.tools.spawnAt('saber_blue', 0, -1, 0, 1);
      const armed = GP.Settings.play.spawnArmed;
      GP.Settings.play.spawnArmed = true;
      const people = ['luke', 'anakin', 'palpatine'].map((id, i) => g.tools.spawnAt(id, 3 + i * 2, -1, 0, 1)).filter(Boolean);
      GP.Settings.play.spawnArmed = armed;
      for (let i = 0; i < 30; i++) g.tick(1 / 60);
      const held = []; for (const c of people) c.forEachSaber((s) => held.push(s.active));
      const off = !loose.active && loose.segs.length === 0;
      loose.use();
      for (let i = 0; i < 30; i++) g.tick(1 / 60);
      return { off, held, lit: loose.active && loose.segs.length > 0 };
    })()`);
    check('a spawned lightsaber is switched off', r.off);
    check("sabers in spawned people's hands are switched off", r.held.length === 3 && r.held.every((a) => a === false), r.held.length + ' sabers');
    check('activating it ignites the blade', r.lit);
    check('no page errors', !errors.length, errors.slice(0, 3).join(' | ') || null);
    await ctx.close();
  },

  // water freezes in the cold into ice you can stand on, cryo blasts freeze it at once, and it melts
  // again in the warm
  async ice() {
    const { ctx, page, errors } = await openGame();
    const r = await page.evaluate(`(() => {
      const F = GP.Fluid, H = GP.Maps.helpers, S = GP.Maps.styles;
      const run = (g, s) => { for (let i = 0; i < s * 60; i++) g.tick(1 / 60); };
      const kinds = () => { const c = { water: 0, ice: 0 }; for (let i = 0; i < F.count(); i++) { const t = F.particle(i).type; c[t] = (c[t] || 0) + 1; } return c; };
      const pool = (g) => {
        // a 3 m wide open box on the ground, filled with 1 m of water
        const y0 = g.world.raycast(0, -3, 0, 30, (s) => s.body.type === GP.Phys.STATIC && !s.sensor).y;
        H.rect(g, -1.7, y0 - 2, -1.5, y0, S.metal); H.rect(g, 1.5, y0 - 2, 1.7, y0, S.metal);
        g.world.staticDirty = true;
        const sp = F.spacing(); let row = 0;
        for (let y = y0 - sp * 0.5; y > y0 - 1; y -= sp * 0.87, row++) for (let x = -1.45 + (row % 2 ? sp * 0.5 : sp * 0.25); x < 1.45; x += sp) F.add(0, x, y);
        return y0;
      };
      const out = {};
      // the frozen planet is well below freezing
      let g = ${EMPTY('frozen')};
      const y0 = pool(g);
      run(g, 30);
      const k = kinds(); out.frozen = k.ice / (k.ice + k.water);
      // the top of the ice around x (the highest ice drop within 0.3 m)
      const iceTop = (x) => { let top = Infinity; for (let i = 0; i < F.count(); i++) { const p = F.particle(i); if (p.type === 'ice' && Math.abs(p.x - x) < 0.3) top = Math.min(top, p.y); } return top; };
      const crate = g.spawn('crate_small', -0.7, y0 - 3, { silent: true, noUnstick: true });
      const man = g.spawn('stormtrooper', 0.6, y0 - 3.2, { silent: true, noUnstick: true, aiMode: 'off' });
      run(g, 3);
      out.crateGap = iceTop(crate.body.x) - crate.body.shapes[0].maxY;
      out.standing = man.parts.torso.y < iceTop(man.parts.torso.x) - 0.5;
      // warm it up: it melts
      g.map.ambientTemp = 25;
      run(g, 40);
      const w = kinds(); out.melted = w.water / (w.ice + w.water);
      // a cryo grenade freezes water at room temperature in an instant
      g = ${EMPTY()};
      const y1 = pool(g); run(g, 2);
      GP.Damage.explode(g, 0, y1 - 0.5, { radius: 4, damage: 0, power: 5, kind: 'cryo' });
      run(g, 0.2);
      const c = kinds(); out.cryo = c.ice / (c.ice + c.water);
      return out;
    })()`);
    check('water freezes on a frozen planet', r.frozen > 0.9, (r.frozen * 100).toFixed(0) + '% ice');
    check('a crate rests on top of the ice', Math.abs(r.crateGap) < 0.25, 'gap ' + r.crateGap.toFixed(2) + ' m');
    check('a person stands on the ice', r.standing);
    check('warm air melts it', r.melted > 0.6, (r.melted * 100).toFixed(0) + '% water');
    check('a cryo blast freezes water at once', r.cryo > 0.9, (r.cryo * 100).toFixed(0) + '% ice');
    check('no page errors', !errors.length, errors.slice(0, 3).join(' | ') || null);
    await ctx.close();
  },
};

/* ------------------------------------------------------------------ run */
const wanted = process.argv.slice(2);
const names = wanted.length ? wanted : Object.keys(SUITES);
const t0 = Date.now();
for (const name of names) {
  const suite = SUITES[name];
  if (!suite) { console.log('Unknown suite: ' + name); failures++; continue; }
  console.log('\n' + name);
  const t = Date.now();
  try { await suite(); } catch (e) { check(name + ' ran to the end', false, e.message.split('\n')[0]); }
  console.log('  ' + ((Date.now() - t) / 1000).toFixed(1) + 's');
}
await browser.close();
server.close();
console.log('\n' + passes + ' passed, ' + failures + ' failed in ' + ((Date.now() - t0) / 1000).toFixed(0) + 's');
process.exit(failures ? 1 : 0);
