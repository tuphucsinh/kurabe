-- ============================================================
-- CANDIDATE ONLY — NOT APPLIED
-- KURABE QAQC — Migration P107M1T05:
--   Complete atomic roster & history-safe personnel lifecycle (L3/L6/L7/P3)
-- DO NOT APPLY DIRECTLY WITHOUT SEPARATE APPROVAL AND DIRECT CATALOG GATE
-- ============================================================
-- Purpose:
--   1. create_evaluation_period_atomic — extended so the atomic period RPC
--      validates the EXACT live active roster/role/team/assignment graph under a
--      deterministic lock, not merely the partial client payload. The evaluation
--      roster is the identity baseline; a concurrent roster churn cannot slip
--      between validation and write.
--   2. apply_personnel_transaction(jsonb,jsonb,uuid) — history-safe soft
--      deactivation: personnel whose only remaining references are historical
--      (closed/submitted rounds, inactive subordinates) MAY deactivate while the
--      rows and evaluator attribution are retained unchanged. A live actionable
--      evaluator assignment, an active subordinate, an appointed team-leader
--      reference, self-delete, and a live team deactivation are still DENIED.
--   3. evaluation_history_labels — bounded, immutable, append-only capture of
--      historical label fields. An absent historical field is recorded as the
--      explicit 'unknown' state, never fabricated.
--
-- Operational & Safety Constraints:
--   1. Candidate Only: direct catalog access requires approval; DO NOT apply live.
--   2. Prerequisite Ordering: requires P96T04 atomic period lifecycle, P99M2T02
--      personnel transaction and P102M3T05 personnel actor guard already applied.
--   3. Hermetic Transaction: single BEGIN ... COMMIT.
--   4. Fixed Search Path & SECURITY DEFINER on every function.
--   5. No data mutation of existing rows; no backfill; grants preserved/re-issued.
--
-- Rollback: reverse order (DROP the trigger, table, function, then re-create the
-- prior P96T04/P102M3T05 function bodies). See the task evidence record.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. PREFLIGHT (fail-closed)
-- ------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.users') IS NULL
     OR to_regclass('public.teams') IS NULL
     OR to_regclass('public.evaluations') IS NULL
     OR to_regclass('public.evaluation_rounds') IS NULL
     OR to_regclass('public.evaluation_periods') IS NULL THEN
    RAISE EXCEPTION 'P107M1T05_PREFLIGHT_MISSING_TABLE: personnel/evaluation graph tables are required';
  END IF;

  IF to_regprocedure('public.create_evaluation_period_atomic(text,integer,uuid,timestamptz,jsonb,jsonb)') IS NULL THEN
    RAISE EXCEPTION 'P107M1T05_PREFLIGHT_MISSING_RPC: create_evaluation_period_atomic is required';
  END IF;
  IF to_regprocedure('public.apply_personnel_transaction(jsonb,jsonb,uuid)') IS NULL THEN
    RAISE EXCEPTION 'P107M1T05_PREFLIGHT_MISSING_RPC: actor-aware apply_personnel_transaction is required';
  END IF;
  IF to_regprocedure('public.resolve_personnel_evaluator(uuid,text,uuid,integer)') IS NULL THEN
    RAISE EXCEPTION 'P107M1T05_PREFLIGHT_MISSING_RPC: resolve_personnel_evaluator is required';
  END IF;
  IF to_regprocedure('public.apply_personnel_transaction(jsonb,jsonb)') IS NULL THEN
    RAISE EXCEPTION 'P107M1T05_PREFLIGHT_MISSING_RPC: graph executor apply_personnel_transaction is required';
  END IF;
  IF to_regprocedure('public.validate_personnel_graph_trigger()') IS NULL THEN
    RAISE EXCEPTION 'P107M1T05_PREFLIGHT_MISSING_RPC: deferred graph validation trigger is required';
  END IF;

  IF to_regclass('public.evaluation_history_labels') IS NOT NULL THEN
    RAISE EXCEPTION 'P107M1T05_PREFLIGHT_COLLISION: evaluation_history_labels already exists';
  END IF;
  IF to_regprocedure('public.reject_history_label_mutation()') IS NOT NULL THEN
    RAISE EXCEPTION 'P107M1T05_PREFLIGHT_COLLISION: reject_history_label_mutation already exists';
  END IF;
END $$;

-- ------------------------------------------------------------
-- 2. ROSTER-GRAPH-VALIDATED ATOMIC PERIOD CREATION
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_evaluation_period_atomic(
  p_name text,
  p_year integer,
  p_created_by uuid,
  p_created_at timestamptz,
  p_evaluations jsonb,
  p_rounds jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period_id uuid;
  v_eval_count integer;
  v_round_count integer;
  v_eval_total integer;
  v_eval_distinct integer;
  v_round_total integer;
  v_round_distinct integer;
  v_mismatch_count integer;
  v_created_at timestamptz;
  v_roster_count integer;
BEGIN
  IF p_name IS NULL OR length(trim(p_name)) = 0 THEN
    RAISE EXCEPTION 'P107_INVALID_ARGUMENT: p_name cannot be null or empty';
  END IF;
  IF p_year IS NULL THEN
    RAISE EXCEPTION 'P107_INVALID_ARGUMENT: p_year cannot be null';
  END IF;
  IF p_created_by IS NULL THEN
    RAISE EXCEPTION 'P107_INVALID_ARGUMENT: p_created_by cannot be null';
  END IF;
  IF p_evaluations IS NULL OR jsonb_typeof(p_evaluations) != 'array' THEN
    RAISE EXCEPTION 'P107_INVALID_ARGUMENT: p_evaluations must be a valid jsonb array';
  END IF;
  IF p_rounds IS NULL OR jsonb_typeof(p_rounds) != 'array' THEN
    RAISE EXCEPTION 'P107_INVALID_ARGUMENT: p_rounds must be a valid jsonb array';
  END IF;

  v_eval_count := jsonb_array_length(p_evaluations);
  v_round_count := jsonb_array_length(p_rounds);
  IF v_eval_count != v_round_count THEN
    RAISE EXCEPTION 'P107_MISMATCH: Evaluations count (%) does not match rounds count (%)', v_eval_count, v_round_count;
  END IF;

  v_created_at := COALESCE(p_created_at, now());

  -- Deterministic graph lock BEFORE reading the live roster so a concurrent
  -- roster/assignment mutation cannot churn between validation and write.
  LOCK TABLE public.users, public.teams IN SHARE ROW EXCLUSIVE MODE;

  CREATE TEMP TABLE p107_roster_snapshot (
    id uuid PRIMARY KEY,
    role text NOT NULL,
    team_id uuid,
    subleader_id uuid
  ) ON COMMIT DROP;

  INSERT INTO p107_roster_snapshot (id, role, team_id, subleader_id)
  SELECT u.id, u.role, u.team_id, u.subleader_id
  FROM public.users u
  WHERE u.is_active IS TRUE;

  SELECT count(*) INTO v_roster_count FROM p107_roster_snapshot;

  -- Exact count: the evaluation payload must cover the whole active roster.
  IF v_eval_count != v_roster_count THEN
    RAISE EXCEPTION 'P107_ROSTER_COUNT_MISMATCH: evaluations (%) do not match the active roster (%)', v_eval_count, v_roster_count;
  END IF;

  -- Bidirectional ID equality against the live roster.
  SELECT count(*) INTO v_mismatch_count
  FROM (
    SELECT (e.employee_id)::uuid AS emp_id FROM jsonb_to_recordset(p_evaluations) AS e(employee_id uuid)
    EXCEPT
    SELECT r.id FROM p107_roster_snapshot r
  ) extra;
  IF v_mismatch_count > 0 THEN
    RAISE EXCEPTION 'P107_ROSTER_ID_MISMATCH: evaluations contain ids outside the active roster';
  END IF;

  SELECT count(*) INTO v_mismatch_count
  FROM (
    SELECT r.id FROM p107_roster_snapshot r
    EXCEPT
    SELECT (e.employee_id)::uuid AS emp_id FROM jsonb_to_recordset(p_evaluations) AS e(employee_id uuid)
  ) missing;
  IF v_mismatch_count > 0 THEN
    RAISE EXCEPTION 'P107_ROSTER_ID_MISMATCH: active roster contains ids missing from evaluations';
  END IF;

  -- Role/team assignment must match the live graph exactly.
  SELECT count(*) INTO v_mismatch_count
  FROM jsonb_to_recordset(p_evaluations) AS e(employee_id uuid, employee_role text, team_id uuid)
  JOIN p107_roster_snapshot r ON r.id = e.employee_id
  WHERE r.role IS DISTINCT FROM e.employee_role
     OR r.team_id IS DISTINCT FROM e.team_id;
  IF v_mismatch_count > 0 THEN
    RAISE EXCEPTION 'P107_ROSTER_ATTR_MISMATCH: evaluation role/team does not match the active roster graph';
  END IF;

  -- SubLeader relation validity (same-team active SubLeader, no orphan).
  SELECT count(*) INTO v_mismatch_count
  FROM p107_roster_snapshot s
  LEFT JOIN p107_roster_snapshot sub ON sub.id = s.subleader_id
  WHERE s.subleader_id IS NOT NULL
    AND (
      s.team_id IS NULL
      OR sub.id IS NULL
      OR sub.role IS DISTINCT FROM 'SubLeader'
      OR sub.team_id IS DISTINCT FROM s.team_id
    );
  IF v_mismatch_count > 0 THEN
    RAISE EXCEPTION 'P107_ROSTER_SUBLEADER_INVALID: subleader relation is not a valid same-team SubLeader';
  END IF;

  IF v_eval_count > 0 THEN
    SELECT count(e.employee_id), count(DISTINCT e.employee_id)
    INTO v_eval_total, v_eval_distinct
    FROM jsonb_to_recordset(p_evaluations) AS e(employee_id uuid);
    IF v_eval_total != v_eval_count OR v_eval_distinct != v_eval_count THEN
      RAISE EXCEPTION 'P107_DUPLICATE_OR_NULL_EMPLOYEE_ID: p_evaluations contains null or duplicate employee_ids';
    END IF;

    SELECT count(*) INTO v_mismatch_count
    FROM (
      SELECT (e.employee_id)::uuid AS emp_id FROM jsonb_to_recordset(p_evaluations) AS e(employee_id uuid)
      EXCEPT
      SELECT (r.employee_id)::uuid AS emp_id FROM jsonb_to_recordset(p_rounds) AS r(employee_id uuid)
    ) diff;
    IF v_mismatch_count > 0 THEN
      RAISE EXCEPTION 'P107_EMPLOYEE_SET_MISMATCH: p_evaluations employee set does not match p_rounds employee set';
    END IF;
  END IF;

  IF v_round_count > 0 THEN
    SELECT count(e.employee_id), count(DISTINCT e.employee_id)
    INTO v_round_total, v_round_distinct
    FROM jsonb_to_recordset(p_rounds) AS e(employee_id uuid);
    IF v_round_total != v_round_count OR v_round_distinct != v_round_count THEN
      RAISE EXCEPTION 'P107_DUPLICATE_OR_NULL_EMPLOYEE_ID: p_rounds contains null or duplicate employee_ids';
    END IF;

    -- Round-1 evaluator assignment must equal the authoritative SQL resolver.
    SELECT count(*) INTO v_mismatch_count
    FROM jsonb_to_recordset(p_rounds) AS r(employee_id uuid, round integer, evaluator_id uuid)
    JOIN p107_roster_snapshot s ON s.id = r.employee_id
    LEFT JOIN LATERAL public.resolve_personnel_evaluator(s.id, s.role, s.team_id, r.round) res ON TRUE
    WHERE r.round = 1
      AND (
        (res.evaluator_id IS NULL AND r.evaluator_id IS NOT NULL)
        OR (res.evaluator_id IS NOT NULL AND r.evaluator_id IS DISTINCT FROM res.evaluator_id)
      );
    IF v_mismatch_count > 0 THEN
      RAISE EXCEPTION 'P107_ROSTER_ASSIGNMENT_MISMATCH: round 1 evaluator does not match the authoritative resolver';
    END IF;
  END IF;

  INSERT INTO public.evaluation_periods (
    name,
    year,
    created_by,
    status,
    created_at
  ) VALUES (
    p_name,
    p_year,
    p_created_by,
    'active',
    v_created_at
  )
  RETURNING id INTO v_period_id;

  IF v_period_id IS NULL THEN
    RAISE EXCEPTION 'P107_INSERT_FAILED: Failed to create evaluation_period record';
  END IF;

  -- Evaluations + Round 1 remain a single atomic write bound to v_period_id.
  IF v_eval_count > 0 THEN
    WITH inserted_evals AS (
      INSERT INTO public.evaluations (
        period_id,
        employee_id,
        employee_role,
        team_id,
        status,
        current_round,
        created_at,
        updated_at
      )
      SELECT
        v_period_id,
        e.employee_id,
        e.employee_role,
        e.team_id,
        COALESCE(e.status, 'NotStarted'),
        COALESCE(e.current_round, 1),
        COALESCE(e.created_at, v_created_at),
        COALESCE(e.updated_at, v_created_at)
      FROM jsonb_to_recordset(p_evaluations) AS e(
        employee_id uuid,
        employee_role text,
        team_id uuid,
        status text,
        current_round integer,
        created_at timestamptz,
        updated_at timestamptz
      )
      RETURNING id, employee_id
    )
    INSERT INTO public.evaluation_rounds (
      evaluation_id,
      round,
      evaluator_id,
      evaluator_role,
      scores,
      notes,
      total_score,
      grade,
      status,
      created_at
    )
    SELECT
      ie.id,
      COALESCE(r.round, 1),
      r.evaluator_id,
      r.evaluator_role,
      COALESCE(r.scores, '{}'::jsonb),
      COALESCE(r.notes, '{}'::jsonb),
      COALESCE(r.total_score, 0),
      COALESCE(r.grade, 'Pending'),
      COALESCE(r.status, 'NotStarted'),
      COALESCE(r.created_at, v_created_at)
    FROM jsonb_to_recordset(p_rounds) AS r(
      employee_id uuid,
      round integer,
      evaluator_id uuid,
      evaluator_role text,
      scores jsonb,
      notes jsonb,
      total_score numeric,
      grade text,
      status text,
      created_at timestamptz
    )
    JOIN inserted_evals ie ON ie.employee_id = r.employee_id;
  END IF;

  RETURN v_period_id;
END;
$$;

COMMENT ON FUNCTION public.create_evaluation_period_atomic(
  text, integer, uuid, timestamptz, jsonb, jsonb
) IS 'kurabe:p107m1t05:candidate:v1:roster-graph-validated-period-atomic';

REVOKE EXECUTE ON FUNCTION public.create_evaluation_period_atomic(
  text, integer, uuid, timestamptz, jsonb, jsonb
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.create_evaluation_period_atomic(
  text, integer, uuid, timestamptz, jsonb, jsonb
) TO service_role, postgres;

-- ------------------------------------------------------------
-- 2b. HISTORY-SAFE DEFERRED SUBLEADER VALIDATION
-- ------------------------------------------------------------
-- An ACTIVE user must still reference an ACTIVE, same-team SubLeader. An INACTIVE
-- (historical) user may retain its subleader_id attribution even after that
-- SubLeader is deactivated, so a historical-only deactivation is possible without
-- erasing attribution. Active-assignment orphans remain DENIED.

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

    IF NEW.is_active IS TRUE AND NEW.subleader_id IS NOT NULL THEN
      SELECT * INTO v_related FROM public.users WHERE id = NEW.subleader_id;
      IF NOT FOUND
         OR v_related.is_active IS DISTINCT FROM TRUE
         OR v_related.role IS DISTINCT FROM 'SubLeader'
         OR NEW.team_id IS NULL
         OR v_related.team_id IS DISTINCT FROM NEW.team_id THEN
        RAISE EXCEPTION 'P99M2T02_INVALID_SUBLEADER: active user % must reference an active same-team SubLeader', NEW.id;
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
      IF NOT FOUND OR v_related.is_active IS DISTINCT FROM TRUE OR v_related.role IS DISTINCT FROM 'Leader' THEN
        RAISE EXCEPTION 'P99M2T02_INVALID_TEAM_LEADER: team % must reference an active Leader', NEW.id;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.validate_personnel_graph_trigger() IS
  'kurabe:p107m1t05:candidate:v1:history-safe-deferred-personnel-graph-validation';

REVOKE ALL ON FUNCTION public.validate_personnel_graph_trigger() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.validate_personnel_graph_trigger() TO service_role, postgres;

-- ------------------------------------------------------------
-- 2c. HISTORY-SAFE 2-ARG GRAPH EXECUTOR
-- ------------------------------------------------------------
-- Same validation/write body as P99M2T02 except the subleader edge is only
-- enforced for ACTIVE referencing users, so inactive historical rows keep their
-- attribution when a SubLeader is deactivated.

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
    WHERE s.is_active IS TRUE
      AND s.subleader_id IS NOT NULL
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
  'kurabe:p107m1t05:candidate:v1:history-safe-graph-executor';

REVOKE ALL ON FUNCTION public.apply_personnel_transaction(jsonb,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_personnel_transaction(jsonb,jsonb) TO service_role, postgres;

-- ------------------------------------------------------------
-- 3. HISTORY-SAFE SOFT DEACTIVATION
-- ------------------------------------------------------------
-- Replaces only the actor-scope/deletion guard body. The 2-argument graph
-- executor and the deferred graph-validation trigger are unchanged.
CREATE OR REPLACE FUNCTION public.apply_personnel_transaction(
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

    -- Soft deletion never silently orphans a live graph edge. Active subordinate
    -- references, an appointed team-leader pointer, self-delete and a live
    -- actionable evaluator assignment remain DENIED. Historical-only references
    -- (closed/submitted rounds, inactive subordinates) are retained unchanged,
    -- so a historical-only deactivation is ALLOWED.
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
        SELECT 1
        FROM public.evaluation_rounds r
        JOIN public.evaluations e ON e.id = r.evaluation_id
        JOIN public.evaluation_periods p ON p.id = e.period_id
        WHERE r.evaluator_id = v_item_id
          AND p.status = 'active'
          AND e.status IN ('NotStarted', 'Draft')
          AND r.status IN ('NotStarted', 'Draft')
          AND r.submitted_at IS NULL
      ) THEN
        RAISE EXCEPTION 'P107_DELETE_LIVE_EVALUATOR: a live actionable evaluator assignment must be reassigned first';
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

  RETURN public.apply_personnel_transaction(p_users, p_team);
END;
$$;

COMMENT ON FUNCTION public.apply_personnel_transaction(jsonb,jsonb,uuid)
IS 'kurabe:p107m1t05:candidate:v1:history-safe-soft-deactivation';

REVOKE ALL ON FUNCTION public.apply_personnel_transaction(jsonb,jsonb,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_personnel_transaction(jsonb,jsonb,uuid) TO service_role, postgres;

-- ------------------------------------------------------------
-- 4. BOUNDED IMMUTABLE HISTORICAL LABEL SCHEMA
-- ------------------------------------------------------------
CREATE TABLE public.evaluation_history_labels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evaluation_id uuid NOT NULL REFERENCES public.evaluations(id) ON DELETE RESTRICT,
  round integer NOT NULL,
  label_key text NOT NULL,
  label_value text,
  label_state text NOT NULL DEFAULT 'unknown',
  is_immutable boolean NOT NULL DEFAULT true,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT evaluation_history_labels_round_check CHECK (round BETWEEN 1 AND 3),
  CONSTRAINT evaluation_history_labels_state_check CHECK (label_state IN ('known', 'unknown')),
  CONSTRAINT evaluation_history_labels_value_check CHECK ((label_state = 'known') = (label_value IS NOT NULL)),
  CONSTRAINT evaluation_history_labels_immutable_check CHECK (is_immutable),
  CONSTRAINT evaluation_history_labels_key_check CHECK (length(trim(label_key)) > 0),
  CONSTRAINT evaluation_history_labels_unique UNIQUE (evaluation_id, round, label_key)
);

COMMENT ON TABLE public.evaluation_history_labels IS
  'kurabe:p107m1t05:candidate:v1:bounded-immutable-historical-label-capture';
COMMENT ON COLUMN public.evaluation_history_labels.label_state IS
  'known = label_value present; unknown = historical field absent, never fabricated';
COMMENT ON COLUMN public.evaluation_history_labels.label_value IS
  'NULL is only valid with label_state = unknown';

CREATE FUNCTION public.reject_history_label_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'P107_HISTORY_LABEL_IMMUTABLE: historical labels are append-only and cannot be %', TG_OP;
END;
$$;

COMMENT ON FUNCTION public.reject_history_label_mutation() IS
  'kurabe:p107m1t05:candidate:v1:function:reject_history_label_mutation';

CREATE TRIGGER evaluation_history_labels_immutable
BEFORE UPDATE OR DELETE ON public.evaluation_history_labels
FOR EACH ROW EXECUTE FUNCTION public.reject_history_label_mutation();

COMMENT ON TRIGGER evaluation_history_labels_immutable ON public.evaluation_history_labels
IS 'kurabe:p107m1t05:candidate:v1:trigger:evaluation_history_labels_immutable';

ALTER TABLE public.evaluation_history_labels ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.evaluation_history_labels FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.evaluation_history_labels TO service_role;
REVOKE ALL ON FUNCTION public.reject_history_label_mutation() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reject_history_label_mutation() TO service_role, postgres;

COMMIT;
