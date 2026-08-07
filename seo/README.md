# SEO Product Pages

Every product gets a **static-looking, Google-indexable page** at its own URL — one real page per
fish/plant/item — so the store can rank for searches like *"buy betta fish online"* instead of only
its brand name.

## How it works

Nothing is generated ahead of time and nothing is committed. The pages are rendered when the
request arrives, from the live catalogue:

| URL | Served by | What it is |
| --- | --- | --- |
| `/p/<slug>` | `api/product-page.js` | One product: title, meta description, Open Graph + Twitter tags, Product + Breadcrumb schema, related products, and a CTA that deep-links into the app at that product (`/?p=<id>`). |
| `/p/` | `api/product-page.js` | The browsable catalogue, grouped by category. |
| `/sitemap.xml` | `api/sitemap.js` | Every product URL, always current. |

Both read `lib/catalog.mjs`, which pulls `products` and `settings` from Firebase (public read — no
credentials, nothing a shopper couldn't already see) and derives each slug from the product name.
The routes are wired up in `vercel.json`; `robots.txt` still points at `/sitemap.xml`.

Share images come from each product's own photo, falling back to `/assets/share-banner.jpg` for a
product that has none. There is nothing to draw by hand.

## When to re-run it

Never — that's the point. **Listing a product in the admin panel is the whole job.** Its page and
its sitemap entry exist from that moment; a delisted product's page returns 404 and drops out of the
sitemap on its own.

This used to be a generator, `seo/generate.mjs`, that had to be run and committed after every
catalogue change. What it wrote was a snapshot of the shop on the day somebody last remembered:
products listed since had no page and were missing from the sitemap, and deleted ones kept a sitemap
entry pointing at a 404. Regenerating fixed today and went stale again tomorrow — the chore was the
bug, which is why it's gone.

Pages are cached at the edge for 10 minutes (the sitemap for an hour) and served stale while they
refresh, so a re-price corrects itself quickly without hitting the database on every crawl.

## After deploying

1. In **Google Search Console** → Sitemaps → make sure `sitemap.xml` is submitted.
2. Use **URL Inspection** on a couple of product URLs → **Request Indexing**.
3. New products are picked up automatically as Google re-crawls the sitemap (days to weeks).

## Notes

- Slugs are derived exactly as the generator derived them — same slugify, same collision suffix,
  same ordering — so URLs Google has already indexed still resolve.
- These pages are read-only marketing surfaces. All real shopping, cart, payment and accounts stay
  in the app — nothing sensitive is exposed here.
