# Installation — Beta field test

1. Install Tampermonkey in Chrome.
2. Open the beta userscript raw URL:
   https://raw.githubusercontent.com/michaelbartbrion-cmd/mission-vector-check-it/main/beta/vector-ppe-helper.user.js
3. Tampermonkey should show its install/update screen. Install it.
4. Open Vector Check It and refresh.
5. The helper should show `v2.3.0-rc6` on the Beta channel.
6. Open **UPDATES** and click **CHECK NOW**. Confirm there is a successful timestamp. This verifies the logged-in Vector page can reach the GitHub manifest through its current CSP/network policy.
7. Personal signatures/settings remain local and must be configured by the actual inspector on that computer.

Do not perform duplicate inspections for testing. Use the candidate only during a legitimate due inspection.

If **CHECK NOW** has never succeeded, the helper will warn that remote compatibility status cannot be verified. The PPE workflow can still run, but emergency remote hold should not be treated as dependable until connectivity is fixed.
