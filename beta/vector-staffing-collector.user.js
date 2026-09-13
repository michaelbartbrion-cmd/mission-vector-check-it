// ==UserScript==
// @name         Mission Vector Check It - Staffing Collector
// @namespace    mission-vector-check-it
// @version      0.1.0
// @description  Read-only Vector Scheduling ListView census collector for Rebel Command overtime forecasting.
// @match        https://checkitapp.targetsolutions.com/*
// @updateURL    https://raw.githubusercontent.com/michaelbartbrion-cmd/mission-vector-check-it/main/beta/vector-staffing-collector.user.js
// @downloadURL  https://raw.githubusercontent.com/michaelbartbrion-cmd/mission-vector-check-it/main/beta/vector-staffing-collector.user.js
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    if (window.__vectorStaffingCollector) return;

    const VERSION = '0.1.0';
    const ENDPOINT = 'https://base44.app/api/apps/6aa6b7634a031657377d4fad/functions/telemetryBridge';
    const PAIR_KEY = 'vectorStaffingCollectorPairing_v1';
    const STATE_KEY = 'vectorStaffingCollectorState_v1';
    const UI_ID = 'vector-staffing-collector-status';
    const MIN_ROWS_FOR_FULL_CENSUS = 24;
    const MIN_REGULAR_CANDIDATES = 20;
    const MIN_GROUPS_FOR_FULL_CENSUS = 6;
    const STABLE_MS = 900;
    const CAPTURE_COOLDOWN_MS = 12_000;

    const state = {
        lastMutationAt: Date.now(),
        captureRunning: false,
        captureTimer: null,
        lastDigest: '',
        lastSentAt: 0,
        lastResult: null,
        status: 'idle'
    };

    function clean(value) {
        return String(value || '').replace(/\s+/g, ' ').trim();
    }

    function hash32(text) {
        let h = 0x811c9dc5;
        for (let i = 0; i < text.length; i += 1) {
            h ^= text.charCodeAt(i);
            h = Math.imul(h, 0x01000193);
        }
        return (h >>> 0).toString(36);
    }

    function loadJSON(key, fallback) {
        try {
            return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback));
        } catch {
            return fallback;
        }
    }

    function saveJSON(key, value) {
        localStorage.setItem(key, JSON.stringify(value));
    }

    function pairing() {
        const p = loadJSON(PAIR_KEY, {});
        return {
            deviceId: clean(p.deviceId),
            token: clean(p.token),
            endpoint: clean(p.endpoint) || ENDPOINT
        };
    }

    function isPaired() {
        const p = pairing();
        return !!(p.deviceId && p.token);
    }

    function rendered(el) {
        if (!el || !(el instanceof Element)) return false;
        const style = getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden') return false;
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
    }

    function looksLikeShiftText(text) {
        const t = clean(text);
        if (t.length < 18 || t.length > 520) return false;
        if (!/\b\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2}\b/.test(t)) return false;
        if (!/\b\d+\s*(?:hrs?|hours?)(?:\s+\d+\s*min)?\b/i.test(t)) return false;
        return /Salary Step\s*\[1010\]|Sub\s*\[1010\]|DO NOT USE|Additional Time|Disaster Relief|Overtime|Force Hire|Backfill|Trade|Swap|Open Slot/i.test(t);
    }

    function regularCandidateText(text) {
        const t = clean(text);
        return /Salary Step\s*\[1010\]/i.test(t)
            && /\b24\s*(?:hrs?|hours?)\b/i.test(t)
            && !/\bSub\s*\[1010\]|DO NOT USE|Additional Time|Disaster Relief|Overtime|Force Hire|Backfill|Trade|Swap|Substitut/i.test(t);
    }

    function minimalShiftElements(root = document) {
        const pool = [...root.querySelectorAll('tr,[role="row"],li,article,section,div')]
            .filter(el => el.id !== UI_ID && !el.closest(`#${UI_ID}`))
            .map(el => ({ el, text: clean(el.textContent) }))
            .filter(x => looksLikeShiftText(x.text));

        const selected = [];
        for (const item of pool.sort((a, b) => a.text.length - b.text.length)) {
            if (selected.some(x => item.el.contains(x.el))) continue;
            selected.push(item);
        }
        return selected;
    }

    function extractGroup(rowEl) {
        let node = rowEl.parentElement;
        for (let depth = 0; node && depth < 10; depth += 1, node = node.parentElement) {
            if (node.id === UI_ID || node.closest?.(`#${UI_ID}`)) continue;
            const text = clean(node.textContent);
            if (!text || text.length > 8000) continue;
            const m = text.match(/^(.{1,100}?)\s+(\d+)\s*\/\s*(\d+)\b/);
            if (m) {
                const name = clean(m[1]).slice(0, 100);
                if (name && !looksLikeShiftText(name)) {
                    return { name, shown: Number(m[2]), capacity: Number(m[3]) };
                }
            }
        }
        return { name: '', shown: null, capacity: null };
    }

    function extractScheduleType(text) {
        const t = clean(text);
        const patterns = [
            /Salary Step\s*\[1010\](?:\s*-\s*[^\d]{1,80}\[\d+\])?/i,
            /Sub\s*\[1010\]/i,
            /DO NOT USE-Additional Time\s*\[\d+\](?:\s*-\s*[^\d]{1,80}\[[^\]]+\])?/i,
            /Salary Disaster Relief[^\[]*\[\d+\](?:\s*-\s*[^\d]{1,80})?/i
        ];
        for (const re of patterns) {
            const m = t.match(re);
            if (m) return clean(m[0]);
        }
        return '';
    }

    function extractHours(text) {
        const m = clean(text).match(/\b(\d+)\s*(?:hrs?|hours?)(?:\s+(\d+)\s*min)?\b/i);
        if (!m) return null;
        return Number(m[1]) + (Number(m[2] || 0) / 60);
    }

    function extractPersonName(text) {
        const t = clean(text);
        if (/^Open Slot\b/i.test(t)) return clean(t.match(/^Open Slot(?:\s+[^\d]{0,30})?/i)?.[0] || 'Open Slot');
        const marker = t.search(/\s+(?=Salary Step\s*\[1010\]|Sub\s*\[1010\]|DO NOT USE|Salary Disaster Relief|Overtime|Force Hire|Backfill|Trade|Swap)/i);
        let prefix = marker > 0 ? t.slice(0, marker) : t.split(/\b\d{1,2}:\d{2}\b/)[0];
        let tokens = clean(prefix).split(' ').filter(Boolean);
        const removable = new Set(['S','D','SWING','TAC','TADE','FFB','FF','TM','DE','DE-A','DE-B','DE-C','CAPT','CAPTAIN','BC','CHIEF','-','1','2','3']);
        while (tokens.length > 2) {
            const last = tokens[tokens.length - 1];
            const upper = last.toUpperCase();
            const codeLike = removable.has(upper) || (/^[A-Z0-9-]{1,6}$/.test(last) && last === upper);
            const titleRole = /^(Capt|Captain|Chief|Engineer|Driver)$/i.test(last);
            if (!codeLike && !titleRole) break;
            tokens.pop();
        }
        const candidate = tokens.join(' ');
        return candidate.length >= 3 ? candidate.slice(0, 180) : clean(prefix).slice(0, 180);
    }

    function makeRow(item) {
        const rawText = clean(item.text);
        const group = extractGroup(item.el);
        const personName = extractPersonName(rawText);
        const scheduleType = extractScheduleType(rawText);
        const lengthHours = extractHours(rawText);
        const idBase = /^Open Slot\b/i.test(personName)
            ? `${group.name}|${rawText}`
            : personName.toLowerCase();
        return {
            personId: `dom-${hash32(idBase)}`,
            personName,
            activity: 'Work Shift',
            assignment: group.name,
            assignmentGroup: group.name,
            dutyCode: '',
            scheduleType,
            ...(lengthHours == null ? {} : { lengthHours }),
            captureQuality: group.name ? 'row+group' : 'row-only',
            rawText
        };
    }

    function parseDateString(value) {
        const text = clean(value);
        let m = text.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/);
        if (m) return `${m[1]}-${String(Number(m[2])).padStart(2, '0')}-${String(Number(m[3])).padStart(2, '0')}`;
        m = text.match(/\b(\d{1,2})[\/-](\d{1,2})[\/-](20\d{2})\b/);
        if (m) return `${m[3]}-${String(Number(m[1])).padStart(2, '0')}-${String(Number(m[2])).padStart(2, '0')}`;
        const monthNames = 'January February March April May June July August September October November December';
        const re = new RegExp(`\\b(${monthNames.replace(/ /g, '|')})\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(20\\d{2})\\b`, 'i');
        m = text.match(re);
        if (m) {
            const month = monthNames.toLowerCase().split(' ').indexOf(m[1].toLowerCase()) + 1;
            return `${m[3]}-${String(month).padStart(2, '0')}-${String(Number(m[2])).padStart(2, '0')}`;
        }
        return '';
    }

    function detectDate() {
        const url = new URL(location.href);
        for (const key of ['date','day','startDate','selectedDate']) {
            const parsed = parseDateString(url.searchParams.get(key) || '');
            if (parsed) return { date: parsed, confidence: 'high', source: `url:${key}` };
        }

        const dateInput = [...document.querySelectorAll('input[type="date"]')].find(rendered);
        if (dateInput) {
            const parsed = parseDateString(dateInput.value);
            if (parsed) return { date: parsed, confidence: 'high', source: 'input[type=date]' };
        }

        const inputs = [...document.querySelectorAll('input')]
            .filter(rendered)
            .map(el => ({ el, value: clean(el.value) }))
            .filter(x => parseDateString(x.value));
        if (inputs.length === 1) return { date: parseDateString(inputs[0].value), confidence: 'high', source: 'visible-input' };

        const candidates = [...document.querySelectorAll('h1,h2,h3,h4,button,[role="button"],label,span,div')]
            .filter(rendered)
            .map(el => ({ el, text: clean(el.textContent) }))
            .filter(x => x.text.length > 0 && x.text.length <= 48)
            .map(x => ({ ...x, date: parseDateString(x.text) }))
            .filter(x => x.date);

        const unique = [...new Set(candidates.map(x => x.date))];
        if (unique.length === 1) return { date: unique[0], confidence: 'high', source: 'unique-visible-date' };
        if (candidates.length) return { date: candidates[0].date, confidence: 'medium', source: 'ambiguous-visible-date' };
        return { date: '', confidence: 'none', source: 'not-found' };
    }

    function loadingVisible() {
        const busy = [...document.querySelectorAll('[aria-busy="true"],.loading,.spinner,[class*="loading"],[class*="spinner"]')]
            .some(rendered);
        if (busy) return true;
        return [...document.querySelectorAll('div,span,p')]
            .filter(rendered)
            .some(el => /^(loading|please wait|updating schedule)\.{0,3}$/i.test(clean(el.textContent)));
    }

    function findScrollableAncestor(rowEl) {
        let node = rowEl?.parentElement || null;
        for (let depth = 0; node && depth < 12; depth += 1, node = node.parentElement) {
            const style = getComputedStyle(node);
            const scrollable = node.scrollHeight > node.clientHeight + 80 && /(auto|scroll)/i.test(style.overflowY || '');
            if (scrollable) return node;
        }
        return null;
    }

    function mergeScan(target, scanItems) {
        for (const item of scanItems) {
            const row = makeRow(item);
            if (!row.personName || !row.rawText) continue;
            const key = `${row.assignmentGroup}|${row.rawText}`;
            if (!target.has(key)) target.set(key, row);
        }
    }

    async function wait(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async function waitStable(maxWait = 6000) {
        const start = Date.now();
        while (Date.now() - start < maxWait) {
            if (Date.now() - state.lastMutationAt >= STABLE_MS && !loadingVisible()) return true;
            await wait(100);
        }
        return false;
    }

    async function sweepSchedule() {
        const collected = new Map();
        mergeScan(collected, minimalShiftElements());
        const first = minimalShiftElements()[0]?.el || null;
        const scroller = findScrollableAncestor(first);
        if (!scroller) {
            return { rows: [...collected.values()], scrollSweepComplete: true, scroller: 'none' };
        }

        const original = scroller.scrollTop;
        const max = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
        const step = Math.max(160, Math.floor(scroller.clientHeight * 0.72));
        let reachedBottom = false;
        try {
            for (let pos = 0, loops = 0; pos <= max + step && loops < 100; pos += step, loops += 1) {
                scroller.scrollTop = Math.min(pos, max);
                await wait(90);
                mergeScan(collected, minimalShiftElements(scroller));
                if (scroller.scrollTop >= max - 3) {
                    reachedBottom = true;
                    mergeScan(collected, minimalShiftElements(scroller));
                    break;
                }
            }
        } finally {
            scroller.scrollTop = original;
            await wait(100);
        }
        return { rows: [...collected.values()], scrollSweepComplete: reachedBottom, scroller: 'element' };
    }

    function groupCount(rows) {
        return new Set(rows.map(r => r.assignmentGroup).filter(Boolean)).size;
    }

    function regularCount(rows) {
        return rows.filter(r => regularCandidateText(r.rawText)).length;
    }

    function statusText() {
        if (!isPaired()) return 'OT collector: pair';
        if (state.captureRunning) return 'OT collector: reading…';
        if (state.status === 'sent-good') return 'OT collector: sent ✓';
        if (state.status === 'sent-partial') return 'OT collector: verify';
        if (state.status === 'error') return 'OT collector: error';
        return 'OT collector: ready';
    }

    function renderStatus() {
        let button = document.getElementById(UI_ID);
        if (!button) {
            button = document.createElement('button');
            button.id = UI_ID;
            button.type = 'button';
            button.title = 'Vector staffing collector for Rebel Command. Click to pair or view status.';
            button.style.cssText = [
                'position:fixed','right:12px','bottom:12px','z-index:2147483646',
                'border:1px solid rgba(255,255,255,.22)','border-radius:999px',
                'background:#111827','color:#e5e7eb','padding:7px 10px',
                'font:12px/1.2 system-ui,sans-serif','box-shadow:0 4px 16px rgba(0,0,0,.25)',
                'cursor:pointer','opacity:.86'
            ].join(';');
            button.addEventListener('click', configure);
            document.body.appendChild(button);
        }
        button.textContent = statusText();
    }

    async function verifyPair(p) {
        const response = await fetch(p.endpoint || ENDPOINT, {
            method: 'GET',
            headers: {
                Authorization: `Bearer ${p.token}`,
                'X-Rebel-Device-ID': p.deviceId
            },
            cache: 'no-store',
            credentials: 'omit'
        });
        if (!response.ok) throw new Error(`Pairing rejected (${response.status})`);
        return response.json().catch(() => ({}));
    }

    async function configure() {
        const current = pairing();
        if (current.deviceId && current.token) {
            const action = prompt('OT collector is paired. Type TEST to test, REPAIR to replace credentials, CLEAR to remove pairing, or leave blank to cancel.', 'TEST');
            if (!action) return;
            if (action.trim().toUpperCase() === 'CLEAR') {
                localStorage.removeItem(PAIR_KEY);
                state.status = 'idle';
                renderStatus();
                return;
            }
            if (action.trim().toUpperCase() === 'TEST') {
                try {
                    await verifyPair(current);
                    alert('Rebel Command pairing is working.');
                } catch (err) {
                    alert(`Pairing test failed: ${err.message || err}`);
                }
                return;
            }
            if (action.trim().toUpperCase() !== 'REPAIR') return;
        }

        const deviceId = clean(prompt('Paste the Rebel Command Device ID:', current.deviceId || '') || '');
        if (!deviceId) return;
        const token = clean(prompt('Paste the private device token from Rebel Command:', '') || '');
        if (!token) return;
        const next = { deviceId, token, endpoint: ENDPOINT };
        try {
            await verifyPair(next);
            saveJSON(PAIR_KEY, next);
            state.status = 'idle';
            renderStatus();
            alert('OT collector paired with Rebel Command.');
            scheduleCapture(250);
        } catch (err) {
            alert(`Pairing failed: ${err.message || err}`);
        }
    }

    async function sendCapture(payload, digest) {
        const p = pairing();
        if (!p.deviceId || !p.token) return { skipped: true, reason: 'not-paired' };
        const response = await fetch(p.endpoint || ENDPOINT, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${p.token}`,
                'X-Rebel-Device-ID': p.deviceId,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ version: VERSION, staffingCapture: payload }),
            cache: 'no-store',
            credentials: 'omit'
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok || body?.ok === false) throw new Error(body?.error || `Rebel Command rejected capture (${response.status})`);
        state.lastDigest = digest;
        state.lastSentAt = Date.now();
        state.lastResult = body?.staffing || body;
        saveJSON(STATE_KEY, {
            lastDigest: state.lastDigest,
            lastSentAt: state.lastSentAt,
            lastResult: state.lastResult,
            lastDate: payload.days?.[0]?.workDate || '',
            version: VERSION
        });
        return body;
    }

    async function captureNow({ force = false } = {}) {
        if (state.captureRunning) return { skipped: true, reason: 'capture-running' };
        if (!isPaired()) {
            state.status = 'idle';
            renderStatus();
            return { skipped: true, reason: 'not-paired' };
        }

        state.captureRunning = true;
        state.status = 'reading';
        renderStatus();
        try {
            const stable = await waitStable();
            const beforeDate = detectDate();
            if (!beforeDate.date) throw new Error('Could not confidently identify the Vector schedule date.');

            const sweep = await sweepSchedule();
            await waitStable(3500);
            const afterDate = detectDate();
            if (beforeDate.date !== afterDate.date) return { skipped: true, reason: 'date-changed-during-sweep' };

            const rows = sweep.rows;
            const groups = groupCount(rows);
            const regularCandidates = regularCount(rows);
            const noLoading = !loadingVisible();
            const dateConfidence = beforeDate.confidence === 'high' && afterDate.confidence === 'high' ? 'high' : 'medium';
            const pageStable = stable && (Date.now() - state.lastMutationAt >= Math.min(STABLE_MS, 500));
            const fullCensus = pageStable
                && noLoading
                && sweep.scrollSweepComplete
                && dateConfidence === 'high'
                && rows.length >= MIN_ROWS_FOR_FULL_CENSUS
                && regularCandidates >= MIN_REGULAR_CANDIDATES
                && groups >= MIN_GROUPS_FOR_FULL_CENSUS;

            const digest = hash32(JSON.stringify({ date: beforeDate.date, rows: rows.map(r => [r.personId, r.assignmentGroup, r.rawText]).sort() }));
            if (!force && digest === state.lastDigest && Date.now() - state.lastSentAt < CAPTURE_COOLDOWN_MS) {
                return { skipped: true, reason: 'unchanged' };
            }

            const capturedAt = new Date().toISOString();
            const payload = {
                batchId: `listview:${beforeDate.date}:${Date.now()}:${digest}`,
                capturedAt,
                sourceVersion: `listview-scraper-${VERSION}`,
                pageMode: 'ListView',
                captureComplete: fullCensus,
                diagnostics: {
                    pageStable,
                    allVisibleGroupsScanned: sweep.scrollSweepComplete,
                    scrollSweepComplete: sweep.scrollSweepComplete,
                    noLoadingIndicator: noLoading,
                    dateConfidence,
                    dateSource: beforeDate.source,
                    visibleScheduleRows: rows.length,
                    candidateRegularRows: regularCandidates,
                    groupCount: groups,
                    scroller: sweep.scroller
                },
                days: [{
                    workDate: beforeDate.date,
                    shiftLabel: '',
                    rows
                }]
            };

            const result = await sendCapture(payload, digest);
            state.status = result?.staffing?.quality === 'good' ? 'sent-good' : 'sent-partial';
            state.lastResult = result;
            return { ok: true, fullCensus, rows: rows.length, regularCandidates, groups, result };
        } catch (err) {
            console.warn('Vector staffing collector:', err);
            state.status = 'error';
            state.lastResult = { error: String(err?.message || err) };
            return { ok: false, error: String(err?.message || err) };
        } finally {
            state.captureRunning = false;
            renderStatus();
        }
    }

    function scheduleCapture(delay = 1200) {
        clearTimeout(state.captureTimer);
        state.captureTimer = setTimeout(() => {
            if (!document.body) return;
            if (!/ListView/i.test(clean(document.body.textContent)) && minimalShiftElements().length < 5) return;
            captureNow().catch(() => {});
        }, delay);
    }

    const observer = new MutationObserver(() => {
        state.lastMutationAt = Date.now();
        scheduleCapture();
    });

    function start() {
        const saved = loadJSON(STATE_KEY, {});
        state.lastDigest = clean(saved.lastDigest);
        state.lastSentAt = Number(saved.lastSentAt) || 0;
        if (document.body) {
            renderStatus();
            observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
            scheduleCapture(1500);
        } else {
            window.addEventListener('DOMContentLoaded', start, { once: true });
        }
    }

    window.__vectorStaffingCollector = {
        version: VERSION,
        captureNow,
        configure,
        status: () => ({
            version: VERSION,
            paired: isPaired(),
            status: state.status,
            lastSentAt: state.lastSentAt,
            lastResult: state.lastResult
        })
    };

    start();
})();
