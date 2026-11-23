'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../beta/rebel-postmaster.user.js'),'utf8');
function between(a,b){const start=source.indexOf(a),end=source.indexOf(b,start);assert.ok(start>=0&&end>start,'Missing test source');return source.slice(start,end)}
const hint=between('function mailboxHint(){','function currentFolderKey(){');
const matched=source.match(/function mailboxMatches\(s\)\{[^\r\n]+/);
assert.ok(matched,'Missing scope match function');
function context({title='',label='',visibleLabel=true}={}){
 const element={label,visible:visibleLabel};
 const ctx={
  document:{title,querySelectorAll:()=>label?[element]:[]},
  clean:x=>String(x||'').trim(),
  attr:(el,key)=>key==='aria-label'?el.label:'',
  visible:el=>el.visible,
  hash:s=>{let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}return(h>>>0).toString(36)}
 };
 vm.createContext(ctx);
 vm.runInContext(hint+'\n'+matched[0],ctx);
 return ctx;
}
test('account manager label reproduces the existing mailbox ID',()=>{
 const c=context({title:'Mail - Michael Brion - Outlook',label:'Account manager for Michael Brion'});
 assert.equal(c.mailboxHint(),'Account manager for Michael Brion');
 assert.equal(c.mailboxId(),'outlook:1yhbdbn');
 assert.equal(c.mailboxMatches({mailboxId:'outlook:1yhbdbn'}),true);
});
test('folder titles recover the exact same account identity while account button loads',()=>{
 for(const title of ['Mail - Michael Brion - Outlook','Notes - Michael Brion - Outlook','Vector Check It - Michael Brion - Outlook','Inbox - Michael Brion - Outlook - Other']){
  const c=context({title});
  assert.equal(c.mailboxHint(),'Account manager for Michael Brion');
  assert.equal(c.mailboxId(),'outlook:1yhbdbn');
  assert.equal(c.mailboxMatches({mailboxId:'outlook:1yhbdbn'}),true);
 }
});
test('visible canonical account control always wins over an unrelated page title',()=>{
 const c=context({title:'Mail - Different Person - Outlook',label:'Account manager for Michael Brion'});
 assert.equal(c.mailboxId(),'outlook:1yhbdbn');
});
test('unknown Outlook sign-in/loading page never fabricates a mailbox identity',()=>{
 for(const title of ['Outlook','Sign in - Microsoft','Mail','']){
  const c=context({title});
  assert.equal(c.mailboxId(),'');
  assert.equal(c.mailboxMatches({mailboxId:'outlook:1yhbdbn'}),false);
 }
});
test('complete manifest clears stale last_error after genuine folder verification',()=>{
 const part=between('function mailboxManifestPayload(ms){','async function reportMailboxManifest(');
 const ctx={VERSION:'rebel-postmaster-1.2.16',MANIFEST_PROVIDER:'test',mailboxManifestFingerprint:()=> 'digest',mailboxSummary:ms=>({folders:ms.folders.length,complete:ms.folders.filter(f=>f.status==='complete').length,errors:ms.folders.filter(f=>f.status==='error').length,indexed:3})};
 vm.createContext(ctx);vm.runInContext(part,ctx);
 const ms={mailboxId:'outlook:1yhbdbn',status:'complete',lastError:'Old network timeout',folders:[{status:'complete'}]};
 assert.equal(ctx.mailboxManifestPayload(ms).workEmailIngestionState.lastError,'');
 ms.status='complete_with_errors';ms.folders=[{status:'error'}];
 assert.match(ctx.mailboxManifestPayload(ms).workEmailIngestionState.lastError,/Old network timeout/);
});
test('Postmaster never presents the prior mailbox as complete when identity is unverified',()=>{
 assert.match(source,/SCOPE UNVERIFIED/);
 assert.match(source,/VERIFY REQUIRED/);
 assert.match(source,/if\(!mailboxId\(\)\)throw new Error\('Outlook account identity not confirmed/);
 assert.match(source,/@version\s+1\.2\.16/);
});
