import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

for (const file of ["app.jsx","src/app.jsx"]) {
  const source=fs.readFileSync(new URL("../"+file,import.meta.url),"utf8");
  test(file+" holds the cinematic opening for inner boot data",()=>{
    assert.match(source,/const \[communityReady,setCommunityReady\] = useState\(false\)/);
    assert.match(source,/showcaseSettled&&testimonialsSettled\)\{ clearTimeout\(guard\); setCommunityReady\(true\); \}/);
    assert.match(source,/waitForFirebase\(4000\)/);
    assert.match(source,/if\(loading\|\|!hydrated\|\|!settingsReady\|\|!communityReady\|\|!walletReady\) return/);
    assert.match(source,/setTimeout\(\(\)=>\{ if\(alive\) setCommunityReady\(true\); \},8000\)/);
  });
}

test("index releases the splash from boot readiness, never a display timer",()=>{
  const source=fs.readFileSync(new URL("../index.html",import.meta.url),"utf8");
  assert.match(source,/window\.nemoSplashReady=fadeSplash/);
  assert.doesNotMatch(source,/SPLASH_(?:MIN|MAX)_MS/);
  assert.doesNotMatch(source,/setTimeout\(hideSplashNow/);
  assert.match(source,/window\.nemoSplashFailed/);
});

test("the splash shows determinate progress, not an indeterminate spinner",()=>{
  const index=fs.readFileSync(new URL("../index.html",import.meta.url),"utf8");
  // The bar and its percentage exist in the pre-React shell, so they paint before any script.
  assert.match(index,/id="splash-bar"/);
  assert.match(index,/id="splash-pct"/);
  assert.match(index,/role="progressbar"/);
  assert.match(index,/aria-valuenow="0"/);
  // The old ring is gone entirely — markup, CSS and the failure screen's reference to it.
  assert.doesNotMatch(index,/class="spin"/);
  assert.doesNotMatch(index,/querySelector\("\.spin"\)/);
  // index.html owns the number and keeps it monotonic, so no caller can make it go backwards.
  assert.match(index,/window\.nemoSplashProgress=function/);
  assert.match(index,/if\(v>progValue\)/);
  // The creep is capped above the last real milestone, so it cannot run ahead of real work.
  assert.match(index,/progCeil=Math\.min\(96/);
});

for (const file of ["app.jsx","src/app.jsx"]) {
  test(file+" reports boot progress from the same gates that release the splash",()=>{
    const source=fs.readFileSync(new URL("../"+file,import.meta.url),"utf8");
    assert.match(source,/function bootProgress\(pct\)/);
    // Progress is derived from real readiness, never from a timer.
    assert.match(source,/\[!loading,hydrated,settingsReady,communityReady,walletReady\]\.filter\(Boolean\)\.length/);
    assert.match(source,/bootProgress\(40\+done\*12\)/);
    assert.match(source,/bootProgress\(100\)/);
  });
}
