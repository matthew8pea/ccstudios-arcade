#!/usr/bin/env node
/*
 * Galactic Legends — runtime smoke test
 * =====================================
 *
 *   node smoke.js               # boot, play the Snap by code, fight 20s, report
 *   node smoke.js --seconds=40  # fight for longer
 *   node smoke.js --shipped     # ?debug=0: the itch.io error handling
 *
 * Exits 0 on PASS, 1 on FAIL, 2 if it could not run at all (no browser found).
 * Needs nothing but Node and an installed Edge or Chrome, same as validate.js
 * needs nothing but Node.
 *
 * WHY THIS EXISTS
 * ---------------
 * validate.js checks the data and `node --check` checks the syntax, and both
 * pass happily while the page is blank. All of game.js runs inside one
 * DOMContentLoaded handler, so a single throw during it aborts everything after
 * that line; and a throw inside update()/draw() kills the loop locally. Neither
 * is visible without opening the page. This opens the page.
 *
 * WHAT IT DOES
 * ------------
 * Serves this folder on a throwaway local port, rewrites index.html on the way
 * out to put a probe <script> first in <head>, and runs headless Edge/Chrome
 * with --dump-dom. The probe then plays the game the way a brand-new player
 * does, on a fresh profile with no save at all:
 *
 *   menu already settled (the Snap is vaulted) → THANOS code → the Snap →
 *   no season card (vaulted too) → Freeplay → Anakin → Normal → Mustafar →
 *   Darth Maul → "Your First Fight" card → fight
 *
 * and during the fight it holds fire and walks around. It fails on any
 * uncaught error or console.error, on any step whose button never shows up,
 * and on a fight whose clock has stopped without the round having ended
 * (the loop died). The result goes back out through the dumped DOM.
 *
 * The fresh profile is deliberate: a seeded save can steer around the exact
 * branch a new player hits (a save only settles the Snap's end state once).
 *
 * Served from 127.0.0.1, so debugStrictErrors is ON by default and a throw in
 * the loop freezes the game, which the frozen clock catches. --shipped
 * passes ?debug=0 to check the swallow-and-log path instead; there the throw
 * shows up as console.error, which fails the run just the same.
 *
 * TWO THINGS THAT LOOK WRONG AND ARE NOT
 * --------------------------------------
 * requestAnimationFrame does not advance under --virtual-time-budget, so the
 * probe shims it onto setTimeout, or the game loop never ticks.
 *
 * Audio does not play headless. Failed audio requests are not reported; only
 * JavaScript errors are.
 *
 * It does not judge balance or feel. A script holding the trigger is not a
 * player, so "the enemy lost HP" means only that combat is wired up.
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

const ROOT = __dirname;
const args = process.argv.slice(2);
const argVal = (name, dflt) => {
    const a = args.find(x => x.startsWith(`--${name}=`));
    return a ? a.split('=')[1] : dflt;
};
const FIGHT_SECONDS = Math.max(3, Number(argVal('seconds', 20)) || 20);
const SHIPPED = args.includes('--shipped');

// ── Browser ────────────────────────────────────────────────────────────────
// SMOKE_BROWSER wins; otherwise the usual install locations, Edge first since
// that is what this project is tested with on Windows.
function findBrowser() {
    const env = process.env.SMOKE_BROWSER;
    if (env) return fs.existsSync(env) ? env : null;
    const pf = process.env['ProgramFiles'] || 'C:/Program Files';
    const pf86 = process.env['ProgramFiles(x86)'] || 'C:/Program Files (x86)';
    const local = process.env.LOCALAPPDATA || '';
    const candidates = [
        `${pf86}/Microsoft/Edge/Application/msedge.exe`,
        `${pf}/Microsoft/Edge/Application/msedge.exe`,
        `${pf}/Google/Chrome/Application/chrome.exe`,
        `${pf86}/Google/Chrome/Application/chrome.exe`,
        local && `${local}/Google/Chrome/Application/chrome.exe`,
        '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/usr/bin/microsoft-edge', '/usr/bin/google-chrome', '/usr/bin/chromium',
        '/usr/bin/chromium-browser',
    ].filter(Boolean);
    // Playwright's bundled Chromium, where a cloud/CI box has one.
    try {
        const pw = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
        fs.readdirSync(pw).filter(d => /^chromium-\d+$/.test(d))
            .forEach(d => candidates.push(path.join(pw, d, 'chrome-linux', 'chrome')));
    } catch (e) {}
    return candidates.find(p => { try { return fs.statSync(p).isFile(); } catch (e) { return false; } }) || null;
}

// ── The probe ──────────────────────────────────────────────────────────────
// Runs in the page, first thing in <head>, so it is listening before game.js
// throws anything. Written as a function and stringified so it can be read and
// edited as ordinary code.
function probe(FIGHT_SECONDS) {
    const R = { steps: [], errors: [], frames: 0, pass: false };
    window.__smoke = R;

    // The shipped build logs the same loop error every frame; one line each
    // with a count is the useful report, not two thousand copies.
    const seen = new Map();
    const note = msg => {
        msg = String(msg).slice(0, 400);
        if (seen.has(msg)) { seen.get(msg).count++; return; }
        const rec = { msg, count: 1 };
        seen.set(msg, rec);
        R.errors.push(rec);
    };
    window.addEventListener('error', e => note((
        e.error && e.error.stack ? e.error.stack : `${e.message} (${e.filename}:${e.lineno})`)));
    window.addEventListener('unhandledrejection', e => note(('unhandled rejection: ' +
        (e.reason && e.reason.stack || e.reason))));
    const origError = console.error;
    console.error = function (...a) {
        note('console.error: ' + a.map(x => x && x.stack || x).join(' '));
        return origError.apply(this, a);
    };

    // rAF never fires under --virtual-time-budget; setTimeout does.
    window.requestAnimationFrame = cb => setTimeout(() => { R.frames++; cb(performance.now()); }, 16);
    window.cancelAnimationFrame = id => clearTimeout(id);

    const wait = ms => new Promise(r => setTimeout(r, ms));
    const visible = el => !!el && el.offsetParent !== null &&
        getComputedStyle(el).visibility !== 'hidden';
    const $v = sel => [...document.querySelectorAll(sel)].find(visible) || null;
    const text = id => { const el = document.getElementById(id); return el ? el.textContent.trim() : null; };

    async function waitFor(what, fn, ms) {
        for (let t = 0; t < ms; t += 100) {
            const v = fn();
            if (v) return v;
            await wait(100);
        }
        throw new Error(`timed out waiting for ${what}`);
    }
    async function click(what, sel, ms = 5000) {
        const el = await waitFor(what, () => $v(sel), ms);
        el.click();
        R.steps.push(what);
        await wait(400);
    }
    const key = (type, k) => window.dispatchEvent(new KeyboardEvent(type, { key: k, bubbles: true }));

    function finish() {
        const out = document.createElement('pre');
        out.id = '__smoke';
        out.textContent = btoa(unescape(encodeURIComponent(JSON.stringify(R))));
        document.body.appendChild(out);
    }

    async function run() {
        // The Snap is vaulted (SNAP_INTRO_VAULTED in game.js): a fresh save opens
        // straight to the menu it leaves behind, tiles live, no card, no click owed.
        await wait(1500);
        await waitFor('splash menu', () => $v('#splashMenu'), 10000);
        await waitFor('Snap end state without the Snap (Kamino landed, tiles live)', () =>
            document.getElementById('btnKamino').classList.contains('is-landed') &&
            !document.getElementById('btnFreeplay').hasAttribute('aria-disabled'), 5000);
        if ($v('#seasonCardStarWarsBtn')) throw new Error('season card is up without the Snap having played');
        R.steps.push('Snap vaulted: menu already settled');

        // The THANOS code is the way back in, and it plays the whole thing. The
        // Settings button is position:fixed, so it has no offsetParent and $v()
        // cannot see it — these three go by id.
        document.getElementById('settingsBtn').click();
        if (document.getElementById('settingsPanel').style.display !== 'flex') throw new Error('Settings did not open');
        document.getElementById('redeemCodeInput').value = 'thanos';
        document.getElementById('redeemCodeBtn').click();
        R.steps.push('redeem code THANOS');
        await waitFor('the Snap to start (tiles locked)',
            () => document.getElementById('btnFreeplay').hasAttribute('aria-disabled'), 5000);
        await waitFor('the Snap to finish (Kamino landed, tiles live)', () =>
            document.getElementById('btnKamino').classList.contains('is-landed') &&
            !document.getElementById('btnFreeplay').hasAttribute('aria-disabled'), 30000);
        R.steps.push('Snap played');
        // The season card is vaulted (SEASON_CARD_VAULTED): the Snap ends on the menu.
        await wait(1500);
        if ($v('#seasonCardStarWarsBtn')) throw new Error('season card came up after the Snap; it is vaulted');
        R.steps.push('no season card');
        await click('Freeplay', '#btnFreeplay');
        await click('pick Anakin', '.hero-button[data-character="anakin"]');
        await click('Normal', '.diff-btn[data-diff="normal"]');
        await click('Mustafar', '.arena-btn[data-arena="mustafar"]');
        await click('opponent Darth Maul', '[data-character="maul"]');
        // "Your First Fight" coach card, first match on a fresh profile.
        await wait(800);
        if ($v('#controlsCloseBtn')) await click('first-fight card', '#controlsCloseBtn');

        const canvas = await waitFor('arena canvas', () => $v('#gameCanvas'), 5000);
        // updateHUD runs from gameLoop, so an HP readout that never appears means
        // the loop never got going.
        await waitFor('HUD to fill in (game loop running)', () => text('enemyHealthText'), 8000);
        const clock0 = text('hudTimer'), hp0 = text('enemyHealthText');
        const frames0 = R.frames;
        R.steps.push(`fight started (clock ${clock0}, enemy ${hp0})`);

        // Hold fire, change direction every second, dodge now and then.
        key('keydown', ' ');
        const dirs = ['d', 's', 'a', 'w'];
        for (let s = 0; s < FIGHT_SECONDS; s++) {
            const d = dirs[s % 4];
            key('keydown', d);
            if (s % 3 === 2) { key('keydown', 'Shift'); await wait(80); key('keyup', 'Shift'); }
            await wait(1000);
            key('keyup', d);
        }
        key('keyup', ' ');
        // Is it still ticking now? Comparing the clock at the start and end of the
        // fight misses a loop that died halfway: the clock moved, then stopped.
        const clockEnd = text('hudTimer');
        await wait(1500);

        R.fight = {
            clockBefore: clock0, clockAfter: text('hudTimer'),
            enemyHpBefore: hp0, enemyHpAfter: text('enemyHealthText'),
            // Every rAF chain on the page, not just gameLoop: the Snap overlay keeps
            // its own loop running. Informational only; the clock is the real check.
            framesDuringFight: R.frames - frames0,
            // The round can legitimately end inside the window (Maul went down in
            // 10s in a hand test); the clock stops then, and that is not a freeze.
            resultScreen: $v('#messageOverlay') ? (text('messageText') || 'shown') : null,
        };
        try { R.frame = canvas.toDataURL('image/png'); } catch (e) {}

        const f = R.fight;
        const matchEnded = !!f.resultScreen;
        if (!matchEnded && clockEnd === f.clockAfter) {
            note(`clock stopped at ${f.clockAfter} with the round still on: the game loop died`);
        }
        R.pass = R.errors.length === 0;
    }

    window.addEventListener('load', () => {
        run().catch(e => { note('step failed: ' + e.message); })
            .finally(finish);
    });
}

// ── Static server ──────────────────────────────────────────────────────────
const TYPES = {
    '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg',
    '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.svg': 'image/svg+xml',
    '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf',
    '.json': 'application/json',
};

function startServer() {
    const probeTag = `<script>(${probe.toString()})(${FIGHT_SECONDS});</script>`;
    const server = http.createServer((req, res) => {
        let rel = decodeURIComponent(req.url.split('?')[0]);
        if (rel === '/') rel = '/index.html';
        const file = path.join(ROOT, path.normalize(rel));
        if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
        fs.readFile(file, (err, buf) => {
            if (err) { res.writeHead(404); return res.end(); }
            if (rel === '/index.html') {
                buf = Buffer.from(buf.toString('utf8').replace(/<head[^>]*>/i, m => m + probeTag));
            }
            res.writeHead(200, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream' });
            res.end(buf);
        });
    });
    return new Promise(r => server.listen(0, '127.0.0.1', () => r(server)));
}

// ── Run ────────────────────────────────────────────────────────────────────
async function main() {
    const browser = findBrowser();
    if (!browser) {
        console.error('smoke: no Edge or Chrome found. Set SMOKE_BROWSER to its full path.');
        process.exit(2);
    }
    const server = await startServer();
    const url = `http://127.0.0.1:${server.address().port}/index.html${SHIPPED ? '?debug=0' : ''}`;
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'gl-smoke-'));

    // Boot + the Snap by code + menus is ~15s of game time; the budget leaves room over that.
    const budgetMs = (FIGHT_SECONDS + 45) * 1000;
    const flags = [
        '--headless', '--disable-gpu', '--mute-audio', '--no-first-run',
        '--no-default-browser-check', '--disable-extensions',
        '--autoplay-policy=no-user-gesture-required', '--window-size=1280,800',
        `--user-data-dir=${profile}`, `--virtual-time-budget=${budgetMs}`,
        '--dump-dom', url,
    ];
    // Chromium refuses to start sandboxed as root (containers, CI).
    if (process.getuid && process.getuid() === 0) flags.unshift('--no-sandbox');

    console.log(`Galactic Legends — smoke test${SHIPPED ? ' (shipped error handling)' : ''}`);
    console.log('──────────────────────────────────');
    console.log(`  browser  ${browser}`);

    let dom = '';
    const code = await new Promise(resolve => {
        const child = spawn(browser, flags, { stdio: ['ignore', 'pipe', 'ignore'] });
        child.stdout.on('data', d => { dom += d; });
        // Virtual time runs faster than the wall clock, but a hung browser should
        // still end the run rather than the terminal session.
        const killer = setTimeout(() => child.kill(), budgetMs + 90000);
        child.on('error', e => { console.error('smoke: could not start browser: ' + e.message); resolve(-1); });
        child.on('close', c => { clearTimeout(killer); resolve(c); });
    });
    server.close();
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) {}

    const m = dom.match(/<pre id="__smoke">([^<]*)<\/pre>/);
    if (!m) {
        console.log('\n✗ FAIL — the probe never reported back.');
        console.log(dom.trim() ? '  The page loaded but the run did not finish inside the time budget.'
                               : `  The browser exited (code ${code}) without printing the page.`);
        process.exit(1);
    }
    const R = JSON.parse(Buffer.from(m[1], 'base64').toString('utf8'));

    console.log('\n  steps');
    R.steps.forEach(s => console.log(`    ✓ ${s}`));
    if (R.fight) {
        const f = R.fight;
        console.log('\n  fight');
        console.log(`    clock      ${f.clockBefore} → ${f.clockAfter}`);
        console.log(`    enemy HP   ${f.enemyHpBefore} → ${f.enemyHpAfter}`);
        console.log(`    rAF calls  ${f.framesDuringFight} in ${FIGHT_SECONDS}s`);
        console.log(`    results    ${f.resultScreen || 'not reached'}`);
    }
    if (R.frame) {
        const png = path.join(os.tmpdir(), 'galactic-legends-smoke.png');
        fs.writeFileSync(png, Buffer.from(R.frame.split(',')[1], 'base64'));
        console.log(`\n  last frame saved to ${png}`);
    }
    if (R.errors.length) {
        console.log(`\n  errors (${R.errors.length})`);
        R.errors.forEach(e => console.log('    ✗ ' + (e.count > 1 ? `(×${e.count}) ` : '') +
            e.msg.replace(/\n/g, '\n      ')));
    }
    console.log(R.pass ? '\n✓ PASS' : '\n✗ FAIL');
    process.exit(R.pass ? 0 : 1);
}

main();
