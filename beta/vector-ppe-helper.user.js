// ==UserScript==
// @name         Vector Check It - PPE Helper
// @namespace    mission-ppe
// @version      2.3.0-rc15
// @updateURL    https://raw.githubusercontent.com/michaelbartbrion-cmd/mission-vector-check-it/main/beta/vector-ppe-helper.user.js
// @downloadURL  https://raw.githubusercontent.com/michaelbartbrion-cmd/mission-vector-check-it/main/beta/vector-ppe-helper.user.js
// @homepageURL  https://github.com/michaelbartbrion-cmd/mission-vector-check-it
// @supportURL   https://github.com/michaelbartbrion-cmd/mission-vector-check-it/issues
// @description  PPE inspection helper hardened multi-user RC with persistent Captain list, diagnostics/preflight, department profiles, and managed GitHub/Tampermonkey updates
// @match        https://checkitapp.targetsolutions.com/*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    // ============================================================
    // STORAGE / CONSTANTS
    // ============================================================

    const VERSION = '2.3.0-rc15';
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
    const FAILED_RETURN_EVIDENCE_FLOOR_MS = 10000;

    // Built-in mappings belong to this department/profile scope only. A profile
    // declaring a different scope must provide its own complete mappings.
    const BUILTIN_PROFILE_SCOPE = 'cvfm-vector-ppe-2026';

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
        schemaVersion: 5,
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
            alert(`Vector PPE Helper cannot start a new automated run.\n\n${gate.message}\n\nTo update: PPE Helper → UPDATES → OPEN UPDATE.\n\nYou can still use Vector manually.`);
            return false;
        }

        // GitHub/CSP/network uncertainty is intentionally fail-open so required
        // PPE work is not prevented solely by updater reachability. Acknowledge
        // only genuinely unverified/stale states; fresh cached status with a
        // transient refresh error remains a visible, non-modal panel warning.
        if (compatibilityNeedsAcknowledgement(state, gate)) {
            const proceed = confirm(
                `Vector PPE Helper could not fully verify remote compatibility status.\n\n` +
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
        const role = clean(person?.role || '');
        return name && prefix ? { name, prefix, role } : null;
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
        const validPrefixes = new Set(peopleDirectory.map(p => p.prefix));
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

        let captainSets = normalizeCaptainSets(legacy.captainSets || [], people);
        if (!captainSets.length && people.length) {
            captainSets = [{
                id: 'set-migrated-current-crew',
                name: 'Current Crew',
                memberPrefixes: people.map(p => p.prefix),
                orphanedPrefixes: []
            }];
        }

        const migrated = {
            schemaVersion: 5,
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
        const captainSets = normalizeCaptainSets(stored.captainSets || [], people);
        return {
            ...deepClone(DEFAULT_CONFIG),
            ...stored,
            schemaVersion: 5,
            inspectorName: clean(stored.inspectorName),
            selfPrefix,
            tourCoatComment: clean(stored.tourCoatComment),
            peopleDirectory: people,
            captainRosterPrefixes: deriveCaptainRosterPrefixes(stored, people, captainSets),
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
    });

    function getRun() {
        return loadJSON(RUN_KEY, null);
    }

    function saveRun(run) {
        saveJSON(RUN_KEY, run);
        refreshPanelInfo();
    }

    function clearRun() {
        localStorage.removeItem(RUN_KEY);
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
            console.warn('Vector PPE Helper: first-contact fingerprint capture failed:', error);
            return false;
        }
    }

    function capturePostSubmitSettledFingerprintOnce(run, item) {
        if (!run || !item || run.postSubmitSettledFingerprint) return false;
        try {
            run.postSubmitSettledFingerprint = assetPageDiagnosticFingerprint(item);
            return !!run.postSubmitSettledFingerprint;
        } catch (error) {
            console.warn('Vector PPE Helper: settled fingerprint capture failed:', error);
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
            console.warn('Vector PPE Helper: diagnostic state could not be persisted:', error);
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
            'padding:9px 11px;' +
            'margin:3px;' +
            'border:1px solid #173f70;' +
            'border-radius:5px;' +
            `background:${options.background || '#fff'};` +
            `color:${options.color || '#173f70'};` +
            'font-weight:600;' +
            'cursor:pointer;';
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
            'background:rgba(0,0,0,.48);' +
            'display:flex;' +
            'align-items:center;' +
            'justify-content:center;' +
            'font-family:Arial,sans-serif;';

        const box = document.createElement('div');
        box.style.cssText =
            `width:${width};` +
            'max-width:94vw;' +
            'max-height:90vh;' +
            'overflow:auto;' +
            'background:#fff;' +
            'border-radius:8px;' +
            'padding:16px;' +
            'box-shadow:0 8px 34px rgba(0,0,0,.35);';

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
            throw new Error('This is not a Vector PPE Helper department profile file.');
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
            return old && (old.name !== p.name || old.role !== p.role);
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

        const { overlay, box } = makeOverlayBox('900px');
        box.innerHTML = `
            <div style="font-size:22px;font-weight:700;margin-bottom:5px">PPE Run Summary</div>
            <div style="line-height:1.5;margin-bottom:12px">
                <b>Mode:</b> ${escapeHtml(summary.modeTitle || summary.modeKey || '')}<br>
                <b>Inspector:</b> ${escapeHtml(summary.inspectorName || '')}<br>
                <b>Gear owner(s):</b> ${escapeHtml(summary.ownerLabel || '')}<br>
                <b>Completed:</b> ${escapeHtml(String(summary.total || 0))} inspection(s)<br>
                <b>Items with a failure:</b> ${escapeHtml(String(summary.failures || 0))}<br>
                <b>Finished:</b> ${escapeHtml(summary.completedAt ? new Date(summary.completedAt).toLocaleString() : '')}
            </div>
        `;

        if (Number(summary.inferredCompletions || 0) > 0) {
            const inferred = document.createElement('div');
            inferred.style.cssText = 'background:#fff4e5;border:2px solid #d49b42;padding:10px;margin:0 0 12px;border-radius:5px;line-height:1.45;';
            inferred.innerHTML =
                `<b>VERIFY IN VECTOR:</b> ${escapeHtml(String(summary.inferredCompletions))} item(s) used post-submit return-to-asset completion evidence. ` +
                'The helper did not click Submit again; confirm those item(s) in Vector\'s own inspection history.';
            box.appendChild(inferred);
        }

        for (const [owner, group] of Object.entries(summary.groups || {})) {
            const header = document.createElement('div');
            header.style.cssText = 'margin:12px 0 5px;padding:8px 10px;background:#eaf0f7;border-left:4px solid #173f70;font-weight:700;';
            header.textContent = `${owner} — ${group.total} item(s) — ${group.failed} with failure`;
            box.appendChild(header);

            for (const item of group.items || []) {
                const failed = item.q1 === 'fail' || item.q2 === 'fail';
                const row = document.createElement('div');
                row.style.cssText = `padding:7px 9px;margin:3px 0;border:1px solid #ddd;border-radius:5px;${failed ? 'background:#fff1f1;' : ''}`;
                row.innerHTML =
                    `<b>${escapeHtml(item.assetId || '')}</b> — ${escapeHtml(item.type || '')} — ` +
                    `Age/label: <b>${escapeHtml((item.q1 || '').toUpperCase())}</b> — ` +
                    `Damage: <b>${escapeHtml((item.q2 || '').toUpperCase())}</b>` +
                    (item.failureNote ? `<br><span style="font-size:12px"><b>Failure note:</b> ${escapeHtml(item.failureNote)}</span>` : '') +
                    (item.signatureLabel ? `<br><span style="font-size:11px;color:#666">Signature variant: ${escapeHtml(item.signatureLabel)}</span>` : '') +
                    (String(item.evidence || '').startsWith('post-submit-return-')
                        ? '<br><span style="font-size:12px;color:#8a5b00"><b>Completion verification:</b> inferred from a stable return to the exact asset page after one Submit — verify this item in Vector history.</span>'
                        : '') +
                    (item.evidence ? `<br><span style="font-size:10px;color:#777">Evidence: ${escapeHtml(item.evidence)}</span>` : '');
                box.appendChild(row);
            }
        }

        const exportNote = document.createElement('div');
        exportNote.style.cssText = 'font-size:11px;color:#666;margin-top:12px;line-height:1.35;';
        exportNote.textContent =
            'Run-summary JSON includes the stored run record, which may contain inspector/owner names and failure notes. Share it only where appropriate.';
        box.appendChild(exportNote);

        const summaryJson = JSON.stringify(summary, null, 2);
        const copy = makeButton('COPY RUN SUMMARY');
        copy.onclick = async () => {
            const ok = await copyText(summaryJson);
            setStatus(ok ? 'Run summary copied.' : 'Could not copy run summary.', ok);
        };

        const download = makeButton('DOWNLOAD RUN SUMMARY (JSON)');
        download.onclick = () => downloadTextFile(
            `vector-ppe-run-${clean(summary.runId || 'summary')}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
            summaryJson
        );

        const close = makeButton('Close');
        close.onclick = () => overlay.remove();
        box.append(copy, download, close);
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
            <div style="font-size:22px;font-weight:700;margin-bottom:6px">PPE Helper Diagnostics</div>
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
            throw new Error('No saved signature variants. Open SIGNATURES and add at least one signature you personally drew.');
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

        const sign = enabledButton('Click to Sign');
        if (!sign) throw new Error('Click to Sign was not found.');
        sign.click();

        const canvas = await waitFor(
            () => [...document.querySelectorAll('canvas')].find(visible),
            8000
        );

        await sleep(500);
        for (const stroke of variant.strokes) {
            await replayStroke(canvas, stroke);
        }

        await sleep(1200);
        const confirmButton = await waitFor(() => enabledButton('CONFIRM'), 5000);
        confirmButton.click();

        await waitFor(() => {
            const canvasOpen = [...document.querySelectorAll('canvas')].some(visible);
            return !canvasOpen && !exactButton('CONFIRM');
        }, 12000);

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
            return headerText.includes('DATE') &&
                headerText.includes('PERSONNEL') &&
                (headerText.includes('NOTES') || headerText.includes('LOCATION TYPE'));
        }) || null;
    }

    function historyRows(container = findItemLogHistoryTable()) {
        if (!container) return [];
        const rows = container.matches('table')
            ? [...container.querySelectorAll('tbody tr')]
            : [...container.querySelectorAll('[role="row"]')].filter(row => !row.querySelector('[role="columnheader"]'));
        return rows.filter(visible);
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
            return uiIncludes(text, modeTitle) && rowHasCompletedStatus(row);
        });
    }

    function assetHistoryRegionReady(item) {
        return !!(
            isAssetPageFor(item) &&
            assetPageContainsExpectedId(item) &&
            findItemLogHistoryTable()
        );
    }

    function countModeCompletesOnAssetPage(item, modeTitle) {
        if (!assetHistoryRegionReady(item)) return null;
        return getModeHistoryRows(item, modeTitle).length;
    }

    async function waitForStableHistoryBaseline(item, modeTitle, timeout = 12000) {
        const start = Date.now();
        let last = null;
        let stablePolls = 0;
        while (Date.now() - start < timeout) {
            await sleep(200);
            const count = countModeCompletesOnAssetPage(item, modeTitle);
            if (!Number.isInteger(count)) {
                last = null;
                stablePolls = 0;
                continue;
            }
            if (count === last) stablePolls += 1;
            else {
                last = count;
                stablePolls = 0;
            }
            if (stablePolls >= 5) return count;
        }
        throw new Error(`${item.assetId}: inspection history did not become readable and stable; baseline was not guessed.`);
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
            throw new Error('Tour Bunker Coat requires a configured assignment comment. Open SETTINGS and set the Tour coat comment.');
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

        const returnEvidence = evaluatePostSubmitReturnCandidate(run, item);
        if (returnEvidence) return returnEvidence;

        if (run.historyFallbackEnabled === true && isAssetPageFor(item) && assetPageContainsExpectedId(item)) {
            if (!clean(run.inspectorName)) return null;
            const submittedAge = Number.isFinite(run.submittedAt) ? Date.now() - run.submittedAt : Infinity;
            const now = countModeCompletesOnAssetPage(item, mode.title);
            if (
                submittedAge >= 0 && submittedAge <= 120000 &&
                Number.isInteger(now) &&
                Number.isInteger(run.baselineCompleteCount) &&
                now === run.baselineCompleteCount + 1
            ) {
                const newest = newestModeHistoryAudit(item, mode.title);
                // History fallback is only accepted when the newest matching completed
                // row also identifies this local inspector. Ambiguous date ordering
                // returns null above and therefore cannot satisfy this fallback.
                if (newest && uiIncludes(newest.text, run.inspectorName)) {
                    const stamp = newest.firstCell || 'timestamp-unavailable';
                    const parsed = Number.isFinite(newest.parsedAt) ? new Date(newest.parsedAt).toISOString() : 'unparsed';
                    return `asset-history-plus-one-${run.baselineCompleteCount}-to-${now}-newest-${stamp}-parsed-${parsed}-sort-${newest.sortDirection}`;
                }
            }
        }

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
                run.historyFallbackEnabled === false ||
                (run.historyStructureCapture || []).length > 0 ||
                !!run.preSubmitAssetFingerprint ||
                !!run.postSubmitAssetFingerprint ||
                !!run.postSubmitSettledFingerprint
            ) ? {
                historyStructureCapture: run.historyStructureCapture || [],
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
        const start = Date.now();

        while (Date.now() - start < timeout) {
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
        const start = Date.now();

        while (Date.now() - start < 30000) {
            const modal = findFailureModalRoot(item.assetId);
            if (modal) {
                setStatus(`${run.index + 1}/${run.items.length} — Failure Details detected for ${item.assetId}...`);
                await submitFailureModal(run, item, modal);
                return;
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
                run.baselineCompleteCount = await waitForStableHistoryBaseline(item, mode.title);
                run.historyFallbackEnabled = true;
                run.historyBaselineWarning = '';
            } catch (error) {
                // A Vector markup change must not force us to guess a baseline or
                // make the whole helper unusable. Continue with stronger evidence
                // paths only; capture the safe table structure so the selector can
                // be repaired from a legitimate inspection without collecting row text.
                run.baselineCompleteCount = null;
                run.historyFallbackEnabled = false;
                run.historyBaselineWarning = error.message;
                run.historyStructureCapture = safeDiagnosticTableStructure(item);
            }
            saveRun(run);
            if (run.historyFallbackEnabled === false) {
                saveDiagnostic(
                    `${item.assetId}: history completion fallback unavailable; captured visible table/grid structure for selector repair.`,
                    run
                );
            }
        }

        if (run.historyFallbackEnabled === false) {
            setStatus(
                `${run.index + 1}/${run.items.length} — ${item.assetId}: history fallback unavailable; ` +
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
                        'immediately after Start Inspection and before submission. History completion fallback was not trusted.'
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
            throw new Error('First-time setup required. Open SETTINGS, confirm the inspector name / gear prefix, and save before running inspections.');
        }
        if (!getSignatureLibrary().length) {
            throw new Error('No saved signature variants. Use SIGNATURES first.');
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
            prefix: config.selfPrefix,
            role: 'Self'
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

        const initialConfig = getConfig();
        if (!initialConfig.peopleDirectory.length) {
            setStatus('No people are available yet. Open PEOPLE and add personnel whose gear may be Captain-checked.', false);
            return;
        }

        const { overlay, box } = makeOverlayBox('780px');
        let filterText = '';

        const title = document.createElement('div');
        title.style.cssText = 'font-size:21px;font-weight:700;margin-bottom:8px;';
        title.textContent = "Captain's Monthly — My Check List";
        box.appendChild(title);

        const info = document.createElement('div');
        info.style.cssText = 'margin-bottom:10px;line-height:1.45;background:#eef5fb;padding:9px;border-radius:6px;';
        info.innerHTML =
            `<b>Inspector/signature:</b> ${escapeHtml(initialConfig.inspectorName)}<br>` +
            '<b>Your list stays saved on this computer.</b> Click ADD or REMOVE next to a name. The next time you open Captain mode, the same list will still be here.';
        box.appendChild(info);

        const search = document.createElement('input');
        search.type = 'search';
        search.placeholder = 'Search people...';
        search.style.cssText = 'display:block;width:100%;box-sizing:border-box;padding:9px;margin:0 0 10px;border:1px solid #bbb;border-radius:5px;';
        box.appendChild(search);

        const rosterHost = document.createElement('div');
        const availableHost = document.createElement('div');
        box.append(rosterHost, availableHost);

        function current() {
            return getConfig();
        }

        function personMatches(person) {
            if (!filterText) return true;
            const hay = `${person.name} ${person.role || ''} ${person.prefix}`.toLowerCase();
            return hay.includes(filterText.toLowerCase());
        }

        function rosterPeople(config) {
            const byPrefix = new Map(config.peopleDirectory.map(p => [p.prefix, p]));
            return (config.captainRosterPrefixes || []).map(prefix => byPrefix.get(prefix)).filter(Boolean);
        }

        function makePersonRow(person, actionText, actionColor, onAction) {
            const row = document.createElement('div');
            row.style.cssText = 'display:flex;gap:10px;align-items:center;padding:9px;margin:4px 0;border:1px solid #ddd;border-radius:5px;background:#fff;';

            const text = document.createElement('div');
            text.style.cssText = 'flex:1;min-width:0;';
            text.innerHTML = `<b>${escapeHtml(person.name)}</b><br><span style="font-size:11px;color:#666">${escapeHtml(person.role || 'Personnel')} · ${escapeHtml(person.prefix)}</span>`;

            const action = makeButton(actionText, { background: actionColor, margin: '0' });
            action.style.whiteSpace = 'nowrap';
            action.onclick = onAction;
            row.append(text, action);
            return row;
        }

        function render() {
            const config = current();
            const roster = rosterPeople(config);
            const rosterSet = new Set(roster.map(p => p.prefix));
            const available = config.peopleDirectory.filter(p => !rosterSet.has(p.prefix));

            rosterHost.innerHTML = '';
            const rosterTitle = document.createElement('div');
            rosterTitle.style.cssText = 'font-size:16px;font-weight:700;margin:10px 0 5px;';
            rosterTitle.textContent = `MY CAPTAIN LIST — ${roster.length} person${roster.length === 1 ? '' : 's'}`;
            rosterHost.appendChild(rosterTitle);

            const rosterHelp = document.createElement('div');
            rosterHelp.style.cssText = 'font-size:12px;color:#555;margin-bottom:6px;';
            rosterHelp.textContent = 'Everyone in this list will be included when you click FIND PPE.';
            rosterHost.appendChild(rosterHelp);

            const filteredRoster = roster.filter(personMatches);
            if (!filteredRoster.length) {
                const empty = document.createElement('div');
                empty.style.cssText = 'padding:10px;background:#fff4e5;border-radius:5px;font-size:12px;margin-bottom:6px;';
                empty.textContent = roster.length ? 'No saved people match this search.' : 'Your Captain list is empty. Add people below.';
                rosterHost.appendChild(empty);
            } else {
                filteredRoster.forEach(person => {
                    rosterHost.appendChild(makePersonRow(person, 'REMOVE', '#fff0f0', () => {
                        const configNow = current();
                        saveCaptainRosterPrefixes((configNow.captainRosterPrefixes || []).filter(p => p !== person.prefix));
                        render();
                    }));
                });
            }

            const rosterControls = document.createElement('div');
            rosterControls.style.cssText = 'margin:7px 0 12px;';
            const addAll = makeButton('ADD ALL PEOPLE', { background: '#eef5fb' });
            addAll.onclick = () => {
                saveCaptainRosterPrefixes(config.peopleDirectory.map(p => p.prefix));
                render();
            };
            const clear = makeButton('CLEAR MY LIST');
            clear.onclick = () => {
                if (!confirm('Clear everyone from your saved Captain list? You can add them back with one click.')) return;
                saveCaptainRosterPrefixes([]);
                render();
            };
            rosterControls.append(addAll, clear);
            rosterHost.appendChild(rosterControls);

            availableHost.innerHTML = '';
            const availableTitle = document.createElement('div');
            availableTitle.style.cssText = 'font-size:16px;font-weight:700;margin:8px 0 5px;';
            availableTitle.textContent = `AVAILABLE PEOPLE — ${available.length}`;
            availableHost.appendChild(availableTitle);

            const filteredAvailable = available.filter(personMatches);
            if (!filteredAvailable.length) {
                const none = document.createElement('div');
                none.style.cssText = 'font-size:12px;color:#666;padding:6px 0;';
                none.textContent = available.length ? 'No available people match this search.' : 'Everyone in the People Directory is already on your Captain list.';
                availableHost.appendChild(none);
            } else {
                filteredAvailable.forEach(person => {
                    availableHost.appendChild(makePersonRow(person, '+ ADD', '#e8f2e8', () => {
                        const configNow = current();
                        saveCaptainRosterPrefixes([...(configNow.captainRosterPrefixes || []), person.prefix]);
                        render();
                    }));
                });
            }

            const manage = makeButton('MANAGE AVAILABLE PEOPLE');
            manage.onclick = () => {
                overlay.remove();
                showPeopleSetsManager();
            };
            availableHost.appendChild(manage);
        }

        search.oninput = () => {
            filterText = clean(search.value);
            render();
        };

        render();

        const go = makeButton('FIND PPE FOR MY CAPTAIN LIST', { background: '#e8f2e8' });
        go.style.cssText += 'font-size:14px;font-weight:700;padding:10px 14px;margin-top:12px;';
        go.onclick = async () => {
            const config = current();
            const byPrefix = new Map(config.peopleDirectory.map(p => [p.prefix, p]));
            const owners = (config.captainRosterPrefixes || []).map(prefix => byPrefix.get(prefix)).filter(Boolean);
            if (!owners.length) {
                alert('Your Captain list is empty. Click ADD next to at least one person first.');
                return;
            }
            overlay.remove();
            try {
                await buildPreview('captain', owners);
            } catch (error) {
                saveDiagnostic(error.message);
                setStatus(error.message, false);
            }
        };

        const cancel = makeButton('Cancel');
        cancel.onclick = () => overlay.remove();
        box.append(go, cancel);
    }

    // ============================================================
    // SETTINGS / PEOPLE DIRECTORY / SAVED CAPTAIN LIST
    // ============================================================

    function peopleDirectoryToText(people) {
        return (people || []).map(p => `${p.name}|${p.prefix}|${p.role || ''}`).join('\n');
    }

    function parsePeopleDirectory(text) {
        const result = [];
        const seenPrefixes = new Set();
        for (const rawLine of String(text || '').split(/\r?\n/)) {
            if (!clean(rawLine)) continue;
            const [nameRaw, prefixRaw, roleRaw] = rawLine.split('|');
            const name = clean(nameRaw);
            const prefix = clean(prefixRaw).toUpperCase();
            const role = clean(roleRaw || '');
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
            result.push({ name, prefix, role });
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
                text.innerHTML = `<b>${escapeHtml(person.name)}</b><br><span style="font-size:11px;color:#666">${escapeHtml(person.role || 'Personnel')} · ${escapeHtml(person.prefix)}</span>`;

                const edit = makeButton('EDIT', { margin: '0' });
                edit.onclick = () => {
                    const name = prompt('Name', person.name);
                    if (name === null) return;
                    const prefix = prompt('Gear prefix', person.prefix);
                    if (prefix === null) return;
                    const role = prompt('Role', person.role || '');
                    if (role === null) return;
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
                            ? { name: clean(name), prefix: newPrefix, role: clean(role) }
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
        form.style.cssText = 'display:grid;grid-template-columns:2fr 1.2fr 1.4fr auto;gap:6px;align-items:end;margin-bottom:10px;';
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
        const roleF = makeMiniField('Role', 'Firefighter');
        const add = makeButton('+ ADD PERSON', { background: '#e8f2e8', margin: '0' });
        add.onclick = () => {
            try {
                const name = clean(nameF.input.value);
                const prefix = clean(prefixF.input.value).toUpperCase();
                const role = clean(roleF.input.value);
                if (!name || !prefix) throw new Error('Name and gear prefix are required.');
                if (!/^[A-Z0-9]+(?:-[A-Z0-9]+)*$/.test(prefix)) throw new Error('Gear prefix may contain only letters, numbers, and internal hyphens.');
                const configNow = cloneConfig();
                if (configNow.peopleDirectory.some(p => p.prefix === prefix)) {
                    throw new Error(`Gear prefix ${prefix} is already assigned to another person.`);
                }
                const nextPeople = assertNoPrefixOverlap([...configNow.peopleDirectory, { name, prefix, role }]);
                configNow.peopleDirectory = nextPeople;
                saveConfig(configNow);
                nameF.input.value = '';
                prefixF.input.value = '';
                roleF.input.value = '';
                renderPeople();
                refreshPanelInfo();
            } catch (error) {
                alert(error.message);
            }
        };
        form.append(nameF.wrap, prefixF.wrap, roleF.wrap, add);
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

    function showSettings() {
        const config = getConfig();
        const { overlay, box } = makeOverlayBox('800px');

        box.innerHTML = '<div style="font-size:21px;font-weight:700;margin-bottom:10px">PPE Helper — Local Setup / Settings</div>';

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
        // Inline Star Wars Rebel Alliance starbird for the user's private minimized control.
        // No external image/network request is used.
        return `
            <svg viewBox="0 0 64 64" width="38" height="38" aria-hidden="true" focusable="false">
                <path fill="currentColor" d="M32 4l-5.4 16.2 5.4-3.5 5.4 3.5L32 4zm-4.5 19.4C19.9 15.7 11.7 14 4 16.2c1.7 12.4 6.4 22.5 17.9 30.1l-4.4 9.4c5.2-1.1 10-3.5 14.5-7.2-5.5-5.1-8.4-11-8.8-17.8 2.3 2.4 4.1 5.2 5.5 8.4.3-6.2-.1-11.5-1.2-15.7zm9 0c-1.1 4.2-1.5 9.5-1.2 15.7 1.4-3.2 3.2-6 5.5-8.4-.4 6.8-3.3 12.7-8.8 17.8 4.5 3.7 9.3 6.1 14.5 7.2l-4.4-9.4C53.6 38.7 58.3 28.6 60 16.2c-7.7-2.2-15.9-.5-23.5 7.2z"/>
            </svg>`;
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
            panel.style.width = '56px';
            panel.style.maxWidth = '56px';
            panel.style.padding = '0';
            panel.style.background = 'transparent';
            panel.style.border = '0';
            panel.style.boxShadow = 'none';
        } else {
            panel.style.width = '540px';
            panel.style.maxWidth = 'calc(100vw - 36px)';
            panel.style.padding = '10px';
            panel.style.background = '#fff';
            panel.style.border = '2px solid #173f70';
            panel.style.boxShadow = '0 4px 18px rgba(0,0,0,.25)';
        }
    }

    function updateMinimizedPanelBadge(run = getRun()) {
        const badge = document.getElementById('vector-ppe-mini-badge-v1');
        const mini = document.querySelector(`#${PANEL_ID} [data-vector-ppe-panel-mini]`);
        if (!badge || !mini) return;

        // Stopped state outranks ordinary run progress and survives navigation.
        if (run?.phase === 'stopped') {
            badge.textContent = '!';
            badge.style.display = 'block';
            mini.setAttribute(
                'aria-label',
                'Expand Vector PPE Helper. PPE run stopped — attention required.'
            );
            return;
        }

        if (run?.items?.length && Number.isInteger(run.index)) {
            badge.textContent = `${Math.min(run.index + 1, run.items.length)}/${run.items.length}`;
            badge.style.display = 'block';
            mini.setAttribute(
                'aria-label',
                `Expand Vector PPE Helper. Active PPE run ${Math.min(run.index + 1, run.items.length)} of ${run.items.length}.`
            );
            return;
        }

        const gate = evaluateRemoteCompatibility(getUpdateState());
        if (!gate.allowed || ['warning', 'unknown'].includes(gate.severity)) {
            badge.textContent = '!';
            badge.style.display = 'block';
            mini.setAttribute('aria-label', 'Expand Vector PPE Helper. Attention required.');
            return;
        }

        badge.textContent = '';
        badge.style.display = 'none';
        mini.setAttribute('aria-label', 'Expand Vector PPE Helper.');
    }

    function refreshPanelInfo() {
        const info = document.getElementById('vector-ppe-info-v2');
        if (!info) return;
        const updateBox = document.getElementById('vector-ppe-update-status-v1');
        if (updateBox) updateBox.innerHTML = updateStatusHtml();
        const config = getConfig();
        const run = getRun();
        const sigCount = getSignatureLibrary().length;
        const historyCount = getRunHistory().length;

        if (run) {
            info.innerHTML =
                `<b>ACTIVE:</b> ${run.index + 1}/${run.items.length}<br>` +
                `<b>Mode:</b> ${escapeHtml(getMode(run.modeKey)?.short || run.modeKey)}<br>` +
                `<b>Gear owner(s):</b> ${escapeHtml(run.ownerLabel || run.ownerName || '')}<br>` +
                `<b>Current owner:</b> ${escapeHtml(run.items[run.index]?.ownerName || run.ownerName || '')}<br>` +
                `<b>Current:</b> ${escapeHtml(run.items[run.index]?.assetId || '')}<br>` +
                `<b>Phase:</b> ${escapeHtml(run.phase)}`;
        } else if (!config.initialized) {
            info.innerHTML =
                '<b>FIRST-TIME SETUP REQUIRED</b><br>' +
                'Open SETTINGS and set the local inspector / gear prefix, then capture that inspector\'s own signature variants.';
        } else {
            info.innerHTML =
                `<b>Inspector:</b> ${escapeHtml(config.inspectorName)}<br>` +
                `<b>My prefix:</b> ${escapeHtml(config.selfPrefix)}<br>` +
                `<b>Available people:</b> ${config.peopleDirectory.length} &nbsp; <b>My Captain list:</b> ${config.captainRosterPrefixes.length}<br>` +
                `<b>Signature variants:</b> ${sigCount} &nbsp; <b>Stored runs:</b> ${historyCount}/20<br>` +
                'Ready. Start from Equipment → PPE table/list.';
        }

        updateMinimizedPanelBadge(run);
    }

    function installPanel() {
        if (document.getElementById(PANEL_ID)) return;

        const panel = document.createElement('div');
        panel.id = PANEL_ID;
        panel.style.cssText =
            'position:fixed;' +
            'right:18px;' +
            'bottom:70px;' +
            'width:540px;' +
            'max-width:calc(100vw - 36px);' +
            'z-index:2147483646;' +
            'background:#fff;' +
            'border:2px solid #173f70;' +
            'border-radius:8px;' +
            'padding:10px;' +
            'box-shadow:0 4px 18px rgba(0,0,0,.25);' +
            'font-family:Arial,sans-serif;';

        const full = document.createElement('div');
        full.setAttribute('data-vector-ppe-panel-full', '1');

        const titleRow = document.createElement('div');
        titleRow.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:5px;';

        const title = document.createElement('div');
        title.style.cssText = 'font-size:16px;font-weight:700;flex:1;min-width:0;';
        title.textContent = `Vector PPE Helper v${VERSION} — BETA / FINAL CANDIDATE`;

        const minimize = makeButton('−');
        minimize.title = 'Minimize to Rebel Alliance icon';
        minimize.setAttribute('aria-label', 'Minimize Vector PPE Helper');
        minimize.style.cssText += 'margin:0;padding:2px 9px;font-size:20px;line-height:1;';
        minimize.onclick = () => applyPanelMinimizedState(true);

        titleRow.append(title, minimize);

        const info = document.createElement('div');
        info.id = 'vector-ppe-info-v2';
        info.style.cssText = 'font-size:12px;margin:5px 0 8px;line-height:1.4;';

        const tour = makeButton('MY TOUR PPE', { background: '#e8f2e8' });
        tour.onclick = () => startMyMode('tour');

        const fire = makeButton('MY AFTER-FIRE', { background: '#e8f2e8' });
        fire.onclick = () => startMyMode('afterFire');

        const captain = makeButton("CAPTAIN'S MONTHLY", { background: '#e8f2e8' });
        captain.onclick = showCaptainOwnerPicker;

        const people = makeButton('PEOPLE');
        people.onclick = showPeopleSetsManager;

        const signatures = makeButton('SIGNATURES');
        signatures.onclick = showSignatureManager;

        const settings = makeButton('SETUP / SETTINGS');
        settings.onclick = showSettings;

        const lastRun = makeButton('LAST RUN');
        lastRun.onclick = () => showRunSummary();

        const history = makeButton('RUN HISTORY');
        history.onclick = showRunHistory;

        const diagnostics = makeButton('DIAGNOSTICS');
        diagnostics.onclick = showDiagnostics;

        const updates = makeButton('UPDATES');
        updates.onclick = showUpdateCenter;

        const abort = makeButton('ABORT ACTIVE RUN', { background: '#fff0f0', color: '#8b1e1e' });
        abort.onclick = abortActiveRun;

        const updateBox = document.createElement('div');
        updateBox.id = 'vector-ppe-update-status-v1';
        updateBox.style.cssText = 'margin-top:6px;padding:7px;background:#f7f8fa;font-size:11px;line-height:1.35;border:1px solid #dde2e7;border-radius:4px;';

        const statusBox = document.createElement('div');
        statusBox.id = 'vector-ppe-status-v2';
        statusBox.style.cssText = 'margin-top:8px;padding:7px;background:#f3f5f7;font-size:12px;line-height:1.4;';
        statusBox.textContent = 'Ready.';

        full.append(
            titleRow, info,
            tour, fire, captain,
            people, signatures, settings,
            lastRun, history, diagnostics, updates,
            abort, updateBox, statusBox
        );

        const mini = document.createElement('button');
        mini.type = 'button';
        mini.setAttribute('data-vector-ppe-panel-mini', '1');
        mini.title = 'Expand Vector PPE Helper';
        mini.setAttribute('aria-label', 'Expand Vector PPE Helper');
        mini.style.cssText =
            'position:relative;' +
            'width:56px;height:56px;' +
            'display:none;' +
            'align-items:center;justify-content:center;' +
            'padding:0;margin:0;' +
            'border:2px solid #fff;' +
            'border-radius:50%;' +
            'background:#173f70;' +
            'color:#fff;' +
            'box-shadow:0 4px 16px rgba(0,0,0,.35);' +
            'cursor:pointer;';
        mini.innerHTML = rebelStarbirdSvg();
        mini.onclick = () => applyPanelMinimizedState(false);

        const badge = document.createElement('span');
        badge.id = 'vector-ppe-mini-badge-v1';
        badge.style.cssText =
            'display:none;position:absolute;right:-5px;top:-6px;' +
            'min-width:18px;height:18px;padding:0 4px;box-sizing:border-box;' +
            'border-radius:9px;background:#fff;color:#173f70;border:1px solid #173f70;' +
            'font:700 10px/16px Arial,sans-serif;text-align:center;';
        mini.appendChild(badge);

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
        setTimeout(() => alert(`Vector PPE Helper migration notice:\n\n${migrationNotice.message}`), 400);
        localStorage.removeItem(MIGRATION_NOTICE_KEY);
    }

    setTimeout(resumeRun, 700);

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
