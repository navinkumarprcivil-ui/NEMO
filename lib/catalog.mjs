/**
 * The /p/ pages, rendered from the live catalogue.
 *
 * ── What this replaces ─────────────────────────────────────────────────────
 * These pages used to be static HTML written by `seo/generate.mjs`, a script
 * somebody had to remember to run and commit after every catalogue change. The
 * result was a shop window showing whatever stock existed on the day it was
 * last run: a product listed since then had no page and was absent from the
 * sitemap, and a deleted one kept a page and a sitemap entry that 404ed. The
 * chore was the bug — regenerating fixes today and goes stale again tomorrow.
 *
 * `api/share.js` already showed the shape of the fix: read the product from the
 * database when the request arrives. This module is that renderer, shared by
 * `api/product-page.js` (a product page and the catalogue index) and
 * `api/sitemap.js` (the sitemap). Every product is covered the moment it is
 * listed, and a removed one disappears from the sitemap on its own.
 *
 * The catalogue is world-readable (see database.rules.json) and product images
 * are public in Storage, so no credentials are involved and nothing rendered
 * here is anything a shopper could not already see.
 *
 * The markup, styling and schema.org blocks are carried over from the generator,
 * so the pages Google already indexed keep the same URLs, the same layout and
 * the same structured data. One thing did change on the way across: see `j()`
 * below for the JSON-LD escaping.
 */

export const BASE = 'https://www.nemoaquastore.in';
const DB = 'https://nemo-aqua-store-default-rtdb.asia-southeast1.firebasedatabase.app';
const STORE_FALLBACK = 'Nemo Aqua Store';
const AREAS_FALLBACK = 'Salem & Chennai';
const WA_FALLBACK = '+919360921030';

const CAT_META = {
  'Live Fish':   { emoji: '🐠', c1: '#0b6e72', c2: '#12b5bc' },
  'Plants':      { emoji: '🌿', c1: '#1a6b3c', c2: '#2da85f' },
  'Accessories': { emoji: '⚙️',  c1: '#1a3060', c2: '#2d52a8' },
  'Tanks':       { emoji: '🐋', c1: '#0a3050', c2: '#1a5080' },
  'Feed':        { emoji: '🥣', c1: '#7a3a00', c2: '#c46000' },
};
const CATORD = ['Live Fish', 'Plants', 'Tanks', 'Accessories', 'Feed'];

export const esc = (s) =>
  String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const slugify = (s) =>
  String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);

/**
 * A value for a <script type="application/ld+json"> block.
 *
 * JSON.stringify does not escape `<`, so a product named `x</script><script>…`
 * closed the schema block and everything after it ran as markup. The escapes
 * below are still valid JSON and decode to the same string, so Google reads what
 * it always read. (The generator this came from had the same hole; the only
 * thing writing product names is the admin panel, so it wanted finding rather
 * than fixing urgently.)
 */
const j = (v) => JSON.stringify(v == null ? '' : v).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');

/**
 * The live catalogue, in the order the pages present it, with the slug for each
 * product. Slugs are derived exactly as the generator derived them — same
 * `slugify`, same collision suffix, same sort beforehand — so the URLs Google
 * has already indexed still resolve.
 */
export async function loadCatalogue() {
  const [prodObj, settings] = await Promise.all([
    fetch(`${DB}/products.json`, { signal: AbortSignal.timeout(5000) }).then((r) => (r.ok ? r.json() : null)),
    fetch(`${DB}/settings.json`, { signal: AbortSignal.timeout(5000) }).then((r) => (r.ok ? r.json() : {})).catch(() => ({})),
  ]);

  const products = Object.values(prodObj || {}).filter((p) => p && p.id && p.name);
  products.sort((a, b) => (CATORD.indexOf(a.category) - CATORD.indexOf(b.category)) || (a.price - b.price));

  const slugMap = {}, bySlug = {}, used = {};
  products.forEach((p) => {
    let s = slugify(p.name) || p.id;
    if (used[s]) s = `${s}-${p.id}`;
    used[s] = 1;
    slugMap[p.id] = s;
    bySlug[s] = p;
  });

  return {
    products,
    slugMap,
    bySlug,
    STORE: (settings && settings.legalName) || STORE_FALLBACK,
    AREAS: (settings && settings.storeAddress) || AREAS_FALLBACK,
    WA: ((settings && settings.ownerWhatsapp) || WA_FALLBACK).replace(/[^0-9]/g, ''),
  };
}

/** The product's own photo, from the media the storefront already stores. */
export function photoOf(p) {
  const media = Array.isArray(p && p.media) ? p.media : [];
  for (const m of media) {
    if (!m || m.type === 'video') continue;
    if (m.url) return m.url;
    if (m.thumbUrl) return m.thumbUrl;
  }
  return '';
}
// Falls back to the store banner, which exists, rather than to a 404.
const ogFor = (p) => photoOf(p) || `${BASE}/assets/share-banner.jpg`;

const sell = (p) => Math.round(p.price * (1 - (p.discountPct || 0) / 100));

const stars = (r) => {
  r = r || 0;
  let h = '';
  for (let i = 1; i <= 5; i++) h += `<span style="color:${i <= Math.round(r) ? '#f5a623' : '#d9e2e2'}">★</span>`;
  return h;
};

const avail = (p) =>
  p.comingSoon ? 'https://schema.org/PreOrder' : (p.stockCount > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock');

const CSS = `*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Nunito',system-ui,sans-serif;color:#0a2426;background:#f4fbfb;-webkit-font-smoothing:antialiased}a{text-decoration:none;color:inherit}.wrap{max-width:760px;margin:0 auto;padding:0 16px}.top{display:flex;align-items:center;gap:10px;padding:14px 0}.top img{width:38px;height:38px;object-fit:contain}.top b{font-family:'Baloo 2';font-size:19px;color:#132740;letter-spacing:.3px}.crumb{font-size:12.5px;color:#5a8085;padding:6px 0 14px}.crumb a:hover{color:#132740;text-decoration:underline}.hero{border-radius:22px;overflow:hidden;box-shadow:0 10px 30px rgba(19,39,64,.14)}.hero-img{height:230px;display:flex;align-items:center;justify-content:center;position:relative}.hero-img span{font-size:120px;filter:drop-shadow(0 8px 18px rgba(0,0,0,.25))}.hero-img img{width:100%;height:100%;object-fit:cover;display:block}.pcard-img img{width:100%;height:100%;object-fit:cover;display:block}.hero-img em{position:absolute;top:14px;left:14px;background:rgba(255,255,255,.92);color:#132740;font-style:normal;font-weight:800;font-size:12px;padding:6px 12px;border-radius:100px;letter-spacing:.4px}.hero-b{background:#fff;padding:20px 20px 24px}.tag{display:inline-block;background:#eef2f7;color:#132740;font-weight:800;font-size:11.5px;padding:5px 11px;border-radius:100px;letter-spacing:.4px;margin-bottom:10px}h1{font-family:'Baloo 2';font-size:30px;line-height:1.12;margin-bottom:8px}.rate{font-size:15px;margin-bottom:14px;color:#5a8085}.rate b{color:#0a2426}.price{display:flex;align-items:baseline;gap:10px;margin-bottom:16px}.price .now{font-family:'Baloo 2';font-size:32px;color:#132740}.price s{color:#9bb3b4;font-size:18px;font-weight:600}.price .off{background:#fff1e9;color:#c4520d;font-weight:800;font-size:12px;padding:4px 9px;border-radius:8px}.desc{font-size:15.5px;line-height:1.66;color:#234;margin-bottom:18px;white-space:pre-line}.cta{display:block;text-align:center;background:linear-gradient(135deg,#f5821f,#e06f10);color:#fff;font-weight:800;font-size:16.5px;padding:16px;border-radius:15px;box-shadow:0 8px 20px rgba(19,39,64,.28);margin-bottom:10px}.cta:active{transform:scale(.99)}.cta2{display:block;text-align:center;background:#fff;border:1.6px solid #1fb24a;color:#1a8a3a;font-weight:800;font-size:15px;padding:13px;border-radius:14px;margin-bottom:18px}.feat{display:flex;gap:12px;background:#f0fdfa;border:1px solid #cdeee9;border-radius:14px;padding:13px 15px;margin-bottom:11px}.feat .ic{font-size:20px}.feat .t{font-weight:800;font-size:13.5px;color:#132740}.feat .s{font-size:12.5px;color:#3a5a5c;line-height:1.5}.sec-h{font-family:'Baloo 2';font-size:20px;margin:26px 0 14px}.grid{display:grid;grid-template-columns:repeat(2,1fr);gap:13px}.pcard{background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 14px rgba(19,39,64,.09);display:block;transition:transform .12s,box-shadow .12s}.pcard:active{transform:scale(.98)}.pcard-img{height:108px;display:flex;align-items:center;justify-content:center;position:relative}.pcard-img span{font-size:52px}.pcard-img .soon{position:absolute;top:8px;left:8px;background:rgba(255,255,255,.92);color:#132740;font-style:normal;font-weight:800;font-size:9.5px;padding:3px 8px;border-radius:100px}.pcard-b{padding:11px 12px 13px}.pcard-cat{font-size:10.5px;color:#7a9a9b;font-weight:700;text-transform:uppercase;letter-spacing:.5px}.pcard-name{font-weight:800;font-size:14px;margin:3px 0 5px;line-height:1.25}.pcard-price{font-family:'Baloo 2';color:#132740;font-size:16px}.pcard-price s{color:#b6c6c6;font-size:12px;font-weight:600}.foot{margin:34px 0 26px;padding-top:22px;border-top:1px solid #d9eaea;font-size:13px;color:#5a8085;text-align:center;line-height:1.9}.foot a{color:#132740;font-weight:700}.foot .row{margin-bottom:8px}.chips{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin-bottom:14px}.chips a{background:#eef2f7;color:#132740;font-weight:700;font-size:12.5px;padding:7px 13px;border-radius:100px}@media(min-width:620px){.grid{grid-template-columns:repeat(4,1fr)}.hero-img{height:280px}}`;

const head = (title, desc, canonical, ogImg, extraLd) => `<!doctype html><html lang="en"><head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${title}</title>
<meta name="description" content="${desc}"/>
<meta name="robots" content="index,follow"/>
<link rel="canonical" href="${canonical}"/>
<meta property="og:type" content="website"/>
<meta property="og:site_name" content="${esc(STORE_FALLBACK)}"/>
<meta property="og:title" content="${title}"/>
<meta property="og:description" content="${desc}"/>
<meta property="og:url" content="${canonical}"/>
<meta property="og:image" content="${ogImg}"/>
<meta name="twitter:card" content="summary_large_image"/>
<meta name="twitter:title" content="${title}"/>
<meta name="twitter:description" content="${desc}"/>
<meta name="twitter:image" content="${ogImg}"/>
<link rel="icon" href="/assets/nemo-logo.png"/>
<link rel="preconnect" href="https://fonts.googleapis.com"/><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
<link href="https://fonts.googleapis.com/css2?family=Baloo+2:wght@600;700;800&family=Nunito:wght@500;600;700;800&display=swap" rel="stylesheet"/>
${extraLd || ''}
<style>${CSS}</style>
</head>`;

const card = (p, slugMap) => {
  const m = CAT_META[p.category] || CAT_META['Live Fish'];
  const s = slugMap[p.id];
  const off = p.discountPct > 0;
  const photo = photoOf(p);
  return `<a class="pcard" href="/p/${s}"><div class="pcard-img" style="background:linear-gradient(135deg,${m.c1},${m.c2})">${photo ? `<img src="${esc(photo)}" alt="${esc(p.name)}" loading="lazy" decoding="async"/>` : `<span>${m.emoji}</span>`}${p.comingSoon ? '<em class="soon">Coming soon</em>' : ''}</div><div class="pcard-b"><div class="pcard-cat">${esc(p.category)}</div><div class="pcard-name">${esc(p.name)}</div><div class="pcard-price">₹${sell(p)}${off ? ` <s>₹${p.price}</s>` : ''}</div></div></a>`;
};

const metaDesc = (p, STORE) => {
  const clean = (p.desc || '').replace(/\s+/g, ' ').trim();
  const lead = `Buy ${p.name} online at ${STORE}. `;
  const tail = ` Free Live Arrival Guarantee · delivery across India.`;
  const budget = Math.max(0, 160 - lead.length - tail.length);
  let mid = clean;
  if (mid.length > budget) {
    mid = mid.slice(0, budget);
    const sp = mid.lastIndexOf(' ');
    if (sp > 40) mid = mid.slice(0, sp);
    mid = mid.replace(/[\s,.;:–-]+$/, '') + '…';
  }
  return esc(lead + mid + tail);
};

export function productPage(p, cat) {
  const { products, slugMap, STORE, AREAS, WA } = cat;
  const m = CAT_META[p.category] || CAT_META['Live Fish'];
  const s = slugMap[p.id];
  const off = p.discountPct > 0;
  const title = esc(`Buy ${p.name} Online | ${STORE}`);
  const desc = metaDesc(p, STORE);
  const canonical = `${BASE}/p/${s}`;
  const ogImg = ogFor(p);
  const photo = photoOf(p);
  const related = products.filter((x) => x.category === p.category && x.id !== p.id).slice(0, 4);
  const ratingLd = (p.reviewCount > 0 || p.reviews > 0)
    ? `,"aggregateRating":{"@type":"AggregateRating","ratingValue":"${p.ratingAvg || p.rating || 4.7}","reviewCount":"${p.reviewCount || p.reviews || 1}"}`
    : '';
  const productLd = `<script type="application/ld+json">{"@context":"https://schema.org","@type":"Product","name":${j(p.name)},"description":${j((p.desc || '').replace(/\s+/g, ' ').trim())},"category":${j(p.category)},"sku":${j(p.id)},"brand":{"@type":"Brand","name":${j(STORE)}},"image":${j(ogImg)},"offers":{"@type":"Offer","url":${j(canonical)},"priceCurrency":"INR","price":"${sell(p)}","availability":"${avail(p)}","seller":{"@type":"Organization","name":${j(STORE)}}}${ratingLd}}<\/script>`;
  const crumbLd = `<script type="application/ld+json">{"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[{"@type":"ListItem","position":1,"name":"Home","item":"${BASE}/"},{"@type":"ListItem","position":2,"name":"Shop","item":"${BASE}/p/"},{"@type":"ListItem","position":3,"name":${j(p.name)},"item":${j(canonical)}}]}<\/script>`;

  return head(title, desc, canonical, ogImg, productLd + crumbLd) + `<body>
<div class="wrap">
  <a class="top" href="/"><img src="/assets/nemo-logo.png" alt="${esc(STORE)}"/><b>NEMO AQUA STORE</b></a>
  <nav class="crumb"><a href="/">Home</a> › <a href="/p/">Shop</a> › <span>${esc(p.name)}</span></nav>
  <article class="hero">
    <div class="hero-img" style="background:linear-gradient(135deg,${m.c1},${m.c2})">${photo
      ? `<img src="${esc(photo)}" alt="${esc(p.name)}" loading="eager" decoding="async"/>`
      : `<span>${m.emoji}</span>`}${p.comingSoon ? '<em>Coming soon</em>' : ''}</div>
    <div class="hero-b">
      ${p.tag ? `<span class="tag">${esc(p.tag)}</span>` : ''}
      <h1>${esc(p.name)}</h1>
      <div class="rate">${stars(p.ratingAvg || p.rating)} <b>${p.ratingAvg || p.rating || 4.7}</b> · ${esc(p.category)}</div>
      <div class="price"><span class="now">₹${sell(p)}</span>${off ? `<s>₹${p.price}</s><span class="off">${p.discountPct}% OFF</span>` : ''}</div>
      <p class="desc">${esc(p.desc || '')}</p>
      <a class="cta" href="/?p=${p.id}">View &amp; Order in the Store →</a>
      <a class="cta2" href="https://wa.me/${WA}?text=${encodeURIComponent(`Hi! I'm interested in ${p.name} (${canonical})`)}">💬 Ask on WhatsApp</a>
      ${p.category === 'Live Fish' ? `<div class="feat"><span class="ic">🛡️</span><div><div class="t">Free Live Arrival Guarantee</div><div class="s">Shipped with covered packing and a one-time DOA guarantee — if approved, the customer chooses a refund or reward coins for the fish value.</div></div></div>` : ''}
      <div class="feat"><span class="ic">🚚</span><div><div class="t">Delivery across India</div><div class="s">Serving ${esc(AREAS)} and beyond. Packed personally with oxygen &amp; care for safe transit.</div></div></div>
    </div>
  </article>
  ${related.length ? `<h2 class="sec-h">More in ${esc(p.category)}</h2><div class="grid">${related.map((x) => card(x, slugMap)).join('')}</div>` : ''}
  <div class="foot">
    <div class="row"><a href="/p/">All Products</a> · <a href="/">Home</a> · <a href="/?p=${p.id}">Order Now</a></div>
    <div class="row">${esc(STORE)} · ${esc(AREAS)}</div>
    <div class="row" style="font-size:11.5px;color:#9bb3b4">Hand-picked aquarium fish, live plants, tanks &amp; accessories delivered with care.</div>
  </div>
</div>
</body></html>`;
}

export function catalogPage(cat) {
  const { products, slugMap, STORE, AREAS } = cat;
  const title = esc(`Buy Aquarium Fish, Plants & Accessories Online | ${STORE}`);
  const desc = esc(`Shop ${products.length}+ aquarium products at ${STORE} — buy betta, guppy, neon tetra, live plants, tanks, filters & fish food online. Free Live Arrival Guarantee, delivery across India.`);
  const canonical = `${BASE}/p/`;
  const byCat = {};
  products.forEach((p) => { (byCat[p.category] = byCat[p.category] || []).push(p); });
  const cats = CATORD.filter((c) => byCat[c]);
  const listLd = `<script type="application/ld+json">{"@context":"https://schema.org","@type":"ItemList","itemListElement":[${products.map((p, i) => `{"@type":"ListItem","position":${i + 1},"url":${j(`${BASE}/p/${slugMap[p.id]}`)},"name":${j(p.name)}}`).join(',')}]}<\/script>`;

  let body = `<body><div class="wrap">
  <a class="top" href="/"><img src="/assets/nemo-logo.png" alt="${esc(STORE)}"/><b>NEMO AQUA STORE</b></a>
  <nav class="crumb"><a href="/">Home</a> › <span>Shop</span></nav>
  <h1 style="font-family:'Baloo 2';font-size:27px;margin-bottom:6px">Buy Aquarium Fish, Plants &amp; Accessories Online</h1>
  <p style="font-size:14.5px;color:#5a8085;line-height:1.6;margin-bottom:16px">Hand-picked, healthy livestock and quality aquarium supplies from ${esc(STORE)} — delivered across India with a free Live Arrival Guarantee.</p>
  <div class="chips">${cats.map((c) => `<a href="#${slugify(c)}">${CAT_META[c].emoji} ${esc(c)}</a>`).join('')}</div>`;
  cats.forEach((c) => {
    body += `<h2 class="sec-h" id="${slugify(c)}">${CAT_META[c].emoji} ${esc(c)}</h2><div class="grid">${byCat[c].map((p) => card(p, slugMap)).join('')}</div>`;
  });
  body += `<div class="foot"><div class="row"><a href="/">Home</a> · <a href="/p/">All Products</a></div><div class="row">${esc(STORE)} · ${esc(AREAS)}</div></div></div></body></html>`;

  return head(title, desc, canonical, `${BASE}/assets/share-banner.png`, listLd) + body;
}

/**
 * A minimal page for a slug that isn't in the catalogue any more. It returns 404
 * so Google drops the URL rather than indexing an empty product, and it points
 * the person who followed the old link at the shop instead of a dead end.
 */
export function notFoundPage(STORE = STORE_FALLBACK) {
  return `<!doctype html><html lang="en"><head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Product not available | ${esc(STORE)}</title>
<meta name="robots" content="noindex,follow"/>
<link rel="icon" href="/assets/nemo-logo.png"/>
<style>${CSS}</style>
</head><body><div class="wrap">
  <a class="top" href="/"><img src="/assets/nemo-logo.png" alt="${esc(STORE)}"/><b>NEMO AQUA STORE</b></a>
  <h1 style="font-family:'Baloo 2';font-size:26px;margin:18px 0 8px">This product isn't listed any more</h1>
  <p style="font-size:15px;color:#5a8085;line-height:1.6;margin-bottom:18px">It may have sold out or been replaced. Everything currently in stock is on the shop page.</p>
  <a class="cta" href="/p/">Browse all products →</a>
</div></body></html>`;
}

/** Sitemap over the live catalogue — new products appear, removed ones drop out. */
export function sitemapXml(cat) {
  const { products, slugMap } = cat;
  const today = new Date().toISOString().slice(0, 10);
  const urls = [
    `<url><loc>${BASE}/</loc><changefreq>weekly</changefreq><priority>1.0</priority></url>`,
    `<url><loc>${BASE}/p/</loc><changefreq>weekly</changefreq><priority>0.9</priority></url>`,
    ...products.map((p) => `<url><loc>${BASE}/p/${slugMap[p.id]}</loc><lastmod>${today}</lastmod><changefreq>weekly</changefreq><priority>0.8</priority></url>`),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
}
