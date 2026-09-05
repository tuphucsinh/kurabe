-- ============================================================
-- CANDIDATE ONLY — NOT APPLIED
-- KURABE QAQC — Migration P98M3T01: Evaluator Authorization NULL-Safety Candidate
-- DO NOT APPLY DIRECTLY WITHOUT SEPARATE APPROVAL AND CATALOG VERIFICATION
-- ============================================================
-- Purpose:
--   1. Replace the evaluator authorization comparison in the atomic evaluation RPC
--      `public.save_evaluation_round_transaction` with explicit NULL-safe rejection:
--        `IF v_round.evaluator_id IS NULL OR v_round.evaluator_id IS DISTINCT FROM p_actor_id THEN`
--      Rejecting unassigned (NULL evaluator_id) rounds and mismatched actor IDs fail-closed
--      with `UNAUTHORIZED_EVALUATOR`.
--   2. Maintain identical function signature, input parameter validation, row-locking order,
--      workflow status transitions, scoring calculations, and return table typing.
--   3. Maintain active-only wrapper `save_evaluation_round_transaction_active_only` delegation,
--      closed-period write firewall semantics, and service_role-only execute permissions.
--
-- Operational & Safety Constraints:
--   1. Candidate Only: Source candidate only. DO NOT apply to production without explicit approval.
--   2. Hermetic Transaction: Entire script executes within a single BEGIN ... COMMIT block.
--   3. Fail-Closed Provenance: Preflight checks verify prerequisite function presence and ownership.
--   4. Fixed Search Path & Security: SECURITY DEFINER with SET search_path = public.
--      Revokes execution from PUBLIC, anon, authenticated; grants ONLY to service_role.
--   5. Zero Business Mutation: No DML, no schema alteration on business tables.
--
-- Rollback:
--   See /home/pi5/projects/kurabe/db/rollback-p98-evaluator-null-safety.sql
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. PREFLIGHT PREREQUISITE & PROVENANCE CHECKS (Fail-Closed)
-- ------------------------------------------------------------
DO $$
DECLARE
  v_proc_oid oid;
  v_comment text;
BEGIN
  v_proc_oid := to_regprocedure('public.save_evaluation_round_transaction(uuid, integer, uuid, jsonb, jsonb, text, numeric, text, boolean, timestamptz, integer, uuid, text, text, boolean)')::oid;

  IF v_proc_oid IS NULL THEN
    RAISE EXCEPTION 'PREFLIGHT_FAIL: Prerequisite function public.save_evaluation_round_transaction does not exist.';
  END IF;

  SELECT description INTO v_comment
  FROM pg_description
  WHERE objoid = v_proc_oid AND classoid = 'pg_proc'::regclass AND objsubid = 0;

  IF v_comment IS NULL OR v_comment NOT IN (
    'kurabe:p3:candidate:v1:function:save_evaluation_round_transaction',
    'kurabe:p98:candidate:v1:function:save_evaluation_round_transaction'
  ) THEN
    RAISE EXCEPTION 'PROVENANCE_MISMATCH: Function public.save_evaluation_round_transaction exists but comment "%" does not match expected marker. Aborting.', v_comment;
  END IF;
END $$;

-- ------------------------------------------------------------
-- 2. CREATE OR REPLACE FUNCTION public.save_evaluation_round_transaction
-- (Evaluator Authorization NULL-Safety Hardening)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.save_evaluation_round_transaction(
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
  v_eval record;
  v_round record;
  v_round_id uuid;
  v_next_round_id uuid := NULL;
  v_final_status text;
  v_effective_time timestamptz;
  v_existing_next_round_id uuid;
BEGIN
  -- 1. Invariant Validation (Fail Closed)
  IF p_evaluation_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: p_evaluation_id cannot be null';
  END IF;

  IF p_round IS NULL OR p_round < 1 OR p_round > 3 THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: p_round must be between 1 and 3, received %', p_round;
  END IF;

  IF p_actor_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: p_actor_id cannot be null';
  END IF;

  IF p_scores IS NULL OR jsonb_typeof(p_scores) != 'object' THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: p_scores must be a valid jsonb object';
  END IF;

  IF p_notes IS NULL OR jsonb_typeof(p_notes) != 'object' THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: p_notes must be a valid jsonb object';
  END IF;

  IF p_total_score IS NOT NULL AND p_total_score < 0 THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: p_total_score cannot be negative, received %', p_total_score;
  END IF;

  IF p_grade IS NOT NULL AND p_grade NOT IN ('S', 'A', 'AB', 'B', 'C', 'D', 'Pending') THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: invalid grade %, expected one of S, A, AB, B, C, D, Pending', p_grade;
  END IF;

  IF p_is_submit IS TRUE THEN
    IF p_is_final IS FALSE THEN
      IF p_next_round IS NULL OR p_next_round < 1 OR p_next_round > 3 THEN
        RAISE EXCEPTION 'INVALID_ARGUMENT: Non-final submit requires valid p_next_round (1..3), received %', p_next_round;
      END IF;
      IF p_next_round <= p_round THEN
        RAISE EXCEPTION 'INVALID_ARGUMENT: p_next_round (%) must be greater than current round (%)', p_next_round, p_round;
      END IF;
      IF p_next_evaluator_id IS NULL THEN
        RAISE EXCEPTION 'INVALID_ARGUMENT: Non-final submit requires p_next_evaluator_id';
      END IF;
      IF p_next_evaluator_role IS NULL OR p_next_evaluator_role NOT IN ('Manager', 'Leader', 'SubLeader', 'Employee', 'Worker') THEN
        RAISE EXCEPTION 'INVALID_ARGUMENT: Non-final submit requires valid p_next_evaluator_role';
      END IF;
      IF p_next_status IS NULL OR p_next_status NOT IN ('NotStarted', 'Draft', 'Submitted', 'Reviewed', 'Approved') THEN
        RAISE EXCEPTION 'INVALID_ARGUMENT: Non-final submit requires valid p_next_status';
      END IF;
    ELSE
      IF p_next_status IS NOT NULL AND p_next_status NOT IN ('NotStarted', 'Draft', 'Submitted', 'Reviewed', 'Approved') THEN
        RAISE EXCEPTION 'INVALID_ARGUMENT: Final submit has invalid p_next_status %', p_next_status;
      END IF;
    END IF;
  END IF;

  v_effective_time := COALESCE(p_submitted_at, now());

  -- 2. Lock and authorize target evaluation
  SELECT id, status, current_round
  INTO v_eval
  FROM public.evaluations
  WHERE id = p_evaluation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'EVALUATION_NOT_FOUND: Evaluation % does not exist', p_evaluation_id;
  END IF;

  -- 3. Lock and authorize target evaluation_round
  SELECT id, status, submitted_at, evaluator_id
  INTO v_round
  FROM public.evaluation_rounds AS target_round
  WHERE target_round.evaluation_id = p_evaluation_id
    AND target_round.round = p_round
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ROUND_NOT_FOUND: Round % for evaluation % does not exist', p_round, p_evaluation_id;
  END IF;

  -- Evaluator Authorization NULL-Safety Hardening (P98M3T01):
  -- Fail closed if evaluator is unassigned (NULL) or mismatched with p_actor_id.
  -- Canonical check `v_round.evaluator_id != p_actor_id` evaluated to NULL (falsy)
  -- when evaluator_id was NULL, allowing unassigned rounds to bypass authorization.
  IF v_round.evaluator_id IS NULL OR v_round.evaluator_id IS DISTINCT FROM p_actor_id THEN
    RAISE EXCEPTION 'UNAUTHORIZED_EVALUATOR: Actor % is not assigned to round % (assigned: %)', p_actor_id, p_round, v_round.evaluator_id;
  END IF;

  IF v_round.submitted_at IS NOT NULL OR v_round.status = 'Submitted' THEN
    RAISE EXCEPTION 'ROUND_ALREADY_SUBMITTED: Round % for evaluation % is already submitted and locked', p_round, p_evaluation_id;
  END IF;

  v_round_id := v_round.id;

  -- 4. Update target round
  UPDATE public.evaluation_rounds
  SET
    scores = p_scores,
    notes = p_notes,
    comment = p_comment,
    total_score = p_total_score,
    grade = p_grade,
    status = CASE WHEN p_is_submit THEN 'Submitted' ELSE 'Draft' END,
    submitted_at = CASE WHEN p_is_submit THEN v_effective_time ELSE NULL END
  WHERE id = v_round_id;

  -- 5. Flow Transition
  IF p_is_submit IS FALSE THEN
    -- Draft flow: advance evaluation status to Draft if NotStarted
    IF v_eval.status = 'NotStarted' THEN
      UPDATE public.evaluations
      SET status = 'Draft', updated_at = v_effective_time
      WHERE id = p_evaluation_id;
      v_final_status := 'Draft';
    ELSE
      v_final_status := v_eval.status;
    END IF;
    v_next_round_id := NULL;
  ELSE
    -- Submit flow
    IF p_is_final IS FALSE THEN
      -- Check if next round already exists to prevent conflict/overwriting
      SELECT id INTO v_existing_next_round_id
      FROM public.evaluation_rounds AS next_round
      WHERE next_round.evaluation_id = p_evaluation_id
        AND next_round.round = p_next_round
      FOR UPDATE;

      IF v_existing_next_round_id IS NOT NULL THEN
        RAISE EXCEPTION 'CONFLICTING_NEXT_ROUND: Round % already exists for evaluation %', p_next_round, p_evaluation_id;
      END IF;

      -- Insert next round exactly once
      INSERT INTO public.evaluation_rounds (
        evaluation_id,
        round,
        evaluator_id,
        evaluator_role,
        scores,
        notes,
        total_score,
        grade,
        status,
        created_at
      ) VALUES (
        p_evaluation_id,
        p_next_round,
        p_next_evaluator_id,
        p_next_evaluator_role,
        '{}'::jsonb,
        '{}'::jsonb,
        0,
        'Pending',
        'NotStarted',
        v_effective_time
      )
      RETURNING id INTO v_next_round_id;

      -- Advance evaluation status and current_round
      UPDATE public.evaluations
      SET
        status = p_next_status,
        current_round = p_next_round,
        return_note = NULL,
        updated_at = v_effective_time
      WHERE id = p_evaluation_id;

      v_final_status := p_next_status;
    ELSE
      -- Final submit flow
      v_final_status := COALESCE(p_next_status, 'Approved');
      v_next_round_id := NULL;

      UPDATE public.evaluations
      SET
        status = v_final_status,
        current_round = p_round,
        final_grade = p_grade,
        final_score = p_total_score,
        return_note = NULL,
        updated_at = v_effective_time
      WHERE id = p_evaluation_id;
    END IF;
  END IF;

  -- 6. Return Typed Result Row
  round_id := v_round_id;
  evaluation_id := p_evaluation_id;
  next_round_id := v_next_round_id;
  final_status := v_final_status;
  RETURN NEXT;
END;
$$;

-- ------------------------------------------------------------
-- 3. PROVENANCE MARKER & SERVICE-ROLE PERMISSIONS
-- ------------------------------------------------------------
COMMENT ON FUNCTION public.save_evaluation_round_transaction(
  uuid, integer, uuid, jsonb, jsonb, text, numeric, text, boolean, timestamptz, integer, uuid, text, text, boolean
) IS 'kurabe:p98:candidate:v1:function:save_evaluation_round_transaction';

REVOKE EXECUTE ON FUNCTION public.save_evaluation_round_transaction(
  uuid, integer, uuid, jsonb, jsonb, text, numeric, text, boolean, timestamptz, integer, uuid, text, text, boolean
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.save_evaluation_round_transaction(
  uuid, integer, uuid, jsonb, jsonb, text, numeric, text, boolean, timestamptz, integer, uuid, text, text, boolean
) TO service_role;

-- ------------------------------------------------------------
-- 4. ACTIVE-ONLY WRAPPER CONSISTENCY & PROVENANCE VERIFICATION
-- ------------------------------------------------------------
DO $$
DECLARE
  v_wrapper_proc_oid oid;
  v_wrapper_comment text;
BEGIN
  v_wrapper_proc_oid := to_regprocedure('public.save_evaluation_round_transaction_active_only(uuid, integer, uuid, jsonb, jsonb, text, numeric, text, boolean, timestamptz, integer, uuid, text, text, boolean)')::oid;

  IF v_wrapper_proc_oid IS NOT NULL THEN
    SELECT description INTO v_wrapper_comment
    FROM pg_description
    WHERE objoid = v_wrapper_proc_oid AND classoid = 'pg_proc'::regclass AND objsubid = 0;

    IF v_wrapper_comment IS DISTINCT FROM 'kurabe:p96t05:candidate:v1:function:save_evaluation_round_transaction_active_only' THEN
      RAISE EXCEPTION 'PROVENANCE_MISMATCH: Function public.save_evaluation_round_transaction_active_only exists but comment "%" does not match expected marker "kurabe:p96t05:candidate:v1:function:save_evaluation_round_transaction_active_only". Aborting.', v_wrapper_comment;
    END IF;

    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.save_evaluation_round_transaction_active_only(uuid, integer, uuid, jsonb, jsonb, text, numeric, text, boolean, timestamptz, integer, uuid, text, text, boolean) FROM PUBLIC, anon, authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.save_evaluation_round_transaction_active_only(uuid, integer, uuid, jsonb, jsonb, text, numeric, text, boolean, timestamptz, integer, uuid, text, text, boolean) TO service_role';
  END IF;
END $$;

COMMIT;
