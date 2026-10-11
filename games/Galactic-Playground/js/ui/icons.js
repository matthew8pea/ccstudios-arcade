/* GALACTIC PLAYGROUND — spawn-menu thumbnails and spawn holograms.
 * Each thumbnail is rendered by building the real entity in a throwaway physics world and
 * drawing it with its normal renderer, so icons always match the content definitions.
 * Characters are shown the way they spawn: empty-handed unless 'Spawn characters armed' is on.
 * Thumbnails are drawn at several times their display size and scaled down smoothly; the
 * hologram image is drawn at a high, fixed resolution so it stays sharp when zoomed in.
 */
'use strict';

GP.Icons = (() => {
  const cache = new Map();
  const W = 132, H = 92;
  const SS = 3;              // thumbnail supersampling (on top of the screen's pixel ratio)
  const HOLO_PPM = 150;      // hologram pixels per meter (lowered for very big things)
  const armed = () => !!GP.Settings.play.spawnArmed;
  const ARMED = '#armed';    // cache-key suffix for pictures of people holding their weapons

  function fakeGame() {
    const g = {
      world: new GP.Phys.World(), entities: [], time: 0, camera: null, map: null, debrisCount: 0, isIconWorld: true,
      nextGroup() { return -(++this._g || (this._g = 1)); },
      canSpawnBodies() { return true; }, canSpawnDebris() { return false; },
      addEntity(e) { this.entities.push(e); },
      removeEntity(e) { e.destroy(); },
      spawn(id, x, y, opts) { const e = GP.Registry.create(this, id, opts || {}); e.build(x, y, opts || {}); this.addEntity(e); return e; },
      tools: null,
    };
    g.world.gravityY = 0;
    return g;
  }

  function render(def, withArms) {
    const g = fakeGame();
    let e;
    if (def.kind === 'contraption') {
      const list = GP.Contraptions.place(g, def, 0, 0, 1);
      e = list[0];
      if (!e) throw new Error('empty contraption');
    } else {
      const opts = { aiMode: 'off', facing: 1 };
      if (def.kind === 'character' && !withArms) opts.noLoadout = true;
      e = GP.Registry.create(g, def, opts);
      e.build(0, 0, opts);
      g.addEntity(e);
    }
    for (const x of g.entities) {
      if (x.isSaber) { x.active = true; x.ext = 1; x.updateBladeShapes(true); x.update(0); }
      if (x.def.kind === 'character' && x.cape) for (let i = 0; i < 40; i++) x.updateCape(1 / 60);
    }
    // bounds of everything
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const framed = def.kind === 'character' ? [e] : g.entities;
    for (const x of framed) {
      for (const b of x.bodies) for (const s of b.shapes) {
        if (!s.enabled || s.sensor && s.tag !== 'shield') continue;
        minX = Math.min(minX, s.minX); minY = Math.min(minY, s.minY); maxX = Math.max(maxX, s.maxX); maxY = Math.max(maxY, s.maxY);
      }
      if (x.isSaber) for (const sg of x.segs) { minX = Math.min(minX, sg.x1, sg.x2); maxX = Math.max(maxX, sg.x1, sg.x2); minY = Math.min(minY, sg.y1, sg.y2); maxY = Math.max(maxY, sg.y1, sg.y2); }
    }
    if (def.kind === 'vehicle' && e.legs && e.legs.length) for (const L of e.legs) { maxY = Math.max(maxY, L.fy); }
    if (!isFinite(minX)) { minX = -0.5; maxX = 0.5; minY = -0.5; maxY = 0.5; }
    // tight bounds, used for the hologram (so it lines up with what spawns)
    const pad = 0.04;
    minX -= pad; minY -= pad; maxX += pad; maxY += pad;
    const bw = maxX - minX, bh = maxY - minY;
    const grounded = def.kind === 'character' || def.kind === 'bot' || def.kind === 'droideka' || def.kind === 'vehicle' && def.controller !== 'flyer';
    // menu thumbnail, supersampled
    const q = Math.max(2, window.devicePixelRatio || 1) * SS;
    const c = document.createElement('canvas');
    c.width = Math.round(W * q); c.height = Math.round(H * q);
    const ctx = c.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    // a soft spotlight behind it
    const spot = ctx.createRadialGradient(c.width / 2, c.height * 0.42, 0, c.width / 2, c.height * 0.42, c.width * 0.55);
    spot.addColorStop(0, 'rgba(110,190,255,0.16)'); spot.addColorStop(1, 'rgba(110,190,255,0)');
    ctx.fillStyle = spot; ctx.fillRect(0, 0, c.width, c.height);
    let k, ox, oy;
    const portrait = def.kind === 'character' && e.parts && e.parts.head;
    if (portrait) {
      // people: a closer three-quarter shot, head to mid-thigh (knees for droids, and when armed to
      // show the weapon), so faces and outfits read clearly
      const fy0 = minY, fy1 = minY + bh * (e.mech || armed() ? 0.74 : 0.6), fh = fy1 - fy0;
      k = c.height / (fh * 1.12);
      ox = c.width / 2 - ((minX + maxX) / 2) * k;
      oy = c.height * 0.08 - fy0 * k;
    } else {
      const m = 0.1 * Math.max(bw, bh);   // margin around the object
      const tw = bw + m * 2, th = bh + m * 2 + (grounded ? m : 0);
      k = Math.min(c.width / tw, c.height / th);
      ox = (c.width - bw * k) / 2 - minX * k; oy = (c.height - th * k) / 2 + m * k - minY * k;
    }
    if (grounded && !portrait) {
      const m = 0.1 * Math.max(bw, bh);
      // contact shadow on the ground
      const cx = ((minX + maxX) / 2) * k + ox, cy = maxY * k + oy, rx = bw * k * 0.55, ry = Math.max(3, m * k * 0.35);
      ctx.save(); ctx.translate(cx, cy); ctx.scale(1, ry / rx);
      const sh = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
      sh.addColorStop(0, 'rgba(0,0,0,0.55)'); sh.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = sh; ctx.beginPath(); ctx.arc(0, 0, rx, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    ctx.setTransform(k, 0, 0, k, ox, oy);
    drawAll(ctx, g);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (portrait) {
      // fade out toward the bottom edge
      ctx.globalCompositeOperation = 'destination-out';
      const fade = ctx.createLinearGradient(0, c.height * 0.7, 0, c.height);
      fade.addColorStop(0, 'rgba(0,0,0,0)'); fade.addColorStop(1, 'rgba(0,0,0,1)');
      ctx.fillStyle = fade; ctx.fillRect(0, c.height * 0.7, c.width, c.height * 0.3);
      ctx.globalCompositeOperation = 'source-over';
    }
    // world-scale hologram image, sharp at close zoom
    const ppm = Math.max(24, Math.min(HOLO_PPM, 2400 / Math.max(bw, bh)));
    const gc = document.createElement('canvas');
    gc.width = Math.max(2, Math.ceil(bw * ppm)); gc.height = Math.max(2, Math.ceil(bh * ppm));
    const gx = gc.getContext('2d');
    gx.setTransform(ppm, 0, 0, ppm, -minX * ppm, -minY * ppm);
    drawAll(gx, g);
    for (const x of g.entities) { try { x.destroy(); } catch (err) { /* ignore */ } }
    // bw / bh: size in meters; ax / ay: the spawn point (0,0) from the image's top-left, in meters
    return { thumb: c, canvas: gc, ppm, bw, bh, ax: -minX, ay: -minY };
  }

  function drawAll(ctx, g) {
    const order = g.entities.slice().sort((a, b) => a.layer - b.layer);
    for (const x of order) { try { x.draw(ctx, 0); } catch (err) { /* keep going */ } }
    for (const x of order) { try { if (x.drawGlow) x.drawGlow(ctx); } catch (err) { /* ignore */ } }
    GP.FX.clearFrameLights();
  }

  return {
    // armedPick: show a person holding their weapons even when 'Spawn characters armed' is off
    get(id, armedPick) {
      const def = GP.Registry.get(id);
      if (!def) return null;
      const withArms = def.kind === 'character' && (!!armedPick || armed());
      const key = withArms ? id + ARMED : id;
      if (cache.has(key)) return cache.get(key);
      let r;
      try { r = render(def, withArms); } catch (e) { console.warn('icon failed', id, e); r = { thumb: null, canvas: document.createElement('canvas'), bw: 0 }; }
      cache.set(key, r);
      return r;
    },
    // forget cached pictures (all, or those matching a test)
    clear(test) { for (const key of [...cache.keys()]) if (!test || test(GP.Registry.get(key.replace(ARMED, '')))) cache.delete(key); },
    armedShown: armed,
    thumb(id) { const r = this.get(id); return r ? r.thumb : null; },
    W, H,
  };
})();
