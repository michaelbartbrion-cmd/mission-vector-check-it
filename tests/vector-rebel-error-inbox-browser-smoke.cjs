'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawnSync}=require('node:child_process');
const src=fs.readFileSync(path.join(__dirname,'../beta/vector-rebel.user.js'),'utf8');
const first=src.indexOf('    function showMasterErrorInbox(){');
const last=src.indexOf('    function localCalendarDate(){',first);
assert.ok(first>0&&last>first);
const feature=src.slice(first,last);
const realWait=src.match(/^    function wait\(ms\)\{return new Promise\(resolve=>setTimeout\(resolve,Math\.max\(0,Number\(ms\)\|\|0\)\)\);\}$/m)?.[0];
assert.ok(realWait,'real async wait helper must be defined before review all');
const browser=[
 process.env.CHROME_PATH,
 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
].filter(Boolean).find(fs.existsSync);
if(!browser){console.log('ERROR_INBOX_BROWSER_SMOKE=SKIP');process.exit(0)}
const script=`
(async()=>{
let confirmed=false,acknowledged=[],messages=[],refreshed=0;
const errorInbox={
 pending:Array.from({length:21},(_,i)=>({
  id:'feedback-report-'+i,
  title:i<16?'Vector Rebel error report':'Rebel IQ automatic error',
  occurredAt:'2026-11-21T15:06:24Z',
  deviceName:'C shift',source:i<16?'Vector Rebel':'Rebel IQ',
  priority:'high',description:'Automatic error report with source evidence'
 })),
 count:21,truncated:false,error:'',checkedAt:'2026-11-21T20:00:00Z'
};
const isMasterOwnerInstallation=()=>true,panelInterfaceMode=()=> 'master';
const makeOverlayBox=()=>{
 const overlay=document.createElement('div');
 overlay.className='test-overlay';
 const box=document.createElement('div');
 overlay.appendChild(box);document.body.appendChild(overlay);
 return{overlay,box};
};
const makeButton=label=>{
 const b=document.createElement('button');b.textContent=label;return b;
};
const clean=x=>String(x||''),setStatus=x=>messages.push(x);
__WAIT_HELPER__
const confirm=()=>confirmed;
const markMasterErrorReviewed=async id=>{
 acknowledged.push(id);return true;
};
const refreshMasterErrorInbox=async()=>{
 refreshed++;
 if(acknowledged.length===21){
  errorInbox.pending=[];errorInbox.count=0;
 }
};
__FEATURE__
showMasterErrorInbox();
await new Promise(r=>setTimeout(r,80));
const overlay=document.querySelector('.test-overlay');
const summary=overlay.querySelector('[role=status]');
const reviewAll=[...overlay.querySelectorAll('button')]
 .find(b=>b.textContent.startsWith('Review All ')&&
   b.textContent.includes('Errors'));
let output={pass:false};
try{
 if(!summary.textContent.includes('21 previous software reports')||
    !summary.textContent.includes('NOT failed PPE inspections')||
    !overlay.textContent.includes('Rebel IQ form errors')||
    !overlay.textContent.includes('Rebel IQ form errors · 5')||
    !overlay.textContent.includes('Technical reports (optional)'))
  throw Error('Simplified report count and source summary inaccurate');
 const hidden=overlay.querySelector('details');
 if(!hidden||hidden.open||!hidden.textContent.includes('Automatic error report'))
  throw Error('Technical details were not safely collapsed');
 if(!reviewAll)throw Error('Bulk review option not visible');
 await reviewAll.onclick();
 if(acknowledged.length!==0)throw Error('Unconfirmed bulk acknowledgement modified reports');
 confirmed=true;
 await reviewAll.onclick();
 if(acknowledged.length!==21||
    new Set(acknowledged).size!==21)
  throw Error('Each original report was not acknowledged exactly once');
 if(errorInbox.count!==0)throw Error('Summary did not reload RC count');
 const reviewStatus=[...overlay.querySelectorAll('[role=status]')]
  .find(el=>el.textContent.includes('Reviewed 21 of 21'));
 if(!reviewStatus||!reviewStatus.textContent.includes('Original reports')&&
    !reviewStatus.textContent.includes('No official PPE inspections'))
  throw Error('No visible bulk-review completion feedback');
 if(!messages.some(s=>s.includes('Reviewed 21 of 21 software reports')&&
    s.includes('No official PPE inspections')))
  throw Error('No explicit acknowledgment versus physical check semantics');
 output={pass:true,initialCount:21,acknowledged:21,
  confirmedOnly:true,postCount:errorInbox.count};
}catch(e){output={pass:false,error:String(e.message),acknowledged:acknowledged.length}}
const pre=document.createElement('pre');pre.id='result';
pre.textContent=JSON.stringify(output);document.body.appendChild(pre);
document.body.dataset.errorInboxSmoke=output.pass?'PASS':'FAIL';
})();
`.replace('__FEATURE__',feature).replace('__WAIT_HELPER__',realWait);
const html='<!doctype html><html><body><script>'+script+'</script></body></html>';
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'vector-error-inbox-'));
try{
 const f=path.join(tmp,'test.html');fs.writeFileSync(f,html);
 const r=spawnSync(browser,['--headless=new','--no-first-run',
  '--disable-background-networking','--disable-extensions','--disable-gpu',
  '--user-data-dir='+path.join(tmp,'profile'),
  '--virtual-time-budget=6500','--dump-dom','file:///'+f.replace(/\\/g,'/')],{
  encoding:'utf8',timeout:25000,maxBuffer:6*1024*1024,windowsHide:true
 });
 if(r.error)throw r.error;
 const state=r.stdout.match(/data-error-inbox-smoke="([^"]+)"/)?.[1];
 const detail=r.stdout.match(/<pre id="result">([^<]+)<\/pre>/)?.[1];
 console.log('ERROR_INBOX_BROWSER_SMOKE='+state);
 console.log(detail?.replaceAll('&quot;','"')||'no result');
 assert.equal(state,'PASS',detail||r.stderr.slice(-1200));
}finally{fs.rmSync(tmp,{recursive:true,force:true})}
