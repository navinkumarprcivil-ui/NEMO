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
  // The store is built from rows that scroll sideways. Measuring beats naming them: a list
  // of class names would rot the first time a new row is added. And overflowing is not the
  // same as scrollable — the hero clips two decorative circles off its right edge, so it
  // overflows while scrolling nothing, which rejected every swipe near the top of Home.
  assert.match(app, /for\(let el=e\.target; el&&el!==e\.currentTarget; el=el\.parentElement\)/);
  assert.match(app, /if\(el\.scrollWidth>el\.clientWidth\+4&&\(cs\.overflowX==="auto"\|\|cs\.overflowX==="scroll"\)\) return;/);
});

test('a swipe across an overlay is not a swipe between tabs', () => {
  // The Browse drawer, the wallet sheet and every lightbox are position:fixed. Testing that
  // is truer than naming them, and it covers overlays that do not exist yet.
  assert.match(app, /if\(cs\.position==="fixed"\) return;/);
});

test('the swipe walks the whole bottom-nav strip, both ways', () => {
  // It used to work on Home and nowhere else, which is worse than no gesture at all.
  assert.match(app, /const NAV_TABS=\["home","shop","orders","cart"\];/);
  assert.match(app, /const j=i\+\(dx>0\?-1:1\);/, 'right goes back a tab, left goes on');
  assert.match(app, /nav\(NAV_TABS\[j\]\);/);
  assert.match(app, /onTouchStart=\{onTabTouchStart\} onTouchEnd=\{onTabTouchEnd\}/,
    'the handler belongs to the scroll container, not to one page');
});

test('the ends of the strip do something sensible', () => {
  assert.match(app, /if\(j<0\)\{ setHomeMenuSignal\(n=>n\+1\); return; \}/,
    'there is no tab left of Home, so a rightward swipe opens Browse');
  assert.match(app, /if\(j>=NAV_TABS\.length\) return;/,
    'past Cart there is nothing, and wrapping round to Home would be a surprise');
  assert.match(app, /useEffect\(\(\)=>\{ if\(openMenuSignal\) setMenuOpen\(true\); \},\[openMenuSignal\]\);/,
    'the drawer is Home state, so the shell bumps a counter rather than reaching in');
});

test('only a deliberate sideways gesture navigates', () => {
  assert.match(app, /if\(Math\.abs\(dx\)<SWIPE_MIN\|\|Math\.abs\(dx\)<Math\.abs\(dy\)\*2\) return;/,
    'a diagonal flick during a scroll must not change page');
  assert.match(app, /if\(NAV_TABS\.indexOf\(page\)<0\) return;/,
    'a product page is not a tab — its gallery scrolls sideways and owns the gesture');
});
