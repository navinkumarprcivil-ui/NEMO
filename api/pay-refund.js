import {
  dbPatch, isPaymentAdmin, money, orderPath, readOrder, sameMoney, stableUuid, verifyIdToken,
} from '../lib/payments.mjs';
import { paymentsReady, providerById, providerForOrder } from '../lib/gateways.mjs';

const bearer = req => String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'method-not-allowed' }); return; }
  if (!paymentsReady()) { res.status(503).json({ error: 'gateway-not-configured' }); return; }
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
    if (!order.gatewayOrderId || !order.gatewayPaymentId) {
      res.status(409).json({ error: 'no-gateway-payment' });
      return;
    }

    /* Refund through the gateway that took the money. An order paid on one gateway can only
       be refunded there, so this dispatches on the order's own record rather than on today's
       preference — and says so plainly when that gateway is no longer configured, instead of
       failing in a way that looks like the refund was attempted. */
    const providerId = providerForOrder(order);
    const provider = providerById(providerId);
    if (!provider?.ready()) {
      res.status(409).json({ error: 'gateway-unavailable', gateway: providerId });
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
    // Derived from the running total, so retrying the same refund is the same request at the
    // gateway rather than a second one that would pay the customer twice.
    const idempotencyKey = stableUuid(`refund:${userUid}:${orderId}:${Math.round(target * 100)}`);

    const refund = await provider.refund({
      gatewayOrderId: order.gatewayOrderId,
      paymentId: order.gatewayPaymentId,
      amount,
      idempotencyKey,
      notes: { orderNo: String(order.orderNo || orderId) },
    });

    const fullyRefunded = sameMoney(target, paid);
    const sandbox = provider.mode() === 'sandbox';
    const now = new Date().toISOString();
    await dbPatch(orderPath(userUid, orderId), {
      refundId: refund.refundId,
      gatewayRefundId: refund.refundId,
      gatewayRefundStatus: refund.status || 'PENDING',
      refundedAmount: target,
      refundedAt: now,
      ...(fullyRefunded ? { paymentStatus: sandbox ? 'Test Refunded' : 'Refunded' } : {}),
      refund: {
        ...(order.refund || {}),
        method: 'gateway',
        gateway: providerId,
        amount: target,
        ref: refund.refundId,
        status: String(refund.status || 'PENDING').toLowerCase(),
        at: now,
      },
      updatedAt: now,
    });
    res.status(200).json({
      ok: true,
      gateway: providerId,
      amount,
      totalRefunded: target,
      refundId: refund.refundId,
      status: refund.status || 'PENDING',
      fullyRefunded,
      mode: provider.mode(),
    });
  } catch (error) {
    console.error('pay-refund', error?.message || error);
    res.status(500).json({ error: 'refund-failed' });
  }
}
