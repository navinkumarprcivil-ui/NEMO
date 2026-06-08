# 🐠 Nemo Aqua Store

A mobile-first aquarium storefront (HTML + React + Firebase Realtime Database).

## Files to put in your GitHub repo

```
index.html              ← the app (Vercel serves this at the root)
app.jsx                 ← all the app code
assets/
  └─ nemo-logo.png      ← store logo
manifest.webmanifest    ← PWA manifest (installable app)
sw.js                   ← service worker (offline shell + install)
database.rules.json     ← Firebase security rules (NOT deployed by Vercel — paste into Firebase, see below)
README.md               ← this file
vercel.json             ← Vercel static config (optional but recommended)
.gitignore
```

> Keep the folder structure exactly as above. `index.html` references `app.jsx`, `assets/nemo-logo.png`, `manifest.webmanifest`, and `sw.js` with relative paths, so they must stay together.

## ⭐ NEW since last version
- **Installable app (PWA):** customers get an "Install Nemo App" button + browser "Add to Home Screen". Needs `manifest.webmanifest` + `sw.js` in the repo (already included).
- **Per-customer order security + admin-only writes:** new `database.rules.json` — see "Lock admin" below. Orders are now stored per user so customers can only read their own.
- **Inventory truth:** stock is decremented with an atomic Firebase transaction at checkout, so two buyers can't oversell the last item.
- **About & Policies page** (editable in admin → Settings), **Live Arrival Guarantee** + acclimatization guide at checkout, **product Share** buttons, **order-notification email** (free, via FormSubmit — set your email in Settings), and a new rounded font theme.

## 🔐 Lock admin to your Google account (do this once, live)
1. Open your **live** site, sign in with **Google**.
2. Open admin (tap logo 10× → password) → **⚙️ Settings → Admin Security** → copy your **UID** (or get it from Firebase Console → Authentication → Users).
3. Open `database.rules.json`, replace every **`PASTE_YOUR_ADMIN_UID`** with your UID, and **Publish** in Firebase Console → Realtime Database → Rules.
4. Now only your account can edit products/guides/settings; customers can only read the catalog and manage their own orders.


---

## 1. Push to GitHub

```bash
git init
git add .
git commit -m "Nemo Aqua Store"
git branch -M main
git remote add origin https://github.com/<your-username>/nemo-aqua-store.git
git push -u origin main
```

## 2. Deploy on Vercel

1. Go to **vercel.com → Add New → Project** and import your GitHub repo.
2. Framework Preset: **Other** (it's a static site — no build step).
3. Build Command: leave **empty**. Output Directory: leave **empty** (root).
4. Click **Deploy**. You'll get a URL like `https://nemo-aqua-store.vercel.app`.

## 3. Authorize the domain for Google sign-in

Firebase Console → **Authentication → Settings → Authorized domains → Add domain**
add your Vercel domain, e.g. `nemo-aqua-store.vercel.app`
(`localhost` is already allowed for local testing).

Also confirm **Authentication → Sign-in method** has **Google** and **Anonymous** both **enabled**.

## 4. Publish the database rules

Firebase Console → **Realtime Database → Rules** → paste the contents of
`database.rules.json` → **Publish**. (This replaces the temporary open test rules.)

## 5. Configure the store (in the app)

Open your site → tap the **logo 10 times** → enter your admin password → **⚙️ Settings**.

> 🔒 The starter password is stored in `app.jsx` only as a **non-reversible hash** (not plaintext). **Change it right after launch** under **Settings → Admin Security** so it's yours alone.

In Settings, fill in:

- **Your WhatsApp Number** — full international format, e.g. `919876543210` (no `+`, no spaces).
- **Supporter's WhatsApp** — optional, toggle on to show a "notify support" button.
- **UPI ID** — e.g. `yourname@oksbi` to enable "Pay Online" via UPI.
- **Razorpay / Payment Link** — optional; paste a Razorpay Payment Link for card/netbanking.
- **Drive Folder + API key** — see below.

## 6. (Optional) Google Drive product photos

1. Put product photos in **one Google Drive folder**.
2. Right-click the folder → **Share → Anyone with the link → Viewer**.
3. Get a **Drive API key**: [console.cloud.google.com](https://console.cloud.google.com) → same project → **APIs & Services → Library → enable “Google Drive API”** → **Credentials → Create credentials → API key**.
4. **Restrict the key** (important): under the key's settings → **API restrictions → restrict to Google Drive API**, and **Application restrictions → HTTP referrers** → add `https://your-domain.vercel.app/*`.
5. Paste the **folder link** and **API key** into ⚙️ Settings. Now "Browse Drive folder" works in the product form.

---

## 🔒 About the security rules

The included rules:
- **Catalog** (`products`, `guides`, `reviews`, `settings`) — readable by anyone (needed to show the storefront), **writable only when signed in**.
- **`orders` / `requests`** — readable & writable **only when signed in** (the app signs every visitor in anonymously, so checkout works, but the raw database URL is not world-open).

> ⚠️ **Note on admin writes:** admin access in the app is gated by a password in the page, which Firebase can't verify. So technically any *signed-in* user could write catalog data if they crafted requests by hand. For a small business this is usually fine. To **fully lock admin actions** to your own Google account, see below.

### Stronger (optional): lock admin writes to your Google account

1. Sign in to the live site with **your** Google account once.
2. Firebase Console → **Authentication → Users** → copy your **User UID**.
3. In the rules, replace each admin collection's `".write": "auth != null"` with:
   ```
   ".write": "auth != null && auth.uid === 'YOUR_ADMIN_UID'"
   ```
   for `products`, `guides`, and `settings`. Keep `orders`/`requests`/`reviews` as `auth != null` (customers must create those).
4. Make sure you **sign in with Google (not just browse)** before managing products, so your UID is attached to the writes.

### ⏰ Important
Your original test rules expire automatically on a date. Publishing `database.rules.json` removes that expiry and replaces them with the rules above.

---

## Local testing

Just open `index.html` in a browser, or run any static server:
```bash
npx serve .
```
(Google sign-in only works on `localhost` or an authorized domain; elsewhere the app shows demo accounts.)
