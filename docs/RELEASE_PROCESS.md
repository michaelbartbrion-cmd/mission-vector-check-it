# Release process

## Beta

1. Put the candidate in `beta/vector-ppe-helper.user.js`.
2. Increment its `@version`.
3. Update `beta/version.json`.
4. Test via a legitimate due inspection; do not create duplicate compliance records.
5. Obtain independent code review.

## Promote to stable

1. Take the exact approved beta code.
2. Change only release metadata needed for stable: `@version`, `@updateURL`, `@downloadURL`, display channel/version constants, and stable manifest URL.
3. Publish as `stable/vector-ppe-helper.user.js`.
4. Set `stable/version.json` to `status: ok`.
5. Do not change form/submission logic during promotion.

## Emergency compatibility hold

Set the channel manifest `status` to `hold` and write a clear `message`. A successfully fetched hold blocks new automated runs but never prevents manual Vector use. This is a compatibility safety gate, not remote code execution.

## Rollback

Publish a higher-version userscript containing the last known-good logic. Tampermonkey update checks are version-driven, so a rollback release still needs a numerically newer `@version`.
