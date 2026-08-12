/**
 * Send a refund back through the gateway — admin only.
 *
 * This moves real money outward, so the caller proves who they are rather than
 * asserting it: the browser sends the Firebase ID token of the signed-in admin,
 * and it is verified here against Google's public certificates before anything
 * else happens. A password in the admin panel unlocks a screen; it does not
 * authenticate a request, and it must not be what stands between the internet
 * and the refund API.
 *
 * The amount is bounded by the payment as Razorpay records it, not by anything
 * the caller sends, so a tampered request cannot refund more than was taken.
 */
import { gatewayReady, verifyIdToken, readOrder, dbPatch, orderPath, refundRazorpayPayment, fetchRazorpayPayment, toPaise } from '../lib/payments.mjs';

// Kept in step with ADMIN_UIDS in app.jsx and the admin uid in database.rules.json.
const ADMIN_UIDS = (process.env.ADMIN_UIDS || 'cI2HmMt6FdR7fO7uUnugH85GeZt2')
  .split(',').map((s) => s.trim()).filter(Boolean);

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'method' }); return; }
  if (!gatewayReady()) { res.status(503).json({ error: 'gateway-not-configured' }); return; }

  const bearer = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const uid = await verifyIdToken(bearer);
  if (!uid || !ADMIN_UIDS.includes(uid)) { res.status(403).json({ error: 'not-admin' }); return; }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const userUid = String(body.userUid || '').slice(0, 128);
    const orderId = String(body.orderId || '').slice(0, 128);
    if (!userUid || !orderId) { res.status(400).json({ error: 'missing-order' }); return; }

    const order = await readOrder(userUid, orderId);
    if (!order) { res.status(404).json({ error: 'order-not-found' }); return; }

    const paymentId = String(order.gatewayPaymentId || order.txnId || '');
    if (!paymentId) { res.status(409).json({ error: 'no-gateway-payment' }); return; }

    // What Razorpay says was captured, and what it has already sent back. Both
    // come from Razorpay rather than from the order record, so a refund cannot
    // exceed the real payment even if the order was written wrong.
    const payment = await fetchRazorpayPayment(paymentId);
    const captured = Number(payment.amount || 0);
    const already = Number(payment.amount_refunded || 0);
    const remaining = Math.max(0, captured - already);
    if (remaining <= 0) { res.status(409).json({ error: 'already-refunded' }); return; }

    // A partial amount may be asked for (one dead fish out of six); anything
    // above what is left is clamped rather than rejected, so a rounding
    // difference between the invoice and the capture cannot block a full refund.
    const wanted = body.amount != null ? toPaise(body.amount) : null;
    const amountPaise = wanted != null ? Math.min(Math.max(1, wanted), remaining) : remaining;

    const refund = await refundRazorpayPayment(paymentId, amountPaise, {
      orderNo: String(order.orderNo || ''), reason: String(body.reason || '').slice(0, 120),
    });

    const total = already + amountPaise;
    await dbPatch(orderPath(userUid, orderId), {
      refundId: String(refund.id || ''),
      refundedAmount: total / 100,
      refundedAt: new Date().toISOString(),
      // Only a refund of the whole capture makes the order refunded; a partial
      // one leaves it where it was, with the amount recorded against it.
      ...(total >= captured ? { paymentStatus: 'Refunded' } : {}),
      updatedAt: new Date().toISOString(),
    });

    res.status(200).json({ ok: true, refundId: refund.id, amount: amountPaise / 100, fullyRefunded: total >= captured });
  } catch (e) {
    console.error('pay-refund', e?.message || e);
    res.status(500).json({ error: 'refund-failed', message: String(e?.message || '').slice(0, 200) });
  }
}
