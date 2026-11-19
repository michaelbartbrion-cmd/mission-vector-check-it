'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'../beta/vector-rebel.user.js'),'utf8');
const a=src.indexOf('    // C-shift PPE pilot: read-only shared board.');
const b=src.indexOf('    let lastInterfaceErrorInboxPoll=0;',a);
assert.ok(a>0&&b>a,'C-shift pilot functions are embedded in the actual userscript');
const segment=src.slice(a,b);
function harness(){
 const store=new Map(),events=[];
 const people=[{name:'Michael Brion',prefix:'PERSON-0DCD2AB48E2A5588'}];
 const bridge=(req)=>{
   events.push(req);
   const arg=JSON.parse(req.data||'{}');
   req.onload({status:200,responseText:JSON.stringify(
    req.url.includes('vr-ppe-pilot-recheck')?{ok:true,scope:'c-shift-ppe-pilot-recheck',assetId:arg.assetId,verified:true}:
    req.url.includes('completion')?{ok:true,accepted:true,scope:'c-shift-ppe-pilot',assetId:arg.assetId}:
    req.url.includes('vr-ppe-pilot-inventory')?{ok:true,readOnly:true,scope:'c-shift-ppe-pilot-inventory',personName:arg.personName,knownItems:arg.items.length}:
    {ok:true,readOnly:true,scope:'c-shift-ppe-pilot',shift:'C',people:Array.from({length:7},(_,i)=>({name:i===0?'Michael Brion':'Other '+i,knownItems:0,verifiedItems:0,outstandingItems:0})),
     totals:{knownItems:0,verifiedItems:0,outstandingItems:0},activeTour:true,tourStart:'2026-11-21',lastUpdateAt:'',cadenceMinutes:2}
   )});
 };
 const api=new Function('isMasterOwnerInstallation','getConfig','clean','loadJSON','saveJSON','getActiveMasterRoster',
 'rebelCommandPaired','ensureRebelCommandEnrollment','rebelCommandPairing','GM_xmlhttpRequest','REBEL_COMMAND_ENDPOINT',
 'document','makeOverlayBox','makeButton','location','inferRegularTourWindow',
 'getMode','SCBA_FACE_MASK_POOL',segment+
 '\nreturn {queue:cPilotQueueNativeCompletion,queueInventory:cPilotQueueScopedInventory,pending:cPilotPending,flush:cPilotFlushReceipts,fetch:cPilotFetch,show:showCShiftPilotBoard,queueReadOnly:cPilotQueueReadOnlyResults,nativePath:cPilotNativePath,directTarget:cPilotDirectTarget,display:cPilotRoutineBoard,summary:cPilotSummaryText};')(
 ()=>true,()=>({inspectorName:'Michael Brion'}),
 x=>String(x||'').trim(),
 (key,fallback)=>store.has(key)?store.get(key):fallback,
 (key,value)=>store.set(key,structuredClone(value)),
 ()=>people,()=>true,async()=>true,()=>({token:'TOKEN',deviceId:'DEVICE'}),
 bridge,'https://example.test/bridge',
 {querySelector:()=>null},()=>({overlay:{remove(){}},box:{append(){}}}),
 ()=>({onclick:null}),
 {origin:'https://app.vectorcheckit.us',href:'https://app.vectorcheckit.us/main/asset-manager'},
 ()=>({isActiveTour:true,startDate:'2026-11-21'}),
 mode=>({templates:{'299947':'119122'}}),'299947'
 );
 return{...api,store,events};
}
test('older supplemental PPE records are excluded from current Captain/BC presentation without changing underlying ledger',()=>{
 const h=harness();
 const gear=[
  {assetId:'C',assetType:'Bunker Coat',status:'verified',
    nativeCompletionDate:'2026-11-21',lastVerifiedAt:'2026-11-21T14:00:00Z'},
  {assetId:'P',assetType:'Bunker Pant',status:'not_yet_verified'},
  {assetId:'WH',assetType:'Wildland Helmet',status:'not_yet_verified'},
  {assetId:'DC',assetType:'Dual Certification Coat...',status:'not_yet_verified'},
  {assetId:'PFD',assetType:'Water Rescue PPE, PFD...',status:'not_yet_verified'}
 ];
 const src={totals:{crew:1,knownItems:5,verifiedItems:1,outstandingItems:4},
  outstandingOnDuty:4,activeTour:true,lastUpdateAt:'2026-11-21',
  people:[{name:'Michael Brion',attendance:'working',gear,
    knownItems:5,verifiedItems:1,outstandingItems:4}]};
 const before=JSON.stringify(src);
 const display=h.display(src);
 assert.deepEqual(display.people[0].gear.map(x=>x.assetId),['C','P']);
 assert.deepEqual([display.totals.knownItems,display.totals.verifiedItems,
    display.totals.outstandingItems,display.outstandingOnDuty],
   [2,1,1,1]);
 assert.equal(display.displayExtraExcluded,3);
 assert.equal(display.people[0].lastNativeInspectionDate,'2026-11-21');
 assert.equal(JSON.stringify(src),before,'display filtering never edits source ledger');
 assert.ok(h.summary(src).includes('1 routine native Item Log receipts'));
 assert.ok(!h.summary(src).includes('4 routine outstanding'));
});
test('server-scoped six-pool PPE remains visible even if Vector item label is unusual',()=>{
 const h=harness();
 const src={totals:{crew:1,knownItems:2,verifiedItems:1,outstandingItems:1},
  people:[{name:'Michael Brion',attendance:'working',
   knownItems:2,verifiedItems:1,outstandingItems:1,
   gear:[{assetId:'ODD-COAT',assetType:'Coat Bunker Size 44',
      routineTour:true,status:'verified',nativeCompletionDate:'2026-11-21'},
     {assetId:'EXTRA',assetType:'Wildland Helmet',
      status:'not_yet_verified'}]}]};
 const view=h.display(src);
 assert.deepEqual(view.people[0].gear.map(x=>x.assetId),['ODD-COAT']);
 assert.deepEqual([view.totals.knownItems,view.totals.verifiedItems,
   view.totals.outstandingItems],[1,1,0]);
 assert.equal(view.displayExtraExcluded,1);
});
test('missing source gear array cannot manufacture an all-clear routine count',()=>{
 const h=harness();
 const src={totals:{crew:1,knownItems:3,verifiedItems:1,outstandingItems:2},
  people:[{name:'Michael Brion',attendance:'working',
    knownItems:3,verifiedItems:1,outstandingItems:2}]};
 const display=h.display(src);
 assert.equal(display.displayCoverageUnknown,true);
 assert.equal(display.people[0].displayCoverageUnknown,true);
 assert.equal(display.totals.verifiedItems,0);
 assert.ok(h.summary(src).includes('Unknown routine native Item Log receipts'),
  'an incomplete server array cannot be reported as zero verified checks');
});
test('native Item Log confirmation enqueues known PPE, sends one C-shift receipt and clears after server acknowledgement',async()=>{
 const h=harness();
 const run={runId:'ppe-42',modeKey:'tour',ownerName:'Michael Brion',
  items:[{assetId:'500-01',type:'Coat',ownerName:'Michael Brion',pool:'300045'},
   {assetId:'500-02',type:'Pants',ownerName:'Michael Brion',pool:'300036'}],
  discoverySnapshots:[{ownerName:'Michael Brion',prefix:'PERSON-0DCD2AB48E2A5588',
   items:[{assetId:'500-01',type:'Coat',pool:'300045'},
    {assetId:'500-02',type:'Pants',pool:'300036'},
    {assetId:'500-03',type:'Helmet',pool:'299882'},
    {assetId:'600-01',type:'SCBA Face Mask',pool:'299947'},
    {assetId:'700-01',type:'Wildland Helmet',pool:'300006'}]}]};
 const item=run.items[0];
 assert.equal(h.queue(run,item,'itemlog-confirmed-plus-one-0-to-1-key-abc123'),true);
 await new Promise(resolve=>setImmediate(resolve));
 await h.flush();
 assert.equal(h.pending().length,0);
 assert.equal(h.events.length,1);
 const sent=JSON.parse(h.events[0].data);
 assert.equal(sent.personPrefix,'PERSON-0DCD2AB48E2A5588');
 assert.equal(sent.assetId,'500-01');assert.equal(sent.items.length,3);
 assert.ok(sent.items.some(x=>x.assetId==='500-03'));
 assert.ok(!sent.items.some(x=>x.assetId==='600-01'));
 assert.ok(!sent.items.some(x=>x.assetId==='700-01'));
 assert.equal(sent.evidence,'itemlog-confirmed-plus-one-0-to-1-key-abc123');
 assert.ok(!('failureNote' in sent));
});
test('background C-shift inventory transmits routine Tour PPE plus separate-mask mode, never supplemental gear',async()=>{
 const h=harness(),base='https://app.vectorcheckit.us/app/equipment/PPE/pool/';
 const items=[
  {assetId:'COAT-1',type:'Bunker Coat',pool:'300045',url:base+'300045/11/item'},
  {assetId:'PANTS-1',type:'Bunker Pants',pool:'300036',url:base+'300036/12/item'},
  {assetId:'MASK-1',type:'SCBA Face Mask',pool:'299947',url:base+'299947/13/item',inspectionModeKey:'scbaTour'},
  {assetId:'WILD-1',type:'Wildland Helmet',pool:'300006',url:base+'300006/14/item'},
  {assetId:'DUAL-1',type:'Dual Certification Coat',pool:'299896',url:base+'299896/15/item'},
  {assetId:'WRONG-1',type:'Other PPE',pool:'300082',url:base+'300082/16/item'}
 ];
 const accepted=h.queueInventory([{ownerName:'Michael Brion',prefix:'PERSON-0DCD2AB48E2A5588',items}],
  '2026-11-21T15:00:00Z','2026-11-21');
 assert.equal(accepted,1);
 await new Promise(resolve=>setImmediate(resolve));
 await h.flush();
 const posts=h.events.filter(e=>e.url.includes('vr-ppe-pilot-inventory'));
 assert.equal(posts.length,1,'one scoped inventory POST only');
 const sent=JSON.parse(posts[0].data);
 assert.deepEqual(sent.items.map(x=>x.assetId),['COAT-1','PANTS-1','MASK-1']);
 assert.deepEqual(sent.items.map(x=>x.inspectionMode),['tour','tour','scbaTour']);
 assert.deepEqual(sent.items.map(x=>x.assetPath),[
  '/app/equipment/PPE/pool/300045/11/item',
  '/app/equipment/PPE/pool/300036/12/item',
  '/app/equipment/PPE/pool/299947/13/item'
 ]);
 assert.equal(h.pending().length,0,'acknowledged inventory is removed');
});
test('SCBA face mask native completion enqueues only the seven-question mask form and mode',async()=>{
 const h=harness();
 const path='https://app.vectorcheckit.us/app/equipment/PPE/pool/299947/18/item';
 const mask={assetId:'MASK-1',type:'SCBA Face Mask',pool:'299947',
  inspectionModeKey:'scbaTour',template:'119122',
  ownerName:'Michael Brion',url:path};
 const run={runId:'mask-17',modeKey:'scbaTour',ownerName:'Michael Brion',
  items:[mask],discoverySnapshots:[{ownerName:'Michael Brion',
   prefix:'PERSON-0DCD2AB48E2A5588',items:[mask]}]};
 assert.equal(h.queue(run,mask,'itemlog-confirmed-plus-one-0-to-1-key-abca'),true);
 await new Promise(resolve=>setImmediate(resolve));
 await h.flush();
 const receipt=JSON.parse(h.events[0].data);
 assert.equal(receipt.inspectionMode,'scbaTour');
 assert.deepEqual(receipt.items.map(x=>x.inspectionMode),['scbaTour']);
 assert.deepEqual(receipt.items.map(x=>x.assetId),['MASK-1']);
 assert.equal(receipt.items[0].assetPath,'/app/equipment/PPE/pool/299947/18/item');
 assert.equal(h.queue(run,{...mask,template:'WRONG'},
   'itemlog-confirmed-plus-one-0-to-1-key-abca'),false);
 assert.equal(h.pending().length,0);
});
test('non-confirmed fallback and other-shift users never emit a completion receipt',()=>{
 const h=harness();
 const item={assetId:'500-01',ownerName:'Michael Brion'};
 const run={runId:'a',modeKey:'tour',ownerName:'Michael Brion',items:[item]};
 assert.equal(h.queue(run,item,'post-submit-return-weak'),false);
 assert.equal(h.queue({...run,modeKey:'afterFire'},item,'itemlog-confirmed-plus-one-0-to-1-key-hash'),false);
 assert.equal(h.queue({...run,ownerName:'Unknown Name'}, {...item,ownerName:'Unknown Name'},'itemlog-confirmed-plus-one-0-to-1-key-hash'),false);
 assert.equal(h.events.length,0);
});
test('one pilot board in User, owner shift-level Master view, five core buttons preserved',()=>{
 const menu=src.slice(src.indexOf('    function renderPanelInterface(){'),src.indexOf('    function installPanel() {'));
 assert.match(menu,/make\('BC Check',\(\)=>showCShiftPilotBoard\(true\),true\)/);
 assert.match(menu,/make\('Daily Captain Check',\(\)=>\{/);
 assert.match(src,/Rebuild original history \(all items\)/);
 assert.match(src,/check\.pilotRecheck\?'BC Check':'Full PPE History Audit'/);
 assert.match(menu,/make\('Tour PPE'/);
 assert.match(menu,/make\('Daily Captain Check'/);
 assert.match(src,/C Shift Gear Status · View crew/);
 assert.match(src,/data-vector-ppe-cshift-summary/);
 assert.match(src,/cPilotQueueNativeCompletion\(run,item,evidence\)/);
 assert.match(src,/This refreshes Rebel Command data only/);
});

test('read-only C-shift single-pass queues only successfully read Item Log items for RC',async()=>{
 const h=harness();
 const check={checkId:'cshift-123',tourStart:'2026-11-21',
  items:[{assetId:'A-01',ownerPrefix:'PERSON-0DCD2AB48E2A5588',ownerName:'Michael Brion'},
         {assetId:'A-02',ownerPrefix:'PERSON-0DCD2AB48E2A5588',ownerName:'Michael Brion'}],
  results:[{assetId:'A-01',ownerPrefix:'PERSON-0DCD2AB48E2A5588',
     status:'ok',readAt:'2026-11-21T15:55:00Z',tour:{dates:['2026-11-21']}},
    {assetId:'A-02',ownerPrefix:'PERSON-0DCD2AB48E2A5588',
     status:'error',error:'Unreadable',tour:{dates:[]}}]};
 const result=await h.queueReadOnly(check);
 assert.deepEqual({queued:result.queued,unreadable:result.unreadable}, {queued:2,unreadable:1});
 assert.equal(result.delivered,true);
 assert.equal(h.pending().length,0);
 const posted=h.events.filter(e=>e.url.includes('vr-ppe-pilot-recheck'));
 assert.equal(posted.length,2);
 const request=JSON.parse(posted[0].data);
 const unreadable=JSON.parse(posted[1].data);
 assert.equal(unreadable.readResult,'unreadable');
 assert.equal(unreadable.nativeAssetIdentityVerified,false);
 assert.deepEqual(unreadable.completedDates,[]);
 assert.equal(request.source,'native_read_only_item_log');
 assert.equal(request.nativeAssetIdentityVerified,true);
 assert.equal(request.assetId,'A-01');
 assert.deepEqual(request.completedDates,['2026-11-21']);
 assert.equal(request.checkedAt,'2026-11-21T15:55:00Z');
});
test('read-only mask Item Log creates scbaTour receipt only after native identity verification',async()=>{
 const h=harness();
 const owner='PERSON-0DCD2AB48E2A5588';
 const check={checkId:'mask-native-123',tourStart:'2026-11-21',
  items:[{assetId:'MASK-01',ownerPrefix:owner,ownerName:'Michael Brion',
    pool:'299947',inspectionModeKey:'scbaTour',template:'119122'},
   {assetId:'MASK-02',ownerPrefix:owner,ownerName:'Michael Brion',
    pool:'299947',inspectionModeKey:'scbaTour',template:'119122'}],
  results:[{assetId:'MASK-01',ownerPrefix:owner,status:'ok',
    readAt:'2026-11-21T15:55:00Z',tour:{dates:['2026-11-21']}},
   {assetId:'MASK-02',ownerPrefix:owner,status:'error',
    error:'SCBA form still loading',tour:{dates:[]}}]};
 const result=await h.queueReadOnly(check);
 assert.equal(result.queued,2);
 assert.equal(result.unreadable,1);
 assert.equal(result.delivered,true);
 const posts=h.events.filter(x=>x.url.includes('vr-ppe-pilot-recheck'))
  .map(x=>JSON.parse(x.data));
 assert.equal(posts.length,2);
 assert.deepEqual(posts.map(x=>x.inspectionMode),['scbaTour','scbaTour']);
 assert.equal(posts[0].nativeAssetIdentityVerified,true);
 assert.deepEqual(posts[0].completedDates,['2026-11-21']);
 assert.equal(posts[1].nativeAssetIdentityVerified,false);
 assert.deepEqual(posts[1].completedDates,[]);
 assert.equal(h.pending().length,0);
});
test('recheck is only available through confirmed-working Master, never through User',()=>{
 const menu=src.slice(src.indexOf('    function showCShiftPilotBoard('),
   src.indexOf('    let lastInterfaceErrorInboxPoll=0;'));
 assert.match(menu,/if\(battalion&&isMasterOwnerInstallation\(\)\)/);
 assert.match(src,/p\.nextRequiredItem&&p\.nextRequiredMode/);
 assert.match(src,/p\.nextItem&&p\.outstandingItems>0/);
 assert.match(src,/if\(check\.pilotRecheck===true\)/);
 assert.match(src,/cPilotQueueReadOnlyResults\(check\)/);
 assert.match(src,/nativeAssetIdentityVerified:readable/);
});
test('modern server rotates the separate SCBA mask form without guessing or submitting inspection',()=>{
 const h=harness();
 const required={name:'Michael Brion',prefix:'PERSON-0DCD2AB48E2A5588',
   attendance:'working',nextRequiredItem:'MASK-1',
   nextRequiredMode:'scbaTour',
   nextRequiredPath:'/app/equipment/PPE/pool/299947/4605913/item'};
 const target=h.directTarget(required);
 assert.equal(target.inspectionModeKey,'scbaTour');
 assert.equal(target.template,'119122');
 assert.equal(target.type,'SCBA Face Mask');
 assert.equal(target.assetId,'MASK-1');
 assert.equal(h.directTarget({...required,nextRequiredMode:'tour'}),null);
 assert.equal(h.directTarget({...required,nextRequiredPath:'/app/equipment/PPE/pool/300006/4605913/item'}),null);
 const regular=h.directTarget({...required,nextRequiredItem:'COAT-1',
   nextRequiredMode:'tour',nextRequiredPath:'/app/equipment/PPE/pool/300045/4605913/item'});
 assert.equal(regular.inspectionModeKey,'tour');
 assert.equal(regular.assetId,'COAT-1');
});
test('BC pilot uses only same-origin cached native PPE paths and preserves exact pool/item identity',()=>{
 const h=harness();
 const good='https://app.vectorcheckit.us/app/equipment/PPE/pool/300045/4605913/item?source=assetManager&sourceTab=PPE';
 const path='/app/equipment/PPE/pool/300045/4605913/item';
 assert.equal(h.nativePath(good),path);
 assert.equal(h.nativePath('https://evil.example/app/equipment/PPE/pool/300082/4605913/item'),'');
 assert.equal(h.nativePath('javascript:alert(1)'),'');
 assert.equal(h.nativePath('/app/equipment/PPE/pool/../../secret'),'');
 const direct=h.directTarget({name:'Michael Brion',prefix:'PERSON-0DCD2AB48E2A5588',
  attendance:'working',nextItem:'BRION-4111218',nextItemPath:path});
 assert.equal(direct.pool,'300045');assert.equal(direct.itemId,'4605913');
 assert.equal(direct.assetId,'BRION-4111218');
 assert.equal(direct.url,good);
 assert.equal(h.directTarget({name:'Michael Brion',attendance:'off',nextItem:'BRION-4111218',nextItemPath:path}),null);
 assert.equal(h.directTarget({name:'Michael Brion',attendance:'working',nextItem:'BRION-4111218',nextItemPath:'https://evil.example/steal'}),null);
 assert.equal(h.directTarget({name:'Michael Brion',attendance:'working',nextItem:'BRION-4111218',nextItemPath:'/app/equipment/PPE/pool/300082/4605913/item'}),null,
   'supplemental equipment is excluded from background C pilot');
});
test('dedicated BC monitor will not repeat a full crew equipment crawl when stored links are absent',()=>{
 assert.match(src,/if\(dedicated&&!directReady\)\{/);
 assert.match(src,/Automatic monitoring will not repeatedly crawl crew equipment/);
 assert.match(src,/if\(!directReady\)\{[\s\S]*?scanPpeCrewOwners\(owners,/);
 assert.match(src,/if\(!dedicated&&!confirm\('Run one read-only PPE Item Log check/);
});
