# Frontend Architecture — KURABE QAQC

## Sitemap & Routes

```mermaid
graph TD
    Login["/login — Đăng nhập"]
    Dashboard["/dashboard — Tổng quan"]
    Teams["/teams — Danh sách Nhóm"]
    Employees["/employees — Danh sách NV"]
    Criteria["/criteria — Tiêu chuẩn"]
    Evaluation["/evaluations/[id] — Đánh giá chi tiết"]
    Settings["/settings — Cài đặt"]

    Login --> Dashboard
    Dashboard --> Teams
    Dashboard --> Employees
    Dashboard --> Criteria
    Employees --> Evaluation
    Dashboard --> Settings
```

## Component Tree

```mermaid
graph TD
    RootLayout["RootLayout (globals.css + Inter font)"]
    AuthProvider["AuthProvider (mock context)"]
    Sidebar["Sidebar (Desktop: fixed left / Mobile: bottom nav)"]
    
    RootLayout --> AuthProvider
    AuthProvider --> Sidebar

    Sidebar --> DashboardPage
    Sidebar --> TeamsPage
    Sidebar --> EmployeesPage
    Sidebar --> CriteriaPage
    Sidebar --> SettingsPage

    EmployeesPage --> EmployeeModal["Modal Thêm/Sửa NV"]
    EmployeesPage --> EvaluationPage["Evaluation Detail"]

    EvaluationPage --> TabsA["Tab A: Kỷ luật"]
    EvaluationPage --> TabsB["Tab B: Hợp tác"]
    EvaluationPage --> TabsC["Tab C: Tích cực"]
    EvaluationPage --> TabsD["Tab D: Trách nhiệm"]
    EvaluationPage --> TabsE["Tab E: Năng lực"]
    EvaluationPage --> TabsF["Tab F: Thành tích"]
    EvaluationPage --> ScoreSummary["Score Summary + Auto Grade"]
```

## Shared UI Components

| Component | Mô tả |
|---|---|
| `StatusChip` | Pill badge cho S/A/AB/B/C/D với màu tương ứng |
| `ProgressBar` | Thanh tiến trình (8px, Corporate Teal) |
| `DataTable` | Bảng dữ liệu striped rows, 48px row height |
| `ScoreInput` | Input điểm 1-5 cho từng tiêu chí |
| `Modal` | Overlay dialog cho Thêm/Sửa nhân viên |
| `Card` | Panel trắng, border #E2E8F0, soft shadow |
| `StatCard` | Card thống kê cho Dashboard |

## Design Tokens (từ Stitch)

| Token | Value |
|---|---|
| Primary | `#0E4B66` (Corporate Teal) |
| Primary Light | `#C5E7FF` |
| Surface | `#F7F9FB` |
| On Surface | `#191C1E` |
| Outline | `#71787D` |
| Outline Variant | `#C1C7CD` |
| Error | `#BA1A1A` |
| Font | Inter (all weights) |
| Border Radius | `0.5rem` (8px default) |
| Grid | 8px base |
| Container Max | 1440px |

## Scoring Logic

```mermaid
graph LR
    Input["Nhập điểm 1-5 cho mỗi tiêu chí"] --> Weighted["x Trọng số"] --> Sum["Tổng điểm"]
    Sum --> Grade{"Xếp loại"}
    Grade -->|"> 155 (NV) / > 170 (QL)"| S["S"]
    Grade -->|"145-155 / 160-170"| A["A"]
    Grade -->|"115-144 / 130-159"| AB["AB"]
    Grade -->|"90-114 / 100-129"| B["B"]
    Grade -->|"60-89 / 70-99"| C["C"]
    Grade -->|"< 60 / < 70"| D["D"]
```
