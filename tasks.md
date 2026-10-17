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
- Active preparation: **P108 — 12 PLANNED tasks (P108M1T01–T11, P108M2T01), not registered**. P107 released 2026-10-10 (`.ai/DECISIONS_LOG.md` rows 57–61); P104–P107 tasks remain historical; no re-open.
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

### [x] [#P105M1T01] CI hygiene: mask disposable credentials + production smoke

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

### [x] [#P105M1T02] Remove unreachable legacy evaluation fallbacks

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

### [x] [#P105M1T03] Rerun authenticated performance baseline on current code

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

## P106 tasks

### [x] [#P106M1T01] Seed default password = employee_code for newly created users

```yaml
task:
  id: P106M1T01
  tier: CONTROLLED
  depends: []
  owns: [src/actions/users.ts, src/lib/db/password-seed.ts, tests/password-seed.test.mjs]
  locks: []
```

Goal: When a NEW user row is created through `upsertUserAction`/`upsertUsersAction`, give it a default login credential equal to its `employee_code` so the person can sign in immediately (owner instruction 2026-09-22: default password = employee code). Today new rows are created with `password_hash` NULL, which either blocks login (require mode) or silently skips the password check (optional mode). The personnel RPC must stay credential-free (design invariant: "credentials remain outside personnel mutation").

- Interface: new export `seedDefaultPasswords(userIds: string[]): Promise<{ seeded: string[]; failed: Array<{ id: string; reason: string }> }>` in `src/lib/db/password-seed.ts`; upsert actions surface a non-empty `failed` through their existing `warning` field.
- Current context: `src/actions/users.ts` (`upsertUserAction` `isNewUser` at L94-121; `upsertUsersAction` `prepared[].isNew` at L142-167; `softDeleteUserAction` must NOT seed); `src/lib/db/evaluations-write.ts` `applyPersonnelTransaction` returns `result.data.users`; login gates at `src/actions/auth.ts` L136-173 (NULL-hash behaviour); bcryptjs cost 10 matches `src/actions/account.ts` L119.
- Changes:
  1. Create `src/lib/db/password-seed.ts`: select `id, employee_code, password_hash, credential_revision` for the given ids where `password_hash IS NULL`; per row `hash = bcryptjs.hash(employee_code, 10)`; update `password_hash`, `password_setup_required=false`, `credential_revision=(current ?? 0)+1`; never log/print hash or password; collect `seeded` vs `failed({id, reason})` without throwing.
  2. `upsertUserAction`: after personnel-transaction success, if `isNewUser`, call `seedDefaultPasswords([userId])`; attach `warning` when `failed.length > 0`; return stays success (personnel write already committed; Manager reset is the fallback).
  3. `upsertUsersAction`: seed only `prepared[].isNew` ids after success; same warning rule.
  4. Do not touch: `softDeleteUserAction`, `teams.ts`, RPC/SQL migrations, users that already have `password_hash`.
- Constraints: empty `employee_code` ⇒ that row goes to `failed` (fail-closed per row); no credential values in audit detail/logs/warning text; bcryptjs only, no new deps; edits strictly inside `owns`; no control-file edits.
- DoD:
  - `npm run lint` exit 0
  - `npm run typecheck` exit 0
  - `npm test` exit 0, including new `tests/password-seed.test.mjs` covering: NULL-hash row gets a working bcrypt password equal to `employee_code` + setup flag cleared + revision bumped; already-hashed row untouched; empty `employee_code` → `failed` entry; action surfaces `warning` on failure
  - `npm run build` exit 0
  - secret scan clean; edits remain inside `owns`

### [x] [#P106M1T02] Stop 30-50s scoped-cache blink on /teams (poll must not clearBeforeRender)

```yaml
task:
  id: P106M1T02
  tier: CONTROLLED
  depends: []
  owns: [src/contexts/AuthContext.tsx, tests/auth-context-poll.test.mjs]
  locks: []
```

Goal: The 30s viewer-scope poll (interval + focus/pageshow/visibility handlers) calls `refreshViewerScope({ clearBeforeRender: true })`, which nulls `viewerScope` and removes every `SCOPED_QUERY_FAMILIES` cache entry before the server answer arrives. `/teams` renders a full skeleton for ~1-2s every ~40-50s (owner screenshot 2026-09-22). Dashboard/Reports are RSC server-rendered and partly outside the family set, so they do not blink — consistent with "other pages seem fine".

- Change: inside `maybeRefreshViewerScope` ONLY, call `refreshViewerScope()` with no options (default `clearBeforeRender` falsy). Keep `clearBeforeRender?: boolean` on the context interface; keep the `login()` refresh call (~L236) untouched; do NOT modify `scopeFingerprint`, the scope-epoch effect (L92-99), `clearScopedQueries`, `SCOPED_QUERY_FAMILIES`, logout, or any component.
- Invariants that MUST remain true (pinned by the new test): identity/scope change still clears exactly once via the fingerprint-diff effect (epoch bump + cancelQueries + removeQueries); a `null` scope response (action failure / session end) changes the fingerprint → clear still happens (fail-closed); same-identity refresh keeps data on screen while queries refetch in background.
- Focused regressions (`tests/auth-context-poll.test.mjs`, `node:test`, static source-contract style of `tests/password-seed.test.mjs`): (1) `src/contexts/AuthContext.tsx` contains no `clearBeforeRender: true` (the only allowed occurrence of the token `clearBeforeRender` is the interface type declaration); (2) `maybeRefreshViewerScope` body calls `refreshViewerScope()` with no argument object; (3) anchors proving fingerprint + epoch-effect + `clearScopedQueries` logic still present; (4) `SCOPED_QUERY_FAMILIES` still contains `'teams'`, `'teams-page-data'`, `'employees-page-data'`.
- Constraints: no new dependencies; no DB/SQL/RPC/config/AGENTS.md/HANDOFF edits; edits strictly inside `owns`.
- DoD:
  - `npm run lint` exit 0
  - `npm run typecheck` exit 0
  - `node --test tests/` exit 0 (existing 65 + new file)
  - `npm run build` exit 0
  - secret scan clean; edits remain inside `owns`

## P107 — integrity-first remediation (one phase, M1)

`WBS_STATUS=CANONICAL_EXECUTION_AUTHORIZED`; preparation reviewed and committed at `746be361c43e976c0a4d335e3114625678d5024a`. Original preparation review record remains historical exact-byte evidence. Owner now authorizes local execution and canonical task/control commits for all P107M1T01–P107M1T10; no push/deploy/production/paid-AI rollout. Runtime task status and refreshed BASE_SHA live in `.state/agent-state.json`.

Execution binding: Runner `agy`, exact model `gemini-3.8-flash-high`; fresh gate `reviewer`, provider `opencode-go`, exact model `deepseek-v4.1-flash`. Both provider-backed no-tool preflights succeeded. One Runner/verifier; task owns/DoD/IDs/DAG unchanged. Local candidate SQL/security and synthetic fixture operations required by named DoD are within the authorized local scope; production/private-data/remote grants/credentials remain separate approval gates. Preparation-only statements below describe the completed preparation turn, not a prohibition overriding this new owner instruction.

### Shared execution envelope — applies to every P107 task

- Planning source `BASE_SHA=5f0c95f37ffa5155b4f7ba26e9ea6f61991925ee`; this is NOT the future dispatch base. After owner-authorized planning commit/readback and fresh plan review, Mika atomically registers the batch. At dispatch, authoritative state BASE_SHA = current canonical HEAD with dependencies integrated; preserve this ID/owns/DoD on fallback.
- `Status=PLANNED` for every checkbox below, not READY/RUNNING. No implementation, migration apply, runtime setup, paid provider call, credential operation, Git commit/push or deploy authorized by this preparation turn.
- Task WT = `/home/pi5/projects/kurabe-task-wts/<ID>`; candidate WT = `/home/pi5/projects/kurabe-integration-wts/<ID>`; neither exists from this planning action. Branches assigned by Mika under lock at later dispatch; no duplicate runner.
- Evidence path = `/home/pi5/hermes-artifacts/kurabe-p107/<ID>/evidence.json`; producer = Runner's redacted supplemental report + Mika's independently verified exact-candidate gate results. Required fields: task/base/candidate/tree identity, changed paths/file hashes, commands/exit/status/log hashes, case IDs/expected/actual/readback, lane/fixture IDs, limitations, production writes/migrations, cleanup residue. Runner report path = same directory `runner-report.md`; no raw credentials/HR data.
- Every implementation task includes matching behavior tests + wiring, `npm test`, `npm run lint`, `npm run typecheck`, isolated `npm run build`, `node scripts/scan-source-secrets.mjs`, scope/diff checks. Exact candidate checks run by Mika; CONTROLLED requires fresh selected canonical review PASS for that candidate. New test paths below are planned NEW files, not existing APIs.
- DB work: new named candidate migration only, no edit of applied/historical SQL. Disposable fixture must apply exact artifact, catalog/provenance preflight, affected-row checks, concurrency and failure rollback; before any local DB/security mutation obtain applicable action approval. Prepare rollback tied to captured object/ACL fingerprints; qualify apply→rollback→reapply. Production apply is outside phase.
- Auth/browser work: authentic local services with synthetic fixtures; Auth/PostgREST parity where grants/token are tested. No fake auth/API adapters, disabled triggers or manufactured PASS. Preserve fixtures through required matrix; clean exact run-owned IDs/resources only and read back residue. Paid AI/provider traffic/private-data egress needs separate approval.
- Allowed writes = explicit owns only. Existing same paths may appear in dependent tasks: full serial DAG proves non-concurrent ownership. A discovered extra caller/migration/test producer requires Mika scope amendment BEFORE write. Runner forbidden paths: tasks.md, AGENTS.md, HANDOFF.md, `.ai/*`, `.state/*`, credentials/instructions, Git refs/history. Existing user-owned work is preserved.
- Keep default password = employee code, optional NULL-hash compatibility, existing scoring/grade/role-round count and freeze-unfinished close; no strict/backfill/Excluded, new framework, blanket grant revoke, historical rewrite or production rollout.
- Stop affected stage on unresolved scope/consumer/catalog/fixture/rollback identity; preserve first failure. Ordinary in-scope failures follow project repair budget; liveness UNKNOWN keeps reservations. Tool/transport failure is not product PASS.

### [x] [#P107M1T01] Source/runtime preflight and exact consumer contract

Closure evidence: `.ai/P107_SOURCE_PREFLIGHT.md`; metadata-only source `d6d58828df39bf474c468992dd7d14be188fa07d`, fresh reviewer/checker PASS session `20261008_175255_489ed9`, digest `6fe1b65999061081183103441d0e247ddf98a1c0e6688d8dd0af315df8a11709`. Live-release gates remain UNKNOWN; affected downstream owns amendments are separate pre-dispatch gates.

```yaml
task:
  id: P107M1T01
  tier: CONTROLLED
  depends: []
  owns: []
  locks: [KURABE_SOURCE_CONTRACT]
```

Goal: Mika-only read-only prerequisite; establish the exact source consumer/migration/test graph and separate local-candidate readiness from live-release UNKNOWN before any product writes.
Current context: `.ai/MASTER_PLAN.md` findings S1–S13/L1–L8/P1–P9/T1–T6/N1–N10; `package.json`, lockfile, `.github/ci/confirmation-runtime.mjs`, `db/bootstrap/expected-catalog.json`, real migration/overload definitions and all sensitive readers/AI callers.
Changes: no application edits. Retain redacted consumer manifest (entrypoint→auth→reader→DTO→browser/export/AI), exact overloaded function identity/effective privileges on the authorized target, and every producer/caller needed by later owns. Re-run full/prod npm audit with real JSON inventory and reachability triage. Inspect configured test stack/capabilities and historical state/workspace provenance. Do not use stale P105/P106 PASS or liveness as current evidence.
DoD:
- Evidence enumerates Approved-only, current-evaluator/Manager draft and appointment-only contracts plus current source defects; all later consumers map to an owned path or explicit amendment requirement.
- Repo catalog snapshot is tied to source SHA; live catalog/flags/regions/signup/deployed SHA inspected ONLY with approved access; absent access = UNKNOWN live gate, not a fabricated result or blocker to well-specified offline candidate work.
- Advisory disposition gives installed/affected versions, dependency path, applicability and minimal target; no unsupported counts or guessed upgrade.
- Local stack feasibility/path/version and Auth/PostgREST gap recorded; no runtime started or production data fetched under read-only task.
- Mika verifies evidence hash/readback, dependency/owns DAG, protected-path hashes and Git/worktree/process identity. Metadata-only completion uses owner-approved canonical control evidence, not an empty product commit or automatic READY of descendants.

### [x] [#P107M1T02] Minimal applicable dependency remediation

Closure evidence: exact product candidate `f57b8f97e5b2c7bf3b1ae20a4b3cadf19f420451`, fresh reviewer/checker PASS session `20261008_184444_8e230a`, digest `9387305ff21784eb144bff47c03d9b844a9024238bd5cccd283b8a5a032a2a63`; `/home/pi5/hermes-artifacts/kurabe-p107/P107M1T02/evidence.json`. Clean install + focused/root/lint/typecheck/build/secrets/runtime gates PASS; production audit 3→0, full audit 9→5 retained dev-only braces-chain findings. Authenticated/local ACL matrix remains T03/T04; no production rollout.

```yaml
task:
  id: P107M1T02
  tier: CONTROLLED
  depends: [P107M1T01]
  owns: [package.json, package-lock.json, tests/p107-dependencies.test.mjs]
  locks: [KURABE_SOURCE_CONTRACT]
```

Goal: resolve applicable security advisories early, without bulk update or unrelated framework migration (N9).
Current context: package manifest uses Next/eslint-config-next 16.3.4, repo-defined overrides and SheetJS CDN dependency; actual installed/lock/advisory inventory comes from T01, not this nominal version.
Changes: only confirmed applicable packages/transitives; choose compatible patched versions using current advisory/release evidence; keep Next/config pair coherent and preserve integrity/overrides deliberately. Add focused dependency contract regression. No `npm audit fix --force`.
DoD:
- Before/after full+prod audit JSON retained, residual applicability explained; impacted login/build/runtime regression plus shared gates PASS.
- Lockfile diff limited to justified resolution; clean install in isolated candidate reproduces; no package scripts/secrets/runtime settings broadened.
- If T01 proves no applicable update, retain `NO_CHANGE_REQUIRED` evidence and owner-reviewed canonical disposition; do not fabricate an update/test, empty product commit or unconditional audit=0.

### [x] [#P107M1T03] Server-side draft confidentiality and appointed-Leader authority

```yaml
task:
  id: P107M1T03
  tier: CONTROLLED
  depends: [P107M1T02]
  owns:
    - src/actions/read.ts
    - src/actions/evaluation.ts
    - src/data/workflow.ts
    - src/lib/evaluator-resolver.ts
    - src/lib/team-validation.ts
    - src/lib/db/teams-admin.ts
    - src/lib/db/users-admin.ts
    - src/lib/db/evaluations.ts
    - src/lib/db/evaluations-admin.ts
    - src/lib/db/evaluation-display-admin.ts
    - src/lib/db/evaluation-history-admin.ts
    - src/lib/db/evaluations-write.ts
    - src/lib/db/criteria.ts
    - src/lib/db/criteria-admin.ts
    - src/lib/grade-bands.ts
    - src/lib/evaluation-transaction-rpc.ts
    - src/hooks/use-db.ts
    - src/hooks/use-evaluation-page-state.ts
    - src/types/index.ts
    - src/types/database.ts
    - supabase/migrations/20261008000100_p107_read_authority.sql
    - tests/p107-read-authority.test.mjs
    - tests/fixtures/p107/read-authority/
    - tests/leader-validation.test.mjs
    - tests/h1h2-workflow-contract.test.ts
  locks: [KURABE_SOURCE_CONTRACT, KURABE_SCHEMA_CONTRACT]
```

Owns amendment 2 (canonical control, 2026-10-08): adds `tests/leader-validation.test.mjs` and `tests/h1h2-workflow-contract.test.ts` — existing tests that assert the removed unique-primary Leader fallback and must be updated to the deny semantics required by this task's goal and owner policy. Task ID/tier/goal/DoD/DAG/locks unchanged; no implicit write permission beyond those two test files.

Goal: close S5–S8/S11/N4/N7 with one server authority and selective candidate ACL changes, not UI-only masking.
Consumer pre-dispatch disposition: `.ai/P107_T03_CONSUMER_PREFLIGHT.md`; Mika adds only the inspected draft DTO hydration caller `src/hooks/use-evaluation-page-state.ts` to owns. Task ID/goal/DoD/DAG unchanged; other inspected callers remain read-only with explicit unchanged-interface/privilege regression requirements. No implicit additional write permission.
Interface: keep authenticated action signatures where possible; explicit redacted round DTO carries allowed status/assignment metadata but no hidden scores/notes/comments/selected levels/derived total/grade/snapshot details. Require caller auth before version reads. Full list/detail/history/summary/batch/compare/display/export/AI must not bypass it.
Current context: `evaluations.ts:12–19`, `workflow.ts:263–277`, `evaluator-resolver.ts:77–114,161–172`, SQL multiteam save unique-primary fallback vs current-authorization return appointment, direct browser criteria/grade RPC consumers identified by T01.
Changes:
1. Implement current assigned evaluator + active Manager draft read; Manager only edits own assigned round. Require current role/scope/appointment, not stale evaluator ID. SELF subject may read own draft. Submitted history rules remain separate; returned mutable rounds regain draft privacy.
2. Remove unique-primary Leader fallback from resolve/init/save/submit/return/current draft access. No pointer/invalid/inactive pointer ⇒ unassigned/deny; valid multi-team appointment permits without primary-team equality. Preserve role-round mapping, revoked-actor deny and immutable historical authorization.
3. Escape/bound PostgREST search grammar consistently with literal-safe negative cases, without exposing hash columns or relaxing team scope.
4. Serverize inventoried sensitive direct readers before selective ACL/RLS/default-privilege/overload closure. New migration binds exact signatures and callers; revoke latent old overload only after dependencies confirmed. Do not blanket revoke public schema or remove innocuous anon client/CSP blindly.
DoD:
- Five-role actor/round read+write matrices; next evaluator/subject/other team deny draft payload; Manager readonly positive; appointed secondary team allow; sole primary Leader without pointer deny; revoked same-session save/submit/return deny with unchanged DB graph.
- List/detail/history/display/compare/summary/batch and transitive export/AI serialization negative controls, including version metadata and returned-round draft. Existing submitted historical positive controls remain.
- Authentic local Auth/PostgREST shows unauthorized direct browser-role denial and legitimate config/server consumer allow; PUBLIC/direct/inherited/extra-overload negative controls make verifier fail. Bare PG cannot certify this gate.
- Candidate migration rollback restores captured selective ACL, not GRANT ALL; real catalog definitions and no partial mutation proved. Shared gates + exact fresh CONTROLLED review.

### [x] [#P107M1T04] Race-safe default seed and compatible login resilience

```yaml
task:
  id: P107M1T04
  tier: CONTROLLED
  depends: [P107M1T03]
  owns:
    - src/actions/auth.ts
    - src/actions/users.ts
    - src/lib/login-rate-limit.ts
    - src/lib/db/password-seed.ts
    - tests/password-seed.test.mjs
    - tests/p107-auth-resilience.test.mjs
    - tests/fixtures/p107/auth-resilience/
  locks: [KURABE_SOURCE_CONTRACT]
```

Goal: N10 seed must never overwrite a concurrent password change; preserve owner policy and qualify S2–S4/S9/S10/P7/T5 without forced strict rollout.
Current context: seed pre-selects NULL hash but update at `password-seed.ts:73–80` uses ID only; auth uses optional/non-NULL distinction and proxy trust/admission primitives.
Changes: conditional NULL-hash + observed credential-revision + observed code CAS, exact affected-row readback; conflict is skipped/failed, never reported seeded or retried over new credentials. Seed only new-user IDs after committed personnel RPC; redact warning/error detail. Keep sequential seed unless measured scale warrants bounded concurrency. For limiter, keep atomic account admission and trusted peer checks; remove source-proven enumeration distinctions only with matching behavior tests, no invented network identity or unproven constant-time claim.
DoD:
- Two real DB connections/actions reproduce seed/reset/code-change race: user-changed credential survives, no false seeded success, revision monotonic. Wrong/missing non-NULL credential denied; NULL optional passes with flag absent/false; exact true remains separate strict compatibility test, not activation.
- Spoofed/malformed/trusted proxy and shared NAT controls; existing account limits/session finalization and failure accounting not weakened; absent trust config fail-closed for forwarded identity.
- Personnel success + seed failure still warning, not retry-able failed personnel commit; secrets absent in logs/evidence. Shared gates and fresh review; no live seeding, reset, flag/settings change.

### [x] [#P107M1T05] Complete atomic roster and history-safe personnel lifecycle

```yaml
task:
  id: P107M1T05
  tier: CONTROLLED
  depends: [P107M1T04]
  owns:
    - src/actions/period.ts
    - src/actions/users.ts
    - src/actions/teams.ts
    - src/lib/db/users-admin.ts
    - src/lib/db/teams-admin.ts
    - src/lib/db/evaluations-admin.ts
    - src/lib/db/evaluations-write.ts
    - src/lib/evaluator-resolver.ts
    - src/types/index.ts
    - src/types/database.ts
    - src/components/settings/TeamsRolesTab.tsx
    - supabase/migrations/20261008000200_p107_roster_personnel.sql
    - tests/p107-roster-personnel.test.mjs
    - tests/fixtures/p107/roster-personnel/
  locks: [KURABE_SOURCE_CONTRACT, KURABE_SCHEMA_CONTRACT]
```

Goal: L3/L6/L7/P3 prevent truncated period creation/read and let staff with only historical references deactivate without losing history or orphaning active assignments.
Interface: complete-reader has stable pagination + count/ID manifest; existing bounded viewport reader stays bounded. Period atomic RPC validates exact current roster/role/team/assignment graph under lock, not just a partial client payload. Reuse evaluation roster as identity baseline; capture missing future historical label fields only via bounded new immutable schema, old missing values explicit unknown.
Changes: paginate full roster/period/evaluation/assignment/version consumers with stable ID order; bound assignment filters to period; failure/page/count mismatch denies complete-success. Preserve one atomic create transaction and TypeScript resolver. Validate re-read graph/count/IDs with deterministic graph/period locks to prevent pre-read churn. Allow soft-deactivation only when no live actionable dependency remains; keep FK/evaluator attribution and active viewer history. Use existing Manager appointment UI; make missing Leader/SubLeader explicit, no automatic replacement.
DoD:
- 0/1/cap boundary/1500 synthetic users exact expected IDs and role-round assignments; no truncated count/list/export or silent missing rows; mid-pagination failure gives error, not empty success.
- create/create yields one Active; roster churn/create and assignment/deactivate races commit one valid graph or deny with zero partial write. Historic inactive/transferred users stay in old roster; inactive actor cannot login/write.
- Historical-only deactivate allowed; active assignment orphan/self-delete/FK erase denied. Appointed multi-team and unassigned SubLeader contract preserved; UI empty/loading/error/retry verified where touched.
- Exact new candidate SQL apply/rollback/reapply and full graph digests; shared gates + fresh review. No live migration/deactivate/cleanup.

### [x] [#P107M1T06] Approved-only official results and immutable historical summaries

```yaml
task:
  id: P107M1T06
  tier: CONTROLLED
  depends: [P107M1T05]
  owns:
    - src/actions/reports.ts
    - src/actions/dashboard.ts
    - src/actions/read.ts
    - src/actions/ai.ts
    - src/actions/ai-summary.ts
    - src/actions/chat.ts
    - src/lib/db/evaluations-admin.ts
    - src/lib/db/evaluation-display-admin.ts
    - src/lib/db/evaluation-history-admin.ts
    - src/lib/evaluation-result-projection.ts
    - src/lib/export.ts
    - src/lib/anomaly.ts
    - src/lib/ai-context.ts
    - src/types/index.ts
    - src/components/reports/
    - src/components/dashboard/DashboardDataLayer.tsx
    - src/components/dashboard/DashboardHeavySection.tsx
    - src/components/dashboard/DashboardLightSection.tsx
    - src/components/dashboard/PeriodSummary.tsx
    - src/components/dashboard/AnomalyAlertCard.tsx
    - src/components/charts/SkillGapRadar.tsx
    - src/components/charts/LazySkillGapRadar.tsx
    - src/components/settings/PeriodsTab.tsx
    - tests/p107-official-results.test.mjs
    - tests/targeted-lazy-load.test.mjs
    - tests/fixtures/p107/official-results/
  locks: [KURABE_SOURCE_CONTRACT]
```

Owns amendment 1 (canonical control, 2026-10-09): adds `src/components/charts/LazySkillGapRadar.tsx` and `tests/targeted-lazy-load.test.mjs`. Reason: this task's goal requires the dashboard heavy DTO to stop carrying `rawEvaluations`/`rawCriteriaGroups`; the lazy radar wrapper forwards those two raw props to `SkillGapRadar`, and `tests/targeted-lazy-load.test.mjs` pins both the wrapper's raw prop contract and `DashboardHeavySection` passing `data.rawEvaluations`/`data.rawCriteriaGroups`. Leaving them unchanged would force the radar to render permanently empty (an in-scope functional regression) or leak the raw payload. Runner reported this exact conflict and wrote nothing. Task ID/tier/goal/DoD/DAG/locks unchanged; no implicit write permission beyond those two files.

Goal: L1/L2/L4/N3/P4–P6 make reports/dashboard/export/AI agree on authoritative results without raw draft payloads or historical drift.
Interface: NEW server result projector reuses versioned display/batched snapshot loaders: result (Approved persisted final fields), progress (full roster status), coverage (approved/total/invalid/legacy), snapshot basis and role/config breakdown. Dashboard heavy public DTO drops rawEvaluations/rawCriteriaGroups; wire all consumers including AI/chat in this SAME task, preserving authorized operational non-result features as separate minimized DTOs. Do not leave compatibility code leaking raw data.
Changes: official average/grade distribution/high-grade rate/top exclude non-Approved; 0 valid, missing/inconsistent final error/unknown; no latest-round fallback. Use evaluation team/role and immutable roster/config snapshot, not active users/current criteria. Settings period counts use light aggregate, not full all-period notes. Request effective authorized filters server-side. Return no invented percentage for mixed incompatible scoring bases; keep role/config breakdown and sample count rather than new cross-role scoring/ranking policy. Freeze-incomplete records remain visible in progress, not result denominator. Keep layout/assets, adjust only truthful labels/coverage and affected interfaces.
DoD:
- Golden independently calculated values/IDs for five roles/all statuses/0/null/legacy/missing version/mixed config; Approved-only count/rate/average/top and pending coverage identical across report/dashboard/export/AI.
- Rename/delete/max/grade config change, team/role transfer, deactivation do not reinterpret closed valid history; legacy labels/bases remain explicit unknown, no broad backfill.
- Browser mobile+desktop sees approved/total and frozen unfinished; empty result distinct from genuine 0 or failed reader; retries/stale filters don't leak old data. Unauthorized snapshot metadata denied.
- Network DTO has no raw round scores/notes only needed to draw charts; shell/light stay independent of heavy/error. T03 boundary remains intact; shared gates + fresh review.

### [x] [#P107M1T07] Return/resubmit snapshots and resident period coherence

```yaml
task:
  id: P107M1T07
  tier: CONTROLLED
  depends: [P107M1T06]
  owns:
    - src/actions/evaluation.ts
    - src/actions/period.ts
    - src/actions/read.ts
    - src/lib/evaluation-transaction-rpc.ts
    - src/lib/db/evaluations-write.ts
    - src/lib/db/evaluation-period-write-guard.ts
    - src/contexts/AuthContext.tsx
    - src/hooks/use-db.ts
    - src/components/dashboard/PeriodActions.tsx
    - src/components/modals/PeriodModal.tsx
    - src/components/layout/PeriodSelector.tsx
    - src/components/settings/PeriodsTab.tsx
    - src/app/evaluations/[id]/EvaluationPageClient.tsx
    - src/app/evaluations/[id]/compare/ComparePageClient.tsx
    - supabase/migrations/20261008000300_p107_lifecycle_coherence.sql
    - tests/auth-context-poll.test.mjs
    - tests/p107-lifecycle-coherence.test.mjs
    - tests/fixtures/p107/lifecycle-coherence/
    - src/hooks/use-evaluation-page-state.ts
    - src/lib/evaluation-period-scope.ts
    - src/lib/db/evaluation-period-scope-admin.ts
    - src/app/evaluations/[id]/page.tsx
    - tests/p107-evaluation-loading.test.mjs
  locks: [KURABE_SOURCE_CONTRACT, KURABE_SCHEMA_CONTRACT]
```

Owns amendment 1 (2026-10-09): owner requests autonomous decision and completion after the browser blocker. Add only the evaluation hydration/scope seam above and a focused regression producer. Preserve existing task ID/tier/goal/DoD/DAG/locks; no waiver. Diagnose the actual loading gate and harness interference first; the previous static exclusions and React Query key hypothesis are not proof of a product defect. Change product source only when a reproducible trace demonstrates the cause. Preserve failed evidence; unique disposable run roots and exact process teardown are required. No push/deploy/production/paid application AI authority is added.

Goal: N1/N2/N6/L5 eliminate stale provider period state and return/config/resubmit collision while preserving closed firewall and no-blink scope polling.
Interface: authenticated period metadata refresh shared by create/close/delete-empty/select/login; reconcile selected cookie/provider/server props/scoped keys with late-response epoch protection. Active-only default detail/compare remains; explicit historical read separate.
Changes: atomic reset/reconcile only mutable returned/next-round content/version references; preserve submitted/closed history and genuine conflicting concurrent edits. Clean transition context on every success; failure rollback unchanged. Refresh provider after period mutation, then scoped invalidate/router refresh; do not reintroduce background clearBeforeRender=true or global cache. Close unfinished allowed with explicit frozen label; no Excluded/reopen.
DoD:
- Real actions/browser complete create→save→submit→next→return→resubmit→approve→close→new-period across five role flows; V1 submit→return→V2 config→resubmit works without CONFLICTING_NEXT_ROUND and leaves immutable history intact.
- close/save, return/submit, version-edit/resubmit, duplicate/response-loss retries yield valid committed graph or denial/rollback; no partial state or leftover transition context.
- Same resident session and second tab see correct create/close/select/delete-empty period without F5; no Active/multiple Active/read-error explicit; stale form after close denied; cookie/provider/server props consistent.
- Poll unchanged scope no blink; logout/revoke/late response cannot restore old payload; local loading/error/retry states and mobile+desktop console/network checked. Shared gates + fresh review; no production lifecycle mutation.

### [x] [#P107M1T08] Bounded authorized AI and visible audit failures

```yaml
task:
  id: P107M1T08
  tier: CONTROLLED
  depends: [P107M1T07]
  owns:
    - src/actions/ai.ts
    - src/actions/ai-summary.ts
    - src/actions/chat.ts
    - src/lib/ai-context.ts
    - src/lib/ai-limit.ts
    - src/lib/ai-governance.ts
    - src/lib/ai-prompts.ts
    - src/lib/audit.ts
    - src/components/reports/BatchResultMessageModal.tsx
    - tests/p107-ai-audit.test.mjs
    - tests/fixtures/p107/ai-audit/
  locks: [KURABE_SOURCE_CONTRACT]
```

Goal: S12/S13/N5/N8 prevent unbounded chunk/cost and hidden returned audit errors; preserve T03/T06 authorized immutable projection.
Changes: validate finite integer offset>=0 and limit 1..5 (current default 5); bound provider concurrency to 2 per chunk, cancel/timeout outcomes and input/prompt size before provider. Outside-scope/not-found same safe response; minimize/pseudonymize prompt and retain existing injection/governance checks. Keep current quota window/limits/unit compatible; every caller's reserve/consume/refund/duplicate semantics explicitly tested. Changing billing unit or quota policy is NOT implicit: record cost per chunk/item and gate any new unit separately. Check Supabase returned error plus thrown error, emit redacted structured diagnostics; audit failure after business commit must not return retry-able business failure or silently re-run mutation.
DoD:
- Negative/NaN/Infinity/fraction/huge offset+limit, duplicate target/request, canceled/timeout/provider failure, quota concurrency/idempotent terminal outcomes; at most bound active work. No paid provider calls for local PASS; deterministic provider-boundary tests explicitly supplemental to real DB/auth, not fabricated real-provider evidence.
- AI/chat/report detail uses approved result snapshots/authorized operational DTOs, score 0 survives; unauthorized draft/history never reaches prompt; out-of-scope non-enumerating response.
- Returned error/thrown error both observable; committed-business outcome and audit diagnostic separate, no double-write on retry; token/hash/code/private text redacted.
- Shared gates + fresh review. No quota redesign/new migration/paid traffic without scoped amendment+approval.

### [x] [#P107M1T09] Same-fixture performance measurement and bounded attribution

```yaml
task:
  id: P107M1T09
  tier: STANDARD
  depends: [P107M1T08]
  owns: [tests/perf/benchmark-harness.mjs, tests/perf/perf-report.json, tests/p107-perf-provenance.test.mjs]
  locks: [MACHINE_EXCLUSIVE]
```

Goal: P1–P9 verify current identity and measure useful data/payload/query improvements after correctness; no speedup from stale/narrow checked-in reports.
Changes: reuse existing actual-local authenticated production-build harness; candidate BASE/tree/source SHA distinct from generated report SHA; keep fixture/roles/routes/viewports/cold+warm/regions/network identical for before/after. Baseline retained before ANY later performance edit. Record shell/light/heavy/full, request counts/bytes, action/DB timing, 5 samples per point, median/p95. FCP/LCP missing entry UNKNOWN. Seed same large+historical correctness fixture in both lanes; bind ports/owned services, not live production.
DoD:
- Numerical rows/results/coverage/ACL/lifecycle parity before timing verdict; effective fixtures identical, exact provenance and run-count equation checked from runtime output.
- LAN/loopback dataComplete median <1000ms for defined measured routes; submit p95 <800ms only in a specified low-RTT measured lane. Failure retained as residual, not a waiver or fabricated PASS.
- This task owns harness/report ONLY. Material hot-path optimization requires amend owning task/scope and tier, baseline evidence, at most two bounded fixes, full affected correctness/review requalification. No hidden region/index/cache/service change; historical report isn't current candidate evidence.
- Shared gates remain valid; machine ownership/headroom and cleanup read back. Network/console errors fatal except proven navigation cancel; production perf remains UNKNOWN.

### [x] [#P107M1T10] Integrated exact-candidate E2E and release readiness

```yaml
task:
  id: P107M1T10
  tier: CONTROLLED
  depends: [P107M1T09]
  owns:
    - tests/integration/p107-qualification.mjs
    - tests/browser/p107-qualification.mjs
    - tests/fixtures/p107/qualification/
    - tests/integration/confirmation-matrix.mjs
    - tests/operations/ci-suite-manifest.mjs
    - tests/operations/p103-required-cases.mjs
    - tests/operations/production-smoke.mjs
    - scripts/verify-release.mjs
    - .github/ci/confirmation-runtime.mjs
    - .github/workflows/ci.yml
    - tests/p107-qualification-contract.test.mjs
  locks: [MACHINE_EXCLUSIVE]
```

Goal: one frozen integrated candidate proves all accepted functional/negative/concurrency/browser/rollback gates. No catch-all feature fixes; return product defect to owning task.
Interface: NEW `p107-qualification` suite exported run(context), wired through existing verifier/manifest and CI producer fingerprint. Reuse source-supported actions/routes (`/evaluations/{employeeId}`), preserve old suites; no absolute host executable source dependency, fake session adapter or production env baked in.
Changes: wire full master-plan matrix with real assertions/readback, stable disjoint fixture IDs, production-build smoke and CI-parity negative controls; exact ownership crash-safe teardown. Extend only existing harness/CI plumbing needed by this phase, not replace infrastructure.
DoD:
- Shared root gates and `node scripts/verify-release.mjs --suite p107-qualification --tier authenticated --evidence "$EVIDENCE/p107.json"` PASS with exact required cases, real local HTTP/Next/browser + actual Auth/PostgREST for ACL. Existing confirmation-matrix/production-smoke still PASS.
- Integrated read+write policy, large roster, Approved-only/historical zero/null/mixed-basis states, five flows, all named races, two-tab provider freshness, AI/audit error paths and mobile/desktop DOM/network cases proved; no source-only case relabelled live.
- All candidate SQL catalog/ACL/function/trigger fingerprints bound to artifact; rollback/reapply graph preservation; no production reads/writes/migrations without separate approval, production writes/migrations 0/0.
- Final exact-candidate fresh independent CONTROLLED review PASS, no blocking findings; a changed candidate invalidates review. Preserve first failure; fixture survives until full matrix, then cleanup exact owned IDs/processes/containers/networks/volumes/ports and readback residue 0.
- Canonical completion, tick [x], Git task commits and control state require subsequent authorized execution/publish path. Deliver local readiness evidence + residual/owner-gated live actions; no automatic push/remote CI/DB apply/deploy.

### [x] [#P107M1T11] CI qualification lane: browser drift diagnostics + robust frozen-candidate restore

```yaml
task:
  id: P107M1T11
  tier: CONTROLLED
  depends: [P107M1T10]
  owns:
    - tests/browser/p107-qualification.mjs
    - .github/workflows/ci.yml
  locks: [MACHINE_EXCLUSIVE]
```

Goal: make the CI `p107-qualification` lane deterministic. CI run 37962217323 failed there although the same commit passes 115/115 in a fresh local clone. Changes: surface the browser module's real failure reason on stdout/stderr (it is currently only written into evidence, so CI logs show nothing); restore toolchain drift robustly for a FROZEN candidate (HEAD is the reviewed commit, so restore tracked files to HEAD and drop untracked non-ignored drift) instead of asserting a clean tree after touching only AGENTS.md/CLAUDE.md; add a CI pre-step that reports `git status` before the qualification suite.
DoD:
- `node scripts/verify-release.mjs --suite p107-qualification --tier authenticated` PASS on the frozen candidate locally, and the CI run for the published commit is green.
- No product/policy change; no waiver; production writes/migrations 0/0.

### [x] [#P107M1T11b] CI qualification lane: non-/tmp runtime root for the browser producer

```yaml
task:
  id: P107M1T11b
  tier: CONTROLLED
  depends: [P107M1T11]
  owns:
    - tests/browser/p107-qualification.mjs
  locks: [MACHINE_EXCLUSIVE]
```

Goal: root cause of CI run 37966194351 — the delegated producer's `resolveRuntimeRoot` refuses a runtime root under `/tmp`
(`REFUSE_TMP_RUNTIME_ROOT`), and the CI runner's `os.tmpdir()` resolves under `/tmp`, so the producer blocked at its
first case (`src:frozen-head-expected-sha`) with a CLEAN worktree. The module never passed `--runtime-root`.
Change: pin a task-owned runtime root beside the evidence path (`${EVIDENCE}.runtime`), which is outside `/tmp`.
DoD: p107-qualification PASS locally on the frozen candidate and the CI run for the published commit is green; no
product/policy change; production writes/migrations 0/0.

### P107 finding disposition and non-goals

- S1 historical public→private: containment already done; monitor history residual, no task visibility flip/automatic rotation.
- S2/S3 default+optional policy preserved in T04; S4/S9/S10/T5 behavior-qualified, not speculative policy change. S5–S8/S11/N4/N7 T03; L3/L6/L7/P3 T05; L1/L2/L4/N3/P4–P6 T06; N1/N2/N6/L5 T07; S12/S13/N5/N8 T08; N10 T04; N9 T01→T02.
- P1–P9 measurement/provenance T09; P7 concurrency conditional after seed CAS; P8 indexes/region optional owner-gated, not automatic. L8 dead tags remove only if T07 inventory proves unused and within owns. T1–T4 readiness T01 + exact qualification T10, existing authenticated CI/transactional flag preserved. T6 broad artifact cleanup deferred.
- Stage order is deliberately serial on shared Pi5 and overlapping source interfaces. No parallel_safe field, no phase split or new dispatcher. Do not infer production acceptance from local completion.

## P108 — three independent criteria sets (M1 build, M2 trial-data track)

`WBS_STATUS=LOCAL_EXECUTION_AUTHORIZED`. Plan authority: `.ai/MASTER_PLAN.md` § P108 at `45d9562` (12 task IDs/DAG retained). Owner authorizes local T01, T03–T10 with synthetic fixtures, Agy `gemini-3.8-flash-high`, fresh CONTROLLED reviewer `opencode-go/deepseek-v4.1-flash`; no fallback without approval. Checkboxes stay pending until exact verified integration. Register only these nine tasks under `control.lock` after canonical activation readback. T02, M2T01 and T11 remain PLANNED and are not registered. T01 production facts remain UNKNOWN; signed-manifest checks remain release gates, not synthetic PASS. No push/deploy/Vercel changes, production reads/writes/migrations/import/deletion, real personnel test data or production AI calls. G1/D1/D2/D3 remain undecided. This local scope overrides stale P107 runtime metadata; no old active process/worktree was observed during activation preflight.

### Shared execution envelope — applies to every P108 task

- Task WT = `/home/pi5/projects/kurabe-task-wts/<ID>`; candidate WT = `/home/pi5/projects/kurabe-integration-wts/<ID>`; evidence = `/home/pi5/hermes-artifacts/kurabe-p108/<ID>/evidence.json` + `runner-report.md`. Dispatch `BASE_SHA` = canonical HEAD at dispatch, with dependencies integrated.
- One Runner/verifier at a time on Pi5. Runners never edit `tasks.md`, `AGENTS.md`, `HANDOFF.md`, `.ai/*`, `.state/*`. A discovered consumer outside `owns` requires a Mika owns amendment before any write.
- Every code task: matching behavioural tests + wiring; `npm test`, `npm run lint`, `npm run typecheck`, isolated `npm run build` (no `.env.local`), `node scripts/scan-source-secrets.mjs`, scope/diff checks. Exact-candidate checks are run by Mika. CONTROLLED tasks need a fresh selected-review PASS for that exact candidate.
- DB work: one new migration only; never edit applied migrations. Disposable PostgreSQL / local Supabase stack, real RPCs, synthetic fixtures, exact run-owned cleanup with residue readback. No fake auth/API adapters, no disabled triggers.
- Production access, credentials, deletion, push, deploy and import are **only** in P108M1T01 (read-only), P108M1T11 and P108M2T01, each behind explicit owner approval.
- Push freeze: a push to `main` auto-deploys Vercel production. From the first P108 code commit on canonical `main` until T11 step 3 (migration applied and read back), `main` is not pushed, not even for control-only commits; otherwise the new app would run on the old schema, which is never tested.
- Keep unchanged: negative points, arithmetic total, grade bands, P107 workflow and lifecycle, Approved-only results. KPI policy (D2) unchanged unless approved.
- STOP: unresolved scope/consumer/catalog identity, unsigned business data needed for a DoD, failed rollback qualification, or any production need without approval. Preserve the first failure.

### [x] [#P108M1T01] Preflight: source/runtime inventory + production read-only snapshot

Local source-only close: evidence `/home/pi5/hermes-artifacts/kurabe-p108/P108M1T01/evidence.json`, SHA-256 `5297396778235a7cb6ceb92ab5a5b1e2825b0726f539ea1e440f76b5fac17882`, source `e623a5d998c261214fc4c5fc65669028d759d7f7`. Fresh reviewer `reviewer/opencode-go/deepseek-v4.1-flash`, session `20261017_092742_54b4bc`, canonical checker PASS (`review-3/gate-check.log`). Thirty source consumers mapped/flagged; no application delta. Production facts UNKNOWN_NOT_AUTHORIZED and mandatory at T11/M2T01; production reads/writes/migrations/deploy/AI calls = 0. Review-1 findings and review-2 malformed transport retained; repaired source inventory accepted, no DoD waiver.

```yaml
task:
  id: P108M1T01
  tier: CONTROLLED
  depends: []
  owns: []
  locks: [KURABE_SOURCE_CONTRACT]
```

Goal: Mika-only read-only prerequisite that fixes the migration and consumer contract and replaces live `UNKNOWN`s with evidence.
Changes (no product writes):
- Repo inventory: every reader/writer/consumer of criteria, set, role snapshot and snapshot versions (starting from MASTER_PLAN P108.2); exact constraint/index names on criteria and version tables; callers of `draftResultMessageAction`.
- Production read-only, aggregates and IDs only, owner-approved:
  - `server_version` and extensions; constraint/index inventory;
  - effective privileges (`has_table_privilege`) of `anon`, `authenticated` and `service_role` on the live criteria tables (`criteria_groups`, `criteria`, `criterion_levels`, `criterion_audiences`) and the version tables created in `20260907000600_criteria_config_version.sql:49-108`, including privileges inherited or granted to PUBLIC (with the actual grantee from the table ACL); RLS flags, policies, triggers, function owners/SECURITY DEFINER, RPC EXECUTE grants; Auth signup setting;
  - active criteria version (number, id, counts, codes, normalized duplicates) and empty groups in past versions;
  - periods (any `active`?) and rounds by version/status;
  - `evaluation_history_labels` and `evaluation_responses` counts; live grade bands vs set maxima (190/175/Worker TBD); migration ledger names;
  - Supabase CLI / `pg_dump` availability;
  - trial-data candidate inventory for P108M2T01: counts by period, rounds, labels, `ai_summaries`.
DoD:
- Evidence JSON with source SHA and production identity (project ref), redacted (no personal fields beyond IDs/counts); hash read back.
- Every consumer mapped to an owning task, or flagged as an owns amendment.
- Live facts that change migration preflight (duplicates, empty groups, PG version, constraint names) are recorded as inputs for T03/T11.
STOP / partial close: if production read access is not approved, T01 closes on the repo inventory with live facts recorded as `UNKNOWN` (offline work is not blocked, same rule as P107M1T01). The live section is then mandatory inside T11 (before migration) and M2T01 (before any disposition) under their own approvals.

### [ ] [#P108M1T02] Workbook manifest + business sign-off

```yaml
task:
  id: P108M1T02
  tier: STANDARD
  depends: []
  owns:
    - scripts/p108-criteria-manifest.mjs
    - db/seed/p108-criteria-manifest.json
    - tests/p108-criteria-manifest.test.mjs
  locks: []
```

Goal: deterministic, reviewable source manifest of 18 groups / 93 criteria from `TCDG2026.xls`, encoding anh's G1 answers.
Execution (normal STANDARD path): dispatched only after anh's G1 answers are recorded in `.ai/DECISIONS_LOG.md`, and Mika copies those answers into the brief. Mika re-verifies the workbook SHA and gives the Runner the absolute read-only input path `/home/pi5/projects/kurabe/TCDG2026.xls`. The Runner reads it in place and never copies, moves, edits or commits it. Runner writes only `owns`; Mika verifies and integrates. Until then T03–T10 use the synthetic manifest.
Changes:
- Read-only extractor using the existing `xlsx` dependency. It verifies the workbook SHA and emits the manifest: set, doc code, group code/name, criterion code (letter + VI column-A number), VI label, JA label, source row, ordered levels (label, points), default level.
- Every G1 item (MASTER_PLAN P108.1) is encoded exactly as answered, with the decision reference; nothing guessed. No `-` becomes a level without its per-criterion answer.
- Every group, criterion and level carries a fixed UUIDv5 (RFC 9562, `node:crypto` SHA-1, no new dependency), using one namespace constant recorded in the manifest and the name `p108:<set>:group:<code>` / `p108:<set>:criterion:<code>` / `p108:<set>:level:<criterion code>:<sort index>`. Sets never share a UUID.
DoD:
- Extractor is deterministic (same SHA → same manifest bytes and UUIDs; a second run is byte-identical).
- Test asserts: 6/6/6 groups; 33/30/30 criteria; Leader maximum 190; Staff maximum 175; unique codes per set; source-row provenance for every level.
- Sign-off = anh confirms the verified manifest; Mika records its SHA-256 in `.ai/DECISIONS_LOG.md`. The manifest file itself carries no `signed` flag, so its bytes stay deterministic.
STOP: G1 answers missing or ambiguous ⇒ not dispatched. T11 import is blocked until the manifest SHA is recorded.

### [x] [#P108M1T03] DB contract: set_key schema, Active lock, writer RPC, rollback

Local close: candidate `29adeca8346d6b291288b327c6067578333156f2` on base `34580068a3827cae0b0750a41d713379d3fa6055`. Exact-candidate gates PASS (`/home/pi5/hermes-artifacts/kurabe-p108/P108M1T03/final-candidate-gates/gates.json`, SHA-256 `575133a58f3c65c24cafab05f4e0615a32068773b7eea023fd4936ac3f62cfce`): disposable PG17 producer 39 cases, legacy lane 29 cases, npm test 77/77, lint, typecheck, isolated build, secret scan 0 findings. Fresh reviewer `reviewer/opencode-go/deepseek-v4.1-flash`, session `20261017_130214_5291ce`, canonical checker PASS (`final-review-1/gate-check.log`). Closed under owner-approved recovery exceptions after HALT; failure_count=2 retained; all failed snapshots/evidence retained. Known cosmetic: contract test trailing EOF blank line. Push/deploy/production = 0.

```yaml
task:
  id: P108M1T03
  tier: CONTROLLED
  depends: [P108M1T01]
  owns:
    - supabase/migrations/20261017093100_p108_criteria_sets.sql
    - db/rollback-p108-criteria-sets.sql
    - tests/integration/criteria-config.mjs
    - tests/integration/p108-criteria-sets.mjs
    - tests/p108-criteria-sets-contract.test.mjs
    - src/types/database.ts
  locks: [KURABE_SOURCE_CONTRACT, MACHINE_EXCLUSIVE]
```

Goal: implement MASTER_PLAN P108.3–P108.4 at the database boundary. Runs entirely on disposable databases from the repo baseline (T01 may close with live facts `UNKNOWN`); it never needs production access. Live facts found later re-check the migration preflight before T11.
Changes:
- Migration: preflight; `set_key` columns; `UNIQUE(id, set_key)` + composite FK; active-only normalized unique indexes; version-table `set_key` with partial uniques; drop the four legacy unique constraints located by definition.
- Replace `validate/get/save_criteria_config`:
  - lock order: `LOCK evaluation_periods SHARE` → advisory → Active check → READ COMMITTED assert;
  - set rules; immutable set per UUID; server-derived audience; temp tables keyed by `(set_key, code)`;
  - canonical checksum + no-op on unchanged content.
- Version row counts (`group/criterion/level/audience_count`, NULL for legacy) written by the save RPC.
- Direct-write ACL: first run negative tests for `anon`, `authenticated` and `service_role` against the live and version criteria tables, using effective privileges (inherited and PUBLIC included). Only where a write actually succeeds, revoke that DML from its actual grantee (the role, or PUBLIC) on that table, in this migration. No new trigger, no blanket revoke. If nothing succeeds, there is no ACL change.
- Rollback artifact with (a) guarded revert-import and (b) schema rollback.
- Update the existing `tests/integration/criteria-config.mjs` legacy payloads to the new contract; keep its stale/invalid/concurrency cases.
Constraints: P107 writer untouched; diff replaced function bodies against `20260907000600_criteria_config_version.sql`; no `NOT VALID` check; RPC EXECUTE grants unchanged (table DML only as above).
DoD:
- All schema/RPC and concurrency cases of MASTER_PLAN P108.6, on a disposable DB with two real connections and `pg_locks` wait proof.
- Legacy catalog fixture: migration applies; legacy versions read unchanged; legacy duplicate active code rejected.
- P107 save/submit/return pass on a three-set catalog.
- Direct-write negative tests: after the migration every proven write path fails for its role (also while a period is active); the RPC still saves; a save writes the correct version counts.
- apply → schema rollback (b) → reapply pass; apply → import(synthetic) → revert-import (a) pass; (b) after import is refused with zero mutation.
- Root gates pass.
STOP: any preflight mismatch with T01 live facts ⇒ amend the plan before changing guards.

### [ ] [#P108M1T04] Import mechanism + readback verifier

```yaml
task:
  id: P108M1T04
  tier: CONTROLLED
  depends: [P108M1T03]
  owns:
    - scripts/p108-import-criteria.mjs
    - tests/fixtures/p108/synthetic-manifest.json
    - tests/integration/p108-import.mjs
  locks: [MACHINE_EXCLUSIVE]
```

Goal: one auditable way to load a manifest through `save_criteria_config` (never direct INSERT).
Changes:
- Script modes: `--dry-run` (payload + per-set canonical hashes) and `--apply --expected-version N`.
- `--apply` refuses: a manifest whose SHA-256 differs from `--signed-sha` (supplied by Mika from `.ai/DECISIONS_LOG.md`), unless the target is a declared disposable DB; any `active` period; a CAS mismatch.
- `--verify` reads back counts per set, canonical hashes, one audience per criterion, active version.
- Credentials only from the existing env loading, never printed.
DoD:
- The payload uses only manifest UUIDs; a payload node without an id is refused before the RPC call.
- On the disposable DB with the legacy fixture: dry-run and apply produce exactly 18/93 from the synthetic manifest; hashes equal the dry-run; every live and version row has the manifest UUID; second apply with the same content = no-op (same `version_no`, no UUID changed); refusal cases proven.
- Root gates pass.
Out of scope: running against production (T11).

### [ ] [#P108M1T05] Shared set contract + complete snapshot reader

```yaml
task:
  id: P108M1T05
  tier: STANDARD
  depends: [P108M1T03]
  owns:
    - src/lib/criteria-applicability.ts
    - src/types/index.ts
    - src/lib/db/criteria.ts
    - src/lib/db/criteria-admin.ts
    - src/lib/db/evaluation-display-admin.ts
    - tests/p108-snapshot-reader.test.mjs
  locks: [KURABE_SOURCE_CONTRACT]
```

Goal: the one TS contract every consumer uses, plus a history loader that cannot return a partial snapshot.
Changes:
- `CriteriaSetKey`, role→set and set→audience helper; `setKey` on `CriteriaGroup`/`Criterion` (NULL = legacy); `get_active_criteria_config` mapping.
- Snapshot loader: per-version bounded pagination + exact query counts for groups/criteria/levels/audiences. Rows received < counted (truncation) ⇒ `unavailable`; rows ≠ stored version counts (P108 versions) ⇒ `unavailable`; legacy versions (no counts) ⇒ structural check only (criterion with zero levels ⇒ `unavailable`), documented as a limitation.
- Empty group (zero criteria) is valid and no longer invalidates a complete version.
- Display DTO filters every version (legacy and P108) to the evaluation's role snapshot and drops empty groups.
DoD:
- Tests: more than 1,000 level rows across at least 3 versions read completely on the local Supabase stack (real `max_rows = 1000`); truncation ⇒ `unavailable`; a level row deleted as `postgres` from a P108 version ⇒ `unavailable`; a valid empty group stays available; legacy multi-audience version filtered by role exactly as before for its audience; P108 version shows only the subject set; audience→role mapping verified for all 93 synthetic criteria.
- Root gates pass.

### [ ] [#P108M1T06] Criteria admin: 3 tabs, set-scoped CRUD, Active lock UI

```yaml
task:
  id: P108M1T06
  tier: STANDARD
  depends: [P108M1T05]
  owns:
    - src/actions/criteria.ts
    - src/hooks/use-db.ts
    - src/app/criteria/page.tsx
    - src/components/modals/CriteriaModal.tsx
    - src/components/modals/CriteriaGroupModal.tsx
    - src/components/settings/GradeBandsTab.tsx
    - tests/p108-criteria-admin.test.mjs
  locks: [KURABE_SOURCE_CONTRACT]
```

Goal: Manager edits one set at a time with the simplest flow.
Changes:
- Leader/Staff/Worker tabs; groups and React keys by UUID; per-set maximum shown.
- Group select limited to the active set; create carries `set_key`; delete limited to the set.
- Remove `updateCriterionAudiencesAction`, its hook and the checkbox UI.
- Save disabled when unchanged.
- Legacy catalog (no `set_key`, before import) renders read-only with a "waiting for import" notice; Save disabled.
- Read-only banner + disabled actions while a period is active, from the same server signal; the SQL rejection surfaces as a clear message.
- STALE CAS → reload message.
DoD:
- Tests: actions send set-scoped full config; no audience path remains (source contract); cross-set group id rejected client- and server-side; adding a Leader criterion leaves the Staff/Worker payload byte-identical.
- Browser check at 390 and 1440 on the local stack.
- Root gates pass.

### [ ] [#P108M1T07] Evaluation + compare use the subject role snapshot

```yaml
task:
  id: P108M1T07
  tier: STANDARD
  depends: [P108M1T05]
  owns:
    - src/hooks/use-evaluation-page-state.ts
    - src/app/evaluations/[id]/compare/ComparePageClient.tsx
    - src/app/evaluations/[id]/EvaluationPageClient.tsx
    - src/components/evaluation/EvaluationHeader.tsx
    - src/components/evaluation/ResultCard.tsx
    - tests/p108-role-snapshot.test.mjs
    - tests/integration/p108-evaluation-flow.mjs
  locks: [KURABE_SOURCE_CONTRACT, MACHINE_EXCLUSIVE]
```

Goal: every subject-role computation on the evaluation and compare pages uses `evaluation.employeeRole`; the P107 workflow behaves identically on a three-set catalog.
Changes: replace the subject's current `employee.role` with `evaluation.employeeRole` for:
- the criteria loader (`use-evaluation-page-state.ts:349`);
- the compare criteria filter and Draft grade (`ComparePageClient.tsx:190-193,235`);
- max round and the current-round grade (`EvaluationPageClient.tsx:297,317,465`);
- previous-round grade (`EvaluationHeader.tsx:92`) and the grade-band explanation (`ResultCard.tsx:64-66`).
Submitted rounds keep their snapshot score and grade. Evaluator authorization keeps using the grader's real role. No writer/RPC change. The AI call at `EvaluationPageClient.tsx:519-522` is left to T09.
Out of scope (round-count display only, not criteria or score): `EmployeeEvaluationCell.tsx:16`, `TeamDetailMemberCell.tsx:33`.
DoD:
- Disposable Supabase stack with real RPCs: each of the five roles runs its own valid P107 flow (its round count; Return/Resubmit only where P107 allows it), across all three sets.
- Role change after period creation (Leader ↔ Employee, Leader ↔ Worker, Manager ↔ Leader/SubLeader inside one set): criteria, Draft score, grade bands and max round follow the snapshot (client renders = server validates); grader authorization unchanged; forged cross-set criterion UUID rejected.
- Root gates pass.
STOP: a writer incompatibility ⇒ amend scope before touching P107 RPCs.

### [ ] [#P108M1T08] Reports, heatmap, radar: no cross-set mixing

```yaml
task:
  id: P108M1T08
  tier: STANDARD
  depends: [P108M1T05]
  owns:
    - src/lib/evaluation-result-projection.ts
    - src/actions/reports.ts
    - src/components/reports/CriteriaHeatmap.tsx
    - src/actions/dashboard.ts
    - src/components/dashboard/DashboardHeavySection.tsx
    - src/components/charts/LazySkillGapRadar.tsx
    - src/components/charts/SkillGapRadar.tsx
    - tests/p108-report-projection.test.mjs
  locks: [KURABE_SOURCE_CONTRACT]
```

Goal: correct per-set criteria analytics without changing KPI policy.
Changes:
- Keep `configKey = versionId` and the snapshot lookup.
- Criteria-breakdown accumulator keyed by `versionId:groupId` (never merges two sets or two versions; group maximum from that version). Output entries carry set, version, code and snapshot label; heatmap uses those labels and keys.
- Radar computed and shown per set.
- Average, Top 5 and team average logic unchanged; when sets mix they are marked "not directly comparable across sets" (D2 pending). D3: no grade-version note unless approved.
DoD:
- Golden tests: Leader A vs Staff A never merged; Leader A version 1 vs version 2 never merged; legacy single-version period numbers equal the baseline (added DTO fields allowed); a legacy mixed-version fixture (criteria saved while a period was active, which was possible before P108) is split per version, and the golden test records old (merged) vs new (split) values. Stored scores, grades and snapshots are never changed; counts, progress and grade distribution unchanged; radar per set.
- Root gates pass.
Out of scope: per-set KPI/Top 5 (only after D2; Mika amends this task first).

### [ ] [#P108M1T09] AI and export historical correctness

```yaml
task:
  id: P108M1T09
  tier: CONTROLLED
  depends: [P108M1T05, P108M1T07]
  owns:
    - src/actions/ai.ts
    - src/components/reports/BatchResultMessageModal.tsx
    - src/app/evaluations/[id]/EvaluationPageClient.tsx  # sequential handoff after T07 is integrated; only the AI call
    - src/lib/export.ts
    - tests/p108-ai-export.test.mjs
  locks: [KURABE_SOURCE_CONTRACT]
```

Goal: AI and export describe each evaluation with its pinned snapshot and target the exact period.
Changes:
- AI single and batch paths load the pinned snapshot of the Approved round (not the live catalog), filtered to the subject set.
- `draftResultMessageAction` selects the period by id (callers pass id) and receives the subject role snapshot (`EvaluationPageClient.tsx:519-522`); prompt redaction and Approved-only rules unchanged.
- Export inherits the role-filtered DTO; add only what the test proves missing.
DoD:
- Prompt-builder tests without a provider call: legacy and P108 evaluations produce correct criteria detail; two periods with the same name resolve by id.
- Export columns per set.
- AI egress tests from P107 still pass.
- Root gates pass.

### [ ] [#P108M1T10] Integrated qualification

```yaml
task:
  id: P108M1T10
  tier: CONTROLLED
  depends: [P108M1T04, P108M1T06, P108M1T07, P108M1T08, P108M1T09]
  owns:
    - .github/ci/confirmation-runtime.mjs
    - tests/browser/p108-acceptance.mjs
    - tests/integration/p108-old-app-compat.mjs
  locks: [MACHINE_EXCLUSIVE]
```

Goal: one exact integrated candidate proves every MASTER_PLAN P108.6 gate end to end.
Changes:
- The CI runtime can seed a three-set catalog via the import script.
- The browser acceptance suite covers `/criteria` and all five roles.
- Offline baseline app = `701256e` (P107 release, `.ai/DECISIONS_LOG.md` row 57; app source unchanged since then, only control documents). It is a source baseline, not a VERIFIED production SHA.
- Baseline state, baseline app + old schema + legacy catalog: record the golden report/history/score numbers that the later states must match.
- Pre-import compatibility matrix on a migrated, not-yet-imported disposable DB (legacy catalog fixture):
  - baseline app (built in a disposable worktree) + new schema: login, evaluation Draft → Submit → Return → Approved, history, reports, export; criteria save rejected with zero mutation;
  - candidate app + new schema + legacy catalog: the same flows, plus `/criteria` read-only on the legacy catalog with Save blocked in UI and SQL;
  - candidate app after import → revert-import (a): legacy catalog flows still pass.
- Target state, new app + new schema + P108 catalog (synthetic manifest): full acceptance suite, including legacy history, every role's P107 flow, AI prompt/export criteria, and UI + SQL rejection cases.
- Isolated `npm run build` of both the baseline app and the candidate (build compatibility). Vercel deployment itself happens only in T11.
- Catalog-size smoke with the existing perf harness.
DoD:
- Full gate set + browser + DB suites pass on the exact candidate; evidence bound to candidate/base/tree hashes.
- Fresh independent review PASS.
- Signed manifest dry-run (when T02 is signed) equals 18/93 with recorded hashes.
- T10 PASS is technical only (synthetic data). It is not business sign-off (G1) and does not validate cross-set KPIs (D2).

### [ ] [#P108M1T11] Release + cutover (protected, owner-approved per step)

```yaml
task:
  id: P108M1T11
  tier: CONTROLLED
  depends: [P108M1T01, P108M1T02, P108M1T10, P108M2T01]
  owns: []
  locks: [MACHINE_EXCLUSIVE]
```

Goal: execute MASTER_PLAN P108.5 exactly.
Steps, each with its own approval:
0. read-only: the running production deployment SHA (Vercel) and its app source. If it differs from the T10 baseline app, rerun the T10 old-app compatibility on that exact SHA before step 3;
1. backup + restore proof;
2. confirm no active period;
3. migration by name + fingerprint readback;
4. push (a push to `main` auto-deploys Vercel production, so it is its own approval) + deployment SHA + `lykiv.vercel.app` alias + legacy-catalog smoke (rollback here: redeploy the previous app first, then (b));
5. import of the signed manifest + per-set readback;
6. role smoke.
DoD:
- Every step has a readback artifact.
- Rollback stage recorded at each step.
- `HANDOFF.md` and `.ai/DECISIONS_LOG.md` updated by Mika.
STOP: live schema, constraint names, migration ledger, PostgreSQL version or active catalog still `UNKNOWN` (the T01 live section was not run, or failed); restore proof not exact; active period present; T02 unsigned (no unsigned workbook data is ever imported); D2 not decided and the marked cross-set KPI display not approved; D1 not executed or re-decided; any readback mismatch ⇒ stop at the current stage and use its rollback row.

### [ ] [#P108M2T01] Trial-evaluation disposition (owner-gated track)

```yaml
task:
  id: P108M2T01
  tier: CONTROLLED
  depends: [P108M1T01]
  owns: []
  locks: [MACHINE_EXCLUSIVE]
```

Goal: handle trial evaluations before cutover without weakening history guarantees.
Facts:
- No current safe delete path: round DELETE needs a `save_rpc`/`return_rpc` transition context; history labels are `RESTRICT` + immutable; period delete only works for an exactly empty closed period.
Options for D1:
- (A) close the trial period and keep it frozen (zero risk, but its Approved rows appear in employee history and that period's reports);
- (B) a dedicated purge RPC in its own migration: exact owner-approved ID allowlist, new audited `purge_rpc` context recognised by the round guard, refusal if any history label references the IDs, backup + restore proof first, row-count/hash readback.
DoD:
- Owner decision recorded.
- For (B): a separate CONTROLLED implementation task registered first; qualified on a disposable DB; production run approved separately with exact IDs.
- Post-state readback shows no unrelated row changed.
Until anh approves one specific option after the inventory, no immutable-guard change, `purge_rpc`, migration or deletion script is written or registered; option (B) is only a description for the decision.
STOP: IDs ambiguous, history labels present, or no approval ⇒ no deletion.

### P108 dependency order

```text
T01 ──> T03 ──> T04 ─────────────────┐
         └────> T05 ──> T06 ─────────┤
                  ├───> T07 ──> T09 ─┤
                  └───> T08 ─────────┼──> T10 ──┐
                                     │          │
T02 (parallel; business sign-off) ──────────────┼──> T11 (release)
T01 ──> M2T01 (D1 decision/execution) ──────────┘
```

T06–T09 run serially on Pi5 (one Runner). Their `owns` are disjoint except `EvaluationPageClient.tsx`, handed from T07 to T09 through the T07 → T09 dependency.

## Closed / historical record

- P103 execution DAG: **13/13 DONE**.
- P103 final control closure: `f8b60677ab3944721e864ea7ad92ef8908bc024b`.
- CI repair `t_7c812262`: DONE at `ea7b64fb0eafac1406780b0c0632757638d1f8f3`; remote GitHub Actions PASS.
- F06 is closed and excluded from P104.
- Historical evidence remains in Git history and `/home/pi5/hermes-artifacts/kurabe-p103/`.
