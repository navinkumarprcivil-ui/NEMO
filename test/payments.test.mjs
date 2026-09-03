import test from 'node:test';
import assert from 'node:assert/strict';

import { money, sameMoney, stableUuid } from '../lib/payments.mjs';

test('idempotency UUID is stable and valid', () => {
  const id = stableUuid('create:user:order');
  assert.equal(id, stableUuid('create:user:order'));
  assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test('money comparison is exact to paise', () => {
  assert.equal(money(10.105), 10.11);
  assert.equal(sameMoney(100.1, '100.10'), true);
  assert.equal(sameMoney(100.1, 100.11), false);
});

/* The gateways were removed one at a time; this is the guard that the retired one
   cannot come back through a stale import. Its credentials are gone from Cloudflare,
   so any surviving reference would fail at request time rather than at deploy. */
test('no retired gateway code survives in the server modules', async () => {
  const { readFileSync } = await import('node:fs');
  for (const file of ['../lib/payments.mjs', '../lib/gateways.mjs',
    '../api/pay-create.js', '../api/pay-verify.js', '../api/pay-webhook.js', '../api/pay-refund.js']) {
    const source = readFileSync(new URL(file, import.meta.url), 'utf8');
    const offenders = source.split('\n')
      .map((line, i) => [i + 1, line])
      // providerForOrder must keep naming 'cashfree' — it is the recorded gateway on
      // historical orders, and re-pointing those at a live gateway would refund the wrong one.
      .filter(([, line]) => /cashfree/i.test(line) && !/order\?\.gateway \|\| 'cashfree'/.test(line)
        && !/were all Cashfree/.test(line));
    assert.deepEqual(offenders, [], `${file} still references the retired gateway`);
  }
});
