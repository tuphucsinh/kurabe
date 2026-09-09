# HANDOFF — Kurabe QAQC

- Canonical HEAD before this replan: `4cdef146d74c2c8d2074ea02eea279fb86a4e7b3`; protected dirty `AGENTS.md` remains untouched.
- `P98M2T08 = DONE` at reviewed source `2d40813650ed67c8717d0685b08a544f283cde48`; do not reopen it.
- `P98M2T05 = BLOCKED`; production mutation = NONE. Strict password enforcement remains absent.
- Fresh P98M2T05 preflight found pre-existing `public.login_attempts` schema/grant/provenance drift; prior baseline is historical only.
- New chain: `P98M2T09` read-only forensic fingerprint/reconciliation plan → `P98M2T10` bounded local migration candidate → fresh `P98M2T05` preflight.
- T09 requires complete redacted catalog/source/provenance evidence and fresh Reviewer PASS before T10.
- T10 must preserve rows, fail closed on unexpected fingerprint, prove clean/current-like/collision PostgreSQL cases, and obtain fresh CONTROLLED Reviewer PASS.
- No T09/T10 production DB mutation, deploy, push, env change, or credential change is authorized by this replan.
- Production baseline: `/home/pi5/hermes-artifacts/kurabe-execution/p98m2t05-preflight-baseline.json`.
- Six legacy unregistered workspace roots remain preserved; do not delete or infer cleanliness.