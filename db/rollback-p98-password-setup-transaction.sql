-- ============================================================
-- ROLLBACK CANDIDATE ONLY — NOT APPLIED
-- KURABE QAQC — Rollback P98M2T02: Drop Password Setup Transaction RPCs
-- DO NOT EXECUTE DIRECTLY WITHOUT EXPLICIT APPROVAL AND GUC CONFIRMATION
-- ============================================================
-- Purpose:
--   Rollback candidate for migration 20260905072000_p98_password_setup_transaction.sql.
--   Reverses only functions introduced by P98M2T02 candidate:
--     1. Drops function public.reset_password_transaction(uuid, text, timestamptz).
--     2. Drops function public.complete_password_setup_transaction(text, text).
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
--   5. Scoped Teardown: Reverses ONLY functions introduced by P98M2T02.
--   6. Zero Mutation on Unrelated Objects: Does not drop tables, columns, or unrelated functions.
-- ============================================================

BEGIN;

-- 1. Preflight check: fail closed on unapproved execution or provenance mismatch
DO $$
DECLARE
  v_approved text;
  v_reset_oid oid;
  v_complete_oid oid;
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
  -- Check reset_password_transaction provenance if it exists
  v_reset_oid := to_regprocedure('public.reset_password_transaction(uuid, text, timestamptz)')::oid;
  IF v_reset_oid IS NOT NULL THEN
    SELECT description INTO v_comment
    FROM pg_description
    WHERE objoid = v_reset_oid AND classoid = 'pg_proc'::regclass AND objsubid = 0;

    IF v_comment IS NULL OR v_comment != 'kurabe:p98:candidate:v1:function:reset_password_transaction' THEN
      RAISE EXCEPTION 'P98_ROLLBACK_PREFLIGHT_FAILED: Function public.reset_password_transaction provenance marker missing or mismatched (found: "%")', COALESCE(v_comment, '<none>');
    END IF;
  END IF;

  -- Check complete_password_setup_transaction provenance if it exists
  v_complete_oid := to_regprocedure('public.complete_password_setup_transaction(text, text)')::oid;
  IF v_complete_oid IS NOT NULL THEN
    SELECT description INTO v_comment
    FROM pg_description
    WHERE objoid = v_complete_oid AND classoid = 'pg_proc'::regclass AND objsubid = 0;

    IF v_comment IS NULL OR v_comment != 'kurabe:p98:candidate:v1:function:complete_password_setup_transaction' THEN
      RAISE EXCEPTION 'P98_ROLLBACK_PREFLIGHT_FAILED: Function public.complete_password_setup_transaction provenance marker missing or mismatched (found: "%")', COALESCE(v_comment, '<none>');
    END IF;
  END IF;
END $$;

-- 2. Drop candidate functions
DROP FUNCTION IF EXISTS public.reset_password_transaction(uuid, text, timestamptz);
DROP FUNCTION IF EXISTS public.complete_password_setup_transaction(text, text);

COMMIT;
