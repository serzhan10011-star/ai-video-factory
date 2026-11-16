// Usage: node render.mjs test t1,t2,...   |  node render.mjs frames <start> <end> <out.mp4>
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('/opt/node-tools/node_modules/playwright/index.js');
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const ROOT = path.dirname(new URL(import.meta.url).pathname);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  fs.readFile(p, (e, d) => { if (e) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': types[path.extname(p)] || 'application/octet-stream' }); res.end(d); });
});
await new Promise(r => server.listen(0, r));
const port = server.address().port;

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') console.log('[page]', m.text().slice(0, 300)); });
page.on('pageerror', e => console.log('[pageerror]', e.message));
await page.goto(`http://localhost:${port}/index.html`);
await page.waitForFunction(() => window.__ready || window.__error, null, { timeout: 600000 });
const err = await page.evaluate(() => window.__error);
if (err) { console.error(err); process.exit(1); }

const mode = process.argv[2];
if (mode === 'test') {
  fs.mkdirSync(path.join(ROOT, 'test'), { recursive: true });
  for (const t of process.argv[3].split(',').map(Number)) {
    const t0 = Date.now();
    await page.evaluate(t => window.renderAt(t), t);
    await page.screenshot({ path: path.join(ROOT, 'test', `f_${t.toFixed(2)}.jpg`), type: 'jpeg', quality: 85 });
    console.log('frame', t, Date.now() - t0, 'ms', await page.evaluate(() => [...document.querySelectorAll('.label')].filter(e=>+e.style.opacity>0).map(e=>e.textContent+'@'+e.style.left+','+e.style.top).join(' | ')));
  }
} else {
  const fps = 24; const [s, e] = [Number(process.argv[3]), Number(process.argv[4])]; const out = process.argv[5];
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '16', '-pix_fmt', 'yuv420p', '-r', String(fps), out], { stdio: ['pipe', 'inherit', 'inherit'] });
  const t0 = Date.now();
  for (let f = s; f < e; f++) {
    await page.evaluate(t => window.renderAt(t), f / fps);
    const buf = await page.screenshot({ type: 'jpeg', quality: 95 });
    if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
    if ((f - s) % 30 === 0) console.log(`[${s}-${e}] frame ${f} ${((Date.now() - t0) / (f - s + 1)).toFixed(0)} ms/f`);
  }
  ff.stdin.end(); await new Promise(r => ff.on('close', r));
}
await browser.close(); server.close();
