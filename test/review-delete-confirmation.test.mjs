import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { composeReviewDeleteConfirmationSource } from '../scripts/compose-source.mjs';

const root=join(dirname(fileURLToPath(import.meta.url)),'..');
const SOURCE=readFileSync(join(root,'app.jsx'),'utf8');

test('Admin review deletion requires confirmation',()=>{
  const fixed=composeReviewDeleteConfirmationSource(SOURCE);
  assert.match(fixed,/handleDeleteReview=async\(pid,rid\)=>\{\n    if\(!window\.confirm\("Delete this customer review\?/);
});

test('customer can delete only their own review and must confirm',()=>{
  const fixed=composeReviewDeleteConfirmationSource(SOURCE);
  assert.match(fixed,/if\(!r\|\|!mine\|\|r\.uid!==mine\) return;/);
  assert.match(fixed,/window\.confirm\("Delete your review\?\\n\\nThis permanently removes your review and cannot be undone\."\)/);
  assert.match(fixed,/user&&r\.uid===userKey\(user\).*handleDeleteOwnReview\(r\)/s);
});

test('deleting own review clears the already-reviewed marker',()=>{
  const fixed=composeReviewDeleteConfirmationSource(SOURCE);
  assert.match(fixed,/function removeReviewedLocal\(/);
  assert.match(fixed,/onReviewDeleted && onReviewDeleted\(p\.id\)/);
  assert.match(fixed,/onReviewDeleted=\{unmarkReviewed\}/);
});

test('review delete confirmation composition is idempotent',()=>{
  const once=composeReviewDeleteConfirmationSource(SOURCE);
  assert.equal(composeReviewDeleteConfirmationSource(once),once);
});
