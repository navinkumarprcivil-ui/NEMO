/**
 * Which payment gateway handles an order, and how.
 *
 * ── Why this exists ────────────────────────────────────────────────────────
 * The store was wired to exactly one gateway. When Cashfree deactivated the
 * account, checkout did not degrade — it stopped. A single provider is a single
 * point of failure for the only part of the site that takes money, and the way
 * that failure arrives (a policy decision, not an outage) means no amount of
 * retrying helps.
 *
 * So the provider is now a choice made per order, recorded on the order, and
 * honoured for the rest of that order's life. Two consequences matter:
 *
 *   · A new order goes to the preferred gateway, and falls back to the next one
 *     if that gateway cannot open a session. The shopper sees one checkout.
 *   · Verification, webhooks and refunds dispatch on the gateway the ORDER was
 *     created with — never on whatever is preferred today. That is what keeps
 *     every existing Cashfree order verifiable and refundable after the default
 *     has moved on, which is a hard requirement: they are GST records.
 *
 * ── Money units ────────────────────────────────────────────────────────────
 * A live bug waiting to happen, so it is stated once here: Cashfree speaks
 * RUPEES with two decimals, Razorpay speaks integer PAISE. Each adapter converts
 * at its own boundary and every function in this module that crosses the
 * boundary says which unit it means in its name or its comment. Nothing outside
 * an adapter should ever see paise.
 *
 * ── Configuration ──────────────────────────────────────────────────────────
 *   RAZORPAY_KEY_ID          "rzp_live_…" or "rzp_test_…"  — server only
 *   RAZORPAY_KEY_SECRET      the matching secret            — server only
 *   RAZORPAY_WEBHOOK_SECRET  the secret set on the webhook in the dashboard
 *   PAYMENT_PROVIDER_ORDER   optional, e.g. "razorpay,cashfree" — preference order
 *
 * The mode (test vs live) is derived from the key prefix rather than from a
 * separate variable, so the two can never disagree — the class of mistake that
 * puts a test key in front of real customers.
 */

import crypto from 'node:crypto';
import { money, sameMoney } from './payments.mjs';

/* ───────────────────────────── Razorpay ─────────────────────────────────── */

const RAZORPAY_API = 'https://api.razorpay.com/v1';

const rzpKeyId = () => String(process.env.RAZORPAY_KEY_ID || '').trim();
const rzpSecret = () => String(process.env.RAZORPAY_KEY_SECRET || '').trim();
const rzpWebhookSecret = () => String(process.env.RAZORPAY_WEBHOOK_SECRET || '').trim();
/** Derived from the key itself: a "rzp_live_…" key is production, anything else is test. */
export const razorpayMode = () => rzpKeyId().startsWith('rzp_live_') ? 'production' : 'sandbox';

/** Rupees → integer paise. Razorpay rejects anything else, and silently mis-charges on a float. */
export const toPaise = (rupees) => Math.round(Number(rupees || 0) * 100);
/** Integer paise → rupees, for comparing against what the Nemo order says is due. */
export const fromPaise = (paise) => Math.round(Number(paise || 0)) / 100;

async function razorpay(path, { method = 'GET', body } = {}) {
  const auth = Buffer.from(`${rzpKeyId()}:${rzpSecret()}`).toString('base64');
  const response = await fetch(`${RAZORPAY_API}${path}`, {
    method,
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      authorization: `Basic ${auth}`,
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(12000),
  });
  const text = await response.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* keep raw text for the diagnostic below */ }
  if (!response.ok) {
    const detail = json?.error || {};
    const error = new Error(`razorpay ${path} ${response.status}: ${detail.description || text.slice(0, 200)}`);
    error.status = response.status;
    error.code = detail.code || '';
    error.reason = detail.reason || '';
    throw error;
  }
  return json;
}

/**
 * A Razorpay receipt for a Nemo order. Max 40 characters, and it is only a label —
 * the mapping that actually matters is written to the database, so a receipt can
 * never be used to point a payment at somebody else's order.
 */
export const razorpayReceiptFor = (orderId) =>
  `nemo_${String(orderId || '').replace(/[^A-Za-z0-9_-]/g, '_')}`.slice(0, 40);

/**
 * The signature Razorpay Checkout hands back in the browser.
 * HMAC-SHA256 of "<order_id>|<payment_id>" with the API secret, hex encoded.
 * This proves the browser's success callback was not forged, but it is NOT proof
 * of payment on its own — the amount and status still come from the API below.
 */
export function razorpayCheckoutSignatureValid(orderId, paymentId, signature) {
  const secret = rzpSecret();
  if (!secret || !orderId || !paymentId || !signature) return false;
  const expected = crypto.createHmac('sha256', secret)
    .update(`${orderId}|${paymentId}`).digest('hex');
  const left = Buffer.from(expected);
  const right = Buffer.from(String(signature));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

/**
 * Razorpay signs the RAW webhook body with the webhook secret (which is a
 * different secret from the API key) using HMAC-SHA256, hex encoded. Re-serialising
 * the JSON first would change the bytes and invalidate it.
 */
export function razorpayWebhookSignatureValid(raw, signature) {
  const secret = rzpWebhookSecret();
  if (!secret || !signature) return false;
  const expected = crypto.createHmac('sha256', secret).update(raw).digest('hex');
  const left = Buffer.from(expected);
  const right = Buffer.from(String(signature));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

/* ─────────────────────────── The provider contract ──────────────────────── */

/**
 * Every provider implements the same five things. `createSession` returns the
 * payload the browser needs to open that gateway's checkout, tagged with `provider`
 * so the client knows which SDK to load.
 */
const RAZORPAY = {
  id: 'razorpay',
  label: 'Razorpay',
  ready: () => !!(rzpKeyId() && rzpSecret()),
  mode: razorpayMode,

  /** Create (or re-use) a gateway order. `amount` is RUPEES. */
  async createSession({ order, orderId, userUid, amount, phone, expiresAt }) {
    const existing = order.gateway === 'razorpay' && order.gatewayOrderId;
    let gatewayOrder;
    if (existing) {
      gatewayOrder = await razorpay(`/orders/${encodeURIComponent(order.gatewayOrderId)}`);
    } else {
      gatewayOrder = await razorpay('/orders', {
        method: 'POST',
        body: {
          amount: toPaise(amount),
          currency: 'INR',
          receipt: razorpayReceiptFor(orderId),
          // Notes are echoed back on the webhook, which makes a mis-delivered event
          // obvious in logs. They are never trusted to resolve the order — see
          // readPaymentMapping in the endpoints.
          notes: { nemoOrderId: String(orderId), nemoUserUid: String(userUid) },
        },
      });
    }
    if (!gatewayOrder?.id) throw new Error('razorpay-session-missing');
    if (gatewayOrder.status === 'paid') {
      // Already paid: let verification pick it up rather than opening checkout again.
      return { alreadyPaid: true, gatewayOrderId: gatewayOrder.id };
    }
    return {
      provider: 'razorpay',
      mode: razorpayMode(),
      gatewayOrderId: gatewayOrder.id,
      // The key id is publishable — Checkout needs it in the browser. The secret never leaves here.
      keyId: rzpKeyId(),
      amount,
      currency: 'INR',
      prefill: { contact: phone || '' },
      expiresAt: expiresAt || null,
    };
  },

  /**
   * Confirm from Razorpay itself. The browser's callback and the webhook body are
   * hints; this is the proof. `expectedAmount` is RUPEES.
   */
  async confirm(gatewayOrderId, expectedAmount) {
    const gatewayOrder = await razorpay(`/orders/${encodeURIComponent(gatewayOrderId)}`);
    if (!gatewayOrder || gatewayOrder.id !== gatewayOrderId) throw new Error('payment-order-mismatch');
    if (gatewayOrder.currency !== 'INR' || !sameMoney(fromPaise(gatewayOrder.amount), expectedAmount)) {
      throw new Error('payment-amount-mismatch');
    }
    if (gatewayOrder.status !== 'paid') throw new Error('payment-not-complete');

    const list = await razorpay(`/orders/${encodeURIComponent(gatewayOrderId)}/payments`);
    const payment = (Array.isArray(list?.items) ? list.items : [])
      .filter(p => p && p.order_id === gatewayOrderId && p.currency === 'INR' &&
        // "authorized" is money held, not taken. Only a captured payment is money we have.
        p.status === 'captured' && sameMoney(fromPaise(p.amount), expectedAmount))
      .sort((a, b) => Number(b.created_at || 0) - Number(a.created_at || 0))[0];
    if (!payment) throw new Error('payment-not-complete');

    return {
      gatewayOrder,
      payment,
      // Normalised so the caller never touches provider-specific field names.
      paymentId: String(payment.id || ''),
      method: String(payment.method || ''),
      reference: String(payment.acquirer_data?.rrn || payment.acquirer_data?.upi_transaction_id || payment.id || ''),
      paidAtIso: new Date(Number(payment.created_at || 0) * 1000 || Date.now()).toISOString(),
    };
  },

  /** Refund a captured payment. `amount` is RUPEES; Razorpay refunds the PAYMENT, not the order. */
  async refund({ paymentId, amount, idempotencyKey, notes }) {
    if (!paymentId) throw new Error('refund-payment-unknown');
    const body = { amount: toPaise(amount), speed: 'normal' };
    if (notes) body.notes = notes;
    const refund = await razorpay(`/payments/${encodeURIComponent(paymentId)}/refund`, {
      method: 'POST',
      body: { ...body, receipt: String(idempotencyKey || '').slice(0, 40) || undefined },
    });
    return {
      refundId: String(refund?.id || ''),
      status: String(refund?.status || ''),
      amount: fromPaise(refund?.amount),
    };
  },

  /** Verify and parse a webhook. Returns the gateway order id the event concerns. */
  parseWebhook(raw, headers) {
    const signature = headers['x-razorpay-signature'] || headers['X-Razorpay-Signature'];
    if (!razorpayWebhookSignatureValid(raw, signature)) return null;
    let event;
    try { event = JSON.parse(raw); } catch { return null; }
    const entity = event?.payload?.payment?.entity || event?.payload?.order?.entity || null;
    const gatewayOrderId = String(entity?.order_id || entity?.id || '');
    if (!gatewayOrderId) return null;
    return { provider: 'razorpay', event: String(event?.event || ''), gatewayOrderId };
  },
};

/* PhonePe slots in here as a third entry implementing the same five members. It is
   deliberately absent rather than stubbed: a provider that reports ready() === true
   and then fails at the payment step is worse than one that is simply not offered,
   because the failover below would route real shoppers into it. */
const PROVIDERS = { razorpay: RAZORPAY };

/** Every provider that is fully configured, in preference order. */
export function availableProviders() {
  const configured = String(process.env.PAYMENT_PROVIDER_ORDER || 'razorpay,cashfree')
    .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  return configured.filter(id => PROVIDERS[id]?.ready());
}

/** The provider object for an id, or null. */
export const providerById = (id) => PROVIDERS[String(id || '').toLowerCase()] || null;

/**
 * The provider that must handle an EXISTING order — the one it was created with,
 * never today's preference. Orders from before multi-gateway carry no `gateway`
 * field but were all Cashfree, so that is the default.
 */
export const providerForOrder = (order) =>
  String(order?.gateway || 'cashfree').toLowerCase();

export { money, sameMoney };
