# MASTER PLAN - Kurabe

## Project Overview
Kurabe là hệ thống đánh giá hiệu suất nhân viên với giao diện hiện đại, tập trung vào trải nghiệm người dùng và so sánh kết quả giữa các vòng đánh giá.

## Phase Progress

- [x] Phase 1-17: Initial development (Core features, UI design, mock data)
- [x] Phase 18: Optimization & Comparison Page
  - Chuyển logic so sánh các vòng sang trang riêng biệt (`/evaluations/[id]/compare`)
  - Tối ưu hóa UI trang chi tiết đánh giá
  - Cleanup mã nguồn (xóa các component cũ không dùng)
- [x] Phase 19: Cập nhật quản lý Nhóm (Modal Thêm/Sửa)
  - Thêm TeamModal để quản lý thông tin nhóm.
  - Tích hợp modal vào TeamsPage (Thêm/Sửa).


- [x] Phase 21: Refactor & Optimization
  - Unify Role types.
  - Dead code cleanup.
  - Tách component (Header, Tabs) để tối ưu page.tsx.
  - State consolidation (useReducer).
  - Tối ưu bundle size (framer-motion lazy load).
- [x] Phase 22: CRUD Tiêu chuẩn Đánh giá
  - Hỗ trợ description cho Criterion.
  - Thêm / Sửa Tiêu chuẩn qua CriteriaModal (auto-prefix mã, dynamic options).
  - Thêm / Sửa Nhóm Tiêu chuẩn qua CriteriaGroupModal.
  - Tích hợp in-memory CRUD vào CriteriaPage.
- [x] Phase 23: UI Polish — Modal, Description & Group ShortName
  - Thêm `shortName` cho CriteriaGroup, hỗ trợ hiển thị tên rút gọn trên Tab.
  - Tối ưu layout `CriteriaModal` (compact layout, theme color sync).
  - Hiển thị `description` tiêu chuẩn trực tiếp trên danh sách.
- [x] Phase 24: Supabase Integration
  - Foundation: SDK setup, schema DDL (8 bảng), seed data.
  - DAL: Query functions cho Users, Teams, Evaluations, Criteria.
  - Integration: Server Actions migrate, AuthContext + Pages refactor.
  - Cleanup: Xóa mock data, consolidate types, verify build.
- [x] Phase 25: Bug Fixes & Optimization
  - Fix status case mismatch ('active' vs 'Active') & AuthContext dependencies.
  - Type safety: Typed Supabase client & DAL mappers, replaced 'any' casts.
  - Dead code: Cleaned ~500 lines of hardcoded data & unused components.
  - UX/Perf: Added Error boundaries, LazyMotion, home redirect, and fixed UI placeholders.
- [x] Phase 26: Login using Employee Code
  - Changed login logic to query by `employee_code` instead of `id`.
  - Updated Login UI to accept and display Employee Code.
- [x] Phase 27: Multi-period Evaluation Management
  - Expanded AuthContext to manage global evaluation periods.
  - Implemented PeriodSelector in Sidebar for dynamic switching.
  - Refactored Database Hooks and filtered Dashboard/Reports by selected period.
  - Added Manager actions for creating and closing evaluation periods.

