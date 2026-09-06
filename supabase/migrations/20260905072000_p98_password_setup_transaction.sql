-- ============================================================
-- CANDIDATE ONLY — NOT APPLIED
-- KURABE QAQC — Migration P98M2T02: Password Setup and Reset Transaction RPCs
-- DO NOT APPLY DIRECTLY WITHOUT SEPARATE APPROVAL AND DIRECT CATALOG GATE
-- ============================================================
-- Purpose:
--   Establish candidate transactional RPC functions for:
--     1. reset_password_transaction:
--        Atomically marks user as password_setup_required = true (password_hash = NULL),
--        revokes prior unused setup tokens, revokes existing sessions,
--        and inserts a new short-lived setup token record (hashed at rest).
--     2. complete_password_setup_transaction:
--        Atomically resolves token to user without locking, locks the user first,
--        re-reads and locks the unconsumed unexpired setup token,
--        sets the new bcrypt password_hash, clears password_setup_required (false),
--        consumes the token and revokes any remaining setup tokens,
--        revokes existing sessions, and returns the user identifier.
--
-- Lock Order Invariant (Users -> Password Setup Tokens -> Sessions):
--   Both transaction functions acquire row locks in one consistent order:
--     1. public.users (FOR UPDATE)
--     2. public.password_setup_tokens (FOR UPDATE / UPDATE)
--     3. public.sessions (DELETE)
--   For completion, token->user_id is resolved without locking, user is locked first,
--   then the token row is re-read and locked under the post-wait transaction snapshot
--   and validated before writes. This prevents deadlock between concurrent manager resets
--   and setup completions.
--
-- Operational & Safety Constraints:
--   1. Candidate Only: Source candidate only; do not apply directly to production.
--   2. Hermetic Transaction: Entire migration executes within a single BEGIN ... COMMIT block.
--   3. Fail-Closed Preflight:
--      - Validates public.users exists and has columns password_hash, password_setup_required.
--      - Validates public.sessions exists.
--      - Validates public.password_setup_tokens exists (prerequisite P98M2T01).
--   4. Fixed Search Path & Privileges:
--      - Both functions use SECURITY DEFINER with SET search_path = public.
--      - EXECUTE privilege is REVOKED from PUBLIC, anon, and authenticated.
--      - EXECUTE privilege is GRANTED strictly to service_role.
--   5. Secrets & Token Privacy:
--      - Functions NEVER accept raw passwords or raw tokens.
--      - DB boundary receives ONLY token_hash (SHA-256) and password_hash (bcrypt).
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
    RAISE EXCEPTION 'P98M2T02_PREFLIGHT_FAILED: public.users table not found';
  END IF;

  -- Verify public.users.password_setup_required exists and is boolean
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name = 'password_setup_required'
      AND data_type = 'boolean'
  ) THEN
    RAISE EXCEPTION 'P98M2T02_PREFLIGHT_FAILED: public.users.password_setup_required boolean column not found (prerequisite P98M2T01 missing)';
  END IF;

  -- Verify public.sessions table exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'sessions'
  ) THEN
    RAISE EXCEPTION 'P98M2T02_PREFLIGHT_FAILED: public.sessions table not found';
  END IF;

  -- Verify public.password_setup_tokens table exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'password_setup_tokens'
  ) THEN
    RAISE EXCEPTION 'P98M2T02_PREFLIGHT_FAILED: public.password_setup_tokens table not found (prerequisite P98M2T01 missing)';
  END IF;
END $$;

-- 2. Function: reset_password_transaction
CREATE OR REPLACE FUNCTION public.reset_password_transaction(
  p_user_id uuid,
  p_token_hash text,
  p_expires_at timestamptz
)
RETURNS TABLE (
  token_id uuid,
  user_id uuid,
  expires_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user record;
  v_token_id uuid;
BEGIN
  -- 1. Fail-closed argument validation
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: p_user_id cannot be null';
  END IF;

  IF p_token_hash IS NULL OR p_token_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: p_token_hash must be a valid 64-character lowercase hex string';
  END IF;

  IF p_expires_at IS NULL OR p_expires_at <= now() THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: p_expires_at must be in the future';
  END IF;

  -- 2. Lock and verify user exists and is active (Row lock order: 1. users)
  SELECT u.id, u.is_active
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

  -- 3. Mark user as requiring password setup and wipe old password_hash
  UPDATE public.users
  SET
    password_setup_required = true,
    password_hash = NULL
  WHERE id = p_user_id;

  -- 4. Revoke any prior unconsumed setup tokens for this user (Row lock order: 2. password_setup_tokens)
  UPDATE public.password_setup_tokens
  SET used_at = now()
  WHERE user_id = p_user_id
    AND used_at IS NULL;

  -- 5. Revoke all active sessions for this user (Row lock order: 3. sessions)
  DELETE FROM public.sessions
  WHERE user_id = p_user_id;

  -- 6. Insert new setup token record (hashed at rest)
  INSERT INTO public.password_setup_tokens (
    user_id,
    token_hash,
    expires_at,
    used_at,
    created_at
  ) VALUES (
    p_user_id,
    p_token_hash,
    p_expires_at,
    NULL,
    now()
  )
  RETURNING id INTO v_token_id;

  RETURN QUERY
  SELECT v_token_id, p_user_id, p_expires_at;
END;
$$;

COMMENT ON FUNCTION public.reset_password_transaction(uuid, text, timestamptz) IS
  'kurabe:p98:candidate:v1:function:reset_password_transaction';

REVOKE ALL ON FUNCTION public.reset_password_transaction(uuid, text, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reset_password_transaction(uuid, text, timestamptz) TO service_role;

-- 3. Function: complete_password_setup_transaction
CREATE OR REPLACE FUNCTION public.complete_password_setup_transaction(
  p_token_hash text,
  p_password_hash text
)
RETURNS TABLE (
  user_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_user record;
  v_token record;
BEGIN
  -- 1. Fail-closed argument validation
  IF p_token_hash IS NULL OR p_token_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: p_token_hash must be a valid 64-character lowercase hex string';
  END IF;

  IF p_password_hash IS NULL OR p_password_hash !~ '^\$2[aby]\$[0-9]{2}\$[./A-Za-z0-9]{53}$' THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: p_password_hash must be a valid bcrypt hash string';
  END IF;

  -- 2. Resolve token -> user_id without row locking to determine target user
  SELECT t.user_id
  INTO v_user_id
  FROM public.password_setup_tokens t
  WHERE t.token_hash = p_token_hash;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'TOKEN_NOT_FOUND: Token record not found';
  END IF;

  -- 3. Lock and verify associated user first (Row lock order: 1. users)
  SELECT u.id, u.is_active
  INTO v_user
  FROM public.users u
  WHERE u.id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'USER_NOT_FOUND: Associated user not found';
  END IF;

  IF v_user.is_active IS NOT TRUE THEN
    RAISE EXCEPTION 'USER_INACTIVE: Associated user is not active';
  END IF;

  -- 4. Re-read and lock setup token row under post-wait snapshot, then validate before writes (Row lock order: 2. password_setup_tokens)
  SELECT t.id, t.user_id, t.expires_at, t.used_at
  INTO v_token
  FROM public.password_setup_tokens t
  WHERE t.token_hash = p_token_hash
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'TOKEN_NOT_FOUND: Token record not found';
  END IF;

  IF v_token.user_id IS DISTINCT FROM v_user_id THEN
    RAISE EXCEPTION 'TOKEN_NOT_FOUND: Token association changed';
  END IF;

  IF v_token.used_at IS NOT NULL THEN
    RAISE EXCEPTION 'TOKEN_ALREADY_USED: Token has already been used';
  END IF;

  IF v_token.expires_at <= now() THEN
    RAISE EXCEPTION 'TOKEN_EXPIRED: Token has expired';
  END IF;

  -- 5. Set the new bcrypt password_hash and clear password_setup_required
  UPDATE public.users
  SET
    password_hash = p_password_hash,
    password_setup_required = false
  WHERE id = v_user_id;

  -- 6. Mark this token and all other unconsumed setup tokens for this user as consumed/revoked (Row lock order: 2. password_setup_tokens)
  UPDATE public.password_setup_tokens
  SET used_at = now()
  WHERE user_id = v_user_id
    AND used_at IS NULL;

  -- 7. Revoke all active sessions for this user (Row lock order: 3. sessions)
  DELETE FROM public.sessions
  WHERE user_id = v_user_id;

  RETURN QUERY
  SELECT v_user_id;
END;
$$;

COMMENT ON FUNCTION public.complete_password_setup_transaction(text, text) IS
  'kurabe:p98:candidate:v1:function:complete_password_setup_transaction';

REVOKE ALL ON FUNCTION public.complete_password_setup_transaction(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_password_setup_transaction(text, text) TO service_role;

COMMIT;
