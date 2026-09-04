import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

for (const file of ["app.jsx","src/app.jsx"]) {
  const source=fs.readFileSync(new URL("../"+file,import.meta.url),"utf8");
  test(file+" holds the cinematic opening for inner boot data",()=>{
    assert.match(source,/const \[communityReady,setCommunityReady\] = useState\(false\)/);
    assert.match(source,/showcaseSettled&&testimonialsSettled\)\{ clearTimeout\(guard\); setCommunityReady\(true\); \}/);
    assert.match(source,/waitForFirebase\(4000\)/);
    assert.match(source,/if\(loading\|\|!hydrated\|\|!settingsReady\|\|!communityReady\|\|!walletReady\|\|!fontsReady\) return/);
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
    assert.match(source,/\[!loading,hydrated,settingsReady,communityReady,walletReady,fontsReady\]\.filter\(Boolean\)\.length/);
    assert.match(source,/bootProgress\(40\+done\*10\)/);
    assert.match(source,/bootProgress\(100\)/);
  });
}

/* The sixth gate is the webfont. It is the one boot gate that is not about data — it exists so
   the page does not re-typeset itself a moment after the shopper starts reading — and it has
   two halves that are easy to get subtly wrong. */
test("the font gate waits for the faces, not merely for the stylesheet",()=>{
  const index=fs.readFileSync(new URL("../index.html",import.meta.url),"utf8");
  // document.fonts.ready would resolve immediately here: the @font-face rules have only just
  // become active, so nothing is pending yet. Named faces are what wait for the files.
  assert.match(index,/f\.load\("400 1rem 'Plus Jakarta Sans'"\)/);
  assert.match(index,/f\.load\("800 1rem 'Plus Jakarta Sans'"\)/);
  assert.doesNotMatch(index,/document\.fonts\.ready/);
  // A stylesheet that never loads, or a browser with no Font Loading API, must still release.
  assert.match(index,/onerror="nemoFontsDone\(\)"/);
  assert.match(index,/if \(!f \|\| !f\.load\) \{ window\.nemoFontsDone\(\); return; \}/);
});

for (const file of ["app.jsx","src/app.jsx"]) {
  test(file+" bounds the font wait so typography cannot hold the store",()=>{
    const source=fs.readFileSync(new URL("../"+file,import.meta.url),"utf8");
    assert.match(source,/const cap=setTimeout\(done,1200\);/);
    assert.match(source,/window\.addEventListener\("nemo-fonts-ready",done,\{once:true\}\)/);
    // Already-loaded fonts (a warm cache fires the event before this effect runs) must not
    // leave the gate closed forever, so the initial state reads the flag index.html set.
    assert.match(source,/useState\(\(\)=>\{ try\{ return window\.__nemoFontsReady===true; \}catch\(e\)\{ return true; \} \}\)/);
  });
}
