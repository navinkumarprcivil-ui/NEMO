/**
 * Open a payment for an order that already exists.
 *
 * The browser posts only { userUid, orderId }. It does NOT get to say what the
 * order costs — this reads the order back out of the database and bills the
 * amountDue recorded there. That is the whole point of the endpoint: if the
 * amount travelled from the browser, tampering with it would be trivial and the
 * gateway would faithfully collect the wrong sum.
 *
 * Returns what Razorpay Checkout needs to open, and nothing secret.
 */
import { gatewayReady, rzpKeyId, readOrder, createRazorpayOrder, toPaise, dbPatch, orderPath } from '../lib/payments.mjs';

export default async function handler(req, res) {
  /* Readiness probe. The storefront asks once at boot whether a gateway exists and
     picks its checkout accordingly, so dropping the keys into the environment
     switches the store over with no code change and no build. Only the public key
     id is ever returned. */
  if (req.method === 'GET') {
    res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=60');
    res.status(200).json({ ready: gatewayReady(), keyId: gatewayReady() ? rzpKeyId() : '' });
    return;
  }
  if (req.method !== 'POST') { res.status(405).json({ error: 'method' }); return; }
  if (!gatewayReady()) { res.status(503).json({ error: 'gateway-not-configured' }); return; }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const userUid = String(body.userUid || '').slice(0, 128);
    const orderId = String(body.orderId || '').slice(0, 128);
    if (!userUid || !orderId) { res.status(400).json({ error: 'missing-order' }); return; }

    const order = await readOrder(userUid, orderId);
    if (!order) { res.status(404).json({ error: 'order-not-found' }); return; }

    // Only an order still waiting for money may open a payment. Without this an
    // already-paid order could be charged a second time by replaying the call.
    if (order.status !== 'Awaiting Payment') { res.status(409).json({ error: 'order-not-payable', status: order.status || '' }); return; }

    const amountPaise = toPaise(order.amountDue != null ? order.amountDue : order.total);
    if (!(amountPaise > 0)) { res.status(400).json({ error: 'bad-amount' }); return; }

    const rzpOrder = await createRazorpayOrder({
      amountPaise,
      receipt: String(order.orderNo || orderId).slice(0, 40),
      // Echoed back on the webhook so it can find the order again.
      notes: { userUid, orderId, orderNo: String(order.orderNo || '') },
    });

    // Remember which Razorpay order belongs to this one, so the webhook can be
    // matched even if the notes are ever missing, and so a duplicate payment is
    // recognisable afterwards.
    await dbPatch(orderPath(userUid, orderId), { gatewayOrderId: rzpOrder.id, gateway: 'razorpay' });

    res.status(200).json({
      keyId: rzpKeyId(),
      razorpayOrderId: rzpOrder.id,
      amount: amountPaise,
      currency: 'INR',
      orderNo: order.orderNo || '',
      name: order.address?.name || '',
      email: order.userEmail || '',
      contact: order.userPhone || '',
    });
  } catch (e) {
    console.error('pay-create', e?.message || e);
    res.status(500).json({ error: 'create-failed' });
  }
}
