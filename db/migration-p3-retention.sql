-- ============================================================
-- CANDIDATE ONLY — NOT APPLIED
-- Kurabe Data Retention Policy & Purge Routine
-- DO NOT EXECUTE DIRECTLY WITHOUT EXPLICIT MIGRATION & PRIVACY POLICY APPROVAL
-- ============================================================

-- ------------------------------------------------------------
-- RETENTION POLICY SPECIFICATION (Constants & Boundaries)
-- ------------------------------------------------------------
-- 1. SESSIONS: Grace period of 7 days after expires_at.
--    Purges expired sessions that are older than cutoff.
-- 2. LOGIN_ATTEMPTS: 30 days operational telemetry.
--    Retains brute-force analysis window while discarding obsolete attempt logs.
-- 3. AI_USAGE: 60 days operational rate-limiting history.
--    Retains quota tracking metrics while discarding older AI invocation logs.
-- 4. CHAT_REPORTS: 90 days privacy-conscious retention.
--    Binds privacy retention window for support reports.
-- 5. AUDIT_LOGS: 365 days (1 year) compliance retention.
--    Retains long-term administrative accountability while pruning aged telemetry.
--
-- STRICT IMMUTABILITY SAFEGUARD:
-- The following core domain and historical tables MUST NEVER be deleted by purge:
-- - public.evaluations
-- - public.evaluation_rounds
-- - public.evaluation_responses
-- - public.users
-- - public.teams
-- - public.evaluation_periods
-- - public.criteria
-- - public.criteria_groups
-- - public.criterion_levels
-- - public.criterion_audiences
-- - public.grade_bands
-- - public.ai_summaries
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.purge_kurabe_retention(
  p_as_of timestamptz DEFAULT now()
)
RETURNS TABLE (
  table_name text,
  deleted_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_as_of timestamptz;
  v_sessions_cutoff timestamptz;
  v_login_attempts_cutoff timestamptz;
  v_ai_usage_cutoff timestamptz;
  v_chat_reports_cutoff timestamptz;
  v_audit_logs_cutoff timestamptz;

  v_deleted_sessions bigint := 0;
  v_deleted_login_attempts bigint := 0;
  v_deleted_ai_usage bigint := 0;
  v_deleted_chat_reports bigint := 0;
  v_deleted_audit_logs bigint := 0;
BEGIN
  -- 1. Validate as_of parameter (Fail closed on invalid timestamp)
  IF p_as_of IS NULL THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: p_as_of timestamp cannot be null';
  END IF;

  -- Guard against timestamps far in the future (> 1 day ahead) or unreasonable historic dates (< year 2020)
  IF p_as_of > (now() + INTERVAL '1 day') OR p_as_of < '2020-01-01 00:00:00+00'::timestamptz THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: p_as_of timestamp % is out of reasonable range', p_as_of;
  END IF;

  v_as_of := p_as_of;

  -- 2. Define Cutoff Windows
  -- Sessions: Purge tokens expired for more than 7 days
  v_sessions_cutoff := v_as_of - INTERVAL '7 days';
  -- Login attempts: 30 days retention
  v_login_attempts_cutoff := v_as_of - INTERVAL '30 days';
  -- AI usage telemetry: 60 days retention
  v_ai_usage_cutoff := v_as_of - INTERVAL '60 days';
  -- Chat reports (privacy): 90 days retention
  v_chat_reports_cutoff := v_as_of - INTERVAL '90 days';
  -- Audit logs (compliance): 365 days retention
  v_audit_logs_cutoff := v_as_of - INTERVAL '365 days';

  -- 3. Execute bounded deletions only on allowlisted operational tables

  -- Target 1: Expired sessions (expires_at past grace cutoff)
  DELETE FROM public.sessions
  WHERE expires_at < v_sessions_cutoff;
  GET DIAGNOSTICS v_deleted_sessions = ROW_COUNT;

  -- Target 2: Bounded login attempts history
  DELETE FROM public.login_attempts
  WHERE attempted_at < v_login_attempts_cutoff;
  GET DIAGNOSTICS v_deleted_login_attempts = ROW_COUNT;

  -- Target 3: Bounded AI usage telemetry
  DELETE FROM public.ai_usage
  WHERE created_at < v_ai_usage_cutoff;
  GET DIAGNOSTICS v_deleted_ai_usage = ROW_COUNT;

  -- Target 4: Bounded chat support reports (privacy retention)
  DELETE FROM public.chat_reports
  WHERE created_at < v_chat_reports_cutoff;
  GET DIAGNOSTICS v_deleted_chat_reports = ROW_COUNT;

  -- Target 5: Aged audit logs (compliance retention)
  DELETE FROM public.audit_logs
  WHERE created_at < v_audit_logs_cutoff;
  GET DIAGNOSTICS v_deleted_audit_logs = ROW_COUNT;

  -- 4. Return per-table deleted counts
  RETURN QUERY
  SELECT 'sessions'::text AS table_name, v_deleted_sessions AS deleted_count
  UNION ALL
  SELECT 'login_attempts'::text AS table_name, v_deleted_login_attempts AS deleted_count
  UNION ALL
  SELECT 'ai_usage'::text AS table_name, v_deleted_ai_usage AS deleted_count
  UNION ALL
  SELECT 'chat_reports'::text AS table_name, v_deleted_chat_reports AS deleted_count
  UNION ALL
  SELECT 'audit_logs'::text AS table_name, v_deleted_audit_logs AS deleted_count;
END;
$$;

-- ------------------------------------------------------------
-- SECURITY & PERMISSIONS
-- ------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.purge_kurabe_retention(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_kurabe_retention(timestamptz) TO service_role;
