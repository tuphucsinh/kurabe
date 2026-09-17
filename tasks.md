# Kurabe — reconciled task ledger

## Current status

- `LEDGER_STATUS=CLOSED`; no active execution task, no pending P103 task, and no new phase/task is created by this sweep.
- Canonical before normalization: `/home/pi5/projects/kurabe`, `main`, `f8b60677ab3944721e864ea7ad92ef8908bc024b`.
- P103 execution DAG: **13/13 DONE**. Detailed task contracts and full evidence remain recoverable from Git history and `/home/pi5/hermes-artifacts/kurabe-p103/`; this file contains the compact status only.
- State readback: `active_task=null`, `active_reservations={}`, `blocking_alerts=[]`, `task_state=DONE`.
- Previous production release: `76221ca0a3e2813a2743a0ad74d3be7fb57306d4` at `https://lykiv.vercel.app`. Current canonical deployment is pending the explicitly requested push/deploy operation; no database migration or manual production write is part of that operation.

## Closed P103 execution record

| Task | Status | Canonical/candidate evidence anchor | Result |
|---|---|---|---|
| P103M1T01 | DONE | `4af6cd911b7c411b3a21243ad1dda49ea3d6ee38` | disposable confirmation harness; residue `0` |
| P103M1T02 | DONE | `eddafaca9c197931499bd35edb7f1b5f28b84f50` | H4 history authorization; production mutation `0` |
| P103M1T03 | DONE | `2e2623af5dd01bef849f3ee713bea51e301b332f` | H5 revoke/current authorization; production mutation `0` |
| P103M2T01 | DONE | `7a46233938e8a0636a388c9e0c8dda2b7373903a` | H1/H2 workflow parity and multi-team SQL; production mutation `0` |
| P103M2T02 | DONE | `e91bfafba66960f74f3c98a12939f335344efc7c` | H3 full/summary/single scope parity; `agy-readonly` review PASS |
| P103M2T03 | DONE | `f60102fce8af98eff50564dff27023f3b6d16680` | H6 draft response contract; independent review PASS |
| P103M3T01 | DONE | `d2142155fb633b70db4ad22d69edd426e50f5924` | H7 authorized snapshot DTO; qualification `12/12` |
| P103M3T02 | DONE | `36d696c1367fbfd76afd5d15db14a493b753f733` | H7 historical detail/compare rendering |
| P103M3T03 | DONE | `ea04a894bd4fee8214fa9a395fc5a279255fd596` | scope-aware cache/resident freshness |
| P103M4T01 | DONE | `117215934afaaca9553815db462d2e5fb8da68e8` | integrated matrix: authenticated `54/54`, browser `15/15`, production mutation `0/0` |
| P103M4T02 | DONE | `5f934b9f885f0e2ddd32f9ad5151e200891cee8f` | fail-closed CI/evidence; tests `59/59`, production mutation `0/0` |
| P103M4T03 | DONE | `9f07ce3bdb06c1b5fe9f8cb315644b1444493ac3` | matched release package; preflight `15/15`, production mutation `0/0` |
| P103M4T04 | DONE / `WAIVED_BY_OWNER` | closure control `f8b60677ab3944721e864ea7ad92ef8908bc024b` | owner-dispositioned final review gate; no product change |

## Post-closure audit, not executable work

- AGY independent source review: `REVIEW_BACKEND=agy`, `REVIEW_MODEL=gemini-3.8-flash-high`, exact source `f8b60677ab3944721e864ea7ad92ef8908bc024b`, source hashes unchanged.
- Verdict `REJECT`; F01–F08 confirmed as bounded MEDIUM findings. Evidence root: `/home/pi5/hermes-artifacts/kurabe-audit-f8b6067-61hIIY/agy-gemini-3.8-review/`; report: `/home/pi5/hermes-artifacts/kurabe-audit-f8b6067-61hIIY/KURABE_AUDIT.md`.
- F01–F08 are deliberately not represented as tasks here. This normalization does not fix them or open a phase.

## Historical / deferred records

- P102 production closure is historical at source SHA `76221ca0a3e2813a2743a0ad74d3be7fb57306d4`; its evidence remains under `/home/pi5/hermes-artifacts/kurabe-execution/`.
- `P102M2T01` repository-settings governance and `P96T11–P96T13` lifecycle/rollback records are `DEFERRED / OWNER-GATED`, not runnable.
- Strict-password go-live and broad credential migration remain deferred by the optional-password decision.
- No `READY`, `RUNNING`, `BLOCKED`, `UNKNOWN`, duplicate, or zombie task is retained. Do not auto-dispatch any ID in this ledger.

## Normalization boundary

This ledger records only the current closed state and provenance. The authorized sequence is worktree cleanup → control/docs commit → push/readback → exact current-canonical deployment → post-deploy readback. Any future F01–F08 work requires a separate explicit request; it is not created now.
