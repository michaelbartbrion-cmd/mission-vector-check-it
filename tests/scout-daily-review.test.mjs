import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const script=readFileSync(new URL('../beta/rebel-scout.user.js',import.meta.url),'utf8');
test('daily background watch requests bounded review instead of 30-minute current-day polling',()=>{
  assert.match(script, /@version\s+1\.1\.52/);
  assert.match(script, /SHIFT_WATCH_INTERVAL_MS=24\*60\*60\*1000/);
  assert.match(script, /await startSync\('daily-review'\)/);
  assert.match(script, /mode==='daily-review'\?'&mode=daily-review'/);
  assert.match(script, /last\.date===date&&Number\(last\.successAt\)\)return/);
  assert.match(script, /DAILY STAFFING REVIEW \(THIS TAB\)/);
  assert.doesNotMatch(script,/next check in about 30 minutes/i);
});
test('daily mode survives navigation and records completed and failed runs',()=>{
  assert.match(script,/q=\{schemaVersion:3,mode,operationalDate:/);
  assert.match(script,/syncPlanReliable\('final freshness',q\.mode\|\|'normal'\)/);
  assert.match(script,/recordDailyReview\(q,fail\.length===0&&remain===0/);
  assert.match(script,/SHIFT_WATCH_RETRY_MS=60\*60\*1000/);
});
test('watch is opt-in and never turns on source writing',()=>{
  assert.match(script,/sessionStorage\.setItem\(SHIFT_WATCH_KEY,'on'\)/);
  assert.match(script,/sessionStorage\.removeItem\(SHIFT_WATCH_KEY\)/);
  assert.match(script,/function stopShiftWatch\(\)/);
  assert.match(script,/collectorOnly:true/);
  assert.match(script,/read-only staffing\/OT sync plan/);
});
