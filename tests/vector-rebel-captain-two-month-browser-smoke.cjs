'use strict';
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawnSync}=require('node:child_process'),assert=require('node:assert/strict');
const src=fs.readFileSync(path.join(__dirname,'../beta/vector-rebel.user.js'),'utf8');
const start=src.indexOf('    function showCaptainDailyReport(');
const end=src.indexOf('    function showCaptainDailySetPicker()',start);
assert.ok(start>0&&end>start,'two-month native history renderer in source');
const feature=src.slice(start,end);
const chrome=[process.env.CHROME_PATH,'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe']
.filter(Boolean).find(fs.existsSync);
if(!chrome){console.log('CAPTAIN_TWO_MONTH_BROWSER_SMOKE=SKIP');process.exit(0);}
const tours=[
 ['2026-10-01','2026-10-02'],['2026-10-07','2026-10-08'],
 ['2026-10-13','2026-10-14'],['2026-11-19','2026-11-20']]
 .map(([startDate,endDate])=>({month:startDate.slice(0,7),startDate,endDate,
 eligibleDates:[startDate,endDate],due:true}));
const check=(startDate,params={})=>({
 startDate,endDate:tours.find(t=>t.startDate===startDate).endDate,
 month:startDate.slice(0,7),due:true,off:false,unknown:false,notAssigned:false,
 ok:false,date:'',assignmentSource:'scout_any_unit',...params
});
const report={schemaVersion:8,reportId:'TEST',generatedAt:'2026-11-19T15:00:00Z',
 setName:'Captain C Test',shift:'C',setId:'C',swingHistoryLimited:true,
 owners:[{name:'Firefighter A',prefix:'PERSON-A',
  items:[
   {assetId:'COAT-A',type:'Coat',status:'ok',tourChecks:[
    check('2026-10-01',{ok:true,date:'2026-10-01'}),
    check('2026-10-07'),check('2026-10-13'),check('2026-11-19')]},
   {assetId:'BOOTS-A',type:'Boots',status:'error',tourChecks:[
    check('2026-10-01'),check('2026-10-07'),check('2026-10-13'),
    check('2026-11-19')]}
  ]},
  {name:'Firefighter B',prefix:'PERSON-B',
   items:[{assetId:'COAT-B',type:'Coat',status:'ok',tourChecks:[
    check('2026-10-01',{due:false,off:true}),
    check('2026-10-07',{due:false,unknown:true}),
    check('2026-10-13',{ok:true,date:'2026-10-13'}),
    check('2026-11-19')]}]}
 ],
 auditWindow:{asOfDate:'2026-11-19',shift:'C',months:['2026-10','2026-11'],
  tours},
};
const js=`
(function(){
const REPORT=__REPORT__;
const getCaptainDailyReport=()=>REPORT;
const getConfig=()=>({captainSets:[]});
const setStatus=()=>{};
const makeOverlayBox=()=>{const overlay=document.createElement('section');
 overlay.className='history-overlay';const box=document.createElement('div');
 overlay.appendChild(box);document.body.appendChild(overlay);
 return{overlay,box}};
const escapeHtml=value=>String(value||'').replaceAll('&','&amp;')
 .replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const captainShiftLabel=s=>s,displayMonthKey=s=>s,
 displayHistoryDateKey=s=>s,captainIsTemporarySwing=()=>false,
 captainHistoricalTourEnded=()=>false,clean=s=>String(s||'').trim(),
 captainDailyMissingTargets=()=>[],captainShowCommandAttendance=()=>{},
 showCaptainHistoricalOffEditor=()=>{},startCaptainDailyMissingRecheck=()=>{},
 launchCaptainDailyCheckFromAnywhere=()=>{},saveJSON=()=>{},
 CAPTAIN_DAILY_REPORT_KEY='test',captainDailyFormatDuration=()=>'?';
const makeButton=text=>{const b=document.createElement('button');
 b.textContent=text;return b};
__FEATURE__
try{
 showCaptainDailyReport(REPORT);
 const root=document.querySelector('.history-overlay');
 const rows=[...root.querySelectorAll('tbody tr')];
 if(rows.length!==3)throw Error('Not every firefighter/PPE piece visible: '+rows.length);
 const header=root.querySelector('thead').textContent;
 if(!header.includes('2026-10')||!header.includes('2026-11'))
    throw Error('Two-month tour date headings missing');
 if(header.includes('TWO-MONTH PATTERN')||
    root.textContent.includes('REPEATED MISSING')||
    root.querySelector('[data-captain-ppe-pattern]'))
    throw Error('Historical PPE viewer still contains unsolicited interpretations');
 if(!rows[0].textContent.includes('COAT-A')||
    !rows[1].textContent.includes('BOOTS-A')||
    !rows[2].textContent.includes('COAT-B'))
    throw Error('Some individual native PPE items are not shown');
 const completed=[...rows[0].querySelectorAll('td:nth-child(3) div[title]')];
 if(!completed.some(x=>x.textContent==='✓')||
    !completed.some(x=>x.textContent==='✕'))
    throw Error('First month does not show native verified and absent check dates');

 const marks=rows[1].querySelectorAll('td:nth-child(3) div[title],td:nth-child(4) div[title]');
 if([...marks].some(x=>x.textContent==='✕'))
    throw Error('Unreadable history was falsely displayed as a missing inspection');
 if(!root.textContent.includes('…'))
    throw Error('Ongoing tour was not distinguished from historic misses');
 document.body.dataset.twoMonthSmoke='PASS';
}catch(e){document.body.dataset.twoMonthSmoke='FAIL';document.body.dataset.reason=e.message;}
})();`.replace('__FEATURE__',feature).replace('__REPORT__',JSON.stringify(report));
require('node:vm').compileFunction(js,[]);
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'captain-two-month-smoke-'));
try{
 const filename=path.join(dir,'history.html');
 fs.writeFileSync(filename,'<!doctype html><html><body><script>'+js+'</script></body></html>');
 const res=spawnSync(chrome,['--headless=new','--no-first-run','--disable-gpu',
 '--disable-extensions','--disable-background-networking',
 '--virtual-time-budget=1000','--user-data-dir='+path.join(dir,'chrome'),
 '--dump-dom','file:///'+filename.replace(/\\/g,'/')],{
 encoding:'utf8',timeout:30000,windowsHide:true,maxBuffer:9*1024*1024});
 if(res.error)throw res.error;
 const status=res.stdout.match(/data-two-month-smoke="([^"]+)"/)?.[1]||'UNKNOWN';
 const reason=res.stdout.match(/data-reason="([^"]+)"/)?.[1]||'';
 if(status==='UNKNOWN'){
  console.log('BROWSER_STDERR_TAIL='+String(res.stderr).slice(-1500));
  console.log('BROWSER_STDOUT_TAIL='+String(res.stdout).slice(-1100));
 }
 console.log('CAPTAIN_TWO_MONTH_BROWSER_SMOKE='+status+(reason?' REASON='+reason:''));
 assert.equal(status,'PASS',String(res.stderr).slice(-350)+reason);
}finally{fs.rmSync(dir,{recursive:true,force:true})}
