import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import {
  cashfreeMode,
  cashfreeOrderIdFor,
  money,
  sameMoney,
  stableUuid,
  webhookSignatureValid,
} from '../lib/payments.mjs';

test('Cashfree order ids are deterministic, valid, and within the API limit', () => {
  const id = cashfreeOrderIdFor('ord/2026.08.19 customer payment with a long suffix');
  assert.match(id, /^[A-Za-z0-9_-]{3,45}$/);
  assert.equal(id, cashfreeOrderIdFor('ord/2026.08.19 customer payment with a long suffix'));
});

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

test('sandbox is the safe default and production must be explicit', () => {
  const before = process.env.CASHFREE_ENV;
  delete process.env.CASHFREE_ENV;
  assert.equal(cashfreeMode(), 'sandbox');
  process.env.CASHFREE_ENV = 'production';
  assert.equal(cashfreeMode(), 'production');
  if (before == null) delete process.env.CASHFREE_ENV;
  else process.env.CASHFREE_ENV = before;
});

test('Cashfree webhook signature covers timestamp plus raw payload', () => {
  const before = process.env.CASHFREE_SECRET_KEY;
  process.env.CASHFREE_SECRET_KEY = 'test-secret';
  const timestamp = '1785401067911';
  const raw = '{"amount":170.00}';
  const signature = crypto.createHmac('sha256', 'test-secret')
    .update(timestamp + raw).digest('base64');
  assert.equal(webhookSignatureValid(raw, timestamp, signature), true);
  assert.equal(webhookSignatureValid('{"amount":170}', timestamp, signature), false);
  if (before == null) delete process.env.CASHFREE_SECRET_KEY;
  else process.env.CASHFREE_SECRET_KEY = before;
});
