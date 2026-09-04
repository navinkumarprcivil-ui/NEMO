/**
 * The push sender is the half of notifications that has never existed. sw.js could always
 * receive one; nothing could send. These tests pin the decisions that are easy to undo by
 * accident and expensive to notice — a payload shape that silently stops reaching the app,
 * a pruning rule that unsubscribes every customer during an outage, or device tokens
 * becoming world-readable.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const push = readFileSync('lib/push.mjs', 'utf8');
const payments = readFileSync('lib/payments.mjs', 'utf8');
const rules = JSON.parse(readFileSync('database.rules.json', 'utf8')).rules;
const app = readFileSync('app.jsx', 'utf8');

test('the service-account token carries the messaging scope', () => {
  assert.match(payments, /auth\/firebase\.messaging/,
    'FCM rejects a token minted without firebase.messaging');
  assert.match(payments, /auth\/firebase\.database/,
    'the database scope every gateway depends on must survive');
  assert.match(payments, /export async function accessToken/,
    'lib/push.mjs imports this — un-exporting it breaks the sender');
});

test('messages are data-only so the app always builds the notification', () => {
  assert.doesNotMatch(push, /notification:\s*\{/,
    'a payload carrying `notification` is drawn by Android itself and onMessageReceived '
    + 'never runs, so the app loses control of the text, the channel and the tap target');
  assert.match(push, /data:\s*\{/, 'the payload must carry data');
  assert.match(push, /priority:\s*'HIGH'/,
    'a data-only message without HIGH priority is held through Doze');
});

test('every data value is stringified', () => {
  // FCM v1 rejects the whole request if any data value is not a string, and a number
  // slipping in would fail every send at once rather than one of them.
  const dataLine = push.match(/data:\s*\{[^}]*\}/);
  assert.ok(dataLine, 'expected a data object literal');
  for (const key of ['title', 'body', 'url', 'tag']) {
    assert.match(dataLine[0], new RegExp(`${key}:\\s*String\\(`),
      `${key} must be wrapped in String()`);
  }
});

test('a token is dropped only when FCM says it is permanently gone', () => {
  assert.match(push, /r\.status === 404/, '404 UNREGISTERED means the app is gone');
  assert.match(push, /UNREGISTERED\|INVALID_ARGUMENT/, 'the two final verdicts');
  // The failure that matters: treating 401/403/429/5xx as "gone" would delete every
  // customer's token during one bad afternoon at Google, and nothing would re-register
  // until each of them opened the app again.
  assert.doesNotMatch(push, /gone\s*=\s*true/,
    'gone must be derived from the status, never asserted unconditionally');
  assert.match(push, /if \(res\.ok\) sent \+= 1;\s*else if \(res\.gone\)/,
    'notifyUser must prune only on gone, not on any failure');
});

test('device tokens are private to the customer', () => {
  const pt = rules.pushTokens;
  assert.ok(pt, 'pushTokens needs a rule or the root denies it silently');
  const uid = pt.$uid;
  assert.ok(uid, 'tokens are stored per uid');
  assert.equal(uid['.read'], 'auth != null && auth.uid === $uid',
    'a token is a handle for reaching someone’s phone; nobody else reads it');
  assert.equal(uid['.write'], 'auth != null && auth.uid === $uid');
  assert.equal(uid.$device.$other['.validate'], false,
    'unknown fields must be rejected rather than stored');
});

test('the app registers under the signed-in uid, keyed by device', () => {
  assert.match(app, /window\.__nemoPushToken\s*=/,
    'MainActivity calls this global; renaming it silently ends registration');
  assert.match(app, /FB_DB\.ref\("pushTokens\/"\+uid\+"\/"\+dev\)/,
    'stored under the uid orders are keyed by, and per device so a refresh replaces itself');
  assert.match(app, /addEventListener\("nemo-fb-ready",savePushToken\)/,
    'the token usually arrives before auth resolves, so it must be re-tried on ready');
});
