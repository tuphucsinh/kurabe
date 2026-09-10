# HANDOFF — Kurabe QAQC

- T10 published commit: `9646834885527ff2db2a14e3e49020bb996a8b32`; P99M1T01 published commit: `4221954f704ff92d8e1d11fd65097cdea89d7a0e`; P99M2T01 published commit: `24ad7331d25c71b10e42d0d3fe47be10887bac66`; protected dirty `AGENTS.md` remains untouched.
- `P98M2T08 = DONE` at reviewed source `2d40813650ed67c8717d0685b08a544f283cde48`; do not reopen it.
- `P98M2T05 = READY_FOR_OWNER_APPROVAL`; production mutation = NONE. Current mode is `OPTIONAL_PASSWORD`; strict enforcement is deferred until explicit owner go-live approval.
- Fresh P98M2T05 preflight found pre-existing `public.login_attempts` schema/grant/provenance drift; prior baseline is historical only.
- Completed chain: `P98M2T09` DONE/PASS → `P98M2T10` DONE → `P99M1T01` DONE/PASS → `P99M2T01` DONE/PASS → `P98M2T05` awaits exact owner-approved production gate and fresh preflight.
- Reviewed password artifacts are classified: setup schema/tokens, setup/reset RPCs, credential-change/session revoke, login rate limiting = `APPLY_NOW_OPTIONAL`; P98M2T04 bulk legacy marking and strict activation = `DEFER_TO_STRICT_GO_LIVE`.
- Canonical source test PASS proves optional A–F and `absent == false == OPTIONAL`; no P98M2T11 is required.
- T09/T10/P99M1T01/P99M2T01 evidence is retained; each has CONTROLLED review/evidence and canonical publish.
- T10 preserved rows, failed closed on unexpected fingerprint, and passed clean/current-like/collision PostgreSQL cases.
- Current instruction: Mika executes remaining local/source tasks serially without Runner; no T09/T10/P99M1T01/P99M2T01 production DB mutation occurred. Next eligible task: `P99M2T02`.
- Production baseline: `/home/pi5/hermes-artifacts/kurabe-execution/p98m2t05-preflight-baseline.json`.
- Six legacy unregistered workspace roots remain preserved; do not delete or infer cleanliness.