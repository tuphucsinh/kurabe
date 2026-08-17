-- ============================================================
-- KURABE QAQC — Migration Phase 81: Worker Grade Bands
-- Candidate migration only (NOT APPLIED)
-- ============================================================
-- Purpose:
--   1. Safely extend the role_group check constraint on public.grade_bands
--      to permit 'worker' alongside 'leader' and 'staff'.
--   2. Seed initial worker grade bands copied from existing staff thresholds.
--   3. Maintain full idempotence and preserve existing data & RLS policies.
--
-- Idempotence:
--   - Safe PL/pgSQL block to find and drop existing role_group CHECK constraints.
--   - Re-creates named constraint 'grade_bands_role_group_check'.
--   - INSERT uses ON CONFLICT (role_group, grade) DO NOTHING.
--
-- Rollback Notes:
--   To revert this migration:
--     DELETE FROM public.grade_bands WHERE role_group = 'worker';
--     ALTER TABLE public.grade_bands DROP CONSTRAINT IF EXISTS grade_bands_role_group_check;
--     ALTER TABLE public.grade_bands ADD CONSTRAINT grade_bands_role_group_check CHECK (role_group IN ('leader', 'staff'));
-- ============================================================

-- 1. Safely drop existing role_group CHECK constraint(s) and re-create with 'worker'
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT conname
        FROM pg_constraint c
        JOIN pg_class t ON c.conrelid = t.oid
        JOIN pg_namespace n ON t.relnamespace = n.oid
        WHERE n.nspname = 'public'
          AND t.relname = 'grade_bands'
          AND c.contype = 'c'
          AND pg_get_constraintdef(c.oid) LIKE '%role_group%'
    ) LOOP
        EXECUTE 'ALTER TABLE public.grade_bands DROP CONSTRAINT IF EXISTS ' || quote_ident(r.conname);
    END LOOP;
END $$;

ALTER TABLE public.grade_bands
  ADD CONSTRAINT grade_bands_role_group_check
  CHECK (role_group IN ('leader', 'staff', 'worker'));

-- 2. Seed initial 'worker' thresholds copied from current 'staff' thresholds
-- If 'staff' rows exist in DB, copy their exact current thresholds:
INSERT INTO public.grade_bands (role_group, grade, min_score, max_score, sort_order)
SELECT 'worker', grade, min_score, max_score, sort_order
FROM public.grade_bands
WHERE role_group = 'staff'
ON CONFLICT (role_group, grade) DO NOTHING;

-- Fallback insert if 'staff' rows were not yet present in DB:
INSERT INTO public.grade_bands (role_group, grade, min_score, max_score, sort_order) VALUES
  ('worker', 'S',  155, NULL, 0),
  ('worker', 'A',  145, 154,  1),
  ('worker', 'AB', 115, 144,  2),
  ('worker', 'B',  90,  114,  3),
  ('worker', 'C',  60,  89,   4),
  ('worker', 'D',  NULL, 59,  5)
ON CONFLICT (role_group, grade) DO NOTHING;

-- 3. RLS preservation note:
-- Existing RLS policies (e.g. "grade_bands_all") and table permissions remain unchanged.
