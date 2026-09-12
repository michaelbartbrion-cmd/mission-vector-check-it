const assert = require('assert');
const Engine = require('./rotation-engine.js');

function approx(a, b, eps = 1e-9) { assert(Math.abs(a - b) < eps, `${a} != ${b}`); }

assert.equal(Engine.normalizeCredit('Swing'), 'Swing');
assert.equal(Engine.normalizeCredit('Swing/FF'), 'Swing');
assert.equal(Engine.normalizeCredit('Swing Sub'), 'Swing');
assert.equal(Engine.normalizeCredit('FF Sub'), 'Firefighter');

const ids = ['a', 'b', 'c'];
const history = [
  {personId:'a', detail:'Firefighter', verified:true},
  {personId:'a', detail:'Swing/FF', verified:true},
  {personId:'a', detail:'Tiller', verified:true},
  {personId:'a', detail:'TADE', verified:true},
  {personId:'b', detail:'Firefighter', verified:true},
  {personId:'b', detail:'Swing', verified:true},
  {personId:'b', detail:'Tiller', verified:true},
  {personId:'b', detail:'TADE', verified:true},
  {personId:'c', detail:'Firefighter', verified:true},
  {personId:'c', detail:'Swing Sub', verified:true},
  {personId:'c', detail:'Tiller', verified:true},
  {personId:'c', detail:'TADE', verified:true}
];
const stats = Engine.statsFromHistory(history, ids);
for (const id of ids) for (const cat of Engine.CREDIT_CATEGORIES) approx(stats[id].ratios[cat], .25);
approx(Engine.fairnessScore(stats, ids), 0);

assert.deepStrictEqual(Engine.roleSetForScenario('normal', 3), ['Firefighter','Tiller','Swing']);
assert.deepStrictEqual(Engine.roleSetForScenario('normal', 2), ['Firefighter','Tiller']);
assert.deepStrictEqual(Engine.roleSetForScenario('tade-required', 3), ['Firefighter','Tiller','TADE']);
assert.deepStrictEqual(Engine.roleSetForScenario('tade-required', 2), ['Tiller','TADE']);

let r = Engine.reconcileFirefighter({
  planCredit:'Swing', apparatusName:'Truck 504',
  observation:{rawText:'Firefighter FFB Truck 504', dutyCode:'FFB', assignment:'Truck 504'}
});
assert.equal(r.status,'verified'); assert.equal(r.detail,'Swing/FF'); assert.equal(r.credit,'Swing');

r = Engine.reconcileFirefighter({
  planCredit:'Swing', apparatusName:'Truck 504',
  observation:{rawText:'Firefighter FFB Engine 503', dutyCode:'FFB', assignment:'Engine 503'}
});
assert.equal(r.status,'verified'); assert.equal(r.detail,'Swing'); assert.equal(r.credit,'Swing');

r = Engine.reconcileFirefighter({
  planCredit:null, apparatusName:'Truck 504',
  observation:{rawText:'Firefighter FFB Truck 504', dutyCode:'FFB', assignment:'Truck 504'}
});
assert.equal(r.status,'needs-review'); assert.equal(r.credit,null);

r = Engine.reconcileFirefighter({planCredit:null, apparatusName:'Truck 504', observation:{rawText:'Firefighter TM Truck 504', dutyCode:'TM', assignment:'Truck 504'}});
assert.equal(r.credit,'Tiller');
r = Engine.reconcileFirefighter({planCredit:null, apparatusName:'Truck 504', observation:{rawText:'Firefighter DE-A Truck 504', dutyCode:'DE-A', assignment:'Truck 504'}});
assert.equal(r.credit,'TADE');

const rec = Engine.recommendAssignments({history, firefighterIds:ids, availableIds:ids, scenario:'normal', limit:3});
assert.equal(rec.recommendations.length, 3);
assert(rec.recommendations[0].score <= rec.recommendations[1].score);

assert.equal(Engine.parseDateFromText('Friday, September 11, 2026'), '2026-09-11');
assert.equal(Engine.detectDutyCode('Engineer DE-A Truck 504'), 'DE-A');
assert.equal(Engine.detectAssignment('Engineer DE-A Truck 504 Salary Step'), 'Truck 504');
assert.equal(Engine.detectShiftFromText('C Shift Day 1'), 'C Shift Day 1');

const rec2 = Engine.recommendAssignments({history, firefighterIds:ids, availableIds:ids, scenario:'normal', limit:1, repeatCount:2});
for (const id of ids) assert.equal(rec2.recommendations[0].stats[id].total, 6);

const dated = [
  {personId:'a', detail:'Firefighter', verified:true, date:'2025-01-01'},
  {personId:'a', detail:'Tiller', verified:true, date:'2026-01-01'}
];
const windowed = Engine.statsFromHistory(dated, ['a'], '2025-09-29', '2027-01-01');
assert.equal(windowed.a.total, 1);
assert.equal(windowed.a.counts.Tiller, 1);
assert.equal(windowed.a.counts.Firefighter, 0);

console.log('All Vector Scheduling engine tests passed.');
