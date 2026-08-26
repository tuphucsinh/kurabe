-- ============================================================
-- CANDIDATE ONLY — NOT APPLIED
-- KURABE QAQC — Migration P96T04: Atomic Period Lifecycle RPC Candidate
-- DO NOT APPLY DIRECTLY WITHOUT SEPARATE APPROVAL AND DIRECT CATALOG GATE
-- ============================================================
-- Purpose:
--   1. create_evaluation_period_atomic:
--      Creates evaluation period, all initial evaluations, and round 1 records
--      in a single atomic database transaction.
--   2. delete_empty_evaluation_period_atomic:
--      Safely deletes ONLY exact-empty, closed evaluation periods under a row-level
--      lock (FOR UPDATE), rejecting periods with evaluations > 0 or ai_summaries > 0.
--
-- Operational & Safety Constraints:
--   1. Candidate Only: Direct pg_catalog/information_schema is currently unknown/blocked
--      pending Management API privileges. DO NOT apply until approved and catalog-verified.
--   2. Prerequisite Ordering: Migration P96T03 (single-active period partial unique index)
--      must be applied prior to applying P96T04 in live database environments.
--   3. Hermetic Transaction: Entire script executes within a single BEGIN ... COMMIT block.
--   4. Fail-Closed One-Shot: Replaces no unowned objects; fails closed if same-named functions exist.
--   5. Fixed Search Path & Security: SECURITY DEFINER with search_path = public.
--      Revokes execution from PUBLIC, anon, and authenticated; grants ONLY to service_role.
--   6. Zero Evaluator Workflow in SQL: TypeScript remains the sole evaluator-workflow authority;
--      SQL only accepts explicit resolved employee/round/evaluator payloads.
--   7. Zero Data Mutation: No data repair, deletion of child business rows, or backfilling is performed.
--
-- Rollback:
--   See /home/pi5/projects/kurabe/db/rollback-p96t04-atomic-period-lifecycle.sql
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. PREFLIGHT FUNCTION COLLISION CHECKS (Fail-Closed One-Shot)
-- ------------------------------------------------------------
DO $$
DECLARE
  v_proc_oid oid;
  v_comment text;
BEGIN
  -- Check create_evaluation_period_atomic
  v_proc_oid := to_regprocedure('public.create_evaluation_period_atomic(text, integer, uuid, timestamptz, jsonb, jsonb)')::oid;
  IF v_proc_oid IS NOT NULL THEN
    SELECT description INTO v_comment
    FROM pg_description
    WHERE objoid = v_proc_oid AND classoid = 'pg_proc'::regclass AND objsubid = 0;
    RAISE EXCEPTION 'COLLISION: Function public.create_evaluation_period_atomic already exists (comment: "%"). Migration is one-shot; aborting to prevent unowned replacement.', v_comment;
  END IF;

  -- Check delete_empty_evaluation_period_atomic
  v_proc_oid := to_regprocedure('public.delete_empty_evaluation_period_atomic(uuid)')::oid;
  IF v_proc_oid IS NOT NULL THEN
    SELECT description INTO v_comment
    FROM pg_description
    WHERE objoid = v_proc_oid AND classoid = 'pg_proc'::regclass AND objsubid = 0;
    RAISE EXCEPTION 'COLLISION: Function public.delete_empty_evaluation_period_atomic already exists (comment: "%"). Migration is one-shot; aborting to prevent unowned replacement.', v_comment;
  END IF;
END $$;

-- ------------------------------------------------------------
-- 2. CREATE ATOMIC PERIOD CREATION RPC FUNCTION
-- ------------------------------------------------------------
CREATE FUNCTION public.create_evaluation_period_atomic(
  p_name text,
  p_year integer,
  p_created_by uuid,
  p_created_at timestamptz,
  p_evaluations jsonb,
  p_rounds jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period_id uuid;
  v_eval_count integer;
  v_round_count integer;
  v_eval_total integer;
  v_eval_distinct integer;
  v_round_total integer;
  v_round_distinct integer;
  v_mismatch_count integer;
  v_created_at timestamptz;
BEGIN
  -- Invariant Validation (Fail Closed)
  IF p_name IS NULL OR length(trim(p_name)) = 0 THEN
    RAISE EXCEPTION 'P96T04_INVALID_ARGUMENT: p_name cannot be null or empty';
  END IF;

  IF p_year IS NULL THEN
    RAISE EXCEPTION 'P96T04_INVALID_ARGUMENT: p_year cannot be null';
  END IF;

  IF p_created_by IS NULL THEN
    RAISE EXCEPTION 'P96T04_INVALID_ARGUMENT: p_created_by cannot be null';
  END IF;

  IF p_evaluations IS NULL OR jsonb_typeof(p_evaluations) != 'array' THEN
    RAISE EXCEPTION 'P96T04_INVALID_ARGUMENT: p_evaluations must be a valid jsonb array';
  END IF;

  IF p_rounds IS NULL OR jsonb_typeof(p_rounds) != 'array' THEN
    RAISE EXCEPTION 'P96T04_INVALID_ARGUMENT: p_rounds must be a valid jsonb array';
  END IF;

  v_eval_count := jsonb_array_length(p_evaluations);
  v_round_count := jsonb_array_length(p_rounds);

  IF v_eval_count != v_round_count THEN
    RAISE EXCEPTION 'P96T04_MISMATCH: Evaluations count (%) does not match rounds count (%)', v_eval_count, v_round_count;
  END IF;

  v_created_at := COALESCE(p_created_at, now());

  -- Pre-write Validation on Payload Sets (when non-empty)
  IF v_eval_count > 0 THEN
    -- Check null or duplicate employee_id in evaluations
    SELECT count(e.employee_id), count(DISTINCT e.employee_id)
    INTO v_eval_total, v_eval_distinct
    FROM jsonb_to_recordset(p_evaluations) AS e(employee_id uuid);

    IF v_eval_total != v_eval_count OR v_eval_distinct != v_eval_count THEN
      RAISE EXCEPTION 'P96T04_DUPLICATE_OR_NULL_EMPLOYEE_ID: p_evaluations contains null or duplicate employee_ids (% total, % valid, % distinct)', v_eval_count, v_eval_total, v_eval_distinct;
    END IF;

    -- Check null or duplicate employee_id in rounds
    SELECT count(r.employee_id), count(DISTINCT r.employee_id)
    INTO v_round_total, v_round_distinct
    FROM jsonb_to_recordset(p_rounds) AS r(employee_id uuid);

    IF v_round_total != v_round_count OR v_round_distinct != v_round_count THEN
      RAISE EXCEPTION 'P96T04_DUPLICATE_OR_NULL_EMPLOYEE_ID: p_rounds contains null or duplicate employee_ids (% total, % valid, % distinct)', v_round_count, v_round_total, v_round_distinct;
    END IF;

    -- Check exact match between evaluations employee_ids and rounds employee_ids
    SELECT count(*)
    INTO v_mismatch_count
    FROM (
      SELECT (e.employee_id)::uuid AS emp_id FROM jsonb_to_recordset(p_evaluations) AS e(employee_id uuid)
      EXCEPT
      SELECT (r.employee_id)::uuid AS emp_id FROM jsonb_to_recordset(p_rounds) AS r(employee_id uuid)
    ) diff;

    IF v_mismatch_count > 0 THEN
      RAISE EXCEPTION 'P96T04_EMPLOYEE_SET_MISMATCH: p_evaluations employee set does not match p_rounds employee set';
    END IF;
  END IF;

  -- Insert Period with status = 'active'
  INSERT INTO public.evaluation_periods (
    name,
    year,
    created_by,
    status,
    created_at
  ) VALUES (
    p_name,
    p_year,
    p_created_by,
    'active',
    v_created_at
  )
  RETURNING id INTO v_period_id;

  IF v_period_id IS NULL THEN
    RAISE EXCEPTION 'P96T04_INSERT_FAILED: Failed to create evaluation_period record';
  END IF;

  -- Insert Evaluations and Rounds atomically
  -- Server-side assignment: period_id is strictly bound to v_period_id
  IF v_eval_count > 0 THEN
    WITH inserted_evals AS (
      INSERT INTO public.evaluations (
        period_id,
        employee_id,
        employee_role,
        team_id,
        status,
        current_round,
        created_at,
        updated_at
      )
      SELECT
        v_period_id,
        e.employee_id,
        e.employee_role,
        e.team_id,
        COALESCE(e.status, 'NotStarted'),
        COALESCE(e.current_round, 1),
        COALESCE(e.created_at, v_created_at),
        COALESCE(e.updated_at, v_created_at)
      FROM jsonb_to_recordset(p_evaluations) AS e(
        employee_id uuid,
        employee_role text,
        team_id uuid,
        status text,
        current_round integer,
        created_at timestamptz,
        updated_at timestamptz
      )
      RETURNING id, employee_id
    )
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
    )
    SELECT
      ie.id,
      COALESCE(r.round, 1),
      r.evaluator_id,
      r.evaluator_role,
      COALESCE(r.scores, '{}'::jsonb),
      COALESCE(r.notes, '{}'::jsonb),
      COALESCE(r.total_score, 0),
      COALESCE(r.grade, 'Pending'),
      COALESCE(r.status, 'NotStarted'),
      COALESCE(r.created_at, v_created_at)
    FROM jsonb_to_recordset(p_rounds) AS r(
      employee_id uuid,
      round integer,
      evaluator_id uuid,
      evaluator_role text,
      scores jsonb,
      notes jsonb,
      total_score numeric,
      grade text,
      status text,
      created_at timestamptz
    )
    JOIN inserted_evals ie ON ie.employee_id = r.employee_id;
  END IF;

  RETURN v_period_id;
END;
$$;

-- ------------------------------------------------------------
-- 3. CREATE ATOMIC EMPTY PERIOD DELETION RPC FUNCTION
-- ------------------------------------------------------------
CREATE FUNCTION public.delete_empty_evaluation_period_atomic(
  p_period_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period record;
  v_eval_count integer := 0;
  v_ai_count integer := 0;
  v_deleted_count integer := 0;
BEGIN
  -- 1. Input validation
  IF p_period_id IS NULL THEN
    RETURN jsonb_build_object(
      'deleted', false,
      'reason', 'NOT_FOUND'
    );
  END IF;

  -- 2. Lock exact period row FOR UPDATE
  SELECT id, status
  INTO v_period
  FROM public.evaluation_periods
  WHERE id = p_period_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'deleted', false,
      'reason', 'NOT_FOUND'
    );
  END IF;

  -- 3. Check status is exact 'closed'
  IF v_period.status IS DISTINCT FROM 'closed' THEN
    RETURN jsonb_build_object(
      'deleted', false,
      'reason', 'NOT_CLOSED'
    );
  END IF;

  -- 4. Count evaluations and ai_summaries under lock
  SELECT count(*)
  INTO v_eval_count
  FROM public.evaluations
  WHERE period_id = p_period_id;

  SELECT count(*)
  INTO v_ai_count
  FROM public.ai_summaries
  WHERE period_id = p_period_id;

  IF v_eval_count > 0 OR v_ai_count > 0 THEN
    RETURN jsonb_build_object(
      'deleted', false,
      'reason', 'HAS_DATA',
      'evaluation_count', v_eval_count,
      'ai_summary_count', v_ai_count
    );
  END IF;

  -- 5. Delete exact-empty closed period row
  DELETE FROM public.evaluation_periods
  WHERE id = p_period_id;

  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

  IF v_deleted_count != 1 THEN
    RAISE EXCEPTION 'P96T04_DELETE_FAILED: Expected 1 row deleted for period %, got %', p_period_id, v_deleted_count;
  END IF;

  RETURN jsonb_build_object(
    'deleted', true,
    'reason', 'DELETED',
    'evaluation_count', 0,
    'ai_summary_count', 0
  );
END;
$$;

-- ------------------------------------------------------------
-- 4. PROVENANCE MARKERS & PERMISSIONS
-- ------------------------------------------------------------
COMMENT ON FUNCTION public.create_evaluation_period_atomic(
  text, integer, uuid, timestamptz, jsonb, jsonb
) IS 'kurabe:p96t04:candidate:v1:function:create_evaluation_period_atomic';

REVOKE EXECUTE ON FUNCTION public.create_evaluation_period_atomic(
  text, integer, uuid, timestamptz, jsonb, jsonb
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.create_evaluation_period_atomic(
  text, integer, uuid, timestamptz, jsonb, jsonb
) TO service_role;

COMMENT ON FUNCTION public.delete_empty_evaluation_period_atomic(
  uuid
) IS 'kurabe:p96t04:candidate:v1:function:delete_empty_evaluation_period_atomic';

REVOKE EXECUTE ON FUNCTION public.delete_empty_evaluation_period_atomic(
  uuid
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.delete_empty_evaluation_period_atomic(
  uuid
) TO service_role;

COMMIT;
