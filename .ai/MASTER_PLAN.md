# MASTER_PLAN.md

> **Canonical plan của Kurabe QAQC.** File này giữ quyết định, trạng thái và kế hoạch còn có giá trị vận hành. Changelog/WBS chi tiết của phase đã hoàn tất không lưu ở đây; xem `.ai/DECISIONS_LOG.md`, `.ai/KNOWN_BUGS.md` và Git history khi cần truy vết.

## 1. Trạng thái hiện tại

- **Production:** `https://lykiv.vercel.app` — GitHub `main` tự deploy qua Vercel.
- **Phase hiện tại:** Phase 96 — `PLAN READY`, chưa triển khai application code.
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
- `saveEvaluationRound` vẫn còn residual risk: chưa có guard đầy đủ theo `evaluation_periods.status`; phải xử lý trước khi mở historical write/read path.

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

- Route lịch sử phải read-only ở UI và server; dùng `requireAuth()` + `canViewEvaluation()`.
- Write action phải chặn kỳ `Closed` ở server, không chỉ ẩn nút UI.
- Không dùng fallback ngầm, không bắt người dùng tự nhập query parameter, không làm thay đổi kỳ `Active` hiện tại.
- Chỉ triển khai sau plan/WBS và approval riêng.

## 5. Phase 96 — Compare UI và loading performance

**Trạng thái:** `PLAN READY`; Agy Sonnet 4.6 review R1 yêu cầu sửa, R2 `PLAN_PASS`; chưa sửa application code.

### Mục tiêu và phạm vi

- Tối ưu `/evaluations/[id]/compare` trên mobile/PC và giảm thời gian tới nội dung so sánh hữu ích.
- Bỏ UUID `criterion.id` khỏi DOM nhưng giữ làm key lookup nội bộ.
- Giảm card/padding/helper/delta/label lặp; changed criteria là nội dung chính; unchanged criteria đóng mặc định.
- Giữ nguyên score, grade, round ordering, comments, navigation, auth/RBAC, access semantics và accessibility.
- Không thêm chart, dependency, virtualization, PPR, cache hoặc query split khi chưa có measurement.

### Active-period contract bắt buộc

Detail và compare hiện chưa bảo đảm lọc kỳ vì call site còn truyền `undefined` vào aggregate path. Implementation phải:

1. Resolve scope ở server trước khi enable evaluation query.
2. Chỉ chấp nhận đúng một period có status `Active`.
3. Truyền `activePeriodId` thật vào React Query key và re-validate `period_id` trong aggregate query.
4. Không dùng `localStorage`, `AuthContext.currentPeriod` hoặc `undefined` làm server authority.
5. Không gọi `getActivePeriod()` hiện tại làm resolver duy nhất cho detail/compare vì `.single()` không phân biệt zero/multiple.
6. Resolver đọc tối đa 2 dòng Active, không `.single()`:
   - 0 dòng → `NO_ACTIVE_PERIOD`, không query evaluation và hiển thị `Hiện chưa có kỳ đánh giá đang mở.`
   - 1 dòng → dùng đúng `activePeriodId`.
   - 2 dòng → `MULTIPLE_ACTIVE_PERIODS`, fail-closed và log anomaly.
7. Không fallback sang kỳ `Closed` hoặc kỳ mới nhất.
8. Không để `getEvaluationByEmployeeAdmin()` chạy employee-only `.maybeSingle()` khi thiếu `period_id`.
9. Trả metadata `selectedPeriodId`, `selectedPeriodStatus`, `selectionReason` để UI không nói sai ngữ nghĩa.

`getActivePeriod()` vẫn có thể được dùng bởi chat context hoặc path có period picker; không đổi semantics helper đó ngoài scope này nếu chưa audit call chain.

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

- **P96T01 — Baseline:** authenticated cold/warm tại `390x844`, `768x1024`, `1440x900`; đo TTFB/LCP/CLS nếu có, request count, payload/action duration, long tasks, console/network failure và toàn bộ milestone. Đo riêng `getGradeBandsAction()`; ghi rõ fallback sync hay authoritative DB.
- **P96T02 — Scope/boundary:** implement Active resolver fail-closed, exact `period_id`, real cache key; quyết định giữ aggregate hay split dựa trên baseline. Giữ `requireAuth`, `canViewEvaluation`, visible-round filtering, generation/stale guards và rollback.
- **P96T03 — Static frame:** tạo shared stateless compare frame cho route loading và client pre-data; không form, state, handler, privileged action hoặc fake value.
- **P96T04 — Progressive render:** render summary/changed criteria trước comments/unchanged khi dependency cho phép; giữ aggregate error contract nếu không tách data source; grade-band state/error phải độc lập, không đổi grade âm thầm.
- **P96T05 — Compact render:** giảm duplicated mobile/desktop computation và visible UUID/helper; unchanged disclosure phải keyboard-accessible; không truncate comments/criteria names.
- **P96T06 — Final gate:** lặp browser matrix và code gates; so sánh cùng route/data/viewport với baseline; chỉ giữ cache/prefetch/dynamic changes nếu có lợi ích ròng.

### Acceptance và rollback

- Có evidence trước/sau cho shell, light, grade-bands, primary, secondary và full-complete ở ba viewport; cold/warm tách riêng, tối thiểu 3 mẫu/mode nếu tooling hỗ trợ.
- Một Active → detail/compare đúng `period_id`; không Active → `NO_ACTIVE_PERIOD`; nhiều Active → `MULTIPLE_ACTIVE_PERIODS`; không cache dưới `periodId=undefined`.
- Không horizontal overflow, layout shift nghiêm trọng, console/runtime/network failure chưa giải thích.
- Auth/RBAC, score/grade/delta, round ordering, comments và navigation không đổi.
- Nếu perceived load cải thiện nhưng primary/full-complete xấu hơn materially thì không PASS.
- Rollback theo từng commit UI/loading nhỏ; không migration, không data cleanup, không deploy/push trong implementation gate.

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

- `saveEvaluationRound` cần server-side Closed-period guard trước Phase 97.
- Passwordless fallback vẫn là lựa chọn nghiệp vụ hiện tại; rate-limit và CSP Report-Only warning là residual đã biết.
- Timing production của compare và period cardinality thực tế chưa được baseline trong Phase 96.
- Các lỗi/lesson chi tiết nằm trong `.ai/KNOWN_BUGS.md`; không nhân bản vào plan này.

## 7. Quy tắc thay đổi plan

- Phase DONE chỉ cập nhật một dòng/tóm tắt ngắn, không đưa lại WBS hoặc transcript vào file này.
- Phase mới phải có goal, boundary, acceptance, verification, rollback và approval gate nếu chạm auth/DB/production.
- Không coi plan là bằng chứng implementation. Mọi trạng thái `PASS/DONE` phải có evidence tương ứng.
- Push, merge, deploy, migration, credential hoặc production mutation chỉ sau approval rõ ràng của anh.
