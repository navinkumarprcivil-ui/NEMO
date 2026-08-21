import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const app = readFileSync(new URL('../app.jsx', import.meta.url), 'utf8');

test('new reviews require an explicit star choice', () => {
  const block = app.slice(app.indexOf('function TestimonialsSection('), app.indexOf('function GuideNotificationToggle('));
  assert.match(block, /useState\(0\)/);
  assert.match(block, /if\(!rating\)\{[^}]*select a star rating/);
  assert.match(block, />Share review</);
  assert.doesNotMatch(block, /useState\(5\)/);
  assert.doesNotMatch(app, /Tap to review your product/i);
});

test('customer orders are the original single list, without lifecycle tabs', () => {
  const customer = app.slice(app.indexOf('function OrderHistoryPage('), app.indexOf('function OrderTrackingBar('));
  assert.match(customer, /const visibleOrders=myOrders/);
  assert.doesNotMatch(customer, /orderStages|stageFilter|customerOrderStage\(o\)===/);
});

test('admin orders use the requested lifecycle and claim filters', () => {
  assert.match(app, /const ADMIN_ORDER_FILTERS = \["All","Order Placed","Shipped","Delivered","Past Orders","Return\/Replacement"\]/);
  assert.match(app, /function adminOrderStage\(/);
  assert.match(app, /if\(adminOrderNeedsAttention\(o\)\) return "Return\/Replacement"/);
  assert.match(app, /adminOrderStage\(o\)===s/);
  const admin = app.slice(app.indexOf('function AdminHub('), app.indexOf('function SettingsPanel('));
  assert.doesNotMatch(admin, /\["All",\.\.\.ALL_STATUSES\]/);
});

test('My Tank has persisted checkboxes and a clear action without a photo request', () => {
  const block = app.slice(app.indexOf('function AquaToolsPage('), app.indexOf('function HomePage('));
  assert.match(block, /type="checkbox"/);
  assert.match(block, /careChecks/);
  assert.match(block, /Clear all My Tank details/);
  assert.doesNotMatch(block, /Tank photo|Upload.*photo|Leave any box empty|General guidance/i);
});

test('admin analytics are collapsible, include today data and omit abandoned carts', () => {
  const insights = app.slice(app.indexOf('function AdminInsights('), app.indexOf('function AdminProducts('));
  assert.match(insights, /Overall/);
  assert.match(insights, /Today/);
  assert.match(insights, /Most Viewed/);
  assert.match(insights, /Most Added to Cart/);
  assert.match(insights, /Top Searches/);
  const dashboard = app.slice(app.indexOf('function AdminSalesDashboard('), app.indexOf('function AdminInsights('));
  assert.doesNotMatch(dashboard, /Abandoned Carts/);
});

test('policy and confirmation safeguards match the current store rules', () => {
  assert.match(app, /Dead-on-Arrival claims require one continuous unboxing video sent on WhatsApp within 2 hours/);
  assert.match(app, /Unused accessories and equipment in original, undamaged packaging may be returned within 3 days/);
  assert.match(app, /Confirm Cashfree refund/);
  assert.match(app, /Customers will no longer be able to use or see it/);
});

test('performance safeguards avoid rendering distant product rows and disable touch-only hover work', () => {
  assert.match(app, /content-visibility:auto/);
  assert.match(app, /@media\(hover:none\),\(pointer:coarse\)/);
  assert.match(app, /decoding="async" loading=\{loading\}/);
});

test('month-end rewards create an in-admin notification and settings badge', () => {
  const block = app.slice(app.indexOf('function AdminHub('), app.indexOf('function SettingsPanel('));
  assert.match(block, /Month-end reward check/);
  assert.match(block, /Review rewards/);
  assert.match(block, /Tank vote/);
  assert.match(block, /Streak/);
  assert.match(block, /settingsAlertCount/);
  assert.match(block, /nemo-admin-rewards-dismissed/);
});

test('every admin settings card is independently collapsible', () => {
  const settings = app.slice(app.indexOf('function SettingsPanel('), app.indexOf('function PosterRecovery('));
  for (const title of [
    'WhatsApp Notifications', 'Store Logo', 'Home Page Text', 'Store Contact',
    'Customer Confirmation Emails', 'Visitor Analytics', 'Admin Security', 'Data & Backup',
    'Clear Cached Copies', 'About & Policies', 'Business & Legal Info', 'Online Payment',
    'Shipping Rates', 'Live-Fish Packing & Couriers', 'Free Delivery', 'Premium Delivery & Live Guarantee',
    'HSN Master List', 'Coupons & Offer Banners', 'How discounts combine', 'Customer Wallet',
    'Referral Codes', 'Customer Tank Showcase', 'Tank of the Month',
  ]) assert.match(settings, new RegExp(`<Collapsible[^>]+title="${title.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}"`));
});

test('shipping settings use weight-bracket packaging and no Start Fresh control', () => {
  assert.match(app, /basePackagingByWeight/);
  assert.match(app, /liveBasePackagingByWeight/);
  assert.match(app, /function basePackagingWeight\(/);
  assert.match(app, /Packaging weight added by item-weight bracket/);
  assert.doesNotMatch(app, /🧹 Start Fresh|clearAllCloudNode|clearAllShowcaseHandler/);
});
