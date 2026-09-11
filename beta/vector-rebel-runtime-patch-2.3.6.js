(function () {
    'use strict';

    // Vector Rebel 2.3.6 Item Log duplicate-row correction.
    // Root cause: Vector can render multiple legitimate completed history rows
    // with identical visible text (same date, inspector, type, mode, COMPLETE).
    // The validated core de-duplicates identical history-entry text, so a newly
    // completed inspection on the same day can fail to increase the baseline
    // count even though Vector visibly added the row.
    //
    // This adapter adds a hidden, stable occurrence key to each REAL visible
    // completed row for the active inspector/mode. Keys are assigned from the
    // bottom of each identical-text group, so existing rows keep the same key
    // when Vector prepends one new row at the top. The existing core then sees
    // the true multiplicity and its baseline / exactly +1 / inspector check works.
    //
    // No clicks, submits, backend calls, or Vector data writes are performed.

    const RUN_KEY = 'vectorPpeRun_v23';
    const PANEL_ID = 'vector-ppe-helper-v23';
    const OVERLAY_ID = 'vector-ppe-overlay-v23';
    const MARKER_CLASS = 'vector-rebel-history-occurrence-236';
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

    function clearMarkers() {
        document.querySelectorAll(`.${MARKER_CLASS}`).forEach(el => el.remove());
    }

    function rowTextWithoutMarker(row) {
        const clone = row.cloneNode(true);
        clone.querySelectorAll?.(`.${MARKER_CLASS}`).forEach(el => el.remove());
        return clean(clone.textContent || '');
    }

    function findCompletedRows(run, modeTitle) {
        const inspector = clean(run.inspectorName || '');
        if (!inspector || !modeTitle) return [];

        // Start from compact nodes that visibly contain BOTH the mode title and
        // COMPLETE. This handles Vector's NOTES cell whether COMPLETE is a
        // separate child or merely a second line in the same cell/container.
        const anchors = [...document.querySelectorAll('a,td,div,span,p')]
            .filter(visible)
            .filter(el => !el.closest(`#${PANEL_ID}, #${OVERLAY_ID}`))
            .map(el => ({ el, text: clean(el.textContent || '') }))
            .filter(x =>
                x.text.length > 0 &&
                x.text.length <= 700 &&
                x.text.includes(modeTitle) &&
                /\bCOMPLETE\b/i.test(x.text)
            )
            .sort((a, b) => a.text.length - b.text.length);

        const rows = [];
        const seen = new Set();

        for (const { el } of anchors) {
            let node = el;
            let matched = null;

            for (let depth = 0; node && depth < 14; depth += 1, node = node.parentElement) {
                if (!visible(node)) continue;
                if (node.closest?.(`#${PANEL_ID}, #${OVERLAY_ID}`)) continue;

                const text = rowTextWithoutMarker(node);
                if (!text || text.length > 1800) continue;
                if (!dateToken(text)) continue;
                if (!text.includes(inspector)) continue;
                if (!text.includes(modeTitle)) continue;
                if (!/\bInspection\b/i.test(text)) continue;
                if (!/\bCOMPLETE\b/i.test(text)) continue;

                // First matching ancestor is the smallest container holding the
                // complete row evidence (date/person/type/notes).
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

    function decorateRows() {
        // Synchronous remove/rebuild: no other JS can interleave between these
        // operations in the same event-loop turn.
        clearMarkers();

        const run = readRun();
        if (!run) return;

        const modeTitle = MODE_TITLES[run.modeKey];
        if (!modeTitle) return;

        const rows = findCompletedRows(run, modeTitle);
        if (!rows.length) return;

        // Group rows by their REAL visible text. The problem case is multiple
        // identical rows, so preserve each occurrence rather than de-duplicating.
        const groups = new Map();
        for (const row of rows) {
            const base = rowTextWithoutMarker(row);
            if (!groups.has(base)) groups.set(base, []);
            groups.get(base).push(row);
        }

        for (const [base, groupRows] of groups) {
            // Vector history is newest-first. Counting identical occurrences
            // from the bottom keeps every existing row's key stable when one new
            // identical completion is prepended at the top.
            groupRows.sort((a, b) => {
                const at = a.getBoundingClientRect().top;
                const bt = b.getBoundingClientRect().top;
                if (at !== bt) return bt - at; // bottom -> top
                const pos = a.compareDocumentPosition(b);
                if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return 1;
                if (pos & Node.DOCUMENT_POSITION_PRECEDING) return -1;
                return 0;
            });

            const fingerprint = hash32(base);
            groupRows.forEach((row, index) => {
                const marker = document.createElement('span');
                marker.className = MARKER_CLASS;
                marker.setAttribute('aria-hidden', 'true');
                marker.style.cssText = 'display:none!important;visibility:hidden!important;';
                marker.textContent = ` VRHISTKEY-${fingerprint}-${index + 1} `;
                row.appendChild(marker);
            });
        }
    }

    function patchVersionLabel() {
        if (window.__vectorRebelInstance) window.__vectorRebelInstance.version = '2.3.6';
        const panel = document.getElementById(PANEL_ID);
        if (!panel) return;
        for (const el of panel.querySelectorAll('div')) {
            if (/^Vector Rebel v2\.3\.[1-5]$/.test(clean(el.textContent))) {
                el.textContent = 'Vector Rebel v2.3.6';
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
            decorateRows();
            patchVersionLabel();
        }, 20);
    }

    const observer = new MutationObserver(scheduleSync);
    observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
        characterData: true
    });

    decorateRows();
    patchVersionLabel();
    setInterval(() => {
        decorateRows();
        patchVersionLabel();
    }, 100);
})();
