import test from 'node:test';
import assert from 'node:assert';
import { computeStreak, dayOf } from '../api/tank-streak.js';

test('the server derives consecutive upload days from verified timestamps', () => {
  const now = Date.parse('2026-08-17T12:00:00Z');
  assert.equal(dayOf(Date.parse('2026-08-17T17:59:59Z')), '2026-08-17');
  assert.deepEqual(computeStreak({
    '2026-08-14': {entryId:'a'},
    '2026-08-15': {entryId:'b'},
    '2026-08-16': {entryId:'c'},
  }, now), {current:3,best:3,lastDay:'2026-08-16'});
});

test('upload days follow IST around midnight instead of the previous UTC date', () => {
  assert.equal(dayOf(Date.parse('2026-08-17T18:29:59Z')), '2026-08-17');
  assert.equal(dayOf(Date.parse('2026-08-17T18:30:00Z')), '2026-08-18');
});

test('an old verified upload remains in best but no longer counts as current', () => {
  const now = Date.parse('2026-08-17T12:00:00Z');
  assert.deepEqual(computeStreak({
    '2026-08-10': {},
    '2026-08-11': {},
    '2026-08-12': {},
  }, now), {current:0,best:3,lastDay:'2026-08-12'});
});
