-- ============================================================
-- CANDIDATE ONLY — NOT APPLIED
-- Kurabe DB Transaction Candidate: Evaluation Transition Guard & Version Pinning (P102M3T04)
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
  IF to_regclass('public.evaluations') IS NULL
     OR to_regclass('public.evaluation_rounds') IS NULL
     OR to_regclass('public.evaluation_periods') IS NULL
     OR to_regclass('public.criteria_config_versions') IS NULL
     OR to_regclass('public.grade_band_versions') IS NULL THEN
    RAISE EXCEPTION 'P102M3T04_PREFLIGHT_FAILED: required evaluations or config version tables are missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'evaluation_rounds'
      AND column_name = 'criteria_config_version_id' AND data_type = 'uuid'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'evaluation_rounds'
      AND column_name = 'grade_config_version_id' AND data_type = 'uuid'
  ) THEN
    RAISE EXCEPTION 'P102M3T04_PREFLIGHT_FAILED: evaluation_rounds config version columns are missing or have unexpected types';
  END IF;

  IF to_regprocedure('public.guard_evaluation_transitions()') IS NOT NULL THEN
    SELECT obj_description('public.guard_evaluation_transitions()'::regprocedure::oid, 'pg_proc') INTO v_comment;
    IF v_comment IS DISTINCT FROM 'kurabe:p102m3t04:candidate:v1:function:guard_evaluation_transitions' THEN
      RAISE EXCEPTION 'P102M3T04_PREFLIGHT_FAILED: guard_evaluation_transitions function collision';
    END IF;
  END IF;
  IF to_regprocedure('public.return_evaluation_round_transaction(uuid, integer, uuid, text)') IS NOT NULL THEN
    SELECT obj_description('public.return_evaluation_round_transaction(uuid, integer, uuid, text)'::regprocedure::oid, 'pg_proc') INTO v_comment;
    IF v_comment IS DISTINCT FROM 'kurabe:p102m3t04:candidate:v1:function:return_evaluation_round_transaction' THEN
      RAISE EXCEPTION 'P102M3T04_PREFLIGHT_FAILED: return_evaluation_round_transaction function collision';
    END IF;
  END IF;
  IF to_regprocedure('public.save_evaluation_round_transaction_active_only(uuid, integer, uuid, jsonb, jsonb, text, numeric, text, boolean, timestamptz, integer, uuid, text, text, boolean, uuid, uuid)') IS NOT NULL THEN
    SELECT obj_description('public.save_evaluation_round_transaction_active_only(uuid, integer, uuid, jsonb, jsonb, text, numeric, text, boolean, timestamptz, integer, uuid, text, text, boolean, uuid, uuid)'::regprocedure::oid, 'pg_proc') INTO v_comment;
    IF v_comment IS DISTINCT FROM 'kurabe:p102m3t04:candidate:v1:function:save_evaluation_round_transaction_active_only' THEN
      RAISE EXCEPTION 'P102M3T04_PREFLIGHT_FAILED: 17-argument evaluation transaction function collision';
    END IF;
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.evaluations'::regclass
      AND tgname = 'guard_evaluation_transitions'
      AND NOT tgisinternal
  ) THEN
    SELECT obj_description(oid, 'pg_trigger') INTO v_comment
    FROM pg_trigger
    WHERE tgrelid = 'public.evaluations'::regclass
      AND tgname = 'guard_evaluation_transitions';
    IF v_comment IS DISTINCT FROM 'kurabe:p102m3t04:candidate:v1:trigger:guard_evaluation_transitions' THEN
      RAISE EXCEPTION 'P102M3T04_PREFLIGHT_FAILED: guard_evaluation_transitions trigger collision';
    END IF;
  END IF;
  IF to_regprocedure('public.guard_evaluation_round_mutations()') IS NOT NULL THEN
    SELECT obj_description('public.guard_evaluation_round_mutations()'::regprocedure::oid, 'pg_proc') INTO v_comment;
    IF v_comment IS DISTINCT FROM 'kurabe:p102m3t04:candidate:v1:function:guard_evaluation_round_mutations' THEN
      RAISE EXCEPTION 'P102M3T04_PREFLIGHT_FAILED: guard_evaluation_round_mutations function collision';
    END IF;
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.evaluation_rounds'::regclass
      AND tgname = 'guard_evaluation_round_mutations'
      AND NOT tgisinternal
  ) THEN
    SELECT obj_description(oid, 'pg_trigger') INTO v_comment
    FROM pg_trigger
    WHERE tgrelid = 'public.evaluation_rounds'::regclass
      AND tgname = 'guard_evaluation_round_mutations';
    IF v_comment IS DISTINCT FROM 'kurabe:p102m3t04:candidate:v1:trigger:guard_evaluation_round_mutations' THEN
      RAISE EXCEPTION 'P102M3T04_PREFLIGHT_FAILED: guard_evaluation_round_mutations trigger collision';
    END IF;
  END IF;
END $$;

DO $$
DECLARE
  v_comment text;
BEGIN
  IF to_regclass('public.evaluation_transition_context') IS NOT NULL THEN
    SELECT obj_description('public.evaluation_transition_context'::regclass, 'pg_class') INTO v_comment;
    IF v_comment IS DISTINCT FROM 'kurabe:p102m3t04:candidate:v1:table:evaluation_transition_context' THEN
      RAISE EXCEPTION 'P102M3T04_PREFLIGHT_FAILED: evaluation_transition_context table collision';
    END IF;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.evaluation_transition_context (
  context_key uuid PRIMARY KEY,
  txid bigint NOT NULL,
  context text NOT NULL CHECK (context IN ('save_rpc', 'return_rpc')),
  created_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.evaluation_transition_context
IS 'kurabe:p102m3t04:candidate:v1:table:evaluation_transition_context';
REVOKE ALL ON TABLE public.evaluation_transition_context FROM PUBLIC, anon, authenticated, service_role;

-- ------------------------------------------------------------
-- 2. MONOTONIC TRANSITION GUARD TRIGGER FUNCTION
-- Enforces that evaluations.status and current_round never downgrade or skip forwards,
-- except through explicit returns carrying a non-empty return_note.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_evaluation_transitions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_old_rank integer;
  v_new_rank integer;
  v_has_transition_context boolean;
BEGIN
  v_has_transition_context := EXISTS (
    SELECT 1 FROM public.evaluation_transition_context c
    WHERE c.context_key::text IN (
      NULLIF(current_setting('kurabe.p102m3t04.save_context_key', true), ''),
      NULLIF(current_setting('kurabe.p102m3t04.return_context_key', true), '')
    )
      AND c.txid = txid_current()
  );
  IF OLD.current_round IS NULL OR NEW.current_round IS NULL THEN
    RAISE EXCEPTION 'P102M3T04_INVALID_TRANSITION: current_round cannot be null';
  END IF;
  IF (NEW.status IS DISTINCT FROM OLD.status
      OR NEW.current_round IS DISTINCT FROM OLD.current_round
      OR NEW.final_score IS DISTINCT FROM OLD.final_score
      OR NEW.final_grade IS DISTINCT FROM OLD.final_grade)
     AND NOT v_has_transition_context THEN
    RAISE EXCEPTION 'P102M3T04_INVALID_TRANSITION: evaluation graph fields require a transactional RPC';
  END IF;
  v_old_rank := CASE OLD.status
    WHEN 'NotStarted' THEN 1
    WHEN 'Draft' THEN 2
    WHEN 'Submitted' THEN 3
    WHEN 'Reviewed' THEN 4
    WHEN 'Approved' THEN 5
    ELSE 0
  END;

  v_new_rank := CASE NEW.status
    WHEN 'NotStarted' THEN 1
    WHEN 'Draft' THEN 2
    WHEN 'Submitted' THEN 3
    WHEN 'Reviewed' THEN 4
    WHEN 'Approved' THEN 5
    ELSE 0
  END;

  IF v_new_rank > v_old_rank + 1
     AND NOT (OLD.status IN ('Draft', 'Submitted') AND NEW.status = 'Approved'
              AND NEW.current_round = OLD.current_round
              AND NEW.final_score IS NOT NULL
              AND NEW.final_grade IS NOT NULL
              AND EXISTS (
                SELECT 1 FROM public.evaluation_transition_context c
                WHERE c.context_key::text = NULLIF(current_setting('kurabe.p102m3t04.save_context_key', true), '')
                  AND c.txid = txid_current()
                  AND c.context = 'save_rpc'
              )) THEN
    RAISE EXCEPTION 'P102M3T04_INVALID_TRANSITION: status cannot skip forward from % to %', OLD.status, NEW.status;
  END IF;

  -- 1. Approved evaluation state
  IF OLD.status = 'Approved' THEN
    IF NEW.status = 'Approved' THEN
      IF NEW.current_round IS DISTINCT FROM OLD.current_round
         OR NEW.final_score IS DISTINCT FROM OLD.final_score
         OR NEW.final_grade IS DISTINCT FROM OLD.final_grade
         OR NEW.employee_id IS DISTINCT FROM OLD.employee_id
         OR NEW.period_id IS DISTINCT FROM OLD.period_id
         OR NEW.return_note IS DISTINCT FROM OLD.return_note THEN
        RAISE EXCEPTION 'P102M3T04_INVALID_TRANSITION: Approved evaluation cannot be mutated';
      END IF;
      RETURN NEW;
    ELSE
      -- Leaving Approved is only permitted via explicit return of round 1 to Draft with non-empty return_note
      IF NEW.return_note IS NULL OR length(trim(NEW.return_note)) = 0 THEN
        RAISE EXCEPTION 'P102M3T04_INVALID_TRANSITION: Approved evaluation cannot be downgraded without return note';
      END IF;
      IF NOT EXISTS (
        SELECT 1
        FROM public.evaluation_transition_context c
        WHERE c.context_key::text = NULLIF(current_setting('kurabe.p102m3t04.return_context_key', true), '')
          AND c.txid = txid_current()
          AND c.context = 'return_rpc'
      ) THEN
        RAISE EXCEPTION 'P102M3T04_INVALID_TRANSITION: Approved evaluation can only be returned through the transactional return RPC';
      END IF;
      IF NOT (OLD.current_round = 1 AND NEW.current_round = 1 AND NEW.status = 'Draft') THEN
        RAISE EXCEPTION 'P102M3T04_INVALID_TRANSITION: Approved evaluation can only be returned to round 1 Draft';
      END IF;
      RETURN NEW;
    END IF;
  END IF;

  -- 2. Current round monotonicity check
  IF OLD.current_round IS NOT NULL AND NEW.current_round IS NOT NULL THEN
    IF NEW.current_round < OLD.current_round THEN
      IF NEW.return_note IS NULL OR length(trim(NEW.return_note)) = 0 THEN
        RAISE EXCEPTION 'P102M3T04_INVALID_TRANSITION: current_round cannot regress without a return note';
      END IF;
      IF NOT EXISTS (
        SELECT 1
        FROM public.evaluation_transition_context c
        WHERE c.context_key::text = NULLIF(current_setting('kurabe.p102m3t04.return_context_key', true), '')
          AND c.txid = txid_current()
          AND c.context = 'return_rpc'
      ) THEN
        RAISE EXCEPTION 'P102M3T04_INVALID_TRANSITION: current_round can only regress through the transactional return RPC';
      END IF;
      IF NEW.current_round <> OLD.current_round - 1 THEN
        RAISE EXCEPTION 'P102M3T04_INVALID_TRANSITION: current_round can only regress by one round at a time';
      END IF;
    ELSIF NEW.current_round > OLD.current_round + 1 THEN
      RAISE EXCEPTION 'P102M3T04_INVALID_TRANSITION: current_round cannot skip forward by more than one round';
    END IF;
  END IF;

  -- 3. Status monotonicity check
  IF v_new_rank < v_old_rank THEN
    IF NEW.return_note IS NULL OR length(trim(NEW.return_note)) = 0 THEN
      RAISE EXCEPTION 'P102M3T04_INVALID_TRANSITION: status cannot downgrade without a return note';
    END IF;
    IF NOT EXISTS (
        SELECT 1
        FROM public.evaluation_transition_context c
        WHERE c.context_key::text = NULLIF(current_setting('kurabe.p102m3t04.return_context_key', true), '')
          AND c.txid = txid_current()
          AND c.context = 'return_rpc'
      ) THEN
      RAISE EXCEPTION 'P102M3T04_INVALID_TRANSITION: status can only downgrade through the transactional return RPC';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.guard_evaluation_transitions()
IS 'kurabe:p102m3t04:candidate:v1:function:guard_evaluation_transitions';

DROP TRIGGER IF EXISTS guard_evaluation_transitions ON public.evaluations;
CREATE TRIGGER guard_evaluation_transitions
BEFORE UPDATE ON public.evaluations
FOR EACH ROW EXECUTE FUNCTION public.guard_evaluation_transitions();

COMMENT ON TRIGGER guard_evaluation_transitions ON public.evaluations
IS 'kurabe:p102m3t04:candidate:v1:trigger:guard_evaluation_transitions';

-- ------------------------------------------------------------
-- 2B. IMMUTABLE SUBMITTED-ROUND SNAPSHOT GUARD
-- Direct service-role writes must not mutate submitted history; only the
-- transaction-local return context may unlock/reset a submitted round.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_evaluation_round_mutations()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_old_rank integer;
  v_new_rank integer;
  v_has_any_context boolean;
  v_has_return_context boolean;
BEGIN
  v_has_any_context := EXISTS (
    SELECT 1 FROM public.evaluation_transition_context c
    WHERE c.context_key::text = NULLIF(current_setting('kurabe.p102m3t04.save_context_key', true), '')
      AND c.txid = txid_current() AND c.context = 'save_rpc'
  ) OR EXISTS (
    SELECT 1 FROM public.evaluation_transition_context c
    WHERE c.context_key::text = NULLIF(current_setting('kurabe.p102m3t04.return_context_key', true), '')
      AND c.txid = txid_current() AND c.context = 'return_rpc'
  );
  v_has_return_context := EXISTS (
    SELECT 1 FROM public.evaluation_transition_context c
    WHERE c.context_key::text = NULLIF(current_setting('kurabe.p102m3t04.return_context_key', true), '')
      AND c.txid = txid_current() AND c.context = 'return_rpc'
  );

  IF TG_OP = 'INSERT' THEN
    IF NEW.status IS DISTINCT FROM 'NotStarted' AND NOT v_has_any_context THEN
      RAISE EXCEPTION 'P102M3T04_INVALID_ROUND: direct progressed round insertion is not permitted';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF NOT v_has_any_context THEN
      RAISE EXCEPTION 'P102M3T04_INVALID_ROUND: direct round deletion is not permitted';
    END IF;
    RETURN OLD;
  END IF;


  IF NOT v_has_any_context AND (
      NEW.status IS DISTINCT FROM OLD.status
      OR OLD.status IN ('Submitted', 'Reviewed', 'Approved')
    ) AND (
      NEW.evaluator_id IS DISTINCT FROM OLD.evaluator_id
      OR NEW.evaluator_role IS DISTINCT FROM OLD.evaluator_role
      OR NEW.scores IS DISTINCT FROM OLD.scores
      OR NEW.notes IS DISTINCT FROM OLD.notes
      OR NEW.comment IS DISTINCT FROM OLD.comment
      OR NEW.additional_comment IS DISTINCT FROM OLD.additional_comment
      OR NEW.total_score IS DISTINCT FROM OLD.total_score
      OR NEW.grade IS DISTINCT FROM OLD.grade
      OR NEW.status IS DISTINCT FROM OLD.status
      OR NEW.submitted_at IS DISTINCT FROM OLD.submitted_at
      OR NEW.created_at IS DISTINCT FROM OLD.created_at
      OR NEW.criteria_config_version_id IS DISTINCT FROM OLD.criteria_config_version_id
      OR NEW.grade_config_version_id IS DISTINCT FROM OLD.grade_config_version_id
    ) THEN
    RAISE EXCEPTION 'P102M3T04_INVALID_ROUND: direct round mutation is not permitted';
  END IF;

  v_old_rank := CASE OLD.status
    WHEN 'NotStarted' THEN 1
    WHEN 'Draft' THEN 2
    WHEN 'Submitted' THEN 3
    WHEN 'Reviewed' THEN 4
    WHEN 'Approved' THEN 5
    ELSE 0
  END;
  v_new_rank := CASE NEW.status
    WHEN 'NotStarted' THEN 1
    WHEN 'Draft' THEN 2
    WHEN 'Submitted' THEN 3
    WHEN 'Reviewed' THEN 4
    WHEN 'Approved' THEN 5
    ELSE 0
  END;

  IF NEW.status = 'Submitted' AND NEW.submitted_at IS NULL THEN
    RAISE EXCEPTION 'P102M3T04_INVALID_ROUND: submitted round requires submitted_at';
  END IF;
  IF NEW.submitted_at IS NOT NULL AND NEW.status <> 'Submitted' THEN
    RAISE EXCEPTION 'P102M3T04_INVALID_ROUND: submitted_at requires Submitted status';
  END IF;
  IF NEW.status IN ('Submitted', 'Reviewed', 'Approved')
     AND (NEW.criteria_config_version_id IS NULL OR NEW.grade_config_version_id IS NULL) THEN
    RAISE EXCEPTION 'P102M3T04_INVALID_ROUND: submitted history requires criteria and grade config versions';
  END IF;

  IF v_old_rank >= 3 THEN
    IF NOT EXISTS (
        SELECT 1
        FROM public.evaluation_transition_context c
        WHERE c.context_key::text = NULLIF(current_setting('kurabe.p102m3t04.return_context_key', true), '')
          AND c.txid = txid_current()
          AND c.context = 'return_rpc'
      ) THEN
      IF NEW.scores IS DISTINCT FROM OLD.scores
         OR NEW.notes IS DISTINCT FROM OLD.notes
         OR NEW.comment IS DISTINCT FROM OLD.comment
         OR NEW.additional_comment IS DISTINCT FROM OLD.additional_comment
         OR NEW.total_score IS DISTINCT FROM OLD.total_score
         OR NEW.grade IS DISTINCT FROM OLD.grade
         OR NEW.status IS DISTINCT FROM OLD.status
         OR NEW.submitted_at IS DISTINCT FROM OLD.submitted_at
         OR NEW.created_at IS DISTINCT FROM OLD.created_at
         OR NEW.criteria_config_version_id IS DISTINCT FROM OLD.criteria_config_version_id
         OR NEW.grade_config_version_id IS DISTINCT FROM OLD.grade_config_version_id THEN
        RAISE EXCEPTION 'P102M3T04_INVALID_ROUND: submitted history can only change through the transactional return RPC';
      END IF;
    END IF;
  END IF;

  IF v_new_rank < v_old_rank
     AND NOT v_has_return_context
    AND NOT EXISTS (
        SELECT 1
        FROM public.evaluation_transition_context c
        WHERE c.context_key::text = NULLIF(current_setting('kurabe.p102m3t04.return_context_key', true), '')
          AND c.txid = txid_current()
          AND c.context = 'return_rpc'
      ) THEN
    RAISE EXCEPTION 'P102M3T04_INVALID_ROUND: round status can only regress through the transactional return RPC';
  END IF;
  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.guard_evaluation_round_mutations()
IS 'kurabe:p102m3t04:candidate:v1:function:guard_evaluation_round_mutations';

DROP TRIGGER IF EXISTS guard_evaluation_round_mutations ON public.evaluation_rounds;
CREATE TRIGGER guard_evaluation_round_mutations
BEFORE INSERT OR UPDATE OR DELETE ON public.evaluation_rounds
FOR EACH ROW EXECUTE FUNCTION public.guard_evaluation_round_mutations();

COMMENT ON TRIGGER guard_evaluation_round_mutations ON public.evaluation_rounds
IS 'kurabe:p102m3t04:candidate:v1:trigger:guard_evaluation_round_mutations';

-- ------------------------------------------------------------
-- 3. TRANSACTIONAL RETURN RPC FUNCTION
-- Atomically resets the current round, unlocks the previous round to Draft,
-- and rolls back evaluation status under period and evaluation row locks.
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
  v_round record;
  v_prev_round record;
  v_new_status text;
  v_trimmed_reason text;
  v_transition_key uuid;
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

  -- 2. Period Lock & Active Check
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

  -- 3. Lock evaluation FOR UPDATE
  SELECT id, employee_id, employee_role, current_round, status
  INTO v_eval
  FROM public.evaluations
  WHERE id = p_evaluation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'EVALUATION_NOT_FOUND: Evaluation % does not exist', p_evaluation_id;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = p_actor_id
      AND u.is_active IS TRUE
      AND (u.role = 'Manager' OR (p_round > 1 AND u.role IN ('Leader', 'Manager')))
  ) THEN
    RAISE EXCEPTION 'UNAUTHORIZED_ACTOR: return requires an active Manager actor';
  END IF;

  v_transition_key := gen_random_uuid();
  INSERT INTO public.evaluation_transition_context (context_key, txid, context)
  VALUES (v_transition_key, txid_current(), 'return_rpc');
  PERFORM set_config('kurabe.p102m3t04.return_context_key', v_transition_key::text, true);

  -- 4. Branch by round
  IF p_round = 1 THEN
    -- Case B: Manager round 1 Approved -> return to Draft
    IF v_eval.status IS DISTINCT FROM 'Approved' OR v_eval.current_round <> 1 THEN
      RAISE EXCEPTION 'P102M3T04_CANNOT_RETURN: Round 1 can only be returned when evaluation is Approved and current_round is 1';
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
IS 'kurabe:p102m3t04:candidate:v1:function:return_evaluation_round_transaction';

-- ------------------------------------------------------------
-- 4. 17-ARGUMENT TRANSACTIONAL EVALUATION WRITER RPC FUNCTION
-- Carries rendered criteria_config_version_id and grade_config_version_id,
-- locks period, evaluation, and rounds, checks active versions under advisory locks,
-- enforces monotonic state, and prevents unsafe mutations on submitted rounds.
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

  -- 2. Lock parent evaluation period FOR UPDATE and verify active
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

  -- 3. Version Lock & Validation under advisory transaction locks
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

  -- 4. Lock evaluation FOR UPDATE
  SELECT id, employee_id, status, current_round, team_id, employee_role
  INTO v_eval
  FROM public.evaluations
  WHERE id = p_evaluation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'EVALUATION_NOT_FOUND: Evaluation % does not exist', p_evaluation_id;
  END IF;

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

  -- 5. Lock target round FOR UPDATE
  SELECT id, status, submitted_at, evaluator_id, scores, notes, comment, total_score, grade,
         criteria_config_version_id, grade_config_version_id
  INTO v_round
  FROM public.evaluation_rounds er
  WHERE er.evaluation_id = p_evaluation_id AND round = p_round
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ROUND_NOT_FOUND: Round % for evaluation % does not exist', p_round, p_evaluation_id;
  END IF;

  IF v_round.evaluator_id IS DISTINCT FROM p_actor_id THEN
    RAISE EXCEPTION 'UNAUTHORIZED_EVALUATOR: Actor % is not assigned to round % (assigned: %)', p_actor_id, p_round, v_round.evaluator_id;
  END IF;

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

  -- 6. Update target round with version pins
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

  -- 7. Flow Transitions
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
) IS 'kurabe:p102m3t04:candidate:v1:function:save_evaluation_round_transaction_active_only';

-- ------------------------------------------------------------
-- 5. PERMISSIONS & REVOCATIONS
-- ------------------------------------------------------------
REVOKE ALL ON FUNCTION public.guard_evaluation_transitions() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.return_evaluation_round_transaction(uuid, integer, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.save_evaluation_round_transaction_active_only(uuid, integer, uuid, jsonb, jsonb, text, numeric, text, boolean, timestamptz, integer, uuid, text, text, boolean, uuid, uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.return_evaluation_round_transaction(uuid, integer, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.save_evaluation_round_transaction_active_only(uuid, integer, uuid, jsonb, jsonb, text, numeric, text, boolean, timestamptz, integer, uuid, text, text, boolean, uuid, uuid) TO service_role;

-- Legacy 15-argument RPCs are not safe entry points after this migration;
-- preserve their definitions but remove service_role execution access.
REVOKE EXECUTE ON FUNCTION public.save_evaluation_round_transaction(uuid, integer, uuid, jsonb, jsonb, text, numeric, text, boolean, timestamptz, integer, uuid, text, text, boolean) FROM PUBLIC, service_role;
REVOKE EXECUTE ON FUNCTION public.save_evaluation_round_transaction_active_only(uuid, integer, uuid, jsonb, jsonb, text, numeric, text, boolean, timestamptz, integer, uuid, text, text, boolean) FROM PUBLIC, service_role;

REVOKE ALL ON FUNCTION public.guard_evaluation_round_mutations() FROM PUBLIC, anon, authenticated, service_role;

COMMIT;
