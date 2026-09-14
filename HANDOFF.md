# HANDOFF — Kurabe P103 execution

- State: `RUNNING`; owner approved execution of the current P103 plan; production remains read-only.
- Canonical pre-execution HEAD: `ab4d6a798946ff26c565d17095685a1571688db9`; code source anchor is unchanged.
- Existing owner changes in `AGENTS.md` and `docs/PRODUCTION_RUNBOOK.md` are preserved and excluded from task ownership.
- P103 has 13 pending tasks; current gate is `P103M1T01` disposable confirmation fixture qualification.
- All task Runner work must use isolated Git worktrees, forward migrations, disposable DB/runtime only, and independent verification/review.
- No production write, deployment, credential publication, migration apply, or unrelated refactor is authorized.
- Prior production closure/evidence remains historical context only; this execution must not treat it as new verification.
- Next action: register P103 state under `control.lock`, create the clean task worktree, and dispatch `P103M1T01`.
- Durable evidence/state paths: `.state/agent-state.json`, `.state/control.lock`, `.state/SYSTEM_ALERT.md` when blocked.
- Final gate requires exact-candidate disposable E2E, CI/release verification, fresh independent review, and canonical readback.
