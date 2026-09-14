# Mission Vector Check It — PRIMARY action-pipeline state

Date: 2026-09-13

This document records the PRIMARY-controlled phase after the completed Scheduling/Overtime live-test handoff at commit `5188555c130df408e88cc6a289bad1dc6ef028b0`.

## Authority

Mission Vector Check It - PRIMARY is the coordinating development thread for Vector Rebel + Scheduling + Overtime shared Rebel Command/Rebel Core work. The former Scheduling/Overtime development chat is historical/reference for shared code after its handoff.

Canonical control center: Rebel Command.
Canonical data layer: Rebel Core.
Vector-side surface: small authenticated read-only collectors and the explicitly gated action-preview bridge.

## Current runtime

Scheduling LIVE Loader remains `1.0.3`.
Current PRIMARY runtime manifest: `0.23.0-dev`.

Runtime `0.23.0-dev` keeps the proven Scheduling/Overtime collection and action-preview modules and adds:

- `scheduling/vector-bridge-ui-0.23.0.js`
- `scheduling/mission-vector-global-launcher-0.23.0.js`
- a hardened `vector-action-preview-0.22.1.js` implementation reporting runtime `0.23.0-dev`

The global launcher provides a small `MISSION VECTOR` control from any CrewSense page. A user can choose a date and request either schedule/staffing collection or OT-priority collection. The launcher navigates to the required CrewSense page and then starts the existing read-only collector. The old OT ranking-page capture button is hidden by the runtime while the proven collector remains available underneath.

## Collection reliability correction

A 2026-09-15 live check showed the Vector bridge UI reporting a generic telemetry error even though Rebel Core had already received a 54-row staffing capture and derived signup/forecast records. Two causes were addressed:

1. browser-side action-preview polling was mutating the injected UI frequently enough to interfere with the full-census `pageStable` gate;
2. the server POST handler treated any later sub-pipeline exception as a failure of the entire telemetry request, even after another ingestion path had successfully committed data.

Runtime `0.23.0-dev` reduces browser DOM churn by updating action controls only when their state signature changes and uses slower polling intervals. `telemetryBridge` now isolates staffing, ranking, signup, scheduling-ledger, action-preview, and action-verification ingestion failures. A noncritical downstream failure returns a warning instead of incorrectly converting a successful staffing ingestion into a top-level `Telemetry unavailable` response.

Partial staffing captures now store an explicit completeness summary showing the state of `captureComplete`, page stability, group sweep, scroll sweep, loading state, date confidence, group count, row count, and regular-24h count.

## Action-package model

Rebel Command owns a shared `VectorActionPackage` lifecycle for:

- `schedule`
- `overtime_signup`

`VectorActionAudit` records the lifecycle stages.

Scheduling packages are atomic: one approved Scheduling plan / one person-assignment change per package.
Overtime packages are atomic: one desired signup-state change for Michael on one date.

## Safety sequence

The implemented sequence is:

1. producer prepares a package;
2. explicit Rebel Command approval when required;
3. package is queued for browser preview;
4. Vector browser performs a fresh read-only full ListView census;
5. Rebel Core recomputes package-specific preconditions;
6. browser reports preview ready or blocked;
7. no automated write is available;
8. for the first validation, Michael manually performs exactly one approved Vector change;
9. Rebel Command records that the manual single write occurred;
10. Vector browser performs a second fresh read-only census;
11. Rebel Core reread is compared with the intended package state;
12. package becomes verified only when the reread matches.

## Fail-closed controls

- There is no automated Vector write endpoint in the action bridge.
- Action worklist responses explicitly report `writeEnabled: false`.
- Preview and reread require a fresh `good` full-census capture.
- Server-side action preflight accepts only good census/signup evidence captured within the preceding five minutes.
- A partial fresh scrape stops the action flow rather than falling back to untrusted evidence.
- Rebel Command preview expires after ten minutes before a manual test write may be recorded.
- Schedule package preflight requires exactly one matching employee record and rejects ambiguous/missing targets.
- A schedule package already in its intended target state is treated as no change needed.
- Overtime package preflight checks current signup state and validated selection forecast state.
- Overtime package preflight fails if ranking batch, likely-OT-slot count, or Michael's predicted signup position drift from package assumptions.
- Reread verification is accepted only after Rebel Command records a manual single-write test.
- A reread mismatch stops at `partial` / mismatch rather than being treated as success.

## Server-enforced transitions

Rebel Command uses `base44/functions/manageVectorAction/entry.ts` for user-driven package transitions instead of updating package status directly from the page.

The server function enforces:

- `draft -> approved` only;
- `approved -> queued` only;
- expired/redo preview requeue only from `previewed`;
- manual-write recording only from a `previewed` package with `preview_status=ready`;
- manual-write recording only while the preview is at most ten minutes old;
- exact `WRITE COMPLETED` confirmation plus required notes;
- cancellation only before the manual-write stage;
- audit events for every accepted transition.

The server transition function never writes to Vector. `writing` means only that Michael recorded completion of the one manual test change so the browser may perform reread verification.

## Rebel Command UI

Rebel Command was reorganized for operational use rather than raw development telemetry.

Navigation is now grouped as:

- Mission: Command Center
- Work: Scheduling, Overtime, Vector Actions
- System: Data Collection, Programs
- Review: Suggestions, Activity

The Command Center surfaces overall readiness, quick access to the major workflows, only the items needing attention, and a compact latest-data confidence check. Technical system details remain available in a collapsed section.

`Data Collection` replaces the old connection-centric presentation and explains the shared Mission Vector browser connection, the global CrewSense launcher, current collection quality, and pairing state. Raw pairing records are moved under Advanced pairing records.

Scheduling now provides an inline Station 4 assignment form instead of a sequence of browser prompts.

Overtime now places the upcoming overtime outlook first, reduces the main table to the information needed for a decision, and moves parser/collector diagnostics under a collapsed collection-quality section.

Vector Actions now presents each package as a four-stage safety checklist with a clear next action. Raw package JSON and audit evidence remain available under Advanced details. The visible write-lock warning remains prominent.

## Runtime browser behavior

On matching Vector ListView dates, action controls remain read-only:

- `PREVIEW SCHEDULE`
- `PREVIEW OT SIGNUPS`

After a manual test write is recorded in Rebel Command, the matching control becomes a reread verification control.

The runtime requires the newly triggered ListView census itself to report `sent-good`. A partial fresh census blocks preview/reread even if an older good batch exists.

The runtime never submits a Vector form and never invokes an input/write routine.

The new `MISSION VECTOR` launcher is collection/navigation convenience only. It does not change the action write boundary.

## Connection-state note

Rebel Core contains multiple Mission Vector Bridge pairing records from testing. At least one has live successful activity. Rebel Command prefers the enabled bridge with real `last_seen_at` / success history instead of blindly selecting the newest unused pairing record.

Data Collection prevents normal creation of another Mission Vector Bridge while an enabled shared pairing exists and surfaces enabled pairings that have never checked in. Existing unused pairings are not automatically disabled or deleted because credentials may still exist in an authorized browser; cleanup remains deliberate.

## Validation state after implementation

The Base44 Rebel Command app passes lint and production build after the 0.23.0 UI changes.

The following server functions bundle and pass JavaScript syntax validation:

- `telemetryBridge`
- `manageVectorAction`

No action package was created as part of the 0.23.0 autonomous usability/reliability work. Real schedule or overtime intent remains a user decision.

## Next live validation

Do not enable automated writes.

First validate collection/runtime behavior:

1. refresh any CrewSense page;
2. confirm LIVE Loader `1.0.3` loads runtime `0.23.0-dev`;
3. confirm the small `MISSION VECTOR` launcher appears;
4. choose a real test date and run `Collect schedule / staffing`;
5. confirm it navigates to the correct ListView date and finishes as Data ready or gives a concrete review reason instead of a generic telemetry failure;
6. from another CrewSense page, use `MISSION VECTOR -> Collect OT priority` for the same or another desired date;
7. confirm it navigates to Callback Rankings and starts the ranking capture without requiring the old embedded OT capture button.

Only after collection behavior is validated should the first complete action-package proof be run for a real action Michael actually wants:

1. prepare one desired action package in Rebel Command;
2. approve and queue it in Vector Actions;
3. navigate Vector ListView to the exact target date;
4. run read-only PREVIEW;
5. confirm Rebel Command marks preview `ready` and inspect evidence;
6. manually perform exactly one corresponding Vector change;
7. immediately record the manual test write in Vector Actions;
8. run browser reread verification;
9. confirm package becomes `verified` and audit trail contains preview -> write_recorded -> reread_verified.

Any blocked preview, partial census, changed overtime assumptions, ambiguous scheduling target, expired preview, or reread mismatch is a stop condition.

## Write boundary

Automated Vector writes remain disabled.
Do not add or enable a Vector writer until the relevant atomic package type completes the full preview -> manual single write -> reread -> verification path cleanly and PRIMARY explicitly approves the next phase.
