'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'../beta/vector-rebel.user.js'),'utf8');
function body(a,b){const i=src.indexOf('    '+a),j=src.indexOf('    '+b,i+1);assert.ok(i>=0&&j>i,'missing function '+a);return src.slice(i,j);}
const questions=[
 'Proper seal while breathing air; no unusual noises/evidence of leaking',
 'Bypass valve checked for damage, flow tested and returned to the off position.',
 'Overall assembly, free from deterioration, dust, and damage',
 'Headnet and Harness: Functions and undamaged. All buckles working properly.',
 'Regulator Connection: All components accounted for; free of wear, cracks, and damage.',
 'Lens: Free of cracks, dirt, and damage.',
 'Heads Up Display (HUD): Operational Check, free of damage, replace batteries as needed.'
];
const clean=x=>String(x??'').trim(), key=x=>clean(x).toLowerCase().replace(/\s+/g,' ');
test('SCBA Face Mask built-in mode contains live-verified pool, template and all seven questions',()=>{
 assert.match(src,/const SCBA_FACE_MASK_POOL = '299947'/);
 assert.match(src,/const SCBA_TOUR_TEMPLATE = '119122'/);
 assert.match(src,/title: 'SCBA Face Mask Tour Checklist'/);
 for(const q of questions)assert.ok(src.includes(q),'question '+q);
});
const gearFn=new Function('clean','masterNameKey','getMode','getPoolType',
  body('async function discoverOwnerGear(owner, modeKey, inventory) {',
   'function getGearSnapshots() {')+'\nreturn discoverOwnerGear;');
const getMode=k=>k==='scbaTour'?{templates:{'299947':'119122'}}:
 {templates:{'300045':'112411'}};
const getType=k=>k==='299947'?'SCBA Face Mask':k==='300045'?'Bunker Coat':'UNKNOWN';
const coat={assetId:'BRION-10237792-FL',pool:'300045',itemId:'1',ownerName:'Michael Brion',status:'In Service',type:'Bunker Coat'};
const mask={assetId:'E004015306F2D8FE',pool:'299947',itemId:'4601226',ownerName:'Michael Brion',status:'In Service',type:'SCBA Face Mask'};
const inv={items:[coat,mask],source:'Vector PPE Responsible Party column',capturedAt:'2026-10-22T19:00:00Z',pageCount:2};
test('Tour includes both bunker PPE and SCBA mask with distinct verified checklist modes',async()=>{
 const get=gearFn(clean,key,getMode,getType);
 const r=await get({name:'Michael Brion'},'tour',inv);
 assert.deepEqual(r.items.map(x=>[x.assetId,x.template,x.inspectionModeKey]),[
  [coat.assetId,'112411','tour'],[mask.assetId,'119122','scbaTour']]);
 assert.deepEqual(r.supplemental,[]);
});
test('Captain Monthly leaves SCBA mask supplemental (no invented Captain SCBA template)',async()=>{
 const get=gearFn(clean,key,getMode,getType);
 const r=await get({name:'Michael Brion'},'captain',inv);
 assert.deepEqual(r.items.map(x=>x.assetId),[coat.assetId]);
 assert.deepEqual(r.supplemental.map(x=>x.assetId),[mask.assetId]);
});
test('Seven SCBA Pass controls are required and clicked exactly once, no Fail controls',async()=>{
 const buttons=n=>Array.from({length:n},()=>({count:0,click(){this.count++;}}));
 const passed=buttons(7),failed=buttons(7),letters=[];
 const el={body:{innerText:questions.join('\n')} ,querySelectorAll:()=>[]};
 const text=x=>String(x??'').replace(/\s+/g,' ').trim();
 const code=body('async function fillLiveForm(run, item) {','function findFailureModalRoot(assetId) {')+'\nreturn fillLiveForm;';
 const fill=new Function('getItemInspectionMode','currentInspection','exactButtons',
 'SCBA_TOUR_QUESTIONS','uiText','document','visible','enabledButton','sleep','getConfig','enterTourCoatComment',code)(
 ()=>({short:'SCBA Face Mask Tour'}),()=>({template:'119122'}),
 label=>label==='Passed'?passed:label==='Failed'?failed:[],
 questions,text,el,()=>true,()=>null,async()=>{},()=>({}),async()=>{});
 await fill({modeKey:'tour'}, {...mask,template:'119122',inspectionModeKey:'scbaTour',
   scbaAnswers:Array(7).fill('pass')});
 assert.deepEqual(passed.map(b=>b.count),Array(7).fill(1));
 assert.deepEqual(failed.map(b=>b.count),Array(7).fill(0));
 await assert.rejects(fill({modeKey:'tour'}, {...mask,template:'119122',
   inspectionModeKey:'scbaTour',scbaAnswers:['fail',...Array(6).fill('pass')]}),/seven physically verified PASS/);
});
test('Incorrect number of SCBA form buttons fails without clicking or submitting',async()=>{
 const code=body('async function fillLiveForm(run, item) {','function findFailureModalRoot(assetId) {')+'\nreturn fillLiveForm;';
 const passed=Array.from({length:6},()=>({count:0,click(){this.count++}}));
 const fill=new Function('getItemInspectionMode','currentInspection','exactButtons',
 'SCBA_TOUR_QUESTIONS','uiText','document','visible','enabledButton','sleep','getConfig','enterTourCoatComment',code)(
 ()=>({short:'SCBA'}),()=>({template:'119122'}),
 ()=>passed, questions,x=>String(x),{body:{innerText:questions.join('\n')},querySelectorAll:()=>[]},
 ()=>true,()=>null,async()=>{},()=>({}),async()=>{});
 await assert.rejects(fill({modeKey:'tour'}, {...mask,template:'119122',inspectionModeKey:'scbaTour',
   scbaAnswers:Array(7).fill('pass')}),/expected exactly seven/);
 assert.deepEqual(passed.map(b=>b.count),Array(6).fill(0));
});
test('SCBA direct inspection starts without a chooser, persisting phase before click',()=>{
 const run=body('async function openInspectionForCurrentAsset(run) {','async function resumeRun() {');
 assert.match(run,/if \(item\.inspectionModeKey === 'scbaTour'\)/);
 assert.match(run,/run\.phase = 'await-live';\s*run\.chooserOpenedAt = Date\.now\(\);\s*saveRun\(run\);\s*startButton\.click\(\)/);
 assert.match(run,/No second click|no second Start Inspection click/i);
});
test('Daily Captain checks SCBA tour history, not a nonexistent Captain monthly mask checklist',()=>{
 const daily=body('async function readCaptainComplianceHistory(item) {',
   'function buildCaptainDailyReport(check) {');
 assert.match(daily,/readModeCompletionHistory\(item, 'scbaTour'\)/);
 assert.match(daily,/notApplicable: true/);
 const start=body('async function startCaptainDailyCheck(set, auditAsOfDate) {',
   'async function resumeCaptainDailyCheck() {');
 assert.match(start,/for \(const mask of found\.supplemental \|\| \[\]\)/);
 assert.match(start,/inspectionModeKey: 'scbaTour'/);
 assert.doesNotMatch(start,/submitInspection/);
});
test('Captain report monthly mask cells are N/A and monthly denominator excludes SCBA',()=>{
 const reportCode=body('function buildCaptainDailyReport(check) {',
  'function showCaptainDailyReport(report = getCaptainDailyReport()) {')+'\nreturn buildCaptainDailyReport;';
 const window={asOfDate:'2026-10-22',months:['2026-09','2026-10'],
 tours:[{startDate:'2026-10-21',endDate:'2026-10-22',month:'2026-10',due:true,eligibleDates:['2026-10-21','2026-10-22']}]};
 const fn=new Function('captainAuditWindow','localTodayKey',reportCode)(()=>window,()=>'2026-10-22');
 const owner={name:'Michael Brion',prefix:'PERSON-123'};
 const items=[{...coat,ownerPrefix:owner.prefix,type:'Bunker Coat'},
 {...mask,ownerPrefix:owner.prefix,type:'SCBA Face Mask',template:'119122',inspectionModeKey:'scbaTour'}];
 const results=items.map(item=>({assetId:item.assetId,ownerPrefix:owner.prefix,
 status:'ok',captain:{dates:['2026-09-02','2026-10-01']},tour:{dates:['2026-10-21']}}));
 const report=fn({owners:[owner],items,results,discovery:[],checkId:'c1',setName:'Crew',setId:'s1'});
 const rows=report.owners[0].items;
 assert.equal(report.schemaVersion,6);
 assert.equal(rows.length,2);
 assert.equal(rows[0].monthlyChecks.filter(x=>x.applicable !== false).length,2);
 assert.equal(rows[1].monthlyChecks.filter(x=>x.applicable !== false).length,0);
 assert.equal(report.owners[0].monthlyRequirementCount,2);
 assert.equal(report.owners[0].tourRequirementCount,2);
 assert.equal(rows[1].tourChecks[0].ok,true);
});
test('SCBA failure in preview explicitly blocks auto-submission and requires manual Vector review',()=>{
 assert.match(src,/SCBA has one or more FAILED checks/);
 assert.match(src,/Finish this SCBA inspection manually in Vector/);
 assert.match(src,/answer all seven SCBA checklist questions/);
});
