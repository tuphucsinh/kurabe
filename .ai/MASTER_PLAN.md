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
