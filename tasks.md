# KURABE QAQC — Task List (WBS)

> File làm việc cho `/do` — chỉ giữ việc đang làm và việc chờ. Chi tiết phase đã hoàn tất nằm trong `.ai/MASTER_PLAN.md`; trạng thái phiên gần nhất nằm trong `HANDOFF.md`.

## Pending / Next (cập nhật 2026-08-27)
- **P96 lifecycle E2E trên current DB**: plan revision 3 đã fresh-review `PASS`; còn chờ T10 preflight, dry-run/harness proof được approval riêng và explicit production execution approval trước mutation. Trạng thái cuối đã chốt: kỳ cũ Active, kỳ test dọn exact.
- **AI env lên Vercel**: trạng thái hiện tại chưa được xác minh trong phiên này; chỉ xử lý khi anh yêu cầu triển khai/kiểm tra production.
- **QI Gia dụng chưa gán Leader** + 3 NV chưa gán SubLeader: giữ lại để xử lý khi anh tiếp tục UAT.
- **Cloudflare Tunnel**: named tunnel/Access vẫn chờ anh chuyển `vorigin.vn` nameserver sang Cloudflare và báo Active; không tự khởi động.
- **P2**: "Gợi ý khác" + Chat hỏi đáp dữ liệu — sau khi có data kỳ đầu ổn định.

---

## Phase 96E: Current DB lifecycle E2E + exact rollback (PLAN REVISION 3 — REVIEW PASS; execution gate pending)

### [#P96T10] [Supabase MCP pg_catalog + snapshot] Preflight và rollback manifest

- **Goal**: xác minh current DB/deployment/runtime trước mutation và tạo manifest exact để có thể khôi phục kỳ cũ Active, dọn kỳ test mới.
- **Depends on**: none.
- **Parallel-safe**: no.
- **Context hiện có**: production đã có P96T03–P96T05; `/settings` → `PeriodsTab` → `PeriodActions` gọi `closeEvaluationPeriod()` và `PeriodModal` gọi `createEvaluationPeriod()`; create action fan-out evaluation + round 1 cho toàn bộ active users.
- **Concrete checks**: qua Supabase MCP `execute_sql` read-only, kiểm tra exact deployed artifact `dpl_FyWPJ9HdXL6HdVTJsjzaBMa3TtRp`, runtime flag transactional RPC, 1 Active, counts/IDs/field snapshots của `evaluation_periods`, `evaluations`, `evaluation_rounds`, `evaluation_responses`, `audit_logs`, `ai_summaries`; query `pg_catalog`/`information_schema` để lập FK dependency graph, liệt kê rõ hướng FK của audit/AI (RESTRICT/SET NULL/CASCADE) và exact audit rows. Hash phải tính DB-side trên aggregate có thứ tự ổn định; không trả/lưu raw PII vào manifest.
- **Acceptance**: manifest baseline có `run_id`, `old_period_id`, manager actor, exact baseline counts/hashes, allowed deltas và rollback SQL template không placeholder/broad predicate. Manifest phải có cơ chế append-only `run_created_ids` sau *mọi* mutation: T11 close/create và T12 close test period; capture exact period/evaluation/round/audit/AI IDs cùng affected-row counts ngay sau từng action. T13 chỉ được chạy khi phần này đầy đủ. T10 chỉ validate tĩnh reopen/rollback SQL (FK direction, no-placeholder, affected-row assertion, snapshot khớp baseline); proof thực thi chỉ qua dry-run/harness có approval riêng, không mutation trong T10. Không persist secrets/session material.
- **Stop**: FK/audit dependency không xác định, baseline drift, nhiều/không có Active, permission/runtime mismatch, hoặc không chứng minh được rollback exact.
- **Status**: blocked at T10 `STOP` (2026-08-28 read-only check): raw status is lowercase `active`, Active cardinality `1`, duplicate/orphan `0`, but current counts are `evaluations=61` và `rounds=77` versus prior verified baseline `53/69`; provenance of the +8/+8 delta is unresolved. No lifecycle mutation was run. Reconcile drift and refresh baseline before manifest/approval gates.

### [#P96T11] [https://lykiv.vercel.app/settings + period actions] Đóng kỳ cũ, mở kỳ test mới

- **Goal**: kiểm tra lifecycle thật qua UI Manager, với maintenance window và no-concurrent-write gate.
- **Depends on**: `[#P96T10]`.
- **Parallel-safe**: no.
- **Browser actions**: đăng nhập account Manager được phép → `/settings` → tab `Kỳ đánh giá`; xác nhận kỳ cũ và tiến độ trước khi click; click `Đóng kỳ`, xác nhận; đọc DB ngay; sau đó click `Tạo kỳ mới`, chọn năm chưa tồn tại, xác nhận; đọc DB ngay lần nữa.
- **Expected allowlist**: kỳ cũ đổi `status/closed_at`; một close audit row; một kỳ test mới Active; evaluations + round 1 fan-out đúng active-user baseline; một create audit row. Không coi các delta này là drift.
- **Acceptance**: atomic create không partial; đúng 1 Active; kỳ cũ Closed; old evaluation/round rows unchanged; new rows chỉ trỏ `new_period_id`; duplicate/orphan = 0. Ngay sau close và ngay sau create phải capture exact IDs phát sinh, affected-row counts và append vào manifest `run_created_ids`. Nếu create fail thì chỉ chạy procedure reopen exact đã được T10 static-validate và dry-run/harness-approved; nếu chưa có proof đó thì STOP, không tự đoán SQL và không để no-active ngoài maintenance window. Trước close/create phải verify lại maintenance window và zero concurrent evaluator write.
- **Stop**: partial create, count sai, audit ngoài allowlist, request/UI error, hoặc có concurrent evaluator write.
- **Status**: pending.

### [#P96T12] [browser contexts] E2E read/stale-tab/closed-write matrix

- **Goal**: kiểm tra kỹ behavior sau chuyển kỳ mà không submit/approve/AI hoặc mutate employee thật ngoài allowlist.
- **Depends on**: `[#P96T11]`.
- **Parallel-safe**: no.
- **Browser actions**: giữ tab cũ trước transition và mở context thứ hai; kiểm tra `/dashboard`, `/reports`, evaluation list, detail và compare; reload tab cũ; đóng **kỳ test vừa tạo**; đọc DB ngay và append exact close-audit ID/affected-row count vào `run_created_ids`. Closed-write UI chỉ attempt trên evaluation run-created thuộc kỳ test vừa đóng, với employee `TST%` nếu tồn tại và restore path đầy đủ; tuyệt đối không dùng baseline evaluation của kỳ cũ.
- **Acceptance**: no-Active state fail-closed trong cửa sổ kiểm soát; reload stale tab resolve đúng kỳ mới; query/cache key có period ID; detail/compare đúng round 1/pending/score-grade semantics; Closed write trên evaluation của kỳ test bị chặn và DB không đổi, bao gồm `audit_logs` = 0 delta. Nếu không có `TST%`, Closed-write UI attempt ghi `NOT RUN` và không dùng employee thật; server-side P96T05 rejection evidence trước đó không bị nâng thành UI PASS. Trước khi đóng kỳ test phải re-verify maintenance window và zero concurrent write; gate này giữ đến T13. Console/runtime/network error không giải thích = non-PASS.
- **Write boundary**: không submit/approve/AI. Không có Draft save trên evaluation mới trừ khi restore exact mọi bảng/child/audit/AI đã được chứng minh qua dry-run/harness được approval riêng (T10 chỉ static-validate); sequence gaps được allowlist riêng.
- **Evidence**: screenshot/DOM/console/network đã redacted tại `/home/pi5/hermes-artifacts/browser-evidence/kurabe/p96-e2e/<run_id>/`; không lưu cookie/token/PII.
- **Status**: pending.

### [#P96T13] [Supabase MCP execute_sql] Exact rollback và final integrity gate

- **Goal**: khôi phục kỳ cũ Active và dọn toàn bộ dữ liệu kỳ test bằng một transaction exact, FK-safe.
- **Depends on**: `[#P96T12]`.
- **Concrete rollback**: chỉ sau khi `run_created_ids` đã append đầy đủ cho T11 close/create và T12 close test period, đồng thời re-verify maintenance window + zero concurrent write, dùng IDs exact; xóa test children theo dependency graph và hướng FK đã kiểm tra → rounds → evaluations → test period; xử lý exact audit/AI rows của run; restore nguyên trạng old period (`status`, `closed_at`, field snapshot). Không dùng prefix delete, `LIKE`, broad time range hoặc unresolved placeholder.
- **Audit disposition**: xóa exact toàn bộ audit/AI rows được capture là do run tạo ra để đưa database về đúng baseline T10; giữ evidence redacted ngoài DB. Nếu catalog chứng minh một row không thể xóa an toàn, STOP trước rollback và ghi `Need approval`, không tự giữ/xóa tùy ý.
- **Acceptance**: mỗi statement có affected-row assertion đúng với số IDs đã capture; old period ID/state/fields và baseline child rows khớp T10; test period không còn; `audit_logs`/`ai_summaries` khớp exact baseline values (không chỉ count); old period read-back là đúng `old_period_id` và raw `Active`; duplicate/orphan = 0; sequence gaps chỉ ghi nhận, không tự decrement; browser contexts/cookies/localStorage/IndexedDB/temp residue được dọn và kiểm tra.
- **Rollback of rollback**: nếu bất kỳ assertion nào fail, dừng transaction, giữ evidence; không fix-forward hay chạy cleanup rộng.
- **Approval**: production mutation/deletion là R3; plan revision 3 đã fresh reviewer `PASS`, nhưng vẫn cần T10 preflight, dry-run/harness proof được approval riêng và explicit execution approval trước mutation. Các verdict trước đó là `CHANGES_REQUIRED`; không coi plan PASS là execution approval. ChatWidget, code, migration, push, deploy ngoài scope.
- **Status**: pending.

---

## Phase 97: Lịch sử đánh giá (DEFERRED — ngoài Phase 96)

- Chỉ bắt đầu khi có plan/approval riêng; không tự khởi động sau P96E.
