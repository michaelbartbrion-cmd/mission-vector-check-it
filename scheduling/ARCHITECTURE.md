# Vector Scheduling subsystem architecture

## Ownership

Vector Scheduling is a domain subsystem of **Mission Vector Check It**.

- Mission Vector Check It owns scheduling rules, plans, observations, reconciliation, rotation history, reviews and planner decisions.
- Vector Scheduling itself remains authoritative for the department schedule that is observed/read.
- Project X may later host automation, polling or storage infrastructure, but that does not transfer ownership of the scheduling data or logic out of Mission Vector Check It.
- Mission Michael Career may consume limited status/metadata when appropriate; it is not the scheduling source of truth.

## Design goal

Provide a closed-loop Truck 504 rotation assistant that can:

1. ingest confirmed legacy history;
2. read future availability from Vector Scheduling;
3. optimize the next assignment while looking ahead at known future staffing constraints;
4. save plan intent without treating it as fact;
5. read Vector again after the shift;
6. reconcile what actually happened;
7. keep ambiguous cases out of the fairness calculation until reviewed;
8. preserve an audit trail of changes and manual decisions.

## Layers

### 1. Acquisition

Preferred: official read-only Vector Scheduling API.

Development fallback: browser userscript reading the visible Vector Scheduling page.

Both acquisition paths produce normalized observations. Neither path writes to Vector.

### 2. Normalization

A normalized observation should preserve:

- date / shift label;
- person;
- assignment;
- visible duty/qualifier code;
- raw source text/evidence;
- found/not-found state;
- capture time;
- source;
- when available, shift start/end and duration;
- optional raw/candidate payload for ambiguous multiple assignments.

The normalization layer must not silently convert an ambiguous observation into rotation credit.

### 3. Mission-owned private store

Development can use browser localStorage and private JSON import/export.

The durable target is a mission-owned SQLite database using `schema.sql` with:

- `people`
- `settings`
- `rotation_history`
- `duty_history`
- `plans`
- `observations`
- `reviews`
- `resolutions`
- `acquisition_runs`
- `planner_runs`

Real crew names, schedules and history are private data and must not be committed to the public GitHub repository.

If the database is later hosted on Project X infrastructure, the namespace/database remains Mission Vector Check It data. Project X is the host/control plane, not a competing domain database.

### 4. Rotation engine

`rotation-engine.js` owns the basic position model and reconciliation rules.

Current firefighter credit categories:

- Firefighter
- Swing
- Tiller
- TADE

Important normalization:

- Swing -> Swing credit
- Swing/FF -> Swing credit
- Swing Sub -> Swing credit
- FF Sub -> Firefighter credit

The exact detail remains stored even when two details normalize to the same credit.

### 5. Lookahead planner

`horizon-planner.js` evaluates the first assignment in the context of future blocks for which Vector evidence exists.

This is essential because a next-block-only optimum can be a poor choice when future time off or TADE staffing constraints are already known.

Future blocks remain advisory. The current block is the only block saved by default.

### 6. Reconciliation

For each firefighter/date:

`plan intent + Vector observation -> verified result, inferred result, or review item`

Examples:

- planned Swing + remained home as FFB -> `Swing/FF`, Swing credit;
- planned Swing + observed working elsewhere -> `Swing`, Swing credit;
- planned Tiller + observed TM -> Tiller credit;
- planned TADE + observed DE-A/TADE -> TADE credit;
- home FFB without a saved plan -> ambiguous Firefighter vs Swing/FF -> review;
- working elsewhere without saved plan -> ambiguous Swing vs staffing move -> review.

Only credited reconciled history feeds the fairness engine.

## Front end

The development front end is a separate Tampermonkey userscript, not the PPE execution engine.

Reasons for keeping scheduling separate from PPE execution:

- scheduling is advisory/read-only;
- PPE automation has different safety and execution risks;
- a scheduling defect must not affect PPE checking;
- scheduling may later need its own storage/polling service.

Shared Mission Vector Check It conventions and deployment patterns may still be reused.

## Future service shape

If browser-only storage becomes limiting, a small mission-owned local service can expose endpoints such as:

- `GET /scheduling/status`
- `GET /scheduling/history`
- `GET /scheduling/observations`
- `POST /scheduling/plans`
- `POST /scheduling/reviews/{date}/{person}`
- `POST /scheduling/reconcile`
- `POST /scheduling/plan/lookahead`

Those are local Mission Vector Check It service endpoints, not Vector Scheduling write APIs.

## Safety gates before production use

1. Validate official API output against the department's real Vector pages.
2. Validate browser DOM capture against both Schedule and ListView if DOM fallback remains enabled.
3. Confirm exact duty-code aliases used by the department.
4. Reconcile the legacy/raw transition period so recent ratios are complete.
5. Validate future-availability interpretation, especially partial-day time off and multiple simultaneous assignments.
6. Compare recommendations to the established spreadsheet process over a meaningful historical sample.
7. Keep Vector writes disabled unless separately and explicitly authorized.
