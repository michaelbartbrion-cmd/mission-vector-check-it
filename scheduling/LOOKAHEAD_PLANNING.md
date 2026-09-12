# Lookahead planning model

## Why next-block-only scoring is not enough

The legacy Truck 504 workflow does not operate in isolation one shift at a time. Future time off and future staffing constraints matter because a locally ideal position assignment can make later blocks harder to balance.

The scheduling engine therefore needs two related views:

1. **Immediate fairness** — what the ratios look like after the next planned block.
2. **Horizon fairness** — what the ratios can look like after several future blocks, given the availability and staffing constraints already visible in Vector Scheduling.

The first block remains the only commitment the user needs to make now. Later blocks are planning evidence, not assumed outcomes.

## Private retrospective evidence

A private retrospective test of the legacy workbook found two standard two-day blocks where the one-block fairness engine ranked the historical assignment outside its top three choices:

- 2026-01-31: historical first-block choice ranked 5 of 6 with next-block-only scoring.
- 2026-04-01: historical first-block choice ranked 4 of 6 with next-block-only scoring.

When the same starting history was evaluated with future staffing/role constraints from later blocks:

- the 2026-01-31 historical choice became rank 1 with a 12-block lookahead;
- the 2026-04-01 historical choice became rank 1 with a 10-block lookahead.

This is strong evidence that future constraints can explain choices that look suboptimal in isolation. It is **not proof of the exact reason the historical human decision was made**, because the retrospective test necessarily knows later staffing/role-set evidence. The result should be used to justify a lookahead planner, not to invent undocumented personnel preferences or penalties.

No private names or source-history rows are committed with this note.

## Horizon planner

`scheduling/horizon-planner.js` is a pure planning module layered on top of `rotation-engine.js`.

Each future block can supply:

- `date` / `label`
- `availableIds`
- `scenario` (`normal` or `tade-required`)
- `repeatCount` (normally 1 or 2)
- optional exact `roles`
- optional `fixedAssignmentByPerson`

For each legal first-block assignment, the planner searches the future blocks and returns the best achievable final fairness score. State-equivalent paths are deduplicated, and a configurable maximum state count prevents unbounded search growth. Final fairness is the primary rank; cumulative intermediate fairness is a tiebreaker.

The planner intentionally tolerates future blocks that cannot be safely auto-planned. Those blocks can be marked skipped while the rest of the horizon remains usable. A caller may disable that behavior when strict completeness is required.

## Intended UI behavior

The development browser assistant should offer at least:

- Next block only
- 6-block lookahead
- 12-block lookahead
- 18-block lookahead

Lookahead must use only future dates for which schedule evidence is actually loaded. It must make clear how many future blocks were used and whether any were skipped for incomplete/ambiguous evidence.

Choosing a recommendation should save only the current block unless the user explicitly chooses to commit a longer plan. The future sequence is advisory and should be recalculated whenever Vector availability changes.

## Safety / authority boundary

Lookahead planning does not change the source-of-truth hierarchy:

- Vector Scheduling remains authoritative for schedule observations and future availability.
- A recommendation is advisory.
- A saved plan is intent, not actual history.
- Actual rotation credit is created only after reconciliation or explicit review.
- No Vector write operations are part of this module.
