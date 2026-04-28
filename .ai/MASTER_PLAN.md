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
