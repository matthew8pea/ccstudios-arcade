/* GALACTIC PLAYGROUND — detailed injuries for living (non-droid) characters.
 *
 * On top of hit points, broken bones and bleeding (gore.js), a hurt body slowly gets worse:
 *   internal bleeding  hard blows to the torso or head bleed inside: blood drains with no visible wound
 *   pain               builds with every injury and fades slowly; a burst of adrenaline masks it for a while
 *   shock              blood loss, pain and internal bleeding add up: trembling, weakness, then collapse
 *                      and unconsciousness
 *   consciousness      knocked down by head trauma and deep shock; recovers when the body is stable
 *   limb failure       nerve damage (cuts, burns, acid) and numbness from heavy bleeding weaken a limb
 *                      step by step, on top of the damage itself
 * Bacta cures all of it. "Detailed injuries" in Settings → Gameplay switches it off.
 */
'use strict';

GP.Injury = (() => {
  const M = GP.M;
  const on = () => GP.Settings.play.injuries !== false;
  const LIMBS = { upperArm: 1, forearm: 1, hand: 1, thigh: 1, shin: 1, foot: 1 };
  const NERVE = { cut: 0.9, blaster: 0.6, fire: 0.35, acid: 0.8, electric: 0.5, stab: 0.9 };
  const INTERNAL = { impact: 1, crush: 1.5, explosive: 1.2 };

  function state(c) {
    if (!c.inj) c.inj = { internal: 0, pain: 0, adrenaline: 0, shock: 0, consc: 1, tremor: 0, collapsed: false };
    return c.inj;
  }
  const alive = (c) => c && c.state === 'alive' && !c.mech && c.partList;

  // A part was hurt (from the character:hurt event)
  function onHurt(c, p, amt, type) {
    if (!on() || !alive(c) || amt <= 0) return;
    const s = state(c);
    s.pain = Math.min(1.6, s.pain + amt * 0.012);
    // a big shock to the system sets off adrenaline
    if (amt > 12) s.adrenaline = Math.min(1, s.adrenaline + amt * 0.02);
    const kInt = INTERNAL[type] || 0;
    if (kInt && (p.kind === 'torso' || p.kind === 'head') && amt > 6) s.internal = Math.min(2, s.internal + (amt - 6) * 0.006 * kInt);
    if (p.kind === 'head' && amt > 8) s.consc = Math.max(0, s.consc - amt * 0.012);
    const kN = NERVE[type] || 0;
    if (kN && LIMBS[p.kind]) p.nerve = Math.min(0.85, (p.nerve || 0) + amt / p.maxHp * kN);
  }

  function update(c, dt) {
    if (!on() || !alive(c)) return;
    const s = state(c);
    // internal bleeding drains blood and clots only slowly
    if (s.internal > 0.01) {
      c.blood = Math.max(0, (c.blood == null ? 1 : c.blood) - s.internal * dt * 0.0045);
      s.internal *= Math.exp(-dt * 0.012);
      // now and then they cough up blood
      if (s.internal > 0.4 && GP.Gore && GP.Gore.on() && Math.random() < dt * 0.15 * s.internal) {
        const h = c.parts.head;
        GP.Gore.spray(c, h.x, h.y, c.facing * 0.6, 0.3, 3 + s.internal * 3, 0.5, 1.5);
      }
      if (c.blood <= 0.02) { c.die(); return; }
    }
    // pain fades, adrenaline wears off
    s.pain *= Math.exp(-dt * 0.06);
    s.adrenaline = Math.max(0, s.adrenaline - dt / 25);
    const felt = s.pain * (1 - 0.75 * s.adrenaline);
    // shock follows blood loss, pain and internal bleeding (slowly both ways)
    const blood = c.blood == null ? 1 : c.blood;
    const target = M.clamp((1 - blood) * 1.8 + felt * 0.45 + s.internal * 0.25, 0, 1.6);
    s.shock = M.approach(s.shock, target, dt * (target > s.shock ? 0.12 : 0.05));
    // consciousness drifts back toward what the body can sustain
    const ceiling = M.clamp(1.15 - Math.max(0, s.shock - 0.5), 0, 1);
    s.consc = M.approach(s.consc, ceiling, dt * (ceiling > s.consc ? 0.04 : 0.15));
    if (s.consc < 0.25 && c.unconscious <= 0) c.knockOut(4 + (0.25 - s.consc) * 30);
    // deep shock: the legs give way
    if (s.shock > 0.95 && c.stun <= 0 && Math.random() < dt * 0.4) c.knockDown(2 + s.shock * 2);
    // trembling hands and weak muscles
    s.tremor = M.clamp((s.shock - 0.35) * 1.6 + felt * 0.2, 0, 1);
    c.injStrength = M.clamp(1 - s.shock * 0.35 - felt * 0.12, 0.35, 1);
    if (s.tremor > 0.05 && c.stun <= 0) {
      for (const side of ['F', 'B']) {
        const hnd = c.parts['hand' + side];
        if (hnd && !hnd.part.severed) hnd.applyImpulse(M.rand(-1, 1) * s.tremor * 0.25 * c.scale, M.rand(-1, 1) * s.tremor * 0.25 * c.scale, hnd.x, hnd.y);
      }
    }
    // limbs soaked in their own blood go numb
    for (const b of c.partList) {
      const p = b.part;
      if (!LIMBS[p.kind]) continue;
      if (p.bleed > 0.3) p.numb = Math.min(0.6, (p.numb || 0) + dt * 0.01 * p.bleed);
      else if (p.numb) p.numb = Math.max(0, p.numb - dt * 0.005);
    }
  }

  // how much of a limb still works beyond its hit points (1 = untouched)
  function limbFactor(p) {
    if (!on()) return 1;
    return (1 - (p.nerve || 0)) * (1 - (p.numb || 0));
  }

  function heal(c) {
    if (c.inj) Object.assign(c.inj, { internal: 0, pain: 0, adrenaline: 0, shock: 0, consc: 1, tremor: 0 });
    c.injStrength = 1;
    if (c.partList) for (const b of c.partList) { b.part.nerve = 0; b.part.numb = 0; }
  }

  // a short, readable summary for the inspector
  function describe(c) {
    if (!alive(c)) return c && c.state === 'dead' ? 'Dead' : '—';
    const s = state(c), out = [];
    const blood = c.blood == null ? 1 : c.blood;
    if (c.headUnder && !c.def.amphibious) out.push(c.air != null && c.air < 6 ? 'drowning' : 'holding breath');
    if (c.unconscious > 0) out.push('unconscious');
    if (s.shock > 0.9) out.push('in deep shock'); else if (s.shock > 0.45) out.push('in shock');
    if (s.internal > 0.25) out.push('bleeding inside');
    if (blood < 0.6) out.push('lost a lot of blood'); else if (blood < 0.85) out.push('lost blood');
    if (s.pain * (1 - 0.75 * s.adrenaline) > 0.6) out.push('in agony'); else if (s.pain > 0.25) out.push('in pain');
    if (s.adrenaline > 0.4) out.push('running on adrenaline');
    const broken = c.partList.filter((b) => b.part.fractured && !b.part.severed).length;
    if (broken) out.push(broken + (broken > 1 ? ' broken bones' : ' broken bone'));
    const nerve = c.partList.filter((b) => (b.part.nerve || 0) > 0.3).length;
    if (nerve) out.push('nerve damage');
    return out.length ? out.join(', ') : 'fine';
  }

  GP.Events.on('character:hurt', (d) => onHurt(d.e, d.part, d.amount, d.type));

  return { update, limbFactor, heal, describe, state, on };
})();
