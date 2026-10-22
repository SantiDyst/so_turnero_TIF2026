# Proposal: Specialty Reports (RF-15) and Final Certificate (RF-16)

## Intent

RF-15 and RF-16 are the last MVP requirements; the circuit produces neither deliverable, so the journey cannot be demonstrated end to end.

## Scope

### In Scope
- Persisted `Informe` per evaluation.
- `PUT /attentions/:id/report`, `GET /journeys/:id/reports`.
- Persisted `Certificado` with `CERT-<numeroAtencion>`.
- Idempotent `POST /journeys/:id/certificate`, `GET /journeys/:id/certificate`.
- `reports[]`/`certificate` in `GET /journeys`; `AT-1042` walkthrough.

### Out of Scope
- Signature, delivery, PDF (JSON only).
- Report-driven completion or closure gating.
- Frontend, auth, `README.md`; pre-existing dirty files.

## Capabilities

### New Capabilities
- `specialty-reports`: one persisted report per specialty, anchored on `Evaluacion` (`evaluacionId @unique`); state `Pendiente | Completo`, `Completo` MUST have non-empty observations; recitations update the same report; writes rejected after `CIERRE_FINAL`, reads allowed; saving MUST NOT change evaluation/attention state, pendings, or closure readiness.
- `final-certificate`: issuance MUST require `CIERRE_FINAL` plus a stored `ResultadoAptitud`, else `409`; `CERT-<numeroAtencion>` unique; repeat issuance returns `200` with the existing row; JSON-only payload with an immutable aptitude snapshot; specialty results composed at read time, `BIOQUIMICA` has none.

### Modified Capabilities
- `attention-queue-query`: add `reports[]` (three entries in `BIOQUIMICA, CLINICA_MEDICA, PSICOLOGIA` order) and `certificate: {...} | null`; add `reportState: Pendiente | Completo` distinct from attention `Pendiente`, plus `identifier`, `issuedAt`, `responsibleProfessional`, `finalAptitude`.

Stale exclusion lines fixed at archive.

## Approach

- Additive `Informe` (`evaluacionId @unique`, `atencionId?`, `profesionalId?`, `observaciones`, `estado`, `completadoAt`) and `Certificado` (`recorridoId @unique`, `identificador @unique`, `aptitudFinal`, `profesionalId?`, `emitidoAt`) plus `InformeEstado`; migration mirrors `circuit_c`.
- New `src/reports/` and `src/certificates/` modules: controller/service/module, inline interfaces, manual validation, English keys, Spanish values.
- Certificate professional: `professionalId` (`CLINICA_MEDICA`) → latest `CLINICA_MEDICA` attention → `null`; closed journeys without one still issue.
- Unique constraints provide idempotency; `P2002` re-reads.
- Three stacked PR slices: schema+reports, read model, certificates.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `prisma/schema.prisma` | Modified | Two models, one enum |
| `prisma/migrations/20261019000400_circuit_d/migration.sql` | New | Additive DDL |
| `src/reports/` | New | Upsert and read |
| `src/certificates/` | New | Issuance and read |
| `src/journeys/queue-query.service.ts` | Modified | `reports[]`, `certificate` |
| `src/shared/state-vocabulary.ts` | Modified | `InformeEstado` mapping |
| `src/app.module.ts` | Modified | Module wiring |
| `test/{unit,integration,e2e}` | Modified | Coverage |
| `docs/first-functional-run.md` | Modified | Walkthrough |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Review budget overflow | High | Stacked PRs |
| `Pendiente` vocabulary collision | Med | Separate `reportState`; no `toEvaluationState` reuse |
| Report/evaluation conflation | Med | Separate aggregates; invariant tests |
| Closed journey without clinical attention | Med | Nullable professional |
| Concurrent duplicate issuance | Low | Unique keys; `P2002` re-read |
| Migration breaks test schemas | Low | Additive DDL; verify on `test_` schema |
| Dirty worktree contamination | Med | Stage only change files |

## Rollback Plan

Drop both tables and migration; revert additive read-model keys and routes; delete both modules. No data rewritten.

## Dependencies

- RF-13/RF-14 closure, stored aptitude, and `test_` schema harness.

## Success Criteria

- [ ] Three reports per journey, consultable and persisted across reload.
- [ ] `CERT-AT-1042` + `Apto condicional` reproducible via the documented fictitious circuit.
- [ ] Report writes never change closure readiness.
- [ ] `npm test` and `npm run build` green.
