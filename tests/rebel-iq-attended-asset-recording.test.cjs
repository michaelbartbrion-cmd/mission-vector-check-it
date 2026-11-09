'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'../beta/rebel-iq.user.js'),'utf8');
const begin=src.indexOf('  function makeAssetReviewScreen() {');
const end=src.indexOf('  function beginAssets() {',begin);
assert.ok(begin>0&&end>begin);
const section=src.slice(begin,end);
test('asset controls stay in the one expanded Rebel IQ panel without a floating overlay',()=>{
  assert.match(src,/body\.append\(actions, makeAssetReviewSection\(\), statusWrap\)/);
  assert.match(section,/Refresh Unverified List/);
  assert.match(section,/Record Verified Assets/);
  assert.doesNotMatch(section,/window\.confirm\(/);
});
test('draft Verified choices never physically certify a T504 asset by themselves',()=>{
  assert.match(section,/choice:'verified'/);
  assert.match(section,/load\.onclick = loadAssetChecklist/);
  assert.match(section,/record\.onclick = \(\) => \{ void recordReviewedAssetChecklist\(\); \}/);
  assert.match(section,/attest\.checked/);
  assert.match(section,/readPending\(\) \|\| readRopes\(\)/);
  assert.match(section,/inspectionId\(\)!==ASSET_UNIT_ID/);
});
test('each asset gets its own native receipt and stops on uncertain result',()=>{
  assert.match(section,/if\(same.length!==1 \|\| same\[0\]\.status!=='not verified'/);
  assert.match(section,/native\.button\.click\(\)/);
  assert.match(section,/actual\[0\]\.status==='verified'/);
  assert.match(section,/Official Verified status not confirmed/);
  assert.match(section,/Previously attempted tag/);
  assert.match(section,/assetBatchCancel/);
  assert.doesNotMatch(section,/\bfetch\(|GM_xmlhttpRequest\(|\.submit\(/);
});
test('unverified items with missing or duplicate tags are shown but not auto-recorded',()=>{
  assert.match(section,/tagCounts\.get\(assetTag\) === 1/);
  assert.match(section,/tag unavailable/);
  assert.match(section,/manual \(no unique tag\)/);
  assert.match(section,/unmapped/);
});
test('recording is physical presence and operation, unrelated to scheduled maintenance',()=>{
  assert.match(section,/present and working/);
  assert.doesNotMatch(section,/maintenanceBlocked|blocked\.maintenance/);
  assert.match(src,/^\/\/ @version\s+0\.1\.17/m);
});

test('opening T504 Assets loads a draft list automatically without recording an asset',()=>{
  assert.match(src,/lastAssetChecklistAutoloadRoute !== location.pathname/);
  assert.match(src,/lastAssetChecklistAutoloadRoute = location.pathname/);
  assert.match(src,/if \(isAssetPage\(\)\) \{ loadAssetChecklist\(\); return; \}/);
  const start=src.indexOf('  function loadAssetChecklist() {');
  const end=src.indexOf('  async function recordReviewedAssetChecklist() {',start);
  const draft=src.slice(start,end);
  assert.match(draft,/buildReviewedAssetChecklist\(\)/);
  assert.doesNotMatch(draft,/native\.button\.click\(\)|\.submit\(|\bfetch\(/);
});
