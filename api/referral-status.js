/** Return (and, when eligible, unlock) the signed-in customer's permanent referral code. */
import { randomInt } from 'node:crypto';
import { verifyIdToken, dbGet, dbPatch, dbTransaction } from '../lib/payments.mjs';

const CODE_RE = /^[A-Z0-9]{8,12}$/;
const LETTERS = 'ABCDEFGHJKMNPQRSTUVWXYZ';
const DIGITS = '23456789';
const ALL = LETTERS + DIGITS;
const pick = (chars) => chars[randomInt(chars.length)];

function newCode() {
  const chars = [pick(LETTERS), pick(LETTERS), pick(DIGITS), pick(DIGITS)];
  while (chars.length < 10) chars.push(pick(ALL));
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

function thresholdFrom(settings) {
  const current = Number(settings?.referralLifetimeSpendMin);
  const legacy = Number(settings?.referralMinOrder);
  return Math.max(0, Number.isFinite(current) ? current : (Number.isFinite(legacy) ? legacy : 0));
}

function paymentSucceeded(order) {
  if (!order || order.status === 'Cancelled') return false;
  const payment = String(order.paymentStatus || '');
  if (payment === 'Verified' || payment === 'Paid') return true;
  if (payment) return false;
  return ['Confirmed', 'Shipped', 'Delivered'].includes(order.status);
}

function successfulSpend(orders) {
  return Object.values(orders || {}).reduce((sum, order) => {
    if (!paymentSucceeded(order)) return sum;
    const amount = order.amountDue ?? ((Number(order.total) || 0) + (Number(order.fee) || 0));
    return sum + Math.max(0, Number(amount) || 0);
  }, 0);
}

async function registerCode(uid, preferred, threshold, createdAt) {
  let code = CODE_RE.test(String(preferred || '')) ? preferred : newCode();
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const record = {
      owner: uid,
      kind: 'customer',
      active: true,
      createdAt,
      unlockThreshold: threshold,
      redemptions: {},
      pendingBy: {},
    };
    const result = await dbTransaction(`referrals/${encodeURIComponent(code)}`, current => {
      if (!current) return record;
      if (current.owner === uid && current.kind === 'customer') return { ...current, active: true };
      return undefined;
    });
    if (result && result.owner === uid && result.kind === 'customer') return code;
    code = newCode();
  }
  throw new Error('referral-code-collision');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).end(); return; }
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const uid = await verifyIdToken(token);
  if (!uid) { res.status(401).json({ error: 'sign-in-required' }); return; }

  try {
    const settings = await dbGet('settings') || {};
    const candidate = { code: newCode(), threshold: thresholdFrom(settings), createdAt: Date.now(), unlocked: false };
    let profile = await dbTransaction(`userrefs/${encodeURIComponent(uid)}`, current => {
      if (current && typeof current === 'object' && CODE_RE.test(String(current.code || ''))
          && Number.isFinite(Number(current.threshold)) && Number(current.createdAt) > 0) return undefined;
      return candidate;
    });
    if (!profile || typeof profile !== 'object') profile = candidate;

    const threshold = Math.max(0, Number(profile.threshold) || 0);
    const spent = successfulSpend(await dbGet(`orders/${encodeURIComponent(uid)}`));
    let code = String(profile.code || '').toUpperCase();
    let unlocked = profile.unlocked === true || spent >= threshold;
    if (unlocked) {
      code = await registerCode(uid, code, threshold, Number(profile.createdAt) || Date.now());
      await dbPatch(`userrefs/${encodeURIComponent(uid)}`, {
        code,
        threshold,
        unlocked: true,
        unlockedAt: profile.unlockedAt || Date.now(),
        spendAtUnlock: profile.spendAtUnlock ?? spent,
      });
    }

    res.status(200).json({
      code,
      threshold,
      spent,
      remaining: Math.max(0, threshold - spent),
      unlocked,
    });
  } catch (error) {
    console.error('referral-status', error?.message || error);
    res.status(500).json({ error: 'referral-status-failed' });
  }
}
