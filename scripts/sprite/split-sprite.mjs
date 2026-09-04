import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { basename, extname, join } from 'node:path';

const args = process.argv.slice(2);
const flip = args.includes('--flip');
const maxWArg = args.find(a => a.startsWith('--maxw='));
const maxW = maxWArg ? Number(maxWArg.split('=')[1]) : 0;
const [srcPath, outDir, ...names] = args.filter(a => !a.startsWith('--'));
if (!srcPath || !outDir) { console.error('usage: run.mjs <sheet.jpg> <outDir> [name1 name2 ...]'); process.exit(1); }
mkdirSync(outDir, { recursive: true });

const mime = { '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.png':'image/png', '.webp':'image/webp' }[extname(srcPath).toLowerCase()] || 'image/jpeg';
const dataUri = `data:${mime};base64,${readFileSync(srcPath).toString('base64')}`;
const pageJs = readFileSync(new URL('./split-page.js', import.meta.url), 'utf8');

const chrome = spawn('/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  ['--headless','--no-sandbox','--disable-gpu','--remote-debugging-port=9344','about:blank'], { stdio:'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
await sleep(2200);
const list = await (await fetch('http://127.0.0.1:9344/json/list')).json();
const ws = new WebSocket(list.find(t => t.type === 'page').webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener('open', r));
let id = 0; const pend = new Map();
ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
const send = (method, params) => new Promise(r => { const n = ++id; pend.set(n, r); ws.send(JSON.stringify({ id:n, method, params })); });

await send('Runtime.evaluate', { expression: pageJs });
const res = await send('Runtime.evaluate', {
  expression: `window.__split(${JSON.stringify(dataUri)}, { count: ${names.length}, flip: ${flip}, maxW: ${maxW} })`,
  awaitPromise: true, returnByValue: true });
chrome.kill();

if (res.result?.exceptionDetails || res.result?.result?.subtype === 'error') {
  console.error('split failed:', JSON.stringify(res).slice(0, 600)); process.exit(1);
}
const out = res.result.result.value;
console.log(`sheet ${out.width}x${out.height} — ${out.blobs} regions found, ${out.kept} kept`);
out.sprites.forEach((s, i) => {
  const name = names[i] || `${basename(srcPath, extname(srcPath))}-${i + 1}`;
  for (const fmt of ['png', 'webp']) {
    const b64 = s[fmt].slice(s[fmt].indexOf(',') + 1);
    writeFileSync(join(outDir, `${name}.${fmt}`), Buffer.from(b64, 'base64'));
  }
  console.log(`  ${name}  ${s.w}x${s.h}  (${s.area} px of ink)`);
});
