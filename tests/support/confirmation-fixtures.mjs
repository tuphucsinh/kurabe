#!/usr/bin/env node
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
export const projectRoot = path.resolve(moduleDir, '../..');
export const BASE_SHA = 'd7fef247bf8c404db62d3263d195cc0d935d2e5c';
export const TASK_ID = 'P103M1T01';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const FIXTURE_RUN_ID = process.env.KURABE_FIXTURE_RUN_ID || crypto.randomUUID();
if (!UUID_PATTERN.test(FIXTURE_RUN_ID)) {
  throw new Error('INVALID_FIXTURE_RUN_ID: expected a UUID');
}

function fixtureId(label) {
  const hex = crypto.createHash('sha256').update(`${FIXTURE_RUN_ID}:${label}`).digest('hex').slice(0, 32).split('');
  hex[12] = '4';
  hex[16] = '8';
  return `${hex.slice(0, 8).join('')}-${hex.slice(8, 12).join('')}-${hex.slice(12, 16).join('')}-${hex.slice(16, 20).join('')}-${hex.slice(20).join('')}`;
}

// Fixture Actor IDs (deterministic UUIDs for synthetic confirmation fixtures)
export const FIXTURE_MANAGER_ID = fixtureId('manager');
export const FIXTURE_LEADER_A_ID = fixtureId('leader-a');
export const FIXTURE_LEADER_C_ID = fixtureId('leader-c');
export const FIXTURE_SUBLEADER_B_ID = fixtureId('subleader-b');
export const FIXTURE_EMPLOYEE_B_ID = fixtureId('employee-b');
export const FIXTURE_WORKER_B_ID = fixtureId('worker-b');

// Fixture Employee Codes
export const FIXTURE_MANAGER_CODE = 'P103-MGR';
export const FIXTURE_LEADER_A_CODE = 'P103-LDA';
export const FIXTURE_LEADER_C_CODE = 'P103-LDC';
export const FIXTURE_SUBLEADER_B_CODE = 'P103-SLB';
export const FIXTURE_EMPLOYEE_B_CODE = 'P103-EMB';
export const FIXTURE_WORKER_B_CODE = 'P103-WKB';

// Fixture Team IDs
export const FIXTURE_TEAM_A_ID = fixtureId('team-a');
export const FIXTURE_TEAM_B_ID = fixtureId('team-b');
export const FIXTURE_TEAM_C_ID = fixtureId('team-c');

// Fixture Period IDs
export const FIXTURE_ACTIVE_PERIOD_ID = fixtureId('active-period');
export const FIXTURE_CLOSED_PERIOD_ID = fixtureId('closed-period');

// Fixture Evaluation IDs
export const FIXTURE_ACTIVE_EVAL_ID = fixtureId('active-evaluation');
export const FIXTURE_CLOSED_EVAL_ID = fixtureId('closed-evaluation');

// Fixture Round IDs
export const FIXTURE_ACTIVE_ROUND_1_ID = fixtureId('active-round-1');
export const FIXTURE_CLOSED_ROUND_1_ID = fixtureId('closed-round-1');
export const FIXTURE_CLOSED_ROUND_2_ID = fixtureId('closed-round-2');
export const FIXTURE_CLOSED_ROUND_3_ID = fixtureId('closed-round-3');

// Fixture Version IDs for Criteria & Grade Config
export const FIXTURE_CRITERIA_V1_ID = fixtureId('criteria-v1');
export const FIXTURE_CRITERIA_V2_ID = fixtureId('criteria-v2');
export const FIXTURE_GRADE_V1_ID = fixtureId('grade-v1');
export const FIXTURE_GRADE_V2_ID = fixtureId('grade-v2');

export const FIXTURE_ACTORS = {
  manager: {
    alias: 'manager',
    id: FIXTURE_MANAGER_ID,
    employeeCode: FIXTURE_MANAGER_CODE,
    name: 'P103 Seed Manager',
    role: 'Manager',
    teamId: FIXTURE_TEAM_A_ID,
    gender: 'Nữ',
  },
  leader_a: {
    alias: 'leader_a',
    id: FIXTURE_LEADER_A_ID,
    employeeCode: FIXTURE_LEADER_A_CODE,
    name: 'P103 Leader A',
    role: 'Leader',
    teamId: FIXTURE_TEAM_A_ID, // Primary Team A, appointed Leader for Team A and Team B
    gender: 'Nam',
  },
  leader_c: {
    alias: 'leader_c',
    id: FIXTURE_LEADER_C_ID,
    employeeCode: FIXTURE_LEADER_C_CODE,
    name: 'P103 Leader C',
    role: 'Leader',
    teamId: FIXTURE_TEAM_C_ID, // Primary Team C, unrelated to A/B
    gender: 'Nam',
  },
  subleader_b: {
    alias: 'subleader_b',
    id: FIXTURE_SUBLEADER_B_ID,
    employeeCode: FIXTURE_SUBLEADER_B_CODE,
    name: 'P103 SubLeader B',
    role: 'SubLeader',
    teamId: FIXTURE_TEAM_B_ID, // Primary Team B
    gender: 'Nữ',
  },
  employee_b: {
    alias: 'employee_b',
    id: FIXTURE_EMPLOYEE_B_ID,
    employeeCode: FIXTURE_EMPLOYEE_B_CODE,
    name: 'P103 Employee B',
    role: 'Employee',
    teamId: FIXTURE_TEAM_B_ID, // Primary Team B
    gender: 'Nữ',
  },
  worker_b: {
    alias: 'worker_b',
    id: FIXTURE_WORKER_B_ID,
    employeeCode: FIXTURE_WORKER_B_CODE,
    name: 'P103 Worker B',
    role: 'Worker',
    teamId: FIXTURE_TEAM_B_ID, // Primary Team B
    gender: 'Nam',
  },
};

export const FIXTURE_TEAMS = {
  team_a: {
    alias: 'team_a',
    id: FIXTURE_TEAM_A_ID,
    name: 'P103 Team A',
    leaderId: FIXTURE_LEADER_A_ID,
  },
  team_b: {
    alias: 'team_b',
    id: FIXTURE_TEAM_B_ID,
    name: 'P103 Team B',
    leaderId: FIXTURE_LEADER_A_ID, // Appointed Leader is Leader A!
  },
  team_c: {
    alias: 'team_c',
    id: FIXTURE_TEAM_C_ID,
    name: 'P103 Team C',
    leaderId: FIXTURE_LEADER_C_ID, // Unrelated Team C
  },
};

export const FIXTURE_PERIODS = {
  active: {
    alias: 'active',
    id: FIXTURE_ACTIVE_PERIOD_ID,
    year: 2099,
    name: 'P103 Active Period',
    status: 'active',
    createdBy: FIXTURE_MANAGER_ID,
  },
  closed: {
    alias: 'closed',
    id: FIXTURE_CLOSED_PERIOD_ID,
    year: 2098,
    name: 'P103 Closed Period',
    status: 'closed',
    createdBy: FIXTURE_MANAGER_ID,
  },
};

export function sqlLiteral(value) {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return `'${String(value).replaceAll("'", "''")}'`;
}

export function locatePsql() {
  const candidates = [
    '/usr/lib/postgresql/17/bin/psql',
    '/usr/bin/psql',
    'psql',
    '/usr/local/bin/psql',
    '/usr/lib/postgresql/16/bin/psql',
    '/usr/lib/postgresql/15/bin/psql',
  ];
  for (const candidate of candidates) {
    const probe = spawnSync(candidate, ['--version'], {
      stdio: ['ignore', 'ignore', 'ignore'],
      timeout: 2000,
    });
    if (probe.status === 0 && !probe.error) return candidate;
  }
  return null;
}

function safeError(error) {
  return String(error?.message || error)
    .replace(/https?:\/\/[^\s)]+/gi, '[REDACTED_URL]')
    .replace(/(?:postgres(?:ql)?:\/\/)[^\s)]+/gi, '[REDACTED_DB_TARGET]')
    .replace(/(password|secret|token|key)\s*[=:]\s*[^\s,;]+/gi, '$1=[REDACTED]');
}

function assertDisposableTarget(target) {
  if (!target || !['127.0.0.1', 'localhost', '::1'].includes(target.host)) {
    const error = new Error('REFUSE_NON_LOOPBACK_HOST');
    error.code = 'REFUSE_NON_LOOPBACK_HOST';
    throw error;
  }
  if (!/^kurabe_harness_[a-z0-9_]+$/.test(String(target.database || ''))) {
    const error = new Error('REFUSE_NON_DISPOSABLE_DATABASE');
    error.code = 'REFUSE_NON_DISPOSABLE_DATABASE';
    throw error;
  }
  if (target.user !== 'postgres') {
    const error = new Error('REFUSE_NON_DISPOSABLE_USER');
    error.code = 'REFUSE_NON_DISPOSABLE_USER';
    throw error;
  }
  if (!target.password) {
    const error = new Error('REFUSE_MISSING_DATABASE_PASSWORD');
    error.code = 'REFUSE_MISSING_DATABASE_PASSWORD';
    throw error;
  }
}

export function psql(target, sql, options = {}) {
  assertDisposableTarget(target);
  const psqlBin = locatePsql();
  if (!psqlBin) {
    const err = new Error('psql binary not found');
    err.code = 'MISSING_RUNTIME_CAPABILITY';
    throw err;
  }
  const result = spawnSync(psqlBin, [
    '--no-psqlrc', '--no-password', '--set=ON_ERROR_STOP=1',
    '--tuples-only', '--no-align',
    '--host', target.host, '--port', String(target.port),
    '--username', target.user, '--dbname', target.database,
  ], {
    cwd: options.cwd || projectRoot,
    env: { ...process.env, PGPASSWORD: target.password, PGPASSFILE: '/dev/null', PGCONNECT_TIMEOUT: '5' },
    input: sql,
    encoding: 'utf8',
    timeout: options.timeout || 30_000,
    maxBuffer: 8 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) {
    throw new Error(`psql query failed: ${safeError(result.error?.message || result.stderr || result.stdout || '')}`);
  }
  return String(result.stdout || '').trim();
}

export function psqlJson(target, sql, options = {}) {
  const output = psql(target, sql, options);
  try {
    return JSON.parse(output);
  } catch {
    throw new Error(`fixture query returned invalid JSON: ${safeError(output)}`);
  }
}

/**
 * Exact cleanup for confirmation fixtures.
 * Enforces ownership guard: refuses cleanup if target ownership is unverified.
 */
export function cleanupConfirmationFixtures(target, options = {}) {
  if (options.ownership && (options.ownership.owned !== true
    || options.ownership.localStackOwned !== true
    || options.ownership.runId !== FIXTURE_RUN_ID)) {
    const error = new Error('REFUSE_UNKNOWN_OWNERSHIP_CLEANUP: cannot cleanup database with unverified ownership');
    error.code = 'REFUSE_UNKNOWN_OWNERSHIP_CLEANUP';
    throw error;
  }
  if (!options.ownership && process.env.KURABE_LOCAL_STACK_OWNED !== '1') {
    const error = new Error('REFUSE_UNKNOWN_OWNERSHIP_CLEANUP: cannot cleanup database with unverified ownership (KURABE_LOCAL_STACK_OWNED !== 1)');
    error.code = 'REFUSE_UNKNOWN_OWNERSHIP_CLEANUP';
    throw error;
  }

  const allActorIds = Object.values(FIXTURE_ACTORS).map((a) => sqlLiteral(a.id)).join(', ');
  const allActorCodes = Object.values(FIXTURE_ACTORS).map((a) => sqlLiteral(a.employeeCode)).join(', ');
  const allTeamIds = Object.values(FIXTURE_TEAMS).map((t) => sqlLiteral(t.id)).join(', ');
  const allPeriodIds = Object.values(FIXTURE_PERIODS).map((p) => sqlLiteral(p.id)).join(', ');
  const allEvalIds = [sqlLiteral(FIXTURE_ACTIVE_EVAL_ID), sqlLiteral(FIXTURE_CLOSED_EVAL_ID)].join(', ');

  const cleanupSql = `
    BEGIN;
    DELETE FROM public.sessions WHERE user_id IN (${allActorIds});
    DELETE FROM public.login_attempts WHERE employee_code IN (${allActorCodes});
    DELETE FROM public.evaluation_responses WHERE round_id IN (
      SELECT id FROM public.evaluation_rounds WHERE evaluation_id IN (${allEvalIds})
    );
    DELETE FROM public.evaluation_rounds WHERE evaluation_id IN (${allEvalIds});
    DELETE FROM public.evaluations WHERE id IN (${allEvalIds}) OR period_id IN (${allPeriodIds}) OR employee_id IN (${allActorIds});
    DELETE FROM public.evaluation_periods WHERE id IN (${allPeriodIds});
    UPDATE public.teams SET leader_id = NULL WHERE id IN (${allTeamIds});
    DELETE FROM public.users WHERE id IN (${allActorIds});
    DELETE FROM public.teams WHERE id IN (${allTeamIds});
    COMMIT;
  `;
  psql(target, cleanupSql);

  const checkSql = `
    SELECT json_build_object(
      'sessions', (SELECT count(*) FROM public.sessions WHERE user_id IN (${allActorIds})),
      'login_attempts', (SELECT count(*) FROM public.login_attempts WHERE employee_code IN (${allActorCodes})),
      'evaluation_rounds', (SELECT count(*) FROM public.evaluation_rounds WHERE evaluation_id IN (${allEvalIds})),
      'evaluations', (SELECT count(*) FROM public.evaluations WHERE id IN (${allEvalIds}) OR period_id IN (${allPeriodIds}) OR employee_id IN (${allActorIds})),
      'evaluation_periods', (SELECT count(*) FROM public.evaluation_periods WHERE id IN (${allPeriodIds})),
      'users', (SELECT count(*) FROM public.users WHERE id IN (${allActorIds})),
      'teams', (SELECT count(*) FROM public.teams WHERE id IN (${allTeamIds}))
    )::text;
  `;
  const residue = psqlJson(target, checkSql);
  const total = Number(residue.sessions)
    + Number(residue.login_attempts)
    + Number(residue.evaluation_rounds)
    + Number(residue.evaluations)
    + Number(residue.evaluation_periods)
    + Number(residue.users)
    + Number(residue.teams);

  assert.equal(total, 0, `confirmation fixture cleanup left residue: ${JSON.stringify(residue)}`);
  return { exactResidueZero: true, residue };
}

export function assertFreshConfirmationFixtures(target) {
  const allActorIds = Object.values(FIXTURE_ACTORS).map((a) => sqlLiteral(a.id)).join(', ');
  const allTeamIds = Object.values(FIXTURE_TEAMS).map((t) => sqlLiteral(t.id)).join(', ');
  const allPeriodIds = Object.values(FIXTURE_PERIODS).map((p) => sqlLiteral(p.id)).join(', ');
  const allEvalIds = [sqlLiteral(FIXTURE_ACTIVE_EVAL_ID), sqlLiteral(FIXTURE_CLOSED_EVAL_ID)].join(', ');
  const residue = psqlJson(target, `
    SELECT json_build_object(
      'sessions', (SELECT count(*) FROM public.sessions WHERE user_id IN (${allActorIds})),
      'evaluation_rounds', (SELECT count(*) FROM public.evaluation_rounds WHERE evaluation_id IN (${allEvalIds})),
      'evaluations', (SELECT count(*) FROM public.evaluations WHERE id IN (${allEvalIds}) OR period_id IN (${allPeriodIds}) OR employee_id IN (${allActorIds})),
      'evaluation_periods', (SELECT count(*) FROM public.evaluation_periods WHERE id IN (${allPeriodIds})),
      'users', (SELECT count(*) FROM public.users WHERE id IN (${allActorIds})),
      'teams', (SELECT count(*) FROM public.teams WHERE id IN (${allTeamIds}))
    )::text;
  `);
  const total = Object.values(residue).reduce((sum, value) => sum + Number(value), 0);
  if (total !== 0) {
    const error = new Error(`REFUSE_FIXTURE_ID_COLLISION: target already contains fixture rows ${JSON.stringify(residue)}`);
    error.code = 'REFUSE_FIXTURE_ID_COLLISION';
    throw error;
  }
  return { fresh: true, residue };
}

/**
 * Seeds the six synthetic actors, three teams, two periods, and controls.
 */
export function seedConfirmationFixtures(target) {
  assertFreshConfirmationFixtures(target);

  // 1. Teams (initially without leader_id to satisfy FK)
  const teamSql = `
    INSERT INTO public.teams (id, name, is_active, leader_id)
    VALUES
      (${sqlLiteral(FIXTURE_TEAM_A_ID)}, ${sqlLiteral(FIXTURE_TEAMS.team_a.name)}, true, NULL),
      (${sqlLiteral(FIXTURE_TEAM_B_ID)}, ${sqlLiteral(FIXTURE_TEAMS.team_b.name)}, true, NULL),
      (${sqlLiteral(FIXTURE_TEAM_C_ID)}, ${sqlLiteral(FIXTURE_TEAMS.team_c.name)}, true, NULL);
  `;


  // 2. Users (six synthetic actors)
  const userRows = Object.values(FIXTURE_ACTORS).map((actor) => `
    (${sqlLiteral(actor.id)}, ${sqlLiteral(actor.employeeCode)}, ${sqlLiteral(actor.name)}, ${sqlLiteral(actor.role)}, ${sqlLiteral(actor.teamId)}, '2026-01-01', true, NULL, ${sqlLiteral(actor.gender)})
  `).join(',\n    ');

  const userSql = `
    INSERT INTO public.users (id, employee_code, name, role, team_id, join_date, is_active, password_hash, gender)
    VALUES
    ${userRows};
  `;


  // 3. Update team leader pointers (Appointed Leaders)
  const leaderUpdateSql = `
    UPDATE public.teams SET leader_id = ${sqlLiteral(FIXTURE_LEADER_A_ID)} WHERE id IN (${sqlLiteral(FIXTURE_TEAM_A_ID)}, ${sqlLiteral(FIXTURE_TEAM_B_ID)});
    UPDATE public.teams SET leader_id = ${sqlLiteral(FIXTURE_LEADER_C_ID)} WHERE id = ${sqlLiteral(FIXTURE_TEAM_C_ID)};
  `;


  // 4. Periods (Active period and Closed period)
  const periodSql = `
    INSERT INTO public.evaluation_periods (id, year, name, status, created_by, target_rate, target_grade)
    VALUES
      (${sqlLiteral(FIXTURE_ACTIVE_PERIOD_ID)}, 2099, 'P103 Active Period', 'active', ${sqlLiteral(FIXTURE_MANAGER_ID)}, 75, 'AB'),
      (${sqlLiteral(FIXTURE_CLOSED_PERIOD_ID)}, 2098, 'P103 Closed Period', 'closed', ${sqlLiteral(FIXTURE_MANAGER_ID)}, 75, 'AB');
  `;


  // 5. Active and Closed Controls
  // Active control: Employee B evaluation in active period
  // Closed control: Employee B evaluation in closed period
  const evalSql = `
    INSERT INTO public.evaluations (id, period_id, employee_id, employee_role, team_id, current_round, status)
    VALUES
      (${sqlLiteral(FIXTURE_ACTIVE_EVAL_ID)}, ${sqlLiteral(FIXTURE_ACTIVE_PERIOD_ID)}, ${sqlLiteral(FIXTURE_EMPLOYEE_B_ID)}, 'Employee', ${sqlLiteral(FIXTURE_TEAM_B_ID)}, 1, 'Draft'),
      (${sqlLiteral(FIXTURE_CLOSED_EVAL_ID)}, ${sqlLiteral(FIXTURE_CLOSED_PERIOD_ID)}, ${sqlLiteral(FIXTURE_EMPLOYEE_B_ID)}, 'Employee', ${sqlLiteral(FIXTURE_TEAM_B_ID)}, 3, 'Approved');

    INSERT INTO public.evaluation_rounds (id, evaluation_id, round, evaluator_id, evaluator_role, status)
    VALUES
      (${sqlLiteral(FIXTURE_ACTIVE_ROUND_1_ID)}, ${sqlLiteral(FIXTURE_ACTIVE_EVAL_ID)}, 1, ${sqlLiteral(FIXTURE_SUBLEADER_B_ID)}, 'SubLeader', 'Draft'),
      (${sqlLiteral(FIXTURE_CLOSED_ROUND_1_ID)}, ${sqlLiteral(FIXTURE_CLOSED_EVAL_ID)}, 1, ${sqlLiteral(FIXTURE_SUBLEADER_B_ID)}, 'SubLeader', 'Submitted'),
      (${sqlLiteral(FIXTURE_CLOSED_ROUND_2_ID)}, ${sqlLiteral(FIXTURE_CLOSED_EVAL_ID)}, 2, ${sqlLiteral(FIXTURE_LEADER_A_ID)}, 'Leader', 'Submitted'),
      (${sqlLiteral(FIXTURE_CLOSED_ROUND_3_ID)}, ${sqlLiteral(FIXTURE_CLOSED_EVAL_ID)}, 3, ${sqlLiteral(FIXTURE_MANAGER_ID)}, 'Manager', 'Submitted');
  `;
  psql(target, `BEGIN;\n${teamSql}\n${userSql}\n${leaderUpdateSql}\n${periodSql}\n${evalSql}\nCOMMIT;`);

  const verifySql = `
    SELECT json_build_object(
      'teams', (SELECT count(*) FROM public.teams WHERE id IN (${sqlLiteral(FIXTURE_TEAM_A_ID)}, ${sqlLiteral(FIXTURE_TEAM_B_ID)}, ${sqlLiteral(FIXTURE_TEAM_C_ID)})),
      'users', (SELECT count(*) FROM public.users WHERE id IN (${Object.values(FIXTURE_ACTORS).map((a) => sqlLiteral(a.id)).join(', ')})),
      'periods', (SELECT count(*) FROM public.evaluation_periods WHERE id IN (${sqlLiteral(FIXTURE_ACTIVE_PERIOD_ID)}, ${sqlLiteral(FIXTURE_CLOSED_PERIOD_ID)})),
      'evaluations', (SELECT count(*) FROM public.evaluations WHERE id IN (${sqlLiteral(FIXTURE_ACTIVE_EVAL_ID)}, ${sqlLiteral(FIXTURE_CLOSED_EVAL_ID)})),
      'rounds', (SELECT count(*) FROM public.evaluation_rounds WHERE id IN (${sqlLiteral(FIXTURE_ACTIVE_ROUND_1_ID)}, ${sqlLiteral(FIXTURE_CLOSED_ROUND_1_ID)}, ${sqlLiteral(FIXTURE_CLOSED_ROUND_2_ID)}, ${sqlLiteral(FIXTURE_CLOSED_ROUND_3_ID)}))
    )::text;
  `;
  const counts = psqlJson(target, verifySql);
  assert.equal(counts.teams, 3, 'teams row count mismatch');
  assert.equal(counts.users, 6, 'users row count mismatch (expected 6 actors)');
  assert.equal(counts.periods, 2, 'periods row count mismatch (active + closed)');
  assert.equal(counts.evaluations, 2, 'evaluations count mismatch');
  assert.equal(counts.rounds, 4, 'evaluation rounds count mismatch');

  return {
    seededAt: new Date().toISOString(),
    actors: FIXTURE_ACTORS,
    teams: FIXTURE_TEAMS,
    periods: FIXTURE_PERIODS,
    evaluations: {
      activeId: FIXTURE_ACTIVE_EVAL_ID,
      closedId: FIXTURE_CLOSED_EVAL_ID,
    },
    counts,
  };
}

/**
 * Creates an authentic opaque session in DB for the specified actor alias.
 */
export function createActorSession(target, actorAlias) {
  const actor = FIXTURE_ACTORS[actorAlias];
  if (!actor) {
    throw new Error(`unknown actor alias: ${actorAlias}`);
  }
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  // Check if credential_revision exists on sessions table
  const hasCredRev = psql(target, `
    SELECT count(*)::int FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sessions' AND column_name = 'credential_revision';
  `) === '1';

  if (hasCredRev) {
    psql(target, `
      INSERT INTO public.sessions (token_hash, user_id, expires_at, credential_revision)
      VALUES (${sqlLiteral(tokenHash)}, ${sqlLiteral(actor.id)}, ${sqlLiteral(expiresAt)}, 1);
    `);
  } else {
    psql(target, `
      INSERT INTO public.sessions (token_hash, user_id, expires_at)
      VALUES (${sqlLiteral(tokenHash)}, ${sqlLiteral(actor.id)}, ${sqlLiteral(expiresAt)});
    `);
  }

  return {
    alias: actorAlias,
    userId: actor.id,
    employeeCode: actor.employeeCode,
    role: actor.role,
    token,
    tokenHash,
    expiresAt,
  };
}

/**
 * Verifies all six sessions by actor ID readback from the database and REST if available.
 */
export async function verifyActorSessions(target, sessions, options = {}) {
  const verifiedList = [];
  for (const session of Object.values(sessions)) {
    const sessionRow = psqlJson(target, `
      SELECT row_to_json(s)::text FROM (
        SELECT user_id, expires_at FROM public.sessions WHERE token_hash = ${sqlLiteral(session.tokenHash)}
      ) s;
    `);
    assert.ok(sessionRow, `session not found in DB for actor ${session.alias}`);
    assert.equal(sessionRow.user_id, session.userId, `session user_id mismatch for actor ${session.alias}`);

    const userRow = psqlJson(target, `
      SELECT row_to_json(u)::text FROM (
        SELECT id, employee_code, name, role, is_active FROM public.users WHERE id = ${sqlLiteral(session.userId)}
      ) u;
    `);
    assert.ok(userRow, `user not found in DB for actor ${session.alias}`);
    assert.equal(userRow.id, session.userId);
    assert.equal(userRow.employee_code, session.employeeCode);
    assert.equal(userRow.role, session.role);
    assert.equal(userRow.is_active, true);

    if (options.restUrl && options.serviceRoleKey) {
      const resp = await fetch(`${options.restUrl}/rest/v1/sessions?token_hash=eq.${session.tokenHash}&select=user_id`, {
        headers: {
          apikey: options.serviceRoleKey,
          authorization: `Bearer ${options.serviceRoleKey}`,
        },
      });
      if (resp.status === 200) {
        const body = await resp.json();
        assert.ok(Array.isArray(body) && body.length === 1 && body[0].user_id === session.userId,
          `PostgREST readback failed for actor ${session.alias}`);
      }
    }

    verifiedList.push({
      alias: session.alias,
      userId: session.userId,
      employeeCode: session.employeeCode,
      role: session.role,
      verified: true,
    });
  }
  return verifiedList;
}

const H2_WORKAROUND_TOKEN = Symbol('P103M1T01-H2-workaround');

/**
 * Creates the one-shot H2 prerequisite workaround for the pre-measurement
 * fixture setup only. The expected primary team is checked and restoration is
 * unconditional; callers cannot invoke the low-level mutation without the
 * private token held by this factory.
 */
export function createH2PrerequisiteWorkaround(target) {
  let used = false;
  return async function runH2PrerequisiteWorkaround(operation) {
    if (used) throw new Error('REFUSE_H2_WORKAROUND_REUSE: workaround is one-shot');
    used = true;
    return withH2PrerequisiteWorkaround(target, operation, H2_WORKAROUND_TOKEN);
  };
}

async function withH2PrerequisiteWorkaround(target, operation, token) {
  if (token !== H2_WORKAROUND_TOKEN) throw new Error('REFUSE_H2_WORKAROUND_DIRECT_CALL');
  const before = psql(target, `SELECT team_id FROM public.users WHERE id = ${sqlLiteral(FIXTURE_LEADER_A_ID)};`);
  assert.equal(before, FIXTURE_TEAM_A_ID, 'H2 workaround requires the baseline primary Team A');
  try {
    psql(target, `UPDATE public.users SET team_id = ${sqlLiteral(FIXTURE_TEAM_B_ID)} WHERE id = ${sqlLiteral(FIXTURE_LEADER_A_ID)};`);
    return await operation();
  } finally {
    psql(target, `UPDATE public.users SET team_id = ${sqlLiteral(FIXTURE_TEAM_A_ID)} WHERE id = ${sqlLiteral(FIXTURE_LEADER_A_ID)};`);
    const after = psql(target, `SELECT team_id FROM public.users WHERE id = ${sqlLiteral(FIXTURE_LEADER_A_ID)};`);
    assert.equal(after, FIXTURE_TEAM_A_ID, 'H2 workaround failed to restore Leader A primary team to Team A');
  }
}
