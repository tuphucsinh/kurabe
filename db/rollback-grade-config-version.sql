BEGIN;

DO $$
DECLARE
  v_comment text;
  v_oid oid;
  v_initial_id uuid;
BEGIN
  IF current_setting('kurabe.p99m3t01_rollback_approved', true) IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'P99M3T01_ROLLBACK_UNAPPROVED: set kurabe.p99m3t01_rollback_approved=true in the approved maintenance session';
  END IF;

  v_oid := to_regprocedure('public.save_grade_config(jsonb,bigint)')::oid;
  IF v_oid IS NULL THEN RAISE EXCEPTION 'P99M3T01_ROLLBACK_PREFLIGHT_FAILED: save function missing'; END IF;
  SELECT description INTO v_comment FROM pg_description WHERE objoid=v_oid AND classoid='pg_proc'::regclass AND objsubid=0;
  IF v_comment IS DISTINCT FROM 'kurabe:p99m3t01:candidate:v1:function:save_grade_config' THEN
    RAISE EXCEPTION 'P99M3T01_ROLLBACK_PREFLIGHT_FAILED: save function provenance mismatch';
  END IF;

  SELECT id INTO v_initial_id FROM public.grade_band_versions WHERE version_no=1;
  IF v_initial_id IS NULL THEN RAISE EXCEPTION 'P99M3T01_ROLLBACK_PREFLIGHT_FAILED: initial version missing'; END IF;
  IF EXISTS (SELECT 1 FROM public.evaluation_rounds WHERE grade_config_version_id IS NOT NULL AND grade_config_version_id <> v_initial_id) THEN
    RAISE EXCEPTION 'P99M3T01_ROLLBACK_BLOCKED: submitted or draft rounds reference a post-baseline grade version';
  END IF;
END $$;

DROP TRIGGER IF EXISTS evaluation_rounds_pin_grade_config_version ON public.evaluation_rounds;
DROP FUNCTION public.pin_grade_config_version();
DROP FUNCTION public.save_grade_config(jsonb, bigint);
DROP FUNCTION public.get_active_grade_config();
DROP FUNCTION public.validate_grade_config(jsonb);

ALTER TABLE public.evaluation_rounds DROP CONSTRAINT evaluation_rounds_grade_config_version_id_fkey;
ALTER TABLE public.grade_bands DROP CONSTRAINT grade_bands_version_role_grade_key;
ALTER TABLE public.grade_bands DROP CONSTRAINT grade_bands_version_id_fkey;
DELETE FROM public.grade_bands WHERE version_id <> (SELECT id FROM public.grade_band_versions WHERE version_no=1);
DELETE FROM public.grade_band_versions WHERE version_no <> 1;
ALTER TABLE public.evaluation_rounds DROP COLUMN grade_config_version_id;
ALTER TABLE public.grade_bands DROP COLUMN version_id;
ALTER TABLE public.grade_bands ADD CONSTRAINT grade_bands_role_group_grade_key UNIQUE (role_group, grade);
DROP INDEX public.grade_band_versions_one_active;
DROP TABLE public.grade_band_versions;

COMMIT;
