import {
  cashfreeMode,
  dbPatch,
  gatewayReady,
  isPaymentAdmin,
  money,
  orderPath,
  readOrder,
  refundCashfreeOrder,
  sameMoney,
  stableUuid,
  verifyIdToken,
} from '../lib/payments.mjs';

const bearer = req => String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'method-not-allowed' }); return; }
  if (!gatewayReady()) { res.status(503).json({ error: 'gateway-not-configured' }); return; }
  const uid = await verifyIdToken(bearer(req));
  if (!uid) { res.status(401).json({ error: 'sign-in-required' }); return; }
  if (!(await isPaymentAdmin(uid))) { res.status(403).json({ error: 'not-admin' }); return; }

  try {
    const userUid = String(req.body?.userUid || '');
    const orderId = String(req.body?.orderId || '');
    const amount = money(req.body?.amount);
    if (!userUid || !orderId || userUid.length > 160 || orderId.length > 160) {
      res.status(400).json({ error: 'order-required' });
      return;
    }
    const order = await readOrder(userUid, orderId);
    if (!order) { res.status(404).json({ error: 'order-not-found' }); return; }
    if (order.gateway !== 'cashfree' || !order.gatewayOrderId || !order.gatewayPaymentId) {
      res.status(409).json({ error: 'no-gateway-payment' });
      return;
    }
    const paid = money(order.amountDue ?? ((Number(order.total) || 0) + (Number(order.fee) || 0)));
    const already = money(order.refundedAmount || 0);
    const remaining = money(paid - already);
    if (!(amount > 0) || amount > remaining) {
      res.status(409).json({ error: remaining <= 0 ? 'already-refunded' : 'invalid-refund-amount' });
      return;
    }
    const target = money(already + amount);
    const refundId = `cf_${stableUuid(`refund:${userUid}:${orderId}:${Math.round(target * 100)}`)}`;
    const refund = await refundCashfreeOrder(order.gatewayOrderId, {
      refund_amount: amount,
      refund_id: refundId,
      refund_note: String(req.body?.reason || `Refund for ${order.orderNo || orderId}`).slice(0, 100),
      refund_speed: 'STANDARD',
    }, stableUuid(`request:${refundId}`));
    const fullyRefunded = sameMoney(target, paid);
    const now = new Date().toISOString();
    await dbPatch(orderPath(userUid, orderId), {
      refundId: String(refund.refund_id || refundId),
      gatewayRefundId: String(refund.cf_refund_id || ''),
      gatewayRefundStatus: String(refund.refund_status || 'PENDING'),
      refundedAmount: target,
      refundedAt: now,
      ...(fullyRefunded ? { paymentStatus: cashfreeMode() === 'sandbox' ? 'Test Refunded' : 'Refunded' } : {}),
      refund: {
        ...(order.refund || {}),
        method: 'gateway',
        amount: target,
        ref: String(refund.refund_id || refundId),
        status: String(refund.refund_status || 'PENDING').toLowerCase(),
        at: now,
      },
      updatedAt: now,
    });
    res.status(200).json({
      ok: true,
      amount,
      totalRefunded: target,
      refundId: String(refund.refund_id || refundId),
      gatewayRefundId: String(refund.cf_refund_id || ''),
      status: String(refund.refund_status || 'PENDING'),
      fullyRefunded,
      mode: cashfreeMode(),
    });
  } catch (error) {
    console.error('pay-refund', error?.message || error);
    res.status(500).json({ error: 'refund-failed' });
  }
}
