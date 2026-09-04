/**
 * The type and radius scales.
 *
 * These drifted the way inline styles do: a value gets nudged for one screen, copied to the
 * next, and nobody ever sees the whole set. It reached 30 font sizes — ten of them inside a
 * 4.5px band, so small text that should read as one voice read as six — and 18 corner radii,
 * with cards at 14 sitting beside cards at 16.
 *
 * Both were snapped to a scale in one pass. Every type move was a shrink or a hold, so nothing
 * can wrap or overflow that did not before; a radius move changes shape only and can never
 * change how much room an element needs.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../app.jsx', import.meta.url), 'utf8');

const used = (prop) => {
  const seen = new Set();
  for (const m of src.matchAll(new RegExp(`\\b${prop}:(\\d+(?:\\.\\d+)?)(?![\\d.px"%])`, 'g'))) {
    seen.add(Number(m[1]));
  }
  return [...seen].sort((a, b) => a - b);
};

/* Body copy through to the display sizes. Anything outside this set is drift. */
const TYPE_SCALE = [9, 10, 11, 12, 13, 14, 16, 18, 20, 22, 24, 28, 32, 40, 48, 52, 60, 80, 110];
const RADIUS_SCALE = [4, 8, 12, 16, 20, 99];

test('every font size is on the scale', () => {
  const off = used('fontSize').filter((n) => !TYPE_SCALE.includes(n));
  assert.deepEqual(off, [], `off-scale font sizes: ${off.join(', ')}`);
});

test('no half-pixel font sizes survive', () => {
  // 11.5 beside 12, and 12.5 beside 13, is a difference nobody can name and everybody can feel.
  assert.doesNotMatch(src, /\bfontSize:\d+\.\d/);
});

test('every corner radius is on the scale', () => {
  const off = used('borderRadius').filter((n) => !RADIUS_SCALE.includes(n));
  assert.deepEqual(off, [], `off-scale radii: ${off.join(', ')}`);
});

test('the scales stay tight', () => {
  // A regression here means someone added a step rather than reusing one.
  assert.ok(used('fontSize').length <= TYPE_SCALE.length, 'type scale grew');
  assert.ok(used('borderRadius').length <= RADIUS_SCALE.length, 'radius scale grew');
});
