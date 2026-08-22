import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { composeAdminLoginSource } from '../scripts/compose-source.mjs';

const root=join(dirname(fileURLToPath(import.meta.url)),'..');
const admin=readFileSync(join(root,'src','AdminLogin.jsx'),'utf8');
const OLD=`const before=true;\nfunction AdminLogin({onSuccess,onBack,onAdminSignIn,settings={}}){\n  const configured=String(settings.adminSetupHash||\"\").trim();\n  return(<div>{configured?(<input placeholder=\"Admin password\"/>):(<button>Setup</button>)}</div>);\n}\n\nfunction MediaUploader(){ return null; }\n`;

test('canonical Admin login always renders the password field',()=>{
  assert.match(admin,/placeholder="Admin password"/);
  assert.match(admin,/FB_DB\.ref\("settings\/adminSetupHash"\)\.get\(\)/);
  assert.match(admin,/const \[checking,setChecking\]/);
  assert.doesNotMatch(admin,/\{configured\?\(/);
  assert.match(admin,/!configured&&!checking/);
});

test('Admin password remains required on every Admin entry',()=>{
  assert.match(admin,/adminPasswordDigest\(password\)/);
  assert.doesNotMatch(admin,/sessionStorage/);
  assert.doesNotMatch(admin,/nemo-admin-unlocked-v1/);
});

test('build composition replaces only the AdminLogin source block',()=>{
  const composed=composeAdminLoginSource(OLD,admin);
  assert.ok(composed.startsWith('const before=true;'));
  assert.match(composed,/placeholder="Admin password"/);
  assert.match(composed,/function MediaUploader\(\)\{ return null; \}/);
  assert.doesNotMatch(composed,/const configured=String\(settings\.adminSetupHash/);
});
