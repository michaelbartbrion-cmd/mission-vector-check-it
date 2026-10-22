'use strict';
// Regression: never interpret generic PPE inventory prefixes as a person's identity.
// This is a fail-closed guard while explicit Vector assignment columns are validated.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const script = fs.readFileSync(path.join(__dirname, '../beta/vector-rebel.user.js'), 'utf8');
function segment(name, nextName) {
  const from = script.indexOf('    function ' + name);
  const end = script.indexOf('    function ' + nextName, from + 1);
  assert.ok(from >= 0 && end > from, 'must contain ' + name);
  return script.slice(from, end);
}
const src = segment('rosterHasPersonSpecificPrefix', 'rosterNeedsReview') +
  '\n' + segment('scanCurrentPpePagePeople', 'findVectorNavigationTarget') +
  '\nreturn {rosterHasPersonSpecificPrefix, scanCurrentPpePagePeople};';
const clean = x => String(x ?? '').trim();
const surname = x => (clean(x).toUpperCase().split(/\s+/).at(-1) || '').replace(/[^A-Z0-9]/g, '');
function harness(assets) {
  return new Function('clean','expectedSurnamePrefix','getPpeResultsContainer',
    'getVisiblePpeAnchors','genericAssetIdFromAnchor','prefixFromAssetId',
    'ppeRowForAnchor','likelyPersonFromPpeRow','rowCellTexts',
    'normalizedPpeTypeText','masterNameKey',src)(
      clean,surname,()=>({}),()=>assets,a=>a.assetId,
      id => {const parts=id.split('-'),n=parts.findIndex(p=>/^\d+$/.test(p));return n>0?parts.slice(0,n).join('-'):parts[0]},
      a=>a,a=>a.person,()=>[],()=>'',x=>clean(x).toLowerCase()
    );
}
test('M and WS0122 inventory series cannot be assigned to unrelated people', () => {
  const api = harness([
    {assetId:'M-1470-000000038',person:'Christopher Hoogerwerf'},
    {assetId:'WS0122-354',person:'Daniel Guerra-Herrera'},
    {assetId:'BRION-10237792-FL',person:'Michael Brion'},
    {assetId:'BRION-4110519',person:'Michael Brion'}
  ]);
  const result = api.scanCurrentPpePagePeople();
  assert.deepEqual(result.people.map(p=>[p.name,p.prefix,p.assetCount]),
    [['Michael Brion','BRION',2]]);
  assert.deepEqual(result.unverified.map(p=>p.prefix),['M','WS0122']);
});
test('surname-matched prefix can be used and mismatched names fail closed', () => {
  const api = harness([]);
  assert.equal(api.rosterHasPersonSpecificPrefix({name:'Michael Brion',prefix:'BRION'}),true);
  assert.equal(api.rosterHasPersonSpecificPrefix({name:'Christopher Hoogerwerf',prefix:'M'}),false);
  assert.equal(api.rosterHasPersonSpecificPrefix({name:'Daniel Guerra-Herrera',prefix:'WS0122'}),false);
});
test('old captain-set lookup bypass of unknown master prefixes stays closed', () => {
  assert.ok(script.includes('.map(prefix => rosterPersonByPrefix(prefix))'));
  assert.ok(script.includes('return rosterHasPersonSpecificPrefix(master) ? master : null'));
  assert.ok(script.includes('report.checks.ownerColumnDiagnostics'));
});
