-- ============================================================
-- KURABE QAQC — Migration Phase 81 (P81M1T02): Criterion Audiences
-- Candidate migration only (NOT APPLIED)
-- ============================================================
-- Purpose:
--   1. Create canonical relation table `criterion_audiences` for
--      QL ('management'), NV ('employee'), CN ('worker') criterion applicability.
--   2. Backfill existing legacy `criteria.applies_to` values:
--        'leader'     -> 'management'
--        'staff'      -> 'employee'
--        'both'/NULL  -> 'management', 'employee'
--   3. Preflight check: reject unknown non-empty applies_to values.
--   4. Enable RLS with anon SELECT-only; restrict all writes to service_role / supabaseAdmin.
--   5. Maintain full idempotence and preserve legacy `criteria.applies_to` for rollback.
--
-- Rollback Notes:
--   - Legacy `criteria.applies_to` is preserved untouched by this migration.
--   - To revert DB schema:
--       DROP TABLE IF EXISTS public.criterion_audiences CASCADE;
--   - Code rollback note:
--       If application code is rolled back after new criterion audience edits
--       (e.g., worker applicability additions), restoring DB state requires
--       restoring the candidate table/data snapshot.
-- ============================================================

-- 1. Preflight check: verify no unknown non-empty legacy applies_to values exist
DO $$
DECLARE
  v_unknown_count integer;
  v_unknown_values text;
BEGIN
  SELECT count(*), string_agg(DISTINCT applies_to, ', ')
  INTO v_unknown_count, v_unknown_values
  FROM public.criteria
  WHERE applies_to IS NOT NULL
    AND trim(applies_to) <> ''
    AND applies_to NOT IN ('leader', 'staff', 'both');

  IF v_unknown_count > 0 THEN
    RAISE EXCEPTION 'Migration preflight check failed: Found % criteria with unknown applies_to values: %', v_unknown_count, v_unknown_values;
  END IF;
END $$;

-- 2. Create canonical criterion_audiences table
CREATE TABLE IF NOT EXISTS public.criterion_audiences (
  criterion_id uuid NOT NULL REFERENCES public.criteria(id) ON DELETE CASCADE,
  audience text NOT NULL CHECK (audience IN ('management', 'employee', 'worker')),
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (criterion_id, audience)
);

CREATE INDEX IF NOT EXISTS idx_criterion_audiences_criterion_id
  ON public.criterion_audiences(criterion_id);

CREATE INDEX IF NOT EXISTS idx_criterion_audiences_audience
  ON public.criterion_audiences(audience);

-- 3. Idempotent backfill from legacy applies_to
-- 3a. 'leader' -> 'management'
INSERT INTO public.criterion_audiences (criterion_id, audience)
SELECT id, 'management'
FROM public.criteria
WHERE applies_to = 'leader'
ON CONFLICT (criterion_id, audience) DO NOTHING;

-- 3b. 'staff' -> 'employee'
INSERT INTO public.criterion_audiences (criterion_id, audience)
SELECT id, 'employee'
FROM public.criteria
WHERE applies_to = 'staff'
ON CONFLICT (criterion_id, audience) DO NOTHING;

-- 3c. 'both' or NULL or empty -> 'management' AND 'employee'
INSERT INTO public.criterion_audiences (criterion_id, audience)
SELECT id, 'management'
FROM public.criteria
WHERE applies_to = 'both' OR applies_to IS NULL OR trim(applies_to) = ''
ON CONFLICT (criterion_id, audience) DO NOTHING;

INSERT INTO public.criterion_audiences (criterion_id, audience)
SELECT id, 'employee'
FROM public.criteria
WHERE applies_to = 'both' OR applies_to IS NULL OR trim(applies_to) = ''
ON CONFLICT (criterion_id, audience) DO NOTHING;

-- 4. Enable RLS and configure anon SELECT-only policy
ALTER TABLE public.criterion_audiences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "criterion_audiences_select_only" ON public.criterion_audiences;
DROP POLICY IF EXISTS "Enable all access for anon" ON public.criterion_audiences;

CREATE POLICY "criterion_audiences_select_only" ON public.criterion_audiences
  FOR SELECT USING (true);

-- 5. Privileges: anon and authenticated get SELECT only; no write permissions
GRANT SELECT ON public.criterion_audiences TO anon;
GRANT SELECT ON public.criterion_audiences TO authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.criterion_audiences FROM anon;
