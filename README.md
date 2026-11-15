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

## November 9, 2026: SCBA and Apparatus Check extension

**Vector Rebel 3.2.63** introduces two user-approved changes to the existing production-acceptance milestone. First, the retired **Captain's Monthly** button and every monthly compliance requirement/column are removed from the active **Daily Captain Check**; it remains a read-only, two-month, per-tour PPE/SCBA-mask Item Log history audit. Second, a new **Apparatus Check** button audits official **Standard SCBA Inspection** completed history for currently assigned Truck 504, Medic 504, and Station 4 SCBA Room airpacks. Truck/Medic are due every two-day C-shift tour; Station SCBA is due **only on C-shift Mondays**, based on the existing verified 48/96 C-shift anchor and 07:00 duty-day boundary. Each required group is green only when every discovered airpack has a native completed record in the due window; missing is red, unverified history is `?`, future is blank, and station on non-Monday tours is not applicable. The scan is read-only and follows the existing Standard inventory and Item Log UI without opening official inspections. It uses present location assignments and does not claim historical transfer membership.

**Vector Rebel 3.2.64 refinement:** Apparatus Check now renders each discovered SCBA airpack in its own visible row under the Truck 504, Medic 504, or Station 4 header. Every displayed C-shift tour has individual green native-completed, red confirmed missing, yellow uncertain, blank future, or not-scheduled station marks. Group totals are derived from those same individual statuses. The last native duty-date for a successful inspection appears in the cell tooltip. The 14-airpack native inventory example is test-fixture coverage, not a claim that current assignments are fixed or that any historical inspection was actually completed.

**Acceptance remains open:** a successful merge or Node regression test does not establish that the installed browser version is current or that the authenticated Standard Item Log pagination/DOM and complete status receipts work live. SCBA submission is separate and still requires the inspector's physical verification and explicit native confirmation. No email or CrewSense write is authorized.

## November 15, 2026: SCBA native handoff stoppage and recovery

**Vector Rebel 3.2.65** addresses a concrete SCBA progression gap: after the user confirmed physical review and tapped `Start SCBA Checks`, the old native handoff clicked `Start Inspection` but only *displayed* the Vector `Select Inspection...` chooser. It did not select the known, verified **Standard SCBA Inspection** checklist. The replacement makes a one-time exact-card chooser selection for the approved `SCBA Inspection` title, then separately verifies native template **113271** and all eleven controls before prefilling reviewed answers. It never clicks `Submit Inspection` or auto-confirms that a completed inspection was recorded. A selected 3.2.64 native handoff queue can continue after the update without discarding previously recorded proposals. Incomplete or changed forms now show an explicit manual-review banner, never an automatic retry that could duplicate Pass/Fail selections; the form-opening timeout is extended to accommodate slow Vector hydration. If the chooser cannot identify the correct card, one blocker diagnostic is sent through existing Rebel Command telemetry. Actual cause of the user's current observed stop still requires the live on-screen stage/receipt; absence of prior SCBA-specific telemetry prevents retrospectively proving which gate was encountered.

**Acceptance:** static tests verify chooser safety and state preservation. Only a supervised next SCBA inspection in the authenticated browser can establish live progression. Do not submit official SCBA inspection records on the operator's behalf without physical confirmation and final inspector approval.

## November 15, 2026: SCBA native submission and next-airpack progression

**Vector Rebel 3.2.66** corrects the diagnosed full-STOP at the official SCBA form: Voyager's authenticated Vector inspection instance **9592549** was observed with all **11 Passed** responses selected and an enabled **Submit Inspection** button still waiting. The previous 3.2.65 release intentionally only filled the form and had no authorized submission path. The earlier assumption that the stop was the template chooser was not the explanation for this observed stage.

The new handoff requires the operator to physically check the SCBAs, review each item's proposed Pass / Missing / Issue answers, and explicitly tick the physical-check **and submission authorization** checkbox. Rebel then opens the exact native Standard SCBA Inspection 113271, verifies all 11 expected selected responses, and clicks the native Submit **once**. For an Issue or Missing, it locates the real FAILURE DETAILS dialog, checks the exact failing item selection and the matching operator comment, then clicks that dialog's final Submit **once**. Every click is latched before acting; a reload or ambiguous result never triggers a second submission.

The program does not advance to the next airpack or report success until it observes positive evidence for the **same exact native form instance**: either an explicit completed-date banner on that form or a completed Item Log row linking to that instance. If the receipt cannot be verified, it stops with an explicit warning and reports a de-identified telemetry blocker, rather than submitting twice or fabricating completion. Existing 3.2.65 handoff queues require a separate **I physically checked this SCBA: Submit & Continue** confirmation to grant auto-submission; upgrading never silently submits an already-filled form.

**Verification:** 239 automated Vector Rebel tests passed at development time, including DOM-based single-submit guards, required notes, exact individual receipt gates, legacy opt-in, and no duplicate submission. This is not yet authenticated live post-submission acceptance. No official SCBA inspection was submitted in development; a physically attended Vector acceptance test is still required.

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
