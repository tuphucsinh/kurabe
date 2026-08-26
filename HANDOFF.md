# HANDOFF — Kurabe QAQC

## Trạng thái hiện tại
- Phase 95 `True static-first` đã hoàn tất; Phase 96 chưa triển khai application code.
- Phase 96 đã đổi thành `Multi-period integrity + Compare UI/performance`, trạng thái `PLAN PASS`.
- P96T00 live preflight đã PASS: Active = 1, evaluations = 53, rounds = 69, duplicate/orphan = 0; P96T01 baseline là bước kế tiếp.
- Current detail/compare chỉ dùng đúng một Active; 0 Active → `NO_ACTIVE_PERIOD`; nhiều Active → fail-closed `MULTIPLE_ACTIVE_PERIODS`.
- Plan yêu cầu RSC wrapper + server-only resolver, exact `activePeriodId` query key, không client resolver waterfall hoặc fallback localStorage/currentPeriod.
- Plan thêm single-Active DB invariant, atomic period create, safe close/delete và Closed-period firewall cho mọi action + SQL RPC TOCTOU.
- Inline `HistoryList` chỉ nhận kỳ Closed; Phase 97 vẫn `DEFERRED` cho route lịch sử đầy đủ, không tự khởi động.
- Agy Sonnet 4.6: R3 `PLAN_CHANGES_REQUIRED`; R4 `PLAN_PASS` còn một Important đã sửa; R5 `PLAN_PASS`, Critical/Important/Non-blocking đều `NONE`.
- Chỉ thay đổi tài liệu kế hoạch; chưa sửa code, DB, migration, runtime, production hoặc deploy.
- PostgREST không expose `pg_catalog`/`information_schema`; single-Active live catalog metadata UNKNOWN, P96T03 direct-catalog/apply gate vẫn bắt buộc.
- Production migration/RPC apply/push vẫn cần approval riêng của anh.
- Next: tiếp tục `P96T01` authenticated compare baseline; anomaly/data drift → STOP, không tự cleanup.
