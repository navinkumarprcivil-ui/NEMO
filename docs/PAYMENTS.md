# Cashfree payment integration

Nemo uses Cashfree Hosted Web Checkout. The integration is intentionally sandbox-first while the merchant account is being activated.

## Vercel environment variables

Set these in the Vercel project; never commit their values:

- `CASHFREE_APP_ID` — Test App ID from Cashfree while activation is pending.
- `CASHFREE_SECRET_KEY` — matching Test Secret Key.
- `CASHFREE_ENV` — `sandbox` during testing. Change to `production` only with live credentials after Cashfree activates the account.
- `FIREBASE_SERVICE_ACCOUNT` — Firebase service-account JSON, either raw JSON or base64-encoded.
- `PUBLIC_SITE_URL` — optional; defaults to `https://www.nemoaquastore.in`.
- `PAYMENT_ADMIN_UIDS` — optional comma-separated additional Firebase admin UIDs.

`CASHFREE_API_VERSION` is optional and defaults to `2025-01-01`.

## Sandbox behaviour

- Only a signed-in Nemo admin can see and call the sandbox checkout.
- Normal customers continue to see the current manual UPI flow.
- The checkout is labelled **Cashfree Sandbox · Test Mode** and uses Cashfree's official test instruments.
- A successful test is stored as `Test Paid` / `Payment Review`. It does not activate fulfilment, referral codes, or reward coins.
- Cancel the test order afterwards so its locally reserved stock is released through the normal admin flow.

## Cashfree dashboard setup

1. In Cashfree Test Mode, whitelist `https://www.nemoaquastore.in`.
2. Add the Test webhook endpoint `https://www.nemoaquastore.in/api/pay-webhook`.
3. Select the Payment Success event and webhook version `2025-01-01` or newer.
4. Use the dashboard's webhook test action and confirm it receives HTTP 200.
5. Run a sandbox order from the owner/admin Google account on the live site.

## Production activation checklist

1. Wait until Cashfree has activated live payments and domain approval.
2. Replace the Vercel variables with the **live** App ID and Secret Key.
3. Set `CASHFREE_ENV=production`.
4. Add the same webhook URL in Cashfree Production Mode and enable Payment Success.
5. Perform one low-value real transaction, verify the order becomes `Gateway Paid — Review` / `Payment Review`, approve it in Nemo Admin, then refund the test purchase.

The browser never receives the Cashfree secret. Order creation, payment confirmation, amount validation, webhook verification, and refunds all execute server-side. Even a verified live payment stays in Payment Review until the owner accepts the order, so catalogue-price and discount review remains part of fulfilment.
