/**
 * Water-test readings → the action a customer is given.
 *
 *   node --test test/watertests.test.mjs
 *
 * This is advice about live animals, so the rules are run rather than reviewed. The one that
 * matters most is the first: any detectable ammonia or nitrite must produce an urgent card,
 * whatever else the tank reads, because that is the reading people lose fish to while waiting
 * for a weekly reminder.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import test from "node:test";
import assert from "node:assert";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = readFileSync(join(root, "app.jsx"), "utf8");
// Stop before WaterChart — everything past it is JSX.
const code = src.slice(src.indexOf("const WATER_LOG_MAX="), src.indexOf("/* One parameter, over time."));
const M = new Function(code + `
  return {WATER_PARAMS,WATER_LOG_MAX,numOrNull,waterLog,latestTest,waterVerdict,WATER_LEVELS};`)();
const { WATER_PARAMS, numOrNull, latestTest, waterVerdict, WATER_LEVELS } = M;

const tankWith = (...rows) => ({litres:100, tests: rows.map((r,i) => ({at:`2026-08-${10+i}T09:00:00.000Z`, ...r}))});

test("a reading is only a number when it is one", () => {
  assert.equal(numOrNull(""), null);
  assert.equal(numOrNull(null), null);
  assert.equal(numOrNull(undefined), null);
  assert.equal(numOrNull("abc"), null);
  assert.equal(numOrNull(NaN), null);
  assert.equal(numOrNull(0), 0);                       // zero is a reading, not a blank
  assert.equal(numOrNull("0.25"), 0.25);
  assert.equal(numOrNull(-1), -1);
});

test("no tests means no advice invented", () => {
  assert.equal(waterVerdict({litres:100}), null);
  assert.equal(waterVerdict({litres:100, tests:[]}), null);
  assert.equal(latestTest({litres:100, tests:[]}), null);
});

test("the newest reading is the one that speaks", () => {
  // stored newest-first, as the app writes them
  const t = {litres:100, tests:[{at:"2026-08-14", nh3:0, no2:0, no3:10}, {at:"2026-08-01", nh3:4, no2:4}]};
  assert.equal(waterVerdict(t).level, "good");         // yesterday's disaster is not today's advice
});

test("ANY detectable ammonia or nitrite is urgent, whatever else reads fine", () => {
  for (const row of [{nh3:0.25}, {no2:0.25}, {nh3:0.25, no2:0.25}, {nh3:0.01}, {no2:8, no3:0}]) {
    const v = waterVerdict(tankWith({no3:5, ph:7.2, ...row}));
    assert.equal(v.level, "urgent", JSON.stringify(row));
    assert.match(v.dos.join(" "), /50%/);              // a big change, now
    assert.match(v.dos.join(" "), /Stop feeding/);
    assert.match(v.dos.join(" "), /not add any fish/);
    assert.match(v.dos.join(" "), /Re-test tomorrow/);
  }
  // and it names which one, so the customer can check the right bottle
  assert.match(waterVerdict(tankWith({nh3:0.5, no2:0})).title, /ammonia 0\.5 ppm/);
  assert.match(waterVerdict(tankWith({nh3:0, no2:1})).title, /nitrite 1 ppm/);
  assert.match(waterVerdict(tankWith({nh3:0.5, no2:1})).title, /ammonia .* and nitrite/);
});

test("urgent outranks every other reading in the same test", () => {
  // high nitrate AND a bad pH AND ammonia -> still the ammonia card
  const v = waterVerdict(tankWith({nh3:0.5, no2:0, no3:160, ph:9.2}));
  assert.equal(v.level, "urgent");
});

test("zero ammonia and nitrite with nitrate present is a healthy, cycled tank", () => {
  const v = waterVerdict(tankWith({nh3:0, no2:0, no3:20, ph:7.2}));
  assert.equal(v.level, "good");
  assert.match(v.why, /cycled/);
  assert.match(v.dos.join(" "), /25%/);                // the usual amount, offered not ordered
});

test("nitrate is graded, not a single threshold", () => {
  assert.equal(waterVerdict(tankWith({nh3:0, no2:0, no3:40})).level, "good");    // on the line
  assert.equal(waterVerdict(tankWith({nh3:0, no2:0, no3:41})).level, "watch");
  assert.equal(waterVerdict(tankWith({nh3:0, no2:0, no3:79})).level, "watch");
  assert.equal(waterVerdict(tankWith({nh3:0, no2:0, no3:80})).level, "serious");
  assert.match(waterVerdict(tankWith({nh3:0, no2:0, no3:160})).dos.join(" "), /in steps/);
});

test("the suggested change is a volume for THIS tank, and scales with it", () => {
  assert.match(waterVerdict({litres:200, tests:[{at:"x", nh3:0.5}]}).dos[0], /100 L \(50%\)/);
  assert.match(waterVerdict({litres:40,  tests:[{at:"x", nh3:0.5}]}).dos[0], /20 L \(50%\)/);
  // no volume on the profile: still advice, just no invented litres
  const noVol = waterVerdict({tests:[{at:"x", nh3:0.5}]});
  assert.equal(noVol.level, "urgent");
  assert.match(noVol.dos[0], /50% of the tank/);
});

test("pH is only flagged at the extremes, and never told to chase it", () => {
  assert.equal(waterVerdict(tankWith({nh3:0, no2:0, no3:10, ph:6.0})).level, "good");
  assert.equal(waterVerdict(tankWith({nh3:0, no2:0, no3:10, ph:8.4})).level, "good");
  const low = waterVerdict(tankWith({nh3:0, no2:0, no3:10, ph:5.5}));
  assert.equal(low.level, "watch");
  assert.match(low.dos.join(" "), /Never chase it/);
  assert.equal(waterVerdict(tankWith({nh3:0, no2:0, no3:10, ph:8.8})).level, "watch");
});

test("a partly filled test still gives advice on what was entered", () => {
  const v = waterVerdict(tankWith({no3:100}));         // nitrate only — ammonia untested
  assert.equal(v.level, "serious");
  const only = waterVerdict(tankWith({ph:7.0}));       // pH only, and it is fine
  assert.equal(only.level, "good");
});

test("every level the verdict can return has a card to render it", () => {
  for (const lvl of ["urgent","serious","watch","good"]) {
    assert.ok(WATER_LEVELS[lvl], lvl);
    assert.ok(WATER_LEVELS[lvl].icon && WATER_LEVELS[lvl].label);
  }
});

test("ammonia and nitrite have no safe band above zero", () => {
  const nh3 = WATER_PARAMS.find(p => p.k === "nh3");
  const no2 = WATER_PARAMS.find(p => p.k === "no2");
  assert.equal(nh3.hi, 0);
  assert.equal(no2.hi, 0);
  assert.ok(WATER_PARAMS.find(p => p.k === "no3").hi > 0);
});
