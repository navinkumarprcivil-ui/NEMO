import payCreate from '../api/pay-create.js';
import payVerify from '../api/pay-verify.js';
import payRefund from '../api/pay-refund.js';
import payWebhook from '../api/pay-webhook.js';
import loyaltyRestore from '../api/loyalty-restore.js';
import referralStatus from '../api/referral-status.js';
import tankStreak from '../api/tank-streak.js';
import tankCleanup from '../api/cron-tank-cleanup.js';
import sharePage from '../api/share.js';
import productPage from '../api/product-page.js';
import sitemap from '../api/sitemap.js';

const API = new Map([
  ['/api/pay-create', payCreate],
  ['/api/pay-verify', payVerify],
  ['/api/pay-refund', payRefund],
  ['/api/pay-webhook', payWebhook],
  ['/api/loyalty-restore', loyaltyRestore],
  ['/api/referral-status', referralStatus],
  ['/api/tank-streak', tankStreak],
  ['/api/cron-tank-cleanup', tankCleanup],
]);

const securityHeaders = {
  'X-Frame-Options': 'SAMEORIGIN',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'geolocation=(), microphone=(), camera=(), payment=(self), usb=()',
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
  'X-Permitted-Cross-Domain-Policies': 'none',
  'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
};

function headersObject(headers) {
  const out = {};
  for (const [key, value] of headers.entries()) out[key.toLowerCase()] = value;
  return out;
}

async function nodeLikeRequest(request, url, { rawBody = false } = {}) {
  const req = {
    method: request.method,
    headers: headersObject(request.headers),
    query: Object.fromEntries(url.searchParams.entries()),
    body: undefined,
  };

  if (!['GET', 'HEAD'].includes(request.method)) {
    const text = await request.text();
    if (rawBody) {
      req.body = text;
    } else if ((request.headers.get('content-type') || '').toLowerCase().includes('application/json')) {
      try { req.body = text ? JSON.parse(text) : {}; }
      catch { req.body = {}; }
    } else {
      req.body = text;
    }
  }
  return req;
}

function responseAdapter() {
  let status = 200;
  const headers = new Headers(securityHeaders);
  let body = null;
  let finished = false;

  const finish = (value) => {
    if (finished) return api;
    body = value == null ? null : value;
    finished = true;
    return api;
  };

  const api = {
    status(code) { status = Number(code) || 200; return api; },
    setHeader(name, value) { headers.set(name, String(value)); return api; },
    getHeader(name) { return headers.get(name); },
    json(value) {
      if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json; charset=utf-8');
      return finish(JSON.stringify(value));
    },
    send(value) {
      if (value != null && typeof value === 'object' && !(value instanceof ArrayBuffer) && !ArrayBuffer.isView(value)) {
        if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json; charset=utf-8');
        return finish(JSON.stringify(value));
      }
      return finish(value == null ? null : String(value));
    },
    end(value) { return finish(value == null ? null : String(value)); },
    toResponse() { return new Response(body, { status, headers }); },
  };
  return api;
}

async function runHandler(handler, request, url, options) {
  const req = await nodeLikeRequest(request, url, options);
  const res = responseAdapter();
  try {
    await handler(req, res);
    return res.toResponse();
  } catch (error) {
    console.error(JSON.stringify({
      event: 'handler_exception',
      path: url.pathname,
      message: String(error?.message || error),
    }));
    return new Response(JSON.stringify({ error: 'internal-server-error' }), {
      status: 500,
      headers: { ...securityHeaders, 'Content-Type': 'application/json; charset=utf-8' },
    });
  }
}

function withQuery(url, key, value) {
  const next = new URL(url);
  next.searchParams.set(key, value);
  return next;
}

function redirectApex(url) {
  const target = new URL(url);
  target.protocol = 'https:';
  target.hostname = 'www.nemoaquastore.in';
  target.port = '';
  return new Response(null, {
    status: 308,
    headers: {
      ...securityHeaders,
      Location: target.toString(),
      'Cache-Control': 'public, max-age=3600',
    },
  });
}

const MEDIA_DB = 'https://nemo-aqua-store-default-rtdb.asia-southeast1.firebasedatabase.app';

function imageBytes(dataUrl) {
  if (typeof dataUrl !== 'string') return null;
  const match = dataUrl.match(/^data:(image\/(?:jpeg|png|webp|gif|avif));base64,([\s\S]+)$/i);
  if (!match) return null;

  try {
    const binary = atob(match[2].replace(/\s+/g, ''));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return { type: match[1].toLowerCase(), bytes };
  } catch {
    return null;
  }
}

async function shareImageResponse(request, url, mediaKey) {
  if (!/^[A-Za-z0-9_-]{1,96}$/.test(mediaKey)) {
    return new Response('Not found', {
      status: 404,
      headers: { ...securityHeaders, 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }

  const preferThumb = url.searchParams.get('thumb') === '1';
  const candidates = preferThumb ? [`${mediaKey}_thumb`, mediaKey] : [mediaKey];

  for (const key of candidates) {
    try {
      const dbResponse = await fetch(
        `${MEDIA_DB}/media/${encodeURIComponent(key)}.json`,
        { cf: { cacheTtl: 3600, cacheEverything: true } }
      );
      if (!dbResponse.ok) continue;

      const stored = await dbResponse.json();
      if (typeof stored === 'string' && /^https?:\/\//i.test(stored)) {
        return new Response(null, {
          status: 302,
          headers: {
            ...securityHeaders,
            Location: stored,
            'Cache-Control': 'public, max-age=3600, s-maxage=86400',
          },
        });
      }

      const decoded = imageBytes(stored);
      if (!decoded) continue;

      const headers = {
        ...securityHeaders,
        'Content-Type': decoded.type,
        'Content-Length': String(decoded.bytes.byteLength),
        'Content-Disposition': 'inline',
        'Cache-Control': 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400',
        'Access-Control-Allow-Origin': '*',
      };
      return new Response(request.method === 'HEAD' ? null : decoded.bytes, {
        status: 200,
        headers,
      });
    } catch {
      // Try the full image when a thumbnail is unavailable.
    }
  }

  return new Response(null, {
    status: 302,
    headers: {
      ...securityHeaders,
      Location: 'https://www.nemoaquastore.in/assets/share-banner.jpg',
      'Cache-Control': 'public, max-age=300, s-maxage=300',
    },
  });
}

async function staticAssetResponse(request, env, path) {
  const response = await env.ASSETS.fetch(request);
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(securityHeaders)) headers.set(name, value);
  if (path.startsWith('/assets/')) {
    headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function scheduledCleanup(env) {
  const url = new URL('https://nemo.internal/api/cron-tank-cleanup');
  const req = new Request(url, {
    method: 'GET',
    headers: { authorization: `Bearer ${env.CRON_SECRET || ''}` },
  });
  const response = await runHandler(tankCleanup, req, url);
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`tank-cleanup ${response.status}: ${detail.slice(0, 200)}`);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.hostname === 'nemoaquastore.in') return redirectApex(url);

    const path = url.pathname.replace(/\/+$/, '') || '/';

    if (path.startsWith('/share-image/')) {
      let mediaKey = '';
      try { mediaKey = decodeURIComponent(path.slice('/share-image/'.length)); }
      catch { return new Response('Not found', { status: 404 }); }
      return shareImageResponse(request, url, mediaKey);
    }

    if (path === '/sitemap.xml') return runHandler(sitemap, request, url);

    if (path === '/p' || path.startsWith('/p/')) {
      const slug = path === '/p' ? '' : decodeURIComponent(path.slice(3));
      return runHandler(productPage, request, withQuery(url, 'slug', slug));
    }

    if (path.startsWith('/s/')) {
      const id = decodeURIComponent(path.slice(3));
      return runHandler(sharePage, request, withQuery(url, 'id', id));
    }

    const handler = API.get(path);
    if (handler) {
      return runHandler(handler, request, url, { rawBody: path === '/api/pay-webhook' });
    }

    if (path.startsWith('/api/')) {
      return new Response(JSON.stringify({ error: 'not-found' }), {
        status: 404,
        headers: { ...securityHeaders, 'Content-Type': 'application/json; charset=utf-8' },
      });
    }

    return staticAssetResponse(request, env, path);
  },

  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(scheduledCleanup(env));
  },
};
