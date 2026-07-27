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

## Also pending (non-Play)
- **SEO off-site**: Search Console resubmit `sitemap.xml` + request indexing; **create Google Business Profile** (biggest lever); Justdial/IndiaMART.
- **Firebase rules**: user already PUBLISHED the `abandonedCarts` rule. ✅
- Audit report at `AUDIT_REPORT.md` (76/100). Phase-1 quick wins done (ErrorBoundary, minified `app.js`, GA4, lighter OG). Not yet: best-sellers row, species spec fields+filters, accessibility pass, FCM push.

## Deploy/merge workflow used this session
Work on branch `claude/repo-connection-j006nq` → commit → open PR to `main` → squash-merge → Vercel auto-deploys `main`. (Claude has GitHub MCP write access + merges directly when user says "go".) SW cache currently `nemo-v38`; bump on each release.

## Gotchas
- Sandbox network blocks fetching the live site + unpkg (can't render the app here) — verify via `esbuild`/`node --check` + code review; user eyeballs the deploy.
- The keystore in the PWABuilder package is the permanent app signing key — user keeps it secret; never commit it.
