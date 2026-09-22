# KNOWN_BUGS — historical audit index (SUPERSEDED)

> **Status: SUPERSEDED / CLOSED — historical provenance only.** This file is retained solely as the index of the 2026-09-11 source audit. It is **not** an active residual list: every finding below was executed and closed by its `P102M3Txx` task, with later re-verification in P104.
> For current phase status read `.ai/MASTER_PLAN.md`; for the active task DAG read `tasks.md`. **Do not reopen or re-plan a phase from the table below.**

Baseline `ef4008df0f0fa55706307b1b84fa19988e69a02a`; PLAN_ONLY candidate. Source findings and evidence tiers are detailed in `AUDIT_2026-09-11.md`.

| Finding | Subject | Task | Status |
|---|---|---|---|
| F01/F02 | Evaluation transitions and exact scoring configuration | P102M3T04 (re-verified P104M1T01/P104M1T02) | CLOSED |
| F03/F04 | Credential/session lifecycle and bcrypt byte limit | P102M3T02 (re-verified P104) | CLOSED |
| F05 | Atomic login admission and verified proxy boundary | P102M3T03 (re-verified P104M1T01) | CLOSED |
| F06 | Transaction-local personnel authorization/deletion graph | P102M3T05 | CLOSED |
| F07 | Submitted-result AI input and persistent coverage | P102M3T06 (re-verified P104M1T03) | CLOSED |
| F08 | AI redirect/transport boundary | P102M3T07 (re-verified P104M1T03) | CLOSED |
| F09 | Viewer cache/invalidation/error consistency | P102M3T08 (re-verified P104M1T01) | CLOSED |
| F10 | Honest evidence + actual authenticated app/CI/performance | P102M3T01, P102M3T13, P102M3T09–P102M3T11 | CLOSED |
| F11 | Stale control/runtime/workspace provenance | P102M3T12 | CLOSED |

These were source/probe findings and qualified risks, not all reproduced production incidents. OPTIONAL_PASSWORD is accepted; strict activation is deferred. All rows are CLOSED as of the P104 closure; see `.ai/MASTER_PLAN.md` for phase outcomes and the `P105` section of `tasks.md` for the current bounded cleanup.
