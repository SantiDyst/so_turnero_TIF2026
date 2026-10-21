# Archive Report — circuito-completo-postulante

**Change**: circuito-completo-postulante
**Archived**: 2026-10-21
**Artifact store**: openspec (file-based)
**Archived to**: `openspec/changes/archive/2026-10-21-circuito-completo-postulante/`
**Repository**: `so_turnero_TIF2026`, branch `main`, HEAD `c96a15e`

## Final State

| Signal | Result |
|--------|--------|
| Verification verdict | PASS (`verify-report.md`, evidence_revision `sha256:fe6d0a87…`) |
| Build | `npm run build` exit 0 |
| Tests | `npm test` 82/82 passing (12/12 suites) |
| Prisma schema | `npx prisma validate` valid |
| Tasks | 30/30 complete, 0 unchecked |
| Requirements | 20/20 covered |
| Scenarios | 40/40 covered by passing tests |
| CRITICAL issues | 0 |
| WARNING issues | 0 |
| Non-blocking suggestions | 5 (see verify-report; none change archived behavior) |
| Code delivery | Merged to `main` at `c96a15e`; stacked PRs #4–#7 plus earlier chain #1–#3 merged |

## Gates

- **Task Completion Gate**: PASS. `tasks.md` contained 0 unchecked `- [ ]` items and 30 checked items before any spec sync or move. No archive-time checkbox reconciliation was needed.
- **Verification gate**: PASS. No CRITICAL findings, so archive was not blocked.
- **Native review receipt gate**: `reviewGate` was structurally absent — no review artifact was ever created for this candidate. Archive proceeded under ordinary repository policy; this is not a defect and was not investigated further.

## Specs Synced (delta merged before the move)

| Domain | Action | Added reqs | Modified reqs | Removed | Main spec |
|--------|--------|-----------|---------------|---------|-----------|
| specialty-evaluations | Created | 2 | 0 | 0 | `openspec/specs/specialty-evaluations/spec.md` |
| pendings-recitations | Created | 3 | 0 | 0 | `openspec/specs/pendings-recitations/spec.md` |
| protected-agenda | Created | 4 | 0 | 0 | `openspec/specs/protected-agenda/spec.md` |
| specialty-derivation | Created | 2 | 0 | 0 | `openspec/specs/specialty-derivation/spec.md` |
| final-aptitude | Created | 2 | 0 | 0 | `openspec/specs/final-aptitude/spec.md` |
| applicant-registration | Updated | 0 | 1 | 0 | `openspec/specs/applicant-registration/spec.md` |
| attention-queue-query | Updated | 1 | 2 | 0 | `openspec/specs/attention-queue-query/spec.md` |
| professional-attention | Updated | 1 | 2 | 0 | `openspec/specs/professional-attention/spec.md` |

Totals: 13 requirements added, 5 requirements modified, 0 removed, 0 renamed.

### Merge mechanics

- **Created domains** (main spec absent): shell `cp` of the delta spec into a `mktemp` file in the target directory, `diff -r` readback (empty), then `mv` into place. No artifact bytes passed through the model.
- **Updated domains** (main spec present): requirement blocks were spliced mechanically from the delta file by a filesystem script (offset-based block extraction, matched by `### Requirement:` name). ADDED blocks were appended to the existing `## ADDED Requirements` section; MODIFIED blocks replaced the matching requirement in place. Untouched requirements, heading hierarchy, and CRLF formatting were preserved (a no-op reconstruction of each main spec diffed byte-identical to the original before the real merge).
- Delta-only annotations `(Previously: …)` were dropped from the merged requirement text because they describe change history relative to the prior spec; the new normative text and all scenarios were carried verbatim otherwise.
- `## Scope and Traceability` sections of the three existing main specs were left untouched: the deltas' scope paragraphs describe only the increment, and replacing them would have dropped prior coverage notes.

## Mechanical Archive Move

- Pre-move recursive snapshot: `mktemp -d` → `cp -R` of the change folder.
- Move: `git mv openspec/changes/circuito-completo-postulante openspec/changes/archive/2026-10-21-circuito-completo-postulante` (12 tracked files renamed; `verify-report.md` moved with the directory as untracked).
- Source directory confirmed absent after the move.
- Mandatory readback `diff -r <snapshot> <archive>` produced **no output** (exit 0) — the archived tree is byte-identical to the pre-move snapshot. This `archive-report.md` is the only additive file and is excluded from that comparison.

## Archive Contents

- `exploration.md`
- `proposal.md`
- `design.md`
- `tasks.md` (30/30 complete)
- `verify-report.md`
- `specs/` — 8 delta domains (applicant-registration, attention-queue-query, professional-attention, specialty-evaluations, pendings-recitations, protected-agenda, specialty-derivation, final-aptitude)
- `archive-report.md` (this file)

## Follow-ups (non-blocking)

Carried from `verify-report.md`, none of which affect archived behavior:

1. Assert explicitly that the pre-fulfillment attention row is unchanged (immutability currently inferred).
2. Add one read-model test with evaluations, pendings, recitations, reservations, derivations, and aptitude populated simultaneously.
3. Consider a DB-level guarantee that reservations exist only for recitations (`NOT NULL` / `CHECK`); currently API-enforced.
4. Task total is 30 (including `1.3b`), not the 29 predicted in the planning brief.
5. Migration C could be split (extension + constraint) or paired with a preflight probe for `btree_gist`.

## SDD Cycle

Planned → specified → designed → tasked → applied → verified (PASS) → archived. The change is closed; `openspec/specs/` is the source of truth for the shipped behavior.
