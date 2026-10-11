/* GALACTIC PLAYGROUND content — machine parts, electronics and seats on furniture. */
'use strict';

(() => {
  const M = GP.M, D = GP.Draw, OL = D.OUTLINE;
  const rr = (ctx, x, y, w, h, r, f, s = true, lw = 0.022) => { D.roundRect(ctx, x - w / 2, y - h / 2, w, h, r); if (f) { ctx.fillStyle = f; ctx.fill(); } if (s) { ctx.strokeStyle = s === true ? OL : s; ctx.lineWidth = lw; ctx.stroke(); } };
  const circ = (ctx, x, y, r, f, s = true, lw = 0.022) => { ctx.beginPath(); ctx.arc(x, y, r, 0, 7); if (f) { ctx.fillStyle = f; ctx.fill(); } if (s) { ctx.strokeStyle = s === true ? OL : s; ctx.lineWidth = lw; ctx.stroke(); } };
  const Wires = () => GP.Wires;

  // machine parts that are wired "on" run themselves when no pilot drives them
  const selfDrive = (e, dt) => {
    if (e.drivenT > 0) e.drivenT -= dt;
    else if (e.powered) GP.Machines.drive(e, GP.Machines.idle, dt, null);
    GP.Machines.tickSound(e, dt);
  };
  const machineProps = (extra = []) => (e) => [
    { key: 'powered', label: 'Powered (runs without a pilot)', type: 'bool', get: () => !!e.powered, set: (v) => { e.powered = v; } },
    ...extra,
  ];

  const defs = [
    /* ---------------- machine parts */
    { id: 'wheel', name: 'Wheel', sub: 'Machines', material: 'plastic', hp: 200, density: 90, friction: 1.3, restitution: 0.1, shapes: [{ circle: [0.45] }], color: '#2a2a2a',
      paint: (ctx) => { circ(ctx, 0, 0, 0.45, '#26262a'); circ(ctx, 0, 0, 0.3, '#5a5e66'); circ(ctx, 0, 0, 0.09, '#8a8e96'); for (let i = 0; i < 5; i++) { const a = i / 5 * 6.283; ctx.beginPath(); ctx.moveTo(Math.cos(a) * 0.1, Math.sin(a) * 0.1); ctx.lineTo(Math.cos(a) * 0.28, Math.sin(a) * 0.28); ctx.strokeStyle = '#3a3e46'; ctx.lineWidth = 0.04; ctx.stroke(); } },
      desc: 'Pin it to a frame with the Rope tool set to "Pivot pin".', tags: ['tire', 'car', 'build', 'vehicle'] },
    { id: 'motor_wheel', name: 'Motor Wheel', sub: 'Machines', material: 'metal', hp: 240, density: 100, friction: 1.4, restitution: 0.05, shapes: [{ circle: [0.45] }], color: '#2a2a2a',
      machine: { type: 'motor', torque: 950, speed: 20, brake: 3 }, update: selfDrive, props: machineProps(),
      paint: (ctx, e) => { circ(ctx, 0, 0, 0.45, '#26262a'); circ(ctx, 0, 0, 0.3, '#6a5a3a'); circ(ctx, 0, 0, 0.16, '#c8a040'); const on = e.powered || e.drivenT > 0; circ(ctx, 0, 0, 0.07, on ? '#ffe070' : '#5a4a2a', false); for (let i = 0; i < 3; i++) { const a = i / 3 * 6.283; ctx.beginPath(); ctx.moveTo(Math.cos(a) * 0.17, Math.sin(a) * 0.17); ctx.lineTo(Math.cos(a) * 0.29, Math.sin(a) * 0.29); ctx.strokeStyle = '#3a3024'; ctx.lineWidth = 0.05; ctx.stroke(); } },
      desc: 'Driven by a connected Pilot Seat (A/D) or switched on by a wire.', tags: ['motor', 'engine', 'car', 'build', 'vehicle'] },
    { id: 'thruster', name: 'Thruster', sub: 'Machines', material: 'metal', hp: 180, density: 120, shapes: [{ box: [0.34, 0.5] }], color: '#5a5e66',
      machine: { type: 'thruster', force: 2400, color: '#ff9a40' }, update: selfDrive, props: machineProps(),
      paint: (ctx) => { rr(ctx, 0, -0.05, 0.34, 0.4, 0.05, '#5a5e66'); ctx.beginPath(); ctx.moveTo(-0.12, 0.15); ctx.lineTo(0.12, 0.15); ctx.lineTo(0.17, 0.26); ctx.lineTo(-0.17, 0.26); ctx.closePath(); ctx.fillStyle = '#2a2c30'; ctx.fill(); ctx.strokeStyle = OL; ctx.lineWidth = 0.02; ctx.stroke(); rr(ctx, 0, -0.12, 0.2, 0.06, 0.01, '#c8a040', false); },
      desc: 'Pushes toward its top. From a connected Pilot Seat, W fires upward thrusters and A/D fire sideways ones. Wire it to run on its own.', tags: ['rocket', 'engine', 'fly', 'build'] },
    { id: 'repulsor_pad', name: 'Repulsor Pad', sub: 'Machines', material: 'metal', hp: 180, density: 110, shapes: [{ box: [0.8, 0.2] }], color: '#3a3e46',
      machine: { type: 'repulsor', height: 1.1, lift: 140 }, update: selfDrive, props: machineProps(),
      paint: (ctx, e) => { rr(ctx, 0, 0, 0.8, 0.2, 0.05, '#3a3e46'); rr(ctx, 0, 0.07, 0.6, 0.06, 0.02, (e.powered || e.drivenT > 0) ? '#8ad0ff' : '#2a4a6a', false); },
      desc: 'Hovers over the ground while its Pilot Seat is occupied or when wired on.', tags: ['hover', 'float', 'build', 'speeder'] },
    { id: 'turret_mount', name: 'Turret Mount', sub: 'Machines', material: 'metal', hp: 220, density: 130, shapes: [{ box: [0.5, 0.35] }], color: '#4a4e56',
      machine: { type: 'gun', damage: 24, rate: 5, recoil: 6, color: '#ff3030' }, update: selfDrive, props: machineProps(),
      paint: (ctx, e) => {
        rr(ctx, 0, 0.05, 0.5, 0.25, 0.04, '#4a4e56');
        const b = e.body; const a = e.aim != null && b ? e.aim - b.a : 0;
        ctx.save(); ctx.translate(0, -0.05); ctx.scale(e.facing || 1, 1); ctx.rotate((e.facing || 1) < 0 ? Math.PI - a : a);
        rr(ctx, 0.3, 0, 0.6, 0.1, 0.02, '#2a2c30'); rr(ctx, 0.05, 0, 0.22, 0.2, 0.05, '#5a5e66');
        ctx.restore();
      },
      desc: 'Aims at the cursor and fires when its Pilot Seat attacks, or keeps firing when wired on.', tags: ['gun', 'cannon', 'weapon', 'build'] },
    { id: 'pilot_seat', name: 'Pilot Seat', sub: 'Machines', material: 'metal', hp: 200, density: 120, shapes: [{ box: [0.7, 0.18] }, { box: [0.14, 0.7, -0.28, -0.35] }], color: '#6a3a2a',
      seats: [{ x: 0.02, y: -0.14, pose: 'grip' }], gripDir: 0.55, pilotSeat: true,
      update: (e, dt) => {
        const d = e.occupants && e.occupants[0];
        if (!d || d.removed || d.state === 'dead') return;
        e.linkT = (e.linkT || 0) - dt;
        if (e.linkT <= 0 || !e.parts) { e.parts = GP.Machines.connected(e.game, e).filter((p) => p.def.machine); e.linkT = 0.5; }
        for (const p of e.parts) { if (p.removed) continue; p.drivenT = 0.1; GP.Machines.drive(p, d.intent, dt, d); }
      },
      paint: (ctx) => { rr(ctx, -0.28, -0.35, 0.14, 0.7, 0.04, '#6a3a2a'); rr(ctx, 0, 0, 0.7, 0.18, 0.05, '#7a4a3a'); rr(ctx, 0.28, -0.24, 0.06, 0.34, 0.02, '#3a3e46'); circ(ctx, 0.28, -0.42, 0.06, '#c8a040'); },
      desc: 'Sit a character here (E while controlling them). Everything welded, pinned or roped to it becomes drivable: A/D motors and thrusters, W lift, mouse turrets.', tags: ['seat', 'driver', 'cockpit', 'build', 'vehicle'] },

    /* ---------------- electronics */
    { id: 'wall_button', signalSource: true, name: 'Button', sub: 'Electronics', material: 'metal', hp: 120, density: 150, shapes: [{ box: [0.3, 0.3] }], color: '#3a3e46',
      onUse: (e) => { e.flash = 0.4; GP.Audio.play('click', { f: 1100 }); Wires().emit(e, e.game); },
      onImpact: (e, dv) => { if (e.age > 0.8 && dv > 3.5 && !(e.flash > 0)) e.def.onUse(e); },
      update: (e, dt) => { if (e.flash > 0) e.flash -= dt; },
      paint: (ctx, e) => { rr(ctx, 0, 0, 0.3, 0.3, 0.04, '#3a3e46'); circ(ctx, 0, 0, 0.09, e.flash > 0 ? '#ff6a4a' : '#b82a2a'); if (e.flash > 0) D.glow(ctx, 0, 0, 0.3, '#ff4a2a', 0.8); },
      desc: 'Press it (E, or hit it) to activate everything wired to it.', tags: ['switch', 'trigger', 'wire', 'circuit'] },
    { id: 'pressure_plate', signalSource: true, name: 'Pressure Plate', sub: 'Electronics', material: 'metal', hp: 200, density: 200, shapes: [{ box: [1.2, 0.12] }], color: '#5a5e66',
      update: (e, dt) => {
        e.checkT = (e.checkT || 0) - dt; if (e.checkT > 0) return; e.checkT = 0.1;
        const b = e.body; let mass = 0;
        e.game.world.queryAABB(b.x - 0.55 * e.scale, b.y - 0.35, b.x + 0.55 * e.scale, b.y - 0.05, (s) => { if (s.body !== b && s.body.type === GP.Phys.DYNAMIC && !s.sensor) mass += s.body.m; });
        const down = mass > 15;
        if (down && !e.down) { e.flash = 0.4; GP.Audio.play('click', { f: 700 }); Wires().emit(e, e.game); }
        e.down = down; if (e.flash > 0) e.flash -= 0.1;
      },
      paint: (ctx, e) => { rr(ctx, 0, 0.02, 1.2, 0.1, 0.02, '#3a3e46'); rr(ctx, 0, e.down ? 0 : -0.04, 1.0, 0.06, 0.02, e.down ? '#c8a040' : '#8a8e96'); },
      desc: 'Activates wired objects when something heavy steps on it.', tags: ['trap', 'trigger', 'wire', 'circuit'] },
    { id: 'timer_module', signalSource: true, name: 'Timer', sub: 'Electronics', material: 'metal', hp: 100, density: 150, shapes: [{ box: [0.36, 0.26] }], color: '#2a2c30',
      onBuild: (e) => { if (e.interval == null) { e.interval = 2; e.running = false; e.acc = 0; } },
      onUse: (e) => { e.running = !e.running; GP.Audio.play('click', { f: 1300 }); },
      update: (e, dt) => { if (!e.running) return; e.acc += dt; if (e.acc >= e.interval) { e.acc = 0; e.flash = 0.25; GP.Audio.play('beepArm', { x: e.body.x, y: e.body.y, f: 1800, vol: 0.12 }); Wires().emit(e, e.game); } if (e.flash > 0) e.flash -= dt; },
      props: (e) => [{ key: 'run', label: 'Running', type: 'bool', get: () => !!e.running, set: (v) => { e.running = v; } }, { key: 'int', label: 'Interval (s)', type: 'range', min: 0.2, max: 20, step: 0.1, get: () => e.interval, set: (v) => { e.interval = v; } }],
      paint: (ctx, e) => { rr(ctx, 0, 0, 0.36, 0.26, 0.03, '#2a2c30'); rr(ctx, 0, 0, 0.26, 0.12, 0.01, '#0a1a10'); ctx.fillStyle = e.flash > 0 ? '#80ff90' : (e.running ? '#3a9a4a' : '#2a4a2a'); ctx.fillRect(-0.11, -0.04, 0.22 * (e.running && e.interval ? e.acc / e.interval : 0), 0.08); },
      desc: 'Pulses its wires every few seconds once started. Activate (F) to start or stop.', tags: ['clock', 'delay', 'loop', 'wire', 'circuit'] },
    { id: 'motion_sensor', signalSource: true, name: 'Motion Sensor', sub: 'Electronics', material: 'metal', hp: 100, density: 150, shapes: [{ box: [0.3, 0.22] }], color: '#3a3e46',
      update: (e, dt) => {
        if (e.cool > 0) e.cool -= dt;
        if (e.flash > 0) e.flash -= dt;
        e.checkT = (e.checkT || 0) - dt; if (e.checkT > 0 || e.cool > 0) return; e.checkT = 0.2;
        const b = e.body;
        for (const c of e.game.entities) {
          if (!c.isCharacterLike || c.removed || c.hidden || c.state === 'dead') continue;
          const p = c.position(), v = c.velocity();
          if (Math.hypot(p.x - b.x, p.y - b.y) < 5 && Math.hypot(v.x, v.y) > 0.4) { e.cool = 1.2; e.flash = 0.5; GP.Audio.play('beepArm', { x: b.x, y: b.y, f: 2400, vol: 0.15 }); Wires().emit(e, e.game); break; }
        }
      },
      paint: (ctx, e) => { rr(ctx, 0, 0, 0.3, 0.22, 0.05, '#3a3e46'); circ(ctx, 0.05, 0, 0.07, e.flash > 0 ? '#ff5040' : '#5a1a1a'); if (e.flash > 0) D.glow(ctx, 0.05, 0, 0.3, '#ff3020', 0.8); },
      desc: 'Activates its wires when a character moves within 5 m.', tags: ['sensor', 'trap', 'detector', 'wire', 'circuit'] },
    { id: 'led_light', name: 'Signal Light', sub: 'Electronics', material: 'crystal', hp: 30, density: 150, shapes: [{ circle: [0.1] }], color: '#40ff60',
      onUse: (e) => { e.lit = 0.8; },
      update: (e, dt) => { if (e.lit > 0) { e.lit -= dt; const b = e.body; GP.FX.frameLight(b.x, b.y, 2.2, e.col || '#40ff60', 0.8); } },
      paint: (ctx, e) => { circ(ctx, 0, 0, 0.1, e.lit > 0 ? '#c8ffd0' : '#1a4a24'); if (e.lit > 0) D.glow(ctx, 0, 0, 0.45, e.col || '#40ff60', 1); },
      desc: 'Flashes whenever it receives a signal.', tags: ['led', 'lamp', 'indicator', 'wire', 'circuit'] },
    { id: 'holo_display', name: 'Holo Display', sub: 'Electronics', material: 'metal', hp: 120, density: 90, shapes: [{ box: [1.6, 0.8] }], color: '#1a2230',
      onBuild: (e) => { if (e.text == null) e.text = 'HELLO THERE'; },
      onUse: (e) => { e.flash = 0.6; },
      update: (e, dt) => { if (e.flash > 0) e.flash -= dt; const b = e.body; GP.FX.frameLight(b.x, b.y, 2.4, '#6ec8ff', 0.4); },
      props: (e) => [{ key: 'text', label: 'Text', type: 'text', get: () => e.text || '', set: (v) => { e.text = v.slice(0, 40); } }],
      paint: (ctx, e) => {
        rr(ctx, 0, 0, 1.6, 0.8, 0.05, '#1a2230');
        rr(ctx, 0, 0, 1.44, 0.64, 0.03, e.flash > 0 ? '#1a4a6a' : '#0a1624', false);
        if (!e.fragment) {
          ctx.save(); ctx.scale(e.facing || 1, 1);
          ctx.fillStyle = e.flash > 0 ? '#ffffff' : '#8ae0ff'; ctx.font = 'bold 0.2px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          const t = String(e.text || ''); const lines = t.length > 14 ? [t.slice(0, 14), t.slice(14, 28)] : [t];
          lines.forEach((ln, i) => ctx.fillText(ln, 0, (i - (lines.length - 1) / 2) * 0.24));
          ctx.restore();
          ctx.fillStyle = 'rgba(140,220,255,0.06)'; for (let y = -0.3; y < 0.3; y += 0.06) ctx.fillRect(-0.7, y, 1.4, 0.02);
        }
      },
      desc: 'Shows your text (edit it in Properties). Flashes when it gets a signal.', tags: ['screen', 'sign', 'text', 'monitor', 'wire'] },
  ];
  for (const d of defs) { d.kind = 'prop'; d.category = 'Structures'; d.layer = 1; GP.Registry.register(d); }

  // seats on existing furniture
  const seat = (id, seats) => { const d = GP.Registry.get(id); if (d) d.seats = seats; };
  seat('stool', [{ x: 0, y: -0.36, pose: 'sit' }]);
  seat('bench', [{ x: -0.5, y: -0.4, pose: 'sit' }, { x: 0.5, y: -0.4, pose: 'sit' }]);
  seat('bunk', [{ x: 0.1, y: -0.55, pose: 'sit' }]);
  seat('crate_cargo', [{ x: 0, y: -0.62, pose: 'sit' }]);
  seat('crate_small', [{ x: 0, y: -0.4, pose: 'sit' }]);
})();
