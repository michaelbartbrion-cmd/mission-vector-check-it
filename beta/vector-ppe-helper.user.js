// ==UserScript==
// @name         Vector Check It - PPE Helper
// @namespace    mission-ppe
// @version      2.3.0-rc6
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

    const VERSION = '2.3.0-rc6';
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
                const d = aa[i].localeCompare(bb[i]);
                if (d) return d < 0 ? -1 : 1;
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
            const next = {
                checkedAt: successfulAt,
                successfulAt,
                manifest,
                error: '',
                lastHoldSeenAt: ['hold', 'disabled'].includes(manifest.status)
                    ? successfulAt
                    : ''
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
        const cmpMinimum = compareVersions(VERSION, manifest.minimumSupportedVersion);
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
            return {
                allowed: true,
                severity: 'warning',
                message: `A previously received compatibility hold is older than ${Math.round(REMOTE_HOLD_CACHE_MS / 3600000)} hours and could not be reverified. Remote safety status is uncertain.${state.error ? ` ${state.error}` : ''}`
            };
        }
        const cmpLatest = compareVersions(VERSION, manifest.latestVersion);
        if (cmpLatest != null && cmpLatest < 0) {
            return {
                allowed: true,
                severity: 'update',
                message: `Update available: v${manifest.latestVersion} (installed v${VERSION}).`
            };
        }
        if (state.error) {
            return { allowed: true, severity: 'warning', message: state.error };
        }
        return {
            allowed: true,
            severity: manifest.status === 'testing' ? 'testing' : 'ok',
            message: manifest.message || `v${VERSION} is current on the ${UPDATE_CHANNEL.toUpperCase()} channel.`
        };
    }

    async function ensureRemoteCompatibilityBeforeRun() {
        const state = await fetchUpdateManifest(false, UPDATE_GATE_INTERVAL_MS);
        const gate = evaluateRemoteCompatibility(state);
        if (!gate.allowed) {
            setStatus(`UPDATE / COMPATIBILITY HOLD: ${gate.message}`, false);
            alert(`Vector PPE Helper cannot start a new automated run.\n\n${gate.message}\n\nTo update: PPE Helper → UPDATES → OPEN UPDATE.\n\nYou can still use Vector manually.`);
            return false;
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
        const role = clean(person?.role);
        if (!name || !prefix) return null;
        return { name, prefix, role };
    }

    function normalizePeopleDirectory(value) {
        const map = new Map();
        (Array.isArray(value) ? value : []).forEach(person => {
            const p = normalizePerson(person);
            if (!p) return;
            map.set(p.prefix, p);
        });
        return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
    }

    function prefixesOverlap(a, b) {
        const aa = clean(a).toUpperCase();
        const bb = clean(b).toUpperCase();
        if (!aa || !bb) return false;
        return aa === bb || aa.startsWith(bb + '-') || bb.startsWith(aa + '-');
    }

    function assertNoPrefixOverlap(people) {
        const list = normalizePeopleDirectory(people);
        for (let i = 0; i < list.length; i++) {
            for (let j = i + 1; j < list.length; j++) {
                if (prefixesOverlap(list[i].prefix, list[j].prefix)) {
                    throw new Error(`Overlapping PPE prefixes are not allowed: ${list[i].prefix} and ${list[j].prefix}.`);
                }
            }
        }
        return list;
    }

    function normalizeCaptainRosterPrefixes(value, peopleDirectory) {
        const known = new Set(normalizePeopleDirectory(peopleDirectory).map(x => x.prefix));
        const out = [];
        for (const raw of Array.isArray(value) ? value : []) {
            const prefix = clean(raw).toUpperCase();
            if (!prefix || !known.has(prefix) || out.includes(prefix)) continue;
            out.push(prefix);
        }
        return out;
    }

    // Compatibility migration only. v2.3.0-rc4 and later uses one persistent
    // Captain list instead of requiring the user to manage named Captain sets.
    function normalizeCaptainSets(value, peopleDirectory, existingSets = []) {
        const known = new Set(normalizePeopleDirectory(peopleDirectory).map(x => x.prefix));
        const oldByName = new Map(
            (Array.isArray(existingSets) ? existingSets : [])
                .filter(Boolean)
                .map(set => [clean(set.name).toLowerCase(), clean(set.id)])
        );
        return (Array.isArray(value) ? value : []).map((set, index) => {
            const name = clean(set?.name) || `Set ${index + 1}`;
            const prefixes = [...new Set(
                (Array.isArray(set?.prefixes) ? set.prefixes : [])
                    .map(x => clean(x).toUpperCase())
                    .filter(Boolean)
            )];
            const orphanedPrefixes = prefixes.filter(p => !known.has(p));
            return {
                id: clean(set?.id) || oldByName.get(name.toLowerCase()) || `set-${Date.now()}-${index}`,
                name,
                prefixes,
                orphanedPrefixes
            };
        });
    }

    function localRuleKey(ownerPrefix, assetId) {
        return `${clean(ownerPrefix).toUpperCase()}::${clean(assetId).toUpperCase()}`;
    }

    function normalizeLocalAssetRules(value, fallbackOwnerPrefix = '') {
        const out = {};
        if (!value || typeof value !== 'object' || Array.isArray(value)) return out;
        for (const [rawKey, rawRule] of Object.entries(value)) {
            const rule = rawRule && typeof rawRule === 'object' ? rawRule : {};
            let ownerPrefix = clean(rule.ownerPrefix).toUpperCase();
            let assetId = clean(rule.assetId).toUpperCase();
            if (!ownerPrefix || !assetId) {
                if (rawKey.includes('::')) {
                    const [owner, asset] = rawKey.split('::');
                    ownerPrefix = clean(owner).toUpperCase();
                    assetId = clean(asset).toUpperCase();
                } else {
                    // Legacy v2.2/v2.3-rc1 form: keyed by bare asset ID.
                    ownerPrefix = clean(fallbackOwnerPrefix).toUpperCase();
                    assetId = clean(rawKey).toUpperCase();
                }
            }
            if (!ownerPrefix || !assetId) continue;
            const q1 = rule.q1 === 'fail' ? 'fail' : 'pass';
            const q2 = rule.q2 === 'fail' ? 'fail' : 'pass';
            const failureNote = clean(rule.failureNote || '');
            const expiresAt = clean(rule.expiresAt || '');
            out[localRuleKey(ownerPrefix, assetId)] = {
                ownerPrefix,
                assetId,
                q1,
                q2,
                failureNote,
                expiresAt
            };
        }
        return out;
    }

    function normalizeDepartmentProfile(value) {
        const incoming = value && typeof value === 'object' ? value : {};
        const profileScope = clean(incoming.profileScope) || BUILTIN_PROFILE_SCOPE;
        const replaceBuiltins = incoming.replaceBuiltins === true || profileScope !== BUILTIN_PROFILE_SCOPE;
        const useBuiltins = profileScope === BUILTIN_PROFILE_SCOPE && !replaceBuiltins;
        const poolTypes = useBuiltins ? deepClone(BUILTIN_POOL_TYPES) : {};
        if (incoming.poolTypes && typeof incoming.poolTypes === 'object') {
            Object.entries(incoming.poolTypes).forEach(([pool, type]) => {
                if (clean(pool) && clean(type)) poolTypes[clean(pool)] = clean(type);
            });
        }

        const modeTemplates = {};
        for (const modeKey of Object.keys(BUILTIN_MODES)) {
            const templates = useBuiltins ? deepClone(BUILTIN_MODES[modeKey].templates) : {};
            const incomingTemplates = incoming.modeTemplates?.[modeKey];
            if (incomingTemplates && typeof incomingTemplates === 'object') {
                Object.entries(incomingTemplates).forEach(([pool, template]) => {
                    if (clean(pool) && clean(template)) templates[clean(pool)] = clean(template);
                });
            }
            modeTemplates[modeKey] = templates;
        }

        return {
            name: clean(incoming.name) || 'Department PPE Profile',
            profileVersion: Number.isFinite(Number(incoming.profileVersion)) ? Number(incoming.profileVersion) : 2,
            profileScope,
            replaceBuiltins,
            expectedGearCount: Number.isInteger(Number(incoming.expectedGearCount))
                ? Number(incoming.expectedGearCount)
                : 10,
            poolTypes,
            modeTemplates
        };
    }

    // [TRUNCATED IN THIS TOOL CALL FOR DISPLAY ONLY]
