-- ============================================================
-- ROLLBACK CANDIDATE ONLY — NOT APPLIED
-- KURABE QAQC — Rollback P99M2T01: Personnel History Snapshot Guard
-- DO NOT EXECUTE WITHOUT EXPLICIT APPROVAL AND GUC CONFIRMATION
-- ============================================================
-- Removes only the two P99M2T01 guard triggers and their functions.
-- It never updates, deletes, or rewrites evaluation/personnel data.
-- ============================================================

BEGIN;

DO $$
DECLARE
  v_approved text;
  v_comment text;
BEGIN
  v_approved := current_setting('kurabe.p99m2t01_rollback_approved', true);
  IF v_approved IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'ROLLBACK_UNAPPROVED: Execution aborted. Custom GUC kurabe.p99m2t01_rollback_approved must be set to ''true'' in this session prior to running rollback candidate.';
  END IF;

  IF to_regprocedure('public.guard_evaluation_personnel_snapshot()') IS NULL
     OR to_regprocedure('public.guard_evaluation_round_personnel_snapshot()') IS NULL THEN
    RAISE EXCEPTION 'P99M2T01_ROLLBACK_PREFLIGHT_FAILED: expected guard functions are missing';
  END IF;

  SELECT description INTO v_comment
  FROM pg_description
  WHERE objoid = to_regprocedure('public.guard_evaluation_personnel_snapshot()')::oid
    AND classoid = 'pg_proc'::regclass
    AND objsubid = 0;
  IF v_comment IS DISTINCT FROM 'kurabe:p99m2t01:candidate:v1:function:guard_evaluation_personnel_snapshot' THEN
    RAISE EXCEPTION 'P99M2T01_ROLLBACK_PREFLIGHT_FAILED: evaluation guard provenance mismatch';
  END IF;

  SELECT description INTO v_comment
  FROM pg_description
  WHERE objoid = to_regprocedure('public.guard_evaluation_round_personnel_snapshot()')::oid
    AND classoid = 'pg_proc'::regclass
    AND objsubid = 0;
  IF v_comment IS DISTINCT FROM 'kurabe:p99m2t01:candidate:v1:function:guard_evaluation_round_personnel_snapshot' THEN
    RAISE EXCEPTION 'P99M2T01_ROLLBACK_PREFLIGHT_FAILED: round guard provenance mismatch';
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_guard_evaluation_personnel_snapshot ON public.evaluations;
DROP TRIGGER IF EXISTS trg_guard_evaluation_round_personnel_snapshot ON public.evaluation_rounds;
DROP FUNCTION IF EXISTS public.guard_evaluation_personnel_snapshot();
DROP FUNCTION IF EXISTS public.guard_evaluation_round_personnel_snapshot();

DO $$
BEGIN
  IF to_regprocedure('public.guard_evaluation_personnel_snapshot()') IS NOT NULL
     OR to_regprocedure('public.guard_evaluation_round_personnel_snapshot()') IS NOT NULL
     OR EXISTS (
       SELECT 1 FROM pg_trigger
       WHERE tgname IN (
         'trg_guard_evaluation_personnel_snapshot',
         'trg_guard_evaluation_round_personnel_snapshot'
       )
     ) THEN
    RAISE EXCEPTION 'P99M2T01_ROLLBACK_POSTCONDITION_FAILED: guard objects remain';
  END IF;
END $$;

COMMIT;
