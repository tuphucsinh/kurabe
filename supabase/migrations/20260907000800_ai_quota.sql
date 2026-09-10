-- ============================================================
-- CANDIDATE ONLY — NOT APPLIED
-- KURABE QAQC — Migration P100M1T01: Atomic AI Quota Reservation Contract
-- DO NOT APPLY DIRECTLY WITHOUT SEPARATE APPROVAL AND DIRECT CATALOG GATE
-- ============================================================
-- Purpose:
--   Replace count-then-insert quota enforcement (ai_usage 30/hour,
--   chat_usage 15/2h) with one atomic, fail-closed reservation contract:
--     1. ai_quota_reserve:
--        Atomically reserves a usage slot under a per-user transactional
--        advisory lock. Deduplicates by request identity (user_id +
--        request_id) so retries of the same logical request never reserve
--        twice. Counts only rows inside the sliding window and prunes
--        obsolete rows beyond a bounded retention horizon.
--     2. ai_quota_consume:
--        Marks a reservation as consumed (terminal) once the AI call has
--        produced its outcome.
--     3. ai_quota_refund:
--        Removes a reservation that is still in 'reserved' state
--        (provider timeout/cancel before any model output). Refund of an
--        already-consumed reservation is DENIED so quota cannot be
--        double-claimed. Refund of an unknown request id is an idempotent
--        no-op (NOT_FOUND).
--
-- Security & Operational Invariants:
--   1. Candidate Only: Source candidate only; do not apply directly.
--   2. Hermetic Transaction: Entire migration executes within one
--      BEGIN ... COMMIT block.
--   3. Fail-Closed Preflight: validates public.users exists.
--   4. Atomic Reservation: pg_advisory_xact_lock serializes concurrent
--      reservations per (kind, user), so the window count and the insert
--      cannot race; concurrent requests at the threshold can never overrun.
--   5. Request Identity: partial-unique (user_id, request_id) index makes
--      duplicate logical requests idempotent regardless of retry timing.
--   6. Bounded Retention: opportunistic prune of rows older than the
--      retention horizon when a reservation is attempted.
--   7. Fail-Closed DB Errors: any database failure inside the RPC body
--      returns allowed=false (QUOTA_UNAVAILABLE) instead of releasing quota.
--   8. Fixed Search Path & Privileges:
--      - SECURITY DEFINER with SET search_path = public, pg_temp.
--      - EXECUTE revoked from PUBLIC, anon, and authenticated.
--      - EXECUTE granted strictly to service_role.
--   9. Existing user-visible limits are unchanged: 30/hour (ai_usage),
--      15/2h (chat_usage); rows inserted outside the RPC (legacy path)
--      default to status='consumed' so they always count toward the window.
-- ============================================================

BEGIN;

-- 1. Preflight prerequisite checks (Fail Closed)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'users'
  ) THEN
    RAISE EXCEPTION 'P100M1T01_PREFLIGHT_FAILED: public.users table not found';
  END IF;
END $$;

-- 2. Request identity + lifecycle columns (idempotent, legacy-safe)
ALTER TABLE public.ai_usage
  ADD COLUMN IF NOT EXISTS request_id text,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'consumed';

ALTER TABLE public.chat_usage
  ADD COLUMN IF NOT EXISTS request_id text,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'consumed';

-- 3. Partial-unique request identity (dedup) + retention scan indexes
CREATE UNIQUE INDEX IF NOT EXISTS uq_ai_usage_user_request
  ON public.ai_usage (user_id, request_id)
  WHERE request_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ai_usage_created_at
  ON public.ai_usage (created_at);

CREATE UNIQUE INDEX IF NOT EXISTS uq_chat_usage_user_request
  ON public.chat_usage (user_id, request_id)
  WHERE request_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_chat_usage_created_at
  ON public.chat_usage (created_at);

-- 4. Function: ai_quota_reserve
CREATE OR REPLACE FUNCTION public.ai_quota_reserve(
  p_kind text,
  p_user_id uuid,
  p_request_id text,
  p_window_seconds integer DEFAULT 3600,
  p_max_requests integer DEFAULT 30,
  p_retention_days integer DEFAULT 30,
  p_action text DEFAULT 'ai'
)
RETURNS TABLE (allowed boolean, error text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_window_start timestamptz;
  v_count integer := 0;
  v_existing uuid;
BEGIN
  -- Argument validation: hard failures propagate to the caller (not swallowed)
  IF p_kind NOT IN ('ai', 'chat') THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: p_kind must be ''ai'' or ''chat''';
  END IF;
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: p_user_id cannot be null';
  END IF;
  IF p_request_id IS NULL OR trim(p_request_id) = '' THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: p_request_id cannot be null or empty';
  END IF;
  IF char_length(p_request_id) > 128 THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: p_request_id exceeds 128 characters';
  END IF;
  IF p_window_seconds IS NULL OR p_window_seconds <= 0 THEN
    p_window_seconds := 3600;
  END IF;
  IF p_max_requests IS NULL OR p_max_requests <= 0 THEN
    p_max_requests := 30;
  END IF;
  IF p_retention_days IS NULL OR p_retention_days <= 0 THEN
    p_retention_days := 30;
  END IF;

  BEGIN
    -- Atomic serialization per (kind, user): count + dedup + insert cannot race
    PERFORM pg_advisory_xact_lock(hashtext('kurabe:ai_quota:' || p_kind || ':' || p_user_id::text));

    -- Idempotency: the same logical request yields the same outcome and never
    -- reserves a second slot, regardless of when the retry arrives.
    IF p_kind = 'ai' THEN
      SELECT id INTO v_existing
      FROM public.ai_usage
      WHERE user_id = p_user_id AND request_id = p_request_id
      LIMIT 1;
    ELSE
      SELECT id INTO v_existing
      FROM public.chat_usage
      WHERE user_id = p_user_id AND request_id = p_request_id
      LIMIT 1;
    END IF;

    IF v_existing IS NOT NULL THEN
      RETURN QUERY SELECT true, NULL::text;
      RETURN;
    END IF;

    -- Bounded retention: opportunistically prune rows beyond the horizon
    IF p_kind = 'ai' THEN
      DELETE FROM public.ai_usage
      WHERE created_at < (now() - (p_retention_days || ' days')::interval);
    ELSE
      DELETE FROM public.chat_usage
      WHERE created_at < (now() - (p_retention_days || ' days')::interval);
    END IF;

    -- Sliding window count (only rows inside the window consume quota)
    v_window_start := now() - (p_window_seconds || ' seconds')::interval;
    IF p_kind = 'ai' THEN
      SELECT count(*)::integer INTO v_count
      FROM public.ai_usage
      WHERE user_id = p_user_id AND created_at >= v_window_start;
    ELSE
      SELECT count(*)::integer INTO v_count
      FROM public.chat_usage
      WHERE user_id = p_user_id AND created_at >= v_window_start;
    END IF;

    IF v_count >= p_max_requests THEN
      RETURN QUERY SELECT false, 'LIMIT_REACHED';
      RETURN;
    END IF;

    -- Reserve the slot
    IF p_kind = 'ai' THEN
      INSERT INTO public.ai_usage (user_id, action, request_id, status)
      VALUES (p_user_id, COALESCE(NULLIF(trim(p_action), ''), 'ai'), p_request_id, 'reserved');
    ELSE
      INSERT INTO public.chat_usage (user_id, request_id, status)
      VALUES (p_user_id, p_request_id, 'reserved');
    END IF;

    RETURN QUERY SELECT true, NULL::text;
  EXCEPTION WHEN OTHERS THEN
    -- Fail closed: any database failure denies the reservation
    RETURN QUERY SELECT false, 'QUOTA_UNAVAILABLE: ' || left(SQLERRM, 160);
  END;
END;
$$;

-- 5. Function: ai_quota_consume
CREATE OR REPLACE FUNCTION public.ai_quota_consume(
  p_kind text,
  p_user_id uuid,
  p_request_id text
)
RETURNS TABLE (consumed boolean, error text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_updated integer := 0;
BEGIN
  IF p_kind NOT IN ('ai', 'chat') THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: p_kind must be ''ai'' or ''chat''';
  END IF;
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: p_user_id cannot be null';
  END IF;
  IF p_request_id IS NULL OR trim(p_request_id) = '' OR char_length(p_request_id) > 128 THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: p_request_id must be non-empty and at most 128 characters';
  END IF;

  BEGIN
    PERFORM pg_advisory_xact_lock(hashtext('kurabe:ai_quota:' || p_kind || ':' || p_user_id::text));

    -- Consume is terminal: only a 'reserved' row can transition to 'consumed'
    IF p_kind = 'ai' THEN
      UPDATE public.ai_usage SET status = 'consumed'
      WHERE user_id = p_user_id AND request_id = p_request_id AND status = 'reserved';
    ELSE
      UPDATE public.chat_usage SET status = 'consumed'
      WHERE user_id = p_user_id AND request_id = p_request_id AND status = 'reserved';
    END IF;
    GET DIAGNOSTICS v_updated = ROW_COUNT;

    IF v_updated > 0 THEN
      RETURN QUERY SELECT true, NULL::text;
      RETURN;
    END IF;

    -- Consume is idempotent so a client retry after a lost response does not
    -- misclassify an already-consumed reservation as a failure.
    IF p_kind = 'ai' THEN
      IF EXISTS (
        SELECT 1 FROM public.ai_usage
        WHERE user_id = p_user_id AND request_id = p_request_id AND status = 'consumed'
      ) THEN
        RETURN QUERY SELECT true, NULL::text;
        RETURN;
      END IF;
    ELSE
      IF EXISTS (
        SELECT 1 FROM public.chat_usage
        WHERE user_id = p_user_id AND request_id = p_request_id AND status = 'consumed'
      ) THEN
        RETURN QUERY SELECT true, NULL::text;
        RETURN;
      END IF;
    END IF;
    RETURN QUERY SELECT false, 'NOT_FOUND';
  EXCEPTION WHEN OTHERS THEN
    RETURN QUERY SELECT false, 'QUOTA_UNAVAILABLE: ' || left(SQLERRM, 160);
  END;
END;
$$;

-- 6. Function: ai_quota_refund
CREATE OR REPLACE FUNCTION public.ai_quota_refund(
  p_kind text,
  p_user_id uuid,
  p_request_id text
)
RETURNS TABLE (refunded boolean, error text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_deleted integer := 0;
  v_consumed boolean := false;
BEGIN
  IF p_kind NOT IN ('ai', 'chat') THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: p_kind must be ''ai'' or ''chat''';
  END IF;
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: p_user_id cannot be null';
  END IF;
  IF p_request_id IS NULL OR trim(p_request_id) = '' OR char_length(p_request_id) > 128 THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: p_request_id must be non-empty and at most 128 characters';
  END IF;

  BEGIN
    PERFORM pg_advisory_xact_lock(hashtext('kurabe:ai_quota:' || p_kind || ':' || p_user_id::text));

    -- Refund removes ONLY reservations still in 'reserved' state (provider
    -- timeout/cancel before any model output). Consumed rows are terminal.
    IF p_kind = 'ai' THEN
      DELETE FROM public.ai_usage
      WHERE user_id = p_user_id AND request_id = p_request_id AND status = 'reserved';
      GET DIAGNOSTICS v_deleted = ROW_COUNT;
      IF v_deleted > 0 THEN
        RETURN QUERY SELECT true, NULL::text;
        RETURN;
      END IF;
      SELECT EXISTS (
        SELECT 1 FROM public.ai_usage
        WHERE user_id = p_user_id AND request_id = p_request_id AND status = 'consumed'
      ) INTO v_consumed;
    ELSE
      DELETE FROM public.chat_usage
      WHERE user_id = p_user_id AND request_id = p_request_id AND status = 'reserved';
      GET DIAGNOSTICS v_deleted = ROW_COUNT;
      IF v_deleted > 0 THEN
        RETURN QUERY SELECT true, NULL::text;
        RETURN;
      END IF;
      SELECT EXISTS (
        SELECT 1 FROM public.chat_usage
        WHERE user_id = p_user_id AND request_id = p_request_id AND status = 'consumed'
      ) INTO v_consumed;
    END IF;

    IF v_consumed THEN
      RETURN QUERY SELECT false, 'ALREADY_CONSUMED';
      RETURN;
    END IF;
    -- Idempotent no-op: nothing left to refund
    RETURN QUERY SELECT false, 'NOT_FOUND';
  EXCEPTION WHEN OTHERS THEN
    RETURN QUERY SELECT false, 'QUOTA_UNAVAILABLE: ' || left(SQLERRM, 160);
  END;
END;
$$;

-- 7. Provenance markers
COMMENT ON FUNCTION public.ai_quota_reserve(text, uuid, text, integer, integer, integer, text) IS
  'kurabe:p100:candidate:v1:function:ai_quota_reserve';

COMMENT ON FUNCTION public.ai_quota_consume(text, uuid, text) IS
  'kurabe:p100:candidate:v1:function:ai_quota_consume';

COMMENT ON FUNCTION public.ai_quota_refund(text, uuid, text) IS
  'kurabe:p100:candidate:v1:function:ai_quota_refund';

-- 8. Security Grants (service_role only; server-side contract boundary)
REVOKE ALL ON FUNCTION public.ai_quota_reserve(text, uuid, text, integer, integer, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ai_quota_reserve(text, uuid, text, integer, integer, integer, text) TO service_role;

REVOKE ALL ON FUNCTION public.ai_quota_consume(text, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ai_quota_consume(text, uuid, text) TO service_role;

REVOKE ALL ON FUNCTION public.ai_quota_refund(text, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ai_quota_refund(text, uuid, text) TO service_role;

COMMIT;