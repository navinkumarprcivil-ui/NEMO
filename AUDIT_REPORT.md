# 🔍 Nemo Aqua Store — Complete Technical Audit

**Audited:** 2026-07-15 · **Commit:** `9a1e100` · **Auditor:** Senior Architect / SEO / UX / Performance / Security / E-commerce review
**Method:** static code analysis of `app.jsx` (10,866 lines), `index.html`, `sw.js`, `manifest.webmanifest`, `vercel.json`, `database.rules.json`, `/p/` pages, `/guides/`, sitemap/robots. (Live-site fetch is blocked in this sandbox, so runtime numbers are estimates.)

**Legend:** ✅ Present · ⚠️ Needs improvement · ❌ Missing · Priority: 🔴 Critical / 🟠 High / 🟡 Medium / ⚪ Low · Effort: E-asy / M-oderate / C-omplex

---

## 📊 Scorecard

| Category | Score | Category | Score |
|---|---|---|---|
| **Overall** | **76 / 100** | Accessibility | 55 |
| UI | 88 | Mobile Experience | 90 |
| UX | 84 | E-commerce | 85 |
| SEO | 78 | Code Quality | 55 |
| Security | 80 | Performance | 70 |

**Lighthouse estimate (mobile):** Performance ~60–72 · SEO ~92 · Best Practices ~95 · Accessibility ~72–78
**Core Web Vitals assessment:** LCP at risk (~2.5–4s first visit: CDN React + ~963 KB unminified `app.js`; repeat visits fast thanks to SW). CLS likely good (splash covers mount). INP likely good (React 18, light interactions). **Verdict: likely *needs improvement* on first-visit LCP, passing on repeat visits.**

---

## 1. Project Architecture — 55/100

| Item | Status | Priority | Effort | Notes |
|---|---|---|---|---|
| Clean folder structure | ⚠️ | 🟡 | C | Flat root works for a static deploy, but all app logic lives in one file. |
| Modular components | ❌ | 🟡 | C | Single `app.jsx` (10.8k lines). Deliberate (no build step), but the file has outgrown the approach. |
| Reusable UI components | ⚠️ | 🟡 | M | Repeated inline element patterns; some shared helpers exist (toast, cards). |
| Separation of business logic | ⚠️ | 🟡 | M | Pricing/order logic interleaved with rendering in places. |
| Proper state management | ⚠️ | 🟡 | M | React state + localStorage + Firebase listeners; works, but no single store; 48 `useEffect`s risk sync bugs. |
| Type safety (TypeScript) | ❌ | 🟡 | C | Plain JS. TS would catch bugs in a file this size but requires a real build pipeline. |
| Environment configuration | ⚠️ | 🟡 | E | Firebase config hardcoded in client (normal for Firebase; rules are the security boundary). No env separation for staging. |
| Error boundaries | ❌ | 🟠 | E | No `componentDidCatch`/ErrorBoundary — a render error white-screens the whole store. **Quick win.** |
| Logging | ⚠️ | 🟡 | E | 5 console statements total; no error reporting (e.g., Sentry-style capture to Firebase). |
| API abstraction | ⚠️ | 🟡 | M | Direct Firebase calls scattered; partial helpers (`dbSet`, `mediaGet`). |
| Service layer | ❌ | ⚪ | C | Not applicable without backend; loyalty/points trust the client (see Security). |
| Custom hooks | ❌ | 🟡 | M | Zero custom hooks; repeated effect logic could be extracted. |
| Constants management | ✅ | — | — | Central theme token object `C`; escape helper `E()` used ~970×. |
| Utility functions | ✅ | — | — | Formatting, escaping, IDB wrapper present. |
| Code documentation | ⚠️ | 🟡 | E | Good section comments in html/sw; sparse inside `app.jsx`. `PROJECT_STATUS.md`/`README` are excellent. |

## 2. UI / UX — 88/100

| Item | Status | Priority | Effort |
|---|---|---|---|
| Modern design (PRISTINE AQUA theme, 3D tilt, magnetic CTAs, fly-to-cart) | ✅ | — | — |
| Consistent typography (Plus Jakarta Sans, token-driven) | ✅ | — | — |
| Proper spacing / visual hierarchy | ✅ | — | — |
| Responsive / mobile / tablet / desktop | ✅ | — | — |
| Smooth animations + `prefers-reduced-motion` respected | ✅ | — | — |
| Hover effects | ✅ | — | — |
| Loading indicators | ✅ | — | — |
| Skeleton loaders | ⚠️ 🟡 M | Present (6 refs) but not on all data-loading views. |
| Empty states | ⚠️ 🟡 E | Some views (cart) have them; audit each list view. |
| Success / error messages (toast system, 80+ uses) | ✅ | — | — |
| Accessible forms | ⚠️ 🟠 M | Labels/aria partial — see §14. |
| Consistent buttons / cards | ✅ | — | — |
| Dark mode | ❌ ⚪ C | Optional; brand is deliberately white. |

## 3. Homepage — 72/100

| Item | Status | Priority | Effort |
|---|---|---|---|
| Hero banner | ✅ | — | — |
| Featured categories | ✅ | — | — |
| Best sellers | ⚠️ 🟠 E | Barely surfaced (1 ref) — derive from order analytics you already collect. |
| New arrivals | ⚠️ 🟡 E | Minimal (2 refs). |
| Trending products | ❌ 🟡 E | Behaviour analytics already track views — surface them. |
| Featured brands | ❌ ⚪ E | Not a brand-led store; low value. |
| Customer reviews on home | ✅ (testimonials, 56 refs) | — | — |
| Benefits / Why choose us | ✅ (Live Arrival Guarantee messaging) | — | — |
| Newsletter signup | ❌ 🟡 M | No email capture; WhatsApp is the channel today. |
| Recently viewed | ✅ | — | — |
| Featured blog posts | ⚠️ 🟡 E | Guides exist; link them from home for SEO + engagement. |
| WhatsApp CTA | ✅ | — | — |
| Search bar | ✅ | — | — |
| Promotional banners | ✅ (admin-managed) | — | — |

## 4. Product Listing — 74/100

| Item | Status | Priority | Effort |
|---|---|---|---|
| Grid/list toggle | ❌ ⚪ E | Grid only — fine for this catalog size. |
| Sorting | ✅ | — | — |
| Filters | ⚠️ 🟠 M | Category/price exist; aquarium-specific facets missing (§7). |
| Pagination / infinite | ✅ (reveal-on-scroll batches) | — | — |
| Quick view | ❌ 🟡 M | On the ideas list; good mobile win. |
| Wishlist | ✅ (favorites, secured in DB rules) | — | — |
| Compare products | ❌ ⚪ M | Not present as a user feature. |
| Stock labels | ✅ | — | — |
| Discount labels | ✅ | — | — |
| Ratings on cards | ✅ | — | — |

## 5. Product Page — 70/100

| Item | Status | Priority | Effort |
|---|---|---|---|
| Multiple images / gallery | ✅ | — | — |
| Image zoom | ✅ | — | — |
| Product videos | ✅ | — | — |
| Description / features | ✅ | — | — |
| **Structured species specs** (tank size, temp, pH, difficulty, adult size, lifespan, origin, feeding, compatibility) | ❌ | 🟠 | M | The single biggest product-page gap. Needs admin product fields first (already noted in PROJECT_STATUS). Unlocks filters (§7) + spec tables + SEO rich content. |
| Care guide | ✅ (26 refs + guides articles) | — | — |
| FAQ per product | ❌ 🟡 M | Would also enable FAQ schema. |
| Customer reviews (+ per-aspect Flipkart-style) | ✅ | — | — |
| Related products | ✅ | — | — |
| Frequently bought together | ⚠️ 🟡 M | Traces exist (3 refs); make it a real block from order co-occurrence. |
| Recommended accessories | ⚠️ 🟡 E | Fold into related/FBT. |
| Delivery estimate | ✅ (shipping zones) | — | — |
| Return policy | ✅ (returns/DOA flows, 100+ refs) | — | — |
| Stock status | ✅ | — | — |

## 6. Search — 90/100

| Item | Status |
|---|---|
| Instant search, autocomplete, suggestions | ✅ |
| Typo tolerance + synonyms ("beta"→Betta) + plural handling | ✅ |
| Partial matching, category search | ✅ |
| Recent searches | ⚠️ 🟡 E — popular searches tracked in analytics; per-user recents unclear. |
| Search analytics (admin behaviour dashboard) | ✅ |

## 7. Filters — 45/100

| Item | Status | Priority | Effort |
|---|---|---|---|
| Category / price / availability / discount | ✅⚠️ | — | — |
| Rating filter | ❌ ⚪ E | |
| **Aquarium facets:** freshwater/marine, plants, shrimp-safe, beginner/expert, tank size, temperature, pH, imported/Indian | ❌ | 🟠 | M | Blocked on structured product fields (§5). This is what leading aquarium stores differentiate on. |

## 8. Shopping Experience — 85/100

| Item | Status | Priority | Effort |
|---|---|---|---|
| Add to cart / save cart / mini-cart drawer / floating cart bar | ✅ | — | — |
| Guest checkout | ❌ 🟡 M | Google sign-in required. Lowers friction barrier; but auth powers orders security model — a WhatsApp-order fallback could bridge it. |
| Wishlist | ✅ | — | — |
| Coupons (rich engine, 100+ refs) | ✅ | — | — |
| Gift cards | ❌ ⚪ C | |
| Shipping calculator (zones) + free-delivery nudge | ✅ | — | — |
| Tax calculation | ⚠️ ⚪ E | Prices GST-inclusive (typical for segment); no tax breakout on bills. |
| Order summary / bill generation (print-ready) | ✅ | — | — |
| Address management | ✅ | — | — |
| Payment options (UPI / Razorpay link / screenshot verify / COD refs) | ✅ | — | — |
| Order tracking (status + WhatsApp updates) | ✅ | — | — |
| Abandoned-cart recovery | ❌ 🟠 M | On ideas list. WhatsApp nudge = highest-ROI missing commerce feature. |

## 9. User Account — 82/100

| Item | Status |
|---|---|
| Registration/login (Google OAuth) | ✅ |
| Password reset | ✅ n/a (OAuth — no passwords to reset) |
| Profile, saved addresses, wishlist, order history | ✅ |
| Notification preferences ("notify me" at checkout) | ⚠️ 🟡 E — per-order only, no account-level prefs. |
| Account security (OTP for sensitive admin changes) | ✅ |

## 10. Aquarium-Specific Features — 60/100

| Item | Status | Priority | Effort |
|---|---|---|---|
| Fish compatibility checker | ✅ | — | — |
| Water volume / heater / filter / stocking calculators | ✅ | — | — |
| Lighting calculator | ⚠️ 🟡 E | Guide article exists; calculator unclear. |
| CO₂ calculator | ❌ ⚪ E | |
| Water-change calculator | ❌ ⚪ E | |
| Fish/plant recommendation engine | ❌ 🟡 M | Extend compatibility data you already have. |
| Aquarium setup planner / beginner wizard | ❌ 🟡 C | Strong differentiator + lead magnet. |
| Disease identification | ❌ ⚪ C | |
| AI aquarium assistant | ❌ 🟡 C | On ideas list; needs an API-key proxy (small backend). |

## 11. SEO — 78/100

| Item | Status | Priority | Effort |
|---|---|---|---|
| Unique titles/descriptions on static pages (`/p/*`, `/guides/*`) | ✅ | — | — |
| Canonical URLs (home + static pages) | ✅ | — | — |
| Open Graph + Twitter cards (incl. per-product OG images) | ✅ | — | — |
| XML sitemap (21 URLs) + robots.txt + Search Console verification file | ✅ | — | — |
| Structured URLs (`/p/slug`, `/guides/slug`) | ✅ | — | — |
| Schema: Store, Organization, WebSite, Product, AggregateRating, BreadcrumbList | ✅ | — | — |
| FAQ schema | ❌ 🟡 E | Add FAQPage to guide articles. |
| Review schema (individual reviews) | ⚠️ ⚪ E | AggregateRating present. |
| **Static product-page coverage** | ⚠️ | 🟠 | M | Only 9 products have `/p/` pages; `seo/generate.mjs` exists — regenerate as catalog grows (or automate). |
| SPA content not crawlable | ⚠️ 🟠 — | Inherent to architecture; static mirror + rich `<noscript>` (present ✅) is the right mitigation. |
| Heading hierarchy / image alt / internal linking | ⚠️ 🟡 E | Alts present (40); audit H1 uniqueness per static page; add guide↔product cross-links. |
| No duplicate content | ✅ | — | — |

## 12. Blog — 65/100

7 solid guide articles + index ✅. Missing: categories/tags ❌⚪, table of contents ❌⚪, FAQ blocks + schema ❌🟡E, related-articles links ⚠️🟡E, social sharing buttons ❌⚪E, author pages ❌⚪, reading time ❌⚪E. Content quality is the right kind (commercial-intent long-tail).

## 13. Performance — 70/100

| Item | Status | Priority | Effort | Notes |
|---|---|---|---|---|
| **`app.js` not minified** | ❌ | 🟠 | E | 963 KB shipped; esbuild `--minify` → ~350–400 KB (~60% cut) + Vercel brotli. **Top quick win.** One-line build change. |
| Heavy images | ⚠️ | 🟠 | E | `share-banner.png` 1 MB (jpg twin is 62 KB — reference the jpg), `nemo-fish-logo.png` 519 KB, `favicon-512.png` 167 KB. |
| WebP / AVIF | ❌ 🟡 M | All PNG/JPG. |
| `srcset` / responsive images | ❌ 🟡 M | On ideas list (blur-up too). |
| Lazy loading | ⚠️ 🟡 E | Present (5×) — extend to all below-fold imagery. |
| Code splitting / tree shaking | ❌ ⚪ C | Single-file architecture precludes it. |
| Font optimization (async, preconnect) | ✅ | — | — |
| Browser caching (immutable assets, SW strategies) | ✅ | — | — |
| CDN (Vercel edge + unpkg/gstatic) | ✅ | — | — |
| Compression | ✅ (Vercel auto-brotli) | — | — |
| Preload/preconnect/dns-prefetch | ✅ (thorough) | — | — |
| Third-party CDN dependency risk | ⚠️ 🟡 M | React from unpkg is a single point of failure; consider self-hosting the two React files. |
| Precompile fast path + compile-once cache | ✅ (excellent for the constraints) | — | — |

## 14. Accessibility — 55/100

| Item | Status | Priority | Effort |
|---|---|---|---|
| WCAG 2.2 AA | ❌ 🟠 M | Not audited/claimed. |
| Keyboard navigation | ⚠️ 🟠 M | 0 `tabIndex`, 5 focus refs — custom controls (tilt cards, drawers, modals) likely keyboard-inaccessible; no focus trapping in modals; no skip-link. |
| ARIA labels | ⚠️ 🟠 E | 23 uses across 10.8k lines — icon buttons need labels. |
| Focus states | ⚠️ 🟠 E | Audit visible focus rings on all interactive elements. |
| Screen reader support | ⚠️ 🟠 M | Toasts need `aria-live`; dynamic page changes need announcements. |
| Color contrast | ⚠️ 🟡 E | Cyan-on-white accents (#0ea5e9) fail AA for small text; verify token usage. |
| Reduced motion | ✅ | — | — |
| Semantic HTML | ⚠️ 🟡 M | `React.createElement` div-heavy; ensure nav/main/button semantics. |

## 15. Security — 80/100

| Item | Status | Priority | Effort |
|---|---|---|---|
| HTTPS + HSTS (preload) | ✅ | — | — |
| Secure authentication (Google OAuth via Firebase) | ✅ | — | — |
| JWT best practices | ✅ (handled by Firebase SDK) | — | — |
| Secure cookies / CSRF | ✅ n/a (no cookie sessions; Firebase tokens) | — | — |
| XSS protection | ✅ | — | — | No `innerHTML`/`dangerouslySetInnerHTML`; `E()` escape used ~970× incl. bill HTML. |
| SQL injection | ✅ n/a (RTDB) | — | — |
| Input validation | ⚠️ 🟡 M | Client-side present; DB rules validate ratings/stock; order payloads not schema-validated server-side. |
| **CSP header** | ❌ | 🟠 | M | Other headers are strong (XFO, nosniff, Referrer-Policy, Permissions-Policy, COOP). CSP needs care with CDNs/Firebase but is the missing piece. |
| Rate limiting | ❌ 🟡 C | No backend; Firebase free tier. OTP flow mitigates admin abuse. |
| RBAC | ✅ (admin UID-locked writes; per-user order isolation; decrement-only stock) | — | — |
| Environment variables | ✅ n/a (Firebase client config is public by design; rules are the boundary) | — | — |
| **Client-trusted loyalty/wallet math** | ⚠️ | 🟠 | C | Points/coins are computed in the browser (known trade-off). Fine while redemption values are small; needs Cloud Functions before coins ≈ real money at scale. |
| Audit logging | ⚠️ 🟡 M | Order history is a trail; no admin-action log. |

## 16. Analytics — 62/100

| Item | Status | Priority | Effort |
|---|---|---|---|
| In-app behaviour analytics (funnel, top products, searches) | ✅ | — | — |
| Revenue dashboard + customer insights (admin) | ✅ | — | — |
| Google Analytics / Plausible | ❌ 🟠 E | Plausible snippet is stubbed-out in index.html — activating GA4 or Plausible is a 10-min job and unlocks acquisition data (in-app analytics can't see traffic sources). |
| Search Console | ✅ (verification file live) — resubmit sitemap per PROJECT_STATUS. | — | — |
| Cart/checkout/payment event tracking | ✅ (in-app funnel) | — | — |
| Abandoned-cart measurement | ⚠️ 🟠 M | Funnel shows drop-off; no recovery loop (§8). |
| Conversion tracking (ads-ready) | ❌ 🟡 E | Needs GA4/pixel when ads start. |

## 17. Admin Panel — 84/100

Dashboard ✅ · Inventory ✅ · Orders (verify/ship/track/bill) ✅ · Customers + insights ✅ · Coupons ✅ · Reports/analytics ✅ · Reviews ✅ · Guides/blog management ✅ · Notifications (order alerts via FormSubmit + OTP email) ✅ · Bulk upload/edit ❌🟡M · SEO editor ❌⚪ (static generator covers it) · Image optimization on upload ⚠️🟡M (compress/resize before storing — protects your 1 GB Firebase quota).

## 18. PWA — 82/100

| Item | Status |
|---|---|
| Manifest (id, icons+maskable, screenshots, shortcuts, categories, launch_handler) | ✅ |
| Install prompt (custom banner) + assetlinks for TWA | ✅ |
| Service worker (network-first code w/ 1.5s timeout fallback, cache-first assets) | ✅ smart design |
| Offline support | ⚠️ 🟡 M — shell loads offline; data views need a friendly offline state. |
| Push notifications | ❌ 🟡 C — FCM would power order-status + abandoned-cart pushes; pairs well with Play Store app. |
| Background sync | ❌ ⚪ C |
| Splash screen + app icons | ✅ (cinematic) |

## 19. Google Indexing & Search Visibility — 70/100

| Item | Status | Priority |
|---|---|---|
| Search Console configured (verification file present) | ✅ | — |
| Sitemap submitted / resubmitted after latest pages | ⚠️ 🟠 | Action item in PROJECT_STATUS — do after each page batch. |
| Indexed status of / , /p/* , /guides/* | ⚠️ 🟠 | Verify in GSC (can't check from sandbox). Request indexing for all 21 URLs. |
| robots.txt accessible | ✅ | — |
| Rich results eligibility (Product/Breadcrumb schema on static pages) | ✅ | — |
| CWV passing | ⚠️ 🟠 | See §13 — minify first. |
| **Google Business Profile** | ❌ 🔴 | Single biggest lever for ranking on "nemo aqua store" + local queries. Not code — do it this week. |
| Category pages indexed | ⚠️ 🟡 | Only `/p/` index page exists; no per-category static pages. |

## 20. Conversion Optimization — 78/100

Trust messaging (Live Arrival Guarantee) ✅ · Testimonials ✅ · Delivery info ✅ · Return policy ✅ · WhatsApp support ✅ · Sticky add-to-cart (floating cart bar) ✅ · Recently viewed ✅ · Related products ✅ · Payment-security badges ⚠️🟡E (add UPI/Razorpay logos at checkout) · Exit-intent ❌⚪ · Newsletter popup ❌⚪ · Personalized recs ⚠️🟡M · Upsell/cross-sell ⚠️🟡M (FBT block) · **Cart reminders ❌🟠M (abandoned-cart WhatsApp nudge)**.

---

# 🏁 Final Report

## Top 20 Highest-Priority Improvements

| # | Item | Priority | Effort |
|---|---|---|---|
| 1 | Create **Google Business Profile** (biggest ranking lever, zero code) | 🔴 | E |
| 2 | **Minify `app.js`** (add `--minify` to the esbuild command) | 🟠 | E |
| 3 | Add **React ErrorBoundary** (render-error → friendly reload screen, not white page) | 🟠 | E |
| 4 | Activate **GA4 or Plausible** (snippet already stubbed in index.html) | 🟠 | E |
| 5 | Swap `og:image` → `share-banner.jpg` (62 KB) + compress `nemo-fish-logo.png` (519 KB) | 🟠 | E |
| 6 | GSC: resubmit sitemap + request indexing on all 21 URLs; verify coverage | 🟠 | E |
| 7 | **Abandoned-cart WhatsApp nudge** (highest-ROI missing commerce feature) | 🟠 | M |
| 8 | **Structured species spec fields** in admin (tank size, temp, pH, difficulty, size, lifespan, origin, diet) | 🟠 | M |
| 9 | Aquarium-specific **filters** built on those fields (freshwater/beginner/shrimp-safe/tank-size) | 🟠 | M |
| 10 | Accessibility pass 1: aria-labels on icon buttons, visible focus rings, `aria-live` on toasts, skip-link | 🟠 | E–M |
| 11 | Accessibility pass 2: modal/drawer focus trapping + full keyboard nav | 🟠 | M |
| 12 | **CSP header** (report-only first, then enforce) | 🟠 | M |
| 13 | Regenerate `/p/` static pages for the **full live catalog** (script exists: `seo/generate.mjs`) | 🟠 | M |
| 14 | Image pipeline: compress/resize on admin upload (protects Firebase quota + speeds pages) | 🟡 | M |
| 15 | Surface **Best Sellers / Trending** on home from existing analytics | 🟡 | E |
| 16 | Product-page spec table + per-product FAQ (+ FAQ schema) | 🟡 | M |
| 17 | Quick-view modal on listing | 🟡 | M |
| 18 | Push notifications via FCM (order status; pairs with Play Store app) | 🟡 | C |
| 19 | Self-host React bundles (remove unpkg single-point-of-failure) | 🟡 | E |
| 20 | Move loyalty/wallet math server-side (Cloud Functions) before coins scale | 🟡 | C |

## Quick Wins (under 1 day)
Items **2, 3, 4, 5, 6, 15, 19** above, plus: lazy-load all below-fold images · payment-trust badges at checkout · guide↔product internal links · FAQ schema on guides · alt-text audit · empty-state audit.

## High-Impact Features (1–2 weeks)
Abandoned-cart WhatsApp nudge (7) · species spec fields + filters (8+9) · full accessibility passes (10+11) · CSP (12) · full static catalog regeneration (13) · image upload pipeline (14) · quick view (17) · FBT/upsell block.

## Long-Term (1–3 months)
Push notifications (FCM) · beginner aquarium setup wizard / recommendation engine · AI aquarium assistant (needs small key-proxy backend) · Cloud Functions for loyalty + order validation + audit log · TypeScript/modular migration with a real build step (do this only when the single-file model starts costing real bugs) · guest checkout or WhatsApp-order fallback.

## Technical Debt Summary
1. **Single 10.8k-line file** — every feature raises merge/regression risk; no tests exist to catch it. Mitigation now: section-marker comments, extract pure logic (pricing, points, compatibility data) into separately testable blocks even within the file.
2. **No error capture** — you can't see customer-side crashes. ErrorBoundary + a tiny error log to Firebase = 90% of the value.
3. **Client-trusted money math** (coins/wallet) — acceptable now, documented; needs a backend before scale.
4. **Dual-source builds** — `app.js` must be rebuilt in lockstep with `app.jsx` (already bit us with esbuild version drift). Consider a git pre-commit hook or CI check comparing the two.
5. **CDN dependencies** (unpkg/gstatic/jsdelivr) — availability risk outside your control.

## Missing vs. Leading E-commerce Platforms (Flipkart/Amazon-class)
Guest checkout · gateway-integrated payments (auto-verify vs screenshot) · abandoned-cart recovery · push notifications · personalized recommendations · product Q&A · compare · gift cards · invoice tax breakout · loyalty tiers · multi-language (Tamil would suit the customer base).

## Missing vs. Leading Aquarium Stores (LiveAquaria/Aquarium Co-Op-class)
Structured care-spec tables on every product · care-level/temperament/shrimp-safe facet filters · species compatibility on the product page itself (checker exists as a separate tool — wire it into product pages) · auto-ship/subscriptions for consumables (food) · disease/help center depth · community content (user tank photos).

## Prioritized Roadmap

**Phase 1 — This week (launch hygiene, ~2 days of work):**
GBP listing → minify build → ErrorBoundary → analytics on → image swaps → GSC resubmit + indexing → best-sellers row → React self-host.
*Outcome: faster, crash-safe, measurable, and discoverable — before Play Store traffic lands.*

**Phase 2 — Next 2–3 weeks (conversion + catalog depth):**
Abandoned-cart WhatsApp nudge → species spec fields → aquarium filters → full static `/p/` catalog → product spec tables + FAQ → accessibility passes → CSP → image upload pipeline → quick view.
*Outcome: higher conversion, defensible SEO moat, AA-track accessibility.*

**Phase 3 — 1–3 months (platform maturity):**
FCM push → setup wizard + recommendation engine → AI assistant → Cloud Functions (loyalty, validation, audit log) → subscriptions/auto-ship → Tamil localization → evaluate modular/TS migration.
*Outcome: features competitors in this niche don't have.*

---
*Scores reflect the app's own architecture goals (no-build single-file PWA). Judged as a conventional SPA codebase, Code Quality would score lower; judged on shipped customer value per line of code, it punches far above its weight.*
