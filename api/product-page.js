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

const DB = 'https://nemo-aqua-store-default-rtdb.asia-southeast1.firebasedatabase.app';

function mediaUrl(value) {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return '';
  return value.url || value.downloadURL || value.downloadUrl || '';
}

/**
 * Hydrate the server-rendered /p pages with the same public Firebase media that
 * the browser storefront resolves through loadMediaItem(). Firebase stores
 * legacy gallery bytes/URLs under media/<key>, thumbnails under
 * media/<key>_thumb, and older single-product images under media/img-<id>.
 */
async function hydrateCatalogueMedia(cat) {
  let mediaMap = {};
  try {
    const r = await fetch(`${DB}/media.json`, { signal: AbortSignal.timeout(5000) });
    if (r.ok) mediaMap = (await r.json()) || {};
  } catch {
    return cat;
  }

  for (const p of cat.products || []) {
    let hasPhoto = false;
    const existing = Array.isArray(p.media) ? p.media : [];

    p.media = existing.map((m) => {
      if (!m || m.type === 'video') return m;

      const key = String(m.key || '').trim();
      const full = mediaUrl(m.url)
        || (key ? mediaUrl(mediaMap[key]) : '');
      const thumb = mediaUrl(m.thumbUrl)
        || mediaUrl(m.url_thumb)
        || (key ? mediaUrl(mediaMap[`${key}_thumb`]) : '');

      if (full || thumb) hasPhoto = true;
      return {
        ...m,
        ...(full ? { url: full } : {}),
        ...(thumb ? { thumbUrl: thumb } : {}),
      };
    });

    if (!hasPhoto) {
      const legacy = mediaUrl(p.imageUrl) || mediaUrl(mediaMap[`img-${p.id}`]);
      if (legacy) p.media = [{ type: 'image', url: legacy }, ...p.media];
    }
  }

  return cat;
}

export default async function handler(req, res) {
  const slug = String((req.query && req.query.slug) || '').trim();

  let cat = null;
  try {
    cat = await loadCatalogue();
    await hydrateCatalogueMedia(cat);
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
