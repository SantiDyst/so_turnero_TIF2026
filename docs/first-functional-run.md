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
  -d '{"specialty":"Clinical","professionalId":"<professional-id>"}'
```

Finalize an active attention. Only `Finalizada` and `Pendiente` are accepted (`200`); other values return `400`, and finalizing an inactive attention returns `409`. The journey remains `En proceso` and the professional returns to `Disponible`.

```sh
curl -i -X PATCH "$API_URL/attentions/<attention-id>/finalize" \
  -H 'content-type: application/json' \
  -d '{"state":"Finalizada"}'
```

Approved vocabulary is intentionally distinct: journey `En espera` / `En proceso`; attention `No iniciada` / `En espera` / `En atención` / `Finalizada` / `Pendiente`; professional `Disponible` / `Ocupado`.

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

This slice deliberately excludes authentication/authorization, pending-work management beyond finalization as `Pendiente`, reservations, reports, frontend/UI, recitation, referral, aptitude, closure, certificates, and real personal data.
