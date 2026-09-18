# PPE helper restoration safety review - 2026-09-18

**Scope:** source `beta/vector-ppe-helper.user.js` v2.3.10 recovered from the existing Mission Vector Check It repository. No live Check It testing, installs or data writes were performed.

## Verified offline risks

- Startup line ~7987 calls `installPanel()` and ~7988 checks an update manifest, then ~7998 schedules `resumeRun` after 700 ms.
- An observed SPA URL change schedules `resumeRun` again after 500 ms near line ~8018.
- `resumeRun` near line ~5095 can reclaim a stored run and call live-inspection processing or open the current asset; these paths may click or submit controls depending on state. A recovered source file is therefore **not** safe to activate blindly with unknown browser run state.
- A document-wide `MutationObserver` is installed near line ~8021 and runs a debounced callback. This is a performance risk requiring controlled testing, not proof that it caused Scout's CrewSense crash.

## Restore gate

Preserve the original source and Chrome storage backup. Inspect the stored run state without exposing credential values, explicitly prevent any interrupted run from starting without a fresh human decision, replace broad observation with a scoped mechanism or demonstrate safe performance, and separately verify the PPE helper on Check It with one controlled, reversible test. Do not load the DEV telemetry script during this test. Never equate a syntax/test pass with actual browser verification.
