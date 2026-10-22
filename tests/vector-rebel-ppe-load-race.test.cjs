'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const script = fs.readFileSync(path.join(__dirname, '../beta/vector-rebel.user.js'), 'utf8');
const start = script.indexOf('    function ppeLoadedRowsSnapshot() {');
const end = script.indexOf('    async function goToFirstPpePage(progress = null) {', start);
assert.ok(start >= 0 && end > start, 'PPE load barrier functions must exist');
const source = script.slice(start, end) + '\nreturn {ppeLoadedRowsSnapshot,waitForPpeRowsReady,waitForPpePageChange};';

function harness({initialRows=0, finalRows=10, firstVisibleAt=800, fullAt=2200,
  pageLinkBefore='PAGE-A', pageLinkAfter='PAGE-B', requireChange=false,
  neverLoad=false}={}) {
  let ms = 0;
  const footer = '1-10 of 42';
  const root = {parentElement:{innerText:footer},innerText:footer};
  const header = {querySelectorAll:()=>['Name','Pool','Location','Responsible Party','Item Status']
      .map(text=>({innerText:text}))};
  function makeRow(index, page) {
    const cells = ['ASSET-'+page+'-'+index,'Bunker Coat','A Place',
      'Michael Brion','In Service'].map(text=>({innerText:text}));
    const row = {closest:()=>header,querySelectorAll:()=>cells};
    return {row,getAttribute:()=>'/app/equipment/PPE/pool/300045/'+
        (page==='B'?2000+index:1000+index)+'/item'};
  }
  const initial=Array.from({length:initialRows},(_,i)=>makeRow(i,'A'));
  const final=Array.from({length:finalRows},(_,i)=>makeRow(i,'B'));
  const visibleRows=()=>{
    if (neverLoad || ms<firstVisibleAt) return [];
    if (requireChange && ms<fullAt) return initial;
    if (ms<fullAt) return final.slice(0,1);
    return final;
  };
  const signature=()=>requireChange && ms<fullAt ? pageLinkBefore : pageLinkAfter;
  const fakeClock={now:()=>ms};
  const factory = new Function('Date','clean','getPpeResultsContainer','getVisiblePpeAnchors',
    'ppeRowForAnchor','findVectorNavigationTarget','vectorControlLooksActive',
    'visibleAssetLinksSignature','sleep',source);
  const api=factory(fakeClock,v=>String(v??'').replace(/\s+/g,' ').trim(),
    ()=>root,()=>visibleRows(),a=>a.row,()=>ms>=400?{}:null,()=>true,
    signature,async()=>{ms+=200;});
  return {...api,clock:()=>ms,visibleRows};
}

test('waits for PPE tab activation and all ten expected rows, not just first link', async()=>{
  const h=harness();
  const result=await h.waitForPpeRowsReady(6000);
  assert.equal(result.count,10);
  assert.ok(h.clock()>=3600,'must observe post-population stabilization');
});

test('cannot declare a page ready merely because the tab is selected', async()=>{
  const h=harness({neverLoad:true});
  await assert.rejects(()=>h.waitForPpeRowsReady(1600),/did not finish loading/);
});

test('pagination refuses to accept the unchanged old page or a partial new page',async()=>{
  const h=harness({requireChange:true,initialRows:10,finalRows:10,fullAt:2200,firstVisibleAt:0});
  const link=await h.waitForPpePageChange('PAGE-A',6000);
  assert.equal(typeof link,'string');
  assert.match(link,/ASSET-B/);
  assert.ok(h.clock()>=3600);
});

test('timeout on partially populated results does not return a fake full census',async()=>{
  const h=harness({finalRows:3,fullAt:0});
  await assert.rejects(()=>h.waitForPpeRowsReady(1800),/did not finish loading/);
});

test('originally empty-ready guard is replaced for both navigation and already-open PPE',()=>{
  assert.match(script,/Already on Equipment → PPE; waiting for inventory rows/);
  assert.match(script,/await waitForPpeRowsReady\(22000, null, progress\)/);
  assert.match(script,/await waitForPpeListReady\(22000, progress\)/);
  assert.match(script,/await waitForPpeRowsReady\(22000, beforeClear, progress\)/);
  assert.match(script,/const currentPage = ppeLoadedRowsSnapshot\(\)/);
});
