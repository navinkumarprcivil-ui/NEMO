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

## Play Store launch — LIVE STATUS (updated 19 Jul 2026)
**Account type: PERSONAL** → requires 12 testers opted-in for 14 continuous days before production.
Package: `in.nemoaquastore.app`. TWA host: `www.nemoaquastore.in`. `.aab` built via PWABuilder (user has it + the permanent `signing.keystore` — NEVER commit it).

**▶ WHERE WE ARE RIGHT NOW:** Closed testing is **Active** (reviewed & published). **12 testers opted in on ~19 Jul 2026 → the 14-day clock is RUNNING.** Eligible to **Apply for production ~2 Aug 2026** (14 continuous days with ≥12 opted-in testers). Nothing gates this but time — see "NEXT" below.
**⚠ Protect the clock:** don't remove testers, don't unpublish the track, don't upload a new `.aab` unless necessary (website changes via GitHub→Vercel are safe). Keep ≥12 opted in (18 total added, so there's a cushion).

**DONE ✅**
- App created in Play Console; app-signing enabled.
- `.aab` uploaded to **Internal testing** (Active). App verified opening full-screen (no browser bar).
- **assetlinks.json** has BOTH fingerprints: upload key `2B:EA:…:54` + Google Play app-signing key `E9:85:…:D4`. Verified via Google's digital-asset-links API.
- **App content declarations all done:** Ads (No), Sign-in details (demo account — see below), Content rating (Everyone/PEGI3; Germany USK16 only), Target audience (18+), Data safety (submitted), Financial features (none), Privacy policy (`/privacy.html`).
- **Store listing** written (name, short desc, full desc), category Shopping, contact details. Feature graphic (1024×500) + share banner made by user. App icon = `assets/favicon-512.png`.
- **Reviewer demo login**: sign-in screen has a sandboxed demo mode (PR #15). Reviewer instructions given in Play "Sign-in details".
- `/delete-account.html` live (required Delete-account URL for Data safety).
- **Advertising ID declaration** = No (TWA, no native ad SDK; GA4 is web-only). Cleared the "incomplete advertising ID" blocker.
- **Android developer verification**: `in.nemoaquastore.app` shows **Registered** (auto, via Play Console) — no action needed (Sept 2026 requirement already met).
- **Closed testing release** created (Add-from-library, same `.aab`), country India, tester email list (18 Gmails) attached, **rolled out & reviewed → Active**.
- **In-app "Delete my account" SHIPPED ✅** (PR #18, merged to `main`, live on site). Account screen (My Orders) → "Delete my account" (danger card, tick-to-confirm) → wipes customer's reachable cloud data (saved items, abandoned cart, own tank photos), records an **Account deletion request** in Admin → Requests (badged), signs out. Orders/payment records **retained** (tax law). Admin → Requests shows it in red with **one-tap "Delete remaining data"** (clears wallet/loyalty + referral mapping) + WhatsApp "Confirm to customer". Demo/review sessions clear + sign out only (never touch DB). **`database.rules.json` updated (admin delete on `favorites`+`userrefs`) and PUBLISHED ✅.**
- **GitHub repo made PRIVATE** — Vercel still auto-deploys `main` (redeploy verified working). Live app unaffected.

**NEXT — the ONLY thing gating production ⏳ (time, not tasks)**
1. ✅ Closed testing Active; ✅ 12 testers opted in (~19 Jul) → **14-day clock running**.
2. **Wait 14 continuous days** with ≥12 opted-in testers. Encourage real testing activity (browse, cart, place a test order), not just installs.
3. **~2 Aug 2026:** Play unlocks **Apply for production** → answer closed-test questions (recruitment, feedback, how addressed) → create production release → submit → live.

**Open build tasks (offered, not yet built):**
- Optional "Report content" button → would raise rating Teen→Everyone (fixes Germany USK16).
- Birthday field (Personal info→Other info, NOT Calendar) for b'day offers — future.

## Also pending (non-Play)
- **Google Business Profile CREATED ✅** (name "Nemo Aqua Store", category Aquarium shop, verified/managed, hours set). **TODO:** complete profile to 100% (photos, products, description), connect WhatsApp (+91 93609 21030), and **collect Google reviews** (biggest local-SEO lever — send the "Ask for reviews" link on WhatsApp after each delivery). Decide storefront-address (pin) vs delivery service-area. Ranking for "aquarium store near me" builds over weeks as reviews/photos grow.
- **SEO off-site**: Search Console resubmit `sitemap.xml` + request indexing; Justdial/IndiaMART. Optional Google Ads (small daily cap; local intent > broad).
- **Firebase rules**: `abandonedCarts` ✅ and delete-account (`favorites`+`userrefs`) ✅ both PUBLISHED.
- Audit report at `AUDIT_REPORT.md` (76/100). Phase-1 quick wins done (ErrorBoundary, minified `app.js`, GA4, lighter OG). Not yet: best-sellers row, species spec fields+filters, accessibility pass, FCM push.

## Deploy/merge workflow
Work on branch `claude/play-store-launch-0rabhj` → commit → PR to `main` → merge → Vercel auto-deploys `main`. **Repo is now PRIVATE (Vercel access retained).** After ANY `app.jsx` change: rebuild `app.js` (esbuild, see top), bump `sw.js` cache. SW cache currently **`nemo-v35`**; bump on each release. NOTE: PR #18 already merged — per git rules, start follow-up work by restarting this branch from `origin/main` (don't stack on merged history).

## Gotchas
- Sandbox network blocks fetching the live site + unpkg (can't render the app here) — verify via `esbuild`/`node --check` + code review; user eyeballs the deploy.
- The keystore in the PWABuilder package is the permanent app signing key — user keeps it secret; never commit it.
