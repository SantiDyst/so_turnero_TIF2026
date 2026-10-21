# Delta for Attention Queue Query

## ADDED Requirements

### Requirement: Query the waiting queue

The system MUST expose a queue containing only journeys in `En espera` and MUST identify each entry by applicant record, attention number, and journey state. A journey MUST leave the queue when a valid attention start moves it to `En proceso`; it MUST remain queryable by identifier.

#### Scenario: List a newly registered applicant

- GIVEN an applicant was registered successfully and no attention has started
- WHEN the queue is queried
- THEN the applicant MUST appear with the assigned attention number
- AND the journey state MUST be `En espera`

#### Scenario: Remove a started journey from the queue

- GIVEN a queued applicant has successfully started an attention
- WHEN the queue is queried again
- THEN the journey MUST NOT appear in the waiting queue
- AND querying it by identifier MUST report `En proceso`

### Requirement: Find a journey by either supported identifier

The system MUST return the same journey when queried by its applicant record identifier or its attention number. The result MUST distinguish journey state, attention state, specialty, responsible professional, timestamps, and professional availability when those values exist.

#### Scenario: Find by applicant record

- GIVEN an existing applicant has an associated journey
- WHEN that applicant record identifier is queried
- THEN the system MUST return the associated journey and its attention number

#### Scenario: Find by attention number

- GIVEN an existing journey has an attention number
- WHEN that number is queried
- THEN the system MUST return the same applicant and journey data

#### Scenario: Identifier is unknown

- GIVEN no journey matches the supplied applicant record or attention number
- WHEN the lookup is performed
- THEN the system MUST return a comprehensible not-found response

### Requirement: Report only the approved state vocabulary

Queries MUST represent journey state as `En espera`, `En proceso`, or `CIERRE_FINAL`; attention state as `No iniciada`, `En espera`, `En atención`, `Finalizada`, or `Pendiente`; evaluation state as `PENDIENTE` or `COMPLETA`; reservation state as `RESERVADA`, `CUMPLIDA`, `CANCELADA`, `REPROGRAMADA`, or `AUSENTE`; aptitude as `APTO_PLENO`, `APTO_CONDICIONAL`, or `NO_APTO`; and professional availability as `Disponible` or `Ocupado`.

#### Scenario: Query after a state transition

- GIVEN a registration, start, or finalization transition has committed
- WHEN the related journey is queried
- THEN the response MUST show the committed approved state values
- AND MUST NOT conflate journey, attention, or professional state

#### Scenario: Report circuit states without conflation

- GIVEN evaluations, reservations, and an aptitude exist
- WHEN the journey is queried
- THEN each category MUST use its approved vocabulary
- AND an evaluation or reservation state MUST NOT be reported as the journey state

### Requirement: Provide open persistent queries for this slice

The registration, queue/query, start, and finalization capabilities MUST be callable without authentication in this slice. Query results MUST come from persisted state that survives reload and backend restart.

#### Scenario: Query without credentials after restart

- GIVEN a journey was committed before a backend restart
- WHEN a client queries it without authentication credentials after restart
- THEN the system MUST return its latest persisted state

### Requirement: Expose the complete circuit read model

The journey read model MUST expose its evaluations, pendings, recitations and reservations, derivations, and stored aptitude. For an `En proceso` journey with no active attention and pending evaluations, it MUST derive `Esperando llamado`; derived state MUST NOT be persisted.

#### Scenario: Read the complete circuit

- GIVEN a journey has evaluations, pendings, reservations, derivations, and aptitude
- WHEN it is queried by identifier
- THEN all those records MUST be included with their approved states

#### Scenario: Derive Esperando llamado

- GIVEN a journey is `En proceso`, has no active attention, and has a pending evaluation
- WHEN it is queried
- THEN the read model MUST show `Esperando llamado`
- AND no persisted journey state MUST be changed

#### Scenario: Drop the derived value after the next start

- GIVEN an `Esperando llamado` journey starts its next attention
- WHEN it is queried
- THEN the derived value MUST no longer be present

## Scope and Traceability

This delta covers RF-04 and RF-08, relevant RF-09 state data, RNF-01/RNF-03 persistence and consistency portions, CU01–CU02, HU-ADM-03, and HU-CON-01. Sources: `SO TURNERO - Requisitos y especificaciones.docx`, `Casos de uso — SO Turnero.docx`, `Historias de usuario.docx`, `08 Alcance del primer recorrido funcional.docx`, and `03 Estados y transiciones.docx` under `docs/requisitos/`. It excludes frontend, reports beyond state needed here, authentication/authorization, and later-journey features.
