# MASTER_PLAN.md

## Completed Phases
### Phase 32: Data Management & Reset 2026 [DONE]
- Xóa thành công dữ liệu kỳ đánh giá 2026 (ID: `818f9273-2f73-49be-9463-9d82a1719797`) khỏi Database.
- Bổ sung Server Action `deleteEvaluationPeriod` để hỗ trợ xóa kỳ đánh giá từ UI.

### Phase 33: Visibility & Authorization Refinement [DONE]
- Lọc evaluations theo owner/evaluator, không mở rộng quyền theo toàn team.
- Đồng bộ React Query key và UI hooks với user context.
- Cập nhật approval flow động theo role: Employee qua SubLeader/Leader/Manager, SubLeader qua Leader/Manager, Leader qua Manager.

### Phase 34: Workflow Correction [DONE]
- Tạo shared workflow contract tại `src/lib/evaluation-workflow.ts`.
- Đồng bộ khởi tạo kỳ, submit round, helper quyền, detail UI và compare UI theo rule: Manager tự đánh giá 1 vòng; Leader tự đánh giá rồi Manager; SubLeader tự đánh giá rồi Leader rồi Manager; Employee do SubLeader, Leader, Manager đánh giá.
- Chuẩn hóa grade theo role người được đánh giá và loại bỏ giả định UI mọi evaluation đều có 3 vòng.

### Phase 35: Draft-Gated Evaluation Visibility [DONE]
- Bổ sung `EvaluationRoundStatus` + `EvaluationAccessState` để tách rõ `edit/readonly/blocked`.
- Đồng bộ quyền xem/sửa theo draft-gated workflow cho Employee/SubLeader/Leader/Manager.

### Phase 36: Vercel Deployment & Production Readiness [DONE]
- Triển khai thành công ứng dụng lên Vercel (`https://lykiv.vercel.app/`).
- Cấu hình Environment Variables và CI/CD tự động từ GitHub.

### Phase 37: Data Integrity & Stability [DONE]
- Cập nhật `src/lib/scoring.ts`: Logic tính điểm theo ngưỡng (threshold) chính xác, tránh lỗi chồng lấn biên.
- Cập nhật `src/lib/db/criteria.ts`: Chuyển `SubLeader` sang nhóm tiêu chí `leader` để áp dụng đánh giá quản lý.
- Đảm bảo tính nguyên tử (atomic) khi lưu evaluation round.

### Phase 38: Robust Error Handling & Tech Debt Cleanup [DONE]
- Chuẩn hóa xử lý lỗi DB với class `DatabaseError` tại `src/lib/errors.ts`.
- Hợp nhất logic xác định người đánh giá (Evaluator Resolver) để tránh trùng lặp code.
- Refactor các hàm DB truy vấn để ném lỗi (throw) thay vì trả về mảng rỗng, hỗ trợ hiển thị thông báo lỗi trên UI.

### Phase 39: Export & Reporting [DONE]
- Triển khai engine xuất Excel sử dụng `xlsx` (SheetJS) với 2 sheet: Tổng hợp và Chi tiết từng vòng.
- Tạo component `PeriodSummary` trực quan hóa tiến độ và phân bổ xếp loại (S/A/AB/B/C/D).
- Tích hợp quyền Manager xuất Excel, Manager/Leader xem thống kê trên Dashboard.

### Phase 40: Admin Enhancement & UI Feedback [DONE]
- Triển khai `Toast` notification và `ConfirmDialog` component đồng nhất toàn hệ thống.
- Phân quyền trang Quản lý Nhóm (chỉ Manager được sửa/xóa).
- Tính năng Import nhân viên hàng loạt từ Excel với logic rà soát dữ liệu trước khi lưu.

### Phase 41: UX Polish & Mobile Refinement [DONE]
- Tối ưu giao diện Mobile với Hamburger menu và Sidebar linh hoạt.
- Đồng bộ micro-animations và transitions.
- Cập nhật trang Hỗ trợ (Support) với đầy đủ hướng dẫn thao tác, workflow và quyền hạn.

### Phase 42: Advanced Analytics & Documentation [DONE]
- Bổ sung biểu đồ Radar (Skill Profile) và phân tích Skill Gap trên Dashboard.
- Cập nhật hướng dẫn đọc báo cáo và phân tích chuyên sâu (Skill Gap Analysis) vào trang Hỗ trợ.

### Phase 43: Performance & Security Audit [DONE]
- Rà soát và bổ sung 7 chỉ mục (Index) trên Supabase cho các bảng Evaluations, Responses, Teams.
- Kích hoạt RLS (Row Level Security) cho toàn bộ schema public và fix bảo mật function search path.
- Tối ưu hóa hiệu năng truy vấn cho Dashboard và báo cáo tổng hợp.

### Phase 45: Architecture & Performance [DONE]
- Đã gỡ bỏ thư viện Excel thừa (`exceljs`), thống nhất sử dụng `xlsx` để tối ưu bundle size.
- Đã bổ sung Page-level SEO Metadata (Title, Description) cho toàn bộ hệ thống bằng các file `layout.tsx`.
- Đã refactor trang Dashboard và Reports thành Server Components (khắc phục lỗi H2).
- Chuyển logic tổng hợp báo cáo nặng lên Server Actions (`getReportAggregation` và `getDashboardData`), khắc phục lỗi H1.
- Áp dụng lazy loading cho các biểu đồ sử dụng thư viện Recharts bằng `next/dynamic` để cải thiện hiệu năng tải trang.

### Phase 46: UX Consistency & Robustness [DONE]
- Đã thay thế toàn bộ `alert()`, `confirm()`, `prompt()` bằng `useToast` và `ConfirmDialog`.
- Loại bỏ các lệnh `window.location.reload()` và thay bằng `router.refresh()` hoặc trigger update state để giữ trải nghiệm mượt mà.
- Loại bỏ `document.getElementById` và dùng `useRef` ở component import Excel.
- Áp dụng `middleware.ts` chặn truy cập trái phép bằng cookie `auth_session` ở phía server.
- Tối ưu action xóa đợt đánh giá bằng subquery trực tiếp vào Database để tránh lỗi bộ nhớ.
- Tạo Client Component Error Boundary toàn cục (`error.tsx`) và add error handler cho `QueryCache` và `MutationCache`.
- Thực hiện client-side pagination cho danh sách nhân viên và thêm chuẩn bị API params `limit/offset` cho backend.
- Phân tách hiển thị Toast (UI) khỏi hook gọi Database.

### Phase 47: Accessibility & Final Cleanup [DONE]
- Bổ sung `role`, `aria-selected`, `aria-expanded`, `aria-controls` cho `Tabs.tsx`, `GroupNavTabs.tsx`, `Accordion.tsx`.
- Xóa unused imports (`LogOut` trong AppLayout, etc.).
- Tách hardcoded role strings + CSS classes khỏi `scoring.ts`.
- Sửa các lỗi UI lặt vặt: Fallback color `PeriodSummary`, `useMemo` cho `CriteriaTab`, brittle string parsing `GroupNavTabs`.
- Cập nhật `KNOWN_BUGS.md`, `DECISIONS_LOG.md`.
### Phase 49: App Optimization [DONE]
- Loại bỏ thư viện `sonner` và thống nhất toàn bộ hệ thống sử dụng custom `useToast`.
- Bổ sung 7 trang `loading.tsx` sử dụng Server Component và Tailwind skeleton (animate-pulse) để giải quyết dứt điểm hiện tượng flicker/màn hình trắng khi điều hướng.
- Bổ sung `error.tsx` (Client Components) cho các routes còn thiếu: `/reports`, `/support`, `/login`.
- Loại trừ các thư mục công cụ AI (`.tmp`, `.understand-anything`, v.v.) khỏi cấu hình `tsconfig.json` và `eslint.config.mjs` để tăng tốc độ linting/build.

### Phase 50: Standalone Printable Guide Refinement [DONE]
- Tinh chỉnh CSS phân trang (`break-inside: avoid`, `break-after: avoid`, `break-before: page`) cho toàn bộ file `public/print-guide.html`.
- Đảm bảo bố cục hiển thị hoàn hảo và không bị ngắt trang giữa chừng các khối thông tin quan trọng khi in khổ A4.
- Đồng bộ giao diện hỗ trợ xem tốt cả trên web (`/support`) lẫn khi in cứng giấy.

### Phase 51: UAT Fixes — Data Backfill & Business Rules 2026 (P1T01→P1T17) [DONE]
- **Backfill kỳ 2026**: 15 NV thêm sau khi tạo kỳ không có evaluation → backfill đủ 22/22 evaluations + 22/22 round 1 (snapshot `.tmp/backfill-snapshot-before.json`).
- **Auto-create evaluation**: `ensureEvaluationsForUsers` trong `src/lib/db/evaluations.ts` — thêm NV mới vào kỳ active tự tạo evaluation + round 1; wire vào `useUpsertUser`/`useBatchUpsertUsers`.
- **Rule 1 Leader + 1 SubLeader/nhóm**: chặn thăng khi slot đã có người (`assertLeadershipSlot`); khi đổi chức vụ tự đồng bộ `teams.leader_id` + `employee_role` + evaluator round 1 (`syncEvaluationAfterUserChange`); toast lỗi hiển thị message rõ ràng.
- **Sort Nhân sự**: mặc định Nhóm → Chức vụ (Leader > SubLeader > Employee) → Tên.
- **Cache sync**: invalidate `['teams']` khi đổi role → trang /teams cập nhật ngay không cần F5.
- **Toast**: bỏ `MutationCache.onError` global (trùng onError local → 2 toast); thời gian hiển thị 10s.
- **Thông báo đánh giá**: NO_DRAFT hiển thị tên NV thật + vòng (X/Y); xem cấp trên → "Bạn không thể xem đánh giá của cấp trên".
- **Guard tiêu chuẩn**: chỉ Manager thêm/sửa/xóa tiêu chuẩn + nhóm + mức mặc định (trước đây mọi user thấy nút).
- **Fix appliesTo**: mapping "Chỉ Quản Lý" hiển thị sai thành "Cả 2" (điều kiện `length===1` sai vì leader map 3 roles); đổi nhãn Áp dụng: Quản Lý và Nhân Viên / Chỉ Quản Lý / Chỉ Nhân Viên; label "Chỉ QL" (amber) + "Chỉ NV" (blue) font 12px.
- **Hướng dẫn**: trang Hỗ trợ + bản in A4 cập nhật rule mới, Thêm/Sửa/Xóa nhân viên/nhóm/tiêu chuẩn, sửa tên nút đúng thực tế (Tạo kỳ mới/Dashboard, Nhập từ Excel, Xuất file).
- Đã push GitHub (`1841db6..487cd88 main -> main`).

---

### Phase 52: Trang Cài đặt (Settings Hub) — Phase A [DONE] 🟢
- **Khung trang `/settings`** (trước đây 404 dù Sidebar/BottomNav đã có link): `layout.tsx` metadata + `page.tsx` client — guard Manager (Employee thấy màn chặn "Chỉ Quản lý mới có quyền truy cập"), header + `Tabs` 3 tab active: Kỳ đánh giá / Nhóm & Quyền / Điều hướng nhanh (tab Tài khoản → Phase B, Thang điểm → Phase C).
- **Tab Kỳ đánh giá** (`components/settings/PeriodsTab.tsx`): nhúng `PeriodActions` nguyên khối (tạo/đóng/xóa/xuất Excel) + bảng danh sách kỳ: năm, badge status (Đang mở/Đã đóng), tiến độ `approved/total • %` (1 query `useEvaluations(undefined, user)` + useMemo), nút Chọn kỳ (`setCurrentPeriod` + toast) / badge Đang chọn.
- **Tab Nhóm & Quyền** (`components/settings/TeamsRolesTab.tsx`, read-only): card từng nhóm — Leader (badge indigo), SubLeader(s) (badge sky), cảnh báo amber khi thiếu chức vụ, alert rose khi có nhân viên chưa gán nhóm.
- **Tab Điều hướng nhanh**: 3 card link → /employees, /teams, /criteria.
- **Dashboard BỎ PeriodActions** (quyết định 13-08: tạo/đóng/xóa/xuất kỳ chuyển hẳn sang Cài đặt) — header giữ title + subtitle.
- Verify: lint 0 errors + build PASS; browser 6 điểm PASS (Manager: 3 tab / Tab Kỳ bảng 2026 Đang mở 0/22 / Tab Nhóm 3 nhóm / Tab Điều hướng / Dashboard sạch nút; Employee: màn chặn).
- Commits: `61977ab..f1fcd84` (5 commits). Push GitHub sau Phase A.

### Phase 52 (tiếp): Trang Cài đặt — Phase B + Phase C [DONE] ✅ (2026-08-13)
- **Phase B — Tab Tài khoản** (P52T05, commit `149d465`): `bcryptjs`; `changePassword` (chưa có hash → đặt mới; đã có → verify bcrypt; new ≥ 6 ký tự); `AccountTab` (thông tin cá nhân + form đặt/đổi mật khẩu); tab "Tài khoản" active. KHÔNG đụng login (fake login giữ nguyên — 0 commit chạm login/AuthContext/middleware).
- **Phase C — Tab Thang điểm** (P52T06 + fix `98e8673`): bảng `grade_bands` + seed; `lib/grade-bands.ts` (cache sync + fallback hardcode); `saveGradeBands` + `validateGradeBands` (chống chồng lấn `next.max >= current.min` — bug chiều so sánh phát hiện qua test tsx → fix + retest 12/12 PASS); `GradeBandsTab` 2 cột; `scoring.ts` đọc cache; /criteria đồng bộ. Fix sau cùng: handleSave thêm catch (lỗi server action không bị nuốt im lặng).
- **Migration đã chạy thành công trên Supabase** (Management API, project `kiv`/`cliiqqthppxuzirabzla`, Postgres 17.6): `users.password_hash` (text) + bảng `grade_bands` 12 dòng seed ✓.
- **Verify end-to-end browser PASS**: Phase B — đặt mật khẩu lần đầu ✓, sai mật khẩu cũ bị chặn ("Mật khẩu cũ không đúng") ✓, đổi đúng → thành công ✓, DB hash `$2b$10$...` (bcrypt 60 ký tự) ✓. Phase C — hiển thị từ DB ✓, lưu thật → DB cập nhật (test D 69→65→69 restore sạch) ✓, UI chặn chồng lấn (A min 100 → lỗi) ✓, /criteria đồng bộ ✓.
- **MCP Supabase đã cấu hình cho profile mika** (token account ngothaoly@gmail.com — CHỈ dùng cho project kurabe): `hermes -p mika mcp test supabase` PASS, tools `mcp_supabase_*` sẵn sàng sau `/reload-mcp`.
- **Đã push GitHub** (`149d465`, `6b744b7`, `964437d`, `98e8673`). Phase 44 (Security) giữ DEFERRED — fake login giữ tới khi anh test xong ổn thỏa.

### Phase 53: Reset mật khẩu nhân viên (Manager) [DONE] ✅ (2026-08-13)
- `src/actions/account.ts` thêm `resetPassword(userId)` — set `users.password_hash = null` (password về TRỐNG; nhân viên tự đặt lại từ Cài đặt → Tài khoản).
- Trang /employees: nút "Đặt lại mật khẩu" (icon Key, chỉ Manager) trong cột hành động + ConfirmDialog variant warning + toast.
- Verify: lint/build PASS; browser — Manager thấy nút mọi dòng; reset NV 7346 (Chống Kim Bình) → toast success + DB xác nhận `has_hash=false`; tài khoản 158 không bị ảnh hưởng.
- Commit: `a4f6...` (xem git log). Đã push GitHub.

---

## Audit Summary (2026-08-10)

> Full report: `full_audit_report.md` (Antigravity session 84bcd817)

| Severity | Count |
|----------|-------|
| 🔴 CRITICAL | 3 (Security: broken auth, missing server-side authz, client-side data filtering) |
| 🟠 HIGH | 4 (All pages `'use client'`, Reports client-side aggregation, no SEO metadata, duplicate Excel lib) |
| 🟡 MEDIUM | 9 (Native dialogs, Error Boundaries, ARIA, route guard flash, un-paginated queries...) |
| 🔵 LOW | 0 (All low severity issues resolved in Phase 47) |
| 📄 Stale Docs | 0 (All stale docs resolved in Phase 47) |

---

## Next Phases (Proposed — Post-Audit)

### Phase 52: Trang Cài đặt (Settings Hub) 🟢 (Phase A đã DONE 2026-08-13 — xem Completed Phases; còn Phase B + C bên dưới)
> **Vấn đề**: ~~Link "Cài đặt" đã có ở Sidebar + BottomNav nhưng trang `/settings` chưa tồn tại → 404.~~ (Đã giải quyết ở Phase A)
>
> **Đã chốt với user (2026-08-12)**: Tab Tài khoản LÀM nhưng tạm thời không dùng (giữ fake login); Tab Thang điểm LÀM LUÔN.
>
> **Quyết định 2026-08-13**: Dashboard BỎ PeriodActions — tạo/đóng/xóa/xuất kỳ chuyển hẳn sang Cài đặt (đã thực hiện ở Phase A).

- **5 tab**: ① Kỳ đánh giá ② Tài khoản ③ Thang điểm xếp loại ④ Nhóm & Quyền ⑤ Điều hướng nhanh. Chỉ Manager truy cập (guard `isManager`).

- **Phase A — Khung + Tab Kỳ + Tab Nhóm + Tab Điều hướng** (rủi ro thấp):
  - Tạo `src/app/settings/page.tsx` + `layout.tsx`; guard Manager → màn chặn.
  - Tab Kỳ: nhúng `PeriodActions` (tạo/đóng/xóa/xuất Excel) + bảng danh sách kỳ (năm, status, tiến độ). ⚠️ Cần chốt: Dashboard giữ hay bỏ PeriodActions.
  - Tab Nhóm & Quyền: hiện trạng Leader/SubLeader từng nhóm + cảnh báo thiếu chức vụ (read-only).
  - Tab Điều hướng: card link → /employees, /teams, /criteria.
  - Verify: build/lint + browser (Manager thấy 5 tab, Employee bị chặn).

- **Phase B — Tab Tài khoản** (làm nhưng KHÔNG bật — fake login giữ nguyên):
  - Migration: thêm cột `password_hash` (text, nullable) vào `users`.
  - Server action `changePassword` (hash bcrypt, verify mật khẩu cũ).
  - UI: thông tin cá nhân (mã NV, tên, chức vụ, nhóm) + form đổi mật khẩu (cũ → mới → xác nhận, ≥6 ký tự).
  - KHÔNG đụng login/middleware — chờ Phase 44 mở.

- **Phase C — Tab Thang điểm xếp loại** (đụng scoring — làm cuối, test kỹ):
  - Migration: bảng `grade_bands` (role_group: leader|staff, grade, min_score, max_score, sort_order) + seed từ giá trị hardcode hiện tại (Leader: S≥170…D≤69; Staff: S≥155…D≤59).
  - Refactor `src/lib/scoring.ts` `getGradeFromScore` đọc từ DB (fallback hardcode) — ⚠️ hàm đang sync, cần thiết kế cache/provider cẩn thận; đồng bộ trang criteria hiển thị.
  - UI: 2 cột Quản lý/Nhân viên, chỉnh min/max từng grade, validate không chồng lấn, save-all.
  - Test snapshot trước/sau đổi dải điểm → tính lại grade → verify.

- **Bàn giao**: mỗi phase commit riêng (`[#SETTINGS-PxA]`), push GitHub sau Phase A, cập nhật hướng dẫn nếu cần.

### Phase 44: Security Hardening 🔴 (DEFERRED)
> **Priority**: ASAP — App đang public trên Vercel, 3 lỗ hổng CRITICAL.

- **[C1] Auth Fix**: Thêm password/PIN cho Manager login (hotfix). Dài hạn: migrate Supabase Auth.
  - ⚠️ **Nguyên tắc khôi phục (chốt 2026-08-13)**: `password_hash = NULL` = "chưa đặt mật khẩu" → **vẫn cho đăng nhập bằng mã NV** (lối vào dự phòng). Manager quên mật khẩu → reset về NULL (qua Mika/MCP Supabase hoặc Supabase SQL Editor: `UPDATE users SET password_hash = NULL WHERE employee_code = '...'`) → login mã NV → đặt mật khẩu mới tại Cài đặt → Tài khoản. KHÔNG bao giờ để xảy ra trạng thái "quên là mất".
- **[C2] Server Action Authorization**: Tạo `requireAuth()` wrapper — mỗi Server Action verify session trước khi thực thi, không trust `managerId`/`actorId` từ client.
- **[C3] RLS Verification**: Audit toàn bộ RLS policies trên Supabase Dashboard. Tạo test case verify không query được data ngoài quyền.
- **[Doc]** Cập nhật `DECISIONS_LOG.md` #7 (RLS đã bật ở Phase 43).
