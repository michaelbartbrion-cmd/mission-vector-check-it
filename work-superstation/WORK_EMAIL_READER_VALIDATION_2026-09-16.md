# Work Email Reader validation — 2026-09-16

Status: **Validated for visible Outlook Web list capture**

Validated runtime: `work-email-reader-0.1.4-discovery`

## Live proof

- Outlook Web origin: `outlook.cloud.microsoft`
- Rebel Command capture ID: `workmail:1789518675213:u2exw7a`
- Capture timestamp: `2026-09-16T00:31:15.213Z`
- Folder: `Inbox`
- Visible/stored messages: `9 / 9`
- Device: dedicated Mission Vector Work Email collector
- Device status after capture: `online`
- Capture promoted from `partial` to `good` after field-by-field validation.

## Parser validation

The 0.1.4 parser correctly separated sender / subject / preview for all nine visible rows, including the previously problematic cases:

- `ESO` → `[EXTERNAL] Your ESO support portal is getting an upgrade`
- `ESO` → `[EXTERNAL] Save your spot for ESO's NERIS Townhall, Live or On-Demand`
- `Donna at Total Men's Primary Care` → `[EXTERNAL] Appointment availability this week`
- `Sophia Van Sickel` → `Want to join the Process Improvement Strike Team?`
- `Brandon Barth` → `9/15/26 Fleet Update`
- `Brandon Barth` → `9/14/26 Fleet Update`
- `Jessica Gonzales` → `FloMo Growth Academy TOMORROW at Jody Smith Hall!`
- `Katherine Gorrasi` → `FIXIT Requests`
- `Hannah Smith` → `Staff Secondhand Book Swap on September 15`

## Safety boundary confirmed

- List metadata only.
- `capture_level=list`.
- `body_text` remains empty.
- The collector does not click messages.
- No send/reply/delete/archive/move operations.
- No read/unread or flag-state mutation.
- Outlook remains authoritative.

## Next engineering phase

Discovery parsing is complete enough to stop iterating on sender badge parsing. The next phase should focus on making list capture operationally useful in Rebel Command: stable refresh behavior, deduplication/current-state semantics, triage/routing metadata, and eventually an explicitly bounded opened-message capture path if separately approved and validated. Do not broaden mailbox mutation capability.
