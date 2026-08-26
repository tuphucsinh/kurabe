# KURABE QAQC — Task List (WBS)

> File làm việc cho `/do` — chỉ giữ việc đang làm và việc chờ. Chi tiết phase đã hoàn tất nằm trong `.ai/MASTER_PLAN.md`; trạng thái phiên gần nhất nằm trong `HANDOFF.md`.

## Pending / Next (cập nhật 2026-08-26)
- **AI env lên Vercel**: trạng thái hiện tại chưa được xác minh trong phiên này; chỉ xử lý khi anh yêu cầu triển khai/kiểm tra production.
- **QI Gia dụng chưa gán Leader** + 3 NV chưa gán SubLeader: giữ lại để xử lý khi anh tiếp tục UAT.
- **Cloudflare Tunnel**: named tunnel/Access vẫn chờ anh chuyển `vorigin.vn` nameserver sang Cloudflare và báo Active; không tự khởi động.
- **P2**: "Gợi ý khác" + Chat hỏi đáp dữ liệu — sau khi có data kỳ đầu ổn định.

---

## Phase 96: Tinh gọn và tối ưu tải trang So sánh các vòng 🟡 (ACTIVE — implementation chưa bắt đầu)

### [#P96T01] [browser/performance] Authenticated compare baseline waterfall
- **Goal**: đo cold/warm và các mốc `shell-visible`, `first-light-visible`, `grade-bands-ready`, `first-primary-complete`, `secondary-complete`, `full-complete` tại 390x844, 768x1024, 1440x900; kèm period matrix: nhiều kỳ có 1 Active, nhiều kỳ không có Active, nhiều Active và zero period nếu fixture/tooling hỗ trợ.
- **Depends on**: none.
- **Parallel-safe**: yes.
- **Context hiện có**: `src/app/evaluations/[id]/compare/page.tsx` hiện global gate `isLoading`; `src/actions/read.ts` aggregate `employee/evaluation/users/groups`; `src/hooks/use-db.ts` query staleTime 2 phút.
- **Constraints**: chỉ đọc; không mutate evaluation; không in credentials; phân biệt TTFB/LCP/CLS với data milestones; ghi request count/payload/long task nếu tooling hỗ trợ; đo riêng `getGradeBandsAction()` ở `page.tsx:47-53` và xác định fallback sync → authoritative DB transition.
- **Definition of Done**: có bảng baseline cùng route/data ở 3 viewport, cold/warm tách riêng, period matrix, console/network evidence và bottleneck hypothesis có source evidence; UNKNOWN ghi rõ.
- **Status**: `[ ]`

### [#P96T02] [page/actions/hooks] Active-period contract và loading boundary decision
- **Goal**: chốt Active-only contract cho detail/compare, lightweight server-authoritative scope trước query và bằng evidence quyết định có cần split aggregate hay chỉ static/progressive render; không để `periodId` undefined làm query không giới hạn hoặc cache key không có scope thật.
- **Depends on**: `[#P96T01]`.
- **Parallel-safe**: no.
- **Context hiện có**: access phụ thuộc `evaluation` + `users` qua `getEvaluationAccessState`; groups cần để map criteria names; scoring dùng `calculateRoundScore`; `resolveCurrentPeriod()`/AuthContext có latest fallback nhưng không được dùng làm authority cho detail/compare.
- **Constraints**: mặc định chỉ Active; **cấm dùng `getActivePeriod()` hiện tại cho detail/compare scope** vì `.limit(1).single()` không phân biệt zero/multiple; resolver mới phải đọc tối đa 2 Active, không `.single()`, để phân biệt `NO_ACTIVE_PERIOD`/`MULTIPLE_ACTIVE_PERIODS`; không Active → không enable evaluation query; nhiều Active → fail-closed anomaly; React Query key phải có `activePeriodId` thật; **không truyền `AuthContext.currentPeriod` hoặc `undefined` làm period scope cho hai hook**; aggregate re-validate `period_id`; giữ `requireAuth`, `canViewEvaluation`, fail-closed visible rounds, không duplicate broad fetch, không thêm cache/index/PPR/RSC rewrite; nếu không có material bottleneck thì giữ aggregate nhưng luôn lọc `period_id`; không dùng localStorage làm server authority.
- **Definition of Done**: decision record chốt `Active → no-active`, explicit historical ngoài scope Phase 96, `selectionReason`, `NO_ACTIVE_PERIOD`, `MULTIPLE_ACTIVE_PERIODS`, scope-query/cache key, expected request/payload tradeoff và rollback; grep/test xác nhận hai call site `useEvaluationPageData`/`useEvaluationComparePageData` nhận `activePeriodId` đã resolve, không nhận `undefined`/`AuthContext.currentPeriod`; grep/test xác nhận detail/compare không gọi `getActivePeriod()` cũ làm resolver và không gọi `getEvaluationByEmployeeAdmin` thiếu `period_id`; UI contract có đúng message `Hiện chưa có kỳ đánh giá đang mở.`; residual risk `saveEvaluationRound` chưa có closed-period write guard được ghi rõ và deferred tới Phase 97; Agy review không còn Critical/Important finding.
- **Status**: `[ ]`

### [#P96T03] [compare static/loading frame] Static shell và local loading states
- **Goal**: render 100% static structure của compare trước data; loading chỉ che vùng data, không fake score/grade/name/action.
- **Depends on**: `[#P96T02]`.
- **Parallel-safe**: no.
- **Context hiện có**: `src/app/evaluations/[id]/compare/loading.tsx` generic skeleton; `page.tsx:105-121` generic spinner.
- **Constraints**: frame stateless; không form/handler/privileged control; loading không nested invalid HTML; route fallback và client pre-data geometry nhất quán.
- **Definition of Done**: DOM marker `data-load-layer="static"`/local states có thể đo; shell không phụ thuộc aggregate response; no duplicate interactive tree.
- **Status**: `[ ]`

### [#P96T04] [compare page/components] Progressive primary/secondary render
- **Goal**: summary và changed criteria usable trước comments/unchanged section khi dependency cho phép; chỉ có retry/local error riêng nếu data source được tách thật; nếu giữ aggregate thì bảo toàn aggregate error contract, không tạo retry giả.
- **Depends on**: `[#P96T02]`, `[#P96T03]`.
- **Parallel-safe**: no.
- **Context hiện có**: summary `page.tsx:186-246`; changed criteria `248-407`; comments `409-455`; unchanged `457-485`.
- **Constraints**: không đổi score/grade/delta/round ordering/access; không render score 0 thay missing data; unchanged đóng mặc định; giữ comments đầy đủ; `getGradeBandsAction()` có state/error contract riêng và grade authoritative không bị thay đổi im lặng sau primary milestone.
- **Definition of Done**: primary/secondary markers đo được; stale scope không hiển thị data cũ; changed criteria và comments đúng với baseline.
- **Status**: `[ ]`

### [#P96T05] [compare page/components] Compact render-cost reduction
- **Goal**: bỏ criterion IDs khỏi DOM, giảm duplicated delta/labels/cards/padding và tránh duplicate computation mobile/desktop.
- **Depends on**: `[#P96T04]`.
- **Parallel-safe**: no.
- **Context hiện có**: `criterion.id` là key lookup trong `page.tsx:96,264`; mobile/desktop đang có hai renderer; unchanged đang render toàn bộ.
- **Constraints**: internal IDs vẫn giữ; không truncate comments/criteria names; không thêm chart/virtualization/dependency nếu chưa có long-task evidence.
- **Definition of Done**: 390/768/1440 không overflow; density cải thiện; no visible UUID/helper duplication; unchanged disclosure keyboard-accessible.
- **Status**: `[ ]`

### [#P96T06] [cache/bundle + browser + gates] Final performance and regression gate
- **Goal**: verify visual, behavioral, performance and data-integrity acceptance sau implementation.
- **Depends on**: `[#P96T03]`, `[#P96T04]`, `[#P96T05]`.
- **Parallel-safe**: no.
- **Context hiện có**: project gates `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `git diff --check`; authenticated browser evidence dùng account test được phép.
- **Constraints**: cold/warm tối thiểu 3 sample/mode nếu tooling hỗ trợ; không claim PASS từ FCP/skeleton; không deploy/push trong implementation gate.
- **Definition of Done**: milestone table before/after, screenshots, console/network, overflow/focus/navigation checks, deterministic gates PASS; query/cache/prefetch thay đổi chỉ được giữ nếu lợi ích ròng được đo.
- **Status**: `[ ]`

---

## Phase 97: Lịch sử đánh giá (DEFERRED — ngoài Phase 96)

### [#P97T01] [future history route] Lịch sử kỳ đóng read-only
- **Goal**: nếu có nhu cầu xem kỳ cũ, cung cấp entry riêng, đơn giản và không nhầm với kỳ đang mở:
  ```text
  Lịch sử đánh giá
    ├── Kỳ 2025 · Đã đóng
    └── Kỳ 2026 · Đã đóng
  ```
- **Depends on**: none — chỉ khởi động sau khi có plan/approval riêng.
- **Parallel-safe**: no.
- **Context hiện có**: detail/compare Phase 96 mặc định Active-only; `getActivePeriod()` và `getEvaluationByEmployeeAdmin()` hiện chưa đủ contract cho closed-period read-only; `saveEvaluationRound` cần server guard nếu historical detail được mở.
- **Constraints**: không tự fallback kỳ đóng trong detail/compare; không bắt người dùng nhập query parameter; hiển thị năm + `Đã đóng`; route và write action phải fail-closed theo auth/permission/period status; không sửa kỳ Active hiện tại.
- **Definition of Done**: historical entry rõ ràng, dữ liệu đúng `period_id`, chỉ read-only ở UI và server, browser kiểm tra kỳ Active không bị đổi, regression test permission/closed write guard PASS. Phase 97 chỉ được làm khi anh yêu cầu; không tự động bắt đầu sau Phase 96.
- **Status**: `[-]` — deferred, ngoài Phase 96.
