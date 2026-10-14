// Made by tools/lock-unreleased.mjs - edits here are overwritten. Version 038c546e50ae.
// Decrypts this unreleased game's files in the browser, using the key the lock screen (index.html) saved after
// checking the player has early access. Without that key every locked file stays locked.
const GAME = "atlas";
const LOCKED = new Set(["assets/index-Ba2ICfeA.css","assets/index-D56cYWSO.js","assets/rvx/sounds.json","assets/rvx/sounds/music-index.json","assets/saveWorker-DPkCOgo8.js","assets/world.worker-B6Lc8OTH.js","play.html"]);
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
