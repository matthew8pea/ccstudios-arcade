// CCStudios Arcade - game list builder (no dependencies, Node 18+).
//
// Scans games/<folder>/ for a game's index.html and writes games.json, which the front page reads.
// Drop a new game folder into games/ and run this (publish.bat and preview.bat do it for you).
//
//   node tools/build-games.mjs            build games.json
//   node tools/build-games.mjs --serve    build, then serve the site at http://localhost:8080/
//
// Per-game details come from, in order: arcade.json overrides -> the game's own game.json (optional)
// -> its index.html (<title>, <meta name="description">, <link rel="icon">) -> the folder name.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { exec } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GAMES_DIR = path.join(ROOT, 'games');
const OUT = path.join(ROOT, 'games.json');
// Folders never published (publish.bat skips them too), so they don't count toward "last updated".
const SKIP_DIRS = new Set(['.git', '.github', '.claude', '.vscode', '.idea', 'node_modules', 'certs', 'blender']);
const IMG = /\.(png|jpe?g|webp|gif|svg|avif)$/i;
const COVER_NAMES = ['cover', 'thumbnail', 'thumb', 'screenshot', 'preview', 'banner', 'poster', 'card'];
const ICON_NAMES = ['icon', 'logo', 'favicon', 'apple-touch-icon'];

const readJson = (file, fallback) => {
  try { return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, '')); }
  catch (e) {
    if (e.code !== 'ENOENT') console.warn(`  ! Could not read ${path.relative(ROOT, file)}: ${e.message}`);
    return fallback;
  }
};
const decode = (s) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
  .replace(/\s+/g, ' ').trim();
const attr = (tag, name) => {
  const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
  return m ? decode(m[2] ?? m[3] ?? m[4] ?? '') : null;
};
const prettify = (folder) => folder.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim()
  .replace(/\b\w/g, (c) => c.toUpperCase());
const slugify = (s) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'game';
const urlPath = (...parts) => parts.join('/').split('/').filter(Boolean).map(encodeURIComponent).join('/');
const exists = (p) => { try { return fs.statSync(p).isFile(); } catch { return false; } };

// Files that don't count as a game update: things publish.bat never uploads, docs, and
// screenshots/covers sitting in the game's top folder.
const SKIP_FILES = /\.(pem|key|blend\d*|bat|pyc|md|txt)$|^(\.gitignore|\.gitattributes|\.gitmodules|desktop\.ini|thumbs\.db|\.ds_store|license.*)$/i;

/** Extra skips from publish-exclude.txt: bare names match anywhere, paths are relative to the arcade folder. */
function loadExcludes() {
  const names = [], paths = [];
  let text = '';
  try { text = fs.readFileSync(path.join(ROOT, 'publish-exclude.txt'), 'utf8'); } catch { return { names, paths }; }
  for (let line of text.split(/\r?\n/)) {
    line = line.trim().replace(/[\\/]+$/, '');
    if (!line || line.startsWith('#')) continue;
    if (/[\\/]/.test(line)) paths.push(path.normalize(path.join(ROOT, ...line.split(/[\\/]+/))).toLowerCase());
    else names.push(new RegExp('^' + line.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$', 'i'));
  }
  return { names, paths };
}
const EXCLUDES = loadExcludes();
const excluded = (full, name) => EXCLUDES.names.some((r) => r.test(name)) || EXCLUDES.paths.includes(full.toLowerCase());

/** When the game itself last changed: newest modification time of the files that ship with it. */
function newestMtime(dir) {
  let newest = 0;
  const walk = (d, top) => {
    let entries;
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const full = path.join(d, e.name);
      if (excluded(full, e.name)) continue;
      if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) walk(full, false); }
      else if (e.isFile() && !SKIP_FILES.test(e.name) && !(top && IMG.test(e.name))) {
        try { newest = Math.max(newest, fs.statSync(full).mtimeMs); } catch { /* ignore */ }
      }
    }
  };
  walk(dir, true);
  return newest;
}

/** First image in the folder whose name starts with one of `names` (in priority order). */
function findImage(dir, names) {
  let files;
  try { files = fs.readdirSync(dir).filter((f) => IMG.test(f)); } catch { return null; }
  for (const n of names) {
    const hit = files.find((f) => f.toLowerCase().replace(IMG, '') === n)
      || files.find((f) => f.toLowerCase().startsWith(n));
    if (hit) return hit;
  }
  return null;
}

function build() {
  const config = readJson(path.join(ROOT, 'arcade.json'), {});
  const overrides = config.games || {};
  const firstRun = !fs.existsSync(OUT); // games already here on the first build don't get a NEW badge
  const prev = readJson(OUT, { games: [] });
  const prevBySlug = new Map((prev.games || []).map((g) => [g.slug, g]));
  const now = Date.now();

  if (!fs.existsSync(GAMES_DIR)) fs.mkdirSync(GAMES_DIR);
  const folders = fs.readdirSync(GAMES_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !/^[._]/.test(e.name))
    .map((e) => e.name)
    .sort((a, b) => a.localeCompare(b));

  const games = [];
  const slugs = new Set();
  const warnings = [];

  for (const folder of folders) {
    const dir = path.join(GAMES_DIR, folder);
    const own = readJson(path.join(dir, 'game.json'), {});
    const o = { ...own, ...(overrides[folder] || {}) };
    if (o.hidden) { console.log(`  - ${folder} (hidden)`); continue; }

    // Entry page: game.json "entry", else index.html, else the only/first .html file in the folder.
    let entry = o.entry && exists(path.join(dir, o.entry)) ? o.entry : null;
    if (!entry && exists(path.join(dir, 'index.html'))) entry = 'index.html';
    if (!entry) {
      const htmls = fs.readdirSync(dir).filter((f) => /\.html?$/i.test(f));
      entry = htmls.find((f) => /index|game|play/i.test(f)) || htmls[0] || null;
    }
    if (!entry) { warnings.push(`${folder}: no index.html found - skipped`); continue; }

    const html = fs.readFileSync(path.join(dir, entry), 'utf8');
    const titleTag = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const metaDesc = [...html.matchAll(/<meta\b[^>]*>/gi)].map((m) => m[0])
      .find((t) => /name\s*=\s*["']?description/i.test(t));
    const iconLink = [...html.matchAll(/<link\b[^>]*>/gi)].map((m) => m[0])
      .find((t) => /rel\s*=\s*["']?[^"'>]*\bicon\b/i.test(t));

    const title = o.title || (titleTag && decode(titleTag[1])) || prettify(folder);
    const description = o.description || (metaDesc && attr(metaDesc, 'content')) || '';

    // Cover art (wide picture) and icon (square logo). Paths in arcade.json are relative to the site root;
    // paths in a game's own game.json are relative to that game's folder.
    const fromOverride = (key) => {
      if (overrides[folder]?.[key]) return urlPath(overrides[folder][key]);
      if (own[key]) return urlPath('games', folder, own[key]);
      return null;
    };
    let cover = fromOverride('cover');
    if (!cover) { const f = findImage(dir, COVER_NAMES); if (f) cover = urlPath('games', folder, f); }
    let icon = fromOverride('icon');
    if (!icon && iconLink) {
      const href = (attr(iconLink, 'href') || '').split(/[?#]/)[0];
      if (href && !/^(data:|https?:|\/)/i.test(href) && exists(path.join(dir, href))) icon = urlPath('games', folder, href);
    }
    if (!icon) { const f = findImage(dir, ICON_NAMES); if (f) icon = urlPath('games', folder, f); }

    let slug = slugify(o.slug || folder);
    for (let i = 2; slugs.has(slug); i++) slug = `${slugify(o.slug || folder)}-${i}`;
    slugs.add(slug);

    const updated = Math.round(newestMtime(dir)) || now;
    const old = prevBySlug.get(slug);
    const added = old ? old.added : firstRun ? 0 : now;

    // Root-absolute paths ("/js/x.js") break on GitHub Pages project sites (the site lives under /repo-name/).
    const absolute = [...html.matchAll(/\b(?:src|href)\s*=\s*["']\/(?!\/)([^"']*)/gi)].map((m) => '/' + m[1]);
    if (absolute.length) warnings.push(`${folder}: uses root paths (${absolute.slice(0, 3).join(', ')}) - these break on GitHub Pages; make them relative`);
    if (fs.existsSync(path.join(dir, '.git'))) console.log(`    (${folder} has its own .git folder - publish.bat copies the files without it)`);

    games.push({
      slug, title, description, folder,
      url: urlPath('games', folder, entry),
      cover, icon,
      // Credit for games made by someone else. authorUrl must be a plain web link.
      author: typeof o.author === 'string' && o.author.trim() ? o.author.trim() : null,
      authorUrl: typeof o.authorUrl === 'string' && /^https?:\/\//i.test(o.authorUrl) ? o.authorUrl : null,
      tags: Array.isArray(o.tags) ? o.tags : [],
      order: typeof o.order === 'number' ? o.order : null,
      added, updated,
    });
    console.log(`  + ${title}  ->  games/${folder}/${entry}`);
  }

  games.sort((a, b) => (a.order ?? 1e9) - (b.order ?? 1e9) || b.updated - a.updated);
  const site = { title: config.title || 'CCStudios Arcade', tagline: config.tagline || '' };
  fs.writeFileSync(OUT, JSON.stringify({ generated: now, site, games }, null, 2) + '\n');
  for (const w of warnings) console.warn('  ! ' + w);
  console.log(`games.json: ${games.length} game${games.length === 1 ? '' : 's'}`);
  return games;
}

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.htm': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json',
  '.wasm': 'application/wasm', '.otf': 'font/otf', '.ttf': 'font/ttf', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

function serve(port) {
  const server = http.createServer((req, res) => {
    let rel;
    try { rel = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { res.writeHead(400); res.end(); return; }
    let file = path.normalize(path.join(ROOT, rel));
    if (!file.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
    try { if (fs.statSync(file).isDirectory()) file = path.join(file, 'index.html'); } catch { /* 404 below */ }
    fs.stat(file, (err, st) => {
      if (err || !st.isFile()) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('Not found'); return; }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
      fs.createReadStream(file).pipe(res);
    });
  });
  server.on('error', (e) => {
    if (e.code === 'EADDRINUSE') { console.log(`Port ${port} is busy, trying ${port + 1}...`); serve(port + 1); }
    else console.error(e);
  });
  server.listen(port, '127.0.0.1', () => {
    const url = `http://localhost:${port}/`;
    console.log(`\nPreview running at ${url}  (Ctrl+C to stop)`);
    if (!process.argv.includes('--no-open')) {
      exec(process.platform === 'win32' ? `start "" "${url}"` : process.platform === 'darwin' ? `open "${url}"` : `xdg-open "${url}"`);
    }
  });
}

console.log('Scanning games/ ...');
build();
if (process.argv.includes('--serve')) serve(8080);
