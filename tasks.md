# Active Tasks

> ⚠️ Phase 44 (Security Hardening) đang được TẠM HOÃN (Deferred) theo yêu cầu.
> Xem roadmap đầy đủ: `.ai/MASTER_PLAN.md` → "Next Phases (Post-Audit)"

## Phase 49: App Optimization — Gọn Nhẹ, Mượt Mà, Ổn Định

Tất cả task Phase 49 đã hoàn thành và được migrate sang MASTER_PLAN.md.

---

## Phase 50: Standalone Printable Guide Refinement 📄

Tất cả task Phase 50 đã hoàn thành và được migrate sang MASTER_PLAN.md.

---

## Phase 52: Trang Cài đặt (Settings Hub) — Phase A [DONE] ✅

Tất cả task P52T01-T04 đã hoàn thành + verify browser (chi tiết: `.ai/MASTER_PLAN.md` → Phase 52 Phase A DONE).
- P52T01: khung /settings + guard Manager + 3 tab
- P52T02: Tab Kỳ — PeriodActions + bảng danh sách kỳ (status, tiến độ, chọn kỳ)
- P52T03: Tab Nhóm & Quyền — Leader/SubLeader + cảnh báo thiếu chức vụ/chưa gán nhóm
- P52T04: Dashboard bỏ PeriodActions (chuyển hẳn sang Cài đặt)

**Còn lại (chờ anh bấm nút)**: ~~Phase B~~ / ~~Phase C~~ → **ĐÃ HOÀN THÀNH** (P52T05/P52T06, migration đã chạy, verify end-to-end PASS — chi tiết `.ai/MASTER_PLAN.md`). Phase 44 (Security) giữ DEFERRED — fake login giữ tới khi anh test xong ổn thỏa.

---

## Phase 52: Trang Cài đặt — Phase B + Phase C 🟢 (đang làm)

### [#P52T05] [db/ + src/actions/account.ts + src/components/settings/AccountTab.tsx] Tab Tài khoản — đổi mật khẩu

**Goal**: Tab "Tài khoản" trong /settings: hiển thị thông tin cá nhân + form đặt/đổi mật khẩu. KHÔNG đụng login/middleware (fake login giữ nguyên — Phase 44 mở sau).

**Depends on**: `none`

**Parallel-safe**: `no`

**New interface**:
- `db/migration-b-account.sql`: `ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash text;` (chạy tay trên Supabase SQL Editor).
- `src/actions/account.ts` (server action): `changePassword(userId: string, oldPassword: string | null, newPassword: string): Promise<{success: boolean; error?: string}>` — validate newPassword ≥ 6 ký tự; user chưa có `password_hash` → set mới (bỏ qua oldPassword); đã có → `bcrypt.compare(oldPassword, hash)` sai → lỗi "Mật khẩu cũ không đúng"; hash bcrypt (rounds 10, dùng `bcryptjs` — thêm dependency `bcryptjs` + `@types/bcryptjs`); KHÔNG sửa login.
- `src/components/settings/AccountTab.tsx` (client): thông tin cá nhân từ `useAuth().user` + tên nhóm từ `useTeams(user)` (badge chức vụ màu theo role — mẫu trang /teams); form đổi mật khẩu: user chưa có mật khẩu → chỉ 2 ô (mới + xác nhận), nút "Đặt mật khẩu"; đã có → 3 ô (cũ/mới/xác nhận), nút "Đổi mật khẩu"; dùng `useToast` + `ConfirmDialog`? (không cần confirm — toast đủ); loading state nút.
- `src/app/settings/page.tsx`: thêm tab thứ 4 `account` "Tài khoản" (icon `UserCircle`) — hiện ACTIVE (chức năng hoạt động; login chưa bắt buộc dùng mật khẩu).

**Verify**: lint + build PASS; browser Manager: /settings → tab Tài khoản hiện đúng thông tin; đặt mật khẩu mới lần đầu → toast success; đổi lần 2 với sai mật khẩu cũ → toast lỗi; đúng → success. Login fake vẫn hoạt động (không bị ảnh hưởng).

### [#P52T06] [db/ + src/lib/grade-bands.ts + src/actions/grade-bands.ts + src/components/settings/GradeBandsTab.tsx + src/lib/scoring.ts + src/app/criteria/page.tsx] Tab Thang điểm xếp loại — dải điểm từ DB

**Goal**: Manager chỉnh dải điểm S/A/AB/B/C/D riêng cho Quản lý (Leader/Manager/SubLeader) và Nhân viên từ /settings; `getGradeFromScore` đọc từ DB với fallback hardcode (app KHÔNG vỡ khi bảng chưa tồn tại).

**Depends on**: `[#P52T05]` (cùng phase, thứ tự code sau B)

**Parallel-safe**: `no`

**New interface**:
- `db/migration-c-grade-bands.sql`: bảng `grade_bands (id uuid pk default gen_random_uuid(), role_group text check in ('leader','staff'), grade text, min_score int null, max_score int null, sort_order int)` + UNIQUE(role_group, grade) + seed từ hardcode hiện tại (leader: S≥170, A160-169, AB130-159, B100-129, C70-99, D≤69; staff: S≥155, A145-154, AB115-144, B90-114, C60-89, D≤59).
- `src/lib/grade-bands.ts` (module cache, sync-safe):
  - `getGradeBandsSync(): GradeBands` — cache-first, fallback hardcode `@/data/criteria` (KHÔNG throw khi chưa load/DB lỗi).
  - `loadGradeBandsFromDb(): Promise<GradeBands>` — query `grade_bands` (order sort_order), map 2 group; lỗi → fallback; set module cache.
  - `invalidateGradeBandsCache()`.
- `src/actions/grade-bands.ts`: `saveGradeBands(bands: {roleGroup, grade, minScore, maxScore}[]): Promise<{success, error?}>` — upsert từng dòng + validate không chồng lấn (client + server) + `invalidateGradeBandsCache` + `revalidatePath('/settings')` + `/criteria`.
- `src/components/settings/GradeBandsTab.tsx` (client): useEffect mount → `loadGradeBandsFromDb`; 2 cột card Quản lý/Nhân viên, mỗi grade 1 dòng: tên grade (badge màu `getGradeColor`) + input min/max (number, S bỏ max, D bỏ min — nullable); validate: min < max kế tiếp, không chồng lấn → lỗi inline; nút "Lưu thang điểm" (save-all, loading state) → toast.
- `src/lib/scoring.ts`: `getGradeFromScore` đổi từ hardcode trực tiếp → `getGradeBandsSync()` (giữ sync, call sites KHÔNG đổi).
- `src/app/criteria/page.tsx`: phần hiển thị grading (dòng 382/413) đọc `getGradeBandsSync()` thay hardcode import (client — mount useEffect load nếu cache trống, fallback OK).

**Verify**: lint + build PASS; browser Manager: tab Thang điểm hiện 2 cột giá trị hiện tại (bằng hardcode khi chưa có bảng); đổi min/max 1 grade → lưu → toast success (sau khi migration chạy); validate chồng lấn chặn lưu. Test logic: snapshot grade trước/sau đổi dải (node script) — PASS. /criteria hiển thị đồng bộ.

---
