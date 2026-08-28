import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app=readFileSync(new URL("../app.jsx",import.meta.url),"utf8");
const index=readFileSync(new URL("../index.html",import.meta.url),"utf8");

test("Firebase App Check loads in dependency order and activates before Firebase services",()=>{
  const tags=[...index.matchAll(/firebasejs\/10\.12\.5\/firebase-([^"/]+)-compat\.js/g)].map(x=>x[1]);
  assert.deepEqual(tags,["app","auth","database","storage","app-check"]);
  const init=app.slice(app.indexOf("function tryInitFirebase("),app.indexOf("/* The SDK is loaded async"));
  const activateAt=init.indexOf("firebase.appCheck().activate(");
  const servicesAt=init.indexOf("FB_DB=firebase.database()");
  assert.ok(activateAt>=0&&servicesAt>activateAt,"App Check must activate before Database/Auth are obtained");
  assert.match(init,/new firebase\.appCheck\.ReCaptchaV3Provider\(APPCHECK_SITE_KEY\)/);
  assert.match(init,/ReCaptchaV3Provider\(APPCHECK_SITE_KEY\),\s*true/);
});

test("production never enables the App Check debug provider",()=>{
  const debug=app.slice(app.indexOf("function tryInitFirebase("),app.indexOf("/* The SDK is loaded async"));
  assert.match(debug,/location\.hostname==="localhost"\|\|location\.hostname==="127\.0\.0\.1"/);
  assert.equal((debug.match(/FIREBASE_APPCHECK_DEBUG_TOKEN=true/g)||[]).length,1);
});
