# Vector Scheduling historical reconciliation baseline — 2026-09-13

Source: private Vector Scheduling export `vector-scheduling-private-2026-09-13.json`.

This report is evidence/reconciliation support. It does **not** rewrite the established ratio ledger by itself.

## Current ratio era

- Active ratio start: `2025-09-30`.
- Verified legacy firefighter credits in the active era: **271**.
- Jared Weston: **90** credited days — Tiller 32, Firefighter 30, TADE 16, Swing 12.
- Jerry Weems: **86** credited days — Firefighter 31, Tiller 30, TADE 13, Swing 12.
- Robert Brooks: **95** credited days — Tiller 34, Firefighter 32, TADE 15, Swing 14.
- All active-era legacy credit dates conform to the confirmed C-shift 2-on/4-off calendar.

## Captured Vector evidence

- Raw observation rows in export: **1060**.
- Latest date/person observations after deduplication: **1030**.
- Latest observations with an operational time range: **478**.
- Obvious latest false matches rejected by the 0.15 hardening rule: **107**. All 107 are Michael Brion account/navigation-menu text rather than a schedule row.
- Current-era C-shift tracked-firefighter observations captured: **210 person-days across 70 C-shift dates**, with **210/210** containing valid operational time-range evidence.
- The precision parser extracts **496 segments** from the deduplicated valid observations.

## Rotation-related partial-day evidence

The following **9** C-shift firefighter person-days contain multiple rotation roles or less than 24 captured hours of a rotation role. These should be reconciled rather than silently forced into a single whole-day actual:

- `2026-02-18` — Robert Brooks: TADE 10.5h @ Truck 504 (legacy TADE).
- `2026-04-13` — Robert Brooks: Tiller 23h @ Truck 504 (legacy Tiller).
- `2026-04-13` — Jared Weston: Swing 14h @ Engine 501 (legacy Swing).
- `2026-04-20` — Jerry Weems: Tiller 12.5h @ Truck 504 (legacy Tiller).
- `2026-04-20` — Jared Weston: Firefighter 12.5h @ Truck 504 + Tiller 11.5h @ Truck 504 (legacy Firefighter).
- `2026-07-24` — Jared Weston: Swing 9h @ Medic 501 (legacy TADE).
- `2026-08-05` — Robert Brooks: Tiller 6.5h @ Truck 504 (legacy Tiller).
- `2026-08-05` — Jerry Weems: Firefighter 6.5h + Tiller 4.5h + TADE 13h @ Truck 504 (legacy Firefighter).
- `2026-08-05` — Jared Weston: TADE 11h @ Truck 504 (legacy TADE).

## Legacy-vs-Vector differences

There are **17** active-era person-days where the currently stored whole-shift legacy credit is not cleanly compatible with the captured Vector rotation-role evidence. The legacy credit remains preserved until reconciliation.

- `2026-04-20` — Jared Weston: legacy **Firefighter**; Vector evidence Firefighter 12.5h + Tiller 11.5h @ Truck 504.
- `2026-05-13` — Jerry Weems: legacy **Firefighter**; Vector evidence Tiller 24h @ Truck 504.
- `2026-06-18` — Jared Weston: legacy **TADE**; Vector evidence Firefighter 24h @ Truck 504.
- `2026-07-18` — Robert Brooks: legacy **Firefighter**; Vector evidence Swing 24h @ Medic 503.
- `2026-07-19` — Robert Brooks: legacy **Firefighter**; Vector evidence Swing 24h @ Engine 503.
- `2026-07-24` — Jared Weston: legacy **TADE**; Vector evidence Swing 9h @ Medic 501.
- `2026-07-25` — Jerry Weems: legacy **Firefighter**; Vector evidence TADE 24h @ Truck 504.
- `2026-08-05` — Jerry Weems: legacy **Firefighter**; Vector evidence Firefighter 6.5h + Tiller 4.5h + TADE 13h @ Truck 504.
- `2026-08-06` — Jerry Weems: legacy **Firefighter**; Vector evidence TADE 24h @ Truck 504.
- `2026-08-11` — Robert Brooks: legacy **Swing**; Vector evidence TADE 24h @ Truck 504.
- `2026-08-12` — Robert Brooks: legacy **Swing**; Vector evidence Tiller 24h @ Truck 504.
- `2026-08-12` — Jerry Weems: legacy **Firefighter**; Vector evidence Swing 24h @ Engine 507.
- `2026-08-12` — Jared Weston: legacy **Tiller**; Vector evidence TADE 24h @ Truck 504.
- `2026-08-17` — Robert Brooks: legacy **Firefighter**; Vector evidence TADE 24h @ Truck 504.
- `2026-08-18` — Robert Brooks: legacy **Firefighter**; Vector evidence TADE 24h @ Truck 504.
- `2026-08-23` — Jared Weston: legacy **Firefighter**; Vector evidence Tiller 24h @ Truck 504.
- `2026-08-24` — Jared Weston: legacy **Firefighter**; Vector evidence Tiller 24h @ Truck 504.

Important: a legacy `Swing` credit is treated as compatible with a Vector `Firefighter` actual because `Swing/FF` is a valid user-defined state. A raw `SWING` token is not used alone to prove Swing credit.

## Evidence after the legacy riding-credit history ends

The current legacy credit ledger ends on `2026-08-24`. The export contains the following C-shift firefighter evidence after that date:

- `2026-08-29` — Brooks Deployment 24h; Weems Truck 504 Firefighter 24h; Weston Truck 504 Tiller 24h.
- `2026-08-30` — Brooks Deployment 24h; Weems Truck 504 Firefighter 24h; Weston Truck 504 Tiller 24h.
- `2026-09-04` — Brooks Deployment 24h; Weems Truck 504 Tiller 24h; Weston Deployment 24h.
- `2026-09-05` — Brooks Deployment 24h; Weems Truck 504 Tiller 24h; Weston Deployment 24h.
- `2026-09-10` — Brooks Truck 504 Firefighter 24h; Weems Truck 504 Tiller 24h; Weston Deployment 24h.
- `2026-09-11` — Brooks Truck 504 Firefighter 24h; Weems Truck 504 Tiller 24h; Weston Deployment 24h.

These dates should not be auto-promoted to final ratio credits without plan/reconciliation evidence because a Truck 504 Firefighter actual can still represent `Swing/FF`.

## Backfill continuity

The captured all-calendar backfill stopped safely at `2026-02-18` when it could not navigate to `2026-02-17`.

Under the confirmed C-shift calendar:

- `2026-02-18` is C Shift Day 1.
- `2026-02-17` is an off day.
- the previous C-shift date is `2026-02-13` (Day 2).

The C-shift-only backfill should therefore jump from `2026-02-18` directly to `2026-02-13`, avoiding the old off-day navigation failure if the current implementation behaves as designed.

## Policy

- Keep established legacy ratio history intact until a reconciliation decision changes it.
- Store raw Vector activity and precision segments as factual evidence.
- Store final ratio accounting separately as verified `RidingCredit` records.
- Surface partial/mismatched/ambiguous cases in the Reconciliation Ready Room.
- Off-shift overtime, subs, training, deployments, leave, and other Vector activity remain historical information and do not affect C-shift riding balance.
