-- ============================================================
-- CANDIDATE ONLY — NOT APPLIED
-- KURABE QAQC — Migration P98M2T01: Candidate Data Contract for Password Setup / Reset
-- DO NOT APPLY DIRECTLY WITHOUT SEPARATE APPROVAL AND DIRECT CATALOG GATE
-- ============================================================
-- Purpose:
--   Establish candidate data contract for one-time password setup and reset.
--   NULL password_hash must no longer represent a valid normal login credential.
--   Provides explicit setup-required state on users and a dedicated token table
--   for one-time, short-lived, hashed-at-rest setup/reset credentials.
--
-- Operational & Safety Constraints:
--   1. Candidate Only: Source candidate only; do not apply directly to production.
--   2. Hermetic Transaction: Entire migration executes within a single BEGIN ... COMMIT block.
--   3. Zero DML / Backfill: No data mutation, no mass update, no shared/default passwords.
--   4. Compatibility Preservation: New column users.password_setup_required defaults to false
--      so existing users and authentication flows remain non-breaking until auth action wiring.
--   5. Token Security: Raw tokens are NEVER persisted. Table stores SHA-256 token_hash.
--   6. Least Privilege & RLS: RLS enabled on password_setup_tokens. PUBLIC, anon, and authenticated
--      roles are revoked from all access. Access restricted to server-side service_role.
--
-- Rollback:
--   See /home/pi5/projects/kurabe-wt-p98m2t01/db/rollback-p98-password-setup.sql
-- ============================================================

BEGIN;

-- 1. Fail-closed preflight checks
DO $$
BEGIN
  -- Verify public.users table exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'users'
  ) THEN
    RAISE EXCEPTION 'P98_PREFLIGHT_FAILED: public.users table not found';
  END IF;

  -- Verify public.users.password_setup_required does not exist with an unexpected type
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name = 'password_setup_required'
      AND data_type != 'boolean'
  ) THEN
    RAISE EXCEPTION 'P98_PREFLIGHT_FAILED: public.users.password_setup_required already exists with non-boolean type';
  END IF;
END $$;

-- 2. Add explicit setup-required state on public.users
-- Defaults to false so existing accounts remain compatible until explicit backfill/wiring task
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS password_setup_required boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.users.password_setup_required IS
  'P98: Flag indicating user must set up password before normal login; NULL password_hash no longer represents a valid normal credential';

-- Partial index for fast lookup of users requiring password setup
CREATE INDEX IF NOT EXISTS idx_users_password_setup_required
  ON public.users (password_setup_required)
  WHERE (password_setup_required = true);

-- 3. Create one-time setup token records table
-- Follows smallest schema compatible with users / sessions model
CREATE TABLE IF NOT EXISTS public.password_setup_tokens (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz DEFAULT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);

COMMENT ON TABLE public.password_setup_tokens IS
  'P98: One-time token records for initial password setup and password reset. Raw tokens are never stored.';
COMMENT ON COLUMN public.password_setup_tokens.id IS 'P98: Unique token record identifier';
COMMENT ON COLUMN public.password_setup_tokens.user_id IS 'P98: Foreign key to public.users(id), cascaded on user deletion';
COMMENT ON COLUMN public.password_setup_tokens.token_hash IS 'P98: SHA-256 hex digest of the one-time setup token';
COMMENT ON COLUMN public.password_setup_tokens.expires_at IS 'P98: Expiry timestamp after which token cannot be consumed';
COMMENT ON COLUMN public.password_setup_tokens.used_at IS 'P98: Timestamp when token was consumed; NULL indicates unconsumed token';
COMMENT ON COLUMN public.password_setup_tokens.created_at IS 'P98: Timestamp of token generation';

-- 4. Indexes for one-time use, expiry, and revocation semantics
-- Fast lookup by token_hash for validation/consumption
CREATE INDEX IF NOT EXISTS idx_password_setup_tokens_token_hash
  ON public.password_setup_tokens (token_hash);

-- Fast lookup of tokens by user_id for revocation on password reset or account changes
CREATE INDEX IF NOT EXISTS idx_password_setup_tokens_user_id
  ON public.password_setup_tokens (user_id);

-- Partial index for active (unconsumed) tokens per user with expiry check
CREATE INDEX IF NOT EXISTS idx_password_setup_tokens_active_user
  ON public.password_setup_tokens (user_id, expires_at)
  WHERE (used_at IS NULL);

-- Index for cleanup/sweeping of expired tokens
CREATE INDEX IF NOT EXISTS idx_password_setup_tokens_expires_at
  ON public.password_setup_tokens (expires_at);

-- 5. Row Level Security & Privileges
ALTER TABLE public.password_setup_tokens ENABLE ROW LEVEL SECURITY;

-- Revoke all public and client-side access; token operations must go through server-side service_role
REVOKE ALL ON public.password_setup_tokens FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.password_setup_tokens TO service_role;

COMMIT;
