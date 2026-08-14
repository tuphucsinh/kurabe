-- ============================================================
-- KURABE QAQC — Migration Phase 70 (P70T02): j2 — siết RLS users/teams
-- Chạy trên Supabase SQL Editor / Management API (2026-08-14)
-- ============================================================
-- Mọi write users/teams đã qua server actions (supabaseAdmin) từ P70T01+T02.
-- anon giờ chỉ SELECT (mô hình anon-read như migration-d/j1).
DROP POLICY IF EXISTS "Enable all access for anon" ON public.users;
DROP POLICY IF EXISTS "Enable all access for anon" ON public.teams;

CREATE POLICY "users_select_only" ON public.users
  FOR SELECT USING (true);

CREATE POLICY "teams_select_only" ON public.teams
  FOR SELECT USING (true);
