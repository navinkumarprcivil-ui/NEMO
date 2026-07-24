# 📗 Nemo Aqua Store — Owner's Handbook

**Read this first whenever you're unsure what something is or what to do.**
It explains every file, which files you must never lose, where the app lives, and
the common tasks — in plain language.

Live site: **https://www.nemoaquastore.in** · Business Gmail: **nemoaquastore@gmail.com**

---

## 1. The big picture — where everything lives

Your store is one web app that runs in five places you should know about:

| Service | What it does | How you sign in |
|---|---|---|
| **GitHub** (`navinkumarprcivil-ui/nemo`) | Stores all the code (this repo). Every change is saved here first. | GitHub account |
| **Vercel** | Hosts the live website. It **auto-deploys** whenever code reaches the `main` branch on GitHub. | Vercel account (linked to GitHub) |
| **Firebase** (project `nemo-aqua-store`) | The database (orders, products, settings), sign-in, and image storage. | Google (admin account) |
| **Google Play Console** | The Android app listing (package `in.nemoaquastore.app`). | Google Play developer account |
| **Google Apps Script** (in `nemoaquastore@gmail.com`) | The automatic monthly/daily backup to Drive. | nemoaquastore@gmail.com |
| **Google Analytics 4** | Visitor stats (ID `G-918W409NKT`). | Google |

**Golden rule of changes:** code is edited → pushed to GitHub `main` → Vercel puts it live automatically in ~1–2 minutes. You don't "upload" the site anywhere manually.

---

## 2. 🔴 FILES YOU MUST KEEP SAFE (never lose these — they are NOT in this repo)

These live **outside** the code, on your own computer / Google Drive / password manager.
If you lose them, some things become very hard or impossible to recover. **Never put them in GitHub.**

| File / secret | What it's for | If you lose it |
|---|---|---|
| **`signing.keystore`** (the Play Store **upload key**, from PWABuilder) | Signs every Android app update so Google accepts it as the *same* app. | You may be **unable to update your Android app** under the same listing. Keep several backups (Drive + USB). Also note its **passwords**. |
| **`.aab` file** (from PWABuilder) | The Android app package you upload to Play Console. | Re-buildable from PWABuilder, but keep the latest one. |
| **Firebase service-account key** (`...firebase-adminsdk...json`) | Lets the backup script read your database. Currently pasted into **Apps Script → Script Properties → `SA_KEY`**. | Generate a new one in Firebase Console → Project Settings → Service Accounts. (Old one keeps working only if you still have the file — it's download-once.) |
| **Passwords** — Google (nemoaquastore@gmail.com), Play Console, Firebase, Vercel, GitHub, keystore passwords, Razorpay/UPI | Access to everything above. | Store them in a password manager. Losing the Gmail is the worst case — it's the hub. |
| **Admin password** for the app's admin screen | Opens Admin panel in the app. | Reset via the app's settings (needs the emailed code). |

> **Never commit** any of these to GitHub. This repo already ignores them, and I will never add them.

---

## 3. Every file in this repo — what it is and why

### The app itself (the important two)
| File | Purpose |
|---|---|
| **`app.jsx`** | **THE SOURCE OF TRUTH.** The entire app (storefront + admin) is written here (~11k lines). **All code changes happen in this file.** |
| **`app.js`** | The **compiled, minified** version of `app.jsx` that the live site actually loads (it's faster). **You must rebuild it after every `app.jsx` change** (see §4). Never edit `app.js` by hand. |
| **`index.html`** | The page shell: loads `app.js`, shows the splash-screen animation, sets up fonts, SEO tags, and the install banner. |
| **`sw.js`** | The "service worker" — makes the app installable and controls caching. Has a version line `const CACHE = 'nemo-vNN'`. **Bump this number on every release** so customers get the new version. |

### Configuration & rules
| File | Purpose |
|---|---|
| **`database.rules.json`** | Firebase security rules — who can read/write which data. ⚠️ Editing this file in the repo does **nothing** until you **publish it in the Firebase Console** (Realtime Database → Rules → paste → Publish). |
| **`storage.rules`** | Same idea, for Firebase **image storage** (payment screenshots, product photos). Also published in Firebase Console. |
| **`manifest.webmanifest`** | Makes it a PWA (installable app): name, icons, colors, shortcuts. |
| **`vercel.json`** | Hosting settings (clean URLs + security headers). |
| **`.well-known/assetlinks.json`** | Links the website to the Android app (package `in.nemoaquastore.app`) so the app opens full-screen without a browser bar. Contains the app-signing fingerprints. |
| **`robots.txt`, `sitemap.xml`** | Tell Google how to crawl the site (SEO). |
| **`google3334e7d0ab51496e.html`** | Google Search Console ownership verification. Don't delete. |

### Customer-facing extra pages (required for Play Store / trust)
| File | Purpose |
|---|---|
| **`privacy.html`** | Privacy policy (required by Play Store & Google sign-in). |
| **`delete-account.html`** | Account/data-deletion page (required by Play Data-safety). |
| **`p/`** | Static SEO product pages (one per product) so Google can index products. |
| **`guides/`** | Blog/care-guide articles for SEO traffic. |
| **`seo/`** | A small script (`generate.mjs`) + notes used to generate the SEO pages. |

### Email
| File | Purpose |
|---|---|
| **`emailjs-template.html`, `emailjs-paste-this.html`** | The order-email templates used with EmailJS (order confirmations). Reference/paste-in files. |

### Images
| File / folder | Purpose |
|---|---|
| **`assets/`** | All app icons (`favicon-512.png` = app icon), the logo (`nemo-logo.png`), fish images, and the `share-banner` (social preview). |
| **`favicon.ico`, `favicon.png`, `home.png`, `tablet-home.png`** | Browser icon + Play Store screenshots. |

### Documents (for you — not shipped to customers)
| File | Purpose |
|---|---|
| **`HANDBOOK.md`** | **This file.** |
| **`PROJECT_STATUS.md`** | Running status & handoff notes — how the app is built and what's done/pending. Read this when resuming. |
| **`LAUNCH_CHECKLIST.md`** | Play Store launch steps. |
| **`AUDIT_REPORT.md`** | A quality/feature audit with scores and to-dos. |
| **`MARKETING_PLAN.md`** | Marketing ideas. |
| **`README.md`** | Short project overview. |

---

## 4. How to make a change (the standard workflow)

1. Edit **`app.jsx`** (the source).
2. **Rebuild** `app.js`:
   ```
   npx esbuild app.jsx --loader:.jsx=jsx --jsx=transform --bundle=false --minify --outfile=app.js
   node --check app.js
   ```
3. **Bump the cache** in `sw.js` (`nemo-vNN` → next number).
4. Commit both files (and `sw.js`) and push to GitHub `main`.
5. Vercel auto-deploys in ~1–2 minutes → live.

(If you're working with Claude Code, it does all of this for you.)

**After changing `database.rules.json` or `storage.rules`:** also **publish them in the Firebase Console** — the repo copy is just a record.

---

## 5. Backups (already automated)

A **Google Apps Script** inside `nemoaquastore@gmail.com` backs everything up to Drive automatically. See the script's own comments for setup. It creates a **`Nemo Backups`** folder containing:
- `nemo-full-backup.json` — the whole database (overwritten each run + a couple of dated safety copies).
- `Nemo Orders FY####-##` — a Google Sheet per Financial Year, one tab per month. (Open → File → Download → Excel to get an `.xlsx`.)

To restore a backup: Firebase Console → Realtime Database → ⋮ → **Import JSON** → pick `nemo-full-backup.json`.

---

## 6. "I'm lost — what do I do?"

- **Change the shop content** (products, prices, delivery areas, policies, payment UPI/gateway): open the app → **Admin** (bottom, tap logo/enter password) → **Settings / Products**. No code needed.
- **See or search orders:** Admin → **Orders** tab (search bar at the top).
- **See analytics:** Admin → **Dashboard** tab.
- **The site looks broken after a change:** the last code change is the cause — revert it on GitHub (or ask Claude Code to). Vercel keeps previous deployments you can roll back to.
- **Need a data backup right now:** Apps Script → run `runNow`, **or** Admin → Settings → Data & Backup → Download.
- **Lost a password / access:** recover the Google account first (it's the hub), then the rest.
- **Don't remember how something's built:** read **`PROJECT_STATUS.md`**, then this file.

---

## 7. Quick reference — key IDs

- Firebase project: **`nemo-aqua-store`** (region `asia-southeast1`)
- Android package: **`in.nemoaquastore.app`**
- GA4 Measurement ID: **`G-918W409NKT`**
- GSTIN: **`33BWXPP8706N1ZI`** (Tamil Nadu) — display-only on invoices; not a login.
- Live domain: **`www.nemoaquastore.in`** (hosted on Vercel)

*Keep this handbook updated as the project grows.*
