# Mission Vector Check It - PRIMARY grid / TADE / Swing state

Date: 2026-09-14

Authority remains `Mission Vector Check It - PRIMARY`.

## Crew model

The C-shift Station 4 operating grid contains all five regular crew members:

- Captain Michael Baldree
- Engineer Michael Brion
- Jared Weston
- Jerry Weems
- Robert Brooks

The scheduling UI must keep all five visible by C-shift date. Time off, deployment/away status, current factual unit/duty evidence, suggested firefighter riding positions, and saved manual overrides belong in the same grid-style operating view.

## TADE

`TADE` means Temporary Acting Driver Engineer and is a full riding-ratio category alongside Firefighter, Swing and Tiller.

Operational rule supplied by Michael:

- if Michael Brion is unavailable, a tracked firefighter must drive in his place when staffing allows;
- if Captain Baldree is unavailable while Michael is available, Michael moves up for the shift and a tracked firefighter fills Michael's driver position as TADE;
- if both Michael and Baldree are unavailable, Rebel Command must not invent command/driver coverage. Mark the row for manual staffing/command resolution.

For a trusted future census with all three tracked firefighters available:

- normal full-crew role set: Firefighter / Tiller / Swing;
- TADE-required role set: Firefighter / Tiller / TADE.

If TADE is required but fewer than three tracked firefighters are available, automatic riding suggestions stop and the row requires a manual decision.

## Swing

Swing remains ONE ratio category, but Rebel Core now preserves its operational subtype:

- `designated`: the firefighter designated as the person who would swing if needed, but not actually sent out;
- `actual`: the firefighter was actually moved to another assignment;
- `unknown`: older evidence does not prove which subtype occurred.

Actual Swing also retains `destination`, such as Medic 501, Medic 503, Engine 501, etc. Rebel Command summarizes destination counts and hours per firefighter so repeated assignments can be seen directly.

Schema additions:

- RidingCredit: `credit_detail`, `swing_mode`, `destination`
- SchedulingPlan: `planned_swing_mode`, `planned_destination`, `manual_override`
- ReconciliationCase: proposed/resolved Swing subtype and destination fields

Migration performed without changing ratio totals:

- all legacy Swing credits were first classified `unknown`;
- legacy rows with explicit `Swing/FF` evidence were then classified `designated`;
- remaining ambiguous plain-Swing rows stay `unknown` until factual evidence or manual reconciliation proves subtype;
- TADE credits received explicit `credit_detail=TADE`.

## Excel-style scheduling grid

Rebel Command Scheduling is now centered on a row-per-C-shift grid.

Columns contain all five crew members plus coverage/data status. For the three tracked firefighters, trusted rows are prefilled from the fairness engine and can be manually changed to:

- Firefighter
- Tiller
- TADE
- Swing - designated
- Swing - actual / sent out

Choosing actual Swing requires an explicit destination. A grid edit creates/updates only a Rebel Command SchedulingPlan and does not write Vector.

Saved manual plans become fixed constraints when subsequent future suggestions are calculated. The fairness engine therefore plans the horizon sequentially instead of treating each shift in isolation.

An actual Swing plan is deliberately marked `controlled_assignment=false`; it is useful for ratio/planning history but is not packaged as a Station 4 Vector-input action, because the destination is outside the controlled Station 4 scope.

## Detailed crew records

All five crew cards are clickable. Detailed history combines verified ratio credits, Vector activity, and factual historical duty segments. Actual Swing entries expose destination and hours. TADE remains distinct from Tiller and Firefighter.

## Browser runtime / update path

Current intended runtime is `0.26.0-dev` under LIVE Loader `1.0.3`.

Runtime 0.26 adds `mission-vector-update-button-0.26.0.js`, which injects a visible **Update** button into the unified Mission Vector V panel and invokes the loader's existing manifest-update hook. An already-open old 0.24-era tab still requires one ordinary browser refresh to bootstrap into the current manifest; after the current runtime is loaded, the Update button remains available for future runtime checks.

The live raw manifest was re-fetched after promotion and confirmed `runtimeVersion: 0.26.0-dev`, with the update-button module present.

## Existing range model retained

Defaults remain:

- riding history start: 2025-09-30
- schedule planning horizon: 35 days
- overtime horizon: 60 days
- recent past priority: 21 days
- max range checks per tab session: 18

Range sync remains bounded and read-only. Per-tab queue isolation, one-tab auto-start coordination, action-safety hold, and post-range reconciliation/Core sync remain in force.

## Safety boundary

Automated Vector writes remain OFF.

No fake schedule action or OT action was created during this implementation. Manual grid edits live in Rebel Command until Michael deliberately approves a real controlled Station 4 change. The existing action pipeline remains:

preview -> one user-performed manual Vector change -> record manual write -> fresh reread -> verified/mismatch.

## Next live boundary

1. Refresh one CrewSense tab once so the old runtime can load the current manifest.
2. Confirm V panel shows runtime `0.26.0-dev` and a visible **Update** button.
3. Let read-only range sync run or start it manually.
4. Open Rebel Command Scheduling and verify the five-person grid, time-off markings, TADE-required rows, Swing subtype/destination analytics, and detailed person records.
5. A future manual override may be tested in Rebel Command only; do not approve/package a real Vector change unless the intended assignment is genuine.
