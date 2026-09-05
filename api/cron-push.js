/**
 * Send the notifications that have come due — shipped orders, and the weekly tank care
 * reminder. Runs on the Worker's existing fifteen-minute cron.
 *
 * ── Why a queue rather than a scan ─────────────────────────────────────────
 * Orders live at orders/<uid>/<orderId>, so finding the ones that just shipped would mean
 * reading every order in the store, every fifteen minutes, forever — ninety-six full reads
 * a day against a node that only grows. The admin writes one small row instead when the
 * status crosses into Shipped, and this drains it: the work is proportional to what
 * happened, not to how long the shop has been trading.
 *
 * That row carries only WHO and WHICH ORDER. The message is composed here, after re-reading
 * the order and confirming it really is Shipped, so a queue row can never become a way to
 * put chosen text on a customer's phone. Rows are deleted whether or not the send worked:
 * a shipping notice that is hours late is worse than none, and the order page shows the
 * truth regardless.
 *
 * ── Why care reminders carry a date and not a tank ─────────────────────────
 * The tank profile has always lived in localStorage and still does. Only customers who
 * switch reminders on write a row here, and it holds one date. See syncCareReminder().
 */
import { dbGet, dbDelete, dbPatch, readOrder } from '../lib/payments.mjs';
import { notifyUser } from '../lib/push.mjs';

const WEEK = 7 * 24 * 60 * 60 * 1000;
/* One tick's work. Anything beyond it waits fifteen minutes rather than risking a Worker
   that runs long enough to be cut off mid-send. */
const BATCH = 40;
/* A queue row this old refers to a shipment the customer has long since seen the state of.
   Drop it rather than delivering a stale surprise. */
const STALE = 24 * 60 * 60 * 1000;

async function sendShipped(now) {
  let queue;
  try { queue = await dbGet('pushQueue') || {}; } catch { return 0; }
  const rows = Object.entries(queue).slice(0, BATCH);
  let sent = 0;

  for (const [key, row] of rows) {
    const uid = String((row && row.uid) || '');
    const orderId = String((row && row.orderId) || '');
    const at = Number((row && row.at) || 0);

    if (uid && orderId && (!at || now - at < STALE)) {
      const order = await readOrder(uid, orderId);
      // Re-read rather than trust the row: the order may have moved on, or been corrected.
      if (order && order.status === 'Shipped') {
        const label = order.orderNo ? `Order ${order.orderNo}` : 'Your order';
        const courier = String(order.courier || '').trim();
        sent += await notifyUser(uid, {
          title: 'Your order is on the way',
          body: courier ? `${label} has shipped with ${courier}.` : `${label} has shipped.`,
          url: '/',
          tag: `order-${orderId}`,
        });
      }
    }
    await dbDelete(`pushQueue/${encodeURIComponent(key)}`).catch(() => {});
  }
  return sent;
}

async function sendCareReminders(now) {
  let due;
  try { due = await dbGet('careReminders') || {}; } catch { return 0; }
  let sent = 0;

  for (const [uid, row] of Object.entries(due).slice(0, BATCH)) {
    const nextAt = Number((row && row.nextAt) || 0);
    if (!nextAt || nextAt > now) continue;
    // Already handled this cycle. Guards against a tick that ran twice.
    if (Number((row && row.sentAt) || 0) >= nextAt) continue;

    sent += await notifyUser(uid, {
      title: 'Water change due',
      body: 'Your tank is due its weekly care. Open Nemo for this week’s jobs.',
      url: '/',
      tag: 'tank-care',
    });

    /* Move the schedule on even when nothing was sent — a customer with no registered device
       must not be retried every fifteen minutes forever. Advancing by a week rather than
       freezing means someone who never marks the job done still gets nudged next week, and
       marking it done rewrites nextAt from the app anyway. */
    await dbPatch(`careReminders/${encodeURIComponent(uid)}`, { nextAt: now + WEEK, sentAt: now })
      .catch(() => {});
  }
  return sent;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') { res.status(405).end(); return; }
  const secret = process.env.CRON_SECRET || '';
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }

  const now = Date.now();
  try {
    /* Sequential on purpose: both share one cached OAuth token, and running them together
       on a cold cache mints two. */
    const shipped = await sendShipped(now);
    const care = await sendCareReminders(now);
    res.status(200).json({ ok: true, shipped, care });
  } catch (error) {
    console.error('cron-push', error?.message || error);
    res.status(500).json({ error: 'push-failed' });
  }
}
