import { cp, mkdir, readdir, rm, stat } from 'node:fs/promises';
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
    await cp(source, target);
  }
}

for (const required of ['index.html', 'app.js', 'sw.js', 'manifest.webmanifest']) {
  try {
    const info = await stat(join(OUT, required));
    if (!info.isFile()) throw new Error();
  } catch {
    throw new Error(`Cloudflare build is missing required public file: ${required}`);
  }
}

console.log('Cloudflare static assets prepared in cf-dist/');
