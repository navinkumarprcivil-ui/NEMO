/** Remove pending and approved customer-tank entries once their 24-hour window ends. */
import { dbGet, dbDelete } from '../lib/payments.mjs';

const TTL = 24 * 60 * 60 * 1000;

/* Pending time starts at submission. Approved time is a separate window that starts only when
   the admin approves. Explicit numeric expiries win; the date fallbacks keep legacy rows clean. */
export const tankEntryExpiry = (entry) => {
  if (!entry) return 0;

  if (entry.approved === false) {
    const pending = Number(entry.pendingExpiresAt) || 0;
    if (pending > 0) return pending;
    const submitted = Date.parse(entry.createdAt || '');
    return Number.isFinite(submitted) ? submitted + TTL : 0;
  }

  const approved = Number(entry.expiresAt) || 0;
  if (approved > 0) return approved;
  const approvedAt = Date.parse(entry.approvedAt || entry.createdAt || '');
  return Number.isFinite(approvedAt) ? approvedAt + TTL : 0;
};

export default async function handler(req, res) {
  if (req.method !== 'GET') { res.status(405).end(); return; }
  const secret = process.env.CRON_SECRET || '';
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }

  try {
    const all = await dbGet('showcase') || {};
    const now = Date.now();
    const expired = Object.entries(all).filter(([, entry]) => {
      const expiry = tankEntryExpiry(entry);
      return expiry > 0 && expiry <= now;
    });
    // Service-account deletion is authoritative and does not depend on a customer/admin opening the app.
    await Promise.all(expired.map(([key]) => dbDelete(`showcase/${encodeURIComponent(key)}`)));
    res.status(200).json({ ok: true, removed: expired.length });
  } catch (error) {
    console.error('cron-tank-cleanup', error?.message || error);
    res.status(500).json({ error: 'cleanup-failed' });
  }
}
