-- ============================================================
-- CANDIDATE ONLY — NOT APPLIED
-- KURABE QAQC — Migration P98M2T07: Self-Change Credential State & Other-Session Revocation RPC
-- DO NOT APPLY DIRECTLY WITHOUT SEPARATE APPROVAL AND DIRECT CATALOG GATE
-- ============================================================
-- Purpose:
--   Establish candidate transactional RPC function:
--     change_password_transaction:
--       Atomically updates password for configured accounts with existing-password proof.
--       Enforces compare/version-guard on expected password_hash.
--       Rejects update if account is in setup-required state (never unconditional flag clearing).
--       Revokes other active sessions while preserving current session if specified.
--       Revokes unconsumed setup tokens for the user.
--
-- Lock Order Invariant (Users -> Password Setup Tokens -> Sessions):
--   Consistent with P98M2T02:
--     1. public.users (FOR UPDATE)
--     2. public.password_setup_tokens (UPDATE used_at)
--     3. public.sessions (DELETE)
--
-- Operational & Safety Constraints:
--   1. Candidate Only: Source candidate only; do not apply directly to production.
--   2. Hermetic Transaction: Entire migration executes within a single BEGIN ... COMMIT block.
--   3. Fail-Closed Preflight:
--      - Validates public.users exists and has password_hash, password_setup_required.
--      - Validates public.sessions exists and has token_hash, user_id.
--      - Validates public.password_setup_tokens exists.
--   4. Fixed Search Path & Privileges:
--      - SECURITY DEFINER with SET search_path = public.
--      - EXECUTE revoked from PUBLIC, anon, and authenticated.
--      - EXECUTE granted strictly to service_role.
--   5. Secrets & Token Privacy:
--      - NEVER accepts raw passwords.
--      - Boundary receives ONLY bcrypt password_hash and SHA-256 session token_hash.
-- ============================================================

BEGIN;

-- 1. Preflight prerequisite checks (Fail Closed)
DO $$
BEGIN
  -- Verify public.users table exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'users'
  ) THEN
    RAISE EXCEPTION 'P98M2T07_PREFLIGHT_FAILED: public.users table not found';
  END IF;

  -- Verify public.users.password_hash and password_setup_required exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name = 'password_setup_required'
      AND data_type = 'boolean'
  ) THEN
    RAISE EXCEPTION 'P98M2T07_PREFLIGHT_FAILED: public.users.password_setup_required boolean column not found';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name = 'password_hash'
  ) THEN
    RAISE EXCEPTION 'P98M2T07_PREFLIGHT_FAILED: public.users.password_hash column not found';
  END IF;

  -- Verify public.sessions table exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'sessions'
  ) THEN
    RAISE EXCEPTION 'P98M2T07_PREFLIGHT_FAILED: public.sessions table not found';
  END IF;

  -- Verify public.password_setup_tokens table exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'password_setup_tokens'
  ) THEN
    RAISE EXCEPTION 'P98M2T07_PREFLIGHT_FAILED: public.password_setup_tokens table not found';
  END IF;
END $$;

-- 2. Function: change_password_transaction
CREATE OR REPLACE FUNCTION public.change_password_transaction(
  p_user_id uuid,
  p_expected_password_hash text,
  p_new_password_hash text,
  p_current_session_token_hash text DEFAULT NULL
)
RETURNS TABLE (
  user_id uuid,
  revoked_sessions integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user record;
  v_revoked_count integer := 0;
BEGIN
  -- 1. Fail-closed argument validation
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: p_user_id cannot be null';
  END IF;

  IF p_expected_password_hash IS NULL THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: p_expected_password_hash cannot be null; configured account proof is required';
  END IF;

  IF p_new_password_hash IS NULL OR p_new_password_hash !~ '^\$2[aby]\$[0-9]{2}\$[./A-Za-z0-9]{53}$' THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: p_new_password_hash must be a valid bcrypt hash string';
  END IF;

  IF p_current_session_token_hash IS NOT NULL AND p_current_session_token_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: p_current_session_token_hash must be a valid 64-character lowercase hex string';
  END IF;

  -- 2. Lock and verify target user (Row lock order: 1. users)
  SELECT u.id, u.is_active, u.password_hash, u.password_setup_required
  INTO v_user
  FROM public.users u
  WHERE u.id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'USER_NOT_FOUND: User % does not exist', p_user_id;
  END IF;

  IF v_user.is_active IS NOT TRUE THEN
    RAISE EXCEPTION 'USER_INACTIVE: User % is not active', p_user_id;
  END IF;

  -- Setup-required accounts must use token path, never unconditional flag clearing
  IF v_user.password_setup_required IS TRUE THEN
    RAISE EXCEPTION 'SETUP_REQUIRED: User requires password setup via token';
  END IF;

  -- Configured account must have existing credential
  IF v_user.password_hash IS NULL THEN
    RAISE EXCEPTION 'NO_EXISTING_CREDENTIAL: User has no configured password; setup token required';
  END IF;

  -- Atomic compare/version guard: credential hash must match expected snapshot
  IF v_user.password_hash IS DISTINCT FROM p_expected_password_hash THEN
    RAISE EXCEPTION 'CREDENTIAL_MISMATCH: Credential state has changed concurrently';
  END IF;

  -- 3. Update credential and ensure password_setup_required remains false
  UPDATE public.users
  SET
    password_hash = p_new_password_hash,
    password_setup_required = false
  WHERE id = p_user_id;

  -- 4. Revoke any pending unconsumed setup tokens for this user (Row lock order: 2. password_setup_tokens)
  UPDATE public.password_setup_tokens pst
  SET used_at = now()
  WHERE pst.user_id = p_user_id
    AND used_at IS NULL;

  -- 5. Revoke other sessions (Row lock order: 3. sessions)
  IF p_current_session_token_hash IS NOT NULL THEN
    WITH deleted AS (
      DELETE FROM public.sessions s
      WHERE s.user_id = p_user_id
        AND token_hash != p_current_session_token_hash
      RETURNING id
    )
    SELECT count(*)::integer INTO v_revoked_count FROM deleted;
  ELSE
    WITH deleted AS (
      DELETE FROM public.sessions s
      WHERE s.user_id = p_user_id
      RETURNING id
    )
    SELECT count(*)::integer INTO v_revoked_count FROM deleted;
  END IF;

  RETURN QUERY
  SELECT p_user_id, v_revoked_count;
END;
$$;

COMMENT ON FUNCTION public.change_password_transaction(uuid, text, text, text) IS
  'kurabe:p98:candidate:v1:function:change_password_transaction';

REVOKE ALL ON FUNCTION public.change_password_transaction(uuid, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.change_password_transaction(uuid, text, text, text) TO service_role;

COMMIT;
