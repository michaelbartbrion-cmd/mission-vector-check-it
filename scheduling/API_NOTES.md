# Vector Scheduling API notes for this module

Canonical reference:

- https://api.crewsense.com/documentation/

Verified against the canonical Vector Scheduling API documentation on 2026-09-12:

- The page identifies itself as the single canonical Vector Scheduling API reference; older documentation is retired.
- API authentication uses OAuth 2.0 `client_credentials` for standard API key/secret integrations.
- Tokens are requested from `POST https://api.crewsense.com/oauth/access_token`.
- Subsequent API requests use the `Authorization: Bearer <token>` header.
- `client_credentials` tokens have a documented lifetime of 24 hours (`expires_in: 86400`).
- Every `/v1` endpoint requires the organization to have API access under the documented Pro-plan requirement.
- The documented integration endpoints are reachable with an app token; `GET /schedule` specifically requires an app token.
- Successful `GET` responses provide an `ETag`; polling integrations should send the prior `ETag` as `If-None-Match` and handle `304 Not Modified`.
- The schedule changelog documents `length`, `break_start`, `break_end`, and `break_length` fields under schedule assignment shifts.
- The documentation also states that `GET /time_offs` includes `length` and `real_length`; do not assume the embedded `schedule.days.time_off` shape is identical until a live response confirms it.
- Current API `v1` is documented as stable, while new optional fields may be added without notice; parsers should ignore fields they do not recognize.

## Probe versions

### v0.1

`Vector_Scheduling_Truck504_Probe_v0.1.ps1` is the original minimal read-only acquisition probe.

### v0.2

`Vector_Scheduling_Truck504_Probe_v0.2.ps1` is the preferred development probe. It adds:

- one automatic token refresh/retry after a `401`;
- clearer `403` / `422` failure messages;
- raw response preservation **before** schema normalization;
- request metadata and `ETag` capture;
- candidate-evidence preservation when one person has multiple visible assignments/time-off entries;
- tolerant capture of shift start/end/duration when fields are present;
- documented schedule shift `length` / break fields when present;
- explicit mixed-evidence labels rather than pretending one row is unquestionably authoritative;
- schema-v2 helper output for the scheduling assistant.

The v0.2 script has not yet been executed against this department's live API response. Its PowerShell logic is therefore development code until that hands-on validation occurs.

## Important implementation caution

Do **not** hard-code response fields solely from retired documentation. The probes currently expect the historically documented `days -> assignments -> shifts` and `time_off` structure because it is the best available starting point, but the actual organization response must be captured and validated before automatic reconciliation is trusted.

The v0.2 probe saves the complete raw response before checking for the expected `days` collection. If the live response differs, stop normalization and update the adapter from the preserved evidence rather than guessing.

Partial-day or overlapping evidence is especially important. A person may have more than one assignment/time-off record in a date. The planner should not convert a mixed record directly into full-day availability without reviewing duration/overlap evidence.

## Credential handling

API key/secret values are runtime-only inputs. They must never be:

- committed to this repository;
- written into a crew configuration file;
- pasted into issue/PR comments;
- included in exported observations or diagnostics.

If credentials are ever exposed, revoke them in Vector Scheduling and generate a new pair.
