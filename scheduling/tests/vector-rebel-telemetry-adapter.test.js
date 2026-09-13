'use strict';

const assert = require('node:assert/strict');
const adapter = require('../../shared/vector-rebel-telemetry-adapter.js');

const summary = {
  helperVersion: '2.3.10',
  runId: 'run-abc-123',
  modeKey: 'tour',
  modeTitle: 'Tour PPE Routine Inspection',
  inspectorName: 'PRIVATE INSPECTOR',
  ownerLabel: 'PRIVATE OWNER',
  startedAt: '2026-09-13T18:00:00.000Z',
  completedAt: '2026-09-13T18:10:00.000Z',
  total: 10,
  failures: 2,
  inferredCompletions: 1,
  groups: {
    'PRIVATE OWNER': {
      total: 10,
      failed: 2,
      items: [
        {
          assetId: 'SECRET-ASSET-123',
          type: 'Bunker Coat',
          q1: 'pass',
          q2: 'fail',
          failureNote: 'PRIVATE FAILURE NOTE',
          signatureLabel: 'PRIVATE SIGNATURE',
          evidence: 'PRIVATE EVIDENCE',
          verificationDiagnostics: { pageText: 'PRIVATE DOM CONTENT' },
        },
      ],
    },
  },
};

const aggregate = adapter.aggregateCompletedRun(summary);
assert.equal(aggregate.total, 10);
assert.equal(aggregate.failures, 2);
assert.equal(aggregate.passed, 8);
assert.equal(aggregate.durationMs, 10 * 60 * 1000);
assert.equal(aggregate.modeKey, 'tour');

const event = adapter.completedRunUsage(summary);
assert.equal(event.kind, 'usage');
assert.equal(event.program_key, 'vector-rebel');
assert.equal(event.action, 'ppe_run_completed');
assert.equal(event.success, true);
assert.equal(event.metadata.total, 10);
assert.equal(event.metadata.failures, 2);
assert.equal(event.metadata.passed, 8);
assert.equal(event.duration_ms, 10 * 60 * 1000);

const serialized = JSON.stringify(event);
for (const forbidden of [
  'PRIVATE INSPECTOR',
  'PRIVATE OWNER',
  'SECRET-ASSET-123',
  'PRIVATE FAILURE NOTE',
  'PRIVATE SIGNATURE',
  'PRIVATE EVIDENCE',
  'PRIVATE DOM CONTENT',
  'Bunker Coat',
]) {
  assert.equal(serialized.includes(forbidden), false, `telemetry leaked forbidden detail: ${forbidden}`);
}

const heartbeat = adapter.runtimeHeartbeat({
  version: '2.3.10',
  updateState: {
    checkedAt: '2026-09-13T18:11:00.000Z',
    successfulAt: '2026-09-13T18:11:00.000Z',
    error: '',
    manifest: { latestVersion: '2.3.10', minimumSupportedVersion: '2.3.1', status: 'testing' },
  },
  occurredAt: '2026-09-13T18:12:00.000Z',
});
assert.equal(heartbeat.kind, 'heartbeat');
assert.equal(heartbeat.connection_key, 'vector-rebel-runtime');
assert.equal(heartbeat.version, '2.3.10');
assert.equal(heartbeat.status, 'connected');

const update = adapter.updateUsage({
  checkedAt: '2026-09-13T18:11:00.000Z',
  successfulAt: '2026-09-13T18:11:00.000Z',
  error: '',
  manifest: { latestVersion: '2.3.10', minimumSupportedVersion: '2.3.1', status: 'testing' },
}, '2.3.10');
assert.equal(update.action, 'update_check_succeeded');
assert.equal(update.success, true);

const suggestion = adapter.suggestion({
  key: 'vector-rebel:suggestion:test',
  version: '2.3.10',
  title: 'Reduce updater noise',
  content: 'Consider reducing duplicate updater notices.',
  priority: 'low',
});
assert.equal(suggestion.kind, 'suggestion');
assert.equal(suggestion.status, 'new');
assert.equal(suggestion.source_program, 'Vector Rebel');

console.log('vector-rebel-telemetry-adapter: PASS');
