/**
 * The live-fish master switch.
 *
 *   node --test test/live-fish-switch.test.mjs
 *
 * Live fish are hidden behind one setting, `settings.liveFishEnabled`, set from Admin →
 * Settings → Store, so the owner can bring them back without a deploy. That only works if the
 * setting is genuinely the single control, so this suite guards the ways it could quietly stop
 * being one:
 *
 *   1. A second copy of the answer. The switch used to be a constant declared in app.jsx, its
 *      src/ mirror and lib/catalog.mjs, kept in step by this file. Any constant like that
 *      coming back means the storefront and Google can show different shops again.
 *   2. Reading it too late. The client seeds it from the cached settings blob at module load
 *      and updates it in the settings SETTER, before the render that follows — not in an
 *      effect afterwards, which would leave the storefront a render behind. The server
 *      refreshes it in loadStoreSettings(), which every render path calls first.
 *   3. A derived value frozen at load. Anything computed once from the switch at script load
 *      (the category list, the policy map) is wrong for the whole session of anyone who
 *      arrives just after the owner flips it — the case the switch exists for.
 *   4. A missed surface. The gates that actually hide the fish are asserted to still be wired.
 *
 * Every assertion holds in BOTH states of the switch. See docs/LIVE_FISH_BACKOUT.md.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

const appJsx = read('app.jsx');
const srcJsx = read('src/app.jsx');
const catalog = read('lib/catalog.mjs');
const share = read('api/share.js');
const appJs = read('app.js');
const indexHtml = read('index.html');

test('the switch is a setting, not a constant compiled into the build', () => {
  for (const [label, src] of [['app.jsx', appJsx], ['src/app.jsx', srcJsx], ['lib/catalog.mjs', catalog]]) {
    assert.ok(!/(?:export\s+)?const LIVE_FISH_ENABLED\s*=/.test(src),
      `${label} pins LIVE_FISH_ENABLED to a constant — the owner can no longer change it from Admin`);
  }
  assert.match(appJsx, /let LIVE_FISH_ENABLED = readCachedLiveFishSwitch\(\);/);
  assert.match(catalog, /export let LIVE_FISH_ENABLED = false;/);
  assert.match(appJsx, /liveFishEnabled: false,/, 'the setting needs a default in DEFAULT_SETTINGS');
});

test('the built bundle carries the runtime switch, not an inlined answer', () => {
  // app.js is a committed build artifact that index.html loads on the fast path, so a stale
  // build would keep serving the old, hard-wired behaviour with nothing to detect it.
  assert.match(appJs, /readCachedLiveFishSwitch/,
    'app.js is stale: run `node scripts/build.mjs` after changing app.jsx');
  assert.match(appJs, /liveFishEnabled/);
});

test('the client knows the answer before its first render', () => {
  // Seeded synchronously from the cached settings blob, so a returning visitor is right from
  // the first line of the app; a first-ever visitor gets the default, behind the splash.
  assert.match(appJsx, /function readCachedLiveFishSwitch\(\)\{[\s\S]{0,400}localStorage\.getItem\("nemo-settings"\)/);
  // Applied in the setter — before the render that follows — not in an effect after it.
  assert.match(appJsx, /const setSettings = \(next\) => \{ applyLiveFishSwitch\(next\); setSettingsState\(next\); \};/);
  assert.ok(!/const \[settings,setSettings\]/.test(appJsx),
    'a raw setSettings would bypass applyLiveFishSwitch');
});

test('the server refreshes the switch before it renders anything', () => {
  assert.match(catalog, /export async function loadStoreSettings\(\)/);
  assert.match(catalog, /LIVE_FISH_ENABLED = settings\.liveFishEnabled === true;/);
  // loadCatalogue feeds the product pages, the shop index and the sitemap alike.
  assert.match(catalog, /loadStoreSettings\(\),/);
  assert.match(catalog, /\.filter\(\(p\) => LIVE_FISH_ENABLED \|\| p\.category !== LIVE_FISH_CATEGORY\)/);
  // Share previews render without loadCatalogue, so they load the settings themselves — and
  // must do it on BOTH paths, or a bare /s/ link reads whatever the last request in the
  // isolate happened to leave behind.
  assert.match(share, /const settingsLoaded = loadStoreSettings\(\)\.catch/);
  assert.match(share, /await settingsLoaded; \/\/ the site-level card below reads the switch as well/);
});

test('an unreachable database fails closed, never open', () => {
  // Advertising live animals for a shop that has switched them off is the failure the switch
  // exists to prevent; a fish-free page for a shop that does sell them is recoverable.
  assert.match(catalog, /\.catch\(\(\) => \(\{\}\)\) \|\| \{\};/);
  assert.match(appJsx, /const next=!!\(settings&&settings\.liveFishEnabled===true\);/);
  assert.match(appJsx, /\}catch\(e\)\{\}\n  return false;\n\}/, 'readCachedLiveFishSwitch must default to false');
});

test('values derived from the switch are computed per call, not once at load', () => {
  for (const [label, src] of [['app.jsx', appJsx], ['src/app.jsx', srcJsx]]) {
    assert.match(src, /const shopCategories = \(\) => LIVE_FISH_ENABLED \? CATEGORIES : CATEGORIES\.filter/,
      `${label}: the category list must be a function`);
    assert.match(src, /const hiddenPolicyRoutes = \(\) => LIVE_FISH_ENABLED \? \[\]/,
      `${label}: the hidden policy routes must be a function`);
    assert.match(src, /const policyMeta = \(\) => LIVE_FISH_ENABLED \? POLICY_META_ALL/,
      `${label}: the policy map must be a function`);
    assert.ok(!/const SHOP_CATEGORIES\s*=/.test(src), `${label} froze SHOP_CATEGORIES at load`);
    assert.ok(!/const HIDDEN_POLICY_ROUTES\s*=/.test(src), `${label} froze HIDDEN_POLICY_ROUTES at load`);
  }
});

/* Copy that only makes sense if the store sells live animals. A "fish tank" or "fish food" is
   dry goods and stays, so this looks for the selling claims, not for the word "fish". The head
   and noscript block are static — a crawler reads them before any script runs — so they cannot
   follow a database setting, and restoring live fish means restoring this copy by hand. */
test('the static SEO shell still describes the shop', () => {
  const indexSeo = indexHtml.slice(0, indexHtml.indexOf('</noscript>') + 11);
  assert.match(indexSeo, /<meta name="description" content="[^"]{40,}"/);
});

test('every shopping surface reads the filtered product list', () => {
  // `shopProducts` is `products` minus the hidden categories. Order history is in this list
  // too: it renders a past order from the order's own `o.items` snapshot, and only consults
  // the catalogue to decide whether to offer "buy again", a tap-through to the product page
  // or a review prompt — none of which may resurface a hidden product.
  for (const tag of ['HomePage', 'ShopPage', 'DetailPage', 'CartPage', 'CheckoutPage', 'SavedPage', 'MiniCart', 'OrderHistoryPage']) {
    const m = appJsx.match(new RegExp(`<${tag}\\s[\\s\\S]{0,900}?products=\\{(\\w+)\\}`));
    assert.ok(m, `${tag} is not passed a products prop any more — re-check the live-fish gate`);
    assert.equal(m[1], 'shopProducts', `${tag} must shop from shopProducts, not the unfiltered list`);
  }
});

test('admin keeps the complete catalogue', () => {
  // The owner still manages the hidden Live Fish products, and Admin is where a past order's
  // fish line items, DOA claim and refund are reviewed and resolved. Both need every product.
  const m = appJsx.match(/<AdminHub\s[\s\S]{0,900}?products=\{(\w+)\}/);
  assert.ok(m, 'AdminHub is not passed a products prop any more');
  assert.equal(m[1], 'products', 'AdminHub must keep the unfiltered list so past orders still render');
});

test('shopProducts is declared before anything reads it', () => {
  // A React dependency array is evaluated during render, at the point the useEffect call
  // appears — so a `[products, shopProducts]` above the `const shopProducts = useMemo(...)`
  // is a temporal-dead-zone ReferenceError that crashes the app on first paint.
  const decl = appJsx.indexOf('const shopProducts=useMemo(');
  assert.ok(decl > 0, 'shopProducts memo not found');
  assert.equal(appJsx.indexOf('shopProducts'), decl + 'const '.length,
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

test('the category chips render from the derived list', () => {
  assert.match(appJsx, /const list=all\?\["All",\.\.\.cats\]:cats;/);
  assert.match(appJsx, /const cats=shopCategories\(\);/);
});

test("the owner's saved policy text is never rewritten, only rendered around", () => {
  // The live-fish wording lives in Firebase and has to come back verbatim, so the switch
  // must not reach normalizeSettings — whose result is what Admin saves back.
  const norm = appJsx.slice(appJsx.indexOf('function normalizeSettings('));
  const body = norm.slice(0, norm.indexOf('\n}'));
  assert.ok(!body.includes('LIVE_FISH_ENABLED'),
    'normalizeSettings must stay switch-free: its result is saved back, so sanitising there would overwrite the owner\'s policies in Firebase');
});

test('the owner has somewhere to flip it', () => {
  assert.match(appJsx, /onChange=\{e=>set\("liveFishEnabled",e\.target\.checked\)\}/);
  assert.match(appJsx, /Sell live fish/);
});
