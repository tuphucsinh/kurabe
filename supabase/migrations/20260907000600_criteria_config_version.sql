BEGIN;

-- P99M3T02: versioned, immutable criteria configuration with an atomic live projection.
DO $$
BEGIN
  IF to_regclass('public.criteria') IS NULL
     OR to_regclass('public.criteria_groups') IS NULL
     OR to_regclass('public.criterion_levels') IS NULL
     OR to_regclass('public.criterion_audiences') IS NULL
     OR to_regclass('public.evaluation_rounds') IS NULL THEN
    RAISE EXCEPTION 'P99M3T02_PREFLIGHT_FAILED: required criteria/evaluation tables are missing';
  END IF;
END $$;

ALTER TABLE public.criteria_groups ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
ALTER TABLE public.criteria ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
ALTER TABLE public.criterion_levels ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
ALTER TABLE public.criterion_audiences ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
ALTER TABLE public.evaluation_rounds ADD COLUMN IF NOT EXISTS criteria_config_version_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'criteria_default_level_index_supported_check') THEN
    ALTER TABLE public.criteria ADD CONSTRAINT criteria_default_level_index_supported_check
      CHECK (default_level_index IS NULL OR default_level_index >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'criteria_weight_supported_check') THEN
    ALTER TABLE public.criteria ADD CONSTRAINT criteria_weight_supported_check
      CHECK (weight IS NULL OR (weight >= 0 AND weight <= 1000000));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'criteria_sort_order_supported_check') THEN
    ALTER TABLE public.criteria ADD CONSTRAINT criteria_sort_order_supported_check
      CHECK (sort_order IS NULL OR sort_order >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'criteria_groups_sort_order_supported_check') THEN
    ALTER TABLE public.criteria_groups ADD CONSTRAINT criteria_groups_sort_order_supported_check
      CHECK (sort_order IS NULL OR sort_order >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'criterion_levels_points_supported_check') THEN
    ALTER TABLE public.criterion_levels ADD CONSTRAINT criterion_levels_points_supported_check
      CHECK (points >= -1000000 AND points <= 1000000);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'criterion_levels_sort_order_supported_check') THEN
    ALTER TABLE public.criterion_levels ADD CONSTRAINT criterion_levels_sort_order_supported_check
      CHECK (sort_order IS NULL OR sort_order >= 0);
  END IF;
END $$;

CREATE TABLE public.criteria_config_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_no bigint NOT NULL UNIQUE,
  checksum text NOT NULL,
  is_active boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX criteria_config_versions_one_active
  ON public.criteria_config_versions (is_active) WHERE is_active;

CREATE TABLE public.criteria_group_versions (
  version_id uuid NOT NULL REFERENCES public.criteria_config_versions(id) ON DELETE RESTRICT,
  group_id uuid NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  short_name text,
  sort_order integer NOT NULL DEFAULT 0,
  PRIMARY KEY (version_id, group_id),
  UNIQUE (version_id, code)
);
CREATE TABLE public.criterion_versions (
  version_id uuid NOT NULL REFERENCES public.criteria_config_versions(id) ON DELETE RESTRICT,
  criterion_id uuid NOT NULL,
  group_id uuid NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  description text,
  applies_to text,
  weight integer,
  default_level_index integer,
  sort_order integer NOT NULL DEFAULT 0,
  PRIMARY KEY (version_id, criterion_id),
  UNIQUE (version_id, code),
  FOREIGN KEY (version_id, group_id)
    REFERENCES public.criteria_group_versions(version_id, group_id) ON DELETE RESTRICT,
  CHECK (weight IS NULL OR (weight >= 0 AND weight <= 1000000)),
  CHECK (default_level_index IS NULL OR default_level_index >= 0),
  CHECK (sort_order >= 0)
);
CREATE TABLE public.criterion_level_versions (
  version_id uuid NOT NULL,
  level_id uuid NOT NULL,
  criterion_id uuid NOT NULL,
  points integer NOT NULL CHECK (points >= -1000000 AND points <= 1000000),
  label text NOT NULL,
  description text,
  sort_order integer NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  PRIMARY KEY (version_id, level_id),
  FOREIGN KEY (version_id, criterion_id)
    REFERENCES public.criterion_versions(version_id, criterion_id) ON DELETE RESTRICT
);
CREATE TABLE public.criterion_audience_versions (
  version_id uuid NOT NULL,
  criterion_id uuid NOT NULL,
  audience text NOT NULL CHECK (audience IN ('management', 'employee', 'worker')),
  PRIMARY KEY (version_id, criterion_id, audience),
  FOREIGN KEY (version_id, criterion_id)
    REFERENCES public.criterion_versions(version_id, criterion_id) ON DELETE RESTRICT
);
ALTER TABLE public.evaluation_rounds
  ADD CONSTRAINT evaluation_rounds_criteria_config_version_id_fkey
  FOREIGN KEY (criteria_config_version_id)
  REFERENCES public.criteria_config_versions(id) ON DELETE RESTRICT;

-- A direct write cannot create an invalid default index. The RPC sets the local
-- guard below while it replaces the projection, then validates the complete
-- candidate before committing it.
CREATE OR REPLACE FUNCTION public.guard_criteria_default_level_index()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $function$
BEGIN
  IF current_setting('kurabe.criteria_config_write', true) IS DISTINCT FROM 'true'
     AND NEW.is_active
     AND NEW.default_level_index IS NOT NULL
     AND NEW.default_level_index >= (
       SELECT count(*) FROM public.criterion_levels l
       WHERE l.criterion_id = NEW.id AND l.is_active
     ) THEN
    RAISE EXCEPTION 'P99M3T02_INVALID_CONFIG: default level index is out of range';
  END IF;
  RETURN NEW;
END;
$function$;
COMMENT ON FUNCTION public.guard_criteria_default_level_index()
IS 'kurabe:p99m3t02:candidate:v1:function:guard_criteria_default_level_index';
CREATE TRIGGER criteria_default_level_index_guard
BEFORE INSERT OR UPDATE ON public.criteria
FOR EACH ROW EXECUTE FUNCTION public.guard_criteria_default_level_index();

DO $$
DECLARE
  v_id uuid;
  v_group record;
  v_criterion record;
  v_level record;
  v_audience record;
  v_version jsonb;
  v_count integer;
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.criteria c
    WHERE c.is_active AND (c.group_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.criteria_groups g WHERE g.id = c.group_id AND g.is_active
    ))
  ) THEN
    RAISE EXCEPTION 'P99M3T02_PREFLIGHT_FAILED: active criteria must reference an active group';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.criteria c
    WHERE c.is_active AND c.default_level_index IS NOT NULL
      AND (c.default_level_index < 0 OR c.default_level_index >= (
        SELECT count(*) FROM public.criterion_levels l WHERE l.criterion_id = c.id AND l.is_active
      ))
  ) THEN
    RAISE EXCEPTION 'P99M3T02_PREFLIGHT_FAILED: existing default level index is out of range';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.criteria c
    WHERE c.is_active AND NOT EXISTS (
      SELECT 1 FROM public.criterion_levels l WHERE l.criterion_id = c.id AND l.is_active
    )
  ) THEN
    RAISE EXCEPTION 'P99M3T02_PREFLIGHT_FAILED: active criteria must have at least one level';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.criteria c
    WHERE c.is_active AND NOT EXISTS (
      SELECT 1 FROM public.criterion_audiences a
      WHERE a.criterion_id = c.id AND a.is_active
        AND a.audience IN ('management', 'employee', 'worker')
    )
  ) THEN
    RAISE EXCEPTION 'P99M3T02_PREFLIGHT_FAILED: active criteria must have a supported audience';
  END IF;

  SELECT jsonb_build_object('groups', COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', g.id, 'code', g.code, 'name', g.name,
      'short_name', g.short_name, 'sort_order', COALESCE(g.sort_order, 0),
      'criteria', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id', c.id, 'group_id', c.group_id, 'code', c.code, 'name', c.name,
        'description', c.description, 'applies_to', c.applies_to,
        'weight', c.weight, 'default_level_index', c.default_level_index,
        'sort_order', COALESCE(c.sort_order, 0),
        'audiences', (SELECT jsonb_agg(a.audience ORDER BY a.audience)
                      FROM public.criterion_audiences a
                      WHERE a.criterion_id = c.id AND a.is_active),
        'levels', (SELECT jsonb_agg(jsonb_build_object(
          'id', l.id, 'criterion_id', l.criterion_id, 'points', l.points,
          'label', l.label, 'description', l.description,
          'sort_order', COALESCE(l.sort_order, 0)
        ) ORDER BY l.sort_order, l.id) FROM public.criterion_levels l
           WHERE l.criterion_id = c.id AND l.is_active)
      ) ORDER BY COALESCE(c.sort_order, 0), c.code)
      FROM public.criteria c WHERE c.group_id = g.id AND c.is_active), '[]'::jsonb)
    ) ORDER BY COALESCE(g.sort_order, 0), g.code
  ), '[]'::jsonb)) INTO v_version
  FROM public.criteria_groups g WHERE g.is_active;

  INSERT INTO public.criteria_config_versions(version_no, checksum, is_active)
  VALUES (1, encode(digest(v_version::text, 'sha256'), 'hex'), true)
  RETURNING id INTO v_id;

  INSERT INTO public.criteria_group_versions(version_id, group_id, code, name, short_name, sort_order)
  SELECT v_id, g.id, g.code, g.name, g.short_name, COALESCE(g.sort_order, 0)
  FROM public.criteria_groups g WHERE g.is_active;
  INSERT INTO public.criterion_versions(version_id, criterion_id, group_id, code, name, description, applies_to, weight, default_level_index, sort_order)
  SELECT v_id, c.id, c.group_id, c.code, c.name, c.description, c.applies_to, c.weight,
         c.default_level_index, COALESCE(c.sort_order, 0)
  FROM public.criteria c JOIN public.criteria_groups g
    ON g.id = c.group_id AND g.is_active WHERE c.is_active;
  INSERT INTO public.criterion_level_versions(version_id, level_id, criterion_id, points, label, description, sort_order)
  SELECT v_id, l.id, l.criterion_id, l.points, l.label, l.description, COALESCE(l.sort_order, 0)
  FROM public.criterion_levels l JOIN public.criteria c
    ON c.id = l.criterion_id AND c.is_active WHERE l.is_active;
  INSERT INTO public.criterion_audience_versions(version_id, criterion_id, audience)
  SELECT v_id, a.criterion_id, a.audience
  FROM public.criterion_audiences a JOIN public.criteria c
    ON c.id = a.criterion_id AND c.is_active WHERE a.is_active;

  SELECT count(*) INTO v_count FROM public.criterion_versions WHERE version_id = v_id;
  IF v_count <> (SELECT count(*) FROM public.criteria WHERE is_active) THEN
    RAISE EXCEPTION 'P99M3T02_PREFLIGHT_FAILED: initial criteria snapshot is incomplete';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.validate_criteria_config(p_config jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $function$
DECLARE
  v_group jsonb;
  v_criterion jsonb;
  v_level jsonb;
  v_audience jsonb;
  v_group_id text;
  v_criterion_id text;
  v_level_id text;
  v_i integer;
  v_default integer;
  v_points numeric;
  v_weight numeric;
  v_sort integer;
BEGIN
  IF p_config IS NULL OR jsonb_typeof(p_config) <> 'object'
     OR jsonb_typeof(p_config->'groups') <> 'array'
     OR jsonb_array_length(p_config->'groups') = 0 THEN
    RAISE EXCEPTION 'P99M3T02_INVALID_CONFIG: groups must be a non-empty array';
  END IF;

  FOR v_group IN SELECT value FROM jsonb_array_elements(p_config->'groups') LOOP
    v_group_id := NULLIF(v_group->>'id', '');
    IF v_group_id IS NOT NULL THEN PERFORM v_group_id::uuid; END IF;
    IF NULLIF(trim(v_group->>'code'), '') IS NULL
       OR length(trim(v_group->>'code')) > 100
       OR NULLIF(trim(v_group->>'name'), '') IS NULL
       OR length(trim(v_group->>'name')) > 500 THEN
      RAISE EXCEPTION 'P99M3T02_INVALID_CONFIG: group code and name are required and bounded';
    END IF;
    IF v_group ? 'sort_order' AND v_group->>'sort_order' IS NOT NULL THEN
      v_sort := (v_group->>'sort_order')::integer;
      IF v_sort < 0 THEN RAISE EXCEPTION 'P99M3T02_INVALID_CONFIG: invalid group ordering'; END IF;
    END IF;
    IF jsonb_typeof(v_group->'criteria') <> 'array' THEN
      RAISE EXCEPTION 'P99M3T02_INVALID_CONFIG: group criteria must be an array';
    END IF;
    FOR v_criterion IN SELECT value FROM jsonb_array_elements(v_group->'criteria') LOOP
      v_criterion_id := NULLIF(v_criterion->>'id', '');
      IF v_criterion_id IS NOT NULL THEN PERFORM v_criterion_id::uuid; END IF;
      IF NULLIF(trim(v_criterion->>'code'), '') IS NULL
         OR length(trim(v_criterion->>'code')) > 100
         OR NULLIF(trim(v_criterion->>'name'), '') IS NULL
         OR length(trim(v_criterion->>'name')) > 500 THEN
        RAISE EXCEPTION 'P99M3T02_INVALID_CONFIG: criterion code and name are required and bounded';
      END IF;
      IF jsonb_typeof(v_criterion->'audiences') <> 'array'
         OR jsonb_array_length(v_criterion->'audiences') = 0 THEN
        RAISE EXCEPTION 'P99M3T02_INVALID_CONFIG: every criterion needs an audience';
      END IF;
      FOR v_audience IN SELECT value FROM jsonb_array_elements(v_criterion->'audiences') LOOP
        IF jsonb_typeof(v_audience) <> 'string'
           OR v_audience #>> '{}' NOT IN ('management', 'employee', 'worker') THEN
          RAISE EXCEPTION 'P99M3T02_INVALID_CONFIG: unsupported audience';
        END IF;
      END LOOP;
      IF (SELECT count(*) FROM jsonb_array_elements(v_criterion->'audiences'))
         <> (SELECT count(DISTINCT value) FROM jsonb_array_elements_text(v_criterion->'audiences')) THEN
        RAISE EXCEPTION 'P99M3T02_INVALID_CONFIG: duplicate audience';
      END IF;
      IF jsonb_typeof(v_criterion->'levels') <> 'array'
         OR jsonb_array_length(v_criterion->'levels') = 0 THEN
        RAISE EXCEPTION 'P99M3T02_INVALID_CONFIG: every criterion needs at least one level';
      END IF;
      IF v_criterion ? 'default_level_index' AND v_criterion->>'default_level_index' IS NOT NULL THEN
        v_default := (v_criterion->>'default_level_index')::integer;
        IF v_default < 0 OR v_default >= jsonb_array_length(v_criterion->'levels') THEN
          RAISE EXCEPTION 'P99M3T02_INVALID_CONFIG: default level index is out of range';
        END IF;
      END IF;
      IF v_criterion ? 'weight' AND v_criterion->>'weight' IS NOT NULL THEN
        v_weight := (v_criterion->>'weight')::numeric;
        IF v_weight <> trunc(v_weight) OR v_weight < 0 OR v_weight > 1000000 THEN
          RAISE EXCEPTION 'P99M3T02_INVALID_CONFIG: unsupported criterion weight';
        END IF;
      END IF;
      v_i := 0;
      FOR v_level IN SELECT value FROM jsonb_array_elements(v_criterion->'levels') LOOP
        v_level_id := NULLIF(v_level->>'id', '');
        IF v_level_id IS NOT NULL THEN PERFORM v_level_id::uuid; END IF;
        IF NULLIF(trim(v_level->>'label'), '') IS NULL
           OR length(trim(v_level->>'label')) > 2000
           OR v_level->>'points' IS NULL THEN
          RAISE EXCEPTION 'P99M3T02_INVALID_CONFIG: level label and points are required and bounded';
        END IF;
        v_points := (v_level->>'points')::numeric;
        IF v_points <> v_points OR v_points <> trunc(v_points) OR abs(v_points) > 1000000 THEN
          RAISE EXCEPTION 'P99M3T02_INVALID_CONFIG: level points must be supported integers';
        END IF;
        IF (v_level ? 'sort_order') AND v_level->>'sort_order' IS NOT NULL THEN
          v_sort := (v_level->>'sort_order')::integer;
          IF v_sort <> v_i THEN
            RAISE EXCEPTION 'P99M3T02_INVALID_CONFIG: level ordering is not contiguous';
          END IF;
        END IF;
        v_i := v_i + 1;
      END LOOP;
    END LOOP;
  END LOOP;
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range OR invalid_parameter_value THEN
  RAISE EXCEPTION 'P99M3T02_INVALID_CONFIG: unsupported number or identifier';
END;
$function$;
COMMENT ON FUNCTION public.validate_criteria_config(jsonb)
IS 'kurabe:p99m3t02:candidate:v1:function:validate_criteria_config';

CREATE OR REPLACE FUNCTION public.get_active_criteria_config()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $function$
DECLARE
  v_version public.criteria_config_versions%ROWTYPE;
BEGIN
  SELECT * INTO v_version FROM public.criteria_config_versions
  WHERE is_active ORDER BY version_no DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'P99M3T02_CONFIG_UNAVAILABLE: no active criteria configuration'; END IF;
  RETURN jsonb_build_object(
    'version', v_version.version_no,
    'version_id', v_version.id,
    'checksum', v_version.checksum,
    'groups', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id', g.group_id, 'code', g.code, 'name', g.name, 'short_name', g.short_name,
      'sort_order', g.sort_order,
      'criteria', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id', c.criterion_id, 'group_id', c.group_id, 'code', c.code, 'name', c.name,
        'description', c.description, 'applies_to', c.applies_to, 'weight', c.weight,
        'default_level_index', c.default_level_index, 'sort_order', c.sort_order,
        'audiences', COALESCE((SELECT jsonb_agg(a.audience ORDER BY a.audience)
          FROM public.criterion_audience_versions a
          WHERE a.version_id = c.version_id AND a.criterion_id = c.criterion_id), '[]'::jsonb),
        'levels', COALESCE((SELECT jsonb_agg(jsonb_build_object(
          'id', l.level_id, 'criterion_id', l.criterion_id, 'points', l.points,
          'label', l.label, 'description', l.description, 'sort_order', l.sort_order
        ) ORDER BY l.sort_order, l.level_id) FROM public.criterion_level_versions l
          WHERE l.version_id = c.version_id AND l.criterion_id = c.criterion_id), '[]'::jsonb)
      ) ORDER BY c.sort_order, c.code) FROM public.criterion_versions c
        WHERE c.version_id = g.version_id AND c.group_id = g.group_id), '[]'::jsonb)
    ) ORDER BY g.sort_order, g.code) FROM public.criteria_group_versions g
      WHERE g.version_id = v_version.id), '[]'::jsonb)
  );
END;
$function$;
COMMENT ON FUNCTION public.get_active_criteria_config()
IS 'kurabe:p99m3t02:candidate:v1:function:get_active_criteria_config';

CREATE OR REPLACE FUNCTION public.save_criteria_config(p_config jsonb, p_expected_version bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $function$
DECLARE
  v_current public.criteria_config_versions%ROWTYPE;
  v_new public.criteria_config_versions%ROWTYPE;
  v_group jsonb;
  v_criterion jsonb;
  v_level jsonb;
  v_audience jsonb;
  v_gid uuid;
  v_cid uuid;
  v_lid uuid;
  v_i integer;
  v_checksum text;
  v_count integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('kurabe:p99m3t02:criteria-config'));
  SELECT * INTO v_current FROM public.criteria_config_versions
  WHERE is_active ORDER BY version_no DESC LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'P99M3T02_CONFIG_UNAVAILABLE: no active criteria configuration'; END IF;
  IF p_expected_version IS NULL OR p_expected_version <> v_current.version_no THEN
    RAISE EXCEPTION 'P99M3T02_CONFIG_STALE: expected version %, current version %', p_expected_version, v_current.version_no;
  END IF;
  PERFORM public.validate_criteria_config(p_config);

  DROP TABLE IF EXISTS pg_temp.p99m3t02_groups;
  DROP TABLE IF EXISTS pg_temp.p99m3t02_criteria;
  DROP TABLE IF EXISTS pg_temp.p99m3t02_levels;
  DROP TABLE IF EXISTS pg_temp.p99m3t02_audiences;
  CREATE TEMP TABLE pg_temp.p99m3t02_groups (
    id uuid PRIMARY KEY, code text UNIQUE NOT NULL, name text NOT NULL, short_name text, sort_order integer NOT NULL
  ) ON COMMIT DROP;
  CREATE TEMP TABLE pg_temp.p99m3t02_criteria (
    id uuid PRIMARY KEY, group_id uuid NOT NULL, code text UNIQUE NOT NULL, name text NOT NULL,
    description text, applies_to text, weight integer, default_level_index integer, sort_order integer NOT NULL
  ) ON COMMIT DROP;
  CREATE TEMP TABLE pg_temp.p99m3t02_levels (
    id uuid PRIMARY KEY, criterion_id uuid NOT NULL, points integer NOT NULL, label text NOT NULL,
    description text, sort_order integer NOT NULL
  ) ON COMMIT DROP;
  CREATE TEMP TABLE pg_temp.p99m3t02_audiences (
    criterion_id uuid NOT NULL, audience text NOT NULL, PRIMARY KEY (criterion_id, audience)
  ) ON COMMIT DROP;

  v_i := 0;
  FOR v_group IN SELECT value FROM jsonb_array_elements(p_config->'groups') LOOP
    v_gid := COALESCE(NULLIF(v_group->>'id', '')::uuid, gen_random_uuid());
    INSERT INTO pg_temp.p99m3t02_groups VALUES (
      v_gid, trim(v_group->>'code'), trim(v_group->>'name'),
      NULLIF(trim(v_group->>'short_name'), ''), COALESCE((v_group->>'sort_order')::integer, v_i)
    );
    v_i := v_i + 1;
    v_i := 0;
    FOR v_criterion IN SELECT value FROM jsonb_array_elements(v_group->'criteria') LOOP
      v_cid := COALESCE(NULLIF(v_criterion->>'id', '')::uuid, gen_random_uuid());
      INSERT INTO pg_temp.p99m3t02_criteria VALUES (
        v_cid, v_gid, trim(v_criterion->>'code'), trim(v_criterion->>'name'),
        NULLIF(trim(v_criterion->>'description'), ''),
        (SELECT string_agg(value #>> '{}', ',' ORDER BY ordinality)
          FROM jsonb_array_elements(v_criterion->'audiences') WITH ORDINALITY),
        CASE WHEN v_criterion->>'weight' IS NULL THEN 0 ELSE (v_criterion->>'weight')::integer END,
        CASE WHEN v_criterion->>'default_level_index' IS NULL THEN NULL ELSE (v_criterion->>'default_level_index')::integer END,
        COALESCE((v_criterion->>'sort_order')::integer, v_i)
      );
      FOR v_audience IN SELECT value FROM jsonb_array_elements(v_criterion->'audiences') LOOP
        INSERT INTO pg_temp.p99m3t02_audiences VALUES (v_cid, v_audience #>> '{}');
      END LOOP;
      v_i := 0;
      FOR v_level IN SELECT value FROM jsonb_array_elements(v_criterion->'levels') LOOP
        v_lid := COALESCE(NULLIF(v_level->>'id', '')::uuid, gen_random_uuid());
        INSERT INTO pg_temp.p99m3t02_levels VALUES (
          v_lid, v_cid, (v_level->>'points')::integer, trim(v_level->>'label'),
          NULLIF(trim(v_level->>'description'), ''), COALESCE((v_level->>'sort_order')::integer, v_i)
        );
        v_i := v_i + 1;
      END LOOP;
    END LOOP;
  END LOOP;

  v_checksum := encode(digest(p_config::text, 'sha256'), 'hex');
  INSERT INTO public.criteria_config_versions(version_no, checksum, is_active)
  VALUES (v_current.version_no + 1, v_checksum, false) RETURNING * INTO v_new;

  -- The projection is changed only inside this transaction. No delete/insert
  -- sequence is externally observable, and all failures roll back the version.
  PERFORM set_config('kurabe.criteria_config_write', 'true', true);
  UPDATE public.criteria_groups SET is_active = false;
  INSERT INTO public.criteria_groups(id, code, name, short_name, sort_order, is_active)
  SELECT id, code, name, short_name, sort_order, true FROM pg_temp.p99m3t02_groups
  ON CONFLICT (id) DO UPDATE SET code=EXCLUDED.code, name=EXCLUDED.name,
    short_name=EXCLUDED.short_name, sort_order=EXCLUDED.sort_order, is_active=true;

  UPDATE public.criteria SET is_active = false;
  INSERT INTO public.criteria(id, group_id, code, name, description, applies_to, weight,
    default_level_index, sort_order, is_active)
  SELECT id, group_id, code, name, description, applies_to, weight, default_level_index,
    sort_order, true FROM pg_temp.p99m3t02_criteria
  ON CONFLICT (id) DO UPDATE SET group_id=EXCLUDED.group_id, code=EXCLUDED.code,
    name=EXCLUDED.name, description=EXCLUDED.description, applies_to=EXCLUDED.applies_to,
    weight=EXCLUDED.weight, default_level_index=EXCLUDED.default_level_index,
    sort_order=EXCLUDED.sort_order, is_active=true;

  UPDATE public.criterion_levels SET is_active = false;
  INSERT INTO public.criterion_levels(id, criterion_id, points, label, description, sort_order, is_active)
  SELECT id, criterion_id, points, label, description, sort_order, true FROM pg_temp.p99m3t02_levels
  ON CONFLICT (id) DO UPDATE SET criterion_id=EXCLUDED.criterion_id, points=EXCLUDED.points,
    label=EXCLUDED.label, description=EXCLUDED.description, sort_order=EXCLUDED.sort_order,
    is_active=true;

  UPDATE public.criterion_audiences SET is_active = false;
  INSERT INTO public.criterion_audiences(criterion_id, audience, is_active)
  SELECT criterion_id, audience, true FROM pg_temp.p99m3t02_audiences
  ON CONFLICT (criterion_id, audience) DO UPDATE SET is_active=true;

  INSERT INTO public.criteria_group_versions(version_id, group_id, code, name, short_name, sort_order)
    SELECT v_new.id, id, code, name, short_name, sort_order FROM pg_temp.p99m3t02_groups;
  INSERT INTO public.criterion_versions(version_id, criterion_id, group_id, code, name, description,
    applies_to, weight, default_level_index, sort_order)
    SELECT v_new.id, id, group_id, code, name, description, applies_to, weight,
      default_level_index, sort_order FROM pg_temp.p99m3t02_criteria;
  INSERT INTO public.criterion_level_versions(version_id, level_id, criterion_id, points, label,
    description, sort_order)
    SELECT v_new.id, id, criterion_id, points, label, description, sort_order
      FROM pg_temp.p99m3t02_levels;
  INSERT INTO public.criterion_audience_versions(version_id, criterion_id, audience)
    SELECT v_new.id, criterion_id, audience FROM pg_temp.p99m3t02_audiences;

  SELECT count(*) INTO v_count FROM public.criterion_versions WHERE version_id = v_new.id;
  IF v_count <> (SELECT count(*) FROM pg_temp.p99m3t02_criteria)
     OR EXISTS (SELECT 1 FROM pg_temp.p99m3t02_criteria c
       WHERE NOT EXISTS (SELECT 1 FROM public.criterion_level_versions l
         WHERE l.version_id = v_new.id AND l.criterion_id = c.id)) THEN
    RAISE EXCEPTION 'P99M3T02_CONFIG_WRITE_FAILED: version is incomplete';
  END IF;
  UPDATE public.criteria_config_versions SET is_active = false WHERE id = v_current.id;
  UPDATE public.criteria_config_versions SET is_active = true WHERE id = v_new.id;
  RETURN public.get_active_criteria_config();
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range OR unique_violation THEN
  IF SQLSTATE = '23505' THEN
    RAISE EXCEPTION 'P99M3T02_INVALID_CONFIG: duplicate identifier or code';
  END IF;
  RAISE EXCEPTION 'P99M3T02_INVALID_CONFIG: unsupported number or identifier';
END;
$function$;
COMMENT ON FUNCTION public.save_criteria_config(jsonb, bigint)
IS 'kurabe:p99m3t02:candidate:v1:function:save_criteria_config';

CREATE OR REPLACE FUNCTION public.pin_criteria_config_version()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $function$
DECLARE
  v_active_id uuid;
BEGIN
  IF NEW.status = 'Submitted'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'Submitted'
          OR NEW.criteria_config_version_id IS DISTINCT FROM OLD.criteria_config_version_id) THEN
    PERFORM pg_advisory_xact_lock(hashtext('kurabe:p99m3t02:criteria-config'));
    SELECT id INTO v_active_id FROM public.criteria_config_versions
      WHERE is_active ORDER BY version_no DESC LIMIT 1;
    IF v_active_id IS NULL THEN
      RAISE EXCEPTION 'P99M3T02_CONFIG_UNAVAILABLE: cannot submit without active criteria configuration';
    END IF;
    IF NEW.criteria_config_version_id IS NULL THEN
      NEW.criteria_config_version_id := v_active_id;
    ELSIF NEW.criteria_config_version_id <> v_active_id THEN
      RAISE EXCEPTION 'P99M3T02_CONFIG_STALE: submitted round is not using the active criteria configuration';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;
COMMENT ON FUNCTION public.pin_criteria_config_version()
IS 'kurabe:p99m3t02:candidate:v1:function:pin_criteria_config_version';
CREATE TRIGGER evaluation_rounds_pin_criteria_config_version
BEFORE INSERT OR UPDATE ON public.evaluation_rounds
FOR EACH ROW EXECUTE FUNCTION public.pin_criteria_config_version();

-- Compatibility overload for the existing transactional evaluation writer.
-- The legacy 15-argument function remains available to older callers; the
-- version-aware application path uses this overload so its loaded snapshot is
-- carried into the same transaction and checked by the pin trigger.
DO $$
BEGIN
  IF to_regprocedure('public.save_evaluation_round_transaction_active_only(uuid, integer, uuid, jsonb, jsonb, text, numeric, text, boolean, timestamptz, integer, uuid, text, text, boolean, uuid)') IS NOT NULL THEN
    RAISE EXCEPTION 'P99M3T02_PREFLIGHT_FAILED: version-aware evaluation RPC already exists';
  END IF;
END $$;

CREATE FUNCTION public.save_evaluation_round_transaction_active_only(
  p_evaluation_id uuid,
  p_round integer,
  p_actor_id uuid,
  p_scores jsonb,
  p_notes jsonb,
  p_comment text,
  p_total_score numeric,
  p_grade text,
  p_is_submit boolean,
  p_submitted_at timestamptz,
  p_next_round integer,
  p_next_evaluator_id uuid,
  p_next_evaluator_role text,
  p_next_status text,
  p_is_final boolean,
  p_criteria_config_version_id uuid
)
RETURNS TABLE (
  round_id uuid,
  evaluation_id uuid,
  next_round_id uuid,
  final_status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_period_id uuid;
  v_period_status text;
  v_result record;
BEGIN
  IF p_criteria_config_version_id IS NULL THEN
    RAISE EXCEPTION 'P99M3T02_CONFIG_UNAVAILABLE: criteria snapshot is required';
  END IF;

  SELECT ep.id, ep.status INTO v_period_id, v_period_status
  FROM public.evaluations e
  JOIN public.evaluation_periods ep ON ep.id = e.period_id
  WHERE e.id = p_evaluation_id
  FOR UPDATE OF ep;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'P96T05_EVALUATION_OR_PERIOD_NOT_FOUND: Evaluation or period not found';
  END IF;
  IF v_period_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'P96T05_PERIOD_NOT_ACTIVE: Evaluation period is not active';
  END IF;

  SELECT * INTO v_result
  FROM public.save_evaluation_round_transaction_active_only(
    p_evaluation_id, p_round, p_actor_id, p_scores, p_notes, p_comment,
    p_total_score, p_grade, p_is_submit, p_submitted_at, p_next_round,
    p_next_evaluator_id, p_next_evaluator_role, p_next_status, p_is_final
  );

  UPDATE public.evaluation_rounds
  SET criteria_config_version_id = p_criteria_config_version_id
  WHERE id = v_result.round_id
     OR (v_result.next_round_id IS NOT NULL AND id = v_result.next_round_id);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'P99M3T02_CONFIG_WRITE_FAILED: transaction returned no round';
  END IF;

  RETURN QUERY SELECT v_result.round_id, v_result.evaluation_id,
    v_result.next_round_id, v_result.final_status;
END;
$function$;
COMMENT ON FUNCTION public.save_evaluation_round_transaction_active_only(
  uuid, integer, uuid, jsonb, jsonb, text, numeric, text, boolean, timestamptz,
  integer, uuid, text, text, boolean, uuid
) IS 'kurabe:p99m3t02:candidate:v1:function:save_evaluation_round_transaction_active_only:criteria-version-aware';

REVOKE ALL ON FUNCTION public.validate_criteria_config(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_active_criteria_config() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.save_criteria_config(jsonb, bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pin_criteria_config_version() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_criteria_default_level_index() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.save_evaluation_round_transaction_active_only(uuid, integer, uuid, jsonb, jsonb, text, numeric, text, boolean, timestamptz, integer, uuid, text, text, boolean, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_active_criteria_config() TO anon, authenticated, service_role, postgres;
GRANT EXECUTE ON FUNCTION public.save_criteria_config(jsonb, bigint) TO service_role, postgres;
GRANT EXECUTE ON FUNCTION public.validate_criteria_config(jsonb) TO service_role, postgres;
GRANT EXECUTE ON FUNCTION public.save_evaluation_round_transaction_active_only(uuid, integer, uuid, jsonb, jsonb, text, numeric, text, boolean, timestamptz, integer, uuid, text, text, boolean, uuid) TO service_role, postgres;

COMMIT;
