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
 const actions=mockEl(),label=mockEl(),switcher=mockEl();
 const panel={querySelector(x){
    if(x==='[data-vector-ppe-actions]')return actions;
    if(x==='[data-vector-ppe-interface-label]')return label;
    if(x==='[data-vector-ppe-interface-switch]')return switcher;
    return null;
 }};
 const doc={getElementById:(id)=>id==='vector-ppe-helper-v23'?panel:null,
    createElement:mockEl};
 const run=new Function('document','PANEL_ID','panelInterfaceMode',
  'isMasterOwnerInstallation','refreshMasterAlertBadge','refreshInterfaceNotice',
  'const showPpeCleanRepairForm=()=>{},launchCaptainDailyCheckFromAnywhere=()=>{},'+
  'showSharedMasterList=()=>{},showStation4ScbaAirpackCheck=()=>{},'+
  'showApparatusCheck=()=>{},showMasterErrorInbox=()=>{},'+
  'showProblemReport=()=>{},showSettings=()=>{},checkManagedInterfaceRelease=()=>{};\n'+
  modeCode+'\nreturn renderPanelInterface;')(
  doc,'vector-ppe-helper-v23',()=>master?'master':'user',()=>owner,()=>{},()=>{});
 run();
 return {actions:actions.children.map(c=>c.textContent),buttons:actions.children,
  mode:label.textContent,switch: switcher};
}
const USER=['Tour PPE','After Fire','PPE Form','Daily Captain Check','Settings','Master List'];
test('User Interface presents only the six exact requested actions',()=>{
 const v=renderMock({master:false,owner:false});
 assert.deepEqual(v.actions,USER);
 assert.equal(v.mode,'USER INTERFACE');
 assert.equal(v.switch.style.display,'none');
 for(const button of v.buttons)assert.equal(button.type,'button');
});
test('owner in User preview sees exact same six actions and a return toggle',()=>{
 const v=renderMock({master:false,owner:true});
 assert.deepEqual(v.actions,USER);
 assert.equal(v.switch.style.display,'block');
 assert.equal(v.switch.textContent,'Return to Master Interface');
});
test('Master Interface keeps user actions and exposes additional owner tools',()=>{
 const v=renderMock({master:true,owner:true});
 assert.deepEqual(v.actions,[
  ...USER,'SCBA Airpacks','Apparatus Check',
  'Manage Master List','Errors & Alerts','Report Problem','Check for Update'
 ]);
 assert.equal(v.mode,'MASTER INTERFACE');
 assert.equal(v.switch.textContent,'Preview User Interface');
});
test('non-owner is always forced to User mode regardless of locally stored master flag',()=>{
 const logic=part('    function isMasterOwnerInstallation(){','    function showSharedMasterList(){');
 const store=new Map([['vectorRebelInterfaceModeV1','master']]);
 const evaluate=(raw)=>{
  const f=new Function('GM_getValue','REBEL_COMMAND_PAIR_KEY','clean',
   'persistentGetRaw','persistentSetRaw','renderPanelInterface',
   'PANEL_INTERFACE_KEY',logic+'\nreturn {mode:panelInterfaceMode,set:setPanelInterfaceMode};')(
    ()=>raw,'pairing',x=>String(x||'').trim(),k=>store.get(k),
    (k,v)=>store.set(k,v),()=>{},'vectorRebelInterfaceModeV1');
  return f;
 };
 const basic=evaluate({});
 assert.equal(basic.mode(),'user');assert.equal(basic.set('master'),false);
 const self=evaluate({deviceId:'A',token:'B',autoEnrolled:true});
 assert.equal(self.mode(),'user');assert.equal(self.set('master'),false);
 const admin=evaluate({deviceId:'A',token:'B',autoEnrolled:false});
 assert.equal(admin.mode(),'master');
 assert.equal(admin.set('user'),true);
 assert.equal(admin.mode(),'user');
 assert.equal(admin.set('master'),true);
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
 assert.match(impl,/checkManagedInterfaceRelease\(\)/);
 assert.match(impl,/refreshSharedRebelRoster\(true\)/);
 assert.match(impl,/flushPendingErrorReports\(\)/);
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
  'availableRelease','releaseCheckError','MIDNIGHT_CHECK_KEY',fn+
  '\nreturn runMidnightInterfaceReview;')(
    ()=>day,(key,fallback)=>state.get(key)||fallback,(key,x)=>state.set(key,x),
    async()=>{calls.version++},async()=>{calls.roster++},
    async()=>{calls.flush++},()=>true,async()=>{calls.error++},
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
      ok:true,count:1,alerts:[last]})});},
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
 last={...last,id:'error-2'};
 assert.equal(await api.load({notify:true}),true);
 assert.equal(noticeCount,1,'a new report after the first poll generates an opted-in browser alert');
 assert.equal(saved.get('seen').id,'error-2');
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
