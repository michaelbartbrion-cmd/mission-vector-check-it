# Mission Vector Check It — Release process

## Beta

1. Put the candidate in `beta/vector-ppe-helper.user.js`.
2. Increment **both** the userscript metadata `@version` and the in-code `const VERSION`; they must match exactly.
3. Update `beta/version.json` `latestVersion` and release notes.
4. Leave `minimumSupportedVersion` unchanged unless there is a genuine safety/compatibility reason to recall older versions.
5. Run syntax and version-comparison tests, including `rc9 < rc10`.
6. Test update connectivity from a logged-in Vector page with PPE Helper → UPDATES → CHECK NOW.
7. Test via legitimate due inspections only; do not create duplicate compliance records for software testing.
8. Obtain independent review before promotion.

## Promote to stable

1. Take the exact approved beta code.
2. Change only release metadata/channel constants and URLs required for Stable, plus version if needed.
3. Confirm `@version === const VERSION`.
4. Publish to `stable/vector-ppe-helper.user.js` and update `stable/version.json` to `status: ok`.
5. Keep `minimumSupportedVersion` at the oldest version still considered safe. Do not automatically set it equal to latest.
6. Do not change PPE form/submission logic during promotion.

## Emergency compatibility hold

Set the appropriate channel manifest `status` to `hold` or `disabled` with a clear message. New automated runs refresh compatibility status at most 15 minutes after the last successful gate check. A successfully fetched hold blocks new automated runs only; in-flight resume and manual Vector use remain available.

If a user is below `minimumSupportedVersion`, direct them to PPE Helper → UPDATES → OPEN UPDATE. Raise the minimum only for a genuine recall/known-incompatible version.

## Rollback

Publish a numerically higher userscript version containing the last known-good logic. Tampermonkey update checks are version-driven, so a rollback release must still have a newer version number.

## GitHub Actions

This repository intentionally has no `.github/workflows` directory. Static raw files are used directly; the updater requires zero GitHub Actions minutes.
