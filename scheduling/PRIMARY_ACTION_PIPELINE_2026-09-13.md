# Mission Vector Check It — PRIMARY action-pipeline state

Date: 2026-09-13

This document records the next PRIMARY-controlled phase after the completed Scheduling/Overtime live-test handoff at commit `5188555c130df408e88cc6a289bad1dc6ef028b0`.

## Authority

Mission Vector Check It - PRIMARY is the coordinating development thread for Vector Rebel + Scheduling + Overtime shared Rebel Command/Rebel Core work. The former Scheduling/Overtime development chat is historical/reference for shared code after its handoff.

Canonical control center: Rebel Command.
Canonical data layer: Rebel Core.
Vector-side surface: small authenticated bridge/collectors only.

## Current runtime

Scheduling LIVE Loader remains `1.0.3`.
Current PRIMARY runtime manifest: `0.22.1-dev`.
New action module: `scheduling/vector-action-preview-0.22.1.js`.

## Action-package model

Rebel Command now owns a shared `VectorActionPackage` lifecycle for:

- `schedule`
- `overtime_signup`

A new `VectorActionAudit` ledger records the lifecycle stages.

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
- A schedule package already in its intended target state is not writable; it is treated as no change needed.
- Overtime package preflight checks current signup state and validated selection forecast state.
- Overtime package preflight fails if the ranking batch, likely-OT-slot count, or Michael's predicted signup position has drifted from the package assumptions.
- Reread verification is only accepted after Rebel Command has recorded a manual single-write test.
- A reread mismatch stops at `partial` / mismatch rather than being treated as success.

## Server-enforced transitions

Rebel Command now uses `base44/functions/manageVectorAction/entry.ts` for user-driven package transitions instead of updating package status directly from the page.

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

New page: `/actions` — Vector Actions.

The page provides:

- visible write-lock banner;
- package approval and queue controls;
- preview status;
- explicit manual-write recording gate;
- reread status;
- complete action audit trail;
- package/precondition/preview/verification evidence inspection.

Overtime Forecast can now prepare a draft `overtime_signup` package only when:

- staffing evidence is good;
- selection forecast evidence is good;
- Michael is eligible;
- at least one likely OT slot exists;
- Michael is currently not signed up.

Preparing the package is not approval and does not change Vector.

Scheduling can now create approved atomic schedule packages from individually approved Scheduling plans. Packaging does not queue or write them; Vector Actions controls queue/preview progression.

## Unified PRIMARY roadmap in Rebel Command

The Program registry now contains active records for:

- Vector Rebel
- Vector Scheduling
- Vector Overtime Predictor

The Rebel Command Dashboard now shows shared Program status and Vector action-gate counts alongside device/telemetry health. This is coordination only; PPE/Vector Rebel domain logic remains separate from Scheduling/Overtime domain logic.

The existing PPE helper is preserved and must not be removed or repurposed as part of this consolidation.

## Runtime browser behavior

On the matching Vector ListView date, the legacy disabled INPUT buttons are repurposed by `vector-action-preview-0.22.1.js` as read-only controls:

- `PREVIEW SCHEDULE`
- `PREVIEW OT SIGNUPS`

After a manual test write has been recorded in Rebel Command, the matching control becomes a reread verification control.

The runtime requires the newly triggered ListView census itself to report `sent-good`. A partial fresh census blocks preview/reread even if an older good batch exists.

The module never submits a Vector form and never invokes an input/write routine.

## Connection-state note

Rebel Core currently contains multiple Mission Vector Bridge pairing records from testing. At least one has live successful activity. Rebel Command Overtime now prefers the active bridge with real `last_seen_at` / success history instead of blindly selecting the newest unused pairing record.

Connections now prevents normal creation of another Mission Vector Bridge while an enabled shared pairing already exists and surfaces enabled pairings that have never checked in. Existing unused pairings were not automatically disabled or deleted because credentials may still exist in an authorized browser; cleanup remains deliberate.

## Validation state after implementation

The Base44 Rebel Command app passes lint and production build.

The following server functions bundle and pass JavaScript syntax validation:

- `telemetryBridge`
- `manageVectorAction`

No `VectorActionPackage` existed at the end of autonomous implementation, so no scheduling or overtime action was prepared, approved, previewed, or written on Michael's behalf during development.

## Next live test

Do not enable automated writes.

The next test is the first complete action-package proof:

1. refresh Vector to runtime `0.22.1-dev`;
2. prepare one desired action package in Rebel Command;
3. approve and queue it in Vector Actions;
4. navigate Vector ListView to the exact target date;
5. run read-only PREVIEW;
6. confirm Rebel Command marks preview `ready` and inspect evidence;
7. manually perform exactly one corresponding Vector change;
8. immediately record the manual test write in Vector Actions;
9. run the browser reread verification;
10. confirm package becomes `verified` and audit trail contains preview -> write_recorded -> reread_verified.

Any blocked preview, partial census, changed overtime assumptions, ambiguous scheduling target, expired preview, or reread mismatch is a stop condition.

## Write boundary

Automated Vector writes remain disabled.
Do not add or enable a Vector writer until at least one atomic package completes the full preview -> manual single write -> reread -> verification path cleanly and PRIMARY explicitly approves the next phase.
