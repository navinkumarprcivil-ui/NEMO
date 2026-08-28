import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

for (const file of ["app.jsx","src/app.jsx"]) {
  const source=fs.readFileSync(new URL("../"+file,import.meta.url),"utf8");
  test(file+" exposes deterministic Android Back handling",()=>{
    assert.match(source,/window\.__nemoHandleAndroidBack=handleAndroidBack/);
    assert.match(source,/if\(pageRef\.current==="home"\) return "home"/);
    assert.match(source,/navStackRef\.current=\[\{page:"home",product:null\}\]/);
    assert.match(source,/setAdminExitAsk\(true\)/);
  });
}
