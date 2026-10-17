# Proposal: First Functional Run — Registration, Queue, and First Professional Attention

## Why

SO Turnero needs a persistent slice in which Admisión registers a fictitious applicant and a professional completes one attention without breaking journey continuity.

## What Changes

- Add a Vercel-ready NestJS/Prisma/PostgreSQL walking skeleton for Postman/curl.
- Persist `Postulante`, `Recorrido` (unique number), and `Atención` (specialty, professional, status, timestamps).
- Expose registration, queue/query, start, and finalize APIs with database-enforced uniqueness and single-active-attention invariants.

## Scope

### In Scope
- Register applicants; atomically create their journey and `En espera` queue entry.
- Query the queue and journey by applicant record or attention number.
- Start one attention with specialty, professional, timestamp, and `En atención`.
- Reject concurrent starts; finalize as `Finalizada` or `Pendiente`, release the professional, and retain journey `En proceso`.
- Preserve data across reload/restart.

### Out of Scope
- Pending-item management, reappointments, reservations, referrals, aptitude, closure, certificates, reports, and frontend.
- Complete authentication and advanced authorization.

## Capabilities

### New Capabilities
- `applicant-registration`: Applicant, journey, unique number, and queue creation.
- `attention-queue-query`: Queue and journey lookup.
- `professional-attention`: Start/finalize lifecycle and concurrency exclusion.

### Modified Capabilities
None.

## Approach

Use feature-oriented NestJS modules over Prisma. Run state changes transactionally and back validation with PostgreSQL constraints. Keep APIs frontend-independent. Define concurrency and serverless connection details during design.

## Impact

| Area | Impact |
|---|---|
| `src/`, `prisma/` | Backend, domain flow, schema, migrations, demo data |
| Deployment/config | Vercel and PostgreSQL configuration |
| API consumers | Postman/curl contract |

## Risks and Rollback

Concurrency or serverless configuration could cause inconsistency or deployment failure. Mitigate with constraints, transactions, integration tests, and provider guidance. Roll back deployment and migrations together: back up data, apply a tested down migration or restore the database, then redeploy the last known-good version.

## Resolved Decisions

- **Registration required fields:** `nombre`, `apellido`, and fictitious `DNI` are all mandatory; the internal `Postulante` id is system-generated.
- **Authentication scope (this slice):** none. Slice 1 endpoints are open. Authentication and role-based permissions are deferred to a later slice and will be managed by the NestJS backend.
- **Database provider:** Neon — serverless PostgreSQL with integrated connection pooling and Vercel integration.

## Source Traceability

All sources are under `docs/requisitos/`:
- `Mapa_conceptual/06 Primer recorrido funcional/08 Alcance del primer recorrido funcional.docx`: slice and acceptance.
- `Require&Spec-U_Case-U_History/SO TURNERO - Requisitos y especificaciones.docx`: RF-01–09, RNF-01–04.
- `Require&Spec-U_Case-U_History/Casos de uso — SO Turnero.docx`: CU01–CU02.
- `Require&Spec-U_Case-U_History/Historias de usuario.docx`: HU-ADM-01–03, HU-PRO-01–02, HU-CON-01.
- `Mapa_conceptual/01 Modelo conceptual/03 Estados y transiciones.docx` and `02 Reglas operativas y de integridad.docx`: vocabulary and invariants.

## Success Criteria

- Two registrations receive distinct numbers and survive restart.
- A queued applicant can start and finish one attention with correct states/timestamps.
- Concurrent starts leave exactly one active attention.
- Finalization never closes the journey.
