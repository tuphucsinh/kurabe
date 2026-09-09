# HANDOFF — Kurabe QAQC

- P98M1T03 real-local DB/browser/security verification is complete; evidence is retained under `/home/pi5/hermes-artifacts/kurabe-execution/`.
- P98M1T02 is verified: current Supabase SELECT/catalog, Vercel deployment, and env-name readbacks are retained.
- Current production catalog: one Active period; aggregate counts/indexes/RPC definitions/grants/RLS/ledger read back; four Phase 98 candidate migration versions absent.
- Known production drift: Vercel production is `c300719`; `KURABE_REQUIRE_PASSWORD_LOGIN` is absent, so strict auth is not active.
- Six legacy unregistered workspace roots remain preserved; four contain dirty candidate evidence. Do not delete or infer cleanliness.
- P98M2T04 source commit `9321c57` is in canonical history; its migration remains absent from the live ledger and task evidence is preserved.
- Temporary passwordless compatibility remains accepted; strict activation still needs separate owner approval and setup/delivery/schema/session gates.
- No production DB mutation, deploy, push, or credential mutation was performed; disposable local DB resources were cleaned after verification.
- Owner's modified `AGENTS.md` remains outside control commits and must be preserved byte-for-byte.
- P98M2T03 published at `54d070eeca564eafcc1803c342ffcfecdd95834a` after real Chrome 18/18, full tests, lint/typecheck/build, secret scan, and fresh CONTROLLED review PASS.
- P98M2T04 real-local legacy setup matrix passed 25/25 plus root gates; fresh CONTROLLED review PASS; published at `f6ca2b248ac1e6d34791bb5254a7b59a6035e97c`.
- P98M2T07 real-local integration/browser suite passed 40/40 plus root gates; fresh CONTROLLED review PASS; published at `749d9449c8ba1d8883398851f3ea85dc092b27dc`.
- P98M2T08 real-local login throttling suite passed 35/35 plus root gates; fresh CONTROLLED review is pending.
- Next: reconcile T08 review; production rollout T05 remains separately owner-approval-gated.