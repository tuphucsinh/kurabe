# Active Tasks

## Phase 43: Performance & Security Audit

### [#P43T01] [Supabase] `auditDatabaseIndexes()`

**Mục tiêu**: Tối ưu hóa hiệu năng truy vấn cho các báo cáo lớn và Dashboard.

**Thay đổi cụ thể**:
1. Rà soát các bảng `evaluations`, `evaluation_rounds`, `evaluation_criteria`.
2. Tạo index cho các cột thường xuyên dùng trong `WHERE` và `JOIN` (period_id, user_id, team_id).
3. Sử dụng Supabase Advisor để tìm các truy vấn chậm.

**Status**: `[ ]`

---
