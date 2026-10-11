/* GALACTIC PLAYGROUND — parametric humanoid painter.
 * Every body section is drawn in its own local frame (meters, origin at the section center,
 * +y pointing along the limb toward its end, +x = the facing direction after mirroring).
 * A character "look" config selects head styles, torso styles, colors and accessories.
 */
'use strict';

GP.Painter = (() => {
  const M = GP.M, D = GP.Draw, OL = D.OUTLINE;
  const LW = 0.022;

  function rr(ctx, x, y, w, h, r, fill, stroke = true) {
    D.roundRect(ctx, x - w / 2, y - h / 2, w, h, r);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke === true ? OL : stroke; ctx.lineWidth = LW; ctx.stroke(); }
  }
  function circ(ctx, x, y, r, fill, stroke = true) {
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke === true ? OL : stroke; ctx.lineWidth = LW; ctx.stroke(); }
  }
  function poly(ctx, pts, fill, stroke = true, lw = LW) {
    ctx.beginPath(); ctx.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke === true ? OL : stroke; ctx.lineWidth = lw; ctx.stroke(); }
  }
  function line(ctx, pts, color, lw = LW) {
    ctx.beginPath(); ctx.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
    ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.lineCap = 'round'; ctx.stroke();
  }
  function eye(ctx, x, y, r, color = '#15171c') { circ(ctx, x, y, r, color, false); }

  /* ---------------- HEADS ---------------- */
  const heads = {
    human(ctx, L, r, ex) {
      const skin = L.skin || '#e8b894';
      // back hair
      if (L.hair && (L.hair.style === 'long' || L.hair.style === 'buns' || L.hair.style === 'braid')) {
        rr(ctx, -r * 0.35, r * 0.3, r * 1.1, r * 1.6, r * 0.5, L.hair.color);
      }
      circ(ctx, 0, 0, r, skin);
      // ear
      circ(ctx, -r * 0.15, r * 0.05, r * 0.2, M.shade(skin, -0.12));
      // eye & brow
      face(ctx, L, r, ex, skin);
      // nose/mouth
      line(ctx, [r * 0.95, 0, r * 1.06, r * 0.18, r * 0.92, r * 0.22], M.shade(skin, -0.25), r * 0.06);
      mouth(ctx, r, ex, skin);
      if (L.marks) marks(ctx, L.marks, r);
      if (L.beard) {
        ctx.beginPath(); ctx.moveTo(r * 0.1, r * 0.2); ctx.quadraticCurveTo(r * 0.3, r * 1.2, r * 0.95, r * 0.55);
        ctx.lineTo(r * 0.98, r * 0.35); ctx.quadraticCurveTo(r * 0.6, r * 0.62, r * 0.25, r * 0.15); ctx.closePath();
        ctx.fillStyle = L.beard; ctx.fill(); ctx.strokeStyle = OL; ctx.lineWidth = LW; ctx.stroke();
      }
      hair(ctx, L.hair, r);
    },
    yoda(ctx, L, r, ex) {
      const skin = L.skin || '#8faa62';
      // ears
      poly(ctx, [-r * 0.1, -r * 0.2, -r * 1.9, -r * 0.55, -r * 0.2, r * 0.35], skin);
      poly(ctx, [-r * 0.2, -r * 0.1, -r * 1.5, -r * 0.4, -r * 0.3, r * 0.2], M.shade(skin, 0.2), false);
      circ(ctx, 0, 0, r, skin);
      line(ctx, [-r * 0.5, -r * 0.6, 0, -r * 0.75, r * 0.4, -r * 0.6], M.shade(skin, -0.2), r * 0.05);
      circ(ctx, r * 0.55, -r * 0.05, r * 0.18, '#f2e8c8');
      eye(ctx, r * 0.62, -r * 0.05, r * 0.1, '#2a1c10');
      line(ctx, [r * 0.3, -r * 0.3, r * 0.8, -r * 0.3], M.shade(skin, -0.3), r * 0.06);
      line(ctx, [r * 0.55, r * 0.5, r * 0.85, r * 0.42], M.shade(skin, -0.4), r * 0.06);
      // white wisps
      line(ctx, [-r * 0.3, -r * 0.9, -r * 0.8, -r * 1.2], '#e8e8e0', r * 0.05);
      line(ctx, [-r * 0.1, -r * 0.95, -r * 0.4, -r * 1.3], '#e8e8e0', r * 0.05);
    },
    togruta(ctx, L, r, ex) {
      const skin = L.skin || '#e0702e';
      // lekku (head tails)
      poly(ctx, [-r * 0.6, 0, -r * 0.1, r * 0.3, -r * 0.5, r * 2.3, -r * 0.9, r * 2.1], '#e8eef8');
      line(ctx, [-r * 0.45, r * 0.6, -r * 0.62, r * 1.0, -r * 0.55, r * 1.4, -r * 0.7, r * 1.8], '#3a5a9a', r * 0.14);
      circ(ctx, 0, 0, r, skin);
      // facial markings
      poly(ctx, [r * 0.3, -r * 0.45, r * 0.95, -r * 0.35, r * 0.75, -r * 0.1, r * 0.35, -r * 0.2], '#f6f3ee', false);
      poly(ctx, [r * 0.55, r * 0.3, r * 0.95, r * 0.25, r * 0.85, r * 0.6], '#f6f3ee', false);
      eye(ctx, r * 0.58, -r * 0.05, r * 0.1, '#1c2a3a');
      // montrals
      poly(ctx, [-r * 0.2, -r * 0.8, r * 0.3, -r * 1.9, r * 0.55, -r * 0.7], '#f4f6fa');
      line(ctx, [r * 0.12, -r * 1.05, r * 0.4, -r * 1.2], '#3a5a9a', r * 0.14);
      line(ctx, [r * 0.18, -r * 1.45, r * 0.34, -r * 1.55], '#3a5a9a', r * 0.12);
    },
    zabrak(ctx, L, r, ex) {
      heads.human(ctx, Object.assign({}, L, { hair: null, beard: null }), r, ex);
      const hc = L.hornColor || '#e8dcc0';
      for (const [hx, hy, s] of [[-r * 0.5, -r * 0.8, 0.9], [-r * 0.05, -r * 0.98, 1], [r * 0.4, -r * 0.85, 0.85], [-r * 0.8, -r * 0.4, 0.7], [r * 0.7, -r * 0.55, 0.6]]) {
        poly(ctx, [hx - r * 0.1 * s, hy + r * 0.1, hx, hy - r * 0.35 * s, hx + r * 0.1 * s, hy + r * 0.1], hc, true, 0.015);
      }
    },
    twilek(ctx, L, r, ex) {
      const skin = L.skin || '#5aa0c8';
      poly(ctx, [-r * 0.5, -r * 0.1, 0, r * 0.3, -r * 0.4, r * 2.4, -r * 0.8, r * 2.2], M.shade(skin, -0.08));
      heads.human(ctx, Object.assign({}, L, { hair: null, skin }), r, ex);
    },
    wookiee(ctx, L, r, ex) {
      const fur = L.skin || '#6a4a2c';
      circ(ctx, 0, 0, r * 1.05, fur);
      for (let i = 0; i < 7; i++) { const a = -2.6 + i * 0.5; line(ctx, [Math.cos(a) * r * 0.8, Math.sin(a) * r * 0.8, Math.cos(a) * r * 1.2, Math.sin(a) * r * 1.2], M.shade(fur, -0.25), r * 0.1); }
      poly(ctx, [r * 0.4, -r * 0.1, r * 1.15, r * 0.05, r * 1.05, r * 0.5, r * 0.4, r * 0.5], M.shade(fur, 0.12));
      eye(ctx, r * 0.55, -r * 0.2, r * 0.1, '#1a0f08');
      circ(ctx, r * 1.05, r * 0.12, r * 0.1, '#1a0f08', false);
    },
    rodian(ctx, L, r, ex) {
      const skin = L.skin || '#5c9a4a';
      circ(ctx, 0, 0, r, skin);
      poly(ctx, [r * 0.5, r * 0.2, r * 1.3, r * 0.35, r * 1.25, r * 0.55, r * 0.5, r * 0.6], M.shade(skin, -0.05));
      circ(ctx, r * 0.5, -r * 0.15, r * 0.35, '#0e1014');
      circ(ctx, r * 0.6, -r * 0.25, r * 0.08, '#6a7a8a', false);
      line(ctx, [-r * 0.2, -r * 0.9, -r * 0.1, -r * 1.35], skin, r * 0.12);
      line(ctx, [r * 0.15, -r * 0.9, r * 0.35, -r * 1.3], skin, r * 0.12);
    },
    gamorrean(ctx, L, r, ex) {
      const skin = L.skin || '#7a9a4a';
      circ(ctx, 0, 0, r * 1.1, skin);
      rr(ctx, r * 0.9, r * 0.2, r * 0.6, r * 0.5, r * 0.2, M.shade(skin, 0.1));
      circ(ctx, r * 1.12, r * 0.18, r * 0.06, '#1a1a10', false);
      line(ctx, [r * 0.7, r * 0.55, r * 0.8, r * 0.2], '#f0e8d0', r * 0.1);
      eye(ctx, r * 0.5, -r * 0.3, r * 0.08, '#1a1010');
      poly(ctx, [-r * 0.2, -r * 0.9, -r * 0.5, -r * 1.3, r * 0.1, -r * 1.0], M.shade(skin, -0.1));
      rr(ctx, -r * 0.1, -r * 0.6, r * 1.4, r * 0.4, r * 0.1, '#5a4a3a');
    },
    tusken(ctx, L, r, ex) {
      circ(ctx, 0, 0, r * 1.05, '#c8b490');
      for (let i = -3; i <= 3; i++) line(ctx, [-r, i * r * 0.28, r, i * r * 0.28 + r * 0.1], '#a8946e', r * 0.06);
      circ(ctx, r * 0.55, -r * 0.2, r * 0.22, '#2a2a2a');
      circ(ctx, r * 0.55, -r * 0.2, r * 0.12, '#556070', false);
      rr(ctx, r * 0.75, r * 0.45, r * 0.3, r * 0.5, r * 0.08, '#6a6a6a');
      line(ctx, [r * 0.7, r * 0.6, r * 0.3, r * 1.0], '#6a6a6a', r * 0.12);
    },
    jawa(ctx, L, r, ex) {
      poly(ctx, [-r * 1.0, r * 0.9, -r * 0.9, -r * 0.4, 0, -r * 1.4, r * 0.9, -r * 0.4, r * 1.1, r * 0.9], '#6a4a2a');
      circ(ctx, r * 0.35, 0, r * 0.62, '#120c08', false);
      D.glow(ctx, r * 0.45, -r * 0.08, r * 0.45, '#ffd040', 0.9);
      D.glow(ctx, r * 0.15, -r * 0.08, r * 0.35, '#ffd040', 0.7);
      circ(ctx, r * 0.45, -r * 0.08, r * 0.09, '#fff2a0', false);
      circ(ctx, r * 0.15, -r * 0.08, r * 0.07, '#fff2a0', false);
    },
    ewok(ctx, L, r, ex) {
      const fur = L.skin || '#7a5a3a';
      circ(ctx, 0, 0, r * 1.05, fur);
      poly(ctx, [-r * 1.1, r * 0.4, -r * 0.8, -r * 0.9, r * 0.2, -r * 1.2, r * 0.6, -r * 0.6, 0, -r * 0.2, -r * 0.6, r * 0.6], L.hood || '#b0885a');
      circ(ctx, -r * 0.5, -r * 1.0, r * 0.28, L.hood || '#b0885a');
      eye(ctx, r * 0.55, -r * 0.05, r * 0.14, '#0a0806');
      circ(ctx, r * 1.0, r * 0.25, r * 0.12, '#1a120c', false);
    },
    trandoshan(ctx, L, r, ex) {
      const skin = L.skin || '#7a8a4a';
      circ(ctx, 0, 0, r, skin);
      poly(ctx, [r * 0.4, -r * 0.1, r * 1.3, r * 0.2, r * 1.1, r * 0.6, r * 0.3, r * 0.6], M.shade(skin, 0.05));
      circ(ctx, r * 0.6, -r * 0.25, r * 0.16, '#e0a020');
      eye(ctx, r * 0.62, -r * 0.25, r * 0.06, '#101010');
      for (let i = 0; i < 4; i++) circ(ctx, -r * 0.4 + i * r * 0.2, -r * 0.4 + (i % 2) * r * 0.3, r * 0.08, M.shade(skin, -0.2), false);
    },
    moncal(ctx, L, r, ex) {
      const skin = L.skin || '#c86a4a';
      D.roundRect(ctx, -r, -r * 1.4, r * 2, r * 2.3, r * 0.9);
      ctx.fillStyle = skin; ctx.fill(); ctx.strokeStyle = OL; ctx.lineWidth = LW; ctx.stroke();
      circ(ctx, r * 0.7, -r * 0.6, r * 0.32, '#ffd080');
      eye(ctx, r * 0.8, -r * 0.6, r * 0.15, '#2a1a10');
      line(ctx, [r * 0.3, r * 0.5, r * 0.9, r * 0.4], M.shade(skin, -0.3), r * 0.08);
    },
    gungan(ctx, L, r, ex) {
      const skin = L.skin || '#c89a6a';
      poly(ctx, [-r * 0.4, -r * 0.2, -r * 0.1, r * 0.2, -r * 0.7, r * 2.2, -r * 1.0, r * 1.9], M.shade(skin, -0.1));
      circ(ctx, 0, 0, r, skin);
      poly(ctx, [r * 0.5, r * 0.1, r * 1.5, r * 0.3, r * 1.3, r * 0.7, r * 0.4, r * 0.6], skin);
      circ(ctx, r * 0.2, -r * 0.9, r * 0.25, skin);
      eye(ctx, r * 0.22, -r * 0.95, r * 0.1, '#2a2010');
    },
    bith(ctx, L, r, ex) {
      const skin = L.skin || '#e8c8a8';
      circ(ctx, -r * 0.1, -r * 0.3, r * 1.2, skin);
      circ(ctx, r * 0.55, -r * 0.1, r * 0.2, '#101010', false);
      line(ctx, [r * 0.7, r * 0.5, r * 0.9, r * 0.7], M.shade(skin, -0.3), r * 0.08);
    },
    // ---- helmets ----
    trooper(ctx, L, r, ex) {
      const c = L.helmet || '#eef0f2';
      D.roundRect(ctx, -r * 1.05, -r * 1.1, r * 2.1, r * 2.05, r * 0.85);
      ctx.fillStyle = c; ctx.fill(); ctx.strokeStyle = OL; ctx.lineWidth = LW; ctx.stroke();
      poly(ctx, [r * 0.2, -r * 0.3, r * 1.02, -r * 0.35, r * 1.0, r * 0.05, r * 0.35, 0], '#15171c', false);
      poly(ctx, [r * 0.5, r * 0.35, r * 1.02, r * 0.3, r * 0.95, r * 0.75, r * 0.55, r * 0.72], M.shade(c, -0.25), true);
      line(ctx, [r * 0.62, r * 0.45, r * 0.62, r * 0.65], '#15171c', r * 0.05);
      line(ctx, [r * 0.8, r * 0.43, r * 0.8, r * 0.63], '#15171c', r * 0.05);
      line(ctx, [-r * 0.9, -r * 0.2, r * 0.1, -r * 0.55], L.helmetStripe || M.shade(c, -0.15), r * 0.08);
      circ(ctx, -r * 0.15, r * 0.25, r * 0.2, M.shade(c, -0.1));
    },
    clone(ctx, L, r, ex) {
      const c = L.helmet || '#f0f0ec';
      D.roundRect(ctx, -r * 1.05, -r * 1.12, r * 2.1, r * 2.1, r * 0.9);
      ctx.fillStyle = c; ctx.fill(); ctx.strokeStyle = OL; ctx.lineWidth = LW; ctx.stroke();
      if (L.mark) {
        ctx.save(); D.roundRect(ctx, -r * 1.05, -r * 1.12, r * 2.1, r * 2.1, r * 0.9); ctx.clip();
        ctx.fillStyle = L.mark; ctx.fillRect(-r * 1.1, -r * 1.2, r * 2.2, r * 0.45); ctx.fillRect(-r * 0.2, -r * 1.2, r * 0.35, r * 1.2);
        ctx.restore();
      }
      // T visor
      poly(ctx, [r * 0.25, -r * 0.35, r * 1.05, -r * 0.35, r * 1.05, -r * 0.12, r * 0.85, -r * 0.12, r * 0.85, r * 0.55, r * 0.65, r * 0.55, r * 0.65, -r * 0.12, r * 0.25, -r * 0.12], '#101216', false);
      rr(ctx, r * 0.6, r * 0.78, r * 0.6, r * 0.2, r * 0.05, M.shade(c, -0.2));
      if (L.antenna) line(ctx, [-r * 0.6, -r * 0.6, -r * 0.8, -r * 1.6], '#303030', r * 0.06);
    },
    vader(ctx, L, r, ex) {
      const c = '#101114';
      poly(ctx, [-r * 1.25, r * 0.95, -r * 1.05, -r * 0.6, -r * 0.3, -r * 1.15, r * 0.6, -r * 1.05, r * 1.1, -r * 0.4, r * 1.2, r * 0.95], c);
      line(ctx, [-r * 0.4, -r * 0.95, r * 0.5, -r * 0.9], '#3a3e48', r * 0.07);
      // face mask
      poly(ctx, [r * 0.35, -r * 0.45, r * 1.12, -r * 0.4, r * 1.05, r * 0.8, r * 0.55, r * 0.95, r * 0.35, r * 0.3], '#1c1e24', true);
      poly(ctx, [r * 0.55, -r * 0.35, r * 1.05, -r * 0.35, r * 1.0, r * 0.02, r * 0.6, 0], '#08090c', false);
      D.glow(ctx, r * 0.85, -r * 0.18, r * 0.35, '#aa2222', 0.25);
      poly(ctx, [r * 0.72, r * 0.25, r * 0.98, r * 0.25, r * 1.02, r * 0.8, r * 0.62, r * 0.85], '#2a2c32', true);
      for (let i = 0; i < 3; i++) line(ctx, [r * (0.7 + i * 0.1), r * 0.4, r * (0.7 + i * 0.1), r * 0.75], '#7a808a', r * 0.03);
    },
    mando(ctx, L, r, ex) {
      const c = L.helmet || '#5a7a4a';
      D.roundRect(ctx, -r * 1.02, -r * 1.1, r * 2.04, r * 2.05, r * 0.8);
      ctx.fillStyle = c; ctx.fill(); ctx.strokeStyle = OL; ctx.lineWidth = LW; ctx.stroke();
      ctx.save(); D.roundRect(ctx, -r * 1.02, -r * 1.1, r * 2.04, r * 2.05, r * 0.8); ctx.clip();
      ctx.fillStyle = M.shade(c, -0.25);
      for (let i = 0; i < 5; i++) ctx.fillRect(-r * 0.9 + i * r * 0.37, -r * 1.0 + (i % 3) * r * 0.5, r * 0.12, r * 0.12);
      ctx.restore();
      poly(ctx, [r * 0.2, -r * 0.35, r * 1.02, -r * 0.35, r * 1.02, -r * 0.12, r * 0.84, -r * 0.12, r * 0.84, r * 0.62, r * 0.62, r * 0.62, r * 0.62, -r * 0.12, r * 0.2, -r * 0.12], '#0c0e10', false);
      if (L.visorStripe) line(ctx, [-r * 0.1, -r * 0.24, r * 0.15, -r * 0.24], L.visorStripe, r * 0.1);
      line(ctx, [-r * 0.1, -r * 0.6, -r * 0.2, -r * 1.65], '#2a2a2a', r * 0.06);
      rr(ctx, -r * 0.15, -r * 1.65, r * 0.2, r * 0.1, r * 0.03, '#c83030');
    },
    scout(ctx, L, r, ex) {
      const c = '#eef0f2';
      circ(ctx, 0, -r * 0.1, r * 1.02, c);
      rr(ctx, r * 0.55, -r * 0.2, r * 1.0, r * 0.35, r * 0.1, '#15171c');
      poly(ctx, [r * 0.3, r * 0.4, r * 1.2, r * 0.35, r * 1.3, r * 0.8, r * 0.4, r * 0.85], '#d8dadd');
      line(ctx, [r * 0.5, r * 0.55, r * 1.2, r * 0.55], '#15171c', r * 0.05);
    },
    pilot(ctx, L, r, ex) {
      const c = L.helmet || '#141518';
      D.roundRect(ctx, -r * 1.1, -r * 1.15, r * 2.2, r * 2.15, r * 0.95);
      ctx.fillStyle = c; ctx.fill(); ctx.strokeStyle = OL; ctx.lineWidth = LW; ctx.stroke();
      circ(ctx, r * 0.72, -r * 0.15, r * 0.3, '#060608');
      D.glow(ctx, r * 0.72, -r * 0.2, r * 0.2, '#6a7aa0', 0.3);
      rr(ctx, r * 0.75, r * 0.5, r * 0.5, r * 0.35, r * 0.1, '#2a2c30');
      line(ctx, [r * 0.6, r * 0.7, -r * 0.2, r * 1.3], '#2a2c30', r * 0.12);
      if (L.insignia) circ(ctx, -r * 0.4, -r * 0.5, r * 0.18, L.insignia);
    },
    rebel(ctx, L, r, ex) {
      heads.human(ctx, Object.assign({}, L, { hair: null }), r, ex);
      ctx.beginPath(); ctx.arc(0, -r * 0.1, r * 1.08, Math.PI * 1.05, Math.PI * 1.95); ctx.closePath();
      ctx.fillStyle = L.helmet || '#e8e4dc'; ctx.fill(); ctx.strokeStyle = OL; ctx.lineWidth = LW; ctx.stroke();
      line(ctx, [-r * 1.0, -r * 0.2, r * 1.0, -r * 0.2], M.shade(L.helmet || '#e8e4dc', -0.25), r * 0.1);
    },
    officer(ctx, L, r, ex) {
      heads.human(ctx, Object.assign({}, L, { hair: { style: 'short', color: L.hair ? L.hair.color : '#4a3a2a' } }), r, ex);
      poly(ctx, [-r * 1.05, -r * 0.45, -r * 0.8, -r * 1.05, r * 0.7, -r * 1.05, r * 1.35, -r * 0.55, r * 0.9, -r * 0.45], L.helmet || '#6a6e62');
      line(ctx, [r * 0.3, -r * 0.5, r * 1.3, -r * 0.55], '#1a1a1a', r * 0.08);
    },
    royal(ctx, L, r, ex) {
      poly(ctx, [-r * 1.2, r * 1.3, -r * 1.0, -r * 0.7, 0, -r * 1.35, r * 0.9, -r * 0.8, r * 1.15, r * 1.3], '#a01818');
      poly(ctx, [r * 0.45, -r * 0.5, r * 1.02, -r * 0.45, r * 1.0, r * 0.2, r * 0.5, r * 0.2], '#0c0404', false);
    },
    death(ctx, L, r, ex) {
      heads.trooper(ctx, Object.assign({}, L, { helmet: '#1a1b1e', helmetStripe: '#2a2b30' }), r);
      D.glow(ctx, r * 0.7, -r * 0.17, r * 0.3, '#40ff80', 0.35);
    },
    snow(ctx, L, r, ex) {
      const c = '#e8ecf0';
      poly(ctx, [-r * 1.3, r * 1.2, -r * 1.1, -r * 0.8, 0, -r * 1.2, r * 0.9, -r * 0.8, r * 1.1, r * 0.2, r * 0.9, r * 1.2], M.shade(c, -0.08));
      rr(ctx, r * 0.35, 0, r * 1.2, r * 1.3, r * 0.3, c);
      rr(ctx, r * 0.7, -r * 0.25, r * 0.7, r * 0.3, r * 0.1, '#15171c');
      rr(ctx, r * 0.8, r * 0.35, r * 0.4, r * 0.3, r * 0.08, '#aeb4ba');
    },
    grievous(ctx, L, r, ex) {
      const c = '#e6e0cc';
      poly(ctx, [-r * 0.9, r * 0.8, -r * 1.1, -r * 0.5, -r * 0.4, -r * 1.2, r * 0.8, -r * 0.9, r * 1.4, -r * 0.2, r * 1.2, r * 0.5, r * 0.6, r * 1.0], c);
      poly(ctx, [r * 0.3, -r * 0.4, r * 1.1, -r * 0.25, r * 0.95, 0, r * 0.35, -r * 0.1], '#1a1c12', false);
      circ(ctx, r * 0.75, -r * 0.18, r * 0.12, '#e0c020', false);
      circ(ctx, r * 0.75, -r * 0.18, r * 0.05, '#101010', false);
      line(ctx, [r * 0.6, r * 0.4, r * 1.1, r * 0.35], '#6a6a5a', r * 0.06);
      line(ctx, [-r * 0.6, -r * 0.3, r * 0.2, -r * 0.8], M.shade(c, -0.2), r * 0.06);
    },
    b1(ctx, L, r, ex) {
      const c = L.skin || '#c8b48a';
      // long flattened droid head, pointing forward
      poly(ctx, [-r * 0.5, r * 0.3, -r * 0.6, -r * 0.3, r * 0.2, -r * 0.45, r * 1.9, -r * 0.1, r * 1.9, r * 0.2, r * 0.3, r * 0.45], c);
      circ(ctx, r * 0.2, -r * 0.05, r * 0.2, M.shade(c, -0.2));
      circ(ctx, r * 0.2, -r * 0.05, r * 0.1, '#302818', false);
      line(ctx, [r * 0.8, r * 0.1, r * 1.8, r * 0.05], M.shade(c, -0.3), r * 0.05);
      if (L.mark) { poly(ctx, [-r * 0.5, -r * 0.2, r * 0.6, -r * 0.35, r * 0.6, -r * 0.1, -r * 0.5, 0.05], L.mark, false); }
    },
    b2(ctx, L, r, ex) {
      const c = L.skin || '#4a5060';
      rr(ctx, r * 0.3, 0, r * 1.2, r * 0.9, r * 0.3, c);
      rr(ctx, r * 0.55, -r * 0.05, r * 0.5, r * 0.2, r * 0.06, '#101216');
      D.glow(ctx, r * 0.55, -r * 0.05, r * 0.3, '#ff5020', 0.4);
    },
    ig(ctx, L, r, ex) {
      rr(ctx, 0, -r * 0.3, r * 1.1, r * 2.2, r * 0.25, '#5a5e64');
      for (let i = 0; i < 3; i++) circ(ctx, r * 0.45, -r * 0.9 + i * r * 0.55, r * 0.14, '#c83020');
      rr(ctx, 0, -r * 1.35, r * 1.3, r * 0.15, r * 0.05, '#3a3e44');
    },
    kx(ctx, L, r, ex) {
      const c = L.skin || '#1c1d20';
      D.roundRect(ctx, -r * 0.9, -r * 1.2, r * 1.9, r * 2.0, r * 0.9);
      ctx.fillStyle = c; ctx.fill(); ctx.strokeStyle = OL; ctx.lineWidth = LW; ctx.stroke();
      circ(ctx, r * 0.55, -r * 0.3, r * 0.14, '#e8f0ff', false);
      D.glow(ctx, r * 0.55, -r * 0.3, r * 0.4, '#bfe0ff', 0.5);
      if (L.mark) line(ctx, [-r * 0.6, -r * 0.9, r * 0.2, -r * 1.1], L.mark, r * 0.1);
    },
    protocol(ctx, L, r, ex) {
      const c = L.skin || '#d8b048';
      circ(ctx, 0, 0, r, c);
      circ(ctx, r * 0.55, -r * 0.1, r * 0.2, '#2a2412');
      D.glow(ctx, r * 0.55, -r * 0.1, r * 0.35, '#ffe890', 0.6);
      circ(ctx, r * 0.55, -r * 0.1, r * 0.1, '#fff4c0', false);
      rr(ctx, r * 0.6, r * 0.5, r * 0.45, r * 0.12, r * 0.04, M.shade(c, -0.3), false);
      line(ctx, [-r * 0.8, -r * 0.2, r * 0.2, -r * 0.8], M.shade(c, 0.25), r * 0.1);
    },
    magna(ctx, L, r, ex) {
      rr(ctx, 0, -r * 0.1, r * 1.8, r * 2.0, r * 0.3, '#2a2420');
      circ(ctx, r * 0.55, -r * 0.3, r * 0.15, '#c040ff', false);
      D.glow(ctx, r * 0.55, -r * 0.3, r * 0.4, '#c040ff', 0.6);
      circ(ctx, r * 0.1, -r * 0.3, r * 0.12, '#c040ff', false);
      rr(ctx, r * 0.3, r * 0.6, r * 1.0, r * 0.2, r * 0.05, '#4a3a30');
    },
    dummy(ctx, L, r, ex) {
      const c = L.skin || '#e8a030';
      circ(ctx, 0, 0, r, c);
      ctx.beginPath(); ctx.arc(0, 0, r * 0.6, 0, Math.PI / 2); ctx.lineTo(0, 0); ctx.closePath(); ctx.fillStyle = '#1a1a1a'; ctx.fill();
      ctx.beginPath(); ctx.arc(0, 0, r * 0.6, Math.PI, Math.PI * 1.5); ctx.lineTo(0, 0); ctx.closePath(); ctx.fill();
      circ(ctx, 0, 0, r * 0.6, null);
    },
    hood(ctx, L, r, ex) {
      // face visible beneath a robe hood
      heads.human(ctx, Object.assign({}, L, { hair: null }), r, ex);
      const c = L.hood || '#5a3f2a';
      ctx.beginPath();
      ctx.moveTo(r * 0.9, -r * 0.9); ctx.quadraticCurveTo(-r * 0.2, -r * 1.7, -r * 1.3, -r * 0.5);
      ctx.lineTo(-r * 1.1, r * 1.3); ctx.lineTo(-r * 0.2, r * 1.1); ctx.quadraticCurveTo(-r * 0.4, -r * 0.4, r * 0.55, -r * 0.75); ctx.closePath();
      ctx.fillStyle = c; ctx.fill(); ctx.strokeStyle = OL; ctx.lineWidth = LW; ctx.stroke();
      if (L.hoodShadow !== false) { ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.arc(r * 0.35, -r * 0.2, r * 0.7, -2.5, -0.9); ctx.fill(); }
    },
    inquisitor(ctx, L, r, ex) {
      const c = '#3a3c42';
      D.roundRect(ctx, -r * 1.05, -r * 1.1, r * 2.1, r * 2.0, r * 0.7);
      ctx.fillStyle = c; ctx.fill(); ctx.strokeStyle = OL; ctx.lineWidth = LW; ctx.stroke();
      rr(ctx, r * 0.6, -r * 0.2, r * 0.8, r * 0.25, r * 0.08, '#0a0a0c');
      D.glow(ctx, r * 0.7, -r * 0.2, r * 0.3, '#ff3020', 0.4);
      line(ctx, [-r * 0.8, r * 0.2, r * 1.0, r * 0.5], '#5a5e66', r * 0.08);
    },
    temple(ctx, L, r, ex) {
      poly(ctx, [-r * 1.2, r * 1.2, -r * 1.05, -r * 0.8, 0, -r * 1.25, r * 0.95, -r * 0.8, r * 1.15, r * 1.2], '#7a5a3a');
      rr(ctx, r * 0.45, -r * 0.05, r * 1.1, r * 1.4, r * 0.2, '#e8d8a0');
      rr(ctx, r * 0.7, -r * 0.25, r * 0.6, r * 0.12, r * 0.04, '#1a1a1a');
      line(ctx, [r * 0.3, r * 0.3, r * 1.0, r * 0.3], '#a8986a', r * 0.05);
    },
    palpatine(ctx, L, r, ex) {
      heads.human(ctx, Object.assign({}, L, { hair: null, skin: '#d8c8b8', eyes: '#e0a020' }), r, ex);
      line(ctx, [r * 0.3, r * 0.1, r * 0.6, r * 0.3], '#a89080', r * 0.05);
      line(ctx, [r * 0.2, -r * 0.4, r * 0.5, -r * 0.2], '#a89080', r * 0.05);
      heads.hood(ctx, Object.assign({}, L, { hood: '#16161a', hair: null, skin: '#d8c8b8', eyes: '#e0a020' }), r, ex);
    },
  };

  // Eyes and brows that change with the character's state
  function face(ctx, L, r, ex, skin) {
    const ec = L.eyes || '#1a1c22', ex0 = r * 0.55, ey = -r * 0.1;
    const brow = M.shade((L.hair && L.hair.color) || skin, -0.2);
    if (ex === 'dead') {
      line(ctx, [ex0 - r * 0.1, ey - r * 0.1, ex0 + r * 0.1, ey + r * 0.1], '#1a1c22', r * 0.06);
      line(ctx, [ex0 - r * 0.1, ey + r * 0.1, ex0 + r * 0.1, ey - r * 0.1], '#1a1c22', r * 0.06);
    } else if (ex === 'sleep') {
      line(ctx, [ex0 - r * 0.1, ey + r * 0.02, ex0 + r * 0.1, ey + r * 0.04], '#1a1c22', r * 0.05);
    } else if (ex === 'dazed') {
      line(ctx, [ex0 - r * 0.1, ey, ex0 + r * 0.1, ey], '#1a1c22', r * 0.05);
      eye(ctx, ex0, ey + r * 0.03, r * 0.06, ec);
    } else if (ex === 'fear') {
      circ(ctx, ex0, ey, r * 0.15, '#f4f4f0', false);
      eye(ctx, ex0 + r * 0.02, ey, r * 0.07, ec);
    } else if (ex === 'pain') {
      line(ctx, [ex0 - r * 0.1, ey - r * 0.04, ex0 + r * 0.08, ey + r * 0.03, ex0 - r * 0.08, ey + r * 0.08], '#1a1c22', r * 0.05);
    } else eye(ctx, ex0, ey, r * 0.1, ec);
    if (ex === 'angry') line(ctx, [r * 0.36, -r * 0.38, r * 0.74, -r * 0.24], brow, r * 0.09);
    else if (ex === 'fear' || ex === 'pain') line(ctx, [r * 0.4, -r * 0.26, r * 0.72, -r * 0.38], brow, r * 0.08);
    else if (ex !== 'dead') line(ctx, [r * 0.4, -r * 0.3, r * 0.72, -r * 0.28], brow, r * 0.08);
  }
  function mouth(ctx, r, ex, skin) {
    const c = M.shade(skin, -0.35);
    if (ex === 'pain') { ctx.beginPath(); ctx.ellipse(r * 0.72, r * 0.5, r * 0.1, r * 0.14, 0, 0, 7); ctx.fillStyle = '#3a1410'; ctx.fill(); }
    else if (ex === 'fear') { ctx.beginPath(); ctx.arc(r * 0.74, r * 0.5, r * 0.07, 0, 7); ctx.fillStyle = '#3a1410'; ctx.fill(); }
    else if (ex === 'angry') rr(ctx, r * 0.72, r * 0.48, r * 0.26, r * 0.1, r * 0.02, '#f0ece0', c);
    else if (ex === 'dead' || ex === 'sleep') line(ctx, [r * 0.6, r * 0.52, r * 0.84, r * 0.5], c, r * 0.05);
    else line(ctx, [r * 0.62, r * 0.48, r * 0.82, r * 0.46], c, r * 0.06);
  }

  function hair(ctx, H, r) {
    if (!H) return;
    const c = H.color || '#4a3020';
    switch (H.style) {
      case 'short':
        ctx.beginPath(); ctx.arc(0, 0, r * 1.04, Math.PI * 0.95, Math.PI * 1.85); ctx.quadraticCurveTo(r * 0.2, -r * 0.6, -r * 0.8, r * 0.1); ctx.closePath();
        ctx.fillStyle = c; ctx.fill(); ctx.strokeStyle = OL; ctx.lineWidth = LW; ctx.stroke(); break;
      case 'long': case 'braid':
        ctx.beginPath(); ctx.arc(0, 0, r * 1.06, Math.PI * 0.9, Math.PI * 1.9); ctx.quadraticCurveTo(r * 0.1, -r * 0.5, -r * 0.6, r * 0.5); ctx.closePath();
        ctx.fillStyle = c; ctx.fill(); ctx.strokeStyle = OL; ctx.lineWidth = LW; ctx.stroke(); break;
      case 'buns':
        ctx.beginPath(); ctx.arc(0, 0, r * 1.04, Math.PI * 0.95, Math.PI * 1.85); ctx.closePath();
        ctx.fillStyle = c; ctx.fill(); ctx.strokeStyle = OL; ctx.lineWidth = LW; ctx.stroke();
        circ(ctx, -r * 0.9, 0, r * 0.45, c); break;
      case 'messy':
        for (let i = 0; i < 6; i++) { const a = Math.PI * (0.95 + i * 0.16); circ(ctx, Math.cos(a) * r * 0.85, Math.sin(a) * r * 0.85, r * 0.35, c, false); }
        break;
      case 'topknot':
        ctx.beginPath(); ctx.arc(0, 0, r * 1.02, Math.PI * 1.0, Math.PI * 1.8); ctx.closePath();
        ctx.fillStyle = c; ctx.fill();
        circ(ctx, -r * 0.4, -r * 1.05, r * 0.3, c); break;
      case 'bald': default: break;
    }
  }

  function marks(ctx, kind, r) {
    if (kind === 'sith') {
      ctx.fillStyle = '#121014';
      poly(ctx, [r * 0.2, -r * 0.7, r * 0.9, -r * 0.55, r * 0.7, -r * 0.2, r * 0.35, -r * 0.3], '#121014', false);
      poly(ctx, [r * 0.4, r * 0.1, r * 1.0, r * 0.1, r * 0.9, r * 0.5, r * 0.5, r * 0.6], '#121014', false);
      poly(ctx, [-r * 0.6, -r * 0.6, -r * 0.1, -r * 0.8, -r * 0.2, -r * 0.2], '#121014', false);
    } else if (kind === 'scar') {
      line(ctx, [r * 0.3, -r * 0.5, r * 0.8, r * 0.3], '#a04a3a', r * 0.06);
    } else if (kind === 'tattoo') {
      line(ctx, [r * 0.3, r * 0.3, r * 0.9, r * 0.2], '#2a4a6a', r * 0.06);
    }
  }

  /* ---------------- TORSOS ---------------- */
  function torso(ctx, L, w, h, e) {
    const T = L.torso || {};
    const c = T.color || '#8a7a6a';
    const s = T.style || 'tunic';
    const hw = w / 2, hh = h / 2;
    switch (s) {
      case 'tunic': { // Jedi layered tunic
        rr(ctx, 0, 0, w * 1.05, h * 1.02, w * 0.3, c);
        poly(ctx, [-hw * 0.2, -hh, hw * 0.9, -hh + h * 0.05, hw * 0.1, hh * 0.35], T.inner || M.shade(c, 0.25), true);
        poly(ctx, [hw * 0.15, -hh, hw * 0.95, -hh + h * 0.05, hw * 0.95, -hh + h * 0.35], T.under || M.shade(c, 0.45), false);
        rr(ctx, 0, hh * 0.45, w * 1.06, h * 0.12, 0.02, T.belt || '#3a2a1c');
        rr(ctx, hw * 0.55, hh * 0.45, w * 0.18, h * 0.1, 0.01, M.shade(T.belt || '#3a2a1c', 0.2));
        break;
      }
      case 'robe': { // dark cloak
        rr(ctx, 0, 0, w * 1.1, h * 1.04, w * 0.3, c);
        line(ctx, [hw * 0.5, -hh, hw * 0.3, hh], M.shade(c, 0.2), 0.02);
        rr(ctx, 0, hh * 0.5, w * 1.1, h * 0.1, 0.02, T.belt || '#1a1a1a');
        break;
      }
      case 'armor': case 'clone': case 'sand': case 'snow': {
        rr(ctx, 0, 0, w, h, w * 0.25, T.under || '#1a1b1e');
        rr(ctx, hw * 0.1, -hh * 0.42, w * 1.02, h * 0.48, w * 0.25, c);
        rr(ctx, hw * 0.12, hh * 0.28, w * 0.85, h * 0.24, w * 0.15, c);
        rr(ctx, 0, hh * 0.72, w * 1.02, h * 0.12, 0.02, T.belt || M.shade(c, -0.1));
        if (T.stripe) { rr(ctx, hw * 0.1, -hh * 0.42, w * 0.25, h * 0.46, 0.01, T.stripe, false); rr(ctx, hw * 0.12, hh * 0.28, w * 0.25, h * 0.22, 0.01, T.stripe, false); }
        line(ctx, [hw * 0.3, -hh * 0.1, hw * 0.8, -hh * 0.1], M.shade(c, -0.25), 0.012);
        if (s === 'sand' || T.pauldron) rr(ctx, -hw * 0.1, -hh * 0.75, w * 0.8, h * 0.25, 0.05, T.pauldron || '#c86a2a');
        if (s === 'snow') rr(ctx, 0, hh * 0.2, w * 1.25, h * 0.7, w * 0.2, '#e4e8ec');
        break;
      }
      case 'vader': {
        rr(ctx, 0, 0, w * 1.08, h * 1.02, w * 0.25, '#0f1013');
        rr(ctx, hw * 0.15, -hh * 0.3, w * 0.62, h * 0.38, 0.02, '#1c1e24');
        rr(ctx, hw * 0.3, -hh * 0.3, w * 0.35, h * 0.26, 0.01, '#2e3038');
        const lights = ['#e03030', '#30c040', '#3060e0', '#e0e0e0'];
        for (let i = 0; i < 4; i++) rr(ctx, hw * 0.12 + i * w * 0.08, -hh * 0.36, w * 0.05, h * 0.05, 0.005, lights[i], false);
        rr(ctx, 0, hh * 0.45, w * 1.1, h * 0.12, 0.02, '#2a2c32');
        rr(ctx, hw * 0.5, hh * 0.45, w * 0.3, h * 0.1, 0.01, '#8a8e96');
        break;
      }
      case 'mando': {
        rr(ctx, 0, 0, w, h, w * 0.25, T.under || '#4a4a3a');
        rr(ctx, hw * 0.15, -hh * 0.4, w * 0.95, h * 0.42, w * 0.2, c);
        rr(ctx, hw * 0.2, hh * 0.15, w * 0.6, h * 0.22, w * 0.12, T.plate2 || M.shade(c, -0.15));
        rr(ctx, 0, hh * 0.65, w * 1.05, h * 0.14, 0.02, T.belt || '#5a4a32');
        for (let i = 0; i < 3; i++) rr(ctx, -hw * 0.5 + i * w * 0.3, hh * 0.65, w * 0.14, h * 0.1, 0.01, '#3a3024');
        break;
      }
      case 'uniform': {
        rr(ctx, 0, 0, w * 1.02, h, w * 0.25, c);
        rr(ctx, hw * 0.35, -hh * 0.55, w * 0.35, h * 0.14, 0.01, T.badge || '#b83030');
        for (let i = 0; i < 3; i++) rr(ctx, hw * 0.3 + i * w * 0.07, -hh * 0.3, w * 0.04, h * 0.05, 0.005, '#c8c8c8', false);
        rr(ctx, 0, hh * 0.55, w * 1.03, h * 0.1, 0.02, T.belt || '#1a1a1a');
        rr(ctx, hw * 0.4, hh * 0.55, w * 0.18, h * 0.08, 0.01, '#b0b0b0');
        break;
      }
      case 'vest': {
        rr(ctx, 0, 0, w, h, w * 0.25, T.shirt || '#ece8dc');
        poly(ctx, [-hw, -hh * 0.9, hw * 0.1, -hh * 0.9, -hw * 0.1, hh * 0.6, -hw, hh * 0.6], c);
        poly(ctx, [hw * 0.6, -hh * 0.9, hw, -hh * 0.8, hw, hh * 0.6, hw * 0.45, hh * 0.6], c);
        rr(ctx, 0, hh * 0.65, w * 1.02, h * 0.12, 0.02, T.belt || '#3a2a1a');
        break;
      }
      case 'jumpsuit': {
        rr(ctx, 0, 0, w, h, w * 0.3, c);
        rr(ctx, hw * 0.35, -hh * 0.3, w * 0.4, h * 0.35, 0.03, T.vest || '#e8e0d0');
        rr(ctx, 0, hh * 0.55, w * 1.02, h * 0.1, 0.02, T.belt || '#2a2a2a');
        break;
      }
      case 'dress': {
        rr(ctx, 0, 0, w, h, w * 0.3, c);
        rr(ctx, 0, hh * 0.5, w * 1.02, h * 0.1, 0.02, T.belt || '#c0b090');
        break;
      }
      case 'b1': {
        rr(ctx, 0, -hh * 0.35, w * 0.8, h * 0.45, w * 0.2, c);
        rr(ctx, 0, hh * 0.3, w * 0.25, h * 0.6, 0.02, M.shade(c, -0.2));
        circ(ctx, hw * 0.2, -hh * 0.35, w * 0.12, M.shade(c, -0.25));
        if (T.mark) rr(ctx, 0, -hh * 0.35, w * 0.8, h * 0.12, 0.02, T.mark, false);
        break;
      }
      case 'b2': {
        rr(ctx, hw * 0.2, -hh * 0.1, w * 1.5, h * 1.0, w * 0.35, c);
        rr(ctx, hw * 0.35, -hh * 0.2, w * 0.9, h * 0.5, w * 0.2, M.shade(c, 0.12));
        rr(ctx, 0, hh * 0.65, w * 0.6, h * 0.25, 0.03, M.shade(c, -0.2));
        break;
      }
      case 'grievous': {
        rr(ctx, 0, 0, w * 0.35, h * 1.0, 0.03, '#b8b2a0');
        for (let i = 0; i < 5; i++) {
          const y = -hh * 0.75 + i * h * 0.13;
          ctx.beginPath(); ctx.moveTo(-hw * 0.2, y); ctx.quadraticCurveTo(hw * 1.2, y - 0.02, hw * 0.9, y + h * 0.08);
          ctx.strokeStyle = '#e6e0cc'; ctx.lineWidth = 0.03; ctx.stroke();
        }
        circ(ctx, hw * 0.35, -hh * 0.2, w * 0.18, '#6a4a3a');
        rr(ctx, 0, hh * 0.65, w * 0.9, h * 0.18, 0.03, '#8a8474');
        break;
      }
      case 'fur': {
        rr(ctx, 0, 0, w * 1.08, h * 1.02, w * 0.35, c);
        for (let i = 0; i < 8; i++) line(ctx, [-hw * 0.6 + (i % 4) * w * 0.35, -hh * 0.6 + Math.floor(i / 4) * h * 0.5, -hw * 0.5 + (i % 4) * w * 0.35, -hh * 0.4 + Math.floor(i / 4) * h * 0.5], M.shade(c, -0.25), 0.02);
        if (T.bandolier) line(ctx, [-hw * 0.9, -hh * 0.9, hw * 0.9, hh * 0.7], T.bandolier, 0.05);
        break;
      }
      case 'wrap': {
        rr(ctx, 0, 0, w * 1.08, h * 1.02, w * 0.3, c);
        for (let i = -3; i <= 3; i++) line(ctx, [-hw, i * h * 0.13, hw, i * h * 0.13 + 0.03], M.shade(c, -0.15), 0.02);
        line(ctx, [-hw * 0.9, -hh * 0.9, hw * 0.9, hh * 0.9], '#5a4a3a', 0.04);
        break;
      }
      case 'protocol': {
        rr(ctx, 0, 0, w, h, w * 0.3, c);
        rr(ctx, hw * 0.2, -hh * 0.3, w * 0.55, h * 0.35, 0.03, M.shade(c, 0.2));
        rr(ctx, 0, hh * 0.35, w * 0.4, h * 0.3, 0.02, '#6a6a6a');
        for (let i = 0; i < 3; i++) line(ctx, [-hw * 0.3, hh * 0.25 + i * 0.04, hw * 0.3, hh * 0.25 + i * 0.04], '#c83030', 0.01);
        break;
      }
      case 'droid': {
        rr(ctx, 0, 0, w, h, w * 0.2, c);
        rr(ctx, hw * 0.2, -hh * 0.2, w * 0.5, h * 0.4, 0.02, M.shade(c, 0.15));
        if (T.mark) rr(ctx, -hw * 0.3, -hh * 0.6, w * 0.3, h * 0.15, 0.01, T.mark, false);
        break;
      }
      case 'dummy': {
        rr(ctx, 0, 0, w, h, w * 0.3, c);
        ctx.beginPath(); ctx.arc(hw * 0.2, -hh * 0.3, w * 0.25, 0, Math.PI / 2); ctx.lineTo(hw * 0.2, -hh * 0.3); ctx.fillStyle = '#1a1a1a'; ctx.fill();
        ctx.beginPath(); ctx.arc(hw * 0.2, -hh * 0.3, w * 0.25, Math.PI, Math.PI * 1.5); ctx.lineTo(hw * 0.2, -hh * 0.3); ctx.fill();
        rr(ctx, 0, hh * 0.6, w, h * 0.08, 0.01, '#1a1a1a');
        break;
      }
      default:
        rr(ctx, 0, 0, w, h, w * 0.3, c);
    }
    if (T.emblem) circ(ctx, hw * 0.45, -hh * 0.45, w * 0.1, T.emblem);
  }

  /* ---------------- LIMBS ---------------- */
  function limb(ctx, L, kind, w, h, back) {
    const shade = back ? -0.18 : 0;
    const A = L.arms || {}, G = L.legs || {};
    const mech = L.mech;
    if (kind === 'upperArm' || kind === 'forearm') {
      let c = kind === 'upperArm' ? (A.upper || A.color || '#6a5a4a') : (A.lower || A.color || '#6a5a4a');
      if (mech) {
        rr(ctx, 0, 0, w * 0.45, h * 1.02, 0.02, M.shade(A.color || '#aaa', shade));
        circ(ctx, 0, -h / 2 + 0.02, w * 0.4, M.shade(A.joint || A.color || '#888', shade - 0.1));
        if (A.plate) rr(ctx, w * 0.05, 0, w * 0.8, h * 0.6, 0.02, M.shade(A.plate, shade));
        return;
      }
      rr(ctx, 0, 0, w, h * 1.08, w * 0.45, M.shade(c, shade));
      if (A.armor) rr(ctx, w * 0.06, kind === 'upperArm' ? -h * 0.05 : h * 0.02, w * 1.02, h * 0.6, w * 0.3, M.shade(A.armor, shade));
      if (A.sleeve && kind === 'forearm') rr(ctx, 0, h * 0.25, w * 1.35, h * 0.5, w * 0.3, M.shade(A.sleeve, shade));
      if (A.gauntlet && kind === 'forearm') rr(ctx, 0, h * 0.2, w * 1.15, h * 0.55, w * 0.25, M.shade(A.gauntlet, shade));
    } else if (kind === 'hand') {
      const c = A.glove || L.skin || '#e8b894';
      if (mech) { rr(ctx, 0, 0, w * 0.8, h * 1.1, 0.02, M.shade(A.glove || A.color || '#999', shade)); return; }
      rr(ctx, 0, 0, w * 1.05, h * 1.1, w * 0.45, M.shade(c, shade));
    } else if (kind === 'thigh' || kind === 'shin') {
      let c = kind === 'thigh' ? (G.upper || G.color || '#4a4036') : (G.lower || G.color || '#4a4036');
      if (mech) {
        rr(ctx, 0, 0, w * 0.45, h * 1.02, 0.02, M.shade(G.color || '#aaa', shade));
        circ(ctx, 0, -h / 2 + 0.02, w * 0.42, M.shade(G.joint || G.color || '#888', shade - 0.1));
        if (G.plate) rr(ctx, w * 0.1, 0, w * 0.8, h * 0.7, 0.02, M.shade(G.plate, shade));
        return;
      }
      rr(ctx, 0, 0, w, h * 1.06, w * 0.45, M.shade(c, shade));
      if (G.armor) rr(ctx, w * 0.1, kind === 'thigh' ? 0 : -h * 0.05, w * 1.02, h * 0.7, w * 0.3, M.shade(G.armor, shade));
      if (kind === 'shin' && G.boots) rr(ctx, 0, h * 0.18, w * 1.12, h * 0.7, w * 0.3, M.shade(G.boots, shade));
      if (kind === 'thigh' && L.robeSkirt) {
        poly(ctx, [-w * 0.75, -h * 0.5, w * 0.8, -h * 0.5, w * 0.95, h * (L.robeSkirtLen || 0.55), -w * 0.9, h * (L.robeSkirtLen || 0.55)], M.shade(L.robeSkirt, shade));
      }
    } else if (kind === 'foot') {
      const c = G.boots || G.color || '#2a2622';
      if (mech) { poly(ctx, [-w * 0.3, -h * 0.5, w * 0.35, -h * 0.5, w * 0.55, h * 0.5, -w * 0.4, h * 0.5], M.shade(c, shade)); return; }
      D.roundRect(ctx, -w * 0.4, -h * 0.55, w * 0.95, h * 1.1, h * 0.4);
      ctx.fillStyle = M.shade(c, shade); ctx.fill(); ctx.strokeStyle = OL; ctx.lineWidth = LW; ctx.stroke();
    }
  }

  return {
    head(ctx, L, r, ex) { (heads[L.head] || heads.human)(ctx, L, r, ex || 'neutral'); },
    torso,
    limb,
    heads: Object.keys(heads),
  };
})();
