'use strict';
const test=require('node:test'), assert=require('node:assert/strict'),fs=require('node:fs');
const src=fs.readFileSync(require('node:path').join(__dirname,'../beta/rebel-iq.user.js'),'utf8');
const cut=(a,b)=>{
  const i=src.indexOf(a),j=src.indexOf(b,i+a.length);
  assert.ok(i>0&&j>i,a+' .. '+b+' missing');
  return src.slice(i,j);
};
test('Daily Tour and Assets are separate independent actions',()=>{
  assert.match(src,/button\('Daily Tour', 'daily'\)/);
  assert.match(src,/button\('Assets', 'assets'\)/);
  assert.doesNotMatch(src,/Daily Tour \+ Assets|readAssetFollowup|writeAssetFollowup/);
  const begin=cut('  function begin(kind) {','  function beginRopes() {');
  assert.match(begin,/writePending\(\{ kind, unitId: id/);
  assert.doesNotMatch(begin,/assetUrl\(|ASSET_OPEN_KEY|location\.assign\(assetUrl/);
});
test('Assets button opens compact in-page side panel instead of taking over browser',()=>{
  const begin=cut('  function beginAssets() {','  function begin(kind) {');
  assert.match(begin,/openAssetReviewScreen\(\)/);
  assert.match(begin,/sessionStorage\.setItem\(ASSET_OPEN_KEY/);
  assert.match(begin,/location\.assign\(assetUrl\(id\)\)/);
  assert.match(src,/const ASSET_OPEN_KEY = 'rebelIqT504AssetsOpenOnceV1'/);
  const screen=cut('  function makeAssetReviewScreen() {','  function refreshAssetReviewGuide() {');
  assert.match(screen,/position:fixed;top:188px;left:16px/);
  assert.doesNotMatch(screen,/position:fixed;inset:0/);
  assert.match(screen,/width:min\(460px,calc\(100vw - 32px\)\)/);
  assert.match(screen,/close.textContent = 'Close'/);
  assert.match(screen,/load.textContent = 'Refresh'/);
  assert.match(screen,/screen\.style\.display='block'/);
  assert.match(screen,/screen\.style\.display='none'/);
  assert.doesNotMatch(src,/makeAssetReviewSection\(\)/);
});
test('cross-route Assets opens once after the native page actually loads',()=>{
  const tick=cut('  function tick() {','  // Only capture global errors');
  assert.match(tick,/const assetOpenAt = Number\(sessionStorage\.getItem\(ASSET_OPEN_KEY\)/);
  assert.match(tick,/isAssetPage\(\) && t504Visible\(\)/);
  assert.match(tick,/openAssetReviewScreen\(\)/);
  assert.match(tick,/sessionStorage\.removeItem\(ASSET_OPEN_KEY\)/);
});
test('questionnaire prep still uses Save In Process and avoids official completion',()=>{
  const prep=cut('  async function prepare(kind) {','  async function runPending() {');
  assert.match(prep,/verified\.save\.click\(\)/);
  assert.doesNotMatch(prep,/submit|Submit|Complete Inspection/i);
  assert.match(src,/Draft answers are not yet recorded in Operative IQ/);
});
test('overview inspection route is recognized without a trailing slash',()=>{
  const line=src.split('\n').find(x=>x.includes('const inspectionId = () =>'));
  assert.ok(line);
  const fn=new Function('location',line+'return inspectionId');
  assert.equal(fn({pathname:'/inspections/60443'})(),'60443');
  assert.equal(fn({pathname:'/inspections/60443/assets/group/-1'})(),'60443');
  assert.equal(fn({pathname:'/inspections/99999'})(),'99999');
  assert.equal(fn({pathname:'/inspections/reports'})(),'');
});