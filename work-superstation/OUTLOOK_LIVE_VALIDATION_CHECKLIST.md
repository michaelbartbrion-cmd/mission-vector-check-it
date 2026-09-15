# Mission Vector Check It — Outlook Web Reader Live Validation

Status: Ready Room / human-boundary validation only
Branch: `feature/work-superstation-email`
Reader: `work-superstation/outlook-web-reader-0.1.0.user.js`

## Safety boundary

This validation is read-only. The reader must not click or open messages, send/reply, delete/archive/move, change read/unread state, flag/unflag, or alter Outlook settings. The first validation uses **SCAN VISIBLE LIST · NO UPLOAD** only.

## Preconditions

1. User is already authenticated to Outlook Web in the normal work browser session.
2. Tampermonkey reader 0.1.0 is installed from the Mission Vector repository branch.
3. Rebel Command Work Email pairing may be configured later, but is not required for the first no-upload scan.
4. Outlook is displaying a normal mail list such as Inbox.

## Validation sequence

1. Open the Work Email Reader panel.
2. Select **SCAN VISIBLE LIST · NO UPLOAD**.
3. Confirm the panel reports candidate rows without changing any visible mailbox state.
4. Compare the candidate count with the visibly rendered message rows.
5. Inspect discovery details for list/grid detection and candidate count.
6. Verify candidate parsing on a small sample: sender, subject, preview text, unread status, flagged status, attachment indicator, and received-time evidence when available.
7. Confirm no row from navigation, folders, toolbar controls, advertisements, or unrelated page chrome was misidentified as a message.
8. Do not use **CAPTURE VISIBLE LIST** until the visible-row mapping is judged credible.

## Promotion gate

The reader remains `partial` discovery evidence until all of the following are true:

- Visible message rows are detected with acceptable recall.
- Non-message controls are excluded with acceptable precision.
- Sender/subject/preview extraction is stable enough to identify mail without guessing.
- No mailbox mutation occurs during repeated scans.
- Captures can be associated with the correct mailbox/folder context.

Only after that proof may Rebel Command accept a list capture as `good` evidence. Full message-body capture remains a separate opt-in design and validation step.

## Failure behavior

Any uncertainty should fail closed. Keep evidence `partial`, do not upload if the visible list cannot be mapped credibly, and do not add mutation capabilities as a workaround.
