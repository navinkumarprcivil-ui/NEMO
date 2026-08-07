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
  },
  settings: { legalName: 'Nemo Aqua Store', storeAddress: 'Salem & Chennai', ownerWhatsapp: '+91 93609 21030' },
};

globalThis.fetch = async (url) => {
  const key = String(url).includes('/settings.json') ? 'settings' : 'products';
  return { ok: true, json: async () => FIXTURE[key] };
};

const { loadCatalogue, productPage, catalogPage, sitemapXml, notFoundPage, slugify } = await import('../lib/catalog.mjs');

let failures = 0;
const test = (name, fn) => {
  try { fn(); console.log(`  ✓ ${name}`); }
  catch (e) { failures++; console.error(`  ✗ ${name}\n    ${e.message}`); }
};

const cat = await loadCatalogue();

console.log('slugs');
test('match the filenames the generator committed under /p/', () => {
  assert.equal(cat.slugMap.p1, 'betta-halfmoon-male');
  assert.equal(cat.slugMap.p2, 'neon-tetra-pair');
  assert.equal(cat.slugMap.p3, 'hob-filter-300l-h');   // the slash becomes a hyphen
  assert.equal(cat.slugMap.p4, 'tropical-flakes-100g');
});
test('disambiguate a duplicate name with the product id', () => {
  assert.equal(cat.slugMap.p5, 'java-fern');
  assert.equal(cat.slugMap.p6, 'java-fern-p6');
});
test('resolve back to the product', () => {
  assert.equal(cat.bySlug['betta-halfmoon-male'].id, 'p1');
  assert.equal(cat.bySlug['java-fern-p6'].id, 'p6');
  assert.equal(cat.bySlug['not-a-product'], undefined);
});
test('fall back to the id when the name has no usable characters', () => {
  assert.equal(slugify('!!!') || 'x9', 'x9');
});

console.log('catalogue');
test('drops entries with no name', () => {
  assert.equal(cat.products.length, 6);
  assert.ok(!cat.products.some((p) => p.id === 'p7'));
});
test('reads the store identity from settings', () => {
  assert.equal(cat.STORE, 'Nemo Aqua Store');
  assert.equal(cat.WA, '919360921030');   // digits only, for the wa.me link
});

console.log('product page');
const betta = productPage(cat.bySlug['betta-halfmoon-male'], cat);
test('is a complete indexable document', () => {
  assert.match(betta, /^<!doctype html>/);
  assert.ok(betta.trimEnd().endsWith('</html>'));
  assert.match(betta, /<meta name="robots" content="index,follow"\/>/);
  assert.match(betta, /<link rel="canonical" href="https:\/\/www\.nemoaquastore\.in\/p\/betta-halfmoon-male"\/>/);
});
test('carries Product and Breadcrumb schema', () => {
  assert.equal((betta.match(/application\/ld\+json/g) || []).length, 2);
  assert.match(betta, /"@type":"Product"/);
  assert.match(betta, /"@type":"BreadcrumbList"/);
  assert.match(betta, /"availability":"https:\/\/schema\.org\/InStock"/);
});
test('applies the discount the storefront applies', () => {
  assert.match(betta, /<span class="now">₹360<\/span>/);   // 450 less 20%
  assert.match(betta, /<s>₹450<\/s>/);
});
test('shows the product photo, not the category emoji', () => {
  assert.match(betta, /<img src="https:\/\/example\.test\/betta\.jpg"/);
  assert.match(betta, /<meta property="og:image" content="https:\/\/example\.test\/betta\.jpg"\/>/);
});
test('deep-links into the app at that product', () => {
  assert.match(betta, /href="\/\?p=p1"/);
});
test('links related products in the same category', () => {
  assert.match(betta, /More in Live Fish/);
  assert.match(betta, /href="\/p\/neon-tetra-pair"/);
});

const neon = productPage(cat.bySlug['neon-tetra-pair'], cat);
test('skips video media and takes the thumbnail when there is no full image', () => {
  assert.match(neon, /<meta property="og:image" content="https:\/\/example\.test\/neon-thumb\.jpg"\/>/);
  assert.ok(!neon.includes('clip.mp4'));
});
test('marks an out-of-stock product out of stock', () => {
  assert.match(neon, /"availability":"https:\/\/schema\.org\/OutOfStock"/);
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
  const hostile = { id: 'x', name: 'Betta <script>alert(1)</script>', category: 'Live Fish', price: 100, desc: 'a "quoted" & <b>bold</b> thing', media: [] };
  const html = productPage(hostile, { ...cat, slugMap: { ...cat.slugMap, x: 'betta-script' } });
  assert.ok(!html.includes('<script>alert(1)</script>'));
  assert.match(html, /&lt;script&gt;/);
  assert.ok(!html.includes('<b>bold</b>'));
});

console.log('catalogue page');
const index = catalogPage(cat);
test('lists every product, grouped by category', () => {
  ['betta-halfmoon-male', 'neon-tetra-pair', 'hob-filter-300l-h', 'tropical-flakes-100g', 'java-fern', 'java-fern-p6']
    .forEach((s) => assert.ok(index.includes(`href="/p/${s}"`), `missing /p/${s}`));
  assert.match(index, /id="live-fish"/);
  assert.match(index, /id="accessories"/);
});
test('carries an ItemList for the whole shop', () => {
  assert.match(index, /"@type":"ItemList"/);
  assert.equal((index.match(/"@type":"ListItem"/g) || []).length, 6);
});

console.log('sitemap');
const xml = sitemapXml(cat);
test('lists the home page, the shop and every product', () => {
  assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
  assert.equal((xml.match(/<url>/g) || []).length, 8);   // home + /p/ + 6 products
  assert.match(xml, /<loc>https:\/\/www\.nemoaquastore\.in\/p\/java-fern-p6<\/loc>/);
});
test('contains no product that left the catalogue', () => {
  assert.ok(!xml.includes('planted-led-light'));
});

console.log('not-found page');
test('is noindex and points at the shop', () => {
  const nf = notFoundPage('Nemo Aqua Store');
  assert.match(nf, /<meta name="robots" content="noindex,follow"\/>/);
  assert.match(nf, /href="\/p\/"/);
});

console.log(failures ? `\n${failures} failing` : '\nall passing');
process.exit(failures ? 1 : 0);
