# MASTER PLAN — KURABE QAQC Evaluation System

> Webapp đánh giá nhân viên cuối năm cho bộ phận QAQC, tiêu chuẩn Nhật Bản.
> Stack: **Next.js 15 (App Router)** + **TailwindCSS v4** + **Local Mock Data** → Supabase (Phase sau)

## Phases

| Phase | Tên | Mô tả | Trạng thái |
|---|---|---|---|
| P1 | Foundation | Setup project, Design System, Layout, Mock Data | `[x]` |
| P2 | Login | Màn hình đăng nhập + Auth context (mock) | `[x]` |
| P3 | Dashboard | Tổng quan Dashboard (biểu đồ, thống kê) | `[x]` |
| P4 | Teams | Danh sách Nhóm QAQC | `[x]` |
| P5 | Employees | Danh sách Nhân viên + Modal Thêm/Sửa | `[x]` |
| P6 | Criteria | Tiêu chuẩn đánh giá (6 nhóm A-F) | `[x]` |
| P7 | Evaluation | Đánh giá chi tiết (core: tabs, tính điểm tự động, đa tầng) | `[x]` |
| P8 | Polish | Responsive mobile, animation, final QA | `[x]` |
| P9 | Polishing & Next Steps | UI polish | `[x]` |
| P10 | Reports | Trang báo cáo tổng hợp QAQC (charts, heatmap, leaderboard) | `[x]` |
| P11 | Polish & Refinement | Tinh chỉnh layout, padding, responsive cho hài hòa | `[/]` |

## Business Rules (Tóm tắt từ PRD)
- **3 vai trò**: Manager → Leader → SubLeader
- **3 lần đánh giá**: Sub đánh giá NV → Leader review → Manager phê duyệt
- **6 nhóm tiêu chí**: A (Kỷ luật), B (Hợp tác), C (Tích cực), D (Trách nhiệm), E (Năng lực), F (Thành tích)
- **Thang xếp loại**: S > A > AB > B > C > D (điểm cắt khác nhau cho NV vs Quản lý)
