'use strict';
// DOM fixtures modelled on the real Vector asset page shown in
// LATEST_v2.3.8_FAILURE_SCREENSHOT.png and the v2.3.8 production diagnostic.
//
// Real column set: DATE | PERSONNEL | LOCATION TYPE | LOCATION | RESPONSIBLE PARTY | NOTES
// NOTES holds the inspection title and the COMPLETE status.

const TOUR = 'Tour PPE Routine Inspection';
const CAPTAIN_SMART = 'Captain\u2019s Monthly PPE Routine Inspection';   // U+2019
const CAPTAIN_PLAIN = "Captain's Monthly PPE Routine Inspection";       // U+0027
const HEADERS = ['DATE', 'PERSONNEL', 'LOCATION TYPE', 'LOCATION', 'RESPONSIBLE PARTY', 'NOTES'];

// Every asset page carries the Schedule Inspections cards, which repeat the
// mode titles verbatim. They must never be counted as history.
const PAGE_CHROME = `
  <div class="schedule-inspections">
    <h3>Schedule Inspections</h3>
    <div class="card"><div class="card-title">${TOUR}</div><div>CHECKLIST</div><div>Not Scheduled</div></div>
    <div class="card"><div class="card-title">PPE Routine Inspection (After Every Fire)</div><div>CHECKLIST</div><div>Not Scheduled</div></div>
    <div class="card"><div class="card-title">${CAPTAIN_SMART}</div><div>CHECKLIST</div><div>Not Scheduled</div></div>
  </div>
  <div class="tabs"><span class="tab active">ITEM LOG</span><span class="tab">INSPECTIONS</span><span class="tab">WORK ORDERS</span></div>
`;

const row = (date, person, title, extra = {}) => ({
    date, person, title,
    locationType: 'Inspection',
    location: 'Station 5',
    party: 'Flower Mound Fire Department (TX)',
    status: 'COMPLETE',
    ...extra
});

// ---------------------------------------------------------------- renderers

// A. semantic <table> with <th> headers
function semanticTable(rows) {
    const head = `<thead><tr>${HEADERS.map(h => `<th>${h}</th>`).join('')}</tr></thead>`;
    const body = rows.map(r => `<tr${r.id ? ` data-row-id="${r.id}"` : ''}>` +
        `<td>${r.date}</td><td>${r.person}</td><td>${r.locationType}</td>` +
        `<td>${r.location}</td><td>${r.party}</td>` +
        `<td>${r.title} ${r.status}</td></tr>`).join('');
    return `${PAGE_CHROME}<table class="item-log">${head}<tbody>${body}</tbody></table>`;
}

// B. ARIA grid
function ariaGrid(rows) {
    const head = `<div role="row">${HEADERS.map(h => `<div role="columnheader">${h}</div>`).join('')}</div>`;
    const body = rows.map(r => `<div role="row">` +
        `<div role="gridcell">${r.date}</div><div role="gridcell">${r.person}</div>` +
        `<div role="gridcell">${r.locationType}</div><div role="gridcell">${r.location}</div>` +
        `<div role="gridcell">${r.party}</div>` +
        `<div role="gridcell">${r.title} ${r.status}</div></div>`).join('');
    return `${PAGE_CHROME}<div role="grid" class="item-log">${head}<div role="rowgroup">${body}</div></div>`;
}

// C. nested div rows with sibling cells, NO table/grid roles and NO th.
//    This is the layout the v2.3.8 production diagnostic points at:
//    findItemLogHistoryTable() returns null, yet the text is plainly present.
function divRows(rows) {
    const head = `<div class="hdr">${HEADERS.map(h => `<span class="hcell">${h}</span>`).join('')}</div>`;
    const body = rows.map(r => `<div class="lrow">` +
        `<span class="c">${r.date}</span><span class="c">${r.person}</span>` +
        `<span class="c">${r.locationType}</span><span class="c">${r.location}</span>` +
        `<span class="c">${r.party}</span>` +
        `<span class="c">${r.title} ${r.status}</span></div>`).join('');
    return `${PAGE_CHROME}<div class="item-log-wrap">${head}<div class="lbody">${body}</div></div>`;
}

// D. same as C but NOTES splits title and status across separate child nodes
function divRowsSplitNotes(rows) {
    const head = `<div class="hdr">${HEADERS.map(h => `<span class="hcell">${h}</span>`).join('')}</div>`;
    const body = rows.map(r => `<div class="lrow">` +
        `<span class="c">${r.date}</span><span class="c">${r.person}</span>` +
        `<span class="c">${r.locationType}</span><span class="c">${r.location}</span>` +
        `<span class="c">${r.party}</span>` +
        `<span class="c"><span class="t">${r.title}</span><br><span class="s">${r.status}</span></span>` +
        `</div>`).join('');
    return `${PAGE_CHROME}<div class="item-log-wrap">${head}<div class="lbody">${body}</div></div>`;
}

// M. table/grid container whose headers are NOT th/columnheader.
//    findItemLogHistoryTable() fails AND the text fallback's
//    "exclude anything inside table/grid" filter removes every row.
function tableWithoutTh(rows) {
    const head = `<tr class="hdr">${HEADERS.map(h => `<td>${h}</td>`).join('')}</tr>`;
    const body = rows.map(r => `<tr>` +
        `<td>${r.date}</td><td>${r.person}</td><td>${r.locationType}</td>` +
        `<td>${r.location}</td><td>${r.party}</td>` +
        `<td>${r.title} ${r.status}</td></tr>`).join('');
    return `${PAGE_CHROME}<table class="item-log"><tbody>${head}${body}</tbody></table>`;
}

// K. lazy render: history region present, rows not yet drawn
function lazyEmpty() {
    const head = `<div class="hdr">${HEADERS.map(h => `<span class="hcell">${h}</span>`).join('')}</div>`;
    return `${PAGE_CHROME}<div class="item-log-wrap">${head}<div class="lbody"></div></div>`;
}

const BASE_TOUR = [
    row('06/01/2026', 'Michael Brion', TOUR),
    row('06/03/2026', 'Michael Brion', TOUR),
    row('06/06/2026', 'Michael Brion', TOUR),
    row('09/04/2026', 'Michael Brion', TOUR),
    row('09/10/2026', 'Michael Brion', TOUR)
];

module.exports = {
    TOUR, CAPTAIN_SMART, CAPTAIN_PLAIN, HEADERS, PAGE_CHROME, row, BASE_TOUR,
    semanticTable, ariaGrid, divRows, divRowsSplitNotes, tableWithoutTh, lazyEmpty
};
