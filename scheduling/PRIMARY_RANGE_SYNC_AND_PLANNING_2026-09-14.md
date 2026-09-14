# Mission Vector Check It — PRIMARY range sync and planning state

Date: 2026-09-14

Authority remains `Mission Vector Check It - PRIMARY`.

## User-facing direction

CrewSense uses one Vector Rebel-style Mission Vector `V` control. Runtime `0.25.1-dev` provides a smart read-only `Sync Past + Future Range` workflow while retaining single-date staffing/OT collection and the existing action-preview/input controls.

Rebel Command now treats Scheduling and Overtime as range-based operating views rather than single-date diagnostics.

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
- detailed per-person chronological record assembled from verified RidingCredit, VectorActivity, and latest ListView staffing observations;
- a forward C-shift board for roughly one month;
- expected-at-work status from the latest trusted future census;
- horizon-aware rotation suggestions for the three tracked firefighters using the existing Firefighter/Tiller/Swing fairness model;
- no invented Captain/Engineer assignment rule — command/engineer are shown factually and remain officer/policy controlled;
- existing plan → approval → atomic action-package workflow remains intact.

Suggestions are projections only. They do not create actual riding credit.

## Overtime view

Overtime now includes every day in the configured rolling horizon, including dates not yet scanned.

Each day can be marked:

- WANT
- MAYBE
- SKIP

Preferences are stored in `OvertimePreference`. A draft OT signup package is only offered when Michael has explicitly marked the date WANT and trusted staffing + selection evidence indicates an eligible OT opportunity. A preference never signs Michael up by itself.

## Smart range sync

Authenticated bridge GET `?action=range-sync-plan` returns only the non-sensitive range configuration, latest capture dates/quality, and known likely-OT dates needing a ranking refresh.

Runtime `0.25.0-dev` provides the range queue. Runtime `0.25.1-dev` adds the action-safety and post-sync reconciliation layer.

The bounded queue prioritizes:

1. recent past C-shift dates (to detect changed riding history);
2. near-future C-shift dates (to support Station 4 planning);
3. a rotating slice of older C-shift history from the tracking-start date;
4. a rotating slice of all future dates across the OT horizon;
5. Global OT ranking only for dates where trusted staffing already indicates likely OT and ranking data needs refresh.

The queue is capped by `auto_range_sync_max_dates_per_session` (default 18). Cursors rotate the older/future coverage so repeated CrewSense sessions progressively cover the whole configured range instead of hammering every historical/future date on every login.

Auto range sync is enabled by default and attempts once per browser-tab session. The queue survives CrewSense page navigation and resumes after each rendered page is ready. A visible Stop Range Sync control is provided.

### Action-safety hold

Before the automatic range crawl begins, runtime `0.25.1-dev` checks the authenticated Vector action worklist. If a queued or writing Scheduling/OT package is waiting, automatic range navigation is held so the browser is not pulled away from an active input/verification workflow. Michael may complete/cancel the action and start range sync manually afterward.

### Post-range reconciliation

When a range crawl transitions from active to complete, runtime `0.25.1-dev` asks the existing reconciliation module to reevaluate newly collected evidence and then asks the existing Rebel Core Scheduling sync module to push any newly derived cases/records. This preserves the existing fail-closed rule: changed past evidence can create a reconciliation case, but raw scrape evidence does not silently become riding credit.

## OT ranking completeness correction

The server ranking gate no longer rejects an otherwise complete ranking solely because the collector's own status-UI mutation toggled the MutationObserver-based `pageStable` flag after a full sweep. Trusted ranking still requires the browser's `captureComplete` result, no loading indicator, high date confidence, at least 80 rows, sequential ranks, unique names, Michael present, and the one-time parser validation flag. This should allow the proven 130-row Global OT List capture shape to become `good` on the next fresh collection.

## Safety boundary

Range sync is read-only.

Scheduling/OT automated Vector writes remain disabled. Input controls still use the existing action-package sequence:

preview → user performs one approved manual Vector change → record manual write → fresh reread → verified/mismatch.

No fake operational package was created during this implementation and no overtime signup or schedule change was made on Michael's behalf.
