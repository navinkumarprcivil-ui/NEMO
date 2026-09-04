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
  const head = page.slice(page.indexOf('className="vh-head"'), page.indexOf('{cats.length>1&&('));
  const backAt = head.indexOf('<BackArrow/>');
  const titleAt = head.indexOf('Care Guides<');
  const switchAt = head.indexOf('<GuideNotifBtn/>');
  assert.ok(backAt > -1 && titleAt > -1 && switchAt > -1);
  assert.ok(backAt < titleAt && titleAt < switchAt, 'reading order: back, title, switch');
  // A back button on a line of its own, above a heading with no strapline under it, left a band
  // of empty colour taller than anything in it.
  assert.doesNotMatch(head, /marginBottom:14\}\}><BackArrow\/>/);
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
