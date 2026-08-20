import {
  cashfreeMode,
  cashfreeOrderIdFor,
  createCashfreeOrder,
  dbPatch,
  fetchCashfreeOrder,
  gatewayReady,
  isPaymentAdmin,
  money,
  orderPath,
  readOrder,
  stableUuid,
  verifyIdToken,
  writePaymentMapping,
} from '../lib/payments.mjs';

const bearer = req => String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
const PAYMENT_HOSTS = new Set([
  'www.nemoaquastore.in',
  'nemoaquastore.in',
  'nemo-aqua-store.navinkumarprcivil.workers.dev',
]);
const publicSite = req => {
  const configured = String(process.env.PUBLIC_SITE_URL || 'https://www.nemoaquastore.in').replace(/\/$/, '');
  const host = String(req.headers.host || req.headers['x-forwarded-host'] || '').split(',')[0].trim().split(':')[0].toLowerCase();
  return PAYMENT_HOSTS.has(host) ? `https://${host}` : configured;
};
const safePhone = value => {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.slice(-10);
};

export default async function handler(req, res) {
  if (req.method === 'GET') {
    res.status(200).json({
      ready: gatewayReady(),
      provider: 'cashfree',
      mode: cashfreeMode(),
      currency: 'INR',
    });
    return;
  }
  if (req.method !== 'POST') { res.status(405).json({ error: 'method-not-allowed' }); return; }
  if (!gatewayReady()) { res.status(503).json({ error: 'gateway-not-configured' }); return; }

  const uid = await verifyIdToken(bearer(req));
  if (!uid) { res.status(401).json({ error: 'sign-in-required' }); return; }
  if (cashfreeMode() === 'sandbox' && !(await isPaymentAdmin(uid))) {
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
    if (!/^[6-9]\d{9}$/.test(phone)) {
      res.status(409).json({ error: 'valid-phone-required' });
      return;
    }

    const cashfreeOrderId = String(order.gateway === 'cashfree' && order.gatewayOrderId || cashfreeOrderIdFor(orderId));
    let gatewayOrder = null;
    if (order.gateway === 'cashfree' && order.gatewayOrderId) {
      gatewayOrder = await fetchCashfreeOrder(cashfreeOrderId);
    } else {
      const site = publicSite(req);
      const returnUrl = `${site}/?payment_return=cashfree&order_id=${encodeURIComponent(orderId)}`;
      const notifyUrl = `${site}/api/pay-webhook`;
      const body = {
        order_id: cashfreeOrderId,
        order_amount: amount,
        order_currency: 'INR',
        customer_details: {
          customer_id: userUid.slice(0, 50),
          customer_name: String(order.address?.name || '').slice(0, 85),
          customer_email: String(order.userEmail || '').slice(0, 85) || undefined,
          customer_phone: phone,
        },
        order_meta: { return_url: returnUrl, notify_url: notifyUrl },
        order_expiry_time: new Date(deadline || (Date.now() + 10 * 60 * 1000)).toISOString(),
        order_note: `Nemo order ${String(order.orderNo || orderId)}`.slice(0, 200),
      };
      try {
        gatewayOrder = await createCashfreeOrder(body, stableUuid(`create:${userUid}:${orderId}`));
      } catch (error) {
        if (error?.code !== 'order_already_exists') throw error;
        gatewayOrder = await fetchCashfreeOrder(cashfreeOrderId);
      }
    }
    if (!gatewayOrder?.payment_session_id || gatewayOrder.order_id !== cashfreeOrderId) {
      throw new Error('cashfree-session-missing');
    }
    if (!['ACTIVE', 'PAID'].includes(String(gatewayOrder.order_status || ''))) {
      res.status(409).json({ error: 'payment-window-closed' });
      return;
    }
    await Promise.all([
      dbPatch(orderPath(userUid, orderId), {
        gateway: 'cashfree',
        gatewayMode: cashfreeMode(),
        gatewayOrderId: cashfreeOrderId,
        gatewayCreatedAt: order.gatewayCreatedAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }),
      writePaymentMapping(cashfreeOrderId, userUid, orderId),
    ]);
    res.status(200).json({
      provider: 'cashfree',
      mode: cashfreeMode(),
      paymentSessionId: gatewayOrder.payment_session_id,
      cashfreeOrderId,
      amount,
      currency: 'INR',
      orderNo: order.orderNo || orderId,
    });
  } catch (error) {
    console.error('pay-create', error?.message || error);
    res.status(500).json({ error: 'payment-session-failed' });
  }
}
