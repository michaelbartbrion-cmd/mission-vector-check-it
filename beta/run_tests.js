'use strict';
// Runs cases A–L (plus M, the production layout) against whichever userscript
// build is passed on the command line.

const path = require('path');
const H = require('./harness');
const F = require('./fixtures');

const SCRIPT = process.argv[2];
if (!SCRIPT) { console.error('usage: node run_tests.js <userscript>'); process.exit(2); }

const INSPECTOR = 'Michael Brion';
let pass = 0, fail = 0;
const results = [];

function snapshot(html, modeTitle) {
    const { api, missing } = H.load(SCRIPT, html);
    const snap = api.readItemLogSnapshot({}, modeTitle);
    return { api, snap, missing };
}

function check(id, label, ok, detail) {
    results.push({ id, label, ok, detail });
    if (ok) pass += 1; else fail += 1;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${id}  ${label}`);
    if (detail) console.log(`          ${detail}`);
}

function expectCount(id, label, html, modeTitle, expected) {
    const { snap } = snapshot(html, modeTitle);
    const got = snap === null ? 'null' : snap.count;
    check(id, label, got === expected, `expected ${expected} rows, parser returned ${got}` +
        (snap && snap.parserPath ? ` (path: ${snap.parserPath})` : ''));
    return snap;
}

function addedBetween(beforeHtml, afterHtml, modeTitle) {
    const b = snapshot(beforeHtml, modeTitle).snap;
    const a = snapshot(afterHtml, modeTitle);
    if (!b || !a.snap) return { before: b, after: a.snap, added: null };
    const added = a.api.itemLogSnapshotAddedRecords
        ? a.api.itemLogSnapshotAddedRecords(b.keys, a.snap).addedKeys
        : a.api.itemLogSnapshotAddedKeys(b.keys, a.snap.keys);
    return { before: b, after: a.snap, added, api: a.api };
}

function confirms(beforeHtml, afterHtml, modeTitle) {
    const r = addedBetween(beforeHtml, afterHtml, modeTitle);
    if (!r.before || !r.after || !r.added) return { ok: false, why: 'unreadable' };
    if (r.after.count !== r.before.count + 1) {
        return { ok: false, why: `count ${r.before.count} -> ${r.after.count}` };
    }
    if (r.added.length !== 1) return { ok: false, why: `added ${r.added.length}` };
    const key = typeof r.added[0] === 'string' ? r.added[0] : r.added[0].key;
    const idx = r.after.keys.indexOf(key);
    const text = r.after.texts[idx] || '';
    const ok = r.api.uiIncludes(text, INSPECTOR) &&
        r.api.uiIncludes(text, modeTitle) &&
        /\bCOMPLETED?\b/i.test(text) && !/\bINCOMPLETE\b/i.test(text);
    return { ok, why: `count ${r.before.count} -> ${r.after.count}, added 1, row "${text.slice(0, 60)}"` };
}

console.log(`\n=== Item Log parser suite — ${path.basename(SCRIPT)} ===\n`);

const sanity = H.load(SCRIPT, '<div></div>');
if (sanity.missing.length) {
    console.log(`(functions not present in this build: ${sanity.missing.join(', ')})\n`);
}

const B = F.BASE_TOUR;

// A. semantic table
expectCount('A', 'semantic table rows', F.semanticTable(B), F.TOUR, 5);

// B. ARIA grid
expectCount('B', 'ARIA grid rows', F.ariaGrid(B), F.TOUR, 5);

// C. nested div rows with sibling cells
expectCount('C', 'nested div rows, sibling cells', F.divRows(B), F.TOUR, 5);

// D. notes cell with title + COMPLETE on separate lines
expectCount('D', 'notes split over lines', F.divRowsSplitNotes(B), F.TOUR, 5);

// E. duplicate identical same-day rows
{
    const dup = B.concat([F.row('09/10/2026', INSPECTOR, F.TOUR)]);
    const snap = expectCount('E', 'duplicate identical same-day rows', F.divRows(dup), F.TOUR, 6);
    if (snap) {
        check('E2', 'duplicates keep distinct keys',
            new Set(snap.keys).size === snap.keys.length,
            `keys: ${snap.keys.length}, distinct: ${new Set(snap.keys).size}`);
    }
}

// F. rows from another inspector still count toward the mode total
{
    const mixed = B.concat([F.row('09/09/2026', 'Dana Whitfield', F.TOUR)]);
    expectCount('F', 'another inspector counted in total', F.divRows(mixed), F.TOUR, 6);
}

// G. Captain's smart apostrophe
{
    const cap = [
        F.row('08/01/2026', INSPECTOR, F.CAPTAIN_SMART),
        F.row('09/01/2026', INSPECTOR, F.CAPTAIN_SMART)
    ];
    expectCount('G', "Captain's smart apostrophe (U+2019 DOM vs U+0027 config)",
        F.divRows(cap), F.CAPTAIN_PLAIN, 2);
}

// H. no new row -> must not confirm
{
    const html = F.divRows(B);
    const r = confirms(html, html, F.TOUR);
    check('H', 'no new row does not confirm', r.ok === false, r.why);
}

// I. exactly one new row -> confirms
{
    const after = [F.row('09/11/2026', INSPECTOR, F.TOUR)].concat(B);
    const r = confirms(F.divRows(B), F.divRows(after), F.TOUR);
    check('I', 'exactly one new row confirms', r.ok === true, r.why);
}

// I2. new row identical to an existing same-day row -> still confirms
{
    const before = [F.row('09/11/2026', INSPECTOR, F.TOUR)].concat(B);
    const after = [F.row('09/11/2026', INSPECTOR, F.TOUR)].concat(before);
    const r = confirms(F.divRows(before), F.divRows(after), F.TOUR);
    check('I2', 'identical same-day new row confirms', r.ok === true, r.why);
}

// J. two new rows -> must not confirm
{
    const after = [F.row('09/11/2026', INSPECTOR, F.TOUR), F.row('09/11/2026', 'Dana Whitfield', F.TOUR)].concat(B);
    const r = confirms(F.divRows(B), F.divRows(after), F.TOUR);
    check('J', 'two new rows do not confirm', r.ok === false, r.why);
}

// K. lazy render from zero to populated
{
    const empty = snapshot(F.lazyEmpty(), F.TOUR).snap;
    const emptyOk = empty === null || empty.count === 0;
    check('K', 'lazy-render empty state readable or explicitly unavailable', emptyOk,
        `empty snapshot: ${empty === null ? 'null (unavailable)' : empty.count + ' rows'}`);
    const r = confirms(F.lazyEmpty(), F.divRows([F.row('09/11/2026', INSPECTOR, F.TOUR)]), F.TOUR);
    check('K2', 'lazy 0 -> 1 confirms', r.ok === true, r.why);
}

// L. unrelated page text with the same inspection title must not be counted
{
    const snap = snapshot(F.PAGE_CHROME, F.TOUR).snap;
    const got = snap === null ? 0 : snap.count;
    check('L', 'Schedule Inspections cards not counted as history', got === 0,
        `parser returned ${got} rows from page chrome alone`);
}

// M. PRODUCTION layout: table/grid container without th/columnheader headers
{
    const snap = expectCount('M', 'table markup without <th> (production shape)',
        F.tableWithoutTh(B), F.TOUR, 5);
    if (snap) {
        const after = [F.row('09/11/2026', INSPECTOR, F.TOUR)].concat(B);
        const r = confirms(F.tableWithoutTh(B), F.tableWithoutTh(after), F.TOUR);
        check('M2', 'production shape confirms one new row', r.ok === true, r.why);
    } else {
        check('M2', 'production shape confirms one new row', false, 'baseline unreadable');
    }
}

console.log(`\n---- ${pass} passed, ${fail} failed ----\n`);
process.exit(fail ? 1 : 0);
