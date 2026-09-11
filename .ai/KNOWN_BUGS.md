# KNOWN_BUGS — active audit residual index

Baseline `ef4008df0f0fa55706307b1b84fa19988e69a02a`; PLAN_ONLY candidate. Source findings and evidence tiers are detailed in `AUDIT_2026-09-11.md`; `tasks.md` is sole repair DAG. Old entries archived, not silently declared fixed.

| Finding | Residual | Planned task |
|---|---|---|
| F01/F02 | Evaluation transitions and exact scoring configuration | P102M3T04 |
| F03/F04 | Credential/session lifecycle and bcrypt byte limit | P102M3T02 |
| F05 | Atomic login admission and verified proxy boundary | P102M3T03 |
| F06 | Transaction-local personnel authorization/deletion graph | P102M3T05 |
| F07 | Submitted-result AI input and persistent coverage | P102M3T06 |
| F08 | AI redirect/transport boundary | P102M3T07 |
| F09 | Viewer cache/invalidation/error consistency | P102M3T08 |
| F10 | Honest evidence + actual authenticated app/CI/performance | P102M3T01, P102M3T13, P102M3T09–P102M3T11 |
| F11 | Stale control/runtime/workspace provenance | P102M3T12 |

These are source/probe findings and qualified risks, not all reproduced production incidents. OPTIONAL_PASSWORD is accepted; strict activation is deferred. No claim all older incidents are fixed merely because a task has a historical [x].
