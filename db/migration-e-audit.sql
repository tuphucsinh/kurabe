-- ============================================================
-- KURABE QAQC — Migration Phase 54: Audit log (bảng nhật ký)
-- Chạy trên Supabase SQL Editor / Management API (2026-08-13)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id text,
  actor_name text,
  action text NOT NULL,
  entity text NOT NULL,
  entity_id text,
  detail jsonb,
  created_at timestamptz DEFAULT now()
);

-- RLS: anon chỉ SELECT (INSERT qua service-role admin client — vượt RLS)
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "audit_logs_select_only" ON public.audit_logs;
CREATE POLICY "audit_logs_select_only" ON public.audit_logs
  FOR SELECT USING (true);
