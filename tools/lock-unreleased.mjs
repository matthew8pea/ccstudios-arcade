// CCStudios Arcade - unreleased game locker (no dependencies, Node 18+).
//
// A game marked "unreleased" in arcade.json goes on the site encrypted, so only early-access accounts can play
// it, even though the GitHub repo is public. For each one this reads the real game from games/<source>/ (which
// publish-exclude.txt keeps off the site) and writes games/<folder>/ with:
//   - every .html .js .mjs .css .json file encrypted (AES-256-GCM) as <file>.enc; the game's index.html becomes
//     play.html.enc,
//   - everything else (textures, music, fonts) copied as is,
//   - index.html: a lock screen that checks who is logged in and fetches the game's key from Firestore,
//   - sw.js: a service worker that decrypts the game's files inside the browser once the key is there.
//
// The key is made on the first run and saved in tools/keys/<folder>.key (publish.bat never uploads .key files).
// Firestore needs the same key in unreleased/<folder> { key: "..." }, and tools/firestore.rules lists which
// accounts may read it. See "Unreleased games" in README.md.
//
//   node tools/lock-unreleased.mjs     (publish.bat and preview.bat run it for you)
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GAMES_DIR = path.join(ROOT, 'games');
const KEYS_DIR = path.join(ROOT, 'tools', 'keys');
const ENCRYPT = /\.(html?|m?js|css|json)$/i;
const SKIP = /^(\.git|\.github|\.claude|\.vscode|\.idea|node_modules|certs|blender|desktop\.ini|thumbs\.db|\.ds_store)$|\.(pem|key|blend\d*|bat|map)$/i;
const SDK = 'https://www.gstatic.com/firebasejs/10.14.1/';

const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'arcade.json'), 'utf8').replace(/^﻿/, ''));
const locked = Object.entries(config.games || {}).filter(([, o]) => o && o.unreleased && o.unreleased.source);
if (!locked.length) { console.log('No unreleased games to lock.'); process.exit(0); }

function keyFor(folder) {
  const file = path.join(KEYS_DIR, folder + '.key');
  if (fs.existsSync(file)) {
    const key = Buffer.from(fs.readFileSync(file, 'utf8').trim(), 'base64');
    if (key.length === 32) return key;
    throw new Error(`${path.relative(ROOT, file)} is not a valid key`);
  }
  const key = crypto.randomBytes(32);
  fs.mkdirSync(KEYS_DIR, { recursive: true });
  fs.writeFileSync(file, key.toString('base64') + '\n');
  console.log(`  * Made a new key for ${folder}: ${path.relative(ROOT, file)}`);
  console.log(`    Put it in Firestore at unreleased/${folder}, field "key" (see README.md).`);
  return key;
}

// The IV comes from the file's path and contents, so an unchanged file encrypts to the same bytes and isn't
// uploaded again (a repeated IV is only ever paired with the identical plaintext).
function encrypt(key, rel, data) {
  const iv = crypto.createHmac('sha256', key).update(rel + '\0').update(data).digest().subarray(0, 12);
  const c = crypto.createCipheriv('aes-256-gcm', key, iv);
  return Buffer.concat([iv, c.update(data), c.final(), c.getAuthTag()]);
}

function walk(dir, base = '') {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.test(e.name)) continue;
    const rel = base ? base + '/' + e.name : e.name;
    if (e.isDirectory()) out.push(...walk(path.join(dir, e.name), rel));
    else if (e.isFile()) out.push(rel);
  }
  return out;
}

// Only touch files whose bytes changed, and keep the source's modified time, so the arcade's UPDATED badge
// reflects real changes to the game.
function put(file, data, mtime) {
  let same = false;
  try { same = fs.readFileSync(file).equals(data); } catch { /* new file */ }
  if (!same) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, data); }
  if (mtime) fs.utimesSync(file, mtime, mtime);
}

for (const [folder, o] of locked) {
  const src = path.join(GAMES_DIR, o.unreleased.source);
  const out = path.join(GAMES_DIR, folder);
  if (!fs.existsSync(path.join(src, 'index.html'))) { console.warn(`  ! ${folder}: games/${o.unreleased.source}/index.html not found - skipped`); continue; }
  if (path.resolve(src) === path.resolve(out)) { console.warn(`  ! ${folder}: source and output are the same folder - skipped`); continue; }
  const key = keyFor(folder);
  const files = walk(src);
  const written = new Set(['index.html', 'sw.js']);
  const encrypted = [];
  let newest = 0;

  for (const rel of files) {
    const from = path.join(src, ...rel.split('/'));
    const mtime = fs.statSync(from).mtime;
    newest = Math.max(newest, mtime.getTime());
    let data = fs.readFileSync(from);
    if (ENCRYPT.test(rel)) {
      const name = rel === 'index.html' ? 'play.html' : rel;
      // Root paths ("/assets/x.png") point at the top of matthew8pea.github.io, not the game's folder.
      if (/\.m?js$/i.test(rel)) data = Buffer.from(data.toString('utf8').replace(/(["'`])\/assets\//g, '$1assets/'));
      put(path.join(out, ...(name + '.enc').split('/')), encrypt(key, name, data), mtime);
      written.add(name + '.enc');
      encrypted.push(name);
    } else {
      put(path.join(out, ...rel.split('/')), data, mtime);
      written.add(rel);
    }
  }

  const stamp = new Date(newest || Date.now());
  const title = o.title || folder;
  put(path.join(out, 'index.html'), Buffer.from(lockScreen(folder, title)), stamp);
  put(path.join(out, 'sw.js'), Buffer.from(serviceWorker(folder, encrypted.sort())), stamp);

  // remove files left over from an older version of the game
  for (const rel of walk(out)) if (!written.has(rel)) fs.rmSync(path.join(out, ...rel.split('/')));
  const prune = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) if (e.isDirectory()) { const p = path.join(d, e.name); prune(p); if (!fs.readdirSync(p).length) fs.rmdirSync(p); } };
  prune(out);
  console.log(`  # ${title}: locked ${encrypted.length} files into games/${folder}/ (${files.length - encrypted.length} copied as is)`);
}

function serviceWorker(game, files) {
  const version = crypto.createHash('sha256').update(JSON.stringify(files)).digest('hex').slice(0, 12);
  return `// Made by tools/lock-unreleased.mjs - edits here are overwritten. Version ${version}.
// Decrypts this unreleased game's files in the browser, using the key the lock screen (index.html) saved after
// checking the player has early access. Without that key every locked file stays locked.
const GAME = ${JSON.stringify(game)};
const LOCKED = new Set(${JSON.stringify(files)});
const TYPES = { html: 'text/html; charset=utf-8', htm: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8',
  mjs: 'text/javascript; charset=utf-8', css: 'text/css; charset=utf-8', json: 'application/json' };
const BASE = new URL('./', self.location);

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== BASE.origin || !url.pathname.startsWith(BASE.pathname)) return;
  let rel;
  try { rel = decodeURIComponent(url.pathname.slice(BASE.pathname.length)); } catch { return; }
  if (LOCKED.has(rel)) e.respondWith(serve(rel, e.request.mode === 'navigate'));
});

function storedKey() {
  return new Promise((resolve) => {
    const req = indexedDB.open('cca-unreleased', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('keys');
    req.onerror = () => resolve(null);
    req.onsuccess = () => {
      const db = req.result;
      const get = db.transaction('keys').objectStore('keys').get(GAME);
      get.onsuccess = () => { db.close(); resolve(get.result || null); };
      get.onerror = () => { db.close(); resolve(null); };
    };
  });
}

// A page load without a fresh key goes back to the lock screen, which checks the login again.
const locked = (page) => page ? Response.redirect(BASE.href, 302) : new Response('Locked', { status: 403 });

async function serve(rel, page) {
  const k = await storedKey();
  if (!k || !k.key || (page && !(k.exp > Date.now()))) return locked(page);
  const res = await fetch(new URL(rel.split('/').map(encodeURIComponent).join('/') + '.enc', BASE), { cache: 'no-cache' });
  if (!res.ok) return new Response('Not found', { status: res.status });
  const buf = await res.arrayBuffer();
  try {
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: buf.slice(0, 12) }, k.key, buf.slice(12));
    return new Response(plain, { headers: { 'Content-Type': TYPES[rel.split('.').pop().toLowerCase()] || 'application/octet-stream' } });
  } catch {
    return locked(page); // the key changed since it was saved
  }
}
`;
}

function lockScreen(game, title) {
  const t = title.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  return `<!DOCTYPE html>
<!-- Made by tools/lock-unreleased.mjs - edits here are overwritten. -->
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${t}</title>
<style>
  html, body { margin: 0; height: 100%; background: #07080d; color: #e9ecf5; font: 15px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; }
  main { min-height: 100%; display: grid; place-items: center; text-align: center; padding: 24px; box-sizing: border-box; }
  .tag { display: inline-block; font: 800 11px/1 system-ui, sans-serif; letter-spacing: .16em; padding: 6px 9px; border-radius: 6px;
    background: #a78bfa; color: #160b33; margin-bottom: 14px; }
  h1 { margin: 0 0 8px; font-size: 30px; letter-spacing: .02em; }
  p { margin: 0 auto; max-width: 420px; color: #9aa3b8; }
  a { color: #f5b942; }
  .spin { width: 22px; height: 22px; margin: 18px auto 0; border: 3px solid #2a2f40; border-top-color: #f5b942; border-radius: 50%;
    animation: s .8s linear infinite; }
  @keyframes s { to { transform: rotate(360deg); } }
</style>
</head>
<body>
<main><div>
  <span class="tag">UNRELEASED</span>
  <h1>${t}</h1>
  <p id="msg">Checking your early access…</p>
  <div class="spin" id="spin"></div>
</div></main>
<script src="../../firebase-config.js"></script>
<script type="module">
const GAME = ${JSON.stringify(game)};
const HOME = '../../';
const $ = (id) => document.getElementById(id);
function show(html) { $('msg').innerHTML = html; $('spin').hidden = true; }
const notOut = '${t} isn\\'t out yet. ';

function saveKey(entry) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('cca-unreleased', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('keys');
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const db = req.result, tx = db.transaction('keys', 'readwrite');
      tx.objectStore('keys').put(entry, GAME);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    };
  });
}

async function unlock() {
  if (typeof firebaseConfig === 'undefined' || !firebaseConfig.apiKey) return show(notOut + 'Come back when it launches!');
  if (!('serviceWorker' in navigator) || !window.indexedDB || !crypto.subtle) {
    return show('This browser can\\'t open early-access games. Try Chrome, Edge or Firefox, outside a private window.');
  }
  const [{ initializeApp }, A, F] = await Promise.all([
    import('${SDK}firebase-app.js'), import('${SDK}firebase-auth.js'), import('${SDK}firebase-firestore-lite.js')
  ]);
  const app = initializeApp(firebaseConfig);
  const auth = A.getAuth(app);
  await auth.authStateReady();
  if (!auth.currentUser) return show(notOut + 'Early-access players: <a href="' + HOME + '" target="_top">log in on the arcade</a>, then open it again.');
  let snap;
  try { snap = await F.getDoc(F.doc(F.getFirestore(app), 'unreleased', GAME)); }
  catch (e) {
    if (e.code === 'permission-denied') return show(notOut + 'This account doesn\\'t have early access.');
    throw e;
  }
  const raw = snap.exists() && snap.data().key;
  if (!raw) return show('Early access for ' + document.title + ' isn\\'t switched on yet. (Its key still needs adding in Firestore, see README.md.)');
  const bytes = Uint8Array.from(atob(String(raw).trim()), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['decrypt']);
  await saveKey({ key, exp: Date.now() + 12 * 3600e3 });
  await navigator.serviceWorker.register('sw.js', { scope: './', updateViaCache: 'none' });
  await navigator.serviceWorker.ready;
  location.replace('play.html' + location.search + location.hash);
}
unlock().catch((e) => { console.error(e); show('Couldn\\'t unlock ' + document.title + '. Check your connection and <a href="">try again</a>.'); });
</script>
</body>
</html>
`;
}
