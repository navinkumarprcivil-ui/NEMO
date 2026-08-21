import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const index = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const app = readFileSync(new URL('../app.jsx', import.meta.url), 'utf8');
const payCreate = readFileSync(new URL('../api/pay-create.js', import.meta.url), 'utf8');

test('Firebase compat modules are deferred in dependency order', () => {
  const tags = [...index.matchAll(/<script\s+([^>]*firebasejs\/10\.12\.5\/firebase-([^"/]+)-compat\.js[^>]*)><\/script>/g)]
    .map(match => ({ attrs: match[1], module: match[2] }));
  assert.deepEqual(tags.map(tag => tag.module), ['app', 'auth', 'database', 'storage', 'app-check']);
  assert.equal(tags.every(tag => /\bdefer\b/.test(tag.attrs)), true);
  assert.equal(tags.some(tag => /\basync\b/.test(tag.attrs)), false);
});

test('payment requires the live non-anonymous owner session', () => {
  assert.match(app, /authUser\.isAnonymous\|\|authUser\.uid!==order\.userUid/);
  assert.match(app, /Your secure sign-in session has expired/);
});

test('checkout and server failures expose safe diagnostic references', () => {
  assert.match(app, /checkout-rejected:/);
  assert.match(app, /payment-session-failed/);
  assert.match(payCreate, /cashfree-credentials-rejected/);
  assert.match(payCreate, /cashfree-checkout-not-approved/);
});
