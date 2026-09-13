BEGIN;

-- P99M2T02: the personnel graph and evaluation initialisation are one transaction.
-- users.team_id is primary membership; teams.leader_id is an independent
-- appointed-lead relation and may reference a Leader who leads multiple teams.
-- The preflight is intentionally fail-closed: this migration never repairs existing
-- graph drift or silently chooses a leader/subleader for an invalid baseline.
DO $$
DECLARE
  v_count integer;
BEGIN
  IF to_regclass('public.users') IS NULL
     OR to_regclass('public.teams') IS NULL
     OR to_regclass('public.evaluation_periods') IS NULL
     OR to_regclass('public.evaluations') IS NULL
     OR to_regclass('public.evaluation_rounds') IS NULL THEN
    RAISE EXCEPTION 'P99M2T02_PREFLIGHT_FAILED: required personnel/evaluation tables are missing';
  END IF;

  SELECT count(*) INTO v_count
  FROM (
    SELECT team_id
    FROM public.users
    WHERE is_active IS TRUE AND role = 'Leader' AND team_id IS NOT NULL
    GROUP BY team_id
    HAVING count(*) > 1
  ) duplicate_leaders;
  IF v_count > 0 THEN
    RAISE EXCEPTION 'P99M2T02_PREFLIGHT_FAILED: % team(s) already have multiple active Leaders', v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.users u
  LEFT JOIN public.users s ON s.id = u.subleader_id
  WHERE u.subleader_id IS NOT NULL
    AND (
      u.team_id IS NULL
      OR s.id IS NULL
      OR s.is_active IS DISTINCT FROM TRUE
      OR s.role IS DISTINCT FROM 'SubLeader'
      OR s.team_id IS DISTINCT FROM u.team_id
    );
  IF v_count > 0 THEN
    RAISE EXCEPTION 'P99M2T02_PREFLIGHT_FAILED: % invalid SubLeader relation(s) already exist', v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.teams t
  LEFT JOIN public.users u ON u.id = t.leader_id
  WHERE t.leader_id IS NOT NULL
    AND (
      u.id IS NULL
      OR u.is_active IS DISTINCT FROM TRUE
      OR u.role IS DISTINCT FROM 'Leader'
    );
  IF v_count > 0 THEN
    RAISE EXCEPTION 'P99M2T02_PREFLIGHT_FAILED: % invalid team Leader relation(s) already exist', v_count;
  END IF;

  IF to_regclass('public.idx_users_active_leader_team') IS NOT NULL
     OR to_regprocedure('public.apply_personnel_transaction(jsonb,jsonb)') IS NOT NULL
     OR to_regprocedure('public.validate_personnel_graph_trigger()') IS NOT NULL
     OR to_regprocedure('public.resolve_personnel_evaluator(uuid,text,uuid,integer)') IS NOT NULL THEN
    RAISE EXCEPTION 'P99M2T02_PREFLIGHT_FAILED: candidate objects already exist';
  END IF;
END $$;

CREATE UNIQUE INDEX idx_users_active_leader_team
  ON public.users (team_id)
  WHERE is_active IS TRUE AND role = 'Leader' AND team_id IS NOT NULL;

COMMENT ON INDEX public.idx_users_active_leader_team IS
  'kurabe:p99m2t02:candidate:v2:one-active-primary-leader-per-team';

CREATE OR REPLACE FUNCTION public.validate_personnel_graph_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_related public.users%ROWTYPE;
  v_team public.teams%ROWTYPE;
BEGIN
  IF TG_TABLE_NAME = 'users' THEN
    IF NEW.is_active IS TRUE AND NEW.team_id IS NOT NULL THEN
      SELECT * INTO v_team FROM public.teams WHERE id = NEW.team_id;
      IF NOT FOUND OR v_team.is_active IS DISTINCT FROM TRUE THEN
        RAISE EXCEPTION 'P99M2T02_INVALID_TEAM: active user % must belong to an active team', NEW.id;
      END IF;
    END IF;

    IF NEW.subleader_id IS NOT NULL THEN
      SELECT * INTO v_related FROM public.users WHERE id = NEW.subleader_id;
      IF NOT FOUND
         OR v_related.is_active IS DISTINCT FROM TRUE
         OR v_related.role IS DISTINCT FROM 'SubLeader'
         OR NEW.team_id IS NULL
         OR v_related.team_id IS DISTINCT FROM NEW.team_id THEN
        RAISE EXCEPTION 'P99M2T02_INVALID_SUBLEADER: user % must reference an active same-team SubLeader', NEW.id;
      END IF;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.teams t
      WHERE t.leader_id = NEW.id
        AND (
          NEW.is_active IS DISTINCT FROM TRUE
          OR NEW.role IS DISTINCT FROM 'Leader'
        )
    ) THEN
      RAISE EXCEPTION 'P99M2T02_INVALID_TEAM_LEADER: user % is still referenced as an invalid team Leader', NEW.id;
    END IF;
  ELSE
    IF NEW.is_active IS DISTINCT FROM TRUE
       AND EXISTS (SELECT 1 FROM public.users u WHERE u.is_active IS TRUE AND u.team_id = NEW.id) THEN
      RAISE EXCEPTION 'P99M2T02_INVALID_TEAM: cannot deactivate a team with active users';
    END IF;

    IF NEW.leader_id IS NOT NULL THEN
      SELECT * INTO v_related FROM public.users WHERE id = NEW.leader_id;
      IF NOT FOUND
         OR v_related.is_active IS DISTINCT FROM TRUE
         OR v_related.role IS DISTINCT FROM 'Leader' THEN
        RAISE EXCEPTION 'P99M2T02_INVALID_TEAM_LEADER: team % must reference an active Leader', NEW.id;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.validate_personnel_graph_trigger() IS
  'kurabe:p99m2t02:candidate:v2:deferred-personnel-graph-validation-multi-team-leader';

CREATE CONSTRAINT TRIGGER users_personnel_graph_validate
AFTER INSERT OR UPDATE ON public.users
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.validate_personnel_graph_trigger();

CREATE CONSTRAINT TRIGGER teams_personnel_graph_validate
AFTER INSERT OR UPDATE ON public.teams
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.validate_personnel_graph_trigger();

CREATE OR REPLACE FUNCTION public.resolve_personnel_evaluator(
  p_employee_id uuid,
  p_employee_role text,
  p_team_id uuid,
  p_round integer
)
RETURNS TABLE (evaluator_id uuid, evaluator_role text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_subleader_id uuid;
  v_leader_id uuid;
BEGIN
  IF p_round = 1 THEN
    IF p_employee_role IN ('Manager', 'Leader', 'SubLeader') THEN
      RETURN QUERY SELECT p_employee_id, p_employee_role;
      RETURN;
    END IF;

    SELECT u.subleader_id INTO v_subleader_id
    FROM public.users u
    WHERE u.id = p_employee_id;

    IF v_subleader_id IS NOT NULL THEN
      RETURN QUERY
      SELECT s.id, s.role
      FROM public.users s
      WHERE s.id = v_subleader_id
        AND s.is_active IS TRUE
        AND s.role = 'SubLeader'
        AND s.team_id IS NOT NULL
        AND s.team_id = p_team_id;
    ELSE
      RETURN QUERY SELECT NULL::uuid, 'SubLeader'::text;
    END IF;
    RETURN;
  END IF;

  IF p_round = 2 THEN
    IF p_employee_role = 'Leader' THEN
      RETURN QUERY
      SELECT u.id, u.role
      FROM public.users u
      WHERE u.role = 'Manager' AND u.is_active IS TRUE
      ORDER BY u.id
      LIMIT 1;
      RETURN;
    END IF;

    IF p_employee_role IN ('SubLeader', 'Employee', 'Worker') AND p_team_id IS NOT NULL THEN
      SELECT t.leader_id INTO v_leader_id
      FROM public.teams t
      WHERE t.id = p_team_id AND t.is_active IS TRUE;

      IF v_leader_id IS NOT NULL THEN
        RETURN QUERY
        SELECT u.id, u.role
        FROM public.users u
        WHERE u.id = v_leader_id
          AND u.role = 'Leader'
          AND u.is_active IS TRUE;
        IF FOUND THEN
          RETURN;
        END IF;
      END IF;

      -- teams.leader_id is authoritative. Do not infer a different leader
      -- from the appointee's primary users.team_id.
      RETURN;
    END IF;

    RETURN QUERY SELECT NULL::uuid, 'Leader'::text;
    RETURN;
  END IF;

  IF p_round = 3 AND p_employee_role IN ('SubLeader', 'Employee', 'Worker') THEN
    RETURN QUERY
    SELECT u.id, u.role
    FROM public.users u
    WHERE u.role = 'Manager' AND u.is_active IS TRUE
    ORDER BY u.id
    LIMIT 1;
    RETURN;
  END IF;

  RETURN QUERY SELECT NULL::uuid, NULL::text;
END;
$$;

COMMENT ON FUNCTION public.resolve_personnel_evaluator(uuid,text,uuid,integer) IS
  'kurabe:p99m2t02:candidate:v2:authoritative-evaluator-resolution-multi-team-leader';

CREATE OR REPLACE FUNCTION public.apply_personnel_transaction(
  p_users jsonb,
  p_team jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item jsonb;
  v_id uuid;
  v_team_id uuid;
  v_team_leader_id uuid;
  v_team_name text;
  v_team_active boolean;
  v_team_exists boolean;
  v_team_payload_has_leader boolean := false;
  v_active_period_id uuid;
  v_active_period_count integer := 0;
  v_new_user_count integer := 0;
  v_round_count integer := 0;
  v_eval_id uuid;
  v_evaluator_id uuid;
  v_evaluator_role text;
  v_existing public.users%ROWTYPE;
  v_state record;
  v_team_state record;
  v_user_json jsonb;
  v_team_json jsonb;
BEGIN
  IF p_users IS NULL OR jsonb_typeof(p_users) <> 'array' THEN
    RAISE EXCEPTION 'P99M2T02_INVALID_ARGUMENT: p_users must be a JSON array';
  END IF;
  IF p_team IS NOT NULL AND jsonb_typeof(p_team) <> 'object' THEN
    RAISE EXCEPTION 'P99M2T02_INVALID_ARGUMENT: p_team must be a JSON object or null';
  END IF;

  -- One deterministic graph lock prevents two concurrent leader/team moves from
  -- validating the same stale graph. Evaluation row guards remain authoritative
  -- for concurrent close/submit races.
  LOCK TABLE public.teams, public.users IN SHARE ROW EXCLUSIVE MODE;

  CREATE TEMP TABLE p99m2t02_input_users (
    id uuid PRIMARY KEY,
    payload jsonb NOT NULL,
    existed boolean NOT NULL
  ) ON COMMIT DROP;

  CREATE TEMP TABLE p99m2t02_user_state (
    id uuid PRIMARY KEY,
    employee_code text NOT NULL,
    name text NOT NULL,
    role text NOT NULL,
    team_id uuid,
    join_date date,
    avatar_url text,
    is_active boolean NOT NULL,
    subleader_id uuid,
    description text,
    gender text NOT NULL
  ) ON COMMIT DROP;

  CREATE TEMP TABLE p99m2t02_team_state (
    id uuid PRIMARY KEY,
    name text NOT NULL,
    leader_id uuid,
    is_active boolean NOT NULL
  ) ON COMMIT DROP;

  CREATE TEMP TABLE p99m2t02_affected_users (
    id uuid PRIMARY KEY
  ) ON COMMIT DROP;

  CREATE TEMP TABLE p99m2t02_affected_teams (
    id uuid PRIMARY KEY
  ) ON COMMIT DROP;

  INSERT INTO p99m2t02_user_state (
    id, employee_code, name, role, team_id, join_date, avatar_url,
    is_active, subleader_id, description, gender
  )
  SELECT id, employee_code, name, role, team_id, join_date, avatar_url,
         COALESCE(is_active, true), subleader_id, description, gender
  FROM public.users;

  INSERT INTO p99m2t02_team_state (id, name, leader_id, is_active)
  SELECT id, name, leader_id, COALESCE(is_active, true)
  FROM public.teams;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_users) LOOP
    BEGIN
      v_id := CASE
        WHEN v_item ? 'id' AND NULLIF(v_item->>'id', '') IS NOT NULL
          THEN (v_item->>'id')::uuid
        ELSE gen_random_uuid()
      END;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'P99M2T02_INVALID_ARGUMENT: user id must be a UUID';
    END;

    IF EXISTS (SELECT 1 FROM p99m2t02_input_users WHERE id = v_id) THEN
      RAISE EXCEPTION 'P99M2T02_DUPLICATE_INPUT: user % appears more than once', v_id;
    END IF;

    SELECT EXISTS (SELECT 1 FROM public.users WHERE id = v_id) INTO v_team_exists;
    INSERT INTO p99m2t02_input_users (id, payload, existed)
    VALUES (v_id, v_item, v_team_exists);
    INSERT INTO p99m2t02_affected_users (id) VALUES (v_id);

    IF v_team_exists THEN
      SELECT * INTO v_existing FROM public.users WHERE id = v_id;
      UPDATE p99m2t02_user_state
      SET employee_code = CASE WHEN v_item ? 'employee_code' THEN v_item->>'employee_code' ELSE employee_code END,
          name = CASE WHEN v_item ? 'name' THEN v_item->>'name' ELSE name END,
          role = CASE WHEN v_item ? 'role' THEN v_item->>'role' ELSE role END,
          team_id = CASE WHEN v_item ? 'team_id' THEN NULLIF(v_item->>'team_id', '')::uuid ELSE team_id END,
          join_date = CASE WHEN v_item ? 'join_date' THEN NULLIF(v_item->>'join_date', '')::date ELSE join_date END,
          avatar_url = CASE WHEN v_item ? 'avatar_url' THEN v_item->>'avatar_url' ELSE avatar_url END,
          is_active = CASE WHEN v_item ? 'is_active' THEN (v_item->>'is_active')::boolean ELSE is_active END,
          subleader_id = CASE WHEN v_item ? 'subleader_id' THEN NULLIF(v_item->>'subleader_id', '')::uuid ELSE subleader_id END,
          description = CASE WHEN v_item ? 'description' THEN v_item->>'description' ELSE description END,
          gender = CASE WHEN v_item ? 'gender' THEN COALESCE(v_item->>'gender', gender) ELSE gender END
      WHERE id = v_id;
    ELSE
      INSERT INTO p99m2t02_user_state (
        id, employee_code, name, role, team_id, join_date, avatar_url,
        is_active, subleader_id, description, gender
      ) VALUES (
        v_id,
        COALESCE(v_item->>'employee_code', ''),
        COALESCE(v_item->>'name', ''),
        COALESCE(NULLIF(v_item->>'role', ''), 'Employee'),
        NULLIF(v_item->>'team_id', '')::uuid,
        NULLIF(v_item->>'join_date', '')::date,
        v_item->>'avatar_url',
        COALESCE((v_item->>'is_active')::boolean, true),
        NULLIF(v_item->>'subleader_id', '')::uuid,
        v_item->>'description',
        COALESCE(NULLIF(v_item->>'gender', ''), 'Nữ')
      );
    END IF;
  END LOOP;

  IF p_team IS NOT NULL THEN
    BEGIN
      v_team_id := CASE
        WHEN p_team ? 'id' AND NULLIF(p_team->>'id', '') IS NOT NULL
          THEN (p_team->>'id')::uuid
        ELSE gen_random_uuid()
      END;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'P99M2T02_INVALID_ARGUMENT: team id must be a UUID';
    END;

    SELECT EXISTS (SELECT 1 FROM public.teams WHERE id = v_team_id) INTO v_team_exists;
    IF v_team_exists THEN
      SELECT name, leader_id, COALESCE(is_active, true)
      INTO v_team_name, v_team_leader_id, v_team_active
      FROM public.teams WHERE id = v_team_id;
    ELSE
      v_team_name := '';
      v_team_leader_id := NULL;
      v_team_active := true;
    END IF;

    v_team_name := CASE WHEN p_team ? 'name' THEN p_team->>'name' ELSE v_team_name END;
    v_team_leader_id := CASE WHEN p_team ? 'leader_id' THEN NULLIF(p_team->>'leader_id', '')::uuid ELSE v_team_leader_id END;
    v_team_active := CASE WHEN p_team ? 'is_active' THEN (p_team->>'is_active')::boolean ELSE v_team_active END;
    v_team_payload_has_leader := p_team ? 'leader_id';

    IF v_team_name IS NULL OR length(trim(v_team_name)) = 0 THEN
      RAISE EXCEPTION 'P99M2T02_INVALID_ARGUMENT: team name cannot be empty';
    END IF;

    IF v_team_exists THEN
      UPDATE p99m2t02_team_state
      SET name = v_team_name, leader_id = v_team_leader_id, is_active = v_team_active
      WHERE id = v_team_id;
    ELSE
      INSERT INTO p99m2t02_team_state (id, name, leader_id, is_active)
      VALUES (v_team_id, v_team_name, v_team_leader_id, v_team_active);
    END IF;
    INSERT INTO p99m2t02_affected_teams (id) VALUES (v_team_id) ON CONFLICT DO NOTHING;
  END IF;

  INSERT INTO p99m2t02_affected_teams (id)
  SELECT DISTINCT team_id FROM p99m2t02_user_state s
  JOIN p99m2t02_affected_users a ON a.id = s.id
  WHERE team_id IS NOT NULL
  ON CONFLICT DO NOTHING;

  INSERT INTO p99m2t02_affected_teams (id)
  SELECT DISTINCT u.team_id
  FROM public.users u
  JOIN p99m2t02_input_users i ON i.id = u.id
  WHERE u.team_id IS NOT NULL
  ON CONFLICT DO NOTHING;

  -- A Leader can be appointed to teams outside their primary membership.
  -- Revalidate those pointers if that Leader is part of this transaction.
  INSERT INTO p99m2t02_affected_teams (id)
  SELECT DISTINCT t.id
  FROM public.teams t
  JOIN p99m2t02_affected_users a ON a.id = t.leader_id
  ON CONFLICT DO NOTHING;

  -- A team update may appoint any existing active Leader, including one whose
  -- primary membership is another team. This does not move users.team_id.
  IF p_team IS NOT NULL AND v_team_leader_id IS NOT NULL THEN
    INSERT INTO p99m2t02_affected_users (id) VALUES (v_team_leader_id) ON CONFLICT DO NOTHING;
    IF NOT EXISTS (SELECT 1 FROM p99m2t02_user_state WHERE id = v_team_leader_id) THEN
      RAISE EXCEPTION 'P99M2T02_INVALID_TEAM_LEADER: user % does not exist', v_team_leader_id;
    END IF;
  END IF;

  INSERT INTO p99m2t02_affected_teams (id)
  SELECT DISTINCT team_id FROM p99m2t02_user_state s
  JOIN p99m2t02_affected_users a ON a.id = s.id
  WHERE team_id IS NOT NULL
  ON CONFLICT DO NOTHING;

  -- Validate the final graph before the first business write.
  IF EXISTS (
    SELECT 1 FROM p99m2t02_user_state s
    WHERE s.team_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM p99m2t02_team_state t WHERE t.id = s.team_id)
  ) THEN
    RAISE EXCEPTION 'P99M2T02_INVALID_TEAM: user references a missing team';
  END IF;

  IF EXISTS (
    SELECT 1 FROM p99m2t02_user_state s
    WHERE s.is_active IS TRUE AND s.team_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM p99m2t02_team_state t
        WHERE t.id = s.team_id AND t.is_active IS TRUE
      )
  ) THEN
    RAISE EXCEPTION 'P99M2T02_INVALID_TEAM: active user must belong to an active team';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM p99m2t02_user_state s
    LEFT JOIN p99m2t02_user_state sub ON sub.id = s.subleader_id
    WHERE s.subleader_id IS NOT NULL
      AND (
        s.team_id IS NULL
        OR sub.id IS NULL
        OR sub.is_active IS DISTINCT FROM TRUE
        OR sub.role IS DISTINCT FROM 'SubLeader'
        OR sub.team_id IS DISTINCT FROM s.team_id
      )
  ) THEN
    RAISE EXCEPTION 'P99M2T02_INVALID_SUBLEADER: SubLeader must be active and in the same team';
  END IF;

  IF EXISTS (
    SELECT 1 FROM p99m2t02_user_state
    WHERE role NOT IN ('Manager', 'Leader', 'SubLeader', 'Employee', 'Worker')
  ) THEN
    RAISE EXCEPTION 'P99M2T02_INVALID_ROLE: unsupported personnel role';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM p99m2t02_user_state
    WHERE is_active IS TRUE AND role = 'Leader' AND team_id IS NOT NULL
    GROUP BY team_id HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'P99M2T02_DUPLICATE_LEADER: a team may have only one active Leader';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM p99m2t02_team_state t
    LEFT JOIN p99m2t02_user_state u ON u.id = t.leader_id
    WHERE t.leader_id IS NOT NULL
      AND (
        u.id IS NULL
        OR u.is_active IS DISTINCT FROM TRUE
        OR u.role IS DISTINCT FROM 'Leader'
      )
  ) THEN
    RAISE EXCEPTION 'P99M2T02_INVALID_TEAM_LEADER: team leader must reference an active Leader';
  END IF;

  -- If the caller explicitly appoints a leader, it must be an active Leader.
  -- The appointment is independent from the user's primary team.
  IF p_team IS NOT NULL AND v_team_payload_has_leader AND v_team_leader_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM p99m2t02_user_state
      WHERE id = v_team_leader_id AND is_active IS TRUE AND role = 'Leader'
    ) THEN
      RAISE EXCEPTION 'P99M2T02_INVALID_TEAM_LEADER: appointed user is not an active Leader';
    END IF;
  END IF;

  -- Create/update the requested team before assigning users to a newly-created
  -- team, so the existing users_team_id_fkey remains valid inside this txn.
  IF p_team IS NOT NULL THEN
    INSERT INTO public.teams (id, name, leader_id, is_active)
    VALUES (v_team_id, v_team_name, NULL, v_team_active)
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name,
      is_active = EXCLUDED.is_active;
    GET DIAGNOSTICS v_round_count = ROW_COUNT;
    IF v_round_count <> 1 THEN
      RAISE EXCEPTION 'P99M2T02_AFFECTED_ROW_GUARD: team % affected % rows', v_team_id, v_round_count;
    END IF;
  END IF;

  -- Persist user rows with affected-row semantics. No password columns are
  -- accepted by this boundary; credentials remain outside personnel mutation.
  FOR v_state IN
    SELECT s.* FROM p99m2t02_user_state s
    JOIN p99m2t02_affected_users a ON a.id = s.id
    ORDER BY s.id
  LOOP
    INSERT INTO public.users (
      id, employee_code, name, role, team_id, join_date, avatar_url,
      is_active, subleader_id, description, gender
    ) VALUES (
      v_state.id, v_state.employee_code, v_state.name, v_state.role,
      v_state.team_id, v_state.join_date, v_state.avatar_url,
      v_state.is_active, v_state.subleader_id, v_state.description, v_state.gender
    )
    ON CONFLICT (id) DO UPDATE SET
      employee_code = EXCLUDED.employee_code,
      name = EXCLUDED.name,
      role = EXCLUDED.role,
      team_id = EXCLUDED.team_id,
      join_date = EXCLUDED.join_date,
      avatar_url = EXCLUDED.avatar_url,
      is_active = EXCLUDED.is_active,
      subleader_id = EXCLUDED.subleader_id,
      description = EXCLUDED.description,
      gender = EXCLUDED.gender;

    GET DIAGNOSTICS v_round_count = ROW_COUNT;
    IF v_round_count <> 1 THEN
      RAISE EXCEPTION 'P99M2T02_AFFECTED_ROW_GUARD: user % affected % rows', v_state.id, v_round_count;
    END IF;
  END LOOP;

  -- Reconcile only invalidated pointers. A valid appointed Leader may lead
  -- multiple teams, so never derive teams.leader_id from users.team_id.
  FOR v_team_state IN
    SELECT t.* FROM p99m2t02_team_state t
    JOIN p99m2t02_affected_teams a ON a.id = t.id
    ORDER BY t.id
  LOOP
    v_team_leader_id := v_team_state.leader_id;
    IF v_team_leader_id IS NOT NULL AND NOT EXISTS (
      SELECT 1
      FROM p99m2t02_user_state u
      WHERE u.id = v_team_leader_id
        AND u.is_active IS TRUE
        AND u.role = 'Leader'
    ) THEN
      v_team_leader_id := NULL;
    END IF;

    UPDATE public.teams
    SET leader_id = v_team_leader_id
    WHERE id = v_team_state.id;
    GET DIAGNOSTICS v_round_count = ROW_COUNT;
    IF v_round_count <> 1 THEN
      RAISE EXCEPTION 'P99M2T02_AFFECTED_ROW_GUARD: team leader reconciliation affected % rows for %', v_round_count, v_team_state.id;
    END IF;
  END LOOP;

  SELECT count(*) INTO v_new_user_count
  FROM p99m2t02_input_users i
  WHERE i.existed IS FALSE;

  IF v_new_user_count > 0 THEN
    SELECT count(*), (array_agg(id ORDER BY id))[1] INTO v_active_period_count, v_active_period_id
    FROM public.evaluation_periods
    WHERE status = 'active';
    IF v_active_period_count <> 1 THEN
      RAISE EXCEPTION 'P99M2T02_INIT_FAILED: expected exactly one active evaluation period, found %', v_active_period_count;
    END IF;
  ELSE
    SELECT count(*), (array_agg(id ORDER BY id))[1] INTO v_active_period_count, v_active_period_id
    FROM public.evaluation_periods
    WHERE status = 'active';
  END IF;

  IF v_active_period_count = 1 THEN
    -- Current active/draft snapshots follow the final personnel graph; closed
    -- and submitted rows are deliberately excluded and remain immutable.
    UPDATE public.evaluations e
    SET employee_role = s.role,
        team_id = s.team_id,
        updated_at = now()
    FROM p99m2t02_user_state s
    JOIN p99m2t02_affected_users a ON a.id = s.id
    WHERE e.employee_id = s.id
      AND e.period_id = v_active_period_id
      AND e.status IN ('NotStarted', 'Draft');

    UPDATE public.evaluation_rounds r
  SET evaluator_id = resolved.evaluator_id,
      evaluator_role = resolved.evaluator_role
  FROM (
    SELECT r0.id,
           resolved_row.evaluator_id,
           resolved_row.evaluator_role
    FROM public.evaluation_rounds r0
    JOIN public.evaluations e ON e.id = r0.evaluation_id
    JOIN p99m2t02_user_state s ON s.id = e.employee_id
    JOIN p99m2t02_affected_users a ON a.id = s.id
    CROSS JOIN LATERAL public.resolve_personnel_evaluator(
      e.employee_id, s.role, s.team_id, r0.round
    ) resolved_row
    WHERE e.period_id = v_active_period_id
      AND e.status IN ('NotStarted', 'Draft')
      AND r0.status IN ('NotStarted', 'Draft')
      AND r0.submitted_at IS NULL
  ) resolved
  WHERE r.id = resolved.id;
  END IF;

  -- New-user evaluation and round-1 initialisation is part of this same RPC.
  FOR v_state IN
    SELECT s.*
    FROM p99m2t02_user_state s
    JOIN p99m2t02_input_users i ON i.id = s.id
    WHERE i.existed IS FALSE
    ORDER BY s.id
  LOOP
    SELECT e.id INTO v_eval_id
    FROM public.evaluations e
    WHERE e.period_id = v_active_period_id AND e.employee_id = v_state.id;

    IF v_eval_id IS NULL THEN
      SELECT r.evaluator_id, r.evaluator_role
      INTO v_evaluator_id, v_evaluator_role
      FROM public.resolve_personnel_evaluator(v_state.id, v_state.role, v_state.team_id, 1) r;

      IF v_evaluator_id IS NULL THEN
        RAISE EXCEPTION 'P99M2T02_INIT_FAILED: no valid Round 1 evaluator for user %', v_state.id;
      END IF;

      INSERT INTO public.evaluations (
        period_id, employee_id, employee_role, team_id, status,
        current_round, created_at, updated_at
      ) VALUES (
        v_active_period_id, v_state.id, v_state.role, v_state.team_id,
        'NotStarted', 1, now(), now()
      ) RETURNING id INTO v_eval_id;

      GET DIAGNOSTICS v_round_count = ROW_COUNT;
      IF v_round_count <> 1 OR v_eval_id IS NULL THEN
        RAISE EXCEPTION 'P99M2T02_AFFECTED_ROW_GUARD: evaluation initialisation failed for user %', v_state.id;
      END IF;

      INSERT INTO public.evaluation_rounds (
        evaluation_id, round, evaluator_id, evaluator_role,
        scores, notes, total_score, grade, status, created_at
      ) VALUES (
        v_eval_id, 1, v_evaluator_id, v_evaluator_role,
        '{}'::jsonb, '{}'::jsonb, 0, 'Pending', 'NotStarted', now()
      );
      GET DIAGNOSTICS v_round_count = ROW_COUNT;
      IF v_round_count <> 1 THEN
        RAISE EXCEPTION 'P99M2T02_AFFECTED_ROW_GUARD: Round 1 initialisation failed for user %', v_state.id;
      END IF;
    ELSE
      SELECT count(*) INTO v_round_count
      FROM public.evaluation_rounds r
      WHERE r.evaluation_id = v_eval_id;
      IF v_round_count = 0 THEN
        RAISE EXCEPTION 'P99M2T02_INIT_FAILED: evaluation % has no rounds', v_eval_id;
      END IF;
    END IF;
  END LOOP;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', u.id,
    'employee_code', u.employee_code,
    'name', u.name,
    'role', u.role,
    'team_id', u.team_id,
    'join_date', u.join_date,
    'avatar_url', u.avatar_url,
    'created_at', u.created_at,
    'is_active', u.is_active,
    'subleader_id', u.subleader_id,
    'description', u.description,
    'gender', u.gender
  ) ORDER BY u.id), '[]'::jsonb)
  INTO v_user_json
  FROM public.users u
  JOIN p99m2t02_affected_users a ON a.id = u.id;

  IF p_team IS NOT NULL THEN
    SELECT jsonb_build_object(
      'id', t.id,
      'name', t.name,
      'leader_id', t.leader_id,
      'is_active', t.is_active
    ) INTO v_team_json
    FROM public.teams t
    WHERE t.id = v_team_id;
  ELSE
    v_team_json := NULL;
  END IF;

  RETURN jsonb_build_object(
    'users', v_user_json,
    'team', v_team_json,
    'initialized_users', v_new_user_count,
    'active_period_id', v_active_period_id
  );
END;
$$;

COMMENT ON FUNCTION public.apply_personnel_transaction(jsonb,jsonb) IS
  'kurabe:p99m2t02:candidate:v2:atomic-personnel-team-evaluation-graph-multi-team-leader';

REVOKE ALL ON FUNCTION public.apply_personnel_transaction(jsonb,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_personnel_transaction(jsonb,jsonb) TO service_role, postgres;
REVOKE ALL ON FUNCTION public.validate_personnel_graph_trigger() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.validate_personnel_graph_trigger() TO service_role, postgres;
REVOKE ALL ON FUNCTION public.resolve_personnel_evaluator(uuid,text,uuid,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_personnel_evaluator(uuid,text,uuid,integer) TO service_role, postgres;

COMMIT;
