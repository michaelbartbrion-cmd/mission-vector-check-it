
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
 totals:{crew:7,knownItems:4,verifiedItems:1,outstandingItems:3},
 outstandingOnDuty:3,workingCrew:1,offCrew:1,unconfirmedCrew:5,
 cadenceMinutes:2,lastUpdateAt:'2026-11-21T14:00:00Z',
 lastPpeVerificationAt:'2026-11-21T14:00:00Z',
 lastStaffingUpdateAt:'2026-11-21T14:01:00Z',
 people:names.map((name,i)=>({name,prefix:'PERSON-'+i,
  attendance:i===0?'working':i===1?'off':'unconfirmed',
  dutyDay1:i===0?'working':i===1?'off':'unconfirmed',
  dutyDay2:i===0?'working':i===1?'off':'unconfirmed',
  knownItems:i===0?4:0,verifiedItems:i===0?1:0,
  outstandingItems:i===0?3:0,nextItem:i===0?'A-001':'',
  gear:i===0?[
   {assetId:'A-001',assetType:'Bunker Coat',status:'verified',
    nativeCompletionDate:'2026-11-21',lastVerifiedAt:'2026-11-21T14:00:00Z'},
   {assetId:'B-002',assetType:'Bunker Pant',status:'not_yet_verified',
    lastReadResult:'read_ok',lastReadAt:'2026-11-21T14:00:00Z'},
   {assetId:'C-003',assetType:'Structural Helmet',status:'not_yet_verified',
    lastReadResult:'unreadable',lastAttemptAt:'2026-11-21T14:01:00Z'},
   {assetId:'EXTRA-01',assetType:'Wildland Helmet',status:'not_yet_verified'}
  ]:i===1?[{assetId:'OFF-04',assetType:'Structural Boot',status:'not_yet_verified'}]:[]}))};
const js=`
(function(){
const FIXTURE=__DATA__,requests=[],STORE=new Map(),SESSION=new Map();
const location={origin:'https://app.vectorcheckit.us',href:'https://app.vectorcheckit.us/main/asset-manager'};
window.__scanCount=0;
let HIST_DUTY=null;
const sessionStorage={getItem:k=>SESSION.has(k)?SESSION.get(k):null,
 setItem:(k,v)=>SESSION.set(k,String(v)),removeItem:k=>SESSION.delete(k)};
let cVisible=true;const TAB_ID='smoke-cshift-tab',getRun=()=>null,
 getCaptainDailyCheck=()=>null,
 getCaptainDailyReport=()=>({schemaVersion:8,generatedAt:'2026-11-18T15:00:00Z'}),
 showCaptainDailyReport=report=>{window.__historyOpened=report.generatedAt;},
 panelInterfaceMode=()=> 'master',
 localTodayKey=()=> '2026-11-21',
 ensurePpeEquipmentPage=async()=>true,
 scanPpeCrewOwners=async()=>{window.__scanCount++;
  return{items:[{ownerName:'Michael Baldree',assetId:'A-001',type:'Coat',
   pool:'300045',itemId:'4605913',
   url:'https://app.vectorcheckit.us/app/equipment/PPE/pool/300045/4605913/item?source=assetManager&sourceTab=PPE'}]};},
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
    if(request.url.includes('vr-ppe-pilot-inventory')){
      const item=(payload.items||[]).find(x=>x.assetId==='A-001');
      if(item?.assetPath)FIXTURE.people[0].nextItemPath=item.assetPath;
    }
    if(request.url.includes('vr-ppe-pilot-duty')&&payload.tourStart==='2026-11-15')
      HIST_DUTY=payload.people;
    const data=request.url.includes('vr-captain-attendance')?
      {ok:true,scope:'captain-attendance-evidence',readOnly:true,
       records:(new URL(request.url).searchParams.get('dates')||'').split(',').flatMap(date=>
        __NAMES__.map(name=>({
          date,name,status:/Weston|Brooks/.test(name)?'full_leave_evidence':'work_evidence',
          sourceQuality:'good_direct_capture',
          capturedAt:'2026-11-15T22:41:00Z',
          reason:/Weston|Brooks/.test(name)?'Full-day leave coverage':'Assigned to a unit'
        })))}:
      request.url.includes('vr-ppe-pilot-duty')?
      {ok:true,scope:'c-shift-ppe-pilot-duty',changed:14,crew:7}:
      request.url.includes('vr-ppe-pilot-inventory')?
      {ok:true,scope:'c-shift-ppe-pilot-inventory',readOnly:true,personName:payload.personName,knownItems:payload.items?.length}:
      request.url.includes('vr-ppe-pilot-recheck')?
      {ok:true,scope:'c-shift-ppe-pilot-recheck',assetId:payload.assetId,verified:false}:
      request.url.includes('tourStart=2026-11-15')?
      {...FIXTURE,tourStart:'2026-11-15',tourEnd:'2026-11-16',activeTour:false,
       historicalTour:true,historicalEligible:true,latestCompletedTourStart:'2026-11-15',
       workingCrew:HIST_DUTY?5:0,offCrew:HIST_DUTY?2:0,unconfirmedCrew:HIST_DUTY?0:7,
       people:FIXTURE.people.map(row=>{
         const assigned=HIST_DUTY?.find(x=>x.prefix===row.prefix);
         const first=assigned?.day1||'unconfirmed',second=assigned?.day2||'unconfirmed';
         return {...row,dutyDay1:first,dutyDay2:second,
           attendance:first==='working'||second==='working'?'working':
             first==='off'&&second==='off'?'off':'unconfirmed',
           nextItem:first==='working'&&row.name==='Michael Baldree'?'A-001':''};
       })}:
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
  if(!overlays[0].textContent.includes('C Shift · PPE Check Status'))throw Error('User crew heading missing');
  if(!overlays[1].textContent.includes('BC Check'))throw Error('Master heading missing');
  for(const overlay of overlays){
    for(const name of __NAMES__)if(!overlay.textContent.includes(name))
      throw Error('Crew member missing '+name);
    if(!overlay.textContent.includes('1 working / 1 off'))
      throw Error('Working/off duty counts missing');
  }
  const user=overlays[0],master=overlays[1];
  const history=[...master.querySelectorAll('button')]
    .find(x=>x.textContent==='2-Month PPE History');
  if(!history||!history.title.includes('Snapshot only'))
    throw Error('BC does not expose stored two-month PPE trend history prominently');
  history.click();
  if(window.__historyOpened!=='2026-11-18T15:00:00Z')
    throw Error('History control did not open the original source audit');
  // An ordinary user's roster can include the full crew. BC gets only
  // confirmed workers in its MAIN summary, not all OFF/unknown firefighters.
  if(user.querySelector('table').querySelectorAll('tr').length!==8)
    throw Error('Crew status summary lost seven-person roster');
  const bcInitial=[...master.querySelector('table').querySelectorAll('tr')];
  if(bcInitial.length!==2||!bcInitial[1].textContent.includes('Michael Baldree'))
    throw Error('BC should show only the one confirmed working firefighter');
  if(/Weston|Brooks|Brion/.test(bcInitial[1].textContent))
    throw Error('BC showed an off or unconfirmed person as working');
  if(user.querySelectorAll('[data-cshift-duty-editor] select').length)throw Error('Ordinary user can edit duty');
  const initialEditor=master.querySelector('[data-cshift-duty-editor]');
  if(initialEditor.querySelectorAll('select').length!==14)throw Error('Master lacks two day controls');
  if(!initialEditor.textContent.includes('Rebel Scout loaded 10 WORKING, 4 OFF, 0 UNKNOWN'))
    throw Error('Rebel Scout attendance suggestions were not shown: '+initialEditor.querySelector('[data-cshift-scout-evidence]')?.textContent+';calls='+requests.map(x=>x.url).join('|'));
  const initialRows=[...initialEditor.querySelectorAll('table tr')];
  for(const row of initialRows){
    const name=row.cells[0].textContent;
    const expected=/Weston|Brooks/.test(name)||name==='Michael Brion'?'off':'working';
    for(const input of row.querySelectorAll('select'))
      if(input.value!==expected)throw Error('Scout did not prefill '+name+' as '+expected);
  }
  const b=[...master.querySelectorAll('button')].find(x=>x.textContent.includes('Confirm C Shift Duty'));
  if(!b)throw Error('Captain confirmation action missing');
  b.click();
  await new Promise(r=>setTimeout(r,80));
  const posted=requests.find(x=>x.url.includes('vr-ppe-pilot-duty'));
  if(!posted||posted.data.people.length!==7||posted.data.tourStart!=='2026-11-21')
    throw Error('Master duty submission was not sent');
  if(posted.data.people.some(row=>
      [row.day1,row.day2].some(status=>status!==
        (/Weston|Brooks/.test(row.name)||row.name==='Michael Brion'?'off':'working'))))
    throw Error('Captain confirmation ignored Scout-prefilled assignments');
  if(!summary.textContent.includes('native Item Log receipts'))
    throw Error('Shared summary not updated');
  const map=[...master.querySelectorAll('button')].find(x=>x.textContent.includes('Map Working Crew PPE'));
  if(!map)throw Error('Master PPE discovery not available');
  map.click();
  await new Promise(r=>setTimeout(r,100));
  const mapped=requests.find(x=>x.url.includes('vr-ppe-pilot-inventory'));
  if(!mapped||mapped.data.personName!=='Michael Baldree'||
      mapped.data.items.length!==1||
      mapped.data.items[0].assetPath!=='/app/equipment/PPE/pool/300045/4605913/item')throw Error('Scoped PPE map not delivered: '+String(window.__nativeStatus)+'; requests='+requests.map(x=>x.url).join(','));
  const monitor=[...master.querySelectorAll('button')].find(x=>x.textContent.includes('Monitor C Shift in This Tab'));
  if(!monitor)throw Error('Dedicated-tab monitoring button not found');
  const scansAfterMap=window.__scanCount;
  monitor.click();
  await new Promise(r=>setTimeout(r,100));
  if(window.__scanCount!==scansAfterMap)
    throw Error('One-item check repeated a full inventory scan despite saved native link');
  if(!window.__nativePilotCheck?.pilotRecheck||
      window.__nativePilotCheck.items.length!==1||
      window.__nativePilotCheck.items[0].assetId!=='A-001')
    throw Error('Dedicated monitoring did not prepare one working item for read-only native check');
  const session=JSON.parse(SESSION.get('vectorRebelCShiftDedicatedRecheckerV1')||'null');
  if(!session?.enabled||session.tourStart!=='2026-11-21')
    throw Error('Dedicated monitor not bound to one C-shift tour');
  if(window.__nativePilotCheck.items[0].pool!=='300045'||
     window.__nativePilotCheck.items[0].itemId!=='4605913')
    throw Error('Direct native PPE target did not preserve exact pool and item identity');
  monitor.click(); // Stop live monitor before switching to the completed tour.
  const picker=master.querySelector('select[aria-label="Select C shift tour"]');
  if(!picker||![...picker.options].some(x=>x.value==='2026-11-15'))
    throw Error('Last completed C tour November 15-16 is missing');
  picker.value='2026-11-15';
  picker.dispatchEvent(new Event('change',{bubbles:true}));
  await new Promise(r=>setTimeout(r,120));
  if(!master.textContent.includes('Historical PPE ownership')||
     !master.textContent.includes('2026-11-15 + 2026-11-16'))
    throw Error('Historical November 15-16 board did not load');
  const historicalEditor=master.querySelector('[data-cshift-duty-editor]');
  if(historicalEditor.querySelectorAll('select').length!==14)
    throw Error('Historical duty review was not enabled');
  if(!historicalEditor.textContent.includes('Rebel Scout loaded 10 WORKING, 4 OFF, 0 UNKNOWN'))
    throw Error('Historic Nov 15-16 Scout evidence was not loaded');
  for(const row of historicalEditor.querySelectorAll('table tr')){
    const expected=/Weston|Brooks/.test(row.cells[0].textContent)?'off':'working';
    for(const input of row.querySelectorAll('select'))
      if(input.value!==expected)throw Error('Historical duty suggestion mismatch');
  }
  if(HIST_DUTY)throw Error('Historical attendance was saved without captain confirmation');
  const before=requests.filter(x=>x.url.includes('vr-ppe-pilot-inventory')).length;
  // The user clicked Map first. Valid Scout evidence should offer one
  // explicit captain confirmation and continue to PPE discovery in that action.
  map.click();
  await new Promise(r=>setTimeout(r,220));
  if(!HIST_DUTY||HIST_DUTY.length!==7||
     HIST_DUTY.filter(x=>x.day1==='working'&&x.day2==='working').length!==5||
     HIST_DUTY.filter(x=>x.day1==='off'&&x.day2==='off').length!==2)
    throw Error('One-click historical mapping did not confirm Scout-suggested attendance');
  const historicDutyReq=requests.findIndex(x=>x.url.includes('vr-ppe-pilot-duty')&&x.data.tourStart==='2026-11-15');
  const historicInventoryReq=requests.findIndex(x=>x.url.includes('vr-ppe-pilot-inventory')&&x.data.tourStart==='2026-11-15');
  if(!(historicDutyReq>=0&&historicInventoryReq>historicDutyReq))
    throw Error('Historical mapping did not confirm duty before reading PPE');
  const pastPosts=requests.filter(x=>x.url.includes('vr-ppe-pilot-inventory'));
  if(pastPosts.length!==before+1||pastPosts.at(-1).data.tourStart!=='2026-11-15')
    throw Error('Historical scoped inventory did not target Nov 15-16');
  const single=[...master.querySelectorAll('button')].find(x=>x.textContent==='Check outstanding');
  single.click();
  await new Promise(r=>setTimeout(r,100));
  if(window.__nativePilotCheck?.tourStart!=='2026-11-15')
    throw Error('Historical read-only one-item recheck did not target Nov 15-16');
  // Captain must see EVERY mapped piece, while the battalion stays summary only.
  showCShiftPilotBoard(true,'captain');
  await new Promise(r=>setTimeout(r,100));
  const captain=[...document.querySelectorAll('.pilot-overlay')].at(-1);
  if(!captain.textContent.includes('Daily Captain Check'))
    throw Error('Captain-specific full gear screen missing');
  if(captain.textContent.includes('EXTRA-01'))
    throw Error('Previously stored supplemental gear leaked into Captain routine view');
  const itemRows=[...captain.querySelector('table').querySelectorAll('tr')];
  if(itemRows.length!==10)
    throw Error('Captain gear grid did not include each known item and all seven firefighters: '+itemRows.length);
  if(!captain.textContent.includes('A-001')||
     !captain.textContent.includes('B-002')||
     !captain.textContent.includes('C-003')||
     !captain.textContent.includes('✓ VERIFIED')||
     !captain.textContent.includes('? NOT YET VERIFIED')||
     !captain.textContent.includes('? UNREADABLE'))
    throw Error('Captain full PPE grid has missing statuses or source data');
  const bcFinal=[...master.querySelector('table').querySelectorAll('tr')];
  if(!bcFinal.some(row=>row.textContent.includes('1 / 3')))
    throw Error('BC counts still include supplemental PPE');
  if(!master.querySelector('[data-cshift-excluded]')?.textContent.includes('1 stored supplemental PPE'))
    throw Error('Master diagnostics do not show legacy extra-record count');
  if(bcFinal.length!==6)
    throw Error('BC summary should show only the five confirmed working firefighters: '+bcFinal.length);
  if(bcFinal.some(row=>/Weston|Brooks/.test(row.textContent)))
    throw Error('BC summary displayed off-duty firefighters');
  if([...master.querySelectorAll('button')].filter(b=>b.parentElement?.parentElement===master.querySelector('section')).length>4)
    throw Error('Too many primary buttons in battalion view');
  // No captain-confirmed workers is not "all clear" or seven misleading
  // BC equipment rows. The empty state must explicitly request staffing.
  for(const row of FIXTURE.people){
    row.attendance='unconfirmed';
    row.dutyDay1='unconfirmed';
    row.dutyDay2='unconfirmed';
  }
  FIXTURE.workingCrew=0;FIXTURE.offCrew=0;FIXTURE.unconfirmedCrew=7;
  showCShiftPilotBoard(true);
  await new Promise(r=>setTimeout(r,110));
  const emptyBc=[...document.querySelectorAll('.pilot-overlay')].at(-1);
  const emptyBcRows=[...emptyBc.querySelector('table').querySelectorAll('tr')];
  if(emptyBcRows.length!==2||
     !emptyBcRows[1].textContent.includes('No confirmed working firefighters')||
     !emptyBcRows[1].textContent.includes('REVIEW STAFFING')||
     !emptyBcRows[1].textContent.includes('Unknown'))
    throw Error('BC did not show a clear unknown-staffing empty state');
  document.body.dataset.cshiftSmoke='PASS';
 }catch(error){document.body.dataset.cshiftSmoke='FAIL';document.body.dataset.reason=error.message;}
 },60);
})();
`.replace('__FEATURE__',feature)
 .replace('__DATA__',JSON.stringify(fixture))
 .replaceAll('__NAMES__',JSON.stringify(names));
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
