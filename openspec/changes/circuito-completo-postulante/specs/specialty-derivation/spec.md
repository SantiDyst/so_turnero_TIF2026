# Delta for Specialty Derivation

## ADDED Requirements

### Requirement: Derive to another specialty from an existing attention

A derivation MUST originate from an existing attention of the same journey and MUST target one of the other two specialties, never the origin specialty. It MUST record the origin attention, destination specialty, reason, and timestamp, and MUST preserve the journey and number.

#### Scenario: Derive to another specialty

- GIVEN a journey has an attention in `CLINICA_MEDICA`
- WHEN a derivation to `PSICOLOGIA` is recorded with a reason
- THEN it MUST store the origin attention, destination, reason, and timestamp
- AND the journey and its number MUST remain unchanged

#### Scenario: Reject an invalid destination or origin

- GIVEN the destination equals the origin specialty or the origin attention does not exist in the journey
- WHEN the derivation is requested
- THEN the system MUST reject it
- AND MUST NOT create a derivation

### Requirement: Expose derivation traceability

The derivation response MUST expose the journey state and the origin attention and destination specialty identifiers. Derivations MUST NOT introduce a separate state enum.

#### Scenario: Read derivation traceability

- GIVEN a derivation was recorded
- WHEN it is queried
- THEN the response MUST return the journey state with origin and destination identifiers
- AND MUST NOT expose a derivation state

## Scope and Traceability

Covers RF-11. Sources: `SO TURNERO - Requisitos y especificaciones.docx` and `02 Reglas operativas y de integridad.docx`. RF-15 reports and RF-16 certificates are excluded.
