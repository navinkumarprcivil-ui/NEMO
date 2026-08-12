# Payment gateway — turning it on

The store ships with two checkouts and picks between them by itself.

**Today (no keys):** the customer pays by UPI, types a reference, uploads a
screenshot, and you verify it by hand in the admin panel.

**Once the keys below are set:** the customer taps one button, pays by UPI, card,
netbanking or wallet, and the order confirms itself. No reference, no screenshot,
nothing for you to check.

Nothing in the code changes between those two states. `/api/pay-create` answers
whether a gateway is configured, the storefront asks once per load, and the
payment screen renders accordingly. Set the variables, redeploy, done. Unset them
and the manual flow comes straight back — which is also the way to roll back if
anything goes wrong on the day.

---

## 1. Environment variables

Set these in **Vercel → Project → Settings → Environment Variables** (Production,
and Preview if you want to test there).

| Variable | Where it comes from | Secret? |
|---|---|---|
| `RAZORPAY_KEY_ID` | Razorpay Dashboard → Account & Settings → API Keys | No — also sent to the browser |
| `RAZORPAY_KEY_SECRET` | shown once when you generate the key | **Yes** |
| `RAZORPAY_WEBHOOK_SECRET` | you choose it when creating the webhook (step 3) | **Yes** |
| `FIREBASE_SERVICE_ACCOUNT` | Firebase Console → Project Settings → Service accounts → Generate new private key | **Yes** |
| `ADMIN_UIDS` | optional; defaults to the existing admin uid | No |

`FIREBASE_SERVICE_ACCOUNT` is the whole downloaded JSON file. Paste it as one
line. If the multi-line private key gets mangled by the dashboard, base64 the
file instead (`base64 -w0 service-account.json`) and paste that — both are
accepted.

The secret keys are never sent to the browser. Do not put them in `settings`,
in `app.jsx`, or anywhere in this repository.

## 2. Live vs test keys

Razorpay gives you test keys (`rzp_test_…`) and live keys (`rzp_live_…`). Use the
test pair on a Preview deployment first and pay yourself with Razorpay's test
card. Only move the live pair into Production once a test order has confirmed
itself end to end.

## 3. The webhook

Razorpay Dashboard → Settings → Webhooks → **Add New Webhook**

- **URL:** `https://www.nemoaquastore.in/api/pay-webhook`
- **Secret:** any long random string — put the same value in `RAZORPAY_WEBHOOK_SECRET`
- **Active events:** `payment.captured` and `order.paid`

This is the part that actually confirms orders. Without it, customers can pay and
their orders will sit at "Awaiting Payment" until the ten-minute window cancels
them — so check the webhook is delivering (Razorpay shows recent deliveries and
their response codes) before you take real money.

## 4. What to check after switching on

1. Place a real order for a cheap item and pay it.
2. The order should reach **Confirmed** on its own within a few seconds.
3. `paymentStatus` should read `Verified` and `txnId` should hold the Razorpay
   payment id (`pay_…`).
4. In the admin order screen, the **Refund via payment gateway** button should
   appear on that order.

## 5. Refunds

Open the order in admin → Cancellation & Refund → **Refund ₹… via payment
gateway**. It asks for an amount (defaulting to the full one), so a partial
refund — one dead fish out of six — is a single tap. The money goes back to
whatever the customer paid with; Razorpay settles it in 5–7 working days, which
is what the invoice promises.

A refund is authorised by your Firebase ID token, not by the admin panel
password: **you must be signed in with the admin Google account**, not merely
past the password screen. The server verifies that token against Google before
it will move any money.

Orders paid the old manual way have no gateway payment to reverse, so they keep
the manual "record the refund" editor instead.

## 6. Retiring the manual flow

Once the gateway has run clean for a few days, the manual pieces can be deleted:
the UPI deep link and "Copy UPI ID" block, the transaction-ID and screenshot
inputs in `PaymentPanel`, the `razorpayLink` and `upiId` settings, and the
`Payment Review` status. They are already switched off automatically whenever the
gateway is configured — deleting them is tidying, not a fix, and there is no
hurry. Keeping them a while is a free rollback.

## 7. What the server refuses to trust

Worth knowing, because it is the reason this needed a server at all:

- **The amount is never taken from the browser.** `/api/pay-create` reads the
  order back out of the database and bills what the order says is due.
- **The browser never confirms a payment.** Only the signed webhook does, and the
  signature is checked over the raw request body against a secret the page has
  never seen.
- **The captured amount is checked against the order** before it is confirmed. An
  order that says ₹1 collects ₹1 and never confirms the ₹4,000 of fish attached
  to it.
- **Refunds require a verified admin token,** not a password typed into a page.

This closes a hole the manual flow always had: the browser composes the order
total, and the database rules can freeze it but cannot know what it *should* be.
Now the gateway does.
