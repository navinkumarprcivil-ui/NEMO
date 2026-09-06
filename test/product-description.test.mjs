/**
 * The product description and the Home swipe. Both are small pieces of UI whose failure modes
 * are quiet: a description that renders admin text as markup, a "Read more" that appears on a
 * one-line description, or a swipe that fires while someone is scrolling a row of products.
 * Each assertion below is one of those.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync('app.jsx', 'utf8');

test('bold is a markdown subset, never HTML', () => {
  assert.match(app, /function boldParts\(text\)/);
  assert.match(app, /out\.push\(<strong key=\{m\.index\}/,
    'emphasis must be a React element, so the surrounding text stays escaped');
  const fn = app.slice(app.indexOf('function boldParts'), app.indexOf('function ProductDescription'));
  assert.doesNotMatch(fn, /dangerouslySetInnerHTML/,
    'rendering the description as HTML would give a co-admin a script tag on every product page');
});

test('the clamp is measured, not guessed', () => {
  assert.match(app, /el\.scrollHeight>el\.clientHeight\+2/,
    'a character-count heuristic is wrong on every screen but the one it was tuned on');
  assert.match(app, /WebkitLineClamp:3/);
  assert.match(app, /document\.fonts\.ready\)\s*document\.fonts\.ready\.then\(check\)/,
    'webfonts change the height after first paint, so one measurement is not enough');
});

test('Read more appears only when there is more to read', () => {
  assert.match(app, /\{\(clipped\|\|expanded\)&&\(/,
    'a one-line description must not offer to expand');
  assert.match(app, /if\(!String\(text\|\|""\)\.trim\(\)\) return null;/,
    'an empty description should render nothing at all, not an empty box');
});

test('the swipe yields the screen edges to Android', () => {
  // Android 10+ claims a strip at BOTH edges for its Back gesture. A drawer opened by an
  // edge swipe either never fires or fires as well as going back.
  assert.match(app, /const swipeFrom=useRef\(null\);/);
  assert.match(app, /if\(t\.clientX<SWIPE_EDGE\|\|t\.clientX>w-SWIPE_EDGE\) return;/);
});

test('the swipe yields to any horizontal scroller under the finger', () => {
  // Home is built from rows that scroll sideways. Measuring beats naming them: a list of
  // class names would rot the first time a new row is added.
  assert.match(app, /if\(el\.scrollWidth>el\.clientWidth\+4\)\{/);
  assert.match(app, /for\(let el=e\.target; el&&el!==e\.currentTarget; el=el\.parentElement\)/);
});

test('an element that merely overflows does not claim the swipe', () => {
  // The hero clips two decorative circles off its right edge, so it overflows while
  // scrolling nothing. Width alone rejected every swipe starting in the top of the page,
  // which is where people swipe. Only auto/scroll is a row the finger could drag.
  assert.match(app, /getComputedStyle\(el\)\.overflowX/);
  assert.match(app, /if\(ox==="auto"\|\|ox==="scroll"\) return;/);
});

test('only a deliberate sideways gesture navigates', () => {
  assert.match(app, /if\(Math\.abs\(dx\)<SWIPE_MIN\|\|Math\.abs\(dx\)<Math\.abs\(dy\)\*2\) return;/,
    'a diagonal flick during a scroll must not change page');
  assert.match(app, /if\(menuOpen\|\|walletOpen\|\|suggOpen\) return;/,
    'a swipe behind an open drawer or modal is not a swipe on Home');
  assert.match(app, /if\(dx>0\) setMenuOpen\(true\); else nav\("shop"\);/);
});
