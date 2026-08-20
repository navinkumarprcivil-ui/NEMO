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

const code = slice("async function listMediaKeysREST(", "/* A poster can survive in Storage")
           + slice("function isSampleGuide(", "/* Simulated demo Google accounts");

/* The module needs a fetch, a config and withTimeout; everything else it touches is its own. */
function load({ fetchImpl, storageItems, idbKeys } = {}) {
  const FIREBASE_CONFIG = { databaseURL: "https://example-rtdb.firebaseio.app" };
  const withTimeout = (p) => p;
  const HAS_IDB = idbKeys !== undefined;
  const IDB = { keys: async () => idbKeys || [] };
  const FB_STORAGE = storageItems === undefined ? null : {
    ref: () => ({ listAll: async () => (storageItems === null
      ? Promise.reject(new Error("denied"))
      : { items: storageItems.map(name => ({ name })) }) }),
  };
  return new Function("fetch", "FIREBASE_CONFIG", "withTimeout", "FB_STORAGE", "HAS_IDB", "IDB", code + `
    return {listMediaKeysREST,listStoragePosterIds,listCachedPosterIds,findOrphanPosters,isSampleGuide,DEFAULT_GUIDES};`)(
      fetchImpl || (async () => ({ ok: false })), FIREBASE_CONFIG, withTimeout, FB_STORAGE, HAS_IDB, IDB);
}
const okFetch = (keys) => async () => ({ ok: true, json: async () => Object.fromEntries(keys.map(k => [k, true])) });
const M0 = () => load({ storageItems: [], idbKeys: [] });

test("the built-in guides are recognised as samples", () => {
  const M = M0();
  assert.equal(M.DEFAULT_GUIDES.length, 3);
  for (const g of M.DEFAULT_GUIDES) assert.ok(M.isSampleGuide(g), `${g.id} should be a sample`);
});

test("a sample copy published before the tag existed is still recognised", () => {
  const M = M0();
  const published = { id: "g1", title: "Betta Fish Care Basics", category: "Fish Care", hasImg: false };
  assert.ok(!published.sample, "fixture must not carry the tag");
  assert.ok(M.isSampleGuide(published), "id + title is what identifies it");
});

test("a real guide is never mistaken for a sample", () => {
  const M = M0();
  assert.ok(!M.isSampleGuide({ id: "g1", title: "My Own Betta Guide" }), "same id, renamed → the store's");
  assert.ok(!M.isSampleGuide({ id: "gx9", title: "Betta Fish Care Basics" }), "same title, own id → the store's");
  assert.ok(!M.isSampleGuide(null));
});

test("orphan posters are the ones nothing refers to any more", async () => {
  const M = load({ storageItems: ["img-g1.jpg", "img-lost1.jpg", "img-p1.jpg"], idbKeys: [] });
  const { ids, sources } = await M.findOrphanPosters([
    [{ id: "p1" }],   // products
    [{ id: "r1" }],   // requests
    [{ id: "g1" }],   // guides still present
    [],               // showcase
  ]);
  assert.deepEqual(ids, ["lost1"]);
  assert.equal(sources.storage, true);
});

test("the three places are unioned, so a poster in any one of them is found", async () => {
  const M = load({
    storageItems: ["img-inStorage.jpg"],
    idbKeys: ["nemo-img-onDevice", "nemo-vid-ignored", "unrelated"],
    fetchImpl: okFetch(["img-inDatabase", "m-gallery"]),
  });
  const { ids, sources } = await M.findOrphanPosters([[], [], [], []]);
  assert.deepEqual(ids.sort(), ["inDatabase", "inStorage", "onDevice"]);
  assert.deepEqual(sources, { storage: true, device: true, database: true });
});

test("a poster present in two places is offered once, not twice", async () => {
  const M = load({ storageItems: ["img-same.jpg"], idbKeys: ["nemo-img-same"], fetchImpl: okFetch(["img-same"]) });
  const { ids } = await M.findOrphanPosters([[], [], [], []]);
  assert.deepEqual(ids, ["same"]);
});

test("gallery keys are not posters, and a full store yields nothing", async () => {
  const M = load({ storageItems: ["img-p1.jpg"], idbKeys: ["nemo-m-abc", "nemo-img-p1"] });
  const { ids } = await M.findOrphanPosters([[{ id: "p1" }], [], [], []]);
  assert.deepEqual(ids, []);
});

test("all three unreadable reports 'could not look', not 'nothing there'", async () => {
  const M = load({ storageItems: null });   // storage denied, no IDB, REST fails
  const { ids, sources } = await M.findOrphanPosters([[], [], [], []]);
  assert.equal(ids, null, "a total failure must never read as an empty result");
  assert.deepEqual(sources, { storage: false, device: false, database: false });
});

test("one unreadable place still returns what the others found, and says which failed", async () => {
  const M = load({ storageItems: null, idbKeys: ["nemo-img-survivor"] });
  const { ids, sources } = await M.findOrphanPosters([[], [], [], []]);
  assert.deepEqual(ids, ["survivor"]);
  assert.equal(sources.storage, false, "storage failure must be reported");
  assert.equal(sources.device, true);
});

test("the database listing is read shallow, so posters are not downloaded to list them", async () => {
  let seen = "";
  const M = load({ storageItems: [], idbKeys: [],
    fetchImpl: async (url) => { seen = url; return { ok: true, json: async () => ({}) }; } });
  await M.listMediaKeysREST();
  assert.match(seen, /\/media\.json\?shallow=true$/, "must request keys only");
});

/* ── Saving a guide must never delete the others ───────────────────────────────────
   The original loss almost certainly happened here. saveGuides() replaces the whole `guides`
   node, and the array it was given came from the in-memory guides state; any moment that state
   was short of the truth — cloud read not landed, listener not fired, started offline, cache
   gone empty — saving one guide published that short list over the node and deleted the rest,
   reporting "Guide saved". These tests assert the write is now scoped to a single key. */
const writeCode = slice("async function saveOneGuide(", "/* Local-only readers");

function loadWrites(cachedGuides) {
  const writes = [];
  const removes = [];
  let cache = JSON.stringify(cachedGuides);
  const env = {
    localGuidesData: () => JSON.parse(cache),
    dbSet: async (_k, v) => { cache = v; },
    FB_OK: true,
    fbWrite: async (ref, val) => { writes.push({ path: ref.path, val }); return true; },
    withTimeout: (p) => p,
    FB_DB: { ref: (path) => ({ path, remove: async () => { removes.push(path); } }) },
  };
  const M = new Function(...Object.keys(env), writeCode + `
    return {saveOneGuide,removeOneGuide};`)(...Object.values(env));
  return { M, writes, removes, cacheNow: () => JSON.parse(cache) };
}

test("saving a guide writes only its own key, never the whole collection", async () => {
  const existing = [{ id: "a", title: "Mine A" }, { id: "b", title: "Mine B" }];
  const { M, writes } = loadWrites(existing);
  await M.saveOneGuide({ id: "c", title: "Brand new" });
  assert.equal(writes.length, 1);
  assert.equal(writes[0].path, "guides/c", "must target one guide, not the `guides` node");
  assert.equal(writes[0].val.title, "Brand new");
});

test("adding a guide while the list looks empty cannot delete the others", async () => {
  // The exact hazard: the in-memory list is empty, so a whole-collection write would publish
  // a one-entry node over everything. A per-key write cannot reach the other guides at all.
  const { M, writes } = loadWrites([]);
  await M.saveOneGuide({ id: "new", title: "Added during a bad moment" });
  assert.deepEqual(writes.map(w => w.path), ["guides/new"]);
  assert.ok(!writes.some(w => w.path === "guides"), "the collection root must never be written");
});

test("deleting a guide removes only its own key", async () => {
  const { M, removes, writes } = loadWrites([{ id: "a" }, { id: "b" }]);
  await M.removeOneGuide("a");
  assert.deepEqual(removes, ["guides/a"]);
  assert.equal(writes.length, 0, "a delete must not rewrite the collection");
});

test("the local cache still tracks the change, and never keeps samples", async () => {
  const { M, cacheNow } = loadWrites([{ id: "a", title: "Mine" }, { id: "g1", title: "Betta Fish Care Basics", sample: true }]);
  await M.saveOneGuide({ id: "b", title: "Second" });
  const ids = cacheNow().map(g => g.id).sort();
  assert.deepEqual(ids, ["a", "b"], "sample entries must not be written back into the cache");
});
