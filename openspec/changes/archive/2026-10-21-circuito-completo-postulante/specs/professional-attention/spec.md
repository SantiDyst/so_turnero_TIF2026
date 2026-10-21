# Delta for Professional Attention

## ADDED Requirements

### Requirement: Use the specialty enum for attentions and professionals

Attention and professional specialty MUST be limited to `BIOQUIMICA`, `CLINICA_MEDICA`, or `PSICOLOGIA`. Every professional MUST have a required specialty; a missing or unsupported specialty MUST be rejected.

#### Scenario: Reject a missing or unsupported professional specialty

- GIVEN a professional record is created or updated without a specialty or with an unsupported value
- WHEN the operation is submitted
- THEN the system MUST reject it
- AND MUST NOT store the invalid specialty

## MODIFIED Requirements

### Requirement: Start an eligible professional attention

The system MUST start an attention for a journey in `En espera` or `En proceso` when the applicant has no active attention, the target evaluation exists and is not `COMPLETA`, and the professional is available. A successful start MUST associate the journey, specialty, evaluation, and professional; record the start timestamp; set the attention to `En atención`; and set the professional to `Ocupado`. The first start MUST move the journey to `En proceso`; later starts MUST leave it `En proceso`.
(Previously: starts were allowed only from `En espera`, so only one specialty attention could run per journey.)

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
(Previously: concurrency was covered for the single first start; the invariant now also covers concurrent starts of different specialty evaluations.)

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

## Scope and Traceability

Covers RF-05–RF-09 with sequential specialty starts. Sources: `SO TURNERO - Requisitos y especificaciones.docx` and `03 Estados y transiciones.docx`. RF-15 reports and RF-16 certificates are excluded.
