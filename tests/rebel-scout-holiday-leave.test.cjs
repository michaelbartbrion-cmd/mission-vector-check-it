'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const src=fs.readFileSync(require('node:path').join(__dirname,'../beta/rebel-scout.user.js'),'utf8');
const clean=s=>String(s||'').replace(/\s+/g,' ').trim();
const take=(a,b)=>src.slice(src.indexOf(a),src.indexOf(b,src.indexOf(a)+1));
const a=take('function rowMarker(t){','const GROUP_RE=');
const b=take('function personAndDuty(t){','function hash32(t){');
const helpers=new Function('clean',a+'\n'+b+'\nreturn {rowMarker,looksLikeScheduleRow,personAndDuty}')(clean);
for(const raw of ['Jared Weston - H Holiday Pay [99] 07:00 - 07:00 24 hrs',
 'Jared Weston - H Holiday [99] 07:00 - 07:00 24 hrs',
 'Jared Weston - V Vacation Pay [3] 07:00 - 07:00 24 hrs',
 'Jared Weston - K Kelly Leave [102] 07:00 - 15:00 8 hrs']){
 test('Collect and attribute '+raw.split(' ').slice(3,6).join(' '),()=>{
  assert.equal(helpers.looksLikeScheduleRow(raw),true);
  assert.equal(helpers.personAndDuty(raw).personName,'Jared Weston');
 });
}
test('Source version identifies corrected holiday parser',()=>{
 assert.match(src,/const VERSION='1\.1\.50'/);
 assert.match(src,/range-sync-plan&sourceVersion=/);
});
