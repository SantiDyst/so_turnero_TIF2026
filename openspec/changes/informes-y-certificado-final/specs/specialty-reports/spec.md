# Delta for Specialty Reports

## ADDED Requirements

### Requirement: Persist one report per journey and specialty

The system MUST persist exactly one report per journey and specialty, anchored on that journey's specialty evaluation. Recitations MUST update the same report and MUST NOT create another. A report MUST store free-text observations, state `Pendiente` or `Completo`, optional responsible professional, optional writing-attention provenance, and `completadoAt` when complete.

#### Scenario: Recitation reuses the existing report

- GIVEN a journey has one saved report for a specialty
- WHEN a recitation writes observations for that specialty
- THEN the existing report MUST be updated
- AND exactly one report MUST remain for that specialty

### Requirement: Authorize writes without altering the circuit

A write MUST return `400` for an invalid body, `404` for an unknown attention or journey, and `409` when the journey is `CIERRE_FINAL`. `Completo` MUST require non-empty observations, otherwise `400`. Writes after closure MUST be rejected while reads remain allowed. Saving a report MUST NOT complete an evaluation, resolve a pending, change attention or journey state, or alter closure readiness or aptitude.

#### Scenario: Reject invalid or closed writes

- GIVEN a write has an invalid body, an unknown attention, or a closed journey
- WHEN it is submitted
- THEN it MUST fail with `400`, `404`, or `409` respectively
- AND no report MUST change

#### Scenario: Saving leaves the circuit unchanged

- GIVEN an evaluation is `PENDIENTE` with open work
- WHEN its report is saved as `Completo`
- THEN the evaluation MUST remain `PENDIENTE`
- AND pendings, states, closure readiness, and aptitude MUST be unchanged

### Requirement: Expose exactly three composed reports

Reads MUST return exactly three entries in `BIOQUIMICA, CLINICA_MEDICA, PSICOLOGIA` order; an unknown journey MUST return `404`. Each entry MUST include applicant `{id, nombre, apellido}`, attention number, origin area `Admisión`, responsible area (specialty) and professional when present, observations, specialty result (`null` for `BIOQUIMICA`), final aptitude (`null` until stored), `reportState`, and update timestamp. Unwritten specialties MUST appear as `reportState: Pendiente` with no invented data.

#### Scenario: Order with pending placeholders

- GIVEN a journey has only a `PSICOLOGIA` report
- WHEN its reports are read
- THEN exactly three ordered entries MUST appear
- AND unwritten specialties MUST show `reportState: Pendiente`

#### Scenario: Compose stored values

- GIVEN a `CLINICA_MEDICA` report, result, and aptitude exist
- WHEN reports are read
- THEN that entry MUST expose applicant, attention number, `Admisión`, specialty, professional, observations, result, aptitude, state, and timestamp
