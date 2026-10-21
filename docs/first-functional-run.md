# First Functional Run

This walkthrough uses fictitious data only. Set `API_URL` to the local Nest URL or the Vercel deployment URL, for example `https://<vercel-project>.vercel.app`.

```sh
export API_URL=http://localhost:3000
```

## Endpoint walkthrough

Register an applicant. A successful registration returns `201`, a generated identifier, an `AT-` number, and a journey in `En espera`.

```sh
curl -i -X POST "$API_URL/applicants" \
  -H 'content-type: application/json' \
  -d '{"nombre":"Ada","apellido":"Lovelace","dni":"12345678"}'
```

An incomplete body returns `400` with every missing field in `missingFields`; it does not persist a partial applicant or journey.

```sh
curl -i -X POST "$API_URL/applicants" -H 'content-type: application/json' -d '{}'
```

List the queue. It returns `200`; only `En espera` journeys are present.

```sh
curl -i "$API_URL/queue"
```

Find the same journey by exactly one identifier. Both requests return `200`; missing or both identifiers return `400`, and an unknown identifier returns `404`.

```sh
curl -i "$API_URL/journeys?applicantId=<applicant-id>"
curl -i "$API_URL/journeys?attentionNumber=AT-0001"
```

Start an attention using an existing available professional ID. It returns `201` with state `En atención`; a started journey becomes `En proceso` and the professional becomes `Ocupado`. A second active start for the applicant or a busy professional returns `409`.

```sh
curl -i -X POST "$API_URL/journeys/<journey-id>/attentions" \
  -H 'content-type: application/json' \
  -d '{"specialty":"CLINICA_MEDICA","professionalId":"<professional-id>"}'
```

Finalize an active attention. Only `Finalizada` and `Pendiente` are accepted (`200`); other values return `400`, and finalizing an inactive attention returns `409`. The journey remains `En proceso` and the professional returns to `Disponible`.

```sh
curl -i -X PATCH "$API_URL/attentions/<attention-id>/finalize" \
  -H 'content-type: application/json' \
  -d '{"state":"Finalizada"}'
```

Approved vocabulary is intentionally distinct: journey `En espera` / `En proceso` / `Cierre final`; attention `No iniciada` / `En espera` / `En atención` / `Finalizada` / `Pendiente`; report `Pendiente` / `Completo` under `reportState`; professional `Disponible` / `Ocupado`.

## Aptitude and final closure

The aptitude is calculated and stored automatically inside the transaction that completes the third evaluation. Nothing is stored after the first or second completion. The matrix only uses Clínica Médica and Psicología; Bioquímica never contributes a result:

| Clínica Médica | Psicología | Final aptitude |
|---|---|---|
| `NO_APTO` | any | `NO_APTO` |
| any | `NO_APTO` | `NO_APTO` |
| `APTO_CONDICIONAL` | `APTO_PLENO` / `APTO_CONDICIONAL` | `APTO_CONDICIONAL` |
| `APTO_PLENO` / `APTO_CONDICIONAL` | `APTO_CONDICIONAL` | `APTO_CONDICIONAL` |
| `APTO_PLENO` | `APTO_PLENO` | `APTO_PLENO` |

Meeting the gate does not close the journey. Read readiness first; `canClose` is `true` only when all three evaluations are `COMPLETA`, both specialty results exist, the aptitude is stored, and the journey is not already closed.

```sh
curl -i "$API_URL/journeys/<journey-id>/closure-readiness"
```

Close explicitly. The request locks the journey, re-checks the full gate, and returns `200` with state `Cierre final`; it returns `409` when any evaluation is not `COMPLETA`, a result is missing, the aptitude is not stored, or the journey is already closed.

```sh
curl -i -X POST "$API_URL/journeys/<journey-id>/close"
```

After `Cierre final`, further evaluation results/completions and attention starts return `409`. The journey remains queryable by identifier and `GET /journeys` exposes the stored aptitude plus `reports[]` and `certificate: null`; the waiting queue keeps only `En espera` journeys.

## Specialty reports (RF-15)

Every journey owns exactly one report per specialty. Save a report from an existing attention; recitations update the same row instead of creating another.

```sh
curl -i -X PUT "$API_URL/attentions/<attention-id>/report" \
  -H 'content-type: application/json' \
  -d '{"observations":"Lab values within range","state":"Completo"}'
```

`state` is `Pendiente` or `Completo`; `Completo` requires non-empty observations (`400`). An unknown attention returns `404`, and a journey in `Cierre final` returns `409`. Saving a report never completes an evaluation, resolves a pending, starts an attention, or changes closure readiness or aptitude. Writes are rejected after closure while reads stay available.

```sh
curl -i "$API_URL/journeys/<journey-id>/reports"
```

The read always returns three entries ordered `BIOQUIMICA`, `CLINICA_MEDICA`, `PSICOLOGIA`. Each entry includes the applicant, `attentionNumber`, `originArea: "Admisión"`, `responsible` (`area` plus `professional` or `null`), `observations`, `specialtyResult` (`null` for Bioquímica), `finalAptitude` (`null` until stored), `reportState`, and `updatedAt`. Unwritten specialties appear with `reportState: "Pendiente"` and null placeholders.

`GET /journeys?attentionNumber=AT-1042` also returns `reports[]` and `certificate` without removing or renaming any existing key. `reportState` stays separate from the attention `state` even when both read `Pendiente`; `certificate` is `null` until issuance.

## Agenda fallback

Migration C installs `btree_gist` and an exclusion constraint that rejects overlapping `RESERVADA` reservations for the same professional. The runtime does not depend on that constraint alone: every reservation create/reschedule and every recitation scheduling request locks the professional row and runs an overlap `SELECT` before writing (create/reschedule additionally take `pg_advisory_xact_lock(hashtext(profesionalId))`). If `CREATE EXTENSION btree_gist` is unavailable on a target database, skip only the constraint from migration C; the row lock plus overlap query still serializes conflicting requests and maps the loser to `409`.

## Deployment and persistence

Neon provides two environment variables, never literal connection strings in source: `DATABASE_URL` is the pooled (`-pooler`) runtime URL configured in Vercel, and `DIRECT_URL` is the direct Neon URL used only by Prisma CLI migrations. Apply migrations before deploying the API:

```sh
npx prisma migrate deploy
vercel --prod
```

The deployed API URL is the Vercel project URL shown by the deployment, conventionally `https://<vercel-project>.vercel.app`. Configure `DATABASE_URL` and `DIRECT_URL` in the Vercel/Neon secret settings; do not expose either in a browser client.

Restart persistence check: register an applicant, restart the Nest process or redeploy the Vercel function, then run `GET /journeys?applicantId=<applicant-id>`. The same attention number, journey state, attention history, and timestamps must return from Neon.

Rollback boundary: first roll back the API deployment to the prior Vercel deployment. If the database migration must also be reversed, take/restore a Neon backup or run a reviewed down migration that removes only this migration's tables, index, sequence, function, and enum types in dependency order. Never run a destructive database rollback while a newer API deployment is serving the schema.

## Excluded scope

This circuit deliberately excludes authentication/authorization, RF-16 certificate issuance (covered by the next slice), frontend/UI, aptitude recalculation, and real personal data.
