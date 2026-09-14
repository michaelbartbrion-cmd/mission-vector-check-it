# Mission Vector Check It — unified CrewSense control panel

Date: 2026-09-13
Runtime: `0.24.0-dev`
Loader: `1.0.3`

## Purpose

Runtime 0.24.0 replaces the visible Vector Scheduling DEV drawer, standalone bridge card, separate Mission Vector launcher, and embedded OT capture button with one user-facing control surface modeled after Vector Rebel.

The new control surface is `scheduling/mission-vector-control-panel-0.24.0.js` and is loaded last by the runtime manifest.

## User interface

A circular blue **V** control is available from CrewSense. Opening it shows a Vector Rebel-style panel with:

- work-date selector;
- `Collect Staffing`;
- `Collect OT Priority`;
- `Input Schedule`;
- `Input OT Signup`;
- `Settings`;
- `Check Connection`;
- persistent success/error status reporting.

The panel shows shared Rebel Command connection state and queued input-action counts for the selected date.

## Navigation and collection behavior

`Collect Staffing`:

1. stores a pending collection request;
2. navigates to Vector/CrewSense ListView for the selected date when needed;
3. waits for the unified ListView bridge;
4. runs the full staffing census;
5. reports success only when the bridge returns `sent-good`;
6. reports partial/error as a stop condition.

`Collect OT Priority`:

1. stores a pending collection request;
2. navigates to Callback → Rankings → Global OT List for the selected date;
3. waits for the proven OT ranking collector;
4. runs the ranking capture;
5. reports good/partial/error status back in the Mission Vector panel.

## Input controls

The input buttons are real workflow controls, but the automated Vector writer remains intentionally locked.

For a queued action package matching the selected date:

- `Input Schedule` selects a `schedule` package;
- `Input OT Signup` selects an `overtime_signup` package;
- Mission Vector navigates to the exact ListView date;
- a fresh-good census is required;
- Rebel Core server preflight is required;
- queued packages run read-only action preview;
- packages in `writing` stage run fresh reread verification.

A ready preview explicitly reports that the one approved manual Vector change is still required. The panel does not submit that change automatically.

This preserves the PRIMARY safety rule: automated Vector writes cannot be enabled until the manual preview → single write → reread → verification proof is completed cleanly and PRIMARY separately approves a writer.

## Removed visible surfaces

Runtime 0.24.0 no longer loads these previous UI layers:

- `vector-action-preview-0.22.1.js`;
- `vector-bridge-ui-0.23.0.js`;
- `mission-vector-global-launcher-0.23.0.js`.

The new panel also visually suppresses the legacy `VS` drawer/orb, bridge card, old launcher, and embedded OT button. The underlying read-only scheduling/bridge logic remains loaded and available to the new controller.

## Runtime manifest

Current manifest is `0.24.0-dev` and ends with:

- `vector-scheduling-runtime-unified-bridge-0.20.0.js`
- `rebel-core-scheduling-sync-0.21.0.js`
- `mission-vector-control-panel-0.24.0.js`

## Next live validation

1. Refresh an authorized CrewSense page.
2. Confirm LIVE Loader `1.0.3` reports runtime `0.24.0-dev`.
3. Confirm the old VS drawer/orb and embedded OT button are gone and the circular blue `V` appears.
4. Open `V`; confirm the four primary controls are visible.
5. Run `Collect Staffing` for a known date and confirm the panel reports completion or an exact safety-gate failure.
6. From another CrewSense page, run `Collect OT Priority` for a known date and confirm automatic navigation + capture.
7. Test an input control only against a genuinely desired queued action package. Do not create a fake real-world schedule or OT change merely for software testing.
8. Automated writes remain disabled after this validation unless PRIMARY explicitly approves the next phase.
