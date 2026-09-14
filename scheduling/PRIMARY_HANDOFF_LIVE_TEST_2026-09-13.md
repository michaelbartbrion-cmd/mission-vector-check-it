# Mission Vector Check It — Scheduling/Overtime live-test handoff

Date: 2026-09-13

This file is a sanitized handoff for Mission Vector Check It - PRIMARY. It contains no pairing secrets and no private roster dump.

## Architecture now verified in live testing

- One small Vector-side bridge is the shared ListView scraper/inputter.
- Rebel Command is the management UI for Scheduling, Overtime, Vector Rebel usage/comments, and future Mission Vector Check It programs.
- Rebel Core is the centralized data layer.
- C Shift / Station 4 / Truck 504 and Medic 504 are the controlled Scheduling scope.
- C-shift work elsewhere is factual history / staffing override evidence.
- Work outside C Shift is informational only and must not affect the Station 4 scheduler.
- Vector writes remain disabled during scraper/input validation.

## Unified ListView bridge round trip — VERIFIED

On the 2026-09-11 ListView (C Shift Day 2), the unified bridge successfully paired to canonical Rebel Command and completed a department-wide scrape.

First browser result:

- 70 captured rows
- 35 regular 24-hour candidates
- 15 assignment groups
- capture quality reported `good`

The first capture exposed false-positive navigation/menu rows and several parser issues. After parser hardening, the same date was re-scraped.

Second browser result:

- 61 captured rows
- 35 regular 24-hour candidates
- 15 assignment groups
- capture quality reported `good`

Rebel Core was queried immediately after the retest. The nine false menu/navigation rows were gone while legitimate staffing totals remained unchanged.

The retest also verified:

- person names are separated from Vector duty/status suffixes;
- duty codes are preserved independently, including multi-token labels;
- fractional durations such as hours-plus-minutes are preserved correctly;
- Truck 504 and Medic 504 are recognized as Station 4-controlled units only when the date is C Shift;
- off-C-shift activity is stored as factual history but does not affect the Station 4 scheduler.

This proves the live path:

Vector ListView -> unified bridge -> authenticated Rebel Command telemetryBridge -> Rebel Core

## Staffing rule used for overtime forecasting

The current authoritative Rebel Command staffing rule is:

- minimum staffing = 36;
- count unique employees with Work Shift + Salary Step [1010] + 24 hours;
- exclude command/day staff, leave/time off, trades/sub coverage, OT sign-up/force hire, and additional-time/backfill rows.

Vector's visible Staffing Count Report has a broader `Total Count` and must not be substituted for this rule without an explicit rule change.

## First off-C-shift overtime census — VERIFIED

The 2026-09-14 ListView was captured as an off-C-shift date.

Browser / Rebel Core result:

- 53 captured rows
- 35 regular 24-hour employees under the configured staffing rule
- 13 assignment groups
- date correctly treated as off C Shift
- Station 4 rows did not affect C-shift scheduling balances
- two OT Sign-up rows captured

The resulting staffing forecast is:

- minimum = 36
- regular staff = 35
- over/under = -1
- likely OT slots = 1
- Michael is eligible because this is not a C-shift workday

## OT Sign-up parser — VALIDATED

A live screenshot of the 2026-09-14 Vector ListView Overtime Sign Up section was compared against Rebel Core.

The two captured signup names exactly matched the two displayed signup rows. The signup parser has therefore been marked verified in Rebel Core, and the validated 2026-09-14 signup batch has been promoted to `good` quality.

The yellow `Open Slot` rows shown under the Overtime Sign Up section are signup-capacity placeholders and are not department staffing vacancies.

## Global OT ranking collector — VALIDATED

The OT Priority Collector was moved beside the CrewSense forecast-date controls and updated to reuse the existing Scheduling bridge pairing automatically. A second pairing is no longer required.

Collector version validated: `0.3.0`.

A live 2026-09-14 Global OT List capture reached Rebel Core with:

- 130 ranking rows
- ranks sequential from 1 onward
- unique names
- overtime hours captured
- tie-break text captured
- Michael's ranking row present

The ranking parser has been marked verified. The validated 2026-09-14 ranking batch has been promoted to `good` quality despite the collector's conservative completeness diagnostic, because the live baseline was manually checked and the resulting 130-row sequence was complete and internally consistent.

## First fully validated overtime-selection baseline

Rebel Core now has matching, validated inputs for 2026-09-14:

- staffing forecast
- OT signup batch
- Global OT ranking batch

The resulting baseline selection forecast is marked `good` with status `not_signed_up` for Michael.

Key result:

- 1 likely OT slot
- 2 people signed up
- the higher-priority signed-up employee is inside the likely cutoff
- Michael was not signed up
- if Michael had signed up, his Vector rank would place him ahead of both captured signups

This is the first complete end-to-end overtime prediction proof using matching-date Vector staffing, signup, and ranking evidence.

## Parser and UI fixes completed during testing

### Shared Vector bridge

The shared bridge file `scheduling/vector-scheduling-runtime-unified-bridge-0.20.0.js` carries internal bridge version `0.20.2-dev`.

Validated improvements:

- require an actual time range for candidate schedule rows;
- reject menu/navigation text that merely contains staffing keywords;
- strip Vector one-letter status suffixes from employee names;
- extract trailing duty-code tokens separately, including multi-token duty combinations;
- strip small trailing numeric display/rank markers from names after role parsing;
- parse minute components in stated durations.

### Scheduling live loader

- LIVE Loader upgraded to `1.0.3`.
- Loader now continues loading remaining modules if one module fails and publishes real loader/runtime diagnostics.
- Current runtime observed during testing: `0.21.1-dev`.

### OT Priority Collector

- upgraded to `0.3.0`;
- reuses Scheduling bridge pairing automatically;
- no second pairing workflow;
- control moved beside the Global OT List forecast-date controls;
- captured validated 130-row ranking baseline.

## Coordination / merge point

Scheduling and Overtime development are now using the same:

- Vector interface
- Rebel Command app
- Rebel Core database
- telemetry bridge
- runtime branch

Vector Rebel is also already using Rebel Command for telemetry/usage work in PRIMARY.

This is now the recommended merge point: Mission Vector Check It - PRIMARY should become the single coordinating development thread for Vector Rebel + Scheduling + Overtime integration work. This development chat should be treated as historical/reference after PRIMARY accepts the handoff.

Do not create another command-center app or competing database. Canonical control center remains Rebel Command and canonical data layer remains Rebel Core.

## Next engineering work after PRIMARY accepts handoff

1. Keep the unified bridge as the small Vector-side surface.
2. Move future planning and overtime prediction logic into Rebel Command, not the Vector panel.
3. Continue collecting off-C-shift activity as factual history only.
4. Improve assignment classification for deployments/disaster activity and trade/sub rows.
5. Add the Overtime Predictor as a producer of approved `overtime_signup` action packages.
6. Add Scheduling as a producer of approved schedule action packages.
7. Validate preview -> single write -> re-read -> verification before enabling any Vector write action.
8. Fold Vector Rebel comments/suggestions and usage telemetry into the same Rebel Command program/health model.

## Safety boundary

- No Vector write automation is enabled.
- INPUT SCHEDULE and INPUT OT SIGNUPS remain preview/disabled until separately validated.
- Pairing credentials remain local/private and are not stored in this repository.
- Existing PPE helper must not be removed as part of Scheduling/Overtime consolidation.
