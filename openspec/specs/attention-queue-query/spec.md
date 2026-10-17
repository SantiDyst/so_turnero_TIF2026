# Delta for Attention Queue Query

## ADDED Requirements

### Requirement: Query the waiting queue

The system MUST expose the current queue and MUST identify each entry by applicant record, attention number, and journey state. A newly registered journey MUST appear as `En espera` until a valid attention start changes it.

#### Scenario: List a newly registered applicant

- GIVEN an applicant was registered successfully and no attention has started
- WHEN the queue is queried
- THEN the applicant MUST appear with the assigned attention number
- AND the journey state MUST be `En espera`

#### Scenario: Reflect a started attention

- GIVEN a queued applicant has successfully started an attention
- WHEN the queue is queried again
- THEN the response MUST reflect that the journey is `En proceso`
- AND MUST NOT present the applicant as still waiting for that same start

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

Queries MUST represent journey state as `En espera` or `En proceso`; attention state as `No iniciada`, `En espera`, `En atención`, `Finalizada`, or `Pendiente`; and professional availability as `Disponible` or `Ocupado`.

#### Scenario: Query after a state transition

- GIVEN a registration, start, or finalization transition has committed
- WHEN the related journey is queried
- THEN the response MUST show the committed approved state values
- AND MUST NOT conflate journey, attention, or professional state

### Requirement: Provide open persistent queries for this slice

The registration, queue/query, start, and finalization capabilities MUST be callable without authentication in this slice. Query results MUST come from persisted state that survives reload and backend restart.

#### Scenario: Query without credentials after restart

- GIVEN a journey was committed before a backend restart
- WHEN a client queries it without authentication credentials after restart
- THEN the system MUST return its latest persisted state

## Scope and Traceability

This delta covers RF-04 and RF-08, relevant RF-09 state data, RNF-01/RNF-03 persistence and consistency portions, CU01–CU02, HU-ADM-03, and HU-CON-01. Sources: `SO TURNERO - Requisitos y especificaciones.docx`, `Casos de uso — SO Turnero.docx`, `Historias de usuario.docx`, `08 Alcance del primer recorrido funcional.docx`, and `03 Estados y transiciones.docx` under `docs/requisitos/`. It excludes frontend, reports beyond state needed here, authentication/authorization, and later-journey features.
