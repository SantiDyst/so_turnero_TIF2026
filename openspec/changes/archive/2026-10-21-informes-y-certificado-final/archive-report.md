# Archive Report — informes-y-certificado-final

**Change**: informes-y-certificado-final
**Archived**: 2026-10-21
**Artifact store**: openspec (file-based)
**Archived to**: `openspec/changes/archive/2026-10-21-informes-y-certificado-final/`
**Repository**: `so_turnero_TIF2026`, branch `main`, HEAD `c60f608` (merge of PR #10; slices #8, #9, #10 merged)

## Final State

| Signal | Result |
|--------|--------|
| Verification verdict | PASS WITH WARNINGS (`verify-report.md`, evidence_revision `sha256:a3d65750…`) |
| Requirements | 8/8 covered |
| Scenarios | 18/18 covered by passing runtime evidence |
| Build | `npm run build` exit 0 (`nest build` clean), per verify-report at verification time |
| Tests | `npm test` 117/117 passing (18/18 suites) |
| Prisma schema | `npx prisma validate` exit 0 |
| Tasks | 20/20 complete, 0 unchecked |
| CRITICAL issues | 0 |
| WARNING issues | 1 (V-1, vocabulary drift — corrected during this archive; see below) |
| Non-blocking suggestions | 4 (V-2 to V-5 in verify-report) |
| Code delivery | Merged to `main` at `c60f608`; stacked PRs #8, #9, #10 |

## Gates

- **Task Completion Gate**: PASS. The persisted `tasks.md` contained 0 unchecked `- [ ]` items and 20 checked items before any spec sync or move. No archive-time checkbox reconciliation was needed.
- **Verification gate**: PASS. No CRITICAL findings, so archive was not blocked.
- **Native review receipt gate**: `reviewGate` was structurally absent — no review artifact exists for this candidate. Archive proceeded under ordinary repository policy; this is not a defect and was not investigated further.

## V-1 Correction (applied before the sync)

Verify warning V-1 flagged a closed-journey vocabulary drift: the delta specs described the closed journey value as `CIERRE_FINAL` while the runtime emits `Cierre final` (`src/shared/state-vocabulary.ts:15`) and `docs/first-functional-run.md` already used `Cierre final` (lines 54, 74, 80, 92, 104). Documentation/spec correction only — no production code, tests, `package.json`, `scripts/seed-professionals.ts`, or `vercel.json` were touched.

Before/after, exact wording:

| File | Before | After |
|---|---|---|
| `specs/attention-queue-query/spec.md` | "Queries MUST represent journey state as `En espera`, `En proceso`, or `CIERRE_FINAL`; …" | "Queries MUST represent journey state as `En espera`, `En proceso`, or `Cierre final`; …" |
| `specs/specialty-reports/spec.md` | "… and `409` when the journey is `CIERRE_FINAL`." | "… and `409` when the journey is `Cierre final`." |
| `specs/final-certificate/spec.md` | "Issuance MUST require journey state `CIERRE_FINAL` …" / "GIVEN a journey is `CIERRE_FINAL` with stored aptitude" / "GIVEN the journey is not `CIERRE_FINAL` or has no stored aptitude" | Same three sentences with `Cierre final` substituted |

Notes on scope:

- The mandate named `specs/attention-queue-query/spec.md`. The same substitution was applied to `specialty-reports` and `final-certificate` because both domains are **new** in this change: syncing them unchanged would have created two brand-new baselines carrying the exact drift V-1 describes.
- `docs/first-functional-run.md` needed no correction — every occurrence already read `Cierre final`; the file was verified and left untouched.
- Contrary to the launch brief, the pre-archive baseline `openspec/specs/attention-queue-query/spec.md` used `CIERRE_FINAL` at line 47 (matching its own archived delta from `2026-10-21-circuito-completo-postulante`), not `Cierre final`. The baseline now reads `Cierre final` because the MODIFIED requirement was resynced from the corrected delta. See follow-up 6 for the remaining pre-existing occurrences in other domains.

## Specs Synced (delta merged before the move)

| Domain | Action | Added reqs | Modified reqs | Removed | Scenarios in delta | Main spec |
|--------|--------|-----------|---------------|---------|--------------------|-----------|
| specialty-reports | Created | 3 | 0 | 0 | 5 | `openspec/specs/specialty-reports/spec.md` |
| final-certificate | Created | 3 | 0 | 0 | 6 | `openspec/specs/final-certificate/spec.md` |
| attention-queue-query | Updated | 0 | 2 | 0 | 7 | `openspec/specs/attention-queue-query/spec.md` |

Totals: 6 requirements added, 2 requirements modified, 0 removed, 0 renamed, 18 scenarios synced.

### Merge mechanics

- **Created domains** (main spec absent): shell copy of the corrected delta into a temporary file inside the target directory, readback comparison (identical, exit 0), then move into place. No artifact bytes passed through model Read → Write. Final readback per domain: identical (exit 0).
- **Updated domain** (main spec present): requirement blocks were spliced mechanically by a filesystem script (regex block extraction matched by `### Requirement:` name) from the corrected delta into the baseline. Only the two MODIFIED requirements were replaced; the three requirements not named in the delta (`Query the waiting queue`, `Find a journey by either supported identifier`, `Provide open persistent queries for this slice`) and the `## Scope and Traceability` section were asserted byte-identical before the write.
- Delta-only `(Previously: …)` annotations were dropped from the merged baseline (main specs do not carry change history), matching the precedent of `2026-10-21-circuito-completo-postulante`. All normative text and every scenario were carried verbatim, and the annotations remain in the archived delta files.
- CRLF line endings and UTF-8 without BOM were preserved; no BOM or LF-only lines were introduced.

### Sync verification

- Every archived delta requirement heading (3 + 3 + 2 = 8) is present in its main spec.
- Every archived delta scenario heading (5 + 6 + 7 = 18) and its GIVEN/WHEN/THEN body is present verbatim in its main spec.
- Baseline requirement/scenario counts after sync: `specialty-reports` 3/5, `final-certificate` 3/6, `attention-queue-query` 5/13 (5 pre-existing requirements preserved).

## Mechanical Archive Move

- Pre-move recursive snapshot: temporary directory → recursive copy of the change folder.
- Move: `git mv openspec/changes/informes-y-certificado-final openspec/changes/archive/2026-10-21-informes-y-certificado-final` (7 tracked files renamed; `verify-report.md` moved with the directory as untracked).
- Source directory confirmed absent after the move.
- Mandatory readback `diff -r <snapshot> <archive>` produced **no output** with **exit 0** — the archived tree is byte-identical to the pre-move snapshot. Verbatim output:

```
DIFF -r READBACK BEGIN
<no output: trees are identical>
DIFF -r READBACK END (exit=0)
```

  This `archive-report.md` is the only additive file and is excluded from that comparison.

## Archive Contents

- `exploration.md`
- `proposal.md`
- `design.md`
- `tasks.md` (20/20 complete)
- `verify-report.md` (untracked before and after the move)
- `specs/` — 3 delta domains: `specialty-reports`, `final-certificate`, `attention-queue-query`
- `archive-report.md` (this file)

## Files Changed by This Phase

Created:

- `openspec/specs/specialty-reports/spec.md`
- `openspec/specs/final-certificate/spec.md`
- `openspec/changes/archive/2026-10-21-informes-y-certificado-final/archive-report.md`

Modified:

- `openspec/specs/attention-queue-query/spec.md` (2 MODIFIED requirements merged)
- `openspec/changes/archive/2026-10-21-informes-y-certificado-final/specs/attention-queue-query/spec.md` (V-1 wording, before the move)
- `openspec/changes/archive/2026-10-21-informes-y-certificado-final/specs/specialty-reports/spec.md` (V-1 wording, before the move)
- `openspec/changes/archive/2026-10-21-informes-y-certificado-final/specs/final-certificate/spec.md` (V-1 wording, before the move)

Moved:

- `openspec/changes/informes-y-certificado-final/` → `openspec/changes/archive/2026-10-21-informes-y-certificado-final/`

Untouched outside `openspec/`: `docs/first-functional-run.md` (already consistent), production code, tests, `package.json`, `scripts/seed-professionals.ts`, `vercel.json`.

## Follow-ups (non-blocking)

Carried from `verify-report.md` plus this phase's observations:

1. **V-2** — `GET /journeys/:id/reports` returns `{ journeyId, reports[] }`, an envelope neither the spec nor `design.md` describes. Confirm the envelope is intentional; the archived spec now fixes the contract.
2. **V-3** — An attention with no associated evaluation returns `400`, a status case absent from the design status table (unreachable in the current flow).
3. **V-4** — The `P2002` re-read fallback in `CertificatesService.issue` has no dedicated test.
4. **V-5** — Re-saving a report as `Pendiente` clears `completadoAt`; the transition semantics are unstated in the spec.
5. **V-6 / V-7** — Pre-existing dirty worktree (`package.json` modified, `scripts/seed-professionals.ts`, `vercel.json` untracked) and repo-wide CRLF/lint noise are outside this change and deliberately untouched.
6. **Residual vocabulary drift** — `openspec/specs/final-aptitude/spec.md` (lines 29, 42) and `openspec/specs/professional-attention/spec.md` (line 25) still describe the closed journey value as `CIERRE_FINAL`. They predate this change and were not part of its deltas, so they were left untouched to avoid rewording requirements this archive did not sync. A future documentation pass should align them with runtime `Cierre final`.
7. `verify-report.md` remains untracked after the move (it was untracked in the active change folder). The orchestrator decides whether to commit it with the archive.

## SDD Cycle

Planned → explored → proposed → specified → designed → tasked → applied (PRs #8–#10) → verified (PASS WITH WARNINGS) → archived. The change is closed; `openspec/specs/` is the source of truth for the shipped behavior.
