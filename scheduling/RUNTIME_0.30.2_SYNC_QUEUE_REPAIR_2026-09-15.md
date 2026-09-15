# Mission Vector Check It — Runtime 0.30.2 Sync Queue Repair

Date: 2026-09-15
Status: deployed to `feature/vector-scheduling-mvp` manifest
Scope: read-only CrewSense data collection only. Automated Vector writes remain OFF.

## Problem found

The browser command-center queue persists `successKeys` in localStorage for the life of a sync run. The server-side staffing rules were tightened while a long-running 365-day collection queue was already active. The server correctly superseded old StaffingForecast / OvertimeSelectionForecast records and began returning those dates as needed again, but the browser's pre-existing queue could still remember those same date keys as already successful.

The current command-center `mergeNewNeeded()` intentionally avoids re-adding keys listed in the persisted `successKeys`. That behavior is normally useful inside one unchanged sync run, but it is unsafe across a server-side rule revision because a previously successful scrape can become insufficient under the new authoritative rule.

## 0.30.2 repair

Runtime 0.30.2 adds `rebel-command-sync-epoch-patch-0.30.2.js`.

On page load it checks the persisted `mvciServerDrivenSync_v0290` queue. If that queue is still active and was started before the queue repair epoch (`2026-09-15T21:40:00Z`), it:

1. Saves a small queue summary to `mvciServerDrivenSyncEpochBackup_v0302` for diagnostics.
2. Marks the stale local queue inactive and clears its local items, success keys, failures, attempts, and navigation retry state.
3. Clears the per-session automatic-sync marker so the existing command center can request a new server worklist.
4. Does **not** delete or demote any already captured server evidence.

The server then remains authoritative: dates with valid post-revision evidence are omitted from the new worklist; dates that still require a reread are returned again.

## Why the queue epoch is newer than the staffing-rule revision

The staffing-data revision cutoff remains `2026-09-15T17:55:00Z`. The later `21:40Z` value is only a browser-queue epoch. It guarantees that the browser discards any long-running queue created before this queue-repair logic existed. It does not invalidate good CrewSense captures collected between those times.

## Related data-integrity rules

- Minimum operational staffing target: 36.
- Count only verified grouped regular-duty Work Shift + Salary Step `[1010]` evidence covering the duty day.
- Exclude Battalion/command, day staff, leave/time off, deployment/disaster, Sub/trade coverage, OT/force-hire/backfill, Additional Time, and ungrouped row-only fragments.
- Normalize CrewSense visual badge/status suffixes from employee identity before unioning split duty-day fragments.
- Prefer normalized employee name over collector-specific DOM ids when aggregating one person's staffing evidence.

## Runtime manifest

Manifest runtime: `0.30.2-dev`
Loader minimum: `1.0.4`
New script: `rebel-command-sync-epoch-patch-0.30.2.js`

## Human boundary

No human action is required to preserve data integrity. The patch takes effect the next time the current LIVE loader loads runtime 0.30.2 (for example after a normal CrewSense reload/update). The remaining separate human validation boundary is the Assisted Input Lab proof; 0.30.2 does not enable automatic CrewSense Save or any other Vector write.
