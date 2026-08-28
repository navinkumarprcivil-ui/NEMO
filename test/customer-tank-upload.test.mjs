import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname,join } from "node:path";
import { fileURLToPath } from "node:url";

const root=join(dirname(fileURLToPath(import.meta.url)),"..");
const src=readFileSync(join(root,"app.jsx"),"utf8");
const tank=src.slice(src.indexOf("function TankShowcaseSection("),src.indexOf("function TestimonialsSection("));

test("customer tank picker can select the same image again",()=>{
  assert.match(tank,/const chosen=Array\.from\(e\.target\.files\|\|\[\]\);e\.target\.value=""/);
});

test("failed upload keeps the preview and always releases the button",()=>{
  assert.match(tank,/if\(!uploaded\) throw new Error\("tank-upload-failed"\)/);
  assert.match(tank,/Your photo is still here/);
  assert.match(tank,/finally\{\s*setUploading\(false\)/);
});

test("customer tank upload uses the bounded Firebase image compressor",()=>{
  assert.match(src,/const MAX_TANK_IMAGE_CHARS=650000/);
  assert.match(tank,/compressTankImage\(f\)/);
});

test("Firebase upload returns without waiting for the optional offline cache",()=>{
  const fn=src.slice(src.indexOf("async function addShowcasePhoto("),src.indexOf("async function approveShowcasePhoto("));
  assert.ok(fn.indexOf('await FB_DB.ref("showcase/"+item.id).set(item)')<fn.indexOf("scheduleShowcaseCacheWrite(item)"));
  assert.doesNotMatch(fn,/await scheduleShowcaseCacheWrite/);
});

test("Android WebView does not duplicate Customer Tank base64 photos into IndexedDB",()=>{
  const fn=src.slice(src.indexOf("function scheduleShowcaseCacheWrite("),src.indexOf("async function addShowcasePhoto("));
  assert.match(fn,/if\(window\.nemoInApp\) return/);
});

test("Android WebView clears legacy Customer Tank cache after a successful cloud read",()=>{
  const fn=src.slice(src.indexOf("async function loadShowcase("),src.indexOf("function scheduleShowcaseCacheWrite("));
  assert.match(fn,/if\(window\.nemoInApp\)/);
  assert.match(fn,/dbSet\("nemo-showcase","\[\]"\)/);
});
