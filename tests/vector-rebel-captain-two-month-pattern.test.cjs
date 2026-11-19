'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'../beta/vector-rebel.user.js'),'utf8');
const begin=src.indexOf('    function showCaptainDailyReport(');
const end=src.indexOf('    function showCaptainDailySetPicker()',begin);
assert.ok(begin>0&&end>begin,'Original two-month native PPE history viewer exists');
const report=src.slice(begin,end);

test('two-month report retains every firefighter, asset and tour date without inferred trends',()=>{
 assert.match(report,/\(report\.owners \|\| \[\]\)\.forEach\(\(owner, ownerIndex\)/);
 assert.match(report,/ownerItems\.forEach\(\(item, itemIndex\)/);
 assert.match(report,/months\.forEach\(\(month, monthIndex\)/);
 assert.match(report,/scheduledTours\.forEach\(headerTour =>/);
 assert.match(report,/makeHead\('PERSON'/);
 assert.match(report,/makeHead\('ITEM'/);
 assert.doesNotMatch(report,/REPEATED MISSING|TWO-MONTH PATTERN|data-captain-ppe-pattern|patternNotice|patternCell/);
});

test('actual native results, unknown history, OFF and open tours remain source-labeled',()=>{
 assert.match(report,/sourceUnreadable=item\.status!=='ok'&&due/);
 assert.match(report,/const pendingTour=due&&!tourFinished/);
 assert.match(report,/const missing=due&&!ok&&!sourceUnreadable&&!dutyUnverified&&tourFinished/);
 assert.match(report,/sourceUnreadable\?'\?':pendingTour\?'…':dutyUnverified\?'\?':due\?'✕'/);
 assert.match(report,/mark\.textContent=ok\?'✓':off\?/);
 assert.match(report,/PPE INVENTORY UNVERIFIED/);
});

test('Captain and BC both offer the same existing two-month audit with no automated scan on opening cached results',()=>{
 const begin=src.indexOf('    function showCShiftPilotBoard(');
 const end=src.indexOf('    let lastInterfaceErrorInboxPoll',begin);
 const board=src.slice(begin,end);
 assert.match(board,/makeButton\('2-Month PPE History'/);
 assert.match(board,/controls\.insertBefore\(history,close\)/);
 assert.match(board,/if\(cached\)\{showCaptainDailyReport\(cached\);return;\}/);
 assert.match(board,/void launchCaptainDailyCheckFromAnywhere\(\)/);
 assert.match(board,/Snapshot only; it may not include inspections performed since/);
});

test('historical report contains no AI scoring, repeat flags or diagnosis',()=>{
 assert.doesNotMatch(src,/captainTwoMonthItemPattern/);
 assert.doesNotMatch(report,/NEEDS REVIEW|ALL DUE TOUR CHECKS COMPLETE|2-month pattern:/);
 assert.match(report,/Audit through/);
});
