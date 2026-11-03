'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'../beta/vector-rebel.user.js'),'utf8');
const pure=(start,end)=>{
 const a=src.indexOf(start),b=src.indexOf(end,a+start.length);
 assert.ok(a>0&&b>a,'missing '+start);return src.slice(a,b);
};
const stored={},requests=[];
let nextReply={status:200,responseText:''};
const loadJSON=(key,fallback)=>stored[key]??fallback;
const saveJSON=(key,value)=>{stored[key]=value};
const normalized=people=>({
 people:(people||[]).map(p=>({...p})),
 rejected:[],merged:[]
});
const env={
 loadJSON,saveJSON,persistentRemoveRaw:key=>{delete stored[key]},
 normalizeMasterRoster:normalized,clean:v=>String(v??'').trim(),
 rebelCommandPaired:()=>true,ensureRebelCommandEnrollment:async()=>true,
 rebelCommandPairing:()=>({token:'mock-only',deviceId:'vr-test'}),
 GM_xmlhttpRequest:opts=>{requests.push(opts);queueMicrotask(()=>opts.onload(nextReply))},
 REBEL_COMMAND_ENDPOINT:'https://base44.app/api/apps/TEST/functions/telemetryBridge'
};
const keys=Object.keys(env);
const imports=Object.values(env);
const shared=new Function(...keys,pure('const SHARED_ROSTER_KEY =','function verifyRebelCommandPairing() {')+
 ';return {refreshSharedRebelRoster,sharedRosterFromCache,sharedRosterSyncState};')(...imports);
const current=new Function('loadJSON','normalizeMasterRoster','clean','sharedRosterFromCache',
 'MASTER_ROSTER_OVERRIDE_KEY','BUILTIN_MASTER_ROSTER','BUILTIN_MASTER_ROSTER_VERSION',
 pure('function getMasterRosterState() {','function getActiveMasterRoster() {')+
 ';return getMasterRosterState;')(
 loadJSON,normalized,env.clean,shared.sharedRosterFromCache,
 'localMaster',[{name:'Michael Brion',prefix:'BRION',active:true}],'bootstrap'
);
test('A verified central publication overrides one locally saved administrator roster',async()=>{
 stored.localMaster={version:'local-old',people:[{name:'Michael Brion',prefix:'BRION',active:true}]};
 nextReply={status:200,responseText:JSON.stringify({
  ok:true,scope:'vector-rebel-shared-roster',version:'2026-11-03T18:00:00Z',
  publishedAt:'2026-11-03T18:00:00Z',
  people:[{name:'Michael Baldree',prefix:'PERSON-MICHAEL-BALDREE',active:true},
    {name:'Jared Weston',prefix:'PERSON-JARED-WESTON',active:true}]
 })};
 assert.equal(await shared.refreshSharedRebelRoster(true),true);
 assert.equal(current().source,'shared-command');
 assert.deepEqual(current().people.map(p=>p.name),['Michael Baldree','Jared Weston']);
 assert.equal(requests.at(-1).method,'GET');
 assert.ok(requests.at(-1).url.endsWith('?action=vr-shared-roster'));
 assert.equal(requests.at(-1).headers['X-Rebel-Device-ID'],'vr-test');
});
test('Network failure never erases last approved central names',async()=>{
 nextReply={status:503,responseText:JSON.stringify({ok:false,error:'unavailable'})};
 assert.equal(await shared.refreshSharedRebelRoster(true),false);
 assert.equal(current().source,'shared-command');
 assert.equal(shared.sharedRosterSyncState().status,'unavailable');
 assert.equal(current().people.length,2);
});
test('Revoked or inactive credentials revoke the cached shared roster',async()=>{
 nextReply={status:403,responseText:JSON.stringify({ok:false,error:'Not on approved roster'})};
 assert.equal(await shared.refreshSharedRebelRoster(true),false);
 assert.equal(current().source,'local-admin');
 assert.equal(stored.vectorRebelApprovedRosterV1,undefined);
});
test('Without a central publication the existing local master remains available',()=>{
 delete stored.vectorRebelApprovedRosterV1;
 assert.equal(current().source,'local-admin');
 assert.equal(current().people[0].name,'Michael Brion');
});
test('No roster editing is performed by the shared download',()=>{
 const part=pure('const SHARED_ROSTER_KEY =','function verifyRebelCommandPairing() {');
 assert.ok(!part.includes('Submit Inspection'));
 assert.match(src,/const published=getMasterRosterState\(\);/);
 assert.match(src,/published\.source==='shared-command'/);
 assert.match(src,/const centrallyManaged=getMasterRosterState\(\)\.source==='shared-command'/);
 assert.match(src,/void refreshSharedRebelRoster\(false\)/);
 assert.match(src,/Sync roster from Rebel Command|Refresh approved roster/);
});
test('Failures report through both automatic event and optional incident feedback',()=>{
 assert.match(src,/function reportRebelErrorToCommand\(reason,workflow='',stage=''\)/);
 assert.match(src,/submitRebelCommandFeedback\(item\.message,/);
 assert.match(src,/sourceContext:'automatic_error'/);
 assert.match(src,/const fillLastError=makeButton\('Use Last Error'\)/);
 assert.match(src,/mainAction\('Report Problem'/);
 assert.match(src,/Number\(receipt\.acceptedSuggestions\)>0/);
 assert.match(src,/telemetrySafeErrorMessage\(reason/);
});

test('Master List buttons expose local publish and recipient download without PPE writes',()=>{
 assert.match(src,/makeButton\('Share My Master List'/);
 assert.match(src,/makeButton\('Get Latest Master List'/);
 assert.match(src,/action=vr-publish-roster/);
 assert.match(src,/if\(!rebelCommandPairing\(\)\?\.autoEnrolled\)rosterCard.append\(shareRoster\)/);
 assert.match(src,/setInterval\(\(\)=>\{void refreshSharedRebelRoster\(false\);\},10\*60\*1000\)/);
});
test('admin-roster publication sends approved names only and confirms server receipt',async()=>{
 stored.localMaster={people:[
  {name:'Michael Baldree',prefix:'PERSON-MICHAEL-BALDREE',active:true},
  {name:'Robert Brooks',prefix:'PERSON-ROBERT-BROOKS',active:true}
 ]};
 nextReply={status:200,responseText:JSON.stringify({ok:true,version:'v1',count:2})};
 const publish=new Function('loadJSON','normalizeMasterRoster','rebelCommandPaired',
  'rebelCommandPairing','masterRosterExportPayload','GM_xmlhttpRequest',
  'REBEL_COMMAND_ENDPOINT','MASTER_ROSTER_OVERRIDE_KEY','clean',
  pure('async function publishLocalMasterRoster()','function prefixesOverlap(aRaw, bRaw) {')+
  ';return publishLocalMasterRoster;')(
   loadJSON,normalized,()=>true,()=>({deviceId:'admin-1',token:'mock-token'}),
   people=>({people}),env.GM_xmlhttpRequest,env.REBEL_COMMAND_ENDPOINT,'localMaster',env.clean
  );
 const response=await publish();
 assert.equal(response.count,2);
 const request=requests.at(-1);
 assert.equal(request.method,'POST');
 assert.ok(request.url.endsWith('?action=vr-publish-roster'));
 const body=JSON.parse(request.data);
 assert.deepEqual(body.people.map(p=>p.name),['Michael Baldree','Robert Brooks']);
 assert.equal(JSON.stringify(body).includes('signature'),false);
 assert.equal(JSON.stringify(body).includes('assetId'),false);
});
test('failed publication receipt cannot be mistaken for success',async()=>{
 nextReply={status:503,responseText:JSON.stringify({ok:false,error:'no receipt'})};
 const publish=new Function('loadJSON','normalizeMasterRoster','rebelCommandPaired',
  'rebelCommandPairing','masterRosterExportPayload','GM_xmlhttpRequest',
  'REBEL_COMMAND_ENDPOINT','MASTER_ROSTER_OVERRIDE_KEY','clean',
  pure('async function publishLocalMasterRoster()','function prefixesOverlap(aRaw, bRaw) {')+
  ';return publishLocalMasterRoster;')(
   loadJSON,normalized,()=>true,()=>({deviceId:'admin-1',token:'mock-token'}),
   people=>({people}),env.GM_xmlhttpRequest,env.REBEL_COMMAND_ENDPOINT,'localMaster',env.clean
  );
 await assert.rejects(publish(),/no receipt/);
});
test('automatic error reports remain queued until Rebel Command confirms receipt',async()=>{
 const key='vectorRebelPendingErrorReportsV1';
 delete stored[key];
 const deliveries=[];
 let serverAvailable=false;
 const setup=new Function('loadJSON','saveJSON','clean','telemetrySafeErrorMessage',
   'submitRebelCommandFeedback','VERSION',
   pure("const ERROR_FEEDBACK_THROTTLE_KEY=",'function looksLikeVectorRebelRuntime(')+
   ';return {reportRebelErrorToCommand,flushPendingErrorReports};')(
    loadJSON,saveJSON,env.clean,v=>String(v||'').replace(/\b\d{5,}\b/g,'[id]'),
    async (message,options)=>{deliveries.push({message,options});return serverAvailable},'3.2.45'
   );
 assert.equal(await setup.reportRebelErrorToCommand('Expected asset 123456','captainDaily','start'),false);
 assert.equal(stored[key].length,1);
 assert.match(stored[key][0].message,/\[id\]/);
 const id=stored[key][0].id;
 serverAvailable=true;
 assert.equal(await setup.flushPendingErrorReports(),true);
 assert.equal(stored[key].length,0);
 assert.equal(deliveries.at(-1).options.suggestionId,id);
 assert.equal(deliveries.at(-1).options.sourceContext,'automatic_error');
});
