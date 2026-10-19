# Delta for Protected Agenda

## ADDED Requirements

### Requirement: Manage reservation states and slot occupancy

A reservation MUST start as `RESERVADA` and MUST move only to `CUMPLIDA`, `CANCELADA`, `REPROGRAMADA`, or `AUSENTE`. Only `RESERVADA` MUST occupy a slot; cancellation and reprogramming MUST release the previous slot. Reservations MUST exist only for recitations.

#### Scenario: Transition a reserved slot

- GIVEN a recitation has a `RESERVADA` reservation
- WHEN it moves to `CUMPLIDA`, `CANCELADA`, `REPROGRAMADA`, or `AUSENTE`
- THEN the transition MUST be accepted
- AND any other source state MUST be rejected

#### Scenario: Release a slot

- GIVEN a reservation is `RESERVADA`
- WHEN it is cancelled or reprogrammed
- THEN its previous slot MUST become free

### Requirement: Reject overlapping reservations atomically

Two `RESERVADA` reservations for the same professional MUST NOT overlap. Detection MUST hold under concurrency; exactly one conflicting request MUST succeed and every other MUST receive a conflict response (HTTP 409).

#### Scenario: Reject an overlapping reservation

- GIVEN a professional has a `RESERVADA` reservation from 10:00 to 10:30
- WHEN a reservation from 10:15 to 10:45 is requested for the same professional
- THEN it MUST be rejected with a conflict
- AND the existing reservation MUST remain unchanged

#### Scenario: Serialize concurrent overlaps

- GIVEN two overlapping reservations for the same professional are requested concurrently
- WHEN both are committed
- THEN exactly one MUST become `RESERVADA`
- AND the other MUST receive a conflict response

### Requirement: Chain reprogrammed reservations

Reprogramming MUST keep the previous reservation as `REPROGRAMADA` and MUST create a linked new `RESERVADA` reservation for the new slot. The new reservation MUST reference the one it replaces.

#### Scenario: Reprogram a reservation

- GIVEN a reservation is `RESERVADA`
- WHEN it is reprogrammed to a new slot
- THEN the previous row MUST remain as `REPROGRAMADA`
- AND a linked `RESERVADA` row MUST be created

### Requirement: Preserve the circuit on cancel, reschedule, and absence

Cancelling, reprogramming, or marking absence MUST NOT resolve the pending, complete the evaluation, or change the journey state. `AUSENTE` MUST only record the absence.

#### Scenario: Cancellation, rescheduling, and absence change no circuit state

- GIVEN a `RESERVADA` reservation has an open linked pending
- WHEN it becomes `CANCELADA`, `REPROGRAMADA`, or `AUSENTE`
- THEN the pending MUST remain open
- AND the evaluation and journey MUST retain their prior states

## Scope and Traceability

Covers RF-12. Sources: `SO TURNERO - Requisitos y especificaciones.docx` and `03 Estados y transiciones.docx`. RF-15 reports and RF-16 certificates are excluded.
