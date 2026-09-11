# Vector Rebel v2.3.10 — independent final review

Candidate SHA-256:
`56e8e3f4c93ea4fddeeed85fea2eb8538b7793593bd5aa15d0d8f68d914b6cff`

## Independent checks performed
- Exact SHA matches Claude's reported SHA: PASS
- `node --check`: PASS
- Metadata version: 2.3.10
- `@name`: unchanged (`Vector Check It - PPE Helper`)
- `@updateURL` / `@downloadURL`: unchanged
- `@require`: none
- Submit/click call-site inventory versus v2.3.9: identical (19 `.click()` call sites)
- `fillLiveForm`: byte-identical
- `applyNextSignature`: byte-identical
- `submitFailureModal`: byte-identical
- `processLiveInspection`: byte-identical
- `resumeRun`: byte-identical
- `saveRun`: byte-identical
- `waitForFinalCompletion`: byte-identical
- `waitFailedOutcome`: byte-identical
- `evaluatePostSubmitReturnCandidate`: byte-identical
- `clearPostSubmitReturnCandidate`: byte-identical
- `persistDiagnosticRunState`: byte-identical
- Main irreversible Submit sites remain fail-closed behind `saveRun(run)`
- Failure-details Submit remains fail-closed behind `saveRun(run)`

## Independent browser parser validation
I ran the shipped parser functions in a real headless Chromium browser against the same fixtures.

v2.3.9:
- 7 passed
- 10 failed

v2.3.10:
- 17 passed
- 0 failed

Passing v2.3.10 cases include:
- semantic table
- ARIA grid
- nested sibling-cell div rows
- split NOTES title / COMPLETE
- duplicate identical same-day rows
- another inspector on the same asset
- smart apostrophe Captain's title
- no new row
- exactly one new row
- identical same-day new row
- two new rows rejected
- lazy-render 0 -> 1
- unrelated Schedule Inspections text not counted
- table layout without `<th>`
- one-new-row confirmation on that production-style table shape

## Root cause confirmed
The production failure was caused by row parsing through `textContent`, which concatenates sibling
cells without separators (`09/11/2026Michael Brion...`). That breaks the date-token boundary test.
The diagnostic path used `innerText`, which is why diagnostics could see history while the verifier
counted zero. v2.3.10 fixes this at the row-reading layer with deterministic text-node joining.

This package contains the exact reviewed userscript bytes and the matching beta `version.json`.
