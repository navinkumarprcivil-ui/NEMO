/**
 * Care guides — sample content, and recovering posters whose guide records are gone.
 *
 *   node --test test/guides.test.mjs
 *
 * Two rules worth pinning down, both learned the hard way on a live store:
 *
 *  1. The built-in guides are a placeholder, never the store's content. Publishing them into a
 *     real store's `guides` node replaces a missing library with three articles that carry no
 *     posters — which looks to the owner exactly like "my guides came back but every poster I
 *     uploaded is gone". `isSampleGuide` has to recognise them even in the copies that were
 *     published before the `sample` tag existed, because those are the ones sitting in the way.
 *
 *  2. A poster outlives the guide that showed it: the image is at `media/img-<id>`, the title
 *     and category are in `guides`. So the posters are recoverable, and `findOrphanPosters` is
 *     what finds them — it must not mistake a product's or a request's image for an orphan, and
 *     it must report "couldn't look" differently from "nothing there".
 *
 * Lifted out of app.jsx and run directly, the way the other suites here do it.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import test from "node:test";
import assert from "node:assert";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = readFileSync(join(root, "app.jsx"), "utf8");
const slice = (from, to) => src.slice(src.indexOf(from), src.indexOf(to));

const code = slice("async function listMediaKeys(", "/* ── Multi-media (per-product gallery)")
           + slice("function isSampleGuide(", "/* Simulated demo Google accounts");

/* The module needs a fetch, a config and withTimeout; everything else it touches is its own. */
function load(fetchImpl) {
  const FIREBASE_CONFIG = { databaseURL: "https://example-rtdb.firebaseio.app" };
  const withTimeout = (p) => p;
  return new Function("fetch", "FIREBASE_CONFIG", "withTimeout", code + `
    return {listMediaKeys,findOrphanPosters,isSampleGuide,DEFAULT_GUIDES};`)(fetchImpl, FIREBASE_CONFIG, withTimeout);
}
const okFetch = (keys) => async () => ({ ok: true, json: async () => Object.fromEntries(keys.map(k => [k, true])) });

test("the built-in guides are recognised as samples", () => {
  const M = load(okFetch([]));
  assert.equal(M.DEFAULT_GUIDES.length, 3);
  for (const g of M.DEFAULT_GUIDES) assert.ok(M.isSampleGuide(g), `${g.id} should be a sample`);
});

test("a sample copy published before the tag existed is still recognised", () => {
  const M = load(okFetch([]));
  const published = { id: "g1", title: "Betta Fish Care Basics", category: "Fish Care", hasImg: false };
  assert.ok(!published.sample, "fixture must not carry the tag");
  assert.ok(M.isSampleGuide(published), "id + title is what identifies it");
});

test("a real guide is never mistaken for a sample", () => {
  const M = load(okFetch([]));
  assert.ok(!M.isSampleGuide({ id: "g1", title: "My Own Betta Guide" }), "same id, renamed → the store's");
  assert.ok(!M.isSampleGuide({ id: "gx9", title: "Betta Fish Care Basics" }), "same title, own id → the store's");
  assert.ok(!M.isSampleGuide(null));
});

test("orphan posters are the ones nothing refers to any more", async () => {
  const M = load(okFetch(["img-g1", "img-lost1", "img-lost2", "img-p1", "img-r1", "m-abc", "thumb-abc"]));
  const orphans = await M.findOrphanPosters([
    [{ id: "p1" }],          // products
    [{ id: "r1" }],          // requests
    [{ id: "g1" }],          // guides still present
    [],                      // showcase
  ]);
  assert.deepEqual(orphans.sort(), ["lost1", "lost2"]);
});

test("gallery keys are not posters, and a full store yields nothing", async () => {
  const M = load(okFetch(["m-abc", "thumb-abc", "img-p1"]));
  assert.deepEqual(await M.findOrphanPosters([[{ id: "p1" }], [], [], []]), []);
});

test("a failed listing reports null, not an empty result", async () => {
  const bad = load(async () => ({ ok: false }));
  assert.equal(await bad.findOrphanPosters([[], [], [], []]), null, "HTTP failure must not read as 'none'");
  const threw = load(async () => { throw new Error("offline"); });
  assert.equal(await threw.findOrphanPosters([[], [], [], []]), null, "a thrown fetch must not read as 'none'");
});

test("the media list is read shallow, so posters are not downloaded to list them", async () => {
  let seen = "";
  const M = load(async (url) => { seen = url; return { ok: true, json: async () => ({}) }; });
  await M.listMediaKeys();
  assert.match(seen, /\/media\.json\?shallow=true$/, "must request keys only");
});
