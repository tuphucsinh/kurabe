# KURABE QAQC — Task List (WBS)

> File làm việc cho `/do` — chỉ giữ việc đang làm và việc chờ. Chi tiết phase đã hoàn tất nằm trong `.ai/MASTER_PLAN.md`; trạng thái phiên gần nhất nằm trong `HANDOFF.md`.

## Pending / Next (cập nhật 2026-08-26)
- **AI env lên Vercel**: trạng thái hiện tại chưa được xác minh trong phiên này; chỉ xử lý khi anh yêu cầu triển khai/kiểm tra production.
- **QI Gia dụng chưa gán Leader** + 3 NV chưa gán SubLeader: giữ lại để xử lý khi anh tiếp tục UAT.
- **Cloudflare Tunnel**: named tunnel/Access vẫn chờ anh chuyển `vorigin.vn` nameserver sang Cloudflare và báo Active; không tự khởi động.
- **P2**: "Gợi ý khác" + Chat hỏi đáp dữ liệu — sau khi có data kỳ đầu ổn định.

---

## Phase 96: Multi-period integrity + tối ưu trang So sánh 🟡 (PLAN PASS — implementation chưa bắt đầu)

### [#P96T00] [live DB/catalog — read-only] Multi-period preflight
- **Goal**: xác minh Active cardinality, period/evaluation consistency và catalog index/constraint thật trước mọi implementation/migration.
- **Depends on**: none.
- **Parallel-safe**: no.
- **Context hiện có**: repo chưa có source evidence cho partial unique index `evaluation_periods.status = 'active'`; `getActivePeriod()` hiện `.limit(1).single()` nên nhiều Active bị chọn một row.
- **Constraints**: read-only; không in row/PII/credential; chỉ aggregate count/schema metadata; `>1` Active, duplicate `(period_id, employee_id)` hoặc provenance drift → STOP/Need approval, không auto-heal.
- **Definition of Done**: evidence ghi count 0/1/>1, exact catalog object/provenance hoặc `ABSENT`, current FK/unique state và decision `CONTINUE`/`STOP`; không mutation.
- **Status**: `[x]` — P96T00 verified: live Active = 1, evaluations = 53, rounds = 69, duplicate/orphan counts = 0. PostgREST không expose `pg_catalog`/`information_schema`; single-Active catalog invariant `ABSENT_IN_REPO_ONLY`, live metadata UNKNOWN. P96T01 được phép bắt đầu; P96T03 vẫn giữ direct-catalog/apply gate.

### [#P96T01] [browser/performance] Authenticated compare baseline waterfall
- **Goal**: đo cold/warm và các mốc `shell-visible`, `first-light-visible`, `grade-bands-ready`, `first-primary-complete`, `secondary-complete`, `full-complete` tại 390x844, 768x1024, 1440x900; kèm period matrix khi fixture/tooling read-only hỗ trợ.
- **Depends on**: `[#P96T00]`.
- **Parallel-safe**: yes.
- **Context hiện có**: `src/app/evaluations/[id]/compare/page.tsx` hiện global gate `isLoading`; `src/actions/read.ts` aggregate `employee/evaluation/users/groups`; `src/hooks/use-db.ts` query staleTime 2 phút.
- **Constraints**: chỉ đọc; không tạo/xóa kỳ hoặc mutate evaluation; không in credentials; phân biệt TTFB/LCP/CLS với data milestones; ghi request count/payload/long task nếu tooling hỗ trợ; đo riêng `getGradeBandsAction()` ở `page.tsx:47-53` và xác định fallback sync → authoritative DB transition.
- **Definition of Done**: bảng baseline cùng route/data ở 3 viewport, cold/warm tách riêng, console/network evidence và bottleneck hypothesis có source evidence; case không thể đo ghi `UNKNOWN`, không dựng fixture production.
- **Status**: `[x]` — PASS bằng Mika Playwright fallback sau Agy probe timeout: 3 cold + 3 warm mỗi viewport, authenticated HTTP 200 đúng compare route. Median first-light→full: 390 cold/warm `3313/2685ms`, 768 `2898/2480ms`, 1440 `2994/2786ms`; resource 25, transfer ~8.7KB, encoded ~450KB. Console chỉ có CSP Report-Only warning; không có app exception/failed request dai dẳng. Không fabricated metric.

### [#P96T02] [server page/scope/actions/hooks] Active-period server boundary
- **Goal**: implement Active-only contract bằng server-only resolver + server page wrapper trước client query; không để `periodId` undefined, localStorage/currentPeriod làm authority hoặc thêm dependent client waterfall.
- **Depends on**: `[#P96T01]`.
- **Parallel-safe**: no.
- **Context hiện có**: P96T02 candidate đã tách detail/compare thành RSC wrapper + client child; server-only resolver query tối đa 2 Active; hooks cache 2 phút và dùng `periodId`; aggregate gọi `getEvaluationByEmployeeAdmin(employeeId, periodId)`; `getEvaluationByEmployeeAction` không còn implicit fallback; inline history join/filter `evaluation_periods.status = 'closed'`; `src/lib/db/evaluations.ts` vẫn giữ client-compatible import.
- **Constraints**: đổi `page.tsx` thành RSC wrapper mỏng và chuyển body hiện tại sang client child; resolver mới module `server-only`, query tối đa 2 Active, discriminated union `ACTIVE`/`NO_ACTIVE_PERIOD`/`MULTIPLE_ACTIVE_PERIODS`; wrapper truyền `activePeriodId` thật, không browser resolver request riêng; chỉ ACTIVE enable hook; aggregate re-validate `period_id`; standalone action phải nhận exact period ID, không fallback `getActivePeriod()`; re-run consumer search rồi xóa `useEvaluationByEmployee` nếu vẫn unused hoặc đổi `periodId` thành required nếu giữ; inline history join/filter period `closed`; giữ `requireAuth`, `canViewEvaluation`, visible rounds, per-part error và stale guards; không PPR/cache/query split nếu baseline chưa chứng minh.
- **Definition of Done**: tests zero/one/multiple/query-error; hai main hooks không nhận `undefined`/`AuthContext.currentPeriod`; standalone hook không còn hoặc có required exact period ID; không call site current evaluation tự fallback helper cũ; detail/compare không gọi admin query thiếu period ID; Active-period Approved evaluation bị loại khỏi `HistoryList`, Closed Approved vẫn hiện; literal `Hiện chưa có kỳ đánh giá đang mở.` đúng; anomaly không hiển thị stale data; query key chứa exact ID; network evidence không có dependent client resolver request.
- **Status**: `[x]` — PASS: Mika fallback implemented after Agy execution lane blocked twice. Resolver/RSC boundary, explicit period propagation, fail-closed states, closed-only history, and regression tests verified. Evidence: `node scripts/run-tests.mjs` 28/28 PASS; `npm run lint` PASS; `npx tsc --noEmit` PASS; `npm run build` PASS; authenticated localhost detail/compare canary PASS with 0 console messages and 0 JS errors; fresh Agy `gemini-3.1-pro-high` review PASS, Critical/Important/Non-blocking NONE, confidence HIGH. Legacy Sidebar optional call remains compatibility-only and admin query now fails closed when periodId is absent.

### [#P96T03] [DB candidate + period action] Single-Active invariant và safe close
- **Goal**: tạo candidate DB invariant ngăn Active thứ hai và làm close fail-closed/không success giả.
- **Depends on**: `[#P96T00]`, `[#P96T02]`.
- **Parallel-safe**: no.
- **Context hiện có**: `createEvaluationPeriod()` insert status active không có DB-backed guard; `closeEvaluationPeriod()` update theo id nhưng không condition status/affected-row; live catalog chưa verified.
- **Constraints**: partial unique index có provenance + preflight + rollback; anomaly hiện hữu → STOP, không dedupe; close `.eq('status','active').select()` và verify exactly one row; `savePeriodTarget` cũng chỉ update Active; policy close khi còn incomplete evaluation phải hiện count/warning và được approval trước code; không apply production trong task này.
- **Definition of Done**: migration/rollback candidate hermetic; tests second-Active rejected, zero/one-row close, already-closed/nonexistent non-success và Closed target update rejected; Reviewer PASS; production apply vẫn `Need approval`.
- **Status**: `[x]` — PASS_WITH_CONSTRAINT: candidate migration/rollback và close/target affected-row guards đã verify; full suite 29/29, focused contract, lint, tsc, build PASS; fresh Agy `gemini-3.1-pro-high` review PASS clean, confidence HIGH. Live preflight không anomaly nhưng direct pg_catalog/information_schema vẫn UNKNOWN/BLOCKED do Management API/CLI 403; chưa apply migration, chưa deploy/push. Production apply = `Need approval` + direct catalog privilege required.

### [#P96T04] [period action + RPC] Atomic create và delete policy
- **Goal**: period + evaluations + round 1 được tạo atomic; historical business period không thể hard-delete qua normal action.
- **Depends on**: `[#P96T03]`.
- **Parallel-safe**: no.
- **Context hiện có**: create đang insert period/evaluations/rounds thành 3 write; delete đang xóa evaluations → ai summaries → period thành nhiều write độc lập.
- **Constraints**: ưu tiên transactional RPC nhận payload evaluator đã resolve server-side, không duplicate workflow authority trong SQL; failed create không để partial row; period có business evaluations trả non-success; empty được định nghĩa zero evaluations + zero ai_summaries; chỉ exact empty period được cleanup transactional, Manager auth và approval; không suy ra “test period” nếu schema không đánh dấu; không auto-clean production.
- **Definition of Done**: candidate contract kiểm tra atomic RPC, payload set/period binding, business-delete-blocked và exact-empty-delete; migration/RPC có provenance/rollback; Reviewer PASS; live failure injection/catalog verification vẫn là gate riêng vì direct DB access bị BLOCKED; apply production `Need approval`.
- **Status**: `[x]` — PASS_WITH_CONSTRAINT: candidate atomic create/delete đã verify; live DB integration/failure injection chưa chạy do Management API/pg_catalog access UNKNOWN/BLOCKED; chưa apply production.

### [#P96T05] [evaluation/AI actions + transaction RPC] Closed-period write firewall
- **Goal**: mọi write vào evaluations/evaluation_rounds fail-closed nếu period không Active, kể cả stale tab và transactional RPC.
- **Depends on**: `[#P96T03]`.
- **Parallel-safe**: no.
- **Context hiện có**: thiếu period-status guard trong `saveEvaluationRound`, `initializeEvaluationRoundDraft`, `returnEvaluationRound`, `saveResultMessageAction`; `db/repair-p3-evaluation-transaction-v2.sql:109-152` chỉ lock evaluation/round, chưa lock/check period và không được coi là output đã sửa.
- **Constraints**: shared helper `server-only` cho non-RPC action; inventory toàn bộ write callers trước patch; tạo SQL patch mới có provenance + rollback, join/lock exact evaluation period và require `status='active'` trong cùng transaction; không sửa đè/đưa repair-v2 cũ làm candidate mới; giữ evaluator/RBAC/idempotency/audit; stable business error; không chỉ ẩn UI.
- **Definition of Done**: source-contract tests cho mọi action Active/Closed/missing/multiple; direct action + stale-tab guard; RPC wrapper lock/check trong cùng transaction; no write/audit success giả; inventory 100% caller mapped; Reviewer PASS; live race/failure injection và migration apply vẫn `Need approval`.
- **Status**: `[x] PASS_WITH_CONSTRAINT` — focused contract PASS; full suite 31/31, lint, tsc, build PASS; fresh `gemini-3.1-pro-high` review PASS với Critical/Important = NONE. Direct REST precheck còn TOCTOU residual; lazy initializer có N+1 guard query. Live catalog/race/failure injection `UNKNOWN/BLOCKED`; chưa apply.

### [#P96T06] [compare static/loading frame] Static shell và local loading states
- **Goal**: render 100% static structure của compare trước data; loading chỉ che vùng data, không fake score/grade/name/action.
- **Depends on**: `[#P96T02]`, `[#P96T05]`.
- **Parallel-safe**: no.
- **Context hiện có**: `src/app/evaluations/[id]/compare/loading.tsx` generic skeleton; `page.tsx:105-121` generic spinner.
- **Constraints**: frame stateless; không form/handler/privileged control; loading không nested invalid HTML; route fallback và client pre-data geometry nhất quán.
- **Definition of Done**: DOM marker `data-load-layer="static"`/local states đo được; shell không phụ thuộc aggregate response; no duplicate interactive tree.
- **Status**: `[x] PASS_WITH_CONSTRAINT` — static contract PASS; full suite 32/32, lint, tsc, build PASS; reviewer R2 `gemini-3.1-pro-high` PASS với Critical/Important/Non-blocking NONE. Browser authenticated canary `BLOCKED_AUTH` do route 307 `/login`; chưa claim visual PASS.

### [#P96T07] [compare page/components] Progressive primary/secondary render
- **Goal**: summary và changed criteria usable trước comments/unchanged section khi dependency cho phép; chỉ có retry/local error riêng nếu data source được tách thật; nếu giữ aggregate thì bảo toàn aggregate error contract, không tạo retry giả.
- **Depends on**: `[#P96T02]`, `[#P96T06]`.
- **Parallel-safe**: no.
- **Context hiện có**: summary `page.tsx:186-246`; changed criteria `248-407`; comments `409-455`; unchanged `457-485`.
- **Constraints**: không đổi score/grade/delta/round ordering/access; không render score 0 thay missing data; unchanged đóng mặc định; giữ comments đầy đủ; `getGradeBandsAction()` có state/error contract riêng và grade authoritative không bị thay đổi im lặng sau primary milestone.
- **Definition of Done**: primary/secondary markers đo được; stale scope không hiển thị data cũ; changed criteria và comments đúng với baseline.
- **Status**: `[x] PASS_WITH_CONSTRAINT` — aggregate source giữ nguyên; thêm truthful `data-load-state` và `data-load-phase` markers, primary DOM trước secondary, không fake streaming/delay/retry/query. Focused contract PASS; full suite 33/33, lint, tsc, build PASS; fresh reviewer `gemini-3.1-pro-high` PASS với Critical/Important/Non-blocking NONE. Browser authenticated canary `BLOCKED_AUTH` do route 307 `/login`.

### [#P96T08] [compare page/components] Compact render-cost reduction
- **Goal**: bỏ criterion IDs khỏi DOM, giảm duplicated delta/labels/cards/padding và tránh duplicate computation mobile/desktop.
- **Depends on**: `[#P96T07]`.
- **Parallel-safe**: no.
- **Context hiện có**: `criterion.id` là key lookup trong `page.tsx:96,264`; mobile/desktop đang có hai renderer; unchanged đang render toàn bộ.
- **Constraints**: internal IDs vẫn giữ; không truncate comments/criteria names; không thêm chart/virtualization/dependency nếu chưa có long-task evidence.
- **Definition of Done**: 390/768/1440 không overflow; density cải thiện; no visible UUID/helper duplication; unchanged disclosure keyboard-accessible.
- **Status**: `[x] PASS_WITH_CONSTRAINT` — visible criterion IDs removed, shared memoized `comparisonRows` feeds mobile/desktop, unchanged uses native closed-by-default `<details>/<summary>`, modest density reduction. Focused PASS; full suite 34/34, lint (zero warnings), tsc, build PASS; fresh reviewer R2 `gemini-3.1-pro-high` PASS với Critical/Important/Non-blocking NONE. Browser authenticated canary `BLOCKED_AUTH` do route 307 `/login`.

### [#P96T09] [cache/browser/gates] Final performance and integrity gate
- **Goal**: verify visual, behavioral, performance và data-integrity acceptance sau implementation.
- **Depends on**: `[#P96T02]`, `[#P96T03]`, `[#P96T04]`, `[#P96T05]`, `[#P96T06]`, `[#P96T07]`, `[#P96T08]`.
- **Parallel-safe**: no.
- **Context hiện có**: project gates `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `git diff --check`; authenticated browser evidence dùng account test được phép.
- **Constraints**: cold/warm tối thiểu 3 sample/mode nếu tooling hỗ trợ; không claim PASS từ FCP/skeleton; verify Active→Closed, none→new Active, stale tab/cross-tab; không apply migration/deploy/push trong implementation gate.
- **Definition of Done**: milestone before/after, screenshots, console/network, overflow/focus/navigation, zero/one/multiple Active, cache transition và Closed-write matrix PASS; deterministic gates PASS; query/cache/prefetch chỉ giữ nếu lợi ích ròng được đo; DB/RPC apply vẫn chờ approval.
- **Status**: `[ ]`

---

## Phase 97: Lịch sử đánh giá (DEFERRED — ngoài Phase 96)

### [#P97T01] [future history route] Lịch sử kỳ đóng read-only đầy đủ
- **Goal**: nếu có nhu cầu xem kỳ cũ, cung cấp entry riêng, đơn giản và không nhầm với kỳ đang mở:
  ```text
  Lịch sử đánh giá
    ├── Kỳ 2025 · Đã đóng
    └── Kỳ 2026 · Đã đóng
  ```
- **Depends on**: none — chỉ khởi động sau khi có plan/approval riêng.
- **Parallel-safe**: no.
- **Context hiện có**: detail hiện có `HistoryList` summary nhưng query đang dựa evaluation `Approved`, chưa chứng minh period `Closed`; Phase 96 sẽ giới hạn summary này thành closed-only và hoàn tất write firewall. Phase 97 chỉ bổ sung entry/route lịch sử đầy đủ.
- **Constraints**: không tự fallback kỳ đóng trong detail/compare; không bắt query parameter; hiển thị năm + `Đã đóng`; route fail-closed theo auth/permission/period status; tái sử dụng Phase 96 write firewall, không tạo authority thứ hai; không sửa kỳ Active.
- **Definition of Done**: historical entry rõ ràng, dữ liệu exact `period_id` + period `Closed`, chỉ read-only UI/server, browser kiểm tra Active không bị đổi, permission regression PASS. Chỉ làm khi anh yêu cầu; không tự bắt đầu sau Phase 96.
- **Status**: `[-]` — deferred, ngoài Phase 96.
