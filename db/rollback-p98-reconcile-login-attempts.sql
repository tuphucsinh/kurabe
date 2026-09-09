-- ============================================================
-- ROLLBACK CANDIDATE ONLY — NOT APPLIED
-- KURABE QAQC — Rollback P98M2T10: Revert login_attempts Reconciliation Candidate
-- DO NOT EXECUTE DIRECTLY WITHOUT EXPLICIT APPROVAL AND GUC CONFIRMATION
-- ============================================================
-- Purpose:
--   Rollback candidate for migration 20260909000100_p98_reconcile_login_attempts.sql.
--   Reverses only candidate objects introduced or reconciled by P98M2T10:
--     1. Drops candidate functions:
--        - public.check_login_rate_limit(text, text, integer, integer, integer)
--        - public.record_failed_login_transaction(text, text, integer, integer, integer)
--        - public.clear_login_attempts(text, text)
--     2. Drops candidate indexes:
--        - public.idx_login_attempts_code_time
--        - public.idx_login_attempts_ip_time
--        - public.idx_login_attempts_attempted_at
--     3. Clears table provenance comment on public.login_attempts.
--
-- Safety & Production Runbook Constraints:
--   1. Candidate Only: DO NOT execute without separate approval and catalog verification.
--   2. External Session Approval Guard:
--      Requires setting:
--        SET kurabe.p98_rollback_approved = 'true';
--      in the active session before running. Does NOT set it internally.
--   3. Hermetic Transaction: Entire rollback runs in a single BEGIN ... COMMIT block.
--   4. Fail-Closed Preflight:
--      - Validates approval guard.
--      - Validates ownership and fingerprint of public.login_attempts:
--        ordinary table, owned by postgres (or current user), RLS enabled, 0 policies.
--      - Validates table provenance marker if present.
--      - Validates candidate function provenance markers before dropping.
--      - Fails closed on unexpected ownership, fingerprint, or provenance state.
--   5. Scoped Teardown:
--      - Retains table public.login_attempts and ALL existing rows.
--      - Retains legacy index idx_login_attempts_code_ip_time.
--      - Table public.login_attempts and all rows are retained intact; zero table destruction.
-- ============================================================

BEGIN;

CREATE TEMP TABLE _p98m2t10_rollback_snapshot (
  initial_row_count bigint NOT NULL,
  initial_row_signature text NOT NULL
) ON COMMIT DROP;

DO $$
DECLARE
  v_approved text;
  v_table_oid oid;
  v_relkind "char";
  v_rowsecurity boolean;
  v_forcerowsecurity boolean;
  v_owner text;
  v_policy_count integer;
  v_table_comment text;
  v_func_oid oid;
  v_func_comment text;
  v_row_count bigint := 0;
  v_row_sig text := 'empty';
  v_idx_valid boolean;
BEGIN
  -- 1. APPROVAL GUARD (Fail closed if GUC is not explicitly 'true')
  v_approved := current_setting('kurabe.p98_rollback_approved', true);
  IF v_approved IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'ROLLBACK_UNAPPROVED: Execution aborted. Custom GUC kurabe.p98_rollback_approved must be set to ''true'' in this session prior to running rollback candidate.';
  END IF;

  -- 2. TABLE OWNERSHIP & FINGERPRINT GUARD
  SELECT c.oid, c.relkind, c.relrowsecurity, c.relforcerowsecurity, r.rolname
  INTO v_table_oid, v_relkind, v_rowsecurity, v_forcerowsecurity, v_owner
  FROM pg_class c
  JOIN pg_namespace n ON c.relnamespace = n.oid
  JOIN pg_roles r ON c.relowner = r.oid
  WHERE n.nspname = 'public' AND c.relname = 'login_attempts';

  IF v_table_oid IS NULL THEN
    RAISE EXCEPTION 'P98_ROLLBACK_PREFLIGHT_FAILED: public.login_attempts table not found';
  END IF;

  -- (a) Must be ordinary table
  IF v_relkind != 'r' THEN
    RAISE EXCEPTION 'P98_ROLLBACK_PREFLIGHT_FAILED: public.login_attempts is not an ordinary table (relkind=%)', v_relkind;
  END IF;

  -- (b) Ownership
  IF v_owner != 'postgres' AND v_owner != current_user THEN
    RAISE EXCEPTION 'P98_ROLLBACK_PREFLIGHT_FAILED: public.login_attempts has unexpected owner "%"', v_owner;
  END IF;

  -- (c) RLS
  IF NOT v_rowsecurity THEN
    RAISE EXCEPTION 'P98_ROLLBACK_PREFLIGHT_FAILED: public.login_attempts does not have row level security enabled';
  END IF;

  IF v_forcerowsecurity THEN
    RAISE EXCEPTION 'P98_ROLLBACK_PREFLIGHT_FAILED: public.login_attempts has forced row level security enabled';
  END IF;

  -- (d) 0 Policies
  SELECT count(*) INTO v_policy_count FROM pg_policy WHERE polrelid = v_table_oid;
  IF v_policy_count > 0 THEN
    RAISE EXCEPTION 'P98_ROLLBACK_PREFLIGHT_FAILED: public.login_attempts has unexpected row security policies (count=%)', v_policy_count;
  END IF;

  -- (e) Table provenance check (MUST match reconciliation marker; null or mismatched fails closed)
  SELECT description INTO v_table_comment
  FROM pg_description
  WHERE objoid = v_table_oid AND classoid = 'pg_class'::regclass AND objsubid = 0;

  IF v_table_comment IS NULL OR v_table_comment != 'kurabe:p98:reconcile:v1:table:login_attempts' THEN
    RAISE EXCEPTION 'P98_ROLLBACK_PREFLIGHT_FAILED: public.login_attempts table provenance marker missing or mismatched (found: "%")', COALESCE(v_table_comment, '<none>');
  END IF;

  -- (f) Check legacy index is present if it existed
  SELECT i.indisvalid
  INTO v_idx_valid
  FROM pg_index i
  JOIN pg_class ic ON i.indexrelid = ic.oid
  WHERE i.indrelid = v_table_oid AND ic.relname = 'idx_login_attempts_code_ip_time';

  IF v_idx_valid IS NOT NULL AND NOT v_idx_valid THEN
    RAISE EXCEPTION 'P98_ROLLBACK_PREFLIGHT_FAILED: legacy index idx_login_attempts_code_ip_time is invalid';
  END IF;

  -- Capture row count and row data signature snapshot
  EXECUTE 'SELECT count(*), coalesce(md5(string_agg(id::text || ''|'' || employee_code || ''|'' || ip || ''|'' || attempted_at::text, '','' ORDER BY id)), ''empty'') FROM public.login_attempts'
  INTO v_row_count, v_row_sig;
  INSERT INTO _p98m2t10_rollback_snapshot VALUES (v_row_count, v_row_sig);

  -- 3. FUNCTION PROVENANCE GUARDS
  -- Check for unexpected function overloads with different signatures
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
      AND p.proname = 'check_login_rate_limit'
      AND p.oid != COALESCE(to_regprocedure('public.check_login_rate_limit(text, text, integer, integer, integer)')::oid, 0)
  ) THEN
    RAISE EXCEPTION 'P98_ROLLBACK_PREFLIGHT_FAILED: function public.check_login_rate_limit has unexpected signature/overload';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
      AND p.proname = 'record_failed_login_transaction'
      AND p.oid != COALESCE(to_regprocedure('public.record_failed_login_transaction(text, text, integer, integer, integer)')::oid, 0)
  ) THEN
    RAISE EXCEPTION 'P98_ROLLBACK_PREFLIGHT_FAILED: function public.record_failed_login_transaction has unexpected signature/overload';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
      AND p.proname = 'clear_login_attempts'
      AND p.oid != COALESCE(to_regprocedure('public.clear_login_attempts(text, text)')::oid, 0)
  ) THEN
    RAISE EXCEPTION 'P98_ROLLBACK_PREFLIGHT_FAILED: function public.clear_login_attempts has unexpected signature/overload';
  END IF;

  v_func_oid := to_regprocedure('public.check_login_rate_limit(text, text, integer, integer, integer)')::oid;
  IF v_func_oid IS NOT NULL THEN
    SELECT description INTO v_func_comment
    FROM pg_description
    WHERE objoid = v_func_oid AND classoid = 'pg_proc'::regclass AND objsubid = 0;

    IF v_func_comment IS NULL OR v_func_comment != 'kurabe:p98:candidate:v1:function:check_login_rate_limit' THEN
      RAISE EXCEPTION 'P98_ROLLBACK_PREFLIGHT_FAILED: Function public.check_login_rate_limit provenance marker missing or mismatched (found: "%")', COALESCE(v_func_comment, '<none>');
    END IF;
  END IF;

  v_func_oid := to_regprocedure('public.record_failed_login_transaction(text, text, integer, integer, integer)')::oid;
  IF v_func_oid IS NOT NULL THEN
    SELECT description INTO v_func_comment
    FROM pg_description
    WHERE objoid = v_func_oid AND classoid = 'pg_proc'::regclass AND objsubid = 0;

    IF v_func_comment IS NULL OR v_func_comment != 'kurabe:p98:candidate:v1:function:record_failed_login_transaction' THEN
      RAISE EXCEPTION 'P98_ROLLBACK_PREFLIGHT_FAILED: Function public.record_failed_login_transaction provenance marker missing or mismatched (found: "%")', COALESCE(v_func_comment, '<none>');
    END IF;
  END IF;

  v_func_oid := to_regprocedure('public.clear_login_attempts(text, text)')::oid;
  IF v_func_oid IS NOT NULL THEN
    SELECT description INTO v_func_comment
    FROM pg_description
    WHERE objoid = v_func_oid AND classoid = 'pg_proc'::regclass AND objsubid = 0;

    IF v_func_comment IS NULL OR v_func_comment != 'kurabe:p98:candidate:v1:function:clear_login_attempts' THEN
      RAISE EXCEPTION 'P98_ROLLBACK_PREFLIGHT_FAILED: Function public.clear_login_attempts provenance marker missing or mismatched (found: "%")', COALESCE(v_func_comment, '<none>');
    END IF;
  END IF;
END $$;

-- 2. Drop candidate functions
DROP FUNCTION IF EXISTS public.check_login_rate_limit(text, text, integer, integer, integer);
DROP FUNCTION IF EXISTS public.record_failed_login_transaction(text, text, integer, integer, integer);
DROP FUNCTION IF EXISTS public.clear_login_attempts(text, text);

-- 3. Drop candidate indexes
DROP INDEX IF EXISTS public.idx_login_attempts_code_time;
DROP INDEX IF EXISTS public.idx_login_attempts_ip_time;
DROP INDEX IF EXISTS public.idx_login_attempts_attempted_at;

-- 4. Reset table provenance marker if table exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'login_attempts'
  ) THEN
    EXECUTE 'COMMENT ON TABLE public.login_attempts IS NULL';
  END IF;
END $$;

-- 5. Postcondition verification: rows preserved, table not dropped
DO $$
DECLARE
  v_initial bigint;
  v_final bigint;
  v_initial_sig text;
  v_final_sig text;
  v_idx_valid boolean;
BEGIN
  SELECT initial_row_count, initial_row_signature INTO v_initial, v_initial_sig FROM _p98m2t10_rollback_snapshot;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'login_attempts'
  ) THEN
    RAISE EXCEPTION 'P98_ROLLBACK_POSTCONDITION_FAILED: public.login_attempts table was removed';
  END IF;

  EXECUTE 'SELECT count(*), coalesce(md5(string_agg(id::text || ''|'' || employee_code || ''|'' || ip || ''|'' || attempted_at::text, '','' ORDER BY id)), ''empty'') FROM public.login_attempts'
  INTO v_final, v_final_sig;

  IF v_final != v_initial THEN
    RAISE EXCEPTION 'P98_ROLLBACK_POSTCONDITION_FAILED: login_attempts row count mutated during rollback (initial=%, final=%)', v_initial, v_final;
  END IF;

  IF v_final_sig != v_initial_sig THEN
    RAISE EXCEPTION 'P98_ROLLBACK_POSTCONDITION_FAILED: login_attempts row data signature mutated during rollback';
  END IF;

  -- Verify legacy index is preserved if it existed
  SELECT i.indisvalid
  INTO v_idx_valid
  FROM pg_index i
  JOIN pg_class ic ON i.indexrelid = ic.oid
  JOIN pg_namespace n ON ic.relnamespace = n.oid
  WHERE n.nspname = 'public' AND ic.relname = 'idx_login_attempts_code_ip_time';

  IF v_idx_valid IS NOT NULL AND NOT v_idx_valid THEN
    RAISE EXCEPTION 'P98_ROLLBACK_POSTCONDITION_FAILED: legacy index idx_login_attempts_code_ip_time is invalid after rollback';
  END IF;
END $$;

COMMIT;
