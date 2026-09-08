# HANDOFF — Kurabe QAQC

- Observed canonical baseline: `main@c00545d`; P98M2T06 source remains historically verified at `43b2281`.
- P98M1T02 is verified: local Git/worktree/ref inventory, current Supabase SELECT/catalog, Vercel deployment and env-name readbacks retained.
- Current production catalog: one Active period; aggregate counts/indexes/RPC definitions/grants/RLS/ledger read back; four Phase 98 candidate migration versions absent.
- Known production drift: Vercel production is `c300719`, not canonical `c00545d`; `KURABE_REQUIRE_PASSWORD_LOGIN` is absent, so strict auth is not active.
- Six legacy unregistered workspace roots remain preserved; four contain dirty candidate evidence. Do not delete or infer cleanliness.
- P98M2T04 source commit `9321c57` is in canonical history; its migration remains absent from the live ledger and task evidence is preserved.
- Temporary passwordless compatibility remains accepted; strict activation still needs separate owner approval and setup/delivery/schema/session gates.
- No application, DDL/DML, deploy, push, credential, permission, or cleanup mutation was performed by reconciliation.
- Owner's modified `AGENTS.md` remains outside control commits and must be preserved byte-for-byte.
- Next: atomically register the pending Phase 98 READY batch, then dispatch P98M1T03; production rollout remains separately approval-gated.