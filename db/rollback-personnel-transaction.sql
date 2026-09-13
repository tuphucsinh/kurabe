BEGIN;

DO $$
DECLARE
  v_comment text;
BEGIN
  IF to_regprocedure('public.apply_personnel_transaction(jsonb,jsonb)') IS NULL
     OR to_regprocedure('public.validate_personnel_graph_trigger()') IS NULL
     OR to_regprocedure('public.resolve_personnel_evaluator(uuid,text,uuid,integer)') IS NULL
     OR to_regclass('public.idx_users_active_leader_team') IS NULL THEN
    RAISE EXCEPTION 'P99M2T02_ROLLBACK_PRECONDITION_FAILED: candidate objects are missing';
  END IF;

  SELECT obj_description(p.oid, 'pg_proc') INTO v_comment
  FROM pg_proc p
  WHERE p.oid = to_regprocedure('public.apply_personnel_transaction(jsonb,jsonb)');
  IF v_comment IS DISTINCT FROM 'kurabe:p99m2t02:candidate:v2:atomic-personnel-team-evaluation-graph-multi-team-leader' THEN
    RAISE EXCEPTION 'P99M2T02_ROLLBACK_PROVENANCE_FAILED: apply RPC marker mismatch';
  END IF;

  IF current_setting('kurabe.p99m2t02_rollback_approved', true) IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'P99M2T02_ROLLBACK_UNAPPROVED: set kurabe.p99m2t02_rollback_approved=true in the approved rollback session';
  END IF;
END $$;

DROP TRIGGER IF EXISTS users_personnel_graph_validate ON public.users;
DROP TRIGGER IF EXISTS teams_personnel_graph_validate ON public.teams;
DROP FUNCTION public.apply_personnel_transaction(jsonb,jsonb);
DROP FUNCTION public.resolve_personnel_evaluator(uuid,text,uuid,integer);
DROP FUNCTION public.validate_personnel_graph_trigger();
DROP INDEX public.idx_users_active_leader_team;

DO $$
BEGIN
  IF to_regprocedure('public.apply_personnel_transaction(jsonb,jsonb)') IS NOT NULL
     OR to_regprocedure('public.validate_personnel_graph_trigger()') IS NOT NULL
     OR to_regprocedure('public.resolve_personnel_evaluator(uuid,text,uuid,integer)') IS NOT NULL
     OR to_regclass('public.idx_users_active_leader_team') IS NOT NULL THEN
    RAISE EXCEPTION 'P99M2T02_ROLLBACK_POSTCONDITION_FAILED: candidate objects remain';
  END IF;
END $$;

COMMIT;
