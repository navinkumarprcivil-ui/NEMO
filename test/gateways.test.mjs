/**
 * The multi-gateway layer.
 *
 * Two classes of bug are worth real tests here, because both are silent and both cost money:
 *
 *   1. Money units. Cashfree speaks rupees, Razorpay speaks integer paise. A float or a
 *      missing ×100 does not throw — it charges the wrong amount.
 *   2. Signatures. Verification that always returns true is indistinguishable from working
 *      code right up until someone forges a payment callback.
 *
 * Routing gets the same attention: an existing Cashfree order must keep going to Cashfree
 * after the preferred gateway changes, or historical orders stop being refundable.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

process.env.RAZORPAY_KEY_ID = 'rzp_test_abc123';
process.env.RAZORPAY_KEY_SECRET = 'secret_for_tests';
process.env.RAZORPAY_WEBHOOK_SECRET = 'webhook_secret_for_tests';

const {
  toPaise, fromPaise, razorpayMode, razorpayReceiptFor,
  razorpayCheckoutSignatureValid, razorpayWebhookSignatureValid,
  availableProviders, providerById, providerForOrder,
} = await import('../lib/gateways.mjs');

test('rupees convert to integer paise without float drift', () => {
  assert.equal(toPaise(1), 100);
  assert.equal(toPaise(1.1), 110);
  // 19.99 * 100 is 1998.9999999999998 in IEEE 754 — truncating would undercharge by a paisa.
  assert.equal(toPaise(19.99), 1999);
  assert.equal(toPaise(0.1 + 0.2), 30);
  assert.equal(toPaise(1234.56), 123456);
  assert.ok(Number.isInteger(toPaise(99.995)), 'paise must always be an integer');
  assert.equal(toPaise(undefined), 0);
});

test('paise convert back to the rupee amount the order was priced in', () => {
  for (const rupees of [1, 19.99, 250, 1234.56, 0.5]) {
    assert.equal(fromPaise(toPaise(rupees)), rupees, `round trip failed for ${rupees}`);
  }
});

test('mode is derived from the key, so it cannot disagree with a separate setting', () => {
  assert.equal(razorpayMode(), 'sandbox');
  process.env.RAZORPAY_KEY_ID = 'rzp_live_xyz789';
  assert.equal(razorpayMode(), 'production');
  process.env.RAZORPAY_KEY_ID = 'rzp_test_abc123';
  assert.equal(razorpayMode(), 'sandbox');
});

test('the receipt is sanitised and stays within Razorpay\'s 40-character limit', () => {
  assert.equal(razorpayReceiptFor('abc123'), 'nemo_abc123');
  assert.ok(!/[^A-Za-z0-9_-]/.test(razorpayReceiptFor('a/b c:d#e')), 'unsafe characters must be stripped');
  assert.ok(razorpayReceiptFor('x'.repeat(200)).length <= 40);
});

test('a checkout signature verifies only for the exact order and payment it was made for', () => {
  const sign = (data) => crypto.createHmac('sha256', 'secret_for_tests').update(data).digest('hex');
  const good = sign('order_A|pay_B');
  assert.equal(razorpayCheckoutSignatureValid('order_A', 'pay_B', good), true);
  // Swapping either id must invalidate it — otherwise a real signature from one payment
  // could be replayed to confirm a different, unpaid order.
  assert.equal(razorpayCheckoutSignatureValid('order_C', 'pay_B', good), false);
  assert.equal(razorpayCheckoutSignatureValid('order_A', 'pay_C', good), false);
  assert.equal(razorpayCheckoutSignatureValid('order_A', 'pay_B', sign('order_A|pay_B') + 'x'), false);
  for (const bad of ['', null, undefined, 'not-a-signature']) {
    assert.equal(razorpayCheckoutSignatureValid('order_A', 'pay_B', bad), false);
  }
});

test('a webhook signature is checked against the raw body and the webhook secret', () => {
  const raw = JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: { order_id: 'order_A' } } } });
  const good = crypto.createHmac('sha256', 'webhook_secret_for_tests').update(raw).digest('hex');
  assert.equal(razorpayWebhookSignatureValid(raw, good), true);
  // Signed with the API key secret instead of the webhook secret — a real and easy mix-up.
  const wrongSecret = crypto.createHmac('sha256', 'secret_for_tests').update(raw).digest('hex');
  assert.equal(razorpayWebhookSignatureValid(raw, wrongSecret), false);
  // A single byte changed in the body must invalidate it.
  assert.equal(razorpayWebhookSignatureValid(raw.replace('order_A', 'order_B'), good), false);
  assert.equal(razorpayWebhookSignatureValid(raw, ''), false);
});

test('a webhook is parsed only when its signature holds', () => {
  const rzp = providerById('razorpay');
  const raw = JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: { order_id: 'order_A', id: 'pay_B' } } } });
  const sig = crypto.createHmac('sha256', 'webhook_secret_for_tests').update(raw).digest('hex');
  assert.deepEqual(rzp.parseWebhook(raw, { 'x-razorpay-signature': sig }),
    { provider: 'razorpay', event: 'payment.captured', gatewayOrderId: 'order_A' });
  // Unsigned and wrongly-signed events are rejected outright rather than parsed and trusted.
  assert.equal(rzp.parseWebhook(raw, {}), null);
  assert.equal(rzp.parseWebhook(raw, { 'x-razorpay-signature': 'deadbeef' }), null);
  assert.equal(rzp.parseWebhook('not json', { 'x-razorpay-signature': crypto.createHmac('sha256', 'webhook_secret_for_tests').update('not json').digest('hex') }), null);
});

test('an order is verified and refunded by the gateway that created it', () => {
  assert.equal(providerForOrder({ gateway: 'razorpay' }), 'razorpay');
  assert.equal(providerForOrder({ gateway: 'cashfree' }), 'cashfree');
  // Orders predating multi-gateway carry no `gateway` field and were all Cashfree.
  // Defaulting these anywhere else would strand every historical order's refund.
  assert.equal(providerForOrder({ gatewayOrderId: 'nemo_x' }), 'cashfree');
  assert.equal(providerForOrder({}), 'cashfree');
  assert.equal(providerForOrder(null), 'cashfree');
});

test('only fully configured providers are offered, in preference order', () => {
  process.env.PAYMENT_PROVIDER_ORDER = 'razorpay,cashfree';
  assert.deepEqual(availableProviders(), ['razorpay']);
  // A provider with no secret must never be offered — failover would route shoppers into it.
  const secret = process.env.RAZORPAY_KEY_SECRET;
  process.env.RAZORPAY_KEY_SECRET = '';
  assert.deepEqual(availableProviders(), []);
  process.env.RAZORPAY_KEY_SECRET = secret;
  // An unknown name in the preference list is ignored rather than crashing checkout.
  process.env.PAYMENT_PROVIDER_ORDER = 'nonesuch,razorpay';
  assert.deepEqual(availableProviders(), ['razorpay']);
  delete process.env.PAYMENT_PROVIDER_ORDER;
});
