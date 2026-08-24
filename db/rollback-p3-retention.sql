-- ============================================================
-- ROLLBACK CANDIDATE ONLY — NOT APPLIED
-- Kurabe Retention Routine Rollback Candidate: Purge Routine
-- DO NOT EXECUTE DIRECTLY WITHOUT EXPLICIT APPROVAL AND GUC CONFIRMATION
--
-- CRITICAL OPERATIONAL CONSTRAINTS:
-- 1. Purge Irreversibility Limitation:
--    Dropping the purge function public.purge_kurabe_retention ONLY removes
--    the routine from PostgreSQL. It CANNOT restore, resurrect, or undo
--    rows that were already deleted during prior purge executions.
-- 2. Data Recovery Requirement:
--    If recovery of purged telemetry/log rows is required, restoration must
--    be performed from a verified point-in-time database backup under a
--    separately approved disaster recovery runbook.
-- 3. External Session Approval Guard:
--    Execution requires setting the custom PostgreSQL configuration setting:
--      SET kurabe.p3_rollback_approved = 'true';
--    in the active administrative session before running this script.
--    This script deliberately does NOT set this parameter internally.
-- 4. Provenance Verification:
--    The function is inspected in pg_description prior to dropping.
--    If the function exists with an absent or mismatched provenance marker,
--    the script fails closed with RAISE EXCEPTION to prevent dropping
--    unowned or pre-existing database objects.
-- 5. Zero Data Mutation:
--    This script does not perform DELETE, TRUNCATE, or table mutations.
-- ============================================================

BEGIN;

DO $$
DECLARE
  v_approved text;
  v_proc_oid oid;
  v_comment text;
BEGIN
  -- ------------------------------------------------------------
  -- 1. APPROVAL GUARD (Fail closed if GUC is not explicitly 'true')
  -- ------------------------------------------------------------
  v_approved := current_setting('kurabe.p3_rollback_approved', true);
  IF v_approved IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'ROLLBACK_UNAPPROVED: Execution aborted. Custom GUC kurabe.p3_rollback_approved must be set to ''true'' in this session prior to running rollback candidate.';
  END IF;

  -- ------------------------------------------------------------
  -- 2. DROP RETENTION FUNCTION (public.purge_kurabe_retention)
  -- ------------------------------------------------------------
  SELECT p.oid INTO v_proc_oid
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.relnamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'purge_kurabe_retention'
    AND pg_get_function_identity_arguments(p.oid) = 'p_as_of timestamp with time zone';

  IF v_proc_oid IS NULL THEN
    v_proc_oid := to_regprocedure('public.purge_kurabe_retention(timestamptz)')::oid;
  END IF;

  IF v_proc_oid IS NOT NULL THEN
    SELECT description INTO v_comment
    FROM pg_description
    WHERE objoid = v_proc_oid AND classoid = 'pg_proc'::regclass AND objsubid = 0;

    IF v_comment IS DISTINCT FROM 'kurabe:p3:candidate:v1:function:purge_kurabe_retention' THEN
      RAISE EXCEPTION 'PROVENANCE_MISMATCH: Function public.purge_kurabe_retention exists but comment "%" does not match expected marker "kurabe:p3:candidate:v1:function:purge_kurabe_retention". Aborting.', v_comment;
    END IF;

    EXECUTE 'DROP FUNCTION public.purge_kurabe_retention(timestamptz)';
    RAISE NOTICE 'DROPPED: Function public.purge_kurabe_retention(timestamptz)';
  ELSE
    RAISE NOTICE 'SKIPPED: Function public.purge_kurabe_retention(timestamptz) not found (already absent)';
  END IF;
END $$;

COMMIT;
