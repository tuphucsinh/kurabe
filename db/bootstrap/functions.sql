-- Generated from an authorized schema-only catalog; no data rows.
SET search_path = public;

CREATE OR REPLACE FUNCTION public.create_evaluation_period_atomic(p_name text, p_year integer, p_created_by uuid, p_created_at timestamp with time zone, p_evaluations jsonb, p_rounds jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;

COMMENT ON FUNCTION public."create_evaluation_period_atomic"(p_name text, p_year integer, p_created_by uuid, p_created_at timestamp with time zone, p_evaluations jsonb, p_rounds jsonb) IS 'kurabe:p96t04:candidate:v1:function:create_evaluation_period_atomic';

CREATE OR REPLACE FUNCTION public.delete_empty_evaluation_period_atomic(p_period_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;

COMMENT ON FUNCTION public."delete_empty_evaluation_period_atomic"(p_period_id uuid) IS 'kurabe:p96t04:candidate:v1:function:delete_empty_evaluation_period_atomic';

CREATE OR REPLACE FUNCTION public.handle_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.save_evaluation_round_transaction(p_evaluation_id uuid, p_round integer, p_actor_id uuid, p_scores jsonb, p_notes jsonb, p_comment text, p_total_score numeric, p_grade text, p_is_submit boolean, p_submitted_at timestamp with time zone DEFAULT now(), p_next_round integer DEFAULT NULL::integer, p_next_evaluator_id uuid DEFAULT NULL::uuid, p_next_evaluator_role text DEFAULT NULL::text, p_next_status text DEFAULT NULL::text, p_is_final boolean DEFAULT false)
 RETURNS TABLE(round_id uuid, evaluation_id uuid, next_round_id uuid, final_status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  IF v_round.evaluator_id != p_actor_id THEN
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
$function$;

COMMENT ON FUNCTION public."save_evaluation_round_transaction"(p_evaluation_id uuid, p_round integer, p_actor_id uuid, p_scores jsonb, p_notes jsonb, p_comment text, p_total_score numeric, p_grade text, p_is_submit boolean, p_submitted_at timestamp with time zone, p_next_round integer, p_next_evaluator_id uuid, p_next_evaluator_role text, p_next_status text, p_is_final boolean) IS 'kurabe:p3:candidate:v1:function:save_evaluation_round_transaction';

CREATE OR REPLACE FUNCTION public.save_evaluation_round_transaction_active_only(p_evaluation_id uuid, p_round integer, p_actor_id uuid, p_scores jsonb, p_notes jsonb, p_comment text, p_total_score numeric, p_grade text, p_is_submit boolean, p_submitted_at timestamp with time zone DEFAULT now(), p_next_round integer DEFAULT NULL::integer, p_next_evaluator_id uuid DEFAULT NULL::uuid, p_next_evaluator_role text DEFAULT NULL::text, p_next_status text DEFAULT NULL::text, p_is_final boolean DEFAULT false)
 RETURNS TABLE(round_id uuid, evaluation_id uuid, next_round_id uuid, final_status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;

COMMENT ON FUNCTION public."save_evaluation_round_transaction_active_only"(p_evaluation_id uuid, p_round integer, p_actor_id uuid, p_scores jsonb, p_notes jsonb, p_comment text, p_total_score numeric, p_grade text, p_is_submit boolean, p_submitted_at timestamp with time zone, p_next_round integer, p_next_evaluator_id uuid, p_next_evaluator_role text, p_next_status text, p_is_final boolean) IS 'kurabe:p96t05:candidate:v1:function:save_evaluation_round_transaction_active_only';
