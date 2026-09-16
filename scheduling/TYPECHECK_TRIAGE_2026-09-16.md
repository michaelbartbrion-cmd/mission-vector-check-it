# Mission Vector Check It — typecheck triage — 2026-09-16

This is a technical issue note within the Mission's existing repository. It does not create or replace the canonical PRIMARY, authorize browser writes, or claim a live deployment.

## Verified checks

- Base44 Rebel Command `npm run lint`: PASS.
- Base44 Rebel Command `npm run build`: PASS.
- Base44 Rebel Command `npm run typecheck` (`tsc -p ./jsconfig.json`): FAIL (exit 2). Do not label the complete suite green.
- Last changes specific to this mission's readiness were `src/pages/Dashboard.jsx` (targeted, fail-closed trace retrieval) and `src/pages/Overtime.jsx` (block future-dated ranking baselines from projecting backward). The typecheck errors do not cite either of those two edited files, but they are NOT yet independently proven to be pre-existing against a clean old dependency lockfile.

## Failure buckets, representative errors

1. React forwardRef props inferred as `{}` in shared `src/components/ui/button.jsx`, `input.jsx`, `label.jsx`, and `input-otp.jsx`: `className`, `variant`, `size`, `asChild`, OTP `index` and required `maxLength` errors. Repair component prop typing consistently, not by ignoring errors.
2. `src/lib/app-params.js`: `ImportMeta.env` missing type declaration. Fix Vite-env typing without weakening runtime app-parameter handling or exposing secrets.
3. `src/pages/Actions.jsx`: tuple/union inference yields invalid React keys and a component `Icon` of invalid union type. Resolve typed tuple shape and React key safely.
4. Login/Register/ForgotPassword/ResetPassword/OAuthConsent pages: forwardRef prop errors from shared inputs/buttons and required prop mismatch in auth layout; `OAuthConsent.jsx` headers typing. Fix without relaxing authentication behavior.
5. `src/pages/Scheduling.jsx` line 18: arithmetic operands not known numeric; add explicit safe numeric conversion or proper helper typing without changing riding-credit calculations.

## Acceptance criteria

- `npm run lint`, `npm run build`, and `npm run typecheck` all pass from the actual app root (`/app`, `cwd:'.'`).
- No `// @ts-nocheck`, blanket `any` suppression, deleting typecheck script, or mutating browser controls to satisfy the compiler.
- Preserve permission scope, no-Vector-write gate, no Outlook write path, existing attribution/provenance and data-quality classifications.
- Record an app checkpoint only after all three checks, with a separate reminder that browser runtime proof/human-click trace remain pending until telemetry confirms them.

## Priority relative to live workflow

Non-blocking for lint/build-tested read-only data collection; important engineering hygiene before treating the complete verification suite as green. Do not interrupt live CrewSense collector or request human update clicks to fix this code-only problem.
