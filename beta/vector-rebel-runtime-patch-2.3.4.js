(function () {
    'use strict';

    // Vector Rebel 2.3.4 completion-verification correction.
    // Production Vector Item Log visibly shows COMPLETE, but the validated core
    // can miss those rows because the Item Log is not always exposed as a
    // semantic table/row structure. This patch mirrors the visible COMPLETE rows
    // into tiny off-screen proof rows that the existing baseline/+1 verifier can
    // count reliably. It does not click, submit, write to Vector, or alter backend data.

    const RUN_KEY = 'vectorPpeRun_v23';
    const PROOF_CLASS = 'vector-rebel-itemlog-proof-234';
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

    function candidateCompletedRows(run, modeTitle) {
        const inspector = clean(run.inspectorName || '');
        if (!inspector || !modeTitle) return [];

        const completeCells = [...document.querySelectorAll('div,span,td,p,a')]
            .filter(visible)
            .filter(el => clean(el.textContent).toUpperCase() === 'COMPLETE')
            .filter(el => !el.closest('#vector-ppe-helper-v23, #vector-ppe-overlay-v23'));

        const rows = [];
        const seen = new Set();

        for (const cell of completeCells) {
            let node = cell;
            let matched = null;

            for (let depth = 0; node && depth < 10; depth += 1, node = node.parentElement) {
                const text = clean(node.textContent || '');
                if (!text || text.length > 1200) continue;
                if (!text.includes(inspector)) continue;
                if (!text.includes(modeTitle)) continue;
                if (!/\bInspection\b/i.test(text)) continue;
                if (!dateToken(text)) continue;
                matched = node;
                break;
            }

            if (matched && !seen.has(matched)) {
                seen.add(matched);
                rows.push(matched);
            }
        }

        return rows;
    }

    function coreAlreadySeesRows(run, modeTitle) {
        const inspector = clean(run.inspectorName || '');
        return [...document.querySelectorAll('tr,[role="row"],li,article,p,div')]
            .filter(visible)
            .filter(el => !el.classList?.contains(PROOF_CLASS))
            .filter(el => !el.closest('#vector-ppe-helper-v23, #vector-ppe-overlay-v23'))
            .some(el => {
                const text = clean(el.textContent || '');
                return text.length <= 500 &&
                    !!dateToken(text) &&
                    text.includes(inspector) &&
                    text.includes(modeTitle) &&
                    /\bCOMPLETE\b/i.test(text);
            });
    }

    function clearProofRows() {
        document.querySelectorAll(`.${PROOF_CLASS}`).forEach(el => el.remove());
    }

    function syncProofRows() {
        clearProofRows();

        const run = readRun();
        if (!run) return;

        const modeTitle = MODE_TITLES[run.modeKey];
        if (!modeTitle) return;

        // If the core can already see a compact completed row, do not duplicate it.
        if (coreAlreadySeesRows(run, modeTitle)) return;

        const rows = candidateCompletedRows(run, modeTitle);
        if (!rows.length) return;

        const inspector = clean(run.inspectorName || '');
        rows.forEach((row, index) => {
            const proof = document.createElement('div');
            proof.className = PROOF_CLASS;
            proof.setAttribute('aria-hidden', 'true');
            proof.style.cssText = [
                'position:fixed',
                'left:-10000px',
                'top:0',
                'width:2px',
                'height:2px',
                'overflow:hidden',
                'opacity:0',
                'pointer-events:none',
                'z-index:-1'
            ].join(';');

            const stamp = dateToken(row.textContent) || '01/01/2000';
            proof.textContent = `${stamp} ${inspector} Inspection ${modeTitle} COMPLETE VectorRebelProof${index + 1}`;
            document.body.appendChild(proof);
        });
    }

    function patchVersionLabel() {
        if (window.__vectorRebelInstance) window.__vectorRebelInstance.version = '2.3.4';
        const panel = document.getElementById('vector-ppe-helper-v23');
        if (!panel) return;
        for (const el of panel.querySelectorAll('div')) {
            if (/^Vector Rebel v2\.3\.[1-3]$/.test(clean(el.textContent))) {
                el.textContent = 'Vector Rebel v2.3.4';
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
            syncProofRows();
            patchVersionLabel();
        }, 50);
    }

    const observer = new MutationObserver(scheduleSync);
    observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });

    syncProofRows();
    patchVersionLabel();
    setInterval(() => {
        syncProofRows();
        patchVersionLabel();
    }, 250);
})();
