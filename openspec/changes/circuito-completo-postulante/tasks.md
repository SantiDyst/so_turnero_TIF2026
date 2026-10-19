# Tasks: Completing the Applicant Circuit (RF-09–RF-14)

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated lines | 1,300–1,800 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 → PR 2 → PR 3 → PR 4 |
| Delivery strategy | auto-chain |
| Chain strategy | stacked-to-main |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|---|---|---|---|---|---|
| 1 | Evaluations, sequential starts, read model | PR 1 | `npm run test:integration -- circuit-foundation` | `npm run start:dev`: two specialty starts (`201`,`201`) | Migrations A/B and read model |
| 2 | Pendings, gate, recitations | PR 2 | `npm run test:e2e -- pendings` | `npm run start:dev`: pending → resolve → recitation | `src/evaluations/`, pending routes |
| 3 | Reservations, agenda, derivations | PR 3 | `npm run test:integration -- reservations` | Overlapping `POST /reservations` → `201`,`409` | `src/agenda/`, `src/derivations/`, migration C |
| 4 | Aptitude, explicit closure | PR 4 | `npm run test:integration -- aptitude` | Readiness then `POST /close` → `CIERRE_FINAL` | Aptitude/closure code; enum stays |

## Phase 1: PR 1 — Foundation (RF-09)

- [x] 1.1 Add circuit enums, `CIERRE_FINAL`, models to `prisma/schema.prisma`; `Reserva` times use `@db.Timestamptz(3)`.
- [x] 1.2 Migration A (`prisma/migrations/*_circuit_a`): tables, nullable columns; backfill specialty (`Clinical`, unknown → `CLINICA_MEDICA`).
- [x] 1.3 Migration B (`prisma/migrations/*_circuit_b`): NOT NULL, preserve active-attention index, add evaluation and `recitacionId` uniques.
- [x] 1.3b Backfill migration: three evaluations for every pre-existing journey (idempotent `NOT EXISTS` guard).
- [x] 1.4 Create `src/shared/prisma-error.mapper.ts` (`P2002`/`23P01` → 409); extend `state-vocabulary.ts`.
- [x] 1.5 Create three evaluations in the `src/applicants/registration.service.ts` aggregate transaction.
- [x] 1.6 `src/attentions/attention-command.service.ts`: accept `EN_PROCESO`, resolve/reject the evaluation, store `evaluacionId`.
- [x] 1.7 `src/journeys/queue-query.service.ts`: all circuit records; derived `Esperando llamado` (not persisted).
- [x] 1.8 Update fixtures in `test/e2e/journey.e2e-spec.ts` and `test/integration/database-invariants.spec.ts`.
- [x] 1.9 Test `test/unit/circuit-vocabulary.spec.ts`: mappers, conflation, errors.
- [x] 1.10 Test `test/integration/circuit-foundation.spec.ts`: three evaluations, rollback, duplicate specialty, invalid professional specialty.
- [x] 1.11 Test `test/e2e/circuit-foundation.e2e-spec.ts`: first/later/ineligible/sequential starts, concurrent same/cross-specialty `[201,409]`, queue removal, derived state appears/drops.

## Phase 2: PR 2 — Pendings, Gate, Recitations (RF-10)

- [ ] 2.1 `src/evaluations/`: pending create/resolve routes (409 repeat); register in `src/app.module.ts`.
- [ ] 2.2 Completion gate: zero open pendings; Clínica/Psicología non-`PENDIENTE` result; Bioquímica exempt; store it.
- [ ] 2.3 `src/agenda/recitations.service.ts` + `POST /journeys/:id/recitations`: links pending/evaluation/journey; creates `RESERVADA`, no state changes.
- [ ] 2.4 Test `test/unit/pendings-recitations.spec.ts`: validation and gate errors.
- [ ] 2.5 Test `test/e2e/pendings.e2e-spec.ts`: resolve one of two, recitation leaves states unchanged, finalize/report keeps `PENDIENTE`, gate blocked/allowed.

## Phase 3: PR 3 — Agenda and Derivations (RF-11, RF-12)

- [ ] 3.1 `src/agenda/reservations.service.ts` + `POST /reservations` (`inicio < fin`); only `RESERVADA` occupies.
- [ ] 3.2 Migration C (`prisma/migrations/*_circuit_c`): `btree_gist` interval exclusion where `RESERVADA`; implement advisory-lock fallback, documented in `docs/first-functional-run.md`.
- [ ] 3.3 Fulfill/cancel/reschedule/absent transitions; reprogram keeps `REPROGRAMADA` and links new `RESERVADA`.
- [ ] 3.4 Fulfillment creates one `EN_ESPERA` follow-up linking evaluation, pending, recitation, journey; repeat idempotent.
- [ ] 3.5 `src/derivations/`: same-journey origin, destination ≠ origin, expose journey state and ids.
- [ ] 3.6 Test `test/integration/reservations.spec.ts`: overlap 409, concurrent overlap, slot release, reprogram chain, transition guards.
- [ ] 3.7 Test `test/e2e/agenda-derivations.e2e-spec.ts`: concurrent duplicate fulfillment, circuit preservation, derivation create/reject/traceability.

## Phase 4: PR 4 — Closure and Aptitude (RF-13, RF-14)

- [ ] 4.1 `src/aptitude/aptitude.service.ts`: `NO_APTO` → `APTO_CONDICIONAL` → `APTO_PLENO`; ignore Bioquímica; upsert per journey.
- [ ] 4.2 Store aptitude in the third completion transaction; nothing earlier.
- [ ] 4.3 `GET /journeys/:id/closure-readiness` + locked `POST /journeys/:id/close` (409 until gate passes).
- [ ] 4.4 Test `test/integration/aptitude.spec.ts`: matrix rows, no early store, one result, complete read model, post-close 409, closure reject/eligible.
- [ ] 4.5 Test `test/integration/closure-race.spec.ts`: one `CIERRE_FINAL`.
- [ ] 4.6 Update `docs/first-functional-run.md`; run `npm test`, `npm run build`.
