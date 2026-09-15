# Mission Vector Check It — Staffing Integrity Rule Revision — 2026-09-15

## Authoritative minimum

Minimum staffing remains **36**.

A person may count toward the regular-duty minimum only when Rebel Core has a verified CrewSense rendered-page observation that is associated with a specific assignment group (`row+group`) and represents regular Work Shift + Salary Step `[1010]` duty covering the duty day. Verified split-duty fragments may be interval-unioned so the same employee counts once.

Rows are excluded from the regular minimum when they represent command/day staff (including Battalion/BC command assignments), leave/time off, trade/sub coverage, OT signup/force-hire/backfill, additional time, deployment/disaster/TIFMAS/EMTF, or other non-regular duty.

## Why the rule was revised

The rendered CrewSense ListView can expose ungrouped text fragments where adjacent names are concatenated, for example apparent values such as `West Goldsberry John McLemore`. Those rows are useful as evidence but are not reliable enough to identify one regular employee or apparatus assignment. They must not contribute to the 36-person count.

CrewSense can also glue display badges to names, such as `Robert Brooks TADESWING`. Rebel Core now normalizes known suffixes (`TADESWING`, `TACSWING`, `FTOSWING`) for person identity/matching while preserving the original rendered text as evidence.

## Fail-closed implementation

The server now independently derives the number of verified assignment groups from sanitized `row+group` observations. A client-reported group count alone cannot make a capture trusted.

A capture may be marked good only when all existing page/date/scroll stability checks pass and the sanitized evidence also contains at least 24 schedule rows, at least 20 unique regular-duty candidates, and at least 6 verified assignment groups.

The current staffing-rule revision boundary is:

`2026-09-15T17:55:00Z`

Staffing captures before that boundary remain historical evidence but cannot satisfy the corrected sync. StaffingForecast and OvertimeSelectionForecast records derived under the previous rule were demoted from trusted status. Rebel Command must rebuild them from a fresh post-revision CrewSense capture.

## Action safety

Schedule action preflight requires a fresh, good staffing census captured after the current rule-revision boundary. Overtime action preflight also requires that its referenced StaffingForecast still exists as trusted `good` evidence.

Until corrected captures rebuild the forecasts, the correct UI state is `needs trusted staffing` / `insufficient data`; it is intentionally preferable to a confident but potentially inflated overtime prediction.

## Runtime state

CrewSense loader `1.0.4` and manifest/module runtime `0.30.0-dev` have been observed in authenticated diagnostics. Runtime 0.30 keeps normal data collection read-only and isolates experimental schedule input in the assisted-input lab. Automated Vector writes remain disabled.
