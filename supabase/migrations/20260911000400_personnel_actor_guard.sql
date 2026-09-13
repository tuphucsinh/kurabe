BEGIN;

-- P102M3T05: authoritative personnel actor scope and safe graph deletion.
-- Leader authorization includes active teams where teams.leader_id points to
-- the actor, not only the actor's primary users.team_id.
-- This migration adds a mandatory actor-aware overload. The older two-argument
-- service-role function remains the graph executor and is called only after the
-- actor/scope/deletion guard below has acquired the same transaction locks.
DO $$
BEGIN
  IF to_regclass('public.users') IS NULL
     OR to_regclass('public.teams') IS NULL
     OR to_regclass('public.evaluations') IS NULL
     OR to_regclass('public.evaluation_rounds') IS NULL THEN
    RAISE EXCEPTION 'P102M3T05_PREFLIGHT_MISSING_TABLE: personnel graph tables are required';
  END IF;
  IF to_regprocedure('public.apply_personnel_transaction(jsonb,jsonb)') IS NULL THEN
    RAISE EXCEPTION 'P102M3T05_PREFLIGHT_MISSING_RPC: the existing graph transaction is required';
  END IF;
  IF to_regprocedure('public.apply_personnel_transaction(jsonb,jsonb,uuid)') IS NOT NULL THEN
    RAISE EXCEPTION 'P102M3T05_PREFLIGHT_COLLISION: actor-aware personnel RPC already exists';
  END IF;
  IF to_regprocedure('public.guard_personnel_evaluator_reference()') IS NOT NULL
     OR EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'guard_personnel_evaluator_reference') THEN
    RAISE EXCEPTION 'P102M3T05_PREFLIGHT_COLLISION: evaluator reference guard already exists';
  END IF;
END $$;

CREATE FUNCTION public.apply_personnel_transaction(
  p_users jsonb,
  p_team jsonb,
  p_actor_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor public.users%ROWTYPE;
  v_existing public.users%ROWTYPE;
  v_item jsonb;
  v_item_id uuid;
  v_target_role text;
  v_target_team_id uuid;
  v_target_active boolean;
  v_existing_target boolean;
  v_has_operation boolean := false;
BEGIN
  IF p_actor_id IS NULL THEN
    RAISE EXCEPTION 'P102M3T05_ACTOR_REQUIRED: authenticated actor is required';
  END IF;
  IF p_users IS NULL OR jsonb_typeof(p_users) <> 'array' THEN
    RAISE EXCEPTION 'P102M3T05_INVALID_ARGUMENT: p_users must be a JSON array';
  END IF;
  IF p_team IS NOT NULL AND jsonb_typeof(p_team) <> 'object' THEN
    RAISE EXCEPTION 'P102M3T05_INVALID_ARGUMENT: p_team must be a JSON object or null';
  END IF;
  IF jsonb_array_length(p_users) = 0 AND p_team IS NULL THEN
    RAISE EXCEPTION 'P102M3T05_INVALID_ARGUMENT: an operation is required';
  END IF;

  -- Serialize the complete personnel graph before reading actor or target scope.
  -- This also serializes actor demotion/target transfer races with this call.
  LOCK TABLE public.teams, public.users, public.evaluation_rounds IN SHARE ROW EXCLUSIVE MODE;

  SELECT * INTO v_actor
  FROM public.users
  WHERE id = p_actor_id
  FOR UPDATE;
  IF NOT FOUND OR v_actor.is_active IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'P102M3T05_ACTOR_INACTIVE: actor must be an active personnel record';
  END IF;
  IF v_actor.role NOT IN ('Manager', 'Leader') THEN
    RAISE EXCEPTION 'P102M3T05_ACTOR_FORBIDDEN: actor role is not authorized';
  END IF;
  IF v_actor.role = 'Leader' AND (
    v_actor.team_id IS NULL
    OR NOT EXISTS (
      SELECT 1 FROM public.teams t
      WHERE t.id = v_actor.team_id AND t.is_active IS TRUE
    )
  ) THEN
    RAISE EXCEPTION 'P102M3T05_ACTOR_TEAM_INACTIVE: Leader must belong to an active team';
  END IF;

  IF p_team IS NOT NULL AND v_actor.role IS DISTINCT FROM 'Manager' THEN
    RAISE EXCEPTION 'P102M3T05_TEAM_SCOPE_FORBIDDEN: only a Manager may mutate teams';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_users) LOOP
    v_has_operation := true;
    IF jsonb_typeof(v_item) <> 'object' THEN
      RAISE EXCEPTION 'P102M3T05_INVALID_ARGUMENT: each user payload must be an object';
    END IF;

    BEGIN
      v_item_id := CASE
        WHEN v_item ? 'id' AND NULLIF(v_item->>'id', '') IS NOT NULL
          THEN (v_item->>'id')::uuid
        ELSE NULL
      END;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'P102M3T05_INVALID_ARGUMENT: user id must be a UUID';
    END;

    v_existing_target := false;
    IF v_item_id IS NOT NULL THEN
      SELECT * INTO v_existing
      FROM public.users
      WHERE id = v_item_id
      FOR UPDATE;
      v_existing_target := FOUND;
    END IF;

    IF v_existing_target THEN
      v_target_role := CASE WHEN v_item ? 'role' THEN NULLIF(v_item->>'role', '') ELSE v_existing.role END;
      v_target_team_id := CASE WHEN v_item ? 'team_id' THEN NULLIF(v_item->>'team_id', '')::uuid ELSE v_existing.team_id END;
      v_target_active := CASE WHEN v_item ? 'is_active' THEN (v_item->>'is_active')::boolean ELSE COALESCE(v_existing.is_active, true) END;
    ELSE
      v_target_role := COALESCE(NULLIF(v_item->>'role', ''), 'Employee');
      v_target_team_id := NULLIF(v_item->>'team_id', '')::uuid;
      v_target_active := COALESCE((v_item->>'is_active')::boolean, true);
    END IF;

    IF v_actor.role = 'Leader' THEN
      IF v_target_role NOT IN ('Employee', 'SubLeader', 'Worker')
         OR NOT EXISTS (
           SELECT 1
           FROM public.teams t
           WHERE t.id = v_target_team_id
             AND t.is_active IS TRUE
             AND (t.id = v_actor.team_id OR t.leader_id = v_actor.id)
         )
         OR (v_existing_target AND v_existing.role NOT IN ('Employee', 'SubLeader', 'Worker'))
         OR (v_existing_target AND NOT EXISTS (
           SELECT 1
           FROM public.teams t
           WHERE t.id = v_existing.team_id
             AND t.is_active IS TRUE
             AND (t.id = v_actor.team_id OR t.leader_id = v_actor.id)
         )) THEN
        RAISE EXCEPTION 'P102M3T05_SCOPE_FORBIDDEN: Leader may mutate only subordinate personnel in a team they lead';
      END IF;
    END IF;

    -- Soft deletion never silently orphans a live graph edge or historical
    -- evaluator reference. Repeating an already-inactive delete is idempotent.
    IF v_existing_target AND v_target_active IS FALSE AND v_existing.is_active IS TRUE THEN
      IF v_item_id = v_actor.id THEN
        RAISE EXCEPTION 'P102M3T05_SELF_DELETE_FORBIDDEN: an actor cannot deactivate itself';
      END IF;
      IF EXISTS (SELECT 1 FROM public.teams t WHERE t.leader_id = v_item_id) THEN
        RAISE EXCEPTION 'P102M3T05_DELETE_REFERENCED_LEADER: team leader reference must be reassigned first';
      END IF;
      IF EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.subleader_id = v_item_id AND u.is_active IS TRUE
      ) THEN
        RAISE EXCEPTION 'P102M3T05_DELETE_REFERENCED_SUBLEADER: active subordinate references must be reassigned first';
      END IF;
      IF EXISTS (
        SELECT 1 FROM public.evaluation_rounds r
        WHERE r.evaluator_id = v_item_id
      ) THEN
        RAISE EXCEPTION 'P102M3T05_DELETE_REFERENCED_EVALUATOR: evaluation history must retain its evaluator';
      END IF;
    END IF;
  END LOOP;

  IF p_team IS NOT NULL THEN
    IF NOT (p_team ? 'id') OR NULLIF(p_team->>'id', '') IS NULL THEN
      RAISE EXCEPTION 'P102M3T05_INVALID_ARGUMENT: team id is required for a team mutation';
    END IF;
    BEGIN
      IF (p_team->>'is_active')::boolean IS FALSE THEN
        IF EXISTS (
          SELECT 1 FROM public.teams t
          WHERE t.id = (p_team->>'id')::uuid
            AND (t.leader_id IS NOT NULL OR EXISTS (
              SELECT 1 FROM public.users u WHERE u.team_id = t.id AND u.is_active IS TRUE
            ))
        ) THEN
          RAISE EXCEPTION 'P102M3T05_DELETE_REFERENCED_TEAM: team graph must be empty before deactivation';
        END IF;
      END IF;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'P102M3T05_INVALID_ARGUMENT: team id or is_active is invalid';
    END;
  END IF;

  IF NOT v_has_operation AND p_team IS NULL THEN
    RAISE EXCEPTION 'P102M3T05_INVALID_ARGUMENT: an operation is required';
  END IF;

  -- The existing graph transaction validates final role/team/evaluator state and
  -- performs all writes in this same transaction after the actor guard.
  RETURN public.apply_personnel_transaction(p_users, p_team);
END;
$$;

COMMENT ON FUNCTION public.apply_personnel_transaction(jsonb,jsonb,uuid) IS
  'kurabe:p102m3t05:candidate:v2:authoritative-actor-scope-and-safe-personnel-graph-multi-team-leader';

-- Prevent a later direct/service-role round insert from recreating a live
-- evaluator edge to a personnel record that has already been deactivated.
-- Historical rows remain untouched; this is only a future-write guard.
CREATE FUNCTION public.guard_personnel_evaluator_reference()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.evaluator_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = NEW.evaluator_id AND u.is_active IS TRUE
  ) THEN
    RAISE EXCEPTION 'P102M3T05_INACTIVE_EVALUATOR: new evaluation round requires an active evaluator';
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.guard_personnel_evaluator_reference() IS
  'kurabe:p102m3t05:candidate:v1:function:guard_personnel_evaluator_reference';

CREATE TRIGGER guard_personnel_evaluator_reference
BEFORE INSERT OR UPDATE ON public.evaluation_rounds
FOR EACH ROW EXECUTE FUNCTION public.guard_personnel_evaluator_reference();

COMMENT ON TRIGGER guard_personnel_evaluator_reference ON public.evaluation_rounds
IS 'kurabe:p102m3t05:candidate:v1:trigger:guard_personnel_evaluator_reference';

REVOKE ALL ON FUNCTION public.apply_personnel_transaction(jsonb,jsonb,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_personnel_transaction(jsonb,jsonb,uuid) TO service_role, postgres;

DO $$
DECLARE
  v_oid oid;
  v_definer boolean;
  v_config text[];
BEGIN
  SELECT p.oid, p.prosecdef, p.proconfig
  INTO v_oid, v_definer, v_config
  FROM pg_proc p
  WHERE p.oid = to_regprocedure('public.apply_personnel_transaction(jsonb,jsonb,uuid)');
  IF v_oid IS NULL OR v_definer IS DISTINCT FROM TRUE OR NOT ('search_path=public' = ANY(v_config)) THEN
    RAISE EXCEPTION 'P102M3T05_POSTCONDITION_SECURITY: actor-aware RPC must be SECURITY DEFINER with fixed search_path';
  END IF;
  IF obj_description(v_oid, 'pg_proc') IS DISTINCT FROM
     'kurabe:p102m3t05:candidate:v2:authoritative-actor-scope-and-safe-personnel-graph-multi-team-leader' THEN
    RAISE EXCEPTION 'P102M3T05_POSTCONDITION_PROVENANCE: actor-aware RPC provenance mismatch';
  END IF;
END $$;

COMMIT;
