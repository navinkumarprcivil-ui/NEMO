/** Remove approved customer-tank entries once their 24-hour approval window ends. */
import { dbGet, dbDelete } from '../lib/payments.mjs';

const TTL = 24 * 60 * 60 * 1000;
const expiryOf = (entry) => {
  const explicit = Number(entry?.expiresAt) || 0;
  if (explicit > 0) return explicit;
  if (!entry || entry.approved === false) return 0;
  const legacy = Date.parse(entry.approvedAt || entry.createdAt || '');
  return Number.isFinite(legacy) ? legacy + TTL : 0;
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
    const expired = Object.entries(all).filter(([, entry]) =>
      entry && entry.approved !== false && expiryOf(entry) > 0 && expiryOf(entry) <= now
    );
    // Delete by the actual database key, not a client-supplied `entry.id` field.
    await Promise.all(expired.map(([key]) => dbDelete(`showcase/${encodeURIComponent(key)}`)));
    res.status(200).json({ ok: true, removed: expired.length });
  } catch (error) {
    console.error('cron-tank-cleanup', error?.message || error);
    res.status(500).json({ error: 'cleanup-failed' });
  }
}
