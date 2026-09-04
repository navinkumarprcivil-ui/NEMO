/**
 * The second round of store-owner corrections.
 *
 * Each of these was reported from the live site or the installed app, and each one has a way of
 * creeping back: a text glyph is the easiest arrow to type, a coupon code is the obvious thing
 * to put on a coupon nudge, and a settings box is easy to add twice when the same number is
 * relevant in two panels.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../app.jsx', import.meta.url), 'utf8');

test('every back control uses the shared arrow, not a text character', () => {
  assert.match(src, /function BackArrow\(\{size=20,stroke=2\.6\}\)/);
  // "←" set in the page font is a hairline beside 800-weight headings, and it scaled with each
  // button's own fontSize, so the same control was a different size on every screen.
  const arrowButtons = src.match(/>←<\/button>/g) || [];
  assert.equal(arrowButtons.length, 1, 'only the admin image-reorder control may keep a text arrow');
  const [reorder] = src.split('\n').filter(l => l.includes('>←</button>'));
  assert.match(reorder, /moveImage/, 'that one means "move this picture left", not "go back"');
  assert.doesNotMatch(src, /}}>← /, 'no inline text arrows either');
});

test('the shared arrow is defined outside the lazily-loaded Admin chunk', () => {
  // Admin pages use it too, and admin.js is a separate script loaded later — a definition that
  // landed inside the split would be missing from the app that renders first.
  const arrowAt = src.indexOf('function BackArrow(');
  const adminAt = src.indexOf('/* ═══════════════════ ADMIN LOGIN');
  assert.ok(arrowAt > -1 && adminAt > -1);
  assert.ok(arrowAt < adminAt, 'BackArrow must live in the main chunk');
});

test('the cart nudge does not print the coupon code', () => {
  // The class name appears in the stylesheet first; the markup is the second occurrence.
  const barAt = src.indexOf('className="press floating-cart-bar"');
  const bar = src.slice(barAt, src.indexOf('</button>', barAt));
  assert.match(bar, /more to get <b>\{dc\.off\}<\/b><\/>/);
  assert.doesNotMatch(bar, /\{dc\.code\}/, 'the code belongs at checkout, not on a spend nudge');
});

test('the overall discount cap has exactly one control', () => {
  // The same maxDiscountPct was editable from "How discounts combine" AND from Customer Wallet,
  // so the two boxes could disagree until a reload and neither said which had won.
  const inputs = src.match(/set\("maxDiscountPct"/g) || [];
  assert.equal(inputs.length, 1);
  assert.match(src, /Max total discount % of subtotal/);
});

test('the Care Guides header puts back, title and switch on one row', () => {
  const page = src.slice(src.indexOf('function CareGuidesPage('), src.indexOf('/* ═══════════════════ SAVED ITEMS PAGE'));
  // It uses the shared banner rather than a sixth hand-rolled copy of it.
  assert.match(page, /<HeroHeader onBack=\{goBack\} title="Care Guides" right=\{<GuideNotifBtn\/>\}\/>/);
  assert.doesNotMatch(page, /className="vh-head"/, 'no bespoke header left on this page');
});

/* One banner for every secondary page. Five hand-rolled copies had drifted to two title sizes,
   two circle sizes and opacities, three bottom paddings and a 36px back button — none of it
   visible on one screen, all of it visible moving between them. */
test('every coloured page banner is the shared component', () => {
  const heroPages = src.match(/<HeroHeader /g) || [];
  assert.ok(heroPages.length >= 5, `expected every page migrated, found ${heroPages.length}`);
  // The gradient banner markup must not reappear inline anywhere.
  assert.doesNotMatch(src, /className="vh-head" style=\{\{background:`linear-gradient\(150deg/);
  // The back control meets the 44px a thumb can reliably hit.
  const hero = src.slice(src.indexOf('function HeroHeader('), src.indexOf('/* ═══════════════════ RESTOCK ALERT BUTTON'));
  assert.match(hero, /width:44,height:44/);
  assert.match(hero, /aria-label="Back"/);
});

/* The export grew columns for refunds, the gateway and test payments. The dashboard is what the
   owner actually looks at, so it has to be reconcilable against those same rows. */
test('the sales dashboard counts paid orders the way the export does', () => {
  const dash = src.slice(src.indexOf('function AdminSalesDashboard('), src.indexOf('/* ═══════════════════ ADMIN BEHAVIOUR INSIGHTS'));
  assert.match(dash, /orders\.filter\(o=>paymentSucceeded\(o\)&&!o\.testPayment\)/);
  // The local rule it replaced read paidAt as proof of payment and trusted a fulfilment status
  // over an explicit paymentStatus, both of which overstated revenue.
  assert.doesNotMatch(dash, /\|\|!!o\.paidAt\)/);
  assert.doesNotMatch(dash, /const isPaid=/);
});

test('the sales dashboard reports money that went back out', () => {
  const dash = src.slice(src.indexOf('function AdminSalesDashboard('), src.indexOf('/* ═══════════════════ ADMIN BEHAVIOUR INSIGHTS'));
  assert.match(dash, /Number\(o\.refundedAmount\)\|\|0/);
  assert.match(dash, /net:gross-refunded/);
  assert.match(dash, /o\.refund\.status!=="refunded"/);
  assert.match(dash, /refund\{d\.owedRefundCount!==1\?"s":""\} owed/);
});

test('the sales dashboard splits takings by gateway and quarantines test payments', () => {
  const dash = src.slice(src.indexOf('function AdminSalesDashboard('), src.indexOf('/* ═══════════════════ ADMIN BEHAVIOUR INSIGHTS'));
  assert.match(dash, /COLLECTED BY GATEWAY/);
  assert.match(dash, /o\.gateway\?gatewayLabel\(o\.gateway\):"Not recorded"/);
  assert.match(dash, /test payment\{d\.testCount!==1\?"s":""\} excluded/);
});

test('Admin forms use one field-label style', () => {
  // Three styles shared one scrolling column: 12px uppercase with wide tracking, 10.5px
  // uppercase with narrow tracking, and 11px sentence case. Uppercase also shouts the labels
  // that are a whole phrase.
  assert.match(src, /const ADMIN_LABEL=\{fontSize:11,fontWeight:800,color:C\.textSub/);
  const adminStart = src.indexOf('/* ═══════════════════ ADMIN LOGIN');
  const adminEnd = src.indexOf('/* ═══════════════════ CARE GUIDES PAGE');
  const admin = src.slice(adminStart, adminEnd);
  assert.doesNotMatch(admin, /textTransform:"uppercase",letterSpacing:\.8,marginBottom:6\}\}>\{label\}/);
  assert.doesNotMatch(admin, /fontSize:10\.5,fontWeight:700,color:C\.textSub,textTransform:"uppercase"/);
  assert.ok((admin.match(/style=\{ADMIN_LABEL\}/g) || []).length >= 20, 'every field label shares it');
});

/* Long settings hints moved behind an info tap. The words are kept verbatim — the panel was a
   wall of prose with the controls buried in it, not a panel that said too much. */
test('long Admin settings hints collapse behind an info tap', () => {
  const start = src.indexOf('/* ═══════════════════ ADMIN SETTINGS PANEL');
  const end = src.indexOf('/* ═══════════════════ POSTER RECOVERY');
  const panel = src.slice(start, end);
  assert.ok((panel.match(/<Hint>/g) || []).length >= 14, 'every long explanation is collapsed');
  assert.match(src, /function Hint\(\{children,label="What this does"\}\)/);
  // It must be operable and announce its state, not just look like a link.
  const hint = src.slice(src.indexOf('function Hint('), src.indexOf('/* ═══════════════════ PAGE HERO HEADER'));
  assert.match(hint, /aria-expanded=\{open\}/);
  assert.match(hint, /type="button"/, 'inside a settings form, an untyped button submits it');

  // Nothing short was hidden, and no live readout was hidden either: a computed line is there to
  // be checked against the boxes above it.
  for (const m of panel.matchAll(/<Hint>([\s\S]*?)<\/Hint>/g)) {
    const plain = m[1].replace(/\{[^{}]*\}/g, '·').replace(/<[^>]+>/g, '');
    assert.ok(plain.trim().length > 60, `a short hint was collapsed: ${plain.trim().slice(0, 60)}`);
  }
  assert.match(panel, /A customer can put at most <b>\{walletCoinCap/);
  assert.doesNotMatch(panel, /<Hint>\s*\n\s*A customer can put at most/);
});
