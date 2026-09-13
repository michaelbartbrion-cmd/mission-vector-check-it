# Rebel Core telemetry contract

Status: development contract for Mission Vector Check It.

## Canonical ownership

- Management application: **Rebel Command**
- Central Mission Vector Check It data layer: **Rebel Core**
- Specialized tools such as Vector Rebel and Vector Scheduling remain authoritative for their own workflow logic.
- Rebel Core collects shared telemetry, factual Vector activity, suggestions, health, scheduling plans/credits, and exception records. It does not silently take ownership of specialized program logic.

## Security model

A browser is paired from Rebel Command using a one-time JSON payload:

```json
{
  "endpoint": "https://<rebel-command-host>/functions/ingestTelemetry",
  "deviceId": "<device-id>",
  "token": "<random-secret>"
}
```

The browser keeps the raw token locally. Rebel Core stores only the SHA-256 hash of that token.

Requirements:

- Never commit the raw token to GitHub.
- Never put the raw token in normal logs, diagnostics, exports, suggestions, or usage records.
- Never send Vector credentials, cookies, passwords, arbitrary page snapshots, or keystrokes to Rebel Core.
- Telemetry must fail open: Rebel Core outages must not block the operational Vector tool.
- Use `credentials: "omit"` for paired telemetry requests.

## Request format

`POST` the paired endpoint with header:

`x-rebel-device-key: <raw pairing token>`

and JSON body containing either one event object or:

```json
{
  "events": [ ... ]
}
```

Batch at most 100 events in one request. Smaller batches are preferred for browser tools.

## Common event fields

Where useful:

- `kind`
- `program_key`
- program/version/module
- event/action
- timestamp
- success/failure
- duration
- concise details/error
- stable idempotency key for records that may be retried

## Supported event kinds

### heartbeat

Connection/program health. Important fields:

- `connection_key`
- `name`
- `type`
- `component`
- `status`: connected | degraded | disconnected | error | unknown
- `version`
- `occurred_at`
- `details`

Heartbeats should be useful but not noisy. Do not emit a new health-event record on every heartbeat.

### usage

Non-invasive program-use telemetry:

- `program_key`
- `program_name`
- `action`
- `event_type`
- `module`
- `version`
- `details`
- `duration_ms`
- `success`
- `occurred_at`
- optional small metadata object

Never record keystrokes or arbitrary page contents.

### suggestion

Vector Rebel improvement/suggestion inbox record:

- `suggestion_key`
- `source_program`
- `source_version`
- `title`
- `content`
- `status`: new | reviewing | accepted | rejected | implemented | archived
- `priority`: low | medium | high | critical
- `category`
- `source_context`

Rebel Command manages the suggestion lifecycle.

### vector_activity

Factual Vector work-history evidence. This does not by itself become scheduling ratio credit.

Important fields:

- `activity_key`
- `person_key`, `person_name`
- `activity_date`
- `duration_hours`
- `is_c_shift`, `c_shift_day`
- `activity_type`
- `assignment_group`, `apparatus`, `station`
- `duty_code`, `activity_code`, `pay_type`
- `source`, `source_view`
- `raw_text`
- `verified`
- `record_granularity`: summary | segment
- `segment_start_time`, `segment_end_time`
- `role_hint`
- `sequence_index`
- `source_observation_key`

`affects_riding_ratio` should remain false for raw activity telemetry. Final credit is a separate reconciled record.

### sync_run

Batch/backfill/synchronization history:

- `sync_key`
- `source`, `target`
- `status`: running | success | partial | error | stopped
- start/completion timestamps
- record counts
- concise error
- structured details

### health_event

Meaningful state transition/error/recovery:

- `event_key`
- `component`
- `status`: healthy | warning | error | offline | recovered | info
- `severity`
- `message`
- `occurred_at`, optional `resolved_at`
- `source`

Use stable keys or deduplication so repeated identical failures do not flood Rebel Command.

### scheduling_plan

Vector Scheduling forward plan only:

- `plan_key`
- block/shift date
- person
- `planned_credit`: Firefighter | Swing | Tiller | TADE
- expected assignment group
- scenario
- status
- source/timestamps

### riding_credit

Verified/reconciled balance ledger only:

- `credit_key`
- ratio-era key
- person/date
- category: Firefighter | Swing | Tiller | TADE
- `credit_value` (supports fractional precision)
- hours
- `source_type`: legacy | vector_verified | manual_resolution | planned_reconciliation
- source key
- verified
- resolution timestamp

Raw Vector role hints must never be silently promoted to `riding_credit` if Swing/FF or another ambiguity remains possible.

### reconciliation_case

Exception/Ready Room record:

- `case_key`
- shift date/person
- `issue_type`: missing | ambiguous | plan_mismatch | partial_day | role_mapping | staffing_exception | other
- status: open | reviewing | resolved | ignored
- summary
- structured evidence
- proposed/resolved credit when applicable
- resolution notes

The goal is to keep routine work automatic and surface only real exceptions to Michael.

## Scheduling-specific rules

C Shift is anchored to:

- 2026-09-10 = Day 1
- 2026-09-11 = Day 2
- repeating 2 on / 4 off

Only C-shift riding-position credits affect Truck 504 balance. Off-shift OT, subs, training, deployments, leave and special assignments remain valuable factual history but are informational for balancing.

## Reliability expectations

Browser producers should:

- batch events when practical;
- retry with bounded/backoff behavior;
- keep bounded local queues/fingerprints;
- use stable record keys for idempotent upserts;
- discard telemetry rather than impairing the Vector workflow if storage limits are reached;
- expose a small connection status, not a full Rebel Command management UI inside Vector.
