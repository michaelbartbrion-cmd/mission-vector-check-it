'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawnSync}=require('node:child_process');
const src=fs.readFileSync(path.join(__dirname,'../beta/rebel-postmaster.user.js'),'utf8').replace('async function stableEmptyFolder(timeout=5200){','window.__fixtureEmpty=hasExplicitEmptyFolderWitness;window.__fixtureNonMail=hasNativeNonMailNotesView;async function stableEmptyFolder(timeout=5200){');
const browser=[process.env.CHROME_PATH,'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe','C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'].filter(Boolean).find(fs.existsSync);
if(!browser)throw Error('A Chromium executable is required for the rendered launcher acceptance test');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'postmaster-logo-smoke-'));
try {
const fixture=`<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'"></head><body><main role="main" aria-label="Offline fixture"><h1>Inbox</h1><div role="tree"><div role="treeitem" aria-selected="true" aria-label="Junk Email" data-folder-name="Junk Email" data-folder-id="fixture-1"><span title="747 items">747</span></div></div><div role="group" aria-label="Message list"><span id="mailListLabel">Message list</span><div role="list" aria-labelledby="mailListLabel" class="Cz7T5"><div role="listitem" id="AgAAA5zpZsgCAAAIy8tVwgAAA0"><div>Example Sender 0</div><div>Sample subject 0</div><div>Sample preview of a work message.</div><div>9:25 AM</div></div><div role="listitem" id="AgAAA5zpZsgCAAAIy8tVwgAAA1"><div>Example Sender 1</div><div>Sample subject 1</div><div>Sample preview of a work message.</div><div>9:25 AM</div></div><div role="listitem" id="AgAAA5zpZsgCAAAIy8tVwgAAA2"><div>Example Sender 2</div><div>Sample subject 2</div><div>Sample preview of a work message.</div><div>9:25 AM</div></div><div role="listitem" id="AgAAA5zpZsgCAAAIy8tVwgAAA3"><div>Example Sender 3</div><div>Sample subject 3</div><div>Sample preview of a work message.</div><div>9:25 AM</div></div><div role="listitem" id="AgAAA5zpZsgCAAAIy8tVwgAAA4"><div>Example Sender 4</div><div>Sample subject 4</div><div>Sample preview of a work message.</div><div>9:25 AM</div></div><div role="listitem" id="AgAAA5zpZsgCAAAIy8tVwgAAA5"><div>Example Sender 5</div><div>Sample subject 5</div><div>Sample preview of a work message.</div><div>9:25 AM</div></div><div role="listitem" id="AgAAA5zpZsgCAAAIy8tVwgAAA6"><div>Example Sender 6</div><div>Sample subject 6</div><div>Sample preview of a work message.</div><div>9:25 AM</div></div><div role="listitem" id="AgAAA5zpZsgCAAAIy8tVwgAAA7"><div>Example Sender 7</div><div>Sample subject 7</div><div>Sample preview of a work message.</div><div>9:25 AM</div></div><div role="listitem" id="AgAAA5zpZsgCAAAIy8tVwgAAA8"><div>Example Sender 8</div><div>Sample subject 8</div><div>Sample preview of a work message.</div><div>9:25 AM</div></div><div role="listitem" id="AgAAA5zpZsgCAAAIy8tVwgAAA9"><div>Example Sender 9</div><div>Sample subject 9</div><div>Sample preview of a work message.</div><div>9:25 AM</div></div></div></div><div role="list" aria-label="Unrelated navigation"><div role="listitem" id="not-a-message-unrelated-long-id">Not a message<br>Menu item</div></div><div role="group" aria-label="Reading Pane"></div></main><script>
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
const pm=window.MVCI_REBEL_POSTMASTER;
const snapshot=pm.snapshot();let rejectedEmptyPane=false;
try{pm.parseOpenMessage()}catch(_){rejectedEmptyPane=true}
const nativeRows=snapshot.messages.length;
const validRows=snapshot.assessment.validRows;
const correctIdentity=snapshot.messages.every((m,i)=>m.messageKey==='outlook:AgAAA5zpZsgCAAAIy8tVwgAAA'+i&&m.subject==='Sample subject '+i);

const frame=()=>new Promise(r=>setTimeout(r,80));
const measure=el=>{const b=el.getBoundingClientRect(),img=el.querySelector('img'),i=img.getBoundingClientRect(),s=getComputedStyle(el);return{button:[b.width,b.height],image:[i.width,i.height],border:s.borderRadius,loaded:img.complete&&img.naturalWidth>0}};
const hit=el=>el.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,composed:true,cancelable:true}));
let orb=root.querySelector('[data-pm-action="toggle"]');if(!orb){hit(root.querySelector('[data-pm-action="close"]'));orb=root.querySelector('[data-pm-action="toggle"]')}
await frame();await frame();const floating=measure(orb);
hit(orb);await frame();await frame();const close=root.querySelector('[data-pm-action="close"]');const header=measure(close);
hit(close);await frame();const reopened=!!root.querySelector('[data-pm-action="toggle"]');
root.querySelector('[data-pm-action="toggle"]').click();await frame();
const keyboardOpened=!!root.querySelector('[data-pm-action="close"]');
const countDiagnostic=root.textContent.includes('native item count: 747');
root.querySelector('[data-pm-action="close"]').click();await frame();
const keyboardClosed=!!root.querySelector('[data-pm-action="toggle"]');
const nativeList=document.querySelector('[aria-label="Message list"]');
nativeList.remove();const observed=document.createElement('div');observed.id='Skip to message list-region';observed.innerHTML='<div id="MailList"><div>Nothing in folder</div><div>Looks empty over here.</div></div>';document.querySelector('main').appendChild(observed);
const nativeEmpty=window.__fixtureEmpty();observed.id='unrelated-region';const unrelatedEmpty=window.__fixtureEmpty();observed.id='Skip to message list-region';observed.style.display='none';const hiddenEmpty=window.__fixtureEmpty();observed.remove();
const folder=document.querySelector('[role="treeitem"]');folder.setAttribute('data-folder-name','Archive');folder.setAttribute('aria-label','Archive');observed.style.display='';observed.id='Skip to message list-region';observed.innerHTML='<div id="MailList"><div>Nothing in Archive</div><div>Clean up your inbox by moving messages to Archive.</div></div>';document.querySelector('main').appendChild(observed);const archiveEmpty=window.__fixtureEmpty();folder.setAttribute('data-folder-name','Notes');folder.setAttribute('aria-label','Notes');const falseArchive=window.__fixtureEmpty();observed.remove();const notes=document.createElement('div');notes.id='Jump to notes list-region';notes.textContent='Notes list';document.querySelector('main').appendChild(notes);const nativeNotes=window.__fixtureNonMail();folder.setAttribute('data-folder-name','Other');const falseNotes=window.__fixtureNonMail();notes.remove();
const pass=nativeEmpty&&!unrelatedEmpty&&!hiddenEmpty&&archiveEmpty&&!falseArchive&&nativeNotes&&!falseNotes&&JSON.stringify(floating.button)==='[54,54]'&&JSON.stringify(header.button)==='[43,43]'&&JSON.stringify(floating.image)==='[39,39]'&&JSON.stringify(header.image)==='[39,39]'&&floating.loaded&&header.loaded&&floating.border==='50%'&&header.border==='50%'&&reopened&&requests===0&&nativeRows===10&&validRows===10&&correctIdentity&&rejectedEmptyPane&&keyboardOpened&&keyboardClosed&&countDiagnostic;
result={pass,floating,header,reopened,requests,nativeRows,validRows,correctIdentity,rejectedEmptyPane,keyboardOpened,keyboardClosed,countDiagnostic,nativeEmpty,unrelatedEmpty,hiddenEmpty,archiveEmpty,falseArchive,nativeNotes,falseNotes};
}catch(e){result={pass:false,error:String(e.message)}}const pre=document.createElement('pre');pre.id='result';pre.textContent=JSON.stringify(result);document.body.appendChild(pre);document.body.dataset.smoke=result.pass?'PASS':'FAIL';
})();
</script></body></html>`;
const f=path.join(tmp,'test.html');fs.writeFileSync(f,fixture);
const r=spawnSync(browser,['--headless=new','--window-size=1440,1200','--no-first-run','--disable-background-networking','--disable-extensions','--disable-gpu','--user-data-dir='+path.join(tmp,'profile'),'--virtual-time-budget=6500','--dump-dom',require('node:url').pathToFileURL(f).href],{encoding:'utf8',timeout:25000,maxBuffer:4*1024*1024,windowsHide:true});
if(r.error)throw r.error;
const state=r.stdout.match(/data-smoke="([^"]+)"/)?.[1];
const detail=r.stdout.match(/<pre id="result">([^<]+)<\/pre>/)?.[1];
console.log('POSTMASTER_LOGO_BROWSER_SMOKE='+state);
console.log(detail||r.stderr.slice(-1000));
assert.equal(state,'PASS',detail||'Rendered acceptance failed');
} finally {fs.rmSync(tmp,{recursive:true,force:true})}
