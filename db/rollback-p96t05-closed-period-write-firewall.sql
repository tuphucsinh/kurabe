-- ============================================================
-- ROLLBACK CANDIDATE ONLY — NOT APPLIED
-- KURABE QAQC — Rollback P96T05: Drop Closed-Period Write Firewall Wrapper RPC
-- DO NOT EXECUTE DIRECTLY WITHOUT EXPLICIT APPROVAL AND GUC CONFIRMATION
--
-- CRITICAL OPERATIONAL CONSTRAINTS:
-- 1. Candidate Only: Direct pg_catalog/information_schema is currently unknown/blocked.
--    DO NOT execute without separate approval and catalog verification.
-- 2. External Session Approval Guard:
--    Execution requires setting the custom PostgreSQL configuration setting:
--      SET kurabe.p96t05_rollback_approved = 'true';
--    in the active administrative session before running this script.
--    This script deliberately does NOT set this parameter internally.
-- 3. Provenance Verification:
--    The wrapper function is inspected in pg_description prior to dropping.
--    If the function exists with an absent or mismatched provenance marker,
--    the script fails closed with RAISE EXCEPTION to prevent dropping
--    unowned or pre-existing database objects.
-- 4. Exact Signature Only:
--    Drops only the exact function signature created by P96T05 candidate:
--    public.save_evaluation_round_transaction_active_only(uuid, integer, uuid, jsonb, jsonb, text, numeric, text, boolean, timestamptz, integer, uuid, text, text, boolean)
--    No broad DROP FUNCTION or unverified IF EXISTS is used.
-- 5. Zero Data Mutation:
--    This script ONLY drops the wrapper RPC function. It DOES NOT modify, delete,
--    or truncate business data rows in any table.
-- ============================================================

BEGIN;

DO $$
DECLARE
  v_approved text;
  v_proc_oid oid;
  v_comment text;
BEGIN
  -- ------------------------------------------------------------
  -- 1. APPROVAL GUARD (Fail closed if GUC is not explicitly 'true')
  -- ------------------------------------------------------------
  v_approved := current_setting('kurabe.p96t05_rollback_approved', true);
  IF v_approved IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'ROLLBACK_UNAPPROVED: Execution aborted. Custom GUC kurabe.p96t05_rollback_approved must be set to ''true'' in this session prior to running rollback candidate.';
  END IF;

  -- ------------------------------------------------------------
  -- 2. DROP FUNCTION public.save_evaluation_round_transaction_active_only
  -- ------------------------------------------------------------
  v_proc_oid := to_regprocedure('public.save_evaluation_round_transaction_active_only(uuid, integer, uuid, jsonb, jsonb, text, numeric, text, boolean, timestamptz, integer, uuid, text, text, boolean)')::oid;

  IF v_proc_oid IS NOT NULL THEN
    SELECT description INTO v_comment
    FROM pg_description
    WHERE objoid = v_proc_oid AND classoid = 'pg_proc'::regclass AND objsubid = 0;

    IF v_comment IS DISTINCT FROM 'kurabe:p96t05:candidate:v1:function:save_evaluation_round_transaction_active_only' THEN
      RAISE EXCEPTION 'PROVENANCE_MISMATCH: Function public.save_evaluation_round_transaction_active_only exists but comment "%" does not match expected marker "kurabe:p96t05:candidate:v1:function:save_evaluation_round_transaction_active_only". Aborting.', v_comment;
    END IF;

    EXECUTE 'DROP FUNCTION public.save_evaluation_round_transaction_active_only(uuid, integer, uuid, jsonb, jsonb, text, numeric, text, boolean, timestamptz, integer, uuid, text, text, boolean)';
    RAISE NOTICE 'DROPPED: Function public.save_evaluation_round_transaction_active_only(uuid, integer, uuid, jsonb, jsonb, text, numeric, text, boolean, timestamptz, integer, uuid, text, text, boolean)';
  ELSE
    RAISE NOTICE 'SKIPPED: Function public.save_evaluation_round_transaction_active_only not found (already absent)';
  END IF;

END $$;

COMMIT;
