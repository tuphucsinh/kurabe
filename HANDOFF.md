# HANDOFF — Kurabe QAQC

- Canonical `main` đang ở `a7e4462` (closure); source P98M2T06 đã publish tại `43b2281` — `restore temporary passwordless compatibility`.
- `password_hash = NULL` và setup-required NULL account được login theo legacy mode khi `KURABE_REQUIRE_PASSWORD_LOGIN` unset/falsy.
- Khi `KURABE_REQUIRE_PASSWORD_LOGIN=true`, strict fail-closed + dummy bcrypt của P98M2T02 vẫn giữ nguyên.
- Verification canonical: focused PASS; full tests `39/39`; lint `0 errors` + warning có sẵn tại `tests/p98-evaluator-auth.test.mjs:232`; typecheck PASS; build PASS.
- Fresh independent CONTROLLED review exact candidate: PASS; residual risk passwordless đã được anh chấp thuận tạm thời.
- `P98M2T06` đã `[x]`; theo lệnh mới nhất, dừng tại đây — chưa dispatch P98M2T03/T04/T05.
- Production DB migration/RPC và Vercel deploy: **chưa apply/chưa deploy**; GitHub push cũng chưa thực hiện.
- Catalog artifact `.tmp/p98-production-catalog.json`: active count `1`, NULL password `96`, NULL evaluator `7`.
- `AGENTS.md` còn dirty theo thay đổi có chủ ý của anh; không nằm trong task commit.
- Còn 6 worktree legacy chưa reconcile đầy đủ, được giữ nguyên làm evidence; không tự xoá.
