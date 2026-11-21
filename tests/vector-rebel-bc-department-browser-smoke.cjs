'use strict';
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawnSync}=require('node:child_process'),assert=require('node:assert/strict');
const src=fs.readFileSync(path.join(__dirname,'../beta/vector-rebel.user.js'),'utf8');
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
const C_PILOT_NAMES=new Set(['michael brion','jerry weems','jared weston','michael baldree']);
const localTodayKey=()=> '2026-11-21';
const getCaptainPersonOptions=()=>[
 {name:'Michael Brion',prefix:'PERSON-BRION'},
 {name:'Austin Fox',prefix:'PERSON-FOX'},
 {name:'Current OT',prefix:'PERSON-OT'}
];
const makeButton=label=>{const el=document.createElement('button');el.textContent=label;return el};
const makeOverlayBox=()=>{
 const overlay=document.createElement('div');overlay.className='test-overlay';
 const box=document.createElement('div');overlay.appendChild(box);
 document.body.appendChild(overlay);return{overlay,box};
};
const loadJSON=(k,def)=>STORE.has(k)?STORE.get(k):def;
const saveJSON=(k,v)=>STORE.set(k,structuredClone(v));
const displayMonthKey=x=>x==='2026-10'?'October 2026':'November 2026';
const captainAuditWindow=()=>({months:['2026-10','2026-11'],tours:[
 {month:'2026-10',startDate:'2026-10-27',endDate:'2026-10-28'},
 {month:'2026-11',startDate:'2026-11-03',endDate:'2026-11-04'},
 {month:'2026-11',startDate:'2026-11-09',endDate:'2026-11-10'},
 {month:'2026-11',startDate:'2026-11-15',endDate:'2026-11-16'},
 {month:'2026-11',startDate:'2026-11-21',endDate:'2026-11-22'},
 {month:'2026-11',startDate:'2026-11-27',endDate:'2026-11-28'}
]});
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
 scope:'bc-department-roster',readOnly:true,date:'2026-11-21',
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
  if(query.date!=='2026-11-21')throw Error('Wrong roster date');
  requests++;return scheduled;
 }
 if(action==='vr-captain-attendance'){
  attendanceRequests++;
  const dates=query.dates.split(','),people=JSON.parse(query.people);
  return{ok:true,readOnly:true,scope:'captain-attendance-evidence',
   records:people.flatMap(name=>dates.map(date=>({
    name,date,sourceQuality:'good_direct_capture',
    status:name==='Nicole Duncan'&&['2026-10-27','2026-10-28'].includes(date)?
     'full_leave_evidence':name==='Austin Fox'&&date==='2026-10-27'?
     'work_evidence':'unknown'
   })))};
 }
 throw Error('Unexpected BC network call '+action);
};
const cPilotFetch=async()=>pilot;
const showCShiftPilotBoard=()=>{monitorOpened++};
__FEATURE__
showBcDepartmentCheck();
await new Promise(r=>setTimeout(r,90));
const overlay=document.querySelector('.test-overlay');
const table=overlay.querySelector('table');
const summary=overlay.querySelector('[role=status]');
const names=[...table.querySelectorAll('tr')].map(x=>x.textContent);
let result={};
try{
 if(!names.some(x=>x.includes('Austin Fox')&&x.includes('Truck 501'))||
    !names.some(x=>x.includes('Nicole Duncan')&&x.includes('Engine 506'))||
    !names.some(x=>x.includes('Steven Beagle')&&x.includes('Battalion 501')))
   throw Error('BC did not display workers from stations outside Station 4');
 if(!names.some(x=>x.includes('Jerry Weems')&&x.includes('OFF'))||
    names.some(x=>x.includes('Prior Tour OT')))
   throw Error('BC failed OFF duty or included previous-tour overtime');
 const headers=[...table.querySelectorAll('th')].map(x=>x.textContent);
 if(!headers.includes('October 2026')||!headers.includes('November 2026')||
    !headers.includes('10-27 / 10-28')||!headers.includes('11-27 / 11-28'))
   throw Error('BC did not show both full calendar months');
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
 if(!austin||!austin.textContent.includes('NOT VERIFIED'))
   throw Error('Other employees must show explicit NOT VERIFIED rather than blank');
 if(!summary.textContent.includes('STALE: review needed'))
   throw Error('BC failed to label six-day-old schedule stale');
 if(!names.some(x=>x.includes('Michael Brion')&&
    x.includes('PARTIAL 1 / 2')&&x.includes('ALL COMPLETED')))
   throw Error('BC did not show partial and all-completed native tour statuses');
 if(!table.querySelector('th')?.textContent.includes('FIREFIGHTER'))
   throw Error('BC did not use consistent Captain-like table');
 if(overlay.querySelectorAll('details').length!==1||monitorOpened)
   throw Error('Advanced pilot monitor not collapsed');
 const review=[...overlay.querySelectorAll('button')].find(x=>
  x.textContent.includes('Review Today'));
 review.click();
 const remove=[...table.querySelectorAll('input[aria-label]')]
  .find(x=>x.getAttribute('aria-label')==='At work Austin Fox');
 if(!remove)throw Error('BC review did not show one checkbox per scheduled person');
 remove.checked=false;remove.dispatchEvent(new Event('change',{bubbles:true}));
 review.click();
 if(![...table.querySelectorAll('tr')].some(x=>
   x.textContent.includes('Austin Fox')&&x.textContent.includes('OFF')))
   throw Error('BC review did not retain explicit OFF person');
 if(!summary.textContent.includes('BC-confirmed'))throw Error('BC local confirmed date missing');
 if(STORE.size!==1||requests!==1||attendanceRequests!==1)
   throw Error('BC review performed wrong network or persistent storage operation');
 result={pass:true,citywide:true,staleLabel:true,twoMonths:true,
  completedAndPartial:true,offVisible:true,bcFirst:true,
  attendanceReadOnly:true,stationGroups:true,
  noOldOt:true,localReview:true,monitorHidden:true};
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
  '--disable-extensions','--disable-background-networking','--virtual-time-budget=1200',
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
