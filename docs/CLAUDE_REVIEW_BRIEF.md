# Claude independent review — v2.3.0-rc5 managed updater

Review `beta/vector-ppe-helper.user.js` independently. Do not assume prior findings are fixed merely because earlier reviews said so.

## Primary review goals

1. Confirm the new managed-update code cannot cause or authorize duplicate PPE submissions.
2. Confirm `@updateURL` / `@downloadURL` point only at the intended GitHub Beta raw path and use no GitHub Actions.
3. Confirm the helper never downloads and `eval`s/executes remote JavaScript. The only custom remote fetch should be `version.json`.
4. Review version comparison semantics for stable vs prerelease values (`2.3.0-rc5` < `2.3.0`).
5. Review manifest validation and malformed/unknown-status behavior.
6. Review the compatibility hold: it should block only NEW automated runs after a successful explicit `hold`/`disabled` manifest or an unsupported minimum version; manual Vector use must remain possible.
7. Review network-failure behavior. An unreachable GitHub host should not falsely report success and should not destroy local PPE settings/signatures.
8. Confirm updater state contains no signatures or personal PPE configuration.
9. Confirm the Updates UI escapes all remote manifest strings before rendering and does not introduce XSS.
10. Confirm `OPEN UPDATE` cannot be redirected to an arbitrary origin by a malicious/malformed manifest; if it can, recommend URL allowlisting.
11. Confirm current rc4 PPE inspection/form/submission logic was not inadvertently changed except for the intended pre-run compatibility gate and update UI.
12. Re-check the rc3/rc4 safety properties most likely to regress: asset identity, search stabilization, completion evidence, stopped-run recovery, signature rotation, multi-person Captain mode, local Captain list persistence.

## Repository / operations review

- Confirm there is no `.github/workflows` directory and the design needs zero GitHub Actions minutes.
- Confirm `stable/` is held and does not accidentally publish the unvalidated candidate.
- Review `docs/RELEASE_PROCESS.md` for a safe promotion/rollback procedure.

Classify findings as BLOCKER / HIGH / MEDIUM / LOW and give exact code locations and recommended fixes.
