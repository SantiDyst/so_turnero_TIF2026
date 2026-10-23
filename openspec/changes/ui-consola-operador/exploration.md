## Exploration: Operator Console UI (ui-consola-operador)

### Current State

The backend is complete for the RF-01..RF-16 circuit and deployed at `https://so-turnero.vercel.app` (project `santi-a13a/so-turnero`, verified live). There is no frontend, no auth, and no roles by design.

**Hosting and entry points (verified).**

- `/health` returns `200` in production; `GET /queue` returns live data (`AT-0001`, `En espera`); `GET /` and `/index.html` return `404`. The rewrite `"/(.*)" → "/api"` (`vercel.json:3`) routes every non-file path into the single function `api/index.ts`.
- `api/index.ts:12-17` builds its own Nest app with `ExpressAdapter` and `app.init()`. `src/app.factory.ts:6-8` is a second, independent factory used by `main.ts` and the e2e tests. Any global middleware must be added in both.
- There is **no CORS configuration**: `rg "enableCors|cors|Access-Control"` over `src/`, `api/`, `test/`, `docs/`, `vercel.json` returns zero matches. Verified live: `GET /health` has no `Access-Control-Allow-Origin`, and `OPTIONS /queue` with an `Origin` header returns `404` with no CORS headers. A browser client on another origin cannot call this API today, including every `PATCH`/`PUT`/JSON `POST` that requires a preflight.
- Static hosting: the project uses the Vercel "Other" preset, so the output directory is `public/` when it exists (Vercel build docs, confirmed by commit `d8d65c0` "provide static output directory"). Vercel applies the filesystem **before** rewrites, so real files under `public/` are served directly and never hit `/api`. Any path with no matching file falls through to Nest.
- `public/` currently holds only `.gitkeep`.
- Local `npm run start:dev` does **not** serve `public/`: no `ServeStaticModule`, `useStaticAssets`, or `express.static` exists in `src/`.

**Endpoint inventory (read from `src/**/*.controller.ts` and services).**

| Method and path | Request body | Success response |
|---|---|---|
| `POST /applicants` | `{nombre, apellido, dni}` | `201` `{applicant{id,nombre,apellido,dni}, journey{id,attentionNumber,state}}` |
| `GET /queue` | — | `200` `[{applicantId, attentionNumber, journeyState, queuedAt}]` (no `journeyId`) |
| `GET /journeys` | query: exactly one of `applicantId` \| `attentionNumber` | `200` full read model (`queue-query.service.ts:106-199`); `400` both/neither, `404` unknown |
| `POST /journeys/:id/attentions` | `{specialty, professionalId}` | `201` `{attentionId, evaluationId, state, startedAt}` |
| `PATCH /attentions/:id/finalize` | `{state: "Finalizada" \| "Pendiente"}` | `200` `{id, state, endedAt, journeyState, professionalAvailability}` |
| `PATCH /evaluations/:id/result` | `{resultado: "APTO_PLENO"\|"APTO_CONDICIONAL"\|"NO_APTO"}` | `200` `{id, specialty, state, result, completedAt}` |
| `PATCH /evaluations/:id/complete` | — | `200` same shape |
| `GET /journeys/:id/closure-readiness` | — | `200` `{journeyId,state,allEvaluationsComplete,clinicalResultPresent,psychologicalResultPresent,aptitudeStored,canClose}` |
| `POST /journeys/:id/close` | — | `200` `{journeyId, attentionNumber, state, aptitude}` |
| `POST /journeys/:id/certificate` | `{}` or `{professionalId?}` | `201` first issue, `200` repeat, `CertificateView` |
| `GET /journeys/:id/certificate` | — | `200` `CertificateView`, `404` before issue |
| `PUT /attentions/:id/report` | `{observations, state?: "Pendiente"\|"Completo", professionalId?}` | `200` (out of happy path) |
| `GET /health` | — | `200` `{status:"ok"}` |

Read-model keys: `applicant`, `journey{id,attentionNumber,state,derivedState}`, `attentions[]`, `evaluations[]`, `pendings[]`, `recitations[]`, `reservations[]`, `derivations[]`, `aptitude|null`, `reports[3]`, `certificate|null` (`queue-query.service.ts:87-199`).

**Verified answers to the exploration questions.**

1. **CORS.** Disabled, in code and in production. Same-origin hosting is required unless the change adds `enableCors` to both `src/app.factory.ts` and `api/index.ts`.
2. **Seeded professionals.** `scripts/seed-professionals.ts:7-11` seeds exactly three, one per specialty: `Dra. Bioquimica Demo` (`BIOQUIMICA`), `Dr. Clinica Medica Demo` (`CLINICA_MEDICA`), `Lic. Psicologia Demo` (`PSICOLOGIA`). IDs are generated UUIDs, so they cannot be hardcoded. Availability starts `Disponible` (`prisma/schema.prisma:121`), becomes `Ocupado` on attention start and returns to `Disponible` on finalize (`attention-command.service.ts:148,181`). A start requires the professional specialty to match the attention specialty (`attention-command.service.ts:94-96`), so with the current seed the specialty fully determines the professional.
3. **Professional list gap.** `ProfessionalsModule` exposes a service only (`src/professionals/professionals.module.ts:5-9`); there is **no** `GET /professionals` and no other route that lists professionals. `GET /journeys` shows only professionals already attached to this journey's attentions, and `GET /queue` shows none. Choosing a professional for the first attention is therefore impossible through the current API. This is the only hard blocker in the happy path.
4. **Statelessness and ids.** The UI must keep `journeyId` for every `/journeys/:id/*` command, `attentionId` for finalize/report, `evaluationId` for result/complete, and `professionalId` for start. `POST /applicants` returns `journey.id` and `attentionNumber` but **not** the three evaluation ids (`registration.service.ts:38-51`), so one `GET /journeys?applicantId=` is required right after registration. `GET /journeys` cannot be called by journey id, so the UI should persist `attentionNumber` (URL hash) and resolve `journeyId` from the read model. `POST .../attentions` returns `attentionId` while `PATCH .../finalize` returns `id` — the same key under two names.
5. **Happy-path screens and choices.** Intake/queue, journey console with three fixed specialty cards, closure panel, certificate panel. The operator "chooses" a professional only in form; the seed makes it a single-option select per specialty.
6. **Naive-UI traps.** Mixed vocabulary (Spanish for journey/attention/report/professional availability, enum codes for evaluation state, specialty, and result); 409s for busy professional, active attention, already-complete evaluation, closed journey, open pendings, missing result; certificate repeats return `200` instead of `201`; Bioquímica rejects a result with `400` and completes without one; `CLINICA_MEDICA`/`PSICOLOGIA` completion fails `409` without a stored result; applicant `400` body is `{message, missingFields}` while other errors are `{statusCode, message, error}`. The API does not enforce the procedural order (a result can be set and an evaluation completed with no attention ever started), so sequencing lives entirely in the UI.

#### Findings that shape the decision

- The API is already a complete single-applicant read model: one `GET /journeys?attentionNumber=` returns attentions, evaluations, pendings, reports, aptitude, and certificate. A thin console can derive nearly all state from that one call.
- The deployed rewrite means static files work today but client-side path routing does not: any non-file path (`/journey/AT-0001`) becomes a Nest 404. Hash routing (`#/j/AT-0001`) avoids this.
- Local development is the weak spot of static hosting: `start:dev` serves only the API, and `file://` plus a separate static server both hit the missing CORS.

### Affected Areas

- `public/` — new `index.html`, `app.css`, and vanilla ES modules (api client, view rendering, state mapping); the only runtime UI artifact, served by Vercel with no build.
- `src/professionals/` — new read-only `GET /professionals` controller; the module is already imported in `src/app.module.ts:28`.
- `src/app.factory.ts` — optional `useStaticAssets` so `npm run start:dev` serves `public/` on the same origin; `api/index.ts` stays untouched (Vercel serves files itself).
- `test/` — e2e/unit coverage for the professionals read endpoint; the UI itself is covered by a documented manual walkthrough.
- `docs/first-functional-run.md` — add an operator-console walkthrough and drop the "frontend excluded" line (142).
- `README.md` — replace the "no application code / UI later" status (12, 19).
- `openspec/config.yaml` — context line 6 still says "no frontend in this stage".
- `vercel.json` — **not** modified by the recommended approach.

### Approaches

1. **Static UI in `public/` of the same Vercel project (vanilla HTML/CSS/ES modules)**
   - Description: one `index.html` plus ES modules under `public/`; same origin as the API, so no CORS and no extra deployment. Add `GET /professionals` and local static serving.
   - Pros: zero new dependencies and no build step, so the existing `nest build` and output directory stay valid; rewrites already prefer filesystem, so no `vercel.json` change; same origin removes CORS and preflight entirely; deploys with the API atomically; smallest diff for a demo console.
   - Cons: no type checking or component model; no existing Jest setup for `.js` UI modules (tests are `.ts` and ts-jest only); local dev needs `useStaticAssets` or `vercel dev`; manual DOM code can drift as screens grow.
   - Effort: Low-Medium.

2. **Vite + React SPA built into the same Vercel project**
   - Description: separate `ui/` with Vite + React + TypeScript, built to a static directory served by the same project.
   - Pros: TS consistency with the repo, component/state ergonomics, HMR, testable pure logic.
   - Cons: Vite defaults to `dist/`, which collides with `nest build` output and is gitignored; requires `buildCommand: "nest build && vite build"`, an `outputDirectory` override, and new devDependencies; the Vercel framework preset shifts away from "Other" and the output-directory assumption has to be re-pinned; a build can fail for reasons unrelated to the API.
   - Effort: Medium-High.

3. **Separate frontend project/domain calling the API cross-origin**
   - Description: standalone deployment (any framework) pointed at `https://so-turnero.vercel.app`.
   - Pros: independent deploys and ownership; the API stays untouched by presentation concerns; can be built later without rewriting the console.
   - Cons: requires `enableCors` in **both** `src/app.factory.ts` and `api/index.ts`; preflight now matters for every `PATCH`/`PUT`; two URLs and two deploy pipelines; an extra failure domain for a single-operator MVP; the current production API would reject browsers until redeployed.
   - Effort: Medium.

4. **Next.js in the same project**
   - Description: adopt Next.js as the framework and move the console to App Router pages.
   - Pros: strong DX and routing; Vercel-native.
   - Cons: conflicts with the current "Other" preset, `api/index.ts` function, and `public/` output assumption; forces a rewrite of the deployment model and a large dependency footprint for four screens with no auth or server rendering needs.
   - Effort: High.

### Recommendation

Adopt **Approach 1**: a single-document static console in `public/`, same origin, no build, plus one small API read endpoint.

- **Deployment:** files in `public/`, served before the rewrite. No `vercel.json` change, no CORS, one deployment. Use hash routing (`#/` and `#/j/<attentionNumber>`) so refresh keeps context and no path collides with the `/api` rewrite. Do not name UI files like API routes (`queue`, `journeys`).
- **Framework:** plain HTML + CSS + ES modules. The console is four screens and one read model; a bundler would add build risk without removing real complexity. Keep state mapping in a pure module so it can be unit-tested if Jest is later extended to `.js`.
- **Blocking API gap:** add `GET /professionals` returning `[{id, name, specialty, availability}]` ordered by specialty then name, reusing `toProfessionalAvailability` (`state-vocabulary.ts:138-142`). Read-only, no auth, no mutation. Fallback if the proposal rejects new endpoints: a manual "professional id" input, which is unacceptable for a demo.
- **Local dev parity:** add `useStaticAssets` in `src/app.factory.ts` so `npm run start:dev` serves `public/` on the same origin. This is the cheapest way to avoid CORS locally and keeps `api/index.ts` production-only.
- **State model:** treat `GET /journeys?attentionNumber=...` as the single source of truth and re-fetch after every mutation. Keep only `attentionNumber` in the URL hash. Read `journeyId`, `attentions[].id`, `evaluations[].id`, and states from that response; read `professionalId` from `GET /professionals`.
- **Screens (happy path only):**
  1. Intake and queue — register (`nombre`, `apellido`, `dni`) and list `GET /queue`; open a journey by `attentionNumber`.
  2. Journey console — applicant header (`nombre`, `apellido`, `AT-*`, journey `state`, `derivedState`), three fixed specialty cards in `BIOQUIMICA, CLINICA_MEDICA, PSICOLOGIA` order. Each card: evaluation `state`/`result`, attention `state`, `Iniciar` (hidden when evaluation is `COMPLETA`), `Finalizar` when attention is `En atención`, result select for `CLINICA_MEDICA`/`PSICOLOGIA` only, and `Completar`.
  3. Closure panel — show the four readiness booleans, enable `Cerrar` only when `canClose`, then show the stored aptitude.
  4. Certificate panel — `Emitir certificado`, render `identifier`, `finalAptitude`, `issuedAt`, `responsibleProfessional`; treat `201` and `200` as success and always show the returned body.
- **Out of scope:** reports, pendings, recitations, reservations, derivations, auth, roles, recalculation, PDF generation.
- **Error handling:** centralize a parser that accepts both `{statusCode, message}` and `{message, missingFields}`, renders `message` (string or array) and the status, and re-fetches the journey on `409` so the operator sees the real state. Keep `409` messages verbatim (English API text) and let the UI label the action in Spanish.
- **Vocabulary:** keep one mapping module. Compare `evaluation.state` against `PENDIENTE`/`COMPLETA`; compare and send Spanish strings (`En atención`, `Finalizada`, `Cierre final`, `Pendiente`/`Completo`); send enum codes for `specialty` and `resultado`. Never reuse `Pendiente` from attention state for report state.
- **Delivery slices (planning only in this change):**
  1. `GET /professionals` + tests (~120 lines).
  2. Static shell, API client, vocabulary mapping, intake/queue view (~250).
  3. Journey console with attentions, results, completion (~300).
  4. Closure, certificate, local static serving, docs (~200).

### Risks

- **Blocked without `GET /professionals`.** No route exposes professional ids, and seed ids are random UUIDs. Without the endpoint the happy path cannot start a single attention.
- **Public unauthenticated console.** Same-origin hosting exposes the whole console and fictitious applicant data to anyone with the URL, and allows writes. Acceptable for the MVP but must be stated explicitly in the proposal and demo notes.
- **Rewrite swallows client routes.** Any non-file path returns a Nest 404 (verified: `/` and `/index.html` return `404` today). Path-based routing or deep links will fail; hash routing is mandatory. Naming a file `public/queue.html` would shadow nothing, but a file named `public/queue` would.
- **Mixed vocabulary.** Journey/attention/report/availability are Spanish strings while evaluation state, specialty, and result are enum codes. Naive string comparisons will silently fail (for example treating `"PENDIENTE"` and `"Pendiente"` as equal or not).
- **Sequence not enforced by the API.** Results and completions succeed with no attention ever started, and Bioquímica must never receive a result (`400`). The UI is the only guard; a naive form can produce a technically valid but nonsensical journey.
- **Idempotency and status codes.** Certificate repeats return `200` with the stored snapshot, first issue `201`; a UI that asserts `201` will report a false failure. `POST /close` is `200`, not `201`. Start returns `attentionId`, finalize returns `id`.
- **Inconsistent error bodies.** `POST /applicants` returns `{message, missingFields}` with no `statusCode`, while other failures return Nest's `{statusCode, message, error}` (verified in `applicants.controller.ts:22-27`).
- **Stuck professional with no recovery path.** A forgotten active attention leaves a professional `Ocupado`; `GET /queue` lists only `En espera` journeys, so the UI cannot locate the journey holding it. With one professional per specialty, that blocks the whole circuit until someone knows the applicant or fixes the row.
- **Local dev friction.** `start:dev` does not serve `public/`, and a second static server would be cross-origin and therefore blocked. Without `useStaticAssets` (or `vercel dev`), UI work can only be validated against the deployment.
- **`dist` collision if a bundler is added later.** `nest build` and Vite both target `dist/`, which is gitignored, so a Vite choice must also change the build command and output directory.
- **Docs drift.** `README.md:19`, `openspec/config.yaml:6`, and `docs/first-functional-run.md:142` still state that no frontend exists.

### Ready for Proposal

**Yes.** The proposal should record: same-project static console in `public/` with hash routing and no CORS; one new read endpoint `GET /professionals`; `useStaticAssets` for local parity; the single-read-model pattern with `attentionNumber` as the only persisted context; and the four screens above with reports/agenda out of scope. Decisions to confirm with the user: (1) `GET /professionals` is acceptable versus a manual id input; (2) plain HTML/ES modules versus a Vite+React build; (3) whether the certificate needs a print-ready view; (4) whether the console should also expose reports (`PUT /attentions/:id/report`) for the RF-15 demo. Implementation is a separate change; this one produces planning artifacts only.
