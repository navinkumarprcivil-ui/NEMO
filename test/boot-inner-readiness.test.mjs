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

test("index keeps only a bounded crash fallback",()=>{
  const source=fs.readFileSync(new URL("../index.html",import.meta.url),"utf8");
  assert.match(source,/var SPLASH_MAX_MS = 10000/);
  assert.match(source,/window\.nemoSplashReady=fadeSplash/);
});
