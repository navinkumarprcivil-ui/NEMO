import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync('app.jsx','utf8');
const rules=JSON.parse(fs.readFileSync('database.rules.json','utf8')).rules;
const login=app.slice(app.indexOf('function AdminLogin('),app.indexOf('function MediaUploader('));
const hub=app.slice(app.indexOf('function AdminHub('),app.indexOf('function SettingsPanel('));

test('Admin password is required on every entry and is never remembered',()=>{
  assert.match(login,/placeholder="Admin password"/);
  assert.match(login,/adminPasswordDigest\(password\)/);
  assert.doesNotMatch(login,/nemo-admin-unlocked-v1/);
  assert.doesNotMatch(login,/sessionStorage/);
  assert.match(login,/Enter the Admin password every time you open Admin/);
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
