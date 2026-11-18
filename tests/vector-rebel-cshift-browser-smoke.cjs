
'use strict';
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawnSync}=require('node:child_process'),assert=require('node:assert/strict');
const src=fs.readFileSync(path.join(__dirname,'../beta/vector-rebel.user.js'),'utf8');
const a=src.indexOf('    // C-shift PPE pilot: read-only shared board.');
const b=src.indexOf('    let lastInterfaceErrorInboxPoll=0;',a);
assert.ok(a>0&&b>a,'C-shift pilot code present');
const feature=src.slice(a,b);
const chrome=[process.env.CHROME_PATH,'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe']
.filter(Boolean).find(fs.existsSync);
if(!chrome){console.log('C_SHIFT_BROWSER_SMOKE=SKIP');process.exit(0)}
const names=['Michael Baldree','Michael Brion','Jerry Weems','Jared Weston',
'Robert Brooks','Matthew Cashman','Morgan Bowland'];
const fixture={ok:true,readOnly:true,scope:'c-shift-ppe-pilot',
 shift:'C',tourStart:'2026-11-21',tourEnd:'2026-11-22',activeTour:true,
 latestCompletedTourStart:'2026-11-15',historicalTour:false,historicalEligible:false,
 totals:{crew:7,knownItems:3,verifiedItems:1,outstandingItems:2},
 outstandingOnDuty:2,workingCrew:1,offCrew:1,unconfirmedCrew:5,
 cadenceMinutes:2,lastUpdateAt:'2026-11-21T14:00:00Z',
 lastPpeVerificationAt:'2026-11-21T14:00:00Z',
 lastStaffingUpdateAt:'2026-11-21T14:01:00Z',
 people:names.map((name,i)=>({name,prefix:'PERSON-'+i,
  attendance:i===0?'working':i===1?'off':'unconfirmed',
  dutyDay1:i===0?'working':i===1?'off':'unconfirmed',
  dutyDay2:i===0?'working':i===1?'off':'unconfirmed',
  knownItems:i===0?3:0,verifiedItems:i===0?1:0,
  outstandingItems:i===0?2:0,nextItem:i===0?'A-001':''}))};
const js=`
(function(){
const FIXTURE=__DATA__,requests=[],STORE=new Map(),SESSION=new Map();
const sessionStorage={getItem:k=>SESSION.has(k)?SESSION.get(k):null,
 setItem:(k,v)=>SESSION.set(k,String(v)),removeItem:k=>SESSION.delete(k)};
let cVisible=true;const TAB_ID='smoke-cshift-tab',getRun=()=>null,
 getCaptainDailyCheck=()=>null,panelInterfaceMode=()=> 'master',
 localTodayKey=()=> '2026-11-21',
 ensurePpeEquipmentPage=async()=>true,
 scanPpeCrewOwners=async()=>({items:[{ownerName:'Michael Baldree',assetId:'A-001',type:'Coat',pool:'PPE',itemId:'A1',url:'https://vector.example/gear/A-001'}]}),
 masterNameKey=x=>String(x||'').toLowerCase(),
 inferRegularTourWindow=()=>({isActiveTour:true,startDate:'2026-11-21'}),
 saveCaptainDailyCheck=check=>{window.__nativePilotCheck=check;},
 navigateCaptainDailyToItem=(check,item)=>{window.__nativePilotTarget=item;},
 setStatus=x=>{window.__nativeStatus=x;},saveDiagnostic=()=>{},
 isMasterOwnerInstallation=()=>true;let captainDailyBusy=false;
const cShiftMasterOwner=()=>true,
 getConfig=()=>({inspectorName:'Michael Brion'}),
 clean=x=>String(x||'').trim(),
 loadJSON=(key,fallback)=>STORE.has(key)?STORE.get(key):fallback,
 saveJSON=(key,value)=>STORE.set(key,structuredClone(value)),
 getActiveMasterRoster=()=>FIXTURE.people.map(p=>({name:p.name,prefix:p.prefix,active:true})),
 rebelCommandPaired=()=>true,ensureRebelCommandEnrollment=async()=>true,
 rebelCommandPairing=()=>({token:'TEST',deviceId:'DEVICE'}),
 REBEL_COMMAND_ENDPOINT='https://example.test/bridge',
 GM_xmlhttpRequest=request=>{
    const payload=JSON.parse(request.data||'{}');
    requests.push({url:request.url,data:payload});
    const data=request.url.includes('vr-ppe-pilot-duty')?
      {ok:true,scope:'c-shift-ppe-pilot-duty',changed:14}:
      request.url.includes('vr-ppe-pilot-inventory')?
      {ok:true,scope:'c-shift-ppe-pilot-inventory',readOnly:true,personName:payload.personName,knownItems:payload.items?.length}:
      request.url.includes('vr-ppe-pilot-recheck')?
      {ok:true,scope:'c-shift-ppe-pilot-recheck',assetId:payload.assetId,verified:false}:
      request.url.includes('tourStart=2026-11-15')?
      {...FIXTURE,tourStart:'2026-11-15',tourEnd:'2026-11-16',activeTour:false,
       historicalTour:true,historicalEligible:true,latestCompletedTourStart:'2026-11-15'}:
      FIXTURE;
    Promise.resolve().then(()=>request.onload({status:200,responseText:JSON.stringify(data)}));
 },
 makeButton=(label)=>{const b=document.createElement('button');b.textContent=label;return b;},
 makeOverlayBox=()=>{
  const overlay=document.createElement('section');overlay.className='pilot-overlay';
  const box=document.createElement('div');overlay.appendChild(box);
  document.body.appendChild(overlay);return {overlay,box};
 },
 confirm=()=>true;
 const summary=document.createElement('div');
 summary.setAttribute('data-vector-ppe-cshift-summary','1');
 document.body.appendChild(summary);
 __FEATURE__
 showCShiftPilotBoard(false);
 showCShiftPilotBoard(true);
 setTimeout(async()=>{
 try{
  const overlays=[...document.querySelectorAll('.pilot-overlay')];
  if(overlays.length!==2)throw Error('Expected two interfaces');
  if(!overlays[0].textContent.includes('My C Shift'))throw Error('User crew heading missing');
  if(!overlays[1].textContent.includes('Battalion Shift Gear Check'))throw Error('Master heading missing');
  for(const overlay of overlays){
    if(overlay.querySelectorAll('table tr').length<8)throw Error('Seven crew not listed');
    for(const name of __NAMES__)if(!overlay.textContent.includes(name))
      throw Error('Crew member missing '+name);
    if(!overlay.textContent.includes('Working confirmed: 1'))
      throw Error('Working confirmation total missing');
  }
  const user=overlays[0],master=overlays[1];
  if(user.querySelectorAll('[data-cshift-duty-editor] select').length)throw Error('Ordinary user can edit duty');
  if(master.querySelectorAll('[data-cshift-duty-editor] select').length!==14)throw Error('Master lacks two day controls');
  const b=[...master.querySelectorAll('button')].find(x=>x.textContent.includes('Confirm C Shift Duty'));
  if(!b)throw Error('Captain confirmation action missing');
  b.click();
  await new Promise(r=>setTimeout(r,80));
  const posted=requests.find(x=>x.url.includes('vr-ppe-pilot-duty'));
  if(!posted||posted.data.people.length!==7||posted.data.tourStart!=='2026-11-21')
    throw Error('Master duty submission was not sent');
  if(!summary.textContent.includes('native Item Log receipts'))
    throw Error('Shared summary not updated');
  const map=[...master.querySelectorAll('button')].find(x=>x.textContent.includes('Map Working Crew PPE'));
  if(!map)throw Error('Master PPE discovery not available');
  map.click();
  await new Promise(r=>setTimeout(r,100));
  const mapped=requests.find(x=>x.url.includes('vr-ppe-pilot-inventory'));
  if(!mapped||mapped.data.personName!=='Michael Baldree'||
      mapped.data.items.length!==1)throw Error('Scoped PPE map not delivered: '+String(window.__nativeStatus)+'; requests='+requests.map(x=>x.url).join(','));
  const monitor=[...master.querySelectorAll('button')].find(x=>x.textContent.includes('Monitor C Shift in This Tab'));
  if(!monitor)throw Error('Dedicated-tab monitoring button not found');
  monitor.click();
  await new Promise(r=>setTimeout(r,100));
  if(!window.__nativePilotCheck?.pilotRecheck||
      window.__nativePilotCheck.items.length!==1||
      window.__nativePilotCheck.items[0].assetId!=='A-001')
    throw Error('Dedicated monitoring did not prepare one working item for read-only native check');
  const session=JSON.parse(SESSION.get('vectorRebelCShiftDedicatedRecheckerV1')||'null');
  if(!session?.enabled||session.tourStart!=='2026-11-21')
    throw Error('Dedicated monitor not bound to one C-shift tour');
  monitor.click(); // Stop live monitor before switching to the completed tour.
  const picker=master.querySelector('select[aria-label="Select C shift tour"]');
  if(!picker||![...picker.options].some(x=>x.value==='2026-11-15'))
    throw Error('Last completed C tour November 15-16 is missing');
  picker.value='2026-11-15';
  picker.dispatchEvent(new Event('change',{bubbles:true}));
  await new Promise(r=>setTimeout(r,120));
  if(!master.textContent.includes('Historical test:')||
     !master.textContent.includes('2026-11-15 to 2026-11-16'))
    throw Error('Historical November 15-16 board did not load');
  if(master.querySelectorAll('[data-cshift-duty-editor] select').length!==14)
    throw Error('Historical duty review was not enabled');
  const before=requests.filter(x=>x.url.includes('vr-ppe-pilot-inventory')).length;
  map.click();
  await new Promise(r=>setTimeout(r,120));
  const pastPosts=requests.filter(x=>x.url.includes('vr-ppe-pilot-inventory'));
  if(pastPosts.length!==before+1||pastPosts.at(-1).data.tourStart!=='2026-11-15')
    throw Error('Historical scoped inventory did not target Nov 15-16');
  const single=[...master.querySelectorAll('button')].find(x=>x.textContent.includes('Read 1 Outstanding Item'));
  single.click();
  await new Promise(r=>setTimeout(r,100));
  if(window.__nativePilotCheck?.tourStart!=='2026-11-15')
    throw Error('Historical read-only one-item recheck did not target Nov 15-16');
  document.body.dataset.cshiftSmoke='PASS';
 }catch(error){document.body.dataset.cshiftSmoke='FAIL';document.body.dataset.reason=error.message;}
 },60);
})();
`.replace('__FEATURE__',feature)
 .replace('__DATA__',JSON.stringify(fixture))
 .replace('__NAMES__',JSON.stringify(names));
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cshift-pilot-smoke-'));
try{
 const htmlPath=path.join(dir,'pilot.html');
 fs.writeFileSync(htmlPath,'<!doctype html><html><body><script>'+js+'</script></body></html>','utf8');
 const run=spawnSync(chrome,['--headless=new','--no-first-run','--disable-gpu',
  '--disable-extensions','--disable-background-networking',
  '--virtual-time-budget=1500','--user-data-dir='+path.join(dir,'chrome'),
  '--dump-dom','file:///'+htmlPath.replace(/\\/g,'/')],{
   encoding:'utf8',timeout:30000,windowsHide:true,maxBuffer:9*1024*1024});
 if(run.error)throw run.error;
 const status=run.stdout.match(/data-cshift-smoke="([^"]+)"/)?.[1]||'UNKNOWN';
 const reason=run.stdout.match(/data-reason="([^"]+)"/)?.[1]||'';
 console.log('C_SHIFT_BROWSER_SMOKE='+status+(reason?' REASON='+reason:''));
 assert.equal(status,'PASS',String(run.stderr).slice(-400)+reason);
}finally{fs.rmSync(dir,{recursive:true,force:true})}
