# Tasks: Operator Console UI

## Review Workload Forecast

Estimated changed lines: ~1,050–1,550 (15 new, 11 modified). Delivery strategy: `ask-on-risk`.

```text
Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High
```

### Suggested Work Units

| Unit | Goal | Focused test command | Runtime harness | Rollback boundary |
|------|------|----------------------|-----------------|-------------------|
| 1 | Professionals read plus tests | `npm run test:integration` | `start:dev`; `/professionals` ordered | Controller, query service, module registration |
| 2 | Shell and plumbing | `npm run build` | `start:dev`; `GET /` 200 html, `/js/main.js` 200 | Shell files, `public/js/*`, factory |
| 3 | Four views | `npm run build` | Walkthrough (7.4) | `public/js/views/*` |
| 4 | Docs, walkthrough | `npm test` | `npm test`, build, smoke | Docs/config |

## Phase 1: Professionals prerequisite

- [ ] 1.1 Create `src/professionals/professional-query.service.ts`: inject `PrismaService`; `list()` returns `{id,name,specialty,availability}` ordered specialty then name via `toProfessionalAvailability`. Leave `professionals.service.ts` untouched.
- [ ] 1.2 Create `src/professionals/professionals.controller.ts` with `@Get('professionals')`; register controller and query provider in `professionals.module.ts`.
- [ ] 1.3 Verify `npm run test:integration` still compiles untouched (no existing spec constructs the new service).

## Phase 2: Shell, plumbing

- [ ] 2.1 `public/index.html`, `public/styles.css`: shell, route containers, banner, entry.
- [ ] 2.2 `public/js/dom.js`: `textContent` helpers only.
- [ ] 2.3 `public/js/api-client.js`: reads `/queue`, `/journeys?attentionNumber=`, `/professionals`, `/closure-readiness`; mutations; normalize `{statusCode,message,missingFields}`; verbatim messages; `409` re-fetch.
- [ ] 2.4 `public/js/state-map.js`: cards, `COMPLETA`/active-attention gates, result eligibility, completion gate, report editability, vocabulary.
- [ ] 2.5 `public/js/router.js`, `public/js/main.js`: `#/`, `#/j/<attentionNumber>`, refresh wiring.
- [ ] 2.6 `src/app.factory.ts`: `NestExpressApplication`; `useStaticAssets(join(process.cwd(),'public'))` before `init()`.

## Phase 3: Intake and queue

- [ ] 3.1 `public/js/views/intake.js`: three-field form, all `missingFields`, queue by number/state, open `#/j/<n>`.

## Phase 4: Journey cards

- [ ] 4.1 `public/js/views/journey.js`: header, derived state, ordered cards; start uses `journey.id` + `professionalId`; hidden on `COMPLETA`/active attention.
- [ ] 4.2 `journey.js`: finalize `Finalizada|Pendiente`; results only CLINICA_MEDICA/PSICOLOGIA; complete `PENDIENTE` + result + no pendings.

## Phase 5: Reports

- [ ] 5.1 `public/js/views/reports.js`: three reports; editable with an attention (`PUT /attentions/:id/report`), else read-only; `Completo` needs text; `409` re-fetch.

## Phase 6: Closure and certificate

- [ ] 6.1 `public/js/views/closure.js`: readiness flags; closure only on `canClose`; stored aptitude.
- [ ] 6.2 `closure.js`: issue via `journey.id`; identifier, aptitude, date, professional for `201`/`200`.

## Phase 7: Tests

- [ ] 7.1 `test/unit/professionals.spec.ts`: projection, controller delegation; `npm run test:unit`.
- [ ] 7.2 `test/integration/professionals.spec.ts`: "List the seeded professionals", "Order by name within a specialty", "Report current availability", "Read without side effects"; `npm run test:integration`.
- [ ] 7.3 `test/e2e/professionals.e2e-spec.ts`: `200` array, order, `Ocupado` after start; `npm run test:e2e`.
- [ ] 7.4 Walkthrough ("Register and open", "Render a fresh journey", "Complete a cycle", "Save report observations", "Close and issue", "Repeat issuance", "Restore deep link", "Recover from conflict"): register → `En espera` → open → start/finalize three cards → record results → complete → save reports → close → issue → refresh. Then `npm run build`; smoke: `GET /` 200 text/html, `GET /js/main.js` 200, `GET /health`, `GET /queue`, `GET /professionals`.

## Phase 8: Documentation

- [ ] 8.1 `docs/first-functional-run.md`: walkthrough, hash restore, `409`, read-only reports.
- [ ] 8.2 `README.md` status; `openspec/config.yaml` frontend context.
