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
--   2. External Session Approval Guard: The active administrative session must set
--      `kurabe.p96t03_rollback_approved = 'true'`; this script never sets it internally.
--   3. Provenance Verification: If the exact index exists, its pg_description comment
--      must equal the marker written by the forward P96T03 migration; otherwise fail closed.
--   4. Hermetic Transaction: Executes within a single BEGIN ... COMMIT block.
--   5. Exact Index Only: Drops only `idx_evaluation_periods_single_active` with IF EXISTS.
--   6. Zero Data Mutation: No data modifications, deletes, or truncates.
-- ============================================================

BEGIN;

DO $$
DECLARE
  v_approved text;
  v_index_oid oid;
  v_comment text;
BEGIN
  v_approved := current_setting('kurabe.p96t03_rollback_approved', true);
  IF v_approved IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'ROLLBACK_UNAPPROVED: Execution aborted. Custom GUC kurabe.p96t03_rollback_approved must be set to ''true'' in this session prior to running rollback candidate.';
  END IF;

  v_index_oid := to_regclass('public.idx_evaluation_periods_single_active')::oid;
  IF v_index_oid IS NOT NULL THEN
    SELECT obj_description(v_index_oid, 'pg_class') INTO v_comment;
    IF v_comment IS DISTINCT FROM 'P96T03: Enforces at most one active evaluation period at any time' THEN
      RAISE EXCEPTION 'PROVENANCE_MISMATCH: Index public.idx_evaluation_periods_single_active exists but comment "%" does not match the P96T03 forward migration marker. Aborting.', v_comment;
    END IF;
  END IF;
END $$;

-- Drop the partial unique index created by P96T03 migration candidate
DROP INDEX IF EXISTS public.idx_evaluation_periods_single_active;

COMMIT;
