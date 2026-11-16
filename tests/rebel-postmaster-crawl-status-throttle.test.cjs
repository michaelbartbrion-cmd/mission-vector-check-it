'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'../beta/rebel-postmaster.user.js'),'utf8');
const start=src.indexOf('const CRAWL_STATUS_MIN_INTERVAL_MS=');
const end=src.indexOf('let crawlAbort=false;',start);
assert.ok(start>=0&&end>start,'find throttle code');
const code=src.slice(start,end);
const s=(folder='A',status='running')=>({mailboxId:'M',folderId:folder,status,seen:['x','y']});
const make=(responder=()=>({workEmailIngestionState:{accepted:true}}))=>{
 let now=10000;const calls=[];
 const request=async(payload)=>{calls.push(payload);return responder(payload,calls.length)};
 const api=new Function('request','statePayload','Date',code+
   '\nreturn reportCrawl;')(request,x=>({workEmailIngestionState:{status:x.status,folder:x.folderId}}),{now:()=>now});
 return {api,calls,advance(ms){now+=ms}};
};
test('first running status is uploaded, subsequent frequent same-folder updates are throttled',async()=>{
 const h=make();
 assert.equal(await h.api(s()),true);
 assert.equal(await h.api(s()),false);
 assert.equal(h.calls.length,1);
 h.advance(29999);
 assert.equal(await h.api(s()),false);
 assert.equal(h.calls.length,1);
 h.advance(1);
 assert.equal(await h.api(s()),true);
 assert.equal(h.calls.length,2);
});
test('different folder or mailbox sends fresh running state immediately',async()=>{
 const h=make();
 await h.api(s('A'));
 assert.equal(await h.api(s('B')),true);
 assert.equal(h.calls.length,2);
 const shifted={...s('B'),mailboxId:'New Mailbox'};
 assert.equal(await h.api(shifted),true);
 assert.equal(h.calls.length,3);
});
test('complete, paused and error transitions always upload without waiting',async()=>{
 const h=make();
 await h.api(s());
 assert.equal(await h.api(s('A','complete')),true);
 assert.equal(await h.api(s('A','paused')),true);
 assert.equal(await h.api(s('A','error')),true);
 assert.equal(h.calls.length,4);
});
test('a rejected or unavailable status does not falsely mark it sent',async()=>{
 const h=make((payload,count)=>{
   if(count===1)throw new Error('Telemetry unavailable');
   if(count===2)return {workEmailIngestionState:{accepted:false}};
   return {workEmailIngestionState:{accepted:true}};
 });
 assert.equal(await h.api(s()),false);
 assert.equal(await h.api(s()),false);
 assert.equal(await h.api(s()),true);
 assert.equal(h.calls.length,3);
 assert.equal(await h.api(s()),false);
});
test('only redundant running-state upload changes; native mailbox never opened or mutated',()=>{
 const batch=src.slice(src.indexOf('async function uploadNewRows('),src.indexOf('async function runFolderSync('));
 assert.match(batch,/const res=await request\(makeCapture\(/);
 assert.match(batch,/saveCrawl\(s\);await reportCrawl\(s\)/);
 assert.doesNotMatch(code,/makeCapture|sendMail|moveMessage|deleteMessage|click\(/);
 assert.match(src,/^\/\/ @version\s+1\.2\.13/m);
 assert.match(src,/const VERSION='rebel-postmaster-1\.2\.13'/);
});
