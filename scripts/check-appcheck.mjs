/**
 * Guard the App Check ordering in tryInitFirebase().
 *
 *   npm i --no-save playwright && npx playwright install chromium
 *   node scripts/check-appcheck.mjs
 *   CHROME_PATH=/path/to/chrome node scripts/check-appcheck.mjs
 *
 * Under App Check enforcement, a request made before `activate()` is refused.
 * The Firebase tags in index.html are `async` and land in any order, so
 * app-check-compat routinely arrives after auth and database — and if init went
 * ahead at that moment the page would run unattested for its whole life, with
 * nothing in the UI to say so. That is the failure this protects against, and
 * it is invisible until orders stop saving.
 *
 * The store's real Firebase is never contacted: the SDK URLs are answered with
 * stubs that record the order they are called in, which is the only thing being
 * asserted here.
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8120;
const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.jsx': 'text/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.css': 'text/css',
  '.webmanifest': 'application/manifest+json',
  '.jpg': 'image/jpeg',
};

// React is fetched from a CDN by index.html. Point REACT_DIR at a directory
// holding react-18.3.1.production.min.js and react-dom-18.3.1.production.min.js
// to run this offline.
const REACT_DIR = process.env.REACT_DIR || '';

const server = http.createServer((req, res) => {
  let rel = decodeURIComponent(req.url.split('?')[0]);
  if (rel === '/') rel = '/index.html';
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404);
    return res.end('not found');
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

/** Stands in for firebase-app/auth/database/storage, recording call order. */
const CORE_STUB = `
window.__calls = [];
const ref = {
  on(){}, off(){}, child(){ return ref }, orderByChild(){ return ref },
  limitToLast(){ return ref }, equalTo(){ return ref },
  once(){ return Promise.resolve({ val:()=>null, exists:()=>false }) },
  get(){ return Promise.resolve({ val:()=>null, exists:()=>false }) },
  set(){ return Promise.resolve() }, update(){ return Promise.resolve() },
  remove(){ return Promise.resolve() }, push(){ return { key:'k', then:f=>f() } },
};
window.firebase = {
  apps: [],
  initializeApp(){ __calls.push('initializeApp'); this.apps.push({}); return {} },
  database(){ __calls.push('database'); return { ref:()=>ref, goOnline(){}, goOffline(){} } },
  auth(){ __calls.push('auth'); return {
    currentUser: null,
    onAuthStateChanged(cb){ setTimeout(()=>cb(null), 0); return ()=>{} },
    signInAnonymously(){ return Promise.resolve({ user:null }) },
    signOut(){ return Promise.resolve() },
  } },
  storage(){ __calls.push('storage'); return { ref:()=>({ child:()=>({
    put(){ return { on(){}, then:f=>f() } }, getDownloadURL(){ return Promise.resolve('') },
  }) }) } },
};`;

const APPCHECK_STUB = `
window.firebase.appCheck = function(){
  return { activate(_p, auto){ window.__calls.push('appCheck.activate:' + auto) } };
};
window.firebase.appCheck.ReCaptchaV3Provider = function(key){
  window.__calls.push('provider:' + key);
};`;

/**
 * @param {boolean} withAppCheck serve app-check-compat at all
 * @param {number}  delayMs      how late it arrives
 */
async function run(withAppCheck, delayMs = 0) {
  const browser = await chromium.launch(
    process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {},
  );
  const page = await browser.newPage();

  await page.route('**', (route) => {
    const url = route.request().url();
    const host = new URL(url).hostname;
    if (host === 'localhost') return route.continue();

    if (REACT_DIR && host === 'unpkg.com' && url.includes('react-dom')) {
      return route.fulfill({ status: 200, contentType: 'text/javascript', body: fs.readFileSync(path.join(REACT_DIR, 'react-dom-18.3.1.production.min.js')) });
    }
    if (REACT_DIR && host === 'unpkg.com' && url.includes('react@')) {
      return route.fulfill({ status: 200, contentType: 'text/javascript', body: fs.readFileSync(path.join(REACT_DIR, 'react-18.3.1.production.min.js')) });
    }
    if (url.includes('firebase-app-check-compat')) {
      if (!withAppCheck) return route.abort();
      return new Promise((r) =>
        setTimeout(
          () => r(route.fulfill({ status: 200, contentType: 'text/javascript', body: APPCHECK_STUB })),
          delayMs,
        ),
      );
    }
    if (url.includes('firebase-app-compat')) {
      return route.fulfill({ status: 200, contentType: 'text/javascript', body: CORE_STUB });
    }
    if (url.includes('firebase-')) {
      return route.fulfill({ status: 200, contentType: 'text/javascript', body: '' });
    }
    return route.abort();
  });

  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded' });
  await page
    .waitForFunction(() => window.__calls && window.__calls.includes('database'), { timeout: 15000 })
    .catch(() => {});
  const calls = await page.evaluate(() => window.__calls || []);
  await browser.close();
  return calls;
}

const results = [];
const check = (name, ok, detail) => {
  results.push(ok);
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

await new Promise((r) => server.listen(PORT, r));

try {
  const onTime = await run(true, 0);
  const act = onTime.findIndex((c) => c.startsWith('appCheck.activate'));
  const db = onTime.indexOf('database');
  const auth = onTime.indexOf('auth');
  check(
    'activate() runs before database() and auth()',
    act > -1 && db > -1 && act < db && act < auth,
    onTime.slice(0, 4).join(' → '),
  );
  check(
    'the registered reCAPTCHA site key is used',
    onTime.some((c) => c === 'provider:6LeLCnMtAAAAANCr565qco_YgRKCSMtmxShfo3Jr'),
  );
  check('automatic token refresh is on', onTime.includes('appCheck.activate:true'));

  // The reason the grace exists: async tags mean this one is often last.
  const late = await run(true, 600);
  const lateAct = late.findIndex((c) => c.startsWith('appCheck.activate'));
  check(
    'a late app-check script is still activated, not skipped',
    lateAct > -1 && lateAct < late.indexOf('database'),
    late.slice(0, 3).join(' → '),
  );

  // …and the reason it is bounded: a shopper behind a blocked CDN still shops.
  const blocked = await run(false);
  check('the store still connects when App Check is blocked', blocked.includes('database'));

  const tooLate = await run(true, 2500);
  check(
    'past the grace the store connects rather than waiting',
    tooLate.includes('database'),
    tooLate.slice(0, 3).join(' → '),
  );
} finally {
  server.close();
}

const failed = results.filter((ok) => !ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
