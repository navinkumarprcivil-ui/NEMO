/**
 * Tank of the Month — vote counting, standings and eligibility.
 *
 *   node --test test/tankmonth.test.mjs
 *
 * These decide who gets paid, so they are lifted out of app.jsx and run directly rather than
 * eyeballed in the UI. The vote model is the part worth pinning down: votes live in
 * totmVotes/<month>/<voter> = <entryId>, one key per voter, so "one vote each" is the shape of
 * the data and not a rule the app remembers to apply.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import test from "node:test";
import assert from "node:assert";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = readFileSync(join(root, "app.jsx"), "utf8");
const code = src.slice(src.indexOf("function totmMonthOf("), src.indexOf("function showcaseApproved("))
           + "function showcaseApproved(x){ return x && x.approved!==false; }";
const M = new Function("FB_OK", code + `
  return {totmMonthOf,totmDayOf,totmMonthLabel,totmMonthEnd,showcaseImgs,voteCount,
          hasVotedToday,votesCastToday,totmStandings,totmMinVotes,totmEligible};`)(false);
const {totmMonthOf,totmDayOf,totmMonthLabel,totmMonthEnd,showcaseImgs,voteCount,
       hasVotedToday,votesCastToday,totmStandings,totmMinVotes,totmEligible}=M;
/* totmVotes/<month>/<entryId>/<day>/<voter> = true */
const ballots = pairs => {
  const out = {};
  for (const [entry, day, voter] of pairs) {
    out[entry] = out[entry] || {};
    out[entry][day] = out[entry][day] || {};
    out[entry][day][voter] = true;
  }
  return out;
};
const D1 = "2026-08-01", D2 = "2026-08-02";

const entry = (id, o={}) => ({id, approved:true, userUid:"u-"+id, ownerName:id,
  month:"2026-08", createdAt:"2026-08-01T00:00:00.000Z", imgData:"IMG-"+id, ...o});

test("a month key and its end are derived, never stored twice", () => {
  assert.equal(totmMonthOf(Date.parse("2026-08-14T10:00:00Z")), "2026-08");
  assert.equal(totmMonthOf(Date.parse("2026-01-01T00:00:00Z")), "2026-01");
  const end = totmMonthEnd(Date.parse("2026-08-14T10:00:00Z"));
  assert.equal(new Date(end).getMonth(), 7);                       // still August, locally
  assert.ok(end > Date.parse("2026-08-31T00:00:00Z"));             // past the last day
  assert.ok(end < Date.parse("2026-09-02T00:00:00Z"));
  assert.match(totmMonthLabel("2026-08"), /August 2026/);
});

test("photos read the same whether the entry is old or new", () => {
  assert.deepEqual(showcaseImgs({imgData:"a"}), ["a"]);            // pre multi-image entry
  assert.deepEqual(showcaseImgs({imgData:"a", imgs:["a","b"]}), ["a","b"]);
  assert.deepEqual(showcaseImgs({imgs:[]}), []);
  assert.deepEqual(showcaseImgs(null), []);
});

test("votes are counted off the ballot map, not off the entry", () => {
  const a = entry("a"), b = entry("b");
  const votes = ballots([["a",D1,"v1"],["a",D1,"v2"],["b",D1,"v3"]]);
  assert.equal(voteCount(a, votes), 2);
  assert.equal(voteCount(b, votes), 1);
  assert.equal(voteCount(a, {}), 0);
  // An entry claiming its own tally changes nothing — that field is never read.
  assert.equal(voteCount({...a, votes:{x:true,y:true,z:true}}, votes), 2);
});

test("a voter may back many tanks a day, but each of them only once", () => {
  const a = entry("a"), b = entry("b");
  // one person, two tanks, same day — both count
  let votes = ballots([["a",D1,"v1"],["b",D1,"v1"]]);
  assert.equal(voteCount(a, votes), 1);
  assert.equal(voteCount(b, votes), 1);
  assert.equal(votesCastToday("v1", votes, D1), 2);
  assert.ok(hasVotedToday(a, "v1", votes, D1));
  assert.ok(hasVotedToday(b, "v1", votes, D1));
  // voting the same tank again the same day writes the key it already holds — still one
  votes = ballots([["a",D1,"v1"],["a",D1,"v1"],["b",D1,"v1"]]);
  assert.equal(voteCount(a, votes), 1);
});

test("the same tank can be voted again on a later day, and both count", () => {
  const a = entry("a");
  const votes = ballots([["a",D1,"v1"],["a",D2,"v1"]]);
  assert.equal(voteCount(a, votes), 2);                            // a returning voter adds
  assert.ok(hasVotedToday(a, "v1", votes, D2));
  assert.ok(!hasVotedToday(a, "v2", votes, D2));                   // someone else has not
  assert.equal(votesCastToday("v1", votes, D2), 1);                // one tank backed today
  assert.equal(votesCastToday("v1", {}, D2), 0);
  assert.ok(!hasVotedToday(a, null, votes, D1));                   // signed out
});

test("a day key is the calendar day, not the month", () => {
  assert.equal(totmDayOf(Date.parse("2026-08-14T23:30:00Z")), "2026-08-14");
  assert.notEqual(totmDayOf(Date.parse("2026-08-14T00:00:00Z")), totmDayOf(Date.parse("2026-08-15T00:00:00Z")));
});

test("standings rank by votes, and a tie goes to whoever posted first", () => {
  const early = entry("early", {createdAt:"2026-08-01T00:00:00.000Z"});
  const late  = entry("late",  {createdAt:"2026-08-09T00:00:00.000Z"});
  const lone  = entry("lone",  {createdAt:"2026-08-05T00:00:00.000Z"});
  const votes = ballots([["late",D1,"v1"],["early",D1,"v2"],["lone",D1,"v3"],["late",D2,"v1"],["early",D2,"v2"]]);
  const board = totmStandings([late, lone, early], "2026-08", votes);
  assert.deepEqual(board.map(e=>e.id), ["early","late","lone"]);   // 2,2,1 — early wins the tie
  assert.deepEqual(board.map(e=>e.votes_), [2,2,1]);
});

test("standings only count approved entries from that month", () => {
  const board = totmStandings([
    entry("live"),
    entry("pending", {approved:false}),
    entry("lastmonth", {month:"2026-07"}),
  ], "2026-08", ballots([["live",D1,"v1"],["pending",D1,"v2"],["lastmonth",D1,"v3"]]));
  assert.deepEqual(board.map(e=>e.id), ["live"]);
});

test("an entry with no month falls back to when it was posted", () => {
  const legacy = {id:"legacy", approved:true, createdAt:"2026-08-03T00:00:00.000Z", imgData:"x"};
  assert.deepEqual(totmStandings([legacy], "2026-08", {}).map(e=>e.id), ["legacy"]);
  assert.deepEqual(totmStandings([legacy], "2026-09", {}).map(e=>e.id), []);
});

test("eligibility is the admin's minimum, and 0 means no minimum", () => {
  const a = entry("a");
  const votes = ballots([["a",D1,"v1"],["a",D1,"v2"],["a",D2,"v1"]]);
  assert.equal(totmMinVotes({totmMinVotes:5}), 5);
  assert.equal(totmMinVotes({}), 0);
  assert.equal(totmMinVotes({totmMinVotes:-3}), 0);
  assert.ok(!totmEligible(a, {totmMinVotes:5}, votes));            // 3 of 5
  assert.ok(totmEligible(a, {totmMinVotes:3}, votes));             // exactly on the line
  assert.ok(totmEligible(a, {totmMinVotes:0}, votes));
  assert.ok(!totmEligible(a, {totmMinVotes:1}, {}));               // nobody voted
});
