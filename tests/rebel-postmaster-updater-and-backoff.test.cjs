const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.resolve(__dirname,'../beta/rebel-postmaster.user.js'),'utf8');
const updateJs=source.split('function openManagedUpdate(){')[1].split('\nconst REBEL_SYMBOL_HTML=')[0];
const apiJs=source.split('function apiOnce(')[1].split('\nconst request=')[0];
const installerUrl='https://raw.githubusercontent.com/michaelbartbrion-cmd/mission-vector-check-it/main/beta/rebel-postmaster.user.js';

function launch(open){
  let calls=[],copies=[],renders=0;
  const state={msg:'',kind:''};
  const context={MANAGED_UPDATE_URL:installerUrl, GM_openInTab:(u,opts)=>{calls.push({u,opts});return open(u,opts)},GM_setClipboard:(...v)=>copies.push(v),state,render:()=>renders++};
  vm.runInNewContext('function openManagedUpdate(){'+updateJs,context);
  vm.runInNewContext('openManagedUpdate()',context);
  return {calls,copies,renders,state};
}
function bridge(responses){
  let calls=[],delays=[],traces=[];
  const context={
    cfg:()=>({endpoint:'https://base44.app/authorized',deviceId:'test-device',token:'test-token'}),
    DEFAULT_ENDPOINT:'https://base44.app/authorized',
    clean:x=>String(x||'').trim(),
    trace:(...args)=>traces.push(args),
    wait:async m=>{delays.push(m)},
    GM_xmlhttpRequest:o=>{calls.push(o);const next=responses.shift();if(!next)throw Error('Exceeded response fixture');
      if(next.kind==='timeout')o.ontimeout();
      else if(next.kind==='network')o.onerror();
      else o.onload({status:next.status,responseText:JSON.stringify(next.body||{})});}
  };
  vm.runInNewContext('function apiOnce('+apiJs,context);
  return {run:()=>vm.runInNewContext("api('POST',{mailboxId:'fixture',folderId:'fixture-folder'})",context),calls,delays,traces};
}

test('Update opens real managed raw .user.js installer, not broken Tampermonkey utilities',()=>{
 const r=launch(()=>({close(){}}));
 assert.equal(r.calls.length,1);
 assert.equal(r.calls[0].u,installerUrl);
 assert.equal(r.calls[0].opts.active,true);
 assert.equal(r.copies.length,0);
 assert.equal(r.state.kind,'info');
 assert.match(r.state.msg,/Install or Reinstall/);
 assert.equal(r.renders,1);
});
test('blocked installer gives manual raw URL fallback instead of claiming success',()=>{
 const r=launch(()=>null);
 assert.equal(r.calls.length,1);
 assert.equal(r.copies.length,1);
 assert.equal(r.copies[0][0],installerUrl);
 assert.equal(r.state.kind,'error');
 assert.match(r.state.msg,/Could not open/);
});
test('only explicit HTTP 429 rate limit retries and preserves unchanged batch payload',async()=>{
 const h=bridge([{status:429,body:{error:'Rate limit exceeded'}},{status:429,body:{error:'Rate limit exceeded'}},{status:200,body:{ok:true,accepted:true}}]);
 const out=await h.run();
 assert.equal(out.accepted,true);
 assert.equal(h.calls.length,3);
 assert.deepEqual(h.delays,[2000,4000]);
 assert.equal(h.calls[0].data,h.calls[1].data);
 assert.equal(h.calls[1].data,h.calls[2].data);
 assert.equal(h.traces.length,2);
});
test('HTTP 401 never retries and never claims connection',async()=>{
 const h=bridge([{status:401,body:{error:'Unauthorized'}}]);
 await assert.rejects(h.run(),/Unauthorized/);
 assert.equal(h.calls.length,1);assert.equal(h.delays.length,0);
});
test('ambiguous network failure never repeats a potentially accepted POST',async()=>{
 const h=bridge([{kind:'timeout'}]);
 await assert.rejects(h.run(),/Network timeout/);
 assert.equal(h.calls.length,1);assert.equal(h.delays.length,0);
});
test('repeated rate limits stop after four bounded attempts',async()=>{
 const h=bridge(Array.from({length:4},()=>({status:429,body:{error:'Rate limit exceeded'}})));
 await assert.rejects(h.run(),/Rate limit exceeded/);
 assert.equal(h.calls.length,4);
 assert.deepEqual(h.delays,[2000,4000,8000]);
});
test('source retains canonical logo, only authorized endpoint and read-only policy',()=>{
 assert.match(source,/@version\s+1\.2\.16/);
 assert.match(source,/const VERSION='rebel-postmaster-1\.2\.16'/);
 assert.match(source,/v1\.2\.16 · read-only Outlook collector/);
 assert.match(source,/const REBEL_SYMBOL_HTML="<img/);
 assert.match(source,/data:image\/png;base64/);
 assert.doesNotMatch(source,/\.click\(\).*sendMessage/);
});
