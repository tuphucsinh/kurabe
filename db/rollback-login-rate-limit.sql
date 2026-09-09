-- ============================================================
-- ROLLBACK CANDIDATE ONLY — NOT APPLIED
-- KURABE QAQC — Rollback P98M2T08: Drop Login Rate Limit RPC
-- DO NOT EXECUTE DIRECTLY WITHOUT EXPLICIT APPROVAL AND GUC CONFIRMATION
-- ============================================================
-- Purpose:
--   Rollback candidate for migration 20260907000200_login_rate_limit.sql.
--   Reverses only functions introduced by P98M2T08 candidate:
--     1. Drops function public.check_login_rate_limit(text, text, integer, integer, integer).
--     2. Drops function public.record_failed_login_transaction(text, text, integer, integer, integer).
--     3. Drops function public.clear_login_attempts(text, text).
--
-- Safety & Production Runbook Constraints:
--   1. Candidate Only: DO NOT execute without separate approval and catalog verification.
--   2. External Session Approval Guard:
--      Execution requires setting the custom PostgreSQL configuration setting:
--        SET kurabe.p98_rollback_approved = 'true';
--      in the active administrative session before running this script.
--      This script deliberately does NOT set this parameter internally.
--   3. Hermetic Transaction: Executes within a single BEGIN ... COMMIT block.
--   4. Fail-Closed Preflight: Validates ownership and provenance via exact P98 comment markers
--      on candidate functions before dropping. Fails closed if candidate objects exist with
--      absent or mismatched markers.
--   5. Scoped Teardown: Reverses ONLY functions introduced by P98M2T08.
--   6. Zero Mutation on Unrelated Objects: Does not drop tables, columns, or unrelated functions.
-- ============================================================

BEGIN;

-- 1. Preflight check: fail closed on unapproved execution or provenance mismatch
DO $$
DECLARE
  v_approved text;
  v_check_oid oid;
  v_record_oid oid;
  v_clear_oid oid;
  v_comment text;
BEGIN
  -- ------------------------------------------------------------
  -- 1. APPROVAL GUARD (Fail closed if GUC is not explicitly 'true')
  -- ------------------------------------------------------------
  v_approved := current_setting('kurabe.p98_rollback_approved', true);
  IF v_approved IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'ROLLBACK_UNAPPROVED: Execution aborted. Custom GUC kurabe.p98_rollback_approved must be set to ''true'' in this session prior to running rollback candidate.';
  END IF;

  -- ------------------------------------------------------------
  -- 2. PREFLIGHT CHECKS: Fail closed on provenance mismatch
  -- ------------------------------------------------------------
  v_check_oid := to_regprocedure('public.check_login_rate_limit(text, text, integer, integer, integer)')::oid;
  IF v_check_oid IS NOT NULL THEN
    SELECT description INTO v_comment
    FROM pg_description
    WHERE objoid = v_check_oid AND classoid = 'pg_proc'::regclass AND objsubid = 0;

    IF v_comment IS NULL OR v_comment != 'kurabe:p98:candidate:v1:function:check_login_rate_limit' THEN
      RAISE EXCEPTION 'P98_ROLLBACK_PREFLIGHT_FAILED: Function public.check_login_rate_limit provenance marker missing or mismatched (found: "%")', COALESCE(v_comment, '<none>');
    END IF;
  END IF;

  v_record_oid := to_regprocedure('public.record_failed_login_transaction(text, text, integer, integer, integer)')::oid;
  IF v_record_oid IS NOT NULL THEN
    SELECT description INTO v_comment
    FROM pg_description
    WHERE objoid = v_record_oid AND classoid = 'pg_proc'::regclass AND objsubid = 0;

    IF v_comment IS NULL OR v_comment != 'kurabe:p98:candidate:v1:function:record_failed_login_transaction' THEN
      RAISE EXCEPTION 'P98_ROLLBACK_PREFLIGHT_FAILED: Function public.record_failed_login_transaction provenance marker missing or mismatched (found: "%")', COALESCE(v_comment, '<none>');
    END IF;
  END IF;

  v_clear_oid := to_regprocedure('public.clear_login_attempts(text, text)')::oid;
  IF v_clear_oid IS NOT NULL THEN
    SELECT description INTO v_comment
    FROM pg_description
    WHERE objoid = v_clear_oid AND classoid = 'pg_proc'::regclass AND objsubid = 0;

    IF v_comment IS NULL OR v_comment != 'kurabe:p98:candidate:v1:function:clear_login_attempts' THEN
      RAISE EXCEPTION 'P98_ROLLBACK_PREFLIGHT_FAILED: Function public.clear_login_attempts provenance marker missing or mismatched (found: "%")', COALESCE(v_comment, '<none>');
    END IF;
  END IF;
END $$;

-- 2. Drop candidate functions
DROP FUNCTION IF EXISTS public.check_login_rate_limit(text, text, integer, integer, integer);
DROP FUNCTION IF EXISTS public.record_failed_login_transaction(text, text, integer, integer, integer);
DROP FUNCTION IF EXISTS public.clear_login_attempts(text, text);

COMMIT;
