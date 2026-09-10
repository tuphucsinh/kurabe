#!/usr/bin/env node
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
export const projectRoot = path.resolve(moduleDir, '../..');
const FORWARD_PATH = path.join(projectRoot, 'supabase/migrations/20260907000300_personnel_history_guard.sql');
const ROLLBACK_PATH = path.join(projectRoot, 'db/rollback-personnel-history-guard.sql');
const USERS_PATH = path.join(projectRoot, 'src/actions/users.ts');
const HISTORY_PATH = path.join(projectRoot, 'src/lib/db/evaluation-history-admin.ts');

const IDS = Object.freeze({
  activePeriod: '00000000-0000-0000-0000-000000000001',
  closedPeriod: '00000000-0000-0000-0000-000000000002',
  employee: '00000000-0000-0000-0000-000000000010',
  evaluatorA: '00000000-0000-0000-0000-000000000011',
  evaluatorB: '00000000-0000-0000-0000-000000000012',
  teamA: '00000000-0000-0000-0000-000000000021',
  teamB: '00000000-0000-0000-0000-000000000022',
  activeDraft: '00000000-0000-0000-0000-000000000031',
  activeSubmitted: '00000000-0000-0000-0000-000000000032',
  closedDraft: '00000000-0000-0000-0000-000000000033',
  activeDraftRound: '00000000-0000-0000-0000-000000000041',
  activeSubmittedRound: '00000000-0000-0000-0000-000000000042',
  closedDraftRound: '00000000-0000-0000-0000-000000000043',
  futureRound: '00000000-0000-0000-0000-000000000044',
});

const BASE_SCHEMA = `
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
END $$;
CREATE TABLE public.evaluation_periods (
  id uuid PRIMARY KEY,
  status text NOT NULL,
  closed_at timestamptz
);
CREATE TABLE public.users (
  id uuid PRIMARY KEY,
  role text NOT NULL,
  team_id uuid,
  subleader_id uuid,
  name text NOT NULL
);
CREATE TABLE public.evaluations (
  id uuid PRIMARY KEY,
  period_id uuid NOT NULL REFERENCES public.evaluation_periods(id),
  employee_id uuid NOT NULL REFERENCES public.users(id),
  employee_role text NOT NULL,
  team_id uuid,
  status text NOT NULL
);
CREATE TABLE public.evaluation_rounds (
  id uuid PRIMARY KEY,
  evaluation_id uuid NOT NULL REFERENCES public.evaluations(id),
  round integer NOT NULL,
  evaluator_id uuid REFERENCES public.users(id),
  evaluator_role text NOT NULL,
  status text NOT NULL,
  submitted_at timestamptz
);
`;

const SAFE_ENV = {
  PATH: '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
  HOME: '/tmp',
  LANG: 'C',
  LC_ALL: 'C',
  PGPASSFILE: '/dev/null',
  PGSERVICEFILE: '/dev/null',
  PGCONNECT_TIMEOUT: '5',
};

function redact(value) {
  return String(value ?? '')
    .replace(/(?:postgres(?:ql)?:\/\/)[^\s)]+/gi, '[redacted-db-target]')
    .replace(/(?:password|secret|token|key)\s*[=:]\s*[^\s,;]+/gi, '$1=[redacted]');
}

function docker(args) {
  const result = spawnSync('docker', args, { encoding: 'utf8', timeout: 30_000 });
  if (result.error || result.status !== 0) {
    throw new Error(`docker failed: ${redact(result.stderr || result.error?.message || result.status)}`);
  }
  return String(result.stdout || '').trim();
}

function targetArgs(target) {
  return [
    '--no-password',
    '--set=ON_ERROR_STOP=1',
    '--host', target.host,
    '--port', String(target.port),
    '--username', target.user,
    '--dbname', target.database,
  ];
}

function psqlResult(target, sql, { timeout = 30_000 } = {}) {
  const result = spawnSync('psql', [...targetArgs(target), '--tuples-only', '--no-align'], {
    env: { ...SAFE_ENV, PGPASSWORD: target.password },
    input: sql,
    encoding: 'utf8',
    timeout,
    maxBuffer: 512 * 1024,
  });
  return {
    status: result.status,
    stdout: String(result.stdout || ''),
    stderr: String(result.stderr || ''),
    error: result.error,
  };
}

function runPsql(target, sql, options = {}) {
  const result = psqlResult(target, sql, options);
  if (result.error || result.status !== 0) {
    throw new Error(`psql failed: ${redact(result.stderr || result.error?.message || result.status)}`);
  }
  return result.stdout.trim();
}

function runPsqlFile(target, file) {
  const result = spawnSync('psql', [...targetArgs(target), '--file', file], {
    env: { ...SAFE_ENV, PGPASSWORD: target.password },
    encoding: 'utf8',
    timeout: 60_000,
  });
  if (result.error || result.status !== 0) {
    throw new Error(`psql file failed: ${redact(result.stderr || result.error?.message || result.status)}`);
  }
  return String(result.stdout || '').trim();
}

function psqlAsync(target, sql) {
  const child = spawn('psql', [...targetArgs(target), '--tuples-only', '--no-align'], {
    env: { ...SAFE_ENV, PGPASSWORD: target.password },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => { stdout += String(chunk); });
  child.stderr.on('data', (chunk) => { stderr += String(chunk); });
  child.stdin.end(sql);
  return new Promise((resolve) => {
    child.once('close', (status) => resolve({ status, stdout, stderr, error: null }));
    child.once('error', (error) => resolve({ status: null, stdout, stderr, error }));
  });
}

function expectPsqlFailure(target, sql, marker) {
  const result = psqlResult(target, sql);
  assert.notEqual(result.status, 0, `expected psql failure containing ${marker}`);
  const output = redact(`${result.stdout}\n${result.stderr}`);
  assert.match(output, new RegExp(marker), `failure must expose ${marker}`);
  return output;
}

function queryValue(target, sql) {
  return runPsql(target, sql).split(/\r?\n/).map((line) => line.trim()).filter(Boolean)[0] || '';
}

function startContainer() {
  const name = `kurabe-p99m2t01-${process.pid}-${crypto.randomBytes(4).toString('hex')}`;
  const password = crypto.randomBytes(24).toString('hex');
  docker([
    'run', '--detach', '--name', name,
    '--env', `POSTGRES_PASSWORD=${password}`,
    '--env', 'POSTGRES_DB=postgres',
    '--publish', '127.0.0.1::5432',
    'postgres:17-alpine',
  ]);
  let port;
  try {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const mapped = docker(['port', name, '5432/tcp']);
      const match = mapped.match(/127\.0\.0\.1:(\d+)/);
      if (match) {
        port = Number(match[1]);
        const ready = spawnSync('pg_isready', ['--host', '127.0.0.1', '--port', String(port), '--username', 'postgres'], {
          env: { ...SAFE_ENV, PGPASSWORD: password },
          encoding: 'utf8',
          timeout: 2_000,
        });
        if (ready.status === 0) break;
      }
      if (attempt === 39) throw new Error('postgres did not become ready');
      spawnSync('sleep', ['0.25']);
    }
    assert.ok(port, 'disposable PostgreSQL must publish a loopback port');
    return { name, target: { host: '127.0.0.1', port, user: 'postgres', database: 'postgres', password } };
  } catch (error) {
    docker(['rm', '--force', name]);
    throw error;
  }
}

function stopContainer(container) {
  docker(['rm', '--force', container.name]);
}

function seed(target) {
  const id = IDS;
  runPsql(target, `
DELETE FROM public.evaluation_rounds;
DELETE FROM public.evaluations;
DELETE FROM public.users;
DELETE FROM public.evaluation_periods;
INSERT INTO public.evaluation_periods (id, status) VALUES
  ('${id.activePeriod}', 'active'),
  ('${id.closedPeriod}', 'closed');
INSERT INTO public.users (id, role, team_id, name) VALUES
  ('${id.employee}', 'Employee', '${id.teamA}', 'employee'),
  ('${id.evaluatorA}', 'SubLeader', '${id.teamA}', 'evaluator-a'),
  ('${id.evaluatorB}', 'SubLeader', '${id.teamB}', 'evaluator-b');
INSERT INTO public.evaluations (id, period_id, employee_id, employee_role, team_id, status) VALUES
  ('${id.activeDraft}', '${id.activePeriod}', '${id.employee}', 'Employee', '${id.teamA}', 'Draft'),
  ('${id.activeSubmitted}', '${id.activePeriod}', '${id.employee}', 'Employee', '${id.teamA}', 'Submitted'),
  ('${id.closedDraft}', '${id.closedPeriod}', '${id.employee}', 'Employee', '${id.teamA}', 'Draft');
INSERT INTO public.evaluation_rounds (id, evaluation_id, round, evaluator_id, evaluator_role, status, submitted_at) VALUES
  ('${id.activeDraftRound}', '${id.activeDraft}', 1, '${id.evaluatorA}', 'SubLeader', 'Draft', NULL),
  ('${id.activeSubmittedRound}', '${id.activeSubmitted}', 1, '${id.evaluatorA}', 'SubLeader', 'Submitted', now()),
  ('${id.closedDraftRound}', '${id.closedDraft}', 1, '${id.evaluatorA}', 'SubLeader', 'Draft', NULL),
  ('${id.futureRound}', '${id.activeSubmitted}', 2, '${id.evaluatorA}', 'SubLeader', 'NotStarted', NULL);
`);
}

async function runConcurrentPeriodClose(target) {
  seed(target);
  const holder = psqlAsync(target, `BEGIN; UPDATE public.evaluation_periods SET status = 'closed' WHERE id = '${IDS.activePeriod}'; SELECT pg_sleep(2); COMMIT;`);
  await new Promise((resolve) => setTimeout(resolve, 300));
  const contender = psqlAsync(target, `UPDATE public.evaluations SET employee_role = 'Worker' WHERE id = '${IDS.activeDraft}';`);
  const [holderResult, result] = await Promise.all([holder, contender]);
  assert.equal(holderResult.status, 0, `close holder failed: ${redact(holderResult.stderr || holderResult.error?.message || holderResult.status)}`);
  assert.notEqual(result.status, 0, 'personnel update must lose the close race and fail closed');
  assert.match(redact(`${result.stdout}\n${result.stderr}\n${result.error?.message || ''}`), /P99M2T01_HISTORICAL_SNAPSHOT_LOCK/);
}

async function runConcurrentSubmit(target) {
  seed(target);
  const holder = psqlAsync(target, `BEGIN; UPDATE public.evaluation_rounds SET status = 'Submitted', submitted_at = now() WHERE id = '${IDS.activeDraftRound}'; SELECT pg_sleep(2); COMMIT;`);
  await new Promise((resolve) => setTimeout(resolve, 300));
  const contender = psqlAsync(target, `UPDATE public.evaluation_rounds SET evaluator_id = '${IDS.evaluatorB}', evaluator_role = 'SubLeader' WHERE id = '${IDS.activeDraftRound}';`);
  const [holderResult, result] = await Promise.all([holder, contender]);
  assert.equal(holderResult.status, 0, `submit holder failed: ${redact(holderResult.stderr || holderResult.error?.message || holderResult.status)}`);
  assert.notEqual(result.status, 0, 'evaluator snapshot update must lose the submit race and fail closed');
  assert.match(redact(`${result.stdout}\n${result.stderr}\n${result.error?.message || ''}`), /P99M2T01_HISTORICAL_SNAPSHOT_LOCK/);
}

export async function run() {
  const cases = [];
  assert.ok(fs.existsSync(FORWARD_PATH), 'forward migration must exist');
  assert.ok(fs.existsSync(ROLLBACK_PATH), 'rollback must exist');
  assert.ok(fs.existsSync(USERS_PATH), 'users action must exist');
  assert.ok(fs.existsSync(HISTORY_PATH), 'history reader must exist');
  const forward = fs.readFileSync(FORWARD_PATH, 'utf8');
  const rollback = fs.readFileSync(ROLLBACK_PATH, 'utf8');
  const usersSource = fs.readFileSync(USERS_PATH, 'utf8');
  const historySource = fs.readFileSync(HISTORY_PATH, 'utf8');

  assert.match(forward, /CANDIDATE ONLY/);
  assert.match(forward, /BEGIN;[\s\S]*COMMIT;/);
  assert.match(forward, /guard_evaluation_personnel_snapshot/);
  assert.match(forward, /guard_evaluation_round_personnel_snapshot/);
  assert.match(forward, /FOR SHARE/);
  assert.match(forward, /P99M2T01_HISTORICAL_SNAPSHOT_LOCK/);
  assert.doesNotMatch(forward.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--.*$/gm, ''), /\b(?:DROP|TRUNCATE)\s+(?:TABLE|SCHEMA)\b/i);
  assert.match(rollback, /ROLLBACK_UNAPPROVED/);
  assert.match(rollback, /kurabe\.p99m2t01_rollback_approved/);
  assert.match(usersSource, /evaluation_periods/);
  assert.match(usersSource, /status.*active|active.*status/);
  assert.match(usersSource, /active period cardinality invalid/);
  assert.match(usersSource, /\.in\('status', \['NotStarted', 'Draft'\]\)/);
  assert.doesNotMatch(usersSource, /catch \(err\) \{\s*\/\/ Sync là best-effort/);
  assert.match(historySource, /historical/i);
  cases.push('source-contract');

  const container = startContainer();
  try {
    const { target } = container;
    runPsql(target, BASE_SCHEMA);
    runPsql(target, forward);
    seed(target);
    cases.push('migration-applied');

    runPsql(target, `UPDATE public.evaluations SET employee_role = 'Worker', team_id = '${IDS.teamB}' WHERE id = '${IDS.activeDraft}';`);
    runPsql(target, `UPDATE public.evaluation_rounds SET evaluator_id = '${IDS.evaluatorB}', evaluator_role = 'SubLeader' WHERE id = '${IDS.activeDraftRound}';`);
    assert.equal(queryValue(target, `SELECT employee_role || '|' || team_id FROM public.evaluations WHERE id = '${IDS.activeDraft}';`), `Worker|${IDS.teamB}`);
    assert.equal(queryValue(target, `SELECT evaluator_id || '|' || evaluator_role FROM public.evaluation_rounds WHERE id = '${IDS.activeDraftRound}';`), `${IDS.evaluatorB}|SubLeader`);
    cases.push('active-draft-update-allowed');

    seed(target);
    expectPsqlFailure(target, `UPDATE public.evaluations SET employee_role = 'Worker' WHERE id = '${IDS.closedDraft}';`, 'P99M2T01_HISTORICAL_SNAPSHOT_LOCK');
    expectPsqlFailure(target, `UPDATE public.evaluation_rounds SET evaluator_id = '${IDS.evaluatorB}' WHERE id = '${IDS.closedDraftRound}';`, 'P99M2T01_HISTORICAL_SNAPSHOT_LOCK');
    assert.equal(queryValue(target, `SELECT employee_role FROM public.evaluations WHERE id = '${IDS.closedDraft}';`), 'Employee');
    cases.push('closed-snapshot-protected');

    expectPsqlFailure(target, `UPDATE public.evaluations SET team_id = '${IDS.teamB}' WHERE id = '${IDS.activeSubmitted}';`, 'P99M2T01_HISTORICAL_SNAPSHOT_LOCK');
    expectPsqlFailure(target, `UPDATE public.evaluation_rounds SET evaluator_id = '${IDS.evaluatorB}' WHERE id = '${IDS.activeSubmittedRound}';`, 'P99M2T01_HISTORICAL_SNAPSHOT_LOCK');
    expectPsqlFailure(target, `UPDATE public.evaluation_rounds SET evaluator_id = '${IDS.evaluatorB}' WHERE id = '${IDS.futureRound}';`, 'P99M2T01_HISTORICAL_SNAPSHOT_LOCK');
    cases.push('submitted-snapshot-protected');

    expectPsqlFailure(target, `UPDATE public.evaluations SET employee_id = '${IDS.evaluatorB}' WHERE id = '${IDS.activeDraft}';`, 'P99M2T01_IMMUTABLE_EVALUATION_IDENTITY');
    expectPsqlFailure(target, `UPDATE public.evaluations SET period_id = '${IDS.closedPeriod}' WHERE id = '${IDS.activeDraft}';`, 'P99M2T01_IMMUTABLE_EVALUATION_IDENTITY');
    cases.push('identity-protected');

    seed(target);
    expectPsqlFailure(target, `BEGIN; UPDATE public.evaluations SET employee_role = 'Worker' WHERE id = '${IDS.activeDraft}'; SELECT 1 / 0; COMMIT;`, 'division by zero');
    assert.equal(queryValue(target, `SELECT employee_role FROM public.evaluations WHERE id = '${IDS.activeDraft}';`), 'Employee');
    cases.push('failure-injection-atomic');

    seed(target);
    await runConcurrentPeriodClose(target);
    assert.equal(queryValue(target, `SELECT employee_role FROM public.evaluations WHERE id = '${IDS.activeDraft}';`), 'Employee');
    cases.push('concurrent-close-fail-closed');

    await runConcurrentSubmit(target);
    assert.equal(queryValue(target, `SELECT evaluator_id FROM public.evaluation_rounds WHERE id = '${IDS.activeDraftRound}';`), IDS.evaluatorA);
    cases.push('concurrent-submit-fail-closed');

    seed(target);
    const beforeRollback = queryValue(target, 'SELECT count(*) FROM public.evaluations;');
    runPsql(target, `SET kurabe.p99m2t01_rollback_approved = 'true';\n${rollback}`);
    assert.equal(queryValue(target, "SELECT count(*) FROM pg_trigger WHERE tgname IN ('trg_guard_evaluation_personnel_snapshot', 'trg_guard_evaluation_round_personnel_snapshot');"), '0');
    assert.equal(queryValue(target, 'SELECT count(*) FROM public.evaluations;'), beforeRollback);
    cases.push('rollback-preserves-data');
  } finally {
    stopContainer(container);
  }

  const completeContainer = startContainer();
  try {
    runPsql(completeContainer.target, `
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
END $$;`);
    runPsqlFile(completeContainer.target, path.join(projectRoot, 'db/bootstrap/baseline.sql'));
    runPsqlFile(completeContainer.target, FORWARD_PATH);
    assert.equal(queryValue(completeContainer.target, "SELECT count(*) FROM pg_tables WHERE schemaname = 'public';"), '18');
    assert.equal(queryValue(completeContainer.target, "SELECT count(*) FROM pg_trigger WHERE tgname IN ('trg_guard_evaluation_personnel_snapshot', 'trg_guard_evaluation_round_personnel_snapshot');"), '2');
    runPsql(completeContainer.target, `SET kurabe.p99m2t01_rollback_approved = 'true';\n${rollback}`);
    assert.equal(queryValue(completeContainer.target, "SELECT count(*) FROM pg_trigger WHERE tgname IN ('trg_guard_evaluation_personnel_snapshot', 'trg_guard_evaluation_round_personnel_snapshot');"), '0');
    cases.push('complete-baseline-replay');
  } finally {
    stopContainer(completeContainer);
  }

  return { real: true, passed: true, cases, target: 'disposable-postgresql-17-loopback' };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await run();
    console.log(`PERSONNEL_HISTORY PASS cases=${result.cases.length}`);
  } catch (error) {
    console.error(`PERSONNEL_HISTORY FAIL ${redact(error?.stack || error)}`);
    process.exitCode = 1;
  }
}
