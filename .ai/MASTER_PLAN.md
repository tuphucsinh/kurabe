# MASTER_PLAN — Kurabe QAQC

## Authority / approved planning scope

- Revision: release-hardening replan, source baseline `53b83f1bc16539f4fe7188e78788ceaf11bceaba`.
- Owner requests all remaining phases decomposed now. This explicitly replaces the old active-phase-only WBS restriction, NOT execution/production approval gates.
- `tasks.md` is the sole WBS/DAG; this file owns phase outcomes/invariants. No duplicate WBS in other plans.
- Canonical Git proves integrated source, not deployed behavior. Current live catalog/runtime evidence proves live state; migration comments do not.
- Planning approval includes local control-plane commits, temporarily preserving/restoring the owner's dirty AGENTS.md; no push, deploy, app implementation or production mutation.

## Current evidence and limitations

- Canonical branch `main`; Next and eslint-config-next manifest `16.3.4`, React `19.2.4`.
- Prior source audit reported local static/test checks. This planning revision does not rerun or independently certify those results; require fresh exact-candidate root gates at implementation. In-memory transpilation is not the normal npm wrapper or DB/browser evidence.
- Historical build evidence is in HANDOFF/state; audit did not rerun build/browser/DB integration.
- Prior registry bulk advisory check reported no production-subset findings and dev browserslist/@babel/core findings. Treat as dated audit leads, not a current clean bill; require current full npm audit/vendor verification, including SheetJS tarball coverage limits.
- Production URL: https://lykiv.vercel.app. P98M2T05 fresh preflight recorded deployment/source drift and a pre-existing `public.login_attempts` schema/grant collision; no production mutation occurred. The redacted baseline is retained at `/home/pi5/hermes-artifacts/kurabe-execution/p98m2t05-preflight-baseline.json`; T09 must replace it with a complete forensic fingerprint before T10/T05.
- `AGENTS.md` has owner changes; six legacy workspace paths are retained in recovery state, not proven clean by `git worktree list`.
- Dependency evidence drift: P98M1T02 pending despite completed dependants; P98M2T04 commit `9321c57` exists while task pending. Preserve status/evidence and reconcile before dispatch, never infer DoD from commit titles.
- Release verdict: NEEDS_FIX / NOT RELEASE-HARDENED. Temporary passwordless testing is accepted, not an incident to silently disable and not a completed production-hardening gate.

## Invariants

1. Actor/role/team come from validated server sessions. Every privileged action/RPC validates its own scope; middleware is not authority.
2. Reset/setup: short-lived one-time hashed token; atomic consume/revoke; safe delivery; explicit credential state transitions. Self-change must not bypass setup verification. Login rate limiting handles DB failures and untrusted IP headers.
3. Compatibility mode stays unchanged until separately approved strict rollout. Strict activation requires schema/RPC/UI/delivery/session evidence first.
4. At most one Active period. Concrete server-resolved period scope; zero/multiple fail closed where required. Cookie/context is preference, not DB authority.
5. Closed/history snapshots immutable, including indirect personnel/config changes and initialization. Preserve submitted rounds, historical role/team/criteria/grade version; no retroactive silent recalculation.
6. Required write graphs and config sets are transactional with affected-row checks, concurrency control, audit and observable errors. No success on partial init; no grading write with fallback configuration.
7. Grade calculation remains threshold-based as existing matchGradeBand: descending finite minScore, lowest catch-all. Preserve valid current results; maxScore must be derived/validated consistently with thresholds. A different grading policy requires owner approval.
8. SubLeader relations validate active role and same-team scope; sensitive reads deny outside authorized scope. Serverize consumers before revoking anon reads.
9. AI: minimum necessary scoped data, explicit provider/retention policy, atomic quota and explicit truncation/coverage. Employee codes are pseudonyms, not anonymization. Governance acceptance requires owner evidence.
10. Cache keys include period, viewer and effective authorization dimensions; mutations invalidate all related views. Period/filter/header/data/exports agree through loading, rapid changes, failure and retry.
11. No optimization without before/after benefit; no new cache/PPR/virtualization/service just because possible. Keep approved composition/assets; fix accessibility and error states without redesign.
12. Production/security permissions/external commitments require explicit approval; exact backup/rollback, candidate review and readback. No broad cleanup, force-push, automatic feature expansion.

## History retained (not re-dispatched)

| Phase | Recorded outcome / boundary |
|---|---|
| 32–93 | DONE historical foundation; not newly re-certified |
| 94 | CLOSED, absorbed into 95 |
| 95 | DONE staged detail/loading |
| 96 | Implemented; previous production-applied record retained, live predicates rechecked before mutation |
| 96E | PAUSED lifecycle/rollback execution; existing P96T10 evidence retained |
| 97 | DONE history route; previous deployment provenance retained, no new live claim |
| Repository reconciliation | Historical source split closed; new control/evidence drift handled separately |

## Optimality decision / dependency topology

Reuse phases 98–102, existing CI and tests; no big-bang rewrite. Bring minimal DB/browser harness qualification into Phase 98 before auth rollout; expand bootstrap and business integration in 99. Move grading and UI freshness to 99, not performance. Full future WBS is planned now but each contract must be refreshed against integrated inputs before execution.

- Source sequence: 98 source + qualified harness → 99 → 100 → 101 → 102 local integration. Production rollout is a separate approval lane; source integrity fixes do not wait for permission to deploy.
- No deadlock: the Phase 98 harness validates a minimal disposable DB contract; it does not depend on Phase 99 complete schema bootstrap.
- Dependencies gate execution, not permission. After local integration, prefer one approved release window grouping P98 auth/evaluator rollout and P102 remaining cutover, preserving their ordered checks. Early P98-only deployment is optional and needs separate owner approval. P102 cutover still depends on completed P98 rollout; no live gate is skipped.
- Shared owns/locks serialize related tasks; verifier/build cap 1. Capacity is a ceiling, not a target.

## Phase 98 — Auth closure, evidence reconciliation and early verification

State: ACTIVE planning; execution STOP until separately requested.

Scope: reconcile catalog/workspaces and prior pending evidence; qualify safe DB/browser/secret wrappers; finish setup UI and token handoff; unify credential state/session policy; harden login throttle; forensically reconcile the pre-existing production `public.login_attempts` schema; implement and qualify a bounded local reconciliation migration; qualify existing legacy/evaluator migrations; approved auth/framework/evaluator production rollout.

Gate: real reset/setup/login and session matrix in both flag modes; invalid/expired/used tokens; self-change transition; quota failure/concurrency; NULL/wrong evaluator deny; complete T09 production fingerprint; T10 clean/current-like/collision local PostgreSQL matrix; focused and root checks, real browser, fresh CONTROLLED review. Live release predicates require approved deployment/catalog readback, not source comments.

Rollback: preserve compatibility until transition approval; T10 uses exact fingerprint/provenance-guarded reverse SQL with no row deletion or table recreation; P98M2T05 retains paired code/schema rollback preserving newly set credentials and no blanket NULL password reset. Production mismatch stops; only pre-reviewed rollback may run.

## Phase 99 — Business integrity, grading, read scope and freshness

State: PLANNED / dependency-gated on Phase 98 source and harness, not production deployment. Full WBS prepared, not dispatched.

Scope: reconstruct complete bootstrap from approved catalog and tracked migrations; preserve historical snapshots; atomic user/team/evaluator/init graph; authoritative SubLeader validation; transactional versioned criteria/grade configuration and grading reads; inventory/serverize sensitive reads plus least privilege; period switching, async Reports params and Compare invalidation.

Gate: clean bootstrap/replay + drift report; failure-injection and concurrent mutation/close tests; closed snapshot unchanged; no orphan/false success; invalid grade/relations rejected; no config fallback on writes; no cross-scope reads; UI period/team/data consistency and stale-cache regression tests. Actual RLS/grants enforcement also requires approved runtime apply/readback.

Rollback: new forward migrations with exact reverse contract; preserve old versions/snapshots, no rewriting already-applied legacy files; no live revoke before consumer cutover qualification.

## Phase 100 — AI governance, security headers and dependencies

State: PLANNED / dependency-gated on Phase 99.

Scope: atomic AI/chat quota; scoped minimal payload and coverage disclosure; provider/retention approval contract; report-only → enforced CSP canary; framework middleware/proxy compatibility only if current docs and runtime tests require it; dev/transitive advisory remediation.

Gate: concurrent quota cap, DB-failure handling; no cross-team identity disclosure; synthetic provider transport tests and owner governance acceptance; no hydration/chart/export/login regression under CSP; current full and production dependency audit with explicit tarball coverage limits. No paid live-model call implied.

Rollback: revert exact source/config version; keep prior CSP policy available; provider switch/security changes approved separately. No waiver without owner/reason/expiry.

## Phase 101 — Measured performance and UI quality

State: PLANNED / dependency-gated on Phase 100.

Routes: dashboard, employees, reports, evaluation detail, compare, history, settings. Viewports: 390x844, 768x1024, 1440x900. Roles: Manager/Leader/SubLeader/Employee/Worker as route permits.

Order: qualified baseline → duplicate reads/roundtrips → projections/payload → light/heavy waterfall → measured render transforms/lazy-load → bounded accessibility/responsive cleanup. Preserve URL/back-forward semantics and viewer-aware invalidation.

Evidence: same candidate/environment/data/sample method; cold/warm, query count/bytes, TTFB, shell-visible, first-light-visible, first-heavy-complete, full-complete and interaction latency. Lighthouse preset recorded first; at least two samples, median tie-break on >5-point spread. Do not compare development server to production build or empty unauthorized pages.

Gate: every retained optimization has measured net benefit, no correctness/security/visual regression; no horizontal overflow or first-party errors. A non-beneficial candidate is abandoned with evidence, not marked completed merely to satisfy task count.

## Phase 102 — Integration, controlled rollout and closure

State: PLANNED / dependency-gated on Phase 101.

Scope: extend existing CI to behavior/DB/browser/secret gates; full role/workflow/error/concurrency matrix; plan exact remaining migration rollout; owner-approved GitHub branch settings/deploy; reconcile Phase 96E lifecycle gate; final source/catalog/ledger/docs evidence.

Gate: P0 zero; P1 zero or explicitly accepted with owner/reason/expiry; canonical source and deployment linked; migration ledger/catalog match; DB/browser/root/security checks PASS; rollback evidence complete. No hidden waiver of Phase 96E: execute if approved, otherwise release remains gated until owner explicitly accepts omission.

No new feature phase before release closure. Final docs use observed pre-closure SHA, not an impossible self-referential commit SHA.

## Phase 96E — retained production lifecycle proof

State: PAUSED, re-evaluated after P102M1T02. Preserve P96T10–P96T13 IDs. Approve complete run/rollback envelope before first mutation; rollback executes on failure as well as happy-path completion, never waits for failed test task to be marked DONE. Use exact IDs, FK-safe transaction, baseline hashes and no concurrent evaluator writes. Do not create test data on live during planning.

## Deferred / owner-gated proposals (not executable project phases)

Cloudflare Tunnel/Access; QI Gia dụng / SubLeader UAT org-data changes; expanded chat/new feature ideas. No invented implementation tasks for unspecified requirements or already-DONE phases.

## Project tooling / execution policy

- Root checks: `npm run test`, `npm run lint`, `npm run typecheck`, `npm run build`, `git diff --check`; dependency checks `npm audit --json` and `npm audit --omit=dev --json` in isolated lane.
- Normal tests use `scripts/run-tests.mjs`; do not relabel in-memory audit tests as wrapper/DB/browser PASS.
- New verification commands in tasks are PROPOSED deliverables of P98M1T03, not currently available tooling. P98M1T03 must implement and exercise them before consumers execute. Missing tool => BLOCKED_CAPABILITY, no stub PASS.
- Browser: discovered `/usr/bin/google-chrome-stable`; synthetic local fixtures only by default. Existing tests/perf/benchmark-harness.mjs targets production and mutates sessions: never treat it as read-only.
- Source secret scan: new scanner gate must report only paths/rule IDs, never secret values. No credential/env reads by Runner.
- Proposed Runner root `/home/pi5/projects/kurabe-task-wt`; integration root `/home/pi5/projects/kurabe-integration-wt`; distinct task directories, no shared mutable .next or DB. These roots satisfy current Agy wrapper allowlists; verify wrapper capability before dispatch. Routine evidence stays under `/home/pi5/hermes-artifacts/kurabe-execution/`.
- MAX_PARALLEL_RUNNERS=2; MAX_CANDIDATE_VERIFIERS=1; PUBLISH_REFRESH_TIMEOUT=300 seconds; MACHINE_EXCLUSIVE lock for whole-machine checks. No infrastructure installed by this plan.
- Disposable outputs in isolated WT: `.tmp/testbuild`, `.tmp/verification`, `.next`, `tsconfig.tsbuildinfo`; evidence retained outside disposable cleanup with hashes. Never rebuild a serving .next.
- Single Mika control writer; `.state/control.lock` plus atomic rename for state. Liveness: exact captured PID/start-time/job handle matched via `ps -p <pid> -o pid=,lstart=,args=` plus wrapper completion; matching live process=LIVE, confirmed exit=DEAD, ambiguous=UNKNOWN. Unknown reservations retained.
- All external actions Mika-owned; Runner owns only code/test files. No task grants credentials, push, permissions, DB mutation or deploy without separate owner approval.
- Each task includes wiring + matching tests. Keep stable IDs; no auto-sweep that removes unresolved dependencies; future task context revalidated immediately before dispatch.