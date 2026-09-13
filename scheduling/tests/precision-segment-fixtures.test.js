'use strict';

const assert = require('node:assert/strict');

const clean = v => String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
const escRe = v => String(v).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function segmentPattern(personName) {
  return new RegExp(
    `${escRe(personName)}\\s+(.{0,260}?)(\\d{1,2}:\\d{2})\\s*-\\s*(\\d{1,2}:\\d{2})\\s+(\\d+(?:\\.\\d+)?)\\s*hrs?(?:\\s+(\\d+)\\s*min)?\\b`,
    'ig'
  );
}

function extract(personName, context) {
  const re = segmentPattern(personName);
  const rows = [];
  let m;
  while ((m = re.exec(clean(context)))) {
    rows.push({
      details: clean(m[1]),
      start: m[2],
      end: m[3],
      hours: Number(m[4]) + Number(m[5] || 0) / 60,
    });
  }
  return rows;
}

// Real structural pattern observed in the 2026-02-18 ListView capture.
// Names/codes/times are preserved because the purpose of this fixture is to
// prevent regression on multiple same-person duty segments and SWING+TM text.
const context = `Truck 504 5 / 5
Michael Brion TAC Capt S Salary Step [1010] 07:00 - 12:30 5 hrs 30 min
Christopher Blair Capt S Salary Step [1010] 12:30 - 18:00 5 hrs 30 min
Michael Baldree Capt S Salary Step [1010] 18:00 - 07:00 13 hrs
Jared Weston FFB S Salary Step [1010] 07:00 - 07:00 24 hrs
Jerry Weems SWING TM S Salary Step [1010] 07:00 - 07:00 24 hrs
Robert Brooks DE S Salary Step [1010] 07:00 - 17:30 10 hrs 30 min
Michael Brion DE S Salary Step [1010] 17:30 - 07:00 13 hrs 30 min
Open Slot DE-A 07:00 - 07:00 24 hrs`;

const brion = extract('Michael Brion', context);
assert.equal(brion.length, 2);
assert.deepEqual(brion.map(x => [x.start, x.end, x.hours]), [
  ['07:00', '12:30', 5.5],
  ['17:30', '07:00', 13.5],
]);

const baldree = extract('Michael Baldree', context);
assert.deepEqual(baldree.map(x => [x.start, x.end, x.hours]), [['18:00', '07:00', 13]]);

const weston = extract('Jared Weston', context);
assert.deepEqual(weston.map(x => [x.start, x.end, x.hours]), [['07:00', '07:00', 24]]);

const weems = extract('Jerry Weems', context);
assert.equal(weems.length, 1);
assert.match(weems[0].details, /SWING\s+TM/);
assert.equal(weems[0].hours, 24);

const brooks = extract('Robert Brooks', context);
assert.deepEqual(brooks.map(x => [x.start, x.end, x.hours]), [['07:00', '17:30', 10.5]]);

// Regression rule: raw SWING text does not by itself establish Swing credit.
// This fixture intentionally contains `SWING TM`; role reconciliation must
// still treat the actual Truck 504 TM seat as Tiller evidence unless a saved
// Swing assignment/legacy credit proves otherwise.

console.log('precision-segment-fixtures: PASS');
