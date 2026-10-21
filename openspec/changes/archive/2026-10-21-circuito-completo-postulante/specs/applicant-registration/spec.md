# Delta for Applicant Registration

## MODIFIED Requirements

### Requirement: Create the initial journey atomically

For each accepted registration, the system MUST atomically create exactly one journey, assign exactly one attention number, place the applicant in the queue with journey state `En espera`, and create exactly three specialty evaluations, one for `BIOQUIMICA`, one for `CLINICA_MEDICA`, and one for `PSICOLOGIA`. Queue entry MUST NOT start a professional attention.
(Previously: the aggregate created the journey, number, and queue entry only; it now also creates the three specialty evaluations.)

#### Scenario: Create the registration aggregate

- GIVEN a valid applicant registration
- WHEN the operation succeeds
- THEN one applicant, one `En espera` journey, one attention number, one queue entry, and three evaluations MUST exist
- AND no active professional attention MUST exist

#### Scenario: Roll back an incomplete aggregate

- GIVEN any part of applicant, journey, number, queue entry, or evaluation creation fails
- WHEN the registration operation ends
- THEN the system MUST leave none of those partial records committed

## Scope and Traceability

Modifies RF-01–RF-03 to create the three specialty evaluations eagerly. Sources: `SO TURNERO - Requisitos y especificaciones.docx` and `02 Reglas operativas y de integridad.docx`. RF-15 reports and RF-16 certificates are excluded.
