BEGIN;

-- P102M3T06: truthful persistent AI summary coverage and source revision.
DO $$
BEGIN
  IF to_regclass('public.ai_summaries') IS NULL THEN
    RAISE EXCEPTION 'P102M3T06_PREFLIGHT_FAILED: ai_summaries is missing';
  END IF;
  IF to_regclass('public.evaluation_periods') IS NULL THEN
    RAISE EXCEPTION 'P102M3T06_PREFLIGHT_FAILED: evaluation_periods is missing';
  END IF;
  IF to_regprocedure('public.upsert_ai_summary_if_active(uuid,text,uuid,text,integer,integer,integer,boolean,jsonb,text,timestamptz)') IS NOT NULL THEN
    RAISE EXCEPTION 'P102M3T06_PREFLIGHT_FAILED: actor-aware summary RPC already exists';
  END IF;
END;
$$;

ALTER TABLE public.ai_summaries
  ADD COLUMN coverage_status text NOT NULL DEFAULT 'unknown',
  ADD COLUMN coverage_total_items integer NOT NULL DEFAULT 0,
  ADD COLUMN coverage_fitted_items integer NOT NULL DEFAULT 0,
  ADD COLUMN coverage_dropped_items integer NOT NULL DEFAULT 0,
  ADD COLUMN coverage_truncated boolean NOT NULL DEFAULT false,
  ADD COLUMN coverage_fields jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN source_revision text,
  ADD COLUMN source_generated_at timestamptz;

ALTER TABLE public.ai_summaries
  ADD CONSTRAINT ai_summaries_coverage_status_check
    CHECK (coverage_status IN ('complete', 'partial', 'unknown')),
  ADD CONSTRAINT ai_summaries_coverage_counts_check
    CHECK (
      coverage_total_items >= 0
      AND coverage_fitted_items >= 0
      AND coverage_dropped_items >= 0
      AND coverage_fitted_items <= coverage_total_items
    ),
  ADD CONSTRAINT ai_summaries_coverage_truth_check
    CHECK (
      coverage_status = 'unknown'
      OR (
        source_revision IS NOT NULL
        AND source_generated_at IS NOT NULL
        AND (
          (coverage_status = 'complete' AND coverage_truncated = false)
          OR (coverage_status = 'partial' AND coverage_truncated = true)
        )
      )
    );

COMMENT ON COLUMN public.ai_summaries.coverage_status IS
  'kurabe:p102m3t06:candidate:v1:summary-coverage-status; legacy rows are unknown';
COMMENT ON COLUMN public.ai_summaries.coverage_fields IS
  'kurabe:p102m3t06:candidate:v1:per-field-truncation-metadata';
COMMENT ON COLUMN public.ai_summaries.source_revision IS
  'kurabe:p102m3t06:candidate:v1:submitted-input-source-revision';
COMMENT ON COLUMN public.ai_summaries.source_generated_at IS
  'kurabe:p102m3t06:candidate:v1:submitted-input-capture-time';

CREATE OR REPLACE FUNCTION public.upsert_ai_summary_if_active(
  p_period_id uuid,
  p_summary text,
  p_created_by uuid,
  p_coverage_status text,
  p_coverage_total_items integer,
  p_coverage_fitted_items integer,
  p_coverage_dropped_items integer,
  p_coverage_truncated boolean,
  p_coverage_fields jsonb,
  p_source_revision text,
  p_source_generated_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
  v_result jsonb;
BEGIN
  IF p_period_id IS NULL OR p_summary IS NULL OR p_created_by IS NULL THEN
    RAISE EXCEPTION 'P102M3T06_WRITE_REJECTED: required summary identity is missing';
  END IF;
  IF p_coverage_status NOT IN ('complete', 'partial') THEN
    RAISE EXCEPTION 'P102M3T06_WRITE_REJECTED: new summaries require complete or partial coverage';
  END IF;
  IF p_coverage_total_items IS NULL OR p_coverage_fitted_items IS NULL OR p_coverage_dropped_items IS NULL
     OR p_coverage_total_items < 0 OR p_coverage_fitted_items < 0 OR p_coverage_dropped_items < 0
     OR p_coverage_fitted_items > p_coverage_total_items THEN
    RAISE EXCEPTION 'P102M3T06_WRITE_REJECTED: coverage counts are invalid';
  END IF;
  IF p_coverage_status = 'complete' AND p_coverage_truncated IS TRUE THEN
    RAISE EXCEPTION 'P102M3T06_WRITE_REJECTED: complete coverage cannot be truncated';
  END IF;
  IF p_coverage_status = 'partial' AND p_coverage_truncated IS NOT TRUE THEN
    RAISE EXCEPTION 'P102M3T06_WRITE_REJECTED: partial coverage must be marked truncated';
  END IF;
  IF p_source_revision IS NULL OR length(p_source_revision) <> 64 OR p_source_generated_at IS NULL
     OR jsonb_typeof(p_coverage_fields) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'P102M3T06_WRITE_REJECTED: source or field metadata is invalid';
  END IF;

  -- Serialize the exact active check and summary upsert against period close.
  SELECT status INTO v_status
  FROM public.evaluation_periods
  WHERE id = p_period_id
  FOR UPDATE;

  IF v_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'P102M3T06_WRITE_REJECTED: period is not active';
  END IF;

  INSERT INTO public.ai_summaries (
    period_id,
    summary,
    created_by,
    created_at,
    coverage_status,
    coverage_total_items,
    coverage_fitted_items,
    coverage_dropped_items,
    coverage_truncated,
    coverage_fields,
    source_revision,
    source_generated_at
  ) VALUES (
    p_period_id,
    p_summary,
    p_created_by,
    now(),
    p_coverage_status,
    p_coverage_total_items,
    p_coverage_fitted_items,
    p_coverage_dropped_items,
    p_coverage_truncated,
    p_coverage_fields,
    p_source_revision,
    p_source_generated_at
  )
  ON CONFLICT (period_id) DO UPDATE SET
    summary = EXCLUDED.summary,
    created_by = EXCLUDED.created_by,
    created_at = EXCLUDED.created_at,
    coverage_status = EXCLUDED.coverage_status,
    coverage_total_items = EXCLUDED.coverage_total_items,
    coverage_fitted_items = EXCLUDED.coverage_fitted_items,
    coverage_dropped_items = EXCLUDED.coverage_dropped_items,
    coverage_truncated = EXCLUDED.coverage_truncated,
    coverage_fields = EXCLUDED.coverage_fields,
    source_revision = EXCLUDED.source_revision,
    source_generated_at = EXCLUDED.source_generated_at
  RETURNING jsonb_build_object(
    'coverage_status', coverage_status,
    'coverage_total_items', coverage_total_items,
    'coverage_fitted_items', coverage_fitted_items,
    'coverage_dropped_items', coverage_dropped_items,
    'coverage_truncated', coverage_truncated,
    'coverage_fields', coverage_fields,
    'source_revision', source_revision,
    'source_generated_at', source_generated_at
  ) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_ai_summary_if_active(uuid,text,uuid,text,integer,integer,integer,boolean,jsonb,text,timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_ai_summary_if_active(uuid,text,uuid,text,integer,integer,integer,boolean,jsonb,text,timestamptz) TO service_role, postgres;
COMMENT ON FUNCTION public.upsert_ai_summary_if_active(uuid,text,uuid,text,integer,integer,integer,boolean,jsonb,text,timestamptz) IS
  'kurabe:p102m3t06:candidate:v1:active-period-summary-upsert';

COMMIT;
