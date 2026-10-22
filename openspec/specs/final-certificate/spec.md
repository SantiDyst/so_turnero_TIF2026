# Delta for Final Certificate

## ADDED Requirements

### Requirement: Issue only for a closed journey with stored aptitude

Issuance MUST require journey state `Cierre final` and a stored final aptitude; otherwise it MUST return `409`. An unknown journey MUST return `404`.

#### Scenario: Issue an eligible certificate

- GIVEN a journey is `Cierre final` with stored aptitude
- WHEN issuance is requested
- THEN one certificate MUST be stored

#### Scenario: Reject ineligible issuance

- GIVEN the journey is not `Cierre final` or has no stored aptitude
- WHEN issuance is requested
- THEN it MUST return `409`
- AND no certificate MUST be stored

### Requirement: Store a deterministic snapshot

The identifier MUST be `CERT-<numeroAtencion>` (for example `CERT-AT-1042`), unique, and stored. A certificate MUST snapshot the final aptitude immutably, the issuance timestamp, and an optional responsible `CLINICA_MEDICA` professional resolved as explicit body `professionalId` validated as `CLINICA_MEDICA`, else the latest `CLINICA_MEDICA` attention of the journey, else `null`; a closed journey without clinical attention MUST still issue. The JSON MUST contain identifier, attention number, applicant identification, final aptitude, issue date, and responsible professional or `null`, and MUST NOT include digital signature or automatic delivery.

#### Scenario: Resolve the responsible professional

- GIVEN issuance supplies no professional and the journey has a `CLINICA_MEDICA` attention
- WHEN the certificate is stored
- THEN its professional MUST be the latest `CLINICA_MEDICA` professional

#### Scenario: Issue without clinical attention

- GIVEN a closed journey has no `CLINICA_MEDICA` attention
- WHEN issuance is requested
- THEN the certificate MUST be stored with a `null` professional

### Requirement: Issue idempotently and expose the certificate

The first issuance MUST return `201`; repetition MUST return `200` with the identical existing certificate and MUST NEVER create a second row. Concurrent issuance MUST NOT produce duplicates or a `500`. Reading before issuance MUST return `404`; after issuance the certificate MUST remain readable while the journey is closed.

#### Scenario: Repeat and concurrent issuance

- GIVEN a certificate already exists for a journey
- WHEN issuance is repeated, including concurrently
- THEN every response MUST return the identical certificate
- AND exactly one certificate MUST exist

#### Scenario: Read before and after issuance

- GIVEN a journey has no certificate and one is then issued
- WHEN it is read before and after
- THEN the first read MUST return `404`
- AND the second MUST return the stored certificate
