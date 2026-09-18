# Mission Vector Check It ? Rebel Scout stability incident (2026-09-17)

## Confirmed observations
- Michael reported that Rebel Scout was crashing/freeze-locking Vector.
- Michael disabled Mission Vector Check It userscripts and confirmed Vector then worked normally.
- No isolated controlled re-enable has occurred. The precise contribution of each module is **not verified**.
- Read-only diagnostic records showed the 0.30.3-dev loader had loaded its modules earlier. This does not prove cause.

## Reproducible source-level risks
- `rebel-browser-ui-polish-0.30.3.js` previously observed the entire document and rewrote `title.innerHTML` from its own observer callback. That can produce a self-sustaining mutation loop. This module was replaced with a no-op in commit `54d48c9`.
- Assisted input previously traversed every DOM element on every child mutation, and installed a page-context XMLHttpRequest/fetch probe automatically despite field preparation being disabled.
- Multiple cosmetic UI modules ran document-wide observers. The command center could resume a persisted browser scrape and launch automatic collection when the page opened.
- The Rebel Core ledger synchronized automatically on startup and at five-minute intervals. These activities compounded page load and were not needed for a stability recovery test.

## Recovery changes (feature/vector-scheduling-mvp only)
- Userscript patch version 1.0.5.1 has an always-on stability hold that loads **zero** manifest scripts even if the userscript is enabled. The manifest protocol ID remains 1.0.5 for compatibility. Do not remove the hold without an explicit staged test.
- Replaced the two Scout presentation observers with bounded startup discovery and observers attached to the Scout root, direct children only. Removed other document-wide presentation observers.
- Disabled automatic startup/continued browser syncing, automatic page-context probe installation and automatic Rebel Core synchronization; manual functions remain in source but inaccessible while loader hold applies.
- Rate-limited metadata polling and ratio-card reattachment; cached the Rebel Core card render signature to avoid rewriting unchanged markup.
- Preserved trace-only field-preparation gate (`PREPARATION_ENABLED=false`) and prohibited CrewSense writes.

## Offline acceptance / Ready Room
1. Run `node --check` on the userscript loader and every pinned manifest file, `node scheduling/tests/*.test.js` individually, plus `git diff --check`.
2. Keep installed Scout scripts **disabled**. Recovery code on GitHub alone does not stop a previously running browser tab.
3. When Michael authorizes a controlled test, first verify a fresh loader 1.0.5.1 delivers `stability-hold` with **zero modules loaded** and Vector remains stable; do not test collection or assignments.
4. A separate, reviewable branch/version and explicit approval are required before lifting the hold and staging individual modules. Test idle navigation, CPU/memory and repeated DOM changes without writes or year-long scans. Stop immediately for a freeze or stale-date mismatch.
5. Do not describe Scout as operational, deployed or the incident as resolved based on source tests alone. Base44 changes to Postmaster and Scheduling are separate and do not verify browser safety.
