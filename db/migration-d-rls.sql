-- ============================================================
-- KURABE QAQC — Migration Phase 54: RLS siết (C3)
-- evaluation_periods + grade_bands: anon chỉ SELECT
-- (mọi ghi phải qua server actions — đã authz requireManager P54T01)
-- Chạy trên Supabase SQL Editor / Management API (2026-08-13)
-- ============================================================

-- 1. evaluation_periods: drop mọi policy cũ → chỉ SELECT
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies
           WHERE schemaname = 'public' AND tablename = 'evaluation_periods'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.evaluation_periods', r.policyname);
  END LOOP;
END $$;

CREATE POLICY "evaluation_periods_select_only" ON public.evaluation_periods
  FOR SELECT USING (true);

-- 2. grade_bands: drop mọi policy cũ → chỉ SELECT
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies
           WHERE schemaname = 'public' AND tablename = 'grade_bands'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.grade_bands', r.policyname);
  END LOOP;
END $$;

CREATE POLICY "grade_bands_select_only" ON public.grade_bands
  FOR SELECT USING (true);
