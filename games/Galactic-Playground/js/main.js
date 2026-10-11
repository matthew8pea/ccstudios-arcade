/* GALACTIC PLAYGROUND — bootstrap: main menu (with a live demo battle behind it) and sandbox entry. */
'use strict';

GP.Main = (() => {
  let game = null;
  let demoT = 0;

  function demoScene() {
    game.loadMap('temple', { empty: true });
    game.active = false;
    const sp = (id, x, y, o) => game.spawn(id, x, y, Object.assign({ silent: true, noUndo: true, loadout: true }, o));
    sp('obiwan', -3, -0.1);
    sp('anakin', -5, -0.1);
    sp('ahsoka', -7, -0.1);
    for (let i = 0; i < 4; i++) sp(i % 2 ? 'b1_droid' : 'b1_commander', 8 + i * 1.6, -0.1, { facing: -1 });
    sp('b2_droid', 15, -0.1, { facing: -1 });
    sp('droideka', 18, -1);
    sp('crate_cargo', 2, -0.6); sp('barrel', 3.2, -0.6);
    game.camera.jumpTo(5, -3.5, 1.05);
    game.camera.bounds = null;
    demoT = 0;
  }

  function showMenu() {
    game.active = false;
    GP.UI.setHudVisible(false);
    GP.UI.openMainMenu();
  }

  function enterSandboxShell() {
    game.active = true;
    game.paused = false; game.slowMo = false; game.fastFwd = false;
    GP.UI.setHudVisible(true);
  }

  function startSandbox(mapId, asked) {
    // maps with lakes or rivers ask how detailed the liquid physics should be
    const def = GP.Maps.get(mapId);
    if (!asked && def && def.liquids && GP.Settings.p.askLiquid !== false && GP.UI.askLiquidQuality) {
      GP.UI.askLiquidQuality(def, () => startSandbox(mapId, true));
      return;
    }
    const load = () => {
      try {
        enterSandboxShell();
        game.loadMap(mapId, { empty: GP.Main.startEmpty ? GP.Main.startEmpty() : !!GP.Settings.play.startEmpty });
        GP.UI.onMapLoaded();
        game.tools.setTool('grab');
        GP.UI.toast(game.map.name + ' loaded. Pick something from the spawn browser to begin.', 'ok');
        if (!GP.Settings.play.tutorialDone) setTimeout(() => GP.UI.startTutorial(), 400);
      } catch (e) {
        console.error(e);
        GP.UI.toast('Could not load map: ' + e.message, 'error');
        showMenu();
      }
    };
    withLoading(def, load);
  }

  // Building a map (and settling its lakes) can take a moment: show a loading screen first, then do the
  // work once it has been drawn. GP.Main.instantLoad skips that (tests call startSandbox directly).
  function withLoading(def, fn) {
    if (GP.Main.instantLoad || typeof requestAnimationFrame === 'undefined') { fn(); return; }
    const liquid = def && def.liquids && GP.Settings.p.liquidQuality !== 'off';
    const el = document.createElement('div');
    el.id = 'loading';
    el.innerHTML = '<div class="ld panel"><div class="spin"></div><div><div class="lt"></div><div class="ls"></div></div></div>';
    el.querySelector('.lt').textContent = 'Loading ' + (def ? def.name : 'map') + '…';
    el.querySelector('.ls').textContent = liquid ? 'Settling the ' + (def.liquids === 'lava' ? 'lava' : 'water') + '. Higher liquid quality takes longer.' : 'Building the level.';
    document.body.appendChild(el);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      try { fn(); } finally { el.classList.add('done'); setTimeout(() => el.remove(), 250); }
    }));
  }

  function toMenu() {
    game.releaseControl();
    demoScene();
    showMenu();
  }

  function boot() {
    const canvas = document.getElementById('game');
    game = new GP.Game(canvas);
    game.tools = new GP.Tools(game);
    if (GP.Mods) GP.Mods.loadAll();   // before the spawn browser is built
    GP.UI.init(game);
    if (GP.Touch) GP.Touch.init(game);
    game.ui = GP.UI;
    window.GAME = game; // handy for debugging from the console
    demoScene();
    showMenu();
    // autosave the sandbox every minute and when the tab is hidden or closed, once the player has done something in it
    const autosave = () => { if (game.active && game.touched) GP.SaveSystem.autosave(game, 'latest'); };
    setInterval(autosave, 60000);
    window.addEventListener('pagehide', autosave);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') autosave(); });
    // keep the demo lively
    setInterval(() => {
      if (game.active) return;
      demoT += 1;
      const alive = game.entities.filter((e) => e.isCharacterLike && e.state !== 'dead');
      const teams = new Set(alive.map((e) => e.team));
      if (demoT > 40 || teams.size < 2) demoScene();
      const c = alive.length ? alive.reduce((a, e) => ({ x: a.x + e.position().x / alive.length, y: a.y + e.position().y / alive.length }), { x: 0, y: 0 }) : { x: 5, y: -3 };
      game.camera.tx = GP.M.clamp(c.x, -30, 30); game.camera.ty = -3.5;
    }, 1000);
  }

  window.addEventListener('error', (e) => {
    if (GP.UI && GP.UI.toast) GP.UI.toast('Error: ' + (e.message || 'unknown') + ' — the sandbox kept running.', 'error');
  });
  const start = () => {
    try { boot(); } catch (e) {
      console.error(e);
      document.body.innerHTML = '<div style="padding:40px;font-family:sans-serif;color:#fff">Galactic Playground failed to start: ' + e.message + '</div>';
    }
  };
  if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', start);
  else start();

  return { showMenu, startSandbox, toMenu, enterSandboxShell, withLoading, startEmpty: null, instantLoad: false };
})();
