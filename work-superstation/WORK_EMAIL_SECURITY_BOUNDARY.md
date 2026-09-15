# Mission Vector Check It — Work Email Security Boundary

## Purpose

Work Email is a read-only work-superstation module. Outlook remains the authoritative mailbox. The browser reader exists to surface selected visible evidence in Rebel Command without giving the Mission an unrestricted mailbox-control surface.

## Separate device identity

The Outlook reader uses a dedicated Rebel Command pairing named:

`Mission Vector Work Email — Michael`

It must not reuse the CrewSense scheduling bridge identity. The private device token is stored only in Tampermonkey userscript storage for the Outlook reader.

## Allowed origins

The telemetry bridge explicitly recognizes the supported Outlook Web origins in addition to the existing CrewSense/TargetSolutions origins. Authentication is still mandatory; origin permission alone grants no access.

Supported Outlook origins:

- `https://outlook.office.com`
- `https://outlook.office365.com`
- `https://outlook.cloud.microsoft`

## Least-privilege server enforcement

A device whose display name matches `Mission Vector Work Email` is treated as a Work-Email-only device by the telemetry bridge.

It may:

- perform the ordinary authenticated heartbeat GET;
- submit `workEmailCapture` telemetry.

It may not use authenticated scheduling/action GET worklists or submit staffing, OT ranking, OT signup, scheduling-ledger, action-preview, action-verification, Scout diagnostic, usage-event, or suggestion payloads. Those requests fail closed with HTTP 403.

This restriction is enforced server-side; it does not rely on the userscript behaving correctly.

## Mailbox mutation boundary

Current Work Email reader 0.1.0 has no implementation for send, reply, forward, delete, archive, move, mark read/unread, flag/unflag, automatic message opening, or attachment retrieval. Initial live validation is `SCAN VISIBLE LIST · NO UPLOAD` only.

Full message-body capture is a separate opt-in feature and remains unimplemented until the rendered Outlook DOM is live-validated.

## Promotion rule

No capability should be promoted merely because Outlook data can be found in the DOM. Each new capability requires its own explicit Mission Vector Check It approval, a narrow server-side permission boundary, and a live fail-closed proof before it becomes operational.
