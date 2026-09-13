(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MVCIVectorRebelTelemetryAdapter = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const VERSION = '0.1.1';
  const PROGRAM_KEY = 'vector-rebel';
  const PROGRAM_NAME = 'Vector Rebel';
  const PROGRAM_CATEGORY = 'rebel';

  const clean = (value, max = 500) => String(value == null ? '' : value).replace(/\s+/g, ' ').trim().slice(0, max);
  const safeNumber = value => {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  };
  const parseTime = value => {
    const t = Date.parse(String(value || ''));
    return Number.isFinite(t) ? t : null;
  };

  function aggregateCompletedRun(summary) {
    const total = Math.max(0, safeNumber(summary?.total));
    const failures = Math.min(total, Math.max(0, safeNumber(summary?.failures)));
    const started = parseTime(summary?.startedAt);
    const completed = parseTime(summary?.completedAt);
    const durationMs = started != null && completed != null && completed >= started ? completed - started : undefined;
    return {
      runId: clean(summary?.runId, 300),
      helperVersion: clean(summary?.helperVersion, 100),
      modeKey: clean(summary?.modeKey, 100),
      modeTitle: clean(summary?.modeTitle, 300),
      startedAt: clean(summary?.startedAt, 100),
      completedAt: clean(summary?.completedAt, 100),
      total,
      failures,
      passed: Math.max(0, total - failures),
      inferredCompletions: Math.max(0, safeNumber(summary?.inferredCompletions)),
      durationMs,
    };
  }

  function completedRunUsage(summary, fallbackVersion = '') {
    const aggregate = aggregateCompletedRun(summary);
    const version = aggregate.helperVersion || clean(fallbackVersion, 100) || 'unknown';
    const stable = aggregate.runId || `${aggregate.completedAt || 'unknown'}:${aggregate.modeKey || 'unknown'}`;
    return {
      kind: 'usage',
      event_key: `vector-rebel:ppe-run-completed:${stable}`,
      program_key: PROGRAM_KEY,
      program_name: PROGRAM_NAME,
      program_category: PROGRAM_CATEGORY,
      action: 'ppe_run_completed',
      event_type: 'workflow',
      module: 'ppe-inspection',
      version,
      success: true,
      duration_ms: aggregate.durationMs,
      occurred_at: aggregate.completedAt || new Date().toISOString(),
      source: PROGRAM_NAME,
      details: `Completed ${aggregate.modeTitle || aggregate.modeKey || 'PPE'} run: ${aggregate.passed}/${aggregate.total} passed; ${aggregate.failures} with failure.`,
      metadata: {
        modeKey: aggregate.modeKey,
        modeTitle: aggregate.modeTitle,
        total: aggregate.total,
        passed: aggregate.passed,
        failures: aggregate.failures,
        inferredCompletions: aggregate.inferredCompletions,
      },
    };
  }

  function runtimeHeartbeat({ version, updateState, status = 'connected', occurredAt, queueCount } = {}) {
    const manifest = updateState?.manifest || {};
    const updateError = clean(updateState?.error, 1000);
    const latestVersion = clean(manifest?.latestVersion, 100);
    const remoteStatus = clean(manifest?.status, 100);
    const details = [
      `Vector Rebel ${clean(version, 100) || 'unknown'} is loaded.`,
      latestVersion ? `Latest known ${latestVersion}.` : '',
      remoteStatus ? `Update channel status ${remoteStatus}.` : '',
      updateError ? 'Latest update check reported an error.' : '',
    ].filter(Boolean).join(' ');
    return {
      kind: 'heartbeat',
      program_key: PROGRAM_KEY,
      program_name: PROGRAM_NAME,
      program_category: PROGRAM_CATEGORY,
      connection_key: 'vector-rebel-runtime',
      name: 'Vector Rebel Runtime',
      type: 'browser',
      component: 'PPE helper userscript',
      status: ['connected', 'degraded', 'disconnected', 'error', 'unknown'].includes(status) ? status : 'unknown',
      version: clean(version, 100),
      queue_count: Math.max(0, safeNumber(queueCount)),
      source: PROGRAM_NAME,
      occurred_at: occurredAt || new Date().toISOString(),
      details,
    };
  }

  function updateUsage(updateState, version, occurredAt) {
    const manifest = updateState?.manifest || {};
    const error = clean(updateState?.error, 1000);
    const successful = !error && !!updateState?.successfulAt;
    const at = clean(occurredAt || updateState?.checkedAt || updateState?.successfulAt, 100) || new Date().toISOString();
    const fingerprint = `${at}:${successful ? 'ok' : 'error'}:${clean(manifest?.latestVersion, 100)}:${clean(manifest?.status, 100)}`;
    return {
      kind: 'usage',
      event_key: `vector-rebel:update-check:${fingerprint}`,
      program_key: PROGRAM_KEY,
      program_name: PROGRAM_NAME,
      program_category: PROGRAM_CATEGORY,
      action: successful ? 'update_check_succeeded' : 'update_check_failed',
      event_type: 'maintenance',
      module: 'updater',
      version: clean(version, 100),
      success: successful,
      occurred_at: at,
      source: PROGRAM_NAME,
      details: successful
        ? `Update check succeeded; latest known version ${clean(manifest?.latestVersion, 100) || 'unknown'}.`
        : 'Update check failed. Vector Rebel operational workflow remains independent of telemetry.',
      metadata: {
        latestVersion: clean(manifest?.latestVersion, 100),
        minimumSupportedVersion: clean(manifest?.minimumSupportedVersion, 100),
        channelStatus: clean(manifest?.status, 100),
      },
    };
  }

  function suggestion({ key, version, title, content, category = 'improvement', priority = 'medium', sourceContext = '' } = {}) {
    return {
      kind: 'suggestion',
      suggestion_key: clean(key, 500) || `vector-rebel:suggestion:${Date.now()}`,
      source_program: PROGRAM_NAME,
      source_version: clean(version, 100),
      title: clean(title, 1000) || 'Vector Rebel suggestion',
      content: clean(content, 20000),
      status: 'new',
      priority: ['low', 'medium', 'high', 'critical'].includes(priority) ? priority : 'medium',
      category: clean(category, 500),
      source_context: clean(sourceContext, 2000),
      source: PROGRAM_NAME,
    };
  }

  return {
    version: VERSION,
    aggregateCompletedRun,
    completedRunUsage,
    runtimeHeartbeat,
    updateUsage,
    suggestion,
  };
});
