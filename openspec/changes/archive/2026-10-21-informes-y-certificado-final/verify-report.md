```yaml
schema: gentle-ai.verify-result/v1
evidence_revision: sha256:a3d6575045e119b643bd23e09864302457ef5daeda4c2b162c2a9d0ed363dd5b
verdict: pass_with_warnings
blockers: 0
critical_findings: 0
requirements: 8/8
scenarios: 18/18
test_command: npm test
test_exit_code: 0
test_output_hash: sha256:4d09ee2d77f82ba64b73295ba279b05209af04006c92bbb79e9a2ce1d96a6aea
build_command: npm run build
build_exit_code: 0
build_output_hash: sha256:bf4afb2013aa15c8ca5eb5fe72a0d562d55c4f36c6447a6138058cfe7c6b8709
```

## Verification Report

**Change**: `informes-y-certificado-final`
**Version**: N/A (delta specs under `openspec/changes/informes-y-certificado-final/specs/`)
**Mode**: Standard (Strict TDD inactive; no `strict_tdd` config or runner detected)
**Artifact store**: openspec
**HEAD**: `c60f608` (merge of PR #10); slices #8, #9, #10 all on `main`

### Completeness

| Metric | Value |
|--------|-------|
| Tasks total | 20 |
| Tasks complete | 20 |
| Tasks incomplete | 0 |

All 20 tasks in `tasks.md` (1.1–1.9, 2.1–2.4, 3.1–3.7) are checked. Size exceptions for PR 1 (~1,017 lines) and PR 3 (863 lines), and PR 2 at 399 lines, are documented in `tasks.md:19-23` and `design.md:87`.

### Build & Tests Execution

**Build**: ✅ Passed (`npm run build` → exit 0, `nest build` no diagnostics)

**Tests**: ✅ 117 passed / 0 failed / 0 skipped

| Project | Suites | Tests | Result |
|---|---|---|---|
| unit | 6 | 59 | ✅ all passed |
| integration | 7 | 30 | ✅ all passed |
| e2e | 5 | 28 | ✅ all passed |
| **total** | **18** | **117** | ✅ |

Integration/e2e ran against the isolated `test_<uuid>` schema created by `test/support/global-setup.ts:27-45`, which executes `prisma migrate deploy` — so the new `20261019000400_circuit_d` migration is exercised at runtime, not only validated statically.

**Coverage**: ➖ Not available (no coverage provider configured in `jest.config.js`)

### Specification & Environment Checks

| Command | Exit | Result |
|---|---|---|
| `npm run build` | 0 | `nest build` clean |
| `npm test` | 0 | 18/18 suites, 117/117 tests |
| `npx prisma validate` | 0 | `The schema at prisma\schema.prisma is valid` |
| `npx prisma migrate status` | 0 | 6 migrations found; target DB (`neondb`/`public`) reports `Database schema is up to date!` — report-only, no migration applied by this phase |

### Spec Compliance Matrix

#### `specialty-reports` (3 requirements / 5 scenarios)

| Requirement | Scenario | Test evidence | Result |
|---|---|---|---|
| SR-R1 Persist one report per journey and specialty | SR-S1 Recitation reuses the existing report | `test/integration/reports.spec.ts:95` — one `Informe` row after recitation, `atencionId` updated | ✅ COMPLIANT |
| SR-R2 Authorize writes without altering the circuit | SR-S2 Reject invalid or closed writes | `test/integration/reports.spec.ts:185` (409 after `CIERRE_FINAL`), `:239` (404 attention/journey), `test/unit/reports.spec.ts:62` (400 invalid body / empty `Completo`) | ✅ COMPLIANT |
| SR-R2 | SR-S3 Saving leaves the circuit unchanged | `test/integration/reports.spec.ts:95` — journey/evaluations/pendings/aptitude/readiness snapshot equal before vs after; pending stays unresolved | ✅ COMPLIANT |
| SR-R3 Expose exactly three composed reports | SR-S4 Order with pending placeholders | `test/unit/reports.spec.ts:153`, `test/integration/reports.spec.ts:170`, `test/e2e/journey.e2e-spec.ts:266` | ✅ COMPLIANT |
| SR-R3 | SR-S5 Compose stored values | `test/unit/reports.spec.ts:206`, `test/integration/reports.spec.ts:118`, `test/e2e/journey.e2e-spec.ts:342` | ✅ COMPLIANT |

#### `final-certificate` (3 requirements / 6 scenarios)

| Requirement | Scenario | Test evidence | Result |
|---|---|---|---|
| FC-R1 Issue only for a closed journey with stored aptitude | FC-S1 Issue an eligible certificate | `test/integration/certificates.spec.ts:80`, `test/e2e/certificate.e2e-spec.ts:69` (HTTP 201) | ✅ COMPLIANT |
| FC-R1 | FC-S2 Reject ineligible issuance | `test/integration/certificates.spec.ts:179` (open + closed-without-aptitude → 409, 0 rows), `test/e2e/certificate.e2e-spec.ts:110` | ✅ COMPLIANT |
| FC-R2 Store a deterministic snapshot | FC-S3 Resolve the responsible professional | `test/integration/certificates.spec.ts:80` (latest of two clinical attentions), `test/unit/certificates.spec.ts:143` (explicit / wrong-specialty 400 / unknown 404 / null) | ✅ COMPLIANT |
| FC-R2 | FC-S4 Issue without clinical attention | `test/integration/certificates.spec.ts:169` (`responsibleProfessional: null`) | ✅ COMPLIANT |
| FC-R3 Issue idempotently and expose the certificate | FC-S5 Repeat and concurrent issuance | `test/integration/certificates.spec.ts:80` (`Promise.all` at `:101-110`, exactly one `created`, identical views), `test/e2e/certificate.e2e-spec.ts:89` (201 → 200, byte-identical body) | ✅ COMPLIANT |
| FC-R3 | FC-S6 Read before and after issuance | `test/e2e/certificate.e2e-spec.ts:72` (404) and `:95` (200), `test/integration/certificates.spec.ts:99` | ✅ COMPLIANT |

#### `attention-queue-query` (2 requirements / 7 scenarios)

| Requirement | Scenario | Test evidence | Result |
|---|---|---|---|
| AQ-R1 Report only the approved state vocabulary | AQ-S1 Query after a state transition | `test/e2e/journey.e2e-spec.ts:86` (attention `En atención`/`Finalizada`, `journeyState: En proceso`, availability `Disponible`), `test/e2e/circuit-foundation.e2e-spec.ts:79` | ✅ COMPLIANT |
| AQ-R1 | AQ-S2 Report circuit states without conflation | `test/unit/circuit-vocabulary.spec.ts:45,60`, `test/e2e/agenda-derivations.e2e-spec.ts:154,262`, `test/e2e/pendings.e2e-spec.ts:246` | ✅ COMPLIANT |
| AQ-R1 | AQ-S3 Disambiguate report and attention state | `test/unit/queue-vocabulary.spec.ts:111` (both `Pendiente`, distinct keys), `test/unit/reports.spec.ts:144` (`not.toHaveProperty('state')`), `test/e2e/journey.e2e-spec.ts:379-384` | ✅ COMPLIANT |
| AQ-R2 Expose the complete circuit read model | AQ-S4 Read the complete circuit | `test/e2e/journey.e2e-spec.ts:266` (full key set assertion), `test/e2e/circuit-foundation.e2e-spec.ts:79` | ✅ COMPLIANT |
| AQ-R2 | AQ-S5 Derive Esperando llamado | `test/e2e/circuit-foundation.e2e-spec.ts:228`, `test/unit/queue-vocabulary.spec.ts:149`, `test/e2e/journey.e2e-spec.ts:373` | ✅ COMPLIANT |
| AQ-R2 | AQ-S6 Drop the derived value after the next start | `test/e2e/circuit-foundation.e2e-spec.ts:228` (`:245` derived present → `:254` `null` after start) | ✅ COMPLIANT |
| AQ-R2 | AQ-S7 Include reports and certificate | `test/unit/queue-vocabulary.spec.ts:178` (3 reports + composed certificate in one read), `test/e2e/certificate.e2e-spec.ts:100` (journey read returns the issued certificate) | ✅ COMPLIANT |

**Compliance summary**: 18/18 scenarios compliant; 8/8 requirements have passing runtime evidence.

### Correctness (Static Evidence)

| Requirement | Status | Notes |
|---|---|---|
| One report per journey+specialty | ✅ Implemented | `Informe.evaluacionId @unique` (`prisma/schema.prisma:235`); `upsert` on that key (`src/reports/reports.service.ts:90-108`) |
| Recitation reuses row | ✅ Implemented | Upsert update branch only rewrites provenance/observations/state (`reports.service.ts:100-106`) |
| Write authorization | ✅ Implemented | `400` body/empty-`Completo` (`reports.controller.ts:49-75`, `:62`), `404` attention/journey/professional, `409` closed after `lockJourney` (`reports.service.ts:72-76`) |
| Writes never alter the circuit | ✅ Implemented | Service touches only `informe`; no evaluation/pending/attention/journey/aptitude writes (`reports.service.ts:54-128`) |
| Three ordered reports | ✅ Implemented | `SUPPORTED_SPECIALTIES` fixed order (`state-vocabulary.ts:59-63`) consumed by `buildJourneyReports` (`report.view.ts:92-105`) |
| Entry shape + nulls | ✅ Implemented | `report.view.ts:68-90`; `specialtyResult` forced `null` for `BIOQUIMICA` (`:85-86`) |
| Issuance eligibility | ✅ Implemented | `CIERRE_FINAL` + stored `ResultadoAptitud`, else `409` (`certificates.service.ts:112-117`); `404` unknown journey (`:97-99`) |
| Deterministic snapshot | ✅ Implemented | `CERT-${numeroAtencion}` (`certificate.view.ts:34-36`), `identificador @unique`, `aptitudFinal` snapshot (`certificates.service.ts:125-133`) |
| Professional resolution | ✅ Implemented | Explicit → `404` unknown / `400` non-`CLINICA_MEDICA`; else latest clinical attention; else `null` (`certificates.service.ts:35-51`, `:153-180`) |
| Idempotent issuance | ✅ Implemented | Early `200` on existing row (`:101-110`), `P2002` caught outside the transaction and re-read (`:144-150`); `201`/`200` via `@Res` passthrough (`certificates.controller.ts:23-33`) |
| Certificate read | ✅ Implemented | `404` before issuance, `200` after (`certificates.service.ts:57-79`) |
| Read-model additions | ✅ Implemented | `reports[]` and `certificate` appended without renaming existing keys (`src/journeys/queue-query.service.ts:186-198`) |
| `reportState` vs `state` | ✅ Implemented | Separate `InformeState` mapper (`state-vocabulary.ts:40-43`, `:98-104`); no `toEvaluationState` reuse |
| Migration additive | ✅ Implemented | `prisma/migrations/20261019000400_circuit_d/migration.sql` — `CREATE TYPE/TABLE`, unique indexes, FKs, no backfill, no data-dependent SQL |
| No DTOs / manual validation | ✅ Followed | Inline `interface` bodies + explicit checks in both controllers |

### Coherence (Design)

| Decision | Followed? | Notes |
|---|---|---|
| Report anchored on `evaluacionId @unique`, `atencionId?` as provenance | ✅ Yes | `schema.prisma:234-250` |
| Cascade `Informe→Evaluacion` / `Certificado→Recorrido`; optional FKs `SetNull` | ✅ Yes | `migration.sql:44-50` |
| New migration `20261019000400_circuit_d`, not folded into `circuit_c` | ✅ Yes | Additive DDL; executed per test schema by `global-setup.ts:38` |
| Report write: resolve evaluation, lock journey, re-check closure, upsert | ✅ Yes | `reports.service.ts:71-108` |
| Explicit `POST` issuance with journey lock, early existing row, eligibility, `P2002` re-read | ✅ Yes | `certificates.service.ts:81-151` |
| Wrong-specialty `professionalId` → `400` | ✅ Yes | `certificates.service.ts:46-48` |
| Fixed-order `reports[]`, `certificate: object \| null`, new `InformeState` mapper | ✅ Yes | `queue-query.service.ts:186-198` |
| Route/status contracts (`PUT` 200/400/404/409; `GET reports` 200/404; `POST` 201/200; `GET certificate` 200/404) | ✅ Yes | Verified live in e2e; see SUGGESTION V-3 for the one undocumented shape |
| No `prisma-error.mapper.ts` change; reuse exported `isPrismaConflict` | ✅ Yes | `certificates.service.ts:11,145`; mapper untouched in the diff |
| Module wiring (`src/app.module.ts`) | ✅ Yes | `ReportsModule`, `CertificatesModule` registered |

### Issues Found

**CRITICAL**: None. Build and all 117 tests are green; every scenario has passing runtime evidence.

**WARNING**:

| ID | Finding | Evidence |
|---|---|---|
| V-1 | Spec/runtime drift on the closed journey value: `attention-queue-query` requires journey state `CIERRE_FINAL`, but the read model emits `Cierre final`. **Pre-existing** — identical wording already in the baseline spec before this change, so it is not a defect introduced here, but the delta carries it forward and archive sync will preserve the mismatch. | Spec: `specs/attention-queue-query/spec.md:7`; baseline: `openspec/specs/attention-queue-query/spec.md:47`; code: `src/shared/state-vocabulary.ts:15`; docs: `docs/first-functional-run.md:54`; asserted at `test/unit/circuit-vocabulary.spec.ts:46` |

**SUGGESTION**:

| ID | Finding | Evidence |
|---|---|---|
| V-2 | `GET /journeys/:id/reports` returns `{ journeyId, reports[] }`, an envelope neither the spec nor `design.md` describes (design specifies only the three-entry `reports[]` shape). Confirm the envelope is intentional before archive fixes the contract. | `src/reports/reports.service.ts:155-158` |
| V-3 | An attention without an associated evaluation yields `400 The attention has no associated evaluation.`, a status case absent from the design status table for `PUT /attentions/:id/report`. Unreachable in the current flow (every attention is created with `evaluacionId`) but undocumented. | `src/reports/reports.service.ts:180-182`; `design.md:45` |
| V-4 | The `P2002` fallback in `CertificatesService.issue` (`isPrismaConflict` → `read`) has no dedicated test; concurrency coverage goes through the journey lock path instead. Behavior is spec-compliant, but the defensive branch is unexercised. | `src/certificates/certificates.service.ts:144-150`; `test/integration/certificates.spec.ts:101-110` |
| V-5 | Re-saving a report as `Pendiente` resets `completadoAt` to `null`, discarding a prior completion timestamp. Consistent with "`completadoAt` when complete", but the transition semantics are unstated in the spec. | `src/reports/reports.service.ts:89,105` |

**INFO** (out of change scope, informational only):

| ID | Finding | Evidence |
|---|---|---|
| V-6 | Pre-existing dirty worktree: `package.json` modified, `scripts/seed-professionals.ts` and `vercel.json` untracked. Not part of this change's commits; recorded as ops work outside SDD scope. | `git status --porcelain` |
| V-7 | Repo-wide CRLF/lint/format noise (`core.autocrlf=true`) explicitly deferred by the owner; `npm run lint` / `format:check` were intentionally not used as gate evidence. | owner instruction |
| V-8 | Size exceptions confirmed documented, not violations: PR 1 ~1,017 lines and PR 3 863 lines accepted; PR 2 at 399 lines under budget. | `tasks.md:19-23`; `design.md:87` |

### Verdict

**PASS WITH WARNINGS**

Build, `prisma validate`, and the full unit/integration/e2e suite are green, and all 8 requirements / 18 scenarios have passing runtime evidence. The only warning is a documented, pre-existing spec/runtime vocabulary drift (`CIERRE_FINAL` vs `Cierre final`) that this change inherits rather than introduces; the four suggestions are contract-documentation and defensive-path notes. Recommended next step: `sdd-archive`, optionally correcting the `CIERRE_FINAL` wording in the archived delta first.
