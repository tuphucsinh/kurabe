-- ============================================================
-- CANDIDATE ONLY — NOT APPLIED
-- KURABE QAQC — Migration P99M2T01: Personnel History Snapshot Guard
-- DO NOT APPLY DIRECTLY WITHOUT SEPARATE APPROVAL AND CATALOG VERIFICATION
-- ============================================================
-- Purpose:
--   Protect employee role/team and round evaluator snapshots after a period closes
--   or an evaluation workflow has submitted data. Active draft records remain
--   synchronizable; historical records fail closed before any snapshot mutation.
--
-- Lock order for concurrent close/submit protection:
--   1. evaluation_periods (FOR SHARE)
--   2. evaluations (FOR SHARE, round trigger only)
--   3. target row is already locked by the UPDATE statement
--
-- The guards preserve existing workflow writes whose snapshot columns are unchanged.
-- They do not rewrite business rows and do not retroactively repair history.
-- ============================================================

BEGIN;

DO $$
DECLARE
  v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY['evaluation_periods', 'evaluations', 'evaluation_rounds'] LOOP
    IF to_regclass(format('public.%I', v_table)) IS NULL THEN
      RAISE EXCEPTION 'P99M2T01_PREFLIGHT_MISSING_TABLE: public.% does not exist', v_table;
    END IF;
  END LOOP;

  IF to_regprocedure('public.guard_evaluation_personnel_snapshot()') IS NOT NULL
     OR to_regprocedure('public.guard_evaluation_round_personnel_snapshot()') IS NOT NULL THEN
    RAISE EXCEPTION 'P99M2T01_PREFLIGHT_EXISTING_GUARD: a personnel history guard already exists';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname IN (
      'trg_guard_evaluation_personnel_snapshot',
      'trg_guard_evaluation_round_personnel_snapshot'
    )
  ) THEN
    RAISE EXCEPTION 'P99M2T01_PREFLIGHT_EXISTING_TRIGGER: a personnel history trigger already exists';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.guard_evaluation_personnel_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period_status text;
  v_has_submitted_round boolean;
BEGIN
  -- Evaluation identity is immutable for every workflow state.
  IF NEW.period_id IS DISTINCT FROM OLD.period_id
     OR NEW.employee_id IS DISTINCT FROM OLD.employee_id THEN
    RAISE EXCEPTION 'P99M2T01_IMMUTABLE_EVALUATION_IDENTITY: period_id and employee_id cannot change';
  END IF;

  IF NEW.employee_role IS NOT DISTINCT FROM OLD.employee_role
     AND NEW.team_id IS NOT DISTINCT FROM OLD.team_id THEN
    RETURN NEW;
  END IF;

  -- A share lock serializes this guard with closeEvaluationPeriod's UPDATE.
  SELECT p.status
  INTO v_period_status
  FROM public.evaluation_periods AS p
  WHERE p.id = OLD.period_id
  FOR SHARE;

  IF NOT FOUND OR v_period_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'P99M2T01_HISTORICAL_SNAPSHOT_LOCK: evaluation personnel snapshot is not in an active period';
  END IF;

  IF OLD.status IN ('Submitted', 'Reviewed', 'Approved') THEN
    RAISE EXCEPTION 'P99M2T01_HISTORICAL_SNAPSHOT_LOCK: submitted evaluation personnel snapshot is immutable';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.evaluation_rounds AS r
    WHERE r.evaluation_id = OLD.id
      AND (r.status IN ('Submitted', 'Reviewed', 'Approved') OR r.submitted_at IS NOT NULL)
  )
  INTO v_has_submitted_round;

  IF v_has_submitted_round THEN
    RAISE EXCEPTION 'P99M2T01_HISTORICAL_SNAPSHOT_LOCK: evaluation has a submitted round';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_evaluation_round_personnel_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period_status text;
  v_evaluation_status text;
BEGIN
  IF NEW.evaluator_id IS NOT DISTINCT FROM OLD.evaluator_id
     AND NEW.evaluator_role IS NOT DISTINCT FROM OLD.evaluator_role THEN
    RETURN NEW;
  END IF;

  -- The round row is already locked by UPDATE; acquire parent locks in an
  -- explicit period -> evaluation order before checking state.
  SELECT p.status
  INTO v_period_status
  FROM public.evaluation_periods AS p
  WHERE p.id = (
    SELECT e.period_id FROM public.evaluations AS e WHERE e.id = OLD.evaluation_id
  )
  FOR SHARE;

  SELECT e.status
  INTO v_evaluation_status
  FROM public.evaluations AS e
  WHERE e.id = OLD.evaluation_id
  FOR SHARE;

  IF NOT FOUND OR v_period_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'P99M2T01_HISTORICAL_SNAPSHOT_LOCK: round evaluator snapshot is not in an active period';
  END IF;

  IF v_evaluation_status IN ('Submitted', 'Reviewed', 'Approved')
     OR OLD.status IN ('Submitted', 'Reviewed', 'Approved')
     OR OLD.submitted_at IS NOT NULL THEN
    RAISE EXCEPTION 'P99M2T01_HISTORICAL_SNAPSHOT_LOCK: submitted round evaluator snapshot is immutable';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_guard_evaluation_personnel_snapshot
BEFORE UPDATE OF period_id, employee_id, employee_role, team_id
ON public.evaluations
FOR EACH ROW
EXECUTE FUNCTION public.guard_evaluation_personnel_snapshot();

CREATE TRIGGER trg_guard_evaluation_round_personnel_snapshot
BEFORE UPDATE OF evaluator_id, evaluator_role
ON public.evaluation_rounds
FOR EACH ROW
EXECUTE FUNCTION public.guard_evaluation_round_personnel_snapshot();

COMMENT ON FUNCTION public.guard_evaluation_personnel_snapshot() IS
  'kurabe:p99m2t01:candidate:v1:function:guard_evaluation_personnel_snapshot';
COMMENT ON FUNCTION public.guard_evaluation_round_personnel_snapshot() IS
  'kurabe:p99m2t01:candidate:v1:function:guard_evaluation_round_personnel_snapshot';
COMMENT ON TRIGGER trg_guard_evaluation_personnel_snapshot ON public.evaluations IS
  'kurabe:p99m2t01:candidate:v1:trigger:evaluation_personnel_snapshot';
COMMENT ON TRIGGER trg_guard_evaluation_round_personnel_snapshot ON public.evaluation_rounds IS
  'kurabe:p99m2t01:candidate:v1:trigger:evaluation_round_personnel_snapshot';

REVOKE ALL ON FUNCTION public.guard_evaluation_personnel_snapshot() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_evaluation_round_personnel_snapshot() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.guard_evaluation_personnel_snapshot() TO service_role;
GRANT EXECUTE ON FUNCTION public.guard_evaluation_personnel_snapshot() TO postgres;
GRANT EXECUTE ON FUNCTION public.guard_evaluation_round_personnel_snapshot() TO service_role;
GRANT EXECUTE ON FUNCTION public.guard_evaluation_round_personnel_snapshot() TO postgres;

DO $$
BEGIN
  IF to_regprocedure('public.guard_evaluation_personnel_snapshot()') IS NULL
     OR to_regprocedure('public.guard_evaluation_round_personnel_snapshot()') IS NULL THEN
    RAISE EXCEPTION 'P99M2T01_POSTCONDITION_MISSING_FUNCTION: personnel history guard functions were not created';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_guard_evaluation_personnel_snapshot'
      AND tgrelid = 'public.evaluations'::regclass
      AND NOT tgisinternal
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_guard_evaluation_round_personnel_snapshot'
      AND tgrelid = 'public.evaluation_rounds'::regclass
      AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'P99M2T01_POSTCONDITION_MISSING_TRIGGER: personnel history guard triggers were not created';
  END IF;
END $$;

COMMIT;
