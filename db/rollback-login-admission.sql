-- ============================================================
-- ROLLBACK CANDIDATE ONLY — NOT APPLIED
-- KURABE QAQC — Rollback P102M3T03: Revert Atomic Login Admission Contract
-- DO NOT EXECUTE DIRECTLY WITHOUT EXPLICIT APPROVAL AND GUC CONFIRMATION
-- ============================================================
-- Purpose:
--   Rollback candidate for migration 20260911000200_login_admission.sql.
--   Reverses exactly the objects introduced by P102M3T03:
--     1. Drops functions public.acquire_login_admission(text, text, text,
--        integer, integer, integer, integer) and
--        public.finalize_login_admission(text, text, text, boolean,
--        integer, integer, integer).
--     2. Drops candidate indexes uq_login_attempts_request_id and
--        idx_login_attempts_status_time.
--     3. Drops candidate columns request_id and status from
--        public.login_attempts.
--   The table public.login_attempts and historical attempt rows are
--   strictly preserved and NOT dropped or deleted by this rollback.
--
-- Safety & Production Runbook Constraints:
--   1. Candidate Only: DO NOT execute without separate approval and
--      catalog verification.
--   2. External Session Approval Guard:
--      Execution requires setting the custom PostgreSQL configuration setting:
--        SET kurabe.p102_rollback_approved = 'true';
--      in the active administrative session before running this script.
--      This script deliberately does NOT set this parameter internally.
--   3. Hermetic Transaction: Executes within a single BEGIN ... COMMIT block.
--   4. Fail-Closed Preflight: Validates ownership and provenance via exact
--      P102 comment markers on candidate functions before dropping. Fails
--      closed if candidate objects exist with absent or mismatched markers.
--   5. Scoped Teardown: Reverses ONLY objects introduced by P102M3T03.
--   6. Zero Mutation on Unrelated Objects: Does not drop tables, other
--      functions, or unrelated columns; preserves login attempt history.
-- ============================================================

BEGIN;

-- 1. Preflight check: fail closed on unapproved execution or provenance mismatch
DO $$
DECLARE
  v_approved text;
  v_acquire_oid oid;
  v_finalize_oid oid;
  v_atomic_oid oid;
  v_index_oid oid;
  v_status_index_oid oid;
  v_index_def text;
  v_index_table oid;
  v_index_unique boolean;
  v_status_index_def text;
  v_status_index_table oid;
  v_status_index_unique boolean;
  v_comment text;
  v_function_owner name;
  v_table_owner name;
  v_function_security_definer boolean;
  v_function_config text[];
  v_body_hash text;
  v_column_type text;
  v_column_not_null boolean;
  v_column_default text;
BEGIN
  -- ------------------------------------------------------------
  -- 1. APPROVAL GUARD (Fail closed if GUC is not explicitly 'true')
  -- ------------------------------------------------------------
  v_approved := current_setting('kurabe.p102_rollback_approved', true);
  IF v_approved IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'ROLLBACK_UNAPPROVED: Execution aborted. Custom GUC kurabe.p102_rollback_approved must be set to ''true'' in this session prior to running rollback candidate.';
  END IF;

  -- ------------------------------------------------------------
  -- 2. PREFLIGHT CHECKS: Fail closed on provenance mismatch
  -- ------------------------------------------------------------
  v_acquire_oid := to_regprocedure('public.acquire_login_admission(text, text, text, integer, integer, integer, integer)')::oid;
  IF v_acquire_oid IS NULL THEN
    RAISE EXCEPTION 'P102_ROLLBACK_PREFLIGHT_FAILED: acquire function missing';
  END IF;
  IF v_acquire_oid IS NOT NULL THEN
    SELECT description INTO v_comment
    FROM pg_description
    WHERE objoid = v_acquire_oid AND classoid = 'pg_proc'::regclass AND objsubid = 0;

    IF v_comment IS NULL OR v_comment != 'kurabe:p102:candidate:v1:function:acquire_login_admission' THEN
        RAISE EXCEPTION 'P102_ROLLBACK_PREFLIGHT_FAILED: Function public.acquire_login_admission provenance marker missing or mismatched (found: "%")', COALESCE(v_comment, '<none>');
    END IF;
    SELECT pg_get_userbyid(p.proowner), p.prosecdef, p.proconfig,
         md5(regexp_replace(p.prosrc, '["]?[A-Za-z_][A-Za-z0-9_]*["]?[.]', 'SCHEMA.', 'g'))
    INTO v_function_owner, v_function_security_definer, v_function_config, v_body_hash
    FROM pg_proc p WHERE p.oid = v_acquire_oid;
    SELECT pg_get_userbyid(c.relowner) INTO v_table_owner
    FROM pg_class c WHERE c.oid = 'public.login_attempts'::regclass;
    IF v_function_owner IS DISTINCT FROM v_table_owner
       OR v_function_security_definer IS NOT TRUE
       OR cardinality(COALESCE(v_function_config, ARRAY[]::text[])) <> 1
       OR v_function_config[1] IS DISTINCT FROM 'search_path=public, pg_temp'
       OR v_body_hash IS DISTINCT FROM '76afc317dec7303e3f6d4c1d449f7588' THEN
      RAISE EXCEPTION 'P102_ROLLBACK_PREFLIGHT_FAILED: acquire function definition/owner/security mismatch';
    END IF;
  END IF;

  v_finalize_oid := to_regprocedure('public.finalize_login_admission(text, text, text, boolean, integer, integer, integer)')::oid;
  IF v_finalize_oid IS NULL THEN
    RAISE EXCEPTION 'P102_ROLLBACK_PREFLIGHT_FAILED: finalize function missing';
  END IF;
  IF v_finalize_oid IS NOT NULL THEN
    SELECT description INTO v_comment
    FROM pg_description
    WHERE objoid = v_finalize_oid AND classoid = 'pg_proc'::regclass AND objsubid = 0;

    IF v_comment IS NULL OR v_comment != 'kurabe:p102:candidate:v1:function:finalize_login_admission' THEN
        RAISE EXCEPTION 'P102_ROLLBACK_PREFLIGHT_FAILED: Function public.finalize_login_admission provenance marker missing or mismatched (found: "%")', COALESCE(v_comment, '<none>');
    END IF;
    SELECT pg_get_userbyid(p.proowner), p.prosecdef, p.proconfig,
         md5(regexp_replace(p.prosrc, '["]?[A-Za-z_][A-Za-z0-9_]*["]?[.]', 'SCHEMA.', 'g'))
    INTO v_function_owner, v_function_security_definer, v_function_config, v_body_hash
    FROM pg_proc p WHERE p.oid = v_finalize_oid;
    IF v_function_owner IS DISTINCT FROM v_table_owner
       OR v_function_security_definer IS NOT TRUE
       OR cardinality(COALESCE(v_function_config, ARRAY[]::text[])) <> 1
       OR v_function_config[1] IS DISTINCT FROM 'search_path=public, pg_temp'
       OR v_body_hash IS DISTINCT FROM '77b0134a4c3d4bfae30a27edf372ad97' THEN
      RAISE EXCEPTION 'P102_ROLLBACK_PREFLIGHT_FAILED: finalize function definition/owner/security mismatch';
    END IF;
  END IF;

  v_atomic_oid := to_regprocedure('public.issue_session_finalize_login_admission(uuid, text, boolean, bigint, text, timestamptz, text, text, text, integer, integer, integer)')::oid;
  IF v_atomic_oid IS NULL THEN
    RAISE EXCEPTION 'P102_ROLLBACK_PREFLIGHT_FAILED: atomic session/admission function missing';
  END IF;
  SELECT description INTO v_comment FROM pg_description
  WHERE objoid = v_atomic_oid AND classoid = 'pg_proc'::regclass AND objsubid = 0;
  IF v_comment IS DISTINCT FROM 'kurabe:p102:candidate:v1:function:issue_session_finalize_login_admission' THEN
    RAISE EXCEPTION 'P102_ROLLBACK_PREFLIGHT_FAILED: atomic session/admission function provenance mismatch';
  END IF;
  SELECT pg_get_userbyid(p.proowner), p.prosecdef, p.proconfig,
         md5(regexp_replace(p.prosrc, '["]?[A-Za-z_][A-Za-z0-9_]*["]?[.]', 'SCHEMA.', 'g'))
  INTO v_function_owner, v_function_security_definer, v_function_config, v_body_hash
  FROM pg_proc p WHERE p.oid = v_atomic_oid;
  IF v_function_owner IS DISTINCT FROM v_table_owner
     OR v_function_security_definer IS NOT TRUE
     OR cardinality(COALESCE(v_function_config, ARRAY[]::text[])) <> 1
     OR v_function_config[1] IS DISTINCT FROM 'search_path=public, pg_temp'
     OR v_body_hash IS DISTINCT FROM '171aa45d235c8133d2849726b2ecb54a' THEN
    RAISE EXCEPTION 'P102_ROLLBACK_PREFLIGHT_FAILED: atomic function definition/owner/security mismatch';
  END IF;

  IF to_regclass('public.uq_login_attempts_request_id') IS NOT NULL AND obj_description('public.uq_login_attempts_request_id'::regclass, 'pg_class') IS DISTINCT FROM 'kurabe:p102:candidate:v1:index:uq_login_attempts_request_id' THEN
    RAISE EXCEPTION 'P102_ROLLBACK_PREFLIGHT_FAILED: request id index provenance marker missing or mismatched';
  END IF;
  IF to_regclass('public.idx_login_attempts_status_time') IS NOT NULL AND obj_description('public.idx_login_attempts_status_time'::regclass, 'pg_class') IS DISTINCT FROM 'kurabe:p102:candidate:v1:index:idx_login_attempts_status_time' THEN
    RAISE EXCEPTION 'P102_ROLLBACK_PREFLIGHT_FAILED: status index provenance marker missing or mismatched';
  END IF;

  v_index_oid := to_regclass('public.uq_login_attempts_request_id')::oid;
  -- Keep pg_get_indexdef as diagnostic evidence only.  The acceptance gate
  -- below uses catalog semantics so an isolated schema's quoting cannot make
  -- a valid candidate look like a collision.
  SELECT pg_get_indexdef(v_index_oid), i.indrelid, i.indisunique
  INTO v_index_def, v_index_table, v_index_unique
  FROM pg_index i WHERE i.indexrelid = v_index_oid;
  IF v_index_oid IS NULL OR NOT EXISTS (
    SELECT 1
    FROM pg_index i
    JOIN pg_class idx ON idx.oid = i.indexrelid
    JOIN pg_am am ON am.oid = idx.relam
    WHERE i.indexrelid = v_index_oid
      AND i.indrelid = 'public.login_attempts'::regclass
      AND idx.relnamespace = (
        SELECT table_class.relnamespace
        FROM pg_class table_class
        WHERE table_class.oid = i.indrelid
      )
      AND idx.relname = 'uq_login_attempts_request_id'
      AND i.indisunique IS TRUE
      AND am.amname = 'btree'
      AND i.indnkeyatts = 1
      AND i.indnatts = 1
      AND i.indexprs IS NULL
      AND pg_get_expr(i.indpred, i.indrelid) = '(request_id IS NOT NULL)'
      AND EXISTS (
        SELECT 1
        FROM pg_attribute a
        WHERE a.attrelid = i.indrelid
          AND a.attnum = i.indkey[0]
          AND a.attname = 'request_id'
          AND NOT a.attisdropped
      )
  ) THEN
    RAISE EXCEPTION 'P102_ROLLBACK_PREFLIGHT_FAILED: request id index definition mismatch';
  END IF;

  v_status_index_oid := to_regclass('public.idx_login_attempts_status_time')::oid;
  SELECT pg_get_indexdef(v_status_index_oid), i.indrelid, i.indisunique
  INTO v_status_index_def, v_status_index_table, v_status_index_unique
  FROM pg_index i WHERE i.indexrelid = v_status_index_oid;
  IF v_status_index_oid IS NULL OR NOT EXISTS (
    SELECT 1
    FROM pg_index i
    JOIN pg_class idx ON idx.oid = i.indexrelid
    JOIN pg_am am ON am.oid = idx.relam
    WHERE i.indexrelid = v_status_index_oid
      AND i.indrelid = 'public.login_attempts'::regclass
      AND idx.relnamespace = (
        SELECT table_class.relnamespace
        FROM pg_class table_class
        WHERE table_class.oid = i.indrelid
      )
      AND idx.relname = 'idx_login_attempts_status_time'
      AND i.indisunique IS FALSE
      AND am.amname = 'btree'
      AND i.indnkeyatts = 2
      AND i.indnatts = 2
      AND i.indpred IS NULL
      AND i.indexprs IS NULL
      AND (
        SELECT array_agg(a.attname::text ORDER BY k.ord)
        FROM unnest(i.indkey) WITH ORDINALITY AS k(attnum, ord)
        JOIN pg_attribute a
          ON a.attrelid = i.indrelid AND a.attnum = k.attnum
        WHERE k.ord <= i.indnkeyatts AND NOT a.attisdropped
      ) = ARRAY['status', 'attempted_at']::text[]
  ) THEN
    RAISE EXCEPTION 'P102_ROLLBACK_PREFLIGHT_FAILED: status index definition mismatch';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'public.login_attempts'::regclass AND attname = 'request_id' AND NOT attisdropped) AND col_description('public.login_attempts'::regclass, (SELECT attnum FROM pg_attribute WHERE attrelid = 'public.login_attempts'::regclass AND attname = 'request_id' AND NOT attisdropped)) IS DISTINCT FROM 'kurabe:p102:candidate:v1:column:request_id' THEN
    RAISE EXCEPTION 'P102_ROLLBACK_PREFLIGHT_FAILED: request_id column provenance marker missing or mismatched';
  END IF;
  SELECT a.atttypid::regtype::text, a.attnotnull, pg_get_expr(d.adbin, d.adrelid)
  INTO v_column_type, v_column_not_null, v_column_default
  FROM pg_attribute a
  LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
  WHERE a.attrelid = 'public.login_attempts'::regclass AND a.attname = 'request_id' AND NOT a.attisdropped;
  IF v_column_type IS DISTINCT FROM 'text' OR v_column_not_null IS TRUE OR v_column_default IS NOT NULL THEN
    RAISE EXCEPTION 'P102_ROLLBACK_PREFLIGHT_FAILED: request_id column definition mismatch';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'public.login_attempts'::regclass AND attname = 'status' AND NOT attisdropped) AND col_description('public.login_attempts'::regclass, (SELECT attnum FROM pg_attribute WHERE attrelid = 'public.login_attempts'::regclass AND attname = 'status' AND NOT attisdropped)) IS DISTINCT FROM 'kurabe:p102:candidate:v1:column:status' THEN
    RAISE EXCEPTION 'P102_ROLLBACK_PREFLIGHT_FAILED: status column provenance marker missing or mismatched';
  END IF;
  SELECT a.atttypid::regtype::text, a.attnotnull, pg_get_expr(d.adbin, d.adrelid)
  INTO v_column_type, v_column_not_null, v_column_default
  FROM pg_attribute a
  LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
  WHERE a.attrelid = 'public.login_attempts'::regclass AND a.attname = 'status' AND NOT a.attisdropped;
  IF v_column_type IS DISTINCT FROM 'text'
     OR v_column_not_null IS NOT TRUE
     OR v_column_default IS DISTINCT FROM '''failed''::text' THEN
    RAISE EXCEPTION 'P102_ROLLBACK_PREFLIGHT_FAILED: status column definition mismatch';
  END IF;
END $$;

-- 2. Drop candidate functions
DROP FUNCTION IF EXISTS public.issue_session_finalize_login_admission(uuid, text, boolean, bigint, text, timestamptz, text, text, text, integer, integer, integer);
DROP FUNCTION IF EXISTS public.acquire_login_admission(text, text, text, integer, integer, integer, integer);
DROP FUNCTION IF EXISTS public.finalize_login_admission(text, text, text, boolean, integer, integer, integer);

-- 3. Drop candidate indexes
DROP INDEX IF EXISTS public.idx_login_attempts_status_time;

DROP INDEX IF EXISTS public.uq_login_attempts_request_id;

-- 4. Drop candidate columns
ALTER TABLE public.login_attempts DROP COLUMN IF EXISTS request_id;
ALTER TABLE public.login_attempts DROP COLUMN IF EXISTS status;

COMMIT;
