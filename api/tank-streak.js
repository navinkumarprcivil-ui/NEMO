/** Log one verified customer-tank upload day for later admin reward review. */
import { verifyIdToken, dbGet, dbTransaction } from '../lib/payments.mjs';

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** Calendar day at the store in India, not UTC. */
export const dayOf = value => {
  const parsed = value == null ? Date.now() : new Date(value).getTime();
  const timestamp = Number.isFinite(parsed) ? parsed : Date.now();
  return new Date(timestamp + IST_OFFSET_MS).toISOString().slice(0, 10);
};

export function computeStreak(dates, now = Date.now()) {
  const keys = Object.keys(dates || {}).filter(day => /^\d{4}-\d{2}-\d{2}$/.test(day)).sort();
  if (!keys.length) return { current: 0, best: 0, lastDay: '' };
  let run = 1;
  let best = 1;
  for (let index = 1; index < keys.length; index += 1) {
    const previous = Date.parse(`${keys[index - 1]}T00:00:00Z`);
    const current = Date.parse(`${keys[index]}T00:00:00Z`);
    run = current - previous === 86400000 ? run + 1 : 1;
    best = Math.max(best, run);
  }
  const lastDay = keys[keys.length - 1];
  const gap = (Date.parse(`${dayOf(now)}T00:00:00Z`) - Date.parse(`${lastDay}T00:00:00Z`)) / 86400000;
  return { current: gap <= 1 ? run : 0, best, lastDay };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).end(); return; }
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const uid = await verifyIdToken(token);
  if (!uid) { res.status(401).json({ error: 'sign-in-required' }); return; }

  try {
    const requestedId = String(req.body?.entryId || '');
    if (!requestedId || requestedId.length > 160) {
      res.status(400).json({ error: 'entry-id-required' });
      return;
    }
    const entry = await dbGet(`showcase/${encodeURIComponent(requestedId)}`);
    if (!entry || entry.userUid !== uid || entry.id !== requestedId || entry.approved !== true) {
      res.status(409).json({ error: 'upload-not-found' });
      return;
    }
    const uploadedAt = Date.parse(entry.createdAt);
    if (!Number.isFinite(uploadedAt) || uploadedAt > Date.now() + 5 * 60 * 1000) {
      res.status(409).json({ error: 'invalid-upload-time' });
      return;
    }
    const day = dayOf(uploadedAt);
    const updatedAt = Date.now();
    const result = await dbTransaction(`tankUploadStreaks/${encodeURIComponent(uid)}`, current => {
      const dates = { ...((current && current.dates) || {}), [day]: { at: uploadedAt, entryId: entry.id } };
      const streak = computeStreak(dates, updatedAt);
      return {
        uid,
        ownerName: String(entry.ownerName || current?.ownerName || '').slice(0, 80),
        dates,
        current: streak.current,
        best: Math.max(Number(current?.best) || 0, streak.best),
        lastDay: streak.lastDay,
        updatedAt,
      };
    });
    res.status(200).json(result);
  } catch (error) {
    console.error('tank-streak', error?.message || error);
    res.status(500).json({ error: 'streak-log-failed' });
  }
}
