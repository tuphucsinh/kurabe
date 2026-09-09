# HANDOFF — Kurabe QAQC

- T10 published commit: `9646834885527ff2db2a14e3e49020bb996a8b32`; current canonical closure HEAD: `63f2c204bc2576b07249426f58c016147a5650ab`; protected dirty `AGENTS.md` remains untouched.
- `P98M2T08 = DONE` at reviewed source `2d40813650ed67c8717d0685b08a544f283cde48`; do not reopen it.
- `P98M2T05 = READY_FOR_OWNER_APPROVAL`; production mutation = NONE. Current mode is `OPTIONAL_PASSWORD`; strict enforcement is deferred until explicit owner go-live approval.
- Fresh P98M2T05 preflight found pre-existing `public.login_attempts` schema/grant/provenance drift; prior baseline is historical only.
- Completed chain: `P98M2T09` PASS → `P98M2T10` DONE → `P98M2T05` awaits separate owner approval and fresh preflight.
- Reviewed password artifacts are classified: setup schema/tokens, setup/reset RPCs, credential-change/session revoke, login rate limiting = `APPLY_NOW_OPTIONAL`; P98M2T04 bulk legacy marking and strict activation = `DEFER_TO_STRICT_GO_LIVE`.
- Canonical source test PASS proves optional A–F and `absent == false == OPTIONAL`; no P98M2T11 is required.
- T09 evidence is retained; T10 has fresh CONTROLLED Reviewer PASS and canonical publish.
- T10 preserved rows, failed closed on unexpected fingerprint, and passed clean/current-like/collision PostgreSQL cases.
- No T09/T10 production DB mutation, deploy, push, env change, or credential change is authorized by this replan.
- Production baseline: `/home/pi5/hermes-artifacts/kurabe-execution/p98m2t05-preflight-baseline.json`.
- Six legacy unregistered workspace roots remain preserved; do not delete or infer cleanliness.