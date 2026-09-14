# Mission Vector Check It - PRIMARY server-driven sync state

Date: 2026-09-14

Authority remains `Mission Vector Check It - PRIMARY`.

## User workflow decision

The CrewSense browser control is no longer date-centric.

Michael does not need a browser **Work date** selector or separate one-day Staffing / OT Priority scrape buttons. Rebel Command owns the decision about what data is needed. The browser is the thin collector/executor.

The normal CrewSense control surface is now:

1. **Sync Rebel Command**
2. **Apply Riding Plan**
3. **Sign Up for OT**

Secondary controls remain Update / Settings / Connection.

The launcher continues to use the same Rebel starbird icon and minimized-circle treatment as Vector Rebel.

## Runtime

Current intended runtime: `0.27.1-dev`

LIVE Loader: `1.0.3`

New modules:

- `mission-vector-command-center-0.27.0.js`
- `mission-vector-action-safe-autosync-0.27.1.js`

The older 0.25 control module remains loaded only as the proven read-only action preview/reread runner. Its visible panel is suppressed by the 0.27 command center.

## Server-driven data need analysis

`telemetryBridge?action=range-sync-plan` now returns an explicit server-computed `worklist` rather than merely configuration plus a browser-side rotating sample.

Rebel Command considers the following required data:

- Future C-shift dates through the configured riding-plan horizon (default 35 days).
- Every calendar date through the configured overtime horizon (default 60 days), because staffing coverage determines whether OT is likely.
- Recent C-shift history through the configured recent-history recheck window (default 21 days) so late trades, time off, assignment changes, or corrections are caught.
- Any older C-shift history since the riding tracking start date that has never produced a trusted good capture.
- Older good historical data that has aged into a periodic recheck interval.
- Global OT Priority for future dates that trusted staffing now identifies as likely OT and user-eligible, unless a current good ranking capture already exists.

A good capture made on the current day satisfies that date for the current server-driven sync.

The browser no longer honors the old ordinary 18-page rotating cap. The server returns the full needed worklist. A high 250-check hard safety ceiling remains only as runaway-loop protection; the configured tracking span plus 60-day future horizon fits under this ceiling in normal operation.

## Two-phase/replanning behavior

A sync cannot know every OT Priority page before future staffing has been refreshed. Therefore:

1. Mission Vector consumes the current Rebel Command worklist.
2. Staffing pages are collected and sent to Rebel Core.
3. When the current queue is exhausted, the browser asks Rebel Command again.
4. Newly identified OT-candidate ranking pages are appended.
5. The process finishes only when no new unattempted required work remains, or when specific attempted items remain in review/error state.

This is why a single **Sync Rebel Command** button can cover staffing, riding-history evidence, future scheduling evidence, OT signup evidence embedded in ListView, and targeted Global OT Priority collection.

## Multi-tab and action safety

Only one CrewSense tab may own the active data sync at a time. The 0.27 command center uses a cross-tab heartbeat lock and resumes its persisted queue across CrewSense navigation/reloads.

Automatic sync is held whenever an approved or in-progress Vector action package is waiting. Manual Sync is also intercepted if action work is pending. This prevents a background collection crawl from navigating away during schedule/OT preview, manual-write, or verification work.

## Input buttons

**Apply Riding Plan** no longer asks Michael for a browser date. It reads the Rebel Command action worklist and chooses the next approved/in-progress schedule action, prioritizing reread verification before a new preview and then earliest target date.

**Sign Up for OT** does the same for approved/in-progress overtime signup actions.

If no approved package exists, the browser tells Michael to make/approve the decision in Rebel Command first.

## Safety boundary

Automated Vector writes remain OFF.

The two input buttons still use the established action pipeline:

preview -> one user-performed manual Vector change -> record manual write -> fresh reread -> verified/mismatch

The existing Vector Rebel PPE helper remains separate and intact.

## Rebel Command UI alignment

Data Collection now explains that Rebel Command decides what is missing/stale. The old user-facing `Maximum page checks per session` setting has been removed from the UI because 0.27 no longer rotates a small browser-selected sample. The remaining user setting is the recent-history recheck window plus the auto-sync toggle; scheduling and overtime horizon settings remain on their own pages.

Dashboard and Overtime copy were updated to describe the server-driven model.

## Validation

- Base44 `npm run lint`: pass
- Base44 `npm run build`: pass
- `telemetryBridge` bundle + `node --check`: pass
- `mission-vector-command-center-0.27.0.js` `node --check`: pass
- `mission-vector-action-safe-autosync-0.27.1.js` `node --check`: pass
- Live raw manifest re-fetched and verified at `0.27.1-dev`
- Base44 checkpoint: `6aa7f69d737dc20c0a672404`

## Next live boundary

1. Refresh one CrewSense tab or use Update from 0.26.1.
2. Confirm runtime `0.27.1-dev`.
3. Confirm Work date and single-date scrape controls are gone.
4. Confirm only Sync Rebel Command / Apply Riding Plan / Sign Up for OT are the main operational buttons.
5. Start Sync Rebel Command and let it continue. The initial sync may be substantially larger than the old 13-16 page run because it is filling all currently required missing/stale dates instead of a rotating sample.
6. After completion, review Scheduling and Overtime for remaining `Needs scan` / missing-data cells. Any remainder should now correspond to a specific failed/review capture rather than simply a browser page-cap omission.
