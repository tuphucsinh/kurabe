-- P99M3T02 candidate rollback. Candidate/disposable only; never run on production without
-- explicit approval and a separately verified rollback gate.
BEGIN;

DO $$
DECLARE
  v_comment text;
  v_version_one uuid;
BEGIN
  IF current_setting('kurabe.p99m3t02_rollback_approved', true) IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'P99M3T02_ROLLBACK_BLOCKED: explicit rollback approval is required';
  END IF;

  IF to_regclass('public.criteria_config_versions') IS NULL
     OR to_regclass('public.criteria_group_versions') IS NULL
     OR to_regclass('public.criterion_versions') IS NULL
     OR to_regclass('public.criterion_level_versions') IS NULL
     OR to_regclass('public.criterion_audience_versions') IS NULL THEN
    RAISE EXCEPTION 'P99M3T02_ROLLBACK_BLOCKED: candidate version tables are missing';
  END IF;

  SELECT description INTO v_comment
  FROM pg_description
  WHERE objoid = 'public.save_criteria_config(jsonb,bigint)'::regprocedure
    AND classoid = 'pg_proc'::regclass AND objsubid = 0;
  IF v_comment IS DISTINCT FROM 'kurabe:p99m3t02:candidate:v1:function:save_criteria_config' THEN
    RAISE EXCEPTION 'P99M3T02_ROLLBACK_BLOCKED: save function provenance mismatch';
  END IF;

  SELECT id INTO v_version_one
  FROM public.criteria_config_versions
  WHERE version_no = 1;
  IF v_version_one IS NULL THEN
    RAISE EXCEPTION 'P99M3T02_ROLLBACK_BLOCKED: baseline criteria version is missing';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.evaluation_rounds
    WHERE criteria_config_version_id IS NOT NULL
      AND criteria_config_version_id <> v_version_one
  ) THEN
    RAISE EXCEPTION 'P99M3T02_ROLLBACK_BLOCKED: submitted or initialized rounds reference a post-baseline criteria version';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.evaluation_responses r
    WHERE NOT EXISTS (
      SELECT 1 FROM public.criterion_level_versions l
      WHERE l.version_id = v_version_one AND l.level_id = r.level_id
    )
      AND r.level_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'P99M3T02_ROLLBACK_BLOCKED: responses reference post-baseline criterion levels';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.evaluation_responses r
    WHERE NOT EXISTS (
      SELECT 1 FROM public.criterion_versions c
      WHERE c.version_id = v_version_one AND c.criterion_id = r.criterion_id
    )
      AND r.criterion_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'P99M3T02_ROLLBACK_BLOCKED: responses reference post-baseline criteria';
  END IF;

  PERFORM set_config('kurabe.criteria_config_write', 'true', true);

  -- Remove only rows introduced after version 1, deepest dependencies first.
  DELETE FROM public.criterion_audiences a
  WHERE NOT EXISTS (
    SELECT 1 FROM public.criterion_audience_versions v
    WHERE v.version_id = v_version_one AND v.criterion_id = a.criterion_id AND v.audience = a.audience
  );
  DELETE FROM public.criterion_levels l
  WHERE NOT EXISTS (
    SELECT 1 FROM public.criterion_level_versions v
    WHERE v.version_id = v_version_one AND v.level_id = l.id
  );
  DELETE FROM public.criteria c
  WHERE NOT EXISTS (
    SELECT 1 FROM public.criterion_versions v
    WHERE v.version_id = v_version_one AND v.criterion_id = c.id
  );
  DELETE FROM public.criteria_groups g
  WHERE NOT EXISTS (
    SELECT 1 FROM public.criteria_group_versions v
    WHERE v.version_id = v_version_one AND v.group_id = g.id
  );

  UPDATE public.criteria_groups g
  SET code = v.code, name = v.name, short_name = v.short_name,
      sort_order = v.sort_order, is_active = true
  FROM public.criteria_group_versions v
  WHERE v.version_id = v_version_one AND v.group_id = g.id;
  UPDATE public.criteria c
  SET group_id = v.group_id, code = v.code, name = v.name,
      description = v.description, applies_to = v.applies_to, weight = v.weight,
      default_level_index = v.default_level_index, sort_order = v.sort_order, is_active = true
  FROM public.criterion_versions v
  WHERE v.version_id = v_version_one AND v.criterion_id = c.id;
  UPDATE public.criterion_levels l
  SET criterion_id = v.criterion_id, points = v.points, label = v.label,
      description = v.description, sort_order = v.sort_order, is_active = true
  FROM public.criterion_level_versions v
  WHERE v.version_id = v_version_one AND v.level_id = l.id;
  UPDATE public.criterion_audiences a
  SET is_active = true
  FROM public.criterion_audience_versions v
  WHERE v.version_id = v_version_one AND v.criterion_id = a.criterion_id AND v.audience = a.audience;

  DROP TRIGGER IF EXISTS evaluation_rounds_pin_criteria_config_version ON public.evaluation_rounds;
  DROP TRIGGER IF EXISTS criteria_default_level_index_guard ON public.criteria;

  ALTER TABLE public.evaluation_rounds
    DROP CONSTRAINT IF EXISTS evaluation_rounds_criteria_config_version_id_fkey;
  ALTER TABLE public.evaluation_rounds DROP COLUMN IF EXISTS criteria_config_version_id;

  DROP FUNCTION IF EXISTS public.save_evaluation_round_transaction_active_only(uuid, integer, uuid, jsonb, jsonb, text, numeric, text, boolean, timestamptz, integer, uuid, text, text, boolean, uuid);
  DROP FUNCTION IF EXISTS public.pin_criteria_config_version();
  DROP FUNCTION IF EXISTS public.guard_criteria_default_level_index();
  DROP FUNCTION IF EXISTS public.save_criteria_config(jsonb, bigint);
  DROP FUNCTION IF EXISTS public.get_active_criteria_config();
  DROP FUNCTION IF EXISTS public.validate_criteria_config(jsonb);

  DROP TABLE public.criterion_audience_versions;
  DROP TABLE public.criterion_level_versions;
  DROP TABLE public.criterion_versions;
  DROP TABLE public.criteria_group_versions;
  DROP TABLE public.criteria_config_versions;

  ALTER TABLE public.criteria_groups DROP COLUMN IF EXISTS is_active;
  ALTER TABLE public.criteria DROP COLUMN IF EXISTS is_active;
  ALTER TABLE public.criterion_levels DROP COLUMN IF EXISTS is_active;
  ALTER TABLE public.criterion_audiences DROP COLUMN IF EXISTS is_active;

  ALTER TABLE public.criteria DROP CONSTRAINT IF EXISTS criteria_default_level_index_supported_check;
  ALTER TABLE public.criteria DROP CONSTRAINT IF EXISTS criteria_weight_supported_check;
  ALTER TABLE public.criteria DROP CONSTRAINT IF EXISTS criteria_sort_order_supported_check;
  ALTER TABLE public.criteria_groups DROP CONSTRAINT IF EXISTS criteria_groups_sort_order_supported_check;
  ALTER TABLE public.criterion_levels DROP CONSTRAINT IF EXISTS criterion_levels_points_supported_check;
  ALTER TABLE public.criterion_levels DROP CONSTRAINT IF EXISTS criterion_levels_sort_order_supported_check;
END $$;

COMMIT;
