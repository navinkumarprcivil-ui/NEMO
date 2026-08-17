/**
 * Razorpay's word that money moved — the only thing allowed to confirm an order.
 *
 * The browser is never believed about payment. It can be closed, replayed, or
 * lied to; this endpoint is reached by Razorpay's own servers carrying an HMAC
 * over the raw body, computed with a secret the browser has never seen.
 *
 * Order of business, and none of it is optional:
 *   1. Verify the signature over the RAW bytes.
 *   2. Find the order in the database from the notes Razorpay echoed back.
 *   3. Check the captured amount against what the order says is due.
 *   4. Only then move it to Confirmed.
 *
 * Step 3 is what makes the whole thing worth having. The notes ride along with
 * the payment and are influenced by whoever opened it, so they are treated as a
 * lookup hint, never as truth: whatever order they point at, the amount that
 * order records must match the amount actually captured.
 *
 * Stock is NOT touched here. It is decremented when the order is placed, which
 * is what holds a customer's items for the ten-minute payment window, and
 * returned by the existing auto-cancel if they never pay. Confirming a payment
 * must not decrement it a second time.
 */
import { webhookSignatureValid, rawBody, readOrder, dbPatch, dbTransaction, orderPath, toPaise, settleReferralsAfterPayment } from '../lib/payments.mjs';

// Vercel parses JSON bodies by default, which destroys the bytes the signature
// was computed over. Ask for the body untouched.
export const config = { api: { bodyParser: false } };

const PAID_EVENTS = new Set(['payment.captured', 'order.paid']);

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).end(); return; }

  let raw = '';
  try { raw = await rawBody(req); } catch { res.status(400).end(); return; }

  if (!webhookSignatureValid(raw, req.headers['x-razorpay-signature'])) {
    // Deliberately terse: an attacker probing the endpoint learns nothing about
    // whether the secret is set, wrong, or the body malformed.
    res.status(401).json({ error: 'bad-signature' });
    return;
  }

  let evt;
  try { evt = JSON.parse(raw); } catch { res.status(400).json({ error: 'bad-json' }); return; }

  const event = String(evt.event || '');
  const payment = evt.payload?.payment?.entity || null;

  // Anything else (refund.processed, payment.failed, …) is acknowledged so
  // Razorpay stops retrying, but changes nothing here.
  if (!PAID_EVENTS.has(event) || !payment) { res.status(200).json({ ok: true, ignored: event }); return; }

  try {
    const notes = payment.notes || {};
    const userUid = String(notes.userUid || '');
    const orderId = String(notes.orderId || '');
    const order = await readOrder(userUid, orderId);
    if (!order) {
      // 200, not 404: a retry will not make the order exist, and a webhook that
      // keeps failing gets the endpoint disabled in the dashboard.
      console.error('pay-webhook: no order for', userUid, orderId);
      res.status(200).json({ ok: true, unmatched: true });
      return;
    }

    const due = toPaise(order.amountDue != null ? order.amountDue : order.total);
    const paid = Number(payment.amount || 0);
    if (paid < due) {
      console.error('pay-webhook: underpaid', order.orderNo, paid, 'of', due);
      await dbPatch(orderPath(userUid, orderId), {
        paymentStatus: 'Underpaid',
        gatewayPaymentId: String(payment.id || ''),
        gatewayAmount: paid,
        updatedAt: new Date().toISOString(),
      });
      res.status(200).json({ ok: true, underpaid: true });
      return;
    }

    // Idempotent: Razorpay retries, and payment.captured/order.paid can both
    // arrive for the same payment. Re-confirming an already-confirmed order is
    // harmless, but do not drag a shipped order back to Confirmed.
    const alreadyMovedOn = ['Shipped', 'Delivered', 'Cancelled'].includes(order.status);
    await dbPatch(orderPath(userUid, orderId), {
      ...(alreadyMovedOn ? {} : { status: 'Confirmed' }),
      paymentStatus: 'Verified',
      paymentMethod: String(payment.method || 'online'),
      txnId: String(payment.id || ''),
      gatewayPaymentId: String(payment.id || ''),
      gatewayAmount: paid,
      paidAt: order.paidAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    const referralConsumed = await settleReferralsAfterPayment(order, userUid, orderId);
    if (referralConsumed && !order.referralUsageCounted) {
      const day = new Date().toISOString().slice(0, 10);
      await dbTransaction(`promoUsage/${day}/referral`, value => (Number(value) || 0) + 1);
      await dbPatch(orderPath(userUid, orderId), { referralUsageCounted: true });
    }

    res.status(200).json({ ok: true });
  } catch (e) {
    console.error('pay-webhook', e?.message || e);
    // 500 asks Razorpay to retry — right for a transient database failure.
    res.status(500).json({ error: 'handler-failed' });
  }
}
