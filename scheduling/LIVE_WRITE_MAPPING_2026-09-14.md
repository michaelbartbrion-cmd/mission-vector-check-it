# Rebel Command live write mapping — 2026-09-14

Source: Michael Brion live screen recording on 2026-09-14. This document records the observed CrewSense UI paths for future Rebel Command writers. It does **not** enable automated writes by itself.

## Safety rule

All future writers remain behind the existing Rebel Command action package flow:

1. approved action package
2. fresh exact-date census / preflight
3. DOM mapping validation
4. one intended write
5. fresh reread
6. verified target state

Any modal, label, employee, date, assignment, or confirmation mismatch must fail closed.

## OT sign-up / unsign mapping

Observed on CrewSense Schedule view for 2026-09-19.

### Existing signed-up state

The `Overtime Sign Up` assignment group displays Michael Brion as an assigned row.
Clicking Michael opens a modal titled:

`Overtime Sign Up — Saturday, September 19, 2026`

Observed fields/state:
- Work Type: `OT Sign-up`
- Shift From: 09/19/2026 07:00
- Shift To: 09/20/2026 07:00
- Buttons: `Modify User`, `Delete user from shift`

### Unsign

Observed manual path:

1. Click Michael Brion in `Overtime Sign Up`.
2. Verify modal title/date and Work Type = `OT Sign-up`.
3. Click `Delete user from shift`.
4. Confirmation modal appears with title:
   `Would you like to notify the employee about the deletion?`
5. Options include `Do not notify` and `Notify`.
6. For Rebel Command automation, default should be **Do not notify** unless Michael explicitly chooses otherwise.
7. Reread must prove Michael is absent from the OT Sign Up group for that date.

### Sign up

Observed manual path:

1. Click an `Open slot` row within `Overtime Sign Up`.
2. Modal title again is `Overtime Sign Up — <date>`.
3. Employee chooser contains available employees and includes `Michael Brion · All day` when eligible.
4. Select Michael Brion.
5. Work Type remains `OT Sign-up`.
6. Shift From / Shift To are populated for the selected duty day.
7. Click `Add User`.
8. Reread must prove Michael is present in the OT Sign Up group for that date.

Do not infer success from modal closure alone.

## Truck 504 riding assignment mapping

Observed on CrewSense Schedule view for C Shift Day 1, 2026-09-22, Station 4 / Truck 504.

Clicking a crew member row in Truck 504 opens an assignment editor modal titled:

`Truck 504 — Tuesday, September 22, 2026`

Common fields:
- Work Type
- Work Subtype
- Shift From / Shift To
- Qualifiers
- Labels
- Notes
- `Save`
- `Delete today only`

The employee identity comes from the row clicked before opening the modal, so a future writer must verify the exact person row before opening the editor.

### Tillerman

Observed configuration:
- Work Type: `Salary Step [1010]`
- Work Subtype: none
- Qualifier: `[TM] Tillerman`
- Label: none
- Save

A successful save produced CrewSense toast: `Shift updated successfully!`

### Firefighter / designated Swing

Observed configuration:
- Work Type: `Salary Step [1010]`
- Work Subtype: none
- Qualifier: `[FFB] Firefighter`
- Label: `SWING`
- Save

This represents **Swing — designated**: the employee remains assigned to Truck 504 but is the designated swing person if movement is needed.

### TADE — Temporary Acting Driver Engineer

Observed configuration (manual setup was demonstrated but intentionally not saved):
- Work Type: `Salary Step [1010]`
- Work Subtype: `Temporary Fire Engineer`
- Qualifier: `[DE-A] Engineer-Aerial`
- Label: `TADE`

This is the mapped UI representation for TADE.

### TAC — Temporary Acting Captain

Observed configuration (manual setup was demonstrated but intentionally not saved):
- Work Type: `Salary Step [1010]`
- Work Subtype: `Temporary Captain`
- Qualifier: `[Capt] Captain`
- Label: `TAC`

This is the mapped UI representation for TAC.

## Swing semantics

Rebel Command must continue to distinguish:

- `Swing — designated`: employee stays on Truck 504 with Firefighter qualifier + SWING label.
- `Swing — actual`: employee actually works at another assignment. Same Swing ratio credit, but destination and hours must be preserved separately.

The recording mapped designated Swing. Actual swing-to-destination write mapping is still pending.

## Remaining live proof before automated writes

The recording is sufficient to define the intended field values and modal workflow, but automated writers should not be enabled until the runtime can prove DOM selection safely in a live page.

Still needed:
- robust DOM selectors / semantic element finder validation for OT assignment group, employee rows, modal fields, and confirmation buttons
- robust DOM selectors / semantic finder for Truck 504 person row and editor controls
- one preview-only DOM mapping run for OT sign-up and unsign
- one preview-only DOM mapping run for Truck 504 assignment edits
- actual Swing destination move mapping

No automated Vector/CrewSense write is enabled by this document.
