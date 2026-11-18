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
    {ok:true,readOnly:true,scope:'c-shift-ppe-pilot',shift:'C',people:Array.from({length:7},(_,i)=>({name:i===0?'Michael Brion':'Other '+i,knownItems:0,verifiedItems:0,outstandingItems:0})),
     totals:{knownItems:0,verifiedItems:0,outstandingItems:0},activeTour:true,tourStart:'2026-11-21',lastUpdateAt:'',cadenceMinutes:2}
   )});
 };
 const api=new Function('isMasterOwnerInstallation','getConfig','clean','loadJSON','saveJSON','getActiveMasterRoster',
 'rebelCommandPaired','ensureRebelCommandEnrollment','rebelCommandPairing','GM_xmlhttpRequest','REBEL_COMMAND_ENDPOINT',
 'document','makeOverlayBox','makeButton','location',segment+
 '\nreturn {queue:cPilotQueueNativeCompletion,pending:cPilotPending,flush:cPilotFlushReceipts,fetch:cPilotFetch,show:showCShiftPilotBoard,queueReadOnly:cPilotQueueReadOnlyResults,nativePath:cPilotNativePath,directTarget:cPilotDirectTarget};')(
 ()=>true,()=>({inspectorName:'Michael Brion'}),
 x=>String(x||'').trim(),
 (key,fallback)=>store.has(key)?store.get(key):fallback,
 (key,value)=>store.set(key,structuredClone(value)),
 ()=>people,()=>true,async()=>true,()=>({token:'TOKEN',deviceId:'DEVICE'}),
 bridge,'https://example.test/bridge',
 {querySelector:()=>null},()=>({overlay:{remove(){}},box:{append(){}}}),
 ()=>({onclick:null}),
 {origin:'https://app.vectorcheckit.us',href:'https://app.vectorcheckit.us/main/asset-manager'}
 );
 return{...api,store,events};
}
test('native Item Log confirmation enqueues known PPE, sends one C-shift receipt and clears after server acknowledgement',async()=>{
 const h=harness();
 const run={runId:'ppe-42',modeKey:'tour',ownerName:'Michael Brion',
  items:[{assetId:'500-01',type:'Coat',ownerName:'Michael Brion'},
   {assetId:'500-02',type:'Pants',ownerName:'Michael Brion'}],
  discoverySnapshots:[{ownerName:'Michael Brion',prefix:'PERSON-0DCD2AB48E2A5588',
   items:[{assetId:'500-01',type:'Coat'},{assetId:'500-02',type:'Pants'},
   {assetId:'500-03',type:'Helmet'},{assetId:'600-01',type:'SCBA Face Mask'}]}]};
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
 assert.equal(sent.evidence,'itemlog-confirmed-plus-one-0-to-1-key-abc123');
 assert.ok(!('failureNote' in sent));
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
 assert.match(src,/Full PPE History Audit \(all items\)/);
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
test('recheck is only available through confirmed-working Master, never through User',()=>{
 const menu=src.slice(src.indexOf('    function showCShiftPilotBoard('),
   src.indexOf('    let lastInterfaceErrorInboxPoll=0;'));
 assert.match(menu,/if\(battalion&&isMasterOwnerInstallation\(\)\)/);
 assert.match(src,/p\.attendance==='working'&&p\.nextItem&&p\.outstandingItems>0/);
 assert.match(src,/if\(check\.pilotRecheck===true\)/);
 assert.match(src,/cPilotQueueReadOnlyResults\(check\)/);
 assert.match(src,/nativeAssetIdentityVerified:readable/);
});
test('BC pilot uses only same-origin cached native PPE paths and preserves exact pool/item identity',()=>{
 const h=harness();
 const good='https://app.vectorcheckit.us/app/equipment/PPE/pool/300082/4605913/item?source=assetManager&sourceTab=PPE';
 const path='/app/equipment/PPE/pool/300082/4605913/item';
 assert.equal(h.nativePath(good),path);
 assert.equal(h.nativePath('https://evil.example/app/equipment/PPE/pool/300082/4605913/item'),'');
 assert.equal(h.nativePath('javascript:alert(1)'),'');
 assert.equal(h.nativePath('/app/equipment/PPE/pool/../../secret'),'');
 const direct=h.directTarget({name:'Michael Brion',prefix:'PERSON-0DCD2AB48E2A5588',
  attendance:'working',nextItem:'BRION-4111218',nextItemPath:path});
 assert.equal(direct.pool,'300082');assert.equal(direct.itemId,'4605913');
 assert.equal(direct.assetId,'BRION-4111218');
 assert.equal(direct.url,good);
 assert.equal(h.directTarget({name:'Michael Brion',attendance:'off',nextItem:'BRION-4111218',nextItemPath:path}),null);
 assert.equal(h.directTarget({name:'Michael Brion',attendance:'working',nextItem:'BRION-4111218',nextItemPath:'https://evil.example/steal'}),null);
});
test('dedicated BC monitor will not repeat a full crew equipment crawl when stored links are absent',()=>{
 assert.match(src,/if\(dedicated&&!directReady\)\{/);
 assert.match(src,/Automatic monitoring will not repeatedly crawl crew equipment/);
 assert.match(src,/if\(!directReady\)\{[\s\S]*?scanPpeCrewOwners\(owners,/);
 assert.match(src,/if\(!dedicated&&!confirm\('Run one read-only PPE Item Log check/);
});
