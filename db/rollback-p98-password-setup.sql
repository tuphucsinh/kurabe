-- ============================================================
-- ROLLBACK CANDIDATE ONLY — NOT APPLIED
-- KURABE QAQC — Rollback P98M2T01: Drop Password Setup Candidate Contract
-- DO NOT EXECUTE DIRECTLY WITHOUT EXPLICIT APPROVAL AND GUC CONFIRMATION
-- ============================================================
-- Purpose:
--   Rollback candidate for migration 20260905070000_p98_password_setup.sql.
--   Reverses only objects introduced by P98M2T01 candidate:
--     1. Drops table public.password_setup_tokens and its associated indexes.
--     2. Drops column public.users.password_setup_required and its index.
--
-- Safety & Production Runbook Constraints:
--   1. Candidate Only: DO NOT execute without separate approval and catalog verification.
--   2. External Session Approval Guard:
--      Execution requires setting the custom PostgreSQL configuration setting:
--        SET kurabe.p98_rollback_approved = 'true';
--      in the active administrative session before running this script.
--      This script deliberately does NOT set this parameter internally.
--   3. Hermetic Transaction: Executes within a single BEGIN ... COMMIT block.
--   4. Fail-Closed Preflight: Validates ownership and provenance via exact P98 comment markers
--      on candidate table and column before teardown. Fails closed if candidate objects exist with
--      absent or mismatched markers, or if unexpected inbound foreign keys / schema drift are detected.
--      Preserves no-op behavior when candidate objects are absent.
--   5. Scoped Teardown: Reverses ONLY objects introduced by P98M2T01.
--   6. Zero Mutation on Unrelated Tables: Does not modify or drop any other objects.
-- ============================================================

BEGIN;

-- 1. Preflight check: fail closed on unapproved execution, ownership/provenance drift, or unexpected shape
DO $$
DECLARE
  v_approved text;
  v_table_exists boolean;
  v_table_comment text;
  v_col_type text;
  v_col_comment text;
  v_inbound_fk_count integer;
BEGIN
  -- ------------------------------------------------------------
  -- 1. APPROVAL GUARD (Fail closed if GUC is not explicitly 'true')
  -- ------------------------------------------------------------
  v_approved := current_setting('kurabe.p98_rollback_approved', true);
  IF v_approved IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'ROLLBACK_UNAPPROVED: Execution aborted. Custom GUC kurabe.p98_rollback_approved must be set to ''true'' in this session prior to running rollback candidate.';
  END IF;

  -- ------------------------------------------------------------
  -- 2. PREFLIGHT CHECKS: Fail closed on provenance mismatch or unexpected shape
  -- ------------------------------------------------------------
  -- Check candidate table public.password_setup_tokens provenance marker if table exists
  SELECT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'password_setup_tokens'
  ) INTO v_table_exists;

  IF v_table_exists THEN
    SELECT obj_description(c.oid, 'pg_class') INTO v_table_comment
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'password_setup_tokens';

    IF v_table_comment IS NULL OR v_table_comment != 'P98: One-time token records for initial password setup and password reset. Raw tokens are never stored.' THEN
      RAISE EXCEPTION 'P98_ROLLBACK_PREFLIGHT_FAILED: public.password_setup_tokens table provenance marker missing or mismatched (found: "%")', COALESCE(v_table_comment, '<none>');
    END IF;
  END IF;

  -- Check candidate column public.users.password_setup_required data type and provenance marker if column exists
  SELECT data_type INTO v_col_type
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'users'
    AND column_name = 'password_setup_required';

  IF v_col_type IS NOT NULL THEN
    IF v_col_type != 'boolean' THEN
      RAISE EXCEPTION 'P98_ROLLBACK_PREFLIGHT_FAILED: public.users.password_setup_required has unexpected data type "%" (expected "boolean")', v_col_type;
    END IF;

    SELECT col_description(c.oid, a.attnum) INTO v_col_comment
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_catalog.pg_attribute a ON a.attrelid = c.oid
    WHERE n.nspname = 'public'
      AND c.relname = 'users'
      AND a.attname = 'password_setup_required'
      AND NOT a.attisdropped;

    IF v_col_comment IS NULL OR v_col_comment != 'P98: Flag indicating user must set up password before normal login; NULL password_hash no longer represents a valid normal credential' THEN
      RAISE EXCEPTION 'P98_ROLLBACK_PREFLIGHT_FAILED: public.users.password_setup_required column provenance marker missing or mismatched (found: "%")', COALESCE(v_col_comment, '<none>');
    END IF;
  END IF;

  -- Check for unexpected inbound foreign keys to public.password_setup_tokens
  -- Only password_setup_tokens itself should reference users; no other table should reference password_setup_tokens
  SELECT count(*) INTO v_inbound_fk_count
  FROM information_schema.table_constraints tc
  JOIN information_schema.constraint_column_usage ccu
    ON tc.constraint_name = ccu.constraint_name
   AND tc.table_schema = ccu.table_schema
  WHERE tc.constraint_type = 'FOREIGN KEY'
    AND ccu.table_schema = 'public'
    AND ccu.table_name = 'password_setup_tokens'
    AND tc.table_name != 'password_setup_tokens';

  IF v_inbound_fk_count > 0 THEN
    RAISE EXCEPTION 'P98_ROLLBACK_PREFLIGHT_FAILED: % unexpected foreign key constraint(s) reference public.password_setup_tokens', v_inbound_fk_count;
  END IF;
END $$;

-- 2. Drop indexes on password_setup_tokens
DROP INDEX IF EXISTS public.idx_password_setup_tokens_token_hash;
DROP INDEX IF EXISTS public.idx_password_setup_tokens_user_id;
DROP INDEX IF EXISTS public.idx_password_setup_tokens_active_user;
DROP INDEX IF EXISTS public.idx_password_setup_tokens_expires_at;

-- 3. Drop table password_setup_tokens
DROP TABLE IF EXISTS public.password_setup_tokens;

-- 4. Drop index on public.users(password_setup_required)
DROP INDEX IF EXISTS public.idx_users_password_setup_required;

-- 5. Drop column password_setup_required from public.users
ALTER TABLE public.users
  DROP COLUMN IF EXISTS password_setup_required;

COMMIT;
