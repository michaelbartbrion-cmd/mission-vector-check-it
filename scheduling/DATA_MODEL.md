# Vector Scheduling Assistant data model

## State

```text
settings
  apparatusName
  firefighters[]
  command[]
  scenarioDefault
  balanceStartDate
  balanceEndDate

history[]
  date
  shift
  personId
  detail
  credit
  verified
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

resolutions[]
  date
  personId
  resolutionDetail
  credit
  resolvedAt
  source
```

## Source-of-truth hierarchy

1. **Vector Scheduling** is authoritative for what was scheduled/observed in Vector.
2. A saved **plan** records assignment intent but never becomes history just because it was planned.
3. **Reconciled history** records the rotation credit after comparing the plan to the observed Vector outcome.
4. Ambiguous outcomes remain **Needs Review** and do not silently affect ratios.

## Why plan and outcome are separate

A Swing turn can produce two operational outcomes:

- `Swing`: the assigned Swing firefighter actually leaves the home apparatus.
- `Swing/FF`: the assigned Swing firefighter is not needed elsewhere and remains on the home apparatus as a firefighter.

Both are Swing credit because the rotation turn was Swing. Without the pre-shift plan, an FFB on the home apparatus is not enough evidence to distinguish Firefighter from Swing/FF.

## Legacy spreadsheet migration

Private migration data may use manually coded historical rows as verified legacy history and later raw Vector report rows as observations/availability rather than pretending raw rows contain position outcomes.

## Historical completeness guard

The browser helper compares stored past observations with credited history inside the active balance window. If a firefighter was observed working at the home apparatus or elsewhere but no rotation credit has been reconciled for that person/date, the date is flagged as an unresolved historical gap.

Recommendations remain available, but are visibly marked **PROVISIONAL** until the gaps are resolved. This prevents missing recent shifts from silently masquerading as complete history.

## Manual review resolution

When Vector evidence is not sufficient to infer a rotation outcome safely, the panel presents explicit review choices: `Firefighter`, `Swing/FF`, `Swing`, `Tiller`, `TADE`, or `No credit`.

A manual resolution records an audit entry in `resolutions[]`. Credited choices replace any prior credited row for that person/date rather than adding a duplicate.
