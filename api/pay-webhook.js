import {
  dbGet,
  dbPatch,
  finalizeCashfreePayment,
  gatewayReady,
  rawBody,
  readPaymentMapping,
  stableUuid,
  webhookSignatureValid,
} from '../lib/payments.mjs';

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).end(); return; }
  if (!gatewayReady()) { res.status(503).json({ error: 'gateway-not-configured' }); return; }
  try {
    const raw = await rawBody(req);
    const timestamp = String(req.headers['x-webhook-timestamp'] || '');
    const signature = String(req.headers['x-webhook-signature'] || '');
    const webhookVersion = String(req.headers['x-webhook-version'] || '');
    if (!timestamp || !signature || !webhookVersion) {
      res.status(400).json({ error: 'missing-webhook-headers' });
      return;
    }
    if (!webhookSignatureValid(raw, timestamp, signature)) {
      res.status(401).json({ error: 'invalid-signature' });
      return;
    }
    const event = JSON.parse(raw);
    if (event?.type !== 'PAYMENT_SUCCESS_WEBHOOK' || event?.data?.payment?.payment_status !== 'SUCCESS') {
      res.status(200).json({ ok: true, ignored: true });
      return;
    }
    const cashfreeOrderId = String(event?.data?.order?.order_id || '');
    const mapping = await readPaymentMapping(cashfreeOrderId);
    if (!mapping?.userUid || !mapping?.orderId || mapping.cashfreeOrderId !== cashfreeOrderId) {
      res.status(200).json({ ok: true, ignored: true });
      return;
    }
    const suppliedIdempotency = String(req.headers['x-idempotency-key'] || req.headers['x-idempotency-header'] || '');
    const eventId = suppliedIdempotency || stableUuid(`${timestamp}:${signature}`);
    const eventPath = `paymentWebhookEvents/${encodeURIComponent(eventId)}`;
    const previous = await dbGet(eventPath).catch(() => null);
    if (previous?.processed === true) {
      res.status(200).json({ ok: true, duplicate: true });
      return;
    }
    const result = await finalizeCashfreePayment(mapping.userUid, mapping.orderId, cashfreeOrderId);
    await dbPatch(eventPath, {
      processed: true,
      cashfreeOrderId,
      paymentId: result.gatewayPaymentId,
      webhookVersion,
      processedAt: Date.now(),
    });
    res.status(200).json({ ok: true });
  } catch (error) {
    console.error('pay-webhook', error?.message || error);
    // A non-2xx response lets Cashfree retry transient verification/database failures.
    res.status(500).json({ error: 'webhook-processing-failed' });
  }
}
