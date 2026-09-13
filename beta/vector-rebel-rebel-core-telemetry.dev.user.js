// ==UserScript==
// @name         Vector Rebel - Rebel Core Telemetry DEV
// @namespace    mission-vector-check-it-vector-rebel-telemetry-dev
// @version      0.1.1
// @description  Development-only, read-only telemetry sidecar for Vector Rebel -> Rebel Core. Does not modify PPE execution.
// @match        https://checkitapp.targetsolutions.com/*
// @require      https://raw.githubusercontent.com/michaelbartbrion-cmd/mission-vector-check-it/feature/vector-scheduling-mvp/shared/rebel-core-client.js
// @require      https://raw.githubusercontent.com/michaelbartbrion-cmd/mission-vector-check-it/feature/vector-scheduling-mvp/shared/vector-rebel-telemetry-adapter.js
// @grant        none
// @noframes
// ==/UserScript==

(function () {
  'use strict';

  const VERSION = '0.1.1';
  const LAST_SUMMARY_KEY = 'vectorPpeLastRunSummary_v3';
  const UPDATE_STATE_KEY = 'vectorPpeUpdateState_v1';
  const PAIRING_KEY = 'missionVectorRebelCorePairing_v1';
  const QUEUE_KEY = 'missionVectorRebelCoreQueue_vectorRebel_v1';
  const STATUS_KEY = 'missionVectorRebelCoreClientStatus_vectorRebel_v1';
  const SEEN_KEY = 'missionVectorRebelTelemetrySeen_v1';
  const HEARTBEAT_MS = 2 * 60 * 1000;
  const SUMMARY_POLL_MS = 3000;
  const UPDATE_POLL_MS = 60 * 1000;

  if (window.top !== window.self || window.__mvciVectorRebelTelemetryDev) return;
  window.__mvciVectorRebelTelemetryDev = { version: VERSION, startedAt: Date.now() };

  const ClientFactory = window.MVCIRebelCoreClient;
  const Adapter = window.MVCIVectorRebelTelemetryAdapter;
  if (!ClientFactory?.create || !Adapter?.completedRunUsage) {
    console.warn('Vector Rebel telemetry DEV: shared telemetry libraries are unavailable. PPE Helper is unaffected.');
    return;
  }

  const client = ClientFactory.create({
    configKey: PAIRING_KEY,
    queueKey: QUEUE_KEY,
    statusKey: STATUS_KEY,
    maxQueue: 300,
    batchSize: 40,
    maxAttempts: 8,
    timeoutMs: 12000,
  });

  function readJson(key, fallback = null) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (_) {
      return fallback;
    }
  }

  function readSeen() {
    const value = readJson(SEEN_KEY, {});
    return value && typeof value === 'object' ? value : {};
  }

  function writeSeen(value) {
    try { localStorage.setItem(SEEN_KEY, JSON.stringify(value)); } catch (_) {}
  }

  function vectorRebelVersion() {
    return String(window.__vectorRebelInstance?.version || readJson(LAST_SUMMARY_KEY, {})?.helperVersion || '').trim() || 'unknown';
  }

  function paired() {
    return !!client.publicConfig();
  }

  function emitHeartbeat() {
    if (!paired()) return;
    const updateState = readJson(UPDATE_STATE_KEY, {});
    const clientStatus = client.status();
    client.emit(Adapter.runtimeHeartbeat({
      version: vectorRebelVersion(),
      updateState,
      status: window.__vectorRebelInstance ? 'connected' : 'degraded',
      queueCount: clientStatus.queued,
    }));
  }

  function emitLatestSummary() {
    if (!paired()) return;
    const summary = readJson(LAST_SUMMARY_KEY, null);
    if (!summary || typeof summary !== 'object') return;
    const aggregate = Adapter.aggregateCompletedRun(summary);
    const identity = aggregate.runId || `${aggregate.completedAt || ''}:${aggregate.modeKey || ''}:${aggregate.total}`;
    if (!identity) return;
    const seen = readSeen();
    if (seen.lastSummaryIdentity === identity) return;
    client.emit(Adapter.completedRunUsage(summary, vectorRebelVersion()));
    seen.lastSummaryIdentity = identity;
    seen.lastSummaryQueuedAt = new Date().toISOString();
    writeSeen(seen);
  }

  function emitUpdateState() {
    if (!paired()) return;
    const state = readJson(UPDATE_STATE_KEY, null);
    if (!state || typeof state !== 'object' || !state.checkedAt) return;
    const fingerprint = JSON.stringify([
      state.checkedAt,
      state.successfulAt,
      state.error ? 'error' : 'ok',
      state.manifest?.latestVersion || '',
      state.manifest?.status || '',
    ]);
    const seen = readSeen();
    if (seen.lastUpdateFingerprint === fingerprint) return;
    client.emit(Adapter.updateUsage(state, vectorRebelVersion(), state.checkedAt));
    seen.lastUpdateFingerprint = fingerprint;
    seen.lastUpdateQueuedAt = new Date().toISOString();
    writeSeen(seen);
  }

  function submitSuggestion(fields) {
    if (!paired()) return false;
    client.emit(Adapter.suggestion({ ...fields, version: fields?.version || vectorRebelVersion() }));
    return true;
  }

  function safeTick(fn) {
    try { fn(); }
    catch (error) {
      console.warn('Vector Rebel telemetry DEV failed without affecting PPE Helper.', error);
    }
  }

  client.startAutoFlush(30000);
  setTimeout(() => safeTick(() => { emitHeartbeat(); emitLatestSummary(); emitUpdateState(); }), 5000);
  setInterval(() => safeTick(emitHeartbeat), HEARTBEAT_MS);
  setInterval(() => safeTick(emitLatestSummary), SUMMARY_POLL_MS);
  setInterval(() => safeTick(emitUpdateState), UPDATE_POLL_MS);

  window.MVCI_VECTOR_REBEL_TELEMETRY_DEV = {
    version: VERSION,
    status: () => client.status(),
    flush: () => client.flush(),
    heartbeat: emitHeartbeat,
    syncLatestSummary: emitLatestSummary,
    syncUpdateState: emitUpdateState,
    submitSuggestion,
  };
})();
