BEGIN;

-- ============================================================
-- Kurabe P108 Criteria Sets Architecture (P108M1T03)
-- Independent sets for Leader, Staff, and Worker with global version stream.
-- ============================================================

-- ------------------------------------------------------------
-- 1. PREFLIGHT CHECKS (Fail-Closed One-Shot)
-- ------------------------------------------------------------
DO $$
DECLARE
  v_con_cg text;
  v_con_c text;
  v_con_cgv text;
  v_con_cv text;
  v_count integer;
  v_dup_group text;
  v_dup_crit text;
BEGIN
  -- 1. Required tables exist
  IF to_regclass('public.criteria') IS NULL
     OR to_regclass('public.criteria_groups') IS NULL
     OR to_regclass('public.criterion_levels') IS NULL
     OR to_regclass('public.criterion_audiences') IS NULL
     OR to_regclass('public.criteria_config_versions') IS NULL
     OR to_regclass('public.criteria_group_versions') IS NULL
     OR to_regclass('public.criterion_versions') IS NULL
     OR to_regclass('public.criterion_level_versions') IS NULL
     OR to_regclass('public.criterion_audience_versions') IS NULL
     OR to_regclass('public.evaluation_periods') IS NULL
     OR to_regclass('public.evaluation_rounds') IS NULL THEN
    RAISE EXCEPTION 'P108M1T03_PREFLIGHT_FAILED: required criteria/evaluation tables are missing';
  END IF;

  -- 2. Required P99 functions exist with provenance comments
  IF to_regprocedure('public.validate_criteria_config(jsonb)') IS NULL
     OR obj_description('public.validate_criteria_config(jsonb)'::regprocedure, 'pg_proc')
        IS DISTINCT FROM 'kurabe:p99m3t02:candidate:v1:function:validate_criteria_config' THEN
    RAISE EXCEPTION 'P108M1T03_PREFLIGHT_FAILED: validate_criteria_config provenance mismatch or missing';
  END IF;

  IF to_regprocedure('public.get_active_criteria_config()') IS NULL
     OR obj_description('public.get_active_criteria_config()'::regprocedure, 'pg_proc')
        IS DISTINCT FROM 'kurabe:p99m3t02:candidate:v1:function:get_active_criteria_config' THEN
    RAISE EXCEPTION 'P108M1T03_PREFLIGHT_FAILED: get_active_criteria_config provenance mismatch or missing';
  END IF;

  IF to_regprocedure('public.save_criteria_config(jsonb, bigint)') IS NULL
     OR obj_description('public.save_criteria_config(jsonb, bigint)'::regprocedure, 'pg_proc')
        IS DISTINCT FROM 'kurabe:p99m3t02:candidate:v1:function:save_criteria_config' THEN
    RAISE EXCEPTION 'P108M1T03_PREFLIGHT_FAILED: save_criteria_config provenance mismatch or missing';
  END IF;

  -- 3. Evaluation writer present with P107 or P99 provenance comment
  IF to_regprocedure('public.save_evaluation_round_transaction_active_only(uuid, integer, uuid, jsonb, jsonb, text, numeric, text, boolean, timestamptz, integer, uuid, text, text, boolean, uuid, uuid)') IS NOT NULL THEN
    IF obj_description('public.save_evaluation_round_transaction_active_only(uuid, integer, uuid, jsonb, jsonb, text, numeric, text, boolean, timestamptz, integer, uuid, text, text, boolean, uuid, uuid)'::regprocedure, 'pg_proc')
       IS DISTINCT FROM 'kurabe:p107m1t07:candidate:v1:function:save_evaluation_round_transaction_active_only' THEN
      RAISE EXCEPTION 'P108M1T03_PREFLIGHT_FAILED: P107 evaluation writer provenance mismatch';
    END IF;
  ELSIF to_regprocedure('public.save_evaluation_round_transaction_active_only(uuid, integer, uuid, jsonb, jsonb, text, numeric, text, boolean, timestamptz, integer, uuid, text, text, boolean, uuid)') IS NOT NULL THEN
    IF obj_description('public.save_evaluation_round_transaction_active_only(uuid, integer, uuid, jsonb, jsonb, text, numeric, text, boolean, timestamptz, integer, uuid, text, text, boolean, uuid)'::regprocedure, 'pg_proc')
       IS DISTINCT FROM 'kurabe:p99m3t02:candidate:v1:function:save_evaluation_round_transaction_active_only:criteria-version-aware' THEN
      RAISE EXCEPTION 'P108M1T03_PREFLIGHT_FAILED: P99 evaluation writer provenance mismatch';
    END IF;
  ELSE
    RAISE EXCEPTION 'P108M1T03_PREFLIGHT_FAILED: evaluation writer function is missing';
  END IF;

  -- 4. Exactly one constraint matches each legacy unique definition
  SELECT count(*), max(c.conname) INTO v_count, v_con_cg
  FROM pg_constraint c
  WHERE c.conrelid = 'public.criteria_groups'::regclass
    AND c.contype = 'u'
    AND pg_get_constraintdef(c.oid) = 'UNIQUE (code)';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'P108M1T03_PREFLIGHT_FAILED: expected exactly 1 UNIQUE(code) constraint on criteria_groups, found %', v_count;
  END IF;

  SELECT count(*), max(c.conname) INTO v_count, v_con_c
  FROM pg_constraint c
  WHERE c.conrelid = 'public.criteria'::regclass
    AND c.contype = 'u'
    AND pg_get_constraintdef(c.oid) = 'UNIQUE (code)';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'P108M1T03_PREFLIGHT_FAILED: expected exactly 1 UNIQUE(code) constraint on criteria, found %', v_count;
  END IF;

  SELECT count(*), max(c.conname) INTO v_count, v_con_cgv
  FROM pg_constraint c
  WHERE c.conrelid = 'public.criteria_group_versions'::regclass
    AND c.contype = 'u'
    AND pg_get_constraintdef(c.oid) = 'UNIQUE (version_id, code)';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'P108M1T03_PREFLIGHT_FAILED: expected exactly 1 UNIQUE(version_id, code) constraint on criteria_group_versions, found %', v_count;
  END IF;

  SELECT count(*), max(c.conname) INTO v_count, v_con_cv
  FROM pg_constraint c
  WHERE c.conrelid = 'public.criterion_versions'::regclass
    AND c.contype = 'u'
    AND pg_get_constraintdef(c.oid) = 'UNIQUE (version_id, code)';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'P108M1T03_PREFLIGHT_FAILED: expected exactly 1 UNIQUE(version_id, code) constraint on criterion_versions, found %', v_count;
  END IF;

  -- 5. No duplicate normalized active codes in live tables
  SELECT upper(btrim(code)) INTO v_dup_group
  FROM public.criteria_groups
  WHERE is_active
  GROUP BY upper(btrim(code))
  HAVING count(*) > 1
  LIMIT 1;
  IF v_dup_group IS NOT NULL THEN
    RAISE EXCEPTION 'P108M1T03_PREFLIGHT_FAILED: duplicate normalized active code in criteria_groups: %', v_dup_group;
  END IF;

  SELECT upper(btrim(code)) INTO v_dup_crit
  FROM public.criteria
  WHERE is_active
  GROUP BY upper(btrim(code))
  HAVING count(*) > 1
  LIMIT 1;
  IF v_dup_crit IS NOT NULL THEN
    RAISE EXCEPTION 'P108M1T03_PREFLIGHT_FAILED: duplicate normalized active code in criteria: %', v_dup_crit;
  END IF;

  -- 6. Fail-closed on unexpected grantees holding direct DML privileges on criteria tables
  IF EXISTS (
    SELECT 1
    FROM information_schema.table_privileges
    WHERE table_schema = 'public'
      AND table_name IN (
        'criteria', 'criteria_groups', 'criterion_audiences', 'criterion_levels',
        'criteria_config_versions', 'criteria_group_versions', 'criterion_versions',
        'criterion_level_versions', 'criterion_audience_versions'
      )
      AND privilege_type IN ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')
      AND grantee NOT IN ('anon', 'authenticated', 'service_role', 'PUBLIC', 'postgres')
  ) THEN
    RAISE EXCEPTION 'P108M1T03_PREFLIGHT_FAILED: unexpected grantee holding direct DML on criteria tables';
  END IF;
END $$;

-- ------------------------------------------------------------
-- 2. DDL SCHEMA UPGRADE
-- ------------------------------------------------------------

-- Columns for live tables
ALTER TABLE public.criteria_groups
  ADD COLUMN IF NOT EXISTS set_key text CHECK (set_key IN ('leader', 'staff', 'worker'));

ALTER TABLE public.criteria
  ADD COLUMN IF NOT EXISTS set_key text CHECK (set_key IN ('leader', 'staff', 'worker'));

-- UNIQUE(id, set_key) on criteria_groups
ALTER TABLE public.criteria_groups
  ADD CONSTRAINT criteria_groups_id_set_key_key UNIQUE (id, set_key);

-- Composite FK from criteria to criteria_groups(id, set_key)
ALTER TABLE public.criteria
  ADD CONSTRAINT criteria_group_id_set_key_fkey
  FOREIGN KEY (group_id, set_key)
  REFERENCES public.criteria_groups (id, set_key)
  ON DELETE CASCADE;

-- Replacement active-only unique indexes (replacing legacy global UNIQUE(code))
CREATE UNIQUE INDEX criteria_groups_active_set_code_uidx
  ON public.criteria_groups (COALESCE(set_key, '~legacy'), upper(btrim(code)))
  WHERE is_active;

CREATE UNIQUE INDEX criteria_active_set_code_uidx
  ON public.criteria (COALESCE(set_key, '~legacy'), upper(btrim(code)))
  WHERE is_active;

-- Columns for version tables
ALTER TABLE public.criteria_config_versions
  ADD COLUMN IF NOT EXISTS group_count integer,
  ADD COLUMN IF NOT EXISTS criterion_count integer,
  ADD COLUMN IF NOT EXISTS level_count integer,
  ADD COLUMN IF NOT EXISTS audience_count integer;

ALTER TABLE public.criteria_group_versions
  ADD COLUMN IF NOT EXISTS set_key text CHECK (set_key IN ('leader', 'staff', 'worker'));

ALTER TABLE public.criterion_versions
  ADD COLUMN IF NOT EXISTS set_key text CHECK (set_key IN ('leader', 'staff', 'worker'));

-- Version table partial unique indexes
CREATE UNIQUE INDEX criteria_group_versions_legacy_uidx
  ON public.criteria_group_versions (version_id, code)
  WHERE set_key IS NULL;

CREATE UNIQUE INDEX criteria_group_versions_set_code_uidx
  ON public.criteria_group_versions (version_id, set_key, code)
  WHERE set_key IS NOT NULL;

CREATE UNIQUE INDEX criterion_versions_legacy_uidx
  ON public.criterion_versions (version_id, code)
  WHERE set_key IS NULL;

CREATE UNIQUE INDEX criterion_versions_set_code_uidx
  ON public.criterion_versions (version_id, set_key, code)
  WHERE set_key IS NOT NULL;

-- Drop the four legacy unique constraints located by definition
DO $$
DECLARE
  v_con text;
BEGIN
  SELECT c.conname INTO v_con FROM pg_constraint c
  WHERE c.conrelid = 'public.criteria_groups'::regclass AND c.contype = 'u' AND pg_get_constraintdef(c.oid) = 'UNIQUE (code)';
  EXECUTE format('ALTER TABLE public.criteria_groups DROP CONSTRAINT %I', v_con);

  SELECT c.conname INTO v_con FROM pg_constraint c
  WHERE c.conrelid = 'public.criteria'::regclass AND c.contype = 'u' AND pg_get_constraintdef(c.oid) = 'UNIQUE (code)';
  EXECUTE format('ALTER TABLE public.criteria DROP CONSTRAINT %I', v_con);

  SELECT c.conname INTO v_con FROM pg_constraint c
  WHERE c.conrelid = 'public.criteria_group_versions'::regclass AND c.contype = 'u' AND pg_get_constraintdef(c.oid) = 'UNIQUE (version_id, code)';
  EXECUTE format('ALTER TABLE public.criteria_group_versions DROP CONSTRAINT %I', v_con);

  SELECT c.conname INTO v_con FROM pg_constraint c
  WHERE c.conrelid = 'public.criterion_versions'::regclass AND c.contype = 'u' AND pg_get_constraintdef(c.oid) = 'UNIQUE (version_id, code)';
  EXECUTE format('ALTER TABLE public.criterion_versions DROP CONSTRAINT %I', v_con);
END $$;

-- ------------------------------------------------------------
-- 3. EVIDENCE-DRIVEN SELECTIVE TABLE ACL CLOSURE
-- ------------------------------------------------------------
-- Selective closure for live (4) and version (5) criteria tables.
-- Covers effective PUBLIC/inheritance. Revokes proven writable table*privilege*grantee surfaces,
-- while strictly preserving SELECT on tables and all RPC EXECUTE grants.
DO $$
DECLARE
  v_rec record;
  v_tbl text;
  v_priv text;
  v_role text;
  v_tables text[] := ARRAY[
    'criteria',
    'criteria_groups',
    'criterion_audiences',
    'criterion_levels',
    'criteria_config_versions',
    'criteria_group_versions',
    'criterion_versions',
    'criterion_level_versions',
    'criterion_audience_versions'
  ];
  v_privs text[] := ARRAY['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE'];
  v_app_roles text[] := ARRAY['anon', 'authenticated', 'service_role'];
BEGIN
  -- 1. Evidence-driven selective revoke from actual grantees (anon, authenticated, service_role, PUBLIC)
  FOR v_rec IN (
    SELECT table_name, privilege_type, grantee
    FROM information_schema.table_privileges
    WHERE table_schema = 'public'
      AND table_name = ANY(v_tables)
      AND privilege_type = ANY(v_privs)
      AND grantee = ANY(ARRAY['anon', 'authenticated', 'service_role', 'PUBLIC'])
  ) LOOP
    IF v_rec.grantee = 'PUBLIC' THEN
      EXECUTE format('REVOKE %s ON TABLE public.%I FROM PUBLIC', v_rec.privilege_type, v_rec.table_name);
    ELSE
      EXECUTE format('REVOKE %s ON TABLE public.%I FROM %I', v_rec.privilege_type, v_rec.table_name, v_rec.grantee);
    END IF;
  END LOOP;

  -- 2. Verify complete effective denial across all app roles; fail closed if unexpected inherited grant persists
  FOREACH v_tbl IN ARRAY v_tables LOOP
    FOREACH v_priv IN ARRAY v_privs LOOP
      FOREACH v_role IN ARRAY v_app_roles LOOP
        IF has_table_privilege(v_role, 'public.' || v_tbl, v_priv) THEN
          RAISE EXCEPTION 'P108M1T03_ACL_CLOSURE_FAILED: unexpected inherited grant % on % for %', v_priv, v_tbl, v_role;
        END IF;
      END LOOP;
    END LOOP;
  END LOOP;
END $$;

-- ------------------------------------------------------------
-- 4. REPLACED CRITERIA CONFIG RPC FUNCTIONS
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.validate_criteria_config(p_config jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $function$
DECLARE
  v_group jsonb;
  v_criterion jsonb;
  v_level jsonb;
  v_group_id text;
  v_criterion_id text;
  v_level_id text;
  v_group_set text;
  v_crit_set text;
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

    v_group_set := v_group->>'set_key';
    IF v_group_set IS NULL OR v_group_set NOT IN ('leader', 'staff', 'worker') THEN
      RAISE EXCEPTION 'P99M3T02_INVALID_CONFIG: group set_key must be one of leader, staff, worker';
    END IF;

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

      v_crit_set := v_criterion->>'set_key';
      IF v_crit_set IS NULL OR v_crit_set NOT IN ('leader', 'staff', 'worker') THEN
        RAISE EXCEPTION 'P99M3T02_INVALID_CONFIG: criterion set_key must be one of leader, staff, worker';
      END IF;

      IF v_crit_set IS DISTINCT FROM v_group_set THEN
        RAISE EXCEPTION 'P99M3T02_INVALID_CONFIG: criterion set must match group set';
      END IF;

      IF NULLIF(trim(v_criterion->>'code'), '') IS NULL
         OR length(trim(v_criterion->>'code')) > 100
         OR NULLIF(trim(v_criterion->>'name'), '') IS NULL
         OR length(trim(v_criterion->>'name')) > 500 THEN
        RAISE EXCEPTION 'P99M3T02_INVALID_CONFIG: criterion code and name are required and bounded';
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
IS 'kurabe:p108m1t03:candidate:v1:function:validate_criteria_config';

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
    'group_count', v_version.group_count,
    'criterion_count', v_version.criterion_count,
    'level_count', v_version.level_count,
    'audience_count', v_version.audience_count,
    'groups', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id', g.group_id, 'code', g.code, 'name', g.name, 'short_name', g.short_name,
      'sort_order', g.sort_order, 'set_key', g.set_key,
      'criteria', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id', c.criterion_id, 'group_id', c.group_id, 'code', c.code, 'name', c.name,
        'description', c.description, 'applies_to', c.applies_to, 'weight', c.weight,
        'default_level_index', c.default_level_index, 'sort_order', c.sort_order,
        'set_key', c.set_key,
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
IS 'kurabe:p108m1t03:candidate:v1:function:get_active_criteria_config';

CREATE OR REPLACE FUNCTION public.save_criteria_config(p_config jsonb, p_expected_version bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $function$
DECLARE
  v_current public.criteria_config_versions%ROWTYPE;
  v_new public.criteria_config_versions%ROWTYPE;
  v_group jsonb;
  v_criterion jsonb;
  v_level jsonb;
  v_gid uuid;
  v_cid uuid;
  v_lid uuid;
  v_g_set text;
  v_c_set text;
  v_derived_audience text;
  v_gi integer;
  v_ci integer;
  v_li integer;
  v_checksum text;
  v_canonical_json jsonb;
  v_count integer;
  v_group_count integer;
  v_criterion_count integer;
  v_level_count integer;
  v_audience_count integer;
BEGIN
  -- 1. Lock order: LOCK evaluation_periods SHARE -> advisory -> Active check -> READ COMMITTED assert
  LOCK TABLE public.evaluation_periods IN SHARE MODE;
  PERFORM pg_advisory_xact_lock(hashtext('kurabe:p99m3t02:criteria-config'));

  IF EXISTS (SELECT 1 FROM public.evaluation_periods WHERE status = 'active') THEN
    RAISE EXCEPTION 'P108_PERIOD_ACTIVE: criteria config cannot be modified while an evaluation period is active';
  END IF;

  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'P108_INVALID_ISOLATION: save_criteria_config requires READ COMMITTED isolation (current: %)', current_setting('transaction_isolation');
  END IF;

  -- 2. CAS check
  SELECT * INTO v_current FROM public.criteria_config_versions
  WHERE is_active ORDER BY version_no DESC LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'P99M3T02_CONFIG_UNAVAILABLE: no active criteria configuration'; END IF;
  IF p_expected_version IS NULL OR p_expected_version <> v_current.version_no THEN
    RAISE EXCEPTION 'P99M3T02_CONFIG_STALE: expected version %, current version %', p_expected_version, v_current.version_no;
  END IF;

  -- 3. Schema & content validation
  PERFORM public.validate_criteria_config(p_config);

  -- 4. Temp tables keyed by (set_key, code)
  DROP TABLE IF EXISTS pg_temp.p108_groups;
  DROP TABLE IF EXISTS pg_temp.p108_criteria;
  DROP TABLE IF EXISTS pg_temp.p108_levels;
  DROP TABLE IF EXISTS pg_temp.p108_audiences;

  CREATE TEMP TABLE pg_temp.p108_groups (
    id uuid PRIMARY KEY,
    set_key text NOT NULL CHECK (set_key IN ('leader', 'staff', 'worker')),
    code text NOT NULL,
    name text NOT NULL,
    short_name text,
    sort_order integer NOT NULL,
    UNIQUE (set_key, code)
  ) ON COMMIT DROP;

  CREATE TEMP TABLE pg_temp.p108_criteria (
    id uuid PRIMARY KEY,
    group_id uuid NOT NULL,
    set_key text NOT NULL CHECK (set_key IN ('leader', 'staff', 'worker')),
    code text NOT NULL,
    name text NOT NULL,
    description text,
    applies_to text NOT NULL,
    weight integer,
    default_level_index integer,
    sort_order integer NOT NULL,
    UNIQUE (set_key, code)
  ) ON COMMIT DROP;

  CREATE TEMP TABLE pg_temp.p108_levels (
    id uuid PRIMARY KEY,
    criterion_id uuid NOT NULL,
    points integer NOT NULL,
    label text NOT NULL,
    description text,
    sort_order integer NOT NULL
  ) ON COMMIT DROP;

  CREATE TEMP TABLE pg_temp.p108_audiences (
    criterion_id uuid NOT NULL,
    audience text NOT NULL,
    PRIMARY KEY (criterion_id, audience)
  ) ON COMMIT DROP;

  -- 5. Populate temp tables with set rules & server-derived audiences
  v_gi := 0;
  FOR v_group IN SELECT value FROM jsonb_array_elements(p_config->'groups') LOOP
    v_gid := COALESCE(NULLIF(v_group->>'id', '')::uuid, gen_random_uuid());
    v_g_set := v_group->>'set_key';

    -- Immutable set per UUID check
    IF EXISTS (SELECT 1 FROM public.criteria_groups WHERE id = v_gid AND set_key IS DISTINCT FROM v_g_set) THEN
      RAISE EXCEPTION 'P108_SET_IMMUTABLE: group UUID % cannot change set', v_gid;
    END IF;

    INSERT INTO pg_temp.p108_groups VALUES (
      v_gid, v_g_set, trim(v_group->>'code'), trim(v_group->>'name'),
      NULLIF(trim(v_group->>'short_name'), ''), COALESCE((v_group->>'sort_order')::integer, v_gi)
    );
    v_gi := v_gi + 1;

    v_ci := 0;
    FOR v_criterion IN SELECT value FROM jsonb_array_elements(v_group->'criteria') LOOP
      v_cid := COALESCE(NULLIF(v_criterion->>'id', '')::uuid, gen_random_uuid());
      v_c_set := v_criterion->>'set_key';

      IF EXISTS (SELECT 1 FROM public.criteria WHERE id = v_cid AND set_key IS DISTINCT FROM v_c_set) THEN
        RAISE EXCEPTION 'P108_SET_IMMUTABLE: criterion UUID % cannot change set', v_cid;
      END IF;

      -- Derived audience: leader->management, staff->employee, worker->worker
      v_derived_audience := CASE v_c_set
        WHEN 'leader' THEN 'management'
        WHEN 'staff' THEN 'employee'
        WHEN 'worker' THEN 'worker'
      END;

      INSERT INTO pg_temp.p108_criteria VALUES (
        v_cid, v_gid, v_c_set, trim(v_criterion->>'code'), trim(v_criterion->>'name'),
        NULLIF(trim(v_criterion->>'description'), ''),
        v_derived_audience,
        CASE WHEN v_criterion->>'weight' IS NULL THEN 0 ELSE (v_criterion->>'weight')::integer END,
        CASE WHEN v_criterion->>'default_level_index' IS NULL THEN NULL ELSE (v_criterion->>'default_level_index')::integer END,
        COALESCE((v_criterion->>'sort_order')::integer, v_ci)
      );
      v_ci := v_ci + 1;

      INSERT INTO pg_temp.p108_audiences VALUES (v_cid, v_derived_audience);

      v_li := 0;
      FOR v_level IN SELECT value FROM jsonb_array_elements(v_criterion->'levels') LOOP
        v_lid := COALESCE(NULLIF(v_level->>'id', '')::uuid, gen_random_uuid());
        INSERT INTO pg_temp.p108_levels VALUES (
          v_lid, v_cid, (v_level->>'points')::integer, trim(v_level->>'label'),
          NULLIF(trim(v_level->>'description'), ''), COALESCE((v_level->>'sort_order')::integer, v_li)
        );
        v_li := v_li + 1;
      END LOOP;
    END LOOP;
  END LOOP;

  -- 6. Canonical Checksum & No-op on Unchanged Content
  SELECT jsonb_build_object('groups', COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', g.id,
      'set_key', g.set_key,
      'code', g.code,
      'name', g.name,
      'short_name', g.short_name,
      'sort_order', g.sort_order,
      'criteria', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', c.id,
          'group_id', c.group_id,
          'set_key', c.set_key,
          'code', c.code,
          'name', c.name,
          'description', c.description,
          'applies_to', c.applies_to,
          'weight', c.weight,
          'default_level_index', c.default_level_index,
          'sort_order', c.sort_order,
          'audiences', COALESCE((
            SELECT jsonb_agg(a.audience ORDER BY a.audience)
            FROM pg_temp.p108_audiences a
            WHERE a.criterion_id = c.id
          ), '[]'::jsonb),
          'levels', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
              'id', l.id,
              'criterion_id', l.criterion_id,
              'points', l.points,
              'label', l.label,
              'description', l.description,
              'sort_order', l.sort_order
            ) ORDER BY l.sort_order, l.id)
            FROM pg_temp.p108_levels l
            WHERE l.criterion_id = c.id
          ), '[]'::jsonb)
        ) ORDER BY c.sort_order, c.code)
        FROM pg_temp.p108_criteria c
        WHERE c.group_id = g.id
      ), '[]'::jsonb)
    ) ORDER BY g.set_key, g.sort_order, g.code
  ), '[]'::jsonb)) INTO v_canonical_json
  FROM pg_temp.p108_groups g;

  v_checksum := encode(digest(v_canonical_json::text, 'sha256'), 'hex');

  -- If identical content, return active without creating a new version
  IF v_current.checksum = v_checksum THEN
    RETURN public.get_active_criteria_config();
  END IF;

  -- 7. Count metadata
  SELECT count(*) INTO v_group_count FROM pg_temp.p108_groups;
  SELECT count(*) INTO v_criterion_count FROM pg_temp.p108_criteria;
  SELECT count(*) INTO v_level_count FROM pg_temp.p108_levels;
  SELECT count(*) INTO v_audience_count FROM pg_temp.p108_audiences;

  INSERT INTO public.criteria_config_versions(
    version_no, checksum, is_active,
    group_count, criterion_count, level_count, audience_count
  )
  VALUES (
    v_current.version_no + 1, v_checksum, false,
    v_group_count, v_criterion_count, v_level_count, v_audience_count
  ) RETURNING * INTO v_new;

  -- 8. Atomic live projection update
  PERFORM set_config('kurabe.criteria_config_write', 'true', true);

  UPDATE public.criteria_groups SET is_active = false;
  INSERT INTO public.criteria_groups(id, set_key, code, name, short_name, sort_order, is_active)
  SELECT id, set_key, code, name, short_name, sort_order, true FROM pg_temp.p108_groups
  ON CONFLICT (id) DO UPDATE SET set_key=EXCLUDED.set_key, code=EXCLUDED.code, name=EXCLUDED.name,
    short_name=EXCLUDED.short_name, sort_order=EXCLUDED.sort_order, is_active=true;

  UPDATE public.criteria SET is_active = false;
  INSERT INTO public.criteria(id, group_id, set_key, code, name, description, applies_to, weight,
    default_level_index, sort_order, is_active)
  SELECT id, group_id, set_key, code, name, description, applies_to, weight, default_level_index,
    sort_order, true FROM pg_temp.p108_criteria
  ON CONFLICT (id) DO UPDATE SET group_id=EXCLUDED.group_id, set_key=EXCLUDED.set_key, code=EXCLUDED.code,
    name=EXCLUDED.name, description=EXCLUDED.description, applies_to=EXCLUDED.applies_to,
    weight=EXCLUDED.weight, default_level_index=EXCLUDED.default_level_index,
    sort_order=EXCLUDED.sort_order, is_active=true;

  UPDATE public.criterion_levels SET is_active = false;
  INSERT INTO public.criterion_levels(id, criterion_id, points, label, description, sort_order, is_active)
  SELECT id, criterion_id, points, label, description, sort_order, true FROM pg_temp.p108_levels
  ON CONFLICT (id) DO UPDATE SET criterion_id=EXCLUDED.criterion_id, points=EXCLUDED.points,
    label=EXCLUDED.label, description=EXCLUDED.description, sort_order=EXCLUDED.sort_order,
    is_active=true;

  UPDATE public.criterion_audiences SET is_active = false;
  INSERT INTO public.criterion_audiences(criterion_id, audience, is_active)
  SELECT criterion_id, audience, true FROM pg_temp.p108_audiences
  ON CONFLICT (criterion_id, audience) DO UPDATE SET is_active=true;

  -- 9. Insert version snapshot rows
  INSERT INTO public.criteria_group_versions(version_id, group_id, set_key, code, name, short_name, sort_order)
    SELECT v_new.id, id, set_key, code, name, short_name, sort_order FROM pg_temp.p108_groups;

  INSERT INTO public.criterion_versions(version_id, criterion_id, group_id, set_key, code, name, description,
    applies_to, weight, default_level_index, sort_order)
    SELECT v_new.id, id, group_id, set_key, code, name, description, applies_to, weight,
      default_level_index, sort_order FROM pg_temp.p108_criteria;

  INSERT INTO public.criterion_level_versions(version_id, level_id, criterion_id, points, label,
    description, sort_order)
    SELECT v_new.id, id, criterion_id, points, label, description, sort_order
      FROM pg_temp.p108_levels;

  INSERT INTO public.criterion_audience_versions(version_id, criterion_id, audience)
    SELECT v_new.id, criterion_id, audience FROM pg_temp.p108_audiences;

  -- 10. Completeness assertion
  SELECT count(*) INTO v_count FROM public.criterion_versions WHERE version_id = v_new.id;
  IF v_count <> (SELECT count(*) FROM pg_temp.p108_criteria)
     OR EXISTS (SELECT 1 FROM pg_temp.p108_criteria c
       WHERE NOT EXISTS (SELECT 1 FROM public.criterion_level_versions l
         WHERE l.version_id = v_new.id AND l.criterion_id = c.id)) THEN
    RAISE EXCEPTION 'P99M3T02_CONFIG_WRITE_FAILED: version is incomplete';
  END IF;

  UPDATE public.criteria_config_versions SET is_active = false WHERE id = v_current.id;
  UPDATE public.criteria_config_versions SET is_active = true WHERE id = v_new.id;
  RETURN public.get_active_criteria_config();

EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'P99M3T02_INVALID_CONFIG: duplicate identifier or code';
  WHEN foreign_key_violation THEN
    RAISE EXCEPTION 'P99M3T02_INVALID_CONFIG: foreign key violation';
  WHEN invalid_text_representation OR numeric_value_out_of_range THEN
    RAISE EXCEPTION 'P99M3T02_INVALID_CONFIG: unsupported number or identifier';
END;
$function$;
COMMENT ON FUNCTION public.save_criteria_config(jsonb, bigint)
IS 'kurabe:p108m1t03:candidate:v1:function:save_criteria_config';
COMMIT;
