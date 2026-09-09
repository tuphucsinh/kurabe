-- ============================================================
-- CANDIDATE ONLY — NOT APPLIED
-- KURABE QAQC — Migration P98M2T08: Fail-Safe & Proxy-Aware Login Rate Limit RPC
-- DO NOT APPLY DIRECTLY WITHOUT SEPARATE APPROVAL AND DIRECT CATALOG GATE
-- ============================================================
-- Purpose:
--   Establish candidate transactional RPC functions and indexes for login throttling:
--     1. check_login_rate_limit:
--        Evaluates account-level and network-level failed attempts within a sliding window.
--        Fail-safe, read-only pre-authentication check (avoids unnecessary bcrypt cost).
--     2. record_failed_login_transaction:
--        Atomically serializes attempt recording via transactional advisory locks.
--        Enforces dual bounded thresholds (account max 5, trusted network max 25).
--        Enforces bounded retention by pruning obsolete attempt logs (> 30 days).
--     3. clear_login_attempts:
--        Atomically resets failed attempt records upon successful credential verification.
--
-- Security & Operational Invariants:
--   1. Candidate Only: Source candidate only; do not apply directly to production.
--   2. Hermetic Transaction: Entire migration executes within a single BEGIN ... COMMIT block.
--   3. Fail-Closed Preflight:
--      - Validates public.users table exists.
--   4. Dual-Throttling (Account + Trusted Network):
--      - Account-level throttling defeats distributed IP rotation / header spoofing.
--      - Network-level throttling defeats account enumeration / credential stuffing.
--   5. Concurrency Controls:
--      - pg_advisory_xact_lock serializes concurrent attempts per account and IP.
--   6. Fixed Search Path & Privileges:
--      - SECURITY DEFINER with SET search_path = public.
--      - EXECUTE revoked from PUBLIC, anon, and authenticated.
--      - EXECUTE granted strictly to service_role.
-- ============================================================

BEGIN;

-- 1. Preflight prerequisite checks (Fail Closed)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'users'
  ) THEN
    RAISE EXCEPTION 'P98M2T08_PREFLIGHT_FAILED: public.users table not found';
  END IF;
END $$;

-- 2. Ensure login_attempts table and optimized index structures exist
CREATE TABLE IF NOT EXISTS public.login_attempts (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_code text NOT NULL,
  ip text NOT NULL,
  attempted_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_login_attempts_code_time
  ON public.login_attempts (employee_code, attempted_at);

CREATE INDEX IF NOT EXISTS idx_login_attempts_ip_time
  ON public.login_attempts (ip, attempted_at);

CREATE INDEX IF NOT EXISTS idx_login_attempts_attempted_at
  ON public.login_attempts (attempted_at);

-- 3. Function: check_login_rate_limit
CREATE OR REPLACE FUNCTION public.check_login_rate_limit(
  p_employee_code text,
  p_ip text,
  p_window_seconds integer DEFAULT 900,
  p_max_account_attempts integer DEFAULT 5,
  p_max_ip_attempts integer DEFAULT 25
)
RETURNS TABLE (
  allowed boolean,
  account_attempts integer,
  ip_attempts integer,
  locked_by text,
  retry_after_seconds integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clean_code text;
  v_clean_ip text;
  v_window_start timestamptz;
  v_account_count integer := 0;
  v_ip_count integer := 0;
  v_locked boolean := false;
  v_locked_by text := NULL;
  v_retry_after integer := 0;
  v_oldest_account_attempt timestamptz;
  v_oldest_ip_attempt timestamptz;
BEGIN
  IF p_employee_code IS NULL OR trim(p_employee_code) = '' THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: p_employee_code cannot be null or empty';
  END IF;

  IF p_ip IS NULL OR trim(p_ip) = '' THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: p_ip cannot be null or empty';
  END IF;

  v_clean_code := trim(p_employee_code);
  v_clean_ip := trim(p_ip);

  IF p_window_seconds IS NULL OR p_window_seconds <= 0 THEN
    p_window_seconds := 900;
  END IF;

  IF p_max_account_attempts IS NULL OR p_max_account_attempts <= 0 THEN
    p_max_account_attempts := 5;
  END IF;

  IF p_max_ip_attempts IS NULL OR p_max_ip_attempts <= 0 THEN
    p_max_ip_attempts := 25;
  END IF;

  v_window_start := now() - (p_window_seconds || ' seconds')::interval;

  -- 1. Account-level failure count within sliding window
  SELECT count(*)::integer, min(attempted_at)
  INTO v_account_count, v_oldest_account_attempt
  FROM public.login_attempts
  WHERE employee_code = v_clean_code
    AND attempted_at >= v_window_start;

  -- 2. Network-level failure count within sliding window
  SELECT count(*)::integer, min(attempted_at)
  INTO v_ip_count, v_oldest_ip_attempt
  FROM public.login_attempts
  WHERE ip = v_clean_ip
    AND attempted_at >= v_window_start;

  -- 3. Threshold evaluation (account priority over network)
  IF v_account_count >= p_max_account_attempts THEN
    v_locked := true;
    v_locked_by := 'account';
    IF v_oldest_account_attempt IS NOT NULL THEN
      v_retry_after := GREATEST(1, CEIL(EXTRACT(EPOCH FROM (v_oldest_account_attempt + (p_window_seconds || ' seconds')::interval - now())))::integer);
    ELSE
      v_retry_after := p_window_seconds;
    END IF;
  ELSIF v_ip_count >= p_max_ip_attempts THEN
    v_locked := true;
    v_locked_by := 'ip';
    IF v_oldest_ip_attempt IS NOT NULL THEN
      v_retry_after := GREATEST(1, CEIL(EXTRACT(EPOCH FROM (v_oldest_ip_attempt + (p_window_seconds || ' seconds')::interval - now())))::integer);
    ELSE
      v_retry_after := p_window_seconds;
    END IF;
  END IF;

  RETURN QUERY
  SELECT
    NOT v_locked AS allowed,
    v_account_count,
    v_ip_count,
    v_locked_by,
    v_retry_after;
END;
$$;

-- 4. Function: record_failed_login_transaction
CREATE OR REPLACE FUNCTION public.record_failed_login_transaction(
  p_employee_code text,
  p_ip text,
  p_window_seconds integer DEFAULT 900,
  p_max_account_attempts integer DEFAULT 5,
  p_max_ip_attempts integer DEFAULT 25
)
RETURNS TABLE (
  allowed boolean,
  account_attempts integer,
  ip_attempts integer,
  locked_by text,
  retry_after_seconds integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clean_code text;
  v_clean_ip text;
  v_window_start timestamptz;
  v_account_count integer := 0;
  v_ip_count integer := 0;
  v_locked boolean := false;
  v_locked_by text := NULL;
  v_retry_after integer := 0;
  v_oldest_account_attempt timestamptz;
  v_oldest_ip_attempt timestamptz;
BEGIN
  IF p_employee_code IS NULL OR trim(p_employee_code) = '' THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: p_employee_code cannot be null or empty';
  END IF;

  IF p_ip IS NULL OR trim(p_ip) = '' THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: p_ip cannot be null or empty';
  END IF;

  v_clean_code := trim(p_employee_code);
  v_clean_ip := trim(p_ip);

  IF p_window_seconds IS NULL OR p_window_seconds <= 0 THEN
    p_window_seconds := 900;
  END IF;

  IF p_max_account_attempts IS NULL OR p_max_account_attempts <= 0 THEN
    p_max_account_attempts := 5;
  END IF;

  IF p_max_ip_attempts IS NULL OR p_max_ip_attempts <= 0 THEN
    p_max_ip_attempts := 25;
  END IF;

  -- Concurrency control: acquire transactional advisory locks per account and IP
  PERFORM pg_advisory_xact_lock(hashtext('kurabe:login_limit:account:' || v_clean_code));
  PERFORM pg_advisory_xact_lock(hashtext('kurabe:login_limit:ip:' || v_clean_ip));

  -- Insert new failure record
  INSERT INTO public.login_attempts (employee_code, ip, attempted_at)
  VALUES (v_clean_code, v_clean_ip, now());

  -- Bounded retention: opportunistically prune entries older than 30 days
  DELETE FROM public.login_attempts
  WHERE attempted_at < (now() - interval '30 days');

  v_window_start := now() - (p_window_seconds || ' seconds')::interval;

  -- Count updated attempts within window
  SELECT count(*)::integer, min(attempted_at)
  INTO v_account_count, v_oldest_account_attempt
  FROM public.login_attempts
  WHERE employee_code = v_clean_code
    AND attempted_at >= v_window_start;

  SELECT count(*)::integer, min(attempted_at)
  INTO v_ip_count, v_oldest_ip_attempt
  FROM public.login_attempts
  WHERE ip = v_clean_ip
    AND attempted_at >= v_window_start;

  IF v_account_count >= p_max_account_attempts THEN
    v_locked := true;
    v_locked_by := 'account';
    IF v_oldest_account_attempt IS NOT NULL THEN
      v_retry_after := GREATEST(1, CEIL(EXTRACT(EPOCH FROM (v_oldest_account_attempt + (p_window_seconds || ' seconds')::interval - now())))::integer);
    ELSE
      v_retry_after := p_window_seconds;
    END IF;
  ELSIF v_ip_count >= p_max_ip_attempts THEN
    v_locked := true;
    v_locked_by := 'ip';
    IF v_oldest_ip_attempt IS NOT NULL THEN
      v_retry_after := GREATEST(1, CEIL(EXTRACT(EPOCH FROM (v_oldest_ip_attempt + (p_window_seconds || ' seconds')::interval - now())))::integer);
    ELSE
      v_retry_after := p_window_seconds;
    END IF;
  END IF;

  RETURN QUERY
  SELECT
    NOT v_locked AS allowed,
    v_account_count,
    v_ip_count,
    v_locked_by,
    v_retry_after;
END;
$$;

-- 5. Function: clear_login_attempts
CREATE OR REPLACE FUNCTION public.clear_login_attempts(
  p_employee_code text,
  p_ip text DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clean_code text;
  v_clean_ip text;
  v_deleted_count integer := 0;
BEGIN
  IF p_employee_code IS NULL OR trim(p_employee_code) = '' THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: p_employee_code cannot be null or empty';
  END IF;

  v_clean_code := trim(p_employee_code);
  v_clean_ip := CASE WHEN p_ip IS NOT NULL AND trim(p_ip) != '' THEN trim(p_ip) ELSE NULL END;

  IF v_clean_ip IS NOT NULL THEN
    WITH deleted AS (
      DELETE FROM public.login_attempts
      WHERE employee_code = v_clean_code
        AND ip = v_clean_ip
      RETURNING id
    )
    SELECT count(*)::integer INTO v_deleted_count FROM deleted;
  ELSE
    WITH deleted AS (
      DELETE FROM public.login_attempts
      WHERE employee_code = v_clean_code
      RETURNING id
    )
    SELECT count(*)::integer INTO v_deleted_count FROM deleted;
  END IF;

  RETURN v_deleted_count;
END;
$$;

-- 6. Provenance markers
COMMENT ON FUNCTION public.check_login_rate_limit(text, text, integer, integer, integer) IS
  'kurabe:p98:candidate:v1:function:check_login_rate_limit';

COMMENT ON FUNCTION public.record_failed_login_transaction(text, text, integer, integer, integer) IS
  'kurabe:p98:candidate:v1:function:record_failed_login_transaction';

COMMENT ON FUNCTION public.clear_login_attempts(text, text) IS
  'kurabe:p98:candidate:v1:function:clear_login_attempts';

-- 7. Security Grants
REVOKE ALL ON FUNCTION public.check_login_rate_limit(text, text, integer, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_login_rate_limit(text, text, integer, integer, integer) TO service_role;

REVOKE ALL ON FUNCTION public.record_failed_login_transaction(text, text, integer, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_failed_login_transaction(text, text, integer, integer, integer) TO service_role;

REVOKE ALL ON FUNCTION public.clear_login_attempts(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.clear_login_attempts(text, text) TO service_role;

COMMIT;
