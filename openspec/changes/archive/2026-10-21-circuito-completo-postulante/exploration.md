## Exploration: Full Applicant Circuit — RF-10 through RF-14 (`circuito-completo-postulante`)

### Current State

The repository contains the archived first slice (`primer-recorrido-funcional`, 12 requirements / 22 scenarios / 14 passing tests). It implements a NestJS + Prisma + PostgreSQL walking skeleton with feature modules and PostgreSQL-enforced invariants:

- `POST /applicants` registers a fictitious applicant, creates one `Recorrido` with an `AT-` number, and leaves it `En espera`.
- `GET /queue` lists only `Recorrido(estado = EN_ESPERA)`.
- `GET /journeys?applicantId=...` or `?attentionNumber=...` returns applicant, journey, and nested attentions.
- `POST /journeys/:id/attentions` starts an attention from an `En espera` journey with a `Disponible` professional.
- `PATCH /attentions/:id/finalize` closes an active attention as `Finalizada` or `Pendiente`, releases the professional, and never closes the journey.

Current domain model (`prisma/schema.prisma`):

- `Postulante` (nombre, apellido, dni) and one `Recorrido` per applicant.
- `Recorrido` states: `EN_ESPERA`, `EN_PROCESO`; unique `numeroAtencion`; `queuedAt`.
- `Atencion` stores `especialidad` as a free string, `profesionalId`, state, `startedAt`, `endedAt`; one partial unique index enforces at most one `En atención` row per applicant.
- `Profesional` stores only `nombre` and global `disponibilidad` (`Disponible` / `Ocupado`); it has no specialty and no schedule.
- `AtencionEstado.NO_INICIADA` and `EN_ESPERA` exist in the enum but are unused.

Critical structural limitation: `AttentionCommandService.start` requires `journey.estado === EN_ESPERA` and changes it to `EN_PROCESO`. Finalization never restores `EN_ESPERA`. Therefore the current implementation can start **only one attention per journey**. RF-09 (three specialties under one journey) is only partially implemented: the schema allows multiple attention rows, but the start eligibility rule prevents the second and third specialty attentions.

Gap map against the requested scope:

| Requirement | What exists | What is missing |
|---|---|---|
| RF-10 pendings and recitation | Finalization can set `Atencion.estado = Pendiente` | No `Pendiente` entity, reason, deadline, resolution timestamp, or multiple pendings per attention; no `Recitacion`; no link from a follow-up attention to the original evaluation/pending/attention; no way to start a follow-up attention after the journey is `En proceso` |
| RF-11 derivation | Nothing | No derivation record, origin attention link, destination specialty, reason, or traceability query |
| RF-12 protected agenda | Nothing | No reservation entity, no state transitions, no availability query, no double-booking protection, no reprogramming chain, no link from a fulfilled reservation to a follow-up attention |
| RF-13 three-evaluation gate | Nothing | No evaluation aggregate, no per-specialty completion state, no closure-readiness check, no blocking of calculation/closure |
| RF-14 final aptitude | Nothing | No specialty result, no aptitude calculation, no stored result inputs, no `Cierre final` journey state |
| RF-09 prerequisite | One attention per journey | Sequential Bioquímica / Clínica Médica / Psicología attentions under the same journey are not possible |

Source boundaries relevant to scope:

- **RF-15 (reports)** is out of scope for this change. The source separates evaluation state, specialty result, and report state: a saved report does not prove an evaluation is complete. This change must store the minimum evaluation completion and clinical/psychological result needed by RF-13/RF-14; it must not add report text/CRUD, which belongs to a later RF-15 change.
- **RF-16 (certificate)** is out of scope. The certificate requires a closed journey and registered aptitude, so this change should leave the journey in a terminal state that RF-16 can consume without schema rework.
- Authentication/authorization remains out of scope; the first slice is intentionally open.

Testing currently uses Jest + ts-jest with unit, isolated-schema integration, and HTTP e2e suites. Integration and e2e run against an ephemeral `test_<uuid>` Neon schema created by `test/support/global-setup.ts`; migrations are applied with `prisma migrate deploy` before tests. Existing e2e tests use free-form specialty strings (`"Clinical"`, `"Occupational medicine"`), which matters if specialty is normalized to an enum.

### Affected Areas

- `prisma/schema.prisma` — add evaluation, pending, recitation, reservation, derivation, and aptitude models; add `CIERRE_FINAL`; add specialty/result/reservation enums; link attentions to evaluations and origin attentions; add professional specialty.
- `prisma/migrations/<new>/migration.sql` — new tables, foreign keys, unique/partial indexes, reservation overlap exclusion constraint, and any backfill of evaluations/specialties. Prisma cannot declare exclusion constraints, so this migration must be reviewed by hand.
- `src/attentions/attention-command.service.ts` — relax start eligibility for `EN_PROCESO` journeys, validate the target evaluation, create or start follow-up attentions, and coordinate pending/evaluation completion with finalization.
- `src/attentions/attentions.controller.ts` — extend request validation for evaluation-aware starts and finalization; preserve comprehensible 400/404/409 mappings.
- `src/journeys/queue-query.service.ts` — extend the journey read model with evaluations, pendings, reservations, derivations, and aptitude; decide whether the queue/worklist includes `En proceso` journeys awaiting their next evaluation.
- `src/journeys/journeys.controller.ts` — possibly host closure-readiness/aptitude/close endpoints if they are journey-scoped.
- `src/applicants/registration.service.ts` — if evaluations are created eagerly, create the three specialty evaluations atomically with the applicant/journey aggregate.
- `src/professionals/professionals.service.ts` — add specialty-aware validation and reservation availability/locking helpers; keep global `disponibilidad` separate from future reservation slots.
- `src/shared/state-vocabulary.ts` — add mappings for `Cierre final`, evaluation states (`Pendiente` / `Completa`), reservation states, specialty results, and final aptitude; keep each state category distinct.
- `src/app.module.ts` — register new feature modules.
- New source modules, likely `src/evaluations/*` (evaluations, pendings, recitations), `src/agenda/*` or `src/reservations/*`, `src/derivations/*`, and `src/aptitude/*`.
- `test/unit/*`, `test/integration/database-invariants.spec.ts`, `test/e2e/*` — cover transitions, overlap races, one-follow-up-per-reservation, closure blocking, and the aptitude matrix; existing tests that assume a single attention per journey or free-form specialty will need updates.
- `docs/first-functional-run.md` or a new walkthrough — document the extended circuit and excluded RF-15/RF-16 scope.
- `openspec/specs/*` — new or modified capability specs for the circuit; `openspec/changes/circuito-completo-postulante/*` for proposal/spec/design/tasks.

### Approaches

1. **Explicit circuit aggregates with dedicated feature modules** — Add `Evaluacion` as the per-journey/per-specialty aggregate; keep `Atencion` as the professional intervention; add `Pendiente`, `Recitacion`, `Reserva`, `Derivacion`, and `ResultadoAptitud`. Extend `Atencion` with `evaluacionId` and optional `atencionOrigenId`/`recitacionId`. Use new `EvaluationsModule`, `AgendaModule`, `DerivationsModule`, and `AptitudeModule`, while extending `AttentionsModule` and `JourneysModule`.
   - Pros: mirrors the source vocabulary and entity model; keeps evaluation state, report state, specialty result, and journey state separate; makes the RF-13 gate and RF-14 matrix explicit; RF-15/RF-16 remain additive; DB constraints target the correct rows; easier to test each invariant.
   - Cons: largest schema and endpoint surface; requires registration bootstrap or lazy evaluation creation; requires updating existing tests that assume one attention per journey; more modules and files.
   - Effort: High.

2. **Attention-centric extension with minimal tables** — Reuse `Atencion` for evaluation progress: add nullable evaluation/result/pending/reservation fields and self-relations to the existing table; add only `Reserva` and `Derivacion` tables, or embed them in attention metadata.
   - Pros: smaller migration; fewer joins and modules; fastest path to a demo; reuses existing start/finalize endpoints.
   - Cons: conflates intervention, evaluation, report, and reservation; multiple pendings and multiple reservations per attention become awkward; closure queries become conditional/null-heavy; conflicts with the source rule that a saved report does not prove evaluation completion; likely rework for RF-15/RF-16; weak auditability.
   - Effort: Medium (short term), High (long term rework risk).

3. **State-machine-first or event-log design** — Persist transition events for journey/evaluation/attention/reservation and derive current state, optionally using a state-machine library or a central transition table.
   - Pros: explicit audit trail; centralizes legal transitions; strong consistency model for a complex circuit; good foundation for later reporting.
   - Cons: overkill for the academic MVP; introduces a new dependency or projection layer; the existing schema is stateful and would need substantial migration; larger review surface than a 400-line slice can absorb.
   - Effort: High.

### Recommendation

Adopt **Approach 1**, with a small shared transition-guard layer rather than a state-machine library. Keep the current feature-oriented NestJS style and PostgreSQL as the final authority.

Recommended target model:

- Add `CIERRE_FINAL` to `RecorridoEstado`.
- Add `Especialidad` (`BIOQUIMICA`, `CLINICA_MEDICA`, `PSICOLOGIA`) and use it for evaluation/derivation/reservation concepts. Decide explicitly whether `Atencion.especialidad` and `Profesional.especialidad` are migrated to the enum now or kept backward-compatible; the current free string cannot enforce the three-specialty circuit.
- Add `EvaluacionEstado` (`PENDIENTE`, `COMPLETA`) and `ResultadoEspecialidad` (`APTO_PLENO`, `APTO_CONDICIONAL`, `NO_APTO`).
- `Evaluacion`: `recorridoId`, `especialidad`, `estado`, nullable `resultado`, `completadaAt`; unique `(recorridoId, especialidad)`.
- `Pendiente`: `evaluacionId`, `atencionOrigenId`, `motivo`, optional `fechaLimite`, nullable `resueltoAt`; multiple per attention/evaluation allowed.
- `Recitacion`: `recorridoId`, `evaluacionId`, `pendienteId`, `reservaId`, `especialidad`, `motivo`, scheduled date/time.
- `Reserva`: `profesionalId`, optional `recitacionId`, `inicio`, `fin`, `estado` (`RESERVADA`, `CUMPLIDA`, `CANCELADA`, `REPROGRAMADA`, `AUSENTE`), optional `reservaAnteriorId`.
- `Derivacion`: `recorridoId`, `atencionOrigenId`, `especialidadDestino`, `motivo`, `createdAt`.
- `ResultadoAptitud`: `recorridoId` unique, `resultadoClinico`, `resultadoPsicologico`, `aptitudFinal`, `calculatedAt`.
- `Atencion`: add `evaluacionId` and optional origin/recitation links so a follow-up attention never replaces the original and never creates a new journey/number.
- `Profesional`: add specialty (required or nullable with application validation) and keep reservation availability separate from the global `Disponible`/`Ocupado` intervention flag.

State-machine rules to make explicit:

- A start is allowed when the journey is `EN_ESPERA` or `EN_PROCESO`, the applicant has no active attention, and the target evaluation is not `COMPLETA`. The first start moves the journey to `EN_PROCESO`; later starts do not change it.
- An evaluation becomes `COMPLETA` only through an explicit evaluation/completion action, not by saving a report. Enforce that all its pendings are resolved and that Clínica Médica/Psicología have a valid result before completion.
- A journey reaches `CIERRE_FINAL` only after all three evaluations are `COMPLETA`, clinical and psychological results exist, aptitude is calculated and stored, and closure is explicitly confirmed.
- Reservations start at `RESERVADA` and may move only to `CUMPLIDA`, `CANCELADA`, `REPROGRAMADA`, or `AUSENTE`. Cancellation and reprogramming free the slot. Reprogramming keeps the old row as `REPROGRAMADA` and creates a linked new `RESERVADA` row. Cancellation, reprogramming, and absence must not resolve pendings, complete evaluations, or close the journey.
- `CUMPLIDA` may create exactly one follow-up attention linked to the same evaluation, pending, recitation, and journey. Decide whether that attention is created as `EN_ESPERA` (explicit start later) or `EN_ATENCION` (professional already present); do not create both.

Concurrency and integrity strategy:

- Keep the existing partial unique index for one active attention per applicant.
- Add a unique constraint for the follow-up attention created by a reservation, so duplicate fulfillment requests cannot create two follow-ups.
- Add a unique `recorridoId` on `ResultadoAptitud` and compute inside a transaction with row locks; repeated calculation attempts become conflicts unless the source permits recalculation.
- For double-booking, prefer a PostgreSQL exclusion constraint: `btree_gist` plus `EXCLUDE USING gist ("profesionalId" WITH =, tsrange("inicio", "fin") WITH &&) WHERE ("estado" = 'RESERVADA')`. Prisma cannot declare it; add it in the reviewed migration and map SQLSTATE `23P01` to HTTP 409. If `btree_gist` is unavailable on the managed provider, fall back to a transaction + advisory lock/overlap query and document that the database is still authoritative.
- Lock the journey/evaluation row when starting an attention or completing an evaluation; the existing professional `FOR UPDATE` lock remains necessary for availability races.

Suggested API surface (to be finalized in spec/design):

- Extend `GET /journeys` with evaluations, pendings, reservations, derivations, and aptitude.
- Keep `POST /journeys/:id/attentions` and `PATCH /attentions/:id/finalize`, with evaluation-aware eligibility.
- Add pending lifecycle: `POST /attentions/:id/pendings`, `PATCH /pendings/:id/resolve`.
- Add recitation/reservation lifecycle: `POST /journeys/:id/recitations`, `GET /professionals/:id/availability?from=...&to=...`, `POST /reservations`, `PATCH /reservations/:id/fulfill|cancel|reschedule|absent`.
- Add `POST /journeys/:id/derivations`.
- Add `GET /journeys/:id/closure-readiness`, `POST /journeys/:id/aptitude`, and `POST /journeys/:id/close` if closure is kept in this change.
- Extend the queue or add a worklist so `En proceso` journeys awaiting their next evaluation are visible; do not leave professionals with only the first-attention queue.

Scope control: a single PR cannot carry this. Forecast is roughly 1,600–2,200 changed lines (schema and migration, five aggregates, API surface, tests, docs), with **High** 400-line budget risk. Recommended chained slices:

1. Foundation: evaluation aggregate, specialty normalization, sequential specialty attentions, read-model extension, migration/backfill.
2. Pendings and recitations: RF-10 plus the reservation link needed by recitation.
3. Protected agenda and derivations: RF-11 and RF-12, including the overlap constraint and all four reservation transitions.
4. Closure gate and aptitude: RF-13 and RF-14, including `CIERRE_FINAL`, matrix tests, and the final read model.

If the delivery strategy requires every SDD change to fit one PR, split this change into `evaluaciones-y-atenciones-sucesivas`, `pendientes-recitacion-agenda`, `derivaciones`, and `cierre-aptitud` before apply. Otherwise keep one SDD change with four stacked PR work units.

Explicit boundaries:

- RF-15: do not add `Informe` text/state CRUD in this change. Store only evaluation completion and the clinical/psychological result needed for RF-14. A later RF-15 change adds reports without changing the closure gate.
- RF-16: do not add `Certificado` or certificate endpoints. Leave `CIERRE_FINAL` and `ResultadoAptitud` ready for it.
- Do not add authentication or role enforcement; that remains a separate slice.

Decisions the proposal must resolve:

1. Is explicit journey closure included in this change? Recommended yes, because RF-14 and the `Cierre final` state need a terminal transition; otherwise RF-16 inherits an incomplete state model.
2. Is `Esperando llamado` a persisted state or a derived view? Recommended derived: `En proceso` + no active attention + pending evaluations; the approved journey vocabulary only lists `En espera`, `En proceso`, `Cierre final`.
3. How is availability defined? There is no working-hours/slot model. Recommended: caller supplies a start/end interval, the system checks overlap, and `GET availability` returns booked intervals; do not invent a slot grid.
4. Is a fulfilled reservation's follow-up attention created as `EN_ESPERA` or `EN_ATENCION`? Recommended `EN_ESPERA` with an explicit start to preserve timestamp semantics and the one-active-attention invariant.
5. Are evaluations created eagerly at registration or lazily on first attention? Recommended eager creation of the three rows for an explicit RF-13 read model.
6. Is `Atencion.especialidad` migrated to the specialty enum, and is `Profesional.especialidad` required or nullable? The current tests use free-form strings; this is a compatibility decision.
7. Does `COMPLETA` require zero open pendings? Recommended yes, because the source says the evaluation completes only when no impediments remain.
8. What does "estado resultante" mean for a derivation? Recommended return the journey state and origin/destination attention identifiers; do not invent a derivation state enum unless the spec requires one.

### Risks

- **Scope and review budget:** the change crosses schema, five aggregates, existing attention semantics, and a large test matrix. Without chained PRs it will exceed the 400-line budget by a wide margin.
- **State-machine regression:** relaxing `start` from `EN_ESPERA`-only changes the invariant that currently guarantees the first slice's behavior. Existing e2e/integration tests encode that rule and must be updated without weakening the synchronized-start race guarantee.
- **RF-09 prerequisite hidden in the scope:** the current code cannot run three specialty attentions. If this change does not explicitly include that completion, RF-13/RF-14 cannot be demonstrated end to end.
- **Reservation concurrency:** application-level overlap checks race; the exclusion constraint is the reliable mechanism, but Prisma does not model it and error mapping for `23P01` must be proven. `btree_gist` availability on the managed provider is an external dependency.
- **Duplicate follow-up attention:** a repeated `CUMPLIDA` request can create two follow-up attentions unless a unique constraint or idempotent transition guard protects the operation.
- **Report/evaluation conflation:** if clinical/psychological results are stored on report records, RF-14 will depend on RF-15 and the closure gate will be wrong. Keep result and completion on the evaluation aggregate.
- **Specialty migration compatibility:** converting `Atencion.especialidad` to an enum can break existing data, tests, and documented curl examples (`"Clinical"`, `"Occupational medicine"`). A nullable professional specialty has the same issue for fixtures.
- **Ambiguous availability semantics:** no business hours, slot duration, or timezone convention exists in the sources. Inventing one can produce a demo that does not match the expected 10:00–10:30 test case.
- **Pending semantics:** `Atencion.estado = Pendiente` is an intervention outcome; `Evaluacion.estado = Pendiente` is progress. Treating them as the same state will make the closure gate unreliable.
- **Closure ambiguity:** the source uses both "Cerrado" (CU04) and "Cierre final" (states document). Pick the approved `Cierre final` vocabulary and document it.

### Ready for Proposal

**Yes** for proposal work, provided the proposal records the eight decisions above as assumptions or resolved choices. **No** for a single-PR delivery: the change must be planned as chained work units, or split into smaller SDD changes before apply. The proposal should explicitly include RF-09 completion as a prerequisite, keep RF-15/RF-16 out of scope, and state that RF-14 stores evaluation results rather than reports.
