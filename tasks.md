# KURABE — current control ledger

## Authority / final status

- `PROJECT_STATE=COMPLETE`; this file is the canonical status ledger after the final production release and control/documentation sweep.
- Production/source SHA: `76221ca0a3e2813a2743a0ad74d3be7fb57306d4`; current repository `HEAD` and `origin/main` are the documentation closure commit.
- Production is LIVE and the release is COMPLETE. Production closure evidence: `/home/pi5/hermes-artifacts/kurabe-execution/production-release-closure-76221ca.log`.
- `.ai/MASTER_PLAN.md` owns current outcomes/invariants; this file owns the compact classification of every task retained by the former active WBS. Detailed historical task contracts remain recoverable in Git, `.state/agent-state.json`, and timestamped evidence.
- No active Runner, candidate, reservation, task/integration worktree, quarantine, or actionable `RUNNING`/`READY`/`BLOCKED`/`UNKNOWN` task remains.
- `MANDATORY_OPEN_WORK=NONE`.
- Protected owner changes remain untouched: `AGENTS.md` and `docs/PRODUCTION_RUNBOOK.md`.

## Completed P102M3 and release milestones

| Task / milestone | Classification | Canonical anchor or evidence |
|---|---|---|
| P102M3T01 — fail-closed verification/evidence contracts | DONE | Recorded PASS in `.state/agent-state.json`; canonical history/evidence under `/home/pi5/hermes-artifacts/kurabe-execution/` |
| P102M3T02 — credential/session lifecycle | DONE | Recorded PASS; production session/credential behavior and cleanup also PASS |
| P102M3T03 — login admission/proxy trust | DONE | Recorded PASS; production migration/readback included in release closure |
| P102M3T04 — evaluation transition/config versioning | DONE | Recorded PASS; production schema compatibility PASS |
| P102M3T05 — personnel actor scope/deletion graph | DONE | Recorded PASS; production personnel transaction repair/readback PASS |
| P102M3T06 — persistent AI summary coverage | DONE | Recorded PASS; release package and paired rollback evidence retained |
| P102M3T07 — AI egress/response boundary | DONE | Recorded PASS in completion history |
| P102M3T08 — viewer cache, mutation errors, resident freshness | DONE | Canonical commit `680b0efcd42ad581a6d03158fcd996b608386715`; browser/source-contract evidence retained |
| P102M3T09 — authenticated release matrix/CI enforcement | DONE | Canonical commit `8c76269834d6c13fdda2dfd1f0a3fc35e00f01a8`; release matrix PASS |
| P102M3T10 — measured performance baseline/optimization | DONE | Canonical commit `4efe42d979e231299663c669d0573199a58b0351`; performance evidence retained |
| P102M3T11 — final release/rollback package | DONE | Release package review PASS; later production release closure supersedes its pre-release source anchor |
| P102M3T12 — stale runtime/control/workspace reconciliation | DONE | Worktree cleanup PASS; only canonical repository remains |
| P102M3T13 — reusable authenticated local fixture | DONE | Fixture lane PASS and fully cleaned |
| Production migrations/schema compatibility | DONE | Production migration ledger/readback PASS; no production rollback required |
| Production deployment and alias cutover | DONE | Source `76221ca0a3e2813a2743a0ad74d3be7fb57306d4`; deployment READY; alias `https://lykiv.vercel.app` |
| Authenticated production smoke | DONE | Login/dashboard/read/deny matrix PASS; `HTTP_5XX=0`, `PAGE_ERRORS=0`, `VISIBLE_APP_ERRORS=0` |
| Multi-team Leader contract | DONE | `users.team_id` is primary membership; `teams.leader_id` is leadership assignment; production QI-KIV2 read PASS |
| Temporary credential cleanup | DONE | Reset RPC PASS; `SESSIONS=0`, `ACTIVE_SETUP_TOKENS=0`, no secret file retained |
| Kurabe worktree cleanup | DONE | 30 registered noncanonical worktrees + 11 stale sibling paths removed; only canonical repository remains |

## Retained IDs: future, owner-gated, or superseded

These are not current execution tasks. They remain only for traceability and must not be auto-dispatched.

| Task | Classification | Boundary / reason |
|---|---|---|
| P98M2T05 — old auth/framework rollout lane | OBSOLETE/SUPERSEDED | Replaced by the actual optional-password production release path. Strict password go-live remains separately deferred; no global forced setup is implied. |
| P98M3T02 — old evaluator NULL-safety rollout lane | OBSOLETE/SUPERSEDED | Superseded by the integrated evaluation guards, migration package, production schema/readback, and final release path. |
| P102M2T01 — branch-protection/settings lane | OWNER-GATED | Optional repository-settings governance is not required to keep the released runtime live; execute only after explicit owner approval and a fresh settings readback. |
| P102M2T02 — final release evidence/durable closure | DONE | Closed by production release evidence, worktree cleanup, and this final control/documentation sweep. |
| P96T11 — controlled lifecycle transition | DEFERRED / OWNER-GATED | No lifecycle mutation was required for this release; do not create or close production periods without a separate approved envelope. |
| P96T12 — stale/Closed behavior on run-created data | DEFERRED / OWNER-GATED | Depends on the deferred lifecycle envelope and exact approved fixture IDs. |
| P96T13 — exact-ID lifecycle rollback | DEFERRED / OWNER-GATED | Recovery companion for the deferred lifecycle envelope; not evidence of a current failure. |

## Final operating rule

Do not reopen completed IDs or create a new phase from this ledger. Optional improvements, strict-password rollout, repository settings, and lifecycle testing require a new explicit owner request with a fresh scope/approval boundary. Until then, no automatic task dispatch is authorized.
