/**
 * What a first-time visitor actually downloads before the store paints.
 *
 *   npm i --no-save playwright && npx playwright install chromium
 *   node scripts/check-firstpaint.mjs
 *
 * CHROME_PATH=/path/to/chrome reuses an existing Chromium.
 *
 * The two things this exists to stop coming back:
 *
 *   · index.html carrying the aquarium sprites inline. They were 313 KB of
 *     base64 in the middle of the document — bytes the browser must parse
 *     before it can paint — and they are drawn only at >=1000px wide, so every
 *     shopper on a phone downloaded both and saw neither.
 *   · app.js being fetched twice. It is preloaded in <head> and then read with
 *     fetch(); a preload is only reused when its credentials mode matches the
 *     request that follows, and a mismatch is silent — the browser just pulls
 *     the whole 850 KB bundle down again. The pairing is correct today, and
 *     this is what stops an innocuous-looking edit to either half undoing it.
 *
 * Both are invisible in the source and obvious in a request log, which is why
 * this is a browser check and not a unit test.
 *
 * React, Firebase and the CDN scripts are blocked, so the numbers are about
 * this repo and not the network. That has one consequence worth knowing: with
 * React missing the app never defines `NemoStore`, so the loader's Babel
 * fallback fires and pulls app.jsx. That is correct behaviour for a bundle that
 * did not run, and it is why the byte budget below measures the shell — the
 * document and everything that is not the app's own code — rather than the
 * page total, which would be dominated by a fallback no real visitor takes.
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8097;
const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.jsx': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
  '.xml': 'application/xml',
};

// Deliberately close to the real numbers. A limit with room to spare in it is a
// limit that lets the next 200 KB in without anyone noticing.
const HTML_BUDGET = 90_000;
/** The shell: everything a phone downloads that is not the app bundle itself. */
const SHELL_BUDGET = 100_000;   // includes the two aquarium sprites (~37 KB)
const APP_CODE = new Set(['/app.js', '/app.jsx']);

let failures = 0;
const check = (ok, label) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}`);
  if (!ok) failures++;
};

function serve(hits) {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html';
    // Ground truth. A response event fires for a preload that was reused as
    // well as for the fetch that reused it, so counting in the browser cannot
    // tell "downloaded twice" from "downloaded once and reused" — the server
    // can.
    hits.set(`/${rel}`, (hits.get(`/${rel}`) || 0) + 1);
    const file = path.join(ROOT, rel);
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404).end('not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(PORT, () => resolve(server)));
}

async function visit(browser, { width, height, isMobile }) {
  const context = await browser.newContext({
    viewport: { width, height },
    isMobile,
    hasTouch: isMobile,
    // A first-time visitor: no service worker, no cache, nothing warm.
    serviceWorkers: 'block',
  });
  const page = await context.newPage();

  const requests = [];
  page.on('response', async (res) => {
    const url = res.url();
    if (!url.startsWith(`http://localhost:${PORT}`)) return;
    let size = 0;
    try {
      size = (await res.body()).length;
    } catch (e) {}
    requests.push({ path: new URL(url).pathname, size });
  });

  // Third-party scripts are not what this measures, and letting them run makes
  // the run depend on the network being up.
  await page.route('**', (route) =>
    route.request().url().startsWith(`http://localhost:${PORT}`) ? route.continue() : route.abort()
  );

  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
  await page.waitForTimeout(1500);

  await context.close();
  return requests;
}

const hits = new Map();
const server = await serve(hits);
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });

try {
  const total = (reqs) => reqs.reduce((n, r) => n + r.size, 0);
  const of = (reqs, p) => reqs.filter((r) => r.path === p);

  const desktop = await visit(browser, { width: 1280, height: 900, isMobile: false });
  const mobile = await visit(browser, { width: 390, height: 844, isMobile: true });

  const html = of(desktop, '/index.html').concat(of(desktop, '/'))[0];
  console.log(`\nindex.html  ${html.size} bytes`);
  check(
    html.size < HTML_BUDGET,
    `the document is under ${HTML_BUDGET / 1000} KB (${(html.size / 1000).toFixed(1)} KB)`
  );
  check(
    !fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').includes('data:image/png;base64,'),
    'no base64 image is inlined in the document'
  );

  // Two page loads have happened by now, so one download each is the floor.
  const bundleHits = hits.get('/app.js') || 0;
  console.log(`app.js      ${bundleHits} download(s) across 2 visits`);
  check(bundleHits === 2, `app.js is downloaded once per visit, not twice (${bundleHits} across 2)`);

  const sprites = (reqs) => reqs.filter((r) => /\/assets\/fish-/.test(r.path));
  console.log(`\ndesktop     ${total(desktop)} bytes over ${desktop.length} requests`);
  console.log(`mobile      ${total(mobile)} bytes over ${mobile.length} requests`);

  // The fish are on every screen now (they are 37 KB of WebP, not 313 KB of
  // inline base64), so both viewports fetch them — the budget below is what
  // keeps that honest.
  check(sprites(desktop).length > 0, 'a wide screen fetches the aquarium sprites');
  check(sprites(mobile).length > 0, 'a phone fetches them too, and draws them');
  check(
    sprites(desktop).every((r) => r.path.endsWith('.webp')),
    'the sprites come across as WebP, not as the PNG fallback'
  );
  const shell = mobile.filter((r) => !APP_CODE.has(r.path) && r.path !== '/index.html' && r.path !== '/');
  console.log(`mobile shell ${total(shell)} bytes: ${shell.map((r) => r.path).join(', ') || 'nothing'}`);
  check(
    total(shell) < SHELL_BUDGET,
    `a phone downloads under ${SHELL_BUDGET / 1000} KB besides the document and the bundle (${(total(shell) / 1000).toFixed(1)} KB)`
  );

  console.log(failures ? `\n${failures} failing` : '\nFirst paint OK');
} finally {
  await browser.close();
  server.close();
}

process.exit(failures ? 1 : 0);
