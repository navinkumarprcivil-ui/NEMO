/** The order export: the header and the row have to describe the same columns. */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = stripComments(readFileSync(join(root, 'app.jsx'), 'utf8'));

/* Strip comments before scanning. Both matter: a `//` comment sits between columns and would
   be read as one of them, and a `/* *\/` comment can contain an apostrophe, which a scanner
   tracking string quotes would take as the start of a string and never close. */
function stripComments(source) {
  let out = '', quote = '', escaped = false;
  for (let i = 0; i < source.length; i += 1) {
    const c = source[i];
    if (escaped) { escaped = false; out += c; continue; }
    if (quote) {
      if (c === '\\') escaped = true;
      else if (c === quote) quote = '';
      out += c; continue;
    }
    if (c === '"' || c === "'" || c === '`') { quote = c; out += c; continue; }
    if (c === '/' && source[i + 1] === '/') { while (i < source.length && source[i] !== '\n') i += 1; out += '\n'; continue; }
    if (c === '/' && source[i + 1] === '*') { i += 2; while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) i += 1; i += 1; out += ' '; continue; }
    out += c;
  }
  return out;
}

/** Split an array literal's source on its TOP-LEVEL commas, ignoring strings and nesting. */
function topLevelItems(body) {
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

/* Money out, and which gateway took the money in, are as much a part of the books as the sale.
   These went in together with the return journey and the referral payout. */
test('the return journey, the refunds and the gateway are all exported', () => {
  const head = topLevelItems(arrayBody(src, src.indexOf('[', headStart))).map(s => s.replace(/^"|"$/g, ''));
  for (const col of ['Return Courier (customer)', 'Return Consignment (customer)',
    'Replacement Courier', 'Replacement Consignment', 'Referral Coins Paid to Owner',
    'Gateway', 'Payment Method', 'Gateway Payment ID', 'Test Payment',
    'Refund Due (Rs.)', 'Refund Status', 'Refund Reference', 'Refunded via Gateway (Rs.)',
    'Return Status', 'Replacement Sent At (ISO)', 'Referral Code Owner (Customer ID)',
    'Cancel Reason', 'Cancelled By']) {
    assert.ok(head.includes(col), `the export has no "${col}" column`);
  }
});
