import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const app=readFileSync(new URL('../app.jsx',import.meta.url),'utf8');
const rules=JSON.parse(readFileSync(new URL('../database.rules.json',import.meta.url),'utf8')).rules;
const index=readFileSync(new URL('../index.html',import.meta.url),'utf8');

test('admin password gate and eight independent co-admin permissions are wired',()=>{
  for(const key of ['orders','dashboard','products','wallets','reviews','requests','guides','settings']) assert.match(app,new RegExp(`['"]${key}['"]`));
  assert.match(app,/ADMIN_SECTION_KEYS\.filter\(k=>canAdminSection/);
  /* Admin password entry is masked. It used to be asserted as the literal `type="password"`,
     which stopped matching the moment the field gained a show/hide eye — the gate was intact,
     the string was not. Assert the behaviour instead: the shared field defaults to hidden and
     only reveals on an explicit toggle, and every admin password box goes through it. */
  assert.match(app,/function PasswordField\(/);
  assert.match(app,/const \[show,setShow\]=useState\(false\)/);
  assert.match(app,/type=\{show\?"text":"password"\}/);
  assert.doesNotMatch(app,/<input[^>]*type="password"/);
  for(const label of ['Admin password','New admin password','Confirm admin password']){
    assert.match(app,new RegExp(`<PasswordField[^>]*label="${label}"`),`${label} must use the shared masked field`);
  }
  assert.match(app,/adminSetupHash/);
  assert.match(app,/isMainAdminUid/);
  assert.match(app,/mainAdminOk&&\(<Collapsible[^>]*title="Admin Security"/);
});

test('firebase has a main-owned access record and section rules reference permissions',()=>{
  assert.ok(rules.adminAccess);
  assert.match(rules.adminAccess['.write'],/auth\.uid ===/);
  assert.doesNotMatch(rules.adminAccess['.write'],/permissions\//);
  for(const key of ['orders','dashboard','products','wallets','reviews','requests','guides','settings']) assert.ok(rules.adminAccess.permissions[key]);
  assert.match(rules.orders['.read'],/permissions\/(orders|dashboard)/);
  assert.match(rules.products['.write'],/permissions\/products/);
  assert.match(rules.guides['.write'],/permissions\/guides/);
  assert.match(rules.settings['.write'],/adminSetupHash/);
});

test('promotion is a once-daily dismissible popup',()=>{
  const block=app.slice(app.indexOf('function OfferBanners('),app.indexOf('LOYALTY POINTS WIDGET'));
  assert.match(block,/nemo-promo-popup-day-v1/);
  assert.match(block,/onClick=\{close\}/);
  assert.match(block,/stopPropagation/);
  assert.match(block,/Close promotion/);
});

test('first paint waits for complete boot readiness and splash has no display timer',()=>{
  const boot=app.slice(app.indexOf('The cinematic opening may lift only'),app.indexOf('const deepLinkRef'));
  assert.match(boot,/walletReady/);
  assert.match(boot,/communityReady/);
  assert.match(index,/window\.nemoSplashReady=fadeSplash/);
  assert.doesNotMatch(index,/SPLASH_(?:MIN|MAX)_MS/);
});
