-- ============================================================
-- KURABE QAQC — Migration Phase K4: Revoke anon read on users & teams
-- File migration: CHỈ VIẾT FILE — KHÔNG CHẠY LÊN DB
-- ============================================================
-- Mục tiêu: Khóa hoàn toàn truy cập đọc trực tiếp qua PostgREST (anon key)
-- vào 2 bảng nhân sự: users và teams.
--
-- Toàn bộ client-side reads cho users và teams đã được chuyển sang Server Actions
-- chạy bằng supabaseAdmin (service_role) và kiểm soát quyền qua requireAuth / requireRole.
--
-- Lịch sử quyền của users:
-- - migration-i (P69T02): REVOKE SELECT ON users FROM anon + GRANT SELECT (11 cột) TO anon.
-- Bước K4: Thu hồi triệt để cả table-level và column-level SELECT trên users & teams.
--
-- Bảng GIỮ NGUYÊN quyền SELECT cho anon (dữ liệu cấu hình / danh mục dùng chung):
-- criteria, criterion_levels, criteria_groups, grade_bands, evaluation_periods.

-- 1. Thu hồi quyền SELECT bảng users (table-level và column-level) khỏi role anon
REVOKE SELECT ON public.users FROM anon;
REVOKE SELECT (
  id, employee_code, name, role, team_id, join_date, avatar_url,
  created_at, is_active, updated_at, subleader_id, description
) ON public.users FROM anon;

-- 2. Thu hồi quyền SELECT bảng teams khỏi role anon
REVOKE SELECT ON public.teams FROM anon;

-- ============================================================
-- ROLLBACK SCRIPT (Dùng khi cần khôi phục trạng thái cũ):
-- ============================================================
-- GRANT SELECT (
--   id, employee_code, name, role, team_id, join_date, avatar_url,
--   created_at, is_active, updated_at, subleader_id, description
-- ) ON public.users TO anon;
--
-- GRANT SELECT ON public.teams TO anon;
-- ============================================================
