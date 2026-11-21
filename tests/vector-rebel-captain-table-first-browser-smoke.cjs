'use strict';
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawnSync}=require('node:child_process'),assert=require('node:assert/strict');
const src=fs.readFileSync(path.join(__dirname,'../beta/vector-rebel.user.js'),'utf8');
const first=src.indexOf('        // Keep the actual per-person PPE history chart immediately visible.');
const last=src.indexOf('        const footer = document.createElement(',first);
assert.ok(first>0&&last>first);
const feature=src.slice(first,last);
const browser=[process.env.CHROME_PATH,
 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
].filter(Boolean).find(fs.existsSync);
if(!browser){console.log('CAPTAIN_TABLE_FIRST_BROWSER_SMOKE=SKIP');process.exit(0)}
const js=[
 '(()=>{',
 'const overlay=document.createElement("div"),box=document.createElement("div");',
 'overlay.appendChild(box);document.body.appendChild(overlay);',
 'const title=document.createElement("h2");title.textContent="Daily Captain Check";',
 'const sub=document.createElement("div");sub.textContent="Long text: all tour rules";',
 'const current=document.createElement("section");current.textContent="CURRENT TOUR detail table";',
 'const summary=document.createElement("div");summary.textContent="PAST TOUR MISSING";',
 'const attendance=document.createElement("section");attendance.textContent="Scout attendance";',
 'const tableWrap=document.createElement("div");tableWrap.id="native-chart";',
 'tableWrap.textContent="ORIGINAL PERSON-BY-ITEM TWO-MONTH GRID";',
 'box.append(title,sub,current,summary,attendance,tableWrap);',
 'const months=["2026-10","2026-11"],completedTours=61,failedTours=0,missingTours=104,pendingTours=3;',
 'const pulse={workingToday:6};',
 'const displayMonthKey=x=>x==="2026-10"?"October 2026":"November 2026";',
 'let corrected=0;',
 'const makeButton=label=>{const b=document.createElement("button");b.textContent=label;return b};',
 'const showCaptainDailySetPicker=()=>corrected++;',
 '__FEATURE__',
 'let pass=false,error="";',
 'try{',
 'const nodes=[...box.children],detail=nodes[3];',
 'if(nodes[0]!==title||nodes[1]?.getAttribute("data-captain-chart-summary")!=="1"||',
 'nodes[2]!==tableWrap||detail?.getAttribute("data-captain-audit-details")!=="1")',
 'throw Error("History chart not first after a concise summary");',
 'if(detail.open||!detail.textContent.includes("Scout attendance")||',
 '!detail.textContent.includes("CURRENT TOUR")||!detail.textContent.includes("PAST TOUR MISSING"))',
 'throw Error("Earlier diagnostics not collapsed beneath history chart");',
 'if(!nodes[1].textContent.includes("October 2026 + November 2026")||',
 '!nodes[1].textContent.includes("61 recorded"))throw Error("Compact counts missing");',
 'const btn=nodes[1].querySelector("button");if(!btn)throw Error("Crew correction missing");',
 'btn.click();if(corrected!==1)throw Error("Crew correction failed");',
 'pass=true;',
 '}catch(e){error=e.message}',
 'document.body.dataset.captainTableFirst=pass?"PASS":"FAIL";',
 'const pre=document.createElement("pre");pre.id="result";',
 'pre.textContent=JSON.stringify({pass,error});document.body.appendChild(pre);',
 '})();'
].join('\n').replace('__FEATURE__',feature);
const html='<!doctype html><html><body><script>'+js+'</script></body></html>';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'vr-captain-grid-'));
try{
 const p=path.join(dir,'view.html');fs.writeFileSync(p,html);
 const r=spawnSync(browser,['--headless=new','--no-first-run','--disable-gpu',
  '--disable-background-networking','--disable-extensions',
  '--user-data-dir='+path.join(dir,'profile'),'--virtual-time-budget=1200',
  '--dump-dom','file:///'+p.replace(/\\/g,'/')],{
  encoding:'utf8',timeout:25000,maxBuffer:6*1024*1024,windowsHide:true
 });
 if(r.error)throw r.error;
 const status=r.stdout.match(/data-captain-table-first="([^"]+)"/)?.[1]||'UNKNOWN';
 const detail=r.stdout.match(/<pre id="result">([^<]+)<\/pre>/)?.[1]||'missing';
 console.log('CAPTAIN_TABLE_FIRST_BROWSER_SMOKE='+status);
 console.log(detail.replaceAll('&quot;','"'));
 assert.equal(status,'PASS',detail+r.stderr.slice(-800));
}finally{fs.rmSync(dir,{recursive:true,force:true})}
