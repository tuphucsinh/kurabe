# HANDOFF — Kurabe QAQC

- Canonical `main` = `96cb1018d13b09a2449f66706d2c24aaf75d3fec`; protected pre-existing `AGENTS.md` remains the only dirty path.
- `P99 = DONE`; `OPEN_P0=0`; `OPEN_P1=0`; P99 INFO/browser limitations remain explicit P102 residuals.
- `P100M1T01` and `P100M1T02` are published with CONTROLLED `PASS/HIGH` reviews.
- `P100M2T01` is published at `cefa192c4752f7de32142a23838b221e6d7f2fc3`, review `PASS/HIGH`, `publish_safe=true`.
- P100M2T01 evidence/review are retained under `/home/pi5/hermes-artifacts/kurabe-execution/`.
- `P100M2T02` is published at `96cb1018d13b09a2449f66706d2c24aaf75d3fec`; full/prod audits are clean.
- P100M2T02 evidence: `/home/pi5/hermes-artifacts/kurabe-execution/p100m2t02-candidate-evidence.json`.
- Next READY task: `P101M1T01` reproducible performance baseline; Phase 101 is now dependency-ready.
- P101M2T01/P101M2T02/P101M3T01 and Phase 102 remain dependency-gated; no task outside the canonical DAG.
- `P98M2T05 = READY_FOR_OWNER_APPROVAL`; `PASSWORD_MODE=OPTIONAL`; strict enforcement remains deferred.
- `PRODUCTION_MUTATION=NONE`; no deploy, push, production DB/env/credential change, or strict-password activation.
- Authenticated live browser remains `NOT_RUN_AUTH_REQUIRED`; real provider remains `NOT_RUN_NO_CREDENTIALS`.
- Protected `AGENTS.md` is untouched, unstaged, and uncommitted; preserve it on every canonical operation.
- Six legacy unregistered workspace roots remain preserved; do not delete or infer cleanliness.