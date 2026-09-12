// ==UserScript==
// @name         Mission Vector Check It - Vector Scheduling Assistant DEV
// @namespace    mission-vector-check-it-scheduling
// @version      0.2.0-dev
// @description  Read-only Truck 504 rotation planning, Vector observation capture, and closed-loop reconciliation.
// @homepageURL  https://github.com/michaelbartbrion-cmd/mission-vector-check-it
// @supportURL   https://github.com/michaelbartbrion-cmd/mission-vector-check-it/issues
// @match        https://crewsense.com/*
// @match        https://*.crewsense.com/*
// @require      https://raw.githubusercontent.com/michaelbartbrion-cmd/mission-vector-check-it/feature/vector-scheduling-mvp/scheduling/rotation-engine.js
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const VERSION = '0.2.0-dev';
    const STATE_KEY = 'missionVectorScheduling_v2';
    const LEGACY_STATE_KEY = 'missionVectorScheduling_v1';
    const INSTANCE_KEY = '__missionVectorSchedulingAssistant';
    const PANEL_ID = 'mvci-scheduling-panel';
    const BUTTON_ID = 'mvci-scheduling-button';
    const STYLE_ID = 'mvci-scheduling-style';
    const Engine = window.VectorSchedulingEngine;

    if (!Engine) {
        console.error('Vector Scheduling Assistant: rotation-engine.js did not load.');
        return;
    }
    if (window[INSTANCE_KEY]) return;
    window[INSTANCE_KEY] = { version: VERSION, startedAt: Date.now() };

    const DEFAULT_STATE = {
        schemaVersion: 2,
        settings: {
            apparatusName: 'Truck 504',
            firefighters: [],
            command: [],
            scenarioDefault: 'auto',
            balanceStartDate: null,
            balanceEndDate: null,
            blockDays: 2,
            autoCaptureOnSchedulePages: true
        },
        history: [],
        dutyHistory: [],
        plans: [],
        observations: [],
        reviews: [],
        resolutions: [],
        metadata: {
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            lastCaptureAt: null,
            lastImportAt: null
        }
    };

    function clone(value) { return JSON.parse(JSON.stringify(value)); }
    function clean(value) { return Engine.clean(value); }
    function htmlEscape(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
    }
    function todayIso() {
        const d = new Date();
        const y = d.getFullYear();
        return `${y}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    }
    function addDays(iso, days) {
        const [y,m,d] = String(iso).split('-').map(Number);
        const dt = new Date(y, m-1, d, 12, 0, 0);
        dt.setDate(dt.getDate() + Number(days || 0));
        return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
    }
    function sortByDate(a,b) { return String(a.date || '').localeCompare(String(b.date || '')); }
    function uid(parts) { return parts.map(v => clean(v).toLowerCase()).join('|'); }

    function normalizeState(raw) {
        const base = clone(DEFAULT_STATE);
        const input = raw && typeof raw === 'object' ? raw : {};
        const merged = {
            ...base,
            ...input,
            settings: { ...base.settings, ...(input.settings || {}) },
            metadata: { ...base.metadata, ...(input.metadata || {}) }
        };
        for (const key of ['history','dutyHistory','plans','observations','reviews','resolutions']) {
            if (!Array.isArray(merged[key])) merged[key] = [];
        }
        if (!Array.isArray(merged.settings.firefighters)) merged.settings.firefighters = [];
        if (!Array.isArray(merged.settings.command)) merged.settings.command = [];
        merged.schemaVersion = 2;
        return merged;
    }

    function loadState() {
        try {
            const current = localStorage.getItem(STATE_KEY);
            if (current) return normalizeState(JSON.parse(current));
            const legacy = localStorage.getItem(LEGACY_STATE_KEY);
            if (legacy) {
                const migrated = normalizeState(JSON.parse(legacy));
                migrated.metadata.migratedFrom = LEGACY_STATE_KEY;
                saveState(migrated);
                return migrated;
            }
        } catch (err) {
            console.warn('Vector Scheduling Assistant: state load failed', err);
        }
        return normalizeState(null);
    }

    let state = loadState();

    function saveState(nextState = state) {
        nextState.metadata = { ...(nextState.metadata || {}), updatedAt: new Date().toISOString() };
        localStorage.setItem(STATE_KEY, JSON.stringify(nextState));
        state = nextState;
    }

    function configuredPeople() {
        return [...(state.settings.firefighters || []), ...(state.settings.command || [])];
    }
    function firefighterIds() { return (state.settings.firefighters || []).map(p => p.id); }
    function personById(id) { return configuredPeople().find(p => p.id === id) || { id, name: id }; }
    function commandEngineer() {
        return (state.settings.command || []).find(p => p.commandRole === 'engineer' || p.role === 'engineer') || null;
    }

    function dedupePush(list, row, keyFn) {
        const key = keyFn(row);
        const idx = list.findIndex(item => keyFn(item) === key);
        if (idx >= 0) list[idx] = row;
        else list.push(row);
    }

    function mergeImport(payload) {
        if (!payload || typeof payload !== 'object') throw new Error('Import file is not a JSON object.');
        if (payload.settings) {
            state.settings = { ...state.settings, ...payload.settings };
            if (Array.isArray(payload.settings.firefighters) && payload.settings.firefighters.length) state.settings.firefighters = payload.settings.firefighters;
            if (Array.isArray(payload.settings.command) && payload.settings.command.length) state.settings.command = payload.settings.command;
        }
        for (const row of (payload.history || [])) {
            dedupePush(state.history, row, x => uid([x.date,x.personId,x.credit,x.detail,x.source || '']));
        }
        for (const row of (payload.dutyHistory || [])) {
            dedupePush(state.dutyHistory, row, x => uid([x.date,x.personId,x.detail,x.source || '']));
        }
        for (const row of (payload.plans || [])) {
            dedupePush(state.plans, row, x => uid([x.date,x.personId]));
        }
        for (const row of (payload.observations || [])) {
            dedupePush(state.observations, row, x => uid([x.date,x.personId,x.capturedAt || '',x.source || '']));
        }
        for (const row of (payload.reviews || [])) {
            dedupePush(state.reviews, row, x => uid([x.date,x.personId,x.observationCapturedAt || '']));
        }
        for (const row of (payload.resolutions || [])) {
            dedupePush(state.resolutions, row, x => uid([x.date,x.personId,x.resolvedAt || '',x.source || '']));
        }
        state.metadata.lastImportAt = new Date().toISOString();
        saveState();
        reconcileAllPossible();
    }

    function latestObservation(date, personId) {
        return state.observations
            .filter(o => o.date === date && o.personId === personId)
            .sort((a,b) => String(b.capturedAt || '').localeCompare(String(a.capturedAt || '')))[0] || null;
    }
    function planFor(date, personId) {
        return state.plans.find(p => p.date === date && p.personId === personId) || null;
    }
    function historyFor(date, personId) {
        return state.history.find(h => h.date === date && h.personId === personId && h.credit) || null;
    }

    function availabilityFromObservation(obs) {
        if (!obs || obs.found === false) return { code:'unknown', label:'Unknown', available:null };
        const text = `${obs.rawText || ''} ${obs.assignment || ''}`;
        if (Engine.isOffLikeText(text)) return { code:'off', label:obs.assignment || 'Off', available:false };
        if (Engine.isTruckAssignment(obs.assignment || text, state.settings.apparatusName)) return { code:'home', label:state.settings.apparatusName, available:true };
        if (Engine.isWorkingElsewhere(obs.assignment || text, state.settings.apparatusName)) return { code:'elsewhere', label:obs.assignment || 'Working elsewhere', available:false };
        return { code:'unknown', label:obs.assignment || 'Unknown', available:null };
    }

    function inferScenario(date) {
        const configuredDefault = state.settings.scenarioDefault || 'auto';
        if (configuredDefault !== 'auto') return configuredDefault;
        const engineer = commandEngineer();
        if (!engineer) return 'normal';
        const obs = latestObservation(date, engineer.id);
        if (!obs || obs.found === false) return 'normal';
        const avail = availabilityFromObservation(obs);
        const duty = clean(obs.dutyCode || Engine.detectDutyCode(obs.rawText || ''));
        if (avail.available === false) return 'tade-required';
        if (['TAC','Capt'].includes(duty)) return 'tade-required';
        return 'normal';
    }

    function parseFlexibleDateFromText(text) {
        const direct = Engine.parseDateFromText(text);
        if (direct) return direct;
        const s = clean(text);
        const m = s.match(/\b(?:Mon(?:day)?|Tue(?:sday)?|Wed(?:nesday)?|Thu(?:rsday)?|Fri(?:day)?|Sat(?:urday)?|Sun(?:day)?),?\s+(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{1,2}),\s+(20\d{2})\b/i);
        if (!m) return null;
        const months = {jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,sept:9,oct:10,nov:11,dec:12};
        const key = m[1].toLowerCase().slice(0,4).replace(/t$/,'');
        const month = months[key] || months[key.slice(0,3)];
        if (!month) return null;
        return `${m[3]}-${String(month).padStart(2,'0')}-${String(Number(m[2])).padStart(2,'0')}`;
    }
    function observedPageDate() {
        const body = document.body ? document.body.innerText : '';
        return parseFlexibleDateFromText(body);
    }
    function observedPageShift() {
        const body = document.body ? document.body.innerText : '';
        return Engine.detectShiftFromText(body) || null;
    }

    function ancestorCandidates(el) {
        const out = [];
        let node = el;
        for (let i=0; node && i<8; i++, node=node.parentElement) out.push(node);
        return out;
    }

    function scoreObservationContainer(el, personName) {
        if (!el || !el.innerText) return -Infinity;
        const text = clean(el.innerText);
        if (!text.toLowerCase().includes(clean(personName).toLowerCase())) return -Infinity;
        if (text.length > 1600) return -1000;
        let score = 0;
        if (el.matches && el.matches('tr, li, [role="row"], .row, .list-group-item')) score += 4;
        const keywords = ['Truck','Engine','Medic','Battalion','Deployment','Training','Vacation','Holiday','Sick','Leave','Salary','FFB','TM','DE-A','Capt','TAC','TADE','Swing'];
        for (const k of keywords) if (new RegExp(`\b${k.replace('-','\-')}\b`,'i').test(text)) score += 1;
        score -= Math.min(text.length / 500, 4);
        return score;
    }

    function findBestPersonContainer(personName) {
        const nameLower = clean(personName).toLowerCase();
        const all = Array.from(document.querySelectorAll('body *')).filter(el => {
            if (!el.children || el.children.length > 8) return false;
            const text = clean(el.textContent || '').toLowerCase();
            return text === nameLower || text.includes(nameLower);
        });
        let best = null;
        let bestScore = -Infinity;
        for (const match of all) {
            for (const candidate of ancestorCandidates(match)) {
                const score = scoreObservationContainer(candidate, personName);
                if (score > bestScore) { best = candidate; bestScore = score; }
            }
        }
        return best;
    }

    function captureCurrentPage({silent=false} = {}) {
        const date = observedPageDate();
        if (!date) {
            if (!silent) alert('Vector Scheduling Assistant could not determine the displayed date. Use Data > Import for API output, or open a day/list schedule page with a visible date.');
            return { captured:0, date:null };
        }
        const shift = observedPageShift();
        const people = configuredPeople();
        if (!people.length) {
            if (!silent) alert('No crew is configured yet. Import the private legacy/state JSON or crew configuration first.');
            return { captured:0, date };
        }
        const capturedAt = new Date().toISOString();
        let captured = 0;
        for (const person of people) {
            const container = findBestPersonContainer(person.name);
            const rawText = container ? clean(container.innerText) : '';
            const row = {
                date,
                shift,
                personId: person.id,
                personName: person.name,
                capturedAt,
                rawText,
                dutyCode: container ? Engine.detectDutyCode(rawText) : null,
                assignment: container ? Engine.detectAssignment(rawText) : null,
                found: !!container,
                source: 'vector-dom-readonly'
            };
            state.observations.push(row);
            if (row.found) captured++;
        }
        state.metadata.lastCaptureAt = capturedAt;
        saveState();
        reconcileDate(date);
        if (!silent) alert(`Captured ${captured}/${people.length} configured crew members for ${date}. No Vector data was changed.`);
        return { captured, date };
    }

    function upsertHistory(row) {
        const idx = state.history.findIndex(h => h.date === row.date && h.personId === row.personId && h.credit);
        if (idx >= 0) state.history[idx] = row;
        else state.history.push(row);
    }

    function removeHistoryCredit(date, personId) {
        state.history = state.history.filter(h => !(h.date === date && h.personId === personId && h.credit));
    }

    function reconcileDate(date) {
        const ids = firefighterIds();
        let changed = false;
        for (const personId of ids) {
            const plan = planFor(date, personId);
            const obs = latestObservation(date, personId);
            if (!obs || obs.found === false) continue;
            const result = Engine.reconcileFirefighter({
                planCredit: plan ? plan.credit : null,
                observation: obs,
                apparatusName: state.settings.apparatusName
            });
            const review = {
                date,
                personId,
                observationCapturedAt: obs.capturedAt,
                planCredit: plan ? plan.credit : null,
                status: result.status,
                detail: result.detail,
                credit: result.credit,
                reason: result.reason,
                source: obs.source
            };
            dedupePush(state.reviews, review, x => uid([x.date,x.personId,x.observationCapturedAt || '']));
            if (['verified','inferred'].includes(result.status) && result.credit) {
                upsertHistory({
                    date,
                    shift: obs.shift || null,
                    personId,
                    detail: result.detail,
                    credit: result.credit,
                    verified: true,
                    source: result.status === 'verified' ? 'vector-reconciled' : 'vector-inferred',
                    observedAt: obs.capturedAt,
                    planCredit: plan ? plan.credit : null
                });
                changed = true;
            }
        }
        if (changed) saveState();
    }

    function reconcileAllPossible() {
        const dates = [...new Set(state.observations.map(o => o.date).filter(Boolean))].sort();
        for (const date of dates) reconcileDate(date);
        saveState();
    }

    function unresolvedReviewItems() {
        const latestByKey = new Map();
        for (const r of state.reviews) {
            const key = uid([r.date,r.personId]);
            const prior = latestByKey.get(key);
            if (!prior || String(r.observationCapturedAt || '').localeCompare(String(prior.observationCapturedAt || '')) > 0) latestByKey.set(key,r);
        }
        return [...latestByKey.values()].filter(r => ['needs-review','exception'].includes(r.status));
    }

    function unresolvedHistoricalGaps() {
        const gaps = [];
        const start = state.settings.balanceStartDate;
        const end = state.settings.balanceEndDate;
        const ids = firefighterIds();
        const dates = [...new Set(state.observations.map(o => o.date).filter(d => (!start || d > start) && (!end || d < end)))];
        for (const date of dates) {
            if (date >= todayIso()) continue;
            for (const id of ids) {
                const obs = latestObservation(date,id);
                if (!obs || obs.found === false) continue;
                const text = `${obs.rawText || ''} ${obs.assignment || ''}`;
                if (Engine.isOffLikeText(text)) continue;
                if (!(Engine.isTruckAssignment(obs.assignment || text,state.settings.apparatusName) || Engine.isWorkingElsewhere(obs.assignment || text,state.settings.apparatusName))) continue;
                if (!historyFor(date,id)) gaps.push({date,personId:id,observation:obs});
            }
        }
        return gaps.sort(sortByDate);
    }

    function resolveReview(date, personId, detail) {
        const credit = detail === 'No credit' ? null : Engine.normalizeCredit(detail);
        const resolution = {
            date,
            personId,
            resolutionDetail: detail,
            credit,
            resolvedAt: new Date().toISOString(),
            source: 'manual-review'
        };
        state.resolutions.push(resolution);
        if (credit) {
            upsertHistory({
                date,
                shift: latestObservation(date,personId)?.shift || null,
                personId,
                detail,
                credit,
                verified: true,
                source: 'manual-review',
                observedAt: latestObservation(date,personId)?.capturedAt || null
            });
        } else {
            removeHistoryCredit(date,personId);
        }
        state.reviews = state.reviews.map(r => {
            if (r.date === date && r.personId === personId) return { ...r, status:'resolved', resolutionDetail:detail, credit };
            return r;
        });
        saveState();
    }

    function savePlan(blockStartDate, assignmentByPerson, scenario, blockDays) {
        const days = Math.max(1, Math.min(2, Number(blockDays || 1)));
        for (let offset=0; offset<days; offset++) {
            const date = addDays(blockStartDate, offset);
            for (const [personId,credit] of Object.entries(assignmentByPerson || {})) {
                dedupePush(state.plans, {
                    date,
                    personId,
                    credit,
                    scenario,
                    blockStartDate,
                    createdAt: new Date().toISOString(),
                    source: 'assistant-plan'
                }, x => uid([x.date,x.personId]));
            }
        }
        saveState();
    }

    function currentStats() {
        return Engine.statsFromHistory(
            state.history,
            firefighterIds(),
            state.settings.balanceStartDate || null,
            state.settings.balanceEndDate || null
        );
    }

    function recommendationExplanation(rec, current, ids) {
        const pieces = [];
        for (const id of ids) {
            const role = rec.assignmentByPerson[id];
            if (!role) continue;
            const before = current[id]?.ratios?.[role] || 0;
            const after = rec.stats[id]?.ratios?.[role] || 0;
            pieces.push(`${personById(id).name}: ${role} ${(before*100).toFixed(1)}% → ${(after*100).toFixed(1)}%`);
        }
        return pieces.join(' · ');
    }

    function statusBadge(label, kind='neutral') {
        return `<span class="mvci-badge mvci-${kind}">${htmlEscape(label)}</span>`;
    }

    function injectStyle() {
        if (document.getElementById(STYLE_ID)) return;
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
#${BUTTON_ID}{position:fixed;right:18px;bottom:18px;z-index:2147483646;background:#17365d;color:#fff;border:0;border-radius:999px;width:54px;height:54px;font:700 14px Arial;box-shadow:0 3px 14px rgba(0,0,0,.35);cursor:pointer}
#${PANEL_ID}{position:fixed;top:0;right:0;z-index:2147483647;width:min(520px,96vw);height:100vh;background:#f7f9fc;color:#1b2430;box-shadow:-4px 0 18px rgba(0,0,0,.26);font:13px/1.4 Arial,sans-serif;display:flex;flex-direction:column}
#${PANEL_ID} *{box-sizing:border-box} .mvci-head{background:#17365d;color:white;padding:14px 16px;display:flex;align-items:center;justify-content:space-between}.mvci-head h2{font-size:16px;margin:0}.mvci-close{background:transparent;border:0;color:white;font-size:22px;cursor:pointer}.mvci-tabs{display:flex;gap:6px;padding:9px;background:#e8eef6;border-bottom:1px solid #cbd6e3}.mvci-tabs button{border:1px solid #9fb1c6;background:white;padding:7px 10px;border-radius:5px;cursor:pointer}.mvci-tabs button.active{background:#17365d;color:white}.mvci-body{padding:12px;overflow:auto;flex:1}.mvci-card{background:white;border:1px solid #d8e0e9;border-radius:8px;padding:11px;margin:0 0 10px}.mvci-card h3{margin:0 0 8px;font-size:14px}.mvci-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.mvci-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.mvci-row label{font-weight:600}.mvci-table{width:100%;border-collapse:collapse;font-size:12px}.mvci-table th,.mvci-table td{border-bottom:1px solid #e0e6ed;padding:6px;text-align:left;vertical-align:top}.mvci-table th{background:#eef3f8}.mvci-input,.mvci-select{width:100%;padding:7px;border:1px solid #aebdce;border-radius:5px;background:#fff}.mvci-btn{border:1px solid #315a88;background:#315a88;color:#fff;padding:7px 10px;border-radius:5px;cursor:pointer}.mvci-btn.secondary{background:#fff;color:#17365d}.mvci-badge{display:inline-block;padding:2px 6px;border-radius:999px;font-size:11px;font-weight:700}.mvci-good{background:#d8f3dc;color:#215c2e}.mvci-warn{background:#fff0c2;color:#775500}.mvci-neutral{background:#e7edf4;color:#344a61}.mvci-muted{color:#687787;font-size:12px}.mvci-recommend{border-left:4px solid #315a88}.mvci-provisional{border-left:4px solid #c48a00}.mvci-mono{font-family:Consolas,monospace;font-size:11px;white-space:pre-wrap;word-break:break-word}
`;
        document.head.appendChild(style);
    }

    let activeTab = 'dashboard';
    let planDraft = null;

    function renderPanel() {
        injectStyle();
        let panel = document.getElementById(PANEL_ID);
        if (!panel) {
            panel = document.createElement('div');
            panel.id = PANEL_ID;
            document.body.appendChild(panel);
        }
        panel.innerHTML = `
            <div class="mvci-head"><h2>Vector Scheduling Assistant <span style="opacity:.65;font-size:11px">${VERSION}</span></h2><button class="mvci-close" id="mvci-close">×</button></div>
            <div class="mvci-tabs">
              ${['dashboard','plan','reconcile','data'].map(t => `<button data-tab="${t}" class="${activeTab===t?'active':''}">${t[0].toUpperCase()+t.slice(1)}</button>`).join('')}
            </div>
            <div class="mvci-body">${renderActiveTab()}</div>`;
        panel.querySelector('#mvci-close').onclick = () => panel.remove();
        panel.querySelectorAll('[data-tab]').forEach(btn => btn.onclick = () => { activeTab = btn.dataset.tab; planDraft=null; renderPanel(); });
        bindTabEvents(panel);
    }

    function renderActiveTab() {
        if (activeTab === 'plan') return renderPlanTab();
        if (activeTab === 'reconcile') return renderReconcileTab();
        if (activeTab === 'data') return renderDataTab();
        return renderDashboardTab();
    }

    function renderDashboardTab() {
        const ids = firefighterIds();
        const stats = currentStats();
        const gaps = unresolvedHistoricalGaps();
        const reviews = unresolvedReviewItems();
        const configured = ids.length > 0;
        const pageDate = observedPageDate();
        let html = '';
        if (!configured) {
            html += `<div class="mvci-card mvci-provisional"><h3>Configuration needed</h3><div>Import the private legacy/state JSON or an API probe import. No crew names are embedded in the public userscript.</div></div>`;
        }
        html += `<div class="mvci-card"><h3>Closed-loop status</h3><div class="mvci-grid">
            <div><div class="mvci-muted">Displayed Vector date</div><strong>${htmlEscape(pageDate || 'Not detected')}</strong></div>
            <div><div class="mvci-muted">Last capture</div><strong>${htmlEscape(state.metadata.lastCaptureAt ? new Date(state.metadata.lastCaptureAt).toLocaleString() : 'None')}</strong></div>
            <div><div class="mvci-muted">Unresolved reviews</div><strong>${reviews.length}</strong></div>
            <div><div class="mvci-muted">Historical gaps</div><strong>${gaps.length}</strong></div>
        </div></div>`;
        if (ids.length) {
            html += `<div class="mvci-card"><h3>Confirmed actual rotation ratios</h3><table class="mvci-table"><thead><tr><th>Firefighter</th>${Engine.CREDIT_CATEGORIES.map(c=>`<th>${c}</th>`).join('')}<th>Total</th></tr></thead><tbody>`;
            for (const id of ids) {
                const s = stats[id] || {ratios:{},total:0};
                html += `<tr><td><strong>${htmlEscape(personById(id).name)}</strong></td>${Engine.CREDIT_CATEGORIES.map(c=>`<td>${((s.ratios[c]||0)*100).toFixed(1)}%</td>`).join('')}<td>${s.total||0}</td></tr>`;
            }
            html += `</tbody></table><div class="mvci-muted" style="margin-top:6px">Only reconciled/verified rotation credit is counted. Planned assignments do not change these ratios.</div></div>`;
        }
        const upcoming = state.plans.filter(p => p.date >= todayIso()).sort(sortByDate).slice(0,12);
        if (upcoming.length) {
            html += `<div class="mvci-card"><h3>Upcoming saved plans</h3><table class="mvci-table"><tr><th>Date</th><th>Person</th><th>Planned</th></tr>${upcoming.map(p=>`<tr><td>${p.date}</td><td>${htmlEscape(personById(p.personId).name)}</td><td>${htmlEscape(p.credit)}</td></tr>`).join('')}</table></div>`;
        }
        if (reviews.length) {
            html += `<div class="mvci-card mvci-provisional"><h3>Needs review</h3>${reviews.slice(0,8).map(r=>`<div style="margin:5px 0"><strong>${r.date} — ${htmlEscape(personById(r.personId).name)}</strong><br><span class="mvci-muted">${htmlEscape(r.reason)}</span></div>`).join('')}${reviews.length>8?`<div class="mvci-muted">+ ${reviews.length-8} more</div>`:''}</div>`;
        }
        return html;
    }

    function autoAvailableForDate(date) {
        const result = {};
        for (const person of state.settings.firefighters || []) {
            const obs = latestObservation(date,person.id);
            const a = availabilityFromObservation(obs);
            result[person.id] = a.available !== false;
        }
        return result;
    }

    function renderPlanTab() {
        const pageDate = observedPageDate() || todayIso();
        const draftDate = planDraft?.date || pageDate;
        const autoScenario = inferScenario(draftDate);
        const selectedScenario = planDraft?.scenario || autoScenario;
        const blockDays = planDraft?.blockDays || state.settings.blockDays || 2;
        const availability = planDraft?.availability || autoAvailableForDate(draftDate);
        const gaps = unresolvedHistoricalGaps();
        const provisional = gaps.length > 0;
        let html = `<div class="mvci-card ${provisional?'mvci-provisional':''}"><h3>Plan next Truck 504 rotation ${provisional?statusBadge('PROVISIONAL','warn'):statusBadge('HISTORY CLEAN','good')}</h3>
            <div class="mvci-grid"><div><label>Block start</label><input id="mvci-plan-date" class="mvci-input" type="date" value="${htmlEscape(draftDate)}"></div>
            <div><label>Days in block</label><select id="mvci-block-days" class="mvci-select"><option value="1" ${blockDays==1?'selected':''}>1</option><option value="2" ${blockDays==2?'selected':''}>2</option></select></div></div>
            <div style="margin-top:8px"><label>Scenario</label><select id="mvci-scenario" class="mvci-select"><option value="normal" ${selectedScenario==='normal'?'selected':''}>Normal — Firefighter / Tiller / Swing</option><option value="tade-required" ${selectedScenario==='tade-required'?'selected':''}>TADE required — Firefighter / Tiller / TADE</option></select><div class="mvci-muted">Auto inference currently resolves this date as <strong>${htmlEscape(autoScenario)}</strong>; you can override it.</div></div>
            <div style="margin-top:8px"><strong>Tracked firefighters available to assign</strong></div>`;
        for (const person of state.settings.firefighters || []) {
            const obs = latestObservation(draftDate,person.id);
            const a = availabilityFromObservation(obs);
            html += `<label style="display:flex;gap:8px;align-items:center;margin:6px 0"><input type="checkbox" class="mvci-avail" data-id="${htmlEscape(person.id)}" ${availability[person.id]?'checked':''}><span>${htmlEscape(person.name)}</span><span class="mvci-muted">${htmlEscape(a.label)}</span></label>`;
        }
        html += `<div class="mvci-row" style="margin-top:10px"><button class="mvci-btn" id="mvci-recommend">Calculate recommendations</button></div></div>`;

        if (planDraft?.recommendations?.length) {
            const current = currentStats();
            html += planDraft.recommendations.map((rec,index)=>`<div class="mvci-card mvci-recommend"><h3>#${index+1} recommendation</h3>
                ${Object.entries(rec.assignmentByPerson).map(([id,role])=>`<div><strong>${htmlEscape(personById(id).name)}</strong> → ${htmlEscape(role)}</div>`).join('')}
                <div class="mvci-muted" style="margin-top:6px">${htmlEscape(recommendationExplanation(rec,current,Object.keys(rec.assignmentByPerson)))}</div>
                <div class="mvci-muted">Fairness score ${rec.score.toFixed(6)} · improvement ${rec.improvement.toFixed(6)}</div>
                <button class="mvci-btn" style="margin-top:8px" data-save-rec="${index}">Save this plan</button></div>`).join('');
        } else if (planDraft?.reason) {
            html += `<div class="mvci-card mvci-provisional"><strong>No automatic recommendation:</strong> ${htmlEscape(planDraft.reason)}</div>`;
        }
        return html;
    }

    function latestReviewFor(date,personId) {
        return state.reviews.filter(r=>r.date===date && r.personId===personId)
            .sort((a,b)=>String(b.observationCapturedAt||'').localeCompare(String(a.observationCapturedAt||'')))[0] || null;
    }

    function renderReconcileTab() {
        const defaultDate = observedPageDate() || state.observations.map(o=>o.date).filter(Boolean).sort().reverse()[0] || todayIso();
        const date = planDraft?.reconcileDate || defaultDate;
        let html = `<div class="mvci-card"><h3>Verify what actually happened</h3><div class="mvci-row"><div style="flex:1"><label>Date</label><input id="mvci-rec-date" class="mvci-input" type="date" value="${htmlEscape(date)}"></div><button class="mvci-btn" id="mvci-run-reconcile">Reconcile date</button></div><div class="mvci-muted" style="margin-top:6px">Vector observations are read-only evidence. Rotation history is updated only when the result is verified/inferred or you resolve an exception manually.</div></div>`;
        for (const person of state.settings.firefighters || []) {
            const plan = planFor(date,person.id);
            const obs = latestObservation(date,person.id);
            const rev = latestReviewFor(date,person.id);
            const hist = historyFor(date,person.id);
            html += `<div class="mvci-card"><h3>${htmlEscape(person.name)} ${hist?statusBadge('CREDITED','good'):rev?statusBadge(rev.status.toUpperCase(),'warn'):statusBadge('PENDING','neutral')}</h3>
                <div><strong>Plan:</strong> ${htmlEscape(plan?.credit || 'None saved')}</div>
                <div><strong>Observed:</strong> ${htmlEscape(obs ? `${obs.dutyCode || ''} ${obs.assignment || ''}`.trim() || (obs.found===false?'Not found':'Unknown') : 'No observation')}</div>
                <div><strong>Rotation credit:</strong> ${htmlEscape(hist?.detail || hist?.credit || rev?.detail || 'None')}</div>
                ${rev?.reason?`<div class="mvci-muted">${htmlEscape(rev.reason)}</div>`:''}
                ${rev && ['needs-review','exception'].includes(rev.status) ? `<div class="mvci-row" style="margin-top:8px"><select class="mvci-select mvci-resolution" data-id="${htmlEscape(person.id)}" style="flex:1"><option>Firefighter</option><option>Swing/FF</option><option>Swing</option><option>Tiller</option><option>TADE</option><option>No credit</option></select><button class="mvci-btn secondary" data-resolve="${htmlEscape(person.id)}">Resolve</button></div>`:''}
            </div>`;
        }
        return html;
    }

    function renderDataTab() {
        const people = configuredPeople();
        const preview = JSON.stringify({
            apparatusName: state.settings.apparatusName,
            firefighters: state.settings.firefighters,
            command: state.settings.command,
            balanceStartDate: state.settings.balanceStartDate,
            balanceEndDate: state.settings.balanceEndDate,
            historyRows: state.history.length,
            plans: state.plans.length,
            observations: state.observations.length
        }, null, 2);
        return `<div class="mvci-card"><h3>Read Vector page</h3><button class="mvci-btn" id="mvci-capture">Capture displayed Vector date</button><div class="mvci-muted" style="margin-top:6px">Reads page text only. It does not click schedule controls or modify Vector.</div></div>
        <div class="mvci-card"><h3>Import / export</h3><input id="mvci-import" type="file" accept="application/json,.json" class="mvci-input"><div class="mvci-row" style="margin-top:8px"><button class="mvci-btn secondary" id="mvci-export">Export private state JSON</button><button class="mvci-btn secondary" id="mvci-reconcile-all">Reconcile all imported observations</button></div></div>
        <div class="mvci-card"><h3>Configuration summary</h3><div class="mvci-mono">${htmlEscape(preview)}</div></div>
        <div class="mvci-card"><h3>Privacy / safety</h3><div>${people.length ? `${people.length} private crew records are stored only in this browser's local storage.` : 'No private crew configuration is loaded.'}</div><div class="mvci-muted">The public repository contains no real crew names or API credentials.</div></div>`;
    }

    function bindTabEvents(panel) {
        if (activeTab === 'plan') {
            const dateEl = panel.querySelector('#mvci-plan-date');
            const scenarioEl = panel.querySelector('#mvci-scenario');
            const blockEl = panel.querySelector('#mvci-block-days');
            const updateDraftInputs = () => {
                const availability = {};
                panel.querySelectorAll('.mvci-avail').forEach(cb => availability[cb.dataset.id] = cb.checked);
                planDraft = { ...(planDraft || {}), date:dateEl.value, scenario:scenarioEl.value, blockDays:Number(blockEl.value), availability };
            };
            dateEl.onchange = () => { planDraft = { date:dateEl.value, scenario:inferScenario(dateEl.value), blockDays:Number(blockEl.value), availability:autoAvailableForDate(dateEl.value) }; renderPanel(); };
            scenarioEl.onchange = updateDraftInputs; blockEl.onchange = updateDraftInputs;
            panel.querySelectorAll('.mvci-avail').forEach(cb => cb.onchange = updateDraftInputs);
            panel.querySelector('#mvci-recommend').onclick = () => {
                updateDraftInputs();
                const ids = firefighterIds();
                const availableIds = ids.filter(id => planDraft.availability[id]);
                const result = Engine.recommendAssignments({
                    history: state.history,
                    firefighterIds: ids,
                    availableIds,
                    scenario: planDraft.scenario,
                    limit: 3,
                    startDate: state.settings.balanceStartDate || null,
                    endDate: state.settings.balanceEndDate || null,
                    repeatCount: planDraft.blockDays
                });
                planDraft.recommendations = result.recommendations || [];
                planDraft.reason = result.reason || null;
                renderPanel();
            };
            panel.querySelectorAll('[data-save-rec]').forEach(btn => btn.onclick = () => {
                const rec = planDraft.recommendations[Number(btn.dataset.saveRec)];
                if (!rec) return;
                savePlan(planDraft.date, rec.assignmentByPerson, planDraft.scenario, planDraft.blockDays);
                alert(`Saved ${planDraft.blockDays}-day plan starting ${planDraft.date}. This is plan intent only; it does not count as actual history.`);
                activeTab='dashboard'; planDraft=null; renderPanel();
            });
        }
        if (activeTab === 'reconcile') {
            const dateEl = panel.querySelector('#mvci-rec-date');
            dateEl.onchange = () => { planDraft = { ...(planDraft || {}), reconcileDate:dateEl.value }; renderPanel(); };
            panel.querySelector('#mvci-run-reconcile').onclick = () => { reconcileDate(dateEl.value); planDraft={...(planDraft||{}),reconcileDate:dateEl.value}; renderPanel(); };
            panel.querySelectorAll('[data-resolve]').forEach(btn => btn.onclick = () => {
                const id = btn.dataset.resolve;
                const select = panel.querySelector(`.mvci-resolution[data-id="${CSS.escape(id)}"]`);
                resolveReview(dateEl.value,id,select.value);
                renderPanel();
            });
        }
        if (activeTab === 'data') {
            panel.querySelector('#mvci-capture').onclick = () => { captureCurrentPage(); renderPanel(); };
            panel.querySelector('#mvci-reconcile-all').onclick = () => { reconcileAllPossible(); alert('Reconciled every imported/captured observation that can be classified safely.'); renderPanel(); };
            panel.querySelector('#mvci-import').onchange = async e => {
                const file = e.target.files?.[0]; if (!file) return;
                try { mergeImport(JSON.parse(await file.text())); alert(`Imported ${file.name}.`); renderPanel(); }
                catch (err) { alert(`Import failed: ${err.message}`); }
            };
            panel.querySelector('#mvci-export').onclick = () => {
                const safeState = clone(state);
                const blob = new Blob([JSON.stringify(safeState,null,2)], {type:'application/json'});
                const a = document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=`vector-scheduling-state-${todayIso()}.json`; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),1000);
            };
        }
    }

    function installButton() {
        injectStyle();
        if (document.getElementById(BUTTON_ID)) return;
        const btn = document.createElement('button');
        btn.id = BUTTON_ID; btn.type='button'; btn.textContent='VS'; btn.title='Vector Scheduling Assistant';
        btn.onclick = () => renderPanel();
        document.body.appendChild(btn);
    }

    function looksLikeSchedulePage() {
        const p = `${location.pathname} ${document.title}`.toLowerCase();
        return /schedule|listview|controlpanel/.test(p);
    }

    function autoCapture() {
        if (!state.settings.autoCaptureOnSchedulePages) return;
        if (!looksLikeSchedulePage()) return;
        if (!configuredPeople().length) return;
        const date = observedPageDate();
        if (!date) return;
        const recent = state.observations.filter(o => o.date===date && o.source==='vector-dom-readonly')
            .sort((a,b)=>String(b.capturedAt||'').localeCompare(String(a.capturedAt||'')))[0];
        if (recent && Date.now() - Date.parse(recent.capturedAt) < 5*60*1000) return;
        captureCurrentPage({silent:true});
    }

    function init() {
        installButton();
        setTimeout(autoCapture, 1800);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once:true});
    else init();
})();
