# Beta channel

This folder is the Mission Vector Check It test channel.

- Published Beta code: `2.3.0-rc6`.
- Current Beta status: **HOLD** after a legitimate live inspection exposed a post-submit completion-verification false stop in the hardened RC line.
- Review candidate: `2.3.0-rc10` is being independently reviewed and is **not published here yet**.
- Use Beta only for legitimate due PPE inspections during approved field validation.
- Do not create duplicate compliance inspections just to test the helper.
- Personal signatures and browser configuration are never stored in this repository.

Install/update URL for the currently published Beta code:

`https://raw.githubusercontent.com/michaelbartbrion-cmd/mission-vector-check-it/main/beta/vector-ppe-helper.user.js`

The manifest hold is intentional. Stable v2.2.0 remains the known-good fallback while the completion verifier is hardened and reviewed.
