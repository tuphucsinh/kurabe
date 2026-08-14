-- ============================================================
-- KURABE QAQC — Migration Phase 70 (P70T03): j3 — siết RLS criteria
-- Chạy trên Supabase SQL Editor / Management API (2026-08-14)
-- ============================================================
-- Mọi write criteria đã qua server actions (supabaseAdmin) từ P70T03.
-- anon giờ chỉ SELECT (mô hình anon-read như migration-d/j1/j2).
DROP POLICY IF EXISTS "Enable all access for anon" ON public.criteria;
DROP POLICY IF EXISTS "Enable all access for anon" ON public.criteria_groups;
DROP POLICY IF EXISTS "Enable all access for anon" ON public.criterion_levels;

CREATE POLICY "criteria_select_only" ON public.criteria
  FOR SELECT USING (true);

CREATE POLICY "criteria_groups_select_only" ON public.criteria_groups
  FOR SELECT USING (true);

CREATE POLICY "criterion_levels_select_only" ON public.criterion_levels
  FOR SELECT USING (true);
