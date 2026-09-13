'use strict';

const assert = require('node:assert/strict');

const anchor = '2026-09-10';
function dayDiff(date) {
  const a = new Date(`${anchor}T12:00:00Z`);
  const b = new Date(`${date}T12:00:00Z`);
  return Math.round((b - a) / 86400000);
}
function cShiftDay(date) {
  const mod = ((dayDiff(date) % 6) + 6) % 6;
  return mod === 0 ? 1 : mod === 1 ? 2 : null;
}

assert.equal(cShiftDay('2026-09-10'), 1);
assert.equal(cShiftDay('2026-09-11'), 2);
assert.equal(cShiftDay('2026-09-12'), null);
assert.equal(cShiftDay('2026-09-16'), 1);
assert.equal(cShiftDay('2026-02-18'), 1);
assert.equal(cShiftDay('2026-02-17'), null);
assert.equal(cShiftDay('2026-02-13'), 2);

console.log('c-shift-calendar-fixtures: PASS');
