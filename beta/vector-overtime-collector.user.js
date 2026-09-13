// ==UserScript==
// @name         Mission Vector Check It - Overtime Collector
// @namespace    mission-vector-check-it
// @version      0.2.0
// @description  Read-only CrewSense overtime ranking/signup collector for Rebel Command.
// @match        https://www.crewsense.com/*
// @match        https://crewsense.com/*
// @updateURL    https://raw.githubusercontent.com/michaelbartbrion-cmd/mission-vector-check-it/main/beta/vector-overtime-collector.user.js
// @downloadURL  https://raw.githubusercontent.com/michaelbartbrion-cmd/mission-vector-check-it/main/beta/vector-overtime-collector.user.js
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    if (window.__vectorOvertimeCollector) return;

    const VERSION = '0.2.0';
    const ENDPOINT = 'https://base44.app/api/apps/6aa6b7634a031657377d4fad/functions/telemetryBridge';
    const PAIR_KEY = 'vectorOvertimeCollectorPairing_v1';
    const STATE_KEY = 'vectorOvertimeCollectorState_v1';
    const UI_ID = 'vector-overtime-collector-status';
    const STABLE_MS = 900;
    const CAPTURE_COOLDOWN_MS = 12000;
    const MIN_COMPLETE_RANKING_ROWS = 80;

    const state = {
        lastMutationAt: Date.now(),
        captureRunning: false,
        sweepRunning: false,
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
        try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); }
        catch { return fallback; }
    }

    function saveJSON(key, value) {
        localStorage.setItem(key, JSON.stringify(value));
    }

    function pairing() {
        const p = loadJSON(PAIR_KEY, {});
        return { deviceId: clean(p.deviceId), token: clean(p.token), endpoint: clean(p.endpoint) || ENDPOINT };
    }

    function isPaired() {
        const p = pairing();
        return !!(p.deviceId && p.token);
    }

    function rendered(el) {
        if (!el || !(el instanceof Element)) return false;
        const s = getComputedStyle(el);
        if (s.display === 'none' || s.visibility === 'hidden') return false;
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
    }

    function parseDateString(value) {
        const text = clean(value);
        let m = text.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/);
        if (m) return `${m[1]}-${String(Number(m[2])).padStart(2,'0')}-${String(Number(m[3])).padStart(2,'0')}`;
        m = text.match(/\b(\d{1,2})[\/-](\d{1,2})[\/-](20\d{2})\b/);
        if (m) return `${m[3]}-${String(Number(m[1])).padStart(2,'0')}-${String(Number(m[2])).padStart(2,'0')}`;
        return '';
    }

    function isRankingPage() {
        const path = location.pathname.toLowerCase();
        const body = clean(document.body?.textContent || '');
        return /callbackmodule\/rankings/.test(path)
            || (/rankings/i.test(body) && /overtime list/i.test(body) && /forecast rankings/i.test(body));
    }

    function detectForecastDate() {
        const label = [...document.querySelectorAll('label,div,span,p')]
            .filter(rendered)
            .find(el => /select date to forecast rankings/i.test(clean(el.textContent)));
        const scope = label?.parentElement?.parentElement || document;
        const candidates = [...scope.querySelectorAll('input')]
            .filter(rendered)
            .map(el => ({ value: clean(el.value), date: parseDateString(el.value) }))
            .filter(x => x.date);
        if (candidates.length === 1) return { date: candidates[0].date, confidence: 'high', source: 'forecast-date-input' };

        const allInputs = [...document.querySelectorAll('input')]
            .filter(rendered)
            .map(el => ({ value: clean(el.value), date: parseDateString(el.value) }))
            .filter(x => x.date);
        const unique = [...new Set(allInputs.map(x => x.date))];
        if (unique.length === 1) return { date: unique[0], confidence: 'high', source: 'unique-visible-date-input' };
        return { date: '', confidence: 'none', source: 'not-found' };
    }

    function loadingVisible() {
        const busy = [...document.querySelectorAll('[aria-busy="true"],.loading,.spinner,[class*="loading"],[class*="spinner"]')].some(rendered);
        if (busy) return true;
        return [...document.querySelectorAll('div,span,p')]
            .filter(rendered)
            .some(el => /^(loading|please wait|updating|refreshing)\.{0,3}$/i.test(clean(el.textContent)));
    }

    function parseRankingText(text) {
        const t = clean(text);
        if (t.length < 12 || t.length > 500) return null;
        const m = t.match(/^(\d{1,3})\.\s+(.+?)\s+(-?[\d,]+(?:\.\d+)?)\s*hrs?\s*(?:\((.*?)\))?\s*$/i);
        if (!m) return null;
        const rank = Number(m[1]);
        const hours = Number(m[3].replace(/,/g, ''));
        const personName = clean(m[2]);
        if (!Number.isInteger(rank) || rank < 1 || !Number.isFinite(hours) || hours < 0 || !personName) return null;
        return { rank, personName, overtimeHours: hours, tieBreakText: clean(m[4] || ''), rawText: t };
    }

    function minimalRankingElements(root = document) {
        const pool = [...root.querySelectorAll('tr,[role="row"],li,article,div')]
            .filter(el => el.id !== UI_ID && !el.closest(`#${UI_ID}`))
            .map(el => ({ el, parsed: parseRankingText(el.textContent) }))
            .filter(x => x.parsed);
        const selected = [];
        for (const item of pool.sort((a,b) => clean(a.el.textContent).length - clean(b.el.textContent).length)) {
            if (selected.some(x => item.el.contains(x.el))) continue;
            selected.push(item);
        }
        return selected;
    }

    function findScroller(el) {
        let node = el?.parentElement || null;
        for (let depth = 0; node && depth < 14; depth += 1, node = node.parentElement) {
            const s = getComputedStyle(node);
            if (node.scrollHeight > node.clientHeight + 80 && /(auto|scroll)/i.test(s.overflowY || '')) return node;
        }
        return document.scrollingElement || document.documentElement;
    }

    function mergeRanking(target, items) {
        for (const item of items) {
            const row = item.parsed || parseRankingText(item.el?.textContent);
            if (!row) continue;
            target.set(row.rank, row);
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

    async function sweepRanking() {
        const collected = new Map();
        const firstScan = minimalRankingElements();
        mergeRanking(collected, firstScan);
        const scroller = findScroller(firstScan[0]?.el);
        const isDocument = scroller === document.scrollingElement || scroller === document.documentElement || scroller === document.body;
        const original = isDocument ? window.scrollY : scroller.scrollTop;
        const viewport = isDocument ? window.innerHeight : scroller.clientHeight;
        const max = isDocument
            ? Math.max(0, document.documentElement.scrollHeight - window.innerHeight)
            : Math.max(0, scroller.scrollHeight - scroller.clientHeight);
        const step = Math.max(250, Math.floor(viewport * 0.72));
        let reachedBottom = max === 0;
        try {
            for (let pos = 0, loops = 0; pos <= max + step && loops < 160; pos += step, loops += 1) {
                const target = Math.min(pos, max);
                if (isDocument) window.scrollTo(0, target); else scroller.scrollTop = target;
                await wait(75);
                mergeRanking(collected, minimalRankingElements(isDocument ? document : scroller));
                const current = isDocument ? window.scrollY : scroller.scrollTop;
                if (current >= max - 4) {
                    reachedBottom = true;
                    mergeRanking(collected, minimalRankingElements(isDocument ? document : scroller));
                    break;
                }
            }
        } finally {
            if (isDocument) window.scrollTo(0, original); else scroller.scrollTop = original;
            await wait(100);
        }
        return { rows: [...collected.values()].sort((a,b) => a.rank - b.rank), scrollSweepComplete: reachedBottom };
    }

    function rankingDiagnostics(rows) {
        const sequential = rows.length > 0 && rows.every((r,i) => r.rank === i + 1);
        const uniqueNames = new Set(rows.map(r => clean(r.personName).toLowerCase())).size === rows.length;
        const michael = rows.find(r => clean(r.personName).toLowerCase() === 'michael brion');
        return { sequential, uniqueNames, michaelFound: !!michael, michaelRank: michael?.rank || null, michaelHours: michael?.overtimeHours ?? null };
    }

    function statusText() {
        if (!isPaired()) return 'OT priority: pair';
        if (state.captureRunning) return 'OT priority: reading…';
        if (state.status === 'sent-good') return 'OT priority: sent ✓';
        if (state.status === 'sent-partial') return 'OT priority: verify';
        if (state.status === 'error') return 'OT priority: error';
        return 'OT priority: ready';
    }

    function renderStatus() {
        let button = document.getElementById(UI_ID);
        if (!button) {
            button = document.createElement('button');
            button.id = UI_ID;
            button.type = 'button';
            button.title = 'CrewSense overtime priority collector for Rebel Command';
            button.style.cssText = [
                'position:fixed','right:12px','bottom:12px','z-index:2147483646',
                'border:1px solid rgba(255,255,255,.22)','border-radius:999px',
                'background:#111827','color:#e5e7eb','padding:7px 10px',
                'font:12px/1.2 system-ui,sans-serif','box-shadow:0 4px 16px rgba(0,0,0,.25)',
                'cursor:pointer','opacity:.88'
            ].join(';');
            button.addEventListener('click', configure);
            document.body.appendChild(button);
        }
        button.textContent = statusText();
    }

    async function verifyPair(p) {
        const response = await fetch(p.endpoint || ENDPOINT, {
            method: 'GET',
            headers: { Authorization: `Bearer ${p.token}`, 'X-Rebel-Device-ID': p.deviceId },
            cache: 'no-store', credentials: 'omit'
        });
        if (!response.ok) throw new Error(`Pairing rejected (${response.status})`);
        return response.json().catch(() => ({}));
    }

    async function fetchWorklist() {
        const p = pairing();
        if (!p.deviceId || !p.token) throw new Error('Collector is not paired.');
        const url = new URL(p.endpoint || ENDPOINT);
        url.searchParams.set('action', 'overtime-worklist');
        const response = await fetch(url.toString(), {
            method: 'GET',
            headers: { Authorization: `Bearer ${p.token}`, 'X-Rebel-Device-ID': p.deviceId },
            cache: 'no-store', credentials: 'omit'
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok || body?.ok === false) throw new Error(body?.error || `Could not load OT worklist (${response.status})`);
        return body;
    }

    function formatUsDate(date) {
        const m = String(date || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
        return m ? `${Number(m[2])}/${Number(m[3])}/${m[1]}` : '';
    }

    function findForecastControls() {
        const label = [...document.querySelectorAll('label,div,span,p')]
            .filter(rendered)
            .find(el => /select date to forecast rankings/i.test(clean(el.textContent)));
        if (!label) return null;
        let scope = label.parentElement;
        for (let depth = 0; scope && depth < 7; depth += 1, scope = scope.parentElement) {
            const inputs = [...scope.querySelectorAll('input')].filter(rendered).filter(el => parseDateString(el.value));
            if (!inputs.length) continue;
            const input = inputs[0];
            const buttons = [...scope.querySelectorAll('button')]
                .filter(rendered)
                .filter(b => !b.disabled && b.getAttribute('aria-disabled') !== 'true');
            const following = buttons.filter(b => !!(input.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING));
            const submit = following.find(b => {
                const text = clean(b.innerText || b.getAttribute('aria-label') || b.title || '');
                const classes = clean(b.className).toLowerCase();
                const lower = text.toLowerCase();
                return lower !== 'x' && lower !== 'clear' && lower !== 'reset'
                    && !/calendar|date picker/.test(lower)
                    && !/danger|delete|remove|red|calendar|datepicker/.test(classes);
            });
            if (submit) return { input, submit };
        }
        return null;
    }

    async function setForecastDate(date) {
        const controls = findForecastControls();
        if (!controls) throw new Error('Could not safely identify the forecast-date controls.');
        const value = formatUsDate(date);
        if (!value) throw new Error(`Invalid forecast date: ${date}`);
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
        if (setter) setter.call(controls.input, value); else controls.input.value = value;
        controls.input.dispatchEvent(new Event('input', { bubbles: true }));
        controls.input.dispatchEvent(new Event('change', { bubbles: true }));
        controls.input.dispatchEvent(new Event('blur', { bubbles: true }));
        await wait(150);
        controls.submit.click();
        const start = Date.now();
        while (Date.now() - start < 12000) {
            await wait(200);
            const detected = detectForecastDate();
            if (detected.date === date && !loadingVisible() && Date.now() - state.lastMutationAt >= 500) return true;
        }
        throw new Error(`Vector did not settle on forecast date ${date}.`);
    }

    async function sweepNeededRankings({ limit = 20 } = {}) {
        if (state.sweepRunning || state.captureRunning || !isRankingPage() || !isPaired()) return { skipped: true, reason: 'busy-or-not-ready' };
        state.sweepRunning = true;
        renderStatus();
        let originalDate = '';
        const results = [];
        try {
            const worklist = await fetchWorklist();
            if (worklist?.rankingParserVerified !== true) return { skipped: true, reason: 'ranking-parser-not-verified' };
            const needed = (Array.isArray(worklist?.dates) ? worklist.dates : [])
                .filter(x => x?.rankingNeeded === true && /^20\d{2}-\d{2}-\d{2}$/.test(String(x?.workDate || '')))
                .slice(0, Math.max(1, Math.min(60, Number(limit) || 20)));
            if (!needed.length) return { ok: true, captured: 0, reason: 'nothing-needed' };
            originalDate = detectForecastDate().date;
            for (const item of needed) {
                await setForecastDate(item.workDate);
                await waitStable(8000);
                const result = await captureRanking({ force: true });
                results.push({ workDate: item.workDate, result });
                await wait(500);
            }
            return { ok: true, captured: results.length, results };
        } catch (err) {
            console.warn('Vector overtime ranking sweep:', err);
            return { ok: false, error: String(err?.message || err), results };
        } finally {
            if (originalDate && detectForecastDate().date !== originalDate) {
                try { await setForecastDate(originalDate); } catch { /* leave current date if restore fails */ }
            }
            state.sweepRunning = false;
            renderStatus();
        }
    }

    async function configure() {
        const current = pairing();
        if (current.deviceId && current.token) {
            const action = prompt('OT priority collector is paired. Type TEST to test, REPAIR to replace credentials, CLEAR to remove pairing, or leave blank to cancel.', 'TEST');
            if (!action) return;
            const upper = action.trim().toUpperCase();
            if (upper === 'CLEAR') { localStorage.removeItem(PAIR_KEY); state.status='idle'; renderStatus(); return; }
            if (upper === 'TEST') {
                try { await verifyPair(current); alert('Rebel Command pairing is working.'); }
                catch (err) { alert(`Pairing test failed: ${err.message || err}`); }
                return;
            }
            if (upper !== 'REPAIR') return;
        }
        const deviceId = clean(prompt('Paste the Rebel Command Device ID:', current.deviceId || '') || '');
        if (!deviceId) return;
        const token = clean(prompt('Paste the private device token from Rebel Command:', '') || '');
        if (!token) return;
        const next = { deviceId, token, endpoint: ENDPOINT };
        try {
            await verifyPair(next);
            saveJSON(PAIR_KEY, next);
            state.status='idle'; renderStatus();
            alert('OT priority collector paired with Rebel Command.');
            scheduleCapture(250);
        } catch (err) { alert(`Pairing failed: ${err.message || err}`); }
    }

    async function sendRankingCapture(payload, digest) {
        const p = pairing();
        if (!p.deviceId || !p.token) return { skipped:true, reason:'not-paired' };
        const response = await fetch(p.endpoint || ENDPOINT, {
            method:'POST',
            headers:{ Authorization:`Bearer ${p.token}`, 'X-Rebel-Device-ID':p.deviceId, 'Content-Type':'application/json' },
            body: JSON.stringify({ version: VERSION, rankingCapture: payload }),
            cache:'no-store', credentials:'omit'
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok || body?.ok === false) throw new Error(body?.error || `Rebel Command rejected ranking capture (${response.status})`);
        state.lastDigest = digest;
        state.lastSentAt = Date.now();
        state.lastResult = body?.ranking || body;
        saveJSON(STATE_KEY, { lastDigest:state.lastDigest, lastSentAt:state.lastSentAt, lastResult:state.lastResult, lastDate:payload.forecastDate, version:VERSION });
        return body;
    }

    async function captureRanking({ force=false }={}) {
        if (state.captureRunning || !isRankingPage()) return { skipped:true, reason:'not-ranking-page-or-busy' };
        if (!isPaired()) { state.status='idle'; renderStatus(); return { skipped:true, reason:'not-paired' }; }
        state.captureRunning = true;
        state.status = 'reading';
        renderStatus();
        try {
            const stable = await waitStable();
            const before = detectForecastDate();
            if (!before.date) throw new Error('Could not identify the forecast ranking date.');
            const sweep = await sweepRanking();
            await waitStable(3500);
            const after = detectForecastDate();
            if (before.date !== after.date) return { skipped:true, reason:'date-changed-during-ranking-sweep' };
            const rows = sweep.rows;
            const diag = rankingDiagnostics(rows);
            const noLoading = !loadingVisible();
            const pageStable = stable && (Date.now() - state.lastMutationAt >= Math.min(STABLE_MS,500));
            const dateConfidence = before.confidence === 'high' && after.confidence === 'high' ? 'high' : 'medium';
            const full = pageStable && noLoading && sweep.scrollSweepComplete && dateConfidence === 'high'
                && rows.length >= MIN_COMPLETE_RANKING_ROWS && diag.sequential && diag.uniqueNames && diag.michaelFound;
            const digest = hash32(JSON.stringify({ date:before.date, rows:rows.map(r => [r.rank,r.personName,r.overtimeHours,r.tieBreakText]) }));
            if (!force && digest === state.lastDigest && Date.now()-state.lastSentAt < CAPTURE_COOLDOWN_MS) return { skipped:true, reason:'unchanged' };
            const capturedAt = new Date().toISOString();
            const payload = {
                batchId:`ranking:${before.date}:${Date.now()}:${digest}`,
                forecastDate:before.date,
                capturedAt,
                tier:'Tier 1',
                sourceVersion:`crewsense-overtime-${VERSION}`,
                pageUrl:location.href,
                captureComplete:full,
                diagnostics:{ pageStable, noLoadingIndicator:noLoading, dateConfidence, dateSource:before.source, scrollSweepComplete:sweep.scrollSweepComplete, rowCount:rows.length, sequential:diag.sequential, uniqueNames:diag.uniqueNames, michaelFound:diag.michaelFound, michaelRank:diag.michaelRank, michaelHours:diag.michaelHours },
                rows: rows.map(r => ({ ...r, personId:`rank-${hash32(r.personName.toLowerCase())}` }))
            };
            const result = await sendRankingCapture(payload,digest);
            state.status = result?.ranking?.quality === 'good' ? 'sent-good' : 'sent-partial';
            state.lastResult = result;
            if (!state.sweepRunning) setTimeout(() => sweepNeededRankings().catch(() => {}), 1500);
            return { ok:true, full, rows:rows.length, diagnostics:diag, result };
        } catch (err) {
            console.warn('Vector overtime collector:',err);
            state.status='error';
            state.lastResult={error:String(err?.message||err)};
            return { ok:false,error:String(err?.message||err) };
        } finally {
            state.captureRunning=false;
            renderStatus();
        }
    }

    function scheduleCapture(delay=1200) {
        clearTimeout(state.captureTimer);
        state.captureTimer=setTimeout(() => {
            if (!document.body || !isRankingPage() || state.sweepRunning) return;
            captureRanking().catch(() => {});
        },delay);
    }

    const observer = new MutationObserver(() => {
        state.lastMutationAt = Date.now();
        scheduleCapture();
    });

    function start() {
        const saved=loadJSON(STATE_KEY,{});
        state.lastDigest=clean(saved.lastDigest);
        state.lastSentAt=Number(saved.lastSentAt)||0;
        if (document.body) {
            renderStatus();
            observer.observe(document.documentElement,{childList:true,subtree:true,characterData:true});
            scheduleCapture(1500);
        } else window.addEventListener('DOMContentLoaded',start,{once:true});
    }

    window.__vectorOvertimeCollector = {
        version:VERSION,
        captureRanking,
        sweepNeededRankings,
        fetchWorklist,
        configure,
        status:() => ({version:VERSION,paired:isPaired(),status:state.status,lastSentAt:state.lastSentAt,lastResult:state.lastResult})
    };

    start();
})();
