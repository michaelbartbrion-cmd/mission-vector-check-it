'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../beta/rebel-scout.user.js'),'utf8');
const start=source.indexOf('function compareScoutVersions(');
const end=source.indexOf('const REBEL_SYMBOL_HTML=',start);
assert.ok(start>=0 && end>start,'source exposes in-controller update handler');
const functions=source.slice(start,end);
function harness({reply='// ==UserScript==\n// @version      1.1.50\n// ==/UserScript==',status=200,fail='',installed='1.1.50'}={}){
 const state={open:false},saved=[],messages=[],requests=[];
 const GM_xmlhttpRequest=opts=>{
   requests.push(opts);
   queueMicrotask(()=>{
     if(fail==='network')opts.onerror();
     else if(fail==='timeout')opts.ontimeout();
     else opts.onload({status,responseText:reply});
   });
 };
 const api=new Function('core','GM_xmlhttpRequest','state','set','saveStatus','VERSION','clean',
   functions+'\nreturn {compareScoutVersions,fetchLatestScoutVersion,checkForScoutUpdate};')(
   {managedUpdateUrl:'https://raw.githubusercontent.com/michaelbartbrion-cmd/mission-vector-check-it/main/beta/rebel-scout.user.js'},
   GM_xmlhttpRequest,state,(k,v)=>saved.push([k,v]),(m,kind)=>messages.push({m,kind}),
   installed,String
 );
 return {state,saved,messages,requests,api};
}
test('version comparison handles semver components numerically',()=>{
 const {api}=harness();
 assert.equal(api.compareScoutVersions('1.1.46','1.1.45'),1);
 assert.equal(api.compareScoutVersions('1.1.9','1.1.10'),-1);
 assert.equal(api.compareScoutVersions('1.2.0','1.1.99'),1);
 assert.equal(api.compareScoutVersions('1.1.46','1.1.46'),0);
});
test('check button fetches official source, reads latest version, and displays current state',async()=>{
 const h=harness();
 await h.api.checkForScoutUpdate();
 assert.equal(h.state.open,true);
 assert.deepEqual(h.saved,[['rebelScoutExpandedV1',true]]);
 assert.equal(h.requests.length,1);
 assert.match(h.requests[0].url,/^https:\/\/raw\.githubusercontent\.com\/.*rebel-scout\.user\.js\?check=/);
 assert.equal(h.requests[0].method,'GET');
 assert.match(h.messages[0].m,/Checking GitHub/);
 assert.match(h.messages.at(-1).m,/up to date/);
 assert.equal(h.messages.at(-1).kind,'success');
});
test('newer remote release produces an install instruction without silently modifying script',async()=>{
 const h=harness({reply:'// ==UserScript==\n// @version  1.1.51\n// ==/UserScript=='});
 await h.api.checkForScoutUpdate();
 assert.match(h.messages.at(-1).m,/Update available: v1\.1\.51/);
 assert.match(h.messages.at(-1).m,/INSTALL \/ UPDATE MANUALLY/);
});
test('network failure and invalid GitHub content are visible, with manual fallback',async()=>{
 for(const opts of [{fail:'network'},{status:404},{reply:'html not a userscript'}]){
   const h=harness(opts);
   await h.api.checkForScoutUpdate();
   assert.equal(h.messages.at(-1).kind,'error');
   assert.match(h.messages.at(-1).m,/Update check failed/);
   assert.match(h.messages.at(-1).m,/MANUALLY/);
 }
});
test('visible update controls bind to a controller-scope function and HTTPS install link',()=>{
 assert.match(source,/p\.querySelector\('#rs-update'\)\.onclick=checkForScoutUpdate/);
 assert.match(source,/id="rs-install".*href="\$\{esc\(core\.managedUpdateUrl\)\}"/);
 assert.match(source,/target="_blank" rel="noopener noreferrer"/);
 assert.match(source,/\/\/ @connect\s+raw\.githubusercontent\.com/);
 assert.doesNotMatch(source,/chrome-extension:\/\/dhdgffkkebhmkfjojejmpbldmpobfkfo/);
 assert.doesNotMatch(source,/onclick=openManagedUpdate/);
 assert.match(source,/\/\/ @version\s+1\.1\.50/);
});
