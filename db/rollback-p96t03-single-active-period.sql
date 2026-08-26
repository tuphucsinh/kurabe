-- ============================================================
-- ROLLBACK CANDIDATE ONLY — NOT APPLIED
-- KURABE QAQC — Rollback P96T03: Drop Single Active Period Partial Unique Index
-- DO NOT EXECUTE DIRECTLY WITHOUT EXPLICIT APPROVAL
-- ============================================================
-- Purpose:
--   Rollback candidate for migration 20260826_p96t03_single_active_period.sql.
--   Drops only the exact partial unique index idx_evaluation_periods_single_active.
--
-- Safety & Production Runbook Constraints:
--   1. Candidate Only: DO NOT execute without separate approval and catalog verification.
--   2. Hermetic Transaction: Executes within a single BEGIN ... COMMIT block.
--   3. Exact Index Only: Drops only `idx_evaluation_periods_single_active` with IF EXISTS.
--   4. Zero Data Mutation: No data modifications, deletes, or truncates.
-- ============================================================

BEGIN;

-- Drop the partial unique index created by P96T03 migration candidate
DROP INDEX IF EXISTS public.idx_evaluation_periods_single_active;

COMMIT;
