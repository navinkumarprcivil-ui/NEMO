/** Referral eligibility, threshold snapshots, the redeem rules and code format. */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(root, 'app.jsx'), 'utf8');

const spendCode = src.slice(src.indexOf('function paymentSucceeded('), src.indexOf('function returnWindowOpen('));
const referralCode = src.slice(src.indexOf('const REF_CODE_RE='), src.indexOf('/* Threshold is captured once.'));
const storage = new Map();
const localStorage = {
  getItem: key => storage.has(key) ? storage.get(key) : null,
  setItem: (key, value) => storage.set(key, value),
};
const M = new Function('localStorage', `${spendCode}\n${referralCode}\nreturn {
  paymentSucceeded,successfulSpend,REF_CODE_RE,cleanRefCode,genRefCode,
  lifetimeReferralLimit,referralRedeemMin,referralDiscountFor,referralOwnerCoins,
  referralOfferLine,localReferralProfile
};`)(localStorage);

test('only successful non-cancelled payments count toward lifetime spend', () => {
  const orders = [
    {status:'Payment Review', paymentStatus:'Submitted', paidAt:'2026-08-17', amountDue:500},
    {status:'Confirmed', paymentStatus:'Verified', amountDue:800},
    {status:'Delivered', amountDue:400},
    {status:'Delivered', paymentStatus:'Submitted', amountDue:999},
    {status:'Cancelled', paymentStatus:'Verified', amountDue:900},
    {status:'Shipped', total:200, fee:50},
  ];
  assert.equal(M.successfulSpend(orders), 1450);
  assert.ok(!M.paymentSucceeded(orders[0]));
  assert.ok(!M.paymentSucceeded(orders[3]));
});

test('new referral codes are alphanumeric, ten characters, and contain letters and numbers', () => {
  for (let i = 0; i < 100; i += 1) {
    const code = M.genRefCode();
    assert.match(code, /^[A-Z0-9]{10}$/);
    assert.match(code, /[A-Z]/);
    assert.match(code, /[0-9]/);
    assert.ok(!/[01OIL]/.test(code));
  }
  assert.equal(M.cleanRefCode(' ab-23 cd! '), 'AB23CD');
});

test('a customer keeps the unlock limit captured at profile creation', () => {
  storage.clear();
  const existing = M.localReferralProfile('existing', {referralLifetimeSpendMin:1000});
  const unchanged = M.localReferralProfile('existing', {referralLifetimeSpendMin:5000});
  const upcoming = M.localReferralProfile('upcoming', {referralLifetimeSpendMin:5000});
  assert.equal(existing.threshold, 1000);
  assert.equal(unchanged.threshold, 1000);
  assert.equal(upcoming.threshold, 5000);
});

/* The owner's unlock target and the friend's minimum cart are different numbers answering
   different questions, and both fall back to the one legacy field a pre-split store saved. */
test('the unlock limit and the redeem minimum stay separate, with the legacy fallback', () => {
  assert.equal(M.lifetimeReferralLimit({referralLifetimeSpendMin:1200,referralRedeemMinOrder:800}), 1200);
  assert.equal(M.referralRedeemMin({referralLifetimeSpendMin:1200,referralRedeemMinOrder:800}), 800);
  assert.equal(M.lifetimeReferralLimit({referralMinOrder:600}), 600);
  assert.equal(M.referralRedeemMin({referralMinOrder:600}), 600);
});

test('a flat discount is a fixed number of rupees whatever the cart is worth', () => {
  const settings = {referralDiscountType:'flat', referralDiscount:50};
  assert.equal(M.referralDiscountFor(500, settings), 50);
  assert.equal(M.referralDiscountFor(9000, settings), 50);
  // An unset discount keeps the historic ₹50 rather than silently becoming zero.
  assert.equal(M.referralDiscountFor(500, {referralDiscountType:'flat'}), 50);
});

test('a percentage discount scales with the cart and always rounds down', () => {
  const settings = {referralDiscountType:'percent', referralDiscountPct:5};
  assert.equal(M.referralDiscountFor(1000, settings), 50);
  assert.equal(M.referralDiscountFor(999, settings), 49);      // 49.95 → 49, never 50
  assert.equal(M.referralDiscountFor(0, settings), 0);
  // A nonsense percentage cannot hand the cart away.
  assert.equal(M.referralDiscountFor(1000, {referralDiscountType:'percent', referralDiscountPct:400}), 1000);
});

test('a cart under the friend minimum earns nothing at all', () => {
  const flat = {referralDiscountType:'flat', referralDiscount:50, referralRedeemMinOrder:500};
  assert.equal(M.referralDiscountFor(499, flat), 0);
  assert.equal(M.referralDiscountFor(500, flat), 50);
  const pct = {referralDiscountType:'percent', referralDiscountPct:10, referralRedeemMinOrder:500};
  assert.equal(M.referralDiscountFor(499, pct), 0);
  assert.equal(M.referralDiscountFor(500, pct), 50);
});

test("the owner's payout is a whole non-negative number of coins", () => {
  assert.equal(M.referralOwnerCoins({referralCoins:25}), 25);
  assert.equal(M.referralOwnerCoins({referralCoins:-5}), 0);
  assert.equal(M.referralOwnerCoins({}), 0);
});

/* The offer is quoted on the referral card, in the share message and in Admin. One function
   writes all three, so they cannot drift apart after a settings change. */
test('the offer line states the discount and any minimum', () => {
  assert.equal(M.referralOfferLine({referralDiscountType:'flat', referralDiscount:50}), '₹50 off');
  assert.equal(M.referralOfferLine({referralDiscountType:'percent', referralDiscountPct:5}), '5% off');
  assert.match(M.referralOfferLine({referralDiscountType:'flat', referralDiscount:50, referralRedeemMinOrder:1000}),
    /^₹50 off on orders over ₹1,000$/);
});

/* The per-order single-use code is retired. It is not enough for the UI to stop showing one:
   the code paths that minted, activated and consumed them have to be gone, or an old record
   in the database keeps working and the two schemes coexist again. */
test('nothing mints, activates or consumes a per-order referral code any more', () => {
  for (const [label, text] of [
    ['app.jsx', src],
    ['lib/payments.mjs', readFileSync(join(root, 'lib/payments.mjs'), 'utf8')],
  ]) {
    for (const gone of ['createOrderReferralCode', 'activateEarnedReferral', 'deactivateEarnedReferral',
      'orderReferralLimit', 'earnedReferralCode', 'OrderReferralCode']) {
      assert.ok(!text.includes(gone), `${label} still references ${gone}`);
    }
    assert.ok(!/kind\s*[=!]==\s*['"]order['"]/.test(text), `${label} still branches on a kind:"order" record`);
  }
});

test('a live customer-code reservation cannot be displaced by a second checkout', () => {
  const reserveBlock = src.slice(src.indexOf('async function reserveReferral('), src.indexOf('async function finalizeReferralOnPayment('));
  assert.match(reserveBlock, /existing&&existing\.orderId!==orderId&&Number\(existing\.until\)>Date\.now\(\)/);
  // The owner uid travels back with the reservation so the order can record who to pay.
  assert.match(reserveBlock, /owner=String\(r\.owner\|\|""\)/);
  assert.match(reserveBlock, /return \(tx&&tx\.committed\)\?\{ok:true,owner\}:\{ok:false,owner:""\}/);
});

/* Reward coins are paid when the referred order is DELIVERED, not when it is paid: a referral
   that is cancelled or refunded on the way never pays out, so there is nothing to claw back. */
test("the code owner is paid on delivery, once, and reversed if the order is cancelled", () => {
  assert.match(src, /if\(settings\.referralEnabled!==false && updated\.referralOwnerUid && !updated\.referralCoinsPaid\)\{/);
  assert.match(src, /adminCreditLoyalty\(updated\.referralOwnerUid, coins, "refer:"\+updated\.id,/);
  assert.match(src, /silentlyRemoveLoyaltyCredit\(updated\.referralOwnerUid,"refer:"\+updated\.id,Number\(updated\.referralCoinsPaid\)\)/);
  // The payout block sits inside the delivered-and-paid branch, not the payment branch.
  const delivered = src.slice(src.indexOf('if(updated.status==="Delivered" && paymentSucceeded(updated)){'),
    src.indexOf('// ── On CANCEL: restock once'));
  assert.ok(delivered.includes('referralOwnerUid'), 'the referral payout is not in the delivery branch');
});
