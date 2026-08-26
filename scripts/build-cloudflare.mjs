import { builtSource } from './build.mjs';
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';

const ROOT = process.cwd();
const OUT = join(ROOT, 'cf-dist');

const exactFiles = new Set([
  'index.html',
  'app.js',
  'app.jsx',
  'sw.js',
  'manifest.webmanifest',
  'robots.txt',
  'favicon.ico',
  'version.json',
]);
const rootImageExts = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg']);

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });

const entries = await readdir(ROOT, { withFileTypes: true });
for (const entry of entries) {
  const source = join(ROOT, entry.name);
  const target = join(OUT, entry.name);

  if (entry.isDirectory()) {
    if (entry.name === 'assets' || entry.name === '.well-known') {
      await cp(source, target, { recursive: true });
    }
    continue;
  }

  const ext = extname(entry.name).toLowerCase();
  const isPublicHtml = ext === '.html' && !entry.name.endsWith('.dc.html') && !entry.name.startsWith('_preview-');
  const isPublicRootImage = rootImageExts.has(ext);
  if (exactFiles.has(entry.name) || isPublicHtml || isPublicRootImage) {
    if (entry.name === 'app.jsx') {
      // The repository keeps the legacy monolith untouched; the public fallback must match app.js.
      await writeFile(target, builtSource, 'utf8');
    } else if (entry.name === 'index.html') {
      // A native Android WebView is not browser `standalone`, so the old probe briefly rendered
      // the "Get the Nemo app" banner inside the app before Android hid it. The WebView supplies
      // NemoAquaStoreAndroid in its user agent; treat that as installed-app mode synchronously,
      // before the first paint. Normal browser/PWA behaviour is unchanged.
      let html = await readFile(source, 'utf8');
      const standaloneProbe = "  var standalone=(window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone===true;";
      const nativeAwareProbe = "  var nemoNativeAndroid=/NemoAquaStoreAndroid/i.test(navigator.userAgent||'');\n  var standalone=nemoNativeAndroid || (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone===true;";
      if (!html.includes(standaloneProbe)) throw new Error('index.html installed-app probe not found');
      html = html.replace(standaloneProbe, nativeAwareProbe);
      await writeFile(target, html, 'utf8');
    } else {
      await cp(source, target);
    }
  }
}

const headers = `/*
  X-Frame-Options: SAMEORIGIN
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: geolocation=(), microphone=(), camera=(), payment=(self), usb=()
  Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
  X-Permitted-Cross-Domain-Policies: none
  Cross-Origin-Opener-Policy: same-origin-allow-popups

/assets/*
  Cache-Control: public, max-age=31536000, immutable
`;
await writeFile(join(OUT, '_headers'), headers, 'utf8');

for (const required of ['index.html', 'app.js', 'sw.js', 'manifest.webmanifest']) {
  try {
    const info = await stat(join(OUT, required));
    if (!info.isFile()) throw new Error();
  } catch {
    throw new Error(`Cloudflare build is missing required public file: ${required}`);
  }
}

console.log('Cloudflare static assets prepared in cf-dist/');
