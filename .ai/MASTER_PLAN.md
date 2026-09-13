# MASTER_PLAN — Kurabe QAQC (current state)

## Current status

- `PROJECT_STATE=COMPLETE`.
- Production: `LIVE`.
- Release status: `COMPLETE`.
- Current production/source SHA: `76221ca0a3e2813a2743a0ad74d3be7fb57306d4`.
- Canonical branch: `main`; repository `HEAD` and `origin/main` match the documentation closure commit, while the deployed production/source SHA remains `76221ca0a3e2813a2743a0ad74d3be7fb57306d4`.
- Production alias: `https://lykiv.vercel.app`; deployment state: `READY`.
- Final closure evidence: `/home/pi5/hermes-artifacts/kurabe-execution/production-release-closure-76221ca.log`.
- Worktree cleanup: `PASS`; only `/home/pi5/projects/kurabe` remains.
- `MANDATORY_OPEN_WORK=NONE`.

This document owns current outcomes, invariants, residual risk, and approval boundaries. `tasks.md` is the compact task classification ledger. Historical task contracts and detailed evidence remain in Git, `.state/agent-state.json`, and timestamped artifacts; they are not alternate execution authority.

## Architecture and business rules that matter now

- `users.team_id` is primary membership.
- `teams.leader_id` is an independent leadership assignment.
- One active Leader may lead multiple teams; a valid appointed pointer is not overwritten by primary membership.
- Server-authenticated actor scope, active role checks, and team/leadership scope are authoritative; client role/team context is not authority.
- Submitted/closed evaluation history and configuration versions remain immutable; active writes use the transactional/versioned guards.
- Sensitive reads, cache/query identity, period changes, mutation invalidation, and resident UI transitions remain viewer/scope-aware and fail closed on errors.
- Optional-password compatibility remains the current mode. Strict password go-live, bulk forced setup, and global NULL-password lockout are deferred and require a separate owner decision.

Production example retained because it validates the corrected personnel model: Nguyễn Thị Lan Nhi has primary team `QI Xe hơi` and is the appointed Leader of both `QI Xe hơi` and `QI-KIV2`.

## Completed milestones

- Auth/session/password lifecycle and byte-safe credential handling.
- Login admission/rate limiting and explicit proxy trust boundaries.
- Personnel transaction authorization, history preservation, multi-team Leader relations, and deletion graph protection.
- Evaluation transition monotonicity and exact criteria/grade configuration versioning.
- AI quota/accounting, payload governance, summary coverage persistence, and egress/response boundaries.
- Viewer-scoped cache freshness, resident period/team scope, mutation failure handling, and authenticated release matrix/CI contracts.
- Measured authenticated application performance baseline and bounded optimization.
- Release/rollback manifest, migration compatibility, backup/readback, and evidence packaging.
- Production migrations and schema compatibility: `PASS`.
- Production deployment and alias cutover: `PASS`.
- Authenticated production smoke: `PASS` — login, dashboard, normal reads, QI Xe hơi, QI-KIV2, unrelated-team denial, zero HTTP 5xx/page/visible errors.
- Temporary credential cleanup: `PASS` — sessions and active setup tokens are zero; no secret file retained.
- Registered/stale worktree cleanup: `PASS` — no noncanonical Kurabe worktree remains.

## Remaining boundaries

`MANDATORY_OPEN_WORK=NONE`.

The following are intentionally non-blocking and must not be auto-dispatched:

- `P102M2T01`: optional repository branch-protection/settings governance; `OWNER-GATED` and requires explicit approval plus fresh settings readback.
- `P96T11–P96T13`: lifecycle transition, stale/Closed proof, and exact-ID rollback; `DEFERRED / OWNER-GATED` because no lifecycle mutation was required for this release.
- Strict-password go-live and any broad credential migration: deferred by the optional-password decision.

No current state is `RUNNING`, `READY`, `BLOCKED`, or `UNKNOWN`; a future owner-approved lane must be created explicitly rather than inferred from this historical plan.

## Evidence and protection boundaries

- Release evidence: `/home/pi5/hermes-artifacts/kurabe-execution/production-release-closure-76221ca.log`.
- Worktree evidence: `/home/pi5/hermes-artifacts/kurabe-worktree-cleanup/`.
- `AGENTS.md` is protected and was not modified by this sweep.
- `docs/PRODUCTION_RUNBOOK.md` contains pre-existing owner changes and was preserved byte-for-byte by this sweep.
- No code, migration, dependency, deployment, production-data, credential, permission, or external-settings mutation is authorized by this document.
