# Live Fish — removal and backout list

Live fish and the DOA / Live Arrival Guarantee flow are **hidden behind one switch**, not
deleted, so that they can be brought back by flipping it rather than by re-doing this work in
reverse.

The switch is a **setting, not code**:

```
Admin → Settings → 🏪 Store → 🐠 Live Fish → "Sell live fish"
```

It is stored as `settings.liveFishEnabled` in Firebase, and the storefront, the server-rendered
`/p/` pages, the sitemap and the share previews all read that one value. It used to be a constant
declared in `app.jsx`, `src/app.jsx` and `lib/catalog.mjs`, kept in step by a test; there is now
nothing to keep in step, and no deploy is needed to change it.

Nothing was removed from Firebase. Every Live Fish product, its media, variants, prices, packing
rules and stock are exactly where they were, and every past order keeps its fish line items, DOA
claims and refunds — those are GST records.

---

## TL;DR — how to put live fish back

1. **Turn the setting on.** Admin → Settings → Store → Live Fish → tick *Sell live fish* → Save.
   Customers pick it up when they next open the site; Google's copy of the `/p/` pages follows
   within the hour.

2. **Do the one manual step the setting cannot cover:** the static SEO copy in `index.html` —
   the `<title>`, `<meta name="description">` and `<noscript>` block a crawler reads before any
   script runs. See [§ index.html](#5-indexhtml--static-seo-copy-manual-revert) for the exact
   original strings to paste back, then:

   ```bash
   node scripts/build.mjs   # app.js is a committed artifact; a stale one is served silently
   npm run check
   npm run deploy
   ```

> **Check your payment gateway first.** Some gateways do not onboard merchants selling live
> animals — that is why the switch exists. Confirm before you turn it on.

### How the switch reaches the code

`test/live-fish-switch.test.mjs` guards the mechanism rather than the value, so it passes in both
states. What it holds to:

* No file re-declares `LIVE_FISH_ENABLED` as a constant — that would put a second copy of the
  answer back, and let the shop and Google show different stores.
* The client seeds it synchronously from the cached settings blob at module load, and updates it
  inside the settings **setter**, before the render that follows — not in an effect afterwards,
  which would leave the storefront a render behind.
* The server refreshes it in `loadStoreSettings()`, which every render path calls first, and
  `api/share.js` loads the settings on **both** its paths.
* Values derived from it (`shopCategories()`, `hiddenPolicyRoutes()`, `policyMeta()`) are
  functions, not constants. A constant computed once at script load would be wrong for the whole
  session of anyone who arrives just after the owner flips the switch — the case the switch is
  for.
* An unreachable database **fails closed**. Serving a fish-free page for a shop that does sell
  them is recoverable; advertising live animals for a shop that has switched them off is the
  failure the switch exists to prevent.

---

## What the switch controls

Turning it back on restores, with no other edits: the catalogue, shop, search, category filters,
product pages, cart, checkout, live-fish shipping and packing, the Live Arrival Guarantee, the DOA
claim flow, the `/p/` product pages, the shop index, the sitemap, share cards, and the policy pages.

## What was deliberately left alone

* **Firebase.** No product, order, setting or policy text was edited or deleted.
* **Past orders.** Fish line items, DOA claims, approvals and refunds still render in the
  customer's order history and in Admin, and are still resolvable and refundable. They are GST
  records and the switch does not touch them.
* **Admin.** The owner still sees and manages the complete catalogue, including the hidden Live
  Fish products, and still has the live-fish shipping tables, the DOA review panel and DOA Insights.
* **Fishkeeping content.** Aqua Tools, the Fish Community Planner, My Tank, the Customer Tank
  showcase and the care guides are untouched. Razorpay restricts selling live animals, not writing
  about them.
* **The decorative fish.** The betta and clownfish animated on the splash/background are branding
  for an aquarium shop, not a product listing, and stay.
* **The Android app.** No change. It is a WebView onto the same site, so it picks all of this up
  with the deploy. No new signing key, no architecture change, no new AAB needed.

---

# The change list, file by file

## 1. `app.jsx`

(There was a second copy at `src/app.jsx` while this work was done. Nothing built it — only
tests read it — so every edit had to be made twice or the suite failed, and the two had already
drifted apart by one cache-busting string. It has been deleted; `app.jsx` is the only source.)

| # | Where | Change | Reverse |
|---|-------|--------|---------|
| 1.1 | after `const CATEGORIES` | New **master switch block**: `readCachedLiveFishSwitch`, `LIVE_FISH_ENABLED` (a `let`), `applyLiveFishSwitch`, `LIVE_FISH_CATEGORY`, `isLiveFishCategory`, `isShoppable`, `shoppable`, `shopCategories()`, `hiddenPolicyRoutes()`, `policyLinks`, `FISHY_COPY_RE`, `storeCopy` | Setting → on. The helpers are all no-ops when on. |
| 1.2 | after `DEFAULT_SETTINGS` | New **policy override block**: `COURIER_COLLECT_TERM_DRY`, `courierCollectTerm()`, `LIVE_FISH_OFF_POLICY`, `policyText()` | Setting → on; `policyText` then returns the saved text unchanged. |
| 1.3 | `doaEntryOpen()` | Added `if(!LIVE_FISH_ENABLED) return false;` as the first line — no **new** DOA claim can be raised. Existing claims still render. | Setting. |
| 1.4 | `useState` for `cart` | Basket hydration wrapped in `shoppable(...)` so a fish saved in a shopper's `localStorage` basket is dropped before first render | Setting. |
| 1.5 | next to `cartMap` | New `shopProducts` memo — `products` minus hidden categories | Setting. |
| 1.6 | page render block | `products={products}` → `products={shopProducts}` on **HomePage, ShopPage, DetailPage, CartPage, CheckoutPage, SavedPage, MiniCart, OrderHistoryPage**. `AdminHub` keeps the full list. | Flag (the prop stays `shopProducts`; it just stops filtering). |
| 1.7 | `deepLinkRef` effect | `/?p=<id>` resolves against `shopProducts`; a hidden id retires the link and lands on Home with a tidy URL instead of opening the product | Setting. |
| 1.8 | `CategoryPills`, browse drawer, footer Shop column, Shop page `catCounts` | `CATEGORIES` → `SHOP_CATEGORIES` | Setting. |
| 1.9 | `ProductForm` initial state | Default category `CATEGORIES[0]` → `SHOP_CATEGORIES[0]`, so a new product does not default into a hidden category | Setting. |
| 1.10 | `CheckoutPage` | `const hasLiveFish = LIVE_FISH_ENABLED && cart.some(...)` — belt and braces over 1.4. This one check already gated the packing chooser, thermacol/live-fish courier charges, the Central & North India block and the guarantee line, so all of it goes dark together | Setting. |
| 1.11 | 3 policy link lists + the Contact page quick link | Wrapped in `policyLinks([...])` / gated, dropping **Live Arrival Guarantee** and **Acclimatization Guide** | Setting. |
| 1.12 | `POLICY_META` | Renamed to `POLICY_META_ALL`; `POLICY_META` is now derived by filtering it. Built by filtering rather than by assembling a shorter map **so the policy order comes back exactly as it was** | Setting. |
| 1.13 | `PolicyPage` | Renders `policyText(meta.key, s)` instead of `s[meta.key]`; the tracking clause uses `courierCollectTerm()` | Setting. |
| 1.14 | invoice HTML | Returns clause uses `policyText("returnPolicy", s)` | Setting. |
| 1.15 | home hero | `settings.heroHeadline` / `heroSub` rendered through `storeCopy(...)`; the admin copy suggestion chips no longer offer fish wording | Setting. |
| 1.16 | pincode checker | Lead line and the "we deliver here" result no longer mention live fish or the guarantee | Setting. |
| 1.17 | product detail trust badges | `🛡️ Live Arrival Guarantee` → `🚚 Delivery across India` | Setting. |

### Why the policy text is overridden at render, not rewritten

The owner's live-fish policy wording lives in Firebase and has to come back **verbatim**. So the
override lives in `policyText()`, which is read-only, and is deliberately **not** applied inside
`normalizeSettings()` — that function's result is what Admin saves back, so sanitising there would
have quietly overwritten the live-fish policies in Firebase and made the restore lossy.
`test/live-fish-switch.test.mjs` asserts `normalizeSettings` stays switch-free.

Admin's Settings editors still show and save the real saved text throughout.

### Judgement call worth knowing about

The **Acclimatization Guide** policy page is hidden along with the guarantee. It is fishkeeping
guidance, which you asked to keep — but as a *policy page* it exists only to explain settling in
livestock we shipped, and a page about acclimatizing the fish we sent you sits badly beside a store
that says it does not sell live animals. The care guides section itself is untouched. If you would
rather it stayed visible, remove `"policy-acclimatize"` from `hiddenPolicyRoutes()` and drop
`k!=="acclimatize"` from the `policyMeta()` filter — that is a two-token change, independent of
the switch.

## 2. `lib/catalog.mjs` — the server-rendered `/p/` pages and the sitemap

| # | Change | Reverse |
|---|--------|---------|
| 2.1 | `export const LIVE_FISH_ENABLED = false;` + `LIVE_FISH_CATEGORY` | Setting → on. |
| 2.2 | `loadCatalogue()` filters the hidden category out of `products`. This is the single gate for **all three** server surfaces — product pages, the `/p/` shop index and `sitemap.xml` — so a live-fish slug now 404s through `notFoundPage` and Google drops the URL | Setting. |
| 2.3 | `metaDesc()` tail — "Free Live Arrival Guarantee · delivery across India" → "Delivered with care across India" | Setting. |
| 2.4 | `productPage()` Live Arrival Guarantee / DOA panel gated | Setting. |
| 2.5 | `catalogPage()` title, meta description, `<h1>` and lead paragraph — no "Aquarium Fish", no "livestock", no guarantee | Setting. |

## 3. `api/share.js` — the `/s/<id>` share cards

| # | Change | Reverse |
|---|--------|---------|
| 3.1 | Imports `LIVE_FISH_ENABLED` from `lib/catalog.mjs` (**no second copy of the switch**) | — |
| 3.2 | A hidden live-fish product is dropped, so an old WhatsApp share link previews the site card instead of the fish, its price and its photo. The link still works | Setting. |
| 3.3 | Default share description no longer says "healthy fish" | Setting. |

## 4. Tests

| # | Change |
|---|--------|
| 4.1 | `test/catalog.test.mjs` — fixture gained two dry-goods products (`Aqua Heater 50W`, `Sponge Filter Nano`) so the rendering cases (discount, media fallback, stock, escaping) no longer depend on a fish being catalogued. The fish fixtures **stay**, and are asserted absent while the switch is off and present while it is on. |
| 4.2 | `test/live-fish-switch.test.mjs` — guards the ways the switch could stop being a single control: a constant re-declaring the answer, the client or server reading it too late, a derived value frozen at script load, a stale `app.js`, and a shopping surface quietly going back to the unfiltered list. |

Every assertion in both files holds in **both** states of the switch, so turning live fish back on
does not turn the suite red. Verified: flipped on, rebuilt, `157/157` passing; flipped off,
rebuilt, `157/157` passing, and `app.jsx` came back byte-identical.

## 5. `index.html` — static SEO copy (**manual revert**)

This is the only part the switch cannot reach: `index.html` is static and has no JavaScript
evaluated at build time. Six strings changed. To restore, paste these back:

```html
<!-- 1 -->
<meta name="description" content="Buy premium aquarium fish, live plants, tanks &amp; accessories online at Nemo Aqua Store — hand-picked, healthy livestock delivered with care across India."/>

<!-- 2 -->
<meta property="og:title" content="Nemo Aqua Store — Premium Aquarium Fish, Plants & Accessories"/>

<!-- 3 -->
<meta property="og:description" content="Hand-picked healthy fish, live plants & quality accessories — delivered with care across India."/>

<!-- 4 -->
<meta name="twitter:description" content="Premium aquarium fish, plants & accessories — delivered with care."/>

<!-- 5 — the JSON-LD Store "description" field -->
"description":"Premium aquarium fish, live plants, tanks & accessories — hand-picked, healthy livestock delivered with care across India."

<!-- 6 — the <noscript> block -->
    <h1 style="font-size:26px;margin:0 0 8px">Nemo Aqua Store — Buy Aquarium Fish Online in India</h1>
    <p style="font-size:16px;margin:0 0 16px">Nemo Aqua Store is an online aquarium shop delivering hand-picked, healthy <strong>aquarium fish, live plants, tanks and accessories</strong> across India. Shop betta, guppy, molly, platy, goldfish, tetra and more — each order packed with oxygen and care, backed by our Live Arrival Guarantee.</p>
    <p style="font-size:14px;margin:0 0 16px;color:#0a2426">Our online aquarium store offers ornamental freshwater fish, live aquatic plants, fish tanks and aquariums, fish food, filters, and aquarium accessories — with safe doorstep delivery and a dead-on-arrival guarantee on livestock.</p>
```

Or, more simply, take them straight from git:

```bash
git show <the commit before this change>:index.html > index.html
```

`test/live-fish-switch.test.mjs` only enforces the *absence* of live-fish selling copy while the
switch is off, so restoring this copy with the switch on is not blocked.

## 6. Build artifacts (regenerated, never hand-edited)

`app.js`, `admin.js`, `sw.js` (cache name), `version.json`, and everything under `cf-dist/`.
These are outputs of `node scripts/build.mjs` and `npm run build`. Do not edit them; re-run the
build after editing this copy — the setting itself needs neither.

---

## After restoring — check these by hand

1. `/p/` lists a **Live Fish** section again, and `/sitemap.xml` contains the fish slugs.
2. The shop's category chips show **Live Fish** again.
3. A live-fish product page shows the **Live Arrival Guarantee** panel.
4. Checkout on a fish cart shows the packing chooser and the guarantee line.
5. **Policies** lists Live Arrival Guarantee and Acclimatization Guide again.
6. Ask Google to re-crawl `/sitemap.xml` in Search Console — the fish URLs were served as 404s
   while the switch was off, so they need to be re-indexed. This is the slowest part of the
   restore and is worth starting on day one.
