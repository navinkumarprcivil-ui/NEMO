# Nemo Aqua Store — Project Status & Handoff

**Live:** https://www.nemoaquastore.in · **Deploy:** Vercel (auto-deploys `main`) · **Backend:** Firebase Realtime DB + Storage

> Read this first when resuming in a new chat. It captures how the project is built and what's done / pending.

## How the app is built (IMPORTANT)
- Single-file React app. Source of truth: **`app.jsx`** (~10.8k lines, in-browser React via `React.createElement`).
- The site loads a **precompiled `app.js`** (fast path); `app.jsx` is only a fallback.
- **After ANY change to `app.jsx`, rebuild `app.js`:**
  `npx esbuild app.jsx --loader:.jsx=jsx --jsx=transform --bundle=false --minify --outfile=app.js`
  then `node --check app.js`. Commit **both** files. (Keep `--minify` — the shipped bundle is minified.)
- Bump the service-worker cache in `sw.js` (`nemo-vNN`) on releases so clients refresh.
- Firebase rules live in `database.rules.json` (must be published in Firebase console separately).
- Theme = "PRISTINE AQUA" (pure white, Plus Jakarta Sans, cyan `#0ea5e9` accents, coral `#f43f5e` CTAs). Central token object `const C` at top of `app.jsx`.

## Workflow
Work on branch `claude/nemo-aqua-store-enhancement-74a3o1` → commit → push → open PR to `main` → user merges → Vercel deploys. (Write access via GitHub MCP is working.)

## Done ✅
- Full storefront + admin: catalog, cart, checkout (flexible: add-items/change-shipping/cancel), orders, wallet/loyalty, referrals.
- Returns/replacement flow + DOA flow (customer choice: refund/replace/coins).
- Admin sales dashboard + customer insights + behaviour analytics (funnel, top products, searches).
- Smart search (typo/synonym/plural tolerant — "beta"→Betta). Aqua Tools page (fish compatibility checker + tank/heater/filter/stocking calculators).
- Interactive UI: 3D card tilt+spotlight, magnetic CTAs, fly-to-cart, reveal-on-scroll, staggered grids, spring-count prices.
- Mini-cart drawer + Zepto-style floating cart bar (free-delivery nudge).
- Abandoned-cart recovery: cart persists across sessions (localStorage); a signed-in shopper's open cart syncs to Firebase (`abandonedCarts/<uid>`) and shows in Admin → Orders with a one-tap WhatsApp nudge + Dismiss. **Requires publishing the updated `database.rules.json`** (new `abandonedCarts` node) or writes are denied and the list stays empty.
- Flipkart-style rating: tap-to-rate in order list + per-aspect ratings (condition/packing/delivery/value).
- Cinematic splash (wordmark logo, bubbles). Ambient fish-canvas wallpaper (betta+clownfish desktop-only, snails+bubbles everywhere).
- PWA store-ready: manifest (id, screenshots, shortcuts, categories), `/.well-known/assetlinks.json` (pkg `in.nemoaquastore.app`), `/privacy.html`.
- SEO: schema.org, sitemap, static `/p/` product pages + `/guides/` blog articles.
- Icons unified to the clownfish; new 1200×630 share banner.
- **GST live (GSTIN `33BWXPP8706N1ZI`, Tamil Nadu):** once a GSTIN is saved in Settings, the formal invoice (`openInvoice` → `generateInvoiceHTML`) becomes a proper **Tax Invoice** with HSN, place of supply, and the correct tax split — **CGST+SGST for deliveries inside TN, IGST for every other state**. Checkout now collects **State**, auto-detected from the delivery pincode via `pincodeToState()` (editable dropdown if the pincode is unrecognised) and stored on the order; the invoice falls back to pincode derivation for older orders. Puducherry pockets (Pondicherry town, Karaikal, Yanam, Mahe) are special-cased to UT 34 → IGST. Settings shows a live "✓ Valid GSTIN · Seller state: TAMIL NADU (33)" confirmation under the GSTIN field. Prices are treated as GST-inclusive; default rate/HSN in Settings, per-product override supported. **We deliberately do NOT store/show the GST certificate image** (it carries the proprietor's personal address; only the GSTIN is shown, which is all that's legally required online).

## Play Store launch — LIVE STATUS (updated 24 Jul 2026)
**Account type: PERSONAL** → requires 12 testers opted-in for 14 continuous days before production.
Package: `in.nemoaquastore.app`. TWA host: `www.nemoaquastore.in`. `.aab` built via PWABuilder (user has it + the permanent `signing.keystore` — NEVER commit it).

**DONE ✅**
- App created in Play Console; app-signing enabled.
- `.aab` uploaded to **Internal testing** (Active). App verified opening full-screen (no browser bar).
- **assetlinks.json** has BOTH fingerprints: upload key `2B:EA:…:54` + Google Play app-signing key `E9:85:…:D4`. Verified via Google's digital-asset-links API.
- **App content declarations all done:** Ads (No), Sign-in details (demo account — see below), Content rating (Everyone/PEGI3; Germany USK16 only), Target audience (18+), Data safety (submitted), Financial features (none), Privacy policy (`/privacy.html`).
- **Store listing** written (name, short desc, full desc), category Shopping, contact details. Feature graphic (1024×500) + share banner made by user. App icon = `assets/favicon-512.png`.
- **Reviewer demo login**: sign-in screen has a sandboxed demo mode (PR #15). Reviewer instructions given in Play "Sign-in details".
- `/delete-account.html` live (required Delete-account URL for Data safety).
- **In-app "Delete my account" + admin deletion panel — MERGED to `main` (PR #18).** Account screen → danger card (tick-to-confirm) wipes the customer's reachable cloud data (saved items, abandoned cart, own tank photos), logs an **Account deletion request** in Admin → Requests (badged), and signs the user out. Orders/payment records retained (tax law). Admin → Requests shows it in red with one-tap "Delete remaining data" (wallet/loyalty coins + referral mapping) + WhatsApp "Confirm to customer". Demo/review sessions just clear + sign out. **⚠ REQUIRES publishing the updated `database.rules.json`** (grants admin uid delete access to `favorites` + `userrefs` so the one-tap purge is complete) — Firebase console → Realtime Database → Rules.

**⚠ TARGET API 36 (deadline 31 Aug 2026)** — Play Console flagged the app targets API 35; must target **Android 16 (API 36)** to keep updating. Fix is in the **PWABuilder package, NOT this repo**: rebuild the `.aab` at **Target API = 36** in PWABuilder, **signing with the SAME existing `signing.keystore`** (never a new key, or Play rejects it as a different app), then upload to the **existing closed-testing track** (does NOT reset the 12-tester/14-day opt-in clock) → promote that same build to production after day 14. If the rebuild shows a new SHA-256, add it to `.well-known/assetlinks.json`.

**NEXT — the ONLY thing gating production ⏳** (in progress: 12 testers opted in, ~8 days as of late Jul 2026)
1. **Closed testing**: create release (Add-from-library, use the **API-36** `.aab`) → country India → add **12+ tester Gmails** → roll out for review.
2. **Get 12 testers OPTED IN** via the opt-in link (iPhone users can opt in but can't install — use Android testers). 14-day clock starts once 12 are in.
3. After 14 days → **Apply for production** → answer closed-test questions → create production release (the API-36 build) → submit → live.

**Open build tasks:**
- Optional "Report content" button → would raise rating Teen→Everyone (fixes Germany USK16).
- Birthday field (Personal info→Other info, NOT Calendar) for b'day offers — future.

## Returns & GST credit notes
- **Two return addresses** in Settings → About & Policies (Address 1 + Address 2, each with a short name). Admin **picks which address** when handling a return (Admin → order → Return panel); the choice is snapshotted onto the request and shown to the customer ("Courier it back to — <label>").
- **GST Credit Note** for sales returns: Return panel has a **🧾 GST Credit Note** button (shown once a GSTIN is set). It generates a proper Section-34 credit note for the **returned items only** (no shipping/discounts), reversing **CGST+SGST (TN) or IGST (other states)** against the original tax invoice — this is the document to report in GSTR-1 for the return. `generateCreditNoteHTML()` reuses the invoice engine via `generateInvoiceHTML(order,settings,{creditNote:true})`.
- Return request already captures: items, reason, damage photo, resolution (refund/coins), courier + consignment, status timeline, refund record. Now also the selected return address + GST credit note.

## Perf
- Initial-load splash hold trimmed **2000ms → 1400ms** (`SPLASH_MIN_MS` in `index.html`) — logo entrance still plays fully, but the store appears sooner. Only affects fast loads; slow loads still wait for the app to be ready (no blank flash).
- **Saving a product writes only `products/<id>`**, not the whole `products` node. Editing one item used to re-upload the entire catalog (and make every connected client re-download it). Also narrows the window in which an admin save could clobber a customer's concurrent stock decrement.
- **Every Firebase write is time-bounded** (`fbWrite`, 15s; Storage uploads 45s). An RTDB `set()` only settles on server ack, so on a stalled mobile connection it stayed pending forever — that was the "save keeps loading" spinner. The SDK still queues the write and delivers it when the link returns; the UI just stops waiting, and the toast says "Saved on this device — syncing…" when the cloud didn't confirm in time.
- **Cached repeat visits no longer re-render the catalog for nothing.** `cloudSync` compares the cloud copy against what's on screen (`sameCatalog` / `stableJSON`, key-order independent) and keeps the existing array when identical — that's what caused the visible "products update" a beat after the store opened.

## Product options / variations (Phase 1 — Jul 2026)
One product, several variations, each with **its own price and packing weight** — a net's sizes, a pump's capacities, a heater's wattages, a light's `2ft · White · 18W`, a feed's pack weights. The customer opens the product, sees every option with its price, and picks one.
- **Any category can have options now.** `productVariants()` used to return `null` for anything but Live Fish; it now returns whatever the product has saved, and Live Fish additionally keeps its standard pair/trio fallback. `hasVariants()`, `variantHeading()` and `variantFromPrice()` are the new helpers.
- **Admin → product → "🧩 Options / Sizes"** — one row per variation with label, price, packing weight (kg) and an in-stock/sold-out toggle, plus a customer-facing heading you name per product (**Size** / **Capacity** / **Wattage** / **Pack Size**). Leave it empty and the product stays an ordinary single-price item.
- **Two write-path bugs fixed**: the per-option `packagingWeight` was dropped both when *loading* a product into the form and when *saving* it, so per-option shipping weight had never actually persisted despite the shipping code reading it. Dry goods also ignored it entirely (only live fish honoured it) — a 1kg feed pack shipped as if it were 100g.
- **Grid cards**: a product with options shows **"from ₹X"** (cheapest in-stock option) and a **Select** button that opens the product page, instead of blind-adding an arbitrary size. Option-less products are untouched.
- **Reorder / cross-sell** re-add the exact option that was bought, not whichever is first.
- Already handled downstream, no change needed: separate cart lines per option (`key = id|variantId`), and the option name on order history, WhatsApp, email, packing slip, **GST tax invoice** and admin exports.
- **Per-option packing weight is admin-only** — customers never see it. The only weight shown anywhere is the aggregate live-fish parcel estimate at checkout. It is *not* cosmetic: it's what the courier bracket is priced from, so it stays.
- **New category `Medicine`** (💊, purple). Ships as a dry good, so per-option pack weights apply. Set **non-returnable** alongside Feed — both consumables; flip it to the Accessories model (per-product "eligible if damaged" tick) if you'd rather.
- **The options editor starts with one blank row**, and extra rows are added on demand. A blank row is dropped at save, so a product with no options stays a plain single-price item. The customer-facing heading field appears once an option is actually named.
- **Per-option stock (Phase 2 — done).** Each option keeps its own count in `products/<id>/variantStock/<optionId>` (keyed by option id, not array index — options get reordered). Set a **STOCK** number per row in the admin editor; the product's own Stock Count then becomes read-only and shows their sum.
  - An option is sold out when the admin flags it **or** its count hits 0. `productStockTotal()` is the sum across *available* options, so a product whose every option is gone reads Out of Stock everywhere (grid, filters, product page, admin list).
  - Cart quantity is capped by the **chosen option's** stock, not the product-wide pool.
  - Checkout decrements the option's counter and the product total together, each under its own atomic transaction. Cancel/restock reverses both. Transactions abort on products that have no per-option map, so those can't accidentally sprout one.
  - **Backward compatible**: products with no `variantStock` keep the single shared pool they've always used. Nothing changes until you type per-option numbers.
  - **⚠ REQUIRES publishing the updated `database.rules.json`** — new `products/$id/variantStock/$vid` rule, mirroring the existing `stockCount` policy (authenticated users may only *decrease* it; admin unrestricted via the cascading parent rule). Without it, a customer's checkout write to the per-option counter is denied and only the product total moves.
- **Fixed: a fully sold-out product used to still sell.** With every option flagged sold out, the page showed "In Stock", the Add button was live, and a sold-out option went into the cart. Availability now derives from the options themselves.
- Not yet done: static SEO pages under `/p/` still print a single price and should say "from ₹X" for option products.

## Stability & performance audit (Jul 2026)
Measured with an instrumented browser session, not eyeballed.

**Long lists were the lag.** The admin rendered every order it had in one pass with no cap, and the cost scaled linearly: 10 orders 64ms → 500 orders **501ms** of frozen UI and 5754 DOM nodes, every time the panel opened. Orders accumulate forever, so it worsens daily. The shop grid had the same shape (300 products = 215ms, 5953 nodes).
- Admin orders + products render 25 at a time with a "Show N more" that reports how many are hidden; the window resets on filter/search change and search still reaches past the cap.
- The shop grid renders 24 and grows automatically as you reach the end (IntersectionObserver, 400px margin) with a button fallback.
- **After: admin flat at 57-76ms / 530 nodes for 10→500 orders; shop 0ms / 665 nodes for 20→300 products.**

**Stuck spinners.** 24 busy-flag handlers set `saving/busy = true` then awaited without a guard — any failure left the control disabled forever. All now use try/catch/**finally** and surface the error. Worst was **payment-proof submit**: a customer whose submit failed had no way to retry. Verified by injecting failures — the control re-enables, reports, and stays retryable.

**Unbounded cloud calls.** A Firebase promise that never settles can't be rescued by `finally`, since `finally` waits on the await.
- Every read is now time-bounded. Referral validation (the checkout Apply button) and the admin full-backup export could previously hang forever.
- User-facing writes go through `fbWrite`'s 15s cap: order placement, settings, reviews, media.

**Checked and found clean:** 60fps idle and after navigation; zero long tasks on the storefront; heap flat at 5-8MB with no growth over an idle period; DOM node count constant across navigation; no runaway timers or rAF loops; all 6 live `.on("value")` listeners have matching `.off()`; the store is fully usable with the backend unreachable. The 4 outstanding `nemo-fb-ready` listeners are 4 distinct effects each with its own cleanup, not a leak.

## Ambient jellyfish (Jul 2026)
A single kawaii jellyfish drifts bottom→top in a slow zig-zag; when it clears the top, the next one starts from the bottom after a short pause. Lives in `index.html` next to the bubble-wallpaper canvas (`#nemo-jelly`, `z-index:-1`, `pointer-events:none`).
- **Drawn as inline SVG, not a flat image**, so the bell can actually contract and the tentacles trail behind it. A PNG could only be slid around as one rigid piece.
- **Pulse-and-sink, the way a jellyfish actually travels**: a hard shove upward on the bell contraction, then it drifts back down a touch while the bell refills. Net travel is upward, but it arrives as visible little hops rather than a steady slide. Arms and tentacles run on a lagged phase because they're dragged, not driven; each tentacle also has a staggered CSS ripple so they don't move as one comb.
- **Travels straight up**, no zig-zag — each drifter takes a fresh lane so they cover the whole screen width over time. Calm net climb is ~12-15 px/sec, just above the wallpaper bubbles (~2-11 px/sec).
- **Sized well under half the betta/clownfish** (those render 72-78px wide; the jellyfish bell is ~25px).
- **Pointer or touch nearby wakes it**: within 78px it pulses harder and climbs ~3x faster, then eases back to its calm drift. Wakes fast, calms slowly. The layer stays `pointer-events:none`, so proximity is measured against the pointer rather than hover — a tap stays "hot" for 1.6s since a touch is instantaneous.
- Honours `prefers-reduced-motion` (hidden entirely) and pauses on tab-hide. Transform-only animation, one element on screen at a time.
- To swap in a different jellyfish, edit `svg(uid)` in that block — but keep the `.jelly-bell` / `.jelly-arms` / `.jelly-tents` groups, since the animation drives those by class.

## Product page fixes (Jul 2026)
- **Coming Soon products no longer show a stock badge.** The title/price area read "● In Stock" off the product's leftover `stockCount` while the bottom bar correctly said Coming Soon. It now shows a "🔜 Coming Soon" badge instead; normal products are unchanged.
- **Descriptions keep the line breaks you type.** The product page renders `p.desc` with `white-space: pre-wrap`, so paragraphs, blank lines and bullet lists appear as entered instead of collapsing into one run-on block.

## Admin panel — Back button & product form (Jul 2026)
- **Hardware/browser Back inside Admin no longer drops out of the panel.** It steps back one level at a time: an open product form or order detail closes first (`backRef` handler registered by `AdminHub`); at the top level an in-app sheet asks **"Leave the Admin panel?"** (`AdminExitConfirm`). `window.confirm` is unreliable inside a `popstate` handler on mobile, hence the in-app dialog. The header's "🛍 Store" button and the `beforeunload` refresh/close guard are unchanged.
- **Admin headers are safe-area aware** (`.admin-head` → `env(safe-area-inset-top) + 24px`). The page ships `viewport-fit=cover`, so in the installed app the layout runs *under* the status bar; the old flat `52px` left the header's small controls in the strip the system reserves for the notification pull-down, where taps get eaten. Header buttons are now ≥44px tall, and the Products tab has a full-width **➕ Add New Product** button in the body as an always-reachable twin of the header's "+ Add".
- **The product-save spinner can no longer hang.** `handleSave` wraps the work in try/catch/**finally**, so `saving` always clears and a failure shows "Couldn't save — <reason>" instead of turning forever. The button also names the current step ("Processing photo 1 of 2 — 4.1MB…", "Uploading photo 1 of 2…", "Making the catalog thumbnail…", "Saving product…") so a big photo reads as progress. A photo that fails to decode now says so instead of silently vanishing.

## Also pending (non-Play)
- **SEO off-site**: Search Console resubmit `sitemap.xml` + request indexing; **create Google Business Profile** (biggest lever); Justdial/IndiaMART.
- **Firebase rules**: user already PUBLISHED the `abandonedCarts` rule. ✅
- Audit report at `AUDIT_REPORT.md` (76/100). Phase-1 quick wins done (ErrorBoundary, minified `app.js`, GA4, lighter OG). Not yet: best-sellers row, species spec fields+filters, accessibility pass, FCM push.

## Deploy/merge workflow used this session
Work on branch `claude/repo-connection-j006nq` → commit → open PR to `main` → squash-merge → Vercel auto-deploys `main`. (Claude has GitHub MCP write access + merges directly when user says "go".) SW cache currently `nemo-v38`; bump on each release.

## Welcome popup, Coming Soon lockdown & courier-collection notice (Aug 2026)
- **"Why we're not like the others" popup** — `WhyNemoPopup`, shown once on the **first visit of each day** (date stamp in `localStorage` under `nemo-whyus-day`; opening writes the stamp, so a reload the same day won't repeat it). Held back 1.1s after the splash clears and never rendered over the admin panel. Content is an Others-vs-Us comparison driven by the `WHY_US_ROWS` array — edit that one array to change the copy: points on every rupee, no extra shipping charge (overcharge refunded to the wallet), referral rewards on a friend's 1st purchase, frequent discounts, product sourcing on request, care-guide posters + Aqua Tools, 100% trustable, order-tracking help. Footer carries a small "Subject to our terms & conditions" link into the Terms page.
- **Coming Soon products can no longer be bought.** The guard now lives in `addToCart` itself, so every path is covered (option picker, cross-sell, reorder, "buy it again", a cart restored from an earlier session) — a positive-qty add for a `comingSoon` product is refused with a toast; negative qty still passes so an existing line can always be removed. The actual leak was the **product page's `VariantPicker`**: an option product flagged Coming Soon still rendered a per-option `+ Add`/stepper. It now gets `addToCart={null}`, which the picker already handles by hiding those controls, so options stay visible for reference only. Lines already sitting in a saved cart for a product that has since been flagged are **pruned when the catalog loads**, with a toast naming the item.
- **Courier-collection notice at checkout** — an amber card directly above "Place Order & Pay": keep tracking the parcel and collect it from the courier partner as soon as it reaches your area; door delivery depends on the courier partner and is not in our hands; extra emphasis appears automatically when the cart holds live items. The same substance is in the **Terms & Conditions** as the `COURIER_COLLECT_TERM` constant — it is spliced into `DEFAULT_SETTINGS.termsPolicy`, and the Terms page additionally renders it as a standing clause **only when the saved terms text doesn't already contain it** (a store that customised its terms before this existed still shows the clause; the default text shows it once, not twice).

## Pre-launch hardening (Aug 2026) — ⚠ REQUIRES PUBLISHING `database.rules.json`
Audit of security / money / GST / export ahead of the Play production release. **Every visitor is signed in anonymously (`signInAnonymously`), so every `"auth != null"` rule means "anyone on the internet"** — that framing drives most of what follows.

- **Public vs private settings.** `settings` is world-readable, and `saveSettings` used to write the whole object there — including `adminPassHash`, `coAdminUid` and the proprietor's `returnAddress*`. Those six keys (`PRIVATE_SETTING_KEYS`) now go to a new **`settingsPrivate`** node restricted to the admin uid; `loadSettings` and `cloudSync` merge the two halves, and saving also *removes* the old copies from the public node. `upiId` and the EmailJS ids deliberately stay public — the customer's own browser renders the UPI QR and sends the order email, so a static site cannot hide them; **lock EmailJS down with an allowed-domains restriction in the EmailJS dashboard instead.** The customer-facing return-address fallback ("message us on WhatsApp for the address") now applies until the admin snapshots an address onto the return request.
- **Orders are no longer customer-rewritable.** `orders/$uid` had a blanket `.write`, so a signed-in customer could restate `amountDue`, flip `paymentStatus` to Verified, or **delete the record** you must keep for six years (§36 CGST). The grant moved down to `$oid` with `newData.exists()` (no customer deletes), and `.validate` freezes `id`/`orderNo`/`placedAt`/`userUid` plus `total`/`fee`/`amountDue`/`couponDiscount`/`referralDiscount`/`loyaltyDiscount` against non-admin change. `status` is limited to Awaiting Payment / Payment Review / Cancelled (or unchanged) and `paymentStatus` can never be set to Verified by a customer. Safe because the customer app holds a **live listener** on `orders/<uid>`, so its copy matches the server. Trade-off: if that copy is stale (offline, or the admin edits shipping in the same instant) a customer action is denied and needs a retry after sync.
- **`orderSeq/$day` is increment-only** (`newData === data + 1`, first write must be 1). Anyone could previously set it to any number, producing duplicate or rolled-back invoice numbers — which GST does not allow.
- **Reviews are owner-locked** (`uid` must match `auth.uid` to create, and match the existing row to edit/delete). Previously any visitor could forge or wipe any review.
- **`analytics` and `promoUsage` counters are increment-only**, so daily promo quotas can't be reset and the visitor count can't be rewritten.
- **Testimonials are moderated** like tank photos: `approved:false` on submit, hidden from the home page until approved, author sees a "awaiting approval" note, admin list sorts pending first with a ✓ Approve button. The rule also stops a non-admin writing `approved:true`.
- **Export fixes.** `csvCell()` neutralises **CSV formula injection** — a customer typing `=…`/`+`/`-`/`@` into their name or address used to execute as a formula when the owner opened the file. Orders sheet gains **Counts for GST**, **Supply Type** and **HSN Breakup** columns, and blanks the tax columns for cancelled/unpaid orders (`countsForGST`) so a stray row can't inflate what you file. New **🧾 GST HSN summary (GSTR-1)** export (`exportGstHsnCSV`) gives one row per HSN + rate, split intra/inter-state, with a total row and a note stating how many orders were skipped. "Wallet Coins Earned" now only counts Delivered orders (coins are credited on delivery).
- Helpers verified against fake storage / stub data: `countsForGST` (5 cases), `csvCell` (6 cases), and `orderGST`'s HSN rows reconciling to the order totals both intra- and inter-state.

**GST engine rebuilt (Aug 2026, on the CA's written advice) — `orderTaxLines()` is now the single source of truth** for the tax invoice, the credit note, the orders export and the GSTR-1 HSN export, so those four can no longer disagree.
- **Discounts come off BEFORE tax (§15(3)(a)).** Coupon + referral + wallet are apportioned across every line in proportion to value (rounding remainder handed to the largest line), then tax is back-calculated out of the discounted, GST-inclusive net. Matches the CA's worked example exactly: ₹1000 incl. GST − ₹100 coupon @5% → taxable ₹857.14, GST ₹42.86, total ₹900. Previously it taxed the pre-discount ₹1000 and over-declared.
- **GST is claimed PER PRODUCT, never store-wide.** New product fields `gstApplicable` (default **false**), `hsn`, `gstRate`, edited under "🧾 Claim GST on this product" in the product editor and snapshotted onto the cart line at add-to-cart (they were never plumbed through before, so the per-item override the invoice read had always been dead code). The store-wide **HSN setting is gone**; Settings now shows a per-product explainer plus a warning listing any product that claims GST but is missing an HSN or rate.
- **Goods sold without claiming GST carry no tax at all** — not "0%". They are reported as a separate "no GST claimed" value, and an order made up entirely of them is labelled **BILL OF SUPPLY** rather than TAX INVOICE.
- **Shipping follows the principal supply** (the largest goods line), so freight on a live-fish order carries no GST, and on an equipment order it takes that item's rate. It used to be hard-wired to the store default.
- Exports carry `No-GST Value`, and the HSN summary has `GST Claimed` Yes/No so exempt supplies are never reported at 0%.
- Verified numerically (6 scenarios): the CA's example, a no-GST fish order, a mixed basket where the discount splits across a taxed and an untaxed line, an inter-state two-rate basket, the credit-note shape, and an over-large discount flooring at zero. In every case `taxable + no-GST value + tax === invoice value`.

⚠ **Two consequences to know:** every existing product defaults to `gstApplicable:false`, so nothing bills GST until the owner ticks it product by product; and reprinting an invoice for an order placed BEFORE this change will now show no GST (its items carry no tax fields), where it previously printed the store default rate.

**Also check:** the default `termsPolicy` still contains "we are currently … not registered under GST, so no GST is charged at present" while the GSTIN is live — if the saved settings still carry that sentence it contradicts the tax invoices.

## Gotchas
- Sandbox network blocks fetching the live site + unpkg (can't render the app here) — verify via `esbuild`/`node --check` + code review; user eyeballs the deploy.
- The keystore in the PWABuilder package is the permanent app signing key — user keeps it secret; never commit it.
