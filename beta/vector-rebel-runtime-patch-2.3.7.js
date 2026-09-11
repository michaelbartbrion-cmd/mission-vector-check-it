(function () {
    'use strict';

    // Vector Rebel 2.3.7 deterministic Item Log adapter.
    //
    // Production Vector can render its Item Log with non-semantic row markup,
    // and it can contain multiple rows with identical visible text. The core's
    // conservative verifier expects a semantic table and de-duplicates identical
    // entry text. That combination caused false "Verification needed" results.
    //
    // This adapter uses ONLY visible Vector evidence. During an active run it:
    //   1) finds real visible rows containing date + inspector + Inspection +
    //      current mode title + COMPLETE;
    //   2) gives identical rows stable bottom-counted occurrence keys;
    //   3) locally suppresses the source rows from the core's fallback parser;
    //   4) mirrors the same real evidence into one deterministic semantic table.
    //
    // The core then performs its existing pre-submit baseline and exactly +1
    // confirmation against that table. No submit/click/backend behavior changes.

    const RUN_KEY = 'vectorPpeRun_v23';
    const PANEL_ID = 'vector-ppe-helper-v23';
    const OVERLAY_ID = 'vector-ppe-overlay-v23';
    const MIRROR_ID = 'vector-rebel-itemlog-mirror-237';
    const SUPPRESS_CLASS = 'vector-rebel-itemlog-source-suppress-237';

    const MODE_TITLES = {
        tour: 'Tour PPE Routine Inspection',
        afterFire: 'PPE Routine Inspection (After Every Fire)',
        captain: "Captain's Monthly PPE Routine Inspection"
    };

    function clean(value) {
        return String(value || '').replace(/\s+/g, ' ').trim();
    }

    function visible(el) {
        if (!el) return false;
        const r = el.getBoundingClientRect();
        const s = getComputedStyle(el);
        return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0;
    }

    function readRun() {
        try {
            const raw = localStorage.getItem(RUN_KEY);
            if (!raw) return null;
            const run = JSON.parse(raw);
            return run && run.phase !== 'stopped' ? run : null;
        } catch {
            return null;
        }
    }

    function dateToken(text) {
        const m = clean(text).match(/\b\d{1,2}[\/-]\d{1,2}[\/-]\d{4}\b/);
        return m ? m[0] : '';
    }

    function hash32(text) {
        let h = 0x811c9dc5;
        for (let i = 0; i < text.length; i += 1) {
            h ^= text.charCodeAt(i);
            h = Math.imul(h, 0x01000193);
        }
        return (h >>> 0).toString(36);
    }

    function clearAdapterDom() {
        document.getElementById(MIRROR_ID)?.remove();
        document.querySelectorAll(`.${SUPPRESS_CLASS}`).forEach(el => el.remove());
    }

    function sourceText(row) {
        const clone = row.cloneNode(true);
        clone.querySelectorAll?.(`.${SUPPRESS_CLASS}`).forEach(el => el.remove());
        return clean(clone.textContent || '');
    }

    function findRealCompletedRows(run, modeTitle) {
        const inspector = clean(run.inspectorName || '');
        if (!inspector || !modeTitle) return [];

        // The NOTES cell may be one element containing both lines, so search for
        // "mode title ... COMPLETE" rather than an element equal to COMPLETE.
        const anchors = [...document.querySelectorAll('a,td,div,span,p')]
            .filter(visible)
            .filter(el => !el.closest(`#${PANEL_ID}, #${OVERLAY_ID}, #${MIRROR_ID}`))
            .map(el => ({ el, text: clean(el.textContent || '') }))
            .filter(x =>
                x.text.length > 0 &&
                x.text.length <= 800 &&
                x.text.includes(modeTitle) &&
                /\bCOMPLETE\b/i.test(x.text)
            )
            .sort((a, b) => a.text.length - b.text.length);

        const rows = [];
        const seen = new Set();

        for (const { el } of anchors) {
            let node = el;
            let matched = null;

            for (let depth = 0; node && depth < 16; depth += 1, node = node.parentElement) {
                if (!visible(node)) continue;
                if (node.closest?.(`#${PANEL_ID}, #${OVERLAY_ID}, #${MIRROR_ID}`)) continue;

                const text = sourceText(node);
                if (!text || text.length > 2200) continue;
                if (!dateToken(text)) continue;
                if (!text.includes(inspector)) continue;
                if (!text.includes(modeTitle)) continue;
                if (!/\bInspection\b/i.test(text)) continue;
                if (!/\bCOMPLETE\b/i.test(text)) continue;

                matched = node; // smallest matching ancestor
                break;
            }

            if (matched && !seen.has(matched)) {
                seen.add(matched);
                rows.push(matched);
            }
        }

        return rows;
    }

    function stableEvidenceRows(rows, inspector, modeTitle) {
        const groups = new Map();

        for (const row of rows) {
            const base = sourceText(row);
            if (!groups.has(base)) groups.set(base, []);
            groups.get(base).push(row);
        }

        const evidence = [];

        for (const [base, groupRows] of groups) {
            // Vector is newest-first. Bottom-counting makes old duplicate keys
            // stable when a new identical row is prepended at the top.
            groupRows.sort((a, b) => {
                const at = a.getBoundingClientRect().top;
                const bt = b.getBoundingClientRect().top;
                if (at !== bt) return bt - at;
                const pos = a.compareDocumentPosition(b);
                if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return 1;
                if (pos & Node.DOCUMENT_POSITION_PRECEDING) return -1;
                return 0;
            });

            const fp = hash32(base);
            groupRows.forEach((row, index) => {
                evidence.push({
                    row,
                    date: dateToken(base) || '01/01/2000',
                    inspector,
                    modeTitle,
                    key: `${fp}-${index + 1}`
                });
            });
        }

        return evidence;
    }

    function suppressSourceRows(evidence) {
        for (const item of evidence) {
            const marker = document.createElement('span');
            marker.className = SUPPRESS_CLASS;
            marker.setAttribute('aria-hidden', 'true');
            marker.style.cssText = 'display:none!important;visibility:hidden!important;';
            // Both core history parsers deliberately reject INCOMPLETE. This
            // prevents counting the production row AND its semantic mirror.
            marker.textContent = ' INCOMPLETE VR-SOURCE-SUPPRESSED ';
            item.row.appendChild(marker);
        }
    }

    function buildMirror(evidence) {
        if (!evidence.length || !document.body) return;

        const table = document.createElement('table');
        table.id = MIRROR_ID;
        table.setAttribute('aria-hidden', 'true');
        table.style.cssText = [
            'position:fixed',
            'left:-12000px',
            'top:0',
            'width:8px',
            'min-width:8px',
            'height:auto',
            'opacity:0.001',
            'pointer-events:none',
            'z-index:-2147483647',
            'font-size:1px',
            'line-height:2px'
        ].join(';');

        const thead = document.createElement('thead');
        const hr = document.createElement('tr');
        for (const label of ['DATE', 'PERSONNEL', 'LOCATION TYPE', 'NOTES']) {
            const th = document.createElement('th');
            th.textContent = label;
            hr.appendChild(th);
        }
        thead.appendChild(hr);

        const tbody = document.createElement('tbody');
        for (const item of evidence) {
            const tr = document.createElement('tr');
            const values = [
                item.date,
                item.inspector,
                'Inspection',
                `${item.modeTitle} COMPLETE VRHISTKEY-${item.key}`
            ];
            for (const value of values) {
                const td = document.createElement('td');
                td.textContent = value;
                td.style.cssText = 'padding:1px;width:2px;height:2px;';
                tr.appendChild(td);
            }
            tbody.appendChild(tr);
        }

        table.append(thead, tbody);

        // First in document order so the core's semantic-table lookup chooses
        // this deterministic representation before Vector's non-semantic grid.
        document.body.prepend(table);
    }

    function syncAdapter() {
        clearAdapterDom();

        const run = readRun();
        if (!run) return;

        const modeTitle = MODE_TITLES[run.modeKey];
        const inspector = clean(run.inspectorName || '');
        if (!modeTitle || !inspector) return;

        const rows = findRealCompletedRows(run, modeTitle);
        if (!rows.length) return; // never manufacture evidence

        const evidence = stableEvidenceRows(rows, inspector, modeTitle);
        suppressSourceRows(evidence);
        buildMirror(evidence);
    }

    function patchVersionLabel() {
        if (window.__vectorRebelInstance) window.__vectorRebelInstance.version = '2.3.7';
        const panel = document.getElementById(PANEL_ID);
        if (!panel) return;
        for (const el of panel.querySelectorAll('div')) {
            if (/^Vector Rebel v2\.3\.[1-6]$/.test(clean(el.textContent))) {
                el.textContent = 'Vector Rebel v2.3.7';
                break;
            }
        }
    }

    // Polling is intentional here. It avoids MutationObserver feedback from our
    // own local mirror/suppression nodes and still refreshes much faster than the
    // core's completion polling interval.
    syncAdapter();
    patchVersionLabel();
    setInterval(() => {
        syncAdapter();
        patchVersionLabel();
    }, 50);
})();
