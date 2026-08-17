/** Referral eligibility, threshold snapshots and code format. */
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
  lifetimeReferralLimit,orderReferralLimit,localReferralProfile
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

test('per-order and lifetime limits remain separate with a legacy fallback', () => {
  assert.equal(M.lifetimeReferralLimit({referralLifetimeSpendMin:1200,orderReferralMinOrder:800}), 1200);
  assert.equal(M.orderReferralLimit({referralLifetimeSpendMin:1200,orderReferralMinOrder:800}), 800);
  assert.equal(M.lifetimeReferralLimit({referralMinOrder:600}), 600);
  assert.equal(M.orderReferralLimit({referralMinOrder:600}), 600);
});

test('a live single-use reservation cannot be displaced by a second checkout', () => {
  const reserveBlock = src.slice(src.indexOf('async function reserveReferral('), src.indexOf('async function finalizeReferralOnPayment('));
  assert.match(reserveBlock, /r\.pendingOrderId&&r\.pendingOrderId!==orderId&&Number\(r\.reservedUntil\)>Date\.now\(\)/);
  assert.doesNotMatch(reserveBlock, /r\.reservedBy&&r\.reservedBy!==uid/);
});
