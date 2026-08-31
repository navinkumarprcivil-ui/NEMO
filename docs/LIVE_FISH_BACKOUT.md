# Live Fish — removal and backout list

Live fish and the DOA / Live Arrival Guarantee flow are **hidden behind one flag**, not deleted,
so that they can be brought back in about a month by flipping it rather than by re-doing this
work in reverse.

```js
const LIVE_FISH_ENABLED = false;   // app.jsx, src/app.jsx, lib/catalog.mjs
```

Nothing was removed from Firebase. Every Live Fish product, its media, variants, prices, packing
rules and stock are exactly where they were, and every past order keeps its fish line items, DOA
claims and refunds — those are GST records.

---

## TL;DR — how to put live fish back

```bash
# 1. Flip the flag in all three files (the values must match)
#      app.jsx          const LIVE_FISH_ENABLED = true;
#      src/app.jsx      const LIVE_FISH_ENABLED = true;
#      lib/catalog.mjs  export const LIVE_FISH_ENABLED = true;

# 2. Rebuild — app.js is a committed build artifact and a stale one is served silently
node scripts/build.mjs

# 3. Everything must pass
npm run check

# 4. Ship
npm run deploy
```

Then do the **one manual step** that the flag cannot cover: the static SEO copy in
`index.html`. See [§ index.html](#5-indexhtml--static-seo-copy-manual-revert) for the exact
original strings to paste back.

`npm run check` fails if you miss any of this: `test/live-fish-switch.test.mjs` asserts that all
three flags agree, **and** that the committed `app.js` was rebuilt after the change, **and** that
`index.html` carries no live-fish selling copy while the flag is off.

---

## What the flag controls

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

## 1. `app.jsx` (and `src/app.jsx`, its mirror — kept byte-identical apart from one pre-existing
`?v=product-photo-2` / `-3` drift that predates this work and was left as found)

| # | Where | Change | Reverse |
|---|-------|--------|---------|
| 1.1 | after `const CATEGORIES` | New **master switch block**: `LIVE_FISH_ENABLED`, `LIVE_FISH_CATEGORY`, `isLiveFishCategory`, `isShoppable`, `shoppable`, `SHOP_CATEGORIES`, `HIDDEN_POLICY_ROUTES`, `policyLinks`, `FISHY_COPY_RE`, `storeCopy` | Flag → `true`. The helpers are all no-ops when on. |
| 1.2 | after `DEFAULT_SETTINGS` | New **policy override block**: `COURIER_COLLECT_TERM_DRY`, `courierCollectTerm()`, `LIVE_FISH_OFF_POLICY`, `policyText()` | Flag → `true`; `policyText` then returns the saved text unchanged. |
| 1.3 | `doaEntryOpen()` | Added `if(!LIVE_FISH_ENABLED) return false;` as the first line — no **new** DOA claim can be raised. Existing claims still render. | Flag. |
| 1.4 | `useState` for `cart` | Basket hydration wrapped in `shoppable(...)` so a fish saved in a shopper's `localStorage` basket is dropped before first render | Flag. |
| 1.5 | next to `cartMap` | New `shopProducts` memo — `products` minus hidden categories | Flag. |
| 1.6 | page render block | `products={products}` → `products={shopProducts}` on **HomePage, ShopPage, DetailPage, CartPage, CheckoutPage, SavedPage, MiniCart, OrderHistoryPage**. `AdminHub` keeps the full list. | Flag (the prop stays `shopProducts`; it just stops filtering). |
| 1.7 | `deepLinkRef` effect | `/?p=<id>` resolves against `shopProducts`; a hidden id retires the link and lands on Home with a tidy URL instead of opening the product | Flag. |
| 1.8 | `CategoryPills`, browse drawer, footer Shop column, Shop page `catCounts` | `CATEGORIES` → `SHOP_CATEGORIES` | Flag. |
| 1.9 | `ProductForm` initial state | Default category `CATEGORIES[0]` → `SHOP_CATEGORIES[0]`, so a new product does not default into a hidden category | Flag. |
| 1.10 | `CheckoutPage` | `const hasLiveFish = LIVE_FISH_ENABLED && cart.some(...)` — belt and braces over 1.4. This one flag already gated the packing chooser, thermacol/live-fish courier charges, the Central & North India block and the guarantee line, so all of it goes dark together | Flag. |
| 1.11 | 3 policy link lists + the Contact page quick link | Wrapped in `policyLinks([...])` / gated, dropping **Live Arrival Guarantee** and **Acclimatization Guide** | Flag. |
| 1.12 | `POLICY_META` | Renamed to `POLICY_META_ALL`; `POLICY_META` is now derived by filtering it. Built by filtering rather than by assembling a shorter map **so the policy order comes back exactly as it was** | Flag. |
| 1.13 | `PolicyPage` | Renders `policyText(meta.key, s)` instead of `s[meta.key]`; the tracking clause uses `courierCollectTerm()` | Flag. |
| 1.14 | invoice HTML | Returns clause uses `policyText("returnPolicy", s)` | Flag. |
| 1.15 | home hero | `settings.heroHeadline` / `heroSub` rendered through `storeCopy(...)`; the admin copy suggestion chips no longer offer fish wording | Flag. |
| 1.16 | pincode checker | Lead line and the "we deliver here" result no longer mention live fish or the guarantee | Flag. |
| 1.17 | product detail trust badges | `🛡️ Live Arrival Guarantee` → `🚚 Delivery across India` | Flag. |

### Why the policy text is overridden at render, not rewritten

The owner's live-fish policy wording lives in Firebase and has to come back **verbatim**. So the
override lives in `policyText()`, which is read-only, and is deliberately **not** applied inside
`normalizeSettings()` — that function's result is what Admin saves back, so sanitising there would
have quietly overwritten the live-fish policies in Firebase and made the restore lossy.
`test/live-fish-switch.test.mjs` asserts `normalizeSettings` stays flag-free.

Admin's Settings editors still show and save the real saved text throughout.

### Judgement call worth knowing about

The **Acclimatization Guide** policy page is hidden along with the guarantee. It is fishkeeping
guidance, which you asked to keep — but as a *policy page* it exists only to explain settling in
livestock we shipped, and a page about acclimatizing the fish we sent you sits badly beside a store
that says it does not sell live animals. The care guides section itself is untouched. If you would
rather it stayed visible, remove `"policy-acclimatize"` from `HIDDEN_POLICY_ROUTES` and drop
`k!=="acclimatize"` from the `POLICY_META` filter — that is a two-token change, independent of the
flag.

## 2. `lib/catalog.mjs` — the server-rendered `/p/` pages and the sitemap

| # | Change | Reverse |
|---|--------|---------|
| 2.1 | `export const LIVE_FISH_ENABLED = false;` + `LIVE_FISH_CATEGORY` | Flag → `true`. |
| 2.2 | `loadCatalogue()` filters the hidden category out of `products`. This is the single gate for **all three** server surfaces — product pages, the `/p/` shop index and `sitemap.xml` — so a live-fish slug now 404s through `notFoundPage` and Google drops the URL | Flag. |
| 2.3 | `metaDesc()` tail — "Free Live Arrival Guarantee · delivery across India" → "Delivered with care across India" | Flag. |
| 2.4 | `productPage()` Live Arrival Guarantee / DOA panel gated | Flag. |
| 2.5 | `catalogPage()` title, meta description, `<h1>` and lead paragraph — no "Aquarium Fish", no "livestock", no guarantee | Flag. |

## 3. `api/share.js` — the `/s/<id>` share cards

| # | Change | Reverse |
|---|--------|---------|
| 3.1 | Imports `LIVE_FISH_ENABLED` from `lib/catalog.mjs` (**no second copy of the flag**) | — |
| 3.2 | A hidden live-fish product is dropped, so an old WhatsApp share link previews the site card instead of the fish, its price and its photo. The link still works | Flag. |
| 3.3 | Default share description no longer says "healthy fish" | Flag. |

## 4. Tests

| # | Change |
|---|--------|
| 4.1 | `test/catalog.test.mjs` — fixture gained two dry-goods products (`Aqua Heater 50W`, `Sponge Filter Nano`) so the rendering cases (discount, media fallback, stock, escaping) no longer depend on a fish being catalogued. The fish fixtures **stay**, and are asserted absent while the flag is off and present while it is on. |
| 4.2 | `test/live-fish-switch.test.mjs` — **new**. Guards the three ways the flag could stop being a single control: the three declarations drifting apart, a stale `app.js`, and a shopping surface quietly going back to the unfiltered list. Also asserts `index.html` carries no live-fish selling copy while off. |

Every assertion in both files holds in **both** states of the flag, so turning live fish back on
does not turn the suite red. Verified: flipped on, rebuilt, `157/157` passing; flipped off,
rebuilt, `157/157` passing, and `app.jsx` came back byte-identical.

## 5. `index.html` — static SEO copy (**manual revert**)

This is the only part the flag cannot reach: `index.html` is static and has no JavaScript
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
flag is off, so restoring this copy with the flag on is not blocked.

## 6. Build artifacts (regenerated, never hand-edited)

`app.js`, `admin.js`, `sw.js` (cache name), `version.json`, and everything under `cf-dist/`.
These are outputs of `node scripts/build.mjs` and `npm run build`. Do not edit them; re-run the
build after flipping the flag.

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
