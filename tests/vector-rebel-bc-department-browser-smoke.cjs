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
const captainAuditWindow=()=>({tours:[
 {startDate:'2026-11-09'}, {startDate:'2026-11-15'}, {startDate:'2026-11-21'}
]});
const report={
 currentTourCrewConfirmedAt:'2026-11-21T15:00:00Z',
 tourRoster:{startDate:'2026-11-21',endDate:'2026-11-22',
  basePrefixes:['PERSON-BRION'],swingPrefixes:[],
  onByDate:{'2026-11-21':['PERSON-BRION'],
   '2026-11-22':['PERSON-BRION']}},
 owners:[{name:'Michael Brion',prefix:'PERSON-BRION',items:[
  {status:'ok',tourChecks:[
    {startDate:'2026-11-09',ok:true},{startDate:'2026-11-15',ok:true},
    {startDate:'2026-11-21',ok:true}]},
  {status:'ok',tourChecks:[
    {startDate:'2026-11-09',ok:false},{startDate:'2026-11-15',ok:true},
    {startDate:'2026-11-21',ok:false}]}
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
let requests=0,monitorOpened=0;
const cPilotBridge=async(method,action,data,query)=>{
 if(method!=='GET'||action!=='vr-bc-department-roster'||query.date!=='2026-11-21')
  throw Error('Unexpected BC network call');
 requests++;
 return scheduled;
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
 if(names.some(x=>x.includes('Jerry Weems'))||
    names.some(x=>x.includes('Prior Tour OT')))
   throw Error('BC roster included current OFF or previous-tour overtime');
 if(!summary.textContent.includes('STALE: review needed'))
   throw Error('BC failed to label six-day-old schedule stale');
 if(!names.some(x=>x.includes('Michael Brion')&&
    x.includes('1 / 2')&&x.includes('2 / 2')))
   throw Error('BC did not show C shift short native tour history');
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
 if(table.textContent.includes('Austin Fox'))throw Error('BC confirmed roster did not exclude removed person');
 if(!summary.textContent.includes('BC-confirmed'))throw Error('BC local confirmed date missing');
 if(STORE.size!==1||requests!==1)throw Error('BC touched something other than local date-specific review');
 result={pass:true,citywide:true,staleLabel:true,shortHistory:true,
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
