# Delta for Attention Queue Query

## MODIFIED Requirements

### Requirement: Report only the approved state vocabulary

Queries MUST represent journey state as `En espera`, `En proceso`, or `CIERRE_FINAL`; attention state as `No iniciada`, `En espera`, `En atención`, `Finalizada`, or `Pendiente`; evaluation state as `PENDIENTE` or `COMPLETA`; reservation state as `RESERVADA`, `CUMPLIDA`, `CANCELADA`, `REPROGRAMADA`, or `AUSENTE`; aptitude as `APTO_PLENO`, `APTO_CONDICIONAL`, or `NO_APTO`; report state as `Pendiente` or `Completo` under the distinct key `reportState`; and professional availability as `Disponible` or `Ocupado`.
(Previously: report state was absent from the approved vocabulary.)

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

#### Scenario: Disambiguate report and attention state

- GIVEN a report is `Pendiente` and its attention is also `Pendiente`
- WHEN the journey is queried
- THEN the report state MUST appear under `reportState`
- AND the attention state MUST remain under `state`

### Requirement: Expose the complete circuit read model

The journey read model MUST expose its evaluations, pendings, recitations and reservations, derivations, stored aptitude, and three specialty reports, plus the issued certificate or `null`, without removing or renaming existing keys. Reports MUST use the three-entry shape and order defined for specialty reports; the certificate MUST expose `identifier`, `issuedAt`, `responsibleProfessional`, and `finalAptitude`. For an `En proceso` journey with no active attention and pending evaluations, it MUST derive `Esperando llamado`; derived state MUST NOT be persisted.
(Previously: the read model exposed no reports or certificate.)

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

#### Scenario: Include reports and certificate

- GIVEN a journey has three reports and an issued certificate
- WHEN it is queried
- THEN `reports` MUST contain three ordered entries and `certificate` MUST expose its fields
- AND every existing key MUST remain present
