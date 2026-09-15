# Rebel Command — Work Superstation Roadmap

Rebel Command remains part of **Mission Vector Check It**. This roadmap does not create new Missions and does not promote any back-burner idea to an active workflow unless Michael explicitly does so.

## Active / in-progress

### Vector Scheduling
Authoritative Station 4 / C-shift scheduling, riding-position history, recommendations, actual-vs-planned reconciliation, and controlled action packages.

### Overtime
Authoritative Mission Vector Check It overtime staffing/priority analysis and safe action preparation.

### Vector Rebel / PPE
Existing PPE/inspection helper remains separate in domain logic while sharing Rebel Command as a control surface.

### Work Email — planning/discovery
Read-only Outlook Web intelligence. Outlook remains authoritative. Current milestone is list-only rendered-UI capture; no mailbox mutations and no body capture until live DOM mapping is validated.

## Existing external workflow to surface later

### Operative / truck checks
Operative is the current truck-check workflow. Rebel Command should not build a competing truck-check database. When Vector Check It vehicle checks come online, Rebel Command may surface that workflow as the vehicle-check module.

## Back burner — ideas only

These remain candidates. Do not create authoritative databases, automation, or operational workflows merely because they are listed here.

- TMS / Training Management System
- Firefighter training-hours tracking
- Target Solutions calendar / assignments / deadlines
- Preplans
- Hydrants
- Report-writing assistance

## Superstation design principles

1. **One command surface, external systems stay authoritative.** Rebel Command should surface, correlate, remind, summarize, and help prepare work without silently replacing official department systems.
2. **Read first, write later.** New integrations begin read-only unless Michael explicitly authorizes a write workflow after validation.
3. **Human boundary for official records.** Report submission, mailbox changes, training certification records, apparatus checks, and other official department records remain human-confirmed unless a later workflow is proven and explicitly approved.
4. **No duplicate domain databases by default.** Store only the minimum evidence/index/state needed for Rebel Command to coordinate the work.
5. **Fail closed.** Missing, stale, ambiguous, or truncated data must appear as incomplete instead of being inferred.
6. **Traceability.** Derived status should retain source/time/evidence so Michael can tell where it came from.
7. **Back burner means back burner.** Candidate modules stay visible without consuming implementation effort until promoted.

## Current priority order

1. Stabilize Scheduling / Overtime data correctness and Rebel Scout assisted input.
2. Complete Work Email read-only discovery and validation.
3. Evaluate which back-burner work module provides the highest operational value next.
