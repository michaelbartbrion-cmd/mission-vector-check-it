# Vector Scheduling precision activity model

Status: development design for Mission Vector Check It.

## Authority boundary

Vector Scheduling owns Truck 504 riding-position verification, ratio accounting, and forward assignment planning.

Rebel Command is the Mission Vector Check It management/monitoring application. Rebel Core is the central Mission Vector Check It data layer. Rebel Core may store factual Vector activity and role hints, but it does not independently decide final Truck 504 ratio credit.

## C Shift rule

Confirmed C Shift anchors:

- 2026-09-10 = Day 1
- 2026-09-11 = Day 2
- repeat 2 days on / 4 days off

Only C-shift riding-position activity is eligible to affect Truck 504 balancing ratios.

Activity outside C Shift is still retained when available, including overtime, subs, training, deployments, special assignments, leave, and other Vector work history. Off-shift activity is informational unless an explicit future rule says otherwise.

## Ratio eras

Ratio history is divided into eras. Starting a new ratio era does not delete prior history. It changes the lower boundary used for current balancing calculations.

Current imported era start: 2025-09-30.

## Partial-day precision

The system must not force a 24-hour label when Vector shows multiple assignments within a shift. It records individual duty segments with:

- date
- person
- assignment group/apparatus
- start time
- end time
- duration
- Vector duty code
- raw evidence
- role hint
- capture timestamp
- verification state

Example: if a firefighter covers the engineer seat for five hours and a normal firefighter seat for nineteen hours, the factual ledger should preserve both segments rather than silently treating the whole day as one assignment.

Precision accounting and seat continuity are separate concepts. Forward planning should still strongly prefer leaving the normal three firefighters in the same seats across the two consecutive C-shift days when staffing allows.

## Role-hint rules

Role hints are aids for reconciliation, not final ratio credit.

For the three tracked firefighters:

- Truck 504 `TM` -> Tiller hint.
- Truck 504 `FF`, `FFA`, or `FFB` -> Firefighter hint.
- Truck 504 `DE`, `DE-A`, or explicit `TADE` -> TADE hint.
- A different apparatus group such as another Truck/Engine/Medic/Quint -> Swing hint.
- Deployment, Training, Employees Off, etc. remain their factual activity category and do not automatically receive a riding-position credit.

Do not infer Swing merely from a `SWING` token in the row text. Historical evidence shows a tracked firefighter can have `SWING` in the row while still serving another Truck 504 seat. Actual apparatus/group and reconciliation evidence take precedence.

For command staff, DE/DE-A remains Engineer context and TAC remains Temporary Captain context; those are not firefighter ratio categories.

## Swing accounting

User-defined rule: assigned-to-Swing and actually swinging are the same ratio category. `Swing/FF` means the firefighter was up for Swing but remained at Truck 504 as a firefighter because no move was required. Vector history alone may not always prove the `Swing/FF` planned state; plan/history evidence can supply that information during reconciliation.

## Current capture safeguards

The reader rejects obvious account/navigation-menu false matches that contain the employee name but no operational time range. This addresses historical false positives such as the logged-in user's sidebar/profile menu being mistaken for a schedule row on an off day.

The precision extractor records all same-person duty segments found within an assignment-group context. This is specifically intended to capture days where a person changes seats during the shift.

## Rebel Core storage

Rebel Core stores both summary-level observations and precision segment records. Precision records use distinct activity keys and `record_granularity = segment` so future analysis can avoid double-counting summary records.

`affects_riding_ratio` remains false for raw telemetry. Vector Scheduling must reconcile and verify final ratio credit before that factual evidence becomes ratio accounting.

## Release gate

Before routine use:

1. Validate segment extraction on real partial-day Vector dates.
2. Confirm no account/navigation false matches remain.
3. Complete the current ratio-period C-shift backfill.
4. Compare reconciled results against the legacy spreadsheet where both sources overlap.
5. Validate one real browser -> Rebel Core telemetry round trip.
6. Keep all Vector interactions read-only until separately authorized.
