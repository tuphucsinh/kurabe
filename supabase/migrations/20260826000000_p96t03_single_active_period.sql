-- ============================================================
-- CANDIDATE ONLY — NOT APPLIED
-- KURABE QAQC — Migration P96T03: Single Active Evaluation Period Constraint
-- DO NOT APPLY DIRECTLY WITHOUT SEPARATE APPROVAL AND DIRECT CATALOG GATE
-- ============================================================
-- Purpose:
--   Enforce invariant that at most one evaluation period may have status = 'active'
--   at any given time via a PostgreSQL partial unique index on evaluation_periods(status).
--
-- Operational & Safety Constraints:
--   1. Candidate Only: Direct pg_catalog/information_schema is currently unknown/blocked
--      pending Management API privileges. DO NOT apply until approved and catalog-verified.
--   2. Hermetic Transaction: Entire script executes within a single BEGIN ... COMMIT block.
--   3. Fail-Closed Preflight: Raises stable exception 'P96T03_PREFLIGHT_FAILED' if
--      more than 1 active period exists (count(status = 'active') > 1).
--   4. Zero Data Mutation: No data repair, deletion, or deduplication is performed.
--   5. Partial Unique Index: Explicit name `idx_evaluation_periods_single_active`
--      with predicate `status = 'active'`.
--
-- Rollback:
--   See /home/pi5/projects/kurabe/db/rollback-p96t03-single-active-period.sql
--   `DROP INDEX IF EXISTS public.idx_evaluation_periods_single_active;`
-- ============================================================

BEGIN;

-- 1. Explicit preflight check: fail closed if multiple active periods exist
DO $$
DECLARE
  v_active_count integer;
BEGIN
  SELECT count(*)
  INTO v_active_count
  FROM public.evaluation_periods
  WHERE status = 'active';

  IF v_active_count > 1 THEN
    RAISE EXCEPTION 'P96T03_PREFLIGHT_FAILED: Found % active evaluation periods (expected at most 1). Migration aborted without data repair.', v_active_count;
  END IF;
END $$;

-- 2. Partial unique index: enforces at most 1 active period simultaneously
CREATE UNIQUE INDEX idx_evaluation_periods_single_active
  ON public.evaluation_periods (status)
  WHERE status = 'active';

COMMENT ON INDEX public.idx_evaluation_periods_single_active IS 'P96T03: Enforces at most one active evaluation period at any time';

COMMIT;
