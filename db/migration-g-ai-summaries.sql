-- ============================================================
-- KURABE QAQC — Migration Phase 57: AI Summaries (cache tóm tắt kỳ)
-- Chạy trên Supabase SQL Editor / Management API (2026-08-13)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.ai_summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id uuid NOT NULL REFERENCES public.evaluation_periods(id) ON DELETE CASCADE,
  summary text NOT NULL,
  created_by text,
  created_at timestamptz DEFAULT now(),
  UNIQUE (period_id)
);

-- RLS: anon chỉ SELECT (INSERT qua service-role admin client)
ALTER TABLE public.ai_summaries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ai_summaries_select_only" ON public.ai_summaries;
CREATE POLICY "ai_summaries_select_only" ON public.ai_summaries
  FOR SELECT USING (true);
