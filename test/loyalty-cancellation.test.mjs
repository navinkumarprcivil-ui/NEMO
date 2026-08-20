/** Cancelled orders remove earned coins and restore spent coins without wallet log rows. */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(root, 'app.jsx'), 'utf8');
const silentCode = src.slice(src.indexOf('async function silentlyRemoveLoyaltyCredit('), src.indexOf('/* Auth — Google'));
const loyaltyCode = src.slice(src.indexOf('function loyaltyKey('), src.indexOf('/* ── Unified Wallet'));
const storage = new Map();
const localStorage = {
  getItem: key => storage.has(key) ? storage.get(key) : null,
  setItem: (key, value) => storage.set(key, value),
};
const M = new Function('FB_OK','FB_DB','FB_AUTH','isAdminSignedIn','localStorage',
  `${silentCode}\n${loyaltyCode}\nreturn {loyaltyKey,silentlyRemoveLoyaltyCredit,silentlyRestoreRedeemedPoints};`
)(false, null, null, () => false, localStorage);

const save = (uid, value) => storage.set(M.loyaltyKey(uid), JSON.stringify(value));
const load = uid => JSON.parse(storage.get(M.loyaltyKey(uid)));

test('an earned lot disappears once and leaves no cancellation activity row', async () => {
  storage.clear();
  save('u1', {
    points:150,
    lots:[{id:'earn:o1',pts:100,exp:0},{id:'other',pts:50,exp:0}],
    history:[{id:'earn:o1',pts:100,type:'credit'},{id:'other',pts:50,type:'credit'}],
  });
  assert.ok(await M.silentlyRemoveLoyaltyCredit('u1','earn:o1',100));
  let wallet = load('u1');
  assert.equal(wallet.points, 50);
  assert.deepEqual(wallet.lots.map(l => l.id), ['other']);
  assert.deepEqual(wallet.history.map(h => h.id), ['other']);
  assert.ok(wallet.silentReversals['earn:o1']);

  // Retrying cancellation reconciliation must not deduct another 100 coins.
  assert.ok(await M.silentlyRemoveLoyaltyCredit('u1','earn:o1',100));
  wallet = load('u1');
  assert.equal(wallet.points, 50);
  assert.deepEqual(wallet.history.map(h => h.id), ['other']);
});

test('a credit that never reached the wallet cannot consume unrelated coins', async () => {
  storage.clear();
  save('u-missing', {
    points:40,
    lots:[{id:'manual',pts:40,exp:0}],
    history:[{id:'manual',pts:40,type:'credit'}],
  });
  assert.equal(await M.silentlyRemoveLoyaltyCredit('u-missing','earn:missing',100), false);
  const wallet = load('u-missing');
  assert.equal(wallet.points, 40);
  assert.deepEqual(wallet.lots.map(l => l.id), ['manual']);
  assert.deepEqual(wallet.history.map(h => h.id), ['manual']);
});

test('coins spent on a cancelled order return without a refund log row', async () => {
  storage.clear();
  save('u2', {
    points:30,
    lots:[{id:'older',pts:30,exp:0}],
    history:[{id:'o2',pts:-20,type:'redeem'},{id:'older',pts:50,type:'credit'}],
  });
  assert.ok(await M.silentlyRestoreRedeemedPoints('u2','o2',20,0));
  let wallet = load('u2');
  assert.equal(wallet.points, 50);
  assert.ok(!wallet.history.some(h => h.id === 'o2' || String(h.id).startsWith('redeemrefund:')));
  assert.equal(wallet.lots.filter(l => l.id === 'restore:o2').length, 1);

  assert.ok(await M.silentlyRestoreRedeemedPoints('u2','o2',20,0));
  wallet = load('u2');
  assert.equal(wallet.points, 50);
  assert.equal(wallet.lots.filter(l => l.id === 'restore:o2').length, 1);
});
