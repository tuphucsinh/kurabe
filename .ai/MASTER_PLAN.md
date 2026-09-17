# Kurabe — current plan and closed execution record

## Current control state

- `PLAN_STATUS=ACTIVE_BOUNDED_REMEDIATION`
- Canonical repository: `/home/pi5/projects/kurabe`
- Branch: `main`
- Baseline for this phase: `ea7b64fb0eafac1406780b0c0632757638d1f8f3`
- P103 remains closed: **13/13 DONE**.
- CI repair task `t_7c812262` is closed at the baseline above; remote CI is green.
- F06 is closed and must not be reopened by this phase.
- Remaining confirmed MEDIUM findings: **F01–F05 + F07–F09**.
- F09 is confirmed as a current-read authorization bug after secondary-team Leader revocation; it is not a write bypass.
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

## Historical / owner-gated records

- P102 production closure remains historical provenance.
- Strict-password go-live and broad credential migration remain deferred by the optional-password decision.
- `P102M2T01` repository-settings governance and `P96T11–P96T13` lifecycle/rollback work remain owner-gated and are not part of P104.
