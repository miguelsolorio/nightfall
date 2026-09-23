#!/usr/bin/env node
/* Nightfall — media build
   Renders the app icon and share image sources in design/ (and the published
   favicon SVG) to PNG, JPEG and ICO with headless Chrome over the DevTools Protocol.
   No dependencies: Node 22+ (built-in WebSocket) and a local Chrome.

     node scripts/build-media.mjs          # set CHROME_PATH if Chrome isn't found
*/
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const at = p => join(ROOT, p);

const JOBS = [
  { src: 'design/icon.svg', out: 'public/apple-touch-icon.png', w: 180, h: 180 },
  { src: 'design/icon.svg', out: 'public/media/icon-192.png', w: 192, h: 192 },
  { src: 'design/icon.svg', out: 'public/media/icon-512.png', w: 512, h: 512 },
  { src: 'design/og.html', out: 'public/media/og.jpg', w: 1200, h: 630, jpeg: 90 },   // JPEG: the grain keeps it artifact-free at ~80 KB
];
const FAVICON = { src: 'public/media/icon.svg', sizes: [16, 32], out: 'public/favicon.ico' };

function findChrome() {
  const hit = [
    process.env.CHROME_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  ].find(p => p && existsSync(p));
  if (!hit) throw new Error('Chrome not found — set CHROME_PATH');
  return hit;
}

// Minimal DevTools Protocol client over one browser-level socket (flattened sessions)
async function connect(url) {
  const ws = new WebSocket(url), pending = new Map(), listeners = new Set();
  await new Promise((ok, fail) => { ws.onopen = ok; ws.onerror = fail; });
  let seq = 0;
  ws.onmessage = ({ data }) => {
    const msg = JSON.parse(data);
    if (msg.id && pending.has(msg.id)) {
      const { ok, fail } = pending.get(msg.id); pending.delete(msg.id);
      msg.error ? fail(new Error(`${msg.error.message} (${msg.error.code})`)) : ok(msg.result);
    } else if (msg.method) listeners.forEach(l => l(msg));
  };
  const send = (method, params = {}, sessionId) => new Promise((ok, fail) => {
    const id = ++seq; pending.set(id, { ok, fail });
    ws.send(JSON.stringify({ id, method, params, sessionId }));
  });
  const once = (method, sessionId) => new Promise(ok => {
    const l = m => { if (m.method === method && m.sessionId === sessionId) { listeners.delete(l); ok(m.params); } };
    listeners.add(l);
  });
  return { send, once, close: () => ws.close() };
}

// PNG-in-ICO container: 6-byte header, a 16-byte entry per image, then the PNGs
function ico(images) {
  const head = Buffer.alloc(6 + 16 * images.length);
  head.writeUInt16LE(1, 2); head.writeUInt16LE(images.length, 4);
  let offset = head.length;
  images.forEach(({ size, png }, i) => {
    const e = 6 + 16 * i;
    head.writeUInt8(size % 256, e); head.writeUInt8(size % 256, e + 1);   // 0 means 256
    head.writeUInt16LE(1, e + 4); head.writeUInt16LE(32, e + 6);
    head.writeUInt32LE(png.length, e + 8); head.writeUInt32LE(offset, e + 12);
    offset += png.length;
  });
  return Buffer.concat([head, ...images.map(i => i.png)]);
}

const profile = await mkdtemp(join(tmpdir(), 'nightfall-media-'));
const chrome = spawn(findChrome(), [
  '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
  '--hide-scrollbars', '--no-first-run', '--no-default-browser-check', 'about:blank',
], { stdio: ['ignore', 'ignore', 'pipe'] });

try {
  const wsUrl = await new Promise((ok, fail) => {
    let log = '';
    chrome.stderr.on('data', d => { log += d; const m = log.match(/DevTools listening on (ws:\/\/\S+)/); if (m) ok(m[1]); });
    chrome.on('exit', code => fail(new Error(`Chrome exited (${code}) before DevTools was ready\n${log}`)));
  });
  const cdp = await connect(wsUrl);
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  const page = (method, params) => cdp.send(method, params, sessionId);
  await page('Page.enable');
  await page('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });

  async function render(src, w, h, jpeg) {
    await page('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
    const loaded = cdp.once('Page.loadEventFired', sessionId);
    await page('Page.navigate', { url: pathToFileURL(at(src)).href });
    await loaded;
    await page('Runtime.evaluate', { expression: 'document.fonts ? document.fonts.ready.then(() => 0) : 0', awaitPromise: true });
    const format = jpeg ? { format: 'jpeg', quality: jpeg } : { format: 'png' };
    const { data } = await page('Page.captureScreenshot', { ...format, clip: { x: 0, y: 0, width: w, height: h, scale: 1 } });
    return Buffer.from(data, 'base64');
  }
  async function save(out, buf, label) {
    await mkdir(dirname(at(out)), { recursive: true });
    await writeFile(at(out), buf);
    console.log(`  ${out.padEnd(30)} ${label.padEnd(10)} ${(buf.length / 1024).toFixed(1)} KB`);
  }

  for (const { src, out, w, h, jpeg } of JOBS) await save(out, await render(src, w, h, jpeg), `${w}×${h}`);
  const images = [];
  for (const size of FAVICON.sizes) images.push({ size, png: await render(FAVICON.src, size, size) });
  await save(FAVICON.out, ico(images), FAVICON.sizes.map(s => `${s}`).join('+'));

  await cdp.send('Browser.close').catch(() => {});
  cdp.close();
} finally {
  if (chrome.exitCode === null) await new Promise(ok => { chrome.once('exit', ok); chrome.kill(); });
  await rm(profile, { recursive: true, force: true, maxRetries: 3 });
}
