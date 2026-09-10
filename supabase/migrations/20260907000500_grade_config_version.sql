BEGIN;

-- P99M3T01: retain every valid grade configuration as an immutable version.
-- The active pointer and all 18 rows switch in one transaction; historical
-- evaluation rounds pin the version used for their submitted grade.
DO $$
DECLARE
  v_count integer;
BEGIN
  IF to_regclass('public.grade_bands') IS NULL
     OR to_regclass('public.evaluation_rounds') IS NULL THEN
    RAISE EXCEPTION 'P99M3T01_PREFLIGHT_FAILED: required grade/evaluation tables are missing';
  END IF;

  SELECT count(*) INTO v_count FROM public.grade_bands;
  IF v_count <> 18 THEN
    RAISE EXCEPTION 'P99M3T01_PREFLIGHT_FAILED: expected 18 current grade bands, found %', v_count;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.grade_bands
    WHERE role_group NOT IN ('leader', 'staff', 'worker')
       OR grade NOT IN ('S', 'A', 'AB', 'B', 'C', 'D')
       OR min_score IS NOT NULL AND min_score < -1000000
       OR max_score IS NOT NULL AND max_score > 1000000
       OR min_score IS NOT NULL AND max_score IS NOT NULL AND min_score > max_score
  ) THEN
    RAISE EXCEPTION 'P99M3T01_PREFLIGHT_FAILED: current grade bands contain invalid role, grade, range, or score domain';
  END IF;

  IF EXISTS (
    SELECT role_group FROM public.grade_bands
    GROUP BY role_group HAVING count(*) <> 6
  ) OR EXISTS (
    SELECT role_group FROM (VALUES ('leader'), ('staff'), ('worker')) AS expected(role_group)
    WHERE NOT EXISTS (SELECT 1 FROM public.grade_bands g WHERE g.role_group = expected.role_group)
  ) THEN
    RAISE EXCEPTION 'P99M3T01_PREFLIGHT_FAILED: every role group must contain exactly six bands';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.grade_bands
    WHERE (grade = 'S' AND max_score IS NOT NULL)
       OR (grade = 'D' AND min_score IS NOT NULL)
       OR (grade NOT IN ('S', 'D') AND (min_score IS NULL OR max_score IS NULL))
  ) THEN
    RAISE EXCEPTION 'P99M3T01_PREFLIGHT_FAILED: only S.max_score and D.min_score may be NULL';
  END IF;
END $$;

CREATE TABLE public.grade_band_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_no bigint NOT NULL UNIQUE,
  checksum text NOT NULL,
  is_active boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.grade_bands ADD COLUMN version_id uuid;
ALTER TABLE public.evaluation_rounds ADD COLUMN grade_config_version_id uuid;

DO $$
DECLARE
  v_initial_id uuid;
BEGIN
  INSERT INTO public.grade_band_versions (version_no, checksum, is_active)
  VALUES (
    1,
    encode(digest(
      (SELECT jsonb_agg(to_jsonb(g) - 'id' - 'created_at' ORDER BY g.role_group, g.sort_order)::text
       FROM public.grade_bands g),
      'sha256'
    ), 'hex'),
    true
  )
  RETURNING id INTO v_initial_id;

  UPDATE public.grade_bands SET version_id = v_initial_id;
END $$;

ALTER TABLE public.grade_bands ALTER COLUMN version_id SET NOT NULL;
ALTER TABLE public.grade_bands
  ADD CONSTRAINT grade_bands_version_id_fkey
  FOREIGN KEY (version_id) REFERENCES public.grade_band_versions(id) ON DELETE RESTRICT;
ALTER TABLE public.evaluation_rounds
  ADD CONSTRAINT evaluation_rounds_grade_config_version_id_fkey
  FOREIGN KEY (grade_config_version_id) REFERENCES public.grade_band_versions(id) ON DELETE RESTRICT;
ALTER TABLE public.grade_bands DROP CONSTRAINT grade_bands_role_group_grade_key;
ALTER TABLE public.grade_bands
  ADD CONSTRAINT grade_bands_version_role_grade_key UNIQUE (version_id, role_group, grade);
CREATE UNIQUE INDEX grade_band_versions_one_active
  ON public.grade_band_versions (is_active) WHERE is_active;

CREATE OR REPLACE FUNCTION public.validate_grade_config(p_bands jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_row record;
  v_count integer;
BEGIN
  IF p_bands IS NULL OR jsonb_typeof(p_bands) <> 'array' OR jsonb_array_length(p_bands) <> 18 THEN
    RAISE EXCEPTION 'P99M3T01_INVALID_CONFIG: exactly 18 grade bands are required';
  END IF;

  DROP TABLE IF EXISTS pg_temp.p99m3t01_grade_input;
  CREATE TEMP TABLE pg_temp.p99m3t01_grade_input (
    role_group text NOT NULL,
    grade text NOT NULL,
    min_score numeric,
    max_score numeric,
    sort_order integer
  ) ON COMMIT DROP;

  INSERT INTO pg_temp.p99m3t01_grade_input (role_group, grade, min_score, max_score, sort_order)
  SELECT x.role_group,
         x.grade,
         CASE WHEN x.min_score IS NULL OR jsonb_typeof(x.min_score) = 'null' THEN NULL ELSE (x.min_score #>> '{}')::numeric END,
         CASE WHEN x.max_score IS NULL OR jsonb_typeof(x.max_score) = 'null' THEN NULL ELSE (x.max_score #>> '{}')::numeric END,
         x.sort_order
  FROM jsonb_to_recordset(p_bands) AS x(
    role_group text,
    grade text,
    min_score jsonb,
    max_score jsonb,
    sort_order integer
  );

  SELECT count(*) INTO v_count FROM pg_temp.p99m3t01_grade_input;
  IF v_count <> 18 THEN
    RAISE EXCEPTION 'P99M3T01_INVALID_CONFIG: every row must include role_group and grade';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_temp.p99m3t01_grade_input
    WHERE role_group NOT IN ('leader', 'staff', 'worker')
       OR grade NOT IN ('S', 'A', 'AB', 'B', 'C', 'D')
       OR min_score = 'NaN'::numeric OR max_score = 'NaN'::numeric
       OR min_score IS NOT NULL AND min_score <> trunc(min_score)
       OR max_score IS NOT NULL AND max_score <> trunc(max_score)
       OR min_score IS NOT NULL AND abs(min_score) > 1000000
       OR max_score IS NOT NULL AND abs(max_score) > 1000000
  ) THEN
    RAISE EXCEPTION 'P99M3T01_INVALID_CONFIG: unsupported role, grade, non-finite, non-integer, or out-of-domain score';
  END IF;

  IF EXISTS (
    SELECT role_group, grade FROM pg_temp.p99m3t01_grade_input
    GROUP BY role_group, grade HAVING count(*) <> 1
  ) OR EXISTS (
    SELECT role_group FROM pg_temp.p99m3t01_grade_input
    GROUP BY role_group HAVING count(*) <> 6
  ) THEN
    RAISE EXCEPTION 'P99M3T01_INVALID_CONFIG: each role group requires exactly one S/A/AB/B/C/D';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_temp.p99m3t01_grade_input
    WHERE (grade = 'S' AND max_score IS NOT NULL)
       OR (grade = 'D' AND min_score IS NOT NULL)
       OR (grade NOT IN ('S', 'D') AND (min_score IS NULL OR max_score IS NULL))
       OR (min_score IS NOT NULL AND max_score IS NOT NULL AND min_score > max_score)
  ) THEN
    RAISE EXCEPTION 'P99M3T01_INVALID_CONFIG: invalid NULL catch-all or min/max boundary';
  END IF;

  IF EXISTS (
    WITH ordered AS (
      SELECT g.*,
             row_number() OVER (
               PARTITION BY role_group
               ORDER BY CASE grade WHEN 'S' THEN 1 WHEN 'A' THEN 2 WHEN 'AB' THEN 3 WHEN 'B' THEN 4 WHEN 'C' THEN 5 WHEN 'D' THEN 6 END
             ) AS band_order
      FROM pg_temp.p99m3t01_grade_input g
    )
    SELECT 1 FROM ordered a
    WHERE a.sort_order IS DISTINCT FROM a.band_order - 1
       OR a.grade = 'S' AND a.min_score IS NULL
       OR a.grade = 'D' AND a.max_score IS NULL
  ) THEN
    RAISE EXCEPTION 'P99M3T01_INVALID_CONFIG: sort order or top/bottom boundary is invalid';
  END IF;

  IF EXISTS (
    WITH ordered AS (
      SELECT g.*,
             row_number() OVER (
               PARTITION BY role_group
               ORDER BY CASE grade WHEN 'S' THEN 1 WHEN 'A' THEN 2 WHEN 'AB' THEN 3 WHEN 'B' THEN 4 WHEN 'C' THEN 5 WHEN 'D' THEN 6 END
             ) AS band_order
      FROM pg_temp.p99m3t01_grade_input g
    )
    SELECT 1
    FROM ordered current_band
    JOIN ordered next_band
      ON next_band.role_group = current_band.role_group
     AND next_band.band_order = current_band.band_order + 1
    WHERE next_band.max_score IS DISTINCT FROM current_band.min_score - 1
  ) THEN
    RAISE EXCEPTION 'P99M3T01_INVALID_CONFIG: grade bands contain a gap or overlap';
  END IF;
END;
$function$;

COMMENT ON FUNCTION public.validate_grade_config(jsonb)
IS 'kurabe:p99m3t01:candidate:v1:function:validate_grade_config';

CREATE OR REPLACE FUNCTION public.get_active_grade_config()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_version public.grade_band_versions%ROWTYPE;
  v_bands jsonb;
BEGIN
  SELECT * INTO v_version
  FROM public.grade_band_versions
  WHERE is_active
  ORDER BY version_no DESC
  LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'P99M3T01_CONFIG_UNAVAILABLE: no active grade configuration';
  END IF;

  SELECT jsonb_agg(
    jsonb_build_object(
      'role_group', role_group,
      'grade', grade,
      'min_score', min_score,
      'max_score', max_score,
      'sort_order', sort_order
    ) ORDER BY role_group, sort_order
  ) INTO v_bands
  FROM public.grade_bands
  WHERE version_id = v_version.id;

  IF jsonb_array_length(COALESCE(v_bands, '[]'::jsonb)) <> 18 THEN
    RAISE EXCEPTION 'P99M3T01_CONFIG_UNAVAILABLE: active configuration is incomplete';
  END IF;

  RETURN jsonb_build_object(
    'version', v_version.version_no,
    'version_id', v_version.id,
    'checksum', v_version.checksum,
    'bands', v_bands
  );
END;
$function$;

COMMENT ON FUNCTION public.get_active_grade_config()
IS 'kurabe:p99m3t01:candidate:v1:function:get_active_grade_config';

CREATE OR REPLACE FUNCTION public.save_grade_config(
  p_bands jsonb,
  p_expected_version bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_current public.grade_band_versions%ROWTYPE;
  v_new public.grade_band_versions%ROWTYPE;
  v_row record;
  v_checksum text;
  v_count integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('kurabe:p99m3t01:grade-config'));

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
  v_checksum := encode(digest(p_bands::text, 'sha256'), 'hex');

  INSERT INTO public.grade_band_versions (version_no, checksum, is_active)
  VALUES (v_current.version_no + 1, v_checksum, false)
  RETURNING * INTO v_new;

  UPDATE public.grade_band_versions SET is_active = false WHERE id = v_current.id;

  FOR v_row IN
    SELECT * FROM jsonb_to_recordset(p_bands) AS x(
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

  RETURN jsonb_build_object(
    'version', v_new.version_no,
    'version_id', v_new.id,
    'checksum', v_new.checksum,
    'bands', (
      SELECT jsonb_agg(
        jsonb_build_object('role_group', role_group, 'grade', grade, 'min_score', min_score, 'max_score', max_score, 'sort_order', sort_order)
        ORDER BY role_group, sort_order
      ) FROM public.grade_bands WHERE version_id = v_new.id
    )
  );
END;
$function$;

COMMENT ON FUNCTION public.save_grade_config(jsonb, bigint)
IS 'kurabe:p99m3t01:candidate:v1:function:save_grade_config';

CREATE OR REPLACE FUNCTION public.pin_grade_config_version()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_active_id uuid;
BEGIN
  IF NEW.status = 'Submitted'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'Submitted' OR NEW.grade_config_version_id IS DISTINCT FROM OLD.grade_config_version_id) THEN
    PERFORM pg_advisory_xact_lock(hashtext('kurabe:p99m3t01:grade-config'));
    SELECT id INTO v_active_id FROM public.grade_band_versions WHERE is_active ORDER BY version_no DESC LIMIT 1;
    IF v_active_id IS NULL THEN
      RAISE EXCEPTION 'P99M3T01_CONFIG_UNAVAILABLE: cannot submit without active grade configuration';
    END IF;
    IF NEW.grade_config_version_id IS NULL THEN
      NEW.grade_config_version_id := v_active_id;
    ELSIF NEW.grade_config_version_id <> v_active_id THEN
      RAISE EXCEPTION 'P99M3T01_GRADE_VERSION_STALE: submitted round is not using the active grade configuration';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.pin_grade_config_version()
IS 'kurabe:p99m3t01:candidate:v1:function:pin_grade_config_version';

CREATE TRIGGER evaluation_rounds_pin_grade_config_version
BEFORE INSERT OR UPDATE ON public.evaluation_rounds
FOR EACH ROW EXECUTE FUNCTION public.pin_grade_config_version();

-- SECURITY DEFINER functions expose only the intended JSON contract.
REVOKE ALL ON FUNCTION public.validate_grade_config(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_active_grade_config() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.save_grade_config(jsonb, bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pin_grade_config_version() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_active_grade_config() TO anon, authenticated, service_role, postgres;
GRANT EXECUTE ON FUNCTION public.save_grade_config(jsonb, bigint) TO service_role, postgres;
GRANT EXECUTE ON FUNCTION public.validate_grade_config(jsonb) TO service_role, postgres;

COMMIT;
