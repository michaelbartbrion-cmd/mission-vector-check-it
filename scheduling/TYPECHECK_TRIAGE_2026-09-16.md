# Mission Vector Check It — typecheck triage — September 16, 2026

Canonical workspace remains Mission Vector Check It - PRIMARY. This is engineering continuity, not a substitute PRIMARY, approval to write, or proof of production deployment.

## Verified current state

- Rebel Command `/app`: `npm run lint` PASS, `npm run build` PASS after the September 16 shared component/typing changes.
- `npm run typecheck` FAIL (exit 2). Its output is now limited to `src/pages/Actions.jsx` at lines 30 and 56. Do not describe the full test suite as passing.
- Fixed and compiler-cleared: `button.jsx`, `input.jsx`, `label.jsx`, `input-otp.jsx` React forward-ref prop typing; optional authentication-layout props in `AuthLayout.jsx`; Vite `ImportMeta.env` types through `vite/client` in `jsconfig.json`; typed `OAuthConsent.jsx` display-request headers without altering auth or consent flow; numeric `Date.getTime()` arithmetic in Scheduling's existing C-shift calculation. OTP component preserves its children-based mode instead of accepting incompatible render-prop combinations.
- These code changes do not touch Vector save/delete/OT actions, mailbox mutation, credentials, or runtime-proof identity.

## One outstanding compile-error group

`src/pages/Actions.jsx` uses heterogeneous `['label', boolean]` arrays for its four-step progress display and `[Icon, label, count]` arrays for summary cards. JavaScript tuple inference widens keys to `string | boolean` and `Icon` to a union containing numbers and strings, producing `Key`, `ReactNode`, and invalid JSX component type errors. Replace ONLY these presentation-only tuples with named objects `{label,done}` and `{Icon,label,value}`, and destructure the named fields in the two `.map()` callbacks. Preserve all action-package transitions, read-only preview, required human confirmation, stale-preview rejection, reread and no-automated-write gates exactly as they are.

The attempted edit of Actions was blocked by the editor. Do not work around the block or suppress errors with `@ts-nocheck`, blanket `any`, removed scripts, or changed permissions. This group remains open until a normal permitted edit is available.

## Acceptance

Run `npm run lint && npm run build && npm run typecheck` from `/app`; checkpoint when all three pass. Treat a successful development build and browser runtime proof as different milestones. The browser's `runtime_boot/runtime_loaded` record and exact human-click trace remain absent as last checked; human test remains trace-only and on hold until proof. Automated Vector writes remain OFF.
