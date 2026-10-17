# Delta for Professional Attention

## ADDED Requirements

### Requirement: Start an eligible professional attention

The system MUST start an attention only for an `En espera` journey and an available professional. A successful start MUST associate the journey, specialty, and professional; record the start timestamp; set the attention to `En atención`; set the journey to `En proceso`; and set the professional to `Ocupado`.

#### Scenario: Start from the waiting queue

- GIVEN a journey is `En espera`, no attention is active for its applicant, and the professional is `Disponible`
- WHEN that professional starts an attention for a supported specialty
- THEN the attention MUST become `En atención` with its associations and start timestamp
- AND the journey MUST become `En proceso` and the professional `Ocupado`

#### Scenario: Reject an ineligible start

- GIVEN the journey is not eligible to start or the professional is not `Disponible`
- WHEN an attention start is requested
- THEN the system MUST reject it with a comprehensible message
- AND MUST NOT create or expose a partially started attention

### Requirement: Enforce one active attention per applicant under concurrency

At most one attention per applicant MUST be `En atención` at any instant. This guarantee MUST hold atomically when two or more eligible start requests race; exactly one request MUST succeed and every loser MUST be rejected with a comprehensible conflict message.

#### Scenario: Reject a sequential second start

- GIVEN the applicant already has an attention `En atención`
- WHEN another professional requests a second start
- THEN the system MUST reject the request
- AND the original active attention MUST remain unchanged

#### Scenario: Serialize concurrent starts

- GIVEN the applicant has no active attention
- WHEN two eligible professionals concurrently request a start
- THEN exactly one request MUST create the sole active attention
- AND the other MUST be rejected without an active or partial duplicate

### Requirement: Finalize an active attention without closing the journey

The system MUST allow an active attention to finish only as `Finalizada` or `Pendiente`. Finalization MUST record its end timestamp, set the responsible professional to `Disponible`, and keep the journey `En proceso`; it MUST NOT close the journey.

#### Scenario: Finalize a completed intervention

- GIVEN an attention is `En atención` and its professional is `Ocupado`
- WHEN the professional finalizes it as `Finalizada`
- THEN the attention MUST store `Finalizada` and an end timestamp
- AND the professional MUST become `Disponible` while the journey remains `En proceso`

#### Scenario: Leave an intervention pending

- GIVEN an attention is `En atención` and further evaluation is required
- WHEN the professional finalizes it as `Pendiente`
- THEN the attention MUST store `Pendiente` and an end timestamp
- AND the professional MUST become `Disponible` while the journey remains `En proceso`

#### Scenario: Reject finalization of a non-active attention

- GIVEN an attention is not `En atención`
- WHEN finalization is requested
- THEN the system MUST reject the transition with a comprehensible message
- AND MUST NOT alter the journey or professional state

### Requirement: Persist the attention lifecycle

Committed attention states, associations, and timestamps MUST survive application reload and backend restart.

#### Scenario: Read a finalized attention after restart

- GIVEN an attention was finalized successfully
- WHEN the backend restarts and the journey is queried
- THEN its final state, specialty, professional, and timestamps MUST remain available

## Scope and Traceability

This delta covers RF-05–RF-09 portions needed for one attention, RNF-01/RNF-03, CU02, and HU-PRO-01–02. Sources: `SO TURNERO - Requisitos y especificaciones.docx`, `Casos de uso — SO Turnero.docx`, `Historias de usuario.docx`, `08 Alcance del primer recorrido funcional.docx`, `03 Estados y transiciones.docx`, and `02 Reglas operativas y de integridad.docx` under `docs/requisitos/`. Pendientes management, recitation, reservations, referral, aptitude, closure, certificates, broader reports, frontend, and authentication/advanced authorization are excluded.
