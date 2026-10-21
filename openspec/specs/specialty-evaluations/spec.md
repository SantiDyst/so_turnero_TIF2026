# Delta for Specialty Evaluations

## ADDED Requirements

### Requirement: Create exactly three specialty evaluations per journey

Each journey MUST have exactly three evaluations, one for `BIOQUIMICA`, one for `CLINICA_MEDICA`, and one for `PSICOLOGIA`, created eagerly with the journey. The pair (journey, specialty) MUST be unique.

#### Scenario: Registration creates the three evaluations

- GIVEN a valid applicant registration succeeds
- WHEN the journey is read
- THEN exactly three evaluations MUST exist for it
- AND each MUST hold a distinct required specialty

#### Scenario: Reject a duplicate specialty evaluation

- GIVEN a journey already has an evaluation for a specialty
- WHEN another evaluation for the same journey and specialty is created
- THEN the system MUST reject it
- AND MUST NOT create a duplicate row

### Requirement: Complete an evaluation only when its work is closed

An evaluation MUST become `COMPLETA` only through an explicit completion when it has zero open pendings and, for `CLINICA_MEDICA` and `PSICOLOGIA`, a stored specialty result. Saving a report, finalizing an attention, or recording a result alone MUST NOT complete an evaluation. `PENDIENTE` MUST NOT be accepted as a specialty result.

#### Scenario: Complete an evaluation whose work is closed

- GIVEN every pending of the evaluation is resolved
- AND, for Clínica Médica or Psicología, a required result is stored
- WHEN completion is explicitly requested
- THEN the evaluation MUST become `COMPLETA` with a completion timestamp

#### Scenario: Block completion with open work

- GIVEN the evaluation has an open pending or, for Clínica Médica or Psicología, no stored result
- WHEN completion is requested
- THEN the system MUST reject it
- AND the evaluation MUST remain `PENDIENTE`

#### Scenario: A saved report does not complete an evaluation

- GIVEN an evaluation has a saved report but still has an open pending or no stored result
- WHEN the report is saved or the attention is finalized
- THEN the evaluation MUST remain `PENDIENTE`

## Scope and Traceability

Covers RF-09 and the RF-13 evaluation gate. Sources: `SO TURNERO - Requisitos y especificaciones.docx` and `03 Estados y transiciones.docx`. RF-15 reports and RF-16 certificates are excluded.
