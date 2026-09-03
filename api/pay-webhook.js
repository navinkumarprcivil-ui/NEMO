import { dbGet, dbPatch, stableUuid } from '../lib/payments.mjs';
import {
  availableProviders,
  finalizePayment,
  paymentsReady,
  providerById,
  providerForOrder,
  readGatewayMapping,
} from '../lib/gateways.mjs';
import { rawBody } from '../lib/payments.mjs';

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).end(); return; }
  if (!(await paymentsReady())) { res.status(503).json({ error: 'gateway-not-configured' }); return; }
  try {
    const raw = await rawBody(req);

    /* Which gateway sent this. Each provider verifies its OWN signature or credential and
       returns null otherwise, so asking them in turn is safe: an unsigned or wrongly signed
       body is rejected by every one of them and never reaches an order. */
    let parsed = null;
    for (const id of await availableProviders()) {
      const hit = providerById(id)?.parseWebhook(raw, req.headers);
      if (hit) { parsed = hit; break; }
    }
    if (!parsed) { res.status(401).json({ error: 'invalid-signature' }); return; }

    /* The body is trusted only to NAME a gateway order. Which customer order that is comes
       from the mapping we wrote when the session was created — never from the body, which
       would let anyone who can POST choose an order to mark paid. */
    const mapping = await readGatewayMapping(parsed.gatewayOrderId);
    if (!mapping?.userUid || !mapping?.orderId) {
      // Unknown order: acknowledge so the gateway stops retrying something we cannot act on.
      res.status(200).json({ ok: true, ignored: true });
      return;
    }
    if (mapping.provider && mapping.provider !== parsed.provider) {
      // A signed event from the wrong gateway for this order. Refuse rather than settle it.
      res.status(200).json({ ok: true, ignored: true });
      return;
    }

    /* Replayed deliveries are normal — every gateway retries. The event id makes settlement
       happen once; finalizePayment is idempotent regardless, this just saves the API calls. */
    const eventId = stableUuid(`${parsed.provider}:${parsed.gatewayOrderId}:${parsed.event}`);
    const eventPath = `paymentWebhookEvents/${encodeURIComponent(eventId)}`;
    const previous = await dbGet(eventPath).catch(() => null);
    if (previous?.processed === true) { res.status(200).json({ ok: true, duplicate: true }); return; }

    const providerId = providerForOrder({ gateway: mapping.provider || parsed.provider });
    const result = await finalizePayment(providerId, mapping.userUid, mapping.orderId, parsed.gatewayOrderId);
    await dbPatch(eventPath, {
      processed: true,
      provider: parsed.provider,
      event: parsed.event,
      gatewayOrderId: parsed.gatewayOrderId,
      paymentId: result.gatewayPaymentId,
      processedAt: Date.now(),
    });
    res.status(200).json({ ok: true });
  } catch (error) {
    const message = String(error?.message || error);
    /* A payment that is simply not complete yet is not a failure of ours — acknowledge it,
       or the gateway retries a pending payment forever. Real faults return 500 so it retries. */
    if (message === 'payment-not-complete') { res.status(200).json({ ok: true, pending: true }); return; }
    console.error('pay-webhook', message);
    res.status(500).json({ error: 'webhook-processing-failed' });
  }
}
