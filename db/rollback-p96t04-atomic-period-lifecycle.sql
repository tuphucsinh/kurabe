-- ============================================================
-- ROLLBACK CANDIDATE ONLY — NOT APPLIED
-- KURABE QAQC — Rollback P96T04: Drop Atomic Period Lifecycle RPC Functions
-- DO NOT EXECUTE DIRECTLY WITHOUT EXPLICIT APPROVAL AND GUC CONFIRMATION
--
-- CRITICAL OPERATIONAL CONSTRAINTS:
-- 1. Candidate Only: Direct pg_catalog/information_schema is currently unknown/blocked.
--    DO NOT execute without separate approval and catalog verification.
-- 2. External Session Approval Guard:
--    Execution requires setting the custom PostgreSQL configuration setting:
--      SET kurabe.p96t04_rollback_approved = 'true';
--    in the active administrative session before running this script.
--    This script deliberately does NOT set this parameter internally.
-- 3. Provenance Verification:
--    Every function is inspected in pg_description prior to dropping.
--    If a function exists with an absent or mismatched provenance marker,
--    the script fails closed with RAISE EXCEPTION to prevent dropping
--    unowned or pre-existing database objects.
-- 4. Exact Signatures Only:
--    Drops only the exact function signatures created by P96T04 candidate;
--    no broad DROP or unverified IF EXISTS is used.
-- 5. Zero Data Mutation:
--    This script ONLY drops RPC functions. It DOES NOT modify, delete,
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
  v_approved := current_setting('kurabe.p96t04_rollback_approved', true);
  IF v_approved IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'ROLLBACK_UNAPPROVED: Execution aborted. Custom GUC kurabe.p96t04_rollback_approved must be set to ''true'' in this session prior to running rollback candidate.';
  END IF;

  -- ------------------------------------------------------------
  -- 2. DROP FUNCTION public.create_evaluation_period_atomic
  -- ------------------------------------------------------------
  v_proc_oid := to_regprocedure('public.create_evaluation_period_atomic(text, integer, uuid, timestamptz, jsonb, jsonb)')::oid;

  IF v_proc_oid IS NOT NULL THEN
    SELECT description INTO v_comment
    FROM pg_description
    WHERE objoid = v_proc_oid AND classoid = 'pg_proc'::regclass AND objsubid = 0;

    IF v_comment IS DISTINCT FROM 'kurabe:p96t04:candidate:v1:function:create_evaluation_period_atomic' THEN
      RAISE EXCEPTION 'PROVENANCE_MISMATCH: Function public.create_evaluation_period_atomic exists but comment "%" does not match expected marker "kurabe:p96t04:candidate:v1:function:create_evaluation_period_atomic". Aborting.', v_comment;
    END IF;

    EXECUTE 'DROP FUNCTION public.create_evaluation_period_atomic(text, integer, uuid, timestamptz, jsonb, jsonb)';
    RAISE NOTICE 'DROPPED: Function public.create_evaluation_period_atomic(text, integer, uuid, timestamptz, jsonb, jsonb)';
  ELSE
    RAISE NOTICE 'SKIPPED: Function public.create_evaluation_period_atomic not found (already absent)';
  END IF;

  -- ------------------------------------------------------------
  -- 3. DROP FUNCTION public.delete_empty_evaluation_period_atomic
  -- ------------------------------------------------------------
  v_proc_oid := to_regprocedure('public.delete_empty_evaluation_period_atomic(uuid)')::oid;

  IF v_proc_oid IS NOT NULL THEN
    SELECT description INTO v_comment
    FROM pg_description
    WHERE objoid = v_proc_oid AND classoid = 'pg_proc'::regclass AND objsubid = 0;

    IF v_comment IS DISTINCT FROM 'kurabe:p96t04:candidate:v1:function:delete_empty_evaluation_period_atomic' THEN
      RAISE EXCEPTION 'PROVENANCE_MISMATCH: Function public.delete_empty_evaluation_period_atomic exists but comment "%" does not match expected marker "kurabe:p96t04:candidate:v1:function:delete_empty_evaluation_period_atomic". Aborting.', v_comment;
    END IF;

    EXECUTE 'DROP FUNCTION public.delete_empty_evaluation_period_atomic(uuid)';
    RAISE NOTICE 'DROPPED: Function public.delete_empty_evaluation_period_atomic(uuid)';
  ELSE
    RAISE NOTICE 'SKIPPED: Function public.delete_empty_evaluation_period_atomic not found (already absent)';
  END IF;

END $$;

COMMIT;
