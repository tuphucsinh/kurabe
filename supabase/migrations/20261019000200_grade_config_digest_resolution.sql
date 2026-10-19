-- Migration: 20261019000200_grade_config_digest_resolution.sql
-- P108M1T11: Dynamic pgcrypto schema resolution and search_path hardening for save_grade_config.
BEGIN;

CREATE OR REPLACE FUNCTION public.save_grade_config(
  p_bands jsonb,
  p_expected_version bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $function$
DECLARE
  v_current public.grade_band_versions%ROWTYPE;
  v_new public.grade_band_versions%ROWTYPE;
  v_row record;
  v_checksum text;
  v_count integer;
  v_pgcrypto_schema text;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('kurabe:p99m3t01:grade-config'));

  SELECT * INTO v_current
  FROM public.grade_band_versions
  WHERE is_active
  ORDER BY version_no DESC
  LIMIT 1
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'P99M3T01_CONFIG_UNAVAILABLE: no active grade configuration';
  END IF;
  IF p_expected_version IS NULL OR p_expected_version <> v_current.version_no THEN
    RAISE EXCEPTION 'P99M3T01_CONFIG_STALE: expected version %, current version %', p_expected_version, v_current.version_no;
  END IF;

  PERFORM public.validate_grade_config(p_bands);

  SELECT n.nspname
  INTO v_pgcrypto_schema
  FROM pg_catalog.pg_extension e
  JOIN pg_catalog.pg_namespace n ON n.oid = e.extnamespace
  WHERE e.extname = 'pgcrypto';

  IF NOT FOUND OR v_pgcrypto_schema IS NULL THEN
    RAISE EXCEPTION 'P99M3T01_CONFIG_UNAVAILABLE: pgcrypto extension is not installed';
  END IF;

  EXECUTE format('SELECT pg_catalog.encode(%I.digest($1::text, $2::text), ''hex'')', v_pgcrypto_schema)
  INTO v_checksum
  USING p_bands::text, 'sha256';

  INSERT INTO public.grade_band_versions (version_no, checksum, is_active)
  VALUES (v_current.version_no + 1, v_checksum, false)
  RETURNING * INTO v_new;

  UPDATE public.grade_band_versions SET is_active = false WHERE id = v_current.id;

  FOR v_row IN
    SELECT * FROM pg_catalog.jsonb_to_recordset(p_bands) AS x(
      role_group text,
      grade text,
      min_score integer,
      max_score integer,
      sort_order integer
    )
  LOOP
    INSERT INTO public.grade_bands (version_id, role_group, grade, min_score, max_score, sort_order)
    VALUES (v_new.id, v_row.role_group, v_row.grade, v_row.min_score, v_row.max_score, v_row.sort_order);
  END LOOP;

  SELECT count(*) INTO v_count FROM public.grade_bands WHERE version_id = v_new.id;
  IF v_count <> 18 THEN
    RAISE EXCEPTION 'P99M3T01_CONFIG_WRITE_FAILED: expected 18 inserted rows, found %', v_count;
  END IF;

  UPDATE public.grade_band_versions SET is_active = true WHERE id = v_new.id;

  RETURN pg_catalog.jsonb_build_object(
    'version', v_new.version_no,
    'version_id', v_new.id,
    'checksum', v_new.checksum,
    'bands', (
      SELECT pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object('role_group', role_group, 'grade', grade, 'min_score', min_score, 'max_score', max_score, 'sort_order', sort_order)
        ORDER BY role_group, sort_order
      ) FROM public.grade_bands WHERE version_id = v_new.id
    )
  );
END;
$function$;

COMMIT;
