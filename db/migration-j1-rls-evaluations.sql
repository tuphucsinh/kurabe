-- ============================================================
-- KURABE QAQC — Migration Phase 70 (P70T01): j1 — siết RLS evaluations
-- Chạy trên Supabase SQL Editor / Management API (2026-08-14)
-- ============================================================
-- Mọi write evaluation/rounds/responses đã qua server actions (supabaseAdmin).
-- anon giờ chỉ SELECT (mô hình anon-read như grade_bands/periods — migration-d).
DROP POLICY IF EXISTS "Enable all access for anon" ON public.evaluations;
DROP POLICY IF EXISTS "Enable all access for anon" ON public.evaluation_rounds;
DROP POLICY IF EXISTS "Enable all access for anon" ON public.evaluation_responses;

CREATE POLICY "evaluations_select_only" ON public.evaluations
  FOR SELECT USING (true);

CREATE POLICY "evaluation_rounds_select_only" ON public.evaluation_rounds
  FOR SELECT USING (true);

CREATE POLICY "evaluation_responses_select_only" ON public.evaluation_responses
  FOR SELECT USING (true);
