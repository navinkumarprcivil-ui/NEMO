# scripts/

Helper scripts that live **outside** the website but are kept here so GitHub is their backup.

## `build.mjs` — compile `app.jsx` → `app.js` (run this after every app.jsx edit)

```
node scripts/build.mjs      # needs esbuild 0.25.x: npm i esbuild
```

`index.html` runs the precompiled **`app.js`**; it only falls back to compiling `app.jsx` in the
browser if `app.js` is *missing*. A **stale** `app.js` is not detected — the site just keeps
serving the old code, and a new feature looks like it was never added. Rebuild in the same
commit as the `app.jsx` change, and bump `CACHE` in `sw.js` so installed devices refetch.

## `check-appcheck.mjs` — App Check must activate before the first request

```
npm i --no-save playwright
node scripts/check-appcheck.mjs        # REACT_DIR=<dir> to run offline
```

Under App Check enforcement a request made before `activate()` is refused. The
Firebase tags in `index.html` are `async` and land in any order, so
app-check-compat often arrives *after* auth and database — which is why
`tryInitFirebase()` waits a bounded moment for it (`APPCHECK_GRACE_MS`) instead
of quietly connecting unattested.

That grace has to stay under the `waitForFirebase(2200)` boot budget, or the
store decides there is no cloud and drops to local-only browsing. This checks
both ends: a late script is still attested, a blocked one still lets the store
open.


## `check-firstpaint.mjs` — what a first visit actually downloads

```
npm i --no-save playwright
node scripts/check-firstpaint.mjs      # CHROME_PATH=<chromium> to reuse one
```

Serves the repo, visits it cold at a desktop and a phone viewport with no cache
and no service worker, and counts bytes and requests against a budget.

Two things it exists to keep fixed:

- **The document stays small.** `index.html` used to carry the two aquarium fish
  as 313 KB of inline base64 — 84% of the file, in the middle of the markup the
  browser must parse before it can paint. They are files under `assets/` now,
  and because the fish are only drawn at ≥1000px wide they are fetched only on a
  screen wide enough to show them: a phone downloads neither.
- **`app.js` is downloaded once.** It is preloaded in `<head>` and then read with
  `fetch()`. A preload is reused only when its credentials mode matches the
  request that follows, and a mismatch is silent — the browser just pulls the
  whole 850 KB bundle a second time. The pairing is correct; this is what stops
  an innocuous edit to either half undoing it. The count comes from the server,
  not the browser, because a reused preload still fires a response event.

React, Firebase and the CDN scripts are blocked so the numbers are about this
repo and not the network. One consequence: with React missing the bundle never
defines `NemoStore`, so the loader's Babel fallback fires and pulls `app.jsx`.
That is correct behaviour, and it is why the byte budget measures the *shell* —
the document plus everything that is not the app's own code — rather than the
page total.

## `nemo-backup.gs` — automatic Drive backup + GST/inventory export (Google Apps Script)

Runs inside **nemoaquastore@gmail.com** (Google Apps Script, https://script.google.com).
It is **not** part of the website — Vercel never runs it. It's stored here only so you
always have the latest copy version-controlled.

**What it produces in Drive → `Nemo Backups`:**
- `nemo-full-backup.json` — full database, overwritten monthly (+ a couple of dated copies).
- `Nemo Orders FY####-##` — one Google Sheet per Financial Year, a tab per month. Each order is a
  **summary row + item sub-rows** (name / qty / rate), with **GST breakup (CGST/SGST/IGST)** for
  ITC, parcel weight, delivery date, and DOA/return details (customer reason, approval reason,
  resolution, refund). A **`Products & Stock`** tab (current stock, sold/returned qty, selling
  price) lives in the **same file**. Refreshed **daily**.

**Setup / re-deploy:** see the big comment block at the top of `nemo-backup.gs`. In short:
paste the file into the Apps Script project, add the Firebase service-account JSON as a Script
Property named `SA_KEY`, then run `setup()` once.

### 🔴 What must NEVER be committed here
Secrets are **not** in this repo and must stay out:
- the Firebase **service-account key** JSON (lives only in Apps Script → Script Properties → `SA_KEY`)
- the Play Store **`signing.keystore`** + its passwords
- any account passwords

Those are backed up separately (Drive/USB/password manager) — see `../HANDBOOK.md` §2.

### Scope note
The export intentionally has **no vendor/purchase fields** (SKU, barcode, brand, supplier,
purchase price, opening/purchased/damaged stock, reorder level). It covers sales/GST + current
stock only. The `Products & Stock` tab shows: Product, Category, Current Stock, Sold Qty,
Returned Qty, Selling Price.
