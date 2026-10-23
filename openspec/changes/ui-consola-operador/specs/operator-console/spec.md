# Operator Console Specification

## Purpose

Operator console over the attention circuit. Owns no data and no authorization.

## Requirements

### Requirement: Intake and queue

The console MUST register `nombre`, `apellido`, and `dni`, surface every rejected field, and list queue entries by attention number and state.

#### Scenario: Register and open

- GIVEN a complete name, surname, and DNI
- WHEN registration is submitted
- THEN the queue MUST show the new number as `En espera` and it MUST open

#### Scenario: Reject incomplete registration

- GIVEN a missing DNI
- WHEN registration is submitted
- THEN the message and missing field MUST be shown and no entry added

### Requirement: Show cards and gate starts

The console MUST show applicant, attention number, journey and derived state, and three cards ordered `BIOQUIMICA`, `CLINICA_MEDICA`, `PSICOLOGIA`. A start MUST require a non-`COMPLETA` evaluation and no active attention.

#### Scenario: Render a fresh journey

- GIVEN no attention and three `PENDIENTE` evaluations
- WHEN the journey opens
- THEN three cards MUST appear in specialty order and eligible ones MUST offer a start

#### Scenario: Withhold start

- GIVEN the evaluation is `COMPLETA` or an attention is active
- WHEN the card is shown
- THEN no start MUST be offered

### Requirement: Finalize, record results, complete, and save reports

The console MUST finalize as `Finalizada` or `Pendiente`, offer results only for `CLINICA_MEDICA` and `PSICOLOGIA`, complete only with no pending and any required result stored, and show and save the three reports.

#### Scenario: Complete a cycle

- GIVEN a `CLINICA_MEDICA` attention is `En atención`
- WHEN a result is recorded, the evaluation completed, and the attention finalized
- THEN the card MUST show `COMPLETA`, the result, and the finalization

#### Scenario: Withhold actions

- GIVEN `BIOQUIMICA`, a missing required result, or an open pending
- WHEN the card is shown
- THEN result and completion MUST NOT be offered

#### Scenario: Save report observations

- GIVEN an unwritten report shows `Pendiente`
- WHEN observations are saved
- THEN they MUST appear and no other state MUST change

### Requirement: Close when ready and issue certificate

The console MUST show every readiness flag, enable closure only when `canClose` is true, then show the stored aptitude, and display the certificate's identifier, final aptitude, issue date, and responsible professional for `201` and `200`.

#### Scenario: Close and issue

- GIVEN all readiness flags are true
- WHEN closure and issuance are requested
- THEN `Cierre final`, the stored aptitude, and certificate details MUST be shown

#### Scenario: Block closure

- GIVEN any readiness flag is false
- WHEN the closure panel is shown
- THEN closure MUST NOT be enabled

#### Scenario: Repeat issuance

- GIVEN a certificate already exists
- WHEN issuance succeeds again
- THEN the existing certificate MUST be shown without error

### Requirement: Derive state from one read model

The console MUST use the journey read model for an attention number as the sole source of truth, re-fetch it after every mutation, and keep only that number in the URL hash so deep links restore state. It MUST show `400`, `404`, and `409` messages verbatim and re-fetch on `409`.

#### Scenario: Restore deep link

- GIVEN a console was opened before
- WHEN its hashed link is opened
- THEN the same console MUST render from the read model

#### Scenario: Recover from conflict

- GIVEN a mutation returns `409`
- WHEN it is rendered
- THEN the message MUST appear unaltered and the read model MUST refresh

### Requirement: No authorization boundary

The console MUST NOT be an authorization boundary: it holds no credentials, roles, or permissions, and no protection MAY rely on it.

#### Scenario: Invoke outside the console

- GIVEN a command is reachable through the API
- WHEN it is invoked without the console
- THEN the console MUST NOT be expected to prevent it
