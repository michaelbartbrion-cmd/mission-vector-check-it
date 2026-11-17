'use strict';
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawnSync}=require('node:child_process'),assert=require('node:assert/strict');
const src=fs.readFileSync(path.join(__dirname,'../beta/vector-rebel.user.js'),'utf8');
function part(a,b){
 const i=src.indexOf(a),j=src.indexOf(b,i+a.length);
 assert.ok(i>=0&&j>i,'missing source '+a);return src.slice(i,j);
}
const extracted=[
 part('    let masterServerVerified=false;','    function showMasterPairing(){'),
 part('    function panelInterfaceMode(){','    function showSharedMasterList(){'),
 part('    function showSharedMasterList(){','    function compareReleaseVersions('),
 part('    function showMasterErrorInbox(){','    function localCalendarDate(){'),
 part('    function renderPanelInterface(){','    function installPanel() {'),
 part('    function installPanel() {','    function dismissObsoleteRecoveryToast() {'),
 part('    function applyPanelMinimizedState(','    function updateMinimizedPanelBadge('),
 part('    function updateMinimizedPanelBadge(','    function refreshPanelInfo() {'),
 part('    function isReportableVectorFailure(message){','    function diagnosticPrivateNames(')
].join('\n');
const chrome=[process.env.CHROME_PATH,'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe']
 .filter(Boolean).find(p=>fs.existsSync(p));
if(!chrome){console.log('SKIP: Chrome or Edge unavailable');process.exit(0);}
const js=String.raw`
(function(){
 const PANEL_ID='vector-ppe-helper-v23',PANEL_MINIMIZED_KEY='vectorPpePanelMinimized_v1';
 const PANEL_INTERFACE_KEY='vectorRebelInterfaceModeV1',REBEL_COMMAND_PAIR_KEY='vectorRebelPairingV1';
 const VERSION='3.2.79',store=new Map();
 let owner=true;
 const rebelCommandPaired=()=>owner;
 const GM_getValue=(key,fallback)=>key===REBEL_COMMAND_PAIR_KEY?
   {deviceId:'test-device',token:'test-token',autoEnrolled:!owner}:fallback;
 const persistentGetRaw=key=>store.get(key);
 const persistentSetRaw=(key,val)=>store.set(key,val);
 const clean=x=>String(x||'').trim();
 const rebelStarbirdSvg=()=>'<svg viewBox="0 0 10 10" aria-hidden="true"></svg>';
 const refreshPanelInfo=()=>{},refreshMasterAlertBadge=()=>{},refreshInterfaceNotice=()=>{};
 const getRun=()=>null;
 const noop=()=>{},showPpeCleanRepairForm=noop,showStation4ScbaAirpackCheck=noop;
 const launchMyInspectionFromAnywhere=noop,launchCaptainDailyCheckFromAnywhere=noop;
 const showApparatusCheck=noop,showProblemReport=noop;
 const showCShiftPilotBoard=noop,cPilotEligible=()=>false,
   cPilotRefreshSummary=async()=>{},cPilotFlushReceipts=async()=>{},
   cPilotScheduleBoardPoll=()=>{};
 const showSettings=noop,checkManagedInterfaceRelease=noop;
 const openManagedUpdate=noop;
 const telemetrySafeErrorMessage=x=>String(x||'');
 const reportRebelErrorToCommand=noop;
 const makeButton=text=>{const b=document.createElement('button');b.textContent=text;return b;};
 const makeOverlayBox=()=>{const overlay=document.createElement('section');
    overlay.setAttribute('data-test-overlay','true');const box=document.createElement('div');
    overlay.appendChild(box);document.body.appendChild(overlay);return {overlay,box};};
 const sharedRosterFromCache=()=>({version:'2026-11-03',updatedAt:'2026-11-03',people:[
    {name:'Michael Baldree',active:true},{name:'John Brooks',active:true}]});
 const sharedRosterSyncState=()=>({status:'synced',lastSuccess:'2026-11-16'});
 const refreshSharedRebelRoster=async()=>true;
 let errorInbox={count:1,error:'',checkedAt:'2026-11-16',pending:[
    {id:'feedback:vr-error:123',title:'SCBA check error',description:'Form failed in test fixture',
     source:'Vector Rebel',deviceName:'Baldree test device',sourceVersion:'3.2.53',
     priority:'high',occurredAt:'2026-11-16T21:00:00Z'}]};
 const refreshMasterErrorInbox=async()=>true;
 /*INSERT_FUNCTIONS*/
 const actions=()=>Array.from(document.querySelectorAll(
     '[data-vector-ppe-actions] button')).map(x=>x.textContent);
 const assertLabels=(got,want,msg)=>{
   if(got.join('|')!==want.join('|'))throw Error(msg+': '+got.join('|'));
 };
 const user=['Tour PPE','After Fire','PPE Form','Daily Captain Check','Settings'];
 const extra=['Master List','SCBA Airpacks','Apparatus Check','Manage Master List',
              'Shift Gear Check (C pilot)','Errors & Alerts','Report Problem','Check for Update'];
 const result={};
 try{
   // Owner role is granted by the server-only authenticated probe; never
   // inferred from an editable local pair token during the test.
   masterServerVerified=true;
   installPanel();applyPanelMinimizedState(false,false);
   updateMinimizedPanelBadge();
   const miniBadge=document.getElementById('vector-ppe-mini-badge-v1');
   if(!miniBadge||miniBadge.textContent!=='1'||miniBadge.style.display!=='flex')
      throw Error('Master error count not visible in minimized badge');
   result.numericAlertBadge=true;
   setStatus('SCBA handoff stopped: unexpected form',false);
   updateMinimizedPanelBadge();
   if(miniBadge.textContent!=='!')throw Error('Local failure badge not visible');
   setStatus('Recovered',true);
   if(miniBadge.textContent!=='1')throw Error('New-error count did not return after recovery');
   result.localFailureBadge=true;
   assertLabels(actions(),user.concat(extra),'Master initial layout');
   result.initial=document.querySelector('[data-vector-ppe-interface-label]').textContent;
   const switcher=document.querySelector('[data-vector-ppe-interface-switch]');
   switcher.click();assertLabels(actions(),user,'Owner User preview');
   updateMinimizedPanelBadge();
   if(miniBadge.style.display!=='none')throw Error('Master error badge shown in User preview');
   result.preview=document.querySelector('[data-vector-ppe-interface-label]').textContent;
   switcher.click();assertLabels(actions(),user.concat(extra),'Return to Master');
   updateMinimizedPanelBadge();
   if(miniBadge.textContent!=='1')throw Error('Master alert badge did not restore');
   const button=label=>Array.from(document.querySelectorAll(
       '[data-vector-ppe-actions] button')).find(x=>x.textContent===label);
   button('Master List').click();
   let overlay=document.querySelector('[data-test-overlay]');
   if(!overlay||!overlay.textContent.includes('Michael Baldree')||
      !overlay.textContent.includes('John Brooks'))throw Error('Master List did not render');
   const search=overlay.querySelector('input[type=search]');
   search.value='Baldree';search.dispatchEvent(new Event('input',{bubbles:true}));
   if(!overlay.textContent.includes('Michael Baldree')||
      overlay.textContent.includes('John Brooks'))throw Error('Master List search failed');
   result.rosterViewer=true;overlay.remove();
   button('Errors & Alerts').click();
   overlay=document.querySelector('[data-test-overlay]');
   if(!overlay||!overlay.textContent.includes('SCBA check error')||
      !overlay.textContent.includes('Baldree test device')||
      !overlay.textContent.includes('3.2.53')||
      !Array.from(overlay.querySelectorAll('button')).some(x=>x.textContent==='Mark Reviewed'))
      throw Error('Master error inbox missing device identity or review control');
   result.errorInboxViewer=true;overlay.remove();
   owner=false;masterServerVerified=false;
   renderPanelInterface();assertLabels(actions(),user,'Non-admin user');
   if(switcher.style.display!=='none')throw Error('Non-admin can see Master toggle');
   result.nonAdminSwitchHidden=true;result.panelCount=document.querySelectorAll('#'+PANEL_ID).length;
   if(result.panelCount!==1)throw Error('Duplicate panel');
   result.pass=true;
 }catch(error){result.pass=false;result.error=String(error.stack||error);}
 document.body.setAttribute('data-ui-smoke',result.pass?'PASS':'FAIL');
 const pre=document.createElement('pre');pre.id='smoke-results';
 pre.textContent=JSON.stringify(result);document.body.appendChild(pre);
})();
`.replace('/*INSERT_FUNCTIONS*/',extracted);
const html='<!doctype html><html><head><meta charset="utf-8"></head><body><script>'+
  js.replace(/<\/script/gi,'<\\/script')+'</script></body></html>';
const folder=fs.mkdtempSync(path.join(os.tmpdir(),'vector-rebel-dom-'));
const htmlPath=path.join(folder,'interface-test.html');
fs.writeFileSync(htmlPath,html,'utf8');
try {
 const run=spawnSync(chrome,['--headless=new','--no-first-run','--disable-gpu',
   '--disable-extensions','--disable-background-networking',
   '--user-data-dir='+path.join(folder,'profile'),
   '--dump-dom','file:///'+htmlPath.replace(/\\/g,'/')],{
   encoding:'utf8',timeout:30000,maxBuffer:6*1024*1024,windowsHide:true});
 if(run.error)throw run.error;
 if(run.status!==0)throw Error('Chrome exited '+run.status+' '+String(run.stderr).slice(-600));
 const pass=run.stdout.match(/data-ui-smoke="([^"]+)"/)?.[1]||'UNKNOWN';
 const detail=run.stdout.match(/<pre id="smoke-results">([^<]+)<\/pre>/)?.[1]||'no details';
 console.log('REAL_BROWSER_UI_SMOKE='+pass);
 console.log(detail.replaceAll('&quot;','"').replaceAll('&amp;','&'));
 assert.equal(pass,'PASS');
}finally{try{fs.rmSync(folder,{recursive:true,force:true});}catch{}}
