import {
  dbPatch,
  isPaymentAdmin,
  money,
  orderPath,
  readOrder,
  verifyIdToken,
} from '../lib/payments.mjs';
import {
  allProvidersSandbox,
  availableProviders,
  finalizePayment,
  paymentsReady,
  providerById,
  writeGatewayMapping,
} from '../lib/gateways.mjs';

const bearer = req => String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
const PAYMENT_HOSTS = new Set(['www.nemoaquastore.in', 'nemoaquastore.in']);
const PAYMENT_WINDOW_MS = 20 * 60 * 1000;

const publicSite = req => {
  const configured = String(process.env.PUBLIC_SITE_URL || 'https://www.nemoaquastore.in').replace(/\/$/, '');
  const host = String(req.headers.host || req.headers['x-forwarded-host'] || '').split(',')[0].trim().split(':')[0].toLowerCase();
  return PAYMENT_HOSTS.has(host) ? `https://${host}` : configured;
};
const safePhone = value => String(value || '').replace(/\D/g, '').slice(-10);

/** Never leak gateway internals to the browser; map to something a shopper can act on. */
const publicError = error => {
  const status = Number(error?.status || 0);
  const text = `${error?.code || ''} ${error?.message || ''}`.toLowerCase();
  if (status === 401 || status === 403 || /unauthor|authentication|client[_ -]?id|secret|credential/.test(text)) {
    return 'gateway-credentials-rejected';
  }
  if (status === 429) return 'gateway-busy';
  return 'payment-session-failed';
};

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const ids = availableProviders();
    res.status(200).json({
      ready: paymentsReady(),
      providers: ids.map(id => ({ id, label: providerById(id)?.label || id, mode: providerById(id)?.mode() })),
      // Retained so an older cached client keeps understanding the response.
      provider: ids[0] || '',
      mode: providerById(ids[0])?.mode() || '',
      currency: 'INR',
    });
    return;
  }
  if (req.method !== 'POST') { res.status(405).json({ error: 'method-not-allowed' }); return; }
  if (!paymentsReady()) { res.status(503).json({ error: 'gateway-not-configured' }); return; }

  const uid = await verifyIdToken(bearer(req));
  if (!uid) { res.status(401).json({ error: 'sign-in-required' }); return; }
  // A test gateway must never take a real customer's money, so while every configured
  // provider is in sandbox mode checkout is open to administrators only.
  if (allProvidersSandbox() && !(await isPaymentAdmin(uid))) {
    res.status(403).json({ error: 'sandbox-admin-only' });
    return;
  }

  try {
    const userUid = String(req.body?.userUid || '');
    const orderId = String(req.body?.orderId || '');
    if (!userUid || !orderId || userUid.length > 160 || orderId.length > 160 || uid !== userUid) {
      res.status(403).json({ error: 'order-owner-mismatch' });
      return;
    }
    const order = await readOrder(userUid, orderId);
    if (!order || order.userUid !== userUid || order.id !== orderId) {
      res.status(404).json({ error: 'order-not-found' });
      return;
    }
    if (order.status !== 'Awaiting Payment' || String(order.paymentStatus || '') !== 'Awaiting Payment') {
      res.status(409).json({ error: 'order-not-payable' });
      return;
    }
    const deadline = Number(order.paymentDeadline || 0);
    if (deadline && Date.now() >= deadline) {
      res.status(409).json({ error: 'payment-window-closed' });
      return;
    }
    const amount = money(order.amountDue ?? ((Number(order.total) || 0) + (Number(order.fee) || 0)));
    if (!(amount >= 1)) { res.status(409).json({ error: 'invalid-order-amount' }); return; }
    const phone = safePhone(order.userPhone || order.address?.phone);
    if (!/^[6-9]\d{9}$/.test(phone)) { res.status(409).json({ error: 'valid-phone-required' }); return; }

    /* Which gateway. An order that already has one keeps it: switching mid-order would
       strand the session already open at the first gateway, and a customer who paid it
       would have paid an order we had stopped watching. Only a fresh order gets a choice. */
    const stuck = order.gateway && order.gatewayOrderId ? [String(order.gateway)] : availableProviders();
    if (!stuck.length) { res.status(503).json({ error: 'gateway-not-configured' }); return; }

    const expiresAt = Math.max(deadline || 0, Date.now() + PAYMENT_WINDOW_MS);
    const site = publicSite(req);
    const returnUrl = `${site}/?payment_return=1&order_id=${encodeURIComponent(orderId)}`;

    let session = null;
    let lastError = null;
    for (const id of stuck) {
      const provider = providerById(id);
      if (!provider?.ready()) continue;
      try {
        const created = await provider.createSession({
          order, orderId, userUid, amount, phone, expiresAt, returnUrl,
        });
        // The gateway says this order is already paid — settle it rather than charging twice.
        if (created?.alreadyPaid) {
          await finalizePayment(id, userUid, orderId, created.gatewayOrderId);
          res.status(200).json({ alreadyPaid: true, provider: id });
          return;
        }
        session = { ...created, providerId: id };
        break;
      } catch (error) {
        // Failover is the whole point: one gateway refusing must not end checkout.
        lastError = error;
        console.error(JSON.stringify({
          event: 'pay_create_provider_failed',
          provider: id,
          status: Number(error?.status || 0),
          message: String(error?.message || error).slice(0, 240),
        }));
      }
    }
    if (!session) throw lastError || new Error('no-gateway-available');

    await Promise.all([
      dbPatch(orderPath(userUid, orderId), {
        gateway: session.providerId,
        gatewayMode: session.mode,
        gatewayOrderId: session.gatewayOrderId,
        paymentDeadline: expiresAt,
        gatewayCreatedAt: order.gatewayCreatedAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }),
      writeGatewayMapping(session.providerId, session.gatewayOrderId, userUid, orderId),
    ]);

    res.status(200).json({
      provider: session.providerId,
      mode: session.mode,
      gatewayOrderId: session.gatewayOrderId,
      // Razorpay opens a modal and needs its publishable key; PhonePe is a redirect.
      keyId: session.keyId || undefined,
      redirectUrl: session.redirectUrl || undefined,
      amount,
      currency: 'INR',
      orderNo: order.orderNo || orderId,
      customerName: String(order.address?.name || '').slice(0, 85),
      customerPhone: phone,
    });
  } catch (error) {
    const publicCode = publicError(error);
    console.error(JSON.stringify({
      event: 'pay_create_failed',
      status: Number(error?.status || 0),
      message: String(error?.message || error).slice(0, 240),
      publicError: publicCode,
    }));
    res.status(502).json({ error: publicCode });
  }
}
