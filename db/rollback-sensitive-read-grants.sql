-- P99M4T01 rollback: restore the pre-cutover direct period SELECT grants.
-- Pair with application rollback. Never run against production without explicit approval.
BEGIN;

DO $$
DECLARE
  v_comment text;
BEGIN
  IF current_setting('kurabe.p99m4t01_rollback', true) IS DISTINCT FROM 'approved' THEN
    RAISE EXCEPTION 'P99M4T01_ROLLBACK_BLOCKED: set LOCAL kurabe.p99m4t01_rollback=approved';
  END IF;

  IF to_regclass('public.evaluation_periods') IS NULL THEN
    RAISE EXCEPTION 'P99M4T01_ROLLBACK_FAILED: public.evaluation_periods is missing';
  END IF;

  v_comment := obj_description('public.evaluation_periods'::regclass, 'pg_class');
  IF v_comment IS DISTINCT FROM 'kurabe:p99m4t01:sensitive-read-grants:v1' THEN
    RAISE EXCEPTION 'P99M4T01_ROLLBACK_FAILED: forward migration provenance is missing or unexpected';
  END IF;

  IF has_table_privilege('anon', 'public.evaluation_periods', 'SELECT')
     OR has_table_privilege('authenticated', 'public.evaluation_periods', 'SELECT') THEN
    RAISE EXCEPTION 'P99M4T01_ROLLBACK_FAILED: direct period SELECT is already present';
  END IF;
END;
$$;

GRANT SELECT ON TABLE public.evaluation_periods TO anon, authenticated;
COMMENT ON TABLE public.evaluation_periods IS NULL;

COMMIT;
