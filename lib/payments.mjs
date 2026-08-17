/**
 * Server-side payment plumbing — Razorpay + authenticated Realtime Database access.
 *
 * ── Why this exists ────────────────────────────────────────────────────────
 * Until now the store had no server in the purchase path: the browser wrote the
 * order, the customer paid by UPI out of band, and the owner eyeballed a
 * screenshot. That works while one person is checking every order by hand, and
 * it stops working the moment payment is meant to confirm an order on its own.
 *
 * A browser cannot be trusted to say "this was paid" — anyone can send that
 * message. So confirmation happens here: Razorpay signs a webhook, this code
 * verifies the signature against a secret the browser never sees, re-reads the
 * order from the database, checks the amount actually captured matches the
 * amount the order says is due, and only then moves the order forward.
 *
 * That closes a hole the manual flow always had. The browser composes the order
 * total at checkout, so a tampered client could submit an order for ₹1. The
 * database rules freeze the total once written but cannot know what it *should*
 * be. Now the gateway does: an order that says ₹1 collects ₹1, and the ₹4,000
 * of fish attached to it never gets confirmed.
 *
 * ── No dependencies, on purpose ────────────────────────────────────────────
 * The rest of api/ is plain ESM against `fetch`, and the repo has no
 * package.json to hang a dependency tree from. Razorpay is a REST API and the
 * Google credentials are ordinary JWTs, so both are reachable with `fetch` and
 * node:crypto. Adding firebase-admin and the razorpay SDK would mean an
 * install step on every deploy to save perhaps eighty lines.
 *
 * ── Configuration ──────────────────────────────────────────────────────────
 * Everything is read from environment variables, and every entry point degrades
 * politely when they are absent — an unconfigured store keeps the manual flow
 * rather than erroring. See docs/PAYMENTS.md.
 *
 *   RAZORPAY_KEY_ID          public key id (also exposed to the browser)
 *   RAZORPAY_KEY_SECRET      secret half of the API key — server only
 *   RAZORPAY_WEBHOOK_SECRET  the secret set on the webhook in the dashboard
 *   FIREBASE_SERVICE_ACCOUNT service-account JSON, whole file, one line
 */

import crypto from 'node:crypto';

export const PROJECT_ID = 'nemo-aqua-store';
export const DB = 'https://nemo-aqua-store-default-rtdb.asia-southeast1.firebasedatabase.app';
const RZP = 'https://api.razorpay.com/v1';

export const rzpKeyId     = () => process.env.RAZORPAY_KEY_ID || '';
const rzpKeySecret        = () => process.env.RAZORPAY_KEY_SECRET || '';
const rzpWebhookSecret    = () => process.env.RAZORPAY_WEBHOOK_SECRET || '';
/** True once the gateway can actually take money. Callers fall back to the manual flow. */
export const gatewayReady = () => !!(rzpKeyId() && rzpKeySecret());

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

/* ─────────────────────────────── Razorpay ───────────────────────────────── */

async function rzp(path, { method = 'GET', body } = {}) {
  const auth = Buffer.from(`${rzpKeyId()}:${rzpKeySecret()}`).toString('base64');
  const r = await fetch(`${RZP}${path}`, {
    method,
    headers: { authorization: `Basic ${auth}`, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(12000),
  });
  const text = await r.text();
  let json = null; try { json = JSON.parse(text); } catch { /* keep the raw text below */ }
  if (!r.ok) {
    const msg = (json && json.error && json.error.description) || text.slice(0, 200);
    throw new Error(`razorpay ${path} ${r.status}: ${msg}`);
  }
  return json;
}

/** Amounts cross the Razorpay API in paise, and only ever as integers. */
export const toPaise = (rupees) => Math.round(Number(rupees || 0) * 100);

export function createRazorpayOrder({ amountPaise, receipt, notes }) {
  return rzp('/orders', { method: 'POST', body: { amount: amountPaise, currency: 'INR', receipt, notes, payment_capture: 1 } });
}
export const fetchRazorpayPayment = (paymentId) => rzp(`/payments/${encodeURIComponent(paymentId)}`);
export function refundRazorpayPayment(paymentId, amountPaise, notes) {
  const body = { notes };
  // Omitting the amount tells Razorpay to refund the payment in full.
  if (amountPaise != null) body.amount = amountPaise;
  return rzp(`/payments/${encodeURIComponent(paymentId)}/refund`, { method: 'POST', body });
}

/**
 * Webhook authenticity. Razorpay signs the RAW body, so the comparison has to
 * happen before any JSON parsing — re-serialising an object produces different
 * bytes and the signature would never match.
 */
export function webhookSignatureValid(rawBody, signature) {
  const secret = rzpWebhookSecret();
  if (!secret || !signature) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const a = Buffer.from(expected), b = Buffer.from(String(signature));
  // Length-check first: timingSafeEqual throws on a mismatch rather than returning false.
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Read the untouched request body — Vercel parses JSON for us, which we must not use here. */
export async function rawBody(req) {
  if (typeof req.body === 'string') return req.body;
  if (Buffer.isBuffer(req.body)) return req.body.toString('utf8');
  const chunks = [];
  for await (const c of req) chunks.push(typeof c === 'string' ? Buffer.from(c) : c);
  return Buffer.concat(chunks).toString('utf8');
}

/* ────────────────────────────── Order lookup ────────────────────────────── */

/**
 * Orders live under orders/<userUid>/<orderId>, and a webhook knows only the
 * order id, so the path is carried through Razorpay's notes and echoed back.
 * The notes are attacker-influenced in principle, which is why the caller still
 * checks the amount against the order it finds rather than trusting the trip.
 */
export const orderPath = (userUid, orderId) =>
  `orders/${encodeURIComponent(userUid)}/${encodeURIComponent(orderId)}`;

export async function readOrder(userUid, orderId) {
  if (!userUid || !orderId) return null;
  try { return await dbGet(orderPath(userUid, orderId)); } catch { return null; }
}

/* Referral lifecycle driven by the same verified payment event as the order. A qualifying
   source order's code becomes active here; a code used by this buyer is consumed here. The
   reservation written at checkout is checked before consumption, so a copied order code can
   never be won by a later payer. Razorpay may deliver two paid events; every write is idempotent. */
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
