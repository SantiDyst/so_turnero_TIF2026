```yaml
schema: gentle-ai.verify-result/v1
evidence_revision: sha256:fe6d0a8759928dc7f10c4e4d9abb9b5aeb94c64a411438945f629d1750eaed57
verdict: pass
blockers: 0
critical_findings: 0
requirements: 20/20
scenarios: 40/40
test_command: npm test
test_exit_code: 0
test_output_hash: sha256:34e13ea22e1404d4af9ccf49be12eb00f23f1eb16cb7d2eb1fc28e106e904377
build_command: npm run build
build_exit_code: 0
build_output_hash: sha256:18bff772971995771af6badd80a317fd577998a88cf0087ca0a27ac0560ed5bc
```

## Verification Report

**Change**: circuito-completo-postulante
**Version**: N/A (delta specs, no version field)
**Mode**: Standard (Strict TDD disabled in `openspec/config.yaml` and no active strict runner)
**Repository**: `C:\Users\R1zenz\Desktop\so_turnero_TIF2026`, branch `main`, HEAD `c96a15e`
**Working tree**: clean before and after verification (`git status --porcelain` empty)

### Completeness
| Metric | Value |
|--------|-------|
| Tasks total | 30 |
| Tasks complete | 30 |
| Tasks incomplete | 0 |

Task count is taken from the actual `tasks.md` (12 in Phase 1, including `1.3b`, plus 5 + 7 + 6 in Phases 2-4). The launch brief expected 29; the artifact contains 30 checked tasks and zero unchecked tasks, so full verification is unblocked.

### Build & Tests Execution
**Build**: ✅ Passed (`npm run build` → `nest build`, exit `0`, output hash `sha256:18bff772971995771af6badd80a317fd577998a88cf0087ca0a27ac0560ed5bc`)
```text
> so-turnero@0.1.0 build
> nest build
```

**Tests**: ✅ 82 passed / ❌ 0 failed / ⚠️ 0 skipped (`npm test`, exit `0`, output hash `sha256:34e13ea22e1404d4af9ccf49be12eb00f23f1eb16cb7d2eb1fc28e106e904377`)
```text
> npm run test:unit && npm run test:integration && npm run test:e2e

unit:        3 suites passed, 34 tests passed
integration: 5 suites passed, 23 tests passed
e2e:         4 suites passed, 25 tests passed

Test Suites: 12 passed, 12 total
Tests:       82 passed, 82 total
Snapshots:   0 total
```
Integration and e2e connected to the isolated `test_` schema on the Neon dev database; no DATABASE_URL blocker occurred.

**Prisma schema**: ✅ Valid (`npx prisma validate`, exit `0`)
```text
Prisma schema loaded from prisma\schema.prisma.
The schema at prisma\schema.prisma is valid
```

**Coverage**: ➖ Not available / threshold: 0 → coverage is disabled in project config and no coverage command exists.

### Spec Compliance Matrix
All 40 scenarios below were mapped to covering tests that executed and passed in the `npm test` run recorded above.

| Requirement | Scenario | Test | Result |
|-------------|----------|------|--------|
| SE-R1 Create exactly three specialty evaluations per journey | Registration creates the three evaluations | `test/integration/circuit-foundation.spec.ts > creates exactly three evaluations with the journey` | ✅ COMPLIANT |
| SE-R1 Create exactly three specialty evaluations per journey | Reject a duplicate specialty evaluation | `test/integration/circuit-foundation.spec.ts > rejects a duplicate specialty evaluation and rolls the aggregate back` | ✅ COMPLIANT |
| SE-R2 Complete an evaluation only when its work is closed | Complete an evaluation whose work is closed | `test/unit/pendings-recitations.spec.ts > completes a clinical evaluation with a result and no open pendings`; `test/e2e/pendings.e2e-spec.ts > blocks CLINICA_MEDICA completion until pendings are resolved and a result is stored` | ✅ COMPLIANT |
| SE-R2 Complete an evaluation only when its work is closed | Block completion with open work | `test/unit/pendings-recitations.spec.ts > rejects completion while a pending is open`; `test/e2e/pendings.e2e-spec.ts > blocks PSICOLOGIA completion until pendings are resolved and a result is stored` | ✅ COMPLIANT |
| SE-R2 Complete an evaluation only when its work is closed | A saved report does not complete an evaluation | `test/e2e/pendings.e2e-spec.ts > finalizing an attention with open pendings does not complete its evaluation` | ✅ COMPLIANT |
| PR-R1 Record and resolve multiple pendings explicitly | Resolve one of several pendings | `test/e2e/pendings.e2e-spec.ts > resolves one of two pendings and leaves the other open` | ✅ COMPLIANT |
| PR-R2 Create a recitation linked to the circuit and a reservation | Schedule a recitation | `test/e2e/pendings.e2e-spec.ts > schedules a recitation without resolving the pending or changing circuit state`; `test/unit/pendings-recitations.spec.ts > creates a recitation and reservation without changing circuit state` | ✅ COMPLIANT |
| PR-R2 Create a recitation linked to the circuit and a reservation | Scheduling changes no circuit state | `test/e2e/pendings.e2e-spec.ts > schedules a recitation without resolving the pending or changing circuit state` | ✅ COMPLIANT |
| PR-R3 Fulfillment creates exactly one linked follow-up attention | Fulfill a reservation | `test/e2e/agenda-derivations.e2e-spec.ts > creates exactly one follow-up attention under concurrent duplicate fulfillment`; `test/e2e/agenda-derivations.e2e-spec.ts > adopts the pending follow-up when starting an attention after fulfillment` | ✅ COMPLIANT |
| PR-R3 Fulfillment creates exactly one linked follow-up attention | Repeat fulfillment idempotently | `test/e2e/agenda-derivations.e2e-spec.ts > creates exactly one follow-up attention under concurrent duplicate fulfillment` | ✅ COMPLIANT |
| PA-R1 Manage reservation states and slot occupancy | Transition a reserved slot | `test/integration/reservations.spec.ts > guards every transition to a RESERVADA source state`; `test/integration/reservations.spec.ts > releases the slot when a reservation is cancelled`; `test/integration/reservations.spec.ts > chains reprogrammed reservations and frees the previous slot` | ✅ COMPLIANT |
| PA-R1 Manage reservation states and slot occupancy | Release a slot | `test/integration/reservations.spec.ts > releases the slot when a reservation is cancelled`; `test/integration/reservations.spec.ts > chains reprogrammed reservations and frees the previous slot` | ✅ COMPLIANT |
| PA-R2 Reject overlapping reservations atomically | Reject an overlapping reservation | `test/integration/reservations.spec.ts > rejects an overlapping reservation for the same professional`; `test/e2e/agenda-derivations.e2e-spec.ts > rejects an overlapping reservation for the same professional with 409` | ✅ COMPLIANT |
| PA-R2 Reject overlapping reservations atomically | Serialize concurrent overlaps | `test/integration/reservations.spec.ts > serializes concurrent overlapping requests into one reservation and one conflict` | ✅ COMPLIANT |
| PA-R3 Chain reprogrammed reservations | Reprogram a reservation | `test/integration/reservations.spec.ts > chains reprogrammed reservations and frees the previous slot`; `test/e2e/agenda-derivations.e2e-spec.ts > preserves the circuit when a reservation is cancelled, rescheduled, or absent` | ✅ COMPLIANT |
| PA-R4 Preserve the circuit on cancel, reschedule, and absence | Cancellation, rescheduling, and absence change no circuit state | `test/e2e/agenda-derivations.e2e-spec.ts > preserves the circuit when a reservation is cancelled, rescheduled, or absent` | ✅ COMPLIANT |
| SD-R1 Derive to another specialty from an existing attention | Derive to another specialty | `test/e2e/agenda-derivations.e2e-spec.ts > records a derivation with traceability and rejects invalid destinations` | ✅ COMPLIANT |
| SD-R1 Derive to another specialty from an existing attention | Reject an invalid destination or origin | `test/e2e/agenda-derivations.e2e-spec.ts > records a derivation with traceability and rejects invalid destinations` | ✅ COMPLIANT |
| SD-R2 Expose derivation traceability | Read derivation traceability | `test/e2e/agenda-derivations.e2e-spec.ts > records a derivation with traceability and rejects invalid destinations` | ✅ COMPLIANT |
| FA-R1 Calculate and store final aptitude automatically | Third completion stores the aptitude | `test/integration/aptitude.spec.ts > stores nothing before the third evaluation completes`; `test/integration/aptitude.spec.ts > stores exactly one aptitude under concurrent final completions` | ✅ COMPLIANT |
| FA-R1 Calculate and store final aptitude automatically | Apply the aptitude matrix | `test/integration/aptitude.spec.ts > stores APTO_PLENO clinical and APTO_PLENO psychological as APTO_PLENO`; `... > stores APTO_PLENO clinical and APTO_CONDICIONAL psychological as APTO_CONDICIONAL`; `... > stores NO_APTO clinical and APTO_PLENO psychological as NO_APTO` (`it.each`) | ✅ COMPLIANT |
| FA-R1 Calculate and store final aptitude automatically | No aptitude before three completions | `test/integration/aptitude.spec.ts > stores nothing before the third evaluation completes` | ✅ COMPLIANT |
| FA-R2 Close the journey only after the full gate | Reject closure before the gate | `test/integration/aptitude.spec.ts > reports readiness, rejects early closure, closes explicitly, and locks writes` | ✅ COMPLIANT |
| FA-R2 Close the journey only after the full gate | Close an eligible journey | `test/integration/aptitude.spec.ts > reports readiness, rejects early closure, closes explicitly, and locks writes`; `test/integration/closure-race.spec.ts > serializes concurrent close requests into one CIERRE_FINAL and one conflict` | ✅ COMPLIANT |
| AR-R1 Create the initial journey atomically | Create the registration aggregate | `test/integration/circuit-foundation.spec.ts > creates exactly three evaluations with the journey`; `test/e2e/circuit-foundation.e2e-spec.ts > exposes the empty circuit and removes a started journey from the queue`; `test/e2e/journey.e2e-spec.ts > registers valid applicants and rejects every missing required field without persistence` | ✅ COMPLIANT |
| AR-R1 Create the initial journey atomically | Roll back an incomplete aggregate | `test/integration/circuit-foundation.spec.ts > rejects a duplicate specialty evaluation and rolls the aggregate back`; `test/integration/database-invariants.spec.ts > enforces the partial active-attention index and rolls back a failing aggregate` | ✅ COMPLIANT |
| AQ-R1 Expose the complete circuit read model | Read the complete circuit | `test/e2e/agenda-derivations.e2e-spec.ts > records a derivation with traceability and rejects invalid destinations` (evaluations, pendings, recitations, reservations, derivations); `test/integration/aptitude.spec.ts > reports readiness, rejects early closure, closes explicitly, and locks writes` (stored aptitude in `/journeys` read model); `test/integration/circuit-foundation.spec.ts > creates exactly three evaluations with the journey` (empty collections) | ✅ COMPLIANT |
| AQ-R1 Expose the complete circuit read model | Derive Esperando llamado | `test/e2e/circuit-foundation.e2e-spec.ts > derives Esperando llamado only while no attention is active and drops it on start` | ✅ COMPLIANT |
| AQ-R1 Expose the complete circuit read model | Drop the derived value after the next start | `test/e2e/circuit-foundation.e2e-spec.ts > derives Esperando llamado only while no attention is active and drops it on start` | ✅ COMPLIANT |
| AQ-R2 Query the waiting queue | List a newly registered applicant | `test/e2e/journey.e2e-spec.ts > lists only waiting journeys and resolves equivalent journey identifiers`; `test/e2e/circuit-foundation.e2e-spec.ts > exposes the empty circuit and removes a started journey from the queue` | ✅ COMPLIANT |
| AQ-R2 Query the waiting queue | Remove a started journey from the queue | `test/e2e/circuit-foundation.e2e-spec.ts > exposes the empty circuit and removes a started journey from the queue`; `test/e2e/journey.e2e-spec.ts > starts and finalizes attention while enforcing professional and transition conflicts` | ✅ COMPLIANT |
| AQ-R3 Report only the approved state vocabulary | Query after a state transition | `test/e2e/journey.e2e-spec.ts > starts and finalizes attention while enforcing professional and transition conflicts`; `test/unit/controllers-and-vocabulary.spec.ts > keeps journey, attention, and professional vocabulary distinct` | ✅ COMPLIANT |
| AQ-R3 Report only the approved state vocabulary | Report circuit states without conflation | `test/unit/circuit-vocabulary.spec.ts > keeps journey, derived, evaluation, and reservation vocabularies separate`; `test/unit/circuit-vocabulary.spec.ts > maps every circuit state to its approved human value` | ✅ COMPLIANT |
| PAT-R1 Use the specialty enum for attentions and professionals | Reject a missing or unsupported professional specialty | `test/integration/circuit-foundation.spec.ts > rejects a missing or unsupported professional specialty`; `test/unit/circuit-vocabulary.spec.ts > accepts only the three supported specialties` | ✅ COMPLIANT |
| PAT-R2 Start an eligible professional attention | Start the first specialty attention | `test/e2e/circuit-foundation.e2e-spec.ts > exposes the empty circuit and removes a started journey from the queue`; `test/e2e/journey.e2e-spec.ts > starts and finalizes attention while enforcing professional and transition conflicts`; `test/integration/database-invariants.spec.ts > releases the professional while preserving the in-progress journey` | ✅ COMPLIANT |
| PAT-R2 Start an eligible professional attention | Start a later specialty attention | `test/e2e/circuit-foundation.e2e-spec.ts > starts specialties sequentially and rejects ineligible starts` | ✅ COMPLIANT |
| PAT-R2 Start an eligible professional attention | Reject an ineligible start | `test/e2e/circuit-foundation.e2e-spec.ts > starts specialties sequentially and rejects ineligible starts`; `test/e2e/journey.e2e-spec.ts > starts and finalizes attention while enforcing professional and transition conflicts` | ✅ COMPLIANT |
| PAT-R3 Enforce one active attention per applicant under concurrency | Reject a sequential second start | `test/e2e/journey.e2e-spec.ts > starts and finalizes attention while enforcing professional and transition conflicts`; `test/e2e/circuit-foundation.e2e-spec.ts > starts specialties sequentially and rejects ineligible starts` | ✅ COMPLIANT |
| PAT-R3 Enforce one active attention per applicant under concurrency | Serialize concurrent starts | `test/e2e/journey.e2e-spec.ts > allows exactly one synchronized concurrent start and leaves one active row`; `test/e2e/circuit-foundation.e2e-spec.ts > serializes concurrent same-specialty starts into one active attention` | ✅ COMPLIANT |
| PAT-R3 Enforce one active attention per applicant under concurrency | Serialize concurrent specialty starts | `test/e2e/circuit-foundation.e2e-spec.ts > serializes concurrent cross-specialty starts into one active attention` | ✅ COMPLIANT |

**Compliance summary**: 40/40 scenarios compliant (20/20 requirements have every scenario covered by a passing test).

Requirement totals were counted from the 8 delta specs: `specialty-evaluations` 2/5, `pendings-recitations` 3/5, `protected-agenda` 4/6, `specialty-derivation` 2/3, `final-aptitude` 2/5, `applicant-registration` 1/2, `attention-queue-query` 3/7, `professional-attention` 3/7.

### Correctness (Static Evidence)
| Requirement | Status | Notes |
|------------|--------|-------|
| Create exactly three specialty evaluations per journey | ✅ Implemented | `RegistrationService.register` creates the three rows inside the aggregate transaction; `@@unique([recorridoId, especialidad])` plus DB unique index enforce uniqueness. |
| Complete an evaluation only when its work is closed | ✅ Implemented | `EvaluationsService.complete` locks the row, rejects open pendings/missing result/already complete, sets `completadaAt`; report/finalize do not complete. |
| Record and resolve multiple pendings explicitly | ✅ Implemented | `Pendiente` rows carry evaluation, origin attention, reason, optional limit date, nullable resolution; resolve locks and stamps one row only. |
| Create a recitation linked to the circuit and a reservation | ✅ Implemented | `RecitationsService.schedule` links journey/evaluation/pending, creates `RESERVADA` reservation and back-links `Recitacion.reservaId` without state changes. |
| Fulfillment creates exactly one linked follow-up attention | ✅ Implemented | `ReservationsService.fulfill` reuses an existing follow-up or creates one `EN_ESPERA` row linked to evaluation/pending/origin attention/recitation; partial unique index on `Atencion.recitacionId` backs idempotency. |
| Manage reservation states and slot occupancy | ✅ Implemented | Transitions only from `RESERVADA`; only `RESERVADA` participates in overlap checks; cancel/reschedule/absent release the previous slot. |
| Reject overlapping reservations atomically | ✅ Implemented | `btree_gist` exclusion constraint (`23P01`), advisory lock + overlap `SELECT`, and `P2002`/`23P01` → HTTP `409` mapper. |
| Chain reprogrammed reservations | ✅ Implemented | Reschedule marks the previous row `REPROGRAMADA`, creates a linked `RESERVADA` row via `reservaAnteriorId`, and repoints `Recitacion.reservaId`. |
| Preserve the circuit on cancel, reschedule, and absence | ✅ Implemented | Release paths only update `Reserva.estado`; pending/evaluation/journey rows are untouched. |
| Derive to another specialty from an existing attention | ✅ Implemented | `DerivationsService.create` validates same-journey origin and destination ≠ origin, stores reason/timestamp, leaves journey state unchanged. |
| Expose derivation traceability | ✅ Implemented | Response contains `journeyState`, `originAttentionId`, `destinationSpecialty`; no derivation state enum exists. |
| Calculate and store final aptitude automatically | ✅ Implemented | `storeJourneyAptitude` runs inside the completion transaction, requires all three complete plus both results, and upserts one row per journey. |
| Close the journey only after the full gate | ✅ Implemented | `AptitudeService.close` locks the journey, re-checks readiness, rejects `CIERRE_FINAL`/unmet gate with `409`, and only then writes `CIERRE_FINAL`. |
| Create the initial journey atomically | ✅ Implemented | Applicant, journey, number and three evaluations share one Prisma transaction; failures roll back. |
| Expose the complete circuit read model | ✅ Implemented | `QueueQueryService.findJourney` returns evaluations, pendings, recitations, reservations, derivations and aptitude; derives `Esperando llamado` without persisting it. |
| Query the waiting queue | ✅ Implemented | `listQueue` filters `EN_ESPERA` only; started journeys remain queryable by identifier. |
| Report only the approved state vocabulary | ✅ Implemented | `state-vocabulary.ts` maps each domain separately; no shared/conflated state value. |
| Use the specialty enum for attentions and professionals | ✅ Implemented | `Especialidad` enum, required `Profesional.especialidad`, and controller-level `isSupportedSpecialty` rejection. |
| Start an eligible professional attention | ✅ Implemented | Start transaction locks journey and professional, validates journey/evaluation/availability/specialty, adopts pending follow-ups, sets `EN_ATENCION` + `Ocupado`. |
| Enforce one active attention per applicant under concurrency | ✅ Implemented | Partial unique index `atencion_one_active_per_applicant`, row lock on the journey, advisory-style professional lock and conflict mapping. |

### Coherence (Design)
| Decision | Followed? | Notes |
|----------|-----------|-------|
| Evaluation aggregate: new `Evaluacion` table with three eager rows | ✅ Yes | `prisma/schema.prisma` + migration A/B; registration creates three rows; backfill migration covers pre-existing journeys. |
| Specialty type: `Especialidad` enum required on `Atencion` and `Profesional` | ✅ Yes | Enum plus `NOT NULL` tightening in migration B; free-text legacy column dropped after backfill. |
| Follow-up attention in `EN_ESPERA`, adopted on next start | ✅ Yes | Fulfillment creates `EN_ESPERA`; `AttentionCommandService.start` adopts it into `EN_ATENCION` and keeps the one-active invariant. |
| `Esperando llamado` derived in the read model, never persisted | ✅ Yes | Derived in `QueueQueryService`; e2e proves the stored journey remains `EN_PROCESO`. |
| Overlap protection via `btree_gist` exclusion on `RESERVADA` | ✅ Yes | Migration C adds the exclusion constraint; runtime also advisory-locks and overlaps-checks; fallback documented in `docs/first-functional-run.md` ("Agenda fallback"). |
| Aptitude stored inside the third completion transaction | ✅ Yes | `EvaluationsService.complete` calls `storeJourneyAptitude` inside the same transaction; upsert per journey. |
| Shared Prisma error mapper (`P2002`/`23P01` → 409) | ✅ Yes | `src/shared/prisma-error.mapper.ts`; unit tests cover known, meta, raw and rethrow paths. |
| Four stacked PR slices and additive migrations | ✅ Yes | Merge history shows PRs #5, #6, #7 (plus the foundation slice); migrations are additive with an explicit backfill step. |
| `Reserva.inicio/fin` as `timestamptz(3)` | ✅ Yes | Schema annotation and integration assertion on `datetime_precision = 3`. |

No design deviation breaks a spec. The only doc/implementation nuance worth noting is that migration C is all-or-nothing if `CREATE EXTENSION btree_gist` is unavailable, although the runtime fallback and the manual skip instruction are both documented.

### Issues Found
**CRITICAL**: None.

**WARNING**: None.

**SUGGESTION**:
- Add an explicit assertion that the original (pre-fulfillment) attention row is unchanged; the fulfilling scenario currently proves the follow-up linkage and count but infers immutability of the origin row.
- Add one read-model test where evaluations, pendings, recitations, reservations, derivations and aptitude are all populated at once; today every field is covered across several passing tests, but not simultaneously.
- Consider a DB-level guarantee for "reservations exist only for recitations" (for example `Reserva.recitacionId NOT NULL` or a `CHECK`), since the current invariant is enforced by the API only and the column is nullable by design.
- `tasks.md` contains 30 tasks (including `1.3b`), not the 29 predicted in the launch brief; consider normalizing the count in the planning note if that total is referenced elsewhere.
- Migration C could be split (extension + constraint) or paired with an automated preflight probe so a Neon database without `btree_gist` does not fail the whole migration run despite the documented fallback.

### Verdict
PASS
All 30 tasks are complete, the build and Prisma schema validate, all 82 tests pass at runtime, all 20 requirements and 40 scenarios have passing covering tests, and no design deviation breaks a spec. Only non-blocking coverage/documentation suggestions remain.

### Evidence Notes
- Commands executed from the repository root: `npm run build` (exit `0`), `npm test` (exit `0`), `npx prisma validate` (exit `0`).
- Test output hash was computed over the exact captured `npm test` stdout/stderr stream; build output hash over the exact captured `npm run build` stream.
- No tracked files were modified. No migration was applied to a database by this verification; the test harness used its existing isolated `test_` schema.
- Requirement and scenario totals were counted directly from the eight delta `spec.md` files (`^### Requirement:` and `^#### Scenario:`), not from the launch brief.
