# Vector Scheduling Assistant data model

## State schema v2

```text
settings
  apparatusName
  firefighters[]
    id
    name
    kind=firefighter
  command[]
    id
    name
    kind=command
    commandRole     # engineer | captain | other
  scenarioDefault   # auto | normal | tade-required
  balanceStartDate
  balanceEndDate
  blockDays         # 1 | 2
  autoCaptureOnSchedulePages

history[]
  date
  shift
  personId
  detail
  credit            # Firefighter | Swing | Tiller | TADE
  verified
  source
  observedAt
  planCredit

dutyHistory[]
  date
  personId
  detail            # exact historical five-person duty/status detail
  source

plans[]
  date
  personId
  credit
  scenario
  blockStartDate
  createdAt
  source

observations[]
  date
  shift
  personId
  personName
  capturedAt
  rawText
  dutyCode
  assignment
  found
  source

reviews[]
  date
  personId
  observationCapturedAt
  planCredit
  status
  detail
  credit
  reason
  source

resolutions[]
  date
  personId
  resolutionDetail
  credit
  resolvedAt
  source

metadata
  createdAt
  updatedAt
  lastCaptureAt
  lastImportAt
```

## Source-of-truth hierarchy

1. **Vector Scheduling** is authoritative for what was scheduled/observed in Vector.
2. A saved **plan** records assignment intent but never becomes history just because it was planned.
3. **Reconciled history** records the firefighter rotation credit after comparing the plan to the observed Vector outcome.
4. `dutyHistory[]` preserves historical five-person duty/status detail but does not itself alter firefighter fairness ratios.
5. Ambiguous outcomes remain **Needs Review** and do not silently affect ratios.

## Why plan and outcome are separate

A Swing turn can produce two operational outcomes:

- `Swing`: the assigned Swing firefighter actually leaves the home apparatus.
- `Swing/FF`: the assigned Swing firefighter is not needed elsewhere and remains on the home apparatus as a firefighter.

Both are Swing credit because the rotation turn was Swing. Without the pre-shift plan, an FFB on the home apparatus is not enough evidence to distinguish Firefighter from Swing/FF.

Likewise, a firefighter observed working elsewhere without a saved plan may have been the planned Swing firefighter or may have been moved for staffing. The system therefore refuses to infer Swing credit from that observation alone.

## Legacy spreadsheet migration

Private migration data may use manually coded historical rows as verified legacy history and later raw Vector report rows as observations/availability rather than pretending raw rows contain position outcomes.

The current migration path preserves all manually coded five-person status/duty details in `dutyHistory[]`, while only recognized firefighter rotation outcomes become `history[]` credits.

The migration intentionally stops when the legacy Truck 504 sheet changes into raw Vector-report lookup values such as schedule assignment labels. Those rows must be reconciled from actual Vector evidence instead of being converted into rotation credit.

## Historical completeness guard

The browser helper compares stored past observations with credited history inside the active balance window. If a firefighter was observed working at the home apparatus or elsewhere but no rotation credit has been reconciled for that person/date, the date is flagged as an unresolved historical gap.

Recommendations remain available, but are visibly marked **PROVISIONAL** until the gaps are resolved. This prevents missing recent shifts from silently masquerading as complete history.

## Automatic scenario inference

The development browser helper may use the configured command engineer as a planning input:

- engineer observed available on the home apparatus in normal engineer capacity -> default Normal scenario;
- engineer observed off/working elsewhere -> default TADE-required scenario;
- engineer observed in an acting captain role such as `TAC` -> default TADE-required scenario.

This inference is only a planning convenience and remains manually overrideable. It does not create Vector assignments.

## Manual review resolution

When Vector evidence is not sufficient to infer a rotation outcome safely, the panel presents explicit review choices: `Firefighter`, `Swing/FF`, `Swing`, `Tiller`, `TADE`, or `No credit`.

A manual resolution records an audit entry in `resolutions[]`. Credited choices replace any prior credited row for that person/date rather than adding a duplicate.

## Privacy boundary

The public repository contains only generic configuration examples and code. Real crew names, historical duty data, future schedules, observations, plans, and API credentials remain in private local imports/browser storage and must not be committed.
