/** The Browse drawer, and what happens to a signal nobody spends.
 *
 * Three reports, one of them with two causes:
 *   - products refused to settle for a second after arriving on Shop;
 *   - a drawer opened by swiping could not be closed by swiping;
 *   - and Browse opened by itself on arriving at Home — by swipe from Shop, and by tapping
 *     Home in the bottom bar, which is the tell: it was never about the gesture.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync('app.jsx', 'utf8');

test('the Browse signal is spent when it is acted on', () => {
  // menuOpen is Home's own state and Home unmounts when you leave it. A counter left standing
  // at 1 therefore re-fired the open-effect on every remount, for the life of the app session.
  assert.match(app, /useEffect\(\(\)=>\{ if\(!openMenuSignal\) return; setMenuOpen\(true\); onMenuOpened&&onMenuOpened\(\); \},\[openMenuSignal\]\);/);
  assert.match(app, /hydrated=true,openMenuSignal=0,onMenuOpened\}\)\{/,
    'Home must be able to tell the shell it has consumed the signal');
  assert.match(app, /openMenuSignal=\{homeMenuSignal\} onMenuOpened=\{\(\)=>setHomeMenuSignal\(0\)\}/,
    'and the shell must actually clear it');
});

test('a drawer opened by swiping closes by swiping', () => {
  const fn = app.slice(app.indexOf('function CategoryDrawer'), app.indexOf('function FoodReorderBanner'));
  assert.match(fn, /if\(dx<-70&&Math\.abs\(dx\)>Math\.abs\(dy\)\*2\) onClose&&onClose\(\);/,
    'leftward, and decisively sideways — a flick down the category list must not close it');
  assert.match(app, /<div aria-hidden=\{!open\} onTouchStart=\{onDrawerTouchStart\} onTouchEnd=\{onDrawerTouchEnd\}/,
    'the drawer is portalled under <body>, so the shell tab-swipe handler never sees these touches');
});

test('the Shop grid is not staggered in after it has been painted', () => {
  // The observer added .reveal (opacity 0, translateY 26px) on the frame AFTER mount, with up
  // to 520ms of per-card delay. Below the fold that reads as a scroll reveal; on Shop, where
  // the grid is the page and already on screen, it read as the products refusing to settle.
  assert.doesNotMatch(app, /className="prod-grid js-stagger"/);
  assert.doesNotMatch(app, /querySelectorAll\("\.js-stagger"\)/,
    'the machinery goes with its last caller, so a future grid cannot silently inherit the bug');
  // The genuine scroll reveal, on sections that do start below the fold, stays.
  assert.match(app, /querySelectorAll\("\.js-reveal:not\(\.reveal-in\)"\)/);
});
