-- ============================================================
-- ROLLBACK CANDIDATE ONLY — NOT APPLIED
-- KURABE QAQC — Rollback P100M1T01: Revert Atomic AI Quota Contract
-- DO NOT EXECUTE DIRECTLY WITHOUT EXPLICIT APPROVAL AND GUC CONFIRMATION
-- ============================================================
-- Purpose:
--   Rollback candidate for migration 20260907000800_ai_quota.sql.
--   Reverses exactly the objects introduced by P100M1T01:
--     1. Drops functions public.ai_quota_reserve(text, uuid, text,
--        integer, integer, integer, text), public.ai_quota_consume(
--        text, uuid, text), and public.ai_quota_refund(text, uuid, text).
--     2. Drops the request-identity and retention indexes introduced by
--        the candidate (uq_*_user_request, idx_*_created_at).
--     3. Drops columns request_id and status from public.ai_usage and
--        public.chat_usage.
--   The tables themselves (ai_usage / chat_usage) and their historical
--   rows are NOT dropped by this rollback.
--
-- Safety & Production Runbook Constraints:
--   1. Candidate Only: DO NOT execute without separate approval and
--      catalog verification.
--   2. External Session Approval Guard:
--      Execution requires setting the custom PostgreSQL configuration setting:
--        SET kurabe.p100_rollback_approved = 'true';
--      in the active administrative session before running this script.
--      This script deliberately does NOT set this parameter internally.
--   3. Hermetic Transaction: Executes within a single BEGIN ... COMMIT block.
--   4. Fail-Closed Preflight: Validates ownership and provenance via exact
--      P100 comment markers on candidate functions before dropping. Fails
--      closed if candidate objects exist with absent or mismatched markers.
--   5. Scoped Teardown: Reverses ONLY objects introduced by P100M1T01.
--   6. Zero Mutation on Unrelated Objects: Does not drop tables, other
--      functions, or unrelated columns; preserves usage history rows.
-- ============================================================

BEGIN;

-- 1. Preflight check: fail closed on unapproved execution or provenance mismatch
DO $$
DECLARE
  v_approved text;
  v_reserve_oid oid;
  v_consume_oid oid;
  v_refund_oid oid;
  v_comment text;
BEGIN
  -- ------------------------------------------------------------
  -- 1. APPROVAL GUARD (Fail closed if GUC is not explicitly 'true')
  -- ------------------------------------------------------------
  v_approved := current_setting('kurabe.p100_rollback_approved', true);
  IF v_approved IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'ROLLBACK_UNAPPROVED: Execution aborted. Custom GUC kurabe.p100_rollback_approved must be set to ''true'' in this session prior to running rollback candidate.';
  END IF;

  -- ------------------------------------------------------------
  -- 2. PREFLIGHT CHECKS: Fail closed on provenance mismatch
  -- ------------------------------------------------------------
  v_reserve_oid := to_regprocedure('public.ai_quota_reserve(text, uuid, text, integer, integer, integer, text)')::oid;
  IF v_reserve_oid IS NOT NULL THEN
    SELECT description INTO v_comment
    FROM pg_description
    WHERE objoid = v_reserve_oid AND classoid = 'pg_proc'::regclass AND objsubid = 0;

    IF v_comment IS NULL OR v_comment != 'kurabe:p100:candidate:v1:function:ai_quota_reserve' THEN
      RAISE EXCEPTION 'P100_ROLLBACK_PREFLIGHT_FAILED: Function public.ai_quota_reserve provenance marker missing or mismatched (found: "%")', COALESCE(v_comment, '<none>');
    END IF;
  END IF;

  v_consume_oid := to_regprocedure('public.ai_quota_consume(text, uuid, text)')::oid;
  IF v_consume_oid IS NOT NULL THEN
    SELECT description INTO v_comment
    FROM pg_description
    WHERE objoid = v_consume_oid AND classoid = 'pg_proc'::regclass AND objsubid = 0;

    IF v_comment IS NULL OR v_comment != 'kurabe:p100:candidate:v1:function:ai_quota_consume' THEN
      RAISE EXCEPTION 'P100_ROLLBACK_PREFLIGHT_FAILED: Function public.ai_quota_consume provenance marker missing or mismatched (found: "%")', COALESCE(v_comment, '<none>');
    END IF;
  END IF;

  v_refund_oid := to_regprocedure('public.ai_quota_refund(text, uuid, text)')::oid;
  IF v_refund_oid IS NOT NULL THEN
    SELECT description INTO v_comment
    FROM pg_description
    WHERE objoid = v_refund_oid AND classoid = 'pg_proc'::regclass AND objsubid = 0;

    IF v_comment IS NULL OR v_comment != 'kurabe:p100:candidate:v1:function:ai_quota_refund' THEN
      RAISE EXCEPTION 'P100_ROLLBACK_PREFLIGHT_FAILED: Function public.ai_quota_refund provenance marker missing or mismatched (found: "%")', COALESCE(v_comment, '<none>');
    END IF;
  END IF;
END $$;

-- 2. Drop candidate functions
DROP FUNCTION IF EXISTS public.ai_quota_reserve(text, uuid, text, integer, integer, integer, text);
DROP FUNCTION IF EXISTS public.ai_quota_consume(text, uuid, text);
DROP FUNCTION IF EXISTS public.ai_quota_refund(text, uuid, text);

-- 3. Drop candidate indexes
DROP INDEX IF EXISTS public.uq_ai_usage_user_request;
DROP INDEX IF EXISTS public.idx_ai_usage_created_at;
DROP INDEX IF EXISTS public.uq_chat_usage_user_request;
DROP INDEX IF EXISTS public.idx_chat_usage_created_at;

-- 4. Drop candidate columns (tables and historical rows are preserved)
ALTER TABLE public.ai_usage
  DROP COLUMN IF EXISTS status,
  DROP COLUMN IF EXISTS request_id;

ALTER TABLE public.chat_usage
  DROP COLUMN IF EXISTS status,
  DROP COLUMN IF EXISTS request_id;

COMMIT;