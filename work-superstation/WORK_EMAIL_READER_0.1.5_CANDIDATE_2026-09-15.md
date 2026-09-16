# Work Email Reader 0.1.5 candidate — 2026-09-15

Status: **coded / committed / syntax-checked; not live-validated**.

Validated baseline remains `work-email-reader-0.1.4-discovery` until a real 0.1.5 capture is inspected.

## Why 0.1.5 exists

The 0.1.4 parser is live-validated for the current Outlook Web list DOM, but every ordinary reader capture still labels itself `partial`. That makes repeated refreshes require manual quality relabeling even when the parser produces the same strong structure.

0.1.5 keeps the same read-only list architecture and adds two fail-closed improvements:

1. **Stable snapshot** — sample the visible list briefly and use a stabilized message-key set before upload instead of capturing during a transient render.
2. **Structural quality gate** — mark a capture `good` only when every captured row has:
   - a strong Outlook DOM ID;
   - a non-symbol sender of at least two characters; and
   - a non-empty subject that is not parsed as a timestamp.

If any row fails those checks, the entire capture remains `partial`.

## Safety boundary

0.1.5 still:

- never clicks a message;
- never sends or replies;
- never deletes, archives, or moves messages;
- never changes read/unread or flag state;
- captures list text only;
- does not implement full message-body capture.

## Validation procedure

Michael-only browser step:

1. Open already-authenticated Outlook Web.
2. Install/open `work-superstation/outlook-web-reader-0.1.5.user.js`.
3. Preserve the existing dedicated Work Email pairing.
4. Use **Capture visible list** once on a normal Inbox view.
5. Stop. Do not run repeated captures if the first result is poor.

PRIMARY then inspects:

- newest `WorkEmailCapture` source version is `work-email-reader-0.1.5-discovery`;
- visible count equals stored message count;
- quality and notes match the structural checks;
- matching `WorkEmailMessage` rows have correct sender / subject / preview;
- every row remains `capture_level=list`;
- every `body_text` remains blank;
- dedicated Work Email device remains healthy;
- no mailbox mutation occurred.

Only after that inspection may 0.1.5 be described as live-validated.

Candidate commit: `ae5cbaebca42398e76914e1faaf2817fae91d2d1`.
