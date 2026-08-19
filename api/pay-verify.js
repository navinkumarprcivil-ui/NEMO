import {
  cashfreeMode,
  finalizeCashfreePayment,
  gatewayReady,
  isPaymentAdmin,
  readOrder,
  verifyIdToken,
} from '../lib/payments.mjs';

const bearer = req => String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');

export default async function handler(req, res) {
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
    if (!order || order.id !== orderId || order.userUid !== userUid) {
      res.status(404).json({ error: 'order-not-found' });
      return;
    }
    if (order.gateway !== 'cashfree' || !order.gatewayOrderId) {
      res.status(409).json({ error: 'payment-session-missing' });
      return;
    }
    const result = await finalizeCashfreePayment(userUid, orderId, order.gatewayOrderId);
    res.status(200).json({
      ok: true,
      mode: cashfreeMode(),
      status: result.status,
      paymentStatus: result.paymentStatus,
      paymentId: result.gatewayPaymentId,
    });
  } catch (error) {
    const message = String(error?.message || '');
    if (['payment-not-complete', 'payment-amount-mismatch', 'payment-order-mismatch', 'order-not-payable'].includes(message)) {
      res.status(409).json({ error: message });
      return;
    }
    console.error('pay-verify', message || error);
    res.status(500).json({ error: 'payment-verification-failed' });
  }
}
