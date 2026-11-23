'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawnSync}=require('node:child_process');
const src=fs.readFileSync(path.join(__dirname,'../beta/rebel-postmaster.user.js'),'utf8');
const browser=[process.env.CHROME_PATH,'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe','C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'].filter(Boolean).find(fs.existsSync);
if(!browser)throw Error('A Chromium executable is required for the rendered launcher acceptance test');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'postmaster-logo-smoke-'));
try {
const fixture=`<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'"></head><body><main aria-label="Offline fixture"><h1>Inbox</h1></main><script>
const storage=new Map();let requests=0;
window.GM_getValue=(k,d)=>storage.has(k)?storage.get(k):d;
window.GM_setValue=(k,v)=>storage.set(k,v);
window.GM_deleteValue=k=>storage.delete(k);
window.GM_xmlhttpRequest=()=>{requests++;throw Error('No network permitted in fixture')};
window.GM_openInTab=()=>{throw Error('No external tabs permitted in fixture')};
window.GM_setClipboard=()=>{};
</script><script>${src}</script><script>
(async()=>{let result={pass:false};try{
const root=document.querySelector('#mvci-rebel-postmaster').shadowRoot;
const frame=()=>new Promise(r=>setTimeout(r,80));
const measure=el=>{const b=el.getBoundingClientRect(),img=el.querySelector('img'),i=img.getBoundingClientRect(),s=getComputedStyle(el);return{button:[b.width,b.height],image:[i.width,i.height],border:s.borderRadius,loaded:img.complete&&img.naturalWidth>0}};
const hit=el=>el.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,composed:true,cancelable:true}));
let orb=root.querySelector('[data-pm-action="toggle"]');if(!orb){hit(root.querySelector('[data-pm-action="close"]'));orb=root.querySelector('[data-pm-action="toggle"]')}
await frame();await frame();const floating=measure(orb);
hit(orb);await frame();await frame();const close=root.querySelector('[data-pm-action="close"]');const header=measure(close);
hit(close);await frame();const reopened=!!root.querySelector('[data-pm-action="toggle"]');
const pass=JSON.stringify(floating.button)==='[54,54]'&&JSON.stringify(header.button)==='[43,43]'&&JSON.stringify(floating.image)==='[39,39]'&&JSON.stringify(header.image)==='[39,39]'&&floating.loaded&&header.loaded&&floating.border==='50%'&&header.border==='50%'&&reopened&&requests===0;
result={pass,floating,header,reopened,requests};
}catch(e){result={pass:false,error:String(e.message)}}const pre=document.createElement('pre');pre.id='result';pre.textContent=JSON.stringify(result);document.body.appendChild(pre);document.body.dataset.smoke=result.pass?'PASS':'FAIL';
})();
</script></body></html>`;
const f=path.join(tmp,'test.html');fs.writeFileSync(f,fixture);
const r=spawnSync(browser,['--headless=new','--no-first-run','--disable-background-networking','--disable-extensions','--disable-gpu','--user-data-dir='+path.join(tmp,'profile'),'--virtual-time-budget=6500','--dump-dom',require('node:url').pathToFileURL(f).href],{encoding:'utf8',timeout:25000,maxBuffer:4*1024*1024,windowsHide:true});
if(r.error)throw r.error;
const state=r.stdout.match(/data-smoke="([^"]+)"/)?.[1];
const detail=r.stdout.match(/<pre id="result">([^<]+)<\/pre>/)?.[1];
console.log('POSTMASTER_LOGO_BROWSER_SMOKE='+state);
console.log(detail||r.stderr.slice(-1000));
assert.equal(state,'PASS',detail||'Rendered acceptance failed');
} finally {fs.rmSync(tmp,{recursive:true,force:true})}
