/**
 * The live-fish switch, applied to static HTML.
 *
 * index.html is the one surface the owner's setting could not reach: it is a file, not a
 * render, so its SEO copy needed a hand edit and a deploy every time the switch moved. The
 * Worker rewrites it on the way out. That only works while the selectors it targets still match
 * elements that exist — a renamed id fails silently and serves the wrong store to Google, with
 * nothing in any log to say so. These assertions are the thing that notices.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const worker = readFileSync(new URL('../cloudflare/worker.js', import.meta.url), 'utf8');

/** Every selector the Worker rewrites, pulled from the Worker itself rather than restated. */
function targetedSelectors() {
  const found = [];
  for (const m of worker.matchAll(/rewriter = rewriter\.on\('([^']+)'/g)) found.push(m[1]);
  for (const block of worker.matchAll(/const LIVE_FISH_(?:SEO|COPY) = \{([\s\S]*?)\n\};/g)) {
    for (const m of block[1].matchAll(/^\s*'([^']+)':/gm)) found.push(m[1]);
  }
  return [...new Set(found)];
}

test('every selector the Worker rewrites matches something in index.html', () => {
  const selectors = targetedSelectors();
  assert.ok(selectors.length >= 6, `expected the full set, found ${selectors.length}`);
  for (const sel of selectors) {
    const idMatch = sel.match(/^(\w+)#([\w-]+)$/);
    const attrMatch = sel.match(/^meta\[(name|property)="([^"]+)"\]$/);
    if (idMatch) {
      const [, tag, id] = idMatch;
      assert.ok(new RegExp(`<${tag}\\s[^>]*id="${id}"`).test(html), `no <${tag} id="${id}"> in index.html`);
    } else if (attrMatch) {
      const [, attr, value] = attrMatch;
      assert.ok(new RegExp(`<meta\\s[^>]*${attr}="${value}"`).test(html), `no <meta ${attr}="${value}"> in index.html`);
    } else {
      assert.fail(`selector "${sel}" is not one this test knows how to verify`);
    }
  }
});

test('the committed HTML is the fish-free version', () => {
  // Only one wording is shipped. The rewrite adds live fish when the switch is on; it never
  // takes them away, so a committed file that already mentions them could not be switched off.
  const noscript = html.slice(html.indexOf('<noscript>'), html.indexOf('</noscript>'));
  assert.doesNotMatch(noscript, /live fish/i);
  assert.doesNotMatch(html.slice(html.indexOf('id="ld-store"'), html.indexOf('id="ld-store"') + 900), /live fish/i);
});

test('the rewrite is skipped entirely while the switch is off', () => {
  // The default state must cost nothing: no settings read, no HTMLRewriter pass.
  assert.match(worker, /return \(await liveFishForSeo\(ctx\)\) \? withLiveFishSeo\(out\) : out;/);
  // Non-HTML assets never reach it either.
  assert.match(worker, /if \(!isHtml \|\| !response\.ok\) return out;/);
});

test('a settings read that fails or stalls leaves the store fish-free', () => {
  assert.match(worker, /let liveFishKnown = false;/);
  assert.match(worker, /\.catch\(\(\) => \{\}\)/, 'a failed read keeps the previous answer');
  assert.match(worker, /Promise\.race\(\[pending, new Promise\(\(resolve\) => setTimeout\(resolve, SETTINGS_FIRST_READ_MS\)\)\]\)/);
});

test('the Store entity is rebuilt from parsed JSON, never patched as text', () => {
  const ld = worker.slice(worker.indexOf("rewriter.on('script#ld-store'"), worker.indexOf('return rewriter.transform'));
  assert.match(ld, /ldBuffer \+= chunk\.text;/);
  assert.match(ld, /if \(!chunk\.lastInTextNode\) \{ chunk\.remove\(\); return; \}/);
  assert.match(ld, /JSON\.parse\(ldBuffer\)/);
  // Broken JSON-LD is worse than stale JSON-LD.
  assert.match(ld, /catch \{[\s\S]*?\}/);
});
