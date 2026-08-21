import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const index = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const app = readFileSync(new URL('../app.jsx', import.meta.url), 'utf8');
const payCreate = readFileSync(new URL('../api/pay-create.js', import.meta.url), 'utf8');
const payments = readFileSync(new URL('../lib/payments.mjs', import.meta.url), 'utf8');

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

test('Cashfree and Nemo use a production-safe payment expiry window', () => {
  assert.match(app, /const PAY_WINDOW_MIN = 20;/);
  assert.match(payCreate, /const CASHFREE_ORDER_WINDOW_MS = 20 \* 60 \* 1000;/);
  assert.match(payCreate, /paymentDeadline = Math\.max\(deadline \|\| 0, Date\.now\(\) \+ CASHFREE_ORDER_WINDOW_MS\)/);
  assert.match(payCreate, /order_expiry_time: new Date\(paymentDeadline\)\.toISOString\(\)/);
  assert.match(payCreate, /paymentDeadline,/);
});

test('customer checkout has no manual proof or payment-link fallback', () => {
  assert.doesNotMatch(app, /razorpayLink/);
  assert.doesNotMatch(app, /Tap to upload screenshot/);
  assert.doesNotMatch(app, /Submit Payment & Confirm Order/);
  assert.doesNotMatch(app, /Enter your payment reference and attach a screenshot/);
  assert.match(app, /Cashfree integrated checkout/);
  assert.match(app, /Retry secure payment/);
  assert.match(app, /verified payment status returned by Cashfree/);
  assert.match(app, /const outcome=await payWithGateway\(order\);/);
});

test('checkout uses the compact Cashfree copy and actions', () => {
  assert.match(app, /placing\?"Checking stock…":"Place Order"/);
  assert.match(app, />Complete payment</);
  assert.match(app, /UPI · Cards · Netbanking · Wallets · Auto-verified/);
  assert.match(app, /Pay later/);
  assert.match(app, /Cancel payment/);
  assert.match(app, />＋ Add more items</);
  assert.match(app, />✏ Edit Address</);
  assert.doesNotMatch(app, /Prepaid order — pay/);
  assert.doesNotMatch(app, /You'll complete payment on the next step/);
  assert.doesNotMatch(app, /You can still adjust quantities/);
  assert.doesNotMatch(app, /I'll pay later — go to Orders/);
});

test('verified production payments confirm orders automatically', () => {
  assert.match(payments, /paymentStatus: sandbox \? 'Test Paid' : 'Verified'/);
  assert.match(payments, /status: sandbox \? 'Payment Review' : 'Confirmed'/);
  assert.match(payments, /await settleReferralsAfterPayment\(order, userUid, orderId\)/);
  assert.match(app, /const ORDER_STATUSES = \["Confirmed","Shipped","Delivered"\]/);
  assert.match(app, /your order is confirmed automatically/);
});
