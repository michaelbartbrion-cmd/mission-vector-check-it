# Ratio periods and autonomous historical backfill

## Intended operating model

Michael should not have to manually maintain the Truck 504 riding-assignment ledger.

The intended steady-state workflow is:

1. The program is given read access to Vector Scheduling.
2. It scans the active ratio period historically and confirms actual Truck 504 riding-position outcomes.
3. It reconciles partial-day changes when Vector evidence provides times/durations.
4. It flags only genuinely ambiguous or special circumstances for Michael.
5. It uses confirmed actual exposure plus future staffing/time-off evidence to recommend/program the next several shifts.
6. After those shifts occur, it reads Vector again, verifies what really happened, corrects the ledger, and replans.

Michael's normal role is supervisory: maintain access, explain exceptional staffing circumstances when necessary, and verify that the program is behaving correctly.

## Ratio eras

Truck 504 ratios periodically restart because crew composition or operating circumstances change.

A reset does **not** delete historical records. Instead, it closes one ratio era and opens another.

Each ratio era stores:

- `startDate` — first day counted in that ratio;
- `endDate` — last day counted, or null for the active era;
- creation timestamp/source/reason when known.

The recommendation engine uses the active era only. Older eras remain available for audit, historical analysis, regression testing, and comparison.

The development UI exposes **Start new ratio period**. Because the legacy engine's lower boundary is exclusive, the UI stores the human-facing inclusive `ratioStartDate` and translates it to the prior day in `balanceStartDate` for engine compatibility.

## Historical backfill priority

Preferred evidence order:

1. official read-only Vector Scheduling API across the entire requested date range;
2. ListView historical schedule evidence;
3. Schedule view, including locked historical pages, as corroborating evidence;
4. legacy spreadsheet manual history for periods that predate validated Vector acquisition.

The system should not require Michael to click every date individually once a reliable API or browser reader is validated.

## Partial-day precision

A person can hold multiple positions within one 24-hour shift. The future precision ledger should represent time exposure as fractions of a shift-equivalent.

Example: 19 hours Firefighter + 5 hours TADE = 19/24 Firefighter + 5/24 TADE = 1.0 total shift-equivalent.

This is separate from **seat continuity**. The planner should still prefer keeping normal riding assignments unchanged across the two consecutive C-shift days when staffing permits, while the exposure ledger records temporary deviations precisely.

Swing remains intent-sensitive: a firefighter assigned as the Swing person for the whole shift receives the Swing turn even if they remain at Truck 504 as `Swing/FF`. A short temporary reassignment can instead be recorded as fractional exposure when the evidence supports it.

## Special circumstances

Staffing can produce unusual combinations, including TADE even while the normal engineer and captain are present. The software must not invent a universal rule for these cases. It should use observed Vector evidence and saved intent when available, and surface ambiguous events for human explanation/review.
