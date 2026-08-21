/**
 * Server-side payment plumbing — Cashfree Payments + authenticated Realtime Database access.
 *
 * ── Why this exists ────────────────────────────────────────────────────────
 * Until now the store had no server in the purchase path: the browser wrote the
 * order, the customer paid by UPI out of band, and the owner eyeballed a
 * screenshot. That works while one person is checking every order by hand, and
 * it stops working the moment payment is meant to confirm an order on its own.
 *
 * A browser cannot be trusted to say "this was paid" — anyone can send that
 * message. So confirmation happens here: Cashfree signs a webhook, this code
 * verifies the signature against a secret the browser never sees, re-reads the
 * order from the database, checks the amount actually paid matches the
 * amount the order says is due, and only then moves the order forward.
 *
 * Payment confirmation proves Cashfree collected the exact amount frozen on the
 * Nemo order. Production payments therefore move directly to Confirmed. Shipping
 * and delivery remain explicit fulfilment actions for the owner.
 *
 * ── No dependencies, on purpose ────────────────────────────────────────────
 * The rest of api/ is plain ESM against `fetch`. Cashfree is a REST API and the
 * Google credentials are ordinary JWTs, so both are reachable with `fetch` and
 * node:crypto. Adding firebase-admin and the Cashfree SDK would mean an
 * install step on every deploy to save perhaps eighty lines.
 *
 * ── Configuration ──────────────────────────────────────────────────────────
 * Everything is read from environment variables, and every entry point fails
 * safely when credentials are absent. See docs/PAYMENTS.md.
 *
 *   CASHFREE_APP_ID          Cashfree application id — server only
 *   CASHFREE_SECRET_KEY      Cashfree secret key — server only
 *   CASHFREE_ENV             "sandbox" (default) or "production"
 *   CASHFREE_API_VERSION     optional; defaults to 2025-01-01
 *   FIREBASE_SERVICE_ACCOUNT service-account JSON, whole file, one line
 */

import crypto from 'node:crypto';

export const PROJECT_ID = 'nemo-aqua-store';
export const DB = 'https://nemo-aqua-store-default-rtdb.asia-southeast1.firebasedatabase.app';
const CASHFREE_SANDBOX = 'https://sandbox.cashfree.com/pg';
const CASHFREE_PRODUCTION = 'https://api.cashfree.com/pg';

const cashfreeAppId = () => String(process.env.CASHFREE_APP_ID || '').trim();
const cashfreeSecret = () => String(process.env.CASHFREE_SECRET_KEY || '').trim();
export const cashfreeMode = () => process.env.CASHFREE_ENV === 'production' ? 'production' : 'sandbox';
export const cashfreeApiVersion = () => String(process.env.CASHFREE_API_VERSION || '2025-01-01').trim();
const cashfreeBase = () => cashfreeMode() === 'production' ? CASHFREE_PRODUCTION : CASHFREE_SANDBOX;
/** True once both Cashfree and Firebase server credentials exist. */
export const gatewayReady = () => !!(cashfreeAppId() && cashfreeSecret() && serviceAccount());

/* ─────────────────────────── Google / Firebase auth ─────────────────────── */

const b64url = (buf) => Buffer.from(buf).toString('base64')
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

function serviceAccount() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT || '';
  if (!raw) return null;
  try {
    // Accept the JSON as-is or base64-wrapped: pasting a multi-line private key
    // into a dashboard field mangles it often enough to be worth allowing both.
    const text = raw.trim().startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8');
    const sa = JSON.parse(text);
    if (!sa.client_email || !sa.private_key) return null;
    sa.private_key = String(sa.private_key).replace(/\\n/g, '\n');
    return sa;
  } catch { return null; }
}

let tokenCache = { token: '', exp: 0 };
/**
 * An OAuth access token for the service account, good for writing to the
 * database as an authenticated principal. Cached until shortly before it
 * expires — a webhook burst should not mint a token per request.
 */
async function accessToken() {
  if (tokenCache.token && Date.now() < tokenCache.exp) return tokenCache.token;
  const sa = serviceAccount();
  if (!sa) throw new Error('FIREBASE_SERVICE_ACCOUNT not configured');

  const now = Math.floor(Date.now() / 1000);
  const claim = {
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.database https://www.googleapis.com/auth/userinfo.email',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  };
  const head = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const body = b64url(JSON.stringify(claim));
  const sig = b64url(crypto.sign('RSA-SHA256', Buffer.from(`${head}.${body}`), sa.private_key));

  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${head}.${body}.${sig}`,
    }),
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) throw new Error(`token exchange failed: ${r.status}`);
  const t = await r.json();
  tokenCache = { token: t.access_token, exp: Date.now() + (t.expires_in - 120) * 1000 };
  return tokenCache.token;
}

/** Read a database path as the service account (bypasses the public read rules). */
export async function dbGet(path) {
  const tok = await accessToken();
  const r = await fetch(`${DB}/${path}.json?access_token=${encodeURIComponent(tok)}`,
    { signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(`db read ${path}: ${r.status}`);
  return r.json();
}

/** Merge fields into a database path as the service account. */
export async function dbPatch(path, obj) {
  const tok = await accessToken();
  const r = await fetch(`${DB}/${path}.json?access_token=${encodeURIComponent(tok)}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(obj),
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) throw new Error(`db write ${path}: ${r.status}`);
  return r.json();
}

/** Delete one database path as the service account. */
export async function dbDelete(path) {
  const tok = await accessToken();
  const r = await fetch(`${DB}/${path}.json?access_token=${encodeURIComponent(tok)}`, {
    method: 'DELETE',
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) throw new Error(`db delete ${path}: ${r.status}`);
  return r.json();
}

/** Optimistic Realtime Database transaction using REST ETags. */
export async function dbTransaction(path, update, attempts = 6) {
  const tok = await accessToken();
  const url = `${DB}/${path}.json?access_token=${encodeURIComponent(tok)}`;
  for (let i = 0; i < attempts; i += 1) {
    const read = await fetch(url, {
      headers: { 'X-Firebase-ETag': 'true' },
      signal: AbortSignal.timeout(8000),
    });
    if (!read.ok) throw new Error(`db transaction read ${path}: ${read.status}`);
    const current = await read.json();
    const next = update(current);
    if (next === undefined) return current;
    const write = await fetch(url, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', 'if-match': read.headers.get('etag') || '*' },
      body: JSON.stringify(next),
      signal: AbortSignal.timeout(8000),
    });
    if (write.status === 412) continue;
    if (!write.ok) throw new Error(`db transaction write ${path}: ${write.status}`);
    return write.json();
  }
  throw new Error(`db transaction conflict ${path}`);
}

/* ───────────────────────── Verifying the caller ─────────────────────────── */

let certCache = { keys: null, exp: 0 };
async function googleCerts() {
  if (certCache.keys && Date.now() < certCache.exp) return certCache.keys;
  const r = await fetch('https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com',
    { signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error('cert fetch failed');
  const keys = await r.json();
  // Honour the cache header rather than guessing; Google rotates these.
  const cc = /max-age=(\d+)/.exec(r.headers.get('cache-control') || '');
  certCache = { keys, exp: Date.now() + (cc ? Number(cc[1]) : 3600) * 1000 };
  return keys;
}

/**
 * Verify a Firebase ID token and return its uid, or null.
 *
 * The refund endpoint moves real money, so "the client said it was the admin"
 * is not good enough — the caller proves it with a token Google signed, and the
 * signature is checked here against Google's public certificates.
 */
export async function verifyIdToken(idToken) {
  try {
    const [h, p, s] = String(idToken || '').split('.');
    if (!h || !p || !s) return null;
    const header = JSON.parse(Buffer.from(h, 'base64url').toString('utf8'));
    const payload = JSON.parse(Buffer.from(p, 'base64url').toString('utf8'));
    if (header.alg !== 'RS256' || !header.kid) return null;

    const now = Math.floor(Date.now() / 1000);
    if (payload.aud !== PROJECT_ID) return null;
    if (payload.iss !== `https://securetoken.google.com/${PROJECT_ID}`) return null;
    if (!payload.sub || Number(payload.exp) <= now || Number(payload.iat) > now + 300) return null;

    const cert = (await googleCerts())[header.kid];
    if (!cert) return null;
    const ok = crypto.verify('RSA-SHA256', Buffer.from(`${h}.${p}`),
      crypto.createPublicKey(cert), Buffer.from(s, 'base64url'));
    return ok ? payload.sub : null;
  } catch { return null; }
}

const PRIMARY_ADMIN_UID = 'cI2HmMt6FdR7fO7uUnugH85GeZt2';
/** Sandbox checkout and refunds are restricted to verified store administrators. */
export async function isPaymentAdmin(uid) {
  if (!uid) return false;
  const configured = String(process.env.PAYMENT_ADMIN_UIDS || '')
    .split(',').map(value => value.trim()).filter(Boolean);
  if (uid === PRIMARY_ADMIN_UID || configured.includes(uid)) return true;
  try {
    const privateSettings = await dbGet('settingsPrivate');
    return uid === String(privateSettings?.coAdminUid || '').trim();
  } catch { return false; }
}

/* ───────────────────────── Cashfree Payments ───────────────────────────── */

async function cashfree(path, { method = 'GET', body, idempotencyKey } = {}) {
  const headers = {
    accept: 'application/json',
    'content-type': 'application/json',
    'x-api-version': cashfreeApiVersion(),
    'x-client-id': cashfreeAppId(),
    'x-client-secret': cashfreeSecret(),
  };
  if (idempotencyKey) headers['x-idempotency-key'] = idempotencyKey;
  const response = await fetch(`${cashfreeBase()}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(12000),
  });
  const text = await response.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* retain raw text for the diagnostic below */ }
  if (!response.ok) {
    const error = new Error(`cashfree ${path} ${response.status}: ${json?.message || text.slice(0, 200)}`);
    error.status = response.status;
    error.code = json?.code || '';
    throw error;
  }
  return json;
}

/** Cashfree accepts rupees with at most two decimal places. */
export const money = (rupees) => Math.round(Number(rupees || 0) * 100) / 100;
export const sameMoney = (left, right) => Math.round(Number(left) * 100) === Math.round(Number(right) * 100);

/** A deterministic Cashfree order id (allowed characters only, maximum 45). */
export function cashfreeOrderIdFor(orderId) {
  const clean = String(orderId || '').replace(/[^A-Za-z0-9_-]/g, '_');
  return `nemo_${clean}`.slice(0, 45);
}

/** Stable UUID so a retry of the same operation remains idempotent at Cashfree. */
export function stableUuid(value) {
  const bytes = crypto.createHash('sha256').update(String(value)).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export const createCashfreeOrder = (body, key) =>
  cashfree('/orders', { method: 'POST', body, idempotencyKey: key });
export const fetchCashfreeOrder = (orderId) =>
  cashfree(`/orders/${encodeURIComponent(orderId)}`);
export const fetchCashfreePayments = (orderId) =>
  cashfree(`/orders/${encodeURIComponent(orderId)}/payments`);
export const refundCashfreeOrder = (orderId, body, key) =>
  cashfree(`/orders/${encodeURIComponent(orderId)}/refunds`, { method: 'POST', body, idempotencyKey: key });

/**
 * Cashfree signs timestamp + RAW payload with HMAC-SHA256 and base64 encoding.
 * Parsing and re-serialising first can change decimal formatting and invalidate it.
 */
export function webhookSignatureValid(raw, timestamp, signature) {
  const secret = cashfreeSecret();
  if (!secret || !timestamp || !signature) return false;
  const expected = crypto.createHmac('sha256', secret)
    .update(`${timestamp}${raw}`)
    .digest('base64');
  const left = Buffer.from(expected);
  const right = Buffer.from(String(signature));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

/** Read the untouched request body — webhook verification must not use parsed/re-serialized JSON. */
export async function rawBody(req) {
  if (typeof req.body === 'string') return req.body;
  if (Buffer.isBuffer(req.body)) return req.body.toString('utf8');
  const chunks = [];
  for await (const c of req) chunks.push(typeof c === 'string' ? Buffer.from(c) : c);
  return Buffer.concat(chunks).toString('utf8');
}

/* ────────────────────────────── Order lookup ────────────────────────────── */

/**
 * Orders live under orders/<userUid>/<orderId>. Cashfree's order id is mapped
 * server-side to that path; a webhook never gets to choose which customer order
 * it mutates from untrusted request fields.
 */
export const orderPath = (userUid, orderId) =>
  `orders/${encodeURIComponent(userUid)}/${encodeURIComponent(orderId)}`;

export async function readOrder(userUid, orderId) {
  if (!userUid || !orderId) return null;
  try { return await dbGet(orderPath(userUid, orderId)); } catch { return null; }
}

export const paymentOrderPath = (cashfreeOrderId) =>
  `paymentOrders/${encodeURIComponent(cashfreeOrderId)}`;

export async function writePaymentMapping(cashfreeOrderId, userUid, orderId) {
  return dbPatch(paymentOrderPath(cashfreeOrderId), {
    cashfreeOrderId,
    userUid,
    orderId,
    mode: cashfreeMode(),
    updatedAt: Date.now(),
  });
}

export async function readPaymentMapping(cashfreeOrderId) {
  if (!cashfreeOrderId) return null;
  try { return await dbGet(paymentOrderPath(cashfreeOrderId)); } catch { return null; }
}

/**
 * Confirm payment from Cashfree itself. Browser results and webhook fields are
 * useful hints, never proof: fulfilment requires Cashfree's order API to say PAID
 * and the server-created order amount/currency to match the Nemo order.
 */
export async function confirmCashfreeOrder(cashfreeOrderId, expectedAmount) {
  const gatewayOrder = await fetchCashfreeOrder(cashfreeOrderId);
  if (!gatewayOrder || gatewayOrder.order_id !== cashfreeOrderId) throw new Error('payment-order-mismatch');
  if (gatewayOrder.order_status !== 'PAID') throw new Error('payment-not-complete');
  if (gatewayOrder.order_currency !== 'INR' || !sameMoney(gatewayOrder.order_amount, expectedAmount)) {
    throw new Error('payment-amount-mismatch');
  }
  const payments = await fetchCashfreePayments(cashfreeOrderId);
  const successful = (Array.isArray(payments) ? payments : [])
    .filter(payment => payment && payment.order_id === cashfreeOrderId &&
      payment.payment_status === 'SUCCESS' && payment.payment_currency === 'INR' &&
      payment.is_captured !== false)
    .sort((left, right) => String(right.payment_completion_time || right.payment_time || '')
      .localeCompare(String(left.payment_completion_time || left.payment_time || '')))[0];
  if (!successful) throw new Error('payment-not-complete');
  return { gatewayOrder, payment: successful };
}

/** Idempotently write a verified Cashfree payment onto its Nemo order. */
export async function finalizeCashfreePayment(userUid, orderId, cashfreeOrderId) {
  const order = await readOrder(userUid, orderId);
  if (!order) throw new Error('order-not-found');
  if (order.status === 'Cancelled') throw new Error('order-not-payable');
  if (order.gatewayOrderId && order.gatewayOrderId !== cashfreeOrderId) {
    throw new Error('payment-order-mismatch');
  }
  const amount = money(order.amountDue ?? ((Number(order.total) || 0) + (Number(order.fee) || 0)));
  const { payment } = await confirmCashfreeOrder(cashfreeOrderId, amount);
  const now = new Date().toISOString();
  const sandbox = cashfreeMode() === 'sandbox';
  const patch = {
    gateway: 'cashfree',
    gatewayMode: cashfreeMode(),
    gatewayOrderId: cashfreeOrderId,
    gatewayPaymentId: String(payment.cf_payment_id || ''),
    gatewayPaymentGroup: String(payment.payment_group || ''),
    txnId: String(payment.bank_reference || payment.cf_payment_id || ''),
    paidAt: String(payment.payment_completion_time || payment.payment_time || now),
    paymentStatus: sandbox ? 'Test Paid' : 'Verified',
    status: sandbox ? 'Payment Review' : 'Confirmed',
    ...(sandbox ? {} : { confirmedAt: order.confirmedAt || now }),
    testPayment: sandbox,
    updatedAt: now,
  };
  await dbPatch(orderPath(userUid, orderId), patch);
  if (!sandbox) {
    try { await settleReferralsAfterPayment(order, userUid, orderId); }
    catch (error) { console.error('payment referral settlement', error?.message || error); }
  }
  return { ...patch, amount };
}

/* Referral lifecycle driven by the same verified payment event as the order. A qualifying
   source order's code becomes active here; a code used by this buyer is consumed here. The
   reservation written at checkout is checked before consumption, so a copied order code can
   never be won by a later payer. Cashfree may deliver duplicate paid events; every write is idempotent. */
const referralCode = (v) => String(v || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
const referralPath = (code) => `referrals/${encodeURIComponent(referralCode(code))}`;

export async function settleReferralsAfterPayment(order, userUid, orderId, now = Date.now()) {
  if (!order || order.status === 'Cancelled') return false;

  const earned = referralCode(order.earnedReferralCode);
  if (earned) {
    const path = referralPath(earned);
    const record = await dbGet(path);
    if (record && record.kind === 'order' && record.sourceOrderId === orderId && !record.used) {
      await dbPatch(path, { active: true, activatedAt: record.activatedAt || now });
    }
  }

  const used = referralCode(order.referralCode);
  if (!used) return false;
  const path = referralPath(used);
  let consumed = false;
  await dbTransaction(path, record => {
    consumed = false;
    if (!record || record.active !== true) return undefined;
    if (record.kind === 'order') {
      if (record.used || record.pendingOrderId !== orderId || record.reservedBy !== userUid) return undefined;
      consumed = true;
      return { ...record, used: true, active: false, usedBy: userUid, paidOrderId: orderId, usedAt: now,
        reservedBy: null, pendingOrderId: null, reservedUntil: null };
    }
    if (record.kind === 'customer') {
      if (record.redemptions && record.redemptions[userUid]) return undefined;
      const pending = record.pendingBy && record.pendingBy[userUid];
      if (!pending || pending.orderId !== orderId) return undefined;
      const pendingBy = { ...(record.pendingBy || {}) };
      delete pendingBy[userUid];
      consumed = true;
      return { ...record, pendingBy, redemptions: { ...(record.redemptions || {}), [userUid]: { orderId, usedAt: now } } };
    }
    return undefined;
  });
  return consumed;
}
