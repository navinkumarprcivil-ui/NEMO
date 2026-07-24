# scripts/

Helper scripts that live **outside** the website but are kept here so GitHub is their backup.

## `nemo-backup.gs` — automatic Drive backup + GST/inventory export (Google Apps Script)

Runs inside **nemoaquastore@gmail.com** (Google Apps Script, https://script.google.com).
It is **not** part of the website — Vercel never runs it. It's stored here only so you
always have the latest copy version-controlled.

**What it produces in Drive → `Nemo Backups`:**
- `nemo-full-backup.json` — full database, overwritten monthly (+ a couple of dated copies).
- `Nemo Orders FY####-##` — one Google Sheet per Financial Year, a tab per month, **with GST
  breakup (CGST/SGST/IGST)** for ITC filing. Refreshed **daily**.
- `Nemo Inventory` — stock, sold/returned qty, prices. Refreshed **daily**.

**Setup / re-deploy:** see the big comment block at the top of `nemo-backup.gs`. In short:
paste the file into the Apps Script project, add the Firebase service-account JSON as a Script
Property named `SA_KEY`, then run `setup()` once.

### 🔴 What must NEVER be committed here
Secrets are **not** in this repo and must stay out:
- the Firebase **service-account key** JSON (lives only in Apps Script → Script Properties → `SA_KEY`)
- the Play Store **`signing.keystore`** + its passwords
- any account passwords

Those are backed up separately (Drive/USB/password manager) — see `../HANDBOOK.md` §2.

### Columns marked "(app)" in the inventory sheet
Fields like SKU, Barcode, Brand, Supplier, Opening/Purchased/Damaged stock, Reorder Level and
Purchase Price don't exist in the app yet, so those columns stay blank until we add them to the
product form (or you fill them by hand). Everything else populates automatically.
