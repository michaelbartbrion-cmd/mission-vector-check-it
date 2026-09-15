# Mission Vector Check It — Rebel Command Work Email

Status: **planning / discovery**
Date: 2026-09-15

## Objective

Add read-only work-email awareness to Rebel Command without creating a second authoritative mailbox and without requiring Microsoft Graph/Outlook OAuth while the organization requires admin justification.

Outlook/Microsoft 365 remains authoritative. Rebel Command stores only evidence needed for Michael's work-superstation views.

## Current access decision

The native ChatGPT/Outlook path reaches the organization's Microsoft admin-consent justification workflow. That route is paused.

The fallback architecture is:

**already-authenticated Outlook Web rendered UI → read-only userscript → authenticated Rebel Command telemetryBridge → WorkEmailCapture / WorkEmailMessage → Rebel Command Work Email page**

No credentials are scraped. No Microsoft tokens/cookies are copied into Rebel Command. The browser reader uses the existing Rebel Command device-token pattern only for sending sanitized evidence to Rebel Command.

## Safety boundary

The initial reader MUST NOT:

- send or reply
- delete
- archive
- move messages
- mark read/unread
- set/clear flags
- click message rows automatically
- open attachments
- capture hidden/non-rendered mailbox content

Version 0.1.0 is **list-only discovery**. It scans credible visible message rows, locally displays how many candidates it found, and uploads only after Michael explicitly presses **Capture visible list**. Captures are marked `partial` until Outlook DOM mapping is live-validated.

Full-body capture is intentionally not implemented in 0.1.0. A later version may support body capture only when Michael deliberately opens a message and explicitly requests capture.

## Rebel Command entities

### WorkEmailCapture

Tracks one browser capture:

- capture_id
- device_id
- source / source_version
- mailbox_hint
- captured_at
- folder_name
- visible_count
- message_count
- quality
- notes

### WorkEmailMessage

Stores message evidence:

- message_key
- capture_id / captured_at
- folder_name
- sender_name / sender_address
- subject
- received_at
- preview_text
- body_text (opened-message level only)
- is_unread
- is_flagged
- has_attachments
- web_url
- capture_level (`list` or `opened_message`)
- source

Messages are upserted by `message_key`, preserving a previously captured body if a later list-only refresh sees the same message.

## Backend ingestion

`telemetryBridge` accepts an authenticated POST member named `workEmailCapture`.

The backend:

1. requires an authenticated Mission Vector device with an owner,
2. validates capture ID/time,
3. limits each capture to 150 messages,
4. sanitizes/truncates text fields,
5. deduplicates the capture ID,
6. upserts messages by stable message key,
7. preserves prior opened-message body evidence when later list-only refreshes arrive,
8. records capture quality,
9. updates TelemetryDevice activity/success metadata.

## Browser discovery reader

File:

`work-superstation/outlook-web-reader-0.1.0.user.js`

Branch:

`feature/work-superstation-email`

Current matching hosts:

- outlook.office.com
- outlook.office365.com
- outlook.cloud.microsoft

The reader uses Tampermonkey private script storage for Rebel Command endpoint/device/token configuration. It does not use page localStorage for secrets.

## Rebel Command UI

A `/work-email` page exists and currently provides:

- capture status
- captured-message count
- unread-at-capture count
- flagged count
- deliberately opened-message body count
- search
- unread/flagged filters
- message evidence view
- authoritative Outlook link when available
- explicit read-only boundary statement

The Command Center includes a Work Email card. Data Collection includes the discovery-reader status and script link.

## Validation plan

Human input is not needed until this point:

1. Open the already-authenticated work mailbox in Outlook Web.
2. Install/open the Work Email Reader 0.1.0.
3. Configure Rebel Command pairing once.
4. Press **Scan visible list · no upload**.
5. Compare candidate count and parsed sender/subject evidence against the visible inbox.
6. If accurate, press **Capture visible list** once.
7. Confirm Rebel Command receives a `partial` capture and displays the same messages.
8. Inspect DOM diagnostics and tighten selectors.
9. Only after exact mapping is proven may capture quality become `good`.
10. Full-body capture remains a separate milestone and still must not auto-open messages.

## Future work-superstation use

Once list capture is trusted, Rebel Command can classify/route work email into views such as:

- training / TMS
- Target Solutions
- staffing / scheduling
- preplans
- hydrants
- report-writing follow-up
- vehicle/truck checks
- general deadlines / action-needed

Those modules must not be auto-created merely because an email mentions them. Rebel Command should surface evidence and suggested routing; the authoritative system for each work function remains external unless Michael explicitly promotes a module.
