'use strict';
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawnSync}=require('node:child_process'),assert=require('node:assert/strict');
const src=fs.readFileSync(path.join(__dirname,'../beta/vector-rebel.user.js'),'utf8');
assert.match(src,/query\?\.tours\?'&tours='\+encodeURIComponent\(query\.tours\)/,
 'Authenticated Vector bridge must forward the actual tour date list to historical PPE endpoint.');
const start=src.indexOf('    const BC_DAILY_ROSTER_KEY=');
const end=src.indexOf('    function showCShiftPilotBoard(',start);
assert.ok(start>0&&end>start);
const feature=src.slice(start,end);
const browser=[
 process.env.CHROME_PATH,
 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
].filter(Boolean).find(fs.existsSync);
if(!browser){console.log('BC_DEPARTMENT_BROWSER_SMOKE=SKIP');process.exit(0)}
const js=`
(async()=>{
const STORE=new Map();
const clean=x=>String(x||'').trim(),masterNameKey=x=>clean(x).toLowerCase();
const validDateKey=x=>typeof x==='string'&&x.length===10&&
 Number.isFinite(Date.parse(x+'T12:00:00Z'))?x:'';
const CAPTAIN_TOUR_ANCHOR_DATE='2026-09-22',CAPTAIN_TOUR_CYCLE_DAYS=6,CAPTAIN_TOUR_SHIFT_DAYS=2,CAPTAIN_SHIFT_OFFSETS={C:0,A:2,B:4};
const C_PILOT_NAMES=new Set(['michael brion','jerry weems','jared weston','michael baldree']);
let operationalDate='2026-11-22';
const localTodayKey=()=>operationalDate;
const departmentOperationalKey=()=>operationalDate;
const getCaptainPersonOptions=()=>[
 {name:'Michael Brion',prefix:'PERSON-BRION'},
 {name:'Austin Fox',prefix:'PERSON-FOX'},
 {name:'Current OT',prefix:'PERSON-OT'}
];
const makeButton=label=>{const el=document.createElement('button');el.textContent=label;return el};
const makeOverlayBox=()=>{
 const overlay=document.createElement('div');overlay.className='test-overlay';
 overlay.style.cssText='position:fixed;inset:0;display:flex;align-items:center;justify-content:center;padding:18px;box-sizing:border-box;';
 const box=document.createElement('div');box.style.cssText='max-height:90vh;overflow:auto;max-width:94vw;padding:20px;box-sizing:border-box;';
 overlay.appendChild(box);
 document.body.appendChild(overlay);return{overlay,box};
};
const loadJSON=(k,def)=>STORE.has(k)?STORE.get(k):def;
const saveJSON=(k,v)=>STORE.set(k,structuredClone(v));
const displayMonthKey=x=>x==='2026-10'?'October 2026':'November 2026';
const cWindow=()=>({months:['2026-10','2026-11'],tours:[
 {month:'2026-10',startDate:'2026-10-04',endDate:'2026-10-05'},
 {month:'2026-10',startDate:'2026-10-10',endDate:'2026-10-11'},
 {month:'2026-10',startDate:'2026-10-16',endDate:'2026-10-17'},
 {month:'2026-10',startDate:'2026-10-22',endDate:'2026-10-23'},
 {month:'2026-10',startDate:'2026-10-28',endDate:'2026-10-29'},
 {month:'2026-11',startDate:'2026-11-03',endDate:'2026-11-04'},
 {month:'2026-11',startDate:'2026-11-09',endDate:'2026-11-10'},
 {month:'2026-11',startDate:'2026-11-15',endDate:'2026-11-16'},
 {month:'2026-11',startDate:'2026-11-21',endDate:'2026-11-22'},
 {month:'2026-11',startDate:'2026-11-27',endDate:'2026-11-28'}
 ]});
const captainAuditWindow=(date,shift='C')=>{
 const b=cWindow(),n=CAPTAIN_SHIFT_OFFSETS[shift]||0;
 const plus=d=>new Date(Date.parse(d+'T12:00:00Z')+n*86400000).toISOString().slice(0,10);
 return {...b,tours:b.tours.map(t=>({...t,startDate:plus(t.startDate),endDate:plus(t.endDate),month:plus(t.startDate).slice(0,7)}))};
};
const report={
 sourceNativeReadAt:'2026-11-21T19:00:00Z',
 currentTourCrewConfirmedAt:'2026-11-21T15:00:00Z',
 tourRoster:{startDate:'2026-11-21',endDate:'2026-11-22',
  basePrefixes:['PERSON-BRION'],swingPrefixes:[],
  onByDate:{'2026-11-21':['PERSON-BRION'],
   '2026-11-22':['PERSON-BRION']}},
 owners:[{name:'Michael Brion',prefix:'PERSON-BRION',items:[
  {status:'ok',tourChecks:[
    {startDate:'2026-10-27',endDate:'2026-10-28',due:true,ok:true,resultStatus:'unknown'},
    {startDate:'2026-11-03',endDate:'2026-11-04',due:true,ok:true,resultStatus:'unknown'},
    {startDate:'2026-11-09',endDate:'2026-11-10',due:true,ok:true,resultStatus:'unknown'},
    {startDate:'2026-11-15',endDate:'2026-11-16',due:true,ok:true,resultStatus:'unknown'},
    {startDate:'2026-11-21',endDate:'2026-11-22',due:true,ok:true,resultStatus:'unknown'}]},
  {status:'ok',tourChecks:[
    {startDate:'2026-10-27',endDate:'2026-10-28',due:true,ok:true,resultStatus:'passed'},
    {startDate:'2026-11-03',endDate:'2026-11-04',due:true,ok:false},
    {startDate:'2026-11-09',endDate:'2026-11-10',due:true,ok:false},
    {startDate:'2026-11-15',endDate:'2026-11-16',due:true,ok:true,resultStatus:'unknown'},
    {startDate:'2026-11-21',endDate:'2026-11-22',due:true,ok:false}]}
 ]},{name:'Prior Tour OT',prefix:'PERSON-OLDOT',items:[]}]
};
const getCaptainDailyReport=()=>report;
const scheduled={
 scope:'bc-department-roster',readOnly:true,date:'2026-11-22',
 stale:true,capturedAt:'2026-11-15T16:47:10Z',people:[
 {name:'Michael Brion',prefix:'PERSON-BRION',units:['Truck 504'],sourceStatus:'scheduled_work_evidence'},
 {name:'Jerry Weems',prefix:'PERSON-WEEMS',units:['Truck 504'],sourceStatus:'scheduled_work_evidence'},
 {name:'Austin Fox',prefix:'PERSON-FOX',units:['Truck 501'],sourceStatus:'scheduled_work_evidence'},
 {name:'Steven Beagle',prefix:'PERSON-BEAGLE',units:['Battalion 501'],sourceStatus:'scheduled_work_evidence'},
 {name:'Nicole Duncan',prefix:'PERSON-DUNCAN',units:['Engine 506'],sourceStatus:'scheduled_work_evidence'}
]};
const pilot={activeTour:true,tourStart:'2026-11-21',tourEnd:'2026-11-22',people:[
 {name:'Michael Brion',prefix:'PERSON-BRION',dutyDay1:'working',
  lastDutyConfirmedAt:'2026-11-21T15:00:00Z',knownItems:2,
  verifiedItems:0,maskKnownItems:0},
 {name:'Jerry Weems',prefix:'PERSON-WEEMS',dutyDay1:'off',
  lastDutyConfirmedAt:'2026-11-21T15:00:00Z'}
]};
let requests=0,attendanceRequests=0,monitorOpened=0;
const cPilotBridge=async(method,action,data,query)=>{
 if(method!=='GET')throw Error('Unexpected method');
 if(action==='vr-bc-department-roster'){
  if(query.date!==operationalDate)throw Error('Wrong roster date');
  requests++;return operationalDate==='2026-11-23'?{...scheduled,date:operationalDate,people:[{name:'Michael Brion',prefix:'PERSON-BRION',units:['Engine 502'],sourceStatus:'scheduled_work_evidence'},scheduled.people[3]]}:scheduled;
 }
 if(action==='vr-captain-attendance'){
  attendanceRequests++;
  const dates=query.dates.split(','),people=JSON.parse(query.people);
  return{ok:true,readOnly:true,scope:'captain-attendance-evidence',
   records:people.flatMap(name=>dates.map(date=>({
    name,date,sourceQuality:'good_direct_capture',
    status:name==='Nicole Duncan'&&['2026-10-28','2026-10-29'].includes(date)?
     'full_leave_evidence':name==='Austin Fox'&&date==='2026-10-27'?
     'work_evidence':'unknown'
   })))};
 }
 throw Error('Unexpected BC network call '+action);
};
const cPilotFetch=async()=>operationalDate==='2026-11-23'?{activeTour:false,people:[]}:pilot;
 const departmentFetch=async()=>operationalDate==='2026-11-23'?({scope:'department-ppe-readonly',readOnly:true,date:operationalDate,people:[{name:'Michael Brion',prefix:'PERSON-BRION',knownItems:8,nativeReadItems:8,nativeDatedItems:8}],totals:{mappedPeople:1,nativeReadItems:8,nativeDatedItems:8}}):({scope:'department-ppe-readonly',readOnly:true,
 date:'2026-11-22',attendanceConfirmed:false,
  people:[{name:'Nicole Duncan',prefix:'PERSON-DUNCAN',knownItems:0,
    nativeDatedItems:0,lookupStatus:'owner_not_found',
    lookupReason:'No exact Responsible Party match in Vector'}],
 totals:{mappedPeople:0,nativeReadItems:0,nativeDatedItems:0}});
const departmentFetchTourHistory=async(starts)=>({
 scope:'department-ppe-tour-history-readonly',readOnly:true,
 tours:starts.map(start=>({tourStart:start,
  people:start==='2026-11-21'?[{name:'Austin Fox',prefix:'PERSON-FOX',
    knownItems:12,nativeReadItems:12,nativeDatedItems:3}]:[],
  totals:{mappedPeople:start==='2026-11-21'?1:0,
    nativeReadItems:start==='2026-11-21'?12:0,
    nativeDatedItems:start==='2026-11-21'?3:0}}))});
const departmentFetchItemHistory=async(starts)=>({
 scope:'department-ppe-item-history-readonly',readOnly:true,date:'2026-11-22',
 tours:starts.map(start=>{
  const observed=['2026-10-04','2026-11-03','2026-11-21'].includes(start)?start:'';
  const item={assetId:'FOX-COAT-01',assetType:'Bunker Coat',inspectionMode:'tour',
   recordedDates:observed?[observed]:[],
   events:observed?[{date:observed,verdict:start==='2026-11-03'?'failed':
      start==='2026-10-04'?'unknown':'passed'}]:[],
   readAt:'2026-11-22T16:00:00Z'};
  return{tourStart:start,people:[{name:'Austin Fox',prefix:'PERSON-FOX',
    knownItems:1,nativeDatedItems:observed?1:0,
    explicitFailedItems:start==='2026-11-03'?1:0,items:[item]}],
    totals:{mappedPeople:1,datedItems:observed?1:0}};
 })
});
const showCShiftPilotBoard=()=>{monitorOpened++};
__FEATURE__
showBcDepartmentCheck();
await new Promise(r=>setTimeout(r,90));
const overlay=document.querySelector('.test-overlay');
const table=overlay.querySelector('table[data-bc-department-grid]');
const summary=overlay.querySelector('[role=status]');
const names=[...table.querySelectorAll('tr')].map(x=>x.textContent);
let result={};
try{
 if(!names.some(x=>x.includes('Austin Fox')&&x.includes('Truck 501'))||
    !names.some(x=>x.includes('Nicole Duncan')&&x.includes('Engine 506'))||
    !names.some(x=>x.includes('Steven Beagle')&&x.includes('Battalion 501')))
   throw Error('BC did not display workers from stations outside Station 4; count='+names.length+', status='+summary.textContent.slice(0,300));
 if(names.some(x=>x.includes('Prior Tour OT')))
   throw Error('BC incorrectly included previous-tour overtime');
  if(!names.some(x=>x.includes('Nicole Duncan')&&x.includes('LOOKUP ISSUE')))
   throw Error('Attempted but unresolved native gear lookup must remain visible as unknown');
  const headers=[...table.querySelectorAll('th')].map(x=>x.textContent);
  const picker=overlay.querySelector('select[aria-label="BC history month"]');
  if(!picker||picker.value!=='both'||
     !headers.includes('November 2026')||!headers.includes('October 2026'))
    throw Error('BC must open on current and previous months');
  picker.value='previous';picker.dispatchEvent(new Event('change',{bubbles:true}));
  const previous=[...table.querySelectorAll('th')].map(x=>x.textContent);
  if(!previous.includes('October 2026')||previous.includes('November 2026'))
    throw Error('Previous month must be selectable');
 const grouped=[...table.querySelectorAll('tr[data-bc-station-group]')];
 if(grouped[0]?.getAttribute('data-bc-station-group')!=='BC'||
    grouped[1]?.getAttribute('data-bc-station-group')!=='Station 1')
   throw Error('BC must lead station groups, followed by Station 1');
 if(!grouped[0].nextElementSibling?.textContent.includes('Steven Beagle'))
   throw Error('BC station group must list Battalion 501 first');
 const nicole=[...table.querySelectorAll('tr')].find(x=>x.textContent.includes('Nicole Duncan'));
 if(!nicole||!nicole.textContent.includes('OFF'))
   throw Error('Trusted two-day CrewSense leave evidence did not show OFF');
 const austin=[...table.querySelectorAll('tr')].find(x=>x.textContent.includes('Austin Fox'));
  if(!austin||!austin.textContent.includes('3 RECORDED'))
    throw Error('Native outside-C inspection evidence not labeled in plain language');
  const unmapped=[...table.querySelectorAll('tr')].find(x=>x.textContent.includes('Steven Beagle'));
  if(!unmapped||!unmapped.textContent.includes('N/C'))
    throw Error('Uncollected people must remain explicitly unknown');
  const personButton=austin.querySelector('button[aria-label="View native PPE history for Austin Fox"]');
  if(!personButton)throw Error('Firefighter name must open individual equipment details');
  personButton.click();
  const pane=overlay.querySelector('[aria-label="Firefighter individual PPE Item Log history"]');
  if(!pane||pane.hidden||!pane.textContent.includes('FOX-COAT-01')||
     !pane.textContent.includes('10/04')||!pane.textContent.includes('11/21')||
     !pane.textContent.includes('FAILED'))
    throw Error('Native inspection history must show per-equipment dates and explicit failure: '+(pane?.textContent||'NO PANE').slice(0,850));
  if(!summary.textContent.includes('Background Item Log search includes C shift')||
      !summary.textContent.includes('scheduled (unconfirmed)')||
      !summary.textContent.includes('Department native search: 0 people with mapped gear, 0 Item Logs actually read, 0 dated')||
       !summary.textContent.includes('Latest two-day tour 2026-11-21: 3 actual native inspection dates'))
    throw Error('BC did not explain uncollected non-C-shift crews');
  if(!summary.textContent.includes('STALE: review needed'))
   throw Error('BC failed to label six-day-old schedule stale');
 if(!names.some(x=>x.includes('Michael Brion')&&
    x.includes('PART 1 / 2')&&x.includes('DONE')))
   throw Error('BC did not show partial and all-completed native tour statuses');
  picker.value='both';picker.dispatchEvent(new Event('change',{bubbles:true}));
  const bothHeaders=[...table.querySelectorAll('th')].map(x=>x.textContent);
  if(!bothHeaders.includes('October 2026')||!bothHeaders.includes('November 2026'))
    throw Error('Both month history must remain available');
  const wrap=table.parentElement;
 if(table.scrollWidth>wrap.clientWidth+3)
   throw Error('Two-month matrix overflows horizontally at desktop width ('+
     table.scrollWidth+' > '+wrap.clientWidth+')');
  picker.value='current';picker.dispatchEvent(new Event('change',{bubbles:true}));
  if(!table.querySelector('th')?.textContent.includes('FIREFIGHTER'))
   throw Error('BC did not use consistent Captain-like table');
 if(overlay.querySelectorAll('details').length!==1||monitorOpened)
   throw Error('Advanced pilot monitor not collapsed');
 const review=[...overlay.querySelectorAll('button')].find(x=>
  x.textContent.includes('Review Today'));
 review.click();
 if(table.scrollWidth>table.parentElement.clientWidth+3)
   throw Error('Two-month review mode introduced horizontal overflow');
 const remove=[...table.querySelectorAll('input[aria-label]')]
  .find(x=>x.getAttribute('aria-label')==='At work Austin Fox');
 if(!remove)throw Error('BC review did not show one checkbox per scheduled person');
 remove.checked=false;remove.dispatchEvent(new Event('change',{bubbles:true}));
 review.click();
 if(![...table.querySelectorAll('tr')].some(x=>
   x.textContent.includes('Austin Fox')&&x.textContent.includes('OFF')))
   throw Error('BC review did not retain explicit OFF person');
 if(!summary.textContent.includes('BC-confirmed'))throw Error('BC local confirmed date missing');
  if(overlay.querySelector('select[aria-label="BC history month"]')!==picker)
    throw Error('Saved BC roster removed history picker');
  if(STORE.size!==1||requests!==1||attendanceRequests!==1)
   throw Error('BC review performed wrong network or persistent storage operation');
 result={pass:true,citywide:true,staleLabel:true,twoMonths:true,
  completedAndPartial:true,offVisible:true,bcFirst:true,
  attendanceReadOnly:true,stationGroups:true,allColumnsFit:true,
  noOldOt:true,localReview:true,monitorHidden:true};
 overlay.remove();STORE.clear();operationalDate='2026-11-23';
 showBcDepartmentCheck();await new Promise(r=>setTimeout(r,90));
 const aOverlay=document.querySelector('.test-overlay'),aTable=aOverlay.querySelector('table[data-bc-department-grid]');
 const aRow=[...aTable.querySelectorAll('tr')].find(x=>x.textContent.includes('Michael Brion'));
 if(!aOverlay.textContent.includes('Shift A tours')||!aRow||aRow.cells[3]?.textContent!=='8 RECORDED'||!aRow.textContent.includes('Engine 502'))
  throw Error('A-shift current-date PPE receipt lost behind C-shift history: '+(aRow?.textContent||'NO ROW'));
 if(![...aTable.querySelectorAll('th')].some(th=>th.title.startsWith('A-shift tour 2026-11-23')))
  throw Error('BC date columns must follow active A shift');
 result.offShiftOvertime=true;
}catch(error){result={pass:false,error:String(error.message)}}
document.body.dataset.bcDepartment=result.pass?'PASS':'FAIL';
const pre=document.createElement('pre');pre.id='result';pre.textContent=JSON.stringify(result);
document.body.appendChild(pre);
})();
`.replace('__FEATURE__',feature);
const html='<!doctype html><html><body><script>'+js+'</script></body></html>';
const folder=fs.mkdtempSync(path.join(os.tmpdir(),'vector-bc-city-'));
try{
 const p=path.join(folder,'view.html');fs.writeFileSync(p,html);
 const r=spawnSync(browser,['--headless=new','--no-first-run','--disable-gpu',
  '--disable-extensions','--disable-background-networking',
  '--window-size=1440,900','--force-device-scale-factor=1','--virtual-time-budget=1200',
  '--user-data-dir='+path.join(folder,'profile'),'--dump-dom','file:///'+p.replace(/\\/g,'/')],{
  encoding:'utf8',timeout:30000,maxBuffer:8*1024*1024,windowsHide:true
 });
 if(r.error)throw r.error;
 const status=r.stdout.match(/data-bc-department="([^"]+)"/)?.[1]||'UNKNOWN';
 const detail=r.stdout.match(/<pre id="result">([^<]+)<\/pre>/)?.[1]||'missing';
 console.log('BC_DEPARTMENT_BROWSER_SMOKE='+status);
 console.log(detail.replaceAll('&quot;','"'));
 assert.equal(status,'PASS',String(r.stderr).slice(-900)+detail);
}finally{fs.rmSync(folder,{recursive:true,force:true})}
