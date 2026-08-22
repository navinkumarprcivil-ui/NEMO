import test from 'node:test';
import assert from 'node:assert/strict';
import { ensureAdminLoginSource } from '../scripts/admin-login-fix.mjs';

const OLD = `const before=true;\nfunction AdminLogin({onSuccess,onBack,onAdminSignIn,settings={}}){\n  const [password,setPassword]=useState(\"\");\n  const [busy,setBusy]=useState(false);\n  const [msg,setMsg]=useState(\"\");\n  const configured=String(settings.adminSetupHash||\"\").trim();\n  return(<div>{configured?(<input placeholder=\"Admin password\"/>):(<button>Main admin: set up password</button>)}</div>);\n}\n\nfunction MediaUploader(){ return null; }\n`;

test('normalizer always renders the Admin password field',()=>{
  const fixed=ensureAdminLoginSource(OLD);
  const login=fixed.slice(fixed.indexOf('function AdminLogin('),fixed.indexOf('function MediaUploader('));
  assert.match(login,/placeholder="Admin password"/);
  assert.match(login,/FB_DB\.ref\("settings\/adminSetupHash"\)\.get\(\)/);
  assert.match(login,/const \[checking,setChecking\]/);
  assert.doesNotMatch(login,/\{configured\?\(/);
  assert.match(login,/!configured&&!checking/);
});

test('normalizer keeps password required on every Admin entry',()=>{
  const fixed=ensureAdminLoginSource(OLD);
  const login=fixed.slice(fixed.indexOf('function AdminLogin('),fixed.indexOf('function MediaUploader('));
  assert.match(login,/adminPasswordDigest\(password\)/);
  assert.doesNotMatch(login,/sessionStorage/);
  assert.doesNotMatch(login,/nemo-admin-unlocked-v1/);
});

test('normalizer is idempotent',()=>{
  const once=ensureAdminLoginSource(OLD);
  assert.equal(ensureAdminLoginSource(once),once);
});
