# KURABE — full remaining release WBS

## Execution contract

- Owner-approved full decomposition of phases 98–102 + retained 96E. Current owner instruction authorizes Mika-only execution of remaining in-scope tasks; push, deploy, live mutation and other protected actions retain their exact approval gates.
- Current replan baseline `4ab6a1d0061725908849456d7a50e15aa870673a`; preserved control predecessor `4cdef146d74c2c8d2074ea02eea279fb86a4e7b3`; historical planning seed `53b83f1`; active policy is owner's working AGENTS.md mika-v3. Master phase authority: `.ai/MASTER_PLAN.md`.
- IDs/statuses inherited below are preserved unless independently reconciled below; pending tasks remain dependency-gated. All task contracts are refreshed from current integrated source before execution.
- New paths in owns are planned deliverables, not claims that files already exist. Recheck path inventory and applied migration names before dispatch; no placeholder files are created during planning.
- GLOBAL HOLD: P98M2T05 remains BLOCKED after fresh production schema drift/collision preflight. Current product mode is OPTIONAL_PASSWORD; password-capable infrastructure may roll out, but strict enforcement and bulk legacy setup marking remain deferred until explicit owner go-live approval. P98M2T09 forensic reconciliation must PASS, then P98M2T10 must be implemented, independently verified and freshly reviewed before P98M2T05 may receive a new production preflight. Existing P98M2T08 remains DONE and must not be reopened; legacy workspace provenance remains preserved.
- Runtime state READY means registered, not approved/runnable. `depends + owns + locks + state + approval` govern dispatch; shared ownership serializes, no heuristic parallel flags.
- All implementation DoD includes wiring, behavioral tests, Mika independent verify, exact candidate diff/secret checks and root gates `npm run test && npm run lint && npm run typecheck && npm run build && git diff --check`. CONTROLLED also fresh selected review PASS. These are future execution checks, not claims from this planning commit.
- Proposed commands supplied by P98M1T03: `node scripts/verify-release.mjs --suite <name>`; suite names below are exact contracts. Unknown/missing/zero-case suites MUST exit nonzero. Each consumer owns its matching suite file. Wrapper loads DB `tests/integration/<name>.mjs`, browser `tests/browser/<name>.mjs`, or operational `tests/operations/<name>.mjs`, and never silently substitutes a mock for real DB/browser evidence.
- Tests default to synthetic, disposable local data with approved environment; credentials not read by Runner. Network/live/paid modes refuse without explicit approval. Operational tasks executed by Mika, not write-capable Runner; exact command manifests and rollback required before execution.
- Performance tasks may conclude measured no-change only through explicit Mika plan disposition with evidence, not auto-DONE or invented speedups.

## Preserved integrated/source-history IDs

### [x] [#P98M1T01] Framework patch
Recorded canonical `c0af970`, verification bookkeeping `4ed4b41`; owns package.json/package-lock.json; Next 16.3.4. No new upgrade or live readback claimed.

### [x] [#P98M2T01] Password setup schema candidate
Recorded canonical `9bbbe6e`; historical dependency P98M1T02 unresolved in bookkeeping. Preserve completion, reconcile prerequisite before new work.

### [x] [#P98M2T02] Password reset/setup RPC and strict path
Recorded canonical `0fcd1c9`; depends on P98M2T01. Source-contract tests do not certify applied DB or complete UI.

### [x] [#P98M2T06] Temporary passwordless compatibility
Recorded canonical `43b2281`; depends on P98M2T02; owned src/actions/auth.ts + tests/p98-password-setup.test.mjs. Accepted testing exception; no automatic enforcement transition.

### [x] [#P98M3T01] Evaluator NULL-safety candidate
Recorded canonical `de34112`; historical dependency P98M1T02. Candidate only for present planning purposes; live catalog requires proof.

### [x] [#P96T10] Existing lifecycle baseline
Preserve historical PASS_WITH_CONSTRAINT, not a fresh live baseline. Refresh before P96T11; no lifecycle execution claimed.

## Phase 98 — active planning / execution held

### [x] [#P98M1T02] Reconcile production truth and retained task evidence
```yaml
task:
  id: P98M1T02
  tier: CONTROLLED
  depends: []
  owns: []
  locks: [KURABE_CONTROL_RECONCILE, KURABE_PRODUCTION]
```
Goal: Close evidence drift before any new dispatch; Mika-only read-only reconciliation.
Current context: HANDOFF, state's six retained paths, Git P98M2T04 commit 9321c57, existing .tmp/p98-production-catalog.json; no raw HR rows.
Changes: Inspect exact roots/refs/diffs/liveness; preserve unknown residue; reconcile existing catalog provenance and dependency statuses. If approved catalog access is needed, capture single-Active/index/RPC signature+definition/grants/RLS/ledger plus aggregate NULL counts and deployed SHA/flag evidence.
Constraints: No deletion, DDL/DML, secrets exposure or auto-tick from commit title. Required access absent => BLOCKED, not guessed live truth.
DoD: `git status --short --branch`, `git worktree list --porcelain`, `git for-each-ref refs/heads refs/mika`, exact retained-root inventory and scoped SELECT command manifest with successful outputs; every predicate VERIFIED/UNKNOWN/DRIFT. Unknown dependency or liveness blocks follow-on work. Control reconciliation via Mika guard.

Evidence: fresh SELECT/catalog and Vercel readbacks are retained under `/home/pi5/hermes-artifacts/kurabe-execution/`; production deployment is known DRIFT (`c300719` vs canonical `c00545d`), strict password flag is absent, and six retained roots remain preserved (four dirty).

### [x] [#P98M1T03] Qualify isolated DB/browser/security verification lane
```yaml
task:
  id: P98M1T03
  tier: CONTROLLED
  depends: [P98M1T02]
  owns: [scripts/verify-release.mjs, scripts/scan-source-secrets.mjs, tests/integration/harness.mjs, tests/browser/harness.mjs, tests/fixtures/release, tests/verification-harness.test.mjs]
  locks: [KURABE_TEST_CONTRACT, MACHINE_EXCLUSIVE]
```
Goal: Make real behavior verification possible before auth rollout, without waiting for full Phase 99 bootstrap.
Interface/current context: Existing scripts/run-tests.mjs writes .tmp/testbuild; perf harness targets production. New verify-release dispatcher contract defined above.
Changes: Implement local-only target/DB identity guards, synthetic minimal auth/evaluation schema fixture, real PostgreSQL transaction runner, real Chrome browser runner, redacted evidence and bounded cleanup; security scan with seeded detection tests. Wire suite discovery and fail-closed zero-case/unknown-suite behavior.
Constraints: No new hosted Supabase project, production DB clone, daemon or real credentials; environment installation requires separate approval. Minimal fixture is not full-schema parity proof.
DoD: `node tests/verification-harness.test.mjs`; `node scripts/verify-release.mjs --suite harness`; `node scripts/scan-source-secrets.mjs`. Demonstrate actual DB rollback and actual browser assertion, deliberate failure/forbidden remote target detection, no fixture residue; root gates.

### [x] [#P98M2T03] Close setup route and Manager token handoff
```yaml
task:
  id: P98M2T03
  tier: CONTROLLED
  depends: [P98M2T02, P98M2T06, P98M1T03]
  owns: [src/app/setup-password/page.tsx, src/components/account/PasswordSetupForm.tsx, src/components/employees/EmployeesClient.tsx, src/components/layout/AppLayout.tsx, tests/browser/password-setup.mjs]
  locks: [AUTH_UI_CONTRACT]
```
Goal: Reset has a usable one-time setup path, including unauthenticated navigation.
Interface/current context: resetPassword returns setupToken/expiresAt; EmployeesClient discards it; AppLayout redirects non-login guests.
Changes: Add bounded token form/confirmation and safe public route exception; Manager-only transient copy handoff, explicit expiry, replace stale blank-password instructions; consume via existing action, success returns login. Avoid URL query token logging (prefer fragment-to-client input or manual paste), no localStorage token persistence.
Constraints: No auto-email/SMS/paid service; sharing remains manual owner-authorized channel. No broad unauthenticated AppLayout bypass; preserve composition/mobile keyboard behavior.
DoD: `node scripts/verify-release.mjs --suite password-setup`; real browser valid/expired/used/invalid/reset-again cases, no token in logs/referrer/storage, no redirect loop, mobile/keyboard/error/retry; root gates.

### [x] [#P98M2T04] Qualify existing legacy setup migration, do not reimplement blindly
```yaml
task:
  id: P98M2T04
  tier: CONTROLLED
  depends: [P98M2T01, P98M1T03]
  owns: [supabase/migrations/20260905070500_p98_mark_legacy_password_setup.sql, db/rollback-p98-mark-legacy-password-setup.sql, tests/integration/legacy-password-setup.mjs]
  locks: [AUTH_SCHEMA_CONTRACT]
```
Goal: Resolve existing candidate/evidence and prove no-lockout migration contract locally.
Current context: Commit 9321c57 exists but task pending. Mika first verifies exact delta/status; no new task commit if previously-completed DoD is proven, only guarded bookkeeping.
Changes: Add missing behavioral migration/rollback assertions; preflight eligible count, already-set hashes untouched, atomic affected-row assertions. Applied objects may only change via new reviewed forward repair, never edit history silently.
Constraints: No production apply, token generation or bulk credential reset. If repair requires a new migration path, amend owns before Runner dispatch.
DoD: `node scripts/verify-release.mjs --suite legacy-password-setup`; real DB valid/zero/repeated/abort/rollback matrix; preserve credentials and exact counts; root gates and fresh review.

### [x] [#P98M2T07] Unify self-change credential state and session revocation
```yaml
task:
  id: P98M2T07
  tier: CONTROLLED
  depends: [P98M2T03, P98M1T03]
  owns: [src/actions/account.ts, src/lib/auth-password-setup.ts, src/components/settings/AccountTab.tsx, src/types/database.ts, supabase/migrations/20260907000100_credential_change.sql, db/rollback-credential-change.sql, tests/integration/credential-change.mjs, tests/browser/credential-change.mjs]
  locks: [AUTH_STATE_CONTRACT]
```
Goal: Correct state transition without turning self-change into a setup-verification bypass.
Current context: account.ts only writes hash, setup-required remains; setup/reset RPC already handles hashed token/session revocation.
Changes: Require existing-password proof for configured accounts; setup-required accounts use token path, not unconditional flag clearing. Atomic compare/version-guarded credential update and other-session revocation; reconcile current session behavior and UI redirect; bounded password validation.
Constraints: Do not silently treat accepted passwordless session as stronger identity proof; preserve compat login behavior; no plaintext DB/logs.
DoD: `node scripts/verify-release.mjs --suite credential-change`; concurrent change/reset, wrong proof, token expired/used, compat→strict, current/other-session matrix and zero partial writes; root gates.

### [x] [#P98M2T08] Make login throttling fail-safe and proxy-aware
```yaml
task:
  id: P98M2T08
  tier: CONTROLLED
  depends: [P98M2T07]
  owns: [src/actions/auth.ts, src/lib/login-rate-limit.ts, src/types/database.ts, supabase/migrations/20260907000200_login_rate_limit.sql, db/rollback-login-rate-limit.sql, tests/integration/login-rate-limit.mjs, tests/p98-password-setup.test.mjs]
  locks: [AUTH_LOGIN_CONTRACT]
```
Goal: Prevent DB-error fail-open and spoofed-IP-only throttling bypass.
Current context: auth.ts reads count without error; trusts first forwarded header; exact strict flag predicate remains required.
Changes: Atomic bounded account+trusted-network throttle, explicit trusted-proxy configuration contract; safe generic responses, bounded retention and concurrency controls; no assumption Next exposes raw socket address. Balance account abuse lockout with bounded windows.
Constraints: No live header trust/security config change without approval; unchanged valid compatibility login semantics.
DoD: `node scripts/verify-release.mjs --suite login-rate-limit`; spoofed-header/account rotation, DB count/insert failure, concurrent threshold, recovery expiry, existing password suite; root gates.

### [x] [#P98M2T09] Forensic reconcile production login_attempts schema
```yaml
task:
  id: P98M2T09
  tier: CONTROLLED
  depends: [P98M1T02, P98M2T08]
  owns: []
  locks: [KURABE_PRODUCTION, AUTH_LOGIN_CONTRACT, KURABE_CONTROL_RECONCILE]
```
Goal: Produce an exact, redacted production fingerprint and reconciliation plan for the pre-existing `public.login_attempts` collision without changing production or reopening P98M2T08.
Interface: Immutable forensic artifact under `/home/pi5/hermes-artifacts/kurabe-execution/`, property-by-property `COMPATIBLE|NEEDS_RECONCILE|UNKNOWN` matrix, source reader/writer inventory, provenance result, and bounded T10 reconciliation contract.
Current context: Fresh P98M2T05 preflight found `public.login_attempts` already present with non-reviewed shape/grants; reviewed P98M2T08 contract is `supabase/migrations/20260907000200_login_rate_limit.sql`, `db/rollback-login-rate-limit.sql`, `src/lib/login-rate-limit.ts`, `src/actions/auth.ts`, and `tests/integration/login-rate-limit.mjs`.
Changes: Mika-only read the live `pg_catalog`/`information_schema` contract, constraints, indexes, grants, RLS/policies, owner, triggers, dependencies, aggregate row/data-shape statistics, migration ledger and function provenance; trace every canonical source reader/writer and classify direct browser/authenticated access versus server/service-role access; compare exact production shape with the reviewed P98M2T08 contract; inspect Git history/blame for migration provenance; write only redacted evidence and the proposed fail-closed reconciliation plan.
Constraints: Read-only production access only; no DDL/DML, grants, policy changes, env changes, deploy, restart, fixture credential change, cleanup, source edits or task reopen. Never expose raw rows, secrets, tokens, connection strings or employee identifiers. Any unavailable catalog predicate remains `UNKNOWN` and blocks T10.
DoD:
- Fresh project-identity and canonical-source readback plus a complete redacted catalog query manifest/output covering columns/types/defaults/nullability, PK/FK/check constraints, indexes/definitions, table/sequence/function grants, RLS enabled/forced state, policies, owner, triggers, dependent functions/views, row count and non-sensitive shape statistics, migration ledger and Git provenance.
- Every required property is explicitly `COMPATIBLE`, `NEEDS_RECONCILE`, or `UNKNOWN`; exact production fingerprint is stable and hash-verified; no unsupported inference from source comments.
- Canonical source inventory proves all `login_attempts` readers/writers, including `src/lib/login-rate-limit.ts`, auth call paths, retention/perf/operational SQL, and direct browser/authenticated versus service-role reachability.
- Exact diff against the reviewed P98M2T08 schema/function/grant/RLS contract identifies preserved rows and each required reconciliation delta; unexpected collision states are explicitly fail-closed.
- Fresh independent Reviewer returns `PASS` on the forensic evidence and T10 plan; evidence path and review path are retained. No production or canonical source mutation occurs.

### [x] [#P98M2T10] Bounded login_attempts reconciliation migration
```yaml
task:
  id: P98M2T10
  tier: CONTROLLED
  depends: [P98M2T09]
  owns: [supabase/migrations/20260909000100_p98_reconcile_login_attempts.sql, db/rollback-p98-reconcile-login-attempts.sql, tests/integration/login-attempts-reconciliation.mjs]
  locks: [AUTH_SCHEMA_CONTRACT, KURABE_SCHEMA_BASELINE, MACHINE_EXCLUSIVE]
```
Goal: Implement a reversible, fail-closed candidate that reconciles the exact T09 production fingerprint to the reviewed P98M2T08 `login_attempts` contract while preserving existing rows and runtime behavior.
Interface: New forward migration, exact reverse candidate, and real-PostgreSQL integration suite; P98M2T08 migration/source/tests remain unchanged and DONE.
Current context: T09 is the sole live contract authority. The candidate must account for both a clean database with no table and the exact current-production-like baseline; if T09 cannot prove a safe delta, amend/block rather than guess.
Changes: Add exact precondition checks against the T09 fingerprint; converge clean and exact current-production-like baselines to one reviewed final contract; preserve rows; add/alter only proven-required objects; keep no `DROP`/recreate, destructive rename or broad rewrite; retain the legacy `idx_login_attempts_code_ip_time` unless a separately evidenced local proof shows it is redundant and safe to remove (no destructive index change in this task); do not revoke broad `authenticated` table grants or change RLS/policies unless T09 source evidence and the reviewed final contract explicitly prove the runtime-safe disposition; harden only the reviewed function EXECUTE boundary; include exact provenance markers and a rollback candidate guarded against ownership/fingerprint mismatch.
Constraints: Candidate-only local/disposable PostgreSQL work; no production DB connection, deploy, push, env/permission change, broad data update/delete, manual fix-forward, T08 reopen, or cleanup outside declared outputs. Unexpected collision baseline must raise before any mutation and leave zero partial mutation. A T09 `UNKNOWN`, changed fingerprint, unreviewed legacy-index disposition, or unreviewed table-grant/RLS disposition blocks implementation.
DoD:
- `node scripts/verify-release.mjs --suite login-attempts-reconciliation` passes focused real-PostgreSQL cases for clean baseline convergence, exact current-production-like convergence with row preservation, and unexpected collision fail-closed/zero-partial-mutation; rollback and provenance checks are exercised.
- Mika independently verifies exact candidate BASE_SHA, owned-only diff, `git diff --check`, secret scan, focused suite, `npm run test`, `npm run lint`, `npm run typecheck`, and `npm run build`; no tracked or untracked residue outside declared disposable outputs.
- Fresh selected CONTROLLED Reviewer returns `PASS` against the exact candidate, T09 fingerprint/reconciliation plan, rollback and evidence; candidate remains unchanged and clean.
- Canonical publish is Mika-only and occurs only after all gates; no production mutation/deploy/push is part of T10.

### [ ] [#P98M2T05] Approved auth/framework production rollout
```yaml
task:
  id: P98M2T05
  tier: CONTROLLED
  depends: [P98M1T01, P98M1T02, P98M2T04, P98M2T08, P98M2T09, P98M2T10]
  owns: []
  locks: [KURABE_PRODUCTION, AUTH_ROLLOUT]
```
Goal: Mika-only exact password-capable infrastructure and compatible application deployment in OPTIONAL_PASSWORD mode; do not activate strict enforcement.
Current context: Product decision is `CURRENT_AUTH_MODE=OPTIONAL_PASSWORD`, `STRICT_PASSWORD_GO_LIVE=DEFERRED`, and `KURABE_REQUIRE_PASSWORD_LOGIN` must be effectively false. P98M2T09 and P98M2T10 are now canonical PASS; P98M2T05 is `READY_FOR_OWNER_APPROVAL` only. The prior preflight remains historical because of the pre-existing `public.login_attempts` collision; a fresh production preflight and separate explicit owner approval are required before any T05 mutation, and no prior catalog/baseline may be reused.
Changes: Freeze reviewed SHA, rerun fresh source/deployment/catalog readback, validate the T10 reconciliation fingerprint and exact ordered migration manifest, recoverable backup and paired rollback; deploy only password setup schema/tokens, reviewed setup/reset RPCs, session revocation, login rate limiting, compatible application wiring and optional-mode setup flow. Read back deployment/RPC/ledger/flag behavior and run safe controlled auth canary without forcing legacy accounts.
Constraints: Explicit owner approval required for deployment, credentials/state and any environment change; abort on any fresh drift. `KURABE_REQUIRE_PASSWORD_LOGIN=true`, strict login activation, bulk marking NULL-password users as setup-required, forced setup, shared/default passwords, global NULL-password lockout, and broad reset are DEFER_TO_STRICT_GO_LIVE and forbidden in Phase 98. If the flag is absent, source/tests must prove absent == false == OPTIONAL before rollout; do not mutate env merely to make it explicit. No broad NULL reset on rollback; preserve new credentials. T08 remains DONE and is not reopened.
DoD: All root/local auth+DB+browser gates and fresh candidate review PASS; owner-approved exact OPTIONAL-mode deployment/SQL command manifest with exit outputs, source SHA/ledger/flag/readback and A–F auth matrix evidence: NULL legacy login PASS, configured correct password PASS, configured missing/wrong password FAIL, secure setup/reset available, and post-setup password enforcement. Verify `absent`, `false`, and `true` flag semantics; prove 96 known NULL-password users remain usable and are not force-migrated. Missing command/approval or any strict-mode activation => BLOCKED, never fabricated CLI.

### [ ] [#P98M3T02] Approved evaluator NULL-safety rollout and RPC canary
```yaml
task:
  id: P98M3T02
  tier: CONTROLLED
  depends: [P98M2T05, P98M3T01]
  owns: []
  locks: [KURABE_PRODUCTION]
```
Goal: Prove exact underlying/active-only runtime authorization after Mika-controlled apply.
Current context: Existing P98M3T01 SQL/tests; live signatures and feature flag unproven by source.
Changes: Reverify exact SQL and grants locally with harness; fresh review and approved ordered apply; readback definitions, ledger and assigned/NULL/wrong actor canary using synthetic approved fixtures.
Constraints: Serial after stable auth rollout, explicit approval, no business evaluation writes; mismatch => STOP/pre-reviewed rollback.
DoD: `node tests/p98-evaluator-auth.test.mjs`; real DB tests via qualified harness and exact approved live SQL/RPC manifest evidence; NULL/wrong reject, assigned unaffected, no residual fixture or unapproved DB delta.

## Phase 99 — active, dependency-gated

### [x] [#P99M1T01] Reproducible complete DB baseline and migration replay
```yaml
task:
  id: P99M1T01
  tier: CONTROLLED
  depends: [P98M1T03, P98M2T04, P98M2T08]
  owns: [db/bootstrap, scripts/db-bootstrap.mjs, tests/integration/db-bootstrap.mjs]
  locks: [KURABE_SCHEMA_BASELINE]
```
Goal: Deterministic fresh schema, not placeholder legacy migrations.
Current context: Empty legacy files and db/migration-* outside ordered chain; P98M1T03 only minimal fixtures.
Changes: Derive reviewed baseline from authorized redacted catalog+tracked SQL, manifest hashes/order/extensions/grants; wire local bootstrap/replay/drift comparison into suite; retain legacy ledger provenance.
Constraints: No production clone/PII or rewriting applied history. Bootstrap cannot target non-disposable DB; unknown catalog predicate blocks parity claim.
DoD: `node scripts/verify-release.mjs --suite db-bootstrap`; empty→full schema, repeat setup, ordered forward replay and normalized expected-catalog match; DB identity refusal tests; root gates.

### [x] [#P99M2T01] Preserve historical evaluations during personnel changes
```yaml
task:
  id: P99M2T01
  tier: CONTROLLED
  depends: [P99M1T01]
  owns: [src/actions/users.ts, src/lib/db/evaluation-history-admin.ts, supabase/migrations/20260907000300_personnel_history_guard.sql, db/rollback-personnel-history-guard.sql, tests/integration/personnel-history.mjs]
  locks: [PERSONNEL_EVALUATION_GRAPH]
```
Goal: Profile changes cannot rewrite Closed/submitted historical snapshots.
Current context: users.ts sync updates all employee evaluations and unsubmitted rounds irrespective of period.
Changes: Gate indirect writes by canonical Active/current workflow inside DB; preserve role/team/evaluator snapshot; protect against concurrent close/submit; historical readers continue using captured fields.
Constraints: No retroactive repair of real history without separate approved mapping; no deleting old rounds; future config snapshot task extends same invariant.
DoD: `node scripts/verify-release.mjs --suite personnel-history`; hash Closed graph before/after change role/team/SubLeader; same with concurrent submit/close and failure injection; root gates.

### [x] [#P99M2T02] Atomic personnel/team/init and validated leadership relations
```yaml
task:
  id: P99M2T02
  tier: CONTROLLED
  depends: [P99M2T01]
  owns: [src/actions/users.ts, src/actions/teams.ts, src/lib/db/evaluations-write.ts, src/lib/evaluator-resolver.ts, src/lib/db/evaluations-admin.ts, src/data/workflow.ts, src/types/database.ts, supabase/migrations/20260907000400_personnel_transaction.sql, db/rollback-personnel-transaction.sql, tests/integration/personnel-transaction.mjs]
  locks: [PERSONNEL_EVALUATION_GRAPH]
```
Goal: One committed graph or explicit failure; same-team active SubLeader and unique active Leader.
Current context: user upsert ignores ensureEvaluationsForUsers errors, best-effort sync; team and evaluator paths share relations.
Changes: Transactional single/batch personnel changes with idempotency/concurrency/affected-row guard; update old/new teams.leader_id correctly; validate role/team/SubLeader relations server+DB; remove false-success on init and validate read-context scope. Wire all single/batch callers.
Constraints: No DB work inside browser; no implicit role defaults on partial updates; preserve submitted/Closed snapshots and approved multiple-SubLeader policy.
DoD: `node scripts/verify-release.mjs --suite personnel-transaction`; failures at each write, duplicate/concurrent Leader, cross-team/inactive/wrong-role SubLeader, role/team moves, zero/multiple Active, no orphan/audit false-success; root gates.

### [ ] [#P99M3T01] Atomic versioned grade bands and authoritative scoring
```yaml
task:
  id: P99M3T01
  tier: CONTROLLED
  depends: [P99M2T02]
  owns: [src/actions/grade-bands.ts, src/lib/grade-bands-validate.ts, src/lib/grade-bands.ts, src/lib/grade-bands-server.ts, src/lib/grade-match.ts, src/lib/scoring.ts, src/actions/evaluation.ts, src/components/settings/GradeBandsTab.tsx, src/types/database.ts, supabase/migrations/20260907000500_grade_config_version.sql, db/rollback-grade-config-version.sql, tests/integration/grade-config.mjs, tests/grade-match.test.ts]
  locks: [SCORING_CONFIG]
```
Goal: Valid complete config snapshot or no grading write; preserve valid current threshold results.
Current context: duplicate S/missing A and NaN accepted; row-wise upsert; load errors use hardcode.
Changes: Runtime exact unique role/grade sets, finite supported score domain, threshold/catch-all constraints, maxScore consistency; atomic versioned config replace; return authoritative bands+version rather than implicit module fallback; transaction validates version for submit; invalidate readers.
Constraints: Do not alter historical grades, valid scoring boundaries or introduce a new policy; corrupted legacy config needs explicit correction approval, not auto-normalization.
DoD: `node scripts/verify-release.mjs --suite grade-config`; duplicate/missing/unknown/NaN/infinite/gap/null boundaries, concurrent config/submit, DB failure and no partial replacement; existing grade-match tests; root gates.

### [ ] [#P99M3T02] Atomic criteria/audiences/levels with historical version reads
```yaml
task:
  id: P99M3T02
  tier: CONTROLLED
  depends: [P99M3T01]
  owns: [src/actions/criteria.ts, src/lib/db/criteria.ts, src/lib/db/criteria-admin.ts, src/lib/db/evaluation-history-admin.ts, src/actions/evaluation.ts, src/actions/read.ts, src/hooks/use-db.ts, src/app/criteria/page.tsx, src/types/database.ts, supabase/migrations/20260907000600_criteria_config_version.sql, db/rollback-criteria-config-version.sql, tests/integration/criteria-config.mjs]
  locks: [SCORING_CONFIG]
```
Goal: No delete-old/insert-new partial levels and no changing historical scoring semantics.
Current context: criteria.ts metadata/audience/levels writes separate; defaultLevelIndex and numeric metadata lack complete boundary validation.
Changes: Atomic versioned criterion/group/audience/level/default-index update, soft-delete semantics, supported numbers and foreign keys; pin evaluation criteria+grade version, wire read/write/history consumers and invalidation; reject stale config submits safely.
Constraints: Existing history without snapshot is explicitly legacy/unknown; no fabricated historical labels or recalculation. UI non-goal redesign.
DoD: `node scripts/verify-release.mjs --suite criteria-config`; step failures, concurrent toggle/edit/submit, empty/invalid levels and indices, soft-delete, unchanged Closed/history, snapshot read regression; root gates.

### [ ] [#P99M4T01] Sensitive read inventory, serverization and least privilege candidate
```yaml
task:
  id: P99M4T01
  tier: CONTROLLED
  depends: [P99M3T02]
  owns: [src/actions/read.ts, src/lib/db/users-admin.ts, src/lib/db/teams-admin.ts, src/lib/db/evaluations-admin.ts, src/lib/db/evaluations.ts, src/contexts/AuthContext.tsx, src/hooks/use-db.ts, supabase/migrations/20260907000700_sensitive_read_grants.sql, db/rollback-sensitive-read-grants.sql, tests/integration/read-boundaries.mjs]
  locks: [READ_AUTH_CONTRACT]
```
Goal: No sensitive anon-read or cross-scope browser payload after qualified cutover.
Current context: anon metadata/period bootstraps and server readers coexist; source RLS is not live proof.
Changes: Enumerate callers/tables/RPCs from source+approved catalog; serverize needed reads before candidate revoke; validate viewer/team on all routes/actions/history/chat input providers; SQL least-privilege with exact reverse grants and cutover order.
Constraints: Inventory revealing consumers outside owns => amend contract before dispatch, not broad edit. No live revoke in this task.
DoD: `node scripts/verify-release.mjs --suite read-boundaries`; five-role allow/deny, direct anon REST and RPC negative cases, cookie forgery, cross-team assigned evaluator cases, no-secret client bundle; root gates.

### [ ] [#P99M4T02] Period/filter freshness and Compare mutation invalidation
```yaml
task:
  id: P99M4T02
  tier: CONTROLLED
  depends: [P99M4T01]
  owns: [src/contexts/AuthContext.tsx, src/components/layout/PeriodSelector.tsx, src/app/dashboard/page.tsx, src/app/reports/page.tsx, src/components/dashboard/DashboardDataLayer.tsx, src/components/reports/ReportsDataLayer.tsx, src/components/reports/ReportFilters.tsx, 'src/app/evaluations/[id]/EvaluationPageClient.tsx', src/hooks/use-db.ts, tests/browser/period-freshness.mjs]
  locks: [PERIOD_CACHE_CONTRACT]
```
Goal: Sidebar/filter/data/export scope agrees and Compare refreshes after save/return.
Current context: context-only period switch leaves server props stale; reports sync searchParams; invalidates nonexistent evaluation-by-employee, omits compare key.
Changes: Single server-resolved navigation/refresh contract for period selection; await/validate async searchParams; invalidate exact page/compare keys; stale-request generation guard, loading/error/empty retry and truthful real-time label. Preserve URL/back-forward.
Constraints: No cookie authority over Active-only writes; no cache keyed only by period; no indiscriminate full-page reload as hidden optimization.
DoD: `node scripts/verify-release.mjs --suite period-freshness`; switch periods on resident Dashboard/Reports, rapid switches/failed reads, team filter/back-forward, save/return→Compare inside stale window, five-role scope; root gates.

## Phase 100 — planned

### [ ] [#P100M1T01] Atomic AI/chat quota and failure accounting
```yaml
task:
  id: P100M1T01
  tier: CONTROLLED
  depends: [P99M4T02]
  owns: [src/lib/ai-limit.ts, src/actions/chat.ts, src/types/database.ts, supabase/migrations/20260907000800_ai_quota.sql, db/rollback-ai-quota.sql, tests/integration/ai-quota.mjs]
  locks: [AI_USAGE_CONTRACT]
```
Goal: Concurrent calls cannot overrun declared quota.
Current context: ai-limit count then insert; chat has separate quota path to reconcile.
Changes: Atomic reservation with request identity/window/retention, bounded retry and explicit consume/refund policy; wire every AI caller through shared contract, fail safely on DB errors.
Constraints: No real model billing; avoid double-reserving batch calls; any additional caller edits require owns refresh.
DoD: `node scripts/verify-release.mjs --suite ai-quota`; concurrency at threshold, retries, provider timeout/cancel, DB failure, retention and no extra allowed requests; root gates.

### [ ] [#P100M1T02] Scoped AI payload, provider and coverage governance
```yaml
task:
  id: P100M1T02
  tier: CONTROLLED
  depends: [P100M1T01]
  owns: [src/lib/ai.ts, src/lib/ai-governance.ts, src/lib/ai-context.ts, src/lib/ai-prompts.ts, src/actions/ai.ts, src/actions/ai-summary.ts, src/actions/chat.ts, src/components/reports/AiSummaryCard.tsx, src/components/reports/PeriodMinutesModal.tsx, src/components/reports/BatchResultMessageModal.tsx, tests/integration/ai-governance-flow.mjs, tests/ai-governance.test.ts]
  locks: [AI_PROVIDER_CONTRACT]
```
Goal: Explicit safe provider scope, minimum payload and honest partial summaries.
Current context: optional host allowlist and HTTP permitted; boundAIText truncates silently; employee codes remain linkable.
Changes: Strict configured provider transport policy and explicit dev exception; source-to-payload role audit, redaction, aggregate/pseudonym minimum, coverage metadata and UI disclosure; clear failure on unapproved provider. Mika records owner retention/DPA/region decision outside Runner scope.
Constraints: No sending HR data/real screenshots or paid call without approval; absent governance evidence remains blocked, not code PASS equivalent.
DoD: `node scripts/verify-release.mjs --suite ai-governance-flow`; synthetic transport with prompt injection/cross-team/secret/truncation/oversized image cases; actual approved provider governance acceptance separately; root gates.

### [ ] [#P100M2T01] CSP enforcement and framework boundary qualification
```yaml
task:
  id: P100M2T01
  tier: CONTROLLED
  depends: [P100M1T02]
  owns: [next.config.ts, src/lib/security-csp.ts, src/middleware.ts, src/proxy.ts, src/app/layout.tsx, tests/security-csp.test.ts, tests/browser/security-headers.mjs]
  locks: [SECURITY_HEADERS]
```
Goal: Effective security headers without breaking application runtime.
Current context: report-only CSP; installed Next 16.3.4; middleware UX format checks backed by action auth.
Changes: Use current official framework contract; implement nonce/hash-compatible enforcement, test trusted origins; proxy migration only if justified, never leave duplicate middleware/proxy entrypoints; preserve action authorization.
Constraints: Runtime security toggle/deployment requires approval; no unsafe-inline workaround to manufacture PASS; keep explicit rollback policy.
DoD: `node scripts/verify-release.mjs --suite security-headers`; real browser login/setup/charts/export/print/hydration plus forged action/header negative cases and response header assertions; root gates.

### [ ] [#P100M2T02] Dependency advisory remediation with reproducible lockfile
```yaml
task:
  id: P100M2T02
  tier: STANDARD
  depends: [P100M2T01]
  owns: [package.json, package-lock.json]
  locks: [DEPENDENCY_CONTRACT]
```
Goal: Resolve known dev/transitive advisories without unrelated upgrades.
Current context: browserslist high and @babel/core low; Next manifest patched; SheetJS URL tarball not fully covered by registry audit.
Changes: Current vendor/advisory and dependency-chain verification, minimal compatible updates/pins, installed artifact provenance/integrity and tarball review; document any remaining issue to Mika for explicit time-bounded owner waiver.
Constraints: No npm audit fix --force/major upgrade by default, no waived runtime High without owner decision.
DoD: `npm ci && npm run test && npm run lint && npm run typecheck && npm run build`; `npm audit --json`, `npm audit --omit=dev --json`, `git diff --check`; compare dependency delta and current vendor ranges, no hidden coverage claim.

## Phase 101 — planned / measured optimization

### [ ] [#P101M1T01] Reproducible performance baseline and route matrix
```yaml
task:
  id: P101M1T01
  tier: STANDARD
  depends: [P100M2T02]
  owns: [tests/perf/benchmark-harness.mjs, tests/perf/perf-report.json, tests/browser/performance-baseline.mjs]
  locks: [MACHINE_EXCLUSIVE]
```
Goal: Baseline actual authenticated data completion, not spinner scores.
Current context: old benchmark hardcodes live URL and session cleanup; no fresh timings in audit.
Changes: Add explicit local candidate mode using qualified fixtures/harness; preserve gated live mode and redacted schema/SHA/sample provenance; full route/viewport/role matrix, cold/warm requests/bytes and loading milestones.
Constraints: No real login/session cleanup by default, no invented fixtures represented as production counts; same build/runtime/data for comparisons.
DoD: `node scripts/verify-release.mjs --suite performance-baseline`; root checks; actual Chrome samples, Lighthouse preset and spread rule, evidence completeness/zero unauthorized-route samples.

### [ ] [#P101M2T01] Reduce Dashboard/Reports request and payload cost
```yaml
task:
  id: P101M2T01
  tier: CONTROLLED
  depends: [P101M1T01]
  owns: [src/actions/dashboard.ts, src/actions/reports.ts, src/app/dashboard/page.tsx, src/app/reports/page.tsx, src/components/dashboard/DashboardDataLayer.tsx, src/components/dashboard/DashboardHeavySection.tsx, src/components/reports/ReportsDataLayer.tsx, src/components/reports/ReportFilters.tsx, tests/browser/dashboard-reports-performance.mjs]
  locks: [PERIOD_CACHE_CONTRACT, MACHINE_EXCLUSIVE]
```
Goal: Measurably remove redundant reads/waterfalls/payload, preserving report truth.
Current context: heavy waits light; raw evaluations/criteria serialized; team filter navigates server then client aggregates.
Changes: Follow baseline bottleneck; bounded projections and independent fetches first; preserve previous scoped view with explicit loading if safe; cache only with viewer/role/team/period key and invalidation proof.
Constraints: No fixed byte budget invented before baseline; no cache bypass of RBAC, URL regression, new infrastructure or optimistic wrong-scope data.
DoD: `node scripts/verify-release.mjs --suite dashboard-reports-performance` plus `--suite period-freshness`; same-baseline before/after requests/bytes/full-complete, no first-party errors or scope leak; root gates. Reject non-beneficial changes.

### [ ] [#P101M2T02] Bound detail/compare/history and personnel render cost
```yaml
task:
  id: P101M2T02
  tier: CONTROLLED
  depends: [P101M2T01]
  owns: [src/actions/read.ts, src/hooks/use-db.ts, src/hooks/use-evaluation-page-state.ts, 'src/app/evaluations/[id]/EvaluationPageClient.tsx', 'src/app/evaluations/[id]/compare/ComparePageClient.tsx', src/components/evaluation/EvaluationHistoryPage.tsx, src/components/employees/EmployeesClient.tsx, src/lib/employee-table-projection.ts, tests/browser/detail-list-performance.mjs]
  locks: [PERIOD_CACHE_CONTRACT, MACHINE_EXCLUSIVE]
```
Goal: Reduce proven query/render duplication without weakening history or save behavior.
Current context: page-data hooks, explicit projections and static frames already exist; preserve prior improvements.
Changes: Profile transforms/query payload and rerenders; reuse stable projections, bounded lazy render only where measurable; remove dead invalidation/hook paths only if verified unused; preserve unsaved state/error/empty/retry.
Constraints: No virtualization or blanket memoization without benchmark; no broad decomposition by file length; contract drift outside owns stops dispatch.
DoD: `node scripts/verify-release.mjs --suite detail-list-performance` and `--suite period-freshness`; all applicable roles/periods, cold/warm before-after plus save/return/history behavior; root gates.

### [ ] [#P101M3T01] Responsive/accessibility residual closure
```yaml
task:
  id: P101M3T01
  tier: STANDARD
  depends: [P101M2T02]
  owns: [src/components/ui, src/components/layout/AppLayout.tsx, src/components/layout/Sidebar.tsx, src/components/layout/PeriodSelector.tsx, src/app/globals.css, tests/browser/responsive-accessibility.mjs]
  locks: [UI_PRESENTATION_CONTRACT, MACHINE_EXCLUSIVE]
```
Goal: Fix measured keyboard/focus/touch/overflow issues, not redesign.
Current context: approved page composition/assets; loading/empty/error states must remain usable.
Changes: Inspect rendered route matrix; bounded focus handling, accessible names, contrast/touch/scroll fixes inside owns. Cross-component findings require scoped plan amendment, not drive-by edits.
Constraints: Preserve copy/assets/composition, no icon remapping without inventory; desktop owner review before aesthetic expansion.
DoD: `node scripts/verify-release.mjs --suite responsive-accessibility`; 390x844/768x1024/1440x900 screenshots, keyboard dialog lifecycle, no horizontal overflow or first-party errors and no measured speed regression; root gates.

## Phase 102 — planned / release closure

### [ ] [#P102M1T01] Enforce real verification in existing CI
```yaml
task:
  id: P102M1T01
  tier: CONTROLLED
  depends: [P101M3T01]
  owns: [.github/workflows/ci.yml, scripts/run-tests.mjs, scripts/verify-release.mjs, tests/verification-harness.test.mjs]
  locks: [KURABE_TEST_CONTRACT]
```
Goal: Existing CI actually protects behavior/DB/browser/security, with honest failures.
Current context: CI already runs npm ci/lint/typecheck/test/build; source-string tests do not cover runtime.
Changes: Wire isolated DB/browser fixtures and redacted secret scan into existing CI; fail zero tests, preserve first failing output and actual exit status, pin execution identity; separate external live approvals from CI.
Constraints: No secrets/service role production credentials in CI; hosted runner costs or repository settings approval separate.
DoD: `node tests/verification-harness.test.mjs`; local CI-equivalent full suite and deliberate failing assertion exits nonzero. Hosted run/required-check enforcement only claimed after approved remote readback.

### [ ] [#P102M1T02] Full release integration and rollback package
```yaml
task:
  id: P102M1T02
  tier: CONTROLLED
  depends: [P102M1T01]
  owns: [tests/integration/release-matrix.mjs, tests/browser/release-matrix.mjs, tests/operations/release-preflight.mjs]
  locks: [MACHINE_EXCLUSIVE]
```
Goal: Exact candidate proves full lifecycle and migration/cutover/rollback readiness.
Current context: Phase 99/100 added local-only candidate schema/security changes, not deployed yet.
Changes: Aggregate five-role auth/personnel/config/period/evaluation/reports/history/export/AI-stub matrix; race/fault/rollback tests; ordered migration manifest with hashes, expected catalog delta, consumer-before-revoke ordering and pre-approved rollback. Re-evaluate P96T10 evidence.
Constraints: No production mutations; review tests must exercise actual DB/action/browser logic, not copied simulations; unresolved P0/P1 remains gate.
DoD: `node scripts/verify-release.mjs --suite release-matrix`; `node scripts/verify-release.mjs --suite release-preflight`; root/secret/dependency gates, exact candidate fresh CONTROLLED review; manifest missing runtime input blocks live dispatch.

### [ ] [#P102M2T01] Approved branch protection and remaining production cutover
```yaml
task:
  id: P102M2T01
  tier: CONTROLLED
  depends: [P102M1T02, P98M3T02]
  owns: []
  locks: [KURABE_PRODUCTION, GITHUB_REPOSITORY_SETTINGS]
```
Goal: Mika-only apply reviewed remaining schema/code and enforce canonical source/CI linkage.
Current context: No push/deploy/settings approval implied by planning. Runtime currently may differ from candidate schemas.
Changes: Obtain exact owner approval, fresh source/catalog/backup/maintenance checks; execute verified command manifest, serial migrations+code cutover, settings change/readback, smoke/readback, rollback on defined mismatch.
Constraints: No force-push, no speculative commands, no automatic strict-mode or credential changes beyond approval; preserve accepted testing exception if still in force, then release stays gated.
DoD: Exact approved deployment/SQL/settings commands and exit outputs; deployment SHA/branch protections/checks/catalog/ledger readback, business smoke and exact fixture cleanup; no unknown irreversible delta.

### [ ] [#P102M2T02] Final release evidence and durable closure
```yaml
task:
  id: P102M2T02
  tier: CONTROLLED
  depends: [P102M2T01, P96T13]
  owns: []
  locks: [KURABE_CONTROL_RECONCILE, KURABE_PRODUCTION]
```
Goal: Mika verifies release gates and closes docs/state without erasing unresolved evidence.
Current context: P96E is explicitly gated; no hidden omission. If owner accepts omitting live lifecycle, amend dependency with durable accepted-risk before dispatch, not fake P96T13 completion.
Changes: Re-run exact final release/root/security gates; source/deployment/ledger linkage, P0/P1 disposition, no active reservations/unknown residue, approved retained-evidence classification; guarded MASTER_PLAN/HANDOFF/tasks/state closure.
Constraints: HANDOFF <=15 lines, no self-referential SHA, no cleanup of unknown worktrees; owner AGENTS changes preserved unless separately integrated.
DoD: `npm run test && npm run lint && npm run typecheck && npm run build && git diff --check`; `node scripts/verify-release.mjs --suite release-matrix`; `node scripts/scan-source-secrets.mjs`; exact production readback and canonical/registered/filesystem cleanup classifications separately, no outstanding quarantine.

## Phase 96E — PAUSED / owner-approved complete run envelope only

### [ ] [#P96T11] Controlled lifecycle transition
```yaml
task:
  id: P96T11
  tier: CONTROLLED
  depends: [P96T10, P102M2T01]
  owns: []
  locks: [KURABE_PRODUCTION, LIFECYCLE_RUN]
```
Goal: Exercise close old Active/create exact test period only during approved maintenance.
Current context: P96T10 historic manifest must be refreshed/validated; P102M1T02 supplies tested preflight/rollback package.
Changes: Mika approves complete P96T11–13 envelope, backup + no-concurrent-write checks and rollback trigger before first write; exact action/SQL manifest, capture IDs/affected rows/audit after each operation.
Constraints: No mutation until rollback has been independently tested and authorized; partial failure invokes P96T13 recovery immediately, not waiting for dependencies to be DONE.
DoD: `node scripts/verify-release.mjs --suite release-preflight` then approved exact production command manifest; one Active, no orphan/duplicate, immutable run-ID evidence, no business evaluation submit/approve/AI.

### [ ] [#P96T12] Verify stale/Closed behavior on run-created data
```yaml
task:
  id: P96T12
  tier: CONTROLLED
  depends: [P96T11]
  owns: []
  locks: [KURABE_PRODUCTION, LIFECYCLE_RUN]
```
Goal: Real stale-tab/Closed/no-Active proof without touching business evaluations.
Current context: Approved fixture IDs and snapshots from P96T11.
Changes: Mika executes approved browser assertions across Dashboard/Reports/detail/Compare; close test period, attempt prohibited write on synthetic run-owned evaluation, verify DB/audit deltas.
Constraints: No submit/approve/AI, no guessed fixture IDs. Failure triggers pre-approved P96T13 recovery immediately and retains FAIL evidence.
DoD: Exact browser/assertion command manifest from release-matrix and approved live extension; expected deny plus zero unexpected DB/audit delta; false-success or mismatch FAIL, never waiver by summary.

### [ ] [#P96T13] Exact-ID rollback and lifecycle integrity proof
```yaml
task:
  id: P96T13
  tier: CONTROLLED
  depends: [P96T12]
  owns: []
  locks: [KURABE_PRODUCTION, LIFECYCLE_RUN]
```
Goal: Restore baseline and remove only run-owned test graph, including emergency recovery.
Current context: Normal dependency above orders success-path bookkeeping; it NEVER prevents pre-approved rollback after P96T11/P96T12 failure. Recovery requires same exact manifest/approval, not a new Runner dispatch.
Changes: Mika executes pre-reviewed FK-safe transaction, exact-ID assertions, restores old period fields and checks before/after hashes/counts; capture failure/rollback provenance and quarantine on uncertainty.
Constraints: No prefix/LIKE/time-range deletion, no cleanup of unrelated audit rows; assertion failure rolls transaction back and HALTs with evidence.
DoD: Approved exact rollback SQL command manifest exits successfully; baseline restored, test residue absent, orphan/duplicate zero, external state readback; failed test remains failed even if rollback succeeds.