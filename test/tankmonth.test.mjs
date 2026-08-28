/**
 * Tank of the Month — vote counting, standings and eligibility.
 *
 *   node --test test/tankmonth.test.mjs
 *
 * These decide who gets paid, so they are lifted out of app.jsx and run directly rather than
 * eyeballed in the UI. New votes live in totmVotes/<month>/<entry>/_once/<voter> = true;
 * legacy daily buckets remain readable but are deduplicated per image and voter.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import test from "node:test";
import assert from "node:assert";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = readFileSync(join(root, "app.jsx"), "utf8");
const code = src.slice(src.indexOf("const SHOWCASE_TTL"), src.indexOf("function loadTankStreakLocal("));
const M = new Function("FB_OK", code + `
  return {totmMonthOf,previousTotmMonth,adminRewardReminderPeriod,totmDayOf,totmMonthLabel,totmMonthEnd,tankVoteRewardOn,tankStreakRewardOn,showcaseImgs,voteCount,
          hasVotedForTank,totmStandings,totmMinVotes,totmEligible,
          showcaseExpiry,showcaseExpired,showcasePendingExpiry,showcasePendingExpired,showcaseHoursLeft,computeTankUploadStreak,monthUploadStats,tankMonthlyRows,replacementForApproval};`)(false);
const {totmMonthOf,previousTotmMonth,adminRewardReminderPeriod,totmDayOf,totmMonthLabel,totmMonthEnd,tankVoteRewardOn,tankStreakRewardOn,showcaseImgs,voteCount,
       hasVotedForTank,totmStandings,totmMinVotes,totmEligible,
       showcaseExpiry,showcaseExpired,showcasePendingExpiry,showcasePendingExpired,showcaseHoursLeft,computeTankUploadStreak,monthUploadStats,tankMonthlyRows,replacementForApproval}=M;
/* Legacy ballot fixture: totmVotes/<month>/<entryId>/<day>/<voter> = true. */
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
  assert.equal(previousTotmMonth(Date.parse("2026-01-15T00:00:00Z")), "2025-12");
  assert.equal(totmMonthOf(Date.parse("2026-08-31T18:29:59Z")), "2026-08");
  assert.equal(totmMonthOf(Date.parse("2026-08-31T18:30:00Z")), "2026-09");
});

test("the two monthly tank rewards can be switched independently", () => {
  assert.equal(tankVoteRewardOn({totmEnabled:true}), true);
  assert.equal(tankVoteRewardOn({totmEnabled:false}), false);
  assert.equal(tankStreakRewardOn({tankStreakRewardEnabled:true}), true);
  assert.equal(tankStreakRewardOn({tankStreakRewardEnabled:false}), false);
  assert.equal(tankStreakRewardOn({}), true); // preserves the existing streak reward until the admin turns it off
});

test("Admin reminds on the IST month end and keeps the same reward month for seven days", () => {
  assert.deepEqual(adminRewardReminderPeriod(Date.parse("2026-08-31T18:29:59Z")),{month:"2026-08",phase:"month-end"});
  assert.deepEqual(adminRewardReminderPeriod(Date.parse("2026-08-31T18:30:00Z")),{month:"2026-08",phase:"follow-up"});
  assert.deepEqual(adminRewardReminderPeriod(Date.parse("2026-09-07T18:29:59Z")),{month:"2026-08",phase:"follow-up"});
  assert.equal(adminRewardReminderPeriod(Date.parse("2026-09-07T18:30:00Z")),null);
});

test("monthly totals add votes across every approved daily image for one customer", () => {
  const entries=[
    entry("day-one",{userUid:"u1",ownerName:"Nila",createdAt:"2026-08-01T08:00:00Z"}),
    entry("day-two",{userUid:"u1",ownerName:"Nila",createdAt:"2026-08-02T08:00:00Z"}),
    entry("other",{userUid:"u2",ownerName:"Ravi",createdAt:"2026-08-02T09:00:00Z"}),
  ];
  const votes=ballots([["day-one",D1,"v1"],["day-one",D1,"v2"],["day-two",D2,"v1"],["other",D2,"v3"]]);
  const rows=tankMonthlyRows(entries,votes,{},"2026-08");
  assert.equal(rows.find(row=>row.uid==="u1").votes,3);
  assert.equal(rows.find(row=>row.uid==="u2").votes,1);
});

test("only approved share days build a monthly streak and a missed day ends it", () => {
  const approvedDays={u1:{
    "2026-08-01":{ownerName:"Nila"},
    "2026-08-02":{ownerName:"Nila"},
    "2026-08-04":{ownerName:"Nila"},
  }};
  const row=tankMonthlyRows([],{},approvedDays,"2026-08")[0];
  assert.equal(row.ownerName,"Nila");
  assert.equal(row.streak,2);
  assert.deepEqual(row.uploadDays,["2026-08-01","2026-08-02","2026-08-04"]);
  assert.equal(monthUploadStats(approvedDays.u1,"2026-08").best,2);
});

test("approving a replacement selects only the customer's current approved tank", () => {
  const current=entry("old",{userUid:"u1",expiresAt:Date.now()+60000});
  const pending=entry("new",{userUid:"u1",approved:false});
  const other=entry("other",{userUid:"u2",expiresAt:Date.now()+60000});
  assert.equal(replacementForApproval([current,pending,other],pending).id,"old");
  assert.equal(replacementForApproval([other],pending),null);
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

test("a voter may back many tank images, but each image only once", () => {
  const a = entry("a"), b = entry("b");
  // one person, two tank images — both count
  let votes = ballots([["a",D1,"v1"],["b",D1,"v1"]]);
  assert.equal(voteCount(a, votes), 1);
  assert.equal(voteCount(b, votes), 1);
  assert.ok(hasVotedForTank(a, "v1", votes));
  assert.ok(hasVotedForTank(b, "v1", votes));
  // repeating the same image remains one vote
  votes = ballots([["a",D1,"v1"],["a",D1,"v1"],["b",D1,"v1"]]);
  assert.equal(voteCount(a, votes), 1);
});

test("legacy repeat-day votes for the same image are deduplicated by voter", () => {
  const a = entry("a");
  const votes = ballots([["a",D1,"v1"],["a",D2,"v1"]]);
  assert.equal(voteCount(a, votes), 1);
  assert.ok(hasVotedForTank(a, "v1", votes));
  assert.ok(!hasVotedForTank(a, "v2", votes));
  assert.ok(!hasVotedForTank(a, null, votes));
});

test("new once-only ballots use the canonical bucket", () => {
  const a=entry("a"), votes={a:{_once:{v1:true,v2:true}}};
  assert.equal(voteCount(a,votes),2);
  assert.ok(hasVotedForTank(a,"v1",votes));
});

test("a day key is the calendar day, not the month", () => {
  assert.equal(totmDayOf(Date.parse("2026-08-14T18:29:59Z")), "2026-08-14");
  assert.equal(totmDayOf(Date.parse("2026-08-14T18:30:00Z")), "2026-08-15");
  assert.notEqual(totmDayOf(Date.parse("2026-08-14T00:00:00Z")), totmDayOf(Date.parse("2026-08-15T00:00:00Z")));
});

test("standings rank by votes, and a tie goes to whoever posted first", () => {
  const early = entry("early", {createdAt:"2026-08-01T00:00:00.000Z"});
  const late  = entry("late",  {createdAt:"2026-08-09T00:00:00.000Z"});
  const lone  = entry("lone",  {createdAt:"2026-08-05T00:00:00.000Z"});
  const votes = ballots([["late",D1,"v1"],["early",D1,"v2"],["lone",D1,"v3"],["late",D2,"v4"],["early",D2,"v5"]]);
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
  const votes = ballots([["a",D1,"v1"],["a",D1,"v2"],["a",D2,"v3"]]);
  assert.equal(totmMinVotes({totmMinVotes:5}), 5);
  assert.equal(totmMinVotes({}), 0);
  assert.equal(totmMinVotes({totmMinVotes:-3}), 0);
  assert.ok(!totmEligible(a, {totmMinVotes:5}, votes));            // 3 of 5
  assert.ok(totmEligible(a, {totmMinVotes:3}, votes));             // exactly on the line
  assert.ok(totmEligible(a, {totmMinVotes:0}, votes));
  assert.ok(!totmEligible(a, {totmMinVotes:1}, {}));               // nobody voted
});

test("approved tank photos show hours remaining and expire at exactly 24 hours", () => {
  const approvedAt = Date.parse("2026-08-17T08:00:00Z");
  const photo = {expiresAt: approvedAt + 24 * 60 * 60 * 1000};
  assert.equal(showcaseHoursLeft(photo, approvedAt), 24);
  assert.equal(showcaseHoursLeft(photo, approvedAt + 23.2 * 60 * 60 * 1000), 1);
  assert.ok(!showcaseExpired(photo, approvedAt + 24 * 60 * 60 * 1000 - 1));
  assert.ok(showcaseExpired(photo, approvedAt + 24 * 60 * 60 * 1000));
  assert.equal(showcaseHoursLeft(photo, approvedAt + 24 * 60 * 60 * 1000), 0);

  const legacy = {approved:true, approvedAt:"2026-08-17T08:00:00Z"};
  assert.equal(showcaseExpiry(legacy), approvedAt + 24 * 60 * 60 * 1000);
  assert.equal(showcaseHoursLeft(legacy, approvedAt), 24);
  assert.ok(showcaseExpired(legacy, approvedAt + 24 * 60 * 60 * 1000));
  assert.equal(showcaseExpiry({approved:false,createdAt:"2026-08-17T08:00:00Z"}), 0);
});

test("pending tank requests expire 24 hours after submission", () => {
  const submitted = Date.parse("2026-08-17T08:00:00Z");
  const explicit = {approved:false, createdAt:"2026-08-17T08:00:00Z", pendingExpiresAt:submitted + 24 * 60 * 60 * 1000};
  assert.equal(showcasePendingExpiry(explicit), submitted + 24 * 60 * 60 * 1000);
  assert.ok(!showcasePendingExpired(explicit, submitted + 24 * 60 * 60 * 1000 - 1));
  assert.ok(showcasePendingExpired(explicit, submitted + 24 * 60 * 60 * 1000));

  const legacy = {approved:false, createdAt:"2026-08-17T08:00:00Z"};
  assert.equal(showcasePendingExpiry(legacy), submitted + 24 * 60 * 60 * 1000);
  assert.ok(showcasePendingExpired(legacy, submitted + 24 * 60 * 60 * 1000));
  assert.equal(showcasePendingExpiry({approved:true,createdAt:"2026-08-17T08:00:00Z"}), 0);
});

test("daily tank uploads keep current and best streaks", () => {
  const now = Date.parse("2026-08-17T12:00:00Z");
  const streak = computeTankUploadStreak({
    "2026-08-12": {entryId:"old"},
    "2026-08-15": {entryId:"a"},
    "2026-08-16": {entryId:"b"},
    "2026-08-17": {entryId:"c"},
  }, now);
  assert.deepEqual(streak, {current:3,best:3,lastDay:"2026-08-17"});
  assert.equal(computeTankUploadStreak({"2026-08-10":{}}, now).current, 0);
});
