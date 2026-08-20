/**
 * Every database path the app writes to must have a rule.
 *
 *   node scripts/check-rules.mjs
 *
 * ── Why this exists ────────────────────────────────────────────────────────
 * database.rules.json denies at the root, so a node with no rule of its own is
 * silently unwritable and unreadable. The app swallows those failures on
 * purpose — an analytics ping must not break a page — which means a missing
 * rule does not look like an error. It looks like a feature that quietly does
 * nothing.
 *
 * That is exactly what happened to the visitor log: the rules for it were
 * written, lost while a bad reformat of this file was being undone, and never
 * noticed, because the failure surfaced as an empty list rather than an alarm.
 * Days of visits went unrecorded. This turns that class of mistake back into
 * something that shouts.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const rules = JSON.parse(readFileSync(join(root, 'database.rules.json'), 'utf8')).rules;
const src = readFileSync(join(root, 'app.jsx'), 'utf8');

/* Every FB_DB.ref("…") in the app, reduced to its top-level node. Template
   expressions inside the string are irrelevant here — only the first segment
   matters, and that is always a literal. */
const found = new Set();
for (const m of src.matchAll(/FB_DB\.ref\(\s*["'`]([^"'`$]+)/g)) {
  const top = m[1].replace(/^\/+/, '').split('/')[0].trim();
  if (top && top !== '.info') found.add(top);
}

const missing = [...found].filter((n) => !(n in rules)).sort();
const unused = Object.keys(rules)
  .filter((k) => !k.startsWith('.') && !found.has(k))
  .sort();

if (unused.length) {
  // Not a failure: plenty of nodes are read by the analytics app or written by
  // hand. Worth printing so the two lists can be eyeballed against each other.
  console.log(`note: ${unused.length} node(s) have rules but no FB_DB.ref in app.jsx — ${unused.join(', ')}`);
}

if (missing.length) {
  console.error(`\n✗ ${missing.length} node(s) the app writes to have NO rule and will be denied at the root:\n`);
  missing.forEach((n) => console.error(`    ${n}`));
  console.error('\nAdd them to database.rules.json, then publish it in Firebase Console.\n');
  process.exit(1);
}

console.log(`✓ all ${found.size} database nodes used by app.jsx have rules`);
