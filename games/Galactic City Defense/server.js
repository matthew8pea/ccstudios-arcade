// Minimal static file server for the game (no dependencies).
// Usage: node server.js [--open] [--port 8123] [--vr] [--vr-port 8443]
//   --vr  also serves the game over HTTPS to the local network, so a standalone headset (Meta Quest and the like)
//         can open it in its own browser: WebXR only runs on https:// pages (or on localhost). It uses the
//         self-signed certificate in certs/, so the headset browser warns once: Advanced > Proceed.
const http = require('http');
const https = require('https');
const os = require('os');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const ROOT = __dirname;
const args = process.argv.slice(2);
const argVal = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const PORT = Number(process.env.PORT || argVal('--port', 8123));
const VR = args.includes('--vr');
const VR_PORT = Number(argVal('--vr-port', 8443));
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8',
};

function handler(req, res) {
  let rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.normalize(path.join(ROOT, rel));
  if (!file.startsWith(ROOT) || file.startsWith(path.join(ROOT, 'certs'))) { res.writeHead(403); res.end(); return; }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    fs.createReadStream(file).pipe(res);
  });
}

const server = http.createServer(handler);

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.log(`Port ${PORT} is busy - the game may already be running at http://localhost:${PORT}/`);
    if (args.includes('--open')) openBrowser();
  } else console.error(e);
});

function openBrowser() {
  const url = `http://localhost:${PORT}/`;
  const cmd = process.platform === 'win32' ? `start "" "${url}"` : process.platform === 'darwin' ? `open "${url}"` : `xdg-open "${url}"`;
  exec(cmd);
}

/** This PC's addresses on the local network (Wi-Fi / Ethernet), for the headset to connect to. */
function lanAddresses() {
  const out = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    for (const a of list || []) {
      if (a.family !== 'IPv4' || a.internal) continue;
      if (/vEthernet|VirtualBox|VMware|WSL|Hyper-V|Loopback|Tailscale|ZeroTier/i.test(name)) continue;
      out.push(a.address);
    }
  }
  return out;
}

// Refresh dist/game.pack.js so double-clicking index.html always runs the current code.
try {
  const r = require('./tools/pack.js').pack();
  console.log(`Offline pack refreshed (${r.modules} modules, ${r.models} models) - index.html also runs straight from the folder.`);
} catch (e) {
  console.warn('Could not refresh the offline pack:', e.message);
}

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Galactic City Defense running at http://localhost:${PORT}/  (Ctrl+C to stop)`);
  if (VR) console.log('  PC VR (Quest Link / Air Link / SteamVR): open that address in Chrome or Edge on this PC and press ENTER VR.');
  if (args.includes('--open')) openBrowser();
});

if (VR) {
  const key = path.join(ROOT, 'certs', 'key.pem'), cert = path.join(ROOT, 'certs', 'cert.pem');
  if (!fs.existsSync(key) || !fs.existsSync(cert)) {
    console.warn('No certs/key.pem + certs/cert.pem: the headset address needs them (HTTPS). Skipping it.');
  } else {
    const vr = https.createServer({ key: fs.readFileSync(key), cert: fs.readFileSync(cert) }, handler);
    vr.on('error', (e) => console.error(e.code === 'EADDRINUSE' ? `Port ${VR_PORT} is busy - the headset address may already be running.` : e));
    vr.listen(VR_PORT, '0.0.0.0', () => {
      const ips = lanAddresses();
      console.log('');
      console.log('  Standalone headset (Quest): on the same Wi-Fi, open this in the headset browser:');
      for (const ip of ips.length ? ips : ['<this PC\'s IP address>']) console.log(`      https://${ip}:${VR_PORT}/`);
      console.log('  It warns that the connection is not private (the certificate is self-made): Advanced > Proceed.');
      console.log('  If it will not load, allow Node.js through Windows Firewall on private networks.');
    });
  }
}
