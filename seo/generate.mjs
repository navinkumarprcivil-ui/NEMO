#!/usr/bin/env node
/* ─────────────────────────────────────────────────────────────
   Nemo Aqua Store — SEO product-page generator
   Pulls your LIVE products from Firebase and writes static,
   Google-indexable pages into /p/ plus a fresh sitemap.xml.

   Run it whenever you add / rename / re-price products:
       node seo/generate.mjs
   then commit & push:
       git add p sitemap.xml && git commit -m "Refresh SEO pages" && git push

   Needs Node 18+ (uses built-in fetch). No npm install required.
   ───────────────────────────────────────────────────────────── */
import { writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const BASE = "https://www.nemoaquastore.in";
const FB   = "https://nemo-aqua-store-default-rtdb.asia-southeast1.firebasedatabase.app";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), ".."); // repo root (folder above /seo)

const CAT_META = {
  "Live Fish":   { emoji: "🐠", c1: "#0b6e72", c2: "#12b5bc" },
  "Plants":      { emoji: "🌿", c1: "#1a6b3c", c2: "#2da85f" },
  "Accessories": { emoji: "⚙️",  c1: "#1a3060", c2: "#2d52a8" },
  "Tanks":       { emoji: "🐋", c1: "#0a3050", c2: "#1a5080" },
  "Feed":        { emoji: "🥣", c1: "#7a3a00", c2: "#c46000" },
};
const CATORD = ["Live Fish", "Plants", "Tanks", "Accessories", "Feed"];

const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const slugify = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);

async function main() {
  const [prodObj, settings] = await Promise.all([
    fetch(FB + "/products.json").then((r) => r.json()),
    fetch(FB + "/settings.json").then((r) => r.json()).catch(() => ({})),
  ]);
  let products = Object.values(prodObj || {}).filter((p) => p && p.id && p.name);
  if (!products.length) { console.error("No products found in Firebase."); process.exit(1); }
  products.sort((a, b) => (CATORD.indexOf(a.category) - CATORD.indexOf(b.category)) || (a.price - b.price));

  const STORE = (settings && settings.legalName) || "Nemo Aqua Store";
  const AREAS = (settings && settings.storeAddress) || "Salem & Chennai";
  const WA = ((settings && settings.ownerWhatsapp) || "+919360921030").replace(/[^0-9]/g, "");

  const slugMap = {}, used = {};
  products.forEach((p) => { let s = slugify(p.name) || p.id; if (used[s]) s = s + "-" + p.id; used[s] = 1; slugMap[p.id] = s; });

  const sell = (p) => Math.round(p.price * (1 - (p.discountPct || 0) / 100));
  const stars = (r) => { r = r || 0; let h = ""; for (let i = 1; i <= 5; i++) h += `<span style="color:${i <= Math.round(r) ? "#f5a623" : "#d9e2e2"}">★</span>`; return h; };
  const metaDesc = (p) => { const clean = (p.desc || "").replace(/\s+/g, " ").trim(); const lead = `Buy ${p.name} online at ${STORE}. `; const tail = ` Free Live Arrival Guarantee · delivery across India.`; const budget = Math.max(0, 160 - lead.length - tail.length); let mid = clean; if (mid.length > budget) { mid = mid.slice(0, budget); const sp = mid.lastIndexOf(" "); if (sp > 40) mid = mid.slice(0, sp); mid = mid.replace(/[\s,.;:–-]+$/, "") + "…"; } return esc(lead + mid + tail); };
  const avail = (p) => p.comingSoon ? "https://schema.org/PreOrder" : (p.stockCount > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock");
  const ogFor = (p) => `${BASE}/p/og/${slugMap[p.id]}.jpg`; // generated separately; falls back gracefully if absent

  const CSS = `*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Nunito',system-ui,sans-serif;color:#0a2426;background:#f4fbfb;-webkit-font-smoothing:antialiased}a{text-decoration:none;color:inherit}.wrap{max-width:760px;margin:0 auto;padding:0 16px}.top{display:flex;align-items:center;gap:10px;padding:14px 0}.top img{width:38px;height:38px;object-fit:contain}.top b{font-family:'Baloo 2';font-size:19px;color:#0b6e72;letter-spacing:.3px}.crumb{font-size:12.5px;color:#5a8085;padding:6px 0 14px}.crumb a:hover{color:#0b6e72;text-decoration:underline}.hero{border-radius:22px;overflow:hidden;box-shadow:0 10px 30px rgba(11,110,114,.14)}.hero-img{height:230px;display:flex;align-items:center;justify-content:center;position:relative}.hero-img span{font-size:120px;filter:drop-shadow(0 8px 18px rgba(0,0,0,.25))}.hero-img em{position:absolute;top:14px;left:14px;background:rgba(255,255,255,.92);color:#0b6e72;font-style:normal;font-weight:800;font-size:12px;padding:6px 12px;border-radius:100px;letter-spacing:.4px}.hero-b{background:#fff;padding:20px 20px 24px}.tag{display:inline-block;background:#e6f7f7;color:#0b6e72;font-weight:800;font-size:11.5px;padding:5px 11px;border-radius:100px;letter-spacing:.4px;margin-bottom:10px}h1{font-family:'Baloo 2';font-size:30px;line-height:1.12;margin-bottom:8px}.rate{font-size:15px;margin-bottom:14px;color:#5a8085}.rate b{color:#0a2426}.price{display:flex;align-items:baseline;gap:10px;margin-bottom:16px}.price .now{font-family:'Baloo 2';font-size:32px;color:#0b6e72}.price s{color:#9bb3b4;font-size:18px;font-weight:600}.price .off{background:#fff1e9;color:#c4520d;font-weight:800;font-size:12px;padding:4px 9px;border-radius:8px}.desc{font-size:15.5px;line-height:1.66;color:#234;margin-bottom:18px;white-space:pre-line}.cta{display:block;text-align:center;background:linear-gradient(135deg,#0b8f96,#0b6e72);color:#fff;font-weight:800;font-size:16.5px;padding:16px;border-radius:15px;box-shadow:0 8px 20px rgba(11,110,114,.28);margin-bottom:10px}.cta:active{transform:scale(.99)}.cta2{display:block;text-align:center;background:#fff;border:1.6px solid #1fb24a;color:#1a8a3a;font-weight:800;font-size:15px;padding:13px;border-radius:14px;margin-bottom:18px}.feat{display:flex;gap:12px;background:#f0fdfa;border:1px solid #cdeee9;border-radius:14px;padding:13px 15px;margin-bottom:11px}.feat .ic{font-size:20px}.feat .t{font-weight:800;font-size:13.5px;color:#0b6e72}.feat .s{font-size:12.5px;color:#3a5a5c;line-height:1.5}.sec-h{font-family:'Baloo 2';font-size:20px;margin:26px 0 14px}.grid{display:grid;grid-template-columns:repeat(2,1fr);gap:13px}.pcard{background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 14px rgba(11,110,114,.09);display:block;transition:transform .12s,box-shadow .12s}.pcard:active{transform:scale(.98)}.pcard-img{height:108px;display:flex;align-items:center;justify-content:center;position:relative}.pcard-img span{font-size:52px}.pcard-img .soon{position:absolute;top:8px;left:8px;background:rgba(255,255,255,.92);color:#0b6e72;font-style:normal;font-weight:800;font-size:9.5px;padding:3px 8px;border-radius:100px}.pcard-b{padding:11px 12px 13px}.pcard-cat{font-size:10.5px;color:#7a9a9b;font-weight:700;text-transform:uppercase;letter-spacing:.5px}.pcard-name{font-weight:800;font-size:14px;margin:3px 0 5px;line-height:1.25}.pcard-price{font-family:'Baloo 2';color:#0b6e72;font-size:16px}.pcard-price s{color:#b6c6c6;font-size:12px;font-weight:600}.foot{margin:34px 0 26px;padding-top:22px;border-top:1px solid #d9eaea;font-size:13px;color:#5a8085;text-align:center;line-height:1.9}.foot a{color:#0b6e72;font-weight:700}.foot .row{margin-bottom:8px}.chips{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin-bottom:14px}.chips a{background:#e6f7f7;color:#0b6e72;font-weight:700;font-size:12.5px;padding:7px 13px;border-radius:100px}@media(min-width:620px){.grid{grid-template-columns:repeat(4,1fr)}.hero-img{height:280px}}`;

  const head = (title, desc, canonical, ogImg, extraLd) => `<!doctype html><html lang="en"><head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${title}</title>
<meta name="description" content="${desc}"/>
<meta name="robots" content="index,follow"/>
<link rel="canonical" href="${canonical}"/>
<meta property="og:type" content="website"/>
<meta property="og:site_name" content="${esc(STORE)}"/>
<meta property="og:title" content="${title}"/>
<meta property="og:description" content="${desc}"/>
<meta property="og:url" content="${canonical}"/>
<meta property="og:image" content="${ogImg}"/>
<meta name="twitter:card" content="summary_large_image"/>
<meta name="twitter:title" content="${title}"/>
<meta name="twitter:description" content="${desc}"/>
<meta name="twitter:image" content="${ogImg}"/>
<link rel="icon" href="../assets/nemo-logo.png"/>
<link rel="preconnect" href="https://fonts.googleapis.com"/><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
<link href="https://fonts.googleapis.com/css2?family=Baloo+2:wght@600;700;800&family=Nunito:wght@500;600;700;800&display=swap" rel="stylesheet"/>
${extraLd || ""}
<style>${CSS}</style>
</head>`;

  const card = (p) => { const m = CAT_META[p.category] || CAT_META["Live Fish"]; const s = slugMap[p.id]; const off = p.discountPct > 0; return `<a class="pcard" href="/p/${s}"><div class="pcard-img" style="background:linear-gradient(135deg,${m.c1},${m.c2})"><span>${m.emoji}</span>${p.comingSoon ? '<em class="soon">Coming soon</em>' : ""}</div><div class="pcard-b"><div class="pcard-cat">${esc(p.category)}</div><div class="pcard-name">${esc(p.name)}</div><div class="pcard-price">₹${sell(p)}${off ? ` <s>₹${p.price}</s>` : ""}</div></div></a>`; };

  function productPage(p) {
    const m = CAT_META[p.category] || CAT_META["Live Fish"]; const s = slugMap[p.id]; const off = p.discountPct > 0;
    const title = esc(`Buy ${p.name} Online | ${STORE}`); const desc = metaDesc(p);
    const canonical = `${BASE}/p/${s}`; const ogImg = ogFor(p);
    const related = products.filter((x) => x.category === p.category && x.id !== p.id).slice(0, 4);
    const ratingLd = (p.reviewCount > 0 || p.reviews > 0) ? `,"aggregateRating":{"@type":"AggregateRating","ratingValue":"${p.ratingAvg || p.rating || 4.7}","reviewCount":"${p.reviewCount || p.reviews || 1}"}` : "";
    const productLd = `<script type="application/ld+json">{"@context":"https://schema.org","@type":"Product","name":${JSON.stringify(p.name)},"description":${JSON.stringify((p.desc || "").replace(/\s+/g, " ").trim())},"category":${JSON.stringify(p.category)},"sku":"${p.id}","brand":{"@type":"Brand","name":${JSON.stringify(STORE)}},"image":"${ogImg}","offers":{"@type":"Offer","url":"${canonical}","priceCurrency":"INR","price":"${sell(p)}","availability":"${avail(p)}","seller":{"@type":"Organization","name":${JSON.stringify(STORE)}}}${ratingLd}}<\/script>`;
    const crumbLd = `<script type="application/ld+json">{"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[{"@type":"ListItem","position":1,"name":"Home","item":"${BASE}/"},{"@type":"ListItem","position":2,"name":"Shop","item":"${BASE}/p/"},{"@type":"ListItem","position":3,"name":${JSON.stringify(p.name)},"item":"${canonical}"}]}<\/script>`;
    return head(title, desc, canonical, ogImg, productLd + crumbLd) + `<body>
<div class="wrap">
  <a class="top" href="/"><img src="../assets/nemo-logo.png" alt="${esc(STORE)}"/><b>NEMO AQUA STORE</b></a>
  <nav class="crumb"><a href="/">Home</a> › <a href="/p/">Shop</a> › <span>${esc(p.name)}</span></nav>
  <article class="hero">
    <div class="hero-img" style="background:linear-gradient(135deg,${m.c1},${m.c2})"><span>${m.emoji}</span>${p.comingSoon ? "<em>Coming soon</em>" : ""}</div>
    <div class="hero-b">
      ${p.tag ? `<span class="tag">${esc(p.tag)}</span>` : ""}
      <h1>${esc(p.name)}</h1>
      <div class="rate">${stars(p.ratingAvg || p.rating)} <b>${p.ratingAvg || p.rating || 4.7}</b> · ${esc(p.category)}</div>
      <div class="price"><span class="now">₹${sell(p)}</span>${off ? `<s>₹${p.price}</s><span class="off">${p.discountPct}% OFF</span>` : ""}</div>
      <p class="desc">${esc(p.desc || "")}</p>
      <a class="cta" href="/?p=${p.id}">View &amp; Order in the Store →</a>
      <a class="cta2" href="https://wa.me/${WA}?text=${encodeURIComponent("Hi! I'm interested in " + p.name + " (" + canonical + ")")}">💬 Ask on WhatsApp</a>
      ${p.category === "Live Fish" ? `<div class="feat"><span class="ic">🛡️</span><div><div class="t">Free Live Arrival Guarantee</div><div class="s">Shipped on our Special / Fast &amp; Safe parcel with a one-time DOA cover — replacement, store credit or refund of the fish value.</div></div></div>` : ""}
      <div class="feat"><span class="ic">🚚</span><div><div class="t">Delivery across India</div><div class="s">Serving ${esc(AREAS)} and beyond. Packed personally with oxygen &amp; care for safe transit.</div></div></div>
    </div>
  </article>
  ${related.length ? `<h2 class="sec-h">More in ${esc(p.category)}</h2><div class="grid">${related.map(card).join("")}</div>` : ""}
  <div class="foot">
    <div class="row"><a href="/p/">All Products</a> · <a href="/">Home</a> · <a href="/?p=${p.id}">Order Now</a></div>
    <div class="row">${esc(STORE)} · ${esc(AREAS)}</div>
    <div class="row" style="font-size:11.5px;color:#9bb3b4">Hand-picked aquarium fish, live plants, tanks &amp; accessories delivered with care.</div>
  </div>
</div>
</body></html>`;
  }

  function catalogPage() {
    const title = esc(`Buy Aquarium Fish, Plants & Accessories Online | ${STORE}`);
    const desc = esc(`Shop ${products.length}+ aquarium products at ${STORE} — buy betta, guppy, neon tetra, live plants, tanks, filters & fish food online. Free Live Arrival Guarantee, delivery across India.`);
    const canonical = `${BASE}/p/`;
    const byCat = {}; products.forEach((p) => { (byCat[p.category] = byCat[p.category] || []).push(p); });
    const cats = CATORD.filter((c) => byCat[c]);
    const listLd = `<script type="application/ld+json">{"@context":"https://schema.org","@type":"ItemList","itemListElement":[${products.map((p, i) => `{"@type":"ListItem","position":${i + 1},"url":"${BASE}/p/${slugMap[p.id]}","name":${JSON.stringify(p.name)}}`).join(",")}]}<\/script>`;
    let body = `<body><div class="wrap">
  <a class="top" href="/"><img src="../assets/nemo-logo.png" alt="${esc(STORE)}"/><b>NEMO AQUA STORE</b></a>
  <nav class="crumb"><a href="/">Home</a> › <span>Shop</span></nav>
  <h1 style="font-family:'Baloo 2';font-size:27px;margin-bottom:6px">Buy Aquarium Fish, Plants &amp; Accessories Online</h1>
  <p style="font-size:14.5px;color:#5a8085;line-height:1.6;margin-bottom:16px">Hand-picked, healthy livestock and quality aquarium supplies from ${esc(STORE)} — delivered across India with a free Live Arrival Guarantee.</p>
  <div class="chips">${cats.map((c) => `<a href="#${slugify(c)}">${CAT_META[c].emoji} ${esc(c)}</a>`).join("")}</div>`;
    cats.forEach((c) => { body += `<h2 class="sec-h" id="${slugify(c)}">${CAT_META[c].emoji} ${esc(c)}</h2><div class="grid">${byCat[c].map(card).join("")}</div>`; });
    body += `<div class="foot"><div class="row"><a href="/">Home</a> · <a href="/p/">All Products</a></div><div class="row">${esc(STORE)} · ${esc(AREAS)}</div></div></div></body></html>`;
    return head(title, desc, canonical, `${BASE}/assets/share-banner.png`, listLd) + body;
  }

  function sitemap() {
    const today = new Date().toISOString().slice(0, 10);
    const urls = [
      `<url><loc>${BASE}/</loc><changefreq>weekly</changefreq><priority>1.0</priority></url>`,
      `<url><loc>${BASE}/p/</loc><changefreq>weekly</changefreq><priority>0.9</priority></url>`,
      ...products.map((p) => `<url><loc>${BASE}/p/${slugMap[p.id]}</loc><lastmod>${today}</lastmod><changefreq>weekly</changefreq><priority>0.8</priority></url>`),
    ];
    return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`;
  }

  await mkdir(resolve(ROOT, "p/og"), { recursive: true });
  for (const p of products) await writeFile(resolve(ROOT, `p/${slugMap[p.id]}.html`), productPage(p));
  await writeFile(resolve(ROOT, "p/index.html"), catalogPage());
  await writeFile(resolve(ROOT, "sitemap.xml"), sitemap());
  console.log(`✓ Generated ${products.length} product pages + catalog + sitemap.`);
  console.log("  Pages:", products.map((p) => "/p/" + slugMap[p.id]).join(", "));
  console.log("\nNote: per-product share images live in /p/og/<slug>.jpg.");
  console.log("New products reuse the category style; if you want a custom share image for a brand-new product, ask Claude to regenerate them.");
  console.log("\nNext: git add p sitemap.xml && git commit -m \"Refresh SEO pages\" && git push");
}

main().catch((e) => { console.error("Generator failed:", e); process.exit(1); });
