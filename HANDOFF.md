# HANDOFF — Kurabe QAQC

- Canonical `main` = `ab38e9dcf53c14345ae8086bf53ba6241e52e980`; protected pre-existing `AGENTS.md` remains the only dirty path.
- `P99 = DONE`; `OPEN_P0=0`; `OPEN_P1=0`; INFO/browser limitations remain explicit P102 residuals.
- `P100 = DONE` for non-production source/local execution; P100M1T01/T02 and P100M2T01 are published with required reviews; P100M2T02 audits are clean.
- P100 evidence/reviews are retained under `/home/pi5/hermes-artifacts/kurabe-execution/`.
- `P101M1T01`, `P101M2T01`, and `P101M2T02` are published at `b9ed77012a14da28c4e9f186e055f154a60a5cc8`; P101M3T01 is published at `ab38e9dcf53c14345ae8086bf53ba6241e52e980`; evidence is retained under `/home/pi5/hermes-artifacts/kurabe-execution/`.
- `P101 = DONE` for non-production source/local execution; next READY task: `P102M1T01` CI verification.
- Phase 102 remains production/owner-gated; no task outside the canonical DAG.
- `P98M2T05 = READY_FOR_OWNER_APPROVAL`; `PASSWORD_MODE=OPTIONAL`; strict enforcement remains deferred.
- `PRODUCTION_MUTATION=NONE`; no deploy, push, production DB/env/credential change, or strict-password activation.
- Authenticated live browser remains `NOT_RUN_AUTH_REQUIRED`; real provider remains `NOT_RUN_NO_CREDENTIALS`.
- Protected `AGENTS.md` is untouched, unstaged, and uncommitted; preserve it on every canonical operation.
- Six legacy unregistered workspace roots remain preserved; do not delete or infer cleanliness.