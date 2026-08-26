# HANDOFF — Kurabe QAQC

## Trạng thái hiện tại
- Phase 95 `True static-first` đã hoàn tất; Phase 96 chưa triển khai application code.
- Phase 96 đã đổi thành `Multi-period integrity + Compare UI/performance`, trạng thái `PLAN PASS`.
- WBS mới bắt đầu bằng P96T00 live preflight read-only, sau đó baseline, server Active boundary, DB/lifecycle/write firewall rồi mới tối ưu UI.
- Current detail/compare chỉ dùng đúng một Active; 0 Active → `NO_ACTIVE_PERIOD`; nhiều Active → fail-closed `MULTIPLE_ACTIVE_PERIODS`.
- Plan yêu cầu RSC wrapper + server-only resolver, exact `activePeriodId` query key, không client resolver waterfall hoặc fallback localStorage/currentPeriod.
- Plan thêm single-Active DB invariant, atomic period create, safe close/delete và Closed-period firewall cho mọi action + SQL RPC TOCTOU.
- Inline `HistoryList` chỉ nhận kỳ Closed; Phase 97 vẫn `DEFERRED` cho route lịch sử đầy đủ, không tự khởi động.
- Agy Sonnet 4.6: R3 `PLAN_CHANGES_REQUIRED`; R4 `PLAN_PASS` còn một Important đã sửa; R5 `PLAN_PASS`, Critical/Important/Non-blocking đều `NONE`.
- Chỉ thay đổi tài liệu kế hoạch; chưa sửa code, DB, migration, runtime, production hoặc deploy.
- Production migration/RPC apply/push vẫn cần approval riêng của anh.
- Next: khi anh yêu cầu triển khai, bắt đầu `P96T00`; anomaly/data drift → STOP, không tự cleanup.
