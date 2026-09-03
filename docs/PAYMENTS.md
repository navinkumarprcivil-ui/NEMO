# Payment gateway integration

Nemo takes card/UPI/netbanking payments through two gateways — **PhonePe** (PG v2 Standard
Checkout) and **Razorpay** — behind one checkout. Both run in production. The code lives in
`lib/gateways.mjs`; `lib/payments.mjs` holds the database plumbing they share.

A third gateway, Cashfree, was retired once both of these were verified end to end. Its code is
gone, but `providerForOrder` still returns `'cashfree'` for orders that recorded it, so those
historical orders keep resolving to a gateway that no longer exists rather than being silently
re-pointed at a live one. That is deliberate: they are GST records, and refunding one through
the wrong gateway would be worse than refusing.

## Which gateway is used

Checkout tries one gateway and falls back to the other if it cannot open a session. The order
is decided by, in priority:

1. `PAYMENT_PROVIDER_ORDER` — a comma-separated ops-level override, normally unset.
2. `settings.paymentPrimary` in the database — set from **Admin → Settings → 💳 Online
   Payment → Primary gateway**. Takes effect immediately, no deploy needed.
3. PhonePe first, as the built-in default.

Verification, webhooks and refunds never use this preference. They dispatch on the gateway
recorded on the order itself, so changing the primary cannot strand an existing order.

## Cloudflare configuration

Gateway credentials are **Secrets** in Cloudflare Workers → **Settings → Variables and
secrets**, never committed:

- `PHONEPE_CLIENT_ID`, `PHONEPE_CLIENT_SECRET`, `PHONEPE_CLIENT_VERSION`
- `PHONEPE_WEBHOOK_USERNAME`, `PHONEPE_WEBHOOK_PASSWORD`
- `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`
- `FIREBASE_SERVICE_ACCOUNT` — service-account JSON, raw or base64.

> **Add plaintext variables in `wrangler.jsonc`, not the dashboard.** Ad-hoc **Text** variables
> typed into this Worker's dashboard did not take effect at request time — `PHONEPE_ENV` was set
> to `production` there and the Worker still reported `sandbox` after repeated saves and a hard
> refresh. Dashboard **Secret** entries did take effect immediately. Non-secret values therefore
> live in the `vars` block of `wrangler.jsonc` and ship with the deploy.

Non-secret values in `wrangler.jsonc`:

- `PHONEPE_ENV` — `production`; anything other than the exact string `production` means sandbox.
- `PUBLIC_SITE_URL` — `https://www.nemoaquastore.in`.

Razorpay has no equivalent switch: its mode is derived from the key prefix, so an `rzp_live_…`
key *is* production and an `rzp_test_…` key *is* sandbox. The two can never disagree.

Optional: `PAYMENT_ADMIN_UIDS` (comma-separated Firebase UIDs) and `PAYMENT_PROVIDER_ORDER`.

## Webhooks

Both gateways POST to `https://www.nemoaquastore.in/api/pay-webhook`. Each provider verifies its
own credential and returns `null` otherwise, so the endpoint can safely offer the body to each in
turn — an unsigned body is rejected by all of them.

- **Razorpay** signs the raw body with HMAC-SHA256 using `RAZORPAY_WEBHOOK_SECRET`.
- **PhonePe** sends `SHA256("username:password")` in the `Authorization` header. There is no body
  signature, which is why the order id is never trusted from the body.

**Subscribe to as few events as possible.** `parseWebhook` resolves the order from
`payload.payment.entity` / `payload.order.entity` (Razorpay) or `payload.merchantOrderId`
(PhonePe). An event carrying neither is rejected with a 401, and a gateway that sees enough
failed deliveries will deactivate the webhook — taking the real payment notifications with it.

- Razorpay: `payment.captured`, `order.paid`, `payment.failed`.
- PhonePe: the order completed/failed pair for Standard Checkout. Do not subscribe refund,
  dispute, settlement, subscription or payment-page events.

Refund events used to be actively dangerous, not merely noisy: neither gateway retires the
underlying payment when money goes back (a PhonePe order stays `COMPLETED`; a Razorpay payment
stays `captured` after a *partial* refund), so a refund webhook passed every check in `confirm()`
and `finalizePayment` overwrote the refund with a fresh `Verified` / `Confirmed`. That is now
guarded — `finalizePayment` withholds the status fields once `refundedAmount` is above zero — but
the events still cost pointless API calls and should stay unsubscribed.

## Refunds

Admin → Orders offers two paths:

- **Auto / Gateway** — calls the gateway's refund API through `api/pay-refund.js`. Verified
  working on Razorpay.
- **Manual UPI** — records a refund that was actually made elsewhere. Use this when the gateway's
  API refuses.

PhonePe's refund API currently returns `401 Authorization failed` for this merchant account, using
the same OAuth credentials that successfully create real payments moments earlier. It is an
account-level restriction, not a code fault — PhonePe's dashboard reports no settlement in the
last 90 days, and refund API access typically unlocks after the first settlement cycle. Until it
does, refund a PhonePe order from PhonePe's own dashboard and record it in Nemo with **Manual
UPI**, and keep Razorpay as the primary gateway.

## Verifying a deploy

`GET https://www.nemoaquastore.in/api/pay-create` reports which gateways are configured, their
order, and each one's mode. It never exposes a credential. Append a cache-busting query string
(`?t=1`) when checking a change you just made.

```json
{"ready":true,
 "providers":[{"id":"razorpay","label":"Razorpay","mode":"production"},
              {"id":"phonepe","label":"PhonePe","mode":"production"}],
 "provider":"razorpay","mode":"production","currency":"INR"}
```

The browser never receives a gateway secret. Order creation, payment confirmation, amount
validation, webhook verification and refunds all run server-side, and a payment is only ever
confirmed by asking the gateway directly — never by trusting the browser or the webhook body.
