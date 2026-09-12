# Vector Scheduling Assistant — development install

This is a development-only helper under Mission Vector Check It. It is separate from Vector Rebel PPE and must not be promoted to Beta/Stable without explicit approval.

## What it does

- Reads Vector Scheduling/CrewSense pages only.
- Stores private plans/history/observations in the local browser.
- Recommends firefighter positions from confirmed history.
- Reconciles saved plan intent against later Vector observations.
- Does not create, move, delete, or otherwise change Vector Scheduling assignments.

## Install

1. Install/enable Tampermonkey in the browser used for Vector Scheduling.
2. Open the raw development userscript:
   `https://raw.githubusercontent.com/michaelbartbrion-cmd/mission-vector-check-it/feature/vector-scheduling-mvp/scheduling/vector-scheduling-assistant.user.js`
3. Install the script.
4. Open Vector Scheduling. A small `VS` button should appear in the lower-right corner on matched CrewSense pages.
5. Open `VS` -> `Data` and import the private local migration/state JSON.

## Private history import

The public repository intentionally does not contain real crew names or historical assignments. The private import should contain `settings`, manually verified `history`, and optional `dutyHistory`.

After import, the Dashboard should show confirmed actual firefighter ratios. Future `plans` do not affect those actual ratios until reconciliation.

## Validation sequence before routine use

1. Open a known Vector ListView date where all five configured people have an easily verified assignment/status.
2. Use `Data` -> `Capture displayed Vector date`.
3. Confirm the displayed observations match the real page.
4. Test a known historical date with a saved/synthetic plan and verify Swing versus Swing/FF behavior.
5. Compare Dashboard ratios with the legacy spreadsheet over the same balance window.
6. Only after those checks should recommendations be used operationally.

## API path

The browser reader is a development fallback. The preferred long-term acquisition path is the official read-only Vector Scheduling API using `Vector_Scheduling_Truck504_Probe_v0.1.ps1` or its successor. API key/secret values stay runtime-only and must never be committed or placed in the browser state file.

## Rollback

Disable/remove only the `Mission Vector Check It - Vector Scheduling Assistant DEV` userscript in Tampermonkey. This does not alter Vector Scheduling itself. Export the private state JSON first if the local planning/reconciliation history should be preserved.
