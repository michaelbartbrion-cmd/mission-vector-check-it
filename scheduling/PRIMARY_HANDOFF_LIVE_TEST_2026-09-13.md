# Mission Vector Check It — Scheduling/Overtime live-test handoff

Date: 2026-09-13

This file is a sanitized handoff for Mission Vector Check It - PRIMARY. It contains no pairing secrets and no private crew roster details.

## Architecture now being tested

- One small Vector-side bridge is the shared ListView scraper/inputter.
- Rebel Command is the management UI for Scheduling, Overtime, Vector Rebel usage/comments, and future Mission Vector Check It programs.
- Rebel Core is the centralized data layer.
- C Shift / Station 4 / Truck 504 and Medic 504 are the controlled Scheduling scope.
- C-shift work elsewhere is factual history / staffing override evidence.
- Work outside C Shift is informational only and must not affect the Station 4 scheduler.
- Vector writes remain disabled during scraper validation.

## First live unified bridge round trip — VERIFIED

On the 2026-09-11 ListView (C Shift Day 2), the unified bridge successfully paired to canonical Rebel Command and completed a department-wide scrape.

Browser result:

- 70 captured rows
- 35 regular 24-hour candidates
- 15 assignment groups
- capture quality reported `good`

Rebel Core was queried immediately after the scrape and contained exactly 70 `StaffingObservation` records from that capture batch. This proves the live path:

Vector ListView -> unified bridge -> authenticated Rebel Command telemetryBridge -> Rebel Core

The same capture correctly identified Truck 504 and Medic 504 as Station 4 controlled units.

## Parser issues exposed by first live data

The round trip is operational, but the first parser was too permissive to be treated as production-quality forecasting input.

Observed problems:

1. Navigation/menu strings containing words like Time Off / Swap / Leave were incorrectly accepted as schedule rows.
2. Person names retained Vector duty/status suffixes instead of separating them cleanly.
3. Duty codes were therefore often blank.
4. Multi-token duty labels (for example Swing plus firefighter-position codes, temporary-role combinations, or FTO combinations) need to remain separate from the employee name.
5. Explicit durations such as `4 hrs 15 min` and `3 hrs 30 min` were being reduced to whole hours.
6. The quality gate can say `good` even if syntactically plausible false-positive rows are present; after parser hardening the next live capture must be compared again before the overtime forecast is trusted.

## Parser hardening committed after first live capture

The shared bridge file `scheduling/vector-scheduling-runtime-unified-bridge-0.20.0.js` was updated after the live test. Its internal bridge version is now `0.20.2-dev`.

Changes:

- require an actual time range for a candidate schedule row;
- reject menu/navigation text that merely contains staffing keywords;
- strip Vector one-letter status suffixes from employee names;
- extract trailing duty-code tokens separately, including multi-token duty combinations;
- strip small trailing numeric display/rank markers from names after role parsing;
- parse minute components in stated durations.

Commit: `33cf9879059b63c2cdfc6b85577ff00d318d14e9`

A new live scrape is required to validate these fixes.

## Important coordination finding

While this live test was underway, the same scheduling feature branch was also changed by other Mission Vector Check It work. The current manifest observed after the test is `0.21.1-dev` and includes `rebel-core-scheduling-sync-0.21.0.js` plus newer reconciliation work.

That means Scheduling/Overtime development and PRIMARY are now actively touching the same runtime branch and the same Rebel Command architecture. This is the point where development coordination should move into Mission Vector Check It - PRIMARY to avoid competing manifests or duplicate integration logic.

Do not overwrite newer PRIMARY manifest changes merely to change the runtime number. The hardened unified bridge file can load under the newer manifest because its path is unchanged and the live loader cache-busts runtime downloads.

## Next live validation

1. Refresh/update Vector so the current manifest loads the hardened unified bridge.
2. Re-scrape 2026-09-11.
3. Confirm row count drops by removing false menu/navigation entries.
4. Confirm employee names no longer include status/duty suffixes.
5. Confirm duty-code fields populate independently.
6. Confirm fractional stated durations are preserved.
7. Query Rebel Core and compare the latest batch only.
8. Only after this clean C-shift capture, test a future/off-C-shift date for overtime forecasting.

## Safety boundary

- No Vector write automation is enabled.
- INPUT SCHEDULE and INPUT OT SIGNUPS remain preview/disabled until separately validated.
- Pairing credentials remain local/private and are not stored in this repository.
