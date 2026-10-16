/*  THE SNAP â main-menu intro for Galactic Legends
 *  ------------------------------------------------
 *  Drop-in, dependency-free. Requires:
 *    â¢ window.SpriteKit  (sprite-kit.js â already loaded by index.html)
 *    â¢ #splashMenu, #btnCreator                  (existing splash markup)
 *    â¢ #btnKamino inside .splash-kamino-slot     (new markup â see kamino-tile.html)
 *    â¢ the keyframes/classes in snap-intro.css
 *
 *  Load AFTER sprite-kit.js and game.js:
 *      <script src="snap-intro.js?v=1"></script>
 *  and call SnapIntro.maybePlay() at the end of showSplashMenu() in game.js.
 *
 *  Everything is drawn/animated in an overlay inside #splashMenu; nothing here
 *  touches the save, the roster, or any game state.
 */
window.SnapIntro = (function () {
  'use strict';

  var CFG = {
    thanosScale: 3,            // 18px * scale = his body radius (CHARACTER_SIZE contract)
    thanosColor: '#8e5bd0',
    gauntletColor: '#ffd34d',
    dustCount: 190,
    once: 'save',              // 'session' | 'always' | 'save'  (see maybePlay)
    trigger: 'click',          // 'click' = wait for the player | 'auto' = on load
    startDelay: 1600,          // 'auto' only; a click plays immediately
    permanent: true            // the tile stays gone and Kamino stays, per save
  };

  var el = {}, th = null, raf = 0, seq = [], busy = false, mounted = false;

  /* ââ mount: one canvas + three overlay layers inside #splashMenu âââââââââ */
  function mount() {
    if (mounted) return true;
    el.splash = document.getElementById('splashMenu');
    el.zp      = document.getElementById('btnCreator');      // "The Zero Point" tile
    el.kamino  = document.getElementById('btnKamino');
    if (!el.splash || !el.zp || !el.kamino || !window.SpriteKit) return false;

    el.dust  = add('div', 'snap-layer-dust');
    el.shade = add('div', 'snap-layer-shade');
    el.cv    = add('canvas', 'snap-layer-canvas');
    el.flash = add('div', 'snap-layer-flash');
    el.ctx = el.cv.getContext('2d');
    window.addEventListener('resize', size);
    size();
    th = { on: false, x: 0, y: 0, ang: Math.PI, state: 'idle', tw: null, snapAt: 0, chargeAt: 0 };
    loop();
    mounted = true;
    return true;
  }

  function add(tag, cls) {
    var n = document.createElement(tag);
    n.className = cls;
    el.splash.appendChild(n);
    return n;
  }

  function size() {
    if (!el.cv) return;
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    el.w = el.splash.clientWidth;
    el.h = el.splash.clientHeight;
    el.cv.width = Math.round(el.w * dpr);
    el.cv.height = Math.round(el.h * dpr);
    el.cv.style.width = el.w + 'px';
    el.cv.style.height = el.h + 'px';
    el.ctx = el.cv.getContext('2d');
    el.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /*  For a save that has already seen the Snap: drop straight to the end state,
   *  as early as the DOM allows. This needs no measurement and no canvas, so it
   *  can run at DOMContentLoaded â long before maybePlay(), which has to wait
   *  for the loading screen to lift before it can size anything. Without it the
   *  retired tiles are painted for the whole of every load and then pop out. */
  function applyIfSnapped() {
    if (!CFG.permanent) return false;
    try { if (localStorage.getItem('gl-snap-intro') !== '1') return false; } catch (e) { return false; }
    if (!mount()) return false;
    settleAftermath();
    return true;
  }

  /** Has this save (or session) already had its Snap? */
  function alreadySeen() {
    try {
      if (CFG.once === 'session') return sessionStorage.getItem('gl-snap-intro') === '1';
      if (CFG.once === 'save')    return localStorage.getItem('gl-snap-intro') === '1';
    } catch (e) {}
    return false;
  }

  function markSeen() {
    try {
      if (CFG.once === 'session') sessionStorage.setItem('gl-snap-intro', '1');
      else if (CFG.once === 'save') localStorage.setItem('gl-snap-intro', '1');
    } catch (e) {}
  }

  var armed = false;

  /*  Waiting for a click rather than a timer is not only kinder â it is what
   *  makes the soundtrack possible. Browsers refuse to play audio until the
   *  page has had a real user gesture, so an intro that started itself on load
   *  would run its downbeat cue into a muted element every time.             */
  function armTrigger() {
    if (armed || !el.splash) return;
    armed = true;
    lockTiles(true);
  }

  /*  Only clears the *trigger*. It does not touch the click gate â lockTiles owns
   *  that, and it has to stay up through the sequence.                         */
  function disarm() {
    armed = false;
  }

  /*  The gate, for the whole time the tiles are locked: while the Snap is owed and
   *  while it is playing. Armed, the first click is the summons â wherever it
   *  lands. It used to step aside for clicks on the tiles, which meant the player
   *  who went straight for Freeplay, the obvious thing to do, never saw the intro
   *  at all. The tiles are not a way past him; they are what he is here for.
   *
   *  Once it is running the click is simply swallowed. Letting a tile through
   *  mid-sequence dropped the player into the game over the top of the animation
   *  and left the menu half-changed behind them.
   *
   *  Capture, not bubble. A click reaches a tile three different ways â the mouse,
   *  Enter on a focused tile, and the synthetic el.click() navActivate() fires for
   *  the gamepad â and capturing at the menu catches all three before the tile's
   *  own handler can run, because capture runs top-down. Doing it here rather than
   *  in CSS is what lets the tiles keep their hover sheen and their cursor while
   *  they are locked: they are still live elements, they just do not lead anywhere
   *  yet.                                                                      */
  function onSplashClick(e) {
    e.preventDefault();
    e.stopPropagation();
    if (!armed) return;               // mid-sequence: swallowed, and that is all
    disarm();
    play();
  }

  /*  Marks the tiles as not-yet-live, and owns the click gate above â the listener
   *  is tied to the lock rather than to `armed` so that it survives play().
   *
   *  Deliberately no `disabled` property: that would grey the tiles out, kill the
   *  hover, and drop them from getNavigables(), which filters on !el.disabled â
   *  stranding a controller-only player on a menu with nothing focusable and no way
   *  to summon him. aria-disabled says the same thing to a screen reader without
   *  any of that; .snap-pending is a state hook.                               */
  function lockTiles(on) {
    if (!el.splash) return;
    el.splash.classList.toggle('snap-pending', !!on);
    // Re-adding an identical listener (same function, same phase) is a no-op per
    // spec, so play() calling this after armTrigger() already did costs nothing.
    if (on) el.splash.addEventListener('click', onSplashClick, true);
    else el.splash.removeEventListener('click', onSplashClick, true);
    var tiles = el.splash.querySelectorAll('.splash-btn');
    Array.prototype.forEach.call(tiles, function (b) {
      if (on) b.setAttribute('aria-disabled', 'true');
      else b.removeAttribute('aria-disabled');
    });
  }

  /* ââ entry point: call from showSplashMenu() âââââââââââââââââââââââââââââ */
  function maybePlay() {
    // Reduced motion skips the SEQUENCE, not what the sequence does. Once the
    // Snap is a permanent change to the menu rather than decoration, honouring
    // the setting by leaving two retired tiles on screen would give these
    // players a different game, not a calmer one. They get the end state, with
    // none of the shake, flash or dust that the setting is actually about.
    if (document.body.classList.contains('reduced-motion')) {
      skip();
      return;
    }
    if (!mount()) return;
    if (alreadySeen()) { if (CFG.permanent) settleAftermath(); return; }
    // Nothing is written to the save here â the flag is set when Kamino lands, so
    // a player who never clicks, and a player who leaves part-way through, both
    // keep their showing and get the whole sequence again next time.
    if (CFG.trigger === 'click') armTrigger();
    else setTimeout(play, CFG.startDelay);
  }

  /*  The end state with none of the sequence. Reduced motion takes this road
   *  from maybePlay() above, and game.js takes it on every showing while the
   *  intro is vaulted (SNAP_INTRO_VAULTED there): the menu the Snap leaves
   *  behind, from the first paint, with no click owed to anybody.
   *
   *  It never arms the trigger, so the tiles are live straight away. play() is
   *  not touched by any of this and still runs the whole sequence on request,
   *  which is how the THANOS code and the dev menu bring him back.
   *
   *  settleAftermath() marks the save as having had its Snap, and that is on
   *  purpose: snapHasHappened() in game.js is what retires the Zero Point arena
   *  and renames the creator Kamino, so a skipped save has to read as snapped or
   *  the menu and the screens behind it would disagree.                     */
  function skip() {
    disarm();
    if (CFG.permanent && mount()) settleAftermath();
  }

  /*  The permanent end state, applied either instantly (a save that has already
   *  seen the intro) or at the tail of the sequence.
   *
   *  #btnCreator is hidden with visibility rather than display: it is the only
   *  in-flow child of .splash-kamino-slot, so display:none collapses the slot to
   *  zero height and takes the absolutely-positioned Kamino tile with it.
   *  visibility:hidden keeps the box, and still removes the button from painting,
   *  from hit-testing and from getNavigables() â checkVisibility() reports it
   *  hidden, so the gamepad cannot land on it either.                          */
  /*  Hands the tile back to the stylesheet: the landed Kamino is not a special
   *  state, it is an ordinary splash tile, and this is the line that makes it one.
   *
   *  The drop and the impact squash have to be driven by inline transform/
   *  transition (see dropKamino) â a CSS transition gets coalesced away. But
   *  inline styles outrank every rule in styles.css, so leaving them on pins the
   *  tile at `translateY(0) scale(1,1)` with a transform-only transition for the
   *  rest of the session: it can never take the 2px hover lift, and its border and
   *  glow snap where every tile beside it eases. That is why it did not feel like
   *  the others even though it is built out of the same class.
   *
   *  transition is killed for the frame the class flips because .splash-btn
   *  carries `transition: all 0.18s`. Without that, the load-time restore for a
   *  save that has already seen the Snap would fade the tile up and slide it 360px
   *  down â a sixth of the intro, replayed on every load. Reading offsetWidth
   *  flushes the change so the landed state is the *start* state rather than the
   *  end of a transition; clearing the property afterwards hands hover its ease.
   *
   *  Idempotent, and called from both ends on purpose: settleAftermath() is
   *  scheduled off play(), while the tail of landKamino() is scheduled off the
   *  fall finishing, so neither can be relied on to run second.                */
  function releaseKamino() {
    var k = el.kamino;
    k.style.transition = 'none';
    k.style.transform = '';
    k.style.opacity = '';
    k.style.pointerEvents = '';
    k.classList.add('is-landed');
    void k.offsetWidth;
    k.style.transition = '';
  }

  function settleAftermath() {
    if (busy) return;                 // never yank the layout mid-sequence
    el.zp.classList.add('is-snapped');
    releaseKamino();
    // Applying the end state means the Snap happened, so this is also a backstop
    // for the mark above: if fall.onfinish were ever missed, the save still
    // settles here rather than replaying the intro forever. It runs at the tail
    // of the sequence, ~1.5s after touchdown, so it can only ever mark later than
    // landKamino() does â never earlier.
    markSeen();
    // Unlocked here rather than when Kamino touches down, because this is the
    // same beat that puts visibility:hidden on the dusted Zero Point tile. Until
    // that lands the tile is only eroded to nothing by its animation â still a
    // full-size hit target â and an early unlock would hand the player an
    // invisible button over the new one.
    lockTiles(false);
  }

  function after(ms, fn) { seq.push(setTimeout(fn, ms)); }

  /*  The sequence says what it is doing and lets game.js decide what that means.
   *  Audio lives in game.js's closure and is none of this file's business, so
   *  the cue travels as an event rather than as a reach across the boundary. */
  function emit(name, detail) {
    try { document.dispatchEvent(new CustomEvent('snapintro:' + name, { detail: detail || null })); } catch (e) {}
  }

  /*  When the tile touches down, measured from play():
   *      3000  play -> snap
   *    + 4300  snap -> the drop begins   (1900 stand + 1900 walk-off + 500)
   *    +  620  the fall itself
   *  Published on the start cue so anything that wants to line up with the
   *  impact can schedule against it.                                        */
  var LAND_AT_MS = 3000 + 4300 + 620;

  function reset() {
    seq.forEach(clearTimeout); seq = []; busy = false;
    disarm();
    lockTiles(false);
    if (!mounted) return;
    th.on = false; th.tw = null; th.ang = Math.PI; th.state = 'idle'; th.snapAt = 0; th.chargeAt = 0;
    el.zp.style.animation = 'none'; el.zp.style.clipPath = 'inset(0 0 0 0)'; el.zp.style.filter = 'none';
    el.zp.classList.remove('is-snapped');
    // Dropping .is-landed is now the whole park â the offset, the fade and the
    // dead pointer all live on .splash-btn-kamino:not(.is-landed), so restating
    // them here would be a second copy of -360px to keep in step with the first.
    // transition stays suppressed for the flip for the same reason it is in
    // settleAftermath(): otherwise the tile eases back up over 180ms.
    el.kamino.style.transition = 'none';
    el.kamino.style.transform = '';
    el.kamino.style.opacity = '';
    el.kamino.style.pointerEvents = '';
    el.kamino.classList.remove('is-landed');
    el.flash.style.transition = 'none'; el.flash.style.opacity = '0';
    el.shade.style.opacity = '0';
    el.splash.style.animation = 'none';
    el.dust.innerHTML = '';
  }

  /* ââ 1 Â· Thanos walks in from the right ââââââââââââââââââââââââââââââââââ */
  function play() {
    if (busy || !mount()) return;
    busy = true; seq = []; size();
    lockTiles(true);          // no-op when armTrigger() already did it
    emit('start', { landInMs: LAND_AT_MS });
    var r = el.zp.getBoundingClientRect(), s = el.splash.getBoundingClientRect();
    var rad = 18 * CFG.thanosScale;
    th.on = true; th.ang = Math.PI; th.snapAt = 0; th.chargeAt = 0;
    th.y = Math.min(el.h - rad - 14, r.top - s.top + r.height / 2 + 6);
    th.x = el.w + rad + 40;
    el.shade.style.opacity = '1';
    walkTo(Math.max(el.w * 0.62, el.w - rad - 34), 2100, function () { th.chargeAt = performance.now(); });
    after(3000, snap);
  }

  function walkTo(x, dur, then) {
    th.state = 'walk';
    th.tw = { x0: th.x, x1: x, t0: performance.now(), dur: dur, then: then };
  }

  /* ââ 2 Â· the snap: the tile erodes and he leaves ââââââââââââââââââââââââââ */
  function snap() {
    th.chargeAt = 0;
    th.snapAt = performance.now();
    el.flash.style.transition = 'opacity 90ms ease-out';
    el.flash.style.opacity = '0.85';
    el.splash.style.animation = 'gl-shake 560ms cubic-bezier(0.2,0,0.3,1)';

    spawnDust(el.zp, ['#8fbcff', '#cfe1ff', '#5b7fd8', '#17306b', '#a98cff']);
    el.zp.style.animation = 'gl-erode 900ms cubic-bezier(0.4,0,0.7,0.2) forwards';

    after(170, function () { el.flash.style.transition = 'opacity 700ms ease'; el.flash.style.opacity = '0'; });

    var walkOff = 1900;
    after(1900, function () {
      th.snapAt = 0; th.ang = 0;
      walkTo(el.w + 18 * CFG.thanosScale + 60, walkOff, function () { th.on = false; });
      el.shade.style.opacity = '0';
    });

    // 3 Â· half a second after he is off the screen, Kamino drops in
    after(1900 + walkOff + 500, dropKamino);
    after(1900 + walkOff + 2600, function () {
      busy = false;
      // Unconditional: settleAftermath() is the usual way the tiles come back,
      // but it is gated on CFG.permanent and the menu must not be left inert
      // just because the Snap was configured not to stick.
      lockTiles(false);
      // Hand the end state over to the classes, so a reload reproduces exactly
      // what the sequence left behind rather than an approximation of it.
      if (CFG.permanent) settleAftermath();
      /*  The sequence is over and the menu is its new self. Deliberately a cue
       *  rather than a call: what goes up after the Snap is game.js's business,
       *  and this file still does not know that a season card exists.
       *
       *  Fired here and nowhere else, which is what makes it safe to hang a
       *  one-time card off. settleAftermath() also runs for a save that has
       *  already seen the intro â on every single load â so listening to that
       *  would put the card up again every time. This only fires at the tail of
       *  a sequence that actually played.                                    */
      emit('done');
    });
    after(1900 + walkOff + 3400, function () { el.dust.innerHTML = ''; });
  }

  /* ââ 3 Â· the drop.  NOTE: driven by element.animate(), NOT a CSS
   *  transition â setting the start transform and the transition in the same
   *  frame gets coalesced by the browser and the fall is skipped entirely. */
  function dropKamino() {
    var k = el.kamino;
    k.style.transition = 'none';
    k.style.transform = 'none';
    var r = k.getBoundingClientRect(), s = el.splash.getBoundingClientRect();
    var above = (r.top - s.top) + r.height + 40;
    k.style.opacity = '1';
    k.style.transform = 'translateY(0)';
    var fall = k.animate(
      [{ transform: 'translateY(' + (-above) + 'px)' }, { transform: 'translateY(0)' }],
      { duration: 620, easing: 'cubic-bezier(0.5,0,0.95,0.55)', fill: 'backwards' }
    );
    fall.onfinish = landKamino;
  }

  function landKamino() {
    // Fired first, before any of the impact dressing: this is the frame the tile
    // touches down, and the downbeat is supposed to land on it.
    emit('land');
    /*  And this is the frame the Snap counts as having happened. It used to be
     *  marked at the top of play(), which spent the intro the instant it began:
     *  anyone who closed the tab, reloaded, or was pulled away mid-sequence came
     *  back to a menu that had only half changed and no way to ever see the rest.
     *  Nothing before this line writes to the save, so an exit at any point up to
     *  touchdown simply replays the whole thing from the beginning â which is the
     *  right trade: showing it twice costs eight seconds, losing it costs the
     *  only time it ever plays.                                               */
    markSeen();
    var k = el.kamino;
    el.splash.style.animation = 'none';
    requestAnimationFrame(function () { el.splash.style.animation = 'gl-slam 360ms cubic-bezier(0.2,0,0.3,1)'; });
    k.style.transition = 'transform 90ms ease-out';
    k.style.transform = 'translateY(0) scale(1.05, 0.86)';
    spawnImpact(k);
    after(90, function () {
      k.style.transition = 'transform 340ms cubic-bezier(0.22,1.5,0.4,1)';
      k.style.transform = 'translateY(0) scale(1,1)';
      k.style.pointerEvents = 'auto';
      // The overshoot is the last thing the intro does to this tile. Once it has
      // played out, drop the inline styling so the tile becomes an ordinary
      // splash button â hover lift and all. See releaseKamino().
      after(340, releaseKamino);
    });
  }

  /* ââ particles âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ */
  function spawnDust(target, colors) {
    var r = target.getBoundingClientRect(), s = el.splash.getBoundingClientRect();
    var frag = document.createDocumentFragment();
    for (var i = 0; i < CFG.dustCount; i++) {
      var x = Math.random(), y = Math.random();
      var size = Math.random() * 3.2 + 1.1;
      var p = document.createElement('div');
      p.style.cssText = 'position:absolute;opacity:0;' +
        'left:' + (r.left - s.left + x * r.width) + 'px;top:' + (r.top - s.top + y * r.height) + 'px;' +
        'width:' + size + 'px;height:' + size + 'px;border-radius:' + (Math.random() < 0.45 ? '50%' : '1px') + ';' +
        'background:' + colors[(Math.random() * colors.length) | 0] + ';' +
        'box-shadow:0 0 ' + (size * 2.4).toFixed(1) + 'px rgba(162,116,255,0.55);' +
        '--dx:' + (30 + Math.random() * 210).toFixed(0) + 'px;--dy:' + (-(30 + Math.random() * 190)).toFixed(0) + 'px;' +
        '--rot:' + ((Math.random() - 0.5) * 240).toFixed(0) + 'deg;' +
        'animation:gl-dust ' + ((1000 + Math.random() * 900) | 0) + 'ms cubic-bezier(0.25,0.6,0.3,1) ' +
        (((1 - x) * 720) | 0) + 'ms forwards;';
      frag.appendChild(p);
    }
    el.dust.appendChild(frag);
  }

  function spawnImpact(target) {
    var r = target.getBoundingClientRect(), s = el.splash.getBoundingClientRect();
    var frag = document.createDocumentFragment();
    for (var i = 0; i < 46; i++) {
      var x = Math.random(), side = x < 0.5 ? -1 : 1;
      var size = Math.random() * 2.6 + 1;
      var p = document.createElement('div');
      p.style.cssText = 'position:absolute;opacity:0;' +
        'left:' + (r.left - s.left + x * r.width) + 'px;top:' + (r.bottom - s.top - 2) + 'px;' +
        'width:' + size + 'px;height:' + size + 'px;border-radius:50%;background:#dff1ff;' +
        'box-shadow:0 0 ' + (size * 3).toFixed(1) + 'px rgba(168,216,255,0.8);' +
        '--dx:' + (side * (14 + Math.random() * 90)).toFixed(0) + 'px;' +
        '--dy:' + (-(14 + Math.random() * 54)).toFixed(0) + 'px;--rot:0deg;' +
        'animation:gl-dust ' + ((420 + Math.random() * 380) | 0) + 'ms cubic-bezier(0.2,0.7,0.3,1) forwards;';
      frag.appendChild(p);
    }
    el.dust.appendChild(frag);
  }

  /* ââ render: Thanos through the game's own fighter renderer ââââââââââââââ */
  function loop() {
    var ctx = el.ctx;
    // offsetParent is null while #splashMenu is display:none â during every
    // fight. Nothing is drawn then, so nothing needs clearing either.
    if (ctx && el.splash.offsetParent !== null) {
      ctx.clearRect(0, 0, el.w, el.h);
      if (th && th.on) {
        var now = performance.now();
        if (th.tw) {
          var p = Math.min(1, (now - th.tw.t0) / th.tw.dur);
          var e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
          th.x = th.tw.x0 + (th.tw.x1 - th.tw.x0) * e;
          if (p >= 1) { var done = th.tw.then; th.tw = null; th.state = 'idle'; if (done) done(); }
        }
        window.SpriteKit.drawFighter(ctx, {
          x: th.x, y: th.y, angle: th.ang, color: CFG.thanosColor,
          kit: { body: 'armor', helmet: 'horned', shoulder: 'heavy', back: 'cape' },
          weapon: 'infinitygauntlet', family: 'caster',
          weaponConfig: { label: 'Infinity Gauntlet', color: CFG.gauntletColor },
          weaponColor: CFG.gauntletColor, reach: 0, bladeless: true,
          state: th.state, t: now, scale: CFG.thanosScale
        });
        plate(ctx);
        gauntlet(ctx, now);
      }
    }
    raf = requestAnimationFrame(loop);
  }

  /* The arena name plate, same shape as the one in Entity.draw(). */
  function plate(ctx) {
    var r = 18 * CFG.thanosScale, px = th.x, py = th.y - r - 20;
    ctx.save();
    ctx.font = 'bold 13px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    var tw = ctx.measureText('Thanos').width;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.beginPath();
    ctx.roundRect(px - tw / 2 - 7, py - 9, tw + 14, 18, 3);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.fillText('Thanos', px, py);
    ctx.restore();
  }

  /* Stones on the lead hand: idle ember â charge â flash + shockwave. */
  function gauntlet(ctx, now) {
    var s = CFG.thanosScale;
    var gx = th.x + Math.cos(th.ang) * 16 * s - Math.sin(th.ang) * -9 * s;
    var gy = th.y + Math.sin(th.ang) * 16 * s + Math.cos(th.ang) * -9 * s;
    var power = 0.22 + 0.05 * Math.sin(now / 420);
    if (th.chargeAt) power = 0.22 + 0.78 * Math.min(1, (now - th.chargeAt) / 900);
    if (th.snapAt) { var k = (now - th.snapAt) / 260; power = k < 1 ? 1 - k * 0.8 : 0.2; }
    var rad = 13 * s * power;
    ctx.save();
    var g = ctx.createRadialGradient(gx, gy, 0.5, gx, gy, rad);
    g.addColorStop(0, 'rgba(255,255,255,' + (0.9 * power) + ')');
    g.addColorStop(0.32, 'rgba(255,211,77,' + (0.75 * power) + ')');
    g.addColorStop(1, 'rgba(255,150,60,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(gx, gy, rad, 0, Math.PI * 2); ctx.fill();
    if (th.snapAt) {
      var kk = (now - th.snapAt) / 620;
      if (kk < 1) {
        ctx.globalAlpha = (1 - kk) * 0.9;
        ctx.strokeStyle = CFG.gauntletColor;
        ctx.lineWidth = 3 * (1 - kk) + 0.6;
        ctx.shadowBlur = 24; ctx.shadowColor = '#ffb347';
        ctx.beginPath(); ctx.arc(gx, gy, 40 + kk * el.w * 0.75, 0, Math.PI * 2); ctx.stroke();
      }
    }
    ctx.restore();
  }

  return { maybePlay: maybePlay, applyIfSnapped: applyIfSnapped, skip: skip,
           play: function () { reset(); setTimeout(play, 120); }, reset: reset, cfg: CFG };
})();
