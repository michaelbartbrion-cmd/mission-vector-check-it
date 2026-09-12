const assert = require('assert');
const Horizon = require('./horizon-planner.js');

const ids = ['a','b','c'];
const counts = {
  a: {Firefighter:3, Swing:1, Tiller:0, TADE:5},
  b: {Firefighter:1, Swing:2, Tiller:0, TADE:3},
  c: {Firefighter:4, Swing:2, Tiller:2, TADE:4}
};

const history = [];
for (const id of ids) {
  for (const [credit,n] of Object.entries(counts[id])) {
    for (let i=0; i<n; i++) history.push({personId:id, credit, verified:true});
  }
}

const oneBlock = Horizon.recommendScheduleHorizon({
  history,
  firefighterIds: ids,
  blocks: [{date:'2026-01-01', availableIds:ids, scenario:'normal'}],
  limit: 6
});

assert.deepStrictEqual(oneBlock.firstChoices[0].firstAssignment, {
  a:'Tiller', b:'Firefighter', c:'Swing'
});

const twoBlocks = Horizon.recommendScheduleHorizon({
  history,
  firefighterIds: ids,
  blocks: [
    {date:'2026-01-01', availableIds:ids, scenario:'normal'},
    {date:'2026-01-07', availableIds:['a','b'], scenario:'normal'}
  ],
  limit: 6
});

assert.deepStrictEqual(twoBlocks.firstChoices[0].firstAssignment, {
  a:'Swing', b:'Tiller', c:'Firefighter'
});

const formerlyLocalBest = twoBlocks.firstChoices.find(x =>
  x.firstAssignment.a === 'Tiller' &&
  x.firstAssignment.b === 'Firefighter' &&
  x.firstAssignment.c === 'Swing'
);
assert(formerlyLocalBest);
assert(twoBlocks.firstChoices[0].finalScore < formerlyLocalBest.finalScore);

const fixed = Horizon.optionsForBlock({
  availableIds: ids,
  scenario: 'normal',
  fixedAssignmentByPerson: {c:'Swing'}
}, ids);
assert.equal(fixed.options.length, 2);
assert(fixed.options.every(o => o.c === 'Swing'));

const withUnplannableDay = Horizon.recommendScheduleHorizon({
  history,
  firefighterIds: ids,
  blocks: [
    {date:'2026-01-01', availableIds:ids, scenario:'normal'},
    {date:'2026-01-07', availableIds:['a'], scenario:'normal'},
    {date:'2026-01-13', availableIds:ids, scenario:'normal'}
  ],
  limit: 1
});
assert.equal(withUnplannableDay.recommendations[0].skipped.length, 1);

console.log('All Vector Scheduling horizon planner tests passed.');
