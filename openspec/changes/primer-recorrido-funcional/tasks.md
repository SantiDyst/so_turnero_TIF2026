# Tasks: First Functional Run

## Review Workload Forecast

Estimated changed lines: 700–1,000
Decision needed before apply: No — resolved: chained PRs approved
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High
Delivery strategy: ask-on-risk

Review budget policy: default 400 changed lines per PR. When a work unit naturally exceeds it, record a `size:exception` for that PR. NEVER drop, thin out, or defer in-scope functionality to fit the budget — split by work unit only, never by artificial line reduction.

Execution guardrails:
- Implement one work unit per PR; run each to completion once, with bounded retries. No open-ended loops.
- A subagent that cannot finish its work unit MUST stop and report the blocker; it MUST NOT silently shrink scope.
- Every PR MUST keep its tests/docs with the behavior it verifies and remain independently buildable and rollback-able.

Work units: PR 1 scaffold/data; PR 2 registration/query; PR 3 attention/tests/docs. Sequential, stacked on main; independently verifiable.

## Phase 1: Project Scaffolding

- [x] 1.1 Create NestJS/TypeScript structure, `src/app.module.ts`, scripts, tsconfig, lint, and format config; verify build.
- [x] 1.2 Add Prisma 7, `prisma.config.ts`, `.env.example` with pooled `DATABASE_URL`/direct `DIRECT_URL`, and cached `PrismaPg`; verify CLI uses only `DIRECT_URL`, runtime never does. Depends on 1.1.
- [x] 1.3 Add `api/index.ts` Vercel entry and health route; verify handler import. Depends on 1.1.

## Phase 2: Data Model and Migration

- [x] 2.1 Create `prisma/schema.prisma` models, relations, enums, timestamps, and unique keys; verify schema/client generation. Depends on 1.2.
- [x] 2.2 Create/review migration and `recorrido_attention_no_seq`, rendering `AT-` plus four digits; verify registrations get distinct numbers.
- [x] 2.3 Add exact partial index `atencion_one_active_per_applicant` on `Atencion(postulanteId)` where state is `En atención`; verify it enforces one active row.
- [x] 2.4 Add `src/prisma/*` and feature module shells; verify dependency injection starts. Depends on 2.1.

## Phase 3: Applicant Registration

- [x] 3.1 Add validation and `POST /applicants`; verify missing fields are all reported and no records are created. Depends on 2.4.
- [x] 3.2 Implement atomic sequence/applicant/journey/queue creation and rollback; verify `201`, `En espera`, and no active attention.
- [x] 3.3 Map responses and number conflicts; verify distinct persisted numbers. Depends on 3.2.

## Phase 4: Queue and Journey Queries

- [x] 4.1 Implement `GET /queue`; verify new entries are `En espera` and started journeys leave the queue. Depends on 3.2.
- [x] 4.2 Implement `GET /journeys` by exactly one applicant id or attention number; verify equivalent results and `400`/`404`.
- [x] 4.3 Centralize approved state vocabulary and nested mappings; verify journey, attention, and availability states remain distinct. Depends on 4.2.

## Phase 5: Professional Attention

- [ ] 5.1 Implement `POST /journeys/:id/attentions`: eligibility, transaction, row lock, updates, unique-error `409`; verify rejected starts roll back. Depends on 4.3.
- [ ] 5.2 Implement `PATCH /attentions/:id/finalize` for `Finalizada`/`Pendiente`; release professional and preserve `En proceso`. Verify non-active finalization changes nothing. Depends on 5.1.
- [ ] 5.3 Wire `ProfessionalsModule` availability contracts; verify `Ocupado` professionals cannot be reused. Depends on 5.1.

## Phase 6: Testing Setup and Tests

- [ ] 6.1 Add TypeScript runner and isolated test PostgreSQL; verify availability and update metadata; strict TDD initially false.
- [ ] 6.2 Add unit tests for validation, transitions, vocabulary, and error mapping; verify invalid transitions fail. Depends on 3.1, 5.1.
- [ ] 6.3 Add integration tests for migration, sequence/index, rollback, and release; verify database invariants. Depends on 2.3, 5.2.
- [ ] 6.4 Add HTTP E2E tests for all endpoints, restart persistence, and synchronized race; verify one `201`, one `409`, one active row. Depends on 4.2, 5.2.

## Phase 7: Manual Verification and Documentation

- [ ] 7.1 Add Postman/curl walkthrough and excluded-scope note; verify documented status codes/states. Depends on 6.4.
- [ ] 7.2 Document Neon/Vercel URLs, rollback, and restart check; verify history survives restart. Depends on 7.1.
