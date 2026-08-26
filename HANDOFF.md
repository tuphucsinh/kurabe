# HANDOFF — Kurabe QAQC

## Trạng thái hiện tại
- Phase 95 `True static-first` đã hoàn tất; Phase 96 đang triển khai theo integrity-first WBS.
- P96T00 live preflight PASS: Active = 1, evaluations = 53, rounds = 69, duplicate/orphan = 0; catalog metadata vẫn UNKNOWN.
- P96T01 baseline PASS bằng Mika Playwright fallback: 3 cold + 3 warm mỗi viewport; median first-light→full 390 `3313/2685ms`, 768 `2898/2480ms`, 1440 `2994/2786ms`.
- P96T02 PASS local candidate: RSC/server-only Active resolver, exact periodId query/cache, fail-closed zero/multiple/error, Closed-only inline history; 28/28 tests + lint/tsc/build/browser canary PASS.
- P96T03 PASS_WITH_CONSTRAINT: candidate partial unique index + preflight/rollback; close/target Active + exactly-one affected-row guards; create DB uniqueness authority; 29/29 tests + lint/tsc/build + fresh reviewer PASS.
- Live catalog P96T03 `UNKNOWN/BLOCKED`: Management API database query và `supabase db query --linked` đều 403. Không claim live index verified.
- P96T03 candidate chưa apply; production migration/apply cần direct catalog privilege và approval riêng. Chưa deploy/push.
- P96T04 PASS_WITH_CONSTRAINT: atomic create RPC giữ evaluator resolution ở TypeScript; exact-empty Closed delete RPC lock/count/rowcount guard, không delete child business rows; focused contract + full suite 30/30 + lint/tsc/build PASS, fresh `gemini-3.1-pro-high` review PASS clean/HIGH.
- P96T04 live DB integration/failure injection và catalog verification vẫn `UNKNOWN/BLOCKED`; migration chưa apply. P96T05 candidate đã hoàn tất local nhưng live catalog/race/failure injection vẫn `UNKNOWN/BLOCKED`; Phase 97 vẫn DEFERRED.
- P96T05 PASS_WITH_CONSTRAINT: shared server-only exact-Active guard phủ evaluation/AI writes + lazy initializer; new wrapper RPC locks period `FOR UPDATE` and delegates P3 transaction; multiple Active fail-closed. Focused contract + full suite 31/31 + lint/tsc/build PASS; fresh reviewer PASS, Critical/Important NONE. Residual: direct REST TOCTOU, lazy N+1 guard. No migration/apply/deploy/push.
- Agy execution lane tạo candidate đúng scope; Mika sửa test contract whitespace và verify độc lập; không deploy/push.
