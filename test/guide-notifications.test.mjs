/**
 * The care-guide notification switch.
 *
 * It reported "Blocked in browser" in three situations, only one of which was a block:
 * a dismissed prompt, a browser with no Notification API, and an actual denial. In all three
 * the switch was replaced by static text, so the customer could not even turn the preference
 * back OFF. These assertions pin the distinction and the escape route.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

for (const file of ['app.jsx', 'src/app.jsx']) {
  const src = readFileSync(new URL('../' + file, import.meta.url), 'utf8');
  const block = src.slice(src.indexOf('function GuideNotifBtn('), src.indexOf('function StockBadge('));

  test(file + ': a dismissed prompt is not recorded as a denial', () => {
    // The helper reports the browser's own outcome instead of a boolean.
    assert.match(src, /function requestNotifPerm\(cb\)\{[\s\S]*done\("unsupported"\)/);
    assert.match(src, /done\(p\|\|"default"\)/);
    // No caller may collapse the result back down to granted/denied.
    assert.doesNotMatch(src, /requestNotifPerm\(ok=>\{ setPerm\(ok\?"granted":"denied"\)/);
  });

  test(file + ': the switch never becomes a dead end', () => {
    // The old code returned static text whenever permission was denied, removing the control.
    assert.doesNotMatch(block, /Blocked in browser/);
    assert.match(block, /role="switch"/);
    // Turning OFF is a local preference and must work in every permission state.
    assert.match(block, /if\(on\)\{ apply\(false\); setNote\(""\); return; \}/);
  });

  test(file + ': an absent API is not reported as a block', () => {
    assert.match(block, /perm==="unsupported"/);
    assert.match(block, /This browser can't show notifications\./);
    // A real denial still explains where to undo it, rather than just stating the fact.
    assert.match(block, /browser or phone settings/);
  });

  test(file + ': permission changed outside the page is picked up', () => {
    assert.match(block, /visibilitychange/);
    assert.match(block, /navigator\.permissions\.query\(\{name:"notifications"\}\)/);
  });
}
