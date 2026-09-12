# Vector Scheduling API notes for this module

Canonical reference:

- https://api.crewsense.com/documentation/

Verified against the canonical Vector Scheduling API documentation on 2026-09-12:

- API authentication uses OAuth 2.0 `client_credentials` for standard API key/secret integrations.
- Tokens are requested from `POST https://api.crewsense.com/oauth/access_token`.
- Subsequent API requests use the `Authorization: Bearer <token>` header.
- `client_credentials` tokens have a documented lifetime of 24 hours (`expires_in: 86400`).
- Every `/v1` endpoint requires the organization to have API access under the documented Pro-plan requirement.
- `GET /schedule` specifically requires an app token.
- Successful `GET` responses provide an `ETag`; polling integrations should use `If-None-Match` and handle `304 Not Modified`.
- The documentation explicitly states that the current page is canonical and older Vector/CrewSense API documentation is retired.

## Important implementation caution

Do **not** hard-code response fields solely from retired documentation. The read-only probe currently expects the historically documented `days -> assignments -> shifts` and `time_off` structure because that is the best available starting point, but the actual organization response must be captured and validated before automatic reconciliation is trusted.

The probe preserves the full raw response specifically so the adapter can be corrected without losing evidence.

## Credential handling

API key/secret values are runtime-only inputs. They must never be:

- committed to this repository;
- written into a crew configuration file;
- pasted into issue/PR comments;
- included in exported observations or diagnostics.

If credentials are ever exposed, revoke them in Vector Scheduling and generate a new pair.
