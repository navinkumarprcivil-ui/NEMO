import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const buildScript=readFileSync(new URL("../scripts/build.mjs",import.meta.url),"utf8");
const cloudflareBuild=readFileSync(new URL("../scripts/build-cloudflare.mjs",import.meta.url),"utf8");
const app=readFileSync(new URL("../app.jsx",import.meta.url),"utf8");
const index=readFileSync(new URL("../index.html",import.meta.url),"utf8");

test("the owner-only Admin UI is generated as an on-demand chunk",()=>{
  assert.match(buildScript,/function splitAdminChunk\(/);
  assert.match(buildScript,/script\.src="\/admin\.js\?v="\+encodeURIComponent\(APP_BUILD\)/);
  assert.match(buildScript,/window\.NemoAdminLogin=NemoAdminLoginImpl/);
  assert.match(buildScript,/window\.NemoAdminHub=NemoAdminHubImpl/);
  assert.match(cloudflareBuild,/'admin\.js'/);
});

test("the build fingerprint includes the complete source before splitting",()=>{
  const hashAt=buildScript.indexOf('.update(src.replace(BUILD_RE');
  const splitAt=buildScript.indexOf('const split=splitAdminChunk(src)');
  assert.ok(hashAt>splitAt,"the fingerprint must be based on the complete canonical source");
});

test("EmailJS is downloaded only when an enabled email action runs",()=>{
  assert.doesNotMatch(index,/@emailjs\/browser/);
  assert.match(app,/function loadEmailJS\(\)/);
  assert.match(app,/loadEmailJS\(\)\.then/);
  assert.match(app,/const emailjs=await loadEmailJS\(\)/);
});
