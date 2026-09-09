-- ============================================================
-- CANDIDATE ONLY — NOT APPLIED
-- KURABE QAQC — Migration P98M2T10: Reconcile Pre-Existing login_attempts Collision
-- DO NOT APPLY DIRECTLY WITHOUT SEPARATE APPROVAL AND DIRECT CATALOG GATE
-- ============================================================
-- Purpose:
--   Establish a local/disposable, reversible, fail-closed reconciliation candidate
--   for the pre-existing public.login_attempts collision:
--     1. Validates prerequisite public.users table exists.
--     2. Inspects public.login_attempts:
--        - If absent (Clean baseline): creates public.login_attempts ordinary table,
--          converges RLS to ENABLED, force-RLS to FALSE, and zero policies.
--        - If present (Production-like collision baseline): enforces strict fingerprint:
--            * ordinary table, owned by postgres (or current administrative role)
--            * row-level security enabled, force-RLS disabled, 0 RLS policies
--            * exactly 4 columns: id (uuid, default gen_random_uuid), employee_code (text, not null),
--              ip (text, not null), attempted_at (timestamptz, not null, default now())
--            * primary key login_attempts_pkey on (id); 0 foreign keys, 0 check constraints
--            * legacy index idx_login_attempts_code_ip_time on (employee_code, ip, attempted_at) exists and valid
--            * 0 user triggers, 0 rules, 0 dependent views
--            * exact T09 table grant fingerprint:
--                - authenticated: DELETE/INSERT/REFERENCES/SELECT/TRIGGER/TRUNCATE/UPDATE (not grantable)
--                - service_role: DELETE/INSERT/REFERENCES/SELECT/TRIGGER/TRUNCATE/UPDATE (not grantable)
--                - postgres owner: DELETE/INSERT/REFERENCES/SELECT/TRIGGER/TRUNCATE/UPDATE (grantable YES)
--                - anon: NO table privileges
--                - zero unexpected grantee privileges
--            * table provenance: no pre-existing comment (or already carries exact reconciliation marker)
--            * candidate RPCs absent or carry exact candidate provenance marker for that signature;
--              rejects broad prefixes or unexpected overloads
--     3. Preserves all existing rows and runtime behavior without table removal, rename, or rewrite.
--     4. Retains legacy index idx_login_attempts_code_ip_time.
--     5. Creates target candidate indexes if not present:
--        - idx_login_attempts_code_time ON (employee_code, attempted_at)
--        - idx_login_attempts_ip_time ON (ip, attempted_at)
--        - idx_login_attempts_attempted_at ON (attempted_at)
--     6. Establishes reviewed transactional SECURITY DEFINER functions:
--        - check_login_rate_limit
--        - record_failed_login_transaction
--        - clear_login_attempts
--     7. Sets exact provenance markers on table and candidate functions.
--     8. Enforces security execution boundary:
--        - REVOKE ALL from PUBLIC, anon, authenticated
--        - GRANT EXECUTE strictly to service_role
--     9. Verifies postcondition: row count AND row data signature are preserved; RLS enabled, force-RLS false, 0 policies.
-- ============================================================

BEGIN;

-- 1. Snapshot and Preflight Verification DO Block (Fail-Closed)
CREATE TEMP TABLE _p98m2t10_preflight_snapshot (
  table_existed boolean NOT NULL,
  initial_row_count bigint NOT NULL,
  initial_row_signature text NOT NULL
) ON COMMIT DROP;

DO $$
DECLARE
  v_table_oid oid;
  v_relkind "char";
  v_rowsecurity boolean;
  v_forcerowsecurity boolean;
  v_owner text;
  v_policy_count integer;
  v_col_count integer;
  v_pk_name text;
  v_fk_count integer;
  v_ck_count integer;
  v_idx_valid boolean;
  v_idx_def text;
  v_trig_count integer;
  v_rule_count integer;
  v_view_dep_count integer;
  v_row_count bigint := 0;
  v_row_sig text := 'empty';
  v_table_comment text;
  v_func_oid oid;
  v_func_comment text;
  v_col_type text;
  v_col_nullable text;
  v_col_default text;
BEGIN
  -- 1. Prerequisite: verify public.users table exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'users'
  ) THEN
    RAISE EXCEPTION 'P98M2T10_PREFLIGHT_FAILED: public.users table not found';
  END IF;

  -- 2. Inspect public.login_attempts
  SELECT c.oid, c.relkind, c.relrowsecurity, c.relforcerowsecurity, r.rolname
  INTO v_table_oid, v_relkind, v_rowsecurity, v_forcerowsecurity, v_owner
  FROM pg_class c
  JOIN pg_namespace n ON c.relnamespace = n.oid
  JOIN pg_roles r ON c.relowner = r.oid
  WHERE n.nspname = 'public' AND c.relname = 'login_attempts';

  IF v_table_oid IS NOT NULL THEN
    -- Table pre-exists: validate exact production collision fingerprint

    -- (a) Ordinary table
    IF v_relkind != 'r' THEN
      RAISE EXCEPTION 'P98M2T10_PREFLIGHT_FAILED: public.login_attempts is not an ordinary table (relkind=%)', v_relkind;
    END IF;

    -- (b) Ownership: postgres or current administrative role
    IF v_owner != 'postgres' AND v_owner != current_user THEN
      RAISE EXCEPTION 'P98M2T10_PREFLIGHT_FAILED: public.login_attempts has unexpected owner "%"', v_owner;
    END IF;

    -- (c) Row Level Security: enabled, not forced
    IF NOT v_rowsecurity THEN
      RAISE EXCEPTION 'P98M2T10_PREFLIGHT_FAILED: public.login_attempts does not have row level security enabled';
    END IF;

    IF v_forcerowsecurity THEN
      RAISE EXCEPTION 'P98M2T10_PREFLIGHT_FAILED: public.login_attempts has forced row level security enabled';
    END IF;

    -- (d) Policies: must have 0 policies
    SELECT count(*) INTO v_policy_count FROM pg_policy WHERE polrelid = v_table_oid;
    IF v_policy_count > 0 THEN
      RAISE EXCEPTION 'P98M2T10_PREFLIGHT_FAILED: public.login_attempts has unexpected row security policies (count=%)', v_policy_count;
    END IF;

    -- (e) Column count: exactly 4 user columns
    SELECT count(*) INTO v_col_count
    FROM pg_attribute
    WHERE attrelid = v_table_oid AND attnum > 0 AND NOT attisdropped;

    IF v_col_count != 4 THEN
      RAISE EXCEPTION 'P98M2T10_PREFLIGHT_FAILED: public.login_attempts column count mismatch (expected 4, found %)', v_col_count;
    END IF;

    -- (f) Column 1: id (uuid NOT NULL DEFAULT gen_random_uuid())
    SELECT data_type, is_nullable, column_default
    INTO v_col_type, v_col_nullable, v_col_default
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'login_attempts' AND column_name = 'id';

    IF v_col_type IS NULL OR v_col_type != 'uuid' OR v_col_nullable != 'NO' OR v_col_default NOT LIKE '%gen_random_uuid()%' THEN
      RAISE EXCEPTION 'P98M2T10_PREFLIGHT_FAILED: column public.login_attempts.id fingerprint mismatch (type=%, nullable=%, default=%)',
        v_col_type, v_col_nullable, v_col_default;
    END IF;

    -- (g) Column 2: employee_code (text NOT NULL, no default)
    SELECT data_type, is_nullable, column_default
    INTO v_col_type, v_col_nullable, v_col_default
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'login_attempts' AND column_name = 'employee_code';

    IF v_col_type IS NULL OR v_col_type != 'text' OR v_col_nullable != 'NO' OR v_col_default IS NOT NULL THEN
      RAISE EXCEPTION 'P98M2T10_PREFLIGHT_FAILED: column public.login_attempts.employee_code fingerprint mismatch (type=%, nullable=%, default=%)',
        v_col_type, v_col_nullable, v_col_default;
    END IF;

    -- (h) Column 3: ip (text NOT NULL, no default)
    SELECT data_type, is_nullable, column_default
    INTO v_col_type, v_col_nullable, v_col_default
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'login_attempts' AND column_name = 'ip';

    IF v_col_type IS NULL OR v_col_type != 'text' OR v_col_nullable != 'NO' OR v_col_default IS NOT NULL THEN
      RAISE EXCEPTION 'P98M2T10_PREFLIGHT_FAILED: column public.login_attempts.ip fingerprint mismatch (type=%, nullable=%, default=%)',
        v_col_type, v_col_nullable, v_col_default;
    END IF;

    -- (i) Column 4: attempted_at (timestamptz NOT NULL DEFAULT now())
    SELECT data_type, is_nullable, column_default
    INTO v_col_type, v_col_nullable, v_col_default
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'login_attempts' AND column_name = 'attempted_at';

    IF v_col_type IS NULL OR v_col_type NOT IN ('timestamp with time zone', 'timestamptz') OR v_col_nullable != 'NO' OR v_col_default NOT LIKE '%now()%' THEN
      RAISE EXCEPTION 'P98M2T10_PREFLIGHT_FAILED: column public.login_attempts.attempted_at fingerprint mismatch (type=%, nullable=%, default=%)',
        v_col_type, v_col_nullable, v_col_default;
    END IF;

    -- (j) Primary Key: login_attempts_pkey on (id)
    SELECT conname INTO v_pk_name
    FROM pg_constraint
    WHERE conrelid = v_table_oid AND contype = 'p';

    IF v_pk_name IS NULL OR v_pk_name != 'login_attempts_pkey' THEN
      RAISE EXCEPTION 'P98M2T10_PREFLIGHT_FAILED: primary key login_attempts_pkey missing or mismatched (found: "%")', COALESCE(v_pk_name, '<none>');
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint con
      JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = ANY(con.conkey)
      WHERE con.conrelid = v_table_oid AND con.contype = 'p' AND att.attname = 'id'
    ) THEN
      RAISE EXCEPTION 'P98M2T10_PREFLIGHT_FAILED: primary key login_attempts_pkey is not on column id';
    END IF;

    -- (k) No Foreign Keys
    SELECT count(*) INTO v_fk_count FROM pg_constraint WHERE conrelid = v_table_oid AND contype = 'f';
    IF v_fk_count > 0 THEN
      RAISE EXCEPTION 'P98M2T10_PREFLIGHT_FAILED: unexpected foreign keys on public.login_attempts (count=%)', v_fk_count;
    END IF;

    -- (l) No Check Constraints
    SELECT count(*) INTO v_ck_count FROM pg_constraint WHERE conrelid = v_table_oid AND contype = 'c';
    IF v_ck_count > 0 THEN
      RAISE EXCEPTION 'P98M2T10_PREFLIGHT_FAILED: unexpected check constraints on public.login_attempts (count=%)', v_ck_count;
    END IF;

    -- (m) Legacy index: idx_login_attempts_code_ip_time on (employee_code, ip, attempted_at)
    SELECT i.indisvalid, pg_get_indexdef(i.indexrelid)
    INTO v_idx_valid, v_idx_def
    FROM pg_index i
    JOIN pg_class ic ON i.indexrelid = ic.oid
    WHERE i.indrelid = v_table_oid AND ic.relname = 'idx_login_attempts_code_ip_time';

    IF v_idx_valid IS NULL OR NOT v_idx_valid THEN
      RAISE EXCEPTION 'P98M2T10_PREFLIGHT_FAILED: legacy index idx_login_attempts_code_ip_time missing or invalid';
    END IF;

    IF v_idx_def NOT LIKE '%(employee_code, ip, attempted_at)%' THEN
      RAISE EXCEPTION 'P98M2T10_PREFLIGHT_FAILED: legacy index idx_login_attempts_code_ip_time definition mismatch: "%"', v_idx_def;
    END IF;

    -- (n) No Triggers
    SELECT count(*) INTO v_trig_count FROM pg_trigger WHERE tgrelid = v_table_oid AND NOT tgisinternal;
    IF v_trig_count > 0 THEN
      RAISE EXCEPTION 'P98M2T10_PREFLIGHT_FAILED: unexpected user triggers on public.login_attempts (count=%)', v_trig_count;
    END IF;

    -- (o) No Rules
    SELECT count(*) INTO v_rule_count FROM pg_rewrite WHERE ev_class = v_table_oid AND rulename != '_RETURN';
    IF v_rule_count > 0 THEN
      RAISE EXCEPTION 'P98M2T10_PREFLIGHT_FAILED: unexpected rewrite rules on public.login_attempts (count=%)', v_rule_count;
    END IF;

    -- (p) No Dependent Views
    SELECT count(*) INTO v_view_dep_count
    FROM pg_depend dep
    JOIN pg_rewrite rw ON dep.objid = rw.oid
    JOIN pg_class c ON rw.ev_class = c.oid
    WHERE dep.refobjid = v_table_oid AND c.relkind = 'v';

    IF v_view_dep_count > 0 THEN
      RAISE EXCEPTION 'P98M2T10_PREFLIGHT_FAILED: unexpected dependent views on public.login_attempts (count=%)', v_view_dep_count;
    END IF;

    -- (q) Table Grants: exact T09 grant fingerprint
    -- 1. anon must have NO table privileges
    IF EXISTS (
      SELECT 1 FROM information_schema.table_privileges
      WHERE table_schema = 'public' AND table_name = 'login_attempts' AND grantee = 'anon'
    ) THEN
      RAISE EXCEPTION 'P98M2T10_PREFLIGHT_FAILED: role anon has unexpected table privileges on public.login_attempts';
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
      IF has_table_privilege('anon', v_table_oid, 'SELECT')
         OR has_table_privilege('anon', v_table_oid, 'INSERT')
         OR has_table_privilege('anon', v_table_oid, 'UPDATE')
         OR has_table_privilege('anon', v_table_oid, 'DELETE')
         OR has_table_privilege('anon', v_table_oid, 'TRUNCATE')
         OR has_table_privilege('anon', v_table_oid, 'REFERENCES')
         OR has_table_privilege('anon', v_table_oid, 'TRIGGER') THEN
        RAISE EXCEPTION 'P98M2T10_PREFLIGHT_FAILED: role anon has unexpected table privileges on public.login_attempts';
      END IF;
    END IF;

    -- 2. authenticated must have exactly 7 privileges (DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE), not grantable
    IF (
      SELECT count(*) FROM information_schema.table_privileges
      WHERE table_schema = 'public' AND table_name = 'login_attempts'
        AND grantee = 'authenticated'
        AND is_grantable = 'NO'
        AND privilege_type IN ('DELETE', 'INSERT', 'REFERENCES', 'SELECT', 'TRIGGER', 'TRUNCATE', 'UPDATE')
    ) != 7 OR (
      SELECT count(*) FROM information_schema.table_privileges
      WHERE table_schema = 'public' AND table_name = 'login_attempts'
        AND grantee = 'authenticated'
    ) != 7 THEN
      RAISE EXCEPTION 'P98M2T10_PREFLIGHT_FAILED: role authenticated table grant fingerprint mismatch on public.login_attempts';
    END IF;

    -- 3. service_role must have exactly 7 privileges (DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE), not grantable
    IF (
      SELECT count(*) FROM information_schema.table_privileges
      WHERE table_schema = 'public' AND table_name = 'login_attempts'
        AND grantee = 'service_role'
        AND is_grantable = 'NO'
        AND privilege_type IN ('DELETE', 'INSERT', 'REFERENCES', 'SELECT', 'TRIGGER', 'TRUNCATE', 'UPDATE')
    ) != 7 OR (
      SELECT count(*) FROM information_schema.table_privileges
      WHERE table_schema = 'public' AND table_name = 'login_attempts'
        AND grantee = 'service_role'
    ) != 7 THEN
      RAISE EXCEPTION 'P98M2T10_PREFLIGHT_FAILED: role service_role table grant fingerprint mismatch on public.login_attempts';
    END IF;

    -- 4. owner must have exactly 7 privileges (DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE), grantable YES
    IF (
      SELECT count(*) FROM information_schema.table_privileges
      WHERE table_schema = 'public' AND table_name = 'login_attempts'
        AND grantee = v_owner
        AND is_grantable = 'YES'
        AND privilege_type IN ('DELETE', 'INSERT', 'REFERENCES', 'SELECT', 'TRIGGER', 'TRUNCATE', 'UPDATE')
    ) != 7 OR (
      SELECT count(*) FROM information_schema.table_privileges
      WHERE table_schema = 'public' AND table_name = 'login_attempts'
        AND grantee = v_owner
    ) != 7 THEN
      RAISE EXCEPTION 'P98M2T10_PREFLIGHT_FAILED: owner table grant fingerprint mismatch on public.login_attempts';
    END IF;

    -- 5. No other grantee allowed on public.login_attempts
    IF EXISTS (
      SELECT 1 FROM information_schema.table_privileges
      WHERE table_schema = 'public' AND table_name = 'login_attempts'
        AND grantee NOT IN (v_owner, 'authenticated', 'service_role')
    ) THEN
      RAISE EXCEPTION 'P98M2T10_PREFLIGHT_FAILED: unexpected grantee privileges on public.login_attempts';
    END IF;

    -- (r) Table Provenance: baseline has no pre-existing comment
    SELECT description INTO v_table_comment
    FROM pg_description
    WHERE objoid = v_table_oid AND classoid = 'pg_class'::regclass AND objsubid = 0;

    IF v_table_comment IS NOT NULL AND v_table_comment != 'kurabe:p98:reconcile:v1:table:login_attempts' THEN
      RAISE EXCEPTION 'P98M2T10_PREFLIGHT_FAILED: public.login_attempts has unexpected pre-existing table comment "%"', v_table_comment;
    END IF;

    -- Capture snapshot of pre-existing row count and signature
    EXECUTE 'SELECT count(*), coalesce(md5(string_agg(id::text || ''|'' || employee_code || ''|'' || ip || ''|'' || attempted_at::text, '','' ORDER BY id)), ''empty'') FROM public.login_attempts'
    INTO v_row_count, v_row_sig;
    INSERT INTO _p98m2t10_preflight_snapshot VALUES (true, v_row_count, v_row_sig);
  ELSE
    -- Table does not exist (Clean baseline)
    INSERT INTO _p98m2t10_preflight_snapshot VALUES (false, 0, 'empty');
  END IF;

  -- 3. Candidate RPC Pre-checks:
  -- Verify no unexpected function overloads with different signatures exist
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
      AND p.proname = 'check_login_rate_limit'
      AND p.oid != COALESCE(to_regprocedure('public.check_login_rate_limit(text, text, integer, integer, integer)')::oid, 0)
  ) THEN
    RAISE EXCEPTION 'P98M2T10_PREFLIGHT_FAILED: function public.check_login_rate_limit has unexpected signature/overload';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
      AND p.proname = 'record_failed_login_transaction'
      AND p.oid != COALESCE(to_regprocedure('public.record_failed_login_transaction(text, text, integer, integer, integer)')::oid, 0)
  ) THEN
    RAISE EXCEPTION 'P98M2T10_PREFLIGHT_FAILED: function public.record_failed_login_transaction has unexpected signature/overload';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
      AND p.proname = 'clear_login_attempts'
      AND p.oid != COALESCE(to_regprocedure('public.clear_login_attempts(text, text)')::oid, 0)
  ) THEN
    RAISE EXCEPTION 'P98M2T10_PREFLIGHT_FAILED: function public.clear_login_attempts has unexpected signature/overload';
  END IF;

  -- Verify exact provenance on existing candidate RPCs
  v_func_oid := to_regprocedure('public.check_login_rate_limit(text, text, integer, integer, integer)')::oid;
  IF v_func_oid IS NOT NULL THEN
    SELECT description INTO v_func_comment
    FROM pg_description
    WHERE objoid = v_func_oid AND classoid = 'pg_proc'::regclass AND objsubid = 0;
    IF v_func_comment IS NULL OR v_func_comment != 'kurabe:p98:candidate:v1:function:check_login_rate_limit' THEN
      RAISE EXCEPTION 'P98M2T10_PREFLIGHT_FAILED: function public.check_login_rate_limit has unexpected provenance "%"', COALESCE(v_func_comment, '<none>');
    END IF;
  END IF;

  v_func_oid := to_regprocedure('public.record_failed_login_transaction(text, text, integer, integer, integer)')::oid;
  IF v_func_oid IS NOT NULL THEN
    SELECT description INTO v_func_comment
    FROM pg_description
    WHERE objoid = v_func_oid AND classoid = 'pg_proc'::regclass AND objsubid = 0;
    IF v_func_comment IS NULL OR v_func_comment != 'kurabe:p98:candidate:v1:function:record_failed_login_transaction' THEN
      RAISE EXCEPTION 'P98M2T10_PREFLIGHT_FAILED: function public.record_failed_login_transaction has unexpected provenance "%"', COALESCE(v_func_comment, '<none>');
    END IF;
  END IF;

  v_func_oid := to_regprocedure('public.clear_login_attempts(text, text)')::oid;
  IF v_func_oid IS NOT NULL THEN
    SELECT description INTO v_func_comment
    FROM pg_description
    WHERE objoid = v_func_oid AND classoid = 'pg_proc'::regclass AND objsubid = 0;
    IF v_func_comment IS NULL OR v_func_comment != 'kurabe:p98:candidate:v1:function:clear_login_attempts' THEN
      RAISE EXCEPTION 'P98M2T10_PREFLIGHT_FAILED: function public.clear_login_attempts has unexpected provenance "%"', COALESCE(v_func_comment, '<none>');
    END IF;
  END IF;
END $$;

-- 2. Ensure login_attempts table exists (creates only on clean baseline; preserves existing table)
CREATE TABLE IF NOT EXISTS public.login_attempts (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_code text NOT NULL,
  ip text NOT NULL,
  attempted_at timestamptz DEFAULT now() NOT NULL
);

-- Explicitly converge RLS to ENABLED and force-RLS to FALSE
ALTER TABLE public.login_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.login_attempts NO FORCE ROW LEVEL SECURITY;

-- 3. Ensure candidate index structures exist (retains legacy idx_login_attempts_code_ip_time)
CREATE INDEX IF NOT EXISTS idx_login_attempts_code_time
  ON public.login_attempts (employee_code, attempted_at);

CREATE INDEX IF NOT EXISTS idx_login_attempts_ip_time
  ON public.login_attempts (ip, attempted_at);

CREATE INDEX IF NOT EXISTS idx_login_attempts_attempted_at
  ON public.login_attempts (attempted_at);

-- 4. Function: check_login_rate_limit
CREATE OR REPLACE FUNCTION public.check_login_rate_limit(
  p_employee_code text,
  p_ip text,
  p_window_seconds integer DEFAULT 900,
  p_max_account_attempts integer DEFAULT 5,
  p_max_ip_attempts integer DEFAULT 25
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
SET search_path = public
AS $$
DECLARE
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
BEGIN
  IF p_employee_code IS NULL OR trim(p_employee_code) = '' THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: p_employee_code cannot be null or empty';
  END IF;

  IF p_ip IS NULL OR trim(p_ip) = '' THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: p_ip cannot be null or empty';
  END IF;

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

  v_window_start := now() - (p_window_seconds || ' seconds')::interval;

  -- 1. Account-level failure count within sliding window
  SELECT count(*)::integer, min(attempted_at)
  INTO v_account_count, v_oldest_account_attempt
  FROM public.login_attempts
  WHERE employee_code = v_clean_code
    AND attempted_at >= v_window_start;

  -- 2. Network-level failure count within sliding window
  SELECT count(*)::integer, min(attempted_at)
  INTO v_ip_count, v_oldest_ip_attempt
  FROM public.login_attempts
  WHERE ip = v_clean_ip
    AND attempted_at >= v_window_start;

  -- 3. Threshold evaluation (account priority over network)
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

  RETURN QUERY
  SELECT
    NOT v_locked AS allowed,
    v_account_count,
    v_ip_count,
    v_locked_by,
    v_retry_after;
END;
$$;

-- 5. Function: record_failed_login_transaction
CREATE OR REPLACE FUNCTION public.record_failed_login_transaction(
  p_employee_code text,
  p_ip text,
  p_window_seconds integer DEFAULT 900,
  p_max_account_attempts integer DEFAULT 5,
  p_max_ip_attempts integer DEFAULT 25
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
SET search_path = public
AS $$
DECLARE
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
BEGIN
  IF p_employee_code IS NULL OR trim(p_employee_code) = '' THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: p_employee_code cannot be null or empty';
  END IF;

  IF p_ip IS NULL OR trim(p_ip) = '' THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: p_ip cannot be null or empty';
  END IF;

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

  -- Concurrency control: acquire transactional advisory locks per account and IP
  PERFORM pg_advisory_xact_lock(hashtext('kurabe:login_limit:account:' || v_clean_code));
  PERFORM pg_advisory_xact_lock(hashtext('kurabe:login_limit:ip:' || v_clean_ip));

  -- Insert new failure record
  INSERT INTO public.login_attempts (employee_code, ip, attempted_at)
  VALUES (v_clean_code, v_clean_ip, now());

  -- Bounded retention: opportunistically prune entries older than 30 days
  DELETE FROM public.login_attempts
  WHERE attempted_at < (now() - interval '30 days');

  v_window_start := now() - (p_window_seconds || ' seconds')::interval;

  -- Count updated attempts within window
  SELECT count(*)::integer, min(attempted_at)
  INTO v_account_count, v_oldest_account_attempt
  FROM public.login_attempts
  WHERE employee_code = v_clean_code
    AND attempted_at >= v_window_start;

  SELECT count(*)::integer, min(attempted_at)
  INTO v_ip_count, v_oldest_ip_attempt
  FROM public.login_attempts
  WHERE ip = v_clean_ip
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

  RETURN QUERY
  SELECT
    NOT v_locked AS allowed,
    v_account_count,
    v_ip_count,
    v_locked_by,
    v_retry_after;
END;
$$;

-- 6. Function: clear_login_attempts
CREATE OR REPLACE FUNCTION public.clear_login_attempts(
  p_employee_code text,
  p_ip text DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clean_code text;
  v_clean_ip text;
  v_deleted_count integer := 0;
BEGIN
  IF p_employee_code IS NULL OR trim(p_employee_code) = '' THEN
    RAISE EXCEPTION 'INVALID_ARGUMENT: p_employee_code cannot be null or empty';
  END IF;

  v_clean_code := trim(p_employee_code);
  v_clean_ip := CASE WHEN p_ip IS NOT NULL AND trim(p_ip) != '' THEN trim(p_ip) ELSE NULL END;

  IF v_clean_ip IS NOT NULL THEN
    WITH deleted AS (
      DELETE FROM public.login_attempts
      WHERE employee_code = v_clean_code
        AND ip = v_clean_ip
      RETURNING id
    )
    SELECT count(*)::integer INTO v_deleted_count FROM deleted;
  ELSE
    WITH deleted AS (
      DELETE FROM public.login_attempts
      WHERE employee_code = v_clean_code
      RETURNING id
    )
    SELECT count(*)::integer INTO v_deleted_count FROM deleted;
  END IF;

  RETURN v_deleted_count;
END;
$$;

-- 7. Provenance markers
COMMENT ON TABLE public.login_attempts IS
  'kurabe:p98:reconcile:v1:table:login_attempts';

COMMENT ON FUNCTION public.check_login_rate_limit(text, text, integer, integer, integer) IS
  'kurabe:p98:candidate:v1:function:check_login_rate_limit';

COMMENT ON FUNCTION public.record_failed_login_transaction(text, text, integer, integer, integer) IS
  'kurabe:p98:candidate:v1:function:record_failed_login_transaction';

COMMENT ON FUNCTION public.clear_login_attempts(text, text) IS
  'kurabe:p98:candidate:v1:function:clear_login_attempts';

-- 8. Security Grants
REVOKE ALL ON FUNCTION public.check_login_rate_limit(text, text, integer, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_login_rate_limit(text, text, integer, integer, integer) TO service_role;

REVOKE ALL ON FUNCTION public.record_failed_login_transaction(text, text, integer, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_failed_login_transaction(text, text, integer, integer, integer) TO service_role;

REVOKE ALL ON FUNCTION public.clear_login_attempts(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.clear_login_attempts(text, text) TO service_role;

-- 9. Postcondition check (Fail closed on any row mutation or security regression)
DO $$
DECLARE
  v_existed boolean;
  v_initial bigint;
  v_final bigint;
  v_initial_sig text;
  v_final_sig text;
  v_table_oid oid;
  v_rowsecurity boolean;
  v_forcerowsecurity boolean;
  v_policy_count integer;
  v_idx_valid boolean;
BEGIN
  SELECT table_existed, initial_row_count, initial_row_signature
  INTO v_existed, v_initial, v_initial_sig
  FROM _p98m2t10_preflight_snapshot;

  IF v_existed THEN
    EXECUTE 'SELECT count(*), coalesce(md5(string_agg(id::text || ''|'' || employee_code || ''|'' || ip || ''|'' || attempted_at::text, '','' ORDER BY id)), ''empty'') FROM public.login_attempts'
    INTO v_final, v_final_sig;

    IF v_final != v_initial THEN
      RAISE EXCEPTION 'P98M2T10_POSTCONDITION_FAILED: login_attempts row count mutated (initial=%, final=%)', v_initial, v_final;
    END IF;

    IF v_final_sig != v_initial_sig THEN
      RAISE EXCEPTION 'P98M2T10_POSTCONDITION_FAILED: login_attempts row data signature mutated (initial=%, final=%)', v_initial_sig, v_final_sig;
    END IF;

    -- Legacy index must remain valid
    SELECT i.indisvalid INTO v_idx_valid
    FROM pg_index i
    JOIN pg_class ic ON i.indexrelid = ic.oid
    JOIN pg_namespace n ON ic.relnamespace = n.oid
    WHERE n.nspname = 'public' AND ic.relname = 'idx_login_attempts_code_ip_time';

    IF v_idx_valid IS NULL OR NOT v_idx_valid THEN
      RAISE EXCEPTION 'P98M2T10_POSTCONDITION_FAILED: legacy index idx_login_attempts_code_ip_time missing or invalid';
    END IF;
  END IF;

  -- Postcondition invariant: table MUST have RLS enabled, force-RLS disabled, and zero policies
  SELECT c.oid, c.relrowsecurity, c.relforcerowsecurity
  INTO v_table_oid, v_rowsecurity, v_forcerowsecurity
  FROM pg_class c
  JOIN pg_namespace n ON c.relnamespace = n.oid
  WHERE n.nspname = 'public' AND c.relname = 'login_attempts';

  IF v_table_oid IS NULL THEN
    RAISE EXCEPTION 'P98M2T10_POSTCONDITION_FAILED: public.login_attempts table not found';
  END IF;

  IF NOT v_rowsecurity THEN
    RAISE EXCEPTION 'P98M2T10_POSTCONDITION_FAILED: public.login_attempts does not have row level security enabled';
  END IF;

  IF v_forcerowsecurity THEN
    RAISE EXCEPTION 'P98M2T10_POSTCONDITION_FAILED: public.login_attempts has forced row level security enabled';
  END IF;

  SELECT count(*) INTO v_policy_count FROM pg_policy WHERE polrelid = v_table_oid;
  IF v_policy_count > 0 THEN
    RAISE EXCEPTION 'P98M2T10_POSTCONDITION_FAILED: public.login_attempts has unexpected row security policies (count=%)', v_policy_count;
  END IF;
END $$;

COMMIT;
