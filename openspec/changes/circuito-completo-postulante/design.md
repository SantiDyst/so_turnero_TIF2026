# Design: Completing the Applicant Circuit (RF-09–RF-14)

## Technical Approach

Adopt explicit circuit aggregates with dedicated feature modules (Approach 1). PostgreSQL stays authoritative; NestJS feature-module style preserved. Transition guards live in services; DB constraints enforce invariants, mapped to HTTP by a shared error mapper. Four stacked PR slices.

## Architecture Decisions

| Decision | Choice | Alternatives | Rationale |
|---|---|---|---|
| Evaluation aggregate | New `Evaluacion` table, three rows created eagerly on registration | Reuse `Atencion` fields | Separates evaluation/report/result/journey state; makes the RF-13 gate and RF-14 matrix explicit and additive |
| Specialty type | `Especialidad` enum on `Atencion`, required on `Profesional` | Keep free string | Free strings cannot enforce the three-specialty circuit |
| Follow-up attention state | `EN_ESPERA` on fulfillment, explicit start later | Create `EN_ATENCION` | Preserves start-timestamp semantics and the one-active invariant |
| `Esperando llamado` | Derived in the read model | Persisted state | Vocabulary lists only `En espera`/`En proceso`/`Cierre final` |
| Overlap protection | `btree_gist` exclusion on `RESERVADA` | App-level check | DB-authoritative under concurrency |
| Aptitude timing | Inside the third completion transaction | Separate call | Exactly one stored result when the gate opens |

## Data Flow

    Registration tx ─→ Postulante, Recorrido, 3×Evaluacion
    Start tx ─→ lock Recorrido/Profesional → Atencion(EN_ATENCION) → journey EN_PROCESO
    Evaluation completion tx ─→ COMPLETA; if 3rd → upsert ResultadoAptitud
    Reservation fulfillment tx ─→ CUMPLIDA + one EN_ESPERA follow-up
    Closure tx ─→ assert gate → CIERRE_FINAL

## File Changes

| File | Action | Description |
|---|---|---|
| `prisma/schema.prisma` | Modify | Enums, models, relations, `CIERRE_FINAL` |
| `prisma/migrations/2026…_circuit_*` (3 SQL files) | Create | Additive schema + backfill; constraints; reservation exclusion |
| `src/shared/state-vocabulary.ts` | Modify | New vocabularies + mappers |
| `src/shared/prisma-error.mapper.ts` | Create | `P2002`→409, `23P01`→409 |
| `src/attentions/attention-command.service.ts` | Modify | `EN_PROCESO` eligibility, evaluation resolution, follow-ups |
| `src/applicants/registration.service.ts` | Modify | Eager 3 evaluations in the aggregate tx |
| `src/journeys/queue-query.service.ts` | Modify | Extended read model + derived `Esperando llamado` |
| `src/professionals/professionals.service.ts` | Modify | Specialty validation, availability/overlap helpers |
| `src/evaluations/`, `src/agenda/`, `src/derivations/`, `src/aptitude/` | Create | New feature modules (+ `app.module.ts` registration) |
| `test/**` | Modify | Enum fixtures + coverage |

## Interfaces / Contracts

**Schema** — enums `Especialidad(BIOQUIMICA|CLINICA_MEDICA|PSICOLOGIA)`, `EvaluacionEstado(PENDIENTE|COMPLETA)`, `ResultadoEspecialidad(APTO_PLENO|APTO_CONDICIONAL|NO_APTO)`, `ReservaEstado(RESERVADA|CUMPLIDA|CANCELADA|REPROGRAMADA|AUSENTE)`, plus `CIERRE_FINAL` on `RecorridoEstado`. Models: `Evaluacion(recorridoId, especialidad, estado, resultado?, completadaAt?, @@unique([recorridoId, especialidad]))`; `Pendiente(evaluacionId, atencionOrigenId?, motivo, fechaLimite?, resueltoAt?)`; `Recitacion(recorridoId, evaluacionId, pendienteId, reservaId, especialidad, fechaHora)`; `Reserva(profesionalId, recitacionId?, inicio, fin, estado, reservaAnteriorId?)`; `Derivacion(recorridoId, atencionOrigenId, especialidadDestino, motivo, createdAt)`; `ResultadoAptitud(recorridoId @unique, resultadoClinico, resultadoPsicologico, aptitudFinal, calculatedAt)`. `Atencion` gains `especialidad Especialidad`, `evaluacionId`, `atencionOrigenId?`, `recitacionId?`; `Profesional` gains required `especialidad`.

| Method + Path | Behavior |
|---|---|
| `POST /applicants` | 201; creates 3 evaluations atomically |
| `GET /journeys?…` | 200 with evaluations, pendings, recitations/reservations, derivations, aptitude, derived `Esperando llamado` |
| `POST /journeys/:id/attentions` | 201; 400 invalid specialty/evaluation, 409 ineligible/active/busy/`COMPLETA` |
| `PATCH /attentions/:id/finalize` | 200; 400 bad state, 409 inactive |
| `POST /attentions/:id/pendings` | 201; 404 attention |
| `PATCH /pendings/:id/resolve` | 200; 409 already resolved |
| `PATCH /evaluations/:id/result` | 200; 400 Bioquímica or invalid result, 409 already complete |
| `PATCH /evaluations/:id/complete` | 200; 409 open pendings, missing result, or already complete |
| `POST /journeys/:id/recitations` | 201; recitation + reservation |
| `POST /reservations` | 201; 409 overlap (23P01), 400 bad interval |
| `PATCH /reservations/:id/fulfill\|cancel\|reschedule\|absent` | 200; 409 wrong source state; fulfill idempotent |
| `POST /journeys/:id/derivations` | 201; 400 same-specialty/unknown origin |
| `GET /journeys/:id/closure-readiness` | 200 gate flags |
| `POST /journeys/:id/close` | 200 `CIERRE_FINAL`; 409 gate unmet |

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| Unit | Vocabulary mappers, error→HTTP mapper (`P2002`,`23P01`), validation | Jest mocks |
| Integration | Partial/unique indexes, reservation exclusion, gate blocking, matrix | Isolated `test_` schema |
| E2E | Full circuit, derived state, four slices | supertest |

Required concurrency tests: concurrent starts → one `[201,409]`; overlapping reservations → one `RESERVADA` + one 409; duplicate fulfillment → one follow-up; double aptitude → single `ResultadoAptitud`; closure race → one `CIERRE_FINAL`.

## Threat Matrix

N/A — no routing, shell, subprocess, VCS/PR automation, executable-file classification, or process-integration boundary; an in-process REST + Postgres schema surface.

## Migration / Rollout

Four stacked PR slices: (1) foundation/evaluations/sequential attentions/read model; (2) pendings/recitations; (3) agenda/derivations; (4) closure/aptitude. Additive migrations: (A) enums/tables/nullable columns + backfill `Atencion.especialidad` (`Clinical`→`CLINICA_MEDICA`, unknown→`CLINICA_MEDICA`) and `Profesional.especialidad`; (B) NOT NULL tighten + hand-written indexes (preserve `atencion_one_active_per_applicant`; add `UNIQUE(recitacionId) WHERE recitacionId IS NOT NULL`); (C) `btree_gist` + `EXCLUDE USING gist ("profesionalId" WITH =, tsrange("inicio","fin") WITH &&) WHERE ("estado"='RESERVADA')`. Fallback: `pg_advisory_xact_lock(hashtext(profesionalId))` + overlap `SELECT`, still DB-authoritative. Enum removal is unsafe → rollback is revert + snapshot restore.

## Open Questions

Resolved with the user on 2026-10-19:

- [x] `btree_gist` is assumed available on Neon; the advisory-lock fallback stays documented if `CREATE EXTENSION` fails (slice 3).
- [x] `Reserva.inicio/fin` use `timestamptz(3)` (`@db.Timestamptz(3)`) so intervals are timezone-safe.
- [x] `BIOQUIMICA` completes without a matrix result; its `resultado` stays optional and unused by the aptitude matrix.
