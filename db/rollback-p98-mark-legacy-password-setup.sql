-- ============================================================
-- ROLLBACK CANDIDATE ONLY — NOT APPLIED
-- KURABE QAQC — Rollback P98M2T04: Revert Legacy NULL-Password Accounts Setup-Required State
-- DO NOT EXECUTE DIRECTLY WITHOUT EXPLICIT APPROVAL AND GUC CONFIRMATION
-- ============================================================
-- Purpose:
--   Rollback candidate for migration 20260905070500_p98_mark_legacy_password_setup.sql.
--   Reverses only the candidate state introduced by P98M2T04:
--     1. Reverts password_setup_required to false for legacy NULL-password accounts.
--     2. Restores column provenance marker to the P98M2T01 candidate baseline.
--
-- Operational & Safety Constraints:
--   1. Candidate Only: DO NOT execute without separate approval and catalog verification.
--   2. External Session Approval Guard:
--      Execution requires setting the custom PostgreSQL configuration setting:
--        SET kurabe.p98_rollback_approved = 'true';
--      in the active administrative session before running this script.
--      This script deliberately does NOT set this parameter internally.
--   3. Hermetic Transaction: Executes within a single BEGIN ... COMMIT block.
--   4. Fail-Closed Preflight:
--      - Validates approval guard.
--      - Validates table public.users and required columns exist.
--      - Validates provenance marker on public.users.password_setup_required.
--      - Fails closed on missing or unexpected schema.
--      - Preserves no-op behavior when candidate state is absent (already rolled back or P98M2T01 baseline).
--   5. Scoped Mutation: Reverses ONLY rows where password_hash IS NULL and password_setup_required = true.
--   6. Invariant Protection:
--      - Does NOT reset, set, or modify password_hash.
--      - Does NOT delete users or any records.
--      - Does NOT touch tokens, sessions, or unrelated rows.
-- ============================================================

BEGIN;

DO $$
DECLARE
  v_approved text;
  v_col_type text;
  v_col_comment text;
  v_revert_count integer;
  v_affected_count integer;
  v_remaining_count integer;
BEGIN
  -- ------------------------------------------------------------
  -- 1. APPROVAL GUARD (Fail closed if GUC is not explicitly 'true')
  -- ------------------------------------------------------------
  v_approved := current_setting('kurabe.p98_rollback_approved', true);
  IF v_approved IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'ROLLBACK_UNAPPROVED: Execution aborted. Custom GUC kurabe.p98_rollback_approved must be set to ''true'' in this session prior to running rollback candidate.';
  END IF;

  -- ------------------------------------------------------------
  -- 2. PREFLIGHT CHECKS: Schema shape & provenance (Fail Closed)
  -- ------------------------------------------------------------
  -- Verify public.users table exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'users'
  ) THEN
    RAISE EXCEPTION 'P98_ROLLBACK_PREFLIGHT_FAILED: public.users table not found';
  END IF;

  -- Verify public.users.password_hash column exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name = 'password_hash'
  ) THEN
    RAISE EXCEPTION 'P98_ROLLBACK_PREFLIGHT_FAILED: public.users.password_hash column not found';
  END IF;

  -- Verify public.users.password_setup_required column exists and is boolean
  SELECT data_type INTO v_col_type
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'users'
    AND column_name = 'password_setup_required';

  IF v_col_type IS NULL THEN
    RAISE EXCEPTION 'P98_ROLLBACK_PREFLIGHT_FAILED: public.users.password_setup_required column not found';
  ELSIF v_col_type != 'boolean' THEN
    RAISE EXCEPTION 'P98_ROLLBACK_PREFLIGHT_FAILED: public.users.password_setup_required has unexpected data type "%" (expected boolean)', v_col_type;
  END IF;

  -- Verify no NULL values exist in public.users.password_setup_required
  IF EXISTS (
    SELECT 1 FROM public.users
    WHERE password_setup_required IS NULL
  ) THEN
    RAISE EXCEPTION 'P98_ROLLBACK_PREFLIGHT_FAILED: public.users.password_setup_required contains NULL values';
  END IF;

  -- Verify provenance marker on public.users.password_setup_required
  SELECT col_description(c.oid, a.attnum) INTO v_col_comment
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  JOIN pg_catalog.pg_attribute a ON a.attrelid = c.oid
  WHERE n.nspname = 'public'
    AND c.relname = 'users'
    AND a.attname = 'password_setup_required'
    AND NOT a.attisdropped;

  IF v_col_comment IS NULL OR v_col_comment NOT IN (
    'P98M2T04: Flag indicating user must set up password before normal login; legacy NULL-password accounts marked setup-required',
    'P98: Flag indicating user must set up password before normal login; NULL password_hash no longer represents a valid normal credential'
  ) THEN
    RAISE EXCEPTION 'P98_ROLLBACK_PREFLIGHT_FAILED: public.users.password_setup_required column provenance marker missing or mismatched (found: "%")', COALESCE(v_col_comment, '<none>');
  END IF;

  -- ------------------------------------------------------------
  -- 3. CONDITIONAL ROLLBACK EXECUTION
  -- ------------------------------------------------------------
  IF v_col_comment = 'P98M2T04: Flag indicating user must set up password before normal login; legacy NULL-password accounts marked setup-required' THEN
    -- Candidate state is present: reverse only the P98M2T04 state
    LOCK TABLE public.users IN SHARE ROW EXCLUSIVE MODE;

    -- Capture count of rows requiring revert
    SELECT count(*)
    INTO v_revert_count
    FROM public.users
    WHERE password_hash IS NULL
      AND password_setup_required = true;

    -- Revert setup-required state on legacy NULL-password accounts back to false
    -- Does NOT touch password_hash, tokens, sessions, or accounts with passwords
    UPDATE public.users
    SET password_setup_required = false
    WHERE password_hash IS NULL
      AND password_setup_required = true;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count != v_revert_count THEN
      RAISE EXCEPTION 'P98_ROLLBACK_FAILED: Revert eligible count (%) does not match updated row count (%)', v_revert_count, v_affected_count;
    END IF;

    -- Postcondition check: verify no rows remain in P98M2T04 modified state
    SELECT count(*)
    INTO v_remaining_count
    FROM public.users
    WHERE password_hash IS NULL
      AND password_setup_required = true;

    IF v_remaining_count > 0 THEN
      RAISE EXCEPTION 'P98_ROLLBACK_POSTCONDITION_FAILED: % row(s) remain with password_hash IS NULL AND password_setup_required = true', v_remaining_count;
    END IF;

    -- Restore provenance marker to P98M2T01 baseline
    EXECUTE 'COMMENT ON COLUMN public.users.password_setup_required IS ''P98: Flag indicating user must set up password before normal login; NULL password_hash no longer represents a valid normal credential''';
  ELSE
    -- Candidate state absent (already P98M2T01 baseline): preserve no-op behavior
    RAISE NOTICE 'P98_ROLLBACK_NOOP: Candidate state absent (provenance is P98M2T01 baseline). No rows modified.';
  END IF;
END $$;

COMMIT;
