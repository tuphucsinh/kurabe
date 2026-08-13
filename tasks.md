# Active Tasks

> ⚠️ Phase 44 (Security Hardening) đang được TẠM HOÃN (Deferred) theo yêu cầu.
> Xem roadmap đầy đủ: `.ai/MASTER_PLAN.md` → "Next Phases (Post-Audit)"

## Phase 49: App Optimization — Gọn Nhẹ, Mượt Mà, Ổn Định

Tất cả task Phase 49 đã hoàn thành và được migrate sang MASTER_PLAN.md.

---

## Phase 50: Standalone Printable Guide Refinement 📄

Tất cả task Phase 50 đã hoàn thành và được migrate sang MASTER_PLAN.md.

---

## Phase 52: Trang Cài đặt (Settings Hub) — Phase A

> Đã chốt với user (2026-08-13): **tạo/đóng/xóa kỳ chuyển hẳn sang Cài đặt** — Dashboard BỎ PeriodActions.
> Phase A: Khung 5-tab (active 3) + Tab Kỳ + Tab Nhóm & Quyền + Tab Điều hướng nhanh. Phase B (Tài khoản) và Phase C (Thang điểm) làm sau.

### [#P52T01] [src/app/settings/page.tsx] SettingsHubPage (client) — khung trang Cài đặt + guard Manager + 3 tab

**Goal**: Tạo trang `/settings` (hiện 404 — Sidebar/BottomNav đã có link) với khung tab, guard chỉ Manager truy cập (non-Manager thấy màn chặn, không redirect).

**Depends on**: `none`

**Parallel-safe**: `no`

**New interface**:
- `src/app/settings/layout.tsx`: metadata title `Cài đặt | KURABE` (mẫu `support/layout.tsx`).
- `src/app/settings/page.tsx` (client): `useAuth()` → `isLoading` → skeleton spinner (mẫu AppLayout); `!isManager` → màn chặn (icon `ShieldAlert`, title "Chỉ Quản lý mới có quyền truy cập", mô tả ngắn); Manager → header "Cài đặt" + subtitle + `Tabs` (components/ui/Tabs.tsx) với **3 tab active**: `periods` "Kỳ đánh giá", `roles` "Nhóm & Quyền", `quick` "Điều hướng nhanh" — panel theo `activeTab`:
  - `periods` → render `<PeriodsTab />` (tạo ở P52T02)
  - `roles` → render `<TeamsRolesTab />` (tạo ở P52T03)
  - `quick` → render card links inline: /employees (Nhân viên), /teams (Nhóm), /criteria (Tiêu chuẩn) — mỗi card icon + label + mô tả ngắn (mẫu style teams/page.tsx card).
- Icon tabs: `CalendarDays` (Kỳ), `UsersRound` (Nhóm & Quyền), `Compass` (Điều hướng nhanh) từ lucide-react.

**Verify**: `npm run build` + `npm run lint` PASS; browser: login Manager → vào /settings thấy 3 tab + Tab Kỳ hiển thị (placeholder → P52T02 hoàn thành thì đầy đủ); đổi role user thành Employee (login khác) → /settings hiện màn chặn, không có nội dung tab.

### [#P52T02] [src/components/settings/PeriodsTab.tsx] PeriodsTab (client) — Tab Kỳ đánh giá

**Goal**: Tập trung quản lý kỳ vào Cài đặt: nhúng `PeriodActions` hiện có (tạo/đóng/xóa/xuất Excel) + bảng danh sách kỳ (năm, status, tiến độ, nút chọn kỳ).

**Depends on**: `[#P52T01]`

**Parallel-safe**: `no`

**New interface**:
- `src/components/settings/PeriodsTab.tsx` (client), export default `PeriodsTab`.
- Import + render `<PeriodActions />` từ `@/components/dashboard/PeriodActions` (giữ nguyên hành vi, KHÔNG sửa component này).
- Bảng danh sách kỳ từ `useAuth().allPeriods` (đã sort year desc): mỗi dòng → năm (`Kỳ {year}`), badge status (Active = xanh, Closed = slate — mẫu badge teams/page.tsx), tiến độ % = `approved evaluations / total evaluations` của kỳ (tính từ `useEvaluations(period.id, user)` — shape Evaluation có `periodId`; approved = `status === 'Approved'`), nút "Chọn kỳ" → `setCurrentPeriod(period)` + toast success.
- Loading: `useEvaluations` isLoading → skeleton dòng; `allPeriods` rỗng → EmptyState "Chưa có kỳ đánh giá".

**Verify**: browser (Manager): /settings → Tab Kỳ — nút Tạo kỳ mới/Đóng kỳ/Xóa kỳ/Xuất Excel hoạt động như cũ trên Dashboard; tạo kỳ mới → bảng cập nhật có dòng mới (status Active); bấm "Chọn kỳ" → PeriodSelector sidebar đổi sang kỳ đó; xóa kỳ → dòng biến mất. Lint/build PASS.

### [#P52T03] [src/components/settings/TeamsRolesTab.tsx] TeamsRolesTab (client) — Tab Nhóm & Quyền (read-only)

**Goal**: Hiện trạng quản lý nhóm: Leader/SubLeader từng nhóm + cảnh báo nhóm thiếu chức vụ / nhân viên chưa gán nhóm. Read-only, không nút thêm/sửa/xóa.

**Depends on**: `[#P52T01]`

**Parallel-safe**: `no`

**New interface**:
- `src/components/settings/TeamsRolesTab.tsx` (client), export default `TeamsRolesTab`.
- Data: `useUsers(user)` + `useTeams(user)` (cách dùng như teams/page.tsx). Mỗi nhóm 1 card: tên nhóm + số thành viên; danh sách vai trò: Leader (badge indigo + tên), SubLeader (badge sky + tên); cảnh báo:
  - amber: nhóm **thiếu Leader** hoặc **thiếu SubLeader** ("Nhóm chưa có Leader/SubLeader — cập nhật tại trang Nhân viên").
  - rose: nhân viên **chưa gán nhóm** (`teamId === null`, `is_active`) — "N nhân viên chưa gán nhóm".
- Loading: `isLoading` → CardSkeleton (components/ui/Skeleton).

**Verify**: browser (Manager): Tab Nhóm & Quyền hiển thị đúng Leader/SubLeader từng nhóm; nhóm không có SubLeader hiện cảnh báo amber; không có nút sửa/xóa. Lint/build PASS.

### [#P52T04] [src/app/dashboard/page.tsx] DashboardPage — Bỏ PeriodActions khỏi Dashboard

**Goal**: Theo quyết định user (13-08): tạo/đóng/xóa kỳ chuyển hẳn sang Cài đặt → Dashboard bỏ hẳn cụm PeriodActions.

**Depends on**: `[#P52T02]`

**Parallel-safe**: `no`

**New interface**: Không — chỉ xóa:
- Xóa import `PeriodActions` (dòng 6) và `<PeriodActions />` (dòng 64) khỏi `src/app/dashboard/page.tsx`.
- Header giữ nguyên tiêu đề + subtitle; KHÔNG thêm link thay thế (Sidebar đã có mục "Cài đặt").

**Verify**: build + lint PASS; browser: Dashboard (Manager) — không còn 4 nút (Tạo kỳ/Đóng kỳ/Xóa kỳ/Xuất Excel); các nút đó chỉ còn ở /settings → Tab Kỳ.

---
