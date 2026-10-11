/* GALACTIC PLAYGROUND — touch controls.
 *
 * On phones and tablets the canvas already takes taps as clicks, pinches to zoom, two-finger drags
 * to pan and long presses as right-clicks (see Tools.bindPointer). This adds on-screen buttons for
 * everything else that normally needs a keyboard: a column of editing and time buttons, and a
 * movement pad while you control a character. The buttons press the same bound actions the keys do
 * (GP.Input.trigger / hold), so every feature works the same way.
 *
 * Settings → Controls → Touch controls: Auto (appear on the first touch), On or Off.
 */
'use strict';

GP.Touch = (() => {
  let root = null, bar = null, pad = null, placebar = null, game = null, touched = false, visible = false, secondBtn = null;

  const mode = () => GP.Settings.play.touchControls || 'auto';
  const wanted = () => mode() === 'on' || (mode() === 'auto' && touched);

  // one button: tap = press the action once; hold = keep the action held while the finger is down
  function button(label, title, opts) {
    const b = document.createElement('button');
    b.className = 'tbtn' + (opts.cls ? ' ' + opts.cls : '');
    b.textContent = label;
    b.title = title;
    b.setAttribute('aria-label', title);
    const down = (e) => {
      e.preventDefault(); e.stopPropagation();
      try { b.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      b.classList.add('pressed');
      GP.Audio.ensure();
      if (opts.hold) GP.Input.hold(opts.hold, true);
      if (opts.tap) GP.Input.trigger(opts.tap);
      if (opts.fn) opts.fn(b);
    };
    const up = (e) => {
      e.preventDefault(); e.stopPropagation();
      b.classList.remove('pressed');
      if (opts.hold) GP.Input.hold(opts.hold, false);
    };
    b.addEventListener('pointerdown', down);
    b.addEventListener('pointerup', up);
    b.addEventListener('pointercancel', up);
    b.addEventListener('lostpointercapture', up);
    b.addEventListener('contextmenu', (e) => e.preventDefault());
    return b;
  }

  function build() {
    root = document.createElement('div');
    root.id = 'touchui';
    // editing and time: tap an object first, then a button
    bar = document.createElement('div');
    bar.className = 'touchbar';
    secondBtn = button('2nd', 'Right-click mode: taps act as the right mouse button', { cls: 'toggle', fn: () => {
      const t = game && game.tools;
      if (!t) return;
      t.touchSecondary = !t.touchSecondary;
      secondBtn.classList.toggle('on', t.touchSecondary);
      GP.UI.toast(t.touchSecondary ? 'Right-click mode: taps now act as the right mouse button.' : 'Right-click mode off.', 'ok');
    } });
    bar.append(
      button('Use', 'Activate the last object you touched (ignite, arm, fire, switch)', { tap: 'edit.activate' }),
      button('Frz', 'Freeze / unfreeze the last object you touched', { tap: 'edit.freeze' }),
      button('Dup', 'Duplicate the last object you touched', { tap: 'edit.duplicate' }),
      button('Del', 'Delete the last object you touched', { tap: 'edit.delete', cls: 'danger' }),
      button('Undo', 'Undo', { tap: 'edit.undoSpawn' }),
      secondBtn,
      button('❚❚', 'Play / pause', { tap: 'time.pause' }),
      button('Slow', 'Slow motion', { tap: 'time.slow' }),
      button('Menu', 'Spawn browser', { tap: 'ui.spawnMenu' }),
    );
    // character control: move on the left, actions on the right
    pad = document.createElement('div');
    pad.className = 'touchpad';
    const left = document.createElement('div'); left.className = 'tp-move';
    left.append(
      button('◀', 'Move left', { hold: 'ctl.left', cls: 'big' }),
      button('▶', 'Move right', { hold: 'ctl.right', cls: 'big' }),
    );
    const right = document.createElement('div'); right.className = 'tp-act';
    right.append(
      button('▲', 'Jump / jetpack', { hold: 'ctl.jump', cls: 'big' }),
      button('▼', 'Crouch', { hold: 'ctl.crouch', cls: 'big' }),
      button('Run', 'Run', { hold: 'ctl.run' }),
      button('Use', 'Pick up / enter vehicle', { tap: 'ctl.interact' }),
      button('Drop', 'Drop / throw held item', { tap: 'ctl.drop' }),
      button('Frc', 'Use the Force', { hold: 'ctl.force' }),
      button('Pwr', 'Next Force power', { tap: 'ctl.nextPower' }),
      button('Sbr', 'Ignite / retract lightsaber', { tap: 'ctl.saber' }),
      button('Exit', 'Stop controlling', { tap: 'ctl.release', cls: 'danger' }),
    );
    pad.append(left, right);
    // with something picked in the spawn browser: tap where it should go, then hold a spawn button
    // (hologram) and let go to spawn
    placebar = document.createElement('div');
    placebar.className = 'placebar';
    placebar.append(
      button('◀', 'Hold to preview facing left, let go to spawn', { hold: 'edit.placeLeft', cls: 'big' }),
      button('▶', 'Hold to preview facing right, let go to spawn', { hold: 'edit.placeRight', cls: 'big' }),
      button('Clear', 'Forget the picked item', { tap: 'ui.menu', cls: 'danger' }),
    );
    root.append(bar, pad, placebar);
    (document.getElementById('ui') || document.body).append(root);
  }

  function refresh() {
    const show = !!(game && game.active && wanted());
    if (show && !root) build();
    if (!root) return;
    if (show !== visible) {
      visible = show; root.style.display = show ? '' : 'none';
      document.body.classList.toggle('touch-ui', show);   // hides the keyboard hints
      if (!show) GP.Input.releaseVirtual();
    }
    if (!show) return;
    const controlling = !!(game.controlled && game.tools && game.tools.current === 'control');
    bar.style.display = controlling ? 'none' : '';
    pad.style.display = controlling ? '' : 'none';
    placebar.style.display = !controlling && game.tools && game.tools.placing ? '' : 'none';
    if (secondBtn && game.tools) secondBtn.classList.toggle('on', !!game.tools.touchSecondary);
  }

  return {
    init(g) { game = g; setInterval(refresh, 200); refresh(); },
    noticeTouch() {
      if (touched) return;
      touched = true;
      if (mode() === 'auto') {
        refresh();
        GP.UI.toast('Touch controls: pinch to zoom, drag with two fingers to pan, long-press an object for its menu. Tap an object, then a button on the right.', 'ok');
      }
    },
    refresh,
  };
})();
