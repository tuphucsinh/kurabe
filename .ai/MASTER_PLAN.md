# MASTER_PLAN.md

> **Canonical plan của Kurabe QAQC.** File này giữ quyết định, trạng thái và kế hoạch còn có giá trị vận hành. Changelog/WBS chi tiết của phase đã hoàn tất không lưu ở đây; xem `.ai/DECISIONS_LOG.md`, `.ai/KNOWN_BUGS.md` và Git history khi cần truy vết.

## 1. Trạng thái hiện tại

- **Production:** `https://lykiv.vercel.app` — GitHub `main` tự deploy qua Vercel.
- **Phase hiện tại:** Phase 96 — `PLAN PASS`, chưa triển khai application code.
- **Phase kế tiếp:** Phase 97 — `DEFERRED`, chỉ làm khi anh yêu cầu riêng.
- **Phase 95:** static-first evaluation detail đã hoàn tất và đã verify production.
- **Không thay đổi trong plan-only work:** scoring, workflow, auth/RBAC, database schema, evaluation write path và production runtime.

## 2. Invariants phải giữ

### Quyền và dữ liệu

- Mọi server action nhạy cảm phải `requireAuth()`/`requireRole()`/`requireManager()` đúng ngữ cảnh; không tin `actorId`, `managerId` hoặc quyền do client truyền.
- Server actions là lớp ghi dữ liệu; các bảng nghiệp vụ chính không cho anon write. `supabaseAdmin` chỉ chạy server-side, không import vào client component.
- `canViewEvaluation()` và visible-round filtering phải fail-closed. Không mở rộng quyền chỉ vì cùng team.
- Không log, commit hoặc đưa vào prompt các credential, token, password, service key hay PII không cần thiết.
- Scoring/grade bands/workflow là contract nghiệp vụ; UI và loading state không được tự tính lại theo quy tắc khác.

### Evaluation workflow

- Role workflow hiện hành: Manager self-eval 1 vòng; Leader 2 vòng; SubLeader 3 vòng; Employee 3 vòng theo evaluator được phân công.
- Submit/save/return phải giữ idempotency, điều kiện update và rollback safety.
- Transactional evaluation RPC đang bật sau production canary PASS; lỗi SQL `42702` đã được sửa bằng alias qualification.
- Mọi write vào evaluation phải fail-closed khi kỳ không còn `Active`. Phạm vi guard gồm save/submit, first-open draft, return/unlock, result-message write và transactional RPC; không defer nền tảng này tới historical route.

### Loading và performance

- Skeleton chỉ mô tả geometry, không được hiển thị score/grade/name/value giả.
- Performance claim phải dựa trên milestone data thật, không dựa riêng spinner/FCP/cảm nhận.
- Không thêm cache, prefetch, PPR/RSC rewrite, query split, virtualization hoặc dependency mới nếu chưa có evidence lợi ích ròng và rollback rõ.

## 3. Lịch sử đã hoàn tất — bản rút gọn

| Phase | Trạng thái | Nội dung cần giữ |
|---|---|---|
| 32–43, 45–51 | DONE | Nền tảng Supabase/criteria, scoring, workflow, reporting/export, responsive/accessibility và các đợt audit ban đầu. Chi tiết lịch sử không còn là input triển khai hiện tại. |
| 52–54 | DONE | Settings hub; password reset; server-side auth guards; audit log; RLS/select-only cho các bảng đã khóa; production readiness. |
| 55–58 | DONE | Mục tiêu kỳ từ DB; anomaly detection; AI summary; AI nhận xét và draft thông báo. AI luôn fail-soft và key chỉ ở server. |
| 59 | DONE / ngoài repo | Tích hợp profile hỗ trợ riêng; không phải code path của repo Kurabe. |
| 61–65 | DONE | SubLeader assignment và evaluator workflow; return/reject evaluation; live E2E trên org test; test data đã dọn, baseline production được khôi phục. |
| 69–70 | DONE | Password login thật với NULL fallback; password hash không lộ cho anon; toàn bộ write nghiệp vụ chuyển qua server actions/admin client; anon-write verification và E2E PASS. |
| 71–74 | DONE | Guide theo role + print route; support page tinh gọn; thêm nhân viên từ team detail; Leader card riêng. |
| 75–77 | DONE | Chat hỗ trợ theo role; context trang/người dùng/kỳ/vòng có scope; báo lỗi và webhook; live AI tests PASS; các kế hoạch AI mở rộng đã được kiểm thử theo phạm vi đã chốt. |
| 78–91 | DONE | Mobile responsive; team-detail mobile redesign; static loading shells; PPR pilot bị rollback do build contract Next 16; aggregate actions giảm roundtrip; lazy-load/prefetch; chat context refinement. |
| 92 | DONE | Transactional evaluation RPC production hardening, authenticated canary và failure-path rollback PASS. |
| 93 | DONE | Draft hydrate canonical; selected-level metadata; AI current-round context; responsive evaluation UI; 27/27 tests và build gates PASS. |
| 94 | CLOSED / absorbed | Staged-loading investigation và rich skeleton được hấp thụ vào Phase 95; không còn task độc lập. |
| 95 | DONE | `EvaluationStaticFrame` stateless cho route loading/client pre-data; static structure render trước page data; giữ permission controls sau access state. Authenticated canary 390/768/1440 PASS; không HTTP failure, overflow hoặc JS exception. |

## 4. Phase đã defer hoặc không tự khởi động

### Cloudflare Tunnel

- Named tunnel/Cloudflare Access chỉ làm khi anh chuyển `vorigin.vn` nameserver sang Cloudflare và báo Active.
- Không tự tạo public tunnel, không tự bật systemd service, không tự mở Access policy.

### Phase 97 — Lịch sử đánh giá

- **DEFERRED — ngoài Phase 96.** Không tự khởi động sau khi Phase 96 hoàn tất.
- Khi có nhu cầu, entry riêng phải hiển thị rõ:

```text
Lịch sử đánh giá
  ├── Kỳ 2025 · Đã đóng
  └── Kỳ 2026 · Đã đóng
```

- Detail hiện có `HistoryList` tóm tắt các kết quả cũ cho employee owner; Phase 96 phải làm rõ phần inline này chỉ đọc dữ liệu thuộc period `Closed`, không coi evaluation `Approved` trong kỳ `Active` là “kỳ trước”.
- Phase 97 là entry/route lịch sử đầy đủ, tách biệt; phải read-only ở UI và server, dùng `requireAuth()` + `canViewEvaluation()`.
- Closed-period write guard là invariant nền tảng của Phase 96, không chờ Phase 97 và không chỉ ẩn nút UI.
- Không dùng fallback ngầm, không bắt người dùng tự nhập query parameter, không làm thay đổi kỳ `Active` hiện tại.
- Chỉ triển khai sau plan/WBS và approval riêng.

## 5. Phase 96 — Multi-period integrity + Compare UI/performance

**Trạng thái:** `PLAN PASS`; R3 integrity review trả `PLAN_CHANGES_REQUIRED`; R4 PASS còn một góp ý Important đã sửa; Agy Sonnet 4.6 R5 `PLAN_PASS`, `CRITICAL: NONE`, `IMPORTANT: NONE`, `NON_BLOCKING: NONE`. Chưa sửa application code.

### Mục tiêu và boundary

- Bảo đảm detail/compare luôn đọc đúng một kỳ `Active`, không cache/query không scope và không ghi vào kỳ `Closed`.
- Ngăn dữ liệu phát sinh nhiều Active ở DB; nếu live preflight đã có anomaly thì dừng, không tự sửa hoặc auto-pick.
- Tối ưu `/evaluations/[id]/compare` trên mobile/PC và giảm thời gian tới nội dung so sánh hữu ích bằng evidence thật.
- Bỏ UUID `criterion.id` khỏi DOM nhưng giữ làm key lookup nội bộ; giảm card/padding/helper/delta/label lặp; unchanged criteria đóng mặc định.
- Giữ nguyên scoring, grade bands, workflow, round ordering, comments, navigation, auth/RBAC, access semantics và accessibility.
- Không migration, data cleanup, deploy, push hoặc production mutation trong plan/review gate. Candidate DB/RPC chỉ được apply sau preflight, review độc lập, rollback verification và approval rõ của anh.
- Không thêm chart, dependency, virtualization, PPR, cache hoặc query split khi chưa có measurement.

### Active-period read contract

1. Tạo helper mới trong module `server-only`; không biến `src/lib/db/evaluations.ts` thành server-only vì file này đang có client import.
2. `page.tsx` của detail/compare trở thành React Server Component mỏng; thân client hiện tại chuyển sang client child tương ứng. RSC gọi resolver và truyền scope xuống child, nên không phát sinh dependent browser request chỉ để lấy period ID.
3. Server page wrapper resolve scope trước khi mount client query và trả discriminated result:
   - `{ kind: 'ACTIVE', activePeriodId, selectedPeriodStatus: 'Active', selectionReason: 'ACTIVE_ONLY' }`;
   - `{ kind: 'NO_ACTIVE_PERIOD', selectionReason: 'NO_ACTIVE_PERIOD' }`;
   - `{ kind: 'MULTIPLE_ACTIVE_PERIODS', selectionReason: 'MULTIPLE_ACTIVE_PERIODS' }`.
4. Resolver query tối đa 2 dòng `status = 'active'`, không `.single()` và không dùng helper cũ `.limit(1).single()`; helper cũ sẽ âm thầm lấy một row nếu nhiều Active vì đã limit trước khi single.
5. Chỉ state `ACTIVE` mới enable `useEvaluationPageData`/`useEvaluationComparePageData`; truyền `activePeriodId` thật vào React Query key và aggregate action.
6. Aggregate re-validate evaluation có đúng `period_id = activePeriodId`; `getEvaluationByEmployeeAdmin()` không được chạy employee-only `.maybeSingle()` khi thiếu period ID.
7. `getEvaluationByEmployeeAction` phải bỏ optional fallback qua `getActivePeriod()`. Repo search hiện không thấy consumer của `useEvaluationByEmployee` ngoài định nghĩa; P96T02 phải re-check, xóa hook nếu vẫn unused hoặc đổi `periodId` thành required nếu giữ. Inventory xác nhận không còn standalone call site tự chọn một Active.
8. Inline history query phải join/filter `evaluation_periods.status = 'closed'`; evaluation `Approved` trong period `Active` không được xuất hiện trong `HistoryList`.
9. Không dùng `localStorage`, `AuthContext.currentPeriod`, cookie selected period hoặc `undefined` làm authority cho current detail/compare; không fallback sang `Closed`/latest.
10. `NO_ACTIVE_PERIOD` hiển thị đúng literal `Hiện chưa có kỳ đánh giá đang mở.`; anomaly fail-closed, không dùng stale cache để che lỗi và log không chứa PII.
11. Không thêm dependent client resolver request. Nếu muốn chọn topology khác server wrapper, P96T01 phải chứng minh lợi ích ròng và plan phải được review lại.

### Multi-period write/lifecycle contract

1. Live preflight read-only phải kiểm tra Active cardinality và catalog index/constraint thật. `0/1` Active cho phép tiếp tục; `>1` Active hoặc schema drift → STOP/Need approval, không tự heal.
2. Candidate migration phải có provenance, preflight fail-closed và rollback để bảo đảm tối đa một `status = 'active'` bằng partial unique index. App resolver vẫn giữ anomaly branch để chống drift/manual corruption.
3. `createEvaluationPeriod` phải atomic cho period + evaluations + round 1. Hướng mặc định là transactional RPC sau khi TS đã resolve evaluator payload; không giữ chuỗi insert có thể để lại kỳ Active nửa chừng.
4. `closeEvaluationPeriod` chỉ update đúng row đang `active`, dùng `.select()`/affected-row check; close nonexistent/already closed không được trả success giả. `savePeriodTarget` cũng chỉ sửa kỳ `Active`. Policy kỳ còn evaluation chưa hoàn tất phải hiện count/warning và được chốt trước implementation, không tự suy đoán.
5. Không hard-delete period có evaluation nghiệp vụ. “Empty period” được định nghĩa đúng bằng zero `evaluations` và zero `ai_summaries`; chỉ empty period được cleanup qua transaction, exact ID, auth Manager và approval. Không có khái niệm “test” ngầm nếu schema không đánh dấu; historical business data mặc định giữ read-only.
6. Shared server-only writable guard phải phủ `saveEvaluationRound`, `initializeEvaluationRoundDraft`, `returnEvaluationRound`, `saveResultMessageAction` và mọi action/RPC khác ghi `evaluations`/`evaluation_rounds`.
7. `db/repair-p3-evaluation-transaction-v2.sql` là baseline cũ và không có period guard; P96T05 phải tạo candidate SQL patch mới có provenance/rollback, lock/check period `Active` bên trong cùng transaction để đóng TOCTOU. Application precheck không thay thế SQL guard.
8. Active → Closed phải vô hiệu write ngay cả từ tab/cache cũ. Create/close phải có cache-transition contract cho detail/compare, không phụ thuộc riêng `revalidatePath` hoặc staleTime.

### Loading/data contract

Các milestone phải đo riêng và có DOM marker/state rõ:

1. `shell-visible`: title, back action, employee slot, summary slot, changed-criteria frame, comments heading và unchanged disclosure frame.
2. `data-skeleton-visible`: chỉ placeholder vùng đang chờ; không fake value và không global gate.
3. `first-light-visible`: employee/evaluation/access hoặc summary context đầu tiên.
4. `grade-bands-ready`: grade-band response/fallback transition đã rõ.
5. `first-primary-complete`: summary điểm/hạng và changed criteria đúng.
6. `secondary-complete`: comments và unchanged data sẵn sàng.
7. `full-complete`: toàn bộ data/async grade work hoàn tất.

Không dùng FCP, spinner biến mất hoặc skeleton visible để claim data đã sẵn sàng.

### WBS triển khai

- **P96T00 — Live read-only preflight:** Active cardinality, period/evaluation consistency và catalog provenance; không đọc PII, không mutation.
- **P96T01 — Baseline:** authenticated cold/warm tại `390x844`, `768x1024`, `1440x900`; đo request/payload/data milestones và grade-band transition trên baseline chưa đổi.
- **P96T02 — Server scope boundary:** RSC wrapper + server-only resolver + actual-ID query key + aggregate re-validation; bỏ standalone active fallback và lọc inline history theo period `Closed`.
- **P96T03 — Single-Active invariant và safe close:** candidate partial unique index với preflight/rollback; close status/affected-row guard; chỉ apply production sau approval riêng.
- **P96T04 — Atomic lifecycle/delete policy:** transactional create; chặn hard-delete period có business evaluations; chỉ exact empty-period cleanup transactional.
- **P96T05 — Closed-period write firewall:** shared guard cho mọi action và SQL patch mới bổ sung in-transaction period guard cho evaluation RPC; cross-tab Active→Closed regression tests.
- **P96T06 — Static frame:** shared stateless compare frame cho route loading/client pre-data; không form/state/handler/privileged action/fake value.
- **P96T07 — Progressive render:** summary/changed criteria trước comments/unchanged khi dependency cho phép; giữ per-part error/stale contract.
- **P96T08 — Compact render:** giảm duplicate computation/visible UUID/helper; unchanged disclosure keyboard-accessible; không truncate content.
- **P96T09 — Final gate:** code gates + browser/performance/data-integrity matrix; chỉ giữ cache/prefetch/split nếu có lợi ích ròng.

### Acceptance, approval và rollback

- `0 Active` → `NO_ACTIVE_PERIOD`; `1 Active` → exact `period_id`; `>1 Active` → fail-closed; không query/cache với `periodId=undefined`.
- DB candidate từ chối Active thứ hai; failed create không để lại period/evaluation/round partial; close/delete không success giả và không mất historical business data.
- Kỳ `Closed` từ chối mọi write qua direct action, stale tab và transactional RPC; lỗi có contract ổn định, không lộ thông tin nhạy cảm.
- Inline `HistoryList` chỉ nhận kỳ `Closed`; Phase 97 vẫn là route lịch sử đầy đủ deferred.
- Có evidence trước/sau cho shell/light/grade-bands/primary/secondary/full ở ba viewport; cold/warm tách riêng, tối thiểu 3 mẫu/mode nếu tooling hỗ trợ.
- Không horizontal overflow, layout shift nghiêm trọng, console/runtime/network failure chưa giải thích; auth/RBAC, score/grade/delta, rounds/comments/navigation không đổi.
- Nếu primary/full-complete xấu hơn materially hoặc request topology thêm waterfall không được baseline biện minh thì non-PASS.
- Mỗi candidate DB/RPC có preflight, provenance, rollback script/hash và Reviewer PASS; production apply/migration/deploy/push cần approval riêng của anh.
- UI/loading rollback theo từng commit nhỏ; anomaly/data drift là stop condition, không tự cleanup.

## 6. Verification và residual risk

### Gates chuẩn

```text
npm run typecheck
npm run lint
npm test
npm run build
git diff --check
```

Authenticated browser evidence phải dùng account được phép; không lưu identity/credential trong tài liệu. Với UI, phải kiểm tra responsive, overflow, focus, navigation, console và network.

### Residual risks còn hiệu lực

- P96T00 đã verify live Active cardinality = 1, 53 evaluations, 69 rounds, không orphan/duplicate; PostgREST không expose system catalog nên partial-unique invariant mới `ABSENT_IN_REPO_ONLY`, live catalog metadata vẫn UNKNOWN và phải gate ở P96T03.
- P96T01 baseline đã PASS bằng Mika Playwright fallback sau Agy timeout: 3 cold + 3 warm mỗi viewport, authenticated HTTP 200; median first-light→full = 390 `3313/2685ms`, 768 `2898/2480ms`, 1440 `2994/2786ms`. Agy probe timeout được giữ trong evidence; console warning CSP Report-Only, không có app exception/failed request dai dẳng.
- P96T02 đã PASS ở local candidate: RSC/server-only Active resolver, explicit real periodId query/cache boundary, fail-closed zero/multiple/error states, closed-only inline history; full tests/lint/typecheck/build và authenticated localhost canary đều PASS. Agy `gemini-3.1-pro-high` fresh review PASS với Critical/Important/Non-blocking = NONE, HIGH confidence. Agy execution lane blocked twice; Mika fallback đã được ghi nhận.
- P96T03 candidate đã PASS_WITH_CONSTRAINT: partial unique index migration/rollback có preflight fail-closed, close/target update có status Active + affected-row guard, create giữ DB uniqueness authority; focused contract, full suite 29/29, lint, tsc, build và fresh Agy review đều PASS. Live catalog vẫn UNKNOWN/BLOCKED do Management API/CLI 403; chưa apply production, cần direct catalog privilege + approval riêng.
- P96T04 candidate đã PASS_WITH_CONSTRAINT: create period/evaluations/round-1 qua atomic RPC với evaluator resolution giữ ở TypeScript; delete chỉ cho exact-empty Closed period, không xóa business child rows; focused contract PASS, full suite 30/30, lint, tsc, build và fresh Agy review PASS clean. Live failure injection/catalog verification BLOCKED; chưa apply migration.
- P96T05 candidate đã PASS_WITH_CONSTRAINT: shared server-only exact-Active guard phủ evaluation/AI direct writers và lazy initializer; `save_evaluation_round_transaction_active_only` wrapper khóa parent period `FOR UPDATE`, check exact `active`, rồi delegate P3 trong cùng transaction; multiple Active lazy topology fail-closed; rollback exact/provenance/GUC guarded. Focused contract PASS, full suite 31/31, lint, tsc, build PASS; fresh Agy review PASS, Critical/Important NONE. Direct REST precheck TOCTOU và lazy N+1 là Non-blocking residuals; live catalog/race/failure injection UNKNOWN/BLOCKED; chưa apply.
- P96T06 candidate đã PASS_WITH_CONSTRAINT: compare loading/client pre-data dùng shared stateless static frame, stable layer markers và shared header cho loaded/error/blocked states; không fake business values, không duplicate interactive loading tree. Focused contract PASS, full suite 32/32, lint, tsc, build PASS; fresh Agy reviewer R2 PASS, Critical/Important/Non-blocking NONE. Authenticated browser canary `BLOCKED_AUTH` do localhost route 307 `/login`; chưa claim visual PASS.
- P96T07 candidate đã PASS_WITH_CONSTRAINT: aggregate compare source giữ nguyên; primary summary/changed-criteria và secondary comments/unchanged có `data-load-phase`/truthful aggregate `data-load-state`, primary đứng trước secondary. Không fake streaming/delay/retry/query/waterfall. Focused contract PASS, full suite 33/33, lint, tsc, build PASS; fresh Agy reviewer PASS, Critical/Important/Non-blocking NONE. Authenticated browser canary `BLOCKED_AUTH` do route 307 `/login`; chưa claim visual PASS.
- P96T08 candidate đã PASS_WITH_CONSTRAINT: visible criterion IDs bỏ khỏi changed/unchanged output nhưng giữ internal key/lookup; shared memoized `comparisonRows` dùng cho mobile/desktop; unchanged chuyển native closed-by-default `<details>/<summary>`; density giảm nhẹ, không truncate. Focused contract PASS, full suite 34/34, lint zero warnings, tsc, build PASS; fresh Agy reviewer R2 PASS, Critical/Important/Non-blocking NONE. Authenticated browser canary `BLOCKED_AUTH` do route 307 `/login`; chưa claim visual PASS.
- P96T09 final gate `PARTIAL/UNKNOWN`: source commit `4ff47f3` clean/integrity PASS; `npm run test` 34/34, lint, typecheck, build PASS; authenticated compare canary PASS ở desktop CSS viewport `1280x633` với browser_vision top-of-page rendered snapshot, live data, overflow delta `0`, native disclosure keyboard open/close, detail→compare→back, hard reload và console/JS errors 0. Navigation samples `1075.6/581.6/502.7 ms`, median `581.6 ms` là local browser timing, không phải production baseline. Browser `window.resizeTo()` không đổi viewport nên mobile/tablet/1440 authenticated screenshots chưa có evidence độc lập hợp lệ; cross-tab cache/stale-tab, live Active→Closed/none→new Active vẫn UNKNOWN. Disposable local Supabase boot BLOCKED bởi legacy migration `20260815180000_add_users_gender.sql` tham chiếu thiếu `public.users`; không sửa migration lịch sử. P96T03–P96T05 catalog/race/failure-injection vẫn UNKNOWN/BLOCKED; không claim Phase 96 final PASS, không apply/deploy/push.
- Passwordless fallback vẫn là lựa chọn nghiệp vụ hiện tại; rate-limit và CSP Report-Only warning là residual đã biết.
- Timing production của compare và period cardinality thực tế chưa được baseline trong Phase 96.
- Các lỗi/lesson chi tiết nằm trong `.ai/KNOWN_BUGS.md`; không nhân bản vào plan này.

## 7. Quy tắc thay đổi plan

- Phase DONE chỉ cập nhật một dòng/tóm tắt ngắn, không đưa lại WBS hoặc transcript vào file này.
- Phase mới phải có goal, boundary, acceptance, verification, rollback và approval gate nếu chạm auth/DB/production.
- Không coi plan là bằng chứng implementation. Mọi trạng thái `PASS/DONE` phải có evidence tương ứng.
- Push, merge, deploy, migration, credential hoặc production mutation chỉ sau approval rõ ràng của anh.
