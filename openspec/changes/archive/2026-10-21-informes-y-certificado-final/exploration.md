## Exploration: Specialty Reports (RF-15) and Final Certificate (RF-16)

### Current State

The circuit is implemented end to end through RF-14 and archived as `circuito-completo-postulante`:

- Aggregates (`prisma/schema.prisma`): `Postulante` (53-62), `Recorrido` (64-78) with `numeroAtencion @unique` and `RecorridoEstado {En espera|En proceso|Cierre final}` (9-13), `Atencion` (80-108) with `especialidad`, `profesionalId`, `evaluacionId`, `recitacionId`, `estado`, timestamps, `Profesional` (110-119), `Evaluacion` (121-136) with `@@unique([recorridoId, especialidad])` (135) and `EvaluacionEstado {PENDIENTE|COMPLETA}` (34-37), `Pendiente` (138-153), `Recitacion` (155-175), `Reserva` (177-196), `Derivacion` (198-210), `ResultadoAptitud` (212-222) with `recorridoId @unique` and a `ResultadoEspecialidad` snapshot.
- Evaluations are created eagerly at registration (`src/applicants/registration.service.ts:29-35`), one per specialty, in `SUPPORTED_SPECIALTIES` order (`src/shared/state-vocabulary.ts:53-57`).
- Completion gate: `EvaluationsService.complete` rejects open pendings and, for `CLINICA_MEDICA`/`PSICOLOGIA`, a missing result; then stores aptitude (`src/evaluations/evaluations.service.ts:144-177`). Writes after closure are rejected through `assertJourneyOpen` (196-211).
- Aptitude: stored automatically inside the third completion transaction (`src/aptitude/aptitude.service.ts:90-131`), matrix at 54-72. Closure is explicit and re-checks the full gate (`close`, 164-221; `buildReadiness`, 223-256).
- Read model: `GET /journeys` returns applicant, journey, attentions, evaluations, pendings, recitations, reservations, derivations, aptitude (`src/journeys/queue-query.service.ts:87-169`). `GET /queue` returns only `En espera` (19-37).
- HTTP conventions: no DTO classes; inline request interfaces plus manual validation in the controller (`src/attentions/attentions.controller.ts:20-70`, `src/evaluations/evaluations.controller.ts:19-85`). Commands use `POST`/`PATCH`, explicit `@HttpCode`, transport key names in English while domain values stay Spanish/enum-coded.
- Tests: 12 spec files across `test/unit`, `test/integration`, `test/e2e`; each integration/e2e run creates a `test_` schema and applies `prisma migrate deploy` (`test/support/global-setup.ts:24-48`). Integration tests instantiate services directly with `PrismaService` (`test/integration/aptitude.spec.ts:18-25`).

**No report or certificate concept exists today.** Verified by content search across `src/`, `prisma/`, `test/`, `scripts/`: zero matches for `informe`, `certificad`, `report` (except Jest's "reports" assertion wording), `certificate`. There is no model, enum, column, route, service, fixture, or spec requirement for either. `Atencion` has no free-text field, so today there is nowhere to store observations.

The only traces are exclusions and one forward-looking scenario:

- `docs/first-functional-run.md:101-103` excludes RF-15/RF-16.
- Scope lines in `openspec/specs/{final-aptitude,specialty-evaluations,professional-attention,attention-queue-query,protected-agenda,pendings-recitations,specialty-derivation}/spec.md` (e.g. `final-aptitude` 46) exclude both requirements.
- `openspec/specs/specialty-evaluations/spec.md:41-45` already states "A saved report does not complete an evaluation". The vocabulary is anticipated; the behavior is not implemented.

Source facts that constrain the design (extracted from `docs/requisitos/Require&Spec-U_Case-U_History/SO TURNERO - Requisitos y especificaciones.docx`):

- Report entity: attention associated, responsible professional, free-text observations with the same shape for all three specialties, update date, state `Pendiente | Completo`, and specialty result for Clínica Médica and Psicología only. Bioquímica keeps a report but does not feed the matrix.
- Report minimum content: applicant internal ID, nombre, apellido; attention number; origin area Admisión; responsible area/professional; short observation (no real clinical data); final result once all three evaluations are complete; report state.
- Certificate entity: identifier, associated journey, associated final result, issue date, clinical professional responsible for issuing it. No digital signature, no automatic delivery. Section 2.4 requires persistence to retain reports, aptitude, and certificate after reload.
- Acceptance data: `AT-1042`, three reports, `Martín Díaz`, `Apto condicional`, `CERT-AT-1042`.

Repository hygiene: the working tree is **not** clean. `package.json` has an uncommitted `seed:professionals` script and `scripts/seed-professionals.ts` is untracked; the seed covers Bioquímica and Psicología only. These must not be mixed into this change's commits.

### Affected Areas

- `prisma/schema.prisma` — new `Informe` (or equivalent) and `Certificado` models, relations, and a report-state enum; no change to existing models is strictly required.
- `prisma/migrations/2026..._circuit_d/migration.sql` — additive migration following the `20261019000000_circuit_*` naming style.
- `src/reports/` (new) — report service, controller, module; upsert + three-specialty read composition.
- `src/certificates/` or `src/aptitude/` (new or extended) — certificate issuance/read; the latter reuses closure/aptitude vocabulary but mixes two capabilities.
- `src/journeys/queue-query.service.ts` — add `reports` and `certificate` to the read model (87-169).
- `src/shared/state-vocabulary.ts` — report state mapping (`Pendiente | Completo`), optionally certificate helpers.
- `src/app.module.ts` — module wiring.
- `openspec/specs/attention-queue-query/spec.md` — MODIFIED read-model and vocabulary requirements (45-94).
- `openspec/specs/{final-aptitude,specialty-evaluations,professional-attention,protected-agenda,pendings-recitations,specialty-derivation}/spec.md` — stale "RF-15/RF-16 excluded" scope lines to update during archive.
- `test/unit`, `test/integration`, `test/e2e` — new report/certificate coverage; existing tests need no behavior rollback.
- `docs/first-functional-run.md` — replace the exclusion with the RF-15/RF-16 walkthrough.
- `README.md` — stale "no application code yet" status; optional hygiene fix.

### Question Answers

1. **Any existing report/certificate concept?** No. Confirmed by grep, schema, migrations, routes, and specs. Only prose exclusions and the anticipatory scenario in `specialty-evaluations`.
2. **Derived-on-read vs persisted aggregate?** Derived-only is insufficient: observations are authored free text with no home in the current schema, and the source requires persistence of reports and certificate across reloads (section 2.4). Persisted `Informe` is required. Ownership: the report belongs to `Evaluacion`, not `Atencion`, because recitations create additional attentions for the same specialty while the source acceptance expects exactly three reports and NFR-03 requires one report per applicant/number relationship. Use `evaluacionId @unique` as the identity, and keep the writing attention as optional provenance.
3. **Minimal HTTP surface:** see Recommendation. One upsert per attention plus one three-row read per journey, and certificate issue/read on the journey.
4. **RF-16 invariant:** only when `Recorrido.estado = CIERRE_FINAL` **and** a stored `ResultadoAptitud` exists; otherwise `409`. `CERT-<numeroAtencion>` (e.g. `CERT-AT-1042`) is deterministic, unique, and issuance is idempotent.
5. **Does RF-15 change invariants?** No. Saving a report must not complete an evaluation, resolve a pending, change attention state, or affect the closure gate. RF-13/RF-14 stay decoupled, and `specialty-evaluations:41-45` remains true. Writes after `CIERRE_FINAL` should be rejected (consistent with `assertJourneyOpen`); reads stay allowed.
6. **What breaks?** No existing test asserts the absence of these fields. `GET /journeys` comparisons are `objectContaining`-based or compare two equivalent responses (`test/e2e/journey.e2e-spec.ts:60-83`), so additive keys are safe. Required work is additive specs (`specialty-reports`, `final-certificate`), one MODIFIED delta in `attention-queue-query`, plus stale scope-line cleanup.
7. **Sizing:** roughly 1,000–1,250 changed lines including tests and docs. Recommend 3 stacked slices; single PR is not viable under the 400-line budget.
8. **Open decisions:** see the end of Recommendation.

### Approaches

1. **Derived-only views (no persistence)**
   - Description: compose reports and certificate entirely from `Recorrido`/`Evaluacion`/`ResultadoAptitud` at read time.
   - Pros: zero schema/migration risk; smallest code delta; no new invariants.
   - Cons: cannot store observations, per-report state, responsible professional, or issue date; violates the source persistence requirement (2.4); certificate identifier would be computed, never recorded, so "generar" is indistinguishable from "leer"; RF-15 acceptance ("generar y consultar") cannot be asserted.
   - Effort: Low.

2. **Persisted `Informe` + `Certificado`, anchored on evaluation and journey (recommended)**
   - Description: new `Informe` row per evaluation (`evaluacionId @unique`) with observations, state, responsible professional, and writing attention as provenance; new `Certificado` row per journey (`recorridoId @unique`) with deterministic identifier and aptitude snapshot.
   - Pros: matches the source entity model and vocabulary; persists what the requirements say must survive reload; keeps evaluation/result/closure invariants untouched; additive migration; read responses can compose applicant, number, area, and final result without duplicating them; testable per invariant.
   - Cons: two new aggregates, two new migration tables, extra controllers/modules, more surface for validation and tests.
   - Effort: Medium.

3. **Extend existing rows (columns on `Evaluacion` and `Recorrido`)**
   - Description: add `observaciones`/`informeEstado`/`informeProfesionalId` to `Evaluacion`, and certificate columns to `Recorrido`.
   - Pros: no new tables or joins; smallest persistence delta; one migration.
   - Cons: conflates evaluation progress with report content, contradicting the source entity split and the existing decoupling intent; widens a table guarded by strict completion invariants and adds write contention to the gate row; certificate becomes a nullable column cluster on the journey; weaker auditability; harder to add a distinct report professional/date without polluting evaluation semantics.
   - Effort: Low-Medium.

4. **Persisted report + certificate issued automatically inside `close`**
   - Description: same as 2, but the certificate row is created in the existing closure transaction instead of an explicit endpoint.
   - Pros: impossible to have a closed journey without a certificate; mirrors the "aptitude stored on third completion" pattern; one fewer route.
   - Cons: couples RF-16 to a heavily tested transaction and changes the `POST /journeys/:id/close` contract; no explicit "generate" action for the RF-16 verification step; retries and backfill need their own idempotency care; the responsible professional may be unresolvable inside closure.
   - Effort: Medium.

### Recommendation

Adopt **Approach 2** with explicit certificate issuance.

**Data model (additive):**

```
enum InformeEstado { PENDIENTE, COMPLETO }

model Informe {
  id            String        @id @default(uuid())
  evaluacionId  String        @unique
  atencionId    String?       // attention that last wrote the report (provenance)
  profesionalId String?       // responsible professional
  observaciones String        @default("")
  estado        InformeEstado @default(PENDIENTE)
  completadoAt  DateTime?
  createdAt     DateTime      @default(now())
  updatedAt     DateTime      @updatedAt
  evaluacion    Evaluacion    @relation(...)
  atencion      Atencion?     @relation(...)
  profesional   Profesional?  @relation(...)
}

model Certificado {
  id            String                @id @default(uuid())
  recorridoId   String                @unique
  identificador String                @unique   // CERT-<numeroAtencion>
  aptitudFinal  ResultadoEspecialidad            // immutable snapshot
  profesionalId String?                          // clinical professional
  emitidoAt     DateTime              @default(now())
  createdAt     DateTime              @default(now())
  updatedAt     DateTime              @updatedAt
  recorrido     Recorrido             @relation(...)
  profesional   Profesional?          @relation(...)
}
```

Do not duplicate specialty results or the final aptitude on `Informe`: compose them from `Evaluacion.resultado` and `ResultadoAptitud` at read time. Snapshot only the certificate's final aptitude so the issued document is audit-stable.

**HTTP surface (reuses existing manual-validation style):**

- `PUT /attentions/:id/report` — upsert the report for that attention's evaluation. Body `{ "observations": string, "state"?: "Pendiente" | "Completo" }`. `200`. `400` invalid body, `404` unknown attention, `409` journey `Cierre final`. Creating `Completo` requires non-empty observations.
- `GET /journeys/:id/reports` — always three entries in `BIOQUIMICA, CLINICA_MEDICA, PSICOLOGIA` order; unwritten specialties appear as `reportState: "Pendiente"` with `reportId: null`, no invented data. `200`, `404` unknown journey.
- `GET /journeys` — add `reports[]` (same shape) and `certificate: {...} | null` to the existing read model.
- `POST /journeys/:id/certificate` — optional body `{ "professionalId"?: string }`. `201` on first issuance, `200` with the identical existing certificate on repeat. `409` when the journey is not `CIERRE_FINAL` or aptitude is missing. `404` unknown journey.
- `GET /journeys/:id/certificate` — optional if the read model already exposes it; `200` with the certificate, `404` before issuance.

**Response composition for a report:** applicant `{id, nombre, apellido}`, `attentionNumber`, `originArea: "Admisión"` (constant), responsible `{area: specialty, professional}` from `Informe.profesionalId`, `observations`, `specialtyResult` (null for Bioquímica), `finalAptitude` (null until `ResultadoAptitud` exists), `reportState`, `updatedAt`. Certificate response: `{identifier, attentionNumber, applicant, finalAptitude, issuedAt, responsibleProfessional}`; no signature, no delivery fields.

**Invariants to state in the spec:**

- Saving a report never changes evaluation state, attention state, pendings, or the closure gate.
- One report per journey and specialty; recitations update the same report.
- Report writes are rejected after `CIERRE_FINAL`; reads and the certificate remain available.
- Certificate requires `CIERRE_FINAL` plus stored aptitude; identifier is deterministic and unique; issuance is idempotent and never creates a second row.
- `CERT-AT-1042` and `Apto condicional` are produced by the documented fictitious circuit, not hardcoded.

**Spec deltas:** add `specialty-reports` and `final-certificate` capabilities; MODIFY `attention-queue-query` (read model at 73-94 and approved vocabulary at 45-61, adding `reportState`/certificate fields without colliding with attention `Pendiente`); update stale exclusion scope lines during archive.

**Delivery sizing:** total estimated 1,000–1,250 authored lines. Three stacked slices:

1. `Informe` schema + migration + report write/read endpoints + unit and integration tests (~350–450).
2. Journey read-model integration (`reports[]`, `certificate`), e2e coverage, `docs/first-functional-run.md` walkthrough (~200–300).
3. `Certificado` schema + migration + issuance/read endpoint + integration/e2e tests (~350–450).

If slice 1 crosses 400 lines, move its e2e tests to slice 2. Single PR is not recommended.

**Open decisions the proposal/design must resolve:**

1. Report state explicit (`Pendiente | Completo`) or derived from non-empty observations? Recommended explicit with `Completo ⇒ non-empty observations`.
2. Anchor the report on `Evaluacion` (recommended) or on `Atencion`? Anchoring on attention multiplies reports after recitations and breaks "three reports".
3. Certificate issued by explicit `POST` (recommended) or automatically inside `close`?
4. Responsible clinical professional: optional body `professionalId` (validated `CLINICA_MEDICA`) → latest `CLINICA_MEDICA` attention → nullable. Closing without a clinical attention is currently possible, so nullable avoids an unissuable closed journey.
5. Certificate payload: JSON only (recommended; PDF/plain text would add a dependency and is not required by RF-16).
6. Aptitude on certificate: immutable snapshot (recommended) or FK to `ResultadoAptitud`.
7. Repeated issuance: `200` idempotent with the existing row (recommended) or `409`.

### Risks

- **Scope and budget:** two aggregates, two migrations, three endpoints, read-model changes, and a test matrix land near 1,200 lines. A single PR breaks the 400-line review budget.
- **Vocabulary collision:** report state `Pendiente` and attention state `Pendiente` share a word. Response keys must disambiguate (`reportState` vs `state`) and must not reuse `toEvaluationState`.
- **Report/evaluation conflation:** if observations or report completion are written onto `Evaluacion`, the RF-13/RF-14 gate becomes report-dependent. Keep them separate and keep `specialty-evaluations:41-45` true.
- **Certificate dead end:** certification requires aptitude and closure, but nothing currently requires a Clínica Médica attention. Deriving the responsible professional strictly would make some closed journeys unable to issue a certificate.
- **Idempotency and uniqueness:** concurrent certificate requests must not create two identifiers. Rely on `recorridoId @unique` / `identificador @unique` and map `P2002` to a re-read, not a raw 500.
- **Recitation multiplicity:** a report keyed on attention would create duplicates after recitations; unique on `evaluacionId` is the guard.
- **Migration/test harness:** every test project runs `migrate deploy` per `test_` schema; a malformed migration fails all integration and e2e projects at once.
- **Dirty working tree:** `package.json` and `scripts/seed-professionals.ts` are uncommitted; the seed lacks a Clínica Médica professional, which matters for the certificate demo.
- **Docs drift:** `README.md` still claims there is no application code, and seven specs still say RF-15/RF-16 are excluded.

### Ready for Proposal

**Yes.** The proposal should record persisted `Informe`/`Certificado` as the chosen approach, the evaluation anchor for reports, the explicit idempotent certificate endpoint, the decoupling invariant (reports never gate closure), and the three-slice delivery plan. It must ask the user to confirm the seven open decisions, especially explicit vs derived report state, certificate professional resolution, and JSON-only output. A single-PR delivery is not viable.
