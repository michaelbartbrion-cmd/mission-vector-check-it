'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../beta/vector-rebel.user.js'),'utf8');
function part(start,end){
 const a=source.indexOf(start),b=source.indexOf(end,a+start.length);
 assert.ok(a>=0&&b>a,'source section '+start);
 return source.slice(a,b);
}
const rules=part("    const CAPTAIN_TOUR_ANCHOR_DATE = '2026-09-22';","    function getCaptainDailyCheck() {");
const windowCode=part('    function inferRegularTourWindow(referenceDate','    function displayHistoryDateKey(');
const auditCode=part('    function captainAuditWindow(asOfDateKey','    function historyEntriesFromSource(');
const dayNumber=date=>Date.parse(date+'T00:00:00Z')/86400000;
const fromDay=day=>new Date(day*86400000).toISOString().slice(0,10);
const addDateKeyDays=(date,days)=>fromDay(dayNumber(date)+days);
const validDateKey=x=> /^\d{4}-\d{2}-\d{2}$/.test(x||'')?x:'';
const today=(date)=>date instanceof Date?date.toISOString().slice(0,10):'2026-11-17';
const priorMonth=date=>{
 const [y,m]=date.split('-').map(Number);
 return new Date(Date.UTC(y,m-2,1)).toISOString().slice(0,7);
};
const api=new Function('clean','addDateKeyDays','utcDayNumber','localTodayKey',
 'validDateKey','previousMonthKey',rules+windowCode+auditCode+
 '\nreturn {inferRegularTourWindow,captainAuditWindow,captainTourAnchorDate,captainShiftLabel};')(
 x=>String(x||'').trim(),addDateKeyDays,dayNumber,today,validDateKey,priorMonth
);
test('authoritative C C A A B B rotation has correct 48/96 tour anchors',()=>{
 assert.equal(api.captainTourAnchorDate('C'),'2026-09-22');
 assert.equal(api.captainTourAnchorDate('A'),'2026-09-24');
 assert.equal(api.captainTourAnchorDate('B'),'2026-09-26');
 assert.equal(api.captainShiftLabel('a'),'A');
 assert.equal(api.captainShiftLabel('unknown'),'C');
});
test('the same calendar day resolves distinct C A B tours without mixing shifts',()=>{
 const ref=new Date('2026-09-26T12:00:00');
 assert.deepEqual(
 ['C','A','B'].map(s=>{
  const t=api.inferRegularTourWindow(ref,s);
  return [s,t.startDate,t.endDate,t.isActiveTour];
 }),
 [['C','2026-09-22','2026-09-23',false],
  ['A','2026-09-24','2026-09-25',false],
  ['B','2026-09-26','2026-09-27',true]]
 );
});
test('monthly Captain audit produces correct shift-specific 2-day dates with six-day repeats',()=>{
 const expected={C:['2026-09-22','2026-09-28'],
 A:['2026-09-24','2026-09-30'],B:['2026-09-26','2026-10-02']};
 for(const shift of ['C','A','B']){
  const w=api.captainAuditWindow('2026-10-02',shift);
  assert.equal(w.shift,shift);
  const starts=w.tours.map(x=>x.startDate);
  for(const day of expected[shift])assert.ok(starts.includes(day),shift+' '+day);
  for(const row of w.tours){
   assert.equal(row.endDate,addDateKeyDays(row.startDate,1));
   assert.deepEqual(row.eligibleDates,[row.startDate,row.endDate]
    .filter(x=>x<='2026-10-02'));
  }
 }
});
test('two-day multi-shift date calculation matches department shift rule at distant date',()=>{
 // Explicitly derived from CrewSense StaffingRule:
 // 2026-01-07 begins C,C,A,A,B,B, repeated every six days.
 const anchor='2026-01-07';
 for(const day of ['2026-09-22','2026-10-07','2026-11-17','2026-12-26']){
  const offset=(dayNumber(day)-dayNumber(anchor))%6;
  const shift=['C','C','A','A','B','B'][offset];
  assert.equal(api.inferRegularTourWindow(new Date(day+'T12:00:00'),shift).isActiveTour,true,
   day+' '+shift);
 }
});
test('Captain Set stores shift and read-only Captain check carries it into every report',()=>{
 const normalization=part('    function normalizeCaptainSets(','    function normalizeCaptainRosterPrefixes(');
 const editor=part('            function renderEditor() {','            newSet.onclick = () => {');
 const picker=part('    function showCaptainDailySetPicker() {','    async function startCaptainDailyMissingRecheck(');
 const runner=part('    async function startCaptainDailyCheck(set, auditAsOfDate)', '    async function resumeCaptainDailyCheck() {');
 const report=part('    function buildCaptainDailyReport(check) {','    function showCaptainHistoricalOffEditor(');
 assert.match(normalization,/shift: \['A','B','C'\]\.includes/);
 assert.match(editor,/setAttribute\('aria-label','Captain Set regular shift'\)/);
 assert.match(editor,/shift:captainShiftLabel\(shiftSelect.value\)/);
 assert.match(editor,/inferRegularTourWindow\(new Date\(date\+'T12:00:00'\),newShift\)/);
 assert.match(picker,/selectedCaptainShift\(\)/);
 assert.match(picker,/captainAuditWindow\(auditDate,selectedCaptainShift\(\)\)/);
 assert.match(picker,/inferRegularTourWindow\(new Date\(date\+'T12:00:00'\),selectedCaptainShift\(\)\)/);
 assert.match(picker,/shift:selectedCaptainShift\(\)/);
 assert.match(runner,/captainAuditWindow\(validAuditDate,shift\)/);
 assert.match(runner,/setName: set.name,\s*shift,/);
 assert.match(report,/captainAuditWindow\(check.auditAsOfDate \|\| localTodayKey\(\),shift\)/);
 assert.match(report,/setName: check.setName,\s*shift,/);
});
test('User view does not render Master List button and Master retains it',()=>{
 const panel=part('    function renderPanelInterface(){','    function installPanel() {');
 const user=panel.slice(0,panel.indexOf('if(master){'));
 const master=panel.slice(panel.indexOf('if(master){'));
 assert.doesNotMatch(user,/make\('Master List'/);
 assert.match(master,/make\('Master List',showSharedMasterList\)/);
});

test('Scout attendance distinguishes verified full-tour off from partial leave or any-unit work on A/B shifts',()=>{
 const fn=part('    function captainScoutTourDuty(owner,tour,auditWindow,records) {',
   '    function captainIsTemporarySwing(owner, roster) {');
 const evaluate=new Function('masterNameKey','captainHistoricalTourEnded',fn+
   '\nreturn captainScoutTourDuty;')(
    name=>String(name||'').toLowerCase(),()=>true
 );
 const owner={name:'Example Firefighter',prefix:'PERSON-EXAMPLE'};
 for(const shift of ['A','B']){
  const first=api.captainTourAnchorDate(shift),second=addDateKeyDays(first,1);
  const tour={startDate:first,endDate:second,due:true};
  const record=(date,status,quality='good_direct_capture')=>
    ({name:owner.name,date,status,sourceQuality:quality});
  const wholeOff=evaluate(owner,tour,{},[
    record(first,'full_leave_evidence'),record(second,'deployment_evidence')]);
  assert.equal(wholeOff.off,true,shift+' both-days verified leave');
  assert.equal(wholeOff.due,false);
  const worked=evaluate(owner,tour,{},[
    record(first,'work_evidence'),record(second,'full_leave_evidence')]);
  assert.equal(worked.due,true,shift+' any day of work means required');
  assert.equal(worked.off,false);
  const partial=evaluate(owner,tour,{},[
    record(first,'full_leave_evidence')]);
  assert.equal(partial.unknown,true,shift+' missing second day must not be called OFF');
  assert.equal(partial.off,false);
  const lowConfidence=evaluate(owner,tour,{},[
    record(first,'full_leave_evidence','unknown'),
    record(second,'full_leave_evidence')]);
  assert.equal(lowConfidence.unknown,true,shift+' lower-quality evidence must not prove off');
 }
});
