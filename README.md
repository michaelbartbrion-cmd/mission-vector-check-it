# Mission Vector Check It

**Canonical Project:** `Mission Vector Check It`  
**Canonical PRIMARY chat:** `Mission Vector Check It - PRIMARY`

This Mission owns its Vector/PPE workflows and the integration of **Vector Rebel**, **Rebel Scout**, **Rebel Postmaster**, and **Rebel Command**. Vector remains authoritative for real PPE records. Project X owns shared Engineering, operations, scheduling, and procurement rather than this Mission's domain records.

## PRIMARY continuity (2026-11-03)

Michael explicitly designated a successor conversation in this existing Project as the **sole** `Mission Vector Check It - PRIMARY` on November 3, 2026. The previous PRIMARY is retired from active authority and retained as history. Neither the Project nor the canonical PRIMARY identity is renamed. This is a continuity entry, not a new Mission or a change to the approved objective.

**Durable approved anchor:** `MISSION_VECTOR_ALIGNMENT_RECORD_V2_2026-10-03.txt`, approved plan 1.0 (existing `MVCI-Install` record). **One active milestone:** production acceptance and finalization of the integrated system. DONE WHEN still includes usable Vector PPE checking, attended Scout and read-only Postmaster acceptance, a defined Rebel Command state, rollback/support/release evidence, and no unresolved safety-critical defect.

**Binding later operating decision:** CrewSense remains read-only/collector-only and Michael makes changes manually. The Alignment Record's earlier one-time November 2 overtime write requirement was **not** formally amended. Do **not** revive that automation or mark the milestone closed without Michael explicitly amending that requirement or separately authorizing a new attended write path. Postmaster remains read-only. The old ActionPackage execution path, generalized writes, and speculative Forge Yard redesign remain parked.

## PRIMARY succession and current acceptance checkpoint (2026-11-09)

Michael explicitly designated the **current successor conversation** as the sole authoritative `Mission Vector Check It - PRIMARY` on November 9, 2026. Its immediate predecessor is **retired from active Mission authority** but preserved as historical reference. The canonical Project and PRIMARY names, application ownership, objective, and one active milestone remain unchanged. This entry supersedes earlier PRIMARY succession designations, not their historical evidence.

**Approved anchor:** `MISSION_VECTOR_ALIGNMENT_RECORD_V2_2026-10-03.txt`. **One active milestone: production acceptance and finalization.** Later explicit instructions keep Rebel Scout/CrewSense **collector-only with Michael doing CrewSense edits manually**, and Rebel Postmaster **read-only**. The Alignment V2 one-time November 2 OT write criterion is stale but **not formally amended**; it cannot justify a write or be silently marked complete. Project X retains shared Engineering/Operations/JOBS/procurement ownership. Do not send email without Michael's separate authorization.

**Verified source status as of November 9:**
- GitHub PR [#33](https://github.com/michaelbartbrion-cmd/mission-vector-check-it/pull/33) is merged, and `beta/version.json` reports **Vector Rebel 3.2.55**. A new **SCBA Airpacks** control supports independently selecting any non-empty subset of Truck 504 (63000-13), Medic 504 (61000-12), and Station 4 SCBA Supply Room for each check. Native **Equipment > Standard** filters must match; the scanner is read-only and saves **local review drafts**, not official SCBA inspections. Actual installed-user version, full inventory, official airpack inspection template, and successful official receipt are **not live-verified**.
- GitHub PR [#31](https://github.com/michaelbartbrion-cmd/mission-vector-check-it/pull/31) is merged for **Rebel IQ 0.1.21**: compact in-page Assets panel, separate from Daily Tour, with **Paratech excluded** from Michael's crew scope. The proposed default Verified review requires physical inspection/confirmation and per-item official native receipt. Real native Verified status change and user installation remain **unverified**.
- The existing Rebel Command Base44 app `6aa6b7634a031657377d4fad` reports **ready**. This is builder/build status, **not** evidence of live feature acceptance. Roster publication, error report delivery, PPE identity fixes, SCBA face mask workflow acceptance, Scout/Postmaster live attended acceptance, and final supported release remain open unless independently proven.

**Shortest acceptance path:** (1) Use installed Vector Rebel 3.2.55 with an operator-chosen SCBA location subset, match native location filters, collect the real airpack list and inspect one native official SCBA form without submitting it. (2) Physically review one eligible Rebel IQ crew asset, record once and verify the real native green Verified receipt before expanding. (3) Resolve any live PPE/roster/error defects, then complete Scout and Postmaster read-only acceptance and final release verification. Never infer official PASS, verification, submissions or completion from a draft, source commit, CI pass, or green build alone. Preselected proposed PASS answers are allowed only in user-requested review workflows; equipment certification still requires actual physical inspection and explicit operator confirmation.

## Verified snapshot, November 3, 2026

| Component | Evidence from current source/live data | Acceptance |
| --- | --- | --- |
| Vector Rebel | GitHub `beta/vector-rebel.user.js` source **3.2.44**. Rebel Command recent device telemetry still reports **3.2.41** for the known Michael/Baldree devices. | Source updated; current installation and end-to-end live PPE acceptance **unverified**. |
| Rebel Scout | GitHub `beta/rebel-scout.user.js` source **1.1.50**; latest observed collector device version **vector-bridge-1.1.50**. | Collector-only mode; current attended acceptance needs verification. |
| Rebel Postmaster | GitHub `beta/rebel-postmaster.user.js` source **1.2.12**; last observed read-only Postmaster device version **1.2.12**, last check-in October 17. | Current read-only Outlook acceptance still open. |
| Rebel Command | Existing Base44 app `6aa6b7634a031657377d4fad` status **ready**. App sandbox `npm run build` succeeded. | Build success is not proof of live/published acceptance. |
| Central shared roster | Base44 `SystemSetting` query for `vector_rebel_shared_roster` returned **zero records**. | **Not published.** The five existing `VectorPerson` records are not a verified substitute for Michael's complete master roster. |
| Error feedback | `Suggestion` query returned **zero records**. Version 3.2.43+ source contains a report-problem and automatic-error feedback path. | No live delivery receipt yet verified. |

An inspection submission, stored gear identity, other people's installation versions, or published changes must **never** be inferred from a source commit or green test suite.

On November 3, a check of the existing Rebel Command test harness initially reported **36 pass / 6 fail** because synthetic September 2026 email timestamps exceeded the bridge's 14-day validity window. Refreshing **test fixtures only**, not production ingestion logic, yielded **42 pass / 0 fail** across `telemetry-ledger-safety.test.cjs` and `rc-operator-monitoring.test.cjs`. Base44 checkpoint should be consulted for the precise test-fixture change.

## Shortest path to accepted operation

1. In the existing Rebel Command **Roster** page, import Michael's **actual** master roster exported from his Vector Rebel installation, review it, and explicitly **Publish Roster**. Do not reconstruct it from partial CrewSense/VectorPerson data. Only an approved publication becomes the shared name directory.
2. Have existing users update the same managed Vector Rebel userscript to **3.2.44** (do not create separate copies/apps), then confirm new version check-ins and fetch behavior. Check Daily Captain crew selection, PPE cleaning/repair person picker, exact Responsible Party equipment identity, and error-report receipt. Do not duplicate inspections to test.
3. Finish controlled, physically attended PPE/SCBA and Daily Captain acceptance as needed. Preserve signature, PASS/FAIL, and no-blind-retry safeguards. Continue Scout and Postmaster acceptance under the binding collector-only/read-only rules.
4. Reconcile the **older alignment write criterion** with Michael before declaring the production-acceptance milestone complete; verify supported release, recovery/rollback, and operational artifacts.

The current **human-critical dependency** is the accurate local master roster export/review/publication, followed by actual installed-user verification. This does not require another backend database, app, repository, recurring automation, or wholesale redesign.

## Managed update model and safeguards

- Managed script source: `beta/vector-rebel.user.js` with `@updateURL` and `@downloadURL`. GitHub source availability does not prove the userscript is installed or has successfully updated.
- Do not create GitHub Actions pipelines without explicit cost approval.
- Personal/local information such as signatures, inspector-specific PPE state, and private inspection answers belongs in the user's local installation and authoritative Vector system, not this public repository.
- Use Vector's exact **Responsible Party** for PPE ownership, not equipment-name prefixes.
- Never certify PASS or forge an inspection/signature without physical inspection and explicit operator confirmation; never automatically retry a failed submit or write CrewSense without fresh, specific authorization.

## Authoritative references

- Alignment: `MISSION_VECTOR_ALIGNMENT_RECORD_V2_2026-10-03.txt` (original approved authority).
- Later collector-only decision: `MISSION_VECTOR_CURRENT_STATE_COLLECTOR_ONLY_V2_2026-10-04.txt`.
- Existing Rebel Command Base44 application ID: `6aa6b7634a031657377d4fad`.
- Legacy predecessor chats and prior handoffs remain historical evidence, not a second PRIMARY.
