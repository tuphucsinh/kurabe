# KURABE — active residual WBS (audit replan candidate)

## Authority / status

- BASE_SHA: `ef4008df0f0fa55706307b1b84fa19988e69a02a`; canonical branch `main`. This is the canonical PLAN_TO_TASKS WBS after Mika publication; exact pending entries are not yet registered or dispatched.
- Current user scope: execute this existing WBS continuously through all non-production tasks. No deploy, push, production mutation, credential/policy change, process cleanup or destructive recovery is authorized without its separate gate.
- `.ai/MASTER_PLAN.md` owns outcomes/invariants; this file is the sole active DAG. `.ai/AUDIT_2026-09-11.md` maps findings F01–F11 to evidence, not a second WBS.
- Inherited completed IDs are indexed in MASTER_PLAN and byte-preserved in `.ai/archive/tasks-pre-audit-ef4008d.md`. Existing `[x]` means recorded canonical integration in its historical scope, not freshly certified whole-product correctness. No old ID is reopened or reused.
- Runtime registration is all-or-none under the project control lock after this canonical publication and state reconciliation; READY authorizes only the normal isolated execution path, never protected production actions.
- OPTIONAL_PASSWORD is retained: never-configured legacy NULL accounts stay usable. Strict flag activation, bulk mark/setup/reset and broad credential migration are excluded. Reset-pending identity must not silently be treated as never-configured legacy identity.
- Exact new suite filenames below are **planned deliverables**, not tools claimed to exist now. Missing/zero-case/malformed-result suites must fail closed; do not create placeholder PASS files.

## Shared implementation acceptance (G)

For each source task: pre-dispatch refresh exact base/definitions/usages/owns/locks; implement in isolated task WT; add failing behavioral regressions then smallest fix; Mika independently verifies focused suite plus `npm run test && npm run lint && npm run typecheck && npm run build`, `node scripts/scan-source-secrets.mjs`, `git diff --check`. Preserve warning count separately; no new warnings. No credential files in candidate; build only with explicit synthetic environment. CONTROLLED adds fresh selected review on exact candidate, data/scope/race/rollback evidence. No task complete before exact candidate becomes canonical. UI includes actual rendered state/keyboard checks and existing composition preserved.

Every DB task supplies new forward migration + paired guarded rollback, disposable local PostgreSQL target proof and tests: clean/applied-like/collision refusal, atomicity, affected rows, concurrent updates and rollback provenance. Never edit applied historical SQL in place. Unexpected live catalog remains UNKNOWN; no production access required by these local tasks. All future SQL names in owns are planned new files.

## Phase 102 M3 — correctness and honest verification before release

### [x] [#P102M3T01] Fail-closed test/evidence and tracked-source secret contracts
```yaml
task:
  id: P102M3T01
  tier: CONTROLLED
  depends: []
  owns: [scripts/run-tests.mjs, scripts/verify-release.mjs, scripts/scan-source-secrets.mjs, tests/verification-harness.test.mjs, tests/verification-evidence-contract.test.mjs, tests/integration, tests/browser, tests/operations]
  locks: [KURABE_TEST_CONTRACT]
```
Goal: close F10 false-success and misleading evidence tiers before new test results are trusted.
Interface/current context: runner discovers *.test.*; dispatcher accepts real=true without passed=true and drops tier/auth fields; scanner defaults src/scripts.
Changes: nonzero empty discovery; require passed===true and finite positive executed count plus explicit evidence tier; distinguish source-contract, mocked-action, real-DB, actual-Next-browser, provider and authenticated scope. Preserve module status/capability/target and measured case provenance in output/evidence; prohibit source regex being promoted to browser/DB PASS. Extend scanner to deliberate tracked code/config/SQL/CI/docs surfaces with explicit seeded fixture exclusions and no credential-file reads; report omitted/binary/oversize scope.
Constraints: preserve first exit status; no auto-fixing snapshots, env reads, secret values, or blanket test disabling. Existing suite-directory ownership permits only evidence-schema producer adaptation, not changes to application assertions, fixture semantics or business behavior. Existing suites must remain accurately classified; callers can intentionally require a stronger tier, but source-only producers must never masquerade as it.
DoD: `node tests/verification-evidence-contract.test.mjs`; `node tests/verification-harness.test.mjs`; zero discovery, missing/null/false passed, NaN/zero/fractional cases, wrong tier, claimed auth without execution, unknown suite and seeded detection all reject; valid structured real-local and explicitly source-only results retain their actual scope; G.

### [x] [#P102M3T02] Credential lifecycle, byte-safe passwords and race-safe session issue/revoke
```yaml
task:
  id: P102M3T02
  tier: CONTROLLED
  depends: [P102M3T13]
  owns: [src/actions/auth.ts, src/actions/account.ts, src/lib/auth-password-setup.ts, src/lib/auth.ts, src/components/account/PasswordSetupForm.tsx, src/components/settings/AccountTab.tsx, src/types/database.ts, supabase/migrations/20260911000100_session_credential_guard.sql, db/rollback-session-credential-guard.sql, tests/integration/session-credential-guard.mjs, tests/browser/session-credential-guard.mjs, tests/password-byte-boundary.test.mjs]
  locks: [AUTH_STATE_CONTRACT, AUTH_LOGIN_CONTRACT]
```
Goal: close F03/F04 without disabling accepted optional legacy login.
Interface/current context: reset currently makes hash=NULL/setup_required=true; login checks snapshot then inserts sessions separately; change/setup revoke existing sessions; password validator counts JS characters; getAccountStatus hides DB error as no password; logout ignores revoke failure.
Changes: explicit never-configured vs reset-pending state; optional legacy remains allowed, reset-pending requires authorized one-time setup. Atomic session issuance validates credential revision/expected state under same user lock as change/reset/setup; no stale-proof token after revoke. Expose truthful account-status/revoke errors while clearing local cookie safely. Enforce bcrypt UTF-8 byte cap in server/UI; no silent truncation or bulk reset. Wire all auth/setup/account callers to one contract.
Constraints: any production semantics change needs owner approval; no strict global flag, forced legacy setup or shared password. Never log raw setup/session tokens, hashes or password values. Document migration compatibility/rollback without reviving revoked credentials.
DoD: `node tests/password-byte-boundary.test.mjs`; `node scripts/verify-release.mjs --suite session-credential-guard`; absent/false/true modes; NULL legacy, configured good/bad, reset-pending, one-time expiry/reuse; real concurrent login vs reset/change/setup must reject stale issuance; logout DB failure truthful; 71/72/73-byte Vietnamese/emoji boundaries; browser reset→setup→login and account errors; G.

### [x] [#P102M3T03] Atomic login admission and explicit proxy trust
```yaml
task:
  id: P102M3T03
  tier: CONTROLLED
  depends: [P102M3T02]
  owns: [src/actions/auth.ts, src/lib/auth-password-setup.ts, src/lib/login-rate-limit.ts, src/types/database.ts, supabase/migrations/20260911000200_login_admission.sql, db/rollback-login-admission.sql, tests/integration/login-admission.mjs, tests/login-admission-action.test.mjs, tests/p98-password-setup.test.mjs]
  locks: [AUTH_LOGIN_CONTRACT]
```
Goal: close F05; bound admitted attempts, not just stored failure records.
Interface/current context: check precedes bcrypt, record follows; fallback bypasses RPC guarantees; headers alone do not establish immediate-peer trust.
Changes: idempotent atomic admission reservation per account and declared trusted-network bucket; final success/failure accounting; bounded expiry/recovery; missing RPC or accounting error fail closed without direct-table fallback weakening invariant. Declare supported deployment header-overwrite contract and safe untrusted-network behavior; reject ambiguous config. Remove unconditional trust from client-supplied cf/forwarded headers.
Constraints: do not alter live proxy/security env; preserve generic responses and optional legacy login; trusted deployment assumptions stay explicit until separately read back. No broad retention deletion.
DoD: `node tests/login-admission-action.test.mjs`; `node scripts/verify-release.mjs --suite login-admission`; real concurrent threshold bursts, DB insert/count/RPC failures, duplicate retry, success cleanup, expiry, account/network isolation and forged headers; assert actual admitted attempts never exceed contract; G.

### [x] [#P102M3T04] Transactional monotonic evaluation graph and exact config-version handshake
```yaml
task:
  id: P102M3T04
  tier: CONTROLLED
  depends: [P102M3T13]
  owns: [src/actions/evaluation.ts, src/lib/evaluation-transaction-rpc.ts, src/lib/evaluation-round-validation.ts, src/lib/db/criteria-admin.ts, src/lib/db/evaluations-write.ts, src/hooks/use-evaluation-page-state.ts, 'src/app/evaluations/[id]/EvaluationPageClient.tsx', src/types/database.ts, src/types/index.ts, supabase/migrations/20260911000300_evaluation_transition_guard.sql, db/rollback-evaluation-transition-guard.sql, tests/integration/evaluation-transition-guard.mjs, tests/browser/evaluation-transition-guard.mjs, tests/evaluation-transaction-rpc.test.ts, tests/p96t05-closed-period-write-firewall.test.mjs, docs/PRODUCTION_RUNBOOK.md]
  locks: [PERSONNEL_EVALUATION_GRAPH, SCORING_CONFIG]
```
Goal: close F01/F02 and prevent stale client criteria from being relabeled as current config.
Interface/current context: default save is split writes/self-heal; transactional overload carries criteria version but omits grade version. Action reloads current rules without receiving the version the user actually edited.
Changes: pass expected rendered criteria/grade identities through UI→action→typed RPC; validate exact current/effective versions inside one transaction; no silent re-interpretation. Atomic save/submit/next-round/parent/final state, init and return integration; retries are exact idempotent readbacks, never downgrade progressed state. Validate actor, current round, previous submit, active period and next evaluator under locks; return path has explicit allowed backwards transition, not general self-heal. Remove or fail-close unsafe legacy fallback with explicit backward-compatible rollout contract; do not merely flip env.
Constraints: preserve existing valid scoring policy, captured history and supported role flows; no historical recalculation/backfill without approved mapping. No partial rollback claimed as atomic. Any extra caller discovered expands owns through plan amendment first.
DoD: `node scripts/verify-release.mjs --suite evaluation-transition-guard`; replay R1 after R2/R3/Approved leaves full graph unchanged; concurrent duplicate submit/return/close/config replacement; stale render with unchanged IDs but changed level values rejects; next-round/parent write faults leave zero delta; grade and criteria pinned to actual scoring inputs; flag absent/false/true behavior explicit; browser save/retry/return/history; G.

### [x] [#P102M3T05] Personnel transaction enforces authoritative actor scope and deletion graph
```yaml
task:
  id: P102M3T05
  tier: CONTROLLED
  depends: [P102M3T04]
  owns: [src/actions/users.ts, src/actions/teams.ts, src/lib/db/evaluations-write.ts, src/types/database.ts, supabase/migrations/20260911000400_personnel_actor_guard.sql, db/rollback-personnel-actor-guard.sql, tests/integration/personnel-actor-guard.mjs, tests/integration/personnel-actor-guard-real.mjs, tests/personnel-action-boundary.test.mjs]
  locks: [PERSONNEL_EVALUATION_GRAPH]
```
Goal: close F06 lookup-error and TOCTOU scope seams; one validated personnel graph for create/update/batch/delete.
Interface/current context: Leader precheck discards first lookup error; RPC gets no actor; softDeleteUser writes table directly.
Changes: fail closed on read errors; pass server-authenticated actor ID to transaction and revalidate active role/team + target role/team under deterministic locks. Manager-only batch/delete remains enforced. Route soft-delete through same graph boundary, reconcile team leader/subleader/evaluator references according to explicit allowed policy; reject unsafe deletions rather than silently orphan. Audit only committed successful delta.
Constraints: no authority from client role/team/actor; historical/submitted snapshots immutable; preserve multiple SubLeaders and partial-update omitted/null distinction. No auto-delete live personnel.
DoD: `node tests/personnel-action-boundary.test.mjs`; `node scripts/verify-release.mjs --suite personnel-actor-guard`; first lookup error then success cannot bypass scope; target transfer/promotion and actor demotion races; delete leader/subleader/inactive/self cases; zero partial graph writes; repeat and historical hash preservation; G.

### [x] [#P102M3T06] Persistent truthful AI summary input/coverage contract
```yaml
task:
  id: P102M3T06
  tier: CONTROLLED
  depends: [P102M3T04]
  owns: [src/actions/ai-summary.ts, src/actions/ai.ts, src/lib/ai-governance.ts, src/components/reports/AiSummaryCard.tsx, src/components/reports/PeriodMinutesModal.tsx, src/types/database.ts, supabase/migrations/20260911000500_ai_summary_coverage.sql, db/rollback-ai-summary-coverage.sql, tests/integration/ai-summary-truth.mjs, tests/browser/ai-summary-truth.mjs]
  locks: [AI_USAGE_CONTRACT, SCORING_CONFIG]
```
Goal: close F07; a partial/draft-based summary cannot later appear complete after reload or minutes reuse.
Interface/current context: positive-score selection includes drafts/excludes zero; persistence loses coverage; comment truncation occurs before metadata; active check and upsert are separate.
Changes: derive latest submitted results using authoritative scoring/history semantics; explicit no-submitted-data behavior and supported zero/negative cases. Persist coverage totals/fitted/dropped/per-field truncation and source revision/time alongside summary; read and propagate to card/minutes/exported draft; old rows marked coverage UNKNOWN, not complete. Serialize summary write with exact active-period guard. Clear stale UI scope/generation responses; label pseudonymous data accurately. Reserve quota after valid input/no-data check; define provider failure accounting honestly.
Constraints: synthetic provider only; no HR payload, paid call or provider policy approval implied. No retroactive generated content edits; schema rollback preserves existing summaries.
DoD: `node scripts/verify-release.mjs --suite ai-summary-truth`; drafts excluded, submitted zero retained, partial warning survives reload/minutes, legacy UNKNOWN, comment truncation, new-data stale summary and close/upsert race; rapid period switch and failed reads show no stale summary as new scope; G.

### [x] [#P102M3T07] AI egress redirect and response-boundary qualification
```yaml
task:
  id: P102M3T07
  tier: CONTROLLED
  depends: [P102M3T01]
  owns: [src/lib/ai.ts, src/actions/chat.ts, src/lib/ai-governance.ts, tests/ai-egress-boundary.test.mjs, tests/ai-responses-transport.test.mjs, tests/integration/ai-governance-flow.mjs]
  locks: [AI_PROVIDER_CONTRACT]
```
Goal: close F08 across text/vision/chat transport without changing approved provider.
Interface/current context: initial URL allowlist followed by fetch default redirect; inspect chat's own transport to keep same rule.
Changes: prefer redirect:error for provider API calls; if a necessary redirect is proven, require exact bounded per-hop policy before body transmission. Explicit unsupported/incomplete/refused response handling, bounded timeout/retry and no sensitive response-body logging; test provider configuration failures before quota burn where applicable.
Constraints: localhost synthetic servers, no DNS tricks, real keys, external HR payload or paid request. No new provider or model switch. Owner governance/retention acceptance stays separate UNKNOWN.
DoD: `node tests/ai-egress-boundary.test.mjs`; `node tests/ai-responses-transport.test.mjs`; `node scripts/verify-release.mjs --suite ai-governance-flow`; 301/302/303/307/308 redirect rejection and no downstream payload, disallowed host, HTTP exception, timeout, truncation/incomplete/no-output, text/vision/chat parity; G.

### [ ] [#P102M3T08] Viewer-scoped client cache, mutation errors and resident freshness
```yaml
task:
  id: P102M3T08
  tier: CONTROLLED
  depends: [P102M3T02, P102M3T05, P102M3T06]
  owns: [src/hooks/use-db.ts, src/contexts/AuthContext.tsx, src/app/login/page.tsx, src/components/employees/EmployeesClient.tsx, src/components/layout/PeriodSelector.tsx, src/components/reports/ReportsDataLayer.tsx, src/components/dashboard/DashboardDataLayer.tsx, 'src/app/evaluations/[id]/EvaluationPageClient.tsx', 'src/app/teams/[id]/page.tsx', src/components/layout/Sidebar.tsx, src/components/reports/BatchResultMessageModal.tsx, tests/browser/client-scope-freshness.mjs, tests/client-cache-contract.test.mjs]
  locks: [PERIOD_CACHE_CONTRACT]
```
Goal: close F09 and verify effective scope across mutation, role change, navigation and error states.
Interface/current context: inconsistent requester dimensions/enabled defaults; missing invalidation families; useDeleteUser fulfilled failure; auth initialization repeats effect after isInitialized changes.
Changes: inventory every hook caller; mandatory authenticated viewer identity and effective role/team or authorization revision in sensitive keys; cancel/clear old-scope pending reads on logout/identity change. Invalidate exact affected active keys once, avoid broad reload as optimization. Throw failed mutation result before success callbacks. Guard resident period/team/viewer generations and loading/error/empty/retry/export scope. Remove proven unused wrappers only with caller proof.
Constraints: no cache-only authorization, composition redesign or suppressing errors. Preserve login full-reload compatibility until actual browser proof supports change; avoid indiscriminate memoization.
DoD: `node tests/client-cache-contract.test.mjs`; `node scripts/verify-release.mjs --suite client-scope-freshness`; actual React/Next resident Manager→restricted viewer/role changes, mutation failure, personnel save→teams/detail/compare, rapid period/filter/back-forward, delayed rejection, no old-scope payload flash; G.

### [x] [#P102M3T09] Actual authenticated Next + DB release matrix and CI enforcement
```yaml
task:
  id: P102M3T09
  tier: CONTROLLED
  depends: [P102M3T03, P102M3T07, P102M3T08]
  owns: [.github/workflows/ci.yml, tests/integration/release-matrix.mjs, tests/browser/release-matrix.mjs, tests/browser/period-freshness.mjs, tests/browser/password-setup.mjs, tests/browser/credential-change.mjs, tests/browser/security-headers.mjs, tests/browser/responsive-accessibility.mjs, tests/operations/ci-suite-manifest.mjs, tests/logout-transition-regression.test.mjs, tests/teams-staged-loading-regression.test.mjs]
  locks: [KURABE_TEST_CONTRACT, MACHINE_EXCLUSIVE]
```
Goal: close F10 missing runtime coverage using existing harness infrastructure, not a second fake app.
Interface/current context: release browser uses placeholder env and guest redirects; other named browser suites contain source/fixture tiers. Node service must serve exact build, real actions and actual DB-backed session path.
Changes: qualify disposable Supabase-compatible local API/DB or existing equivalent before claims; synthetic seeded sessions/roles only. Real production Next build renders authenticated UI and sends its actual actions; no copied auth/workflow implementation or overridden success data. Wire explicit checked-in full suite manifest into existing CI after local qualification; dynamic CHROME_BIN discovery. Preserve source-only suites as supplemental. Count executed assertions by tier/role/route; missing required capability fails.
Constraints: no production DB clone, actual employee identifiers or hosted project; inability to supply local authenticated seam => BLOCKED_CAPABILITY, not synthetic replacement. No system installs, hosted billing or GitHub settings changes without approval.
DoD: `node scripts/verify-release.mjs --suite release-matrix`; `node scripts/verify-release.mjs --suite ci-suite-manifest`; all five roles on authorized/denied routes; actual save/return/close/personnel/config/history/report/export/AI-stub, fault/race cases and DB readbacks; CSP/hydration/console errors and 390x844/768x1024/1440x900 screenshots; deliberately break one real action and CI-equivalent must fail; missing/zero role coverage fails; G. Hosted enforcement NOT_RUN until approved remote readback.

### [x] [#P102M3T10] Authenticated application baseline and bounded measured optimization
```yaml
task:
  id: P102M3T10
  tier: CONTROLLED
  depends: [P102M3T09]
  owns: [tests/perf/benchmark-harness.mjs, tests/perf/perf-report.json, tests/browser/performance-baseline.mjs, tests/browser/dashboard-reports-performance.mjs, tests/browser/detail-list-performance.mjs, src/actions/dashboard.ts, src/actions/reports.ts, src/components/dashboard/DashboardDataLayer.tsx, src/components/reports/ReportsDataLayer.tsx]
  locks: [PERIOD_CACHE_CONTRACT, MACHINE_EXCLUSIVE]
```
Goal: answer “đã tối ưu chưa” from actual app data completion, not fixture scores; optimize only a verified bottleneck in owns.
Interface/current context: existing performance reports are local-fixture/projection-tier; preserve their value but separate from Next runtime.
Changes: baseline same production build/runtime/data/auth/route matrix, cold/warm, request/query count/bytes, TTFB and shell/light/heavy/full-complete plus interaction. Record Lighthouse preset before samples, two runs and median tie-break if spread>5. At most two bounded fixes; prioritize redundant requests/projections/waterfalls. Keep equality/scope/console/render checks. If bottleneck is outside owns, stop for scoped amendment; if no material benefit, Mika records measured no-change disposition.
Constraints: no universal invented latency SLA, same dataset/build mode for comparisons; no network/provider production calls; no blanket cache/virtualization/rewrite/new infra. Generated report must be clearly identified as this task's tracked owned output.
DoD: `node scripts/verify-release.mjs --suite performance-baseline`; `node scripts/verify-release.mjs --suite dashboard-reports-performance`; `node scripts/verify-release.mjs --suite detail-list-performance`; raw samples/exact SHAs, all requested routes/roles/viewports or explicit denied cases, real data equality and absence of console errors; evidence-based benefit or reviewed no-change; G.

### [ ] [#P102M3T11] Refresh exact final release/rollback/evidence package
```yaml
task:
  id: P102M3T11
  tier: CONTROLLED
  depends: [P102M3T10]
  owns: [tests/integration/release-matrix.mjs, tests/operations/release-preflight.mjs, tests/operations/release-manifest-integrity.mjs]
  locks: [KURABE_SCHEMA_BASELINE, MACHINE_EXCLUSIVE]
```
Goal: new repairs invalidate old P102M1T02 release fingerprint; produce one coherent candidate package before any rollout approval.
Interface/current context: existing manifest maps historical migrations/rollback; incorporate each new task's forward/rollback contract without reusing old review SHA.
Changes: exact ordered migration/source/rollback hashes; compatibility/consumer-before-revoke ordering; full fresh disposable replay and rollback failure tests; include actual authenticated/browser/perf scope and residual warnings/UNKNOWNs. Recheck SheetJS external vendor advisory/provenance separately from npm audit. Missing live catalog remains preflight input, not inferred baseline.
Constraints: no production connection/apply, remote branch setting or real model. Do not mutate historical SQL to make preflight green; return any owned repair to originating task via amended DAG.
DoD: `node scripts/verify-release.mjs --suite release-matrix`; `node scripts/verify-release.mjs --suite release-preflight`; `node scripts/verify-release.mjs --suite release-manifest-integrity`; npm audit full/production and vendor evidence; all exact hashes/deltas/paired rollback assertions, zero unexplained P0/P1, fresh CONTROLLED review on final candidate; G.

### [x] [#P102M3T12] Reconcile stale runtime/control/workspace ownership without discarding evidence
```yaml
task:
  id: P102M3T12
  tier: CONTROLLED
  depends: []
  owns: []
  locks: [KURABE_CONTROL_RECONCILE, MACHINE_EXCLUSIVE]
```
Goal: close F11 stale state/reservations and deleted-cwd local server; Mika-only operational task.
Interface/current context: canonical HEAD, inherited P100 reservation/stale bases, historical registered/six unregistered paths, PID 342934 at audit time. PID is a historical lead, not future kill authority.
Changes: read-only reconcile canonical→registered WTs→filesystem roots→state; capture exact live PID/start/cwd/listener identity, classify LIVE/DEAD/UNKNOWN and retain unknown. Resolve metadata under lock only after explicit execution authority; archive exact dirty deltas/hashes before any approved cleanup. Stop only exact owned local server with approval; no broad kill/reset/clean. Preserve all immutable completion/review/failure evidence.
Constraints: planning does not authorize process/service/state mutation; production/external quarantine never auto-cleared. Separate actionable owner decision from bookkeeping; must not block safe read-only audit merely because residue exists.
DoD: `git status --short --branch`; `git worktree list --porcelain`; `git for-each-ref refs/heads refs/mika`; `ss -ltnp`; exact PID `ps -p <verified-pid> -o pid=,lstart=,args=` and /proc cwd; complete root/state inventory and evidence hashes. After approved mutation exact readback proves no active stale reservation, authoritative base matches canonical, retained paths/reasons explicit and no orphan current-run listener. Fresh independent operational evidence review, no fabricated cleanliness.

### [x] [#P102M3T13] Qualify reusable actual-Next authenticated local fixture lane
```yaml
task:
  id: P102M3T13
  tier: CONTROLLED
  depends: [P102M3T01]
  owns: [tests/browser/app-auth-harness.mjs, tests/browser/app-auth-bootstrap.mjs, tests/integration/app-auth-bootstrap.mjs, tests/fixtures/release/app-auth]
  locks: [KURABE_TEST_CONTRACT, MACHINE_EXCLUSIVE]
```
Goal: provide the real application/DB/session fixture before source repair tasks need browser acceptance; avoids a circular dependency on the final release matrix.
Interface/current context: existing release browser launches Next with placeholder remote API settings and proves guest redirects, not authenticated data paths. Existing local PostgreSQL harness is a reusable starting point, not sufficient by itself for Supabase HTTP reads.
Changes: inspect/reuse current DB/browser bootstrap; qualify available local Supabase-compatible API plus disposable DB and exact production Next build. Export explicit start/seed/role-login/browser/readback/cleanup handles; synthetic users only, exact fixture IDs, captured PID/start-time and ephemeral ports; no copied implementation or canned API success. Prove one actual authenticated read, one denied action and DB/session identity. Tests consume this same lane rather than inventing per-task fake apps.
Constraints: before any install/service/security change obtain approval; unavailable authentic local API => BLOCKED_CAPABILITY with prerequisite proposal. No production fallback, production sessions, shared .next, unrelated process termination, or real provider. Binding localhost only. Returned fixtures are never labeled application/role coverage beyond what executed.
DoD: `node scripts/verify-release.mjs --suite app-auth-bootstrap`; exact build/source identity, authenticated rendered data traced to seeded DB, anonymous/denied boundary, intentionally broken auth/read path produces nonzero, startup failure/cleanup proofs and no persistent server/DB residue; G. Fixture returns usable handles and public test API documented in its module.

## Retained production gates — unchanged IDs, tightened prerequisites

The seven existing release/lifecycle task bodies below are preserved from the previous canonical WBS, with the P98M2T05 dependency amendment applied in YAML. Superseding current release package = P102M3T11; historical evidence remains supplemental. These dependencies take effect only after candidate approval:
- P98M2T05 gains P102M3T11 and P102M3T12. Prior P98 completion dependencies remain preserved in the completed ledger; no dependency is bypassed.
- P98M3T02 → P102M2T01 → P96T11 → P96T12 → P96T13 → P102M2T02 remain ordered, with exact per-task owner approval, fresh live fingerprint, backup and rollback.
- P96T13 emergency rollback is authorized by the approved complete lifecycle envelope, not blocked by success-path dependency bookkeeping.
- No strict go-live, provider governance, hosted enforcement, or deployment success can be inferred from any local task above.



### [ ] [#P98M2T05] Approved auth/framework production rollout
```yaml
task:
  id: P98M2T05
  tier: CONTROLLED
  depends: [P98M1T01, P98M1T02, P98M2T04, P98M2T08, P98M2T09, P98M2T10, P102M3T11, P102M3T12]
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
