/** Announcing a new care guide.
 *
 * The switch on the Care Guides page promised "tell me when there's a new guide" and nothing
 * in the system ever sent one. This is the sender that makes the promise true, and the two
 * ways it could go badly wrong on the day it is turned on.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const cron = readFileSync('api/cron-push.js', 'utf8');
const rules = JSON.parse(readFileSync('database.rules.json', 'utf8'));
const fn = cron.slice(cron.indexOf('async function sendNewGuide'), cron.indexOf('async function sendCareReminders'));

test('the first ever tick seeds the marker and sends nothing', () => {
  // Otherwise turning this on announces every guide the shop has ever written, at once, to
  // everyone who subscribed. That is the one mistake here that cannot be taken back.
  assert.match(fn, /if \(!seen\) \{ await dbPatch\('pushState\/guides', \{ lastAt: newest\.at \}\)[\s\S]{0,40}return 0; \}/);
});

test('a guide is never announced twice', () => {
  assert.match(fn, /if \(newest\.at <= seen\) return 0;/);
  // Advanced even when nothing was delivered — a guide must not be re-announced merely because
  // nobody happened to be subscribed on the tick it appeared.
  const tail = fn.slice(fn.lastIndexOf('for (const uid'));
  assert.match(tail, /await dbPatch\('pushState\/guides', \{ lastAt: newest\.at \}\)/);
});

test('a bulk edit does not fill the notification shade', () => {
  // One notification naming the newest, not one per guide, and one tag so an unread
  // announcement is replaced rather than stacked under the next.
  assert.match(fn, /tag: 'care-guide'/);
  assert.doesNotMatch(fn, /for \(const g of list\)[\s\S]{0,400}notifyUser/);
});

test('a guide dated in the future cannot mute every real one after it', () => {
  assert.match(fn, /if \(!at \|\| at > now\) continue;/);
});

test('the subscription is readable and writable only by its owner', () => {
  const g = rules.rules.guideSubs && rules.rules.guideSubs.$uid;
  assert.ok(g, 'guideSubs has no rule, so the root ".write": false denies every write silently');
  assert.equal(g['.read'], 'auth != null && auth.uid === $uid');
  assert.equal(g['.write'], 'auth != null && auth.uid === $uid');
  assert.equal(g.$other['.validate'], false, 'a subscription row carries one timestamp, nothing else');
});

test('the new sender is actually wired into the tick', () => {
  assert.match(cron, /const guides = await sendNewGuide\(now\);/);
  assert.match(cron, /res\.status\(200\)\.json\(\{ ok: true, orders, care, restock, guides \}\);/);
});
