# Mission Vector Check It — PRIMARY range sync and planning state

Date: 2026-09-14

Authority remains `Mission Vector Check It - PRIMARY`.

## User-facing direction

CrewSense uses one Vector Rebel-style Mission Vector `V` control. Current PRIMARY runtime is `0.25.2-dev` under LIVE Loader `1.0.3`. It provides smart read-only `Sync Past + Future Range`, single-date staffing/OT collection, and the existing action-preview/input controls.

Rebel Command treats Scheduling and Overtime as range-based operating views rather than single-date diagnostics.

## Configurable ranges

Rebel Core `SystemSetting` defaults:

- `riding_tracking_start_date = 2025-09-30`
- `schedule_planning_horizon_days = 35`
- `overtime_horizon_days = 60`
- `auto_range_sync_enabled = true`
- `auto_range_sync_recent_past_days = 21`
- `auto_range_sync_max_dates_per_session = 18`

The riding tracking date controls Rebel Command history/balance display and browser sync planning. It does not silently rewrite the active RatioEra.

## Scheduling view

Scheduling now includes:

- editable riding-history start date and future planning horizon;
- clickable Station 4 crew cards;
- detailed per-person chronological records from verified RidingCredit, VectorActivity, and latest ListView staffing observations;
- a forward C-shift board for roughly one month;
- expected-at-work status from the latest trusted future census;
- horizon-aware rotation suggestions for the three tracked firefighters using the existing Firefighter/Tiller/Swing fairness model;
- no invented Captain/Engineer assignment rule — command/engineer remain factual and officer/policy controlled;
- the existing plan → approval → atomic action-package workflow.

Suggestions are projections only and never create actual riding credit.

## Overtime view

Overtime includes every day in the configured rolling horizon, including dates not yet scanned. Each day can be marked WANT, MAYBE, or SKIP.

Preferences are stored in `OvertimePreference`. A draft OT signup package is only offered after Michael explicitly marks the date WANT and trusted staffing + selection evidence indicates an eligible OT opportunity. A preference never signs Michael up by itself.

## Smart range sync

Authenticated bridge GET `?action=range-sync-plan` returns only non-sensitive range configuration, latest capture dates/quality, and known likely-OT dates needing a ranking refresh.

Runtime layers:

- `0.25.0`: bounded range queue and navigation.
- `0.25.1`: queued-action safety hold and post-range reconciliation/Core sync.
- `0.25.2`: per-tab range-queue isolation and one-tab-only automatic crawl protection.

The bounded queue prioritizes:

1. recent past C-shift dates to detect changed riding history;
2. near-future C-shift dates to support Station 4 planning;
3. a rotating slice of older C-shift history from the tracking-start date;
4. a rotating slice of all future dates across the OT horizon;
5. Global OT ranking only where trusted staffing indicates likely OT and ranking data needs refresh.

The queue is capped by `auto_range_sync_max_dates_per_session` (default 18). Cursors rotate older/future coverage so repeated CrewSense sessions progressively cover the configured range instead of hammering every date on every login.

Auto range sync is enabled by default. It attempts once per browser-tab session, but runtime `0.25.2` gives each CrewSense tab its own navigation queue and uses a short cross-tab lease so only one simultaneously open CrewSense tab auto-starts. Other tabs retain all manual Mission Vector controls. This is important because Michael commonly keeps multiple CrewSense/ListView/Callback tabs open.

A visible Stop Range Sync control is provided.

### Action-safety hold

Before automatic range crawling begins, runtime `0.25.1+` checks the authenticated Vector action worklist. If a queued or writing Scheduling/OT package is waiting, automatic range navigation is held so the browser is not pulled away from an active input/verification workflow.

### Post-range reconciliation

When a range crawl completes, runtime `0.25.1+` asks the existing reconciliation module to reevaluate newly collected evidence and then asks the existing Rebel Core Scheduling sync module to push newly derived cases/records. Changed past evidence may create a reconciliation case; raw scrape evidence never silently becomes riding credit.

## OT ranking completeness correction

The server ranking gate no longer rejects an otherwise complete ranking solely because the collector's own status-UI mutation toggled MutationObserver-based `pageStable` after a full sweep. Trusted ranking still requires browser `captureComplete`, no loading indicator, high date confidence, at least 80 rows, sequential ranks, unique names, Michael present, and the verified parser flag. The proven 130-row Global OT List shape should therefore become `good` on the next fresh collection when all structural gates pass.

## Safety boundary

Range sync is read-only.

Scheduling/OT automated Vector writes remain disabled. Input controls still use:

preview → user performs one approved manual Vector change → record manual write → fresh reread → verified/mismatch.

No fake operational package was created during this implementation and no overtime signup or schedule change was made on Michael's behalf.
