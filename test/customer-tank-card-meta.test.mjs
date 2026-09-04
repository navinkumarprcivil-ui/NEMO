import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

for (const file of ["app.jsx"]) {
  const source=fs.readFileSync(new URL("../"+file,import.meta.url),"utf8");
  test(file+" keeps Customer Tank metadata compact",()=>{
    const start=source.indexOf("function TankShowcaseSection");
    const end=source.indexOf("/* ═══════════════════ TESTIMONIALS",start);
    const section=source.slice(start,end);
    assert.match(section,/🗳️ \{n\} · 🕒 \{showcaseHoursLeft\(s,now\)\}h/);
    assert.match(section,/\{s\.ownerName\}<\/div>/);
    assert.doesNotMatch(section,/\{showcaseHoursLeft\(s,now\)\}h left/);
    assert.doesNotMatch(section,/\$\{n\} vote\$\{n===1/);
  });
}
