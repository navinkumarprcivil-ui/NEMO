# Cashfree payment integration

Nemo uses Cashfree Hosted Web Checkout through the Cloudflare Worker. The integration stays in sandbox until Cashfree approves the live website and the sandbox checkout, webhook, and server-side verification all pass.

## Cloudflare configuration

Keep secret values in Cloudflare Workers **Settings → Variables and Secrets**; never commit them:

- `CASHFREE_APP_ID` — Test App ID while the store is in sandbox.
- `CASHFREE_SECRET_KEY` — matching Test Secret Key.
- `FIREBASE_SERVICE_ACCOUNT` — Firebase service-account JSON, either raw JSON or base64-encoded.

The repository keeps these non-secret values in `wrangler.jsonc`:

- `CASHFREE_ENV` — must remain `sandbox` until production approval.
- `PUBLIC_SITE_URL` — `https://www.nemoaquastore.in`.

Optional Worker variables are `PAYMENT_ADMIN_UIDS` (comma-separated Firebase admin UIDs) and `CASHFREE_API_VERSION` (defaults to `2025-01-01`).

## Sandbox behaviour

- Only a signed-in Nemo admin can see and call the sandbox checkout.
- Normal customers continue to see the current manual UPI flow.
- The checkout is labelled **Cashfree Sandbox · Test Mode** and uses Cashfree's official test instruments.
- A successful test is stored as `Test Paid` / `Payment Review`. It does not activate fulfilment, referral codes, or reward coins.
- Cancel the test order afterwards so its locally reserved stock is released through the normal admin flow.

## Cashfree Test Mode setup

1. Whitelist `https://www.nemoaquastore.in` for Hosted Web Checkout.
2. Add `https://www.nemoaquastore.in/api/pay-webhook` as the Test webhook.
3. Enable the Payment Success event and select a webhook version supported by the account.
4. Send a dashboard test webhook and confirm HTTP 200.
5. Sign in to the live store with an owner/admin account, create a test order, and open **Cashfree Sandbox · Test Mode**.
6. Complete a Cashfree test payment and confirm the order becomes `Test Paid` / `Payment Review`.
7. Confirm both return verification and the webhook are idempotent, then cancel the test order to release reserved stock.

The public readiness endpoint is `GET https://www.nemoaquastore.in/api/pay-create`. It reports whether the Worker has the required server credentials but never exposes them.

## Production activation checklist

Do not start these steps until Cashfree approves the website and live payments:

1. Finish the sandbox checklist above.
2. Add the same webhook URL in Cashfree Production Mode and enable Payment Success.
3. Replace only the Worker Cashfree secrets with the **live** App ID and Secret Key.
4. Change `CASHFREE_ENV` in `wrangler.jsonc` to `production`, review the diff, and deploy from `main`.
5. Perform one low-value real transaction, verify the order becomes `Gateway Paid — Review` / `Payment Review`, approve it in Nemo Admin, and refund the test purchase.

The browser never receives the Cashfree secret. Order creation, payment confirmation, amount validation, webhook verification, and refunds run server-side. Even a verified live payment stays in Payment Review until the owner accepts the order.
