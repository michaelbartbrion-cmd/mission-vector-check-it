# Mission Vector Check It — reconciliation-credit guard — September 16, 2026

Technical record only. Canonical PRIMARY: **Mission Vector Check It - PRIMARY**. This does not approve any riding-credit determination or Vector write.

## Concrete identified risk

The earlier Scheduling `resolveCase` generic action created a full `credit_value:1` RidingCredit with a new `resolution:${case_key}` key. A legacy-conflict case can ALREADY have a verified legacy RidingCredit with a different credit key for the same person and date. Read-only lookup specifically confirmed an existing verified legacy Firefighter credit for `weston` on `2026-04-20`, while a legacy-conflict case for him remains OPEN. Without an existence check, new resolution credit would be added to the historical ratio rather than replace/reconcile that prior credit. Partial-day cases likewise cannot be resolved safely by assuming a full-shift credit.

## Development patch applied (app only)

In `src/pages/Scheduling.jsx`:
1. `fullDayResolutionBlocked` prevents the generic add-credit handler on `review_bucket` `partial_day` or `legacy_conflict` or `issue_type` `partial_day`; the UI shows explanatory hold text instead of an active Resolve button.
2. Before prompting, handler blocks if already-loaded RidingCredit rows contain same date and person key (or normalized person name), regardless of existing credit's category or verified flag.
3. After explicit category and required notes, BEFORE ANY new credit mutation, handler rereads the current date's RidingCredit rows with a 100-row safety cap. It holds if this read fails, reaches the cap, or finds a matching person, displaying an error and creating NO credit. This catches an added credit that appeared after the initial UI loaded.
4. No existing credit was modified/deleted/reclassified; no reconciliation case was resolved/ignored or marked reviewing, and no new credit was created as part of implementing this patch.

All checks at app `/app` after patch: `npm run lint` exit 0, `npm run build` exit 0, `npm run typecheck` exit 0. Base44 app checkpoint `6aaab11c8dfbaa317adfdb4f`, app git commit `66dcd315c82d581ee40bd6a222a239ae16fcb5d6`.

## Limits / next design

This is an app client guard plus a fresh server query, NOT an atomic server-side unique constraint or validated live browser workflow. A race between concurrent writes could still exist; any future credit replacement/reconciliation workflow should be server-mediated with owner-scoped authoritative current-day lookup, explicit user-approved treatment of the previous credit, reliable provenance, atomic or idempotent uniqueness, partial-segment accounting, and a trail that cannot double-count. Do not implement an auto-replace or silently alter existing verified legacy credit. Existing `resolveCase` is still for deliberate human-reviewed previously uncredited, non-partial cases only.

Keep all unrelated boundaries intact: auto Vector writes OFF; browser 0.30.3 live proof absent; Work Email 0.1.6 remains unreviewed. Code checkpoint does not prove production deployment.
