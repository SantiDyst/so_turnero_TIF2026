# Delta for Professional Attention

## ADDED Requirements

### Requirement: List professionals for attention assignment

The system MUST expose a read-only listing of professionals returning every stored professional's identifier, name, specialty, and availability, ordered by specialty then name. Reading the listing MUST NOT create, update, or delete any professional, and MUST NOT alter availability.

#### Scenario: List the seeded professionals

- GIVEN one professional exists per supported specialty
- WHEN the listing is read
- THEN all three MUST be returned ordered `BIOQUIMICA`, `CLINICA_MEDICA`, `PSICOLOGIA`
- AND each MUST expose identifier, name, specialty, and availability

#### Scenario: Order by name within a specialty

- GIVEN two `CLINICA_MEDICA` professionals exist
- WHEN the listing is read
- THEN they MUST appear in name order within that specialty

#### Scenario: Report current availability

- GIVEN a professional is `Ocupado` because of an active attention
- WHEN the listing is read
- THEN that professional MUST be reported as `Ocupado`

#### Scenario: Read without side effects

- GIVEN several professionals are stored
- WHEN the listing is read
- THEN their availability and records MUST remain unchanged
