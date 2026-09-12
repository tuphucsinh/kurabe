-- ============================================================
-- CANDIDATE ONLY — NOT APPLIED
-- Rollback for P102M3T04: Evaluation Transition Guard & Version Pinning
-- Candidate/disposable only; never run on production without
-- explicit approval and a separately verified rollback gate.
-- ============================================================

BEGIN;

DO $$
BEGIN
  IF current_setting('kurabe.p102m3t04_rollback_approved', true) IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'P102M3T04_ROLLBACK_UNAPPROVED: explicit rollback approval is required (kurabe.p102m3t04_rollback_approved)';
  END IF;
END $$;

DO $$
DECLARE
  v_comment text;
BEGIN
  IF to_regprocedure('public.guard_evaluation_transitions()') IS NULL
     OR to_regprocedure('public.guard_evaluation_round_mutations()') IS NULL
     OR to_regprocedure('public.return_evaluation_round_transaction(uuid,integer,uuid,text)') IS NULL
     OR to_regprocedure('public.save_evaluation_round_transaction_active_only(uuid,integer,uuid,jsonb,jsonb,text,numeric,text,boolean,timestamptz,integer,uuid,text,text,boolean,uuid,uuid)') IS NULL
     OR to_regclass('public.evaluation_transition_context') IS NULL THEN
    RAISE EXCEPTION 'P102M3T04_ROLLBACK_BLOCKED: candidate object is missing';
  END IF;
  SELECT obj_description(t.oid, 'pg_trigger') INTO v_comment FROM pg_trigger t
  WHERE t.tgrelid = 'public.evaluations'::regclass AND t.tgname = 'guard_evaluation_transitions' AND NOT t.tgisinternal;
  IF v_comment IS DISTINCT FROM 'kurabe:p102m3t04:candidate:v1:trigger:guard_evaluation_transitions' THEN
    RAISE EXCEPTION 'P102M3T04_ROLLBACK_BLOCKED: evaluation trigger provenance mismatch: %', v_comment;
  END IF;
  SELECT obj_description(t.oid, 'pg_trigger') INTO v_comment FROM pg_trigger t
  WHERE t.tgrelid = 'public.evaluation_rounds'::regclass AND t.tgname = 'guard_evaluation_round_mutations' AND NOT t.tgisinternal;
  IF v_comment IS DISTINCT FROM 'kurabe:p102m3t04:candidate:v1:trigger:guard_evaluation_round_mutations' THEN
    RAISE EXCEPTION 'P102M3T04_ROLLBACK_BLOCKED: round trigger provenance mismatch: %', v_comment;
  END IF;
END $$;

DO $$
DECLARE
  v_comment text;
BEGIN
  -- Verify provenance before dropping objects
  IF to_regprocedure('public.guard_evaluation_transitions()') IS NOT NULL THEN
    SELECT description INTO v_comment
    FROM pg_description
    WHERE objoid = 'public.guard_evaluation_transitions()'::regprocedure
      AND classoid = 'pg_proc'::regclass AND objsubid = 0;

    IF v_comment IS DISTINCT FROM 'kurabe:p102m3t04:candidate:v1:function:guard_evaluation_transitions' THEN
      RAISE EXCEPTION 'P102M3T04_ROLLBACK_BLOCKED: guard_evaluation_transitions provenance mismatch: %', v_comment;
    END IF;
  END IF;

  IF to_regprocedure('public.return_evaluation_round_transaction(uuid,integer,uuid,text)') IS NOT NULL THEN
    SELECT description INTO v_comment
    FROM pg_description
    WHERE objoid = 'public.return_evaluation_round_transaction(uuid,integer,uuid,text)'::regprocedure
      AND classoid = 'pg_proc'::regclass AND objsubid = 0;

    IF v_comment IS DISTINCT FROM 'kurabe:p102m3t04:candidate:v1:function:return_evaluation_round_transaction' THEN
      RAISE EXCEPTION 'P102M3T04_ROLLBACK_BLOCKED: return_evaluation_round_transaction provenance mismatch: %', v_comment;
    END IF;
  END IF;
END $$;

DO $$
DECLARE
  v_comment text;
BEGIN
  SELECT obj_description(t.oid, 'pg_trigger') INTO v_comment
  FROM pg_trigger t
  WHERE t.tgrelid = 'public.evaluations'::regclass
    AND t.tgname = 'guard_evaluation_transitions'
    AND NOT t.tgisinternal;

  IF v_comment IS NOT NULL
     AND v_comment IS DISTINCT FROM 'kurabe:p102m3t04:candidate:v1:trigger:guard_evaluation_transitions' THEN
    RAISE EXCEPTION 'P102M3T04_ROLLBACK_BLOCKED: guard_evaluation_transitions trigger provenance mismatch: %', v_comment;
  END IF;
END $$;

DO $$
DECLARE
  v_comment text;
BEGIN
  IF to_regprocedure('public.guard_evaluation_round_mutations()') IS NOT NULL THEN
    SELECT obj_description('public.guard_evaluation_round_mutations()'::regprocedure::oid, 'pg_proc') INTO v_comment;
    IF v_comment IS DISTINCT FROM 'kurabe:p102m3t04:candidate:v1:function:guard_evaluation_round_mutations' THEN
      RAISE EXCEPTION 'P102M3T04_ROLLBACK_BLOCKED: guard_evaluation_round_mutations provenance mismatch: %', v_comment;
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
      RAISE EXCEPTION 'P102M3T04_ROLLBACK_BLOCKED: evaluation_transition_context provenance mismatch: %', v_comment;
    END IF;
  END IF;
END $$;

DO $$
DECLARE
  v_comment text;
BEGIN
  IF to_regprocedure('public.save_evaluation_round_transaction_active_only(uuid, integer, uuid, jsonb, jsonb, text, numeric, text, boolean, timestamptz, integer, uuid, text, text, boolean, uuid, uuid)') IS NOT NULL THEN
    SELECT obj_description('public.save_evaluation_round_transaction_active_only(uuid, integer, uuid, jsonb, jsonb, text, numeric, text, boolean, timestamptz, integer, uuid, text, text, boolean, uuid, uuid)'::regprocedure, 'pg_proc') INTO v_comment;
    IF v_comment IS DISTINCT FROM 'kurabe:p102m3t04:candidate:v1:function:save_evaluation_round_transaction_active_only' THEN
      RAISE EXCEPTION 'P102M3T04_ROLLBACK_BLOCKED: save transaction function provenance mismatch: %', v_comment;
    END IF;
  END IF;
END $$;

-- Drop trigger on evaluations
DROP TRIGGER IF EXISTS guard_evaluation_transitions ON public.evaluations;
DROP TRIGGER IF EXISTS guard_evaluation_round_mutations ON public.evaluation_rounds;

-- Drop newly introduced functions
DROP FUNCTION IF EXISTS public.guard_evaluation_transitions();
DROP FUNCTION IF EXISTS public.guard_evaluation_round_mutations();
DROP FUNCTION IF EXISTS public.return_evaluation_round_transaction(uuid, integer, uuid, text);
DROP FUNCTION IF EXISTS public.save_evaluation_round_transaction_active_only(uuid, integer, uuid, jsonb, jsonb, text, numeric, text, boolean, timestamptz, integer, uuid, text, text, boolean, uuid, uuid);
DROP TABLE IF EXISTS public.evaluation_transition_context;

GRANT EXECUTE ON FUNCTION public.save_evaluation_round_transaction(uuid, integer, uuid, jsonb, jsonb, text, numeric, text, boolean, timestamptz, integer, uuid, text, text, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.save_evaluation_round_transaction_active_only(uuid, integer, uuid, jsonb, jsonb, text, numeric, text, boolean, timestamptz, integer, uuid, text, text, boolean) TO service_role;

COMMIT;
