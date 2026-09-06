/**
 * Send the notifications that have come due — orders shipped and delivered, products back in
 * stock, and the weekly tank care reminder. Runs on the Worker's existing fifteen-minute cron.
 *
 * ── Why orders use a queue and restock does not ────────────────────────────
 * Orders live at orders/<uid>/<orderId>, so finding the ones that just shipped would mean
 * reading every order in the store, every fifteen minutes, forever — ninety-six full reads
 * a day against a node that only grows. The admin writes one small row instead when the
 * status crosses, and this drains it: the work is proportional to what happened, not to how
 * long the shop has been trading.
 *
 * The waiting lists are the opposite shape. restock/<pid> holds only products that went out
 * of stock with someone waiting, so it is small by construction and can simply be asked "is
 * this back yet?" on every tick — which also catches stock returning by any route, where
 * watching for the moment of change would catch only one.
 *
 * A queue row carries only WHO and WHICH ORDER. The message is composed here, after re-reading
 * the order and confirming it really is in the state the row claims, so a queue row can never
 * become a way to put chosen text on a customer's phone. Rows are deleted whether or not the
 * send worked: a shipping notice that is hours late is worse than none, and the order page
 * shows the truth regardless.
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
/* How long a "notify me when it's back" request stays worth acting on. */
const SUB_MAX_AGE = 60 * 24 * 60 * 60 * 1000;

/* What each queued kind means, and the status the order must actually be in for it to go out.
   Keeping the expected status here rather than in the row is the point: the row asks for a
   send, this decides whether the order still deserves one. */
const ORDER_PUSH = {
  shipped: {
    status: 'Shipped',
    title: 'Your order is on the way',
    body: (label, order) => {
      const courier = String(order.courier || '').trim();
      return courier ? `${label} has shipped with ${courier}.` : `${label} has shipped.`;
    },
  },
  delivered: {
    status: 'Delivered',
    title: 'Your order has arrived',
    body: (label) => `${label} was marked delivered. Tell us how everything arrived — it helps `
      + `the next customer, and it is how the live arrival guarantee is claimed.`,
  },
};

async function sendOrderNotices(now) {
  let queue;
  try { queue = await dbGet('pushQueue') || {}; } catch { return 0; }
  const rows = Object.entries(queue).slice(0, BATCH);
  let sent = 0;

  for (const [key, row] of rows) {
    const uid = String((row && row.uid) || '');
    const orderId = String((row && row.orderId) || '');
    const at = Number((row && row.at) || 0);
    const spec = ORDER_PUSH[String((row && row.kind) || '')];

    if (spec && uid && orderId && (!at || now - at < STALE)) {
      const order = await readOrder(uid, orderId);
      // Re-read rather than trust the row: the order may have moved on, or been corrected.
      if (order && order.status === spec.status) {
        const label = order.orderNo ? `Order ${order.orderNo}` : 'Your order';
        sent += await notifyUser(uid, {
          title: spec.title,
          body: spec.body(label, order),
          url: '/',
          /* One tag per order, so "arrived" replaces "on the way" instead of stacking under it.
             The shade should show where an order is, not its history. */
          tag: `order-${orderId}`,
        });
      }
    }
    await dbDelete(`pushQueue/${encodeURIComponent(key)}`).catch(() => {});
  }
  return sent;
}

/* Back-in-stock alerts.
   No queue and no crossing detection here, unlike shipping. restock/<pid> only ever holds
   products that went out of stock with somebody waiting, so the node is naturally small and
   asking "is this one back yet?" on every tick costs almost nothing. It is also the more robust
   shape: stock returns by several routes — an admin save, a corrected count, a bulk edit — and
   this notices all of them, where watching for the moment of change would only notice one. */
async function sendRestock(now) {
  let waiting;
  try { waiting = await dbGet('restock') || {}; } catch { return 0; }
  let sent = 0;

  for (const [pid, subs] of Object.entries(waiting).slice(0, BATCH)) {
    const path = `restock/${encodeURIComponent(pid)}`;
    if (!subs || typeof subs !== 'object') { await dbDelete(path).catch(() => {}); continue; }

    let product = null;
    try { product = await dbGet(`products/${encodeURIComponent(pid)}`); } catch { continue; }
    // Delisted since somebody asked. Nothing to announce and nothing to keep.
    if (!product) { await dbDelete(path).catch(() => {}); continue; }

    const stock = Number(product.stockCount);
    if (!Number.isFinite(stock) || stock <= 0) continue;

    const name = String(product.name || '').trim() || 'Something you wanted';
    for (const [uid, row] of Object.entries(subs).slice(0, BATCH)) {
      /* A request made months ago is not worth acting on — the customer has almost certainly
         bought elsewhere, and "back in stock" for a thing they have forgotten reads as spam.
         Dropped silently rather than sent. */
      const asked = Date.parse(String((row && row.at) || '')) || 0;
      if (asked && now - asked > SUB_MAX_AGE) continue;

      sent += await notifyUser(uid, {
        title: 'Back in stock',
        body: `${name} is available again.`,
        url: '/',
        tag: `restock-${pid}`,
      });
    }

    /* Cleared whether or not anything was delivered. The list is a one-shot request: leaving it
       would tell the same people again on every tick for as long as the product stays stocked. */
    await dbDelete(path).catch(() => {});
  }
  return sent;
}

/* New care guides.

   Polled like restock rather than queued like orders: `guides` holds a handful of articles, so
   asking "is there one newer than last time?" costs a single read, and it catches a guide added
   by any route — an admin save, a restored backup, a corrected date — where watching for the
   moment of publication would catch only one of them.

   The marker is SEEDED on the first tick that finds none, and nothing is sent then. Without
   that, switching this on would announce every guide the shop has ever written, all at once,
   to everyone who subscribed.

   Several guides added between two ticks produce ONE notification naming the newest, not one
   per guide. The customer wants to know there is something new to read, not to have their
   notification shade filled by a bulk edit.
*/
async function sendNewGuide(now) {
  let guides;
  try { guides = await dbGet('guides') || {}; } catch { return 0; }
  const list = (Array.isArray(guides) ? guides : Object.values(guides)).filter(Boolean);
  if (!list.length) return 0;

  let newest = null;
  for (const g of list) {
    const at = Date.parse(String((g && g.createdAt) || '')) || 0;
    // A guide dated in the future would park the marker there and mute every real one after it.
    if (!at || at > now) continue;
    if (!newest || at > newest.at) newest = { at, title: String((g && g.title) || '').trim() };
  }
  if (!newest) return 0;

  let seen = 0;
  try { seen = Number(await dbGet('pushState/guides/lastAt')) || 0; } catch { return 0; }
  if (!seen) { await dbPatch('pushState/guides', { lastAt: newest.at }).catch(() => {}); return 0; }
  if (newest.at <= seen) return 0;

  let subs;
  try { subs = await dbGet('guideSubs') || {}; } catch { return 0; }
  let sent = 0;
  for (const uid of Object.keys(subs).slice(0, BATCH)) {
    sent += await notifyUser(uid, {
      title: 'New care guide',
      body: newest.title ? `${newest.title} — just published.` : 'A new care guide is up.',
      url: '/',
      /* One tag for the channel, so an unread announcement is replaced rather than stacked
         under a newer one. Somebody who has not opened the app in a month should find the
         latest guide waiting, not four. */
      tag: 'care-guide',
    });
  }
  /* Advance whether or not anything was delivered, exactly as careReminders does: a guide must
     never be announced twice because nobody happened to be subscribed the first time round. */
  await dbPatch('pushState/guides', { lastAt: newest.at }).catch(() => {});
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
    const orders = await sendOrderNotices(now);
    const care = await sendCareReminders(now);
    const restock = await sendRestock(now);
    const guides = await sendNewGuide(now);
    res.status(200).json({ ok: true, orders, care, restock, guides });
  } catch (error) {
    console.error('cron-push', error?.message || error);
    res.status(500).json({ error: 'push-failed' });
  }
}
