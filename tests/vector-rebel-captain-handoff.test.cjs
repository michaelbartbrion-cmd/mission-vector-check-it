'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const src = fs.readFileSync(path.join(__dirname, '../beta/vector-rebel.user.js'), 'utf8');
const key = 'vectorRebelCaptainDailyDeferred_v1';
const extract = (first, after) => {
    const start = src.indexOf('    ' + first);
    const end = src.indexOf('    ' + after, start + 1);
    assert.ok(start >= 0 && end > start, first + ' not found');
    return src.slice(start, end);
};
const consumeSource = extract('function consumeQueuedCaptainDailyAfterVerifiedRun(run, now = Date.now()) {',
    'async function launchCaptainDailyCheckFromAnywhere() {');
function makeConsumer(saved) {
    let removed = 0;
    const fn = new Function('loadJSON', 'persistentRemoveRaw', 'CAPTAIN_DAILY_DEFERRED_KEY',
        consumeSource + '\nreturn consumeQueuedCaptainDailyAfterVerifiedRun;')(
            k => { assert.equal(k, key); return saved; },
            k => { assert.equal(k, key); removed += 1; },
            key);
    return { run: fn, removed: () => removed };
}
test('Queued read-only Captain audit is consumed only for matching completed run', () => {
    const pending = {runId:'ppe-A', queuedAt:'2026-10-22T21:00:00.000Z'};
    const h = makeConsumer(pending);
    assert.equal(h.run({runId:'ppe-B'}, Date.parse('2026-10-22T21:01:00Z')), false);
    assert.equal(h.removed(), 0);
    assert.equal(h.run({runId:'ppe-A'}, Date.parse('2026-10-22T21:01:00Z')), true);
    assert.equal(h.removed(), 1);
});
test('Stale, future and malformed queue records cannot automatically open audit', () => {
    for (const now of ['2026-10-22T20:59:00Z','2026-10-22T22:01:00Z']) {
        const h = makeConsumer({runId:'ppe-A',queuedAt:'2026-10-22T21:00:00Z'});
        assert.equal(h.run({runId:'ppe-A'}, Date.parse(now)),false);
        assert.equal(h.removed(),1);
    }
    const invalid = makeConsumer({runId:'ppe-A',queuedAt:'garbage'});
    assert.equal(invalid.run({runId:'ppe-A'}, Date.now()),false);
    assert.equal(invalid.removed(),1);
});
test('Clicking Daily Captain during an active run defers without navigating or clearing inspection', async () => {
    const launcher = extract('async function launchCaptainDailyCheckFromAnywhere() {',
        'async function startCaptainDailyCheck(set, auditAsOfDate) {');
    let queued = null, message = '';
    const launch = new Function('getRun','saveJSON','setStatus',
        'CAPTAIN_DAILY_DEFERRED_KEY', launcher + '\nreturn launchCaptainDailyCheckFromAnywhere;')(
        () => ({runId:'ppe-running',phase:'submitted'}),
        (k,v) => {assert.equal(k,key);queued=v;},
        v=> {message=v;},key);
    await launch();
    assert.equal(queued.runId,'ppe-running');
    assert.ok(Number.isFinite(Date.parse(queued.queuedAt)));
    assert.match(message,/queued/);
});
test('Stopped inspection is never silently discarded or deferred', async () => {
    const launcher = extract('async function launchCaptainDailyCheckFromAnywhere() {',
        'async function startCaptainDailyCheck(set, auditAsOfDate) {');
    let queued = false, message = '';
    const launch = new Function('getRun','saveJSON','setStatus',
        'CAPTAIN_DAILY_DEFERRED_KEY', launcher + '\nreturn launchCaptainDailyCheckFromAnywhere;')(
        () => ({runId:'ppe-stopped',phase:'stopped'}),
        () => {queued=true;},v=> {message=v;},key);
    await launch();
    assert.equal(queued,false);
    assert.match(message,/stopped and needs review/);
});
test('Verified completion opens queued audit only after local archive and clearRun', () => {
    const i = src.indexOf('            const queuedCaptain = consumeQueuedCaptainDailyAfterVerifiedRun(run);');
    const j = src.indexOf('            clearRun();',i);
    const k = src.indexOf('            if (queuedCaptain)',j);
    const l = src.indexOf('setTimeout(() => launchCaptainDailyCheckFromAnywhere()',k);
    assert.ok(i > 0 && j>i && k>j && l>k);
    assert.match(src,/if \(deferred\?\.runId === run\.runId\) persistentRemoveRaw\(CAPTAIN_DAILY_DEFERRED_KEY\)/);
});
test('SCBA preview starts with PASS for each question; inspector can set FAIL and must certify', () => {
    const preview = extract('async function buildPreview(modeKey, ownerInput) {',
        'async function launchMyInspectionFromAnywhere(modeKey) {');
    assert.match(preview, /select\.innerHTML = '<option value="pass">PASS<\/option><option value="fail">FAIL<\/option>'/);
    assert.match(preview, /select\.value = 'pass'/);
    assert.match(preview, /scbaSelects\.map\(select => select\.value\)/);
    assert.match(preview, /scbaAnswers\.some\(value => value === 'fail'\)/);
    assert.match(preview, /SCBA has one or more FAILED checks/);
    assert.match(preview, /if \(!certBox\.checked\)/);
    assert.doesNotMatch(preview, /I physically verified all 7 — mark PASS/);
});
test('A verified archived run cannot be resurrected by stale multi-tab localStorage', () => {
    const getRunSource = extract('function getRun() {','function getRunOwner() {');
    const cases = [
        {same:true, expected:null, tombstoned:true},
        {same:false, expected:'ppe-other', tombstoned:false}
    ];
    for(const item of cases) {
        const raw = {runId:item.same?'ppe-done':'ppe-other',startedAt:'2026-10-22T21:00:00Z',modeKey:'tour',items:[{assetId:'A'},{assetId:'B'}]};
        const summary = {runId:'ppe-done',startedAt:'2026-10-22T21:00:00Z',modeKey:'tour',
            completedAt:'2026-10-22T21:11:00Z',total:2,
            groups:{'Michael Brion':{items:[{assetId:'A'},{assetId:'B'}]}}};
        const writes=[], released=[];
        const getRun = new Function('loadJSON','persistentSetRaw','releaseRunOwnership','RUN_KEY','LAST_SUMMARY_KEY',
            getRunSource + '\nreturn getRun;')(
                k=>k==='run-key'?raw:summary,
                (k,v)=>writes.push([k,v]),()=>released.push(true),'run-key','summary-key');
        const result = getRun();
        assert.equal(result?.runId||null,item.expected);
        assert.deepEqual(writes,item.tombstoned?[['run-key','null']]:[]);
        assert.equal(released.length,item.tombstoned?1:0);
    }
});
test('Never discard an unverified run just because a previous report exists', () => {
    const getRunSource=extract('function getRun() {','function getRunOwner() {');
    const run={runId:'ppe-A',modeKey:'tour',startedAt:'today',items:[{},{}]};
    let tombstoned=false;
    const getRun=new Function('loadJSON','persistentSetRaw','releaseRunOwnership','RUN_KEY','LAST_SUMMARY_KEY',
        getRunSource+'\nreturn getRun;')(
            k=>k==='run-key'?run:{runId:'ppe-A',modeKey:'tour',startedAt:'today',
                completedAt:'today',total:2,groups:{person:{items:[{}]}}},
            ()=>{tombstoned=true;},()=>{},'run-key','summary-key');
    assert.equal(getRun(),run);
    assert.equal(tombstoned,false);
});
test('clearRun leaves a durable JSON null tombstone rather than deleting GM run key', () => {
    const clear=extract('function clearRun() {','function setStatus(message, ok = true) {');
    assert.match(clear,/persistentSetRaw\(RUN_KEY, 'null'\)/);
    assert.doesNotMatch(clear,/persistentRemoveRaw\(RUN_KEY\)/);
});
