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

test('customer orders use four simple lifecycle groups', () => {
  assert.match(app, /const orderStages=\["Orders Placed","Shipped","Delivered","Past Orders"\]/);
  assert.match(app, /function customerOrderStage\(/);
  assert.match(app, /category==="Accessories"\) \? 3 : 1/);
  assert.match(app, /!\[['"]Shipped['"],['"]Delivered['"]\]\.includes\(o\.status\)/);
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
