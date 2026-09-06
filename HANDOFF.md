# HANDOFF — Kurabe QAQC

- Canonical `main` hiện ở `0fcd1c9` (`P98M2T02`), source/auth candidate đã publish; `tasks.md` đã tick `[x]`.
- P98M2T02 hardens NULL/setup-required login fail-closed, dummy bcrypt timing, manager reset/setup token flow, transactional RPC candidates, rollback và regression contracts.
- Verification canonical: focused PASS; full tests `39/39`; lint `0 errors` + 1 existing warning tại `tests/p98-evaluator-auth.test.mjs:232`; typecheck PASS; build PASS.
- Fresh independent CONTROLLED review: PASS, không findings.
- Production DB migration/RPC/legacy-state migration: **chưa apply**; production rollout P98M2T05 vẫn cần explicit approval.
- P98M1T02 catalog artifact: `.tmp/p98-production-catalog.json`, active count `1`, NULL password `96`, NULL evaluator `7`, candidate migrations chưa có trong ledger.
- P98M2T03 là bước code kế tiếp; phải reconcile task/dependency trước dispatch.
- Phase 96 lifecycle T11–T13 vẫn paused; không trộn vào Phase 98.
- `AGENTS.md` còn dirty theo thay đổi có chủ ý của anh; không nằm trong task commit.
- Residual: live runtime auth/transaction concurrency chưa được apply/probe; static/build/review evidence không thay thế production approval.
