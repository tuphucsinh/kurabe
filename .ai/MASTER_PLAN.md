# Kurabe — current state and closed execution record

## Current control state

- `PLAN_STATUS=EXECUTED_CLOSED`; no new development phase is open.
- Canonical repository: `/home/pi5/projects/kurabe`; branch `main`; current canonical SHA before this normalization is `f8b60677ab3944721e864ea7ad92ef8908bc024b`.
- P103 execution DAG is closed: **13/13 tasks DONE**. The final control closure is `f8b6067`; application/release candidate was frozen at `9f07ce3bdb06c1b5fe9f8cb315644b1444493ac3` and no product logic changed in the later control commits.
- `.state/agent-state.json` readback: `active_task=null`, `active_reservations={}`, `task_state=DONE`, `blocking_alerts=[]`, `cleanup_residue=0`.
- Worktree normalization: only the canonical worktree is intentionally retained. Former P103 worktrees were closed or superseded; the candidate branch refs remain only as historical provenance.
- Current production deployment: Vercel deployment `dpl_8BJ3yxnZ4RatRWsGxyGGcVBgDkby`, `READY`, target `production`, is bound to `https://lykiv.vercel.app` and the exact pushed canonical application SHA `f0eab9d67bac367a96f3ae3e3daa541c97ea92f9`. Previous recorded deployment was source SHA `76221ca0a3e2813a2743a0ad74d3be7fb57306d4`; readback is under `/home/pi5/hermes-artifacts/kurabe-normalization-deploy/`.
- This sweep changes control/documentation state only. It does not implement F01–F08, add tasks, alter schema/data, or change application behavior.

## Closed P103 provenance

| ID | Disposition | Candidate/integration anchor | Evidence / note |
|---|---|---|---|
| P103M1T01 | DONE | `4af6cd911b7c411b3a21243ad1dda49ea3d6ee38` | reusable disposable confirmation harness; writes/residue `0` |
| P103M1T02 | DONE | candidate `7a7a759eef968ec7ec4204b8ae28e44155520815`; integration `eddafaca9c197931499bd35edb7f1b5f28b84f50` | H4 history authorization; production writes/migrations/deploy `0` |
| P103M1T03 | DONE | candidate `6205ef475cd3a837697ff0d1fab932f914378482`; integration `2e2623af5dd01bef849f3ee713bea51e301b332f` | H5 revoke/current authorization; evidence under `/home/pi5/hermes-artifacts/kurabe-p103/P103M1T03/` |
| P103M2T01 | DONE | candidate `a332e72737d055e38358f570363c13fe901e9e4b`; canonical integration `7a46233938e8a0636a388c9e0c8dda2b7373903a` | H1/H2 multi-team workflow; production writes/migrations `0` |
| P103M2T02 | DONE | `e91bfafba66960f74f3c98a12939f335344efc7c` | H3 scope parity; independent `agy-readonly` review PASS |
| P103M2T03 | DONE | candidate `6514466e0e81f1ea33b5775ce315c35dd8fd467d`; integration `f60102fce8af98eff50564dff27023f3b6d16680` | H6 draft response contract; independent review PASS |
| P103M3T01 | DONE | candidate `d2142155fb633b70db4ad22d69edd426e50f5924` | H7 authorized snapshot DTO; evidence under `/home/pi5/hermes-artifacts/kurabe-p103/P103M3T01-auth/` |
| P103M3T02 | DONE | `36d696c1367fbfd76afd5d15db14a493b753f733` | H7 historical detail/compare rendering; browser-specific lane covered by M4T01 |
| P103M3T03 | DONE | `ea04a894bd4fee8214fa9a395fc5a279255fd596` | scope-aware cache/resident freshness; browser-specific lane covered by M4T01 |
| P103M4T01 | DONE | `117215934afaaca9553815db462d2e5fb8da68e8` | integrated authenticated matrix: integration `54/54`, browser `15/15`, production writes/migrations `0/0` |
| P103M4T02 | DONE | `5f934b9f885f0e2ddd32f9ad5151e200891cee8f` | fail-closed evidence/CI contract; tests `59/59`, production writes/migrations `0/0` |
| P103M4T03 | DONE | `9f07ce3bdb06c1b5fe9f8cb315644b1444493ac3` | matched app+001+002 package; preflight `15/15`; production writes/migrations `0/0`; catalog was `UNKNOWN` at preparation time |
| P103M4T04 | DONE / `WAIVED_BY_OWNER` | control closure `f8b60677ab3944721e864ea7ad92ef8908bc024b` | owner waiver closed the final review gate; it did not authorize a deployment or database mutation |

Primary P103 evidence root: `/home/pi5/hermes-artifacts/kurabe-p103/`. Detailed contracts remain in Git history and are not an active WBS.

## Post-closure audit boundary

- Independent AGY source review was run separately with `REVIEW_BACKEND=agy`, `REVIEW_MODEL=gemini-3.8-flash-high`, exact source SHA `f8b60677ab3944721e864ea7ad92ef8908bc024b`, read-only source hashes unchanged.
- That review returned `REJECT` and confirmed findings F01–F08 as bounded MEDIUM issues. Evidence: `/home/pi5/hermes-artifacts/kurabe-audit-f8b6067-61hIIY/agy-gemini-3.8-review/` and consolidated report `/home/pi5/hermes-artifacts/kurabe-audit-f8b6067-61hIIY/KURABE_AUDIT.md`.
- F01–F08 are **audit findings only**, not tasks or a new phase. No fix is started by this normalization.

## Historical records and non-active boundaries

- P102 release and its production closure remain historical provenance; the previously deployed source was `76221ca0a3e2813a2743a0ad74d3be7fb57306d4`.
- Optional-password compatibility remains current; strict-password go-live and broad credential migration are deferred and owner-gated.
- `P102M2T01` repository-settings governance and `P96T11–P96T13` lifecycle/rollback work remain deferred owner-gated records, not runnable tasks.
- No `READY`, `RUNNING`, `BLOCKED`, or zombie task is created or retained by this sweep.

## Operating boundary for this normalization

1. Reconcile worktrees and these ledgers against canonical Git and existing evidence.
2. Commit only cleanup/control-plane documentation.
3. Push `main`, read back the remote SHA, then deploy the exact pushed canonical application through the existing Vercel procedure without migration/data writes. **Completed:** remote and deployed SHA `f0eab9d`.
4. Read back deployment, health, service, migration/write, and residue evidence.

Deployment closure is complete. F01–F08 remain untouched; any future fix work requires a separate explicit request.
