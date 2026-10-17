# Design: First Functional Run

## Technical Approach

Build a NestJS HTTP API whose feature modules call Prisma directly. PostgreSQL owns persistence and critical uniqueness; application transactions own lifecycle transitions. Endpoints are deliberately open for this academic slice. Authentication, pendientes, recitation, reservations, referral, aptitude, closure, certificates, reports, and frontend remain excluded.

## Architecture Decisions

| Decision | Choice | Alternatives considered | Rationale |
|---|---|---|---|
| Module boundaries | `ApplicantsModule`/`RegistrationService`, `JourneysModule`/`QueueQueryService`/`JourneyQueryService`, `AttentionsModule`/`AttentionCommandService`, `ProfessionalsModule`, plus shared `PrismaModule`/`PrismaService` | Technical controller/service/repository layers; one monolith module | Features align with capabilities; services contain transactions and use Prisma without empty repository wrappers. |
| Queue | A queued item is `Recorrido(estado=EN_ESPERA, queuedAt)`; no queue table | Separate mutable queue row | Avoids duplicate state while still creating a durable queue entry atomically. |
| Concurrency | Interactive transactions plus PostgreSQL constraints | Application pre-check or process mutex | Serverless instances cannot share locks; the database is the authority. |
| Attention number | PostgreSQL sequence, rendered `AT-` plus at least four digits (`AT-0001`, `AT-10000`), and unique column | UUID; `MAX+1`; random retry | Human-readable, race-safe, monotonic; gaps after rollback are acceptable. |
| Deployment data access | Neon pooled runtime connection and direct migration connection | Direct runtime connections | Pooling limits connection fan-out from Vercel functions. |

## Data Model

Prisma sketch (relation fields omitted for brevity):

```prisma
enum RecorridoEstado { EN_ESPERA @map("En espera") EN_PROCESO @map("En proceso") }
enum AtencionEstado { NO_INICIADA @map("No iniciada") EN_ESPERA @map("En espera") EN_ATENCION @map("En atención") FINALIZADA @map("Finalizada") PENDIENTE @map("Pendiente") }
enum DisponibilidadProfesional { DISPONIBLE @map("Disponible") OCUPADO @map("Ocupado") }

model Postulante { id String @id @default(uuid()); nombre String; apellido String; dni String; createdAt DateTime @default(now()); recorrido Recorrido? }
model Recorrido { id String @id @default(uuid()); postulanteId String @unique; numeroAtencion String @unique; estado RecorridoEstado @default(EN_ESPERA); queuedAt DateTime @default(now()); atenciones Atencion[] }
model Atencion { id String @id @default(uuid()); recorridoId String; postulanteId String; especialidad String; profesionalId String; estado AtencionEstado; startedAt DateTime?; endedAt DateTime?; createdAt DateTime @default(now()) }
model Profesional { id String @id @default(uuid()); nombre String; disponibilidad DisponibilidadProfesional @default(DISPONIBLE); atenciones Atencion[] }
```

Registration calls `nextval('recorrido_attention_no_seq')`, formats it, then inserts applicant and journey in one transaction. `numeroAtencion @unique` is the backstop.

Prisma cannot declare the required partial unique index. A reviewed hand-written migration MUST add:

```sql
CREATE UNIQUE INDEX atencion_one_active_per_applicant
ON "Atencion" ("postulanteId") WHERE "estado" = 'En atención';
```

Start runs transactionally: validate the journey and lock the professional row (`SELECT ... FOR UPDATE`), insert `EN_ATENCION`, then update journey/professional. Racing requests for different professionals may both validate, but the index blocks and rejects the loser; Prisma unique-constraint errors map to HTTP 409 and its transaction rolls back. The professional lock also serializes races for one professional. Finalization locks the active attention/professional, updates attention and availability, and intentionally does not update the journey.

## Data Flow

```mermaid
sequenceDiagram
 Client->>RegistrationService: POST applicant
 RegistrationService->>DB: BEGIN; nextval
 RegistrationService->>DB: INSERT Postulante + Recorrido(En espera)
 DB-->>RegistrationService: COMMIT aggregate
 RegistrationService-->>Client: 201
```

```mermaid
sequenceDiagram
 participant A as Start A
 participant B as Start B
 A->>DB: BEGIN; validate; INSERT active
 B->>DB: BEGIN; validate; INSERT active
 DB-->>A: COMMIT winner
 DB-->>B: partial unique index violation; ROLLBACK
 B-->>B: map to 409 conflict
```

```mermaid
sequenceDiagram
 Client->>AttentionCommandService: PATCH finalize
 AttentionCommandService->>DB: BEGIN; lock active attention/professional
 AttentionCommandService->>DB: update attention + professional Disponible
 Note over AttentionCommandService,DB: Recorrido remains En proceso
 DB-->>Client: COMMIT; 200
```

## Interfaces / Contracts

| Endpoint | Request | Success | Errors |
|---|---|---|---|
| `POST /applicants` | `{nombre,apellido,dni}` | `201 {applicant:{id,...},journey:{id,attentionNumber,state:"En espera"}}` | `400` all field errors |
| `GET /queue` | — | `200 [{applicantId,attentionNumber,journeyState:"En espera",queuedAt}]` | — |
| `GET /journeys?applicantId=...` or `?attentionNumber=...` | exactly one identifier | `200 {applicant,journey,attentions:[{state,specialty,professional,availability,startedAt,endedAt}]}` | `400`, `404` |
| `POST /journeys/:id/attentions` | `{specialty,professionalId}` | `201 {attentionId,state:"En atención",startedAt}` | `404`, `409` |
| `PATCH /attentions/:id/finalize` | `{state:"Finalizada"|"Pendiente"}` | `200 {id,state,endedAt,journeyState:"En proceso",professionalAvailability:"Disponible"}` | `400`, `404`, `409` |

## Technology and Files

Target files: `src/app.module.ts`, `src/prisma/*`, `src/{applicants,journeys,attentions,professionals}/*`, `prisma/schema.prisma`, `prisma/migrations/*/migration.sql`, `prisma.config.ts`, `api/index.ts`, and `.env.example` (all create).

Use current Prisma 7 configuration: `schema.prisma` declares `datasource db { provider = "postgresql" }`; `prisma.config.ts` supplies `DIRECT_URL` to Prisma CLI/migrations, while the runtime adapter uses pooled Neon `DATABASE_URL` (`-pooler` host). Keep one cached Prisma client per warm function. Never use `DIRECT_URL` at runtime: per-instance pools can exhaust Neon connections.

## Testing Strategy

No runner exists yet. Add unit tests for state transitions, validation, and error mapping; integration tests against isolated test PostgreSQL for sequence/index/migration and transactional rollback; E2E HTTP tests for registration, queue/lookups, start/finalize, restart persistence, and a synchronized concurrent-start race proving one `201`, one `409`, and one active row.

## Migration / Rollout

Create and review the sequence, Prisma migration, and manual index; apply through `DIRECT_URL` before deploying the API. Roll back API and database together using a tested down migration/restore.

## Open Questions

None.
