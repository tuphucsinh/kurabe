-- ============================================================
-- ROLLBACK CANDIDATE ONLY — NOT APPLIED
-- Kurabe DB Transaction Rollback Candidate: Evaluation Round Transaction
-- DO NOT EXECUTE DIRECTLY WITHOUT EXPLICIT APPROVAL AND GUC CONFIRMATION
--
-- CRITICAL OPERATIONAL CONSTRAINTS:
-- 1. Application Flag Requirement:
--    The environment variable KURABE_ENABLE_TRANSACTIONAL_EVALUATION_RPC
--    MUST be set to 'false' (or removed) in all application runtimes BEFORE
--    executing this rollback. Applications will seamlessly use the verified
--    multi-step client fallback path in src/actions/evaluation.ts.
-- 2. Data Preservation & Row Non-Restoration:
--    This script ONLY drops schema constraints, indexes, and the RPC function.
--    It DOES NOT restore, modify, delete, or truncate business data rows
--    in public.evaluations or public.evaluation_rounds.
-- 3. External Session Approval Guard:
--    Execution requires setting the custom PostgreSQL configuration setting:
--      SET kurabe.p3_rollback_approved = 'true';
--    in the active administrative session before running this script.
--    This script deliberately does NOT set this parameter internally.
-- 4. Provenance Verification:
--    Every object is inspected in pg_description prior to dropping.
--    If an object exists with an absent or mismatched provenance marker,
--    the script fails closed with RAISE EXCEPTION to prevent dropping
--    unowned or pre-existing database objects.
-- ============================================================

BEGIN;

DO $$
DECLARE
  v_approved text;
  v_con_oid oid;
  v_idx_oid oid;
  v_proc_oid oid;
  v_comment text;
BEGIN
  -- ------------------------------------------------------------
  -- 1. APPROVAL GUARD (Fail closed if GUC is not explicitly 'true')
  -- ------------------------------------------------------------
  v_approved := current_setting('kurabe.p3_rollback_approved', true);
  IF v_approved IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'ROLLBACK_UNAPPROVED: Execution aborted. Custom GUC kurabe.p3_rollback_approved must be set to ''true'' in this session prior to running rollback candidate.';
  END IF;

  -- ------------------------------------------------------------
  -- 2. DROP RPC FUNCTION (public.save_evaluation_round_transaction)
  -- ------------------------------------------------------------
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

    IF v_comment IS DISTINCT FROM 'kurabe:p3:candidate:v1:function:save_evaluation_round_transaction' THEN
      RAISE EXCEPTION 'PROVENANCE_MISMATCH: Function public.save_evaluation_round_transaction exists but comment "%" does not match expected marker "kurabe:p3:candidate:v1:function:save_evaluation_round_transaction". Aborting.', v_comment;
    END IF;

    EXECUTE 'DROP FUNCTION public.save_evaluation_round_transaction(uuid, integer, uuid, jsonb, jsonb, text, numeric, text, boolean, timestamptz, integer, uuid, text, text, boolean)';
    RAISE NOTICE 'DROPPED: Function public.save_evaluation_round_transaction';
  ELSE
    RAISE NOTICE 'SKIPPED: Function public.save_evaluation_round_transaction not found (already absent)';
  END IF;

  -- ------------------------------------------------------------
  -- 3. DROP EXPLICIT INDEXES
  -- ------------------------------------------------------------

  -- 3.1 public.idx_evaluations_period_employee
  SELECT c.oid INTO v_idx_oid
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'idx_evaluations_period_employee' AND c.relkind = 'i';

  IF v_idx_oid IS NOT NULL THEN
    SELECT description INTO v_comment
    FROM pg_description
    WHERE objoid = v_idx_oid AND classoid = 'pg_class'::regclass AND objsubid = 0;

    IF v_comment IS DISTINCT FROM 'kurabe:p3:candidate:v1:index:idx_evaluations_period_employee' THEN
      RAISE EXCEPTION 'PROVENANCE_MISMATCH: Index public.idx_evaluations_period_employee exists but comment "%" does not match expected marker "kurabe:p3:candidate:v1:index:idx_evaluations_period_employee". Aborting.', v_comment;
    END IF;

    EXECUTE 'DROP INDEX public.idx_evaluations_period_employee';
    RAISE NOTICE 'DROPPED: Index public.idx_evaluations_period_employee';
  ELSE
    RAISE NOTICE 'SKIPPED: Index public.idx_evaluations_period_employee not found (already absent)';
  END IF;

  -- 3.2 public.idx_evaluation_rounds_eval_round
  SELECT c.oid INTO v_idx_oid
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'idx_evaluation_rounds_eval_round' AND c.relkind = 'i';

  IF v_idx_oid IS NOT NULL THEN
    SELECT description INTO v_comment
    FROM pg_description
    WHERE objoid = v_idx_oid AND classoid = 'pg_class'::regclass AND objsubid = 0;

    IF v_comment IS DISTINCT FROM 'kurabe:p3:candidate:v1:index:idx_evaluation_rounds_eval_round' THEN
      RAISE EXCEPTION 'PROVENANCE_MISMATCH: Index public.idx_evaluation_rounds_eval_round exists but comment "%" does not match expected marker "kurabe:p3:candidate:v1:index:idx_evaluation_rounds_eval_round". Aborting.', v_comment;
    END IF;

    EXECUTE 'DROP INDEX public.idx_evaluation_rounds_eval_round';
    RAISE NOTICE 'DROPPED: Index public.idx_evaluation_rounds_eval_round';
  ELSE
    RAISE NOTICE 'SKIPPED: Index public.idx_evaluation_rounds_eval_round not found (already absent)';
  END IF;

  -- ------------------------------------------------------------
  -- 4. DROP SCHEMA CONSTRAINTS
  -- ------------------------------------------------------------

  -- 4.1 uq_evaluations_period_employee on public.evaluations
  SELECT oid INTO v_con_oid
  FROM pg_constraint
  WHERE conname = 'uq_evaluations_period_employee'
    AND conrelid = to_regclass('public.evaluations');

  IF v_con_oid IS NOT NULL THEN
    SELECT description INTO v_comment
    FROM pg_description
    WHERE objoid = v_con_oid AND classoid = 'pg_constraint'::regclass AND objsubid = 0;

    IF v_comment IS DISTINCT FROM 'kurabe:p3:candidate:v1:constraint:uq_evaluations_period_employee' THEN
      RAISE EXCEPTION 'PROVENANCE_MISMATCH: Constraint uq_evaluations_period_employee on public.evaluations exists but comment "%" does not match expected marker "kurabe:p3:candidate:v1:constraint:uq_evaluations_period_employee". Aborting.', v_comment;
    END IF;

    EXECUTE 'ALTER TABLE public.evaluations DROP CONSTRAINT uq_evaluations_period_employee';
    RAISE NOTICE 'DROPPED: Constraint uq_evaluations_period_employee on public.evaluations';
  ELSE
    RAISE NOTICE 'SKIPPED: Constraint uq_evaluations_period_employee not found (already absent)';
  END IF;

  -- 4.2 uq_evaluation_rounds_eval_round on public.evaluation_rounds
  SELECT oid INTO v_con_oid
  FROM pg_constraint
  WHERE conname = 'uq_evaluation_rounds_eval_round'
    AND conrelid = to_regclass('public.evaluation_rounds');

  IF v_con_oid IS NOT NULL THEN
    SELECT description INTO v_comment
    FROM pg_description
    WHERE objoid = v_con_oid AND classoid = 'pg_constraint'::regclass AND objsubid = 0;

    IF v_comment IS DISTINCT FROM 'kurabe:p3:candidate:v1:constraint:uq_evaluation_rounds_eval_round' THEN
      RAISE EXCEPTION 'PROVENANCE_MISMATCH: Constraint uq_evaluation_rounds_eval_round on public.evaluation_rounds exists but comment "%" does not match expected marker "kurabe:p3:candidate:v1:constraint:uq_evaluation_rounds_eval_round". Aborting.', v_comment;
    END IF;

    EXECUTE 'ALTER TABLE public.evaluation_rounds DROP CONSTRAINT uq_evaluation_rounds_eval_round';
    RAISE NOTICE 'DROPPED: Constraint uq_evaluation_rounds_eval_round on public.evaluation_rounds';
  ELSE
    RAISE NOTICE 'SKIPPED: Constraint uq_evaluation_rounds_eval_round not found (already absent)';
  END IF;

  -- 4.3 chk_evaluation_rounds_round_range on public.evaluation_rounds
  SELECT oid INTO v_con_oid
  FROM pg_constraint
  WHERE conname = 'chk_evaluation_rounds_round_range'
    AND conrelid = to_regclass('public.evaluation_rounds');

  IF v_con_oid IS NOT NULL THEN
    SELECT description INTO v_comment
    FROM pg_description
    WHERE objoid = v_con_oid AND classoid = 'pg_constraint'::regclass AND objsubid = 0;

    IF v_comment IS DISTINCT FROM 'kurabe:p3:candidate:v1:constraint:chk_evaluation_rounds_round_range' THEN
      RAISE EXCEPTION 'PROVENANCE_MISMATCH: Constraint chk_evaluation_rounds_round_range on public.evaluation_rounds exists but comment "%" does not match expected marker "kurabe:p3:candidate:v1:constraint:chk_evaluation_rounds_round_range". Aborting.', v_comment;
    END IF;

    EXECUTE 'ALTER TABLE public.evaluation_rounds DROP CONSTRAINT chk_evaluation_rounds_round_range';
    RAISE NOTICE 'DROPPED: Constraint chk_evaluation_rounds_round_range on public.evaluation_rounds';
  ELSE
    RAISE NOTICE 'SKIPPED: Constraint chk_evaluation_rounds_round_range not found (already absent)';
  END IF;

  -- 4.4 chk_evaluations_current_round_range on public.evaluations
  SELECT oid INTO v_con_oid
  FROM pg_constraint
  WHERE conname = 'chk_evaluations_current_round_range'
    AND conrelid = to_regclass('public.evaluations');

  IF v_con_oid IS NOT NULL THEN
    SELECT description INTO v_comment
    FROM pg_description
    WHERE objoid = v_con_oid AND classoid = 'pg_constraint'::regclass AND objsubid = 0;

    IF v_comment IS DISTINCT FROM 'kurabe:p3:candidate:v1:constraint:chk_evaluations_current_round_range' THEN
      RAISE EXCEPTION 'PROVENANCE_MISMATCH: Constraint chk_evaluations_current_round_range on public.evaluations exists but comment "%" does not match expected marker "kurabe:p3:candidate:v1:constraint:chk_evaluations_current_round_range". Aborting.', v_comment;
    END IF;

    EXECUTE 'ALTER TABLE public.evaluations DROP CONSTRAINT chk_evaluations_current_round_range';
    RAISE NOTICE 'DROPPED: Constraint chk_evaluations_current_round_range on public.evaluations';
  ELSE
    RAISE NOTICE 'SKIPPED: Constraint chk_evaluations_current_round_range not found (already absent)';
  END IF;

  -- 4.5 chk_evaluations_status_valid on public.evaluations
  SELECT oid INTO v_con_oid
  FROM pg_constraint
  WHERE conname = 'chk_evaluations_status_valid'
    AND conrelid = to_regclass('public.evaluations');

  IF v_con_oid IS NOT NULL THEN
    SELECT description INTO v_comment
    FROM pg_description
    WHERE objoid = v_con_oid AND classoid = 'pg_constraint'::regclass AND objsubid = 0;

    IF v_comment IS DISTINCT FROM 'kurabe:p3:candidate:v1:constraint:chk_evaluations_status_valid' THEN
      RAISE EXCEPTION 'PROVENANCE_MISMATCH: Constraint chk_evaluations_status_valid on public.evaluations exists but comment "%" does not match expected marker "kurabe:p3:candidate:v1:constraint:chk_evaluations_status_valid". Aborting.', v_comment;
    END IF;

    EXECUTE 'ALTER TABLE public.evaluations DROP CONSTRAINT chk_evaluations_status_valid';
    RAISE NOTICE 'DROPPED: Constraint chk_evaluations_status_valid on public.evaluations';
  ELSE
    RAISE NOTICE 'SKIPPED: Constraint chk_evaluations_status_valid not found (already absent)';
  END IF;

  -- 4.6 chk_evaluation_rounds_status_valid on public.evaluation_rounds
  SELECT oid INTO v_con_oid
  FROM pg_constraint
  WHERE conname = 'chk_evaluation_rounds_status_valid'
    AND conrelid = to_regclass('public.evaluation_rounds');

  IF v_con_oid IS NOT NULL THEN
    SELECT description INTO v_comment
    FROM pg_description
    WHERE objoid = v_con_oid AND classoid = 'pg_constraint'::regclass AND objsubid = 0;

    IF v_comment IS DISTINCT FROM 'kurabe:p3:candidate:v1:constraint:chk_evaluation_rounds_status_valid' THEN
      RAISE EXCEPTION 'PROVENANCE_MISMATCH: Constraint chk_evaluation_rounds_status_valid on public.evaluation_rounds exists but comment "%" does not match expected marker "kurabe:p3:candidate:v1:constraint:chk_evaluation_rounds_status_valid". Aborting.', v_comment;
    END IF;

    EXECUTE 'ALTER TABLE public.evaluation_rounds DROP CONSTRAINT chk_evaluation_rounds_status_valid';
    RAISE NOTICE 'DROPPED: Constraint chk_evaluation_rounds_status_valid on public.evaluation_rounds';
  ELSE
    RAISE NOTICE 'SKIPPED: Constraint chk_evaluation_rounds_status_valid not found (already absent)';
  END IF;

  -- 4.7 chk_evaluation_rounds_total_score_non_negative on public.evaluation_rounds
  SELECT oid INTO v_con_oid
  FROM pg_constraint
  WHERE conname = 'chk_evaluation_rounds_total_score_non_negative'
    AND conrelid = to_regclass('public.evaluation_rounds');

  IF v_con_oid IS NOT NULL THEN
    SELECT description INTO v_comment
    FROM pg_description
    WHERE objoid = v_con_oid AND classoid = 'pg_constraint'::regclass AND objsubid = 0;

    IF v_comment IS DISTINCT FROM 'kurabe:p3:candidate:v1:constraint:chk_evaluation_rounds_total_score_non_negative' THEN
      RAISE EXCEPTION 'PROVENANCE_MISMATCH: Constraint chk_evaluation_rounds_total_score_non_negative on public.evaluation_rounds exists but comment "%" does not match expected marker "kurabe:p3:candidate:v1:constraint:chk_evaluation_rounds_total_score_non_negative". Aborting.', v_comment;
    END IF;

    EXECUTE 'ALTER TABLE public.evaluation_rounds DROP CONSTRAINT chk_evaluation_rounds_total_score_non_negative';
    RAISE NOTICE 'DROPPED: Constraint chk_evaluation_rounds_total_score_non_negative on public.evaluation_rounds';
  ELSE
    RAISE NOTICE 'SKIPPED: Constraint chk_evaluation_rounds_total_score_non_negative not found (already absent)';
  END IF;

  -- 4.8 chk_evaluations_final_score_non_negative on public.evaluations
  SELECT oid INTO v_con_oid
  FROM pg_constraint
  WHERE conname = 'chk_evaluations_final_score_non_negative'
    AND conrelid = to_regclass('public.evaluations');

  IF v_con_oid IS NOT NULL THEN
    SELECT description INTO v_comment
    FROM pg_description
    WHERE objoid = v_con_oid AND classoid = 'pg_constraint'::regclass AND objsubid = 0;

    IF v_comment IS DISTINCT FROM 'kurabe:p3:candidate:v1:constraint:chk_evaluations_final_score_non_negative' THEN
      RAISE EXCEPTION 'PROVENANCE_MISMATCH: Constraint chk_evaluations_final_score_non_negative on public.evaluations exists but comment "%" does not match expected marker "kurabe:p3:candidate:v1:constraint:chk_evaluations_final_score_non_negative". Aborting.', v_comment;
    END IF;

    EXECUTE 'ALTER TABLE public.evaluations DROP CONSTRAINT chk_evaluations_final_score_non_negative';
    RAISE NOTICE 'DROPPED: Constraint chk_evaluations_final_score_non_negative on public.evaluations';
  ELSE
    RAISE NOTICE 'SKIPPED: Constraint chk_evaluations_final_score_non_negative not found (already absent)';
  END IF;

END $$;

COMMIT;
