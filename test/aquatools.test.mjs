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
// Two slices: the planner rules, then the tank/volume helpers. The water-test block between
// them holds a React component, so it is stepped over rather than parsed.
const code = slice("const SPECIES={", "/* ── Water tests ──")
           + slice("function tankStorageKey(", "function AquaToolsPage(");
const M = new Function(code + `
  return {SPECIES,pairIssues,speciesIssues,tankIssues,loadReport,shapeLitres,overlap,V_OK,V_COND,V_INFO,V_BAD};`)();
/* The whole planner, the way the page assembles it: tank + species + pairs, worst wins. */
const verdictOf = (stock, tank, M2) => {
  const { speciesIssues, tankIssues, pairIssues, loadReport, V_OK, V_BAD, V_COND, V_INFO } = M2;
  const merged = [];
  stock.forEach(({key, qty}) => {                       // duplicates collapse, as the picker does
    const at = merged.find(m => m.key === key);
    if (at) at.qty += qty; else merged.push({key, qty});
  });
  const issues = [
    ...tankIssues(tank, merged),
    ...merged.flatMap(({key, qty}) => speciesIssues(key, qty, tank)),
  ];
  for (let i = 0; i < merged.length; i++)
    for (let j = i + 1; j < merged.length; j++)
      issues.push(...pairIssues(merged[i].key, merged[j].key));
  const load = loadReport(merged, tank);
  if (load.level === "over") issues.push({v: V_BAD, r: "over"});
  else if (load.level === "full") issues.push({v: V_COND, r: "full"});
  else if (load.level === "unknown") issues.push({v: V_INFO, r: "unknown"});
  return {worst: issues.length ? Math.max(...issues.map(i => i.v)) : V_OK, issues, merged};
};
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

/* ── Weekly care reminder ── */
const CARE = new Function(
  src.slice(src.indexOf("const CARE_INTERVAL_DAYS="), src.indexOf("async function googleSignIn(")) +
  "return {CARE_INTERVAL_DAYS,careDue,careChangeLitres};")();

const daysAgo = n => new Date(Date.now() - n*864e5).toISOString();

test("care is due a week after the last one, and not before", () => {
  const { careDue, CARE_INTERVAL_DAYS } = CARE;
  assert.equal(CARE_INTERVAL_DAYS, 7);
  assert.equal(careDue({litres:100, lastCareAt:daysAgo(0)}).due, false);
  assert.equal(careDue({litres:100, lastCareAt:daysAgo(6)}).due, false);
  assert.equal(careDue({litres:100, lastCareAt:daysAgo(7)}).due, true);
  assert.equal(careDue({litres:100, lastCareAt:daysAgo(30)}).days, 30);
});

test("a tank with no care logged falls back to its set-up date, then to due", () => {
  const { careDue } = CARE;
  assert.equal(careDue({litres:100, setUpOn:daysAgo(2)}).due, false);   // set up two days ago
  assert.equal(careDue({litres:100, setUpOn:daysAgo(9)}).due, true);
  const fresh = careDue({litres:100});
  assert.equal(fresh.due, true);
  assert.equal(fresh.never, true);                                      // asks rather than counts
});

test("no tank volume means no reminder to give", () => {
  assert.equal(CARE.careDue({}).due, false);
  assert.equal(CARE.careDue(null).due, false);
});

test("the change volume follows the stocking level", () => {
  const { careChangeLitres } = CARE;
  assert.equal(careChangeLitres({litres:100}, false), 25);
  assert.equal(careChangeLitres({litres:100}, true), 35);               // heavily stocked
  assert.equal(careChangeLitres({}, false), 0);
});

/* ── The pre-beta list: properties that must hold for EVERY input, not just the ones
      somebody thought to click through. ── */

test("centimetres and inches give the same tank", () => {
  const { shapeLitres } = M;
  const inch = v => v * 2.54;
  for (const [l, w, h] of [[60,30,36],[120,45,50],[24,24,24]]) {
    const cm = shapeLitres("rect", l, w, h);
    const inches = shapeLitres("rect", inch(l/2.54), inch(w/2.54), inch(h/2.54));
    assert.equal(inches, cm, `${l}×${w}×${h} differs between units`);
  }
  // a tank quoted in inches, converted once: 60.96 × 30.48 × 40.64 cm = 75.51 L
  assert.equal(shapeLitres("rect", inch(24), inch(12), inch(16)), 76);
});

test("the order species are picked in never changes the verdict", () => {
  const tank = {type:"tropical", litres:120, lengthCm:90, tempC:26, cycled:"yes", filter:"HOB"};
  const set = [{key:"neon",qty:8},{key:"betta",qty:1},{key:"cory",qty:6},{key:"cherryshrimp",qty:10}];
  const base = verdictOf(set, tank, M);
  const perms = [
    [3,1,0,2],[2,0,3,1],[1,3,2,0],[0,3,1,2],
  ].map(order => verdictOf(order.map(i => set[i]), tank, M));
  for (const p of perms) {
    assert.equal(p.worst, base.worst);
    assert.equal(p.issues.length, base.issues.length);
    // the same set of reasons, whatever order they were produced in
    assert.deepEqual(p.issues.map(i => i.r).sort(), base.issues.map(i => i.r).sort());
  }
});

test("the same fish picked twice is one line, not two", () => {
  const tank = {type:"tropical", litres:120, lengthCm:90, tempC:26, cycled:"yes", filter:"HOB"};
  const split  = verdictOf([{key:"neon",qty:3},{key:"neon",qty:3}], tank, M);
  const single = verdictOf([{key:"neon",qty:6}], tank, M);
  assert.deepEqual(split.merged, [{key:"neon", qty:6}]);
  assert.equal(split.worst, single.worst);
  assert.equal(split.worst, M.V_OK);                       // 3+3 makes a legal school of 6
  // and the merge must not hide a short school: 2+2 is still 4, still short
  assert.equal(verdictOf([{key:"neon",qty:2},{key:"neon",qty:2}], tank, M).worst, M.V_COND);
});

test("missing critical data can never come back ✅", () => {
  const stock = [{key:"neon",qty:8}];
  const partial = [
    {},                                                   // nothing known at all
    {type:"tropical"},
    {type:"tropical", litres:100},                        // no temp, no cycle state
    {type:"tropical", litres:100, tempC:26},              // no cycle state
    {type:"tropical", tempC:26, cycled:"yes"},            // no volume
  ];
  for (const tank of partial)
    assert.notEqual(verdictOf(stock, tank, M).worst, M.V_OK, `${JSON.stringify(tank)} returned a clean pass`);
  // only a fully described tank may pass
  assert.equal(verdictOf(stock, {type:"tropical",litres:100,lengthCm:80,tempC:26,cycled:"yes",filter:"HOB"}, M).worst, M.V_OK);
});

test("❌ outranks ⚠️ and ✅, whatever else is in the tank", () => {
  const tank = {type:"tropical", litres:120, lengthCm:90, tempC:26, cycled:"yes", filter:"HOB"};
  const fine = verdictOf([{key:"neon",qty:8},{key:"cory",qty:6}], tank, M);
  assert.equal(fine.worst, M.V_OK);
  // one refusal drags the whole plan down, and it is still there among many warnings
  const withOscar = verdictOf([{key:"neon",qty:8},{key:"cory",qty:6},{key:"oscar",qty:1}], tank, M);
  assert.equal(withOscar.worst, M.V_BAD);
  assert.ok(withOscar.issues.some(i => i.v === M.V_COND));  // warnings coexist, they do not win
  assert.ok(M.V_BAD > M.V_INFO && M.V_INFO > M.V_COND && M.V_COND > M.V_OK);
});

test("Koi is pond-only however good the rest of the match looks", () => {
  const { pairIssues } = M;
  const tank = {type:"tropical", litres:5000, lengthCm:400, tempC:22, cycled:"yes", filter:"big"};
  // even in a tank bigger than Koi's own minimum, an aquarium is still not a pond
  assert.equal(verdictOf([{key:"koi",qty:3}], tank, M).worst, M.V_BAD);
  // and it refuses every pairing outright, before temperature or size are even considered
  for (const other of ["goldcomet","goldfancy","neon","cherryshrimp","oscar"]) {
    const r = pairIssues("koi", other);
    assert.equal(Math.max(...r.map(i => i.v)), M.V_BAD, `koi × ${other}`);
    assert.match(r.map(i => i.r).join(" "), /pond fish/);
    assert.equal(r.length, 1, "the pond rule should short-circuit, not stack on other reasons");
  }
});

test("adding an incompatible species can never improve a plan", () => {
  const tank = {type:"tropical", litres:120, lengthCm:90, tempC:26, cycled:"yes", filter:"HOB"};
  const base = [{key:"neon",qty:8},{key:"cory",qty:6}];
  for (const bad of ["oscar","koi","goldcomet","commonpleco","betta"]) {
    const before = verdictOf(base, tank, M).worst;
    const after  = verdictOf([...base, {key:bad, qty:1}], tank, M).worst;
    assert.ok(after >= before, `adding ${bad} softened the verdict (${before} -> ${after})`);
  }
});

test("zero, negative, blank and non-numeric dimensions are refused", () => {
  const { shapeLitres } = M;
  for (const bad of [0, -30, NaN, undefined, null, "", "abc"]) {
    assert.equal(shapeLitres("rect", bad, 30, 36), 0, `length ${JSON.stringify(bad)}`);
    assert.equal(shapeLitres("rect", 60, bad, 36), 0, `width ${JSON.stringify(bad)}`);
    assert.equal(shapeLitres("rect", 60, 30, bad), 0, `height ${JSON.stringify(bad)}`);
    assert.equal(shapeLitres("cyl", bad, 0, 50), 0, `diameter ${JSON.stringify(bad)}`);
  }
  assert.equal(shapeLitres("rect", -60, -30, -36), 0);      // never a positive from three negatives
});

test("exact temperature, pH and hardness boundaries", () => {
  const { overlap, pairIssues, speciesIssues, SPECIES, V_OK, V_COND } = M;
  // touching at a single degree is an overlap, one degree apart is not
  assert.deepEqual(overlap([20,24],[24,28]), [24,24]);
  assert.equal(overlap([20,24],[25,28]), null);
  assert.deepEqual(overlap([6.0,7.5],[7.5,8.5]), [7.5,7.5]);
  // a one-degree overlap is legal but narrow, and must say so rather than pass silently
  const narrow = pairIssues("rosybarb","cardinal");         // 18–24 vs 24–29 -> touches at 24
  assert.ok(narrow.some(i => /barely overlap/.test(i.r)));
  // the target temperature sitting exactly on a species' limit is inside it, not outside
  const tank = t => ({type:"tropical", litres:100, lengthCm:80, tempC:t, cycled:"yes", filter:"HOB"});
  const n = SPECIES.neon;                                   // 21–27
  assert.equal(Math.max(...speciesIssues("neon", 8, tank(n.t[0])).map(i=>i.v), V_OK), V_OK);
  assert.equal(Math.max(...speciesIssues("neon", 8, tank(n.t[1])).map(i=>i.v), V_OK), V_OK);
  assert.equal(Math.max(...speciesIssues("neon", 8, tank(n.t[1] + 1)).map(i=>i.v), V_OK), V_COND);
  assert.equal(Math.max(...speciesIssues("neon", 8, tank(n.t[0] - 1)).map(i=>i.v), V_OK), V_COND);
  // volume exactly on the minimum passes; one litre under does not
  const min = SPECIES.cory.minL;
  const at = {type:"tropical", litres:min, lengthCm:80, tempC:24, cycled:"yes", filter:"HOB"};
  assert.ok(!speciesIssues("cory", 6, at).some(i => i.v === M.V_BAD));
  assert.ok(speciesIssues("cory", 6, {...at, litres:min - 1}).some(i => i.v === M.V_BAD));
});
