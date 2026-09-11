'use strict';
// Offline DOM/parser harness for Vector Rebel Item Log verification.
//
// It does NOT re-implement anything. It lifts the real function source out of a
// given userscript by name and evaluates it against a jsdom document, so the
// code under test is exactly the code that would ship.

const fs = require('fs');
const vm = require('vm');
const { JSDOM } = require('jsdom');

const CHAIN = [
    'clean', 'uiText', 'uiIncludes', 'uiEquals', 'escapeRegex', 'visible',
    'diagnosticTextHash',
    'historyContainerHeaderText', 'findItemLogHistoryTable', 'historyRows',
    'historyDateTokenPresent', 'textLooksLikeCompletedInspectionEntry',
    'findHistorySectionAnchor', 'textHistoryEntryElements',
    'rowHasCompletedStatus', 'rowLooksLikeCompletedModeEntry',
    'itemLogRowText', 'compactHistoryRowText', 'redactDiagnosticText',
    'ITEM_LOG_HEADER_LABELS', 'ITEM_LOG_ROW_CANDIDATE_SELECTOR',
    'itemLogAnchorElements', 'reconstructItemLogRowFromAnchor', 'structuralItemLogRows',
    'assetPageCompletedTextEvidence',
    'itemLogCompletedRowSource', 'itemLogCompletedRowElements',
    'looksLikeStableRecordId', 'itemLogStableRowId', 'itemLogRowKeys',
    'readItemLogSnapshot', 'itemLogSnapshotAddedKeys', 'itemLogSnapshotAddedRecords'
];

function extractFunction(src, name) {
    const patterns = [
        new RegExp(`\\n(    (?:async )?function ${name}\\()`),
        new RegExp(`\\n(    const ${name}\\s*=)`)
    ];
    let start = -1;
    for (const p of patterns) {
        const m = src.match(p);
        if (m) { start = src.indexOf(m[1]); break; }
    }
    if (start < 0) return null;
    // Arrow/const one-liners terminate at the first `;\n` at column 0 depth.
    if (/^    const /.test(src.slice(start, start + 10))) {
        const semi = src.indexOf(';\n', start);
        const arr = src.indexOf('];\n', start);
        const end = (arr >= 0 && arr <= semi) ? arr + 3 : semi + 2;
        return src.slice(start, end);
    }
    const end = src.indexOf('\n    }\n', start);
    return src.slice(start, end + 7);
}

function buildSandbox(userscriptPath, dom) {
    const src = fs.readFileSync(userscriptPath, 'utf8');
    const pieces = [];
    const missing = [];
    for (const name of CHAIN) {
        const text = extractFunction(src, name);
        if (text) pieces.push(text);
        else missing.push(name);
    }

    const prelude = `
        const PANEL_ID = 'vector-ppe-helper-v23';
        const OVERLAY_ID = 'vector-ppe-overlay-v23';
        // Asset identity is verified elsewhere and is not what these tests exercise.
        function isAssetPageFor() { return true; }
        function assetPageContainsExpectedId() { return true; }
        function bringIntoView() {}
        function sleep() { return Promise.resolve(); }
    `;
    const epilogue = `
        globalThis.__api = {
            findItemLogHistoryTable,
            textHistoryEntryElements,
            itemLogCompletedRowElements,
            readItemLogSnapshot,
            itemLogSnapshotAddedKeys,
            ${src.includes('function assetPageCompletedTextEvidence') ? 'assetPageCompletedTextEvidence,' : ''}
            ${src.includes('function structuralItemLogRows') ? 'structuralItemLogRows,' : ''}
            ${src.includes('function itemLogSnapshotAddedRecords') ? 'itemLogSnapshotAddedRecords,' : ''}
            uiIncludes
        };
    `;

    const ctx = vm.createContext({
        window: dom.window,
        document: dom.window.document,
        getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
        Node: dom.window.Node,
        Math, JSON, Date, RegExp, String, Number, Array, Map, Set, Boolean, Object,
        console
    });
    vm.runInContext(prelude + '\n' + pieces.join('\n') + '\n' + epilogue, ctx);
    return { api: ctx.__api, missing };
}

// jsdom has no layout engine, so getBoundingClientRect returns zeros and the
// real visible() would reject everything. Give every element a real box unless
// the fixture explicitly hides it.
function installLayout(dom) {
    const proto = dom.window.Element.prototype;
    proto.getBoundingClientRect = function () {
        const s = dom.window.getComputedStyle(this);
        const hidden = s.display === 'none' || s.visibility === 'hidden' ||
            this.closest('[data-test-hidden="1"]');
        const box = hidden ? 0 : 40;
        return { width: box, height: box, top: 0, left: 0, right: box, bottom: box, x: 0, y: 0 };
    };
}

function load(userscriptPath, html) {
    const dom = new JSDOM(`<!doctype html><html><body>${html}</body></html>`);
    installLayout(dom);
    const { api, missing } = buildSandbox(userscriptPath, dom);
    return { dom, api, missing };
}

module.exports = { load, extractFunction, CHAIN };
