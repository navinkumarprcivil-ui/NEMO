/**
 * The Aqua Tools community planner, checked against real stocking scenarios.
 *
 *   node --test test/aquatools.test.mjs
 *
 * The planner's rules live in app.jsx as plain functions with no React in them, so they are
 * lifted out of the source and run directly — the sandbox cannot render the app, and these
 * rules are the part that must not be wrong. A verdict this gets backwards is a customer
 * putting a 40 cm Oscar in a 100 L tank on our advice.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import test from "node:test";
import assert from "node:assert";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = readFileSync(join(root, "app.jsx"), "utf8");
const slice = (from, to) => src.slice(src.indexOf(from), src.indexOf(to));
const code = slice("const SPECIES={", "function tankStorageKey(") + slice("function tankStorageKey(", "function AquaToolsPage(");
const M = new Function(code + `
  return {SPECIES,pairIssues,speciesIssues,tankIssues,loadReport,shapeLitres,overlap,V_OK,V_COND,V_INFO,V_BAD};`)();
const {SPECIES,pairIssues,speciesIssues,tankIssues,loadReport,shapeLitres,V_OK,V_COND,V_INFO,V_BAD}=M;

const worst = arr => arr.length ? Math.max(...arr.map(i=>i.v)) : V_OK;
const tank = o => ({type:"tropical",litres:100,lengthCm:90,tempC:26,cycled:"yes",filter:"HOB",...o});
const texts = arr => arr.map(i=>i.r).join(" | ");

test("species data is complete and self-consistent", () => {
  for (const [k,s] of Object.entries(SPECIES)) {
    for (const f of ["n","sci","e","grp","size","minL","minLen","t","ph","gh","temper","school","lvl","bio"])
      assert.ok(s[f]!==undefined, `${k} missing ${f}`);
    assert.ok(s.t[0] < s.t[1], `${k} bad temp range`);
    assert.ok(s.ph[0] < s.ph[1], `${k} bad pH range`);
    assert.ok(s.gh[0] < s.gh[1], `${k} bad hardness range`);
    assert.ok(s.size > 0 && s.minL > 0, `${k} bad size/minL`);
    assert.ok(["tropical","coldwater","pond","invert"].includes(s.grp), `${k} bad group`);
  }
});

test("the database changes that were asked for are in place", () => {
  assert.equal(SPECIES.koi.grp, "pond");                       // Koi moved out of the tank list
  assert.ok(SPECIES.goldfancy && SPECIES.goldcomet);           // goldfish split
  assert.notEqual(SPECIES.goldfancy.minL, SPECIES.goldcomet.minL);
  assert.ok(!SPECIES.snail);                                   // generic "Snail" gone
  ["nerite","mystery","ramshorn","trumpet"].forEach(k => assert.ok(SPECIES[k], `${k} missing`));
  assert.ok(SPECIES.oscar.size >= 40 && SPECIES.oscar.big);    // large fish flagged
  assert.ok(SPECIES.commonpleco.big && SPECIES.balashark.big);
});

test("cold and tropical water cannot be mixed", () => {
  const r = pairIssues("wcmm","discus");
  assert.equal(worst(r), V_BAD);
  assert.match(texts(r), /No shared temperature/);
});

test("Koi is refused as an aquarium fish, whatever it is paired with", () => {
  assert.equal(worst(pairIssues("koi","goldfancy")), V_BAD);
  assert.match(texts(pairIssues("koi","neon")), /pond fish/);
  assert.equal(worst(speciesIssues("koi", 2, tank())), V_BAD);
});

test("shrimp are judged separately from fish", () => {
  const hunted = pairIssues("betta","cherryshrimp");          // shr:2 — hunts adults
  assert.equal(worst(hunted), V_BAD);
  assert.match(texts(hunted), /hunts/);
  const babies = pairIssues("guppy","cherryshrimp");          // shr:1 — takes babies only
  assert.equal(worst(babies), V_COND);
  assert.match(texts(babies), /baby/);
  const safe = pairIssues("cory","cherryshrimp");             // shr:0
  assert.ok(!texts(safe).match(/eat|hunt/i));
});

test("predation uses adult size, not shop size", () => {
  const r = pairIssues("oscar","neon");
  assert.equal(worst(r), V_BAD);
  assert.match(texts(r), /40 cm/);
});

test("fin-nipping is a condition, and names the fix", () => {
  const r = pairIssues("tigerbarb","guppy");
  assert.equal(worst(r), V_COND);
  assert.match(texts(r), /nips long fins/);
  assert.match(texts(r), /group of 8/);
});

test("a good match reports nothing to fix", () => {
  assert.equal(pairIssues("neon","cory").length, 0);
  assert.equal(worst(speciesIssues("neon", 8, tank())), V_OK);
});

test("group size is checked against the quantity, not the species alone", () => {
  assert.equal(worst(speciesIssues("neon", 2, tank())), V_COND);
  assert.match(texts(speciesIssues("neon", 2, tank())), /keep 6 or more/);
  assert.equal(worst(speciesIssues("neon", 8, tank())), V_OK);
});

test("two male bettas are refused", () => {
  const r = speciesIssues("betta", 2, tank());
  assert.equal(worst(r), V_BAD);
  assert.match(texts(r), /only 1/);
  assert.equal(worst(speciesIssues("betta", 1, tank({litres:30,lengthCm:40}))), V_OK);
});

test("tank volume and length are both enforced", () => {
  assert.equal(worst(speciesIssues("oscar", 1, tank({litres:100}))), V_BAD);
  const len = speciesIssues("balashark", 4, tank({litres:600, lengthCm:100}));
  assert.match(texts(len), /swimming length/);
});

test("missing information asks rather than guesses", () => {
  const r = tankIssues({type:"tropical"}, []);
  assert.equal(worst(r), V_INFO);
  assert.match(texts(r), /volume not set/);
  assert.match(texts(r), /temperature not set/);
  assert.match(texts(r), /Cycling status unknown/);
});

test("an uncycled tank warns once, not once per fish", () => {
  assert.match(texts(tankIssues(tank({cycled:"no"}), [])), /not cycled/);
  assert.equal(worst(tankIssues(tank({cycled:"no"}), [])), V_COND);
  // the same warning must NOT also come back from each species
  assert.ok(!texts(speciesIssues("neon", 8, tank({cycled:"no"}))).match(/cycl/i));
  assert.equal(tankIssues(tank(), []).length, 0);            // a fully described tank is quiet
});

test("waste load is a band, and names the heavy species", () => {
  assert.equal(loadReport([{key:"neon",qty:8}], {litres:100}).level, "light");
  const over = loadReport([{key:"goldfancy",qty:4}], {litres:100});
  assert.equal(over.level, "over");
  assert.deepEqual(over.heavy, ["Fancy Goldfish"]);
  assert.equal(loadReport([{key:"neon",qty:8}], {}).level, "unknown");
});

test("volume maths covers all four shapes", () => {
  assert.equal(shapeLitres("rect", 60, 30, 36), 65);            // 60×30×36 cm
  assert.equal(shapeLitres("cube", 40, 40, 40), 64);
  assert.equal(shapeLitres("cyl", 40, 0, 50), 63);              // ø40 × 50 cm
  assert.ok(shapeLitres("bow", 60, 30, 36) > shapeLitres("rect", 60, 30, 36));
  assert.equal(shapeLitres("rect", 60, 30, 0), 0);              // incomplete -> no guess
});
