# Mission Vector Check It — Security / privacy model

- Public repository contains program code, generic department mappings, manifests, and documentation only.
- Never commit signatures, personal browser storage, Vector credentials/session tokens, or diagnostic/history exports containing personnel-sensitive information.
- The helper fetches JSON update metadata only. It never downloads/evals remote JavaScript itself.
- Tampermonkey owns userscript installation/update through pinned `@updateURL` / `@downloadURL` paths.
- OPEN UPDATE uses the locally pinned URL constant, not a URL read from localStorage.
- Manifest `installUrl` and `repoUrl` are validated against pinned constants before storage.
- The helper remains `@grant none` in rc6 to preserve the proven execution environment. Therefore manifest fetch is subject to the Vector page's CSP. UPDATES → CHECK NOW must succeed on a logged-in Vector page before emergency remote hold is treated as dependable.
- If GitHub has never been reached successfully, the helper explicitly warns that compatibility status cannot be verified. It fails open so normal required inspections are not blocked solely by GitHub/CSP failure.
- A previously fetched hold blocks only within its bounded cache window; an expired hold that cannot be reverified produces an explicit warning.
- Signatures and personal configuration remain local to the browser.
- Vector remains authoritative for official inspection records.
