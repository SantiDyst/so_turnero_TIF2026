# Proposal: Completing the Applicant Circuit (RF-09–RF-14)

## Intent

The first slice ends after one attention. RF-09–RF-14 require three sequential specialty evaluations, pendings/recitations, referrals, protected agenda, a completion gate, and aptitude before `Cierre final`.

## Scope

### In Scope
- RF-09: sequential Bioquímica, Clínica Médica, Psicología attentions under one number.
- Evaluation aggregate (three rows), pendings/recitations, linked follow-ups (RF-10).
- Referrals; recitation-only reservations `Reservada` → `Cumplida|Cancelada|Reprogramada|Ausente` (RF-11, RF-12).
- Completion gate, automatic stored aptitude, explicit `Cierre final` (RF-13, RF-14).
- Derived `Esperando llamado`; extended journey read model.

### Out of Scope
- RF-15 reports, RF-16 certificate, authentication, frontend, recalculation.

Traceability: RF-09–RF-14, RF-15/RF-16 boundaries in `docs/requisitos/` (`Requisitos y especificaciones`, `03 Estados y transiciones`).

## Capabilities

### New Capabilities
- `specialty-evaluations`: aggregate and gate.
- `pendings-recitations`: pendings, recitations, follow-ups.
- `protected-agenda`: reservations and availability.
- `specialty-derivation`: referrals.
- `final-aptitude`: matrix, storage, closure.

### Modified Capabilities
- `applicant-registration`: eager evaluations.
- `attention-queue-query`: circuit read model.
- `professional-attention`: evaluation-aware sequential/follow-up transitions.

## Approach

Transition guards; PostgreSQL is authoritative. One change, four stacked PRs: (1) evaluation aggregate, specialty enum/backfill, sequential attentions, read model; (2) pendings/recitations; (3) agenda/derivations; (4) closure/aptitude.

Fixed: absence only sets `AUSENTE`; reservations cover recitations only; `COMPLETA` needs no open pendings; a fulfilled reservation creates one `EN_ESPERA` follow-up linked to evaluation, pending, and recitation; referrals target one other specialty; `btree_gist` exclusion with fallback; unique/idempotent follow-up guard.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `prisma/` | Modified | Aggregates, `CIERRE_FINAL`, enums, constraints. |
| `src/attentions/`, `src/applicants/`, `src/professionals/` | Modified | Evaluation-aware lifecycle, specialty. |
| `src/journeys/`, `src/shared/state-vocabulary.ts` | Modified | Read model, derived state, vocabulary. |
| `src/evaluations/`, `src/agenda/`, `src/derivations/`, `src/aptitude/` | New | Circuit modules. |
| `test/`, `docs/first-functional-run.md` | Modified | Coverage, walkthrough. |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Exceeds 400-line budget | High | Four stacked units. |
| Start relaxation regresses RF-06 | Med | Unique index, locks, race tests. |
| Reservation races/no `btree_gist` | Med | Exclusion, `23P01` → 409, lock fallback. |
| Backfill or duplicate follow-ups | Med | Reviewed migration, unique guard. |

## Rollback Plan

Revert stacked PRs and redeploy the prior build. Migrations are additive; enum removal is unsafe, so export data and restore a pre-migration snapshot.

## Dependencies

- `primer-recorrido-funcional` passing.
- `btree_gist` or documented fallback.
- RF-09 in unit 1; RF-15/RF-16 deferred.

## Success Criteria

- [ ] Three specialty attentions share one number; concurrent starts yield one active attention.
- [ ] Pending → recitation → reservation creates one linked follow-up; cancel/reschedule/absence alter neither pending, evaluation, nor journey.
- [ ] Closure blocks until all three complete; aptitude is stored on the third and matches every matrix case.
