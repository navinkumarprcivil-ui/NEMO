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
