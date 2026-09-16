# Mission Vector Check It — Ready Room status — 2026-09-16

Canonical Project: **Mission Vector Check It**. Only canonical PRIMARY: **Mission Vector Check It - PRIMARY**. This is a technical continuity/status record, not a successor PRIMARY, approval, or second database. Mission owns Vector/PPE, scheduling and work-only position rotation; Project X coordinates but does not own the domain records.

## Change discipline

Do not introduce another Tampermonkey loader version or ask Michael to click Update repeatedly. Scheduling LIVE Loader remains **1.0.5**; manifest targets runtime **0.30.3-dev**. Updating Rebel Command does not automatically install separate Work Email userscripts. Distinguish source committed, raw CDN available, app built, bridge checked in, full runtime proven, data quality, and human validated; they are not interchangeable.

## Scheduling runtime — code state vs live evidence

Scheduling branch `feature/vector-scheduling-mvp` manifest `scheduling/vector-scheduling-runtime-manifest-0.30.3.json` has 27 unique scripts. `rebel-command-ot-date-guard-0.30.3.js` loads before `rebel-scout-runtime-proof-0.30.3.js`, and `mission-vector-command-center-0.29.0.js` loads LAST to avoid auto-sync page navigation before proof modules load. Both normal raw URL and an earlier cache-bypass returned the corrected 26-module pre-guard order; after adding guard, the normal raw branch URL returned the final 27-module order (guard index 24, proof 25, command center 26). This proves source availability, **not** an installed tab.

- UI patch repairs the known assisted-input `0.30.0-dev` module overwriting shared `0.30.3-dev` manifest identity, without changing loader completeness or removing failure evidence.
- Runtime proof reports `runtime_boot/runtime_loaded` only after loader 1.0.5 complete, zero failures, runtime 0.30.3-dev, and fresh server sync-generation reconciliation. Its acknowledgment now requires HTTP success, top-level `ok === true`, explicit `scoutDiagnostic.accepted === true`, and matching diagnostic ID; HTTP error plus duplicate flag is not success.
- New exact OT date guard reads actual forecast date from the rendered ranking input and separately requires it match URL `shift_date`; it fails closed for missing, mismatched, or invalid dates and does not alter Staffing ListView date behavior. Five Node VM tests and script syntax checks passed. No browser-live validation yet.
- **As last checked:** actual active CrewSense bridge device last seen `2026-09-16T10:44:42Z`, last success `10:44:09Z`; loader 1.0.5 reported from assisted module diagnostics on ranking pages. No `runtime_boot` diagnostic is stored. Legacy assisted `module_loaded` reports `manifestRuntime:0.30.0-dev` because of its module identity collision; do not mistake this for proof of installed manifest.
- Automated Vector writes remain OFF. Do not claim a human-click trace is complete without `interaction/human_click_trace` telemetry, nor mark PREPARE or Save safe from theoretical tests.

## Rebel Command app

App `6aa6b7634a031657377d4fad`. At last test, `npm run lint` and `npm run build` passed. Command Center now has one prominent sequential Ready Room; Connections clarifies trace-only test; monitor, Dashboard and Connections query runtime proof separately so abundant `module_loaded` logs cannot bury proof. Proof must match current device, exact version, and recent timestamp (24h). Work Email screen distinguishes capture quality from manual validation and does not invent a list position. Overtime shows projected vs old exact vs fresh exact date evidence and allows action drafts only from fresh verified target-date ranking; no automatic sign-up/unsign.

## Current data / unresolved integrity

September 16–30 selection forecasts: **8 GOOD / 7 PARTIAL**. GOOD includes Sep16–17 not eligible based on trusted staffing, Sep18–19 exact date ranking captured Sep14 (now stale for action freshness), and Sep22–23/28–29 zero predicted OT. Seven PARTIAL ranking-dependent dates: **Sep20, Sep21, Sep24, Sep25, Sep26, Sep27, Sep30**; do not change their quality until real exact-date ranking is collected. Auto-sync had navigated ranking dates through October 7 without new stored ranking capture at last inspection; repaired date guard addresses one identified likely failure, unverified in live browser.

Work Email: separate reader 0.1.6 successfully captured GOOD 9/9 Inbox message list at `2026-09-16T09:55:46Z`, list-only with blank bodies, preserving row order and displayed times. Structured `validation_status=unreviewed`; older 0.1.4 validated anchor preserved. Human comparison against Outlook is needed before promoting 0.1.6 as validated. No Outlook mailbox mutation.

Reconciliation: 30 open cases, 16 role mapping (some future), 7 legacy-credit conflicts, 7 partial-day. Preserve verified credits and source provenance; do not assume a whole shift from partial segments. Michael Brion Sep16 12:30–17:30 remains raw Salary Step `[1010]` only, role/united assignment unknown; no inference. Jared Weston display/key canonical; historical source identifiers remain unchanged.

## Only next human action (AFTER proof)

If a fresh true runtime-loaded proof arrives, ask for one **TRACE ONLY**: Crew Scheduler Sep23, Jerry Weems, Truck 504, arm HUMAN CLICK TRACE, human manually opens existing assignment, retain modal long enough for snapshots, then close and CANCEL/RELEASE LOCK. No PREPARE, Save, or Delete. Verify the actual diagnostic and DOM trace before any subsequent lab step. If proof remains absent, do not ask repeated Update/refresh clicks during active sync; investigate actual page and loader status first. Future credit resolutions need individual evidence and explicit Michael decision. No writer enablement without separate PRIMARY approval.
