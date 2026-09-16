# Mission Vector Check It — browser-context runtime-proof repair — September 16, 2026

Canonical PRIMARY remains **Mission Vector Check It - PRIMARY**. This is engineering evidence, not a new authoritative chat or approval.

## Observed in Michael's real CrewSense browser

Pinned loader DOM attributes `mvciLoaderVersion=1.0.5`, `mvciLoaderLoaded=27`, `mvciLoaderFailures=0`; visible shared runtime version `0.30.0-dev`, known to be overwritten by the legacy assisted-input module. `MVCI_SYNC_GENERATION_PATCH_0303.version=0.30.3-dev` and `MVCI_RUNTIME_PROOF_0303.status=not_proven`. The attempted proof exhausted six retries. `window.__mvciLiveLoader` is undefined in page DevTools, so old proof logic `loader.complete===true` could never pass in that context. This evidence establishes neither a working writer nor accepted runtime proof.

## Source correction

`scheduling/rebel-scout-runtime-proof-0.30.3.js` now reads the pinned loader's shared-DOM status when its userscript-world object is inaccessible. The 1.0.5 source hard-pins and validates the 0.30.3 manifest, publishes DOM loaded-script count only after each script executes, and the manifest lists exactly 27 scripts. DOM fallback treats precisely 27 successful loads with zero failures and the correct pinned loader as completion evidence. If the object is visible, its actual `complete===true` flag remains mandatory. An observed `0.30.0-dev` version is tolerated only for the known collision with the assisted version marker and installed 0.30.3 repair module; arbitrary wrong runtime values remain rejected. Sync generation must still reconcile successfully before sending an authenticated diagnostic, and its HTTP response must acknowledge the matching diagnostic ID. Proof IDs now differ across page boots so a previous session cannot be mistaken for current proof.

**Evidence limit:** The DOM fallback is an inference from verified loader/manifest semantics, not independent introspection of the inaccessible `complete` property. This change does not authorize CrewSense modifications.

## Validation executed

Fetched the new source directly from the GitHub feature branch into an app sandbox; `node --check` PASS. Ten offline executable scenarios PASS: isolated-world known collision, exact runtime, 26 scripts rejected, one module failure rejected, wrong loader rejected, unknown runtime rejected, missing collision marker rejected, visible loader object incomplete rejected, visible object with correct manifest complete accepted, visible object with wrong manifest rejected. Also asserted source contains server-generation reconciliation and exact acceptance gates. These are source-level/offline tests, **not a production browser test**.

## Live gate and next human interaction

No `RebelScoutDiagnostic` with `action_type=runtime_boot` and `stage=runtime_loaded` was present at the post-patch read. The user's already-open tab has the old proof code loaded and must not be described as repaired. There is no reason to repeatedly retry Console commands, Tampermonkey updates, or refresh. When the existing collector is idle and its lock has expired or been released, permit at most one coordinated future page load to fetch changed runtime source, then inspect actual backend diagnostic and snapshot for version, 27 scripts, 0 failures, completion source, legacy collision and sync generation before moving to the human trace.

**Hard stop:** No PREPARE, Save, Delete, OT signup/unsign, riding-credit mutation, PPE signature, or automated CrewSense writes. If authentic proof arrives, the only next browser action is one authorized human click trace on Jerry Weems's pre-existing September 23 Truck 504 assignment, then close and CANCEL/RELEASE LOCK, followed by engineering review. No assignment change during the trace.
