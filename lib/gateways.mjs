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
 *   PHONEPE_CLIENT_ID         PhonePe PG v2 client id        — server only
 *   PHONEPE_CLIENT_SECRET     PhonePe PG v2 client secret    — server only
 *   PHONEPE_CLIENT_VERSION    client version, default "1"
 *   PHONEPE_ENV               "production" to go live; anything else is sandbox
 *   PHONEPE_WEBHOOK_USERNAME  the username set on the webhook in the dashboard
 *   PHONEPE_WEBHOOK_PASSWORD  the matching password
 *
 *   RAZORPAY_KEY_ID           "rzp_live_…" or "rzp_test_…"   — server only
 *   RAZORPAY_KEY_SECRET       the matching secret            — server only
 *   RAZORPAY_WEBHOOK_SECRET   the secret set on the webhook in the dashboard
 *
 *   PAYMENT_PROVIDER_ORDER    optional; default "phonepe,razorpay,cashfree"
 *
 * Razorpay's mode is derived from the key prefix rather than from a separate
 * variable, so the two can never disagree — the class of mistake that puts a test
 * key in front of real customers. PhonePe has no such marker in its credentials,
 * so PHONEPE_ENV defaults to sandbox and going live has to be deliberate.
 */

import crypto from 'node:crypto';
import {
  money, sameMoney, dbGet, dbPatch, orderPath, readOrder, settleReferralsAfterPayment,
  firebaseReady,
} from './payments.mjs';

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

/* ───────────────────────────── PhonePe (PG v2) ──────────────────────────── */

/**
 * PhonePe's newer Standard Checkout, authenticated with OAuth rather than the older
 * X-VERIFY salt hash. The two generations are not compatible, which is why the
 * credential shape decides everything here: Client ID / Secret / Version means v2.
 *
 * Two structural differences from Razorpay drive the code below:
 *
 *   · It is REDIRECT-based, not a modal. Creating a payment returns a URL the browser
 *     navigates to; the customer comes back to our return URL afterwards. The return
 *     carries no proof of anything — it is only a cue to go and ask the status API.
 *   · Refunds are keyed by a merchant-generated refund id against the original
 *     merchant order id, not against a payment id.
 */
const PHONEPE_HOSTS = {
  production: { auth: 'https://api.phonepe.com/apis/identity-manager', pg: 'https://api.phonepe.com/apis/pg' },
  sandbox:    { auth: 'https://api-preprod.phonepe.com/apis/pg-sandbox', pg: 'https://api-preprod.phonepe.com/apis/pg-sandbox' },
};

const ppClientId = () => String(process.env.PHONEPE_CLIENT_ID || '').trim();
const ppClientSecret = () => String(process.env.PHONEPE_CLIENT_SECRET || '').trim();
const ppClientVersion = () => String(process.env.PHONEPE_CLIENT_VERSION || '1').trim();
/* Defaults to sandbox. Going live must be a deliberate act, not the consequence of an
   unset variable — the opposite default would put real money behind a config mistake. */
export const phonepeMode = () => process.env.PHONEPE_ENV === 'production' ? 'production' : 'sandbox';
const ppHosts = () => PHONEPE_HOSTS[phonepeMode()];

let ppToken = { token: '', exp: 0 };
/** An OAuth access token, cached until shortly before it expires. */
async function phonepeToken() {
  if (ppToken.token && Date.now() < ppToken.exp) return ppToken.token;
  const response = await fetch(`${ppHosts().auth}/v1/oauth/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: ppClientId(),
      client_version: ppClientVersion(),
      client_secret: ppClientSecret(),
      grant_type: 'client_credentials',
    }),
    signal: AbortSignal.timeout(12000),
  });
  const text = await response.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* keep raw text for the diagnostic */ }
  if (!response.ok || !json?.access_token) {
    const error = new Error(`phonepe token ${response.status}: ${json?.message || text.slice(0, 200)}`);
    error.status = response.status;
    throw error;
  }
  // expires_at is epoch SECONDS. Renew a minute early rather than racing the expiry.
  const expiresAt = Number(json.expires_at || 0) * 1000;
  ppToken = { token: json.access_token, exp: (expiresAt || Date.now() + 600000) - 60000 };
  return ppToken.token;
}

async function phonepe(path, { method = 'GET', body } = {}) {
  const token = await phonepeToken();
  const response = await fetch(`${ppHosts().pg}${path}`, {
    method,
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      authorization: `O-Bearer ${token}`,
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(12000),
  });
  const text = await response.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* keep raw text for the diagnostic */ }
  if (!response.ok) {
    const error = new Error(`phonepe ${path} ${response.status}: ${json?.message || text.slice(0, 200)}`);
    error.status = response.status;
    error.code = json?.code || '';
    throw error;
  }
  return json;
}

/** A merchant order id for PhonePe: alphanumeric plus _ and -, max 63. */
export const phonepeOrderIdFor = (orderId) =>
  `nemo_${String(orderId || '').replace(/[^A-Za-z0-9_-]/g, '_')}`.slice(0, 63);

/**
 * PhonePe PG v2 authenticates its webhook with credentials you set in the dashboard:
 * it sends SHA256("<username>:<password>") as the Authorization header. There is no
 * body signature, so the body is only trusted to name an order — never to assert that
 * the order was paid. `confirm` below re-reads the real status from the API.
 */
export function phonepeWebhookAuthValid(header) {
  const user = String(process.env.PHONEPE_WEBHOOK_USERNAME || '');
  const pass = String(process.env.PHONEPE_WEBHOOK_PASSWORD || '');
  if (!user || !pass || !header) return false;
  const expected = crypto.createHash('sha256').update(`${user}:${pass}`).digest('hex');
  const supplied = String(header).replace(/^SHA256\s+/i, '').trim().toLowerCase();
  const left = Buffer.from(expected);
  const right = Buffer.from(supplied);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

const PHONEPE = {
  id: 'phonepe',
  label: 'PhonePe',
  ready: () => !!(ppClientId() && ppClientSecret()),
  mode: phonepeMode,

  /** Create a checkout and return the URL to send the browser to. `amount` is RUPEES. */
  async createSession({ orderId, userUid, amount, expiresAt, returnUrl }) {
    const merchantOrderId = phonepeOrderIdFor(orderId);
    // Seconds from now, floored at PhonePe's 300s minimum and capped at its 3600s maximum.
    const expireAfter = Math.max(300, Math.min(3600,
      Math.round(((expiresAt || Date.now() + 20 * 60000) - Date.now()) / 1000)));
    const created = await phonepe('/checkout/v2/pay', {
      method: 'POST',
      body: {
        merchantOrderId,
        amount: toPaise(amount),
        expireAfter,
        // Echoed back on status and webhook, which makes a mis-delivered event obvious in
        // logs. Never trusted to resolve the order — the database mapping does that.
        metaInfo: { udf1: String(orderId), udf2: String(userUid) },
        paymentFlow: {
          type: 'PG_CHECKOUT',
          message: `Nemo Aqua Store order ${String(orderId)}`.slice(0, 90),
          merchantUrls: { redirectUrl: returnUrl },
        },
      },
    });
    if (!created?.redirectUrl) throw new Error('phonepe-session-missing');
    return {
      provider: 'phonepe',
      mode: phonepeMode(),
      gatewayOrderId: merchantOrderId,
      // The browser navigates here. There is no client SDK and no publishable key.
      redirectUrl: created.redirectUrl,
      phonepeOrderId: String(created.orderId || ''),
      amount,
      currency: 'INR',
      expiresAt: expiresAt || null,
    };
  },

  /** Confirm from PhonePe's status API. `expectedAmount` is RUPEES. */
  async confirm(gatewayOrderId, expectedAmount) {
    const status = await phonepe(`/checkout/v2/order/${encodeURIComponent(gatewayOrderId)}/status`);
    if (!status) throw new Error('payment-order-mismatch');
    if (!sameMoney(fromPaise(status.amount), expectedAmount)) throw new Error('payment-amount-mismatch');
    if (String(status.state) !== 'COMPLETED') throw new Error('payment-not-complete');
    const detail = (Array.isArray(status.paymentDetails) ? status.paymentDetails : [])
      .filter(p => p && String(p.state) === 'COMPLETED')
      .sort((a, b) => Number(b.timestamp || 0) - Number(a.timestamp || 0))[0];
    if (!detail) throw new Error('payment-not-complete');
    return {
      gatewayOrder: status,
      payment: detail,
      paymentId: String(detail.transactionId || status.orderId || ''),
      method: String(detail.paymentMode || ''),
      reference: String(detail.rail?.utr || detail.transactionId || ''),
      paidAtIso: new Date(Number(detail.timestamp || 0) || Date.now()).toISOString(),
    };
  },

  /** Refund against the original merchant order id. `amount` is RUPEES. */
  async refund({ gatewayOrderId, amount, idempotencyKey }) {
    if (!gatewayOrderId) throw new Error('refund-payment-unknown');
    // The refund id is derived from the key, so a retry of the same refund is the same
    // request to PhonePe rather than a second one.
    const merchantRefundId = `nemoref_${String(idempotencyKey || gatewayOrderId).replace(/[^A-Za-z0-9_-]/g, '_')}`.slice(0, 63);
    const refund = await phonepe('/payments/v2/refund', {
      method: 'POST',
      body: { merchantRefundId, originalMerchantOrderId: gatewayOrderId, amount: toPaise(amount) },
    });
    return {
      refundId: merchantRefundId,
      status: String(refund?.state || ''),
      amount: fromPaise(refund?.amount ?? toPaise(amount)),
    };
  },

  /** Verify and parse a webhook. The body names an order; it never proves payment. */
  parseWebhook(raw, headers) {
    const auth = headers.authorization || headers.Authorization;
    if (!phonepeWebhookAuthValid(auth)) return null;
    let event;
    try { event = JSON.parse(raw); } catch { return null; }
    const gatewayOrderId = String(event?.payload?.merchantOrderId || '');
    if (!gatewayOrderId) return null;
    return { provider: 'phonepe', event: String(event?.event || ''), gatewayOrderId };
  },
};

const PROVIDERS = { razorpay: RAZORPAY, phonepe: PHONEPE };

/** Every provider that is fully configured, in preference order. */
export function availableProviders() {
  const configured = String(process.env.PAYMENT_PROVIDER_ORDER || 'phonepe,razorpay,cashfree')
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

/* ─────────────────────── Mapping and finalisation ───────────────────────── */

/**
 * gatewayOrderId → the Nemo order it belongs to.
 *
 * A webhook arrives naming a gateway order and nothing else trustworthy. This mapping,
 * written by us when the session was created, is what resolves it to a customer order —
 * never a field from the webhook body, which would let anyone who can POST choose which
 * order to mark paid.
 */
export const gatewayMappingPath = (gatewayOrderId) =>
  `paymentOrders/${encodeURIComponent(gatewayOrderId)}`;

export async function writeGatewayMapping(provider, gatewayOrderId, userUid, orderId) {
  return dbPatch(gatewayMappingPath(gatewayOrderId), {
    provider,
    gatewayOrderId,
    // Kept for the Cashfree records already written under this shape.
    cashfreeOrderId: provider === 'cashfree' ? gatewayOrderId : null,
    userUid,
    orderId,
    mode: providerById(provider)?.mode?.() || '',
    updatedAt: Date.now(),
  });
}

export async function readGatewayMapping(gatewayOrderId) {
  if (!gatewayOrderId) return null;
  try { return await dbGet(gatewayMappingPath(gatewayOrderId)); } catch { return null; }
}

/**
 * Write a verified payment onto its Nemo order, idempotently.
 *
 * The provider's `confirm` is the only thing that decides whether money arrived: it asks
 * the gateway directly and re-checks the amount against what this order says is due. Nothing
 * the browser or a webhook body claimed reaches this function.
 */
export async function finalizePayment(providerId, userUid, orderId, gatewayOrderId) {
  const provider = providerById(providerId);
  if (!provider) throw new Error('gateway-unknown');

  const order = await readOrder(userUid, orderId);
  if (!order) throw new Error('order-not-found');
  if (order.status === 'Cancelled') throw new Error('order-not-payable');
  // A payment may only settle the order it was created for.
  if (order.gatewayOrderId && order.gatewayOrderId !== gatewayOrderId) throw new Error('payment-order-mismatch');

  const amount = money(order.amountDue ?? ((Number(order.total) || 0) + (Number(order.fee) || 0)));
  const result = await provider.confirm(gatewayOrderId, amount);

  const now = new Date().toISOString();
  const sandbox = provider.mode() === 'sandbox';
  const patch = {
    gateway: provider.id,
    gatewayMode: provider.mode(),
    gatewayOrderId,
    gatewayPaymentId: result.paymentId,
    gatewayPaymentGroup: result.method || '',
    txnId: result.reference || result.paymentId,
    paidAt: result.paidAtIso || now,
    paymentStatus: sandbox ? 'Test Paid' : 'Verified',
    status: sandbox ? 'Payment Review' : 'Confirmed',
    ...(sandbox ? {} : { confirmedAt: order.confirmedAt || now }),
    testPayment: sandbox,
    updatedAt: now,
  };
  await dbPatch(orderPath(userUid, orderId), patch);
  if (!sandbox) {
    // Referral settlement must never fail the payment itself — the money is already taken.
    try { await settleReferralsAfterPayment(order, userUid, orderId); }
    catch (error) { console.error('payment referral settlement', error?.message || error); }
  }
  return { ...patch, amount };
}

/** True once at least one gateway AND the database credentials are configured. */
export const paymentsReady = () => availableProviders().length > 0 && firebaseReady();

/**
 * Every available provider is a test account. Checkout is then restricted to store
 * administrators, so a real customer can never be sent into a sandbox gateway.
 */
export const allProvidersSandbox = () => {
  const ids = availableProviders();
  return ids.length > 0 && ids.every(id => providerById(id)?.mode() === 'sandbox');
};
