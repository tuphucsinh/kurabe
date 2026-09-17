# Kurabe — active task ledger

## Current status

- `LEDGER_STATUS=ACTIVE`
- Canonical repo: `/home/pi5/projects/kurabe`
- Branch: `main`
- P104 initial phase baseline: `ea7b64fb0eafac1406780b0c0632757638d1f8f3`
- P104 execution baseline after control activation: `03a13da06ce549b6212bf9f32c28937e994dd048`
- P103: **13/13 DONE**
- CI repair `t_7c812262`: **DONE**
- F06: **CLOSED**
- Active remediation scope: **none; P104 is DONE**
- P104 integrated candidate: `9a8c988be603507142a4a8afe854deec108560a0`; remote CI run `35193543798` passed.
- Production writes/migrations allowed in this phase: `0/0`

## Dispatch rules

- Mika owns this ledger. Runners must not modify `tasks.md` or `.ai/MASTER_PLAN.md`.
- Use isolated worktrees/branches for parallel implementation.
- Respect file ownership below. If a task truly needs an owned file from another task, Mika resolves ownership before continuing.
- Each implementation task must finish with focused regressions and a clean worktree before integration.
- Do not create subtask explosions. One finding group = one task.
- Do not review each finding separately. Final review happens once in `P104M2T01`.

## P104 tasks

### P104M1T01 — Scope/state correctness

- `Status: DONE`
- `Findings: F01, F05, F09`
- `Depends on: none`
- `Parallel-safe: YES`
- `Goal:` eliminate stale/resident authorization state, distinguish report errors from successful empty results, and deny revoked Leader fresh current-read access while preserving legitimate historical read.

**Primary ownership**
- `src/contexts/AuthContext.tsx`
- `src/components/employees/EmployeesClient.tsx`
- `src/components/dashboard/DashboardDataLayer.tsx`
- `src/components/reports/ReportsDataLayer.tsx`
- `src/actions/reports.ts`
- `src/data/workflow.ts`
- focused regression tests for this scope

**Required behavior**
- F01: reuse existing `viewerScope.scopeKey` / scope epoch for local reset, request generation, and late-response rejection; clear resident data on unknown/denied scope.
- F05: report read/auth/aggregation failures must render an explicit error/unavailable state with retry; successful zero-row responses remain empty-state, not error.
- F09: current in-progress evaluation read must require current authorization, not merely a stale unfinished `evaluator_id`. Submitted/Approved historical evaluator access remains supported.
- Do not weaken Manager/self/current-team access.
- Prefer fixing the current-read authorization rule over broad SQL rewrites. If a DB mutation is truly required, Mika must assign one bounded migration explicitly before implementation.

**Focused regressions**
- same-tab secondary-team revoke removes resident data;
- late response from old scope cannot restore it;
- report DB/auth failure vs successful empty vs retry;
- revoked Leader with stale unfinished assignment cannot fresh-read;
- submitted/Approved historical evaluator positive control still reads;
- unchanged-scope and normal Manager/Leader/SubLeader/Employee/Worker controls remain valid.

**Done when**
- focused tests PASS;
- no unrelated product behavior changes;
- no production writes/migrations;
- candidate commit recorded and worktree clean.

---

### P104M1T02 — Output/data correctness

- `Status: DONE`
- `Findings: F02, F03, F04`
- `Depends on: none`
- `Parallel-safe: YES`
- `Goal:` make historical export/versioned display correct, preserve valid score `0`, and make Leader selected-team pagination/counts honor the requested authorized team.

**Primary ownership**
- `src/lib/export.ts`
- `src/lib/db/evaluations.ts`
- `src/lib/db/evaluations-admin.ts`
- `src/lib/db/users-admin.ts`
- directly related DTO/display helpers if needed
- focused regression tests for this scope

**Required behavior**
- F02: historical Excel export uses each round's pinned criteria snapshot/version. Preserve historical criterion **ID and label**. No silent fallback to current/live criteria; legacy unknown must be explicit.
- F03: map nullable scores with nullish semantics (`??`), not truthiness. Audit directly related consumers so numeric `0` remains valid through full/summary/batch/history/export/report/AI paths.
- F04: Leader requested team is `requestedTeam ∩ authorizedLedTeams`; rows, count, hasMore, and page boundaries must reflect that effective filter. Out-of-scope requested team remains denied.

**Focused regressions**
- historical export after criteria rename/delete/add;
- multiple criteria versions in one export;
- zero/null/undefined/positive score mapping through relevant read/export paths;
- Leader scope A+B: all teams vs selected B vs unauthorized C;
- selected-team counts and pagination boundaries;
- other roles unchanged.

**Done when**
- focused tests PASS;
- no silent live-config fallback;
- no production writes/migrations;
- candidate commit recorded and worktree clean.

---

### P104M1T03 — Release-gate truth

- `Status: DONE`
- `Findings: F07, F08`
- `Depends on: none`
- `Parallel-safe: YES`
- `Goal:` ensure ACL and cleanup gates report real security/cleanup outcomes instead of false PASS.

**Primary ownership**
- `docs/P103_RELEASE_CHECKLIST.md`
- `tests/operations/p103-release-preflight.mjs`
- directly related operation/verifier tests only

**Required behavior**
- F07: ACL verification must retain `PUBLIC` (`grantee=0`) instead of losing it through inner join; verify effective EXECUTE for anon/authenticated, including direct/inherited/PUBLIC cases and the exact function overload.
- F08: cleanup result participates in verdict; verify actual container absence instead of hardcoding `containerRemoved:true`; preserve both primary failure and cleanup failure when both occur.
- Do not weaken fail-closed release semantics.
- Do not alter production catalog or run production ACL changes.

**Focused regressions**
- clean ACL;
- PUBLIC grant;
- direct anon/authenticated grant;
- inherited effective grant;
- extra overload / wrong signature;
- cleanup success;
- `docker rm` nonzero;
- container still exists;
- inspect unavailable;
- primary failure + cleanup failure dual-reporting.

**Done when**
- focused negative and positive cases PASS;
- cleanup residue readback is truthful;
- no production writes/migrations;
- candidate commit recorded and worktree clean.

---

### P104M2T01 — Consolidated qualification

- `Status: DONE`
- `Findings: qualification for F01–F05 + F07–F09`
- `Depends on: P104M1T01 + P104M1T02 + P104M1T03 integrated`
- `Parallel-safe: NO`
- `Goal:` qualify one frozen integrated candidate and run one final review.

**Ownership**
- Mika/integration worktree only.
- No feature ownership. Do not turn this into a catch-all patch task.
- Trivial merge/integration fixes are allowed; functional defects go back to the owning task.

**Qualification**
1. freeze exact candidate SHA;
2. verify changed-path inventory and no accidental generated files;
3. focused regressions for all eight remaining findings;
4. `npm test`;
5. `npm run typecheck`;
6. `npm run lint`;
7. production/synthetic `npm run build`;
8. source secret scan;
9. authenticated confirmation matrix / real DB-browser harness only where relevant to changed surfaces;
10. verify production writes/migrations `0/0`;
11. verify cleanup residue `0`;
12. one consolidated independent final review against the exact frozen SHA.

**Acceptance**
- F01–F05 and F07–F09 all closed with evidence;
- no HIGH/CRITICAL regression introduced;
- root gates PASS;
- relevant authenticated/runtime checks PASS;
- final review PASS, or explicit owner disposition if reviewer infrastructure alone is unavailable after bounded retries;
- canonical repo clean;
- exact candidate SHA and evidence paths recorded.

**Closure evidence**
- Integrated candidate `9a8c988be603507142a4a8afe854deec108560a0` passed focused regressions, root gates, authenticated/runtime checks, and the fresh AGY review.
- Remote `main` and verified CI run `35193543798` match the integrated candidate; production writes/migrations remained `0/0`.

**Next state after PASS**
- `P104=DONE`
- no automatic deployment
- production readiness/deployment remains a separate owner-approved step.

## Closed / historical record

- P103 execution DAG: **13/13 DONE**.
- P103 final control closure: `f8b60677ab3944721e864ea7ad92ef8908bc024b`.
- CI repair `t_7c812262`: DONE at `ea7b64fb0eafac1406780b0c0632757638d1f8f3`; remote GitHub Actions PASS.
- F06 is closed and excluded from P104.
- Historical evidence remains in Git history and `/home/pi5/hermes-artifacts/kurabe-p103/`.
