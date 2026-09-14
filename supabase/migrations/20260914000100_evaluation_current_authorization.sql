-- ============================================================
-- CANDIDATE ONLY — NOT APPLIED
-- Kurabe DB Transaction Candidate: Evaluation Current Authorization Guard (P103M1T03)
-- DO NOT EXECUTE DIRECTLY WITHOUT EXPLICIT MIGRATION APPROVAL
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. PREFLIGHT CHECKS (Fail-Closed One-Shot)
-- ------------------------------------------------------------
DO $$
DECLARE
  v_comment text;
BEGIN
  IF to_regclass('public.users') IS NULL
     OR to_regclass('public.teams') IS NULL
     OR to_regclass('public.evaluations') IS NULL
     OR to_regclass('public.evaluation_rounds') IS NULL
     OR to_regclass('public.evaluation_periods') IS NULL
     OR to_regclass('public.criteria_config_versions') IS NULL
     OR to_regclass('public.grade_band_versions') IS NULL
     OR to_regclass('public.evaluation_transition_context') IS NULL THEN
    RAISE EXCEPTION 'P103M1T03_PREFLIGHT_FAILED: required evaluation, personnel, or config tables are missing';
  END IF;

  IF to_regprocedure('public.return_evaluation_round_transaction(uuid, integer, uuid, text)') IS NULL THEN
    RAISE EXCEPTION 'P103M1T03_PREFLIGHT_FAILED: return_evaluation_round_transaction base function is missing';
  END IF;

  IF to_regprocedure('public.save_evaluation_round_transaction_active_only(uuid, integer, uuid, jsonb, jsonb, text, numeric, text, boolean, timestamptz, integer, uuid, text, text, boolean, uuid, uuid)') IS NULL THEN
    RAISE EXCEPTION 'P103M1T03_PREFLIGHT_FAILED: 17-argument save_evaluation_round_transaction_active_only base function is missing';
  END IF;
END $$;

-- ------------------------------------------------------------
-- 2. TRANSACTIONAL RETURN RPC FUNCTION
-- Closes H5: requires active actor, valid current role/team/appointment, and stored assignment.
-- Serializes the personnel graph before period/evaluation locks to prevent deadlocks with personnel mutations.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.return_evaluation_round_transaction(
  p_evaluation_id uuid,
  p_round integer,
  p_actor_id uuid,
  p_reason text
)
RETURNS TABLE (
  evaluation_id uuid,
  restored_round integer,
  restored_status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_period_id uuid;
  v_period_status text;
  v_eval record;
  v_eval_team record;
  v_actor record;
  v_subject record;
  v_round record;
  v_prev_round record;
  v_new_status text;
  v_trimmed_reason text;
  v_transition_key uuid;
  v_expected_return_selector text;
BEGIN
  -- 1. Input Validation
  IF p_evaluation_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: p_evaluation_id cannot be null';
  END IF;
  IF p_round IS NULL OR p_round < 1 OR p_round > 3 THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: p_round must be between 1 and 3, received %', p_round;
  END IF;
  IF p_actor_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: p_actor_id cannot be null';
  END IF;
  v_trimmed_reason := trim(COALESCE(p_reason, ''));
  IF length(v_trimmed_reason) = 0 THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: p_reason cannot be empty';
  END IF;

  -- 2. Deterministic personnel graph fence order (must precede period/evaluation locks)
  LOCK TABLE public.teams, public.users, public.evaluation_rounds IN SHARE ROW EXCLUSIVE MODE;

  -- 3. Verify actor in public.users
  SELECT * INTO v_actor
  FROM public.users
  WHERE id = p_actor_id;

  IF NOT FOUND OR v_actor.is_active IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'UNAUTHORIZED_ACTOR: actor is missing or inactive';
  END IF;

  -- 4. Period Lock & Active Check
  SELECT ep.id, ep.status INTO v_period_id, v_period_status
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

  -- 5. Lock evaluation FOR UPDATE
  SELECT id, employee_id, employee_role, current_round, status, team_id
  INTO v_eval
  FROM public.evaluations
  WHERE id = p_evaluation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'EVALUATION_NOT_FOUND: Evaluation % does not exist', p_evaluation_id;
  END IF;

  -- Evaluation team verification (if evaluation has a team)
  IF v_eval.team_id IS NOT NULL THEN
    SELECT * INTO v_eval_team
    FROM public.teams
    WHERE id = v_eval.team_id;

    IF NOT FOUND OR v_eval_team.is_active IS DISTINCT FROM TRUE THEN
      RAISE EXCEPTION 'UNAUTHORIZED_ACTOR: evaluation team is missing or inactive';
    END IF;
  END IF;

  -- Subject verification
  SELECT * INTO v_subject
  FROM public.users
  WHERE id = v_eval.employee_id;

  IF NOT FOUND OR v_subject.is_active IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'UNAUTHORIZED_ACTOR: evaluation subject is missing or inactive';
  END IF;

  -- 6. Current authorization check for return
  IF p_round = 1 THEN
    -- Case B: Manager round 1 Approved -> return to Draft
    IF v_eval.status IS DISTINCT FROM 'Approved' OR v_eval.current_round <> 1 THEN
      RAISE EXCEPTION 'P102M3T04_CANNOT_RETURN: Round 1 can only be returned when evaluation is Approved and current_round is 1';
    END IF;

    IF v_actor.role IS DISTINCT FROM 'Manager' THEN
      RAISE EXCEPTION 'UNAUTHORIZED_ACTOR: return requires an active Manager actor';
    END IF;

    IF v_eval.employee_role IS DISTINCT FROM 'Manager' OR v_eval.employee_id IS DISTINCT FROM p_actor_id THEN
      RAISE EXCEPTION 'UNAUTHORIZED_ACTOR: Actor % is not authorized to return round 1', p_actor_id;
    END IF;

    SELECT id, evaluator_id, status, submitted_at
    INTO v_round
    FROM public.evaluation_rounds er
    WHERE er.evaluation_id = p_evaluation_id AND round = 1
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'ROUND_NOT_FOUND: Round 1 for evaluation % does not exist', p_evaluation_id;
    END IF;

    IF v_round.evaluator_id IS DISTINCT FROM p_actor_id THEN
      RAISE EXCEPTION 'UNAUTHORIZED_ACTOR: Actor % is not authorized to return round 1', p_actor_id;
    END IF;

    IF v_round.status IS DISTINCT FROM 'Submitted' OR v_round.submitted_at IS NULL THEN
      RAISE EXCEPTION 'P102M3T04_CANNOT_RETURN: Round 1 must be submitted before returning';
    END IF;

    v_transition_key := gen_random_uuid();
    INSERT INTO public.evaluation_transition_context (context_key, txid, context)
    VALUES (v_transition_key, txid_current(), 'return_rpc');
    PERFORM set_config('kurabe.p102m3t04.return_context_key', v_transition_key::text, true);

    UPDATE public.evaluations
    SET
      status = 'Draft',
      current_round = 1,
      final_grade = NULL,
      final_score = NULL,
      return_note = v_trimmed_reason,
      updated_at = now()
    WHERE id = p_evaluation_id;

    UPDATE public.evaluation_rounds
    SET
      status = 'Draft',
      submitted_at = NULL
    WHERE id = v_round.id;

    DELETE FROM public.evaluation_transition_context WHERE context_key = v_transition_key;
    RETURN QUERY SELECT p_evaluation_id, 1, 'Draft'::text;
    RETURN;
  ELSE
    -- Case A: Round > 1
    IF v_eval.current_round <> p_round THEN
      RAISE EXCEPTION 'P102M3T04_CANNOT_RETURN: Evaluation is at round %, cannot return from round %', v_eval.current_round, p_round;
    END IF;
    IF v_eval.status = 'Approved' THEN
      RAISE EXCEPTION 'P102M3T04_CANNOT_RETURN: Approved evaluation cannot be returned via round > 1';
    END IF;

    -- Current authority rule for return at round > 1
    v_expected_return_selector := CASE
      WHEN v_eval.employee_role = 'Leader' AND p_round = 2 THEN 'Manager'
      WHEN v_eval.employee_role = 'SubLeader' AND p_round = 2 THEN 'Leader'
      WHEN v_eval.employee_role = 'SubLeader' AND p_round = 3 THEN 'Manager'
      WHEN v_eval.employee_role IN ('Employee', 'Worker') AND p_round = 2 THEN 'Leader'
      WHEN v_eval.employee_role IN ('Employee', 'Worker') AND p_round = 3 THEN 'Manager'
      ELSE NULL
    END;

    IF v_expected_return_selector IS NULL THEN
      RAISE EXCEPTION 'UNAUTHORIZED_ACTOR: unexpected role % or round % for return', v_eval.employee_role, p_round;
    END IF;

    IF v_expected_return_selector = 'Leader' THEN
      IF v_actor.role IS DISTINCT FROM 'Leader'
         OR v_eval.team_id IS NULL
         OR v_eval_team.leader_id IS DISTINCT FROM v_actor.id THEN
        RAISE EXCEPTION 'UNAUTHORIZED_ACTOR: actor % is not authorized as Leader for return on team %', p_actor_id, v_eval.team_id;
      END IF;
    ELSIF v_expected_return_selector = 'Manager' THEN
      IF v_actor.role IS DISTINCT FROM 'Manager' THEN
        RAISE EXCEPTION 'UNAUTHORIZED_ACTOR: actor % is not a Manager', p_actor_id;
      END IF;
    ELSE
      RAISE EXCEPTION 'UNAUTHORIZED_ACTOR: unexpected return selector %', v_expected_return_selector;
    END IF;

    -- Lock current round
    SELECT id, evaluator_id, status, submitted_at
    INTO v_round
    FROM public.evaluation_rounds er
    WHERE er.evaluation_id = p_evaluation_id AND round = p_round
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'ROUND_NOT_FOUND: Round % for evaluation % does not exist', p_round, p_evaluation_id;
    END IF;

    IF v_round.evaluator_id IS DISTINCT FROM p_actor_id THEN
      RAISE EXCEPTION 'UNAUTHORIZED_ACTOR: Actor % is not assigned to round %', p_actor_id, p_round;
    END IF;

    IF v_round.submitted_at IS NOT NULL OR v_round.status = 'Submitted' THEN
      RAISE EXCEPTION 'P102M3T04_CANNOT_RETURN: Round % is already submitted and cannot be returned', p_round;
    END IF;

    -- Lock previous round (must be submitted)
    SELECT id, evaluator_id, status, submitted_at
    INTO v_prev_round
    FROM public.evaluation_rounds er
    WHERE er.evaluation_id = p_evaluation_id AND round = p_round - 1
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'ROUND_NOT_FOUND: Previous round % does not exist', p_round - 1;
    END IF;

    IF v_prev_round.submitted_at IS NULL OR v_prev_round.status IS DISTINCT FROM 'Submitted' THEN
      RAISE EXCEPTION 'P102M3T04_CANNOT_RETURN: Previous round % is not submitted', p_round - 1;
    END IF;

    v_transition_key := gen_random_uuid();
    INSERT INTO public.evaluation_transition_context (context_key, txid, context)
    VALUES (v_transition_key, txid_current(), 'return_rpc');
    PERFORM set_config('kurabe.p102m3t04.return_context_key', v_transition_key::text, true);

    -- Reset current round fields
    UPDATE public.evaluation_rounds
    SET
      scores = '{}'::jsonb,
      notes = '{}'::jsonb,
      comment = NULL,
      total_score = 0,
      grade = 'Pending',
      status = 'NotStarted'
    WHERE id = v_round.id;

    -- Unlock previous round to Draft
    UPDATE public.evaluation_rounds
    SET
      status = 'Draft',
      submitted_at = NULL
    WHERE id = v_prev_round.id;

    IF p_round = 2 THEN
      v_new_status := 'Draft';
    ELSE
      v_new_status := 'Submitted';
    END IF;

    UPDATE public.evaluations
    SET
      current_round = p_round - 1,
      status = v_new_status,
      final_grade = NULL,
      final_score = NULL,
      return_note = v_trimmed_reason,
      updated_at = now()
    WHERE id = p_evaluation_id;

    DELETE FROM public.evaluation_transition_context WHERE context_key = v_transition_key;
    RETURN QUERY SELECT p_evaluation_id, p_round - 1, v_new_status;
    RETURN;
  END IF;
END;
$function$;

COMMENT ON FUNCTION public.return_evaluation_round_transaction(uuid, integer, uuid, text)
IS 'kurabe:p103m1t03:candidate:v1:function:return_evaluation_round_transaction';

-- ------------------------------------------------------------
-- 3. 17-ARGUMENT TRANSACTIONAL EVALUATION WRITER RPC FUNCTION
-- Closes H5: requires active actor, valid current role/team/appointment, and stored assignment.
-- Serializes the personnel graph before period/evaluation locks to prevent deadlocks with personnel mutations.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.save_evaluation_round_transaction_active_only(
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
  p_is_final boolean DEFAULT false,
  p_criteria_config_version_id uuid DEFAULT NULL,
  p_grade_config_version_id uuid DEFAULT NULL
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
AS $function$
DECLARE
  v_period_id uuid;
  v_period_status text;
  v_eval record;
  v_eval_team record;
  v_actor record;
  v_subject record;
  v_round record;
  v_round_id uuid;
  v_next_round_id uuid := NULL;
  v_final_status text;
  v_effective_time timestamptz;
  v_existing_next_round_id uuid;
  v_existing_next_evaluator_id uuid;
  v_existing_next_evaluator_role text;
  v_existing_next_status text;
  v_existing_next_criteria_id uuid;
  v_existing_next_grade_id uuid;
  v_next_user_role text;
  v_next_user_active boolean;
  v_next_user_team_id uuid;
  v_next_user_subleader_id uuid;
  v_next_team_active boolean;
  v_next_team_leader_id uuid;
  v_expected_next_role text;
  v_expected_next_status text;
  v_expected_evaluator_selector text;
  v_active_criteria_id uuid;
  v_active_grade_id uuid;
  v_effective_criteria_version_id uuid;
  v_effective_grade_version_id uuid;
  v_prev_status text;
  v_prev_submitted_at timestamptz;
  v_affected_rows integer;
  v_transition_key uuid;
BEGIN
  -- 1. Invariant Validation (Fail Closed)
  IF p_evaluation_id IS NULL THEN
    RAISE EXCEPTION 'P96T05_INVALID_ARGUMENT: p_evaluation_id cannot be null';
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
    IF p_criteria_config_version_id IS NULL OR p_grade_config_version_id IS NULL THEN
      RAISE EXCEPTION 'INVALID_ARGUMENT: submitted round requires both criteria and grade config version ids';
    END IF;
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
  IF p_is_submit IS FALSE AND p_is_final IS FALSE AND p_next_status = 'Approved' THEN
    RAISE EXCEPTION 'P102M3T04_INVALID_TRANSITION: Approved status requires final submit';
  END IF;
  IF p_is_final IS TRUE AND (p_next_status IS DISTINCT FROM 'Approved' OR p_next_round IS NOT NULL) THEN
    RAISE EXCEPTION 'P102M3T04_INVALID_TRANSITION: final submit requires Approved status without a next round';
  END IF;

  -- 2. Deterministic personnel graph fence order (must precede period/evaluation locks)
  LOCK TABLE public.teams, public.users, public.evaluation_rounds IN SHARE ROW EXCLUSIVE MODE;

  -- 3. Verify actor in public.users
  SELECT * INTO v_actor
  FROM public.users
  WHERE id = p_actor_id;

  IF NOT FOUND OR v_actor.is_active IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'UNAUTHORIZED_ACTOR: actor is missing or inactive';
  END IF;

  -- 4. Lock parent evaluation period FOR UPDATE and verify active
  SELECT ep.id, ep.status INTO v_period_id, v_period_status
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

  -- 5. Version Lock & Validation under advisory transaction locks
  PERFORM pg_advisory_xact_lock(hashtext('kurabe:p99m3t02:criteria-config'));
  PERFORM pg_advisory_xact_lock(hashtext('kurabe:p99m3t01:grade-config'));

  SELECT id INTO v_active_criteria_id FROM public.criteria_config_versions WHERE is_active ORDER BY version_no DESC LIMIT 1;
  IF v_active_criteria_id IS NULL THEN
    RAISE EXCEPTION 'P99M3T02_CONFIG_UNAVAILABLE: no active criteria configuration';
  END IF;

  SELECT id INTO v_active_grade_id FROM public.grade_band_versions WHERE is_active ORDER BY version_no DESC LIMIT 1;
  IF v_active_grade_id IS NULL THEN
    RAISE EXCEPTION 'P99M3T01_CONFIG_UNAVAILABLE: no active grade configuration';
  END IF;

  IF p_criteria_config_version_id IS NULL OR p_grade_config_version_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: every persisted round requires both criteria and grade config version ids';
  END IF;

  IF p_criteria_config_version_id IS NOT NULL AND p_criteria_config_version_id <> v_active_criteria_id THEN
    RAISE EXCEPTION 'P99M3T02_CONFIG_STALE: submitted round is not using the active criteria configuration';
  END IF;

  IF p_grade_config_version_id IS NOT NULL AND p_grade_config_version_id <> v_active_grade_id THEN
    RAISE EXCEPTION 'P99M3T01_GRADE_VERSION_STALE: submitted round is not using the active grade configuration';
  END IF;

  v_effective_criteria_version_id := p_criteria_config_version_id;
  v_effective_grade_version_id := p_grade_config_version_id;

  -- 6. Lock evaluation FOR UPDATE
  SELECT id, employee_id, status, current_round, team_id, employee_role
  INTO v_eval
  FROM public.evaluations
  WHERE id = p_evaluation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'EVALUATION_NOT_FOUND: Evaluation % does not exist', p_evaluation_id;
  END IF;

  -- Evaluation team check
  IF v_eval.team_id IS NOT NULL THEN
    SELECT * INTO v_eval_team
    FROM public.teams
    WHERE id = v_eval.team_id;

    IF NOT FOUND OR v_eval_team.is_active IS DISTINCT FROM TRUE THEN
      RAISE EXCEPTION 'UNAUTHORIZED_ACTOR: evaluation team is missing or inactive';
    END IF;
  END IF;

  -- Subject check
  SELECT * INTO v_subject
  FROM public.users
  WHERE id = v_eval.employee_id;

  IF NOT FOUND OR v_subject.is_active IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'UNAUTHORIZED_ACTOR: evaluation subject is missing or inactive';
  END IF;

  -- 7. Current Authorization Check for p_actor_id
  v_expected_evaluator_selector := CASE
    WHEN v_eval.employee_role = 'Manager' AND p_round = 1 THEN 'SELF'
    WHEN v_eval.employee_role = 'Leader' AND p_round = 1 THEN 'SELF'
    WHEN v_eval.employee_role = 'Leader' AND p_round = 2 THEN 'Manager'
    WHEN v_eval.employee_role = 'SubLeader' AND p_round = 1 THEN 'SELF'
    WHEN v_eval.employee_role = 'SubLeader' AND p_round = 2 THEN 'Leader'
    WHEN v_eval.employee_role = 'SubLeader' AND p_round = 3 THEN 'Manager'
    WHEN v_eval.employee_role IN ('Employee', 'Worker') AND p_round = 1 THEN 'SubLeader'
    WHEN v_eval.employee_role IN ('Employee', 'Worker') AND p_round = 2 THEN 'Leader'
    WHEN v_eval.employee_role IN ('Employee', 'Worker') AND p_round = 3 THEN 'Manager'
    ELSE NULL
  END;

  IF v_expected_evaluator_selector IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED_ACTOR: unexpected role % or round %', v_eval.employee_role, p_round;
  END IF;

  IF v_expected_evaluator_selector = 'SELF' THEN
    IF v_actor.id IS DISTINCT FROM v_eval.employee_id OR v_actor.role IS DISTINCT FROM v_eval.employee_role THEN
      RAISE EXCEPTION 'UNAUTHORIZED_ACTOR: actor % is not authorized for SELF evaluation', p_actor_id;
    END IF;
  ELSIF v_expected_evaluator_selector = 'SubLeader' THEN
    IF v_actor.role IS DISTINCT FROM 'SubLeader'
       OR v_eval.team_id IS NULL
       OR v_actor.team_id IS DISTINCT FROM v_eval.team_id
       OR v_subject.subleader_id IS DISTINCT FROM v_actor.id THEN
      RAISE EXCEPTION 'UNAUTHORIZED_ACTOR: actor % is not the assigned SubLeader for this employee', p_actor_id;
    END IF;
  ELSIF v_expected_evaluator_selector = 'Leader' THEN
    IF v_actor.role IS DISTINCT FROM 'Leader'
       OR v_eval.team_id IS NULL
       OR v_eval_team.leader_id IS DISTINCT FROM v_actor.id THEN
      RAISE EXCEPTION 'UNAUTHORIZED_ACTOR: actor % is not authorized as Leader for team %', p_actor_id, v_eval.team_id;
    END IF;
  ELSIF v_expected_evaluator_selector = 'Manager' THEN
    IF v_actor.role IS DISTINCT FROM 'Manager' THEN
      RAISE EXCEPTION 'UNAUTHORIZED_ACTOR: actor % is not a Manager', p_actor_id;
    END IF;
  ELSE
    RAISE EXCEPTION 'UNAUTHORIZED_ACTOR: unknown selector %', v_expected_evaluator_selector;
  END IF;

  -- 8. Expected next role / status / round validation
  v_expected_next_role := CASE
    WHEN v_eval.employee_role IN ('Employee', 'Worker') AND p_round = 1 THEN 'SubLeader'
    WHEN v_eval.employee_role IN ('Employee', 'Worker') AND p_round = 2 THEN 'Leader'
    WHEN v_eval.employee_role = 'SubLeader' AND p_round = 1 THEN 'Leader'
    WHEN v_eval.employee_role = 'SubLeader' AND p_round = 2 THEN 'Manager'
    WHEN v_eval.employee_role = 'Leader' AND p_round = 1 THEN 'Manager'
    ELSE NULL
  END;
  IF p_is_submit IS TRUE AND p_is_final IS FALSE
     AND p_next_evaluator_role IS DISTINCT FROM v_expected_next_role THEN
    RAISE EXCEPTION 'INVALID_WORKFLOW_ROLE: expected next evaluator role %, got %', v_expected_next_role, p_next_evaluator_role;
  END IF;
  v_expected_next_status := CASE p_next_round
    WHEN 1 THEN 'Draft'
    WHEN 2 THEN 'Submitted'
    WHEN 3 THEN 'Reviewed'
    ELSE NULL
  END;
  IF p_is_submit IS TRUE AND p_is_final IS FALSE
     AND p_next_status IS DISTINCT FROM v_expected_next_status THEN
    RAISE EXCEPTION 'INVALID_WORKFLOW_STATUS: expected next status %, got %', v_expected_next_status, p_next_status;
  END IF;
  IF p_is_final IS TRUE AND (
       (v_eval.employee_role = 'Manager' AND p_round <> 1)
       OR (v_eval.employee_role = 'Leader' AND p_round <> 2)
       OR (v_eval.employee_role IN ('SubLeader', 'Employee', 'Worker') AND p_round <> 3)
     ) THEN
    RAISE EXCEPTION 'INVALID_WORKFLOW_ROUND: final submission is not allowed for role % at round %', v_eval.employee_role, p_round;
  END IF;

  v_transition_key := gen_random_uuid();
  INSERT INTO public.evaluation_transition_context (context_key, txid, context)
  VALUES (v_transition_key, txid_current(), 'save_rpc');
  PERFORM set_config('kurabe.p102m3t04.save_context_key', v_transition_key::text, true);

  IF v_eval.status = 'Approved' THEN
    IF p_is_submit IS TRUE THEN
      SELECT id, evaluator_id, status, scores, notes, comment, total_score, grade,
             criteria_config_version_id, grade_config_version_id
      INTO v_round
      FROM public.evaluation_rounds er
      WHERE er.evaluation_id = p_evaluation_id AND round = p_round;
      v_round_id := v_round.id;

      IF v_round_id IS NULL
         OR v_round.status IS DISTINCT FROM 'Submitted'
         OR v_round.evaluator_id IS DISTINCT FROM p_actor_id
         OR v_round.scores IS DISTINCT FROM p_scores
         OR v_round.notes IS DISTINCT FROM p_notes
         OR v_round.comment IS DISTINCT FROM p_comment
         OR v_round.total_score IS DISTINCT FROM p_total_score
         OR v_round.grade IS DISTINCT FROM p_grade
         OR v_round.criteria_config_version_id IS DISTINCT FROM v_effective_criteria_version_id
         OR v_round.grade_config_version_id IS DISTINCT FROM v_effective_grade_version_id THEN
        RAISE EXCEPTION 'CONFLICTING_REPLAY: submitted evaluation payload or config version does not match the committed round';
      END IF;
      SELECT id INTO v_next_round_id
      FROM public.evaluation_rounds er_next
      WHERE er_next.evaluation_id = p_evaluation_id AND er_next.round = p_round + 1;
      DELETE FROM public.evaluation_transition_context WHERE context_key = v_transition_key;
      RETURN QUERY SELECT v_round_id, p_evaluation_id, v_next_round_id, 'Approved'::text;
      RETURN;
    END IF;
    RAISE EXCEPTION 'EVALUATION_ALREADY_APPROVED: Evaluation % is already Approved', p_evaluation_id;
  END IF;

  -- Enforce monotonic round order
  IF v_eval.current_round > p_round THEN
    IF p_is_submit IS TRUE THEN
      SELECT id, status, submitted_at, evaluator_id, scores, notes, comment, total_score, grade,
             criteria_config_version_id, grade_config_version_id
      INTO v_round
      FROM public.evaluation_rounds er
      WHERE er.evaluation_id = p_evaluation_id AND er.round = p_round AND er.status = 'Submitted';
      v_round_id := v_round.id;

      IF v_round_id IS NOT NULL THEN
        IF v_round.evaluator_id IS DISTINCT FROM p_actor_id THEN
          RAISE EXCEPTION 'UNAUTHORIZED_EVALUATOR: Actor % cannot replay round %', p_actor_id, p_round;
        END IF;

        IF v_round.scores IS DISTINCT FROM p_scores
           OR v_round.notes IS DISTINCT FROM p_notes
           OR v_round.comment IS DISTINCT FROM p_comment
           OR v_round.total_score IS DISTINCT FROM p_total_score
           OR v_round.grade IS DISTINCT FROM p_grade
           OR v_round.criteria_config_version_id IS DISTINCT FROM v_effective_criteria_version_id
           OR v_round.grade_config_version_id IS DISTINCT FROM v_effective_grade_version_id THEN
          RAISE EXCEPTION 'CONFLICTING_REPLAY: submitted evaluation payload or config version does not match the committed round';
        END IF;
        SELECT id INTO v_next_round_id
        FROM public.evaluation_rounds er
        WHERE er.evaluation_id = p_evaluation_id AND round = p_round + 1;

        DELETE FROM public.evaluation_transition_context WHERE context_key = v_transition_key;
        RETURN QUERY SELECT v_round_id, p_evaluation_id, v_next_round_id, v_eval.status;
        RETURN;
      END IF;
    END IF;
    RAISE EXCEPTION 'INVALID_ROUND_ORDER: Evaluation is at round %, cannot edit round %', v_eval.current_round, p_round;
  END IF;

  IF v_eval.current_round IS NOT NULL AND v_eval.current_round < p_round THEN
    RAISE EXCEPTION 'INVALID_ROUND_ORDER: Evaluation is at round %, cannot skip to round %', v_eval.current_round, p_round;
  END IF;

  -- 9. Lock target round FOR UPDATE
  SELECT id, status, submitted_at, evaluator_id, scores, notes, comment, total_score, grade,
         criteria_config_version_id, grade_config_version_id
  INTO v_round
  FROM public.evaluation_rounds er
  WHERE er.evaluation_id = p_evaluation_id AND round = p_round
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ROUND_NOT_FOUND: Round % for evaluation % does not exist', p_round, p_evaluation_id;
  END IF;

  -- Stored assignment check
  IF v_round.evaluator_id IS DISTINCT FROM p_actor_id THEN
    RAISE EXCEPTION 'UNAUTHORIZED_EVALUATOR: Actor % is not assigned to round % (assigned: %)', p_actor_id, p_round, v_round.evaluator_id;
  END IF;

  -- 10. Initialization Draft Branch
  IF p_is_submit IS NULL THEN
    IF p_criteria_config_version_id IS NULL OR p_grade_config_version_id IS NULL THEN
      RAISE EXCEPTION 'INVALID_ARGUMENT: initialization requires both criteria and grade config version ids';
    END IF;
    IF v_round.status IS DISTINCT FROM 'NotStarted' OR v_round.submitted_at IS NOT NULL THEN
      DELETE FROM public.evaluation_transition_context WHERE context_key = v_transition_key;
      RETURN QUERY SELECT v_round.id, p_evaluation_id, NULL::uuid, COALESCE(v_eval.status, 'NotStarted')::text;
      RETURN;
    END IF;

    UPDATE public.evaluation_rounds
    SET scores = p_scores,
        notes = p_notes,
        comment = p_comment,
        total_score = p_total_score,
        grade = p_grade,
        status = 'Draft',
        submitted_at = NULL,
        criteria_config_version_id = v_effective_criteria_version_id,
        grade_config_version_id = v_effective_grade_version_id
    WHERE id = v_round.id AND status = 'NotStarted';
    GET DIAGNOSTICS v_affected_rows = ROW_COUNT;
    IF v_affected_rows <> 1 THEN
      RAISE EXCEPTION 'INITIALIZATION_CONFLICT: Round % changed while initializing', p_round;
    END IF;

    IF v_eval.status = 'NotStarted' THEN
      UPDATE public.evaluations
      SET status = 'Draft', updated_at = COALESCE(p_submitted_at, now())
      WHERE id = p_evaluation_id AND status = 'NotStarted';
      GET DIAGNOSTICS v_affected_rows = ROW_COUNT;
      IF v_affected_rows <> 1 THEN
        RAISE EXCEPTION 'INITIALIZATION_CONFLICT: Evaluation % changed while initializing', p_evaluation_id;
      END IF;
    END IF;

    DELETE FROM public.evaluation_transition_context WHERE context_key = v_transition_key;
    RETURN QUERY SELECT v_round.id, p_evaluation_id, NULL::uuid, 'Draft'::text;
    RETURN;
  END IF;

  -- 11. Already submitted lock check
  IF v_round.submitted_at IS NOT NULL OR v_round.status = 'Submitted' THEN
    IF p_is_submit IS TRUE THEN
      IF v_round.scores IS DISTINCT FROM p_scores
         OR v_round.notes IS DISTINCT FROM p_notes
         OR v_round.comment IS DISTINCT FROM p_comment
         OR v_round.total_score IS DISTINCT FROM p_total_score
         OR v_round.grade IS DISTINCT FROM p_grade
         OR v_round.criteria_config_version_id IS DISTINCT FROM v_effective_criteria_version_id
         OR v_round.grade_config_version_id IS DISTINCT FROM v_effective_grade_version_id THEN
        RAISE EXCEPTION 'CONFLICTING_REPLAY: submitted evaluation payload or config version does not match the committed round';
      END IF;
      IF p_is_final IS TRUE AND v_eval.status = 'Approved' THEN
        DELETE FROM public.evaluation_transition_context WHERE context_key = v_transition_key;
        RETURN QUERY SELECT v_round.id, p_evaluation_id, NULL::uuid, 'Approved'::text;
        RETURN;
      END IF;
      SELECT id INTO v_next_round_id
      FROM public.evaluation_rounds er
      WHERE er.evaluation_id = p_evaluation_id AND round = p_next_round;

      IF v_next_round_id IS NOT NULL THEN
        DELETE FROM public.evaluation_transition_context WHERE context_key = v_transition_key;
        RETURN QUERY SELECT v_round.id, p_evaluation_id, v_next_round_id, v_eval.status;
        RETURN;
      END IF;
    END IF;
    RAISE EXCEPTION 'ROUND_ALREADY_SUBMITTED: Round % for evaluation % is already submitted and locked', p_round, p_evaluation_id;
  END IF;

  -- Validate previous round is submitted for round > 1
  IF p_round > 1 THEN
    SELECT status, submitted_at INTO v_prev_status, v_prev_submitted_at
    FROM public.evaluation_rounds er
    WHERE er.evaluation_id = p_evaluation_id AND round = p_round - 1;

    IF NOT FOUND OR v_prev_status IS DISTINCT FROM 'Submitted' OR v_prev_submitted_at IS NULL THEN
      RAISE EXCEPTION 'PREVIOUS_ROUND_NOT_SUBMITTED: Round % requires round % to be completed and submitted', p_round, p_round - 1;
    END IF;
  END IF;

  v_round_id := v_round.id;
  v_effective_time := COALESCE(p_submitted_at, now());

  -- 12. Update target round with version pins
  UPDATE public.evaluation_rounds
  SET
    scores = p_scores,
    notes = p_notes,
    comment = p_comment,
    total_score = p_total_score,
    grade = p_grade,
    status = CASE WHEN p_is_submit THEN 'Submitted' ELSE 'Draft' END,
    submitted_at = CASE WHEN p_is_submit THEN v_effective_time ELSE NULL END,
    criteria_config_version_id = v_effective_criteria_version_id,
    grade_config_version_id = v_effective_grade_version_id
  WHERE id = v_round_id;

  -- 13. Flow Transitions
  IF p_is_submit IS FALSE THEN
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
    IF p_is_final IS FALSE THEN
      SELECT role, is_active, team_id, subleader_id
      INTO v_next_user_role, v_next_user_active, v_next_user_team_id, v_next_user_subleader_id
      FROM public.users
      WHERE id = p_next_evaluator_id
      FOR KEY SHARE;
      IF NOT FOUND OR v_next_user_active IS NOT TRUE OR v_next_user_role IS DISTINCT FROM p_next_evaluator_role OR p_next_evaluator_role NOT IN ('Leader', 'SubLeader', 'Manager') THEN
        RAISE EXCEPTION 'UNAUTHORIZED_NEXT_EVALUATOR: evaluator % is missing, inactive, or has role % instead of %', p_next_evaluator_id, v_next_user_role, p_next_evaluator_role;
      END IF;
      IF p_next_evaluator_role IN ('Leader', 'SubLeader') THEN
        SELECT is_active, leader_id
        INTO v_next_team_active, v_next_team_leader_id
        FROM public.teams
        WHERE id = v_eval.team_id
        FOR KEY SHARE;
        IF v_eval.team_id IS NULL OR NOT FOUND OR v_next_team_active IS DISTINCT FROM TRUE THEN
          RAISE EXCEPTION 'UNAUTHORIZED_NEXT_EVALUATOR: team scope is missing or inactive';
        END IF;
        IF v_next_user_team_id IS DISTINCT FROM v_eval.team_id THEN
          RAISE EXCEPTION 'UNAUTHORIZED_NEXT_EVALUATOR: evaluator must belong to the evaluation team';
        END IF;
        IF p_next_evaluator_role = 'Leader'
           AND v_next_team_leader_id IS NOT NULL
           AND p_next_evaluator_id IS DISTINCT FROM v_next_team_leader_id THEN
          RAISE EXCEPTION 'UNAUTHORIZED_NEXT_EVALUATOR: evaluator is not the appointed team Leader';
        END IF;
        IF p_next_evaluator_role = 'SubLeader'
           AND NOT EXISTS (
             SELECT 1 FROM public.users subject
             WHERE subject.id = v_eval.employee_id
               AND subject.subleader_id = p_next_evaluator_id
               AND subject.team_id = v_eval.team_id
           ) THEN
          RAISE EXCEPTION 'UNAUTHORIZED_NEXT_EVALUATOR: evaluator is not the employee''s assigned SubLeader';
        END IF;
      END IF;

      SELECT id, evaluator_id, evaluator_role, status,
             criteria_config_version_id, grade_config_version_id
      INTO v_existing_next_round_id, v_existing_next_evaluator_id, v_existing_next_evaluator_role,
           v_existing_next_status, v_existing_next_criteria_id, v_existing_next_grade_id
      FROM public.evaluation_rounds er
      WHERE er.evaluation_id = p_evaluation_id AND round = p_next_round
      FOR UPDATE;

      IF v_existing_next_round_id IS NOT NULL THEN
        IF v_existing_next_evaluator_id IS DISTINCT FROM p_next_evaluator_id
           OR v_existing_next_evaluator_role IS DISTINCT FROM p_next_evaluator_role
           OR v_existing_next_status IS DISTINCT FROM 'NotStarted'
           OR v_existing_next_criteria_id IS DISTINCT FROM v_effective_criteria_version_id
           OR v_existing_next_grade_id IS DISTINCT FROM v_effective_grade_version_id THEN
          RAISE EXCEPTION 'CONFLICTING_NEXT_ROUND: Round % already exists with a different evaluator, status, or config version', p_next_round;
        END IF;
        v_next_round_id := v_existing_next_round_id;
      ELSE
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
          created_at,
          criteria_config_version_id,
          grade_config_version_id
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
          v_effective_time,
          v_effective_criteria_version_id,
          v_effective_grade_version_id
        )
        RETURNING id INTO v_next_round_id;
      END IF;

      UPDATE public.evaluations
      SET
        status = p_next_status,
        current_round = p_next_round,
        return_note = NULL,
        updated_at = v_effective_time
      WHERE id = p_evaluation_id;

      v_final_status := p_next_status;
    ELSE
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

  round_id := v_round_id;
  evaluation_id := p_evaluation_id;
  next_round_id := v_next_round_id;
  final_status := v_final_status;
  RETURN NEXT;
END;
$function$;

COMMENT ON FUNCTION public.save_evaluation_round_transaction_active_only(
  uuid, integer, uuid, jsonb, jsonb, text, numeric, text, boolean, timestamptz,
  integer, uuid, text, text, boolean, uuid, uuid
) IS 'kurabe:p103m1t03:candidate:v1:function:save_evaluation_round_transaction_active_only';

-- ------------------------------------------------------------
-- 4. PERMISSIONS & REVOCATIONS
-- ------------------------------------------------------------
REVOKE ALL ON FUNCTION public.return_evaluation_round_transaction(uuid, integer, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.save_evaluation_round_transaction_active_only(uuid, integer, uuid, jsonb, jsonb, text, numeric, text, boolean, timestamptz, integer, uuid, text, text, boolean, uuid, uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.return_evaluation_round_transaction(uuid, integer, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.save_evaluation_round_transaction_active_only(uuid, integer, uuid, jsonb, jsonb, text, numeric, text, boolean, timestamptz, integer, uuid, text, text, boolean, uuid, uuid) TO service_role;

-- Legacy 15-argument RPCs remain revoked from PUBLIC and service_role
REVOKE EXECUTE ON FUNCTION public.save_evaluation_round_transaction(uuid, integer, uuid, jsonb, jsonb, text, numeric, text, boolean, timestamptz, integer, uuid, text, text, boolean) FROM PUBLIC, service_role;
REVOKE EXECUTE ON FUNCTION public.save_evaluation_round_transaction_active_only(uuid, integer, uuid, jsonb, jsonb, text, numeric, text, boolean, timestamptz, integer, uuid, text, text, boolean) FROM PUBLIC, service_role;

COMMIT;
