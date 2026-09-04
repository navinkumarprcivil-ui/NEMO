/** The customer-facing bill and tax invoice: where they sit on the screen, and what they say
    about an order that was cancelled. */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(root, 'app.jsx'), 'utf8');

const billSource = src.slice(src.indexOf('function generateBillHTML('), src.indexOf('/* Open a generated HTML doc in a new tab.'));
const renderBill = new Function('STORE_NAME', 'BUSINESS_WA', 'orderId',
  `${billSource}\nreturn generateBillHTML;`)('Nemo', '910000000000', id => String(id).slice(0, 6));

const baseOrder = {
  id: 'ord_1', orderNo: 'NEMO-1', placedAt: '2026-09-01T10:00:00.000Z',
  address: { name: 'A Customer', phone: '9000000000', address: '1 Road', city: 'Salem', pincode: '636001' },
  items: [{ id: 'p1', name: 'Filter', qty: 1, price: 500 }],
  total: 500, fee: 40, amountDue: 540, status: 'Confirmed', paymentStatus: 'Verified',
};

test('a live bill carries no cancellation notice', () => {
  const html = renderBill(baseOrder, {});
  assert.ok(!html.includes('ORDER CANCELLED'), 'a confirmed order should not be stamped cancelled');
});

/* A cancelled order still has a bill — it is a record, and there may be a refund owed against
   it — so the document is still issued, but it has to say what happened. */
test('a cancelled bill says so, and says what happens to the money', () => {
  const plain = renderBill({ ...baseOrder, status: 'Cancelled' }, {});
  assert.match(plain, /ORDER CANCELLED/);
  assert.match(plain, /No goods were supplied/);

  const owed = renderBill({ ...baseOrder, status: 'Cancelled', refund: { due: true, status: 'processing' } }, {});
  assert.match(owed, /refund of the amount paid is being processed/);

  const paidBack = renderBill({ ...baseOrder, status: 'Cancelled', refund: { due: true, status: 'refunded' } }, {});
  assert.match(paidBack, /amount paid has been refunded/);
});

test('the cancellation reason is HTML-escaped like every other customer-supplied value', () => {
  const html = renderBill({ ...baseOrder, status: 'Cancelled', cancelReason: '<script>x</script>' }, {});
  assert.ok(!html.includes('<script>x</script>'), 'the reason was interpolated raw');
  assert.match(html, /&lt;script&gt;/);
});

/* The tax invoice scales a fixed 780px sheet down to fit narrow screens. The wrapper is pinned
   to that design width so the scale maths is honest — which means that on any window WIDER than
   780px it needs auto margins, or the sheet sits against the left edge of the screen. */
test('the tax invoice sheet is centred, not left-aligned', () => {
  assert.match(src, /\.fitwrap\{transform-origin:top left;margin:0 auto\}/);
  assert.match(src, /wrap\.style\.width="780px"/);
});

test('the tax invoice stamps a cancelled order, but never a credit note', () => {
  assert.match(src, /const cancelledDoc=!cn&&String\(o\.status\|\|""\)==="Cancelled";/);
  assert.match(src, /\$\{cancelledDoc\?`<div class="cancelbar">/);
  assert.match(src, /\.cancelbar\{/);
});
