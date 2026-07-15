# Nemo Aqua Store — Project Status & Handoff

**Live:** https://www.nemoaquastore.in · **Deploy:** Vercel (auto-deploys `main`) · **Backend:** Firebase Realtime DB + Storage

> Read this first when resuming in a new chat. It captures how the project is built and what's done / pending.

## How the app is built (IMPORTANT)
- Single-file React app. Source of truth: **`app.jsx`** (~10.8k lines, in-browser React via `React.createElement`).
- The site loads a **precompiled `app.js`** (fast path); `app.jsx` is only a fallback.
- **After ANY change to `app.jsx`, rebuild `app.js`:**
  `npx esbuild app.jsx --loader:.jsx=jsx --jsx=transform --bundle=false --outfile=app.js`
  then `node --check app.js`. Commit **both** files.
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
- Flipkart-style rating: tap-to-rate in order list + per-aspect ratings (condition/packing/delivery/value).
- Cinematic splash (wordmark logo, bubbles). Ambient fish-canvas wallpaper (betta+clownfish desktop-only, snails+bubbles everywhere).
- PWA store-ready: manifest (id, screenshots, shortcuts, categories), `/.well-known/assetlinks.json` (pkg `in.nemoaquastore.app`), `/privacy.html`.
- SEO: schema.org, sitemap, static `/p/` product pages + `/guides/` blog articles.
- Icons unified to the clownfish; new 1200×630 share banner.

## Pending / next
1. **Play Store**: identity verification in progress (Organization → DUNS, or Personal → 12-tester test). After verify: create app → upload the `.aab` from the PWABuilder package → store listing (feature graphic 1024×500, portrait screenshots, description, privacy URL `/privacy.html`, data-safety form) → submit.
2. **SEO off-site** (to rank #1 for "nemo aqua store"): Search Console → resubmit `sitemap.xml` + request indexing; **create Google Business Profile** (biggest lever); list on Justdial/IndiaMART; consistent name/address/phone everywhere.
3. Feature ideas not yet built: abandoned-cart WhatsApp nudge; aquarium-specific filters (freshwater/beginner/tank-size — needs admin product fields first); AI aquarium assistant; quick-view modal; image srcset/blur-up.

## Gotchas
- Sandbox network blocks fetching the live site + unpkg (can't render the app here) — verify via `esbuild`/`node --check` + code review; user eyeballs the deploy.
- The keystore in the PWABuilder package is the permanent app signing key — user keeps it secret; never commit it.
