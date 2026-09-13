BEGIN;

DO $$
BEGIN
  IF current_setting('kurabe.p102m3t06_rollback_approved', true) IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'P102M3T06_ROLLBACK_UNAPPROVED: set kurabe.p102m3t06_rollback_approved=true in the approved rollback session';
  END IF;
END;
$$;

-- Fail-closed rollback for P102M3T06. Existing ai_summaries.summary rows are retained.
DO $$
DECLARE
  v_oid oid;
  v_owner name;
  v_comment text;
  v_prosrc text;
  v_proconfig text[];
  v_prosecdef boolean;
  v_body_hash text;
BEGIN
  SELECT p.oid, pg_get_userbyid(p.proowner), obj_description(p.oid, 'pg_proc'),
         p.prosrc, p.proconfig, p.prosecdef
  INTO v_oid, v_owner, v_comment, v_prosrc, v_proconfig, v_prosecdef
  FROM pg_proc AS p
  WHERE p.oid = to_regprocedure(
    'public.upsert_ai_summary_if_active(uuid,text,uuid,text,integer,integer,integer,boolean,jsonb,text,timestamptz)'
  );

  IF v_oid IS NULL THEN
    RAISE EXCEPTION 'P102M3T06_ROLLBACK_PREFLIGHT_FAILED: summary upsert function is missing';
  END IF;
  IF v_owner <> 'postgres' OR v_prosecdef IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'P102M3T06_ROLLBACK_PREFLIGHT_FAILED: owner/security-definer mismatch';
  END IF;
  IF v_comment IS DISTINCT FROM 'kurabe:p102m3t06:candidate:v1:active-period-summary-upsert' THEN
    RAISE EXCEPTION 'P102M3T06_ROLLBACK_PREFLIGHT_FAILED: function provenance mismatch';
  END IF;
  IF NOT ('search_path=public' = ANY(COALESCE(v_proconfig, ARRAY[]::text[]))) THEN
    RAISE EXCEPTION 'P102M3T06_ROLLBACK_PREFLIGHT_FAILED: search_path mismatch';
  END IF;

  v_body_hash := md5(regexp_replace(v_prosrc, '"?[A-Za-z_][A-Za-z0-9_]*"?[.]', 'SCHEMA.', 'g'));
  IF v_body_hash <> '4f2f7f8065bcb1e6303cae51744bb2e2' THEN
    RAISE EXCEPTION 'P102M3T06_ROLLBACK_PREFLIGHT_FAILED: function body provenance mismatch';
  END IF;

  IF to_regclass('public.ai_summaries') IS NULL THEN
    RAISE EXCEPTION 'P102M3T06_ROLLBACK_PREFLIGHT_FAILED: ai_summaries is missing';
  END IF;
END;
$$;

DROP FUNCTION public.upsert_ai_summary_if_active(uuid,text,uuid,text,integer,integer,integer,boolean,jsonb,text,timestamptz);

ALTER TABLE public.ai_summaries
  DROP CONSTRAINT ai_summaries_coverage_truth_check,
  DROP CONSTRAINT ai_summaries_coverage_counts_check,
  DROP CONSTRAINT ai_summaries_coverage_status_check,
  DROP COLUMN source_generated_at,
  DROP COLUMN source_revision,
  DROP COLUMN coverage_fields,
  DROP COLUMN coverage_truncated,
  DROP COLUMN coverage_dropped_items,
  DROP COLUMN coverage_fitted_items,
  DROP COLUMN coverage_total_items,
  DROP COLUMN coverage_status;

DO $$
BEGIN
  IF to_regclass('public.ai_summaries') IS NULL THEN
    RAISE EXCEPTION 'P102M3T06_ROLLBACK_FAILED: ai_summaries was removed';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM pg_attribute
    WHERE attrelid = to_regclass('public.ai_summaries')
      AND attname = 'summary'
      AND NOT attisdropped
  ) THEN
    RAISE EXCEPTION 'P102M3T06_ROLLBACK_FAILED: existing summary column was not preserved';
  END IF;
  IF to_regprocedure('public.upsert_ai_summary_if_active(uuid,text,uuid,text,integer,integer,integer,boolean,jsonb,text,timestamptz)') IS NOT NULL THEN
    RAISE EXCEPTION 'P102M3T06_ROLLBACK_FAILED: summary upsert function remains';
  END IF;
END;
$$;

COMMIT;
