import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync('app.jsx','utf8');
const rules=JSON.parse(fs.readFileSync('database.rules.json','utf8')).rules;
const login=app.slice(app.indexOf('function AdminLogin('),app.indexOf('function MediaUploader('));
/* The build swaps this file in over app.jsx's copy, so it is the one that actually ships.
   The two drifted once already — the back arrow was corrected in app.jsx and stayed thin on
   the live Admin login for a release — so every rule below is checked against both. */
const shipped=fs.readFileSync('src/AdminLogin.jsx','utf8');
const hub=app.slice(app.indexOf('function AdminHub('),app.indexOf('function SettingsPanel('));

test('Admin password is required on every entry and is never remembered',()=>{
  assert.match(login,/placeholder="Admin password"/);
  assert.match(login,/adminPasswordDigest\(password\)/);
  assert.doesNotMatch(login,/nemo-admin-unlocked-v1/);
  assert.doesNotMatch(login,/sessionStorage/);
  /* The screen used to SAY it asks every time, and that sentence stood in for the rule. It is
     gone from the UI — the asking is the telling — so the rule is pinned to the code that
     enforces it: nothing is remembered anywhere, on either copy. */
  for(const [name,src] of [['app.jsx',login],['src/AdminLogin.jsx',shipped]]){
    assert.doesNotMatch(src,/localStorage|sessionStorage|nemo-admin-unlocked/,`${name} must not remember an unlock`);
    assert.doesNotMatch(src,/Enter the Admin password every time/,`${name} still prints the retired instruction`);
    assert.match(src,/adminPasswordDigest\(password\)/,`${name} must still check the password`);
    assert.match(src,/<BackArrow/,`${name} must use the shared back arrow`);
  }
});

test('password opens Admin UI while configured co-admin permissions still limit its tabs',()=>{
  assert.match(app,/function canViewAdminSection\(/);
  assert.match(hub,/const allowedTabs=isCoAdminUid\(adminUid\)\?ADMIN_SECTION_KEYS\.filter\(k=>canAdminSection\(k,adminUid\)\):ADMIN_SECTION_KEYS;/);
  assert.match(hub,/if\(isCoAdminUid\(adminUid\)&&ADMIN_SECTION_KEYS\.includes\(tab\)/);
  for(const key of ['orders','dashboard','products','wallets','reviews','requests','guides','settings']){
    assert.match(hub,new RegExp(`canViewAdminSection\\("${key}",adminUid\\)`));
  }
});

test('unapproved Firebase UIDs still cannot write shared adminAccess or protected product data',()=>{
  assert.match(rules.adminAccess['.write'],/auth\.uid === 'cI2HmMt6FdR7fO7uUnugH85GeZt2'/);
  assert.match(rules.products['.write'],/adminAccess\/coAdminUid/);
  assert.match(rules.products['.write'],/permissions\/products/);
});
