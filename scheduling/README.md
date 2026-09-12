# Vector Scheduling Assistant (development)

This is a **read-only planning and reconciliation module** for Mission Vector Check It. It is intentionally separate from the PPE execution paths in Vector Rebel.

Vector Scheduling remains the authoritative scheduling record. This module does **not** create, modify, move, or delete Vector Scheduling assignments.

## Goal

Close the loop around apparatus position rotation:

1. Read future Vector Scheduling availability.
2. Recommend the next position assignment from confirmed historical rotation ratios.
3. Save the plan without counting it as history.
4. Read Vector again after the shift.
5. Compare the plan with what actually happened.
6. Add only verified/inferred actual outcomes to rotation history.
7. Flag ambiguous outcomes for review instead of guessing.
8. Use the updated actual history for the next recommendation.

## Preferred Vector data path

The preferred integration path is the official **read-only Vector Scheduling API**, not DOM scraping.

The current official Vector API documentation confirms that `GET /v1/schedule` is an integration endpoint, uses `start`/`end` date parameters, and requires an app token obtained with the OAuth `client_credentials` flow. API credentials must remain local/runtime-only and must never be committed.

`scheduling/Vector_Scheduling_Truck504_Probe_v0.1.ps1` is the first read-only acquisition utility. It:

- loads a local crew configuration file;
- prompts locally for API key/secret;
- requests an app access token;
- reads `GET /v1/schedule` for a date range;
- preserves the raw API response;
- extracts configured crew members from assignments/time off;
- exports helper-compatible observation JSON plus a readable CSV;
- performs no Vector writes.

A browser/DOM reader remains a fallback/prototyping path until the API output is validated against real Vector views.

## Rotation model

The firefighter balancing categories are:

- `Firefighter`
- `Swing`
- `Tiller`
- `TADE`

Detail values normalize to rotation credit as follows:

- `Swing` -> **Swing**
- `Swing/FF` -> **Swing**
- `Swing Sub` -> **Swing**
- `Firefighter` -> **Firefighter**
- `FF Sub` -> **Firefighter**
- `Tiller` -> **Tiller**
- `TADE` -> **TADE**

`Swing` and `Swing/FF` remain different historical outcomes. The detail is retained, but both receive the same Swing rotation credit because both represent that firefighter taking the Swing turn.

## Fairness calculation

For each tracked firefighter:

`position credits / all credited rotation opportunities for that firefighter`

The engine tests every legal permutation for the current scenario and ranks assignments by the sum of squared differences between firefighters' position ratios. This is intended to preserve the balancing behavior that has worked in the legacy spreadsheet rather than impose a target such as 25% for every role.

The balance window is configurable. The same assignment across a two-day shift block can be scored as two projected credits.

## Current role sets

### Normal

Three tracked firefighters present:

- Firefighter
- Tiller
- Swing

Two tracked firefighters present:

- Firefighter
- Tiller

### TADE required

Three tracked firefighters present:

- Firefighter
- Tiller
- TADE

Two tracked firefighters present:

- Tiller
- TADE

Nonstandard staffing days are reviewable exceptions rather than forced into one of these role sets.

## Reconciliation rules

The system distinguishes **plan**, **observed Vector state**, and **rotation credit**.

Examples:

- Planned Swing + still on the home apparatus as FFB -> `Swing/FF`, Swing credit.
- Planned Swing + moved to another working assignment -> `Swing`, Swing credit.
- Planned Tiller + visible `TM` -> Tiller credit.
- Planned TADE + visible acting driver/engineer duty -> TADE credit.
- Planned Firefighter + visible home-apparatus FFB -> Firefighter credit.

Without a saved plan, home-apparatus FFB is intentionally ambiguous because it could be true Firefighter or Swing/FF. Likewise, being observed elsewhere without a saved plan may be Swing or a staffing move. Ambiguous outcomes become review items rather than guessed history.

## Historical completeness

The legacy spreadsheet eventually changes from manually coded position outcomes to raw Vector-report lookups. Those later rows are observations/availability, not automatically credited position history.

The prototype therefore detects unresolved past working observations and marks recommendations **PROVISIONAL** until the missing outcomes are reconciled. This prevents an incomplete recent history from silently appearing complete.

## Data/storage safety

The repository is public, so real crew names, schedules, history, local configuration, API exports, API keys and secrets are **not committed here**. Use `crew-config.example.json` only as a template; real configuration stays local.

The browser prototype stores settings, plans, observations, reviews, resolutions, and history under local storage key:

`missionVectorScheduling_v1`

## Repository components

- `rotation-engine.js` — pure tested fairness/reconciliation logic; no Vector access.
- `test-engine.js` — Node tests for the pure engine.
- `Vector_Scheduling_Truck504_Probe_v0.1.ps1` — read-only official API acquisition/export utility.
- `crew-config.example.json` — privacy-safe local configuration template.
- `DATA_MODEL.md` — plan/observation/history/review model.
- `KNOWN_LIMITATIONS.md` — unresolved validation targets.

The richer browser panel is still a local development prototype and is not promoted into Beta/Stable Vector Rebel. It should not be published until the official API response and/or live page DOM have been validated against real Vector data.

## Development tests

`test-engine.js` verifies:

- Swing, Swing/FF and Swing Sub all normalize to Swing credit;
- FF Sub normalizes to Firefighter;
- fairness math;
- Normal and TADE-required role sets;
- Swing vs Swing/FF reconciliation;
- ambiguity handling without a pre-plan;
- Tiller/TADE inference;
- date/shift parsing;
- two-day projection scoring;
- configurable balance-window filtering.
