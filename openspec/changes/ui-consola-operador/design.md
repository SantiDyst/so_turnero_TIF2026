# Design: Operator Console UI

## Technical Approach

Static console in `public/` (HTML, CSS, ES modules), same-origin on Vercel and local Nest. A read-only `GET /professionals` unblocks starts. Every screen renders from `GET /journeys?attentionNumber=`, re-fetched after each mutation, plus `closure-readiness` for the gate. No build step, dependency, or schema change.

## Architecture Decisions

| Decision | Alternative (tradeoff) | Choice | Rationale |
|---|---|---|---|
| Console delivery | Bundler (build risk, `dist/` collision) vs files | Plain files, no build; `api-client.js`/`state-map.js` pure, `views/` render only | Four screens; Vercel already serves `public/` first; a framework migration replaces views only. |
| Professionals read | Inject Prisma into `ProfessionalsService` (forces constructor changes in 5 existing integration specs) vs a separate read service | New `ProfessionalQueryService` injected with `PrismaService`; `list()` returns `ProfessionalListItem[]` (bare array, `orderBy` specialty then name) | Matches the existing `queue-query.service.ts` read-service pattern, keeps the lock/transition service untouched, and avoids touching existing tests for a UI-verification change. |
| Local serving | Separate static server vs `useStaticAssets` | `useStaticAssets(join(process.cwd(),'public'))` in `app.factory.ts` | `cwd` holds under dev, Jest, and compiled runs. `api/index.ts` stays untouched (Vercel serves files; the bundle omits `public/`). |
| Handler typing | `INestApplication` vs `NestExpressApplication` | Typed Express generic | Required by `useStaticAssets`; adapter stays Express. Registered before `init()`, so files precede routes. |
| Rendering | `innerHTML` interpolation vs text nodes | `textContent` only; `innerHTML` forbidden for API data | Applicant and observation text is untrusted (XSS). |
| File naming | Free vs route-safe | No top-level name matching an API route (`queue`, `journeys`, ...) | Files precede the rewrite; `public/queue` would shadow `GET /queue`. |
| Readiness | Recompute client-side vs server read | Read `closure-readiness` in the refresh | Avoid duplicating the closure gate. |
| Reports | Hide when unattended vs read-only | Editable only when an attention exists; otherwise read-only with a "requires an attention" hint | `PUT /attentions/:id/report` needs an attention id; saving observations is in scope. |
| Routing | Path vs hash | `#/`, `#/j/<attentionNumber>` | Non-file paths hit the `/api` rewrite. |

## Data Flow

```
views/ ──▶ api-client.js ──▶ GET /queue | /journeys | /professionals
   │              └────────▶ mutations
   └──▶ state-map.js ◀── refresh: GET /journeys + closure-readiness
```

Mutations trigger the refresh. `409` renders the message verbatim, then refreshes; the banner persists.

## File Changes

| File | Action | Description |
|---|---|---|
| `src/professionals/professional-query.service.ts`, `professionals.controller.ts`, `professionals.module.ts` | Create/Modify | `GET /professionals` via a new read service; register controller/provider. `professionals.service.ts` untouched. |
| `src/app.factory.ts` | Modify | Typed Express app + `useStaticAssets`. |
| `public/index.html`, `public/styles.css` | Create | Shell, templates, layout. |
| `public/js/{api-client,state-map,router,dom,main}.js` | Create | Fetch/error contract; derivation; router; DOM helpers; entry. |
| `public/js/views/{intake,journey,reports,closure}.js` | Create | Intake/queue; cards; RF-15; readiness + certificate. |
| `test/{unit,integration,e2e}/professionals*` | Create | Mapper/controller, ordering/availability, HTTP. |
| `docs/first-functional-run.md`, `README.md`, `openspec/config.yaml` | Modify | Walkthrough, status, remove frontend-excluded context. |

## Interfaces / Contracts

`GET /professionals` → `200` `[{id, name, specialty, availability}]`; availability via `toProfessionalAvailability` (`Disponible|Ocupado`). Read-only, no input, no auth.

| Card input | Source | Rule |
|---|---|---|
| evaluation | `evaluations[]` by specialty | unique |
| attention | `attentions[]` by specialty, max `startedAt` | supplies `attentionId` |
| `COMPLETA` | `evaluation.state` | hides start |
| start | `journey.id` + `professionalId` | hidden if complete or active attention |
| finalize | active attention | `Finalizada|Pendiente` |
| result | `evaluation.id` | only `CLINICA_MEDICA`/`PSICOLOGIA` |
| complete | `evaluation.id` | `PENDIENTE`, required result stored, no open `pendings[]` |
| report | `reports[]` by specialty | editable when an attention exists |
| certificate | `certificate` | issue with `journey.id`; `201`/`200` equal |

Report body `{observations, state}`; `Completo` requires text. Errors: accept `{statusCode, message}` (string or array) and `{message, missingFields}`; render `message` unaltered, status as fallback. Only `attentionNumber` lives in the hash.

## Testing Strategy

| Layer | What | Approach |
|---|---|---|
| Unit | Projection, controller delegation | Direct calls, mocked service |
| Integration | Specialty/name order, availability, read-only | Isolated `test_` schema |
| E2E | `200` array, order, `Ocupado` after start | supertest via `createApp()` |
| Manual | Screens, hash restore, `409`, read-only reports | Walkthrough in `docs/first-functional-run.md` (no new Jest project) |

## Threat Matrix

| Boundary | Applicability | Reason |
|---|---|---|
| Docs-like paths | N/A | No execution. |
| Git repo selection | N/A | No git automation. |
| Commit state | N/A | No commits. |
| Push state | N/A | No push. |
| PR commands | N/A | No PR automation. |

Static precedence: see smoke check.

## Migration / Rollout

No `vercel.json` change: `public/` is the output directory, so real files resolve before `"/(.*)" → "/api"` and `/` starts serving `index.html` (today 404). Smoke: `GET /` `200 text/html`, `GET /js/main.js` `200`, `GET /health` and `GET /queue` still JSON, `GET /professionals` `200`. Rollback: delete `public/` and controller; revert service, factory, docs.

## Open Questions

None.
