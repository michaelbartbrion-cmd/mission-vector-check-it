# Security / privacy model

- Public repository contains program code, generic department mappings, manifests, and documentation only.
- Never commit signatures, personal browser storage, Vector credentials, session tokens, diagnostic exports containing personnel-sensitive information, or inspection history exports.
- The helper's custom updater fetches JSON metadata only. It does not fetch/eval remote JavaScript.
- Tampermonkey itself owns userscript installation/update through `@updateURL` and `@downloadURL`.
- If GitHub is unreachable, the helper warns but does not fabricate an update state. A previously received explicit compatibility hold remains effective only for its bounded cache window.
- Vector remains authoritative for inspection records.
