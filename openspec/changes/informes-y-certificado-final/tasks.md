# Tasks: Specialty Reports (RF-15) and Final Certificate (RF-16)

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | 1,200–1,700 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 → PR 2 → PR 3 |
| Delivery strategy | auto-chain |
| Chain strategy | stacked-to-main |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

Size exceptions (accepted by owner on 2026-10-21):
- PR 1: ~1,017 authored lines (951 new-file + 66 tracked insertions; ~515 test lines). One review unit keeps the RF-15 schema, service, and its tests together.
- PR 3: 863 authored lines (298 source, 512 tests, 53 docs/tasks). Splitting would separate the certificate routes from their acceptance coverage; 351 lines are non-test work.
- PR 2 shipped at 399 lines, inside the 400-line budget, with no exception.
No scope was trimmed to fit the budget in any slice.

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|---|---|---|---|---|---|
| 1 | Report schema and upsert | PR 1 | `npm run test:integration -- reports` | `npm run start:dev`: save twice, one row | Migration `circuit_d`, `src/reports/`, vocabulary |
| 2 | Read model + docs | PR 2 | `npm run test:e2e -- journey` | `GET /journeys/:id` shows three `reports[]`, `certificate: null` | `queue-query.service.ts` keys, docs |
| 3 | Certificate issuance | PR 3 | `npm run test:integration -- certificates` | `POST .../certificate` twice → `201`, `200`, same `CERT-AT-1042` | `src/certificates/`, routes |

## Phase 1: PR 1 — Reports Foundation (RF-15)

- [x] 1.1 `prisma/schema.prisma`: add `InformeEstado`, `Informe` (`evaluacionId @unique` Cascade, optional `atencionId`/`profesionalId` SetNull, `observaciones`, `estado`, `completadoAt`), `Certificado`, back-relations.
- [x] 1.2 Create `prisma/migrations/20261019000400_circuit_d/migration.sql`: additive enum/tables, indexes, FKs, no backfill; verify on `test_` schema.
- [x] 1.3 `src/shared/state-vocabulary.ts`: add `InformeState` mapper (`Pendiente`/`Completo`); no `toEvaluationState` reuse.
- [x] 1.4 Test `test/unit/reports.spec.ts`: empty `Completo` → `400`, fixed order, vocabulary disambiguation, view nulls.
- [x] 1.5 `src/reports/report.view.ts`: applicant, attention number, `Admisión`, specialty, professional, result (`null` for `BIOQUIMICA`), aptitude, `reportState`, timestamp.
- [x] 1.6 `src/reports/reports.service.ts`: resolve evaluation from attention, journey `FOR UPDATE`, `CIERRE_FINAL` → `409`, upsert on `evaluacionId`.
- [x] 1.7 `src/reports/reports.controller.ts` + module (`PUT /attentions/:id/report`, `GET /journeys/:id/reports`); wire `src/app.module.ts`.
- [x] 1.8 Test `test/integration/reports.spec.ts`: recitation reuses one row, circuit unchanged, closed write `409`, reads allowed.
- [x] 1.9 No `prisma-error.mapper.ts` change: reuse exported `isPrismaConflict` (`P2002` → `409`); no `P2025` mapping.

## Phase 2: PR 2 — Read Model + Docs

- [x] 2.1 `src/journeys/queue-query.service.ts`: ordered `reports[]`, `certificate: object | null`; keep existing keys and `Esperando llamado`.
- [x] 2.2 Test `test/unit/queue-vocabulary.spec.ts`: `reportState` vs `state`, certificate `null`.
- [x] 2.3 Test `test/e2e/journey.e2e-spec.ts`: three-entry read, status matrix, key preservation.
- [x] 2.4 `docs/first-functional-run.md`: RF-15 walkthrough; update Excluded scope.

## Phase 3: PR 3 — Certificates (RF-16)

- [x] 3.1 Test `test/unit/certificates.spec.ts`: professional resolution (explicit/latest/`null`), wrong-specialty body → `400`.
- [x] 3.2 `src/certificates/certificate.view.ts`: identifier, attention number, applicant, aptitude snapshot, `issuedAt`, professional `| null`.
- [x] 3.3 `certificates.service.ts`: journey lock, existing early `200`, closure+aptitude else `409`, insert `201`; `P2002` re-read.
- [x] 3.4 `certificates.controller.ts` + module (`POST` `201`/`200` via `@Res` passthrough, `GET` `404` pre-issuance); wire app module.
- [x] 3.5 Test `test/integration/certificates.spec.ts`: `CERT-AT-1042`, repeat/concurrent single row, no clinical attention → `null`, ineligible `409`.
- [x] 3.6 Test `test/e2e/certificate.e2e-spec.ts`: `Apto condicional`, read `404` → `200`, identical repeat.
- [x] 3.7 Docs RF-16 walkthrough; `npm test`, `npm run build`.

Out of scope: pre-existing dirty `package.json` seed script, never staged.
