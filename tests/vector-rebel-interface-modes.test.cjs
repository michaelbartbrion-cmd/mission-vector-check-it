'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../beta/vector-rebel.user.js'),'utf8');
function part(a,b){
 const i=source.indexOf(a),j=source.indexOf(b,i+a.length);
 assert.ok(i>=0&&j>i,'find source range '+a+' / '+b);
 return source.slice(i,j);
}
const modeCode=part('    function renderPanelInterface(){','    function installPanel() {');
const mockEl=()=>({children:[],style:{},dataset:{},textContent:'',innerHTML:'',
 setAttribute(k,v){this[k]=v;},appendChild(x){this.children.push(x);}});
function renderMock({master=false,owner=false}={}){
 const actions=mockEl(),label=mockEl(),switcher=mockEl(),calls=[];
 const panel={querySelector(x){
    if(x==='[data-vector-ppe-actions]')return actions;
    if(x==='[data-vector-ppe-interface-label]')return label;
    if(x==='[data-vector-ppe-interface-switch]')return switcher;
    return null;
 }};
 const doc={getElementById:(id)=>id==='vector-ppe-helper-v23'?panel:null,
    createElement:mockEl};
 const run=new Function('document','PANEL_ID','panelInterfaceMode',
  'isMasterOwnerInstallation','refreshMasterAlertBadge','refreshInterfaceNotice','calls',
  'const showPpeCleanRepairForm=()=>{},launchCaptainDailyCheckFromAnywhere=()=>calls.push(\'full\'),'+
  'getCaptainDailyReport=()=>null,showCaptainDailyReport=()=>calls.push(\'cached\'),'+
  'cPilotEligible=()=>true,showCShiftPilotBoard=(b,m)=>calls.push([\'quick\',b,m||\'bc\']),'+
  'showBcDepartmentCheck=()=>calls.push([\'department-bc\']),'+
  'showSharedMasterList=()=>{},showStation4ScbaAirpackCheck=()=>{},'+
  'showApparatusCheck=()=>{},showMasterErrorInbox=()=>{},'+
  'showProblemReport=()=>{},showSettings=()=>{},checkManagedInterfaceRelease=()=>{};\n'+
  modeCode+'\nreturn renderPanelInterface;')(
  doc,'vector-ppe-helper-v23',()=>master?'master':'user',()=>owner,()=>{},()=>{},calls);
 run();
 return {actions:actions.children.map(c=>c.textContent),buttons:actions.children,
  mode:label.textContent,switch: switcher,calls};
}
const USER=['Tour PPE','After Fire','PPE Form','Daily Captain Check','Settings'];
test('User Interface presents only the five requested actions',()=>{
 const v=renderMock({master:false,owner:false});
 assert.deepEqual(v.actions,USER);
 assert.equal(v.mode,'USER INTERFACE');
 assert.equal(v.switch.style.display,'none');
 for(const button of v.buttons)assert.equal(button.type,'button');
});
test('owner in User preview sees exact same five actions and a return toggle',()=>{
 const v=renderMock({master:false,owner:true});
 assert.deepEqual(v.actions,USER);
 assert.equal(v.switch.style.display,'block');
 assert.equal(v.switch.textContent,'Return to Master Interface');
});
test('Master Interface keeps user actions and exposes additional owner tools',()=>{
 const v=renderMock({master:true,owner:true});
 assert.deepEqual(v.actions,[
  ...USER,'Master List','SCBA Airpacks','Apparatus Check',
  'Manage Master List','BC Check','Errors & Alerts','Report Problem','Check for Update'
 ]);
 assert.equal(v.mode,'MASTER INTERFACE');
 assert.equal(v.switch.textContent,'Preview User Interface');
});
test('Master BC Check remains distinct from original Daily Captain Check',()=>{
 const master=renderMock({master:true,owner:true});
 const click=(v,label)=>v.buttons.find(x=>x.textContent===label).onclick();
 click(master,'BC Check');
 click(master,'Daily Captain Check');
 assert.deepEqual(master.calls,[['department-bc'],'full'],
  'Daily Captain Check must never open the unpopulated pilot instead of native history');
 const user=renderMock({master:false,owner:false});
 click(user,'Daily Captain Check');
 assert.deepEqual(user.calls,['full'],'other user workflow is not silently changed');
});
test('Master requires backend owner verification, not local pairing or autoEnrolled flag',async()=>{
 const logic=part('    let masterServerVerified=false;','    function showMasterPairing(){')+
   part('    function panelInterfaceMode(){','    function showSharedMasterList(){');
 const store=new Map([['vectorRebelInterfaceModeV1','master']]);
 let server={status:403,body:{ok:false}},calls=0,renderCount=0,paired=true;
 const api=new Function('rebelCommandPaired','rebelCommandPairing','clean',
   'persistentGetRaw','persistentSetRaw','renderPanelInterface',
   'PANEL_INTERFACE_KEY','REBEL_COMMAND_ENDPOINT','GM_xmlhttpRequest',
   'refreshMasterErrorInbox',logic+
   '\nreturn {mode:panelInterfaceMode,set:setPanelInterfaceMode,'+
   'verify:verifyMasterOwnerInstallation,owner:isMasterOwnerInstallation};')(
    ()=>paired,()=>({deviceId:'ID',token:'SECRET',autoEnrolled:true}),
    v=>String(v||'').trim(),key=>store.get(key),
    (key,value)=>store.set(key,value),()=>{renderCount++},
    'vectorRebelInterfaceModeV1','https://example.test/telemetry',
    request=>{calls++;request.onload({status:server.status,responseText:JSON.stringify(server.body)});},
    ()=>{}
 );
 assert.equal(api.mode(),'user');
 assert.equal(api.set('master'),false,'locally paired user cannot enable Master');
 assert.equal(await api.verify(true),false);
 assert.equal(api.mode(),'user','backend denies ordinary self-enrolled user');
 server={status:200,body:{ok:true,readOnly:true,alerts:[]}};
 assert.equal(await api.verify(true),true);
 assert.equal(api.mode(),'master','server linked owner can use Master, even after auto enrollment');
 assert.equal(api.set('user'),true);
 assert.equal(api.mode(),'user');
 assert.equal(api.set('master'),true);
 server={status:403,body:{ok:false}};
 assert.equal(await api.verify(true),false);
 assert.equal(api.mode(),'user','revoked backend pairing must revoke Master immediately');
 assert.equal(renderCount,4,'role transitions and explicit interface switches render changes');
 assert.equal(calls,3);
 paired=false;
 assert.equal(api.owner(),false);
});
test('Settings admin tab is hidden in User mode and available in Master mode',()=>{
 const settings=part('    function showSettings(initialTab','    function abortActiveRun() {');
 assert.match(settings,/isMasterOwnerInstallation\(\) && panelInterfaceMode\(\)==='master'/);
 assert.match(settings,/if\(initialTab==='admin'/);
 assert.match(settings,/tabs\.push\(\['admin', 'Admin'\]\)/);
});
test('Master List is read-only, roster refresh uses authenticated shared roster',()=>{
 const viewer=part('    function showSharedMasterList(){',
  '    function compareReleaseVersions(');
 assert.match(viewer,/sharedRosterFromCache\(\)/);
 assert.match(viewer,/refreshSharedRebelRoster\(true\)/);
 assert.match(viewer,/Read-only list published/);
 assert.match(viewer,/person\.name/);
 assert.doesNotMatch(viewer,/publishLocalMasterRoster\(|saveLocalMasterRoster\(/);
});
test('both interfaces schedule a local-midnight review and recover on tab resume',()=>{
 const init=part('    scheduleMidnightInterfaceReview();',
  '    const migrationNotice = loadJSON(MIGRATION_NOTICE_KEY, null);');
 assert.match(init,/runMidnightInterfaceReview\(\)/);
 assert.match(init,/visibilitychange/);
 const impl=part('    async function runMidnightInterfaceReview(){',
  '    let lastInterfaceErrorInboxPoll=0;');
 assert.match(impl,/setHours\(24,0,2,0\)/);
 assert.match(impl,/\['release',checkManagedInterfaceRelease\]/);
 assert.match(impl,/refreshSharedRebelRoster\(true\)/);
 assert.match(impl,/\['errors',flushPendingErrorReports\]/);
 assert.match(impl,/refreshMasterErrorInbox\(\{notify:true\}\)/);
});
test('master inbox remains owner-only, shows new server errors without mutating source',()=>{
 const inbox=part('    async function refreshMasterErrorInbox(',
  '    function localCalendarDate(){');
 assert.match(inbox,/if\(!isMasterOwnerInstallation\(\)/);
 assert.match(inbox,/action=vr-error-inbox/);
 assert.match(inbox,/Notification\.permission==='granted'/);
 assert.match(inbox,/Notification\.requestPermission\(\)/);
 assert.match(inbox,/errorInbox\.pending/);
 assert.doesNotMatch(inbox,/deleteSuggestion|updateSuggestion|bulkCreate\(/);
});
test('release check uses official managed URL; silent code hot swap not allowed',()=>{
 const chk=part('    async function checkManagedInterfaceRelease(){',
  '    async function refreshMasterErrorInbox(');
 assert.match(chk,/MANAGED_UPDATE_URL/);
 assert.match(chk,/availableRelease/);
 assert.match(chk,/openManagedUpdate/);
 assert.doesNotMatch(chk,/eval\(|new Function\(|document\.write\(|appendChild\(script\)/);
});

test('genuine helper failures are automatically queued, ordinary absence is not an error',()=>{
 const segment=part('    function isReportableVectorFailure(message){',
  '    function diagnosticPrivateNames(');
 const detector=new Function('telemetrySafeErrorMessage',
  segment+'\nreturn isReportableVectorFailure;')(
    s=>String(s||'').trim());
 assert.equal(detector('SCBA receipt verification stopped: missing form'),true);
 assert.equal(detector('Could not find expected asset id for PPE'),true);
 assert.equal(detector('Vector Rebel crashed unexpectedly'),true);
 assert.equal(detector('Person not assigned this tour'),false);
 assert.equal(detector('No active inspection run'),false);
 assert.equal(detector('Run aborted by inspector'),false);
 assert.match(segment,/void reportRebelErrorToCommand\(message,'ui_status','failure'\)/);
});
test('minimized owner panel surfaces received errors without overriding active runs',()=>{
 const section=part('    function updateMinimizedPanelBadge(',
  '    function refreshPanelInfo() {');
 const stop=section.indexOf("if (run?.phase === 'stopped')");
 const active=section.indexOf("if (run?.items?.length");
 const alert=section.indexOf('if(isMasterOwnerInstallation() && errorInbox.count>0)');
 assert.ok(stop>=0&&active>stop&&alert>active);
 assert.match(section,/new error reports/);
});

test('midnight checks run once per local date, and repeat on the next date only',async()=>{
 const fn=part('    async function runMidnightInterfaceReview(){',
    '    function scheduleMidnightInterfaceReview(){');
 const state=new Map(),calls={version:0,roster:0,flush:0,error:0,render:0};
 let day='2026-11-16';
 const f=new Function('localCalendarDate','loadJSON','saveJSON',
  'checkManagedInterfaceRelease','refreshSharedRebelRoster',
  'flushPendingErrorReports','isMasterOwnerInstallation',
  'refreshMasterErrorInbox','renderPanelInterface','VERSION',
  'availableRelease','releaseCheckError','MIDNIGHT_CHECK_KEY',
  'let midnightReviewRequest=null;'+fn+
  '\nreturn runMidnightInterfaceReview;')(
    ()=>day,(key,fallback)=>state.get(key)||fallback,(key,x)=>state.set(key,x),
    async()=>{calls.version++;return true;},async()=>{calls.roster++;return true;},
    async()=>{calls.flush++;return true;},()=>true,async()=>{calls.error++;return true;},
    ()=>{calls.render++},'3.2.76','','','vectorRebelMidnightReviewV1');
 assert.equal(await f(),true);
 assert.deepEqual(calls,{version:1,roster:1,flush:1,error:1,render:1});
 assert.equal(await f(),false);
 assert.deepEqual(calls,{version:1,roster:1,flush:1,error:1,render:1});
 day='2026-11-17';
 assert.equal(await f(),true);
 assert.deepEqual(calls,{version:2,roster:2,flush:2,error:2,render:2});
 assert.equal(state.get('vectorRebelMidnightReviewV1').date,'2026-11-17');
});
test('error inbox excludes user devices and delivers new admin alerts only once',async()=>{
 const snippet=part('    async function refreshMasterErrorInbox({notify=false}={}){',
  '    function refreshMasterAlertBadge(){');
 let owner=false,requestCount=0,last=null,noticeCount=0;
 const saved=new Map();
 class Notice{static permission='granted';constructor(){noticeCount++;}}
 const injected='let errorInbox={pending:[],count:0,error:\"\",checkedAt:\"\"};let errorInboxRequest=null;'+
    snippet+'\nreturn {load:refreshMasterErrorInbox,state:()=>errorInbox};';
 const api=new Function('isMasterOwnerInstallation','rebelCommandPairing',
  'REBEL_COMMAND_ENDPOINT','GM_xmlhttpRequest','loadJSON','saveJSON',
  'LAST_ALERT_SEEN_KEY','refreshMasterAlertBadge','Notification','clean',injected)(
    ()=>owner,()=>({token:'dummy',deviceId:'device-id'}),
    'https://example.test/telemetry',
    args=>{requestCount++;args.onload({status:200,responseText:JSON.stringify({
      ok:true,readOnly:true,count:1,alerts:[last]})});},
    (key,fallback)=>saved.get(key)??fallback,
    (key,value)=>saved.set(key,value),'seen',
    ()=>{},Notice,x=>String(x||'').trim()
  );
 assert.equal(await api.load({notify:true}),false);
 assert.equal(requestCount,0);
 owner=true;
 last={id:'error-1',title:'SCBA check error',description:'Test',source:'Vector Rebel',occurredAt:'2026-11-16T20:00:00Z'};
 assert.equal(await api.load({notify:true}),true);
 assert.equal(api.state().count,1);
 assert.equal(requestCount,1);
 assert.equal(noticeCount,0,'first poll must not flood owner with historical alerts');
 assert.equal(saved.get('seen').id,'error-1');
 last={...last,id:'error-2',occurredAt:'2026-11-16T20:02:00Z'};
 assert.equal(await api.load({notify:true}),true);
 assert.equal(noticeCount,1,'a new report after the first poll generates an opted-in browser alert');
 assert.equal(saved.get('seen').id,'error-2');
 last={...last,id:'error-1',occurredAt:'2026-11-16T20:00:00Z'};
 assert.equal(await api.load({notify:true}),true);
 assert.equal(noticeCount,1,'older unreviewed errors do not generate a new alert');
 assert.equal(saved.get('seen').id,'error-2','cursor must never move backwards');
});

test('master pairing cannot save credentials before verified admin-only endpoint',()=>{
 const pairing=part('    function showMasterPairing(){',
  '    function panelInterfaceMode(){');
 assert.match(pairing,/token\.type='password'/);
 assert.match(pairing,/action=vr-error-inbox/);
 assert.match(pairing,/body\.readOnly!==true/);
 assert.match(pairing,/!Array\.isArray\(body\.alerts\)/);
 assert.ok(pairing.indexOf('body.readOnly!==true')<
           pairing.indexOf('GM_setValue(REBEL_COMMAND_PAIR_KEY'));
 assert.match(pairing,/No credentials saved/);
 assert.match(pairing,/renderPanelInterface\(\)/);
 assert.match(source,/makeButton\('Connect Master Interface'\)/);
});
test('User preview hides cloud error badge; only Master displays alert summary',()=>{
 const badge=part('    function refreshMasterAlertBadge(){',
  '    function showMasterErrorInbox(){');
 assert.match(badge,/isMasterOwnerInstallation\(\)&&panelInterfaceMode\(\)==='master'/);
 assert.match(badge,/el\.style\.display=visible\?'block':'none'/);
});

test('partial midnight sync is retried the same calendar day after a transient failure',async()=>{
 const fn=part('    async function runMidnightInterfaceReview(){',
   '    function scheduleMidnightInterfaceReview(){');
 const records=new Map(),counts={release:0,roster:0,queue:0,render:0};
 let releaseOkay=false,rosterOkay=true;
 const run=new Function('localCalendarDate','loadJSON','saveJSON',
   'checkManagedInterfaceRelease','refreshSharedRebelRoster',
   'flushPendingErrorReports','isMasterOwnerInstallation',
   'refreshMasterErrorInbox','renderPanelInterface','VERSION',
   'availableRelease','releaseCheckError','MIDNIGHT_CHECK_KEY',
   'let midnightReviewRequest=null;'+fn+'\nreturn runMidnightInterfaceReview;')(
    ()=>'2026-11-16',
    (k,fallback)=>records.get(k)??fallback,(k,v)=>records.set(k,v),
    async()=>{counts.release++;return releaseOkay;},
    async()=>{counts.roster++;return rosterOkay;},
    async()=>{counts.queue++;return true;},
    ()=>false,async()=>{throw Error('must skip non-owner inbox');},
    ()=>{counts.render++;},'3.2.76','','','midnight-test');
 assert.equal(await run(),false,'failed update check is not complete');
 assert.equal(records.get('midnight-test').status,'partial');
 assert.deepEqual(records.get('midnight-test').failed,['release']);
 assert.deepEqual(counts,{release:1,roster:1,queue:1,render:1});
 releaseOkay=true;
 assert.equal(await run(),true,'second attempt on same day succeeds');
 assert.equal(records.get('midnight-test').status,'checked');
 assert.deepEqual(counts,{release:2,roster:2,queue:2,render:2});
 assert.equal(await run(),false,'successful day is not repeated');
 assert.deepEqual(counts,{release:2,roster:2,queue:2,render:2});
});
test('one rejected or thrown collector action does not prevent other midnight checks',async()=>{
 const fn=part('    async function runMidnightInterfaceReview(){',
   '    function scheduleMidnightInterfaceReview(){');
 const records=new Map(),calls=[];
 const run=new Function('localCalendarDate','loadJSON','saveJSON',
   'checkManagedInterfaceRelease','refreshSharedRebelRoster',
   'flushPendingErrorReports','isMasterOwnerInstallation',
   'refreshMasterErrorInbox','renderPanelInterface','VERSION',
   'availableRelease','releaseCheckError','MIDNIGHT_CHECK_KEY',
   'let midnightReviewRequest=null;'+fn+'\nreturn runMidnightInterfaceReview;')(
   ()=>'2026-11-16',
   (k,v)=>records.get(k)??v,(k,v)=>records.set(k,v),
   async()=>{calls.push('release');return true;},
   async()=>{calls.push('roster');throw Error('Server unavailable');},
   async()=>{calls.push('pending errors');return true;},
   ()=>true,async()=>{calls.push('inbox');return true;},
   ()=>{calls.push('render');},'3.2.76','','','nightly-isolation'
 );
 assert.equal(await run(),false);
 assert.deepEqual(calls.sort(),['inbox','pending errors','release','render','roster'].sort());
 assert.deepEqual(records.get('nightly-isolation').failed,['roster']);
});

test('only owner master can acknowledge error report and requires exact verified receipt',async()=>{
 const fn=part('    async function markMasterErrorReviewed(',
   '    function refreshMasterAlertBadge(){');
 let owner=false,master=true,requests=0,server={ok:true,suggestionId:'feedback:vr-error:123',status:'reviewing'};
 const action=new Function('isMasterOwnerInstallation','panelInterfaceMode',
   'clean','rebelCommandPairing','REBEL_COMMAND_ENDPOINT','GM_xmlhttpRequest',
   fn+'\nreturn markMasterErrorReviewed;')(
    ()=>owner,()=>master?'master':'user',
    v=>String(v||'').trim(),
    ()=>({token:'test-token',deviceId:'test-id'}),'https://example.test',
    request=>{
      requests++;
      assert.equal(request.method,'POST');
      assert.match(request.url,/action=vr-review-error/);
      assert.equal(JSON.parse(request.data).suggestionId,'feedback:vr-error:123');
      request.onload({status:200,responseText:JSON.stringify(server)});
    }
 );
 const id='feedback:vr-error:123';
 assert.equal(await action(id),false);
 assert.equal(requests,0,'user cannot acknowledge');
 owner=true;master=false;
 assert.equal(await action(id),false);
 assert.equal(requests,0,'owner User-preview cannot acknowledge');
 master=true;
 assert.equal(await action(id),true);
 assert.equal(requests,1);
 server={...server,suggestionId:'another'};
 assert.equal(await action(id),false,'mismatched receipt is not accepted');
 server={ok:true,suggestionId:id,status:'new'};
 assert.equal(await action(id),false,'unacknowledged status is not accepted');
 assert.equal(await action('invalid ID!'),false,'malformed ID cannot be submitted');
 assert.equal(requests,3);
});
test('Master error row has explicit Mark Reviewed; no automatic dismissal',()=>{
 const view=part('    function showMasterErrorInbox(){',
  '    function localCalendarDate(){');
 assert.match(view,/makeButton\('Mark Reviewed'\)/);
 assert.match(view,/markMasterErrorReviewed\(alert\.id\)/);
 assert.match(view,/await refreshMasterErrorInbox\(\)/);
 assert.match(view,/Could not confirm reviewed/);
 assert.doesNotMatch(view,/deleteSuggestion|autoReviewOnLoad/);
});
