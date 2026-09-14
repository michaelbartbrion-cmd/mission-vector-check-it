# Mission Vector Check It — Sync failure root cause — 2026-09-14

## Status

Resolved in the 0.29.0 development runtime pending one live browser proof.

## Evidence from Michael's screen recording

The failed 0.27.1 range run showed that the CrewSense ListView URL/hash can change before the page has actually rendered the requested date. Examples visible in the recording:

- URL `#2026/10/25` while the ListView header still showed **Saturday, October 24, 2026**.
- URL `#2026/10/27` while the ListView header still showed **Monday, October 26, 2026**.
- URL `#2026/09/05` while the rendered ListView still showed **Monday, August 24, 2026**.
- URL `#2025/10/28` while the rendered ListView still showed **Monday, October 27, 2025**.

The old controller treated the URL/hash as the displayed date. The old staffing bridge also stamped captures from the URL/hash before proving that the rendered page matched. In addition, `scrapeNow()` returned immediately when another scrape was already running, allowing the controller to inspect a previous capture status and advance the queue without a fresh census for the requested date.

That combination could make the browser appear to progress through dates faster than CrewSense was actually rendering them. It also explains why the range run could fail or leave Rebel Command with incomplete/questionable data.

A separate repeated partial capture on 2026-09-05 showed `pageStable=false`. The legacy bridge's global MutationObserver counted Mission Vector's own hidden UI mutations as page activity, which could cause a false page-stability failure.

## 0.29.0 corrections

### Rendered date is authoritative

The new headless staffing bridge and command center use the rendered CrewSense DOM date. The URL/hash is only a navigation request and is never sufficient proof that the target date loaded.

Before every staffing scrape the controller requires the rendered date to equal the requested date for multiple consecutive checks.

### Same-page ListView navigation is awaited

When the next work item is another ListView date, the controller changes the hash and remains in the same run while waiting for CrewSense to render the requested date. It does not immediately scrape the old page.

If the hash already requests the target but the rendered page is still wrong, the controller reloads the page and resumes the persisted queue. Repeated failures are bounded and reported.

### Staffing scrapes are serialized

`MVCI_VECTOR_BRIDGE_0290.scrapeNow()` returns one shared in-flight promise. A second caller waits for the current census instead of receiving a stale status.

A staffing item is counted successful only when the bridge reports a new good capture for the exact requested rendered date and that capture began during the current item attempt.

### Mission Vector UI does not poison page stability

The new staffing bridge is headless. Its MutationObserver ignores Mission Vector/legacy helper DOM. Page-stability checks therefore measure CrewSense content changes rather than our own status/panel rendering.

### Legacy automatic captures do not satisfy the repair sync

Rebel Command's range-sync plan now treats only `vector-bridge-0.29.x` good captures as authoritative for sync completeness and action preflight. Pre-0.29 automatic range captures remain historical evidence but cannot satisfy the current missing/stale checklist.

The first 0.29 full sync will therefore reread the required tracking/history/future/OT staffing range and replace questionable evidence with DOM-verified captures.

### Startup UI cleanup

Preferred loader is 1.0.4. It has no top-right loader badge. Runtime 0.29 loads a quiet boot shell first, hides legacy Scheduling/bridge panels before they can flash, and waits until the exact cached/fetched Vector Rebel starbird is available before showing the Mission Vector launcher. No placeholder V icon is intentionally shown.

## Runtime

- Preferred LIVE Loader: `1.0.4`
- Current runtime: `0.29.0-dev`
- Headless staffing bridge: `vector-staffing-bridge-0.29.0.js`
- Action runner: `mission-vector-action-runner-0.29.0.js`
- Command center: `mission-vector-command-center-0.29.0.js`

## Safety state

- Automated Vector writes remain disabled.
- Data repair/sync is read-only.
- Scheduling and OT input actions still require the established preview → one manual write → reread verification proof before any writer can be enabled.
