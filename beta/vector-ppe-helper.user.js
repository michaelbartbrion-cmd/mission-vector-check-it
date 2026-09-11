// ==UserScript==
// @name         Vector Check It - PPE Helper
// @namespace    mission-ppe
// @version      2.3.8
// @updateURL    https://raw.githubusercontent.com/michaelbartbrion-cmd/mission-vector-check-it/main/beta/vector-ppe-helper.user.js
// @downloadURL  https://raw.githubusercontent.com/michaelbartbrion-cmd/mission-vector-check-it/main/beta/vector-ppe-helper.user.js
// @homepageURL  https://github.com/michaelbartbrion-cmd/mission-vector-check-it
// @supportURL   https://github.com/michaelbartbrion-cmd/mission-vector-check-it/issues
// @description  Vector Rebel — v2.3.8 direct Item Log completion verification with preserved row multiplicity
// @match        https://checkitapp.targetsolutions.com/*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    // Safety: only one Vector Rebel engine may exist in a page.
    // The metadata @name stays on the legacy Tampermonkey identity so this build
    // replaces the previous helper instead of installing beside it.
    if (window.__vectorRebelInstance) {
        console.warn(
            `Vector Rebel 2.3.8: another instance (${window.__vectorRebelInstance.version || 'unknown'}) is already active on this page.`
        );
        return;
    }
    window.__vectorRebelInstance = {
        version: '2.3.8',
        startedAt: Date.now()
    };

    // ============================================================
    // STORAGE / CONSTANTS
    // ============================================================

    const VERSION = '2.3.8';
    const PANEL_ID = 'vector-ppe-helper-v23';
    const OVERLAY_ID = 'vector-ppe-overlay-v23';

    const CONFIG_KEY = 'vectorPpeConfig_v3';
    const LEGACY_CONFIG_KEY = 'vectorPpeConfig_v2';
    const SIGNATURE_LIBRARY_KEY = 'vectorPpeSignatureLibrary_v2';
    const SIGNATURE_CURSOR_KEY = 'vectorPpeSignatureCursor_v2';
    const RUN_KEY = 'vectorPpeRun_v23';
    const LAST_SUMMARY_KEY = 'vectorPpeLastRunSummary_v3';
    const LEGACY_LAST_SUMMARY_KEY = 'vectorPpeLastRunSummary_v2';
    const RUN_HISTORY_KEY = 'vectorPpeRunHistory_v3';
    const GEAR_SNAPSHOTS_KEY = 'vectorPpeGearSnapshots_v3';
    const LAST_DIAGNOSTIC_KEY = 'vectorPpeLastDiagnostic_v3';
    const STOPPED_RUN_KEY = 'vectorPpeStoppedRun_v3';
    const MIGRATION_NOTICE_KEY = 'vectorPpeMigrationNotice_v3';
    const PANEL_MINIMIZED_KEY = 'vectorPpePanelMinimized_v1';
    const ADMIN_UNLOCK_KEY = 'vectorRebelAdminUnlocked_v1';
    const CAPTAIN_LAST_SET_KEY = 'vectorRebelCaptainLastSet_v1';
    const MASTER_ROSTER_OVERRIDE_KEY = 'vectorRebelMasterRosterOverride_v1';
    const MASTER_ROSTER_REVIEW_KEY = 'vectorRebelMasterRosterReview_v1';
    const RUN_OWNER_KEY = 'vectorRebelRunOwner_v1';
    const TAB_SESSION_KEY = 'vectorRebelTabSession_v1';
    const RUN_OWNER_STALE_MS = 45 * 1000;
    const RUN_OWNER_HEARTBEAT_MS = 10 * 1000;

    function getOrCreateTabId() {
        let id = '';
        try {
            id = sessionStorage.getItem(TAB_SESSION_KEY) || '';
            if (!id) {
                id = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
                sessionStorage.setItem(TAB_SESSION_KEY, id);
            }
        } catch {
            // sessionStorage should be available in Vector, but fail safely if
            // the browser blocks it. This fallback lasts for this script instance.
            id = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        }
        return id;
    }

    const TAB_ID = getOrCreateTabId();
    // The plaintext admin code is never stored in the userscript. Only this SHA-256 hash is shipped.
    // This is a convenience/privacy gate for ordinary users, not tamper-proof security against someone
    // intentionally editing the public userscript.
    const ADMIN_CODE_SHA256 = '574edccdfc9573eef6cee4b0e400821c0924bf038417c5bf6889c57972d1f88d';

    // Page-session identity is used only to ensure post-submit dwell never carries
    // across a full reload/navigation. It is not a signature or inspection identifier.
    const PAGE_SESSION_ID = `${Date.now()}:${Math.round(performance.timeOrigin || Date.now())}:${Math.random().toString(36).slice(2, 10)}`;

    // Managed updater. Code updates are delivered by Tampermonkey from a static
    // GitHub raw URL. The manifest is advisory/safety metadata only; it never
    // downloads or evals JavaScript. Personal settings/signatures remain local.
    const UPDATE_CHANNEL = 'beta';
    const UPDATE_REPO_URL = 'https://github.com/michaelbartbrion-cmd/mission-vector-check-it';
    const UPDATE_INSTALL_URL = 'https://raw.githubusercontent.com/michaelbartbrion-cmd/mission-vector-check-it/main/beta/vector-ppe-helper.user.js';
    const UPDATE_MANIFEST_URL = 'https://raw.githubusercontent.com/michaelbartbrion-cmd/mission-vector-check-it/main/beta/version.json';
    const UPDATE_STATE_KEY = 'vectorPpeUpdateState_v1';
    const UPDATE_SUCCESS_INTERVAL_MS = 6 * 60 * 60 * 1000;
    const UPDATE_GATE_INTERVAL_MS = 15 * 60 * 1000;
    const UPDATE_FAILURE_INTERVAL_MS = 10 * 60 * 1000;
    const UPDATE_FETCH_TIMEOUT_MS = 5000;
    const REMOTE_HOLD_CACHE_MS = 24 * 60 * 60 * 1000;
    const POST_SUBMIT_RETURN_DWELL_MS = 1500;
    const POST_SUBMIT_HISTORY_GRACE_MS = 15000;
    const POST_SUBMIT_HISTORY_STABLE_POLLS = 3;
    const ITEM_LOG_SETTLE_TIMEOUT_MS = 14000;
    const ITEM_LOG_SETTLE_STABLE_POLLS = 5;
    const FAILED_RETURN_EVIDENCE_FLOOR_MS = 10000;

    // Built-in mappings belong to this department/profile scope only. A profile
    // declaring a different scope must provide its own complete mappings.
    const BUILTIN_PROFILE_SCOPE = 'cvfm-vector-ppe-2026';

    // Department master roster ships inside Vector Rebel so ordinary users never
    // need to scan the full PPE list. Michael/admin refreshes the roster locally,
    // reviews it, then that approved roster is embedded in a future program update.
    //
    // This first master-roster build intentionally starts empty. After the admin
    // refresh is reviewed, the exported JSON can be embedded here for distribution.
    const BUILTIN_MASTER_ROSTER_VERSION = '2026-09-10-bootstrap';
    const BUILTIN_MASTER_ROSTER = [
        // { name: 'First Last', prefix: 'LAST', active: true }
    ];

    // Existing proven single-signature key from the earlier helper.
    const LEGACY_SIGNATURE_KEY = 'vectorPpeSavedSignature_v1';

    const BUILTIN_MODES = {
        tour: {
            key: 'tour',
            title: 'Tour PPE Routine Inspection',
            short: 'Tour PPE',
            templates: {
                '300045': '112411', // Bunker Coat
                '300036': '118098', // Bunker Pant
                '299879': '118114', // Structural Gloves
                '299882': '118117', // Structural Helmet
                '299900': '118109', // Hood
                '299881': '118110'  // Structural Boot
            }
        },
        afterFire: {
            key: 'afterFire',
            title: 'PPE Routine Inspection (After Every Fire)',
            short: 'After Every Fire',
            templates: {
                '300045': '113025', // Bunker Coat
                '300036': '118099', // Bunker Pant
                '299879': '118115', // Structural Gloves
                '299882': '118118', // Structural Helmet
                '299900': '118101', // Hood
                '299881': '118112'  // Structural Boot
            }
        },
        captain: {
            key: 'captain',
            title: "Captain's Monthly PPE Routine Inspection",
            short: "Captain's Monthly",
            templates: {
                '300045': '113016', // Bunker Coat
                '300036': '118100', // Bunker Pant
                '299879': '118113', // Structural Gloves
                '299882': '118116', // Structural Helmet
                '299900': '118102', // Hood
                '299881': '118111'  // Structural Boot
            }
        }
    };

    const BUILTIN_POOL_TYPES = {
        '300045': 'Bunker Coat',
        '300036': 'Bunker Pant',
        '299879': 'Structural Gloves',
        '299882': 'Structural Helmet',
        '299900': 'Hood',
        '299881': 'Structural Boot'
    };

    const DEFAULT_DEPARTMENT_PROFILE = {
        name: 'Department PPE Profile',
        profileVersion: 2,
        profileScope: BUILTIN_PROFILE_SCOPE,
        replaceBuiltins: false,
        expectedGearCount: 10,
        poolTypes: deepCloneSafe(BUILTIN_POOL_TYPES),
        modeTemplates: {
            tour: deepCloneSafe(BUILTIN_MODES.tour.templates),
            afterFire: deepCloneSafe(BUILTIN_MODES.afterFire.templates),
            captain: deepCloneSafe(BUILTIN_MODES.captain.templates)
        }
    };

    const DEFAULT_CONFIG = {
        schemaVersion: 7,
        initialized: false,
        inspectorName: '',
        selfPrefix: '',
        tourCoatComment: '',
        peopleDirectory: [],
        captainRosterPrefixes: [],
        captainSets: [],
        localAssetRules: {},
        departmentProfile: DEFAULT_DEPARTMENT_PROFILE
    };

    function deepCloneSafe(value) {
        return JSON.parse(JSON.stringify(value));
    }

    const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
    let busy = false;
    let configCache = null;

    // ============================================================
    // GENERIC HELPERS
    // ============================================================

    function clean(value) {
        return (value || '').replace(/\s+/g, ' ').trim();
    }

    // Vector sometimes renders smart apostrophes/quotes in inspection titles.
    function uiText(value) {
        return clean(value)
            .replace(/[\u2018\u2019\u201B\u2032\u02BC]/g, "'")
            .replace(/[\u201C\u201D]/g, '"');
    }

    function uiEquals(a, b) {
        return uiText(a).toLowerCase() === uiText(b).toLowerCase();
    }

    function uiIncludes(haystack, needle) {
        return uiText(haystack).toLowerCase().includes(uiText(needle).toLowerCase());
    }

    function escapeRegex(value) {
        return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    function visible(el) {
        if (!el) return false;
        const r = el.getBoundingClientRect();
        const s = getComputedStyle(el);
        return (
            s.display !== 'none' &&
            s.visibility !== 'hidden' &&
            r.width > 0 &&
            r.height > 0
        );
    }

    function exactButton(text, root = document) {
        return [...root.querySelectorAll('button')].find(
            b => visible(b) && clean(b.innerText) === text
        ) || null;
    }

    function enabledButton(text, root = document) {
        const b = exactButton(text, root);
        if (!b || b.disabled || b.getAttribute('aria-disabled') === 'true') return null;
        return b;
    }

    function exactButtons(text, root = document) {
        return [...root.querySelectorAll('button')].filter(
            b => visible(b) && clean(b.innerText) === text
        );
    }

    async function waitFor(fn, timeout = 10000, interval = 100) {
        const start = Date.now();
        while (Date.now() - start < timeout) {
            const value = fn();
            if (value) return value;
            await sleep(interval);
        }
        throw new Error('Timed out waiting for Vector.');
    }


    async function bringIntoView(el, settleMs = 450) {
        if (!el) return;

        try {
            el.scrollIntoView({
                behavior: 'smooth',
                block: 'center',
                inline: 'nearest'
            });
        } catch {
            el.scrollIntoView(true);
        }

        await sleep(settleMs);

        // Fixed headers / nested scroll areas can still leave the element near
        // an edge. Nudge the page only when the target is outside the viewport.
        const r = el.getBoundingClientRect();
        const viewportH = window.innerHeight || document.documentElement.clientHeight || 0;
        if (viewportH && (r.top < 70 || r.bottom > viewportH - 40)) {
            const targetCenter = r.top + r.height / 2;
            const viewportCenter = viewportH / 2;
            window.scrollBy({
                top: targetCenter - viewportCenter,
                behavior: 'smooth'
            });
            await sleep(settleMs);
        }
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

    // ============================================================
    // MANAGED UPDATE / COMPATIBILITY HELPERS
    // ============================================================

    function parseVersion(value) {
        const m = clean(value).match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/);
        if (!m) return null;
        return {
            major: Number(m[1]),
            minor: Number(m[2]),
            patch: Number(m[3]),
            pre: m[4] || ''
        };
    }

    function prereleaseTokens(value) {
        // Split mixed identifiers such as "rc10" into ["rc", "10"] so
        // numeric portions compare numerically instead of lexicographically.
        // Dot/hyphen separators still preserve ordinary SemVer-like ordering.
        return String(value || '')
            .split(/[.-]/)
            .flatMap(part => part.match(/[A-Za-z]+|\d+/g) || [part])
            .filter(Boolean);
    }

    function comparePrerelease(a, b) {
        if (a === b) return 0;
        if (!a) return 1;   // stable > prerelease
        if (!b) return -1;
        const aa = prereleaseTokens(a);
        const bb = prereleaseTokens(b);
        const n = Math.max(aa.length, bb.length);
        for (let i = 0; i < n; i++) {
            if (aa[i] == null) return -1;
            if (bb[i] == null) return 1;
            const an = /^\d+$/.test(aa[i]);
            const bn = /^\d+$/.test(bb[i]);
            if (an && bn) {
                const av = Number(aa[i]);
                const bv = Number(bb[i]);
                if (av !== bv) return av < bv ? -1 : 1;
            } else if (an !== bn) {
                return an ? -1 : 1;
            } else {
                // Release tags are lowercase ASCII by policy. Compare code units
                // directly so ordering is deterministic across browser locales.
                if (aa[i] !== bb[i]) return aa[i] < bb[i] ? -1 : 1;
            }
        }
        return 0;
    }

    function compareVersions(a, b) {
        const av = parseVersion(a);
        const bv = parseVersion(b);
        if (!av || !bv) return null;
        for (const key of ['major', 'minor', 'patch']) {
            if (av[key] !== bv[key]) return av[key] < bv[key] ? -1 : 1;
        }
        return comparePrerelease(av.pre, bv.pre);
    }

    function validateUpdateManifest(raw) {
        if (!raw || typeof raw !== 'object') throw new Error('Update manifest is not an object.');
        const latestVersion = clean(raw.latestVersion);
        if (!parseVersion(latestVersion)) throw new Error('Update manifest has an invalid latestVersion.');
        const minimumSupportedVersion = clean(raw.minimumSupportedVersion || latestVersion);
        if (!parseVersion(minimumSupportedVersion)) throw new Error('Update manifest has an invalid minimumSupportedVersion.');
        const status = clean(raw.status || 'ok').toLowerCase();
        if (!['ok', 'testing', 'hold', 'disabled'].includes(status)) throw new Error(`Unknown update manifest status: ${status}`);
        const channel = clean(raw.channel || UPDATE_CHANNEL).toLowerCase();
        if (channel !== UPDATE_CHANNEL) throw new Error(`Update manifest channel mismatch: expected ${UPDATE_CHANNEL}, got ${channel || 'blank'}.`);
        const installUrl = clean(raw.installUrl || UPDATE_INSTALL_URL);
        const repoUrl = clean(raw.repoUrl || UPDATE_REPO_URL);
        // Do not let manifest text redirect users to an arbitrary installer/repository.
        // The executable update origin/path is fixed in the installed userscript metadata.
        if (installUrl !== UPDATE_INSTALL_URL) throw new Error('Update manifest installUrl does not match the pinned channel URL.');
        if (repoUrl !== UPDATE_REPO_URL) throw new Error('Update manifest repoUrl does not match the pinned repository URL.');
        return {
            channel,
            latestVersion,
            minimumSupportedVersion,
            status,
            message: clean(raw.message || ''),
            releaseNotes: clean(raw.releaseNotes || ''),
            installUrl,
            repoUrl,
            publishedAt: clean(raw.publishedAt || '')
        };
    }

    function getUpdateState() {
        const state = loadJSON(UPDATE_STATE_KEY, null);
        return state && typeof state === 'object' ? state : {};
    }

    async function fetchUpdateManifest(force = false, successIntervalMs = UPDATE_SUCCESS_INTERVAL_MS) {
        const state = getUpdateState();
        const now = Date.now();
        const lastAttempt = Date.parse(state.checkedAt || 0) || 0;
        const interval = state.error ? Math.min(UPDATE_FAILURE_INTERVAL_MS, successIntervalMs) : successIntervalMs;
        if (!force && lastAttempt && now - lastAttempt < interval) return state;

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), UPDATE_FETCH_TIMEOUT_MS);
        try {
            const response = await fetch(`${UPDATE_MANIFEST_URL}?t=${now}`, {
                cache: 'no-store',
                credentials: 'omit',
                signal: controller.signal
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const manifest = validateUpdateManifest(await response.json());
            const successfulAt = new Date().toISOString();
            const currentIsHold = ['hold', 'disabled'].includes(manifest.status);
            const priorWasHold = ['hold', 'disabled'].includes(clean(state?.manifest?.status).toLowerCase());
            const next = {
                checkedAt: successfulAt,
                successfulAt,
                manifest,
                error: '',
                lastHoldSeenAt: currentIsHold
                    ? successfulAt
                    : (state.lastHoldSeenAt || ''),
                lastHoldClearedAt: !currentIsHold && priorWasHold && state.lastHoldSeenAt
                    ? successfulAt
                    : (state.lastHoldClearedAt || '')
            };
            saveJSON(UPDATE_STATE_KEY, next);
            refreshPanelInfo();
            return next;
        } catch (error) {
            const next = {
                ...state,
                checkedAt: new Date().toISOString(),
                error: error?.name === 'AbortError' ? 'Update check timed out.' : `Update check failed: ${error.message}`
            };
            saveJSON(UPDATE_STATE_KEY, next);
            refreshPanelInfo();
            return next;
        } finally {
            clearTimeout(timer);
        }
    }

    function evaluateRemoteCompatibility(state = getUpdateState()) {
        const manifest = state?.manifest;
        if (!manifest) {
            if (state?.error) {
                return {
                    allowed: true,
                    severity: 'warning',
                    message: `Updater has never successfully reached GitHub; remote compatibility status cannot be verified. ${state.error}`
                };
            }
            return { allowed: true, severity: 'unknown', message: 'Update status has not been checked yet.' };
        }

        const successfulAt = Date.parse(state.successfulAt || 0) || 0;
        const age = successfulAt ? Date.now() - successfulAt : Infinity;
        const lastHoldSeenAt = Date.parse(state.lastHoldSeenAt || 0) || 0;
        const cmpMinimum = compareVersions(VERSION, manifest.minimumSupportedVersion);
        const cmpLatest = compareVersions(VERSION, manifest.latestVersion);

        if (cmpMinimum != null && cmpMinimum < 0) {
            return {
                allowed: false,
                severity: 'blocked',
                message: `Installed v${VERSION} is below required v${manifest.minimumSupportedVersion}. Open PPE Helper → UPDATES → OPEN UPDATE before starting another automated PPE run.`
            };
        }

        if (['hold', 'disabled'].includes(manifest.status)) {
            if (age <= REMOTE_HOLD_CACHE_MS) {
                return {
                    allowed: false,
                    severity: 'blocked',
                    message: manifest.message || 'Automation is temporarily held because the current Vector compatibility is not approved.'
                };
            }

            const holdSeen = lastHoldSeenAt
                ? ` Last confirmed hold was received ${new Date(lastHoldSeenAt).toLocaleString()}.`
                : '';
            const updateHint = cmpLatest != null && cmpLatest < 0
                ? ` Update v${manifest.latestVersion} is also available and should be installed before continuing if possible.`
                : '';

            return {
                allowed: true,
                severity: 'warning',
                message: `A previously received compatibility hold is older than ${Math.round(REMOTE_HOLD_CACHE_MS / 3600000)} hours and could not be reverified. Remote safety status is uncertain.${holdSeen}${updateHint}${state.error ? ` ${state.error}` : ''}`
            };
        }

        if (state.error) {
            const ageHours = successfulAt ? Math.floor(age / 3600000) : null;
            const updateHint = cmpLatest != null && cmpLatest < 0
                ? ` Update v${manifest.latestVersion} is available (installed v${VERSION}).`
                : '';
            if (age > REMOTE_HOLD_CACHE_MS) {
                return {
                    allowed: true,
                    severity: 'warning',
                    message: `${state.error} Last successful compatibility check was about ${ageHours ?? 'unknown'} hour(s) ago, so remote safety status is stale.${updateHint}`
                };
            }
            if (cmpLatest != null && cmpLatest < 0) {
                return {
                    allowed: true,
                    severity: 'update',
                    message: `Update available: v${manifest.latestVersion} (installed v${VERSION}). Latest compatibility refresh also failed, but the cached successful check is still within the ${Math.round(REMOTE_HOLD_CACHE_MS / 3600000)}-hour verification window. ${state.error}`
                };
            }
            return {
                allowed: true,
                severity: 'warning',
                message: `${state.error} Using the last successful compatibility result from ${state.successfulAt}.`
            };
        }

        if (cmpLatest != null && cmpLatest < 0) {
            return {
                allowed: true,
                severity: 'update',
                message: `Update available: v${manifest.latestVersion} (installed v${VERSION}).`
            };
        }

        return {
            allowed: true,
            severity: manifest.status === 'testing' ? 'testing' : 'ok',
            message: manifest.message || `v${VERSION} is current for the ${UPDATE_CHANNEL} channel.`
        };
    }

    function compatibilityNeedsAcknowledgement(state, gate) {
        if (!gate?.allowed) return false;
        if (gate.severity === 'unknown') return true;

        const successfulAt = Date.parse(state?.successfulAt || 0) || 0;
        if (!successfulAt) return true;

        const age = Date.now() - successfulAt;
        const stale = age > REMOTE_HOLD_CACHE_MS;
        const expiredHold = stale && ['hold', 'disabled'].includes(clean(state?.manifest?.status).toLowerCase());

        // A transient refresh failure over a still-fresh successful manifest is
        // visible in the panel but should not train users to dismiss a modal on
        // every run. Require acknowledgement only when verification is actually
        // absent/stale or a previously received hold has expired unverified.
        return stale || expiredHold;
    }

    async function ensureRemoteCompatibilityBeforeRun() {
        const state = await fetchUpdateManifest(false, UPDATE_GATE_INTERVAL_MS);
        const gate = evaluateRemoteCompatibility(state);

        if (!gate.allowed) {
            setStatus(`UPDATE / COMPATIBILITY HOLD: ${gate.message}`, false);
            alert(`Vector Rebel cannot start a new automated run.\n\n${gate.message}\n\nTo update: PPE Helper → UPDATES → OPEN UPDATE.\n\nYou can still use Vector manually.`);
            return false;
        }

        // GitHub/CSP/network uncertainty is intentionally fail-open so required
        // PPE work is not prevented solely by updater reachability. Acknowledge
        // only genuinely unverified/stale states; fresh cached status with a
        // transient refresh error remains a visible, non-modal panel warning.
        if (compatibilityNeedsAcknowledgement(state, gate)) {
            const proceed = confirm(
                `Vector Rebel could not fully verify remote compatibility status.\n\n` +
                `${gate.message}\n\n` +
                `Continue with this automated PPE run anyway?\n\n` +
                `Choose Cancel if you want to troubleshoot/update first.`
            );
            if (!proceed) {
                setStatus(`Run cancelled: ${gate.message}`, false);
                return false;
            }
        }

        return true;
    }

    function updateStatusHtml() {
        const state = getUpdateState();
        const gate = evaluateRemoteCompatibility(state);
        const labels = {
            blocked: 'UPDATE REQUIRED / HOLD',
            update: 'UPDATE AVAILABLE',
            warning: 'UPDATE CHECK WARNING',
            unknown: 'UPDATE STATUS UNKNOWN',
            testing: 'BETA CHANNEL',
            ok: 'UP TO DATE'
        };
        const label = labels[gate.severity] || 'UPDATE STATUS';
        return `<b>${escapeHtml(label)}:</b> ${escapeHtml(gate.message)}`;
    }

    async function showUpdateCenter() {
        const { overlay, box } = makeOverlayBox('760px');

        const render = () => {
            const state = getUpdateState();
            const gate = evaluateRemoteCompatibility(state);
            const manifest = state.manifest || {};
            box.innerHTML = `
                <div style="font-size:21px;font-weight:700;margin-bottom:6px">Updates & Compatibility</div>
                <div style="line-height:1.5;margin-bottom:10px">
                    <b>Installed:</b> v${escapeHtml(VERSION)}<br>
                    <b>Channel:</b> ${escapeHtml(UPDATE_CHANNEL.toUpperCase())}<br>
                    <b>Latest known:</b> ${escapeHtml(manifest.latestVersion || 'unknown')}<br>
                    <b>Minimum supported:</b> ${escapeHtml(manifest.minimumSupportedVersion || 'unknown')}<br>
                    <b>Remote status:</b> ${escapeHtml(manifest.status || 'unknown')}<br>
                    <b>Last successful check:</b> ${escapeHtml(state.successfulAt || 'never')}<br>
                    <b>Last compatibility hold seen:</b> ${escapeHtml(state.lastHoldSeenAt || 'never')}<br>
                    <b>Last compatibility hold cleared:</b> ${escapeHtml(state.lastHoldClearedAt || 'never')}<br>
                    <b>Current result:</b> ${escapeHtml(gate.message)}
                </div>
                ${manifest.releaseNotes ? `<div style="background:#f4f6f8;padding:9px;border-radius:5px;margin-bottom:10px"><b>Release notes:</b><br>${escapeHtml(manifest.releaseNotes)}</div>` : ''}
                <div style="font-size:12px;color:#555;margin-bottom:10px">
                    Updates are installed by Tampermonkey from the Mission Vector Check It GitHub release file.
                    This helper never downloads and executes arbitrary JavaScript itself. Signatures and personal configuration stay in this browser.
                </div>
            `;

            const check = makeButton('CHECK NOW', { background: '#e8f2e8' });
            check.onclick = async () => {
                check.disabled = true;
                setStatus('Checking Mission Vector Check It update status...');
                await fetchUpdateManifest(true);
                setStatus('Update check complete.');
                render();
            };

            const openUpdate = makeButton('OPEN UPDATE');
            openUpdate.onclick = () => {
                // Always use the locally pinned channel URL. Never trust a URL read back
                // from localStorage, even though fetched manifests are validated.
                window.open(UPDATE_INSTALL_URL, '_blank', 'noopener');
            };

            const repo = makeButton('OPEN RELEASE REPOSITORY');
            repo.onclick = () => window.open(UPDATE_REPO_URL, '_blank', 'noopener');

            const close = makeButton('Close');
            close.onclick = () => overlay.remove();
            box.append(check, openUpdate, repo, close);
        };

        render();
    }

    function deepClone(value) {
        return JSON.parse(JSON.stringify(value));
    }

    function normalizePerson(person) {
        const name = clean(person?.name);
        const prefix = clean(person?.prefix).toUpperCase();
        return name && prefix ? { name, prefix } : null;
    }

    function normalizePeopleDirectory(value) {
        const out = [];
        const seen = new Set();
        for (const raw of Array.isArray(value) ? value : []) {
            const person = normalizePerson(raw);
            if (!person || seen.has(person.prefix)) continue;
            seen.add(person.prefix);
            out.push(person);
        }
        return out;
    }


    function masterNameKey(value) {
        return clean(value)
            .toLowerCase()
            .replace(/[’‘`]/g, "'")
            .replace(/[^a-z0-9' -]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }


    function expectedSurnamePrefix(name) {
        const suffixes = new Set(['JR', 'SR', 'II', 'III', 'IV', 'V']);
        const parts = clean(name)
            .toUpperCase()
            .replace(/[’‘`']/g, '')
            .split(/\s+/)
            .filter(Boolean);

        while (parts.length && suffixes.has(parts[parts.length - 1].replace(/[.,]/g, ''))) {
            parts.pop();
        }
        const surname = parts[parts.length - 1] || '';
        return surname.replace(/[^A-Z0-9]/g, '');
    }

    function rosterPrefixReview(person) {
        const name = clean(person?.name);
        const prefix = clean(person?.prefix).toUpperCase();
        if (!name || !prefix) return null;

        const expected = expectedSurnamePrefix(name);
        const reasons = [];

        if (prefix.length <= 1) {
            reasons.push('one-character PPE prefix');
        }
        if (/\d/.test(prefix)) {
            reasons.push('PPE prefix contains numbers');
        }

        const normalizedPrefix = prefix.replace(/[^A-Z0-9]/g, '');
        if (expected && normalizedPrefix !== expected) {
            reasons.push(`PPE prefix does not match surname ${expected}`);
        }

        const nameVariants = [...new Set(
            (Array.isArray(person?.nameVariants) ? person.nameVariants : [name])
                .map(clean)
                .filter(Boolean)
        )];
        if (new Set(nameVariants.map(masterNameKey)).size > 1) {
            reasons.push(`same PPE prefix was associated with multiple names: ${nameVariants.join(' / ')}`);
        }

        if (!reasons.length) return null;
        return {
            name,
            prefix,
            expectedPrefix: expected,
            reasons,
            nameVariants,
            equipmentSamples: Array.isArray(person?.equipmentSamples)
                ? person.equipmentSamples.slice(0, 8)
                : []
        };
    }

    function rosterNeedsReview(people) {
        return (Array.isArray(people) ? people : [])
            .map(rosterPrefixReview)
            .filter(Boolean)
            .sort((a, b) => a.name.localeCompare(b.name));
    }

    async function searchPpeByPrefix(prefix, progress = null) {
        await ensurePpeEquipmentPage(progress);
        const search = getSearchInput();
        if (!search) throw new Error('Vector Rebel could not find the PPE search field.');
        nativeSetInput(search, clean(prefix).toUpperCase());

        const started = Date.now();
        let prior = '';
        let stable = 0;
        while (Date.now() - started < 8000) {
            await sleep(180);
            const current = visibleAssetLinksSignature();
            if (current === prior) stable += 1;
            else {
                prior = current;
                stable = 0;
            }
            if (stable >= 4) break;
        }
        return getVisiblePpeAnchors(getPpeResultsContainer() || document)
            .map(anchor => genericAssetIdFromAnchor(anchor))
            .filter(Boolean);
    }


    async function searchPpeForRosterReview(person, progress = null) {
        await ensurePpeEquipmentPage(progress);
        const search = getSearchInput();
        if (!search) throw new Error('Vector Rebel could not find the PPE search field.');

        async function runSearch(term) {
            nativeSetInput(search, term);
            const started = Date.now();
            let prior = '';
            let stable = 0;
            while (Date.now() - started < 8000) {
                await sleep(180);
                const current = visibleAssetLinksSignature();
                if (current === prior) stable += 1;
                else {
                    prior = current;
                    stable = 0;
                }
                if (stable >= 4) break;
            }
            return getVisiblePpeAnchors(getPpeResultsContainer() || document)
                .map(anchor => ({
                    assetId: genericAssetIdFromAnchor(anchor),
                    rowText: clean(ppeRowForAnchor(anchor)?.innerText || '')
                }))
                .filter(item => item.assetId);
        }

        // Name is much safer for unusual/very short prefixes such as "M".
        if (progress) progress(`Searching PPE for ${person.name}…`);
        const byName = await runSearch(clean(person.name));
        const exactByName = byName.filter(match =>
            rowContainsPersonName(match.rowText, person.name)
        );
        if (exactByName.length) {
            return { term: person.name, matches: exactByName };
        }

        if (progress) progress(`Name search returned nothing; trying suspect prefix ${person.prefix}…`);
        const byPrefix = await runSearch(clean(person.prefix).toUpperCase());
        return { term: person.prefix, matches: byPrefix };
    }


    function rowContainsPersonName(rowText, personName) {
        const rowKey = masterNameKey(rowText);
        const personKey = masterNameKey(personName);
        return !!personKey && ` ${rowKey} `.includes(` ${personKey} `);
    }

    async function findActualPpePrefixCandidates(person, progress = null) {
        const result = await searchPpeForRosterReview(person, progress);

        // Use only rows whose own text contains this exact person's normalized
        // full name. This prevents an unrelated asset from becoming a candidate.
        const exactRows = result.matches.filter(match =>
            rowContainsPersonName(match.rowText, person.name)
        );

        const byPrefix = new Map();
        for (const match of exactRows) {
            const prefix = prefixFromAssetId(match.assetId);
            if (!prefix) continue;

            const current = byPrefix.get(prefix) || {
                prefix,
                count: 0,
                assets: []
            };
            current.count += 1;
            if (!current.assets.includes(match.assetId) && current.assets.length < 12) {
                current.assets.push(match.assetId);
            }
            byPrefix.set(prefix, current);
        }

        return {
            searchTerm: result.term,
            exactRowCount: exactRows.length,
            candidates: [...byPrefix.values()]
                .sort((a, b) => b.count - a.count || a.prefix.localeCompare(b.prefix))
        };
    }

    function applyMasterRosterPrefixCorrection(personName, oldPrefix, newPrefix) {
        const oldPrefixNormalized = clean(oldPrefix).toUpperCase();
        const nextPrefix = clean(newPrefix).toUpperCase();
        if (!/^[A-Z0-9]+(?:-[A-Z0-9]+)*$/.test(nextPrefix)) {
            throw new Error('PPE prefix may contain only letters, numbers, and internal hyphens.');
        }

        const state = getMasterRosterState();
        const key = masterNameKey(personName);

        const rosterConflict = state.people.find(person =>
            person.prefix === nextPrefix && masterNameKey(person.name) !== key
        );
        if (rosterConflict) {
            throw new Error(
                `${nextPrefix} is already assigned to ${rosterConflict.name} in the master roster.`
            );
        }

        let found = false;
        const correctedRoster = state.people.map(person => {
            if (masterNameKey(person.name) !== key) return person;
            found = true;
            return { ...person, prefix: nextPrefix };
        });
        if (!found) {
            throw new Error(`${personName} was not found in the current master roster.`);
        }

        const config = cloneConfig();

        // A local-only person can exist outside the master roster. Never let a
        // correction steal that person's prefix.
        const localConflict = (config.peopleDirectory || []).find(person =>
            person.prefix === nextPrefix &&
            person.prefix !== oldPrefixNormalized &&
            masterNameKey(person.name) !== key
        );
        if (localConflict) {
            throw new Error(
                `${nextPrefix} is already used locally by ${localConflict.name}. The mapping was not changed.`
            );
        }

        const correctedDirectory = (config.peopleDirectory || []).map(person =>
            person.prefix === oldPrefixNormalized && masterNameKey(person.name) === key
                ? { ...person, prefix: nextPrefix }
                : person
        );

        // If the bad-prefix roster entry never existed in the local snapshots,
        // preserve the existing directory as-is. Otherwise validate all overlap rules.
        config.peopleDirectory = assertNoPrefixOverlap(correctedDirectory);

        config.captainSets = (config.captainSets || []).map(set => ({
            ...set,
            memberPrefixes: [...new Set((set.memberPrefixes || []).map(prefix =>
                prefix === oldPrefixNormalized ? nextPrefix : prefix
            ))]
        }));
        config.captainRosterPrefixes = [...new Set(
            (config.captainRosterPrefixes || []).map(prefix =>
                prefix === oldPrefixNormalized ? nextPrefix : prefix
            )
        )];

        // Migrate local asset rules so a saved local PASS/FAIL exception cannot
        // silently stop applying after a corrected owner prefix.
        const migratedRules = {};
        for (const rule of Object.values(config.localAssetRules || {})) {
            const ownerPrefix = clean(rule.ownerPrefix).toUpperCase() === oldPrefixNormalized
                ? nextPrefix
                : clean(rule.ownerPrefix).toUpperCase();
            const assetId = clean(rule.assetId).toUpperCase();
            migratedRules[localRuleKey(ownerPrefix, assetId)] = {
                ...rule,
                ownerPrefix,
                assetId
            };
        }
        config.localAssetRules = migratedRules;

        let selfPrefixWarning = '';
        if (config.selfPrefix === oldPrefixNormalized) {
            if (masterNameKey(config.inspectorName) === key) {
                config.selfPrefix = nextPrefix;
            } else {
                selfPrefixWarning =
                    ` My Profile still uses ${oldPrefixNormalized} because the saved inspector name does not exactly match ${personName}; review Settings → Profile.`;
            }
        }

        // Migrate gear snapshots in memory.
        const snapshots = getGearSnapshots();
        const migratedSnapshots = deepClone(snapshots);
        if (
            oldPrefixNormalized !== nextPrefix &&
            Object.prototype.hasOwnProperty.call(migratedSnapshots, oldPrefixNormalized)
        ) {
            if (Object.prototype.hasOwnProperty.call(migratedSnapshots, nextPrefix)) {
                throw new Error(
                    `Gear snapshot data already exists for ${nextPrefix}. The mapping was not changed automatically.`
                );
            }
            migratedSnapshots[nextPrefix] = migratedSnapshots[oldPrefixNormalized];
            delete migratedSnapshots[oldPrefixNormalized];
        }

        const normalizedRoster = normalizeMasterRoster(correctedRoster).people;
        const rosterPayload = {
            schemaVersion: 1,
            version: `local-${new Date().toISOString().slice(0, 10)}`,
            updatedAt: new Date().toISOString(),
            source: 'Admin corrected PPE-prefix mapping',
            people: normalizedRoster
        };
        const normalizedConfig = normalizeConfig(config);

        // localStorage cannot provide a real multi-key transaction. Snapshot all
        // affected keys and roll back every write if any later write throws.
        const affectedKeys = [
            MASTER_ROSTER_OVERRIDE_KEY,
            CONFIG_KEY,
            GEAR_SNAPSHOTS_KEY
        ];
        const before = Object.fromEntries(
            affectedKeys.map(storageKey => [storageKey, localStorage.getItem(storageKey)])
        );

        try {
            saveJSON(MASTER_ROSTER_OVERRIDE_KEY, rosterPayload);
            saveJSON(CONFIG_KEY, normalizedConfig);
            saveJSON(GEAR_SNAPSHOTS_KEY, migratedSnapshots);
            configCache = normalizedConfig;
        } catch (error) {
            for (const storageKey of affectedKeys) {
                const prior = before[storageKey];
                if (prior === null) localStorage.removeItem(storageKey);
                else localStorage.setItem(storageKey, prior);
            }
            configCache = null;
            throw new Error(`PPE mapping correction was rolled back: ${error.message}`);
        }

        return {
            prefix: nextPrefix,
            warning: selfPrefixWarning
        };
    }

    function showPrefixCorrectionDialog(item, lookup) {
        const { overlay, box } = makeOverlayBox('760px');

        const title = document.createElement('div');
        title.style.cssText = 'font-size:21px;font-weight:700;color:#153e5c;margin-bottom:5px;';
        title.textContent = `Fix PPE Mapping — ${item.name}`;
        box.appendChild(title);

        const intro = document.createElement('div');
        intro.style.cssText = 'font-size:12px;line-height:1.5;color:#607483;margin-bottom:12px;';
        intro.innerHTML =
            `Current stored prefix: <code>${escapeHtml(item.prefix)}</code><br>` +
            `Vector Rebel searched the PPE list for <b>${escapeHtml(item.name)}</b> and only used rows that actually contain that full name.`;
        box.appendChild(intro);

        if (!lookup.candidates.length) {
            const warning = document.createElement('div');
            warning.style.cssText =
                'padding:10px;background:#fff5df;border:1px solid #e3c47d;border-radius:8px;' +
                'font-size:12px;line-height:1.45;margin-bottom:10px;';
            warning.textContent =
                'No reliable PPE-prefix candidate was found automatically. You can enter the correct prefix manually after checking the person’s gear in Vector.';
            box.appendChild(warning);
        } else {
            lookup.candidates.forEach(candidate => {
                const row = document.createElement('div');
                row.style.cssText =
                    'padding:10px;margin:7px 0;border:1px solid #d9e3ea;border-radius:8px;background:#f8fbfc;';

                const text = document.createElement('div');
                text.style.cssText = 'font-size:12px;line-height:1.45;margin-bottom:6px;';
                text.innerHTML =
                    `<b>${escapeHtml(candidate.prefix)}</b> · ${candidate.count} matching gear row${candidate.count === 1 ? '' : 's'}` +
                    `<br><span style="font-size:11px;color:#607483">${candidate.assets.map(escapeHtml).join('<br>')}</span>`;

                const use = makeButton(`Use ${candidate.prefix}`, { background: '#176b8e', color: '#fff' });
                use.onclick = () => {
                    try {
                        const applied = applyMasterRosterPrefixCorrection(
                            item.name,
                            item.prefix,
                            candidate.prefix
                        );
                        overlay.remove();
                        setStatus(
                            `${item.name}: PPE mapping corrected from ${item.prefix} to ${applied.prefix}.${applied.warning || ''}`,
                            !applied.warning
                        );
                    } catch (error) {
                        alert(error.message);
                    }
                };

                row.append(text, use);
                box.appendChild(row);
            });
        }

        const manual = makeButton('Enter Prefix Manually');
        manual.onclick = () => {
            const entered = prompt(
                `Correct PPE prefix for ${item.name}`,
                lookup.candidates[0]?.prefix || ''
            );
            if (entered === null) return;

            try {
                const applied = applyMasterRosterPrefixCorrection(
                    item.name,
                    item.prefix,
                    entered
                );
                overlay.remove();
                setStatus(
                    `${item.name}: PPE mapping corrected from ${item.prefix} to ${applied.prefix}.${applied.warning || ''}`,
                    !applied.warning
                );
            } catch (error) {
                alert(error.message);
            }
        };

        const close = makeButton('Cancel');
        close.onclick = () => overlay.remove();
        box.append(manual, close);
    }

    function isOrganizationOrBadRosterName(value) {
        const text = clean(value);
        const lower = text.toLowerCase();
        if (!text) return true;
        if (text.length < 3 || text.length > 80) return true;
        if (!/[a-z]/i.test(text)) return true;
        if (!/\s/.test(text)) return true;

        // Organization labels are rejected by phrase. Equipment/status labels are
        // rejected only when the WHOLE value is that label, so surnames such as
        // Hood, Glover, or Boothe are not accidentally removed.
        if (lower.includes('flower mound fire department')) return true;
        if (/\bfire\s+department\b/i.test(text)) return true;
        if (/\bdepartment\b/i.test(text)) return true;
        if (/^\(?tx\)?$/i.test(text)) return true;
        if (/\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}/.test(text)) return true;

        const exactBlocked = new Set([
            'equipment',
            'structural',
            'bunker coat',
            'bunker pant',
            'structural gloves',
            'structural glove',
            'structural helmet',
            'structural boot',
            'helmet',
            'glove',
            'gloves',
            'boot',
            'boots',
            'hood',
            'in service',
            'out of service',
            'available',
            'unavailable',
            'inspection',
            'personnel',
            'assigned to',
            'manufacturer',
            'purchase date',
            'check out date',
            'end of life'
        ]);
        return exactBlocked.has(lower);
    }

    function normalizeMasterRoster(value) {
        const raw = Array.isArray(value) ? value : [];
        const byName = new Map();
        const rejected = [];
        const merged = [];

        for (const item of raw) {
            const name = clean(item?.name);
            const prefix = clean(item?.prefix).toUpperCase();
            const active = item?.active !== false;
            const assetCount = Number.isFinite(Number(item?.assetCount))
                ? Number(item.assetCount)
                : 0;

            if (!name || !prefix || isOrganizationOrBadRosterName(name)) {
                if (name) rejected.push(name);
                continue;
            }
            if (!/^[A-Z0-9]+(?:-[A-Z0-9]+)*$/.test(prefix)) {
                rejected.push(name);
                continue;
            }

            const key = masterNameKey(name);
            const existing = byName.get(key);
            const candidate = { name, prefix, active, assetCount };

            if (!existing) {
                byName.set(key, candidate);
                continue;
            }

            // Same person appeared on multiple PPE rows. Keep one roster entry
            // and prefer the prefix represented by the most gear rows.
            merged.push(name);
            if (
                candidate.assetCount > existing.assetCount ||
                (!existing.prefix && candidate.prefix)
            ) {
                byName.set(key, candidate);
            }
        }

        // If the same prefix somehow maps to multiple labels, keep the
        // strongest candidate and do not show duplicate selections.
        const byPrefix = new Map();
        for (const person of byName.values()) {
            const existing = byPrefix.get(person.prefix);
            if (!existing) {
                byPrefix.set(person.prefix, person);
                continue;
            }

            merged.push(person.name);
            if (person.assetCount > existing.assetCount) {
                byPrefix.set(person.prefix, person);
            }
        }

        const people = [...byPrefix.values()]
            .map(({ assetCount, ...person }) => person)
            .sort((a, b) => a.name.localeCompare(b.name));

        return {
            people,
            rejected: [...new Set(rejected)].sort(),
            merged: [...new Set(merged)].sort()
        };
    }

    function getMasterRosterState() {
        const local = loadJSON(MASTER_ROSTER_OVERRIDE_KEY, null);
        const normalizedLocal = normalizeMasterRoster(local?.people || []);
        if (local && normalizedLocal.people.length) {
            return {
                source: 'local-admin',
                version: clean(local.version) || 'local',
                updatedAt: clean(local.updatedAt),
                people: normalizedLocal.people
            };
        }

        const builtin = normalizeMasterRoster(BUILTIN_MASTER_ROSTER);
        return {
            source: 'embedded',
            version: BUILTIN_MASTER_ROSTER_VERSION,
            updatedAt: '',
            people: builtin.people
        };
    }

    function getActiveMasterRoster() {
        return getMasterRosterState().people.filter(person => person.active !== false);
    }

    function saveLocalMasterRoster(people, metadata = {}) {
        const normalized = normalizeMasterRoster(people);
        const payload = {
            schemaVersion: 1,
            version: clean(metadata.version) || `local-${new Date().toISOString().slice(0, 10)}`,
            updatedAt: new Date().toISOString(),
            source: clean(metadata.source) || 'Vector PPE admin refresh',
            people: normalized.people
        };
        saveJSON(MASTER_ROSTER_OVERRIDE_KEY, payload);
        return {
            ...payload,
            rejected: normalized.rejected,
            merged: normalized.merged
        };
    }

    function clearLocalMasterRoster() {
        localStorage.removeItem(MASTER_ROSTER_OVERRIDE_KEY);
        localStorage.removeItem(MASTER_ROSTER_REVIEW_KEY);
    }

    function rosterPersonByPrefix(prefix) {
        const wanted = clean(prefix).toUpperCase();
        if (!wanted) return null;
        const master = getMasterRosterState().people.find(p => p.prefix === wanted);
        if (master) return master;
        return getConfig().peopleDirectory.find(p => p.prefix === wanted) || null;
    }

    function resolveCaptainSetPeople(set, config = getConfig()) {
        return (set?.memberPrefixes || [])
            .map(prefix => rosterPersonByPrefix(prefix) || config.peopleDirectory.find(p => p.prefix === prefix))
            .filter(Boolean);
    }

    function masterRosterExportPayload(people = getMasterRosterState().people) {
        const normalized = normalizeMasterRoster(people).people;
        return {
            schemaVersion: 1,
            rosterVersion: new Date().toISOString().slice(0, 10),
            generatedAt: new Date().toISOString(),
            people: normalized.map(person => ({
                name: person.name,
                prefix: person.prefix,
                active: person.active !== false
            }))
        };
    }

    function prefixesOverlap(aRaw, bRaw) {
        const a = clean(aRaw).toUpperCase();
        const b = clean(bRaw).toUpperCase();
        if (!a || !b) return false;
        return a === b || a.startsWith(`${b}-`) || b.startsWith(`${a}-`);
    }

    function assertNoPrefixOverlap(peopleDirectory) {
        const people = normalizePeopleDirectory(peopleDirectory);
        for (let i = 0; i < people.length; i++) {
            for (let j = i + 1; j < people.length; j++) {
                if (prefixesOverlap(people[i].prefix, people[j].prefix)) {
                    throw new Error(
                        `Overlapping gear prefixes are not allowed: ${people[i].prefix} and ${people[j].prefix}. ` +
                        'Use prefixes that uniquely identify each person\'s asset IDs.'
                    );
                }
            }
        }
        return people;
    }

    function normalizeCaptainSets(value, peopleDirectory = []) {
        const validPrefixes = new Set([
            ...peopleDirectory.map(p => p.prefix),
            ...getMasterRosterState().people.map(p => p.prefix)
        ]);
        const out = [];
        const seenNames = new Set();
        for (const raw of Array.isArray(value) ? value : []) {
            const name = clean(raw?.name);
            if (!name || seenNames.has(name.toLowerCase())) continue;
            const members = [...new Set((raw?.memberPrefixes || [])
                .map(x => clean(x).toUpperCase())
                .filter(Boolean))];
            out.push({
                id: clean(raw?.id) || `set-${Date.now()}-${out.length}-${Math.random().toString(36).slice(2, 8)}`,
                name,
                memberPrefixes: members,
                orphanedPrefixes: members.filter(prefix => !validPrefixes.has(prefix))
            });
            seenNames.add(name.toLowerCase());
        }
        return out;
    }

    function normalizeCaptainRosterPrefixes(value, peopleDirectory = []) {
        const validPrefixes = new Set((peopleDirectory || []).map(p => p.prefix));
        return [...new Set((Array.isArray(value) ? value : [])
            .map(x => clean(x).toUpperCase())
            .filter(prefix => prefix && validPrefixes.has(prefix)))];
    }

    function deriveCaptainRosterPrefixes(stored, peopleDirectory, captainSets = []) {
        if (stored && Object.prototype.hasOwnProperty.call(stored, 'captainRosterPrefixes')) {
            return normalizeCaptainRosterPrefixes(stored.captainRosterPrefixes, peopleDirectory);
        }

        const preferred = (captainSets || []).find(set =>
            ['my crew', 'current crew', 'regular crew'].includes(clean(set.name).toLowerCase())
        ) || (captainSets || [])[0];

        return normalizeCaptainRosterPrefixes(preferred?.memberPrefixes || [], peopleDirectory);
    }

    function localRuleKey(ownerPrefix, assetId) {
        return `${clean(ownerPrefix).toUpperCase()}::${clean(assetId).toUpperCase()}`;
    }

    function normalizeLocalAssetRules(value, fallbackOwnerPrefix = '') {
        const out = {};
        if (!value || typeof value !== 'object' || Array.isArray(value)) return out;
        for (const [keyRaw, ruleRaw] of Object.entries(value)) {
            const rawKey = clean(keyRaw).toUpperCase();
            let ownerPrefix = clean(ruleRaw?.ownerPrefix || '').toUpperCase();
            let assetId = clean(ruleRaw?.assetId || '').toUpperCase();

            if (rawKey.includes('::')) {
                const [ownerFromKey, assetFromKey] = rawKey.split('::', 2);
                ownerPrefix ||= clean(ownerFromKey).toUpperCase();
                assetId ||= clean(assetFromKey).toUpperCase();
            } else {
                assetId ||= rawKey;
                ownerPrefix ||= clean(fallbackOwnerPrefix).toUpperCase();
            }

            if (!ownerPrefix || !assetId) continue;
            const q1 = ruleRaw?.q1 === 'fail' ? 'fail' : 'pass';
            const q2 = ruleRaw?.q2 === 'fail' ? 'fail' : 'pass';
            const note = clean(ruleRaw?.note || ruleRaw?.failureNote || '');
            const expiresAt = /^\d{4}-\d{2}-\d{2}$/.test(clean(ruleRaw?.expiresAt || ''))
                ? clean(ruleRaw.expiresAt)
                : '';
            out[localRuleKey(ownerPrefix, assetId)] = {
                ownerPrefix,
                assetId,
                q1,
                q2,
                note,
                expiresAt
            };
        }
        return out;
    }

    function normalizeDepartmentProfile(value) {
        const incoming = value && typeof value === 'object' ? value : {};
        const profileScope = clean(incoming.profileScope) || BUILTIN_PROFILE_SCOPE;
        const replaceBuiltins = incoming.replaceBuiltins === true;
        const useBuiltins = profileScope === BUILTIN_PROFILE_SCOPE && !replaceBuiltins;

        const poolTypes = useBuiltins ? deepClone(BUILTIN_POOL_TYPES) : {};
        if (incoming.poolTypes && typeof incoming.poolTypes === 'object' && !Array.isArray(incoming.poolTypes)) {
            for (const [poolRaw, typeRaw] of Object.entries(incoming.poolTypes)) {
                const pool = clean(poolRaw);
                const type = clean(typeRaw);
                if (/^\d+$/.test(pool) && type) poolTypes[pool] = type;
            }
        }

        const modeTemplates = {};
        for (const modeKey of Object.keys(BUILTIN_MODES)) {
            modeTemplates[modeKey] = useBuiltins ? deepClone(BUILTIN_MODES[modeKey].templates) : {};
            const incomingTemplates = incoming.modeTemplates?.[modeKey];
            if (incomingTemplates && typeof incomingTemplates === 'object' && !Array.isArray(incomingTemplates)) {
                for (const [poolRaw, templateRaw] of Object.entries(incomingTemplates)) {
                    const pool = clean(poolRaw);
                    const template = clean(String(templateRaw));
                    if (/^\d+$/.test(pool) && /^\d+$/.test(template)) {
                        modeTemplates[modeKey][pool] = template;
                    }
                }
            }
        }

        const expected = Number(incoming.expectedGearCount);
        return {
            name: clean(incoming.name) || DEFAULT_DEPARTMENT_PROFILE.name,
            profileVersion: Number.isFinite(Number(incoming.profileVersion))
                ? Number(incoming.profileVersion)
                : DEFAULT_DEPARTMENT_PROFILE.profileVersion,
            profileScope,
            replaceBuiltins,
            expectedGearCount: Number.isInteger(expected) && expected >= 0 ? expected : 10,
            poolTypes,
            modeTemplates
        };
    }

    function migrateV2Config() {
        const existingV3 = loadJSON(CONFIG_KEY, null);
        if (existingV3) return existingV3;

        const legacy = loadJSON(LEGACY_CONFIG_KEY, null);
        if (!legacy) {
            const fresh = deepClone(DEFAULT_CONFIG);
            saveJSON(CONFIG_KEY, fresh);
            return fresh;
        }

        const people = normalizePeopleDirectory(legacy.peopleDirectory || legacy.roster || []);
        const selfPrefix = clean(legacy.selfPrefix).toUpperCase();
        const rawLegacyRules = normalizeLocalAssetRules(
            legacy.localAssetRules || legacy.defaultFailures || {},
            selfPrefix
        );

        // v2.2 shipped with a Michael-specific BRION exception in generic defaults.
        // During migration, old defaultFailures become personal only when their asset IDs
        // belong to the configured local inspector prefix. If no prefix existed, do not guess.
        let legacyRules;
        if (legacy.localAssetRules) {
            legacyRules = rawLegacyRules;
        } else {
            legacyRules = Object.fromEntries(
                Object.entries(rawLegacyRules).filter(([, rule]) =>
                    !!selfPrefix && rule.assetId.startsWith(`${selfPrefix}-`)
                )
            );
            if (!selfPrefix && Object.keys(legacy.defaultFailures || {}).length) {
                saveJSON(MIGRATION_NOTICE_KEY, {
                    at: new Date().toISOString(),
                    message: 'Legacy v2.2 personal failure defaults were not migrated because My gear prefix was blank. The legacy v2.2 config remains stored; re-enter any needed local rule after setting your prefix.'
                });
            }
        }

        const captainSets = normalizeCaptainSets(legacy.captainSets || [], people);

        const migrated = {
            schemaVersion: 7,
            initialized: !!legacy.initialized,
            inspectorName: clean(legacy.inspectorName),
            selfPrefix,
            tourCoatComment: clean(legacy.tourCoatComment),
            peopleDirectory: people,
            captainRosterPrefixes: deriveCaptainRosterPrefixes(legacy, people, captainSets),
            captainSets,
            localAssetRules: legacyRules,
            departmentProfile: normalizeDepartmentProfile(legacy.departmentProfile)
        };

        saveJSON(CONFIG_KEY, migrated);
        return migrated;
    }

    function normalizeConfig(storedRaw) {
        const stored = storedRaw && typeof storedRaw === 'object' ? storedRaw : {};
        const people = normalizePeopleDirectory(stored.peopleDirectory || stored.roster || []);
        const selfPrefix = clean(stored.selfPrefix).toUpperCase();

        // v2.3.1 Captain Sets are never generated from an old local roster.
        // Remove only the helper-generated legacy set; user-created sets remain untouched.
        const captainSets = normalizeCaptainSets(
            (stored.captainSets || []).filter(set => clean(set?.id) !== 'set-migrated-current-crew'),
            people
        );

        return {
            ...deepClone(DEFAULT_CONFIG),
            ...stored,
            schemaVersion: 7,
            inspectorName: clean(stored.inspectorName),
            selfPrefix,
            tourCoatComment: clean(stored.tourCoatComment),
            peopleDirectory: people,
            captainRosterPrefixes: captainSets.length ? deriveCaptainRosterPrefixes(stored, people, captainSets) : [],
            captainSets,
            localAssetRules: normalizeLocalAssetRules(
                stored.localAssetRules || stored.defaultFailures || {},
                selfPrefix
            ),
            departmentProfile: normalizeDepartmentProfile(stored.departmentProfile)
        };
    }

    function getConfig() {
        if (!configCache) configCache = normalizeConfig(migrateV2Config());
        return configCache;
    }

    function cloneConfig() {
        return deepClone(getConfig());
    }

    function getMode(modeKey, config = getConfig()) {
        const builtin = BUILTIN_MODES[modeKey];
        if (!builtin) return null;
        return {
            ...builtin,
            templates: deepClone(config.departmentProfile?.modeTemplates?.[modeKey] || {})
        };
    }

    function getPoolType(pool, config = getConfig()) {
        return config.departmentProfile?.poolTypes?.[String(pool)] || 'UNKNOWN';
    }

    function getExpectedGearCount(config = getConfig()) {
        const n = Number(config.departmentProfile?.expectedGearCount);
        return Number.isFinite(n) && n >= 0 ? n : 10;
    }

    function saveConfig(config) {
        const normalized = normalizeConfig(config);
        saveJSON(CONFIG_KEY, normalized);
        configCache = normalized;
    }

    window.addEventListener('storage', event => {
        if (event.key === CONFIG_KEY) configCache = null;
        if (event.key === PANEL_MINIMIZED_KEY) {
            applyPanelMinimizedState(event.newValue === '1', false);
        }
        if (event.key === RUN_OWNER_KEY && getRun()) {
            const owner = getRunOwner();
            if (owner?.tabId && owner.tabId !== TAB_ID) {
                setStatus(
                    'This PPE run is being driven by another Vector Check It tab. This tab is read-only for the active run.',
                    false
                );
            }
        }
    });

    function getRun() {
        return loadJSON(RUN_KEY, null);
    }

    function getRunOwner() {
        return loadJSON(RUN_OWNER_KEY, null);
    }

    function claimRunOwnership() {
        const now = Date.now();
        const owner = getRunOwner();

        // v2.3.1 originally generated TAB_ID at every reload. That left a fresh
        // localStorage owner behind that looked like a different tab after the
        // SAME tab reloaded. Legacy owner records have no schemaVersion, so the
        // first corrected build may reclaim that obsolete format immediately.
        const legacyOwner = !!owner?.tabId && owner?.schemaVersion !== 2;

        const ownerFresh = !!(
            owner?.tabId &&
            Number(owner.heartbeatAt) &&
            now - Number(owner.heartbeatAt) <= RUN_OWNER_STALE_MS
        );

        if (!legacyOwner && ownerFresh && owner.tabId !== TAB_ID) return false;

        saveJSON(RUN_OWNER_KEY, {
            schemaVersion: 2,
            tabId: TAB_ID,
            heartbeatAt: now
        });

        const confirmed = getRunOwner();
        return confirmed?.schemaVersion === 2 && confirmed?.tabId === TAB_ID;
    }

    function refreshRunOwnership() {
        const owner = getRunOwner();
        if (owner?.tabId !== TAB_ID) return false;
        saveJSON(RUN_OWNER_KEY, {
            schemaVersion: 2,
            tabId: TAB_ID,
            heartbeatAt: Date.now()
        });
        return true;
    }

    function releaseRunOwnership() {
        const owner = getRunOwner();
        if (owner?.tabId === TAB_ID) {
            localStorage.removeItem(RUN_OWNER_KEY);
        }
    }

    function requireRunOwnership() {
        if (!claimRunOwnership()) {
            throw new Error(
                'This PPE run is being driven by another Vector Check It tab. Use the other Check It tab, or close it and wait about 45 seconds before resuming here.'
            );
        }
    }

    function saveRun(run) {
        // Every persisted run transition—including every transition authorizing
        // an irreversible click—must belong to this tab.
        requireRunOwnership();
        saveJSON(RUN_KEY, run);
        refreshRunOwnership();
        refreshPanelInfo();
    }

    function clearRun() {
        localStorage.removeItem(RUN_KEY);
        releaseRunOwnership();
        refreshPanelInfo();
    }

    function setStatus(message, ok = true) {
        const el = document.getElementById('vector-ppe-status-v2');
        if (el) {
            el.textContent = message;
            el.style.color = ok ? '#174f2a' : '#9f1d1d';
        }
        if (!ok) {
            const badge = document.getElementById('vector-ppe-mini-badge-v1');
            if (badge) {
                badge.textContent = '!';
                badge.style.display = 'block';
            }
        }
    }

    function diagnosticPrivateNames(item = null) {
        const config = getConfig();
        return [
            config.inspectorName,
            item?.ownerName,
            ...(config.peopleDirectory || []).map(p => p.name)
        ].map(clean).filter(Boolean);
    }

    function redactDiagnosticText(value, item = null) {
        let text = clean(value);
        for (const name of diagnosticPrivateNames(item)) {
            text = text.replace(new RegExp(escapeRegex(name), 'gi'), '[REDACTED_NAME]');
        }
        return text;
    }

    function safeDiagnosticTableStructure(item = null) {
        return [...document.querySelectorAll('table,[role="table"],[role="grid"]')]
            .filter(visible)
            .filter(el => !el.closest(`#${PANEL_ID}, #${OVERLAY_ID}`))
            .slice(0, 20)
            .map(container => {
                const headers = [...container.querySelectorAll('th,[role="columnheader"]')]
                    .filter(visible)
                    .map(el => redactDiagnosticText(el.textContent, item))
                    .filter(Boolean)
                    .slice(0, 20);
                const rowCount = container.matches('table')
                    ? [...container.querySelectorAll('tbody tr')].filter(visible).length
                    : [...container.querySelectorAll('[role="row"]')]
                        .filter(row => visible(row) && !row.querySelector('[role="columnheader"]')).length;
                return {
                    tag: container.tagName.toLowerCase(),
                    role: clean(container.getAttribute('role') || ''),
                    classes: [...container.classList].slice(0, 12),
                    dataTestId: clean(container.getAttribute('data-testid') || ''),
                    headers,
                    rowCount
                };
            });
    }

    function diagnosticTextHash(value) {
        // Non-cryptographic diagnostic fingerprint only. Never used as completion evidence.
        let hash = 2166136261;
        const input = String(value || '');
        for (let i = 0; i < input.length; i++) {
            hash ^= input.charCodeAt(i);
            hash = Math.imul(hash, 16777619);
        }
        return (hash >>> 0).toString(16).padStart(8, '0');
    }

    function diagnosticCandidateLines(item) {
        if (!item || !isAssetPageFor(item)) return [];
        const selector = 'h1,h2,h3,h4,h5,h6,p,li,dt,dd,label,time,strong,b,span,div';
        const pattern = /\b(?:due|last|complete(?:d)?|inspect(?:ion|ed)?|next)\b|(?:\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})/i;
        const candidates = [];

        for (const el of document.querySelectorAll(selector)) {
            if (!visible(el)) continue;
            if (el.closest(`#${PANEL_ID}, #${OVERLAY_ID}, table, [role="table"], [role="grid"]`)) continue;

            const raw = clean(el.innerText || el.textContent || '');
            if (!raw || raw.length > 80 || !pattern.test(raw)) continue;
            const redacted = redactDiagnosticText(raw, item);
            if (!redacted) continue;

            // Prefer leaf/specific text over wrapper text so the 20-line budget
            // is more likely to retain a concrete "Next Due ..." / "Last inspected ..."
            // line instead of nested layout containers.
            const hasMatchingDescendant = [...el.querySelectorAll(selector)].some(child => {
                if (!visible(child)) return false;
                if (child.closest('table, [role="table"], [role="grid"]')) return false;
                const childText = clean(child.innerText || child.textContent || '');
                return !!childText && childText.length <= 80 && pattern.test(childText);
            });
            candidates.push({
                text: redacted,
                // Date-bearing lines are the most useful part of the field
                // experiment because they can reveal Last/Next/Due changes.
                datePenalty: /\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}/.test(redacted) ? 0 : 1,
                wrapperPenalty: hasMatchingDescendant ? 1 : 0,
                length: redacted.length
            });
        }

        candidates.sort((a, b) =>
            a.datePenalty - b.datePenalty ||
            a.wrapperPenalty - b.wrapperPenalty ||
            a.length - b.length ||
            (a.text < b.text ? -1 : a.text > b.text ? 1 : 0)
        );

        const seen = new Set();
        const lines = [];
        for (const candidate of candidates) {
            if (seen.has(candidate.text)) continue;
            seen.add(candidate.text);
            lines.push(candidate.text);
            if (lines.length >= 20) break;
        }
        return lines;
    }

    function assetPageDiagnosticFingerprint(item) {
        if (!item || !isAssetPageFor(item)) return null;
        const clone = document.body.cloneNode(true);
        clone.querySelectorAll(`#${PANEL_ID}, #${OVERLAY_ID}, script, style, noscript`).forEach(el => el.remove());

        const bodyText = redactDiagnosticText(uiText(clone.textContent || ''), item);

        return {
            itemKey: `${item.pool}:${item.itemId}`,
            capturedAt: new Date().toISOString(),
            urlPath: location.pathname,
            textHash: diagnosticTextHash(bodyText),
            textLength: bodyText.length,
            candidateLines: diagnosticCandidateLines(item)
        };
    }

    function capturePostSubmitFingerprintOnce(run, item) {
        if (!run || !item || run.postSubmitAssetFingerprint) return false;
        try {
            run.postSubmitAssetFingerprint = assetPageDiagnosticFingerprint(item);
            return !!run.postSubmitAssetFingerprint;
        } catch (error) {
            console.warn('Vector Rebel: first-contact fingerprint capture failed:', error);
            return false;
        }
    }

    function capturePostSubmitSettledFingerprintOnce(run, item) {
        if (!run || !item || run.postSubmitSettledFingerprint) return false;
        try {
            run.postSubmitSettledFingerprint = assetPageDiagnosticFingerprint(item);
            return !!run.postSubmitSettledFingerprint;
        } catch (error) {
            console.warn('Vector Rebel: settled fingerprint capture failed:', error);
            return false;
        }
    }

    function persistDiagnosticRunState(run) {
        // Diagnostics are never allowed to stop a run that may already have
        // submitted an official inspection. Best-effort persistence only.
        try {
            saveJSON(RUN_KEY, run);
            try { refreshPanelInfo(); } catch {}
            return true;
        } catch (error) {
            console.warn('Vector Rebel: diagnostic state could not be persisted:', error);
            return false;
        }
    }

    function buildDiagnostic(message, run = getRun()) {
        const item = run?.items?.[run?.index] || null;
        const mode = run?.modeKey ? getMode(run.modeKey) : null;
        const inspection = currentInspection();
        const config = getConfig();
        const privateNameNeedles = [config.inspectorName, ...(config.peopleDirectory || []).map(p => p.name)]
            .map(clean)
            .filter(Boolean);
        const visibleButtons = [...document.querySelectorAll('button')]
            .filter(visible)
            .map(b => clean(b.innerText))
            .filter(Boolean)
            .filter(label => !privateNameNeedles.some(name => uiIncludes(label, name)))
            .slice(0, 40);

        return {
            helperVersion: VERSION,
            at: new Date().toISOString(),
            message,
            url: location.href,
            pageTitle: document.title,
            run: run ? {
                runId: run.runId,
                modeKey: run.modeKey,
                modeTitle: mode?.title || '',
                phase: run.phase,
                index: run.index,
                totalItems: run.items?.length || 0,
                ownerLabel: run.ownerLabel || run.ownerName || '',
                currentItem: item ? {
                    assetId: item.assetId,
                    ownerName: item.ownerName || '',
                    pool: item.pool,
                    itemId: item.itemId,
                    type: item.type,
                    expectedTemplate: item.template
                } : null
            } : null,
            currentInspection: inspection,
            pageSignals: {
                isExpectedAssetPage: item ? isAssetPageFor(item) : false,
                expectedAssetIdVisible: item ? assetPageContainsExpectedId(item) : false,
                chooserVisible: !!findChooserRoot(),
                submitInspectionVisible: !!exactButton('Submit Inspection'),
                passedButtons: exactButtons('Passed').length,
                failedButtons: exactButtons('Failed').length,
                visibleButtons,
                historyFallbackEnabled: run?.historyFallbackEnabled ?? null
            },
            verificationDiagnostics: item ? {
                visibleTableStructures: isAssetPageFor(item) ? safeDiagnosticTableStructure(item) : [],
                capturedHistoryStructure: run?.historyStructureCapture || [],
                historyVerification: run?.historyVerification || null,
                baselineHistoryKeys: run?.baselineHistoryKeys || [],
                postSubmitHistoryKeys: run?.postSubmitHistoryKeys || [],
                preSubmitAssetFingerprint: run?.preSubmitAssetFingerprint || null,
                postSubmitAssetFingerprint: run?.postSubmitAssetFingerprint || null,
                postSubmitSettledFingerprint: run?.postSubmitSettledFingerprint || null,
                postSubmitReturnFirstSeenAt: run?.postSubmitReturnFirstSeenAt || null,
                postSubmitReturnPageSessionId: run?.postSubmitReturnPageSessionId || null,
                inspectionItemKey: run?.inspectionItemKey || null
            } : null
        };
    }

    function saveDiagnostic(message, run = getRun()) {
        try {
            const report = buildDiagnostic(message, run);
            saveJSON(LAST_DIAGNOSTIC_KEY, report);
            return report;
        } catch (error) {
            const fallback = {
                helperVersion: VERSION,
                at: new Date().toISOString(),
                message,
                url: location.href,
                diagnosticError: error.message
            };
            saveJSON(LAST_DIAGNOSTIC_KEY, fallback);
            return fallback;
        }
    }

    function archiveStoppedRun(run, reason) {
        if (!run) return;
        const snapshot = deepClone(run);
        snapshot.stoppedAt = new Date().toISOString();
        snapshot.stopReason = reason || snapshot.stopReason || 'Stopped';
        saveJSON(STOPPED_RUN_KEY, snapshot);
    }

    function stopRun(message) {
        const run = getRun();
        saveDiagnostic(message, run);
        if (run) {
            const priorPhase = run.phase;
            run.phase = 'stopped';
            run.stoppedFromPhase = priorPhase;
            run.stopReason = message;
            archiveStoppedRun(run, message);
            saveRun(run);
        }
        setStatus('STOPPED: ' + message + ' Open DIAGNOSTICS for a shareable report.', false);

        // A stopped run must never remain hidden behind a healthy-looking
        // minimized progress badge. Expand for the stop without changing the
        // inspector's saved minimize preference for the next normal page load.
        applyPanelMinimizedState(false, false);
        updateMinimizedPanelBadge(run ? { ...run, phase: 'stopped' } : getRun());
    }

    function removeOverlay() {
        document.getElementById(OVERLAY_ID)?.remove();
    }

    function makeButton(text, options = {}) {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = text;
        b.style.cssText =
            'padding:9px 13px;' +
            'margin:3px;' +
            'border:1px solid #b8c8d6;' +
            'border-radius:7px;' +
            `background:${options.background || '#ffffff'};` +
            `color:${options.color || '#153e5c'};` +
            'font:600 13px/1.2 Arial,sans-serif;' +
            'box-shadow:0 1px 2px rgba(15,43,62,.08);' +
            'transition:background .12s ease,border-color .12s ease,box-shadow .12s ease;' +
            'cursor:pointer;';
        b.onmouseenter = () => {
            if (!b.disabled) {
                b.style.borderColor = '#6f96b1';
                b.style.boxShadow = '0 2px 5px rgba(15,43,62,.12)';
            }
        };
        b.onmouseleave = () => {
            b.style.borderColor = '#b8c8d6';
            b.style.boxShadow = '0 1px 2px rgba(15,43,62,.08)';
        };
        return b;
    }

    function makeOverlayBox(width = '780px') {
        removeOverlay();

        const overlay = document.createElement('div');
        overlay.id = OVERLAY_ID;
        overlay.style.cssText =
            'position:fixed;' +
            'inset:0;' +
            'z-index:2147483647;' +
            'background:rgba(13,35,51,.55);' +
            'display:flex;' +
            'align-items:center;' +
            'justify-content:center;' +
            'padding:18px;' +
            'box-sizing:border-box;' +
            'font-family:Arial,sans-serif;';

        const box = document.createElement('div');
        box.style.cssText =
            `width:${width};` +
            'max-width:94vw;' +
            'max-height:90vh;' +
            'overflow:auto;' +
            'background:#ffffff;' +
            'border:1px solid #d9e3ea;' +
            'border-radius:12px;' +
            'padding:20px;' +
            'box-shadow:0 14px 46px rgba(8,32,48,.32);' +
            'color:#18384f;';

        overlay.appendChild(box);
        document.body.appendChild(overlay);
        return { overlay, box };
    }

    function nativeSetInput(input, value) {
        const proto = input instanceof HTMLTextAreaElement
            ? HTMLTextAreaElement.prototype
            : HTMLInputElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
        if (!setter) throw new Error('Could not access input value setter.');

        const old = input.value;
        input.focus();
        setter.call(input, value);
        if (input._valueTracker) input._valueTracker.setValue(old);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
    }

    // ============================================================
    // DEPARTMENT PROFILE / HISTORY / DIAGNOSTICS
    // ============================================================

    function downloadTextFile(filename, text, mime = 'application/json') {
        const blob = new Blob([text], { type: mime });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
            URL.revokeObjectURL(url);
            a.remove();
        }, 1000);
    }

    function validateDepartmentProfilePayload(payload) {
        if (!payload || typeof payload !== 'object') {
            throw new Error('Department profile file is invalid.');
        }

        // Accept the v2 portable file as a one-way roster migration, but do not
        // import its old defaultFailures because those may be personal rules.
        if (payload.schema === 'vector-ppe-helper-portable-settings') {
            const people = assertNoPrefixOverlap(normalizePeopleDirectory(payload.roster || []));
            if (!people.length) throw new Error('The imported v2 roster is empty.');
            return {
                peopleDirectory: people,
                departmentProfile: normalizeDepartmentProfile(DEFAULT_DEPARTMENT_PROFILE),
                legacyImport: true
            };
        }

        if (payload.schema !== 'vector-ppe-helper-department-profile') {
            throw new Error('This is not a Vector Rebel department profile file.');
        }

        const people = assertNoPrefixOverlap(normalizePeopleDirectory(payload.peopleDirectory || []));
        const profile = normalizeDepartmentProfile(payload.departmentProfile || {});

        for (const [modeKey, templates] of Object.entries(profile.modeTemplates || {})) {
            if (!BUILTIN_MODES[modeKey]) throw new Error(`Unknown inspection mode in profile: ${modeKey}`);
            for (const [pool, template] of Object.entries(templates || {})) {
                if (!/^\d+$/.test(String(pool)) || !/^\d+$/.test(String(template))) {
                    throw new Error(`Invalid pool/template mapping in ${modeKey}: ${pool} → ${template}`);
                }
            }
        }

        return { peopleDirectory: people, departmentProfile: profile, legacyImport: false };
    }

    function exportDepartmentProfile() {
        const config = getConfig();
        const payload = {
            schema: 'vector-ppe-helper-department-profile',
            schemaVersion: 2,
            helperVersion: VERSION,
            exportedAt: new Date().toISOString(),
            note: 'Shareable department data only. Signatures, inspector identity, self prefix, local coat comment, personal Captain sets, local asset rules, gear snapshots, diagnostics, and run history are excluded.',
            peopleDirectory: deepClone(config.peopleDirectory),
            departmentProfile: deepClone(config.departmentProfile)
        };
        downloadTextFile(
            `vector-ppe-department-profile-${new Date().toISOString().slice(0, 10)}.json`,
            JSON.stringify(payload, null, 2)
        );
        setStatus('Department profile exported. No signatures or personal settings were included.');
    }

    function readDepartmentProfileFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onerror = () => reject(new Error('Could not read the department profile file.'));
            reader.onload = () => {
                try {
                    const parsed = JSON.parse(String(reader.result || ''));
                    resolve(validateDepartmentProfilePayload(parsed));
                } catch (error) {
                    reject(error);
                }
            };
            reader.readAsText(file);
        });
    }

    function mergePeopleDirectory(localPeople, incomingPeople) {
        const byPrefix = new Map((localPeople || []).map(p => [p.prefix, deepClone(p)]));
        for (const person of incomingPeople || []) byPrefix.set(person.prefix, deepClone(person));
        return assertNoPrefixOverlap([...byPrefix.values()]);
    }

    function peopleImportDiff(localPeople, incomingPeople) {
        const local = new Map((localPeople || []).map(p => [p.prefix, p]));
        const incoming = new Map((incomingPeople || []).map(p => [p.prefix, p]));
        const added = [...incoming.values()].filter(p => !local.has(p.prefix));
        const updated = [...incoming.values()].filter(p => {
            const old = local.get(p.prefix);
            return old && old.name !== p.name;
        });
        const localOnly = [...local.values()].filter(p => !incoming.has(p.prefix));
        return { added, updated, localOnly };
    }

    function pruneGearSnapshots(validPrefixes) {
        const allowed = new Set((validPrefixes || []).map(x => clean(x).toUpperCase()));
        const snapshots = getGearSnapshots();
        let changed = false;
        for (const prefix of Object.keys(snapshots)) {
            if (!allowed.has(clean(prefix).toUpperCase())) {
                delete snapshots[prefix];
                changed = true;
            }
        }
        if (changed) saveJSON(GEAR_SNAPSHOTS_KEY, snapshots);
    }

    function showDepartmentImportPreview(incoming, settingsOverlay = null) {
        const current = getConfig();
        const diff = peopleImportDiff(current.peopleDirectory, incoming.peopleDirectory);
        const { overlay, box } = makeOverlayBox('820px');

        box.innerHTML = `
            <div style="font-size:21px;font-weight:700;margin-bottom:8px">Department Profile Import Preview</div>
            <div style="font-size:12px;background:#eef5fb;padding:9px;margin-bottom:10px;line-height:1.45">
                Department mappings will be replaced by the imported profile. The People Directory is <b>merged by default</b>.
                Signatures, inspector identity, My gear prefix, local rules, run history, and Captain list remains local.
            </div>
        `;

        const summary = document.createElement('div');
        summary.style.cssText = 'font-size:13px;line-height:1.5;margin-bottom:8px;';
        summary.innerHTML =
            `<b>Imported profile:</b> ${escapeHtml(incoming.departmentProfile.name)}<br>` +
            `<b>Scope:</b> ${escapeHtml(incoming.departmentProfile.profileScope || '(none)')}<br>` +
            `<b>People added:</b> ${diff.added.length}<br>` +
            `<b>People updated:</b> ${diff.updated.length}<br>` +
            `<b>Local-only people:</b> ${diff.localOnly.length}` +
            (incoming.legacyImport ? '<br><b>Legacy v2 import:</b> old shared failure defaults are intentionally NOT imported.' : '');
        box.appendChild(summary);

        const detail = document.createElement('div');
        detail.style.cssText = 'font-size:12px;background:#f7f7f7;padding:8px;max-height:180px;overflow:auto;margin-bottom:10px;';
        const lines = [];
        if (diff.added.length) lines.push('<b>ADD:</b> ' + diff.added.map(p => escapeHtml(`${p.name} (${p.prefix})`)).join(', '));
        if (diff.updated.length) lines.push('<b>UPDATE:</b> ' + diff.updated.map(p => escapeHtml(`${p.name} (${p.prefix})`)).join(', '));
        if (diff.localOnly.length) lines.push('<b>LOCAL-ONLY:</b> ' + diff.localOnly.map(p => escapeHtml(`${p.name} (${p.prefix})`)).join(', '));
        detail.innerHTML = lines.join('<br>') || 'No People Directory differences.';
        box.appendChild(detail);

        const replaceLabel = document.createElement('label');
        replaceLabel.style.cssText = 'display:flex;gap:8px;align-items:flex-start;padding:9px;background:#fff4e5;border:1px solid #d49b42;margin:8px 0;';
        const replace = document.createElement('input');
        replace.type = 'checkbox';
        const replaceText = document.createElement('span');
        replaceText.innerHTML = '<b>REPLACE the local People Directory instead of merging.</b> Local-only people will be removed from the directory. Your saved Captain list remains local; anyone no longer in the People Directory will simply drop out of that local list.';
        replaceLabel.append(replace, replaceText);
        box.appendChild(replaceLabel);

        const apply = makeButton('APPLY IMPORT', { background: '#e8f2e8' });
        apply.onclick = () => {
            try {
                const next = cloneConfig();
                next.peopleDirectory = replace.checked
                    ? assertNoPrefixOverlap(incoming.peopleDirectory)
                    : mergePeopleDirectory(next.peopleDirectory, incoming.peopleDirectory);
                next.departmentProfile = incoming.departmentProfile;
                next.captainRosterPrefixes = normalizeCaptainRosterPrefixes(next.captainRosterPrefixes, next.peopleDirectory);
                next.captainSets = normalizeCaptainSets(next.captainSets, next.peopleDirectory);
                saveConfig(next);
                overlay.remove();
                settingsOverlay?.remove();
                refreshPanelInfo();
                setStatus(
                    `Department Profile imported (${replace.checked ? 'replace' : 'merge'} directory). ` +
                    `Captain list kept ${next.captainRosterPrefixes.length} available person(s).`
                );
            } catch (error) {
                alert(error.message);
            }
        };

        const cancel = makeButton('Cancel');
        cancel.onclick = () => overlay.remove();
        box.append(apply, cancel);
    }

    function summarizeCompletedRun(run) {
        const mode = getMode(run.modeKey);
        const groups = {};
        for (const item of run.items || []) {
            const owner = item.ownerName || run.ownerName || 'Unknown';
            groups[owner] ||= { total: 0, failed: 0, items: [] };
            groups[owner].total += 1;
            const failed = item.q1 === 'fail' || item.q2 === 'fail';
            if (failed) groups[owner].failed += 1;
            const completion = (run.completed || []).find(c => c.assetId === item.assetId);
            groups[owner].items.push({
                assetId: item.assetId,
                type: item.type,
                q1: item.q1,
                q2: item.q2,
                failureNote: item.failureNote || '',
                signatureLabel: completion?.signatureLabel || '',
                evidence: completion?.evidence || '',
                verificationDiagnostics: completion?.verificationDiagnostics || null
            });
        }
        return {
            helperVersion: VERSION,
            runId: run.runId,
            modeKey: run.modeKey,
            modeTitle: mode?.title || run.modeKey,
            inspectorName: run.inspectorName,
            ownerLabel: run.ownerLabel || run.ownerName || '',
            startedAt: run.startedAt || null,
            completedAt: new Date().toISOString(),
            total: (run.items || []).length,
            failures: (run.items || []).filter(i => i.q1 === 'fail' || i.q2 === 'fail').length,
            inferredCompletions: (run.completed || []).filter(
                c => String(c?.evidence || '').startsWith('post-submit-return-')
            ).length,
            groups
        };
    }

    function getRunHistory() {
        const history = loadJSON(RUN_HISTORY_KEY, []);
        return Array.isArray(history) ? history : [];
    }

    function stripVerificationDiagnosticsFromSummary(summary) {
        const copy = deepClone(summary);
        for (const group of Object.values(copy?.groups || {})) {
            for (const item of group?.items || []) {
                if ('verificationDiagnostics' in item) item.verificationDiagnostics = null;
            }
        }
        copy.diagnosticsCompacted = true;
        return copy;
    }

    function compactRunHistoryDiagnostics(history, fullCount = 3) {
        return (Array.isArray(history) ? history : []).slice(0, 20).map(
            (summary, index) => index < fullCount ? summary : stripVerificationDiagnosticsFromSummary(summary)
        );
    }

    function saveRunHistory(history) {
        saveJSON(RUN_HISTORY_KEY, (Array.isArray(history) ? history : []).slice(0, 20));
    }

    function recordCompletedRun(summary) {
        const warnings = [];

        // LAST RUN is the authoritative local export target and keeps full
        // verification diagnostics for the just-finished run.
        try {
            saveJSON(LAST_SUMMARY_KEY, summary);
        } catch (error) {
            // Free space by compacting older history, then retry the critical
            // last-summary write once.
            try {
                saveRunHistory(compactRunHistoryDiagnostics(getRunHistory(), 0));
                saveJSON(LAST_SUMMARY_KEY, summary);
            } catch (retryError) {
                warnings.push(`LAST RUN could not be stored: ${retryError.message}`);
            }
        }

        const history = getRunHistory().filter(x => x?.runId !== summary.runId);
        history.unshift(summary);

        // Keep full field diagnostics only for the newest three history entries;
        // evidence/failure/signature metadata remains in all 20 entries.
        try {
            saveRunHistory(compactRunHistoryDiagnostics(history, 3));
        } catch (error) {
            try {
                // Emergency compact form preserves the run list even if the
                // origin is near its localStorage quota.
                saveRunHistory(compactRunHistoryDiagnostics(history, 0));
                warnings.push('Older run diagnostics were compacted because browser storage was near its limit.');
            } catch (retryError) {
                warnings.push(`Run history could not be stored: ${retryError.message}`);
            }
        }

        return warnings;
    }

    function migrateLegacyRunHistory() {
        if (getRunHistory().length) return;
        const legacy = loadJSON(LEGACY_LAST_SUMMARY_KEY, null);
        if (legacy?.runId) {
            saveRunHistory([legacy]);
            if (!loadJSON(LAST_SUMMARY_KEY, null)) saveJSON(LAST_SUMMARY_KEY, legacy);
        }
    }

    function showRunSummary(summary = loadJSON(LAST_SUMMARY_KEY, null)) {
        if (!summary) {
            setStatus('No completed-run summary is stored yet.');
            return;
        }

        const { overlay, box } = makeOverlayBox('620px');
        const inferredCount = Number(summary.inferredCompletions || 0);
        const total = Number(summary.total || 0);
        const failures = Number(summary.failures || 0);
        const modeLabel = getMode(summary.modeKey)?.short || summary.modeTitle || summary.modeKey || 'PPE';

        const top = document.createElement('div');
        top.style.cssText =
            'display:flex;align-items:center;gap:12px;margin-bottom:12px;';

        const check = document.createElement('div');
        check.style.cssText =
            'width:42px;height:42px;min-width:42px;border-radius:50%;display:flex;' +
            'align-items:center;justify-content:center;background:#e8f4ec;color:#27633b;' +
            'font:700 24px/1 Arial,sans-serif;';
        check.textContent = '✓';

        const heading = document.createElement('div');
        heading.innerHTML =
            '<div style="font-size:22px;font-weight:700;color:#153e5c">Inspection Complete</div>' +
            `<div style="font-size:12px;color:#607483;margin-top:2px">${escapeHtml(modeLabel)}</div>`;

        top.append(check, heading);
        box.appendChild(top);

        const result = document.createElement('div');
        result.style.cssText =
            'display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:0 0 12px;';
        result.innerHTML =
            `<div style="padding:10px;border:1px solid #dce7ed;border-radius:8px;background:#f7fafb">` +
                `<div style="font-size:11px;color:#607483">Completed</div>` +
                `<div style="font-size:20px;font-weight:700;color:#153e5c">${escapeHtml(String(total))}</div>` +
            `</div>` +
            `<div style="padding:10px;border:1px solid ${failures ? '#eccaca' : '#dce7ed'};border-radius:8px;background:${failures ? '#fff5f5' : '#f7fafb'}">` +
                `<div style="font-size:11px;color:#607483">Failures</div>` +
                `<div style="font-size:20px;font-weight:700;color:${failures ? '#9d3030' : '#153e5c'}">${escapeHtml(String(failures))}</div>` +
            `</div>`;
        box.appendChild(result);

        if (inferredCount > 0) {
            const warning = document.createElement('div');
            warning.style.cssText =
                'background:#fff7e8;border:1px solid #e4bd73;padding:10px 11px;' +
                'margin:0 0 12px;border-radius:8px;font-size:12px;line-height:1.45;color:#6d531d;';
            warning.innerHTML =
                '<b>Verification needed.</b> Vector Rebel could not independently confirm ' +
                `${escapeHtml(String(inferredCount))} completed item${inferredCount === 1 ? '' : 's'} in the Item Log. ` +
                'Check Vector history before running that item again.';
            box.appendChild(warning);
        }

        if (failures > 0) {
            const failureNote = document.createElement('div');
            failureNote.style.cssText =
                'background:#fff4f4;border:1px solid #e4b9b9;padding:10px 11px;' +
                'margin:0 0 12px;border-radius:8px;font-size:12px;color:#7a2929;';
            failureNote.textContent =
                `${failures} completed inspection${failures === 1 ? '' : 's'} included a failed check.`;
            box.appendChild(failureNote);
        }

        const actions = document.createElement('div');
        actions.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;';

        const close = makeButton('Close', { background: '#176b8e', color: '#fff' });
        close.onclick = () => overlay.remove();
        actions.appendChild(close);

        if (isAdminUnlocked()) {
            const admin = makeButton('Admin Details');
            actions.appendChild(admin);

            const details = document.createElement('div');
            details.style.cssText =
                'display:none;margin-top:14px;padding-top:12px;border-top:1px solid #dde6ec;' +
                'font-size:12px;line-height:1.45;';
            box.append(actions, details);

            admin.onclick = () => {
                const opening = details.style.display === 'none';
                details.style.display = opening ? 'block' : 'none';
                admin.textContent = opening ? 'Hide Admin Details' : 'Admin Details';

                if (!opening || details.dataset.rendered === '1') return;
                details.dataset.rendered = '1';

                const overview = document.createElement('div');
                overview.innerHTML =
                    `<b>Mode:</b> ${escapeHtml(summary.modeTitle || summary.modeKey || '')}<br>` +
                    `<b>Inspector:</b> ${escapeHtml(summary.inspectorName || '')}<br>` +
                    `<b>Gear owner(s):</b> ${escapeHtml(summary.ownerLabel || '')}<br>` +
                    `<b>Finished:</b> ${escapeHtml(summary.completedAt ? new Date(summary.completedAt).toLocaleString() : '')}`;
                details.appendChild(overview);

                for (const [owner, group] of Object.entries(summary.groups || {})) {
                    const header = document.createElement('div');
                    header.style.cssText =
                        'margin:12px 0 5px;padding:7px 9px;background:#eef3f6;border-radius:6px;font-weight:700;';
                    header.textContent = `${owner} — ${group.total} item(s) — ${group.failed} with failure`;
                    details.appendChild(header);

                    for (const item of group.items || []) {
                        const failed = item.q1 === 'fail' || item.q2 === 'fail';
                        const row = document.createElement('div');
                        row.style.cssText =
                            `padding:7px 9px;margin:3px 0;border:1px solid #e0e6ea;border-radius:6px;${failed ? 'background:#fff4f4;' : ''}`;
                        row.innerHTML =
                            `<b>${escapeHtml(item.assetId || '')}</b> — ${escapeHtml(item.type || '')}` +
                            `<br>Age/label: <b>${escapeHtml((item.q1 || '').toUpperCase())}</b> · ` +
                            `Damage: <b>${escapeHtml((item.q2 || '').toUpperCase())}</b>` +
                            (item.failureNote
                                ? `<br><b>Failure note:</b> ${escapeHtml(item.failureNote)}`
                                : '') +
                            (item.signatureLabel
                                ? `<br><span style="color:#667784">Signature: ${escapeHtml(item.signatureLabel)}</span>`
                                : '') +
                            (item.evidence
                                ? `<br><span style="font-size:10px;color:#71808a">Evidence: ${escapeHtml(item.evidence)}</span>`
                                : '');
                        details.appendChild(row);

                        const hv = item.verificationDiagnostics?.historyVerification;
                        if (hv) {
                            const verify = document.createElement('div');
                            verify.style.cssText =
                                'margin:4px 0 9px 12px;padding:7px 9px;background:#f7fafb;' +
                                'border-left:3px solid #8aa8bc;font-size:11px;color:#435d6d;';
                            verify.innerHTML =
                                `<b>Item Log verification:</b> ${escapeHtml(hv.result || 'unknown')}` +
                                `<br>baseline: ${escapeHtml(String(hv.baselineCount ?? 'n/a'))}` +
                                ` · post-submit: ${escapeHtml(String(hv.postSubmitCount ?? 'n/a'))}` +
                                ` · stable reads: ${escapeHtml(String(hv.stableReads ?? 0))}` +
                                `<br>row ids: ${hv.postSubmitUsesStableIds ? 'stable DOM ids' : 'occurrence keys'}` +
                                `<br>added keys: ${escapeHtml((hv.addedKeys || []).join(', ') || 'none')}`;
                            details.appendChild(verify);
                        }
                    }
                }

                const summaryJson = JSON.stringify(summary, null, 2);
                const exportNote = document.createElement('div');
                exportNote.style.cssText = 'font-size:10px;color:#71808a;margin-top:10px;';
                exportNote.textContent =
                    'Admin export may contain inspector/owner names and failure notes.';
                details.appendChild(exportNote);

                const copy = makeButton('Copy Summary JSON');
                copy.onclick = async () => {
                    const ok = await copyText(summaryJson);
                    setStatus(ok ? 'Run summary copied.' : 'Could not copy run summary.', ok);
                };

                const download = makeButton('Download Summary JSON');
                download.onclick = () => downloadTextFile(
                    `vector-rebel-run-${clean(summary.runId || 'summary')}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
                    summaryJson
                );

                details.append(copy, download);
            };
            return;
        }

        box.appendChild(actions);
    }
    function showRunHistory() {
        const history = getRunHistory();
        if (!history.length) {
            setStatus('No completed PPE run history is stored yet.');
            return;
        }

        const { overlay, box } = makeOverlayBox('900px');
        const title = document.createElement('div');
        title.style.cssText = 'font-size:22px;font-weight:700;margin-bottom:8px;';
        title.textContent = `PPE Run History — last ${history.length}`;
        box.appendChild(title);

        history.forEach((summary, index) => {
            const row = document.createElement('div');
            row.style.cssText = 'display:grid;grid-template-columns:1fr auto;gap:8px;align-items:center;border:1px solid #ddd;border-radius:6px;padding:9px;margin:5px 0;';
            const text = document.createElement('div');
            text.innerHTML =
                `<b>${escapeHtml(summary.modeTitle || summary.modeKey || '')}</b> — ${escapeHtml(summary.ownerLabel || '')}<br>` +
                `<span style="font-size:12px;color:#555">${escapeHtml(summary.completedAt ? new Date(summary.completedAt).toLocaleString() : '')} — ${escapeHtml(String(summary.total || 0))} item(s), ${escapeHtml(String(summary.failures || 0))} with failure</span>`;
            const view = makeButton('VIEW');
            view.onclick = () => showRunSummary(summary);
            row.append(text, view);
            box.appendChild(row);
        });

        const close = makeButton('Close');
        close.onclick = () => overlay.remove();
        box.appendChild(close);
    }

    async function copyText(text) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch {
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.style.position = 'fixed';
            ta.style.left = '-9999px';
            document.body.appendChild(ta);
            ta.select();
            const ok = document.execCommand('copy');
            ta.remove();
            return ok;
        }
    }

    function liveDomPreflightReport() {
        const report = {
            helperVersion: VERSION,
            at: new Date().toISOString(),
            url: location.href,
            pageType: 'other',
            checks: {}
        };

        const config = getConfig();
        const assetMatch = location.pathname.match(/\/PPE\/pool\/(\d+)\/(\d+)\/item\/?$/i);
        if (assetMatch) {
            report.pageType = 'ppe-asset';
            const titleCandidates = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6,[data-testid*="title"],[class*="title"]')]
                .filter(visible)
                .map(el => clean(el.textContent))
                .filter(Boolean)
                .slice(0, 20);
            const configuredPeople = config.peopleDirectory || [];
            const possibleIds = titleCandidates.flatMap(text => {
                const upper = text.toUpperCase();
                return configuredPeople
                    .map(p => {
                        const re = new RegExp(`(?:^|[^A-Z0-9-])(${escapeRegex(p.prefix)}-[A-Z0-9]+(?:-[A-Z0-9]+)*)(?:$|[^A-Z0-9-])`, 'i');
                        return upper.match(re)?.[1] || null;
                    })
                    .filter(Boolean);
            });
            const assetId = possibleIds[0] || '';
            const item = assetId ? { assetId, pool: assetMatch[1], itemId: assetMatch[2] } : null;
            const history = findItemLogHistoryTable();
            report.checks.assetIdentityCandidate = assetId || null;
            report.checks.assetIdentityElementFound = item ? !!findAssetIdentityElement(item) : false;
            report.checks.historyContainerFound = !!history;
            report.checks.historyHeaderText = history ? historyContainerHeaderText(history) : '';
            report.checks.historySortDirection = history ? historySortDirection() : 'unknown';
            report.checks.historyRowCount = history ? historyRows(history).length : 0;
            report.checks.visibleTableStructures = safeDiagnosticTableStructure(item);
            report.checks.assetPageFingerprint = item ? assetPageDiagnosticFingerprint(item) : null;
            return report;
        }

        const search = getSearchInput();
        if (search && getPpeResultsContainer()) {
            report.pageType = 'ppe-list';
            const root = getPpeResultsContainer();
            const anchors = getVisiblePpeAnchors(root);
            report.checks.searchInputFound = true;
            report.checks.visiblePpeAnchorCount = anchors.length;
            report.checks.anchorSamples = anchors.slice(0, 8).map(a => ({
                ariaLabel: clean(a.getAttribute('aria-label') || ''),
                title: clean(a.getAttribute('title') || ''),
                text: clean(a.textContent || ''),
                href: a.getAttribute('href') || ''
            }));
            return report;
        }

        report.checks.message = 'Open the Equipment → PPE list or an individual PPE asset page and run the preflight again.';
        return report;
    }

    function showLiveDomPreflight() {
        if (!requireAdmin('Live DOM Preflight')) return;
        const report = liveDomPreflightReport();
        const { overlay, box } = makeOverlayBox('900px');
        box.innerHTML = `
            <div style="font-size:22px;font-weight:700;margin-bottom:6px">Live Vector DOM Preflight</div>
            <div style="font-size:12px;line-height:1.45;background:#eef5fb;padding:9px;margin-bottom:8px">
                Read-only. This checks the current Vector page structure; it does not start or submit an inspection.
            </div>
        `;
        const ta = document.createElement('textarea');
        ta.readOnly = true;
        ta.value = JSON.stringify(report, null, 2);
        ta.style.cssText = 'width:100%;height:430px;box-sizing:border-box;font-family:Consolas,monospace;font-size:12px;padding:8px;';
        box.appendChild(ta);
        const copy = makeButton('COPY PREFLIGHT');
        copy.onclick = async () => setStatus(await copyText(ta.value) ? 'Preflight copied.' : 'Could not copy preflight.');
        const download = makeButton('DOWNLOAD PREFLIGHT');
        download.onclick = () => downloadTextFile(`vector-ppe-preflight-${new Date().toISOString().replace(/[:.]/g, '-')}.json`, ta.value);
        const close = makeButton('Close');
        close.onclick = () => overlay.remove();
        box.append(copy, download, close);
    }

    function showDiagnostics() {
        if (!requireAdmin('Diagnostics')) return;
        const report = loadJSON(LAST_DIAGNOSTIC_KEY, null);
        const { overlay, box } = makeOverlayBox('900px');
        box.innerHTML = `
            <div style="font-size:22px;font-weight:700;margin-bottom:6px">Vector Rebel Diagnostics</div>
            <div style="font-size:12px;line-height:1.45;background:#fff4e5;padding:9px;margin-bottom:8px">
                Diagnostics intentionally exclude signatures and local failure-note content. Structural captures may also be saved when history verification is unavailable. The Live DOM Preflight is read-only.
            </div>
        `;

        const preflight = makeButton('LIVE DOM PREFLIGHT', { background: '#e8f2e8' });
        preflight.onclick = () => {
            overlay.remove();
            showLiveDomPreflight();
        };
        box.appendChild(preflight);

        if (report) {
            const ta = document.createElement('textarea');
            ta.readOnly = true;
            ta.value = JSON.stringify(report, null, 2);
            ta.style.cssText = 'width:100%;height:380px;box-sizing:border-box;font-family:Consolas,monospace;font-size:12px;padding:8px;margin-top:8px;';
            box.appendChild(ta);

            const copy = makeButton('COPY LAST DIAGNOSTIC');
            copy.onclick = async () => {
                const ok = await copyText(ta.value);
                setStatus(ok ? 'Diagnostic copied.' : 'Could not copy diagnostic.', ok);
            };

            const download = makeButton('DOWNLOAD LAST DIAGNOSTIC');
            download.onclick = () => downloadTextFile(
                `vector-ppe-diagnostic-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
                ta.value
            );

            const clear = makeButton('CLEAR DIAGNOSTIC', { background: '#fff0f0', color: '#8b1e1e' });
            clear.onclick = () => {
                localStorage.removeItem(LAST_DIAGNOSTIC_KEY);
                overlay.remove();
                setStatus('Diagnostic cleared.');
            };
            box.append(copy, download, clear);
        } else {
            const none = document.createElement('div');
            none.style.cssText = 'font-size:12px;background:#f5f6f7;padding:9px;margin:8px 0;';
            none.textContent = 'No stop diagnostic is currently stored.';
            box.appendChild(none);
        }

        const close = makeButton('Close');
        close.onclick = () => overlay.remove();
        box.appendChild(close);
    }

    // ============================================================
    // SIGNATURE LIBRARY + ROTATION
    // ============================================================

    function migrateLegacySignature() {
        const existing = loadJSON(SIGNATURE_LIBRARY_KEY, []);
        if (Array.isArray(existing) && existing.length) return;

        const legacy = loadJSON(LEGACY_SIGNATURE_KEY, null);
        if (Array.isArray(legacy) && legacy.length) {
            saveJSON(SIGNATURE_LIBRARY_KEY, [{
                id: 'sig-' + Date.now(),
                label: 'Signature 1 (migrated)',
                createdAt: new Date().toISOString(),
                strokes: legacy
            }]);
            localStorage.setItem(SIGNATURE_CURSOR_KEY, '0');
        }
    }

    function getSignatureLibrary() {
        migrateLegacySignature();
        const library = loadJSON(SIGNATURE_LIBRARY_KEY, []);
        return Array.isArray(library) ? library : [];
    }

    function saveSignatureLibrary(library) {
        saveJSON(SIGNATURE_LIBRARY_KEY, library);
        const cursor = Number(localStorage.getItem(SIGNATURE_CURSOR_KEY) || 0);
        if (!library.length) {
            localStorage.setItem(SIGNATURE_CURSOR_KEY, '0');
        } else if (cursor >= library.length) {
            localStorage.setItem(SIGNATURE_CURSOR_KEY, '0');
        }
        refreshPanelInfo();
    }

    function peekSignatureVariant() {
        const library = getSignatureLibrary();
        if (!library.length) {
            throw new Error('No saved signature variants. Open Settings → Signatures and add at least one signature you personally drew.');
        }

        let cursor = Number(localStorage.getItem(SIGNATURE_CURSOR_KEY) || 0);
        if (!Number.isFinite(cursor) || cursor < 0) cursor = 0;
        const index = cursor % library.length;
        return { variant: library[index], index, total: library.length };
    }

    function advanceSignatureCursor(index, total) {
        if (!Number.isInteger(total) || total <= 0) return;
        localStorage.setItem(SIGNATURE_CURSOR_KEY, String((index + 1) % total));
    }

    function showSignatureManager() {
        const { overlay, box } = makeOverlayBox('760px');
        const config = getConfig();

        const title = document.createElement('div');
        title.style.cssText = 'font-size:21px;font-weight:700;margin-bottom:6px;';
        title.textContent = 'Signature Rotation';
        box.appendChild(title);

        const explainer = document.createElement('div');
        explainer.style.cssText = 'margin-bottom:12px;line-height:1.4;';
        explainer.innerHTML =
            `These signatures are stored only in this browser and should all be signatures personally drawn by <b>${escapeHtml(config.inspectorName)}</b>. ` +
            'The helper rotates through them in order for each submitted inspection.';
        box.appendChild(explainer);

        const listWrap = document.createElement('div');
        box.appendChild(listWrap);

        const renderList = () => {
            listWrap.innerHTML = '';
            const library = getSignatureLibrary();
            const cursor = Number(localStorage.getItem(SIGNATURE_CURSOR_KEY) || 0);

            const header = document.createElement('div');
            header.style.cssText = 'font-weight:700;margin:8px 0;';
            header.textContent = `${library.length} saved variant${library.length === 1 ? '' : 's'}${library.length ? ` — next: ${Math.min(cursor + 1, library.length)}` : ''}`;
            listWrap.appendChild(header);

            if (!library.length) {
                const none = document.createElement('div');
                none.style.cssText = 'padding:9px;background:#f5f6f7;margin-bottom:10px;';
                none.textContent = 'No signatures saved yet.';
                listWrap.appendChild(none);
            }

            library.forEach((sig, idx) => {
                const row = document.createElement('div');
                row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;border:1px solid #ddd;border-radius:5px;padding:8px;margin:4px 0;';

                const text = document.createElement('div');
                text.innerHTML = `<b>${escapeHtml(sig.label || `Signature ${idx + 1}`)}</b><br><span style="font-size:12px">${sig.strokes?.length || 0} stroke(s)</span>`;

                const del = makeButton('Delete', { background: '#fff0f0', color: '#8b1e1e' });
                del.onclick = () => {
                    if (!confirm(`Delete ${sig.label || `Signature ${idx + 1}`}?`)) return;
                    const next = getSignatureLibrary().filter(x => x.id !== sig.id);
                    saveSignatureLibrary(next);
                    renderList();
                };

                row.append(text, del);
                listWrap.appendChild(row);
            });
        };

        renderList();

        const padTitle = document.createElement('div');
        padTitle.style.cssText = 'font-size:17px;font-weight:700;margin:16px 0 7px;';
        padTitle.textContent = 'Add a signature variant';
        box.appendChild(padTitle);

        const canvas = document.createElement('canvas');
        canvas.width = 700;
        canvas.height = 220;
        canvas.style.cssText = 'width:100%;height:220px;border:2px solid #173f70;border-radius:5px;background:#fff;touch-action:none;cursor:crosshair;box-sizing:border-box;';
        box.appendChild(canvas);

        const ctx = canvas.getContext('2d');
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = '#111';

        let strokes = [];
        let activeStroke = null;

        const pointFromEvent = e => {
            const r = canvas.getBoundingClientRect();
            return {
                x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
                y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))
            };
        };

        const drawSegment = (a, b) => {
            ctx.beginPath();
            ctx.moveTo(a.x * canvas.width, a.y * canvas.height);
            ctx.lineTo(b.x * canvas.width, b.y * canvas.height);
            ctx.stroke();
        };

        canvas.addEventListener('pointerdown', e => {
            e.preventDefault();
            canvas.setPointerCapture?.(e.pointerId);
            activeStroke = [pointFromEvent(e)];
            strokes.push(activeStroke);
        });

        canvas.addEventListener('pointermove', e => {
            if (!activeStroke) return;
            e.preventDefault();
            const p = pointFromEvent(e);
            const previous = activeStroke[activeStroke.length - 1];
            activeStroke.push(p);
            drawSegment(previous, p);
        });

        const endStroke = e => {
            if (!activeStroke) return;
            e.preventDefault();
            const p = pointFromEvent(e);
            const previous = activeStroke[activeStroke.length - 1];
            activeStroke.push(p);
            drawSegment(previous, p);
            activeStroke = null;
        };

        canvas.addEventListener('pointerup', endStroke);
        canvas.addEventListener('pointercancel', () => { activeStroke = null; });

        const labelInput = document.createElement('input');
        labelInput.type = 'text';
        labelInput.placeholder = 'Optional label, e.g. Signature 2';
        labelInput.style.cssText = 'width:100%;box-sizing:border-box;margin-top:8px;padding:8px;';
        box.appendChild(labelInput);

        const clear = makeButton('Clear pad');
        clear.onclick = () => {
            strokes = [];
            activeStroke = null;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        };

        const save = makeButton('SAVE THIS VARIANT', { background: '#e8f2e8' });
        save.onclick = () => {
            const usable = strokes.filter(s => Array.isArray(s) && s.length >= 2);
            if (!usable.length) {
                alert('Draw your signature first.');
                return;
            }

            const library = getSignatureLibrary();
            const label = clean(labelInput.value) || `Signature ${library.length + 1}`;
            library.push({
                id: 'sig-' + Date.now() + '-' + Math.random().toString(16).slice(2),
                label,
                createdAt: new Date().toISOString(),
                strokes: usable
            });
            saveSignatureLibrary(library);
            labelInput.value = '';
            strokes = [];
            activeStroke = null;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            renderList();
        };

        const resetRotation = makeButton('Reset rotation to Signature 1');
        resetRotation.onclick = () => {
            localStorage.setItem(SIGNATURE_CURSOR_KEY, '0');
            renderList();
        };

        const close = makeButton('Close');
        close.onclick = () => overlay.remove();

        box.append(clear, save, resetRotation, close);
    }

    function escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    // ============================================================
    // VECTOR SIGNATURE REPLAY
    // ============================================================

    function dispatchPointer(canvas, type, x, y, down) {
        if (!window.PointerEvent) return;
        canvas.dispatchEvent(new PointerEvent(type, {
            bubbles: true,
            cancelable: true,
            pointerId: 91,
            pointerType: 'mouse',
            isPrimary: true,
            clientX: x,
            clientY: y,
            button: 0,
            buttons: down ? 1 : 0
        }));
    }

    function dispatchMouse(canvas, type, x, y, down) {
        canvas.dispatchEvent(new MouseEvent(type, {
            bubbles: true,
            cancelable: true,
            view: window,
            clientX: x,
            clientY: y,
            button: 0,
            buttons: down ? 1 : 0
        }));
    }

    async function replayStroke(canvas, stroke) {
        const r = canvas.getBoundingClientRect();
        const pts = stroke.map(p => ({
            x: r.left + p.x * r.width,
            y: r.top + p.y * r.height
        }));
        if (!pts.length) return;

        dispatchPointer(canvas, 'pointerdown', pts[0].x, pts[0].y, true);
        dispatchMouse(canvas, 'mousedown', pts[0].x, pts[0].y, true);

        for (let i = 1; i < pts.length; i++) {
            dispatchPointer(canvas, 'pointermove', pts[i].x, pts[i].y, true);
            dispatchMouse(canvas, 'mousemove', pts[i].x, pts[i].y, true);
            await sleep(3);
        }

        const last = pts[pts.length - 1];
        dispatchPointer(canvas, 'pointerup', last.x, last.y, false);
        dispatchMouse(canvas, 'mouseup', last.x, last.y, false);
        await sleep(40);
    }

    async function applyNextSignature() {
        const { variant, index, total } = peekSignatureVariant();

        // Vector can finish rendering the lower half of the inspection a little
        // after the response buttons. Wait for the signature control instead of
        // treating a short render delay as a failure.
        const sign = await waitFor(() => enabledButton('Click to Sign'), 12000);

        // Follow the work visually so the user can see Vector Rebel move through
        // the signature portion instead of appearing stuck above it.
        await bringIntoView(sign, 500);
        sign.click();

        const canvas = await waitFor(
            () => [...document.querySelectorAll('canvas')].find(visible),
            8000
        );

        await bringIntoView(canvas, 450);
        await sleep(250);

        for (const stroke of variant.strokes) {
            await replayStroke(canvas, stroke);
        }

        await sleep(1200);
        const confirmButton = await waitFor(() => enabledButton('CONFIRM'), 5000);
        await bringIntoView(confirmButton, 350);
        confirmButton.click();

        await waitFor(() => {
            const canvasOpen = [...document.querySelectorAll('canvas')].some(visible);
            return !canvasOpen && !exactButton('CONFIRM');
        }, 12000);

        // After the signature closes, move the page to the final Submit button.
        // This does NOT click it; the existing fail-closed submit engine still
        // controls the irreversible action.
        const mainSubmit = await waitFor(() => enabledButton('Submit Inspection'), 10000);
        await bringIntoView(mainSubmit, 550);

        // Proven settle delay before main Submit. Advance rotation only after
        // replay + CONFIRM succeeded, so a failed signature attempt does not skip a variant.
        await sleep(1800);
        advanceSignatureCursor(index, total);
        return { label: variant.label || `Signature ${index + 1}`, index, total };
    }

    // ============================================================
    // VECTOR LIST / ASSET DISCOVERY
    // ============================================================

    function getSearchInput() {
        return document.querySelector('#search-input') ||
            [...document.querySelectorAll('input')].find(input => {
                const p = clean(input.placeholder).toLowerCase();
                return p.includes('search') && visible(input);
            }) || null;
    }

    function visibleAssetLinksSignature() {
        return [...document.querySelectorAll('a[href*="/app/equipment/PPE/pool/"]')]
            .filter(visible)
            .map(a => {
                const href = a.getAttribute('href') || '';
                const label = clean(a.getAttribute('aria-label') || a.innerText || '');
                return `${href}|${label}`;
            })
            .sort()
            .join('||');
    }

    function getPpeResultsContainer() {
        const row = [...document.querySelectorAll('tr.sortable-table__row, tr')].find(el =>
            visible(el) && !!el.querySelector('a[href*="/app/equipment/PPE/pool/"]')
        );
        if (row) return row.closest('table')?.parentElement || row.closest('table') || row.parentElement;

        const search = getSearchInput();
        let el = search?.parentElement || null;
        for (let i = 0; el && i < 8; i++, el = el.parentElement) {
            if (el.querySelector?.('[data-testid="next-page-button"], table, .sortable-table__row')) return el;
        }
        return null;
    }

    function hasExplicitNoResults() {
        const root = getPpeResultsContainer();
        if (!root) return false;
        const text = uiText(root.innerText || '').toLowerCase();
        return [
            'no results',
            'no items found',
            'no equipment found',
            'no records found',
            'nothing found'
        ].some(needle => text.includes(needle));
    }

    function paginationHasMore() {
        const next = document.querySelector('[data-testid="next-page-button"]') ||
            [...document.querySelectorAll('a,button')].find(el =>
                visible(el) && uiEquals(el.getAttribute('aria-label') || '', 'Go to next page')
            );
        if (!next || !visible(next)) return false;
        const cls = String(next.className || '').toLowerCase();
        return !next.disabled &&
            next.getAttribute('aria-disabled') !== 'true' &&
            !cls.includes('disabled');
    }

    function extractAssetIdForPrefix(anchor, prefix) {
        const normalized = clean(prefix).toUpperCase();
        const pattern = new RegExp(`^${escapeRegex(normalized)}-[A-Z0-9]+(?:-[A-Z0-9]+)*$`, 'i');
        const candidates = [
            anchor.getAttribute('aria-label') || '',
            anchor.getAttribute('title') || '',
            anchor.innerText || ''
        ];
        for (const raw of candidates) {
            const candidate = clean(raw).toUpperCase();
            if (pattern.test(candidate)) return candidate;
        }
        return null;
    }

    function getVisiblePpeAnchors(root = document) {
        return [...root.querySelectorAll('a[href*="/app/equipment/PPE/pool/"]')].filter(visible);
    }

    function ppeAnchorLabel(anchor) {
        return clean(
            anchor?.getAttribute('aria-label') ||
            anchor?.getAttribute('title') ||
            anchor?.innerText || ''
        );
    }

    // Polling must tolerate transient duplicate DOM rows while Vector re-renders.
    // Identity conflicts are collected during polling and enforced only after the
    // result set has stabilized.
    function scanVisibleItems(prefix) {
        const out = [];
        const seenByPageItem = new Map();
        const seenByAssetId = new Map();
        const issues = [];
        const unparsedAnchors = [];

        const root = getPpeResultsContainer() || document;
        const anchors = getVisiblePpeAnchors(root);

        for (const a of anchors) {
            let href;
            try {
                href = new URL(a.getAttribute('href'), location.origin).href;
            } catch {
                continue;
            }

            const m = href.match(/\/app\/equipment\/PPE\/pool\/(\d+)\/(\d+)\/item/i);
            if (!m) continue;

            const id = extractAssetIdForPrefix(a, prefix);
            if (!id) {
                unparsedAnchors.push({ href, label: ppeAnchorLabel(a) });
                continue;
            }

            const pageKey = `${m[1]}:${m[2]}`;
            const oldForPage = seenByPageItem.get(pageKey);
            if (oldForPage && oldForPage !== id) {
                issues.push(`${prefix}: one PPE page link resolved to two asset IDs (${oldForPage}, ${id}).`);
                continue;
            }
            seenByPageItem.set(pageKey, id);

            const oldPageForAsset = seenByAssetId.get(id);
            if (oldPageForAsset && oldPageForAsset !== pageKey) {
                issues.push(`${prefix}: asset ${id} appeared with multiple Vector item IDs (${oldPageForAsset}, ${pageKey}).`);
                continue;
            }
            if (oldPageForAsset === pageKey) continue;
            seenByAssetId.set(id, pageKey);

            out.push({
                assetId: id,
                pool: m[1],
                itemId: m[2],
                url: href,
                type: getPoolType(m[1])
            });
        }

        return {
            items: out.sort((a, b) => a.assetId.localeCompare(b.assetId)),
            issues: [...new Set(issues)],
            unparsedAnchors,
            visibleAnchorCount: anchors.length
        };
    }

    async function searchPrefix(prefix) {
        const normalized = clean(prefix).toUpperCase();
        const search = getSearchInput();
        if (!search) {
            throw new Error('Open the Equipment → PPE table/list page first. The gear search field was not found.');
        }

        const beforeSignature = visibleAssetLinksSignature();
        nativeSetInput(search, normalized);

        const start = Date.now();
        let lastSignature = null;
        let stablePolls = 0;
        let lastScan = { items: [], issues: [], unparsedAnchors: [], visibleAnchorCount: 0 };

        while (Date.now() - start < 12000) {
            await sleep(250);

            if (clean(search.value).toUpperCase() !== normalized) continue;

            const scan = scanVisibleItems(normalized);
            const items = scan.items;
            const allLinksSignature = visibleAssetLinksSignature();
            const combined = `${allLinksSignature}::MATCHES::${items.map(x => `${x.assetId}:${x.pool}:${x.itemId}`).join('|')}::ISSUES::${scan.issues.join('|')}`;

            if (combined === lastSignature) {
                stablePolls += 1;
            } else {
                lastSignature = combined;
                stablePolls = 0;
            }

            lastScan = scan;
            const elapsed = Date.now() - start;
            const explicitNone = hasExplicitNoResults();
            const changedFromBefore = allLinksSignature !== beforeSignature;
            const positiveSignal = items.length > 0 || explicitNone || changedFromBefore;
            const enoughTime = items.length
                ? elapsed >= 1400
                : explicitNone
                    ? elapsed >= 1000
                    : elapsed >= 3000;

            if (enoughTime && stablePolls >= 4 && positiveSignal) {
                if (paginationHasMore()) {
                    throw new Error(
                        `${normalized}: Vector returned more than one PPE result page. ` +
                        'The helper will not guess at an incomplete gear list. Increase items per page or report this layout so pagination can be mapped.'
                    );
                }

                if (scan.issues.length) {
                    throw new Error(`${scan.issues[0]} Discovery stopped after the result set stabilized.`);
                }

                // A real empty result requires Vector's explicit empty-state signal.
                // Visible PPE links that cannot be parsed are an unknown layout, not 0 gear.
                if (!items.length && !explicitNone && scan.visibleAnchorCount > 0) {
                    const sample = scan.unparsedAnchors[0];
                    throw new Error(
                        `${normalized}: Vector returned ${scan.visibleAnchorCount} visible PPE link(s), but none could be verified as ${normalized}- asset IDs. ` +
                        `First unparsed label: "${sample?.label || '(blank)'}". Discovery stopped rather than treating this as 0 PPE.`
                    );
                }

                return {
                    items,
                    elapsedMs: elapsed,
                    explicitNoResults: explicitNone,
                    visibleAssetLinkCount: scan.visibleAnchorCount
                };
            }
        }

        throw new Error(
            `${normalized}: Vector PPE search results did not produce a verified result/empty-state signal and stabilize within 12 seconds. ` +
            `Last matching item count: ${lastScan.items.length}.`
        );
    }

    async function discoverOwnerGear(prefix, modeKey) {
        const searchResult = await searchPrefix(prefix);
        const items = searchResult.items || [];
        const mode = getMode(modeKey);

        const unknown = items.filter(item => !mode?.templates?.[item.pool] || getPoolType(item.pool) === 'UNKNOWN');
        const mapped = items
            .filter(item => !unknown.some(u => u.pool === item.pool && u.itemId === item.itemId))
            .map(item => ({
                ...item,
                template: mode.templates[item.pool]
            }));

        return {
            items: mapped,
            unknown,
            searchMeta: searchResult
        };
    }

    function getGearSnapshots() {
        const snapshots = loadJSON(GEAR_SNAPSHOTS_KEY, {});
        return snapshots && typeof snapshots === 'object' && !Array.isArray(snapshots) ? snapshots : {};
    }

    function compareGearSnapshot(prefix, currentItems) {
        const snapshots = getGearSnapshots();
        const previous = snapshots[clean(prefix).toUpperCase()] || null;
        const current = (currentItems || []).map(item => ({
            assetId: item.assetId,
            pool: item.pool,
            itemId: item.itemId,
            type: item.type
        }));

        if (!previous || !Array.isArray(previous.items)) {
            return {
                hasBaseline: false,
                changed: false,
                added: [],
                missing: [],
                moved: [],
                replacements: []
            };
        }

        const previousById = new Map(previous.items.map(x => [x.assetId, x]));
        const currentById = new Map(current.map(x => [x.assetId, x]));

        const moved = [];
        for (const [assetId, cur] of currentById.entries()) {
            const old = previousById.get(assetId);
            if (old && (String(old.pool) !== String(cur.pool) || String(old.itemId) !== String(cur.itemId))) {
                moved.push({ assetId, old, current: cur });
            }
        }
        const movedIds = new Set(moved.map(x => x.assetId));
        const added = current.filter(x => !previousById.has(x.assetId) && !movedIds.has(x.assetId));
        const missing = previous.items.filter(x => !currentById.has(x.assetId) && !movedIds.has(x.assetId));
        const replacements = [];

        const addedByPool = {};
        const missingByPool = {};
        for (const x of added) (addedByPool[x.pool] ||= []).push(x);
        for (const x of missing) (missingByPool[x.pool] ||= []).push(x);

        // Only call something a possible replacement when the pairing is unambiguous.
        for (const pool of new Set([...Object.keys(addedByPool), ...Object.keys(missingByPool)])) {
            const a = addedByPool[pool] || [];
            const m = missingByPool[pool] || [];
            if (a.length === 1 && m.length === 1) {
                replacements.push({
                    type: a[0].type || m[0].type || getPoolType(pool),
                    oldAssetId: m[0].assetId,
                    newAssetId: a[0].assetId
                });
            }
        }

        return {
            hasBaseline: true,
            changed: !!(added.length || missing.length || moved.length),
            added,
            missing,
            moved,
            replacements,
            previousAt: previous.updatedAt || null
        };
    }

    function commitGearSnapshotsFromRun(run) {
        const snapshots = getGearSnapshots();
        for (const snap of run.discoverySnapshots || []) {
            // A zero-result person does not overwrite a previously known gear baseline.
            if (!Array.isArray(snap.items) || !snap.items.length) continue;
            snapshots[clean(snap.prefix).toUpperCase()] = {
                ownerName: snap.ownerName || '',
                updatedAt: new Date().toISOString(),
                items: snap.items.map(item => ({
                    assetId: item.assetId,
                    pool: item.pool,
                    itemId: item.itemId,
                    type: item.type
                }))
            };
        }
        saveJSON(GEAR_SNAPSHOTS_KEY, snapshots);
    }

    // ============================================================
    // VECTOR PAGE / INSPECTION DETECTION
    // ============================================================

    function currentInspection() {
        const m = location.pathname.match(
            /\/equipment\/inspection\/(\d+)\/inspection-instance\/(\d+)/
        );
        return m ? { template: m[1], instance: m[2] } : null;
    }

    function inspectionFromUrl(url) {
        try {
            const pathname = new URL(url, location.origin).pathname;
            const m = pathname.match(/\/equipment\/inspection\/(\d+)\/inspection-instance\/(\d+)/);
            return m ? { template: m[1], instance: m[2] } : null;
        } catch {
            return null;
        }
    }

    function isAssetPageFor(item) {
        const m = location.pathname.match(/\/PPE\/pool\/(\d+)\/(\d+)\/item\/?$/i);
        return !!m && m[1] === item.pool && m[2] === item.itemId;
    }

    let identityElementCache = { key: '', element: null };

    function findAssetIdentityElement(item) {
        if (!item || !isAssetPageFor(item)) return null;
        const expected = clean(item.assetId).toUpperCase();
        if (!expected) return null;

        const cacheKey = `${location.href}::${expected}`;
        if (
            identityElementCache.key === cacheKey &&
            identityElementCache.element?.isConnected &&
            visible(identityElementCache.element)
        ) {
            return identityElementCache.element;
        }

        // Standalone-token match: accept labels such as "Bunker Coat: ID" or
        // "ID — Bunker Coat", but do not let ID match the prefix of ID-SUFFIX.
        const tokenPattern = new RegExp(`(?:^|[^A-Z0-9-])${escapeRegex(expected)}(?:$|[^A-Z0-9-])`, 'i');
        const primarySelectors = [
            'h1','h2','h3','h4','h5','h6',
            '[data-testid*="title"]','[data-testid*="header"]','[data-testid*="asset"]',
            '[class*="title"]','[class*="header"]','[class*="asset-name"]','[class*="equipment-name"]'
        ].join(',');

        const scan = selectors => [...document.querySelectorAll(selectors)]
            .filter(visible)
            .filter(el => !el.closest(`#${PANEL_ID}, #${OVERLAY_ID}, table, [role="table"], [role="grid"]`))
            .map(el => ({ el, text: uiText(el.textContent || '') }))
            .filter(x => x.text.length > 0 && x.text.length <= 220 && tokenPattern.test(x.text.toUpperCase()))
            .sort((a, b) => a.text.length - b.text.length);

        let candidates = scan(primarySelectors);
        // Compatibility fallback for a Vector markup change. This runs only if
        // targeted heading/title selectors failed, and the result is then cached.
        if (!candidates.length) candidates = scan('div,span,strong,b');

        const found = candidates[0]?.el || null;
        identityElementCache = { key: cacheKey, element: found };
        return found;
    }

    function assetPageContainsExpectedId(item) {
        return !!findAssetIdentityElement(item);
    }

    async function verifyExpectedAssetPage(item) {
        if (!isAssetPageFor(item)) return false;
        try {
            await waitFor(() => findAssetIdentityElement(item), 10000, 150);
            return true;
        } catch {
            return false;
        }
    }

    function isCompletedInspectionView(modeTitle) {
        if (!currentInspection()) return false;
        const body = document.body.innerText || '';
        const submitVisible = !!exactButton('Submit Inspection');
        return (
            !submitVisible &&
            uiIncludes(body, modeTitle) &&
            (
                // Known-brittle Vector locale/date text fallback. The explicit
                // Back-to-History signal below is preferred when available.
                /Complete on [A-Za-z]+ \d{1,2}, \d{4}/i.test(uiText(body)) ||
                uiIncludes(body, 'Back to Equipment Inspection History')
            )
        );
    }

    function isLiveInspectionPage(modeTitle) {
        if (!currentInspection() || isCompletedInspectionView(modeTitle)) return false;
        const body = document.body.innerText || '';
        return (
            uiIncludes(body, modeTitle) &&
            !!exactButton('Submit Inspection') &&
            exactButtons('Passed').length > 0 &&
            exactButtons('Failed').length > 0
        );
    }

    function historyContainerHeaderText(container) {
        const cells = [...container.querySelectorAll('th,[role="columnheader"]')]
            .map(el => el.textContent || '')
            .join(' ');
        return uiText(cells).toUpperCase();
    }

    function findItemLogHistoryTable() {
        const candidates = [...document.querySelectorAll('table,[role="table"],[role="grid"]')]
            .filter(visible)
            .filter(el => !el.closest(`#${PANEL_ID}, #${OVERLAY_ID}`));

        return candidates.find(container => {
            const headerText = historyContainerHeaderText(container);
            const hasDate = headerText.includes('DATE');
            const hasPerson = (
                headerText.includes('PERSONNEL') ||
                headerText.includes('RESPONSIBLE PARTY') ||
                headerText.includes('USER')
            );
            const hasHistoryShape = (
                headerText.includes('TYPE') ||
                headerText.includes('NOTES') ||
                headerText.includes('LOCATION TYPE') ||
                headerText.includes('INSPECTION')
            );
            return hasDate && hasPerson && hasHistoryShape;
        }) || null;
    }

    function historyRows(container = findItemLogHistoryTable()) {
        if (!container) return [];
        const rows = container.matches('table')
            ? [...container.querySelectorAll('tbody tr')]
            : [...container.querySelectorAll('[role="row"]')].filter(row => !row.querySelector('[role="columnheader"]'));
        return rows.filter(visible);
    }


    function findItemLogTabControl() {
        const candidates = [...document.querySelectorAll(
            'button,a,[role="tab"],[role="button"],li,div,span'
        )]
            .filter(visible)
            .filter(el => !el.closest(`#${PANEL_ID}, #${OVERLAY_ID}`))
            .filter(el => uiEquals(el.textContent || '', 'ITEM LOG'));

        if (!candidates.length) return null;

        const directlyClickable = candidates.filter(el => {
            const tag = el.tagName.toLowerCase();
            const role = el.getAttribute('role');
            return (
                tag === 'button' ||
                tag === 'a' ||
                role === 'tab' ||
                role === 'button' ||
                typeof el.onclick === 'function' ||
                el.tabIndex >= 0 ||
                getComputedStyle(el).cursor === 'pointer'
            );
        });

        const pool = directlyClickable.length ? directlyClickable : candidates;
        pool.sort((a, b) => {
            const ar = a.getBoundingClientRect();
            const br = b.getBoundingClientRect();
            return (ar.width * ar.height) - (br.width * br.height);
        });
        return pool[0];
    }

    function itemLogTabLooksActive(control) {
        if (!control) return false;
        if (control.getAttribute('aria-selected') === 'true') return true;
        if (control.getAttribute('aria-current') === 'page') return true;
        const classes = `${control.className || ''} ${control.parentElement?.className || ''}`.toLowerCase();
        if (/\b(active|selected|current)\b/.test(classes)) return true;

        // In the observed Vector layout the active tab has the visible underline.
        const style = getComputedStyle(control);
        const parentStyle = control.parentElement ? getComputedStyle(control.parentElement) : null;
        const border = `${style.borderBottomWidth} ${style.borderBottomStyle} ${parentStyle?.borderBottomWidth || ''} ${parentStyle?.borderBottomStyle || ''}`;
        return /[1-9]\d*px/.test(border) && !/\bnone\b/.test(border);
    }

    async function ensureItemLogTabActive(timeoutMs = 5000) {
        const start = Date.now();

        while (Date.now() - start < timeoutMs) {
            if (findItemLogHistoryTable()) return true;

            const tab = findItemLogTabControl();
            if (tab) {
                if (!itemLogTabLooksActive(tab)) {
                    tab.click();
                    await sleep(350);
                }

                const settleStart = Date.now();
                while (Date.now() - settleStart < 2500) {
                    if (findItemLogHistoryTable()) return true;
                    await sleep(150);
                }
            }

            await sleep(200);
        }

        return !!findItemLogHistoryTable();
    }


    function historyDateTokenPresent(text) {
        return /\b\d{1,2}[\/-]\d{1,2}[\/-]\d{4}\b/.test(clean(text));
    }

    function textLooksLikeCompletedInspectionEntry(text, modeTitle = '') {
        const normalized = uiText(text || '');
        if (!normalized || normalized.length < 12 || normalized.length > 1200) return false;
        if (!/\bCOMPLETED?\b/i.test(normalized) || /\bINCOMPLETE\b/i.test(normalized)) return false;
        if (!historyDateTokenPresent(normalized)) return false;
        if (modeTitle && !uiIncludes(normalized, modeTitle)) return false;
        return true;
    }

    function findHistorySectionAnchor() {
        const exactish = [...document.querySelectorAll(
            'h1,h2,h3,h4,h5,h6,[role="heading"],button,div,span,strong,b'
        )]
            .filter(visible)
            .filter(el => !el.closest(`#${PANEL_ID}, #${OVERLAY_ID}`))
            .map(el => ({ el, text: uiText(el.textContent || '') }))
            .filter(x =>
                x.text &&
                x.text.length <= 100 &&
                /\b(?:inspection\s+history|equipment\s+inspection\s+history|item\s+log|history)\b/i.test(x.text)
            )
            .sort((a, b) => a.text.length - b.text.length);

        if (exactish.length) return exactish[0].el;

        const completed = [...document.querySelectorAll('div,li,article,p')]
            .filter(visible)
            .filter(el => !el.closest(`#${PANEL_ID}, #${OVERLAY_ID}`))
            .find(el => textLooksLikeCompletedInspectionEntry(el.textContent || ''));

        return completed || null;
    }

    function textHistoryEntryElements(modeTitle) {
        const selectors = 'tr,[role="row"],li,article,p,div';
        const all = [...document.querySelectorAll(selectors)]
            .filter(visible)
            .filter(el => !el.closest(`#${PANEL_ID}, #${OVERLAY_ID}`))
            .filter(el => !el.closest('table,[role="table"],[role="grid"]'))
            .map(el => ({ el, text: uiText(el.textContent || '') }))
            .filter(x => textLooksLikeCompletedInspectionEntry(x.text, modeTitle));

        // Keep the smallest / leaf-most matching DOM container. Critically,
        // preserve multiple elements even when their visible text is identical.
        // Vector can legitimately create several same-day COMPLETE rows whose
        // text is byte-identical.
        const leaf = all.filter(candidate => {
            return !all.some(other =>
                other.el !== candidate.el &&
                candidate.el.contains(other.el) &&
                other.text.length <= candidate.text.length
            );
        });

        const seenElements = new Set();
        const result = [];
        for (const entry of leaf) {
            if (seenElements.has(entry.el)) continue;
            seenElements.add(entry.el);
            result.push(entry);
        }
        return result;
    }

    function rowLooksLikeCompletedModeEntry(row, modeTitle) {
        const text = uiText(row?.textContent || '');
        return !!(
            text &&
            uiIncludes(text, modeTitle) &&
            /\bCOMPLETED?\b/i.test(text) &&
            !/\bINCOMPLETE\b/i.test(text)
        );
    }

    function itemLogCompletedRowElements(item, modeTitle) {
        if (!isAssetPageFor(item) || !assetPageContainsExpectedId(item)) return null;

        const container = findItemLogHistoryTable();
        if (container) {
            // Semantic table / grid path. One DOM row = one real history record;
            // never collapse rows by text.
            return historyRows(container).filter(row => rowLooksLikeCompletedModeEntry(row, modeTitle));
        }

        // Non-semantic fallback used by some Vector layouts.
        const fallback = textHistoryEntryElements(modeTitle);
        if (fallback.length) return fallback.map(entry => entry.el);

        // Distinguish "readable but zero rows" from "history region unavailable".
        if (findHistorySectionAnchor()) return [];
        return null;
    }

    function modeHistoryEntries(item, modeTitle) {
        const rows = itemLogCompletedRowElements(item, modeTitle);
        if (rows === null) return [];

        return rows.map(row => ({
            element: row,
            text: uiText(row.textContent || ''),
            source: row.closest('table,[role="table"],[role="grid"]') ? 'table' : 'text'
        })).filter(entry => entry.text);
    }

    function modeHistoryEntryTexts(item, modeTitle) {
        return modeHistoryEntries(item, modeTitle).map(entry => uiText(entry.text));
    }

    function looksLikeStableRecordId(value) {
        const raw = clean(value);
        if (!raw) return false;
        if (/^(?:row|tr|item|cell|record)[-_]?\d{1,3}$/i.test(raw)) return false;
        if (/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(raw)) return true;
        if (/\d{4,}/.test(raw)) return true;
        return raw.length >= 16 && /[A-Za-z]/.test(raw) && /\d/.test(raw);
    }

    function itemLogStableRowId(row) {
        if (!row) return '';

        for (const attr of [
            'data-row-key',
            'data-row-id',
            'data-rowid',
            'data-record-id',
            'data-id',
            'data-testid',
            'id'
        ]) {
            const value = row.getAttribute?.(attr);
            if (looksLikeStableRecordId(value)) return `${attr}:${clean(value)}`;
        }

        for (const link of row.querySelectorAll?.('a[href]') || []) {
            const href = link.getAttribute('href') || '';
            const instance = href.match(/inspection-instance[-/](\d{4,})/i);
            if (instance) return `href-instance:${instance[1]}`;
            const tail = href.match(/\/(\d{4,})(?:[/?#]|$)/);
            if (tail) return `href-record:${tail[1]}`;
        }

        return '';
    }

    function itemLogRowKeys(rows) {
        const occurrences = new Map();
        const records = [];

        for (const row of rows || []) {
            const text = uiText(row.textContent || '');
            const stableId = itemLogStableRowId(row);

            if (stableId) {
                records.push({
                    element: row,
                    text,
                    key: `id:${stableId}`,
                    stableId: true
                });
                continue;
            }

            const base = text || '(empty-row)';
            const hash = diagnosticTextHash(base);
            const next = (occurrences.get(base) || 0) + 1;
            occurrences.set(base, next);
            records.push({
                element: row,
                text,
                key: `txt:${hash}#${next}`,
                stableId: false
            });
        }

        return records;
    }

    function readItemLogSnapshot(item, modeTitle) {
        const rows = itemLogCompletedRowElements(item, modeTitle);
        if (rows === null) return null;

        const records = itemLogRowKeys(rows);
        const keys = records.map(record => record.key);
        const texts = records.map(record => record.text);
        return {
            count: records.length,
            keys,
            texts,
            records,
            usesStableIds: records.length > 0 && records.every(record => record.stableId),
            fingerprint: diagnosticTextHash(JSON.stringify(keys))
        };
    }

    function itemLogSnapshotAddedKeys(beforeKeys, afterKeys) {
        const remaining = new Map();
        for (const key of beforeKeys || []) {
            remaining.set(key, (remaining.get(key) || 0) + 1);
        }

        const added = [];
        for (const key of afterKeys || []) {
            const count = remaining.get(key) || 0;
            if (count > 0) {
                remaining.set(key, count - 1);
            } else {
                added.push(key);
            }
        }
        return added;
    }

    function itemLogSnapshotAddedRecords(beforeKeys, snapshot) {
        const addedKeys = itemLogSnapshotAddedKeys(beforeKeys, snapshot?.keys || []);
        const wanted = new Map();
        for (const key of addedKeys) wanted.set(key, (wanted.get(key) || 0) + 1);

        const records = [];
        for (const record of snapshot?.records || []) {
            const count = wanted.get(record.key) || 0;
            if (count <= 0) continue;
            records.push(record);
            wanted.set(record.key, count - 1);
        }
        return { addedKeys, records };
    }

    async function waitForItemLogSnapshotSettled(
        item,
        modeTitle,
        timeout = ITEM_LOG_SETTLE_TIMEOUT_MS,
        requiredStablePolls = ITEM_LOG_SETTLE_STABLE_POLLS
    ) {
        try { await ensureItemLogTabActive(Math.min(5000, timeout)); } catch {}

        const start = Date.now();
        let lastFingerprint = null;
        let stablePolls = 0;
        let latest = null;

        while (Date.now() - start < timeout) {
            const snapshot = readItemLogSnapshot(item, modeTitle);
            if (!snapshot) {
                latest = null;
                lastFingerprint = null;
                stablePolls = 0;
                await sleep(200);
                continue;
            }

            latest = snapshot;
            if (snapshot.fingerprint === lastFingerprint) {
                stablePolls += 1;
            } else {
                lastFingerprint = snapshot.fingerprint;
                stablePolls = 1;
            }

            if (stablePolls >= requiredStablePolls) {
                return { ...snapshot, stablePolls };
            }
            await sleep(200);
        }

        return null;
    }

    async function revealAssetHistory(item, modeTitle, settleMs = 700) {
        if (!isAssetPageFor(item)) return false;

        // The actual Vector PPE history lives under the ITEM LOG tab.
        await ensureItemLogTabActive(5000);

        let anchor = findItemLogHistoryTable() || findHistorySectionAnchor();
        if (!anchor) {
            const entries = modeHistoryEntries(item, modeTitle);
            anchor = entries[0]?.element || null;
        }

        if (anchor) {
            await bringIntoView(anchor, settleMs);
            return true;
        }

        // Some Vector history content appears only after the lower part of the
        // asset page is reached. Scroll near the bottom once, then let rendering settle.
        window.scrollTo({
            top: Math.max(0, document.documentElement.scrollHeight - window.innerHeight),
            behavior: 'smooth'
        });
        await sleep(settleMs);

        await ensureItemLogTabActive(3500);
        anchor = findItemLogHistoryTable() || findHistorySectionAnchor();
        if (anchor) {
            await bringIntoView(anchor, 350);
            return true;
        }
        return false;
    }

    function rowHasCompletedStatus(row) {
        const status = uiText(row?.textContent || '').toUpperCase();
        return /\bCOMPLETED?\b/.test(status) && !/\bINCOMPLETE\b/.test(status);
    }

    function getModeHistoryRows(item, modeTitle) {
        if (!isAssetPageFor(item) || !assetPageContainsExpectedId(item)) return [];
        const container = findItemLogHistoryTable();
        if (!container) return [];

        return historyRows(container).filter(row => {
            const text = uiText(row.textContent || '');
            if (!uiIncludes(text, modeTitle)) return false;
            return rowHasCompletedStatus(row);
        });
    }

    function assetHistoryRegionReady(item) {
        if (!(isAssetPageFor(item) && assetPageContainsExpectedId(item))) return false;
        return !!(
            findItemLogHistoryTable() ||
            findHistorySectionAnchor() ||
            textHistoryEntryElements('').length
        );
    }

    function countModeCompletesOnAssetPage(item, modeTitle) {
        const snapshot = readItemLogSnapshot(item, modeTitle);
        return snapshot ? snapshot.count : null;
    }

    async function waitForStableHistoryBaseline(item, modeTitle, timeout = ITEM_LOG_SETTLE_TIMEOUT_MS) {
        const snapshot = await waitForItemLogSnapshotSettled(
            item,
            modeTitle,
            timeout,
            ITEM_LOG_SETTLE_STABLE_POLLS
        );
        if (!snapshot) {
            throw new Error(`${item.assetId}: inspection history did not become readable and stable; baseline was not guessed.`);
        }
        return snapshot;
    }

    function parseVectorHistoryDate(text) {
        const raw = clean(text);
        if (!raw) return null;
        const m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?)?/i);
        if (m) {
            let hour = Number(m[4] || 0);
            const minute = Number(m[5] || 0);
            const second = Number(m[6] || 0);
            const ap = (m[7] || '').toUpperCase();
            if (ap === 'PM' && hour < 12) hour += 12;
            if (ap === 'AM' && hour === 12) hour = 0;
            const d = new Date(Number(m[3]), Number(m[1]) - 1, Number(m[2]), hour, minute, second);
            return Number.isFinite(d.getTime()) ? d.getTime() : null;
        }
        const parsed = Date.parse(raw);
        return Number.isFinite(parsed) ? parsed : null;
    }

    function historyRowAudit(row, index) {
        const cells = [...row.querySelectorAll('td,[role="cell"],[role="gridcell"]')]
            .map(td => clean(td.textContent))
            .filter(Boolean);
        const firstCell = cells[0] || '';
        return {
            row,
            index,
            text: uiText(row.textContent || ''),
            firstCell,
            cells,
            parsedAt: parseVectorHistoryDate(firstCell)
        };
    }

    function historySortDirection() {
        const audits = historyRows().map(historyRowAudit).filter(x => Number.isFinite(x.parsedAt));
        if (audits.length < 2) return 'unknown';
        const first = audits[0].parsedAt;
        const last = audits[audits.length - 1].parsedAt;
        if (first > last) return 'descending';
        if (first < last) return 'ascending';
        return 'unknown';
    }

    function newestModeHistoryAudit(item, modeTitle) {
        const audits = getModeHistoryRows(item, modeTitle)
            .map(historyRowAudit)
            .filter(x => Number.isFinite(x.parsedAt));
        if (!audits.length) return null;

        const max = Math.max(...audits.map(x => x.parsedAt));
        const newestDateRows = audits.filter(x => x.parsedAt === max);
        let chosen = null;
        if (newestDateRows.length === 1) {
            chosen = newestDateRows[0];
        } else {
            const direction = historySortDirection();
            if (direction === 'descending') chosen = newestDateRows.reduce((a, b) => a.index < b.index ? a : b);
            else if (direction === 'ascending') chosen = newestDateRows.reduce((a, b) => a.index > b.index ? a : b);
            else return null; // ambiguous same-date rows: fail closed rather than guess
        }

        return {
            text: chosen.text,
            firstCell: chosen.firstCell,
            cells: chosen.cells,
            parsedAt: chosen.parsedAt,
            sortDirection: historySortDirection()
        };
    }

    // ============================================================
    // INSPECTION CHOOSER
    // ============================================================

    function findChooserRoot() {
        const titles = [...document.querySelectorAll('h1,h2,h3,h4,div,span')].filter(
            el => visible(el) && clean(el.innerText) === 'Select Inspection...'
        );

        const roots = [];
        for (const title of titles) {
            let el = title;
            for (let i = 0; el && i < 8; i++, el = el.parentElement) {
                if (!visible(el)) continue;
                const text = clean(el.innerText);
                if (exactButton('Cancel', el) && text.includes('CHECKLIST')) {
                    roots.push(el);
                    break;
                }
            }
        }

        if (!roots.length) return null;
        roots.sort((a, b) => {
            const ar = a.getBoundingClientRect();
            const br = b.getBoundingClientRect();
            return ar.width * ar.height - br.width * br.height;
        });
        return roots[0];
    }

    function findInspectionCardInChooser(modeTitle) {
        const root = findChooserRoot();
        if (!root) return null;

        const target = uiText(modeTitle).toLowerCase();
        const matches = [...root.querySelectorAll('button,a,[role="button"],li,div')].filter(el => {
            if (!visible(el)) return false;
            const t = uiText(el.innerText).toLowerCase();
            return (
                t === target ||
                t === `${target} checklist` ||
                (t.startsWith(target) && t.includes('checklist') && t.length <= target.length + 24)
            );
        });
        if (!matches.length) return null;

        const clickable = matches.filter(el => {
            const tag = el.tagName.toLowerCase();
            const role = el.getAttribute('role');
            const cursor = getComputedStyle(el).cursor;
            return tag === 'button' || tag === 'a' || role === 'button' || !!el.onclick || el.tabIndex >= 0 || cursor === 'pointer';
        });

        const pool = clickable.length ? clickable : matches;
        pool.sort((a, b) => {
            const ar = a.getBoundingClientRect();
            const br = b.getBoundingClientRect();
            const score = r => {
                const cardish = (r.width >= 250 && r.height >= 35 && r.height <= 150) ? 0 : 1000000;
                return cardish + Math.abs(r.height - 70) * 100 + Math.abs(r.width - 450);
            };
            return score(ar) - score(br);
        });

        return pool[0];
    }

    // ============================================================
    // FORM FILLING
    // ============================================================

    function setTextareaValue(textarea, value) {
        const old = textarea.value;
        const setter = Object.getOwnPropertyDescriptor(
            HTMLTextAreaElement.prototype,
            'value'
        )?.set;
        if (!setter) throw new Error('Could not write to textarea.');

        textarea.focus();
        setter.call(textarea, value);
        if (textarea._valueTracker) textarea._valueTracker.setValue(old);
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        textarea.dispatchEvent(new Event('change', { bubbles: true }));
    }

    async function enterTourCoatComment() {
        const config = getConfig();
        const value = clean(config.tourCoatComment);
        if (!value) {
            throw new Error('Tour Bunker Coat requires a configured assignment comment. Open Settings and set the Tour coat comment.');
        }

        const textarea = [...document.querySelectorAll('textarea')].find(visible);
        if (!textarea) throw new Error('Required Tour Bunker Coat comment field was not found.');
        setTextareaValue(textarea, value);
        await sleep(500);
        if (clean(textarea.value) !== value) throw new Error('Tour Bunker Coat comment did not stick.');
        textarea.blur();
    }

    async function fillLiveForm(run, item) {
        const mode = getMode(run.modeKey);
        const current = currentInspection();
        if (!current || current.template !== item.template) {
            throw new Error(`${item.assetId}: expected template ${item.template}, Vector opened ${current?.template || 'unknown'}.`);
        }

        const pass = exactButtons('Passed');
        const fail = exactButtons('Failed');
        if (pass.length !== 2 || fail.length !== 2) {
            throw new Error(`${item.assetId}: expected exactly 2 Passed and 2 Failed buttons. Found ${pass.length} Passed and ${fail.length} Failed.`);
        }

        // Only Tour Bunker Coat has the special assignment comment / Done step.
        const tourCoat = run.modeKey === 'tour' && item.pool === '300045';
        if (tourCoat) {
            await enterTourCoatComment();
            const done = enabledButton('Done');
            if (!done) throw new Error(`${item.assetId}: required Done button was not found.`);
            done.click();
            await sleep(600);
        } else {
            const unexpectedTextarea = [...document.querySelectorAll('textarea')].find(visible);
            if (unexpectedTextarea) {
                throw new Error(`${item.assetId}: unexpected comment field appeared on ${mode.short}.`);
            }
            if (enabledButton('Done')) {
                throw new Error(`${item.assetId}: unexpected Done button appeared on ${mode.short}.`);
            }
        }

        const q1 = item.q1 === 'fail' ? fail[0] : pass[0];
        const q2 = item.q2 === 'fail' ? fail[1] : pass[1];
        if (!q1 || !q2) throw new Error(`${item.assetId}: response buttons could not be resolved.`);

        q1.click();
        await sleep(350);
        q2.click();
        await sleep(350);
    }

    // ============================================================
    // FAILURE DETAILS
    // ============================================================

    function findFailureModalRoot(assetId) {
        const titles = [...document.querySelectorAll('h1,h2,h3,h4,div,span')].filter(
            el => visible(el) && clean(el.innerText) === 'FAILURE DETAILS'
        );

        const roots = [];
        for (const title of titles) {
            let el = title;
            for (let i = 0; el && i < 8; i++, el = el.parentElement) {
                if (!visible(el)) continue;
                const text = clean(el.innerText);
                if (
                    text.includes('SELECT FAILING ITEMS') &&
                    text.includes('Failure Notes') &&
                    text.includes(assetId) &&
                    exactButton('Submit Inspection', el)
                ) {
                    roots.push(el);
                    break;
                }
            }
        }

        if (!roots.length) return null;
        roots.sort((a, b) => {
            const ar = a.getBoundingClientRect();
            const br = b.getBoundingClientRect();
            return ar.width * ar.height - br.width * br.height;
        });
        return roots[0];
    }

    async function submitFailureModal(run, item, modal) {
        const textareas = [...modal.querySelectorAll('textarea')].filter(visible);
        if (textareas.length !== 1) {
            stopRun(`${item.assetId}: expected exactly one Failure Notes field; found ${textareas.length}.`);
            return;
        }

        const note = clean(item.failureNote);
        if (!note) {
            stopRun(`${item.assetId}: Vector requested Failure Notes but no note was supplied in the preview.`);
            return;
        }

        setTextareaValue(textareas[0], note);
        await sleep(700);
        if (clean(textareas[0].value) !== note) {
            stopRun(`${item.assetId}: Failure Notes did not stick.`);
            return;
        }
        textareas[0].blur();
        await sleep(500);

        const modalSubmit = enabledButton('Submit Inspection', modal);
        if (!modalSubmit) {
            stopRun(`${item.assetId}: Failure Details Submit Inspection is not enabled.`);
            return;
        }

        run.phase = 'submitted';
        run.submittedAt = Date.now();
        run.inspectionUrl = location.href;
        run.inspectionItemKey = `${item.pool}:${item.itemId}`;
        run.postSubmitReturnFirstSeenAt = null;
        run.postSubmitReturnPageSessionId = null;
        saveRun(run);

        setStatus(`${run.index + 1}/${run.items.length} — submitting Failure Details for ${item.assetId} exactly once...`);
        modalSubmit.click();
        await waitForFinalCompletion(run);
    }

    // ============================================================
    // COMPLETION EVIDENCE
    // ============================================================

    function clearPostSubmitReturnCandidate(run) {
        if (!run) return;
        if (!run.postSubmitReturnFirstSeenAt && !run.postSubmitReturnPageSessionId) return;
        run.postSubmitReturnFirstSeenAt = null;
        run.postSubmitReturnPageSessionId = null;
        persistDiagnosticRunState(run);
    }

    function evaluatePostSubmitReturnCandidate(run, item) {
        // Live Vector behavior observed 2026-09-10: after a successful Submit,
        // Vector may navigate directly back to the exact PPE asset page.
        //
        // This remains weaker than a completed-instance view or a verified
        // history +1 row. To reduce render-race and delayed Failure Details risk,
        // the qualifying asset-page state must remain continuously true for at
        // least POST_SUBMIT_RETURN_DWELL_MS within THIS page session. Failed
        // inspections do not even start this dwell until
        // FAILED_RETURN_EVIDENCE_FLOOR_MS after the main Submit, giving Vector's
        // Failure Details modal first priority.
        //
        // This evaluator mutates only the dwell/fingerprint diagnostic state.
        // It never clicks Submit.
        if (!run || !item) return null;
        if (!['submitted', 'failed-main-submitted'].includes(run.phase)) {
            clearPostSubmitReturnCandidate(run);
            return null;
        }

        const submittedAt = Number(run.submittedAt);
        if (!Number.isFinite(submittedAt)) {
            clearPostSubmitReturnCandidate(run);
            return null;
        }
        const age = Date.now() - submittedAt;
        if (age < 0 || age > 120000) {
            clearPostSubmitReturnCandidate(run);
            return null;
        }

        const itemKey = `${item.pool}:${item.itemId}`;
        if (run.inspectionItemKey !== itemKey) {
            clearPostSubmitReturnCandidate(run);
            return null;
        }

        // Diagnostic capture happens as soon as the exact asset page is reachable
        // after Submit, even if the page never satisfies the weak completion guard.
        // This is observational only and is never itself completion evidence.
        if (isAssetPageFor(item) && !run.postSubmitAssetFingerprint) {
            capturePostSubmitFingerprintOnce(run, item);
            persistDiagnosticRunState(run);
        }

        // Also capture the first visibly settled/idle asset-page state. This is
        // the fingerprint that should be compared with the settled pre-submit
        // fingerprint during the field experiment. It is diagnostic only.
        if (
            isAssetPageFor(item) &&
            !!exactButton('Start Inspection') &&
            !run.postSubmitSettledFingerprint
        ) {
            capturePostSubmitSettledFingerprintOnce(run, item);
            persistDiagnosticRunState(run);
        }

        if (run.phase === 'failed-main-submitted' && age < FAILED_RETURN_EVIDENCE_FLOOR_MS) {
            clearPostSubmitReturnCandidate(run);
            return null;
        }

        if (run.historyFallbackEnabled === true && age < POST_SUBMIT_HISTORY_GRACE_MS) {
            clearPostSubmitReturnCandidate(run);
            return null;
        }

        const prior = inspectionFromUrl(run.inspectionUrl);
        const qualifies = !!(
            prior &&
            prior.template === item.template &&
            prior.instance &&
            isAssetPageFor(item) &&
            !currentInspection() &&
            !findChooserRoot() &&
            !exactButton('Submit Inspection') &&
            exactButtons('Passed').length === 0 &&
            exactButtons('Failed').length === 0 &&
            !!exactButton('Start Inspection')
        );

        if (!qualifies) {
            clearPostSubmitReturnCandidate(run);
            return null;
        }

        // A dwell candidate never survives a full page reload. A newly loaded
        // page must provide a fresh 1.5-second continuous observation window.
        if (
            !run.postSubmitReturnFirstSeenAt ||
            run.postSubmitReturnPageSessionId !== PAGE_SESSION_ID
        ) {
            run.postSubmitReturnFirstSeenAt = Date.now();
            run.postSubmitReturnPageSessionId = PAGE_SESSION_ID;
            persistDiagnosticRunState(run);
            return null;
        }

        const dwell = Date.now() - Number(run.postSubmitReturnFirstSeenAt);
        if (!Number.isFinite(dwell) || dwell < 0) {
            run.postSubmitReturnFirstSeenAt = Date.now();
            run.postSubmitReturnPageSessionId = PAGE_SESSION_ID;
            capturePostSubmitFingerprintOnce(run, item);
            persistDiagnosticRunState(run);
            return null;
        }
        if (dwell < POST_SUBMIT_RETURN_DWELL_MS) return null;

        saveDiagnostic(
            `${item.assetId}: post-submit return evidence satisfied after ${Math.round(dwell)} ms dwell.`,
            run
        );
        return `post-submit-return-to-exact-asset-instance-${prior.instance}-dwell-${Math.round(dwell)}ms`;
    }

    function completionEvidence(run, item) {
        const mode = getMode(run.modeKey);

        // Retained for compatibility with any Vector variant that exposes a
        // completed inspection-instance view.
        if (isCompletedInspectionView(mode.title)) {
            const expected = inspectionFromUrl(run.inspectionUrl);
            const current = currentInspection();
            if (
                expected &&
                current &&
                expected.template === current.template &&
                expected.instance === current.instance
            ) {
                return `completed-inspection-view-instance-${current.instance}`;
            }
        }

        // PRIMARY completion path for the observed Vector PPE workflow:
        // exact asset page + real Item Log multiplicity baseline + exactly one
        // newly completed row + inspector/mode match.
        if (
            run.historyFallbackEnabled === true &&
            isAssetPageFor(item) &&
            assetPageContainsExpectedId(item) &&
            clean(run.inspectorName)
        ) {
            const submittedAge = Number.isFinite(run.submittedAt)
                ? Date.now() - run.submittedAt
                : Infinity;
            const snapshot = readItemLogSnapshot(item, mode.title);

            if (submittedAge >= 0 && submittedAge <= 120000 && snapshot) {
                if (run.postSubmitHistoryFingerprint === snapshot.fingerprint) {
                    run.postSubmitHistoryStablePolls = Number(run.postSubmitHistoryStablePolls || 0) + 1;
                } else {
                    run.postSubmitHistoryFingerprint = snapshot.fingerprint;
                    run.postSubmitHistoryStablePolls = 1;
                }

                run.postSubmitHistoryKeys = snapshot.keys.slice();
                run.postSubmitHistoryEntries = snapshot.texts.slice();
                run.postSubmitUsesStableIds = snapshot.usesStableIds;
                run.postSubmitCompleteCount = snapshot.count;

                const stableReads = Number(run.postSubmitHistoryStablePolls || 0);
                const baselineCount = Number(run.baselineCompleteCount);
                const baselineKeys = Array.isArray(run.baselineHistoryKeys)
                    ? run.baselineHistoryKeys
                    : [];
                const { addedKeys, records: addedRecords } =
                    itemLogSnapshotAddedRecords(baselineKeys, snapshot);

                let result = 'waiting-for-stable-item-log';
                if (stableReads >= POST_SUBMIT_HISTORY_STABLE_POLLS) {
                    if (!Number.isInteger(baselineCount)) {
                        result = 'baseline-unavailable';
                    } else if (snapshot.count !== baselineCount + 1) {
                        result = 'count-not-exactly-plus-one';
                    } else if (addedKeys.length === 0) {
                        result = 'no-identifiable-new-row';
                    } else if (addedKeys.length !== 1 || addedRecords.length !== 1) {
                        result = 'multiple-new-rows';
                    } else {
                        const added = addedRecords[0];
                        const matchesInspector = uiIncludes(added.text, run.inspectorName);
                        const matchesMode = uiIncludes(added.text, mode.title);
                        const isComplete =
                            /\bCOMPLETED?\b/i.test(added.text) &&
                            !/\bINCOMPLETE\b/i.test(added.text);

                        if (matchesInspector && matchesMode && isComplete) {
                            result = 'confirmed';
                        } else {
                            result = 'added-row-did-not-match';
                        }
                    }
                }

                run.historyVerification = {
                    result,
                    at: new Date().toISOString(),
                    baselineCount: Number.isInteger(baselineCount) ? baselineCount : null,
                    postSubmitCount: snapshot.count,
                    stableReads,
                    baselineUsesStableIds: !!run.baselineUsesStableIds,
                    postSubmitUsesStableIds: !!snapshot.usesStableIds,
                    baselineHistoryKeys: baselineKeys.slice(),
                    postSubmitHistoryKeys: snapshot.keys.slice(),
                    addedKeys: addedKeys.slice()
                };
                persistDiagnosticRunState(run);

                if (result === 'confirmed') {
                    const keyHash = diagnosticTextHash(addedKeys[0] || '');
                    return `itemlog-confirmed-plus-one-${baselineCount}-to-${snapshot.count}-key-${keyHash}`;
                }
            }
        }

        // Weak safety fallback remains available only after the history grace
        // period. It never clicks Submit again.
        const returnEvidence = evaluatePostSubmitReturnCandidate(run, item);
        if (returnEvidence) return returnEvidence;

        return null;
    }
    async function advanceRun(run, evidence) {
        const item = run.items[run.index];
        run.completed ||= [];
        run.completed.push({
            assetId: item.assetId,
            ownerName: item.ownerName || run.ownerName || '',
            q1: item.q1,
            q2: item.q2,
            failureNote: item.failureNote || '',
            signatureLabel: run.signatureUsed || '',
            evidence,
            verificationDiagnostics: (
                String(evidence || '').startsWith('post-submit-return-') ||
                !!run.historyVerification ||
                run.historyFallbackEnabled === false ||
                (run.historyStructureCapture || []).length > 0 ||
                !!run.preSubmitAssetFingerprint ||
                !!run.postSubmitAssetFingerprint ||
                !!run.postSubmitSettledFingerprint
            ) ? {
                historyStructureCapture: run.historyStructureCapture || [],
                historyVerification: run.historyVerification || null,
                baselineCompleteCount: run.baselineCompleteCount,
                baselineHistoryEntries: run.baselineHistoryEntries || [],
                baselineHistoryKeys: run.baselineHistoryKeys || [],
                baselineUsesStableIds: !!run.baselineUsesStableIds,
                postSubmitCompleteCount: run.postSubmitCompleteCount,
                postSubmitHistoryEntries: run.postSubmitHistoryEntries || [],
                postSubmitHistoryKeys: run.postSubmitHistoryKeys || [],
                postSubmitUsesStableIds: !!run.postSubmitUsesStableIds,
                finalHistoryEntries: modeHistoryEntryTexts(item, getMode(run.modeKey).title),
                itemLogTableFound: !!findItemLogHistoryTable(),
                itemLogHeaders: findItemLogHistoryTable()
                    ? historyContainerHeaderText(findItemLogHistoryTable())
                    : '',
                preSubmitAssetFingerprint: run.preSubmitAssetFingerprint || null,
                postSubmitAssetFingerprint: run.postSubmitAssetFingerprint || null,
                postSubmitSettledFingerprint: run.postSubmitSettledFingerprint || null
            } : null,
            at: new Date().toISOString()
        });

        run.index += 1;
        run.phase = 'asset';
        run.inspectionUrl = null;
        run.inspectionItemKey = null;
        run.submittedAt = null;
        run.postSubmitReturnFirstSeenAt = null;
        run.postSubmitReturnPageSessionId = null;
        run.preSubmitAssetFingerprint = null;
        run.postSubmitAssetFingerprint = null;
        run.postSubmitSettledFingerprint = null;
        run.historyStructureCapture = [];
        run.baselineCompleteCount = null;
        run.baselineHistoryEntries = [];
        run.baselineHistoryKeys = [];
        run.baselineUsesStableIds = false;
        run.postSubmitCompleteCount = null;
        run.postSubmitHistoryEntries = [];
        run.postSubmitHistoryKeys = [];
        run.postSubmitUsesStableIds = false;
        run.postSubmitHistoryFingerprint = '';
        run.postSubmitHistoryStablePolls = 0;
        run.historyVerification = null;
        run.historyFallbackEnabled = null;
        run.historyBaselineWarning = '';
        run.chooserOpenedAt = null;
        run.signatureUsed = null;

        if (run.index >= run.items.length) {
            const total = run.items.length;
            const mode = getMode(run.modeKey);
            const owner = run.ownerLabel || run.ownerName || 'selected gear owner(s)';
            const summary = summarizeCompletedRun(run);

            commitGearSnapshotsFromRun(run);
            const archiveWarnings = recordCompletedRun(summary);
            const stopped = loadJSON(STOPPED_RUN_KEY, null);
            if (stopped?.modeKey === run.modeKey) localStorage.removeItem(STOPPED_RUN_KEY);
            clearRun();

            const archiveNote = archiveWarnings.length
                ? ` Local archive warning: ${archiveWarnings.join(' ')} Download this run summary now.`
                : '';
            setStatus(
                `RUN COMPLETE — ${total}/${total} ${mode.short} inspection(s) recorded for ${owner}.${archiveNote}`,
                archiveWarnings.length === 0
            );
            setTimeout(() => showRunSummary(summary), 350);
            return;
        }

        saveRun(run);
        const next = run.items[run.index];
        setStatus(`${run.index + 1}/${run.items.length} — opening ${next.assetId}...`);
        location.href = next.url;
    }

    async function waitForFinalCompletion(run, timeout = 60000) {
        const item = run.items[run.index];
        const mode = getMode(run.modeKey);
        const start = Date.now();
        let historyRevealAttempted = false;

        while (Date.now() - start < timeout) {
            if (
                !historyRevealAttempted &&
                isAssetPageFor(item) &&
                assetPageContainsExpectedId(item) &&
                !!exactButton('Start Inspection')
            ) {
                historyRevealAttempted = true;
                try {
                    await revealAssetHistory(item, mode.title, 650);
                    await waitForItemLogSnapshotSettled(
                        item,
                        mode.title,
                        5000,
                        POST_SUBMIT_HISTORY_STABLE_POLLS
                    );
                } catch {}
            }

            const evidence = completionEvidence(run, item);
            if (evidence) {
                await advanceRun(run, evidence);
                return true;
            }
            await sleep(250);
        }

        stopRun(`${item.assetId}: final Submit was clicked once, but completion could not be verified within ${Math.round(timeout / 1000)} seconds.`);
        return false;
    }

    async function waitFailedOutcome(run) {
        const item = run.items[run.index];
        const mode = getMode(run.modeKey);
        const start = Date.now();
        let historyRevealAttempted = false;

        while (Date.now() - start < 30000) {
            const modal = findFailureModalRoot(item.assetId);
            if (modal) {
                setStatus(`${run.index + 1}/${run.items.length} — Failure Details detected for ${item.assetId}...`);
                await submitFailureModal(run, item, modal);
                return;
            }

            if (
                !historyRevealAttempted &&
                Date.now() - start >= FAILED_RETURN_EVIDENCE_FLOOR_MS &&
                isAssetPageFor(item) &&
                assetPageContainsExpectedId(item) &&
                !!exactButton('Start Inspection')
            ) {
                historyRevealAttempted = true;
                try {
                    await revealAssetHistory(item, mode.title, 650);
                    await waitForItemLogSnapshotSettled(
                        item,
                        mode.title,
                        5000,
                        POST_SUBMIT_HISTORY_STABLE_POLLS
                    );
                } catch {}
            }

            const evidence = completionEvidence(run, item);
            if (evidence) {
                await advanceRun(run, evidence);
                return;
            }

            await sleep(200);
        }

        stopRun(`${item.assetId}: Submit was clicked once, but neither Failure Details nor verified completion appeared within 30 seconds.`);
    }

    // ============================================================
    // PROCESS LIVE INSPECTION
    // ============================================================

    async function processLiveInspection(run) {
        const item = run.items[run.index];
        const mode = getMode(run.modeKey);

        if (!isLiveInspectionPage(mode.title)) {
            stopRun(`${item.assetId}: a fresh live ${mode.short} inspection was not detected.`);
            return;
        }

        const current = currentInspection();
        if (!current || current.template !== item.template) {
            stopRun(`${item.assetId}: wrong template. Expected ${item.template}, got ${current?.template || 'unknown'}.`);
            return;
        }

        run.phase = 'processing';
        run.inspectionUrl = location.href;
        saveRun(run);

        try {
            setStatus(`${run.index + 1}/${run.items.length} — recording ${item.q1.toUpperCase()}/${item.q2.toUpperCase()} for ${item.assetId}...`);
            await fillLiveForm(run, item);

            setStatus(`${run.index + 1}/${run.items.length} — applying ${getConfig().inspectorName}'s next signature variant...`);
            const sig = await applyNextSignature();
            run.signatureUsed = sig.label;
            saveRun(run);

            await sleep(1000);
            const mainSubmit = await waitFor(() => enabledButton('Submit Inspection'), 15000);
            const anyFailure = item.q1 === 'fail' || item.q2 === 'fail';

            if (anyFailure) {
                run.phase = 'failed-main-submitted';
                run.inspectionUrl = location.href;
                run.inspectionItemKey = `${item.pool}:${item.itemId}`;
                run.submittedAt = Date.now();
                run.postSubmitReturnFirstSeenAt = null;
                run.postSubmitReturnPageSessionId = null;
                saveRun(run);

                setStatus(`${run.index + 1}/${run.items.length} — submitting ${item.assetId} once and waiting for failure handling...`);
                mainSubmit.click();
                await waitFailedOutcome(run);
                return;
            }

            run.phase = 'submitted';
            run.inspectionUrl = location.href;
            run.inspectionItemKey = `${item.pool}:${item.itemId}`;
            run.submittedAt = Date.now();
            run.postSubmitReturnFirstSeenAt = null;
            run.postSubmitReturnPageSessionId = null;
            saveRun(run);

            setStatus(`${run.index + 1}/${run.items.length} — submitting ${item.assetId} exactly once...`);
            mainSubmit.click();
            await waitForFinalCompletion(run);
        } catch (error) {
            stopRun(`${item.assetId}: ${error.message}`);
        }
    }

    // ============================================================
    // ASSET -> CHOOSER -> LIVE INSPECTION
    // ============================================================

    async function openInspectionForCurrentAsset(run) {
        const item = run.items[run.index];
        const mode = getMode(run.modeKey);

        if (!isAssetPageFor(item)) {
            location.href = item.url;
            return;
        }

        const identityVerified = await verifyExpectedAssetPage(item);
        if (!identityVerified) {
            stopRun(
                `${item.assetId}: Vector reached pool ${item.pool} / item ${item.itemId}, ` +
                'but the expected asset ID was not found in the asset identity/header region. No inspection was started.'
            );
            return;
        }

        const itemKey = `${item.pool}:${item.itemId}`;
        if (run.preSubmitAssetFingerprint?.itemKey !== itemKey) {
            run.preSubmitAssetFingerprint = assetPageDiagnosticFingerprint(item);
            run.postSubmitAssetFingerprint = null;
            run.postSubmitSettledFingerprint = null;
            run.postSubmitReturnFirstSeenAt = null;
            run.postSubmitReturnPageSessionId = null;
            run.inspectionItemKey = null;
            saveRun(run);
        }

        if (run.historyFallbackEnabled !== true && run.historyFallbackEnabled !== false) {
            try {
                // Vector's inspection history is lower on the asset page. Reveal
                // it once before Start Inspection so lazy-rendered history is part
                // of the baseline.
                await revealAssetHistory(item, mode.title, 550);
                const baselineSnapshot = await waitForStableHistoryBaseline(item, mode.title);
                run.baselineCompleteCount = baselineSnapshot.count;
                run.baselineHistoryEntries = baselineSnapshot.texts.slice();
                run.baselineHistoryKeys = baselineSnapshot.keys.slice();
                run.baselineUsesStableIds = baselineSnapshot.usesStableIds;
                run.postSubmitHistoryKeys = [];
                run.postSubmitHistoryEntries = [];
                run.postSubmitUsesStableIds = false;
                run.postSubmitCompleteCount = null;
                run.postSubmitHistoryFingerprint = '';
                run.postSubmitHistoryStablePolls = 0;
                run.historyVerification = {
                    result: 'baseline-ready',
                    at: new Date().toISOString(),
                    baselineCount: baselineSnapshot.count,
                    postSubmitCount: null,
                    stableReads: baselineSnapshot.stablePolls || ITEM_LOG_SETTLE_STABLE_POLLS,
                    baselineUsesStableIds: baselineSnapshot.usesStableIds,
                    postSubmitUsesStableIds: false,
                    baselineHistoryKeys: baselineSnapshot.keys.slice(),
                    postSubmitHistoryKeys: [],
                    addedKeys: []
                };
                run.historyFallbackEnabled = true;
                run.historyBaselineWarning = '';
            } catch (error) {
                // A Vector markup change must not force us to guess a baseline or
                // make the whole helper unusable. Continue with stronger evidence
                // paths only; capture the safe table structure so the selector can
                // be repaired from a legitimate inspection without collecting row text.
                run.baselineCompleteCount = null;
                run.baselineHistoryEntries = [];
                run.baselineHistoryKeys = [];
                run.baselineUsesStableIds = false;
                run.postSubmitHistoryKeys = [];
                run.postSubmitHistoryEntries = [];
                run.postSubmitUsesStableIds = false;
                run.postSubmitCompleteCount = null;
                run.postSubmitHistoryFingerprint = '';
                run.postSubmitHistoryStablePolls = 0;
                run.historyVerification = {
                    result: 'baseline-unavailable',
                    at: new Date().toISOString(),
                    baselineCount: null,
                    postSubmitCount: null,
                    stableReads: 0,
                    baselineUsesStableIds: false,
                    postSubmitUsesStableIds: false,
                    baselineHistoryKeys: [],
                    postSubmitHistoryKeys: [],
                    addedKeys: []
                };
                run.historyFallbackEnabled = false;
                run.historyBaselineWarning = error.message;
                run.historyStructureCapture = safeDiagnosticTableStructure(item);
            }
            saveRun(run);
            if (run.historyFallbackEnabled === false) {
                saveDiagnostic(
                    `${item.assetId}: history confirmation unavailable; captured visible table/grid structure for selector repair.`,
                    run
                );
            }
        }

        if (run.historyFallbackEnabled === false) {
            setStatus(
                `${run.index + 1}/${run.items.length} — ${item.assetId}: history confirmation unavailable; ` +
                'continuing with stronger instance evidence first; post-submit return evidence remains a flagged fallback.'
            );
        } else {
            setStatus(`${run.index + 1}/${run.items.length} — opening ${mode.short} chooser for ${item.assetId}...`);
        }

        let chooser = findChooserRoot();
        if (run.phase === 'chooser') {
            const chooserAge = Number.isFinite(run.chooserOpenedAt) ? Date.now() - run.chooserOpenedAt : Infinity;
            if (chooserAge < 0 || chooserAge > 120000) {
                stopRun(`${item.assetId}: a saved inspection chooser state is older than 2 minutes. The helper will not reuse or recreate that draft automatically.`);
                return;
            }
            if (!chooser) {
                stopRun(
                    `${item.assetId}: the page reloaded after Start Inspection was already authorized. ` +
                    'The helper will not click Start Inspection a second time because that could create an orphan/duplicate draft.'
                );
                return;
            }
        } else {
            const startButton = await waitFor(() => enabledButton('Start Inspection'), 10000);
            await bringIntoView(startButton, 300);
            run.phase = 'chooser';
            run.chooserOpenedAt = Date.now();
            saveRun(run); // persist before the click it authorizes
            startButton.click();
            chooser = await waitFor(findChooserRoot, 10000);

            // Starting an inspection must not itself create something we count as
            // COMPLETE. This catches draft rows labelled "Incomplete" or any future
            // status/selector regression before a Submit button is ever clicked.
            if (run.historyFallbackEnabled === true) {
                await sleep(650);
                const afterStartCount = countModeCompletesOnAssetPage(item, mode.title);
                if (!Number.isInteger(afterStartCount)) {
                    run.historyFallbackEnabled = false;
                    run.historyBaselineWarning = 'History became unreadable after Start Inspection; fallback disabled.';
                    saveRun(run);
                } else if (afterStartCount !== run.baselineCompleteCount) {
                    stopRun(
                        `${item.assetId}: completed-history count changed from ${run.baselineCompleteCount} to ${afterStartCount} ` +
                        'immediately after Start Inspection and before submission. History confirmation was not trusted.'
                    );
                    return;
                }
            }
        }

        const card = await waitFor(() => findInspectionCardInChooser(mode.title), 10000);
        if (!chooser.contains(card)) {
            stopRun(`${item.assetId}: ${mode.short} selector was not inside the Select Inspection popup.`);
            return;
        }

        run.phase = 'await-live';
        saveRun(run);
        card.click();

        const started = Date.now();
        while (Date.now() - started < 20000) {
            if (isLiveInspectionPage(mode.title)) {
                const fresh = getRun();
                if (fresh && fresh.phase === 'await-live') {
                    await processLiveInspection(fresh);
                }
                return;
            }
            await sleep(150);
        }

        stopRun(`${item.assetId}: ${mode.short} was selected, but a fresh live inspection did not open within 20 seconds.`);
    }

    async function resumeRun() {
        if (busy) return;
        const run = getRun();
        if (!run || run.phase === 'stopped') return;
        if (!run.items?.length || run.index >= run.items.length) {
            clearRun();
            return;
        }

        if (!claimRunOwnership()) {
            setStatus(
                'This PPE run is being driven by another Vector Check It tab. This tab will not click or submit anything.',
                false
            );
            return;
        }

        busy = true;
        try {
            const item = run.items[run.index];
            const mode = getMode(run.modeKey);
            setStatus(`${run.index + 1}/${run.items.length} — ${item.assetId} — ${run.phase}`);

            if (run.phase === 'submitted') {
                await waitForFinalCompletion(run);
                return;
            }

            if (run.phase === 'failed-main-submitted') {
                await waitFailedOutcome(run);
                return;
            }

            if (run.phase === 'processing') {
                stopRun(`${item.assetId}: page reloaded while filling/signing. Verify this draft manually before continuing.`);
                return;
            }

            if (run.phase === 'await-live') {
                if (isLiveInspectionPage(mode.title)) {
                    await processLiveInspection(run);
                    return;
                }
                if (findChooserRoot()) {
                    setStatus(`${run.index + 1}/${run.items.length} — waiting for Vector to open ${mode.short}...`);
                    return;
                }
                stopRun(`${item.assetId}: chooser closed, but no live ${mode.short} inspection opened.`);
                return;
            }

            if (run.phase === 'asset' || run.phase === 'chooser') {
                await openInspectionForCurrentAsset(run);
                return;
            }

            stopRun(`${item.assetId}: unknown run phase "${run.phase}".`);
        } catch (error) {
            stopRun(`${run.items[run.index]?.assetId || 'Current item'}: ${error.message}`);
        } finally {
            busy = false;
        }
    }

    // ============================================================
    // RUN PREVIEW / PEOPLE DIRECTORY / CAPTAIN SETS
    // ============================================================

    function defaultResultForAsset(item) {
        const config = getConfig();
        const assetId = clean(item?.assetId || item).toUpperCase();
        const ownerPrefix = clean(item?.ownerPrefix || config.selfPrefix).toUpperCase();
        const special = config.localAssetRules?.[localRuleKey(ownerPrefix, assetId)];
        if (!special) return { q1: 'pass', q2: 'pass', failureNote: '', localRuleApplied: false };

        if (special.expiresAt) {
            const endOfDay = Date.parse(`${special.expiresAt}T23:59:59`);
            if (Number.isFinite(endOfDay) && Date.now() > endOfDay) {
                return { q1: 'pass', q2: 'pass', failureNote: '', localRuleApplied: false, expiredRule: true };
            }
        }

        return {
            q1: special.q1 === 'fail' ? 'fail' : 'pass',
            q2: special.q2 === 'fail' ? 'fail' : 'pass',
            failureNote: clean(special.note),
            localRuleApplied: true,
            ruleOwnerPrefix: special.ownerPrefix,
            expiresAt: special.expiresAt || ''
        };
    }

    function resultSelect(value) {
        const select = document.createElement('select');
        select.style.cssText = 'padding:6px;min-width:88px;';
        select.innerHTML = '<option value="pass">PASS</option><option value="fail">FAIL</option>';
        select.value = value;
        return select;
    }

    function renderGearChangeNotice(box, owner, diff, currentCount) {
        const wrap = document.createElement('div');
        wrap.style.cssText = 'padding:8px;margin:5px 0;border-radius:5px;font-size:12px;line-height:1.45;';

        if (!diff.hasBaseline) {
            wrap.style.cssText += 'background:#eef5fb;border:1px solid #9abbd7;';
            wrap.innerHTML =
                `<b>Gear baseline:</b> No prior successful-run snapshot exists for ${escapeHtml(owner.name)}. ` +
                `The current ${currentCount}-item list will become the local baseline after a successful run.`;
            box.appendChild(wrap);
            return;
        }

        if (!diff.changed) {
            wrap.style.cssText += 'background:#eef8ee;border:1px solid #9fc79f;';
            wrap.innerHTML =
                `<b>Gear list verified:</b> Current assignments match the last successful-run snapshot` +
                (diff.previousAt ? ` from ${escapeHtml(new Date(diff.previousAt).toLocaleString())}` : '') + '.';
            box.appendChild(wrap);
            return;
        }

        wrap.style.cssText += 'background:#fff4e5;border:1px solid #d49b42;';
        let html = '<b>ASSIGNMENT CHANGE DETECTED.</b>';
        if (diff.replacements.length) {
            html += '<br><b>Possible replacement(s):</b> ' +
                diff.replacements.map(x =>
                    `${escapeHtml(x.type)}: ${escapeHtml(x.oldAssetId)} → ${escapeHtml(x.newAssetId)}`
                ).join('; ');
        }
        if (diff.moved?.length) {
            html += '<br><b>Vector item changed for same asset ID:</b> ' +
                diff.moved.map(x =>
                    `${escapeHtml(x.assetId)} (${escapeHtml(x.old.pool)}:${escapeHtml(x.old.itemId)} → ${escapeHtml(x.current.pool)}:${escapeHtml(x.current.itemId)})`
                ).join('; ');
        }
        if (diff.added.length) {
            html += '<br><b>Newly assigned:</b> ' +
                diff.added.map(x => escapeHtml(`${x.assetId} (${x.type})`)).join(', ');
        }
        if (diff.missing.length) {
            html += '<br><b>No longer found:</b> ' +
                diff.missing.map(x => escapeHtml(`${x.assetId} (${x.type})`)).join(', ');
        }
        html += '<br>Review the live list before starting. The helper will not silently substitute an old asset.';
        wrap.innerHTML = html;
        box.appendChild(wrap);
    }

    async function buildPreview(modeKey, ownerInput) {
        const mode = getMode(modeKey);
        const config = getConfig();
        const owners = (Array.isArray(ownerInput) ? ownerInput : [ownerInput])
            .map(normalizePerson)
            .filter(Boolean);

        if (!owners.length) throw new Error('Select at least one gear owner.');
        if (!mode) throw new Error(`Unknown inspection mode: ${modeKey}`);
        if (!config.initialized) {
            throw new Error('First-time setup required. Open Settings, confirm the inspector name / gear prefix, and save before running inspections.');
        }
        if (!getSignatureLibrary().length) {
            throw new Error('No saved signature variants. Open Settings → Signatures first.');
        }

        const groups = [];
        let fatalIssue = false;

        for (const owner of owners) {
            setStatus(`Searching ${owner.name}'s assigned PPE...`);
            try {
                const result = await discoverOwnerGear(owner.prefix, modeKey);
                const gear = result.items.map(item => ({
                    ...item,
                    ownerName: owner.name,
                    ownerPrefix: owner.prefix,
                    ownerRole: owner.role || ''
                }));
                const unknown = result.unknown.map(item => ({
                    ...item,
                    ownerName: owner.name,
                    ownerPrefix: owner.prefix,
                    ownerRole: owner.role || ''
                }));
                const currentAll = [...gear, ...unknown];
                const diff = compareGearSnapshot(owner.prefix, currentAll);

                if (unknown.length) fatalIssue = true;
                groups.push({
                    owner,
                    gear,
                    unknown,
                    diff,
                    searchMeta: result.searchMeta,
                    error: null
                });
            } catch (error) {
                fatalIssue = true;
                groups.push({
                    owner,
                    gear: [],
                    unknown: [],
                    diff: compareGearSnapshot(owner.prefix, []),
                    searchMeta: null,
                    error: error.message
                });
            }
        }

        const allDiscovered = groups.flatMap(g => g.gear);
        const ownerLabel = owners.length === 1
            ? owners[0].name
            : `${owners.length} people: ${owners.map(x => x.name).join(', ')}`;

        const { overlay, box } = makeOverlayBox('1020px');
        box.innerHTML = `
            <div style="font-size:21px;font-weight:700;margin-bottom:5px">${escapeHtml(mode.title)}</div>
            <div style="margin-bottom:10px;line-height:1.45">
                <b>Inspector:</b> ${escapeHtml(config.inspectorName)}<br>
                <b>Selected gear owner(s):</b> ${escapeHtml(ownerLabel)}<br>
                <b>Runnable assigned PPE found:</b> ${allDiscovered.length}<br>
                Set each question independently. Any item with a FAIL must have a Failure Note.
            </div>
        `;

        const rows = [];
        const expectedCount = getExpectedGearCount(config);
        const stoppedRun = loadJSON(STOPPED_RUN_KEY, null);
        const stoppedRecent = stoppedRun && stoppedRun.modeKey === modeKey &&
            Date.now() - Date.parse(stoppedRun.stoppedAt || stoppedRun.startedAt || 0) <= 6 * 60 * 60 * 1000;
        const protectedAssetIds = new Set();
        if (stoppedRecent) {
            for (const c of stoppedRun.completed || []) protectedAssetIds.add(clean(c.assetId).toUpperCase());
            if (Number.isFinite(stoppedRun.submittedAt) && stoppedRun.items?.[stoppedRun.index]?.assetId) {
                protectedAssetIds.add(clean(stoppedRun.items[stoppedRun.index].assetId).toUpperCase());
            }
            if (protectedAssetIds.size) {
                const recovery = document.createElement('div');
                recovery.style.cssText = 'background:#fff4e5;border:2px solid #d49b42;padding:10px;margin:8px 0;border-radius:5px;line-height:1.45;';
                recovery.innerHTML =
                    `<b>RECENT STOPPED RUN RECOVERY:</b> ${protectedAssetIds.size} asset(s) from the stopped ${escapeHtml(mode.short)} run ` +
                    'will be pre-unchecked to reduce duplicate records. Review before re-enabling any of them.<br>' +
                    [...protectedAssetIds].map(escapeHtml).join(', ');
                box.appendChild(recovery);
            }
        }

        for (const group of groups) {
            const owner = group.owner;
            const discovered = group.gear;
            const totalFound = discovered.length + group.unknown.length;

            const ownerHeader = document.createElement('div');
            ownerHeader.style.cssText = 'margin:14px 0 6px;padding:8px 10px;background:#eaf0f7;border-left:4px solid #173f70;font-weight:700;';
            ownerHeader.textContent = `${owner.name} — ${owner.role || 'Personnel'} — ${owner.prefix} — ${totalFound} item(s) found`;
            box.appendChild(ownerHeader);

            if (group.error) {
                const error = document.createElement('div');
                error.style.cssText = 'background:#fff0f0;border:1px solid #c65a5a;padding:9px;margin:5px 0;border-radius:5px;';
                error.innerHTML = `<b>DISCOVERY ERROR:</b> ${escapeHtml(group.error)}<br>This person blocks the run because their live gear list could not be verified.`;
                box.appendChild(error);
                continue;
            }

            if (totalFound === 0) {
                const zero = document.createElement('div');
                zero.style.cssText = 'background:#fff4e5;border:1px solid #d49b42;padding:10px;margin:5px 0;border-radius:5px;';
                zero.innerHTML =
                    `<b>0 PPE FOUND for ${escapeHtml(owner.name)}.</b> ` +
                    'This does not cancel the other selected people. No inspection will be created for this person.';
                box.appendChild(zero);
                renderGearChangeNotice(box, owner, group.diff, totalFound);
                continue;
            }

            if (expectedCount > 0 && totalFound !== expectedCount) {
                const notice = document.createElement('div');
                notice.style.cssText = 'background:#fff6d8;border:1px solid #d7b14d;padding:8px;margin:5px 0;border-radius:5px;';
                notice.innerHTML =
                    `<b>Gear count notice:</b> ${escapeHtml(owner.name)} currently has ${totalFound} item(s) assigned; ` +
                    `${expectedCount} is only the normal expected count. The live Vector list controls what is shown.`;
                box.appendChild(notice);
            }

            renderGearChangeNotice(box, owner, group.diff, totalFound);

            if (group.unknown.length) {
                const unknown = document.createElement('div');
                unknown.style.cssText = 'background:#ffe5e5;border:2px solid #b93636;padding:9px;margin:6px 0;border-radius:5px;';
                unknown.innerHTML =
                    `<b>UNMAPPED PPE — RUN BLOCKED:</b><br>` +
                    group.unknown.map(x =>
                        `${escapeHtml(x.assetId)} — pool ${escapeHtml(x.pool)} — ${escapeHtml(x.type)}`
                    ).join('<br>') +
                    '<br>The new pool/template must be mapped before this inspection mode can run safely.';
                box.appendChild(unknown);
            }

            discovered.forEach(item => {
                const defaults = defaultResultForAsset(item);
                const row = document.createElement('div');
                row.style.cssText = 'border:1px solid #ddd;border-radius:6px;padding:9px;margin:5px 0;';

                const top = document.createElement('div');
                top.style.cssText = 'display:grid;grid-template-columns:28px 1fr 110px 110px;gap:8px;align-items:center;';

                const include = document.createElement('input');
                include.type = 'checkbox';
                include.checked = !protectedAssetIds.has(clean(item.assetId).toUpperCase());

                const label = document.createElement('div');
                label.innerHTML =
                    `<b>${escapeHtml(item.assetId)}</b> — ${escapeHtml(item.type)} ` +
                    `<span style="color:#666">(${escapeHtml(item.ownerName)})</span>` +
                    (defaults.localRuleApplied
                        ? ` <span style="color:#8a4b00;font-weight:700">[LOCAL RULE${defaults.expiresAt ? ` through ${escapeHtml(defaults.expiresAt)}` : ''}]</span>`
                        : (defaults.expiredRule ? ' <span style="color:#777">[expired local rule ignored]</span>' : ''));

                const q1 = resultSelect(defaults.q1);
                const q2 = resultSelect(defaults.q2);
                top.append(include, label, q1, q2);
                row.appendChild(top);

                const captions = document.createElement('div');
                captions.style.cssText = 'display:grid;grid-template-columns:28px 1fr 110px 110px;gap:8px;font-size:11px;color:#555;margin-top:2px;';
                captions.innerHTML = '<span></span><span></span><span>Age / label</span><span>Physical damage</span>';
                row.appendChild(captions);

                const note = document.createElement('input');
                note.type = 'text';
                note.placeholder = 'Failure Note required if either question = FAIL';
                note.value = defaults.failureNote;
                note.style.cssText = 'width:100%;box-sizing:border-box;padding:7px;margin-top:7px;';
                row.appendChild(note);

                const syncNoteStyle = () => {
                    const failed = q1.value === 'fail' || q2.value === 'fail';
                    note.style.display = failed ? 'block' : 'none';
                    row.style.background = failed ? '#fff1f1' : '#fff';
                };
                q1.onchange = syncNoteStyle;
                q2.onchange = syncNoteStyle;
                syncNoteStyle();

                box.appendChild(row);
                rows.push({ item, include, q1, q2, note });
            });
        }

        if (fatalIssue) {
            const blocker = document.createElement('div');
            blocker.style.cssText = 'background:#ffe5e5;border:2px solid #b93636;padding:10px;margin:14px 0 6px;border-radius:5px;font-weight:700;';
            blocker.textContent = 'START IS BLOCKED until every selected person has a verified search and all discovered PPE is mapped.';
            box.appendChild(blocker);
        }

        const cert = document.createElement('label');
        cert.style.cssText = 'display:flex;gap:9px;margin-top:14px;padding:11px;background:#f4f6f8;border-radius:5px;';
        const certBox = document.createElement('input');
        certBox.type = 'checkbox';
        const certText = document.createElement('div');
        certText.innerHTML = modeKey === 'captain'
            ? `<b>I, ${escapeHtml(config.inspectorName)}, performed these Captain's PPE inspections of the selected gear, and the PASS/FAIL results above are correct.</b>`
            : `<b>I, ${escapeHtml(config.inspectorName)}, physically inspected my selected PPE and the PASS/FAIL results above are correct.</b>`;
        cert.append(certBox, certText);
        box.appendChild(cert);

        const start = makeButton('START SELECTED PPE RUN', { background: '#e8f2e8' });
        const cancel = makeButton('Cancel');

        if (fatalIssue) {
            start.disabled = true;
            start.style.opacity = '0.45';
            start.style.cursor = 'not-allowed';
        }

        start.onclick = async () => {
            if (start.disabled) return;
            start.disabled = true;
            let committed = false;
            let createdRunId = null;
            try {
                // fatalIssue normally disables START, so this is not expected to
                // fire from an ordinary click. Keep it as a defensive assertion
                // in case the handler is invoked programmatically in the future.
                if (fatalIssue) {
                    alert('This run is blocked by a discovery or mapping error.');
                    return;
                }

                if (!(await ensureRemoteCompatibilityBeforeRun())) return;

                // The update check is asynchronous. If the user closed/cancelled
                // this preview while it was running, do not launch a stale run.
                if (!document.contains(start) || !document.contains(overlay)) return;

                const selected = [];
                for (const row of rows) {
                    if (!row.include.checked) continue;
                    const q1 = row.q1.value;
                    const q2 = row.q2.value;
                    const failureNote = clean(row.note.value);
                    if ((q1 === 'fail' || q2 === 'fail') && !failureNote) {
                        alert(`${row.item.assetId} has a FAIL but no Failure Note.`);
                        return;
                    }
                    selected.push({ ...row.item, q1, q2, failureNote });
                }

                if (!selected.length) {
                    alert('No runnable PPE items are selected.');
                    return;
                }

                const unchecked = rows.filter(row => !row.include.checked).map(row => row.item.assetId);
                if (unchecked.length) {
                    const ok = confirm(
                        `${unchecked.length} discovered PPE item(s) are NOT selected and will not receive an inspection in this run:\n\n` +
                        unchecked.join('\n') +
                        '\n\nContinue with only the selected items?'
                    );
                    if (!ok) return;
                }
                if (!certBox.checked) {
                    alert('Check the inspection confirmation first.');
                    return;
                }

                const discoverySnapshots = groups.map(group => ({
                    ownerName: group.owner.name,
                    prefix: group.owner.prefix,
                    items: [...group.gear, ...group.unknown].map(item => ({
                        assetId: item.assetId,
                        pool: item.pool,
                        itemId: item.itemId,
                        type: item.type
                    }))
                }));

                createdRunId = 'ppe-' + Date.now();
                const run = {
                    version: VERSION,
                    runId: createdRunId,
                    startedAt: new Date().toISOString(),
                    modeKey,
                    ownerName: owners.length === 1 ? owners[0].name : ownerLabel,
                    ownerLabel,
                    ownerNames: owners.map(x => x.name),
                    ownerPrefixes: owners.map(x => x.prefix),
                    inspectorName: config.inspectorName,
                    items: selected,
                    discoverySnapshots,
                    index: 0,
                    phase: 'asset',
                    baselineCompleteCount: null,
                    baselineHistoryEntries: [],
                    baselineHistoryKeys: [],
                    baselineUsesStableIds: false,
                    postSubmitCompleteCount: null,
                    postSubmitHistoryEntries: [],
                    postSubmitHistoryKeys: [],
                    postSubmitUsesStableIds: false,
                    postSubmitHistoryFingerprint: '',
                    postSubmitHistoryStablePolls: 0,
                    historyVerification: null,
                    historyFallbackEnabled: null,
                    historyBaselineWarning: '',
                    inspectionUrl: null,
                    inspectionItemKey: null,
                    submittedAt: null,
                    postSubmitReturnFirstSeenAt: null,
                    postSubmitReturnPageSessionId: null,
                    preSubmitAssetFingerprint: null,
                    postSubmitAssetFingerprint: null,
                    postSubmitSettledFingerprint: null,
                    historyStructureCapture: [],
                    chooserOpenedAt: null,
                    completed: [],
                    signatureUsed: null
                };

                saveRun(run);
                committed = true;
                overlay.remove();
                setStatus(`Starting ${selected.length}-item ${mode.short} run for ${ownerLabel}...`);
                location.href = selected[0].url;
            } catch (error) {
                let persistedRun = null;
                try { persistedRun = getRun(); } catch {}

                const runWasPersisted = !!(
                    createdRunId &&
                    persistedRun &&
                    persistedRun.runId === createdRunId
                );

                const message = runWasPersisted
                    ? `PPE run ${createdRunId} was created, but startup did not finish cleanly: ${error?.message || error}. Do NOT press START again. Use ABORT ACTIVE RUN, or resume the existing run only after confirming it is the intended inspection.`
                    : `Unable to start PPE run: ${error?.message || error}`;

                // If localStorage itself is the failure (for example quota exceeded),
                // diagnostic persistence may fail too. Never let that hide the error.
                try { saveDiagnostic(message, runWasPersisted ? persistedRun : null); } catch {}
                setStatus(message, false);

                if (runWasPersisted) {
                    committed = true;
                    if (document.contains(overlay)) overlay.remove();
                    alert(message);
                } else if (document.contains(overlay)) {
                    alert(message);
                }
            } finally {
                if (!committed && document.contains(start)) start.disabled = false;
            }
        };

        cancel.onclick = () => overlay.remove();
        box.append(start, cancel);
    }

    async function launchMyInspectionFromAnywhere(modeKey) {
        if (getRun()) {
            setStatus('An inspection run is already active. Abort or finish it first.', false);
            return;
        }

        try {
            setStatus('Opening Equipment → PPE…');
            await ensurePpeEquipmentPage(message => setStatus(message));
            await startMyMode(modeKey);
        } catch (error) {
            saveDiagnostic(error.message);
            setStatus(error.message, false);
        }
    }

    async function launchCaptainInspectionFromAnywhere() {
        if (getRun()) {
            setStatus('An inspection run is already active. Abort or finish it first.', false);
            return;
        }

        try {
            setStatus('Opening Equipment → PPE…');
            await ensurePpeEquipmentPage(message => setStatus(message));
            showCaptainOwnerPicker();
        } catch (error) {
            saveDiagnostic(error.message);
            setStatus(error.message, false);
        }
    }

    async function startMyMode(modeKey) {
        if (getRun()) {
            setStatus('An inspection run is already active. Abort or finish it first.', false);
            return;
        }

        const config = getConfig();
        const self = config.peopleDirectory.find(
            x => x.prefix.toUpperCase() === config.selfPrefix.toUpperCase()
        ) || {
            name: config.inspectorName,
            prefix: config.selfPrefix
        };

        try {
            await buildPreview(modeKey, self);
        } catch (error) {
            saveDiagnostic(error.message);
            setStatus(error.message, false);
        }
    }

    function saveCaptainRosterPrefixes(prefixes) {
        const next = cloneConfig();
        next.captainRosterPrefixes = normalizeCaptainRosterPrefixes(prefixes, next.peopleDirectory);
        saveConfig(next);
        refreshPanelInfo();
        return next.captainRosterPrefixes;
    }

    function showCaptainOwnerPicker() {
        if (getRun()) {
            setStatus('An inspection run is already active. Abort or finish it first.', false);
            return;
        }

        const config = getConfig();
        const usableSets = (config.captainSets || [])
            .map(set => ({
                ...set,
                people: resolveCaptainSetPeople(set, config)
            }))
            .filter(set => set.people.length);

        if (!usableSets.length) {
            setStatus('No Captain Sets are ready. Open Settings → Captain Sets and choose your crew from the department roster.', false);
            showSettings('captain');
            return;
        }

        const { overlay, box } = makeOverlayBox('760px');
        const title = document.createElement('div');
        title.style.cssText = 'font-size:22px;font-weight:700;margin-bottom:4px;color:#153e5c;';
        title.textContent = "Captain's Monthly";
        box.appendChild(title);

        const sub = document.createElement('div');
        sub.style.cssText = 'font-size:12px;color:#607483;margin-bottom:14px;';
        sub.textContent = 'Choose a saved Captain Set, then confirm the people whose PPE you physically inspected.';
        box.appendChild(sub);

        const setLabel = document.createElement('label');
        setLabel.style.cssText = 'display:block;font-size:12px;font-weight:700;margin-bottom:10px;';
        setLabel.textContent = 'Captain Set';

        const select = document.createElement('select');
        select.style.cssText = 'display:block;width:100%;box-sizing:border-box;margin-top:5px;padding:10px;border:1px solid #b8c8d6;border-radius:7px;background:#fff;color:#18384f;';
        usableSets.forEach(set => {
            const opt = document.createElement('option');
            opt.value = set.id;
            opt.textContent = `${set.name} (${set.people.length})`;
            select.appendChild(opt);
        });
        const last = localStorage.getItem(CAPTAIN_LAST_SET_KEY) || '';
        if (usableSets.some(s => s.id === last)) select.value = last;
        setLabel.appendChild(select);
        box.appendChild(setLabel);

        const peopleHost = document.createElement('div');
        box.appendChild(peopleHost);

        function currentSet() {
            return usableSets.find(s => s.id === select.value) || usableSets[0];
        }

        function renderPeople() {
            peopleHost.innerHTML = '';
            const set = currentSet();
            localStorage.setItem(CAPTAIN_LAST_SET_KEY, set.id);

            const bar = document.createElement('div');
            bar.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin:12px 0 7px;';
            const label = document.createElement('div');
            label.style.cssText = 'font-size:14px;font-weight:700;';
            label.textContent = `${set.name} — ${set.people.length} people`;
            const controls = document.createElement('div');
            const all = makeButton('Select all');
            all.style.cssText += 'padding:6px 9px;font-size:11px;';
            all.onclick = () => peopleHost.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = true);
            const none = makeButton('Clear');
            none.style.cssText += 'padding:6px 9px;font-size:11px;';
            none.onclick = () => peopleHost.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);
            controls.append(all, none);
            bar.append(label, controls);
            peopleHost.appendChild(bar);

            set.people.forEach(person => {
                const row = document.createElement('label');
                row.style.cssText = 'display:flex;align-items:center;gap:10px;padding:10px 11px;margin:5px 0;border:1px solid #d9e3ea;border-radius:8px;background:#fff;cursor:pointer;';
                const cb = document.createElement('input');
                cb.type = 'checkbox';
                cb.checked = true;
                cb.dataset.prefix = person.prefix;
                cb.style.cssText = 'width:18px;height:18px;accent-color:#176b8e;';
                const text = document.createElement('span');
                text.innerHTML =
                    `<b>${escapeHtml(person.name)}</b>` +
                    `<br><span style="font-size:11px;color:#6b7f8c">${escapeHtml(person.prefix)}</span>`;
                row.append(cb, text);
                peopleHost.appendChild(row);
            });
        }

        select.onchange = renderPeople;
        renderPeople();

        const go = makeButton('Find PPE', { background: '#176b8e', color: '#fff' });
        go.style.cssText += 'font-size:14px;font-weight:700;padding:11px 16px;margin-top:14px;';
        go.onclick = async () => {
            const set = currentSet();
            const selected = [...peopleHost.querySelectorAll('input[type="checkbox"][data-prefix]:checked')]
                .map(cb => rosterPersonByPrefix(cb.dataset.prefix))
                .filter(Boolean)
                .map(person => ({
                    name: person.name,
                    prefix: person.prefix
                }));
            if (!selected.length) {
                alert('Select at least one person whose PPE you inspected.');
                return;
            }
            localStorage.setItem(CAPTAIN_LAST_SET_KEY, set.id);
            overlay.remove();
            try {
                await buildPreview('captain', selected);
            } catch (error) {
                saveDiagnostic(error.message);
                setStatus(error.message, false);
            }
        };

        const manage = makeButton('Manage Captain Sets');
        manage.onclick = () => {
            overlay.remove();
            showSettings('captain');
        };

        const close = makeButton('Cancel');
        close.onclick = () => overlay.remove();
        box.append(go, manage, close);
    }

    // ============================================================
    // VECTOR REBEL LOCAL ADMIN + CAPTAIN ROSTER DISCOVERY
    // ============================================================

    function isAdminUnlocked() {
        return localStorage.getItem(ADMIN_UNLOCK_KEY) === '1';
    }

    function lockAdminTools() {
        localStorage.removeItem(ADMIN_UNLOCK_KEY);
        setStatus('Admin tools locked on this computer.');
    }

    async function sha256Hex(value) {
        const bytes = new TextEncoder().encode(String(value || ''));
        const digest = await crypto.subtle.digest('SHA-256', bytes);
        return [...new Uint8Array(digest)]
            .map(x => x.toString(16).padStart(2, '0'))
            .join('');
    }

    async function requestAdminUnlock(onUnlocked = null) {
        const entered = prompt(
            'Vector Rebel Admin\n\nEnter the admin code. A successful unlock stays enabled on this computer until you choose LOCK ADMIN TOOLS.'
        );
        if (entered === null) return false;

        try {
            const actual = await sha256Hex(clean(entered).toUpperCase());
            if (actual !== ADMIN_CODE_SHA256) {
                alert('Invalid admin code.');
                return false;
            }
            localStorage.setItem(ADMIN_UNLOCK_KEY, '1');
            setStatus('Admin tools unlocked on this computer.');
            if (typeof onUnlocked === 'function') onUnlocked();
            return true;
        } catch (error) {
            alert(`Admin unlock could not be verified: ${error.message}`);
            return false;
        }
    }

    function requireAdmin(actionName = 'Admin tools') {
        if (isAdminUnlocked()) return true;
        setStatus(`${actionName} are locked. Open Settings → General → Admin Unlock.`, false);
        return false;
    }

    function titleCasePrefix(prefix) {
        return clean(prefix)
            .toLowerCase()
            .split('-')
            .filter(Boolean)
            .map(x => x.charAt(0).toUpperCase() + x.slice(1))
            .join(' ');
    }

    function genericAssetIdFromAnchor(anchor) {
        const values = [
            anchor?.getAttribute('aria-label') || '',
            anchor?.getAttribute('title') || '',
            anchor?.innerText || ''
        ];
        for (const raw of values) {
            const text = clean(raw).toUpperCase();
            if (/^[A-Z0-9]+(?:-[A-Z0-9]+)+$/.test(text)) return text;
            const token = text.match(/\b[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+\b/)?.[0] || '';
            if (token) return token;
        }
        return '';
    }

    function prefixFromAssetId(assetId) {
        const id = clean(assetId).toUpperCase();
        const parts = id.split('-').filter(Boolean);
        if (!parts.length) return '';

        const serialIndex = parts.findIndex(part => /^\d+$/.test(part));
        if (serialIndex > 0) {
            return parts.slice(0, serialIndex).join('-');
        }

        // Fallback for unexpected IDs with no numeric serial token.
        return parts[0] || '';
    }

    function ppeRowForAnchor(anchor) {
        return anchor?.closest?.('tr.sortable-table__row, tr, [role="row"], .sortable-table__row') || null;
    }

    function normalizedPpeTypeText(value) {
        const text = clean(value).toLowerCase();
        const types = [
            'bunker coat',
            'bunker pant',
            'structural gloves',
            'structural glove',
            'structural helmet',
            'structural boot',
            'hood'
        ];
        return types.find(type => text === type || text.includes(type)) || '';
    }

    function isPpeStatusCell(value) {
        const text = clean(value).toLowerCase();
        return [
            'in service',
            'out of service',
            'retired',
            'lost',
            'missing',
            'repair',
            'under repair',
            'available',
            'unavailable',
            'checked out',
            'disposed',
            'inactive',
            'active'
        ].some(status => text === status || text.startsWith(`${status} `));
    }

    function rowCellTexts(row) {
        if (!row) return [];
        const cells = [...row.querySelectorAll(':scope > td, :scope > [role="cell"]')]
            .map(cell => clean(cell.innerText || cell.textContent || ''))
            .filter(Boolean);
        if (cells.length) return cells;

        return [...row.querySelectorAll('td, [role="cell"]')]
            .map(cell => clean(cell.innerText || cell.textContent || ''))
            .filter(Boolean);
    }

    function likelyPersonFromPpeRow(row, assetId) {
        const cells = rowCellTexts(row);
        const assetUpper = clean(assetId).toUpperCase();

        // Vector PPE rows expose the assigned person's name twice in the row.
        // For master-roster maintenance, be deliberately conservative:
        // accept only an exact repeated person-like cell from THIS gear row.
        // If a row does not provide that evidence, skip it rather than pairing
        // a neighboring or ambiguous value with the asset prefix.
        const candidates = cells.filter(text => {
            const upper = text.toUpperCase();
            if (!text || upper === assetUpper) return false;
            if (normalizedPpeTypeText(text)) return false;
            if (isPpeStatusCell(text)) return false;
            if (isOrganizationOrBadRosterName(text)) return false;
            if (/^\d+$/.test(text)) return false;
            if (/^[A-Z0-9]+(?:-[A-Z0-9]+)+$/i.test(text)) return false;
            return /[A-Za-z][A-Za-z'.-]*\s+[A-Za-z]/.test(text);
        });

        const counts = new Map();
        for (const text of candidates) {
            const key = masterNameKey(text);
            const entry = counts.get(key) || { text, count: 0 };
            entry.count += 1;
            counts.set(key, entry);
        }

        const repeated = [...counts.values()]
            .filter(entry => entry.count >= 2)
            .sort((a, b) => b.count - a.count || a.text.length - b.text.length);

        return repeated[0]?.text || '';
    }

    function getPaginationControl(kind) {
        const testIds = {
            first: ['first-page-button', 'pagination-first-button'],
            previous: ['previous-page-button', 'prev-page-button', 'pagination-previous-button'],
            next: ['next-page-button', 'pagination-next-button'],
            last: ['last-page-button', 'pagination-last-button']
        };
        for (const id of testIds[kind] || []) {
            const found = document.querySelector(`[data-testid="${id}"]`);
            if (found && visible(found)) return found;
        }

        const labels = {
            first: ['go to first page', 'first page'],
            previous: ['go to previous page', 'previous page', 'prev page'],
            next: ['go to next page', 'next page'],
            last: ['go to last page', 'last page']
        };
        return [...document.querySelectorAll('button,a')].find(el => {
            if (!visible(el)) return false;
            const label = clean(el.getAttribute('aria-label') || el.getAttribute('title') || '');
            return (labels[kind] || []).some(target => uiEquals(label, target));
        }) || null;
    }

    function paginationControlEnabled(control) {
        if (!control || !visible(control)) return false;
        const cls = String(control.className || '').toLowerCase();
        return !control.disabled &&
            control.getAttribute('aria-disabled') !== 'true' &&
            !cls.includes('disabled');
    }

    async function waitForPpePageChange(previousSignature, timeoutMs = 8000) {
        const started = Date.now();
        let changedAt = 0;
        let last = '';
        let stable = 0;

        while (Date.now() - started < timeoutMs) {
            await sleep(160);
            const current = visibleAssetLinksSignature();
            if (current && current !== previousSignature) {
                if (!changedAt) changedAt = Date.now();
                if (current === last) stable += 1;
                else {
                    last = current;
                    stable = 0;
                }
                if (stable >= 3 && Date.now() - changedAt >= 400) return current;
            }
        }
        throw new Error('Vector PPE pagination did not settle in time.');
    }

    async function goToFirstPpePage(progress = null) {
        // Prefer a first-page control if Vector exposes one.
        const first = getPaginationControl('first');
        if (paginationControlEnabled(first)) {
            const before = visibleAssetLinksSignature();
            first.click();
            await waitForPpePageChange(before);
            if (progress) progress('Moved to first PPE page…');
            return;
        }

        // Otherwise walk backward until Previous is disabled.
        for (let guard = 0; guard < 250; guard++) {
            const previous = getPaginationControl('previous');
            if (!paginationControlEnabled(previous)) return;
            const before = visibleAssetLinksSignature();
            previous.click();
            await waitForPpePageChange(before);
            if (progress) progress(`Finding first PPE page… ${guard + 1}`);
        }
        throw new Error('Stopped after 250 previous-page steps while locating the first PPE page.');
    }

    function scanCurrentPpePagePeople() {
        const root = getPpeResultsContainer() || document;
        const anchors = getVisiblePpeAnchors(root);
        const byPrefix = new Map();

        for (const anchor of anchors) {
            const assetId = genericAssetIdFromAnchor(anchor);
            if (!assetId) continue;

            const prefix = prefixFromAssetId(assetId);
            if (!prefix) continue;

            const row = ppeRowForAnchor(anchor);
            const name = clean(likelyPersonFromPpeRow(row, assetId));
            if (!name) continue;

            const cells = rowCellTexts(row);
            const ppeType = cells.map(normalizedPpeTypeText).find(Boolean) || '';
            const sample = { assetId, ppeType };

            const old = byPrefix.get(prefix);
            if (!old) {
                byPrefix.set(prefix, {
                    name,
                    prefix,
                    nameVariants: [name],
                    assetCount: 1,
                    assetSample: assetId,
                    equipmentSamples: [sample]
                });
            } else {
                old.assetCount += 1;
                old.nameVariants ||= [old.name];
                if (!old.nameVariants.some(value => masterNameKey(value) === masterNameKey(name))) {
                    old.nameVariants.push(name);
                }
                if (!old.equipmentSamples.some(x => x.assetId === assetId) && old.equipmentSamples.length < 12) {
                    old.equipmentSamples.push(sample);
                }
                // Keep one display name, but retain every distinct name as review evidence.
                if (name.length > old.name.length) old.name = name;
            }
        }

        return {
            people: [...byPrefix.values()],
            visibleAssetCount: anchors.length
        };
    }

    function findVectorNavigationTarget(label) {
        const wanted = uiText(label).toLowerCase();
        const candidates = [...document.querySelectorAll(
            'a[href],button,[role="button"],[role="tab"],[role="menuitem"]'
        )].filter(el => {
            if (!visible(el)) return false;
            if (el.closest?.(`#${PANEL_ID}`) || el.closest?.(`#${OVERLAY_ID}`)) return false;
            return uiText(el.innerText || el.textContent || '').toLowerCase() === wanted;
        });

        if (!candidates.length) return null;

        return candidates.find(el => el.tagName === 'A' && el.getAttribute('href')) ||
            candidates.find(el => el.getAttribute('role') === 'tab') ||
            candidates[0];
    }

    function vectorControlLooksActive(control) {
        if (!control) return false;

        const selected =
            control.getAttribute('aria-selected') === 'true' ||
            control.getAttribute('aria-current') === 'page' ||
            control.getAttribute('aria-current') === 'true';

        const selfClasses = String(control.className || '').toLowerCase();
        const parentClasses = String(control.parentElement?.className || '').toLowerCase();
        const classActive = [selfClasses, parentClasses].some(value =>
            /\b(active|selected|current)\b/.test(value)
        );

        return selected || classActive;
    }

    function ppeListHasPpeAssets() {
        const root = getPpeResultsContainer() || document;
        return getVisiblePpeAnchors(root).length > 0;
    }

    function isConfirmedPpeEquipmentPage() {
        const ppe = findVectorNavigationTarget('PPE');
        if (ppe && vectorControlLooksActive(ppe) && getSearchInput() && getPpeResultsContainer()) {
            return true;
        }

        // PPE asset links are a stronger signal than generic Equipment search/results.
        if (ppeListHasPpeAssets() && getSearchInput() && getPpeResultsContainer()) return true;

        // Some Vector builds expose PPE in the route while the tab has no ARIA state.
        return /\/equipment\/ppe(?:\/|$)/i.test(location.pathname) &&
            !!getSearchInput() &&
            !!getPpeResultsContainer();
    }

    async function waitForPpeListReady(timeoutMs = 12000) {
        const started = Date.now();
        while (Date.now() - started < timeoutMs) {
            if (isConfirmedPpeEquipmentPage()) return true;
            await sleep(200);
        }
        return false;
    }

    async function waitForVectorNavigationTarget(label, timeoutMs = 10000) {
        const started = Date.now();
        while (Date.now() - started < timeoutMs) {
            const target = findVectorNavigationTarget(label);
            if (target) return target;
            await sleep(180);
        }
        return null;
    }

    async function ensurePpeEquipmentPage(progress = null) {
        if (getRun()) {
            throw new Error(
                'An inspection run is active. Finish or abort that run before Vector Rebel navigates away.'
            );
        }

        if (isConfirmedPpeEquipmentPage()) {
            if (progress) progress('Already on Equipment → PPE.');
            return true;
        }

        if (progress) progress('Opening Vector Equipment…');
        const equipment = findVectorNavigationTarget('Equipment');
        if (!equipment) {
            throw new Error(
                'Vector Rebel could not find Vector’s Equipment navigation control on this page.'
            );
        }
        equipment.click();

        // IMPORTANT: Equipment normally opens "Standard". Do not treat the
        // generic Equipment search/results container as PPE. Wait for the PPE
        // tab and explicitly select it.
        const ppe = await waitForVectorNavigationTarget('PPE', 10000);
        if (!ppe) {
            throw new Error(
                'Vector Rebel opened Equipment but could not find the PPE tab.'
            );
        }

        if (!vectorControlLooksActive(ppe) || !isConfirmedPpeEquipmentPage()) {
            if (progress) progress('Opening Equipment → PPE…');
            ppe.click();
        }

        if (await waitForPpeListReady(15000)) {
            if (progress) progress('Equipment → PPE opened.');
            return true;
        }

        // One retry covers Vector cases where the first tab click only focuses
        // the tab instead of changing the SPA view.
        const retryPpe = findVectorNavigationTarget('PPE');
        if (retryPpe) {
            retryPpe.click();
            if (await waitForPpeListReady(10000)) {
                if (progress) progress('Equipment → PPE opened.');
                return true;
            }
        }

        throw new Error(
            'Vector Rebel could not confirm Equipment → PPE. The requested action was not started.'
        );
    }

    async function scanPpeRosterCandidates(progress = null) {
        await ensurePpeEquipmentPage(progress);

        const search = getSearchInput();
        const root = getPpeResultsContainer();
        if (!search || !root) {
            throw new Error('Vector Rebel could not confirm the Equipment → PPE list. No scan was started.');
        }

        const originalSearch = search.value || '';
        if (clean(originalSearch)) {
            nativeSetInput(search, '');
            const started = Date.now();
            let prior = '';
            let stable = 0;
            while (Date.now() - started < 8000) {
                await sleep(180);
                const current = visibleAssetLinksSignature();
                if (current === prior && current) stable += 1;
                else {
                    prior = current;
                    stable = 0;
                }
                if (stable >= 4) break;
            }
        }

        if (progress) progress('Reading the complete PPE list…');
        await goToFirstPpePage(progress);

        const peopleByPrefix = new Map();
        const seenPageSignatures = new Set();
        let pageCount = 0;
        let assetCount = 0;

        for (let guard = 0; guard < 300; guard++) {
            const signature = visibleAssetLinksSignature();
            if (!signature) {
                throw new Error('No PPE asset rows were visible while scanning.');
            }
            if (seenPageSignatures.has(signature)) {
                throw new Error('Vector pagination repeated a page while scanning. Scan stopped instead of returning an incomplete list.');
            }
            seenPageSignatures.add(signature);

            pageCount += 1;
            const page = scanCurrentPpePagePeople();
            assetCount += page.visibleAssetCount;

            for (const person of page.people) {
                const old = peopleByPrefix.get(person.prefix);
                if (!old) {
                    peopleByPrefix.set(person.prefix, {
                        ...person,
                        equipmentSamples: [...(person.equipmentSamples || [])]
                    });
                } else {
                    old.assetCount += person.assetCount;
                    old.nameVariants ||= [old.name];
                    for (const variant of person.nameVariants || [person.name]) {
                        if (!old.nameVariants.some(value => masterNameKey(value) === masterNameKey(variant))) {
                            old.nameVariants.push(variant);
                        }
                    }
                    if (person.name.length > old.name.length) old.name = person.name;
                    for (const sample of person.equipmentSamples || []) {
                        old.equipmentSamples ||= [];
                        if (!old.equipmentSamples.some(x => x.assetId === sample.assetId) && old.equipmentSamples.length < 12) {
                            old.equipmentSamples.push(sample);
                        }
                    }
                }
            }

            if (progress) {
                progress(`Scanning PPE page ${pageCount} · ${peopleByPrefix.size} people found · ${assetCount} gear items read`);
            }

            const next = getPaginationControl('next');
            if (!paginationControlEnabled(next)) break;

            const before = signature;
            next.click();
            await waitForPpePageChange(before);
        }

        // Restore the user's search text. We intentionally do not attempt to recreate
        // the exact starting page because Vector may reset pagination when search changes.
        if (clean(originalSearch)) {
            nativeSetInput(search, originalSearch);
        }

        const config = getConfig();
        const savedByPrefix = new Map((config.peopleDirectory || []).map(p => [p.prefix, p]));
        const rawPeople = [...peopleByPrefix.values()]
            .map(person => {
                const saved = savedByPrefix.get(person.prefix);
                return {
                    ...person,
                    name: clean(person.name || saved?.name || titleCasePrefix(person.prefix)),
                };
            });

        const cleaned = normalizeMasterRoster(rawPeople);
        const people = cleaned.people;

        if (!people.length) {
            throw new Error('The PPE list was scanned, but no assigned personnel names could be read from the gear rows.');
        }

        return {
            people,
            pageCount,
            visibleAssetCount: assetCount,
            rejected: cleaned.rejected,
            merged: cleaned.merged,
            rawUniqueCandidates: rawPeople.length,
            needsReview: rosterNeedsReview(rawPeople)
        };
    }

    // ============================================================
    // SETTINGS / PEOPLE DIRECTORY / SAVED CAPTAIN LIST
    // ============================================================

    function peopleDirectoryToText(people) {
        return (people || []).map(p => `${p.name}|${p.prefix}`).join('\n');
    }

    function parsePeopleDirectory(text) {
        const result = [];
        const seenPrefixes = new Set();
        for (const rawLine of String(text || '').split(/\r?\n/)) {
            if (!clean(rawLine)) continue;
            const [nameRaw, prefixRaw] = rawLine.split('|');
            const name = clean(nameRaw);
            const prefix = clean(prefixRaw).toUpperCase();
            if (!name || !prefix) throw new Error(`Invalid People Directory line: ${rawLine}`);
            if (!/^[A-Z0-9]+(?:-[A-Z0-9]+)*$/.test(prefix)) {
                throw new Error(`${prefix}: gear prefix may contain only letters, numbers, and internal hyphens.`);
            }
            if (seenPrefixes.has(prefix)) throw new Error(`Duplicate gear prefix in People Directory: ${prefix}`);
            for (const old of seenPrefixes) {
                if (prefixesOverlap(prefix, old)) {
                    throw new Error(`Overlapping gear prefixes are not allowed: ${old} and ${prefix}.`);
                }
            }
            seenPrefixes.add(prefix);
            result.push({ name, prefix });
        }
        return result;
    }

    function captainSetsToText(sets) {
        return (sets || []).map(set =>
            `${set.name}|${(set.memberPrefixes || []).join(',')}`
        ).join('\n');
    }

    function parseCaptainSetsText(text, peopleDirectory, existingSets = []) {
        const validPrefixes = new Set((peopleDirectory || []).map(p => p.prefix));
        const existingByName = new Map((existingSets || []).map(s => [clean(s.name).toLowerCase(), s]));
        const result = [];
        const seenNames = new Set();

        for (const rawLine of String(text || '').split(/\r?\n/)) {
            if (!clean(rawLine)) continue;
            const pipe = rawLine.indexOf('|');
            if (pipe < 0) throw new Error(`Invalid Captain set line: ${rawLine}`);

            const name = clean(rawLine.slice(0, pipe));
            const membersRaw = rawLine.slice(pipe + 1);
            if (!name) throw new Error(`Captain set name is missing: ${rawLine}`);
            if (seenNames.has(name.toLowerCase())) throw new Error(`Duplicate Captain set name: ${name}`);

            const memberPrefixes = [...new Set(
                membersRaw.split(',')
                    .map(x => clean(x).toUpperCase())
                    .filter(Boolean)
            )];
            const existing = existingByName.get(name.toLowerCase());
            result.push({
                id: existing?.id || `set-${Date.now()}-${result.length}-${Math.random().toString(36).slice(2, 8)}`,
                name,
                memberPrefixes,
                orphanedPrefixes: memberPrefixes.filter(prefix => !validPrefixes.has(prefix))
            });
            seenNames.add(name.toLowerCase());
        }
        return result;
    }

    function localAssetRulesToText(rules) {
        return Object.values(rules || {})
            .sort((a, b) => `${a.ownerPrefix}::${a.assetId}`.localeCompare(`${b.ownerPrefix}::${b.assetId}`))
            .map(rule =>
                `${rule.ownerPrefix}|${rule.assetId}|${String(rule.q1 || 'pass').toUpperCase()}|${String(rule.q2 || 'pass').toUpperCase()}|${rule.note || ''}${rule.expiresAt ? `|${rule.expiresAt}` : ''}`
            )
            .join('\n');
    }

    function parseLocalAssetRulesText(text, fallbackOwnerPrefix = '') {
        const out = {};
        for (const rawLine of String(text || '').split(/\r?\n/)) {
            if (!clean(rawLine)) continue;
            const parts = rawLine.split('|');

            let ownerPrefix, assetId, q1, q2, noteParts;
            if (parts.length >= 3 && ['pass', 'fail'].includes(clean(parts[1]).toLowerCase())) {
                // Legacy rc1/v2-style: AssetID|Q1|Q2|Note. Scope it to the local inspector.
                ownerPrefix = clean(fallbackOwnerPrefix).toUpperCase();
                assetId = clean(parts[0]).toUpperCase();
                q1 = clean(parts[1]).toLowerCase();
                q2 = clean(parts[2]).toLowerCase();
                noteParts = parts.slice(3);
            } else {
                if (parts.length < 5) throw new Error(`Invalid local asset rule line: ${rawLine}`);
                ownerPrefix = clean(parts[0]).toUpperCase();
                assetId = clean(parts[1]).toUpperCase();
                q1 = clean(parts[2]).toLowerCase();
                q2 = clean(parts[3]).toLowerCase();
                noteParts = parts.slice(4);
            }

            if (!ownerPrefix) throw new Error(`${assetId || rawLine}: local rule needs an owner prefix.`);
            if (!assetId) throw new Error(`Missing asset ID in local rule: ${rawLine}`);
            if (!assetId.startsWith(`${ownerPrefix}-`)) {
                throw new Error(`${assetId}: asset ID does not start with its rule owner prefix ${ownerPrefix}-.`);
            }
            if (!['pass', 'fail'].includes(q1) || !['pass', 'fail'].includes(q2)) {
                throw new Error(`${assetId}: Q1 and Q2 must be PASS or FAIL.`);
            }

            let expiresAt = '';
            if (noteParts.length > 1 && /^\d{4}-\d{2}-\d{2}$/.test(clean(noteParts[noteParts.length - 1]))) {
                expiresAt = clean(noteParts.pop());
            }
            const note = clean(noteParts.join('|'));
            if ((q1 === 'fail' || q2 === 'fail') && !note) {
                throw new Error(`${assetId}: a local default containing FAIL must include a Failure Note.`);
            }
            out[localRuleKey(ownerPrefix, assetId)] = { ownerPrefix, assetId, q1, q2, note, expiresAt };
        }
        return out;
    }

    function showPeopleSetsManager() {
        const { overlay, box } = makeOverlayBox('820px');

        const title = document.createElement('div');
        title.style.cssText = 'font-size:21px;font-weight:700;margin-bottom:7px;';
        title.textContent = 'Available People';
        box.appendChild(title);

        const help = document.createElement('div');
        help.style.cssText = 'font-size:12px;background:#eef5fb;padding:9px;margin-bottom:10px;line-height:1.45;';
        help.innerHTML =
            '<b>This is the list of people who can be added to your Captain list.</b> ' +
            'Your actual Captain list is chosen with simple ADD / REMOVE buttons in Captain mode and stays saved on this computer.';
        box.appendChild(help);

        const listHost = document.createElement('div');
        box.appendChild(listHost);

        function renderPeople() {
            const config = getConfig();
            listHost.innerHTML = '';

            if (!config.peopleDirectory.length) {
                const none = document.createElement('div');
                none.style.cssText = 'padding:10px;background:#fff4e5;border-radius:5px;font-size:12px;';
                none.textContent = 'No people have been added yet.';
                listHost.appendChild(none);
            }

            config.peopleDirectory.forEach(person => {
                const row = document.createElement('div');
                row.style.cssText = 'display:flex;gap:8px;align-items:center;padding:9px;margin:4px 0;border:1px solid #ddd;border-radius:5px;';
                const text = document.createElement('div');
                text.style.cssText = 'flex:1;';
                text.innerHTML = `<b>${escapeHtml(person.name)}</b><br><span style="font-size:11px;color:#666">${escapeHtml(person.prefix)}</span>`;

                const edit = makeButton('EDIT', { margin: '0' });
                edit.onclick = () => {
                    const name = prompt('Name', person.name);
                    if (name === null) return;
                    const prefix = prompt('Gear prefix', person.prefix);
                    if (prefix === null) return;
                    try {
                        const configNow = cloneConfig();
                        const oldPrefix = person.prefix;
                        const newPrefix = clean(prefix).toUpperCase();
                        if (!clean(name) || !newPrefix) throw new Error('Name and gear prefix are required.');
                        if (!/^[A-Z0-9]+(?:-[A-Z0-9]+)*$/.test(newPrefix)) throw new Error('Gear prefix may contain only letters, numbers, and internal hyphens.');
                        if (newPrefix !== oldPrefix && configNow.peopleDirectory.some(p => p.prefix === newPrefix)) {
                            throw new Error(`Gear prefix ${newPrefix} is already assigned to another person.`);
                        }
                        const nextPeople = configNow.peopleDirectory.map(p => p.prefix === oldPrefix
                            ? { name: clean(name), prefix: newPrefix }
                            : p
                        );
                        const validated = assertNoPrefixOverlap(nextPeople);
                        configNow.peopleDirectory = validated;
                        configNow.captainRosterPrefixes = (configNow.captainRosterPrefixes || []).map(p => p === oldPrefix ? newPrefix : p);
                        configNow.captainSets = normalizeCaptainSets(configNow.captainSets, validated);
                        saveConfig(configNow);
                        renderPeople();
                        refreshPanelInfo();
                    } catch (error) {
                        alert(error.message);
                    }
                };

                const remove = makeButton('REMOVE', { background: '#fff0f0', margin: '0' });
                remove.onclick = () => {
                    if (!confirm(`Remove ${person.name} (${person.prefix}) from Available People?`)) return;
                    const configNow = cloneConfig();
                    configNow.peopleDirectory = configNow.peopleDirectory.filter(p => p.prefix !== person.prefix);
                    configNow.captainRosterPrefixes = (configNow.captainRosterPrefixes || []).filter(p => p !== person.prefix);
                    configNow.captainSets = normalizeCaptainSets(configNow.captainSets, configNow.peopleDirectory);
                    saveConfig(configNow);
                    renderPeople();
                    refreshPanelInfo();
                };

                row.append(text, edit, remove);
                listHost.appendChild(row);
            });
        }

        const addTitle = document.createElement('div');
        addTitle.style.cssText = 'font-size:16px;font-weight:700;margin:14px 0 6px;';
        addTitle.textContent = 'Add a person';
        box.appendChild(addTitle);

        const form = document.createElement('div');
        form.style.cssText = 'display:grid;grid-template-columns:2fr 1.2fr auto;gap:6px;align-items:end;margin-bottom:10px;';
        const makeMiniField = (label, placeholder) => {
            const wrap = document.createElement('label');
            wrap.style.cssText = 'font-size:11px;font-weight:700;';
            const input = document.createElement('input');
            input.placeholder = placeholder;
            input.style.cssText = 'display:block;width:100%;box-sizing:border-box;padding:7px;margin-top:3px;';
            wrap.append(document.createTextNode(label), input);
            return { wrap, input };
        };
        const nameF = makeMiniField('Name', 'Jane Smith');
        const prefixF = makeMiniField('Gear prefix', 'SMITH');
        const add = makeButton('+ ADD PERSON', { background: '#e8f2e8', margin: '0' });
        add.onclick = () => {
            try {
                const name = clean(nameF.input.value);
                const prefix = clean(prefixF.input.value).toUpperCase();
                if (!name || !prefix) throw new Error('Name and gear prefix are required.');
                if (!/^[A-Z0-9]+(?:-[A-Z0-9]+)*$/.test(prefix)) throw new Error('Gear prefix may contain only letters, numbers, and internal hyphens.');
                const configNow = cloneConfig();
                if (configNow.peopleDirectory.some(p => p.prefix === prefix)) {
                    throw new Error(`Gear prefix ${prefix} is already assigned to another person.`);
                }
                const nextPeople = assertNoPrefixOverlap([...configNow.peopleDirectory, { name, prefix }]);
                configNow.peopleDirectory = nextPeople;
                saveConfig(configNow);
                nameF.input.value = '';
                prefixF.input.value = '';
                renderPeople();
                refreshPanelInfo();
            } catch (error) {
                alert(error.message);
            }
        };
        form.append(nameF.wrap, prefixF.wrap, add);
        box.appendChild(form);

        const captain = makeButton('OPEN MY CAPTAIN LIST', { background: '#e8f2e8' });
        captain.onclick = () => {
            overlay.remove();
            showCaptainOwnerPicker();
        };
        const close = makeButton('Close');
        close.onclick = () => overlay.remove();
        box.append(captain, close);

        renderPeople();
    }

    function showAdvancedAdminSettings() {
        if (!requireAdmin('Advanced settings')) return;
        const config = getConfig();
        const { overlay, box } = makeOverlayBox('800px');

        box.innerHTML = '<div style="font-size:21px;font-weight:700;margin-bottom:10px">Vector Rebel — Admin / Advanced Settings</div>';

        const field = (label, value, type = 'text') => {
            const wrap = document.createElement('label');
            wrap.style.cssText = 'display:block;margin:8px 0;font-weight:700;';
            wrap.textContent = label;
            const input = document.createElement('input');
            input.type = type;
            input.value = value;
            input.style.cssText = 'display:block;width:100%;box-sizing:border-box;padding:8px;margin-top:4px;font-weight:400;';
            wrap.appendChild(input);
            box.appendChild(wrap);
            return input;
        };

        const inspector = field('Inspector name — whose own signatures are stored on this computer', config.inspectorName);
        const selfPrefix = field('My gear prefix', config.selfPrefix);
        const coatComment = field('My Tour Bunker Coat assignment comment', config.tourCoatComment);
        const expectedCount = field('Normal expected PPE item count per person — warning only, never a hard requirement', String(getExpectedGearCount(config)), 'number');
        expectedCount.min = '0';
        expectedCount.step = '1';

        const profileScope = field('Department Profile scope ID — keep the CVFM value for this department', config.departmentProfile.profileScope || '');
        const builtinsLabel = document.createElement('label');
        builtinsLabel.style.cssText = 'display:flex;gap:8px;align-items:flex-start;margin:8px 0;padding:8px;background:#fff4e5;border:1px solid #d49b42;';
        const replaceBuiltins = document.createElement('input');
        replaceBuiltins.type = 'checkbox';
        replaceBuiltins.checked = config.departmentProfile.replaceBuiltins === true;
        const builtinsText = document.createElement('span');
        builtinsText.innerHTML = '<b>Use ONLY mappings explicitly stored in this Department Profile.</b> Enable this for another department instead of inheriting the built-in CVFM mappings.';
        builtinsLabel.append(replaceBuiltins, builtinsText);
        box.appendChild(builtinsLabel);

        const localRulesLabel = document.createElement('label');
        localRulesLabel.style.cssText = 'display:block;margin:12px 0 8px;font-weight:700;';
        localRulesLabel.textContent = 'My local asset defaults — OwnerPrefix|AssetID|Q1 PASS/FAIL|Q2 PASS/FAIL|Failure Note|Expiry(optional YYYY-MM-DD)';
        const localRules = document.createElement('textarea');
        localRules.value = localAssetRulesToText(config.localAssetRules);
        localRules.placeholder = 'SMITH|SMITH-12345|FAIL|FAIL|I do not have this item|2026-12-31';
        localRules.style.cssText = 'display:block;width:100%;height:120px;box-sizing:border-box;padding:8px;margin-top:4px;font-family:Consolas,monospace;font-weight:400;';
        localRulesLabel.appendChild(localRules);
        box.appendChild(localRulesLabel);

        const localNote = document.createElement('div');
        localNote.style.cssText = 'font-size:12px;background:#f5f6f7;padding:9px;margin:8px 0;line-height:1.45;';
        localNote.innerHTML =
            '<b>Personal/local data:</b> Inspector identity, signatures, My gear prefix, Tour coat comment, your saved Captain list, and local asset defaults stay on this browser. ' +
            'Existing v2.2 personal failure defaults are migrated here automatically.';
        box.appendChild(localNote);

        const people = makeButton(`PEOPLE / CAPTAIN LIST (${config.peopleDirectory.length} available / ${config.captainRosterPrefixes.length} on my list)`);
        people.onclick = () => {
            overlay.remove();
            showPeopleSetsManager();
        };
        box.appendChild(people);

        const deptTitle = document.createElement('div');
        deptTitle.style.cssText = 'font-size:16px;font-weight:700;margin:16px 0 5px;';
        deptTitle.textContent = 'Department Profile Sharing';
        box.appendChild(deptTitle);

        const deptNote = document.createElement('div');
        deptNote.style.cssText = 'font-size:12px;background:#eef5fb;padding:9px;margin:6px 0;line-height:1.45;';
        deptNote.innerHTML =
            `The Department Profile contains the People Directory, PPE pool/type mappings, inspection template IDs, profile scope, and the normal expected gear count. ` +
            '<b>It never contains signatures, local inspector identity, your personal Captain list, local asset rules, gear snapshots, diagnostics, or run history.</b>';
        box.appendChild(deptNote);

        const exportProfile = makeButton('EXPORT DEPARTMENT PROFILE');
        exportProfile.onclick = exportDepartmentProfile;

        const importProfile = makeButton('IMPORT DEPARTMENT PROFILE');
        const importFile = document.createElement('input');
        importFile.type = 'file';
        importFile.accept = '.json,application/json';
        importFile.style.display = 'none';
        importFile.onchange = async () => {
            const file = importFile.files?.[0];
            if (!file) return;
            try {
                const incoming = await readDepartmentProfileFile(file);
                showDepartmentImportPreview(incoming, overlay);
            } catch (error) {
                alert(error.message);
            } finally {
                importFile.value = '';
            }
        };
        importProfile.onclick = () => importFile.click();
        box.append(exportProfile, importProfile, importFile);

        const save = makeButton('SAVE LOCAL SETTINGS', { background: '#e8f2e8' });
        save.onclick = () => {
            try {
                const next = cloneConfig();
                next.initialized = true;
                next.inspectorName = clean(inspector.value);
                next.selfPrefix = clean(selfPrefix.value).toUpperCase();
                next.tourCoatComment = clean(coatComment.value);
                next.localAssetRules = parseLocalAssetRulesText(localRules.value, next.selfPrefix);

                const expected = Number(expectedCount.value);
                if (!Number.isInteger(expected) || expected < 0) {
                    throw new Error('Expected PPE item count must be a whole number 0 or greater.');
                }
                next.departmentProfile.expectedGearCount = expected;
                const oldScope = clean(config.departmentProfile.profileScope);
                const newScope = clean(profileScope.value);
                next.departmentProfile.profileScope = newScope;
                next.departmentProfile.replaceBuiltins = replaceBuiltins.checked;

                if (!newScope) throw new Error('Department Profile scope ID is required.');
                if (newScope !== oldScope && newScope !== BUILTIN_PROFILE_SCOPE) {
                    const proceed = confirm(
                        'You changed the Department Profile scope away from the built-in CVFM scope.\n\n' +
                        'For safety, the current CVFM pool/template mappings will be cleared and runs will remain blocked until a profile for the new department is imported. Continue?'
                    );
                    if (!proceed) return;
                    next.departmentProfile.replaceBuiltins = true;
                    next.departmentProfile.poolTypes = {};
                    next.departmentProfile.modeTemplates = { tour: {}, afterFire: {}, captain: {} };
                }

                if (!next.inspectorName) throw new Error('Inspector name is required.');
                if (!next.selfPrefix) throw new Error('My gear prefix is required.');

                saveConfig(next);
                overlay.remove();
                refreshPanelInfo();
                setStatus('Local settings saved.');
            } catch (error) {
                alert(error.message);
            }
        };

        const close = makeButton('Cancel');
        close.onclick = () => overlay.remove();
        box.append(save, close);
    }


    // ============================================================
    // VECTOR REBEL SETTINGS — NORMAL USER SHELL
    // ============================================================

    function showSettings(initialTab = 'profile') {
        const { overlay, box } = makeOverlayBox('920px');
        box.style.padding = '0';
        box.style.overflow = 'hidden';

        const header = document.createElement('div');
        header.style.cssText =
            'padding:18px 20px 14px;background:#153e5c;color:#fff;' +
            'display:flex;align-items:center;justify-content:space-between;gap:12px;';
        const headerText = document.createElement('div');
        headerText.innerHTML =
            `<div style="font-size:22px;font-weight:700;letter-spacing:.1px">Vector Rebel Settings</div>` +
            `<div style="font-size:11px;opacity:.82;margin-top:3px">v${escapeHtml(VERSION)} · settings and personal data stay on this browser</div>`;
        const closeX = document.createElement('button');
        closeX.type = 'button';
        closeX.textContent = '×';
        closeX.setAttribute('aria-label', 'Close settings');
        closeX.style.cssText =
            'border:0;background:transparent;color:#fff;font:400 28px/1 Arial,sans-serif;cursor:pointer;padding:2px 6px;';
        closeX.onclick = () => overlay.remove();
        header.append(headerText, closeX);

        const tabBar = document.createElement('div');
        tabBar.style.cssText =
            'display:flex;gap:4px;flex-wrap:wrap;padding:10px 14px;background:#edf3f6;border-bottom:1px solid #d5e1e8;';

        const content = document.createElement('div');
        content.style.cssText = 'padding:18px 20px;max-height:72vh;overflow:auto;background:#fff;';

        box.append(header, tabBar, content);

        const tabs = [
            ['profile', 'Profile'],
            ['captain', 'Captain Sets'],
            ['signatures', 'Signatures'],
            ['history', 'History'],
            ['general', 'General']
        ];
        if (isAdminUnlocked()) tabs.push(['admin', 'Admin']);

        let active = tabs.some(([key]) => key === initialTab) ? initialTab : 'profile';

        function card(title, bodyText = '') {
            const wrap = document.createElement('div');
            wrap.style.cssText =
                'border:1px solid #d9e3ea;border-radius:10px;padding:14px;margin:0 0 12px;background:#fff;';
            if (title) {
                const h = document.createElement('div');
                h.style.cssText = 'font-size:15px;font-weight:700;color:#153e5c;margin-bottom:5px;';
                h.textContent = title;
                wrap.appendChild(h);
            }
            if (bodyText) {
                const p = document.createElement('div');
                p.style.cssText = 'font-size:12px;line-height:1.45;color:#607483;';
                p.textContent = bodyText;
                wrap.appendChild(p);
            }
            return wrap;
        }

        function field(label, value = '', options = {}) {
            const wrap = document.createElement('label');
            wrap.style.cssText = 'display:block;font-size:12px;font-weight:700;color:#294f69;margin:9px 0;';
            wrap.appendChild(document.createTextNode(label));
            const input = document.createElement('input');
            input.type = options.type || 'text';
            input.value = value ?? '';
            input.placeholder = options.placeholder || '';
            input.style.cssText =
                'display:block;width:100%;box-sizing:border-box;margin-top:5px;padding:10px 11px;' +
                'border:1px solid #bdccd7;border-radius:7px;background:#fff;color:#18384f;font:400 13px Arial,sans-serif;';
            wrap.appendChild(input);
            return { wrap, input };
        }

        function tabButton(key, label) {
            const b = document.createElement('button');
            b.type = 'button';
            b.textContent = label;
            b.style.cssText =
                'padding:8px 11px;border-radius:7px;border:1px solid transparent;' +
                'font:600 12px Arial,sans-serif;cursor:pointer;';
            const selected = key === active;
            b.style.background = selected ? '#ffffff' : 'transparent';
            b.style.color = selected ? '#153e5c' : '#5a7180';
            b.style.borderColor = selected ? '#c8d6df' : 'transparent';
            b.onclick = () => {
                active = key;
                renderTabs();
                renderContent();
            };
            return b;
        }

        function renderTabs() {
            tabBar.innerHTML = '';
            tabs.forEach(([key, label]) => tabBar.appendChild(tabButton(key, label)));
        }

        function renderProfile() {
            const config = getConfig();
            const intro = card('My Profile', 'This identifies the inspector using this computer. Signatures stored here must belong only to this person.');
            const name = field('Name', config.inspectorName, { placeholder: 'First Last' });
            const prefix = field('My PPE asset prefix', config.selfPrefix, { placeholder: 'SMITH' });
            const coat = field('Tour Bunker Coat assignment comment', config.tourCoatComment, { placeholder: 'Name / identifier written into the coat inspection' });
            intro.append(name.wrap, prefix.wrap, coat.wrap);

            const save = makeButton('Save Profile', { background: '#176b8e', color: '#fff' });
            save.onclick = () => {
                try {
                    const next = cloneConfig();
                    const oldPrefix = next.selfPrefix;
                    const newName = clean(name.input.value);
                    const newPrefix = clean(prefix.input.value).toUpperCase();
                    if (!newName) throw new Error('Name is required.');
                    if (!newPrefix) throw new Error('My PPE asset prefix is required.');
                    if (!/^[A-Z0-9]+(?:-[A-Z0-9]+)*$/.test(newPrefix)) {
                        throw new Error('PPE prefix may contain only letters, numbers, and internal hyphens.');
                    }

                    // If this inspector already exists in the locally saved People list, keep that record synchronized.
                    const selfIndex = next.peopleDirectory.findIndex(p => p.prefix === oldPrefix);
                    if (selfIndex >= 0) {
                        if (newPrefix !== oldPrefix && next.peopleDirectory.some((p, i) => i !== selfIndex && p.prefix === newPrefix)) {
                            throw new Error(`PPE prefix ${newPrefix} is already assigned to another saved person.`);
                        }
                        next.peopleDirectory[selfIndex] = { name: newName, prefix: newPrefix };
                        next.captainSets = (next.captainSets || []).map(set => ({
                            ...set,
                            memberPrefixes: (set.memberPrefixes || []).map(p => p === oldPrefix ? newPrefix : p)
                        }));
                        next.captainRosterPrefixes = (next.captainRosterPrefixes || []).map(p => p === oldPrefix ? newPrefix : p);
                    }

                    next.initialized = true;
                    next.inspectorName = newName;
                    next.selfPrefix = newPrefix;
                    next.tourCoatComment = clean(coat.input.value);
                    saveConfig(next);
                    refreshPanelInfo();
                    setStatus('Profile saved.');
                    renderContent();
                } catch (error) {
                    alert(error.message);
                }
            };
            intro.appendChild(save);
            content.appendChild(intro);
        }

        function renderCaptainSets() {
            const config = getConfig();
            const rosterState = getMasterRosterState();
            const roster = rosterState.people.filter(person => person.active !== false);

            const c = card(
                'Captain Sets',
                'Choose your crew from the department master roster. Your saved Captain Sets stay only on this computer.'
            );

            const source = document.createElement('div');
            source.style.cssText =
                'padding:9px 10px;margin:8px 0 11px;background:#f3f7f9;border:1px solid #dce7ed;' +
                'border-radius:8px;font-size:11px;line-height:1.45;color:#607483;';
            source.innerHTML =
                `<b>Department roster:</b> ${escapeHtml(rosterState.version)} · ` +
                `${roster.length} active people · ` +
                `${rosterState.source === 'local-admin' ? 'local admin copy' : 'included with Vector Rebel'}`;
            c.appendChild(source);

            if (!roster.length) {
                const empty = document.createElement('div');
                empty.style.cssText =
                    'padding:11px;background:#fff8e8;border:1px solid #ead39a;border-radius:8px;' +
                    'font-size:12px;line-height:1.45;color:#735d2c;';
                empty.textContent =
                    'The department roster has not been embedded in this refinement build yet. ' +
                    'An administrator can create it under Settings → Admin → Master Roster.';
                c.appendChild(empty);
            }

            const controls = document.createElement('div');
            controls.style.cssText = 'display:flex;gap:7px;flex-wrap:wrap;margin:10px 0;';
            const newSet = makeButton('New Captain Set', { background: '#176b8e', color: '#fff' });
            newSet.disabled = !roster.length;
            controls.appendChild(newSet);
            c.appendChild(controls);

            const savedHost = document.createElement('div');
            c.appendChild(savedHost);

            const editor = document.createElement('div');
            editor.style.cssText = 'margin-top:12px;';
            c.appendChild(editor);

            content.appendChild(c);

            let editingSetId = null;
            let creating = false;

            function renderSavedSets() {
                savedHost.innerHTML = '';
                const cfg = getConfig();

                const heading = document.createElement('div');
                heading.style.cssText = 'font-size:13px;font-weight:700;color:#294f69;margin:10px 0 5px;';
                heading.textContent = 'My Saved Captain Sets';
                savedHost.appendChild(heading);

                if (!(cfg.captainSets || []).length) {
                    const empty = document.createElement('div');
                    empty.style.cssText = 'font-size:12px;color:#6a7f8c;padding:8px 0;';
                    empty.textContent = 'No Captain Sets saved on this computer yet.';
                    savedHost.appendChild(empty);
                    return;
                }

                (cfg.captainSets || []).forEach(set => {
                    const members = resolveCaptainSetPeople(set, cfg);
                    const row = document.createElement('div');
                    row.style.cssText =
                        'display:flex;align-items:center;gap:8px;padding:9px 0;border-bottom:1px solid #edf2f5;';
                    const text = document.createElement('div');
                    text.style.flex = '1';
                    text.innerHTML =
                        `<b>${escapeHtml(set.name)}</b><br>` +
                        `<span style="font-size:11px;color:#6b7f8c">${members.length} crew member${members.length === 1 ? '' : 's'}</span>`;

                    const edit = makeButton('Edit');
                    edit.style.cssText += 'padding:6px 9px;font-size:11px;';
                    edit.onclick = () => {
                        editingSetId = set.id;
                        creating = true;
                        renderEditor();
                    };

                    const del = makeButton('Delete', { background: '#fff4f4', color: '#8b2f2f' });
                    del.style.cssText += 'padding:6px 9px;font-size:11px;';
                    del.onclick = () => {
                        if (!confirm(`Delete Captain Set "${set.name}"?`)) return;
                        const next = cloneConfig();
                        next.captainSets = (next.captainSets || []).filter(s => s.id !== set.id);

                        const stillUsed = new Set(next.captainSets.flatMap(s => s.memberPrefixes || []));
                        next.peopleDirectory = (next.peopleDirectory || []).filter(p => stillUsed.has(p.prefix));
                        next.captainRosterPrefixes = [];
                        saveConfig(next);
                        setStatus(`Captain Set "${set.name}" deleted.`);
                        renderSavedSets();
                        editor.innerHTML = '';
                    };
                    row.append(text, edit, del);
                    savedHost.appendChild(row);
                });
            }

            function renderEditor() {
                editor.innerHTML = '';
                if (!creating) return;

                const cfg = getConfig();
                const currentSet = editingSetId
                    ? (cfg.captainSets || []).find(s => s.id === editingSetId)
                    : null;

                const setName = field(
                    'Captain Set name',
                    currentSet?.name || '',
                    { placeholder: 'My Crew' }
                );
                editor.appendChild(setName.wrap);

                const searchWrap = field('Find a person', '', { placeholder: 'Start typing a name…' });
                editor.appendChild(searchWrap.wrap);

                const count = document.createElement('div');
                count.style.cssText = 'font-size:11px;color:#6a7f8c;margin:5px 0;';
                editor.appendChild(count);

                const list = document.createElement('div');
                list.style.cssText =
                    'border:1px solid #d9e3ea;border-radius:8px;padding:4px 9px;max-height:380px;overflow:auto;';
                editor.appendChild(list);

                const selected = new Set(currentSet?.memberPrefixes || []);

                function drawPeople() {
                    const q = clean(searchWrap.input.value).toLowerCase();
                    const filtered = roster.filter(person =>
                        !q ||
                        person.name.toLowerCase().includes(q) ||
                        person.prefix.toLowerCase().includes(q)
                    );

                    count.textContent =
                        `${roster.length} people available · ${filtered.length} shown · ${selected.size} selected`;

                    list.innerHTML = '';
                    filtered.forEach(person => {
                        const row = document.createElement('label');
                        row.style.cssText =
                            'display:flex;align-items:center;gap:10px;padding:8px 2px;' +
                            'border-bottom:1px solid #edf2f5;cursor:pointer;';
                        const cb = document.createElement('input');
                        cb.type = 'checkbox';
                        cb.dataset.personPrefix = person.prefix;
                        cb.checked = selected.has(person.prefix);
                        cb.style.cssText = 'width:18px;height:18px;accent-color:#176b8e;';
                        cb.onchange = () => {
                            if (cb.checked) selected.add(person.prefix);
                            else selected.delete(person.prefix);
                            count.textContent =
                                `${roster.length} people available · ${filtered.length} shown · ${selected.size} selected`;
                        };

                        const text = document.createElement('div');
                        text.style.flex = '1';
                        text.innerHTML = `<b>${escapeHtml(person.name)}</b>`;
                        row.append(cb, text);
                        list.appendChild(row);
                    });
                }

                searchWrap.input.addEventListener('input', drawPeople);
                drawPeople();

                const save = makeButton('Save Captain Set', { background: '#176b8e', color: '#fff' });
                save.style.cssText += 'margin-top:9px;';
                save.onclick = () => {
                    try {
                        const name = clean(setName.input.value);
                        if (!name) throw new Error('Captain Set name is required.');
                        if (!selected.size) throw new Error('Select at least one person.');

                        const latest = cloneConfig();
                        const otherSets = (latest.captainSets || []).filter(s => s.id !== editingSetId);
                        const duplicate = otherSets.find(s => clean(s.name).toLowerCase() === name.toLowerCase());
                        if (duplicate) throw new Error(`A Captain Set named "${name}" already exists.`);

                        const required = new Set(otherSets.flatMap(s => s.memberPrefixes || []));
                        for (const prefix of selected) required.add(prefix);
                        if (latest.selfPrefix) required.add(latest.selfPrefix);
                        for (const rule of Object.values(latest.localAssetRules || {})) {
                            if (rule?.ownerPrefix) required.add(clean(rule.ownerPrefix).toUpperCase());
                        }

                        // Save a small local snapshot for Captain Sets plus any person
                        // still required by My Profile or a local asset rule.
                        const snapshots = [];
                        for (const prefix of required) {
                            const person = rosterPersonByPrefix(prefix);
                            if (!person) continue;
                            snapshots.push({
                                name: person.name,
                                prefix: person.prefix
                            });
                        }
                        latest.peopleDirectory = assertNoPrefixOverlap(snapshots);
                        latest.captainSets = [
                            ...otherSets,
                            {
                                id: editingSetId || `set-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                                name,
                                memberPrefixes: [...selected],
                                orphanedPrefixes: []
                            }
                        ];
                        latest.captainRosterPrefixes = [];
                        saveConfig(latest);

                        creating = false;
                        editingSetId = null;
                        setStatus(`Captain Set "${name}" saved locally with ${selected.size} people.`);
                        renderSavedSets();
                        editor.innerHTML = '';
                    } catch (error) {
                        alert(error.message);
                    }
                };

                const cancel = makeButton('Cancel');
                cancel.style.cssText += 'margin-top:9px;';
                cancel.onclick = () => {
                    creating = false;
                    editingSetId = null;
                    editor.innerHTML = '';
                };

                editor.append(save, cancel);
            }

            newSet.onclick = () => {
                creating = true;
                editingSetId = null;
                renderEditor();
            };

            renderSavedSets();
        }

        function renderSignatures() {
            const config = getConfig();
            const library = getSignatureLibrary();
            const c = card(
                'My Signatures',
                'Only store signatures personally drawn by the inspector using this computer. Vector Rebel rotates genuine saved variants in order.'
            );
            const count = document.createElement('div');
            count.style.cssText = 'font-size:13px;margin:10px 0;color:#294f69;';
            count.innerHTML =
                `<b>${escapeHtml(config.inspectorName || 'This inspector')}</b> · ` +
                `${library.length} saved signature variant${library.length === 1 ? '' : 's'}`;
            c.appendChild(count);
            const manage = makeButton('Manage My Signatures', { background: '#176b8e', color: '#fff' });
            manage.onclick = () => {
                overlay.remove();
                showSignatureManager();
            };
            c.appendChild(manage);
            content.appendChild(c);
        }

        function renderHistory() {
            const last = loadJSON(LAST_SUMMARY_KEY, null);
            const history = getRunHistory();
            const c = card('Inspection History', 'Local helper history only. Vector remains the authoritative inspection record.');
            const stats = document.createElement('div');
            stats.style.cssText = 'font-size:13px;margin:9px 0;color:#294f69;';
            stats.textContent = `${history.length} completed run${history.length === 1 ? '' : 's'} stored locally.`;
            c.appendChild(stats);

            const lastBtn = makeButton('Last Run');
            lastBtn.disabled = !last;
            lastBtn.onclick = () => {
                overlay.remove();
                showRunSummary();
            };
            const histBtn = makeButton('Run History');
            histBtn.disabled = !history.length;
            histBtn.onclick = () => {
                overlay.remove();
                showRunHistory();
            };
            c.append(lastBtn, histBtn);
            content.appendChild(c);
        }

        function renderGeneral() {
            const state = getUpdateState();
            const gate = evaluateRemoteCompatibility(state);
            const manifest = state.manifest || {};

            const updates = card('Updates', 'Updates stay managed through the Mission Vector Check It GitHub Beta channel while v2.3.1 is being refined.');
            const line = document.createElement('div');
            line.style.cssText = 'font-size:12px;line-height:1.55;margin:8px 0;';
            line.innerHTML =
                `<b>Installed:</b> v${escapeHtml(VERSION)}<br>` +
                `<b>Latest known:</b> ${escapeHtml(manifest.latestVersion || 'not checked')}<br>` +
                `<b>Status:</b> ${escapeHtml(gate.message)}`;
            updates.appendChild(line);

            const check = makeButton('Check Now');
            check.onclick = async () => {
                check.disabled = true;
                try {
                    await fetchUpdateManifest(true);
                    setStatus('Update check complete.');
                    renderContent();
                } finally {
                    check.disabled = false;
                }
            };
            const open = makeButton('Open Update');
            open.onclick = () => window.open(UPDATE_INSTALL_URL, '_blank', 'noopener');
            updates.append(check, open);
            content.appendChild(updates);

            const run = getRun();
            const runCard = card('Run Controls', run ? 'An inspection run is currently stored on this browser.' : 'No inspection run is currently active.');
            const abort = makeButton('Abort Active Run', { background: '#fff4f4', color: '#8b2f2f' });
            abort.disabled = !run;
            abort.onclick = () => {
                abortActiveRun();
                renderContent();
            };
            runCard.appendChild(abort);
            content.appendChild(runCard);

            const admin = card(
                'Admin Access',
                isAdminUnlocked()
                    ? 'Admin tools are permanently unlocked on this computer until you lock them.'
                    : 'Diagnostics and advanced engineering controls are hidden. Admin unlock is intended for the owner of this installation.'
            );
            if (isAdminUnlocked()) {
                const lock = makeButton('Lock Admin Tools');
                lock.onclick = () => {
                    lockAdminTools();
                    active = 'general';
                    renderTabs();
                    renderContent();
                };
                admin.appendChild(lock);
            } else {
                const unlock = makeButton('Admin Unlock');
                unlock.onclick = async () => {
                    await requestAdminUnlock(() => {
                        active = 'admin';
                        tabs.splice(tabs.length, 0, ['admin', 'Admin']);
                        renderTabs();
                        renderContent();
                    });
                };
                admin.appendChild(unlock);
            }
            content.appendChild(admin);
        }

        function renderAdmin() {
            if (!isAdminUnlocked()) {
                active = 'general';
                renderTabs();
                renderContent();
                return;
            }

            const rosterCard = card(
                'Master Roster',
                'Admin-only roster maintenance. Refresh Master from PPE can be started from anywhere in Vector; Vector Rebel opens Equipment → PPE automatically before the read-only scan.'
            );

            const rosterStatus = document.createElement('div');
            rosterStatus.style.cssText =
                'font-size:12px;line-height:1.5;margin:8px 0;padding:9px;background:#f3f7f9;border-radius:7px;';
            rosterCard.appendChild(rosterStatus);

            const rosterProgress = document.createElement('div');
            rosterProgress.style.cssText = 'font-size:11px;color:#607483;min-height:16px;margin:5px 0 8px;';
            rosterCard.appendChild(rosterProgress);

            const reviewHost = document.createElement('div');
            reviewHost.style.cssText = 'margin:8px 0 10px;';
            rosterCard.appendChild(reviewHost);

            const renderNeedsReview = () => {
                reviewHost.innerHTML = '';

                const savedReview = loadJSON(MASTER_ROSTER_REVIEW_KEY, null);
                const scannedReview = Array.isArray(savedReview?.result?.needsReview)
                    ? savedReview.result.needsReview
                    : [];
                const scannedByPrefix = new Map(scannedReview.map(item => [item.prefix, item]));

                // Always compute from the current master so this section works even
                // before Michael performs another full scan with the newer build.
                const currentFlags = rosterNeedsReview(getMasterRosterState().people)
                    .map(item => {
                        const scanned = scannedByPrefix.get(item.prefix);
                        return scanned
                            ? { ...item, equipmentSamples: scanned.equipmentSamples || [] }
                            : item;
                    });

                if (!currentFlags.length) {
                    const ok = document.createElement('div');
                    ok.style.cssText =
                        'padding:9px;background:#f3f8f4;border:1px solid #d4e5d8;border-radius:8px;' +
                        'font-size:11px;color:#52705a;';
                    ok.textContent = 'Needs Review: no unusual name / PPE-prefix mappings detected.';
                    reviewHost.appendChild(ok);
                    return;
                }

                const head = document.createElement('div');
                head.style.cssText =
                    'font-size:13px;font-weight:700;color:#8a5a12;margin:9px 0 5px;';
                head.textContent = `Needs Review (${currentFlags.length})`;
                reviewHost.appendChild(head);

                const note = document.createElement('div');
                note.style.cssText =
                    'font-size:11px;line-height:1.4;color:#6a7f8c;margin-bottom:7px;';
                note.textContent =
                    'These people are not being deleted. Their names look valid, but the stored PPE prefix is unusual. You can inspect the person’s actual gear, inspect the suspect prefix, or correct the mapping.';
                reviewHost.appendChild(note);

                currentFlags.forEach(item => {
                    const row = document.createElement('div');
                    row.style.cssText =
                        'padding:9px 10px;margin:6px 0;border:1px solid #ead39a;' +
                        'border-radius:8px;background:#fffaf0;';

                    const text = document.createElement('div');
                    text.style.cssText = 'font-size:12px;line-height:1.45;';
                    const samples = (item.equipmentSamples || [])
                        .map(sample => `${sample.assetId}${sample.ppeType ? ` — ${sample.ppeType}` : ''}`)
                        .join('<br>');
                    text.innerHTML =
                        `<b>${escapeHtml(item.name)}</b> · <code>${escapeHtml(item.prefix)}</code><br>` +
                        `<span style="font-size:11px;color:#7b672e">${item.reasons.map(escapeHtml).join('; ')}</span>` +
                        `${samples ? `<div style="margin-top:5px;font-size:11px;color:#607483"><b>Scanned gear:</b><br>${samples}</div>` : ''}`;

                    const findPerson = makeButton("Find Person's Gear");
                    findPerson.style.cssText += 'padding:6px 9px;font-size:11px;margin-top:6px;';
                    findPerson.onclick = async () => {
                        try {
                            overlay.remove();
                            setStatus(`Opening PPE gear for ${item.name}…`);
                            const result = await searchPpeForRosterReview(item, message => setStatus(message));
                            setStatus(
                                result.matches.length
                                    ? `${item.name}: ${result.matches.length} matching PPE item(s) shown using "${result.term}".`
                                    : `${item.name}: no PPE items matched the full name or suspect prefix ${item.prefix}.`,
                                result.matches.length > 0
                            );
                        } catch (error) {
                            saveDiagnostic(error.message);
                            setStatus(error.message, false);
                        }
                    };

                    const showSuspect = makeButton(`Show ${item.prefix} Gear`);
                    showSuspect.style.cssText += 'padding:6px 9px;font-size:11px;margin-top:6px;';
                    showSuspect.onclick = async () => {
                        try {
                            overlay.remove();
                            setStatus(`Searching PPE for suspect prefix ${item.prefix}…`);
                            const assets = await searchPpeByPrefix(item.prefix, message => setStatus(message));
                            setStatus(
                                assets.length
                                    ? `${item.prefix}: ${assets.length} matching PPE item(s) shown.`
                                    : `${item.prefix}: no matching PPE items were found.`,
                                assets.length > 0
                            );
                        } catch (error) {
                            saveDiagnostic(error.message);
                            setStatus(error.message, false);
                        }
                    };

                    const fix = makeButton('Fix Mapping', { background: '#176b8e', color: '#fff' });
                    fix.style.cssText += 'padding:6px 9px;font-size:11px;margin-top:6px;';
                    fix.onclick = async () => {
                        try {
                            overlay.remove();
                            setStatus(`Finding the actual PPE prefix for ${item.name}…`);
                            const lookup = await findActualPpePrefixCandidates(
                                item,
                                message => setStatus(message)
                            );
                            showPrefixCorrectionDialog(item, lookup);
                        } catch (error) {
                            saveDiagnostic(error.message);
                            setStatus(error.message, false);
                        }
                    };

                    row.append(text, findPerson, showSuspect, fix);
                    reviewHost.appendChild(row);
                });
            };

            const refreshRosterStatus = () => {
                const state = getMasterRosterState();
                rosterStatus.innerHTML =
                    `<b>Current master:</b> ${escapeHtml(state.version)}<br>` +
                    `<b>People:</b> ${state.people.length}<br>` +
                    `<b>Source:</b> ${state.source === 'local-admin' ? 'Local admin-maintained roster' : 'Embedded with Vector Rebel'}<br>` +
                    `${state.updatedAt ? `<b>Updated:</b> ${escapeHtml(state.updatedAt)}<br>` : ''}` +
                    `<span style="color:#6a7f8c">PPE prefixes are kept internally for gear matching.</span>`;
                renderNeedsReview();
            };

            const refreshFromPpe = makeButton('Refresh Master from PPE', { background: '#176b8e', color: '#fff' });
            refreshFromPpe.onclick = async () => {
                refreshFromPpe.disabled = true;
                rosterProgress.textContent = 'Starting read-only PPE roster scan…';
                try {
                    const result = await scanPpeRosterCandidates(message => {
                        rosterProgress.textContent = message;
                    });

                    const prior = getMasterRosterState().people;
                    const priorByName = new Map(prior.map(p => [masterNameKey(p.name), p]));
                    const nextByName = new Map(result.people.map(p => [masterNameKey(p.name), p]));

                    const added = result.people.filter(p => !priorByName.has(masterNameKey(p.name)));
                    const missing = prior.filter(p => !nextByName.has(masterNameKey(p.name)));
                    const prefixChanges = result.people.filter(p => {
                        const old = priorByName.get(masterNameKey(p.name));
                        return old && old.prefix !== p.prefix;
                    });

                    saveJSON(MASTER_ROSTER_REVIEW_KEY, {
                        at: new Date().toISOString(),
                        result,
                        changes: {
                            added: added.map(p => p.name),
                            missing: missing.map(p => p.name),
                            prefixChanges: prefixChanges.map(p => ({
                                name: p.name,
                                oldPrefix: priorByName.get(masterNameKey(p.name))?.prefix || '',
                                newPrefix: p.prefix
                            }))
                        }
                    });

                    const summary =
                        `PPE roster scan complete.\n\n` +
                        `Gear rows read: ${result.visibleAssetCount}\n` +
                        `Pages scanned: ${result.pageCount}\n` +
                        `Raw unique candidates: ${result.rawUniqueCandidates}\n` +
                        `Clean people: ${result.people.length}\n` +
                        `Duplicates merged: ${result.merged.length}\n` +
                        `Rejected non-person values: ${result.rejected.length}\n` +
                        `New people vs current master: ${added.length}\n` +
                        `Missing from scan: ${missing.length}\n` +
                        `Prefix changes: ${prefixChanges.length}\n` +
                        `Needs prefix review: ${result.needsReview.length}\n\n` +
                        `Save this cleaned scan as your local master roster?`;

                    if (!confirm(summary)) {
                        rosterProgress.textContent =
                            `Scan reviewed but not saved. ${result.needsReview.length} unusual prefix mapping(s) are available under Needs Review.`;
                        renderNeedsReview();
                        return;
                    }

                    const saved = saveLocalMasterRoster(result.people, {
                        version: `local-${new Date().toISOString().slice(0, 10)}`,
                        source: 'Vector Equipment PPE scan'
                    });
                    rosterProgress.textContent =
                        `Saved local master: ${saved.people.length} people. ` +
                        `${result.merged.length} duplicate value(s) merged; ${result.rejected.length} non-person value(s) rejected.`;
                    refreshRosterStatus();
                    renderTabs();
                } catch (error) {
                    rosterProgress.textContent = 'Master roster scan stopped.';
                    alert(error.message);
                } finally {
                    refreshFromPpe.disabled = false;
                }
            };

            const editRoster = makeButton('Edit Master Roster');
            editRoster.onclick = () => {
                const current = getMasterRosterState();
                const { overlay: editOverlay, box: editBox } = makeOverlayBox('900px');

                const title = document.createElement('div');
                title.style.cssText = 'font-size:21px;font-weight:700;color:#153e5c;margin-bottom:5px;';
                title.textContent = 'Edit Master Roster';
                editBox.appendChild(title);

                const note = document.createElement('div');
                note.style.cssText = 'font-size:11px;color:#607483;line-height:1.45;margin-bottom:10px;';
                note.textContent =
                    'Changes here stay local until they are incorporated into a Vector Rebel program update. ' +
                    'Normal users do not see this admin screen.';
                editBox.appendChild(note);

                let working = current.people.map(p => ({ ...p }));

                const search = document.createElement('input');
                search.placeholder = 'Find a person…';
                search.style.cssText =
                    'width:100%;box-sizing:border-box;padding:9px 10px;border:1px solid #bdccd7;border-radius:7px;margin-bottom:8px;';
                editBox.appendChild(search);

                const list = document.createElement('div');
                list.style.cssText = 'max-height:55vh;overflow:auto;border:1px solid #d9e3ea;border-radius:8px;padding:4px 9px;';
                editBox.appendChild(list);

                function draw() {
                    list.innerHTML = '';
                    const q = clean(search.value).toLowerCase();
                    working
                        .filter(p => !q || p.name.toLowerCase().includes(q) || p.prefix.toLowerCase().includes(q))
                        .sort((a, b) => a.name.localeCompare(b.name))
                        .forEach(person => {
                            const row = document.createElement('div');
                            row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid #edf2f5;';
                            const text = document.createElement('div');
                            text.style.flex = '1';
                            text.innerHTML =
                                `<b>${escapeHtml(person.name)}</b>` +
                                `<br><span style="font-size:11px;color:#6b7f8c">${escapeHtml(person.prefix)}${person.active === false ? ' · INACTIVE' : ''}</span>`;

                            const edit = makeButton('Edit');
                            edit.style.cssText += 'padding:6px 8px;font-size:11px;';
                            edit.onclick = () => {
                                const name = prompt('Name', person.name);
                                if (name === null) return;
                                const prefix = prompt('PPE prefix', person.prefix);
                                if (prefix === null) return;
                                person.name = clean(name);
                                person.prefix = clean(prefix).toUpperCase();
                                draw();
                            };

                            const toggle = makeButton(person.active === false ? 'Activate' : 'Inactive');
                            toggle.style.cssText += 'padding:6px 8px;font-size:11px;';
                            toggle.onclick = () => {
                                person.active = person.active === false;
                                draw();
                            };

                            row.append(text, edit, toggle);
                            list.appendChild(row);
                        });
                }

                search.addEventListener('input', draw);
                draw();

                const add = makeButton('Add Person');
                add.onclick = () => {
                    const name = prompt('Name');
                    if (name === null) return;
                    const prefix = prompt('PPE prefix');
                    if (prefix === null) return;
                    working.push({
                        name: clean(name),
                        prefix: clean(prefix).toUpperCase(),
                        active: true
                    });
                    draw();
                };

                const save = makeButton('Save Local Master', { background: '#176b8e', color: '#fff' });
                save.onclick = () => {
                    const normalized = normalizeMasterRoster(working);
                    if (!normalized.people.length) {
                        alert('Master roster cannot be empty.');
                        return;
                    }
                    const saved = saveLocalMasterRoster(normalized.people, {
                        version: `local-${new Date().toISOString().slice(0, 10)}`,
                        source: 'Admin roster editor'
                    });
                    editOverlay.remove();
                    rosterProgress.textContent =
                        `Local master saved with ${saved.people.length} people.`;
                    refreshRosterStatus();
                };

                const close = makeButton('Cancel');
                close.onclick = () => editOverlay.remove();

                editBox.append(add, save, close);
            };

            const copyRoster = makeButton('Copy Master Roster JSON');
            copyRoster.onclick = async () => {
                const payload = JSON.stringify(masterRosterExportPayload(), null, 2);
                const ok = await copyText(payload);
                setStatus(ok ? 'Master roster JSON copied.' : 'Could not copy master roster JSON.', ok);
            };

            const downloadRoster = makeButton('Download Master Roster JSON');
            downloadRoster.onclick = () => {
                const payload = JSON.stringify(masterRosterExportPayload(), null, 2);
                downloadTextFile(
                    `vector-rebel-master-roster-${new Date().toISOString().slice(0, 10)}.json`,
                    payload
                );
            };

            const useEmbedded = makeButton('Use Embedded Roster');
            useEmbedded.onclick = () => {
                if (!confirm('Discard the local admin master roster and return to the roster embedded in Vector Rebel?')) return;
                clearLocalMasterRoster();
                rosterProgress.textContent = 'Local admin roster cleared.';
                refreshRosterStatus();
            };

            rosterCard.append(refreshFromPpe, editRoster, copyRoster, downloadRoster, useEmbedded);
            refreshRosterStatus();
            content.appendChild(rosterCard);

            const diag = card(
                'Diagnostics',
                'Admin-only read-only and troubleshooting tools. Normal users do not see these controls.'
            );
            const preflight = makeButton('Live DOM Preflight', { background: '#e8f3f7' });
            preflight.onclick = () => {
                overlay.remove();
                showLiveDomPreflight();
            };
            const diagnostics = makeButton('Diagnostics');
            diagnostics.onclick = () => {
                overlay.remove();
                showDiagnostics();
            };
            diag.append(preflight, diagnostics);

            const updateDetail = makeButton('Detailed Update / Compatibility');
            updateDetail.onclick = () => {
                overlay.remove();
                showUpdateCenter();
            };
            diag.appendChild(updateDetail);
            content.appendChild(diag);

            const advanced = card(
                'Advanced Configuration',
                'Department profile mappings, expected gear count, local asset defaults, and profile import/export. These are intentionally hidden from normal users.'
            );
            const openAdvanced = makeButton('Open Advanced Settings');
            openAdvanced.onclick = () => {
                overlay.remove();
                showAdvancedAdminSettings();
            };
            advanced.appendChild(openAdvanced);
            content.appendChild(advanced);

            const raw = card(
                'Raw Run Data',
                'When Admin is unlocked, Last Run includes COPY/DOWNLOAD JSON controls for engineering review.'
            );
            const last = makeButton('Open Last Run');
            last.disabled = !loadJSON(LAST_SUMMARY_KEY, null);
            last.onclick = () => {
                overlay.remove();
                showRunSummary();
            };
            raw.appendChild(last);
            content.appendChild(raw);
        }

        function renderContent() {
            content.innerHTML = '';
            if (active === 'profile') renderProfile();
            else if (active === 'captain') renderCaptainSets();
            else if (active === 'signatures') renderSignatures();
            else if (active === 'history') renderHistory();
            else if (active === 'general') renderGeneral();
            else if (active === 'admin') renderAdmin();
        }

        renderTabs();
        renderContent();
    }

    // ============================================================
    // PANEL
    // ============================================================

    function abortActiveRun() {
        const run = getRun();
        if (!run) {
            setStatus('No active inspection run.');
            return;
        }
        const completedIds = (run.completed || []).map(x => x.assetId);
        const inFlight = Number.isFinite(run.submittedAt) ? run.items?.[run.index]?.assetId : null;
        const protectedIds = [...new Set([...completedIds, ...(inFlight ? [inFlight] : [])])];
        const detail = protectedIds.length
            ? `\n\nAlready completed/submitted-or-uncertain asset(s):\n${protectedIds.join('\n')}`
            : '\n\nNo item in this run is recorded as submitted yet.';
        if (!confirm('Abort the active PPE run? Already submitted inspections remain submitted.' + detail)) return;
        saveDiagnostic('Run manually aborted by inspector.', run);
        archiveStoppedRun(run, 'Run manually aborted by inspector.');
        clearRun();
        setStatus('Run aborted. A stopped-run recovery record was kept so retry preview can avoid likely duplicates.', false);
    }


    function isPanelMinimized() {
        return localStorage.getItem(PANEL_MINIMIZED_KEY) === '1';
    }

    function rebelStarbirdSvg() {
        // Exact local rendition of the user's supplied Rebel symbol.
        // Embedded data URI only; no network request or external image.
        return `
            <img
                alt=""
                aria-hidden="true"
                draggable="false"
                width="39"
                height="39"
                style="display:block;width:39px;height:39px;object-fit:contain;pointer-events:none;user-select:none"
                src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAASwAAAEsCAYAAAB5fY51AAAdFElEQVR42u2dfZBdZX3HP1zfemVCVw2zLEHWrYszumxqQ0imxVnDi5IYqh0ChELCgIWABeNYaiIKsUKkLog0EEqBKJgVJEhUhJDwUogpscMSVoaQQTA2LjSEbVK7dYtXnTrtH89ZyMvu3nvPec45z8v3M5MRk917n7fzPb/f7/k9v+egQ3sWIIQQPlDREAghJFhCCCHBEh7QBTwAVDUUQoIlXKYVeASYC9ym4RASLOEq1USs2pL/fzbQq2EREizhIt8Duvf7uyXAIg2NkGAJl1gNzB7n324B5miIhARLuMAyYGGdn1kLTNNQCQmWKJP5wJcb+Lkq8BDQoSETEixRBrOA25v4+cnAw8AkDZ2QYIki6QK+T/O5Vp3AepSjJSRYoiCmYNIXWlL+/nFAn4ZRSLBE3kwCNvJGrlVa5qEcLSHBEjlSxRy56bT0ecrREhIskRu3AT2WP1M5WkKCJaxzFeaoTR4oR0tIsIQ1FgKX5+xqKkdLSLBEZmZhjt3kjXK0hARLZKILeLDA71OOlpBgiVSM5loVLR7K0RISLNEUtnKt0jIPWKFpEBIsUY9q4pZ1ltyOxShHS0iwRB36ErfMBZSjJSRYYlx6E3fMJZSjJSRY4gAWYY7KuOiiKkdLSLDE68xJ3C9XmQw8jrmRR0iwRINMwpQDDilPaEbidrlOO+HdddiF2eCYq0dLgpWHFfIC8KdALZA+dQDrPBKB6YSVo7UNeDER4tUoy1+CZYEqsBKT8b0HODUga/HhxN3yidBytD4DrMKc19yKNhgm5E0Ht0/VKEzsLj2Kub5qD3AisDsQEX4I+KCn7Z+ZWLmbA1lnjwInAx8AzgFeAp7V4ycLqxmWAU9iEihryYLaEUjfXMq1Sksv4cR+asApwK7kZbI6seqFBKsuHcBT7Ht11enAQCD9W4F7uVZpeQATuA6BoUS0RuOjFyfrUOkcEqxxmY8JhE7f6++WYwLToTAloL5sT9ynUBgAztvr/09P1qOOKEmwDmAlcDf77phtAq4IrJ/nYeJxIbAYGAlsftYkL8lRqpgcuXtR2R0JVmJxPJWY4HuzCzgjwP6OAOcG0I87MTlMIXLFGFb9PExMNWoXMXbBmgU8s58LOMpZSVwhRNYlD7yvDAOXBr42/zJxefemO3Eboz0QHrNgLcMc9xgrD2k5ph5UyFyKvwmwywJ+mextCc8f4+9bMDmBy2J8aGPMw5oEfI/xA5lbA3UF9+c14H+Bkzxr965xHuQQ2ZW8VD4yxr8dDxwL3A/8ThZWmLRikg0nyt85N6Lx6AUGPWvz30W2Zq/BbP6MxdzEReyKZTBiEqwuTNCye4KfWU44+VaNcrFHbd0K3BqhJ3QGJm43Fp2YTaMorM5YBGsG8ATmxP9ED8MVET4M64AtnrR1KXEyBCyY4N+rmJScJaEPRAyCNTexrFrq/Ny5xIsPVtZWwk1jaPTFsqoBFz/oIz2hC9YizPGNenwpQldwb/qBDY638VrEYg5MdRjr5RNa3bAoBOsqGquiuQW4Us8CvQ63bRe6qxDMjuHZDXoVmwiwvlaogrUCuLzBnz1DzwFg8s5ctTL/XtOzjzV8UwM/Nz2Zz6Ay40MUrBWJ6dwIy/G7ZMxCy2/Raxzs4zD1YzfN0Io54eAzl9FYOkpnInDBFAUMTbCaEatB4GqP+7oMUzfpBeyd5l/D+NvnZXEndjLyq0mYYAfmhMMMj+d+hMY3SiZjdsiDOM4TkmCtbEKsSCbc16Mpi3ijXlcbJlb3rKVFudqxvn7TwmfMx5ShuZw3gtEP4XfCZTPnQauY4zze52qFIlgraG5rfgP+1riaz9ibCd3JolxPtuuwXErM3Eq2uForpizL3Rx4ZrQFeAS/rw67tEmL+G7fRSsEwWrGDRzlbz3t66xk0U3EbOAnpI/TbEuEwgW+neF35wDPMXF11bZEtHzdTRtKsfbvxsQ+JVieiNVNyUPpG9MSC6oR2jBxmrSpCq6Unrkzw7p4kMZuBOqmsVw9V+mj+ZMKq30VLZ8Fa0kKsaphAq++0UG6ZMAlmHNmzZZFvseBPm8CdqYYp2dTrIuejNZc2aQ5qeClaPkqWPNTWg9fxb86Sq2Y+wPbUv7+dEyRwmYC8jsccAvvTeECDjDx4faJOBu3k2cnop90ibXeiZaPgjWL+nGcsdgDXO9ZXyclrk1nxs+ZnHxOMw/kfSX3vRk3bWnSvxYLVvunPRWtz5Fu13s1Hl2X5ptgNRPH2Z8r8e/Cggewm/S3pAnL5f4S+72VxhN6VyeWsy1uwM+dtKEM4/AAnuSl+SRYaeM4YJJEb/RsAX4bE1uxzTxM6kO9ceynvDy1xxu0Pn+Uk0tzN35mw19L+oKMXuSl+SJYk8gWx/Eto30ljR1yTctsTC5ave38p0rqf73KEV2JFdaTYxsexL/E0hrpa7q1YHITnc5L80Ww1pM+jrMLv6pULqWY+lQ9mAPPEy3QTSWNwcY6YlWvGKMNqpgcLd8unu2jfgma8WjH8bw0HwRrJXBcht/36aT/IuzGY+oxrc4C/XEJY7BlAle0IxGzloLa0pa8LH1LLM1SO6wbN9JavBSshRmtjT3YPemfJ3NprH6XbboTERjroXyihPY8OYFYbaaxZFDb4+NbYumtZLtcZDYm+VaC1eTbP+sDfCN+HHCeAXy35LEeq/zwSOJSly1YUzCB+LaSxqeH5vPCyua6jL+/GAdztFwVrFbM3YFZyrzW8CPvqguzQ1N2SdvjGDvb+2cFt2PbGGK1mfxjVvWY56rVMQ6rEg8jC7fgWC0tVwXrHgsL9Ebcz7uagokhtTjSnrM58OjSiwW34fm9/ntS4q62OzI+i/HnZpoa2evgVxPDwZmdQxcFqxc729Vfd3xBjT6MbY6163L2zXx+ucDv3rOfC3872bP881ifviSW3kz2kEg7cIcEa2zmWnqD9eH+mcGjgFccbdt3eaMW+KsFfu8Le/33UiYuDVMWm4C3eiJYI9gpgDgbR4oGuCRYrRaV/JseLKYB4MPATGCtY22rYs4SVmm+YkIWXt3rxfVVx8ZkLXB0Mmc+3eBzs0XLu/Qyyy4J1h3Y2bLezsSJh67RD5wGHIMJLrtCN+Zc3WsFfuevE8vOpVIvg8DHkjnysY7aNovr6huUnJPmimAtSsxOG9yGnwwAHwLOofhUgvE4v+C36m8xR7BaHOj7MPB54D34f+O0rXO0bZi4YmkcdGjPgrIHsyN5C9ja1j8M/2pejeWSfYHG71YMhWFHxGotJmF5KKCx3Y29pNtzynKLXbCw7rEoVmsDWWSjh1iPwJ1yxUVQtlgNA6ck7t9QYGNrM657CyWdsSxbsK7CVMS0xe2BLbKdwALgTNy7LzA0NmGC6usC7Z/N69uqwF2xCdYMyy7PnoAX25rkYdqMyIOlmN2/nQH30fZtSD2UUJ21TMFalcNDHTI7MUH5m6Qv1tiVvAiuiaS/ts9D9vJGvl7QgvVp0l8WUITJ6zKXYIKeIhvbgWPxM1UhLbYD5VXgH0MXrCnYv51kEJPPFNPCOx4/KlG4yBbMod6dkfV7B83fYViP2RR4VKkMwVqB/coEayJ86DYmLuKw9KcpBoAT8O9CElvkUcboegpKKC1asOaQz/mwtRE/fCdKtJqyrGZFLFaQz8ZUG7A8RMG6OYfPjM0dHEu0TpZ72JBYxWxZjbKNfE5SLKaASzuKFKyryKeu0X16FunHnHeTaI3NZonVPjya0+fmHoAvSrCmkN8xk4e1/gAT0zpdwzCmBT5HYrUPj+T0uT3kHIAvSrDyvLnmMa2/11mHObArDDVMqRqJ1b7keblIrrGsIgRrGvkVs98iN+gAeol3E2J/ziOuPKtG2UH6uwvr0Znj816IYH1F1lUpD+r2yMdgFXGmuzQTQsiLZb4K1hzs1bkqetB9ZoR8r7p3ne2YXSsxPs/m+Nm5WVl5C1Zvzp//hNbduPQT77nD+QoV1OXJnD8/FysrT8FaiP3zgnuzFQVT63EZ8SWV3oDJTRP1n588ycXKylOw8r5l40mtuYZcw2UR9XcX8VVpTUuN/OOc1tdeXoK1kPwvv3xKa64hbiSeAPxnZXU79dK3bmXlJVifK2CwVcyucWIIQG9Fu4KuuYXWtSAPwZpDvrGrUZRf0zjrsV9WxDWu1TQ3zS8K+I5uzIFzZwWriLf5dq21pvlawH0bxK/LTV1hR0Hfc4mrgtVFvnlXo7ygtdY0awpyAcrgak1vaqEvgnlYumXHtmAtLWgA5A6mY2WAfRoGbtXUpqLIq8yseF42BauVHM8Q7cfPtdZS0Ud4eVkSq2wUFV75JBYqDdsUrEsKHOQXtc5SUcOUsw2JGzStmXiloO+ZDHzcJcG6qMBB3q11lppbCOfYyjriu0jCNkXmrZ3rimDNTRS0KF7SOkvNEPC9QPpys6YzM0WGCGaT8R5DW4L1qYLdGmUzZ2NVAH3Yg8oL+SZYYGJZpQpWa2JhFYVcgOxsJJ+LCIrkLlSRwQavFfx9Z5YtWOcW3OFXtMas8E+et/9OTaGXgtUJzChTsD5VcId/rTVmhW947g72awq9JXVxyayCNYv8qzKU/UYIlZ34e77wB5o+rzmrLMH6ZAmd/Y3m2xqrJViiBCandQuzCtafl9BZBVrt4WN6Q418rluPlbeU9L3zihasOUBLCR39rdZY1G6hCjeGwalFC9apGvMg2OBZe/9ZU2aVQ0r63k5SJJFmEay5JXX0bVpjVrnfs/Zu0pRZ5R0lfvfpRQnWDKCtpE5Wtcas0o8/FRxq6C5K2xxa4ncfX5RgzSuxk3+gNWYdX+rjK35ln8klfvfsZg2QtII1v8ROHqw1Zp1/8aSdz2iqgrKwoMl672kEq4vik0X35u1aY9Z53JN2btFUWae95O/PXbDmltzBw7XGrOPLMRfd6GyXKQ604aS8Bet4DXKQuH5BRQ3V8rfNUQ60YRowKU/B+nDJHayincI8eMbx9kms7PM+R9rRk5dgzXBELA7TWrOO6ztwz2uKrPPe0AVrtiMdbNdas852tS86uhxpx3F5CdaJjnTw3Vpr1vmp4+3T5bn2meaQYDXkuTUjWNVmTLecma61Zp0djrfvZ5oiq7RS3mmVsei2LVgzHercB7XeonO7JFhhv/Qb0pdmBKvHoc59QOstF4YcbptuSrLLMY61Z6ptwZrqUOcmo3ysPHjV0XYNamqsc6Jj7bFuYf2xYx2UWxiPYOmmb7u4FI8exWoMq4opuOUSPVp31vkvuapRMMvRdtXdtWxUsGY62LkTtO6s8z+OtuuXmpooBKtuXlijgtXtYOem08QZJOG1hfUrTY1V5jjarqNtCdaxjnZQbqFdXL2R6PeaGmtMcdQAsWphdTnawY9q/UWB7qK0xwKH22bNwprmaAeP1/qLAt32bY/THG5bO3WO6DQiWB0Od7DbYetPyMJy0R10/Vjb+7MKluuVEc7UOrSGq3XGdPGIHf7KgzYelVWwXK+MsFDr0BotjrbrLZoaK1zkQRvbswrW+zzo4AytxaAtmbdqajIzC7eqM+RmYflQLG+e1qMV3uVou3S1W3bO96SdR8QgWHILwxast2lqMtEKnO1JWztjEKw2iZYVXI1XvkNTk4kLPWprFIIFsEzrMjOu3vmoGv7ZuMiz9ramFSyfak51Uv4lr77T6Wi7VPssPfPxI9i+N5PTClaLZx1dovWZGpcThNs0PalZ7mGbj0wrWL7tzvSgFIe0uF52WlZWOuuq08N2p7aw3uVhZ7+sdZqKYxxv31Gaoqb5oqftPjytYB3iYWdn426BMpeZ6nj7ZDk3x0LcLSNTj3enFaw/9LTD12m9No3rh2KP1hQ1TBXo9bj9h6UVrBZPOzwt8d9FY7TifuqAqnI0zufwe6MitWD5XIJ4udZtw/jgQr9f09QQU4DPe96HI9IK1iEed7oT+LTWb0P8mSduzjRNVV1W4G6ZoEZpTytYb/K84724nV/kCh/zpJ0naarqWsqhFAJoTSNYvlMF7tA6npAO/MnVUUnseNb65DSCFcIp+R65hhNyukdtnR2Au5MXXyWsM5dHxmhhyTUMS7BG3R6xLzOAxTF0NBbBqgJ9WtdjuoPTPWuzDrjvyyTgngD7VYtZsACOQyVo9sfHGmJnyy3ch5sIs/zOr2IXLDDnDOdojb/ORR62uQW379YrkvmEW7jyt2kEK8TStHeheNaoa+VrNvT5mj66gNsD7t+v0wjWrwIciBbgPrkVXOJx23sif+lUge8EvoZTCVaoV4R3A7dFvOA7MCkCPnNpxPPXh7+VGCRYKTmbePOzrgqgDxczQe3vgFlCHNfajaQRrN8EPig3RCha0/Dnyqd6fCGyuZuD32VjGmV4vH+opP3FwERrUUSL/isB9eWCiKysLsyGUQzsSStYtUgG6JZIRGsG/seu9qYK/E0kYvUE/tana5ahtIL1y4gsjxhE6+sB9mkJYZedaQXWRSRWmVzC14iLWwg3EW8JJts/RNYQ5hZ/K/AI8V0kuyutYO0mPlYT3hGeDuCygOesE1OtICSmJGLVHeEz+Mu0gvUScfLlRLiqAfUndJdiMeFUcpgFPBepWAH8Z1rBGiFeFgJP4n9G9VUBu7n7cwf+7xouAx4nrpiVNZcQYDDigesGBjx+cy8BLo9ovtqBBz21jFuB9egiYICXswjW7sgHryV5493m2dt7KXEkGe7PNPyrfTYL+AlhpZxkYVAWVnbOB37qiXt1G+EFoZthHiZvyYdr6kZdwDY9Yq+zI4tgvarx28faWp2Y7i5e7DkpaZvKr5gUjvUOi1YH8CO5gM0ZSI0I1ksawwOYjdnF6XXogZgFvCC34gDR2opbiaWTknXzb5gyOcKyYG3TGI7LkkTQl1BeoLeKuTxTbsXYtANPY3ZLyw7GL0peKks0LfkJ1i80hnXdxF7g5xRf+WF+8r2LNQ11uRx4nuIvsagm6+IXmJMUeqnIwnKCNkzlh92JgOUZ45qLiX/crQegaWvrAUxAflbO39WBCai/lKyLdg1/Q7w40T8edGjPgkY+5Gf4czuwS2zH5AVtADaSrfrFHOBUzAUMLRpaa2/zvkT4bbyYO4BTgHPw7/o0V5gJ9GcVrPUomGuDTcmfl4H/xpTR2I2p/zOEyfOaAhwCvDsRpqkSqUIYwNT6X9ugeHUB7wGOwZTtOU5zZIW3T/Rib1SwVqA4iYiHGrAzeYn8fq+/PxyYLGHK1SM5aqIfeHODH6Q4loiJKiYEojBIsbxQ7wcavUh1i8ZSCJEzdQ2jRgXreeIplyyEKIfnbAlWTW6hEMIXCwvgGY2nECInaoknZ02wntKYCiFyYoAGwk6ysIQQLvB0Iz/UjGD1o8C7ECIffmxbsMCcXxNCCNv05yFY/6pxFUJYZg8TVBnNIlgbNLZCCMs82egPNitYimMJIWyzKS/BAsWxhBB2eTRPwdqo8RVCWKKGycHKTbAe0RgLISzxYDM/nEawBpjgKmkhhGiCpkJMlZRfsk7jLISwwGNFCNYPNM5CiIwM02QVmCwWltIbhBBZuL/ZX6hk+LIHNd5CiAw0HVrKIlgPa7yFECmpAT8sUrC+ozEXQqTkMVKElbII1gjaLRRCpOOHaX6pkvFL+zTuQogU3FeGYP0Q7RYKIZpjM+aS2sIFqwbcqfEXQuTtDtoQLCRYQogm+VaZgrURGNQcCCEaYENad9CWYAF8U/MghGiAu7L8si3Bul7zIISoQw241wXBGkEpDkKIibmXjFkFFYuNWan5EEJMQObTMTYFq58mSp0KIaJiEFjvkmAB/IPmRQgxBlY25mwLVh8qnyyEOJBbXBQsWVlCiP1ZS4bcq7wF62ZM6VMhhACLG3J5CNYI2jEUQhi2Y/Eu00pOjVyJqjgIIeAGmx+Wl2ANoeM6QsTOMHCHD4IFcJ3mS4iouR4TIvJCsHYAN2nOhIiSGjmcMa7k3OirUCxLiBi50bZ1VYRgDck1FCJK6+rreXxwpYDGX43ysoSIiduwlChahmDVgGWaQyGisa6uzuvDKwV1YhUqoyxEDNyYl3VVpGDVgKWaSyGCZhhYnucXVArszBpgk+ZUiGCxnndVpmAB/LXmVIhgratr8/6SogVrG0omFSJEllFAzmWlhI5dBuzR/AoRDNsxwfbcKUOwRoAvao6FCIYLivqiSkkdvBXYonkWwnvWYrHelauCBXAGOmcohM/UgM8U+YVlCtYOlJslhM9cB+yMRbDABOqUmyWEfwyS4xEcVwUL4Cy5hkJ4x6fKeG5dEKydwIWafyG8oQ8Ltzj7KlijA7BW60AI59kDXFzWl1ccGojzUEUHIVznHHI+L+iLYI1gUh2EEHIFx+RNB7dPdWlAdgK/AU7S2hDCOVfwZOB3ZTai4uDA9AIbtD6EcIrTy3QFXRYsgHPRAWkhXGE5BR6/8VGwhoC5KD9LiLLZAlzhSmMqDg9UP8rPEqJMhoG/cKlBFccHrA8V/BOiLM6i4LOCvgsWwCXovKEQRXMNJacw+CpYAKegpFIhimIDjlZS8UWwRlAQXogi2IrDCdwVjwZyG/AxiZYQuTEMfAIH8q1CECwwuSCna10JkQsnYwprOkvFw0Fdh9IdhLDNhZhUIqdx7SxhozwN/B9wvNaZEJlZDnzNh4b6KlgAPwKOAKZpvQmRmlXAZ31pbMXzwb4gGXAhRPOspcA7BSVYEi0h0rIJOM23RlcCGXyJlhCNswWY7WPDKwFNgkRLiMbE6gQ8zWesBDYZEi0hxmdzIlYjvnagEuCkXIDZphVC7CtWc3wWq1AFC0zBMSWXCvGGWH3Ed7EKWbAAbgXO1FoVkbMhEasgzuBWAp+sNZhseB2YFjFyZ+IGBrP+KxFM2kbgQ8AurV8REcuBBaF1qhLJ5A0Af4LZ0hUidC7EoYsjJFjpGAJ6MMcRhAiRGqZm3K2hdrAS4YSehqPlX4XIwC5M6GN9yJ2sRDq51yRvomGtcxEAmzEhj4HQO1qJeJLXY0rTDGi9C4+5KbGshmLobCXyyd6RTLbuPhS+UQPOwVyDFw0VzTu1ZNLPRPlawg8GkxdtX2wdl2C9wRqgSy6icJy1QHes61SCNbaLqMPTwjWGExfwNAI4EyjBsusiXgEcA2zXcAgH2ILZIOqLfSAkWOMzAEzFpEAIURZfAo7F8fsCJVjuWFtLgZmYQKcQRbEB+CPgSg2FBKtZ+oH3J2877SSKPBkETsFUWZBVJcHKZG1dCRyFKdshhG2uSV6M6zQUEixb7MSU7ZgJbNVwCIvu31JZ8BKsPN3EqZhSHns0HCKl+3em3D8JVpHcChyJ4luicWrA5xP3b42GQ4JVxgK8EuhA14yJibkJEwft1QtOglU2Q5hrxo7GxCWEGH2h3QAchjm3ulNDIsFyiW2YuMQxqMJpzAxjdv5agc8QSQkYCZa/DGDOfh0tVzE6ofoSJra5lIjP/kmw/LW4LkhcgmtQpdNQGQQWA4djYpoSKgmW1wwlb9wjMekQyuMKg62YSgrvAW5EwXQJVmCMYNIhpmIuelXmvJ+sxRyjmYoqKRTCQYf2LNAouEFrYnUtBDo1HE5bU98GvoWC6BIsAZjaR/OBUyVeTrAHk+C5GnPCQUiwxDh0YY5vnCnxKpQB4EHgfomUBEukF695wCcSK0zYowY8llhSD8vdk2AJu3QApwMfB47TcKRie2JFfR94Eu3uSbBEIUwBTsCUvPmgBGxchjG3JD8EPIAqJEiwhDPMSATs2ETEuiMcg83A08CPMXEoCZTnvFlDECz97BssriYCNgOTNzSTcIL4g8DzwLPAc5iTBbpfUoIlPKYGbEz+jDIJc0D7fcB7kz8dmOqXLY65cnuAV4CXMdUOfg48kwiVjsBIsEQEjIwhYqO0Au3AocA7EwF7B/Cu5H/fmQje24G3JRbcW4CDkz/VBoVoVIB2A7uAfwf+A7NLNwi8ioLhQoIl6jCEtvaFY+gsoRBCgiWEEBIsIUS0/D/L9fXcKZgyiwAAAABJRU5ErkJggg==">
        `;
    }

    function applyPanelMinimizedState(minimized, persist = true) {
        const panel = document.getElementById(PANEL_ID);
        if (!panel) return;
        const full = panel.querySelector('[data-vector-ppe-panel-full]');
        const mini = panel.querySelector('[data-vector-ppe-panel-mini]');
        if (!full || !mini) return;

        if (persist) localStorage.setItem(PANEL_MINIMIZED_KEY, minimized ? '1' : '0');
        full.style.display = minimized ? 'none' : 'block';
        mini.style.display = minimized ? 'flex' : 'none';

        if (minimized) {
            panel.style.width = '54px';
            panel.style.maxWidth = '54px';
            panel.style.padding = '0';
            panel.style.background = 'transparent';
            panel.style.border = '0';
            panel.style.boxShadow = 'none';
        } else {
            panel.style.width = '430px';
            panel.style.maxWidth = 'calc(100vw - 28px)';
            panel.style.padding = '0';
            panel.style.background = '#fff';
            panel.style.border = '1px solid #cbd9e2';
            panel.style.boxShadow = '0 10px 28px rgba(12,43,62,.22)';
        }
    }

    function updateMinimizedPanelBadge(run = getRun()) {
        const mini = document.querySelector(`#${PANEL_ID} [data-vector-ppe-panel-mini]`);
        if (!mini) return;

        mini.style.borderColor = '#1b5a7a';
        mini.style.boxShadow = '0 5px 18px rgba(13,50,72,.28)';
        mini.style.background = '#ffffff';
        mini.style.color = '#153e5c';

        if (run?.phase === 'stopped') {
            mini.style.borderColor = '#a83b3b';
            mini.style.boxShadow = '0 0 0 3px rgba(168,59,59,.18),0 5px 18px rgba(13,50,72,.28)';
            mini.setAttribute('aria-label', 'Expand Vector Rebel. PPE run stopped — attention required.');
            mini.title = 'Vector Rebel — run stopped';
            return;
        }

        if (run?.items?.length && Number.isInteger(run.index)) {
            mini.style.borderColor = '#176b8e';
            mini.setAttribute(
                'aria-label',
                `Expand Vector Rebel. Active PPE run ${Math.min(run.index + 1, run.items.length)} of ${run.items.length}.`
            );
            mini.title = `Vector Rebel — active run ${Math.min(run.index + 1, run.items.length)}/${run.items.length}`;
            return;
        }

        const gate = evaluateRemoteCompatibility(getUpdateState());
        if (!gate.allowed || ['warning', 'unknown'].includes(gate.severity)) {
            mini.style.borderColor = '#b88427';
            mini.style.boxShadow = '0 0 0 3px rgba(184,132,39,.14),0 5px 18px rgba(13,50,72,.28)';
            mini.setAttribute('aria-label', 'Expand Vector Rebel. Update attention may be required.');
            mini.title = 'Vector Rebel — update attention';
            return;
        }

        mini.setAttribute('aria-label', 'Expand Vector Rebel.');
        mini.title = 'Vector Rebel';
    }

    function refreshPanelInfo() {
        const info = document.getElementById('vector-ppe-info-v2');
        if (!info) return;
        const config = getConfig();
        const run = getRun();
        const sigCount = getSignatureLibrary().length;

        if (run) {
            const current = run.items?.[run.index] || {};
            info.innerHTML =
                `<b>${escapeHtml(getMode(run.modeKey)?.short || run.modeKey)}</b> · ` +
                `${Math.min(run.index + 1, run.items.length)}/${run.items.length}` +
                `<br>${escapeHtml(current.ownerName || run.ownerName || '')} · ${escapeHtml(current.assetId || '')}` +
                `<br><span style="color:#718896">Phase: ${escapeHtml(run.phase)}</span>`;
        } else if (!config.initialized) {
            info.innerHTML =
                '<b>Setup required.</b> Open Settings → Profile, then add your own signature under Signatures.';
        } else {
            info.innerHTML =
                `<b>${escapeHtml(config.inspectorName)}</b>` +
                `<br>${escapeHtml(config.selfPrefix)} · ${sigCount} signature variant${sigCount === 1 ? '' : 's'}`;
        }

        updateMinimizedPanelBadge(run);
    }

    function installPanel() {
        if (document.getElementById(PANEL_ID)) return;

        const panel = document.createElement('div');
        panel.id = PANEL_ID;
        panel.style.cssText =
            'position:fixed;' +
            'right:16px;' +
            'bottom:64px;' +
            'width:430px;' +
            'max-width:calc(100vw - 28px);' +
            'z-index:2147483646;' +
            'background:#fff;' +
            'border:1px solid #cbd9e2;' +
            'border-radius:12px;' +
            'padding:0;' +
            'overflow:hidden;' +
            'box-shadow:0 10px 28px rgba(12,43,62,.22);' +
            'font-family:Arial,sans-serif;' +
            'color:#18384f;';

        const full = document.createElement('div');
        full.setAttribute('data-vector-ppe-panel-full', '1');

        const titleRow = document.createElement('div');
        titleRow.style.cssText =
            'display:flex;align-items:center;gap:10px;padding:13px 14px 11px;' +
            'background:#153e5c;color:#fff;';

        const titleWrap = document.createElement('div');
        titleWrap.style.cssText = 'flex:1;min-width:0;';
        const title = document.createElement('div');
        title.style.cssText = 'font-size:17px;font-weight:700;letter-spacing:.1px;';
        title.textContent = `Vector Rebel v${VERSION}`;
        const sub = document.createElement('div');
        sub.style.cssText = 'font-size:10px;opacity:.78;margin-top:2px;';
        sub.textContent = 'This is the way.';
        titleWrap.append(title, sub);

        const minimize = document.createElement('button');
        minimize.type = 'button';
        minimize.textContent = '−';
        minimize.title = 'Minimize';
        minimize.setAttribute('aria-label', 'Minimize Vector Rebel');
        minimize.style.cssText =
            'width:31px;height:31px;border:1px solid rgba(255,255,255,.25);border-radius:7px;' +
            'background:rgba(255,255,255,.08);color:#fff;font:400 21px/27px Arial,sans-serif;' +
            'padding:0;cursor:pointer;';
        minimize.onclick = () => applyPanelMinimizedState(true);
        titleRow.append(titleWrap, minimize);

        const body = document.createElement('div');
        body.style.cssText = 'padding:12px 13px 13px;background:#fff;';

        const info = document.createElement('div');
        info.id = 'vector-ppe-info-v2';
        info.style.cssText =
            'font-size:11px;margin:0 0 10px;padding:9px 10px;line-height:1.45;' +
            'background:#f3f7f9;border:1px solid #e0e8ed;border-radius:8px;color:#4f6878;';

        const actions = document.createElement('div');
        actions.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:7px;';

        function mainAction(label, onClick, primary = true) {
            const b = document.createElement('button');
            b.type = 'button';
            b.textContent = label;
            b.style.cssText =
                'min-height:44px;padding:10px 9px;border-radius:8px;cursor:pointer;' +
                `border:1px solid ${primary ? '#176b8e' : '#b8c8d6'};` +
                `background:${primary ? '#176b8e' : '#fff'};` +
                `color:${primary ? '#fff' : '#153e5c'};` +
                'font:700 12px/1.2 Arial,sans-serif;' +
                'box-shadow:0 1px 2px rgba(15,43,62,.08);';
            b.onclick = onClick;
            return b;
        }

        actions.append(
            mainAction('My Tour PPE', () => launchMyInspectionFromAnywhere('tour')),
            mainAction('My After-Fire', () => launchMyInspectionFromAnywhere('afterFire')),
            mainAction("Captain's Monthly", launchCaptainInspectionFromAnywhere),
            mainAction('Settings', () => showSettings('profile'), false)
        );

        const statusBox = document.createElement('div');
        statusBox.id = 'vector-ppe-status-v2';
        statusBox.style.cssText =
            'margin-top:10px;padding:8px 9px;background:#f7f9fa;border-top:1px solid #e7edf1;' +
            'font-size:11px;line-height:1.4;color:#607483;border-radius:6px;';
        statusBox.textContent = 'Ready.';

        body.append(info, actions, statusBox);
        full.append(titleRow, body);

        const mini = document.createElement('button');
        mini.type = 'button';
        mini.setAttribute('data-vector-ppe-panel-mini', '1');
        mini.title = 'Vector Rebel';
        mini.setAttribute('aria-label', 'Expand Vector Rebel');
        mini.style.cssText =
            'position:relative;' +
            'width:54px;height:54px;' +
            'display:none;' +
            'align-items:center;justify-content:center;' +
            'padding:0;margin:0;' +
            'border:2px solid #1b5a7a;' +
            'border-radius:50%;' +
            'background:#fff;' +
            'color:#153e5c;' +
            'box-shadow:0 5px 18px rgba(13,50,72,.28);' +
            'cursor:pointer;';
        mini.innerHTML = rebelStarbirdSvg();
        mini.onclick = () => applyPanelMinimizedState(false);

        panel.append(full, mini);
        document.body.appendChild(panel);
        applyPanelMinimizedState(isPanelMinimized(), false);
        refreshPanelInfo();
    }

    // ============================================================
    // INITIALIZE / RESUME
    // ============================================================

    getConfig(); // performs one-time v2.2 -> v2.3 local migration when needed
    migrateLegacySignature();
    migrateLegacyRunHistory();
    installPanel();
    setTimeout(() => {
        fetchUpdateManifest(false).catch(() => {});
    }, 1200);

    const migrationNotice = loadJSON(MIGRATION_NOTICE_KEY, null);
    if (migrationNotice?.message) {
        setTimeout(() => alert(`Vector Rebel migration notice:\n\n${migrationNotice.message}`), 400);
        localStorage.removeItem(MIGRATION_NOTICE_KEY);
    }

    setTimeout(resumeRun, 700);

    // Keep ownership fresh only while this tab owns an active run.
    setInterval(() => {
        const run = getRun();
        if (run && run.phase !== 'stopped') {
            refreshRunOwnership();
        } else {
            releaseRunOwnership();
        }
    }, RUN_OWNER_HEARTBEAT_MS);

    let lastUrl = location.href;
    let observerTimer = null;
    let observerLastRunAt = 0;
    const runObserverHandler = () => {
        observerLastRunAt = Date.now();
        if (!document.getElementById(PANEL_ID)) installPanel();
        if (location.href !== lastUrl) {
            lastUrl = location.href;
            setTimeout(resumeRun, 500);
        }
    };
    new MutationObserver(() => {
        clearTimeout(observerTimer);
        const sinceLast = Date.now() - observerLastRunAt;
        if (sinceLast >= 1000) {
            runObserverHandler();
            return;
        }
        observerTimer = setTimeout(runObserverHandler, 120);
    }).observe(document.documentElement, {
        childList: true,
        subtree: true
    });
})();
