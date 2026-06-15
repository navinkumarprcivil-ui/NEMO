# 🐠 Nemo Aqua Store

A mobile-first aquarium storefront (HTML + React + Firebase Realtime Database).

## Files to put in your GitHub repo

```
index.html              ← the app (served at the root)
app.jsx                 ← all the app code
assets/                 ← UPLOAD THE WHOLE FOLDER (logo, favicons, share banner)
  ├─ nemo-logo.png
  ├─ share-banner.png / share-banner.jpg
  ├─ apple-touch-icon.png
  └─ favicon-16/32/48/96/144/192/512.png
favicon.ico             ← root favicon Google probes by default
favicon.png
p/                      ← UPLOAD THE WHOLE FOLDER (SEO product pages + social images)
  ├─ index.html         ← product catalog page
  ├─ <product>.html     ← one page per product (clownfish, java-fern, …)
  └─ og/                ← share images for each product (.jpg)
manifest.webmanifest    ← PWA manifest (installable app)
sw.js                   ← service worker (offline shell + install)
robots.txt              ← search-engine crawl rules
sitemap.xml             ← page list for Google
google….html            ← Google Search Console verification file
vercel.json             ← static config + security headers
database.rules.json     ← Firebase security rules (NOT served — paste into Firebase, see below)
seo/                    ← build-time script only; the LIVE site does NOT need it
README.md               ← this file
LAUNCH_CHECKLIST.md     ← pre-launch checklist
.gitignore
```

> ⚠️ **Keep the folder structure exactly as above — upload the `assets/` and `p/` folders WITH their contents (including `p/og/`).** `index.html` and the product pages reference files *inside* these folders by path, so if a folder uploads empty you'll get a broken logo/favicons and 404s on every `/p/...` product link. Only `seo/` is safe to leave off the live host (it's a build script). If your host's uploader skips folder contents, see **"Uploading"** at the bottom — zip-and-extract or `git push` keeps the structure intact.

## ⭐ NEW since last version
- **Installable app (PWA):** customers get an "Install Nemo App" button + browser "Add to Home Screen". Needs `manifest.webmanifest` + `sw.js` in the repo (already included).
- **Per-customer order security + admin-only writes:** new `database.rules.json` — see "Lock admin" below. Orders are now stored per user so customers can only read their own.
- **Inventory truth:** stock is decremented with an atomic Firebase transaction at checkout, so two buyers can't oversell the last item.
- **About & Policies page** (editable in admin → Settings), **Live Arrival Guarantee** + acclimatization guide at checkout, **product Share** buttons, **order-notification email** (free, via FormSubmit — set your email in Settings), and a new rounded font theme.

## 🔐 Admin is already locked to your Google account
Your admin Google UID (`cI2HmMt6FdR7fO7uUnugH85GeZt2`) is **already filled into `database.rules.json`** — only that account can edit products/guides/settings; customers can only read the catalog and manage their own orders. There is **nothing to paste**; you just need to **publish the rules** (step 4 in the deploy steps below).

**Optional — add a second admin:** have them sign in to the live site with Google once, copy their UID from Firebase Console → **Authentication → Users**, replace every **`PASTE_FRIEND_UID_HERE`** in `database.rules.json` with it, and **Publish** again. Leave `PASTE_FRIEND_UID_HERE` as-is if you don't want a second admin — the rules still work.


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
- **Catalog** (`products`, `guides`, `reviews`, `settings`, `showcase`, `testimonials`) — readable by anyone (needed to show the storefront), **writable only by the admin Google account(s)** whose UID is in the rules.
- **Customer data** (`orders`, `favorites`, `loyalty`, `requests`) — each customer can only read/write their **own**; the admin can read all.

> ✅ Admin writes are **already** locked to your Google UID (`cI2HmMt6FdR7fO7uUnugH85GeZt2`) in `database.rules.json`. Just publish the rules to activate them.

### Add a second admin (optional)

Admin writes are already locked to your Google UID. To let a partner also manage the store, copy **their** UID (Firebase Console → **Authentication → Users**) and replace every **`PASTE_FRIEND_UID_HERE`** in `database.rules.json` with it, then **Publish** again.

### ⏰ Important
Your original test rules expire automatically on a date. Publishing `database.rules.json` removes that expiry and replaces them with the rules above.

---

## Local testing

Just open `index.html` in a browser, or run any static server:
```bash
npx serve .
```
(Google sign-in only works on `localhost` or an authorized domain; elsewhere the app shows demo accounts.)

---

## Uploading to your host

Whatever you do, the **folders must keep their files inside them** (`assets/`, `p/`, and `p/og/`). The #1 cause of a broken live site is uploading the loose files but leaving the folders empty.

**Easiest & most reliable — zip then extract (file-manager hosts like cPanel/Hostinger):**
1. Zip the whole site folder so the zip contains `index.html`, `assets/`, `p/`, etc.
2. In your host's File Manager, open `public_html` (or your web root) and **delete the old files**.
3. **Upload the single `.zip`**, then use the host's **Extract** button. This rebuilds every folder exactly — nothing gets skipped.
4. Make sure `index.html` ends up at the web root (not inside a sub-folder).

**Cleanest for repeat updates — GitHub + Vercel (recommended):**
1. `git push` the folder to a GitHub repo (git always preserves folders).
2. vercel.com → Add New → Project → import the repo → Framework: **Other**, no build command → **Deploy**.
3. Future changes: just `git push` again; Vercel redeploys automatically.

**If you must drag-and-drop:** drag the **`assets` and `p` folders themselves** onto the uploader — do **not** open them, select-all, and drag the files out. Most uploaders only recurse when you hand them the folder.

> After uploading, hard-refresh the live site and check: the logo loads, a `/p/clownfish` style link opens, and the favicon shows. If any 404, that folder didn't go up — re-extract the zip.
