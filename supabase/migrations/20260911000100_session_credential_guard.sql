-- ============================================================
-- CANDIDATE ONLY — NOT APPLIED
-- KURABE QAQC — P102M3T02: Session Credential Guard
-- DO NOT APPLY DIRECTLY WITHOUT SEPARATE APPROVAL AND DIRECT CATALOG GATE
-- ============================================================
-- Adds a monotonic credential revision and atomic session issuance.
-- Existing P98 function signatures remain untouched; the overloads below are
-- the only functions wired by the P102M3T02 application candidate.
-- Raw passwords and raw session/setup tokens never cross this SQL boundary.

BEGIN;
SET LOCAL search_path = public;

DO $$
BEGIN
  IF to_regclass('public.users') IS NULL THEN
    RAISE EXCEPTION 'P102M3T02_PREFLIGHT_FAILED: public.users table not found';
  END IF;
  IF to_regclass('public.sessions') IS NULL THEN
    RAISE EXCEPTION 'P102M3T02_PREFLIGHT_FAILED: public.sessions table not found';
  END IF;
  IF to_regclass('public.password_setup_tokens') IS NULL THEN
    RAISE EXCEPTION 'P102M3T02_PREFLIGHT_FAILED: public.password_setup_tokens table not found';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users'
      AND column_name = 'password_hash'
  ) THEN
    RAISE EXCEPTION 'P102M3T02_PREFLIGHT_FAILED: public.users.password_hash column not found';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users'
      AND column_name = 'password_setup_required' AND data_type = 'boolean'
  ) THEN
    RAISE EXCEPTION 'P102M3T02_PREFLIGHT_FAILED: public.users.password_setup_required boolean column not found';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sessions'
      AND column_name = 'token_hash'
  ) THEN
    RAISE EXCEPTION 'P102M3T02_PREFLIGHT_FAILED: public.sessions.token_hash column not found';
  END IF;
END $$;

DO $$
DECLARE
  v_comment text;
  v_oid oid;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'credential_revision'
  ) THEN
    SELECT col_description('public.users'::regclass, a.attnum)
    INTO v_comment
    FROM pg_attribute AS a
    WHERE a.attrelid = 'public.users'::regclass
      AND a.attname = 'credential_revision'
      AND NOT a.attisdropped;
    IF v_comment IS DISTINCT FROM 'kurabe:p102m3t02:candidate:v1:column:users.credential_revision' THEN
      RAISE EXCEPTION 'P102M3T02_PREFLIGHT_FAILED: users.credential_revision provenance collision';
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sessions' AND column_name = 'credential_revision'
  ) THEN
    SELECT col_description('public.sessions'::regclass, a.attnum)
    INTO v_comment
    FROM pg_attribute AS a
    WHERE a.attrelid = 'public.sessions'::regclass
      AND a.attname = 'credential_revision'
      AND NOT a.attisdropped;
    IF v_comment IS DISTINCT FROM 'kurabe:p102m3t02:candidate:v1:column:sessions.credential_revision' THEN
      RAISE EXCEPTION 'P102M3T02_PREFLIGHT_FAILED: sessions.credential_revision provenance collision';
    END IF;
  END IF;

  v_oid := to_regclass('public.idx_sessions_user_credential_revision')::oid;
  IF v_oid IS NOT NULL
     AND obj_description(v_oid, 'pg_class') IS DISTINCT FROM 'kurabe:p102m3t02:candidate:v1:index:idx_sessions_user_credential_revision' THEN
    RAISE EXCEPTION 'P102M3T02_PREFLIGHT_FAILED: session revision index provenance collision';
  END IF;

  v_oid := to_regprocedure('public.issue_session_transaction(uuid,text,boolean,bigint,text,timestamptz)')::oid;
  IF v_oid IS NOT NULL
     AND obj_description(v_oid, 'pg_proc') IS DISTINCT FROM 'kurabe:p102m3t02:candidate:v1:function:issue_session_transaction' THEN
    RAISE EXCEPTION 'P102M3T02_PREFLIGHT_FAILED: issue_session_transaction provenance collision';
  END IF;
  v_oid := to_regprocedure('public.change_password_transaction(uuid,text,text,text,bigint)')::oid;
  IF v_oid IS NOT NULL
     AND obj_description(v_oid, 'pg_proc') IS DISTINCT FROM 'kurabe:p102m3t02:candidate:v1:function:change_password_transaction' THEN
    RAISE EXCEPTION 'P102M3T02_PREFLIGHT_FAILED: change_password_transaction provenance collision';
  END IF;
  v_oid := to_regprocedure('public.reset_password_transaction(uuid,text,timestamptz,bigint)')::oid;
  IF v_oid IS NOT NULL
     AND obj_description(v_oid, 'pg_proc') IS DISTINCT FROM 'kurabe:p102m3t02:candidate:v1:function:reset_password_transaction' THEN
    RAISE EXCEPTION 'P102M3T02_PREFLIGHT_FAILED: reset_password_transaction provenance collision';
  END IF;
  v_oid := to_regprocedure('public.complete_password_setup_transaction(text,text,bigint)')::oid;
  IF v_oid IS NOT NULL
     AND obj_description(v_oid, 'pg_proc') IS DISTINCT FROM 'kurabe:p102m3t02:candidate:v1:function:complete_password_setup_transaction' THEN
    RAISE EXCEPTION 'P102M3T02_PREFLIGHT_FAILED: complete_password_setup_transaction provenance collision';
  END IF;
END $$;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS credential_revision bigint;
UPDATE public.users SET credential_revision = 0 WHERE credential_revision IS NULL;
ALTER TABLE public.users
  ALTER COLUMN credential_revision SET DEFAULT 0,
  ALTER COLUMN credential_revision SET NOT NULL;
COMMENT ON COLUMN public.users.credential_revision IS
  'kurabe:p102m3t02:candidate:v1:column:users.credential_revision';

ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS credential_revision bigint;
UPDATE public.sessions SET credential_revision = 0 WHERE credential_revision IS NULL;
ALTER TABLE public.sessions
  ALTER COLUMN credential_revision SET DEFAULT 0,
  ALTER COLUMN credential_revision SET NOT NULL;
COMMENT ON COLUMN public.sessions.credential_revision IS
  'kurabe:p102m3t02:candidate:v1:column:sessions.credential_revision';
CREATE INDEX IF NOT EXISTS idx_sessions_user_credential_revision
  ON public.sessions (user_id, credential_revision);
COMMENT ON INDEX public.idx_sessions_user_credential_revision IS
  'kurabe:p102m3t02:candidate:v1:index:idx_sessions_user_credential_revision';

-- Login admission: lock the user before comparing the complete credential snapshot
-- and inserting the session. Reset/change/setup all increment this revision.
CREATE OR REPLACE FUNCTION public.issue_session_transaction(
  p_user_id uuid,
  p_expected_password_hash text,
  p_expected_password_setup_required boolean,
  p_expected_credential_revision bigint,
  p_token_hash text,
  p_expires_at timestamptz
)
RETURNS TABLE (user_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user record;
BEGIN
  IF p_user_id IS NULL OR p_expected_password_setup_required IS NULL
     OR p_expected_credential_revision IS NULL OR p_expected_credential_revision < 0 THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: complete credential snapshot is required';
  END IF;
  IF p_token_hash IS NULL OR p_token_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: p_token_hash must be a 64-character lowercase hex string';
  END IF;
  IF p_expires_at IS NULL OR p_expires_at <= now() THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: p_expires_at must be in the future';
  END IF;

  SELECT u.id, u.is_active, u.password_hash, u.password_setup_required, u.credential_revision
  INTO v_user
  FROM public.users u
  WHERE u.id = p_user_id
  FOR UPDATE;

  IF NOT FOUND OR v_user.is_active IS NOT TRUE THEN
    RAISE EXCEPTION 'AUTH_STATE_CHANGED: user is missing or inactive';
  END IF;
  IF v_user.password_hash IS DISTINCT FROM p_expected_password_hash
     OR v_user.password_setup_required IS DISTINCT FROM p_expected_password_setup_required
     OR v_user.credential_revision IS DISTINCT FROM p_expected_credential_revision THEN
    RAISE EXCEPTION 'AUTH_STATE_CHANGED: credential snapshot is stale';
  END IF;

  INSERT INTO public.sessions (user_id, token_hash, expires_at, credential_revision)
  VALUES (p_user_id, p_token_hash, p_expires_at, v_user.credential_revision);
  RETURN QUERY SELECT p_user_id;
END;
$$;
COMMENT ON FUNCTION public.issue_session_transaction(uuid, text, boolean, bigint, text, timestamptz) IS
  'kurabe:p102m3t02:candidate:v1:function:issue_session_transaction';
REVOKE ALL ON FUNCTION public.issue_session_transaction(uuid, text, boolean, bigint, text, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.issue_session_transaction(uuid, text, boolean, bigint, text, timestamptz) TO service_role;

-- Self-change: existing-password proof and revision/hash compare are checked
-- under the same user lock as the update and session revocation.
CREATE OR REPLACE FUNCTION public.change_password_transaction(
  p_user_id uuid,
  p_expected_password_hash text,
  p_new_password_hash text,
  p_current_session_token_hash text,
  p_expected_credential_revision bigint
)
RETURNS TABLE (user_id uuid, revoked_sessions integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user record;
  v_revoked integer := 0;
BEGIN
  IF p_user_id IS NULL OR p_expected_password_hash IS NULL
     OR p_expected_credential_revision IS NULL OR p_expected_credential_revision < 0 THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: configured credential snapshot is required';
  END IF;
  IF p_new_password_hash IS NULL OR p_new_password_hash !~ '^\$2[aby]\$[0-9]{2}\$[./A-Za-z0-9]{53}$' THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: p_new_password_hash must be a valid bcrypt hash string';
  END IF;
  IF p_current_session_token_hash IS NOT NULL
     AND p_current_session_token_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: p_current_session_token_hash must be a 64-character lowercase hex string';
  END IF;

  SELECT u.id, u.is_active, u.password_hash, u.password_setup_required, u.credential_revision
  INTO v_user
  FROM public.users u WHERE u.id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'USER_NOT_FOUND: user does not exist'; END IF;
  IF v_user.is_active IS NOT TRUE THEN RAISE EXCEPTION 'USER_INACTIVE: user is inactive'; END IF;
  IF v_user.password_setup_required IS TRUE THEN RAISE EXCEPTION 'SETUP_REQUIRED: token setup is required'; END IF;
  IF v_user.password_hash IS NULL THEN RAISE EXCEPTION 'NO_EXISTING_CREDENTIAL: setup is required'; END IF;
  IF v_user.password_hash IS DISTINCT FROM p_expected_password_hash
     OR v_user.credential_revision IS DISTINCT FROM p_expected_credential_revision THEN
    RAISE EXCEPTION 'CREDENTIAL_MISMATCH: credential state changed concurrently';
  END IF;

  UPDATE public.users
  SET password_hash = p_new_password_hash,
      password_setup_required = false,
      credential_revision = credential_revision + 1
  WHERE id = p_user_id;

  UPDATE public.password_setup_tokens AS pst
  SET used_at = now()
  WHERE pst.user_id = p_user_id AND pst.used_at IS NULL;

  IF p_current_session_token_hash IS NULL THEN
    WITH deleted AS (
      DELETE FROM public.sessions AS s WHERE s.user_id = p_user_id RETURNING s.id
    ) SELECT count(*)::integer INTO v_revoked FROM deleted;
  ELSE
    UPDATE public.sessions AS s
    SET credential_revision = v_user.credential_revision + 1
    WHERE s.user_id = p_user_id AND s.token_hash = p_current_session_token_hash;
    WITH deleted AS (
      DELETE FROM public.sessions AS s
      WHERE s.user_id = p_user_id AND s.token_hash <> p_current_session_token_hash
      RETURNING s.id
    ) SELECT count(*)::integer INTO v_revoked FROM deleted;
  END IF;
  RETURN QUERY SELECT p_user_id, v_revoked;
END;
$$;
COMMENT ON FUNCTION public.change_password_transaction(uuid, text, text, text, bigint) IS
  'kurabe:p102m3t02:candidate:v1:function:change_password_transaction';
REVOKE ALL ON FUNCTION public.change_password_transaction(uuid, text, text, text, bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.change_password_transaction(uuid, text, text, text, bigint) TO service_role;

-- Manager reset: the user lock serializes revision invalidation with login.
CREATE OR REPLACE FUNCTION public.reset_password_transaction(
  p_user_id uuid,
  p_token_hash text,
  p_expires_at timestamptz,
  p_expected_credential_revision bigint
)
RETURNS TABLE (token_id uuid, user_id uuid, expires_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user record;
  v_token_id uuid;
BEGIN
  IF p_user_id IS NULL OR p_token_hash IS NULL OR p_token_hash !~ '^[0-9a-f]{64}$'
     OR p_expires_at IS NULL OR p_expires_at <= now() THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: reset inputs are invalid';
  END IF;
  SELECT u.id, u.is_active, u.credential_revision
  INTO v_user FROM public.users u WHERE u.id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'USER_NOT_FOUND: user does not exist'; END IF;
  IF v_user.is_active IS NOT TRUE THEN RAISE EXCEPTION 'USER_INACTIVE: user is inactive'; END IF;
  IF p_expected_credential_revision IS NOT NULL
     AND v_user.credential_revision IS DISTINCT FROM p_expected_credential_revision THEN
    RAISE EXCEPTION 'CREDENTIAL_MISMATCH: credential state changed concurrently';
  END IF;

  UPDATE public.users
  SET password_hash = NULL,
      password_setup_required = true,
      credential_revision = credential_revision + 1
  WHERE id = p_user_id;
  UPDATE public.password_setup_tokens AS pst SET used_at = now()
  WHERE pst.user_id = p_user_id AND pst.used_at IS NULL;
  DELETE FROM public.sessions AS s WHERE s.user_id = p_user_id;
  INSERT INTO public.password_setup_tokens (user_id, token_hash, expires_at)
  VALUES (p_user_id, p_token_hash, p_expires_at)
  RETURNING id INTO v_token_id;
  RETURN QUERY SELECT v_token_id, p_user_id, p_expires_at;
END;
$$;
COMMENT ON FUNCTION public.reset_password_transaction(uuid, text, timestamptz, bigint) IS
  'kurabe:p102m3t02:candidate:v1:function:reset_password_transaction';
REVOKE ALL ON FUNCTION public.reset_password_transaction(uuid, text, timestamptz, bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reset_password_transaction(uuid, text, timestamptz, bigint) TO service_role;

-- One-time setup: resolve the token without locking, then lock user before token
-- validation, matching the established Users -> Tokens -> Sessions order.
CREATE OR REPLACE FUNCTION public.complete_password_setup_transaction(
  p_token_hash text,
  p_password_hash text,
  p_expected_credential_revision bigint
)
RETURNS TABLE (user_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_user record;
  v_token record;
BEGIN
  IF p_token_hash IS NULL OR p_token_hash !~ '^[0-9a-f]{64}$'
     OR p_password_hash IS NULL OR p_password_hash !~ '^\$2[aby]\$[0-9]{2}\$[./A-Za-z0-9]{53}$' THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: setup inputs are invalid';
  END IF;
  SELECT t.user_id INTO v_user_id FROM public.password_setup_tokens t
  WHERE t.token_hash = p_token_hash;
  IF NOT FOUND THEN RAISE EXCEPTION 'TOKEN_NOT_FOUND: token does not exist'; END IF;

  SELECT u.id, u.is_active, u.password_setup_required, u.credential_revision
  INTO v_user FROM public.users u WHERE u.id = v_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'USER_NOT_FOUND: user does not exist'; END IF;
  IF v_user.is_active IS NOT TRUE THEN RAISE EXCEPTION 'USER_INACTIVE: user is inactive'; END IF;
  IF v_user.password_setup_required IS NOT TRUE THEN RAISE EXCEPTION 'TOKEN_NOT_ALLOWED: setup is not pending'; END IF;
  IF p_expected_credential_revision IS NOT NULL
     AND v_user.credential_revision IS DISTINCT FROM p_expected_credential_revision THEN
    RAISE EXCEPTION 'CREDENTIAL_MISMATCH: credential state changed concurrently';
  END IF;

  SELECT t.id, t.user_id, t.expires_at, t.used_at
  INTO v_token FROM public.password_setup_tokens t
  WHERE t.token_hash = p_token_hash FOR UPDATE;
  IF NOT FOUND OR v_token.user_id IS DISTINCT FROM v_user_id THEN
    RAISE EXCEPTION 'TOKEN_NOT_FOUND: token association changed';
  END IF;
  IF v_token.used_at IS NOT NULL THEN RAISE EXCEPTION 'TOKEN_ALREADY_USED: token was consumed'; END IF;
  IF v_token.expires_at <= now() THEN RAISE EXCEPTION 'TOKEN_EXPIRED: token has expired'; END IF;

  UPDATE public.users
  SET password_hash = p_password_hash,
      password_setup_required = false,
      credential_revision = credential_revision + 1
  WHERE id = v_user_id;
  UPDATE public.password_setup_tokens AS pst SET used_at = now()
  WHERE pst.user_id = v_user_id AND pst.used_at IS NULL;
  DELETE FROM public.sessions AS s WHERE s.user_id = v_user_id;
  RETURN QUERY SELECT v_user_id;
END;
$$;
COMMENT ON FUNCTION public.complete_password_setup_transaction(text, text, bigint) IS
  'kurabe:p102m3t02:candidate:v1:function:complete_password_setup_transaction';
REVOKE ALL ON FUNCTION public.complete_password_setup_transaction(text, text, bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_password_setup_transaction(text, text, bigint) TO service_role;

COMMIT;
