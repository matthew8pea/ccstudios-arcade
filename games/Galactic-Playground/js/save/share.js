/* GALACTIC PLAYGROUND — sharing scenes and contraptions as text codes or files.
 *
 * A share code is the scene or contraption JSON, compressed (deflate) and written in URL-safe
 * base64 behind a short prefix:
 *   GPZ1.<data>   compressed (browsers with CompressionStream, i.e. all current ones)
 *   GPJ1.<data>   plain JSON, for browsers without it
 * Paste a code (or open a shared .json file) and the game works out whether it is a whole scene or
 * a contraption: scenes load in place of the current one; contraptions are added to
 * Contraptions → My contraptions and dropped in front of the camera.
 */
'use strict';

GP.Share = (() => {
  const canZip = typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined';

  function toB64(bytes) {
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function fromB64(str) {
    const s = atob(str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4));
    const out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  }
  async function through(bytes, stream) {
    const res = new Response(new Blob([bytes]).stream().pipeThrough(stream));
    return new Uint8Array(await res.arrayBuffer());
  }

  async function pack(obj) {
    const bytes = new TextEncoder().encode(JSON.stringify(obj));
    if (canZip) return 'GPZ1.' + toB64(await through(bytes, new CompressionStream('deflate-raw')));
    return 'GPJ1.' + toB64(bytes);
  }
  async function unpack(code) {
    const clean = String(code || '').replace(/\s+/g, '');
    const m = /^(GPZ1|GPJ1)\.([A-Za-z0-9_-]+)$/.exec(clean);
    if (!m) throw new Error('That is not a Galactic Playground share code.');
    let bytes;
    try { bytes = fromB64(m[2]); } catch (e) { throw new Error('The share code is damaged (not valid base64).'); }
    if (m[1] === 'GPZ1') {
      if (!canZip) throw new Error('This browser cannot unpack compressed share codes.');
      try { bytes = await through(bytes, new DecompressionStream('deflate-raw')); } catch (e) { throw new Error('The share code is damaged or incomplete.'); }
    }
    try { return JSON.parse(new TextDecoder().decode(bytes)); } catch (e) { throw new Error('The share code is damaged or incomplete.'); }
  }

  // coordinates don't need more than millimetres: keeps codes short
  function trim(obj) {
    return JSON.parse(JSON.stringify(obj, (k, v) => (typeof v === 'number' && !Number.isInteger(v) ? Math.round(v * 1000) / 1000 : v)));
  }
  const usable = (list) => list.filter((e) => e && !e.removed && !(e.isItem && e.holder));

  function sceneData(game) { return trim(GP.SaveSystem.serialize(game)); }
  function contraptionData(game, list, name) {
    list = usable(list);
    if (!list.length) throw new Error('Nothing to share.');
    return trim({ app: 'galactic-playground', kind: 'contraption', version: 1, name: name || (list.length === 1 ? list[0].name : 'Contraption'), snap: GP.SaveSystem.snapshot(game, list) });
  }

  // Bring in whatever a code or file contains. Returns { type: 'scene' | 'contraption', ... }.
  function apply(game, data) {
    if (!data || data.app !== 'galactic-playground') throw new Error('Not a Galactic Playground scene or contraption.');
    if (data.kind === 'contraption') {
      if (!data.snap || !data.snap.records || !data.snap.records.length) throw new Error('The contraption is empty.');
      const def = GP.Contraptions.addUser(data.name || 'Shared contraption', data.snap);
      const cam = game.camera;
      const made = GP.Contraptions.place(game, def, cam.x, cam.y + 1.5, 1);
      return { type: 'contraption', name: def.name, count: made.length };
    }
    const r = GP.SaveSystem.load(game, data);
    return Object.assign({ type: 'scene' }, r);
  }

  function download(name, text) {
    const blob = new Blob([text], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  const fileName = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'contraption';

  return {
    pack, unpack,
    sceneCode: (game) => pack(sceneData(game)),
    contraptionCode: (game, list, name) => pack(contraptionData(game, list, name)),
    async importCode(game, code) { return apply(game, await unpack(code)); },
    // a .json file (scene or contraption), or a text file holding a share code
    importFile(game, file) {
      return new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = async () => {
          try {
            const text = String(r.result).trim();
            resolve(apply(game, /^GP[ZJ]1\./.test(text) ? await unpack(text) : JSON.parse(text)));
          } catch (e) { reject(e); }
        };
        r.onerror = () => reject(new Error('Could not read the file.'));
        r.readAsText(file);
      });
    },
    exportContraptionFile(game, list, name) {
      const data = contraptionData(game, list, name);
      download('galactic-playground-' + fileName(data.name) + '.gpc.json', JSON.stringify(data));
    },
    // copy text, falling back to a selected text box for browsers (or frames) that block the clipboard
    async copy(text, box) {
      try { await navigator.clipboard.writeText(text); return true; } catch (e) { /* fall through */ }
      if (box) { box.focus(); box.select(); try { if (document.execCommand('copy')) return true; } catch (e) { /* ignore */ } }
      return false;
    },
  };
})();
