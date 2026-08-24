-- ============================================================
-- CANDIDATE ONLY — NOT APPLIED
-- Kurabe DB Transaction Candidate: Save Evaluation Round Transaction
-- DO NOT EXECUTE DIRECTLY WITHOUT EXPLICIT MIGRATION APPROVAL
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. PREFLIGHT DUPLICATE CHECKS
-- Fail closed with clear exceptions if duplicates already exist
-- (Do NOT deduplicate data automatically)
-- ------------------------------------------------------------
DO $$
DECLARE
  v_eval_dup_count integer := 0;
  v_round_dup_count integer := 0;
BEGIN
  -- Check duplicate (period_id, employee_id) on evaluations
  SELECT COUNT(*) INTO v_eval_dup_count
  FROM (
    SELECT period_id, employee_id, COUNT(*)
    FROM public.evaluations
    GROUP BY period_id, employee_id
    HAVING COUNT(*) > 1
  ) dups;

  IF v_eval_dup_count > 0 THEN
    RAISE EXCEPTION 'PREFLIGHT_FAIL: Found % duplicate (period_id, employee_id) groups in evaluations. Manual inspection required before adding unique constraint.', v_eval_dup_count;
  END IF;

  -- Check duplicate (evaluation_id, round) on evaluation_rounds
  SELECT COUNT(*) INTO v_round_dup_count
  FROM (
    SELECT evaluation_id, round, COUNT(*)
    FROM public.evaluation_rounds
    GROUP BY evaluation_id, round
    HAVING COUNT(*) > 1
  ) dups;

  IF v_round_dup_count > 0 THEN
    RAISE EXCEPTION 'PREFLIGHT_FAIL: Found % duplicate (evaluation_id, round) groups in evaluation_rounds. Manual inspection required before adding unique constraint.', v_round_dup_count;
  END IF;
END $$;

-- ------------------------------------------------------------
-- 2. SCHEMA CONSTRAINTS & INDEXES (Fail-Closed Provenance Ownership)
-- ------------------------------------------------------------

-- 2.1 Unique (period_id, employee_id) on evaluations
DO $$
DECLARE
  v_con_oid oid;
  v_comment text;
BEGIN
  SELECT oid INTO v_con_oid
  FROM pg_constraint
  WHERE conname = 'uq_evaluations_period_employee'
    AND conrelid = to_regclass('public.evaluations');

  IF v_con_oid IS NOT NULL THEN
    SELECT description INTO v_comment
    FROM pg_description
    WHERE objoid = v_con_oid AND classoid = 'pg_constraint'::regclass AND objsubid = 0;

    IF v_comment IS DISTINCT FROM 'kurabe:p3:candidate:v1:constraint:uq_evaluations_period_employee' THEN
      RAISE EXCEPTION 'PROVENANCE_MISMATCH: Constraint uq_evaluations_period_employee on public.evaluations already exists but comment "%" does not match expected marker "kurabe:p3:candidate:v1:constraint:uq_evaluations_period_employee". Aborting.', v_comment;
    END IF;
    RAISE NOTICE 'Constraint uq_evaluations_period_employee on public.evaluations already exists with valid provenance marker. Skipping.';
  ELSE
    ALTER TABLE public.evaluations
      ADD CONSTRAINT uq_evaluations_period_employee UNIQUE (period_id, employee_id);
    COMMENT ON CONSTRAINT uq_evaluations_period_employee ON public.evaluations
      IS 'kurabe:p3:candidate:v1:constraint:uq_evaluations_period_employee';
    RAISE NOTICE 'CREATED: Constraint uq_evaluations_period_employee on public.evaluations';
  END IF;
END $$;

-- 2.2 Explicit Index idx_evaluations_period_employee
DO $$
DECLARE
  v_idx_oid oid;
  v_comment text;
BEGIN
  SELECT c.oid INTO v_idx_oid
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'idx_evaluations_period_employee'
    AND c.relkind = 'i';

  IF v_idx_oid IS NOT NULL THEN
    SELECT description INTO v_comment
    FROM pg_description
    WHERE objoid = v_idx_oid AND classoid = 'pg_class'::regclass AND objsubid = 0;

    IF v_comment IS DISTINCT FROM 'kurabe:p3:candidate:v1:index:idx_evaluations_period_employee' THEN
      RAISE EXCEPTION 'PROVENANCE_MISMATCH: Index public.idx_evaluations_period_employee already exists but comment "%" does not match expected marker "kurabe:p3:candidate:v1:index:idx_evaluations_period_employee". Aborting.', v_comment;
    END IF;
    RAISE NOTICE 'Index public.idx_evaluations_period_employee already exists with valid provenance marker. Skipping.';
  ELSE
    CREATE INDEX idx_evaluations_period_employee
      ON public.evaluations (period_id, employee_id);
    COMMENT ON INDEX public.idx_evaluations_period_employee
      IS 'kurabe:p3:candidate:v1:index:idx_evaluations_period_employee';
    RAISE NOTICE 'CREATED: Index public.idx_evaluations_period_employee';
  END IF;
END $$;

-- 2.3 Unique (evaluation_id, round) on evaluation_rounds
DO $$
DECLARE
  v_con_oid oid;
  v_comment text;
BEGIN
  SELECT oid INTO v_con_oid
  FROM pg_constraint
  WHERE conname = 'uq_evaluation_rounds_eval_round'
    AND conrelid = to_regclass('public.evaluation_rounds');

  IF v_con_oid IS NOT NULL THEN
    SELECT description INTO v_comment
    FROM pg_description
    WHERE objoid = v_con_oid AND classoid = 'pg_constraint'::regclass AND objsubid = 0;

    IF v_comment IS DISTINCT FROM 'kurabe:p3:candidate:v1:constraint:uq_evaluation_rounds_eval_round' THEN
      RAISE EXCEPTION 'PROVENANCE_MISMATCH: Constraint uq_evaluation_rounds_eval_round on public.evaluation_rounds already exists but comment "%" does not match expected marker "kurabe:p3:candidate:v1:constraint:uq_evaluation_rounds_eval_round". Aborting.', v_comment;
    END IF;
    RAISE NOTICE 'Constraint uq_evaluation_rounds_eval_round on public.evaluation_rounds already exists with valid provenance marker. Skipping.';
  ELSE
    ALTER TABLE public.evaluation_rounds
      ADD CONSTRAINT uq_evaluation_rounds_eval_round UNIQUE (evaluation_id, round);
    COMMENT ON CONSTRAINT uq_evaluation_rounds_eval_round ON public.evaluation_rounds
      IS 'kurabe:p3:candidate:v1:constraint:uq_evaluation_rounds_eval_round';
    RAISE NOTICE 'CREATED: Constraint uq_evaluation_rounds_eval_round on public.evaluation_rounds';
  END IF;
END $$;

-- 2.4 Explicit Index idx_evaluation_rounds_eval_round
DO $$
DECLARE
  v_idx_oid oid;
  v_comment text;
BEGIN
  SELECT c.oid INTO v_idx_oid
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'idx_evaluation_rounds_eval_round'
    AND c.relkind = 'i';

  IF v_idx_oid IS NOT NULL THEN
    SELECT description INTO v_comment
    FROM pg_description
    WHERE objoid = v_idx_oid AND classoid = 'pg_class'::regclass AND objsubid = 0;

    IF v_comment IS DISTINCT FROM 'kurabe:p3:candidate:v1:index:idx_evaluation_rounds_eval_round' THEN
      RAISE EXCEPTION 'PROVENANCE_MISMATCH: Index public.idx_evaluation_rounds_eval_round already exists but comment "%" does not match expected marker "kurabe:p3:candidate:v1:index:idx_evaluation_rounds_eval_round". Aborting.', v_comment;
    END IF;
    RAISE NOTICE 'Index public.idx_evaluation_rounds_eval_round already exists with valid provenance marker. Skipping.';
  ELSE
    CREATE INDEX idx_evaluation_rounds_eval_round
      ON public.evaluation_rounds (evaluation_id, round);
    COMMENT ON INDEX public.idx_evaluation_rounds_eval_round
      IS 'kurabe:p3:candidate:v1:index:idx_evaluation_rounds_eval_round';
    RAISE NOTICE 'CREATED: Index public.idx_evaluation_rounds_eval_round';
  END IF;
END $$;

-- 2.5 Round range check (1..3) on evaluation_rounds
DO $$
DECLARE
  v_con_oid oid;
  v_comment text;
BEGIN
  SELECT oid INTO v_con_oid
  FROM pg_constraint
  WHERE conname = 'chk_evaluation_rounds_round_range'
    AND conrelid = to_regclass('public.evaluation_rounds');

  IF v_con_oid IS NOT NULL THEN
    SELECT description INTO v_comment
    FROM pg_description
    WHERE objoid = v_con_oid AND classoid = 'pg_constraint'::regclass AND objsubid = 0;

    IF v_comment IS DISTINCT FROM 'kurabe:p3:candidate:v1:constraint:chk_evaluation_rounds_round_range' THEN
      RAISE EXCEPTION 'PROVENANCE_MISMATCH: Constraint chk_evaluation_rounds_round_range on public.evaluation_rounds already exists but comment "%" does not match expected marker "kurabe:p3:candidate:v1:constraint:chk_evaluation_rounds_round_range". Aborting.', v_comment;
    END IF;
    RAISE NOTICE 'Constraint chk_evaluation_rounds_round_range on public.evaluation_rounds already exists with valid provenance marker. Skipping.';
  ELSE
    ALTER TABLE public.evaluation_rounds
      ADD CONSTRAINT chk_evaluation_rounds_round_range CHECK (round BETWEEN 1 AND 3);
    COMMENT ON CONSTRAINT chk_evaluation_rounds_round_range ON public.evaluation_rounds
      IS 'kurabe:p3:candidate:v1:constraint:chk_evaluation_rounds_round_range';
    RAISE NOTICE 'CREATED: Constraint chk_evaluation_rounds_round_range on public.evaluation_rounds';
  END IF;
END $$;

-- 2.6 Current round range check (1..3) on evaluations
DO $$
DECLARE
  v_con_oid oid;
  v_comment text;
BEGIN
  SELECT oid INTO v_con_oid
  FROM pg_constraint
  WHERE conname = 'chk_evaluations_current_round_range'
    AND conrelid = to_regclass('public.evaluations');

  IF v_con_oid IS NOT NULL THEN
    SELECT description INTO v_comment
    FROM pg_description
    WHERE objoid = v_con_oid AND classoid = 'pg_constraint'::regclass AND objsubid = 0;

    IF v_comment IS DISTINCT FROM 'kurabe:p3:candidate:v1:constraint:chk_evaluations_current_round_range' THEN
      RAISE EXCEPTION 'PROVENANCE_MISMATCH: Constraint chk_evaluations_current_round_range on public.evaluations already exists but comment "%" does not match expected marker "kurabe:p3:candidate:v1:constraint:chk_evaluations_current_round_range". Aborting.', v_comment;
    END IF;
    RAISE NOTICE 'Constraint chk_evaluations_current_round_range on public.evaluations already exists with valid provenance marker. Skipping.';
  ELSE
    ALTER TABLE public.evaluations
      ADD CONSTRAINT chk_evaluations_current_round_range CHECK (current_round IS NULL OR current_round BETWEEN 1 AND 3);
    COMMENT ON CONSTRAINT chk_evaluations_current_round_range ON public.evaluations
      IS 'kurabe:p3:candidate:v1:constraint:chk_evaluations_current_round_range';
    RAISE NOTICE 'CREATED: Constraint chk_evaluations_current_round_range on public.evaluations';
  END IF;
END $$;

-- 2.7 Valid status check on evaluations matching verified source types
-- Source: 'NotStarted' | 'Draft' | 'Submitted' | 'Reviewed' | 'Approved'
DO $$
DECLARE
  v_con_oid oid;
  v_comment text;
BEGIN
  SELECT oid INTO v_con_oid
  FROM pg_constraint
  WHERE conname = 'chk_evaluations_status_valid'
    AND conrelid = to_regclass('public.evaluations');

  IF v_con_oid IS NOT NULL THEN
    SELECT description INTO v_comment
    FROM pg_description
    WHERE objoid = v_con_oid AND classoid = 'pg_constraint'::regclass AND objsubid = 0;

    IF v_comment IS DISTINCT FROM 'kurabe:p3:candidate:v1:constraint:chk_evaluations_status_valid' THEN
      RAISE EXCEPTION 'PROVENANCE_MISMATCH: Constraint chk_evaluations_status_valid on public.evaluations already exists but comment "%" does not match expected marker "kurabe:p3:candidate:v1:constraint:chk_evaluations_status_valid". Aborting.', v_comment;
    END IF;
    RAISE NOTICE 'Constraint chk_evaluations_status_valid on public.evaluations already exists with valid provenance marker. Skipping.';
  ELSE
    ALTER TABLE public.evaluations
      ADD CONSTRAINT chk_evaluations_status_valid
      CHECK (status IN ('NotStarted', 'Draft', 'Submitted', 'Reviewed', 'Approved'));
    COMMENT ON CONSTRAINT chk_evaluations_status_valid ON public.evaluations
      IS 'kurabe:p3:candidate:v1:constraint:chk_evaluations_status_valid';
    RAISE NOTICE 'CREATED: Constraint chk_evaluations_status_valid on public.evaluations';
  END IF;
END $$;

-- 2.8 Valid status check on evaluation_rounds matching verified source types
-- Source: 'NotStarted' | 'Draft' | 'Submitted'
DO $$
DECLARE
  v_con_oid oid;
  v_comment text;
BEGIN
  SELECT oid INTO v_con_oid
  FROM pg_constraint
  WHERE conname = 'chk_evaluation_rounds_status_valid'
    AND conrelid = to_regclass('public.evaluation_rounds');

  IF v_con_oid IS NOT NULL THEN
    SELECT description INTO v_comment
    FROM pg_description
    WHERE objoid = v_con_oid AND classoid = 'pg_constraint'::regclass AND objsubid = 0;

    IF v_comment IS DISTINCT FROM 'kurabe:p3:candidate:v1:constraint:chk_evaluation_rounds_status_valid' THEN
      RAISE EXCEPTION 'PROVENANCE_MISMATCH: Constraint chk_evaluation_rounds_status_valid on public.evaluation_rounds already exists but comment "%" does not match expected marker "kurabe:p3:candidate:v1:constraint:chk_evaluation_rounds_status_valid". Aborting.', v_comment;
    END IF;
    RAISE NOTICE 'Constraint chk_evaluation_rounds_status_valid on public.evaluation_rounds already exists with valid provenance marker. Skipping.';
  ELSE
    ALTER TABLE public.evaluation_rounds
      ADD CONSTRAINT chk_evaluation_rounds_status_valid
      CHECK (status IN ('NotStarted', 'Draft', 'Submitted'));
    COMMENT ON CONSTRAINT chk_evaluation_rounds_status_valid ON public.evaluation_rounds
      IS 'kurabe:p3:candidate:v1:constraint:chk_evaluation_rounds_status_valid';
    RAISE NOTICE 'CREATED: Constraint chk_evaluation_rounds_status_valid on public.evaluation_rounds';
  END IF;
END $$;

-- 2.9 Total score non-negative check on evaluation_rounds
DO $$
DECLARE
  v_con_oid oid;
  v_comment text;
BEGIN
  SELECT oid INTO v_con_oid
  FROM pg_constraint
  WHERE conname = 'chk_evaluation_rounds_total_score_non_negative'
    AND conrelid = to_regclass('public.evaluation_rounds');

  IF v_con_oid IS NOT NULL THEN
    SELECT description INTO v_comment
    FROM pg_description
    WHERE objoid = v_con_oid AND classoid = 'pg_constraint'::regclass AND objsubid = 0;

    IF v_comment IS DISTINCT FROM 'kurabe:p3:candidate:v1:constraint:chk_evaluation_rounds_total_score_non_negative' THEN
      RAISE EXCEPTION 'PROVENANCE_MISMATCH: Constraint chk_evaluation_rounds_total_score_non_negative on public.evaluation_rounds already exists but comment "%" does not match expected marker "kurabe:p3:candidate:v1:constraint:chk_evaluation_rounds_total_score_non_negative". Aborting.', v_comment;
    END IF;
    RAISE NOTICE 'Constraint chk_evaluation_rounds_total_score_non_negative on public.evaluation_rounds already exists with valid provenance marker. Skipping.';
  ELSE
    ALTER TABLE public.evaluation_rounds
      ADD CONSTRAINT chk_evaluation_rounds_total_score_non_negative
      CHECK (total_score IS NULL OR total_score >= 0);
    COMMENT ON CONSTRAINT chk_evaluation_rounds_total_score_non_negative ON public.evaluation_rounds
      IS 'kurabe:p3:candidate:v1:constraint:chk_evaluation_rounds_total_score_non_negative';
    RAISE NOTICE 'CREATED: Constraint chk_evaluation_rounds_total_score_non_negative on public.evaluation_rounds';
  END IF;
END $$;

-- 2.10 Final score non-negative check on evaluations
DO $$
DECLARE
  v_con_oid oid;
  v_comment text;
BEGIN
  SELECT oid INTO v_con_oid
  FROM pg_constraint
  WHERE conname = 'chk_evaluations_final_score_non_negative'
    AND conrelid = to_regclass('public.evaluations');

  IF v_con_oid IS NOT NULL THEN
    SELECT description INTO v_comment
    FROM pg_description
    WHERE objoid = v_con_oid AND classoid = 'pg_constraint'::regclass AND objsubid = 0;

    IF v_comment IS DISTINCT FROM 'kurabe:p3:candidate:v1:constraint:chk_evaluations_final_score_non_negative' THEN
      RAISE EXCEPTION 'PROVENANCE_MISMATCH: Constraint chk_evaluations_final_score_non_negative on public.evaluations already exists but comment "%" does not match expected marker "kurabe:p3:candidate:v1:constraint:chk_evaluations_final_score_non_negative". Aborting.', v_comment;
    END IF;
    RAISE NOTICE 'Constraint chk_evaluations_final_score_non_negative on public.evaluations already exists with valid provenance marker. Skipping.';
  ELSE
    ALTER TABLE public.evaluations
      ADD CONSTRAINT chk_evaluations_final_score_non_negative
      CHECK (final_score IS NULL OR final_score >= 0);
    COMMENT ON CONSTRAINT chk_evaluations_final_score_non_negative ON public.evaluations
      IS 'kurabe:p3:candidate:v1:constraint:chk_evaluations_final_score_non_negative';
    RAISE NOTICE 'CREATED: Constraint chk_evaluations_final_score_non_negative on public.evaluations';
  END IF;
END $$;

-- ------------------------------------------------------------
-- 3. ATOMIC EVALUATION ROUND TRANSACTION RPC FUNCTION
-- (Fail-Closed One-Shot Creation: Refuses replacement of existing functions)
-- ------------------------------------------------------------

DO $$
DECLARE
  v_proc_oid oid;
  v_comment text;
BEGIN
  SELECT p.oid INTO v_proc_oid
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.relnamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'save_evaluation_round_transaction'
    AND pg_get_function_identity_arguments(p.oid) = 'p_evaluation_id uuid, p_round integer, p_actor_id uuid, p_scores jsonb, p_notes jsonb, p_comment text, p_total_score numeric, p_grade text, p_is_submit boolean, p_submitted_at timestamp with time zone, p_next_round integer, p_next_evaluator_id uuid, p_next_evaluator_role text, p_next_status text, p_is_final boolean';

  IF v_proc_oid IS NULL THEN
    v_proc_oid := to_regprocedure('public.save_evaluation_round_transaction(uuid, integer, uuid, jsonb, jsonb, text, numeric, text, boolean, timestamptz, integer, uuid, text, text, boolean)')::oid;
  END IF;

  IF v_proc_oid IS NOT NULL THEN
    SELECT description INTO v_comment
    FROM pg_description
    WHERE objoid = v_proc_oid AND classoid = 'pg_proc'::regclass AND objsubid = 0;

    RAISE EXCEPTION 'COLLISION: Function public.save_evaluation_round_transaction already exists (comment: "%"). Migration is one-shot; aborting to prevent unowned replacement.', v_comment;
  END IF;
END $$;

CREATE FUNCTION public.save_evaluation_round_transaction(
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
  FROM public.evaluation_rounds
  WHERE evaluation_id = p_evaluation_id
    AND round = p_round
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
      FROM public.evaluation_rounds
      WHERE evaluation_id = p_evaluation_id
        AND round = p_next_round
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
-- 4. SECURITY & PERMISSIONS
-- ------------------------------------------------------------
COMMENT ON FUNCTION public.save_evaluation_round_transaction(
  uuid, integer, uuid, jsonb, jsonb, text, numeric, text, boolean, timestamptz, integer, uuid, text, text, boolean
) IS 'kurabe:p3:candidate:v1:function:save_evaluation_round_transaction';

REVOKE EXECUTE ON FUNCTION public.save_evaluation_round_transaction(
  uuid, integer, uuid, jsonb, jsonb, text, numeric, text, boolean, timestamptz, integer, uuid, text, text, boolean
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.save_evaluation_round_transaction(
  uuid, integer, uuid, jsonb, jsonb, text, numeric, text, boolean, timestamptz, integer, uuid, text, text, boolean
) TO service_role;

COMMIT;
