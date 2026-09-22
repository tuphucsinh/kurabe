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
- Active remediation scope: **P105 bounded cleanup (T01–T03); P104 is DONE**
- P104 integrated candidate: `9a8c988be603507142a4a8afe854deec108560a0`; remote CI run `35193543798` passed.
- `P105: REGISTERED` — T01 CI hygiene (CONTROLLED), T02 dead-code removal (STANDARD), T03 perf rerun (STANDARD); plan reviewed `PASS` by agy/gemini-3.1-pro-high (evidence `/home/pi5/hermes-artifacts/kurabe-p105-plan/review-attempt1.log`).
- Production writes/migrations allowed in this phase: `0/0`

## Dispatch rules

- Mika owns this ledger. Runners must not modify `tasks.md` or `.ai/MASTER_PLAN.md`.
- Use isolated worktrees/branches for parallel implementation.
- Respect file ownership below. If a task truly needs an owned file from another task, Mika resolves ownership before continuing.
- Each implementation task must finish with focused regressions and a clean worktree before integration.
- Do not create subtask explosions. One finding group = one task.
- Do not review each finding separately. P104's consolidated review happened once in `P104M2T01`; in P105 the CONTROLLED review runs once on the `P105M1T01` candidate.

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

## P105 tasks

Reviewed plan: `/home/pi5/hermes-artifacts/kurabe-p105-plan/plan.md` (agy/gemini-3.1-pro-high `PASS`, 3 minor suggestions applied).

### [ ] [#P105M1T01] CI hygiene: mask disposable credentials + production smoke

```yaml
task:
  id: P105M1T01
  tier: CONTROLLED
  depends: []
  owns:
    - .github/ci/confirmation-runtime.mjs
    - .github/workflows/ci.yml
    - tests/operations/production-smoke.mjs
    - tests/operations/ci-suite-manifest.mjs
    - tests/ci-export-mask.test.mjs
  locks: [KURABE_TEST_CONTRACT]
```

Goal: mask every disposable-runtime credential before it reaches `$GITHUB_ENV`, and close the production-runtime verification gap with a small fail-closed `next start` smoke after `npm run build`.
Interface: exported env names from `exportEnv()` stay identical; new suite reachable via `scripts/verify-release.mjs --suite production-smoke`.
Current context: `.github/ci/confirmation-runtime.mjs:311` (`exportEnv`), `:70`/`:72` (`NODE_ENV=development`, `next dev`); `.github/workflows/ci.yml` `Run build` → `Cleanup` steps; job log of run `35193543798` showed `KURABE_DB_PASSWORD` (48 hex) and `KURABE_FIXTURE_PASSWORD` (45 chars) clear-text in a public repo.
Changes:
1. In `exportEnv()`, before appending to `$GITHUB_ENV`, emit `::add-mask::<value>` for every sensitive value (`KURABE_DB_PASSWORD`, `KURABE_FIXTURE_PASSWORD`, `KURABE_SUPABASE_ANON_KEY`, `KURABE_SUPABASE_SERVICE_ROLE_KEY`, plus any state field typed password/jwt/secret) — only when the value is a non-empty string; never emit a mask for `undefined`/empty.
2. Add `tests/operations/production-smoke.mjs`: after `npm run build`, start `next start` on the loopback disposable runtime and run exactly 5 cases (login, dashboard, employees, reports, one protected redirect or server-action); log `route + HTTP status + marker` per case; any failure fails the suite.
3. Wire the smoke step into `.github/workflows/ci.yml` between `Run build` and `Cleanup`; register the suite in `tests/operations/ci-suite-manifest.mjs` if the manifest requires registration.
Constraints: no Vault/secret manager; keep the existing `next dev` authenticated matrix untouched; no `src/**` edits; no Git ref/history or control-file edits; do not weaken fail-closed release semantics; production writes/migrations stay `0/0`.
DoD:
- `node scripts/run-tests.mjs` exits 0 including new `tests/ci-export-mask.test.mjs`
- `npm run lint` 0 errors, `npm run typecheck`, `npm run build`, `node scripts/scan-source-secrets.mjs` exit 0
- source-contract test proves every sensitive key declared in `exportEnv()` is masked before the env write (assert key names, never hard-code secret values)
- smoke suite logs route/status/marker for all 5 cases and fails closed on any failure
- all edits stay inside `owns`

---

### [ ] [#P105M1T02] Remove unreachable legacy evaluation fallbacks

```yaml
task:
  id: P105M1T02
  tier: STANDARD
  depends: []
  owns:
    - src/actions/evaluation.ts
    - tests/evaluation-fallback-removal.test.mjs
  locks: []
```

Goal: delete the two provably unreachable legacy sequential blocks left behind by the fail-closed transactional-RPC gates (~400 lines of dead code) without changing any reachable behavior.
Interface: exports `saveEvaluationRound` / `returnEvaluationRound` keep identical signatures and behavior.
Current context: `src/actions/evaluation.ts:460-525` (fail-closed gate + RPC branch) with dead sequential block from `:527` to the end of `saveEvaluationRound` (~`:737`); `:974-1021` for return, dead "Guarded sequential return branch" `:1024-1220`.
Changes:
1. Delete exactly those two unreachable blocks.
2. Remove imports/helpers/types that become unused **only as a consequence** of the deletion.
3. Add `tests/evaluation-fallback-removal.test.mjs`: source-contract asserting both fail-closed gates and both transactional RPC branches remain, and no sequential/legacy fallback path remains in either function.
Constraints: no behavior change on any reachable branch; no refactor/rewrite/framework; no edits outside `owns`; no Git ref/history or control-file edits.
DoD:
- `node scripts/run-tests.mjs`, `npm run lint`, `npm run typecheck`, `npm run build` exit 0
- grep proves zero sequential/legacy fallback remains in the two functions; gate + RPC branch lines unchanged
- diff is deletions plus the new focused test only

---

### [ ] [#P105M1T03] Rerun authenticated performance baseline on current code

```yaml
task:
  id: P105M1T03
  tier: STANDARD
  depends: [P105M1T01, P105M1T02]
  owns:
    - tests/perf/perf-report.json
    - tests/perf/benchmark-harness.mjs
  locks: [MACHINE_EXCLUSIVE]
```

Goal: refresh the stale performance baseline (last update `4efe42d`, 139 commits behind current main) by re-running the existing harness on the final P105 code.
Interface: harness entrypoint unchanged; report keeps its schema and gains a measurement timestamp plus candidate-SHA provenance.
Current context: `tests/perf/benchmark-harness.mjs`, `tests/perf/perf-report.json` (32 runs = 2 samples/point).
Changes:
1. Raise sampling to 5 per point (route × viewport × state) while keeping route/role/viewport/dataset/build mode identical to the old baseline.
2. Report median + p95 per metric; mean is never the verdict.
3. Record measurement timestamp and candidate SHA in report provenance.
Constraints: no new benchmark system; no environment changes versus the old baseline; no edits outside `owns`; perf artifacts only.
DoD:
- report regenerated with 5 samples/point, median/p95 present, provenance binds the current candidate SHA and measurement timestamp
- dataComplete median < 1000 ms on LAN/loopback closes perf; otherwise at most 2 bounded fixes then re-measure (no new phase)
- `npm run lint` (0 errors), `npm run typecheck`, `npm run build` still exit 0 on the final code

## Closed / historical record

- P103 execution DAG: **13/13 DONE**.
- P103 final control closure: `f8b60677ab3944721e864ea7ad92ef8908bc024b`.
- CI repair `t_7c812262`: DONE at `ea7b64fb0eafac1406780b0c0632757638d1f8f3`; remote GitHub Actions PASS.
- F06 is closed and excluded from P104.
- Historical evidence remains in Git history and `/home/pi5/hermes-artifacts/kurabe-p103/`.
