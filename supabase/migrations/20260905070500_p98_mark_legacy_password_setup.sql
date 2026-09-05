-- ============================================================
-- CANDIDATE ONLY — NOT APPLIED
-- KURABE QAQC — Migration P98M2T04: Mark Legacy NULL-Password Accounts as Setup-Required
-- DO NOT APPLY DIRECTLY WITHOUT SEPARATE APPROVAL AND DIRECT CATALOG GATE
-- ============================================================
-- Purpose:
--   Establish candidate DML contract marking existing legacy NULL-password accounts
--   as password_setup_required = true.
--   Prevents normal passwordless login for legacy accounts once login hardening
--   is wired, while avoiding any shared/default password generation.
--
-- Operational & Safety Constraints:
--   1. Candidate Only: Source candidate only; do not apply directly to production.
--   2. Hermetic Transaction: Entire migration executes within a single BEGIN ... COMMIT block.
--   3. Fail-Closed Preflight:
--      - Validates presence of public.users.
--      - Validates presence of column password_hash.
--      - Validates presence and boolean type of password_setup_required (prerequisite P98M2T01).
--      - Validates provenance marker on public.users.password_setup_required.
--      - Validates absence of NULL values in password_setup_required.
--   4. Predicate Stability & Exact Row Assertion:
--      - Locks public.users in SHARE ROW EXCLUSIVE MODE before counting to ensure
--        the eligible legacy predicate is stable against concurrent DML.
--      - Preflight captures exact eligible legacy count (password_hash IS NULL).
--      - Updates ONLY rows where password_hash IS NULL.
--      - Asserts updated row count matches preflight eligible count; rolls back on mismatch.
--      - Verifies zero unmigrated rows remain after DML.
--   5. Idempotent & Zero-Eligible Safe:
--      - Safely completes when eligible count is zero (e.g. fresh DB or already migrated).
--   6. Data & Token Privacy:
--      - Never creates or sets passwords.
--      - Never generates tokens or sessions.
--      - Never emits employee IDs, names, emails, or row data in evidence/errors.
--   7. Provenance Marker:
--      - Updates column comment to bind candidate state to P98M2T04.
--
-- Rollback:
--   See /home/pi5/projects/kurabe/db/rollback-p98-mark-legacy-password-setup.sql
-- ============================================================

BEGIN;

DO $$
DECLARE
  v_col_type text;
  v_col_comment text;
  v_eligible_count integer;
  v_affected_count integer;
  v_unmigrated_count integer;
BEGIN
  -- ------------------------------------------------------------
  -- 1. PREFLIGHT CHECKS: Schema shape & provenance (Fail Closed)
  -- ------------------------------------------------------------
  -- Verify public.users table exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'users'
  ) THEN
    RAISE EXCEPTION 'P98M2T04_PREFLIGHT_FAILED: public.users table not found';
  END IF;

  -- Verify public.users.password_hash column exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name = 'password_hash'
  ) THEN
    RAISE EXCEPTION 'P98M2T04_PREFLIGHT_FAILED: public.users.password_hash column not found';
  END IF;

  -- Verify public.users.password_setup_required column exists and is boolean
  SELECT data_type INTO v_col_type
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'users'
    AND column_name = 'password_setup_required';

  IF v_col_type IS NULL THEN
    RAISE EXCEPTION 'P98M2T04_PREFLIGHT_FAILED: public.users.password_setup_required column not found (prerequisite P98M2T01 missing)';
  ELSIF v_col_type != 'boolean' THEN
    RAISE EXCEPTION 'P98M2T04_PREFLIGHT_FAILED: public.users.password_setup_required has unexpected data type "%" (expected boolean)', v_col_type;
  END IF;

  -- Verify no NULL values exist in public.users.password_setup_required
  IF EXISTS (
    SELECT 1 FROM public.users
    WHERE password_setup_required IS NULL
  ) THEN
    RAISE EXCEPTION 'P98M2T04_PREFLIGHT_FAILED: public.users.password_setup_required contains NULL values';
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
    'P98: Flag indicating user must set up password before normal login; NULL password_hash no longer represents a valid normal credential',
    'P98M2T04: Flag indicating user must set up password before normal login; legacy NULL-password accounts marked setup-required'
  ) THEN
    RAISE EXCEPTION 'P98M2T04_PREFLIGHT_FAILED: public.users.password_setup_required column provenance marker missing or unexpected (found: "%")', COALESCE(v_col_comment, '<none>');
  END IF;

  -- ------------------------------------------------------------
  -- 2. PREDICATE STABILITY & PREFLIGHT ELIGIBLE COUNT
  -- ------------------------------------------------------------
  -- Lock public.users in SHARE ROW EXCLUSIVE MODE to prevent concurrent DML between count and update
  LOCK TABLE public.users IN SHARE ROW EXCLUSIVE MODE;

  -- Capture exact preflight count of legacy accounts where password_hash IS NULL
  SELECT count(*)
  INTO v_eligible_count
  FROM public.users
  WHERE password_hash IS NULL;

  -- ------------------------------------------------------------
  -- 3. CANDIDATE DML UPDATE
  -- ------------------------------------------------------------
  -- Mark only legacy NULL-password rows as setup-required
  -- Never sets or creates passwords, never touches tokens or sessions, never alters unrelated rows
  UPDATE public.users
  SET password_setup_required = true
  WHERE password_hash IS NULL;

  GET DIAGNOSTICS v_affected_count = ROW_COUNT;

  -- ------------------------------------------------------------
  -- 4. ASSERT AFFECTED COUNT EQUALS PREFLIGHT ELIGIBLE COUNT
  -- ------------------------------------------------------------
  IF v_affected_count != v_eligible_count THEN
    RAISE EXCEPTION 'P98M2T04_ROW_COUNT_MISMATCH: Preflight eligible count (%) does not match updated count (%)', v_eligible_count, v_affected_count;
  END IF;

  -- ------------------------------------------------------------
  -- 5. POSTCONDITION INTEGRITY ASSERTION
  -- ------------------------------------------------------------
  SELECT count(*)
  INTO v_unmigrated_count
  FROM public.users
  WHERE password_hash IS NULL
    AND password_setup_required IS DISTINCT FROM true;

  IF v_unmigrated_count > 0 THEN
    RAISE EXCEPTION 'P98M2T04_POSTCONDITION_FAILED: % legacy NULL-password row(s) remain with password_setup_required != true', v_unmigrated_count;
  END IF;
END $$;

-- ------------------------------------------------------------
-- 6. PROVENANCE MARKER BINDING
-- ------------------------------------------------------------
COMMENT ON COLUMN public.users.password_setup_required IS
  'P98M2T04: Flag indicating user must set up password before normal login; legacy NULL-password accounts marked setup-required';

COMMIT;
