# Design: Specialty Reports (RF-15) and Final Certificate (RF-16)

## Technical Approach

Two additive aggregates: `Informe` keyed 1:1 to `Evaluacion` (recitations reuse it) and `Certificado` keyed 1:1 to `Recorrido` with an immutable aptitude snapshot. New `src/reports/` and `src/certificates/` modules follow the no-DTO, manual-validation, English-key style; shared views feed both journey reads. Report writes never touch evaluation, pending, attention, journey, or aptitude rows.

## Architecture Decisions

| Decision | Choice | Rejected | Rationale |
|---|---|---|---|
| Report anchor | `evaluacionId @unique`; `atencionId?` is provenance | Attention anchor; columns on `Evaluacion` | Recitations add attentions, not evaluations: three reports, RF-15 decoupled from the gate. |
| Relations | `Informe → Evaluacion` Cascade, `Certificado → Recorrido` Cascade; optional `atencion`/`profesional` FKs `SetNull` | `Restrict`; required professional | Matches existing optional-FK convention; uniques cover lookups, plus only FK indexes. |
| Migration | New `20261019000400_circuit_d` (latest confirmed `00300_circuit_c`) | Folding into `circuit_c` | Additive `CREATE TYPE/TABLE`, unique indexes, FKs; no backfill, no data-dependent SQL; the `test_` harness runs `migrate deploy` per schema. |
| Report write | Resolve evaluation from `atencion.evaluacionId`, else `recorridoId_especialidad` (as `createPending`); transaction locks the journey `FOR UPDATE`, re-checks `CIERRE_FINAL`, upserts on `evaluacionId` | Re-derive journey+specialty | Upsert is idempotent; the journey lock serializes against closure without modifying the gate. |
| Issuance | Explicit `POST`; transaction locks journey, returns an existing row early, checks closure + `ResultadoAptitud`, resolves professional, inserts; `P2002` caught outside the transaction via `isPrismaConflict` and re-read | Auto-issue inside `close`; 409 on duplicate | Later/concurrent requests converge on one row and `200`; no coupling to the closure transaction. |
| Wrong-specialty `professionalId` | `400` | `409` | A wrong id is an invalid body value, like `setResult`; `409` is only eligibility. |
| Read model | Fixed-order (`BIOQUIMICA, CLINICA_MEDICA, PSICOLOGIA`) `reports[]` and `certificate: object \| null`; new `InformeState` mapper for `reportState` | Reusing `toEvaluationState` | Prevents the `Pendiente` collision; state is independent of text length. |

## Data Flow

```
PUT /attentions/:id/report → attention → journey lock → closed? 409 → upsert
GET /journeys → {reports[], certificate}
POST /journeys/:id/certificate → journey lock → existing? 200 → eligible? 409
   → professional → create 201; P2002 → re-read 200
```

## File Changes

| File | Action | Description |
|---|---|---|
| `prisma/schema.prisma` | Modify | Enum, two models, back-relations |
| `prisma/migrations/20261019000400_circuit_d/migration.sql` | Create | Additive DDL |
| `src/reports/{controller,service,module,report.view}.ts` | Create | Upsert, read, composer |
| `src/certificates/{controller,service,module,certificate.view}.ts` | Create | Issue/read, composer |
| `src/journeys/queue-query.service.ts` | Modify | Add `reports[]`, `certificate` |
| `src/shared/state-vocabulary.ts` | Modify | `InformeState`, mappers |
| `src/app.module.ts` | Modify | Register modules |
| `test/{unit,integration,e2e}/`, `docs/first-functional-run.md` | Modify | Coverage and walkthrough |

## Interfaces / Contracts

| Route | Status |
|---|---|
| `PUT /attentions/:id/report` | `200`; `400` invalid body or `Completo` with empty observations; `404` unknown attention; `409` closed journey |
| `GET /journeys/:id/reports` | `200` (always three); `404` unknown journey |
| `POST /journeys/:id/certificate` | `201` first, `200` repeat (`@Res` passthrough); `400` invalid `professionalId`; `404` unknown journey/professional; `409` not closed or no aptitude |
| `GET /journeys/:id/certificate` | `200`; `404` before issuance |

```prisma
enum InformeEstado { PENDIENTE COMPLETO }
// Informe: id uuid PK; evaluacionId @unique (Cascade); atencionId? (SetNull);
//   profesionalId? (SetNull); observaciones @default(""); estado; completadoAt?;
//   createdAt/updatedAt; @@index([atencionId]), @@index([profesionalId])
// Certificado: id uuid PK; recorridoId @unique (Cascade); identificador @unique
//   (CERT-<numeroAtencion>); aptitudFinal snapshot; profesionalId? (SetNull);
//   emitidoAt @default(now()); createdAt/updatedAt; @@index([profesionalId])
```

```ts
// reports[]: { reportId: string|null, evaluationId, specialty, reportState: 'Pendiente'|'Completo',
//   applicant: {id,nombre,apellido}, attentionNumber, originArea: 'Admisión',
//   responsible: {area, professional: {id,nombre}|null}, observations: string|null,
//   specialtyResult: ResultadoEspecialidad|null, finalAptitude: ResultadoEspecialidad|null,
//   updatedAt: Date|null }
// certificate: { id, identifier: 'CERT-<numeroAtencion>', attentionNumber,
//   applicant: {id,nombre,apellido}, finalAptitude, issuedAt,
//   responsibleProfessional: {id,nombre}|null }
```

Unwritten entries expose nulls and `reportState: 'Pendiente'`; `specialtyResult` is `null` for `BIOQUIMICA`. Identifier is `CERT-<numeroAtencion>`; `aptitudFinal` is a snapshot; repeats re-read it. Professional: explicit `professionalId` (`CLINICA_MEDICA`, `404` unknown), else latest clinical attention, else `null`. No `prisma-error.mapper.ts` change: `P2002` already maps to `409` and `isPrismaConflict` is exported.

## Testing Strategy

| Layer | What | Approach |
|---|---|---|
| Unit | Views, vocabulary, body validation, ordering, professional resolution | Direct calls, no DB |
| Integration | Upsert/recitation reuse, decoupling, eligibility, null professional, concurrent issuance | Services on the isolated `test_` schema |
| E2E | Status matrix, three reports, `CERT-AT-1042` with `Apto condicional`, read-before-issue | supertest via `createApp()` |

## Threat Matrix

N/A — no routing, shell, subprocess, VCS/PR automation, executable classification, or process integration.

## Migration / Rollout

Slices: (1) schema + reports, (2) read model + e2e + docs, (3) certificates. No backfill; rollback drops both tables and reverts keys/routes. Each stays under 400 lines.

## Open Questions

None. The wrong-specialty `professionalId` case is resolved as `400` above.
