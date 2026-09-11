-- ============================================================
-- ROLLBACK CANDIDATE ONLY — NOT APPLIED
-- KURABE QAQC — P102M3T02: Session Credential Guard rollback
-- DO NOT EXECUTE WITHOUT EXPLICIT APPROVAL AND DIRECT CATALOG GATE
-- ============================================================
-- Drops only the P102M3T02 overloads, revision columns, and index.
-- It never drops sessions/users tables or historical P98 functions.
-- Requires an external administrative approval GUC in the same session.

BEGIN;
SET LOCAL search_path = public;

DO $$
DECLARE
  v_approved text;
  v_oid oid;
  v_comment text;
BEGIN
  v_approved := current_setting('kurabe.p102m3t02_rollback_approved', true);
  IF v_approved IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'P102M3T02_ROLLBACK_UNAPPROVED: set kurabe.p102m3t02_rollback_approved = true in the approved session';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users'
      AND column_name = 'credential_revision' AND data_type = 'bigint'
  ) THEN
    RAISE EXCEPTION 'P102M3T02_ROLLBACK_PREFLIGHT_FAILED: users.credential_revision is absent or has unexpected type';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sessions'
      AND column_name = 'credential_revision' AND data_type = 'bigint'
  ) THEN
    RAISE EXCEPTION 'P102M3T02_ROLLBACK_PREFLIGHT_FAILED: sessions.credential_revision is absent or has unexpected type';
    END IF;

    SELECT col_description('public.users'::regclass, a.attnum)
    INTO v_comment
    FROM pg_attribute AS a
    WHERE a.attrelid = 'public.users'::regclass
    AND a.attname = 'credential_revision'
    AND NOT a.attisdropped;
    IF v_comment IS DISTINCT FROM 'kurabe:p102m3t02:candidate:v1:column:users.credential_revision' THEN
    RAISE EXCEPTION 'P102M3T02_ROLLBACK_PREFLIGHT_FAILED: users.credential_revision provenance mismatch';
    END IF;

    SELECT col_description('public.sessions'::regclass, a.attnum)
    INTO v_comment
    FROM pg_attribute AS a
    WHERE a.attrelid = 'public.sessions'::regclass
    AND a.attname = 'credential_revision'
    AND NOT a.attisdropped;
    IF v_comment IS DISTINCT FROM 'kurabe:p102m3t02:candidate:v1:column:sessions.credential_revision' THEN
    RAISE EXCEPTION 'P102M3T02_ROLLBACK_PREFLIGHT_FAILED: sessions.credential_revision provenance mismatch';
    END IF;

    v_oid := to_regclass('public.idx_sessions_user_credential_revision')::oid;
    IF v_oid IS NOT NULL
    AND obj_description(v_oid, 'pg_class') IS DISTINCT FROM 'kurabe:p102m3t02:candidate:v1:index:idx_sessions_user_credential_revision' THEN
    RAISE EXCEPTION 'P102M3T02_ROLLBACK_PREFLIGHT_FAILED: session revision index provenance mismatch';
    END IF;

    v_oid := to_regprocedure('public.issue_session_transaction(uuid,text,boolean,bigint,text,timestamptz)')::oid;
  IF v_oid IS NOT NULL THEN
    SELECT description INTO v_comment FROM pg_description
    WHERE objoid = v_oid AND classoid = 'pg_proc'::regclass AND objsubid = 0;
    IF v_comment IS DISTINCT FROM 'kurabe:p102m3t02:candidate:v1:function:issue_session_transaction' THEN
      RAISE EXCEPTION 'P102M3T02_ROLLBACK_PREFLIGHT_FAILED: issue_session_transaction provenance mismatch';
    END IF;
  END IF;

  v_oid := to_regprocedure('public.change_password_transaction(uuid,text,text,text,bigint)')::oid;
  IF v_oid IS NOT NULL THEN
    SELECT description INTO v_comment FROM pg_description
    WHERE objoid = v_oid AND classoid = 'pg_proc'::regclass AND objsubid = 0;
    IF v_comment IS DISTINCT FROM 'kurabe:p102m3t02:candidate:v1:function:change_password_transaction' THEN
      RAISE EXCEPTION 'P102M3T02_ROLLBACK_PREFLIGHT_FAILED: change_password_transaction provenance mismatch';
    END IF;
  END IF;

  v_oid := to_regprocedure('public.reset_password_transaction(uuid,text,timestamptz,bigint)')::oid;
  IF v_oid IS NOT NULL THEN
    SELECT description INTO v_comment FROM pg_description
    WHERE objoid = v_oid AND classoid = 'pg_proc'::regclass AND objsubid = 0;
    IF v_comment IS DISTINCT FROM 'kurabe:p102m3t02:candidate:v1:function:reset_password_transaction' THEN
      RAISE EXCEPTION 'P102M3T02_ROLLBACK_PREFLIGHT_FAILED: reset_password_transaction provenance mismatch';
    END IF;
  END IF;

  v_oid := to_regprocedure('public.complete_password_setup_transaction(text,text,bigint)')::oid;
  IF v_oid IS NOT NULL THEN
    SELECT description INTO v_comment FROM pg_description
    WHERE objoid = v_oid AND classoid = 'pg_proc'::regclass AND objsubid = 0;
    IF v_comment IS DISTINCT FROM 'kurabe:p102m3t02:candidate:v1:function:complete_password_setup_transaction' THEN
      RAISE EXCEPTION 'P102M3T02_ROLLBACK_PREFLIGHT_FAILED: complete_password_setup_transaction provenance mismatch';
    END IF;
  END IF;
END $$;

DROP FUNCTION IF EXISTS public.issue_session_transaction(uuid,text,boolean,bigint,text,timestamptz);
DROP FUNCTION IF EXISTS public.change_password_transaction(uuid,text,text,text,bigint);
DROP FUNCTION IF EXISTS public.reset_password_transaction(uuid,text,timestamptz,bigint);
DROP FUNCTION IF EXISTS public.complete_password_setup_transaction(text,text,bigint);
DROP INDEX IF EXISTS public.idx_sessions_user_credential_revision;
ALTER TABLE public.sessions DROP COLUMN IF EXISTS credential_revision;
ALTER TABLE public.users DROP COLUMN IF EXISTS credential_revision;

COMMIT;
