// ==UserScript==
// @name         Vector Rebel
// @namespace    mission-vector-check-it-vector-rebel
// @version      3.2.38
// @updateURL    https://raw.githubusercontent.com/michaelbartbrion-cmd/mission-vector-check-it/main/beta/vector-rebel.user.js
// @downloadURL  https://raw.githubusercontent.com/michaelbartbrion-cmd/mission-vector-check-it/main/beta/vector-rebel.user.js
// @homepageURL  https://github.com/michaelbartbrion-cmd/mission-vector-check-it
// @supportURL   https://github.com/michaelbartbrion-cmd/mission-vector-check-it/issues
// @description  Vector Rebel production PPE checker — physical PASS/FAIL review, signatures, sequential submission, and Item Log completion verification
// @match        https://checkitapp.targetsolutions.com/*
// @match        https://app.vectorcheckit.us/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_xmlhttpRequest
// @grant        GM_openInTab
// @grant        GM_setClipboard
// @connect      base44.app
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    // Safety: only one Vector Rebel engine may exist in a page.
    // One production Vector Rebel engine may exist in a page. This build intentionally
    // uses the clean production identity after the September 2026 Tampermonkey reset.
    if (window.__vectorRebelInstance) {
        console.warn(
            `Vector Rebel: another instance (${window.__vectorRebelInstance.version || 'unknown'}) is already active on this page.`
        );
        return;
    }
    window.__vectorRebelInstance = {
        version: '3.2.38',
        startedAt: Date.now()
    };

    // ============================================================
    // STORAGE / CONSTANTS
    // ============================================================

    const VERSION = '3.2.38';
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
    const CAPTAIN_LAST_SET_KEY = 'vectorRebelCaptainLastSet_v1';
    const CAPTAIN_DAILY_CHECK_KEY = 'vectorRebelCaptainDailyCheck_v1';
    const CAPTAIN_DAILY_REPORT_KEY = 'vectorRebelCaptainDailyReport_v1';
    const CAPTAIN_DAILY_DEFERRED_KEY = 'vectorRebelCaptainDailyDeferred_v1';
    const MASTER_ROSTER_OVERRIDE_KEY = 'vectorRebelMasterRosterOverride_v1';
    const MASTER_ROSTER_REVIEW_KEY = 'vectorRebelMasterRosterReview_v1';
    const RUN_OWNER_KEY = 'vectorRebelRunOwner_v1';
    const TAB_SESSION_KEY = 'vectorRebelTabSession_v1';
    const RUN_OWNER_STALE_MS = 45 * 1000;
    const RUN_OWNER_HEARTBEAT_MS = 10 * 1000;
    const PORTABLE_STORAGE_SENTINEL = '__VECTOR_REBEL_PORTABLE_MISSING__';
    const PORTABLE_SNAPSHOT_KEY = 'vectorRebelPortableSnapshot_v1';
    const PORTABLE_BACKUP_KEYS = [
        CONFIG_KEY, LEGACY_CONFIG_KEY, SIGNATURE_LIBRARY_KEY, SIGNATURE_CURSOR_KEY,
        LAST_SUMMARY_KEY, LEGACY_LAST_SUMMARY_KEY, RUN_HISTORY_KEY, GEAR_SNAPSHOTS_KEY,
        LAST_DIAGNOSTIC_KEY, STOPPED_RUN_KEY, MIGRATION_NOTICE_KEY, PANEL_MINIMIZED_KEY,
        CAPTAIN_LAST_SET_KEY, CAPTAIN_DAILY_CHECK_KEY, CAPTAIN_DAILY_REPORT_KEY,
        MASTER_ROSTER_OVERRIDE_KEY, MASTER_ROSTER_REVIEW_KEY
    ];

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

    // ============================================================
    // REBEL COMMAND TELEMETRY
    // ============================================================
    // Production PPE activity is reported to Rebel Command as coarse workflow
    // telemetry. The configured My Tour PPE inspector/profile name is included
    // so usage can be attributed to a person. Gear details, signatures, notes,
    // asset IDs, and individual PASS/FAIL answers are not intentionally sent.
    const REBEL_COMMAND_ENDPOINT = 'https://base44.app/api/apps/6aa6b7634a031657377d4fad/functions/telemetryBridge';
    const REBEL_COMMAND_ENROLL_ENDPOINT = 'https://base44.app/api/apps/6aa6b7634a031657377d4fad/functions/telemetryEnroll';
    const REBEL_COMMAND_PAIR_KEY = 'vectorRebelPairingV1';
    const REBEL_COMMAND_AUTO_STATE_KEY = 'vectorRebelTelemetryInstallV1';
    let rebelCommandEnrollPromise = null;

    function rebelCommandPairing() {
        const raw = GM_getValue(REBEL_COMMAND_PAIR_KEY, {}) || {};
        return {
            deviceId: clean(raw.deviceId || ''),
            token: clean(raw.token || ''),
            endpoint: REBEL_COMMAND_ENDPOINT
        };
    }

    function rebelCommandPaired() {
        const p = rebelCommandPairing();
        return !!(p.deviceId && p.token);
    }

    function randomTelemetryToken(bytes = 32) {
        const raw = crypto.getRandomValues(new Uint8Array(bytes));
        let binary = '';
        for (const b of raw) binary += String.fromCharCode(b);
        return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
    }

    function randomTelemetryInstallationId() {
        const raw = crypto.getRandomValues(new Uint8Array(16));
        return 'vr-install-' + Array.from(raw).map(b => b.toString(16).padStart(2, '0')).join('');
    }

    function rebelCommandAutoState() {
        const raw = GM_getValue(REBEL_COMMAND_AUTO_STATE_KEY, {}) || {};
        return {
            installationId: clean(raw.installationId || ''),
            deviceToken: clean(raw.deviceToken || ''),
            deviceId: clean(raw.deviceId || '')
        };
    }

    function saveRebelCommandAutoState(state) {
        GM_setValue(REBEL_COMMAND_AUTO_STATE_KEY, {
            installationId: clean(state?.installationId || ''),
            deviceToken: clean(state?.deviceToken || ''),
            deviceId: clean(state?.deviceId || '')
        });
    }

    function ensureRebelCommandAutoCredentials() {
        const current = rebelCommandAutoState();
        if (current.installationId && current.deviceToken) return current;
        const next = {
            installationId: current.installationId || randomTelemetryInstallationId(),
            deviceToken: current.deviceToken || randomTelemetryToken(),
            deviceId: current.deviceId || ''
        };
        saveRebelCommandAutoState(next);
        return next;
    }

    function rebelCommandProfileName() {
        try {
            return clean(getConfig()?.inspectorName || '');
        } catch {
            return '';
        }
    }

    async function ensureRebelCommandEnrollment(forceRefresh = false) {
        const profileName = rebelCommandProfileName();
        if (!profileName) return false;

        const pair = rebelCommandPairing();
        const auto = rebelCommandAutoState();
        const isAutoPair = !!(pair.deviceId && auto.deviceId && pair.deviceId === auto.deviceId);
        if (pair.deviceId && pair.token && !isAutoPair) return true;
        if (pair.deviceId && pair.token && isAutoPair && !forceRefresh) return true;
        if (rebelCommandEnrollPromise) return rebelCommandEnrollPromise;

        const creds = ensureRebelCommandAutoCredentials();
        rebelCommandEnrollPromise = (async () => {
            try {
                const response = await fetch(REBEL_COMMAND_ENROLL_ENDPOINT, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'omit',
                    body: JSON.stringify({
                        installationId: creds.installationId,
                        deviceToken: creds.deviceToken,
                        profileName,
                        version: VERSION
                    })
                });
                if (!response.ok) return false;
                const data = await response.json().catch(() => null);
                const deviceId = clean(data?.deviceId || '');
                if (!data?.ok || !deviceId) return false;

                const next = { ...creds, deviceId };
                saveRebelCommandAutoState(next);
                GM_setValue(REBEL_COMMAND_PAIR_KEY, {
                    deviceId,
                    token: creds.deviceToken,
                    autoEnrolled: true,
                    installationId: creds.installationId
                });
                return true;
            } catch {
                return false;
            } finally {
                rebelCommandEnrollPromise = null;
            }
        })();
        return rebelCommandEnrollPromise;
    }

    async function rebelCommandEvent(event, options = {}) {
        if (!rebelCommandPaired()) {
            const enrolled = await ensureRebelCommandEnrollment(false);
            if (!enrolled || !rebelCommandPaired()) return null;
        }
        const p = rebelCommandPairing();
        const eventId = `ppe:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;
        const body = {
            version: VERSION,
            events: [{
                eventId,
                event,
                version: VERSION,
                timestamp: new Date().toISOString(),
                module: 'ppe',
                action: clean(options.action || ''),
                description: clean(options.description || ''),
                ...(typeof options.success === 'boolean' ? { success: options.success } : {}),
                workflowMode: clean(options.workflowMode || ''),
                errorType: clean(options.errorType || ''),
                errorMessage: clean(options.errorMessage || ''),
                metadata: options.metadata && typeof options.metadata === 'object' ? options.metadata : {}
            }]
        };
        return new Promise(resolve => {
            GM_xmlhttpRequest({
                method: 'POST',
                url: REBEL_COMMAND_ENDPOINT,
                headers: {
                    Authorization: `Bearer ${p.token}`,
                    'X-Rebel-Device-ID': p.deviceId,
                    'Content-Type': 'application/json'
                },
                data: JSON.stringify(body),
                timeout: 12000,
                onload: response => resolve(response.status >= 200 && response.status < 300),
                onerror: () => resolve(false),
                ontimeout: () => resolve(false)
            });
        });
    }

    async function submitRebelCommandFeedback(details) {
        const message = String(details == null ? '' : details).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 2000);
        if (!message) return false;
        if (!rebelCommandPaired()) {
            const enrolled = await ensureRebelCommandEnrollment(false);
            if (!enrolled || !rebelCommandPaired()) return false;
        }
        const p = rebelCommandPairing();
        const body = {
            version: VERSION,
            suggestions: [{
                suggestionId: `feedback:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`,
                title: 'Vector Rebel feedback',
                details: message,
                sourceVersion: VERSION,
                category: 'feedback',
                priority: 'medium',
                sourceContext: 'settings_general',
                timestamp: new Date().toISOString()
            }]
        };
        return new Promise(resolve => {
            GM_xmlhttpRequest({
                method: 'POST',
                url: REBEL_COMMAND_ENDPOINT,
                headers: {
                    Authorization: `Bearer ${p.token}`,
                    'X-Rebel-Device-ID': p.deviceId,
                    'Content-Type': 'application/json'
                },
                data: JSON.stringify(body),
                timeout: 12000,
                onload: response => resolve(response.status >= 200 && response.status < 300),
                onerror: () => resolve(false),
                ontimeout: () => resolve(false)
            });
        });
    }

    function telemetrySafeErrorMessage(value) {
        return String(value == null ? '' : value)
            .replace(/[\u0000-\u001f\u007f]/g, ' ')
            .replace(/\b\d{5,}\b/g, '[id]')
            .replace(/\b[A-Z][A-Z0-9]{2,}-\d{2,}\b/g, '[id]')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 300);
    }

    function looksLikeVectorRebelRuntime(error, source = '') {
        const haystack = `${source || ''} ${error?.stack || ''} ${error?.fileName || ''}`.toLowerCase();
        if (!haystack.trim()) return false;
        return haystack.includes('vector rebel') ||
            haystack.includes('vector-rebel') ||
            haystack.includes('vector-ppe-helper') ||
            haystack.includes('userscript');
    }

    let lastUnexpectedErrorSignature = '';
    let lastUnexpectedErrorAt = 0;
    function reportUnexpectedVectorRebelError(kind, error, source = '') {
        if (!looksLikeVectorRebelRuntime(error, source)) return;
        const message = telemetrySafeErrorMessage(error?.message || error || kind || 'Unexpected Vector Rebel runtime error.');
        if (!message) return;
        const signature = `${kind}:${message}`;
        const now = Date.now();
        if (signature === lastUnexpectedErrorSignature && now - lastUnexpectedErrorAt < 60000) return;
        lastUnexpectedErrorSignature = signature;
        lastUnexpectedErrorAt = now;
        void rebelCommandEvent('runtime_error', {
            success: false,
            action: 'unexpected_runtime',
            description: 'Unexpected Vector Rebel runtime error.',
            errorType: kind,
            errorMessage: message,
            metadata: { stage: 'global' }
        });
    }

    window.addEventListener('error', event => {
        reportUnexpectedVectorRebelError('UnhandledError', event?.error || event?.message || '', event?.filename || '');
    });

    window.addEventListener('unhandledrejection', event => {
        reportUnexpectedVectorRebelError('UnhandledRejection', event?.reason || '', '');
    });

    function verifyRebelCommandPairing() {
        if (!rebelCommandPaired()) return Promise.resolve(false);
        const p = rebelCommandPairing();
        return new Promise(resolve => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: REBEL_COMMAND_ENDPOINT,
                headers: {
                    Authorization: `Bearer ${p.token}`,
                    'X-Rebel-Device-ID': p.deviceId
                },
                timeout: 12000,
                onload: response => resolve(response.status >= 200 && response.status < 300),
                onerror: () => resolve(false),
                ontimeout: () => resolve(false)
            });
        });
    }

    window.MVCI_VECTOR_REBEL_TELEMETRY = {
        version: VERSION,
        endpoint: REBEL_COMMAND_ENDPOINT,
        paired: rebelCommandPaired,
        verify: verifyRebelCommandPairing
    };

    // Page-session identity is used only to ensure post-submit dwell never carries
    // across a full reload/navigation. It is not a signature or inspection identifier.
    const PAGE_SESSION_ID = `${Date.now()}:${Math.round(performance.timeOrigin || Date.now())}:${Math.random().toString(36).slice(2, 10)}`;
    // Tampermonkey performs managed version updates from the reviewed GitHub userscript URL.
    // Personal settings/signatures remain local in the browser across script updates.
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

    const SCBA_FACE_MASK_POOL = '299947';
    const SCBA_TOUR_TEMPLATE = '119122';
    // Verified on the live SCBA Face Mask Tour Checklist, October 22, 2026.
    const SCBA_TOUR_QUESTIONS = [
        'Proper seal while breathing air; no unusual noises/evidence of leaking',
        'Bypass valve checked for damage, flow tested and returned to the off position.',
        'Overall assembly, free from deterioration, dust, and damage',
        'Headnet and Harness: Functions and undamaged. All buckles working properly.',
        'Regulator Connection: All components accounted for; free of wear, cracks, and damage.',
        'Lens: Free of cracks, dirt, and damage.',
        'Heads Up Display (HUD): Operational Check, free of damage, replace batteries as needed.'
    ];

    const BUILTIN_MODES = {
        scbaTour: {
            key: 'scbaTour',
            title: 'SCBA Face Mask Tour Checklist',
            short: 'SCBA Face Mask Tour',
            templates: { [SCBA_FACE_MASK_POOL]: SCBA_TOUR_TEMPLATE }
        },
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
        '299881': 'Structural Boot',
        [SCBA_FACE_MASK_POOL]: 'SCBA Face Mask'
    };

    const DEFAULT_DEPARTMENT_PROFILE = {
        name: 'Department PPE Profile',
        profileVersion: 2,
        profileScope: BUILTIN_PROFILE_SCOPE,
        replaceBuiltins: false,
        expectedGearCount: 10,
        poolTypes: deepCloneSafe(BUILTIN_POOL_TYPES),
        modeTemplates: {
            scbaTour: deepCloneSafe(BUILTIN_MODES.scbaTour.templates),
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
        ppeRepairProfile: {idNumber:'',shift:'',pickupStation:'',deliveryStation:''},
        tourCoatComment: '',
        peopleDirectory: [],
        captainRosterPrefixes: [],
        captainSets: [],
        linkedPpeAssets: {},
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

    function refreshPortableSnapshot() {
        try {
            const items = {};
            for (const key of PORTABLE_BACKUP_KEYS) {
                const raw = GM_getValue(key, PORTABLE_STORAGE_SENTINEL);
                if (raw !== PORTABLE_STORAGE_SENTINEL) items[key] = String(raw);
            }
            GM_setValue(PORTABLE_SNAPSHOT_KEY, {
                schema: 'vector-rebel-portable-snapshot',
                schemaVersion: 1,
                helperVersion: VERSION,
                savedAt: new Date().toISOString(),
                items
            });
        } catch {}
    }

    function persistentGetRaw(key) {
        try {
            const gmValue = GM_getValue(key, PORTABLE_STORAGE_SENTINEL);
            if (gmValue !== PORTABLE_STORAGE_SENTINEL) {
                const raw = String(gmValue);
                try {
                    if (localStorage.getItem(key) !== raw) localStorage.setItem(key, raw);
                } catch {}
                return raw;
            }
        } catch {}
        try {
            const localValue = localStorage.getItem(key);
            if (localValue !== null) {
                try { GM_setValue(key, localValue); } catch {}
                if (PORTABLE_BACKUP_KEYS.includes(key)) refreshPortableSnapshot();
                return localValue;
            }
        } catch {}
        return null;
    }

    function persistentSetRaw(key, value) {
        const raw = String(value);
        try { GM_setValue(key, raw); } catch {}
        try { localStorage.setItem(key, raw); } catch {}
        if (PORTABLE_BACKUP_KEYS.includes(key)) refreshPortableSnapshot();
    }

    function persistentRemoveRaw(key) {
        try { GM_deleteValue(key); } catch {}
        try { localStorage.removeItem(key); } catch {}
        if (PORTABLE_BACKUP_KEYS.includes(key)) refreshPortableSnapshot();
    }

    function migrateCurrentOriginIntoPortableStorage() {
        for (const key of PORTABLE_BACKUP_KEYS) {
            try {
                const gmValue = GM_getValue(key, PORTABLE_STORAGE_SENTINEL);
                if (gmValue !== PORTABLE_STORAGE_SENTINEL) {
                    const raw = String(gmValue);
                    if (localStorage.getItem(key) !== raw) localStorage.setItem(key, raw);
                    continue;
                }
                const localValue = localStorage.getItem(key);
                if (localValue !== null) GM_setValue(key, localValue);
            } catch {}
        }
        refreshPortableSnapshot();
    }

    function loadJSON(key, fallback) {
        try {
            return JSON.parse(persistentGetRaw(key) || JSON.stringify(fallback));
        } catch {
            return fallback;
        }
    }

    function saveJSON(key, value) {
        persistentSetRaw(key, JSON.stringify(value));
    }

    migrateCurrentOriginIntoPortableStorage();

    // ============================================================
    // ============================================================
    // LOCAL PRODUCTION BUILD STATUS
    // ============================================================

    const MANAGED_UPDATE_URL = 'https://raw.githubusercontent.com/michaelbartbrion-cmd/mission-vector-check-it/main/beta/vector-rebel.user.js';

    function openManagedUpdate() {
        // Chrome deliberately isolates extension pages from website userscripts,
        // so we cannot type into the Utilities import field. Directly opening a
        // .user.js file invokes Tampermonkey's native Install/Reinstall flow
        // when script-URL detection is enabled. The clipboard is a fallback.
        try { GM_setClipboard(MANAGED_UPDATE_URL, 'text'); } catch {}
        try {
            const tab = GM_openInTab(MANAGED_UPDATE_URL, {
                active: true, insert: true, setParent: true
            });
            if (!tab) throw new Error('Tampermonkey did not open the install URL.');
            setStatus('Opened the direct Vector Rebel installer. Approve Install/Reinstall in Tampermonkey. If the browser displays raw script text instead, the update URL is copied for Utilities → Import from URL.');
        } catch (error) {
            try {
                window.open(MANAGED_UPDATE_URL, '_blank', 'noopener,noreferrer');
                setStatus('Opened the Vector Rebel update link. If direct installation is unavailable, use the copied URL in Tampermonkey Utilities.');
            } catch {
                setStatus('Direct installer blocked by the browser. Update URL copied; use Tampermonkey Utilities → Import from URL.', false);
            }
        }
    }

    function updateStatusHtml() {
        const telemetry = rebelCommandPaired() ? 'usage telemetry connected' : (rebelCommandProfileName() ? 'usage telemetry enrolling' : 'set My Tour PPE profile name to enable usage telemetry');
        return '<b>PRODUCTION BUILD:</b> Vector Rebel v' + escapeHtml(VERSION) + ' · managed updates enabled · ' + escapeHtml(telemetry) + '.';
    }

    async function showUpdateCenter() {
        alert(`Vector Rebel v${VERSION}

Managed Tampermonkey updates are enabled for this release.

Usage telemetry reports the configured My Tour PPE profile name, version, feature usage, liveness, and program errors to Rebel Command. Gear details, signatures, notes, asset IDs, and individual PASS/FAIL answers are not intentionally sent.`);
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

        if (rosterHasPersonSpecificPrefix(person)) return null;
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

    // Legacy PPE gear discovery uses a surname-style unique equipment prefix.
    // Generic inventory series are NOT a person's identity and must not be
    // auto-linked to a firefighter without verified assignment evidence.
    // Synthetic personnel identity, never an equipment serial prefix.
    function ownerRosterKey(name) {
        const key = masterNameKey(name);
        if (!key) return '';
        function h(seed) {
            let n = seed >>> 0;
            for (let i = 0; i < key.length; i++) {
                n = Math.imul(n ^ key.charCodeAt(i), 16777619) >>> 0;
            }
            return n.toString(16).toUpperCase().padStart(8, '0');
        }
        return 'PERSON-' + h(2166136261) + h(0x9e3779b9);
    }
    function rosterHasPersonSpecificPrefix(person) {
        return !!clean(person?.name) &&
            clean(person?.prefix).toUpperCase() === ownerRosterKey(person.name);
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
            affectedKeys.map(storageKey => [storageKey, persistentGetRaw(storageKey)])
        );

        try {
            saveJSON(MASTER_ROSTER_OVERRIDE_KEY, rosterPayload);
            saveJSON(CONFIG_KEY, normalizedConfig);
            saveJSON(GEAR_SNAPSHOTS_KEY, migratedSnapshots);
            configCache = normalizedConfig;
        } catch (error) {
            for (const storageKey of affectedKeys) {
                const prior = before[storageKey];
                if (prior === null) persistentRemoveRaw(storageKey);
                else persistentSetRaw(storageKey, prior);
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

    // Retain legitimate PERSON identities while allowing a legacy master list
    // to be selected WITHOUT treating its former gear prefix as ownership.
    // Migration is a display/identity projection only; stored configuration and
    // equipment records are not modified until the user saves a new roster/set.
    function getActiveMasterRoster() {
        const seen = new Set();
        return getMasterRosterState().people
            .filter(person => person.active !== false)
            .map(person => rosterHasPersonSpecificPrefix(person)
                ? person
                : { ...person, legacyPrefix: person.prefix,
                    prefix: ownerRosterKey(person.name) })
            .filter(person => {
                if (!person.prefix || seen.has(person.prefix)) return false;
                seen.add(person.prefix);
                return true;
            });
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
        persistentRemoveRaw(MASTER_ROSTER_OVERRIDE_KEY);
        persistentRemoveRaw(MASTER_ROSTER_REVIEW_KEY);
    }

    function rosterPersonByPrefix(prefix) {
        const wanted = clean(prefix).toUpperCase();
        if (!wanted) return null;
        const active = getActiveMasterRoster();
        const current = active.filter(person => person.prefix === wanted);
        if (current.length === 1) return current[0];
        // Old Captain Sets may use surname equipment prefixes. Resolve only
        // their PERSON names, and only when the name points to one active
        // person. Never use an old prefix as proof of PPE ownership.
        const legacy = active.filter(person => person.legacyPrefix === wanted);
        if (legacy.length === 1) return legacy[0];
        const oldPeople = getConfig().peopleDirectory.filter(p => p.prefix === wanted);
        if (oldPeople.length !== 1) return null;
        const samePerson = active.filter(person =>
            masterNameKey(person.name) === masterNameKey(oldPeople[0].name));
        return samePerson.length === 1 ? samePerson[0] : null;
    }

    function resolveCaptainSetPeople(set, config = getConfig()) {
        const seen = new Set();
        return (set?.memberPrefixes || [])
            .map(prefix => {
                const person = rosterPersonByPrefix(prefix);
                if (!person) return null;
                return {
                    ...person,
                    gearSearchPrefix: clean(
                        set?.gearSearchPrefixes?.[person.prefix] ||
                        set?.gearSearchPrefixes?.[prefix] ||
                        person.gearSearchPrefix
                    ).toUpperCase()
                };
            })
            .filter(person => {
                if (!person || seen.has(person.prefix)) return false;
                seen.add(person.prefix);
                return true;
            });
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
                gearSearchPrefixes: Object.fromEntries(
                    Object.entries(raw?.gearSearchPrefixes || {})
                        .map(([id,term]) => [clean(id).toUpperCase(), clean(term).toUpperCase()])
                        .filter(([id,term]) => id && term && term.length <= 60 &&
                            /^[A-Z0-9._-]+$/.test(term) && !term.startsWith('PERSON-'))
                ),
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

    // Exact-ID supplemental gear directory. This is a verified LOCAL lookup
    // index, not Vector's assignment database or an inspection completion.
    // Importantly these entries must not be mixed into Tour/After-Fire/Captain
    // inspection templates without mapping the appropriate Vector check.
    function normalizeLinkedPpeAssets(raw) {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
        const result = {};
        let total = 0;
        for (const [nameRaw, records] of Object.entries(raw)) {
            const key = masterNameKey(nameRaw);
            if (!key || !Array.isArray(records) || total >= 1000) continue;
            const distinct = new Set();
            const list = [];
            for (const record of records) {
                const assetId = clean(record?.assetId).toUpperCase();
                const pool = clean(record?.pool);
                const itemId = clean(record?.itemId);
                const ownerName = clean(record?.ownerName);
                if (!assetId || assetId.length > 160 ||
                    !/[A-Z0-9]/.test(assetId) ||
                    /[\u0000-\u001F\u007F]/.test(assetId) ||
                    !/^\d+$/.test(pool) || !/^\d+$/.test(itemId) ||
                    masterNameKey(ownerName) !== key ||
                    distinct.has(pool + ':' + itemId)) continue;
                distinct.add(pool + ':' + itemId);
                list.push({
                    assetId, pool, itemId, ownerName,
                    type: clean(record.type).slice(0, 100),
                    status: clean(record.status).slice(0, 100),
                    verifiedAt: clean(record.verifiedAt).slice(0, 50)
                });
                total++;
                if (list.length >= 30 || total >= 1000) break;
            }
            if (list.length) result[key] = list;
        }
        return result;
    }

    function linkedPpeForPerson(name, config = getConfig()) {
        return normalizeLinkedPpeAssets(config?.linkedPpeAssets || {})[masterNameKey(name)] || [];
    }

    function linkVerifiedPpeAsset(config, ownerName, item, expectedId) {
        const key = masterNameKey(ownerName);
        const expected = clean(expectedId).toUpperCase();
        if (!key || !expected || expected.length > 160 ||
            /[\u0000-\u001F\u007F]/.test(expected) ||
            !/[A-Z0-9]/.test(expected)) {
            throw new Error('Select a person and enter a valid exact PPE equipment name.');
        }
        if (clean(item?.assetId).toUpperCase() !== expected ||
            masterNameKey(item?.ownerName) !== key ||
            !/^\d+$/.test(clean(item?.pool)) ||
            !/^\d+$/.test(clean(item?.itemId))) {
            throw new Error('The exact PPE ID and Responsible Party did not both match. No link was saved.');
        }
        if (clean(item?.status).toLowerCase() !== 'in service') {
            throw new Error(expected + ' is not In Service. No active PPE link was saved.');
        }
        const directory = normalizeLinkedPpeAssets(config?.linkedPpeAssets || {});
        // Never silently attach a single item to two different people.
        for (const [name, records] of Object.entries(directory)) {
            if (name !== key && records.some(record =>
                record.pool === clean(item.pool) && record.itemId === clean(item.itemId))) {
                throw new Error('This PPE item is already linked locally to another person. Remove that old link after verifying the Vector assignment.');
            }
        }
        const current = directory[key] || [];
        const filtered = current.filter(record => !(
            record.pool === clean(item.pool) && record.itemId === clean(item.itemId)));
        if (filtered.length >= 30) throw new Error('30 saved exact-ID links per person is the limit.');
        directory[key] = [...filtered, {
            assetId: expected,
            pool: clean(item.pool), itemId: clean(item.itemId),
            ownerName: clean(item.ownerName),
            type: clean(item.type).slice(0, 100),
            status: clean(item.status).slice(0, 100),
            verifiedAt: new Date().toISOString()
        }];
        config.linkedPpeAssets = directory;
        return directory[key].length;
    }

    function unlinkPpeAsset(config, name, pool, itemId) {
        const directory = normalizeLinkedPpeAssets(config?.linkedPpeAssets || {});
        const key = masterNameKey(name);
        if (!key || !directory[key]) return false;
        const oldLength = directory[key].length;
        directory[key] = directory[key].filter(record =>
            record.pool !== clean(pool) || record.itemId !== clean(itemId));
        if (!directory[key].length) delete directory[key];
        config.linkedPpeAssets = directory;
        return (directory[key]?.length || 0) !== oldLength;
    }

    async function verifyExactPpeOwnership(ownerName, assetId, progress = null) {
        const name = clean(ownerName);
        const id = clean(assetId).toUpperCase();
        if (!name || !id || id.length > 160 || !/[A-Z0-9]/.test(id) ||
            /[\u0000-\u001F\u007F]/.test(id)) {
            throw new Error('Choose a valid person and enter the complete equipment ID.');
        }
        // This is ONE exact-item search, not a department crawl. The shared
        // searcher checks Responsible Party before returning any gear.
        const result = await scanPpeOwnerSearch({ name, prefix: id }, progress);
        const matches = result.items.filter(item =>
            clean(item.assetId).toUpperCase() === id &&
            masterNameKey(item.ownerName) === masterNameKey(name));
        if (matches.length !== 1) {
            throw new Error('Vector did not confirm exactly one item named ' + id +
                ' assigned to ' + name + '. No link was saved.');
        }
        return matches[0];
    }

    function migrateV2Config() {
        const existingV3 = loadJSON(CONFIG_KEY, null);
        if (existingV3) return existingV3;

        const legacy = loadJSON(LEGACY_CONFIG_KEY, null);
        if (!legacy) {
            const fresh = deepClone(DEFAULT_CONFIG);
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
            linkedPpeAssets: {},
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
            ppeRepairProfile: Object.fromEntries(
                ['idNumber','shift','pickupStation','deliveryStation'].map(key=>
                    [key,clean(String(stored.ppeRepairProfile?.[key]||''))])),
            selfPrefix,
            tourCoatComment: clean(stored.tourCoatComment),
            peopleDirectory: people,
            captainRosterPrefixes: captainSets.length ? deriveCaptainRosterPrefixes(stored, people, captainSets) : [],
            captainSets,
            linkedPpeAssets: normalizeLinkedPpeAssets(stored.linkedPpeAssets),
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

    // Each Tour run may contain both structural gear and a SCBA Face Mask.
    // Their official Vector checklist titles and form schemas are different.
    function getItemInspectionMode(run, item) {
        const key = item?.inspectionModeKey || run?.modeKey;
        const mode = getMode(key);
        if (!mode) throw new Error('No inspection mode mapped for ' + (item?.assetId || 'equipment'));
        return mode;
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
        setTimeout(() => { ensureRebelCommandEnrollment(true); }, 0);
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
        const run = loadJSON(RUN_KEY, null);
        if (!run || typeof run !== 'object' || Array.isArray(run)) return null;
        // A different open Vector tab can still hold an old localStorage run.
        // Previously, clearing the GM key let that tab resurrect an already
        // completed inspection after the last item was archived. Retire only
        // an exact run already present in the verified local archive.
        const summary = loadJSON(LAST_SUMMARY_KEY, null);
        const verifiedItems = summary?.groups && typeof summary.groups === 'object'
            ? Object.values(summary.groups).reduce(
                (count, group) => count + (Array.isArray(group?.items) ? group.items.length : 0), 0)
            : -1;
        if (run.runId && summary?.runId === run.runId &&
            summary.startedAt === run.startedAt &&
            summary.modeKey === run.modeKey &&
            summary.completedAt &&
            Number(summary.total) === run.items?.length &&
            verifiedItems === run.items?.length &&
            run.items?.length > 0) {
            // JSON null is a durable cross-tab tombstone, not a missing key.
            // Never rewrite unverified in-flight inspection data.
            persistentSetRaw(RUN_KEY, 'null');
            releaseRunOwnership();
            return null;
        }
        return run;
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
            persistentRemoveRaw(RUN_OWNER_KEY);
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
        // A missing GM value allows another open Check It tab's stale localStorage
        // to rehydrate and resurrect this run. Persist JSON null instead.
        persistentSetRaw(RUN_KEY, 'null');
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
        const mode = run?.modeKey ? getItemInspectionMode(run, item) : null;
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
        rebelCommandEvent('runtime_error', {
            success: false,
            workflowMode: run?.modeKey || '',
            errorType: 'ppe_run_stopped',
            errorMessage: clean(message || 'PPE run stopped for manual review.').replace(/\b\d{5,}\b/g, '[id]').slice(0, 300),
            metadata: { stage: run?.phase || 'unknown', itemCount: run?.items?.length || 0 }
        });
        saveDiagnostic(message, run);
        if (run) {
            const deferred = loadJSON(CAPTAIN_DAILY_DEFERRED_KEY, null);
            if (deferred?.runId === run.runId) persistentRemoveRaw(CAPTAIN_DAILY_DEFERRED_KEY);
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

    function buildPortableBackupPayload() {
        const items = {};
        for (const key of PORTABLE_BACKUP_KEYS) {
            const raw = persistentGetRaw(key);
            if (raw !== null) items[key] = raw;
        }
        return {
            schema: 'vector-rebel-portable-backup',
            schemaVersion: 1,
            helperVersion: VERSION,
            exportedAt: new Date().toISOString(),
            note: 'Personal Vector Rebel backup. May contain names, signatures, PPE preferences, Captain Sets, roster data, local rules, and local history. Keep private.',
            items
        };
    }

    function exportPortableBackup() {
        const payload = buildPortableBackupPayload();
        downloadTextFile(
            `vector-rebel-full-backup-${new Date().toISOString().slice(0, 10)}.json`,
            JSON.stringify(payload, null, 2)
        );
        setStatus('Portable Vector Rebel backup exported. Keep this file private.');
    }

    function validatePortableBackupPayload(payload) {
        if (!payload || payload.schema !== 'vector-rebel-portable-backup' || Number(payload.schemaVersion) !== 1) {
            throw new Error('This is not a supported Vector Rebel full backup file.');
        }
        if (!payload.items || typeof payload.items !== 'object' || Array.isArray(payload.items)) {
            throw new Error('Backup items are missing or invalid.');
        }
        const allowed = new Set(PORTABLE_BACKUP_KEYS);
        const items = {};
        for (const [key, value] of Object.entries(payload.items)) {
            if (!allowed.has(key)) continue;
            if (typeof value !== 'string') throw new Error(`Backup value for ${key} is invalid.`);
            items[key] = value;
        }
        if (!Object.keys(items).length) throw new Error('Backup contains no restorable Vector Rebel settings.');
        return { ...payload, items };
    }

    function readPortableBackupFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onerror = () => reject(new Error('Could not read the Vector Rebel backup file.'));
            reader.onload = () => {
                try {
                    resolve(validatePortableBackupPayload(JSON.parse(String(reader.result || ''))));
                } catch (error) {
                    reject(error);
                }
            };
            reader.readAsText(file);
        });
    }

    function restorePortableBackup(payload) {
        const validated = validatePortableBackupPayload(payload);
        for (const key of PORTABLE_BACKUP_KEYS) persistentRemoveRaw(key);
        for (const [key, value] of Object.entries(validated.items)) persistentSetRaw(key, value);
        configCache = null;
        refreshPortableSnapshot();
        setStatus('Portable Vector Rebel backup restored. Reloading...');
        setTimeout(() => location.reload(), 700);
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
            const failed = item.inspectionModeKey === 'scbaTour'
                ? (item.scbaAnswers || []).includes('fail')
                : item.q1 === 'fail' || item.q2 === 'fail';
            if (failed) groups[owner].failed += 1;
            const completion = (run.completed || []).find(c => c.assetId === item.assetId);
            groups[owner].items.push({
                assetId: item.assetId,
                type: item.type,
                q1: item.q1,
                q2: item.q2,
                inspectionModeKey: item.inspectionModeKey || run.modeKey,
                scbaAnswers: Array.isArray(item.scbaAnswers) ? item.scbaAnswers.slice() : null,
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

        {
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
                        const failed = item.scbaAnswers
                            ? item.scbaAnswers.includes('fail')
                            : item.q1 === 'fail' || item.q2 === 'fail';
                        const row = document.createElement('div');
                        row.style.cssText =
                            `padding:7px 9px;margin:3px 0;border:1px solid #e0e6ea;border-radius:6px;${failed ? 'background:#fff4f4;' : ''}`;
                        row.innerHTML =
                            `<b>${escapeHtml(item.assetId || '')}</b> — ${escapeHtml(item.type || '')}` +
                            (item.scbaAnswers
                                ? `<br><b>SCBA Face Mask Tour:</b> ${item.scbaAnswers.length} question(s) — ${item.scbaAnswers.map(v => escapeHtml(v.toUpperCase())).join(', ')}`
                                : `<br>Age/label: <b>${escapeHtml((item.q1 || '').toUpperCase())}</b> · ` +
                                  `Damage: <b>${escapeHtml((item.q2 || '').toUpperCase())}</b>`) +
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
                                `<br>parser path: ${escapeHtml(hv.parserPath || 'n/a')}` +
                                ` · rows read: ${escapeHtml(String(hv.rowCount ?? 'n/a'))}` +
                                `<br>added keys: ${escapeHtml((hv.addedKeys || []).join(', ') || 'none')}` +
                                ((hv.addedRowTexts || []).length
                                    ? `<br>added row: ${escapeHtml((hv.addedRowTexts || []).join(' | '))}`
                                    : '') +
                                ((hv.postSubmitRowTexts || []).length
                                    ? `<br>post-submit rows:<br>${(hv.postSubmitRowTexts || []).map(t => '&nbsp;&nbsp;' + escapeHtml(t)).join('<br>')}`
                                    : '');
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
            // Local-only read-only evidence of the actual assignment column layout.
            // Do not transmit to telemetry or change any Vector record.
            report.checks.ownerColumnDiagnostics = anchors.slice(0, 8).map(a => {
                const row = ppeRowForAnchor(a);
                const cells = row ? [...row.querySelectorAll(':scope > td, :scope > [role="cell"]')] : [];
                const table = row?.closest('table');
                const headers = table ? [...table.querySelectorAll('thead th')].map(h => clean(h.innerText || h.textContent || '').slice(0, 90)) : [];
                const ni = headers.findIndex(h => h.toLowerCase() === 'name');
                const assetId = ni >= 0 ? clean(cells[ni]?.innerText || cells[ni]?.textContent || '') : '';
                return {
                    assetId,
                    columns: cells.map((cell, index) => ({
                        index,
                        heading: headers[index] || '',
                        dataLabel: clean(cell.getAttribute('data-label') || cell.getAttribute('aria-label') || '').slice(0, 90),
                        text: clean(cell.innerText || cell.textContent || '').slice(0, 180)
                    })),
                    candidateName: likelyPersonFromPpeRow(row, assetId)
                };
            });
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
                persistentRemoveRaw(LAST_DIAGNOSTIC_KEY);
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
            persistentSetRaw(SIGNATURE_CURSOR_KEY, '0');
        }
    }

    function getSignatureLibrary() {
        migrateLegacySignature();
        const library = loadJSON(SIGNATURE_LIBRARY_KEY, []);
        return Array.isArray(library) ? library : [];
    }

    function saveSignatureLibrary(library) {
        saveJSON(SIGNATURE_LIBRARY_KEY, library);
        const cursor = Number(persistentGetRaw(SIGNATURE_CURSOR_KEY) || 0);
        if (!library.length) {
            persistentSetRaw(SIGNATURE_CURSOR_KEY, '0');
        } else if (cursor >= library.length) {
            persistentSetRaw(SIGNATURE_CURSOR_KEY, '0');
        }
        refreshPanelInfo();
    }

    function peekSignatureVariant() {
        const library = getSignatureLibrary();
        if (!library.length) {
            throw new Error('No saved signature variants. Open Settings → Signatures and add at least one signature you personally drew.');
        }

        let cursor = Number(persistentGetRaw(SIGNATURE_CURSOR_KEY) || 0);
        if (!Number.isFinite(cursor) || cursor < 0) cursor = 0;
        const index = cursor % library.length;
        return { variant: library[index], index, total: library.length };
    }

    function advanceSignatureCursor(index, total) {
        if (!Number.isInteger(total) || total <= 0) return;
        persistentSetRaw(SIGNATURE_CURSOR_KEY, String((index + 1) % total));
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
            const cursor = Number(persistentGetRaw(SIGNATURE_CURSOR_KEY) || 0);

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
            persistentSetRaw(SIGNATURE_CURSOR_KEY, '0');
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
            'nothing found',
            'no ppe item found'
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

    async function discoverOwnerGear(owner, modeKey, inventory) {
        if (!inventory || inventory.source !== 'Vector PPE Responsible Party column' ||
            !Array.isArray(inventory.items)) {
            throw new Error('Fresh PPE Responsible Party scan is required.');
        }
        const ownerKey = masterNameKey(owner?.name);
        if (!ownerKey) throw new Error('Missing inspector-selected owner name.');
        const items = inventory.items.filter(item => item.ownerName &&
            masterNameKey(item.ownerName) === ownerKey &&
            clean(item.status).toLowerCase() === 'in service');
        const mode = getMode(modeKey);
        const scba = modeKey === 'tour' ? getMode('scbaTour') : null;
        if (scba && items.some(item => item.pool === '299947') &&
            scba.templates['299947'] !== '119122') {
            throw new Error('SCBA Face Mask Tour Checklist template mapping is not the verified 119122. Inspection blocked.');
        }
        const applicableTemplate = item => item.pool === '299947' && scba
            ? { template: scba.templates[item.pool], inspectionModeKey: 'scbaTour' }
            : mode?.templates?.[item.pool]
                ? { template: mode.templates[item.pool], inspectionModeKey: modeKey }
                : null;
        const unmatched = items.filter(item =>
            !applicableTemplate(item) || getPoolType(item.pool) === 'UNKNOWN');
        // Responsible Party covers ALL assigned equipment. SCBA, water-rescue,
        // and other distinct equipment pools have their own inspections and
        // must not block a routine structural PPE mode, but a newly introduced
        // structural PPE pool without a mapped template MUST block.
        // These live-confirmed pool names are distinct from structural bunker PPE.
        // Recognize ONLY the matching pool + type combination; do not infer that
        // any other unmapped coat, pant, or helmet can be skipped. They remain
        // visible as other assigned equipment, never auto-inspected or certified.
        const distinctPpePoolTypes = {
            '299896': /^dual certification coat\b/i,
            '299897': /^dual certification pant\b/i,
            '300006': /^wildland helmet\b/i
        };
        const structural = /\b(?:bunker|structural|turnout|hood|helmet|glove|boot|coat|pant)\b/i;
        const supplemental = unmatched.filter(item => {
            const type = clean(item.type);
            if (!type || type.toUpperCase() === 'UNKNOWN') return false;
            const recognized = distinctPpePoolTypes[clean(item.pool)];
            if (recognized && recognized.test(type)) return true;
            return !structural.test(type);
        });
        const supplementalIds = new Set(supplemental.map(item =>
            item.pool + ':' + item.itemId));
        const unknown = unmatched.filter(item =>
            !supplementalIds.has(item.pool + ':' + item.itemId));
        const blocked = new Set(unmatched.map(item => item.pool + ':' + item.itemId));
        const mapped = items.filter(item => !blocked.has(item.pool + ':' + item.itemId))
            .map(item => ({...item, ...applicableTemplate(item)}));
        return {
            items: mapped, unknown, supplemental,
            searchMeta: {
                source: inventory.source,
                capturedAt: inventory.capturedAt,
                pageCount: inventory.pageCount,
                verifiedBy: 'Responsible Party'
            }
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

    const ITEM_LOG_HEADER_LABELS = [
        'DATE', 'PERSONNEL', 'LOCATION TYPE', 'LOCATION', 'RESPONSIBLE PARTY', 'NOTES', 'USER', 'TYPE'
    ];

    // v2.3.10: Vector's production Item Log does not always mark header cells as
    // <th> or role="columnheader". Fall back to the first row's plain cells so a
    // semantic container is still recognised instead of silently dropping to the
    // text path.
    function historyContainerHeaderText(container) {
        if (!container) return '';

        const semantic = [...container.querySelectorAll('th,[role="columnheader"]')]
            .map(el => itemLogRowText(el))
            .filter(Boolean);
        if (semantic.length) return uiText(semantic.join(' ')).toUpperCase();

        const firstRow =
            container.querySelector('thead tr') ||
            container.querySelector('tr') ||
            container.querySelector('[role="row"]');
        if (!firstRow) return '';

        const cells = [...firstRow.querySelectorAll('td,th,[role="cell"],[role="gridcell"],div,span')]
            .map(el => itemLogRowText(el))
            .filter(text => text && text.length <= 40);
        if (!cells.length) return '';

        const labelled = cells.filter(text =>
            ITEM_LOG_HEADER_LABELS.some(label => uiEquals(text, label))
        );
        // Only treat it as a header row when it really is one.
        return labelled.length >= 3 ? uiText(labelled.join(' ')).toUpperCase() : '';
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

    // ------------------------------------------------------------------
    // STRUCTURAL ROW RECONSTRUCTION (v2.3.10)
    // ------------------------------------------------------------------
    // Production Vector splits a history record across sibling cells:
    //   DATE | PERSONNEL | LOCATION TYPE | LOCATION | RESPONSIBLE PARTY | NOTES
    // No single element holds the whole record, and the container may be a
    // <table> without <th>, an ARIA grid, or plain nested divs. Rather than
    // guessing a selector, reconstruct each row by walking up from the cell that
    // carries the inspection title and COMPLETE until the smallest ancestor that
    // also carries a date. That works for every layout because it relies on the
    // record's own content, not on Vector's markup choices.
    //
    // Nothing is injected into the page. This reads the live DOM only.

    const ITEM_LOG_ROW_CANDIDATE_SELECTOR =
        'tr,[role="row"],li,article,p,div,span,a,dt,dd,label,time,strong,b,td,[role="cell"],[role="gridcell"]';

    function itemLogAnchorElements(modeTitle) {
        return [...document.querySelectorAll(ITEM_LOG_ROW_CANDIDATE_SELECTOR)]
            .filter(visible)
            .filter(el => !el.closest(`#${PANEL_ID}, #${OVERLAY_ID}`))
            .map(el => ({ el, text: itemLogRowText(el) }))
            .filter(x =>
                x.text &&
                x.text.length <= 600 &&
                uiIncludes(x.text, modeTitle) &&
                /\bCOMPLETED?\b/i.test(x.text) &&
                !/\bINCOMPLETE\b/i.test(x.text)
            )
            // Smallest first, so the walk-up starts from the status/notes cell
            // rather than from a wrapper that already spans several rows.
            .sort((a, b) => a.text.length - b.text.length);
    }

    function reconstructItemLogRowFromAnchor(anchor, modeTitle) {
        let node = anchor;
        for (let depth = 0; node && depth < 16; depth += 1, node = node.parentElement) {
            if (!visible(node)) continue;
            if (node.closest(`#${PANEL_ID}, #${OVERLAY_ID}`)) continue;

            const text = itemLogRowText(node);
            if (!text || text.length > 2000) continue;
            if (!historyDateTokenPresent(text)) continue;
            if (!uiIncludes(text, modeTitle)) continue;
            if (!/\bCOMPLETED?\b/i.test(text)) continue;
            if (/\bINCOMPLETE\b/i.test(text)) continue;

            // A real row carries exactly one date. More than one means we walked
            // past the row and into a container holding several records.
            const dates = text.match(/\b\d{1,2}[\/-]\d{1,2}[\/-]\d{4}\b/g) || [];
            if (dates.length !== 1) return null;

            return node;
        }
        return null;
    }

    // Reconstructed rows, in DOM order, multiplicity preserved.
    function structuralItemLogRows(modeTitle) {
        const rows = [];
        const seen = new Set();

        for (const anchor of itemLogAnchorElements(modeTitle)) {
            const row = reconstructItemLogRowFromAnchor(anchor.el, modeTitle);
            if (!row || seen.has(row)) continue;
            seen.add(row);
            rows.push(row);
        }

        // Keep the innermost match when one reconstructed row contains another.
        const innermost = rows.filter(row => !rows.some(other => other !== row && row.contains(other)));

        innermost.sort((a, b) => {
            const pos = a.compareDocumentPosition(b);
            if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
            if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1;
            return 0;
        });
        return innermost;
    }

    function textHistoryEntryElements(modeTitle) {
        return structuralItemLogRows(modeTitle).map(el => ({ el, text: itemLogRowText(el) }));
    }

    // Deliberately generic page scan, used ONLY to detect a parser failure.
    // It is never completion evidence and never feeds a count.
    function assetPageCompletedTextEvidence(modeTitle) {
        const seen = new Set();
        const found = [];
        for (const candidate of itemLogAnchorElements(modeTitle)) {
            const text = candidate.text;
            if (!historyDateTokenPresent(text)) continue;
            const key = `${text}`;
            if (seen.has(key)) continue;
            seen.add(key);
            found.push(text.slice(0, 160));
            if (found.length >= 20) break;
        }
        return found;
    }

    function rowLooksLikeCompletedModeEntry(row, modeTitle) {
        const text = itemLogRowText(row);
        return !!(
            text &&
            uiIncludes(text, modeTitle) &&
            /\bCOMPLETED?\b/i.test(text) &&
            !/\bINCOMPLETE\b/i.test(text)
        );
    }

    // Returns { rows, parserPath } or null when the history region cannot be read
    // at all. null is deliberately distinct from an empty history.
    function itemLogCompletedRowSource(item, modeTitle) {
        if (!isAssetPageFor(item) || !assetPageContainsExpectedId(item)) return null;

        const container = findItemLogHistoryTable();
        if (container) {
            const rows = historyRows(container)
                .filter(row => rowLooksLikeCompletedModeEntry(row, modeTitle));
            if (rows.length) return { rows, parserPath: 'semantic-container' };

            // A recognised container with no matching rows is still a real read,
            // but cross-check the structural pass before trusting a zero: the
            // container may be a header-only shell with the records rendered
            // outside it.
            const structural = structuralItemLogRows(modeTitle);
            if (structural.length) return { rows: structural, parserPath: 'structural-outside-container' };
            return { rows: [], parserPath: 'semantic-container-empty' };
        }

        const structural = structuralItemLogRows(modeTitle);
        if (structural.length) return { rows: structural, parserPath: 'structural' };

        if (findHistorySectionAnchor()) return { rows: [], parserPath: 'history-region-empty' };
        return null;
    }

    function itemLogCompletedRowElements(item, modeTitle) {
        const source = itemLogCompletedRowSource(item, modeTitle);
        return source ? source.rows : null;
    }

    function modeHistoryEntries(item, modeTitle) {
        const rows = itemLogCompletedRowElements(item, modeTitle);
        if (rows === null) return [];

        return rows.map(row => ({
            element: row,
            text: itemLogRowText(row),
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
            const text = itemLogRowText(row);
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
        const source = itemLogCompletedRowSource(item, modeTitle);
        if (source === null) return null;
        const rows = source.rows;

        const records = itemLogRowKeys(rows);
        const keys = records.map(record => record.key);
        const texts = records.map(record => record.text);
        return {
            count: records.length,
            keys,
            texts,
            records,
            usesStableIds: records.length > 0 && records.every(record => record.stableId),
            parserPath: source.parserPath,
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

    // ------------------------------------------------------------------
    // ROW TEXT (v2.3.10)
    // ------------------------------------------------------------------
    // Element.textContent concatenates adjacent cells with NO separator:
    //   <span>06/01/2026</span><span>Michael Brion</span>
    //   -> "06/01/2026Michael Brion"
    // The trailing \b of the date pattern then fails and the row is discarded,
    // which is exactly how a fully rendered Item Log was counted as zero rows.
    // innerText inserts the separators, but it depends on a live layout engine,
    // is expensive, and is undefined for elements that are not rendered.
    // itemLogRowText joins every descendant text node with a single space, so
    // cell boundaries always exist and the result is deterministic.
    // Compact, name-redacted row text for admin diagnostics only.
    function compactHistoryRowText(text) {
        const compact = uiText(text || '').slice(0, 140);
        return redactDiagnosticText(compact, null);
    }

    function itemLogRowText(element) {
        if (!element) return '';
        if (element.nodeType === 3) return uiText(element.nodeValue || '');

        const parts = [];
        const walk = node => {
            if (!node) return;
            if (node.nodeType === 3) {
                const value = String(node.nodeValue || '').trim();
                if (value) parts.push(value);
                return;
            }
            if (node.nodeType !== 1) return;
            const tag = (node.tagName || '').toLowerCase();
            if (tag === 'script' || tag === 'style' || tag === 'noscript' || tag === 'template') return;
            for (const child of node.childNodes) walk(child);
        };
        walk(element);
        return uiText(parts.join(' '));
    }

    function rowHasCompletedStatus(row) {
        const status = itemLogRowText(row).toUpperCase();
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
    // DAILY CAPTAIN CHECK — READ-ONLY HISTORY AUDIT
    // ============================================================

    let captainDailyBusy = false;
    let captainDailyCancelSerial = 0;

    // Michael's normal 48/96 rotation is two consecutive 24-hour shifts followed
    // by four days off. Sep 22, 2026 is a verified first-shift anchor from the
    // current CrewSense/Scout schedule. The picker always exposes the inferred
    // start date so a trade or special assignment can be audited explicitly.
    const CAPTAIN_TOUR_ANCHOR_DATE = '2026-09-22';
    const CAPTAIN_TOUR_CYCLE_DAYS = 6;
    const CAPTAIN_TOUR_SHIFT_DAYS = 2;

    function getCaptainDailyCheck() {
        const value = loadJSON(CAPTAIN_DAILY_CHECK_KEY, null);
        return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
    }

    function saveCaptainDailyCheck(value) {
        if (value && typeof value === 'object') value.updatedAt = new Date().toISOString();
        saveJSON(CAPTAIN_DAILY_CHECK_KEY, value);
        return value;
    }

    function clearCaptainDailyCheck() {
        persistentRemoveRaw(CAPTAIN_DAILY_CHECK_KEY);
    }

    async function cancelCaptainDailyCheckForRealInspection() {
        const active = getCaptainDailyCheck();
        if (!active) return false;
        captainDailyCancelSerial += 1;
        clearCaptainDailyCheck();
        const deadline = Date.now() + 12000;
        while (captainDailyBusy && Date.now() < deadline) await wait(100);
        return true;
    }

    function captainDailyNavKey(item) {
        return clean(item?.assetId || item?.url || 'unknown').toUpperCase();
    }

    function navigateCaptainDailyToItem(check, item) {
        if (!check || !item?.url) {
            const message = 'Daily Captain Check stopped: PPE item navigation target is missing.';
            clearCaptainDailyCheck();
            setStatus(message, false);
            saveDiagnostic(message);
            return false;
        }
        check.navAttempts = check.navAttempts && typeof check.navAttempts === 'object' ? check.navAttempts : {};
        const key = captainDailyNavKey(item);
        const attempts = Number(check.navAttempts[key] || 0) + 1;
        check.navAttempts[key] = attempts;
        if (attempts > 3) {
            const message = `Daily Captain Check stopped: ${item.assetId || 'PPE item'} could not be reached after 3 navigation attempts.`;
            clearCaptainDailyCheck();
            setStatus(message, false);
            saveDiagnostic(message);
            return false;
        }
        saveCaptainDailyCheck(check);
        location.href = item.url;
        return true;
    }

    function getCaptainDailyReport() {
        const value = loadJSON(CAPTAIN_DAILY_REPORT_KEY, null);
        return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
    }

    function localHistoryDateKey(timestamp) {
        if (!Number.isFinite(timestamp)) return '';
        const d = new Date(timestamp);
        if (!Number.isFinite(d.getTime())) return '';
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }

    function localTodayKey(date = new Date()) {
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    }

    function validDateKey(value) {
        const raw = clean(value);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return '';
        const [y, m, d] = raw.split('-').map(Number);
        const utc = new Date(Date.UTC(y, m - 1, d));
        if (utc.getUTCFullYear() !== y || utc.getUTCMonth() !== m - 1 || utc.getUTCDate() !== d) return '';
        return raw;
    }

    function utcDayNumber(dateKey) {
        const valid = validDateKey(dateKey);
        if (!valid) return null;
        const [y, m, d] = valid.split('-').map(Number);
        return Math.floor(Date.UTC(y, m - 1, d) / 86400000);
    }

    function addDateKeyDays(dateKey, days) {
        const base = utcDayNumber(dateKey);
        if (!Number.isFinite(base)) return '';
        const d = new Date((base + Number(days || 0)) * 86400000);
        return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
    }

    function inferRegularTourWindow(referenceDate = new Date()) {
        const todayKey = localTodayKey(referenceDate);
        const todayDay = utcDayNumber(todayKey);
        const anchorDay = utcDayNumber(CAPTAIN_TOUR_ANCHOR_DATE);
        if (!Number.isFinite(todayDay) || !Number.isFinite(anchorDay)) {
            return { startDate: todayKey, endDate: addDateKeyDays(todayKey, 1), isActiveTour: true, source: 'fallback' };
        }
        const cycles = Math.floor((todayDay - anchorDay) / CAPTAIN_TOUR_CYCLE_DAYS);
        const startDay = anchorDay + cycles * CAPTAIN_TOUR_CYCLE_DAYS;
        const offset = todayDay - startDay;
        const start = new Date(startDay * 86400000);
        const startDate = `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, '0')}-${String(start.getUTCDate()).padStart(2, '0')}`;
        return {
            startDate,
            endDate: addDateKeyDays(startDate, CAPTAIN_TOUR_SHIFT_DAYS - 1),
            isActiveTour: offset >= 0 && offset < CAPTAIN_TOUR_SHIFT_DAYS,
            source: '48/96-anchor'
        };
    }

    function displayHistoryDateKey(value) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return 'Not verified';
        const d = new Date(`${value}T12:00:00`);
        return Number.isFinite(d.getTime())
            ? d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
            : value;
    }

    function displayMonthKey(value) {
        if (!/^\d{4}-\d{2}$/.test(value || '')) return 'Unknown month';
        const d = new Date(`${value}-01T12:00:00`);
        return Number.isFinite(d.getTime())
            ? d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
            : value;
    }

    function previousMonthKey(dateKey) {
        const valid = validDateKey(dateKey);
        if (!valid) return '';
        const [y, m] = valid.split('-').map(Number);
        const d = new Date(Date.UTC(y, m - 2, 1));
        return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    }

    function captainAuditWindow(asOfDateKey) {
        const asOfDate = validDateKey(asOfDateKey) || localTodayKey();
        const currentMonth = asOfDate.slice(0, 7);
        const priorMonth = previousMonthKey(asOfDate);
        const startDate = `${priorMonth}-01`;
        const [currentYear, currentMonthNumber] = currentMonth.split('-').map(Number);
        const nextMonthStart = new Date(Date.UTC(currentYear, currentMonthNumber, 1));
        const end = new Date(nextMonthStart.getTime() - 86400000);
        const endDate = `${end.getUTCFullYear()}-${String(end.getUTCMonth() + 1).padStart(2, '0')}-${String(end.getUTCDate()).padStart(2, '0')}`;
        const startDay = utcDayNumber(startDate);
        const endDay = utcDayNumber(endDate);
        const asOfDay = utcDayNumber(asOfDate);
        const anchorDay = utcDayNumber(CAPTAIN_TOUR_ANCHOR_DATE);
        const now = new Date();
        const todayKey = localTodayKey(now);
        const shiftStartReached = asOfDate < todayKey || (asOfDate === todayKey && now.getHours() >= 7);
        const dueThroughDay = asOfDay - (asOfDate === todayKey && !shiftStartReached ? 1 : 0);
        const tours = [];
        if (Number.isFinite(startDay) && Number.isFinite(endDay) && Number.isFinite(asOfDay) && Number.isFinite(anchorDay)) {
            let cycle = Math.floor((startDay - anchorDay) / CAPTAIN_TOUR_CYCLE_DAYS) - 1;
            for (let guard = 0; guard < 100; guard += 1, cycle += 1) {
                const tourStartDay = anchorDay + cycle * CAPTAIN_TOUR_CYCLE_DAYS;
                if (tourStartDay > endDay) break;
                if (tourStartDay < startDay) continue;
                const start = new Date(tourStartDay * 86400000);
                const startKey = `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, '0')}-${String(start.getUTCDate()).padStart(2, '0')}`;
                const endKey = addDateKeyDays(startKey, CAPTAIN_TOUR_SHIFT_DAYS - 1);
                const eligibleDates = [startKey, endKey].filter(key => {
                    const day = utcDayNumber(key);
                    return Number.isFinite(day) && day <= asOfDay;
                });
                tours.push({
                    month: startKey.slice(0, 7),
                    startDate: startKey,
                    endDate: endKey,
                    eligibleDates,
                    due: tourStartDay <= dueThroughDay
                });
            }
        }
        return {
            asOfDate,
            startDate,
            endDate,
            shiftStartHour: 7,
            months: [priorMonth, currentMonth],
            tours
        };
    }

    function historyEntriesFromSource(source) {
        const entries = (source?.rows || []).map((row, index) => {
            const audit = historyRowAudit(row, index);
            const text = itemLogRowText(row);
            const parsedAt = Number.isFinite(audit.parsedAt) ? audit.parsedAt : parseVectorHistoryDate(text);
            return {
                parsedAt,
                dateKey: localHistoryDateKey(parsedAt),
                displayed: audit.firstCell || clean(text).slice(0, 80)
            };
        }).filter(entry => entry.dateKey);

        const seen = new Set();
        const dates = [];
        for (const entry of entries.sort((a, b) => b.parsedAt - a.parsedAt)) {
            if (seen.has(entry.dateKey)) continue;
            seen.add(entry.dateKey);
            dates.push(entry.dateKey);
        }
        return dates;
    }

    async function readModeCompletionHistory(item, modeKey) {
        const mode = getMode(modeKey);
        if (!mode) throw new Error(`${modeKey}: inspection mode is unavailable.`);
        const settled = await waitForItemLogSnapshotSettled(item, mode.title, 9000, 3);
        if (!settled) throw new Error(`${item.assetId}: ${mode.short} Item Log did not become readable and stable.`);
        const source = itemLogCompletedRowSource(item, mode.title);
        if (!source) throw new Error(`${item.assetId}: ${mode.short} Item Log history could not be read.`);
        const dates = historyEntriesFromSource(source);
        return {
            title: mode.title,
            short: mode.short,
            parserPath: source.parserPath,
            dates,
            latestDate: dates[0] || '',
            completedRowCount: source.rows.length
        };
    }

    async function readCaptainComplianceHistory(item) {
        const captainMode = getMode('captain');
        if (!captainMode) throw new Error('Captain inspection mode is unavailable.');
        if (!isAssetPageFor(item)) throw new Error(`${item.assetId}: wrong PPE asset page.`);
        if (!(await verifyExpectedAssetPage(item))) throw new Error(`${item.assetId}: asset identity could not be verified.`);

        if (item.inspectionModeKey === 'scbaTour') {
            const scbaMode = getMode('scbaTour');
            if (!scbaMode || item.pool !== SCBA_FACE_MASK_POOL ||
                item.template !== scbaMode.templates[item.pool]) {
                throw new Error(item.assetId + ': SCBA pool/template mismatch; history not trusted.');
            }
            await revealAssetHistory(item, scbaMode.title, 600);
            const tour = await readModeCompletionHistory(item, 'scbaTour');
            return {
                captain: { dates: [], latestDate: '', notApplicable: true },
                tour
            };
        }
        await revealAssetHistory(item, captainMode.title, 600);
        const captain = await readModeCompletionHistory(item, 'captain');
        const tour = await readModeCompletionHistory(item, 'tour');
        return { captain, tour };
    }

    function buildCaptainDailyReport(check) {
        const window = captainAuditWindow(check.auditAsOfDate || localTodayKey());
        const monthKeys = window.months;
        const tourWindows = window.tours;
        const dueTourWindows = tourWindows.filter(tourWindow => tourWindow.due === true);

        const owners = (check.owners || []).map(owner => {
            const items = (check.items || []).filter(item => item.ownerPrefix === owner.prefix);
            const results = (check.results || []).filter(result => result.ownerPrefix === owner.prefix);
            const byAsset = new Map(results.map(result => [result.assetId, result]));
            const itemRows = items.map(item => {
                const result = byAsset.get(item.assetId);
                const captainDates = Array.isArray(result?.captain?.dates) ? result.captain.dates : [];
                const tourHistoryDates = Array.isArray(result?.tour?.dates) ? result.tour.dates : [];
                const readable = result?.status === 'ok';
                const captainApplicable = item.inspectionModeKey !== 'scbaTour';
                const monthlyChecks = monthKeys.map(month => {
                    if (!captainApplicable) return { month, date: '', ok: true, applicable: false };
                    const date = captainDates.find(value => value.startsWith(`${month}-`) && value <= window.asOfDate) || '';
                    return { month, date, ok: readable && !!date, applicable: true };
                });
                const tourChecks = tourWindows.map(tourWindow => {
                    const eligible = new Set(tourWindow.eligibleDates || []);
                    const date = tourHistoryDates.find(value => eligible.has(value)) || '';
                    return {
                        month: tourWindow.month || tourWindow.startDate.slice(0, 7),
                        startDate: tourWindow.startDate,
                        endDate: tourWindow.endDate,
                        eligibleDates: tourWindow.eligibleDates || [],
                        due: tourWindow.due === true,
                        date,
                        ok: readable && !!date
                    };
                });
                const monthlyOk = readable && monthlyChecks.every(checkRow => checkRow.ok);
                const toursOk = readable && tourChecks.filter(checkRow => checkRow.due).every(checkRow => checkRow.ok);
                return {
                    assetId: item.assetId,
                    type: item.type,
                    inspectionModeKey: item.inspectionModeKey || 'captain',
                    status: result?.status || 'missing',
                    latestCaptainDate: result?.captain?.latestDate || '',
                    captainDates,
                    latestTourDate: result?.tour?.latestDate || '',
                    tourDates: tourHistoryDates,
                    monthlyChecks,
                    tourChecks,
                    captainMonthlyOk: monthlyOk,
                    tourCheckOk: toursOk,
                    compliant: readable && monthlyOk && toursOk,
                    error: result?.error || ''
                };
            });

            const discovery = (check.discovery || []).find(x => x.prefix === owner.prefix) || {};
            const allReadable = itemRows.length > 0 && itemRows.every(row => row.status === 'ok') && !(discovery.unknown || []).length && !discovery.error;
            const monthlyRequirementCount = itemRows.reduce((sum, row) =>
                sum + row.monthlyChecks.filter(check => check.applicable !== false).length, 0);
            const tourRequirementCount = itemRows.length * dueTourWindows.length;
            const monthlyPassedCount = itemRows.reduce((sum, row) => sum + row.monthlyChecks.filter(x => x.ok).length, 0);
            const tourPassedCount = itemRows.reduce((sum, row) => sum + row.tourChecks.filter(x => x.due && x.ok).length, 0);
            const captainMonthlyOk = allReadable && monthlyPassedCount === monthlyRequirementCount;
            const tourCheckOk = allReadable && tourPassedCount === tourRequirementCount;
            const compliant = allReadable && captainMonthlyOk && tourCheckOk;

            return {
                name: owner.name,
                prefix: owner.prefix,
                gearCount: itemRows.length,
                allReadable,
                captainMonthlyOk,
                tourCheckOk,
                compliant,
                monthlyPassedCount,
                monthlyRequirementCount,
                tourPassedCount,
                tourRequirementCount,
                discoveryError: discovery.error || '',
                unknownAssets: discovery.unknown || [],
                items: itemRows
            };
        });

        return {
            schemaVersion: 6,
            reportId: check.checkId,
            generatedAt: new Date().toISOString(),
            setId: check.setId,
            setName: check.setName,
            ownerCount: owners.length,
            auditWindow: window,
            owners
        };
    }

    function showCaptainDailyReport(report = getCaptainDailyReport()) {
        if (!report) {
            setStatus('No Daily Captain Check report is stored yet.');
            return;
        }
        if (Number(report.schemaVersion || 0) < 6) {
            setStatus('This stored Daily Captain report predates SCBA Tour compliance. Run the read-only audit again for the complete grid.', false);
            return;
        }
        const auditWindow = report.auditWindow || captainAuditWindow(report.generatedAt?.slice(0, 10));
        const { overlay, box } = makeOverlayBox('1360px');
        const title = document.createElement('div');
        title.style.cssText = 'font-size:22px;font-weight:700;color:#153e5c;margin-bottom:4px;';
        title.textContent = 'Daily Captain Check';
        const sub = document.createElement('div');
        sub.style.cssText = 'font-size:12px;color:#607483;margin-bottom:13px;line-height:1.5;';
        const monthText = (auditWindow.months || []).map(displayMonthKey).join(' + ');
        sub.innerHTML = escapeHtml(report.setName || 'Captain Set') + ' · read-only Item Log audit · ' + escapeHtml(new Date(report.generatedAt).toLocaleString()) + '<br>' +
            '<b>Months:</b> ' + escapeHtml(monthText) + ' · <b>Red ✕</b> = required and missing · <b style="color:#24713b">green ✓</b> = completed · future tours have no mark.<br>' +
            'Tour checks become due at 07:00 on the first shift day. One completion on either shift day satisfies the whole tour.';
        box.append(title, sub);

        const months = Array.isArray(auditWindow.months) ? auditWindow.months.slice(0, 2) : [];
        const allItems = (report.owners || []).flatMap(owner => (owner.items || []).map(item => ({ owner, item })));
        const missingMonthly = allItems.reduce((sum, row) =>
            sum + (row.item.monthlyChecks || [])
                .filter(check => check.applicable !== false && !check.ok).length, 0);
        const missingTours = allItems.reduce((sum, row) => sum + (row.item.tourChecks || []).filter(check => check.due && !check.ok).length, 0);
        const unreadable = allItems.filter(row => row.item.status !== 'ok').length;
        const hasProblems = missingMonthly > 0 || missingTours > 0 || unreadable > 0;

        const summaryBar = document.createElement('div');
        summaryBar.style.cssText = 'display:flex;flex-wrap:wrap;gap:10px;margin-bottom:10px;padding:9px 10px;border-radius:8px;border:1px solid ' +
            (hasProblems ? '#e1a3a3' : '#a9cfad') + ';background:' + (hasProblems ? '#fff3f3' : '#eef8ef') + ';font-size:11px;color:#304b5a;';
        summaryBar.innerHTML = '<b>' + (hasProblems ? 'NEEDS REVIEW' : 'ALL DUE CHECKS COMPLETE') + '</b>' +
            '<span>Monthly missing: <b style="color:' + (missingMonthly ? '#b42318' : '#24713b') + '">' + missingMonthly + '</b></span>' +
            '<span>Tour missing: <b style="color:' + (missingTours ? '#b42318' : '#24713b') + '">' + missingTours + '</b></span>' +
            '<span>Unreadable: <b style="color:' + (unreadable ? '#b42318' : '#24713b') + '">' + unreadable + '</b></span>';
        box.appendChild(summaryBar);

        const ownerIssues = [];
        (report.owners || []).forEach(owner => {
            if (owner.discoveryError) ownerIssues.push((owner.name || owner.prefix || 'Unknown') + ': ' + owner.discoveryError);
            if ((owner.unknownAssets || []).length) ownerIssues.push((owner.name || owner.prefix || 'Unknown') + ': unmapped ' + owner.unknownAssets.join(', '));
        });
        if (ownerIssues.length) {
            const issue = document.createElement('div');
            issue.style.cssText = 'margin-bottom:10px;padding:8px 10px;border-radius:8px;border:1px solid #e1a3a3;background:#fff3f3;color:#9b1c1c;font-size:11px;line-height:1.45;';
            issue.innerHTML = '<b>Roster / discovery issues:</b> ' + escapeHtml(ownerIssues.join(' · '));
            box.appendChild(issue);
        }

        const shortDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '') ? value.slice(5) : '';
        const monthTours = month => (auditWindow.tours || []).filter(tour => tour.month === month);
        const monthTourColumns = Math.max(1, ...months.map(month => monthTours(month).length));
        const monthGridTemplate = () => '64px repeat(' + monthTourColumns + ', 34px)';
        const makeMonthCell = (item, month, rowBackground, topBorder) => {
            const td = document.createElement('td');
            const scheduledTours = monthTours(month);
            const itemTourMap = new Map(
                (item.tourChecks || [])
                    .filter(check => check.month === month)
                    .map(check => [check.startDate, check])
            );
            const monthly = (item.monthlyChecks || []).find(check => check.month === month);
            const capApplicable = monthly?.applicable !== false;
            const capOk = capApplicable && item.status === 'ok' && !!(monthly && monthly.ok);
            td.style.cssText = 'padding:5px 7px;' + topBorder + 'vertical-align:middle;background:' + rowBackground +
                ';min-width:' + (78 + monthTourColumns * 38) + 'px;';

            const grid = document.createElement('div');
            grid.style.cssText = 'display:grid;grid-template-columns:' + monthGridTemplate() + ';gap:4px;align-items:center;';

            const cap = document.createElement('div');
            cap.style.cssText = 'height:27px;display:flex;align-items:center;justify-content:center;border-radius:5px;border:1px solid ' +
                (!capApplicable ? '#d8e1e6' : capOk ? '#78b684' : '#dc7f7f') + ';background:' +
                (!capApplicable ? '#fafcfd' : capOk ? '#e5f5e8' : '#ffe3e3') +
                ';color:' + (!capApplicable ? '#8c9da6' : capOk ? '#176b32' : '#b42318') +
                ';font-size:11px;font-weight:800;white-space:nowrap;';
            cap.textContent = !capApplicable ? '—' : capOk ? shortDate(monthly.date) : '✕';
            cap.title = !capApplicable
                ? 'Not applicable: SCBA Face Mask uses a Tour Checklist, not Captain Monthly'
                : capOk ? 'Captain monthly completed ' + monthly.date
                : 'Captain monthly missing for ' + month;
            grid.appendChild(cap);

            scheduledTours.forEach(headerTour => {
                const tour = itemTourMap.get(headerTour.startDate) || headerTour;
                const due = headerTour.due === true;
                const ok = due && item.status === 'ok' && tour.ok === true;
                const missing = due && !ok;
                const mark = document.createElement('div');
                mark.style.cssText = 'height:27px;display:flex;align-items:center;justify-content:center;border-radius:5px;border:1px solid ' +
                    (ok ? '#78b684' : missing ? '#dc7f7f' : '#d8e1e6') + ';background:' +
                    (ok ? '#e5f5e8' : missing ? '#ffe3e3' : '#fafcfd') + ';color:' +
                    (ok ? '#176b32' : missing ? '#b42318' : '#9aa8b0') + ';font-size:17px;font-weight:900;line-height:1;';
                mark.textContent = due ? (ok ? '✓' : '✕') : '';
                mark.title = 'Tour ' + headerTour.startDate + ' + ' + headerTour.endDate + ': ' +
                    (due ? (ok ? 'completed' + (tour.date ? ' ' + tour.date : '') : 'missing') : 'future');
                grid.appendChild(mark);
            });

            for (let i = scheduledTours.length; i < monthTourColumns; i += 1) {
                const blank = document.createElement('div');
                blank.style.cssText = 'height:27px;border:1px solid #edf1f3;border-radius:5px;background:#fcfdfd;';
                grid.appendChild(blank);
            }

            td.appendChild(grid);
            return td;
        };

        const tableWrap = document.createElement('div');
        tableWrap.style.cssText = 'max-height:68vh;overflow:auto;border:1px solid #c9d7df;border-radius:10px;background:#fff;';
        const table = document.createElement('table');
        table.style.cssText = 'width:100%;min-width:' + (365 + months.length * (78 + monthTourColumns * 38)) + 'px;border-collapse:separate;border-spacing:0;font-size:11px;color:#223f50;';
        const thead = document.createElement('thead');
        const headRow = document.createElement('tr');
        const makeHead = (text, extra) => {
            const th = document.createElement('th');
            th.style.cssText = 'position:sticky;top:0;z-index:4;padding:7px 8px;background:#173e63;color:#fff;text-align:left;border-bottom:1px solid #0f304e;' + (extra || '');
            th.textContent = text;
            return th;
        };
        headRow.append(
            makeHead('PERSON', 'left:0;min-width:155px;z-index:6;'),
            makeHead('ITEM', 'left:155px;min-width:210px;z-index:6;')
        );
        months.forEach((month, monthIndex) => {
            const th = makeHead('', 'min-width:' + (78 + monthTourColumns * 38) + 'px;' + (monthIndex ? 'border-left:2px solid #355f7c;' : ''));
            const monthTitle = document.createElement('div');
            monthTitle.style.cssText = 'font-size:11px;font-weight:800;margin-bottom:5px;';
            monthTitle.textContent = displayMonthKey(month);
            const guide = document.createElement('div');
            guide.style.cssText = 'display:grid;grid-template-columns:' + monthGridTemplate() + ';gap:4px;align-items:center;';
            const capHead = document.createElement('div');
            capHead.style.cssText = 'text-align:center;font-size:9px;font-weight:800;color:#dce9f2;';
            capHead.textContent = 'CAP';
            guide.appendChild(capHead);
            const tours = monthTours(month);
            tours.forEach(tour => {
                const label = document.createElement('div');
                label.style.cssText = 'text-align:center;font-size:9px;font-weight:800;color:#dce9f2;';
                label.textContent = (tour.startDate || '').slice(8) || '—';
                label.title = 'Tour ' + tour.startDate + ' + ' + tour.endDate;
                guide.appendChild(label);
            });
            for (let i = tours.length; i < monthTourColumns; i += 1) {
                const blank = document.createElement('div');
                guide.appendChild(blank);
            }
            th.append(monthTitle, guide);
            headRow.appendChild(th);
        });
        thead.appendChild(headRow);
        table.appendChild(thead);

        const tbody = document.createElement('tbody');
        (report.owners || []).forEach((owner, ownerIndex) => {
            const ownerItems = owner.items || [];
            ownerItems.forEach((item, itemIndex) => {
                const itemHasMissing = item.status !== 'ok' ||
                    (item.monthlyChecks || []).some(check => !check.ok) ||
                    (item.tourChecks || []).some(check => check.due && !check.ok);
                const baseBackground = ownerIndex % 2 ? '#f8fbfc' : '#ffffff';
                const rowBackground = itemHasMissing ? '#fff1f1' : baseBackground;
                const topBorder = itemIndex === 0 ? 'border-top:3px solid #6f8ea1;' : 'border-top:1px solid #dce5ea;';
                const tr = document.createElement('tr');

                const person = document.createElement('td');
                person.style.cssText = 'position:sticky;left:0;z-index:2;min-width:155px;padding:6px 8px;' + topBorder +
                    'background:' + rowBackground + ';font-weight:800;color:#18384f;white-space:nowrap;';
                person.innerHTML = '<span>' + escapeHtml(owner.name || owner.prefix || 'Unknown') + '</span>' +
                    (owner.prefix ? ' <span style="font-size:9px;font-weight:500;color:#7a8d99">(' + escapeHtml(owner.prefix) + ')</span>' : '');

                const itemCell = document.createElement('td');
                itemCell.style.cssText = 'position:sticky;left:155px;z-index:2;min-width:210px;padding:6px 8px;' + topBorder +
                    'background:' + rowBackground + ';box-shadow:' + (itemHasMissing ? 'inset 4px 0 0 #c83b3b,1px 0 0 #dce5ea' : '1px 0 0 #dce5ea') + ';white-space:nowrap;';
                itemCell.innerHTML = '<b>' + escapeHtml(item.type || 'PPE') + '</b>' +
                    '<span style="font-size:9px;color:#6b7f8b;margin-left:6px">Asset ' + escapeHtml(item.assetId || 'unknown') + '</span>' +
                    (item.status !== 'ok' ? '<span style="font-size:9px;color:#b42318;font-weight:800;margin-left:7px">HISTORY?</span>' : '');

                tr.append(person, itemCell);
                months.forEach((month, monthIndex) => {
                    const cell = makeMonthCell(item, month, rowBackground, topBorder);
                    if (monthIndex) cell.style.borderLeft = '2px solid #e1e8ec';
                    tr.appendChild(cell);
                });
                tbody.appendChild(tr);
            });
        });
        table.appendChild(tbody);
        tableWrap.appendChild(table);
        box.appendChild(tableWrap);

        const footer = document.createElement('div');
        footer.style.cssText = 'font-size:10px;color:#6a7f8f;margin-top:8px;line-height:1.45;';
        footer.textContent = 'Audit through ' + displayHistoryDateKey(auditWindow.asOfDate) +
            '. Previous month is fully due. Current-month future tours stay blank until their first 07:00 shift starts.';
        box.appendChild(footer);

        const closeV4 = makeButton('Close');
        closeV4.onclick = () => overlay.remove();
        const rerunV4 = makeButton('Run Again', { background: '#176b8e', color: '#fff' });
        rerunV4.onclick = () => { overlay.remove(); launchCaptainDailyCheckFromAnywhere(); };
        box.append(rerunV4, closeV4);
        return;

        (report.owners || []).forEach(owner => {
            const card = document.createElement('div');
            const verified = !!owner.compliant;
            card.style.cssText = `padding:11px;margin:8px 0;border-radius:9px;border:1px solid ${verified ? '#9fc79f' : '#d7b56d'};background:${verified ? '#eef8ee' : '#fff8e8'};`;
            const headline = document.createElement('div');
            headline.style.cssText = 'font-size:14px;font-weight:700;color:#18384f;';
            headline.textContent = owner.name;
            const status = document.createElement('div');
            status.style.cssText = 'font-size:12px;line-height:1.55;margin-top:4px;';
            status.innerHTML = verified
                ? `<b>COMPLIANT:</b> all ${owner.gearCount} current mapped PPE items satisfy both monthly checks and every tour check due in the two-month window.`
                : `<b>NEEDS REVIEW:</b> Monthly ${owner.monthlyPassedCount}/${owner.monthlyRequirementCount} · Tour PPE ${owner.tourPassedCount}/${owner.tourRequirementCount}.`;
            card.append(headline, status);

            if (owner.discoveryError) {
                const issue = document.createElement('div');
                issue.style.cssText = 'font-size:11px;color:#8a5a00;margin-top:5px;';
                issue.textContent = `Discovery issue: ${owner.discoveryError}`;
                card.appendChild(issue);
            }
            if ((owner.unknownAssets || []).length) {
                const issue = document.createElement('div');
                issue.style.cssText = 'font-size:11px;color:#8a5a00;margin-top:5px;';
                issue.textContent = `Unmapped gear: ${owner.unknownAssets.join(', ')}`;
                card.appendChild(issue);
            }

            const details = document.createElement('details');
            details.style.cssText = 'margin-top:7px;';
            details.open = !verified;
            const summary = document.createElement('summary');
            summary.style.cssText = 'cursor:pointer;font-size:11px;color:#436276;';
            summary.textContent = `${owner.gearCount} current mapped PPE item${owner.gearCount === 1 ? '' : 's'} — two-month history`;
            const rows = document.createElement('div');
            rows.style.cssText = 'margin-top:6px;font-size:11px;line-height:1.55;';
            (owner.items || []).forEach(item => {
                const row = document.createElement('div');
                row.style.cssText = `padding:7px 0;border-top:1px solid ${item.compliant ? '#d6e9d6' : '#ead7ad'};`;
                if (item.status !== 'ok') {
                    row.textContent = `${item.type || 'PPE'} · ${item.assetId} · UNREADABLE: ${item.error || 'history not available'}`;
                } else {
                    const monthlyText = (item.monthlyChecks || []).map(x =>
                        `${displayMonthKey(x.month)}: ${x.date ? `${displayHistoryDateKey(x.date)} ✓` : 'MISSING'}`
                    ).join(' · ');
                    const missingTours = (item.tourChecks || []).filter(x => !x.ok);
                    const tourPassed = (item.tourChecks || []).filter(x => x.ok).length;
                    const tourTotal = (item.tourChecks || []).length;
                    const missingTourText = missingTours.length
                        ? `<br><span style="color:#8a5a00">Missing tours: ${escapeHtml(missingTours.map(x => `${x.startDate.slice(5)}–${x.endDate.slice(5)}`).join(', '))}</span>`
                        : '';
                    row.innerHTML = `<b>${escapeHtml(item.type || 'PPE')}</b> · ${escapeHtml(item.assetId)}<br>` +
                        `Captain's Monthly: ${escapeHtml(monthlyText)}<br>` +
                        `Tour PPE: ${tourPassed}/${tourTotal} tours ✓${missingTourText}`;
                }
                rows.appendChild(row);
            });
            details.append(summary, rows);
            card.appendChild(details);
            box.appendChild(card);
        });

        const tourDetails = document.createElement('details');
        tourDetails.style.cssText = 'margin-top:10px;padding:8px;border:1px solid #d5e0e7;border-radius:8px;background:#f8fbfc;';
        const tourSummary = document.createElement('summary');
        tourSummary.style.cssText = 'cursor:pointer;font-size:11px;font-weight:700;color:#436276;';
        tourSummary.textContent = `Tours included (${(auditWindow.tours || []).length})`;
        const tourList = document.createElement('div');
        tourList.style.cssText = 'font-size:11px;line-height:1.6;margin-top:6px;color:#506a7b;';
        tourList.textContent = (auditWindow.tours || []).map(x => `${displayHistoryDateKey(x.startDate)} + ${displayHistoryDateKey(x.endDate)}${(x.eligibleDates || []).length < 2 ? ' (through audit date)' : ''}`).join(' · ');
        tourDetails.append(tourSummary, tourList);
        box.appendChild(tourDetails);

        const close = makeButton('Close');
        close.onclick = () => overlay.remove();
        const rerun = makeButton('Run Again', { background: '#176b8e', color: '#fff' });
        rerun.onclick = () => { overlay.remove(); launchCaptainDailyCheckFromAnywhere(); };
        box.append(rerun, close);
    }

    function showCaptainDailySetPicker() {
        const config = getConfig();
        const usableSets = (config.captainSets || [])
            .map(set => ({
                ...set,
                people: resolveCaptainSetPeople(set, config),
                memberCount: (set.memberPrefixes || []).length
            }))
            .filter(set => set.people.length && set.people.length === set.memberCount);
        if (!usableSets.length) {
            setStatus('No Captain Sets are ready. Open Settings → Captain Sets and choose your crew from the department roster.', false);
            showSettings('captain');
            return;
        }

        const { overlay, box } = makeOverlayBox('760px');
        const title = document.createElement('div');
        title.style.cssText = 'font-size:22px;font-weight:700;color:#153e5c;margin-bottom:4px;';
        title.textContent = 'Daily Captain Check';
        const sub = document.createElement('div');
        sub.style.cssText = 'font-size:12px;color:#607483;margin-bottom:14px;line-height:1.5;';
        sub.textContent = "Read only. One line per person/item: previous month on the left, current month on the right. Captain Monthly shows the completion date or a red X; each two-shift tour shows a green check, red X once due, or stays blank until the tour starts.";
        box.append(title, sub);

        const selectLabel = document.createElement('label');
        selectLabel.style.cssText = 'display:block;font-size:11px;font-weight:700;color:#436276;margin-bottom:5px;';
        selectLabel.textContent = 'Captain Set';
        const select = document.createElement('select');
        select.style.cssText = 'display:block;width:100%;box-sizing:border-box;margin-bottom:12px;padding:10px;border:1px solid #b8c8d6;border-radius:7px;background:#fff;color:#18384f;';
        usableSets.forEach(set => {
            const option = document.createElement('option');
            option.value = set.id;
            option.textContent = `${set.name} (${set.people.length})`;
            select.appendChild(option);
        });
        const last = persistentGetRaw(CAPTAIN_LAST_SET_KEY) || '';
        if (usableSets.some(set => set.id === last)) select.value = last;
        box.append(selectLabel, select);

        const dateLabel = document.createElement('label');
        dateLabel.style.cssText = 'display:block;font-size:11px;font-weight:700;color:#436276;margin-bottom:5px;';
        dateLabel.textContent = 'Audit through';
        const auditInput = document.createElement('input');
        auditInput.type = 'date';
        auditInput.value = localTodayKey();
        auditInput.max = localTodayKey();
        auditInput.style.cssText = 'display:block;width:100%;box-sizing:border-box;margin-bottom:5px;padding:10px;border:1px solid #b8c8d6;border-radius:7px;background:#fff;color:#18384f;';
        const auditHint = document.createElement('div');
        auditHint.style.cssText = 'font-size:10px;color:#6a7f8f;margin-bottom:13px;line-height:1.4;';
        const updateHint = () => {
            const auditDate = validDateKey(auditInput.value) || localTodayKey();
            const w = captainAuditWindow(auditDate);
            auditHint.textContent = `Window: ${displayMonthKey(w.months[0])} + ${displayMonthKey(w.months[1])}, through ${displayHistoryDateKey(w.asOfDate)} · ${w.tours.filter(t => t.due).length} tours due / ${w.tours.length} shown.`;
        };
        auditInput.onchange = updateHint;
        updateHint();
        box.append(dateLabel, auditInput, auditHint);

        const run = makeButton('Run Read-Only Check', { background: '#176b8e', color: '#fff' });
        run.onclick = async () => {
            const set = usableSets.find(x => x.id === select.value) || usableSets[0];
            const auditAsOfDate = validDateKey(auditInput.value);
            if (!auditAsOfDate) {
                setStatus('Daily Captain Check needs a valid audit-through date.', false);
                return;
            }
            persistentSetRaw(CAPTAIN_LAST_SET_KEY, set.id);
            overlay.remove();
            await startCaptainDailyCheck(set, auditAsOfDate);
        };
        const prior = getCaptainDailyReport();
        if (Number(prior?.schemaVersion || 0) >= 6) {
            const view = makeButton('View Last Report');
            view.onclick = () => { overlay.remove(); showCaptainDailyReport(prior); };
            box.append(run, view);
        } else {
            box.appendChild(run);
        }
        const close = makeButton('Cancel');
        close.onclick = () => overlay.remove();
        box.appendChild(close);
    }

    function consumeQueuedCaptainDailyAfterVerifiedRun(run, now = Date.now()) {
        const deferred = loadJSON(CAPTAIN_DAILY_DEFERRED_KEY, null);
        if (!deferred || deferred.runId !== run?.runId) return false;
        persistentRemoveRaw(CAPTAIN_DAILY_DEFERRED_KEY);
        const queuedAt = Date.parse(deferred.queuedAt || '');
        return Number.isFinite(queuedAt) && now >= queuedAt &&
            now - queuedAt < 30 * 60 * 1000;
    }

    async function launchCaptainDailyCheckFromAnywhere() {
        const activeRun = getRun();
        if (activeRun) {
            if (activeRun.phase === 'stopped') {
                setStatus('The inspection run stopped and needs review. Verify any submitted inspection, then use Settings → General → Abort Active Run before starting the Daily Captain Check.', false);
                return;
            }
            // A request immediately after the final submit must not navigate away
            // while the official Item Log is still being verified. Defer the read-only
            // check until the existing run records its verified completion.
            saveJSON(CAPTAIN_DAILY_DEFERRED_KEY, {
                runId: activeRun.runId,
                queuedAt: new Date().toISOString()
            });
            setStatus('Daily Captain Check queued. Waiting for the current PPE run to finish and verify its final submission; no new inspection will be started.');
            return;
        }
        const active = getCaptainDailyCheck();
        if (active?.status === 'running' || active?.status === 'returning') {
            const updated = Date.parse(active.updatedAt || active.startedAt || '');
            const freshOtherTab = active.ownerTabId && active.ownerTabId !== TAB_ID && Number.isFinite(updated) && Date.now() - updated < 60 * 1000;
            if (active.ownerTabId === TAB_ID || freshOtherTab) {
                setStatus(`Daily Captain Check is already active (${Math.min((active.index || 0) + 1, active.items?.length || 0)}/${active.items?.length || 0}).`, false);
                return;
            }
            clearCaptainDailyCheck();
        }
        try {
            setStatus('Opening Equipment → PPE for the Daily Captain Check…');
            await ensurePpeEquipmentPage(message => setStatus(message), false);
            showCaptainDailySetPicker();
        } catch (error) {
            saveDiagnostic(error.message);
            setStatus(error.message, false);
        }
    }

    async function startCaptainDailyCheck(set, auditAsOfDate) {
        if (captainDailyBusy) return;
        const validAuditDate = validDateKey(auditAsOfDate);
        if (!validAuditDate) {
            setStatus('Daily Captain Check needs a valid audit-through date.', false);
            return;
        }
        captainDailyBusy = true;
        try {
            const window = captainAuditWindow(validAuditDate);
            const config = getConfig();
            const selfPrefix = clean(config.selfPrefix).toUpperCase();
            if (!(set.people || []).length ||
                (set.memberPrefixes || []).length !== set.people.length) {
                throw new Error('Captain Set membership is incomplete or unresolved. Edit the Captain Set before auditing PPE.');
            }
            const owners = (set.people || [])
                .map((person, index) => ({
                    name: person.name,
                    prefix: person.prefix,
                    gearSearchPrefix: person.gearSearchPrefix,
                    legacyPrefix: person.legacyPrefix,
                    setOrder: index
                }))
                .sort((a, b) => {
                    const rank = owner => masterNameKey(owner.name) === masterNameKey(config.inspectorName)
                        ? 0 : /\bbaldree\b/i.test(owner.name || '') ? 1 : 2;
                    return rank(a) - rank(b) || a.setOrder - b.setOrder;
                })
                .map(({ setOrder, ...owner }) => owner);
            const items = [];
            const discovery = [];
            const freshInventory = await scanPpeCrewOwners(owners, message => setStatus(message));
            for (const owner of owners) {
                setStatus(`Daily Captain Check — preparing verified PPE for ${owner.name}…`);
                try {
                    const found = await discoverOwnerGear(owner, 'captain', freshInventory);
                    discovery.push({
                        name: owner.name,
                        prefix: owner.prefix,
                        unknown: (found.unknown || []).map(item => item.assetId),
                        error: ''
                    });
                    (found.items || []).forEach(item => items.push({
                        ...item,
                        ownerName: owner.name,
                        ownerPrefix: owner.prefix
                    }));
                    // The separately verified mask has Tour history only.
                    for (const mask of found.supplemental || []) {
                        if (mask.pool !== SCBA_FACE_MASK_POOL) continue;
                        const template = getMode('scbaTour')?.templates?.[mask.pool];
                        if (template !== SCBA_TOUR_TEMPLATE) {
                            throw new Error(mask.assetId + ': SCBA Tour template is unverified.');
                        }
                        items.push({
                            ...mask, template, inspectionModeKey: 'scbaTour',
                            ownerName: owner.name, ownerPrefix: owner.prefix
                        });
                    }
                } catch (error) {
                    discovery.push({ name: owner.name, prefix: owner.prefix, unknown: [], error: error.message });
                }
            }
            if (!items.length) throw new Error('Daily Captain Check found no mapped PPE items to read.');

            const check = {
                schemaVersion: 3,
                checkId: `captain-daily-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                status: 'running',
                ownerTabId: TAB_ID,
                startedAt: new Date().toISOString(),
                returnUrl: location.href,
                setId: set.id,
                setName: set.name,
                auditAsOfDate: validAuditDate,
                auditStartDate: window.startDate,
                auditMonths: window.months,
                auditTours: window.tours,
                owners,
                discovery,
                items,
                index: 0,
                results: [],
                navAttempts: {}
            };
            saveCaptainDailyCheck(check);
            rebelCommandEvent('scan_check_started', {
                success: true,
                workflowMode: 'captainDaily',
                action: 'daily_captain_check',
                description: 'Daily Captain Check started.',
                metadata: { itemCount: items.length, stage: 'read_only_history' }
            });
            setStatus(`Daily Captain Check — ${window.months.join(' + ')} through ${validAuditDate} · reading 1/${items.length}: ${items[0].assetId}…`);
            navigateCaptainDailyToItem(check, items[0]);
        } catch (error) {
            rebelCommandEvent('scan_check_failed', {
                success: false,
                workflowMode: 'captainDaily',
                action: 'daily_captain_check',
                description: 'Daily Captain Check failed to start.',
                errorType: 'captain_daily_start_failed',
                errorMessage: clean(error?.message || error).replace(/\b\d{5,}\b/g, '[id]').slice(0, 300),
                metadata: { stage: 'start' }
            });
            clearCaptainDailyCheck();
            setStatus(`Daily Captain Check stopped: ${error.message}`, false);
        } finally {
            captainDailyBusy = false;
        }
    }

    async function resumeCaptainDailyCheck() {
        const check = getCaptainDailyCheck();
        if (!check) return false;
        if (Number(check.schemaVersion || 0) < 3) {
            clearCaptainDailyCheck();
            setStatus('The interrupted Daily Captain Check used an older compliance rule. Start a new two-month audit.', false);
            return true;
        }
        if (check.ownerTabId && check.ownerTabId !== TAB_ID) {
            const updated = Date.parse(check.updatedAt || check.startedAt || '');
            if (Number.isFinite(updated) && Date.now() - updated < 60 * 1000) return false;
            check.ownerTabId = TAB_ID;
            saveCaptainDailyCheck(check);
        }
        if (captainDailyBusy) return true;

        if (check.status === 'returning') {
            const report = buildCaptainDailyReport(check);
            const dailyErrors = (check.results || []).filter(x => x?.status === 'error');
            saveJSON(CAPTAIN_DAILY_REPORT_KEY, report);
            if (dailyErrors.length) {
                rebelCommandEvent('scan_check_failed', {
                    success: false,
                    workflowMode: 'captainDaily',
                    action: 'daily_captain_check',
                    description: 'Daily Captain Check completed with read errors.',
                    errorType: 'captain_daily_partial',
                    errorMessage: clean(dailyErrors[0]?.error || `${dailyErrors.length} history read error(s)`).replace(/\b\d{5,}\b/g, '[id]').slice(0, 300),
                    metadata: { itemCount: check.items?.length || 0, failureCount: dailyErrors.length, stage: 'report' }
                });
            } else {
                rebelCommandEvent('scan_check_completed', {
                    success: true,
                    workflowMode: 'captainDaily',
                    action: 'daily_captain_check',
                    description: 'Daily Captain Check completed.',
                    metadata: { itemCount: check.items?.length || 0, failureCount: 0, stage: 'report' }
                });
            }
            clearCaptainDailyCheck();
            setStatus(`Daily Captain Check complete for ${report.ownerCount} person${report.ownerCount === 1 ? '' : 's'}.`);
            setTimeout(() => showCaptainDailyReport(report), 250);
            refreshPanelInfo();
            return true;
        }
        if (check.status !== 'running') return false;
        if (!Array.isArray(check.items) || check.index >= check.items.length) {
            check.status = 'returning';
            saveCaptainDailyCheck(check);
            if (check.returnUrl && location.href !== check.returnUrl) location.href = check.returnUrl;
            else setTimeout(resumeCaptainDailyCheck, 50);
            return true;
        }

        const item = check.items[check.index];
        if (!isAssetPageFor(item)) {
            navigateCaptainDailyToItem(check, item);
            return true;
        }

        const cancelSerialAtStart = captainDailyCancelSerial;
        captainDailyBusy = true;
        try {
            setStatus(`Daily Captain Check — reading ${check.index + 1}/${check.items.length}: ${item.ownerName} · ${item.assetId}…`);
            let result;
            try {
                const history = await readCaptainComplianceHistory(item);
                result = {
                    ownerName: item.ownerName,
                    ownerPrefix: item.ownerPrefix,
                    assetId: item.assetId,
                    type: item.type,
                    status: 'ok',
                    ...history
                };
            } catch (error) {
                result = {
                    ownerName: item.ownerName,
                    ownerPrefix: item.ownerPrefix,
                    assetId: item.assetId,
                    type: item.type,
                    status: 'error',
                    captain: { dates: [], latestDate: '' },
                    tour: { dates: [], latestDate: '' },
                    error: error.message
                };
            }
            if (cancelSerialAtStart !== captainDailyCancelSerial || getCaptainDailyCheck()?.checkId !== check.checkId) return true;

            check.results = [...(check.results || []).filter(x => x.assetId !== item.assetId), result];
            check.index += 1;

            if (check.index >= check.items.length) {
                check.status = 'returning';
                saveCaptainDailyCheck(check);
                setStatus('Daily Captain Check — two-month Captain Monthly + per-tour PPE history read complete. Returning to PPE list…');
                if (check.returnUrl && location.href !== check.returnUrl) location.href = check.returnUrl;
                else setTimeout(resumeCaptainDailyCheck, 50);
            } else {
                saveCaptainDailyCheck(check);
                const next = check.items[check.index];
                setStatus(`Daily Captain Check — moving to ${check.index + 1}/${check.items.length}: ${next.assetId}…`);
                navigateCaptainDailyToItem(check, next);
            }
        } finally {
            captainDailyBusy = false;
        }
        return true;
    }

    // ============================================================
    // INSPECTION CHOOSER
    // ============================================================

    // Vector renders the chooser as a React modal whose title, Cancel action,
    // and cards may be divs or button-like elements in different builds.
    // Normalize smart quotes and ellipsis before matching; never search the
    // whole page for a checklist action unless its containing modal is verified.
    function chooserText(el) {
        return uiText(el?.innerText || el?.textContent || '')
            .replace(/\u2026/g, '...')
            .replace(/\s+/g, ' ').trim().toLowerCase();
    }

    function findChooserRoot() {
        const titles = [...document.querySelectorAll('h1,h2,h3,h4,div,span,[role="heading"]')]
            .filter(el => visible(el) && chooserText(el) === 'select inspection...');

        const roots = [];
        for (const title of titles) {
            let el = title;
            for (let i = 0; el && i < 10; i++, el = el.parentElement) {
                if (!visible(el)) continue;
                const text = chooserText(el);
                if (!text.includes('select inspection...') || !text.includes('checklist')) continue;
                const controls = [...el.querySelectorAll('button,a,[role="button"],input[type="button"]')];
                if (!controls.some(control => visible(control) && chooserText(control) === 'cancel')) continue;
                roots.push(el);
                break;
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
        // Match the ENTIRE official title, not a prefix such as "Tour PPE".
        // Vector may render cards as nested div/span/paragraphs, not buttons.
        const matches = [...root.querySelectorAll(
            'button,a,[role="button"],[role="option"],li,div,article,section,span,p,h3,h4'
        )].filter(el => {
            if (!visible(el) || el.disabled || el.getAttribute('aria-disabled') === 'true') return false;
            const t = chooserText(el);
            return t === target || t === `${target} checklist` ||
                (t.startsWith(target) && t.includes('checklist') && t.length <= target.length + 24);
        });
        if (!matches.length) return null;

        const clickable = matches.filter(el => {
            const tag = (el.tagName || '').toLowerCase();
            const role = el.getAttribute('role');
            const cursor = getComputedStyle(el).cursor;
            return tag === 'button' || tag === 'a' || role === 'button' ||
                role === 'option' || !!el.onclick || el.tabIndex >= 0 || cursor === 'pointer';
        });

        const pool = clickable.length ? clickable : matches;
        pool.sort((a, b) => {
            const ar = a.getBoundingClientRect();
            const br = b.getBoundingClientRect();
            const score = (rect, text) => {
                const cardish = (rect.width >= 220 && rect.height >= 30 && rect.height <= 160) ? 0 : 1000000;
                const hasChecklist = text.endsWith(' checklist') ? 0 : 800;
                return cardish + hasChecklist + Math.abs(rect.height - 70) * 100 + Math.abs(rect.width - 450);
            };
            return score(ar,chooserText(a)) - score(br,chooserText(b));
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
        const mode = getItemInspectionMode(run, item);
        const current = currentInspection();
        if (!current || current.template !== item.template) {
            throw new Error(`${item.assetId}: expected template ${item.template}, Vector opened ${current?.template || 'unknown'}.`);
        }

        const pass = exactButtons('Passed');
        const fail = exactButtons('Failed');
        if (item.inspectionModeKey === 'scbaTour') {
            if (!Array.isArray(item.scbaAnswers) ||
                item.scbaAnswers.length !== SCBA_TOUR_QUESTIONS.length ||
                item.scbaAnswers.some(answer => answer !== 'pass')) {
                throw new Error(item.assetId + ': SCBA requires seven physically verified PASS answers for automatic submission. Failed/incomplete masks require manual Vector inspection.');
            }
            if (pass.length !== 7 || fail.length !== 7) {
                throw new Error(item.assetId + ': SCBA expected exactly seven Pass/Fail controls; saw ' +
                    pass.length + '/' + fail.length + '. Form may have changed.');
            }
            const visibleText = uiText(document.body?.innerText || '');
            let previousPosition = -1;
            for (const question of SCBA_TOUR_QUESTIONS) {
                const index = visibleText.toLowerCase().indexOf(uiText(question).toLowerCase(), previousPosition + 1);
                if (index < 0 || index <= previousPosition) {
                    throw new Error(item.assetId + ': SCBA checklist question/order does not match the verified seven-question template.');
                }
                previousPosition = index;
            }
            if ([...document.querySelectorAll('textarea')].some(visible) ||
                enabledButton('Done')) {
                throw new Error(item.assetId + ': SCBA unexpectedly requires a comment/Done step; inspect manually.');
            }
            for (let i = 0; i < 7; i++) {
                pass[i].click();
                await sleep(280);
            }
            return;
        }
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
        const mode = getItemInspectionMode(run, item);

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
                run.itemLogParserPath = snapshot.parserPath || run.itemLogParserPath || '';
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
                    parserPath: snapshot.parserPath || '',
                    rowCount: snapshot.count,
                    baselineCount: Number.isInteger(baselineCount) ? baselineCount : null,
                    postSubmitCount: snapshot.count,
                    stableReads,
                    baselineUsesStableIds: !!run.baselineUsesStableIds,
                    postSubmitUsesStableIds: !!snapshot.usesStableIds,
                    baselineHistoryKeys: baselineKeys.slice(),
                    postSubmitHistoryKeys: snapshot.keys.slice(),
                    addedKeys: addedKeys.slice(),
                    baselineRowTexts: (run.baselineHistoryEntries || []).map(compactHistoryRowText).slice(0, 25),
                    postSubmitRowTexts: snapshot.texts.map(compactHistoryRowText).slice(0, 25),
                    addedRowTexts: addedRecords.map(record => compactHistoryRowText(record.text))
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
                finalHistoryEntries: modeHistoryEntryTexts(item, getItemInspectionMode(run, item).title),
                itemLogTableFound: !!findItemLogHistoryTable(),
                itemLogHeaders: findItemLogHistoryTable()
                    ? historyContainerHeaderText(findItemLogHistoryTable())
                    : '',
                itemLogParserPath: run.itemLogParserPath || '',
                textHistoryFallbackCount: textHistoryEntryElements(getItemInspectionMode(run, item).title).length,
                textHistoryFallbackEntries: textHistoryEntryElements(getItemInspectionMode(run, item).title)
                    .map(entry => uiText(entry.text))
                    .slice(0, 20),
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
            rebelCommandEvent('ppe_workflow_completed', {
                success: true,
                workflowMode: run.modeKey || '',
                description: 'PPE workflow completed and locally verified.',
                metadata: {
                    itemCount: summary.total || 0,
                    failureCount: summary.failures || 0,
                    inferredCompletions: summary.inferredCompletions || 0,
                    verificationResult: archiveWarnings.length ? 'completed_with_local_archive_warning' : 'completed'
                }
            });
            const stopped = loadJSON(STOPPED_RUN_KEY, null);
            if (stopped?.modeKey === run.modeKey) persistentRemoveRaw(STOPPED_RUN_KEY);
            // Consume only after the whole run is archived as verified.
            const queuedCaptain = consumeQueuedCaptainDailyAfterVerifiedRun(run);
            clearRun();

            if (queuedCaptain) {
                setStatus(`RUN COMPLETE — ${total}/${total} ${mode.short} inspection(s) verified. Opening the queued read-only Daily Captain Check.`);
                setTimeout(() => launchCaptainDailyCheckFromAnywhere().catch(error => {
                    setStatus(`Daily Captain Check could not open: ${error.message}`, false);
                }), 600);
                return;
            }

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
        const mode = getItemInspectionMode(run, item);
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
        const mode = getItemInspectionMode(run, item);
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
        const mode = getItemInspectionMode(run, item);

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
            setStatus(`${run.index + 1}/${run.items.length} — recording ${item.inspectionModeKey === 'scbaTour' ? '7 verified SCBA answers' : item.q1.toUpperCase() + '/' + item.q2.toUpperCase()} for ${item.assetId}...`);
            await fillLiveForm(run, item);

            setStatus(`${run.index + 1}/${run.items.length} — applying ${getConfig().inspectorName}'s next signature variant...`);
            const sig = await applyNextSignature();
            run.signatureUsed = sig.label;
            saveRun(run);

            await sleep(1000);
            const mainSubmit = await waitFor(() => enabledButton('Submit Inspection'), 15000);
            const anyFailure = item.inspectionModeKey === 'scbaTour'
                ? (item.scbaAnswers || []).some(value => value === 'fail')
                : item.q1 === 'fail' || item.q2 === 'fail';

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
        const mode = getItemInspectionMode(run, item);

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

                // v2.3.10 guard. A confident baseline of zero is only acceptable
                // when the page really shows no completed history for this mode.
                // If the generic page scan can see completed entries that the row
                // parser could not convert into rows, that is a PARSER failure,
                // not an empty log, and it must disable history confirmation
                // rather than silently record a baseline of 0.
                if (baselineSnapshot.count === 0) {
                    const visibleEvidence = assetPageCompletedTextEvidence(mode.title);
                    if (visibleEvidence.length) {
                        throw new Error(
                            `${item.assetId}: the Item Log shows ${visibleEvidence.length} completed ` +
                            `${mode.short} entr${visibleEvidence.length === 1 ? 'y' : 'ies'} that the row parser ` +
                            'could not read, so a baseline of zero was not trusted.'
                        );
                    }
                }

                run.baselineCompleteCount = baselineSnapshot.count;
                run.baselineHistoryEntries = baselineSnapshot.texts.slice();
                run.baselineHistoryKeys = baselineSnapshot.keys.slice();
                run.baselineUsesStableIds = baselineSnapshot.usesStableIds;
                run.itemLogParserPath = baselineSnapshot.parserPath || '';
                run.postSubmitHistoryKeys = [];
                run.postSubmitHistoryEntries = [];
                run.postSubmitUsesStableIds = false;
                run.postSubmitCompleteCount = null;
                run.postSubmitHistoryFingerprint = '';
                run.postSubmitHistoryStablePolls = 0;
                run.historyVerification = {
                    result: 'baseline-ready',
                    at: new Date().toISOString(),
                    parserPath: baselineSnapshot.parserPath || '',
                    rowCount: baselineSnapshot.count,
                    baselineRowTexts: baselineSnapshot.texts.map(compactHistoryRowText).slice(0, 25),
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

        // The SCBA Face Mask pool opens its single Tour Checklist directly
        // from Start Inspection, without the multi-template chooser. Persist
        // the click first, and NEVER click it again during interrupted resumes.
        if (item.inspectionModeKey === 'scbaTour') {
            if (run.phase !== 'asset') {
                stopRun(item.assetId + ': SCBA draft had already been opened. Verify it manually; no second Start Inspection click.');
                return;
            }
            const startButton = await waitFor(() => enabledButton('Start Inspection'), 10000);
            await bringIntoView(startButton, 300);
            run.phase = 'await-live';
            run.chooserOpenedAt = Date.now();
            saveRun(run);
            startButton.click();
            const started = Date.now();
            while (Date.now() - started < 18000) {
                if (isLiveInspectionPage(mode.title)) {
                    const fresh = getRun();
                    if (fresh?.phase === 'await-live') await processLiveInspection(fresh);
                    return;
                }
                if (findChooserRoot()) {
                    stopRun(item.assetId + ': SCBA unexpectedly opened a chooser instead of the verified direct Tour Checklist. No second click.');
                    return;
                }
                await sleep(180);
            }
            stopRun(item.assetId + ': SCBA Start Inspection did not open the expected Tour Checklist. No retry was made.');
            return;
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
            try {
                chooser = await waitFor(findChooserRoot, 15000);
            } catch {
                stopRun(`${item.assetId}: Start Inspection was clicked once, but the Select Inspection popup could not be recognized. No retry was made. Review the open Vector modal manually.`);
                return;
            }

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

        let card;
        try {
            card = await waitFor(() => findInspectionCardInChooser(mode.title), 15000);
        } catch {
            stopRun(`${item.assetId}: the Select Inspection popup was open, but the exact "${mode.title}" card could not be identified. No option was clicked. Review it manually.`);
            return;
        }
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
            const mode = getItemInspectionMode(run, item);
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

    function stoppedRunAlreadyVerifiedInArchive(stoppedRun, archives = null) {
        if (!stoppedRun?.runId || !stoppedRun?.startedAt ||
            !Array.isArray(stoppedRun.items) || !stoppedRun.items.length) return false;
        const saved = archives || [loadJSON(LAST_SUMMARY_KEY, null), ...getRunHistory()];
        const expected = stoppedRun.items.map(item => clean(item.assetId).toUpperCase());
        if (expected.some(id => !id) || new Set(expected).size !== expected.length) return false;
        return saved.some(summary => {
            if (!summary || summary.runId !== stoppedRun.runId ||
                summary.startedAt !== stoppedRun.startedAt ||
                summary.modeKey !== stoppedRun.modeKey ||
                Number(summary.total) !== expected.length ||
                !Number.isFinite(Date.parse(summary.completedAt || '')) ||
                Date.parse(summary.completedAt) < Date.parse(stoppedRun.startedAt)) return false;
            const completed = Object.values(summary.groups || {}).flatMap(group =>
                Array.isArray(group?.items) ? group.items : []);
            if (completed.length !== expected.length) return false;
            const confirmed = new Map(completed.map(item =>
                [clean(item.assetId).toUpperCase(), clean(item.evidence)]));
            return confirmed.size === expected.length &&
                expected.every(id => confirmed.has(id) && !!confirmed.get(id));
        });
    }

    async function buildPreview(modeKey, ownerInput) {
        const mode = getMode(modeKey);
        const config = getConfig();
        const owners = (Array.isArray(ownerInput) ? ownerInput : [ownerInput])
            .map(raw => {
                const basic = normalizePerson(raw);
                if (!basic) return null;
                return {
                    ...basic,
                    gearSearchPrefix: clean(raw?.gearSearchPrefix).toUpperCase(),
                    legacyPrefix: clean(raw?.legacyPrefix).toUpperCase(),
                    role: clean(raw?.role)
                };
            })
            .filter(Boolean);

        if (!owners.length) throw new Error('Select at least one gear owner.');
        if ((modeKey === 'tour' || modeKey === 'afterFire') && owners.length !== 1) {
            throw new Error('Personal PPE mode requires exactly one owner.');
        }
        if (!mode) throw new Error(`Unknown inspection mode: ${modeKey}`);
        if (!config.initialized) {
            throw new Error('First-time setup required. Open Settings → Profile, confirm the inspector name, and save before running inspections.');
        }
        if (!getSignatureLibrary().length) {
            throw new Error('No saved signature variants. Open Settings → Signatures first.');
        }

        const groups = [];
        let fatalIssue = false;
        const personalMode = modeKey === 'tour' || modeKey === 'afterFire';
        setStatus(personalMode
            ? 'Searching only your PPE and verifying Responsible Party…'
            : 'Verifying live Responsible Party ownership for the selected crew…');
        const freshInventory = personalMode
            ? await scanPpeByResponsibleParty(owners[0].name, message => setStatus(message))
            : await scanPpeCrewOwners(owners, message => setStatus(message));

        for (const owner of owners) {
            setStatus(`Searching ${owner.name}'s assigned PPE...`);
            try {
                const result = await discoverOwnerGear(owner, modeKey, freshInventory);
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
                const supplemental = (result.supplemental || []).map(item => ({
                    ...item, ownerName: owner.name
                }));
                const diff = compareGearSnapshot(owner.prefix, [...gear, ...unknown]);

                if (unknown.length || !gear.length) fatalIssue = true;
                groups.push({
                    owner,
                    gear,
                    unknown,
                    supplemental,
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
                    supplemental: [],
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
        // An older open Vector tab can resurrect and later stop a run which the
        // SAME run ID had already archived as completely verified. An exact
        // evidence-bearing archived match is a ghost, not an unfinished check.
        const archivedStop = stoppedRunAlreadyVerifiedInArchive(stoppedRun);
        if (archivedStop) persistentRemoveRaw(STOPPED_RUN_KEY);
        const stoppedAt = Date.parse(stoppedRun?.stoppedAt || stoppedRun?.startedAt || '');
        const stoppedRecent = !archivedStop && stoppedRun?.modeKey === modeKey &&
            Number.isFinite(stoppedAt) && Date.now() >= stoppedAt &&
            Date.now() - stoppedAt <= 6 * 60 * 60 * 1000;
        const protectedAssetIds = new Set();
        if (stoppedRecent) {
            const previouslyCompleted = new Set(
                (stoppedRun.completed || []).map(c => clean(c.assetId).toUpperCase()).filter(Boolean)
            );
            for (const id of previouslyCompleted) protectedAssetIds.add(id);
            const inFlight = Number.isFinite(stoppedRun.submittedAt)
                ? clean(stoppedRun.items?.[stoppedRun.index]?.assetId).toUpperCase() : '';
            if (inFlight) protectedAssetIds.add(inFlight);
            if (protectedAssetIds.size) {
                const recovery = document.createElement('div');
                recovery.style.cssText = 'background:#fff4e5;border:2px solid #d49b42;padding:10px;margin:8px 0;border-radius:5px;line-height:1.45;';
                recovery.innerHTML =
                    `<b>PREVIOUS RUN NEEDS REVIEW:</b> ${previouslyCompleted.size} item(s) already recorded complete` +
                    (inFlight && !previouslyCompleted.has(inFlight)
                        ? `; 1 last submitted item (${escapeHtml(inFlight)}) has UNVERIFIED completion` : '') +
                    '. These items were left unchecked to avoid accidental duplicate inspections. ' +
                    'Check the official Vector Item Log before retrying an uncertain submission.<br>' +
                    [...protectedAssetIds].map(escapeHtml).join(', ');
                const chooseNew = makeButton('NEW physical inspection — select all gear', {
                    background: '#e8f3f7', color: '#153e5c'
                });
                chooseNew.onclick = () => {
                    if (!confirm(
                        'Start an entirely NEW physical inspection of all listed equipment? ' +
                        'Some items may already have been submitted during the prior run. ' +
                        'Selecting them again can create duplicate official records. ' +
                        'Do not use this to retry an uncertain submission.'
                    )) return;
                    for (const row of rows) row.include.checked = true;
                    chooseNew.textContent = 'All gear selected for a new inspection';
                    setStatus('All gear selected for a NEW physical inspection. Review the answers and certify before starting.');
                };
                recovery.appendChild(document.createElement('br'));
                recovery.appendChild(chooseNew);
                box.appendChild(recovery);
            }
        }

        for (const group of groups) {
            const owner = group.owner;
            const discovered = group.gear;
            const totalFound = discovered.length + group.unknown.length;

            const ownerHeader = document.createElement('div');
            ownerHeader.style.cssText = 'margin:14px 0 6px;padding:8px 10px;background:#eaf0f7;border-left:4px solid #173f70;font-weight:700;';
            ownerHeader.textContent = `${owner.name} — ${owner.role || 'Personnel'} — ${totalFound} item(s) for this inspection mode` +
                (group.supplemental?.length
                    ? ` · ${group.supplemental.length} other assigned item(s)` : '');
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

            if (group.supplemental?.length) {
                const info = document.createElement('div');
                info.style.cssText = 'background:#e9f4ff;border:1px solid #9bbfd8;padding:9px;margin:6px 0;border-radius:5px;font-size:12px;';
                info.innerHTML =
                    '<b>OTHER ASSIGNED EQUIPMENT — NOT PART OF THIS INSPECTION:</b><br>' +
                    group.supplemental.map(x =>
                        `${escapeHtml(x.assetId)} — ${escapeHtml(x.type)}`
                    ).join('<br>') +
                    '<br>These belong to this Responsible Party but require their own applicable check; no inspection is submitted for them here.';
                box.appendChild(info);
            }
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
                if (item.inspectionModeKey === 'scbaTour') {
                    const row = document.createElement('div');
                    row.style.cssText = 'border:2px solid #3c7b9a;border-radius:7px;padding:12px;margin:9px 0;background:#f0f8ff;';
                    const head = document.createElement('label');
                    head.style.cssText = 'display:flex;align-items:center;gap:9px;font-weight:700;margin-bottom:8px;';
                    const include = document.createElement('input');
                    include.type = 'checkbox';
                    include.checked = !protectedAssetIds.has(clean(item.assetId).toUpperCase());
                    const title = document.createElement('span');
                    title.textContent = 'SCBA Face Mask Tour Checklist — ' + item.assetId +
                        ' (' + item.ownerName + ')';
                    head.append(include, title);
                    row.appendChild(head);
                    const instruction = document.createElement('div');
                    instruction.style.cssText = 'font-size:11px;color:#35596b;margin:6px 0 10px;';
                    instruction.textContent = 'PASS is the initial selection, just as with other PPE. Physically inspect all seven SCBA components and change any problem to FAIL before confirming. Failed masks must be handled using Vector’s original SCBA inspection.';
                    row.appendChild(instruction);
                    const scbaSelects = SCBA_TOUR_QUESTIONS.map((question, index) => {
                        const label = document.createElement('label');
                        label.style.cssText = 'display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:8px 0;border-top:1px solid #cee2ef;font-size:11px;';
                        const name = document.createElement('span');
                        name.style.cssText = 'flex:1;';
                        name.textContent = (index + 1) + '. ' + question;
                        const select = document.createElement('select');
                        select.style.cssText = 'min-width:100px;padding:6px;';
                        select.innerHTML = '<option value="pass">PASS</option><option value="fail">FAIL</option>';
                        select.value = 'pass'; // Default selection only; inspector must still inspect and certify.
                        select.addEventListener('change', () => {
                            row.style.borderColor = scbaSelects.some(x => x.value === 'fail')
                                ? '#b32c2c' : '#3c7b9a';
                        });
                        label.append(name,select);
                        row.appendChild(label);
                        return select;
                    });
                    box.appendChild(row);
                    rows.push({ item, include, scbaSelects });
                    return;
                }
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

                const selected = [];
                for (const row of rows) {
                    if (!row.include.checked) continue;
                    if (row.item.inspectionModeKey === 'scbaTour') {
                        const scbaAnswers = row.scbaSelects.map(select => select.value);
                        if (scbaAnswers.length !== 7 || scbaAnswers.some(value => !value)) {
                            alert(row.item.assetId + ': answer all seven SCBA checklist questions before starting.');
                            return;
                        }
                        if (scbaAnswers.some(value => value === 'fail')) {
                            alert(row.item.assetId +
                                ': SCBA has one or more FAILED checks. Finish this SCBA inspection manually in Vector so its failure details are recorded correctly. Uncheck this SCBA item to proceed with other gear.');
                            return;
                        }
                        selected.push({ ...row.item, scbaAnswers, failureNote: '' });
                        continue;
                    }
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
                rebelCommandEvent('ppe_workflow_started', {
                    success: true,
                    workflowMode: modeKey,
                    description: 'PPE workflow started.',
                    metadata: { itemCount: selected.length, stage: 'asset' }
                });
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

                rebelCommandEvent('runtime_error', {
                    success: false,
                    workflowMode: modeKey,
                    errorType: 'ppe_start_failed',
                    errorMessage: clean(error?.message || error).replace(/\b\d{5,}\b/g, '[id]').slice(0, 300),
                    metadata: { stage: 'start' }
                });

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
            const cancelledDaily = await cancelCaptainDailyCheckForRealInspection();
            if (cancelledDaily) setStatus('Daily Captain Check cancelled. Starting the real PPE inspection…');
            else setStatus('Opening Equipment → PPE…');
            await ensurePpeEquipmentPage(message => setStatus(message), false);
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
            const cancelledDaily = await cancelCaptainDailyCheckForRealInspection();
            if (cancelledDaily) setStatus('Daily Captain Check cancelled. Starting the real Captain PPE inspection…');
            else setStatus('Opening Equipment → PPE…');
            await ensurePpeEquipmentPage(message => setStatus(message), false);
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
        // Always search as the current signed-in inspector, never a legacy
        // directory record which could contain somebody else's name.
        const self = {
            name: config.inspectorName,
            // Stable internal owner key; legacy stored prefix retained only if
            // already present so existing local rules/snapshots keep working.
            prefix: config.selfPrefix || ownerRosterKey(config.inspectorName)
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
                people: resolveCaptainSetPeople(set, config),
                memberCount: (set.memberPrefixes || []).length
            }))
            .filter(set => set.people.length && set.people.length === set.memberCount);

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
        const last = persistentGetRaw(CAPTAIN_LAST_SET_KEY) || '';
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
            persistentSetRaw(CAPTAIN_LAST_SET_KEY, set.id);

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
                .map(cb => set.people.find(person => person.prefix === cb.dataset.prefix) || null)
                .filter(Boolean)
                .map(person => ({
                    name: person.name,
                    prefix: person.prefix,
                    gearSearchPrefix: person.gearSearchPrefix,
                    legacyPrefix: person.legacyPrefix
                }));
            if (!selected.length) {
                alert('Select at least one person whose PPE you inspected.');
                return;
            }
            persistentSetRaw(CAPTAIN_LAST_SET_KEY, set.id);
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

    // PPE preflight confirmed the authoritative "Responsible Party" header.
    // Do not use Location, duplicate name cells, or asset prefix for ownership.
    function responsiblePartyPpeRow(anchor) {
        const row = ppeRowForAnchor(anchor);
        const table = row?.closest('table');
        const heads = table ? [...table.querySelectorAll('thead th')].map(h =>
            clean(h.innerText || h.textContent || '').toLowerCase()) : [];
        const cells = row ? [...row.querySelectorAll(':scope > td, :scope > [role="cell"]')] : [];
        const nameIndex = heads.indexOf('name'), partyIndex = heads.indexOf('responsible party');
        const statusIndex = heads.indexOf('item status');
        const poolIndex = heads.indexOf('pool');
        // Populate only fields that Vector actually exposes in this verified row.
        const headerValue = patterns => {
            const index = heads.findIndex(header => patterns.some(rx => rx.test(header)));
            return index >= 0 ? val(index) : '';
        };
        if (!row || nameIndex < 0 || partyIndex < 0 || !cells[nameIndex] || !cells[partyIndex]) {
            throw new Error('PPE Name and Responsible Party columns were not found or aligned. Scan stopped.');
        }
        const val = index => index >= 0 && cells[index]
            ? clean(cells[index].innerText || cells[index].textContent || '') : '';
        const href = anchor.getAttribute('href') || '';
        const ids = href.match(/\/app\/equipment\/PPE\/pool\/(\d+)\/(\d+)\/item/i);
        if (!ids) throw new Error('PPE equipment row has no verifiable item URL.');
        // PPE Name is an arbitrary equipment label, NOT a machine-generated
        // surname prefix. Real examples include B.SMITH-10237612-FL and
        // numeric serials. Validate presence and printability, not punctuation.
        // Identity still comes from the exact pool/item URL, and ownership
        // still comes EXCLUSIVELY from Responsible Party.
        const assetId = val(nameIndex).toUpperCase();
        if (!assetId || assetId.length > 160 || !/[\p{L}\p{N}]/u.test(assetId) ||
            /[\u0000-\u001F\u007F]/.test(assetId)) {
            throw new Error(
                'PPE Name missing or unusable for item ' + ids[1] + ':' + ids[2] +
                '. The roster was not saved; no equipment ownership was guessed.'
            );
        }
        const party = val(partyIndex);
        return {
            assetId, pool: ids[1], itemId: ids[2],
            url: new URL(href, location.origin).href,
            ownerName: party && party !== '-' && !isOrganizationOrBadRosterName(party) ? party : '',
            status: val(statusIndex),
            serial: headerValue([/^serial(?: number| no| #)?$/i]),
            size: headerValue([/^size$/i]),
            manufacture: headerValue([/^date of manuf(?:acture|acturing)?\.?$/i,
                /^manufactur(?:e|ing) date$/i, /^mfg\.? date$/i]),
            type: getPoolType(ids[1]) === 'UNKNOWN'
                ? (val(poolIndex) || 'UNKNOWN') : getPoolType(ids[1])
        };
    }

    // Bounded PPE owner discovery, shared by personal and Captain checks.
    // Search the specified PPE asset prefix via Vector's own search field and
    // verify every returned row against Responsible Party. Never infer owner
    // from Location, an asset ID, or a PERSON-* master-roster key.
    // Direct Vector PPE filter by Responsible Party, verified live on 2026-10-22.
    // This can return serial-number SCBA masks as well as surname-marked bunker
    // PPE without guessing gear ID prefixes, and without a department-wide crawl.
    // It uses the existing Vector filter controls (read-only UI navigation).
    async function scanPpeByResponsibleParty(personName, progress = null) {
        const name = clean(personName);
        const ownerKey = masterNameKey(name);
        if (!ownerKey || isOrganizationOrBadRosterName(name)) {
            throw new Error('A valid Responsible Party person name is required.');
        }
        await ensurePpeEquipmentPage(progress, false);
        const search = getSearchInput();
        if (!search) throw new Error('PPE search field missing.');
        if (clean(search.value)) {
            // Clear the separate equipment-name search; otherwise it would hide
            // valid gear even after Responsible Party filtering succeeds.
            nativeSetInput(search, '');
            await sleep(350);
        }
        const findButton = label => [...document.querySelectorAll('button,[role="button"]')]
            .find(btn => visible(btn) &&
                (uiEquals(btn.getAttribute('aria-label') || '', label) ||
                    uiEquals(btn.innerText || btn.textContent || '', label)));
        let input = [...document.querySelectorAll('input[role="combobox"]')]
            .find(el => visible(el) && /filter-equip-.*-responsibleParty/i.test(el.id));
        if (!input) {
            const open = findButton('Open filter options') || findButton('Filters');
            if (!open) throw new Error('Vector PPE Filters button was not found.');
            open.click();
            const openedAt = Date.now();
            while (Date.now() - openedAt < 5500) {
                await sleep(120);
                input = [...document.querySelectorAll('input[role="combobox"]')]
                    .find(el => visible(el) && /filter-equip-.*-responsibleParty/i.test(el.id));
                if (input) break;
            }
        }
        if (!input) throw new Error('Vector PPE Responsible Party filter was not available.');
        // Clear other user-selected draft filters so an earlier Pool/Location
        // filter cannot silently exclude this person's assigned equipment.
        const clear = findButton('Clear Filters');
        if (!clear) throw new Error('Vector did not expose Clear Filters; cannot guarantee full coverage.');
        clear.click();
        await sleep(180);
        input = [...document.querySelectorAll('input[role="combobox"]')]
            .find(el => visible(el) && /filter-equip-.*-responsibleParty/i.test(el.id));
        if (!input) {
            const open = findButton('Open filter options') || findButton('Filters');
            open?.click();
            await sleep(250);
            input = [...document.querySelectorAll('input[role="combobox"]')]
                .find(el => visible(el) && /filter-equip-.*-responsibleParty/i.test(el.id));
        }
        if (!input) throw new Error('Responsible Party picker closed unexpectedly after clearing filters.');
        // Vector's React-select may reject a complete full-name autocomplete
        // string. Searching a name fragment produces options; the resulting
        // choice MUST match the complete requested person name exactly.
        const tokens = name.split(/[\s-]+/).filter(t => t.length >= 2);
        const shortSurname = tokens.at(-1)?.slice(0, 2);
        const probes = [...new Set([shortSurname, tokens.at(-1), tokens[0], name]
            .filter(Boolean))];
        // React-select's multiselect value must actually contain a selected
        // chip. Finding an option is NOT proof it was selected (v3.2.29 live
        // video showed Apply Filters running with an empty Responsible Party).
        const partyIsSelected = () => {
            const valueContainer = input.parentElement?.parentElement;
            if (!valueContainer) return false;
            const labels = [...valueContainer.querySelectorAll(
                '[class*="multiValue"],[class*="singleValue"],[class*="MultiValue"]'
            )].filter(el => visible(el));
            if (labels.some(el =>
                masterNameKey(el.innerText || el.textContent || '') === ownerKey)) return true;
            // Some Vector builds give the selected chip a generated CSS class.
            // Input.value is NOT DOM textContent, so this checks rendered labels,
            // not an uncommitted search phrase typed into the combobox.
            const rendered = clean(valueContainer.textContent || '')
                .replace(/[×✕]/g, '').trim();
            return masterNameKey(rendered) === ownerKey;
        };
        let chosen = false;
        for (const term of probes) {
            input.focus();
            input.click();
            nativeSetInput(input, term);
            const started = Date.now();
            while (Date.now() - started < 4000) {
                await sleep(130);
                const menuId = input.getAttribute('aria-controls');
                const menu = menuId ? document.getElementById(menuId) : null;
                const options = [...(menu || document).querySelectorAll('[role="option"],[id*="-option-"]')]
                    .filter(el => visible(el));
                const target = options.find(el =>
                    masterNameKey(el.innerText || el.textContent || '') === ownerKey);
                if (!target) continue;
                // One mousedown is the React-select selection gesture. A second
                // click can toggle it back off in the multi-select widget.
                target.dispatchEvent(new MouseEvent('mousedown', {bubbles:true,cancelable:true}));
                await sleep(200);
                if (!partyIsSelected()) {
                    // Alternate selector behavior: some Vector releases select
                    // on click instead of mousedown.
                    target.click();
                    await sleep(200);
                }
                chosen = partyIsSelected();
                if (chosen) break;
            }
            if (chosen) break;
        }
        if (!chosen) throw new Error('Responsible Party "' + name +
            '" was not confirmed selected in the Vector filter. No check was started.');
        const apply = findButton('Apply Filters');
        if (!apply) throw new Error('Vector did not show Apply Filters.');
        apply.click();

        const started = Date.now();
        let firstReady = 0, stableAt = 0, prior = '', emptyAt = 0;
        while (Date.now() - started < 25000) {
            await sleep(200);
            const snapshot = ppeLoadedRowsSnapshot();
            const anchors = getVisiblePpeAnchors(getPpeResultsContainer() || document);
            let correct = snapshot.ready && anchors.length > 0;
            if (correct) {
                try {
                    correct = anchors.every(a =>
                        masterNameKey(responsiblePartyPpeRow(a).ownerName) === ownerKey);
                } catch { correct = false; }
            }
            const sig = correct ? snapshot.signature : '';
            if (correct) {
                const now = Date.now();
                if (!firstReady) firstReady = now;
                if (sig !== prior) { prior = sig; stableAt = now; }
                if (now-firstReady >= 1400 && now-stableAt >= 900) break;
            } else {
                firstReady = 0; prior = ''; stableAt = 0;
            }
            if (hasExplicitNoResults() && Date.now() - started > 3000) {
                if (!emptyAt) emptyAt = Date.now();
                if (Date.now() - emptyAt > 1200) {
                    throw new Error('No PPE assigned to Responsible Party "' + name +
                        '" in Vector. The check was not started.');
                }
            }
            if (progress && Date.now()-started > 1200 &&
                Math.floor((Date.now()-started)/1000) % 4 === 0) {
                progress('Waiting for Responsible Party "' + name + '" PPE rows…');
            }
        }
        if (!firstReady || Date.now() - firstReady < 1400 ||
            Date.now() - stableAt < 900) {
            throw new Error('Responsible Party PPE filter did not settle for "'+name+'". Check stopped.');
        }
        const byItem = new Map(), seenPages = new Set();
        let pageCount=0, rowCount=0;
        for (let page=0;page<20;page++) {
            const snapshot = ppeLoadedRowsSnapshot();
            const sig = visibleAssetLinksSignature();
            if (!snapshot.ready || !sig || seenPages.has(sig)) {
                throw new Error('Responsible Party filtered PPE pagination incomplete or repeated.');
            }
            seenPages.add(sig);
            pageCount++;
            const anchors = getVisiblePpeAnchors(getPpeResultsContainer() || document);
            rowCount += anchors.length;
            if (rowCount > 200) {
                throw new Error('Responsible Party filter returned more than 200 rows. Unverified filter; stopped.');
            }
            for (const anchor of anchors) {
                const item = responsiblePartyPpeRow(anchor);
                if (masterNameKey(item.ownerName) !== ownerKey) {
                    throw new Error('PPE filter returned an asset belonging to a different Responsible Party: ' +
                        item.assetId + '. Stopped without creating an inspection.');
                }
                const key = item.pool+':'+item.itemId;
                const previous = byItem.get(key);
                if (previous && (previous.assetId!==item.assetId ||
                    masterNameKey(previous.ownerName)!==ownerKey)) {
                    throw new Error('Conflicting PPE filtered row for ' + key);
                }
                byItem.set(key,item);
            }
            if (progress) progress('Responsible Party '+name+': verified '+
                byItem.size+' assigned PPE items ('+pageCount+' page(s))…');
            const next = getPaginationControl('next');
            if (!paginationControlEnabled(next)) {
                return {
                    items:[...byItem.values()],pageCount,rowCount,
                    source:'Vector PPE Responsible Party column',
                    scope:'responsible-party-filter',
                    capturedAt:new Date().toISOString()
                };
            }
            if (page === 19) throw new Error('Responsible Party results exceed 20 pages; check stopped.');
            next.click();
            await waitForPpePageChange(sig);
        }
        throw new Error('Responsible Party PPE filtered scan did not reach the last page.');
    }

    async function scanPpeOwnerSearch(owner, progress = null) {
        const ownerName = clean(owner?.name);
        const ownerKey = masterNameKey(ownerName);
        if (!ownerKey) throw new Error('Set your full inspector name in Settings → Profile first.');
        // The search field can legitimately show zero results from a previous
        // query. Require the PPE tab and controls, not a loaded full inventory,
        // before overwriting that search with the owner's saved gear prefix.
        await ensurePpeEquipmentPage(progress, false);
        const search = getSearchInput();
        if (!search) throw new Error('Vector PPE search input was not found.');
        const originalTerm = search.value || '';
        const ownerPrefix = clean(owner?.prefix).toUpperCase();
        if (!ownerPrefix || ownerPrefix.length < 2 ||
            !/^[A-Z0-9._-]+$/.test(ownerPrefix) ||
            ownerPrefix.startsWith('PERSON-')) {
            throw new Error('A real PPE asset prefix is required in Settings → Profile (for example BRION).');
        }
        const searchTerms = [ownerPrefix];
        const byItem = new Map();
        const searched = [];
        let scannedPages = 0, scannedRows = 0;
        try {
            for (const term of searchTerms) {
                if (progress) progress('Searching PPE asset IDs by prefix "' + term +
                    '" for ' + ownerName + '…');
                const before = visibleAssetLinksSignature();
                const priorTerm = clean(search.value);
                nativeSetInput(search, term);
                // The form changes immediately, but Vector may fetch/render the
                // new results considerably later. Wait for an actual transition
                // or an explicit, settled no-results state.
                let latest = '', stableSince = 0, readySince = 0;
                let didSettle = false, empty = false;
                const started = Date.now();
                while (Date.now() - started < 24000) {
                    await sleep(200);
                    if (clean(search.value) !== clean(term)) continue;
                    const snap = ppeLoadedRowsSnapshot();
                    const emptyState = hasExplicitNoResults() && !snap.ready &&
                        Date.now() - started >= 2200;
                    const changed = before !== visibleAssetLinksSignature();
                    const unchangedQuery = priorTerm === clean(term);
                    if ((snap.ready && (changed || unchangedQuery)) || emptyState) {
                        const candidate = emptyState ? 'EMPTY' : snap.signature;
                        const now = Date.now();
                        if (!readySince) readySince = now;
                        if (candidate !== latest) {
                            latest = candidate;
                            stableSince = now;
                        }
                        if (now - readySince >= 1400 && now - stableSince >= 900) {
                            didSettle = true;
                            empty = emptyState;
                            break;
                        }
                    } else {
                        readySince = 0;
                        stableSince = 0;
                        latest = '';
                    }
                }
                if (!didSettle) {
                    throw new Error('Vector did not confirm a settled PPE search for "' +
                        term + '". Scoped PPE search stopped before any inspection or audit.');
                }
                searched.push(term);
                if (empty) continue;
                const visitedPages = new Set();
                for (let page = 0; page < 15; page++) {
                    const snapshot = ppeLoadedRowsSnapshot();
                    const signature = visibleAssetLinksSignature();
                    if (!snapshot.ready || !signature || visitedPages.has(signature)) {
                        throw new Error('PPE search pagination was incomplete or repeated for "' + term + '".');
                    }
                    visitedPages.add(signature);
                    scannedPages++;
                    const anchors = getVisiblePpeAnchors(getPpeResultsContainer() || document);
                    scannedRows += anchors.length;
                    if (scannedRows > 160) {
                        throw new Error('PPE owner search returned too many results to trust as a personal filter. No inspection was started.');
                    }
                    for (const anchor of anchors) {
                        const item = responsiblePartyPpeRow(anchor);
                        if (item.ownerName && masterNameKey(item.ownerName) === ownerKey) {
                            const key = item.pool + ':' + item.itemId;
                            const previous = byItem.get(key);
                            if (previous && (previous.assetId !== item.assetId ||
                                masterNameKey(previous.ownerName) !== ownerKey)) {
                                throw new Error('Conflicting PPE assignment for ' + key + '.');
                            }
                            byItem.set(key, item);
                        }
                    }
                    if (progress) progress('Verified ' + byItem.size + ' PPE item(s) assigned to ' +
                        ownerName + ' using Responsible Party…');
                    const next = getPaginationControl('next');
                    if (!paginationControlEnabled(next)) break;
                    if (page === 14) {
                        throw new Error('PPE owner search exceeded 15 pages. Refusing a department-wide scan.');
                    }
                    next.click();
                    await waitForPpePageChange(signature);
                    if (clean(search.value) !== clean(term)) {
                        throw new Error('Vector reset the owner search during pagination. Inspection blocked.');
                    }
                }
            }
            if (!byItem.size) throw new Error(
                'No PPE could be verified for ' + ownerName +
                ' with PPE prefix ' + ownerPrefix +
                ' and Responsible Party. Verify your saved PPE prefix and Vector assignment.'
            );
            return {
                items: [...byItem.values()],
                pageCount: scannedPages,
                rowCount: scannedRows,
                searched,
                source: 'Vector PPE Responsible Party column',
                scope: 'verified-owner-search',
                capturedAt: new Date().toISOString()
            };
        } finally {
            // Leave the verified asset-prefix search visible. Restoring an old
            // full-name search would make Vector show "No PPE item found" again
            // and falsely suggest that the inspection ignored the PPE prefix.
            if (search.isConnected &&
                clean(search.value).toUpperCase() !== ownerPrefix) {
                nativeSetInput(search, ownerPrefix);
            }
        }
    }

    // A PERSON-* identifier is a master-roster key, not a PPE search term.
    // Prefer an inspector's own saved prefix, then a previous explicit
    // person-directory gear prefix, then a credible legacy roster gear prefix.
    // For names not previously configured, search the surname as a candidate
    // term only; the Responsible Party column must still confirm each result.
    function crewPpeSearchPrefix(owner, config = getConfig()) {
        const nameKey = masterNameKey(owner?.name);
        if (!nameKey) throw new Error('Captain crew member has no name.');
        const expected = expectedSurnamePrefix(owner.name);
        const valid = value => {
            const term = clean(value).toUpperCase();
            return term.length >= 2 && term.length <= 60 &&
                /^[A-Z0-9._-]+$/.test(term) &&
                !term.startsWith('PERSON-');
        };
        const override = clean(owner?.gearSearchPrefix).toUpperCase();
        if (override) {
            if (!valid(override)) throw new Error(owner.name + ': invalid configured PPE search prefix "' +
                override + '". Edit Settings → Captain Sets.');
            return { prefix: override, source: 'captain-set-override' };
        }
        const inspectorPrefix = masterNameKey(config.inspectorName) === nameKey
            ? clean(config.selfPrefix).toUpperCase() : '';
        if (valid(inspectorPrefix)) return { prefix: inspectorPrefix, source: 'inspector-profile' };
        const configured = (config.peopleDirectory || []).filter(p =>
            masterNameKey(p.name) === nameKey && valid(p.prefix));
        if (configured.length === 1) {
            return { prefix: clean(configured[0].prefix).toUpperCase(), source: 'local-person-directory' };
        }
        const legacy = clean(owner.legacyPrefix).toUpperCase();
        // Legacy M and WS0122 were known generic inventory series incorrectly
        // linked to people. Never reuse an arbitrary mismatching serial prefix.
        const legacySurnameMatch = valid(legacy) && expected &&
            legacy.replace(/[^A-Z]/g, '').endsWith(expected);
        if (legacySurnameMatch) {
            return { prefix: legacy, source: 'legacy-surname-matched' };
        }
        if (valid(expected)) return { prefix: expected, source: 'surname-candidate' };
        throw new Error('No safe PPE search prefix for ' + owner.name +
            '. Configure the person gear prefix; department-wide discovery is disabled for this check.');
    }

    // Read-only scoped crew discovery: one bounded Vector search per selected
    // person. Never invoke scanPpeOwnerInventory(), follow general inventory
    // pagination, or claim that PERSON-* keys identify gear. A missing member
    // blocks the audit or monthly preview rather than producing false compliance.
    async function scanPpeCrewOwners(owners, progress = null) {
        const config = getConfig();
        if (!Array.isArray(owners) || !owners.length) {
            throw new Error('Choose at least one crew member.');
        }
        const uniqueNames = new Set();
        const byItem = new Map();
        const searches = [];
        let pageCount = 0;
        let rowCount = 0;
        for (let i = 0; i < owners.length; i++) {
            const owner = owners[i];
            const nameKey = masterNameKey(owner?.name);
            if (!nameKey || uniqueNames.has(nameKey)) {
                throw new Error('Captain Set has a missing or duplicate person identity.');
            }
            uniqueNames.add(nameKey);
            if (progress) progress('Crew PPE ' + (i + 1) + '/' + owners.length +
                ': filtering Responsible Party = ' + owner.name + '…');
            let scoped;
            try {
                scoped = await scanPpeByResponsibleParty(owner.name, progress);
            } catch (error) {
                throw new Error(owner.name + ': ' +
                    (error?.message || String(error)) +
                    '. Crew check stopped; no incomplete roster was accepted.');
            }
            if (!scoped.items.length) throw new Error(owner.name +
                ': no PPE ownership confirmed. Crew check stopped.');
            searches.push({
                name: owner.name, filter: 'Responsible Party',
                source: 'Vector PPE', assetCount: scoped.items.length
            });
            pageCount += scoped.pageCount;
            rowCount += scoped.rowCount;
            for (const item of scoped.items) {
                if (masterNameKey(item.ownerName) !== nameKey) {
                    throw new Error('PPE ownership conflict for ' + item.assetId);
                }
                const key = item.pool + ':' + item.itemId;
                const previous = byItem.get(key);
                if (previous && masterNameKey(previous.ownerName) !== nameKey) {
                    throw new Error('One PPE item was assigned to two selected crew members: ' + key);
                }
                if (previous && previous.assetId !== item.assetId) {
                    throw new Error('PPE asset ID changed during crew discovery: ' + key);
                }
                byItem.set(key, item);
            }
        }
        if (progress) progress('Verified ' + byItem.size + ' assigned PPE item(s) for ' +
            owners.length + ' crew members using targeted searches.');
        return {
            items: [...byItem.values()],
            pageCount,
            rowCount,
            searches,
            source: 'Vector PPE Responsible Party column',
            scope: 'verified-crew-search',
            capturedAt: new Date().toISOString()
        };
    }

    async function scanPpeOwnerInventory(progress = null) {
        await ensurePpeEquipmentPage(progress);
        const search = getSearchInput();
        if (!search) throw new Error('PPE search control unavailable.');
        const original = search.value || '';
        try {
            if (clean(original)) {
                const beforeClear = visibleAssetLinksSignature();
                nativeSetInput(search, '');
                await waitForPpeRowsReady(22000, beforeClear, progress);
            }
            await goToFirstPpePage(progress);
            await waitForPpeRowsReady(22000, null, progress);
            const items = new Map(), seenPages = new Set();
            let pageCount = 0, rowCount = 0, unassignedCount = 0;
            for (let guard = 0; guard < 1000; guard++) {
                // The previous wait verified a complete populated page; reread
                // that state immediately before processing its ownership rows.
                const currentPage = ppeLoadedRowsSnapshot();
                const sig = visibleAssetLinksSignature();
                if (!currentPage.ready || !sig || seenPages.has(sig)) {
                    throw new Error('PPE pagination repeated or rows became incomplete; inventory not saved.');
                }
                seenPages.add(sig);
                pageCount++;
                const anchors = getVisiblePpeAnchors(getPpeResultsContainer() || document);
                if (!anchors.length) throw new Error('PPE page contained no verifiable equipment links.');
                for (const anchor of anchors) {
                    const item = responsiblePartyPpeRow(anchor);
                    rowCount++;
                    if (!item.ownerName) unassignedCount++;
                    const key = item.pool + ':' + item.itemId;
                    const old = items.get(key);
                    if (old && (old.assetId !== item.assetId ||
                        masterNameKey(old.ownerName) !== masterNameKey(item.ownerName))) {
                        throw new Error('PPE item ' + key + ' has conflicting ownership rows.');
                    }
                    items.set(key, item);
                }
                if (progress) progress('PPE page ' + pageCount + ' · ' +
                    items.size + ' assets · ' + unassignedCount + ' unassigned');
                const next = getPaginationControl('next');
                if (!paginationControlEnabled(next)) return {
                    items: [...items.values()],
                    pageCount, rowCount, unassignedCount,
                    source: 'Vector PPE Responsible Party column',
                    capturedAt: new Date().toISOString()
                };
                if (guard === 999) throw new Error('PPE census exceeds 1000 pages, incomplete.');
                next.click();
                await waitForPpePageChange(sig);
            }
            throw new Error('PPE census ended without a verified last page.');
        } finally {
            if (clean(original) && search.isConnected) nativeSetInput(search, original);
        }
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

    // Vector renders the Equipment/PPE shell before it renders the equipment
    // table. A selected PPE tab or an empty table is NOT evidence that the list
    // has finished loading. Wait for a populated, stable page containing the
    // authoritative Responsible Party values before counting or paginating.
    function ppeLoadedRowsSnapshot() {
        const root = getPpeResultsContainer();
        const anchors = root ? getVisiblePpeAnchors(root) : [];
        const items = [];
        let ready = anchors.length > 0;
        for (const anchor of anchors) {
            const row = ppeRowForAnchor(anchor);
            const table = row?.closest('table');
            const headers = table ? [...table.querySelectorAll('thead th')].map(cell =>
                clean(cell.innerText || cell.textContent || '').toLowerCase()) : [];
            const cells = row ? [...row.querySelectorAll(':scope > td, :scope > [role="cell"]')] : [];
            const nameIndex = headers.indexOf('name');
            const partyIndex = headers.indexOf('responsible party');
            if (nameIndex < 0 || partyIndex < 0 || !cells[nameIndex] || !cells[partyIndex]) {
                ready = false;
                break;
            }
            const name = clean(cells[nameIndex].innerText || cells[nameIndex].textContent || '');
            const party = clean(cells[partyIndex].innerText || cells[partyIndex].textContent || '');
            const href = anchor.getAttribute('href') || '';
            if (!name || !/\/app\/equipment\/PPE\/pool\/\d+\/\d+\/item/i.test(href)) {
                ready = false;
                break;
            }
            items.push(href + '::' + name + '::' + party);
        }
        // The visible footer normally says "1-10 of N". If present, it is
        // authoritative evidence that a transient partial page is incomplete.
        // If absent, a longer stable-row dwell is still required.
        const region = root?.parentElement || root;
        const regionText = clean(region?.innerText || region?.textContent || '').slice(-1500);
        const range = regionText.match(/(?:^|\s)(\d+)\s*[-–]\s*(\d+)\s+of\s+(\d+)(?:\s|$)/i);
        const expectedCount = range ? Number(range[2]) - Number(range[1]) + 1 : null;
        if (expectedCount !== null && (!Number.isInteger(expectedCount) ||
            expectedCount < 1 || expectedCount > 500 || anchors.length !== expectedCount)) {
            ready = false;
        }
        return {
            ready, count: anchors.length,
            signature: items.join('|'),
            expectedCount,
            reason: !anchors.length ? 'waiting for first PPE item' :
                !ready ? 'waiting for complete PPE rows' : 'PPE rows stabilizing'
        };
    }

    async function waitForPpeRowsReady(timeoutMs = 22000, previousSignature = null, progress = null) {
        const started = Date.now();
        let firstReadyAt = 0, stableSince = 0, signature = '';
        let lastProgressAt = -Infinity;
        let latest = { reason: 'waiting for PPE list', count: 0 };
        while (Date.now() - started < timeoutMs) {
            const tab = findVectorNavigationTarget('PPE');
            const selected = !!tab && vectorControlLooksActive(tab);
            const snapshot = selected ? ppeLoadedRowsSnapshot() :
                { ready: false, count: 0, reason: 'waiting for PPE tab to activate' };
            latest = snapshot;
            // Callers pass visibleAssetLinksSignature() before navigation.
            // Compare like-for-like; snapshot.signature additionally tracks the
            // owner cells that may finish rendering after the asset links.
            const changed = previousSignature === null ||
                (snapshot.ready && visibleAssetLinksSignature() !== previousSignature);
            if (selected && snapshot.ready && changed) {
                const now = Date.now();
                if (!firstReadyAt) firstReadyAt = now;
                if (snapshot.signature !== signature) {
                    signature = snapshot.signature;
                    stableSince = now;
                }
                // Keep at least 1.4 seconds of post-population observation,
                // including at least 0.9 seconds with no row/owner changes.
                if (now - firstReadyAt >= 1400 && now - stableSince >= 900) {
                    return snapshot;
                }
            } else {
                firstReadyAt = 0;
                stableSince = 0;
                signature = '';
            }
            if (progress && Date.now() - lastProgressAt >= 900) {
                progress('Waiting for Vector PPE to load — ' + snapshot.reason +
                    (snapshot.count ? ' (' + snapshot.count + ' visible)' : '') + '…');
                lastProgressAt = Date.now();
            }
            await sleep(200);
        }
        throw new Error('Vector PPE did not finish loading within ' +
            Math.round(timeoutMs / 1000) + ' seconds (' + latest.reason +
            ', ' + latest.count + ' visible). No master roster was saved.');
    }

    async function waitForPpePageChange(previousSignature, timeoutMs = 22000) {
        // A changed link signature can be the first transient row of the next
        // page. Wait for the full table and Responsible Party cells to settle.
        const loaded = await waitForPpeRowsReady(timeoutMs, previousSignature);
        return loaded.signature;
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
        const unverified = [];

        for (const anchor of anchors) {
            const assetId = genericAssetIdFromAnchor(anchor);
            if (!assetId) continue;

            const prefix = prefixFromAssetId(assetId);
            if (!prefix) continue;

            const row = ppeRowForAnchor(anchor);
            const name = clean(likelyPersonFromPpeRow(row, assetId));
            if (!name) continue;

            // Generic asset prefixes are not proof of assignment. Fail closed.
            if (!rosterHasPersonSpecificPrefix({ name, prefix })) {
                unverified.push({ name, prefix, assetId, reason: 'person_to_asset_not_verified' });
                continue;
            }

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
            unverified,
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

    async function waitForPpeListReady(timeoutMs = 22000, progress = null, requireRows = true) {
        if (!requireRows) {
            const start = Date.now();
            while (Date.now() - start < timeoutMs) {
                if (isConfirmedPpeEquipmentPage()) return true;
                if (progress) progress('Waiting for Vector PPE search controls…');
                await sleep(200);
            }
            return false;
        }
        try {
            await waitForPpeRowsReady(timeoutMs, null, progress);
            return true;
        } catch {
            return false;
        }
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

    async function ensurePpeEquipmentPage(progress = null, requireRows = true) {
        if (getRun()) {
            throw new Error(
                'An inspection run is active. Finish or abort that run before Vector Rebel navigates away.'
            );
        }

        if (isConfirmedPpeEquipmentPage()) {
            if (progress) progress(requireRows
                ? 'Already on Equipment → PPE; waiting for inventory rows…'
                : 'PPE tab ready; using the saved asset-prefix search…');
            if (requireRows) await waitForPpeRowsReady(22000, null, progress);
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

        if (await waitForPpeListReady(22000, progress, requireRows)) {
            if (progress) progress('Equipment → PPE opened.');
            return true;
        }

        // One retry covers Vector cases where the first tab click only focuses
        // the tab instead of changing the SPA view.
        const retryPpe = findVectorNavigationTarget('PPE');
        if (retryPpe) {
            retryPpe.click();
            if (await waitForPpeListReady(22000, progress, requireRows)) {
                if (progress) progress('Equipment → PPE opened.');
                return true;
            }
        }

        throw new Error(
            'Vector Rebel could not confirm Equipment → PPE. The requested action was not started.'
        );
    }

    async function scanPpeRosterCandidates(progress = null) {
        const inventory = await scanPpeOwnerInventory(progress);
        const byName = new Map(), byId = new Map(), unverified = [];
        for (const item of inventory.items) {
            if (!item.ownerName) {
                if (unverified.length < 60) unverified.push({
                    assetId: item.assetId, reason: 'Responsible Party is blank or unassigned'
                });
                continue;
            }
            const nameKey = masterNameKey(item.ownerName);
            const prefix = ownerRosterKey(item.ownerName);
            if (byId.has(prefix) && byId.get(prefix) !== nameKey) {
                throw new Error('Conflicting people have the same personnel key.');
            }
            byId.set(prefix, nameKey);
            const existing = byName.get(nameKey);
            if (existing) existing.assetCount++;
            else byName.set(nameKey, {
                name: item.ownerName, prefix, active: true, assetCount: 1
            });
        }
        const cleaned = normalizeMasterRoster([...byName.values()]);
        if (!cleaned.people.length) throw new Error(
            'Responsible Party supplied no people. Master roster was not changed.'
        );
        return {
            people: cleaned.people,
            pageCount: inventory.pageCount,
            visibleAssetCount: inventory.rowCount,
            rejected: cleaned.rejected,
            merged: cleaned.merged,
            rawUniqueCandidates: byName.size,
            needsReview: rosterNeedsReview(cleaned.people),
            unverified,
            unassignedCount: inventory.unassignedCount
        };
    }

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
            '<b>Personal/local data:</b> Inspector identity, signatures, My gear prefix, Tour coat comment, your saved Captain list, and local asset defaults stay with Vector Rebel in this browser profile and are mirrored outside the Vector website origin. ' +
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
        tabs.push(['admin', 'Admin']);

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
            const intro = card('My Profile',
                'Your name identifies the Responsible Party for all PPE. ' +
                'Gear IDs and surname prefixes are not required. Saved signatures must belong to the inspector.');
            const name = field('Inspector name / Responsible Party',
                config.inspectorName, {placeholder:'First Last'});
            const coat = field('Tour Bunker Coat assignment comment',
                config.tourCoatComment, {placeholder:'Name / identifier written into the coat inspection'});
            const profileFields = [
                ['ID Number','idNumber'],['Shift','shift'],
                ['Station picked up at','pickupStation'],
                ['Preferred station delivery','deliveryStation']
            ].map(([label,key])=>({
                key,...field(label, config.ppeRepairProfile?.[key]||'', {
                    placeholder:label+' for PPE clean/repair forms'
                })
            }));
            intro.append(name.wrap,coat.wrap);
            for(const entry of profileFields)intro.appendChild(entry.wrap);
            const save = makeButton('Save Profile', {background:'#176b8e',color:'#fff'});
            save.onclick = () => {
                try {
                    const next = cloneConfig();
                    const newName = clean(name.input.value);
                    if (!newName) throw new Error('Inspector name is required.');
                    // Preserve legacy prefixes and local rules only for backup /
                    // backwards compatibility. PPE discovery no longer uses them.
                    next.initialized = true;
                    next.inspectorName = newName;
                    next.tourCoatComment = clean(coat.input.value);
                    next.ppeRepairProfile=Object.fromEntries(
                        profileFields.map(entry=>[entry.key,clean(entry.input.value)]));
                    saveConfig(next);
                    refreshPanelInfo();
                    setStatus('Profile saved. PPE discovery uses Responsible Party.');
                    renderContent();
                } catch (error) { alert(error.message); }
            };
            intro.appendChild(save);
            content.appendChild(intro);
        }

        function renderLinkedEquipment() {
            const config = getConfig();
            const ownerOptions = [
                ...getActiveMasterRoster(),
                ...normalizePeopleDirectory(config.peopleDirectory || []),
                {name: config.inspectorName, prefix: config.selfPrefix}
            ].filter(person => clean(person?.name) && !isOrganizationOrBadRosterName(person.name));
            const owners = new Map();
            for (const person of ownerOptions) {
                const nameKey = masterNameKey(person.name);
                if (!owners.has(nameKey)) owners.set(nameKey, clean(person.name));
            }
            const cardEl = card('Assigned PPE — Exact Equipment IDs',
                'Optional shortcuts to individual equipment records. Main inspections already find ALL gear automatically using Responsible Party, including SCBA masks and numeric IDs. ' +
                'Use this to bookmark a specific item. Local links do not change Vector assignments or inspection templates.');
            const personSelect = document.createElement('select');
            personSelect.style.cssText =
                'display:block;width:100%;padding:10px;margin:10px 0;border:1px solid #bdccd7;border-radius:7px;';
            [...owners.entries()].sort((a,b)=>a[1].localeCompare(b[1])).forEach(([key,name]) => {
                const opt = document.createElement('option');
                opt.value = key;
                opt.textContent = name;
                personSelect.appendChild(opt);
            });
            const ownKey = masterNameKey(config.inspectorName);
            if (owners.has(ownKey)) personSelect.value = ownKey;
            const input = field('Exact Vector PPE Name / equipment ID', '', {
                placeholder: 'E004015306F2D8FE'
            });
            const msg = document.createElement('div');
            msg.style.cssText='font-size:11px;line-height:1.5;margin:8px 0;color:#35566d;';
            const list = document.createElement('div');
            list.style.cssText='margin:10px 0;';
            const help = document.createElement('div');
            help.style.cssText='font-size:11px;line-height:1.45;color:#9a5a10;margin-top:9px;';
            help.textContent='Exact equipment-ID links are legacy bookmarks. Current inspections find assigned gear automatically by Responsible Party.';
            const add = makeButton('Find, Verify & Link This PPE', {
                background:'#176b8e',color:'#fff'
            });
            const linked = () => {
                list.innerHTML = '';
                const owner = owners.get(personSelect.value);
                const rows = linkedPpeForPerson(owner);
                if (!rows.length) {
                    list.textContent = 'No exact-ID equipment linked for this person yet.';
                    return;
                }
                for (const record of rows) {
                    const row = document.createElement('div');
                    row.style.cssText =
                        'padding:9px;border:1px solid #d8e5ec;border-radius:7px;margin:6px 0;';
                    const label = document.createElement('div');
                    label.style.cssText='font-size:12px;line-height:1.5;';
                    label.textContent = record.assetId + ' — ' +
                        (record.type === 'UNKNOWN' ? 'PPE pool '+record.pool : record.type) +
                        ' · ' + record.status + ' · Verified ' +
                        (record.verifiedAt.slice(0,10) || 'previously');
                    const inspect = makeButton('Recheck Owner');
                    inspect.onclick = async () => {
                        inspect.disabled = true; msg.textContent = 'Checking ' + record.assetId + '…';
                        try {
                            const verified = await verifyExactPpeOwnership(owner, record.assetId,
                                t=>{msg.textContent=t;});
                            const next = cloneConfig();
                            linkVerifiedPpeAsset(next,owner,verified,record.assetId);
                            saveConfig(next);
                            msg.textContent = 'Responsible Party verified: ' + verified.ownerName +
                                ' · ' + verified.assetId + '.';
                            linked();
                        } catch(e) {msg.textContent = e.message;}
                        finally {inspect.disabled = false;}
                    };
                    const open = makeButton('Open Item');
                    open.onclick = () => {
                        const url = new URL('/app/equipment/PPE/pool/' +
                            record.pool + '/' + record.itemId + '/item', location.origin);
                        window.open(url.href, '_blank','noopener,noreferrer');
                    };
                    const remove = makeButton('Unlink Local');
                    remove.onclick = () => {
                        if (!confirm('Remove the local link for ' + record.assetId +
                            '? This will NOT change the equipment assignment in Vector.')) return;
                        const next = cloneConfig();
                        unlinkPpeAsset(next,owner,record.pool,record.itemId);
                        saveConfig(next);
                        msg.textContent = 'Local link removed (Vector unchanged).';
                        linked();
                    };
                    row.append(label,inspect,open,remove);
                    list.appendChild(row);
                }
            };
            personSelect.addEventListener('change',linked);
            add.onclick = async () => {
                const owner = owners.get(personSelect.value);
                const wanted = clean(input.input.value).toUpperCase();
                if (!owner) {msg.textContent='Choose a person first.';return;}
                if (!wanted) {msg.textContent='Enter the exact PPE ID first.';return;}
                add.disabled = true;
                msg.textContent = 'Searching Vector PPE for ' + wanted + '…';
                try {
                    const verified = await verifyExactPpeOwnership(owner,wanted,
                        t=>{msg.textContent=t;});
                    const next = cloneConfig();
                    const count = linkVerifiedPpeAsset(next,owner,verified,wanted);
                    saveConfig(next);
                    msg.textContent = 'Verified & linked: ' + verified.assetId +
                        ' · Responsible Party: ' + verified.ownerName +
                        ' · ' + verified.status +
                        '. (' + count + ' linked item(s) for this person.)';
                    input.input.value='';
                    linked();
                } catch(e) {
                    msg.textContent = 'NOT LINKED: ' + (e?.message || String(e));
                } finally {
                    add.disabled = false;
                }
            };
            cardEl.append(personSelect,input.wrap,add,msg,list,help);
            content.appendChild(cardEl);
            linked();
        }

        function renderCaptainSets() {
            const config = getConfig();
            const rosterState = getMasterRosterState();
            const roster = getActiveMasterRoster();

            const c = card(
                'Captain Sets',
                'Choose your crew from the master roster. Their PPE is found automatically through the Responsible Party filter; no equipment prefixes are needed.'
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
                    'No active people are available. Refresh the Master Roster from PPE ' +
                    'or use Admin → Edit Master Roster. No gear ownership will be guessed.';
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
                    const unresolvedCount = (set.memberPrefixes || []).length - members.length;
                    text.innerHTML =
                        `<b>${escapeHtml(set.name)}</b><br>` +
                        `<span style="font-size:11px;color:${unresolvedCount > 0 ? '#a55e00' : '#6b7f8c'}">` +
                        `${members.length} crew member${members.length === 1 ? '' : 's'}` +
                        (unresolvedCount > 0 ? ` · ${unresolvedCount} legacy/unresolved key(s): edit before use` : '') +
                        `</span>`;

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

                const selected = new Set((currentSet?.memberPrefixes || [])
                    .map(prefix => rosterPersonByPrefix(prefix)?.prefix || prefix));
                // Crew selection is person-based. Vector's Responsible Party
                // filter finds every equipment ID; no gear prefix inputs.

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
                        const unknown = [...selected].filter(prefix => !rosterPersonByPrefix(prefix));
                        if (unknown.length) throw new Error(
                            'This Captain Set contains unresolved legacy members: ' +
                            unknown.join(', ') + '. Remove or correct them before saving.'
                        );

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
            const updates = card('Production Build', 'This is the clean local Vector Rebel production build created from the preserved Tampermonkey baseline.');
            const line = document.createElement('div');
            line.style.cssText = 'font-size:12px;line-height:1.55;margin:8px 0;';
            line.innerHTML =
                `<b>Installed:</b> v${escapeHtml(VERSION)}<br>` +
                '<b>Update mode:</b> managed automatic updates<br>' +
                '<b>Runtime holds:</b> none';
            updates.appendChild(line);
            const privacyNote = document.createElement('div');
            privacyNote.style.cssText = 'font-size:10px;line-height:1.4;color:#718896;margin-top:7px;';
            privacyNote.textContent = 'Vector Rebel may collect limited technical and usage information for support, reliability, and improvement.';
            updates.appendChild(privacyNote);
            const updateNow = makeButton('CHECK FOR UPDATE', { background: '#176b8e', color: '#fff' });
            updateNow.onclick = openManagedUpdate;
            updates.appendChild(updateNow);
            content.appendChild(updates);

            const backup = card(
                'Backup & Recovery',
                'Vector Rebel now keeps its primary settings in script-owned storage so a Vector hostname change does not strand them. Export a private backup for protection against browser/profile loss or moving to another computer.'
            );
            const backupInfo = document.createElement('div');
            backupInfo.style.cssText = 'font-size:11px;line-height:1.45;margin:8px 0;color:#526b79;';
            backupInfo.innerHTML = '<b>Included:</b> profile, roster, Captain Sets, signatures, PPE preferences/local rules, local history, and related Vector Rebel settings. <b>Keep the exported file private.</b>';
            const exportBackup = makeButton('EXPORT FULL VECTOR REBEL BACKUP', { background: '#e8f3f7' });
            exportBackup.onclick = exportPortableBackup;
            const importBackup = makeButton('RESTORE FULL VECTOR REBEL BACKUP');
            const importBackupFile = document.createElement('input');
            importBackupFile.type = 'file';
            importBackupFile.accept = '.json,application/json';
            importBackupFile.style.display = 'none';
            importBackupFile.onchange = async () => {
                const file = importBackupFile.files?.[0];
                if (!file) return;
                try {
                    const payload = await readPortableBackupFile(file);
                    if (!confirm('Restore this Vector Rebel backup?\n\nThis replaces the current local Vector Rebel profile/settings on this browser. It does not change Vector itself.')) return;
                    restorePortableBackup(payload);
                } catch (error) {
                    alert(error.message);
                } finally {
                    importBackupFile.value = '';
                }
            };
            importBackup.onclick = () => importBackupFile.click();
            backup.append(backupInfo, exportBackup, importBackup, importBackupFile);
            content.appendChild(backup);

            const feedback = card('Feedback', 'Send a comment or problem report to the Vector Rebel maintainer.');
            const feedbackBox = document.createElement('textarea');
            feedbackBox.placeholder = 'Type feedback here...';
            feedbackBox.maxLength = 2000;
            feedbackBox.style.cssText = 'width:100%;min-height:88px;resize:vertical;border:1px solid #cbd9e2;border-radius:7px;padding:8px 9px;font:12px/1.4 Arial,sans-serif;color:#233b4a;background:#fff;';
            const feedbackStatus = document.createElement('div');
            feedbackStatus.style.cssText = 'min-height:16px;margin-top:6px;font-size:10px;color:#607483;';
            const feedbackSend = makeButton('Send Feedback');
            feedbackSend.onclick = async () => {
                const message = String(feedbackBox.value || '').trim();
                if (!message) {
                    feedbackStatus.textContent = 'Enter a comment first.';
                    return;
                }
                feedbackSend.disabled = true;
                feedbackStatus.textContent = 'Sending...';
                const sent = await submitRebelCommandFeedback(message);
                feedbackSend.disabled = false;
                if (sent) {
                    feedbackBox.value = '';
                    feedbackStatus.textContent = 'Feedback sent.';
                } else {
                    feedbackStatus.textContent = 'Feedback could not be sent. Try again later.';
                }
            };
            feedback.append(feedbackBox, feedbackSend, feedbackStatus);
            content.appendChild(feedback);

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
                'Advanced Tools',
                'Diagnostics and advanced configuration are available directly in this production build.'
            );
            content.appendChild(admin);
        }

        function renderAdmin() {
            const rosterCard = card(
                'Master Roster',
                'Master roster and inspection discovery use the explicit Responsible Party column, not inventory-number prefixes or Location. Inspections reread ownership live.'
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
                    'These are LEGACY equipment-prefix mappings from the older roster scanner. ' +
                    'The prefixes are ignored for ownership and crew selection now uses person identity. ' +
                    'Do not associate the listed old gear with these people. ' +
                    'Refresh Master from PPE to rebuild using Responsible Party, or edit names in the master roster.';
                reviewHost.appendChild(note);

                currentFlags.forEach(item => {
                    const row = document.createElement('div');
                    row.style.cssText =
                        'padding:9px 10px;margin:6px 0;border:1px solid #ead39a;' +
                        'border-radius:8px;background:#fffaf0;';

                    const text = document.createElement('div');
                    text.style.cssText = 'font-size:12px;line-height:1.45;';
                    const samples = (item.equipmentSamples || [])
                        .map(sample => escapeHtml(
                            `${sample.assetId}${sample.ppeType ? ` — ${sample.ppeType}` : ''}`
                        ))
                        .join('<br>');
                    text.innerHTML =
                        `<b>${escapeHtml(item.name)}</b> · <code>${escapeHtml(item.prefix)}</code><br>` +
                        `<span style="font-size:11px;color:#7b672e">${item.reasons.map(escapeHtml).join('; ')}</span>` +
                        `${samples ? `<div style="margin-top:5px;font-size:11px;color:#607483"><b>Legacy equipment-row examples (ownership NOT verified):</b><br>${samples}</div>` : ''}`;

                    // Older "Fix Mapping", "Find Person's Gear", and generic
                    // "Show Prefix" buttons were based on equipment-number
                    // guesses. They are intentionally not exposed now that
                    // Responsible Party is the sole authority for ownership.
                    row.append(text);
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
                    `<span style="color:#6a7f8c">Personnel identity is independent from equipment numbers; PPE ownership is verified separately.</span>`;
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
                        `Needs prefix review: ${result.needsReview.length}\n` +
                        `Unassigned PPE rows: ${result.unassignedCount}\n` +
                        `Ownership verified using: Responsible Party\n\n` +
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
                        `${result.merged.length} duplicate value(s) merged; ${result.rejected.length} non-person value(s) rejected; ` +
                        `${result.unassignedCount} unassigned PPE rows excluded.`;
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
                                if (name === null || !clean(name)) return;
                                person.name = clean(name);
                                person.prefix = ownerRosterKey(name);
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
                    if (name === null || !clean(name)) return;
                    working.push({ name: clean(name), prefix: ownerRosterKey(name), active: true });
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
            else if (active === 'equipment') renderLinkedEquipment();
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
        const deferred = loadJSON(CAPTAIN_DAILY_DEFERRED_KEY, null);
        if (deferred?.runId === run.runId) persistentRemoveRaw(CAPTAIN_DAILY_DEFERRED_KEY);
        saveDiagnostic('Run manually aborted by inspector.', run);
        archiveStoppedRun(run, 'Run manually aborted by inspector.');
        rebelCommandEvent('ppe_workflow_cancelled', {
            success: false,
            workflowMode: run.modeKey || '',
            description: 'PPE workflow cancelled by inspector.',
            metadata: { itemCount: run.items?.length || 0, stage: run.phase || 'unknown' }
        });
        clearRun();
        setStatus('Run aborted. A stopped-run recovery record was kept so retry preview can avoid likely duplicates.', false);
    }


    function isPanelMinimized() {
        return persistentGetRaw(PANEL_MINIMIZED_KEY) === '1';
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

        if (persist) persistentSetRaw(PANEL_MINIMIZED_KEY, minimized ? '1' : '0');
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
                '<b>Saved PPE setup unavailable.</b> If you previously configured this browser, do NOT save a replacement profile, signatures, or roster until recovery is checked. New install? Open Settings → Profile, then add your own signature under Signatures.';
        } else {
            info.innerHTML =
                `<b>${escapeHtml(config.inspectorName)}</b>` +
                `<br>${sigCount} signature variant${sigCount === 1 ? '' : 's'} · PPE by Responsible Party`;
        }

        updateMinimizedPanelBadge(run);
    }

    // Read-only PPE Clean & Repair worksheet exporter. Source fields are
    // scanned using the SAME verified Responsible Party finder as inspections.
    // No safety inspection, pass/fail answer, CrewSense write, or PPE edit occurs.
    const PPE_REPAIR_ROWS = Object.freeze([
        'Primary Pant', 'Primary Coat', 'Primary Gloves', 'Primary Hood',
        'Secondary Pant', 'Secondary Coat', 'Secondary Gloves', 'Secondary Hood',
        'Helmet', 'Helmet (Personal)', 'Boots'
    ]);
    function repairGearMatches(label, item) {
        const type = String(item?.type || '').toLowerCase();
        const category = label.replace(/^(primary|secondary) /i,'').toLowerCase();
        if (category.includes('pant')) return /\bpant\b/.test(type);
        if (category.includes('coat')) return /\bcoat\b/.test(type);
        if (category.includes('glove')) return /\bglove/.test(type);
        if (category.includes('hood')) return /\bhood\b/.test(type);
        if (category.includes('helmet')) return /\bhelmet\b/.test(type);
        if (category.includes('boot')) return /\bboot/.test(type);
        return false;
    }
    function repairXml(value) {
        return String(value ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'')
            .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
            .replace(/"/g,'&quot;').replace(/'/g,'&apos;');
    }
    function repairXmlCell(ref, value, style = 0) {
        const v = String(value ?? '');
        return '<c r="'+ref+'" s="'+style+'" t="inlineStr"><is><t xml:space="preserve">'+
            repairXml(v)+'</t></is></c>';
    }
    function repairSheetName(name, used) {
        const safe = String(name || 'Person').replace(/[\\\/\?\*\[\]:]/g,'').slice(0,31).trim()||'Person';
        let proposal=safe, n=2;
        while (used.has(proposal.toLowerCase())) proposal=safe.slice(0,27)+' '+n++;
        used.add(proposal.toLowerCase());
        return proposal;
    }
    function repairFormSheet(form) {
        const rows=[], merges=['A1:H1','A3:H3','A4:B4','C4:F4','A5:B5','C5:F5',
            'B6:C6','E6:F6','A8:H8','A9:B9','C9:D9','G9:H9',
            'A22:B22','C22:D22','E22:F22','G22:H22',
            'A23:B23','C23:D23','E23:F23','G23:H23','A25:H25'];
        const row=(num,height,cells)=>{
            rows.push('<row r="'+num+'" ht="'+height+'" customHeight="1">'+
                cells.map(x=>repairXmlCell(x[0]+num,x[1],x[2])).join('')+'</row>');
        };
        row(1,39,[['A','PPE CLEAN AND REPAIR FORM',1]]);
        row(2,10,[]);
        row(3,27,[['A','CUSTOMER INFORMATION',2]]);
        row(4,26,[['A','Department',4],['C','Flower Mound Fire Dept.',5],
            ['G','Date',4],['H',form.date,5]]);
        row(5,26,[['A','First and Last Name',4],['C',form.name,5],
            ['G','ID Number',4],['H',form.idNumber,5]]);
        row(6,26,[['A','Picked up at',4],['B',form.pickupStation,5],
            ['D','Preferred delivery',4],['E',form.deliveryStation,5],
            ['G','Shift',4],['H',form.shift,5]]);
        row(7,13,[]);
        row(8,30,[['A','PPE ITEMS SENT IN',2]]);
        row(9,32,[['A','Item',3],['C','Serial Number',3],['E','Size',3],
            ['F','Date of Manuf.',3],['G','Known Issues',3]]);
        PPE_REPAIR_ROWS.forEach((label,index)=>{
            const r=10+index;
            const item=form.items[index]||{};
            const arr=[['A',label,4],['C',item.serial,5],['E',item.size,5],
                ['F',item.manufacture,5],['G',item.issues,5]];
            row(r,36,arr);
            merges.push('A'+r+':B'+r,'C'+r+':D'+r,'G'+r+':H'+r);
        });
        row(21,16,[]);
        row(22,28,[['A','Pick-up By',4],['C',form.pickupBy,5],
            ['E','Pick-up Date',4],['G',form.pickupDate,5]]);
        row(23,28,[['A','Returned By',4],['C',form.returnedBy,5],
            ['E','Returned Date',4],['G',form.returnedDate,5]]);
        row(24,10,[]);
        row(25,42,[['A','Editable form. Verify serial numbers, sizes, manufacture dates and issues before sending items. The Source Index sheet lists the exact verified Vector item links.',6]]);
        const columnWidths=[18,17,17,17,15,19,24,24];
        const cols=columnWidths.map((w,i)=>'<col min="'+(i+1)+'" max="'+(i+1)+'" width="'+w+'" customWidth="1"/>').join('');
        return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+
            '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'+
            '<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><sheetViews><sheetView showGridLines="0" workbookViewId="0"/></sheetViews>'+
            '<sheetFormatPr defaultRowHeight="17"/><cols>'+cols+'</cols><sheetData>'+rows.join('')+'</sheetData>'+
            '<mergeCells count="'+merges.length+'">'+merges.map(ref=>'<mergeCell ref="'+ref+'"/>').join('')+'</mergeCells>'+
            '<printOptions horizontalCentered="1"/><pageMargins left=".3" right=".3" top=".4" bottom=".4" header=".1" footer=".1"/>'+
            '<pageSetup orientation="landscape" paperSize="9" fitToWidth="1" fitToHeight="1"/></worksheet>';
    }
    function repairSourceSheet(forms) {
        const rows=[['Person','Form line','Vector PPE name','Pool ID','Item ID',
            'Responsible Party verified','Captured at','Vector item URL',
            'Exported Serial','Exported Size','Exported Manufacturing']];
        for (const form of forms) for (let i=0;i<PPE_REPAIR_ROWS.length;i++) {
            const item=form.items[i]||{};
            if (!item.asset) continue;
            rows.push([form.name,PPE_REPAIR_ROWS[i],item.asset.assetId,item.asset.pool,
                item.asset.itemId,item.asset.ownerName,form.capturedAt,item.asset.url,
                item.serial||'',item.size||'',item.manufacture||'']);
        }
        const rowXml=rows.map((row,i)=>'<row r="'+(i+1)+'">'+row.map((v,j)=>
            repairXmlCell(String.fromCharCode(65+j)+(i+1),v,i===0?3:0)).join('')+'</row>').join('');
        return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+
            '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'+
            '<sheetViews><sheetView workbookViewId="0"/></sheetViews>'+
            '<cols><col min="1" max="2" width="24" customWidth="1"/>'+
            '<col min="3" max="3" width="30" customWidth="1"/>'+
            '<col min="4" max="5" width="12" customWidth="1"/>'+
            '<col min="6" max="6" width="25" customWidth="1"/>'+
            '<col min="7" max="7" width="22" customWidth="1"/>'+
            '<col min="8" max="8" width="75" customWidth="1"/>'+
            '<col min="9" max="11" width="22" customWidth="1"/></cols>'+
            '<sheetData>'+rowXml+'</sheetData></worksheet>';
    }
    const REPAIR_XLSX_STYLES='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+
        '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'+
        '<fonts count="4"><font><sz val="11"/><name val="Aptos"/></font>'+
        '<font><b/><sz val="19"/><color rgb="FFFFFFFF"/><name val="Aptos"/></font>'+
        '<font><b/><sz val="11"/><color rgb="FFFFFFFF"/></font>'+
        '<font><b/><sz val="11"/><color rgb="FF24394A"/></font></fonts>'+
        '<fills count="4"><fill><patternFill patternType="none"/></fill>'+
        '<fill><patternFill patternType="gray125"/></fill>'+
        '<fill><patternFill patternType="solid"><fgColor rgb="FF1D3446"/><bgColor indexed="64"/></patternFill></fill>'+
        '<fill><patternFill patternType="solid"><fgColor rgb="FFDCE7ED"/><bgColor indexed="64"/></patternFill></fill></fills>'+
        '<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border>'+
        '<border><left style="thin"><color rgb="FF9DABB4"/></left>'+
        '<right style="thin"><color rgb="FF9DABB4"/></right>'+
        '<top style="thin"><color rgb="FF9DABB4"/></top>'+
        '<bottom style="thin"><color rgb="FF9DABB4"/></bottom><diagonal/></border></borders>'+
        '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'+
        '<cellXfs count="7">'+
        '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'+
        '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="center"/></xf>'+
        '<xf numFmtId="0" fontId="2" fillId="2" borderId="0" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>'+
        '<xf numFmtId="0" fontId="3" fillId="3" borderId="1" xfId="0" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>'+
        '<xf numFmtId="0" fontId="3" fillId="3" borderId="1" xfId="0" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>'+
        '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>'+
        '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>'+
        '</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';
    // Minimal standards-compliant, uncompressed ZIP for Excel .xlsx.
    // Entirely local; no cloud export endpoint or new userscript dependency.
    function repairZip(files) {
        const enc=new TextEncoder(), parts=[], central=[]; let offset=0;
        const crc32=bytes=>{
            let c=-1;
            for(const b of bytes){c^=b;for(let k=0;k<8;k++)c=(c>>>1)^((c&1)?0xEDB88320:0);}
            return (c^-1)>>>0;
        };
        const u16=(v)=>[v&255,(v>>>8)&255],u32=(v)=>[v&255,(v>>>8)&255,(v>>>16)&255,(v>>>24)&255];
        for(const [name,text] of Object.entries(files)){
            const path=enc.encode(name),body=enc.encode(text),crc=crc32(body);
            const head=Uint8Array.from([80,75,3,4,...u16(20),...u16(0),...u16(0),
                ...u16(0),...u16(0),...u32(crc),...u32(body.length),...u32(body.length),
                ...u16(path.length),...u16(0)]);
            parts.push(head,path,body);
            central.push(Uint8Array.from([80,75,1,2,...u16(20),...u16(20),...u16(0),...u16(0),
                ...u16(0),...u16(0),...u32(crc),...u32(body.length),...u32(body.length),
                ...u16(path.length),...u16(0),...u16(0),...u16(0),...u16(0),
                ...u32(0),...u32(offset)]),path);
            offset+=head.length+path.length+body.length;
        }
        const centralSize=central.reduce((sum,b)=>sum+b.length,0), n=Object.keys(files).length;
        const end=Uint8Array.from([80,75,5,6,...u16(0),...u16(0),...u16(n),...u16(n),
            ...u32(centralSize),...u32(offset),...u16(0)]);
        return new Blob([...parts,...central,end],
            {type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
    }
    function repairWorkbook(forms) {
        if (!Array.isArray(forms)||!forms.length) throw new Error('Select at least one person.');
        const used=new Set(['source index']);
        const sheetNames=forms.map(f=>repairSheetName(f.name,used));
        const names=[...sheetNames,'Source Index'];
        const paths=['[Content_Types].xml','_rels/.rels','xl/workbook.xml','xl/_rels/workbook.xml.rels','xl/styles.xml'];
        const files={};
        files[paths[0]]='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+
            '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'+
            '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'+
            '<Default Extension="xml" ContentType="application/xml"/>'+
            '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'+
            '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'+
            names.map((_,i)=>'<Override PartName="/xl/worksheets/sheet'+(i+1)+'.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join('')+'</Types>';
        files[paths[1]]='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+
            '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>';
        files[paths[2]]='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+
            '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '+
            'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'+
            '<sheets>'+names.map((n,i)=>'<sheet name="'+repairXml(n)+'" sheetId="'+(i+1)+'" r:id="rId'+(i+1)+'"/>').join('')+
            '</sheets></workbook>';
        files[paths[3]]='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+
            names.map((_,i)=>'<Relationship Id="rId'+(i+1)+'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet'+(i+1)+'.xml"/>').join('')+
            '<Relationship Id="rId'+(names.length+1)+'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>';
        files[paths[4]]=REPAIR_XLSX_STYLES;
        forms.forEach((f,i)=>{files['xl/worksheets/sheet'+(i+1)+'.xml']=repairFormSheet(f)});
        files['xl/worksheets/sheet'+names.length+'.xml']=repairSourceSheet(forms);
        return repairZip(files);
    }

    // Reuse a person's explicitly entered station/shift on future exports.
    // These are not inferred from fire staffing assignments or PPE labels.
    const PPE_REPAIR_PROFILE_FIELDS=Object.freeze([
        'idNumber','shift','pickupStation','deliveryStation'
    ]);
    // My own saved PPE repair details belong in Vector Rebel's normal profile,
    // not only an export-specific draft. Other firefighters remain local entries.
    function repairPersonDefaults(person) {
        const saved=loadJSON('vr_ppe_repair_contact_v1', {});
        const key=masterNameKey(person.name);
        const manual=saved && typeof saved==='object' ? saved[key]||{} : {};
        const profile=getConfig();
        const mine=key && key===masterNameKey(profile.inspectorName);
        const own=mine?profile.ppeRepairProfile||{}:{};
        return Object.fromEntries(PPE_REPAIR_PROFILE_FIELDS.map(field=>[
            field,clean(String(own[field]||manual[field]||person[field]||
                (field==='pickupStation'?person.station:'')||''))
        ]));
    }
    function repairPersistPersonDefaults(forms) {
        const saved=loadJSON('vr_ppe_repair_contact_v1', {})||{};
        let next=null;
        for (const form of forms) {
            const key=masterNameKey(form.originalName);
            if(!key)continue;
            saved[key]=Object.fromEntries(PPE_REPAIR_PROFILE_FIELDS.map(field=>
                [field,clean(String(form[field]||''))]));
            if(key===masterNameKey(getConfig().inspectorName)){
                next=next||cloneConfig();
                next.ppeRepairProfile={...saved[key]};
            }
        }
        saveJSON('vr_ppe_repair_contact_v1',saved);
        if(next)saveConfig(next);
    }
    // FL / BU identify primary and secondary structural gear on this
    // department's item names, not ownership. Ownership remains Responsible Party.
    function repairGearTier(asset) {
        const suffix=String(asset?.assetId||'').match(/(?:^|[-_])(FL|BU)$/i)?.[1];
        return suffix==='FL'||suffix==='fl'?'primary':
            suffix==='BU'||suffix==='bu'?'secondary':'unmarked';
    }
    function repairDefaultAsset(label,assets){
        const group=assets.filter(item=>repairGearMatches(label,item));
        const tier=/^Secondary |\(Personal\)/i.test(label)?'secondary':'primary';
        const targeted=group.filter(item=>repairGearTier(item)===tier);
        if(targeted.length===1)return targeted[0];
        if(targeted.length>1)return null;
        if(tier==='primary'){
            const unknown=group.filter(item=>repairGearTier(item)==='unmarked');
            // One identifiable helmet or boots is safely a primary choice.
            if(unknown.length===1)return unknown[0];
        }
        return null;
    }
    function repairSlotFromAsset(asset) {
        const accepted=value=>{
            const v=clean(String(value||''));
            return !v||v==='-'||/^n\/?a$|^unknown$/i.test(v)?'':v;
        };
        return {asset:asset||null,serial:repairFieldValid('serial',asset?.serial)?accepted(asset.serial):'',
            size:repairFieldValid('size',asset?.size)?accepted(asset.size):'',
            manufacture:repairFieldValid('manufacture',asset?.manufacture)?accepted(asset.manufacture):'',issues:''};
    }
    const PPE_REPAIR_DETAIL_CACHE='vr_ppe_repair_verified_details_v1';
    function repairFieldValid(key,value){
        const text=clean(String(value||''));
        if(!text||text.length>80||/^(?:-|n\/?a|none|unknown|tags?|length|price|year|size|serial number|barcode|purchase date|check out date|end of life)$/i.test(text))return false;
        if(key==='serial')return text.length<=64&&/\d/.test(text);
        if(key==='size')return text.length<=40&&/[a-z0-9]/i.test(text);
        if(key==='manufacture')return /^(?:19|20)\d{2}$/.test(text)||
            /^\d{1,2}[\/.-]\d{1,2}[\/.-](?:19|20)\d{2}$/.test(text)||
            /^(?:19|20)\d{2}-\d{2}-\d{2}$/.test(text);
        return false;
    }
    function repairReadDetailText(text){
        const lines=String(text||'').split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
        const find=(rx,key)=>{
            for(let i=0;i<lines.length-1;i++){
                if(rx.test(lines[i])&&repairFieldValid(key,lines[i+1]))return lines[i+1];
            }
            return '';
        };
        return {
            serial:find(/^Serial (?:Number|No\.?|#)$/i,'serial'),
            size:find(/^Size$/i,'size'),
            manufacture:find(/^(?:Date of Manuf(?:acture|acturing)?\.?|Manufactur(?:e|ing) Date|Mfg\.? Date)$/i,'manufacture')||
                find(/^Year$/i,'manufacture')
        };
    }
    function repairReadDetailDocument(doc){
        if(!doc?.body)return {serial:'',size:'',manufacture:''};
        // Vector renders label/value pairs inside two side-by-side information
        // columns. Read the label's own container rather than relying on the
        // arbitrary document-wide text order.
        const all=[...doc.querySelectorAll('dt,label,p,span,div,strong,b,th')];
        const leaf=all.filter(el=>el.children.length===0 && !el.closest(
            '#vector-ppe-helper-v23,#vector-ppe-overlay-v23'));
        const find=(pattern,key)=>{
            for(const label of leaf){
                if(!pattern.test(clean(label.textContent||'')))continue;
                const p=label.parentElement;
                const choices=[
                    label.nextElementSibling,
                    p?.nextElementSibling,
                    ...[...(p?.children||[])].filter(el=>el!==label),
                    p?.parentElement?.nextElementSibling
                ];
                for(const candidate of choices){
                    if(!candidate)continue;
                    const value=clean(candidate.innerText||candidate.textContent||'');
                    if(repairFieldValid(key,value))return value;
                }
            }
            return '';
        };
        const raw=repairReadDetailText(doc.body.innerText||'');
        // DOM-local values take precedence over text-flow fallbacks.
        return {
            serial:find(/^Serial (?:Number|No\.?|#)$/i,'serial')||raw.serial,
            size:find(/^Size$/i,'size')||raw.size,
            manufacture:find(/^(?:Date of Manuf(?:acture|acturing)?\.?|Manufactur(?:e|ing) Date|Mfg\.? Date)$/i,'manufacture')||
                raw.manufacture||find(/^Year$/i,'manufacture')
        };
    }
    function repairDetailCacheKey(url){
        const m=String(url||'').match(/\/app\/equipment\/PPE\/pool\/(\d+)\/(\d+)\/item/i);
        return m?m[1]+':'+m[2]:'';
    }
    function repairCachedDetail(url){
        const key=repairDetailCacheKey(url);
        const record=key?loadJSON(PPE_REPAIR_DETAIL_CACHE,{})?.[key]:null;
        return record&&typeof record==='object'?{
            serial:record.serial||'',size:record.size||'',
            manufacture:record.manufacture||''
        }:{};
    }
    function repairRecordDetail(url,values){
        const key=repairDetailCacheKey(url);
        if(!key)return;
        const cache=loadJSON(PPE_REPAIR_DETAIL_CACHE,{})||{};
        const old=cache[key]||{},newData={...old};
        for(const field of ['serial','size','manufacture']){
            if(repairFieldValid(field,values?.[field]))newData[field]=values[field];
        }
        if(['serial','size','manufacture'].every(field=>newData[field]===old[field]))return;
        newData.readAt=new Date().toISOString();cache[key]=newData;
        // Bound local metadata storage; no department-wide crawl.
        const ids=Object.keys(cache);
        if(ids.length>250){
            ids.sort((x,y)=>String(cache[x]?.readAt||'').localeCompare(String(cache[y]?.readAt||'')));
            for(const id of ids.slice(0,ids.length-250))delete cache[id];
        }
        saveJSON(PPE_REPAIR_DETAIL_CACHE,cache);
    }
    async function repairReadItemDetail(asset) {
        if(!asset?.url)return {};
        const itemURL=new URL(asset.url,location.origin);
        if(itemURL.origin!==location.origin)throw Error('Vector PPE item has a different origin.');
        const already=repairCachedDetail(itemURL.href);
        if(['serial','size','manufacture'].every(field=>repairFieldValid(field,already[field])))return already;
        const frame=document.createElement('iframe');
        frame.setAttribute('aria-hidden','true');frame.tabIndex=-1;
        frame.style.cssText='position:fixed;bottom:0;right:0;width:2px;height:2px;opacity:0;pointer-events:none;border:0';
        frame.src=itemURL.href;document.body.appendChild(frame);
        try{
            const start=Date.now();
            while(Date.now()-start<6500) {
                await sleep(200);
                let doc,pathname;
                try{
                    doc=frame.contentDocument;
                    pathname=frame.contentWindow?.location?.pathname;
                }catch{throw Error('Vector blocked item preview. Open the item link instead.');}
                if(!doc||pathname!==itemURL.pathname)continue;
                const found=repairReadDetailDocument(doc);
                if(Object.values(found).some(Boolean)){
                    repairRecordDetail(itemURL.href,found);
                    return Object.fromEntries(['serial','size','manufacture'].map(key=>[key,found[key]||already[key]||'']));
                }
            }
            return already;
        }finally{frame.remove();}
    }
    // On an actual Vector equipment page, remember the page's own visible
    // read-only item metadata. A separate tab can then complete missing form
    // fields without requiring an iframe or guessing serial/size/year.
    function repairCaptureVisibleItemPage(){
        const key=repairDetailCacheKey(location.href);
        if(!key)return;
        const values=repairReadDetailDocument(document);
        if(Object.values(values).some(Boolean))repairRecordDetail(location.href,values);
    }
    function showPpeCleanRepairForm() {
        if (getRun()) {
            setStatus('Finish or abort the active inspection before preparing a clean/repair form.',false);
            return;
        }
        const roster=getActiveMasterRoster().sort((a,b)=>a.name.localeCompare(b.name));
        const {overlay,box}=makeOverlayBox('1150px');
        const h=document.createElement('h2');
        h.textContent='PPE Clean and Repair Form';
        h.style.cssText='margin:0 0 6px;color:#153e5c;font:700 23px Arial,sans-serif';
        const info=document.createElement('p');
        info.textContent='Select people, load their PPE by verified Responsible Party, choose which gear is being sent, then export an editable Excel workbook. Nothing is submitted to Vector.';
        info.style.cssText='margin:0 0 12px;color:#577083;font:13px/1.5 Arial,sans-serif';
        const note=document.createElement('p');
        note.textContent='Date and owner name are filled automatically. Station and shift reuse values you previously entered for each person. Serial number, size and manufacture date fill from verified Vector equipment records when present; use Fill missing details from Vector to check the item pages. Every field remains editable. A Vector Year value is year-only; it is not converted into an invented manufacturing day/month.';
        note.style.cssText='padding:9px;border:1px solid #c0d5e4;background:#eff6fb;color:#234760;border-radius:7px;font:12px/1.45 Arial,sans-serif';
        const status=document.createElement('div');
        status.setAttribute('role','status');
        status.style.cssText='margin:9px 0;color:#36556b;font:12px/1.5 Arial,sans-serif;min-height:17px';
        const close=makeButton('Close');
        close.onclick=()=>overlay.remove();
        const controls=document.createElement('div');
        controls.style.cssText='display:flex;flex-wrap:wrap;gap:7px;align-items:center';
        const search=document.createElement('input');
        search.placeholder='Find crew member...';
        search.setAttribute('aria-label','Search crew members');
        search.style.cssText='padding:10px;border:1px solid #b9cad6;border-radius:6px;flex:1;min-width:170px;font:13px Arial';
        const counter=document.createElement('span');
        counter.style.cssText='font:11px Arial;color:#567085';
        controls.append(search,counter,close);
        const list=document.createElement('div');
        list.style.cssText='border:1px solid #d6e3eb;border-radius:8px;margin:8px 0;max-height:180px;overflow:auto;padding:4px 8px;display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:3px 14px';
        const selection=new Set();
        const myName=masterNameKey(getConfig().inspectorName);
        const me=roster.find(p=>masterNameKey(p.name)===myName);
        if(me)selection.add(me.prefix);
        const draw=()=>{
            list.innerHTML='';
            const term=search.value.trim().toLowerCase();
            const visiblePeople=roster.filter(p=>!term||p.name.toLowerCase().includes(term));
            for(const person of visiblePeople) {
                const row=document.createElement('label');
                row.style.cssText='display:flex;align-items:center;gap:8px;padding:4px 0;font:12px Arial;color:#28465b;cursor:pointer';
                const cb=document.createElement('input');cb.type='checkbox';cb.checked=selection.has(person.prefix);
                cb.onchange=()=>{if(cb.checked)selection.add(person.prefix);else selection.delete(person.prefix);counter.textContent=selection.size+' selected';};
                const n=document.createElement('span');n.textContent=person.name;row.append(cb,n);list.appendChild(row);
            }
            counter.textContent=selection.size+' selected · '+roster.length+' available';
        };
        draw();search.addEventListener('input',draw);
        const load=makeButton('Load selected PPE',{background:'#176b8e',color:'#fff'});
        const review=document.createElement('div');
        review.style.cssText='margin-top:12px;';
        const footer=document.createElement('div');
        footer.style.cssText='display:flex;gap:9px;align-items:center;flex-wrap:wrap;margin:10px 0;';
        const detailsBtn=makeButton('Fill missing details from Vector',{background:'#265a81',color:'#fff'});
        detailsBtn.disabled=true;
        const exportBtn=makeButton('Download editable Excel (.xlsx)',{background:'#187450',color:'#fff'});
        exportBtn.disabled=true;
        footer.append(load,detailsBtn,exportBtn);
        box.append(h,info,note,controls,list,status,footer,review);
        const forms=[];
        const makeInput=(placeholder,value,onchange)=>{
            const el=document.createElement('input');el.type='text';
            el.placeholder=placeholder;el.value=String(value||'');
            el.style.cssText='min-width:0;width:100%;box-sizing:border-box;padding:7px;border:1px solid #c3d4de;border-radius:5px;font:12px Arial;color:#173e56';
            el.addEventListener('input',()=>onchange(el.value));
            return el;
        };
        const field=(parent,label,value,onchange)=>{
            const wrap=document.createElement('label');wrap.style.cssText='display:flex;flex-direction:column;gap:4px;min-width:140px;flex:1;font:700 11px Arial;color:#385972';
            const title=document.createElement('span');title.textContent=label;
            wrap.append(title,makeInput(label,value,onchange));parent.appendChild(wrap);
        };
        function showReview(){
            review.innerHTML='';
            for(const form of forms){
                const section=document.createElement('section');
                section.style.cssText='border:1px solid #b9d0df;border-radius:9px;padding:12px;margin:12px 0;background:#f8fbfd';
                const title=document.createElement('h3');
                title.textContent=form.name+' · '+form.sourceItems.length+' assigned PPE found';
                title.style.cssText='margin:0 0 6px;font:700 16px Arial;color:#174561';
                const verified=document.createElement('p');
                verified.textContent='Verified by Vector Responsible Party · '+form.capturedAt+' · Only selected gear will appear on the form.';
                verified.style.cssText='font:11px/1.4 Arial;color:#637f90;margin:0 0 10px';
                const fields=document.createElement('div');
                fields.style.cssText='display:flex;flex-wrap:wrap;gap:10px;margin-bottom:10px';
                for(const [label,key] of [['Date','date'],['First and Last Name','name'],['ID Number','idNumber'],['Shift','shift'],
                    ['Station picked up at','pickupStation'],['Preferred station delivery','deliveryStation'],
                    ['Pick-up By','pickupBy'],['Pick-up Date','pickupDate'],
                    ['Returned By','returnedBy'],['Returned Date','returnedDate']]){
                    const entry=field(fields,label,form[key],v=>{form[key]=v;});
                    if(PPE_REPAIR_PROFILE_FIELDS.includes(key)){
                        const input=entry?.querySelector?.('input')||
                            fields.lastElementChild?.querySelector?.('input');
                        input?.addEventListener('blur',()=>repairPersistPersonDefaults([form]));
                    }
                }
                const table=document.createElement('table');
                table.style.cssText='width:100%;border-collapse:collapse;font:11px Arial;color:#26465b';
                const thead=document.createElement('thead');thead.innerHTML='<tr>'+
                    ['Form line','Choose owned PPE','Serial number','Size','Date of manuf.','Known issues'].map(t=>
                        '<th style="text-align:left;padding:6px;border-bottom:2px solid #8faebf">'+t+'</th>').join('')+'</tr>';
                table.append(thead);
                const tbody=document.createElement('tbody');
                PPE_REPAIR_ROWS.forEach((label,i)=>{
                    const slot=form.items[i],tr=document.createElement('tr');
                    tr.style.background=i%2?'#ffffff':'#eef4f7';
                    const labelCell=document.createElement('td');
                    labelCell.textContent=label;labelCell.style.cssText='min-width:105px;padding:6px;font-weight:bold';
                    tr.appendChild(labelCell);
                    const optionCell=document.createElement('td');
                    optionCell.style.cssText='padding:4px;min-width:180px';
                    const picker=document.createElement('select');
                    picker.style.cssText='width:100%;max-width:230px;min-height:31px;border:1px solid #aac1d0;border-radius:4px;background:#fff;font:11px Arial';
                    const empty=document.createElement('option');empty.value='';empty.textContent='Not included';picker.append(empty);
                    const options=form.sourceItems.filter(item=>repairGearMatches(label,item));
                    for(const item of options){
                        const opt=document.createElement('option');
                        opt.value=item.pool+':'+item.itemId;
                        opt.textContent=item.assetId+' ('+item.type+')';
                        picker.append(opt);
                    }
                    const chosen=slot.asset;
                    if(chosen)picker.value=chosen.pool+':'+chosen.itemId;
                    picker.onchange=()=>{
                        const selected=form.sourceItems.find(item=>item.pool+':'+item.itemId===picker.value)||null;
                        Object.assign(slot,repairSlotFromAsset(selected));
                        const values=[slot.serial,slot.size,slot.manufacture,slot.issues];
                        [...tr.querySelectorAll('input')].forEach((el,i)=>{el.value=values[i]||'';});
                        detailLink.href=selected?.url||'#';detailLink.hidden=!selected;
                    };
                    const detailLink=document.createElement('a');
                    detailLink.textContent='View item in Vector';
                    detailLink.href=chosen?.url||'#';detailLink.hidden=!chosen;
                    detailLink.target='_blank';detailLink.rel='noopener noreferrer';
                    detailLink.style.cssText='margin-top:3px;font:10px Arial;color:#147099';
                    optionCell.append(picker,detailLink);tr.appendChild(optionCell);
                    for(const [placeholder,key] of [['Serial','serial'],['Size','size'],['Mfg. date','manufacture'],['Describe issue','issues']]){
                        const td=document.createElement('td');td.style.cssText='padding:4px';
                        const input=makeInput(placeholder,slot[key],v=>{slot[key]=v;});
                        td.append(input);tr.append(td);
                    }
                    tbody.append(tr);
                });
                table.append(tbody);section.append(title,verified,fields,table);
                review.append(section);
            }
            status.textContent=forms.length+' person form(s) ready for review. Primary/secondary gear identified from FL/BU. Item metadata lookup starts automatically.';
            exportBtn.disabled=!forms.length;
            detailsBtn.disabled=!forms.length;
        }
        detailsBtn.onclick=async()=>{
            const queue=[];
            for(const form of forms)for(const slot of form.items){
                if(slot.asset && (!slot.serial||!slot.size||!slot.manufacture))
                    queue.push({form,slot});
            }
            if(!queue.length){status.textContent='All selected PPE details have values. You may edit them before downloading.';return;}
            if(queue.length>36){status.textContent='Select fewer items (up to 36 detail pages per lookup).';return;}
            detailsBtn.disabled=true;load.disabled=true;exportBtn.disabled=true;
            let next=0,completed=0,updated=0,failed=0;
            const worker=async()=>{
                while(next<queue.length){
                    const {form,slot}=queue[next++];
                    status.textContent='Reading Vector PPE details: '+completed+'/'+queue.length+
                        ' · '+form.name+' · '+slot.asset.assetId;
                    try{
                        const extra=await repairReadItemDetail(slot.asset);
                        for(const k of ['serial','size','manufacture']){
                            if(!slot[k]&&extra[k]){slot[k]=extra[k];updated++;}
                        }
                    }catch{failed++;}
                    completed++;
                }
            };
            try{
                await Promise.all(Array.from({length:Math.min(2,queue.length)},worker));
                showReview();
                status.textContent='Vector detail lookup complete: '+completed+' item(s), '+
                    updated+' field(s) filled'+(failed?'; '+failed+' could not be read':'')+
                    '. Verify remaining blanks or open item links to enter them manually.';
            }finally{detailsBtn.disabled=false;load.disabled=false;exportBtn.disabled=!forms.length;}
        };
        load.onclick=async()=>{
            if(getRun()){status.textContent='An inspection is active. Finish or abort it before exporting.';return;}
            const chosen=roster.filter(p=>selection.has(p.prefix));
            if(!chosen.length){status.textContent='Choose at least one person.';return;}
            if(chosen.length>12){status.textContent='Select up to 12 people per export to keep live PPE searches bounded.';return;}
            load.disabled=true;detailsBtn.disabled=true;exportBtn.disabled=true;forms.length=0;review.innerHTML='';
            try{
                for(let i=0;i<chosen.length;i++){
                    const person=chosen[i];
                    status.textContent='Scanning '+(i+1)+'/'+chosen.length+': '+person.name;
                    const inventory=await scanPpeByResponsibleParty(person.name,msg=>{
                        status.textContent='Scanning '+(i+1)+'/'+chosen.length+': '+person.name+' · '+msg;
                    });
                    // No guesses from family names, equipment prefixes, or prior ownership.
                    const sourceItems=inventory.items.map(item=>({...item}));
                    const slots=PPE_REPAIR_ROWS.map(label=>{
                        return repairSlotFromAsset(repairDefaultAsset(label,sourceItems));
                    });
                    const d=new Date();
                    const localDate=[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
                    forms.push({name:person.name,originalName:person.name,
                        ...repairPersonDefaults(person),date:localDate,
                        pickupBy:'',pickupDate:'',
                        returnedBy:'',returnedDate:'',items:slots,sourceItems,
                        capturedAt:inventory.capturedAt});
                }
                showReview();
                await detailsBtn.onclick();
            }catch(error){
                forms.length=0;
                review.innerHTML='';
                status.textContent='Cannot verify full PPE inventory: '+(error?.message||error)+
                    '. No partial workbook was produced. Refresh Vector and retry.';
            }finally{load.disabled=false;}
        };
        exportBtn.onclick=()=>{
            try{
                if(!forms.length)throw Error('Load one or more people first.');
                for(const form of forms){
                    const seen=new Set();
                    for(const slot of form.items){
                        if(!slot.asset)continue;
                        const k=slot.asset.pool+':'+slot.asset.itemId;
                        if(seen.has(k))throw Error(form.name+': '+slot.asset.assetId+
                            ' was selected in two form lines. Choose one line per asset.');
                        seen.add(k);
                    }
                    if(!seen.size)throw Error(form.name+': choose at least one PPE item to send.');
                }
                repairPersistPersonDefaults(forms);
                const xlsx=repairWorkbook(forms);
                const url=URL.createObjectURL(xlsx),a=document.createElement('a');
                const stamp=new Date().toISOString().slice(0,10);
                a.href=url;a.download='PPE_Clean_and_Repair_'+stamp+
                    (forms.length===1?'_'+forms[0].name.replace(/[^A-Za-z0-9]+/g,'_'):'_Crew')+'.xlsx';
                document.body.appendChild(a);a.click();a.remove();
                setTimeout(()=>URL.revokeObjectURL(url),30000);
                status.textContent='Editable Excel workbook downloaded for '+forms.length+
                    ' people. The Source Index lists the exact verified Vector PPE records.';
                setStatus('PPE clean/repair Excel form prepared for '+forms.length+' selected people.');
            }catch(error){status.textContent=error?.message||String(error);}
        };
    }

    function installPanel() {
        if (document.getElementById(PANEL_ID)) return;

        const panel = document.createElement('div');
        panel.id = PANEL_ID;
        panel.style.cssText =
            'position:fixed;' +
            'right:16px;' +
            'bottom:16px;' +
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
        minimize.innerHTML = rebelStarbirdSvg();
        minimize.title = 'Minimize Vector Rebel';
        minimize.setAttribute('aria-label', 'Minimize Vector Rebel');
        minimize.style.cssText =
            'width:43px;height:43px;min-width:43px;border:2px solid rgba(255,255,255,.72);border-radius:50%;' +
            'background:#fff;color:#153e5c;padding:0;cursor:pointer;display:flex;align-items:center;justify-content:center;' +
            'overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.18);';
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
            mainAction('Daily Captain Check', launchCaptainDailyCheckFromAnywhere, false),
            mainAction('PPE Clean / Repair Form', showPpeCleanRepairForm, false),
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
        applyPanelMinimizedState(true, false);
        refreshPanelInfo();
    }

    // ============================================================
    // INITIALIZE / RESUME
    // ============================================================

    // An obsolete, separately installed migration helper can still show a
    // "Vector Rebel Recovery" toast after the migration. The current helper
    // already stores full backups in Tampermonkey and exposes explicit
    // Backup & Recovery controls. Remove ONLY the obsolete toast; do not
    // touch migration keys, signatures, roster state, or arbitrary banners.
    function dismissObsoleteRecoveryToast() {
        if (location.hostname !== 'app.vectorcheckit.us' || !document.body) return false;
        const marker = 'No old-site backup has been captured yet.';
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        let node, scanned = 0;
        while ((node = walker.nextNode()) && ++scanned <= 20000) {
            if (!String(node.nodeValue || '').includes(marker)) continue;
            let ancestor = node.parentElement;
            let toast = null;
            for (let depth = 0; ancestor && depth < 8; depth++, ancestor = ancestor.parentElement) {
                if (ancestor.id === PANEL_ID || ancestor.id === OVERLAY_ID) break;
                const content = String(ancestor.textContent || '').trim();
                if (content.length > 500) break;
                if (content.includes('Vector Rebel Recovery') && content.includes(marker)) {
                    toast = ancestor;
                }
            }
            if (toast) {
                toast.remove();
                return true;
            }
        }
        return false;
    }

    getConfig();
    migrateLegacySignature();
    migrateLegacyRunHistory();
    installPanel();
    dismissObsoleteRecoveryToast();
    setTimeout(repairCaptureVisibleItemPage,1200);
    ensureRebelCommandEnrollment(true).finally(() => {
        rebelCommandEvent('app_loaded', { success: true, description: 'Vector Rebel loaded.' });
        refreshPanelInfo();
    });

    const migrationNotice = loadJSON(MIGRATION_NOTICE_KEY, null);
    if (migrationNotice?.message) {
        setTimeout(() => alert(`Vector PPE Helper migration notice:\n\n${migrationNotice.message}`), 400);
        persistentRemoveRaw(MIGRATION_NOTICE_KEY);
    }

    // Resume a read-only Daily Captain Check or a stored inspection run after page load/navigation.
    setTimeout(async () => {
        try {
            const captainActive = await resumeCaptainDailyCheck();
            if (!captainActive) resumeRun();
        } catch (error) {
            setStatus(`Daily Captain Check stopped: ${error.message}`, false);
            resumeRun();
        }
    }, 700);

    // Keep ownership alive only for the tab that already owns the active run.
    setInterval(() => {
        if (getRun()) refreshRunOwnership();
    }, RUN_OWNER_HEARTBEAT_MS);

    // Coarse liveness only. No PPE content is included in heartbeat telemetry.
    setInterval(() => {
        rebelCommandEvent('heartbeat', { success: true, metadata: { health: 'ok' } });
    }, 5 * 60 * 1000);

    let lastUrl = location.href;
    let observerTimer = null;
    let observerLastRunAt = 0;
    const runObserverHandler = () => {
        observerLastRunAt = Date.now();
        if (!document.getElementById(PANEL_ID)) installPanel();
        dismissObsoleteRecoveryToast();
        repairCaptureVisibleItemPage();
        if (location.href !== lastUrl) {
            lastUrl = location.href;
            setTimeout(async () => {
                try {
                    const captainActive = await resumeCaptainDailyCheck();
                    if (!captainActive) resumeRun();
                } catch (error) {
                    setStatus(`Daily Captain Check stopped: ${error.message}`, false);
                    resumeRun();
                }
            }, 500);
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
