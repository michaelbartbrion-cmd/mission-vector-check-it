(function () {
    'use strict';

    // Vector Rebel 2.3.5 Item Log completion mirror.
    // The validated core expects a semantic table with completed rows. Vector's
    // production Item Log can render those rows with non-semantic layout markup.
    // This adapter reads the VISIBLE Vector row (date + inspector + Inspection +
    // inspection title + COMPLETE) and mirrors only that evidence into a tiny,
    // off-screen semantic table. The core then performs its existing pre-submit
    // baseline / exactly +1 / inspector-match verification against that mirror.
    // This adapter never clicks, submits, edits Vector data, or calls a backend.

    const RUN_KEY = 'vectorPpeRun_v23';
    const MIRROR_ID = 'vector-rebel-itemlog-mirror-235';
    const PANEL_ID = 'vector-ppe-helper-v23';
    const OVERLAY_ID = 'vector-ppe-overlay-v23';
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

    function completeTokenCount(text) {
        return (clean(text).match(/\bCOMPLETE\b/gi) || []).length;
    }

    function candidateCompletedRows(run, modeTitle) {
        const inspector = clean(run.inspectorName || '');
        if (!inspector || !modeTitle) return [];

        const completeCells = [...document.querySelectorAll('div,span,td,p,a')]
            .filter(visible)
            .filter(el => clean(el.textContent).toUpperCase() === 'COMPLETE')
            .filter(el => !el.closest(`#${PANEL_ID}, #${OVERLAY_ID}, #${MIRROR_ID}`));

        const rows = [];
        const seen = new Set();

        for (const cell of completeCells) {
            let node = cell;
            let best = null;

            for (let depth = 0; node && depth < 14; depth += 1, node = node.parentElement) {
                const text = clean(node.textContent || '');
                if (!text || text.length > 1800) continue;
                if (!text.includes(inspector)) continue;
                if (!text.includes(modeTitle)) continue;
                if (!/\bInspection\b/i.test(text)) continue;
                if (!dateToken(text)) continue;

                // Prefer the smallest ancestor representing one visible history row.
                if (completeTokenCount(text) === 1) {
                    best = node;
                    break;
                }
                if (!best) best = node;
            }

            if (!best || seen.has(best)) continue;
            seen.add(best);
            rows.push(best);
        }

        return rows;
    }

    function removeMirror() {
        document.getElementById(MIRROR_ID)?.remove();
    }

    function buildMirror(run, modeTitle, rows) {
        removeMirror();
        if (!rows.length || !document.body) return;

        const inspector = clean(run.inspectorName || '');
        const table = document.createElement('table');
        table.id = MIRROR_ID;
        table.setAttribute('aria-hidden', 'true');
        table.style.cssText = [
            'position:fixed',
            'left:-12000px',
            'top:0',
            'width:4px',
            'height:4px',
            'opacity:0.001',
            'pointer-events:none',
            'z-index:-2147483647',
            'font-size:1px',
            'line-height:1px'
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
        for (const sourceRow of rows) {
            const tr = document.createElement('tr');
            const values = [
                dateToken(sourceRow.textContent) || '01/01/2000',
                inspector,
                'Inspection',
                `${modeTitle} COMPLETE`
            ];
            for (const value of values) {
                const td = document.createElement('td');
                td.textContent = value;
                tr.appendChild(td);
            }
            tbody.appendChild(tr);
        }

        table.append(thead, tbody);

        // Prepend so the validated core selects this deterministic semantic
        // Item Log representation before any non-semantic production container.
        document.body.prepend(table);
    }

    function syncMirror() {
        const run = readRun();
        if (!run) {
            removeMirror();
            return;
        }

        const modeTitle = MODE_TITLES[run.modeKey];
        if (!modeTitle) {
            removeMirror();
            return;
        }

        const rows = candidateCompletedRows(run, modeTitle);
        if (!rows.length) {
            // Do not manufacture completion evidence. If Vector has not rendered
            // a visible matching COMPLETE row, no mirror is created.
            removeMirror();
            return;
        }

        buildMirror(run, modeTitle, rows);
    }

    function patchVersionLabel() {
        if (window.__vectorRebelInstance) window.__vectorRebelInstance.version = '2.3.5';
        const panel = document.getElementById(PANEL_ID);
        if (!panel) return;
        for (const el of panel.querySelectorAll('div')) {
            if (/^Vector Rebel v2\.3\.[1-4]$/.test(clean(el.textContent))) {
                el.textContent = 'Vector Rebel v2.3.5';
                break;
            }
        }
    }

    let scheduled = false;
    function scheduleSync() {
        if (scheduled) return;
        scheduled = true;
        setTimeout(() => {
            scheduled = false;
            syncMirror();
            patchVersionLabel();
        }, 25);
    }

    const observer = new MutationObserver(scheduleSync);
    observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });

    syncMirror();
    patchVersionLabel();
    setInterval(() => {
        syncMirror();
        patchVersionLabel();
    }, 100);
})();
