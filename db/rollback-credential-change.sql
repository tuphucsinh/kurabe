-- ============================================================
-- ROLLBACK CANDIDATE ONLY — NOT APPLIED
-- KURABE QAQC — Rollback P98M2T07: Drop Self-Change Credential RPC
-- DO NOT EXECUTE DIRECTLY WITHOUT EXPLICIT APPROVAL AND GUC CONFIRMATION
-- ============================================================
-- Purpose:
--   Rollback candidate for migration 20260907000100_credential_change.sql.
--   Reverses only functions introduced by P98M2T07 candidate:
--     1. Drops function public.change_password_transaction(uuid, text, text, text).
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
--   5. Scoped Teardown: Reverses ONLY function introduced by P98M2T07.
--   6. Zero Mutation on Unrelated Objects: Does not drop tables, columns, or unrelated functions.
-- ============================================================

BEGIN;

-- 1. Preflight check: fail closed on unapproved execution or provenance mismatch
DO $$
DECLARE
  v_approved text;
  v_change_oid oid;
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
  v_change_oid := to_regprocedure('public.change_password_transaction(uuid, text, text, text)')::oid;
  IF v_change_oid IS NOT NULL THEN
    SELECT description INTO v_comment
    FROM pg_description
    WHERE objoid = v_change_oid AND classoid = 'pg_proc'::regclass AND objsubid = 0;

    IF v_comment IS NULL OR v_comment != 'kurabe:p98:candidate:v1:function:change_password_transaction' THEN
      RAISE EXCEPTION 'P98_ROLLBACK_PREFLIGHT_FAILED: Function public.change_password_transaction provenance marker missing or mismatched (found: "%")', COALESCE(v_comment, '<none>');
    END IF;
  END IF;
END $$;

-- 2. Drop candidate function
DROP FUNCTION IF EXISTS public.change_password_transaction(uuid, text, text, text);

COMMIT;
