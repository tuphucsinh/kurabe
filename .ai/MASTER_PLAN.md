# Kurabe — current plan and closed execution record

## Current control state

- `PLAN_STATUS=P105_REGISTERED` (P104 closed — see "P104 closure" below)
- Canonical repository: `/home/pi5/projects/kurabe`
- Branch: `main`
- Historical P104 phase baseline: `ea7b64fb0eafac1406780b0c0632757638d1f8f3`
- P104 execution baseline after control activation: `03a13da06ce549b6212bf9f32c28937e994dd048`
- P103 remains closed: **13/13 DONE**.
- CI repair task `t_7c812262` is closed at the baseline above; remote CI is green.
- F06 is closed and must not be reopened by this phase.
- Remaining confirmed MEDIUM findings: **none; F01–F05 and F07–F09 are closed**.
- F09 was confirmed as a current-read authorization bug after secondary-team Leader revocation and is closed without a write-path change.
- Production deployment, production catalog reconciliation, and production DB mutation are outside this phase.

## P104 — bounded audit remediation

### Goal

Fix the remaining eight confirmed MEDIUM findings without changing the approved five-role evaluation workflow, scoring policy, passwordless compatibility, historical P103 provenance, or overall architecture.

### Execution model

- Three implementation tasks may run in parallel in isolated worktrees when ownership is non-overlapping.
- One qualification task runs only after all implementation tasks are integrated.
- Runners do **not** edit `tasks.md` or this plan; Mika owns task state, integration, and evidence.
- Keep fixes local and reuse existing primitives/DTOs. No new auth framework, cache framework, result framework, or broad rewrite.
- Ordinary test/tool/runtime blockers are self-resolved inside the owning task.
- No production writes, production migrations, or deployment in P104.

### Task groups

| Task | Scope | Findings | Dependency | Parallel-safe |
|---|---|---|---|---|
| `P104M1T01` | Scope/state correctness | F01, F05, F09 | none | yes |
| `P104M1T02` | Output/data correctness | F02, F03, F04 | none | yes |
| `P104M1T03` | Release-gate truth | F07, F08 | none | yes |
| `P104M2T01` | Consolidated qualification | all above | T01 + T02 + T03 integrated | no |

### Exit criteria

P104 closes only when:

1. F01–F05 and F07–F09 each have a focused regression proving the old failure and the corrected behavior.
2. Root tests, typecheck, lint, build, secret scan, and relevant authenticated/runtime checks pass on one frozen integrated candidate.
3. F07 ACL verification detects PUBLIC/direct/inherited effective EXECUTE correctly and binds the exact overload.
4. F08 cleanup failures affect verdict and residue is read back as zero.
5. F09 denies fresh current-read access after Leader revocation while preserving legitimate submitted/Approved historical read.
6. Production writes/migrations remain `0/0`.
7. One consolidated final review is run after candidate freeze; no per-finding review loop.
8. Canonical repository is clean and exact candidate SHA/evidence are recorded.

### Non-goals

- Do not reopen F06.
- Do not redesign the five-role workflow.
- Do not change evaluation scoring policy or grade semantics beyond fixing score `0` nullish handling.
- Do not remove existing transaction locks without separate measured concurrency evidence.
- Do not mass-delete P103 tests/docs/evidence.
- Do not deploy or mutate production as part of P104.

## Closed P103 provenance

P103 remains historical and closed. Primary evidence root:
`/home/pi5/hermes-artifacts/kurabe-p103/`

Key closure anchors:

- P103M4T01: `117215934afaaca9553815db462d2e5fb8da68e8`
- P103M4T02: `5f934b9f885f0e2ddd32f9ad5151e200891cee8f`
- P103M4T03: `9f07ce3bdb06c1b5fe9f8cb315644b1444493ac3`
- P103M4T04 control closure: `f8b60677ab3944721e864ea7ad92ef8908bc024b`

The post-closure audit confirmed F01–F08 as bounded MEDIUM findings. F09 was subsequently reproduced and confirmed separately. P104 is the first executable remediation phase for those remaining findings.

## P104 closure

- Integrated candidate: `9a8c988be603507142a4a8afe854deec108560a0`.
- All focused/root/authenticated/runtime gates passed; production writes/migrations remained `0/0`.
- Fresh independent review: AGY `gemini-3.8-flash-high`, exact candidate/tree verified, verdict `PASS`, blocking findings `NONE`.
- Remote GitHub Actions CI run `35193543798` passed on the exact integrated candidate; remote `main` matches it.
- Evidence root: `/home/pi5/hermes-artifacts/kurabe-p104/`; no P104 runtime/worktree residue remains.

## P105 — bounded cleanup (registered 2026-09-22)

### Goal
Close four verified findings from the P104-close review without changing runtime architecture: disposable CI credentials leaking clear-text into public job logs, no production-runtime smoke in CI, ~400 lines of unreachable legacy evaluation code, and a performance baseline 139 commits stale. Plan reviewed `PASS` by agy/gemini-3.1-pro-high before registration.

### Task groups
| Task | Scope | Dependency | Tier |
|---|---|---|---|
| `P105M1T01` | CI hygiene: `::add-mask::` in `exportEnv()` + 5-case production smoke after build | none | CONTROLLED |
| `P105M1T02` | Delete unreachable legacy fallbacks in `src/actions/evaluation.ts` | none | STANDARD |
| `P105M1T03` | Rerun existing perf harness, 5 samples/point, median/p95 | T01 + T02 | STANDARD |

Control-plane (Mika, separate control commit): `.ai/KNOWN_BUGS.md` re-marked as a historical index so it can no longer be read as an active residual list.

### Exit criteria
1. Public CI logs contain no disposable credential values (mask verified by source-contract test + log grep).
2. Production smoke runs fail-closed in CI after `npm run build`.
3. No sequential/legacy fallback remains in the two evaluation actions; focused/source-contract tests and all root gates pass.
4. Fresh perf report bound to the current candidate SHA with 5 samples/point; dataComplete median < 1000 ms on LAN/loopback.
5. Production writes/migrations remain `0/0`; one fresh CONTROLLED review on the `P105M1T01` candidate.

### Non-goals
- Dashboard/Reports "Approved-only" semantics: owner decision, not in P105.
- ESLint warning cleanup, Next build cache in CI, Excel/xlsx replacement: deferred/skipped.
- No new framework, workflow engine, auth framework, secret manager, or benchmark system.

## Historical / owner-gated records

- P102 production closure remains historical provenance.
- Strict-password go-live and broad credential migration remain deferred by the optional-password decision.
- `P102M2T01` repository-settings governance and `P96T11–P96T13` lifecycle/rollback work remain owner-gated and are not part of P104.
