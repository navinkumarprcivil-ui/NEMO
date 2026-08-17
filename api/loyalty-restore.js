/** Silently restore coins spent on a customer-cancelled order. */
import { verifyIdToken, readOrder, dbGet, dbPatch, dbTransaction } from '../lib/payments.mjs';

const lotExpiry = (months, from = Date.now()) => {
  const count = Number(months || 0);
  if (count <= 0) return 0;
  const date = new Date(from);
  date.setMonth(date.getMonth() + count);
  return date.getTime();
};

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).end(); return; }
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const uid = await verifyIdToken(token);
  if (!uid) { res.status(401).json({ error: 'sign-in-required' }); return; }

  const orderId = String(req.body?.orderId || '');
  const order = await readOrder(uid, orderId);
  if (!order || order.userUid !== uid || order.status !== 'Cancelled') {
    res.status(409).json({ error: 'order-not-cancelled' });
    return;
  }
  if (order.loyaltyRefunded || !(Number(order.loyaltyDiscount) > 0)) {
    res.status(200).json({ ok: true, restored: 0, alreadyDone: true });
    return;
  }

  try {
    const settings = await dbGet('settings') || {};
    const restoreId = `restore:${orderId}`;
    let restored = 0;
    let alreadyDone = false;
    await dbTransaction(`loyalty/${encodeURIComponent(uid)}`, current => {
      const data = current && typeof current === 'object' ? { ...current } : { points: 0, lots: [], history: [] };
      let lots = Array.isArray(data.lots) ? [...data.lots] : (Number(data.points) > 0 ? [{ id: 'legacy', pts: Number(data.points), exp: 0 }] : []);
      if (lots.some(lot => lot && lot.id === restoreId)) {
        alreadyDone = true;
        restored = 0;
        return undefined;
      }
      const currentHistory = Array.isArray(data.history) ? data.history : [];
      const redemption = currentHistory.find(entry =>
        entry && entry.id === orderId && entry.type === 'redeem' && Number(entry.pts) < 0
      );
      // The order alone is not proof that coins left the wallet. Restore only the exact
      // redemption recorded when checkout spent them, otherwise a fabricated cancelled order
      // could mint a fresh wallet balance.
      if (!redemption) { restored = 0; return undefined; }
      restored = Math.abs(Number(redemption.pts) || 0);
      if (!(restored > 0)) return undefined;
      lots.push({ id: restoreId, pts: restored, exp: lotExpiry(settings.walletValidityMonths) });
      const history = currentHistory.filter(entry =>
        entry && entry.id !== orderId && !String(entry.id || '').startsWith('redeemrefund:')
      );
      return { ...data, lots, history, points: lots.reduce((sum, lot) => sum + (Number(lot?.pts) || 0), 0) };
    });
    if (!(restored > 0) && !alreadyDone) {
      res.status(409).json({ error: 'redemption-not-found' });
      return;
    }
    await dbPatch(`orders/${encodeURIComponent(uid)}/${encodeURIComponent(orderId)}`, { loyaltyRefunded: true, updatedAt: new Date().toISOString() });
    res.status(200).json({ ok: true, restored, alreadyDone });
  } catch (error) {
    console.error('loyalty-restore', error?.message || error);
    res.status(500).json({ error: 'restore-failed' });
  }
}
