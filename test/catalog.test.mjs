/**
 * The /p/ renderer, checked against a fixture catalogue.
 *
 *   node test/catalog.test.mjs
 *
 * `lib/catalog.mjs` reads Firebase over the network, so the fixture is injected
 * by replacing `fetch` — the point of the tests is the rendering and the slug
 * derivation, not the database.
 *
 * The slug cases matter most. These pages were static files under /p/ and Google
 * has already indexed those URLs, so a slug the renderer derives differently from
 * the old generator is a page that silently 404s. The expected values below are
 * the filenames that were actually committed under /p/.
 *
 * ── Live fish ──────────────────────────────────────────────────────────────
 * Every assertion here holds in BOTH states of LIVE_FISH_ENABLED, so flipping the
 * switch back on in a month cannot break this suite. The fixture deliberately keeps
 * live-fish products in it: while the switch is off they must be absent from the
 * catalogue, the shop index and the sitemap, and while it is on they must be back.
 * The rendering cases (discount, media fallbacks, stock, escaping) run against
 * dry goods so they exercise the renderer either way.
 */

import assert from 'node:assert/strict';

const FIXTURE = {
  products: {
    p1: { id: 'p1', name: 'Betta Halfmoon Male', category: 'Live Fish', price: 450, discountPct: 20, stockCount: 4, desc: 'A showy halfmoon betta.', media: [{ url: 'https://example.test/betta.jpg' }], ratingAvg: 4.8, reviewCount: 6 },
    p2: { id: 'p2', name: 'Neon Tetra Pair', category: 'Live Fish', price: 120, stockCount: 0, desc: 'Schooling nano fish.', media: [{ type: 'video', url: 'https://example.test/clip.mp4' }, { thumbUrl: 'https://example.test/neon-thumb.jpg' }] },
    p3: { id: 'p3', name: 'HOB Filter 300L/h', category: 'Accessories', price: 899, stockCount: 2, desc: 'Hang-on-back filter.', media: [] },
    p4: { id: 'p4', name: 'Tropical Flakes 100g', category: 'Feed', price: 210, stockCount: 9, desc: 'Daily staple food.', media: [] },
    p5: { id: 'p5', name: 'Java Fern', category: 'Plants', price: 90, comingSoon: true, stockCount: 0, desc: 'Low-light hardy plant.', media: [] },
    // Two products with the same name — the generator disambiguated with the id.
    p6: { id: 'p6', name: 'Java Fern', category: 'Plants', price: 140, stockCount: 3, desc: 'A larger clump.', media: [] },
    // Filtered out: no name.
    p7: { id: 'p7', category: 'Plants', price: 10 },
    // Dry goods carrying the properties the renderer cases need, so those cases do not
    // depend on a live-fish product being in the catalogue.
    p8: { id: 'p8', name: 'Aqua Heater 50W', category: 'Accessories', price: 450, discountPct: 20, stockCount: 4, desc: 'A compact heater.', media: [{ url: 'https://example.test/heater.jpg' }], ratingAvg: 4.8, reviewCount: 6 },
    p9: { id: 'p9', name: 'Sponge Filter Nano', category: 'Accessories', price: 120, stockCount: 0, desc: 'Nano sponge filter.', media: [{ type: 'video', url: 'https://example.test/clip.mp4' }, { thumbUrl: 'https://example.test/nano-thumb.jpg' }] },
  },
  settings: { legalName: 'Nemo Aqua Store', storeAddress: 'Salem & Chennai', ownerWhatsapp: '+91 93609 21030' },
};

globalThis.fetch = async (url) => {
  const key = String(url).includes('/settings.json') ? 'settings' : 'products';
  return { ok: true, json: async () => FIXTURE[key] };
};

const { loadCatalogue, productPage, catalogPage, sitemapXml, notFoundPage, slugify, LIVE_FISH_ENABLED } = await import('../lib/catalog.mjs');

let failures = 0;
const test = (name, fn) => {
  try { fn(); console.log(`  ✓ ${name}`); }
  catch (e) { failures++; console.error(`  ✗ ${name}\n    ${e.message}`); }
};

const cat = await loadCatalogue();
// Named fixture products, minus the live fish when the switch is off.
const EXPECTED_COUNT = LIVE_FISH_ENABLED ? 8 : 6;
const FISH_SLUGS = ['betta-halfmoon-male', 'neon-tetra-pair'];
const DRY_SLUGS = ['hob-filter-300l-h', 'tropical-flakes-100g', 'java-fern', 'java-fern-p6', 'aqua-heater-50w', 'sponge-filter-nano'];

console.log('slugs');
test('match the filenames the generator committed under /p/', () => {
  assert.equal(cat.slugMap.p3, 'hob-filter-300l-h');   // the slash becomes a hyphen
  assert.equal(cat.slugMap.p4, 'tropical-flakes-100g');
  assert.equal(cat.slugMap.p8, 'aqua-heater-50w');
  if (LIVE_FISH_ENABLED) {
    assert.equal(cat.slugMap.p1, 'betta-halfmoon-male');
    assert.equal(cat.slugMap.p2, 'neon-tetra-pair');
  }
});
test('disambiguate a duplicate name with the product id', () => {
  assert.equal(cat.slugMap.p5, 'java-fern');
  assert.equal(cat.slugMap.p6, 'java-fern-p6');
});
test('resolve back to the product', () => {
  assert.equal(cat.bySlug['aqua-heater-50w'].id, 'p8');
  assert.equal(cat.bySlug['java-fern-p6'].id, 'p6');
  assert.equal(cat.bySlug['not-a-product'], undefined);
});
test('fall back to the id when the name has no usable characters', () => {
  assert.equal(slugify('!!!') || 'x9', 'x9');
});

console.log('catalogue');
test('drops entries with no name', () => {
  assert.equal(cat.products.length, EXPECTED_COUNT);
  assert.ok(!cat.products.some((p) => p.id === 'p7'));
});
test('reads the store identity from settings', () => {
  assert.equal(cat.STORE, 'Nemo Aqua Store');
  assert.equal(cat.WA, '919360921030');   // digits only, for the wa.me link
});
test('carries live fish only while the switch is on', () => {
  const fish = cat.products.filter((p) => p.category === 'Live Fish');
  if (LIVE_FISH_ENABLED) {
    assert.equal(fish.length, 2, 'live fish should be catalogued while the switch is on');
    FISH_SLUGS.forEach((s) => assert.ok(cat.bySlug[s], `expected /p/${s} to resolve`));
  } else {
    assert.equal(fish.length, 0, 'live fish must not reach the catalogue while the switch is off');
    // No slug, so /p/<fish> falls through to the 404 page and Google drops the URL.
    FISH_SLUGS.forEach((s) => assert.equal(cat.bySlug[s], undefined, `/p/${s} must not resolve`));
  }
});

console.log('product page');
const heater = productPage(cat.bySlug['aqua-heater-50w'], cat);
test('is a complete indexable document', () => {
  assert.match(heater, /^<!doctype html>/);
  assert.ok(heater.trimEnd().endsWith('</html>'));
  assert.match(heater, /<meta name="robots" content="index,follow"\/>/);
  assert.match(heater, /<link rel="canonical" href="https:\/\/www\.nemoaquastore\.in\/p\/aqua-heater-50w"\/>/);
});
test('carries Product and Breadcrumb schema', () => {
  assert.equal((heater.match(/application\/ld\+json/g) || []).length, 2);
  assert.match(heater, /"@type":"Product"/);
  assert.match(heater, /"@type":"BreadcrumbList"/);
  assert.match(heater, /"availability":"https:\/\/schema\.org\/InStock"/);
});
test('applies the discount the storefront applies', () => {
  assert.match(heater, /<span class="now">₹360<\/span>/);   // 450 less 20%
  assert.match(heater, /<s>₹450<\/s>/);
});
test('shows the product photo, not the category emoji', () => {
  assert.match(heater, /<img src="https:\/\/example\.test\/heater\.jpg"/);
  assert.match(heater, /<meta property="og:image" content="https:\/\/example\.test\/heater\.jpg"\/>/);
});
test('deep-links into the app at that product', () => {
  assert.match(heater, /href="\/\?p=p8"/);
});
test('links related products in the same category', () => {
  assert.match(heater, /More in Accessories/);
  assert.match(heater, /href="\/p\/hob-filter-300l-h"/);
});

const nano = productPage(cat.bySlug['sponge-filter-nano'], cat);
test('skips video media and takes the thumbnail when there is no full image', () => {
  assert.match(nano, /<meta property="og:image" content="https:\/\/example\.test\/nano-thumb\.jpg"\/>/);
  assert.ok(!nano.includes('clip.mp4'));
});
test('marks an out-of-stock product out of stock', () => {
  assert.match(nano, /"availability":"https:\/\/schema\.org\/OutOfStock"/);
});

const fern = productPage(cat.bySlug['java-fern'], cat);
test('falls back to the store banner when a product has no photo', () => {
  assert.match(fern, /og:image" content="https:\/\/www\.nemoaquastore\.in\/assets\/share-banner\.jpg"/);
});
test('marks a coming-soon product as a pre-order', () => {
  assert.match(fern, /"availability":"https:\/\/schema\.org\/PreOrder"/);
  assert.match(fern, /Coming soon/);
});

test('escapes the product name everywhere it is printed', () => {
  const hostile = { id: 'x', name: 'Betta <script>alert(1)</script>', category: 'Accessories', price: 100, desc: 'a "quoted" & <b>bold</b> thing', media: [] };
  const html = productPage(hostile, { ...cat, slugMap: { ...cat.slugMap, x: 'betta-script' } });
  assert.ok(!html.includes('<script>alert(1)</script>'));
  assert.match(html, /&lt;script&gt;/);
  assert.ok(!html.includes('<b>bold</b>'));
});

/* The renderer itself is category-agnostic, so it can still be handed a fish directly.
   What must not survive the switch is the Live Arrival Guarantee panel — a DOA promise on
   a public product page is exactly the live-animal selling copy the switch exists to remove. */
test('renders the Live Arrival Guarantee panel only while the switch is on', () => {
  const fish = { id: 'f1', name: 'Betta Halfmoon Male', category: 'Live Fish', price: 450, stockCount: 2, desc: 'A showy betta.', media: [] };
  const html = productPage(fish, { ...cat, slugMap: { ...cat.slugMap, f1: 'betta-halfmoon-male' } });
  if (LIVE_FISH_ENABLED) {
    assert.match(html, /Free Live Arrival Guarantee/);
  } else {
    assert.ok(!/Live Arrival Guarantee/i.test(html), 'guarantee panel must be gone while the switch is off');
    assert.ok(!/DOA/i.test(html), 'DOA copy must be gone while the switch is off');
  }
});

console.log('catalogue page');
const index = catalogPage(cat);
test('lists every product, grouped by category', () => {
  DRY_SLUGS.forEach((s) => assert.ok(index.includes(`href="/p/${s}"`), `missing /p/${s}`));
  assert.match(index, /id="accessories"/);
});
test('carries an ItemList for the whole shop', () => {
  assert.match(index, /"@type":"ItemList"/);
  assert.equal((index.match(/"@type":"ListItem"/g) || []).length, EXPECTED_COUNT);
});
test('shows a Live Fish section, and live-fish selling copy, only while the switch is on', () => {
  if (LIVE_FISH_ENABLED) {
    assert.match(index, /id="live-fish"/);
    FISH_SLUGS.forEach((s) => assert.ok(index.includes(`href="/p/${s}"`), `missing /p/${s}`));
  } else {
    assert.ok(!index.includes('id="live-fish"'), 'the Live Fish section must be gone');
    FISH_SLUGS.forEach((s) => assert.ok(!index.includes(`href="/p/${s}"`), `/p/${s} must not be linked`));
    assert.ok(!/Live Arrival Guarantee/i.test(index), 'guarantee copy must be gone');
    assert.ok(!/livestock/i.test(index), 'livestock copy must be gone');
  }
});

console.log('sitemap');
const xml = sitemapXml(cat);
test('lists the home page, the shop and every product', () => {
  assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
  assert.equal((xml.match(/<url>/g) || []).length, EXPECTED_COUNT + 2);   // home + /p/ + products
  assert.match(xml, /<loc>https:\/\/www\.nemoaquastore\.in\/p\/java-fern-p6<\/loc>/);
});
test('contains no product that left the catalogue', () => {
  assert.ok(!xml.includes('planted-led-light'));
});
test('lists live fish only while the switch is on', () => {
  FISH_SLUGS.forEach((s) => {
    const listed = xml.includes(`/p/${s}<`);
    assert.equal(listed, LIVE_FISH_ENABLED, `/p/${s} in sitemap should be ${LIVE_FISH_ENABLED}`);
  });
});

console.log('not-found page');
test('is noindex and points at the shop', () => {
  const nf = notFoundPage('Nemo Aqua Store');
  assert.match(nf, /<meta name="robots" content="noindex,follow"\/>/);
  assert.match(nf, /href="\/p\/"/);
});

console.log(failures ? `\n${failures} failing` : '\nall passing');
process.exit(failures ? 1 : 0);
