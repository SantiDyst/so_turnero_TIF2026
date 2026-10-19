# Delta for Pendings and Recitations

## ADDED Requirements

### Requirement: Record and resolve multiple pendings explicitly

An attention or evaluation MAY have multiple pendings, each associated with its attention and evaluation and holding a reason, an optional limit date, and a nullable resolution timestamp. Resolving a pending MUST be explicit and MUST NOT resolve the others.

#### Scenario: Resolve one of several pendings

- GIVEN an attention has two open pendings
- WHEN one pending is explicitly resolved
- THEN it MUST store a resolution timestamp
- AND the other pending MUST remain open

### Requirement: Create a recitation linked to the circuit and a reservation

A recitation MUST link one pending, its evaluation, and its journey, and MUST create a reservation for the scheduled slot. Recording a recitation MUST NOT resolve the pending, complete the evaluation, or close the journey; the original attention MUST be preserved.

#### Scenario: Schedule a recitation

- GIVEN an open pending belongs to a journey evaluation
- WHEN a recitation is scheduled with a date, time, and professional
- THEN it MUST link that pending, evaluation, and journey
- AND a reservation MUST be created for the same slot

#### Scenario: Scheduling changes no circuit state

- GIVEN the recitation was scheduled successfully
- WHEN the pending, evaluation, and journey are read
- THEN the pending MUST remain open
- AND the evaluation and journey MUST retain their prior states

### Requirement: Fulfillment creates exactly one linked follow-up attention

Fulfilling a reservation MUST create exactly one follow-up attention in `En espera`, linked to the same evaluation, pending, recitation, and journey, without creating another journey or number. Repeated fulfillment MUST NOT create a second follow-up.

#### Scenario: Fulfill a reservation

- GIVEN a reservation is `RESERVADA`
- WHEN it becomes `CUMPLIDA`
- THEN exactly one `En espera` follow-up attention MUST be linked to its evaluation, pending, recitation, and journey
- AND the original attention MUST remain unchanged

#### Scenario: Repeat fulfillment idempotently

- GIVEN fulfillment already created a follow-up attention
- WHEN fulfillment is requested again
- THEN no second follow-up MUST be created

## Scope and Traceability

Covers RF-10 and the recitation side of RF-12. Sources: `SO TURNERO - Requisitos y especificaciones.docx` and `02 Reglas operativas y de integridad.docx`. RF-15 reports and RF-16 certificates are excluded.
