/**
 * Push notifications — sending to a customer's devices through Firebase Cloud Messaging.
 *
 * ── Why this exists ────────────────────────────────────────────────────────
 * sw.js has been able to RECEIVE a push since the site was built; nothing has ever sent
 * one. The weekly tank-care reminder therefore fires only when someone happens to open
 * the app, and the Android wrapper cannot show it at all — Android System WebView has no
 * Notification API, which is why notifPermNow() in app.jsx reports "unsupported" rather
 * than "denied". This module is the missing sender.
 *
 * ── Why here and not a Cloud Function ──────────────────────────────────────
 * Firebase Cloud Functions require the Blaze plan, meaning a billing account, for what is
 * otherwise a free service. The Worker already holds FIREBASE_SERVICE_ACCOUNT and already
 * runs a cron every fifteen minutes, so it can mint the same OAuth token and POST to FCM
 * directly. FCM itself has no charge and no quota. The whole feature therefore costs
 * nothing and adds no new credential to store, rotate or leak.
 *
 * ── Data-only messages, on purpose ─────────────────────────────────────────
 * A payload carrying `notification` is displayed by Android itself when the app is in the
 * background, and onMessageReceived() is never called — so the app cannot control the
 * text, the channel, or where a tap lands. Sending `data` only means the app's
 * FirebaseMessagingService always runs and always builds the notification, which keeps
 * one code path for foreground and background alike. HIGH priority is what gets a
 * data-only message delivered through Doze rather than held until the phone wakes.
 *
 * Tokens live at pushTokens/<uid>/<deviceId>, keyed by a device id the browser generates
 * once and keeps, not by the token itself: a refreshed token then overwrites its own
 * device's entry instead of leaving the old one behind to be retried forever.
 */

import { PROJECT_ID, accessToken, dbGet, dbDelete } from './payments.mjs';

const FCM_SEND = `https://fcm.googleapis.com/v1/projects/${PROJECT_ID}/messages:send`;

/** Every stored device token for one customer, as [{ deviceId, token }]. */
export async function pushTokensFor(uid) {
  if (!uid) return [];
  let devices = null;
  try { devices = await dbGet(`pushTokens/${uid}`); } catch { return []; }
  if (!devices || typeof devices !== 'object') return [];
  return Object.entries(devices)
    .map(([deviceId, row]) => ({ deviceId, token: String((row && row.token) || '') }))
    .filter((d) => d.token.length > 20);
}

/** Forget one device. Called when FCM says the token is gone, never speculatively. */
export async function dropPushToken(uid, deviceId) {
  try { await dbDelete(`pushTokens/${uid}/${deviceId}`); } catch { /* next tick retries */ }
}

/**
 * Send to one token.
 *
 * Returns { ok } on success and { ok: false, gone } when FCM says this token no longer
 * belongs to an installed app — an uninstall, a restored backup, a cleared app. `gone` is
 * the caller's cue to delete it; every other failure is transient and must NOT delete
 * anything, or one bad afternoon at Google would silently unsubscribe every customer.
 */
export async function sendFcm(token, { title, body, url = '/', tag = 'nemo' } = {}) {
  if (!token || !title) return { ok: false, gone: false };
  let tok;
  try { tok = await accessToken(); } catch { return { ok: false, gone: false }; }

  const payload = {
    message: {
      token,
      // FCM v1 requires every data value to be a string.
      data: { title: String(title), body: String(body || ''), url: String(url), tag: String(tag) },
      android: { priority: 'HIGH' },
    },
  };

  let r;
  try {
    r = await fetch(FCM_SEND, {
      method: 'POST',
      headers: { authorization: `Bearer ${tok}`, 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8000),
    });
  } catch { return { ok: false, gone: false }; }

  if (r.ok) return { ok: true, gone: false };

  /* 404 UNREGISTERED and 400 INVALID_ARGUMENT are the two verdicts that mean this token is
     permanently dead. 401/403 mean the credential or the API is wrong — a configuration
     problem affecting every send, not this token — and 429/5xx are load. Treat only the
     first pair as final. */
  const detail = await r.text().catch(() => '');
  const gone = r.status === 404
    || (r.status === 400 && /UNREGISTERED|INVALID_ARGUMENT/i.test(detail));
  return { ok: false, gone, status: r.status, detail: detail.slice(0, 300) };
}

/**
 * Send to every device a customer has, pruning the ones FCM reports as gone.
 * Returns how many actually went out, so a caller can record "notified" only when the
 * customer could really have seen something.
 */
export async function notifyUser(uid, message) {
  const devices = await pushTokensFor(uid);
  if (!devices.length) return 0;
  let sent = 0;
  for (const d of devices) {
    const res = await sendFcm(d.token, message);
    if (res.ok) sent += 1;
    else if (res.gone) await dropPushToken(uid, d.deviceId);
  }
  return sent;
}
