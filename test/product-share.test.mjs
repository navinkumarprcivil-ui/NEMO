/**
 * The share button and the message it sends.
 *
 * Sharing is the one thing in the app a customer does on the store's behalf, and every part of
 * it is judged by a stranger who has never heard of the shop. So: an icon that reads as Share
 * rather than as a chain, and a message that looks like a person passing on a recommendation
 * rather than a listing pasted out of a catalogue.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync('app.jsx', 'utf8');

test('the share message leads with the product name, not an emoji', () => {
  assert.match(app, /const text=`\*\$\{p\.name\}\* — ₹\$\{price\}/,
    'the name carries WhatsApp bold and nothing sits in front of it');
  assert.doesNotMatch(app, /const text=`🐠/, 'no fish emoji before the product name');
});

test('the share sheet still appends the link itself', () => {
  // A URL in both `text` and `url` is why the message used to arrive with the link twice.
  assert.match(app, /navigator\.share\(\{title:`\$\{p\.name\} · \$\{STORE_NAME\} Aqua Store`, text, url\}\)/);
  assert.match(app, /const full=`\$\{text\}\\n\$\{url\}`;/,
    'the clipboard fallback is the one path that has to carry the link itself');
});

test('both share buttons draw the same arrow', () => {
  // A chain link reads as "copy link", or as nothing. The arrow leaving a tray is the icon
  // every phone already uses, and one app must not show two different ones for one action.
  // Scoped to the card: a chain is still the right glyph for "Track here" in a WhatsApp
  // message and for an admin reference link, which are links and not shares.
  assert.doesNotMatch(app, /aria-label="Share"[\s\S]{0,400}🔗/,
    'the chain emoji is gone from the product card');
  const arrows = app.match(/M12 15\.5V3\.5M8\.4 7L12 3\.4L15\.6 7/g) || [];
  assert.equal(arrows.length, 2, 'the card and the detail page both draw the share arrow');
});

test('the two policy pages people read when worried carry no emoji heading', () => {
  assert.match(app, /const POLICY_TITLE_BARE = \{ privacyPolicy:true, returnPolicy:true \};/);
  assert.match(app, /title=\{POLICY_TITLE_BARE\[meta\.key\]\?meta\.title:<>\{meta\.icon\} \{meta\.title\}<\/>\}/);
  // The chips under "More policies" keep theirs — six similar buttons need telling apart.
  assert.match(app, /<span>\{POLICY_META\[k\]\.icon\}<\/span>\{POLICY_META\[k\]\.title\}/);
});

test('a product page shows exactly one "what else?" rail', () => {
  // Cross-sell, frequently-bought and recently-viewed are three scrolling strips asking the
  // same question. Stacked they read as filler and push the reviews off the end of the page.
  assert.match(app, /function detailRail\(cross, fbt, recent\)\{/);
  assert.match(app, /if\(cross\.length\) return "cross";/,
    'items picked for this product outrank the generic ones');
  assert.match(app, /if\(fbt\.length>=2\) return "fbt";/);
  assert.match(app, /if\(recent\.length>=2\) return "recent";/,
    'a history rail knows nothing about the product and goes last');
  assert.match(app, /const rail\s+= detailRail\(crossSell,fbtList,recentList\);/);
});

test('each rail is gated on having won, not merely on having content', () => {
  assert.match(app, /if\(rail!=="cross"\) return null;/);
  assert.match(app, /\{rail==="fbt"&&<FrequentlyBought /);
  assert.match(app, /\{rail==="recent"&&<RecentlyViewedRail /);
  // The emptiness test has to be answerable about all three at once, so the lists live
  // outside the components that draw them.
  assert.match(app, /function fbtItems\(base, products=\[\]\)\{/);
  assert.match(app, /function recentlyViewedItems\(currentId, products=\[\]\)\{/);
});
