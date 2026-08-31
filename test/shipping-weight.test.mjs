/**
 * What a first visit actually downloads.
 *
 *   node --test test/shipping-weight.test.mjs
 *
 * These are not style rules — each one is a regression that was live. They guard the two ways
 * this store has quietly got heavier: precaching something the fast path never runs, and
 * pointing a share card at the large copy of an asset that also exists small.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url));
const txt  = (p) => read(p).toString('utf8');

test('the service worker precaches only what a normal visit runs', () => {
  const sw = txt('sw.js');
  const m = sw.match(/const ASSETS = \[([^\]]*)\]/);
  assert.ok(m, 'ASSETS list not found in sw.js');
  const list = m[1];
  // index.html loads the precompiled app.js; app.jsx is the compile-in-browser fallback and
  // must never be part of the install payload. It cannot be needed offline either, because
  // app.js is precached on the same line.
  assert.ok(!/app\.jsx/.test(list), 'sw.js must not precache app.jsx — it is the fallback path, not the fast path');
  assert.ok(/app\.js['"]/.test(list), 'sw.js must still precache app.js');
  assert.ok(/index\.html/.test(list), 'sw.js must still precache the shell');
  // Precaching a large image is the other way this list has grown before.
  assert.ok(!/\.png/.test(list), 'precache the WebP logo, not a PNG');
});

test('share cards point at the small banner, not the megabyte one', () => {
  for (const f of ['lib/catalog.mjs', 'api/share.js', 'index.html', 'cloudflare/worker.js']) {
    assert.ok(!/share-banner\.png/.test(txt(f)), `${f} must use share-banner.jpg — the .png is ~1 MB and scrapers cap preview images well below it`);
  }
});

test('the shipped bundle stays within a budget a phone can open quickly', () => {
  // Transfer size, which is what a 4G connection actually pays — Cloudflare compresses.
  const gz = (p) => gzipSync(read(p), { level: 9 }).length;
  const appGz = gz('app.js'), shellGz = gz('index.html');
  // Headroom above today's size, so ordinary work does not trip this, but a step change does.
  assert.ok(appGz < 230_000, `app.js is ${appGz} bytes gzipped — over the 230 KB budget`);
  assert.ok(shellGz < 40_000, `index.html is ${shellGz} bytes gzipped — over the 40 KB budget`);
  // The owner-only Admin UI must stay out of the shopper's bundle.
  assert.ok(gz('admin.js') > 20_000, 'admin.js looks empty — the Admin split may have collapsed into app.js');
});
