BEGIN;

-- Fail-closed rollback for the P102M3T05 actor-aware overload. The legacy
-- two-argument graph executor is intentionally retained and must remain present.
DO $$
DECLARE
  v_oid oid;
  v_owner name;
  v_comment text;
  v_definer boolean;
  v_config text[];
  v_body_hash text;
BEGIN
  SELECT p.oid,
         pg_get_userbyid(p.proowner),
         obj_description(p.oid, 'pg_proc'),
         p.prosecdef,
         p.proconfig,
         md5(regexp_replace(p.prosrc, '"?[A-Za-z_][A-Za-z0-9_]*"?[.]', 'SCHEMA.', 'g'))
  INTO v_oid, v_owner, v_comment, v_definer, v_config, v_body_hash
  FROM pg_proc p
  WHERE p.oid = to_regprocedure('public.apply_personnel_transaction(jsonb,jsonb,uuid)');

  IF v_oid IS NULL THEN
    RAISE EXCEPTION 'P102M3T05_ROLLBACK_PREFLIGHT_MISSING: actor-aware RPC is absent';
  END IF;
  IF v_owner IS DISTINCT FROM 'postgres' THEN
    RAISE EXCEPTION 'P102M3T05_ROLLBACK_PREFLIGHT_OWNER: unexpected RPC owner %', v_owner;
  END IF;
  IF v_definer IS DISTINCT FROM TRUE OR NOT COALESCE('search_path=public' = ANY(v_config), false) THEN
    RAISE EXCEPTION 'P102M3T05_ROLLBACK_PREFLIGHT_SECURITY: RPC security contract changed';
  END IF;
  IF v_comment IS DISTINCT FROM
     'kurabe:p102m3t05:candidate:v1:authoritative-actor-scope-and-safe-personnel-graph' THEN
    RAISE EXCEPTION 'P102M3T05_ROLLBACK_PREFLIGHT_PROVENANCE: RPC provenance changed';
  END IF;
  IF v_body_hash IS DISTINCT FROM '911a1424cc8c5e8ef486aeec6dd96849' THEN
    RAISE EXCEPTION 'P102M3T05_ROLLBACK_PREFLIGHT_BODY: RPC body fingerprint changed';
  END IF;
  IF to_regprocedure('public.apply_personnel_transaction(jsonb,jsonb)') IS NULL THEN
    RAISE EXCEPTION 'P102M3T05_ROLLBACK_PREFLIGHT_LEGACY_MISSING: legacy graph executor is required';
  END IF;
END $$;

DROP FUNCTION public.apply_personnel_transaction(jsonb,jsonb,uuid);

DO $$
BEGIN
  IF to_regprocedure('public.apply_personnel_transaction(jsonb,jsonb,uuid)') IS NOT NULL THEN
    RAISE EXCEPTION 'P102M3T05_ROLLBACK_POSTCONDITION_PRESENT: actor-aware RPC remains';
  END IF;
  IF to_regprocedure('public.apply_personnel_transaction(jsonb,jsonb)') IS NULL THEN
    RAISE EXCEPTION 'P102M3T05_ROLLBACK_POSTCONDITION_LEGACY_MISSING: legacy graph executor was removed';
  END IF;
END $$;

COMMIT;
