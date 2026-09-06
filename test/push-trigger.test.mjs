/**
 * What decides that a notification goes out. The sender (test/push-sender.test.mjs) is the
 * half that talks to FCM; this is the half that chooses who and when, and every assertion
 * here is a failure mode that would be silent in production — a customer told twice that
 * their order shipped, a reminder loop retrying every fifteen minutes forever, or a queue
 * row becoming a way to put chosen words on someone's phone.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const cron = readFileSync('api/cron-push.js', 'utf8');
const worker = readFileSync('cloudflare/worker.js', 'utf8');
const app = readFileSync('app.jsx', 'utf8');
const rules = JSON.parse(readFileSync('database.rules.json', 'utf8')).rules;

test('the cron is wired into the schedule and reachable for a manual run', () => {
  assert.match(worker, /import cronPush from '\.\.\/api\/cron-push\.js'/);
  assert.match(worker, /\['\/api\/cron-push', cronPush\]/, 'needed to trigger a run by hand');
  assert.match(worker, /runCron\(env, 'cron-push', cronPush\)/, 'must actually run on the cron');
  assert.match(worker, /runCron\(env, 'cron-tank-cleanup', tankCleanup\)/,
    'the cleanup that shared this cron must keep running');
});

test('a failing cron cannot take the other one down with it', () => {
  // Both were once one function that threw on the first failure. Chaining them again would
  // mean a push outage silently leaves expired showcase entries on the home page.
  const sched = worker.match(/async scheduled\([^)]*\)\s*\{[\s\S]*?\n  \},/);
  assert.ok(sched, 'expected a scheduled handler');
  assert.equal((sched[0].match(/ctx\.waitUntil\(/g) || []).length, 2,
    'each cron needs its own waitUntil so one rejection does not cancel the other');
});

test('the queue says who and which order, never what to say', () => {
  assert.match(app, /FB_DB\.ref\("pushQueue"\)\.push\(\{uid:String\(uid\),orderId:String\(orderId\),kind:String\(kind\),at:Date\.now\(\)\}\)/,
    'a row carrying title/body would let anyone who can write it choose the words');
  assert.match(cron, /const order = await readOrder\(uid, orderId\);/,
    'the message must be composed from the order, not from the row');
  assert.match(cron, /order\.status === spec\.status/,
    're-confirm the state rather than trusting the row that asked for the send');
});

test('order notices fire on the crossing only', () => {
  assert.match(app, /updated\.status!==prevStatus && PUSH_ON\[updated\.status\] && updated\.userUid/,
    're-saving a shipped order to fix a courier number must not notify again');
  assert.match(app, /const PUSH_ON=\{Shipped:"shipped",Delivered:"delivered"\}/,
    'Confirmed is deliberately absent — it happens while the customer is watching the screen');
});

test('each kind names the status the order must actually be in', () => {
  // The row asks for a send; ORDER_PUSH decides whether the order still deserves one, so a
  // stale or reverted order cannot be announced.
  assert.match(cron, /shipped: \{\s*status: 'Shipped'/);
  assert.match(cron, /delivered: \{\s*status: 'Delivered'/);
  assert.match(cron, /tag: `order-\$\{orderId\}`/,
    'one tag per order, so "arrived" replaces "on the way" rather than stacking');
});

test('back-in-stock alerts read the waiting list instead of watching stock', () => {
  // restock/<pid> only holds products that ran out with someone waiting, so it is small by
  // construction. Asking "is this back yet?" also catches stock returning by any route.
  assert.match(cron, /const waiting = await dbGet\('restock'\)|await dbGet\('restock'\)/);
  assert.match(cron, /if \(!Number\.isFinite\(stock\) \|\| stock <= 0\) continue;/);
  assert.match(cron, /await dbDelete\(path\)\.catch\(\(\) => \{\}\);/,
    'the list is a one-shot request — leaving it would re-notify on every tick');
  assert.match(cron, /const SUB_MAX_AGE = 60 \* 24 \* 60 \* 60 \* 1000;/,
    'a months-old request reads as spam when it finally fires');
});

test('a queue row is always removed, sent or not', () => {
  // Left behind, a row that cannot send is retried every fifteen minutes forever; and a
  // shipping notice delivered a day late is worse than none.
  assert.match(cron, /await dbDelete\(`pushQueue\/\$\{encodeURIComponent\(key\)\}`\)/);
  assert.match(cron, /const STALE = 24 \* 60 \* 60 \* 1000;/, 'stale rows must expire');
});

test('care reminders advance even when nothing could be sent', () => {
  assert.match(cron, /nextAt: now \+ WEEK, sentAt: now/,
    'a customer with no registered device would otherwise be retried on every tick forever');
  assert.match(cron, /if \(Number\(\(row && row\.sentAt\) \|\| 0\) >= nextAt\) continue;/,
    'guards a tick that runs twice');
});

test('only the reminder date leaves the device', () => {
  assert.match(app, /ref\.set\(\{nextAt,at:Date\.now\(\)\}\)/,
    'the tank profile, photo, stock list and test log stay in localStorage');
  assert.match(app, /if\(!tank\|\|!tank\.remind\|\|!tank\.litres\)\{ try\{ ref\.remove\(\)/,
    'opting out must delete the row, not flag it');
  assert.match(app, /Number\(d&&d\.nextAt\)\|\|\(Date\.now\(\)\+CARE_INTERVAL_DAYS\*864e5\)/,
    'a tank with no history reads as due now; pushing the instant someone flicks the switch '
    + 'is not what they asked for');
});

test('the two new nodes are locked to the right writer', () => {
  const care = rules.careReminders.$uid;
  assert.equal(care['.read'], 'auth != null && auth.uid === $uid');
  assert.equal(care['.write'], 'auth != null && auth.uid === $uid');
  assert.equal(care.$other['.validate'], false);

  const queue = rules.pushQueue.$id;
  assert.ok(!('.read' in rules.pushQueue), 'nobody reads the queue but the service account');
  assert.match(queue['.write'], /adminAccess\/permissions\/orders/,
    'a customer who could write here could aim a notification at another customer');
  assert.equal(queue.kind['.validate'],
    "newData.val() === 'shipped' || newData.val() === 'delivered'");
  assert.equal(queue.$other['.validate'], false);
});
