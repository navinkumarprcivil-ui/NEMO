import test from 'node:test';
import assert from 'node:assert/strict';
import { tankEntryExpiry } from '../api/cron-tank-cleanup.js';

const TTL = 24 * 60 * 60 * 1000;
const submitted = Date.parse('2026-08-17T08:00:00Z');

test('server cleanup uses pendingExpiresAt for unapproved requests', () => {
  assert.equal(tankEntryExpiry({
    approved: false,
    createdAt: '2026-08-17T08:00:00Z',
    pendingExpiresAt: submitted + TTL,
  }), submitted + TTL);
});

test('server cleanup expires legacy pending requests from submission time', () => {
  assert.equal(tankEntryExpiry({
    approved: false,
    createdAt: '2026-08-17T08:00:00Z',
  }), submitted + TTL);
});

test('approval starts a separate 24-hour retention window', () => {
  const approvedAt = Date.parse('2026-08-18T09:00:00Z');
  assert.equal(tankEntryExpiry({
    approved: true,
    createdAt: '2026-08-17T08:00:00Z',
    approvedAt: '2026-08-18T09:00:00Z',
  }), approvedAt + TTL);
});
