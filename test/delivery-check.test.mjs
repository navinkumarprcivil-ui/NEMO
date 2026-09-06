/** One delivery check, on the page where the question is asked.
 *
 * There were two: a banner at the bottom of Home and a small card on the product page. The
 * product page is where "does this reach me?" is actually being asked — you are looking at the
 * fish — so that is the one that stays, and it has to be able to answer.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync('app.jsx', 'utf8');

test('the product-page check has a button to press', () => {
  const fn = app.slice(app.indexOf('function DeliveryEstimate'), app.indexOf('function fbtItems'));
  assert.match(fn, /onClick=\{check\}[\s\S]{0,220}>Check<\/button>/,
    'the result used to appear on its own once six digits were typed, which reads as nothing '
    + 'happening — and left "that is not a pincode" with nowhere to be said');
  assert.match(fn, /onKeyDown=\{e=>\{if\(e\.key==="Enter"\)check\(\);\}\}/,
    'the keyboard Enter key must do what the button does');
  assert.match(fn, /setPin\(e\.target\.value\.replace\(\/\\D\/g,""\)\.slice\(0,6\)\);setRes\(null\);/,
    'editing the pincode must clear the previous answer, not leave it standing under a new number');
  assert.match(fn, /setRes\(zone\?\{zone,live:!liveFishBlockedForZone\(zone,settings\)\}:\{err:true\}\)/);
});

test('the live-fish caveat reaches the product page', () => {
  // It only ever existed in the Home banner. Deleting that without carrying it over would have
  // quietly dropped the one thing a North India customer needs to know before buying a fish.
  const fn = app.slice(app.indexOf('function DeliveryEstimate'), app.indexOf('function fbtItems'));
  assert.match(fn, /const fishPage=LIVE_FISH_ENABLED&&isLiveFishCategory\(category\);/,
    'a filter or a bag of feed must not warn about live-fish zones');
  assert.match(fn, /fishPage&&!res\.live&&\(/);
  assert.match(fn, /live fish don't\. For their safety we send live stock only within Tamil Nadu/);
});

test('the estimate is given the settings it judges against', () => {
  // It took a settings prop and was rendered without one, so liveFishRestrictNCIndia=false —
  // the admin switch that turns the restriction OFF — could never be seen.
  assert.match(app, /<DeliveryEstimate settings=\{settings\} category=\{p\.category\}\/>/);
  assert.match(app, /function DetailPage\(\{product:p,products=\[\],mediaCache=\{\},media=\{images:\[\],video:null\},settings=\{\},/);
  assert.match(app, /<DetailPage product=\{selProduct\}[\s\S]{0,200}settings=\{settings\}/);
});

test('Home no longer asks the same question a second time', () => {
  assert.doesNotMatch(app, /PincodeChecker/,
    'the component and its call site both go — a dead 40-line component is worse than none');
});
