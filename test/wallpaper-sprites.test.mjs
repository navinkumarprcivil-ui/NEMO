/**
 * The wallpaper's sea life.
 *
 * The jellyfish and the puffer were hand-drawn in code until the owner supplied their own
 * stickers. Everything below guards the seam between the two: the sprite files the page names
 * must actually exist in both formats, the cut-outs must still be transparent (a JPG master
 * dropped in unprocessed would swim around inside a white rectangle), and the masters must
 * stay out of the directory the Cloudflare build copies wholesale into cf-dist.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const SPRITES = ['fish-jelly', 'fish-puffer-1', 'fish-puffer-2', 'fish-puffer-3'];

test('every sprite the page asks for exists, in both formats', () => {
  for (const name of SPRITES) {
    assert.ok(html.includes(name), `index.html never references ${name}`);
    for (const ext of ['webp', 'png']) {
      const p = new URL(`../assets/${name}.${ext}`, import.meta.url);
      assert.ok(existsSync(p), `assets/${name}.${ext} is missing`);
      assert.ok(statSync(p).size > 1000, `assets/${name}.${ext} is suspiciously small`);
    }
  }
});

test('the WebP is the one that ships and the PNG is only a fallback', () => {
  // fishSprite requests .webp and swaps to .png on error; the jellyfish layer does its own.
  assert.match(html, /img\.src='assets\/'\+name\+'\.webp'/);
  assert.match(html, /img\.src='assets\/fish-jelly\.webp'/);
  assert.match(html, /img\.src='assets\/fish-jelly\.png'/);
  for (const name of SPRITES) {
    const webp = statSync(new URL(`../assets/${name}.webp`, import.meta.url)).size;
    // A sprite drawn at most ~110px wide has no business being a large download.
    assert.ok(webp < 90_000, `assets/${name}.webp is ${webp} bytes — too heavy for a background sprite`);
  }
});

test('the cut-outs carry transparency', () => {
  // PNG colour type 6 (RGBA) or 4 (grey+alpha), read straight out of the IHDR at byte 25.
  for (const name of SPRITES) {
    const buf = readFileSync(new URL(`../assets/${name}.png`, import.meta.url));
    assert.equal(buf.toString('latin1', 1, 4), 'PNG', `${name}.png is not a PNG`);
    assert.ok([4, 6].includes(buf[25]), `${name}.png has no alpha channel — the white would show`);
  }
});

test('the masters stay out of the deployed assets directory', () => {
  // build-cloudflare.mjs copies assets/ wholesale, so a multi-megabyte source sheet left there
  // is shipped to every visitor and committed twice.
  for (const p of ['art/jelly-sticker.jpg', 'art/puffer-sticker.jpg']) {
    assert.ok(existsSync(new URL('../' + p, import.meta.url)), `${p} is missing`);
  }
  for (const p of ['assets/Jelly Sticker.jpg', 'assets/Puffer Sticker.jpg']) {
    assert.ok(!existsSync(new URL('../' + p, import.meta.url)), `${p} would be deployed as-is`);
  }
});

test('the puffer still runs its whole cycle', () => {
  const pf = html.slice(html.indexOf('function stepPuffer('), html.indexOf('function puffAt('));
  for (const state of ['calm', 'puff', 'hold', 'rise', 'gone']) {
    assert.match(pf, new RegExp(`'${state}'`), `stepPuffer lost the ${state} state`);
  }
  // A tap only lands on a calm one, and it always comes back.
  assert.match(html, /if\(!puffer\|\|puffer\.state!=='calm'\) return false;/);
  assert.match(pf, /var nx=mkPuffer\(pf\.w\);/);
  // Inflation cross-fades between neighbouring frames rather than cutting between them.
  assert.match(html, /a\*\(1-t\)/);
  assert.match(html, /a\*t/);
});
