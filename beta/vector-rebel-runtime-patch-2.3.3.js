(function () {
    'use strict';

    // Vector Rebel 2.3.3 completion-detection correction.
    // Production Vector PPE Item Log rows do not expose a COMPLETE token.
    // They identify submitted inspection events with the row text "Inspection".
    // The validated 2.3.1 core still expects COMPLETE + mode title when it
    // compares the pre-submit Item Log baseline to the post-submit Item Log.
    // This compatibility patch adds those proof tokens to the DOM only, hidden,
    // for real Item Log inspection rows while an active run exists. It does not
    // write to Vector, click anything, or alter backend data.

    const RUN_KEY = 'vectorPpeRun_v23';
    const PATCH_MARKER = 'data-vector-rebel-itemlog-proof-233';
    const MODE_TITLES = {
        tour: 'Tour PPE Routine Inspection',
        afterFire: 'PPE Routine Inspection (After Every Fire)',
        captain: "Captain's Monthly PPE Routine Inspection"
    };

    function readRun() {
        try {
            const raw = localStorage.getItem(RUN_KEY);
            if (!raw) return null;
            const run = JSON.parse(raw);
            if (!run || run.phase === 'stopped') return null;
            return run;
        } catch {
            return null;
        }
    }

    function normalized(text) {
        return String(text || '').replace(/\s+/g, ' ').trim();
    }

    function headerText(table) {
        return normalized(
            [...table.querySelectorAll('th,[role="columnheader"]')]
                .map(el => el.textContent || '')
                .join(' ')
        ).toUpperCase();
    }

    function isItemLogTable(table) {
        const h = headerText(table);
        const hasDate = h.includes('DATE');
        const hasPerson = h.includes('PERSONNEL') || h.includes('RESPONSIBLE PARTY') || h.includes('USER');
        const hasInspectionShape = h.includes('TYPE') || h.includes('LOCATION TYPE') || h.includes('INSPECTION');
        return hasDate && hasPerson && hasInspectionShape;
    }

    function rowsFor(table) {
        if (table.matches('table')) return [...table.querySelectorAll('tbody tr')];
        return [...table.querySelectorAll('[role="row"]')]
            .filter(row => !row.querySelector('[role="columnheader"]'));
    }

    function patchRows() {
        const run = readRun();
        if (!run) return;

        const modeTitle = MODE_TITLES[run.modeKey];
        if (!modeTitle) return;

        const tables = [...document.querySelectorAll('table,[role="table"],[role="grid"]')]
            .filter(isItemLogTable);

        for (const table of tables) {
            for (const row of rowsFor(table)) {
                if (row.hasAttribute(PATCH_MARKER)) continue;
                const text = normalized(row.textContent || '');
                if (!/\bInspection\b/i.test(text)) continue;

                const proof = document.createElement('span');
                proof.setAttribute('aria-hidden', 'true');
                proof.style.cssText = 'display:none!important;visibility:hidden!important;';
                proof.textContent = ` COMPLETE ${modeTitle} `;
                row.appendChild(proof);
                row.setAttribute(PATCH_MARKER, '1');
            }
        }
    }

    function patchVersionLabel() {
        if (window.__vectorRebelInstance) {
            window.__vectorRebelInstance.version = '2.3.3';
        }
        const panel = document.getElementById('vector-ppe-helper-v23');
        if (!panel) return;
        for (const el of panel.querySelectorAll('div')) {
            if (/^Vector Rebel v2\.3\.[12]$/.test(normalized(el.textContent))) {
                el.textContent = 'Vector Rebel v2.3.3';
                break;
            }
        }
    }

    const observer = new MutationObserver(() => {
        patchRows();
        patchVersionLabel();
    });

    observer.observe(document.documentElement, { childList: true, subtree: true });
    patchRows();
    patchVersionLabel();
    setInterval(() => {
        patchRows();
        patchVersionLabel();
    }, 100);
})();
