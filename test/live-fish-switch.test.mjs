/**
 * The live-fish master switch.
 *
 *   node test/live-fish-switch.test.mjs
 *
 * Live fish are hidden behind one flag, `LIVE_FISH_ENABLED`, so that they can be brought
 * back in a month by flipping it rather than by re-doing the removal in reverse. That only
 * works if the flag is genuinely the single control, so this suite guards the three ways it
 * could quietly stop being one:
 *
 *   1. Drift — the flag is declared in three files (app.jsx, its src/ mirror, and
 *      lib/catalog.mjs for the server-rendered /p/ pages and sitemap). If they disagree, the
 *      storefront and Google see different shops. Restoring must be all three or none.
 *   2. A stale build — `app.js` is a committed build artifact and `index.html` loads it on the
 *      fast path. Editing app.jsx without running `node scripts/build.mjs` changes nothing the
 *      site serves and nothing detects it, so the built bundle's flag is checked here too.
 *   3. A missed surface — the gates that actually hide the fish (the filtered product list on
 *      every shopping surface, the DOA entry point, the checkout live-fish half) are asserted
 *      to still be wired up.
 *
 * Every assertion holds in BOTH states of the flag, so turning live fish back on does not
 * turn this suite red. See docs/LIVE_FISH_BACKOUT.md.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

let failures = 0;
const test = (name, fn) => {
  try { fn(); console.log(`  ✓ ${name}`); }
  catch (e) { failures++; console.error(`  ✗ ${name}\n    ${e.message}`); }
};

/** The flag as written in source. */
function switchInSource(src, file) {
  const m = src.match(/(?:export\s+)?const LIVE_FISH_ENABLED\s*=\s*(true|false)\s*;/);
  assert.ok(m, `${file}: no "const LIVE_FISH_ENABLED = true|false;" declaration found`);
  return m[1] === 'true';
}
/** The flag as it survives esbuild's minifier: `LIVE_FISH_ENABLED=!1` is false. */
function switchInBundle(src, file) {
  const m = src.match(/LIVE_FISH_ENABLED\s*=\s*(!0|!1|true|false)\s*[,;]/);
  assert.ok(m, `${file}: no LIVE_FISH_ENABLED assignment found — did the build inline it away?`);
  return m[1] === '!0' || m[1] === 'true';
}

const appJsx = read('app.jsx');
const srcJsx = read('src/app.jsx');
const catalog = read('lib/catalog.mjs');
const appJs = read('app.js');
const indexHtml = read('index.html');

const ENABLED = switchInSource(appJsx, 'app.jsx');

console.log(`live fish switch — LIVE_FISH_ENABLED = ${ENABLED}`);

console.log('the flag is one flag');
test('app.jsx and src/app.jsx agree', () => {
  assert.equal(switchInSource(srcJsx, 'src/app.jsx'), ENABLED,
    'src/app.jsx must carry the same LIVE_FISH_ENABLED as app.jsx — the two files are kept in sync');
});
test('lib/catalog.mjs agrees, so /p/ pages and the sitemap match the storefront', () => {
  assert.equal(switchInSource(catalog, 'lib/catalog.mjs'), ENABLED,
    'lib/catalog.mjs renders the product pages and sitemap; leaving it out of step would keep live fish in Google');
});
test('the committed app.js build agrees — catches a stale build', () => {
  assert.equal(switchInBundle(appJs, 'app.js'), ENABLED,
    'app.js is stale: run `node scripts/build.mjs` after changing app.jsx, or the site keeps serving the old switch');
});

/* Copy that only makes sense if the store sells live animals. A "fish tank" or "fish food" is
   dry goods and stays, so this looks for the selling claims, not for the word "fish". */
const SELLING_COPY = [
  /live arrival guarantee/i,
  /dead[- ]on[- ]arrival/i,
  /\blivestock\b/i,
  /aquarium fish/i,
  /buy[^.<]{0,40}fish online/i,
];
/* The head and the noscript block — what a crawler and a payment reviewer read. The decorative
   canvas below them animates a betta and a clownfish; that is branding for an aquarium shop,
   not a product listing, and it deliberately stays. */
const indexSeo = indexHtml.slice(0, indexHtml.indexOf('</noscript>') + 11);

console.log('SEO copy in index.html');
test('carries live-fish selling copy only while the switch is on', () => {
  for (const re of SELLING_COPY) {
    const hit = re.test(indexSeo);
    if (!ENABLED) assert.ok(!hit, `index.html still advertises live fish: ${re}`);
  }
  // Whatever the flag, the shell must still describe the shop.
  assert.match(indexSeo, /<meta name="description" content="[^"]{40,}"/);
});

console.log('the gates are wired up');
test('every shopping surface reads the filtered product list', () => {
  // `shopProducts` is `products` minus the hidden categories. Order history is in this list
  // too: it renders a past order from the order's own `o.items` snapshot, and only consults
  // the catalogue to decide whether to offer "buy again", a tap-through to the product page
  // or a review prompt — none of which may resurface a hidden product. Admin is the one
  // surface that keeps the complete list, asserted the other way below.
  for (const tag of ['HomePage', 'ShopPage', 'DetailPage', 'CartPage', 'CheckoutPage', 'SavedPage', 'MiniCart', 'OrderHistoryPage']) {
    // JSX props hold arrow functions, so a ">" is not a reliable tag terminator — scan a
    // bounded window from the tag instead.
    const m = appJsx.match(new RegExp(`<${tag}\\s[\\s\\S]{0,900}?products=\\{(\\w+)\\}`));
    assert.ok(m, `${tag} is not passed a products prop any more — re-check the live-fish gate`);
    assert.equal(m[1], 'shopProducts', `${tag} must shop from shopProducts, not the unfiltered list`);
  }
});
test('admin keeps the complete catalogue', () => {
  // The owner still manages the hidden Live Fish products, and Admin is where a past order's
  // fish line items, DOA claim and refund are reviewed and resolved. Both need every product.
  for (const tag of ['AdminHub']) {
    const m = appJsx.match(new RegExp(`<${tag}\\s[\\s\\S]{0,900}?products=\\{(\\w+)\\}`));
    assert.ok(m, `${tag} is not passed a products prop any more`);
    assert.equal(m[1], 'products', `${tag} must keep the unfiltered list so past orders still render`);
  }
});
test('shopProducts is declared before anything reads it', () => {
  // A React dependency array is evaluated during render, at the point the useEffect call
  // appears — so a `[products, shopProducts]` above the `const shopProducts = useMemo(...)`
  // is a temporal-dead-zone ReferenceError that crashes the app on first paint. Nothing in a
  // source-level suite or in the build's parse check catches that, so it is asserted here.
  const decl = appJsx.indexOf('const shopProducts=useMemo(');
  assert.ok(decl > 0, 'shopProducts memo not found');
  const firstUse = appJsx.indexOf('shopProducts');
  assert.equal(firstUse, decl + 'const '.length,
    'shopProducts is read before it is declared — hoist the memo above its first use');
});
test('the cart drops hidden items before the first render', () => {
  assert.match(appJsx, /useState\(\(\)=>\{ try\{ return shoppable\(JSON\.parse\(localStorage\.getItem\("nemo-cart"\)/,
    'a basket saved before the switch was flipped must be filtered on load');
});
test('the DOA claim entry point is gated by the switch', () => {
  const fn = appJsx.slice(appJsx.indexOf('function doaEntryOpen('));
  assert.match(fn.slice(0, 600), /if\(!LIVE_FISH_ENABLED\) return false;/,
    'doaEntryOpen must refuse new claims while the switch is off (existing claims still render)');
});
test('the checkout live-fish half is gated by the switch', () => {
  assert.match(appJsx, /const hasLiveFish=LIVE_FISH_ENABLED && cart\.some/,
    'checkout must not price live-fish shipping or the guarantee while the switch is off');
});
test('the storefront category list is derived from the switch', () => {
  assert.match(appJsx, /const SHOP_CATEGORIES = LIVE_FISH_ENABLED \? CATEGORIES : CATEGORIES\.filter/);
  assert.match(appJsx, /const list=all\?\["All",\.\.\.SHOP_CATEGORIES\]:SHOP_CATEGORIES;/,
    'the category chips must use SHOP_CATEGORIES');
});
test('the server catalogue filters the hidden category at its single source', () => {
  assert.match(catalog, /\.filter\(\(p\) => LIVE_FISH_ENABLED \|\| p\.category !== LIVE_FISH_CATEGORY\)/,
    'loadCatalogue feeds the product pages, the shop index and the sitemap alike');
});
test('policy pages that describe shipping live animals follow the switch', () => {
  assert.match(appJsx, /const HIDDEN_POLICY_ROUTES = LIVE_FISH_ENABLED \? \[\] : \["policy-guarantee","policy-acclimatize"\]/);
  assert.match(appJsx, /const POLICY_META = LIVE_FISH_ENABLED \? POLICY_META_ALL/);
});
test('the owner\'s saved policy text is never rewritten, only rendered around', () => {
  // The live-fish wording lives in Firebase and has to come back verbatim, so the switch
  // must not reach normalizeSettings — whose result is what Admin saves back.
  const norm = appJsx.slice(appJsx.indexOf('function normalizeSettings('));
  const body = norm.slice(0, norm.indexOf('\n}'));
  assert.ok(!body.includes('LIVE_FISH_ENABLED'),
    'normalizeSettings must stay switch-free: its result is saved back, so sanitising there would overwrite the owner\'s policies in Firebase');
});

console.log(failures ? `\n${failures} failing` : '\nall passing');
process.exit(failures ? 1 : 0);
