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
  return {totmMonthOf,totmMonthLabel,totmMonthEnd,showcaseImgs,voteCount,hasVotedFor,
          votedEntryId,totmStandings,totmMinVotes,totmEligible};`)(false);
const {totmMonthOf,totmMonthLabel,totmMonthEnd,showcaseImgs,voteCount,hasVotedFor,
       votedEntryId,totmStandings,totmMinVotes,totmEligible}=M;

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
  const votes = {v1:"a", v2:"a", v3:"b"};
  assert.equal(voteCount(a, votes), 2);
  assert.equal(voteCount(b, votes), 1);
  assert.equal(voteCount(a, {}), 0);
  // An entry claiming its own tally changes nothing — that field is never read.
  assert.equal(voteCount({...a, votes:{x:true,y:true,z:true}}, votes), 2);
});

test("one voter holds exactly one vote, and moving it is a replacement", () => {
  const a = entry("a"), b = entry("b");
  let votes = {v1:"a"};
  assert.ok(hasVotedFor(a, "v1", votes));
  assert.ok(!hasVotedFor(b, "v1", votes));
  assert.equal(votedEntryId("v1", votes), "a");
  votes = {...votes, v1:"b"};                                      // the same key is overwritten
  assert.equal(Object.keys(votes).length, 1);
  assert.equal(voteCount(a, votes), 0);
  assert.equal(voteCount(b, votes), 1);
  assert.equal(votedEntryId("nobody", votes), null);
  assert.ok(!hasVotedFor(a, null, votes));                         // signed out
});

test("standings rank by votes, and a tie goes to whoever posted first", () => {
  const early = entry("early", {createdAt:"2026-08-01T00:00:00.000Z"});
  const late  = entry("late",  {createdAt:"2026-08-09T00:00:00.000Z"});
  const lone  = entry("lone",  {createdAt:"2026-08-05T00:00:00.000Z"});
  const votes = {v1:"late", v2:"early", v3:"lone", v4:"late", v5:"early"};
  const board = totmStandings([late, lone, early], "2026-08", votes);
  assert.deepEqual(board.map(e=>e.id), ["early","late","lone"]);   // 2,2,1 — early wins the tie
  assert.deepEqual(board.map(e=>e.votes_), [2,2,1]);
});

test("standings only count approved entries from that month", () => {
  const board = totmStandings([
    entry("live"),
    entry("pending", {approved:false}),
    entry("lastmonth", {month:"2026-07"}),
  ], "2026-08", {v1:"live", v2:"pending", v3:"lastmonth"});
  assert.deepEqual(board.map(e=>e.id), ["live"]);
});

test("an entry with no month falls back to when it was posted", () => {
  const legacy = {id:"legacy", approved:true, createdAt:"2026-08-03T00:00:00.000Z", imgData:"x"};
  assert.deepEqual(totmStandings([legacy], "2026-08", {}).map(e=>e.id), ["legacy"]);
  assert.deepEqual(totmStandings([legacy], "2026-09", {}).map(e=>e.id), []);
});

test("eligibility is the admin's minimum, and 0 means no minimum", () => {
  const a = entry("a");
  const votes = {v1:"a", v2:"a", v3:"a"};
  assert.equal(totmMinVotes({totmMinVotes:5}), 5);
  assert.equal(totmMinVotes({}), 0);
  assert.equal(totmMinVotes({totmMinVotes:-3}), 0);
  assert.ok(!totmEligible(a, {totmMinVotes:5}, votes));            // 3 of 5
  assert.ok(totmEligible(a, {totmMinVotes:3}, votes));             // exactly on the line
  assert.ok(totmEligible(a, {totmMinVotes:0}, votes));
  assert.ok(!totmEligible(a, {totmMinVotes:1}, {}));               // nobody voted
});
