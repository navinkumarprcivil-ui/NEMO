/**
 * /p/ and /p/<slug> — the search-indexable shop pages, rendered per request.
 *
 * These were static files under /p/, written by a generator someone had to
 * remember to run. `lib/catalog.mjs` explains why that had to go; this is the
 * route in front of it. `vercel.json` rewrites /p and /p/<slug> here.
 *
 * A slug that isn't in the live catalogue returns 404 with a short page that
 * sends the reader to the shop — a delisted product should leave the index, not
 * linger in it.
 */

import { loadCatalogue, productPage, catalogPage, notFoundPage } from '../lib/catalog.mjs';

export default async function handler(req, res) {
  const slug = String((req.query && req.query.slug) || '').trim();

  let cat = null;
  try {
    cat = await loadCatalogue();
  } catch (e) {
    // A slow or unreachable database must not make the shop look deleted. 503
    // with a short retry tells a crawler to come back rather than drop the URL.
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Retry-After', '120');
    return res.status(503).send(notFoundPage());
  }

  // Crawlers re-fetch these often and the catalogue changes a few times a day,
  // so cache at the edge for ten minutes and serve the stale copy while it
  // refreshes. A re-priced product still corrects itself quickly.
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=86400');

  if (!slug) return res.status(200).send(catalogPage(cat));

  const product = cat.bySlug[slug];
  if (!product) {
    res.setHeader('Cache-Control', 'public, s-maxage=300');
    return res.status(404).send(notFoundPage(cat.STORE));
  }

  return res.status(200).send(productPage(product, cat));
}
