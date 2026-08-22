import test from 'node:test';
import assert from 'node:assert/strict';
import { composeOfferBannersPortalSource } from '../scripts/compose-source.mjs';

const SAMPLE = `const before=true;\nfunction OfferBanners({settings,orders=[]}){\n  const close=()=>{};\n  return(\n    <div onClick={close} role=\"presentation\" style={{position:\"fixed\"}}>\n      <div role=\"dialog\">Today at Nemo</div>\n    </div>\n  );\n}\n/* Food re-order reminder banner */\nfunction FoodReorderBanner(){ return null; }\n`;

test('welcome offer popup is portaled outside the Home layout',()=>{
  const fixed=composeOfferBannersPortalSource(SAMPLE);
  const block=fixed.slice(fixed.indexOf('function OfferBanners('),fixed.indexOf('function FoodReorderBanner('));
  assert.match(block,/return\(\n    <Portal>\n    <div onClick=\{close\} role=\"presentation\"/);
  assert.match(block,/<\/div>\n    <\/Portal>\n  \);/);
});

test('portal composition is idempotent',()=>{
  const once=composeOfferBannersPortalSource(SAMPLE);
  assert.equal(composeOfferBannersPortalSource(once),once);
});
