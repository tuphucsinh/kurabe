# MASTER PLAN — KURABE QAQC Evaluation System

> Webapp đánh giá nhân viên cuối năm cho bộ phận QAQC, tiêu chuẩn Nhật Bản.
> Stack: **Next.js 15 (App Router)** + **TailwindCSS v4** + **Local Mock Data** → Supabase (Phase sau)

## Phases

| Phase | Tên | Mô tả | Trạng thái |
|---|---|---|---|
| P1-P13 | Infrastructure & UI | Setup core, login, dashboard, teams, employees, criteria, evaluation core, polish | `[x]` |
| P14 | Workflow Data Model | Refactor data model: EvaluationPeriod, Multi-round Evaluation, EvaluationRound, phân quyền theo Role | `[x]` |
| P15 | Workflow Engine | State machine, phân quyền đánh giá/review, lock sau gửi, luồng gửi/nhận thông báo | `[x]` |
| P16 | Multi-round UI | CriteriaTab overlay đa tầng, badge phân biệt lần đánh giá, notification, dashboard cập nhật | `[ ]` |

## Workflow Đánh giá (Business Rules)

```mermaid
sequenceDiagram
    participant M as Manager
    participant L as Leader
    participant S as SubLeader
    participant E as Employee

    M->>M: Mở kỳ đánh giá (1 lần/năm)
    
    Note over E,S: Round 1 — Đánh giá lần 1
    S->>E: Đánh giá Staff cùng team
    S->>S: Tự đánh giá bản thân
    E->>E: (Option) Tự đánh giá bản thân
    S->>L: Gửi kết quả (Locked R1 -> R2)
    
    L->>L: Tự đánh giá bản thân
    L->>M: Gửi kết quả tự đánh giá (Locked R1 -> R2)

    Note over L,S: Round 2 — Leader Review
    L->>S: Review kết quả R1 của SubLeader
    L->>L: Điều chỉnh nếu cần (Lưu R2)
    L->>M: Gửi kết quả (Locked R2 -> R3)

    Note over M,L: Round 2/3 — Manager Review
    M->>L: Review kết quả R1 của Leader
    M->>S: Review kết quả R2 của SubLeader (về Staff)
    M->>M: Tự đánh giá bản thân
    M->>M: Xác nhận kết quả cuối (Approved)
```

## Business Rules (Tóm tắt từ PRD)
- **3 vai trò**: Manager → Leader → SubLeader
- **3 lần đánh giá**: SubLeader đánh giá R1 → Leader review R2 → Manager review R3
- **6 nhóm tiêu chí**: A (Kỷ luật), B (Hợp tác), C (Tích cực), D (Trách nhiệm), E (Năng lực), F (Thành tích)
- **Thang xếp loại**: S > A > AB > B > C > D (điểm cắt khác nhau cho NV vs Quản lý)
- **Lock rule**: Sau khi "Gửi" → không thể chỉnh sửa, cấp trên nhận thông báo
- **Overlay rule**: Cấp cao hơn đánh giá lại → load điểm cũ + badge/chấm màu khác để phân biệt
