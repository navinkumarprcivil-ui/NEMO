/**
 * The checkout address book — whose addresses may appear in it.
 *
 *   node --test test/addressbook.test.mjs
 *
 * These are privacy tests, not convenience tests. The "Deliver to" picker at checkout, and the
 * address shown again on the payment step, are both rendered from this book. An admin session
 * holds EVERY customer's orders in the same `orders` state a shopper's own session uses, so the
 * seeding step is one array away from filing strangers' names, phones and street addresses into
 * a local book — where they look exactly like the customer's own saved cards.
 *
 * The rules are plain functions over localStorage with no React in them, so they are lifted out
 * of app.jsx and run directly against a stub, the way the other suites here do it.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import test from "node:test";
import assert from "node:assert";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = readFileSync(join(root, "app.jsx"), "utf8");
const slice = (from, to) => src.slice(src.indexOf(from), src.indexOf(to));

const addrCode  = slice("function addrBookKey(", "function favKey(");
const cacheCode = slice("function readCachedList(", "function localSettingsData(");

/* A fresh module over a fresh localStorage, so no test can inherit another's book. */
function load() {
  const store = new Map();
  const localStorage = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k),
  };
  const M = new Function("localStorage", addrCode + cacheCode + `
    return {seedAddressBook,purgeForeignAddrEntries,loadAddrBook,saveAddrBook,localOrders,addrFingerprint};`)(localStorage);
  return { ...M, store };
}

const ME = "uid-me";
const THEM = "uid-them";
const order = (uid, street, extra = {}) => ({
  id: "o-" + street, userUid: uid, placedAt: "2026-08-0" + (street.length % 9),
  address: { name: "Cust " + uid, phone: "90000000" + (street.length % 10), address: street, city: "Salem", pincode: "636001" },
  ...extra,
});

test("another customer's order never becomes a pickable address", () => {
  const M = load();
  const book = M.seedAddressBook(ME, [order(ME, "12 My Street"), order(THEM, "99 Their Lane")]);
  const streets = book.map(a => a.address);
  assert.ok(streets.includes("12 My Street"), "the customer's own address should seed");
  assert.ok(!streets.includes("99 Their Lane"), "another customer's address must never appear");
  assert.equal(book.length, 1);
});

test("an all-customers array (what the admin panel holds) seeds nothing but the admin's own", () => {
  const M = load();
  const everyone = [order(THEM, "1 A Rd"), order("uid-c", "2 B Rd"), order("uid-d", "3 C Rd")];
  assert.deepEqual(M.seedAddressBook(ME, everyone), [], "no foreign address may be filed");
  // and the same array for the admin's own uid still yields only their row
  const withMine = [...everyone, order(ME, "4 Mine Rd")];
  assert.deepEqual(M.seedAddressBook(ME, withMine).map(a => a.address), ["4 Mine Rd"]);
});

test("an order with no owner is skipped rather than trusted", () => {
  const M = load();
  const orphan = order(ME, "5 Orphan Rd"); delete orphan.userUid;
  assert.deepEqual(M.seedAddressBook(ME, [orphan]), []);
});

test("books poisoned before the fix are cleaned once, keeping what the customer typed", () => {
  const M = load();
  M.saveAddrBook(ME, [
    { id: "a1", address: "9 Stranger Way", pincode: "600001", phone: "1", fromOrder: true },
    { id: "a2", address: "12 My Street",   pincode: "636001", phone: "2", fromOrder: false },
  ]);
  M.purgeForeignAddrEntries(ME);
  const after = M.loadAddrBook(ME);
  assert.deepEqual(after.map(a => a.address), ["12 My Street"], "order-derived rows go, typed rows stay");

  // The clean runs once: a legitimately re-seeded row survives a later call.
  const reseeded = M.seedAddressBook(ME, [order(ME, "7 Rightful Rd")]);
  assert.ok(reseeded.some(a => a.address === "7 Rightful Rd"));
  M.purgeForeignAddrEntries(ME);
  assert.ok(M.loadAddrBook(ME).some(a => a.address === "7 Rightful Rd"), "must not re-purge");
});

test("seeding twice does not duplicate the same place", () => {
  const M = load();
  const mine = [order(ME, "12 My Street")];
  M.seedAddressBook(ME, mine);
  assert.equal(M.seedAddressBook(ME, mine).length, 1);
});

test("a shared order cache holding more than one owner is discarded, not shown", () => {
  const M = load();
  M.store.set("nemo-orders", JSON.stringify([order(ME, "1 A"), order(THEM, "2 B")]));
  assert.deepEqual(M.localOrders(), [], "a multi-owner cache is an admin snapshot, not this user's");
  assert.equal(M.store.get("nemo-orders"), undefined, "and it is dropped so it cannot be read again");

  M.store.set("nemo-orders", JSON.stringify([order(ME, "1 A"), order(ME, "3 C")]));
  assert.equal(M.localOrders().length, 2, "a single-owner cache is still served");
});
