# Delta for Applicant Registration

## ADDED Requirements

### Requirement: Register a fictitious applicant

The system MUST require `nombre`, `apellido`, and fictitious `DNI`, MUST generate the internal applicant identifier, and MUST reject incomplete registrations with a comprehensible validation message.

#### Scenario: Register with all mandatory fields

- GIVEN a request contains `nombre`, `apellido`, and fictitious `DNI`
- WHEN the applicant is registered
- THEN the system MUST create the applicant with a system-generated internal identifier
- AND MUST return the confirmed registration

#### Scenario: Reject an incomplete registration

- GIVEN one or more mandatory fields are absent or empty
- WHEN registration is requested
- THEN the system MUST reject the request and identify every missing field
- AND MUST NOT create an applicant, journey, number, or queue entry

### Requirement: Create the initial journey atomically

For each accepted registration, the system MUST atomically create exactly one journey, assign exactly one attention number, and place the applicant in the queue with journey state `En espera`. Queue entry MUST NOT start a professional attention.

#### Scenario: Create the registration aggregate

- GIVEN a valid applicant registration
- WHEN the operation succeeds
- THEN one applicant, one `En espera` journey, one attention number, and one queue entry MUST exist
- AND no active professional attention MUST exist

#### Scenario: Roll back an incomplete aggregate

- GIVEN any part of applicant, journey, number, or queue creation fails
- WHEN the registration operation ends
- THEN the system MUST leave none of those partial records committed

### Requirement: Guarantee journey-number uniqueness

Each journey MUST retain one attention number, and two active journeys MUST NOT share a number, including registrations processed concurrently.

#### Scenario: Register two applicants

- GIVEN two valid registration requests
- WHEN both registrations complete
- THEN each journey MUST have a different attention number

#### Scenario: Resolve a concurrent number collision

- GIVEN concurrent registrations attempt to claim the same number
- WHEN they are committed
- THEN at most one journey MAY retain that number
- AND the other registration MUST receive another unique number or fail without partial data

### Requirement: Persist registration state

Committed applicants, journeys, numbers, and queue entries MUST survive application reload and backend restart.

#### Scenario: Read after restart

- GIVEN a registration completed successfully
- WHEN the application is reloaded or the backend restarts
- THEN the applicant, journey, number, and `En espera` queue state MUST remain available

## Scope and Traceability

This delta covers RF-01–RF-03 and RNF-01/RNF-03 persistence and consistency portions; CU01; HU-ADM-01–03; the first-slice scope; and identification/integrity rules. Sources: `SO TURNERO - Requisitos y especificaciones.docx`, `Casos de uso — SO Turnero.docx`, `Historias de usuario.docx`, `08 Alcance del primer recorrido funcional.docx`, and `02 Reglas operativas y de integridad.docx` under `docs/requisitos/`. It excludes frontend behavior, real personal data, authentication, and later-journey features.
