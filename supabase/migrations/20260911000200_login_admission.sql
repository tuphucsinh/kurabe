-- ============================================================
-- CANDIDATE ONLY — NOT APPLIED
-- KURABE QAQC — Migration P102M3T03: Atomic Login Admission Reservation Contract
-- DO NOT APPLY DIRECTLY WITHOUT SEPARATE APPROVAL AND DIRECT CATALOG GATE
-- ============================================================
-- Purpose:
--   Establish candidate transactional RPC functions, columns, and indexes
--   for fail-safe atomic login admission control:
--     1. Extends public.login_attempts with request_id (idempotency key) and
--        status ('reserved', 'failed', 'succeeded', 'expired').
--     2. acquire_login_admission:
--        Atomically serializes and reserves an in-flight admission slot under
--        per-account and per-network transactional advisory locks.
--        Bounds actual concurrent attempts (threshold = 5 account, 25 network).
--        Deduplicates by request identity so duplicate retries are idempotent.
--        Performs bounded recovery of stale in-flight reservations by
--        transitioning them to 'expired'.
--     3. finalize_login_admission:
--        Finalizes an admitted reservation to 'failed' or 'succeeded'.
--        Preserves successful-login cleanup semantics (resets account attempts).
--        Idempotent: repeated finalization cannot overcount or lose the reservation.
--     4. Existing P98 check_login_rate_limit and clear_login_attempts RPCs remain
--        untouched; the new application path uses the admission/finalization RPCs
--        and retains those pre-existing RPCs for compatibility and safe rollback.
--
-- Security & Operational Invariants:
--   1. Candidate Only: Source candidate only; do not apply directly to production.
--   2. Hermetic Transaction: Executes within a single BEGIN ... COMMIT block.
--   3. Fail-Closed Preflight: Validates public.users and public.login_attempts exist.
--   4. Dual-Throttling (Account + Trusted Network Bucket):
--      - Account-level throttling defeats distributed credential attacks.
--      - Network-level throttling defeats account enumeration / spraying.
--   5. Concurrency Controls:
--      - pg_advisory_xact_lock serializes concurrent attempts per account and network.
--   6. Fixed Search Path & Privileges:
--      - SECURITY DEFINER with SET search_path = public, pg_temp.
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
    RAISE EXCEPTION 'P102M3T03_PREFLIGHT_FAILED: public.users table not found';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'login_attempts'
  ) THEN
    RAISE EXCEPTION 'P102M3T03_PREFLIGHT_FAILED: public.login_attempts table not found';
  END IF;
END $$;

DO $$
DECLARE
  v_data_type text;
  v_is_nullable text;
  v_default text;
  v_comment text;
  v_index_def text;
  v_index_table oid;
  v_index_unique boolean;
  v_function_owner text;
  v_function_security_definer boolean;
  v_function_config text[];
BEGIN
  SELECT data_type, is_nullable, column_default
  INTO v_data_type, v_is_nullable, v_default
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'login_attempts' AND column_name = 'request_id';
  IF v_data_type IS NOT NULL AND (v_data_type <> 'text' OR v_is_nullable <> 'YES') THEN
    RAISE EXCEPTION 'P102M3T03_PREFLIGHT_FAILED: request_id has incompatible definition';
  END IF;
  IF v_data_type IS NOT NULL AND col_description('public.login_attempts'::regclass, (SELECT attnum FROM pg_attribute WHERE attrelid = 'public.login_attempts'::regclass AND attname = 'request_id' AND NOT attisdropped)) IS DISTINCT FROM 'kurabe:p102:candidate:v1:column:request_id' THEN
    RAISE EXCEPTION 'P102M3T03_PREFLIGHT_FAILED: request_id column provenance collision';
  END IF;
  SELECT data_type, is_nullable, column_default
  INTO v_data_type, v_is_nullable, v_default
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'login_attempts' AND column_name = 'status';
  IF v_data_type IS NOT NULL AND (v_data_type <> 'text' OR v_is_nullable <> 'NO' OR v_default IS NULL OR v_default NOT LIKE '%failed%') THEN
    RAISE EXCEPTION 'P102M3T03_PREFLIGHT_FAILED: status has incompatible definition';
  END IF;
  IF v_data_type IS NOT NULL AND col_description('public.login_attempts'::regclass, (SELECT attnum FROM pg_attribute WHERE attrelid = 'public.login_attempts'::regclass AND attname = 'status' AND NOT attisdropped)) IS DISTINCT FROM 'kurabe:p102:candidate:v1:column:status' THEN
    RAISE EXCEPTION 'P102M3T03_PREFLIGHT_FAILED: status column provenance collision';
  END IF;
  IF to_regclass('public.uq_login_attempts_request_id') IS NOT NULL THEN
    v_comment := obj_description('public.uq_login_attempts_request_id'::regclass, 'pg_class');
    SELECT pg_get_indexdef(c.oid), i.indrelid, i.indisunique
    INTO v_index_def, v_index_table, v_index_unique
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_index i ON i.indexrelid = c.oid
    WHERE n.nspname = 'public' AND c.relname = 'uq_login_attempts_request_id';
    IF v_comment IS DISTINCT FROM 'kurabe:p102:candidate:v1:index:uq_login_attempts_request_id'
       OR v_index_table <> 'public.login_attempts'::regclass
       OR v_index_unique IS NOT TRUE
       OR v_index_def NOT LIKE '%request_id%' THEN
      RAISE EXCEPTION 'P102M3T03_PREFLIGHT_FAILED: request id index collision';
    END IF;
  END IF;
  IF to_regclass('public.idx_login_attempts_status_time') IS NOT NULL THEN
    v_comment := obj_description('public.idx_login_attempts_status_time'::regclass, 'pg_class');
    SELECT pg_get_indexdef(c.oid), i.indrelid, i.indisunique
    INTO v_index_def, v_index_table, v_index_unique
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_index i ON i.indexrelid = c.oid
    WHERE n.nspname = 'public' AND c.relname = 'idx_login_attempts_status_time';
    IF v_comment IS DISTINCT FROM 'kurabe:p102:candidate:v1:index:idx_login_attempts_status_time'
       OR v_index_unique IS TRUE
       OR v_index_def NOT LIKE '%status%'
       OR v_index_def NOT LIKE '%attempted_at%' THEN
      RAISE EXCEPTION 'P102M3T03_PREFLIGHT_FAILED: status index collision';
    END IF;
  END IF;

  IF to_regprocedure('public.acquire_login_admission(text,text,text,integer,integer,integer,integer)') IS NOT NULL THEN
    v_comment := obj_description('public.acquire_login_admission(text,text,text,integer,integer,integer,integer)'::regprocedure, 'pg_proc');
    SELECT pg_get_userbyid(p.proowner), p.prosecdef, p.proconfig
    INTO v_function_owner, v_function_security_definer, v_function_config
    FROM pg_proc p
    WHERE p.oid = 'public.acquire_login_admission(text,text,text,integer,integer,integer,integer)'::regprocedure;
    IF v_comment IS DISTINCT FROM 'kurabe:p102:candidate:v1:function:acquire_login_admission'
       OR v_function_owner IS DISTINCT FROM current_user
       OR v_function_security_definer IS NOT TRUE
       OR NOT ('search_path=public, pg_temp' = ANY(COALESCE(v_function_config, ARRAY[]::text[]))) THEN
      RAISE EXCEPTION 'P102M3T03_PREFLIGHT_FAILED: acquire function collision';
    END IF;
  END IF;
  IF to_regprocedure('public.finalize_login_admission(text,text,text,boolean,integer,integer,integer)') IS NOT NULL THEN
    v_comment := obj_description('public.finalize_login_admission(text,text,text,boolean,integer,integer,integer)'::regprocedure, 'pg_proc');
    SELECT pg_get_userbyid(p.proowner), p.prosecdef, p.proconfig
    INTO v_function_owner, v_function_security_definer, v_function_config
    FROM pg_proc p
    WHERE p.oid = 'public.finalize_login_admission(text,text,text,boolean,integer,integer,integer)'::regprocedure;
    IF v_comment IS DISTINCT FROM 'kurabe:p102:candidate:v1:function:finalize_login_admission'
       OR v_function_owner IS DISTINCT FROM current_user
       OR v_function_security_definer IS NOT TRUE
       OR NOT ('search_path=public, pg_temp' = ANY(COALESCE(v_function_config, ARRAY[]::text[]))) THEN
      RAISE EXCEPTION 'P102M3T03_PREFLIGHT_FAILED: finalize function collision';
    END IF;
  END IF;
  IF to_regprocedure('public.issue_session_finalize_login_admission(uuid,text,boolean,bigint,text,timestamptz,text,text,text,integer,integer,integer)') IS NOT NULL THEN
    v_comment := obj_description('public.issue_session_finalize_login_admission(uuid,text,boolean,bigint,text,timestamptz,text,text,text,integer,integer,integer)'::regprocedure, 'pg_proc');
    SELECT pg_get_userbyid(p.proowner), p.prosecdef, p.proconfig INTO v_function_owner, v_function_security_definer, v_function_config FROM pg_proc p WHERE p.oid = 'public.issue_session_finalize_login_admission(uuid,text,boolean,bigint,text,timestamptz,text,text,text,integer,integer,integer)'::regprocedure;
    IF v_comment IS DISTINCT FROM 'kurabe:p102:candidate:v1:function:issue_session_finalize_login_admission'
       OR v_function_owner IS DISTINCT FROM current_user
       OR v_function_security_definer IS NOT TRUE
       OR NOT ('search_path=public, pg_temp' = ANY(COALESCE(v_function_config, ARRAY[]::text[]))) THEN
      RAISE EXCEPTION 'P102M3T03_PREFLIGHT_FAILED: atomic wrapper collision';
    END IF;
  END IF;
END $$;

-- 2. Request identity & lifecycle status columns on public.login_attempts
ALTER TABLE public.login_attempts
  ADD COLUMN IF NOT EXISTS request_id text,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'failed';

-- 3. Unique index for request idempotency + status/time lookup index
CREATE UNIQUE INDEX IF NOT EXISTS uq_login_attempts_request_id
  ON public.login_attempts (request_id)
  WHERE request_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_login_attempts_status_time
  ON public.login_attempts (status, attempted_at);


COMMENT ON COLUMN public.login_attempts.request_id IS
  'kurabe:p102:candidate:v1:column:request_id';
COMMENT ON COLUMN public.login_attempts.status IS
  'kurabe:p102:candidate:v1:column:status';
COMMENT ON INDEX public.uq_login_attempts_request_id IS
  'kurabe:p102:candidate:v1:index:uq_login_attempts_request_id';
COMMENT ON INDEX public.idx_login_attempts_status_time IS
  'kurabe:p102:candidate:v1:index:idx_login_attempts_status_time';

-- 4. Function: acquire_login_admission
CREATE OR REPLACE FUNCTION public.acquire_login_admission(
  p_request_id text,
  p_employee_code text,
  p_ip text,
  p_window_seconds integer DEFAULT 900,
  p_max_account_attempts integer DEFAULT 5,
  p_max_ip_attempts integer DEFAULT 25,
  p_reservation_timeout_seconds integer DEFAULT 30
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
SET search_path = public, pg_temp
AS $$
DECLARE
  v_clean_req_id text;
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
  v_existing_status text;
  v_existing_time timestamptz;
  v_existing_code text;
  v_existing_ip text;
  v_account_lock bigint;
  v_ip_lock bigint;
BEGIN
  IF p_request_id IS NULL OR trim(p_request_id) = '' THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: p_request_id cannot be null or empty';
  END IF;

  IF char_length(p_request_id) > 128 THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: p_request_id exceeds 128 characters';
  END IF;

  IF p_employee_code IS NULL OR trim(p_employee_code) = '' THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: p_employee_code cannot be null or empty';
  END IF;

  IF p_ip IS NULL OR trim(p_ip) = '' THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: p_ip cannot be null or empty';
  END IF;

  v_clean_req_id := trim(p_request_id);
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

  IF p_reservation_timeout_seconds IS NULL OR p_reservation_timeout_seconds <= 0 THEN
    p_reservation_timeout_seconds := 30;
  END IF;

  -- Concurrency control: acquire both locks in deterministic key order.
  v_account_lock := hashtext('kurabe:login_admission:account:' || v_clean_code)::bigint;
  v_ip_lock := hashtext('kurabe:login_admission:ip:' || v_clean_ip)::bigint;
  IF v_account_lock <= v_ip_lock THEN
    PERFORM pg_advisory_xact_lock(v_account_lock);
    PERFORM pg_advisory_xact_lock(v_ip_lock);
  ELSE
    PERFORM pg_advisory_xact_lock(v_ip_lock);
    PERFORM pg_advisory_xact_lock(v_account_lock);
  END IF;

  -- 1. Idempotency check: duplicate retry with same request_id
  SELECT status, attempted_at, employee_code, ip
  INTO v_existing_status, v_existing_time, v_existing_code, v_existing_ip
  FROM public.login_attempts
  WHERE request_id = v_clean_req_id;

  IF v_existing_status IS NOT NULL THEN
    IF v_existing_code IS DISTINCT FROM v_clean_code OR v_existing_ip IS DISTINCT FROM v_clean_ip THEN
      RAISE EXCEPTION 'REQUEST_REPLAY_MISMATCH: request identity is bound to another login subject';
    END IF;
    IF v_existing_status = 'reserved' THEN
      -- A timeout is not proof that the original request stopped.  Never
      -- recycle a reserved slot implicitly: doing so could admit more than
      -- the configured bound while the original password check is alive.
      IF v_existing_time >= now() - (p_reservation_timeout_seconds || ' seconds')::interval THEN
        v_window_start := now() - (p_window_seconds || ' seconds')::interval;
        SELECT count(*)::integer INTO v_account_count
        FROM public.login_attempts
        WHERE employee_code = v_clean_code
          AND status IN ('reserved', 'failed')
          AND attempted_at >= v_window_start;

        SELECT count(*)::integer INTO v_ip_count
        FROM public.login_attempts
        WHERE ip = v_clean_ip
          AND status IN ('reserved', 'failed')
          AND attempted_at >= v_window_start;

        RETURN QUERY SELECT true, v_account_count, v_ip_count, NULL::text, 0;
        RETURN;
      ELSE
        RETURN QUERY SELECT false, 1, 1, 'reservation_in_flight'::text, p_window_seconds;
        RETURN;
      END IF;
    ELSIF v_existing_status = 'succeeded' THEN
      RETURN QUERY SELECT true, 0, 0, NULL::text, 0;
      RETURN;
    ELSIF v_existing_status = 'failed' THEN
      RETURN QUERY SELECT false, 1, 1, 'already_failed'::text, p_window_seconds;
      RETURN;
    ELSIF v_existing_status = 'expired' THEN
      RETURN QUERY SELECT false, 1, 1, 'expired'::text, p_window_seconds;
      RETURN;
    END IF;
  END IF;

  -- 2. Bounded retention: opportunistically prune terminal entries older
  -- than 30 days.  Reserved rows are retained until their owner explicitly
  -- finalizes them; deleting/reusing a stale reservation is not safe.
  WITH stale AS (
      SELECT id
      FROM public.login_attempts
      WHERE attempted_at < now() - interval '30 days'
        AND status IN ('succeeded', 'failed', 'expired')
      ORDER BY attempted_at
      LIMIT 100
    )
    DELETE FROM public.login_attempts AS attempts
    USING stale
    WHERE attempts.id = stale.id;

  v_window_start := now() - (p_window_seconds || ' seconds')::interval;

  -- 3. Count reservations and failures within the sliding window.
  SELECT count(*)::integer, min(attempted_at)
  INTO v_account_count, v_oldest_account_attempt
  FROM public.login_attempts
  WHERE employee_code = v_clean_code
    AND status IN ('reserved', 'failed')
    AND attempted_at >= v_window_start;

  SELECT count(*)::integer, min(attempted_at)
  INTO v_ip_count, v_oldest_ip_attempt
  FROM public.login_attempts
  WHERE ip = v_clean_ip
    AND status IN ('reserved', 'failed')
    AND attempted_at >= v_window_start;

  -- 4. Threshold decision (account priority over network)
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

  -- 5. If locked, deny reservation without inserting
  IF v_locked THEN
    RETURN QUERY SELECT false, v_account_count, v_ip_count, v_locked_by, v_retry_after;
    RETURN;
  END IF;

  -- 6. Reserve the slot.  Every admitted request gets one durable row.
  INSERT INTO public.login_attempts (request_id, employee_code, ip, attempted_at, status)
  VALUES (v_clean_req_id, v_clean_code, v_clean_ip, now(), 'reserved');

  RETURN QUERY SELECT true,
    v_account_count + 1,
    v_ip_count + 1,
    NULL::text, 0;
EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT false, 0, 0, 'db_error'::text, p_window_seconds;
END;
$$;

-- 5. Function: finalize_login_admission
CREATE OR REPLACE FUNCTION public.finalize_login_admission(
  p_request_id text,
  p_employee_code text,
  p_ip text,
  p_success boolean,
  p_window_seconds integer DEFAULT 900,
  p_max_account_attempts integer DEFAULT 5,
  p_max_ip_attempts integer DEFAULT 25
)
RETURNS TABLE (
  finalized boolean,
  allowed boolean,
  account_attempts integer,
  ip_attempts integer,
  locked_by text,
  retry_after_seconds integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_clean_req_id text;
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
  v_existing_id uuid;
  v_existing_status text;
  v_account_lock bigint;
  v_ip_lock bigint;
BEGIN
  IF p_request_id IS NULL OR trim(p_request_id) = '' THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: p_request_id cannot be null or empty';
  END IF;

  IF char_length(p_request_id) > 128 THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: p_request_id exceeds 128 characters';
  END IF;

  IF p_employee_code IS NULL OR trim(p_employee_code) = '' THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: p_employee_code cannot be null or empty';
  END IF;

  IF p_ip IS NULL OR trim(p_ip) = '' THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: p_ip cannot be null or empty';
  END IF;

  v_clean_req_id := trim(p_request_id);
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

  v_account_lock := hashtext('kurabe:login_admission:account:' || v_clean_code)::bigint;
  v_ip_lock := hashtext('kurabe:login_admission:ip:' || v_clean_ip)::bigint;
  IF v_account_lock <= v_ip_lock THEN
    PERFORM pg_advisory_xact_lock(v_account_lock);
    PERFORM pg_advisory_xact_lock(v_ip_lock);
  ELSE
    PERFORM pg_advisory_xact_lock(v_ip_lock);
    PERFORM pg_advisory_xact_lock(v_account_lock);
  END IF;

  SELECT id, status INTO v_existing_id, v_existing_status
  FROM public.login_attempts
  WHERE request_id = v_clean_req_id
    AND employee_code = v_clean_code
    AND ip = v_clean_ip;

  IF p_success THEN
    IF v_existing_status = 'succeeded' THEN
      RETURN QUERY SELECT true, true, 0, 0, NULL::text, 0;
      RETURN;
    END IF;
    -- A success may only finalize an admission reserved by this exact request.
    -- Never clear an account's history when admission accounting is absent.
    IF v_existing_id IS NULL OR v_existing_status IS DISTINCT FROM 'reserved' THEN
      RETURN QUERY SELECT false, false, 0, 0, 'db_error'::text, p_window_seconds;
      RETURN;
    END IF;

    UPDATE public.login_attempts
    SET status = 'succeeded', attempted_at = now()
    WHERE id = v_existing_id AND status = 'reserved';

    -- Successful login clears only terminal failed attempts.  A different
    -- reserved request may still be running and must retain its admission
    -- slot until that request explicitly finalizes.
    UPDATE public.login_attempts
    SET status = 'expired'
    WHERE employee_code = v_clean_code
      AND id <> v_existing_id
      AND status = 'failed';

    RETURN QUERY SELECT true, true, 0, 0, NULL::text, 0;
    RETURN;
  ELSE
    -- Failed login: transition reservation to 'failed' or insert if absent
    IF v_existing_id IS NOT NULL THEN
      IF v_existing_status = 'reserved' THEN
        UPDATE public.login_attempts
        SET status = 'failed', attempted_at = now()
        WHERE id = v_existing_id;
      ELSIF v_existing_status = 'succeeded' THEN
        RETURN QUERY SELECT false, false, 0, 0, 'already_succeeded'::text, p_window_seconds;
        RETURN;
      ELSIF v_existing_status = 'expired' THEN
        RETURN QUERY SELECT false, false, 0, 0, 'db_error'::text, p_window_seconds;
        RETURN;
      END IF;
    ELSE
      INSERT INTO public.login_attempts (request_id, employee_code, ip, attempted_at, status)
      VALUES (v_clean_req_id, v_clean_code, v_clean_ip, now(), 'failed');
    END IF;

    v_window_start := now() - (p_window_seconds || ' seconds')::interval;

    SELECT count(*)::integer, min(attempted_at)
    INTO v_account_count, v_oldest_account_attempt
    FROM public.login_attempts
    WHERE employee_code = v_clean_code
      AND status IN ('reserved', 'failed')
      AND attempted_at >= v_window_start;

    SELECT count(*)::integer, min(attempted_at)
    INTO v_ip_count, v_oldest_ip_attempt
    FROM public.login_attempts
    WHERE ip = v_clean_ip
      AND status IN ('reserved', 'failed')
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

    RETURN QUERY SELECT true, NOT v_locked, v_account_count, v_ip_count, v_locked_by, v_retry_after;
    RETURN;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT false, false, 0, 0, 'db_error'::text, p_window_seconds;
END;
$$;

-- 6. Provenance markers for new admission functions
COMMENT ON FUNCTION public.acquire_login_admission(text, text, text, integer, integer, integer, integer) IS
  'kurabe:p102:candidate:v1:function:acquire_login_admission';

COMMENT ON FUNCTION public.finalize_login_admission(text, text, text, boolean, integer, integer, integer) IS
  'kurabe:p102:candidate:v1:function:finalize_login_admission';

CREATE OR REPLACE FUNCTION public.issue_session_finalize_login_admission(
  p_user_id uuid,
  p_expected_password_hash text,
  p_expected_password_setup_required boolean,
  p_expected_credential_revision bigint,
  p_token_hash text,
  p_expires_at timestamptz,
  p_request_id text,
  p_employee_code text,
  p_ip text,
  p_max_account_attempts integer,
  p_max_ip_attempts integer,
  p_window_seconds integer
)
RETURNS TABLE (user_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid;
  v_finalized boolean;
BEGIN
  SELECT s.user_id INTO v_user_id
  FROM public.issue_session_transaction(
    p_user_id,
    p_expected_password_hash,
    p_expected_password_setup_required,
    p_expected_credential_revision,
    p_token_hash,
    p_expires_at
  ) AS s;

  SELECT f.finalized INTO v_finalized
  FROM public.finalize_login_admission(
    p_request_id,
    p_employee_code,
    p_ip,
    true,
    p_window_seconds,
    p_max_account_attempts,
    p_max_ip_attempts
  ) AS f;

  IF v_user_id IS NULL OR v_finalized IS NOT TRUE THEN
    RAISE EXCEPTION 'AUTH_ACCOUNTING_FAILED: session and login admission could not be finalized';
  END IF;

  RETURN QUERY SELECT v_user_id;
END;
$$;
COMMENT ON FUNCTION public.issue_session_finalize_login_admission(uuid, text, boolean, bigint, text, timestamptz, text, text, text, integer, integer, integer) IS
  'kurabe:p102:candidate:v1:function:issue_session_finalize_login_admission';
REVOKE ALL ON FUNCTION public.issue_session_finalize_login_admission(uuid, text, boolean, bigint, text, timestamptz, text, text, text, integer, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.issue_session_finalize_login_admission(uuid, text, boolean, bigint, text, timestamptz, text, text, text, integer, integer, integer) TO service_role;

-- 7. Security Grants
REVOKE ALL ON FUNCTION public.acquire_login_admission(text, text, text, integer, integer, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.acquire_login_admission(text, text, text, integer, integer, integer, integer) TO service_role;

REVOKE ALL ON FUNCTION public.finalize_login_admission(text, text, text, boolean, integer, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_login_admission(text, text, text, boolean, integer, integer, integer) TO service_role;

COMMIT;
