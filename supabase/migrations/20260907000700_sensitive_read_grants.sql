-- P99M4T01: remove direct period-table reads from browser roles after server-reader cutover.
-- Candidate only: production apply requires a separately approved rollout and readback.
BEGIN;

DO $$
DECLARE
  v_comment text;
BEGIN
  IF to_regclass('public.evaluation_periods') IS NULL THEN
    RAISE EXCEPTION 'P99M4T01_PREFLIGHT_FAILED: public.evaluation_periods is missing';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
     OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    RAISE EXCEPTION 'P99M4T01_PREFLIGHT_FAILED: Supabase-compatible roles are missing';
  END IF;

  IF NOT has_table_privilege('anon', 'public.evaluation_periods', 'SELECT')
     OR NOT has_table_privilege('authenticated', 'public.evaluation_periods', 'SELECT') THEN
    RAISE EXCEPTION 'P99M4T01_PREFLIGHT_FAILED: expected direct period SELECT grants are absent';
  END IF;

  v_comment := obj_description('public.evaluation_periods'::regclass, 'pg_class');
  IF v_comment IS NOT NULL
     AND v_comment <> 'kurabe:p99m4t01:sensitive-read-grants:v1' THEN
    RAISE EXCEPTION 'P99M4T01_PREFLIGHT_FAILED: unexpected evaluation_periods provenance comment: %', v_comment;
  END IF;
END;
$$;

REVOKE SELECT ON TABLE public.evaluation_periods FROM anon, authenticated;
COMMENT ON TABLE public.evaluation_periods IS 'kurabe:p99m4t01:sensitive-read-grants:v1';

COMMIT;
