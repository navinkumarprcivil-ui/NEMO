# Nemo Aqua Store

Mobile-first aquarium storefront powered by React, Firebase Realtime Database and a Cloudflare Worker.

Production:

- Store: https://www.nemoaquastore.in
- Apex redirect: https://nemoaquastore.in → https://www.nemoaquastore.in
- Hosting and server routes: Cloudflare Workers
- Payments: Cashfree sandbox until production approval is complete

## Architecture

The Cloudflare Worker serves the static storefront and adapts the existing API handlers for the Workers runtime.

- `index.html`, `app.js`, `app.jsx` — storefront
- `assets/` — images, icons and branding
- `cloudflare/worker.js` — Worker router, security headers and scheduled handler
- `api/` — payment, SEO, sharing, loyalty, referral and tank-maintenance handlers
- `lib/` — shared catalogue and payment helpers used by the API handlers
- `scripts/build.mjs` — compiles `app.jsx` to `app.js` and updates the build version
- `scripts/build-cloudflare.mjs` — prepares static assets in `cf-dist/`
- `wrangler.jsonc` — Cloudflare routes, assets, cron and environment configuration
- `database.rules.json`, `storage.rules` — Firebase rules published separately
- `test/` — Node test suite

The `api/` and `lib/` directories are required by `cloudflare/worker.js`; they are not legacy hosting files.

## Local setup

```bash
npm install
node scripts/build.mjs
npm run build
```

Preview locally:

```bash
npm run preview
```

Validate the Cloudflare bundle without deploying:

```bash
npm run cf:check
```

Run the tests:

```bash
node --test test/*.test.mjs
```

Whenever `app.jsx` or `index.html` changes, run `node scripts/build.mjs` so `app.js`, `version.json` and the service-worker cache version stay synchronized.

## Cloudflare deployment

Cloudflare Git integration deploys the production Worker from `main`. A manual deployment can be run from an authenticated development environment with:

```bash
npm run deploy
```

Production routes are configured in `wrangler.jsonc`:

- `www.nemoaquastore.in`
- `nemoaquastore.in`
- `/p/*` product pages
- `/s/*` share pages
- `/sitemap.xml`
- `/api/*` supported API routes
- Daily tank-cleanup cron

The temporary `workers.dev` route is disabled.

## Runtime secrets

Configure secrets in Cloudflare; never commit or paste their values into repository files:

- `CASHFREE_APP_ID`
- `CASHFREE_SECRET_KEY`
- `FIREBASE_SERVICE_ACCOUNT`
- `CRON_SECRET`

`CASHFREE_ENV` must remain `sandbox` until Cashfree approves the website and sandbox checkout, webhook delivery and server-side verification all pass.

## Firebase

Firebase Authentication and Realtime Database remain the application data services. Publish `database.rules.json` and `storage.rules` through Firebase when those files change.

Authorized production domains should include:

- `nemoaquastore.in`
- `www.nemoaquastore.in`

## Safety

Do not commit:

- Firebase service-account JSON
- Cashfree secret keys
- Cloudflare API tokens
- Android signing keystores or passwords
- Local `.env*` or `.dev.vars*` files

The repository is now Cloudflare-only. No Vercel project or configuration is required.
