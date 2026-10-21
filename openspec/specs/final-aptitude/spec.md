# Delta for Final Aptitude

## ADDED Requirements

### Requirement: Calculate and store final aptitude automatically

When the third evaluation becomes `COMPLETA`, the system MUST calculate and store exactly one aptitude per journey from `APTO_PLENO`, `APTO_CONDICIONAL`, and `NO_APTO`. Any `NO_APTO` in Clínica Médica or Psicología MUST yield `NO_APTO`; otherwise any `APTO_CONDICIONAL` MUST yield `APTO_CONDICIONAL`; otherwise `APTO_PLENO`.

#### Scenario: Third completion stores the aptitude

- GIVEN two evaluations are `COMPLETA` and the third becomes `COMPLETA`
- WHEN all required results exist
- THEN one aptitude MUST be calculated and stored for the journey

#### Scenario: Apply the aptitude matrix

- GIVEN the Clínica Médica and Psicología results are `APTO_PLENO`/`APTO_CONDICIONAL`, `NO_APTO`/`APTO_PLENO`, or `APTO_PLENO`/`APTO_PLENO`
- WHEN aptitude is calculated
- THEN the stored results MUST be `APTO_CONDICIONAL`, `NO_APTO`, and `APTO_PLENO`, respectively

#### Scenario: No aptitude before three completions

- GIVEN fewer than three evaluations are `COMPLETA`
- WHEN aptitude is requested
- THEN the system MUST NOT store an aptitude

### Requirement: Close the journey only after the full gate

A journey MUST reach `CIERRE_FINAL` only when all three evaluations are `COMPLETA`, clinical and psychological results exist, aptitude is stored, and closure is explicitly requested. Meeting those conditions MUST NOT close the journey automatically.

#### Scenario: Reject closure before the gate

- GIVEN any evaluation is not `COMPLETA`, a required result is missing, or aptitude is not stored
- WHEN closure is requested
- THEN the system MUST reject it
- AND the journey MUST remain `En proceso`

#### Scenario: Close an eligible journey

- GIVEN all three evaluations are `COMPLETA`, results and aptitude are stored
- WHEN closure is explicitly requested
- THEN the journey MUST become `CIERRE_FINAL`

## Scope and Traceability

Covers RF-13 and RF-14. Sources: `SO TURNERO - Requisitos y especificaciones.docx` and `03 Estados y transiciones.docx`. RF-15 reports and RF-16 certificates are excluded.
