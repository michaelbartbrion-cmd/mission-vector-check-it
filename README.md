# Mission Vector Check It

Standalone Mission within the Project X framework for tools that make Vector Solutions Check It PPE workflows faster and easier to use. Vector remains the authoritative record system.

## Managed update model

This repository is intentionally static and uses **no GitHub Actions workflows**. Tampermonkey checks the raw `.user.js` file using `@updateURL` / `@downloadURL`; reading raw GitHub files does not require a GitHub Actions run.

- `beta/` — Michael/testing channel.
- `stable/` — normal-user channel after promotion.
- `version.json` — status/version metadata. It never contains executable code and the helper never evals remote JavaScript.

Personal/local data such as signatures, inspector identity, local PPE prefix, Captain list, local exceptions, history, and diagnostics stays in each user's browser and is not committed here.

## Current state

- Published Beta code: `2.3.0-rc6`, currently **HOLD** after a legitimate live inspection exposed a post-submit completion-verification false stop in the hardened RC line.
- Review candidate: `2.3.0-rc10`, not published yet. It adds delayed/stable return-to-asset evidence plus diagnostic capture and audit visibility; it must clear independent review before Beta publication.
- Stable: v2.2.0 remains the known-good fallback; managed stable promotion is held pending legitimate live validation and final review.

Do not create duplicate compliance inspections solely to test the helper.

## No Actions

Do not add `.github/workflows` unless Michael explicitly decides a workflow is worth the Actions cost. The updater itself needs **0 Actions minutes**.
