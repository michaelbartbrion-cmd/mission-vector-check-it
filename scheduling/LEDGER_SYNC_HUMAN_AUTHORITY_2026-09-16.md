# Mission Vector Check It — ledger sync / human-authority guard — September 16, 2026

Authoritative workspace: **Mission Vector Check It - PRIMARY**. This is an engineering handoff, not a separate domain database, approval, production deployment, or claim that CrewSense runtime proof has arrived.

## Problem discovered

`base44/functions/telemetryBridge/entry.ts` ingested the authenticated browser's `schedulingLedger` via service-role upserts. The initial lookup for RidingCredit, SchedulingPlan and ReconciliationCase used a record key without `owner_user_id`. A repeated historical reconciliation upload also included browser-provided `status`, `resolution_notes` and `created_at`; it could overwrite a case the user had reviewed, ignored or resolved inside Rebel Command. Browser plan uploads similarly set `status` from potentially stale local state, potentially reversing an app-side approval/completion/cancellation. Source `manual_resolution` was accepted from a device payload, despite manual decisions belonging in authenticated human review.

## Development changes accepted

Base44 Rebel Command app `6aa6b7634a031657377d4fad`, checkpoint **`6aaab7226bec545641f94bfd`**, commit **`38bf208a48f8aacc2cb850e39cefd4a29ada2bf7`**.

- Service-role RidingCredit, SchedulingPlan and ReconciliationCase lookups now include authenticated `owner_user_id`. No owner was guessed or accepted from browser payload; it derives from the paired device.
- ReconciliationCase: duplicate owner+case keys fail closed; existing `resolved`/`ignored` cases are not mutated by browser sync; `open`/`reviewing` cases receive only updated summary/evidence/source, preserving status, provenance/triage, creation time and all resolution fields; browser-supplied resolved/ignored claims on newly created cases are discarded, so every newly imported case starts open. Response exposes a `casesPreserved` count.
- SchedulingPlan: duplicate owner+plan keys fail closed; plans with `manual_override=true` or status approved, queued, completed or cancelled remain unchanged by browser replays; ordinary active/unapproved plans may still update; response exposes `plansPreserved`.
- `manual_resolution` riding credits from device ledger ingestion are rejected. Human credit approval remains separate; legacy source imports continue under current rules.
- Prior `src/pages/Scheduling.jsx` client-side full-day guard remains: partial-day/legacy-conflict no generic add-credit, existing person/date credit blocks the button and a fresh date lookup blocks on duplicates/errors/100-row cap. No actual ledger records were rewritten.

## Verification and limits

`node --test tests/telemetry-ledger-safety.test.cjs`: **9 tests passed**, 0 failed. Tests transpile the actual TypeScript bridge function and use mock entity calls; cases cover ignored/resolved preservation, evidence-only review update, browser resolution rejection, duplicate case/plan identity, owner scoping, progressed-plan preservation, ordinary plan update, and manual-resolution source rejection. `npm run lint`, `npm run build`, `npm run typecheck`: **all exit 0**. Test mocks do not prove live deployment, transaction atomicity, uniqueness constraints, performance with a full historical corpus, or browser behavior. The existing 7-month-old Browserslist warning is nonblocking and no dependency update was attempted.

## Explicit remaining limits and Ready Room

- No confirmed Base44 production publish or deployed-function integration test. Verify publication and a harmless owner-authenticated read/status path before treating source patches as live.
- Client-side person/date duplicate guard is NOT an atomic database uniqueness guarantee; an independent controlled server-side credit workflow needs transaction/uniqueness design and human authorization. Do not initiate new credit creation or replace legacy credits automatically.
- Existing direct app-entity permissions have not been hardened into a dedicated exclusive write endpoint. Do not claim that browser-authenticated admin client permissions or all race conditions are eliminated.
- CrewSense loader 1.0.5 / 0.30.3-dev authentic `runtime_boot/runtime_loaded` proof and trace diagnostics were absent at the last live query. Source availability, bridge's earlier successful captures and three green app checks are not proof. No human action until actual runtime proof, then strictly one trace-only test and engineering review; no PREPARE/Save/Delete/OT action.
- Work Email 0.1.6 GOOD 9/9 list capture remains explicitly UNREVIEWED; never infer validation or perform mailbox writes.
- PPE on phone and Microsoft Teams connectivity remain deferred/backburner notes, not active integrations.
