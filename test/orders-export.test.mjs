/** The order export: the header and the row have to describe the same columns. */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(root, 'app.jsx'), 'utf8');

/** Strip `//` comments, which sit between columns and would otherwise be read as one. */
function stripLineComments(body) {
  let out = '', quote = '', escaped = false;
  for (let i = 0; i < body.length; i += 1) {
    const c = body[i];
    if (escaped) { escaped = false; out += c; continue; }
    if (quote) {
      if (c === '\\') escaped = true;
      else if (c === quote) quote = '';
      out += c; continue;
    }
    if (c === '"' || c === "'" || c === '`') { quote = c; out += c; continue; }
    if (c === '/' && body[i + 1] === '/') { while (i < body.length && body[i] !== '\n') i += 1; out += '\n'; continue; }
    out += c;
  }
  return out;
}

/** Split an array literal's source on its TOP-LEVEL commas, ignoring strings and nesting. */
function topLevelItems(rawBody) {
  const body = stripLineComments(rawBody);
  const items = [];
  let depth = 0, quote = '', escaped = false, start = 0;
  for (let i = 0; i < body.length; i += 1) {
    const c = body[i];
    if (escaped) { escaped = false; continue; }
    if (quote) {
      if (c === '\\') escaped = true;
      else if (c === quote) quote = '';
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
    if ('([{'.includes(c)) depth += 1;
    else if (')]}'.includes(c)) depth -= 1;
    else if (c === ',' && depth === 0) { items.push(body.slice(start, i)); start = i + 1; }
  }
  items.push(body.slice(start));
  return items.map(s => s.trim()).filter(s => s.length);
}

/** The source of an array literal that starts at `open`, up to its matching bracket. */
function arrayBody(source, open) {
  let depth = 0, quote = '', escaped = false;
  for (let i = open; i < source.length; i += 1) {
    const c = source[i];
    if (escaped) { escaped = false; continue; }
    if (quote) {
      if (c === '\\') escaped = true;
      else if (c === quote) quote = '';
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
    if (c === '[') depth += 1;
    else if (c === ']') { depth -= 1; if (depth === 0) return source.slice(open + 1, i); }
  }
  throw new Error('unterminated array literal');
}

const headStart = src.indexOf('const head=["Order ID"');
const rowStart = src.indexOf('return [o.orderNo||orderId(o.id)');

test('the export header and the export row have the same number of columns', () => {
  assert.ok(headStart > 0, 'CSV header not found');
  assert.ok(rowStart > 0, 'CSV row not found');
  const head = topLevelItems(arrayBody(src, src.indexOf('[', headStart)));
  const row = topLevelItems(arrayBody(src, src.indexOf('[', rowStart)));
  assert.equal(row.length, head.length,
    `the export writes ${row.length} values under ${head.length} headings — every column after the mismatch is filed under the wrong name`);
});

/* These are appended, never inserted: the comment above isoStamp promises a reader that indexes
   by position keeps working, and a spreadsheet or script built against last month's export is
   exactly such a reader. */
test('the timestamp columns stay at the end of the header, in order', () => {
  const head = topLevelItems(arrayBody(src, src.indexOf('[', headStart))).map(s => s.replace(/^"|"$/g, ''));
  const iso = ['Placed At (ISO)', 'Paid At (ISO)', 'Delivered On (ISO)'];
  const at = head.indexOf(iso[0]);
  assert.ok(at > 0, 'the ISO timestamp columns have gone');
  assert.deepEqual(head.slice(at, at + 3), iso, 'the ISO columns were reordered');
});

test('the return journey and the referral payout are exported', () => {
  const head = topLevelItems(arrayBody(src, src.indexOf('[', headStart))).map(s => s.replace(/^"|"$/g, ''));
  for (const col of ['Return Courier (customer)', 'Return Consignment (customer)',
    'Replacement Courier', 'Replacement Consignment', 'Referral Coins Paid to Owner']) {
    assert.ok(head.includes(col), `the export has no "${col}" column`);
  }
});
