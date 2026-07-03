# SEO Product Pages

This folder generates **static, Google-indexable pages** for every product — one real URL per fish/plant/item — so your store can rank for searches like *"buy betta fish online"* instead of only your brand name.

## How it works
- `generate.mjs` pulls your **live products** straight from Firebase (public read) and writes:
  - `/p/<slug>.html` — one polished, mobile-first page per product (with title, meta description, Open Graph + Twitter share tags, Product + Breadcrumb schema for Google, related-product links, and a CTA that deep-links into your app at that product).
  - `/p/index.html` — a browsable catalog page grouped by category.
  - `/sitemap.xml` — refreshed with every product URL (already submitted to Google Search Console).
  - `/p/og/<slug>.jpg` — a custom share image per product (generated once; reused on refresh).
- A visitor from Google lands on the static page → taps **"View & Order in the Store"** → your app opens at exactly that product (via `/?p=<id>`).

## When to re-run it
Whenever you **add, rename, re-price, or remove** products in the admin panel:

```bash
node seo/generate.mjs
git add p sitemap.xml && git commit -m "Refresh SEO pages" && git push
```

Requires **Node 18+** (uses built-in fetch — no `npm install` needed).

## After deploying
1. In **Google Search Console** → Sitemaps → make sure `sitemap.xml` is submitted.
2. Use **URL Inspection** on a couple of product URLs → **Request Indexing**.
3. New products are indexed automatically as Google re-crawls the sitemap (days to weeks).

## Notes
- Share images for **brand-new** products fall back to the category style. If you want a fresh custom share image for a new product, ask Claude to regenerate `/p/og/`.
- These pages are read-only marketing/SEO surfaces. All real shopping, cart, payment and accounts stay in the app — nothing sensitive is exposed here.
