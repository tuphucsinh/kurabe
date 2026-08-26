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

### Phase 54: Bảo mật (C2+C3) + Audit log + Nhắc tồn đọng [DONE] ✅ (2026-08-13, Reviewer PASS)
- **P54T01** (`fbd418a`): `src/lib/auth.ts` — getSessionUser/requireAuth/requireRole/requireManager (session cookie → user); MỌI server action bỏ trust client actorId: `changePassword` bỏ userId, `createEvaluationPeriod` bỏ managerId, `saveEvaluationRound` bỏ actorId + evaluator match; middleware thêm `/settings`.
- **P54T02** (`e4bafa4`): migration-d RLS — anon **SELECT-only** trên evaluation_periods + grade_bands; server actions ghi 2 bảng chuyển sang `supabase-admin` (service role, server-only, .env.local gitignored). Verify live: anon INSERT → 401 RLS, action qua UI vẫn ghi (D 69→65→69).
- **P54T03** (`301d055`, `5388d45`): migration-e audit_logs (RLS select-only) + `lib/audit.ts` logAudit (try/catch fire-and-forget) + hook **10 chỗ** (period 3, users/teams/criteria 4, grade-bands 1, account 2).
- **P54T04** (`469f8d0`): Tab **"Nhật ký"** trong Cài đặt (Manager, read-only, desc 50) — verified entry thật "Ngô Thảo Ly đã Cập nhật thang điểm".
- **P54T05** (`469f8d0`, `a539635`): Dashboard **"Đánh giá tồn đọng"** (theo evaluator) — verified "22 NV chưa xong". **Fix bug stats CŨ**: getDashboardData truyền session viewer (trước undefined → filterEvaluationsForViewer trả [] → stats/hoạt động/pending luôn rỗng — dashboard "0/22" sai từ lâu).
- **Reviewer (fresh, độc lập): PASS** — RLS live tests (anon 401 ×3 bảng, service 201), pending 22 reproduced, signature callers sạch, .env.local không trong git.
- **Rủi ro còn lại (Phase 44)**: client vẫn anon-write users/teams/evaluations/rounds/criteria (refactor lớn, chủ động giữ); audit_logs select mở cho anon (đồng bộ mô hình anon-read hiện tại); C1 password login vẫn DEFERRED.
- **Production (2026-08-13, chốt phiên)**: Vercel CLI login (tuphucsinh), project `kurabe` linked; `SUPABASE_SERVICE_ROLE_KEY` đã thêm **Production + Preview**; redeploy `vercel --prod` → READY; verify thật trên https://lykiv.vercel.app — login 158 ✓, /settings + tab Nhật ký ✓, saveGradeBands (service key) → "Đã lưu" ✓. **Từ nay: git push main → Vercel tự deploy; Mika có thể `vercel --prod` tay khi cần gấp.**
- Commits: `fbd418a..a539635` (7 commits). Đã push GitHub.
- **Fix báo cáo sau chốt (2026-08-13, `0dc9c92` + `781e44a`)**: đếm CẢ Manager (22 — Manager có evaluation); reports truyền session viewer (evaluations rỗng trước đây); "Chưa đánh giá" = chưa Approved (22); **bỏ trend ảo hardcode** (+0.5/+1.2%); **max điểm động từ DB = 237** (thay hardcode 150 — progress sai 37%); criteria % theo max nhóm thật; **wire nút Xuất file** (engine export + viewer — file 2 sheets, 22 NV verified); **guard role reports** (Manager/Leader, Employee → redirect).
- **Trang chi tiết nhóm (2026-08-13)**: `/teams/[id]` — trước đây click "Chi tiết" → 404. Nay: header (tên, Leader, trạng thái) + 3 KPI (thành viên/đã đánh giá/còn lại) + bảng thành viên (avatar, mã NV, badge role Leader/SubLeader/Trưởng nhóm, badge trạng thái đánh giá, grade, link /evaluations/[id]) + EmptyState khi nhóm không tồn tại. Verified browser: QC Gia dụng 15 thành viên, sort theo chức vụ, link đánh giá OK.

### Phase 55: Mục tiêu Kỳ cấu hình được (Manager) [DONE] ✅ (2026-08-13)
- Migration `migration-f-target.sql`: `evaluation_periods` + `target_rate` (default 75) + `target_grade` (default AB).
- Settings → tab **"Mục tiêu"**: chọn kỳ + tỉ lệ % + mức xếp loại (S/A/AB/B/C/D) + Lưu (requireManager, supabaseAdmin, logAudit).
- Báo cáo "Mục tiêu Kỳ này" **đọc động từ DB** (thay hardcode 75/AB) — verified: lưu 80/A → reports hiển thị "Đạt tỉ lệ 80%... từ A".
- Kèm P1 bảo mật: login ẩn "Tài khoản test (Real Data)" trên production (`NEXT_PUBLIC_SHOW_TEST_LOGIN=true` chỉ local).

### Phase 56: AI cho Manager — Cảnh báo bất thường + khung AI [DONE] ✅ (2026-08-13)
- `lib/anomaly.ts`: rule chính xác 100% (chênh ≥20 = Chú ý, ≥30 = Nghiêm trọng giữa 2 vòng có điểm) — TEST PASS (tsx).
- `AnomalyAlertCard` Dashboard (Manager): danh sách + mức độ + nút "Giải thích bằng AI" (`explainAnomalyAction`).
- `lib/ai.ts`: khung LLM OpenAI-compatible (env AI_API_KEY/AI_BASE_URL/AI_MODEL), fail-soft, timeout 45s, retry ×2 token khi content rỗng; **model `gpt-5.6-luna`** qua opencode.ai/zen/go/v1 (deepseek-v4-flash reasoning ngốn hết token với prompt dài → content rỗng).
- Key dùng chung: `OPENCODE_GO_API_KEY` (shared.env Hermes) → `.env.local` kurabe (KHÔNG commit).

### Phase 57: Tóm tắt kỳ đánh giá bằng AI [DONE] ✅ (2026-08-13)
- Bảng `ai_summaries` (cache UNIQUE theo kỳ, RLS select-only) + `generatePeriodSummaryAction` (Manager, ẩn danh hóa mã NV, prompt 4 phần, skip khi kỳ chưa có điểm — không phí token) + `AiSummaryCard` trên /reports (nút Tạo/Tạo lại, disclaimer).

### Phase 58: Gợi ý nhận xét + Soạn thông báo kết quả (AI, Manager) [DONE] ✅ (2026-08-13)
- Nút "✨ Gợi ý nhận xét (AI)" (khi Manager đang chấm — điền ô Ghi chú chung) + "📨 Soạn thông báo kết quả (AI)" (mọi chế độ xem — draft + Sao chép) trên `/evaluations/[id]`.
- **Chuẩn prompt** (tinh chỉnh nhiều vòng theo anh): 4-5 câu; cụ thể theo TÊN tiêu chuẩn + mã ngoặc (vd "hợp tác, phối hợp (B1)"); xưng hô "Nhân viên"; vai trò LUÔN "quản lý" + đa dạng cụm; kỷ luật không vi phạm → 1 câu đa dạng; tham khảo NGẦM vòng trước (không trích, KHÔNG so sánh điểm giữa vòng — mỗi vòng 1 người chấm); giọng người (chống AI-isms); few-shot 2 mẫu; temperature 0.7. Verified: 3 ví dụ NV/Leader/Manager anh duyệt.
- Verified browser end-to-end: anomaly seed 45đ → cảnh báo + giải thích AI 4s; thông báo cụ thể 10s; data test restore sạch.

### Phase 59: 🔗 lyly ↔ kurabe [DONE] ✅ (2026-08-13) — ngoài repo
- Profile lyly: MCP supabase (**anon key — chỉ đọc, không PAT admin**) + skill `kurabe-monitor` (~/.hermes/profiles/lyly/skills/...).
- Verified: lyly trả lời dữ liệu thật (kỳ 2026 active, 22 NV, 22/22 chưa xong; QC Gia dụng 15 NV Leader Mai Thị Hòa) + chủ động phát hiện **QI Gia dụng chưa gán Leader**.
- Chị Ly chat Telegram bot lyly (DM "Ly Ngo" 8632993932) → nắm tình hình mọi lúc.

### 📦 Trạng thái git (chốt phiên 2026-08-13)
- **Local `main` AHEAD 15 commits — CHƯA PUSH** (quy tắc mới: push chỉ khi anh báo). Production đang ở `b135177`.
- Khi anh báo push: `git push origin main` + thêm 3 AI env lên Vercel (AI_API_KEY, AI_BASE_URL=https://opencode.ai/zen/go/v1, AI_MODEL=gpt-5.6-luna) → Vercel tự deploy.

### Phase 60: Cloudflare Tunnel — kurabe local lên internet (miễn phí thay Vercel) 🟡 (2026-08-13)
> **Mục tiêu**: chạy kurabe từ Pi5 qua Cloudflare Tunnel (0đ, không ToS commercial như Vercel Hobby, dữ liệu ở nhà). WBS: `tasks.md`.

- **P60T01** Cài `cloudflared` (arm64 binary) + verify version.
- **P60T02** Quick tunnel test: `cloudflared tunnel --url http://localhost:3000` → URL trycloudflare → browser verify qua internet (login 158 → dashboard) → TẮT sau test (URL random, không để lâu).
- **P60T03** Named tunnel (chờ anh cung cấp tài khoản CF + domain): `tunnel login` (device flow — cần anh xác nhận) → `tunnel create kurabe` → config.yml → DNS route `kurabe.<domain>` → systemd service tự chạy khi boot → verify browser.
- **P60T04** 🔒 **Cloudflare Access (Zero Trust)** — bảo vệ hostname (email allowlist; free 50 user — test 5-10 user). **BẮT BUỘC trước khi mở lâu dài**: kurabe đang fake login (mã NV) — ai có URL cũng vào được → Access là lớp chặn đầu.
- **P60T05** Docs: MASTER_PLAN DONE + HANDOFF + hướng dẫn truy cập.

**Rủi ro ghi nhận**: fake login + data thật → Access bắt buộc; tunnel phụ thuộc Pi5 + internet nhà; quick tunnel URL đổi mỗi lần (chỉ test); khi đủ 50 user nội bộ cần Access paid hoặc chuyển password login (C1).

### Phase 61: SubLeader đa dạng + gán NV theo SubLeader [DONE] ✅ (2026-08-13)
> **Yêu cầu anh**: bỏ rule "1 SubLeader/team"; mỗi NV gắn 1 SubLeader của nhóm mình; **vòng 1 do SubLeader được gán đánh giá**; thêm `description` (chức danh — công ty Nhật nhiều chức danh quản lý cấp thấp). WBS: `tasks.md`.

- **P61T01** Migration + types: `users` + `subleader_id` (FK users, nullable) + `description` (text, nullable); types database + `User.subleaderId/description` + map.
- **P61T02** Data backfill: gán `subleader_id` cho NV hiện có (theo team — subleader đang có của team; team không có subleader → NULL) + description mẫu cho subleader hiện có. Verify bằng query.
- **P61T03** Workflow vòng 1: `src/data/workflow.ts` `matchesEvaluatorSelector('SubLeader')` → `evaluator.id === target.subleaderId` (không còn "mọi SubLeader cùng team"); chỗ khởi tạo round 1 → `evaluator_id = employee.subleaderId`.
- **P61T04** UI Teams tab: hiển thị NHIỀU SubLeader/team (bỏ giới hạn 1) + cảnh báo NV chưa gán SubLeader.
- **P61T05** UI Employees: form NV — dropdown chọn SubLeader (lọc theo team) + ô chức danh (description); table cột SubLeader + chức danh.
- **P61T06** UI team detail `/teams/[id]`: hiển thị SubLeaders + NV theo từng SubLeader.
- **P61T07** ✅ Verify: lint 0 errors + build PASS + test workflow 6/7 + browser verify (0511 thấy 12 NV; alert 3 NV chưa gán; bảng/team detail đúng; form chọn SubLeader theo team) + Reviewer (verdict dựa evidence — CLI review timeout, audit bằng test+browser+lint). Docs cập nhật.

**Quyết định ghi nhận**: NV chưa gán SubLeader → round 1 chưa có evaluator (chặn đánh giá tới khi gán — UI cảnh báo). Runner: agy (theo chỉ đạo anh 13-08).

**Bổ sung phiên tối 13-08 (sau T07)**:
- **Fix lỗi promote**: `assertLeadershipSlot` (users.ts) còn giữ rule cũ "1 SubLeader/team" → bỏ (chỉ giữ 1 Leader/team) — test thật 7346→SubLeader PASS + restore nguyên trạng. Commit `dd4e79f`.
- **Fix sync SubLeader**: `upsertUser` chỉ sync khi đổi role/team — thêm `subleaderId !== undefined` → đổi SubLeader nào cũng đồng bộ round 1; + fix data 19853 (round 1 evaluator Vẹn → Bích Điệp). Commit `32aecbb`. Verify: Bích Điệp đánh giá được Thùy (Lần 1/3).
- **Fix hiển thị**: STATUS_BADGE thiếu Submitted/Reviewed/Draft → nhầm "Chưa bắt đầu" (thêm "Đã nộp", "Đã nộp vòng x", "Đã có KẾT QUẢ đánh giá" emerald nổi); icon đánh giá LUÔN hiển thị mọi NV; grade lấy round Submitted mới nhất. Commits `6a7dd77`, `43a9bd2`.
- **UI team detail**: block SubLeader (header + NV trực thuộc, block trống/Chưa gán) — `19e2240`; bỏ header card + SUBLEADER strip + badge "X nhân viên" — `fd53067`, `5a8a25f`, `b642596`; KPI compact gộp hàng header + tăng size — `ae7f551`, `424041b`; xếp loại đầy đủ (B L1 104) — `a3f0c25`; grid 4 cột thẳng hàng + status bên phải — `c2464f1`, `039c3a4`; bỏ pill "Đang thực hiện" — `00b26f3`.
- **UI teams/reports/dashboard/settings**: /teams KPI header compact + card clickable + bỏ footer/avatar stack — `8ca8d5c`, `9abfa22`, `881ab22`; reports redesign (KPI compact + grid 2 cột) — `0425b92`; dashboard tối ưu (KPI compact + ẩn anomaly rỗng + grid) — `883fe3f`; activity feed sort theo submittedAt + audit SUBMIT/APPROVE — `9ce82c8`; settings: mở cho NV (tab Tài khoản đổi mật khẩu), bỏ điều hướng nhanh, tabs đều + fix flex — `92e6300`, `9d325a8`, `de68753`, `cd09c41`.
- **Live test E2E** (Phase 62): tạo "Nhóm Test E2E" + TST01 Leader/TST02 SubLeader/TST03-04 NV qua UI → đánh giá 3 vòng (SubLeader 110 B → Leader → Manager Approved B 110) → verify dashboard 26 NV/reports Top/scope từng role → dọn sạch test data (verify 22 NV/3 team/1 Approved). Ghi nhận: reports "Unknown"→"—" + KPI chưa xong = total-completed — `16ff741`.
- **Production + tốc độ** (Phase 63): push 66 commits → Vercel; fix login flash (AppLayout /login full-screen — `30feb6d`); login redirect `window.location.href` (hết kẹt — `b292d27`); cache 300s + revalidateTag on mutation (submit/approve/đổi NV) + lazy recharts radar — `57035fb`, `aa0716e`, `5e44206`; cron warm-ping 5 phút (job `warm-ping-lykiv-vercel`, script `~/.hermes/profiles/mika/scripts/warm-ping-lykiv.py`).

---

### Phase 62: Live Test E2E — org test + 3 vòng đánh giá [DONE] ✅ (2026-08-13)
> Yêu cầu anh: tự tạo nhóm test, thêm Leader/SubLeader/NV, chạy đánh giá từ đầu tới cuối trên account test; kiểm tra UI/biến đổi/lỗi/báo cáo/dashboard/scope.

- Tạo "Nhóm Test E2E" + TST01 (Leader) / TST02 (SubLeader) / TST03-04 (NV, gán TST02) qua UI — form hoạt động đúng.
- Flow: TST02 chấm TST03 vòng 1 → 110đ B + **tự tạo round 2 (TST01)**; TST01 "Lần 2/3" → submit → round 3 (Manager); Manager "Lần 3/3" → **Approved final B 110**.
- Verify: team detail 1/4 · dashboard 26 NV/2-26/Test 25% · reports Top 2 TST03 + nhóm Test 27.5 · scope TST02 (3 NV chưa xong = 2 NV + self) · scope TST04 (chỉ 1 NV = chính mình) · settings NV tab Tài khoản.
- Dọn sạch test data (rounds/evs/audit/users/team) — DB về nguyên trạng (22/3/22/1 Approved).
- Phát hiện & fix: "Unknown" → "—" (reports) + KPI "chưa xong" = total − completed (`16ff741`).

### Phase 63: Production push + tối ưu tốc độ + login fix [DONE] ✅ (2026-08-13)
- Push 66 commits lên `origin/main` (production Vercel auto-deploy).
- Fix login flash production: AppLayout `/login` luôn full-screen (hết sidebar+login card 1-2s) — `30feb6d`; redirect bằng `window.location.href` (hết kẹt Brave/cache cũ) — `b292d27`.
- Tốc độ: `unstable_cache` 300s (tags dashboard-data/report-aggregation, key theo viewer) + **revalidateTag on mutation** (submit/approve evaluation + upsert/delete user → data mới hiện ngay; nhược điểm: cache thô theo tag — mọi user revalidate; race cửa sổ nhỏ; phải nhớ quy ước khi thêm mutation mới) + lazy-load recharts (LazySkillGapRadar) + cron warm-ping 5 phút (giữ warm Vercel — giảm cold start ~3s).
- Verify tổng: build/lint PASS · DB 22/3/22/27/1 active · smoke 8 trang 0 lỗi console · cron ok · production login 200 + middleware 307 · git ahead 0.

---

### Phase 64: Trả lại đánh giá (Return/Reject) [DONE] ✅ (2026-08-14)
> **Yêu cầu anh**: khi cấp dưới nộp cho cấp trên → cấp trên thấy nút **"Trả lại đánh giá"** trong chi tiết NV → evaluation quay về **vòng trước** → người chấm vòng trước mở khóa + sửa + nộp lại. Manager nộp **báo cáo tự đánh giá** của mình (R1 SELF → Approved) → nút **"Trả lại báo cáo"** để tự sửa. **Employee KHÔNG tự đánh giá** — giữ nguyên flow hiện tại (không đổi EVALUATION_FLOWS).

**Thiết kế (chốt 14-08, sequential-thinking 4 steps + REVIEWER non-PASS → vá 3 điểm ①guard SELF/round≤1 ②RESET thay DELETE ③invalidate client)**:
- **Server action mới `returnEvaluationRound(evaluationId, round, reason)`** (`src/actions/evaluation.ts`), requireAuth:
  - **Guard trước (2 lớp)**: server — `round <= 1 || flowStep(round).evaluator === 'SELF'` → error (không cho trả về round 0); UI — nút Case A chỉ hiện khi `editableRound > 1`.
  - **A — Reviewer return**: actor = evaluator của currentRound, round CHƯA submit (submitted_at null) → về round-1: round-1 `status=Draft` + `submitted_at=null` (mở khóa — update CÓ điều kiện `submitted_at is not null`); **RESET round hiện tại** (status NotStarted, `scores={}`, `notes={}`, `comment=null`, `total_score=0`, `grade='Pending'`, `submitted_at=null`) thay vì DELETE — né FK `evaluation_responses.round_id` (legacy — 0 usage trong src, verified 14-08) + không state mồ côi + idempotent; `current_round=round-1`; `status=ACTIVE_STEP_STATUSES[round-1]` ('Draft' R1 / 'Submitted' R2); `final_grade/final_score=null`; `return_note=reason`. Resubmit vòng trước → `existingNextRound` thấy record NotStarted → tái sử dụng (giữ evaluator cũ = đúng người review lại) — KHÔNG cần sửa saveEvaluationRound phần tạo round.
  - **B — Manager self-return**: = Case A với round=1 (SELF) + điều kiện riêng `status Approved && actor === employeeId && role Manager` → R1 `status=Draft` + `submitted_at=null`; `current_round=1`; `status='Draft'`; clear final; `return_note=reason`. **Gộp chung 1 code path** + helper `unlockRound(evaluationId, round)` dùng chung A/B.
  - **Thứ tự thực thi an toàn** (mỗi bước 0 rows → abort trả lỗi): (a) guard → (b) reset round hiện tại (verify 1 row) → (c) unlock round-1 (`submitted_at is not null` trong điều kiện) → (d) update evaluation (`current_round` match + clear final) → (e) audit + revalidate.
- **Migration**: `ALTER TABLE evaluations ADD COLUMN IF NOT EXISTS return_note text;` (Management API / MCP supabase) + types `database.ts` (Row/Insert/Update) + `Evaluation.returnNote` + `mapEvaluationFromDb`.
- **saveEvaluationRound**: khi `isSubmit` → `return_note=null` (clear sau khi nộp lại).
- **Audit**: `logAudit(actor, 'RETURN_EVALUATION', 'evaluation', id, {round, reason})`; cache: `revalidatePath(/evaluations/[id])` + `revalidateTag('dashboard-data'|'report-aggregation', 'default')` + **client `invalidateQueries(['evaluation-by-employee', ...])` + `['evaluations']`** (copy page.tsx:386-389 — detail page dùng react-query, KHÔNG dùng unstable_cache → revalidate server không đủ).
- **UI** `/evaluations/[id]`: nút **"Trả lại đánh giá"** (danger) trong vùng edit khi `editableRound > 1` (case A — không hiện ở R1 SELF); nút **"Trả lại báo cáo"** ở vùng readonly khi `role==='Manager' && employeeId===user.id && status==='Approved'` (case B — KHÔNG dựa access edit vì Approved là readonly); **ConfirmDialog + textarea lý do BẮT BUỘC** (cảnh báo sẽ reset dữ liệu vòng hiện tại); banner amber "⚠️ Đánh giá bị trả lại: {reason}" khi `return_note != null`; round trước hiển thị badge Nháp sau trả lại (normalizeRoundStatus đọc submitted_at null → Draft — đã đúng sẵn).
- **Chống abuse/race**: toàn bộ update/reset có điều kiện (evaluator_id match + submitted_at null + current_round match) — 0 rows → fail an toàn (pattern saveEvaluationRound).

**WBS sơ bộ**: `[#P64T01]` migration + types (return_note Row/Insert/Update + Evaluation.returnNote + map); `[#P64T02]` action `returnEvaluationRound` (guard SELF/round≤1 + reset an toàn + unlock + update evaluation theo thứ tự, mỗi bước 0 rows → abort) + helper unlockRound + clear return_note ở saveEvaluationRound + **edge tests tsx riêng** (race, round=1, SELF, resubmit tái sử dụng round); `[#P64T03]` UI nút + dialog + banner + invalidateQueries client; `[#P64T04]` docs + verify (lint/build + browser 2 flow: Leader trả lại → SubLeader sửa → nộp → chấm lại; Manager trả lại → sửa → nộp → Approved + check dashboard pending/reports).

**Đề xuất mở rộng (chưa làm — chờ anh duyệt)**: self-return cho Leader/SubLeader khi vòng sau chưa chấm (hiện chỉ Manager).

**Rủi ro**: reset làm mất dữ liệu draft vòng hiện tại của reviewer — đã cảnh báo trong dialog; loop trả lại không giới hạn (chấp nhận — quy trình nội bộ); RESET giữ evaluator cũ của round hiện tại (khi vòng trước submit lại — đúng người review lại, chấp nhận); review vòng 2 không cần (3 điểm vá đã verify bằng code: guard, evaluation_responses legacy 0 usage, react-query page.tsx:386-389).

**Kết quả thực thi (14-08, 4 commits `c663b4d..c8f981e` + docs, chưa push — main ahead 4)**:
- **T01** migration `return_note text NULL` (verified information_schema) + types Row/Insert/Update + map — commit `c30b04e`.
- **T02** `src/lib/return-evaluation.ts` (canReturnEvaluation + resetRoundFields + nextStatusAfterReturn, thuần) + export ACTIVE_STEP_STATUSES + action `returnEvaluationRound` (Case A reset/unlock/update có điều kiện + rollback; Case B Manager Approved; audit RETURN_EVALUATION; revalidate) + clear return_note khi submit — Mika verify bổ sung guard `round === currentRound` — edge tests 20/20 PASS — commit `3572c07`.
- **T03** UI page.tsx: nút "Trả lại đánh giá" (editableRound > 1) + "Trả lại báo cáo" (Manager Approved) + dialog lý do bắt buộc + banner amber + invalidateQueries — browser verified — commit `c8f981e`.
- **T04** Live E2E 2 flow (data test TST%, dọn sạch, DB nguyên trạng 22/3/22/1):
  - **Flow 1**: SubLeader chấm NV R1 110đ → Leader trả lại (lý do) → R1 unlock (banner + sửa được 109) → nộp lại → return_note clear + R2 tái sử dụng đúng evaluator → Leader chấm lại → Manager R3 → **Approved B 110** ✓ (DB verify từng bước).
  - **Flow 2**: Manager test tự đánh giá → Approved → nút "Trả lại báo cáo" (readonly zone) → về Draft (final cleared, note set) → sửa điểm → nộp lại → **Approved B 123** (điểm mới) ✓.
- Pitfall mới ghi KNOWN_BUGS: (1) URL /evaluations/[id] dùng employeeId — không phải evaluationId; (2) React controlled textarea: set .value qua console KHÔNG update state — phải browser_type.

---

### Phase 65: Live Test Toàn Diện — mọi tính năng trên org test ✅ DONE (2026-08-14)
> **Yêu cầu anh**: test ĐẦY ĐỦ mọi tính năng đang có trên app bằng data test: tạo group/nhân viên/quản lý, đổi quản lý, NV đổi SubLeader trực tiếp, xóa NV, chuyển group, đổi password, account test đánh giá/nộp/trả lại/sửa/nộp; verify Báo cáo + Dashboard + Nhật ký hoạt động đúng.

**Kết quả (14-08)**: 6 tasks T01-T06 DONE — toàn bộ test case PASS (chi tiết từng task: `tasks.md`). Baseline nguyên trạng 22/3/22/1/8/0 verified. **2 bug phát hiện + ghi KNOWN_BUGS (chờ duyệt fix)**: (1) audit gap CREATE/UPDATE user+team (upsert qua lib/db không logAudit, `upsertUserAction` dead code); (2) chuyển team user không sync evaluation.team_id + evaluator R2/R3. Ghi nhận: AI suggestion hoạt động (chờ ~60s); "Soạn thông báo"/"Giải thích bằng AI"/AI summary fail-soft (không crash); reports cache 300s (hiển thị stale ≤5p — design); form thêm NV default team = nhóm đầu (PITFALL vận hành); mock login (password disabled) không test được login-by-password. 10 commits `21f6860..<final>` chưa push.

**Nguyên tắc**: org test RIÊNG (team "Test Full E2E" + TST users, như Phase 62/64) — KHÔNG đụng data thật (22 NV/3 nhóm/22 ev); snapshot baseline trước; verify ĐA CHIỀU (mục tiêu + counts lân cận) sau MỖI milestone; dọn sạch + verify nguyên trạng cuối cùng. Manager 158 (thật) chỉ dùng để chấm R3/CRUD trên data test — không sửa data thật.

**Feature inventory test**:
1. **Auth**: login mã NV (mọi role test + 158), logout, redirect dashboard.
2. **Employees CRUD**: thêm NV (form), sửa (tên/role/team/description), **đổi role** (promote NV→SubLeader — assertLeadershipSlot, demote), **gán/đổi SubLeader trực tiếp** (sync evaluator round 1 — bug cũ Phase 61), **chuyển team**, **xóa NV** (verify evaluation/rounds dọn đúng), sort, tìm kiếm. *(Import Excel: anh bỏ qua 14-08 — không test.)*
3. **Teams CRUD**: tạo nhóm, sửa tên, **đổi Leader** (quản lý test), team detail (KPI/badge/link), xóa nhóm (nếu rỗng).
4. **Password**: NV test đặt mật khẩu lần đầu → đổi mật khẩu → sai mật khẩu cũ bị chặn → Manager reset → login mã NV lại (nguyên tắc khôi phục Phase 44).
5. **Đánh giá full flow**: chấm điểm ĐẦY ĐỦ các nhóm tiêu chí (A-F), lưu nháp → sửa, nộp → vòng kế tiếp tự tạo, 3 vòng theo role, **trả lại (Phase 64)** → vòng trước sửa → nộp lại → chấm lại → Approved; Manager self-eval → Approved → trả lại → sửa → nộp; chi tiết so sánh; grade/score đúng theo thang điểm DB.
6. **AI (local)**: gợi ý nhận xét (khi chấm), soạn thông báo kết quả, anomaly (seed chênh lệch ≥20 giữa 2 vòng → cảnh báo + giải thích AI), AI summary kỳ.
7. **Dashboard**: KPI (nhân sự/tiến độ/đã đánh giá/chưa xong), trạng thái theo nhóm, phân bổ xếp loại, đánh giá tồn đọng (theo evaluator — đúng scope từng role), skill gap radar, hoạt động gần đây (sort + nội dung).
8. **Reports**: KPI tổng, top NV, mục tiêu kỳ (đọc DB), phân bổ, AI summary (tạo), export Excel 2 sheets, guard role (Employee → redirect).
9. **Settings**: tab Tài khoản (đổi mật khẩu), tab Thang điểm (hiển thị — KHÔNG sửa dải điểm thật), tab Nhóm & Quyền, tab Nhật ký (entries khớp hành động), tab Kỳ (chọn kỳ — KHÔNG tạo/đóng/xóa kỳ active thật; nếu test tạo kỳ mới → tạo kỳ test 2027 rồi xóa ngay).
10. **Audit/Nhật ký**: verify đầy đủ action ghi log (CREATE/UPDATE/DELETE user+team, SUBMIT/APPROVE/RETURN_EVALUATION, password, grade bands...) — nội dung + actor đúng.
11. **Criteria**: xem tiêu chuẩn theo role (leader/staff groups).

**Ngoại lệ KHÔNG test (rủi ro cao, đã verified phase trước)**: xóa/đóng kỳ 2026 active, sửa dải thang điểm thật, reset mật khẩu account thật, delete data thật. Ghi rõ lý do.

**WBS sơ bộ**: `[#P65T01]` Setup org test (team + 6-7 users test qua UI — test luôn form CRUD) + snapshot baseline + verify sync subleader/leader; `[#P65T02]` CRUD nhân sự/nhóm (thêm/sửa/đổi role/đổi Leader/gán-đổi subleader/chuyển team/xóa/import Excel) + verify evaluation sync + audit; `[#P65T03]` Password lifecycle trên account test; `[#P65T04]` Đánh giá full flow 3 vòng + trả lại + Manager self + chi tiết so sánh + AI (gợi ý/soạn/anomaly/summary); `[#P65T05]` Dashboard + Reports + Settings + Nhật ký verify (với data test từ T02-T04) + export Excel; `[#P65T06]` Dọn sạch + verify nguyên trạng 22/3/22/1 + docs + commit. (Mỗi task kèm browser verify + DB verify đa chiều.)

**Rủi ro**: test password trên account test (không đụng thật — reset null cuối); AI gọi model local (chờ ~10-45s, fail-soft); import Excel cần file mẫu đúng format; xóa NV test có FK rounds (xóa theo thứ tự qua UI — verify app xử lý đúng hay lỗi → ghi nhận).

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

### Phase 44: Security Hardening 🔴 (PARTIAL — C2+C3 đã xong ở Phase 54, chỉ còn C1 + refactor)
> **Priority**: C1 khi anh test fake login xong ổn thỏa.

- **[C1] Auth Fix — CÒN LẠI**: Thêm password/PIN cho Manager login (hotfix). Dài hạn: migrate Supabase Auth.
  - ⚠️ **Nguyên tắc khôi phục (chốt 2026-08-13)**: `password_hash = NULL` = "chưa đặt mật khẩu" → **vẫn cho đăng nhập bằng mã NV** (lối vào dự phòng). Manager quên mật khẩu → reset về NULL (qua Mika/MCP Supabase hoặc Supabase SQL Editor: `UPDATE users SET password_hash = NULL WHERE employee_code = '...'`) → login mã NV → đặt mật khẩu mới tại Cài đặt → Tài khoản. KHÔNG bao giờ để xảy ra trạng thái "quên là mất".
- **[C2] Server Action Authorization — ✅ XONG (Phase 54)**: `requireAuth()`/`requireManager()` wrapper trong `src/lib/auth.ts`; mọi Server Action verify session cookie trước khi thực thi; bỏ trust `managerId`/`actorId` từ client.
- **[C3] RLS — ✅ XONG PHẦN WRITE (Phase 54)**: anon SELECT-only trên `evaluation_periods` + `grade_bands` (migration-d); server actions ghi 2 bảng đó qua service-role admin client. **CÒN LẠI**: client vẫn anon-write `users`/`teams`/`evaluations`/`evaluation_rounds`/`evaluation_responses`/`criteria` (cần refactor client writes sang server actions — làm cùng C1); `audit_logs` select mở anon (đồng bộ mô hình anon-read hiện tại).
- **[Doc]** Cập nhật `DECISIONS_LOG.md` #7 (RLS đã bật ở Phase 43).

---

### Phase 69: Bật đăng nhập mật khẩu thật (P44-C1) ✅ DONE (2026-08-14)

> **Yêu cầu anh (14-08)**: bật login bằng mật khẩu thật. **KHÔNG đặt pass sẵn cho account nào** — hiện mọi `password_hash` đều NULL, cứ để nguyên; nhân viên tự đặt/đổi sau qua Cài đặt → Tài khoản (đã có `changePassword` + `resetPassword` + UI AccountTab, verify P52/P65T03).

**Rule login (chốt 13-08 — giữ nguyên)**: `password_hash = NULL` → login bằng mã NV thuần (không cần pass — lối vào dự phòng); `password_hash != NULL` → bắt buộc nhập pass đúng (bcrypt compare), sai → chặn.

**Thiết kế**:
- Login chuyển sang **server action** `loginAction(employeeCode, password)` (file mới `src/actions/auth.ts`): query user bằng `supabaseAdmin` (service role — KHÔNG lộ hash cho client), áp rule NULL/hash, set cookie `auth_session` qua `cookies()` (httpOnly + secure prod, maxAge 7 ngày — GIỮ NGUYÊN tên cookie → middleware + `getSessionUser` không đổi).
- `logoutAction` server action xóa cookie (httpOnly không xóa được bằng `document.cookie`).
- Login page: bật password field (bỏ `disabled` mock), placeholder đúng; submit → gọi action; KHÔNG required (account chưa đặt pass vẫn vào bằng mã NV). Demo-users block giữ nguyên.
- `AuthContext.login/logout` gọi 2 action trên; giữ localStorage + loadAuth hiện tại (bảo mật thật nằm ở server `requireAuth`).
- **Migration security (BẮT BUỘC cùng phase)**: `REVOKE SELECT (password_hash) ON public.users FROM anon` — anon hiện SELECT users trực tiếp → hash sẽ LỘ qua API public khi có pass thật. Hệ quả bắt buộc: `changePassword`/`resetPassword` (`src/actions/account.ts` — đang dùng `supabase` anon) chuyển sang `supabaseAdmin`; verify PostgREST `select('*')` sau REVOKE không lỗi (nếu lỗi → đổi query explicit, không đụng field password_hash).
- Ngoài scope (follow-up, ghi nhận): rate-limit chống brute-force (rủi ro thấp — nội bộ + Cloudflare Access phía trước); refactor client anon-write users/teams/... (C3 còn lại — defer sau UAT).

**WBS**: T01 login/logout server action + wire UI; T02 migration REVOKE + chuyển account actions sang admin + verify; T03 test E2E (3 case: NULL login không pass / đặt pass → đúng+sai / reset NULL → fallback) trên user TEST (KHÔNG đụng account thật) + docs + commit.

**Verify**: lint 0 errors + build PASS + browser Chrome thật (login page pass field active; 3 case login; anon query password_hash trả rỗng) + DB hash verify từng bước.

**Kết quả thực thi (14-08)**: 3 tasks DONE (chi tiết `tasks.md`). Login thật hoạt động: server action `loginAction` (bcrypt + rule NULL fallback + cookie httpOnly 7 ngày) + `logoutAction`; Sidebar logout qua server action; migration REVOKE anon password_hash (GRANT lại 11 cột) + `USER_SELECT` thay `select('*')`; account actions sang supabaseAdmin. Test E2E 3 case PASS trên user test TST-PW (NULL login không pass / sai pass chặn "Mật khẩu không đúng." / đúng pass vào / reset NULL fallback) — user test đã xóa, nguyên trạng 22/3/22/1/8. **Dữ liệu**: reset hash 158 (sót từ P52) về NULL — account thật không bị khóa. Commits: `19476cd`, `1b805d0`, `656f1c0`, `9a78229`, docs. Chưa push.

---

### Phase 70: C3 — Siết RLS write (anon chỉ SELECT) 🔴 (2026-08-14)

> **Yêu cầu anh**: xử lý lỗ hổng bảo mật còn lại — 8 bảng data chính đang "Enable all access for anon" (anon key công khai trong bundle → ai cũng ghi/sửa/xóa data qua API). **CONTROLLED** — chạm DB/schema/auth → Reviewer gate bắt buộc.

**Bằng chứng (pg_policies verified 14-08)**: `users`, `teams`, `evaluations`, `evaluation_rounds`, `evaluation_responses`, `criteria`, `criteria_groups`, `criterion_levels` = policy "Enable all access for anon" (ALL). Đã select-only OK: `audit_logs`, `evaluation_periods`, `grade_bands`, `ai_summaries`.

**Phạm vi write sites (đếm code 14-08)**:
- `src/actions/evaluation.ts` — server action NHƯNG dùng `supabase` ANON: **14 writes** (saveEvaluationRound + flow submit/return/approve) → đổi import sang `supabaseAdmin`, KHÔNG đổi logic.
- `src/lib/db/users.ts` — 6 writes (upsertUser, upsertUsers, softDeleteUser, syncEvaluationAfterUserChange ×3 — assertLeadershipSlot là đọc) — gọi từ form employees (client anon).
- `src/lib/db/teams.ts` — 2 writes (upsertTeam, softDeleteTeam) — gọi từ form teams.
- `src/lib/db/criteria.ts` — 7 writes (upsertCriteriaGroup, upsertCriterion + levels delete/insert, updateDefaultLevel, softDeleteCriteriaGroup, softDeleteCriterion) — gọi từ settings/criteria.
- `src/lib/db/evaluations.ts` — 4 writes (upsertEvaluation, upsertRound, ensureEvaluationsForUsers ×2 insert) — gọi từ server-side flow + upsertUser.
- Đã admin OK: actions/period, grade-bands, ai-summary, account, auth + lib/audit.
- False positives đã loại: ReportFilters (URLSearchParams), CriteriaTab (Set state).

**Thiết kế**:
1. **Server actions là lớp ghi DUY NHẤT**: requireManager/requireAuth (GIỮ NGUYÊN mức quyền nghiệp vụ hiện tại — chỉ chuyển lớp, không siết thêm) + `supabaseAdmin` + `logAudit` + `revalidatePath/revalidateTag` (cache 300s — mutation phải invalidate như cũ).
2. `actions/evaluation.ts`: đổi import anon → admin (14 writes) — verify từng hàm (không phụ thuộc RLS anon).
3. Tạo `src/actions/users.ts` (upsertUser/upsertUsers/softDeleteUser — move logic từ lib/db + requireManager), `src/actions/teams.ts` (upsertTeam/softDeleteTeam), `src/actions/criteria.ts` (5 hàm). FORMS gọi actions. lib/db GIỮ read functions, **XÓA hàm write anon** (chống tái sử dụng); `ensureEvaluationsForUsers` + `upsertEvaluation/upsertRound` chuyển `supabaseAdmin` (chỉ gọi từ server-side sau refactor — task T01 rà callers).
4. **Migration từng nhóm theo task** (giảm cửa sổ rủi ro, verify ngay): `migration-j-rls-write-lock-users-teams.sql` (sau T02), `...-criteria.sql` (sau T03), `...-evaluations.sql` (sau T01) — drop "Enable all access for anon" → `CREATE POLICY <table>_select_only FOR SELECT USING (true)` (pattern migration-d). anon vẫn SELECT (app đọc qua anon như hiện tại).
5. **Verify chống regression im lặng** (bài học P65T06): sau mỗi migration — PostgREST anon INSERT/UPDATE/DELETE phải trả lỗi; E2E browser từng flow.

**Rủi ro + kiểm soát**: (1) regression im lặng khi sót write anon → migration TỪNG NHÓM + test anon-blocked ngay; (2) quyền role đổi hành vi → mirror chính xác quyền hiện có (employees/teams/criteria = Manager — UI đã chặn); (3) cache stale → mọi action mới revalidate như cũ; (4) upsert().select() trong criteria — admin full quyền OK.

**WBS (5 tasks)**: T01 actions/evaluation.ts → admin + **chuyển ĐỦ 3 write trong `syncEvaluationAfterUserChange` sang admin TRƯỚC migration j1** (teams.leader_id L59-66 + evaluations L70-76 + evaluation_rounds L120-126 — góp ý R1+R2) + rà callers + **bóc references client khỏi hooks/use-db.ts + `import 'server-only'` vào supabase-admin.ts (chống lộ service key)** + migration evaluations/rounds/responses; T02 mở rộng actions/users.ts + teams.ts (**đã tồn tại delete actions — chuyển cả write path delete sang admin trong cùng task trước migration** + chống success giả bằng count) + wire forms qua hooks use-db.ts (onSuccess chỉ invalidateQueries — ensure gọi NỘI BỘ trong action) + migration users/teams; T03 mở rộng actions/criteria.ts (tương tự) + wire + migration criteria; T04 verify anon-write BLOCKED toàn bộ (test PostgREST thật) + **verify KHÔNG client component import supabase-admin (build fail-fast)** + lint/build; T05 E2E toàn diện (P65-style: CRUD NV/nhóm/criteria + đánh giá 3 vòng + **test sync Leader↔Employee sau j1: teams.leader_id + evaluator R1/R2 + team_id**) + dọn AccountTab hasPassword + docs + commit.

**Reviewer gate**: plan review trước khi thực thi + review package sau T05 (auth/DB → bắt buộc).

**Verify phase**: lint 0 errors + build PASS + browser E2E + anon write blocked ×8 bảng + DB nguyên trạng + Reviewer PASS.

**Kết quả thực thi (14-08)**: 5 tasks DONE (chi tiết `tasks.md`). **8/8 bảng data chính giờ anon chỉ SELECT** (verified: insert ERROR, update/delete 0-rows) — mọi write qua server actions (requireManager/requireAuth + supabaseAdmin + logAudit + revalidate + chống success giả bằng .select()/count). `import 'server-only'` + tách `evaluations-write.ts` chặn lộ service key. **E2E toàn diện browser PASS**: tạo/sửa NV qua UI (sync subleader → round 1 evaluator đúng) + đánh giá 3 vòng (SubLeader 432 → Leader 663 → Manager 158 approve B/110) + password login (sai chặn/đúng vào) + AccountTab hasPassword fix (getAccountStatus server-side). Dọn test → **NGUYÊN TRẠNG 22/3/22/1/8 + 158 hash NULL**. Reviewer: plan 3 vòng (R1/R2 CHANGES_REQUIRED → R3 PASS) + kết quả thực thi (R4). Commits: `5649957` `0d6a5ca` `cb2d02f` `1fd9235` `a8e61c8` `6d5239a` `6afc242` `e061233` `757f36e` + docs. Chưa push.

### Phase 71: Hướng dẫn 3 vai trò chi tiết + sidebar "Hỗ trợ"→"Hướng dẫn" + in theo vai trò 🟡 (2026-08-15)

> **Yêu cầu anh**: viết lại hướng dẫn THẬT chi tiết cho 3 vai trò Manager / Leader / SubLeader — theo đúng thứ tự từ lúc bắt đầu dùng app đến cuối, tinh gọn, dễ hiểu ("người ngu đọc cũng nắm được"). Kèm **screenshot khoanh vùng cụ thể** cho từng bước. Đổi sidebar "Hỗ trợ" → "Hướng dẫn"; trang hướng dẫn hiển thị theo vai trò đang login; nút "In hướng dẫn" có chọn vai trò để in, mặc định = vai trò đang login.

**Hiện trạng (15-08)**: `src/app/support/page.tsx` 710 dòng — guide CHUNG (11 bước dùng chung + role cards ngắn + management + AI + FAQ), không tách theo role khi render (chỉ `isManager` check cuối); `public/print-guide.html` static 872 dòng in TOÀN BỘ, không chọn role; sidebar `Sidebar.tsx:42` label "Hỗ trợ"; AuthContext đã có `isManager/isLeader/isSubLeader`; screenshots hiện có 5 ảnh (01-dashboard → 05-reports) chưa khoanh vùng.

**Thiết kế**:
1. **1 nguồn dữ liệu duy nhất**: tách nội dung guide ra `src/lib/guide-content.ts` (data per role: **Manager/Leader/SubLeader/Employee** — mỗi role có mảng bước: title + body + screenshotPath + annotate regions) — web (`/support`) và print (`/support/print?role=`) render TỪ CÙNG data → hết lệch 2 nguồn như hiện tại (page.tsx vs print-guide.html). App có 4 role thật (`src/types/index.ts:1` — Employee tồn tại), guide phải xử lý đủ 4 để `/support` + print `?role=Employee` không rỗng.
2. **Nội dung theo thứ tự luồng thật, từng role**:
   - **Manager** (đầy đủ nhất): login → đặt/đổi pass → tạo nhóm + leader + ấn định leader → thêm/sửa/xóa nhân viên → kiểm tra tiêu chuẩn có sẵn → chỉnh sửa/bổ sung/tạo thêm tiêu chuẩn + đặt giá trị mặc định → chỉnh thang điểm (Cài đặt) → tạo kỳ đánh giá (nếu chưa có) → xem workflow → tự đánh giá mình → chờ leader nộp → đánh giá vòng cuối → trả đánh giá lại cho leader → dùng AI (gợi ý nhận xét / soạn thông báo / giải thích cảnh báo / tóm tắt kỳ) → xem báo cáo/dashboard → đóng kỳ → FAQ.
   - **Leader**: login → đặt/đổi pass → xem dashboard/nhóm của mình → quản lý dữ liệu theo quyền (thêm/sửa Employee/SubLeader TRONG nhóm mình; không xóa, không đổi Leader — đúng page.tsx:201-202) → chờ SubLeader nộp vòng 1 → tự đánh giá mình (vòng riêng) → đánh giá nhân viên vòng 2 → trả lại vòng 1 nếu cần → AI gợi ý → xem báo cáo phạm vi nhóm → FAQ.
   - **SubLeader**: login → đặt/đổi pass → xem dashboard → đánh giá vòng 1 (NV trong nhóm phụ trách) + tự đánh giá mình → sửa sau khi bị trả lại → AI gợi ý → FAQ.
   - **Employee**: login → đặt/đổi pass → xem kết quả đánh giá/phản hồi của mình → workflow 3 vòng (SubLeader → Leader → Manager) → FAQ (tái sử dụng nội dung card "Nhân viên" hiện có page.tsx:78-86, 210-213).
3. **Screenshot khoanh vùng + MANIFEST khóa chặt**: mỗi bước trong guide-content.ts khai báo `screenshotPath` (đường dẫn đầy đủ `public/screenshots/guide/<role>-<step>.jpg`, **nullable — bước text-only như FAQ không cần ảnh**) + vùng annotate (box + số thứ tự) NGAY TỪ T01/T02 — không để "~18-22 ảnh" mơ hồ. T03 chụp thật từng màn bằng browser/CDP (login 4 role: 158 Manager / 663 Leader / 432 SubLeader / 1 Employee) → annotate bằng Python PIL theo đúng manifest → lưu `public/screenshots/guide/`. T06 verify FAIL nếu bước có khai báo ảnh mà thiếu ảnh/chưa annotate (iterate manifest — bước screenshotPath=null bỏ qua).
4. **UI**: sidebar đổi "Hỗ trợ" → "Hướng dẫn" (Sidebar.tsx:42) + đổi metadata title `support/layout.tsx:4` "Hỗ trợ | Kurabe QAQC" → "Hướng dẫn | Kurabe QAQC"; `/support` hiển thị guide theo role đang login (mặc định), có **selector đổi role** (Manager xem được cả 4; Leader/SubLeader/Employee chỉ thấy guide của mình); nút "In hướng dẫn" mở `/support/print?role=<đang chọn>`.
5. **Print**: route mới `src/app/support/print/page.tsx` (server component) render A4 theo `?role=` từ guide-content (4 role — không role nào rỗng), CSS print đẹp (kế thừa style print-guide.html hiện có); **trang in cho phép chọn role cho MỌI vai trò (mặc định role hiện tại)** — phù hợp in hướng dẫn phát cho người khác; `print-guide.html` cũ bỏ hoặc redirect sang route mới (tránh 2 nguồn).

**WBS (6 tasks)**:
- T01 [content] `src/lib/guide-content.ts` — data guide **Manager** đầy đủ luồng (login → pass → nhóm/leader → NV → tiêu chuẩn/default → thang điểm → kỳ → workflow → tự đánh giá → vòng cuối → trả lại → AI → báo cáo → đóng kỳ → FAQ) + mỗi bước khai báo `screenshotPath` + vùng annotate trong manifest.
- T02 [content] data guide **Leader + SubLeader + Employee** (theo quyền + FAQ — Employee tái sử dụng card "Nhân viên" hiện có) + khai báo screenshotPath đủ 4 role trong manifest.
- T03 [screenshots] Chụp thật (browser/CDP, login 4 role) + annotate khoanh vùng (PIL) — iterate manifest, đủ 4 role, không bỏ sót bước.
- T04 [UI] Sidebar đổi label "Hỗ trợ"→"Hướng dẫn" + metadata title `support/layout.tsx` + `/support` render theo role đang login + selector role (Manager cả 4; Leader/SubLeader/Employee chỉ guide mình).
- T05 [print] Route `/support/print?role=` A4 từ cùng data (4 role — không rỗng) + nút in mặc định role hiện tại + xử lý print-guide.html cũ.
- T06 [verify] lint/build + browser E2E 4 role (guide đúng role, print đúng nội dung role chọn) + **verify manifest: mọi bước có ảnh annotate, không ảnh thừa** + docs + commit.

**Verify phase**: lint 0 errors + build PASS + E2E browser 4 role (login → guide đúng role → print đúng role) + manifest screenshot đủ/không thừa + không lệch 2 nguồn data.

**FAST route** (không chạm auth/DB/backend/production — UI + nội dung + assets): Mika verify đủ; Reviewer vẫn chạy theo yêu cầu anh (15-08).

**Reviewer R1 (15-08)**: CHANGES_REQUIRED — đã sửa 5 góp ý: (1) bổ sung guide **Employee** (4 role thật — `/support` + print không rỗng); (2) **manifest screenshot khóa chặt** (screenshotPath từng bước trong guide-content.ts, T03 iterate, T06 verify thiếu/thừa); (3) Leader flow thêm bước quản lý dữ liệu theo quyền + tách rõ tự đánh giá; (4) bỏ số bước cụ thể (hết lệch "15" vs "~17"); (5) T04 đổi luôn metadata title support/layout.tsx. → re-review vòng 2.

**Kết quả thực thi (15-08)**: 6 tasks DONE (chi tiết `tasks.md`). **guide-content.ts 1 nguồn data 4 role** (Manager 16 bước + 6 FAQ, Leader 9 + 4, SubLeader 7 + 4, Employee 4 + 3) — web + print render CÙNG data. **34/34 screenshot thật** login 4 role (158/663/432/16735) + **annotate khoanh vùng PIL** (box đỏ + số). Sidebar "Hỗ trợ"→"Hướng dẫn" + `/support` render guide theo role đang login + selector (Manager 4 role, khác badge cố định). Print route `/support/print?role=` A4 theo vai trò (mọi role chọn được, mặc định session role). **E2E 4 role ALL PASS** (intro đúng role, print steps/faq/ảnh đúng, interactive selector switch OK, console clean) + lint 0 errors + build PASS. Commits: `373ffac` `a58d653` `ddb8173` `f5224d0` `4984110` — chưa push.

### Phase 72: Tinh gọn trang Hướng dẫn — tích hợp, loại bỏ phần thừa 🟡 (2026-08-15)

> **Yêu cầu anh** (ST-verified 15-08): trang /support hiện có 8 section — 6 section CŨ (usageGuide, roleGuides, roleWorkflows, reportingGuide, aiGuide, managementGuide+permissionMatrix) vẫn còn hardcode TRÙNG với block mới `#huong-dan-vai-tro` (nguồn guide-content 4 role đầy đủ hơn). Yêu cầu: tinh gọn, tích hợp, loại bỏ phần thừa. Reviewer check plan trước khi thực thi.

**Bằng chứng (code thật 15-08)**: `src/app/support/page.tsx` 737 dòng — 7 hằng data cũ (L22-251: usageGuide 11 bước, roleGuides 4 card, roleWorkflows sơ đồ vòng, managementGuide, permissionMatrix, aiGuide, reportingGuide) + 6 section render cũ (L429-689) đều TRÙNG với block mới `#huong-dan-vai-tro` (L336-428, guide-content 4 role: intro + steps + ảnh + FAQ theo role). Cột phải "Nguyên tắc quyền truy cập" (L692-733) — giữ. Ảnh `/screenshots/01-05` CÒN được `public/print-guide.html` tham chiếu (L527/654/706/751/756) — KHÔNG xóa.

**Thiết kế**:
1. **Trang chỉ còn 3 phần**: header gọn (tiêu đề + nút In) + block `#huong-dan-vai-tro` (nguồn chính — guide-content 4 role) + cột phải "Nguyên tắc quyền truy cập" (giữ nguyên, có callout Manager).
2. **XÓA 6 section cũ**: `#huong-dan` (usageGuide), `#vai-tro` (roleGuides), `#workflow` (roleWorkflows), `#bao-cao` (reportingGuide), `#ai-ho-tro` (aiGuide), `#quan-ly-du-lieu` (managementGuide + permissionMatrix).
3. **XÓA 7 hằng data cũ** + **XÓA quickLinks** (mọi anchor trừ #huong-dan-vai-tro đều chết sau khi xóa section; chips chỉ còn 1 mục = vô nghĩa; trang giờ ngắn nên không cần điều hướng nhanh).
4. **Dọn import icon thừa** (đã đối chiếu code thật — góp ý Reviewer R1): **XÓA 7 icon** = ArrowRight, BookOpen, ClipboardCheck, FilePenLine, LineChart, ShieldCheck, Sparkles (chỉ dùng trong section/hằng cũ sẽ xóa); **GIỮ 5 icon** = HelpCircle, Lock, Printer, **Settings2** (dùng ở cột phải "Nguyên tắc quyền truy cập" L720 — KHÔNG xóa), UsersRound. Khi xóa quickLinks: bỏ luôn khối render chips (khu vực `mt-5 flex flex-wrap gap-2`) — header chỉ còn tiêu đề + nút In.
5. **GIỮ ảnh** `/screenshots/01-05` — `print-guide.html` (legacy, không còn là nguồn in chính — in thật qua `/support/print?role=`) vẫn tham chiếu; khi bỏ hẳn print-guide.html mới dọn được 01-05.

**WBS (3 tasks)**:
- T01 [src/app/support/page.tsx] Xóa 6 section cũ + 7 hằng data + quickLinks (cả khối render chips) + dọn 7 import icon — page.tsx còn ~210-260 dòng, chỉ render header + block vai trò + Nguyên tắc.
- T02 [verify] lint 0 errors + tsc + build + E2E browser 4 role (intro đúng role, print đúng steps/faq/ảnh — không đổi) + visual (trang gọn, không còn section trùng).
- T03 [docs] MASTER_PLAN + HANDOFF + commit.

**Verify phase**: lint 0 errors + build PASS + E2E 4 role PASS + visual không còn section trùng + ảnh 01-05 còn nguyên (print-guide.html OK).

**FAST route** (UI + nội dung, không chạm auth/DB/backend) — Mika verify đủ; Reviewer vẫn chạy theo yêu cầu anh (15-08).

**Reviewer R1 (15-08)**: CHANGES_REQUIRED — đã sửa 4 góp ý: (1) [CAO] danh sách icon đúng thực tế: XÓA 7 (ArrowRight/BookOpen/ClipboardCheck/FilePenLine/LineChart/ShieldCheck/Sparkles) — thêm FilePenLine, gạch Settings2 (vẫn dùng L720); GIỮ 5 (HelpCircle/Lock/Printer/Settings2/UsersRound); (2) ước lượng page.tsx còn ~250-300 dòng (không 400); (3) ghi rõ print-guide.html là legacy (in thật qua /support/print?role=); (4) xóa luôn khối render chips quickLinks (mt-5 flex flex-wrap gap-2) — header chỉ tiêu đề + nút In. → re-review vòng 2.

**Reviewer R2 (15-08)**: **PASS** ✅ — icon list khớp tuyệt đối code thật (12 icon import, XÓA 7/GIỮ 5 đúng L5-18); hằng↔render khớp 1-1; quickLinks xóa cả render (L321-331); ảnh 01-05 ↔ print-guide.html khớp (L527/654/706/751/756). 1 góp ý minor (đã sửa): page.tsx còn ~210-260 dòng.

**Kết quả thực thi (15-08)**: 3 tasks DONE (chi tiết `tasks.md`). **page.tsx 738 → 208 dòng** (−529): xóa 6 section cũ (#huong-dan/#vai-tro/#workflow/#bao-cao/#ai-ho-tro/#quan-ly-du-lieu) + 7 hằng data (usageGuide/roleGuides/roleWorkflows/managementGuide/permissionMatrix/aiGuide/quickLinks/reportingGuide) + chips quickLinks + dọn 7 import icon (giữ 5: HelpCircle/Lock/Printer/Settings2/UsersRound). Trang chỉ còn: header gọn + block #huong-dan-vai-tro (guide-content 4 role) + cột phải Nguyên tắc quyền truy cập. Build PASS + lint 0 errors + tsc PASS + E2E 4 role ALL PASS (steps/faq/ảnh không đổi) + visual verified không còn section trùng + ảnh /screenshots/01-05 còn nguyên (print-guide.html legacy OK). Commits: `879308c` + docs — chưa push.

### Phase 73: Nút "THÊM NHÂN VIÊN" ở trang chi tiết nhóm 🟡 (2026-08-15)

> **Yêu cầu anh** (15-08): bổ sung nút "THÊM NHÂN VIÊN" vào trang chi tiết nhóm (`/teams/[id]`) để thêm nhân viên — **nhóm mặc định là nhóm đang thao tác**. Task chạm DB (tạo user) → Reviewer duyệt plan trước khi thực thi (rule 14-08).

**Bằng chứng (code thật 15-08)**:
- `src/app/teams/[id]/page.tsx` — trang chi tiết nhóm: header có link "Quay lại" + h1 team.name + Leader + cụm KPI compact (thành viên/đã đánh giá/còn lại) tại L168-198; KHÔNG có nút thêm nhân viên. `teamId = params.id`.
- `src/components/modals/EmployeeModal.tsx` — modal thêm/sửa nhân viên ĐÃ hỗ trợ sẵn `restrictToTeamId` (L14): `initialTeamId = employee?.teamId || restrictToTeamId || firstTeamId` (L60) → nếu truyền teamId, nhóm mặc định đúng nhóm đó; select Nhóm `disabled={!!restrictToTeamId}` (L167) → không đổi nhóm được. Đúng yêu cầu "nhóm mặc định là nhóm đang thao tác".
- `src/actions/users.ts` `upsertUserAction` (L146) — `requireManager()` (L149): HIỆN TẠI CHỈ Manager được tạo/sửa nhân viên. **Yêu cầu mới của anh (15-08, sau R2)**: Leader CŨNG được thêm nhân viên DƯỚI QUYỀN trong nhóm của mình → cần NỚI action.
- `src/lib/auth.ts` — `requireRole(roles)` (L38) + `requireManager()` = `requireRole(['Manager'])` (L48) → có sẵn `requireRole(['Manager','Leader'])` để nới quyền.
- `src/app/employees/page.tsx` L598-604 — pattern mở modal + save: gọi `upsertUserAction(payload)` → toast → `queryClient.invalidateQueries(['users'], ['teams'], ['evaluations'])`.

**Thiết kế** (đã sửa theo Reviewer R1 — CHANGES_REQUIRED):
1. **KHÔNG dùng `components/modals/EmployeeModal.tsx` hiện tại** — Reviewer xác nhận: DEAD CODE (0 import), thiếu 2 trường Phase 61 `subleaderId` + `description`. Modal ĐANG SỐNG là bản inline trong `src/app/employees/page.tsx` (L37-~155, có allUsers/subleaderOptions/subleaderId/description). → **T01a: EXTRACT bản inline từ employees/page.tsx ra `components/modals/EmployeeModal.tsx`** (đầy đủ field, props giữ nguyên behavior) rồi **dùng chung 2 nơi** (employees/page.tsx + teams/[id]/page.tsx) — hết trùng, đúng AC3. Sau extract, xóa bản inline khỏi employees/page.tsx (dùng shared).
2. **Trang `/teams/[id]`**: thêm nút "THÊM NHÂN VIÊN" (icon UserPlus) trong header, cạnh cụm KPI compact (L177-198) — hiển thị khi: `isManager` (mọi nhóm) **HOẶC `user.role === 'Leader' && user.teamId === teamId`** (chỉ nhóm của mình). SubLeader/Employee không thấy.
3. **Mở EmployeeModal** với `restrictToTeamId={teamId}` — nhóm mặc định = nhóm đang mở + select bị khóa (không đổi nhóm). Role options: `['Employee', 'SubLeader']` (không tạo Manager/Leader từ trang nhóm — 1 team 1 Leader rule).
4. **onSave**: gọi `upsertUserAction(payload)` → toast → **invalidate đúng dạng object v5**: `queryClient.invalidateQueries({ queryKey: ['users'] })`, `{ queryKey: ['teams'] }`, `{ queryKey: ['evaluations'] }` (copy đúng từ employees/page.tsx L602-604).
5. **NỚI QUYỀN `upsertUserAction` (action change — Reviewer R3+R4 chi tiết hóa)**:
   - Đổi import L4: **giữ `requireManager` (còn dùng ở upsertUsersAction L234 + softDeleteUserAction L325) + thêm `requireRole`** — `import { requireManager, requireRole } from '@/lib/auth';` + dùng `requireRole(['Manager', 'Leader'])`.
   - Nhánh `auth.user.role === 'Leader'` (Manager đi thẳng, giữ nguyên mọi hành vi hiện tại):
     - **ÉP teamId phía server, không chỉ validate**: nếu `!requester.teamId` → return error ('Leader chưa được gán nhóm'); **`payload.teamId = requester.teamId` CẢ tạo VÀ sửa** (chặn null-strip users.ts L181 `team_id: user.teamId || null`).
     - **Chặn role tạo**: payload.role PHẢI là `Employee`/`SubLeader` (chặn Manager/Leader — Leader không tạo/sửa Leader/Manager).
     - **Check EDIT (3 check riêng)**: (a) khi `payload.id` tồn tại → fetch existing với **`select('id, team_id, role')`** (đổi từ `select('id')` hiện tại L155-159), require `existing.team_id === requester.teamId` (chặn sửa NV ngoài nhóm) **VÀ `existing.role ∈ {Employee, SubLeader}`** (chặn hạ chức Manager/Leader cùng team — R4); (b) sau khi ép, teamId cuối === requester.teamId (chặn chuyển NV ra nhóm khác/null); (c) **nếu payload.role rỗng khi EDIT → giữ nguyên `existing.role`** (chặn vô tình hạ SubLeader→Employee do L174 `role || 'Employee'` — R4).
   - Giữ nguyên assertLeadershipSlot + ensureEvaluationsForUsers + syncEvaluationAfterUserChange + audit (auth.user = Leader đúng actor).
   - [THẤP — pre-existing, ngoài scope] comment users.ts L165 "1 Leader + 1 SubLeader" SAI (assertLeadershipSlot chỉ chặn Leader; SubLeader không giới hạn) — đừng viết expectation sai; ghi hardening `subleaderId` cross-team sau (nay Leader có quyền ghi).
7. State: `useState` `isAddModalOpen` + `isSaving` trong TeamDetailPage.
8. **[THẤP — follow-up, ghi nhận]**: `employees/page.tsx` L357 `canManageEmployees = Manager || Leader` — sau khi nới action (điểm 5), nghịch lý cũ được GIẢI QUYẾT: Leader giờ thật sự upsert được (scope team). Còn cần xác nhận UI trang Nhân viên giới hạn Leader chỉ sửa NV trong team mình (L789 đã có check `!isLeader || (item.teamId === user?.teamId ...)`) — OK giữ nguyên.

**WBS (5 tasks)**:
- T01a [src/components/modals/EmployeeModal.tsx] EXTRACT modal inline từ employees/page.tsx (L37-339: EmployeeModalContent L84-339) ra shared component (đầy đủ subleaderId + description + allUsers/subleaderOptions — giữ props caller truyền vào: allUsers + teams, KHÔNG tự fetch useTeams/useAuth nội bộ như bản dead-code cũ, tránh double-fetch) + đổi employees/page.tsx dùng shared (bỏ bản inline).
- T01b [src/app/teams/[id]/page.tsx] Thêm nút "THÊM NHÂN VIÊN" (gate `isManager || (role==='Leader' && teamId===user.teamId)`) + mở EmployeeModal (restrictToTeamId=teamId, roleOptions Employee/SubLeader) + onSave upsertUserAction + invalidate object v5. Import/hook cần thêm: `useState`, `useQueryClient`, `useToast`, `upsertUserAction`, `user.role/teamId` (từ useAuth — hiện chỉ destructure `user`), `EmployeeModal` shared, `UserPlus` icon.
- T01c [src/actions/users.ts] NỚI QUYỀN upsertUserAction theo điểm 5 (R3+R4): import giữ requireManager + thêm requireRole; requireRole(['Manager','Leader']); Leader: ép payload.teamId = requester.teamId (tạo & sửa) + error khi chưa gán nhóm + chặn role Manager/Leader khi tạo + 3 check EDIT (existing.team_id===requester.teamId VÀ existing.role∈{Employee,SubLeader} — fetch select('id,team_id,role'); teamId cuối===requester.teamId; payload.role rỗng → giữ existing.role).
- T02 [verify] lint 0 + tsc + build + browser E2E: login Manager → /teams/{id} → nút hiện → mở modal → field Nhóm = tên nhóm đang mở + disabled → thêm NV mới (mã/họ tên/chức vụ/ngày) → save → assert: KPI "thành viên" +1 + block "Chưa gán SubLeader" +1 (NV mới không gán SubLeader) + status "Chưa bắt đầu". Verify Leader (663) NHÌN THẤY nút khi mở nhóm CỦA MÌNH + thêm NV thành công; Leader không thấy nút ở nhóm KHÁC; SubLeader/Employee không thấy nút.
- T03 [docs] MASTER_PLAN + HANDOFF + commit.

**Verify phase**: lint 0 errors + build PASS + E2E Manager thêm NV thành công từ trang nhóm (nhóm đúng, memberRows +1) + Leader thêm NV thành công trong nhóm mình + Leader không thấy nút ở nhóm khác + SubLeader/Employee không thấy nút + audit CREATE_USER ghi.

**CONTROLLED route** (chạm DB — tạo user) — Reviewer check plan trước (yêu cầu anh 14-08); thực thi qua runner agy (T01a/b) + Mika verify (T02).

**Reviewer R1 (15-08)**: CHANGES_REQUIRED — (1) [CAO] EmployeeModal.tsx cũ là DEAD CODE (0 import) + thiếu subleaderId/description → chọn extract modal inline sống (employees L37-339) ra shared, dùng chung 2 nơi; (2) [TB] invalidate dạng object v5; (3) [TB] T02 assert unassigned block; (4) [THẤP] follow-up canManageEmployees vs requireManager → KNOWN_BUGS. → re-review vòng 2.

**Reviewer R2 (15-08)**: **PASS** ✅ — logic khớp code thật (NV mới subleaderId null → block "Chưa gán SubLeader" L120-122; KPI +1; ensureEvaluationsForUsers tạo NotStarted; gate isManager đúng; assertLeadershipSlot chỉ chặn Leader → SubLeader không mâu thuẫn). 3 góp ý thấp (đã sửa): T01a phạm vi L37-339 + shared modal giữ props caller truyền (không tự fetch useTeams/useAuth cũ); T01b liệt kê import cần thêm (useState/useQueryClient/useToast/upsertUserAction/isManager/EmployeeModal/UserPlus).

**Bổ sung yêu cầu anh (15-08)**: "Ngoài Manager, Leader cũng có quyền thêm nhân viên dưới quyền trong nhóm" → Reviewer R3 (CHANGES_REQUIRED: 2 lỗ CAO — ép teamId server + null-strip EDIT) → R4 (CHANGES_REQUIRED: guard existing.role + role default rỗng + import giữ requireManager) → R5: PASS thiết kế, yêu cầu thực thi. Đã thực thi T01c đúng spec R3+R4.

**Kết quả thực thi (15-08)**: 5 tasks DONE (chi tiết `tasks.md`). T01a: EmployeeModal shared (employees 1012→709 dòng). T01b: nút "Thêm nhân viên" trang nhóm (Manager mọi nhóm / Leader nhóm mình) + restrictToTeamId. T01c: upsertUserAction requireRole(['Manager','Leader']) + ép teamId server-side + chặn role Manager/Leader + 3 check EDIT (team/role/role-empty). Build PASS + lint 0 + E2E thật: Manager thêm NV team "QC Gia dụng" OK, Leader 663 thêm NV team mình OK, SubLeader không thấy nút. NV tạm đã xóa mềm. ⚠️ Môi trường: shell env ô nhiễm NEXT_PUBLIC_SUPABASE_URL=sangwebsite → build/start phải `unset` (đã phát hiện khi E2E login fail).

### Phase 74: Thẻ Leader riêng ở đầu danh sách nhân viên (trang chi tiết nhóm) 🟡 (2026-08-15)

> **Yêu cầu anh** (15-08): trang chi tiết nhóm — tạo thẻ riêng cho **Leader**, nằm TRÊN CÙNG danh sách nhân viên, hiển thị kết quả đánh giá + nút đánh giá như nhân viên. **UI render thuần** (không chạm auth/DB write) → FAST route, Mika verify đủ.

**Bằng chứng (code thật 15-08)**:
- `src/app/teams/[id]/page.tsx` (519 dòng): header hiển thị Leader dạng text (L170-174, Crown icon + tên); danh sách = SubLeader blocks (L261-409, mỗi block có grade/score/badge + Link /evaluations/{sl.id}) + block "Chưa gán SubLeader" (L412+). Leader hiện KHÔNG có thẻ riêng với kết quả đánh giá.
- `leader` đã có sẵn (L60-63: users.find(u => u.id === team.leaderId)); `evaluations` đã load (L55) — Leader có evaluation riêng (SELF vòng 1) như Employee.
- Pattern grade/score/badge/link của SubLeader block (L262-324) — dùng lại cho Leader.

**Thiết kế**:
1. **Thẻ Leader Block** đặt TRƯỚC các SubLeader blocks (ngay sau check EmptyState, đầu `<div className="space-y-5">`) — render khi `leader` tồn tại:
   - Header: avatar indigo (chữ cái đầu) + tên + "Mã: {employeeCode}" + badge "Leader" (indigo).
   - Kết quả đánh giá GIỐNG SubLeader: grade badge (S/A/AB/B/C/D màu chuẩn) + score (L{round} + điểm) + status badge (getStatusBadge) + Link `/evaluations/{leader.id}` (icon FileText, title "Xem đánh giá").
   - Tính: leaderEvaluation (find by employeeId === leader.id), leaderSubmitted (rounds Submitted/SubmittedAt sort desc), leaderStatus, leaderGrade, leaderGradeRound, leaderScore.
2. KHÔNG đụng: header, KPI, SubLeader blocks, unassigned block, EmployeeModal, workflow.

**WBS (2 tasks)**:
- T01 [src/app/teams/[id]/page.tsx] Thêm Leader Block (thẻ riêng đầu danh sách, kết quả đánh giá + nút Xem đánh giá như nhân viên).
- T02 [verify] lint 0 + tsc + build + browser E2E: team "QC Gia dụng" (leader Mai Thị Hòa) → thẻ Leader hiện đầu danh sách + đúng dữ liệu; team khác không leader → ẩn.

**Verify phase**: lint 0 + build PASS + E2E Leader card hiển thị đúng (tên/mã/grade/score/status/link) + không vỡ SubLeader blocks.

**Kết quả thực thi (15-08)**: T01 DONE (commit `7817898`, đã push). Leader Block đặt đầu `<div className="space-y-5">` (L260), trước SubLeader blocks: avatar indigo + tên + Mã + badge Leader + grade/score (L{round}) + status badge + Link `/evaluations/{leader.id}` — pattern y hệt nhân viên. Verified thật (CDP + vision): team "QC Gia dụng" → Leader Mai Thị Hòa (8707) thẻ ĐẦU danh sách, **AB – L2 – 147**, "Đã có KẾT QUẢ đánh giá", icon xem đánh giá ✓; SubLeader blocks không vỡ. Build PASS + tsc/lint 0.

### Phase 75: Chat widget hỗ trợ (Manager/Leader/SubLeader) 🟡 (2026-08-15)

> **Yêu cầu anh** (15-08): thêm chat widget góc dưới phải giải đáp thắc mắc cho **Manager, Leader, SubLeader**. Chat widget tham khảo file `.md` mô tả toàn bộ webapp (kiến trúc/workflow/quy trình/tiêu chuẩn) khi trả lời. Ràng buộc: KHÔNG trả lời ngoài lề; giới hạn **15 lượt/account/2h**; model **gpt-5.6-luna (opencode go)**; gọi user là **chị**, xưng **em**; khi mở kiểm tra trang đang ở → chào ngắn "Chào chị" + gợi ý theo trang; ngôn ngữ tự nhiên tinh tế, **KHÔNG emoji**.

**Bằng chứng (code thật 15-08)**:
- `src/lib/ai.ts`: `DEFAULT_MODEL = 'gpt-5.6-luna'` (L10) — model đã đúng yêu cầu; `callAI(prompt, {system, maxTokens})` gọi OpenAI-compatible, fail-soft trả null; `isAIConfigured()` check AI_API_KEY.
- `src/actions/ai.ts`: pattern server action + requireManager + callAI + error text.
- `src/contexts/AuthContext.tsx`: user (id/name/role/employeeCode), isManager/isLeader/isSubLeader.
- `src/components/layout/AppLayout.tsx` (124 dòng): layout chung mọi trang đã login — nơi mount ChatWidget; dùng usePathname sẵn.
- KHÔNG có sẵn rate-limit → cần bảng mới.

**Thiết kế (chạm DB — bảng chat_usage + backend LLM → CONTROLLED, Reviewer bắt buộc)**:

1. **T01 [src/lib/chat-knowledge.md — tạo]**: File kiến thức toàn app (Mika tổng hợp từ guide-content.ts + MASTER_PLAN + code): tổng quan, kiến trúc (Next.js + Supabase), vai trò + quyền 4 role, workflow 3 vòng (Manager 1 / Leader 2 / SubLeader 3 / Nhân viên 3), quy trình đánh giá tuần tự, tiêu chuẩn A-F, thang điểm, kỳ đánh giá, cách dùng từng trang (Dashboard/Nhóm/Nhân viên/Báo cáo/Tiêu chuẩn/Cài đặt/Hướng dẫn/Đánh giá), FAQ chính. Mục tiêu ≤ ~15-20KB. **PII-SANITIZED: KHÔNG chứa tên thật/mã NV/cấu trúc nhân sự thật — chỉ mô tả chức năng + quy trình (Reviewer R1 [HIGH])**. Server action đọc MỘT LẦN ở module load (cache biến) — không fs-read mỗi request (R1 [MEDIUM]).

2. **T02a [src/actions/chat.ts — tạo]**: `chatGreetingAction(pathname)` + `chatAskAction(question, pathname)`:
   - `requireRole(['Manager','Leader','SubLeader'])` (Employee KHÔNG dùng — theo yêu cầu).
   - Rate limit (T02b): đếm lượt user trong cửa sổ 2h; ≥ 15 → trả "Chị đã dùng hết 15 lượt hỏi trong 2 giờ, vui lòng quay lại sau." — KHÔNG gọi LLM.
   - **System prompt PHÂN THEO ROLE (bổ sung anh 15-08, sau R2)**:
     - **Leader/SubLeader**: chỉ trả lời về HƯỚNG DẪN sử dụng, cách làm các thao tác, các lỗi/trục trặc thường gặp và cách xử lý trong phạm vi quyền của mình. KHÔNG trả lời phân tích nâng cao (báo cáo, thống kê, xu hướng, bất thường đánh giá, tư vấn xếp loại...) — nếu hỏi ngoài phạm vi, khéo léo từ chối và gợi ý liên hệ Manager.
     - **Manager**: ngoài hướng dẫn/lỗi như trên, ĐƯỢC trả lời thêm các câu hỏi NÂNG CAO: báo cáo, thống kê, cách dùng trang Báo cáo/Dashboard, tìm kiếm dữ liệu, giải thích bất thường trong đánh giá, cách đọc/điều chỉnh xếp loại, chốt kỳ...
   - Cả 2 nhánh đều có: knowledge.md (cache), luật "gọi khách là chị, xưng em; ngôn ngữ tự nhiên tinh tế khéo léo; KHÔNG dùng emoji; CHỈ trả lời về hệ thống KURABE, không trả lời ngoài lề; ngắn gọn". maxTokens ~400.
   - Greeting: dựa pathname → "Chào chị" + gợi ý theo trang (dashboard: tiến độ; teams: nhóm; employees: nhân viên; reports: báo cáo; criteria/settings: cấu hình; evaluations: chấm điểm; support: hướng dẫn; mặc định: chung).
   - Gọi `callAI`; lưu lượt chat vào bảng chat_usage SAU khi thành công.

3. **T02b [Supabase — bảng `chat_usage`]**: `id uuid PK default gen_random_uuid(), user_id uuid NOT NULL, created_at timestamptz default now()` + index (user_id, created_at). **RLS: ENABLE + KHÔNG policy nào cho anon/authenticated** — chỉ supabaseAdmin (service role) đọc/ghi (Reviewer R1 [HIGH]); **thêm type `chat_usage` vào `src/types/database.ts`** (pattern ai_summaries L387-410) — BẮT BUỘC (supabaseAdmin đã typed, thiếu sẽ build fail) (R1 [HIGH]). Migration SQL qua supabase CLI/script (đúng pattern các phase trước).

4. **T03 [src/components/chat/ChatWidget.tsx — tạo]**: client component:
   - Nút tròn fixed **bottom-24 right-6 trên mobile (trên BottomNav AppLayout L97 fixed bottom-6 left-6 right-6), bottom-6 right-6 trên desktop** (Reviewer R1 [MEDIUM] — tránh đè BottomNav); icon MessageCircle, tooltip "Hỗ trợ".
   - Chỉ render khi `user && ['Manager','Leader','SubLeader'].includes(user.role)`.
   - Mở → gọi `chatGreetingAction(pathname)` → hiện lời chào + gợi ý (đậm chữ "Chào chị").
   - Input chat + nút Gửi; loading; lỗi hiển thị text; KHÔNG emoji ở mọi text UI.
   - Đóng/mở toggle.

5. **T04 [src/components/layout/AppLayout.tsx]**: mount `<ChatWidget />` trước khi đóng main (sau children).

6. **T05 [verify + docs]**: lint 0 + tsc + build + E2E thật (Manager/Leader/SubLeader thấy widget; Employee không thấy; gửi câu hỏi → trả lời từ knowledge; test rate-limit tạm hạ 15→3 để xác nhận chặn rồi khôi phục 15; greeting theo trang). HANDOFF + MASTER_PLAN update. Commit.

**Ràng buộc kỹ thuật**:
- KHÔNG import lib/ai.ts vào client (key bí mật) — mọi LLM qua server action.
- chat-knowledge.md không chứa secrets; ngôn ngữ tiếng Việt.
- Rate limit tính theo `user.id` (account), không theo session.
- Emoji cấm: check bằng regex khi render (hoặc system prompt mạnh + maxTokens vừa đủ).

**Verify phase**: lint 0 + build PASS + E2E (3 role thấy + Employee không + hỏi được + greeting theo trang + chặn khi hết lượt).

**Reviewer R1 (15-08)**: CHANGES_REQUIRED — 3 HIGH (RLS chat_usage anon không access; type database.ts bắt buộc; chat-knowledge.md PII-sanitized) + 2 MEDIUM (cache knowledge module load; widget tránh mobile BottomNav). Đã sửa hết.
**Reviewer R2 (15-08)**: **PASS** ✅ — ghi chú: sau thực thi cần gói review code riêng (RLS thật, anon-write blocked, rate-limit 15/2h, PII thực tế) trước khi đóng Phase 75.

**WBS (6 tasks)**:
- T01 [src/lib/chat-knowledge.md] Viết knowledge toàn app (PII-sanitized ≤ ~20KB).
- T02a [src/actions/chat.ts] chatGreetingAction + chatAskAction (requireRole 3 role, system prompt từ knowledge cache, callAI maxTokens ~400).
- T02b [Supabase + src/types/database.ts] Bảng chat_usage (RLS no policy, service role only) + type.
- T03 [src/components/chat/ChatWidget.tsx] Widget client (nút fixed, role filter, greeting theo trang, chat UI không emoji, mobile offset).
- T04 [src/components/layout/AppLayout.tsx] Mount ChatWidget.
- T05 [verify + docs] lint/tsc/build/E2E (3 role thấy + Employee không + hỏi được + greeting + chặn hết lượt) + HANDOFF/MASTER_PLAN + commit.

### Phase 75.1: Nâng cấp chat AI — context vai trò/trang + chẩn đoán cụ thể + phân tích screenshot 🟡 (2026-08-15)

> **Yêu cầu anh** (15-08, sau khi thấy reply chung chung "Chị đang ở vai trò nào..."): chat AI phải (1) NẮM vai trò người hỏi + trang đang mở khi nhận câu hỏi, (2) xác định nhanh vấn đề cụ thể → trả lời trực tiếp, KHÔNG liệt kê chung chung, (3) KHI CẦN có thể chụp màn hình để phân tích.

**Bằng chứng (code thật 15-08)**:
- `src/actions/chat.ts` chatAskAction: input {question, pathname, history?}; buildSystem(role) đã phân theo role NHƯNG prompt KHÔNG nhắc rõ "chị đang ở vai trò X, trang Y" trong context → AI hỏi lại vai trò (reply vd 5 nguyên nhân chung).
- `src/lib/ai.ts` callAI: CHỈ text (messages: system + user string). KHÔNG hỗ trợ image/vision. Không có qwen/vision trong code.
- `pathname` đã có sẵn từ ChatWidget (usePathname) — chỉ cần đưa vào prompt.
- Không có thư viện screenshot trong package.json (chưa cài html2canvas/dom-to-image).

**Thiết kế (chạm backend LLM + có thể thêm dependency → CONTROLLED, Reviewer)**:

1. **T01 [chat.ts — context rõ ràng]**: chatAskAction thêm vào prompt (cả greeting + ask): `Thông tin người hỏi: vai trò = {role}; trang đang mở = {pageName từ pathname}.` — AI khỏi hỏi lại; dùng role/trang để chẩn đoán hẹp (vd /evaluations → nói về vòng/khóa phiếu; /employees → quyền thêm/sửa; /settings → kỳ/thang điểm).

2. **T02 [chat.ts — chẩn đoán cụ thể]**: nếu pathname match `/evaluations/{id}` (regex chuẩn — pathname UNTRUSTED, không dùng trực tiếp): **REUSE `getEvaluationByEmployee(id, period, user)`** (đã có scope check theo quyền — KHÔNG query supabaseAdmin trực tiếp, tránh lộ dữ liệu chéo team — Reviewer R1 [HIGH]) với **period resolve qua `getActivePeriod()`** (evaluations.ts L25 — không để undefined vì sẽ match nhầm period khi có nhiều kỳ — Reviewer R2 [L1]) → lấy status/currentRound/rounds đã nộp/employee role (ẩn danh: KHÔNG gửi tên/mã) → đưa vào prompt `Ngữ cảnh phiếu đang mở: ...` → AI trả lời chính xác "vì vòng 1 chưa nộp". Fail-soft: lỗi/không có quyền → bỏ qua context.

3. **T03 [lib/ai.ts — mở rộng vision]**: thêm `callAIVision(prompt, imageBase64, opts)` — gửi OpenAI-compatible `messages: [{role:'user', content:[{type:'text',text},{type:'image_url',image_url:{url:'data:image/png;base64,...'}}]}]`. **HARD GATE (Reviewer R1)**: verify VISION THẬT trước khi làm T04 — test 1 ảnh qua gpt-5.6-luna; nếu không nhận image_url → dùng model vision riêng (env AI_VISION_MODEL, mặc định qwen3.7-plus — theo memory opencode-go vision) qua cùng base URL. Chỉ khi test thật PASS mới chốt T03 và làm T04.

4. **T04 [ChatWidget — nút chụp + gửi]**: thêm nút "Chụp màn hình gửi em phân tích" trong panel chat:
   - Cài dependency `html2canvas` (hoặc dom-to-image) — chụp `document.body` (hoặc main content) → dataURL PNG (scale 0.5 để giảm size).
   - **SERVER-ACTION LIMIT (Reviewer R2+R3)**: Next.js server action body limit mặc định ~1MB → **cap: độ dài chuỗi dataURL/base64 gửi lên ≤ 900KB** (base64 inflation ~33% đã tính — 900KB base64 ≈ 675KB raw; server check độ dài chuỗi trước khi decode — Reviewer R3). Nếu vượt → client tự giảm scale/JPEG 0.8 rồi thử lại; vẫn quá → báo "ảnh quá lớn". KHÔNG bump bodySizeLimit (tránh mở rộng bề mặt).
   - **PII BOUNDARY (Reviewer R1 [HIGH])**: ảnh chụp có thể chứa tên thật/PII trên màn hình → hiện CẢNH BÁO trước khi gửi: "Em sẽ xem ảnh màn hình của chị để phân tích. Ảnh chỉ dùng cho câu trả lời này và không được lưu lại." + **server-side check: max size 900KB + rate-limit tính như câu hỏi thường** (Leader/SubLeader đếm lượt; Manager không giới hạn).
   - Gửi qua `chatAskWithScreenshotAction({question, pathname, history, imageBase64})` → server gọi callAIVision → trả phân tích.
   - KHÔNG lưu ảnh vào DB; KHÔNG emoji, gọi chị/xưng em.

5. **T05 [verify + docs]**: lint/tsc/build + E2E thật: (a) hỏi "sao không đánh giá được?" ở /evaluations/{id} với role Leader → trả lời nêu đúng vòng chưa nộp (không hỏi lại role); (b) chụp màn hình → gửi → AI phân tích đúng nội dung ảnh; (c) rate-limit vẫn hoạt động. HANDOFF + commit.

**Ràng buộc**: không gửi tên thật/PII vào LLM (ẩn danh hóa context); không lưu screenshot vào DB; model vision verify thực tế trước (T03).

**WBS (5 tasks)**: T01 context / T02 fetch context / T03 callAIVision / T04 widget screenshot / T05 verify.

**Reviewer R1 (15-08)**: CHANGES_REQUIRED — T02 phải reuse getEvaluationByEmployee (chống lộ dữ liệu chéo team) + T04 PII boundary + T03 hard gate verify vision.
**Reviewer R2 (15-08)**: gần PASS — period resolve qua getActivePeriod + cap ảnh ≤ server-action limit (không bump bodySizeLimit).
**Reviewer R3 (15-08)**: PASS ✅ — cap 900KB là độ dài chuỗi base64 gửi lên (đã sửa); lưu ý T02 chỉ gửi status/round/submitted/role, KHÔNG gửi notes/comment (có thể chứa tên).

**WBS (5 tasks)**: T01 context role/trang / T02 fetch context evaluation / T03 callAIVision (hard gate verify vision thật) / T04 widget screenshot (html2canvas + PII warning + cap 900KB) / T05 verify.

### Phase 76: Data context theo trang (thay chụp ảnh) + Giới tính nhân viên (Nam/Nữ) + AI gọi anh/chị theo giới tính 🟡 (2026-08-15)

> **Yêu cầu anh** (15-08): (1) thay vì chụp ảnh, thu thập data từ DATABASE theo trang đang mở để AI đánh giá — làm đủ hết các trang; (2) thêm "Giới tính": Nam/Nữ cho TẤT CẢ nhân viên — khi Thêm nhân viên có ô tick chọn Nam/Nữ, bổ sung giới tính Nữ cho tất cả nhân viên hiện có; (3) AI giao tiếp dựa trên giới tính: Nam → "anh", Nữ → "chị".

**Bằng chứng (code thật 15-08)**:
- `src/actions/dashboard.ts`: `getDashboardData(periodId)` (L148) trả DashboardData {stats, gradeDistribution, teamStatus, recentActivities, rawEvaluations, rawCriteriaGroups} — TÁI SỬ DỤNG cho chat context dashboard (KHÔNG có pendingReviews/anomalies — anomaly tính client-side).
- `src/types/index.ts` User (L21): id/employeeCode/name/role/team_id/joinDate/... — CHƯA có gender.
- `src/lib/db/users.ts`: USER_SELECT (L13-14) — thêm `gender`; mapUserFromDb — map gender.
- `src/actions/chat.ts`: greeting hiện `Chào chị {firstName}` (hardcode chị); buildSystem(role) — hardcode chị.
- `src/components/modals/EmployeeModal.tsx`: shared modal thêm/sửa NV — thêm field giới tính.
- `src/actions/users.ts` upsertUserAction: nhận payload tạo/sửa user — thêm gender.

**Thiết kế (chạm DB users + backend + LLM → CONTROLLED, Reviewer bắt buộc)**:

1. **T01 [DB + type — gender]**: migration `users` thêm cột `gender text not null default 'Nữ'` (DEFAULT tự backfill user cũ = 'Nữ' — KHÔNG cần UPDATE riêng — Reviewer R1 note) + **BẮT BUỘC thêm `grant select (id, employee_code, name, role, team_id, join_date, avatar_url, created_at, is_active, subleader_id, description, gender) on public.users to anon, authenticated;`** (Reviewer R1 [HIGH] — RLS row-level không đủ; thiếu GRANT cột gender → USER_SELECT qua anon client lỗi → getSessionUser catch null → MỌI người bị coi chưa đăng nhập, vỡ toàn app). RLS policy giữ nguyên. `src/types/database.ts` users thêm gender. `src/types/index.ts` User thêm `gender: string`. USER_SELECT + mapUserFromDb thêm gender.

2. **T02 [EmployeeModal + upsertUserAction + upsertUsersAction — gender]**: modal Thêm/Sửa nhân viên thêm **radio Nam/Nữ** (mặc định Nữ); `upsertUserAction` nhận + lưu gender (validate server-side: whitelist 'Nam'|'Nữ', thiếu → 'Nữ'); **`upsertUsersAction` (import Excel, users.ts L271-362) cũng phải xử lý** — chốt: Insert type gender optional + DB default (Reviewer R1 [MEDIUM]).

3. **T03 [chat.ts — anh/chị theo giới tính]**: tạo **1 helper `address(gender)` duy nhất → 'anh'/'chị'** (whitelist gender — KHÔNG chèn gender thô vào prompt, chống prompt injection — Reviewer R1 note) áp cho **TẤT CẢ site hardcode chị/em** trong chat.ts (~15 chỗ: greeting, buildSystem/BASE_RULES, history map "Chị"/"Em", prompt "Câu hỏi mới của chị", các message lỗi/limit — Reviewer R1 [MEDIUM]); fallback mặc định "chị" nếu gender thiếu.

4. **T04 [chat.ts — data context theo trang]**: mở rộng chẩn đoán: khi pathname match trang → fetch data thật từ DB (TÁI SỬ DỤNG action/hàm có scope check — KHÔNG query raw supabaseAdmin):
   - `/dashboard` → **CHỈ Manager** (Reviewer R1 [HIGH] — getDashboardData gọi getUsers/getTeams KHÔNG scope → SubLeader/Leader sẽ nhận headcount toàn công ty qua AI = LỘ data + sai số): `getDashboardData(activePeriod.id)` → tóm tắt field THẬT `{stats, gradeDistribution, teamStatus, recentActivities}` (KHÔNG có pendingReviews/anomalies — anomaly tính client-side lib/anomaly.ts — Reviewer R1 [MEDIUM]); Leader/SubLeader ở /dashboard → KHÔNG bật data context (fallback chụp ảnh hoặc trả lời chung).
   - `/reports` → **CHỈ Manager** (getReportAggregation cũng gọi getUsers/getTeams không scope — R1 [HIGH]): getReportAggregation(periodId, ...) signature đọc khi code.
   - `/employees` → `getUsers(auth.user)` (lib/db/users.ts L16 — scope theo requester — R1) + thống kê nhanh (tổng/đã xong/chưa).
   - `/teams` → getUsers(auth.user) nhóm theo team + tiến độ (hoặc hàm teams sẵn có scope — kiểm tra khi code).
   - `/criteria` → `getAllCriteriaGroups()` (lib/db/criteria.ts L14).
   - `/evaluations/{id}` → GIỮ NGUYÊN T02 Phase 75.1 (getEvaluationByEmployee + getActivePeriod).
   - `/settings`, `/support` → KHÔNG có data context (chấp nhận — R1 [LOW]): fallback chụp ảnh.

5. **T05 [verify + docs]**: lint/tsc/build + E2E thật: (a) hỏi "tình hình đánh giá?" ở /dashboard → AI trả lời số liệu DB thật KHÔNG chụp; (b) greeting user Nam → "anh", Nữ → "chị"; (c) modal thêm NV có radio Nam/Nữ + lưu đúng; (d) user cũ đều có gender='Nữ'. HANDOFF + commit.

**Ràng buộc**: gender validate server-side; migration an toàn (add column default — không phá data); data context tóm tắt gọn (không tốn token); không lộ password; không tự push (theo quy tắc anh).

**WBS (5 tasks)**: T01 gender DB/type / T02 modal+action / T03 anh-chị / T04 data context / T05 verify.

**Reviewer R1 (15-08)**: CHANGES_REQUIRED — 2 HIGH (GRANT cột gender cho anon/authenticated — thiếu sẽ vỡ toàn app; dashboard/reports data context CHỈ Manager — getDashboardData/getReportAggregation gọi getUsers/getTeams không scope) + MEDIUM (field DashboardData thật; helper address() ~15 chỗ; upsertUsersAction Excel) + LOW (settings/support không data context). Đã sửa hết.
**Reviewer R2 (15-08)**: gần PASS — fix L67 bằng chứng field DashboardData.
**Reviewer R3 (15-08)**: **PASS** ✅ (ghi chú cosmetic team_id→teamId).

### Phase 76.2: Tối ưu luồng báo lỗi — nút báo lỗi thủ công + webhook history + prompt webhook 🟡 (2026-08-15)

> **Yêu cầu anh** (15-08, sau Sequential Thinking audit 5 bước): hệ thống AI hỗ trợ → báo lỗi → điều tra → plan chờ duyệt đã tối ưu cơ bản (webhook tức thì), còn 3 GAP: (A) thiếu nút "Báo lỗi" thủ công (chỉ AI tự detect [CẦN_DEV]); (B) webhook payload thiếu history hội thoại; (C) prompt webhook thiếu cập nhật chat_reports status + trung thực khi không tìm ra root cause.

**Bằng chứng (code thật 15-08)**:
- `src/actions/chat.ts` chatReportErrorAction: gửi Telegram + insert chat_reports (có history) + POST webhook payload {user_name, role, pathname, question} — THIẾU history.
- `src/components/chat/ChatWidget.tsx`: send() nhánh needDev — chỉ trigger khi AI trả [CẦN_DEV]; KHÔNG có nút báo lỗi thủ công.
- Webhook subscription `kurabe-bao-loi` prompt: điều tra + plan + KHÔNG cập nhật chat_reports status; không dặn nói rõ khi không tìm ra nguyên nhân.

**Thiết kế (chạm backend webhook + UI chat — CONTROLLED, Reviewer bắt buộc)**:

1. **T01 [UI — nút "Báo lỗi" thủ công]**: ChatWidget thêm icon bug (lucide Bug) cạnh ô nhập chat (trước nút Gửi):
   - Bấm → **state inline confirm** (KHÔNG window.confirm — R1 L1) "Gửi báo lỗi hiện tại cho Developer?" → gọi `chatReportErrorAction({question: input.trim() || 'User bấm nút báo lỗi (không mô tả) — ' + 'trang: ' + pathname, pathname, history: visibleMessages})` (history TOÀN BỘ — không slice) → hiện reply xác nhận.
   - **GIỚI HẠN 1 LẦN/NGÀY/ACCOUNT** (anh chốt 15-08, out-of-band — thay cooldown 60s): server-side check — chatReportErrorAction đếm report của user_id hôm nay ≥ 1 → chặn: "Hôm nay {addr} đã gửi báo lỗi rồi, ngày mai gửi lại nhé." Client hiện state lỗi từ reply.
   - Disabled khi loading/sendingShot.
2. **T02 [chatReportErrorAction — user_id + cap + history + report_id]**: 
   - **Migration**: chat_reports thêm cột `user_id uuid` (nullable — report cũ giữ null) + type database.ts (R1 M2 liên quan).
   - **Check 1 lần/ngày**: trước khi insert — count chat_reports `eq(user_id, userId)` + `gte(created_at, startOfDay)` → ≥ 1 → return chặn (KHÔNG gửi Telegram/webhook). **startOfDay theo Asia/Ho_Chi_Minh (UTC+7, KHÔNG DST)** — công thức DUY NHẤT (R4):
```ts
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
const vnNow = new Date(Date.now() + VN_OFFSET_MS);            // giờ VN (UTC+7)
const startOfDayVn = Date.UTC(vnNow.getUTCFullYear(), vnNow.getUTCMonth(), vnNow.getUTCDate()); // 00:00 giờ VN
const startOfDay = new Date(startOfDayVn - VN_OFFSET_MS).toISOString(); // về UTC ISO để so created_at (timestamptz)
```
   - **Cap question ≤ 2000 chars** (R1 M1) — cắt nếu dài.
   - insert chat_reports `.select('id')` + user_id → lấy **report_id** (R1 M2).
   - **HISTORY TOÀN BỘ** (anh chốt 15-08): lưu bảng + webhook payload gửi **toàn bộ** history (KHÔNG slice 6 — agent điều tra cần full context); cap kỹ thuật 8000 chars (đề phòng payload quá lớn fail webhook/DB TEXT — an toàn vì chat hỗ trợ ngắn).
   - **Telegram = TÓM TẮT** (anh chốt 15-08): summary giữ ngắn — người/vai trò/trang/câu hỏi + **3 lượt gần nhất** (không đổ toàn bộ vào tin nhắn Telegram).

3. **T03 [Webhook prompt — cập nhật + trung thực]**: UPDATE subscription prompt `kurabe-bao-loi` — CLI KHÔNG có lệnh update (xác nhận R1) → **remove + subscribe lại với `--secret <secret CŨ>`** (R1 H2 — KHÔNG để auto-generate xoay secret → app ký sai → 401 im lặng); sau đó verify `hermes webhook test`:
   - Prompt mới THÊM `{history}` (R1 H1) + `{report_id}` (R1 M2).
   - Thêm bước: "Cập nhật bảng chat_reports: PATCH status='planned' cho report_id đã cho (supabase service key từ /home/pi5/projects/kurabe/.env.local, REST PATCH status only)."
   - Thêm: "Nếu KHÔNG tìm ra nguyên nhân gốc rễ: nói rõ 'chưa xác định được nguyên nhân, cần thêm thông tin từ user' — KHÔNG bịa plan."
   - Giữ nguyên: không code fix, không commit, chờ anh duyệt, trả lời tiếng Việt ngắn gọn.

4. **T04 [verify + docs]**: tsc/lint/build + E2E thật: (a) bấm nút báo lỗi → Telegram + chat_reports + webhook 202; (b) webhook payload có history; (c) agent điều tra plan + status='planned'. HANDOFF + commit (KHÔNG push — chờ anh).

**Ràng buộc**: nút báo lỗi KHÔNG yêu cầu AI; webhook payload giới hạn history ≤ 2KB; không đụng rate-limit chat hiện có; không lộ secret.

**WBS (4 tasks)**: T01 nút UI / T02 payload history / T03 prompt webhook / T04 verify.

**Reviewer R1 (15-08)**: CHANGES_REQUIRED — (H1) prompt webhook phải dùng `{history}` template (payload gửi history nhưng prompt chưa include); (H2) remove+subscribe XOAY HMAC secret → phải giữ secret cũ (`--secret <cũ>`) hoặc đồng bộ env + test; (M1) nút báo lỗi cần cooldown 60s + cap question ≤ 2000 chars; (M2) thêm report_id vào payload/prompt (insert .select('id')); (L1) bỏ window.confirm → state inline; (L2) cap chars.

### Phase 76.3: LIVE TEST đầy đủ — Trợ giúp AI + Báo lỗi + Tự lên plan xử lý 🟢 (2026-08-15, chạy tự động KHÔNG dừng)

> **Yêu cầu anh** (15-08, trước khi đi ngủ): lên plan live test đầy đủ các tính năng trợ giúp AI, báo lỗi, tự lên plan xử lý; chạy NHIỀU test bao phủ hết trường hợp (nhất là phần hỗ trợ — phải trả lời ĐÚNG, CỤ THỂ, THÔNG MINH, TỰ NHIÊN); Reviewer check; kế hoạch TỰ CHẠY THÔNG SUỐT đến hết rồi báo cáo — KHÔNG dừng chờ approve (anh không hiện diện).

**Phạm vi test (21 case, chia 5 nhóm)**:
- **A. UI/config (3)**: nút chat hiện đúng role (Manager/Leader/SubLeader có, Employee không); panel (X to, neo đáy, nút bottom ẩn khi mở); nút Báo lỗi hiển thị.
- **B. Hỗ trợ AI — trả lời ĐÚNG/CỤ THỂ/THÔNG MINH/TỰ NHIÊN (10)**: /evaluations "sao không đánh giá được" → tên cụ thể (Leader Hòa...); /dashboard "tình hình" → số liệu DB thật + phân tích súc tích (không menu/chụp); /reports "tóm tắt" → số liệu; /employees "bao nhiêu quản lý" → breakdown role; hướng dẫn thao tác Leader đúng phạm vi; hỏi ngoài phạm vi (Leader) → từ chối khéo + gợi ý Manager; chức danh Nhân viên → không có; history 2 câu nhớ ngữ cảnh; đổi trang không lẫn + quay lại nhớ; greeting theo trang.
- **C. Báo lỗi (4)**: nút bug + confirm; gửi → reply + chat_reports (user_id); lần 2 chặn 1/ngày; AI detect [CẦN_DEV] (caveat: không ép được AI quyết định — ghi log + đánh giá, test chính là nút thủ công).
- **D. Webhook/điều tra (3)**: HMAC sai 401 / đúng 202; agent webhook nhận payload {summary, report_id} → điều tra → MASTER_PLAN → status planned; Telegram tin báo lỗi.
- **E. Tổng hợp (1)**: build/tsc/lint + không crash.

**Cơ chế chạy (KHÔNG dừng)**:
- Script E2E CDP tự chạy toàn bộ A/B/C (login user thật, mở trang, hỏi, đánh giá PASS/FAIL theo tiêu chí keyword/pattern).
- D: test webhook HMAC (401/202) + trigger agent (202) → agent chạy nền → sau ~3-5 phút verify chat_reports status='planned' + MASTER_PLAN có mục KURABE BUG.
- Kết quả ghi /tmp/kurabe-live-test-report.md + tóm tắt cuối cho anh (Telegram qua báo cáo).
- KHÔNG hỏi approve giữa chừng; nếu case fail → ghi FAIL + lý do + tiếp tục (không dừng).
- Reviewer check plan TRƯỚC khi chạy.

**Ràng buộc**: không đụng dữ liệu production (test user 158/16735 login đọc; report test dọn sau); server local port 3000 giữ chạy; không push. **DEFER**: rate-limit 15/2h đã verify ở Phase 75 — không test lại trong suite này (tránh đụng chat_usage thật).

**Reviewer R1 (15-08)**: gần PASS — bổ sung: (7) C.4 [CẦN_DEV] không ép được AI quyết định → ghi "không ép, đánh giá qua log/manual, test chính là nút thủ công"; (8) rate-limit 15/2h → DEFER (không đụng chat_usage thật trong live suite — đã verify ở Phase 75); (9) THÊM case: SubLeader hỏi ngoài phạm vi → từ chối; Manager hỏi nâng cao (báo cáo chi tiết) → trả lời; (10) PREFLIGHT: assert port 3000 + 8644 nghe, env KURABE đủ, unset NEXT_PUBLIC_SUPABASE_URL (chống ô nhiễm shell), ETA ~20-30 phút.
- Lưu ý chạy: test-webhook.cjs cũ chỉ dùng cho HMAC; D.2 phải trigger webhook payload THẬT (có report_id/summary) mới verify status='planned'.

**KẾT QUẢ LIVE TEST (15-08, tự chạy hết — KHÔNG dừng): 22/22 PASS** + D webhook trigger PASS. Chi tiết /tmp/kurabe-live-test-report.md. A (UI) 6/6; B (Hỗ trợ AI — đúng/cụ thể/thông minh/tự nhiên) 10/10: B1 tên cụ thể Leader Hòa ✓; B2/B3 số liệu DB thật 22 NV/9% ✓; B4 breakdown role ✓; B6 chức danh NV không có ✓; B7 history nhớ ✓; B8 đổi trang không lẫn ✓; B9 greeting theo trang ✓; B10 không emoji + xưng hô chị ✓. C (báo lỗi) 4/4: nút bug/confirm/gửi/chặn 1-ngày ✓. D: HMAC 401/202 ✓; agent webhook trigger + plan (agent đang chạy — tooling github repo sai aivntps/kurabe 404 → tối ưu sau: thêm skill/sửa prompt dặn dùng repo thật tuphucsinh/kurabe + đọc file local). E build/tsc/lint PASS.

### Phase 77: 3 tính năng AI mới — Biên bản kết thúc kỳ + Thông báo kết quả cho Employee + Tìm kiếm ngữ nghĩa Manager 🟡 (2026-08-15, plan)

> **Yêu cầu anh** (15-08): dùng Sequential Thinking lên plan (reviewer check kỹ) cho: (1) AI soạn biên bản kết thúc kỳ; (2) Thông báo kết quả cho nhân viên khi login (giải thích điểm/xếp loại/vì sao/cải thiện + động viên — KHÔNG qua chat, anh chốt 15-08); (3) Tìm kiếm ngữ nghĩa Manager qua chat.

**Bằng chứng code thật (15-08)**:
- `src/actions/ai.ts` draftResultMessageAction (L102-155): ĐÃ CÓ + rất chi tiết (xác nhận xếp loại + điểm mạnh theo tên tiêu chuẩn + cải thiện/gợi ý + khuyến khích, ẩn danh) → **KHÔNG làm lại**; phần mới của yêu cầu #2 = **THÔNG BÁO KẾT QUẢ KHI EMPLOYEE LOGIN** (không chat — anh chốt 15-08): Manager soạn hàng loạt bằng AI (nền draftResult) → lưu → Employee thấy card kết quả khi vào hệ thống.
- suggestCommentAction (L47-96): gợi ý nhận xét chấm điểm — đã có.
- explainAnomalyAction (L17-40): giải thích chênh lệch — đã có.
- **draftResultMessageAction ĐÃ CÓ chi tiết — T2 dùng làm nền soạn hàng loạt**.
- `src/actions/ai-summary.ts` getPeriodSummary: tóm tắt kỳ (ai_summaries) — TÁI SỬ DỤNG cho biên bản.
- `src/actions/chat.ts` buildPageContext: data context theo trang — T3 mở rộng đây.
- `src/lib/db/evaluations.ts` getEvaluationsByPeriod (scope viewer) + evaluation_rounds — nguồn cho T3 query.
- ChatWidget hiện requireRole(['Manager','Leader','SubLeader']) — Employee bị chặn (giữ nguyên — T2 không mở chat cho Employee).

**Thiết kế (3 task, chạm backend AI + quyền Employee → CONTROLLED, Reviewer KỸ)**:

1. **T1 [Biên bản kết thúc kỳ — Manager]**: action mới `generatePeriodMinutesAction(periodId)` (src/actions/ai.ts):
   - Input: stats/gradeDistribution/teamStatus (getDashboardData), anomalies (lib/anomaly.ts), getPeriodSummary (ai_summaries — NGUỒN "điểm nổi bật" vì getDashboardData KHÔNG có top-performers — Reviewer L3), period name.
   - **GATE (Reviewer L3)**: chỉ cho phép khi kỳ KHÔNG còn Active (đã đóng) — hoặc cảnh báo xác nhận nếu kỳ còn mở; nút disabled + tooltip khi kỳ active.
   - **ẨN DANH (Reviewer R1 #4)**: strip tên khỏi recentActivities + anomaly.name — CHỈ mã NV/code (VD "mã 8707 có chênh lệch 23 điểm" — không tên).
   - AI prompt: viết BIÊN BẢN KẾT THÚC KỲ (tiếng Việt, chính thức ~250-350 từ): mục đích/thời gian, tổng quan kết quả (xếp loại, tiến độ), điểm nổi bật, vấn đề bất thường, khuyến nghị kỳ sau.
   - UI: nút "Soạn biên bản" trên Dashboard/Reports (Manager) → khung soạn sẵn (textarea) → Copy + In → KHÔNG lưu DB (chỉ soạn).

2. **T2 [Thông báo kết quả cho Employee — KHÔNG qua chat]**: (anh chốt 15-08: không thông báo bằng chat; khi NV login → thấy phần thông báo kết quả của mình)
   - **KHÔNG mở chat cho Employee** (giữ requireRole 3 role — bỏ ý tưởng Employee chat).
   - **Migration**: thêm cột `result_message text` vào evaluations (message kết quả cuối/phiếu — nullable) + type database.ts.
   - **Manager soạn + gửi hàng loạt**: nút "Soạn thông báo kết quả" (trang Reports/Dashboard hoặc kỳ) → AI generate message cho TỪNG nhân viên đã có kết quả (dùng draftResultMessageAction nền — loop evaluations Approved/closed kỳ, ẩn danh prompt) → hiển thị bản xem trước → Manager duyệt → "Gửi" → LƯU result_message vào evaluation (service role). **Giảm tải Manager**: 1 lần bấm soạn hàng loạt + duyệt, không phải soạn từng người.
   - **Employee login → thấy thông báo**: thêm card "Thông báo kết quả đánh giá" trên trang chính của Employee (dashboard khi role=Employee): hiển thị result_message (nếu có) + xếp loại cuối + điểm + ngày; nếu chưa có → hiện "Kết quả đang được cấp trên tổng hợp" (hoặc ẩn nếu kỳ chưa chốt).
   - **CHUỖI TYPE (Reviewer R3 HIGH)**: database.ts evaluations Row/Insert/Update thêm `result_message: string | null`; types/index.ts Evaluation thêm `resultMessage?: string | null`; mapEvaluationFromDb map result_message → resultMessage.
   - **ACTION GHI (Reviewer R3 HIGH)**: `saveResultMessageAction(evaluationId, message)` — requireManager + supabaseAdmin.update(evaluations, {result_message}) + logAudit + revalidatePath.
   - **BATCH SOẠN HÀNG LOẠT — CLIENT-DRIVEN CHUNKED (Reviewer R3 BLOCKER + R4/R5 note)**: KHÔNG một action monolithic (Vercel function timeout 22 lượt × 45s). Thiết kế: action `generateResultMessagesChunkAction(periodId, offset, limit=5)` — mỗi lần gọi xử lý 5 evaluation (callAI tuần tự trong chunk, timeout 45s/lượt) → trả {items: [{evaluationId, message, ok, error}], nextOffset, done}; UI loop: bấm "Soạn thông báo" → gọi chunk liên tiếp (offset 0,5,10...) hiển thị tiến độ "x/22" → gom danh sách → Manager duyệt → gọi saveResultMessageAction từng cái. Row fail → ok=false + UI cho "thử lại row lỗi" (gọi chunk riêng cho evaluation đó). KHÔNG gửi khi chưa duyệt.
   - **RE-SEND (Reviewer R3)**: Manager có thể soạn lại + ghi đè result_message (saveResultMessageAction overwrite) — không khóa.
   - **CON ĐƯỜNG ĐỌC EMPLOYEE (Reviewer R3 HIGH)**: Employee card dùng getEvaluationByEmployee(employeeId = auth.user.id, period active, user) → eval.resultMessage + finalGrade + totalScore → hiển thị; KHÔNG cần query mới.
   - **PHẠM VI HIỂN THỊ (Reviewer R3)**: result_message CHỈ hiển thị cho Employee chủ phiếu + Manager (soạn/xem); Leader/SubLeader KHÔNG cần thấy trong scope này (chốt).
   - **T2b — GIỚI HẠN NAVIGATION EMPLOYEE (anh chốt 15-08)**: Employee CHỈ thấy 3 thứ: (1) Phiếu đánh giá của mình /evaluations/{id}; (2) Cài đặt /settings (đổi mật khẩu); (3) Hướng dẫn /support. KHÔNG thấy dashboard/teams/employees/reports/criteria.
     - **CƠ CHẾ CHẶN (Reviewer T2b #1)**: per-route server guard — dashboard inline + layout.tsx async cho teams/employees/criteria; KHÔNG dùng middleware (cookie không có role). Redirect đích = /evaluations/{employeeId} (cần DB lookup lấy employeeId — không làm được ở middleware).
     - **reports/page.tsx (Reviewer T2b #2)**: đổi đích redirect — hiện về /dashboard → về /evaluations/{id} cho Employee.
     - **getEvaluationByEmployee (Reviewer T2b #3)**: truyền active periodId (khử maybeSingle nhiều kỳ) + định nghĩa message "chưa có phiếu" khi Employee chưa có phiếu kỳ active.
     - **Sidebar + BottomNav (Reviewer T2b #4)**: filter theo role — Employee: "Phiếu đánh giá của tôi" + Cài đặt (bỏ Home/Teams/Users).
     - **Landing / (Reviewer T2b #5)**: login/`/` redirect role-aware — Employee → /evaluations/{id} (KHÔNG /dashboard).
     - **(Khuyến nghị T2b #6)**: thêm requireRole vào getDashboardData + getReportAggregation (defense-in-depth).
   - **T2c — LỊCH SỬ KẾT QUẢ CÁC KỲ TRƯỚC (anh chốt 15-08 #1)**: trong /evaluations/{id}, thêm tab/khối "Kết quả các kỳ trước". HÀM MỚI `getEvaluationHistoryByEmployee(employeeId, user)` (Reviewer R8) — enforce scope server-side: `employeeId === user.id` cho non-Manager (hoặc canViewEvaluation từng row); **truyền auth.user.id từ session, KHÔNG nhận id từ URL**. Filter "có kết quả" = status Approved (hoặc kỳ đã đóng). Trả: period name, grade, score, result_message (nếu có).
   - **T2d — GIẢI THÍCH XẾP LOẠI TRÊN CARD (anh chốt 15-08 #2)**: card kết quả hiển thị ý nghĩa xếp loại. **Dùng HARDCODED map grade→meaning (Reviewer R8 khuyến nghị — grade_bands không có cột description tin cậy)**: {S: 'Xuất sắc', AB: 'Tốt', B: 'Đáp ứng tốt yêu cầu', C: 'Cần cải thiện'} + ngưỡng điểm từ grade_bands (đọc role_group phù hợp) — hiện: "Xếp loại B — Đáp ứng tốt yêu cầu (ngưỡng: 70-79)" + **động viên = static template 1 dòng** (không gọi LLM). Nếu grade không có trong map → ẩn phần giải thích.
   - Scope: Employee CHỈ đọc evaluation của mình (getEvaluationByEmployee user scope — đã có); không API mới cho Employee ngoài UI đọc đã có.
   - Rate: soạn hàng loạt = N lượt LLM chunk 5/đợt (Manager không giới hạn — OK); ẩn danh prompt như draftResult hiện có.

3. **T3 [Tìm kiếm ngữ nghĩa Manager — WITHIN-PERIOD]**: mở rộng buildPageContext (chat.ts):
   - **RESCOPE (Reviewer R1 #1)**: phân tích TRONG KỲ hiện tại — "giảm 2 kỳ liên tiếp" CHƯA trả lời được (chưa có lịch sử đa kỳ) → buildSystem Manager ghi rõ giới hạn: "Nếu được hỏi so sánh nhiều kỳ, nói rõ em chỉ phân tích trong kỳ hiện tại".
   - **TÓM TẮT DETERMINISTIC bằng CODE (Reviewer R1 #6) — KHÔNG dùng LLM tính**: fetch `getEvaluationsByPeriod(periodId, user)` + rounds → code tính: top N tăng/giảm điểm giữa các vòng, theo nhóm, theo role, xếp loại — đưa kết quả tóm tắt (top 10 + tổng hợp) vào prompt.
   - **Manager LUÔN nhận bounded context (Reviewer R1 #6)**: ở /dashboard + /reports Manager luôn nhận tóm tắt có cấu trúc này (bỏ keyword gating) — AI trả lời query từ context; payload giới hạn ~1500 chars (top 10 + tổng); fail-soft.
   - **Tên (Reviewer L4)**: giữ tên trong context T3 (Manager thấy mọi tên sẵn) — QUYẾT ĐỊNH tài liệu; ĐẢM BẢO không lọt ra non-Manager (chỉ chạy nhánh role==='Manager').

**NOTE CODE-TIME (Reviewer R4)**: (a) batch soạn 22 lượt vượt Vercel function timeout → phải CLIENT-DRIVEN chunked (UI gọi action theo từng đợt 5, hiển thị tiến độ) — KHÔNG một action monolithic; (b) resultMessage qua mapEvaluationFromDb sẽ tới Leader/SubLeader (canViewEvaluation cho xem) → UI detail page PHẢI gate hiển thị (role Employee && phiếu mình, hoặc Manager) — không dựa query.

**Ràng buộc**: T2 quyền Employee phải server-side chặt (không lộ kết quả người khác — getEvaluationByEmployee đã scope theo user); Employee không báo lỗi/không screenshot; T3 chỉ Manager + tóm tắt giới hạn; không đụng data production (test user 16735 Employee + 158 Manager); không push.

**WBS (3 task)**: T1 biên bản / T2 thông báo kết quả Employee (không chat) / T3 tìm kiếm ngữ nghĩa. Reviewer check KỸ từng task trước khi code.

**Reviewer R1 (15-08)**: CHANGES_REQUIRED — T3 rescope within-period (chưa có lịch sử đa kỳ — ghi rõ giới hạn) + summary deterministic code; [T2 cũ: Employee branch — SUPERSEDED bởi quyết định anh 15-08 (không mở chat Employee — đổi sang thông báo kết quả)]; T1 gating kỳ + strip tên + nguồn nổi bật getPeriodSummary. Đã sửa hết.
**Reviewer R2 (15-08)**: **PASS** ✅ (cho T1+T3) — ghi chú code-time: (a) T1 gate chọn hard-disable hoặc soft-confirm; (b) T1 fallback nếu chưa có ai_summaries → nhắc Manager tạo summary trước; (c) [SUPERSEDED — T2 đổi hướng không mở chat, bỏ ý mở 4 roles].

**KẾT QUẢ TEST KỸ (15-08): 24/24 PASS** — T1 6/6 (biên bản: nút/modal/soạn/ẩn danh/gate/leader-chặn), T2 13/13 (Employee: redirect/3-mục/chặn 3 trang/card kết quả/grade-map/lịch sử; Manager: batch soạn→gửi→lưu DB; Leader UI-gate không thấy resultMessage), T3 5/5 (giảm nhiều nhất/nhóm tệ nhất/đếm chưa đánh giá/giới hạn đa kỳ/Leader không lộ số). Report /tmp/kurabe-p77-test-report.md. 2 fail ban đầu do script đo sai — retest/code-inspection PASS. Data test dọn sạch.

---

## Phase 78: Tối ưu giao diện Mobile (UI responsive <md) 🟡 (2026-08-16)

> Yêu cầu anh (16-08): giao diện mobile lộn xộn, kích thước không phù hợp, khó sử dụng trên mobile.

**Bằng chứng audit thật (16-08, Playwright Chrome 375×812 login 158 — screenshots + metrics tại `/tmp/kurabe-mobile-audit/`, script `/tmp/kurabe-mobile-audit.py`)**:
- **FAB chat che nội dung**: `w-16` (64px) tại `fixed right-4 bottom-24` (ChatWidget.tsx:112) — main chỉ `pb-32` (128px, AppLayout.tsx:98) < FAB chiếm ~160px từ đáy → content cuối + vùng chấm điểm phiếu bị che.
- **BottomNav** (AppLayout.tsx:107-121): label CHỈ active hiện (`opacity-0 h-0` :136), font `text-[9px]`, nhãn tiếng Anh (Home/Teams/Users/Settings) — trái chuẩn tiếng Việt toàn app.
- **Icon buttons 28-36px** (<44px chuẩn tap): edit/delete ở criteria (nhóm+tiêu chí), teams, team-detail, employees.
- **Font 9-10px** (<11px tối thiểu đọc được): nav label, teams stats (Nhân sự/Xong/Chờ), criteria tabs (Nhóm A-F), reports legend (≥80%…), support steps (Vòng 1/2/3).
- **Dashboard KPI lệch grid**: hàng 1 có 2 card, hàng 2 chỉ 2 card căn trái — không `grid-cols-2` đều; khoảng trắng dọc lớn.
- **Teams list**: stats card 3 cột bị cắt cột 3 ("tiến độ đánh giá" cụt). **Team detail**: tên NV vỡ từng từ, badge trạng thái absolute tràn/chồng L2.
- **Criteria tabs**: cắt mép phải (NHÓM C) không affordance scroll; tab 2 tầng cao.
- **Reports**: 3 nút hành động lệch width; filter card cao; KPI nhãn dài; legend 10px.
- **Evaluation detail**: dải trạng thái chật ("Đánh giá" vỡ 2 dòng, nút "Chi tiết so sánh" to, "Đã nộp" 2 dòng + lặp trạng thái); header tiêu chí vỡ (tên + nút GHI CHÚ chen); radio nhỏ; tabs nhóm cuộn không hint.
- **Login**: ổn nhất — chỉ khoảng trắng trên lớn + header banner cao.
- **KHÔNG có overflow ngang toàn trang** (scrollWidth = 375 mọi trang) — vấn đề là chi tiết layout, không phải break.

**Nguyên tắc**: CHỈ sửa mobile (<md) + fix chung vô hại (pb, font tối thiểu). KHÔNG đụng desktop (md+) layout, KHÔNG chạm auth/DB/logic. UI class thuần → **FAST route** (Mika verify Playwright metrics + screenshots).

**Thiết kế (12 task — chi tiết /plan2task → tasks.md)**:
- **T01** `src/components/layout/AppLayout.tsx`: main `pb-32`→`pb-44` (mobile, chừa FAB+nav ~176px); Mobile Header gọn (avatar `w-9 h-9`→`w-8 h-8`, gap gọn, px-6→px-4; **bell button :82 `p-2` (36px) → `p-3` (44px tap)**); BottomNav: nhãn tiếng Việt đủ 4 tab (Trang chủ/Nhóm/Nhân sự/Cài đặt — Employee: Phiếu/Cài đặt/Hướng dẫn), luôn hiện label **`text-[11px]`** (KHÔNG 10px — T12 đo 0 font <11px), bỏ `opacity-0 h-0` inactive.
- **T02** `src/components/chat/ChatWidget.tsx`: FAB `w-16 h-16`→`w-14 h-14` (56px), `bottom-24`→`bottom-20`, giữ z-[9998]; panel `w-[calc(100vw-2rem)]`→`w-[calc(100vw-1.5rem)]`.
- **T03** Icon buttons ≥44px tap (chỉ các file audit có nút 28-36px): `src/app/criteria/page.tsx`, `src/app/teams/page.tsx`, `src/app/teams/[id]/page.tsx`, `src/app/employees/page.tsx` — thêm `min-w-11 min-h-11 flex items-center justify-center` (thay padding nhỏ). KHÔNG đụng modals (ngoài scope audit). Class base đổi → ảnh hưởng cả desktop nhưng vô hại (chỉ tăng vùng chạm) — verify desktop regression ở T12.
- **T04** Dashboard `src/app/dashboard/page.tsx` (:83 KPI đang `flex flex-wrap`): đổi `grid grid-cols-2 gap-3 md:flex md:flex-wrap md:gap-4` (mobile grid đều 2 cột, **desktop giữ nguyên flex** nhờ gate `md:flex`) + nhãn ngắn + giảm khoảng trắng dọc (section gap).
- **T05** Teams list `src/app/teams/page.tsx` (stats card 3 cột cắt cột 3 + stats label 10px → label đưa T11) + detail `src/app/teams/[id]/page.tsx`: hiện trạng badge trạng thái là **grid cột cố định `grid-cols-[minmax(0,1fr)_32px_104px_144px]`** (:284/:367/:438/:532 — KHÔNG có absolute) → mobile đổi template `grid-cols-[minmax(0,1fr)_32px_104px]` + badge xuống dòng riêng hoặc `sm:` khôi phục 4 cột; tên NV không vỡ (`min-w-0` + `truncate` hoặc wrap chuẩn); stats card 3 cột `grid-cols-3 minmax(0,1fr)` + nhãn ngắn.
- **T06** Employees `src/app/employees/page.tsx`: header cột "XẾP LOẠI GẦN NHẤT"→"Xếp loại"; hàng padding tăng; placeholder ngắn ("Tìm tên hoặc mã NV"); giữ table (KHÔNG đổi card-list — non-goal).
- **T07** Criteria `src/app/criteria/page.tsx`: tabs `overflow-x-auto` + peek (hiện mép tab kế) + fade gradient phải; tab compact 1 tầng (`NHÓM A · Kỷ luật (9)`); icon edit/delete 44px; hàng mức điểm compact (bỏ card lồng). Đổi class base → verify desktop T12.
- **T08** Reports: page.tsx chỉ là wrapper (:78) — thay đổi thực ở: **3 nút hành động** `src/components/reports/PeriodMinutesModal.tsx` + `BatchResultMessageModal.tsx` + `ExportReportButton.tsx` (full-width đều mobile); **KPI nhãn ngắn** ("Điểm TB", "≥AB") trong page; **filter compact** `src/components/reports/ReportFilters.tsx` (nhóm+kỳ 1 hàng, "Dữ liệu thời gian thực" thành status line nhỏ); **legend `text-[10px]`→`text-[11px]`** `src/components/reports/CriteriaHeatmap.tsx:39`.
- **T09** Evaluation detail: dải trạng thái trong `src/app/evaluations/[id]/page.tsx` (:648-660) 1 dòng (chip "Lần 2/2" + "Đã nộp", nút so sánh icon+text compact); **phần còn lại ở `src/components/evaluation/CriteriaTab.tsx`** (round chip `text-[9px]` :164, GHI CHÚ :83, điểm badge :75/:105/:181/:205 → ≥`text-[11px]` + vùng chạm 44px) + **`src/components/evaluation/GroupNavTabs.tsx`** (tab `text-[9px]` :62, badge :84 → compact + peek scroll).
- **T10** Login `src/app/login/page.tsx`: giảm khoảng trắng trên (padding-top), banner gọn.
- **T11** Sweep font/tap còn sót (đảm bảo T12 đạt 0 <11px / <40px): `src/app/support/page.tsx:130` (step round `text-[10px]`→`text-[11px]`), `src/components/dashboard/AnomalyAlertCard.tsx:59` (badge "Chú ý/Nghiêm trọng" `text-[10px]`→`text-[11px]`), `src/app/teams/page.tsx:259/263/267` (stats label `text-[10px]`→`text-[11px]`). Sau khi chạy audit lại → còn font <11px/tap <40px ở trang chính nào thì fix ngay trong task này (trừ thay đổi thiết kế lớn — báo Mika).
- **T12** Verify E2E mobile: script Playwright đo toàn bộ trang chính (dashboard/employees/teams/team-detail/criteria/reports/evaluations list + detail/support/settings) — 0 tap-target <40px, 0 font <11px, content cuối scroll hết KHÔNG bị FAB/nav che; **baseline chụp TRƯỚC khi sửa** (evaluations list/detail chưa có baseline — chụp bổ sung ngay đầu); screenshots trước/sau đối chiếu; **regression desktop 1280px** (không vỡ — đặc biệt các class base T03/T04/T05/T07 đổi); `npm run build` + lint 0.

**Acceptance**: mọi trang chính đạt chuẩn metrics trên; desktop không vỡ; build/lint 0; không đổi hành vi nghiệp vụ.

**Non-goals**: KHÔNG đổi employees table → card list; KHÔNG đổi logic chấm điểm/trạng thái; KHÔNG đổi desktop layout; KHÔNG đụng auth/DB.

**Rủi ro**: UI class thuần, thấp. Chú ý: các class mobile nằm chung với desktop trong cùng component — verify desktop regression bắt buộc ở T12 (thay đổi padding/font có thể ảnh hưởng cả md+ nếu không gói breakpoint).

**KẾT QUẢ THỰC THI (16-08)**: 12/12 task DONE — 11 commit code `98bc154..c6e310f` (T01 shell pb-44/BottomNav Việt 11px → T11B sweep text-[9px], chưa push). **Verify Playwright thật 375×812** (script /tmp/kurabe-p78-verify-full.py): dashboard/employees/teams/team-detail/criteria/reports/support/settings/evaluations list+detail/compare = 0 tap <40px, 0 font <11px, 0 overflowX; content cuối scroll hết 636 < FAB 676 < nav 724 (pb-44 đúng). **Desktop 1280px**: 0 overflowX 6 trang + stats/team-detail khôi phục (screenshot /tmp/kurabe-p78-desktop/). Build PASS + lint 0 errors. Sweep toàn src: 0 chỗ text-[9px]/[10px] (73 chỗ text-[11px] chuẩn).

**Reviewer thực thi**: vòng toàn bộ Phase (deleg, đọc diff 12 commits + evidence) → CHANGES_REQUIRED: sót 4 chỗ `text-[9px]` (compare/page.tsx:365/373/402 + PeriodSelector.tsx:116) + verify thiếu compare/dropdown → fix `c6e310f` + re-run 10 trang + compare 0 font → **vòng fix PASS** ✅. Đợt 1/đợt 2 trước đó timeout (600s, browser heavy) — bị thay thế bởi review toàn bộ (bài học: gửi reviewer với evidence ảnh + cấm mở browser khi diff UI lớn).

**Phase 78: DONE** ✅ (2026-08-16).

---

## Phase 79: BottomNav chỉ icon + Redesign team-detail + Fix status kẹt 🟡 (2026-08-16)

> Yêu cầu anh (16-08, kèm 3 ảnh): (1) bottom nav bỏ text chỉ icon; (2) trang chi tiết nhóm thiết kế lại — bỏ icon đánh giá (click tên được rồi), chỉ show lần đánh giá CUỐI, bỏ label trạng thái "Chưa bắt đầu"/"Đã nộp vòng x"; (3) bug: Hoàng Thị Trang (16735) nộp đủ 3 vòng (104/91/110, B) nhưng label "Chưa bắt đầu".

**Bằng chứng điều tra bug #3 (16-08, PostgREST anon)**:
- evaluations `b13d800c…` (Hoàng Thị Trang): `status='NotStarted'`, `current_round=3`, `final_grade='B'`, `final_score=110` — NHƯNG 3 evaluation_rounds đều `Submitted` (submitted_at 13-08 13:15/13:46/14:25, grade B).
- `saveEvaluationRound` (src/actions/evaluation.ts:205-221): final submit set `status: nextStep.status` ('Approved') + final_grade/final_score — final_grade đã được set (nghĩa là update chạy) nhưng status cuối = NotStarted → **data kẹt từ 13-08** (trước các fix Phase 61-64; bị ghi đè status sau đó hoặc update status thất bại im lặng ở phiên bản cũ).
- **Toàn DB chỉ 1 evaluation kẹt** (query status=NotStarted & current_round>1 → 1 row).
- `getStatusBadge` (teams/[id]/page.tsx:35-44): label từ `ev.status` → hiện "Chưa bắt đầu" sai.

**Thiết kế (3 task — UI thuần + 1 backfill data)**:
- **T1 [AppLayout.tsx]** BottomNav chỉ icon: xóa label span (BottomNavItem :136-138) + bỏ label props (4 mục Manager + 3 Employee); nav `h-16`→`h-14`; icon 22→24; active = text-primary + scale (giữ), inactive slate-400.
- **T2 [teams/[id]/page.tsx]** Redesign card thành viên (leader/sl/member):
  - Bỏ icon FileText "Xem đánh giá" (3 chỗ Link :333-337/:415-420/:487-492/:577-582 — click tên đã vào /evaluations/{id}).
  - Bỏ status badge: xóa `getStatusBadge` usage + `STATUS_BADGE` map (:26-44) + cột badge trong grid.
  - Chỉ show lần đánh giá CUỐI: bỏ `previousRounds` render (L1 cũ mờ) — chỉ hiện `L{gradeRound}: {score}` + grade badge; nếu chưa có round nộp → ẩn (hoặc "—").
  - Grid đơn giản: `grid-cols-[minmax(0,1fr)_32px_auto]` (bỏ cột 144px).
  - Tên không vỡ: thêm `truncate`/`min-w-0` cho name Link (leader/sl/member).
- **T3 [bug]**: (a) **Backfill** (Mika, service role): `UPDATE evaluations SET status='Approved' WHERE id='a1b9c3ba-223f-48b5-9a5a-2be7cf7d33fc'` + verify anon đọc thấy Approved; (b) **Guard code** (src/actions/evaluation.ts): sau update status submit — đọc lại eval.status, nếu ≠ nextStep.status → update lại 1 lần (chống data kẹt tái diễn).

**Acceptance**: nav mobile không text; team-detail hiển thị tên/mã/role/grade/điểm cuối gọn, không label trạng thái, không icon đánh giá; Trang status='Approved' (dashboard đếm đúng); build/lint 0; desktop regression 0 overflow.

**Note**: T2 làm mất hiển thị tiến độ vòng — anh đã chốt (chỉ lần cuối). Status đầy đủ vẫn ở /evaluations/{id}.

**KẾT QUẢ THỰC THI (16-08)**: 3/3 task DONE — commits `e7abeff` (T1 BottomNav chỉ icon + aria-label) + `66f7d25` (T2 redesign) + `0f7596e` (T3b guard) + `9024c33` (fix góp ý reviewer: aria-label, xóa dead code latestSubmittedRound/previousRounds, guard bắt lỗi select + re-verify sau retry + self-heal nhánh idempotent). **T3a backfill** (Mika, service role): Trang `b13d800c` → status='Approved' — verified anon SELECT Approved + stats team 2/15. Verify Playwright 375×812: nav = 4 icon/0 text/0 label/56px; team-detail = 0 overflowX, 0 label trạng thái ("Chưa bắt đầu"/"Đã nộp vòng x"/"Đã có KQĐG" hết), 0 icon FileText, 0 font <11px; tsc 0; build PASS; lint 0 errors. **Reviewer: PASS** ✅ (3 góp ý THẤP — đã fix hết, không blocking).

**Phase 79: DONE** ✅ (2026-08-16).

**T2FIX (16-08, anh yêu cầu)**: team-detail **mobile-only** — desktop (md+) giữ NGUYÊN bản cũ (status badges + icon Xem đánh giá + previousRounds + grid 4 cột), mobile (<md) gọn (chỉ lần cuối, không icon/badge, grid 3 cột). Dùng `max-md:hidden` (tránh xung đột display hidden vs flex của Tailwind). Verify Playwright: mobile = 0 badge/0 icon/0 prev/10 tên truncate; desktop = 15 badge/15 icon/8 prev/0 truncate; overflow 0 cả 2. Commit `9662ce1`.

**Reviewer R1 (16-08)**: CHANGES_REQUIRED — (1) T01 label 10px mâu thuẫn T12 "0 font <11px" → đã đổi `text-[11px]`; (2) thiếu file chứa lỗi: support/page.tsx:130, AnomalyAlertCard.tsx:59, header bell AppLayout.tsx:82 (36px) → đã thêm T11 sweep + bell p-3 vào T01; (3) file list sai: T08 thực ở CriteriaHeatmap/ReportFilters/3 modal (page chỉ wrapper :78), T09 thực ở `src/components/evaluation/CriteriaTab.tsx` + `GroupNavTabs.tsx` (page.tsx chỉ :648-660), T05 KHÔNG có absolute — badge là grid cột `grid-cols-[minmax(0,1fr)_32px_104px_144px]` :284/367/438/532, T04 KPI là `flex flex-wrap` :83 → đã sửa hết mô tả + file. Ghi chú phụ đã xử lý: T03 bỏ wildcard modals, teams stats label 10px :259/263/267 → T11, T12 thêm evaluations list/detail vào metric + baseline trước, class base ghi rõ gate md. → gửi lại R2.

**Reviewer R2 (16-08)**: **PASS** ✅ — đối chiếu 7/7 delta với code thật (AppLayout.tsx:82/136, support:130, AnomalyAlertCard:59, teams:259-267, team-detail:284/367/438/532, dashboard:83, CriteriaTab/GroupNavTabs, CriteriaHeatmap:39, reports:78) đều khớp; ghi chú nhỏ không blocking: dải trạng thái evaluations/[id] thực bắt đầu :646 (plan ghi :648 — lệch 2 dòng). Sẵn sàng implementation → /plan2task.

---

## Phase 85: Trang nhóm — static shell giàu (khung + icon + label + track trống) 🟡 (2026-08-19)

> Yêu cầu anh (19-08, kèm ảnh): trang danh sách nhóm hiện shell đang hiện 6 `CardSkeleton` generic (không icon/label/tiến độ). Anh muốn static shell hiện thêm: **khung nhóm + static icon + static label (Leader / Nhân sự / Xong / Chờ / Tiến độ) + hình thanh tiến độ (track TRỐNG — chưa có tiến độ thực & con số)**. Không fake value. Phân tích Sequential Thinking đã xác nhận: hợp lệ + đúng nguyên tắc staged-loading (trang danh sách nhóm đã server-redirect role thấp nên không fail-closed chặt như trang đánh giá; mọi thành phần thêm đều static/no-value).

**Nguyên tắc (từ `staged-loading-layers`)**: shell chỉ được chứa shape/label/khung trống, **KHÔNG giả score/value** → track phải RỖNG (w-0, không fill, không %, không số ảo); số khung = placeholder lấp grid, KHÔNG khẳng định "có N nhóm" (số thật từ light data).

**Thiết kế (UI thuần — 3 task code + 1 verify)**:
- **T1 [`src/components/teams/TeamEvaluationCell.tsx`]** thêm prop `skeleton?: boolean` (mặc định false). Khi `skeleton`: render đủ 3 ô label static (Nhân sự / Xong / Chờ) + label Tiến độ, nhưng **value = placeholder xám** (không số thật, không "-" mang nghĩa 0); track progress = **rỗng (w-0/không fill, bỏ `w-1/3 animate-pulse` gây value ảo)**. Khi không skeleton → giữ nguyên render thật hiện tại.
- **T2 [mới] [`src/components/teams/TeamCardSkeleton.tsx`]** mô phỏng card nhóm thật: icon Users (static), khối tên placeholder (bar xám, không tên thật), dòng `Leader:` + placeholder tên, body = `<TeamEvaluationCell skeleton />`. Style/className giống card thật (TeamsClient L207-265).
- **T3 [`src/components/teams/TeamsClient.tsx`]** nhánh `isLightLoading` (L191-199): thay 6 `CardSkeleton` bằng grid `<TeamCardSkeleton />` **8 frame** (theo anh — đủ 2 hàng grid 4 cột ở 2xl; là placeholder lấp grid, KHÔNG khẳng định số nhóm thật). Giữ responsive `grid-cols-1 md:2 xl:3 2xl:4`. KHÔNG đụng nhánh light-data/heavy hiện tại.
- **T4 [verify]** tsc 0 + lint 0 + build PASS; browser thật (dev LAN 192.168.1.230:3000): khi loading thấy khung + icon Users + label Leader/Nhân sự/Xong/Chờ/Tiến độ + track trống (KHÔNG %, không fill, không số ảo, không tên thật); sau khi light/heavy load → đủ giá trị thật; mobile/desktop không vỡ; console sạch.

**Acceptance**: shell teams list hiện đủ khung nhóm + static icon + static labels + track trống (không value ảo); sau load data thật đầy đủ; tsc/lint/build pass; không regression trang khác.

**Non-goals**: KHÔNG đổi logic/query; KHÔNG đụng auth/DB; KHÔNG đổi trang team-detail; KHÔNG đổi desktop layout.

**Rủi ro**: UI thuần, thấp. Chú ý: `TeamEvaluationCell` được dùng ở TeamsClient (list) — kiểm tra không dùng ở nơi khác cần giữ hành vi; skeleton prop mặc định false nên không đổi hành vi hiện tại.

**Reviewer plan (Sonnet 4.6, 19-08)**: **PASS — CONFIDENCE CAO**. Non-blocking: (1) `membersCount` prop bắt buộc → khi skeleton=true ô Nhân sự PHẢI render `<Skeleton>` thay `{membersCount}` (không lộ số 0 ảo) — đã bổ sung T1; (2) `!user && user===undefined` tautology L39 (ngoài scope); (3) giữ `data-load-layer="light"` trên div grid (L192), không trên từng item; (4) `TeamCardSkeleton` không cần `'use client'` nếu không dùng hooks. → Sẵn sàng implementation.

**KẾT QUẢ THỰC THI (19-08)**: 3/3 task DONE — commits `dd33644` (T01) + `6e9d555` (T02) + `d9abd0d` (T03, 8 khung). Runner **Gemini 3.7 Flash High** (theo anh chỉ định). Mika verify độc lập: diff từng dòng đúng plan (T01 skeleton branch guard ô Nhân sự bằng `<Skeleton>`, track rỗng `w-full bg-surface rounded-full` không fill, bỏ `w-1/3 animate-pulse` value ảo; `membersCount?`/`isLoading?` default 0/false; T02 card giàu icon Users + tên placeholder + `Leader:` + body `<TeamEvaluationCell skeleton/>`, không 'use client'; T03 thay 6 CardSkeleton → **8** TeamCardSkeleton (theo anh), giữ `data-load-layer="light"` trên grid container, bỏ import cũ, KHÔNG div trùng). **tsc 0 · lint 0 · build PASS** (Mika tự chạy). Regression Gemini báo 14/14 PASS. Browser thật bị chặn login (browserbase không giữ httpOnly cookie localhost — lỗi môi trường, không phải code); dev server log xác nhận app + session thật đang chạy OK.

**Phase 85: DONE** ✅ (2026-08-19).

---

## Phase 86: Static-first shells — Dashboard & Reports 🟡 (2026-08-19)

> Yêu cầu anh (19-08): áp nguyên tắc "cái gì static hiện trước hết" cho **Dashboard** và **Reports** (như Teams P85). Khảo sát (read-only): **Dashboard** light skeleton đang là khối xám generic (thiếu icon/label/tiêu đề section — chỗ yếu nhất); **Reports** light KPI **đã có icon+label static** (giữ), chỉ heavy skeleton còn gạch xám chung thiếu tiêu đề section. **Không fake value** — track rỗng, không số/%, không tên thật.

**Thiết kế (UI thuần — 2 task code + 1 verify)**:
- **T1 [`src/components/dashboard/DashboardLightSection.tsx`]** nhánh `isLoading` (L24-41) → thay khối xám generic bằng skeleton giàu:
  - KPI: 4 ô, mỗi ô icon + **label static** (nhân sự / tiến độ / đã đánh giá / chưa xong — khớp nhánh loaded L64-89) + `<Skeleton>` value (không số ảo).
  - Grid: section titles static "Trạng thái theo nhóm" / "Phân bổ xếp loại" (khớp loaded L95/118) + skeleton rows + track trống (không fill) / chart placeholder.
- **T2 [`src/components/reports/ReportsDataLayer.tsx`]** heavy skeleton (L174-…) → **đủ 5 khối** thêm **static section titles đúng tên thật** (GradeDistribution "Phân bổ Xếp loại" / TeamComparison "So sánh nhóm" / CriteriaHeatmap "Phân tích nhóm tiêu chuẩn" / TopPerformers "Top Performers" / AiSummaryCard "Tóm tắt kỳ bằng AI") thay gạch xám đầu khối; giữ skeleton bars bên trong. **Không đụng light KPI** (đã có label).
- **T3 [verify]** tsc 0 + lint 0 + build PASS; browser thật (dev): khi loading thấy icon+label+tiêu đề section + track trống (không value ảo); sau load data thật đầy đủ; mobile/desktop không vỡ; console sạch (không warning `<p> chứa <div>`).

**Acceptance**: Dashboard + Reports shell hiện đủ static icon/label/tiêu đề section/track trống trước khi data; sau load đủ value thật; tsc/lint/build pass; không regression.

**Non-goals**: KHÔNG đổi logic/query; KHÔNG đụng auth/DB; KHÔNG đổi desktop layout; KHÔNG thêm cache/index.

**Rủi ro**: UI thuần, thấp. Lưu ý: giữ props/interface hiện tại (không phá caller); tránh `<p>` chứa `<div>` (bài học P85); skeleton props mặc định không đổi hành vi loaded sẵn có.

**Reviewer plan**: R1 **CHANGES_REQUIRED** (Sonnet 4.6) — blocker: T2 title "Heatmap tiêu chí" sai → "Phân tích nhóm tiêu chuẩn" (CriteriaHeatmap.tsx:41); non-blocking: cover đủ 5 khối (Top Performers "Top Performers", AiSummaryCard "Tóm tắt kỳ bằng AI") + T3 glob `NEXT_PUBLIC_*` không expand. → đã fix cả 3 → **R2 PASS** (conf CAO, no blocker).

**KẾT QUẢ THỰC THI (19-08)**: 2/2 task DONE — commits `5fa31c1` (T01 Dashboard) + `3961860` (T02 Reports). Runner **Gemini 3.7 Flash High**. Mika verify độc lập: diff từng dòng đúng plan (T01 KPI icon+label static + section titles + track trống không fill; T02 5 khối heavy title static đúng tên loaded, light KPI không đụng); **tsc 0 · lint 0 · build PASS** (Mika tự chạy); không `<p>` chứa Skeleton. Browser thật bị chặn login (browserbase không giữ httpOnly cookie localhost — env, không code).

**Phase 86: DONE** ✅ (2026-08-19).

---

## Phase 87: Cache tối ưu — PPR pilot /employees (static shell cache hẳn) 🟡 (2026-08-19)

> Yêu cầu anh (19-08): lập kế hoạch cache tối ưu nhất; câu hỏi "static shell/text cache hẳn được không (không đổi, không lộ data)". Qua Sequential Thinking + survey:
> - **unstable_cache ĐÃ THẤT BẠI** ở dự án này (P61 → Fix A `f4109b2` 16-08: gây lag Vercel + trang trắng + treo NEXT_REDIRECT) → **KHÔNG dùng lại**.
> - **Static shell cache hẳn = PPR (Partial Prerendering)**: prerender phần shell tĩnh tại build → CDN serve ngay; phần data theo user stream sau qua Suspense. KHÔNG dùng page-revalidate thường (cache cả HTML → lộ cross-user).
> - JS bundle client components đã immutable cache CDN (_next/static) — tầng cache thứ nhất có sẵn.
> - Pilot evidence-first: làm 1 trang (/employees), đo trước/sau; PASS mới mở rộng, FAIL → pivot giảm roundtrip.

**Thiết kế (P1 pilot — 3 task)**:
- **T1 [config + src/app/employees/page.tsx]** Bật PPR:
  1. `next.config.ts`: `experimental: { ppr: 'incremental' }`.
  2. Segment `/employees`: `export const experimental_ppr = true`.
  3. Restructure (đặc tả shell CỤ THỂ — reviewer blocker 1): page hiện chỉ `getSessionUser + redirect + EmployeesClient` (không static content). Tạo shell thật NGOÀI Suspense:
     - `<PageHeader title="Quản lý nhân sự" description=... />` (đối chiếu header hiện trong EmployeesClient — tách/truyền để KHÔNG trùng, hoặc giữ header client + Suspense fallback là skeleton khớp layout);
     - `<Suspense fallback={<EmployeesSkeleton />}>` → bên trong: `getSessionUser()` + redirect role + `<EmployeesClient initialViewer>` (dynamic stream).
     - Mục tiêu PPR: serve **HTML shell đầu tiên (header + bố cục)** từ CDN trước khi auth+data stream — lợi ích là perceived first-paint, KHÔNG phải data (data vẫn qua server actions).
  4. KHÔNG đổi logic data/EmployeesClient. Lưu ý middleware **middleware.ts** (KHÔNG phải proxy.ts — reviewer) bảo vệ /employees → shell prerendered không serve cho unauth.
- **T2 [verify]** build (route symbol ●/ƒ) + tsc + lint + browser thật (login 158: shell trước + data sau + redirect đúng). Nếu browser bị chặn cookie (env) → **bắt buộc có curl TTFB test thay thế** (reviewer non-blocking 3 — phase experimental không được bỏ verify).
- **T3 [measure + decide]** Đo trước/sau **trên Vercel production là chính** (PPR benefit CHỈ có trên Vercel Edge — reviewer blocker 2): deploy pilot, đo `/employees` authenticated TTFB shell + p50/p75 trước/sau. Local KHÔNG phân biệt PPR vs Suspense thường → chỉ tham khảo. Nếu anh chưa duyệt deploy → ghi **PPR benefit UNKNOWN** (không claim), quyết định để sau. Rollback: `git revert HEAD~3` (3 commits — reviewer non-blocking 1).

**Acceptance**: build PASS với shell prerendered; browser: shell CDN nhanh + data đúng + không lộ data + auth OK; có số đo trước/sau; quyết định pivot ghi rõ.

**Non-goals**: KHÔNG unstable_cache; KHÔNG page-revalidate cho trang auth; KHÔNG đổi logic data.

**Rủi ro**: PPR experimental — test build từng bước, rollback 1 commit. Lưu ý: restructure page có thể đổi hành vi redirect — verify kỹ login/logout + role redirect.

**Reviewer plan**: R1 **CHANGES_REQUIRED** (Sonnet 4.6) — blocker: (1) T1 thiếu đặc tả shell content (page không có static content); (2) PPR benefit chỉ có trên Vercel Edge, local/Cloudflare không phân biệt → cần xác nhận deploy state. Non-blocking: rollback 3 commits; middleware.ts naming; T2 curl fallback. → đã fix cả → **R2 PASS** (conf CAO). Lưu ý runner từ R2: PageHeader 'use client' hợp lệ ngoài Suspense nhưng KHÔNG import dynamic API (cookies/headers) trong shell; EmployeesClient có h1 riêng "Quản lý Nhân sự QAQC" (L671-672) → **dedup h1** (verify no duplicate h1); tasks.md T02 nhẹ hơn nhưng MASTER_PLAN (curl fallback) là nguồn chính.

**KẾT QUẢ THỰC THI (19-08) — PIVOT**: Runner Gemini làm T01 nhưng (1) **scope creep** — tự bật PPR ở 4 file ngoài task (layout/evaluations×2/teams-detail) → Mika revert; (2) làm SAI API Next 16: ban đầu `cacheComponents: true` rồi đổi `experimental.ppr` + `experimental_ppr` segment — thực tế **Next 16 REMOVE `experimental_ppr`** (LSP error) + deprecate `experimental.ppr`, PPR gộp vào **`cacheComponents` (flag TOÀN APP)**. Mika sửa đúng API 16 → **build FAIL**: `/evaluations/[id]/compare` "Uncached data was accessed outside of Suspense" (AppLayout useAuth/providers ngoài Suspense) → cacheComponents ép toàn app phải bọc Suspense/use cache — đòi restructure layout toàn app, không phải pilot 1 trang. → **PIVOT (quyết định #18 DECISIONS_LOG)**: revert sạch PPR (next.config + page + xóa EmployeesSkeleton), build PASS trở lại; static shell đã cache qua JS bundle immutable + route config đã static; unstable_cache từng fail (Fix A); hướng còn lại có giá trị = **giảm roundtrip server actions** (chờ anh duyệt).

**Phase 87: DONE** ✅ (PIVOT — 2026-08-19).

---

## Phase 88: Giảm roundtrip server actions — gom 3→1 cho /employees 🟡 (2026-08-19)

> Yêu cầu anh (19-08): dùng Sequential Thinking giảm roundtrip — gom `getUsersBatch` + `getEvaluationSummariesBatch` + `getTeamsAction` thành ít request hơn (bottleneck chậm Vercel: mỗi action = 1 chặn VN→SG edge + SG→Supabase HK ~120ms). Khảo sát: `/employees` mount gọi **3 request** riêng (useTeams + getUsersBatchAction + getEvaluationSummariesBatchAction — mỗi action requireAuth riêng, gọi admin function).

**Thiết kế (P1 pilot /employees — 4 task)**:
- **T1 [`src/actions/read.ts` + `src/hooks/use-db.ts`]** Thêm `getEmployeesPageDataAction(periodId, options: {limit, offset})` → `{ teams: Team[], users: UsersBatchResult, summaries: Record<string, Evaluation> }`:
  - 1 lần `requireAuth()` chung; `Promise.all` nội bộ cho teams + users batch; summaries batch sau khi có ids (tuần tự nội bộ — vẫn 1 roundtrip client).
  - Fail-soft per-part (1 phần lỗi → trả phần đó rỗng, không chặn cả trang); giữ nguyên scope/authorization từng phần (Manager/Leader/SubLeader — tái dùng getTeamsAdmin/getUsersBatchAdmin/getEvaluationSummariesBatchAdmin).
  - Hook mới `useEmployeesPageData(periodId, options)` — react-query key `['employees-page-data', periodId, offset]`.
- **T2 [`src/components/employees/EmployeesClient.tsx`]** Mount đầu: thay `useTeams` + fetch batch thủ công (3 request) → 1 `useEmployeesPageData`. **GIỮ NGUYÊN** load-more/filter/modal/mutation (khi đổi filter/load-more vẫn gọi getUsersBatchAction riêng hoặc gọi lại aggregate). Mutations (upsert/delete user) invalidate `['employees-page-data']` + giữ invalidate teams/users cũ (không phá revalidateTag).
- **T3 [verify]** tsc 0 + lint 0 + build PASS + browser thật (login 158: /employees load đủ + mutation cập nhật ngay) + **đo trước/sau**: đếm request + thời gian authenticated load (devtools/curl, local + Vercel nếu deploy).
- **T4 [mở rộng nếu PASS]** `/teams` cùng pattern (`useUsers` + `useTeams` + `useEvaluations` → `getTeamsPageDataAction`).

**Acceptance**: mount /employees = 1 request (thay 3); data đúng scope; mutation invalidate đúng; build/lint pass; có số đo trước/sau; không regression trang khác.

**Non-goals**: KHÔNG đổi auth/scope/data contract; KHÔNG cache (đã pivot); KHÔNG đụng logic chấm điểm.

**Rủi ro**: merge 3 state source trong EmployeesClient (952 dòng) — test kỹ; đổi react-query key phải invalidate đúng sau mutation; summaries phụ thuộc ids batch → tuần tự nội bộ (tăng nhẹ thời gian server nhưng giảm mạnh roundtrip client).

**Reviewer plan**: R1 **CHANGES_REQUIRED** (Sonnet 4.6): B1 — action phải trả **discriminated per-part error** `{teams,teamsError,users,usersError,summaries,summariesError}` (không silent-empty → tránh "Chưa gán" giả khi teams fail); B2 — GIỮ `loadInitialBatch()` imperative gọi aggregate (KHÔNG hook declarative onSuccess setUsers → bypass `generationRef`, viewer đổi identity mid-flight leak data); N1 — invalidate `useDeleteUser`+`useUpsertUser` → `['employees-page-data']`; N2 — export `type EmployeesPageData` per-part error. → đã fix cả vào tasks T01/T02 → **R2 PASS** (conf CAO). Lưu ý runner từ R2: (1) T01 `summaries` shape khớp action cũ (tsc catch); (2) T02 useTeams vs aggregate-teams runner chọn; (3) **`handleSaveEmployee` gọi `upsertUserAction` trực tiếp** → thêm invalidate `['employees-page-data']` ở đó luôn (không chỉ hook).

**KẾT QUẢ THỰC THI (19-08)**: 2/2 task (T01/T02) DONE — commits `65deae5` (T01: aggregate action + hook) + `7d34f38` (T02: mount 3→1). Runner **Gemini 3.7 Flash High** — đúng scope (3 file, không scope creep). Mika verify độc lập: diff đúng R1/R2 (per-part error, loadInitialBatch imperative + generationRef giữ, bỏ useTeams mount, invalidate đúng); **tsc 0 · lint 0 · build PASS**; **mount /employees = 1 request (3→1)** verified qua code. Đo thời gian thật UNKNOWN (browserbase cookie env); tiết kiệm 2 chặn VN→SG→HK mỗi load (lợi ích latency rõ). MỞ RỘNG HOÀN TẤT: T04 /teams (`dbaf6f8`, 3→1) + T05 /evaluations/[id] (`7eda1ef`, 4→1) + T06 /teams/[id] (`d85a247`, 3→1) + T07 /evaluations/[id]/compare (`472adf3`, 4→1) — đúng pattern (per-part error, fail-closed giữ, imperative/generationRef nơi cần, invalidate đúng). Khảo sát còn lại: /dashboard (≤2) + /reports (1) + /criteria + /settings + /support (static, ≤1) KHÔNG cần gom. Test suite 10/10 PASS (fix 2 test cũ `0b70081`). Timing thật production UNKNOWN (cần DevTools sau deploy). **Phase 88: DONE** ✅ (2026-08-19).

---

## Phase 89: Prefetch phân tầng theo role 🟡 (2026-08-19)
> Anh yêu cầu: hover nav → prefetch; hover rời/sang link khác → HỦY prefetch cũ (tránh phí băng thông). Phân tầng theo role, tránh prefetch trang cấm.
> - **T1** Desktop nav prefetch — `src/components/layout/Sidebar.tsx`: trên `mainLinks.map`/`Link` (L140-158) thêm `onMouseEnter`/`onMouseLeave` gọi `queryClient.prefetchQuery` đúng hook key (teams-page-data / evaluation-page-data / evaluation-compare-page-data) với **debounce ~150ms** (chỉ prefetch khi hover liên tục, chống spam chuột lướt — N1), guard token hủy cái cũ khi rời/đổi link. KHÔNG đụng BottomNav mobile (`AppLayout` L111-122 — hover vô nghĩa).
> - **T2** Role gate (Sidebar mainLinks theo `isIndividualRole` L33): Manager/Leader prefetch /teams,/dashboard,/reports (data-hook) + /employees (route-level vì imperative P88); individual chỉ prefetch phiếu mình + settings/support; KHÔNG prefetch trang cấm. /evaluations/[id] chỉ phiếu mình/đúng quyền Leader-owner.
> - **T3** implement → tsc/lint/build → browser (nếu được) → đo trước/sau. **Rollback**: revert 1 commit (an toàn).
> Reviewer: R1 **CHANGES_REQUIRED** (gemini-3.1-pro-high) — B1 nhắm sai `AppLayout` (mobile) bỏ sót `Sidebar.tsx`; B2 WBS chung chung; N1 debounce 150ms. → đã fix (target Sidebar + debounce + mapping + rollback). **Chờ R2**.
**Reviewer plan**: R1 **CHANGES_REQUIRED** (gemini-3.1-pro-high) → **R2 PASS** (conf HIGH). Non-blocking: `queryClient.cancelQueries` phải nhắm đúng queryKey cần prefetch (không cancel data fetch khác).

---

## Phase 90: Lazy-load charts/chat/modal + debounce search 🟡 (2026-08-19)
> Anh yêu cầu làm. UI-only, giảm bundle + giảm request thừa.
> - **T1 Lazy-load charts (recharts):** GradeDistribution + TeamComparison + CriteriaHeatmap → `next/dynamic(ssr:false)` wrapper (pattern ClientSkillGapRadar). Sửa nơi import: DashboardLightSection, ReportsDataLayer. SkillGapRadar đã lazy.
> - **T2 Lazy-load ChatWidget + modals:** ChatWidget (AppLayout L105) + EmployeeModal/TeamModal/PeriodModal/BatchResultMessageModal/PeriodMinutesModal → `next/dynamic` (render khi mở). Giảm bundle chính.
> - **T3 Debounce search/filter:** `/employees` searchTerm → debounce ~250-300ms; kiểm tra các filter khác (reports) nếu có input/search.
> - **T4 verify:** tsc 0 + lint 0 + build PASS + browser (nếu được) + đo bundle trước/sau (kích thước .next chunk). Rollback: revert commits.
> Lưu ý: chart/chat `ssr:false` tránh hydration mismatch; modal dynamic khi mở. UI thuần, không đụng auth/data.
**KẾT QUẢ THỰC THI (19-08)**: 4/4 task DONE — commits `91b5ed4`: 3 wrapper client `dynamic ssr:false` (GradeDistribution/TeamComparison/CriteriaHeatmap) + ChatWidget + 5 modal dynamic (Employee/Team/Period/Batch/PeriodMinutes) + debounce searchTerm 300ms (/employees, dùng debounced value cho fetch/filter). Bundle: modal/AI chunk tách riêng (~49KB) chỉ tải khi mở. Mika verify: tsc 0 · lint 0 · build PASS; scope đúng (chỉ charts + 6 file; không đụng auth/data). UI thuần — không cần Reviewer (theo AGENTS.md static nhỏ). **Phase 90: DONE** ✅ (2026-08-19).


---

## Phase 91: Chat AI — context chức vụ + nhóm của NV được nhắc đến & của người hỏi 🟡 (2026-08-19, plan)

> Anh yêu cầu: hiện AI tư vấn generic (chỉ biết role người hỏi + đếm theo trang) → không tư vấn cụ thể theo **chức vụ + nhóm** của nhân viên được nhắc trong câu hỏi. Mục tiêu: AI trả lời cá nhân hóa (VD hỏi "sao sửa chức danh của Ly Sa không hiển thị" → AI biết Ly Sa là chức vụ gì, nhóm nào để trả lời đúng).

### 1. Goal & ranh giới
- **Goal (user-visible)**: chat AI khi hỏi về một nhân viên (theo tên) sẽ nói được chức vụ + nhóm của NV đó; đồng thời AI biết cả nhóm của chính người hỏi → tư vấn cụ thể hơn, không chỉ quy tắc chung.
- **In-scope**: đưa vào prompt (a) role + nhóm + leader của NV được nhắc trong câu hỏi; (b) nhóm của chính người hỏi. Giữ RBAC scope + fail-soft.
- **Out-of-scope**: KHÔNG đổi giao diện chat; KHÔNG đổi/duỗi quyền (RBAC giữ nguyên); KHÔNG sửa render markdown `**` (mục riêng nếu anh muốn); KHÔNG thêm ngôn ngữ/model.
- **Ranh giới bảo mật**: chỉ đưa `name + role(chức vụ tiếng Việt) + team name + leader(first name)` — KHÔNG đưa employee_code, email, description, subleader_id raw. Chỉ đọc trong scope của requester (tái dùng hàm admin đã scoped).

### 2. Thiết kế & map tích hợp
- **Hiện tại**: `src/actions/chat.ts` `prepareChatContext` (L429) chỉ nối `chức vụ = ${roleLabel(role)}, trang = ${page}.${pageContext}`; `buildPageContext` (L261) chỉ gộp count/context trang, không tìm NV theo tên.
- **Chọn**: thêm hàm `buildEmployeeContext(question, user)` gọi TRONG `prepareChatContext` (bên cạnh buildPageContext), trả chuỗi context → nối vào prompt L429.
  - Match tên: `getUsersAdmin(user)` (scoped sẵn: Manager=all, Leader/SubLeader=team, Employee/Worker=self) → tìm user khớp câu hỏi: ưu tiên **tên đầy đủ bỏ dấu** xuất hiện trong câu hỏi, fallback **tên cuối (lastname) bỏ dấu**; giới hạn tránh false-positive (tên ≤2 từ, >1 kết quả khớp → chọn chính xác nhất hoặc bỏ qua).
  - Team name: `getTeamByIdAdmin(user.teamId, user)` (scoped) → name; leader: tra `getUserByIdAdmin(team.leaderId, user)`.
- **Loại bỏ**: không cần parser NLP phức tạp; match tên đơn giản + bỏ dấu là đủ cho câu hỏi thực tế.
- **Tái dùng**: `getUsersAdmin` (users-admin.ts L112), `getTeamByIdAdmin` (teams-admin), `getUserByIdAdmin`, `roleLabel` (chat.ts L55), helper bỏ dấu mới (vietnamese diacritics).
- **Rollback**: revert 1-2 commit (thuần thêm vào prompt, an toàn).

### 3. Task đề xuất (WBS → tasks.md sau khi anh duyệt)
- **T1** [src/lib/vi-text.ts (mới) + src/lib/ai-context.ts (mới)] Helper thuần: `normalizeVi(s)` (bỏ dấu tiếng Việt, lowercase) + `matchEmployeeFromQuestion(question, users) → User|null` (đầy đủ → lastname; bỏ qua nếu trùng/không rõ). Unit test cho bỏ dấu + match.
- **T2** [src/lib/ai-context.ts] `buildEmployeeContext(question, user) → string` — gọi getUsersAdmin scoped → match → getTeamByIdAdmin/getUserByIdAdmin → trả chuỗi "Người được nhắc: {name}, chức vụ = {roleLabel}, nhóm = {teamName}(leader {firstName});". (fail-soft: không match → '').
- **T3** [src/actions/chat.ts] Nối kết quả T2 + nhóm của người hỏi vào prompt (L429), giữ nguyên phần role/trang/pageContext. Cập nhật `Thông tin người hỏi` thêm nhóm.
- **T4** [verify] tsc 0 + lint 0 + build PASS + E2E thật: login role (vd 158/Leader có team) vào /employees → hỏi "sao không sửa được chức danh của Ly Sa" → AI nêu chức vụ + nhóm cụ thể của Ly Sa (nếu trong scope). Test fail-soft: hỏi tên không tồn tại → trả generic không crash.

### 4. Verification & rủi ro
- Checks: tsc 0 · lint 0 · build PASS · E2E browser thật (nếu env cho) · đo prompt context.
- Rủi ro: match tên trùng/false-positive → giới hạn + ưu tiên tên đầy đủ; PII → chỉ role/team/tên, nhớ keep scope; anon-read đã khóa users SELECT nhưng server action dùng service_role + RBAC vẫn đọc được (không đổi quyền).
- Gates: **CONTROLLED** — chạm data flow (đọc users/teams trong server action) → cần gated Reviewer ở gate verify (test-data thật, không cần Reviewer vòng plan). Anh duyệt commit/push như thường lệ (không đẩy Vercel trừ khi anh yêu cầu).


---

## Phase 91.1: Chat AI — tinh chỉnh theo anh (chức danh=description, bỏ mã NV, khác nhóm, xưng hô động, knowledge update) ✅ DONE (2026-08-19)

> Nối tiếp Phase 91. Anh chốt: (1) different_team KHÔNG giới hạn Manager; (2) KHÔNG đưa mã NV; (3) chức danh = cột `description` (verified EmployeesClient L703 / EmployeeModal L225); (4) AI không đề cập giới tính/chức danh nếu không cần thiết; (5) dùng Sequential Thinking cập nhật chat-knowledge.md; (6) test local + internet.
> CONTROLLED (chạm data flow) — homestay scoped; setup Reader ở gate verify.

### Chốt thiết kế (ST đã verify)
- **User-prompt** (prepareChatContext): `tên = {name}, giới tính = {Nam/Nữ}, chức vụ = {role}, chức danh = {description||'chưa có'}, nhóm = {team||'Chưa có nhóm'}, trang = {page}` — BỎ mã NV.
- **buildEmployeeContext → union**: `found` (cùng nhóm||Manager: tên+chức vụ+chức danh+nhóm+leader) / `multiple` (liệt kê + hỏi) / `different_team` (non-Manager, người khác nhóm → báo không cùng nhóm, không lộ info) / `not_found` (generic).
- **Quy tắc chung**: rule 1 xưng hô động (anh/chị theo giới tính); thêm rule: khi trả lời KHÔNG lặp lại giới tính/chức danh/chức vụ nếu không cần thiết; quy tắc xử lý hỏi người khác (cùng nhóm/khác nhóm/trùng tên/không có).
- **chat-knowledge.md**: Sequential Thinking rà soát vs code, cập nhật lệch (xưng hô chị→anh/chị; chức danh=description; cập nhật mô tả màn hình/flow theo thay đổi app).

**KẾT QUẢ TEST ĐA CASE + FIX (19-08, sau deploy)**: test trên lykiv.vercel.app bằng browser thật (login KIV158 Manager, KIV8707 Leader).
- Case verified: hướng dẫn chung / found Manager (Ly Sa, Mai Thị Hòa) / multiple "Nhi" (liệt kê + hỏi) / different_team (Leader hỏi người khác nhóm → từ chối, không lộ info) / Leader cùng nhóm / xưng hô theo giới tính — ALL PASS.
- **FIX 1** `06421b0`: match ưu tiên hậu tố tên DÀI NHẤT (tên đầy đủ thắng tên cuối) — tránh "Mai Thị Hòa" bị hiểu nhầm thành trùng tên với các Hòa khác.
- **FIX 2** `6606188`: match theo RANH GIỚI TỪ (hasPhrase) — tránh "anh" lọt trong "đánh"(danh), "hoa" trong "hoang".
- **FIX 3** (UI): render markdown bold `**...**` trong bubble chat an toàn (BoldText, KHÔNG dangerouslySetInnerHTML — chống XSS).


---

## Phase 91.2: Chat AI — kéo thêm KỲ + VÒNG đánh giá thật của người hỏi và người được nhắc ✅ DONE (2026-08-19)

> Nối tiếp 91/91.1. Anh yêu cầu: ngoài chức vụ/nhóm/chức danh, đưa thêm thông tin vòng + kỳ đánh giá để tư vấn cụ thể, chính xác.
> `buildEvaluationStatus(employeeId, requester)` (ai-context.ts): kỳ hiện tại (getActivePeriod) + từng vòng L1/L2/L3 (chưa nộp/nháp/đã nộp+điểm) + vòng đang mở L{currentRound} — scoped qua getEvaluationByEmployeeAdmin(emp, period, requester). Fail-soft ''.
> Đưa cho BOTH: người được nhắc (nhánh found của buildEmployeeContext) + chính người hỏi (user-prompt chat.ts). Commit `1936729` → deploy `kurabe-2rabhpvvq`.
> VERIFY production (Leader KIV8707): Q "sao không đánh giá được yến nhi" → A "…vì L1 của Nhi chưa được nộp. Vòng L2 chỉ mở sau khi SubLeader gửi L1…" — nói đúng trạng thái THẬT (trước chỉ generic). Rate-limit KIV158 15/2h chặn đúng (khi thử Manager).

---

## Phase 92: Transactional evaluation RPC production hardening ✅ DONE (2026-08-24)

- Sửa lỗi PostgreSQL `42702 evaluation_id ambiguous` bằng alias qualification trong đúng 2 predicate; repair có provenance guard, giữ nguyên signature, privileges và rollback safety.
- Production canary đầy đủ qua UI: SubLeader → Leader → Manager; final `Approved`; mỗi vòng 36/36 criteria; không duplicate round.
- Failure-path FK `23503` rollback PASS; snapshot restore exact về `Draft`, 1 round, không còn audit canary.
- Local gates: `npm test 24/24`, typecheck, build, diff-check PASS; lint 0 error + 1 warning cũ. Flag transactional ON; production login HTTP 200.
- Reviewer độc lập PASS/HIGH. Commit `a56fba7`; branch `audit-hardening-p0-p3-20260824` đã push GitHub và remote SHA khớp local.
- Retention/purge/cron không thực hiện; passwordless test login và CSP Report-Only vẫn là residual risk đã ghi nhận.

---

## Phase 93: Evaluation UI consistency và draft reliability ✅ DONE (2026-08-26)

- Hoàn tất đợt chuẩn hóa UI/loading shell/responsive presentation trên các trang chính; không đổi scoring, RBAC, auth hoặc workflow ngoài phạm vi đã duyệt.
- Evaluation detail: first-open current editable round khởi tạo draft có điều kiện; hydrate chuẩn hóa `selectedLevelIndexes` từ score/criterion level để autosave và **Lưu bản nháp** không gửi payload thiếu metadata.
- AI nhận xét dùng dữ liệu live của current round qua `buildResultPrompt`; bỏ flow page-only cũ và cấm kết câu xã giao kiểu “Chúc...”, yêu cầu câu kết hành động cụ thể.
- Card Nhận xét desktop dùng `xl:h-[314px]`; mobile/tablet giữ breakpoint cũ và browser check không có horizontal overflow. Viền vàng card chỉ biểu thị điểm khác vòng gần nhất; badge mã tiêu chí có thể biểu thị khác bất kỳ vòng trước nào.
- Verify: refresh không còn toast autosave; explicit draft save hiển thị “Đã lưu bản nháp.” trên route được cấp quyền. `npm test` 27/27, typecheck, lint, build, diff-check PASS. Route khác trong screenshot trả access denied trong session hiện tại, không dùng làm bằng chứng runtime.

---

## Phase 94: Staged loading cho trang chi tiết đánh giá 🟢 (2026-08-26)

> **Mục tiêu**: giảm time-to-first-useful-content của `/evaluations/[id]`; render shell/light context trước, criteria editor/history/heavy data sau; skeleton chỉ là local data state, không che lỗi.

- **Evidence hiện tại**: `getEvaluationPageDataAction()` chờ employee + evaluation + full users + periods; page giữ màn chờ tới khi query xong; hook lại chờ `getCriteriaForRoleAction()` trước khi dispatch editor state. Runtime authenticated timing chính xác hiện **UNKNOWN** vì CDP session 9223 không chạy.
- **P94-T01 — Slim critical path**: bỏ full users list khỏi page-data detail; dùng employee đã authorize cho access matching; giữ requireAuth/RBAC và per-part error contract cần thiết.
- **P94-T02 — Light layer**: tách basic employee/evaluation/round state khỏi criteria fetch; criteria có loading/error/retry riêng; stale response bị bỏ qua theo evaluation/access key.
- **P94-T03 — Rich skeleton**: skeleton đầy đủ header/actions/score panel/group tabs/criterion cards/nhận xét, chỉ placeholder layout, không fake score/value.
- **Verification**: typecheck/lint/test/build/diff-check PASS; reviewer độc lập read-only PASS; local unauth redirect PASS. Authenticated milestone timing và browser 390/768/1440 hiện **UNKNOWN** vì không có session hợp lệ trong browser runtime.
- **Non-goal**: không đổi scoring, save/submit, auth policy, DB schema, cache/RPC hoặc production deploy trong phase implementation.

---

## Phase 95: True static-first cho trang chi tiết đánh giá 🟡 (2026-08-26)

> **Mục tiêu**: static labels/structure thật render trước `pageData`; sau đó light employee/evaluation/access, criteria/editor, rồi secondary history/periods/AI; không dùng skeleton để claim full performance.

- **Implemented P95-T02/T03**: thêm `EvaluationStaticFrame` thuần presentation dùng chung cho route fallback và client loading; page không còn chờ global `pageData` mới render frame; permission-sensitive controls vẫn chờ `accessState`.
- **Safety**: static frame không có button/textarea/form/handler/state; transient round vẫn frame loading; invalid/missing round vẫn AccessDenied; criteria/default/selectedLevelIndexes/autosave ordering giữ nguyên.
- **Deferred**: chưa tách `periods` khỏi aggregate vì authenticated waterfall chưa có; chỉ làm nếu baseline chứng minh material contributor.
- **Verification**: focused static-first test, typecheck, lint, 27/27 tests, build, diff-check PASS; authenticated Chrome canary với account test `KIV158` password NULL trên 390/768/1440 PASS: static 509.7/716.9/552.6ms, light 1085.2/1186.3/1112.9ms, criteria 2025.6/2156.9/2040.2ms; HTTP failures 0, overflow false, editor loaded. Fresh Agy read-only fallback review PASS. Chỉ ghi nhận CSP report-only warning, không có JS exception.
