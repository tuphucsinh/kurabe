# MASTER_PLAN — Kurabe QAQC

## Revision and authority

Canonical audit replan, 2026-09-11. Published from observed baseline `ef4008df0f0fa55706307b1b84fa19988e69a02a`, branch `main`. **CANONICAL / EXECUTION_AUTHORIZED_FOR_NON_PRODUCTION / PRODUCTION_GATES_RETAINED**.

Current request: execute the existing residual DAG continuously through all non-production tasks. Push, deploy, credentials, permissions, security settings, production and lifecycle mutation remain separately gated. Protected owner `AGENTS.md` remains byte-preserved and unstaged.

`tasks.md` is the sole active WBS/DAG. This document owns outcomes, invariant policy and recorded completion history; `.ai/AUDIT_2026-09-11.md` owns this audit's findings/coverage. Archived plans/tasks are historical, never alternate execution authority.

## Verdict and current evidence

**SOURCE=NEEDS_FIX; ALL_LOGIC_CORRECT=NOT_PROVEN; OPTIMAL=NOT_PROVEN; PRODUCTION_READINESS=UNKNOWN.**

Fresh isolated tracked-source export: npm test 40/40 files PASS; lint 0 errors/13 warnings; typecheck/build PASS; scanner 195 files/0 findings within default src/scripts scope; full/production npm registry audit 0 advisories. Logs and synthetic auth probes: `/home/pi5/hermes-artifacts/kurabe-audit-ef4008d/`. No real credentials copied; no production DB/browser/provider invoked. Canonical diff-check fails only on pre-existing protected AGENTS whitespace; keep that failure, do not call canonical clean.

Reproduced in actual helper/action at mocked boundaries: bcrypt byte truncation; optional login after reset-pending state; stale credential/session issue seam. Reproduced harness acceptance: no tests exit 0; absent passed accepted. SQL/action source gaps: evaluation repeat-submit state downgrade, grading version propagation, personnel transaction scope, AI summary coverage persistence, rate-admission concurrency and redirect allowlist seam. See per-finding classification; source-backed race is not live PostgreSQL execution proof.

Release evidence correction: prior release matrix reports include disposable DB cases but browser component combines guest navigation and source assertions. A five-role list is not five authenticated executions. Performance local-fixture results remain useful in their original tier, not whole-app optimality evidence. Existing recorded integrations remain historical, not re-opened IDs or newly re-certified completeness.

Three delegated audit branches were attempted and timed out without usable output: auth/security, business logic, and frontend/performance. `INDEPENDENT_AUDIT=INCOMPLETE`; `INDEPENDENT_REVIEW=NOT_RUN`; timeout is neither a finding nor a task failure. Remaining full authenticated runtime, deployed schema/flags/CI enforcement, true provider, data-volume/performance matrix are UNKNOWN. Insufficient data. for an exhaustive correctness or production-optimality claim.

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

## Phase 98 product decision — OPTIONAL_PASSWORD (preserved)

- `CURRENT_AUTH_MODE=OPTIONAL_PASSWORD`; `STRICT_PASSWORD_GO_LIVE=DEFERRED` because Kurabe is not yet in official operation. `password_hash IS NULL` remains usable through the legacy/beta flow without forced setup; `password_hash IS NOT NULL` requires the correct password and cannot be bypassed.
- `KURABE_REQUIRE_PASSWORD_LOGIN` has a source-enforced exact gate: absent and `false` use OPTIONAL behavior; exact `true` is STRICT behavior. Phase 98 must not activate `true` or mutate an absent flag merely for cosmetic explicitness.
- Completed password artifacts are classified as follows: `P98M2T01` password setup schema/tokens = `APPLY_NOW_OPTIONAL`; `P98M2T02` setup/reset RPCs and session revocation = `APPLY_NOW_OPTIONAL`; `P98M2T03` setup/reset application flow = `APPLY_NOW_OPTIONAL`; `P98M2T04` bulk marking NULL-password users as setup-required = `DEFER_TO_STRICT_GO_LIVE`; `P98M2T06` compatibility login = `APPLY_NOW_OPTIONAL`; `P98M2T07` configured-account credential change and other-session revocation = `APPLY_NOW_OPTIONAL`; `P98M2T08` login rate limiting = `APPLY_NOW_OPTIONAL`.
- Individual secure reset/setup actions may transition one account from NULL to a bcrypt hash and then enforce that account's password. No bulk force setup, shared/default password, global NULL-password lockout, or strict env activation belongs in Phase 98.
- Canonical source-contract evidence covers A–F: optional legacy login, correct configured-password login, missing/wrong configured-password rejection, secure setup/reset, and post-setup password enforcement. No bounded compatibility task is required; do not create P98M2T11.
- Strict password enforcement is deferred until the owner explicitly declares real go-live; then create a separate preflight → setup/remaining-NULL inventory → optional mark/setup-required → strict flag → smoke/postflight plan. Do not mix that future rollout into Phase 98.

Audit clarification for a proposed future candidate: distinguish never-configured legacy accounts from accounts intentionally reset; choose and approve the reset-pending transition explicitly, without global strict rollout or blanket NULL-account lockout. Local implementation plan does not authorize live credential semantics changes.

## Integrated history / safe document compaction

Phases 32–93 historical DONE; 94 absorbed into 95; 95 staged-loading complete; 96 source/history retained with 96E live lifecycle paused; 97 history route integrated. None is newly re-certified by this audit.

Phase 98 source/prerequisite task completions retained; only auth/evaluator live gates pending. Phases 99/100/101 remain recorded local-source integrations with residual defects/coverage now routed to P102M3, not blindly repeated. P102M1T01 and P102M1T02 are integrated, not “next”. P102 live cutover/final closure remain pending.

The prior WBS has 31 recorded completed IDs. Full previous task/master/known-bug bytes are archived in `.ai/archive/*-pre-audit-ef4008d.md`. The proposed active queue omits their detail but preserves this ledger and all unresolved production gates. This is **historical document compaction**, not a new 100%-verified phase sweep or authorization to remove workspaces/state/evidence. Formal SWEEP/DONE remains blocked where new findings contradict original acceptance.

| Recorded completed ID | Historical deliverable — not a fresh whole-product PASS |
|---|---|
| P98M1T01 | Framework patch |
| P98M2T01 | Password setup schema candidate |
| P98M2T02 | Password reset/setup RPC and strict path |
| P98M2T06 | Temporary passwordless compatibility |
| P98M3T01 | Evaluator NULL-safety candidate |
| P96T10 | Existing lifecycle baseline |
| P98M1T02 | Reconcile production truth and retained task evidence |
| P98M1T03 | Qualify isolated DB/browser/security verification lane |
| P98M2T03 | Close setup route and Manager token handoff |
| P98M2T04 | Qualify existing legacy setup migration, do not reimplement blindly |
| P98M2T07 | Unify self-change credential state and session revocation |
| P98M2T08 | Make login throttling fail-safe and proxy-aware |
| P98M2T09 | Forensic reconcile production login_attempts schema |
| P98M2T10 | Bounded login_attempts reconciliation migration |
| P99M1T01 | Reproducible complete DB baseline and migration replay |
| P99M2T01 | Preserve historical evaluations during personnel changes |
| P99M2T02 | Atomic personnel/team/init and validated leadership relations |
| P99M3T01 | Atomic versioned grade bands and authoritative scoring |
| P99M3T02 | Atomic criteria/audiences/levels with historical version reads |
| P99M4T01 | Sensitive read inventory, serverization and least privilege candidate |
| P99M4T02 | Period/filter freshness and Compare mutation invalidation |
| P100M1T01 | Atomic AI/chat quota and failure accounting |
| P100M1T02 | AI payload, provider and coverage governance |
| P100M2T01 | CSP enforcement and framework boundary qualification |
| P100M2T02 | Dependency advisory remediation with reproducible lockfile |
| P101M1T01 | Reproducible performance baseline and route matrix |
| P101M2T01 | Reduce Dashboard/Reports request and payload cost |
| P101M2T02 | Bound detail/compare/history and personnel render cost |
| P101M3T01 | Responsive/accessibility residual closure |
| P102M1T01 | Enforce real verification in existing CI |
| P102M1T02 | Full release integration and rollback package |

## Chosen approach / integration topology

Reuse existing Next/React/Query/Supabase/versioned RPC architecture and existing wrappers. Fix authoritative transaction/auth/evidence seams; no rewrite, new dispatcher/cache/framework/service or feature phase. This is one bounded Optimality Check: authentic baseline + measured repair has materially better correctness/cost than speculative global optimization.

P102M3: fail-closed evidence → reusable actual-app authenticated fixture → session/admission and evaluation/personnel/config repair → persisted AI truth/provider boundary and client-scope freshness → combined real-app role matrix/CI → measured performance → fresh release/rollback package. Separate Mika-only stale-runtime/control reconciliation before any rollout. Detailed IDs/owns/locks/commands live only in tasks.md.

Data path targets: rendered criteria/grade versions → action validation → exact-version transactional scoring/submit; server actor → locked actor/target scope → personnel graph; submitted historical results → bounded AI payload → persisted coverage → report/minutes readback; viewer/role/team/period → query identity → mutation invalidation → coherent render/export.

UI: preserve existing authenticated dashboard/table/detail/report composition, labels and approved assets. Repair loading/error/empty/retry/stale scope before aesthetic changes. Layer ownership: shell belongs to route/layout; light summary and heavy table/chart belong to scoped data layers; each may finish later only with visible state and matching current generation. Measure shell-visible / first-light-visible / first-heavy-complete / full-complete, never count a skeleton/redirect as data-ready. Viewports 390x844, 768x1024, 1440x900; all five roles as actual route access permits.

## Release and rollback gates

Production path remains P98M2T05 → P98M3T02 → P102M2T01 → P96T11 → P96T12 → P96T13 → P102M2T02. Existing historical prerequisites are retained by ID; P98M2T05 additionally waits for new exact release package and state/runtime reconciliation. Any emergency rollback follows the approved complete run envelope without waiting for a failed success-path task to become DONE.

Before production: exact reviewed candidate; fresh approved catalog/deployment/flags fingerprint; source/schema consumer compatibility ordering; byte backup; version/hash-bound rollback; owner approval covering credentials/permissions/settings/deploy/lifecycle. Changed candidate invalidates old release review. Missing live data fails closed. No global strict auth, no provider-governance acceptance, no CI-hosted enforcement implied by local green checks.

## Project tooling / execution constraints

Root commands: `npm run test`, `npm run lint`, `npm run typecheck`, `npm run build`, `git diff --check`; secret `node scripts/scan-source-secrets.mjs`; registry `npm audit --json`, `npm audit --omit=dev --json`; suites `node scripts/verify-release.mjs --suite <exact-suite>`. New suite/migration names in WBS are planned deliverables, never claimed existing. Wrong tier, zero cases, missing API/Chrome/DB => explicit capability block; no fake success.

Runner/integration roots `/home/pi5/projects/kurabe-task-wt` and `/home/pi5/projects/kurabe-integration-wt` are distinct planned roots to verify against current wrapper before dispatch. MAX_PARALLEL_RUNNERS=2, MAX_CANDIDATE_VERIFIERS=1, PUBLISH_REFRESH_TIMEOUT=300 seconds; MACHINE_EXCLUSIVE conflicts with all reservations. Discover CHROME_BIN; local fixture only by default. Production-targeting perf/session harness must not run by accident.

Single Mika writer under `.state/control.lock` + atomic rename; exact PID/start/job liveness LIVE/DEAD/UNKNOWN before release of reservations. Canonical registration and T12 reconciliation have completed under explicit execution authority; historical contradictory reservation/base/next_action evidence remains preserved, while current reservations are task-scoped. Known roots include registered WTs plus legacy unregistered roots and audit copies; preserve unknown/evidence-bearing paths. Separate canonical Git, registered WT and filesystem-root cleanliness.

Disposable isolated outputs: `.tmp/testbuild`, `.tmp/verification`, `.next`, `tsconfig.tsbuildinfo`. No serving .next rebuild. Routine artifacts `/home/pi5/hermes-artifacts/kurabe-execution/`; important canonical contracts live in repo. No new installs/runtime/service/settings permission is granted by this plan.

## Next gate

Canonical plan publication and exact DAG registration are complete. P102M3T12 is verified with fresh independent review; P102M3T01 is the active AGY candidate at the registered base. Next: Mika verifies the unchanged T01 worktree after runner exit, then applies the CONTROLLED review/publish gate; no production/lifecycle mutation is implied.
