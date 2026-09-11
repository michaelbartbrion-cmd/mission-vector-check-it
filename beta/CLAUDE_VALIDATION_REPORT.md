# Vector Rebel v2.3.10 — final validation report

**Deliverable:** `Vector_PPE_Helper_v2.3.10.user.js` (359,501 bytes)
**SHA-256:** `56e8e3f4c93ea4fddeeed85fea2eb8538b7793593bd5aa15d0d8f68d914b6cff`
`@name Vector Check It - PPE Helper` · `@version 2.3.10` · `@grant none` · no `@require` ·
`@updateURL`/`@downloadURL` unchanged.

**Verdict on v2.3.9: it would have failed in production.** It fixes nothing that was broken and
passes only the two layouts that already worked. Offline suite: **7 passed, 10 failed.**

---

## 1. Root cause

**`Node.textContent` concatenates sibling cells with no separator, so the date token loses its word
boundary and every history row is rejected.**

Vector renders one record across six sibling cells:

```html
<span>06/01/2026</span><span>Michael Brion</span><span>Inspection</span>…<span>Tour PPE Routine Inspection COMPLETE</span>
```

`row.textContent` yields, with no spaces inserted:

```
06/01/2026Michael BrionInspectionStation 5Flower Mound Fire Department (TX)Tour PPE Routine Inspection COMPLETE
```

`historyDateTokenPresent()` tests `/\b\d{1,2}[\/-]\d{1,2}[\/-]\d{4}\b/`. The trailing `\b` requires a
non-word character after `2026`; the next character is `M`. Measured:

```
textContent : date token -> false   mode title -> true   COMPLETE -> true
innerText   : date token -> true
```

Every row therefore failed `textLooksLikeCompletedInspectionEntry()` and the parser returned zero —
**while `diagnosticCandidateLines()` used `el.innerText || el.textContent`**, and a real browser's
`innerText` *does* insert the separators. That is the precise reason the diagnostic could print

```
"09/10/2026 [REDACTED_NAME] Inspection Tour PPE Routine Inspection COMPLETE"
```

at the exact moment the verifier recorded `baselineCount: 0, postSubmitCount: 0`. The Item Log was
never missing. Two code paths in the same file were reading the same elements through two different
text APIs, and only one of them inserted cell boundaries.

A second, independent defect compounded it: `findItemLogHistoryTable()` requires header cells to be
`<th>` or `[role="columnheader"]`. Production Vector's header row is neither, so
`itemLogTableFound: false`. Control fell to the text path — which then excluded
`el.closest('table,[role="table"],[role="grid"]')`. If the Item Log *is* a table without `<th>`, both
paths reject it: the semantic path for lack of headers, the text path for being inside a table.

### Why v2.3.9 does not fix it

v2.3.9 widened the fallback selector to include `span,a,dt,dd,label,time,strong,b` and switched
**one** call site to `el.innerText || el.textContent`. But:

1. `rowHasCompletedStatus()`, `rowLooksLikeCompletedModeEntry()`, `itemLogRowKeys()`,
   `readItemLogSnapshot()` and `modeHistoryEntries()` all still read `row.textContent`.
2. The `table,[role="table"],[role="grid"]` exclusion is unchanged, so the production shape is still
   rejected by both paths.
3. `innerText` is a layout-dependent, non-deterministic API — it is not available for unrendered
   elements and is expensive to read in a poll loop.

Measured against the offline suite, v2.3.9 returns **0 rows** for nested div rows, split notes,
duplicate same-day rows, another inspector, Captain's smart apostrophe, lazy-render, and the
production table-without-`<th>` shape.

---

## 2. Exact functions changed

Scope is the Item Log row-reading layer only.

| Function | Change |
|---|---|
| `itemLogRowText()` | **New.** Joins every descendant text node with a single space. Deterministic, layout-independent replacement for `innerText`. **This is the root-cause fix.** |
| `rowHasCompletedStatus()` | Reads `itemLogRowText()` instead of `textContent`. |
| `rowLooksLikeCompletedModeEntry()` | Same. |
| `historyContainerHeaderText()` | Falls back to the first row's plain cells when no `<th>`/`[role="columnheader"]` exists, requiring ≥3 exact header-label matches so an ordinary data row can never be mistaken for a header. |
| `ITEM_LOG_HEADER_LABELS` | **New** constant. |
| `ITEM_LOG_ROW_CANDIDATE_SELECTOR` | **New.** Includes `td`, `[role="cell"]`, `[role="gridcell"]`, inline elements. |
| `itemLogAnchorElements()` | **New.** Visible elements whose reconstructed text carries the mode title and `COMPLETE`, smallest first. |
| `reconstructItemLogRowFromAnchor()` | **New.** Walks up ≤16 levels to the smallest ancestor that also carries exactly one date token. Layout-agnostic: works for `<tr>`, ARIA rows, and nested divs. |
| `structuralItemLogRows()` | **New.** Reconstructed rows in DOM order, innermost kept, de-duplicated by **element**, multiplicity preserved. |
| `textHistoryEntryElements()` | Rewritten on top of `structuralItemLogRows()`. Blanket table/grid exclusion removed. |
| `itemLogCompletedRowSource()` | **New.** Three ordered paths with a reported `parserPath`: `semantic-container` → `structural-outside-container` → `structural`, plus `semantic-container-empty` / `history-region-empty`, or `null` when unreadable. |
| `itemLogCompletedRowElements()` | Thin wrapper over the above. |
| `itemLogRowKeys()`, `readItemLogSnapshot()`, `modeHistoryEntries()` | Use `itemLogRowText()`; snapshot now carries `parserPath`. |
| `assetPageCompletedTextEvidence()` | **New.** Generic page scan used **only** to detect parser failure. Never feeds a count and is never completion evidence. |
| `openInspectionForCurrentAsset()` (baseline block) | **New guard:** if the settled baseline is 0 **and** the generic scan can see completed entries for this mode, throw instead of recording a confident zero. Records `itemLogParserPath`. |
| `compactHistoryRowText()` | **New.** 140-char, name-redacted row text for admin diagnostics. |
| `completionEvidence()` (history block) | Records `parserPath`, `rowCount`, and redacted baseline/post-submit/added row texts. Decision logic unchanged. |
| `advanceRun()` | One added diagnostics field (`itemLogParserPath`). Nothing else — verified by diff. |
| `showRunSummary()` admin block | Renders parser path, rows read, added row, and post-submit rows. |

**The baseline guard matters as much as the parser fix.** It is what turns this class of failure from
silent (`0 → 0`, "Verification needed", no idea why) into a named, fail-closed stop naming the row
count the parser could not read.

---

## 3. Offline test harness and results

`offline_harness/` — jsdom-based. It does **not** re-implement anything: `harness.js` lifts the real
function source out of a given userscript by name and evaluates it against a jsdom document, so the
code under test is the code that ships. `fixtures.js` models the real column set
(`DATE | PERSONNEL | LOCATION TYPE | LOCATION | RESPONSIBLE PARTY | NOTES`) and always includes the
Schedule Inspections cards, which repeat all three mode titles verbatim.

```
node offline_harness/run_tests.js <userscript>
```

| Case | v2.3.9 | v2.3.10 | Path taken |
|---|---|---|---|
| A semantic table | PASS 5 | **PASS 5** | semantic-container |
| B ARIA grid | PASS 5 | **PASS 5** | semantic-container |
| C nested div rows, sibling cells | **FAIL 0** | **PASS 5** | structural |
| D notes: title + COMPLETE split over lines | **FAIL 0** | **PASS 5** | structural |
| E duplicate identical same-day rows | **FAIL 0** | **PASS 6** | structural |
| E2 duplicates keep distinct keys | — | **PASS** (6/6 distinct) | |
| F another inspector counted in total | **FAIL 0** | **PASS 6** | structural |
| G Captain's U+2019 vs config U+0027 | **FAIL 0** | **PASS 2** | structural |
| H no new row → must not confirm | PASS | **PASS** (5→5) | |
| I exactly one new row → confirms | **FAIL** | **PASS** (5→6) | |
| I2 identical same-day new row → confirms | **FAIL** | **PASS** (6→7) | |
| J two new rows → must not confirm | PASS | **PASS** (5→7) | |
| K lazy-render empty state | PASS | **PASS** | |
| K2 lazy 0 → 1 confirms | **FAIL** | **PASS** (0→1) | |
| L unrelated page text with same title | PASS | **PASS** (0 rows) | |
| M table markup without `<th>` (production) | **FAIL 0** | **PASS 5** | semantic-container |
| M2 production shape confirms one new row | **FAIL** | **PASS** (5→6) | |

**v2.3.9: 7 passed, 10 failed. v2.3.10: 17 passed, 0 failed.**

H, J and L are the conservatism tests — v2.3.9 "passed" H and J only because it read zero rows in
every case, which is passing for the wrong reason.

Parser-failure guard, measured:

```
populated log -> structural rows: 5 | text evidence: 6   (rows read; no throw)
page chrome   -> structural rows: 0 | text evidence: 0   (no false parser-failure)
empty log     -> structural rows: 0 | text evidence: 0   (legitimate zero baseline accepted)
```

**Documented fail-closed edge:** `reconstructItemLogRowFromAnchor()` requires exactly one date token
in the reconstructed row. If a future Vector layout puts two records in one container with no
per-record element, the walk yields no rows, the baseline guard fires, and history confirmation is
disabled with a named reason. That is an intentional loud stop rather than a silent undercount.

---

## 4. Click-site inventory — before and after

Identical. Extracted, sorted, and diffed between v2.3.9 and v2.3.10:

```
2 .click()          1 first.click()        1 next.click()        1 sign.click()
1 a.click()         1 importFile.click()   1 ppe.click()         1 startButton.click()
1 card.click()      2 mainSubmit.click()   1 previous.click()    1 tab.click()
1 confirmButton.click()  1 modalSubmit.click()  1 retryPpe.click()
1 done.click()      1 equipment.click()
>>> IDENTICAL
```

No Submit call site added, removed, moved, or renamed.

---

## 5. Proof irreversible Submit behaviour is unchanged

Byte-identical to v2.3.9 (md5 of extracted function source):

```
SAME fillLiveForm                      SAME evaluatePostSubmitReturnCandidate
SAME applyNextSignature                SAME clearPostSubmitReturnCandidate
SAME submitFailureModal                SAME persistDiagnosticRunState
SAME processLiveInspection             SAME waitForFinalCompletion
SAME resumeRun                         SAME waitFailedOutcome
SAME saveRun
```

`advanceRun` is the only submit-adjacent function that differs, and the entire diff is one line:

```
> itemLogParserPath: run.itemLogParserPath || '',
```

inside the `verificationDiagnostics` object. No control flow changed.

```
$ node verify_irreversible_submit_invariant.js Vector_PPE_Helper_v2.3.10.user.js
PASS: irreversible-submit persistence invariant verified by click identity.
```

- Both `mainSubmit.click()` sites remain preceded by fail-closed `saveRun(run)` — `processLiveInspection` is byte-identical.
- `modalSubmit.click()` remains preceded by fail-closed `saveRun(run)` — `submitFailureModal` is byte-identical.
- Weak `post-submit-return-` evidence still never clicks Submit — `evaluatePostSubmitReturnCandidate` is byte-identical.
- Ambiguity still fails closed: `count-not-exactly-plus-one`, `no-identifiable-new-row`,
  `multiple-new-rows`, `added-row-did-not-match` and `baseline-unavailable` all fall through to the
  flagged weak path; none clicks anything.
- Same-page sentinel, cross-tab owner lock, unknown-template hard stop, signature rotation, local
  settings, Captain Sets and roster code: untouched (not in the diff).
- Surface: exactly **1** `fetch` (update manifest); **0** matches for `eval`, `new Function`, `GM_*`,
  `XMLHttpRequest`, `@require`.
- **No DOM writes.** No mirror table, no injected `COMPLETE`/`INCOMPLETE` tokens, no hidden proof
  rows. v2.3.10 only reads.

---

## 6. Admin-only diagnostics

Run Summary → **Admin Details** (gated on `isAdminUnlocked()`), per item:

```
Item Log verification: confirmed
baseline: 5 · post-submit: 6 · stable reads: 3
row ids: occurrence keys
parser path: structural · rows read: 6
added keys: txt:1f9k2x#1
added row: 09/11/2026 [REDACTED_NAME] Inspection Station 5 …
post-submit rows:
  09/11/2026 [REDACTED_NAME] Inspection …
  09/10/2026 [REDACTED_NAME] Inspection …
```

Covers every requested field: parser path, row count, baseline count, post-submit count, row keys,
added keys, and compact redacted row texts (140 chars, names redacted via the existing
`redactDiagnosticText`). Also written to `verificationDiagnostics` and exportable through
**DOWNLOAD RUN SUMMARY (JSON)**. The normal completion screen is unchanged.

---

## 7. Install

Replace the script in Tampermonkey. Confirm the panel reads **v2.3.10** before the next inspection.

Expected on the next real run: evidence beginning `itemlog-confirmed-plus-one-…` and no
"Verification needed" banner. If it is still flagged, Admin Details now names the parser path and the
row count, so the failing condition is identified rather than inferred.

Per your instruction, no live test is recommended on the strength of analysis alone — the parser is
validated offline against all twelve required layouts plus the production table-without-`<th>` shape,
using the shipped code.
