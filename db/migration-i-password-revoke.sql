-- ============================================================
-- KURABE QAQC — Migration Phase 69 (P69T02): chặn anon đọc password_hash
-- Chạy trên Supabase SQL Editor / Management API (2026-08-14)
-- ============================================================
-- anon key (NEXT_PUBLIC_SUPABASE_ANON_KEY) vẫn SELECT users trực tiếp
-- (mô hình anon-read hiện tại) NHƯNG không được đọc cột hash.
-- anon đang có GRANT ALL table-level → column REVOKE vô hiệu.
-- Giải pháp: gỡ SELECT table-level, GRANT lại theo cột (trừ password_hash).
-- Mọi code đọc/ghi password_hash phải qua service-role client (supabaseAdmin).
REVOKE SELECT ON public.users FROM anon;

GRANT SELECT (
  id, employee_code, name, role, team_id, join_date, avatar_url,
  created_at, is_active, updated_at, subleader_id, description
) ON public.users TO anon;
