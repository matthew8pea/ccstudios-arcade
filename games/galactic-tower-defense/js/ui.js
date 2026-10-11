/* ==========================================================================
   ui.js — menus, HUD, sidebar, overlays and input
   ========================================================================== */
'use strict';

const UI = {
  setup: { map: MAPS[0].id, diff: null },
  hudCache: {},
  selectedKey: '',

  // ================================================================ init
  init() {
    this.buildMenu();
    this.buildTowerList();
    this.buildAbilities();
    this.buildCodex();
    this.bindButtons();
    this.bindBoard();
    this.bindKeys();
    this.refreshMenu();
    this.updateSoundLabels();
  },

  // ================================================================ menu
  buildMenu() {
    const sectors = $('sectorList');
    sectors.innerHTML = '';
    for (const m of MAPS) {
      const card = document.createElement('button');
      card.className = 'sector-card';
      card.dataset.id = m.id;
      card.style.setProperty('--accent', m.theme);
      card.innerHTML = `
        <canvas width="240" height="150"></canvas>
        <div class="sector-info">
          <div class="sector-name">${m.name}</div>
          <div class="sector-desc">${m.desc}</div>
          <div class="sector-meta">${m.paths.length > 1 ? 'Two entry gates' : 'Single lane'} · ${WAVES.length} waves</div>
        </div>`;
      drawMapPreview(card.querySelector('canvas'), m);
      card.onclick = () => { audio.init(); audio.play('click'); this.setup.map = m.id; this.refreshMenu(); };
      sectors.appendChild(card);
    }

    const diffs = $('difficultyList');
    diffs.innerHTML = '';
    for (const d of Object.values(DIFFICULTIES)) {
      const card = document.createElement('button');
      card.className = `diff-card diff-${d.id}`;
      card.dataset.id = d.id;
      card.style.setProperty('--accent', d.color);
      card.innerHTML = `
        <div class="diff-glow"></div>
        <div class="diff-head">
          <span class="diff-icon"><span>${d.icon}</span></span>
          <div>
            <div class="diff-name">${d.name}</div>
            <div class="diff-tier">${d.tier} rank</div>
          </div>
        </div>
        <div class="diff-stats">
          <div class="diff-stat">
            <span class="ds-label">Core integrity</span>
            <span class="ds-val">${d.lives} <small>lives</small></span>
            <span class="ds-bar"><i style="width:${(d.lives / 30) * 100}%"></i></span>
          </div>
          <div class="diff-stat">
            <span class="ds-label">Starting funds</span>
            <span class="ds-val">${d.credits}<small>¢</small></span>
            <span class="ds-bar"><i style="width:${(d.credits / 200) * 100}%"></i></span>
          </div>
        </div>
        <p class="diff-desc">${d.desc}</p>
        <div class="diff-mods">
          <span>Enemy HP ${Math.round(d.hp * 100)}%</span>
          <span>Bounty ${Math.round(d.bounty * 100)}%</span>
        </div>
        <div class="diff-record" data-record></div>`;
      card.onclick = () => { audio.init(); audio.play('click'); this.setup.diff = d.id; this.refreshMenu(); };
      card.onmouseenter = () => audio.play('hover');
      diffs.appendChild(card);
    }
  },

  refreshMenu() {
    for (const c of $('sectorList').children) c.classList.toggle('selected', c.dataset.id === this.setup.map);
    for (const c of $('difficultyList').children) {
      c.classList.toggle('selected', c.dataset.id === this.setup.diff);
      const r = Profile.getRecord(this.setup.map, c.dataset.id);
      c.querySelector('[data-record]').innerHTML = r
        ? `${r.won ? '<b>✦ Cleared</b> · ' : ''}Best wave ${r.bestWave} · ${fmt(r.bestScore)} pts`
        : 'No record on this sector yet';
    }
    const btn = $('btnDeploy');
    btn.disabled = !this.setup.diff;
    const m = MAPS.find(x => x.id === this.setup.map);
    $('deploySummary').textContent = this.setup.diff
      ? `${m.name} · ${DIFFICULTIES[this.setup.diff].name}`
      : 'Pick a difficulty';

    const save = Store.get(SAVE_KEY, null);
    const cont = $('btnContinue');
    cont.disabled = !save || save.v !== 3;
    $('continueInfo').textContent = cont.disabled ? '' :
      `${(MAPS.find(x => x.id === save.map) || MAPS[0]).name} · ${DIFFICULTIES[save.diff].name} · Wave ${save.wave}`;
  },

  showScreen(id) {
    for (const s of document.querySelectorAll('.screen')) s.classList.toggle('active', s.id === id);
  },

  showMenuPanel(id) {
    for (const p of document.querySelectorAll('.menu-panel')) p.classList.toggle('active', p.id === id);
  },

  goToMenu() {
    G.state = 'MENU';
    $('pauseOverlay').classList.remove('show');
    $('endOverlay').classList.remove('show');
    this.refreshMenu();
    this.showMenuPanel('menuMain');
    this.showScreen('menuScreen');
  },

  enterGame() {
    this.hudCache = {};
    this.selectedKey = '';
    $('log').innerHTML = '';
    $('pauseOverlay').classList.remove('show');
    $('endOverlay').classList.remove('show');
    $('hudSector').textContent = `${G.map.name} · ${G.diff.name}`;
    document.documentElement.style.setProperty('--theme', G.map.theme);
    this.showScreen('gameScreen');
    this.refreshWavePreview();
    this.refreshSelected();
    this.updateSoundLabels();
    $('btnSpeed').textContent = `${G.speed}×`;
    $('btnAuto').classList.toggle('on', G.autoWaves);
  },

  startNewGame() {
    audio.init();
    G.newGame(this.setup.map, this.setup.diff);
    this.enterGame();
    this.log(`Commander, welcome to <b>${G.map.name}</b>. Deploy units, then launch the first wave.`);
    this.banner(G.map.name, G.map.theme);
  },

  continueGame() {
    audio.init();
    const save = Store.get(SAVE_KEY, null);
    if (!G.load(save)) { this.refreshMenu(); return; }
    this.enterGame();
    this.log(`Save restored. Wave ${G.wave} cleared, awaiting orders.`);
  },

  // ================================================================ sidebar
  buildTowerList() {
    const list = $('towerList');
    list.innerHTML = '';
    for (const def of Object.values(TOWERS)) {
      const b = document.createElement('button');
      b.className = `tower-btn tier-${def.tier}`;
      b.dataset.id = def.id;
      b.style.setProperty('--unit', def.color);
      b.innerHTML = `
        <span class="tb-key">${def.key}</span>
        <canvas class="tb-icon" width="40" height="40"></canvas>
        <span class="tb-name">${def.name}</span>
        <span class="tb-cost">${def.cost}¢</span>`;
      drawUnitIcon(b.querySelector('canvas'), def);
      b.onclick = () => { audio.init(); this.selectPlacing(def); };
      b.onmouseenter = e => this.showTooltip(e.currentTarget, this.towerTooltip(def));
      b.onmouseleave = () => this.hideTooltip();
      list.appendChild(b);
    }
  },

  towerTooltip(def) {
    const rows = def.support
      ? `<div><span>Aura range</span><b>${def.range}</b></div>`
      : `<div><span>Damage</span><b>${def.damage}</b></div>
         <div><span>Range</span><b>${def.range}${def.minRange ? ` (min ${def.minRange})` : ''}</b></div>
         <div><span>Attacks/sec</span><b>${(1 / def.fireRate).toFixed(2)}</b></div>`;
    return `<div class="tt-head" style="--unit:${def.color}">
              <b>${def.name}</b><span class="tt-tier" style="color:${TIERS[def.tier].color}">${TIERS[def.tier].name}</span>
            </div>
            <p>${def.desc}</p>
            <div class="tt-rows">${rows}<div><span>Cost</span><b>${def.cost}¢</b></div></div>
            ${SYNERGIES[def.id] ? `<p class="tt-syn">⟡ ${SYNERGIES[def.id]}</p>` : ''}`;
  },

  selectPlacing(def) {
    if (G.state !== 'PLAYING' && G.state !== 'PAUSED') return;
    audio.play('click');
    G.targeting = null;
    G.selectedTower = null;
    G.placing = G.placing === def ? null : def;
    this.refreshSelected();
  },

  buildAbilities() {
    const list = $('abilityList');
    list.innerHTML = '';
    for (const ab of Object.values(ABILITIES)) {
      const b = document.createElement('button');
      b.className = 'ability-btn';
      b.dataset.id = ab.id;
      b.style.setProperty('--ab', ab.color);
      b.innerHTML = `
        <span class="ab-ring"></span>
        <span class="ab-icon">${ab.icon}</span>
        <span class="ab-key">${ab.key}</span>
        <span class="ab-cd"></span>`;
      b.onclick = () => { audio.init(); G.useAbility(ab.id); };
      b.onmouseenter = e => this.showTooltip(e.currentTarget,
        `<div class="tt-head"><b>${ab.name}</b><span class="tt-tier">${ab.cooldown}s cooldown</span></div><p>${ab.desc}</p>`);
      b.onmouseleave = () => this.hideTooltip();
      list.appendChild(b);
    }
  },

  refreshWavePreview() {
    if (!G.map) return;
    const next = G.wave + 1;
    const el = $('wavePreview');
    if (!G.endless && next > WAVES.length) {
      $('nextWaveLabel').textContent = 'final wave';
      el.innerHTML = '<div class="wp-empty">No more waves. Destroy what remains!</div>';
      return;
    }
    $('nextWaveLabel').textContent = G.endless ? `wave ${next} · endless` : `wave ${next} / ${WAVES.length}`;
    const groups = next <= WAVES.length ? WAVES[next - 1] : null;
    if (!groups) {
      el.innerHTML = '<div class="wp-empty">Unknown signatures. Endless waves grow stronger every round.</div>';
      return;
    }
    const counts = {};
    for (const g of groups) counts[g.t] = (counts[g.t] || 0) + g.n;
    el.innerHTML = Object.entries(counts).map(([t, n]) => {
      const d = ENEMIES[t];
      return `<div class="wp-item ${d.boss ? 'boss' : ''}" title="${d.desc}">
        <i style="background:${d.color}"></i><span>${d.name}</span><b>×${n}</b></div>`;
    }).join('');
  },

  // Selected unit panel: structure is rebuilt only when the unit or its level changes.
  refreshSelected() {
    const t = G.selectedTower;
    const panel = $('selectedPanel');
    if (!t) { panel.hidden = true; this.selectedKey = ''; return; }
    panel.hidden = false;
    const key = `${G.towers.indexOf(t)}:${t.level}:${t.targetMode}`;
    if (key !== this.selectedKey) {
      this.selectedKey = key;
      const d = t.def;
      const tier = TIERS[d.tier];
      const canTarget = !d.support && d.id !== 'sage';
      $('selectedTowerUI').innerHTML = `
        <div class="sel-head" style="--unit:${d.color};--tier:${tier.color}">
          <canvas width="48" height="48"></canvas>
          <div>
            <div class="sel-name">${d.name}</div>
            <div class="sel-tier">${tier.name} · Level ${t.level}${t.maxed ? ' (max)' : ''}</div>
            <div class="sel-pips">${Array.from({ length: MAX_LEVEL }, (_, i) => `<i class="${i < t.level ? 'on' : ''}"></i>`).join('')}</div>
          </div>
          <button class="sel-close" id="selClose" title="Deselect (Esc)">×</button>
        </div>
        <div class="sel-stats">
          ${d.support
            ? `<div><span>Aura range</span><b>${t.range}</b></div>
               <div><span>${d.id === 'beacon' ? 'Fire rate bonus' : 'Slow'}</span><b>${Math.round((d.id === 'beacon' ? t.auraPower : t.slowPower) * 100)}%</b></div>`
            : `<div><span>Damage</span><b>${t.damage}</b></div>
               <div><span>Range</span><b>${t.range}</b></div>
               <div><span>Attacks/sec</span><b id="selRate"></b></div>
               <div><span>Kills</span><b id="selKills"></b></div>
               <div class="wide"><span>Damage dealt</span><b id="selDealt"></b></div>`}
        </div>
        ${canTarget ? `<div class="sel-target"><span>Targeting <kbd>T</kbd></span><div>${TARGET_MODES.map(m =>
          `<button data-mode="${m}" class="${t.targetMode === m ? 'on' : ''}">${m}</button>`).join('')}</div></div>` : ''}
        <div class="sel-actions">
          <button class="act-upgrade" id="selUpgrade"></button>
          <button class="act-sell" id="selSell"></button>
        </div>`;
      drawUnitIcon($('selectedTowerUI').querySelector('canvas'), d, 48);
      $('selClose').onclick = () => { G.selectedTower = null; this.refreshSelected(); };
      $('selUpgrade').onclick = () => { G.upgradeTower(t); this.refreshSelected(); };
      $('selSell').onclick = () => { G.sellTower(t); this.refreshSelected(); };
      for (const b of document.querySelectorAll('.sel-target button')) {
        b.onclick = () => { t.targetMode = b.dataset.mode; audio.play('click'); this.refreshSelected(); };
      }
    }
    // Live values.
    if ($('selRate')) {
      $('selRate').textContent = (1 / t.interval).toFixed(2) + (t.rateMultiplier > 1 ? ' ▲' : '');
      $('selKills').textContent = t.kills;
      $('selDealt').textContent = fmt(t.damageDealt);
    }
    // Only touch button markup when it changes, so clicks on them are never lost.
    const setHtml = (el, html) => { if (el._html !== html) { el._html = html; el.innerHTML = html; } };
    const up = $('selUpgrade');
    if (t.maxed) {
      setHtml(up, '<span>Max level</span>');
      up.disabled = true;
    } else {
      setHtml(up, `<span>Upgrade <kbd>U</kbd></span><b>${t.upgradeCost}¢</b>`);
      up.disabled = G.credits < t.upgradeCost;
    }
    setHtml($('selSell'), `<span>Sell <kbd>S</kbd></span><b>+${t.sellValue}¢</b>`);
  },

  // ================================================================ HUD
  refreshHud() {
    const c = this.hudCache;
    const set = (id, v) => { if (c[id] !== v) { c[id] = v; $(id).textContent = v; } };
    set('hudCredits', fmt(G.credits));
    set('hudLives', `${G.lives} / ${G.maxLives}`);
    set('hudWave', G.endless ? `${G.wave} ∞` : `${G.wave} / ${WAVES.length}`);
    set('hudScore', fmt(G.score));

    const livesEl = $('hudLives').parentElement;
    const low = G.lives / G.maxLives <= 0.3;
    if (c.low !== low) { c.low = low; livesEl.classList.toggle('danger', low); }

    // Launch button state.
    const btn = $('btnStartWave');
    const early = G.waveActive && G.canLaunch;
    const label = G.state !== 'PLAYING' ? 'Standby'
      : !G.canLaunch ? (G.waveActive ? 'Wave in progress' : 'All waves sent')
      : early ? `Call early +${10 + G.wave * 2}¢` : (G.autoTimer > 0 ? `Next wave ${Math.ceil(G.autoTimer)}…` : 'Launch Wave');
    set('btnStartWave', label);
    btn.disabled = !G.canLaunch;
    btn.classList.toggle('pulse', G.canLaunch && !G.waveActive);

    // Unit affordability.
    const credits = G.credits;
    if (c.credForTowers !== credits || c.placing !== G.placing) {
      c.credForTowers = credits;
      c.placing = G.placing;
      for (const b of $('towerList').children) {
        const def = TOWERS[b.dataset.id];
        b.classList.toggle('poor', credits < def.cost);
        b.classList.toggle('active', G.placing === def);
      }
    }

    // Ability cooldowns.
    for (const b of $('abilityList').children) {
      const id = b.dataset.id;
      const cd = G.cooldowns[id] || 0;
      const pct = cd / ABILITIES[id].cooldown;
      const k = `ab_${id}`;
      const v = `${Math.ceil(cd)}|${G.targeting === id}`;
      b.style.setProperty('--cd', pct);
      if (c[k] !== v) {
        c[k] = v;
        b.classList.toggle('ready', cd <= 0);
        b.classList.toggle('armed', G.targeting === id);
        b.querySelector('.ab-cd').textContent = cd > 0 ? Math.ceil(cd) : '';
      }
    }

    if (G.selectedTower && !G.towers.includes(G.selectedTower)) G.selectedTower = null;
    this.refreshSelected();
  },

  // ================================================================ feedback
  log(html) {
    const el = $('log');
    const line = document.createElement('div');
    line.className = 'log-line';
    line.innerHTML = html;
    el.prepend(line);
    while (el.children.length > 40) el.lastChild.remove();
  },

  toast(msg, kind = '') {
    const t = $('toast');
    t.textContent = msg;
    t.className = `toast show ${kind}`;
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => t.classList.remove('show'), 1800);
  },

  banner(text, color = '#5bb8ff', small = false) {
    const b = $('waveBanner');
    b.textContent = text;
    b.style.setProperty('--banner', color);
    b.classList.remove('show', 'small');
    void b.offsetWidth;   // restart the CSS animation
    b.classList.add('show');
    if (small) b.classList.add('small');
  },

  achievement(a) {
    const el = document.createElement('div');
    el.className = 'ach-popup';
    el.innerHTML = `<span class="ach-star">✦</span><div><small>Achievement unlocked</small><b>${a.name}</b><span>${a.desc}</span></div>`;
    // Stack popups when several unlock at once.
    el.style.top = `${80 + document.querySelectorAll('.ach-popup').length * 78}px`;
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 500); }, 3600);
  },

  showEnd(won) {
    const s = G.stats;
    $('endBadge').innerHTML = `<span>${won ? '✦' : '✕'}</span>`;
    $('endBadge').className = `end-badge ${won ? 'won' : 'lost'}`;
    $('endTitle').textContent = won ? 'Sector Secured' : 'The Core Has Fallen';
    $('endText').textContent = won
      ? `All ${WAVES.length} waves repelled on ${G.diff.name} with ${G.lives} of ${G.maxLives} integrity remaining.`
      : `The swarm broke through on wave ${G.wave}. Regroup and try again, Commander.`;
    $('endStats').innerHTML = [
      ['Score', fmt(G.score)], ['Enemies destroyed', fmt(s.kills)], ['Bosses destroyed', s.bosses],
      ['Credits earned', fmt(s.earned) + '¢'], ['Units deployed', s.built], ['Interest earned', s.interest + '¢']
    ].map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('');
    $('btnEndless').hidden = !won;
    $('endOverlay').classList.add('show');
  },

  togglePause(force) {
    if (G.state !== 'PLAYING' && G.state !== 'PAUSED') return;
    const pause = force !== undefined ? force : G.state === 'PLAYING';
    G.state = pause ? 'PAUSED' : 'PLAYING';
    $('pauseOverlay').classList.toggle('show', pause);
    $('btnPause').textContent = pause ? '▶' : '❚❚';
    audio.play('click');
  },

  toggleSpeed() {
    G.speed = G.speed === 1 ? 2 : G.speed === 2 ? 3 : 1;
    $('btnSpeed').textContent = `${G.speed}×`;
    $('btnSpeed').classList.toggle('on', G.speed > 1);
    audio.play('click');
  },

  toggleAuto() {
    G.autoWaves = !G.autoWaves;
    $('btnAuto').classList.toggle('on', G.autoWaves);
    if (G.autoWaves && !G.waveActive && G.canLaunch) G.autoTimer = 3;
    if (!G.autoWaves) G.autoTimer = 0;
    this.toast(G.autoWaves ? 'Auto waves on' : 'Auto waves off');
    audio.play('click');
  },

  toggleMute() {
    audio.init();
    audio.setMuted(!audio.muted);
    this.updateSoundLabels();
  },

  updateSoundLabels() {
    $('soundLabel').textContent = `Sound: ${audio.muted ? 'Off' : 'On'}`;
    $('btnMute').textContent = audio.muted ? '✕' : '♪';
    $('btnMute').classList.toggle('on', !audio.muted);
  },

  // ================================================================ tooltip
  showTooltip(anchor, html) {
    const tip = $('tooltip');
    tip.innerHTML = html;
    tip.classList.add('show');
    const r = anchor.getBoundingClientRect();
    const tw = tip.offsetWidth, th = tip.offsetHeight;
    let x = r.left - tw - 10;
    if (x < 8) x = Math.min(window.innerWidth - tw - 8, r.right + 10);
    const y = clamp(r.top + r.height / 2 - th / 2, 8, window.innerHeight - th - 8);
    tip.style.left = `${x}px`;
    tip.style.top = `${y}px`;
  },
  hideTooltip() { $('tooltip').classList.remove('show'); },

  // ================================================================ modals
  openModal(id) {
    audio.init();
    audio.play('click');
    if (id === 'archivesModal') this.renderArchives();
    $(id).classList.add('show');
  },

  renderArchives() {
    const ach = Profile.data.achievements;
    const unlocked = ACHIEVEMENTS.filter(a => ach[a.id]).length;
    $('achCount').textContent = `${unlocked} / ${ACHIEVEMENTS.length}`;
    $('achievementList').innerHTML = ACHIEVEMENTS.map(a => `
      <div class="ach ${ach[a.id] ? 'on' : ''}">
        <span class="ach-icon">${ach[a.id] ? '✦' : '◇'}</span>
        <div><b>${a.name}</b><span>${a.desc}</span></div>
      </div>`).join('');
    $('recordsList').innerHTML = `<table>
      <tr><th>Sector</th>${Object.values(DIFFICULTIES).map(d => `<th style="color:${d.color}">${d.name}</th>`).join('')}</tr>
      ${MAPS.map(m => `<tr><td>${m.name}</td>${Object.values(DIFFICULTIES).map(d => {
        const r = Profile.getRecord(m.id, d.id);
        return `<td>${r ? `${r.won ? '✦ ' : ''}W${r.bestWave} · ${fmt(r.bestScore)}` : '—'}</td>`;
      }).join('')}</tr>`).join('')}
    </table>
    <p class="records-foot">${fmt(Profile.data.totalKills)} enemies destroyed · ${Profile.data.wins} sectors secured</p>`;
  },

  buildCodex() {
    $('enemyCodex').innerHTML = Object.entries(ENEMIES).map(([id, e]) => `
      <div class="codex-item ${e.boss ? 'boss' : ''}">
        <i style="background:${e.color}"></i>
        <div><b>${e.name}</b><span>${e.desc} Breach cost: ${e.lifeCost}.</span></div>
      </div>`).join('');
  },

  // ================================================================ bindings
  bindButtons() {
    $('btnNewGame').onclick = () => { audio.init(); audio.play('click'); this.showMenuPanel('menuSetup'); this.refreshMenu(); };
    $('btnContinue').onclick = () => this.continueGame();
    $('btnArchives').onclick = () => this.openModal('archivesModal');
    $('btnManual').onclick = () => this.openModal('manualModal');
    $('btnSound').onclick = () => this.toggleMute();
    $('btnSetupBack').onclick = () => { audio.play('click'); this.showMenuPanel('menuMain'); };
    $('btnDeploy').onclick = () => this.startNewGame();

    $('btnStartWave').onclick = () => { audio.init(); G.startWave(); };
    $('btnAuto').onclick = () => this.toggleAuto();
    $('btnSpeed').onclick = () => this.toggleSpeed();
    $('btnPause').onclick = () => this.togglePause();
    $('btnMute').onclick = () => this.toggleMute();
    $('btnMenu').onclick = () => this.togglePause(true);

    $('btnResume').onclick = () => this.togglePause(false);
    $('btnSave').onclick = () => {
      const r = G.save();
      this.toast(r === 'saved' ? 'Game saved.' : r === 'checkpoint' ? `Saved at the start of wave ${G.wave}.` : 'Could not save in this browser.', r === 'failed' ? 'bad' : 'good');
    };
    $('btnRestart').onclick = () => {
      if (!confirm('Restart this sector from wave 1?')) return;
      G.newGame(G.map.id, G.diff.id);
      this.enterGame();
      this.log('Sector restarted.');
    };
    $('btnQuit').onclick = () => { G.save(); this.goToMenu(); };

    $('btnEndless').onclick = () => { $('endOverlay').classList.remove('show'); G.startEndless(); };
    $('btnPlayAgain').onclick = () => { G.newGame(G.map.id, G.diff.id); this.enterGame(); };
    $('btnEndMenu').onclick = () => this.goToMenu();

    for (const m of document.querySelectorAll('.modal')) {
      m.addEventListener('click', e => {
        if (e.target === m || e.target.hasAttribute('data-close')) m.classList.remove('show');
      });
    }
  },

  boardPoint(ev) {
    const r = canvas.getBoundingClientRect();
    return {
      x: (ev.clientX - r.left) * (BOARD_W / r.width),
      y: (ev.clientY - r.top) * (BOARD_H / r.height)
    };
  },

  bindBoard() {
    canvas.addEventListener('mousemove', ev => {
      const p = this.boardPoint(ev);
      G.mouse.x = p.x; G.mouse.y = p.y; G.mouse.inside = true;
      canvas.style.cursor = (!G.placing && !G.targeting && G.towerAt(p.x, p.y)) ? 'pointer' : 'crosshair';
    });
    canvas.addEventListener('mouseleave', () => { G.mouse.inside = false; });
    canvas.addEventListener('contextmenu', ev => { ev.preventDefault(); this.cancelAction(); });

    canvas.addEventListener('click', ev => {
      if (G.state !== 'PLAYING' && G.state !== 'PAUSED') return;
      audio.init();
      const { x, y } = this.boardPoint(ev);
      G.mouse.x = x; G.mouse.y = y; G.mouse.inside = true;

      if (G.targeting) {
        if (G.state === 'PLAYING') G.useAbility(G.targeting, x, y);
        return;
      }
      if (G.placing) {
        if (G.placeTower(G.placing, x, y) && !ev.shiftKey) G.placing = null;
        return;
      }
      const t = G.towerAt(x, y);
      G.selectedTower = t;
      if (t) audio.play('click');
      this.refreshSelected();
    });
  },

  cancelAction() {
    if (G.placing || G.targeting || G.selectedTower) {
      G.placing = null; G.targeting = null; G.selectedTower = null;
      this.refreshSelected();
      return true;
    }
    return false;
  },

  bindKeys() {
    window.addEventListener('keydown', e => {
      if (e.target.tagName === 'INPUT') return;
      // Close any open modal first.
      if (e.key === 'Escape') {
        const open = document.querySelector('.modal.show');
        if (open) { open.classList.remove('show'); return; }
      }
      if (G.state === 'MENU' || G.state === 'OVER' || G.state === 'WON') return;
      const k = e.key.toLowerCase();

      const def = Object.values(TOWERS).find(d => d.key === e.key);
      if (def) { this.selectPlacing(def); e.preventDefault(); return; }

      switch (k) {
        case ' ':      e.preventDefault(); if (G.state === 'PLAYING') G.startWave(); break;
        case 'escape': if (!this.cancelAction()) this.togglePause(); break;
        case 'p':      this.togglePause(); break;
        case 'f':      this.toggleSpeed(); break;
        case 'a':      this.toggleAuto(); break;
        case 'm':      this.toggleMute(); break;
        case 'u':      G.upgradeTower(G.selectedTower); this.refreshSelected(); break;
        case 's':      if (G.selectedTower) { G.sellTower(G.selectedTower); this.refreshSelected(); } break;
        case 't':      G.cycleTarget(G.selectedTower); this.refreshSelected(); break;
        case 'q':      G.useAbility('lance'); break;
        case 'w':      G.useAbility('freeze'); break;
        case 'e':      G.useAbility('overclock'); break;
      }
    });
  }
};

// ---- Little canvas renderings for menus and buttons ----
function drawMapPreview(cv, m) {
  const c = cv.getContext('2d');
  const sx = cv.width / BOARD_W, sy = cv.height / BOARD_H;
  const g = c.createLinearGradient(0, 0, cv.width, cv.height);
  g.addColorStop(0, hexToRgba(m.nebula[0], 0.9));
  g.addColorStop(1, hexToRgba(m.nebula[1], 0.9));
  c.fillStyle = '#060b18';
  c.fillRect(0, 0, cv.width, cv.height);
  c.globalAlpha = 0.5;
  c.fillStyle = g;
  c.fillRect(0, 0, cv.width, cv.height);
  c.globalAlpha = 1;
  for (let i = 0; i < 40; i++) {
    c.fillStyle = `rgba(255,255,255,${rand(0.2, 0.8)})`;
    c.fillRect(rand(0, cv.width), rand(0, cv.height), 1, 1);
  }
  for (const [w, col] of [[14, hexToRgba(m.theme, 0.25)], [9, m.theme], [5, '#0a1122']]) {
    c.lineWidth = w; c.strokeStyle = col; c.lineJoin = 'round'; c.lineCap = 'round';
    for (const path of m.paths) {
      c.beginPath();
      path.forEach((p, i) => i ? c.lineTo(p.x * sx, p.y * sy) : c.moveTo(p.x * sx, p.y * sy));
      c.stroke();
    }
  }
}

function drawUnitIcon(cv, def, size = 40) {
  const c = cv.getContext('2d');
  const r = size / 2;
  c.clearRect(0, 0, size, size);
  c.save();
  c.translate(r, r);
  c.fillStyle = '#0c1424';
  c.strokeStyle = TIERS[def.tier].color;
  c.lineWidth = 2;
  c.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = Math.PI / 6 + (i / 6) * Math.PI * 2;
    c.lineTo(Math.cos(a) * r * 0.85, Math.sin(a) * r * 0.85);
  }
  c.closePath(); c.fill(); c.stroke();
  const g = c.createRadialGradient(0, 0, 1, 0, 0, r * 0.5);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.35, def.color);
  g.addColorStop(1, hexToRgba(def.color, 0.2));
  c.fillStyle = g;
  c.beginPath(); c.arc(0, 0, r * 0.45, 0, Math.PI * 2); c.fill();
  c.restore();
}

// ---- Boot ----
UI.init();
requestAnimationFrame(frame);
