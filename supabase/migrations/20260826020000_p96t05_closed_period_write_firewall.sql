-- ============================================================
-- CANDIDATE ONLY — NOT APPLIED
-- KURABE QAQC — Migration P96T05: Closed-Period Write Firewall Candidate
-- DO NOT APPLY DIRECTLY WITHOUT SEPARATE APPROVAL AND DIRECT CATALOG GATE
-- ============================================================
-- Purpose:
--   Creates a transactional RPC wrapper `save_evaluation_round_transaction_active_only`
--   that locks the parent evaluation_period row (`FOR UPDATE OF ep`), validates that the
--   period status is exact 'active', and delegates to the underlying P3 transactional RPC
--   `save_evaluation_round_transaction` within the same PostgreSQL transaction.
--
-- Operational & Safety Constraints:
--   1. Candidate Only: Direct pg_catalog/information_schema is currently unknown/blocked
--      pending Management API privileges. DO NOT apply until approved and catalog-verified.
--   2. Prerequisite Ordering: The underlying P3 function `save_evaluation_round_transaction`
--      with exact provenance comment 'kurabe:p3:candidate:v1:function:save_evaluation_round_transaction'
--      MUST exist in the database. The preflight check fails closed if absent or mismatched.
--   3. Hermetic Transaction: Entire script executes within a single BEGIN ... COMMIT block.
--   4. Fail-Closed One-Shot: Replaces no unowned objects; fails closed if the wrapper function already exists.
--   5. Fixed Search Path & Security: SECURITY DEFINER with SET search_path = public.
--      Revokes execution from PUBLIC, anon, and authenticated; grants ONLY to service_role.
--   6. Zero Evaluator Workflow Duplication: SQL wrapper performs only period lock & status check;
--      scoring and workflow transitions are handled entirely by the underlying P3 transaction and TypeScript.
--   7. Zero Data Mutation: No table DML, backfill, or schema modification on business tables.
--
-- Rollback:
--   See /home/pi5/projects/kurabe/db/rollback-p96t05-closed-period-write-firewall.sql
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. PREFLIGHT PREREQUISITE & COLLISION CHECKS (Fail-Closed One-Shot)
-- ------------------------------------------------------------
DO $$
DECLARE
  v_p3_proc_oid oid;
  v_p3_comment text;
  v_wrapper_proc_oid oid;
  v_wrapper_comment text;
BEGIN
  -- A. Check prerequisite P3 function existence and provenance marker
  v_p3_proc_oid := to_regprocedure('public.save_evaluation_round_transaction(uuid, integer, uuid, jsonb, jsonb, text, numeric, text, boolean, timestamptz, integer, uuid, text, text, boolean)')::oid;

  IF v_p3_proc_oid IS NULL THEN
    RAISE EXCEPTION 'PREREQUISITE_MISSING: Prerequisite function public.save_evaluation_round_transaction does not exist. P3 migration is required prior to P96T05.';
  END IF;

  SELECT description INTO v_p3_comment
  FROM pg_description
  WHERE objoid = v_p3_proc_oid AND classoid = 'pg_proc'::regclass AND objsubid = 0;

  IF v_p3_comment IS DISTINCT FROM 'kurabe:p3:candidate:v1:function:save_evaluation_round_transaction' THEN
    RAISE EXCEPTION 'PROVENANCE_MISMATCH: Prerequisite function public.save_evaluation_round_transaction exists but comment "%" does not match expected marker "kurabe:p3:candidate:v1:function:save_evaluation_round_transaction". Aborting.', v_p3_comment;
  END IF;

  -- B. Check wrapper collision (must not pre-exist)
  v_wrapper_proc_oid := to_regprocedure('public.save_evaluation_round_transaction_active_only(uuid, integer, uuid, jsonb, jsonb, text, numeric, text, boolean, timestamptz, integer, uuid, text, text, boolean)')::oid;

  IF v_wrapper_proc_oid IS NOT NULL THEN
    SELECT description INTO v_wrapper_comment
    FROM pg_description
    WHERE objoid = v_wrapper_proc_oid AND classoid = 'pg_proc'::regclass AND objsubid = 0;

    RAISE EXCEPTION 'COLLISION: Function public.save_evaluation_round_transaction_active_only already exists (comment: "%"). Migration is one-shot; aborting to prevent unowned replacement.', v_wrapper_comment;
  END IF;
END $$;

-- ------------------------------------------------------------
-- 2. CREATE ACTIVE-ONLY WRAPPER RPC FUNCTION
-- ------------------------------------------------------------
CREATE FUNCTION public.save_evaluation_round_transaction_active_only(
  p_evaluation_id uuid,
  p_round integer,
  p_actor_id uuid,
  p_scores jsonb,
  p_notes jsonb,
  p_comment text,
  p_total_score numeric,
  p_grade text,
  p_is_submit boolean,
  p_submitted_at timestamptz DEFAULT now(),
  p_next_round integer DEFAULT NULL,
  p_next_evaluator_id uuid DEFAULT NULL,
  p_next_evaluator_role text DEFAULT NULL,
  p_next_status text DEFAULT NULL,
  p_is_final boolean DEFAULT false
)
RETURNS TABLE (
  round_id uuid,
  evaluation_id uuid,
  next_round_id uuid,
  final_status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period_id uuid;
  v_period_status text;
BEGIN
  -- 1. Invariant Validation (Fail Closed)
  IF p_evaluation_id IS NULL THEN
    RAISE EXCEPTION 'P96T05_INVALID_ARGUMENT: p_evaluation_id cannot be null';
  END IF;

  -- 2. Lock exact parent period row FOR UPDATE and verify exact status = 'active'
  SELECT ep.id, ep.status
  INTO v_period_id, v_period_status
  FROM public.evaluations e
  JOIN public.evaluation_periods ep ON ep.id = e.period_id
  WHERE e.id = p_evaluation_id
  FOR UPDATE OF ep;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'P96T05_EVALUATION_OR_PERIOD_NOT_FOUND: Evaluation % or associated period not found', p_evaluation_id;
  END IF;

  IF v_period_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'P96T05_PERIOD_NOT_ACTIVE: Evaluation period % is not active (current status: %)', v_period_id, v_period_status;
  END IF;

  -- 3. Delegate to existing P3 transaction function in the same PostgreSQL transaction
  RETURN QUERY
  SELECT *
  FROM public.save_evaluation_round_transaction(
    p_evaluation_id,
    p_round,
    p_actor_id,
    p_scores,
    p_notes,
    p_comment,
    p_total_score,
    p_grade,
    p_is_submit,
    p_submitted_at,
    p_next_round,
    p_next_evaluator_id,
    p_next_evaluator_role,
    p_next_status,
    p_is_final
  );
END;
$$;

-- ------------------------------------------------------------
-- 3. PROVENANCE MARKER & PERMISSIONS
-- ------------------------------------------------------------
COMMENT ON FUNCTION public.save_evaluation_round_transaction_active_only(
  uuid, integer, uuid, jsonb, jsonb, text, numeric, text, boolean, timestamptz, integer, uuid, text, text, boolean
) IS 'kurabe:p96t05:candidate:v1:function:save_evaluation_round_transaction_active_only';

REVOKE EXECUTE ON FUNCTION public.save_evaluation_round_transaction_active_only(
  uuid, integer, uuid, jsonb, jsonb, text, numeric, text, boolean, timestamptz, integer, uuid, text, text, boolean
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.save_evaluation_round_transaction_active_only(
  uuid, integer, uuid, jsonb, jsonb, text, numeric, text, boolean, timestamptz, integer, uuid, text, text, boolean
) TO service_role;

COMMIT;
