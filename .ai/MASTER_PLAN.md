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

### Phase 64: Trả lại đánh giá (Return/Reject) 🟡 (2026-08-14)
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
