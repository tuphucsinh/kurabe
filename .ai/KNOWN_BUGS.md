# Known Bugs & Notes - Kurabe QAQC Evaluation

## Technical Debt
- [x] **Data Persistence**: Đã chuyển sang dùng Supabase thay thế localStorage.
- [ ] **Formula Validation**: Các công thức tính điểm (nhóm E, F) cần được kiểm thử kỹ hơn với các trường hợp biên (tất cả 5, tất cả 1, hoặc có tiêu chí âm).
- [x] **Type Safety**: Refactored `src/lib/db/*.ts` to use Supabase generated types, removed most `as any` casts.
- [x] **Technical Debt (Linting)**: Đã hoàn thành Refactor Type Safety cho thư viện Database ở Phase 31.

## UI/UX
- [x] **Mobile Touch Targets**: Nút chọn điểm (1-5) trên mobile đã được tăng padding (p-5).
- [x] **Export Feature**: Đã hoàn thành tính năng Export ra file Excel.
- [x] **Real-time Sync**: Đã sử dụng Supabase để sync real-time thay cho localStorage.

## Logic
- [x] **Grading Consistency**: Đã fix lỗi logic xếp loại AB/B cho nhân viên, hiện tại xếp loại hoạt động ổn định và chính xác theo `minScore`/`maxScore`.

## Bugs đã fix — 2026-08-13 (kiểm tra trước khi debug lại)
- [x] **Đổi SubLeader NV → round 1 evaluator không sync**: `upsertUser` gọi `syncEvaluationAfterUserChange` chỉ khi `user.role || user.teamId` — thiếu `user.subleaderId !== undefined` → SubLeader mới không đánh giá được NV (EmptyState "Chưa có dữ liệu đánh giá").
- [x] **Promote NV → SubLeader bị chặn** "Nhóm này đã có SubLeader": `assertLeadershipSlot` giữ rule cũ 1 SubLeader/team — chỉ nên ràng buộc Leader.
- [x] **"Hoạt động gần đây" không update**: `evaluations.slice(0,5)` không sort + `date: createdAt` — sort theo `submittedAt` round mới nhất rồi slice 5.
- [x] **Nhật ký (audit) thiếu hoạt động đánh giá**: submit/approve không ghi `audit_logs` — `logAudit(actor, 'SUBMIT_EVALUATION'|'APPROVE_EVALUATION', 'evaluation', id, {round, grade, score})` trong `saveEvaluationRound` (detail phải object — type `Record<string, unknown>`).
- [x] **STATUS_BADGE thiếu Submitted/Draft/Reviewed** → nhầm "Chưa bắt đầu": badge động "Đã nộp vòng {round}" (Reviewed cũng vậy), Approved → "Đã có KẾT QUẢ đánh giá" (emerald-600).

## Dev pitfalls & operations
- **Build discipline**: `npm run build` trong lúc `npm run start` đang chạy → ghi đè `.next` → "Failed to load chunk" / error boundary. Kill PID 3000 CHÍNH XÁC (`ss -tlnp | grep 3000`) trước build. Chunk 404 → `rm -rf .next` + rebuild + start.
- **EADDRINUSE**: process cũ vẫn sống — luôn xác định PID bằng `ss -tlnp` trước start; kill -9 nếu cần.
- **Runner agy headless**: harness-run + `agy --print` có thể bị chặn `read_file` permission (headless không prompt được) → lỗi môi trường, không phải code sai. Sau 2 lần chặn: Mika tự làm task nhỏ với verify chặt.
- **UI layout**: Tabs `flex-1 justify-center` PHẢI kèm `flex` (mất → icon/text lệch dọc). Grid thẳng cột: placeholder phải width cố định (vd `w-[104px]`), không span rỗng.
- **Browser verify**: sau build lại, navigate fresh (`/login` → route) tránh chunk cache cũ. UI verify bằng bounding box (`getBoundingClientRect`): icon vs text cùng baseline (diff ≤2px), badge/grid left đồng nhất giữa các row.
- **Login redirect & flash**: login xong dùng `window.location.href = '/dashboard'` (full reload → middleware đọc cookie redirect chắc chắn) thay `router.push` (có thể kẹt im lặng trên production nếu RSC nav fail). `AppLayout`: `if (pathname === '/login') return login-only` — tránh hiện sidebar + login card cùng lúc sau set session.
- **Next 16 cache** (chi tiết MASTER_PLAN Phase 63): `unstable_cache(fn, keys, options)` — keys (mảng) là tham số 2 BẮT BUỘC, `{tags, revalidate}` ở options (tham số 3); `revalidateTag(tag, 'default')` cần 2 tham số (Next 16 khác Next 15); cache fn KHÔNG chứa dynamic APIs (cookies/getSessionUser) — lấy viewer ngoài cache truyền vào; KHÔNG import `next/cache` trong `src/lib/db/*` (AuthContext/hooks import chúng → lỗi build "Pages Router"); lazy recharts phải qua wrapper `'use client'` riêng (không `next/dynamic` + `ssr:false` trong Server Component).
- **URL /evaluations/[id] dùng employeeId** (Phase 64, 14-08): route param là employee id, KHÔNG phải evaluation id — navigate sai id → "Quyền truy cập bị từ chối" + "Error fetching user". Query evaluations để lấy employee_id trước.
- **React controlled input (Phase 64, 14-08)**: set `.value` trực tiếp qua JS console KHÔNG cập nhật React state (nút submit vẫn disabled dù DOM hiển thị value) — phải gõ qua browser_type (sự kiện thật) hoặc native setter + input event; tương tự với browser_console khi test form.

## E2E live test
Xem `.ai/E2E_LIVE_TEST.md`.

## [#P65T02] Audit gap: CREATE/UPDATE user & team không ghi nhật ký (2026-08-14)
- **Triệu chứng**: audit_logs chỉ có DELETE_USER/DELETE_TEAM từ phiên test; mọi thêm/sửa NV + tạo/sửa team (đổi leader, chuyển team, promote, gán subleader) KHÔNG có entry.
- **Root cause**: form thêm/sửa NV gọi `upsertUser` (src/lib/db/users.ts:182) và team gọi `upsertTeam` (src/lib/db/teams.ts:8) TRỰC TIẾP qua Supabase client — không có logAudit. Chỉ `deleteUserAction` (src/actions/users.ts:9) có audit và được UI dùng. `upsertUserAction` (users.ts:26) CÓ logAudit nhưng KHÔNG ai gọi (dead code).
- **Hành vi đúng hiện có**: xóa NV = soft-delete (is_active=false, giữ evaluation lịch sử); xóa team = soft-delete; audit DELETE ghi đúng.
- **Fix đề xuất** (chưa làm — chờ duyệt): thêm logAudit vào upsertUser/upsertTeam (lib/db) với actor từ session, hoặc chuyển UI sang dùng server actions.

## [#P65T04] Chuyển team user KHÔNG sync evaluation.team_id + evaluator (2026-08-14)
- **Triệu chứng**: user đổi team (Sửa NV → team khác) → evaluation của user GIỮ team_id cũ + round evaluator cũ. Hệ quả: Leader team MỚI không thấy evaluation (detail = "Chưa có dữ liệu đánh giá" vì canViewEvaluation fail: team mismatch), R2/R3 evaluator vẫn là leader team CŨ.
- **Bằng chứng**: TST03 tạo (team bị default QC Gia dụng) → sửa team về Test Full E2E → evaluation.team_id VẪN 277411df (QC Gia dụng), R2 evaluator 2058dbe3 (leader QC Gia dụng) thay vì TST01.
- **Root cause**: `upsertUser` (lib/db/users.ts:182) chỉ sync subleader→round1 evaluator (Phase 61 fix); KHÔNG sync team change → evaluation.team_id + evaluator R2 (Leader)/R3 (Manager).
- **Fix đề xuất** (chờ duyệt): khi user.teamId đổi → update evaluation.team_id + re-assign round 2 (leader team mới) / round 3 (Manager) evaluator cho kỳ active, tương tự sync subleader.

## [#P69] Bài học Phase 69 — bật password login thật (2026-08-14)
- **Cookie Secure theo NODE_ENV SAI trên HTTP LAN (P69FIX `41d3d9a`)**: `secure: process.env.NODE_ENV === 'production'` → npm run start (production build) set cookie Secure → trình duyệt TỪ CHỐI lưu trên HTTP không phải localhost → login "chớp 1 cái rồi về login" (login OK → redirect /dashboard → middleware không thấy cookie → về /login). Chỉ test localhost không lộ (localhost = secure context, Secure được phép). Fix: `secure: (await headers()).get('x-forwarded-proto') === 'https'` — Vercel https → true, LAN http → false. Verify CDP cả 2 URL localhost + 192.168.1.230 → /dashboard.
- **Logout UI phải qua server action khi cookie httpOnly**: cookie `auth_session` giờ httpOnly (P69T01) → xóa bằng `document.cookie` KHÔNG được (JS không chạm httpOnly) → Sidebar cũ logout fail: cookie còn → middleware redirect /login → /dashboard → không logout được. Fix: `await logout()` (logoutAction `cookies().delete`). Verify bằng CDP click thật + navigate /dashboard → /login.
- **GRANT ALL table-level → column REVOKE vô hiệu**: anon đang `GRANT ALL ON users` → `REVOKE SELECT (password_hash) FROM anon` KHÔNG ăn (column_privileges rỗng — không có column-grant để gỡ). Phải `REVOKE SELECT ON users FROM anon` + `GRANT SELECT (<các cột trừ hash>) ON users TO anon`.
- **PostgREST select('*') LỖI sau column grant**: `select('*')` và `.select()` trần (upsert) → `permission denied for table users`. Bắt buộc select tường minh: hằng `USER_SELECT` (src/lib/db/users.ts) dùng mọi nơi anon đọc users; `mapUserFromDb` nhận `Omit<DbUser,'password_hash'>`.
- **PAT quyền project khác nhau**: `~/.supabase/access-token` (account ngothaoly) KHÔNG có quyền project kurabe (chỉ sangwebsite `iloaeaoojxdovedjtowt`) — dùng PAT trong `~/.hermes/profiles/mika/config.yaml` (`SUPABASE_ACCESS_TOKEN: sbp_...`) cho Management API `/database/query` project kurabe (`cliiqqthppxuzirabzla`).
- **158 có hash sót từ P52** (test Phase B đặt pass trên account thật, không reset) — trước khi bật password login phải check `password_hash IS NOT NULL`; đã reset 158 về NULL. Không account thật nào còn hash.

## [#P70] Bài học Phase 70 — C3 siết RLS write (anon chỉ SELECT) (2026-08-14)
- **`import 'server-only'` vào supabase-admin.ts BẮT lỗi client-import NGAY build** (Turbopack: "You're importing a module that depends on server-only... Client Component") — phát hiện lib/db/evaluations.ts client kéo service key. Fix: tách write functions sang file riêng `src/lib/db/evaluations-write.ts` (server-only) — file lib có CẢ anon-read + admin-write sẽ vỡ client bundle.
- **syncEvaluationAfterUserChange không thể chuyển admin tại chỗ**: nằm trong lib/db/users.ts (client import) → phải MOVE sang actions/users.ts cùng upsertUser (cùng commit) — nếu chỉ đổi client sẽ kéo service key vào bundle.
- **RLS semantics khi verify**: INSERT không policy → ERROR "new row violates row-level security"; UPDATE/DELETE không policy → **0 rows, KHÔNG lỗi** (chặn ngầm). Test anon-blocked phải: insert → mong error; update/DELETE → mong 0-rows với id THẬT (nếu không chặn sẽ đổi được row → rows=1).
- **RLS drop policy + create select_only theo NHÓM bảng** (users/teams → criteria → evaluations) + verify anon-blocked NGAY sau mỗi migration — chống cửa sổ app ghi fail im lặng (P65T06).
- **Chống success giả trong server actions**: upsert/update/delete phải `.select()`/count verify — RLS chặn không throw → action trả success giả nếu không check (góp ý Reviewer R2).
- **Route /evaluations/[id] dùng EMPLOYEE id** (useUser + useEvaluationByEmployee), không phải evaluation id — đi sai id → "Quyền truy cập bị từ chối" (không phải bug).
- **Reviewer 3 vòng plan review** (R1: sync fail im lặng → R2: sót teams.leader_id + client bundle kéo admin → R3 PASS): plan chạm DB/auth nên review kỹ write-path TỪNG hàm + callers, không chỉ đọc summary.
