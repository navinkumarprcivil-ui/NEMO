import { isPaymentAdmin, readOrder, verifyIdToken } from '../lib/payments.mjs';
import {
  allProvidersSandbox,
  finalizePayment,
  paymentsReady,
  providerById,
  providerForOrder,
  razorpayCheckoutSignatureValid,
} from '../lib/gateways.mjs';

const bearer = req => String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
const SETTLED = ['payment-not-complete', 'payment-amount-mismatch', 'payment-order-mismatch', 'order-not-payable', 'gateway-unknown'];

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'method-not-allowed' }); return; }
  if (!paymentsReady()) { res.status(503).json({ error: 'gateway-not-configured' }); return; }
  const uid = await verifyIdToken(bearer(req));
  if (!uid) { res.status(401).json({ error: 'sign-in-required' }); return; }
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
    if (!order || order.id !== orderId || order.userUid !== userUid) {
      res.status(404).json({ error: 'order-not-found' });
      return;
    }
    if (!order.gatewayOrderId) { res.status(409).json({ error: 'payment-session-missing' }); return; }

    /* The gateway that created this order settles it — never today's preferred one.
       That is what keeps an order created under one gateway verifiable after the
       default has moved on. */
    const providerId = providerForOrder(order);
    if (!providerById(providerId)?.ready()) {
      res.status(409).json({ error: 'gateway-unavailable' });
      return;
    }

    /* Razorpay's browser callback is signed. Checking it here rejects a forged success
       before we spend an API call — but it is only a gate, never the proof: finalizePayment
       still asks Razorpay directly whether the money arrived, and for how much. */
    if (providerId === 'razorpay' && req.body?.razorpayPaymentId) {
      const ok = razorpayCheckoutSignatureValid(
        order.gatewayOrderId, String(req.body.razorpayPaymentId), String(req.body.razorpaySignature || ''));
      if (!ok) { res.status(400).json({ error: 'payment-signature-invalid' }); return; }
    }

    const result = await finalizePayment(providerId, userUid, orderId, order.gatewayOrderId);
    res.status(200).json({
      ok: true,
      provider: providerId,
      mode: result.gatewayMode,
      status: result.status,
      paymentStatus: result.paymentStatus,
      paymentId: result.gatewayPaymentId,
    });
  } catch (error) {
    const message = String(error?.message || '');
    if (SETTLED.includes(message)) { res.status(409).json({ error: message }); return; }
    console.error('pay-verify', message || error);
    res.status(500).json({ error: 'payment-verification-failed' });
  }
}
