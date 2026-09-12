# Known limitations / validation targets

1. **Official API output still needs live validation against this department's data.** The current acquisition utility follows the documented `GET /v1/schedule` structure, but field combinations/qualifiers must be checked against a real export before automatic reconciliation is trusted.
2. **Browser DOM capture is fallback-only.** It has not been promoted because the official API is the preferred read-only source and page markup may change.
3. **Duty-code aliases need live validation.** The current engine recognizes `Capt`, `DE-A`, `FFB`, `TM`, `TAC`, `TADE`, `TABC`, `TAFIT`, and `Swing`.
4. **Nonstandard command staffing requires review.** Days where normal command/engineer coverage is absent or replaced are not safe to auto-classify from the current rules.
5. **One-firefighter availability is not auto-planned.** With fewer than two tracked firefighters available, the program refuses to invent a complete role set.
6. **No Vector writes.** This is deliberate. A separate explicit authorization would be required before any feature that changes Vector Scheduling is considered.
7. **Private migration data is local-only.** Real crew names, history, observations, API exports and local configuration must not be committed to the public repository.
8. **Recent history may contain unresolved dates.** When the legacy spreadsheet contains raw Vector-report data without explicit position outcomes, those dates remain observations rather than confirmed position credit. Recommendations must remain provisional until gaps are reconciled.
9. **Automatic inference is intentionally conservative.** A firefighter shown as FFB at the home apparatus without a saved plan could be either true Firefighter or Swing/FF; a firefighter shown working elsewhere could be Swing or a staffing move. Both cases require review unless a pre-shift plan supplies the missing intent.
