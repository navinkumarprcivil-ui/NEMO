/**
 * The checkout address book — whose addresses may appear in it.
 *
 *   node --test test/addressbook.test.mjs
 *
 * Only addresses the customer explicitly saves may appear. Past orders are not an address book:
 * importing them makes a deleted address reappear and stores data the customer never opted to
 * save for future orders.
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
    return {loadSavedAddresses,purgeForeignAddrEntries,loadAddrBook,saveAddrBook,localOrders,addrFingerprint};`)(localStorage);
  return { ...M, store };
}

const ME = "uid-me";
const THEM = "uid-them";
const order = (uid, street, extra = {}) => ({
  id: "o-" + street, userUid: uid, placedAt: "2026-08-0" + (street.length % 9),
  address: { name: "Cust " + uid, phone: "90000000" + (street.length % 10), address: street, city: "Salem", pincode: "636001" },
  ...extra,
});

test("past orders never become saved addresses", () => {
  const M = load();
  M.store.set("nemo-orders", JSON.stringify([order(ME, "12 My Street"), order(THEM, "99 Their Lane")]));
  assert.deepEqual(M.loadSavedAddresses(ME), []);
});

test("legacy order-derived rows are always removed, while explicitly saved rows remain", () => {
  const M = load();
  M.saveAddrBook(ME, [
    { id: "a1", address: "9 Stranger Way", pincode: "600001", phone: "1", fromOrder: true },
    { id: "a2", address: "12 My Street",   pincode: "636001", phone: "2", fromOrder: false },
  ]);
  const after = M.loadSavedAddresses(ME);
  assert.deepEqual(after.map(a => a.address), ["12 My Street"], "order-derived rows go, typed rows stay");
});

test("deleting a saved address keeps it deleted", () => {
  const M = load();
  M.saveAddrBook(ME, [{id:"a1",address:"12 My Street",pincode:"636001",phone:"9000000000",fromOrder:false}]);
  M.saveAddrBook(ME, []);
  M.store.set("nemo-orders", JSON.stringify([order(ME, "12 My Street")]));
  assert.deepEqual(M.loadSavedAddresses(ME), []);
});

test("a shared order cache holding more than one owner is discarded, not shown", () => {
  const M = load();
  M.store.set("nemo-orders", JSON.stringify([order(ME, "1 A"), order(THEM, "2 B")]));
  assert.deepEqual(M.localOrders(), [], "a multi-owner cache is an admin snapshot, not this user's");
  assert.equal(M.store.get("nemo-orders"), undefined, "and it is dropped so it cannot be read again");

  M.store.set("nemo-orders", JSON.stringify([order(ME, "1 A"), order(ME, "3 C")]));
  assert.equal(M.localOrders().length, 2, "a single-owner cache is still served");
});
