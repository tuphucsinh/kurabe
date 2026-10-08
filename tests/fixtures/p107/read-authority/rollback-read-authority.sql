-- P107M1T03 rollback: restore the captured pre-migration selective EXECUTE grants for the
-- transactional evaluation writer (16- and 17-argument overloads) and the active config readers.
-- Pair with application rollback. Never run against production without explicit approval.
-- This restores the SPECIFIC captured grants; it is not a blanket GRANT ALL.
BEGIN;

DO $$
DECLARE
  v_comment text;
BEGIN
  IF current_setting('kurabe.p107m1t03_rollback', true) IS DISTINCT FROM 'approved' THEN
    RAISE EXCEPTION 'P107M1T03_ROLLBACK_BLOCKED: set LOCAL kurabe.p107m1t03_rollback=approved';
  END IF;

  IF to_regprocedure('public.save_evaluation_round_transaction_active_only(uuid,integer,uuid,jsonb,jsonb,text,numeric,text,boolean,timestamptz,integer,uuid,text,text,boolean,uuid,uuid)') IS NULL THEN
    RAISE EXCEPTION 'P107M1T03_ROLLBACK_FAILED: 17-argument writer function is missing';
  END IF;
  IF to_regprocedure('public.get_active_criteria_config()') IS NULL
     OR to_regprocedure('public.get_active_grade_config()') IS NULL THEN
    RAISE EXCEPTION 'P107M1T03_ROLLBACK_FAILED: active config reader is missing';
  END IF;

  SELECT description INTO v_comment
  FROM pg_description
  WHERE objoid = to_regprocedure('public.save_evaluation_round_transaction_active_only(uuid,integer,uuid,jsonb,jsonb,text,numeric,text,boolean,timestamptz,integer,uuid,text,text,boolean,uuid,uuid)')::oid
    AND classoid = 'pg_proc'::regclass
    AND objsubid = 0;

  IF v_comment IS DISTINCT FROM 'kurabe:p107m1t03:candidate:v1:function:save_evaluation_round_transaction_active_only' THEN
    RAISE EXCEPTION 'P107M1T03_ROLLBACK_FAILED: forward migration provenance is missing or unexpected';
  END IF;
END $$;

-- 1. Active config readers: the captured pre-migration state granted EXECUTE to
--    anon, authenticated, service_role and postgres (PUBLIC itself held none). Restore exactly that.
REVOKE EXECUTE ON FUNCTION public.get_active_criteria_config() FROM PUBLIC, anon, authenticated, service_role, postgres;
GRANT EXECUTE ON FUNCTION public.get_active_criteria_config() TO anon, authenticated, service_role, postgres;

REVOKE EXECUTE ON FUNCTION public.get_active_grade_config() FROM PUBLIC, anon, authenticated, service_role, postgres;
GRANT EXECUTE ON FUNCTION public.get_active_grade_config() TO anon, authenticated, service_role, postgres;

-- 2. The 17-argument transactional writer keeps its captured service_role/postgres EXECUTE only.
REVOKE EXECUTE ON FUNCTION public.save_evaluation_round_transaction_active_only(
  uuid, integer, uuid, jsonb, jsonb, text, numeric, text, boolean, timestamptz, integer, uuid, text, text, boolean, uuid, uuid
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_evaluation_round_transaction_active_only(
  uuid, integer, uuid, jsonb, jsonb, text, numeric, text, boolean, timestamptz, integer, uuid, text, text, boolean, uuid, uuid
) TO service_role, postgres;

-- 3. The legacy 16-argument overload regains its captured latent service_role/postgres EXECUTE.
REVOKE ALL ON FUNCTION public.save_evaluation_round_transaction_active_only(
  uuid, integer, uuid, jsonb, jsonb, text, numeric, text, boolean, timestamptz, integer, uuid, text, text, boolean, uuid
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_evaluation_round_transaction_active_only(
  uuid, integer, uuid, jsonb, jsonb, text, numeric, text, boolean, timestamptz, integer, uuid, text, text, boolean, uuid
) TO service_role, postgres;

COMMIT;
