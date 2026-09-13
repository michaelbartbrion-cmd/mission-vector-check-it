'use strict';

const assert = require('node:assert/strict');

const anchor = '2026-09-10';
function parseDate(date) { return new Date(`${date}T12:00:00Z`); }
function fmt(d) { return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`; }
function addDays(date,n) { const d=parseDate(date); d.setUTCDate(d.getUTCDate()+n); return fmt(d); }
function dayDiff(date) { return Math.round((parseDate(date)-parseDate(anchor))/86400000); }
function isCShift(date) { const mod=((dayDiff(date)%6)+6)%6; return mod===0||mod===1; }
function isOffShift(date) { return !isCShift(date); }
function previousOffShift(date) { let d=addDays(date,-1); for(let i=0;i<6;i++){ if(isOffShift(d)) return d; d=addDays(d,-1); } return null; }
function count(start,end,predicate){ let n=0,d=end; while(d>=start){ if(predicate(d))n++; d=addDays(d,-1); } return n; }

assert.equal(isCShift('2026-09-10'), true);
assert.equal(isCShift('2026-09-11'), true);
assert.equal(isOffShift('2026-09-12'), true);
assert.equal(isOffShift('2026-09-15'), true);
assert.equal(isCShift('2026-09-16'), true);
assert.equal(previousOffShift('2026-09-11'), '2026-09-09');
assert.equal(previousOffShift('2026-09-10'), '2026-09-09');
assert.equal(previousOffShift('2026-09-16'), '2026-09-15');
assert.equal(previousOffShift('2026-02-18'), '2026-02-17');
assert.equal(count('2025-09-30','2026-09-11',isCShift),116);
assert.equal(count('2025-09-30','2026-09-11',isOffShift),231);

console.log('offshift-archive-fixtures: PASS');
