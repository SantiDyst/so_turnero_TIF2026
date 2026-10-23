# Proposal: Operator Console UI (ui-consola-operador)

## Intent

The RF-01..RF-16 circuit is only testable via raw HTTP; the single-applicant journey cannot be demonstrated end to end.

## Scope

### In Scope
- Static console in `public/`: intake/queue, journey console, closure, certificate, reports (RF-15).
- Hash routing `#/` and `#/j/<attentionNumber>`; `attentionNumber` is the only persisted context.
- Isolated `api-client.js` and `state-map.js`.
- Read-only `GET /professionals` — **hard prerequisite**: seeded ids are random UUIDs; no route exposes them.
- `useStaticAssets` in `src/app.factory.ts` for same-origin `npm run start:dev`.
- Reports via `PUT /attentions/:id/report`; docs updates.

### Out of Scope
- Pendings/recitations, reservations/agenda, derivations.
- Auth, roles, CORS, `vercel.json`.
- PDF, certificate signing, automated delivery.
- Bundler, framework migration.

## Capabilities

### New Capabilities
- `operator-console`: screens, read-model refresh, error rendering, hash routing, vocabulary mapping, happy-path sequencing (UI-only guard; API enforces no order).

### Modified Capabilities
- `professional-attention`: adds a read requirement for `GET /professionals` (specialty then name, `Disponible | Ocupado`); it already owns professional specialty and availability, and the list only supplies `professionalId`. Start/finalize unchanged.
- `attention-queue-query`: **None** — read contract unchanged; the console consumes `GET /queue` and `GET /journeys` as-is.

## Approach

- Vercel serves files before the `/api` rewrite; `useStaticAssets` gives local parity.
- Re-fetch `GET /journeys?attentionNumber=` after every mutation; derive ids and state from it.
- Professional select from `GET /professionals`; seed is single-option.
- Reports read from `reports[]`; a `409` triggers re-fetch.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `public/*` | New | Shell, styles, client, vocabulary, views |
| `src/professionals/professionals.controller.ts` | New | `GET /professionals` |
| `src/professionals/professionals.service.ts`, `src/app.factory.ts` | Modified | List; `useStaticAssets` |
| `test/`, `docs/first-functional-run.md`, `README.md`, `openspec/config.yaml` | Modified | Coverage, walkthrough, status |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Public unauthenticated console; writes; fictitious data | High | MVP-only, documented |
| No `GET /professionals`, no start possible | High | Ship endpoint first |
| API does not enforce procedural order | High | UI-only guard: hide `Iniciar` on `COMPLETA`; results only for `CLINICA_MEDICA`/`PSICOLOGIA` |
| Mixed vocabulary (Spanish states, enum codes) | Med | Single `state-map.js` |
| Deep links hit Nest `404` | Med | Hash routing only |

## Rollback Plan

Delete `public/` and controller; revert service, factory, docs. No schema or data change.

## Dependencies

- Deployed API, seeded professionals, `GET /professionals`.

## Success Criteria

- [ ] One session drives registration, three attentions, reports, closure, certificate.
- [ ] Refresh on `#/j/<attentionNumber>` restores state from `GET /journeys`.
- [ ] `npm run start:dev` serves the console same-origin, no CORS.
- [ ] `npm test` and `npm run build` green.
