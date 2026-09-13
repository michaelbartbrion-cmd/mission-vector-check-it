# Overtime Forecast — Rebel Command

## Ownership

This capability belongs to **Mission Vector Check It**. Rebel Command is the user-facing overtime forecast surface. The Vector Scheduling page is only a read-only data source.

## Architecture

```text
Vector Scheduling ListView
        |
        | rendered-DOM read only
        v
Vector Staffing Collector userscript
        |
        | authenticated raw staffing capture
        v
Rebel Core / Rebel Command
        |
        +--> StaffingCaptureBatch
        +--> StaffingObservation
        +--> StaffingForecast
        v
Rebel Command > Overtime Forecast
```

Direct Vector API access is intentionally not part of the operational design. The collector works from the same rendered scheduling information Michael can see in Vector.

## Staffing rule

Current minimum operational staffing: **36**.

A regular baseline employee counts when the rendered schedule row represents `Salary Step [1010]` for a full **24-hour** shift. The server de-duplicates regular employees before calculating the daily total.

The following do not count toward baseline regular staffing:

- command/day staff or non-24-hour shifts
- leave/time off
- `Sub [1010]`, trades, swaps, or substitute coverage
- overtime / force-hire / backfill / additional-time rows
- disaster-relief/deployment rows
- open slots

Daily calculation:

```text
over_under = regular_24h_staff - 36
likely_ot_slots = max(0, 36 - regular_24h_staff)
```

A negative `over_under` means a likely staffing shortage. This is a forecast, not proof that overtime has actually been offered.

## Michael eligibility

Michael's regular shift is **C**. Rebel Core derives the A/B/C day from the stored shift-cycle rule. A shortage on Michael's regular C-shift workday is retained for department awareness but is marked unavailable to Michael.

## Fail-closed capture rules

A partial DOM read must never manufacture an overtime opening. A capture is eligible for `good` quality only when all current safety gates pass, including:

- confident schedule-date identification
- stable page
- no loading indicator
- completed scroll sweep of the schedule list
- all visible schedule groups scanned
- plausible minimum number of captured schedule rows
- plausible minimum number of regular 24-hour candidate rows
- plausible minimum number of assignment groups

Anything failing these checks is stored as evidence but Rebel Command shows **Verify data** and does not expose its shortage count as a trusted OT opening.

## Collector

Beta userscript:

`beta/vector-staffing-collector.user.js`

The collector intentionally has almost no UI. A small status pill is used only for pairing and basic health. Overtime results belong in Rebel Command.

The collector stores only its Rebel Command device pairing in Vector-domain browser storage. It does not contain a Vector API credential and does not modify the Vector schedule.

## Live validation gate

Before treating this feature as operational, complete one live comparison:

1. Install/pair the collector.
2. Open a known complete Vector Scheduling ListView day.
3. Let the collector perform a full census.
4. Compare the collector's row/group counts and computed regular 24-hour count to the visible Vector roster.
5. Confirm excluded row types are not counted.
6. Confirm Rebel Command marks the capture `good` only when the full roster was actually read.
7. Confirm a partial/aborted read displays `Verify data` rather than a shortage.

Do not promote the collector from beta until this gate passes.
