# Delta for Professional Attention

## ADDED Requirements

### Requirement: Start an eligible professional attention

The system MUST start an attention for a journey in `En espera` or `En proceso` when the applicant has no active attention, the target evaluation exists and is not `COMPLETA`, and the professional is available. A successful start MUST associate the journey, specialty, evaluation, and professional; record the start timestamp; set the attention to `En atención`; and set the professional to `Ocupado`. The first start MUST move the journey to `En proceso`; later starts MUST leave it `En proceso`.

#### Scenario: Start the first specialty attention

- GIVEN a journey is `En espera`, no attention is active, the evaluation is not `COMPLETA`, and the professional is `Disponible`
- WHEN that professional starts an attention for a supported specialty
- THEN the attention MUST become `En atención` with its associations and timestamp
- AND the journey MUST become `En proceso` and the professional `Ocupado`

#### Scenario: Start a later specialty attention

- GIVEN a journey is `En proceso`, no attention is active, and the target evaluation is not `COMPLETA`
- WHEN a professional starts another specialty attention
- THEN the attention MUST become `En atención`
- AND the journey MUST remain `En proceso`

#### Scenario: Reject an ineligible start

- GIVEN the journey is `CIERRE_FINAL`, the applicant has an active attention, the evaluation is `COMPLETA`, or the professional is not `Disponible`
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

#### Scenario: Serialize concurrent specialty starts

- GIVEN no attention is active and two different specialty evaluations are eligible
- WHEN two eligible professionals concurrently request starts
- THEN exactly one request MUST create the sole active attention
- AND the other MUST be rejected

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

### Requirement: Use the specialty enum for attentions and professionals

Attention and professional specialty MUST be limited to `BIOQUIMICA`, `CLINICA_MEDICA`, or `PSICOLOGIA`. Every professional MUST have a required specialty; a missing or unsupported specialty MUST be rejected.

#### Scenario: Reject a missing or unsupported professional specialty

- GIVEN a professional record is created or updated without a specialty or with an unsupported value
- WHEN the operation is submitted
- THEN the system MUST reject it
- AND MUST NOT store the invalid specialty

## Scope and Traceability

This delta covers RF-05–RF-09 portions needed for one attention, RNF-01/RNF-03, CU02, and HU-PRO-01–02. Sources: `SO TURNERO - Requisitos y especificaciones.docx`, `Casos de uso — SO Turnero.docx`, `Historias de usuario.docx`, `08 Alcance del primer recorrido funcional.docx`, `03 Estados y transiciones.docx`, and `02 Reglas operativas y de integridad.docx` under `docs/requisitos/`. Pendientes management, recitation, reservations, referral, aptitude, closure, certificates, broader reports, frontend, and authentication/advanced authorization are excluded.
