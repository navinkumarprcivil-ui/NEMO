import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const index = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const app = readFileSync(new URL('../app.jsx', import.meta.url), 'utf8');
const payCreate = readFileSync(new URL('../api/pay-create.js', import.meta.url), 'utf8');
const payments = readFileSync(new URL('../lib/payments.mjs', import.meta.url), 'utf8');
/* Settlement moved to the multi-gateway layer when the single-gateway module was retired;
   these assertions follow the code rather than the filename. */
const gateways = readFileSync(new URL('../lib/gateways.mjs', import.meta.url), 'utf8');

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
  // Provider-agnostic now: which gateway ran depends on the order, so the shopper-facing
  // reference must not name one. What matters is that it is a short safe code and never a
  // raw gateway payload.
  assert.match(payCreate, /gateway-credentials-rejected/);
  assert.match(payCreate, /gateway-busy/);
  assert.doesNotMatch(app, /\bCashfree (is|couldn|rejected|checkout approval)/);
});

test('the gateway and Nemo use a production-safe payment expiry window', () => {
  // Gateways reject an expiry that is only a few minutes out, and the reservation must
  // outlive the window the shopper is given, or stock releases while payment is still open.
  assert.match(app, /const PAY_WINDOW_MIN = 20;/);
  assert.match(payCreate, /const PAYMENT_WINDOW_MS = 20 \* 60 \* 1000;/);
  // The same deadline is persisted on the Nemo order, not just handed to the gateway.
  assert.match(payCreate, /paymentDeadline: payBy,/);
});

test('a retry cannot rewind the payment countdown', () => {
  /* This read Math.max(deadline, now + PAYMENT_WINDOW_MS), which was meant to keep the
     original deadline and did the opposite — now + twenty minutes is always later than a
     deadline set when the order was placed. Every tap of Pay reset the clock to 20:00, and
     an order could be held unpaid indefinitely, with its stock reserved, by tapping Pay. */
  // Scoped to the assignment, so the comment recording the old bug can keep quoting it.
  assert.doesNotMatch(payCreate, /const expiresAt = Math\.max/,
    'the deadline must never be extended by a retry');
  assert.match(payCreate, /const payBy = deadline \|\| \(Date\.now\(\) \+ PAYMENT_WINDOW_MS\);/,
    'an existing deadline is kept; only a first attempt mints one');
  assert.match(payCreate, /const expiresAt = payBy;/,
    'the gateway session ends when the order window does, not on a clock of its own');
});

test('a retry too close to the deadline is refused, not served', () => {
  /* PhonePe floors a checkout expiry at five minutes. A session opened with less than that
     left would outlive the order's own deadline and could still take money after the order
     auto-cancelled — and finalizePayment refuses to settle a cancelled order, so the money
     would arrive against nothing. */
  assert.match(payCreate, /const SESSION_MIN_MS = 5 \* 60 \* 1000;/);
  assert.match(payCreate, /if \(payBy - Date\.now\(\) < SESSION_MIN_MS\) \{/);
  assert.match(payCreate, /error: 'payment-window-closing'/);
  assert.match(app, /m==="payment-window-closing"/,
    'and the shopper is told why, rather than watching the button do nothing');
});

test('customer checkout has no manual proof or payment-link fallback', () => {
  assert.doesNotMatch(app, /razorpayLink/);
  assert.doesNotMatch(app, /Tap to upload screenshot/);
  assert.doesNotMatch(app, /Submit Payment & Confirm Order/);
  assert.doesNotMatch(app, /Enter your payment reference and attach a screenshot/);
  assert.match(app, /Integrated gateway checkout/);
  assert.match(app, /Retry secure payment/);
  assert.match(app, /verified payment status returned by Cashfree/);
  assert.match(app, /const outcome=await payWithGateway\(order\);/);
});

test('checkout uses the compact gateway copy and actions', () => {
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
  assert.match(gateways, /paymentStatus: sandbox \? 'Test Paid' : 'Verified'/);
  assert.match(gateways, /status: sandbox \? 'Payment Review' : 'Confirmed'/);
  assert.match(gateways, /await settleReferralsAfterPayment\(order, userUid, orderId\)/);
  assert.match(app, /const ORDER_STATUSES = \["Confirmed","Shipped","Delivered"\]/);
  assert.match(app, /your order is confirmed automatically/);
});

test('a payment that cannot be reopened cancels and returns the items to the cart', () => {
  /* PhonePe derives its merchantOrderId from the Nemo order id, so the id is spent by the
     first checkout: a customer who opens the gateway, comes back without paying and taps Pay
     gets a duplicate refusal for as long as the order exists. That reached them as a generic
     "we couldn't open a payment session", leaving a button on screen that could never work.
     Razorpay re-uses its order and retries cleanly, which is why this turns on whether a
     session was already opened rather than on which gateway it was. */
  assert.match(payCreate, /const retry = !!\(order\.gateway && order\.gatewayOrderId\);/);
  assert.match(payCreate, /if \(!session && retry\) \{/);
  assert.match(payCreate, /error: 'payment-retry-unavailable'/);
  assert.match(app, /m==="payment-retry-unavailable"/);
  assert.match(app, /if\(onCheckoutCancelled\) await onCheckoutCancelled\(order\);/,
    'the items go back to the cart rather than the customer being left with a dead button');
});
