-- ============================================================
-- Kurabe P108 Criteria Sets Rollback Artifact
-- Supports:
--   (a) revert-import: reactivates previous version when latest is import version
--   (b) schema-rollback: restores previous schema & functions (valid only BEFORE import)
-- ============================================================

BEGIN;

DO $$
DECLARE
  v_action text;
  v_latest public.criteria_config_versions%ROWTYPE;
  v_prev public.criteria_config_versions%ROWTYPE;
  v_expected_import_id text;
  v_expected_import_no bigint;
  v_expected_prev_id text;
  v_expected_prev_no bigint;
  v_captured_acl text;
  v_acl_json jsonb;
  v_grant jsonb;
  v_allowed_tables text[] := ARRAY[
    'criteria', 'criteria_groups', 'criterion_audiences', 'criterion_levels',
    'criteria_config_versions', 'criteria_group_versions', 'criterion_versions',
    'criterion_level_versions', 'criterion_audience_versions'
  ];
  v_allowed_privs text[] := ARRAY['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE'];
  v_allowed_grantees text[] := ARRAY['anon', 'authenticated', 'service_role', 'PUBLIC'];
BEGIN
  -- 1. Explicit rollback approval is required
  IF current_setting('kurabe.p108_rollback_approved', true) IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'P108_ROLLBACK_UNAPPROVED: explicit rollback approval required (SET kurabe.p108_rollback_approved = true)';
  END IF;

  v_action := COALESCE(NULLIF(current_setting('kurabe.p108_rollback_action', true), ''), 'schema');

  -- Serialize rollback: periods SHARE then advisory lock (matching save_criteria_config lock order)
  LOCK TABLE public.evaluation_periods IN SHARE MODE;
  PERFORM pg_advisory_xact_lock(hashtext('kurabe:p99m3t02:criteria-config'));

  IF EXISTS (SELECT 1 FROM public.evaluation_periods WHERE status = 'active') THEN
    RAISE EXCEPTION 'P108_ROLLBACK_BLOCKED: cannot perform rollback while an evaluation period is active';
  END IF;

  -- ==========================================================
  -- (a) REVERT-IMPORT
  -- ==========================================================
  IF v_action = 'revert-import' THEN
    v_expected_import_id := NULLIF(current_setting('kurabe.p108_expected_import_version_id', true), '');
    v_expected_import_no := NULLIF(current_setting('kurabe.p108_expected_import_version_no', true), '')::bigint;
    v_expected_prev_id := NULLIF(current_setting('kurabe.p108_expected_previous_version_id', true), '');
    v_expected_prev_no := NULLIF(current_setting('kurabe.p108_expected_previous_version_no', true), '')::bigint;

    IF (v_expected_import_id IS NULL AND v_expected_import_no IS NULL)
       OR (v_expected_prev_id IS NULL AND v_expected_prev_no IS NULL) THEN
      RAISE EXCEPTION 'P108_REVERT_IMPORT_BLOCKED: explicit expected import and previous version identity required';
    END IF;

    SELECT * INTO v_latest
    FROM public.criteria_config_versions
    WHERE is_active ORDER BY version_no DESC LIMIT 1 FOR UPDATE;

    IF v_latest.id IS NULL THEN
      RAISE EXCEPTION 'P108_REVERT_IMPORT_BLOCKED: no criteria configuration versions exist';
    END IF;

    IF v_latest.version_no <= 1 THEN
      RAISE EXCEPTION 'P108_REVERT_IMPORT_BLOCKED: cannot revert version 1';
    END IF;

    IF v_expected_import_id IS NOT NULL AND v_latest.id::text <> v_expected_import_id THEN
      RAISE EXCEPTION 'P108_REVERT_IMPORT_BLOCKED: latest active version id % does not match expected import version id %', v_latest.id, v_expected_import_id;
    END IF;

    IF v_expected_import_no IS NOT NULL AND v_latest.version_no <> v_expected_import_no THEN
      RAISE EXCEPTION 'P108_REVERT_IMPORT_BLOCKED: latest active version_no % does not match expected import version_no %', v_latest.version_no, v_expected_import_no;
    END IF;

    -- Guard: no newer version exists beyond the active import version
    IF EXISTS (
      SELECT 1 FROM public.criteria_config_versions WHERE version_no > v_latest.version_no
    ) THEN
      RAISE EXCEPTION 'P108_REVERT_IMPORT_BLOCKED: newer criteria configuration versions exist beyond import version';
    END IF;

    -- Locate and lock previous version
    SELECT * INTO v_prev
    FROM public.criteria_config_versions
    WHERE version_no = v_latest.version_no - 1 FOR UPDATE;

    IF v_prev.id IS NULL THEN
      RAISE EXCEPTION 'P108_REVERT_IMPORT_BLOCKED: previous criteria configuration version not found';
    END IF;

    IF v_expected_prev_id IS NOT NULL AND v_prev.id::text <> v_expected_prev_id THEN
      RAISE EXCEPTION 'P108_REVERT_IMPORT_BLOCKED: previous version id % does not match expected previous version id %', v_prev.id, v_expected_prev_id;
    END IF;

    IF v_expected_prev_no IS NOT NULL AND v_prev.version_no <> v_expected_prev_no THEN
      RAISE EXCEPTION 'P108_REVERT_IMPORT_BLOCKED: previous version_no % does not match expected previous version_no %', v_prev.version_no, v_expected_prev_no;
    END IF;

    -- Guard: no round pins it
    IF EXISTS (
      SELECT 1 FROM public.evaluation_rounds WHERE criteria_config_version_id = v_latest.id
    ) THEN
      RAISE EXCEPTION 'P108_REVERT_IMPORT_BLOCKED: submitted or initialized rounds pin the import version';
    END IF;

    -- Guard: no period created after import
    IF EXISTS (
      SELECT 1 FROM public.evaluation_periods WHERE created_at > v_latest.created_at
    ) THEN
      RAISE EXCEPTION 'P108_REVERT_IMPORT_BLOCKED: evaluation periods created after the import version';
    END IF;

    -- Reactivate previous version's live projection and active pointer
    PERFORM set_config('kurabe.criteria_config_write', 'true', true);

    UPDATE public.criteria_groups SET is_active = false;
    UPDATE public.criteria SET is_active = false;
    UPDATE public.criterion_levels SET is_active = false;
    UPDATE public.criterion_audiences SET is_active = false;

    UPDATE public.criteria_groups g
    SET code = gv.code, name = gv.name, short_name = gv.short_name,
        sort_order = gv.sort_order, set_key = gv.set_key, is_active = true
    FROM public.criteria_group_versions gv
    WHERE gv.version_id = v_prev.id AND gv.group_id = g.id;

    UPDATE public.criteria c
    SET group_id = cv.group_id, code = cv.code, name = cv.name,
        description = cv.description, applies_to = cv.applies_to,
        weight = cv.weight, default_level_index = cv.default_level_index,
        sort_order = cv.sort_order, set_key = cv.set_key, is_active = true
    FROM public.criterion_versions cv
    WHERE cv.version_id = v_prev.id AND cv.criterion_id = c.id;

    UPDATE public.criterion_levels l
    SET criterion_id = lv.criterion_id, points = lv.points, label = lv.label,
        description = lv.description, sort_order = lv.sort_order, is_active = true
    FROM public.criterion_level_versions lv
    WHERE lv.version_id = v_prev.id AND lv.level_id = l.id;

    UPDATE public.criterion_audiences a
    SET is_active = true
    FROM public.criterion_audience_versions av
    WHERE av.version_id = v_prev.id AND av.criterion_id = a.criterion_id AND av.audience = a.audience;

    UPDATE public.criteria_config_versions SET is_active = false WHERE id = v_latest.id;
    UPDATE public.criteria_config_versions SET is_active = true WHERE id = v_prev.id;

  -- ==========================================================
  -- (b) SCHEMA ROLLBACK
  -- ==========================================================
  ELSIF v_action IN ('schema', 'schema-rollback') THEN
    -- Guard: valid only BEFORE import (no non-NULL set_key in any live or version table)
    IF EXISTS (SELECT 1 FROM public.criteria_groups WHERE set_key IS NOT NULL)
       OR EXISTS (SELECT 1 FROM public.criteria WHERE set_key IS NOT NULL)
       OR EXISTS (SELECT 1 FROM public.criteria_group_versions WHERE set_key IS NOT NULL)
       OR EXISTS (SELECT 1 FROM public.criterion_versions WHERE set_key IS NOT NULL) THEN
      RAISE EXCEPTION 'P108_SCHEMA_ROLLBACK_REFUSED: cannot perform schema rollback when non-NULL set_key rows exist';
    END IF;

    -- Drop replacement indexes
    EXECUTE 'DROP INDEX IF EXISTS public.criteria_active_set_code_uidx';
    EXECUTE 'DROP INDEX IF EXISTS public.criteria_groups_active_set_code_uidx';
    EXECUTE 'DROP INDEX IF EXISTS public.criteria_group_versions_legacy_uidx';
    EXECUTE 'DROP INDEX IF EXISTS public.criteria_group_versions_set_code_uidx';
    EXECUTE 'DROP INDEX IF EXISTS public.criterion_versions_legacy_uidx';
    EXECUTE 'DROP INDEX IF EXISTS public.criterion_versions_set_code_uidx';

    -- Drop composite FK and unique constraint on (id, set_key)
    EXECUTE 'ALTER TABLE public.criteria DROP CONSTRAINT IF EXISTS criteria_group_id_set_key_fkey';
    EXECUTE 'ALTER TABLE public.criteria_groups DROP CONSTRAINT IF EXISTS criteria_groups_id_set_key_key';

    -- Drop new columns
    EXECUTE 'ALTER TABLE public.criteria_config_versions
      DROP COLUMN IF EXISTS group_count,
      DROP COLUMN IF EXISTS criterion_count,
      DROP COLUMN IF EXISTS level_count,
      DROP COLUMN IF EXISTS audience_count';

    EXECUTE 'ALTER TABLE public.criterion_versions DROP COLUMN IF EXISTS set_key';
    EXECUTE 'ALTER TABLE public.criteria_group_versions DROP COLUMN IF EXISTS set_key';
    EXECUTE 'ALTER TABLE public.criteria DROP COLUMN IF EXISTS set_key';
    EXECUTE 'ALTER TABLE public.criteria_groups DROP COLUMN IF EXISTS set_key';

    -- Recreate legacy unique constraints
    EXECUTE 'ALTER TABLE public.criteria_groups ADD CONSTRAINT criteria_groups_code_key UNIQUE (code)';
    EXECUTE 'ALTER TABLE public.criteria ADD CONSTRAINT criteria_code_key UNIQUE (code)';
    EXECUTE 'ALTER TABLE public.criteria_group_versions ADD CONSTRAINT criteria_group_versions_version_id_code_key UNIQUE (version_id, code)';
    EXECUTE 'ALTER TABLE public.criterion_versions ADD CONSTRAINT criterion_versions_version_id_code_key UNIQUE (version_id, code)';

    -- Restore exact pre-migration direct DML privileges from captured session setting
    v_captured_acl := NULLIF(current_setting('kurabe.p108_pre_migration_acl', true), '');
    IF v_captured_acl IS NULL THEN
      RAISE EXCEPTION 'P108_SCHEMA_ROLLBACK_REFUSED: exact pre-migration ACL capture is required in kurabe.p108_pre_migration_acl';
    END IF;

    v_acl_json := v_captured_acl::jsonb;
    IF jsonb_typeof(v_acl_json) <> 'array' THEN
      RAISE EXCEPTION 'P108_SCHEMA_ROLLBACK_REFUSED: kurabe.p108_pre_migration_acl must be a JSON array';
    END IF;

    FOR v_grant IN SELECT value FROM jsonb_array_elements(v_acl_json) LOOP
      IF (v_grant->>'table_name') = ANY(v_allowed_tables)
         AND (v_grant->>'privilege_type') = ANY(v_allowed_privs)
         AND (v_grant->>'grantee') = ANY(v_allowed_grantees) THEN
        IF (v_grant->>'grantee') = 'PUBLIC' THEN
          EXECUTE format('GRANT %s ON TABLE public.%I TO PUBLIC', v_grant->>'privilege_type', v_grant->>'table_name');
        ELSE
          EXECUTE format('GRANT %s ON TABLE public.%I TO %I', v_grant->>'privilege_type', v_grant->>'table_name', v_grant->>'grantee');
        END IF;
      ELSE
        RAISE EXCEPTION 'P108_SCHEMA_ROLLBACK_REFUSED: invalid grant entry in captured ACL: %', v_grant;
      END IF;
    END LOOP;

    -- Restore previous P99 function bodies
    EXECUTE $fn$
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
    $fn$;

    EXECUTE 'COMMENT ON FUNCTION public.validate_criteria_config(jsonb) IS ''kurabe:p99m3t02:candidate:v1:function:validate_criteria_config''';

    EXECUTE $fn$
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
    $fn$;

    EXECUTE 'COMMENT ON FUNCTION public.get_active_criteria_config() IS ''kurabe:p99m3t02:candidate:v1:function:get_active_criteria_config''';

    EXECUTE $fn$
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
    $fn$;

    EXECUTE 'COMMENT ON FUNCTION public.save_criteria_config(jsonb, bigint) IS ''kurabe:p99m3t02:candidate:v1:function:save_criteria_config''';

  ELSE
    RAISE EXCEPTION 'P108_ROLLBACK_INVALID_ACTION: unknown action %, expected revert-import or schema', v_action;
  END IF;
END $$;

COMMIT;
