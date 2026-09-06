/** No fabricated sample data sitting in a customer's empty form field.
 *
 * A greyed-out "John Doe" or "600001" in an empty input reads as something already filled in:
 * people tab past it, and some try to type around it. Every one of these fields is labelled
 * above it, so the hint was buying nothing. Format constraints that genuinely need saying are
 * enforced (maxLength, inputMode) and explained by the error text, not by an example value.
 *
 * This is about invented VALUES, not about instructions. "Search fish, plants, accessories…"
 * and "Describe the damage…" tell someone what to do and stay.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(root, 'app.jsx'), 'utf8');

/* Everything outside the owner-only Admin span — the same boundary scripts/build.mjs uses to
   split admin.js out of the bundle. Admin's own hints ("e.g. 2309" for an HSN code, a masked
   UPI reference) teach a format the owner needs and are not in scope here. */
const adminStart = src.indexOf('/* \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 ADMIN LOGIN');
const adminEnd = src.indexOf('/* \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 CARE GUIDES PAGE', adminStart);
const customerSrc = (() => {
  if (adminStart < 0 || adminEnd <= adminStart) throw new Error('admin span boundaries not found');
  return src.slice(0, adminStart) + src.slice(adminEnd);
})();

/* Every placeholder string a shopper can see. Scoped to placeholders on purpose: this is about
   what sits inside an empty input, not about every invented name in the file. */
const placeholders = [...customerSrc.matchAll(/placeholder="([^"]*)"/g)].map(m => m[1]);

const FABRICATED = [
  [/John Doe/i, 'a made-up person'],
  [/\b9\d{9}\b/, 'a made-up phone number'],
  [/\d+,\s*Main Street/i, 'a made-up street address'],
  [/^Chennai$/, 'a made-up city'],
  [/^\d{6}$/, 'a made-up pincode'],
  [/^Name$/, 'a value dressed up as the label'],
  [/^Living room tank$/i, 'a made-up tank name'],
];

test('no customer-facing placeholder is an invented sample value', () => {
  for (const ph of placeholders) {
    for (const [re, why] of FABRICATED) {
      assert.ok(!re.test(ph), `a customer form shows ${why} as a placeholder: "${ph}"`);
    }
  }
});

test('the delivery address fields pass no placeholder at all', () => {
  // inp(label, key, type, ph, half, opt) — a fourth argument is a placeholder.
  for (const call of ['inp("Full Name","name","text")', 'inp("Mobile Number","phone","tel")',
    'inp("WhatsApp Number","whatsapp","tel")', 'inp("Street Address","address","text")',
    'inp("City","city","text","",true)', 'inp("Pincode","pincode","text","",true)']) {
    assert.ok(src.includes(call), `the address form no longer calls ${call}`);
  }
});

test('My Tank and the pincode checker carry no example values either', () => {
  for (const gone of ['placeholder="Living room tank"', 'placeholder="Sponge / HOB 500 L-h"',
    'placeholder="100 W"', 'placeholder="e.g. 600001"']) {
    assert.ok(!src.includes(gone), `${gone} is back`);
  }
  /* Six digits still has to be said somewhere, and it is now the placeholder rather than a
     sentence above the box. That is an instruction, not an example value: it tells you what
     to type without pretending to be somebody's pincode. */
  assert.match(src, /placeholder="6-digit pincode"/);
});

/* Instructions are not sample data and must survive: removing these would leave bare boxes. */
test('instructional placeholders are left alone', () => {
  for (const keep of ['Search fish, plants, accessories…', 'Enter coupon code',
    'Enter referral code', 'Describe the damage…', 'Enter 6-digit pincode']) {
    assert.ok(src.includes(keep), `the instruction "${keep}" was removed with the sample data`);
  }
});
